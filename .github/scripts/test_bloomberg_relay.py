import copy
import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from bloomberg_relay import parse_rss, receive, validate_feed

NOW = dt.datetime(2026, 10, 1, 6, 0, tzinfo=dt.timezone.utc)
RSS = b'''<rss><channel><item><title>Markets &amp; economy</title><link>https://www.bloomberg.com/news/articles/example</link><description>&lt;p&gt;Public summary&lt;/p&gt;</description><pubDate>Thu, 01 Oct 2026 05:30:00 GMT</pubDate></item></channel></rss>'''


class BloombergRelayTests(unittest.TestCase):
    def test_public_summary_and_original_time(self):
        feed = parse_rss(RSS, NOW)
        self.assertEqual(feed['items'][0]['title'], 'Markets & economy')
        self.assertEqual(feed['items'][0]['date_published'], '2026-10-01T05:30:00Z')

    def test_untrusted_origins_and_stale_data_are_rejected(self):
        feed = parse_rss(RSS, NOW)
        for invalid in ['http://127.0.0.1/private', 'https://www.bloomberg.com.evil.example/story', 'https://user:pass@www.bloomberg.com/story']:
            altered = copy.deepcopy(feed)
            altered['items'][0].update(url=invalid, id=invalid)
            with self.assertRaises(ValueError):
                validate_feed(altered, NOW)
        with self.assertRaises(ValueError):
            validate_feed(feed, NOW + dt.timedelta(minutes=46))
        with self.assertRaises(ValueError):
            parse_rss(b'<!DOCTYPE rss><rss/>', NOW)

    def test_failed_delivery_keeps_previous_feed_and_success_replaces_atomically(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            destination = root / 'feeds'
            destination.mkdir()
            previous = destination / 'bloomberg.json'
            previous.write_text('previous valid snapshot', encoding='utf-8')
            staging = root / 'staging' / '123'
            staging.mkdir(parents=True)
            source = staging / 'bloomberg.json'
            source.write_text('{}', encoding='utf-8')
            with self.assertRaises(ValueError):
                receive(source, root)
            self.assertEqual(previous.read_text(encoding='utf-8'), 'previous valid snapshot')
            source.write_text(json.dumps(parse_rss(RSS, NOW)), encoding='utf-8')
            with patch('bloomberg_relay.utc_now', return_value=NOW):
                receive(source, root)
            self.assertEqual(json.loads(previous.read_text(encoding='utf-8'))['source'], 'bloomberg-markets')
            self.assertFalse(staging.exists())

    def test_delivery_rejects_paths_outside_its_run_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'bloomberg.json'
            source.write_text('{}', encoding='utf-8')
            with self.assertRaises(ValueError):
                receive(source, root)


if __name__ == '__main__':
    unittest.main()
