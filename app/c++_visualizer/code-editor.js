const CPP_WORDS = ("int float double char bool void long short signed unsigned string std cin cout endl getline " +
  "fixed setprecision setw size_t true false nullptr").split(" ");

export function validTabSize(value) {
  return /^[1-8]$/.test(String(value)) ? Number(value) : 4;
}

export function compilerErrors(message, source) {
  const lines = source.split('\n'), errors = [], seen = new Set();
  const headers = /^(?:(?:\w+\.)*CodeError:\s*)?Riga\s+(\d+):(?:(\d+):)?\s*(?:(fatal error|error|warning|note):\s*)?(.+)$/gm;
  for (const match of String(message).matchAll(headers)) {
    if (['warning','note'].includes(match[3])) continue;
    const number = Number(match[1]);
    if (number < 1 || number > lines.length + 2) continue;
    const atEnd = number > lines.length, line = Math.min(number, lines.length) - 1;
    let ch = 0, bytes = 0;
    for (const character of lines[line]) {
      const length = new TextEncoder().encode(character).length;
      if (bytes + length > Number(match[2] || 1) - 1) break;
      bytes += length; ch += character.length;
    }
    if (atEnd) ch = lines[line].length;
    const detail = match[4].trim(), key = `${line}:${ch}:${detail}`;
    if (!seen.has(key)) { seen.add(key); errors.push({line,ch,message:detail,atEnd}); }
  }
  return errors;
}

export function cppHints(cm) {
  const cursor = cm.getCursor(), line = cm.getLine(cursor.line);
  const prefix = line.slice(0, cursor.ch).match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0] || "";
  const from = {line:cursor.line, ch:cursor.ch - prefix.length};
  const to = {line:cursor.line, ch:cursor.ch + (line.slice(cursor.ch).match(/^\w*/)?.[0].length || 0)};
  if (/\b(?:string|comment|meta)\b/.test(cm.getTokenAt(cursor).type || "")) return {list:[],from,to};
  const names = new Set();
  for (let n = cm.firstLine(); n <= cm.lastLine(); n++) {
    for (const token of cm.getLineTokens(n)) {
      if (n === cursor.line && token.start === from.ch || /\b(?:string|comment|meta)\b/.test(token.type || "")) continue;
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token.string)) names.add(token.string);
    }
  }
  const keywords = Object.keys(globalThis.CodeMirror.resolveMode("text/x-c++src").keywords);
  const list = [...new Set([...names].sort().concat(CPP_WORDS, keywords))]
    .filter(word => word.startsWith(prefix) && word !== prefix && word !== "cv" && !word.startsWith("__"))
    .slice(0, 60);
  return {list,from,to};
}

export function contextualHints(complete, standard) {
  let pending;
  return async cm => {
    const fallback = cppHints(cm), cursor = cm.getCursor(), line = cm.getLine(cursor.line);
    const empty = {...fallback,list:[]};
    if (/\b(?:string|comment|meta)\b/.test(cm.getTokenAt(cursor).type || '')) return empty;
    const code = cm.getValue(), selectedStandard = standard();
    const from = cm.indexFromPos(fallback.from), to = cm.indexFromPos(fallback.to);
    const key = JSON.stringify([code.slice(0,from) + code.slice(to),from,selectedStandard]);
    const changed = () => {
      const now = cm.getCursor();
      return cm.getValue() !== code || now.line !== cursor.line || now.ch !== cursor.ch || standard() !== selectedStandard;
    };
    try {
      // Una sola richiesta in corso; digitare nello stesso identificatore riusa i risultati.
      if (pending && pending.key !== key) await pending.promise.catch(() => {});
      if (changed()) return empty;
      if (!pending || pending.key !== key) {
        const payload = {code,standard:selectedStandard,line:cursor.line + 1,
          column:new TextEncoder().encode(line.slice(0,fallback.from.ch)).length + 1};
        pending = {key,promise:complete(payload)};
      }
      const {items} = await pending.promise;
      if (changed()) return empty;
      const prefix = line.slice(fallback.from.ch,cursor.ch);
      return {...fallback,list:items.filter(item => item.text.startsWith(prefix) && item.text !== prefix).slice(0,60)};
    } catch {
      if (pending?.key === key) pending = null;
      return changed() ? empty : fallback;
    }
  };
}

