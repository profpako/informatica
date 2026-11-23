"""Verifica ricorsione, link relativi, escaping e aggiornamenti ripetuti."""

from pathlib import Path
from tempfile import TemporaryDirectory
from build_index import resource_cards, render

with TemporaryDirectory() as directory:
    root = Path(directory)
    for folder, html in {
        "": "<title>Indice</title>",
        "elaborazione": '<title>Numeri</title><h1>Numeri &amp; <span>bit</span></h1><h1>Altro titolo</h1><meta name="description" content="Prova &lt;13&gt;">',
        "algoritmi/livello 1": "<title>Gli algoritmi</title>",
        ".privato": "<title>Privato</title>",
        "_site/numeri": "<title>Copia</title>",
    }.items():
        target = root / folder / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(html, encoding="utf-8")
    cards = resource_cards(root)
    assert len(cards) == 4, cards
    for folder in ("cpp-visualizer", "student-extractor"):
        target = root / folder / "index.html"
        target.parent.mkdir()
        target.write_text("<title>Applicazione copiata da Pages</title>", encoding="utf-8")
    assert resource_cards(root) == cards
    generated = "".join(cards.values())
    assert 'href="./algoritmi/livello%201/index.html"' in generated
    assert "Numeri &amp; bit" in generated
    assert "Altro titolo" not in generated
    assert "Prova &lt;13&gt;" in generated
    assert '<span class="lesson-path">Algoritmi</span>' in generated
    template = (
        "<!-- COUNT:START --><!-- COUNT:END -->"
        "<!-- RESOURCES:START --><!-- RESOURCES:END -->"
    )
    result = render(template, cards)
    assert "4 risorse" in result
    assert result.count('class="lesson"') == 4
    assert render(result, cards) == result
    assert result.index("./elaborazione/index.html") < result.index("./cpp-visualizer/") < result.index("./algoritmi/")
    assert 'href="./student-extractor/"' in result and "Student Extractor" in result
    assert "1 risorsa</span>" in render(template, {"elaborazione/index.html": cards["elaborazione/index.html"]})
    assert "Le risorse saranno disponibili qui." in render(template, {})
    try:
        render("senza marcatori", cards)
    except ValueError:
        pass
    else:
        raise AssertionError("Il template non valido deve essere rifiutato")

print("Verifica indice: OK")
