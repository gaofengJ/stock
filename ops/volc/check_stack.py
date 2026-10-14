#!/usr/bin/env python3
"""Validate resolved rehearsal topology without starting containers or reading secrets."""
import argparse
import json
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
IMAGE_KEYS = ('MYSQL_IMAGE', 'BACK_IMAGE', 'FRONT_IMAGE', 'ARTICLE_IMAGE', 'RSSHUB_IMAGE', 'BLOG_IMAGE')
DISABLED = ('SCHEDULE_ENABLED', 'SYNC_SCHEDULE_ENABLED', 'SYNC_ON_STARTUP',
            'NEWS_SYNC_ENABLED', 'ADMIN_JOBS_ENABLED', 'TUSHARE_REQUESTS_ENABLED')


def validate(app, db, blog):
    back = app['services']['back']
    assert back['environment']['DB_HOST'] == 'mysql', 'Backend must use the new private database'
    for key in DISABLED:
        assert back['environment'][key] == 'false', key + ' must remain disabled during rehearsal'
    for project in (app, db, blog):
        for service in project['services'].values():
            assert re.fullmatch(r'(?:[^\s]+@)?sha256:[a-f0-9]{64}', service['image']), 'Pin every registry digest or verified local image ID'
            for port in service.get('ports', []):
                assert port['host_ip'] == '127.0.0.1', 'Containers must not publish public ports'
            assert service['logging']['options']['max-size'] == '20m'
            for mount in service.get('volumes', []):
                assert mount['type'] == 'bind', 'Persistence must use explicit host paths'
    assert db['networks']['database']['internal'] is True
    assert app['networks']['database']['external'] is True
    assert 'ports' not in app['services']['rsshub']
    assert 'news' in app['services']['rsshub']['profiles']


def render(file, environment):
    return json.loads(subprocess.check_output(
        ['docker', 'compose', '--env-file', str(environment), '-f', str(ROOT / file),
         '--profile', 'news', 'config', '--format', 'json'], text=True))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--test-config', action='store_true')
    parser.add_argument('--env-file', type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='stock-compose-check-') as directory:
        environment = args.env_file
        if args.test_config:
            environment = Path(directory) / 'release.env'
            environment.write_text('\n'.join(key + '=example.invalid/test@sha256:' + 'a' * 64
                                              for key in IMAGE_KEYS) +
                                   '\nRELEASE_SHA=' + 'b' * 40 +
                                   '\nAUTH_ALLOWED_ORIGINS=https://14.103.103.4\n')
        if environment is None:
            parser.error('--env-file or --test-config is required')
        validate(render('compose.app.yaml', environment), render('compose.database.yaml', environment),
                 render('compose.blog.yaml', environment))
        print('Private ports, isolated database, pinned images, and disabled rehearsal writers verified')


if __name__ == '__main__':
    main()
