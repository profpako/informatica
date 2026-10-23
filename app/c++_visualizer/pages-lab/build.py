"""Build statico riproducibile, senza npm install né script di terze parti."""
import base64
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parent
APP = ROOT.parent
OUT = ROOT / 'dist'
CACHE = ROOT / '.cache'


def dependencies():
    CACHE.mkdir(exist_ok=True)
    for name, package in json.loads((ROOT / 'packages.lock.json').read_text()).items():
        path = CACHE / f'{name}-{package["version"]}.tgz'
        if not path.exists():
            print('Scarico', name, package['version'], flush=True)
            with urllib.request.urlopen(package['url'], timeout=90) as response:
                data = response.read()
            path.write_bytes(data)
        data = path.read_bytes()
        digest = 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode()
        if digest != package['integrity']:
            raise ValueError('Integrità non valida per ' + name)
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
            for member in archive.getmembers():
                parts = PurePosixPath(member.name).parts
                if not member.isfile() or parts[0] != 'package' or '..' in parts:
                    continue
                relative = Path(*parts[1:])
                if relative.suffix in {'.map', '.ts'} or relative.name == 'stdc++.h.pch':
                    continue
                target = OUT / 'vendor' / (name + '-' + package['version']) / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.extractfile(member).read())


def build():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(exist_ok=True)
    dependencies()
    shared = ['app.js', 'style.css', 'flowchart.css', 'flowchart-core.js', 'flowchart-editor.js',
              'program-files.js', 'examples.json', 'engine.py', 'roles.py', 'flowchart_import.py', 'runtime.hpp']
    sources = [APP / name for name in ['index.html', *shared]] + [ROOT / name for name in
              ['browser-backend.js', 'browser-worker.js', 'browser_bridge.py', 'packages.lock.json', 'build.py']]
    revision = hashlib.sha256(b''.join(path.read_bytes() for path in sources)).hexdigest()[:16]
    assets = OUT / 'assets' / revision
    assets.mkdir(parents=True)
    for name in ['LLVM-LICENSE.txt', 'PYODIDE-LICENSE.txt', 'PYTHON-LICENSE.txt', 'THIRD_PARTY.md']:
        shutil.copyfile(ROOT / name, OUT / name)
    for name in shared:
        shutil.copyfile(APP / name, assets / name)
    shutil.copyfile(ROOT / 'browser_bridge.py', assets / 'browser_bridge.py')
    html = (APP / 'index.html').read_text()
    html = html.replace('●</span> Sul tuo computer', '●</span> Nel browser · WASM')
    html = html.replace('<main', '<p id="lab-status" class="lab-note" role="status">Al primo utilizzo viene scaricato il compilatore. Codice e input vengono eseguiti nel browser.</p><main', 1)
    html = html.replace('href="./', f'href="./assets/{revision}/').replace('src="./', f'src="./assets/{revision}/')
    (OUT / 'index.html').write_text(html)
    shutil.copyfile(ROOT / 'browser-backend.js', assets / 'transport.js')
    worker = (ROOT / 'browser-worker.js').read_text()
    for name, package in json.loads((ROOT / 'packages.lock.json').read_text()).items():
        worker = worker.replace('./vendor/' + name + '/', '../../vendor/' + name + '-' + package['version'] + '/')
    (assets / 'browser-worker.js').write_text(worker)
    with (assets / 'style.css').open('a') as css:
        css.write('\n.lab-note{margin:12px 24px;padding:10px 14px;border:1px solid #cbd5e1;background:#fff;font-size:13px;color:#53637a}\n')
    (OUT / 'build-info.json').write_text(json.dumps({'source': os.environ.get('GITHUB_SHA', 'local'),
        'revision': revision, 'assets': f'assets/{revision}/'}, indent=2))
    (OUT / '.nojekyll').touch()
    print('Build pronto:', OUT, flush=True)


if __name__ == '__main__':
    build()
