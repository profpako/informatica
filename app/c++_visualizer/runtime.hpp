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
template<class T> struct TypeTag {};
template<class T> std::string value(const T &v) {
    using V = std::remove_cv_t<T>;
    if constexpr (std::is_same_v<V, std::string>) return quote(v.substr(0, 2000));
    else if constexpr (std::is_same_v<V, char>) return quote(std::string(1, v));
    else if constexpr (std::is_same_v<V, bool>) return v ? "true" : "false";
    else if constexpr (std::is_pointer_v<V>) return quote(address(v));
    else if constexpr (std::is_array_v<V>) {
        std::string result = "[";
        for (std::size_t i = 0; i < std::extent_v<V>; ++i) result += (i ? "," : "") + value(v[i]);
        return result + "]";
    }
    else if constexpr (std::is_class_v<V>) {
        std::string result = "{";
        __cv_fields(TypeTag<V>{}, v, [&](const char *name, const char *, const auto &field, bool) {
            if (result.size() > 1) result += ',';
            result += quote(name + 1) + ":" + value(field);
        });
        return result + "}";
    }
    else {
        if constexpr (std::is_floating_point_v<V>)
            if (!std::isfinite(v)) return quote(std::isnan(v) ? "NaN" : (v > 0 ? "+infinito" : "-infinito"));
        std::ostringstream s;
        s << std::setprecision(15) << v;
        return s.str();
    }
}
struct Cell {
    std::uintptr_t addr;
    std::size_t size;
    std::string path, type;
    bool initialized, pointer;
    std::function<std::string()> read;
};
template<class T> const void *type_key() { static const char key = 0; return &key; }
struct ArrayRegion { std::uintptr_t addr; std::size_t size, count; const void *elementType; };
struct Entry {
    int id, frame, declaration;
    bool parameter, active;
    std::string name, type;
    std::uintptr_t addr;
    std::size_t size;
    bool reference, pointer, array;
    std::vector<Cell> cells;
    std::vector<ArrayRegion> arrays;
    std::vector<std::size_t> dimensions;
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
    void append(const std::string &text) { auto offset = position(); data += text; setg(data.data(), data.data() + offset, data.data() + data.size()); }
    bool available() const { return gptr() != egptr(); }
    std::size_t position() const { return gptr() ? gptr() - data.data() : 0; }
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
    std::size_t traceBytes = 0;
    std::size_t echoedOutput = 0;
    std::size_t inputStart = 0;
    int inputDepth = 0;
    bool formattedInput = true;
    bool manual = false, waiting = false;
    int inputRequest = 0;
    std::string inputName, inputType, inputError;
    bool inputFormatted = true;
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
    std::ostringstream trace;
    trace << "{\"line\":" << s.line << ",\"event\":" << quote(event)
        << ",\"output\":" << quote(s.console.str().substr(0, 20000))
        << ",\"console\":" << quote((s.terminal + s.console.str().substr(s.echoedOutput)).substr(0, 30000))
        << ",\"returnValue\":" << quote(s.returned) << ",\"inputConsumed\":" << s.input.pubseekoff(0, std::ios::cur, std::ios::in)
        << ",\"error\":" << quote(error) << ",\"frames\":[";
    bool first = true;
    for (const auto &c : s.calls) {
        if (!first) trace << ',';
        first = false;
        trace << "{\"id\":" << c.id << ",\"name\":" << quote(c.name)
                << ",\"site\":" << c.site << ",\"caller\":" << c.caller << '}';
    }
    trace << "],\"variables\":[";
    first = true;
    for (const auto *e : s.entries) {
        if (!e->active) continue;
        if (!first) trace << ',';
        first = false;
        trace << "{\"id\":" << e->id << ",\"frame\":" << e->frame
            << ",\"declaration\":" << e->declaration << ",\"parameter\":" << (e->parameter ? "true" : "false")
            << ",\"name\":" << quote(e->name) << ",\"type\":" << quote(e->type)
            << ",\"reference\":" << (e->reference ? "true" : "false")
            << ",\"pointer\":" << (e->pointer ? "true" : "false")
            << ",\"array\":" << (e->array ? "true" : "false") << ",\"dimensions\":[";
        for (std::size_t i = 0; i < e->dimensions.size(); ++i) {
            if (i) trace << ',';
            trace << e->dimensions[i];
        }
        trace << "],\"cells\":[";
        for (std::size_t i = 0; i < e->cells.size(); ++i) {
            if (i) trace << ',';
            const auto &c = e->cells[i];
            trace << "{\"address\":" << quote(address(reinterpret_cast<void *>(c.addr)))
                << ",\"path\":" << quote(c.path) << ",\"type\":" << quote(c.type)
                << ",\"pointer\":" << (c.pointer ? "true" : "false")
                << ",\"initialized\":" << (c.initialized ? "true" : "false")
                << ",\"value\":" << (c.initialized ? c.read() : "null") << '}';
        }
        trace << "]}";
    }
    trace << "],\"condition\":";
    if (s.shownCondition) {
        const auto &c = *s.shownCondition;
        trace << "{\"site\":" << c.site << ",\"frame\":" << c.frame
                << ",\"result\":" << (c.result ? "true" : "false") << ",\"action\":" << quote(c.action) << ",\"values\":[";
        for (std::size_t i = 0; i < c.values.size(); ++i) {
            if (i) trace << ',';
            const auto &v = c.values[i];
            trace << "{\"begin\":" << v.begin << ",\"end\":" << v.end << ",\"text\":" << quote(v.text) << '}';
        }
        trace << "]}";
    } else trace << "null";
    trace << ",\"inputRequest\":";
    if (s.waiting && event == "attesa input")
        trace << "{\"number\":" << s.inputRequest << ",\"target\":" << quote(s.inputName)
                << ",\"type\":" << quote(s.inputType) << ",\"formatted\":" << (s.inputFormatted ? "true" : "false")
                << ",\"error\":" << quote(s.inputError) << '}';
    else trace << "null";
    trace << "}\n";
    auto record = trace.str();
    if (s.traceBytes + record.size() > 12 * 1024 * 1024 - 512 * 1024) {
        s.trace << "{\"line\":" << s.line << ",\"event\":\"errore\",\"error\":\"Traccia troppo grande: limite di 12 MiB. Riduci celle o iterazioni.\",\"variables\":[],\"frames\":[],\"output\":" << quote(s.console.str().substr(0, 20000)) << ",\"console\":" << quote((s.terminal + s.console.str().substr(s.echoedOutput)).substr(0, 30000)) << ",\"inputConsumed\":" << s.input.position() << "}\n";
        s.trace.flush();
        std::_Exit(2);
    }
    s.traceBytes += record.size();
    s.trace << record;
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
inline bool initialized(std::uintptr_t addr, std::size_t size) {
    for (auto *e : state().entries)
        for (const auto &c : e->cells)
            if (c.addr >= addr && c.addr + c.size <= addr + size && !c.initialized) return false;
    return true; // Temporanei e costanti non registrati sono inizializzati dal C++.
}
template<class T> void mark(const T *p) {
    auto addr = reinterpret_cast<std::uintptr_t>(p);
    for (auto *e : state().entries)
        for (auto &c : e->cells)
            if (c.addr >= addr && c.addr + c.size <= addr + sizeof(T)) { c.initialized = true; e->active = true; }
}
inline void activate(const void *p, bool defaultInitialized = false) {
    auto addr = reinterpret_cast<std::uintptr_t>(p);
    for (auto *e : state().entries) if (e->addr == addr) {
        e->active = true;
        if (defaultInitialized) for (auto &c : e->cells) c.initialized = true;
    }
}
template<class T> void collect(Entry &entry, T &object, const std::string &path, const std::string &type, bool init) {
    using V = std::remove_cv_t<T>;
    if constexpr (std::is_array_v<T>) {
        constexpr auto n = std::extent_v<T>;
        entry.arrays.push_back({reinterpret_cast<std::uintptr_t>(&object), sizeof(object[0]), n, type_key<std::remove_cv_t<std::remove_extent_t<T>>>()});
        auto elementType = type;
        auto bracket = elementType.find('[');
        if (bracket != std::string::npos) elementType.erase(bracket, elementType.find(']', bracket) - bracket + 1);
        for (std::size_t i = 0; i < n; ++i) collect(entry, object[i], path + "[" + std::to_string(i) + "]", elementType, init);
    } else if constexpr (std::is_class_v<V> && !std::is_same_v<V, std::string>) {
        __cv_fields(TypeTag<V>{}, object, [&](const char *name, const char *fieldType, auto &field, bool defaultInit) {
            collect(entry, field, path + name, fieldType, init || defaultInit);
        });
    } else {
        auto addr = reinterpret_cast<std::uintptr_t>(&object);
        bool ready = entry.reference ? initialized(addr, sizeof(T)) : init || (entry.active && std::is_same_v<V, std::string>);
        entry.cells.push_back({addr, sizeof(T), path, type, ready, std::is_pointer_v<T>, [p = &object] { return value(*p); }});
        if (entry.cells.size() > 5000) fail("Limite di 5.000 celle per variabile composta.");
    }
}
struct Watch {
    Entry entry;
    template<class T> Watch(std::string name, std::string type, T &object, bool init, bool reference,
          bool persistent, int declaration, bool parameter, bool active) :
        entry{state().next++, persistent || state().calls.empty() ? 0 : state().calls.back().id,
              declaration, parameter, active,
              name, type, reinterpret_cast<std::uintptr_t>(&object), sizeof(T), reference, std::is_pointer_v<T>, std::is_array_v<T>, {}, {}, {}} {
        if constexpr (std::is_array_v<T>) {
            entry.dimensions.push_back(std::extent_v<T>);
            if constexpr (std::rank_v<T> == 2) entry.dimensions.push_back(std::extent_v<T, 1>);
        }
        auto cellType = type;
        for (const auto &modifier : {std::string(" (&)"), std::string(" &")}) {
            auto pos = cellType.find(modifier);
            if (pos != std::string::npos) cellType.erase(pos, modifier.size());
        }
        collect(entry, object, "", cellType, init);
        state().entries.push_back(&entry);
    }
    Watch(const Watch &) = delete;
    ~Watch() {
        auto &entries = state().entries;
        entries.erase(std::remove(entries.begin(), entries.end(), &entry), entries.end());
    }
};
template<class T> Watch watch(const char *name, const char *type, T &object, bool init, bool reference, bool persistent, int declaration, bool parameter, bool active = true) {
    return Watch(name, type, object, init, reference, persistent, declaration, parameter, active);
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
    if (!initialized(reinterpret_cast<std::uintptr_t>(&v), sizeof(T))) fail("Lettura di una variabile non inizializzata.", line);
    capture_condition(v, begin, end);
    return v;
}
template<class T> decltype(auto) checked(T &&v, int line, int begin = -1, int end = -1) {
    if (!initialized(reinterpret_cast<std::uintptr_t>(&v), sizeof(T))) fail("Lettura di una variabile non inizializzata.", line);
    capture_condition(v, begin, end);
    return std::forward<T>(v);
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
    const ArrayRegion *region = nullptr;
    std::string name;
    for (auto *e : state().entries) {
        for (const auto &a : e->arrays) if (a.elementType == type_key<std::remove_cv_t<T>>() && addr >= a.addr && addr < a.addr + a.count * a.size && (addr - a.addr) % a.size == 0) {
            if (!region || a.count < region->count) { region = &a; name = e->name; }
        }
    }
    if (region) {
        auto start = (addr - region->addr) / region->size;
        if (index < 0 || static_cast<unsigned long long>(index) >= region->count - start)
            fail("Indice " + std::to_string(index) + " fuori dai limiti dell'array " + name + ".", line);
        return base[index];
    }
    fail("Il puntatore non individua un array attivo.", line);
}
template<class T> T *pointer(T *p, int line) {
    auto addr = reinterpret_cast<std::uintptr_t>(p);
    for (auto *e : state().entries)
        if (!e->reference && addr >= e->addr && addr + sizeof(T) <= e->addr + e->size)
            return p;
    fail(p ? "Il puntatore non individua una variabile attiva." : "Dereferenziazione di nullptr.", line);
}
template<class T> T &input_target(T &target, int line, const char *name, const char *type, bool formatted) {
    auto &s = state();
    if (!s.manual || (!formatted && s.input.available())) return target;
    if constexpr (std::is_array_v<T>) fail("Leggi le singole celle dell'array oppure usa string.", line);
    else {
        s.inputName = name; s.inputType = type; s.inputFormatted = formatted; s.inputError.clear();
        std::istream terminal(s.oldInput);
        for (;;) {
            s.waiting = true; ++s.inputRequest; step(line, "attesa input"); s.waiting = false;
            std::string answer;
            if (!std::getline(terminal, answer)) fail("Input manuale interrotto.", line);
            std::istringstream probe(answer + "\n"); probe.copyfmt(std::cin);
            T candidate{};
            bool valid = false;
            if (formatted) valid = bool(probe >> candidate);
            else if constexpr (std::is_same_v<T, std::string>) valid = bool(std::getline(probe, candidate));
            if (formatted && valid) { probe >> std::ws; valid = probe.eof(); }
            if (valid) { s.input.append(answer + "\n"); std::cin.clear(); return target; }
            echo_input(answer + "\n"); s.inputError = "Valore non valido per " + s.inputType + ". Inserisci un solo valore.";
        }
    }
}
template<class Read, class T> std::istream &input(Read read, T &target, int line, bool formatted) {
    auto &s = state();
    const bool outer = s.inputDepth++ == 0;
    if (outer) { s.inputStart = s.input.position(); s.formattedInput = formatted; }
    auto &stream = read();
    --s.inputDepth;
    // Una lettura concatenata corrisponde a una sola risposta nella console.
    if (!s.manual && (outer || !stream)) echo_input(s.input.consumed(s.inputStart, s.formattedInput, !stream));
    if (!stream) fail("Input esaurito o non valido. Completa il campo Input del programma e riavvia.", line);
    mark(&target);
    if (s.manual) { echo_input(s.input.consumed(s.inputStart, formatted, false)); step(line, "input letto"); s.inputStart = s.input.position(); }
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
    s.manual = std::getenv("CPPVIZ_MANUAL_INPUT") != nullptr;
    s.input.reset(s.manual ? "" : std::string(std::istreambuf_iterator<char>(std::cin), {}));
    s.oldInput = std::cin.rdbuf(&s.input);
    s.old = std::cout.rdbuf(s.console.rdbuf());
}
inline void finish() {
    step(0, "fine");
    std::cout.rdbuf(state().old);
    std::cin.rdbuf(state().oldInput);
}
}
