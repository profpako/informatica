"""Strumentazione C++17 tramite l'AST di Clang, senza un parser C++ alternativo."""
import json
import os
from pathlib import Path
import re
import resource
import shutil
import subprocess
import tempfile
from roles import classify_roles

ROOT = Path(__file__).resolve().parent
HEADERS = {"iostream", "string", "iomanip", "type_traits"}
TOKENS = re.compile(r'//[^\n]*|/\*[\s\S]*?\*/|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|[A-Za-z_]\w*|::|\S')


class CodeError(Exception):
    pass


def walk(node):
    yield node
    if node.get("kind") in {"CXXDefaultArgExpr", "CXXDefaultInitExpr"}:
        return
    for child in node.get("inner", []) + node.get("array_filler", []):
        yield from walk(child)


def bounds(node):
    r = node.get("range", {})
    begin, end = r.get("begin", {}), r.get("end", {})
    if "offset" not in begin or "offset" not in end:
        return None
    return begin["offset"], end["offset"] + end.get("tokLen", 0)


def prepare(code):
    if not isinstance(code, str) or not code.strip() or len(code.encode()) > 30000:
        raise CodeError("Inserisci un programma C++ di massimo 30.000 byte.")
    # Gli offset di Clang sono byte: usare la stessa rappresentazione per gli splice.
    if "\\\n" in code or "??" in code:
        raise CodeError("Continuazioni di riga del preprocessore e trigrafi non supportati.")
    clean = re.sub(r'//[^\n]*|/\*[\s\S]*?\*/', lambda m: re.sub(r"[^\n]", " ", m[0]), code)
    for match in re.finditer(r"^\s*#([^\n]*)", clean, re.M):
        directive = re.fullmatch(r"include\s*<([a-z_]+)>\s*", match[1].strip())
        if not directive or directive[1] not in HEADERS:
            raise CodeError("Sono ammessi solo #include <iostream>, <string>, <iomanip> e <type_traits>. Altre direttive non supportate.")
    source = re.sub(r"^[ \t]*#[^\n]*", "", code, flags=re.M)
    tokens = list(TOKENS.finditer(source))
    edits = []
    for i, match in enumerate(tokens):
        token = match[0]
        if token.startswith("__") or token == "cv":
            raise CodeError("I nomi cv e quelli che iniziano con __ sono riservati al motore.")
        if token == "::" and (i == 0 or not re.fullmatch(r"\w+|>|\)", tokens[i - 1][0])):
            if i + 1 < len(tokens) and tokens[i + 1][0] != "std":
                edits.append((match.start(), match.end(), "::__cv_user::"))
    for a, b, replacement in reversed(edits):
        source = source[:a] + replacement + source[b:]
    prefix = '#include <iostream>\n#include <string>\n#include <iomanip>\n#include <type_traits>\nnamespace __cv_user {\n'
    return (prefix + source + '\n}\n').encode(), prefix.count("\n")


