#!/usr/bin/python3
"""Read only the fixed sanitized root-written health report."""
import json
import os
from pathlib import Path
import sys

REPORT = Path('/srv/stock/deploy-status/health.json')
FIELDS = {'checkedAt', 'production', 'maintenance', 'backendHealthy', 'databaseHealthy',
          'backupHealthy', 'backupIssues', 'recurringOffhostVerified'}


def read(command, report=REPORT):
    if command != 'health status' or report.is_symlink():
        raise ValueError('Unsupported health query')
    stat = report.stat()
    if stat.st_uid != 0 or stat.st_mode & 0o022 or stat.st_size > 8192:
        raise ValueError('Health report is not root-controlled')
    value = json.loads(report.read_text())
    if set(value) != FIELDS:
        raise ValueError('Unexpected health fields')
    return value


if __name__ == '__main__':
    try: print(json.dumps(read(os.environ.get('SSH_ORIGINAL_COMMAND', ''))))
    except Exception:
        print('Health status unavailable', file=sys.stderr); raise SystemExit(1)
