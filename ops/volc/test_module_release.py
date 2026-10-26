import copy
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import module_release as modules
import publish_modules as publisher


class ModuleReleaseTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.previous = Path.cwd()
        os.chdir(self.root)
        self.addCleanup(os.chdir, self.previous)
        modules.fingerprint.cache_clear()
        self.git('init', '-q')
        self.git('config', 'user.name', 'release-test')
        self.git('config', 'user.email', 'release-test@example.invalid')
        self.git('config', 'core.autocrlf', 'false')
        for path in (*modules.SHARED, *(v[1] + '/source.txt' for v in modules.ROLES.values()),
                     *(p for paths in modules.EXTRA.values() for p in paths)):
            self.write(path, 'original\n')
        self.workflow = 'jobs:\n' + ''.join('  ' + job + ':\n    runs-on: ubuntu-24.04\n    steps:\n      - run: build-' + role + '\n'
                                                  for role, (job, *_rest) in modules.ROLES.items())
        self.write(modules.CI, self.workflow)
        self.base = self.commit()
        self.catalog = {r: dict(fingerprint=modules.fingerprint(self.base, r), sourceCommit=self.base, sourceRun=123,
                               digest=modules.REGISTRY + v[3] + '@sha256:' + 'a' * 64, imageId='sha256:' + 'b' * 64)
                        for r, v in modules.ROLES.items()}

    def git(self, *args):
        return subprocess.check_output(['git', *args], stderr=subprocess.PIPE).decode().strip()

    def write(self, path, text):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)

    def commit(self):
        self.git('add', '.')
        self.git('commit', '-qm', 'fixture')
        return self.git('rev-parse', 'HEAD')

    def builds(self, commit, force=False):
        plan = modules.make_plan(commit, [self.catalog], force)
        return {r for r, v in plan['roles'].items() if v['build']}

    def test_front_only_then_coalesced_back_change_keeps_both_changes(self):
        self.write('apps/front/source.txt', 'new style')
        self.assertEqual(self.builds(self.commit()), {'front'})
        self.write('apps/back/source.txt', 'backend fix')
        self.assertEqual(self.builds(self.commit()), {'front', 'back'})

    def test_article_media_and_root_dependency_changes(self):
        self.write('apps/blog/docs/imgs/new.png', 'media')
        self.assertEqual(self.builds(self.commit()), {'article'})
        self.write('pnpm-lock.yaml', 'new dependencies')
        self.assertEqual(self.builds(self.commit()), set(modules.ROLES))

    def test_dockerfile_and_build_recipe_invalidate_only_affected_module(self):
        self.write('ops/volc/Dockerfile.back', 'new runtime')
        self.assertEqual(self.builds(self.commit()), {'back'})
        self.write(modules.CI, self.workflow.replace('build-article', 'new-build-article'))
        self.assertEqual(self.builds(self.commit()), {'back', 'article'})

    def test_ops_and_scheduling_only_reuse_all_images(self):
        workflow = self.workflow
        for role, (job, *_rest) in modules.ROLES.items():
            workflow = workflow.replace('  ' + job + ':\n', '  ' + job + ':\n    needs: plan\n    if: needs.plan.outputs.' + role + " == 'true'\n")
        self.write(modules.CI, workflow)
        self.write('ops/volc/release_worker.py', 'new deployment flow')
        self.assertEqual(self.builds(self.commit()), set())

    def test_force_and_missing_catalog_build_all(self):
        self.assertEqual(self.builds(self.base, True), set(modules.ROLES))
        self.assertTrue(all(v['build'] for v in modules.make_plan(self.base, [])['roles'].values()))

    def test_publisher_reuses_without_docker_load_or_push_and_retains_provenance(self):
        plan = modules.make_plan(self.base, [self.catalog])
        with patch.object(publisher.subprocess, 'run') as run, patch.object(publisher.subprocess, 'Popen') as popen:
            publisher.tested_images(plan, self.root / 'no-archives')
            publisher.publish(plan, 456, self.root / 'receipt')
        run.assert_not_called(); popen.assert_not_called()
        receipt = json.loads((self.root / 'receipt/modules.json').read_text())
        self.assertEqual(receipt['runId'], 456)
        self.assertEqual(receipt['roles']['article']['sourceRun'], 123)
        self.assertEqual((self.root / 'receipt/article-digest').read_text().strip(), self.catalog['article']['digest'])

    def test_stale_plan_wrong_fingerprint_or_mutable_digest_is_rejected(self):
        plan = modules.make_plan(self.base, [self.catalog])
        path = self.root / 'plan.json'
        for mutate in (lambda p: p.update(commit='c' * 40),
                       lambda p: p['roles']['front'].update(fingerprint='bad'),
                       lambda p: p['roles']['article'].update(digest='stock-blog:latest')):
            bad = copy.deepcopy(plan); mutate(bad); path.write_text(json.dumps(bad))
            with self.assertRaises(ValueError): modules.load_plan(path, self.base)

    def test_front_only_publish_pushes_once_and_retains_other_fixed_digests(self):
        self.write('apps/front/source.txt', 'changed style')
        commit = self.commit()
        plan = modules.make_plan(commit, [self.catalog])
        digest = modules.REGISTRY + 'stock-front@sha256:' + 'c' * 64
        image = json.dumps([{'RepoDigests': [digest], 'Id': 'sha256:' + 'd' * 64}]).encode()
        with patch.object(publisher.subprocess, 'run') as run, patch.object(publisher.subprocess, 'check_output', return_value=image):
            publisher.publish(plan, 789, self.root / 'receipt')
        run.assert_called_once()
        self.assertEqual(run.call_args.args[0], ['docker', 'push', modules.REGISTRY + 'stock-front:volc-' + commit])
        receipt = json.loads((self.root / 'receipt/modules.json').read_text())
        self.assertEqual(receipt['roles']['front']['sourceRun'], 789)
        for role in ('back', 'article'):
            self.assertEqual(receipt['roles'][role]['digest'], self.catalog[role]['digest'])

    def test_changed_module_cannot_publish_without_tested_archive(self):
        self.write('apps/front/source.txt', 'changed style')
        plan = modules.make_plan(self.commit(), [self.catalog])
        with patch.object(publisher.subprocess, 'run') as run:
            with self.assertRaises(FileNotFoundError):
                publisher.tested_images(plan, self.root / 'missing')
        run.assert_not_called()

    def test_failed_ci_fork_workflow_and_wrong_commit_cannot_authorize_reuse(self):
        run = dict(head_sha=self.base, head_branch='master', head_repository={'full_name': modules.REPO},
                   path=modules.CI, event='push', status='completed', conclusion='success')
        modules.valid_run(run, self.base, modules.CI, ('push',))
        for field, value in [('conclusion', 'failure'), ('path', modules.PUBLISH), ('event', 'pull_request'),
                             ('head_sha', '0' * 40), ('head_repository', {'full_name': 'fork/stock'})]:
            bad = dict(run); bad[field] = value
            with self.assertRaises(ValueError): modules.valid_run(bad, self.base, modules.CI, ('push',))

    def test_zip_bomb_and_unbounded_receipt_are_rejected(self):
        raw = io.BytesIO()
        with zipfile.ZipFile(raw, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('oversized', 'a' * 65537)
        with self.assertRaises(ValueError): modules.read_receipt(raw.getvalue())
        with self.assertRaises(ValueError): modules.read_receipt(b'x' * 65537)


if __name__ == '__main__':
    unittest.main()
