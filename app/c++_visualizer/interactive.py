"""Sessioni locali: una richiesta di input alla volta, nello stesso processo C++."""
import queue
import secrets
import threading
import time

from engine import CodeError, run_program, standard_flag

sessions = {}


class Session:
    def __init__(self, code, flow, standard):
        self.events, self.answers = queue.Queue(), queue.Queue()
        self.pending, self.bytes = None, 0
        self.touched = time.monotonic()
        self.thread = threading.Thread(target=self.run, args=(code, flow, standard), daemon=True)
        self.thread.start()

    def request(self, result):
        self.events.put(result)
        try:
            answer = self.answers.get(timeout=600)
        except queue.Empty:
            raise CodeError('Sessione scaduta dopo 10 minuti senza input. Avvia una nuova esecuzione.') from None
        if answer is None:
            raise CodeError('Esecuzione manuale annullata.')
        return answer

    def run(self, code, flow, standard):
        try:
            self.events.put(run_program(code, flow=flow, interactive=self.request, standard=standard))
        except Exception as error:
            self.events.put(error)

    def result(self):
        try:
            result = self.events.get(timeout=50)
        except queue.Empty:
            self.cancel()
            raise CodeError('Tempo massimo superato durante la preparazione della sessione.') from None
        if isinstance(result, Exception):
            self.cancel()
            raise CodeError(str(result)) from result
        self.pending = result['steps'][-1].get('inputRequest')
        self.touched = time.monotonic()
        return result

    def answer(self, number, value):
        if not self.pending or type(number) is not int or self.pending['number'] != number:
            raise CodeError('Questa richiesta di input è già stata gestita. Ricarica il passo corrente.')
        if not isinstance(value, str) or '\n' in value or '\r' in value or len(value.encode()) > 2000:
            raise CodeError('Inserisci una sola risposta di massimo 2.000 byte.')
        if self.bytes + len(value.encode()) + 1 > 10000:
            raise CodeError('Raggiunto il limite di 10.000 byte di input per esecuzione.')
        self.bytes += len(value.encode()) + 1
        self.pending = None
        self.answers.put(value)
        return self.result()

    def cancel(self):
        self.pending = None
        self.answers.put(None)


def cleanup():
    for ident, session in list(sessions.items()):
        if time.monotonic() - session.touched > 600 or not session.thread.is_alive():
            sessions.pop(ident).cancel()


def response(ident, session, result):
    if not session.pending:
        sessions.pop(ident, None)
    return {**result, 'session': ident if session.pending else None}


def start(code, flow=None, standard='17'):
    standard_flag(standard)
    cleanup()
    if len(sessions) >= 4:
        raise CodeError('Sono già aperte quattro esecuzioni manuali. Termina o annulla una sessione.')
    ident, session = secrets.token_urlsafe(24), Session(code, flow, standard)
    sessions[ident] = session
    try:
        return response(ident, session, session.result())
    except Exception:
        sessions.pop(ident, None); session.cancel()
        raise


def answer(ident, number, value):
    cleanup()
    if not isinstance(ident, str) or ident not in sessions:
        raise CodeError('Sessione terminata o scaduta. Avvia una nuova esecuzione.')
    session = sessions[ident]
    return response(ident, session, session.answer(number, value))


def cancel(ident):
    if not isinstance(ident, str):
        raise CodeError('Sessione non valida.')
    session = sessions.pop(ident, None)
    if session:
        session.cancel()


def close_all():
    for ident in list(sessions):
        cancel(ident)
