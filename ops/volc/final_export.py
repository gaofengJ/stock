#!/usr/bin/env python3
"""Old-host cutover export, Python 3.5 compatible. Default is read-only preflight.

Never stops services or changes database settings. --export requires a root-owned,
short-lived approval file created only after the user's stop-write authorization.
"""
import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time

ROOT = Path('/opt/stock-migration')
APPROVAL = Path('/root/stock-cutover-approved.json')
DATABASES = ('stock', 'stock_test')
UNITS = ('stock-news-dispatch.timer', 'stock-news-dispatch.service')


def command(args, **kwargs):
    return subprocess.check_output(args, stderr=subprocess.PIPE, **kwargs)


def stream_hash(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024**2), b''):
            digest.update(block)
    return digest.hexdigest()


def validate_approval(path, window, now=None):
    if not re.match(r'^\d{8}T\d{6}Z$', window):
        raise ValueError('Invalid cutover window ID')
    if path.is_symlink() or not path.is_file():
        raise ValueError('Missing root approval file')
    stat = path.stat()
    if stat.st_uid != 0 or stat.st_mode & 0o077:
        raise ValueError('Approval must be root-owned mode 600')
    value = json.loads(path.read_text())
    now = time.time() if now is None else now
    if (value.get('windowId') != window or value.get('oldHost') != '47.99.111.167'
            or value.get('newHost') != '14.103.103.4' or value.get('stopWritesApproved') is not True
            or not isinstance(value.get('expiresAtEpoch'), (int, float))
            or not now < value['expiresAtEpoch'] <= now + 2 * 3600):
        raise ValueError('Approval is invalid, expired, or outside its bounded window')
    return value


@contextlib.contextmanager
def client_config():
    info = json.loads(command(['docker', 'inspect', 'stock-back']).decode())[0]
    if info['State']['Running']:
        args = ['docker', 'exec', 'stock-back', 'node', 'ops/release/database.cjs', 'client-config']
    else:
        mounts = [m for m in info['Mounts'] if m['Destination'] == '/run/stock/runtime.env']
        if len(mounts) != 1 or not Path(mounts[0]['Source']).is_file():
            raise ValueError('Missing original runtime mount; do not guess credentials')
        runtime_stat = Path(mounts[0]['Source']).stat()
        args = ['docker', 'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
                '--user', str(runtime_stat.st_uid) + ':' + str(runtime_stat.st_gid),
                '--security-opt', 'no-new-privileges', '--entrypoint', 'node',
                '--mount', 'type=bind,src=' + mounts[0]['Source'] + ',dst=/run/stock/runtime.env,readonly',
                '-e', 'APP_ENV_FILE=/run/stock/runtime.env', info['Image'],
                'ops/release/database.cjs', 'client-config']
    # stdout contains credentials; retain only in a private temporary file, never log it.
    with tempfile.NamedTemporaryFile(prefix='stock-cutover-client-', dir='/run') as config:
        config.write(command(args)); config.flush()
        yield ['mysql', '--defaults-extra-file=' + config.name, '-NB'], config.name, info


def query(client, sql):
    return command(client + ['-e', sql]).decode().rstrip('\r\n')


