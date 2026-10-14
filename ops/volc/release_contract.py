"""Strict data-only contract for the restricted deployment queue."""
import re

MAX_BYTES = 16384
PUBLIC_FIELDS = ('commit', 'runId', 'backDigest', 'frontDigest', 'backImageId', 'frontImageId')


def validate_request(value):
    if not isinstance(value, dict) or set(value) != set(PUBLIC_FIELDS) | {'registryUsername', 'registryPassword'}:
        raise ValueError('Unexpected release fields')
    if not re.fullmatch(r'[a-f0-9]{40}', str(value['commit'])):
        raise ValueError('Invalid commit')
    if not isinstance(value['runId'], int) or isinstance(value['runId'], bool) or value['runId'] <= 0:
        raise ValueError('Invalid successful workflow run ID')
    for role in ('back', 'front'):
        if not re.fullmatch(r'registry\.cn-hangzhou\.aliyuncs\.com/mufengtongxue/stock-' + role + r'@sha256:[a-f0-9]{64}', str(value[role + 'Digest'])):
            raise ValueError('Only fixed ACR repositories and immutable digests are allowed')
        if not re.fullmatch(r'sha256:[a-f0-9]{64}', str(value[role + 'ImageId'])):
            raise ValueError('Invalid tested image ID')
    for key in ('registryUsername', 'registryPassword'):
        if not isinstance(value[key], str) or not 1 <= len(value[key]) <= 4096 or '\x00' in value[key] or '\n' in value[key]:
            raise ValueError('Invalid registry authentication field')
    return value


def public_request(value):
    return {key: value[key] for key in PUBLIC_FIELDS}


def validate_run(run, request, rehearsal=False):
    if (run.get('head_sha') != request['commit'] or run.get('status') != 'completed'
            or run.get('conclusion') != 'success'
            or run.get('event') not in ('push', 'workflow_dispatch')
            or run.get('path') != '.github/workflows/volc-rehearsal.yml'
            or run.get('head_branch') != ('codex/stock-volc-migration' if rehearsal else 'master')
            or run.get('head_repository', {}).get('full_name') != 'gaofengJ/stock'):
        raise ValueError('Release lacks a successful full CI run on the authorized branch')


def validate_master_head(head, request):
    if head.get('sha') != request['commit']:
        raise ValueError('Superseded master commit; do not deploy stale artifacts')
