"""Ruoli didattici dall'AST: confini console e direzione dei parametri."""


def nodes(node):
    yield node
    for child in node.get('inner', []) + node.get('array_filler', []):
        yield from nodes(child)


def classify_roles(tree):
    declarations = {n['id']: n for n in nodes(tree) if n.get('kind') in {'VarDecl', 'ParmVarDecl'}}
    functions = [n for n in tree.get('inner', []) if n.get('kind') == 'FunctionDecl']
    definitions = {n.get('mangledName', n['name']): n for n in functions
                   if any(c.get('kind') == 'CompoundStmt' for c in n.get('inner', []))}
    callees = {n['id']: definitions.get(n.get('mangledName', n['name'])) for n in functions}
    globals_ = {n['id'] for n in tree.get('inner', []) if n.get('kind') == 'VarDecl'}
    aliases = {}

    def children(node):
        return node.get('inner', [])

    def references(node):
        return [n['referencedDecl'] for n in nodes(node) if n.get('kind') == 'DeclRefExpr']

    def location(node):
        kind, inner = node.get('kind'), children(node)
        if kind == 'DeclRefExpr':
            key = node.get('referencedDecl', {}).get('id')
            return aliases.get(key, {(key, None)}) if key in declarations else set()
        if kind == 'ArraySubscriptExpr':
            indexes = [n for n in nodes(inner[1]) if n.get('kind') == 'IntegerLiteral']
            part = indexes[0]['value'] if inner[1].get('kind') == 'IntegerLiteral' else '*'
            return {(key, part) for key, _ in location(inner[0])}
        if kind == 'UnaryOperator' and node.get('opcode') == '*':
            return {(key, (part if part is not None else '0') if any(c in declarations[key]['type']['qualType'] for c in '*[') else part)
                    for key, part in location(inner[0])}
        if len(inner) == 1:
            return location(inner[0])
        return set()

    # shortcut: unire le destinazioni dei puntatori; analizzare i percorsi se occorre distinguerle.
    for _ in range(len(declarations) + 1):
        before = {key: set(value) for key, value in aliases.items()}
        for n in nodes(tree):
            if n.get('kind') == 'VarDecl' and children(n) and any(c in n['type']['qualType'] for c in '&*'):
                targets = location(children(n)[-1])
                if targets:
                    aliases.setdefault(n['id'], set()).update(targets)
            if n.get('kind') == 'BinaryOperator' and n.get('opcode') == '=':
                left, right = children(n)
                refs = references(left)
                if len(refs) == 1 and '*' in refs[0].get('type', {}).get('qualType', '') and left.get('kind') == 'DeclRefExpr':
                    targets = location(right)
                    if targets:
                        aliases.setdefault(refs[0]['id'], set()).update(targets)
        if aliases == before:
            break

    def sources(node):
        kind = node.get('kind')
        if kind in {'DeclRefExpr', 'ArraySubscriptExpr'} or (kind == 'UnaryOperator' and node.get('opcode') == '*'):
            return location(node)
        if kind in {'CallExpr', 'CXXMemberCallExpr', 'UnaryExprOrTypeTraitExpr'} or (kind == 'UnaryOperator' and node.get('opcode') == '&'):
            return set()
        return set().union(*(sources(c) for c in children(node))) if children(node) else set()

    summaries = {}

    def analyze(function):
        params = [n for n in children(function) if n.get('kind') == 'ParmVarDecl']
        param_ids = {p['id'] for p in params}
        external = globals_ | param_ids
        reads, writes, inputs, outputs, printed, exits = set(), set(), set(), set(), set(), []

        def read(locations, assigned):
            reads.update(key for key in locations if key not in assigned)

        def write(locations, assigned):
            writes.update(locations)
            assigned.update(key for key in locations if key[1] != '*')

        def visit(node, assigned):
            if assigned is None:
                return None
            kind, inner = node.get('kind'), children(node)
            if kind == 'UnaryExprOrTypeTraitExpr':
                return assigned
            if kind == 'ArraySubscriptExpr' or kind == 'UnaryOperator' and node.get('opcode') in {'*', '&'}:
                address(node, assigned)
                return assigned
            if kind == 'CompoundStmt':
                for c in inner:
                    assigned = visit(c, assigned)
                return assigned
            if kind in {'IfStmt', 'ConditionalOperator'}:
                visit(inner[0], assigned)
                yes = visit(inner[1], set(assigned))
                no = visit(inner[2], set(assigned)) if len(inner) > 2 else set(assigned)
                return no if yes is None else yes if no is None else yes & no
            if kind == 'BinaryOperator' and node.get('opcode') in {'&&', '||'}:
                visit(inner[0], assigned)
                visit(inner[1], set(assigned))
                return assigned
            if kind in {'ForStmt', 'WhileStmt', 'DoStmt', 'SwitchStmt'}:
                # shortcut: scritture nei cicli/switch non certe; raffinare i percorsi per maggiore precisione.
                for c in inner:
                    visit(c, set(assigned))
                return assigned
            if kind == 'ReturnStmt':
                for c in inner:
                    visit(c, assigned)
                    if function['name'] != 'main':
                        outputs.update(sources(c))
                exits.append(set(assigned))
                return None
            if kind == 'VarDecl':
                for c in inner:
                    if nontarget(node):
                        visit(c, assigned)
                    else:
                        address(c, assigned)
                if inner and nontarget(node):
                    assigned.add((node['id'], None))
                return assigned
            if kind in {'BinaryOperator', 'CompoundAssignOperator'} and (node.get('opcode') == '=' or kind == 'CompoundAssignOperator'):
                left, right = inner
                visit(right, assigned)
                targets = location(left)
                if kind == 'CompoundAssignOperator':
                    read(targets, assigned)
                address(left, assigned)
                write(targets, assigned)
                return assigned
            if kind == 'UnaryOperator' and node.get('opcode') in {'++', '--'}:
                targets = location(inner[0])
                read(targets, assigned)
                write(targets, assigned)
                address(inner[0], assigned)
                return assigned
            if kind in {'CallExpr', 'CXXOperatorCallExpr', 'CXXMemberCallExpr'} and inner:
                refs = references(inner[0])
                names = {r.get('name') for r in refs}
                operators = names & {'operator=', 'operator+=', 'operator-=', 'operator*=', 'operator/='}
                if kind == 'CXXOperatorCallExpr' and operators and len(inner) == 3:
                    visit(inner[2], assigned)
                    targets = location(inner[1])
                    if 'operator=' not in operators:
                        read(targets, assigned)
                    write(targets, assigned)
                    return assigned
                if 'operator>>' in names and 'istream' in node.get('type', {}).get('qualType', '') or 'getline' in names:
                    target = inner[-1] if 'operator>>' in names else inner[2]
                    for c in inner[1:]:
                        if c is not target:
                            visit(c, assigned)
                    address(target, assigned)
                    targets = location(target)
                    inputs.update(targets)
                    write(targets, assigned)
                    return assigned
                if 'operator<<' in names and 'ostream' in node.get('type', {}).get('qualType', ''):
                    for c in inner[1:]:
                        visit(c, assigned)
                    outputs.update(sources(inner[-1]))
                    printed.update(sources(inner[-1]))
                    read(sources(inner[-1]), assigned)
                    return assigned
                callee = next((callees[r['id']] for r in refs if callees.get(r['id'])), None)
                if callee:
                    formals = [p for p in children(callee) if p.get('kind') == 'ParmVarDecl']
                    arguments = {p['id']: arg for p, arg in zip(formals, inner[1:])}
                    for p in formals:
                        arg = arguments.get(p['id'], {})
                        if not any(c in p['type']['qualType'] for c in '&*'):
                            visit(arg, assigned)
                        else:
                            address(arg, assigned)

                    def translate(key):
                        ident, part = key
                        if ident not in arguments:
                            return {key}
                        targets = location(arguments[ident])
                        return {(i, index if index is not None else part) for i, index in targets}

                    summary = summaries.get(callee['id'], {})
                    for key in summary.get('reads', set()):
                        read(translate(key), assigned)
                    for key in summary.get('writes', set()):
                        writes.update(translate(key))
                    for key in summary.get('definite', set()):
                        assigned.update(translate(key))
                    for field, destination in [('inputs', inputs), ('outputs', outputs)]:
                        for key in summary.get(field, set()):
                            if key[0] in arguments and field == 'outputs':
                                destination.update(sources(arguments[key[0]]))
                                printed.update(sources(arguments[key[0]]))
                            else:
                                destination.update(translate(key))
                                if field == 'outputs':
                                    printed.update(translate(key))
                    return assigned
            if kind == 'ImplicitCastExpr' and node.get('castKind') == 'LValueToRValue':
                read(location(inner[0]), assigned)
            if kind == 'DeclRefExpr':
                read(location(node), assigned)
            for c in inner + node.get('array_filler', []):
                visit(c, assigned)
            return assigned

        def nontarget(node):
            return not any(c in node['type']['qualType'] for c in '&*')

        def address(node, assigned):
            if node.get('kind') == 'ArraySubscriptExpr':
                visit(children(node)[1], assigned)
            elif len(children(node)) == 1:
                address(children(node)[0], assigned)

        body = next(n for n in children(function) if n.get('kind') == 'CompoundStmt')
        final = visit(body, set())
        if final is not None:
            exits.append(final)
        definite = set.intersection(*exits) if exits else set()
        mutable = {p['id'] for p in params if '&' in p['type']['qualType'] or '*' in p['type']['qualType']}
        # L'assegnazione del puntatore passato per valore non modifica il chiamante.
        def transferable(key):
            ident, part = key
            return ident in globals_ or ident in mutable and ('&' in declarations[ident]['type']['qualType'] or part is not None)

        summary = {
            'reads': {k for k in reads if k[0] in external},
            'writes': {k for k in writes if transferable(k)},
            'definite': {k for k in definite if transferable(k)},
            'inputs': {k for k in inputs if transferable(k)},
            'outputs': {k for k in printed if transferable(k) or k in reads and k[0] in param_ids}
                       | {k for k in outputs if k[0] in globals_},
        }
        roles = {}
        for ident, declaration in declarations.items():
            if ident in param_ids:
                incoming = any(k[0] == ident for k in reads)
                outgoing = any(k[0] == ident and transferable(k) for k in writes)
            else:
                incoming = any(k[0] == ident for k in inputs)
                outgoing = any(k[0] == ident for k in outputs)
            roles[ident] = 'inout' if incoming and outgoing else 'input' if incoming else 'output' if outgoing else 'work'
        return summary, roles

    # Stabilizzare prima le scritture certe evita letture iniziali spurie nei cicli ricorsivi.
    for phase in range(2):
        if phase:
            summaries = {ident: {**summary, 'reads': set(), 'inputs': set(), 'outputs': set()}
                         for ident, summary in summaries.items()}
        for _ in range(2 * len(definitions) + 2):
            updated = {f['id']: analyze(f)[0] for f in definitions.values()}
            if updated == summaries:
                break
            summaries = updated
    result = {n['loc']['offset']: 'work' for n in declarations.values()}
    global_roles = {key: set() for key in globals_}
    for function in definitions.values():
        summary, roles = analyze(function)
        local_ids = {n['id'] for n in nodes(function) if n.get('kind') in {'VarDecl', 'ParmVarDecl'}}
        for ident in local_ids:
            result[declarations[ident]['loc']['offset']] = roles[ident]
        for field in ['inputs', 'outputs']:
            for ident, _ in summary[field]:
                if ident in global_roles:
                    global_roles[ident].add(field)
    for ident, flags in global_roles.items():
        result[declarations[ident]['loc']['offset']] = 'inout' if len(flags) == 2 else 'input' if 'inputs' in flags else 'output' if flags else 'work'
    return result
