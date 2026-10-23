"""Conversione del sottoinsieme strutturato C++ in blocchi, senza eseguire il codice."""
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from engine import CodeError, Instrumenter, TOKENS, bounds, diagnostic, prepare, walk


def import_flowchart(code):
    compiler = shutil.which('clang++')
    if not compiler:
        raise CodeError('La conversione richiede clang++, come il visualizzatore C++.')
    source, prefix_lines = prepare(code)
    with tempfile.TemporaryDirectory(prefix='cppviz-import-', dir='/private/tmp') as folder:
        path = Path(folder) / 'lezione.cpp'
        path.write_bytes(source)
        try:
            result = subprocess.run([compiler, '-std=c++17', '-Wno-return-type', '-Xclang', '-ast-dump=json',
                                     '-Xclang', '-ast-dump-filter=__cv_user', '-fsyntax-only', str(path)],
                                    capture_output=True, text=True, timeout=20)
        except subprocess.TimeoutExpired:
            raise CodeError('Tempo massimo superato durante la conversione.') from None
        if result.returncode:
            raise CodeError(diagnostic(result.stderr, path, prefix_lines))
        try:
            tree = json.loads(result.stdout)
        except json.JSONDecodeError:
            raise CodeError('Il compilatore non ha restituito un programma importabile.') from None
    instrumenter = Instrumenter(source, prefix_lines, tree)
    instrumenter.validate()
    return Importer(source, prefix_lines, tree).build()


