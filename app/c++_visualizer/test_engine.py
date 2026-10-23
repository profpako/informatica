import unittest
import json
from pathlib import Path
import subprocess
import tempfile
from engine import CodeError, ROOT, run_program, sandbox_profile


def program(body, functions="", inputs=""):
    return run_program('#include <iostream>\n#include <string>\n#include <iomanip>\nusing namespace std;\n' + functions + '\nint main(){\n' + body + '\nreturn 0;\n}', inputs)


class EngineTests(unittest.TestCase):
    def test_condition_values_and_final_false(self):
        result = program('for(int i=0;i<3;i++){cout<<i;}')
        self.assertEqual(result['error'], '')
        tests = [s['condition'] for s in result['steps'] if s.get('condition')]
        self.assertEqual([c['expanded'] for c in tests], ['0<3', '1<3', '2<3', '3<3'])
        self.assertEqual([c['result'] for c in tests], [True, True, True, False])
        self.assertEqual([c['number'] for c in tests], [1, 2, 3, 4])
        self.assertTrue(all(c['kind'] == 'for' for c in tests))

    def test_condition_single_evaluation_short_circuit_and_do_while(self):
        result = program('int i=0;while(i++<2){}cout<<i;int n;'
                         'if(false&&n>0)cout<<99;do{i--;}while(i>1);while(false){cout<<99;}cout<<i;')
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['output'], '31')
        tests = [s['condition'] for s in result['steps'] if s.get('condition')]
        self.assertEqual([c['expanded'] for c in tests[:3]], ['0<2', '1<2', '2<2'])
        self.assertEqual(tests[3]['values'], [])
        self.assertEqual([c['expanded'] for c in tests if c['kind'] == 'do'], ['2>1', '1>1'])
        self.assertFalse(tests[-1]['result'])

    def test_condition_break_continue_switch_and_nested_loops(self):
        result = program('for(int i=0;i<3;i++){switch(i){case 0:break;default:break;}'
                         'if(i==0)continue;while(true){break;}break;}')
        self.assertEqual(result['error'], '')
        jumps = [s['condition'] for s in result['steps'] if s.get('condition') and s['condition']['action'] != 'test']
        self.assertEqual([(c['kind'], c['action']) for c in jumps], [('for', 'continue'), ('while', 'break'), ('for', 'break')])
        self.assertTrue(all(c['result'] is None for c in jumps))

    def test_condition_nested_calls_and_array_read_values(self):
        result = program('int v[2]={1,2};int i=0;if(v[i++]>0&&controlla(i))cout<<i;',
                         'bool controlla(int n){if(n>0)return true;return false;}')
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['output'], '1')
        tests = [s['condition'] for s in result['steps'] if s.get('condition')]
        self.assertEqual(len(tests), 2)
        self.assertEqual(tests[0]['expanded'], '1>0')
        self.assertIn('1>0&&controlla(1)', tests[1]['expanded'])
        self.assertNotEqual(tests[0]['frame'], tests[1]['frame'])

    def test_condition_prefix_increment_character_and_utf8_offsets(self):
        result = program('int i=0;cout<<"Età: ";while(++i<2){}char c=\'a\';if(c==\'a\')cout<<i;')
        self.assertEqual(result['error'], '')
        tests = [s['condition'] for s in result['steps'] if s.get('condition')]
        self.assertEqual([c['expanded'] for c in tests], ['1<2', '2<2', "'a'=='a'"])
        self.assertEqual(result['steps'][-1]['output'], 'Età: 2')

    def test_last_completed_call_uses_final_locals_and_excludes_static(self):
        result = program('int x=1;esterna(x);x=20;esterna(x);',
                         'void interna(int &r){r+=2;}void esterna(int &r){static int conteggio=0;conteggio++;'
                         'int locale=r;{int scaduta=99;}interna(r);locale=r;}')
        self.assertEqual(result['error'], '')
        self.assertIsNone(result['steps'][0]['lastCall'])
        exits = [s for s in result['steps'] if s['event'] == 'uscita da esterna']
        self.assertEqual(len(exits), 2)
        for exit_step, expected in zip(exits, [3, 22]):
            record = exit_step['lastCall']
            self.assertEqual(record['name'], 'esterna')
            photo = result['steps'][record['step']]
            locals_ = [v for v in photo['variables'] if v['frame'] == record['frame']]
            self.assertEqual({v['name'] for v in locals_}, {'r', 'locale'})
            self.assertEqual(next(v for v in locals_ if v['name'] == 'locale')['cells'][0]['value'], expected)
            self.assertFalse(any(f['id'] == record['frame'] for f in exit_step['frames']))
            self.assertTrue(any(v['name'] == 'esterna::conteggio' for v in exit_step['variables']))
        self.assertNotEqual(exits[0]['lastCall']['frame'], exits[1]['lastCall']['frame'])
        self.assertEqual(result['steps'][-1]['lastCall'], exits[-1]['lastCall'])

    def test_parameter_copy_origins_and_pointer_targets(self):
        result = program('int x=5;int *q=&x;copia(x);punta(q);riferisci(x);cout<<x;',
                         'void copia(int a){a+=10;}void punta(int *p){*p+=1;p=nullptr;}void riferisci(int &r){r+=2;}')
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['output'], '8')
        call = next(s for s in result['steps'] if s['event'] == 'chiamata a copia')
        x = next(v for v in call['variables'] if v['name'] == 'x')
        a = next(v for v in call['variables'] if v['name'] == 'a')
        self.assertEqual(a['origin']['kind'], 'value')
        self.assertEqual(a['origin']['sourceId'], x['id'])
        self.assertEqual(a['origin']['value'], 5)
        self.assertNotEqual(a['cells'][0]['address'], x['cells'][0]['address'])
        changed = next(v for s in result['steps'] for v in s['variables'] if v['name'] == 'a' and v['cells'][0]['value'] == 15)
        self.assertEqual(changed['origin']['value'], 5)
        pointer_call = next(s for s in result['steps'] if s['event'] == 'chiamata a punta')
        p = next(v for v in pointer_call['variables'] if v['name'] == 'p')
        q = next(v for v in pointer_call['variables'] if v['name'] == 'q')
        self.assertEqual(p['origin']['kind'], 'address')
        self.assertEqual(p['origin']['sourceId'], q['id'])
        self.assertEqual(p['origin']['value'], x['cells'][0]['address'])
        self.assertNotEqual(p['cells'][0]['address'], q['cells'][0]['address'])
        cleared = next(v for s in result['steps'] for v in s['variables'] if v['name'] == 'p' and v['cells'][0]['value'] == '0x0')
        self.assertEqual(cleared['origin']['value'], x['cells'][0]['address'])
        reference_call = next(s for s in result['steps'] if s['event'] == 'chiamata a riferisci')
        r = next(v for v in reference_call['variables'] if v['name'] == 'r')
        self.assertEqual(r['origin']['kind'], 'reference')
        self.assertEqual(r['origin']['sourceId'], x['id'])
        self.assertEqual(r['cells'][0]['address'], x['cells'][0]['address'])

    def test_origins_address_array_element_and_defaults(self):
        result = program('int x=4;int v[2]={2,3};punta(&x);array(v);leggi(v[1]);leggi();',
                         'void punta(int *p){*p=7;}void array(int a[]){a[0]=9;}int leggi(int n=5){return n;}')
        self.assertEqual(result['error'], '')
        calls = [s for s in result['steps'] if s['event'].startswith('chiamata a ') and s['event'] != 'chiamata a main']
        origins = [next(v['origin'] for v in s['variables'] if v['frame'] == s['frames'][-1]['id']) for s in calls]
        self.assertEqual(origins[0]['expression'], '&x')
        self.assertEqual(origins[0]['kind'], 'address')
        self.assertEqual(origins[1]['kind'], 'address')
        self.assertEqual(origins[2]['sourceIndex'], 1)
        self.assertEqual(origins[2]['value'], 3)
        self.assertEqual(origins[3]['expression'], 'argomento predefinito')
        self.assertEqual(origins[3]['value'], 5)
        self.assertIsNone(origins[3]['sourceId'])

    def test_origins_nested_calls_recursion_and_single_evaluation(self):
        result = program('int x=1;cout<<identita(identita(x++))<<x<<ricorsiva(2);',
                         'int identita(int n){return n;}int ricorsiva(int n){if(n<=0)return 0;return ricorsiva(n-1)+1;}')
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['output'], '122')
        calls = [s for s in result['steps'] if s['event'].startswith('chiamata a ') and len(s['frames']) > 1]
        for call in calls:
            frame = call['frames'][-1]
            param = next(v for v in call['variables'] if v['frame'] == frame['id'])
            self.assertEqual(param['origin']['caller'], call['frames'][-2]['id'])
        identities = [s for s in calls if s['event'] == 'chiamata a identita']
        self.assertNotEqual(identities[0]['frames'][-1]['site'], identities[1]['frames'][-1]['site'])
        self.assertEqual(next(v['origin']['expression'] for v in identities[0]['variables'] if v['frame'] == identities[0]['frames'][-1]['id']), 'x++')

    def test_console_echo_separate_reads_from_same_input_line(self):
        body = 'int base,altezza;cout<<"Inserisci base: ";cin>>base;cout<<"Inserisci altezza: ";cin>>altezza;cout<<"L\'area è: "<<base*altezza;'
        for inputs in ['4 6', '4 6\n', '4\n6\n']:
            with self.subTest(inputs=inputs):
                result = program(body, inputs=inputs)
                self.assertEqual(result['error'], '')
                self.assertEqual(result['steps'][-1]['console'], "Inserisci base: 4\nInserisci altezza: 6\nL'area è: 24")
                self.assertEqual(result['steps'][-1]['output'], "Inserisci base: Inserisci altezza: L'area è: 24")

    def test_declaration_identity_and_parameter_metadata(self):
        result = program('int x=3,y=4;int v[2]={1,2};aggiorna(x,y,v);{int x=9;}conta(2);',
                         'void aggiorna(int &x,int y,int v[]){x+=y;v[0]=x;}void conta(int n){if(n>0)conta(n-1);}')
        self.assertEqual(result['error'], '')
        variables = [v for s in result['steps'] for v in s['variables']]
        xs = {v['declaration'] for v in variables if v['name'] == 'x'}
        self.assertEqual(len(xs), 3)
        main_xy = {v['declaration'] for v in variables if v['name'] in {'x', 'y'} and not v['parameter']}
        self.assertEqual(len(main_xy), 3)
        params = [v for v in variables if v['name'] == 'n']
        self.assertTrue(all(v['parameter'] for v in params))
        self.assertEqual(len({v['declaration'] for v in params}), 1)
        self.assertEqual(len({v['id'] for v in params}), 3)
        self.assertTrue(any(v['name'] == 'v' and v['array'] and not v['parameter'] for v in variables))
        self.assertTrue(any(v['name'] == 'v' and v['pointer'] and v['parameter'] for v in variables))
        call = next(s for s in result['steps'] if s['event'] == 'chiamata a aggiorna')
        self.assertEqual({v['name']: v['role'] for v in call['variables'] if v['parameter']},
                         {'x': 'inout', 'y': 'input', 'v': 'output'})
        for declaration in {v['declaration'] for v in variables}:
            self.assertEqual(len({v['role'] for v in variables if v['declaration'] == declaration}), 1)

    def test_console_echo_orders_prompts_input_and_output(self):
        result = program('int a,b;cout<<"Primo: ";cin>>a;cout<<"Secondo: ";cin>>b;cout<<"Somma: "<<a+b;', inputs='5\n10\n')
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['output'], 'Primo: Secondo: Somma: 15')
        self.assertEqual(result['steps'][-1]['console'], 'Primo: 5\nSecondo: 10\nSomma: 15')
        first = next(s for s in result['steps'] if s['inputConsumed'] == 1)
        self.assertEqual(first['console'], 'Primo: 5\n')
        self.assertTrue(any(s['console'] == 'Primo: ' and s['inputConsumed'] == 0 for s in result['steps']))

    def test_console_echo_same_line_getline_and_invalid_input(self):
        result = program('int n;cin>>n;cout<<n;', inputs='007')
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['console'], '007\n7')
        result = program('int a,b;cin>>a>>b;cout<<a+b;', inputs='5 10\n')
        self.assertEqual(result['steps'][-1]['console'], '5 10\n15')
        result = program('int eta;string nome;cout<<"Eta: ";cin>>eta;cin.ignore();cout<<"Nome: ";getline(cin,nome);cout<<nome;', inputs='17\n  Mario è qui\n')
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['console'], 'Eta: 17\nNome:   Mario è qui\n  Mario è qui')
        result = program('int n;cout<<"Numero: ";cin>>n;', inputs='abc\n')
        self.assertIn('Input', result['error'])
        self.assertEqual(result['steps'][-1]['console'], 'Numero: abc\n')

    def test_final_memory_source_excludes_expired_scopes(self):
        result = program('int n=5;int v[2]={1,2};modifica(n);{int temporanea=99;}v[1]=n;', 'void modifica(int &n){int locale=3;n+=locale;}')
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['event'], 'fine')
        self.assertEqual(result['steps'][-1]['frames'], [])
        last_main = next(s for s in reversed(result['steps']) if s['frames'] and s['frames'][-1]['name'] == 'main')
        self.assertEqual({v['name'] for v in last_main['variables']}, {'n', 'v'})
        self.assertEqual(next(v for v in last_main['variables'] if v['name'] == 'n')['cells'][0]['value'], 8)
        self.assertEqual(next(v for v in last_main['variables'] if v['name'] == 'v')['cells'][1]['value'], 8)

    def test_scalar_types_and_mixed_parameters(self):
        result = program("bool b=true;float f=1.25;char c='A';double d=2.5;cout<<b<<','<<f<<','<<c<<','<<d;"
                         "int valore=5;incrementa(valore,3);cout<<','<<valore;moltiplica(valore,2);cout<<','<<valore;",
                         'void incrementa(int &n,int incremento){n+=incremento;}void moltiplica(int &n,int fattore){n*=fattore;}')
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['output'], '1,1.25,A,2.5,8,16')

    def test_value_reference_and_alias(self):
        result = program('int x=5,y=10;errato(x,y);cout<<x<<","<<y<<";";corretto(x,y);cout<<x<<","<<y;',
                         'void errato(int a,int b){int t=a;a=b;b=t;}\nvoid corretto(int &a,int &b){int t=a;a=b;b=t;}')
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['output'], '5,10;10,5')
        call = next(s for s in result['steps'] if s['event'] == 'chiamata a corretto')
        x = next(v for v in call['variables'] if v['name'] == 'x')
        a = next(v for v in call['variables'] if v['name'] == 'a')
        self.assertTrue(a['reference'])
        self.assertEqual(x['cells'][0]['address'], a['cells'][0]['address'])
        self.assertNotEqual(x['frame'], a['frame'])

    def test_uninitialized_and_input(self):
        result = program('int numero; cin>>numero; cout<<numero;', inputs='17\n')
        states = [v['cells'][0] for s in result['steps'] for v in s['variables'] if v['name'] == 'numero']
        self.assertTrue(any(not c['initialized'] and c['value'] is None for c in states))
        self.assertTrue(any(c['initialized'] and c['value'] == 17 for c in states))
        self.assertEqual(result['steps'][-1]['output'], '17')
        self.assertEqual(result['steps'][-1]['inputConsumed'], 2)
        self.assertIn('non inizializzata', program('int n; cout<<n;')['error'])
        self.assertIn('non inizializzata', program('int a,b=a;cout<<b;')['error'])
        with self.assertRaises(CodeError):
            program('int n=n;')

    def test_array_loop_and_partial_init(self):
        result = program('const int N=5;int v[N]={1,2};for(int i=0;i<N;i++){v[i]+=1;}raddoppia(v,N);cout<<v[0]<<","<<v[4];',
                         'void raddoppia(int a[],int n){for(int i=0;i<n;i++)a[i]*=2;}')
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['output'], '4,2')
        initial = next(v for s in result['steps'] for v in s['variables'] if v['name'] == 'v')
        self.assertEqual([c['value'] for c in initial['cells']], [1, 2, 0, 0, 0])
        self.assertTrue(all(c['initialized'] for c in initial['cells']))

    def test_array_error_and_initialization(self):
        self.assertIn('fuori dai limiti', program('int v[2]={1,2};int i=2;cout<<v[i];')['error'])
        self.assertIn('non inizializzata', program('int v[2];v[0]=1;cout<<v[1];')['error'])

    def test_pointer_and_null(self):
        self.assertEqual(program('int a=4;int *p=&a;*p=7;cout<<a;')['steps'][-1]['output'], '7')
        self.assertIn('nullptr', program('int *p=nullptr;cout<<*p;')['error'])
        self.assertIn('attiva', program('int *p;{int n=3;p=&n;}cout<<*p;')['error'])

    def test_global_shadowing_static(self):
        result = program('conta();conta();int contatore=100;{int contatore=7;cout<<contatore<<",";}cout<<contatore<<","<<::contatore;',
                         'int contatore=0;void conta(){static int n=0;n++;contatore++;cout<<n<<",";}')
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['output'], '1,2,7,100,2')
        returned = next(s for s in reversed(result['steps']) if s['event'] == 'ritorno')
        self.assertEqual(sorted(v['cells'][0]['value'] for v in returned['variables'] if v['name'] == 'contatore'), [2, 100])

    def test_overload_defaults_recursion(self):
        result = program('cout<<somma(2,3)<<","<<somma(1.5,2.0)<<","<<calcola(5)<<","<<fatt(5);',
                         'int somma(int,int);double somma(double,double);int calcola(int a,int b=2){return a+b;}\n'
                         'int somma(int a,int b){return a+b;}double somma(double a,double b){return a+b;}\n'
                         'int fatt(int n){if(n<=1)return 1;return n*fatt(n-1);}')
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['output'], '5,3.5,7,120')
        self.assertTrue(any(len(s['frames']) >= 6 for s in result['steps']))

    def test_flow(self):
        result = program('int n=0;for(int i=0;i<5;i++){if(i==1)continue;if(i==4)break;n+=i;}while(n<7)n++;do{n--;}while(n>6);'
                         'switch(n){case 6:cout<<"sei";break;default:cout<<"errore";}cout<<(n==6?"ok":"no");')
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['output'], 'seiok')

    def test_strings_format_and_getline(self):
        result = program('int eta;string nome;cin>>eta;cin.ignore();getline(cin,nome);string nomi[2]={"A","B"};'
                         'cout<<nome<<" "<<nomi[1]<<" "<<fixed<<setprecision(2)<<static_cast<double>(eta)/2;', inputs='17\nMario Rossi\n')
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['output'], 'Mario Rossi B 8.50')

    def test_short_circuit_and_sizeof(self):
        result = program('int n;int v[5]={0};int a=0;if(false && n>0)a=1;cout<<sizeof(v)/sizeof(v[0])<<","<<a;')
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['output'], '5,0')

    def test_char_array_and_assignment_order(self):
        result = program("char vocali[]={'a','e','i'};for(int i=0;i<3;i++)cout<<vocali[i];"
                         "int k=0;int a[3]={0};a[k++]=++k;cout<<k<<a[1];")
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['output'], 'aei21')

    def test_reference_to_uninitialized_and_const_temporary(self):
        result = program('int a;inizializza(a);cout<<a<<leggi(7);',
                         'void inizializza(int &n){n=5;}int leggi(const int &n){return n;}')
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['output'], '57')
        result = program('int a;leggi(a);', 'int leggi(int &n){return n;}')
        self.assertIn('non inizializzata', result['error'])

    def test_examples_match_native_cpp(self):
        examples = json.loads((ROOT / 'examples.json').read_text())
        with tempfile.TemporaryDirectory(dir='/private/tmp') as folder:
            path = Path(folder) / 'originale.cpp'
            executable = Path(folder) / 'originale'
            for example in examples:
                with self.subTest(example=example['title']):
                    path.write_text(example['code'])
                    subprocess.run(['clang++', '-std=c++17', str(path), '-o', str(executable)], check=True, capture_output=True, timeout=20)
                    # Solo esempi fissi del repository, senza accessi esterni.
                    reference = subprocess.run([str(executable)], input=example['input'], text=True, capture_output=True, check=True, timeout=3)
                    trace = run_program(example['code'], example['input'])
                    self.assertEqual(trace['error'], '')
                    self.assertEqual(trace['steps'][-1]['output'], reference.stdout)

    def test_sandbox_blocks_external_files_network_and_fork(self):
        with tempfile.TemporaryDirectory(dir='/private/tmp') as folder, tempfile.NamedTemporaryFile(dir='/private/tmp') as sentinel:
            directory = Path(folder)
            path = directory / 'probe.cpp'
            path.write_text('#include <fstream>\n#include <sys/socket.h>\n#include <arpa/inet.h>\n#include <cerrno>\n#include <unistd.h>\n#include <sys/wait.h>\n'
                'int main(){std::ifstream f(' + json.dumps(sentinel.name) + ');if(f)return 1;'
                'int s=socket(AF_INET,SOCK_STREAM,0);if(s>=0){sockaddr_in a{};a.sin_family=AF_INET;a.sin_port=htons(9);a.sin_addr.s_addr=htonl(INADDR_LOOPBACK);'
                'int r=connect(s,reinterpret_cast<sockaddr*>(&a),sizeof(a));int e=errno;close(s);if(r==0||(e!=EPERM&&e!=EACCES))return 2;}'
                'int p=fork();if(p==0)_exit(0);if(p>0){waitpid(p,nullptr,0);return 3;}return 0;}')
            subprocess.run(['clang++', '-std=c++17', str(path), '-o', str(directory / 'programma')], check=True, capture_output=True, timeout=20)
            resources = subprocess.run(['clang++', '-print-resource-dir'], capture_output=True, text=True, check=True).stdout.strip()
            profile = directory / 'isolamento.sb'
            profile.write_text(sandbox_profile(folder, resources))
            checked = subprocess.run(['sandbox-exec', '-f', str(profile), str(directory / 'programma')], capture_output=True, text=True, timeout=3)
            self.assertEqual(checked.returncode, 0, checked.stderr)

    def test_input_failure_and_limits(self):
        self.assertIn('Input', program('int a;cin>>a;')['error'])
        self.assertIn('800 passi', program('while(true){}')['error'])

    def test_division_by_zero_and_global_initialization(self):
        self.assertIn('divisione per zero', program('int zero=0;cout<<1/zero;')['error'])
        with self.assertRaises(CodeError):
            program('cout<<n;', 'int f(){return 3;}int n=f();')
        with self.assertRaises(CodeError):
            program('main();')

    def test_main_implicit_return_and_utf8(self):
        result = run_program('#include <iostream>\nusing namespace std;\nint main(){int eta=17;cout<<"Età: "<<eta;}')
        self.assertEqual(result['error'], '')
        self.assertEqual(result['steps'][-1]['output'], 'Età: 17')

    def test_reject_unsupported_and_invalid(self):
        for code in ['#include <fstream>\nint main(){}', 'int main(){int m[2][3];}', 'int main(){int *p=new int;}',
                     'int &f(int &n){return n;}int main(){int x=1;f(x);}',
                     'int *f(int *p){return p;}int main(){int x=1;f(&x);}']:
            with self.subTest(code=code), self.assertRaises(CodeError):
                run_program(code)
        with self.assertRaises(CodeError):
            run_program('int main(){int a=;}')


if __name__ == '__main__':
    unittest.main()
