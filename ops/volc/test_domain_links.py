import unittest
from migrate_public_links import normalize


class DomainLinksTest(unittest.TestCase):
    def test_only_known_site_hosts_and_public_ports_are_rewritten(self):
        old = 'http://14.103.103.4/review/?date=2026-10-23&code=000001.SZ#notes'
        self.assertEqual(normalize(old), 'https://stock.mufengtongxue.com/review/?date=2026-10-23&code=000001.SZ#notes')
        for text in ['https://14.103.103.40/', 'https://14.103.103.4.evil.test/', 'https://14.103.103.4:3000/', 'https://14.103.103.4@evil.test/', 'https://example.test/?source=https://14.103.103.4/', 'data:image/png;base64,abc']:
            self.assertEqual(normalize(text), text)

    def test_nested_data_and_original_are_preserved(self):
        source = {'text':'原文 [图](https://47.99.111.167/analysis/?date=2026-10-23)', 'revision':4, 'images':[{'data':'data:image/png;base64,abc'}]}
        result = normalize(source)
        self.assertIn('https://stock.mufengtongxue.com/analysis/?date=2026-10-23', result['text'])
        self.assertIn('47.99.111.167', source['text'])
        self.assertEqual(result['images'], source['images'])
