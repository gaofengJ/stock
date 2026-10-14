#!/usr/bin/env python3
"""External checks: fixed restricted SSH summary plus verified HTTPS entry points."""
import argparse
import datetime as dt
import json
from pathlib import Path
import subprocess
import urllib.error
import urllib.request


def assess(value, now, production, offhost_policy='required'):
    if offhost_policy not in ('required', 'deferred'):
        raise ValueError('Unknown off-host backup policy')
    issues = []
    stamp = dt.datetime.fromisoformat(value['checkedAt'])
    if stamp.utcoffset() is None or not 0 <= (now-stamp).total_seconds() <= 20*60:
        issues.append('health_snapshot_stale_or_invalid')
    for key in ('backendHealthy', 'databaseHealthy'):
        if value.get(key) is not True: issues.append(key)
    if production:
        if value.get('production') is not True or value.get('maintenance') is not False:
            issues.append('production_not_open')
        if value.get('backupHealthy') is not True: issues.append('local_backup_unhealthy')
        if offhost_policy == 'required' and value.get('recurringOffhostVerified') is not True:
            issues.append('recurring_offhost_unverified')
    elif value.get('production') is not False or value.get('maintenance') is not True:
        issues.append('rehearsal_isolation_changed')
    return issues


def http_code(path):
    try:
        with urllib.request.urlopen('https://14.103.103.4' + path, timeout=20) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--key', type=Path, required=True)
    parser.add_argument('--known-hosts', type=Path, required=True); parser.add_argument('--production', action='store_true')
    parser.add_argument('--offhost-policy', choices=['required', 'deferred'], default='required')
    args = parser.parse_args()
    command = ['ssh','-i',str(args.key),'-o','IdentitiesOnly=yes','-o','BatchMode=yes',
               '-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(args.known_hosts),
               '-o','ConnectTimeout=15','stock-deploy@14.103.103.4','health status']
    value=json.loads(subprocess.check_output(command,timeout=30))
    issues=assess(value,dt.datetime.now(dt.timezone.utc),args.production,args.offhost_policy)
    codes={}
    for path, expected in [('/',200),('/api/auth/me',401),('/blog-frame/',403)]:
        code=http_code(path);codes[path]=code
        if code != (expected if args.production else 503): issues.append('https_status:'+path)
    print(json.dumps({'mode':'production' if args.production else 'isolated-transport-check',
                      'healthy':not issues if args.production else None,'checksPassed':not issues,
                      'issues':issues,'https':codes,'server':value,
                      'offhostPolicy':args.offhost_policy,
                      'warnings':['recurring_offhost_backup_deferred_by_owner']
                      if args.offhost_policy == 'deferred' and value.get('recurringOffhostVerified') is not True else []}))
    raise SystemExit(1 if issues else 0)
