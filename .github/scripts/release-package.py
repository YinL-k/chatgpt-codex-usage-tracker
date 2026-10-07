"""Build once; later consumers only verify the exact ZIP and its SHA-256."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import zipfile


def validate_version(manifest, tag):
    version = manifest.get('version', '')
    if not isinstance(version, str) or not re.fullmatch(r'(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*)){0,3}', version):
        raise ValueError('Invalid manifest version: expected one to four numeric components')
    if any(int(part) > 65535 for part in version.split('.')) or not any(int(part) for part in version.split('.')):
        raise ValueError('Manifest version components must be 0..65535 and not all zero')
    if tag != 'v' + version:
        raise ValueError('Tag must exactly match v + manifest.json.version')
    return version


def verify(path, version, expected_hash=None):
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if expected_hash and digest != expected_hash:
        raise ValueError('Release ZIP checksum mismatch')
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if names.count('manifest.json') != 1 or len(names) != len(set(names)):
            raise ValueError('Package must contain exactly one root manifest and no duplicate entries')
        if archive.testzip() is not None:
            raise ValueError('Corrupt release ZIP')
        validate_version(json.loads(archive.read('manifest.json')), 'v' + version)
    return digest


def build(root, output, tag):
    version = validate_version(json.loads((root / 'manifest.json').read_text(encoding='utf-8')), tag)
    files = [root / 'manifest.json', root / 'privacy-policy.md']
    for pattern in ('*.js', '*.css', '*.html'):
        files.extend(root.glob(pattern))
    for directory in ('assets', '_locales', 'locales', 'frontend', 'sidechat'):
        folder = root / directory
        if not folder.is_dir():
            raise ValueError('Missing package directory: ' + directory)
        files.extend(p for p in folder.rglob('*') if p.is_file())
    if any(p.is_symlink() for p in files):
        raise ValueError('Package symlinks are not supported')
    output.mkdir(parents=True, exist_ok=True)
    target = output / f'SakuraMeter-{version}.zip'
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(set(files)):
            archive.write(path, path.relative_to(root).as_posix())
    digest = verify(target, version)
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as stream:
            stream.write(f'version={version}\nartifact_name=sakurameter-{version}\nsha256={digest}\n')
    print(f'Verified SakuraMeter-{version}.zip SHA-256 {digest}')
    return target


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest='command', required=True)
    builder = commands.add_parser('build')
    builder.add_argument('--tag', required=True)
    builder.add_argument('--output', type=Path, default=Path('release'))
    verifier = commands.add_parser('verify')
    verifier.add_argument('--zip', type=Path, required=True)
    verifier.add_argument('--version', required=True)
    verifier.add_argument('--sha256', required=True)
    args = parser.parse_args()
    if args.command == 'build':
        build(Path.cwd(), args.output, args.tag)
    else:
        verify(args.zip, args.version, args.sha256)
        print('Release artifact checksum and manifest verified')


if __name__ == '__main__':
    main()
