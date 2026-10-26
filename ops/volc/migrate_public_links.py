#!/usr/bin/env python3
"""Version current review URLs only. Keep immutable history and private backups."""
import argparse
import datetime as dt
import gzip
import json
import os
from pathlib import Path
import re
import subprocess

ORIGIN = 'https://stock.mufengtongxue.com'
OLD = re.compile(r'''(?<![A-Za-z0-9_/?=&%:@.\-])https?://(?:14\.103\.103\.4|47\.99\.111\.167)(?::(?:80|443))?(?=[/?#\s"'<>()[\]{}，。；：！？、,;!]|$)''')


def normalize(value):
    if isinstance(value, str):
        return OLD.sub(ORIGIN, value)
    if isinstance(value, list):
        return [normalize(v) for v in value]
    if isinstance(value, dict):
        return {k: normalize(v) for k, v in value.items()}
    return value


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    env = dict(line.split('=', 1) for line in Path('/etc/stock/runtime.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
    database = env['DB_DATABASE'].strip('"\'')
    def sql(statement):
        return subprocess.check_output(['docker', 'exec', '-i', 'mufengtongxue-stock-db-mysql-1', 'mysql', '--defaults-extra-file=/run/secrets/mysql-root-client', '-N', '-B', '--default-character-set=utf8mb4', database], input=statement, text=True, timeout=60).strip()
    raw = sql("SELECT user_id,DATE_FORMAT(trade_date,'%Y-%m-%d'),revision,HEX(content) FROM t_review_notebook WHERE content LIKE '%14.103.103.4%' OR content LIKE '%47.99.111.167%'")
    rows = []
    for line in raw.splitlines():
        owner, date, revision, content = line.split('\t')
        original = json.loads(bytes.fromhex(content))
        updated = normalize(original)
        if original != updated:
            rows.append(dict(owner=int(owner), date=date, revision=int(revision), content=content, updated=updated))
    backup = None; changed = []
    if args.apply and rows:
        os.umask(0o077)
        folder = Path('/srv/stock/recovery/domain-links'); folder.mkdir(parents=True, exist_ok=True)
        backup = folder / (dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '.json.gz')
        with gzip.open(backup, 'wt', encoding='utf-8') as output:
            json.dump([{k:v for k,v in row.items() if k != 'updated'} for row in rows], output)
        for row in rows:
            owner, date, revision = row['owner'], row['date'], row['revision']
            content = json.dumps(row['updated'], ensure_ascii=False, separators=(',', ':')).encode().hex()
            where = f"user_id={owner} AND trade_date='{date}'"
            result = sql(f"START TRANSACTION; SELECT revision FROM t_review_notebook WHERE {where} FOR UPDATE; INSERT INTO t_review_notebook_version(user_id,trade_date,revision,content) SELECT user_id,trade_date,{revision+1},CONVERT(0x{content} USING utf8mb4) FROM t_review_notebook WHERE {where} AND revision={revision}; UPDATE t_review_notebook SET revision={revision+1},content=CONVERT(0x{content} USING utf8mb4),updated_at=UTC_TIMESTAMP(3) WHERE {where} AND revision={revision}; SELECT ROW_COUNT(); COMMIT;")
            if result.splitlines()[-1] != '1':
                raise RuntimeError('Concurrent edit preserved; rerun the audit before applying again')
            changed.append(dict(date=date, revision=revision+1))
    print(json.dumps(dict(mode='apply' if args.apply else 'audit', affected=len(rows), changed=changed, backup=str(backup) if backup else None, immutableHistoryPreserved=True)))


if __name__ == '__main__':
    main()
