import json
import subprocess
import unittest

from engine import ROOT, CodeError, run_program
from flowchart_import import import_flowchart


def generate(document):
    result = subprocess.run(['node', '-e', 'const C=require("./flowchart-core.js"); process.stdout.write(JSON.stringify(C.generate(JSON.parse(require("node:fs").readFileSync(0,"utf8")))));'],
                            input=json.dumps(document), cwd=ROOT, text=True, capture_output=True, timeout=10, check=True)
    return json.loads(result.stdout)


class FlowchartImportTests(unittest.TestCase):
    def equivalent(self, source, inputs=''):
        document = import_flowchart(source)
        generated = generate(document)
        native = run_program(source, inputs)
        imported = run_program(generated['code'], inputs, generated['flow'])
        self.assertEqual(native['error'], '')
        self.assertEqual(imported['error'], '')
        self.assertEqual(native['steps'][-1]['output'], imported['steps'][-1]['output'])
        self.assertEqual(native['steps'][-1]['console'], imported['steps'][-1]['console'])
        self.assertEqual(document['scope'], 'cpp')
        self.assertEqual(generated['flow']['deferred'], [])
        return document, imported

    def test_area_function_pointer_and_console(self):
        source = '''#include <iostream>
using namespace std;
int area(int b,int h){int a=b*h;return a;}
void incrementa(int *p){*p=*p+1;}
int main(){int b,h,a;cout<<"Base: ";cin>>b;cout<<"Altezza: ";cin>>h;
a=area(b,h);incrementa(&a);cout<<"Area: "<<a<<endl;}'''
        document, result = self.equivalent(source, '4 6')
        self.assertEqual(result['steps'][-1]['console'], 'Base: 4\nAltezza: 6\nArea: 25\n')
        self.assertEqual(len(document['functions']), 3)
        self.assertEqual(sum(n['kind']=='call' for n in document['functions'][0]['body']), 2)

    def test_cpp_block_scope_shadowing_and_counter(self):
        source = '''#include <iostream>
using namespace std;
int main(){int x=5;if(x){int x=2;cout<<x;}cout<<x;
for(int i=0;i<2;i++){int temp=i;cout<<temp;}int i=7;cout<<i<<endl;}'''
        _, result = self.equivalent(source)
        memory = next(s for s in reversed(result['steps']) if s['frames'])['variables']
        self.assertEqual({v['name']:v['cells'][0]['value'] for v in memory}, {'x':5,'i':7})

    def test_array_reference_loops_and_jumps(self):
        source = '''#include <iostream>
using namespace std;
void cambia(int v[],int &n){for(int i=0;i<n;i++){if(i==1)continue;v[i]=v[i]*2;}}
int main(){const int N=3;int v[N]={1,2,3};int n=N;cambia(v,n);
while(n>0){n--;if(n==1)break;}do{n++;}while(n<2);cout<<v[0]<<" "<<v[2]<<" "<<n<<endl;}'''
        self.equivalent(source)

    def test_getline_and_strings(self):
        source = '''#include <iostream>
#include <string>
using namespace std;
int main(){string nome;string saluto("Ciao");cout<<"Nome: ";getline(cin,nome);cout<<saluto<<" "<<nome<<endl;}'''
        document, result = self.equivalent(source, 'Ada Lovelace\n')
        self.assertEqual(result['steps'][-1]['output'], 'Nome: Ciao Ada Lovelace\n')
        self.assertTrue(any(n.get('mode')=='line' for n in document['functions'][0]['body']))

    def test_declaration_function_initializer_and_else(self):
        source = '''#include <iostream>
using namespace std;
int doppio(int n){return n*2;}
int main(){int n=doppio(3);if(n<0)cout<<"no";else cout<<n<<endl;return 0;}'''
        _, result = self.equivalent(source)
        call=next(s for s in result['steps'] if s['event']=='chiamata a doppio')
        self.assertFalse(any(v['name']=='n' and not v['parameter'] for v in call['variables']))

    def test_rejections_keep_clear_diagnostics(self):
        sources = ['int g=1;int main(){}', 'int main(){static int x=0;}',
                   'int main(){int n=1;switch(n){case 1:break;}}',
                   'int f(int n=1){return n;}int main(){}',
                   'int f(int n){return n;}double f(double n){return n;}int main(){}',
                   'int f(){int n=1;}int main(){}']
        for source in sources:
            with self.subTest(source=source), self.assertRaises(CodeError) as error:
                import_flowchart(source)
            self.assertIn('Riga', str(error.exception))

    def test_const_array_and_scalar_parameters(self):
        self.equivalent('''#include <iostream>
using namespace std;
int somma(const int v[],const int n){int s=0;for(int i=0;i<n;i++)s+=v[i];return s;}
int main(){int v[3]={1,2,3};const int s=somma(v,3);cout<<s<<endl;}''')

    def test_variable_named_endl_is_not_a_newline(self):
        self.equivalent('''#include <iostream>
int main(){int endl=7;std::cout<<endl;}''')

    def test_chained_input_keeps_single_console_echo(self):
        document, result=self.equivalent('''#include <iostream>
using namespace std;
int main(){int b,h;cin>>b>>h;cout<<b*h<<endl;}''','4 6')
        self.assertEqual(result['steps'][-1]['console'],'4 6\n24\n')
        self.assertTrue(any(n.get('grouping')=='chain' for n in document['functions'][0]['body']))


if __name__ == '__main__':
    unittest.main()
