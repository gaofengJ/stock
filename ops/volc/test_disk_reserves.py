import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

import backup_database as backup
import release_worker as worker

GIB = 1024**3


class PullDiskTest(unittest.TestCase):
    def run_pull(self, sizes, waits=(0,), timeout=10):
        process = Mock()
        process.wait.side_effect = waits
        process.poll.return_value = None
        with patch.object(worker.shutil, 'disk_usage', side_effect=[Mock(free=n) for n in sizes]), \
                patch.object(worker.subprocess, 'Popen', return_value=process) as spawn, \
                patch('builtins.print') as log:
            try:
                worker.monitored_pull('verified@sha256:abc', {}, timeout)
            finally:
                self.process, self.spawn, self.log = process, spawn, log

    def test_low_disk_before_pull_never_starts_process(self):
        with self.assertRaises(ValueError):
            self.run_pull([4 * GIB - 1] * 2)
        self.spawn.assert_not_called()

    def test_low_disk_during_pull_cancels_and_records_minimum(self):
        with self.assertRaisesRegex(ValueError, '4 GiB reserve'):
            self.run_pull([6 * GIB, 5 * GIB, 4 * GIB - 1, 4 * GIB - 1],
                          [subprocess.TimeoutExpired('docker', 1), 0])
        self.process.terminate.assert_called_once()
        data = json.loads(self.log.call_args.args[0].split(' ', 1)[1])
        self.assertEqual(data['outcome'], 'low-disk')
        self.assertEqual(data['minFreeBytes'], 4 * GIB - 1)

    def test_exact_four_gib_is_allowed_and_final_drop_is_checked(self):
        self.run_pull([4 * GIB] * 4, [0, 0])
        with self.assertRaises(ValueError):
            self.run_pull([6 * GIB, 5 * GIB, 4 * GIB - 1, 4 * GIB - 1], [0, 0])

    def test_timeout_kills_unresponsive_pull(self):
        with self.assertRaises(TimeoutError):
            self.run_pull([6 * GIB] * 3,
                          [subprocess.TimeoutExpired('docker', 10), 0], timeout=0)
        self.process.terminate.assert_called_once()
        self.process.kill.assert_called_once()

    def test_docker_failure_is_not_success(self):
        with self.assertRaises(RuntimeError):
            self.run_pull([6 * GIB] * 4, [1, 0])


class BackupDiskTest(unittest.TestCase):
    def test_thresholds_and_partial_failure_preserve_old_backups(self):
        for sizes, succeeds in [([6 * GIB - 1], False),
                                ([6 * GIB, 4 * GIB - 1], False),
                                ([6 * GIB, 4 * GIB], True)]:
            with self.subTest(sizes=sizes), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                old = root / '20261001T000000Z'
                old.mkdir(); (old / 'stock.sql.gz').write_bytes(b'keep')
                (old / 'backup.json').write_text('{}')
                process = Mock(stdout=io.BytesIO(b'SQL fixture\n'))
                process.wait.return_value = 0
                process.poll.return_value = 0
                with patch.object(backup, 'ROOT', root), \
                        patch.object(backup, 'open', create=True, return_value=tempfile.TemporaryFile()), \
                        patch.object(backup, 'query', side_effect=['8.4.11', '0', '53']), \
                        patch.object(backup.shutil, 'disk_usage', side_effect=[Mock(free=n) for n in sizes]), \
                        patch.object(backup.subprocess, 'Popen', return_value=process) as spawn, \
                        patch('sys.argv', ['backup_database.py']), patch('builtins.print'):
                    if succeeds:
                        backup.main()
                        self.assertEqual(len(list(root.glob('*/backup.json'))), 2)
                    else:
                        with self.assertRaises(RuntimeError):
                            backup.main()
                        self.assertEqual(list(root.glob('*/backup.json')), [old / 'backup.json'])
                        if len(sizes) == 1:
                            spawn.assert_not_called()
                self.assertEqual((old / 'stock.sql.gz').read_bytes(), b'keep')


if __name__ == '__main__':
    unittest.main()
