const CPP_WORDS = ("int float double char bool void long short signed unsigned string std cin cout endl getline " +
  "fixed setprecision setw size_t true false nullptr").split(" ");

export function validTabSize(value) {
  return /^[1-8]$/.test(String(value)) ? Number(value) : 4;
}

export function cppHints(cm) {
  const cursor = cm.getCursor(), line = cm.getLine(cursor.line);
  const prefix = line.slice(0, cursor.ch).match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0] || "";
  const from = {line:cursor.line, ch:cursor.ch - prefix.length};
  const to = {line:cursor.line, ch:cursor.ch + (line.slice(cursor.ch).match(/^\w*/)?.[0].length || 0)};
  if (/\b(?:string|comment)\b/.test(cm.getTokenAt(cursor).type || "")) return {list:[],from,to};
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

export function setupCodeEditor(editor, sizeChoice, storage) {
  const CM = globalThis.CodeMirror;
  let tabSize = validTabSize(storage.get("tab-size"));
  let syncing = false, leaveWithTab = false, hintTimer;
  const cm = CM.fromTextArea(editor, {
    mode:"text/x-c++src", lineNumbers:true, indentUnit:tabSize, tabSize, indentWithTabs:false,
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
      "Ctrl-Space": cm => cm.showHint({hint:cppHints,completeSingle:false}),
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
    cm.save(); editor.dispatchEvent(new Event("input",{bubbles:true}));
  });
  cm.on("inputRead", (cm,change) => {
    clearTimeout(hintTimer);
    if (change.origin !== "+input" || !/[A-Za-z0-9_]$/.test(change.text.join("\n"))) return;
    hintTimer = setTimeout(() => {
      const cur = cm.getCursor();
      const prefix = cm.getLine(cur.line).slice(0,cur.ch).match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0] || "";
      if (cm.hasFocus() && !wrapper.hidden && prefix.length >= 2 && !cm.state.completionActive)
        cm.showHint({hint:cppHints,completeSingle:false});
    },120);
  });
  cm.on("keydown", (cm,event) => {
    if (leaveWithTab && event.key === "Tab") event.codemirrorIgnore = true;
    leaveWithTab = false;
  });
  cm.on("mousedown", () => { leaveWithTab = false; });
  cm.on("blur", () => { leaveWithTab = false; clearTimeout(hintTimer); });
  new ResizeObserver(() => { if (wrapper.clientWidth) cm.refresh(); }).observe(editor.parentElement);
  sync();
  return {sync, focus:() => cm.focus()};
}
