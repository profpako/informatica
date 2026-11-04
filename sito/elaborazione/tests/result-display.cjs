const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const {chromium} = require(process.argv[2] || 'playwright');

(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    const checkResult = async (expected) => {
      assert.match(await page.locator('#result-number').innerText(), expected);
      assert.equal(await page.locator('#progress').getAttribute('aria-valuenow'), '100');
      assert.equal(await page.locator('#play').isDisabled(), true);
    };
    assert.match(await page.locator('#step-count').innerText(), /^Passaggio 0 di/);
    await page.selectOption('#result-display', 'instant');
    await checkResult(/00001101/);
    await page.fill('#number-input', '42');
    await page.click('#convert-button');
    await checkResult(/00101010/);
    await page.click('[data-direction="bin"]');
    await checkResult(/42/);
    await page.click('[data-bit="7"]');
    await checkResult(/43/);
    await page.click('#tab-signed');
    await page.fill('#number-input', '-13');
    for (const [rep, bits] of [['sm', '10001101'], ['c1', '11110010'], ['c2', '11110011']]) {
      await page.click(`[data-rep="${rep}"]`);
      await checkResult(new RegExp(bits));
    }
    await page.check('#quick-method');
    await checkResult(/11110011/);
    await page.click('#tab-sum');
    await page.click('[data-sum="127,1"]');
    await checkResult(/10000000/);
    assert.match(await page.locator('#result-status').innerText(), /Overflow/);
    await page.fill('#number-input', 'errato');
    await page.click('#convert-button');
    assert.equal(await page.locator('#error').isVisible(), true);
    await page.click('[data-sum="13,-5"]');
    await page.selectOption('#result-display', 'animated');
    assert.match(await page.locator('#step-count').innerText(), /^Passaggio 0 di/);
    await page.click('#next');
    await page.click('#play');
    assert.equal(await page.evaluate(() => timer !== null), true);
    await page.selectOption('#result-display', 'instant');
    await checkResult(/00001000/);
    assert.equal(await page.evaluate(() => timer), null);
    assert.equal(await page.evaluate(() => runSelfChecks().startsWith('Controlli superati')), true);
    assert.deepEqual(errors, []);
    console.log('OK: risultato immediato, animazione, conversioni, somma, overflow e validazione.');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
