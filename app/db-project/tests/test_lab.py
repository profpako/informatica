"""Run with .venv/bin/python -m unittest discover -s tests -p test_lab.py.
Set TRAMA_TEST_PORT only for the isolated temporary MySQL test server.
"""
import json
import io
import os
from pathlib import Path
import secrets
import sys
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


def column(name, kind='int', key='', nullable=False, auto=False):
    return dict(name=name, type=kind, key=key, nullable=nullable, auto=auto, default=None)


TABLES = [dict(name='ditte', columns=[column('id', key='PRI', auto=True), column('nome', 'varchar(50)')], foreignKeys=[]),
          dict(name='medicinali', columns=[column('id', key='PRI', auto=True), column('id_ditta', key='MUL'), column('prezzo', 'decimal(10,2)')],
               foreignKeys=[dict(columns=['id_ditta'], target='ditte', references=['id'], database='farmacia')])]


class Laboratory(unittest.TestCase):
    def test_expired_sessions_have_a_distinct_response_without_attempting_insert(self):
        for sessions in ({}, {'expired': dict(touched=time.monotonic() - 3601)}):
            raw = json.dumps(dict(session='expired', draft={})).encode()
            handler = object.__new__(server.Handler)
            handler.path = '/api/insert'
            handler.server = SimpleNamespace(server_port=4173)
            handler.headers = {'Host': '127.0.0.1:4173', 'X-Trama-Client': 'local', 'Content-Type': 'application/json', 'Content-Length': str(len(raw))}
            handler.rfile = io.BytesIO(raw)
            replies = []
            handler.reply = lambda value, status=200: replies.append((status, value))
            with patch.dict(server.SESSIONS, sessions, clear=True), patch.object(server, 'insert') as insert:
                handler.do_POST()
                insert.assert_not_called()
            self.assertEqual(replies[0][0], 401)
            self.assertEqual(replies[0][1]['code'], 'session_expired')

    def test_stream_sends_progress_before_result_and_reports_failure(self):
        handler = object.__new__(server.Handler)
        handler.wfile = io.BytesIO()
        headers = []
        handler.send_response = lambda status: headers.append(status)
        handler.send_header = lambda *args: headers.append(args)
        handler.end_headers = lambda: None
        def generate(*args, progress):
            progress(dict(phase='generating', table='ditte', index=1, total=1))
            live = [json.loads(line) for line in handler.wfile.getvalue().splitlines()]
            self.assertEqual([e['event'] for e in live], ['progress', 'progress'])
            return dict(tables=[dict(name='ditte', rows=[])])
        with patch.object(server, 'generate', generate):
            handler.stream_generation({}, {})
        events = [json.loads(line) for line in handler.wfile.getvalue().splitlines()]
        self.assertEqual(events[-1]['event'], 'done')
        self.assertIn(('Content-Type', 'application/x-ndjson; charset=utf-8'), headers)
        handler.wfile = io.BytesIO()
        with patch.object(server, 'generate', side_effect=ValueError('CHECK non valido')):
            handler.stream_generation({}, {})
        error = json.loads(handler.wfile.getvalue().splitlines()[-1])
        self.assertEqual(error, dict(event='error', error='CHECK non valido'))

    def test_lineage_and_aliases(self):
        _, result = server.analyse('SELECT d.nome, SUM(m.prezzo) AS totale FROM medicinali m JOIN ditte d ON m.id_ditta=d.id WHERE m.prezzo>3 GROUP BY d.nome HAVING totale>5 ORDER BY totale DESC', TABLES)
        self.assertEqual(result['usage']['where'], [dict(alias='m', column='prezzo')])
        self.assertEqual(result['usage']['having'], [dict(alias='m', column='prezzo')])
        self.assertEqual(result['links'][0]['right'], dict(alias='d', column='id'))
        _, star = server.analyse('SELECT d.* FROM ditte d', TABLES)
        self.assertEqual(len(star['usage']['select']), 2)
        _, count = server.analyse('SELECT COUNT(*) FROM ditte', TABLES)
        self.assertEqual(count['usage']['select'], [])
        _, recursive = server.analyse('SELECT a.nome, b.nome FROM ditte a, ditte b WHERE a.id=b.id', TABLES)
        self.assertEqual(recursive['links'][0]['clause'], 'where')

    def test_queries_cannot_write_or_escape_selected_database(self):
        rejected = ['DELETE FROM ditte', 'SELECT * FROM ditte; DROP TABLE ditte',
                    'SELECT * INTO OUTFILE "/tmp/leak" FROM ditte', 'SELECT SLEEP(3) FROM ditte',
                    'SELECT LOAD_FILE("/tmp/leak") FROM ditte', 'SELECT evil_udf(nome) FROM ditte',
                    'SELECT * FROM mysql.user', 'SELECT * FROM ditte FOR UPDATE',
                    'SELECT @x:=1 FROM ditte', 'SELECT * FROM (SELECT * FROM ditte) x',
                    'SELECT * FROM ditte UNION SELECT * FROM ditte',
                    'SELECT id FROM ditte d JOIN medicinali m ON d.id=m.id_ditta',
                    'SELECT * FROM ditte NATURAL JOIN medicinali']
        for sql in rejected:
            with self.subTest(sql=sql), self.assertRaises(ValueError):
                server.analyse(sql, TABLES)
        query, _ = server.analyse('SELECT * FROM ditte /*! INTO OUTFILE "/tmp/leak" */', TABLES)
        self.assertNotIn('OUTFILE', query.sql(dialect='mysql', comments=False))

    def test_ddl_is_only_for_new_tables_in_selected_database(self):
        script = 'CREATE DATABASE IF NOT EXISTS farmacia; USE farmacia; CREATE TABLE ditte(id INT PRIMARY KEY); CREATE TABLE medicinali(id INT PRIMARY KEY,id_ditta INT); ALTER TABLE medicinali ADD FOREIGN KEY(id_ditta) REFERENCES ditte(id);\n-- Vincolo residuo da gestire con un trigger.'
        self.assertEqual(len(server.ddl_statements(script, 'farmacia')), 5)
        for sql in ['DROP TABLE ditte;', 'USE mysql;', 'CREATE DATABASE altro;', 'CREATE TABLE a AS SELECT 1;', 'ALTER TABLE ditte DROP COLUMN id;', 'CREATE TABLE mysql.a(id INT);']:
            with self.subTest(sql=sql), self.assertRaises(ValueError):
                server.ddl_statements(sql, 'farmacia')

    def test_population_boundary_and_composite_references(self):
        table = dict(name='numeri', columns=[column('id'), column('id_ditta'), column('telefono', 'varchar(13)')])
        rows = [dict(id=1, id_ditta=4, telefono="+39'123")]
        self.assertIs(server.validate_rows(table, rows), rows)
        for row in [dict(id=1, id_ditta=None, telefono='123'), dict(id='not an int', id_ditta=4, telefono='123'), dict(id=1, id_ditta=4, telefono='x' * 14), dict(id=1, id_ditta=4, telefono={'sql': 'DROP'}), dict(id=1, id_ditta=4, telefono='123', injected='value')]:
            with self.subTest(row=row), self.assertRaises(ValueError):
                server.validate_rows(table, [row])
        refs = [dict(columns=['a', 'b'], target='parent', references=['x', 'y'], values=[dict(x=1, y=2), dict(x=3, y=4)])]
        server.check_references(dict(name='child'), [dict(a=1, b=2)], refs)
        with self.assertRaises(ValueError):
            server.check_references(dict(name='child'), [dict(a=1, b=4)], refs)
        self.assertEqual([t['name'] for t in server.generation_order(list(reversed(TABLES)), '*')], ['ditte', 'medicinali'])
        with self.assertRaises(ValueError):
            server.configuration(dict(host='remote.example', port=3306, user='root', database='farmacia'))
        with self.assertRaises(ValueError):
            server.configuration(dict(port=3306, user='root', database='mysql'))


