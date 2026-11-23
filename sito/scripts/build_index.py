"""Aggiorna l'indice dalle pagine del sito e dalle applicazioni pubblicate."""

import re
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {"node_modules", "__pycache__", "scripts", "tests", "_site", "dist", "build", "assets"}
PUBLISHED_APPS = {
    "cpp-visualizer/index.html": (
        "Laboratorio di programmazione",
        "Scrivi programmi in C++ o costruisci flowchart ed esplora l’esecuzione passo per passo, le variabili in memoria e le chiamate a funzioni e procedure.",
        "C++ e Flowchart",
    ),
    "student-extractor/index.html": (
        "Student Extractor",
        "Gestisci le classi, registra le assenze ed estrai gli studenti per le interrogazioni.",
        "Strumento per docenti",
    ),
}


class Metadata(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.title = []
        self.heading = []
        self.description = ""
        self.active = None
        self.heading_seen = False
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        if tag == "title":
            self.active = tag
        if tag == "h1" and not self.heading_seen:
            self.active = tag
            self.heading_seen = True
        if tag == "meta":
            attrs = dict(attrs)
            if attrs.get("name", "").lower() == "description":
                self.description = attrs.get("content", "")

    def handle_endtag(self, tag):
        if tag == self.active:
            self.active = None

    def handle_data(self, data):
        if self.active == "title":
            self.title.append(data)
        if self.active == "h1":
            self.heading.append(data)


def resource_card(url, title, description, category):
    summary = f"<p>{escape(description)}</p>" if description else ""
    return f'''<a class="lesson" href="{escape(url, quote=True)}">
            <span class="lesson-icon" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="26" height="19" rx="3"/><path d="M11 28h10M16 24v4m-4-14-3 3 3 3m8-6 3 3-3 3M18 12l-4 9"/></svg></span>
            <div class="lesson-body"><span class="lesson-path">{escape(category)}</span>
              <h3>{escape(title)}</h3>{summary}
            </div>
            <span class="open-lesson">Apri <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M8 4v5"/></svg></span>
          </a>'''


def resource_cards(root):
    cards = {}
    for path in sorted(root.rglob("index.html")):
        relative = path.relative_to(root)
        route = relative.as_posix()
        if len(relative.parts) < 2 or route in PUBLISHED_APPS:
            continue
        if any(part.startswith(".") or part in EXCLUDED for part in relative.parts[:-1]):
            continue
        meta = Metadata(path.read_text(encoding="utf-8-sig"))
        title = " ".join("".join(meta.heading or meta.title).split()) or path.parent.name.replace("-", " ").capitalize()
        parents = relative.parts[:-2]
        category = " / ".join(p.replace("-", " ").replace("_", " ").capitalize() for p in parents) or "Informatica"
        cards[route] = resource_card("./" + quote(route, safe="/"), title, meta.description, category)
    for path, (title, description, category) in PUBLISHED_APPS.items():
        cards[path] = resource_card("./" + path.removesuffix("index.html"), title, description, category)
    ordered = {path: cards[path] for path in ("elaborazione/index.html", "cpp-visualizer/index.html") if path in cards}
    ordered.update(cards)
    return ordered


def render(source, cards):
    count = len(cards)
    sections = {
        "COUNT": f'<span class="count">{count} {"risorsa" if count == 1 else "risorse"}</span>',
        "RESOURCES": "\n          ".join(cards.values()) if cards else '<p class="empty">Le risorse saranno disponibili qui.</p>',
    }
    for name, content in sections.items():
        pattern = rf"(<!-- {name}:START -->).*?(<!-- {name}:END -->)"
        source, replacements = re.subn(pattern, lambda m: m[1] + "\n          " + content + "\n          " + m[2], source, flags=re.S)
        if replacements != 1:
            raise ValueError(f"Marcatori {name} mancanti o duplicati in index.html")
    return source


if __name__ == "__main__":
    index = ROOT / "index.html"
    cards = resource_cards(ROOT)
    index.write_text(render(index.read_text(encoding="utf-8"), cards), encoding="utf-8")
    print(f"Indice aggiornato: {len(cards)} risorse.")
