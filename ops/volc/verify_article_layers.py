#!/usr/bin/env python3
"""CI: real uncached Docker builds must reuse media across releases/page edits."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
from prepare_article_context import prepare


def verify(base):
    dockerfile = Path(__file__).with_name('Dockerfile.articles').resolve()
    deny = Path(__file__).with_name('articles-deny.conf').resolve()
    tags = []
    with tempfile.TemporaryDirectory(prefix='stock-layers-') as tmp:
        root = Path(tmp); site = root / 'source'; (site / 'imgs').mkdir(parents=True)
        (site / 'index.html').write_text('<p>original article</p>')
        (site / 'imgs/chart.webp').write_bytes(b'unchanged media bytes' * 200)
        layers = []
        try:
            for index in range(3):
                if index == 2: (site / 'index.html').write_text('<p>updated article</p>')
                context = root / ('context-' + str(index))
                prepare(site, context, deny)
                tag = 'stock-article-layer-test:' + str(index); tags.append(tag)
                subprocess.run(['docker', 'buildx', 'build', '--no-cache',
                                '--output', 'type=docker,rewrite-timestamp=true', '--build-arg', 'SOURCE_DATE_EPOCH=0',
                                '--build-arg', 'NGINX_IMAGE=' + base, '--build-arg', 'RELEASE_SHA=' + str(index),
                                '-f', str(dockerfile), '-t', tag, str(context)], check=True)
                value = json.loads(subprocess.check_output(['docker', 'image', 'inspect', tag]))[0]
                layers.append(value['RootFS']['Layers'])
            print(json.dumps({'copyLayers': [value[-3:] for value in layers]}))
            # The entire parent chain must be stable for unpacked containerd snapshots
            # to share space, not merely the media blob itself.
            assert layers[0] == layers[1], 'Commit-only change duplicated article content or parent chain'
            assert layers[0][:-2] == layers[2][:-2], 'Page change duplicated media layer or parent chain'
            assert layers[0][-2] != layers[2][-2], 'Updated page was lost'
            print('Verified uncached rebuilds: same content shares all COPY layers; page edit shares media.')
        finally:
            for tag in tags: subprocess.run(['docker', 'image', 'rm', tag], capture_output=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--nginx-image', required=True)
    verify(parser.parse_args().nginx_image)
