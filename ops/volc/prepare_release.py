#!/usr/bin/python3
"""Record already-verified local image IDs. Does not start or update services."""
import argparse
import json
from pathlib import Path
import re
import subprocess

APP_COMMIT = 'c1dd8e180b15b84629156ed06ee9490c3705e3ea'
CONTENT_COMMIT = 'c8989e9d1b73a671650b1483fa153592d51ed841'
ROOT = Path('/root/migration-tools')
DEPLOY = Path('/opt/stock/deploy')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ops-commit', required=True)
    args = parser.parse_args()
    assert re.fullmatch('[a-f0-9]{40}', args.ops_commit)
    assert not Path('/etc/stock/production.enabled').exists()
    images = {}
    for variable, role in [('BACK_IMAGE', 'backend'), ('FRONT_IMAGE', 'frontend')]:
        directory = ROOT / 'application' / f'stock-volc-{role}-{APP_COMMIT}'
        assert (directory / 'commit').read_text().strip() == APP_COMMIT
        images[variable] = (directory / 'server-image-id').read_text().strip()
    assert (ROOT / 'content/commit').read_text().strip() == CONTENT_COMMIT
    for variable, role in [('ARTICLE_IMAGE', 'articles'), ('BLOG_IMAGE', 'blog'), ('RSSHUB_IMAGE', 'rsshub')]:
        images[variable] = (ROOT / 'content' / (role + '-server-image-id')).read_text().strip()
    mysql = json.loads(subprocess.check_output(['docker', 'image', 'inspect', 'mysql:8.4']))[0]
    expected = (ROOT / 'mysql-8.4-image').read_text().split()[1]
    if mysql['Id'] != expected:
        manifest = json.loads(subprocess.check_output(['ctr', '--namespace', 'moby', 'content', 'get', mysql['Id']]))
        assert manifest['config']['digest'] == expected
    images['MYSQL_IMAGE'] = mysql['Id']
    for image in images.values():
        assert re.fullmatch('sha256:[a-f0-9]{64}', image)
        info = json.loads(subprocess.check_output(['docker', 'image', 'inspect', image]))[0]
        assert info['Id'] == image
    values = {**images, 'RELEASE_SHA': APP_COMMIT, 'CONTENT_SHA': CONTENT_COMMIT,
              'OPS_SHA': args.ops_commit,
              'AUTH_ALLOWED_ORIGINS': 'https://14.103.103.4,https://stock.mufengtongxue.com'}
    text = ''.join(key + '=' + value + '\n' for key, value in values.items())
    env = DEPLOY / 'release.env'
    if env.exists():
        assert env.read_text() == text, 'An existing release differs; review before replacing it'
    else:
        env.write_text(text)
        env.chmod(0o644)  # Only image IDs, source revisions and public origins.
    subprocess.run(['python3', str(DEPLOY / 'check_stack.py'), '--env-file', str(env)], check=True)
    print(json.dumps({'state': 'release-manifest-prepared', 'applicationCommit': APP_COMMIT,
                      'contentCommit': CONTENT_COMMIT, 'opsCommit': args.ops_commit,
                      'deployed': False}))


if __name__ == '__main__':
    main()
