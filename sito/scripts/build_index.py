"""Aggiorna l'indice dalle lezioni contenute nelle cartelle e sottocartelle."""

import re
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {"node_modules", "__pycache__", "scripts", "tests", "_site", "dist", "build", "assets"}


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


def lesson_cards(root):
    cards = []
    for path in sorted(root.rglob("index.html")):
        relative = path.relative_to(root)
        if len(relative.parts) < 2 or any(p.startswith(".") or p in EXCLUDED for p in relative.parts[:-1]):
            continue
        meta = Metadata(path.read_text(encoding="utf-8-sig"))
        title = " ".join("".join(meta.heading or meta.title).split()) or path.parent.name.replace("-", " ").capitalize()
        description = meta.description or "Apri la lezione per consultare i materiali e svolgere le attività."
        parents = relative.parts[:-2]
        category = " / ".join(p.replace("-", " ").replace("_", " ").capitalize() for p in parents) or "Informatica"
        url = "./" + quote(relative.as_posix(), safe="/")
        cards.append(f'''<a class="lesson" href="{escape(url, quote=True)}">
            <span class="lesson-icon" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="26" height="19" rx="3"/><path d="M11 28h10M16 24v4m-4-14-3 3 3 3m8-6 3 3-3 3M18 12l-4 9"/></svg></span>
            <div class="lesson-body"><span class="lesson-path">{escape(category)}</span>
              <h3>{escape(title)}</h3><p>{escape(description)}</p>
            </div>
            <span class="open-lesson">Apri la lezione <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M8 4v5"/></svg></span>
          </a>''')
    return cards


def render(source, cards):
    count = len(cards)
    sections = {
        "COUNT": f'<span class="count">{count} {"lezione" if count == 1 else "lezioni"}</span>',
        "LESSONS": "\n          ".join(cards) or '<p class="empty">Le lezioni saranno disponibili qui.</p>',
    }
    for name, content in sections.items():
        pattern = rf"(<!-- {name}:START -->).*?(<!-- {name}:END -->)"
        source, replacements = re.subn(pattern, lambda m: m[1] + "\n          " + content + "\n          " + m[2], source, flags=re.S)
        if replacements != 1:
            raise ValueError(f"Marcatori {name} mancanti o duplicati in index.html")
    return source


if __name__ == "__main__":
    index = ROOT / "index.html"
    cards = lesson_cards(ROOT)
    index.write_text(render(index.read_text(encoding="utf-8"), cards), encoding="utf-8")
    print(f"Indice aggiornato: {len(cards)} lezioni.")
