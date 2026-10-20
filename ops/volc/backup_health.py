#!/usr/bin/python3
"""Report backup freshness/failure without logging database contents or secrets."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path('/srv/stock/backups/daily')
STATE = Path('/srv/stock/state/backup-health.json')
RESERVE = 6 * 1024**3
MAX_AGE = 36 * 3600


def assess(root, now, free_bytes, service_result, timer_enabled):
    issues = []
    completed = []
    for folder in sorted(root.glob('????????T??????Z')):
        if not folder.is_dir():
            continue
        try:
            stamp = dt.datetime.strptime(folder.name, '%Y%m%dT%H%M%SZ').replace(tzinfo=dt.timezone.utc)
            if not (folder / 'backup.json').exists():
                if (now - stamp).total_seconds() > 3600:
                    issues.append('incomplete_backup:' + folder.name)
                continue
            record = json.loads((folder / 'backup.json').read_text())
            finished = dt.datetime.fromisoformat(record['completedAt'])
            archive = folder / 'stock.sql.gz'
            if (record['database'] != 'stock' or not record['version'].startswith('8.4.')
                    or record['singleTransaction'] is not True
                    or not re.fullmatch(r'[0-9a-f]{64}', record['sha256'])
                    or not isinstance(record['bytes'], int) or record['bytes'] <= 0
                    or not archive.is_file() or archive.is_symlink()
                    or archive.stat().st_size != record['bytes']
                    or finished.utcoffset() is None or finished > now):
                raise ValueError('invalid backup metadata')
            completed.append((finished, folder.name))
        except (KeyError, ValueError, TypeError, AttributeError, OSError):
            issues.append('invalid_backup:' + folder.name)
    latest = max(completed) if completed else None
    if not latest:
        issues.append('no_complete_backup')
    elif (now - latest[0]).total_seconds() > MAX_AGE:
        issues.append('backup_older_than_36h')
    if free_bytes < RESERVE:
        issues.append('less_than_6GiB_free')
    if service_result != 'success':
        issues.append('backup_service_failed_or_unknown')
    if not timer_enabled:
        issues.append('backup_timer_disabled_or_unknown')
    return {'checkedAt': now.isoformat(), 'healthy': not issues, 'issues': issues,
            'latestBackup': latest[1] if latest else None, 'freeBytes': free_bytes,
            'contentChecksumRechecked': False, 'recurringOffhostBackupConfigured': False}


def systemctl(*args):
    result = subprocess.run(['systemctl', *args], capture_output=True, text=True, timeout=10)
    return result.stdout.strip() if result.returncode == 0 else 'unknown'


def write_report(report):
    STATE.parent.mkdir(parents=True, exist_ok=True)
    fd, path = tempfile.mkstemp(prefix='.backup-health-', dir=STATE.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(report, stream, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(path, STATE)
    finally:
        if os.path.exists(path):
            os.unlink(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--audit', action='store_true', help='Read-only audit even before cutover; does not write status')
    args = parser.parse_args()
    os.umask(0o077)
    enabled = Path('/etc/stock/production.enabled').is_file()
    if not enabled and not args.audit:
        print(json.dumps({'state': 'deferred_until_cutover'}))
        return 0
    report = assess(ROOT, dt.datetime.now(dt.timezone.utc), shutil.disk_usage(ROOT).free,
                    systemctl('show', 'stock-backup.service', '-p', 'Result', '--value'),
                    systemctl('is-enabled', 'stock-backup.timer') == 'enabled')
    report['mode'] = 'audit' if args.audit else 'production'
    if not args.audit:
        write_report(report)
    print(json.dumps(report))
    return 0 if report['healthy'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
