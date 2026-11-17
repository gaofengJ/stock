#!/usr/bin/env python3
"""External checks: fixed restricted SSH summary plus verified HTTPS entry points."""
import argparse
import datetime as dt
import json
import os
import ssl
import time
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
        # A running external probe proves it can execute. Historical runner queue
        # delays remain visible as warnings without failing current service health.
        issues.extend(issue for issue in value.get('operationalIssues', [])
                      if issue != 'health_workflow_stalled')
        if offhost_policy == 'required' and value.get('recurringOffhostVerified') is not True:
            issues.append('recurring_offhost_unverified')
    elif value.get('production') is not False or value.get('maintenance') is not True:
        issues.append('rehearsal_isolation_changed')
    return issues


TRANSIENT_HTTP = {408, 429, 500, 502, 503, 504}


def http_code(path, origin='https://14.103.103.4', retries=None):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(origin + path, timeout=10) as response:
                code = response.status
        except urllib.error.HTTPError as error:
            code = error.code
        except urllib.error.URLError as error:
            if isinstance(error.reason, ssl.SSLCertVerificationError):
                return 0
            code = 0
        except (OSError, TimeoutError):
            code = 0
        if code not in TRANSIENT_HTTP and code != 0:
            return code
        if attempt < 2:
            if retries is not None:
                retries.append(origin + path)
            time.sleep(attempt + 1)
    return code


def read_snapshot(command):
    for attempt in range(3):
        try:
            raw = subprocess.check_output(command, timeout=30, stderr=subprocess.PIPE)
            return json.loads(raw)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            if attempt == 2:
                raise RuntimeError('health_snapshot_unreachable') from None
            time.sleep(attempt + 1)


def category(issue):
    if issue.startswith(('health_', 'recurring_offhost_')):
        return 'monitoring'
    if issue in ('daily_data_stale', 'news_sources_stale', 'data_freshness_unavailable'):
        return 'data'
    return 'availability'


def check(command, production, offhost_policy):
    value = read_snapshot(command)
    issues = assess(value, dt.datetime.now(dt.timezone.utc), production, offhost_policy)
    warnings = []
    if production and 'health_workflow_stalled' in value.get('operationalIssues', []):
        warnings.append('health_workflow_stalled')
    if offhost_policy == 'deferred' and value.get('recurringOffhostVerified') is not True:
        warnings.append('recurring_offhost_backup_deferred_by_owner')
    codes, retries = {}, []
    endpoints = [('/', 200), ('/api/auth/me', 401), ('/blog-frame/', 403)]
    for path, expected in endpoints:
        code = http_code(path, retries=retries)
        codes[path] = code
        if code != (expected if production else 503):
            issues.append('https_status:' + path)
    if production:
        for path, expected in [('/', 200), ('/robots.txt', 200), ('/sitemap.xml', 200),
                               ('/domain-transfer/', 200), ('/api/auth/me', 401), ('/blog-frame/', 403)]:
            code = http_code(path, 'https://stock.mufengtongxue.com', retries)
            codes['domain:' + path] = code
            if code != expected:
                issues.append('domain_https_status:' + path)
    return {'mode': 'production' if production else 'isolated-transport-check',
            'healthy': not issues if production else None, 'checksPassed': not issues,
            'issues': issues, 'categories': {name: [issue for issue in issues if category(issue) == name]
                                            for name in ('availability', 'data', 'monitoring')},
            'https': codes, 'server': value, 'offhostPolicy': offhost_policy,
            'warnings': warnings, 'retriedRequests': retries}


def publish(result):
    print(json.dumps(result))
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        lines = ['## External health check', '',
                 'Result: ' + ('passed' if result['checksPassed'] else 'failed'), '']
        lines += ['- ' + name + ': ' + (', '.join(values) or 'OK')
                  for name, values in result['categories'].items()]
        lines += ['- Warnings: ' + (', '.join(result['warnings']) or 'none'),
                  '- Network retries: ' + str(len(result.get('retriedRequests', [])))]
        with open(summary, 'a') as stream:
            stream.write('\n'.join(lines) + '\n')
    if os.environ.get('GITHUB_ACTIONS') == 'true':
        for name, issues in result['categories'].items():
            if issues:
                print('::error title=Health ' + name + '::' + ', '.join(issues))
        if 'health_workflow_stalled' in result['warnings']:
            print('::warning title=Health runner delay::Previous runner queue delay; current endpoint and host checks completed. See summary.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--key', type=Path, required=True)
    parser.add_argument('--known-hosts', type=Path, required=True)
    parser.add_argument('--production', action='store_true')
    parser.add_argument('--offhost-policy', choices=['required', 'deferred'], default='required')
    args = parser.parse_args()
    command = ['ssh', '-i', str(args.key), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
               '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=' + str(args.known_hosts),
               '-o', 'ConnectTimeout=15', 'stock-deploy@14.103.103.4', 'health status']
    try:
        result = check(command, args.production, args.offhost_policy)
    except (RuntimeError, ValueError, KeyError, TypeError, OSError) as error:
        issue = str(error) if isinstance(error, RuntimeError) else 'health_snapshot_invalid'
        result = {'checksPassed': False, 'healthy': False, 'issues': [issue],
                  'categories': {'monitoring': [issue]}, 'warnings': []}
    publish(result)
    raise SystemExit(0 if result['checksPassed'] else 1)
