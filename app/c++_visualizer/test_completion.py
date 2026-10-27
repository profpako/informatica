import shutil
import unittest

from engine import CodeError, complete_cpp, completion_items, completion_source


def suggestions(code, standard='17'):
    before, after = code.split('|')
    line = before.count('\n') + 1
    column = len(before.rsplit('\n', 1)[-1].encode()) + 1
    return complete_cpp(before + after, line, column, standard)['items']


class CompletionTests(unittest.TestCase):
    def test_position_survives_preparation_and_utf8(self):
        code = '#include <iostream>\nint valore;\nint main(){const char* s="Età 😀"; ::val}'
        column = len(code.rsplit('\n', 1)[-1].split('val}')[0].encode()) + 1
        prepared = completion_source(code, 3, column)
        self.assertEqual(prepared['line'], 8)
        self.assertEqual(prepared['source'].splitlines()[7].encode()[prepared['column'] - 1:], b'val}')
        collision = completion_source('int cppvizCompletionCursor;\nint main(){ }', 2, 13)
        self.assertIn('int cppvizCompletionCursor;', collision['source'])

    def test_invalid_positions_and_directives(self):
        for code, line, column in [(None, 1, 1), ('int x;', True, 1), ('x', 0, 1), ('x', 2, 1),
                                   ('x', 1, -1), ('x', 1, 3), ('à', 1, 2)]:
            with self.assertRaises(CodeError):
                completion_source(code, line, column)
        with self.assertRaises(CodeError):
            completion_source('#include "/etc/passwd"\n', 2, 1)

    def test_compiler_output(self):
        items = completion_items('COMPLETION: totale : [#int#]totale\n'
                                 'COMPLETION: totale : [#long#]totale\n'
                                 'COMPLETION: calcola : [#double#]calcola(<#int n#>)\n'
                                 'COMPLETION: Pattern : return <#expression#>;\n'
                                 'COMPLETION: int\nCOMPLETION: _locale : [#int#]_locale\nCOMPLETION: __cv_user\nCOMPLETION: cv\n')
        self.assertEqual([item['text'] for item in items], ['totale', 'calcola', 'return', 'int', '_locale'])
        self.assertEqual(items[1]['displayText'], 'double calcola(int n)')

    @unittest.skipUnless(shutil.which('clang++'), 'clang++ non disponibile')
    def test_scope_and_types(self):
        items = suggestions('struct Punto{int x;}; int globale;\nvoid altra(){int nascosta;}\n'
                            'int main(int parametro){int visibile;{int scaduta;} | int futura;}')
        names = {item['text'] for item in items}
        self.assertTrue({'Punto', 'globale', 'parametro', 'visibile', 'int', 'return'} <= names)
        self.assertTrue({'nascosta', 'scaduta', 'futura'}.isdisjoint(names))
        self.assertEqual(next(item['displayText'] for item in items if item['text'] == 'visibile'), 'int visibile')

    @unittest.skipUnless(shutil.which('clang++'), 'clang++ non disponibile')
    def test_members_array_and_pointer(self):
        for expression in ['punti[1][2].', 'p->']:
            items = suggestions('struct P{int ascissa;double ordinata;};int main(){'
                                'P punti[2][3];P *p;int estranea;' + expression + '|}')
            names = {item['text'] for item in items}
            self.assertTrue({'ascissa', 'ordinata'} <= names)
            self.assertTrue({'estranea', 'punti', 'int'}.isdisjoint(names))

    @unittest.skipUnless(shutil.which('clang++'), 'clang++ non disponibile')
    def test_namespace_unicode_and_standard(self):
        items = suggestions('int totale;int main(){const char*s="Età 😀";::|}')
        self.assertIn('totale', {item['text'] for item in items})
        for standard in ['17', '20', '23']:
            items = suggestions('int main(){|}', standard)
            self.assertEqual('char8_t' in {item['text'] for item in items}, standard != '17')


if __name__ == '__main__':
    unittest.main()
