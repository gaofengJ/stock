"""Read public Bloomberg Markets RSS and atomically deliver its small JSON feed."""
import argparse
import datetime as dt
import email.utils
import json
import os
from pathlib import Path
import tempfile
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET

RSS_URL = 'https://www.bloomberg.com/feeds/markets/news.rss'
SERVER_ROOT = Path('/opt/stock-news')
MAX_BYTES = 1024 * 1024
MAX_AGE = dt.timedelta(minutes=45)


def utc_now():
    return dt.datetime.now(dt.timezone.utc)


def iso_date(value):
    return value.astimezone(dt.timezone.utc).isoformat().replace('+00:00', 'Z')


def validate_feed(feed, now=None):
    now = now or utc_now()
    if not isinstance(feed, dict) or feed.get('source') != 'bloomberg-markets':
        raise ValueError('Unexpected feed identity')
    generated = dt.datetime.strptime(feed.get('generated_at', ''), '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=dt.timezone.utc)
    if generated > now + dt.timedelta(minutes=5) or now - generated > MAX_AGE:
        raise ValueError('Relay data is stale or future-dated')
    items = feed.get('items')
    if not isinstance(items, list) or not 1 <= len(items) <= 30:
        raise ValueError('Invalid relay item count')
    for item in items:
        if not isinstance(item, dict):
            raise ValueError('Invalid relay item')
        link = urllib.parse.urlparse(item.get('url', ''))
        if link.scheme != 'https' or link.hostname != 'www.bloomberg.com' or link.username or link.password:
            raise ValueError('Unexpected article origin')
        if not isinstance(item.get('title'), str) or not 1 <= len(item['title']) <= 512:
            raise ValueError('Invalid article title')
        if not isinstance(item.get('content_html'), str) or len(item['content_html']) > 12000:
            raise ValueError('Invalid article summary')
        if item.get('id') != item['url'] or len(item['url']) > 2048:
            raise ValueError('Invalid article identity')
        published = dt.datetime.strptime(item.get('date_published', ''), '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=dt.timezone.utc)
        if published.tzinfo is None or published > now + dt.timedelta(minutes=5):
            raise ValueError('Invalid publication time')
    return feed


def parse_rss(raw, now=None):
    now = now or utc_now()
    if len(raw) > MAX_BYTES:
        raise ValueError('RSS exceeds size limit')
    if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
        raise ValueError('DTD is not accepted')
    tree = ET.fromstring(raw)
    items = []
    for node in tree.findall('./channel/item')[:30]:
        published = email.utils.parsedate_to_datetime(node.findtext('pubDate', ''))
        if published.tzinfo is None:
            raise ValueError('Publication time needs timezone')
        link = node.findtext('link', '').strip()
        items.append({
            'id': link,
            'url': link,
            'title': node.findtext('title', '').strip()[:512],
            'content_html': node.findtext('description', '')[:12000],
            'date_published': iso_date(published),
        })
    return validate_feed({
        'source': 'bloomberg-markets',
        'generated_at': iso_date(now.replace(microsecond=0)),
        'items': items,
    }, now)


def collect(output):
    request = urllib.request.Request(RSS_URL, headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml,application/xml'})
    with urllib.request.urlopen(request, timeout=20) as response:
        if urllib.parse.urlparse(response.url).hostname != 'www.bloomberg.com':
            raise ValueError('Unexpected feed redirect')
        feed = parse_rss(response.read(MAX_BYTES + 1))
    output.write_text(json.dumps(feed, ensure_ascii=False), encoding='utf-8')
    print('BLOOMBERG_COLLECTED items={} generated_at={}'.format(len(feed['items']), feed['generated_at']))


def receive(source, root=SERVER_ROOT):
    root = root.resolve()
    source = source.resolve()
    staging = root / 'staging'
    if source.name != 'bloomberg.json' or source.parent.parent != staging or not source.parent.name.isdigit():
        raise ValueError('Unexpected staging path')
    if source.stat().st_size > MAX_BYTES:
        raise ValueError('JSON exceeds size limit')
    feed = validate_feed(json.loads(source.read_text(encoding='utf-8')))
    destination = root / 'feeds'
    destination.mkdir(mode=0o755, parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=str(destination), prefix='.bloomberg-', delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(feed, stream, ensure_ascii=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(str(temporary), 0o644)
        os.replace(str(temporary), str(destination / 'bloomberg.json'))
    finally:
        if temporary and temporary.exists():
            temporary.unlink()
    print('BLOOMBERG_DELIVERED items={} generated_at={}'.format(len(feed['items']), feed['generated_at']))
    # Remove only this run's known staging files; never recursively delete a directory.
    source.unlink()
    script = source.parent / '.github' / 'scripts' / 'bloomberg_relay.py'
    if script.is_file():
        script.unlink()
    for directory in [script.parent, script.parent.parent, source.parent]:
        try:
            directory.rmdir()
        except OSError:
            pass


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['collect', 'receive'])
    parser.add_argument('--file', type=Path, required=True)
    args = parser.parse_args()
    if args.mode == 'collect':
        collect(args.file)
    else:
        receive(args.file)
