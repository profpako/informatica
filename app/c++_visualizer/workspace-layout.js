export function setupWorkspaceLayout(root, divider, storage) {
  const desktop = window.matchMedia('(min-width: 1051px)');
  const saved = storage.get('workspace-width');
  let preferred = saved !== null && saved.trim() !== '' && Number.isFinite(Number(saved)) ? Number(saved) : 50;
  preferred = Math.max(30, Math.min(70, preferred));
  let pointer = null;

  function geometry() {
    const style = window.getComputedStyle(root);
    const padding = parseFloat(style.paddingLeft);
    const width = root.clientWidth - padding - parseFloat(style.paddingRight) - divider.offsetWidth;
    return { left: root.getBoundingClientRect().left + padding, width,
      min: Math.max(30, Math.ceil(420 / width * 100)),
      max: Math.min(70, Math.floor((width - 400) / width * 100)) };
  }
  function update(next) {
    if (!desktop.matches) return;
    const { min, max } = geometry();
    const value = Math.max(min, Math.min(max, Math.round((next ?? preferred) * 10) / 10));
    root.style.setProperty('--workspace-share', `${value}fr`);
    root.style.setProperty('--memory-share', `${100 - value}fr`);
    divider.setAttribute('aria-valuemin', min);
    divider.setAttribute('aria-valuemax', max);
    divider.setAttribute('aria-valuenow', value);
    divider.setAttribute('aria-valuetext', `Programma ${value}%, memoria ${Math.round((100 - value) * 10) / 10}%`);
    if (next !== undefined) preferred = value;
  }
  function save() { storage.set('workspace-width', String(preferred)); }
  function finish(event) {
    if (pointer === null || event.pointerId !== pointer) return;
    const id = pointer;
    pointer = null;
    root.classList.remove('resizing');
    if (divider.hasPointerCapture(id)) divider.releasePointerCapture(id);
    save();
  }
  divider.addEventListener('pointerdown', event => {
    if (!desktop.matches || event.button !== 0 || event.isPrimary === false || pointer !== null) return;
    pointer = event.pointerId;
    divider.setPointerCapture(pointer);
    divider.focus({preventScroll:true});
    root.classList.add('resizing');
    event.preventDefault();
  });
  divider.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer) return;
    const { left, width } = geometry();
    update((event.clientX - left - divider.offsetWidth / 2) / width * 100);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) divider.addEventListener(name, finish);
  divider.addEventListener('keydown', event => {
    if (!desktop.matches) return;
    const value = Number(divider.getAttribute('aria-valuenow'));
    const values = { ArrowLeft: value - 1, ArrowRight: value + 1, Home: 30, End: 70, Enter: 50 };
    if (!(event.key in values)) return;
    event.preventDefault(); update(values[event.key]); save();
  });
  divider.addEventListener('dblclick', () => { update(50); save(); });
  window.addEventListener('resize', () => {
    if (!desktop.matches && pointer !== null) finish({ pointerId: pointer });
    update();
  });
  update();
}
