#!/usr/bin/env python3
"""Publish only newly tested images, merge immutable identities for reused roles."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

from module_release import load_plan, ROLES, REGISTRY, identity


def tested_images(plan, images):
    for role, value in plan['roles'].items():
        if not value['build']:
            continue
        _, _, artifact, repository = ROLES[role]
        folder = images / ('stock-volc-' + artifact + '-' + plan['commit'])
        if (folder / 'commit').read_text().strip() != plan['commit']:
            raise ValueError('Artifact commit mismatch')
        archive = folder / (artifact + '.tar.zst')
        with archive.open('rb') as stream:
            actual = hashlib.file_digest(stream, 'sha256').hexdigest()
        if actual != (folder / (artifact + '.sha256')).read_text().split()[0]:
            raise ValueError('Artifact checksum mismatch')
        zstd = subprocess.Popen(['zstd', '-dc', str(archive)], stdout=subprocess.PIPE)
        try:
            subprocess.run(['docker', 'load'], stdin=zstd.stdout, check=True, timeout=300)
        finally:
            zstd.stdout.close()
            if zstd.wait(timeout=30) != 0:
                raise ValueError('Cannot decompress tested image')
        source = 'stock-' + ('articles' if role == 'article' else role) + '-volc:' + plan['commit']
        image = json.loads(subprocess.check_output(['docker', 'image', 'inspect', source]))[0]
        if image['Id'] != (folder / 'image-id').read_text().strip():
            raise ValueError('Loaded image differs from tested image')
        subprocess.run(['docker', 'tag', source, REGISTRY + repository + ':volc-' + plan['commit']], check=True)


def publish(plan, run_id, receipt):
    receipt.mkdir(parents=True, exist_ok=True)
    roles = {}
    for role, value in plan['roles'].items():
        value = dict(value)
        if value.pop('build'):
            target = REGISTRY + ROLES[role][3] + ':volc-' + plan['commit']
            subprocess.run(['docker', 'push', target], check=True, timeout=2400)
            image = json.loads(subprocess.check_output(['docker', 'image', 'inspect', target]))[0]
            digests = [d for d in image['RepoDigests'] if d.startswith(REGISTRY + ROLES[role][3] + '@')]
            if len(digests) != 1:
                raise ValueError('Ambiguous published digest')
            value.update(digest=digests[0], imageId=image['Id'], sourceRun=run_id)
        identity(role, value)
        roles[role] = value
        (receipt / (role + '-digest')).write_text(value['digest'] + '\n')
        (receipt / (role + '-image-id')).write_text(value['imageId'] + '\n')
    (receipt / 'commit').write_text(plan['commit'] + '\n')
    (receipt / 'modules.json').write_text(json.dumps(dict(version=1, commit=plan['commit'], runId=run_id, roles=roles), indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=('load', 'publish'))
    parser.add_argument('--commit', required=True)
    parser.add_argument('--run-id', type=int, required=True)
    parser.add_argument('--images', type=Path, default=Path('/tmp/stock-images'))
    parser.add_argument('--receipt', type=Path, default=Path('/tmp/registry-receipt'))
    args = parser.parse_args()
    plan = load_plan(args.images / ('stock-volc-plan-' + args.commit) / 'plan.json', args.commit)
    if args.mode == 'load':
        tested_images(plan, args.images)
    else:
        publish(plan, args.run_id, args.receipt)


if __name__ == '__main__':
    main()
