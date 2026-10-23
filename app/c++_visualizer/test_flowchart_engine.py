import json
import subprocess
import unittest

from engine import ROOT, run_program


class FlowchartEngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture = subprocess.run(['node', str(ROOT / 'test_flowchart.cjs'), '--fixture'],
                                 capture_output=True, text=True, timeout=10, check=True)
        cls.fixture = json.loads(fixture.stdout)

    def test_input_function_result_and_block_mapping(self):
        generated = self.fixture['generated']
        result = run_program(generated['code'], '4 6', generated['flow'])
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['console'], 'Inserisci base: 4\nInserisci altezza: 6\nArea: 24\n')
        fn = next(f for f in self.fixture['example']['functions'] if f['name'] == 'calcolaArea')
        call = next(s for s in result['steps'] if s['event'] == 'chiamata a calcolaArea')
        self.assertEqual(generated['lineMap'][call['line']]['fn'], fn['id'])
        self.assertEqual(generated['lineMap'][call['line']]['phase'], 'start')
        self.assertEqual([v['origin']['value'] for v in call['variables'] if v['parameter']], [4, 6])
        for step in result['steps']:
            self.assertIsNotNone(generated['lineMap'][step['line']])

    def test_pointer_procedure_uses_native_memory(self):
        result = run_program(self.fixture['pointer']['code'])
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['output'], '5\n')
        call = next(s for s in result['steps'] if s['event'] == 'chiamata a incrementa')
        param = next(v for v in call['variables'] if v['parameter'])
        self.assertEqual(param['origin']['kind'], 'address')
        self.assertEqual(result['steps'][-1]['lastCall']['name'], 'incrementa')

    def test_decisions_loops_and_control_mapping(self):
        generated = self.fixture['loops']
        result = run_program(generated['code'], flow=generated['flow'])
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['output'], '3\n3\n3\n')
        conditions = [s['condition'] for s in result['steps'] if s.get('condition')]
        self.assertEqual({c['kind'] for c in conditions}, {'for', 'while', 'do', 'if'})
        self.assertTrue(any(c['action'] == 'break' for c in conditions))
        self.assertTrue(any(c['action'] == 'continue' for c in conditions))
        for condition in conditions:
            self.assertIsNotNone(generated['lineMap'][condition['line']])

    def test_multiline_input_output_inference_and_stable_types(self):
        generated = self.fixture['automatic']
        result = run_program(generated['code'], '4 6 Ada', generated['flow'])
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['console'], '4\n6\nAda\nCiao Ada: 24\n')
        memory = next(s for s in reversed(result['steps']) if s['frames'])['variables']
        types = {v['name']:v['type'] for v in memory}
        self.assertEqual(types['base'],'double')
        self.assertEqual(types['altezza'],'int')
        self.assertEqual(types['contatore'],'int')
        self.assertEqual(types['prezzo'],'double')
        self.assertIn('string',types['saluto'])

    def test_branch_and_loop_variables_live_until_function_end(self):
        generated = self.fixture['scoped']
        result = run_program(generated['code'], '1', generated['flow'])
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['output'], '8 Fine 2\n')
        self.assertFalse(any(v['name']=='altro' for s in result['steps'] for v in s['variables']))
        condition = next(s for s in result['steps'] if s.get('condition'))
        self.assertFalse(any(v['name'] in {'numero','saluto','lavoro','i'} for v in condition['variables']))
        memory = next(s for s in reversed(result['steps']) if s['frames'])['variables']
        self.assertTrue({'numero','saluto','lavoro','i'} <= {v['name'] for v in memory})
        self.assertFalse(next(v for v in memory if v['name']=='lavoro')['cells'][0]['initialized'])
        self.assertFalse(any(generated['lineMap'][s['line']]['phase']=='prepare' for s in result['steps']))
        failed = run_program(generated['code'], '0', generated['flow'])
        self.assertIn('inizializzat', failed['error'])

    def test_explicit_array_and_implicit_counter(self):
        generated = self.fixture['array']
        result = run_program(generated['code'], flow=generated['flow'])
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['output'], '2 6\n')

    def test_flow_metadata_validation(self):
        from engine import CodeError
        for flow in [[],{}, {'deferred':[{'line':True}]}, {'deferred':[{'line':2,'activate':'x;'}]}]:
            with self.assertRaises(CodeError):
                run_program('int main(){}', flow=flow)

    def test_inference_does_not_execute_function_calls_twice(self):
        generated = self.fixture['calls']
        result = run_program(generated['code'], flow=generated['flow'])
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['output'], '2 1 2\n')
        self.assertEqual(sum(s['event']=='chiamata a prossimo' for s in result['steps']),2)

    def test_uncreated_string_cannot_be_read(self):
        generated = self.fixture['hiddenString']
        result = run_program(generated['code'], flow=generated['flow'])
        self.assertIn('inizializzat', result['error'])
        self.assertFalse(any(v['name']=='testo' for s in result['steps'] for v in s['variables']))

    def test_scoped_string_passed_by_reference_keeps_the_same_cell(self):
        generated = self.fixture['stringReference']
        result = run_program(generated['code'], flow=generated['flow'])
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['output'], 'Ciao!\n')
        call = next(s for s in result['steps'] if s['event']=='chiamata a modifica')
        source = next(v for v in call['variables'] if v['name']=='testo')
        param = next(v for v in call['variables'] if v['name']=='t')
        self.assertEqual(source['cells'][0]['address'],param['cells'][0]['address'])

    def test_string_and_integer_input_created_inside_a_branch(self):
        generated = self.fixture['nestedInput']
        result = run_program(generated['code'], 'Ada 7', generated['flow'])
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['console'], 'Ada\n7\nAda 7\n')


if __name__ == '__main__':
    unittest.main()