class Instrumenter:
    def __init__(self, source, prefix_lines, tree, deferred=None):
        self.source = source
        self.prefix_lines = prefix_lines
        self.tree = tree
        self.deferred = deferred or {}
        self.activations = {}
        for node in walk(tree):
            t = node.get('type', {})
            if 'decltype(' in t.get('qualType', '') and t.get('desugaredQualType'):
                t['qualType'] = t['desugaredQualType'].replace('std::basic_string<char>', 'std::string')
            descriptor = self.deferred.get(self.line(node)) if node.get('kind') == 'VarDecl' else None
            if descriptor and descriptor.get('activate'):
                self.activations.setdefault(descriptor['activate'], []).append(node)
        self.serial = 0
        self.functions = {n["id"] for n in tree.get("inner", []) if n.get("kind") == "FunctionDecl"}
        definitions = {n.get('mangledName', n['name']): n for n in tree.get('inner', [])
                       if n.get('kind') == 'FunctionDecl' and any(c.get('kind') == 'CompoundStmt' for c in n.get('inner', []))}
        self.definitions = {n['id']: definitions.get(n.get('mangledName', n['name']))
                            for n in tree.get('inner', []) if n.get('kind') == 'FunctionDecl'}
        self.declarations = {n['id']: n for n in walk(tree) if n.get('kind') in {'VarDecl', 'ParmVarDecl'}}
        self.callsites = {}
        self.conditions = {}
        self.condition_capture = False
        self.control_stack = []

    def text(self, node):
        r = bounds(node)
        return self.source[r[0]:r[1]].decode() if r else ""

    def line(self, node):
        r = bounds(node)
        return max(1, self.source[:r[0]].count(b"\n") - self.prefix_lines + 1) if r else 1

    def error(self, node, message):
        raise CodeError(f"Riga {self.line(node)}: {message}")

    def unique(self):
        self.serial += 1
        return f"__cv_{self.serial}"

    def splice(self, node, changes):
        start, end = bounds(node)
        result, cursor = [], start
        for child, replacement in sorted(changes, key=lambda item: bounds(item[0])):
            a, b = bounds(child)
            if a < cursor or a < start or b > end:
                continue
            result.extend([self.source[cursor:a].decode(), replacement])
            cursor = b
        result.append(self.source[cursor:end].decode())
        return "".join(result)

    def validate(self):
        denied = {"CXXNewExpr", "CXXDeleteExpr", "CXXThrowExpr", "CXXTryStmt", "LambdaExpr",
                  "GCCAsmStmt", "MSAsmStmt", "GotoStmt", "IndirectGotoStmt", "CXXReinterpretCastExpr",
                  "CXXConstCastExpr", "CXXDynamicCastExpr", "CXXRecordDecl", "RecordDecl", "EnumDecl",
                  "NamespaceDecl", "FunctionTemplateDecl", "LinkageSpecDecl", "CXXForRangeStmt",
                  "AttributedStmt", "CXXTypeidExpr", "VAArgExpr", "StmtExpr"}
        allowed_calls = {"getline", "setw", "setprecision", "ignore", "size", "length"}
        for node in walk(self.tree):
            kind = node.get("kind")
            if node is not self.tree and kind in denied:
                self.error(node, f"costrutto {kind} non supportato nella prima versione.")
            if kind in {"VarDecl", "ParmVarDecl"}:
                self.validate_type(node)
                if node.get("storageClass") == "extern" or "tls" in node:
                    self.error(node, "variabili extern o thread_local non supportate.")
                global_variable = any(node is top for top in self.tree.get("inner", []))
                if kind == "VarDecl" and node.get("init") and not global_variable and node.get("storageClass") != "static":
                    for expression in node.get("inner", []):
                        for cast in walk(expression):
                            if cast.get("castKind") == "LValueToRValue" or "&" in node["type"]["qualType"]:
                                if any(ref.get("referencedDecl", {}).get("id") == node["id"] for ref in walk(cast)):
                                    self.error(node, "inizializzazione con uso della stessa variabile prima che abbia un valore.")
            if kind == "FunctionDecl":
                signature = node.get("type", {}).get("qualType", "")
                result_type = signature.split("(", 1)[0]
                if "&" in result_type or "*" in result_type or "..." in signature:
                    self.error(node, "ritorni per riferimento/puntatore e funzioni variadiche non supportati.")
            if kind in {"CallExpr", "CXXMemberCallExpr", "CXXOperatorCallExpr"}:
                children = node.get("inner", [])
                if not children:
                    continue
                refs = [n.get("referencedDecl", {}) for n in walk(children[0]) if "referencedDecl" in n]
                members = [n for n in walk(children[0]) if n.get("kind") == "MemberExpr"]
                names = [r.get("name", "") for r in refs] + [m.get("name", "") for m in members]
                user = any(r.get("id") in self.functions for r in refs)
                if user and any(r.get("name") == "main" for r in refs):
                    self.error(node, "main è il punto di ingresso e non può essere chiamato come una funzione ordinaria.")
                if not user and not any(name in allowed_calls or name.startswith("operator") for name in names):
                    self.error(node, "chiamata non supportata: " + (names[0] if names else self.text(node)))
            if kind in {"BinaryOperator", "CompoundAssignOperator", "UnaryOperator"}:
                op = node.get("opcode")
                if op in {"+", "-", "+=", "-=", "++", "--"} and "*" in node.get("type", {}).get("qualType", ""):
                    self.error(node, "aritmetica dei puntatori non supportata; usa gli indici dell'array.")

    def validate_type(self, node):
        t = node.get("type", {}).get("qualType", "")
        if t.count("[") > 1 or "(" in t or t.count("*") > 1 or "&&" in t or node.get("isParameterPack"):
            self.error(node, f"tipo {t} non supportato; matrici e puntatori avanzati sono estensioni successive.")
        base = re.sub(r"\bconst\b|\bvolatile\b|\bstd::|[&*]|\[\d+\]|\s", "", t)
        if base not in {"int", "float", "double", "char", "bool", "string"} or "volatile" in t:
            self.error(node, f"tipo {t} non supportato.")
        sizes = re.findall(r"\[(\d+)\]", t)
        if sizes and int(sizes[0]) > 100:
            self.error(node, "limite di 100 elementi per array.")

    def watcher(self, node, global_scope=False, function=""):
        name = node.get("name")
        if not name:
            self.error(node, "assegna un nome a ogni parametro della definizione.")
        t = node["type"]["qualType"]
        persistent = global_scope or node.get("storageClass") == "static"
        delayed = node['kind'] == 'VarDecl' and self.line(node) in self.deferred
        init = not delayed and bool(node.get("init") or persistent or node["kind"] == "ParmVarDecl" or "string" in t)
        label = function + "::" + name if persistent and function else name
        storage = "static " if node.get("storageClass") == "static" and not global_scope else ""
        return (f'{storage}auto {self.unique()} = cv::watch({json.dumps(label)}, {json.dumps(t)}, {name}, '
                f'{str(init).lower()}, {str("&" in t).lower()}, {str(persistent).lower()}, '
                f'{node["loc"]["offset"]}, {str(node["kind"] == "ParmVarDecl").lower()}, {str(not delayed).lower()});')

    def argument_source(self, node):
        """Collegare solo celle identificabili senza eseguire di nuovo l'argomento."""
        kind, inner = node.get('kind'), node.get('inner', [])
        if kind == 'DeclRefExpr':
            declaration = self.declarations.get(node.get('referencedDecl', {}).get('id'))
            return {'declaration': declaration['loc']['offset'], 'index': 0} if declaration else {}
        if kind == 'ArraySubscriptExpr' and inner[1].get('kind') == 'IntegerLiteral':
            source = self.argument_source(inner[0])
            return {**source, 'index': int(inner[1]['value'])} if source else {}
        if kind in {'ImplicitCastExpr', 'ParenExpr', 'ExprWithCleanups'} and len(inner) == 1:
            return self.argument_source(inner[0])
        if kind == 'UnaryOperator' and node.get('opcode') == '&':
            return self.argument_source(inner[0])
        return {}

    def expression(self, node, writing=False):
        if not bounds(node):
            return ""
        kind, children, line = node["kind"], node.get("inner", []), self.line(node)
        captured = f', {bounds(node)[0]}, {bounds(node)[1]}' if self.condition_capture else ''
        operator = next((n.get('referencedDecl', {}).get('name') for n in walk(children[0])
                         if n.get('referencedDecl', {}).get('name', '').startswith('operator')), '') if kind == 'CXXOperatorCallExpr' and children else ''
        if operator == 'operator=' and len(children) == 3 and 'string' in children[1].get('type', {}).get('qualType', ''):
            lhs, rhs = self.expression(children[1], True), self.expression(children[2])
            return f'cv::assign([&](){{return ({rhs});}}, [&]() -> decltype(auto) {{return ({lhs});}})'
        if self.deferred and kind == 'DeclRefExpr' and not writing and 'string' in node.get('type', {}).get('qualType', ''):
            declaration = self.declarations.get(node.get('referencedDecl', {}).get('id'))
            if declaration:
                return f'cv::checked(({self.text(node)}), {line}{captured})'
        if kind == "ImplicitCastExpr" and node.get("castKind") == "LValueToRValue":
            return f'cv::read(({self.expression(children[0])}), {line}{captured})'
        if kind == "ArraySubscriptExpr":
            return f'cv::at(({self.expression(children[0])}), ({self.expression(children[1])}), {line})'
        if kind == "UnaryOperator":
            op = node.get("opcode")
            expr = self.expression(children[0], writing or op == '&')
            if op in {"++", "--"}:
                return f'cv::{"post" if node.get("isPostfix") else "pre"}(({expr}), {1 if op == "++" else -1}, {line}{captured})'
            if op == "*":
                return f'(*cv::pointer(({expr}), {line}))'
        if kind in {"BinaryOperator", "CompoundAssignOperator"}:
            op = node.get("opcode", "")
            if op == "=" or kind == "CompoundAssignOperator":
                lhs, rhs = self.expression(children[0], True), self.expression(children[1])
                args = f'[&](){{return ({rhs});}}, [&]() -> decltype(auto) {{return ({lhs});}}'
                if op == "=":
                    return f'cv::assign({args})'
                return f'cv::update({args}, [](auto &a, auto b){{a {op} b;}}, {line})'
        # No transformar operandos de sizeof: son expresiones no evaluadas.
        if kind == "UnaryExprOrTypeTraitExpr":
            return self.text(node)
        changes = []
        for index, child in enumerate(children):
            if not bounds(child):
                continue
            rendered_child = self.expression(child, writing or operator == 'operator>>' and index == len(children) - 1)
            changes.append((child, rendered_child))
        # Los elementos explícitos de una inicialización parcial están en array_filler.
        changes.extend((c, self.expression(c)) for c in node.get("array_filler", []) if bounds(c))
        rendered = self.splice(node, changes)
        if kind in {"CXXOperatorCallExpr", "CallExpr"} and children:
            refs = [n.get("referencedDecl", {}).get("name") for n in walk(children[0])]
            if "operator<<" in refs and len(children) > 2:
                source_type = children[-1].get("type", {}).get("qualType", "")
                if "char *" in source_type and not any(n.get("kind") == "StringLiteral" for n in walk(children[-1])):
                    self.error(node, "la stampa di stringhe C non è supportata; usa string o stampa il singolo carattere dell'array.")
            target = None
            if "operator>>" in refs and "istream" in node.get("type", {}).get("qualType", ""):
                target = children[-1]
            elif "getline" in refs and len(children) >= 3:
                target = children[2]
            if target:
                # Il target è valutato una sola volta: indici con effetti sono esclusi qui.
                if any(n.get("opcode") in {"++", "--", "="} for n in walk(target)):
                    self.error(target, "usa un indice senza effetti collaterali nel target di input.")
                formatted = str("operator>>" in refs).lower()
                rendered = f'cv::input([&]() -> std::istream& {{return ({rendered});}}, ({self.expression(target, True)}), {line}, {formatted})'
            function = next((self.definitions.get(n.get('referencedDecl', {}).get('id')) for n in walk(children[0])
                             if self.definitions.get(n.get('referencedDecl', {}).get('id'))), None)
            if function:
                site = bounds(node)[0]
                params = [p for p in function.get('inner', []) if p.get('kind') == 'ParmVarDecl']
                origins = []
                for param, argument in zip(params, children[1:]):
                    default = argument.get('kind') == 'CXXDefaultArgExpr'
                    t = param['type']['qualType']
                    origins.append({'parameter': param['loc']['offset'],
                                    'expression': self.text(argument) if not default else 'argomento predefinito',
                                    'kind': 'reference' if '&' in t else 'address' if '*' in t else 'value',
                                    'source': self.argument_source(argument) if not default else {}})
                self.callsites[site] = origins
                rendered = f'cv::invoke({site}, [&]() -> decltype(auto) {{return ({rendered});}})'
        return rendered

    def declaration(self, node, function=""):
        variables = node.get("inner", [])
        declarations = []
        for var in variables:
            if var.get("kind") != "VarDecl":
                self.error(var, "dichiarazione locale non supportata.")
            changes = [(c, self.expression(c)) for c in var.get("inner", []) if bounds(c)]
            declarator = {"range": {"begin": var["loc"], "end": var["range"]["end"]}}
            base_type = re.sub(r"\[\d+\]", "", var["type"]["qualType"])
            storage = "static " if var.get("storageClass") == "static" else ""
            declarations.append(storage + base_type + " " + self.splice(declarator, changes) + ";" + self.watcher(var, function=function))
        return "".join(declarations)

    def condition_test(self, cond, owner, kind, body, otherwise=None):
        site = bounds(cond)[0] if cond else bounds(owner)[0]
        self.condition_capture = True
        test = self.expression(cond) if cond else 'true'
        self.condition_capture = False
        first = body.get('inner', [])[0] if body.get('kind') == 'CompoundStmt' and body.get('inner') else body
        self.conditions[site] = {'expression': self.text(cond) if cond else 'true', 'kind': kind,
                                 'line': self.line(cond) if cond else self.line(owner),
                                 'bodyLine': self.line(first), 'hasElse': otherwise is not None,
                                 'hasShortCircuit': any(n.get('opcode') in {'&&', '||'} for n in walk(cond)) if cond else False}
        return site, f'cv::test_condition({site},{self.conditions[site]["line"]},[&]() -> decltype(auto) {{return ({test});}})'

    def loop_body(self, body, function, site):
        self.control_stack.append(site)
        result = self.body(body, function)
        self.control_stack.pop()
        return result

    def statement(self, node, function="", before=True):
        kind, children, line = node.get("kind"), node.get("inner", []), self.line(node)
        prefix = f'cv::step({line});' if before else ""
        prefix += ''.join(f'cv::activate(&{var["name"]}, {str("string" in var["type"]["qualType"]).lower()});'
                          for var in self.activations.get(line, []))
        if kind == "CompoundStmt":
            return "{" + "".join(self.statement(c, function) for c in children) + "}"
        if kind == "DeclStmt":
            if line in self.deferred:
                return self.declaration(node, function)
            return prefix + self.declaration(node, function) + f'cv::step({line}, "dichiarazione");'
        if kind == "ForStmt":
            if len(children) != 5 or children[1]:
                self.error(node, "usa un for con inizializzazione, condizione e aggiornamento espliciti.")
            init, _, cond, inc, body = children
            initialization = self.declaration(init, function) if init.get("kind") == "DeclStmt" else (self.expression(init) + ";" if init else "")
            site, test = self.condition_test(cond, node, 'for', body)
            return (prefix + "{" + initialization + f'for(;{test};{self.expression(inc) if inc else ""})'
                    + self.loop_body(body, function, site) + "}")
        if kind in {"IfStmt", "WhileStmt", "SwitchStmt"}:
            if node.get("hasInit") or node.get("hasVar"):
                self.error(node, "dichiarazioni nella condizione non supportate; dichiara la variabile prima.")
            cond, body = children[:2]
            if kind == "IfStmt":
                _, test = self.condition_test(cond, node, 'if', body, children[2] if len(children) > 2 else None)
                result = prefix + f'if({test})' + self.body(body, function)
                if len(children) > 2:
                    result += "else" + self.body(children[2], function)
                return result
            if kind == "WhileStmt":
                site, test = self.condition_test(cond, node, 'while', body)
                return prefix + f'while({test})' + self.loop_body(body, function, site)
            expr = self.expression(cond)
            self.control_stack.append(None)
            switch_body = self.statement(body, function, False)
            self.control_stack.pop()
            return prefix + f'switch({expr})' + switch_body
        if kind == "DoStmt":
            site, test = self.condition_test(children[1], node, 'do', children[0])
            return prefix + "do" + self.loop_body(children[0], function, site) + f'while({test});'
        if kind in {"CaseStmt", "DefaultStmt"}:
            label = "default:" if kind == "DefaultStmt" else "case " + self.expression(children[0]) + ":"
            return label + self.statement(children[-1], function)
        if kind == "ReturnStmt":
            return prefix + (f'return cv::returned(({self.expression(children[0])}),{line});' if children else f'cv::step({line},"ritorno");return;')
        if kind in {"BreakStmt", "ContinueStmt", "NullStmt"}:
            site = (self.control_stack[-1] if self.control_stack else None) if kind == 'BreakStmt' else next((s for s in reversed(self.control_stack) if s is not None), None)
            if kind != 'NullStmt' and site is not None:
                return f'cv::loop_jump({site},{line},"{"break" if kind == "BreakStmt" else "continue"}");' + self.text(node).rstrip(';') + ';'
            return prefix + self.text(node).rstrip(";") + ";"
        if kind.endswith("Stmt"):
            self.error(node, f"istruzione {kind} non supportata.")
        return prefix + self.expression(node) + f';cv::step({line},"eseguita");'

    def body(self, node, function):
        result = self.statement(node, function)
        return result if node.get("kind") == "CompoundStmt" else "{" + result + "}"

    def build(self):
        self.validate()
        changes, global_insertions = [], []
        main = False
        for node in self.tree.get("inner", []):
            kind = node.get("kind")
            if kind == "FunctionDecl":
                bodies = [n for n in node.get("inner", []) if n.get("kind") == "CompoundStmt"]
                if not bodies:
                    continue
                name = node["name"]
                params = [n for n in node.get("inner", []) if n.get("kind") == "ParmVarDecl"]
                if name == "main":
                    if params or node["type"]["qualType"] != "int ()":
                        self.error(node, "usa int main() senza argomenti.")
                    main = True
                start = f'cv::Frame {self.unique()}({json.dumps(name)},{self.line(node)});'
                start += "".join(self.watcher(p) for p in params)
                start += f'cv::step({self.line(node)},"chiamata a {name}");'
                body = self.statement(bodies[0], name)
                fallback = f'cv::step({self.line(node)},"ritorno implicito");' + ("return 0;" if name == "main" else "")
                changes.append((bodies[0], "{" + start + body[1:-1] + fallback + "}"))
            elif kind == "VarDecl":
                if any(n.get("kind") in {"CallExpr", "CXXOperatorCallExpr", "CXXMemberCallExpr"} for n in walk(node)):
                    self.error(node, "le inizializzazioni globali con chiamate a funzione non sono supportate; sposta la chiamata in main.")
                # Le dichiarazioni globali multiple condividono il punto e virgola.
                end = bounds(node)[1]
                semicolon = self.source.find(b";", end)
                if semicolon < 0:
                    self.error(node, "dichiarazione globale non riconosciuta.")
                global_insertions.append((semicolon + 1, self.watcher(node, True)))
            elif kind not in {"UsingDirectiveDecl", "UsingDecl", "UsingShadowDecl", "EmptyDecl"}:
                self.error(node, f"dichiarazione {kind} non supportata.")
        if not main:
            raise CodeError("Manca una definizione di int main().")
        edits = [(bounds(n)[0], bounds(n)[1], text) for n, text in changes]
        edits += [(pos, pos, text) for pos, text in global_insertions]
        output = self.source
        for a, b, text in sorted(edits, key=lambda item: item[0], reverse=True):
            output = output[:a] + text.encode() + output[b:]
        return '#include "runtime.hpp"\n' + output.decode() + '\nint main(){cv::start(); int result=__cv_user::main(); cv::finish(); return result;}\n'


