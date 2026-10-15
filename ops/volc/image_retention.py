#!/usr/bin/python3
"""Remove only obsolete stock application images; never prune Docker or data.

The caller holds the same lock as release/backup. Current + previous successful
release and every container (including stopped containers) are always protected.
"""
import argparse
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time

DEPLOY = Path('/opt/stock/deploy')
STATE = Path('/srv/stock/state/image-retention.json')
REPORT = Path('/srv/stock/deploy-status/image-retention.json')
REF = re.compile(r'registry\.cn-hangzhou\.aliyuncs\.com/mufengtongxue/stock-(?:back|front|blog)(?:@sha256:[0-9a-f]{64}|:volc-[0-9a-f]{40})')
KEYS = ('BACK_IMAGE', 'FRONT_IMAGE', 'ARTICLE_IMAGE')
GRACE_SECONDS = 24 * 3600


def run(args):
    return subprocess.check_output(args, stderr=subprocess.PIPE, timeout=120).decode().strip()


def atomic(path, value, mode=0o600):
    fd, name = tempfile.mkstemp(prefix='.retention-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream, indent=2); stream.write('\n')
            stream.flush(); os.fsync(stream.fileno())
        os.chmod(name, mode)
        os.replace(name, path)
    finally:
        if os.path.exists(name): os.unlink(name)


def release_values(path):
    if path.is_symlink(): raise ValueError('Symlinked release manifest')
    values = {}
    for line in path.read_text().splitlines():
        if '=' in line:
            key, value = line.split('=', 1)
            if key in (*KEYS, 'RELEASE_SHA'):
                if key in values: raise ValueError('Duplicate release field')
                values[key] = value
    if (not re.fullmatch('[0-9a-f]{40}', values.get('RELEASE_SHA', ''))
            or any(not REF.fullmatch(values.get(k, '')) or '@sha256:' not in values[k] for k in KEYS)):
        raise ValueError('Incomplete immutable release manifest')
    return values


def release_pair(deploy):
    current = release_values(deploy / 'release.env')
    matches = []
    for path in (deploy / 'releases').glob('cd-*/deployment.json'):
        if path.is_symlink() or path.parent.is_symlink(): raise ValueError('Symlinked release history')
        report = json.loads(path.read_text())
        if report.get('state') != 'deployed' or report.get('production') is not True:
            continue
        candidate = release_values(path.parent / 'candidate.env')
        if candidate != current or report.get('commit') != current['RELEASE_SHA']:
            continue
        stamp = dt.datetime.fromisoformat(report['completedAt'])
        if stamp.utcoffset() is None: raise ValueError('Invalid release timestamp')
        matches.append((stamp, path.parent))
    if not matches: raise ValueError('No successful history matching the active release; preserve everything')
    previous = release_values(max(matches)[1] / 'previous.env')
    return current, previous


def container_images():
    ids = run(['docker', 'ps', '-aq']).split()
    return {run(['docker', 'inspect', '--format', '{{.Image}}', cid]) for cid in ids}


def successful_refs(deploy):
    refs = set()
    for path in (deploy / 'releases').glob('cd-*/deployment.json'):
        value = json.loads(path.read_text())
        if value.get('state') == 'deployed' and value.get('production') is True:
            for name in ('candidate.env', 'previous.env'):
                values = release_values(path.parent / name)
                refs.update(values[k] for k in KEYS)
    return refs


def plan(images, protected, first_seen, now, released_refs=frozenset()):
    candidates = []
    for image in images:
        identity = image['Id']
        refs = (image.get('RepoDigests') or []) + (image.get('RepoTags') or [])
        # Unknown/dangling images and images also tagged for another service stay.
        if identity in protected or not refs or any(not REF.fullmatch(ref) for ref in refs):
            continue
        seen = first_seen.get(identity, now)
        if not isinstance(seen, (int, float)) or not 0 <= seen <= now:
            raise ValueError('Invalid image observation timestamp')
        # Use local first-seen time, NOT image Created (reproducible builds use epoch 0).
        # Older known releases can go immediately after a healthy successor.
        # Unrecorded/staged images get a full day for failure diagnosis.
        if set(refs) & released_refs or now - seen >= GRACE_SECONDS:
            candidates.append({'id': identity, 'refs': sorted(refs)})
    return candidates


def gate_state(production=Path('/etc/stock/production.enabled'),
               maintenance=Path('/srv/stock/state/maintenance'), queue=Path('/run/stock-cd')):
    if not production.is_file() or maintenance.exists():
        return 'deferred'
    if any(list((queue / p).glob('*.json')) for p in ('queue', 'claimed')):
        return 'deferred-queued-release'
    return None


def cleanup_locked(apply=False, deploy=DEPLOY, state=STATE, report_path=REPORT):
    blocked = gate_state()
    if blocked: return {'state': blocked}
    current, previous = release_pair(deploy)
    refs = {v[k] for v in (current, previous) for k in KEYS}
    protected = {run(['docker', 'image', 'inspect', '--format', '{{.Id}}', ref]) for ref in refs}
    protected |= container_images()
    image_ids = sorted(set(run(['docker', 'image', 'ls', '-aq', '--no-trunc']).split()))
    images = json.loads(run(['docker', 'image', 'inspect', *image_ids])) if image_ids else []
    now = time.time()
    observed = json.loads(state.read_text()).get('firstSeen', {}) if state.exists() else {}
    observed = {image['Id']: observed.get(image['Id'], now) for image in images}
    candidates = plan(images, protected, observed, now, successful_refs(deploy))
    report = {'state': 'applied' if apply else 'preview', 'checkedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
              'current': current['RELEASE_SHA'], 'previous': previous['RELEASE_SHA'],
              'protectedImages': sorted(protected), 'candidates': candidates, 'removed': [], 'errors': [],
              'graceHours': 24, 'freeBefore': shutil.disk_usage('/').free}
    if apply:
        atomic(state, {'firstSeen': observed})
        for item in candidates:
            # Recheck live references. Docker's non-force removal is the final race guard.
            blocked = gate_state()
            if blocked:
                report['state'] = blocked
                break
            if release_values(deploy / 'release.env') != current:
                raise ValueError('Active release changed; stop cleanup')
            if item['id'] in container_images(): continue
            result = subprocess.run(['docker', 'image', 'rm', item['id']], capture_output=True, text=True, timeout=120)
            if result.returncode == 0:
                report['removed'].append(item)
                observed.pop(item['id'], None)
            else:
                report['errors'].append({'id': item['id'], 'reason': 'docker-removal-refused'})
        for ref in refs: run(['docker', 'image', 'inspect', '--format', '{{.Id}}', ref])
        atomic(state, {'firstSeen': observed})
        report['freeAfter'] = shutil.disk_usage('/').free
        atomic(report_path, report, 0o644)
    return report


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    with open('/run/lock/stock-maintenance.lock', 'a') as lock:
        try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print(json.dumps({'state': 'deferred-maintenance-lock'})); return
        print(json.dumps(cleanup_locked(args.apply)))


if __name__ == '__main__':
    main()
