import unittest
from engine import CodeError, run_program, standard_flag, walk
from flowchart_import import parse_cpp, resolve_flowchart_source
import interactive

FEATURE = '#include <iostream>\n#include <type_traits>\nint main(){bool prima=std::is_same_v<decltype(u8\'a\'),char>;std::cout<<prima;}'


class StandardsTests(unittest.TestCase):
    def tearDown(self):
        interactive.close_all()

    def test_runtime_uses_selected_standard(self):
        for standard, output in [('17', '1'), ('20', '0'), ('23', '0')]:
            with self.subTest(standard=standard):
                result = run_program(FEATURE, standard=standard)
                self.assertFalse(result['error'])
                self.assertEqual(result['steps'][-1]['output'], output)

    def test_parser_and_type_resolution_use_selected_standard(self):
        for standard, expected in [('17', 'char'), ('20', 'char8_t'), ('23', 'char8_t')]:
            _, _, tree = parse_cpp("int main(){auto letter=u8'a';}", standard)
            letter = next(n for n in walk(tree) if n.get('kind') == 'VarDecl' and n.get('name') == 'letter')
            self.assertEqual(letter['type']['qualType'], expected)
        source = "int main(){std::decay_t<decltype(u8'a')> letter;}"
        self.assertIn('char letter;', resolve_flowchart_source(source, '17'))
        with self.assertRaisesRegex(CodeError, 'char8_t'):
            resolve_flowchart_source(source, '20')

    def test_manual_session_keeps_standard(self):
        code = FEATURE.replace('std::cout<<prima;', 'int n;std::cin>>n;std::cout<<prima<<n;')
        for standard, output in [('17', '17'), ('20', '07'), ('23', '07')]:
            current = interactive.start(code, standard=standard)
            request = current['steps'][-1]['inputRequest']
            final = interactive.answer(current['session'], request['number'], '7')
            self.assertEqual(final['steps'][-1]['output'], output)
            self.assertIsNone(final['session'])

    def test_untrusted_standard_is_rejected(self):
        for standard in [None, 20, True, [], '26', '20 -I/private', '-std=c++23']:
            with self.subTest(standard=standard), self.assertRaises(CodeError):
                standard_flag(standard)


if __name__ == '__main__':
    unittest.main()
