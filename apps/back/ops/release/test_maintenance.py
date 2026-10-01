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

    def test_images_only_never_enters_backup_archiving(self):
        for index in range(5):
            self.backup('old-'+str(index), 10+index)
        with patch.object(m, 'docker_json', return_value=[]), patch.object(m, 'backup_candidates', side_effect=AssertionError('must not inspect backups')):
            result = m.maintenance(self.root, apply=True, images_only=True)
        self.assertEqual(result['backupCleanup'], 'skipped')
        self.assertEqual(len(list(self.root.glob('backups/*/stock.sql.gz'))), 5)

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

    def test_cleanup_keeps_current_and_one_prior_without_seven_day_exemption(self):
        previous = [container('stock-back-previous-'+('%012x' % index)+'-'+str(index), 0.1+index, 'image-'+str(index)) for index in range(5)]
        failed = container('stock-back-failed-'+'f'*12+'-1', 0, 'failed-image')
        current = container('stock-back', 10, 'current-image', True)
        unrelated = container('other-application', 30, 'image-4')
        images = [dict(Id='image-'+str(index), Created=date(10), RepoTags=[m.REPOSITORY+':'+('%040x' % index)]) for index in range(5)]
        images += [dict(Id='failed-image', Created=date(0), RepoTags=[m.REPOSITORY+':'+'f'*40]),
                   dict(Id='unmanaged-image', Created=date(30), RepoTags=['unrelated:latest']),
                   dict(Id='new-image', Created=date(1), RepoTags=[m.REPOSITORY+':'+'a'*40])]
        plan = m.docker_plan(previous+[failed,current,unrelated], images)
        self.assertEqual(set(plan['containers']), {item['Id'] for item in previous[1:]} | {failed['Id']})
        self.assertEqual(set(plan['imageTags']), {m.REPOSITORY+':'+('%040x' % index) for index in (1,2,3)} | {m.REPOSITORY+':'+'f'*40, m.REPOSITORY+':'+'a'*40})

    def test_both_services_keep_one_distinct_successful_history(self):
        containers = []
        successful = set()
        for service in ('back', 'front'):
            containers += [container('stock-'+service, 0, service+'-current', True),
                container('stock-'+service+'-previous-'+'a'*12+'-1', 1, service+'-current'),
                container('stock-'+service+'-previous-'+'b'*12+'-2', 2, service+'-prior'),
                container('stock-'+service+'-previous-'+'c'*12+'-3', 3, service+'-older'),
                container('stock-'+service+'-previous-'+'d'*12+'-4', 0.1, service+'-unsuccessful')]
            successful.update(item['Name'].lstrip('/') for item in containers if '-previous-' in item['Name'] and 'd'*12 not in item['Name'])
        plan = m.docker_plan(containers, [], successful)
        self.assertEqual({item['image'] for item in plan['retained']}, {'back-current','back-prior','front-current','front-prior'})
        self.assertEqual(len(plan['containers']), 6)

    def test_dangling_cleanup_never_removes_any_container_reference(self):
        containers = [container('stock-back', 0, 'current', True), container('other-stopped-service', 2, 'used')]
        images = [dict(Id=value, RepoTags=None, Created=date(0)) for value in ('current','used','unused')]
        plan = m.docker_plan(containers, images)
        self.assertEqual(plan['danglingImages'], ['unused'])
        self.assertEqual(plan['runtimeImageTags'], [{'image': 'current', 'tag': 'stock-runtime-preserved:stock-back-current'}])

    def test_stopped_service_preserves_its_recovery_container_and_tag(self):
        containers = [container('stock-back', 0, 'current'), container('stock-back-previous-'+'a'*12+'-1', 20, 'prior')]
        images = [dict(Id='prior', RepoTags=[m.REPOSITORY+':'+'a'*40], Created=date(20))]
        plan = m.docker_plan(containers, images, set())
        self.assertEqual(plan['containers'], [])
        self.assertEqual(plan['imageTags'], [])

    def test_required_classic_parent_layers_are_preserved_and_retagged(self):
        containers = [container('stock-back', 0, 'current', True)]
        images = [dict(Id='current', Parent='parent', RepoTags=[m.REPOSITORY+':'+'a'*40]),
                  dict(Id='parent', Parent='base', RepoTags=None),
                  dict(Id='base', Parent='', RepoTags=None),
                  dict(Id='unused', Parent='', RepoTags=None)]
        plan = m.docker_plan(containers, images)
        self.assertEqual(plan['danglingImages'], ['unused'])
        self.assertEqual({item['image'] for item in plan['runtimeImageTags']}, {'parent', 'base'})


if __name__ == '__main__':
    unittest.main()
