"""Deploy only fixed, CI-verified repository files through one version pointer.

Called by the root release worker after verify_ci, under the maintenance lock.
No code, paths, commands or URLs are accepted from the SSH release request.
"""
from contextlib import contextmanager, ExitStack
import concurrent.futures
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path('/opt/stock/ops')
FILES = {name: 'ops/volc/' + name for name in (
    'health_dispatch.py', 'release_worker.py', 'release_contract.py',
    'backup_database.py', 'ops_release.py', 'test_health_dispatch.py')}
FILES.update({'dispatch.py': 'ops/news-dispatch/dispatch.py',
              'test_dispatch.py': 'ops/news-dispatch/test_dispatch.py'})
LOCKS = (Path('/opt/stock-news/scheduler/state/dispatch.lock'),
         Path('/var/lib/stock-health-dispatch/dispatch.lock'))
LIMIT = 512 * 1024


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch(commit, source):
    url = 'https://raw.githubusercontent.com/gaofengJ/stock/' + commit + '/' + source
    for attempt in range(3):
        try:
            with urllib.request.build_opener(NoRedirect()).open(url, timeout=20) as response:
                data = response.read(LIMIT + 1)
                length = response.headers.get('Content-Length')
                if not data or len(data) > LIMIT or (length and int(length) != len(data)):
                    raise ValueError('Invalid source size')
                compile(data, source, 'exec')
                return data
        except (OSError, ValueError, SyntaxError):
            if attempt == 2:
                raise RuntimeError('Cannot verify fixed ops source: ' + source) from None
            time.sleep(2 ** attempt)


def verify(folder):
    manifest = json.loads((folder / 'manifest.json').read_text())
    if set(manifest['sha256']) != set(FILES):
        raise ValueError('Unexpected ops manifest paths')
    for name, digest in manifest['sha256'].items():
        path = folder / name
        if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError('Ops checksum mismatch: ' + name)
    return manifest


def sandbox_run(folder, args):
    # These fixed tests/import checks need no production credentials or privileged writes.
    kwargs = {'user': 'stock-news-dispatch', 'group': 'stock-news-dispatch', 'extra_groups': []} if os.geteuid() == 0 else {}
    result = subprocess.run(['/usr/bin/python3', '-B'] + args, cwd=folder,
                            env={'PATH': '/usr/bin:/bin', 'PYTHONPATH': str(folder), 'HOME': '/tmp'},
                            capture_output=True, timeout=120, **kwargs)
    if result.returncode:
        raise RuntimeError('Ops validation failed; exit=' + str(result.returncode))


def prepare(commit, root=ROOT, download=fetch, validate=sandbox_run):
    if not re.fullmatch('[a-f0-9]{40}', commit):
        raise ValueError('Invalid ops commit')
    versions = root / 'versions'
    if not (root / 'current').is_symlink():
        raise ValueError('Ops deployment bootstrap required')
    destination = versions / commit
    if destination.exists():
        if verify(destination)['commit'] != commit:
            raise ValueError('Ops version mismatch')
        return destination
    staging = Path(tempfile.mkdtemp(prefix='.staging-', dir=versions))
    staging.chmod(0o755)
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            payloads = list(pool.map(lambda item: (item[0], download(commit, item[1])), FILES.items()))
        hashes = {}
        for name, data in payloads:
            compile(data, name, 'exec')
            path = staging / name
            path.write_bytes(data); path.chmod(0o644)
            hashes[name] = hashlib.sha256(data).hexdigest()
        (staging / 'manifest.json').write_text(json.dumps({'commit': commit, 'sha256': hashes}, indent=2))
        (staging / 'manifest.json').chmod(0o644)
        for pattern in ('test_health_dispatch.py', 'test_dispatch.py'):
            validate(staging, ['-m', 'unittest', 'discover', '-s', str(staging), '-p', pattern])
        validate(staging, ['-c', 'import health_dispatch, dispatch, release_worker, ops_release'])
        verify(staging)
        staging.rename(destination)
        return destination
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def point(root, folder):
    # Both targets must be previously validated root-owned version directories.
    if folder.parent.resolve() != (root / 'versions').resolve():
        raise ValueError('Ops version outside fixed root')
    temporary = root / '.next'
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(folder)
    temporary.replace(root / 'current')
    fd = os.open(root, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


@contextmanager
def transaction(folder, root=ROOT, locks=LOCKS):
    """Commit the script set with the app, or restore it on any app failure."""
    verify(folder)
    previous = (root / 'current').resolve(strict=True)
    if previous == folder.resolve():
        yield str(previous)
        return
    with ExitStack() as stack:
        deadline = time.monotonic() + 120
        for path in locks:
            lock = stack.enter_context(path.open('a'))
            while True:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if time.monotonic() >= deadline:
                        raise TimeoutError('Ops scheduler lock busy')
                    time.sleep(0.2)
        point(root, folder)
        try:
            yield str(previous)
        except BaseException:
            point(root, previous)
            raise
        else:
            # Retain previous immutable files for manual rollback; no automatic deletion.
            temporary = root / '.previous-next'
            temporary.unlink(missing_ok=True)
            temporary.symlink_to(previous)
            temporary.replace(root / 'previous')
