// La build Pages sostituisce soltanto questo adattatore, non l'interfaccia.
export const request = (path, options) => fetch(path, options);
export const storagePrefix = 'cppviz-';
export const connectionError = 'Server locale non raggiungibile. Avvia avvia.command e tieni aperto il terminale, poi ricarica la pagina. Codice e input sono conservati.';
