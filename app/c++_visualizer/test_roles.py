import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from engine import prepare
from roles import classify_roles, nodes


def roles_for(code):
    source, _ = prepare('#include <iostream>\nusing namespace std;\n' + code)
    with tempfile.TemporaryDirectory(dir='/private/tmp') as folder:
        path = Path(folder) / 'ruoli.cpp'
        path.write_bytes(source)
        parsed = subprocess.run(['clang++', '-std=c++17', '-Xclang', '-ast-dump=json', '-Xclang',
                                 '-ast-dump-filter=__cv_user', '-fsyntax-only', str(path)],
                                capture_output=True, text=True, timeout=20, check=True)
    tree = json.loads(parsed.stdout)
    roles = classify_roles(tree)
    return {n['name']: roles[n['loc']['offset']] for n in nodes(tree)
            if n.get('kind') in {'VarDecl', 'ParmVarDecl'} and n.get('name')}


class RoleTests(unittest.TestCase):
    def test_console_and_work(self):
        result = roles_for('int main(){int base,altezza,area;cin>>base>>altezza;int temporanea=base*altezza;'
                           'area=temporanea;for(int i=0;i<2;i++)area+=i;cout<<area;int numero;cin>>numero;cout<<numero;}')
        self.assertEqual(result, dict(base='input', altezza='input', area='output', temporanea='work', i='work', numero='inout'))

    def test_parameter_directions(self):
        result = roles_for('void f(int dato,int &risultato,int &aggiornato,int *uscita,int valori[],const int &costante){'
                           'int appoggio=dato+costante;risultato=appoggio;aggiornato+=risultato;*uscita=7;valori[0]*=2;}int main(){}')
        self.assertEqual(result, dict(dato='input', risultato='output', aggiornato='inout', uscita='output',
                                      valori='inout', costante='input', appoggio='work'))

    def test_definite_writes_and_branches(self):
        result = roles_for('void f(int &scritto,int &completo,int &parziale,bool condizione){scritto=1;scritto++;'
                           'if(condizione)completo=1;else completo=2;completo++;if(condizione)parziale=1;parziale++;}int main(){}')
        self.assertEqual(result, dict(scritto='output', completo='output', parziale='inout', condizione='input'))

    def test_pointer_and_array_elements(self):
        result = roles_for('void f(int *p,int a[],int b[]){*p=1;cout<<*p;a[0]=1;cout<<a[0];b[0]=1;cout<<b[1];}int main(){}')
        self.assertEqual(result, dict(p='output', a='output', b='inout'))

    def test_calls_recursion_and_prototypes(self):
        result = roles_for('void imposta(int &);void inoltra(int &destinazione){imposta(destinazione);destinazione++;}'
                           'void imposta(int &valore){valore=7;}'
                           'void ricorsiva(int &totale,int n){if(n<=0){totale=0;return;}ricorsiva(totale,n-1);totale++;}int main(){}')
        self.assertEqual({key: result[key] for key in ['destinazione', 'valore', 'totale', 'n']},
                         dict(destinazione='output', valore='output', totale='output', n='input'))

    def test_return_and_forwarded_console(self):
        result = roles_for('int area(int b,int h){int risultato=b*h;return risultato;}void stampa(int n){cout<<n;}'
                           'int main(){int base,altezza;cin>>base>>altezza;int prodotto=area(base,altezza);stampa(prodotto);}')
        self.assertEqual(result, dict(b='input', h='input', risultato='output', n='input',
                                      base='input', altezza='input', prodotto='output'))

    def test_aliases_globals_and_getline(self):
        result = roles_for('int globale;void leggi(int &dato){cin>>dato;}int main(){int n;int &alias=n;leggi(alias);'
                           'int *p=&n;cout<<*p;cin>>globale;cout<<globale;string nome;getline(cin,nome);}')
        self.assertEqual(result['n'], 'inout')
        self.assertEqual(result['globale'], 'inout')
        self.assertEqual(result['nome'], 'input')
        self.assertEqual(result['dato'], 'output')

    def test_short_circuit_and_value_copy(self):
        result = roles_for('void f(int &parziale,bool condizione){condizione&&(parziale=1);parziale++;}'
                           'void leggi(int copia){cin>>copia;cout<<copia;}int main(){int originale=5;leggi(originale);}')
        self.assertEqual(result, dict(parziale='inout', condizione='input', copia='work', originale='work'))

    def test_string_parameters_and_reference_binding(self):
        result = roles_for('void f(const string &testo,string &destinazione,string &aggiornata,int &numero){'
                           'int lunghezza=testo.size();destinazione="ok";aggiornata+="!";int &alias=numero;alias=0;}int main(){}')
        self.assertEqual({key: result[key] for key in ['testo','destinazione','aggiornata','numero']},
                         dict(testo='input', destinazione='output', aggiornata='inout', numero='output'))


if __name__ == '__main__':
    unittest.main()
