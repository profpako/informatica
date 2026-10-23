"""Build statico riproducibile, senza npm install né script di terze parti."""
import base64
import hashlib
import io
import json
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
                target = OUT / 'vendor' / name / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.extractfile(member).read())


def build():
    OUT.mkdir(exist_ok=True)
    dependencies()
    for name in ['LLVM-LICENSE.txt', 'PYODIDE-LICENSE.txt', 'PYTHON-LICENSE.txt', 'THIRD_PARTY.md']:
        shutil.copyfile(ROOT / name, OUT / name)
    for name in ['style.css', 'flowchart.css', 'flowchart-core.js', 'flowchart-editor.js',
                 'program-files.js', 'examples.json', 'engine.py', 'roles.py',
                 'flowchart_import.py', 'runtime.hpp']:
        shutil.copyfile(APP / name, OUT / name)
    shutil.copyfile(ROOT / 'browser_bridge.py', OUT / 'browser_bridge.py')
    html = (APP / 'index.html').read_text().replace('href="/', 'href="./').replace('src="/', 'src="./')
    html = html.replace('<script src="./app.js" defer></script>', '<script type="module" src="./app.js"></script>')
    html = html.replace('●</span> Sul tuo computer', '●</span> Prova WASM · nel browser')
    html = html.replace('<main', '<aside class="lab-note"><span id="lab-status" role="status">Prova gratuita WASM · al primo utilizzo viene scaricato il compilatore.</span><label>Standard <select id="lab-standard"><option value="17">C++17</option><option value="20">C++20</option><option value="23">C++23</option></select></label></aside><main', 1)
    (OUT / 'index.html').write_text(html)
    # shortcut: adattamento della UI stabile; introdurre request condivisa prima dell'integrazione su main.
    app = (APP / 'app.js').read_text().replace('fetch(', 'browserRequest(')
    app = app.replace("'cppviz-'", "'cppviz-pages-lab-'")
    app = app.replace('Avvia il server locale e ricarica per generare il C++.', 'Ricarica la pagina per riavviare il motore WASM.')
    app = app.replace('Verifica che il server locale sia attivo.', 'Controlla la connessione e ricarica la pagina.')
    app = app.replace('Server locale non raggiungibile. Avvia avvia.command e tieni aperto il terminale, poi ricarica la pagina e riprova. Codice e input sono conservati.', 'Motore WASM non disponibile. Ricarica e riprova; codice e input sono conservati.')
    app = app.replace("'C++17'", "'C++'+document.getElementById('lab-standard').value")
    app += "\ndocument.getElementById('lab-standard').addEventListener('change',()=>{invalidate();setMode(mode,true);flowEditor.sourceKey=null;flowEditor.preview();});\n"
    (OUT / 'app.js').write_text("import { browserRequest } from './browser-backend.js';\n" + app)
    for path in ROOT.glob('*.js'):
        shutil.copyfile(path, OUT / path.name)
    with (OUT / 'style.css').open('a') as css:
        css.write('\n.lab-note{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin:12px 24px;padding:10px 14px;border:1px solid #cbd5e1;background:#fff;font-size:13px;color:#53637a}.lab-note label{display:flex;align-items:center;gap:8px}.lab-note select{padding:5px;border:1px solid #cbd5e1;border-radius:4px;background:white}\n')
    (OUT / '.nojekyll').touch()
    print('Build pronto:', OUT, flush=True)


if __name__ == '__main__':
    build()
