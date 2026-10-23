"""Prove del riuso del motore: la toolchain WASM viene verificata nel browser."""
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import engine
import flowchart_import
native_parse = flowchart_import.parse_cpp
import browser_bridge as bridge


def call(operation, data):
    for _ in range(5):
        result = json.loads(bridge.browser_call(operation, json.dumps(data)))
        if 'parse' not in result:
            return result
        _, _, tree = native_parse(result['parse'], data.get('standard', '17'))
        bridge._asts[(data.get('standard', '17'), result['parse'])] = tree
    raise AssertionError('Troppi passaggi di analisi')


class BrowserBridgeTests(unittest.TestCase):
    def setUp(self):
        bridge._asts.clear()

    def test_instrumentation_matches_local_engine(self):
        code = '#include <iostream>\nusing namespace std;\nvoid f(int &a,int *p){a++;*p+=2;}\nint main(){int a=1,b=3; f(a,&b);cout<<a<<b;}'
        source, prefix, tree = native_parse(code)
        expected = engine.Instrumenter(source, prefix, tree).build()
        self.assertEqual(call('instrument', {'code': code})['code'], expected)

    def test_import_and_type_resolution(self):
        code = '#include <iostream>\nint main(){int i=0;while(i<2){i++;}std::cout<<i;}'
        document = call('import', {'code': code})['document']
        self.assertEqual([n['kind'] for n in document['functions'][0]['body']], ['declare', 'while', 'output'])
        inferred = 'int main(){std::decay_t<decltype(0)> i; i=1;}'
        self.assertIn('int i;', call('source', {'code': inferred})['code'])

    def test_validation_is_preserved(self):
        with self.assertRaises(engine.CodeError):
            call('instrument', {'code': 'int main(){}', 'flow': {'deferred': [{'line': True}]}})
        with self.assertRaises(engine.CodeError):
            call('instrument', {'code': 'int main(){int *p = new int;}'})


if __name__ == '__main__':
    unittest.main()
