"""Server locale del visualizzatore. Avvio: python3 server.py"""
import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
import secrets
from urllib.parse import urlsplit

from engine import CodeError, run_program
from flowchart_import import import_flowchart

ROOT = Path(__file__).resolve().parent
TOKEN = secrets.token_urlsafe(32)


class Handler(BaseHTTPRequestHandler):
    def valid_host(self):
        return self.headers.get('Host') in {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}

    def send(self, status, body, content_type='application/json; charset=utf-8'):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        if not self.valid_host():
            return self.send(403, {'error': 'Host non consentito.'})
        path = urlsplit(self.path).path
        if path == '/api/config':
            return self.send(200, {'token': TOKEN, 'examples': json.loads((ROOT / 'examples.json').read_text())})
        assets = {'/': ('index.html', 'text/html; charset=utf-8'), '/app.js': ('app.js', 'text/javascript; charset=utf-8'), '/style.css': ('style.css', 'text/css; charset=utf-8')}
        assets.update({f'/{name}': (name, 'text/css; charset=utf-8' if name.endswith('.css') else 'text/javascript; charset=utf-8')
                       for name in ['flowchart-core.js', 'flowchart-editor.js', 'flowchart.css']})
        if path not in assets:
            return self.send(404, {'error': 'Risorsa non trovata.'})
        name, mime = assets[path]
        self.send(200, (ROOT / name).read_bytes(), mime)

    def do_POST(self):
        origins = {f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}'}
        if not self.valid_host() or self.headers.get('Origin') not in origins or not secrets.compare_digest(self.headers.get('X-Visualizer-Token', ''), TOKEN):
            return self.send(403, {'error': 'Richiesta non autorizzata. Ricarica la pagina locale.'})
        if self.path not in {'/api/run','/api/import-flowchart'}:
            return self.send(404, {'error': 'Risorsa non trovata.'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > 80000 or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                return self.send(400, {'error': 'Invia codice e input come JSON entro il limite di dimensione.'})
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError('Richiesta non valida.')
            if self.path == '/api/import-flowchart':
                result = {'document':import_flowchart(data.get('code'))}
            else:
                arguments = (data.get('code'), data.get('input', ''))
                result = run_program(*arguments, flow=data['flow']) if 'flow' in data else run_program(*arguments)
            self.send(200, result)
        except (json.JSONDecodeError, ValueError, CodeError) as error:
            self.send(400, {'error': str(error)})
        except Exception:
            self.log_error('Errore interno durante la generazione della traccia')
            self.send(500, {'error': 'Errore interno. Controlla il terminale e riprova con un esempio breve.'})


def main():
    parser = argparse.ArgumentParser(description='Visualizzatore didattico C++ locale')
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    try:
        server = HTTPServer(('127.0.0.1', args.port), Handler)
    except OSError as error:
        parser.exit(1, f'Impossibile avviare il server: {error}\n')
    print(f'Visualizzatore C++: http://127.0.0.1:{server.server_port}', flush=True)
    print('Premi Ctrl+C per terminare. Il codice rimane su questo computer.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
