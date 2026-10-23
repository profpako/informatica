// Verifica la semantica C++ dei casi didattici; non verifica un visualizzatore.
#include <cassert>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <type_traits>
using namespace std;

int contatore = 0;
void scambioErrato(int a, int b);
void scambioCorretto(int &a, int &b);
void incrementa(int &numero, int incremento);
void modificaDueAlias(int &a, int &b);
int sommaArray(const int arr[], int dimensione);
void raddoppiaElementi(int arr[], int dimensione);
int somma(int a, int b);
double somma(double a, double b);
int calcola(int a, int b, char operazione = '+');
int fattoriale(int n);
int contaChiamate();
int sommaMatrice(const int matrice[][3], int righe);

int main() {
    int eta = 16, anno = 2026;
    float altezza = 1.75f;
    double media = 7.5;
    char iniziale = 'M';
    bool studente = true;
    const int DIM = 5;
    assert(eta == 16 && anno == 2026 && altezza == 1.75f);
    assert(media == 7.5 && iniziale == 'M' && studente && DIM == 5);
    cout << "OK tipi, costanti e dichiarazioni multiple\n";

    int a = 10, b = 3, c = 5;
    assert(a / b == 3 && a % b == 1);
    assert(static_cast<double>(a) / b > 3.3 && (double)a / b < 3.4);
    int prima = c++;
    int dopo = ++c;
    c += 2;
    assert(prima == 5 && dopo == 7 && c == 9);
    assert((a > b && b != 0) && !(a == b) && (false || true));
    cout << "OK operatori e conversioni\n";

    int totale = 0;
    for (int i = 0; i < 5; i++) {
        if (i == 1) continue;
        if (i == 4) break;
        totale += i;
    }
    int k = 0;
    while (k < 2) k++;
    do { k--; } while (k > 0);
    switch (totale) {
        case 5: totale = 10; break;
        default: totale = -1;
    }
    string esito;
    if (totale == 10) esito = "ok";
    else if (totale == 0) esito = "zero";
    else esito = "errore";
    assert(k == 0 && esito == "ok" && (totale > 0 ? 1 : 0) == 1);
    cout << "OK condizioni, cicli e salti\n";

    int x = 5, y = 10;
    scambioErrato(x, y);
    assert(x == 5 && y == 10);
    scambioCorretto(x, y);
    assert(x == 10 && y == 5);
    incrementa(x, 3);
    assert(x == 13);
    modificaDueAlias(y, y);
    assert(y == 8);
    const int &alias = x;
    assert(&alias == &x);
    cout << "OK valore, riferimenti, alias e parametri misti\n";

    assert(somma(5, 3) == 8 && somma(1.5, 2.0) == 3.5);
    assert(calcola(5, 3) == 8 && calcola(5, 3, '-') == 2);
    assert(fattoriale(5) == 120);
    cout << "OK prototipi, ritorni, overloading, default e ricorsione\n";

    int contatore = 100;
    ::contatore++;
    { int contatore = 7; assert(contatore == 7); }
    assert(contatore == 100 && ::contatore == 1);
    assert(contaChiamate() == 1);
    assert(contaChiamate() == 2);
    cout << "OK ambiti, globali, omonimia e static locali\n";

    int numeri[] = {1, 2, 3, 4, 5};
    int sequenza[DIM] = {1, 2};
    int zeri[10] = {0};
    int dimensione = sizeof(numeri) / sizeof(numeri[0]);
    assert(dimensione == 5 && sequenza[2] == 0 && zeri[9] == 0);
    assert(sommaArray(numeri, dimensione) == 15);
    raddoppiaElementi(numeri, dimensione);
    assert(numeri[0] == 2 && numeri[4] == 10);
    int *p = &numeri[1];
    *p = 9;
    assert(numeri[1] == 9);
    p = nullptr;
    assert(p == nullptr);
    cout << "OK array, inizializzazioni, sizeof, parametri array e puntatori\n";

    istringstream input("17\nMario Rossi\n");
    streambuf *precedente = cin.rdbuf(input.rdbuf());
    int numero;
    string nome;
    cin >> numero;
    cin.ignore();
    getline(cin, nome);
    cin.rdbuf(precedente);
    assert(numero == 17 && nome == "Mario Rossi");
    ostringstream output;
    output << setw(4) << numero << ' ' << fixed << setprecision(2) << 7.5 << endl;
    assert(output.str() == "  17 7.50\n");
    string nomi[2] = {"Mario", "Anna"};
    assert(nomi[0] + " Rossi" == nome && nomi[1] == "Anna");
    cout << "OK input, getline, stringhe e output formattato\n";

    int matrice[2][3] = {{1, 2, 3}, {4, 5, 6}};
    assert(sommaMatrice(matrice, 2) == 21);
    cout << "OK estensione matrici\n";

    struct Studente { string nome; int voto; };
    Studente classe[2] = {{"Mario", 7}, {"Anna", 8}};
    Studente &s = classe[0];
    s.voto++;
    assert(classe[0].voto == 8 && classe[1].nome == "Anna");
    cout << "OK estensione struct e array di struct\n";
}

void scambioErrato(int a, int b) { int temp = a; a = b; b = temp; }
void scambioCorretto(int &a, int &b) { int temp = a; a = b; b = temp; }
void incrementa(int &numero, int incremento) { numero += incremento; }
void modificaDueAlias(int &a, int &b) { a += 1; b += 2; }
int sommaArray(const int arr[], int dimensione) {
    static_assert(is_same<decltype(arr), const int *>::value);
    int totale = 0;
    for (int i = 0; i < dimensione; i++) totale += arr[i];
    return totale;
}
void raddoppiaElementi(int arr[], int dimensione) {
    for (int i = 0; i < dimensione; i++) arr[i] *= 2;
}
int somma(int a, int b) { return a + b; }
double somma(double a, double b) { return a + b; }
int calcola(int a, int b, char operazione) { return operazione == '+' ? a + b : a - b; }
int fattoriale(int n) { return n <= 1 ? 1 : n * fattoriale(n - 1); }
int contaChiamate() { static int chiamate = 0; return ++chiamate; }
int sommaMatrice(const int matrice[][3], int righe) {
    static_assert(is_same<decltype(matrice), const int (*)[3]>::value);
    int totale = 0;
    for (int i = 0; i < righe; i++)
        for (int j = 0; j < 3; j++) totale += matrice[i][j];
    return totale;
}
