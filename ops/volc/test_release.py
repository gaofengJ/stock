import copy
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import release_contract as contract
import release_receiver as receiver
import release_worker as worker


def request():
    return dict(commit='a' * 40, runId=123,
                backDigest=worker.REGISTRY + '/mufengtongxue/stock-back@sha256:' + 'b' * 64,
                frontDigest=worker.REGISTRY + '/mufengtongxue/stock-front@sha256:' + 'c' * 64,
                backImageId='sha256:' + 'd' * 64, frontImageId='sha256:' + 'e' * 64,
                registryUsername='private-user', registryPassword='private-password')


class ReleaseTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def send(self, mode, value=None):
        raw = json.dumps(request() if value is None else value).encode()
        return receiver.receive('release ' + mode + ' ' + hashlib.sha256(raw).hexdigest(), io.BytesIO(raw),
                                self.root, self.root, self.root / 'enabled', self.root / 'production')

    def test_remote_validation_cannot_queue_or_expose_auth(self):
        result = self.send('validate')
        self.assertEqual(result['state'], 'validated-not-queued')
        self.assertNotIn('private-', json.dumps(result))
        self.assertEqual(list(self.root.iterdir()), [])
        with self.assertRaises(ValueError):
            self.send('queue')

    def test_tampering_and_shell_commands_rejected(self):
        for command in ['id', 'release status ../../secret', 'release queue ' + 'a' * 64]:
            with self.assertRaises(ValueError):
                receiver.receive(command, io.BytesIO(b'{}'))
        for field, invalid in [('commit', 'master; id'), ('runId', True),
                               ('backDigest', 'attacker.invalid/app@sha256:' + 'a' * 64)]:
            data = request(); data[field] = invalid
            with self.assertRaises(ValueError):
                self.send('validate', data)
        with self.assertRaises(ValueError):
            receiver.receive('release validate ' + 'a' * 64, io.BytesIO(b'a' * (contract.MAX_BYTES + 1)))

    def test_queue_is_private_bounded_and_receipts_hide_auth(self):
        (self.root / 'enabled').touch(); (self.root / 'production').touch()
        receipt = self.send('queue')
        self.assertEqual((self.root / (receipt['id'] + '.json')).stat().st_mode & 0o777, 0o600)
        self.assertNotIn('private-', json.dumps(receipt))
        self.send('queue')
        with self.assertRaises(ValueError):
            self.send('queue')

    def test_ci_must_match_commit_branch_and_full_workflow(self):
        run = dict(head_sha='a' * 40, status='completed', conclusion='success',
                   path='.github/workflows/volc-rehearsal.yml', head_branch='master',
                   head_repository={'full_name': 'gaofengJ/stock'})
        contract.validate_run(run, request())
        for key, value in [('head_sha', 'b' * 40), ('conclusion', 'failure'),
                           ('head_branch', 'unreviewed'), ('path', '.github/workflows/volc-ops.yml')]:
            changed = copy.deepcopy(run); changed[key] = value
            with self.assertRaises(ValueError):
                contract.validate_run(changed, request())

    def prepare_worker(self):
        (self.root / 'releases').mkdir()
        (self.root / 'release.env').write_text('BACK_IMAGE=previous-back\nFRONT_IMAGE=previous-front\nRELEASE_SHA=old\n')
        (self.root / 'production').touch(); (self.root / 'enabled').touch()
        for key, value in [('DEPLOY', self.root), ('ENV', self.root / 'release.env'),
                           ('MAINTENANCE', self.root / 'maintenance'), ('PRODUCTION', self.root / 'production'),
                           ('ENABLED', self.root / 'enabled')]:
            patcher = patch.object(worker, key, value); patcher.start(); self.addCleanup(patcher.stop)
        for name in ('verify_ci', 'check_backup', 'pull_and_verify', 'check_schema'):
            patcher = patch.object(worker, name); patcher.start(); self.addCleanup(patcher.stop)
        patcher = patch.object(worker.shutil, 'disk_usage')
        mocked = patcher.start(); mocked.return_value.free = 12 * 1024**3; self.addCleanup(patcher.stop)

    def test_failure_restores_previous_application_and_removes_own_maintenance(self):
        self.prepare_worker()
        with patch.object(worker, 'apply', side_effect=[RuntimeError('unhealthy'), None]) as apply:
            with self.assertRaisesRegex(RuntimeError, 'previous application restored'):
                worker.deploy(request(), 'a' * 32)
        self.assertEqual(apply.call_count, 2)
        self.assertIn('previous-back', apply.call_args_list[1].args[0])
        self.assertFalse(worker.MAINTENANCE.exists())
        self.assertTrue((self.root / 'releases' / ('cd-' + 'a' * 32) / 'rollback-healthy').exists())

    def test_failed_rollback_keeps_maintenance(self):
        self.prepare_worker()
        with patch.object(worker, 'apply', side_effect=RuntimeError('unhealthy')):
            with self.assertRaisesRegex(RuntimeError, 'maintenance retained'):
                worker.deploy(request(), 'b' * 32)
        self.assertTrue(worker.MAINTENANCE.is_file())

    def test_schema_failure_never_changes_release_or_calls_apply(self):
        self.prepare_worker()
        with patch.object(worker, 'check_schema', side_effect=ValueError('schema mismatch')), patch.object(worker, 'apply') as apply:
            with self.assertRaises(ValueError):
                worker.deploy(request(), 'c' * 32)
        apply.assert_not_called()
        self.assertFalse(worker.MAINTENANCE.exists())
        self.assertEqual(list((self.root / 'releases').iterdir()), [])

    def test_repeat_current_release_does_not_restart_apps(self):
        self.prepare_worker()
        data = request()
        worker.ENV.write_text('BACK_IMAGE=' + data['backDigest'] + '\nFRONT_IMAGE=' + data['frontDigest'] + '\nRELEASE_SHA=' + data['commit'] + '\n')
        with patch.object(worker, 'apply') as apply:
            result = worker.deploy(data, 'd' * 32)
        self.assertEqual(result['state'], 'already-current')
        apply.assert_not_called()


if __name__ == '__main__':
    unittest.main()