@unittest.skipUnless(os.environ.get('TRAMA_TEST_PORT'), 'isolated MySQL server not requested')
class MySQLPath(unittest.TestCase):
    def test_population_queries_and_atomic_rollback(self):
        port = int(os.environ['TRAMA_TEST_PORT'])
        # Never run this destructive cleanup on a normal server.
        self.assertEqual(port, 3308)
        database = 'trama_lab_verify_' + secrets.token_hex(6)
        config = dict(host='127.0.0.1', port=port, user='root', password='', database=database)
        script = f'CREATE DATABASE {server.quote(database)}; USE {server.quote(database)}; CREATE TABLE ditte(id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,nome VARCHAR(50) NOT NULL UNIQUE) ENGINE=InnoDB; CREATE TABLE medicinali(id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,id_ditta INT UNSIGNED NOT NULL,nome VARCHAR(50) NOT NULL,prezzo DECIMAL(10,2) NOT NULL CHECK(prezzo>=0),FOREIGN KEY(id_ditta) REFERENCES ditte(id)) ENGINE=InnoDB;'
        try:
            tables = server.prepare(config, script)['tables']
            def fake_ollama(path, payload=None, timeout=5):
                if path == 'tags':
                    return {'models': [{'name': server.DEFAULT_MODEL}]}
                self.assertEqual(payload['options']['num_ctx'], 4096)
                self.assertEqual(payload['keep_alive'], '0')
                self.assertFalse(payload['think'])
                context = json.loads(payload['messages'][1]['content'])
                if context['table'] == 'ditte':
                    rows = [dict(nome="Ditta 'A'"), dict(nome='Ditta B')]
                else:
                    self.assertEqual(context['foreignKeys'][0]['values'], [dict(id=1), dict(id=2)])
                    rows = [dict(id_ditta=1, nome='Aspirina', prezzo=4.5), dict(id_ditta=2, nome='Cerotto', prezzo=8)]
                return {'message': {'content': json.dumps(dict(rows=rows))}}
            progress = []
            with patch.object(server, 'ollama', fake_ollama):
                draft = server.generate(config, '*', 2, 'Dati farmacia', server.DEFAULT_MODEL, progress.append)
            self.assertEqual([(p['table'], p['phase']) for p in progress], [('ditte', 'generating'), ('ditte', 'validating'), ('ditte', 'completed'), ('medicinali', 'generating'), ('medicinali', 'validating'), ('medicinali', 'completed')])
            self.assertEqual(server.insert(config, draft), {'inserted': 4})
            result = server.execute_query(config, 'SELECT m.nome, d.nome FROM medicinali m LEFT JOIN ditte d ON m.id_ditta=d.id WHERE m.prezzo>5 ORDER BY m.nome')
            self.assertEqual([s['phase'] for s in result['steps']], ['from', 'join', 'where', 'select'])
            self.assertEqual(len(result['steps'][1]['data']['rows']), 2)
            self.assertEqual(result['steps'][-1]['data']['rows'], [['Cerotto', 'Ditta B']])
            bad = dict(fingerprint=server.fingerprint(tables), tables=[dict(name='ditte', rows=[dict(id=3, nome='Ditta C')]), dict(name='medicinali', rows=[dict(id=3, id_ditta=3, nome='Fallisce', prezzo=-1)])])
            with self.assertRaises(server.pymysql.MySQLError):
                server.insert(config, bad)
            remaining = server.execute_query(config, 'SELECT COUNT(*) AS totale FROM ditte')['steps'][-1]['data']['rows']
            self.assertEqual(remaining, [[2]])
            grouped = server.execute_query(config, 'SELECT d.nome, SUM(m.prezzo) AS totale FROM medicinali m JOIN ditte d ON m.id_ditta=d.id GROUP BY d.nome HAVING totale>5 ORDER BY totale')
            self.assertEqual(grouped['steps'][-1]['data']['rows'], [['Ditta B', '8.00']])
            with self.assertRaises(ValueError):
                server.prepare(config, script)
        finally:
            with server.connect(config, False) as conn:
                with conn.cursor() as cur:
                    cur.execute('DROP DATABASE IF EXISTS ' + server.quote(database))
                conn.commit()


if __name__ == '__main__':
    unittest.main()
