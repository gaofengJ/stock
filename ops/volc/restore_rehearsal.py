#!/usr/bin/python3
"""Restore one verified legacy snapshot into the isolated, disposable MySQL 8.0 stage."""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

CONTAINER = 'mufengtongxue-mysql80-rehearsal'
CLIENT = ['docker', 'exec', '-i', CONTAINER, 'mysql',
          '--defaults-extra-file=/run/secrets/mysql-root.cnf',
          '--batch', '--skip-column-names', '--default-character-set=utf8mb4']


def query(sql):
    return subprocess.check_output(CLIENT, input=sql.encode()).decode().strip()


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    folder = args.directory
    metadata = json.loads((folder / 'backup.json').read_text())
    counts = json.loads((folder / 'source-counts.json').read_text())
    archive = folder / 'stock.sql.gz'
    digest = hashlib.sha256()
    with archive.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    assert digest.hexdigest() == metadata['sha256'] == counts['sha256']
    assert archive.stat().st_size == metadata['bytes']
    assert query('SELECT VERSION();').startswith('8.0.')
    assert query("SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='stock';") == '0', 'Refusing to overwrite an existing database'
    # Exclusive marker prevents accidental reruns after partial failures.
    (folder / 'restore80.started').open('x').close()
    started = time.monotonic()
    query('CREATE DATABASE stock CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;')
    with (folder / 'restore80.error.log').open('wb') as errors:
        process = subprocess.Popen(CLIENT + ['--binary-mode=1', 'stock'], stdin=subprocess.PIPE,
                                   stdout=subprocess.DEVNULL, stderr=errors)
        try:
            with gzip.open(archive, 'rb') as source:
                for block in iter(lambda: source.read(1024 * 1024), b''):
                    process.stdin.write(block)
            process.stdin.close()
            assert process.wait() == 0, 'Restore failed; inspect the private error log'
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait()
    actual = {}
    checksums = {}
    for table, expected in counts['rows'].items():
        quoted = '`' + table.replace('`', '``') + '`'
        rows = int(query(f'SELECT COUNT(*) FROM stock.{quoted};'))
        assert rows == expected, f'Row count differs for {table}'
        actual[table] = rows
        checksum = query(f'CHECKSUM TABLE stock.{quoted} EXTENDED;').split('\t')[-1]
        assert checksum != 'NULL', f'Checksum unavailable for {table}'
        checksums[table] = checksum
    tables = query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='stock' ORDER BY TABLE_NAME;").splitlines()
    assert set(tables) == set(actual), 'Table set differs from the source snapshot'
    report = {'version': query('SELECT VERSION();'), 'sourceSha256': metadata['sha256'],
              'sourceCompletedAt': metadata['completedAt'], 'rows': actual, 'checksums': checksums,
              'seconds': round(time.monotonic() - started, 1)}
    temporary = folder / 'mysql80-validation.json.tmp'
    temporary.write_text(json.dumps(report, indent=2) + '\n')
    temporary.replace(folder / 'mysql80-validation.json')
    print(json.dumps({'state': 'mysql80-restored-and-counted', 'tables': len(actual),
                      'rows': sum(actual.values()), 'seconds': report['seconds']}), flush=True)


if __name__ == '__main__':
    main()
