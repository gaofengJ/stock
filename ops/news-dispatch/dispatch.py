#!/usr/bin/env python3
"""Trigger the existing overseas collector from a local systemd timer (Python 3.5+)."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import tempfile
import time
import urllib.error
import urllib.request
import uuid

API = 'https://api.github.com/repos/gaofengJ/stock/actions/workflows/bloomberg-news.yml'
ACTIVE = {'queued', 'in_progress', 'waiting', 'pending', 'requested'}
STALE_SECONDS = 15 * 60
UNCERTAIN_SECONDS = 10 * 60
MAX_BYTES = 2 * 1024 * 1024


class ApiError(Exception):
    def __init__(self, status=None, uncertain=False):
        self.status = status
        self.uncertain = uncertain
        super().__init__('GitHub API returned HTTP {}'.format(status) if status else 'GitHub API network request failed')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class GitHub:
    def __init__(self, token, opener=None, sleep=time.sleep):
        if not re.match(r'^[A-Za-z0-9_]{20,512}\Z', token or ''):
            raise ValueError('Missing or invalid NEWS_DISPATCH_TOKEN')
        self.token = token
        self.opener = opener or urllib.request.build_opener(NoRedirect())
        self.sleep = sleep

    def request(self, suffix='', payload=None):
        data = json.dumps(payload).encode('utf-8') if payload is not None else None
        request = urllib.request.Request(API + suffix, data=data, headers={
            'Authorization': 'Bearer ' + self.token,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'User-Agent': 'stock-news-dispatch',
            'X-GitHub-Api-Version': '2026-03-10',
        })
        # GET is safe to retry. A failed POST may already have started a run.
        attempts = 3 if data is None else 1
        for attempt in range(attempts):
            try:
                with self.opener.open(request, timeout=15) as response:
                    raw = response.read(MAX_BYTES + 1)
                    if len(raw) > MAX_BYTES:
                        raise ValueError('GitHub API response exceeds size limit')
                    return json.loads(raw.decode('utf-8')) if raw else {}
            except urllib.error.HTTPError as error:
                retry = error.code in (429, 500, 502, 503, 504) or (error.code == 403 and error.headers.get('X-RateLimit-Remaining') == '0')
                if retry and attempt + 1 < attempts:
                    self.sleep(2 ** (attempt + 1))
                    continue
                raise ApiError(error.code, uncertain=data is not None and error.code >= 500)
            except (urllib.error.URLError, OSError):
                if attempt + 1 < attempts:
                    self.sleep(2 ** (attempt + 1))
                    continue
                raise ApiError(uncertain=data is not None)
            except (ValueError, UnicodeError):
                raise ApiError(uncertain=data is not None)

    def runs(self):
        result = self.request('/runs?branch=master&per_page=30')
        if not isinstance(result, dict) or not isinstance(result.get('workflow_runs'), list):
            raise ApiError()
        return result['workflow_runs']

    def dispatch(self, dispatch_id):
        result = self.request('/dispatches', {'ref': 'master', 'inputs': {'deliver': True, 'dispatch_id': dispatch_id}})
        if not isinstance(result, dict):
            raise ApiError(uncertain=True)
        return result


def read_json(path):
    with path.open('rb') as stream:
        raw = stream.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError('JSON exceeds size limit')
    value = json.loads(raw.decode('utf-8'))
    if not isinstance(value, dict):
        raise ValueError('Invalid JSON record')
    return value


def atomic_json(path, value):
    descriptor, temporary = tempfile.mkstemp(prefix='.dispatch-', dir=str(path.parent))
    try:
        with os.fdopen(descriptor, 'w') as stream:
            json.dump(value, stream, ensure_ascii=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, str(path))
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def feed_health(root, now):
    result = {}
    for source, identity in [('sina', 'sina-finance'), ('bloomberg', 'bloomberg-markets')]:
        try:
            feed = read_json(root / (source + '.json'))
            generated = dt.datetime.strptime(feed['generated_at'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=dt.timezone.utc)
            age = int(now - generated.timestamp())
            if feed.get('source') != identity or age < -300 or not isinstance(feed.get('items'), list) or not feed['items']:
                raise ValueError('Invalid feed')
            result[source] = {'status': 'delayed' if age > STALE_SECONDS else 'ok', 'ageSeconds': max(age, 0), 'generatedAt': feed['generated_at']}
        except (OSError, ValueError, KeyError, TypeError):
            result[source] = {'status': 'missing_or_invalid'}
    return result


class Dispatcher:
    def __init__(self, api, state_file, feed_root, clock=time.time):
        self.api = api
        self.state_file = state_file
        self.feed_root = feed_root
        self.clock = clock

    def run(self):
        now = self.clock()
        try:
            state = read_json(self.state_file)
        except (OSError, ValueError):
            state = {}
        state.update(checkedAt=now, feeds=feed_health(self.feed_root, now), lastError='')
        if any(feed['status'] != 'ok' for feed in state['feeds'].values()):
            print('<4>NEWS_ALERT ' + json.dumps(state['feeds'], ensure_ascii=False))

        def save(outcome, **fields):
            state.update(outcome=outcome, **fields)
            atomic_json(self.state_file, state)
            print('NEWS_DISPATCH ' + json.dumps({'outcome': outcome, 'runId': state.get('runId')}))
            return state

        try:
            runs = self.api.runs()
            pending = state.get('pending')
            if isinstance(pending, dict):
                matched = next((run for run in runs if pending.get('id') and pending['id'] in str(run.get('display_title', ''))), None)
                if matched:
                    state.pop('pending', None)
                    return save('confirmed_dispatch', runId=matched.get('id'), lastDispatchAt=pending['sentAt'])
                if now - pending.get('sentAt', now) < UNCERTAIN_SECONDS:
                    return save('awaiting_dispatch_confirmation')
                state.pop('pending', None)
            active = next((run for run in runs if run.get('status') in ACTIVE), None)
            if active:
                return save('skipped_active_run', runId=active.get('id'))
            if now - state.get('lastDispatchAt', 0) < 240:
                return save('skipped_recent_dispatch')
            dispatch_id = 'server-{}-{}'.format(int(now), uuid.uuid4().hex[:12])
            state['pending'] = {'id': dispatch_id, 'sentAt': now}
            # Save the intent before POST, so a timeout/restart cannot blindly duplicate it.
            atomic_json(self.state_file, state)
            result = self.api.dispatch(dispatch_id)
            state.pop('pending', None)
            return save('dispatched', lastDispatchAt=now, runId=result.get('workflow_run_id'))
        except ApiError as error:
            if not error.uncertain:
                state.pop('pending', None)
            save('dispatch_uncertain' if error.uncertain else 'failed', lastError=str(error))
            raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', type=Path, default=Path('/opt/stock-news/scheduler/state/status.json'))
    parser.add_argument('--feeds', type=Path, default=Path('/opt/stock-news/feeds'))
    parser.add_argument('--check-token', action='store_true')
    parser.add_argument('--inspect', action='store_true')
    args = parser.parse_args()
    if args.inspect:
        print(json.dumps({'state': read_json(args.state) if args.state.exists() else {}, 'feeds': feed_health(args.feeds, time.time())}, ensure_ascii=False))
        return
    api = GitHub(os.environ.get('NEWS_DISPATCH_TOKEN', ''))
    if args.check_token:
        workflow = api.request()
        if workflow.get('state') != 'active':
            raise ValueError('Collector workflow is not active')
        api.runs()
        print('NEWS_AUTH_OK repository=gaofengJ/stock workflow=bloomberg-news.yml')
        return
    # Also protect direct invocations outside systemd against concurrent dispatches.
    import fcntl
    with (args.state.parent / 'dispatch.lock').open('a') as lock:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('NEWS_DISPATCH skipped_local_lock')
            return
        Dispatcher(api, args.state, args.feeds).run()


if __name__ == '__main__':
    try:
        main()
    except (ApiError, ValueError, OSError) as error:
        # Exception bodies and request headers are intentionally never logged.
        message = str(error) if isinstance(error, (ApiError, ValueError)) else 'Scheduler file access failed'
        print('<3>NEWS_DISPATCH_ERROR ' + message)
        raise SystemExit(1)
