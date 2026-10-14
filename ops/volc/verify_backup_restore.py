#!/usr/bin/python3
"""Restore a new-host snapshot into a fresh verification schema, then compare it."""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

SCHEMA = 'stock_backup_verify'
CLIENT = ['docker', 'compose', '--env-file', '/opt/stock/deploy/release.env',
          '-f', '/opt/stock/deploy/compose.database.yaml', 'exec', '-T', 'mysql',
          'mysql', '--defaults-extra-file=/run/secrets/mysql-root-client', '-NB']


def query(sql):
    return subprocess.check_output(CLIENT, input=sql.encode()).decode().strip()


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('backup', type=Path)
    folder = parser.parse_args().backup.resolve()
    assert folder.parent == Path('/srv/stock/backups/daily')
    assert not Path('/etc/stock/production.enabled').exists(), 'This verifier is for isolated rehearsal only'
    assert Path('/srv/stock/state/maintenance').exists()
    assert SCHEMA not in ('stock', 'stock_test')
    assert query('SELECT VERSION();') == '8.4.11'
    assert query(f"SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='{SCHEMA}';") == '0'
    assert shutil.disk_usage(folder).free > 8 * 1024**3
    metadata = json.loads((folder / 'backup.json').read_text())
    archive = folder / 'stock.sql.gz'
    assert metadata['database'] == 'stock' and metadata['version'] == '8.4.11'
    with archive.open('rb') as stream:
        assert hashlib.file_digest(stream, 'sha256').hexdigest() == metadata['sha256']
    assert archive.stat().st_size == metadata['bytes']
    tables = query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='stock' ORDER BY TABLE_NAME;").splitlines()
    assert len(tables) == 53
    # No stored SQL objects or schema-switch directives may redirect this restore.
    for catalog in ['ROUTINES', 'EVENTS', 'TRIGGERS']:
        field = {'ROUTINES': 'ROUTINE_SCHEMA', 'EVENTS': 'EVENT_SCHEMA', 'TRIGGERS': 'TRIGGER_SCHEMA'}[catalog]
        assert query(f"SELECT COUNT(*) FROM information_schema.{catalog} WHERE {field}='stock';") == '0'
    with gzip.open(archive, 'rb') as stream:
        for line in stream:
            assert not line.lstrip().upper().startswith((b'USE ', b'CREATE DATABASE', b'DROP DATABASE'))
            assert not line.startswith(b'/*!50003'), 'Stored object SQL requires separate review'
    (folder / 'restore-verification.started').open('x').close()
    query(f'CREATE DATABASE `{SCHEMA}` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;')
    started = time.monotonic()
    with (folder / 'restore-verification.stderr').open('wb') as errors:
        restore = subprocess.Popen(CLIENT + ['--init-command=SET SESSION sql_log_bin=0', '--binary-mode=1', SCHEMA],
                                   stdin=subprocess.PIPE, stderr=errors, stdout=subprocess.DEVNULL)
        try:
            with gzip.open(archive, 'rb') as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b''):
                    assert shutil.disk_usage(folder).free > 2 * 1024**3, 'Restore reached disk reserve'
                    restore.stdin.write(block)
            restore.stdin.close()
            assert restore.wait() == 0, 'Restore failed; keep verification schema for diagnosis'
        finally:
            if restore.poll() is None:
                restore.terminate()
                restore.wait()
    assert query(f"SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='{SCHEMA}' ORDER BY TABLE_NAME;").splitlines() == tables
    rows, checksums = {}, {}
    for table in tables:
        assert table.replace('_', '').isalnum()
        original = f'`stock`.`{table}`'
        restored = f'`{SCHEMA}`.`{table}`'
        count = int(query(f'SELECT COUNT(*) FROM {restored};'))
        assert count == int(query(f'SELECT COUNT(*) FROM {original};')), 'Row count differs: ' + table
        checksum = query(f'CHECKSUM TABLE {restored} EXTENDED;').split('\t')[-1]
        assert checksum != 'NULL' and checksum == query(f'CHECKSUM TABLE {original} EXTENDED;').split('\t')[-1], 'Content differs: ' + table
        rows[table], checksums[table] = count, checksum
    result = {'state': 'backup-restore-verified', 'sha256': metadata['sha256'],
              'rows': rows, 'checksums': checksums, 'seconds': round(time.monotonic() - started, 1),
              'isolatedRehearsal': True, 'offHostVerified': False}
    temp = folder / 'restore-validation.json.tmp'
    temp.write_text(json.dumps(result, indent=2) + '\n')
    temp.replace(folder / 'restore-validation.json')
    # Remove only the schema exclusively created by this invocation after validation.
    query(f'DROP DATABASE `{SCHEMA}`;')
    print(json.dumps({'state': result['state'], 'tables': len(rows), 'seconds': result['seconds'],
                      'verificationSchemaRemoved': True, 'offHostVerified': False}), flush=True)


if __name__ == '__main__':
    main()
