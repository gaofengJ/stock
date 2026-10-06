import base64
import gzip
import hashlib
import importlib.util
import json
import os
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('update', os.path.join(os.path.dirname(__file__), 'playbook-content-update.py'))
update = importlib.util.module_from_spec(spec)
spec.loader.exec_module(update)


class PrivateContentUpdate(unittest.TestCase):
    def payload(self):
        data = {'version': 'test', 'maps': [{'id': name, 'root': {'id': name, 'title': 'Fixture', 'points': ['Synthetic']}} for name in ['trading', 'review', 'learning', 'experience']]}
        raw = json.dumps(data).encode('utf-8')
        return base64.b64encode(gzip.compress(raw)).decode('ascii'), hashlib.sha256(raw).hexdigest()

    def test_validates_digest_and_structure(self):
        payload, digest = self.payload()
        self.assertEqual(update.validate(payload, digest, 'test'), 4)
        for encoded, expected, version in [(payload, '0' * 64, 'test'), (payload, digest, 'wrong'), ('private-invalid-value', digest, 'test')]:
            with self.assertRaisesRegex(ValueError, 'Invalid private playbook configuration'):
                update.validate(encoded, expected, version)

    def test_only_replaces_one_entry_and_preserves_other_configuration(self):
        original = b'DB_PASSWORD="fixture"\nADMIN_PLAYBOOK_GZIP_BASE64="old"\n# retained\n'
        result = update.replace_config(original, 'new')
        self.assertEqual(result, b'DB_PASSWORD="fixture"\nADMIN_PLAYBOOK_GZIP_BASE64="new"\n# retained\n')
        for content in [b'OTHER=1\n', original + b'ADMIN_PLAYBOOK_GZIP_BASE64="duplicate"\n']:
            with self.assertRaises(ValueError):
                update.replace_config(content, 'new')

    def test_replacement_and_restore_preserve_bound_inode(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, 'runtime.env')
            with open(path, 'wb') as stream:
                stream.write(b'original')
            inode = os.stat(path).st_ino
            update.write_in_place(path, b'new')
            self.assertEqual(os.stat(path).st_ino, inode)
            with open(path, 'rb') as stream:
                self.assertEqual(stream.read(), b'new')
            update.write_in_place(path, b'original')
            self.assertEqual(os.stat(path).st_ino, inode)


if __name__ == '__main__':
    unittest.main()
