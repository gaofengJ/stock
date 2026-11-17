import datetime as dt
import json
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
from check_remote_health import assess
from health_receiver import read
NOW=dt.datetime(2026,10,14,12,tzinfo=dt.timezone.utc)

class HealthTest(unittest.TestCase):
    def report(self):
        return dict(checkedAt=NOW.isoformat(),production=False,maintenance=True,backendHealthy=True,
                    databaseHealthy=True,backupHealthy=False,backupIssues=['backup_timer_disabled_or_unknown'],recurringOffhostVerified=False)
    def test_rehearsal_transport_is_not_a_production_pass(self):
        value=self.report()
        self.assertEqual(assess(value,NOW,False),[])
        self.assertEqual(set(assess(value,NOW,True)),{'production_not_open','local_backup_unhealthy','recurring_offhost_unverified'})
    def test_stale_or_broken_host_is_reported(self):
        value=self.report();value.update(checkedAt=(NOW-dt.timedelta(minutes=21)).isoformat(),databaseHealthy=False)
        self.assertEqual(set(assess(value,NOW,False)),{'health_snapshot_stale_or_invalid','databaseHealthy'})
    def test_production_requires_both_backup_protections(self):
        value=self.report();value.update(production=True,maintenance=False,backupHealthy=True,recurringOffhostVerified=True)
        self.assertEqual(assess(value,NOW,True),[])
        value['recurringOffhostVerified']=False
        self.assertEqual(assess(value,NOW,True),['recurring_offhost_unverified'])
    def test_no_arbitrary_file_or_command(self):
        for command in ['id','health status /etc/stock/runtime.env','health /etc/passwd']:
            with self.assertRaises(ValueError):read(command)
    def read_report(self, value):
        report=Mock()
        report.is_symlink.return_value=False
        report.stat.return_value=SimpleNamespace(st_uid=0,st_mode=0o100644,st_size=1024)
        report.read_text.return_value=json.dumps(value)
        return read('health status',report)
    def test_current_snapshot_round_trip_through_restricted_reader(self):
        import health_snapshot
        with patch.object(health_snapshot,'Path') as path, \
             patch.object(health_snapshot,'assess',return_value={'healthy':True,'issues':[]}), \
             patch.object(health_snapshot.shutil,'disk_usage',return_value=SimpleNamespace(free=12*1024**3)), \
             patch.object(health_snapshot,'systemctl',return_value='enabled'), \
             patch.object(health_snapshot,'data_freshness',return_value={'latestTradeDate':'2026-10-23','expectedTradeDate':'2026-10-23','staleNewsSources':None}), \
             patch.object(health_snapshot.subprocess,'check_output',return_value=b'{"Status":"running","Health":{"Status":"healthy"}}'):
            path.return_value.is_file.return_value=True
            path.return_value.exists.return_value=False
            path.return_value.read_text.return_value=json.dumps({'successfulCheckAt':dt.datetime.now(dt.timezone.utc).timestamp()})
            value=health_snapshot.snapshot()
        self.assertEqual(self.read_report(value),value)
        self.assertEqual(assess(self.read_report(value),dt.datetime.now(dt.timezone.utc),True,'deferred'),[])
        value['operationalIssues']=['news_sources_stale']
        self.assertEqual(assess(self.read_report(value),dt.datetime.now(dt.timezone.utc),True,'deferred'),['news_sources_stale'])
    def test_legacy_report_remains_readable_during_upgrade(self):
        self.assertEqual(self.read_report(self.report()),self.report())
    def test_unexpected_fields_are_never_exposed(self):
        for extra in [dict(secret='private'),dict(dataFreshness={}),
                      dict(dataFreshness={'secret':'private'},operationalIssues=[]),
                      dict(dataFreshness=[],operationalIssues=[]),
                      dict(dataFreshness={},operationalIssues=['private']),
                      dict(dataFreshness={},operationalIssues='healthy')]:
            with self.subTest(extra=extra),self.assertRaises(ValueError):
                self.read_report(dict(self.report(),**extra))
    def test_owner_deferral_preserves_local_backup_and_runtime_checks(self):
        value=self.report();value.update(production=True,maintenance=False,backupHealthy=True)
        self.assertEqual(assess(value,NOW,True,'deferred'),[])
        self.assertFalse(value['recurringOffhostVerified'])
        value.update(backupHealthy=False,databaseHealthy=False)
        self.assertEqual(set(assess(value,NOW,True,'deferred')),{'local_backup_unhealthy','databaseHealthy'})
        with self.assertRaises(ValueError):assess(value,NOW,True,'ignore-everything')

