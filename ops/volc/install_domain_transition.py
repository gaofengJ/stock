#!/usr/bin/env python3
"""Activate reviewed IP recovery redirects and the existing AI origin, with rollback."""
import datetime as dt
import json
from pathlib import Path
import shutil
import subprocess
import time
import urllib.request


def run(*args):
    return subprocess.check_output(args, text=True, timeout=60).strip()


def main():
    tasks = Path('/srv/stock-personal-console/tasks.json')
    if any(row['status'] in ['preparing', 'running', 'cancelling'] for row in json.loads(tasks.read_text() if tasks.exists() else '[]')):
        raise RuntimeError('Active AI tasks preserved; retry after they finish')
    with urllib.request.urlopen('http://127.0.0.1:8081/domain-transfer/', timeout=10) as response:
        if response.status != 200:
            raise RuntimeError('Deploy the recovery page before enabling redirects')
    site = Path('/etc/nginx/sites-enabled/default').resolve()
    config = Path('/opt/stock-personal-console/config/config.json')
    original = site.read_text(); before = config.read_text()
    origin = 'https://stock.mufengtongxue.com'
    marker = '  location / {\n    if (-f /srv/stock/state/maintenance) { return 503; }\n    proxy_pass http://127.0.0.1:8081;\n  }'
    recovery = ('  # DOMAIN_TRANSITION: preserve local recovery on the IP origin.\n'
                '  location = /domain-transfer/ { proxy_pass http://127.0.0.1:8081; }\n'
                '  location = /domain-transfer { return 308 /domain-transfer/; }\n'
                '  location ^~ /_next/ { proxy_pass http://127.0.0.1:8081; }\n'
                '  location / { return 308 https://stock.mufengtongxue.com$request_uri; }')
    if 'DOMAIN_TRANSITION:' not in original and original.count(marker) != 1:
        raise RuntimeError('Unexpected IP configuration; preserve the existing virtual host')
    updated = original if 'DOMAIN_TRANSITION:' in original else original.replace(marker, recovery)
    updated = updated.replace('return 308 https://14.103.103.4$request_uri;', 'return 308 https://stock.mufengtongxue.com$request_uri;')
    value = json.loads(before); value['origin'] = origin
    folder = Path('/root/stock-domain-transition') / dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    folder.mkdir(parents=True, mode=0o700)
    shutil.copy2(site, folder / 'nginx.conf'); shutil.copy2(config, folder / 'ai-config.json')
    try:
        site.write_text(updated); run('nginx', '-t')
        config.write_text(json.dumps(value)); run('systemctl', 'restart', 'stock-personal-console.service')
        for attempt in range(20):
            try:
                with urllib.request.urlopen('http://127.0.0.1:18787/healthz', timeout=2) as response:
                    if response.status != 200: raise RuntimeError('AI health check failed')
                break
            except Exception:
                if attempt == 19: raise
                time.sleep(0.5)
        run('systemctl', 'reload', 'nginx')
        print(json.dumps(dict(installed=True, origin=origin, backup=str(folder), taskCount=len(json.loads(tasks.read_text() if tasks.exists() else '[]')))))
    except Exception:
        site.write_text(original); config.write_text(before)
        run('nginx', '-t'); run('systemctl', 'reload', 'nginx')
        run('systemctl', 'restart', 'stock-personal-console.service')
        raise


if __name__ == '__main__':
    main()
