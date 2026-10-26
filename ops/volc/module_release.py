#!/usr/bin/env python3
"""Plan module builds from immutable Git inputs and trusted CI registry receipts.

Only small receipts are downloaded. Missing/expired/incompatible receipts cause a
build; malformed provenance can never become an image to deploy. No credentials
or mutable image tags are stored in the plan.
"""
import argparse
import functools
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import zipfile

REPO = 'gaofengJ/stock'
REGISTRY = 'registry.cn-hangzhou.aliyuncs.com/mufengtongxue/'
CI = '.github/workflows/volc-rehearsal.yml'
PUBLISH = '.github/workflows/volc-registry.yml'
ROLES = {
    'back': ('verify', 'apps/back', 'backend', 'stock-back'),
    'front': ('frontend', 'apps/front', 'frontend', 'stock-front'),
    'article': ('articles', 'apps/blog', 'articles', 'stock-blog'),
}
SHARED = ('package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', '.nvmrc', '.dockerignore')
EXTRA = {
    'back': ('ops/volc/Dockerfile.back',),
    'front': ('ops/volc/Dockerfile.front',),
    'article': ('ops/volc/Dockerfile.articles', 'ops/volc/articles-deny.conf',
                'ops/volc/blog.nginx.conf', 'ops/volc/prepare_article_context.py',
                'ops/volc/verify_article_layers.py', 'ops/volc/verify_article_image.py',
                '.github/scripts/test-blog-server.cjs'),
}


def command(args):
    return subprocess.check_output(args, timeout=90)


@functools.lru_cache(maxsize=128)
def api(path):
    return json.loads(command(['gh', 'api', 'repos/' + REPO + '/' + path]))


@functools.lru_cache(maxsize=128)
def fingerprint(commit, role):
    if not re.fullmatch('[0-9a-f]{40}', commit) or role not in ROLES:
        raise ValueError('Invalid module source')
    job, app, _, _ = ROLES[role]
    workflow = command(['git', 'show', commit + ':' + CI]).decode().replace('\r\n', '\n')
    match = re.search(r'^  ' + job + r':\n(.*?)(?=^  [\w-]+:|\Z)', workflow, re.M | re.S)
    if not match:
        raise ValueError('Missing image build job')
    # Ignore ONLY the scheduling guards introduced here. All build/test commands,
    # runtime versions, actions, service definitions and future recipe edits count.
    recipe = re.sub(r'^    needs: plan\n', '', match[1], flags=re.M)
    recipe = re.sub(r"^    if: needs\.plan\.outputs\." + role + r" == 'true'\n", '', recipe, flags=re.M)
    recipe = recipe.rstrip() + '\n'
    paths = sorted((*SHARED, app, *EXTRA[role]))
    # Git tree IDs cover every tracked app file without downloading media blobs.
    inputs = command(['git', 'ls-tree', '-z', commit, '--', *paths])
    return hashlib.sha256(b'stock-module-v1\0' + role.encode() + b'\0' + inputs + recipe.encode()).hexdigest()


def valid_run(run, commit, workflow, events, success=True):
    if not (run.get('head_sha') == commit and run.get('head_branch') == 'master'
            and run.get('head_repository', {}).get('full_name') == REPO
            and run.get('path') == workflow and run.get('event') in events
            and (not success or (run.get('status') == 'completed' and run.get('conclusion') == 'success'))):
        raise ValueError('Untrusted image receipt workflow')


def identity(role, value):
    repository = ROLES[role][3]
    if not re.fullmatch(re.escape(REGISTRY + repository + '@sha256:') + '[0-9a-f]{64}', value['digest']):
        raise ValueError('Invalid immutable repository digest')
    if not re.fullmatch('sha256:[0-9a-f]{64}', value['imageId']):
        raise ValueError('Invalid tested image ID')
    return value


def read_receipt(raw):
    if len(raw) > 65536:
        raise ValueError('Receipt archive too large')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        if len(archive.infolist()) > 32 or sum(f.file_size for f in archive.infolist()) > 65536:
            raise ValueError('Receipt contents too large')
        # Never extract paths or execute anything in an artifact.
        return {item.filename: archive.read(item).decode() for item in archive.infolist() if not item.is_dir()}


def source_run(commit):
    result = api('actions/workflows/volc-rehearsal.yml/runs?head_sha=' + commit + '&status=success&per_page=10')
    for run in result['workflow_runs']:
        try:
            valid_run(run, commit, CI, ('push', 'workflow_dispatch'))
            return run['id']
        except ValueError:
            continue
    raise ValueError('No successful source CI')


