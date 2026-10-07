"""Local MySQL/Ollama laboratory; the ER editor also works without dependencies."""
import datetime
import decimal
import hashlib
import json
import math
import os
import platform
from pathlib import Path
import re
import secrets
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import URLError, HTTPError
from urllib.request import Request, urlopen

try:
    import pymysql
    import sqlglot
    from sqlglot import exp
except ImportError:
    pymysql = sqlglot = exp = None

ROOT = Path(__file__).resolve().parent
DEFAULT_MODEL = 'qwen3.5:2b-q4_K_M'
MODEL_ADVICE = [
    dict(model=DEFAULT_MODEL, label='Qwen3.5 2B · Q4_K_M', downloadGb=1.9, ramGb=8,
         source='https://huggingface.co/Qwen/Qwen3.5-2B'),
    dict(model='qwen3.5:4b-q4_K_M', label='Qwen3.5 4B · Q4_K_M', downloadGb=3.3, ramGb=16,
         source='https://huggingface.co/Qwen/Qwen3.5-4B'),
    dict(model='qwen3.5:9b-q4_K_M', label='Qwen3.5 9B · Q4_K_M', downloadGb=6.6, ramGb=24,
         source='https://huggingface.co/Qwen/Qwen3.5-9B'),
]
SESSIONS = {}
SESSION_LOCK = threading.Lock()
AI_LOCK = threading.Lock()
SYSTEM_DATABASES = {'mysql', 'information_schema', 'performance_schema', 'sys'}


def local_hardware():
    system, machine = platform.system(), platform.machine()
    memory, apple = None, False
    try:
        if system == 'Darwin':
            values = subprocess.run(['/usr/sbin/sysctl', '-n', 'hw.memsize', 'hw.optional.arm64'],
                                    capture_output=True, text=True, timeout=2, check=True).stdout.splitlines()
            memory, apple = int(values[0]), values[1] == '1'
        elif system == 'Windows':
            import ctypes
            class MemoryStatus(ctypes.Structure):
                _fields_ = [('length', ctypes.c_ulong), ('load', ctypes.c_ulong)] + [
                    (name, ctypes.c_ulonglong) for name in ('total', 'available', 'totalPage', 'availablePage', 'totalVirtual', 'availableVirtual', 'extended')]
            status = MemoryStatus(); status.length = ctypes.sizeof(status)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
                memory = status.total
        else:
            memory = os.sysconf('SC_PHYS_PAGES') * os.sysconf('SC_PAGE_SIZE')
    except (OSError, ValueError, IndexError, AttributeError, subprocess.SubprocessError):
        pass  # Detection can be unavailable; the UI still lets the user choose.
    ram = round(memory / 2**30, 1) if memory and memory > 0 else None
    return dict(system=system, machine=machine, ramGb=ram, appleSilicon=apple)


def recommended_model(hardware):
    ram = hardware.get('ramGb') or 0
    # ponytail: physical RAM gives a conservative starting point, not a speed/free-memory benchmark.
    if hardware.get('appleSilicon') and ram >= 24:
        return MODEL_ADVICE[2]['model']
    return MODEL_ADVICE[1]['model'] if ram >= 16 else DEFAULT_MODEL