export function setupCodeEditor(editor, sizeChoice, storage, completions) {
  const CM = globalThis.CodeMirror;
  const hints = completions ? contextualHints(completions.complete,completions.standard) : cppHints;
  let tabSize = validTabSize(storage.get("tab-size"));
  let syncing = false, leaveWithTab = false, hintTimer;
  const cm = CM.fromTextArea(editor, {
    mode:"text/x-c++src", lineNumbers:true, gutters:['CodeMirror-linenumbers','compiler-errors'], indentUnit:tabSize, tabSize, indentWithTabs:false,
    smartIndent:true, electricChars:true, autoCloseBrackets:true, matchBrackets:true,
    inputStyle:"contenteditable", screenReaderLabel:"Codice C++", placeholder:editor.placeholder, viewportMargin:20,
    phrases:{"Search:":"Cerca:","Replace:":"Sostituisci:","Replace all:":"Sostituisci tutto:",
      "With:":"Con:","Replace with:":"Sostituisci con:","Replace?":"Sostituire?",Yes:"Sì",No:"No",All:"Tutti",Stop:"Ferma",
      "(Use /re/ syntax for regexp search)":"(Usa /espressione/ per cercare con espressioni regolari)"},
    extraKeys: {
      Tab(cm) {
        if (cm.somethingSelected()) cm.indentSelection("add");
        else cm.replaceSelection(" ".repeat(tabSize), "end", "+input");
      },
      "Shift-Tab": cm => cm.indentSelection("subtract"),
      "Ctrl-Space": cm => cm.showHint({hint:hints,completeSingle:false}),
      "Ctrl-/":"toggleComment", "Cmd-/":"toggleComment",
      "Ctrl-F":"findPersistent", "Cmd-F":"findPersistent",
      "Ctrl-H":"replace", "Cmd-Alt-F":"replace",
      Esc() { leaveWithTab = true; }
    }
  });
  const wrapper = cm.getWrapperElement(), gutter = editor.parentElement.querySelector("#gutter");
  cm.getInputField().setAttribute("aria-describedby", "code-edit-hint");
  cm.getInputField().setAttribute("role", "textbox");
  cm.getInputField().setAttribute("aria-multiline", "true");
  let diagnostics = [];
  function clearDiagnostics() {
    if (!diagnostics.length) return;
    cm.operation(() => {
      diagnostics.forEach(record => {
        record.marks.forEach(mark => mark.clear()); record.widget.clear();
        cm.removeLineClass(record.handle,'background','compiler-error-line');
      });
      diagnostics = []; cm.clearGutter('compiler-errors');
    });
  }
  function showDiagnostics(message) {
    clearDiagnostics();
    const errors = compilerErrors(message, editor.value), groups = new Map();
    errors.forEach(error => {
      if (!groups.has(error.line)) groups.set(error.line,[]);
      groups.get(error.line).push(error);
    });
    cm.operation(() => groups.forEach((items,line) => {
      const node = editor.ownerDocument.createElement('div'); node.className = 'compiler-error-detail';
      const marker = editor.ownerDocument.createElement('span'); marker.className = 'compiler-error-marker'; marker.textContent = '!';
      marker.setAttribute('role','img'); marker.setAttribute('aria-label',`Errore alla riga ${line + 1}`);
      marker.title = items.map(item => item.message).join('\n');
      const marks = [], content = cm.getLine(line);
      items.forEach(item => {
        const label = editor.ownerDocument.createElement('div');
        label.textContent = `${item.atEnd ? 'Fine del sorgente' : 'Errore'}: ${item.message}`; node.append(label);
        if (!content.length) return;
        const from = Math.min(item.ch,content.length - 1);
        const token = cm.getTokenAt({line,ch:from + 1});
        const end = Math.min(content.length,Math.max(from + 1,token.end || from + 1));
        marks.push(cm.markText({line,ch:from},{line,ch:end},{className:'compiler-error-token',title:item.message}));
      });
      const handle = cm.addLineClass(line,'background','compiler-error-line');
      const widget = cm.addLineWidget(line,node,{noHScroll:true});
      cm.setGutterMarker(line,'compiler-errors',marker);
      diagnostics.push({marks,widget,handle});
    }));
    if (errors.length) cm.scrollIntoView({line:errors[0].line,ch:errors[0].ch},60);
  }
  function applySize() {
    sizeChoice.value = String(tabSize);
    editor.parentElement.style.setProperty("--tab-size", tabSize);
    cm.setOption("tabSize",tabSize); cm.setOption("indentUnit",tabSize);
  }
  applySize();
  sizeChoice.addEventListener("change", () => {
    tabSize = validTabSize(sizeChoice.value); applySize(); storage.set("tab-size",String(tabSize));
  });
  function sync() {
    if (cm.getValue() !== editor.value) {
      clearDiagnostics();
      syncing = true;
      try { cm.setValue(editor.value); cm.clearHistory(); } finally { syncing = false; }
    }
    const wasHidden = wrapper.hidden;
    wrapper.hidden = editor.hidden;
    gutter.hidden = !editor.hidden;
    if (editor.hidden) cm.closeHint();
    if (wasHidden && !wrapper.hidden) cm.refresh();
  }
  cm.on("change", () => {
    if (syncing) return;
    clearDiagnostics();
    cm.save(); editor.dispatchEvent(new Event("input",{bubbles:true}));
  });
  cm.on("inputRead", (cm,change) => {
    clearTimeout(hintTimer);
    if (change.origin !== "+input" || !/[A-Za-z0-9_.>:]$/.test(change.text.join("\n"))) return;
    hintTimer = setTimeout(() => {
      const cur = cm.getCursor();
      const prefix = cm.getLine(cur.line).slice(0,cur.ch).match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0] || "";
      const member = /(?:\.|->|::)$/.test(cm.getLine(cur.line).slice(0,cur.ch));
      if (cm.hasFocus() && !wrapper.hidden && (prefix.length >= 2 || member) && !cm.state.completionActive)
        cm.showHint({hint:hints,completeSingle:false});
    },300);
  });
  cm.on("keydown", (cm,event) => {
    if (leaveWithTab && event.key === "Tab") event.codemirrorIgnore = true;
    leaveWithTab = false;
  });
  cm.on("mousedown", () => { leaveWithTab = false; });
  cm.on("blur", () => { leaveWithTab = false; clearTimeout(hintTimer); });
  new ResizeObserver(() => { if (wrapper.clientWidth) cm.refresh(); }).observe(editor.parentElement);
  sync();
  return {sync, focus:() => cm.focus(), showDiagnostics, clearDiagnostics};
}