def preflight(client, info):
    read_only, super_read_only = query(client, 'SELECT @@global.read_only,@@global.super_read_only;').split('\t')
    units = {}
    for unit in UNITS:
        result = subprocess.Popen(['systemctl', 'is-active', unit], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, _ = result.communicate()
        units[unit] = stdout.decode().rstrip('\r\n')
    schemas = {}
    for db in DATABASES:
        tables = query(client, "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='" + db + "' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;").splitlines()
        non_innodb = int(query(client, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='" + db + "' AND (TABLE_TYPE<>'BASE TABLE' OR ENGINE<>'InnoDB');"))
        stored = int(query(client, "SELECT (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA='" + db + "')+(SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='" + db + "')+(SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA='" + db + "');"))
        external_fk = int(query(client, "SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA='" + db + "' AND REFERENCED_TABLE_SCHEMA IS NOT NULL AND REFERENCED_TABLE_SCHEMA<>'" + db + "';"))
        if not tables or non_innodb or stored or external_fk:
            raise ValueError('Schema needs separate review: ' + db)
        if any(not re.match(r'^[A-Za-z0-9_]+$', name) for name in tables):
            raise ValueError('Unsupported table identifier')
        schemas[db] = tables
    state = {'version': query(client, 'SELECT VERSION();'), 'backendRunning': info['State']['Running'],
             'readOnly': read_only == '1', 'superReadOnly': super_read_only == '1',
             'units': units, 'tables': {db: len(tables) for db, tables in schemas.items()},
             'freeBytes': shutil.disk_usage(str(ROOT)).free,
             'activeTransactions': int(query(client, 'SELECT COUNT(*) FROM information_schema.INNODB_TRX;'))}
    if not state['version'].startswith('5.7.'):
        raise ValueError('Unexpected source engine')
    return state, schemas


def require_quiesced(state):
    if (state['backendRunning'] or not state['readOnly'] or not state['superReadOnly']
            or state['activeTransactions'] or any(v not in ('inactive', 'failed') for v in state['units'].values())):
        raise ValueError('Old writers are not fully stopped; no export performed')
    if state['freeBytes'] < 8 * 1024**3:
        raise ValueError('At least 8 GiB source free space required')


def snapshot(client, credentials, db, folder, tables):
    final = folder / (db + '.sql')
    metadata = folder / (db + '.json')
    partial = folder / (db + '.sql.partial')
    if metadata.exists() or partial.exists() or final.exists():
        raise ValueError('Snapshot already exists; never overwrite or mix resumed cutover windows')
    started = time.monotonic(); digest = hashlib.sha256(); size = 0
    args = ['nice', '-n', '10', 'ionice', '-c', '2', '-n', '7', 'mysqldump',
            '--defaults-extra-file=' + credentials, '--single-transaction', '--skip-lock-tables',
            '--quick', '--hex-blob', '--routines', '--events', '--triggers', '--set-gtid-purged=OFF', db]
    with (folder / (db + '.stderr')).open('wb') as errors, partial.open('xb') as output:
        process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=errors)
        try:
            for block in iter(lambda: process.stdout.read(1024**2), b''):
                if shutil.disk_usage(str(folder)).free < 3 * 1024**3:
                    raise ValueError('Disk reserve reached; preserve incomplete export')
                output.write(block); digest.update(block); size += len(block)
                delay = size / (8 * 1024**2) - (time.monotonic() - started)
                if delay > 0:
                    time.sleep(delay)
            if process.wait() != 0:
                raise RuntimeError('Dump failed; see private server log')
            output.flush(); os.fsync(output.fileno())
        finally:
            if process.poll() is None:
                process.terminate(); process.wait()
    partial.rename(final)
    counts, checksums = {}, {}
    for table in tables:
        name = '`' + db + '`.`' + table + '`'
        counts[table] = int(query(client, 'SELECT COUNT(*) FROM ' + name + ';'))
        checksum = query(client, 'CHECKSUM TABLE ' + name + ' EXTENDED;').split('\t')[-1]
        if not checksum.isdigit():
            raise ValueError('Unavailable source checksum: ' + table)
        checksums[table] = checksum
    columns = query(client, "SELECT TABLE_NAME,COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,IS_NULLABLE,IFNULL(COLUMN_DEFAULT,'<NULL>'),IFNULL(COLLATION_NAME,'<NULL>'),EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='" + db + "' ORDER BY TABLE_NAME,ORDINAL_POSITION;")
    (folder / (db + '-columns.tsv')).write_text(columns + '\n')
    indexes = query(client, "SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,IFNULL(SUB_PART,'<NULL>'),INDEX_TYPE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='" + db + "' ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX;")
    (folder / (db + '-indexes.tsv')).write_text(indexes + '\n')
    defaults = query(client, "SELECT DEFAULT_CHARACTER_SET_NAME,DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='" + db + "';").split('\t')
    table_collations = dict(line.split('\t') for line in query(client, "SELECT TABLE_NAME,TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA='" + db + "' ORDER BY TABLE_NAME;").splitlines())
    result = {'database': db, 'bytes': size, 'sha256': digest.hexdigest(),
              'foreignKeys': query(client, "SELECT k.TABLE_NAME,k.CONSTRAINT_NAME,k.COLUMN_NAME,k.ORDINAL_POSITION,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,r.UPDATE_RULE,r.DELETE_RULE FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON k.CONSTRAINT_SCHEMA=r.CONSTRAINT_SCHEMA AND k.CONSTRAINT_NAME=r.CONSTRAINT_NAME AND k.TABLE_NAME=r.TABLE_NAME WHERE k.TABLE_SCHEMA='" + db + "' AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION;").splitlines(),
              'databaseCharset': defaults[0], 'databaseCollation': defaults[1], 'tableCollations': table_collations,
              'completedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
              'seconds': round(time.monotonic() - started, 1), 'rows': counts, 'checksums': checksums,
              'migrationHistory': query(client, 'SELECT name FROM `' + db + '`.migrations ORDER BY name;').splitlines(),
              'writersStopped': True, 'cutoverSnapshot': True}
    metadata.write_text(json.dumps(result, indent=2) + '\n')
    return result


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('--export', action='store_true')
    parser.add_argument('--window-id')
    args = parser.parse_args()
    if args.export:
        validate_approval(APPROVAL, args.window_id or '')
    with open('/var/lock/stock-back-release.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        with client_config() as (client, credentials, info):
            before, schemas = preflight(client, info)
            if not args.export:
                print(json.dumps(dict(before, mode='preflight-only', exported=False))); return
            require_quiesced(before)
            folder = ROOT / ('final-' + args.window_id)
            folder.mkdir(mode=0o700, exist_ok=False)
            result = {db: snapshot(client, credentials, db, folder, schemas[db]) for db in DATABASES}
            # Fail closed if a service, transaction, or write switch changed during export.
            after, _ = preflight(client, json.loads(command(['docker', 'inspect', 'stock-back']).decode())[0])
            after['freeBytes'] = before['freeBytes']  # Per-block reserve already enforced for the completed dump.
            require_quiesced(after)
            manifest = {'state': 'final-source-export-verified', 'windowId': args.window_id,
                        'oldHost': '47.99.111.167', 'newHost': '14.103.103.4',
                        'sourceVersion': before['version'], 'databases': result,
                        'sourceReadOnly': True, 'sourceSuperReadOnly': True, 'destinationImported': False}
            (folder / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
            print(json.dumps({'state': manifest['state'], 'windowId': args.window_id,
                              'databases': {db: {'bytes': row['bytes'], 'tables': len(row['rows'])} for db, row in result.items()}}))


if __name__ == '__main__':
    main()
