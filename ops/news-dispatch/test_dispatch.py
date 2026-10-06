import datetime as dt
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

from dispatch import ApiError, Dispatcher, GitHub, atomic_json, feed_health, read_json

NOW = dt.datetime(2026, 10, 6, 14, 0, tzinfo=dt.timezone.utc).timestamp()
TOKEN = 'github_pat_test_' + 'x' * 80


class FakeApi:
    def __init__(self, runs=None, error=None):
        self.items = runs or []
        self.error = error
        self.calls = []

    def runs(self):
        return self.items

    def dispatch(self, dispatch_id):
        self.calls.append(dispatch_id)
        if self.error:
            raise self.error
        return {'workflow_run_id': 123}


class Response(io.BytesIO):
    pass


class Opener:
    def __init__(self, results):
        self.results = iter(results)
        self.requests = []

    def open(self, request, timeout):
        self.requests.append(request)
        result = next(self.results)
        if isinstance(result, Exception):
            raise result
        return Response(result)


class DispatchTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.state = self.root / 'status.json'
        for source, identity in [('sina', 'sina-finance'), ('bloomberg', 'bloomberg-markets')]:
            atomic_json(self.root / (source + '.json'), {'source': identity, 'generated_at': '2026-10-06T13:59:00Z', 'items': [{}]})

    def tearDown(self):
        self.temporary.cleanup()

    def run_dispatch(self, api, now=NOW):
        return Dispatcher(api, self.state, self.root, lambda: now).run()

    def test_starts_collection_and_records_only_nonsecret_status(self):
        api = FakeApi()
        result = self.run_dispatch(api)
        self.assertEqual(result['outcome'], 'dispatched')
        self.assertEqual(result['runId'], 123)
        self.assertEqual(len(api.calls), 1)
        self.assertNotIn('pending', read_json(self.state))
        self.assertNotIn(TOKEN, self.state.read_text())

    def test_active_manual_or_scheduled_run_prevents_duplicate_dispatch(self):
        for status in ['queued', 'in_progress', 'waiting', 'pending', 'requested']:
            api = FakeApi([{'id': 7, 'status': status}])
            self.assertEqual(self.run_dispatch(api)['outcome'], 'skipped_active_run')
            self.assertFalse(api.calls)

    def test_repeated_tick_is_deduplicated_and_next_five_minute_tick_runs(self):
        api = FakeApi()
        self.run_dispatch(api)
        self.assertEqual(self.run_dispatch(api, NOW + 100)['outcome'], 'skipped_recent_dispatch')
        self.assertEqual(len(api.calls), 1)
        self.assertEqual(self.run_dispatch(api, NOW + 300)['outcome'], 'dispatched')
        self.assertEqual(len(api.calls), 2)

    def test_post_network_error_is_not_blindly_retried(self):
        api = FakeApi(error=ApiError(uncertain=True))
        with self.assertRaises(ApiError):
            self.run_dispatch(api)
        record = read_json(self.state)
        self.assertEqual(record['outcome'], 'dispatch_uncertain')
        dispatch_id = record['pending']['id']
        api.error = None
        self.assertEqual(self.run_dispatch(api, NOW + 300)['outcome'], 'awaiting_dispatch_confirmation')
        self.assertEqual(len(api.calls), 1)
        api.items = [{'id': 99, 'status': 'completed', 'display_title': '资讯采集 · ' + dispatch_id}]
        result = self.run_dispatch(api, NOW + 305)
        self.assertEqual(result['outcome'], 'confirmed_dispatch')
        self.assertEqual(result['runId'], 99)
        self.assertEqual(len(api.calls), 1)

    def test_unconfirmed_post_recovers_after_bounded_wait(self):
        api = FakeApi(error=ApiError(502, uncertain=True))
        with self.assertRaises(ApiError):
            self.run_dispatch(api)
        api.error = None
        self.assertEqual(self.run_dispatch(api, NOW + 600)['outcome'], 'dispatched')
        self.assertEqual(len(api.calls), 2)

    def test_permission_failure_is_recorded_and_next_tick_can_retry_after_rotation(self):
        api = FakeApi(error=ApiError(403))
        with self.assertRaises(ApiError):
            self.run_dispatch(api)
        record = read_json(self.state)
        self.assertEqual(record['lastError'], 'GitHub API returned HTTP 403')
        self.assertNotIn('pending', record)
        api.error = None
        self.assertEqual(self.run_dispatch(api, NOW + 300)['outcome'], 'dispatched')

    def test_fifteen_minute_health_boundary_and_missing_source_are_distinct(self):
        exact = feed_health(self.root, NOW + 840)
        self.assertEqual(exact['sina']['status'], 'ok')
        stale = feed_health(self.root, NOW + 841)
        self.assertEqual(stale['sina']['status'], 'delayed')
        (self.root / 'sina.json').unlink()
        self.assertEqual(feed_health(self.root, NOW)['sina']['status'], 'missing_or_invalid')
        self.assertEqual(feed_health(self.root, NOW)['bloomberg']['status'], 'ok')

    def test_corrupt_state_recovers_after_checking_for_active_runs(self):
        self.state.write_text('{corrupt')
        api = FakeApi([{'id': 7, 'status': 'in_progress'}])
        self.assertEqual(self.run_dispatch(api)['outcome'], 'skipped_active_run')
        self.assertFalse(api.calls)

    def test_invalid_and_future_feed_timestamps_are_not_healthy(self):
        for value in ['invalid', '2026-10-07T14:00:00Z']:
            atomic_json(self.root / 'sina.json', {'source': 'sina-finance', 'generated_at': value, 'items': [{}]})
            self.assertEqual(feed_health(self.root, NOW)['sina']['status'], 'missing_or_invalid')

    def test_get_transient_errors_retry_but_authorization_errors_do_not(self):
        transient = urllib.error.HTTPError('https://api.github.com', 503, '', {}, None)
        opener = Opener([transient, urllib.error.URLError('timeout'), b'{"workflow_runs": []}'])
        sleeps = []
        self.assertEqual(GitHub(TOKEN, opener, sleeps.append).runs(), [])
        self.assertEqual(sleeps, [2, 4])
        denied = Opener([urllib.error.HTTPError('https://api.github.com', 401, '', {}, None)])
        with self.assertRaises(ApiError):
            GitHub(TOKEN, denied, sleeps.append).runs()
        self.assertEqual(len(denied.requests), 1)

    def test_post_transport_does_not_retry_or_include_token_in_errors(self):
        opener = Opener([urllib.error.URLError(TOKEN)])
        with self.assertRaises(ApiError) as raised:
            GitHub(TOKEN, opener).dispatch('server-example')
        self.assertTrue(raised.exception.uncertain)
        self.assertNotIn(TOKEN, str(raised.exception))
        self.assertEqual(len(opener.requests), 1)
        payload = json.loads(opener.requests[0].data.decode('utf-8'))
        self.assertEqual(payload, {'ref': 'master', 'inputs': {'deliver': True, 'dispatch_id': 'server-example'}})

    def test_invalid_or_redirected_api_response_fails_closed(self):
        for response in [b'{}', b'{invalid', b'x' * (2 * 1024 * 1024 + 1), urllib.error.HTTPError('https://api.github.com', 302, '', {}, None)]:
            with self.assertRaises(ApiError):
                GitHub(TOKEN, Opener([response])).runs()

    def test_invalid_credentials_fail_without_echoing_them(self):
        for token in ['', TOKEN + '\nsecret', TOKEN + '\n', TOKEN + '"']:
            with self.assertRaises(ValueError) as raised:
                GitHub(token)
            self.assertEqual(str(raised.exception), 'Missing or invalid NEWS_DISPATCH_TOKEN')


if __name__ == '__main__':
    unittest.main()
