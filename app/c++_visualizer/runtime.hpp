#pragma once
#include <algorithm>
#include <cmath>
#include <cctype>
#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <functional>
#include <iomanip>
#include <iostream>
#include <iterator>
#include <sstream>
#include <string>
#include <type_traits>
#include <utility>
#include <vector>

namespace cv {
inline std::string quote(const std::string &s) {
    std::ostringstream out;
    out << '"';
    for (unsigned char c : s) {
        switch (c) {
            case '"': out << "\\\""; break;
            case '\\': out << "\\\\"; break;
            case '\n': out << "\\n"; break;
            case '\r': out << "\\r"; break;
            case '\t': out << "\\t"; break;
            default:
                if (c < 32) out << "\\u" << std::hex << std::setw(4) << std::setfill('0') << int(c);
                else out << c;
        }
    }
    return out.str() + '"';
}
inline std::string address(const void *p) {
    std::ostringstream s;
    s << "0x" << std::hex << reinterpret_cast<std::uintptr_t>(p);
    return s.str();
}
template<class T> std::string value(const T &v) {
    using V = std::remove_cv_t<T>;
    if constexpr (std::is_same_v<V, std::string>) return quote(v.substr(0, 2000));
    else if constexpr (std::is_same_v<V, char>) return quote(std::string(1, v));
    else if constexpr (std::is_same_v<V, bool>) return v ? "true" : "false";
    else if constexpr (std::is_pointer_v<V>) return quote(address(v));
    else {
        if constexpr (std::is_floating_point_v<V>)
            if (!std::isfinite(v)) return quote(std::isnan(v) ? "NaN" : (v > 0 ? "+infinito" : "-infinito"));
        std::ostringstream s;
        s << std::setprecision(15) << v;
        return s.str();
    }
}
struct Entry {
    int id, frame, declaration;
    bool parameter, active;
    std::string name, type;
    std::uintptr_t addr;
    std::size_t size, count;
    bool reference, pointer, array;
    std::vector<bool> initialized;
    std::function<std::string(std::size_t)> read;
};
struct Call { int id; std::string name; int line, site, caller; };
struct PendingCall { int site = 0, caller = 0; };
struct ConditionValue { int begin, end; std::string text; };
struct ConditionRecord {
    int site, frame;
    bool result = false;
    std::string action = "test";
    std::vector<ConditionValue> values;
};
class TerminalInput : public std::streambuf {
    std::string data;
protected:
    pos_type seekoff(off_type offset, std::ios_base::seekdir direction, std::ios_base::openmode mode) override {
        if (offset == 0 && direction == std::ios::cur && (mode & std::ios::in))
            return pos_type(position());
        return pos_type(off_type(-1));
    }
public:
    void reset(std::string text) { data = std::move(text); setg(data.data(), data.data(), data.data() + data.size()); }
    std::size_t position() const { return gptr() - data.data(); }
    std::string consumed(std::size_t start, bool formatted, bool failed) const {
        auto end = position();
        if (failed) while (end < data.size() && data[end] != '\n') ++end;
        if (formatted) while (start < end && std::isspace(static_cast<unsigned char>(data[start]))) ++start;
        return data.substr(start, end - start);
    }
};
struct State {
    std::vector<Entry *> entries;
    std::vector<Call> calls;
    PendingCall pending;
    ConditionRecord *collecting = nullptr;
    const ConditionRecord *shownCondition = nullptr;
    std::ofstream trace{"trace.jsonl"};
    std::ostringstream console;
    TerminalInput input;
    std::string terminal;
    std::size_t echoedOutput = 0;
    std::size_t inputStart = 0;
    int inputDepth = 0;
    bool formattedInput = true;
    std::streambuf *old = nullptr;
    std::streambuf *oldInput = nullptr;
    int next = 1, nextCall = 1, steps = 0, line = 0;
    std::string returned;
};
inline State &state() { static State s; return s; }
template<class T> void capture_condition(const T &object, int begin, int end) {
    if (!state().collecting || begin < 0) return;
    std::string text;
    if constexpr (std::is_pointer_v<T>) text = address(object);
    else if constexpr (std::is_same_v<T, char>) {
        text = object == '\'' ? "'\\\''" : object == '\0' ? "'\\0'" : value(object);
        if (!text.empty() && text.front() == '"') text = "'" + text.substr(1, text.size() - 2) + "'";
    } else text = value(object);
    state().collecting->values.push_back({begin, end, text});
}
inline void echo_input(const std::string &text) {
    if (text.empty()) return;
    auto &s = state();
    auto output = s.console.str();
    s.terminal += output.substr(s.echoedOutput) + text + (text.back() == '\n' ? "" : "\n");
    s.echoedOutput = output.size();
}
inline void snapshot(int line, const std::string &event, const std::string &error = "") {
    auto &s = state();
    if (line) s.line = line;
    s.trace << "{\"line\":" << s.line << ",\"event\":" << quote(event)
        << ",\"output\":" << quote(s.console.str().substr(0, 20000))
        << ",\"console\":" << quote((s.terminal + s.console.str().substr(s.echoedOutput)).substr(0, 30000))
        << ",\"returnValue\":" << quote(s.returned) << ",\"inputConsumed\":" << s.input.pubseekoff(0, std::ios::cur, std::ios::in)
        << ",\"error\":" << quote(error) << ",\"frames\":[";
    bool first = true;
    for (const auto &c : s.calls) {
        if (!first) s.trace << ',';
        first = false;
        s.trace << "{\"id\":" << c.id << ",\"name\":" << quote(c.name)
                << ",\"site\":" << c.site << ",\"caller\":" << c.caller << '}';
    }
    s.trace << "],\"variables\":[";
    first = true;
    for (const auto *e : s.entries) {
        if (!e->active) continue;
        if (!first) s.trace << ',';
        first = false;
        s.trace << "{\"id\":" << e->id << ",\"frame\":" << e->frame
            << ",\"declaration\":" << e->declaration << ",\"parameter\":" << (e->parameter ? "true" : "false")
            << ",\"name\":" << quote(e->name) << ",\"type\":" << quote(e->type)
            << ",\"reference\":" << (e->reference ? "true" : "false")
            << ",\"pointer\":" << (e->pointer ? "true" : "false")
            << ",\"array\":" << (e->array ? "true" : "false") << ",\"cells\":[";
        for (std::size_t i = 0; i < e->count; ++i) {
            if (i) s.trace << ',';
            s.trace << "{\"address\":" << quote(address(reinterpret_cast<void *>(e->addr + i * e->size)))
                << ",\"initialized\":" << (e->initialized[i] ? "true" : "false")
                << ",\"value\":" << (e->initialized[i] ? e->read(i) : "null") << '}';
        }
        s.trace << "]}";
    }
    s.trace << "],\"condition\":";
    if (s.shownCondition) {
        const auto &c = *s.shownCondition;
        s.trace << "{\"site\":" << c.site << ",\"frame\":" << c.frame
                << ",\"result\":" << (c.result ? "true" : "false") << ",\"action\":" << quote(c.action) << ",\"values\":[";
        for (std::size_t i = 0; i < c.values.size(); ++i) {
            if (i) s.trace << ',';
            const auto &v = c.values[i];
            s.trace << "{\"begin\":" << v.begin << ",\"end\":" << v.end << ",\"text\":" << quote(v.text) << '}';
        }
        s.trace << "]}";
    } else s.trace << "null";
    s.trace << "}\n";
    s.trace.flush();
    ++s.steps;
}
[[noreturn]] inline void fail(const std::string &message, int line = 0) {
    snapshot(line, "errore", message);
    std::_Exit(2);
}
inline void step(int line, const std::string &event = "prima") {
    if (state().steps >= 800) fail("Raggiunto il limite di 800 passi. Riduci il programma o le iterazioni.", line);
    if (state().console.str().size() > 20000) fail("Output troppo lungo: limite di 20.000 caratteri.", line);
    snapshot(line, event);
}
inline bool initialized(std::uintptr_t addr) {
    for (auto *e : state().entries)
        if (addr >= e->addr && addr < e->addr + e->size * e->count && (addr - e->addr) % e->size == 0)
            return e->initialized[(addr - e->addr) / e->size];
    return true; // Temporanei e costanti non registrati sono inizializzati dal C++.
}
inline void mark(const void *p) {
    auto addr = reinterpret_cast<std::uintptr_t>(p);
    for (auto *e : state().entries)
        if (addr >= e->addr && addr < e->addr + e->size * e->count && (addr - e->addr) % e->size == 0)
            { e->initialized[(addr - e->addr) / e->size] = true; e->active = true; }
}
inline void activate(const void *p, bool defaultInitialized = false) {
    auto addr = reinterpret_cast<std::uintptr_t>(p);
    for (auto *e : state().entries) if (e->addr == addr) {
        e->active = true;
        if (defaultInitialized) std::fill(e->initialized.begin(), e->initialized.end(), true);
    }
}
struct Watch {
    Entry entry;
    Watch(std::string name, std::string type, std::uintptr_t addr, std::size_t size,
          std::size_t count, bool init, bool reference, bool pointer, bool array,
          std::function<std::string(std::size_t)> reader, bool persistent, int declaration, bool parameter, bool active) :
        entry{state().next++, persistent || state().calls.empty() ? 0 : state().calls.back().id,
              declaration, parameter, active,
              name, type, addr, size, count, reference, pointer, array,
              std::vector<bool>(count, init), reader} {
        if (reference) for (std::size_t i = 0; i < count; ++i) entry.initialized[i] = initialized(addr + i * size);
        state().entries.push_back(&entry);
    }
    Watch(const Watch &) = delete;
    ~Watch() {
        auto &entries = state().entries;
        entries.erase(std::remove(entries.begin(), entries.end(), &entry), entries.end());
    }
};
template<class T> Watch watch(const char *name, const char *type, T &object, bool init, bool reference, bool persistent, int declaration, bool parameter, bool active = true) {
    if constexpr (std::is_array_v<T>) {
        constexpr auto n = std::extent_v<T>;
        if (n > 100) fail("Gli array possono avere al massimo 100 elementi.");
        return Watch(name, type, reinterpret_cast<std::uintptr_t>(&object), sizeof(object[0]), n,
            init, reference, false, true, [p = &object](std::size_t i) { return value((*p)[i]); }, persistent, declaration, parameter, active);
    } else return Watch(name, type, reinterpret_cast<std::uintptr_t>(&object), sizeof(T), 1,
        init, reference, std::is_pointer_v<T>, false, [p = &object](std::size_t) { return value(*p); }, persistent, declaration, parameter, active);
}
struct Frame {
    int line;
    Frame(const char *name, int l) : line(l) {
        if (state().calls.size() >= 40) fail("Raggiunto il limite di 40 chiamate annidate.", l);
        state().calls.push_back({state().nextCall++, name, l, state().pending.site, state().pending.caller});
    }
    ~Frame() {
        auto name = state().calls.back().name;
        state().calls.pop_back();
        step(line, "uscita da " + name);
    }
};
template<class F> decltype(auto) invoke(int site, F call) {
    struct Restore {
        PendingCall previous = state().pending;
        ~Restore() { state().pending = previous; }
    } restore;
    auto &s = state();
    s.pending = {site, s.calls.empty() ? 0 : s.calls.back().id};
    return call();
}
template<class T> T read(const T &v, int line, int begin = -1, int end = -1) {
    if (!initialized(reinterpret_cast<std::uintptr_t>(&v))) fail("Lettura di una variabile non inizializzata.", line);
    capture_condition(v, begin, end);
    return v;
}
template<class T> T &checked(T &v, int line, int begin = -1, int end = -1) {
    if (!initialized(reinterpret_cast<std::uintptr_t>(&v))) fail("Lettura di una variabile non inizializzata.", line);
    capture_condition(v, begin, end);
    return v;
}
template<class R, class L> decltype(auto) assign(R rhs, L lhs) {
    auto val = rhs();
    auto &target = lhs();
    target = val;
    mark(&target);
    return (target);
}
template<class R, class L, class Op> decltype(auto) update(R rhs, L lhs, Op op, int line) {
    auto val = rhs();
    auto &target = lhs();
    read(target, line);
    op(target, val);
    mark(&target);
    return (target);
}
template<class T> T post(T &target, int delta, int line, int begin = -1, int end = -1) {
    T old = read(target, line);
    target += delta;
    mark(&target);
    capture_condition(old, begin, end);
    return old;
}
template<class T> T &pre(T &target, int delta, int line, int begin = -1, int end = -1) {
    read(target, line);
    target += delta;
    mark(&target);
    capture_condition(target, begin, end);
    return target;
}
template<class T> T &at(T *base, long long index, int line) {
    auto addr = reinterpret_cast<std::uintptr_t>(base);
    for (auto *e : state().entries) {
        if (e->array && addr >= e->addr && addr < e->addr + e->count * e->size) {
            auto start = (addr - e->addr) / e->size;
            if (index < 0 || static_cast<unsigned long long>(index) >= e->count - start)
                fail("Indice " + std::to_string(index) + " fuori dai limiti dell'array " + e->name + ".", line);
            return base[index];
        }
    }
    fail("Il puntatore non individua un array attivo.", line);
}
template<class T> T *pointer(T *p, int line) {
    auto addr = reinterpret_cast<std::uintptr_t>(p);
    for (auto *e : state().entries)
        if (!e->reference && addr >= e->addr && addr < e->addr + e->count * e->size && (addr - e->addr) % e->size == 0)
            return p;
    fail(p ? "Il puntatore non individua una variabile attiva." : "Dereferenziazione di nullptr.", line);
}
template<class Read, class T> std::istream &input(Read read, T &target, int line, bool formatted) {
    auto &s = state();
    const bool outer = s.inputDepth++ == 0;
    if (outer) { s.inputStart = s.input.position(); s.formattedInput = formatted; }
    auto &stream = read();
    --s.inputDepth;
    // Una lettura concatenata corrisponde a una sola risposta nella console.
    if (outer || !stream) echo_input(s.input.consumed(s.inputStart, s.formattedInput, !stream));
    if (!stream) fail("Input esaurito o non valido. Completa il campo Input del programma e riavvia.", line);
    mark(&target);
    return stream;
}
template<class T> bool condition(const T &test, int line) {
    bool result = static_cast<bool>(test);
    step(line, result ? "condizione vera" : "condizione falsa");
    return result;
}
template<class F> bool test_condition(int site, int line, F evaluate) {
    auto &s = state();
    ConditionRecord record{site, s.calls.empty() ? 0 : s.calls.back().id};
    struct Restore {
        ConditionRecord *collecting = state().collecting;
        const ConditionRecord *shown = state().shownCondition;
        ~Restore() { state().collecting = collecting; state().shownCondition = shown; }
    } restore;
    s.collecting = &record;
    record.result = static_cast<bool>(evaluate());
    s.shownCondition = &record;
    step(line, record.result ? "condizione vera" : "condizione falsa");
    return record.result;
}
inline void loop_jump(int site, int line, const char *action) {
    auto &s = state();
    ConditionRecord record{site, s.calls.empty() ? 0 : s.calls.back().id, false, action};
    auto *previous = s.shownCondition;
    s.shownCondition = &record;
    step(line, std::string("ciclo: ") + action);
    s.shownCondition = previous;
}
template<class T> T returned(T result, int line) {
    state().returned = value(result);
    step(line, "ritorno");
    return result;
}
inline void start() {
    auto &s = state();
    s.input.reset(std::string(std::istreambuf_iterator<char>(std::cin), {}));
    s.oldInput = std::cin.rdbuf(&s.input);
    s.old = std::cout.rdbuf(s.console.rdbuf());
}
inline void finish() {
    step(0, "fine");
    std::cout.rdbuf(state().old);
    std::cin.rdbuf(state().oldInput);
}
}
