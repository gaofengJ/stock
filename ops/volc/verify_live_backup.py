#!/usr/bin/python3
"""Verify a live backup in a disposable, network-isolated MySQL container.

No production database credentials or data directories are mounted. The dump is
replayed in full, then every dumped table is counted and integrity-checked. Counts
are evidence of the restored snapshot, not a comparison to a changing live DB.
"""
import argparse
import datetime as dt
import fcntl
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import uuid

ROOT = Path('/srv/stock/backups/daily')
WORK = Path('/srv/stock/backups/verification')
PRODUCTION = 'mufengtongxue-stock-db-mysql-1'
MIN_FREE = 2 * 1024**3


def run(args, **kwargs):
    return subprocess.check_output(args, stderr=subprocess.PIPE, timeout=kwargs.pop('timeout', 120), **kwargs).decode().strip()


def backup_info(folder):
    if folder.is_symlink() or folder.resolve().parent != ROOT or not re.fullmatch(r'\d{8}T\d{6}Z', folder.name):
        raise ValueError('Only an existing daily backup is allowed')
    archive = folder / 'stock.sql.gz'
    metadata = json.loads((folder / 'backup.json').read_text())
    if archive.is_symlink() or metadata.get('database') != 'stock' or not str(metadata.get('version')).startswith('8.4.') or metadata.get('singleTransaction') is not True:
        raise ValueError('Invalid backup metadata')
    if archive.stat().st_size != metadata['bytes']:
        raise ValueError('Archive size differs')
    with archive.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != metadata['sha256']:
            raise ValueError('Archive checksum differs')
    tables = set()
    with gzip.open(archive, 'rb') as stream:
        for line in stream:
            match = re.match(rb'CREATE TABLE `([A-Za-z0-9_]+)` \(', line)
            if match:
                tables.add(match[1].decode())
    if not tables:
        raise ValueError('No table definitions in backup')
    return archive, metadata, tables


def check_tables(client, tables, progress):
    rows, checksums = {}, {}
    for table in sorted(tables):
        qualified = '`stock`.`' + table + '`'
        def query(sql):
            return run(client, input=sql.encode(), timeout=900)
        check = query('CHECK TABLE ' + qualified + ';').splitlines()
        if not check or any(not line.endswith('\tstatus\tOK') for line in check):
            raise ValueError('Restored table integrity failed: ' + table)
        rows[table] = int(query('SELECT COUNT(*) FROM ' + qualified + ';'))
        checksums[table] = query('CHECKSUM TABLE ' + qualified + ' EXTENDED;').split('\t')[-1]
        if checksums[table] == 'NULL':
            raise ValueError('Restored table checksum unavailable: ' + table)
        progress('checking', tables=len(tables), checked=len(rows), currentTable=table)
    return rows, checksums


def verify(folder):
    os.umask(0o077)
    archive, metadata, tables = backup_info(folder)
    if (folder / 'restore-validation.json').exists():
        raise ValueError('Existing restore proof is preserved; choose an unverified backup')
    if shutil.disk_usage(ROOT).free < 8 * 1024**3:
        raise ValueError('Less than 8 GiB free for isolated restore')
    identity = 'verify-' + uuid.uuid4().hex
    name = 'stock-backup-' + identity
    WORK.mkdir(mode=0o700, exist_ok=True)
    work = WORK / identity
    work.mkdir(mode=0o700)
    data = work / 'mysql'
    data.mkdir(mode=0o700)
    state = json.loads(run(['docker', 'inspect', PRODUCTION]))[0]
    image = state['Image']
    created = False
    success = False
    started = time.monotonic()
    client = ['docker', 'exec', '-i', name, 'mysql', '-uroot', '-NB', '--binary-mode=1']

    def query(sql):
        return run(client, input=sql.encode())

    def progress(phase, **extra):
        value = {'phase': phase, 'container': name, 'backup': folder.name, **extra}
        (work / 'progress.json').write_text(json.dumps(value) + '\n')
        print(json.dumps(value), flush=True)

    try:
        run(['docker', 'run', '-d', '--name', name, '--label', 'stock.backup.verify=' + identity,
             '--network', 'none', '--memory', '1g', '--memory-swap', '1g', '--cpus', '1', '--pids-limit', '256',
             '--log-driver', 'local', '--log-opt', 'max-size=5m', '--log-opt', 'max-file=2',
             '--mount', 'type=bind,src=' + str(data) + ',dst=/var/lib/mysql',
             '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', image, '--skip-log-bin', '--event-scheduler=OFF',
             '--innodb-buffer-pool-size=128M', '--innodb-redo-log-capacity=128M', '--innodb-flush-log-at-trx-commit=2'])
        created = True
        progress('initializing')
        for _ in range(120):
            check = subprocess.run(['docker', 'exec', name, 'mysqladmin', '-uroot', 'ping', '--silent'], capture_output=True)
            if check.returncode == 0:
                # Entrypoint starts a temporary bootstrap server before its final server.
                command = run(['docker', 'exec', name, 'cat', '/proc/1/comm'])
                if command == 'mysqld':
                    break
            time.sleep(2)
        else:
            raise TimeoutError('Isolated database initialization timed out')
        if query('SELECT VERSION();') != metadata['version']:
            raise ValueError('Verification engine differs from backup')
        query('CREATE DATABASE stock CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;')
        progress('restoring', tables=len(tables))
        with (work / 'restore.stderr').open('wb') as errors:
            process = subprocess.Popen(client + ['stock'], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=errors)
            try:
                with gzip.open(archive, 'rb') as stream:
                    for block in iter(lambda: stream.read(1024**2), b''):
                        if shutil.disk_usage(ROOT).free < MIN_FREE:
                            raise RuntimeError('Restore disk reserve reached; production untouched')
                        process.stdin.write(block)
                process.stdin.close()
                if process.wait(timeout=1800) != 0:
                    raise RuntimeError('Isolated SQL restore failed; preserve diagnostics')
            finally:
                if process.poll() is None:
                    process.terminate()
                    process.wait(timeout=30)
        restored = set(query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='stock' AND TABLE_TYPE='BASE TABLE';").splitlines())
        if restored != tables:
            raise ValueError('Restored table set differs from dump')
        progress('checking', tables=len(tables))
        rows, checksums = check_tables(client, tables, progress)
        result = {'state': 'backup-restore-verified', 'sha256': metadata['sha256'], 'rows': rows,
                  'checksums': checksums, 'version': metadata['version'], 'isolatedContainer': True,
                  'productionModified': False, 'liveComparison': False, 'tableSetMatchesDump': True,
                  'completedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
                  'seconds': round(time.monotonic() - started, 1), 'offHostVerified': False}
        with (folder / 'restore-validation.json').open('x') as output:
            json.dump(result, output, indent=2)
        success = True
        progress('verified', tables=len(rows), rows=sum(rows.values()), seconds=result['seconds'])
    finally:
        if created:
            actual = json.loads(run(['docker', 'inspect', name]))[0]
            if actual['Config'].get('Labels', {}).get('stock.backup.verify') != identity:
                raise ValueError('Verification ownership changed; retain everything')
            run(['docker', 'stop', '--time', '30', name], timeout=60)
            if success:
                run(['docker', 'rm', name])
                if work.resolve().parent != WORK.resolve() or data.is_symlink() or data.resolve().parent != work.resolve():
                    raise ValueError('Unexpected verification directory; preserve it')
                shutil.rmtree(data)
                progress('complete', verificationDataRemoved=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('backup', type=Path)
    args = parser.parse_args()
    with open('/run/lock/stock-maintenance.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        verify(args.backup)


if __name__ == '__main__':
    main()
