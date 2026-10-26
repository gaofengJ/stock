"""Reversible isolated AI service update; no credentials, business writes or inference."""
import hashlib
import json
import pathlib
import re
import subprocess
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
NAME = 'stock-personal-console'
TASKS = pathlib.Path('/srv/stock-personal-console/tasks.json')


def run(args, timeout=120):
    result = subprocess.run(args, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError('command_failed:' + args[0])
    return result.stdout


def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]


def main():
    initial = TASKS.read_bytes()
    if any(t['status'] in ['running', 'preparing', 'cancelling'] for t in json.loads(initial)):
        raise RuntimeError('active_task_preserved')
    state = inspect(NAME)
    base = state['Config']['Image']
    if not re.fullmatch(r'stock-personal-console:[a-zA-Z0-9_.-]+', base):
        raise RuntimeError('unexpected_console_image')
    digest = hashlib.sha256(b''.join(p.read_bytes() for p in sorted([*ROOT.glob('*.mjs'), *ROOT.glob('skills/**/*.md')]))).hexdigest()[:12]
    image = 'stock-personal-console:review-stream-' + digest
    backup = NAME + '-before-review-' + digest
    (ROOT / 'Dockerfile').write_text('FROM ' + base + '\nCOPY core.mjs runner.mjs server.mjs context.mjs stream.mjs /app/\nCOPY skills/ /app/skills/\n')
    run(['docker', 'build', '--network=none', '-t', image, str(ROOT)], 180)
    run(['docker', 'run', '--rm', '--network=none', '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m,mode=1777', '--entrypoint', 'node', '--mount', 'type=bind,src=' + str(ROOT) + ',dst=/checks,readonly', image, '--test', '/checks/console.test.mjs', '/checks/context.test.mjs', '/checks/stream.test.mjs'])
    # Verify the pinned CLI accepts the app-server protocol without making a model call.
    run(['docker', 'run', '--rm', '--network=none', '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m,mode=1777', '--entrypoint', '/usr/local/bin/codex', image, 'app-server', 'generate-json-schema', '--out', '/tmp/schema'])
    if TASKS.read_bytes() != initial:
        raise RuntimeError('task_state_changed_before_release')
    networks = list(state['NetworkSettings']['Networks'])
    run(['docker', 'stop', '--time', '8', NAME])
    run(['docker', 'rename', NAME, backup])
    disconnected = []
    try:
        for network in networks:
            run(['docker', 'network', 'disconnect', network, backup]); disconnected.append(network)
        args = ['docker', 'create', '--name', NAME, '--restart=no', '--network', networks[0], '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--cpus=0.75', '--memory=768m', '--memory-swap=768m', '--pids-limit=128', '--ulimit', 'core=0', '--log-driver=none', '-p', '127.0.0.1:18787:8787']
        for mount in state['Mounts']:
            if mount['Type'] == 'bind':
                args += ['--mount', 'type=bind,src=' + mount['Source'] + ',dst=' + mount['Destination'] + ('' if mount['RW'] else ',readonly')]
        args += ['--tmpfs', '/tmp:rw,nosuid,nodev,size=64m,mode=1777', '--tmpfs', '/workspace:rw,nosuid,nodev,size=16m,uid=10001,gid=10001,mode=700', image]
        run(args)
        for network in networks[1:]: run(['docker', 'network', 'connect', network, NAME])
        run(['docker', 'start', NAME])
        healthy = False
        for _ in range(20):
            try:
                with urllib.request.urlopen('http://127.0.0.1:18787/healthz', timeout=3) as response:
                    healthy = response.status == 200
                if healthy: break
            except Exception: pass
            time.sleep(.5)
        if not healthy: raise RuntimeError('health_failed')
        if json.loads(TASKS.read_bytes()) != json.loads(initial): raise RuntimeError('task_state_changed')
        print(json.dumps({'updated': True, 'image': image, 'rollback': backup, 'taskStateUnchanged': True, 'modelCalls': 0}), flush=True)
    except Exception:
        subprocess.run(['docker', 'rm', '-f', NAME], capture_output=True)
        run(['docker', 'rename', backup, NAME])
        for network in disconnected: run(['docker', 'network', 'connect', network, NAME])
        run(['docker', 'start', NAME])
        raise


if __name__ == '__main__':
    flag = pathlib.Path('/srv/stock-personal-console/disabled')
    owned = not flag.exists()
    try:
        if owned: flag.touch(mode=0o600, exist_ok=False)
        main()
    finally:
        if owned: flag.unlink(missing_ok=True)
