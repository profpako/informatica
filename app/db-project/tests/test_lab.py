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
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


def column(name, kind='int', key='', nullable=False, auto=False):
    return dict(name=name, type=kind, key=key, nullable=nullable, auto=auto, default=None)


TABLES = [dict(name='ditte', columns=[column('id', key='PRI', auto=True), column('nome', 'varchar(50)')], foreignKeys=[]),
          dict(name='medicinali', columns=[column('id', key='PRI', auto=True), column('id_ditta', key='MUL'), column('prezzo', 'decimal(10,2)')],
               foreignKeys=[dict(columns=['id_ditta'], target='ditte', references=['id'], database='farmacia')])]


class Laboratory(unittest.TestCase):
    def test_guided_population_covers_parents_with_different_table_counts_before_ai(self):
        tables = [dict(**TABLES[0], engine='InnoDB', unique=[['id']], ddl='CREATE TABLE ditte(id INT PRIMARY KEY, nome VARCHAR(50))'),
                  dict(name='telefoni', engine='InnoDB', unique=[['id']], ddl='CREATE TABLE telefoni(id INT PRIMARY KEY, id_ditta INT, telefono VARCHAR(13))',
                       columns=[column('id', auto=True), column('id_ditta'), column('telefono', 'varchar(13)')], foreignKeys=TABLES[1]['foreignKeys'])]
        rules = [dict(table='telefoni', columns=['id_ditta'], min=1, max=3)]
        conn = MagicMock(); conn.__enter__.return_value = conn
        cur = conn.cursor.return_value.__enter__.return_value
        cur.fetchone.return_value = (0,); cur.fetchall.return_value = []
        chats = []
        def model(path, payload=None, timeout=5):
            if path == 'tags':
                return dict(models=[dict(name=server.DEFAULT_MODEL)])
            context = json.loads(payload['messages'][1]['content']); chats.append(context)
            n = context['count']
            if context['table'] == 'ditte':
                rows = [dict(nome=f'Ditta {i}') for i in range(n)]
            else:
                self.assertNotIn('id_ditta', payload['format']['properties']['rows']['items']['properties'])
                self.assertEqual(len(context['assignedForeignKeys']), 8)
                rows = [dict(telefono=f'33300000{i}') for i in range(n)]
            return dict(message=dict(content=json.dumps(dict(rows=rows))))
        with patch.object(server, 'connect', return_value=conn), patch.object(server, 'metadata', return_value=tables), \
             patch.object(server, 'ollama', model), patch.object(server, 'insert') as insert:
            draft = server.generate(dict(database='farmacia'), '*', dict(ditte=5, telefoni=8), 'Dati farmacia', server.DEFAULT_MODEL, distributions=rules)
            self.assertEqual([len(t['rows']) for t in draft['tables']], [5, 8])
            self.assertEqual([sum(r['id_ditta'] == i for r in draft['tables'][1]['rows']) for i in range(1, 6)], [2, 2, 2, 1, 1])
            self.assertEqual(draft['distributions'], rules)
            self.assertEqual(insert.call_args.kwargs, dict(commit=False))
            chats.clear(); insert.reset_mock()
            with self.assertRaisesRegex(ValueError, 'hai scelto 4.*almeno 5'):
                server.generate(dict(database='farmacia'), '*', dict(ditte=5, telefoni=4), 'Dati farmacia', server.DEFAULT_MODEL, distributions=rules)
            self.assertEqual(chats, []); insert.assert_not_called()

    def test_distribution_respects_existing_rows_composite_keys_and_input_boundaries(self):
        self.assertEqual(server.allocate_links([2, 0, 1], 3, 1, 3, 'telefoni'), [1, 1, 2])
        self.assertEqual(server.allocate_links([3, 1], 2, 1, 3, 'telefoni'), [1, 1])
        for totals, count, low, high in [([], 1, 0, 3), ([0, 0], 1, 1, 3), ([3], 1, 1, 3), ([4], 1, 1, 3)]:
            with self.subTest(totals=totals), self.assertRaises(ValueError):
                server.allocate_links(totals, count, low, high, 'telefoni')
        for counts in [dict(ditte=-1), dict(ditte=True), dict(ditte=21), dict(ditte=0), dict(intrusa=1)]:
            with self.subTest(counts=counts), self.assertRaises(ValueError):
                server.generation_counts(TABLES, '*', counts)
        self.assertEqual(server.generation_counts(TABLES, '*', dict(ditte=0, medicinali=2)), dict(ditte=0, medicinali=2))
        owner = dict(name='ditte', columns=[column('a'), column('b')], foreignKeys=[], unique=[['a', 'b']])
        fk = dict(columns=['id_a', 'id_b'], target='ditte', references=['a', 'b'], database='farmacia')
        child = dict(name='telefoni', columns=[column('id'), column('id_a'), column('id_b')], foreignKeys=[fk], unique=[['id']])
        rule = dict(table='telefoni', columns=fk['columns'], min=1, max=2)
        rules = server.distribution_rules([owner, child], [rule], 'farmacia')
        cur = MagicMock(); cur.fetchall.return_value = [(1, 2, 0), (3, 4, 1)]
        plan = server.population_plan(cur, [owner, child], dict(telefoni=2), rules)['telefoni']
        self.assertEqual(plan['existing'], [[1, 2, 0], [3, 4, 1]])
        self.assertEqual(plan['slots'], [0, 0])
        self.assertIn('p.`a`=c.`id_a` AND p.`b`=c.`id_b`', cur.execute.call_args.args[0])
        for bad in [{**rule, 'min': True}, {**rule, 'max': 0}, {**rule, 'columns': ['injected']}, {**rule, 'table': 'unknown'}]:
            with self.subTest(rule=bad), self.assertRaises(ValueError):
                server.distribution_rules([owner, child], [bad], 'farmacia')
        child['unique'].append(fk['columns'])
        with self.assertRaisesRegex(ValueError, 'massimo.*1'):
            server.distribution_rules([owner, child], [rule], 'farmacia')

    def test_generation_constrains_text_lengths_and_corrects_without_truncating(self):
        table = dict(name='ditte_numeri_di_telefono', engine='InnoDB', unique=[], foreignKeys=[],
                     ddl='CREATE TABLE ditte_numeri_di_telefono(id INT PRIMARY KEY, n_telefono VARCHAR(13), sigla CHAR(3))',
                     columns=[column('id', auto=True), column('n_telefono', 'varchar(13)'), column('sigla', 'char(3)', nullable=True)])
        conn = MagicMock(); conn.__enter__.return_value = conn
        conn.cursor.return_value.__enter__.return_value.fetchone.return_value = (0,)
        chats = []
        fix = True
        def model(path, payload=None, timeout=5):
            if path == 'tags':
                return dict(models=[dict(name=server.DEFAULT_MODEL)])
            properties = payload['format']['properties']['rows']['items']['properties']
            self.assertEqual(properties['n_telefono']['maxLength'], 13)
            self.assertEqual(properties['sigla'], {'type': ['string', 'null'], 'maxLength': 3})
            context = json.loads(payload['messages'][1]['content'])
            self.assertEqual(context['maxLengths'], dict(n_telefono=13, sigla=3))
            if chats:
                self.assertIn('massimo 13', payload['messages'][-1]['content'])
            chats.append(payload)
            phone = '+393331234567' if fix and len(chats) == 2 else '+39 333 1234567'
            return dict(message=dict(content=json.dumps(dict(rows=[dict(n_telefono=phone, sigla=None)]))))
        with patch.object(server, 'connect', return_value=conn), patch.object(server, 'metadata', return_value=[table]), \
             patch.object(server, 'ollama', model), patch.object(server, 'insert') as insert:
            draft = server.generate(dict(database='farmacia'), '*', 1, 'Dati realistici', server.DEFAULT_MODEL)
            self.assertEqual(draft['tables'][0]['rows'][0]['n_telefono'], '+393331234567')
            insert.assert_called_once()
            self.assertFalse(insert.call_args.kwargs['commit'])
            chats.clear(); insert.reset_mock(); fix = False
            with self.assertRaisesRegex(ValueError, 'massimo 13.*Nessuna riga inserita') as failure:
                server.generate(dict(database='farmacia'), '*', 1, 'Dati realistici', server.DEFAULT_MODEL)
            self.assertNotIn('Riduci le righe', str(failure.exception))
            insert.assert_not_called()

    def test_hardware_recommendations_and_unavailable_detection(self):
        for ram, apple, expected in [(8, True, '2b'), (16, True, '4b'), (24, True, '9b'),
                                     (32, False, '4b'), (None, False, '2b')]:
            self.assertIn(':' + expected + '-', server.recommended_model(dict(ramGb=ram, appleSilicon=apple)))
        with patch.object(server.platform, 'system', return_value='Darwin'), \
             patch.object(server.platform, 'machine', return_value='x86_64'), \
             patch.object(server.subprocess, 'run') as run:
            # Rosetta's process architecture must not disguise Apple Silicon.
            run.return_value = SimpleNamespace(stdout='17179869184\n1\n')
            hardware = server.local_hardware()
            self.assertEqual(hardware['ramGb'], 16)
            self.assertTrue(hardware['appleSilicon'])
            run.side_effect = OSError('unavailable')
            self.assertIsNone(server.local_hardware()['ramGb'])
        handler = object.__new__(server.Handler)
        handler.path = '/api/status'; handler.server = SimpleNamespace(server_port=4173)
        handler.headers = {'Host': '127.0.0.1:4173'}
        replies = []; handler.reply = replies.append
        with patch.object(server, 'local_hardware', return_value=hardware), \
             patch.object(server, 'ollama', return_value={'models': [{'name': server.DEFAULT_MODEL}]}):
            handler.do_GET()
        self.assertEqual(replies[0]['defaultModel'], 'qwen3.5:4b-q4_K_M')
        self.assertEqual(replies[0]['models'], [server.DEFAULT_MODEL])
        self.assertEqual(len(replies[0]['modelAdvice']), 3)

    def test_unreachable_ollama_does_not_claim_the_model_is_missing(self):
        with patch.object(server, 'urlopen', side_effect=server.URLError('Connection refused')):
            with self.assertRaises(ValueError) as failure:
                server.ollama('tags')
        message = str(failure.exception)
        self.assertIn('127.0.0.1:11434', message)
        self.assertIn('avvia l’app o il servizio', message)
        self.assertIn('Non è possibile verificare i modelli', message)
        self.assertNotIn('scarica', message)

    def test_dependency_guidance_distinguishes_setup_from_restart_and_reaches_all_endpoints(self):
        with patch.object(server, 'pymysql', None), patch.object(server, 'sqlglot', None), \
             patch.object(server, 'ROOT', Path('/trama')):
            with patch.object(Path, 'exists', return_value=False), patch.object(server.subprocess, 'run') as run:
                message = server.dependency_error()
                self.assertIn('python3 -m venv .venv', message)
                self.assertIn('pip install -r requirements.txt', message)
                run.assert_not_called()
            with patch.object(Path, 'exists', return_value=True), patch.object(server.subprocess, 'run') as run:
                run.return_value = SimpleNamespace(returncode=1, stderr="ModuleNotFoundError: No module named 'sqlglot'")
                self.assertIn("No module named 'sqlglot'", server.dependency_error())
                self.assertIn('pip install', server.dependency_error())
                run.return_value = SimpleNamespace(returncode=0)
                for prefix, reason in [('/other-python', 'Python diverso'), ('/trama/.venv', 'all’avvio')]:
                    with self.subTest(prefix=prefix), patch.object(server.sys, 'prefix', prefix):
                        message = server.dependency_error()
                        self.assertIn(reason, message)
                        self.assertIn('Ctrl+C', message)
                        self.assertIn('./start_app.sh', message)
                        self.assertNotIn('pip install', message)
                for action in [lambda: server.connect({}), lambda: server.parse_sql('SELECT 1')]:
                    with self.assertRaises(ValueError) as failure:
                        action()
                    self.assertEqual(str(failure.exception), server.dependency_error())
                handler = object.__new__(server.Handler)
                handler.path = '/api/status'
                handler.server = SimpleNamespace(server_port=4173)
                handler.headers = {'Host': '127.0.0.1:4173'}
                replies = []
                handler.reply = lambda value: replies.append(value)
                with patch.object(server, 'ollama', return_value={'models': []}):
                    handler.do_GET()
                self.assertFalse(replies[0]['dependencies'])
                self.assertEqual(replies[0]['dependencyError'], server.dependency_error())
                run.side_effect = OSError('Cannot execute Python')
                self.assertIn('Non riesco ad avviare', server.dependency_error())
        self.assertEqual(server.dependency_error(), '')

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
        def generate(*args, progress, distributions=None):
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
    def test_boolean_filters_group_members_having_and_order_on_mysql(self):
        port = int(os.environ['TRAMA_TEST_PORT']); self.assertEqual(port, 3308)
        database = 'trama_lab_select_' + secrets.token_hex(6)
        config = dict(host='127.0.0.1', port=port, user='root', password='', database=database)
        script = f'''CREATE DATABASE {server.quote(database)}; USE {server.quote(database)};
            CREATE TABLE ditte(id INT PRIMARY KEY,nome VARCHAR(50));
            CREATE TABLE medicinali(id INT PRIMARY KEY,id_ditta INT,nome VARCHAR(50),prescrizione INT NULL,FOREIGN KEY(id_ditta) REFERENCES ditte(id));
            CREATE TABLE utilizzi(id INT PRIMARY KEY,nome VARCHAR(50));
            CREATE TABLE prevede(id_medicinale INT,id_utilizzo INT,PRIMARY KEY(id_medicinale,id_utilizzo),FOREIGN KEY(id_medicinale) REFERENCES medicinali(id),FOREIGN KEY(id_utilizzo) REFERENCES utilizzi(id));'''
        joins = 'FROM ditte d INNER JOIN medicinali m ON d.id=m.id_ditta INNER JOIN prevede a ON m.id=a.id_medicinale INNER JOIN utilizzi u ON a.id_utilizzo=u.id'
        where = 'WHERE m.prescrizione = 1 AND u.nome = "Mal di testa"'
        query = "SELECT d.nome, COUNT(*) AS 'Num_medicinali' " + joins + ' ' + where + ' GROUP BY d.nome'
        try:
            server.prepare(config, script)
            with server.connect(config) as conn, conn.cursor() as cur:
                cur.execute("INSERT INTO ditte VALUES(1,'Acme S.r.l.'),(2,'Beta'),(3,'Senza medicinali')")
                cur.execute("INSERT INTO medicinali VALUES(1,1,'A',1),(2,1,'B',0),(3,1,'C',NULL),(4,2,'D',1),(5,2,'E',1),(6,1,'F',1)")
                cur.execute("INSERT INTO utilizzi VALUES(1,'Mal di testa'),(2,'Febbre')")
                cur.execute('INSERT INTO prevede VALUES(1,1),(1,2),(2,1),(3,1),(4,1),(5,1),(6,2)'); conn.commit()
            result = server.execute_query(config, query + ' ORDER BY Num_medicinali DESC, d.nome ASC LIMIT 1 OFFSET 1')
            self.assertEqual([s['phase'] for s in result['steps']], ['from', 'join', 'join', 'join', 'where', 'group', 'select', 'order', 'limit'])
            filtered = result['steps'][4]
            self.assertEqual(len(filtered['input']['rows']), 7)
            self.assertEqual(len(filtered['data']['rows']), 3)
            flags = [row[-1] for row in filtered['checks']['rows']]
            self.assertEqual(sorted(flags), [-1, 0, 0, 0, 1, 1, 1])
            self.assertEqual(filtered['checks']['conditions'][-1], "m.prescrizione = 1 AND u.nome = 'Mal di testa'")
            self.assertEqual(result['working']['data'], filtered['data'])
            self.assertIn('m.id_ditta', result['working']['data']['columns'])
            grouped = result['steps'][5]
            self.assertEqual(grouped['data']['columns'], ['Gruppo', 'd.nome', 'COUNT(*)'])
            self.assertEqual(grouped['data']['rows'], [[1, 'Acme S.r.l.', 1], [2, 'Beta', 2]])
            self.assertEqual([sum(r[0] == i for r in grouped['input']['rows']) for i in (1, 2)], [1, 2])
            self.assertEqual(result['steps'][-2]['data']['rows'], [['Beta', 2], ['Acme S.r.l.', 1]])
            self.assertEqual(result['final']['data']['rows'], [['Acme S.r.l.', 1]])
            having = server.execute_query(config, query + ' HAVING Num_medicinali > 1 ORDER BY Num_medicinali')
            h = next(s for s in having['steps'] if s['phase'] == 'having')
            self.assertEqual(h['checks']['rows'], [[0], [1]])
            self.assertEqual(having['final']['data']['rows'], [['Beta', 2]])
            either = server.execute_query(config, 'SELECT m.id ' + joins + ' WHERE (m.prescrizione=1 AND u.nome="Febbre") OR m.prescrizione IS NULL ORDER BY m.id')
            self.assertEqual(either['final']['data']['rows'], [[1], [3], [6]])
            e = next(s for s in either['steps'] if s['phase'] == 'where')
            self.assertEqual(sum(row[-1] == 1 for row in e['checks']['rows']), 3)
            for grouping in ['GROUP BY azienda', 'GROUP BY 1']:
                aliased = server.execute_query(config, 'SELECT d.nome AS azienda, COUNT(*) AS n ' + joins + ' ' + where + ' ' + grouping + ' ORDER BY azienda')
                self.assertEqual(aliased['final']['data']['rows'], [['Acme S.r.l.', 1], ['Beta', 2]])
            empty = server.execute_query(config, 'SELECT COUNT(*) AS n FROM ditte WHERE id<0')
            self.assertEqual(empty['final']['data']['rows'], [[0]])
            star = server.execute_query(config, 'SELECT * FROM ditte HAVING id>1 ORDER BY id DESC')
            self.assertEqual(star['final']['data']['rows'], [[3, 'Senza medicinali'], [2, 'Beta']])
            left = server.execute_query(config, 'SELECT d.nome, COUNT(m.id) AS n FROM ditte d LEFT JOIN medicinali m ON d.id=m.id_ditta GROUP BY d.nome ORDER BY n, d.nome')
            self.assertEqual(left['final']['data']['rows'][0], ['Senza medicinali', 0])
            with self.assertRaisesRegex(ValueError, 'SLEEP'):
                server.execute_query(config, 'SELECT id FROM ditte WHERE id=1 OR SLEEP(1)=0')
        finally:
            with server.connect(config, False) as conn, conn.cursor() as cur:
                cur.execute('DROP DATABASE IF EXISTS ' + server.quote(database)); conn.commit()

    def test_guided_distribution_on_empty_and_populated_database_and_edited_draft_rollback(self):
        port = int(os.environ['TRAMA_TEST_PORT']); self.assertEqual(port, 3308)
        database = 'trama_lab_guided_' + secrets.token_hex(6)
        config = dict(host='127.0.0.1', port=port, user='root', password='', database=database)
        script = f'CREATE DATABASE {server.quote(database)}; USE {server.quote(database)}; CREATE TABLE ditte(id INT AUTO_INCREMENT PRIMARY KEY,nome VARCHAR(50) NOT NULL UNIQUE) ENGINE=InnoDB; CREATE TABLE telefoni(id INT AUTO_INCREMENT PRIMARY KEY,id_ditta INT NOT NULL,telefono VARCHAR(13) NOT NULL,FOREIGN KEY(id_ditta) REFERENCES ditte(id)) ENGINE=InnoDB;'
        rules = [dict(table='telefoni', columns=['id_ditta'], min=1, max=3)]
        def fake_ollama(path, payload=None, timeout=5):
            if path == 'tags':
                return dict(models=[dict(name=server.DEFAULT_MODEL)])
            context = json.loads(payload['messages'][1]['content']); count = context['count']
            values = [dict(nome=f'Ditta {i}') for i in range(count)] if context['table'] == 'ditte' else [dict(telefono=f'33300000{i}') for i in range(count)]
            return dict(message=dict(content=json.dumps(dict(rows=values))))
        try:
            server.prepare(config, script)
            with patch.object(server, 'ollama', fake_ollama):
                draft = server.generate(config, '*', dict(ditte=5, telefoni=8), 'Dati farmacia', server.DEFAULT_MODEL, distributions=rules)
            with server.connect(config) as conn, conn.cursor() as cur:
                cur.execute('SELECT COUNT(*) FROM ditte'); self.assertEqual(cur.fetchone()[0], 0, 'Generation must leave no rows')
            self.assertEqual(server.insert(config, draft), dict(inserted=13))
            with server.connect(config) as conn, conn.cursor() as cur:
                cur.execute('SELECT id_ditta,COUNT(*) FROM telefoni GROUP BY id_ditta ORDER BY id_ditta')
                self.assertEqual(cur.fetchall(), ((1, 2), (2, 2), (3, 2), (4, 1), (5, 1)))
            with patch.object(server, 'ollama', fake_ollama):
                extra = server.generate(config, 'telefoni', dict(telefoni=2), 'Altri telefoni', server.DEFAULT_MODEL, distributions=rules)
            self.assertEqual([r['id_ditta'] for r in extra['tables'][0]['rows']], [4, 5])
            bad = server.plain(extra)
            for row in bad['tables'][0]['rows']:
                row['id_ditta'] = 1
            with self.assertRaisesRegex(ValueError, 'ha 4 collegamenti'):
                server.insert(config, bad)
            with server.connect(config) as conn, conn.cursor() as cur:
                cur.execute('SELECT COUNT(*) FROM telefoni'); self.assertEqual(cur.fetchone()[0], 8, 'Edited distribution must roll back the whole batch')
            self.assertEqual(server.insert(config, extra), dict(inserted=2))
            with server.connect(config) as conn, conn.cursor() as cur:
                cur.execute('SELECT COUNT(*) FROM telefoni GROUP BY id_ditta ORDER BY id_ditta')
                self.assertEqual(cur.fetchall(), ((2,),) * 5)
            with patch.object(server, 'ollama', fake_ollama):
                with self.assertRaisesRegex(ValueError, 'hai scelto 0.*almeno 1'):
                    server.generate(config, 'ditte', dict(ditte=1), 'Ditta senza telefono', server.DEFAULT_MODEL, distributions=rules)
        finally:
            with server.connect(config, False) as conn, conn.cursor() as cur:
                cur.execute('DROP DATABASE IF EXISTS ' + server.quote(database)); conn.commit()

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
            self.assertEqual([s['phase'] for s in result['steps']], ['from', 'join', 'where', 'select', 'order'])
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
