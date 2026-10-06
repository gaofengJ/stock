"""Collect Sina's public rolling list without fetching article pages."""
import argparse
import datetime as dt
import json
from pathlib import Path
import urllib.request
import urllib.parse
from bloomberg_relay import MAX_BYTES, MAX_AGE, SERVER_ROOT, iso_date, utc_now, receive_feed

SINA_URL = 'https://feed.mix.sina.com.cn/api/roll/get?pageid=384&lid=2519&num=30&page=1'


def validate_feed(feed, now=None):
    now = now or utc_now()
    if not isinstance(feed, dict) or feed.get('source') != 'sina-finance':
        raise ValueError('Unexpected Sina feed identity')
    generated = dt.datetime.strptime(feed.get('generated_at', ''), '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=dt.timezone.utc)
    if generated > now + dt.timedelta(minutes=5) or now - generated > MAX_AGE:
        raise ValueError('Sina relay is stale or future-dated')
    items = feed.get('items')
    if not isinstance(items, list) or not 1 <= len(items) <= 30:
        raise ValueError('Invalid Sina item count')
    for item in items:
        if not isinstance(item, dict):
            raise ValueError('Invalid Sina item')
        link = urllib.parse.urlparse(item.get('url', ''))
        if link.scheme != 'https' or link.hostname != 'finance.sina.com.cn' or link.username or link.password:
            raise ValueError('Unexpected Sina article origin')
        if item.get('id') != item['url'] or len(item['url']) > 2048:
            raise ValueError('Invalid Sina identity')
        if not isinstance(item.get('title'), str) or not item['title'].strip() or len(item['title']) > 512:
            raise ValueError('Invalid Sina title')
        if not isinstance(item.get('content_html'), str) or len(item['content_html']) > 12000:
            raise ValueError('Invalid Sina summary')
        published = dt.datetime.strptime(item.get('date_published', ''), '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=dt.timezone.utc)
        if published > now + dt.timedelta(minutes=5):
            raise ValueError('Invalid Sina publication time')
    return feed


def parse_list(raw, now=None):
    now = now or utc_now()
    if len(raw) > MAX_BYTES:
        raise ValueError('Sina response exceeds size limit')
    result = json.loads(raw.decode('utf-8')).get('result', {})
    rows = result.get('data')
    if result.get('status', {}).get('code') not in (0, '0') or not isinstance(rows, list):
        raise ValueError('Invalid Sina rolling list')
    items = []
    for row in rows[:30]:
        link = row.get('url', '').replace('http://', 'https://', 1)
        if urllib.parse.urlparse(link).hostname != 'finance.sina.com.cn':
            continue
        published = dt.datetime.fromtimestamp(int(row.get('ctime') or row.get('intime')), dt.timezone.utc)
        items.append({
            'id': link, 'url': link, 'title': row.get('title', '')[:512],
            'content_html': row.get('intro', '')[:12000],
            'date_published': iso_date(published),
        })
    return validate_feed({'source': 'sina-finance', 'generated_at': iso_date(now.replace(microsecond=0)), 'items': items}, now)


def collect(output):
    request = urllib.request.Request(SINA_URL, headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.sina.com.cn/'})
    with urllib.request.urlopen(request, timeout=20) as response:
        if urllib.parse.urlparse(response.url).hostname != 'feed.mix.sina.com.cn':
            raise ValueError('Unexpected Sina redirect')
        feed = parse_list(response.read(MAX_BYTES + 1))
    output.write_text(json.dumps(feed, ensure_ascii=False), encoding='utf-8')
    print('SINA_COLLECTED items={} generated_at={}'.format(len(feed['items']), feed['generated_at']))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['collect', 'receive'])
    parser.add_argument('--file', type=Path, required=True)
    args = parser.parse_args()
    if args.mode == 'collect':
        collect(args.file)
    else:
        receive_feed(args.file, validate_feed, 'sina.json', SERVER_ROOT)
