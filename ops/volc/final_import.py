#!/usr/bin/python3
"""Validate or restore the approved final source snapshot on the isolated new host.

Default validates manifests and payloads only. Never starts services or changes DNS.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
from final_export import DATABASES, validate_approval
from inspect_dump import inspect

ROOT = Path('/srv/stock/backups')
APPROVAL = Path('/root/stock-cutover-approved.json')
CLIENT = ['docker', 'exec', '-i', 'mufengtongxue-stock-db-mysql-1', 'mysql',
          '--defaults-extra-file=/run/secrets/mysql-root-client', '-NB']


def query(sql):
    return subprocess.check_output(CLIENT, input=sql.encode(), stderr=subprocess.PIPE).decode().rstrip('\r\n')


def validate_manifest(manifest, transfer, window):
    if (manifest.get('state') != 'final-source-export-verified' or manifest.get('windowId') != window
            or manifest.get('oldHost') != '47.99.111.167' or manifest.get('newHost') != '14.103.103.4'
            or manifest.get('sourceReadOnly') is not True or manifest.get('sourceSuperReadOnly') is not True
            or set(manifest.get('databases', {})) != set(DATABASES)
            or transfer.get('state') != 'final-transport-verified' or transfer.get('windowId') != window):
        raise ValueError('Missing final stopped-writer source or transport proof')
    for db in DATABASES:
        row = manifest['databases'][db]
        copy = transfer.get('databases', {}).get(db, {})
        if (row.get('database') != db or row.get('writersStopped') is not True or row.get('cutoverSnapshot') is not True
                or not isinstance(row.get('bytes'), int) or isinstance(row['bytes'], bool) or row['bytes'] <= 0
                or not re.fullmatch(r'[a-f0-9]{64}', row.get('sha256', ''))
                or not isinstance(row.get('rows'), dict) or not row['rows']
                or set(row.get('checksums', {})) != set(row['rows'])
                or not isinstance(row.get('migrationHistory'), list)
                or not isinstance(row.get('foreignKeys'), list)
                or row.get('databaseCharset') not in ('utf8mb4', 'utf8', 'utf8mb3', 'latin1')
                or not re.fullmatch(r'[a-z0-9_]+', row.get('databaseCollation', ''))
                or set(row.get('tableCollations', {})) != set(row['rows'])
                or any(not re.fullmatch(r'[a-z0-9_]+', c) for c in row.get('tableCollations', {}).values())
                or copy.get('sha256') != row['sha256'] or copy.get('bytes') != row['bytes']
                or copy.get('operatorCopyVerified') is not True or copy.get('newHostCopyVerified') is not True):
            raise ValueError('Snapshot or independent copy proof is invalid: ' + db)
        for table, count in row['rows'].items():
            if (not re.fullmatch(r'[A-Za-z0-9_]+', table) or not isinstance(count, int)
                    or isinstance(count, bool) or count < 0 or not str(row['checksums'][table]).isdigit()):
                raise ValueError('Invalid table verification record')
    return manifest['databases']


def normalize_columns(text):
    result = []
    for line in text.rstrip('\r\n').splitlines():
        fields = line.split('\t')
        if len(fields) != 8:
            raise ValueError('Unexpected column manifest format')
        # Integer display widths were removed in MySQL 8.0; retain all other type/default/nullability differences.
        if 'zerofill' not in fields[3]:
            fields[3] = re.sub(r'\b(tinyint|smallint|mediumint|int|bigint)\([0-9]+\)', r'\1', fields[3])
        # MySQL 8 reports expression defaults in EXTRA; this flag does not change the default expression.
        fields[7] = re.sub(r'\bDEFAULT_GENERATED\b', '', fields[7]).strip()
        fields[6] = re.sub(r'^utf8_', 'utf8mb3_', fields[6])
        result.append(fields)
    return result


def normalize_foreign_keys(lines):
    # All source tables are checked to be InnoDB. Its NO ACTION and RESTRICT are equivalent:
    # https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html
    result = []
    for line in lines:
        fields = line.split('\t')
        if len(fields) != 8:
            raise ValueError('Unexpected foreign key manifest format')
        fields[6:] = ['RESTRICT' if value == 'NO ACTION' else value for value in fields[6:]]
        result.append(fields)
    return result


def validate_payload(folder, rows):
    for db, metadata in rows.items():
        archive = folder / (db + '.sql')
        if archive.is_symlink() or not archive.is_file():
            raise ValueError('Missing regular SQL payload')
        result = inspect(archive, metadata)
        if result['rows'] != metadata['rows']:
            raise ValueError('SQL rows differ from the quiesced source: ' + db)
        with archive.open('rb') as stream:
            for line in stream:
                if line.lstrip().upper().startswith((b'USE ', b'CREATE DATABASE', b'DROP DATABASE', b'GRANT ', b'CREATE USER')) or line.startswith(b'/*!50003'):
                    raise ValueError('Cross-schema or stored-object SQL requires separate review')
        for suffix in ('-columns.tsv', '-indexes.tsv'):
            path = folder / (db + suffix)
            if not path.is_file() or path.is_symlink() or path.stat().st_size == 0:
                raise ValueError('Missing schema metadata: ' + db)
        normalize_columns((folder / (db + '-columns.tsv')).read_text())


def target_state():
    info = json.loads(subprocess.check_output(['docker', 'inspect', 'mufengtongxue-stock-back-1']))[0]
    return {'maintenance': Path('/srv/stock/state/maintenance').is_file(),
            'productionEnabled': Path('/etc/stock/production.enabled').exists(),
            'backendRunning': info['State']['Running'], 'version': query('SELECT VERSION();'),
            'freeBytes': shutil.disk_usage(ROOT).free}


def require_isolated(state):
    if (not state['maintenance'] or state['productionEnabled'] or state['backendRunning']
            or not state['version'].startswith('8.4.') or state['freeBytes'] < 4 * 1024**3):
        raise ValueError('Final import requires isolated stopped backend, MySQL 8.4, and 4 GiB reserve')


def verify_database(db, expected, folder):
    tables = query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='" + db + "' ORDER BY TABLE_NAME;").splitlines()
    if tables != sorted(expected['rows']):
        raise ValueError('Unexpected restored table list: ' + db)
    collations = dict(line.split('\t') for line in query("SELECT TABLE_NAME,TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA='" + db + "' ORDER BY TABLE_NAME;").splitlines())
    normalize = lambda c: re.sub(r'^utf8_', 'utf8mb3_', c)
    if {k: normalize(v) for k, v in collations.items()} != {k: normalize(v) for k, v in expected['tableCollations'].items()}:
        raise ValueError('Table collation mismatch: ' + db)
    for table in tables:
        name = '`' + db + '`.`' + table + '`'
        if int(query('SELECT COUNT(*) FROM ' + name + ';')) != expected['rows'][table]:
            raise ValueError('Row count mismatch: ' + db + '.' + table)
        if query('CHECKSUM TABLE ' + name + ' EXTENDED;').split('\t')[-1] != str(expected['checksums'][table]):
            raise ValueError('Content checksum mismatch: ' + db + '.' + table)
    columns = query("SELECT TABLE_NAME,COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,IS_NULLABLE,IFNULL(COLUMN_DEFAULT,'<NULL>'),IFNULL(COLLATION_NAME,'<NULL>'),EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='" + db + "' ORDER BY TABLE_NAME,ORDINAL_POSITION;")
    if normalize_columns(columns) != normalize_columns((folder / (db + '-columns.tsv')).read_text()):
        raise ValueError('Column mismatch: ' + db)
    indexes = query("SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,IFNULL(SUB_PART,'<NULL>'),INDEX_TYPE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='" + db + "' ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX;")
    if indexes != (folder / (db + '-indexes.tsv')).read_text().strip():
        raise ValueError('Index mismatch: ' + db)
    foreign_keys = query("SELECT k.TABLE_NAME,k.CONSTRAINT_NAME,k.COLUMN_NAME,k.ORDINAL_POSITION,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,r.UPDATE_RULE,r.DELETE_RULE FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON k.CONSTRAINT_SCHEMA=r.CONSTRAINT_SCHEMA AND k.CONSTRAINT_NAME=r.CONSTRAINT_NAME AND k.TABLE_NAME=r.TABLE_NAME WHERE k.TABLE_SCHEMA='" + db + "' AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION;").splitlines()
    if normalize_foreign_keys(foreign_keys) != normalize_foreign_keys(expected['foreignKeys']):
        raise ValueError('Foreign key mismatch: ' + db)
    if query('SELECT name FROM `' + db + '`.migrations ORDER BY name;').splitlines() != expected['migrationHistory']:
        raise ValueError('Migration history mismatch: ' + db)
    return {'tables': len(tables), 'rows': sum(expected['rows'].values()),
            'countsMatch': True, 'checksumsMatch': True, 'columnsMatch': True, 'indexesMatch': True, 'collationsMatch': True, 'foreignKeysMatch': True}


def restore(db, expected, folder):
    started = time.monotonic()
    # The target contains disposable rehearsal clones; original source and off-host final SQL remain intact.
    query('DROP DATABASE IF EXISTS `' + db + '`; CREATE DATABASE `' + db + '` CHARACTER SET ' + expected['databaseCharset'] + ' COLLATE ' + expected['databaseCollation'] + ';')
    with (folder / (db + '-restore.stderr')).open('wb') as errors, (folder / (db + '.sql')).open('rb') as sql:
        process = subprocess.Popen(CLIENT + ['--binary-mode=1', "--init-command=SET SESSION sql_log_bin=0,default_collation_for_utf8mb4='utf8mb4_general_ci'", db],
                                   stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=errors)
        try:
            for block in iter(lambda: sql.read(1024**2), b''):
                if shutil.disk_usage(ROOT).free < 2 * 1024**3:
                    raise ValueError('Disk reserve reached; preserve failed clone and source files')
                process.stdin.write(block)
            process.stdin.close()
            if process.wait() != 0:
                raise ValueError('Final import failed: ' + db)
        finally:
            if process.poll() is None:
                process.terminate(); process.wait()
    result = verify_database(db, expected, folder)
    result['seconds'] = round(time.monotonic() - started, 1)
    return result


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('--window-id', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch(r'\d{8}T\d{6}Z', args.window_id):
        parser.error('Invalid window ID')
    if args.apply:
        validate_approval(APPROVAL, args.window_id)
    folder = ROOT / ('final-' + args.window_id)
    with open('/run/lock/stock-maintenance.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        rows = validate_manifest(json.loads((folder / 'manifest.json').read_text()),
                                 json.loads((folder / 'transport-verification.json').read_text()), args.window_id)
        validate_payload(folder, rows)
        if not args.apply:
            print(json.dumps({'state': 'final-payload-validated', 'databaseChanged': False})); return
        require_isolated(target_state())
        marker = folder / 'import-started.json'
        if marker.exists():
            raise ValueError('Import already attempted; inspect state instead of overwriting')
        # Approval may have expired while validating a large payload.
        validate_approval(APPROVAL, args.window_id)
        marker.write_text(json.dumps({'windowId': args.window_id, 'startedAtEpoch': time.time()}))
        results = {}
        for db in DATABASES:
            results[db] = restore(db, rows[db], folder)
            (folder / (db + '-import-validation.json')).write_text(json.dumps(results[db], indent=2) + '\n')
        result = {'state': 'final-databases-restored-and-verified', 'windowId': args.window_id,
                  'databases': results, 'productionEnabled': False, 'backendStarted': False,
                  'dnsChanged': False, 'businessAcceptancePending': True}
        (folder / 'import-validation.json').write_text(json.dumps(result, indent=2) + '\n')
        print(json.dumps(result))


if __name__ == '__main__':
    main()
