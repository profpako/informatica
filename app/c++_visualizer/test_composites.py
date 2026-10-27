"""Matrici e aggregati C++: valori, identità e controlli delle singole celle."""
import unittest

from engine import CodeError, run_program


def source(body, declarations=''):
    return '#include <iostream>\n#include <string>\nusing namespace std;\n' + declarations + '\nint main(){' + body + '}'


def memory(result, name):
    return next(v for s in reversed(result['steps']) for v in s['variables'] if v['name'] == name)


class CompositeTests(unittest.TestCase):
    def run_cpp(self, body, declarations='', inputs='', **options):
        result = run_program(source(body, declarations), inputs, **options)
        self.assertEqual(result['error'], '')
        return result

    def test_matrix_shape_partial_initialization_and_changes(self):
        result = self.run_cpp('int m[][3]={{1},{2,3}};m[1][2]=8;cout<<m[1][2];')
        matrix = memory(result, 'm')
        self.assertEqual(matrix['dimensions'], [2, 3])
        self.assertEqual([c['path'] for c in matrix['cells']], ['[0][0]', '[0][1]', '[0][2]', '[1][0]', '[1][1]', '[1][2]'])
        self.assertEqual([c['value'] for c in matrix['cells']], [1, 0, 0, 2, 3, 8])
        self.assertEqual(len({c['address'] for c in matrix['cells']}), 6)
        self.assertEqual(result['steps'][-1]['output'], '8')

    def test_single_column_and_const_matrix_parameter(self):
        result = self.run_cpp('int m[2][1]={{1},{2}};m[1][0]=8;cout<<f(m);',
                             'int f(const int m[][1]){return m[1][0];}')
        self.assertEqual(result['steps'][-1]['output'], '8')

    def test_requested_large_matrix(self):
        result = self.run_cpp('int a[100][50];a[99][49]=7;cout<<a[99][49];')
        cells = memory(result, 'a')['cells']
        self.assertEqual(len(cells), 5000)
        self.assertFalse(cells[0]['initialized'])
        self.assertEqual(cells[-1]['value'], 7)

    def test_large_trace_stops_with_a_diagnostic(self):
        result = run_program(source('int a[100][50]={};int i=0;while(i<100){i++;}'))
        self.assertIn('Traccia troppo grande', result['error'])
        self.assertLess(len(result['steps']), 100)
        oversized = run_program(source('', 'struct P{int a[100];};P p[51];'))
        self.assertIn('5.000 celle', oversized['error'])

    def test_manual_input_in_struct_and_matrix(self):
        requests = []
        answers = iter(('4', '6'))
        def answer(result):
            requests.append(result['steps'][-1]['inputRequest']['target'])
            return next(answers)
        result = self.run_cpp('P p;int m[2][3];cin>>p.x>>m[1][2];cout<<p.x+m[1][2];',
                             'struct P{int x;};', interactive=answer)
        self.assertEqual(requests, ['p.x', 'm[1][2]'])
        self.assertEqual(result['steps'][-1]['output'], '10')

    def test_matrix_parameters_references_and_origins(self):
        result = self.run_cpp('int m[2][3]={};f(m);g(m[1][2]);int (&r)[2][3]=m;r[0][1]=4;cout<<m[1][2]<<m[0][1];',
                             'void f(int m[][3]){m[1][2]=8;}void g(int &x){x++;}')
        self.assertEqual(result['steps'][-1]['output'], '94')
        original = memory(result, 'm')
        parameter = memory(result, 'x')
        self.assertEqual(parameter['origin']['sourceIndex'], 5)
        self.assertEqual(parameter['cells'][0]['address'], original['cells'][5]['address'])
        self.assertEqual(memory(result, 'r')['cells'], original['cells'])

    def test_struct_nested_arrays_strings_defaults_and_input(self):
        result = self.run_cpp('S s;cin>>s.p.x>>s.a[1];s.name="Ada";cout<<s.name<<s.p.x<<s.a[1]<<s.p.y;',
                             'struct P{int x;int y=7;};struct S{P p;int a[2];string name;};', '2 8')
        fields = {c['path']: c for c in memory(result, 's')['cells']}
        self.assertEqual(fields['.p.x']['value'], 2)
        self.assertEqual(fields['.p.y']['value'], 7)
        self.assertFalse(fields['.a[0]']['initialized'])
        self.assertEqual(fields['.a[1]']['value'], 8)
        self.assertEqual(fields['.name']['value'], 'Ada')
        self.assertEqual(result['steps'][-1]['output'], 'Ada287')
        self.assertEqual(memory(result, 's')['role'], 'inout')

    def test_struct_copy_reference_pointer_array_and_return(self):
        result = self.run_cpp('P a[2]={{1,2},{3,4}};P b=a[1];f(b,a[0],&a[1]);P c=make();b=c;cout<<a[0].x<<a[1].y<<b.x;',
                             'struct P{int x,y;};void f(P v,P &r,P *p){v.x=99;r.x=5;p->y=8;}P make(){P p{6,7};return p;}')
        self.assertEqual(result['steps'][-1]['output'], '586')
        a = memory(result, 'a')
        ref = memory(result, 'r')
        self.assertEqual(ref['cells'][0]['address'], a['cells'][0]['address'])
        self.assertEqual(memory(result, 'v')['origin']['kind'], 'value')
        self.assertNotEqual(memory(result, 'v')['cells'][0]['address'], memory(result, 'b')['cells'][0]['address'])
        self.assertEqual([c['path'] for c in a['cells']], ['[0].x', '[0].y', '[1].x', '[1].y'])
        copy = memory(result, 'v')
        self.assertEqual(copy['origin']['value'], {'.x': 3, '.y': 4})

    def test_struct_and_matrix_row_origins(self):
        result = self.run_cpp('P a[2]={{1,2},{3,4}};f(a[1]);int m[2][3]={};g(m[1]);',
                             'struct P{int x,y;};void f(P &p){p.x++;}void g(int r[]){r[0]=9;}')
        self.assertEqual(memory(result, 'p')['origin']['sourceIndex'], 2)
        self.assertEqual(memory(result, 'r')['origin']['sourceIndex'], 3)

    def test_struct_default_constructed_array_and_globals(self):
        result = self.run_cpp('P a[2];a[1].x=4;P z{};cout<<z.x<<a[1].x<<g.y;', 'struct P{int x;int y=3;};P g;')
        self.assertFalse(memory(result, 'a')['cells'][0]['initialized'])
        self.assertEqual(memory(result, 'a')['cells'][1]['value'], 3)
        self.assertEqual(memory(result, 'g')['cells'][0]['value'], 0)
        inline = self.run_cpp('cout<<g.x;', 'struct P{int x=7;} g;')
        self.assertEqual(inline['steps'][-1]['output'], '7')

    def test_struct_designated_initializers(self):
        for standard in ('20', '23'):
            result = self.run_cpp('P p{.y=9};cout<<p.x<<p.y;', 'struct P{int x;int y;};', standard=standard)
            self.assertEqual(result['steps'][-1]['output'], '09')

    def test_pointer_field_and_field_alias(self):
        result = self.run_cpp('int x=2;P p{&x};int &r=x;*p.ptr=5;cout<<r;', 'struct P{int *ptr;};')
        self.assertTrue(memory(result, 'p')['cells'][0]['pointer'])
        self.assertEqual(result['steps'][-1]['output'], '5')

    def test_uninitialized_fields_and_copies_are_rejected(self):
        for body in ('P p;p.x=2;cout<<p.y;', 'P p;P q=p;', 'P p;P q{};q=p;',
                     'P a[2];cout<<a[0].x;', 'P p;f(p);'):
            with self.subTest(body=body):
                result = run_program(source(body, 'struct P{int x,y;};void f(P p){}'))
                self.assertIn('non inizializzata', result['error'])

    def test_matrix_bounds_both_dimensions_and_parameter(self):
        for body in ('cout<<m[2][0];', 'cout<<m[0][3];', 'cout<<m[-1][0];', 'cout<<m[1][-1];', 'f(m);'):
            with self.subTest(body=body):
                result = run_program(source('int m[2][3]={};' + body, 'void f(int m[][3]){m[0][3]=1;}'))
                self.assertIn('fuori dai limiti', result['error'])
        result = run_program(source('int m[2][1]={};cout<<m[0][1];'))
        self.assertIn('fuori dai limiti', result['error'])

    def test_matrix_uninitialized_and_null_struct_pointer(self):
        for body, declarations, message in (
            ('int m[2][3];m[0][0]=1;cout<<m[1][0];', '', 'non inizializzata'),
            ('P *p=nullptr;cout<<p->x;', 'struct P{int x;};', 'nullptr')):
            self.assertIn(message, run_program(source(body, declarations))['error'])

    def test_unsupported_records_and_sizes_have_diagnostics(self):
        for declarations, body in (
            ('struct P{void f(){}};', ''), ('union P{int x;double y;};', ''),
            ('class P{int x;};', ''), ('struct P{int &x;};', ''),
            ('', 'struct P{int x;};P p;'), ('', 'int m[100][100];'), ('', 'int m[2][2][2];')):
            with self.subTest(declarations=declarations, body=body), self.assertRaises(CodeError):
                run_program(source(body, declarations))


if __name__ == '__main__':
    unittest.main()
