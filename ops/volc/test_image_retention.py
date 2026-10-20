import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import image_retention as retain
from prepare_article_context import prepare


def ref(role, digit):
    return 'registry.cn-hangzhou.aliyuncs.com/mufengtongxue/stock-' + role + '@sha256:' + digit * 64


def image(digit, role='back', tags=None):
    return {'Id': 'sha256:' + digit * 64, 'RepoDigests': [ref(role, digit)], 'RepoTags': tags or []}


class RetentionTests(unittest.TestCase):
    def test_incomplete_legacy_history_cannot_grant_cleanup_eligibility(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); folder = root / 'releases/cd-old'; folder.mkdir(parents=True)
            (folder / 'deployment.json').write_text(json.dumps({'state': 'deployed', 'production': True}))
            (folder / 'previous.env').write_text('BACK_IMAGE=' + ref('back', '9'))
            manifest = '\n'.join(k + '=' + ref(role, str(i)) for i, (k, role) in enumerate(zip(retain.KEYS, ('back', 'front', 'blog')), 1)) + '\nRELEASE_SHA=' + 'a' * 40
            (folder / 'candidate.env').write_text(manifest)
            eligible = retain.successful_refs(root)
            self.assertEqual(eligible, {ref('back', '1'), ref('front', '2'), ref('blog', '3')})
            self.assertNotIn(ref('back', '9'), eligible)
            with self.assertRaises(ValueError): retain.release_values(folder / 'previous.env')

    def test_maintenance_and_pending_release_block_before_any_docker_call(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); prod = root / 'prod'; maintenance = root / 'maintenance'
            queue = root / 'queue'; (queue / 'claimed').mkdir(parents=True)
            self.assertEqual(retain.gate_state(prod, maintenance, queue), 'deferred')
            prod.touch()
            self.assertIsNone(retain.gate_state(prod, maintenance, queue))
            maintenance.touch()
            self.assertEqual(retain.gate_state(prod, maintenance, queue), 'deferred')
            maintenance.unlink(); (queue / 'claimed/request.json').write_text('{}')
            self.assertEqual(retain.gate_state(prod, maintenance, queue), 'deferred-queued-release')
        for reason in ('deferred', 'deferred-queued-release'):
            with patch.object(retain, 'gate_state', return_value=reason), patch.object(retain, 'run') as docker:
                self.assertEqual(retain.cleanup_locked(True), {'state': reason})
                docker.assert_not_called()

    def test_missing_rollback_proof_never_reaches_docker(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(retain, 'gate_state', return_value=None), \
                patch.object(retain, 'run') as docker:
            with self.assertRaises(FileNotFoundError): retain.cleanup_locked(True, deploy=Path(tmp))
            docker.assert_not_called()

    def test_every_container_current_and_rollback_are_protected_even_when_old(self):
        images = [image(v) for v in '1234']
        protected = {v['Id'] for v in images[:3]}
        result = retain.plan(images, protected, {v['Id']: 0 for v in images}, 100000)
        self.assertEqual([v['id'] for v in result], [images[3]['Id']])

    def test_unknown_aliases_database_and_dangling_never_removed(self):
        images = [image('1', tags=['other-service:prod']), image('2', role='database'),
                  {'Id': 'sha256:' + '3' * 64, 'RepoTags': [], 'RepoDigests': []}]
        self.assertEqual(retain.plan(images, set(), {v['Id']: 0 for v in images}, 100000), [])

    def test_first_observation_grace_does_not_use_reproducible_created_time(self):
        value = image('1'); value['Created'] = '1970-01-01T00:00:00Z'
        self.assertEqual(retain.plan([value], set(), {}, 100000), [])
        self.assertEqual(retain.plan([value], set(), {value['Id']: 99999}, 100000), [])
        self.assertEqual(len(retain.plan([value], set(), {value['Id']: 0}, 100000)), 1)

    def test_superseded_successful_release_can_be_cleaned_without_grace(self):
        value = image('1')
        self.assertEqual(len(retain.plan([value], set(), {}, 100, {ref('back', '1')})), 1)
        self.assertEqual(retain.plan([value], {value['Id']}, {}, 100, {ref('back', '1')}), [])

    def test_clock_reversal_fails_closed(self):
        value = image('1')
        with self.assertRaises(ValueError): retain.plan([value], set(), {value['Id']: 200}, 100)

    def test_current_history_must_match_all_three_images_and_commit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); folder = root / 'releases/cd-abc'; folder.mkdir(parents=True)
            text = '\n'.join([k + '=' + ref(role, str(i)) for i, (k, role) in enumerate(
                zip(retain.KEYS, ('back', 'front', 'blog')), 1)]) + '\nRELEASE_SHA=' + 'a' * 40
            (root / 'release.env').write_text(text); (folder / 'candidate.env').write_text(text)
            (folder / 'previous.env').write_text(text.replace('a' * 40, 'b' * 40))
            (folder / 'deployment.json').write_text(json.dumps({'state': 'deployed', 'production': True,
                'commit': 'a' * 40, 'completedAt': '2026-10-15T00:00:00+00:00'}))
            current, previous = retain.release_pair(root)
            self.assertEqual(previous['RELEASE_SHA'], 'b' * 40)
            (root / 'release.env').write_text(text.replace(ref('blog', '3'), ref('blog', '4')))
            with self.assertRaises(ValueError): retain.release_pair(root)
            (root / 'release.env').write_text(text); (folder / 'previous.env').unlink()
            with self.assertRaises(FileNotFoundError): retain.release_pair(root)


class ArticleContextTests(unittest.TestCase):
    def test_exact_bytes_paths_and_deterministic_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); source = root / 'source'; (source / 'imgs/历史').mkdir(parents=True)
            (source / 'index.html').write_text('中文文章')
            (source / 'imgs/历史/a.webp').write_bytes(b'\x00\xffbinary')
            (source / 'pagefind').mkdir(); (source / 'pagefind/index').write_bytes(b'search')
            deny = root / 'deny'; deny.write_text('deny all;')
            a = prepare(source, root / 'a', deny); b = prepare(source, root / 'b', deny)
            self.assertEqual(a, b); self.assertEqual(a['files'], 3)
            for entry in a['manifest']:
                file = root / 'a' / entry['part'] / entry['path']
                self.assertEqual(file.read_bytes(), (source / entry['path']).read_bytes())
                self.assertEqual(file.stat().st_mtime, 0)
            self.assertEqual((source / 'index.html').read_text(), '中文文章')
            with self.assertRaises(FileExistsError): prepare(source, root / 'a', deny)

    def test_symlink_not_followed_into_arbitrary_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); source = root / 'source'; source.mkdir()
            (source / 'index.html').write_text('ok'); (root / 'secret').write_text('private')
            (source / 'secret').symlink_to(root / 'secret')
            with self.assertRaises(ValueError): prepare(source, root / 'out', root / 'secret')


if __name__ == '__main__': unittest.main()
