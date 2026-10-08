'use strict';
// Run against npm start: node tests/display.browser.cjs /path/to/playwright
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('dialog', dialog => dialog.accept().catch(() => {}));
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('trama-er-v1')));
  const openView = async () => { if (await page.locator('#display-menu').getAttribute('open') === null) await page.locator('#display-menu summary').click(); };
  const exportFile = async kind => {
    await page.locator('#export-menu summary').click();
    const downloading = kind === 'json' ? null : page.waitForEvent('download');
    await page.locator(`[data-export="${kind}"]`).click();
    if (kind !== 'json') return fs.readFile(await (await downloading).path());
    const jsonDownload = page.waitForEvent('download');
    await page.locator('#export-download').click();
    return fs.readFile(await (await jsonDownload).path());
  };
  try {
    await page.goto(process.argv[3] || 'http://127.0.0.1:4173');
    await page.locator('#restructure').click();
    const before = await saved(), defaultMarkup = await page.locator('#diagram-content').innerHTML();
    const geometry = before.derived.model;
    const notationLabels = [
      'ER classico - Notazione min-max (convenzione Look Here) - Atzeni',
      'ER classico - Notazione max (convenzione Look Across o invertita)',
      'ER classico - Entrambe le notazioni'
    ];
    assert.deepEqual(await page.locator('#cardinality-style option').allTextContents(), notationLabels);
    assert.equal(await page.locator('.notation').textContent(), notationLabels[0]);
    await openView();
    const menuWidths = await page.locator('#cardinality-style').evaluate(select => {
      const css = getComputedStyle(select), context = document.createElement('canvas').getContext('2d');
      context.font = css.font;
      return { menu: select.parentElement.getBoundingClientRect().width, available: select.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight), labels: [...select.options].map(option => context.measureText(option.textContent).width) };
    });
    assert.equal(menuWidths.menu, 500);
    assert.ok(menuWidths.labels.every(width => width <= menuWidths.available), 'The compact menu fits all notation labels');
    await page.locator('#cardinality-style').selectOption('uml');
    assert.equal(await page.locator('.notation').textContent(), notationLabels[1]);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('#diagram-content .cardinality:not(.cardinality-uml)').count(), 0);
    assert.ok(await page.locator('.cardinality-uml').count() > 0);
    assert.ok((await page.locator('.cardinality-uml').allTextContents()).every(s => s === '1' || s === 'N'));
    await page.locator('#cardinality-style').selectOption('both');
    assert.equal(await page.locator('.notation').textContent(), notationLabels[2]);
    await page.locator('#show-relationship-type').check();
    const zoomBeforeFonts = await page.locator('#diagram').getAttribute('viewBox');
    await page.locator('[data-font-target="nodes"][data-font-step="1"]').click();
    assert.equal(await page.locator('#font-nodes').inputValue(), '21');
    await page.locator('[data-font-target="nodes"][data-font-step="-1"]').click();
    await page.locator('#font-nodes').fill('40'); await page.locator('#font-nodes').press('Tab');
    assert.equal(await page.locator('[data-font-target="nodes"][data-font-step="1"]').isDisabled(), true);
    await page.locator('#font-nodes').fill('8'); await page.locator('#font-nodes').press('Tab');
    assert.equal(await page.locator('[data-font-target="nodes"][data-font-step="-1"]').isDisabled(), true);
    for (const [key, size] of Object.entries({ nodes: 28, attributes: 24, cardinalities: 22, badges: 12, notes: 19, statement: 21 })) {
      await page.locator(`#font-${key}`).fill(String(size));
      await page.locator(`#font-${key}`).press('Tab');
    }
    assert.equal(await page.locator('#diagram').getAttribute('viewBox'), zoomBeforeFonts, 'Font controls preserve the current zoom');
    assert.deepEqual(await page.evaluate(() => ['.diagram-node text', '.attribute-label', '.cardinality', '.relationship-type text', '.role'].map(selector => getComputedStyle(document.querySelector(selector)).fontSize)), ['28px', '24px', '22px', '12px', '19px']);
    const after = await saved();
    assert.deepEqual(after.model, before.model);
    assert.deepEqual(after.derived, before.derived);
    assert.deepEqual(after.display, { cardinalityStyle: 'both', showRelationshipType: true, statementHeight: 200, fontSizes: { nodes: 28, attributes: 24, cardinalities: 22, badges: 12, notes: 19, statement: 21 } });
    assert.equal(await page.locator('.relationship-type').count(), geometry.relationships.length);
    assert.equal(await page.locator('#derived-status').textContent(), 'Ristrutturazione aggiornata');
    await page.keyboard.press('Escape');
    await page.locator('#fit').click();
    await page.screenshot({ path: '/private/tmp/trama-er-display-desktop.png' });
    await page.reload();
    assert.deepEqual((await saved()).display, after.display);
    assert.equal(await page.locator('#cardinality-style').inputValue(), 'both');
    assert.equal(await page.locator('.notation').textContent(), notationLabels[2]);
    const svg = (await exportFile('svg')).toString();
    assert.match(svg, /max N/); assert.match(svg, /relationship-type/); assert.match(svg, /fill:#245d85/);
    assert.match(svg, /\.diagram-node text\{font-size:28px\}/);
    assert.match(svg, /\.attribute-label\{font-size:24px\}/);
    const png = await exportFile('png');
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    const exported = JSON.parse((await exportFile('json')).toString());
    assert.deepEqual(exported.display, after.display);
    assert.deepEqual(exported.relationships, before.model.relationships);
    assert.equal(exported.entities[0].display, undefined);
    const input = async payload => {
      await page.locator('#file-input').setInputFiles({ name: 'schema.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
      await page.waitForFunction(expected => JSON.stringify(JSON.parse(localStorage.getItem('trama-er-v1')).display) === JSON.stringify(expected), payload.display || { cardinalityStyle: 'university', showRelationshipType: false, statementHeight: 200, fontSizes: { nodes: 20, attributes: 17, cardinalities: 17, badges: 14, notes: 15, statement: 14 } });
    };
    await openView();
    await page.locator('#cardinality-style').selectOption('university');
    await page.locator('#show-relationship-type').uncheck();
    await page.locator('#reset-fonts').click();
    assert.equal(await page.locator('#diagram-content').innerHTML(), defaultMarkup);
    await page.keyboard.press('Escape');
    await input(exported);
    assert.deepEqual((await saved()).display, after.display);
    await page.locator('#schema-stage').selectOption('restructured');
    assert.equal(await page.locator('.relationship-type').count(), geometry.relationships.length);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    assert.equal(await page.locator('#diagram').getAttribute('viewBox'), await page.evaluate(() => { const b = ER.render(shownModel(), '', display).bounds; return `${b.x} ${b.y} ${b.w} ${b.h}`; }));
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await page.setViewportSize({ width: 390, height: 844 });
    await openView();
    const menu = await page.locator('.display-options').boundingBox();
    assert.ok(menu.x >= 0 && menu.x + menu.width <= 390);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: '/private/tmp/trama-er-display-mobile.png', fullPage: true });
    await page.keyboard.press('Escape');
    const savedExerciseId = (await saved()).activeExerciseId;
    const legacy = { ...exported }; delete legacy.display;
    await input(legacy);
    assert.deepEqual((await saved()).display, { cardinalityStyle: 'university', showRelationshipType: false, statementHeight: 200, fontSizes: { nodes: 20, attributes: 17, cardinalities: 17, badges: 14, notes: 15, statement: 14 } });
    await page.locator('#example-select').selectOption(savedExerciseId);
    assert.deepEqual((await saved()).display, after.display, 'Opening a saved exercise restores its display preferences');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#text-tab').click();
    await page.locator('#schema-text').fill('TITOLO: Cliente e ordini\nENTITA: Cliente\n- id [ID]\nENTITA: Ordine\n- numero [ID]\nASSOCIAZIONE: effettua: Cliente [0,N] -> Ordine [1,1]');
    await page.locator('#generate-text').click();
    assert.deepEqual(await page.locator('.cardinality-uml').allTextContents(), ['max 1', 'max N']);
    await page.locator('#structure-tab').click();
    await page.locator('#toast').waitFor({ state: 'hidden' });
    await page.screenshot({ path: '/private/tmp/trama-er-display-example.png' });
    const dot = page.locator('.attribute-dot').first(), oldX = Number(await dot.getAttribute('cx'));
    await page.locator('.attribute').first().focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(Number(await dot.getAttribute('cx')), oldX + 5, 'Keyboard movement uses the rendered font-aware position');
    const point = await dot.boundingBox(), oldY = Number(await dot.getAttribute('cy'));
    const move = await page.evaluate(() => view.w / $('diagram').clientWidth * 20);
    await page.mouse.move(point.x + point.width / 2, point.y + point.height / 2);
    await page.mouse.down();
    await page.mouse.move(point.x + point.width / 2 + 20, point.y + point.height / 2, { steps: 3 });
    await page.mouse.up();
    assert.ok(Math.abs(Number(await dot.getAttribute('cx')) - (oldX + 5 + move)) < .1, 'Dragging does not jump to the old default font position');
    assert.equal(Number(await dot.getAttribute('cy')), oldY);
    await openView();
    for (const input of await page.locator('[data-font]').all()) { await input.fill('40'); await input.press('Tab'); }
    assert.deepEqual(await page.evaluate(() => { const bounds = ER.render(shownModel(), '', display).bounds; return [...$('diagram-content').querySelectorAll('text')].filter(text => { const b = text.getBBox(); return b.x < bounds.x || b.y < bounds.y || b.x + b.width > bounds.x + bounds.w || b.y + b.height > bounds.y + bounds.h; }).map(text => text.textContent); }), [], 'Large text remains inside the SVG export bounds');
    assert.deepEqual(errors, []);
    console.log('PASS: notation/font controls, unchanged model/zoom, reset, JSON roundtrip/legacy/undo, reload, SVG/PNG/print, mobile menu');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
