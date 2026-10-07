import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('release_package', Path(__file__).resolve().parents[1] / '.github/scripts/release-package.py')
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class ReleaseTests(unittest.TestCase):
    def test_exact_tag(self):
        for version in ('1', '1.2', '1.2.3', '3.6.0.63', '65535.0.0.1'):
            self.assertEqual(package.validate_version({'version': version, 'version_name': 'Display name'}, 'v' + version), version)
        for version in ('0', '0.0.0', '01.2', '1.2.3.4.5', '65536.0', '1.2-beta', '', None):
            with self.subTest(version=version), self.assertRaises(ValueError):
                package.validate_version({'version': version}, 'v' + str(version))
        for tag in ('3.6.0.63', 'v3.6.0.62', 'v3.6.0.63-beta', 'v3.6.0.63.1'):
            with self.subTest(tag=tag), self.assertRaises(ValueError):
                package.validate_version({'version': '3.6.0.63'}, tag)

    def test_build_and_verify_real_package(self):
        root = Path(__file__).resolve().parents[1]
        version = json.loads((root / 'manifest.json').read_text())['version']
        with tempfile.TemporaryDirectory() as directory:
            target = package.build(root, Path(directory), 'v' + version)
            digest = package.verify(target, version)
            self.assertEqual(len(digest), 64)
            with zipfile.ZipFile(target) as archive:
                names = archive.namelist()
                self.assertIn('manifest.json', names)
                self.assertTrue(any(n.startswith('sidechat/') for n in names))
                self.assertFalse(any(n.startswith(('.github/', 'tests/', '.git/')) for n in names))
                for name in names:
                    self.assertEqual(archive.read(name), (root / name).read_bytes())
            with self.assertRaises(ValueError):
                package.verify(target, '0.1', digest)
            target.write_bytes(target.read_bytes() + b'tampered')
            with self.assertRaises(ValueError):
                package.verify(target, version, digest)

    def test_mismatch_writes_no_zip(self):
        root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                package.build(root, Path(directory), 'v0.0.0')
            self.assertEqual(list(Path(directory).iterdir()), [])


if __name__ == '__main__':
    unittest.main()
