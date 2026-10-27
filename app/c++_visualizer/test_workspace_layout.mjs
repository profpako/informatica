import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('./workspace-layout.js', import.meta.url), 'utf8');
const {setupWorkspaceLayout} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

function fixture(saved = null, width = 1440) {
  const view = new EventTarget(), divider = new EventTarget(), values = new Map(), classes = new Set();
  const media = {matches: width > 1050};
  Object.assign(view, {matchMedia: () => media, getComputedStyle: () => ({paddingLeft:'24px', paddingRight:'24px'})});
  globalThis.window = view;
  let captured = null;
  Object.assign(divider, {offsetWidth:20, setAttribute:(k,v) => values.set(k,String(v)), getAttribute:k => values.get(k),
    setPointerCapture:id => { captured=id; }, hasPointerCapture:id => captured===id,
    releasePointerCapture:() => { captured=null; }, focus:() => { divider.focused=true; }});
  const root = {clientWidth:width, getBoundingClientRect:() => ({left:0}),
    style:{setProperty:(k,v) => values.set(k,String(v))}, classList:{add:v => classes.add(v), remove:v => classes.delete(v)}};
  const storage = {get:() => saved, set:(key,value) => { assert.equal(key,'workspace-width'); saved=value; }};
  setupWorkspaceLayout(root, divider, storage);
  function event(type, props = {}) {
    const e = Object.assign(new Event(type,{cancelable:true}), {pointerId:1, button:0, isPrimary:true}, props);
    divider.dispatchEvent(e); return e;
  }
  return {root, divider, values, classes, event, saved:() => saved,
    resize(width) { root.clientWidth=width; media.matches=width>1050; view.dispatchEvent(new Event('resize')); }};
}

// Tastiera, persistenza e reset condivisi: la modalità non interviene sul layout.
const keyboard = fixture();
assert.equal(keyboard.values.get('--workspace-share'),'50fr');
assert.equal(keyboard.event('keydown',{key:'ArrowRight'}).defaultPrevented,true);
assert.equal(keyboard.values.get('aria-valuenow'),'51');
assert.equal(keyboard.saved(),'51');
keyboard.event('keydown',{key:'Home'});
assert.equal(keyboard.values.get('aria-valuenow'),keyboard.values.get('aria-valuemin'));
keyboard.event('keydown',{key:'End'});
assert.equal(keyboard.values.get('aria-valuenow'),keyboard.values.get('aria-valuemax'));
keyboard.event('keydown',{key:'Enter'});
assert.equal(keyboard.saved(),'50');
keyboard.event('keydown',{key:'ArrowLeft'});
keyboard.event('dblclick');
assert.equal(keyboard.saved(),'50');
assert.equal(keyboard.event('keydown',{key:'Tab'}).defaultPrevented,false);
assert.equal(fixture('62').values.get('--workspace-share'),'62fr');
for (const invalid of ['NaN','Infinity','', '   ', '<script>']) assert.equal(fixture(invalid).values.get('aria-valuenow'),'50');
assert.equal(fixture('1000').values.get('aria-valuenow'),'70');

// Il drag cattura il puntatore, rispetta i limiti e salva solo alla conclusione.
const drag = fixture();
drag.event('pointerdown');
assert.equal(drag.divider.focused,true);
assert.equal(drag.classes.has('resizing'),true);
drag.event('pointermove',{pointerId:2,clientX:0});
assert.equal(drag.values.get('aria-valuenow'),'50');
drag.event('pointermove',{clientX:24+10+1372*.6});
assert.equal(drag.values.get('aria-valuenow'),'60');
assert.equal(drag.saved(),null);
drag.event('pointerup');
assert.equal(drag.saved(),'60');
assert.equal(drag.classes.size,0);
assert.equal(fixture(drag.saved()).values.get('aria-valuenow'),'60');
for (const ending of ['pointercancel','lostpointercapture']) {
  drag.event('pointerdown'); drag.event('pointermove',{clientX:9999}); drag.event(ending);
  assert.equal(drag.classes.size,0);
  assert.equal(drag.values.get('aria-valuenow'),drag.values.get('aria-valuemax'));
}
const secondary = fixture();
secondary.event('pointerdown',{button:2}); secondary.event('pointermove',{clientX:0});
assert.equal(secondary.values.get('aria-valuenow'),'50');

// Cambiare finestra adatta i minimi, ma conserva la preferenza e annulla il drag sul mobile.
const responsive = fixture('65');
responsive.resize(1100);
assert.equal(responsive.values.get('aria-valuenow'),responsive.values.get('aria-valuemax'));
assert.equal(responsive.saved(),'65');
responsive.resize(1440);
assert.equal(responsive.values.get('aria-valuenow'),'65');
responsive.event('pointerdown'); responsive.resize(800);
assert.equal(responsive.classes.size,0);
const mobile = fixture('60',800);
mobile.event('pointerdown'); mobile.event('keydown',{key:'ArrowLeft'});
assert.equal(mobile.values.has('--workspace-share'),false);
mobile.resize(1440);
assert.equal(mobile.values.get('aria-valuenow'),'60');
console.log('Layout condiviso: drag, tastiera, limiti, persistenza, reset e responsive verificati.');
