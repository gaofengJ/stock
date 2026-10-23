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


def operational_issues(data, dispatch, now):
    issues = []
    if not data or not data.get('expectedTradeDate') or not data.get('latestTradeDate'):
        issues.append('data_freshness_unavailable')
    elif data['latestTradeDate'] < data['expectedTradeDate']:
        issues.append('daily_data_stale')
    if data.get('staleNewsSources'):
        issues.append('news_sources_stale')
    age = now.timestamp() - dispatch.get('successfulCheckAt', 0)
    if not 0 <= age <= 30 * 60:
        issues.append('health_dispatch_stale')
    if dispatch.get('outcome') == 'blocked_stale_active':
        issues.append('health_workflow_stalled')
    return issues


def data_freshness():
    # Only dates and source codes leave the database. 22:00 CST allows the
    # scheduled 20:30 daily sync to finish before declaring today's data stale.
    sql = """SELECT JSON_OBJECT(
      'latestTradeDate',(SELECT DATE_FORMAT(MAX(trade_date),'%Y-%m-%d') FROM t_source_daily),
      'expectedTradeDate',(SELECT DATE_FORMAT(MAX(cal_date),'%Y-%m-%d') FROM t_source_trade_cal
        WHERE is_open=1 AND cal_date<=DATE(UTC_TIMESTAMP()+INTERVAL 8 HOUR)-INTERVAL IF(HOUR(UTC_TIMESTAMP()+INTERVAL 8 HOUR)<22,1,0) DAY),
      'staleNewsSources',(SELECT GROUP_CONCAT(source ORDER BY source) FROM t_news_source
        WHERE enabled=1 AND (last_success IS NULL OR last_success<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 MINUTE))))"""
    result = subprocess.check_output(['docker', 'exec', 'mufengtongxue-stock-db-mysql-1',
        'mysql', '--defaults-extra-file=/run/secrets/mysql-root-client', '--batch', '--skip-column-names',
        'stock', '-e', sql], stderr=subprocess.DEVNULL, timeout=15)
    return json.loads(result)


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
    data, dispatch = {}, {}
    if production:
        try:
            data = data_freshness()
        except (OSError, ValueError, subprocess.SubprocessError):
            pass
        try:
            dispatch = json.loads(Path('/var/lib/stock-health-dispatch/status.json').read_text())
        except (OSError, ValueError):
            pass
    issues = operational_issues(data, dispatch, now) if production else []
    if production and systemctl('is-enabled', 'stock-health-dispatch.timer') != 'enabled':
        issues.append('health_dispatch_timer_disabled')
    # Destination and proof writer are not configured yet. Do not equate one historical copy with ongoing protection.
    return {'checkedAt': now.isoformat(), 'production': production,
            'maintenance': Path('/srv/stock/state/maintenance').exists(),
            'backendHealthy': states['backend'], 'databaseHealthy': states['database'],
            'backupHealthy': backup['healthy'], 'backupIssues': backup['issues'],
            'dataFreshness': data, 'operationalIssues': issues,
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
