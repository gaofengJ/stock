"""Translate public RSS titles/summaries on the runner; never fetch article text."""
import argparse
import datetime as dt
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import tempfile
import time
import urllib.request

from bloomberg_relay import validate_feed, valid_translation, utc_now

MODEL = 'en_zh-1.9'
MODEL_URL = 'https://argos-net.com/v1/translate-en_zh-1_9.argosmodel'
MODEL_SHA256 = '433e7c4f034d87fbe2353161e05f18646d7999452f801a4e1f0378522b9850ab'
MAX_CACHE_BYTES = 8 * 1024 * 1024
MAX_CACHE_ITEMS = 500


class TextOnly(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'iframe', 'noscript'):
            self.hidden += 1
        if tag in ('p', 'br', 'div', 'li'):
            self.parts.append(' ')

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'iframe', 'noscript'):
            self.hidden = max(0, self.hidden - 1)
        self.parts.append(' ' if tag in ('p', 'div', 'li') else '')

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def text_only(value):
    parser = TextOnly()
    parser.feed(value)
    return re.sub(r'\s+', ' ', ''.join(parser.parts)).strip()


def fingerprint(item):
    return hashlib.sha256((item['title'] + '\0' + item['content_html']).encode('utf-8')).hexdigest()


def checked_translation(text, translator):
    result = translator(text)
    if not isinstance(result, str) or not result.strip():
        raise ValueError('Empty translation')
    # Conservative check: retain English if financial figures disappear or change.
    # This cannot detect all semantic or terminology errors.
    numbers = lambda value: sorted(n.replace(',', '') for n in re.findall(r'\d+(?:[.,]\d+)*', value))
    if numbers(text) != numbers(result):
        raise ValueError('Translation changed numeric figures')
    return result


def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=str(path.parent), delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(data, stream, ensure_ascii=False)
        os.replace(str(temporary), str(path))
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def prepare():
    import argostranslate.package as package
    installed = package.get_installed_packages()
    if any(p.from_code == 'en' and p.to_code == 'zh' and str(p.package_version) == '1.9' for p in installed):
        warm_runtime()
        return
    # Only the official English -> Chinese model; no multilingual model bundle.
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / 'en_zh.argosmodel'
        request = urllib.request.Request(MODEL_URL, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(request, timeout=60) as response:
            with path.open('wb') as output:
                total = 0
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > 100 * 1024 * 1024:
                        raise ValueError('Model download exceeds size budget')
                    output.write(chunk)
        if hashlib.sha256(path.read_bytes()).hexdigest() != MODEL_SHA256:
            raise ValueError('English -> Chinese model checksum mismatch')
        package.install_from_path(path)
    installed = package.get_installed_packages()
    if not any(p.from_code == 'en' and p.to_code == 'zh' and str(p.package_version) == '1.9' for p in installed):
        raise ValueError('Expected English -> Chinese model unavailable')
    warm_runtime()


def warm_runtime():
    from argostranslate.translate import translate
    if not re.search(r'[\u3400-\u9fff]', translate('Stocks rise.', 'en', 'zh')):
        raise ValueError('Translation runtime smoke check failed')


def translate_feed(feed, cached, translator, now=None):
    now = now or utc_now()
    validate_feed(feed, now)
    cutoff = (now - dt.timedelta(days=30)).timestamp()
    entries = cached.get('entries', {}) if isinstance(cached, dict) else {}
    entries = entries if isinstance(entries, dict) else {}
    entries = {k: v for k, v in entries.items() if isinstance(v, dict) and isinstance(v.get('seen'), (int, float)) and cutoff <= v['seen'] <= now.timestamp() + 300}
    hits = translated = failed = 0
    for item in feed['items']:
        item.pop('translation', None)
        key = fingerprint(item)
        entry = entries.get(key, {})
        candidate = dict(item, translation=entry.get('translation'))
        if valid_translation(candidate):
            item['translation'] = candidate['translation']
            hits += 1
        else:
            try:
                title = checked_translation(text_only(item['title']), translator)
                summary = text_only(item['content_html'])
                body = checked_translation(summary, translator) if summary else ''
                candidate['translation'] = {'engine': 'argos', 'model': MODEL, 'source_hash': key, 'title': title, 'body': body}
                if not valid_translation(candidate):
                    raise ValueError('Invalid translation output')
                item['translation'] = candidate['translation']
                translated += 1
            except Exception:
                # A failed item is retried next run and never blocks English delivery.
                failed += 1
                continue
        entries[key] = {'seen': now.timestamp(), 'translation': item['translation']}
    entries = dict(sorted(entries.items(), key=lambda pair: pair[1]['seen'], reverse=True)[:MAX_CACHE_ITEMS])
    return feed, {'entries': entries}, {'cached': hits, 'translated': translated, 'failed': failed}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['prepare', 'translate'])
    parser.add_argument('--file', type=Path, default=Path('bloomberg.json'))
    parser.add_argument('--cache', type=Path, default=Path('.translation-cache/bloomberg.json'))
    args = parser.parse_args()
    if args.mode == 'prepare':
        prepare()
        return
    from argostranslate.translate import translate
    cached = {}
    if args.cache.exists() and args.cache.stat().st_size <= MAX_CACHE_BYTES:
        try:
            cached = json.loads(args.cache.read_text(encoding='utf-8'))
        except (ValueError, OSError):
            pass
    feed = json.loads(args.file.read_text(encoding='utf-8'))
    start = time.monotonic()
    feed, cached, stats = translate_feed(feed, cached, lambda text: translate(text, 'en', 'zh'))
    atomic_json(args.file, feed)
    atomic_json(args.cache, cached)
    print('BLOOMBERG_TRANSLATION ' + json.dumps(dict(stats, seconds=round(time.monotonic() - start, 2))))
    if os.getenv('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
            output.write('changed={}\n'.format(str(stats['translated'] > 0).lower()))


if __name__ == '__main__':
    main()
