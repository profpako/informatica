"""Adattatore della prova: riusa analisi, ruoli e conversione del motore locale."""
import json
import sys
import types

try:
    import resource
except ImportError:
    # Nel browser i limiti sono applicati al Worker, non ai processi del sistema.
    sys.modules['resource'] = types.ModuleType('resource')

import engine
import flowchart_import
from roles import classify_roles

_asts = {}
_context = None


class NeedAST(Exception):
    pass


def parse_cpp(code):
    source, prefix = engine.prepare(code)
    if code not in _asts:
        raise NeedAST(code)
    return source, prefix, _asts[code]


flowchart_import.parse_cpp = parse_cpp


def browser_call(operation, payload):
    global _context
    data = json.loads(payload)
    try:
        if operation == 'source':
            return json.dumps({'code': flowchart_import.resolve_flowchart_source(data['code'])})
        if operation == 'import':
            return json.dumps({'document': flowchart_import.import_flowchart(data['code'])})
        if operation == 'instrument':
            source, prefix, tree = parse_cpp(data['code'])
            deferred = {}
            flow = data.get('flow')
            if flow is not None:
                if not isinstance(flow, dict) or set(flow) != {'deferred'} or not isinstance(flow['deferred'], list) or len(flow['deferred']) > 200:
                    raise engine.CodeError('Metadati flowchart non validi.')
                for item in flow['deferred']:
                    if not isinstance(item, dict) or not {'line'} <= set(item) <= {'line', 'activate'} or any(type(v) is not int or not 1 <= v <= data['code'].count('\n') + 1 for v in item.values()) or item['line'] in deferred:
                        raise engine.CodeError('Dichiarazione differita non valida.')
                    deferred[item['line']] = item
            instrumenter = engine.Instrumenter(source, prefix, tree, deferred)
            instrumented = instrumenter.build()
            _context = (source, instrumenter, classify_roles(tree))
            return json.dumps({'code': instrumented})
        if operation == 'decorate':
            snapshots = [json.loads(line) for line in data['trace'].splitlines() if line.strip()]
            if not snapshots:
                raise engine.CodeError('Il programma non ha prodotto una traccia. ' + data.get('error', ''))
            return json.dumps(engine.trace_result(snapshots, *_context, '', data.get('exitCode', 0), data.get('error', '')))
        raise engine.CodeError('Operazione non riconosciuta.')
    except NeedAST as request:
        code = request.args[0]
        source, prefix = engine.prepare(code)
        return json.dumps({'parse': code, 'source': source.decode(), 'prefix': prefix})
