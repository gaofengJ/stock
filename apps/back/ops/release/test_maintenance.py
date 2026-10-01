import datetime
import gzip
import json
import os
import pathlib
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import maintenance as m

NOW = 1790908800


def date(age):
    return datetime.datetime.fromtimestamp(NOW-age*m.DAY, datetime.timezone.utc).isoformat()


def container(name, age, image, running=False):
    return dict(Id=name, Name='/'+name, Created=date(age), Image=image, State={'Running': running})


class MaintenanceTests(unittest.TestCase):
    def test_docker_nanoseconds_are_compatible_with_host_python(self):
        self.assertEqual(m.timestamp('2026-10-01T00:00:00.000000000Z'),
                         datetime.datetime(2026, 10, 1, tzinfo=datetime.timezone.utc).timestamp())

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def backup(self, name, age, schema=None, phase=None):
        directory = self.root/('runs' if phase is not None else 'backups')/name
        directory.mkdir(parents=True)
        with gzip.open(str(directory/'stock.sql.gz'), 'wb') as stream:
            stream.write(b'CREATE TABLE fixture (id int);')
        sha = m.digest(directory/'stock.sql.gz')
        (directory/'stock.sql.gz.sha256').write_text(sha+'  stock.sql.gz\n')
        (directory/'backup.json').write_text(json.dumps(dict(version=1, database='stock',
            migrationHistory=schema or ['Fixture1'], completedAt=date(age), sha256=sha,
            bytes=(directory/'stock.sql.gz').stat().st_size)))
        if phase is not None:
            (directory/'phase').write_text(phase)
        os.utime(str(directory/'stock.sql.gz'), (NOW-age*m.DAY, NOW-age*m.DAY))
        return directory

    def test_recent_backup_requires_same_schema_and_verifies_content(self):
        stale = self.backup('stale', 2)
        wrong = self.backup('wrong-schema', 0, ['Older1'])
        valid = self.backup('valid', 0.1)
        self.assertEqual(m.recent_backup(self.root, {'migrationHistory': ['Fixture1']}, NOW)['directory'], str(valid))
        (valid/'stock.sql.gz').write_bytes(b'corrupted')
        with self.assertRaises(ValueError):
            m.recent_backup(self.root, {'migrationHistory': ['Fixture1']}, NOW)
        self.assertTrue(stale.exists() and wrong.exists())

    def test_failed_future_and_incomplete_backups_are_not_reused(self):
        self.backup('failed', 0, phase='migration-started')
        future = self.backup('future', -1)
        incomplete = self.backup('incomplete', 0)
        (incomplete/'backup.json').unlink()
        with self.assertRaises(ValueError):
            m.recent_backup(self.root, {'migrationHistory': ['Fixture1']}, NOW)
        self.assertTrue(future.exists())

    def test_retention_keeps_three_latest_and_all_recent_or_failed_snapshots(self):
        for index, age in enumerate([1, 3, 8, 10, 12]):
            self.backup('success-'+str(index), age)
        failed = self.backup('failed', 30, phase='migration-started')
        candidates = m.backup_candidates(self.root, NOW)
        self.assertEqual({item.name for item in candidates}, {'success-3', 'success-4'})
        self.assertTrue((failed/'stock.sql.gz').exists())

    def test_no_archive_means_no_backup_deletion_even_when_apply_is_enabled(self):
        for index in range(5):
            self.backup('old-'+str(index), 10+index)
        with patch.object(m, 'docker_json', return_value=[]), patch.object(m.time, 'time', return_value=NOW):
            result = m.maintenance(self.root, apply=True)
        self.assertEqual(result['backupCleanup'], 'archive-required')
        self.assertEqual(result['archivedBackups'], 0)
        self.assertEqual(len(list(self.root.glob('backups/*/stock.sql.gz'))), 5)

    def test_same_filesystem_archive_is_rejected_and_original_is_preserved(self):
        original = self.backup('old', 10)
        archive = self.root/'archive'
        archive.mkdir()
        with self.assertRaises(ValueError):
            m.archive_and_remove(original, archive, self.root)
        self.assertTrue((original/'stock.sql.gz').exists())

    def test_archived_copy_is_verified_before_local_copy_is_removed(self):
        original = self.backup('legacy-absolute-checksum', 10)
        expected = m.digest(original/'stock.sql.gz')
        (original/'stock.sql.gz.sha256').write_text(expected+'  '+str(original/'stock.sql.gz')+'\n')
        archive_temp = tempfile.TemporaryDirectory()
        self.addCleanup(archive_temp.cleanup)
        archive = pathlib.Path(archive_temp.name)
        # Simulate a separate mounted filesystem while exercising real file copies,
        # gzip/sha verification, legacy checksum normalization and deletion ordering.
        boundary = SimpleNamespace(resolve=lambda: self.root.resolve(), stat=lambda: SimpleNamespace(st_dev=-1))
        m.archive_and_remove(original, archive, boundary)
        self.assertFalse((original/'stock.sql.gz').exists())
        self.assertEqual(m.verified_backup(archive/original.name), expected)
        self.assertEqual((archive/original.name/'stock.sql.gz.sha256').read_text(), expected+'  stock.sql.gz\n')
        self.assertTrue((original/'backup.json').exists())

    def test_archive_collision_preserves_original_backup(self):
        original = self.backup('collision', 10)
        archive_temp = tempfile.TemporaryDirectory()
        self.addCleanup(archive_temp.cleanup)
        archive = pathlib.Path(archive_temp.name)
        target = archive/original.name
        target.mkdir()
        (target/'stock.sql.gz').write_bytes(b'different existing copy')
        boundary = SimpleNamespace(resolve=lambda: self.root.resolve(), stat=lambda: SimpleNamespace(st_dev=-1))
        with self.assertRaises(ValueError):
            m.archive_and_remove(original, archive, boundary)
        self.assertTrue((original/'stock.sql.gz').exists())

    def test_docker_cleanup_protects_running_recent_latest_three_unrelated_and_failed(self):
        previous = [container('stock-back-previous-'+('%012x' % index)+'-'+str(index), 10+index, 'image-'+str(index)) for index in range(5)]
        failed = container('stock-back-previous-'+'f'*12+'-1', 30, 'failed-image')
        current = container('stock-back', 10, 'current-image', True)
        unrelated = container('other-application', 30, 'image-4')
        images = [dict(Id='image-'+str(index), Created=date(10), RepoTags=[m.REPOSITORY+':'+('%040x' % index)]) for index in range(5)]
        images += [dict(Id='failed-image', Created=date(30), RepoTags=['stock-back-rollback:'+'f'*12]),
                   dict(Id='unmanaged-image', Created=date(30), RepoTags=['unrelated:latest']),
                   dict(Id='new-image', Created=date(1), RepoTags=[m.REPOSITORY+':'+'a'*40])]
        plan = m.docker_plan(previous+[failed,current,unrelated], images, {'f'*12}, NOW)
        self.assertEqual(set(plan['containers']), {previous[3]['Id'], previous[4]['Id']})
        self.assertEqual(plan['imageTags'], [m.REPOSITORY+':'+('%040x' % 3)])


if __name__ == '__main__':
    unittest.main()
