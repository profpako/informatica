from http.client import HTTPConnection
from http.server import HTTPServer
import json
import threading
import unittest
from unittest.mock import patch

from engine import CodeError
from server import Handler, TOKEN


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.origin = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, method, path, data=None, headers=None):
        client = HTTPConnection('127.0.0.1', self.server.server_port, timeout=3)
        client.request(method, path, data, headers or {})
        response = client.getresponse()
        status, body, returned_headers = response.status, response.read(), dict(response.getheaders())
        client.close()
        return status, body, returned_headers

    def test_static_config_and_source_not_exposed(self):
        status, body, headers = self.request('GET', '/')
        self.assertEqual(status, 200)
        self.assertIn(b'lang="it"', body)
        self.assertIn("frame-ancestors 'none'", headers['Content-Security-Policy'])
        self.assertIn("img-src 'self' blob:", headers['Content-Security-Policy'])
        status, body, _ = self.request('GET', '/api/config')
        self.assertEqual(status, 200)
        self.assertEqual(len(json.loads(body)['examples']), 6)
        for path in ['/flowchart-core.js', '/flowchart-editor.js', '/flowchart.css']:
            self.assertEqual(self.request('GET', path)[0], 200)
        for path in ['/engine.py', '/runtime.hpp', '/../README.md']:
            self.assertEqual(self.request('GET', path)[0], 404)

    @patch('server.run_program')
    def test_origin_token_and_host_required(self, run):
        valid = {'Origin': self.origin, 'X-Visualizer-Token': TOKEN, 'Content-Type': 'application/json'}
        for headers in [{}, {**valid, 'Origin': 'https://example.com'}, {**valid, 'X-Visualizer-Token': 'errato'}, {**valid, 'Host': 'example.com'}]:
            self.assertEqual(self.request('POST', '/api/run', '{}', headers)[0], 403)
        run.assert_not_called()

    @patch('server.run_program')
    def test_api_success_and_diagnostics(self, run):
        headers = {'Origin': self.origin, 'X-Visualizer-Token': TOKEN, 'Content-Type': 'application/json'}
        run.return_value = {'steps': [], 'error': '', 'warnings': ''}
        status, body, _ = self.request('POST', '/api/run', json.dumps({'code': 'int main(){}', 'input': '5'}), headers)
        self.assertEqual(status, 200)
        run.assert_called_once_with('int main(){}', '5')
        run.side_effect = CodeError('Errore di compilazione')
        status, body, _ = self.request('POST', '/api/run', '{"code":"x"}', headers)
        self.assertEqual(status, 400)
        self.assertIn('Errore di compilazione', json.loads(body)['error'])

    @patch('server.run_program')
    def test_flowchart_metadata_reaches_engine(self, run):
        headers = {'Origin': self.origin, 'X-Visualizer-Token': TOKEN, 'Content-Type': 'application/json'}
        run.return_value = {'steps': [], 'error': '', 'warnings': ''}
        flow = {'deferred': [{'line': 2}]}
        status, _, _ = self.request('POST', '/api/run', json.dumps({'code':'int main(){}','flow':flow}), headers)
        self.assertEqual(status, 200)
        run.assert_called_once_with('int main(){}', '', flow=flow)

    @patch('server.import_flowchart')
    def test_cpp_import_authentication_success_and_diagnostics(self, convert):
        body=json.dumps({'code':'int main(){}'})
        self.assertEqual(self.request('POST','/api/import-flowchart',body)[0],403)
        convert.assert_not_called()
        headers={'Origin':self.origin,'X-Visualizer-Token':TOKEN,'Content-Type':'application/json'}
        convert.return_value={'format':'dentro-il-codice-flowchart','version':2,'functions':[]}
        status, response, _=self.request('POST','/api/import-flowchart',body,headers)
        self.assertEqual(status,200);self.assertEqual(json.loads(response)['document'],convert.return_value)
        convert.assert_called_once_with('int main(){}')
        convert.side_effect=CodeError('Riga 4: switch non importabile.')
        status, response, _=self.request('POST','/api/import-flowchart',body,headers)
        self.assertEqual(status,400);self.assertIn('Riga 4',json.loads(response)['error'])


if __name__ == '__main__':
    unittest.main()