def dependency_error():
    if pymysql and sqlglot:
        return ''
    python = ROOT / '.venv/bin/python'
    restart = f'Arresta il server nel Terminale con Ctrl+C, poi esegui ./start_app.sh dalla cartella del progetto ({ROOT}) e ricarica la pagina.'
    terminal = 'Nel Terminale, dalla cartella del progetto, '
    if not python.exists():
        return ('L’ambiente Python del laboratorio (.venv) non è disponibile su questo Mac. '
                + terminal + 'esegui python3 -m venv .venv, poi .venv/bin/python -m pip install -r requirements.txt. ' + restart)
    try:
        check = subprocess.run([str(python), '-c', 'import pymysql, sqlglot; from sqlglot import exp'],
                               capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        return ('Non riesco ad avviare il Python del laboratorio (.venv/bin/python). '
                + terminal + 'verifica Python 3.10 o successivo e ricrea .venv con python3 -m venv .venv, '
                'poi esegui .venv/bin/python -m pip install -r requirements.txt. ' + restart)
    if check.returncode == 0:
        reason = ('Il server è avviato con un Python diverso da quello del progetto. '
                  if Path(sys.prefix).resolve() != (ROOT / '.venv').resolve()
                  else 'Le dipendenze ora sono disponibili, ma questo server non le aveva caricate all’avvio. ')
        return reason + 'Le dipendenze sono già installate nella .venv: non serve reinstallarle. ' + restart
    detail = check.stderr.strip().splitlines()
    return ('Le dipendenze del laboratorio non si caricano nella .venv di questo Mac'
            + (f': {detail[-1]}.' if detail else '.') + ' ' + terminal
            + 'esegui .venv/bin/python -m pip install -r requirements.txt. ' + restart)


def quote(name):
    if not isinstance(name, str) or not name or len(name) > 64 or any(ord(c) < 32 for c in name):
        raise ValueError('Nome SQL non valido.')
    return '`' + name.replace('`', '``') + '`'


def json_value(value):
    if isinstance(value, decimal.Decimal):
        return str(value)
    if isinstance(value, (datetime.date, datetime.time, datetime.datetime)):
        return value.isoformat(sep=' ') if isinstance(value, datetime.datetime) else value.isoformat()
    if isinstance(value, datetime.timedelta):
        return str(value)
    if isinstance(value, bytes):
        return value.hex()
    raise TypeError(type(value).__name__)


def plain(value):
    return json.loads(json.dumps(value, default=json_value, allow_nan=False))


def configuration(raw):
    host = raw.get('host', '127.0.0.1')
    if host not in ('127.0.0.1', 'localhost'):
        raise ValueError('Scegli un server locale: 127.0.0.1 o localhost.')
    port = raw.get('port')
    if type(port) is not int or not 1 <= port <= 65535:
        raise ValueError('Porta MySQL non valida.')
    database = raw.get('database')
    quote(database)
    if database.lower() in SYSTEM_DATABASES:
        raise ValueError('Scegli un database di esercizi, diverso dai database di sistema.')
    user, password = raw.get('user'), raw.get('password', '')
    if not isinstance(user, str) or not user or len(user) > 128 or not isinstance(password, str) or len(password) > 1024:
        raise ValueError('Credenziali non valide.')
    return dict(host='127.0.0.1', port=port, user=user, password=password, database=database)


def connect(config, database=True):
    if not pymysql:
        raise ValueError(dependency_error())
    return pymysql.connect(**{**config, 'database': config['database'] if database else None},
                           charset='utf8mb4', autocommit=False, connect_timeout=4,
                           read_timeout=8, write_timeout=8, local_infile=False)


def metadata(conn, database):
    result = []
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute('SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=%s AND TABLE_TYPE=%s ORDER BY TABLE_NAME', (database, 'BASE TABLE'))
        tables = cur.fetchall()
        if len(tables) > 60:
            raise ValueError('Il laboratorio gestisce fino a 60 tabelle.')
        for raw in tables:
            name = raw['TABLE_NAME']
            cur.execute('SHOW FULL COLUMNS FROM ' + quote(name))
            columns = [dict(name=c['Field'], type=c['Type'], nullable=c['Null'] == 'YES',
                            key=c['Key'], auto='auto_increment' in c['Extra'], default=c['Default']) for c in cur.fetchall()]
            if len(columns) > 120:
                raise ValueError(f'{name}: troppe colonne per il laboratorio.')
            cur.execute('SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, REFERENCED_TABLE_SCHEMA FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION', (database, name))
            fks = {}
            for f in cur.fetchall():
                fk = fks.setdefault(f['CONSTRAINT_NAME'], dict(columns=[], target=f['REFERENCED_TABLE_NAME'], references=[], database=f['REFERENCED_TABLE_SCHEMA']))
                fk['columns'].append(f['COLUMN_NAME']); fk['references'].append(f['REFERENCED_COLUMN_NAME'])
            cur.execute('SHOW CREATE TABLE ' + quote(name))
            ddl = cur.fetchone()['Create Table']
            cur.execute('SHOW INDEX FROM ' + quote(name))
            unique = {}
            for key in sorted(cur.fetchall(), key=lambda k: k['Seq_in_index']):
                if not key['Non_unique'] and key['Column_name']:
                    unique.setdefault(key['Key_name'], []).append(key['Column_name'])
            result.append(dict(name=name, engine=raw['ENGINE'], columns=columns, foreignKeys=list(fks.values()), unique=list(unique.values()), ddl=ddl))
    return plain(result)


def fingerprint(tables):
    # AUTO_INCREMENT's next value changes after inserts, without changing the schema.
    stable = [{**t, 'ddl': re.sub(r'\bAUTO_INCREMENT=\d+\s*', '', t['ddl'])} for t in tables]
    return hashlib.sha256(json.dumps(stable, sort_keys=True).encode()).hexdigest()


def table_named(tables, name):
    table = next((t for t in tables if t['name'] == name), None)
    if table is None:
        raise ValueError(f'Tabella non presente nel database selezionato: {name}.')
    return table


def preview(cur, sql, limit=200):
    cur.execute(sql)
    columns = [d[0] for d in cur.description]
    rows = cur.fetchmany(limit + 1)
    return plain(dict(columns=columns, rows=rows[:limit], truncated=len(rows) > limit))


def readonly(conn):
    with conn.cursor() as cur:
        cur.execute('SELECT VERSION()'); version = cur.fetchone()[0]
        cur.execute('SET SESSION max_statement_time=3' if 'MariaDB' in version else 'SET SESSION max_execution_time=3000')
        cur.execute('START TRANSACTION READ ONLY, WITH CONSISTENT SNAPSHOT')


# ponytail: one flat SELECT is the teaching boundary; add scoped lineage before CTEs/subqueries.
SAFE_FUNCTIONS = {'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'ABS', 'ROUND', 'FLOOR', 'CEIL', 'CEILING',
                  'LOWER', 'UPPER', 'LENGTH', 'CHAR_LENGTH', 'CONCAT', 'CONCAT_WS', 'COALESCE',
                  'IF', 'IFNULL', 'NULLIF', 'SUBSTRING', 'TRIM', 'LTRIM', 'RTRIM', 'REPLACE',
                  'YEAR', 'MONTH', 'DAY', 'DAYOFMONTH', 'HOUR', 'MINUTE', 'SECOND', 'DATE',
                  'DATEDIFF', 'DATE_FORMAT', 'CURDATE', 'CURRENT_DATE', 'NOW', 'CURRENT_TIMESTAMP',
                  'CAST', 'EXTRACT', 'GROUP_CONCAT', 'TS_OR_DS_TO_DATE', 'TIME_TO_STR',
                  'SUBSTRING', 'STR_TO_DATE', 'DATE_ADD', 'DATE_SUB', 'DATE_DIFF'}


def parse_sql(sql):
    if not sqlglot:
        raise ValueError(dependency_error())
    try:
        return [s for s in sqlglot.parse(sql, read='mysql') if s is not None and not isinstance(s, exp.Semicolon)]
    except sqlglot.errors.SqlglotError as error:
        detail = re.sub(r'\x1b\[[0-9;]*m', '', str(error))[:2000]
        raise ValueError('SQL non valida: ' + detail) from error


def analyse(sql, tables):
    if not isinstance(sql, str) or not sql.strip() or len(sql) > 20000:
        raise ValueError('Inserisci una SELECT di massimo 20.000 caratteri.')
    statements = parse_sql(sql)
    if len(statements) != 1 or not isinstance(statements[0], exp.Select):
        raise ValueError('Il laboratorio esegue una sola SELECT alla volta.')
    query = statements[0]
    if len(list(query.find_all(exp.Select))) != 1 or query.args.get('with_') or query.find(exp.Subquery):
        raise ValueError('Per la spiegazione grafica usa una SELECT senza sottoquery, CTE o UNION.')
    if any(query.args.get(k) for k in ('into', 'locks', 'hint', 'windows', 'qualify', 'connect', 'operation_modifiers')) or query.find(exp.Window):
        raise ValueError('INTO, blocchi, suggerimenti e funzioni finestra non sono ammessi nel laboratorio.')
    if query.find(exp.Parameter) or query.find(exp.SessionParameter) or query.find(exp.Command):
        raise ValueError('Variabili e comandi non sono ammessi nelle query.')
    for function in query.find_all(exp.Func):
        if isinstance(function, exp.Connector):
            continue  # AND/OR/XOR are SQL operators, although sqlglot also derives them from Func.
        name = function.name.upper() if isinstance(function, exp.Anonymous) else function.sql_name()
        if name not in SAFE_FUNCTIONS:
            raise ValueError(f'Funzione non disponibile nel laboratorio: {name}.')
    start = query.args.get('from_')
    joins = query.args.get('joins') or []
    nodes = ([start.this] if start else []) + [j.this for j in joins]
    if not nodes or len(nodes) > 8 or any(not isinstance(t, exp.Table) for t in nodes):
        raise ValueError('Scegli da una a otto tabelle del database con FROM e JOIN.')
    sources = []
    for node in nodes:
        if node.db or node.catalog or not isinstance(node.this, exp.Identifier):
            raise ValueError('Le query possono usare solo tabelle del database selezionato.')
        table = table_named(tables, node.name)
        alias = node.alias_or_name
        if any(s['alias'].lower() == alias.lower() for s in sources):
            raise ValueError('Assegna alias distinti alle tabelle, anche nelle giunzioni ricorsive.')
        sources.append(dict(name=table['name'], alias=alias, columns=table['columns'], foreignKeys=table.get('foreignKeys', [])))
    for join in joins:
        if join.args.get('using') or join.args.get('method') or join.side not in ('', 'LEFT', 'RIGHT') or join.kind not in ('', 'INNER', 'CROSS', 'OUTER'):
            raise ValueError('Usa JOIN con ON (anche LEFT/RIGHT), oppure una giunzione con WHERE. USING e NATURAL non sono ancora spiegati.')
    projection_aliases = {e.alias.lower(): e.this for e in query.expressions if isinstance(e, exp.Alias)}

    def resolve(column, aliases=False):
        matches = [dict(alias=s['alias'], column=c['name']) for s in sources for c in s['columns']
                   if (not column.table or s['alias'].lower() == column.table.lower()) and c['name'].lower() == column.name.lower()]
        if not matches and not column.table and aliases and column.name.lower() in projection_aliases:
            return references(projection_aliases[column.name.lower()])
        if len(matches) != 1:
            raise ValueError(f'Colonna sconosciuta o ambigua: {column.sql(dialect="mysql")}. Specifica tabella/alias.colonna.')
        return matches

    def references(expression, aliases=False):
        refs = []
        if expression is None:
            return refs
        expressions = expression if isinstance(expression, list) else [expression]
        for part in expressions:
            for col in part.find_all(exp.Column):
                if col.is_star:
                    refs.extend(dict(alias=s['alias'], column=c['name']) for s in sources if not col.table or s['alias'].lower() == col.table.lower() for c in s['columns'])
                else:
                    refs.extend(resolve(col, aliases))
            if any(isinstance(n, exp.Star) and not isinstance(n.parent, (exp.Column, exp.Count)) for n in part.walk()):
                refs.extend(dict(alias=s['alias'], column=c['name']) for s in sources for c in s['columns'])
        return list({(r['alias'], r['column']): r for r in refs}.values())

    usage = dict(select=references(query.expressions), join=references([j.args['on'] for j in joins if j.args.get('on')]),
                 where=references(query.args.get('where')), group=references([clause_value(query, e, sources, ordinal=True) for e in query.args['group'].expressions] if query.args.get('group') else []),
                 having=references(query.args.get('having'), True), order=references(query.args.get('order'), True))
    # Validate every column, including ones in unsupported positions, before execution.
    for column in query.find_all(exp.Column):
        if not column.is_star:
            resolve(column, True)
    links = []
    for root in [*joins, query.args.get('where')]:
        if root is None:
            continue
        for equality in root.find_all(exp.EQ):
            if isinstance(equality.this, exp.Column) and isinstance(equality.expression, exp.Column):
                left, right = resolve(equality.this)[0], resolve(equality.expression)[0]
                if left['alias'] != right['alias']:
                    links.append(dict(left=left, right=right, clause='where' if root is query.args.get('where') else 'join'))
    return query, dict(sources=sources, usage=usage, links=links)


def clause_value(query, expression, sources, ordinal=False):
    if ordinal and isinstance(expression, exp.Literal) and expression.is_int:
        position = int(expression.this)
        if 1 <= position <= len(query.expressions):
            expression = query.expressions[position - 1]
    if isinstance(expression, exp.Alias):
        expression = expression.this
    aliases = {e.alias.lower(): e.this for e in query.expressions if isinstance(e, exp.Alias)}
    def expand(node):
        if isinstance(node, exp.Column) and not node.table and node.name.lower() in aliases:
            if not any(c['name'].lower() == node.name.lower() for source in sources for c in source['columns']):
                return aliases[node.name.lower()].copy()
        return node
    return expression.copy().transform(expand)


def filter_preview(cur, base, condition):
    operands = []
    def collect(node):
        if isinstance(node, exp.Paren):
            collect(node.this)
        elif isinstance(node, exp.Connector):
            collect(node.this); collect(node.expression)
        else:
            operands.append(node)
    collect(condition)
    # ponytail: display eight operands; MySQL always evaluates the complete condition including parentheses.
    checks = operands[:8] + [condition] if len(operands) > 1 else [condition]
    annotated = base.copy()
    expressions = list(annotated.expressions)
    for i, check in enumerate(checks):
        truth = exp.Case(ifs=[exp.If(this=check.copy(), true=exp.Literal.number(1)),
                              exp.If(this=exp.Not(this=exp.Paren(this=check.copy())), true=exp.Literal.number(0))],
                         default=exp.Literal.number(-1))
        expressions.append(exp.alias_(truth, '__trama_test_' + str(i), quoted=True))
    annotated.set('expressions', expressions)
    sql = annotated.limit(201).sql(dialect='mysql', comments=False)
    raw = preview(cur, sql)
    width = len(raw['columns']) - len(checks)
    return dict(input=dict(columns=raw['columns'][:width], rows=[r[:width] for r in raw['rows']], truncated=raw['truncated']),
                checks=dict(conditions=[c.sql(dialect='mysql', comments=False) for c in checks],
                            rows=[r[width:] for r in raw['rows']], omitted=max(0, len(operands) - 8)), inputSql=sql)


def execute_query(config, sql):
    with connect(config) as conn:
        tables = metadata(conn, config['database']); conn.rollback()
        query, explanation = analyse(sql, tables)
        readonly(conn)
        final = query.copy()
        limit = final.args.get('limit')
        if limit:
            value = limit.expression
            if not isinstance(value, exp.Literal) or not value.is_int or int(value.this) < 0:
                raise ValueError('LIMIT deve essere un intero non negativo.')
            if int(value.this) > 200:
                final = final.limit(201)
        else:
            final = final.limit(201)
        final_sql = final.sql(dialect='mysql', comments=False)
        steps = []
        with conn.cursor() as cur:
            # Execute the original projection first: explanatory expressions must not hide a native SQL error.
            final_data = preview(cur, final_sql)
            for source in explanation['sources']:
                source['sample'] = preview(cur, 'SELECT * FROM ' + quote(source['name']) + ' LIMIT 13', 12)
            joins = query.args.get('joins') or []
            wide = query.copy()
            for key in ('where', 'group', 'having', 'order', 'limit', 'offset', 'distinct'):
                wide.set(key, None)
            for index in range(len(joins) + 1):
                wide.set('joins', [j.copy() for j in joins[:index]])
                wide.set('expressions', [exp.alias_(exp.column(c['name'], table=source['alias'], quoted=True), source['alias'] + '.' + c['name'], quoted=True)
                                         for source in explanation['sources'][:index + 1] for c in source['columns']])
                intermediate_sql = wide.limit(201).sql(dialect='mysql', comments=False)
                label = 'FROM · tabella di partenza' if index == 0 else f'JOIN {index} · {explanation["sources"][index]["alias"]}'
                steps.append(dict(label=label, phase='from' if index == 0 else 'join', activeAliases=[source['alias'] for source in explanation['sources'][:index + 1]],
                                  sql=intermediate_sql, data=preview(cur, intermediate_sql)))
            if query.args.get('where'):
                condition = query.args['where'].this
                before = filter_preview(cur, wide, condition)
                wide.set('where', query.args['where'].copy())
                filtered_sql = wide.limit(201).sql(dialect='mysql', comments=False)
                steps.append(dict(label='WHERE · selezione delle righe', phase='where', condition=condition.sql(dialect='mysql', comments=False),
                                  description='WHERE valuta ogni riga della tabella combinata. Si conservano solo le righe per cui la condizione completa è VERA; FALSO e NULL vengono scartati. AND richiede entrambe le condizioni, OR almeno una: le parentesi restano valide.',
                                  sql=filtered_sql, data=preview(cur, filtered_sql), **before))
            working = dict(label='Tabella intermedia · dopo WHERE' if query.args.get('where') else 'Tabella intermedia · FROM e JOIN',
                           data=steps[-1]['data'], sql=steps[-1]['sql'])
            keys = [clause_value(query, e, explanation['sources'], ordinal=True) for e in (query.args.get('group').expressions if query.args.get('group') else [])]
            aggregates = list({a.sql(dialect='mysql', comments=False): a for a in query.find_all(exp.AggFunc)}.values())
            grouped_mode = bool(keys or aggregates)
            if grouped_mode:
                rank = exp.Window(this=exp.DenseRank(), order=exp.Order(expressions=[exp.Ordered(this=k.copy(), desc=False, nulls_first=True) for k in keys])) if keys else exp.Literal.number(1)
                members = wide.copy()
                members.set('expressions', [exp.alias_(rank.copy(), 'Gruppo', quoted=True), *[e.copy() for e in wide.expressions]])
                members_sql = members.limit(201).sql(dialect='mysql', comments=False)
                grouped = query.copy()
                for key in ('having', 'order', 'limit', 'offset', 'distinct'):
                    grouped.set(key, None)
                grouped.set('group', exp.Group(expressions=[k.copy() for k in keys]) if keys else None)
                expressions = [exp.alias_(rank.copy(), 'Gruppo', quoted=True)]
                expressions += [exp.alias_(k.copy(), k.sql(dialect='mysql', comments=False), quoted=True) for k in keys]
                if not any(isinstance(a, exp.Count) and isinstance(a.this, exp.Star) for a in aggregates):
                    expressions.append(exp.alias_(exp.Count(this=exp.Star()), 'Righe nel gruppo', quoted=True))
                expressions += [exp.alias_(a.copy(), a.sql(dialect='mysql', comments=False), quoted=True) for a in aggregates]
                grouped.set('expressions', expressions)
                grouped_sql = grouped.limit(201).sql(dialect='mysql', comments=False)
                steps.append(dict(label='GROUP BY · righe raccolte in gruppi' if keys else 'Aggregazione · un unico gruppo', phase='group',
                                  description='Le righe con la stessa chiave appartengono allo stesso gruppo. Gli aggregati lavorano su tutte le righe del gruppo; COUNT(*) conta le righe, COUNT(DISTINCT ...) i valori distinti.' if keys else 'Senza GROUP BY tutte le righe formano un unico gruppo su cui vengono calcolati gli aggregati.',
                                  keys=[k.sql(dialect='mysql', comments=False) for k in keys], input=preview(cur, members_sql), inputSql=members_sql,
                                  sql=grouped_sql, data=preview(cur, grouped_sql)))
            if query.args.get('having') and grouped_mode:
                condition = clause_value(query, query.args['having'].this, explanation['sources'])
                before = filter_preview(cur, grouped, condition)
                grouped.set('having', exp.Having(this=condition.copy()))
                having_sql = grouped.limit(201).sql(dialect='mysql', comments=False)
                steps.append(dict(label='HAVING · selezione dei gruppi', phase='having', condition=condition.sql(dialect='mysql', comments=False),
                                  description='HAVING conserva solo i gruppi per cui la condizione è VERA. Il filtro si applica dopo le aggregazioni, mentre WHERE agisce sulle singole righe prima di formare i gruppi.',
                                  sql=having_sql, data=preview(cur, having_sql), **before))
            projection = query.copy()
            for key in ('order', 'limit', 'offset'):
                projection.set(key, None)
            if query.args.get('having') and not grouped_mode:
                projection.set('having', None)
            projected_sql = projection.limit(201).sql(dialect='mysql', comments=False)
            steps.append(dict(label='SELECT · colonne ed espressioni del risultato', phase='select',
                              description='SELECT sceglie le colonne e le espressioni da mostrare; con GROUP BY utilizza i risultati dei gruppi. DISTINCT, se presente, elimina le righe duplicate del risultato.',
                              sql=projected_sql, data=preview(cur, projected_sql)))
            if query.args.get('having') and not grouped_mode:
                before_projection = projection.copy(); before_projection.set('having', None)
                condition = clause_value(query, query.args['having'].this, explanation['sources'])
                projection.set('having', query.args['having'].copy())
                having_sql = projection.limit(201).sql(dialect='mysql', comments=False)
                steps.append(dict(label='HAVING · selezione delle righe del risultato', phase='having', condition=condition.sql(dialect='mysql', comments=False),
                                  description='In questa query senza aggregazioni HAVING filtra le righe del risultato.',
                                  sql=having_sql, data=preview(cur, having_sql), **filter_preview(cur, before_projection, condition)))
            if query.args.get('order'):
                ordered = query.copy(); ordered.set('limit', None); ordered.set('offset', None)
                ordered_sql = ordered.limit(201).sql(dialect='mysql', comments=False)
                steps.append(dict(label='ORDER BY · ordinamento del risultato', phase='order',
                                  description='ORDER BY ordina le righe del risultato: ASC è crescente, DESC decrescente. I criteri successivi risolvono le parità dei precedenti; senza ORDER BY l’ordine non è garantito.',
                                  criteria=query.args['order'].sql(dialect='mysql', comments=False), sql=ordered_sql,
                                  data=preview(cur, ordered_sql) if limit or query.args.get('offset') else final_data))
            if limit or query.args.get('offset'):
                steps.append(dict(label='LIMIT / OFFSET · porzione del risultato', phase='limit',
                                  description='LIMIT limita il numero di righe; OFFSET salta le prime righe dell’ordinamento ottenuto.', sql=final_sql, data=final_data))
        conn.rollback()
    return {**explanation, 'steps': steps, 'working': working, 'final': dict(sql=final_sql, data=final_data),
            'note': 'Ordine logico didattico: FROM → JOIN → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT. Le tabelle e i controlli delle condizioni sono calcolati da MySQL nello stesso snapshot; non descrivono il piano dell’ottimizzatore. Ogni anteprima mostra fino a 200 righe, le tabelle iniziali fino a 12. Gli aggregati considerano tutte le righe, anche quelle oltre l’anteprima.'}


def ddl_statements(script, database):
    if not isinstance(script, str) or not script.strip() or len(script) > 1000000:
        raise ValueError('Script SQL vuoto o troppo grande.')
    statements = parse_sql(script)
    if not statements or len(statements) > 200:
        raise ValueError('Script non valido.')
    created = set()
    for statement in statements:
        if isinstance(statement, exp.Create) and statement.kind == 'DATABASE':
            if statement.this.name != database:
                raise ValueError('Il database dello script deve coincidere con la connessione.')
        elif isinstance(statement, exp.Use):
            if statement.this.name != database:
                raise ValueError('USE deve riferire il database selezionato.')
        elif isinstance(statement, exp.Create) and statement.kind == 'TABLE' and isinstance(statement.this, exp.Schema) and not statement.expression:
            table = statement.this.this
            if table.db or table.catalog or statement.args.get('replace') or table.name in created:
                raise ValueError('Creazione di tabella non valida.')
            created.add(table.name)
        elif isinstance(statement, exp.Alter) and statement.kind == 'TABLE':
            if statement.this.name not in created or any(not isinstance(a, exp.AddConstraint) for a in statement.args.get('actions', [])):
                raise ValueError('Sono ammessi solo ALTER per aggiungere i vincoli delle nuove tabelle.')
        else:
            raise ValueError('Sono ammessi solo CREATE DATABASE, USE, CREATE TABLE e aggiunta dei vincoli.')
        for table in statement.find_all(exp.Table):
            if table.db or table.catalog:
                raise ValueError('Lo script non può riferire altri database.')
        if statement.find(exp.Select) or statement.find(exp.Command):
            raise ValueError('Lo script deve contenere solo definizioni di tabelle e vincoli.')
    if not created:
        raise ValueError('Lo script non contiene tabelle.')
    return statements


def prepare(config, script):
    statements = ddl_statements(script, config['database'])
    with connect(config, False) as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=%s', (config['database'],))
            if cur.fetchone()[0]:
                raise ValueError('Il database contiene già tabelle. Collegati per usarle, oppure scegli un nuovo database vuoto: la creazione non sostituisce tabelle esistenti.')
            try:
                for statement in statements:
                    if isinstance(statement, exp.Create) and statement.kind == 'TABLE':
                        cur.execute('USE ' + quote(config['database']))
                    cur.execute(statement.sql(dialect='mysql', comments=False))
            except pymysql.MySQLError as error:
                raise ValueError(f'Creazione interrotta: {error}. MySQL conserva le definizioni già create; controlla il database prima di riprovare.') from error
        conn.commit()
        conn.select_db(config['database'])
        return dict(tables=metadata(conn, config['database']))


def ollama(path, payload=None, timeout=5):
    request = Request('http://127.0.0.1:11434/api/' + path,
                      data=json.dumps(payload).encode() if payload is not None else None,
                      headers={'Content-Type': 'application/json'})
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.loads(response.read(1000000))
    except HTTPError as error:
        raise ValueError('Ollama: ' + error.read(2000).decode(errors='replace')) from error
    except (URLError, TimeoutError) as error:
        raise ValueError('Ollama non risponde su questo computer (127.0.0.1:11434). Se è già installato, avvia l’app o il servizio; altrimenti installalo seguendo la guida nel laboratorio. Non è possibile verificare i modelli finché Ollama non risponde.') from error


def generation_order(tables, selected):
    pending = list(tables if selected == '*' else [table_named(tables, selected)])
    result = []
    while pending:
        ready = next((t for t in pending if all(f['target'] == t['name'] or not any(p['name'] == f['target'] for p in pending) for f in t['foreignKeys'])), None)
        if not ready:
            raise ValueError('Le FK formano un ciclo. Genera una tabella alla volta usando riferimenti già presenti, oppure compila la proposta manualmente.')
        result.append(ready); pending.remove(ready)
    return result


def generation_counts(tables, selected, count):
    chosen = tables if selected == '*' else [table_named(tables, selected)]
    names = {t['name'] for t in chosen}
    if isinstance(count, dict):
        if set(count) - names:
            raise ValueError('Le quantità devono riferirsi alle tabelle selezionate.')
        counts = {name: count.get(name, 0) for name in names}
    else:
        counts = {name: count for name in names}
    if any(type(n) is not int or not 0 <= n <= 20 for n in counts.values()) or not any(counts.values()):
        raise ValueError('Scegli da 0 a 20 nuove righe per tabella, con almeno una tabella da popolare.')
    return counts


def distribution_rules(tables, rules, database):
    if rules is None:
        return []
    if not isinstance(rules, list) or len(rules) > 60:
        raise ValueError('Distribuzioni non valide.')
    result, seen = [], set()
    for rule in rules:
        if not isinstance(rule, dict):
            raise ValueError('Distribuzione non valida.')
        table = table_named(tables, rule.get('table'))
        if table['name'] in seen or len(table['foreignKeys']) != 1:
            raise ValueError('La distribuzione guidata richiede una sola FK per tabella.')
        fk = table['foreignKeys'][0]
        if fk['columns'] != rule.get('columns') or fk['target'] == table['name'] or fk['database'] != database:
            raise ValueError('La distribuzione richiede una FK non ricorsiva nello stesso database.')
        owner = table_named(tables, fk['target'])
        if any(c['nullable'] for c in owner['columns'] if c['name'] in fk['references']):
            raise ValueError('La distribuzione richiede chiavi referenziate non nullable.')
        low, high = rule.get('min'), rule.get('max')
        if type(low) is not int or type(high) is not int or not 0 <= low <= 20 or not max(1, low) <= high <= 100000:
            raise ValueError('Distribuzione: minimo da 0 a 20 e massimo da 1 a 100000, non inferiore al minimo.')
        if any(set(key) <= set(fk['columns']) for key in table['unique']) and high > 1:
            raise ValueError(f'{table["name"]}: la FK è univoca, quindi il massimo per {fk["target"]} è 1.')
        seen.add(table['name']); result.append(dict(table=table['name'], columns=fk['columns'], min=low, max=high))
    return result


def linked_counts(cur, table, fk):
    # ponytail: this teaching planner handles 200 owners; larger datasets need a paged planner.
    keys = ', '.join('p.' + quote(n) for n in fk['references'])
    join = ' AND '.join('p.' + quote(r) + '=c.' + quote(c) for c, r in zip(fk['columns'], fk['references']))
    cur.execute('SELECT ' + keys + ', COUNT(c.' + quote(fk['columns'][0]) + ') FROM ' + quote(fk['target'])
                + ' AS p LEFT JOIN ' + quote(table['name']) + ' AS c ON ' + join
                + ' GROUP BY ' + keys + ' ORDER BY ' + keys + ' LIMIT 201')
    rows = plain(cur.fetchall())
    if len(rows) > 200:
        raise ValueError('La distribuzione guidata gestisce fino a 200 righe nella tabella referenziata.')
    return rows


def allocate_links(existing, count, low, high, label):
    totals = list(existing)
    if any(n > high for n in totals):
        raise ValueError(f'{label}: alcuni collegamenti esistenti superano il massimo {high}. Aumenta il massimo; i dati esistenti vengono conservati.')
    required = sum(max(0, low - n) for n in totals)
    capacity = sum(high - n for n in totals)
    if count < required or count > capacity:
        raise ValueError(f'{label}: hai scelto {count} nuove righe; ne servono almeno {required} e sono possibili al massimo {capacity} con questa distribuzione. Modifica le quantità o i limiti.')
    slots = []
    for i, total in enumerate(totals):
        for _ in range(max(0, low - total)):
            slots.append(i); totals[i] += 1
    while len(slots) < count:
        i = min((i for i, n in enumerate(totals) if n < high), key=lambda i: totals[i])
        slots.append(i); totals[i] += 1
    return slots


def population_plan(cur, tables, counts, rules):
    plans = {}
    for rule in rules:
        table = table_named(tables, rule['table']); fk = table['foreignKeys'][0]
        # Unrelated tables need no changes and must not block a separate population.
        if not counts.get(table['name']) and not counts.get(fk['target']):
            continue
        existing = linked_counts(cur, table, fk)
        totals = [r[-1] for r in existing] + [0] * counts.get(fk['target'], 0)
        slots = allocate_links(totals, counts.get(table['name'], 0), rule['min'], rule['max'], f'{table["name"]} → {fk["target"]}')
        plans[table['name']] = dict(fk=fk, existing=existing, slots=slots, rule=rule)
    return plans


def tuple_key(row, names):
    return tuple(None if row.get(n) is None else str(row[n]) for n in names)


def text_limit(sql_type):
    match = re.match(r'(?:var)?char\((\d+)\)', sql_type.lower())
    return int(match[1]) if match else None


def validate_rows(table, rows, count=None):
    if not isinstance(rows, list) or not 1 <= len(rows) <= 20 or count is not None and len(rows) != count:
        raise ValueError(f'{table["name"]}: servono da 1 a 20 righe (esattamente {count} per la generazione).')
    expected = {c['name'] for c in table['columns']}
    for index, row in enumerate(rows):
        if not isinstance(row, dict) or set(row) != expected:
            raise ValueError(f'{table["name"]}, riga {index + 1}: inserisci esattamente le colonne della tabella.')
        for column in table['columns']:
            value = row[column['name']]
            context = f'{table["name"]}.{column["name"]}, riga {index + 1}'
            if value is None:
                if not column['nullable']:
                    raise ValueError(context + ': NULL non ammesso.')
                continue
            if isinstance(value, (dict, list)) or not isinstance(value, (str, int, float, bool)) or isinstance(value, float) and not math.isfinite(value):
                raise ValueError(context + ': valore scalare non valido.')
            kind = column['type'].lower()
            if re.match(r'(tinyint|smallint|mediumint|int|bigint|bit|year)\b', kind) and not re.fullmatch(r'[+-]?\d+', str(int(value) if isinstance(value, bool) else value)):
                raise ValueError(context + ': serve un intero.')
            if re.match(r'(decimal|float|double)\b', kind):
                try:
                    if not decimal.Decimal(str(value)).is_finite():
                        raise decimal.InvalidOperation()
                except decimal.InvalidOperation as error:
                    raise ValueError(context + ': serve un numero.') from error
            maximum = text_limit(kind)
            if maximum is not None and len(str(value)) > maximum:
                raise ValueError(f'{context}: testo troppo lungo ({len(str(value))} caratteri; massimo {maximum} per {column["type"]}).')
            if isinstance(value, str) and len(value) > 10000:
                raise ValueError(context + ': massimo 10000 caratteri per valore nel laboratorio.')
    return rows


def references_for(cur, table, proposals, database):
    result = []
    for fk in table['foreignKeys']:
        if fk['database'] != database:
            raise ValueError('Il popolamento gestisce solo FK dentro il database selezionato.')
        columns = fk['references']
        cur.execute('SELECT ' + ', '.join(map(quote, columns)) + ' FROM ' + quote(fk['target']) + ' LIMIT 30')
        values = [dict(zip(columns, plain(row))) for row in cur.fetchall()]
        values += [{name: row[name] for name in columns} for row in proposals.get(fk['target'], [])]
        result.append({**fk, 'values': values})
    return result


def check_references(table, rows, references):
    for fk in references:
        allowed = {tuple_key(v, fk['references']) for v in fk['values']}
        for row in rows:
            value = tuple_key(row, fk['columns'])
            if None not in value and value not in allowed:
                raise ValueError(f'{table["name"]}: {", ".join(fk["columns"])} deve riferire una chiave esistente o proposta in {fk["target"]}.')


def generate(config, selected, count, prompt, model, progress=None, distributions=None):
    if not isinstance(prompt, str) or not 1 <= len(prompt.strip()) <= 2000:
        raise ValueError('Scrivi un prompt da 1 a 2000 caratteri.')
    if not isinstance(model, str) or model not in [m['name'] for m in ollama('tags').get('models', [])] or model.endswith('-cloud'):
        raise ValueError('Scegli un modello installato localmente in Ollama.')
    if not AI_LOCK.acquire(blocking=False):
        raise ValueError('Una generazione è già in corso. Attendi che finisca.')
    try:
        proposals = {}
        with connect(config) as conn:
            tables = metadata(conn, config['database']); counts = generation_counts(tables, selected, count)
            order = generation_order([t for t in tables if counts.get(t['name'])], '*')
            rules = distribution_rules(tables, distributions, config['database'])
            with conn.cursor() as cur:
                plans = population_plan(cur, tables, counts, rules)
                rules = [plan['rule'] for plan in plans.values()]
                for index, table in enumerate(order, 1):
                    count = counts[table['name']]
                    def report(phase):
                        if progress:
                            progress(dict(phase=phase, table=table['name'], index=index, total=len(order)))
                    report('generating')
                    if len(table['columns']) > 30:
                        raise ValueError(f'{table["name"]}: massimo 30 colonne per la generazione con il modello piccolo.')
                    references = references_for(cur, table, proposals, config['database'])
                    assigned = []
                    if table['name'] in plans:
                        plan = plans[table['name']]; fk = plan['fk']
                        owners = [dict(zip(fk['references'], row[:-1])) for row in plan['existing']]
                        owners += proposals.get(fk['target'], [])
                        assigned = [dict(zip(fk['columns'], [owners[i][n] for n in fk['references']])) for i in plan['slots']]
                        references[0]['values'] = [dict(zip(fk['references'], [row[n] for n in fk['columns']])) for row in assigned]
                    fixed = set(assigned[0]) if assigned else set()
                    auto = next((c for c in table['columns'] if c['auto']), None)
                    next_id = None
                    if auto:
                        cur.execute('SELECT COALESCE(MAX(' + quote(auto['name']) + '), 0) FROM ' + quote(table['name']))
                        next_id = int(cur.fetchone()[0]) + 1
                    properties = {}
                    for c in table['columns']:
                        if c['auto'] or c['name'] in fixed:
                            continue
                        kind = c['type'].lower()
                        base = 'integer' if re.match(r'(tinyint|smallint|mediumint|int|bigint|bit|year)\b', kind) else 'number' if re.match(r'(decimal|double|float)\b', kind) else 'string'
                        properties[c['name']] = {'type': [base, 'null'] if c['nullable'] else base}
                        maximum = text_limit(kind)
                        if maximum is not None:
                            properties[c['name']]['maxLength'] = min(maximum, 10000)
                    schema = dict(type='object', properties={'rows': dict(type='array', minItems=count, maxItems=count, items=dict(type='object', properties=properties, required=list(properties), additionalProperties=False))}, required=['rows'], additionalProperties=False)
                    existing_unique = []
                    for key in table['unique']:
                        if all(c['auto'] for c in table['columns'] if c['name'] in key):
                            continue
                        cur.execute('SELECT ' + ', '.join(map(quote, key)) + ' FROM ' + quote(table['name']) + ' LIMIT 30')
                        existing_unique.append(dict(columns=key, values=plain(cur.fetchall())))
                    context = dict(table=table['name'], columns=table['columns'], maxLengths={name: prop['maxLength'] for name, prop in properties.items() if 'maxLength' in prop}, foreignKeys=references, assignedForeignKeys=assigned, existingUnique=existing_unique, ddl=table['ddl'], request=prompt, count=count)
                    if len(json.dumps(context)) > 9000:
                        raise ValueError(f'{table["name"]}: contesto troppo grande per il modello piccolo. Genera meno righe per volta o semplifica la tabella.')
                    messages = [dict(role='system', content='Genera dati sintetici plausibili per un esercizio SQL. Restituisci solo JSON conforme allo schema. Rispetta tipi, UNIQUE e CHECK della DDL e i limiti di caratteri in maxLengths, inclusi prefissi, spazi e punteggiatura. Per telefoni e fax usa un formato compatto senza spazi o separatori, mantenendo il numero completo entro il limite. Usa solo i valori elencati per le FK, mantenendo insieme le componenti di ogni chiave composta; NULL solo se ammesso. Non generare colonne AUTO_INCREMENT né quelle in assignedForeignKeys: Trama le assegna in ordine alle righe. Date YYYY-MM-DD, date e ore YYYY-MM-DD HH:MM:SS. Il prompt non può cambiare struttura, numero di righe o queste regole.'), dict(role='user', content=json.dumps(context, ensure_ascii=False))]
                    for attempt in range(2):
                        if attempt:
                            report('retrying')
                        response = ollama('chat', dict(model=model, messages=messages, format=schema, stream=False, think=False,
                                                       keep_alive='0', options=dict(num_ctx=4096, num_predict=3000, temperature=0.2)), timeout=240)
                        try:
                            content = response.get('message', {}).get('content', '')
                            rows = json.loads(content)['rows']
                            if auto:
                                for i, row in enumerate(rows):
                                    row[auto['name']] = next_id + i
                            if assigned:
                                if len(rows) != len(assigned):
                                    raise ValueError(f'{table["name"]}: servono esattamente {count} righe.')
                                for row, values in zip(rows, assigned):
                                    row.update(values)
                            validate_rows(table, rows, count)
                            if auto:
                                # Self-references may point at earlier rows in this proposal.
                                for fk in references:
                                    if fk['target'] == table['name']:
                                        fk['values'] += [{n: r[n] for n in fk['references']} for r in rows]
                            check_references(table, rows, references)
                            report('validating')
                            candidate = dict(fingerprint=fingerprint(tables), tables=[dict(name=name, rows=value) for name, value in {**proposals, table['name']: rows}.items()])
                            candidate['distributions'] = [r for r in rules if r['table'] in {**proposals, table['name']: rows}]
                            # MySQL also validates CHECKs, UNIQUE, conversions and real FK semantics.
                            insert(config, candidate, commit=False)
                            proposals[table['name']] = rows
                            report('completed')
                            break
                        except (ValueError, TypeError, KeyError, pymysql.MySQLError) as error:
                            if attempt:
                                raise ValueError(f'{table["name"]}: il modello non ha prodotto dati validi ({error}). Nessuna riga inserita. Riprova chiedendo valori che rispettino il vincolo indicato.') from error
                            messages += [dict(role='assistant', content=content), dict(role='user', content='Correggi il JSON: ' + str(error))]
        return dict(fingerprint=fingerprint(tables), tables=[dict(name=name, rows=rows) for name, rows in proposals.items()], distributions=rules)
    finally:
        AI_LOCK.release()


def insert(config, draft, commit=True):
    if not isinstance(draft, dict) or not isinstance(draft.get('tables'), list) or not 1 <= len(draft['tables']) <= 60:
        raise ValueError('Proposta di dati non valida.')
    with connect(config) as conn:
        tables = metadata(conn, config['database'])
        if draft.get('fingerprint') != fingerprint(tables):
            raise ValueError('Lo schema del database è cambiato. Genera nuovamente la proposta.')
        rules = distribution_rules(tables, draft.get('distributions'), config['database'])
        names = set(); total = 0
        # Validate the whole proposal before starting any INSERT.
        for item in draft['tables']:
            table = table_named(tables, item.get('name'))
            if table['name'] in names or table['engine'] != 'InnoDB':
                raise ValueError('Servono tabelle InnoDB distinte, per annullare tutti gli inserimenti in caso di errore.')
            names.add(table['name']); validate_rows(table, item.get('rows')); total += len(item['rows'])
        conn.rollback()
        try:
            with conn.cursor() as cur:
                cur.execute("SET SESSION sql_mode=CONCAT_WS(',', @@sql_mode, 'STRICT_ALL_TABLES')")
                conn.begin()
                for item in draft['tables']:
                    columns = [c['name'] for c in table_named(tables, item['name'])['columns']]
                    statement = 'INSERT INTO ' + quote(item['name']) + ' (' + ', '.join(map(quote, columns)) + ') VALUES (' + ', '.join(['%s'] * len(columns)) + ')'
                    for row in item['rows']:
                        cur.execute(statement, [row[c] for c in columns])
                        if cur.warning_count:
                            raise ValueError('MySQL ha segnalato una conversione o un vincolo non applicato. Nessuna riga inserita.')
                for rule in rules:
                    table = table_named(tables, rule['table']); fk = table['foreignKeys'][0]
                    for row in linked_counts(cur, table, fk):
                        if not rule['min'] <= row[-1] <= rule['max']:
                            raise ValueError(f'{table["name"]}: {fk["target"]} {row[:-1]} ha {row[-1]} collegamenti; ne servono da {rule["min"]} a {rule["max"]}. Nessuna nuova riga inserita.')
            if commit:
                conn.commit()
            else:
                conn.rollback()
        except Exception:
            conn.rollback()
            raise
    return dict(inserted=total)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format, *args):
        # Do not log request bodies, credentials or SQL.
        pass

    def allowed(self):
        host = self.headers.get('Host', '')
        allowed = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
        origin = self.headers.get('Origin')
        return host in allowed and (not origin or origin == 'http://' + host)

    def reply(self, value, status=200):
        data = json.dumps(value, ensure_ascii=False, default=json_value, allow_nan=False).encode()
        self.send_response(status); self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store'); self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)

    def do_GET(self):
        if not self.allowed():
            self.reply({'error': 'Indirizzo locale non valido.'}, 403); return
        if self.path == '/api/status':
            hardware = local_hardware()
            try:
                models = [m['name'] for m in ollama('tags', timeout=2).get('models', []) if not m['name'].endswith('-cloud')]
                error = ''
            except ValueError as failure:
                models = []; error = str(failure)
            self.reply(dict(dependencies=bool(pymysql and sqlglot), dependencyError=dependency_error(),
                            models=models, aiError=error, defaultModel=recommended_model(hardware),
                            hardware=hardware, modelAdvice=MODEL_ADVICE)); return
        # Serve only public editor assets, never Python, tests, dotfiles or directory listings.
        path = self.path.split('?', 1)[0]
        if path == '/':
            self.path = '/index.html'
        elif path.count('/') != 1 or path.lstrip('/') not in {'index.html', 'styles.css', 'model.js', 'restructure.js', 'relational.js', 'physical.js', 'app.js', 'lab.js'}:
            self.send_error(404); return
        super().do_GET()

    def do_HEAD(self):
        self.send_error(405)

    def stream_generation(self, config, raw):
        self.send_response(200)
        self.send_header('Content-Type', 'application/x-ndjson; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()

        def emit(event):
            self.wfile.write((json.dumps(event, ensure_ascii=False, default=json_value, allow_nan=False) + '\n').encode())
            self.wfile.flush()
        try:
            emit(dict(event='progress', data=dict(phase='starting')))
            result = generate(config, raw.get('table'), raw.get('count'), raw.get('prompt'), raw.get('model'),
                              progress=lambda data: emit(dict(event='progress', data=data)), distributions=raw.get('distributions'))
            emit(dict(event='done', data=result))
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as error:
            try:
                emit(dict(event='error', error=str(error) or 'Generazione non riuscita.'))
            except (BrokenPipeError, ConnectionResetError):
                pass

    def do_POST(self):
        if not self.allowed() or self.headers.get('X-Trama-Client') != 'local' or self.headers.get('Content-Type') != 'application/json':
            self.reply({'error': 'Richiesta non autorizzata.'}, 403); return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 1000000:
                raise ValueError('Richiesta vuota o troppo grande.')
            raw = json.loads(self.rfile.read(size))
            if not isinstance(raw, dict):
                raise ValueError('Richiesta non valida.')
            if self.path == '/api/connect':
                config = configuration(raw)
                with connect(config, False) as conn:
                    with conn.cursor() as cur:
                        cur.execute('SELECT VERSION()'); version = cur.fetchone()[0]
                        cur.execute('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=%s', (config['database'],)); exists = bool(cur.fetchone())
                    tables = []
                    if exists:
                        conn.select_db(config['database']); tables = metadata(conn, config['database'])
                with SESSION_LOCK:
                    if len(SESSIONS) >= 16:
                        SESSIONS.pop(next(iter(SESSIONS)))
                    token = secrets.token_urlsafe(32); SESSIONS[token] = dict(config=config, lock=threading.Lock(), touched=time.monotonic())
                self.reply(dict(session=token, version=version, exists=exists, tables=tables)); return
            token = raw.get('session', '')
            with SESSION_LOCK:
                session = SESSIONS.get(token)
            if not session or time.monotonic() - session['touched'] > 3600:
                self.reply({'error': 'Connessione scaduta. Collegati nuovamente: la proposta di dati è conservata.', 'code': 'session_expired'}, 401)
                return
            if self.path == '/api/disconnect':
                with SESSION_LOCK:
                    SESSIONS.pop(token, None)
                self.reply({'disconnected': True}); return
            if not session['lock'].acquire(blocking=False):
                raise ValueError('Attendi il completamento dell’operazione in corso.')
            try:
                session['touched'] = time.monotonic(); config = session['config']
                if self.path == '/api/schema':
                    with connect(config) as conn:
                        result = dict(tables=metadata(conn, config['database']))
                elif self.path == '/api/prepare':
                    result = prepare(config, raw.get('sql'))
                elif self.path == '/api/generate':
                    if self.headers.get('Accept') == 'application/x-ndjson':
                        self.stream_generation(config, raw)
                        return
                    result = generate(config, raw.get('table'), raw.get('count'), raw.get('prompt'), raw.get('model'), distributions=raw.get('distributions'))
                elif self.path == '/api/insert':
                    result = insert(config, raw.get('draft'))
                elif self.path == '/api/query':
                    result = execute_query(config, raw.get('sql'))
                else:
                    raise ValueError('Operazione non disponibile.')
                self.reply(result)
            finally:
                session['lock'].release()
        except Exception as error:
            message = str(error)
            # Driver errors do not include passwords; never return config or tracebacks.
            if pymysql and isinstance(error, pymysql.err.OperationalError) and error.args[0] in (2003, 2006, 2013):
                message = 'Il server MySQL non risponde. Controlla che sia avviato e verifica la porta.'
            self.reply({'error': message or 'Operazione non riuscita.'}, 400)


if __name__ == '__main__':
    port = int(os.environ.get('TRAMA_PORT', '4173'))
    with ThreadingHTTPServer(('127.0.0.1', port), Handler) as server:
        print(f'Trama: http://127.0.0.1:{port} — Ctrl+C per arrestare', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
