import copy
import datetime as dt
import unittest
from bloomberg_relay import parse_rss, validate_feed
from translate_bloomberg import fingerprint, translate_feed, text_only, checked_translation, MAX_CACHE_ITEMS

NOW = dt.datetime(2026, 10, 1, 6, 0, tzinfo=dt.timezone.utc)
RSS = b'''<rss><channel><item><title>Stocks rise</title><link>https://www.bloomberg.com/news/articles/example</link><description>&lt;p&gt;Public summary&lt;/p&gt;</description><pubDate>Thu, 01 Oct 2026 05:30:00 GMT</pubDate></item></channel></rss>'''


class BloombergTranslationTests(unittest.TestCase):
    def test_numeric_omissions_are_not_published_as_financial_translations(self):
        with self.assertRaises(ValueError):
            checked_translation('Bank announces $5 billion swap', lambda text: '银行宣布掉期')
        self.assertEqual(checked_translation('Stocks rise 0.32%', lambda text: '股票上涨0.32%'), '股票上涨0.32%')
    def test_cache_reuses_unchanged_text_and_retranslates_an_updated_summary(self):
        calls = []
        def translate(text):
            calls.append(text)
            return '中文：' + text
        feed, cache, stats = translate_feed(parse_rss(RSS, NOW), {}, translate, NOW)
        self.assertEqual(stats, {'cached': 0, 'translated': 1, 'failed': 0})
        original = copy.deepcopy(feed['items'][0])
        feed, cache, stats = translate_feed(parse_rss(RSS, NOW), cache, translate, NOW)
        self.assertEqual(len(calls), 2)
        self.assertEqual(stats['cached'], 1)
        self.assertEqual(feed['items'][0]['translation'], original['translation'])
        feed['items'][0]['content_html'] = '<p>Updated summary</p>'
        feed, _, stats = translate_feed(feed, cache, translate, NOW)
        self.assertEqual(stats['translated'], 1)
        self.assertEqual(feed['items'][0]['translation']['source_hash'], fingerprint(feed['items'][0]))

    def test_failure_and_invalid_cached_translation_leave_original_english(self):
        feed = parse_rss(RSS, NOW)
        item = copy.deepcopy(feed['items'][0])
        def failure(text):
            raise RuntimeError('Model unavailable')
        feed, _, stats = translate_feed(feed, {'entries': {fingerprint(item): {'seen': NOW.timestamp(), 'translation': {'title': 'untrusted'}}}}, failure, NOW)
        self.assertEqual(stats['failed'], 1)
        self.assertEqual(feed['items'][0], item)

    def test_html_is_never_sent_as_translation_markup(self):
        self.assertEqual(text_only('<p>Stocks &amp; bonds</p><script>alert(1)</script><p>Rise</p>'), 'Stocks & bonds Rise')

    def test_cache_is_bounded_and_expired_entries_are_removed(self):
        old = (NOW - dt.timedelta(days=31)).timestamp()
        entries = {'old': {'seen': old}, 'future': {'seen': NOW.timestamp() + 3600}}
        entries.update({str(i): {'seen': NOW.timestamp()} for i in range(MAX_CACHE_ITEMS + 100)})
        _, cache, _ = translate_feed(parse_rss(RSS, NOW), {'entries': entries}, lambda text: '中文' + text, NOW)
        self.assertEqual(len(cache['entries']), MAX_CACHE_ITEMS)
        self.assertNotIn('old', cache['entries'])
        self.assertNotIn('future', cache['entries'])

    def test_delivery_drops_stale_translation_without_rejecting_english(self):
        feed, _, _ = translate_feed(parse_rss(RSS, NOW), {}, lambda text: '中文' + text, NOW)
        feed['items'][0]['title'] = 'English changed'
        validate_feed(feed, NOW)
        self.assertNotIn('translation', feed['items'][0])


if __name__ == '__main__':
    unittest.main()
