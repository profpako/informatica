'use strict';
// Run against npm start: node tests/sidebar-export.browser.cjs /path/to/playwright [url]
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const exportFile = async kind => {
    await page.locator('#export-menu summary').click();
    const downloading = page.waitForEvent('download');
    await page.locator(`[data-export="${kind}"]`).click();
    return fs.readFile(await (await downloading).path());
  };
  try {
    await page.goto(process.argv[3] || 'http://127.0.0.1:4173');
    assert.match(await page.locator('[data-export="png"]').textContent(), /Schema ER \(immagine\).*PNG/);
    await page.locator('#text-tab').click();
    const draft = 'ENTITA: proprietario\n- id [ID]\nENTITA: auto\n- id [ID]\n- nota [0,1]\nASSOCIAZIONE: possiede: proprietario [0,N] -> auto [0,1]';
    await page.locator('#schema-text').fill(draft);
    const oldWidth = await page.locator('#canvas').evaluate(el => el.clientWidth);
    await page.locator('#sidebar-toggle').click();
    assert.equal(await page.locator('#sidebar').isVisible(), false);
    assert.equal(await page.locator('#sidebar-toggle').getAttribute('aria-expanded'), 'false');
    assert.ok(await page.locator('#canvas').evaluate(el => el.clientWidth) > oldWidth);
    await page.locator('#sidebar-toggle').press('Enter');
    assert.equal(await page.locator('#schema-text').inputValue(), draft);
    await page.locator('#generate-text').click();
    await page.locator('#sidebar-toggle').click();
    await page.locator('#diagram-content .entity').first().press('Enter');
    assert.equal(await page.locator('#sidebar').isVisible(), true, 'Diagram editor reopens the sidebar');
    assert.equal(await page.locator('#node-name').evaluate(el => el === document.activeElement), true);
    await page.locator('#form-back').click();
    await page.locator('#relational-generate').click();
    assert.match(await page.locator('[data-export="png"]').textContent(), /Schema relazionale \(immagine\).*PNG/);
    assert.match(await page.locator('[data-export="svg"]').textContent(), /Schema relazionale \(vettoriale\).*SVG/);
    const before = await page.evaluate(() => localStorage.getItem('trama-er-v1'));
    const svg = (await exportFile('svg')).toString();
    assert.match(svg, /Schema relazionale:/);
    assert.match(svg, /proprietari/);
    assert.match(svg, /class="relational-pk"/);
    assert.match(svg, /class="relational-fk"/);
    assert.match(svg, /nota\*/);
    assert.doesNotMatch(svg, /class="entity/);
    const png = await exportFile('png');
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    const pixels = await page.evaluate(async data => {
      const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let dark = 0; for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 200 && pixels[i + 1] < 200 && pixels[i + 2] < 200) dark++;
      return { width: img.width, height: img.height, dark };
    }, png.toString('base64'));
    assert.ok(pixels.width > 300 && pixels.height > 100 && pixels.dark > 500, 'PNG contains rendered content');
    assert.match((await exportFile('relational')).toString(), /SCHEMA RELAZIONALE:/);
    assert.equal(await page.evaluate(() => localStorage.getItem('trama-er-v1')), before, 'Exports leave the saved project intact');
    await page.locator('#relational-view').selectOption('tables');
    assert.match((await exportFile('svg')).toString(), /Schema relazionale:/);
    for (const width of [390, 320, 1800]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('#export-menu summary').click();
      assert.equal(await page.getByRole('button', { name: 'Schema relazionale (immagine) PNG', exact: true }).isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Explicit export labels fit the menu on mobile');
      await page.locator('#export-menu summary').click();
      await page.locator('#sidebar-toggle').click();
      assert.equal(await page.locator('#sidebar').isVisible(), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator('#sidebar-toggle').click();
      assert.equal(await page.locator('#sidebar').isVisible(), true);
    }
    await page.locator('#schema-stage').selectOption('initial');
    assert.match(await page.locator('[data-export="png"]').textContent(), /Schema ER \(immagine\).*PNG/);
    assert.match((await exportFile('svg')).toString(), /class="diagram-node entity/);
    assert.equal((await exportFile('png')).subarray(1, 4).toString(), 'PNG');
    assert.deepEqual(errors, []);
    await fs.writeFile('/private/tmp/trama-relational-export.svg', svg);
    await fs.writeFile('/private/tmp/trama-relational-export.png', png);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#sidebar-toggle').click();
    await page.locator('#schema-stage').selectOption('relational');
    await page.locator('#export-menu summary').click();
    await page.screenshot({ path: '/private/tmp/trama-sidebar-collapsed.png' });
    console.log('PASS: sidebar toggle, keyboard, drafts, diagram editor, responsive layout, relational SVG/PNG/TXT and ER export');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
