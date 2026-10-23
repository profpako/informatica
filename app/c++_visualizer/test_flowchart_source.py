import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from engine import ROOT, CodeError, run_program
from flowchart_import import resolve_flowchart_source


def generated(body, functions=None):
    document = {'format':'dentro-il-codice-flowchart','version':3,'functions':[
        {'id':'main','name':'main','returnType':'int','params':[],'body':body}, *(functions or [])]}
    for index, node in enumerate(body):
        node.setdefault('id', 'node'+str(index))
    result = subprocess.run(['node','-e','const C=require("./flowchart-core.js");process.stdout.write(JSON.stringify(C.generate(JSON.parse(require("fs").readFileSync(0,"utf8")))));'],
                            input=json.dumps(document),cwd=ROOT,capture_output=True,text=True,check=True)
    return json.loads(result.stdout)


class FlowchartSourceTests(unittest.TestCase):
    def test_concrete_types_promotions_and_no_main_return(self):
        result = generated([{'kind':'assign','expression':'i = 0\nprezzo = 2.5\nfrazione = 2.5f\nc = \'A\'\nok = true\nnome = "Ada"\nsomma = c + i\nmisto = frazione + i\nrapporto = i / 2\nreale = i / 2.0'}])
        source = resolve_flowchart_source(result['code'])
        for declaration in ['int i = 0;', 'double prezzo = 2.5;', 'float frazione = 2.5f;', "char c = 'A';", 'bool ok = true;', 'string nome = "Ada";', 'int somma = c + i;', 'float misto = frazione + i;', 'int rapporto = i / 2;', 'double reale = i / 2.0;']:
            self.assertIn(declaration, source)
        for technical in ['decay_t','decltype','type_traits','return 0;','string("Ada")']:
            self.assertNotIn(technical, source)
        self.assertEqual(source.count('\n'), result['code'].count('\n'))
        self.assertIn('#include <string>', source)
        self.assertNotIn('#include <iostream>', source)
        self.assertNotIn('#include <iomanip>', source)

    def test_loop_counter_and_native_output_compile_without_extra_headers(self):
        result = generated([{'kind':'for','init':'i = 0','condition':'i < 3','update':'i = i + 1','body':[
            {'id':'print','kind':'output','expression':'i','ending':'OUTLN'}]}])
        source = resolve_flowchart_source(result['code'])
        self.assertIn('int i;', source)
        self.assertEqual([line for line in source.splitlines() if line.startswith('#include')], ['#include <iostream>'])
        self.assertNotIn('return 0;', source)
        with tempfile.TemporaryDirectory(dir='/private/tmp') as folder:
            path = Path(folder)/'lezione.cpp'; executable = Path(folder)/'programma'
            path.write_text(source)
            subprocess.run([shutil.which('clang++'),'-std=c++17','-pedantic-errors',str(path),'-o',str(executable)],check=True,capture_output=True,text=True)
            output = subprocess.run([str(executable)],check=True,capture_output=True,text=True).stdout
        self.assertEqual(output,'0\n1\n2\n')
        observed = run_program(source, flow=result['flow'])
        self.assertEqual(observed['steps'][-1]['output'], output)
        self.assertTrue(all(result['lineMap'][step['line']] for step in observed['steps']))

    def test_explicit_return_is_preserved_and_strings_do_not_add_headers(self):
        result = generated([{'kind':'return','expression':'0'}])
        self.assertIn('return 0;', result['code'])
        self.assertNotIn('#include', result['code'])
        result = generated([{'kind':'output','expression':'"string setw setprecision"','ending':'OUTLN'}])
        self.assertEqual([line for line in result['code'].splitlines() if line.startswith('#include')], ['#include <iostream>'])
        result = generated([{'kind':'output','expression':'setprecision(2)\n2.345','ending':'OUTLN'}])
        self.assertEqual([line for line in result['code'].splitlines() if line.startswith('#include')], ['#include <iostream>','#include <iomanip>'])

    def test_pointer_and_function_call_types_keep_native_semantics(self):
        fn = {'id':'fn','name':'prossimo','returnType':'int','params':[{'name':'n','type':'int','mode':'reference'}],
              'body':[{'id':'increment','kind':'assign','expression':'n = n + 1'},{'id':'ret','kind':'return','expression':'n'}]}
        result = generated([{'kind':'assign','expression':'n = 0\np = &n\nvalore = prossimo(n)'},
                            {'kind':'output','expression':'n\n" "\nvalore','ending':'OUTLN'}],[fn])
        source = resolve_flowchart_source(result['code'])
        self.assertIn('int * p = &n;', source)
        self.assertIn('int valore = prossimo(n);', source)
        observed = run_program(source, flow=result['flow'])
        self.assertEqual(observed['error'], '')
        self.assertEqual(observed['steps'][-1]['output'], '1 1\n')
        self.assertEqual(sum(s['event']=='chiamata a prossimo' for s in observed['steps']),1)

    def test_invalid_expression_reports_line_without_internal_declaration(self):
        result = generated([{'kind':'assign','expression':'n = sconosciuta + 1'}])
        with self.assertRaises(CodeError) as error:
            resolve_flowchart_source(result['code'])
        self.assertIn('Riga', str(error.exception))
        self.assertIn('sconosciuta', str(error.exception))
        self.assertNotIn('decay_t', str(error.exception))


if __name__ == '__main__':
    unittest.main()
