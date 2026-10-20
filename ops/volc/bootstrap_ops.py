#!/usr/bin/python3
"""One-time root bootstrap, explicitly installed by the operator, never callable by CI SSH."""
import argparse
from contextlib import ExitStack
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile
import ops_release as ops

TARGETS = {'health_dispatch.py': Path('/opt/stock/deploy/health_dispatch.py'),
           'dispatch.py': Path('/opt/stock-news/scheduler/dispatch.py'),
           'release_worker.py': Path('/opt/stock/deploy/release_worker.py'),
           'ops_release.py': Path('/opt/stock/deploy/ops_release.py')}


def bootstrap(source, root=ops.ROOT, targets=TARGETS,
              locks=(Path('/run/lock/stock-maintenance.lock'),) + ops.LOCKS):
    if root.exists():
        raise ValueError('Ops root already exists; inspect instead of overwriting')
    with ExitStack() as stack:
        for name in locks:
            lock = stack.enter_context(name.open('a'))
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        for name, path in targets.items():
            if path.is_symlink() or (name != 'ops_release.py' and not path.is_file()):
                raise ValueError('Unexpected bootstrap target')
        existed = {name: path.exists() for name, path in targets.items()}
        root.mkdir(mode=0o755); root.chmod(0o755)
        versions = root / 'versions'; versions.mkdir(mode=0o755); versions.chmod(0o755)
        baseline = versions / 'bootstrap-previous'; baseline.mkdir(mode=0o755); baseline.chmod(0o755)
        candidate = versions / 'bootstrap-worker'; candidate.mkdir(mode=0o755); candidate.chmod(0o755)
        for name in ops.FILES:
            installed = targets.get(name, Path('/opt/stock/deploy') / name)
            old = installed if installed.is_file() else source / name
            shutil.copyfile(old, baseline / name); (baseline / name).chmod(0o644)
            shutil.copyfile(source / name if name in ('release_worker.py', 'ops_release.py') else old, candidate / name)
            (candidate / name).chmod(0o644)
        for folder in (baseline, candidate):
            for name in ops.FILES:
                compile((folder / name).read_bytes(), name, 'exec')
            (folder / 'manifest.json').write_text(json.dumps({
                'commit': folder.name, 'sha256': {name: hashlib.sha256((folder / name).read_bytes()).hexdigest() for name in ops.FILES}}, indent=2))
            (folder / 'manifest.json').chmod(0o644)
        ops.sandbox_run(candidate, ['-c', 'import health_dispatch, dispatch, release_worker, ops_release'])
        ops.point(root, baseline)
        changed = []
        try:
            for name, path in targets.items():
                temp = path.with_name(path.name + '.ops-bootstrap')
                temp.symlink_to(root / 'current' / name)
                temp.replace(path)
                changed.append(name)
            ops.point(root, candidate)
            (root / 'previous').symlink_to(baseline)
        except BaseException:
            for name in reversed(changed):
                path = targets[name]
                if existed[name]:
                    fd, temp = tempfile.mkstemp(dir=path.parent)
                    os.close(fd); shutil.copyfile(baseline / name, temp); os.chmod(temp, 0o644)
                    os.replace(temp, path)
                else:
                    path.unlink()
            raise
        print(json.dumps({'state': 'bootstrapped', 'current': str(candidate), 'previous': str(baseline)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise SystemExit('Root bootstrap required')
    bootstrap(args.source)
