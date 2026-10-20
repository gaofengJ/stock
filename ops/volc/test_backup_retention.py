import json
from pathlib import Path
from unittest.mock import patch
import tempfile
import unittest
from backup_database import preserve_restore_proof, restore_proof_matches, wait_for_lock


class RetentionProofTest(unittest.TestCase):
    def test_busy_maintenance_lock_retries_without_stealing_it(self):
        with patch('backup_database.fcntl.flock', side_effect=[BlockingIOError(), None]) as flock, patch('backup_database.time.sleep') as sleep:
            wait_for_lock(object())
            self.assertEqual(flock.call_count, 2)
            sleep.assert_called_once_with(5)

    def test_busy_lock_has_a_bounded_deadline(self):
        with patch('backup_database.fcntl.flock', side_effect=BlockingIOError()), patch('backup_database.time.monotonic', side_effect=[0, 601]), patch('backup_database.time.sleep') as sleep:
            with self.assertRaises(TimeoutError): wait_for_lock(object())
            sleep.assert_not_called()

    def test_preserves_matching_recovery_evidence_separately_from_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); source = root / 'daily' / '20261014T083135Z'; source.mkdir(parents=True)
            metadata = dict(database='stock', version='8.4.11', sha256='a' * 64)
            proof = dict(state='backup-restore-verified', sha256='a' * 64)
            (source / 'backup.json').write_text(json.dumps(metadata))
            (source / 'restore-validation.json').write_text(json.dumps(proof))
            preserve_restore_proof(source, root / 'restore-proofs')
            archived = json.loads((root / 'restore-proofs' / (source.name + '.json')).read_text())
            self.assertTrue(restore_proof_matches(archived['backup'], archived['proof']))
            self.assertTrue((source / 'backup.json').exists())
            proof['sha256'] = 'b' * 64
            (source / 'restore-validation.json').write_text(json.dumps(proof))
            with self.assertRaises(ValueError): preserve_restore_proof(source, root / 'restore-proofs')
            self.assertEqual(json.loads((root / 'restore-proofs' / (source.name + '.json')).read_text()), archived)


if __name__ == '__main__': unittest.main()