def limits():
    resource.setrlimit(resource.RLIMIT_CPU, (4, 4))
    resource.setrlimit(resource.RLIMIT_FSIZE, (12 * 1024 * 1024, 12 * 1024 * 1024))


def diagnostic(text, path, prefix_lines):
    def replace(match):
        return f'Riga {max(1, int(match[1]) - prefix_lines)}:{match[2]}'
    text = re.sub(re.escape(str(path)) + r":(\d+):(\d+)", replace, text)
    return text.replace("__cv_user::", "")[:8000]


def sandbox_profile(folder, clang_resources):
    return ('(version 1)(deny default)\n'
            '(allow process-exec (literal ' + json.dumps(str(Path(folder) / 'programma')) + '))\n'
            '(allow sysctl-read)\n(allow file-read-metadata)\n'
            '(allow file-read* (literal "/") (subpath ' + json.dumps(clang_resources) + ') '
            '(subpath "/System") (subpath "/usr/lib") (subpath "/Library/Apple/System/Library") '
            '(subpath "/private/var/db/dyld") (literal "/dev/urandom") (literal "/dev/null") (subpath ' + json.dumps(str(folder)) + '))\n'
            '(allow file-write* (subpath ' + json.dumps(str(folder)) + '))\n')


def run_program(code, user_input="", flow=None):
    if not isinstance(user_input, str) or len(user_input.encode()) > 10000:
        raise CodeError("Input troppo lungo: massimo 10.000 byte.")
    compiler = shutil.which("clang++")
    sandbox = shutil.which("sandbox-exec")
    if not compiler or not sandbox:
        raise CodeError("Questa versione richiede macOS, clang++ e sandbox-exec. Installa gli strumenti da riga di comando di Xcode.")
    source, prefix_lines = prepare(code)
    deferred = {}
    if flow is not None:
        if not isinstance(flow, dict) or set(flow) != {'deferred'} or not isinstance(flow['deferred'], list) or len(flow['deferred']) > 200:
            raise CodeError('Metadati flowchart non validi.')
        maximum = code.count('\n') + 1
        for descriptor in flow['deferred']:
            if (not isinstance(descriptor, dict) or not {'line'} <= set(descriptor) <= {'line', 'activate'}
                    or any(type(value) is not int or not 1 <= value <= maximum for value in descriptor.values())
                    or descriptor['line'] in deferred):
                raise CodeError('Dichiarazione differita del flowchart non valida.')
            deferred[descriptor['line']] = descriptor
    with tempfile.TemporaryDirectory(prefix="cppviz-", dir="/private/tmp") as folder:
        directory = Path(folder)
        path = directory / "lezione.cpp"
        path.write_bytes(source)
        base = [compiler, "-std=c++17", "-fno-color-diagnostics", "-Werror=return-type", "-pedantic-errors"]
        try:
            parsed = subprocess.run(base + ["-Wno-return-type", "-Xclang", "-ast-dump=json", "-Xclang", "-ast-dump-filter=__cv_user", "-fsyntax-only", str(path)],
                                    capture_output=True, text=True, timeout=20)
            if parsed.returncode:
                raise CodeError(diagnostic(parsed.stderr, path, prefix_lines))
            tree = json.loads(parsed.stdout)
            instrumenter = Instrumenter(source, prefix_lines, tree, deferred)
            generated = instrumenter.build()
            roles = classify_roles(tree)
            instrumented = directory / "osservato.cpp"
            instrumented.write_text(generated)
            executable = directory / "programma"
            result = subprocess.run(base + ["-O0", "-g", "-fsanitize=undefined,bounds", "-fno-sanitize-recover=all", "-I", str(ROOT), str(instrumented), "-o", str(executable)],
                                    capture_output=True, text=True, timeout=20)
            if result.returncode:
                raise CodeError("Questo caso non è ancora visualizzabile. Dettaglio tecnico:\n" + result.stderr[-6000:])
            profile = directory / "isolamento.sb"
            clang_resources = subprocess.run([compiler, "-print-resource-dir"], capture_output=True, text=True, timeout=5).stdout.strip()
            profile.write_text(sandbox_profile(folder, clang_resources))
            with (directory / "stderr.txt").open("w+") as stderr, (directory / "stdout.txt").open("w") as stdout:
                execution = subprocess.run([sandbox, "-f", str(profile), str(executable)], input=user_input, text=True,
                                           stdout=stdout, stderr=stderr, cwd=folder, timeout=8, preexec_fn=limits,
                                           env={"PATH": "/usr/bin:/bin", "UBSAN_OPTIONS": "print_stacktrace=0"})
                stderr.seek(0)
                error = stderr.read(8000)
            trace_path = directory / "trace.jsonl"
            snapshots = []
            if trace_path.exists():
                for line in trace_path.read_text().splitlines():
                    try:
                        snapshots.append(json.loads(line))
                    except json.JSONDecodeError:
                        break
            if not snapshots:
                raise CodeError(f"Il programma non ha prodotto una traccia (codice {execution.returncode}). " + error[:1500])
            origins = {}
            previous_frames, last_seen, last_call = {}, {}, None
            condition_counts = {}
            for index, snapshot in enumerate(snapshots):
                condition = snapshot.get('condition')
                if condition:
                    metadata = instrumenter.conditions[condition['site']]
                    condition.update(metadata)
                    key = (condition['frame'], condition['site'])
                    if condition['action'] == 'test':
                        condition_counts[key] = condition_counts.get(key, 0) + 1
                    else:
                        condition['result'] = None
                    condition['number'] = condition_counts.get(key, 0)
                    captured = {(v['begin'], v['end']): v for v in condition['values']}
                    condition['values'] = [{**v, 'expression': source[a:b].decode()} for (a, b), v in captured.items()]
                    cursor, expanded = condition['site'], []
                    end = condition['site'] + len(metadata['expression'].encode())
                    for (a, b), value in sorted(captured.items(), key=lambda item: (item[0][0], -item[0][1])):
                        if cursor <= a < b <= end:
                            expanded.extend([source[cursor:a].decode(), value['text']])
                            cursor = b
                    expanded.append(source[cursor:end].decode())
                    condition['expanded'] = ''.join(expanded) if captured else metadata['expression']
                frames = {f['id']: f for f in snapshot['frames']}
                for ident, frame in previous_frames.items():
                    if ident not in frames and frame['name'] != 'main':
                        last_call = {'frame': ident, 'name': frame['name'], 'step': last_seen[ident]}
                snapshot['lastCall'] = last_call
                for ident in frames:
                    last_seen[ident] = index
                previous_frames = frames
                for variable in snapshot['variables']:
                    variable['role'] = roles.get(variable['declaration'], 'work')
                    if variable['parameter'] and variable['id'] not in origins:
                        frame = frames[variable['frame']]
                        descriptor = next((o for o in instrumenter.callsites.get(frame.get('site'), [])
                                           if o['parameter'] == variable['declaration']), None)
                        if descriptor:
                            source_variable = next((v for v in snapshot['variables']
                                           if v['declaration'] == descriptor['source'].get('declaration')
                                           and v['frame'] in {0, frame['caller']}), None)
                            cell = variable['cells'][0]
                            origin = {'kind': descriptor['kind'], 'expression': descriptor['expression'],
                                      'value': cell['value'], 'initialized': cell['initialized'],
                                      'caller': frame['caller'], 'sourceId': source_variable['id'] if source_variable else None,
                                      'sourceIndex': descriptor['source'].get('index', 0)}
                            if source_variable:
                                source_frame = frames.get(source_variable['frame'])
                                origin['sourceLabel'] = (source_frame['name'] + '()' if source_frame else 'Globali/statiche') + ' · ' + source_variable['name']
                                if source_variable['array']:
                                    origin['sourceLabel'] += f"[{origin['sourceIndex']}]"
                            origins[variable['id']] = origin
                    if variable['id'] in origins:
                        variable['origin'] = origins[variable['id']]
            if execution.returncode and not snapshots[-1].get("error"):
                runtime_error = re.search(r"runtime error: ([^\n]+)", error)
                detail = runtime_error[1] if runtime_error else (error[:1500] or f"codice {execution.returncode}")
                detail = detail.replace("division by zero", "divisione per zero").replace("signed integer overflow", "overflow di un intero con segno")
                snapshots[-1]["error"] = "Esecuzione interrotta: " + detail
                snapshots[-1]["event"] = "errore"
            return {"steps": snapshots, "error": snapshots[-1].get("error", ""), "warnings": diagnostic(parsed.stderr, path, prefix_lines)}
        except subprocess.TimeoutExpired:
            raise CodeError("Tempo massimo superato. Riduci il programma e controlla che i cicli terminino.") from None
        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
            raise CodeError("Impossibile analizzare questo costrutto C++: " + str(exc)[:200]) from exc
