import copy
import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from sina_relay import parse_list, validate_feed
from bloomberg_relay import receive_feed

NOW = dt.datetime(2026, 10, 6, 6, 0, tzinfo=dt.timezone.utc)


def raw():
    return json.dumps({'result': {'status': {'code': 0}, 'data': [{
        'url': 'http://finance.sina.com.cn/stock/example.shtml',
        'title': '财经新闻', 'intro': '<p>公开摘要</p>',
        'ctime': str(int((NOW - dt.timedelta(hours=1)).timestamp())),
        'intime': str(int(NOW.timestamp())),
    }]}}).encode('utf-8')


class SinaRelayTests(unittest.TestCase):
    def test_list_uses_public_summary_and_original_publication_time(self):
        feed = parse_list(raw(), NOW)
        item = feed['items'][0]
        self.assertEqual(item['date_published'], '2026-10-06T05:00:00Z')
        self.assertEqual(item['url'], 'https://finance.sina.com.cn/stock/example.shtml')
        self.assertEqual(item['id'], item['url'])
        self.assertEqual(item['content_html'], '<p>公开摘要</p>')

    def test_business_errors_stale_data_and_substituted_origins_fail(self):
        with self.assertRaises(ValueError):
            parse_list(b'{"result":{"status":{"code":1},"data":[]}}', NOW)
        feed = parse_list(raw(), NOW)
        with self.assertRaises(ValueError):
            validate_feed(feed, NOW + dt.timedelta(minutes=46))
        for url in ['http://127.0.0.1/private', 'https://finance.sina.com.cn.evil.example/story', 'https://user:pass@finance.sina.com.cn/story']:
            altered = copy.deepcopy(feed)
            altered['items'][0].update(url=url, id=url)
            with self.assertRaises(ValueError):
                validate_feed(altered, NOW)

    def test_atomic_delivery_preserves_previous_snapshot_and_cleans_only_its_run(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            destination = root / 'feeds'
            destination.mkdir()
            previous = destination / 'sina.json'
            previous.write_text('previous', encoding='utf-8')
            staging = root / 'staging' / '123'
            staging.mkdir(parents=True)
            scripts = staging / '.github' / 'scripts'
            scripts.mkdir(parents=True)
            for name in ('bloomberg_relay.py', 'sina_relay.py'):
                (scripts / name).write_text('receiver', encoding='utf-8')
            source = staging / 'sina.json'
            source.write_text('{}', encoding='utf-8')
            with self.assertRaises(ValueError):
                receive_feed(source, validate_feed, 'sina.json', root)
            self.assertEqual(previous.read_text(encoding='utf-8'), 'previous')
            source.write_text(json.dumps(parse_list(raw(), NOW)), encoding='utf-8')
            with patch('sina_relay.utc_now', return_value=NOW):
                receive_feed(source, validate_feed, 'sina.json', root)
            self.assertEqual(json.loads(previous.read_text(encoding='utf-8'))['source'], 'sina-finance')
            self.assertFalse(staging.exists())


if __name__ == '__main__':
    unittest.main()
