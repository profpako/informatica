'use strict';
const ProgramFiles = (() => {
  const baseName = name => name.replace(/(?:\.flow\.json|\.cpp|\.cc|\.cxx|\.json)$/i, '').slice(0, 80);
  function filename(name, extension) {
    let base = baseName(name).normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ').replace(/^\.+|[. ]+$/g, '').trim();
    if (!base) base = 'programma';
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(base)) base = '_' + base;
    return base + extension;
  }
  async function readCpp(file) {
    if (file.size > 30000) throw new Error('File troppo grande: massimo 30.000 byte, come per l’esecuzione.');
    let source;
    try { source = new TextDecoder('utf-8', {fatal: true}).decode(await file.arrayBuffer()); }
    catch { throw new Error('Scegli un file di testo C++ con codifica UTF-8.'); }
    if (source.includes('\0')) throw new Error('Il file contiene dati binari: scegli un sorgente C++.');
    return source;
  }
  function download(text, filename, type) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(text instanceof Blob ? text : new Blob([text], {type: type + ';charset=utf-8'}));
    link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  return {baseName, filename, readCpp, download};
})();
if (typeof module !== 'undefined') module.exports = ProgramFiles;
