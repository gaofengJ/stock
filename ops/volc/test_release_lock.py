import contextlib
import fcntl
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import release_worker as worker


class ReleaseLockTest(unittest.TestCase):
    def test_real_lock_contention_preserves_queue_then_resumes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            enabled = root / 'enabled'
            enabled.touch()
            queue = root / 'queue'
            queue.mkdir()
            claimed = root / 'claimed'
            claimed.mkdir()
            entry = queue / ('a' * 32 + '.json')
            entry.write_text('{}')
            lock = root / 'lock'
            with patch.multiple(worker, LOCK=lock, PRODUCTION=enabled, ENABLED=enabled,
                                QUEUE=queue, CLAIMED=claimed), patch('sys.argv', ['worker']), \
                    patch.object(worker, 'validate_request', return_value={}), \
                    patch.object(worker, 'deploy', return_value={'state': 'deployed'}) as deploy, \
                    patch.object(worker, 'write_status') as write:
                with lock.open('a') as held:
                    fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    output = io.StringIO()
                    with contextlib.redirect_stdout(output):
                        worker.main()
                    self.assertIn('deferred-maintenance-lock', output.getvalue())
                    self.assertEqual(entry.read_text(), '{}')
                    self.assertFalse(list(claimed.iterdir()))
                    deploy.assert_not_called()
                    write.assert_not_called()
                with contextlib.redirect_stdout(io.StringIO()):
                    worker.main()
                deploy.assert_called_once()
                write.assert_called_once()
                self.assertFalse(entry.exists())

    def test_other_lock_errors_are_not_hidden(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'lock'
            path.touch()
            with patch.multiple(worker, LOCK=path, PRODUCTION=path, ENABLED=path), \
                    patch('sys.argv', ['worker']), \
                    patch.object(worker.fcntl, 'flock', side_effect=PermissionError('denied')):
                with self.assertRaises(PermissionError):
                    worker.main()


if __name__ == '__main__':
    unittest.main()
