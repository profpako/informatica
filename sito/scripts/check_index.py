"""Verifica ricorsione, link relativi, escaping e aggiornamenti ripetuti."""

from pathlib import Path
from tempfile import TemporaryDirectory
from build_index import lesson_cards, render

with TemporaryDirectory() as directory:
    root = Path(directory)
    for folder, html in {
        "": "<title>Indice</title>",
        "numeri": '<title>Numeri</title><h1>Numeri &amp; <span>bit</span></h1><h1>Altro titolo</h1><meta name="description" content="Prova &lt;13&gt;">',
        "reti/livello 1": "<title>Le reti</title>",
        ".privato": "<title>Privato</title>",
        "_site/numeri": "<title>Copia</title>",
    }.items():
        target = root / folder / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(html, encoding="utf-8")
    cards = lesson_cards(root)
    assert len(cards) == 2, cards
    assert 'href="./reti/livello%201/index.html"' in "".join(cards)
    assert "Numeri &amp; bit" in "".join(cards)
    assert "Altro titolo" not in "".join(cards)
    assert "Prova &lt;13&gt;" in "".join(cards)
    assert '<span class="lesson-path">Reti</span>' in "".join(cards)
    template = "<!-- COUNT:START --><!-- COUNT:END --><!-- LESSONS:START --><!-- LESSONS:END -->"
    result = render(template, cards)
    assert "2 lezioni" in result
    assert render(result, cards) == result
    assert "1 lezione</span>" in render(template, cards[:1])
    assert "Le lezioni saranno disponibili qui." in render(template, [])
    try:
        render("senza marcatori", cards)
    except ValueError:
        pass
    else:
        raise AssertionError("Il template non valido deve essere rifiutato")

print("Verifica indice: OK")
