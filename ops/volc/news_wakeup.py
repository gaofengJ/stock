#!/usr/bin/python3
"""Wake only the two fixed news sources after a changed, validated feed arrives."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

sys.path.insert(0, '/usr/local/lib/stock-news')
from bloomberg_relay import MAX_BYTES, validate_feed as validate_bloomberg
from sina_relay import validate_feed as validate_sina

SOURCES = {'bloomberg': validate_bloomberg, 'sina': validate_sina}
FEEDS = Path('/srv/stock/news')
STATE = Path('/srv/stock/state/news-wakeup.json')
COMPOSE = ['docker', 'compose', '--env-file', '/opt/stock/deploy/release.env',
           '-f', '/opt/stock/deploy/compose.app.yaml']
RESET = """if(process.env.NEWS_SYNC_ENABLED!=='true')throw Error('News sync is disabled');
require('dotenv').config({path:process.env.APP_ENV_FILE});
const ds=require('./dist/migration-data-source').default;
const source=process.argv[1];
if(!['bloomberg','sina'].includes(source))throw Error('Unsupported source');
(async()=>{await ds.initialize();try{
await ds.query('UPDATE t_news_source SET next_attempt=NULL,consecutive_failures=0 WHERE enabled=1 AND source=?',[source]);
}finally{await ds.destroy();}})().catch(()=>{process.exitCode=1;});"""


def reset_source(source):
    assert source in SOURCES
    subprocess.run(COMPOSE + ['exec', '-T', 'back', 'node', '-e', RESET, source],
                   check=True, capture_output=True, timeout=30)


def inspect(root, previous, reset=None):
    acknowledged = dict(previous)
    results = []
    for source, validate in SOURCES.items():
        try:
            path = root / (source + '.json')
            if not path.is_file() or path.is_symlink() or not 0 < path.stat().st_size <= MAX_BYTES:
                raise ValueError('Missing or invalid feed file')
            with path.open('rb') as stream:
                raw = stream.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                raise ValueError('Feed exceeds limit')
            digest = hashlib.sha256(raw).hexdigest()
            if previous.get(source) == digest:
                results.append({'source': source, 'state': 'unchanged'})
                continue
            validate(json.loads(raw))
            if reset:
                reset(source)
                acknowledged[source] = digest
            results.append({'source': source, 'state': 'acknowledged' if reset else 'pending'})
        except Exception:
            # Do not expose SQL, runtime environment, private paths or feed contents.
            results.append({'source': source, 'state': 'failed'})
    return acknowledged, results


def save(value):
    fd, name = tempfile.mkstemp(prefix='.news-wakeup-', dir=STATE.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream, indent=2)
            stream.write('\n'); stream.flush(); os.fsync(stream.fileno())
        os.replace(name, STATE)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--audit', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    enabled = all(Path(p).is_file() for p in (
        '/etc/stock/production.enabled', '/etc/stock-news-delivery.enabled'))
    if not enabled and not args.audit:
        print(json.dumps({'state': 'deferred_until_cutover'}))
        return 0
    # Same lock as the SSH feed receiver: no replacement between checksum and wake-up.
    with (FEEDS / '.delivery.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        previous = json.loads(STATE.read_text()).get('acknowledged', {}) if STATE.exists() else {}
        updated, results = inspect(FEEDS, previous, None if args.audit else reset_source)
        if not args.audit:
            save({'checkedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
                  'acknowledged': updated, 'results': results})
    print(json.dumps({'audit': args.audit, 'results': results}))
    return int(any(item['state'] == 'failed' for item in results))


if __name__ == '__main__':
    raise SystemExit(main())
