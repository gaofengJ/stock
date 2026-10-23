#!/usr/bin/python3
"""Read only the fixed sanitized root-written health report."""
import json
import os
from pathlib import Path
import sys

REPORT = Path('/srv/stock/deploy-status/health.json')
FIELDS = {'checkedAt', 'production', 'maintenance', 'backendHealthy', 'databaseHealthy',
          'backupHealthy', 'backupIssues', 'recurringOffhostVerified'}
OPERATIONAL_FIELDS = {'dataFreshness', 'operationalIssues'}
FRESHNESS_FIELDS = {'latestTradeDate', 'expectedTradeDate', 'staleNewsSources'}
OPERATIONAL_ISSUES = {'data_freshness_unavailable', 'daily_data_stale', 'news_sources_stale',
                      'health_dispatch_stale', 'health_workflow_stalled', 'health_dispatch_timer_disabled'}


def read(command, report=REPORT):
    if command != 'health status' or report.is_symlink():
        raise ValueError('Unsupported health query')
    stat = report.stat()
    if stat.st_uid != 0 or stat.st_mode & 0o022 or stat.st_size > 8192:
        raise ValueError('Health report is not root-controlled')
    value = json.loads(report.read_text())
    if set(value) not in (FIELDS, FIELDS | OPERATIONAL_FIELDS):
        raise ValueError('Unexpected health fields')
    if 'dataFreshness' in value:
        freshness, issues = value['dataFreshness'], value['operationalIssues']
        if (not isinstance(freshness, dict) or set(freshness) - FRESHNESS_FIELDS
                or any(item is not None and not isinstance(item, str) for item in freshness.values())
                or not isinstance(issues, list)
                or any(not isinstance(issue, str) or issue not in OPERATIONAL_ISSUES for issue in issues)):
            raise ValueError('Unexpected operational health fields')
    return value


if __name__ == '__main__':
    try: print(json.dumps(read(os.environ.get('SSH_ORIGINAL_COMMAND', ''))))
    except Exception:
        print('Health status unavailable', file=sys.stderr); raise SystemExit(1)