class Importer:
    def __init__(self, source, prefix_lines, tree):
        self.source, self.prefix_lines, self.tree = source, prefix_lines, tree
        self.serial = 0
        self.functions = {}
        self.names = {}

    def error(self, node, message):
        location = bounds(node)
        line = max(1, self.source[:location[0]].count(b'\n') - self.prefix_lines + 1) if location else 1
        raise CodeError(f'Riga {line}: {message} Il codice originale è conservato.')

    def text(self, node):
        location = bounds(node)
        value = self.source[location[0]:location[1]].decode() if location else ''
        pieces, cursor = [], 0
        for token in TOKENS.finditer(value):
            pieces.append(re.sub(r'\s+', ' ', value[cursor:token.start()]))
            pieces.append(' ' if token[0].startswith(('//', '/*')) else token[0])
            cursor = token.end()
        pieces.append(re.sub(r'\s+', ' ', value[cursor:]))
        return ''.join(pieces).replace('::__cv_user::', '::').strip()

    def node(self, kind, **fields):
        self.serial += 1
        if self.serial > 200:
            raise CodeError('La conversione supera il limite di 200 blocchi.')
        if any(isinstance(value, str) and len(value) > 1000 for value in fields.values()):
            raise CodeError('Un blocco supera il limite di 1.000 caratteri: suddividi le istruzioni.')
        return {'id': f'node{self.serial}', 'kind': kind, **fields}

    def name(self, node):
        value = node.get('name', '')
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', value) or value.startswith('__') or value in {'cv','cin','cout','std'}:
            self.error(node, 'Nome riservato o non rappresentabile nel flowchart.')
        return value

    def type(self, node):
        value = node.get('type', {}).get('qualType', '').replace('std::', '')
        base = re.sub(r'\bconst\b|[&*]|\[\d+\]|\s', '', value)
        if base not in {'int','float','double','char','bool','string','void'}:
            self.error(node, f'Tipo non rappresentabile: {value}.')
        return base, value

    @staticmethod
    def unwrap(node):
        while node.get('kind') in {'ImplicitCastExpr','ParenExpr','ExprWithCleanups','MaterializeTemporaryExpr','CXXBindTemporaryExpr'} and len(node.get('inner', [])) == 1:
            node = node['inner'][0]
        return node

    def operator(self, node):
        children = node.get('inner', [])
        if node.get('kind') != 'CXXOperatorCallExpr' or not children:
            return ''
        return next((n.get('referencedDecl', {}).get('name', '') for n in walk(children[0])
                     if n.get('referencedDecl', {}).get('name', '').startswith('operator')), '')

    def stream(self, node, operator, name):
        node = self.unwrap(node)
        if self.operator(node) == operator:
            children = node['inner']
            left = self.stream(children[1], operator, name)
            return left + [children[2]] if left is not None else None
        return [] if node.get('kind') == 'DeclRefExpr' and node.get('referencedDecl', {}).get('name') == name else None

    def call(self, node, result=''):
        node = self.unwrap(node)
        if node.get('kind') != 'CallExpr':
            return None
        children = node.get('inner', [])
        declaration = next((n.get('referencedDecl', {}) for n in walk(children[0])
                            if n.get('referencedDecl', {}).get('id') in self.functions), None)
        if not declaration:
            return None
        if any(n.get('kind') == 'CXXDefaultArgExpr' for n in children[1:]):
            self.error(node, 'I parametri predefiniti non sono ancora importabili.')
        return self.node('call', callee=self.functions[declaration['id']],
                         args=', '.join(self.text(n) for n in children[1:]), result=result)

    def declaration(self, node):
        result = []
        for variable in node.get('inner', []):
            if variable.get('kind') != 'VarDecl' or variable.get('storageClass') == 'static':
                self.error(variable, 'Dichiarazione locale non importabile; le statiche non sono previste.')
            name = self.name(variable)
            if name == 'main':
                self.error(variable, 'Il nome main è riservato al punto di ingresso.')
            base, qualified = self.type(variable)
            if re.search(r'\*\s*const', qualified):
                self.error(variable, 'I puntatori const non sono ancora importabili.')
            mode = 'reference' if '&' in qualified else 'pointer' if '*' in qualified else 'value'
            size = ''
            if '[' in qualified:
                declarator = self.source[variable['loc']['offset']:bounds(variable)[1]].decode()
                match = re.match(re.escape(name) + r'\s*\[([^\]]*)\]', declarator)
                size = (match[1].strip() if match else '') or re.search(r'\[(\d+)\]', qualified)[1]
            initializers = variable.get('inner', [])
            initializer = next((n for n in initializers if bounds(n)), None) if variable.get('init') else None
            init = self.text(initializer) if initializer else ''
            if init == name and base == 'string':
                init = ''
            elif init.startswith(name+'(') and init.endswith(')'):
                value = init[len(name)+1:-1]
                init = f'string({value})' if base == 'string' else value
            if size and init.startswith('{') and init.endswith('}'):
                init = init[1:-1].strip()
            elif not size and init.startswith('{') and init.endswith('}'):
                init = init[1:-1].strip() or ('string()' if base == 'string' else '0')
            direct_call = self.call(initializer, name) if initializer and not size and mode == 'value' else None
            if direct_call:
                direct_call.update(declareType=base, constant='const' in qualified)
                result.append(direct_call)
                continue
            result.append(self.node('declare', name=name, type=base, mode=mode, size=size,
                                    init=init, constant='const' in qualified))
        return result

    def body(self, node, depth=0):
        if depth > 12:
            self.error(node, 'Il diagramma supera il limite di annidamento.')
        children = node.get('inner', []) if node.get('kind') == 'CompoundStmt' else [node]
        return [block for child in children for block in self.statement(child, depth)]

    def statement(self, node, depth):
        kind, children = node.get('kind'), node.get('inner', [])
        if kind == 'NullStmt':
            return []
        if kind == 'DeclStmt':
            return self.declaration(node)
        if kind in {'IfStmt','WhileStmt'}:
            if node.get('hasInit') or node.get('hasVar'):
                self.error(node, 'Le dichiarazioni nella condizione non sono importabili.')
            fields = {'condition':self.text(children[0])}
            if kind == 'IfStmt':
                fields.update(then=self.body(children[1], depth+1), **{'else':self.body(children[2], depth+1) if len(children)>2 else []})
            else:
                fields['body'] = self.body(children[1], depth+1)
            return [self.node('if' if kind == 'IfStmt' else 'while', **fields)]
        if kind == 'ForStmt':
            if len(children) != 5 or children[1]:
                self.error(node, 'Usa un FOR con inizializzazione, condizione e aggiornamento separati.')
            init, _, condition, update, body = children
            return [self.node('for', init=self.text(init).rstrip(';'), condition=self.text(condition) if condition else 'true',
                              update=self.text(update), body=self.body(body, depth+1))]
        if kind == 'DoStmt':
            return [self.node('do', condition=self.text(children[1]), body=self.body(children[0], depth+1))]
        if kind == 'ReturnStmt':
            return [self.node('return', expression=self.text(children[0]) if children else '')]
        if kind in {'BreakStmt','ContinueStmt'}:
            return [self.node('break' if kind == 'BreakStmt' else 'continue')]
        if kind.endswith('Stmt'):
            self.error(node, f'{kind} non è ancora rappresentabile con i blocchi disponibili.')
        expression = self.unwrap(node)
        outputs = self.stream(expression, 'operator<<', 'cout')
        if outputs is not None:
            result, rows = [], []
            for output in outputs:
                value = self.unwrap(output)
                if value.get('kind') == 'DeclRefExpr' and value.get('referencedDecl', {}).get('kind') == 'FunctionDecl' and value.get('referencedDecl', {}).get('name') == 'endl':
                    result.append(self.node('output', expression='\n'.join(rows) or '""', ending='OUTLN')); rows=[]
                else:
                    rows.append(self.text(output))
            if rows:
                result.append(self.node('output', expression='\n'.join(rows), ending='OUT'))
            return result
        inputs = self.stream(expression, 'operator>>', 'cin')
        if inputs is not None:
            targets = [self.text(target) for target in inputs]
            if any(not re.fullmatch(r'[A-Za-z_]\w*(?:\[[^\[\]]+\])?', target) for target in targets):
                self.error(node, 'Input importabile solo su variabili e celle di array.')
            return [self.node('input', target='\n'.join(targets), prompt='', grouping='chain')]
        called = self.call(expression)
        if called:
            return [called]
        if kind == 'CallExpr' and children:
            refs = [n.get('referencedDecl', {}).get('name') for n in walk(children[0])]
            if 'getline' in refs:
                if len(children) != 3 or self.text(children[1]) not in {'cin','std::cin'}:
                    self.error(node, 'È importabile getline(cin, variabile), senza delimitatori personalizzati.')
                return [self.node('input', target=self.text(children[2]), prompt='', mode='line')]
        if kind == 'BinaryOperator' and node.get('opcode') == '=':
            called = self.call(children[1], self.text(children[0]))
            if called:
                return [called]
        return [self.node('assign', expression=self.text(node))]

    def build(self):
        definitions = []
        for node in self.tree.get('inner', []):
            if node.get('kind') == 'FunctionDecl' and any(n.get('kind')=='CompoundStmt' for n in node.get('inner', [])):
                name = self.name(node)
                if name in self.names:
                    self.error(node, 'Le funzioni sovraccaricate non sono ancora importabili.')
                ident = 'main' if name == 'main' else f'fn{len(definitions)+1}'
                self.names[name] = ident
                definitions.append(node)
            elif node.get('kind') not in {'FunctionDecl','UsingDirectiveDecl','UsingDecl','UsingShadowDecl','EmptyDecl'}:
                self.error(node, 'Variabili globali, alias e altre dichiarazioni globali non sono ancora importabili.')
        if 'main' not in self.names:
            raise CodeError('Manca int main().')
        for node in self.tree.get('inner', []):
            if node.get('kind') == 'FunctionDecl' and node.get('name') in self.names:
                self.functions[node['id']] = self.names[node['name']]
        result = []
        for definition in definitions:
            name = definition['name']
            signature = definition['type']['qualType'].split('(', 1)[0].strip().replace('std::', '')
            if signature not in {'void','int','float','double','char','bool','string'}:
                self.error(definition, 'Tipo di ritorno non rappresentabile.')
            params = []
            for param in definition.get('inner', []):
                if param.get('kind') != 'ParmVarDecl':
                    continue
                base, qualified = self.type(param)
                if re.search(r'\*\s*const', qualified) or param.get('init'):
                    self.error(param, 'Puntatori const e parametri predefiniti non ancora importabili.')
                params.append({'name':self.name(param),'type':base,
                               'constant':'const' in qualified,
                               'mode':'array' if '[' in self.text(param) else 'reference' if '&' in qualified else 'pointer' if '*' in qualified else 'value'})
            if name == 'main' and (params or signature != 'int'):
                self.error(definition, 'Usa int main() senza parametri.')
            body = next(n for n in definition['inner'] if n.get('kind')=='CompoundStmt')
            if name != 'main' and signature != 'void' and not any(n.get('kind')=='ReturnStmt' for n in walk(body)):
                self.error(definition, 'Aggiungi return nella funzione prima della conversione.')
            result.append({'id':self.names[name],'name':name,'returnType':signature,'params':params,'body':self.body(body)})
        if len(result) > 20 or any(len(fn['params'])>12 for fn in result):
            raise CodeError('Superati i limiti di 20 subroutine o 12 parametri.')
        result.sort(key=lambda fn:fn['id']!='main')
        return {'format':'dentro-il-codice-flowchart','version':3,'scope':'cpp','functions':result}
