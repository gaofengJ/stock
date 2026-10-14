#!/usr/bin/python3
"""Upgrade a validated, cold copy of the isolated MySQL 8.0 rehearsal to 8.4."""
import json
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import time

STAGE = 'mufengtongxue-mysql80-rehearsal'
DEPLOY = Path('/opt/stock/deploy')
BACKUP = Path('/srv/stock/backups/rehearsal-20261014')
SOURCE = Path('/srv/stock/mysql80-rehearsal')
TARGET = Path('/srv/stock/mysql')
OLD_CLIENT = ['docker', 'exec', '-i', STAGE, 'mysql',
              '--defaults-extra-file=/run/secrets/mysql-root.cnf', '-NB']


def output(command, **kwargs):
    return subprocess.check_output(command, **kwargs).decode().strip()


def main():
    os.umask(0o077)
    before = json.loads((BACKUP / 'mysql80-validation.json').read_text())
    assert before['sourceSha256'] == json.loads((BACKUP / 'backup.json').read_text())['sha256']
    assert not list(TARGET.iterdir()), 'Target directory must be empty; do not overwrite a database'
    assert not (Path('/etc/stock') / 'production.enabled').exists()
    info = json.loads(output(['docker', 'image', 'inspect', 'mysql:8.4']))[0]
    expected = Path('/root/migration-tools/mysql-8.4-image').read_text().split()[1]
    if info['Id'] != expected:
        manifest = json.loads(output(['ctr', '--namespace', 'moby', 'content', 'get', info['Id']]))
        assert manifest['config']['digest'] == expected
    image = info['Id']
    checker = ('util.check_for_server_upgrade({"host":"127.0.0.1","port":3306,'
               '"user":"stock_upgrade","password":open("/run/secrets/mysql-upgrade-password").read().strip()},'
               '{"targetVersion":"8.4.10","outputFormat":"JSON"})')
    command = ['docker', 'run', '--rm', '--entrypoint', 'mysqlsh', '--network', 'container:' + STAGE,
               '--mount', 'type=bind,source=/etc/stock/mysql-upgrade-password,target=/run/secrets/mysql-upgrade-password,readonly',
               image, '--no-defaults', '--py', '-e', checker]
    # Bundled Shell is 8.4.10; it checks the 8.4 transition. Target server is 8.4.11.
    with (BACKUP / 'upgrade-check.json').open('wb') as stdout, (BACKUP / 'upgrade-check.stderr').open('wb') as stderr:
        subprocess.run(command, stdout=stdout, stderr=stderr, check=True)
    check = json.loads((BACKUP / 'upgrade-check.json').read_text())
    assert check['errorCount'] == 0, 'Upgrade checker found incompatible objects'
    for item in check['checksPerformed']:
        assert item['status'] == 'OK', 'Upgrade check could not complete: ' + item['id']
        # These defaults and the root SET_USER_ID removal were reviewed in the empty-stage check.
        if item.get('detectedProblems') and item['id'] not in ('sysVarsNewDefaults', 'invalidPrivileges'):
            raise RuntimeError('Additional upgrade warning needs review: ' + item['id'])
    assert not check.get('manualChecks'), 'Manual upgrade checks need review'
    # Wait for the other large transfer before evaluating the 40 GiB disk budget.
    content = Path('/root/migration-tools/content')
    deadline = time.monotonic() + 2 * 3600
    while not (content / 'rsshub-server-image-id').exists():
        if time.monotonic() > deadline:
            raise TimeoutError('Verified content images are not ready')
        time.sleep(30)
    # These exact archives have been hash-checked and loaded, and originals remain on the operator machine.
    for archive in [content / 'content.tar.zst', Path('/root/migration-tools/mysql.tar.zst')]:
        archive.unlink(missing_ok=True)
    for archive in Path('/root/migration-tools/application').glob('*/*.tar.zst'):
        archive.unlink()
    assert shutil.disk_usage(TARGET).free > 8 * 1024**3, 'Insufficient disk reserve for the cold backup'
    schema_sql = ("SELECT TABLE_NAME,COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,IS_NULLABLE,"
                  "IFNULL(COLUMN_DEFAULT,'<NULL>'),IFNULL(COLLATION_NAME,'<NULL>'),EXTRA "
                  "FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='stock' ORDER BY TABLE_NAME,ORDINAL_POSITION;")
    schema = output(OLD_CLIENT, input=schema_sql.encode())
    (BACKUP / 'mysql80-columns.tsv').write_text(schema + '\n')
    subprocess.run(OLD_CLIENT, input=b"DROP USER 'stock_upgrade'@'127.0.0.1'; SET GLOBAL innodb_fast_shutdown=0;", check=True)
    subprocess.run(['docker', 'stop', '--time', '180', STAGE], check=True)
    state = json.loads(output(['docker', 'inspect', STAGE]))[0]['State']
    assert not state['Running'] and state['ExitCode'] == 0, 'MySQL 8.0 did not stop cleanly'
    # Retain a byte-checked compressed cold copy, instead of two expanded databases on a 40 GiB disk.
    archive = BACKUP / 'mysql80-cold.tar.zst'
    digest = hashlib.sha256()
    with archive.open('xb') as saved:
        tar = subprocess.Popen(['tar', '-C', str(SOURCE), '-cf', '-', '.'], stdout=subprocess.PIPE)
        compress = subprocess.Popen(['zstd', '-T2', '-3'], stdin=tar.stdout, stdout=subprocess.PIPE)
        tar.stdout.close()
        try:
            for block in iter(lambda: compress.stdout.read(1024 * 1024), b''):
                assert shutil.disk_usage(BACKUP).free > 8 * 1024**3, 'Cold backup reached the disk reserve'
                digest.update(block)
                saved.write(block)
            assert compress.wait() == 0 and tar.wait() == 0, 'Cold backup failed'
            saved.flush()
            os.fsync(saved.fileno())
        finally:
            for process in (compress, tar):
                if process.poll() is None:
                    process.terminate()
                    process.wait()
    decompress = subprocess.Popen(['zstd', '-dc', str(archive)], stdout=subprocess.PIPE)
    compare = subprocess.run(['tar', '-C', str(SOURCE), '--compare', '-f', '-'], stdin=decompress.stdout)
    decompress.stdout.close()
    assert compare.returncode == 0 and decompress.wait() == 0, 'Cold archive differs from the stopped database'
    (BACKUP / 'mysql80-cold.json').write_text(json.dumps({'sha256': digest.hexdigest(), 'bytes': archive.stat().st_size, 'comparedToColdSource': True}) + '\n')
    subprocess.run(['docker', 'rm', STAGE], check=True)
    TARGET.rmdir()  # The initial empty target only; never delete database files.
    SOURCE.rename(TARGET)
    env = DEPLOY / 'database.env'
    env.write_text('MYSQL_IMAGE=' + image + '\n')
    compose = ['docker', 'compose', '--env-file', str(env), '-f', str(DEPLOY / 'compose.database.yaml')]
    subprocess.run(compose + ['up', '-d', 'mysql'], check=True)
    cid = output(compose + ['ps', '-q', 'mysql'])
    assert cid
    for _ in range(180):
        state = json.loads(output(['docker', 'inspect', cid]))[0]['State']
        if state.get('Health', {}).get('Status') == 'healthy':
            break
        if state.get('Status') in ('exited', 'dead'):
            raise RuntimeError('MySQL 8.4 exited; verified 8.0 cold archive is retained')
        time.sleep(5)
    else:
        raise TimeoutError('MySQL 8.4 did not become healthy')
    client = compose + ['exec', '-T', 'mysql', 'mysql', '--defaults-extra-file=/run/secrets/mysql-root-client', '-NB']
    version = output(client, input=b'SELECT VERSION();')
    assert version == '8.4.11', 'Unexpected target MySQL patch version'
    after_schema = output(client, input=schema_sql.encode())
    (BACKUP / 'mysql84-columns.tsv').write_text(after_schema + '\n')
    assert schema == after_schema, 'Column definitions changed; review before enabling an application'
    counts = {}
    checksums = {}
    for table, expected_count in before['rows'].items():
        quoted = '`' + table.replace('`', '``') + '`'
        count = int(output(client, input=f'SELECT COUNT(*) FROM stock.{quoted};'.encode()))
        checksum = output(client, input=f'CHECKSUM TABLE stock.{quoted} EXTENDED;'.encode()).split('\t')[-1]
        assert count == expected_count, 'Row count mismatch: ' + table
        assert checksum == before['checksums'][table], 'Content checksum mismatch: ' + table
        counts[table] = count
        checksums[table] = checksum
    history = output(client, input=b'SELECT name FROM stock.migrations ORDER BY name;').splitlines()
    assert history == sorted(json.loads((BACKUP / 'schema.json').read_text())['migrationHistory'])
    report = {'version': version, 'sourceSha256': before['sourceSha256'],
              'sourceCompletedAt': before['sourceCompletedAt'], 'rows': counts,
              'checksums': checksums, 'columnsMatch': True, 'migrationHistory': history,
              'checkerTarget': '8.4.10', 'productionEnabled': False}
    temporary = BACKUP / 'mysql84-validation.json.tmp'
    temporary.write_text(json.dumps(report, indent=2) + '\n')
    temporary.replace(BACKUP / 'mysql84-validation.json')
    print(json.dumps({'state': 'mysql84-validated', 'tables': len(counts), 'rows': sum(counts.values()),
                      'columnsMatch': True, 'checksumsMatch': True, 'productionEnabled': False}), flush=True)


if __name__ == '__main__':
    main()
