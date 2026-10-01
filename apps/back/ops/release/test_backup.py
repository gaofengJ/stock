import json
import os
import pathlib
import subprocess
import tempfile
import unittest


@unittest.skipUnless(os.name == 'posix', 'Linux release backup execution')
class BackupShellTests(unittest.TestCase):
    def run_backup(self, failure=''):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = pathlib.Path(temp.name)
        (root/'backups').mkdir()
        script = (pathlib.Path(__file__).parent/'backup.sh').read_text().replace('ROOT=/opt/stock-release', 'ROOT='+str(root))
        (root/'backup.sh').write_text(script)
        (root/'mocks.sh').write_text('''
docker() {
  case "$*" in
    *"backup-info") echo '{"database":"stock","totalBytes":100,"migrationHistory":["Fixture1"]}' ;;
    *"client-config") echo '[client]'; echo 'password=private-fixture' ;;
  esac
}
df() { if [[ "$FAIL" == space ]]; then echo 'header'; echo 'volume 100 0 0 0 path'; else command df "$@"; fi; }
mysqldump() { echo 'CREATE TABLE fixture(id int);'; [[ "$FAIL" != dump ]]; }
sha256sum() { [[ "$FAIL" != checksum ]] || return 1; command sha256sum "$@"; }
export -f docker df mysqldump sha256sum
''')
        target = root/'backups'/'test'
        if failure == 'existing':
            target.mkdir()
            (target/'original').write_text('preserve')
        result = subprocess.run(['/bin/bash', str(root/'backup.sh'), str(target), 'fixture-image', str(root/'runtime.env')],
                                env=dict(os.environ, BASH_ENV=str(root/'mocks.sh'), FAIL=failure),
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True, timeout=15)
        self.assertNotIn('private-fixture', result.stdout+result.stderr)
        self.assertFalse((target/'client.cnf').exists())
        return result, target

    def test_success_publishes_verified_schema_manifest(self):
        result, target = self.run_backup()
        self.assertEqual(result.returncode, 0, result.stderr)
        record = json.loads((target/'backup.json').read_text())
        self.assertEqual(record['migrationHistory'], ['Fixture1'])
        self.assertEqual(record['database'], 'stock')
        self.assertGreater(record['bytes'], 0)
        self.assertEqual(len(record['sha256']), 64)

    def test_failures_never_publish_completed_manifest(self):
        for failure in ['space', 'dump', 'checksum']:
            with self.subTest(failure=failure):
                result, target = self.run_backup(failure)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse((target/'backup.json').exists())

    def test_existing_backup_is_not_overwritten(self):
        result, target = self.run_backup('existing')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((target/'original').read_text(), 'preserve')


if __name__ == '__main__':
    unittest.main()