if __name__=='__main__':unittest.main()

class AlertRecoveryTest(unittest.TestCase):
    def snapshot(self, **patches):
        return dict(checkedAt=dt.datetime.now(dt.timezone.utc).isoformat(),
                    production=True, maintenance=False, backendHealthy=True,
                    databaseHealthy=True, backupHealthy=True, recurringOffhostVerified=False,
                    operationalIssues=['health_workflow_stalled'], **patches)

    def test_previous_queue_delay_does_not_fail_current_successful_probe(self):
        import check_remote_health as h
        codes = [200, 401, 403, 200, 200, 200, 200, 401, 403]
        with patch.object(h, 'read_snapshot', return_value=self.snapshot()), \
             patch.object(h, 'http_code', side_effect=codes):
            result = h.check(['fixture'], True, 'deferred')
        self.assertTrue(result['checksPassed'])
        self.assertIn('health_workflow_stalled', result['warnings'])
        self.assertFalse(any(result['categories'].values()))

    def test_real_failures_remain_fatal_even_with_old_queue_warning(self):
        import check_remote_health as h
        report = self.snapshot()
        report.update(backupHealthy=False, databaseHealthy=False,
                      operationalIssues=['health_workflow_stalled', 'news_sources_stale', 'health_dispatch_stale'])
        with patch.object(h, 'read_snapshot', return_value=report), patch.object(h, 'http_code', return_value=503):
            result = h.check(['fixture'], True, 'deferred')
        self.assertFalse(result['checksPassed'])
        self.assertIn('local_backup_unhealthy', result['categories']['availability'])
        self.assertIn('databaseHealthy', result['categories']['availability'])
        self.assertIn('news_sources_stale', result['categories']['data'])
        self.assertIn('health_dispatch_stale', result['categories']['monitoring'])
        self.assertIn('domain_https_status:/', result['issues'])

    def test_dns_and_http_transients_retry_but_auth_and_certificate_errors_do_not(self):
        import check_remote_health as h
        import urllib.error
        import ssl
        with patch.object(h.time, 'sleep'):
            retries = []
            success = Mock(status=200)
            success.__enter__ = Mock(return_value=success)
            success.__exit__ = Mock(return_value=False)
            with patch.object(h.urllib.request, 'urlopen', side_effect=[urllib.error.URLError('dns'), success]) as call:
                self.assertEqual(h.http_code('/', retries=retries), 200)
                self.assertEqual(call.call_count, 2)
                self.assertEqual(len(retries), 1)
            for code in (401, 403):
                with patch.object(h.urllib.request, 'urlopen', side_effect=urllib.error.HTTPError('fixture', code, '', {}, None)) as call:
                    self.assertEqual(h.http_code('/api/auth/me'), code)
                    self.assertEqual(call.call_count, 1)
            with patch.object(h.urllib.request, 'urlopen', side_effect=urllib.error.HTTPError('fixture', 503, '', {}, None)) as call:
                self.assertEqual(h.http_code('/'), 503)
                self.assertEqual(call.call_count, 3)
            with patch.object(h.urllib.request, 'urlopen', side_effect=urllib.error.URLError(ssl.SSLCertVerificationError('certificate'))) as call:
                self.assertEqual(h.http_code('/'), 0)
                self.assertEqual(call.call_count, 1)

    def test_ssh_retries_are_bounded_and_return_current_snapshot(self):
        import check_remote_health as h
        import subprocess
        raw = json.dumps(self.snapshot()).encode()
        with patch.object(h.time, 'sleep'), patch.object(h.subprocess, 'check_output', side_effect=[subprocess.TimeoutExpired('ssh', 30), raw]) as call:
            self.assertEqual(h.read_snapshot(['fixture']), json.loads(raw))
            self.assertEqual(call.call_count, 2)
        with patch.object(h.time, 'sleep'), patch.object(h.subprocess, 'check_output', side_effect=subprocess.TimeoutExpired('ssh', 30)) as call:
            with self.assertRaisesRegex(RuntimeError, 'health_snapshot_unreachable'):
                h.read_snapshot(['fixture'])
            self.assertEqual(call.call_count, 3)
