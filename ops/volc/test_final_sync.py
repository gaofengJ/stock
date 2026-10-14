import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
import final_export as export
import final_import as restore

WINDOW = '20261014T120000Z'


def fixtures():
    databases = {}
    for db in export.DATABASES:
        databases[db] = dict(database=db, writersStopped=True, cutoverSnapshot=True,
                             bytes=100, sha256='a' * 64, rows={'migrations': 1}, checksums={'migrations': '123'},
                             migrationHistory=['Initial1'], foreignKeys=[], databaseCharset='utf8mb4',
                             databaseCollation='utf8mb4_general_ci', tableCollations={'migrations': 'utf8mb4_general_ci'})
    manifest = dict(state='final-source-export-verified', windowId=WINDOW, oldHost='47.99.111.167',
                    newHost='14.103.103.4', sourceReadOnly=True, sourceSuperReadOnly=True, databases=databases)
    transfer = dict(state='final-transport-verified', windowId=WINDOW,
                    databases={db: dict(sha256='a' * 64, bytes=100, operatorCopyVerified=True, newHostCopyVerified=True)
                               for db in export.DATABASES})
    return manifest, transfer


class FinalSyncTest(unittest.TestCase):
    def test_running_backend_or_timer_or_writable_db_blocks_export(self):
        valid = dict(backendRunning=False, readOnly=True, superReadOnly=True,
                     activeTransactions=0, units={'timer': 'inactive'}, freeBytes=12 * 1024**3)
        export.require_quiesced(valid)
        for key, value in [('backendRunning', True), ('readOnly', False), ('superReadOnly', False),
                           ('activeTransactions', 1), ('units', {'timer': 'active'}), ('freeBytes', 1)]:
            with self.assertRaises(ValueError):
                export.require_quiesced(dict(valid, **{key: value}))

    def test_expired_or_wrong_window_approval_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'approval.json'
            record = dict(windowId=WINDOW, oldHost='47.99.111.167', newHost='14.103.103.4',
                          stopWritesApproved=True, expiresAtEpoch=2000)
            path.write_text(json.dumps(record)); path.chmod(0o600)
            stat = Mock(st_uid=0, st_mode=0o600)
            # The filesystem ownership check is retained; mock only OS-specific uid for portable tests.
            with patch.object(Path, 'stat', return_value=stat), patch.object(Path, 'is_file', return_value=True), patch.object(Path, 'is_symlink', return_value=False):
                export.validate_approval(path, WINDOW, now=1000)
                for now in (2000, 3000, -10000):
                    with self.assertRaises(ValueError):
                        export.validate_approval(path, WINDOW, now=now)
                with self.assertRaises(ValueError):
                    export.validate_approval(path, '20261015T120000Z', now=1000)
                stat.st_mode = 0o644
                with self.assertRaises(ValueError):
                    export.validate_approval(path, WINDOW, now=1000)

    def test_snapshot_never_overwrites_or_mixes_resume_windows(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp); (folder / 'stock.sql.partial').write_bytes(b'previous')
            with patch.object(export, 'query') as query:
                with self.assertRaises(ValueError):
                    export.snapshot([], 'unused', 'stock', folder, ['migrations'])
            query.assert_not_called()
            self.assertEqual((folder / 'stock.sql.partial').read_bytes(), b'previous')

    def test_live_baseline_or_missing_independent_copy_cannot_import(self):
        manifest, transfer = fixtures()
        self.assertEqual(set(restore.validate_manifest(manifest, transfer, WINDOW)), set(export.DATABASES))
        cases = []
        changed = copy.deepcopy(manifest); changed['sourceSuperReadOnly'] = False; cases.append((changed, transfer))
        changed = copy.deepcopy(manifest); changed['databases']['stock_test']['database'] = 'stock'; cases.append((changed, transfer))
        changed = copy.deepcopy(manifest); changed['databases']['stock']['cutoverSnapshot'] = False; cases.append((changed, transfer))
        changed = copy.deepcopy(transfer); changed['databases']['stock']['operatorCopyVerified'] = False; cases.append((manifest, changed))
        changed = copy.deepcopy(transfer); changed['databases']['stock_test']['sha256'] = 'b' * 64; cases.append((manifest, changed))
        for source, copies in cases:
            with self.assertRaises(ValueError):
                restore.validate_manifest(source, copies, WINDOW)

    def test_new_host_running_backend_or_production_flag_blocks_import(self):
        valid = dict(maintenance=True, productionEnabled=False, backendRunning=False, version='8.4.11', freeBytes=6 * 1024**3)
        restore.require_isolated(valid)
        for key, value in [('maintenance', False), ('productionEnabled', True), ('backendRunning', True), ('version', '5.7.33'), ('freeBytes', 1)]:
            with self.assertRaises(ValueError):
                restore.require_isolated(dict(valid, **{key: value}))

    def test_version_metadata_is_normalized_but_collation_changes_are_not(self):
        old = 't\ta\t1\tint(11)\tNO\t<NULL>\t<NULL>\t\n'
        new = 't\ta\t1\tint\tNO\t<NULL>\t<NULL>\t\n'
        self.assertEqual(restore.normalize_columns(old), restore.normalize_columns(new))
        old = 't\ta\t1\tdatetime(6)\tNO\tCURRENT_TIMESTAMP(6)\t<NULL>\ton update CURRENT_TIMESTAMP(6)\n'
        new = old.replace('on update', 'DEFAULT_GENERATED on update')
        self.assertEqual(restore.normalize_columns(old), restore.normalize_columns(new))
        old = 't\ta\t1\tvarchar(255)\tNO\t<NULL>\tutf8mb4_general_ci\t\n'
        self.assertNotEqual(restore.normalize_columns(old), restore.normalize_columns(old.replace('utf8mb4_general_ci', 'utf8mb4_0900_ai_ci')))

    def test_only_innodb_restrict_no_action_synonym_is_normalized(self):
        old = ['child\tfk\towner_id\t1\tparent\tid\tRESTRICT\tCASCADE']
        new = [old[0].replace('RESTRICT', 'NO ACTION')]
        self.assertEqual(restore.normalize_foreign_keys(old), restore.normalize_foreign_keys(new))
        changed = [old[0].replace('CASCADE', 'SET NULL')]
        self.assertNotEqual(restore.normalize_foreign_keys(old), restore.normalize_foreign_keys(changed))

    def test_tampered_sql_is_rejected_before_any_database_call(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            (folder / 'stock.sql').write_bytes(b'CREATE TABLE `t` (id int);\nINSERT INTO `t` VALUES (1);\n')
            metadata = dict(bytes=1, sha256='a' * 64, completedAt='2026-10-14T00:00:00+00:00', rows={'t': 1})
            with patch.object(restore, 'query') as query:
                with self.assertRaises(ValueError):
                    restore.validate_payload(folder, {'stock': metadata})
            query.assert_not_called()

    def test_sql_switching_database_is_rejected_even_with_matching_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            raw = b'CREATE TABLE `t` (id int);\nINSERT INTO `t` VALUES (1);\nUSE mysql;\n'
            (folder / 'stock.sql').write_bytes(raw)
            metadata = dict(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(), completedAt='2026-10-14T00:00:00+00:00', rows={'t': 1})
            with self.assertRaisesRegex(ValueError, 'Cross-schema'):
                restore.validate_payload(folder, {'stock': metadata})


if __name__ == '__main__':
    unittest.main()
