import json
import base64
import hashlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import bootstrap_ops
import ops_release as ops


class OpsReleaseTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        (self.root / 'versions').mkdir()
        (self.root / 'current').symlink_to(self.root / 'versions' / 'bootstrap')
        self.fetches = []
        self.validations = []

    def prepare(self, sha='a' * 40, validate=None):
        def download(commit, source):
            self.fetches.append((commit, source))
            return b'# trusted fixture\n'
        return ops.prepare(sha, self.root, download,
                           validate or (lambda folder, args: self.validations.append(args)))

    def test_api_fetch_validates_fixed_path_size_and_git_blob_hash(self):
        data = b'pass\n'
        source = ops.FILES['health_dispatch.py']
        record = {'type': 'file', 'path': source, 'encoding': 'base64',
                  'content': base64.b64encode(data).decode(), 'size': len(data),
                  'sha': hashlib.sha1(b'blob 5\0' + data).hexdigest()}
        class Response(io.BytesIO):
            def __init__(self, value):
                raw = json.dumps(value).encode()
                super().__init__(raw)
                self.headers = {'Content-Length': str(len(raw))}
        from unittest.mock import Mock
        opener = Mock()
        opener.open.side_effect = lambda *a, **k: Response(record)
        with patch.object(ops.urllib.request, 'build_opener', return_value=opener), patch.object(ops.time, 'sleep'):
            self.assertEqual(ops.fetch('a' * 40, source), data)
            self.assertIn('api.github.com/repos/gaofengJ/stock/contents/', opener.open.call_args.args[0].full_url)
            for field, bad in [('sha', '0' * 40), ('size', 999), ('path', 'other.py')]:
                before = record[field]; record[field] = bad
                with self.assertRaises(RuntimeError): ops.fetch('a' * 40, source)
                record[field] = before
            with self.assertRaises(ValueError): ops.fetch('a' * 40, '../other.py')

    def test_fixed_sources_validated_once_and_cached_by_checksum(self):
        folder = self.prepare()
        self.assertEqual(set(source for _, source in self.fetches), set(ops.FILES.values()))
        self.assertEqual(len(self.validations), 3)
        self.assertEqual(self.prepare(), folder)
        self.assertEqual(len(self.fetches), len(ops.FILES))
        (folder / 'dispatch.py').write_text('# corrupt')
        with self.assertRaises(ValueError):
            self.prepare()

    def test_validation_failure_does_not_activate_or_leave_partial_version(self):
        def fail(*args): raise RuntimeError('bad test')
        with self.assertRaises(RuntimeError):
            self.prepare(validate=fail)
        self.assertEqual(list((self.root / 'versions').iterdir()), [])
        self.assertEqual((self.root / 'current').readlink().name, 'bootstrap')

    def test_atomic_switch_rolls_back_on_application_failure(self):
        previous = self.prepare()
        ops.point(self.root, previous)
        candidate = self.prepare('b' * 40)
        with self.assertRaises(RuntimeError):
            with ops.transaction(candidate, self.root, locks=()):
                self.assertEqual((self.root / 'current').resolve(), candidate)
                raise RuntimeError('unhealthy app')
        self.assertEqual((self.root / 'current').resolve(), previous)
        with ops.transaction(candidate, self.root, locks=()): pass
        self.assertEqual((self.root / 'previous').resolve(), previous)
        with ops.transaction(candidate, self.root, locks=()): pass
        self.assertEqual((self.root / 'previous').resolve(), previous)

    def test_pointer_metadata_failure_restores_current(self):
        previous = self.prepare()
        ops.point(self.root, previous)
        candidate = self.prepare('b' * 40)
        real_symlink = Path.symlink_to
        def fail_metadata(path, target, *args, **kwargs):
            if path.name == '.previous-next': raise OSError('disk error')
            return real_symlink(path, target, *args, **kwargs)
        with patch.object(Path, 'symlink_to', fail_metadata), self.assertRaises(OSError):
            with ops.transaction(candidate, self.root, locks=()): pass
        self.assertEqual((self.root / 'current').resolve(), previous)

    def test_invalid_commit_and_outside_pointer_rejected(self):
        with self.assertRaises(ValueError): self.prepare('../bad')
        with self.assertRaises(ValueError): ops.point(self.root, self.root.parent)
        self.assertFalse(self.fetches)

    def test_unexpected_or_symlink_files_rejected(self):
        folder = self.prepare()
        data = json.loads((folder / 'manifest.json').read_text())
        data['sha256']['other.py'] = '0' * 64
        (folder / 'manifest.json').write_text(json.dumps(data))
        with self.assertRaises(ValueError): ops.verify(folder)

class BootstrapTest(unittest.TestCase):
    def test_bootstrap_preserves_old_code_and_refuses_second_install(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory).resolve()
            source = base / 'source'; source.mkdir()
            installed = base / 'installed'; installed.mkdir()
            for name in ops.FILES:
                (source / name).write_text('# new code\n')
            targets = {name: installed / name for name in bootstrap_ops.TARGETS}
            for name, path in targets.items():
                if name != 'ops_release.py': path.write_text('# old code\n')
            root = base / 'ops'
            with patch.object(ops, 'sandbox_run'):
                bootstrap_ops.bootstrap(source, root, targets, locks=())
            self.assertEqual(targets['health_dispatch.py'].read_text(), '# old code\n')
            self.assertEqual(targets['release_worker.py'].read_text(), '# new code\n')
            self.assertTrue(all(p.is_symlink() for p in targets.values()))
            self.assertEqual((root / 'previous' / 'release_worker.py').read_text(), '# old code\n')
            with self.assertRaises(ValueError): bootstrap_ops.bootstrap(source, root, targets, locks=())
