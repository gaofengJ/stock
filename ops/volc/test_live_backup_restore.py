import gzip
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, Mock
import verify_live_backup as verifier


class LiveRestoreTests(unittest.TestCase):
    def test_large_table_checks_have_bounded_longer_timeout_and_progress(self):
        progress = Mock()
        with patch.object(verifier, 'run', side_effect=['stock.example\tcheck\tstatus\tOK', '12', 'stock.example\t123']) as run:
            self.assertEqual(verifier.check_tables(['isolated-client'], {'example'}, progress), ({'example': 12}, {'example': '123'}))
        self.assertTrue(all(call.kwargs['timeout'] == 900 for call in run.call_args_list))
        progress.assert_called_once_with('checking', tables=1, checked=1, currentTable='example')

    def test_checksum_and_dump_table_set_are_checked_before_restore(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); folder = root / '20261020T010000Z'; folder.mkdir()
            archive = folder / 'stock.sql.gz'
            with gzip.open(archive, 'wb') as output:
                output.write(b'CREATE TABLE `example` (\n id int\n);\n')
            metadata = dict(database='stock', version='8.4.11', singleTransaction=True,
                            bytes=archive.stat().st_size, sha256=hashlib.sha256(archive.read_bytes()).hexdigest())
            (folder / 'backup.json').write_text(json.dumps(metadata))
            with patch.object(verifier, 'ROOT', root):
                self.assertEqual(verifier.backup_info(folder)[2], {'example'})
                metadata['sha256'] = '0' * 64
                (folder / 'backup.json').write_text(json.dumps(metadata))
                with self.assertRaisesRegex(ValueError, 'checksum'): verifier.backup_info(folder)

    def test_engine_mismatch_stops_only_the_isolated_container_and_preserves_diagnostics(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); folder = root / 'daily'; folder.mkdir()
            commands = []
            identity = 'verify-' + 'a' * 32
            def run(args, **kwargs):
                commands.append(args)
                if args[:2] == ['docker', 'inspect']:
                    return json.dumps([{'Image': 'sha256:' + 'b' * 64, 'Config': {'Labels': {'stock.backup.verify': identity}}}])
                if args[-1] == '/proc/1/comm': return 'mysqld'
                if 'mysql' in args: return '8.0.0'
                return ''
            with patch.object(verifier, 'WORK', root / 'verification'), patch.object(verifier, 'ROOT', root), \
                 patch.object(verifier, 'backup_info', return_value=(folder / 'stock.sql.gz', {'version': '8.4.11'}, {'example'})), \
                 patch.object(verifier.uuid, 'uuid4', return_value=Mock(hex='a' * 32)), \
                 patch.object(verifier.shutil, 'disk_usage', return_value=Mock(free=10 * 1024**3)), \
                 patch.object(verifier, 'run', side_effect=run), \
                 patch.object(verifier.subprocess, 'run', return_value=Mock(returncode=0)):
                with self.assertRaisesRegex(ValueError, 'engine'): verifier.verify(folder)
            create = next(c for c in commands if c[:2] == ['docker', 'run'])
            self.assertEqual(create[create.index('--network') + 1], 'none')
            self.assertEqual(create.count('--mount'), 1)
            self.assertNotIn('/srv/stock/mysql', ' '.join(create))
            self.assertNotIn('/etc/stock', ' '.join(create))
            self.assertTrue(any(c[:2] == ['docker', 'stop'] and c[-1] != verifier.PRODUCTION for c in commands))
            self.assertFalse(any(c[:2] == ['docker', 'rm'] for c in commands))
            self.assertFalse((folder / 'restore-validation.json').exists())
            self.assertTrue((root / 'verification' / identity / 'mysql').is_dir())


if __name__ == '__main__': unittest.main()
