#!/usr/bin/env python3
"""Render review-only cutover workflows outside .github; never change live workflows."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RETIRED = ('back-cd.yml', 'front-cd.yml', 'news-scheduler.yml', 'market-maintenance.yml',
           'intraday-history.yml', 'release-maintenance.yml', 'blog-release-status.yml', 'blog-cd.yml')


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise ValueError('Source workflow changed; review the cutover transformation')
    return text.replace(old, new)


def candidates(root=ROOT):
    source = root / '.github/workflows'
    ci = (source / 'volc-rehearsal.yml').read_text()
    registry_source = (source / 'volc-registry.yml').read_text()
    if '  workflow_run:\n' in registry_source and '    branches: [master]\n  pull_request:' in ci:
        # After the reviewed takeover, keep validating the installed workflow set.
        names = ('volc-rehearsal.yml', 'volc-registry.yml', 'bloomberg-news.yml') + RETIRED
        return {name: (source / name).read_text() for name in names}
    # No path filter: every master commit must have a matching full CI before release.
    start = ci.index('on:\n'); end = ci.index('permissions:\n')
    ci = ci[:start] + 'on:\n  push:\n    branches: [master]\n  pull_request:\n    branches: [master]\n  workflow_dispatch: {}\n' + ci[end:]
    ops = (source / 'volc-ops.yml').read_text().split('jobs:\n', 1)[1]
    ci += '\n' + ops

    registry = (source / 'volc-registry.yml').read_text()
    registry = replace_once(registry, 'on:\n', "on:\n  workflow_run:\n    workflows: ['Volcengine isolated rehearsal']\n    types: [completed]\n    branches: [master]\n")
    registry = replace_once(registry,
        "    if: github.ref == 'refs/heads/master' || (github.ref == 'refs/heads/codex/stock-volc-migration' && !inputs.queue_release)",
        "    if: >-\n      github.ref == 'refs/heads/master' &&\n      ((github.event_name == 'workflow_dispatch' && (!inputs.queue_release || vars.VOLC_PRODUCTION_ENABLED == 'true')) ||\n       (github.event_name == 'workflow_run' && vars.VOLC_PRODUCTION_ENABLED == 'true' &&\n        github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push' &&\n        github.event.workflow_run.head_branch == 'master' &&\n        github.event.workflow_run.head_repository.full_name == github.repository))")
    registry = registry.replace('${{ inputs.verified_sha }}', '${{ github.event.workflow_run.head_sha || inputs.verified_sha }}')
    registry = registry.replace('${{ inputs.verified_run }}', '${{ github.event.workflow_run.id || inputs.verified_run }}')
    registry = registry.replace("${{ inputs.queue_release && 'queue' || 'validate' }}",
                                "${{ (github.event_name == 'workflow_run' || inputs.queue_release) && 'queue' || 'validate' }}")
    registry = replace_once(registry, '      - uses: actions/checkout@v4\n', '      - uses: actions/checkout@v4\n        with: {ref: master}\n')
    registry = replace_once(registry, "          assert run['path']=='.github/workflows/volc-rehearsal.yml'\n",
        "          assert run['path']=='.github/workflows/volc-rehearsal.yml'\n" +
        "          assert run['event'] in ('push','workflow_dispatch')\n" +
        "          import subprocess\n" +
        "          current=subprocess.check_output(['gh','api','repos/'+os.environ['GH_REPO']+'/commits/master','--jq','.sha'],text=True).strip()\n" +
        "          assert current==os.environ['VERIFIED_SHA'], 'Superseded master commit; do not deploy stale artifacts'\n")
    news = (source / 'volc-news.yml').read_text()
    start = news.index('  push:\n'); end = news.index('permissions:\n')
    news = news[:start] + "  schedule:\n    - cron: '17 * * * *'\n" + news[end:]
    news = replace_once(news,
        "    if: github.ref == 'refs/heads/codex/stock-volc-migration' || github.ref == 'refs/heads/master'",
        "    if: github.ref == 'refs/heads/master' && (vars.VOLC_PRODUCTION_ENABLED == 'true' || (github.event_name == 'workflow_dispatch' && !inputs.deliver))")
    news = news.replace("${{ github.event_name == 'workflow_dispatch' && inputs.deliver && 'publish' || 'validate' }}",
                        "${{ (github.event_name == 'schedule' || inputs.deliver) && 'publish' || 'validate' }}")
    news = news.replace('# No schedule until the legacy collector is retired at cutover.', '# Candidate only: enable the repository variable only after retiring the old collector.')
    result = {'volc-rehearsal.yml': ci, 'volc-registry.yml': registry, 'bloomberg-news.yml': news}
    for filename in RETIRED:
        # Fail visibly on manual use instead of silently executing old root-SSH maintenance.
        result[filename] = json.dumps({'name': 'Retired legacy entry: ' + filename,
            'on': {'workflow_dispatch': {}}, 'permissions': {'contents': 'read'},
            'jobs': {'retired': {'runs-on': 'ubuntu-24.04', 'steps': [{'run':
                "echo '::error::Legacy host operation retired. See ops/volc/CI-CUTOVER.md for the controlled Volcengine procedure.'\nexit 1"}]}}}, indent=2) + '\n'
    return result


def render(destination, root=ROOT):
    destination = destination.resolve()
    # Review artifacts cannot be installed into any active workflow tree by this tool.
    if '.github' in destination.parts or destination == root or destination.is_relative_to(root / '.git'):
        raise ValueError('Use a new review directory outside .github and .git')
    if destination.exists():
        raise ValueError('Review destination already exists; do not overwrite')
    files = candidates(root)
    destination.mkdir(parents=True, mode=0o700)
    for name, content in files.items():
        (destination / name).write_text(content)
    manifest = {'state': 'review-only-not-installed', 'files': {name: hashlib.sha256(content.encode()).hexdigest() for name, content in files.items()},
                'requiresBeforeInstallation': ['user-approved cutover window', 'verified full CI including article build and access tests',
                    'confirm no old publishing/collecting run in progress', 'final data and business acceptance',
                    'long-term backups and external alerts'],
                'oldHostChanged': False, 'defaultBranchChanged': False, 'productionEnabled': False}
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--output', type=Path, required=True)
    print(json.dumps(render(parser.parse_args().output)))
