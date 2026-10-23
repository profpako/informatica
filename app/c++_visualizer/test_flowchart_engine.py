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
        result = run_program(generated['code'], '4 6')
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
        result = run_program(generated['code'])
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['output'], '3\n3\n3\n')
        conditions = [s['condition'] for s in result['steps'] if s.get('condition')]
        self.assertEqual({c['kind'] for c in conditions}, {'for', 'while', 'do', 'if'})
        self.assertTrue(any(c['action'] == 'break' for c in conditions))
        self.assertTrue(any(c['action'] == 'continue' for c in conditions))
        for condition in conditions:
            self.assertIsNotNone(generated['lineMap'][condition['line']])


if __name__ == '__main__':
    unittest.main()
