#!/usr/bin/env python3
"""Split exact built content into stable media and generated pages without loss."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''): value.update(block)
    return value.hexdigest()


def prepare(source, destination, deny_config):
    if not source.is_dir() or not (source / 'index.html').is_file():
        raise ValueError('Built article site is required')
    # Never overwrite a build or delete unknown files to make room.
    destination.mkdir(parents=True, exist_ok=False)
    for name in ('media', 'site'): (destination / name).mkdir()
    manifest = []
    for path in sorted(source.rglob('*')):
        if path.is_symlink(): raise ValueError('Symlinks are not supported in article assets')
        if path.is_dir(): continue
        if not path.is_file(): raise ValueError('Unsupported article asset')
        relative = path.relative_to(source)
        part = 'media' if relative.parts[0] == 'imgs' else 'site'
        target = destination / part / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
        original = digest(path)
        if digest(target) != original: raise ValueError('Article copy mismatch')
        manifest.append({'path': relative.as_posix(), 'sha256': original, 'bytes': path.stat().st_size, 'part': part})
    shutil.copyfile(deny_config, destination / 'articles-deny.conf')
    # Build runners/checkouts have different mtimes. Normalize only the new copy.
    for path in sorted(destination.rglob('*'), reverse=True):
        path.chmod(0o755 if path.is_dir() else 0o644)
        os.utime(path, (0, 0))
    os.utime(destination, (0, 0))
    return {'files': len(manifest), 'htmlFiles': sum(v['path'].endswith('.html') for v in manifest),
            'mediaBytes': sum(v['bytes'] for v in manifest if v['part'] == 'media'),
            'siteBytes': sum(v['bytes'] for v in manifest if v['part'] == 'site'), 'manifest': manifest}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--destination', type=Path, required=True)
    parser.add_argument('--deny-config', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    report = prepare(args.source, args.destination, args.deny_config)
    args.report.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'manifest'}))
