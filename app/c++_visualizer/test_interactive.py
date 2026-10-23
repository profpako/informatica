import unittest

from engine import CodeError
import interactive


class InteractiveTests(unittest.TestCase):
    def tearDown(self):
        interactive.close_all()

    def test_pause_per_variable_chained_input_and_addresses(self):
        code = '#include <iostream>\nusing namespace std;\nint main(){int b,h;cout<<"Base e altezza: ";cin>>b>>h;cout<<"Area: "<<b*h<<endl;}'
        first = interactive.start(code)
        self.assertFalse(first['error'])
        request = first['steps'][-1]['inputRequest']
        self.assertEqual(request['target'], 'b')
        self.assertEqual(first['steps'][-1]['console'], 'Base e altezza: ')
        address = first['steps'][-1]['variables'][0]['cells'][0]['address']
        ident = first['session']
        second = interactive.answer(ident, request['number'], '4')
        request = second['steps'][-1]['inputRequest']
        self.assertEqual(request['target'], 'h')
        self.assertEqual(second['steps'][-1]['console'], 'Base e altezza: 4\n')
        self.assertEqual(second['steps'][-1]['variables'][0]['cells'][0]['address'], address)
        self.assertEqual(second['steps'][:len(first['steps'])], first['steps'])
        final = interactive.answer(ident, request['number'], '6')
        self.assertIsNone(final['session'])
        self.assertEqual(final['steps'][-1]['console'], 'Base e altezza: 4\n6\nArea: 24\n')
        self.assertEqual(final['error'], '')

    def test_invalid_input_retries_same_variable_then_getline(self):
        code = '#include <iostream>\n#include <string>\nusing namespace std;int main(){int n;string s;cin>>n;cin.ignore();getline(cin,s);cout<<n<<":"<<s;}'
        current = interactive.start(code)
        ident = current['session']
        request = current['steps'][-1]['inputRequest']
        for value in ['abc', '4 6']:
            current = interactive.answer(ident, request['number'], value)
            request = current['steps'][-1]['inputRequest']
            self.assertEqual(request['target'], 'n')
            self.assertIn('non valido', request['error'])
        current = interactive.answer(ident, request['number'], '7')
        request = current['steps'][-1]['inputRequest']
        self.assertEqual(request['target'], 's')
        self.assertFalse(request['formatted'])
        final = interactive.answer(ident, request['number'], 'Ada Lovelace')
        self.assertEqual(final['steps'][-1]['output'], '7:Ada Lovelace')
        self.assertEqual(final['error'], '')

    def test_array_loop_calls_and_stale_request(self):
        code = '#include <iostream>\nusing namespace std;void leggi(int &n){cin>>n;} int main(){int v[2];for(int i=0;i<2;i++){leggi(v[i]);}cout<<v[0]+v[1];}'
        current = interactive.start(code)
        ident = current['session']
        for value in ['2','3']:
            request = current['steps'][-1]['inputRequest']
            self.assertEqual(request['target'], 'n')
            with self.assertRaises(CodeError):
                interactive.answer(ident, request['number']+1, '5')
            current = interactive.answer(ident, request['number'], value)
        self.assertEqual(current['steps'][-1]['output'], '5')
        self.assertTrue(any(s['lastCall'] for s in current['steps']))
        self.assertIsNone(current['session'])

    def test_cancel_and_input_limits(self):
        current = interactive.start('int main(){int n;std::cin>>n;}')
        ident = current['session']; session = interactive.sessions[ident]
        for value in ['a\nb', 'a'*2001, None]:
            with self.assertRaises(CodeError):
                interactive.answer(ident, current['steps'][-1]['inputRequest']['number'], value)
        interactive.cancel(ident); session.thread.join(timeout=3)
        self.assertFalse(session.thread.is_alive())
        self.assertNotIn(ident, interactive.sessions)
        with self.assertRaises(CodeError):
            interactive.answer(ident, 1, '1')

    def test_no_input_finishes_and_empty_getline_is_valid(self):
        result = interactive.start('int main(){std::cout<<42;}')
        self.assertIsNone(result['session'])
        self.assertEqual(result['steps'][-1]['output'], '42')
        current = interactive.start('int main(){std::string s;std::getline(std::cin,s);std::cout<<s<<"!";}')
        final = interactive.answer(current['session'], current['steps'][-1]['inputRequest']['number'], '')
        self.assertEqual(final['steps'][-1]['output'], '!')
        self.assertEqual(final['error'], '')


if __name__ == '__main__':
    unittest.main()
