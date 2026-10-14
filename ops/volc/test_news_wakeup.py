import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
import news_wakeup


class NewsWakeupTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.validators = patch.dict(news_wakeup.SOURCES, {'bloomberg': lambda f: f, 'sina': lambda f: f})
        self.validators.start()
        self.addCleanup(self.validators.stop)
        for source in news_wakeup.SOURCES:
            (self.root / (source + '.json')).write_text(json.dumps({'content': 'original'}))

    def test_audit_never_acknowledges_or_mutates(self):
        previous = {}
        updated, results = news_wakeup.inspect(self.root, previous)
        self.assertEqual(updated, {})
        self.assertTrue(all(item['state'] == 'pending' for item in results))
        self.assertEqual(previous, {})

    def test_translation_content_change_wakes_source_once(self):
        reset = Mock()
        state, _ = news_wakeup.inspect(self.root, {}, reset)
        self.assertEqual(reset.call_count, 2)
        reset.reset_mock()
        state, _ = news_wakeup.inspect(self.root, state, reset)
        reset.assert_not_called()
        (self.root / 'bloomberg.json').write_text(json.dumps({'content': 'translated'}))
        state, _ = news_wakeup.inspect(self.root, state, reset)
        reset.assert_called_once_with('bloomberg')

    def test_failed_source_is_retried_and_does_not_block_other_source(self):
        def reset(source):
            if source == 'bloomberg':
                raise RuntimeError('SQL failure')
        state, results = news_wakeup.inspect(self.root, {}, reset)
        self.assertNotIn('bloomberg', state)
        self.assertIn('sina', state)
        self.assertEqual(results[0]['state'], 'failed')
        retry = Mock()
        state, _ = news_wakeup.inspect(self.root, state, retry)
        retry.assert_called_once_with('bloomberg')

    def test_invalid_feed_and_symlink_never_reach_database(self):
        (self.root / 'bloomberg.json').write_bytes(b'not json')
        (self.root / 'sina.json').unlink()
        (self.root / 'sina.json').symlink_to(self.root / 'bloomberg.json')
        reset = Mock()
        state, results = news_wakeup.inspect(self.root, {}, reset)
        reset.assert_not_called()
        self.assertEqual(state, {})
        self.assertTrue(all(item['state'] == 'failed' for item in results))


if __name__ == '__main__':
    unittest.main()
