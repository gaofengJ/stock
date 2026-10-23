import datetime as dt
import unittest
from health_snapshot import operational_issues


class OperationalHealthTest(unittest.TestCase):
    def test_dates_and_dispatch_freshness_have_independent_failures(self):
        now = dt.datetime(2026, 10, 23, 12, tzinfo=dt.timezone.utc)
        data = {'expectedTradeDate': '2026-10-22', 'latestTradeDate': '2026-10-22', 'staleNewsSources': None}
        self.assertEqual(operational_issues(data, {'successfulCheckAt': now.timestamp() - 600}, now), [])
        stale = {**data, 'latestTradeDate': '2026-10-21', 'staleNewsSources': 'fixture'}
        self.assertEqual(operational_issues(stale, {}, now), ['daily_data_stale', 'news_sources_stale', 'health_dispatch_stale'])
        self.assertIn('data_freshness_unavailable', operational_issues({}, {}, now))
        self.assertEqual(operational_issues(data, {'successfulCheckAt': now.timestamp(), 'outcome': 'blocked_stale_active'}, now), ['health_workflow_stalled'])


if __name__ == '__main__':
    unittest.main()
