#!/usr/bin/python3
"""Preserve stock_test via an isolated 5.7 dump -> 8.0 -> 8.4 logical restore.

Never refresh from stock here: the old test database must be preserved first.
All writes target absent, new-host-only test schemas/directories.
"""
import gzip
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

from inspect_dump import inspect

ROOT = Path('/srv/stock/backups/test-rehearsal-20261014')
DATA = Path('/srv/stock/mysql80-test-rehearsal')
NAME = 'mufengtongxue-mysql80-test-rehearsal'
DEPLOY = Path('/opt/stock/deploy')
OLD = ['docker', 'exec', '-i', NAME, 'mysql',
       '--defaults-extra-file=/run/secrets/mysql-root.cnf', '-NB']
COMPOSE = ['docker', 'compose', '--env-file', str(DEPLOY / 'database.env'),
           '-f', str(DEPLOY / 'compose.database.yaml')]
NEW = COMPOSE + ['exec', '-T', 'mysql', 'mysql',
                 '--defaults-extra-file=/run/secrets/mysql-root-client', '-NB']


def query(client, sql):
    return subprocess.check_output(client, input=sql.encode()).decode().strip()


def snapshot(client):
    tables = query(client, "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='stock_test' ORDER BY TABLE_NAME;").splitlines()
    rows, checksums = {}, {}
    for table in tables:
        quoted = '`' + table.replace('`', '``') + '`'
        rows[table] = int(query(client, f'SELECT COUNT(*) FROM stock_test.{quoted};'))
        checksums[table] = query(client, f'CHECKSUM TABLE stock_test.{quoted} EXTENDED;').split('\t')[-1]
        assert checksums[table] != 'NULL'
    columns = query(client, "SELECT TABLE_NAME,COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,IS_NULLABLE,IFNULL(COLUMN_DEFAULT,'<NULL>'),IFNULL(COLLATION_NAME,'<NULL>'),EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='stock_test' ORDER BY TABLE_NAME,ORDINAL_POSITION;")
    return {'rows': rows, 'checksums': checksums, 'columns': columns}


def main():
    os.umask(0o077)
    assert not Path('/etc/stock/production.enabled').exists()
    assert (ROOT.parent / 'rehearsal-20261014/mysql84-validation.json').exists()
    assert shutil.disk_usage(ROOT).free > 8 * 1024**3
    assert query(NEW, 'SELECT VERSION();') == '8.4.11'
    assert query(NEW, "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='stock_test';") == '0'
    metadata = json.loads((ROOT / 'backup.json').read_text())
    assert metadata['database'] == 'stock_test'
    archive = ROOT / 'stock_test.sql.gz'
    source = inspect(archive, metadata)
    (ROOT / 'source-counts.json').write_text(json.dumps(source, indent=2) + '\n')
    (ROOT / 'restore.started').open('x').close()
    DATA.mkdir(mode=0o700)  # Never reuse an existing intermediate database.
    image = json.loads(subprocess.check_output(['docker', 'image', 'inspect', 'mysql:8.0']))[0]
    expected = Path('/root/migration-tools/mysql-8.0-image').read_text().split()[1]
    if image['Id'] != expected:
        manifest = json.loads(subprocess.check_output(['ctr', '--namespace', 'moby', 'content', 'get', image['Id']]))
        assert manifest['config']['digest'] == expected
    subprocess.run(['docker', 'run', '-d', '--name', NAME, '--network', 'mufengtongxue-stock-upgrade',
                    '--memory', '1536m', '--log-driver', 'local', '--log-opt', 'max-size=20m', '--log-opt', 'max-file=5',
                    '-e', 'MYSQL_ROOT_PASSWORD_FILE=/run/secrets/mysql-root-password',
                    '-v', str(DATA) + ':/var/lib/mysql',
                    '-v', '/etc/stock/mysql-root-password:/run/secrets/mysql-root-password:ro',
                    '-v', '/etc/stock/mysql-root.cnf:/run/secrets/mysql-root.cnf:ro',
                    image['Id'], '--character-set-server=utf8mb4', '--collation-server=utf8mb4_general_ci',
                    '--innodb-buffer-pool-size=512M', '--max-allowed-packet=64M', '--skip-log-bin'], check=True)
    for _ in range(120):
        result = subprocess.run(OLD, input=b'SELECT VERSION(),@@global.skip_networking;', stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        if result.returncode == 0 and result.stdout.strip() == b'8.0.46\t0':
            break
        time.sleep(5)
    else:
        raise TimeoutError('Intermediate test MySQL did not start')
    query(OLD, "DROP USER IF EXISTS 'root'@'%'; CREATE DATABASE stock_test CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;")
    with (ROOT / 'restore80.stderr').open('wb') as errors:
        restore = subprocess.Popen(OLD + ['--binary-mode=1', 'stock_test'], stdin=subprocess.PIPE, stderr=errors)
        try:
            with gzip.open(archive, 'rb') as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b''):
                    assert shutil.disk_usage(ROOT).free > 4 * 1024**3
                    restore.stdin.write(block)
            restore.stdin.close()
            assert restore.wait() == 0, '5.7 test SQL could not restore to 8.0'
        finally:
            if restore.poll() is None:
                restore.terminate()
                restore.wait()
    before = snapshot(OLD)
    assert before['rows'] == source['rows'], 'Test source row counts differ'
    (ROOT / 'mysql80-validation.json').write_text(json.dumps(before, indent=2) + '\n')
    assert shutil.disk_usage(ROOT).free > 6 * 1024**3
    query(NEW, 'CREATE DATABASE stock_test CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;')
    dump_command = ['docker', 'exec', NAME, 'mysqldump', '--defaults-extra-file=/run/secrets/mysql-root.cnf',
                    '--single-transaction', '--skip-lock-tables', '--quick', '--hex-blob', '--routines', '--events',
                    '--triggers', '--set-gtid-purged=OFF', '--no-tablespaces', '--column-statistics=0', 'stock_test']
    with (ROOT / 'dump80.stderr').open('wb') as dump_errors, (ROOT / 'restore84.stderr').open('wb') as restore_errors:
        dump = subprocess.Popen(dump_command, stdout=subprocess.PIPE, stderr=dump_errors)
        restore = subprocess.Popen(NEW + ['--binary-mode=1', 'stock_test'], stdin=dump.stdout, stderr=restore_errors)
        dump.stdout.close()
        try:
            assert restore.wait() == 0 and dump.wait() == 0, '8.0 -> 8.4 logical test restore failed'
        finally:
            for process in (dump, restore):
                if process.poll() is None:
                    process.terminate()
                    process.wait()
    after = snapshot(NEW)
    assert before == after, 'Test data or column definitions changed'
    report = {'sourceSha256': metadata['sha256'], 'version': '8.4.11', 'tables': len(after['rows']),
              'rows': after['rows'], 'checksums': after['checksums'], 'columnsMatch': True,
              'productionEnabled': False}
    temp = ROOT / 'mysql84-validation.json.tmp'
    temp.write_text(json.dumps(report, indent=2) + '\n')
    temp.replace(ROOT / 'mysql84-validation.json')
    subprocess.run(['docker', 'stop', '--time', '120', NAME], check=True)
    print(json.dumps({'state': 'test-database-restored-and-verified', 'tables': report['tables'],
                      'rows': sum(report['rows'].values()), 'productionEnabled': False}), flush=True)


if __name__ == '__main__':
    main()
