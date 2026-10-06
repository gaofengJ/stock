"""Update only the mounted private guide configuration; never print its contents."""
from __future__ import print_function
import base64
import gzip
import hashlib
import io
import json
import os
import re
import stat
import subprocess
import sys
import time

KEY = 'ADMIN_PLAYBOOK_GZIP_BASE64'


def validate(encoded, expected_hash, expected_version):
    if not re.match(r'^[a-f0-9]{64}$', expected_hash):
        raise ValueError('Invalid expected digest')
    if not encoded or len(encoded) > 48000:
        raise ValueError('Invalid private payload size')
    try:
        raw = gzip.GzipFile(fileobj=io.BytesIO(base64.b64decode(encoded, validate=True))).read(1024 * 1024 + 1)
        if len(raw) > 1024 * 1024 or hashlib.sha256(raw).hexdigest() != expected_hash:
            raise ValueError()
        guide = json.loads(raw.decode('utf-8'))
        if guide['version'] != expected_version or [m['id'] for m in guide['maps']] != ['trading', 'review', 'learning', 'experience']:
            raise ValueError()
        ids = set()

        def visit(node):
            if not isinstance(node.get('id'), str) or node['id'] in ids or not node.get('title'):
                raise ValueError()
            ids.add(node['id'])
            for child in node.get('children', []):
                visit(child)
            if not node.get('children') and not node.get('points'):
                raise ValueError()
        for item in guide['maps']:
            visit(item['root'])
        return len(ids)
    except Exception:
        raise ValueError('Invalid private playbook configuration')


def replace_config(original, encoded):
    lines = original.decode('utf-8').splitlines()
    count = sum(bool(re.match(r'^\s*(?:export\s+)?' + KEY + r'\s*=', line)) for line in lines)
    if count != 1:
        raise ValueError('Expected one existing playbook configuration entry')
    return ('\n'.join(KEY + '="' + encoded + '"' if re.match(r'^\s*(?:export\s+)?' + KEY + r'\s*=', line) else line for line in lines) + '\n').encode('utf-8')


def write_in_place(path, data):
    # Preserve the inode: the running container has a bind mount to this file.
    with open(path, 'r+b') as stream:
        stream.seek(0)
        stream.write(data)
        stream.truncate()
        stream.flush()
        os.fsync(stream.fileno())


def main():
    import fcntl
    os.umask(0o077)
    encoded = os.environ[KEY]
    expected_hash = os.environ['PLAYBOOK_SHA256']
    expected_version = os.environ['PLAYBOOK_VERSION']
    nodes = validate(encoded, expected_hash, expected_version)
    with open('/var/lock/stock-back-release.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        container = json.loads(subprocess.check_output(['docker', 'inspect', 'stock-back']).decode('utf-8'))[0]
        if not container['State']['Running']:
            raise ValueError('Backend must already be running')
        mounts = [m for m in container['Mounts'] if m['Destination'] == '/run/stock/runtime.env' and m['Type'] == 'bind']
        if len(mounts) != 1 or mounts[0]['RW']:
            raise ValueError('Expected a single readonly runtime configuration mount')
        path = mounts[0]['Source']
        resolved = os.path.realpath(path)
        if not resolved.startswith('/opt/stock-release/') or os.path.islink(path) or not stat.S_ISREG(os.stat(path).st_mode):
            raise ValueError('Unexpected runtime configuration path')
        if stat.S_IMODE(os.stat(path).st_mode) & 0o077:
            raise ValueError('Runtime configuration must be owner-only')
        with open(path, 'rb') as stream:
            original = stream.read()
        updated = replace_config(original, encoded)
        child_env = dict(os.environ)
        child_env.pop(KEY, None)
        run = '/opt/stock-release/playbook-updates/' + time.strftime('%Y%m%d-%H%M%S') + '-' + str(os.getpid())
        os.makedirs(run, mode=0o700)
        with open(run + '/runtime.env.before', 'xb') as stream:
            stream.write(original)
            stream.flush()
            os.fsync(stream.fileno())
        with open(os.path.join(os.path.dirname(__file__), 'playbook-content-smoke.cjs'), 'rb') as stream:
            smoke = stream.read()
        try:
            write_in_place(path, updated)
            subprocess.check_call(['docker', 'restart', '-t', '30', 'stock-back'], env=child_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90)
            healthy = False
            for attempt in range(20):
                check = subprocess.run(['docker', 'exec', '-i', '-e', 'PLAYBOOK_SHA256=' + expected_hash, '-e', 'PLAYBOOK_VERSION=' + expected_version, 'stock-back', 'node'], input=smoke, env=child_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=45)
                if check.returncode == 0:
                    healthy = True
                    break
                time.sleep(3)
            if not healthy:
                raise ValueError('Private guide API checks failed')
            print(json.dumps({'status': 'verified', 'version': expected_version, 'nodes': nodes, 'admin': 200, 'anonymous': 401, 'cache': 'no-store'}))
        except BaseException:
            write_in_place(path, original)
            subprocess.check_call(['docker', 'restart', '-t', '30', 'stock-back'], env=child_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90)
            raise ValueError('Update failed; previous configuration restored and backend restarted')


if __name__ == '__main__':
    try:
        main()
    except BaseException:
        print('Private content update failed; inspect protected server state.', file=sys.stderr)
        sys.exit(1)
