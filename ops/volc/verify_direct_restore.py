#!/usr/bin/python3
"""Measure a 5.7 SQL logical import into a new 8.4 schema, never the live clone."""
import fcntl
import gzip
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

ROOT = Path('/srv/stock/backups/rehearsal-20261014')
TARGET = 'stock_cutover_verify'
CLIENT = ['docker', 'exec', '-i', 'mufengtongxue-stock-db-mysql-1', 'mysql',
          '--defaults-extra-file=/run/secrets/mysql-root-client', '-NB']


def query(sql):
    return subprocess.check_output(CLIENT, input=sql.encode()).decode().strip()


def main():
    os.umask(0o077)
    assert not Path('/etc/stock/production.enabled').exists()
    assert Path('/srv/stock/state/maintenance').exists()
    with open('/run/lock/stock-maintenance.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        assert query('SELECT VERSION();') == '8.4.11'
        assert query("SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='" + TARGET + "';") == '0'
        assert shutil.disk_usage(ROOT).free > 8 * 1024**3
        expected = json.loads((ROOT / 'mysql84-validation.json').read_text())
        archive = ROOT / 'stock.sql.gz'
        with archive.open('rb') as stream:
            assert hashlib.file_digest(stream, 'sha256').hexdigest() == expected['sourceSha256']
        with gzip.open(archive, 'rb') as stream:
            for line in stream:
                assert not line.lstrip().upper().startswith((b'USE ', b'CREATE DATABASE', b'DROP DATABASE'))
                assert not line.startswith(b'/*!50003'), 'Stored object SQL needs separate review'
        folder = ROOT / 'direct84'
        folder.mkdir(mode=0o700, exist_ok=False)
        query('CREATE DATABASE `' + TARGET + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;')
        started = time.monotonic()
        with (folder / 'restore.stderr').open('wb') as errors:
            process = subprocess.Popen(CLIENT + ['--init-command=SET SESSION sql_log_bin=0', '--binary-mode=1', TARGET],
                                       stdin=subprocess.PIPE, stderr=errors, stdout=subprocess.DEVNULL)
            try:
                with gzip.open(archive, 'rb') as stream:
                    for block in iter(lambda: stream.read(1024**2), b''):
                        assert shutil.disk_usage(ROOT).free > 3 * 1024**3, 'Disk reserve reached'
                        process.stdin.write(block)
                process.stdin.close()
                assert process.wait() == 0, 'Direct import failed; preserve isolated schema for diagnosis'
            finally:
                if process.poll() is None:
                    process.terminate()
                    process.wait()
        import_seconds = round(time.monotonic() - started, 1)
        columns = query("SELECT TABLE_NAME,COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,IS_NULLABLE,"
                        "IFNULL(COLUMN_DEFAULT,'<NULL>'),IFNULL(COLLATION_NAME,'<NULL>'),EXTRA "
                        "FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='" + TARGET + "' ORDER BY TABLE_NAME,ORDINAL_POSITION;")
        assert columns == (ROOT / 'mysql84-columns.tsv').read_text().strip()
        tables = query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='" + TARGET + "' ORDER BY TABLE_NAME;").splitlines()
        assert tables == sorted(expected['rows'])
        for table in tables:
            assert table.replace('_', '').isalnum()
            name = '`' + TARGET + '`.`' + table + '`'
            assert int(query('SELECT COUNT(*) FROM ' + name + ';')) == expected['rows'][table], table
            assert query('CHECKSUM TABLE ' + name + ' EXTENDED;').split('\t')[-1] == expected['checksums'][table], table
        assert query('SELECT name FROM `' + TARGET + '`.migrations ORDER BY name;').splitlines() == expected['migrationHistory']
        result = {'state': 'direct-logical-restore-verified', 'sourceSha256': expected['sourceSha256'],
                  'version': '8.4.11', 'tables': len(tables), 'rows': sum(expected['rows'].values()),
                  'importSeconds': import_seconds, 'totalSeconds': round(time.monotonic() - started, 1),
                  'columnsMatch': True, 'checksumsMatch': True, 'productionModified': False}
        (folder / 'validation.json').write_text(json.dumps(result, indent=2) + '\n')
        query('DROP DATABASE `' + TARGET + '`;')
        print(json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
