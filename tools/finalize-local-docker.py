#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

root = Path.cwd()
package = json.loads((root / 'package.json').read_text(encoding='utf-8'))
lock_path = root / 'package-lock.json'
lock = json.loads(lock_path.read_text(encoding='utf-8'))

version = package.get('version')
if version != '1.5.1':
    raise SystemExit(f'Unexpected package version: {version!r}')
if lock.get('name') != package.get('name'):
    raise SystemExit('package.json and package-lock.json names differ')

lock['version'] = version
root_package = lock.setdefault('packages', {}).setdefault('', {})
root_package['version'] = version
lock_path.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print(f'package-lock.json synchronized to {version}')