def reuse_catalog(artifact, current):
    name = artifact['name']
    commit = name.removeprefix('stock-volc-registry-')
    if not re.fullmatch('[0-9a-f]{40}', commit) or artifact['expired'] or artifact['size_in_bytes'] > 65536:
        raise ValueError('Invalid or expired receipt')
    publisher = api('actions/runs/' + str(artifact['workflow_run']['id']))
    # Receipt upload precedes production deployment. A later deployment timeout
    # does not invalidate images already tested and published by this workflow.
    valid_run(publisher, commit, PUBLISH, ('workflow_run', 'workflow_dispatch'), success=False)
    files = read_receipt(command(['gh', 'api', 'repos/' + REPO + '/actions/artifacts/' + str(artifact['id']) + '/zip']))
    if files.get('commit', '').strip() != commit:
        raise ValueError('Receipt commit mismatch')
    catalog = json.loads(files['modules.json']) if 'modules.json' in files else None
    ci_run = catalog['runId'] if catalog else source_run(commit)
    valid_run(api('actions/runs/' + str(ci_run)), commit, CI, ('push', 'workflow_dispatch'))
    if catalog and (catalog['version'] != 1 or catalog['commit'] != commit):
        raise ValueError('Unsupported catalog')
    result = {}
    for role in ROLES:
        value = catalog['roles'][role] if catalog else {
            'sourceCommit': commit, 'sourceRun': ci_run,
            'digest': files[role + '-digest'].strip(), 'imageId': files[role + '-image-id'].strip()}
        identity(role, value)
        source = value['sourceCommit']
        command(['git', 'merge-base', '--is-ancestor', source, current])
        actual = fingerprint(source, role)
        if catalog and value['fingerprint'] != actual:
            raise ValueError('Catalog input fingerprint mismatch')
        valid_run(api('actions/runs/' + str(value['sourceRun'])), source, CI, ('push', 'workflow_dispatch'))
        result[role] = dict(value, fingerprint=actual, receiptArtifact=artifact['id'])
    return result


def make_plan(commit, catalogs, force=False):
    roles = {}
    for role in ROLES:
        key = fingerprint(commit, role)
        reusable = next((c[role] for c in catalogs if c[role]['fingerprint'] == key), None)
        roles[role] = (dict(reusable, build=False) if reusable and not force else
                       dict(build=True, fingerprint=key, sourceCommit=commit))
    return {'version': 1, 'commit': commit, 'roles': roles}


def discover(commit):
    catalogs = []
    for page in range(1, 4):
        artifacts = api('actions/artifacts?per_page=100&page=' + str(page))['artifacts']
        for artifact in artifacts:
            if not artifact['name'].startswith('stock-volc-registry-'):
                continue
            try:
                catalogs.append(reuse_catalog(artifact, commit))
            except (ValueError, KeyError, TypeError, subprocess.CalledProcessError, zipfile.BadZipFile) as error:
                print('Ignore unusable receipt', artifact['id'], type(error).__name__)
            # The latest complete verified receipt is the baseline. Do not spend
            # minutes searching old history for an optional cache hit on a revert.
            if catalogs:
                return catalogs
        if len(artifacts) < 100:
            break
    return catalogs


def load_plan(path, commit):
    plan = json.loads(Path(path).read_text())
    if plan['version'] != 1 or plan['commit'] != commit or set(plan['roles']) != set(ROLES):
        raise ValueError('Plan does not match verified CI')
    for role, value in plan['roles'].items():
        if type(value['build']) is not bool or value['fingerprint'] != fingerprint(commit, role):
            raise ValueError('Invalid build decision')
        if not value['build']:
            identity(role, value)
    return plan


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--commit', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    plan = make_plan(args.commit, [] if args.force else discover(args.commit), args.force)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(plan, indent=2) + '\n')
    lines = [role + '=' + str(value['build']).lower() for role, value in plan['roles'].items()]
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as stream:
            stream.write('\n'.join(lines) + '\n')
    summary = '\n'.join('- ' + r + ': ' + ('build and verify' if v['build'] else 'reuse ' + v['digest']) for r, v in plan['roles'].items())
    print(summary)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as stream:
            stream.write('### Module release plan\n' + summary + '\n')


if __name__ == '__main__':
    main()
