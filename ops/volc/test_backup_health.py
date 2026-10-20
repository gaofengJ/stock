import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from backup_health import assess, RESERVE

NOW = dt.datetime(2026, 10, 14, 10, tzinfo=dt.timezone.utc)


class BackupHealthTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def backup(self, age=1):
        finished = NOW - dt.timedelta(hours=age)
        folder = self.root / finished.strftime('%Y%m%dT%H%M%SZ')
        folder.mkdir()
        (folder / 'stock.sql.gz').write_bytes(b'fixture')
        (folder / 'backup.json').write_text(json.dumps({
            'database': 'stock', 'version': '8.4.11', 'singleTransaction': True,
            'sha256': 'a' * 64, 'bytes': 7, 'completedAt': finished.isoformat()}))
        return folder

    def check(self, **kwargs):
        options = dict(root=self.root, now=NOW, free_bytes=RESERVE + 1,
                       service_result='success', timer_enabled=True)
        options.update(kwargs)
        return assess(**options)

    def test_recent_completed_backup_with_enabled_schedule_is_healthy(self):
        self.backup()
        result = self.check()
        self.assertTrue(result['healthy'])
        self.assertFalse(result['contentChecksumRechecked'])
        self.assertFalse(result['recurringOffhostBackupConfigured'])

    def test_stale_backup_service_failure_and_disabled_timer_are_reported(self):
        self.backup(age=40)
        issues = self.check(service_result='exit-code', timer_enabled=False)['issues']
        self.assertIn('backup_older_than_36h', issues)
        self.assertIn('backup_service_failed_or_unknown', issues)
        self.assertIn('backup_timer_disabled_or_unknown', issues)

    def test_corrupt_new_snapshot_does_not_hide_valid_old_one(self):
        old = self.backup(age=4)
        new = self.backup(age=1)
        (new / 'stock.sql.gz').write_bytes(b'truncated')
        result = self.check()
        self.assertEqual(result['latestBackup'], old.name)
        self.assertIn('invalid_backup:' + new.name, result['issues'])

    def test_missing_backup_low_disk_and_abandoned_dump_are_reported(self):
        folder = self.backup(age=2)
        (folder / 'backup.json').unlink()
        issues = self.check(free_bytes=RESERVE - 1)['issues']
        self.assertIn('no_complete_backup', issues)
        self.assertIn('less_than_6GiB_free', issues)
        self.assertIn('incomplete_backup:' + folder.name, issues)

    def test_active_incomplete_dump_is_not_prematurely_failed(self):
        self.backup(age=4)
        folder = self.backup(age=0.25)
        (folder / 'backup.json').unlink()
        self.assertTrue(self.check()['healthy'])


if __name__ == '__main__':
    unittest.main()
