#!/usr/bin/python3
"""Root-owned operational summary. No business rows, credentials, logs or backup files."""
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import tempfile
from backup_health import assess, ROOT, systemctl
import shutil

DEST = Path('/srv/stock/deploy-status/health.json')


def snapshot():
    now = dt.datetime.now(dt.timezone.utc)
    production = Path('/etc/stock/production.enabled').is_file()
    backup = assess(ROOT, now, shutil.disk_usage(ROOT).free,
                    systemctl('show', 'stock-backup.service', '-p', 'Result', '--value'),
                    systemctl('is-enabled', 'stock-backup.timer') == 'enabled')
    states = {}
    for role, name in [('backend', 'mufengtongxue-stock-back-1'), ('database', 'mufengtongxue-stock-db-mysql-1')]:
        try:
            result = json.loads(subprocess.check_output(['docker', 'inspect', '--format', '{{json .State}}', name], stderr=subprocess.DEVNULL, timeout=10))
            states[role] = result.get('Status') == 'running' and result.get('Health', {}).get('Status') == 'healthy'
        except (ValueError, subprocess.SubprocessError):
            states[role] = False
    # Destination and proof writer are not configured yet. Do not equate one historical copy with ongoing protection.
    return {'checkedAt': now.isoformat(), 'production': production,
            'maintenance': Path('/srv/stock/state/maintenance').exists(),
            'backendHealthy': states['backend'], 'databaseHealthy': states['database'],
            'backupHealthy': backup['healthy'], 'backupIssues': backup['issues'],
            'recurringOffhostVerified': False}


def write(report):
    fd, name = tempfile.mkstemp(prefix='.health-', dir=DEST.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(report, stream); stream.write('\n'); stream.flush(); os.fsync(stream.fileno())
        os.chmod(name, 0o644)
        os.replace(name, DEST)
    finally:
        if os.path.exists(name): os.unlink(name)


if __name__ == '__main__':
    write(snapshot())
