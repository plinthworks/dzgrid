/**
 * Phase 5 step 8 in real browsers (docs/phase-5-steps/step08-plan.md « Browser »), called by scripts/browser.mjs:
 * `editUndoChecks` (`-- --only edit-undo`): the undo keys sent as the system sends them (CDP `Input.dispatchKeyEvent`
 * with its own `key` and `code`: QWERTY, AZERTY, an Arabic layout; Cmd on a Mac run, Ctrl on a page told it is not a
 * Mac), the focus brought clear of the pinned column, the sticky header and three sticky parents (rects), the
 * sentence, the saving border then the flash after an undo, axe 0, forced colours; fr light Clinic, ar dark Midnight.
 * Firefox and WebKit: the keys (Playwright's) and the tree field's place right to left. `editTreeChecks` (with
 * `--only tree`): the field after the chevron (both directions), Left/Right the caret's, the chevron clicked while
 * editing, `*`, the structure column read-only. `editDetailChecks` (with `--only detail`): Enter and Escape of the
 * panel with editing on, an inner edit and its Ctrl+Z, Escape three times, a panel scrolled away during a save then
 * back (the same grid). `playgroundUndoChecks` (with `--only playground`): the real pages on 127.0.0.1:4700.
 */
const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

/** A key as the system sends it: its own `key` and `code`, with modifiers (no character typed). */
async function sysKey(cdp, key, code, mods = []) {
  const modifiers = mods.reduce((a, m) => a | MOD[m], 0);
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, modifiers, windowsVirtualKeyCode: code.startsWith('Key') ? code.charCodeAt(3) : 0 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers });
}

export async function editUndoChecks(name, ctx, h) {
  const { check, frames, site, axe, OUT } = h;
  const open = async (qs) => {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1000, height: 760 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(site.root(`packages/dom/test/browser/edit-undo.html?${qs}`));
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 }).catch((e) => { throw new Error(`edit-undo.html?${qs}: ${errors.join(' | ')} ${e.message}`); });
    await frames(page, 3);
    return { page, errors };
  };
  const text = (page, id, col = 'stock') => page.evaluate(([id, col]) => window.t.cell(id, col)?.textContent ?? null, [id, col]);
  const focusAt = (page) => page.evaluate(() => { const f = window.t.grid.kernel.focus; return f?.kind === 'cell' ? `${String(f.row).replace(/^d:\d+:/, '')}/${f.column}` : null; });
  const domOn = (page, id, col) => page.evaluate(([id, col]) => document.activeElement === window.t.cell(id, col), [id, col]);
  const listen = (page) => page.evaluate(() => { window.said = []; const el = [...document.querySelectorAll('.dzg-live')].find((x) => x.getAttribute('aria-live') !== 'assertive'); new MutationObserver(() => { if (el.textContent) window.said.push(el.textContent); }).observe(el, { childList: true, characterData: true, subtree: true }); });
  const typeIn = async (page, id, value, col = 'stock') => {
    const c = await page.evaluate(([id, col]) => { const r = window.t.cell(id, col).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, [id, col]);
    await page.mouse.dblclick(c.x, c.y);
    await frames(page, 2);
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(value);
    await page.keyboard.press('Enter');
    await frames(page, 2);
  };
  const answer = async (page, i, ok = true) => { await page.evaluate(([i, ok]) => (ok ? window.t.saves[i].ok() : window.t.saves[i].no({ reason: 'x' })), [i, ok]); await page.waitForTimeout(50); };
  const click = async (page, id, col) => {
    const c = await page.evaluate(([id, col]) => { const r = window.t.cell(id, col).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, [id, col]);
    await page.mouse.click(c.x, c.y);
    await frames(page, 2);
  };

  if (name !== 'chrome') {
    // Firefox and WebKit: the keys (Ctrl, the page told it is not a Mac) and the tree field's place right to left.
    const { page, errors } = await open('locale=fr-FR&theme=light&skin=clinic&mac=0');
    await typeIn(page, 'm1', '42');
    await answer(page, 0);
    await click(page, 'm3', 'stock');
    await page.keyboard.press('Control+z');
    await frames(page, 2);
    const undone = [await text(page, 'm1'), await focusAt(page)];
    await page.keyboard.press('Control+y');
    await frames(page, 2);
    const redone = await text(page, 'm1');
    check(name, 'edit undo: Ctrl+Z gives the value back and the focus to its cell; Ctrl+Y does it again', undone[0] === '38' && undone[1] === 'm1/stock' && redone === '42', { undone, redone });
    check(name, 'edit undo: no page error', errors.length === 0, errors);
    await page.close();
    await treeField(name, ctx, h, open, true);
    return;
  }

  for (const [tag, qs, ar] of [['fr', 'locale=fr-FR&theme=light&skin=clinic', false], ['ar', 'locale=ar-DZ&theme=dark&skin=midnight', true]]) {
    const { page, errors } = await open(`${qs}&mac=0`);
    const cdp = await ctx.newCDPSession(page);
    await listen(page);
    await typeIn(page, 'm1', '42');
    await answer(page, 0);
    await typeIn(page, 'm2', '43');
    await answer(page, 1);
    // The flash marks a cell once in 500 ms: m2's own save flashed it just now.
    await page.waitForTimeout(600);
    await click(page, 'm9', 'stock');
    // QWERTY Ctrl+Z: m2 back, the focus on it; the saving border while held, then the flash at the answer.
    await sysKey(cdp, 'z', 'KeyZ', ['ctrl']);
    await frames(page, 2);
    const u1 = { m2: await text(page, 'm2'), focus: await focusAt(page), dom: await domOn(page, 'm2', 'stock'), cls: await page.evaluate(() => window.t.cell('m2', 'stock').className) };
    await page.waitForTimeout(100);
    const said = await page.evaluate(() => window.said.slice(-1)[0] ?? '');
    const flash = await page.evaluate(() => new Promise((done) => {
      window.t.saves[2].ok();
      let seen = false;
      const t0 = performance.now();
      const f = () => { seen ||= window.t.cell('m2', 'stock').classList.contains('dzg-flash'); if (performance.now() - t0 < 500) requestAnimationFrame(f); else done(seen); };
      requestAnimationFrame(f);
    }));
    check(name, `edit undo ${tag}: Ctrl+Z (QWERTY) gives m2 back (75), the focus on it; the saving border while held, the flash at the answer; « ${said} »`,
      u1.m2 === '75' && u1.focus === 'm2/stock' && u1.dom && /dzg-cell--saving/.test(u1.cls) && flash && said.startsWith(ar ? 'تم التراجع' : 'Annulé'), { u1, flash, said });
    // AZERTY: the key W (key w, code KeyZ) nothing; the key Z (key z, code KeyW) undoes m1.
    await sysKey(cdp, 'w', 'KeyZ', ['ctrl']);
    await frames(page, 2);
    const w = await text(page, 'm1');
    await sysKey(cdp, 'z', 'KeyW', ['ctrl']);
    await frames(page, 2);
    const z = await text(page, 'm1');
    check(name, `edit undo ${tag}: AZERTY — the W key (code KeyZ) does nothing, the Z key (code KeyW) undoes`, w === '42' && z === '38', { w, z });
    // An Arabic layout: Ctrl+غ on the Y key redoes, Ctrl+ظ on the Z key undoes.
    await page.waitForTimeout(50);
    for (let i = 0; i < 8; i++) await page.evaluate(() => window.t.saves.forEach((s) => s.ok()));
    await sysKey(cdp, 'غ', 'KeyY', ['ctrl']);
    await frames(page, 2);
    const y = await text(page, 'm1');
    await sysKey(cdp, 'ظ', 'KeyZ', ['ctrl']);
    await frames(page, 2);
    const z2 = await text(page, 'm1');
    check(name, `edit undo ${tag}: an Arabic layout — Ctrl+غ (KeyY) redoes, Ctrl+ظ (KeyZ) undoes`, y === '42' && z2 === '38', { y, z2 });
    // Clear of the pinned column and the sticky header: a cell far down and to the side.
    await page.evaluate(() => { window.t.api.commit([{ key: window.t.key('m150'), column: 'price', input: { text: '7' } }]); window.t.saves.forEach((s) => s.ok()); });
    await page.waitForTimeout(50);
    await page.evaluate(() => { const v = document.querySelector('.dzg-viewport'); v.scrollTop = 0; v.scrollLeft = 0; });
    await frames(page, 3);
    await click(page, 'm1', 'stock');
    await sysKey(cdp, 'z', 'KeyZ', ['ctrl']);
    await frames(page, 4);
    const r = await page.evaluate(() => {
      const c = window.t.cell('m150', 'price');
      const v = document.querySelector('.dzg-viewport').getBoundingClientRect();
      const head = document.querySelector('.dzg-header').getBoundingClientRect();
      const pin = document.querySelector('.dzg-layer .dzg-row .dzg-seg-start').getBoundingClientRect();
      const b = c.getBoundingClientRect();
      const rtl = getComputedStyle(c).direction === 'rtl';
      return { focused: document.activeElement === c, below: b.top >= head.bottom - 0.5, above: b.bottom <= v.bottom + 0.5, clear: rtl ? b.right <= pin.left + 0.5 : b.left >= pin.right - 0.5, inView: rtl ? b.left >= v.left - 0.5 : b.right <= v.right + 0.5 };
    });
    check(name, `edit undo ${tag}: the cell given back far away comes into view, focused, under the sticky header, clear of the pinned column`, r.focused && r.below && r.above && r.clear && r.inView, r);
    const v = await axe(page);
    check(name, `edit undo ${tag}: axe 0 after the undos`, v.length === 0, v);
    await page.emulateMedia({ forcedColors: 'active' });
    // A keyboard move first: the focus ring is the keyboard's (:focus-visible).
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.evaluate(() => window.t.api.commit([{ key: window.t.key('m3'), column: 'stock', input: { text: '9' } }]));
    await sysKey(cdp, 'z', 'KeyZ', ['ctrl']);
    await frames(page, 2);
    const fc = await page.evaluate(() => { const c = window.t.cell('m3', 'stock'); const o = getComputedStyle(c); return { focused: document.activeElement === c, outline: o.outlineStyle, saving: c.classList.contains('dzg-cell--saving') }; });
    check(name, `edit undo ${tag}: forced colours — the cell given back focused, its ring drawn`, fc.focused && fc.outline !== 'none', fc);
    await page.emulateMedia({ forcedColors: 'none' });
    await page.screenshot({ path: `${OUT}/edit-undo-${tag}.png` });
    await cdp.detach();
    check(name, `edit undo ${tag}: no page error`, errors.length === 0, errors);
    await page.close();
  }
  // A Mac (this page as it is on macOS: Cmd): Cmd+Z undoes, Ctrl+Z does nothing.
  {
    const { page, errors } = await open('locale=fr-FR&theme=light&skin=clinic');
    const cdp = await ctx.newCDPSession(page);
    const mac = await page.evaluate(() => window.t.ctx.mac);
    await typeIn(page, 'm1', '42');
    await answer(page, 0);
    await click(page, 'm4', 'stock');
    await sysKey(cdp, 'z', 'KeyZ', [mac ? 'ctrl' : 'meta']);
    await frames(page, 2);
    const wrong = await text(page, 'm1');
    await sysKey(cdp, 'z', 'KeyZ', [mac ? 'meta' : 'ctrl']);
    await frames(page, 2);
    const right = await text(page, 'm1');
    check(name, `edit undo (${mac ? 'Mac' : 'not a Mac'}): ${mac ? 'Ctrl+Z nothing, Cmd+Z undoes' : 'Cmd+Z nothing, Ctrl+Z undoes'}`, wrong === '42' && right === '38', { mac, wrong, right });
    await cdp.detach();
    check(name, 'edit undo (mac): no page error', errors.length === 0, errors);
    await page.close();
  }
  // Three sticky parents: the bed given back comes out below their copies.
  for (const [tag, qs] of [['fr', 'locale=fr-FR&theme=light&skin=clinic&mode=tree&mac=0'], ['ar', 'locale=ar-DZ&theme=dark&skin=midnight&mode=tree&mac=0']]) {
    const { page, errors } = await open(qs);
    const cdp = await ctx.newCDPSession(page);
    await page.evaluate(() => { window.t.api.commit([{ key: window.t.key('s2w3b6'), column: 'price', input: { text: '1' } }]); window.t.saves.forEach((s) => s.ok()); });
    await page.waitForTimeout(50);
    await page.evaluate(() => { document.querySelector('.dzg-viewport').scrollTop = 0; });
    await frames(page, 3);
    await click(page, 's0', 'stock');
    await sysKey(cdp, 'z', 'KeyZ', ['ctrl']);
    await frames(page, 4);
    const r = await page.evaluate(() => {
      const c = window.t.cell('s2w3b6', 'price');
      const b = c.getBoundingClientRect();
      const copies = [...document.querySelectorAll('.dzg-sticky .dzg-row')].map((x) => x.getBoundingClientRect().bottom);
      const v = document.querySelector('.dzg-viewport').getBoundingClientRect();
      return { focused: document.activeElement === c, top: b.top, copies: copies.length, under: Math.max(...copies, document.querySelector('.dzg-header').getBoundingClientRect().bottom), bottom: b.bottom, view: v.bottom };
    });
    check(name, `edit undo tree ${tag}: the bed given back is focused below its ${r.copies} sticky parents, whole in the view`, r.focused && r.copies >= 2 && r.top >= r.under - 0.5 && r.bottom <= r.view + 0.5, r);
    await cdp.detach();
    check(name, `edit undo tree ${tag}: no page error`, errors.length === 0, errors);
    await page.close();
  }
}

/** The tree column's field: after the chevron (rects), its Left/Right, the chevron clicked while editing, `*`, the structure read-only. */
async function treeField(name, ctx, h, open, rtlOnly = false) {
  const { check, frames } = h;
  for (const [tag, qs, rtl] of [['ar', 'locale=ar-DZ&theme=dark&skin=midnight&mode=tree&mac=0', true], ['fr', 'locale=fr-FR&theme=light&skin=clinic&mode=tree&mac=0', false]]) {
    if (rtlOnly && !rtl) continue;
    const { page, errors } = await open(qs);
    const at = (id, col) => page.evaluate(([id, col]) => { const r = window.t.cell(id, col).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, [id, col]);
    const c = await at('s0w1', 'name');
    await page.mouse.dblclick(c.x, c.y);
    await frames(page, 2);
    const g = await page.evaluate(() => {
      const cell = window.t.cell('s0w1', 'name');
      const f = cell.querySelector('.dzg-field');
      const t = cell.querySelector('.dzg-toggle').getBoundingClientRect();
      const r = f.getBoundingClientRect();
      const cr = cell.getBoundingClientRect();
      return { field: !!f, active: document.activeElement === f, fs: r.left, fe: r.right, ts: t.left, te: t.right, cs: cr.left, ce: cr.right, hit: document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2)?.classList.contains('dzg-toggle') };
    });
    const after = rtl ? g.fe <= g.ts + 0.5 && g.fs >= g.cs - 0.5 : g.fs >= g.te - 0.5 && g.fe <= g.ce + 0.5;
    check(name, `edit tree ${tag}: the field starts after the indent and the chevron (${rtl ? 'right to left' : 'left to right'}); the chevron seen and on top`, g.field && g.active && after && g.hit, g);
    await page.keyboard.press('End');
    const s0 = await page.evaluate(() => document.activeElement.selectionStart);
    // The text is Latin (« Ward 0.1 »): Left goes back in it, in both directions of the page.
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    const s1 = await page.evaluate(() => ({ at: document.activeElement.selectionStart, open: window.t.cell('s0w1', 'name').closest('.dzg-row').getAttribute('aria-expanded'), field: !!document.querySelector('.dzg-field') }));
    check(name, `edit tree ${tag}: Left/Right in the field move the caret (${s0} → ${s1.at}); the row never closes`, s1.at === s0 - 1 && s1.open === 'true' && s1.field, { s0, s1 });
    // The chevron clicked while editing: the text kept, then the row closed.
    await page.keyboard.type('X');
    const t = await page.evaluate(() => { const r = window.t.cell('s0w1', 'name').querySelector('.dzg-toggle').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(t.x, t.y);
    await page.waitForTimeout(100);
    await frames(page, 2);
    const k = await page.evaluate(() => ({ text: window.t.cell('s0w1', 'name').textContent, field: !!document.querySelector('.dzg-field'), open: window.t.cell('s0w1', 'name').closest('.dzg-row').getAttribute('aria-expanded') }));
    check(name, `edit tree ${tag}: the chevron clicked while editing keeps the text (« ${k.text} »), then closes the row`, !k.field && /X/.test(k.text) && k.open === 'false', k);
    // `*` on the tree column: the siblings open, no field.
    await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'api'));
    await frames(page, 2);
    await page.evaluate(() => window.t.grid.api.focusCell(window.t.key('s0'), 'name'));
    await frames(page, 2);
    await page.keyboard.type('*');
    await frames(page, 2);
    const star = await page.evaluate(() => ({ open: ['s0', 's1', 's2', 's3'].map((id) => window.t.cell(id, 'name')?.closest('.dzg-row').getAttribute('aria-expanded')), field: !!document.querySelector('.dzg-field') }));
    check(name, `edit tree ${tag}: « * » on the tree column opens the siblings, no field`, star.open.every((x) => x === 'true') && !star.field, star);
    // The structure column: read-only.
    const code = await at('s0', 'code');
    await page.mouse.dblclick(code.x, code.y);
    await frames(page, 2);
    const ro = await page.evaluate(() => ({ ro: window.t.cell('s0', 'code').getAttribute('aria-readonly'), field: !!document.querySelector('.dzg-field') }));
    check(name, `edit tree ${tag}: the structure column (« Code ») is read-only: aria-readonly, a double click opens nothing`, ro.ro === 'true' && !ro.field, ro);
    check(name, `edit tree ${tag}: no page error`, errors.length === 0, errors);
    await page.close();
  }
}

export async function editTreeChecks(name, ctx, h) {
  const open = async (qs) => {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1000, height: 760 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(h.site.root(`packages/dom/test/browser/edit-undo.html?${qs}`));
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
    await h.frames(page, 3);
    return { page, errors };
  };
  await treeField(name, ctx, h, open);
}

export async function editDetailChecks(name, ctx, h) {
  const { check, frames, site } = h;
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1000, height: 760 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(site.root('packages/dom/test/browser/edit-undo.html?locale=fr-FR&theme=light&skin=clinic&mode=detail&mac=0'));
  await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
  await frames(page, 3);
  await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'rows.expand', rows: [window.t.key('o1')], expanded: true }, 'api'));
  await frames(page, 3);
  await page.evaluate(() => window.t.grid.api.focusCell(window.t.key('o1'), 'name'));
  await frames(page, 2);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await frames(page, 2);
  const into = await page.evaluate(() => { const a = document.activeElement; return { inner: a.closest('.dzg') !== document.querySelector('#host > .dzg'), cell: a.classList.contains('dzg-cell'), field: !!document.querySelector('.dzg-field') }; });
  check(name, 'edit detail: with editing on, Enter on the panel goes into its grid (no field opens)', into.inner && into.cell && !into.field, into);
  // An inner edit by the keyboard, and its Ctrl+Z: the inner grid's only.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('7');
  await page.keyboard.press('Enter');
  await frames(page, 2);
  await page.evaluate(() => window.t.inner[0].ok());
  await page.waitForTimeout(50);
  // The inner grid knows the page's system (a Mac here: Cmd).
  await page.keyboard.press('ControlOrMeta+z');
  await frames(page, 2);
  const z = await page.evaluate(() => ({ inner: window.t.inner.length, outer: window.t.saves.length, canOuter: window.t.api.canUndo, inside: document.activeElement.closest('.dzg') !== document.querySelector('#host > .dzg') }));
  check(name, 'edit detail: an inner edit and its Ctrl+Z stay in the inner grid (two inner saves, none outside)', z.inner === 2 && z.outer === 0 && !z.canOuter && z.inside, z);
  // Escape three times: the field closed, the panel's cell, nothing more.
  await page.keyboard.press('F2');
  await page.keyboard.press('Escape');
  const e1 = await page.evaluate(() => ({ field: !!document.querySelector('.dzg-field'), inner: document.activeElement.closest('.dzg') !== document.querySelector('#host > .dzg') }));
  await page.keyboard.press('Escape');
  const e2 = await page.evaluate(() => document.activeElement.classList.contains('dzg-dcell'));
  await page.keyboard.press('Escape');
  const e3 = await page.evaluate(() => document.activeElement.classList.contains('dzg-dcell'));
  check(name, 'edit detail: Escape ×3 — the field closed (focus in the inner grid), then the panel\'s cell, then it stays', !e1.field && e1.inner && e2 && e3, { e1, e2, e3 });
  // A panel scrolled away during a save, then back before the answer: the same grid, its saving mark.
  await page.evaluate(() => {
    const root = document.querySelector('.dzg-dbody > .dzg');
    root.dataset.s8 = 'kept';
    window.kept = root;
    const ctx = window.t.grid.context;
    void ctx;
  });
  await page.evaluate(() => window.t.inner.forEach((x) => x.ok()));
  await page.waitForTimeout(50);
  const sent = await page.evaluate(() => {
    const inner = window.kept;
    const cell = inner.querySelector('.dzg-cell[data-col="stock"]');
    cell.focus();
    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const f = inner.querySelector('.dzg-field');
    f.value = '9';
    f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    return window.t.inner.length;
  });
  await page.evaluate(() => window.t.grid.api.focusCell(window.t.key('o0'), 'name'));
  await frames(page, 2);
  await page.evaluate(() => { document.querySelector('#host > .dzg > .dzg-viewport').scrollTop = 1600; });
  await frames(page, 4);
  const gone = await page.evaluate(() => ({ on: window.kept.isConnected, top: document.querySelector('#host > .dzg > .dzg-viewport').scrollTop, rows: [...document.querySelectorAll('#host > .dzg > .dzg-viewport > .dzg-body > .dzg-layer > .dzg-row')].length }));
  await page.evaluate(() => { document.querySelector('#host > .dzg > .dzg-viewport').scrollTop = 0; });
  await frames(page, 4);
  const back = await page.evaluate(() => ({ same: document.querySelector('.dzg-dbody > .dzg') === window.kept, saving: !!window.kept.querySelector('.dzg-cell--saving') }));
  await page.evaluate(() => window.t.inner.at(-1).ok());
  await page.waitForTimeout(100);
  check(name, 'edit detail: a panel scrolled away while its grid saves keeps it alive off the page; scrolled back, the same grid, still saving', sent === 3 && !gone.on && back.same && back.saving, { sent, gone, back });
  check(name, 'edit detail: no page error', errors.length === 0, errors);
  await page.close();
}

/** The real pages (owner S8-O5): orders-edit's Undo / Redo buttons and keys, its tree, detail.html's editable visits. */
export async function playgroundUndoChecks(name, ctx, h) {
  const { check, frames } = h;
  const base = process.env.DZG_PLAYGROUND ?? 'http://127.0.0.1:4700';
  const open = async (path) => {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}/${path}`);
    await page.waitForSelector('.dzg-layer > .dzg-row .dzg-cell', { timeout: 30000 });
    await frames(page, 3);
    return { page, errors };
  };
  for (const [tag, qs, ar] of [['fr', 'locale=fr-FR&theme=light&skin=clinic', false], ['ar', 'locale=ar-DZ&theme=dark&skin=midnight', true]]) {
    const { page, errors } = await open(`orders-edit.html?${qs}`);
    const cell = (ref, col) => page.evaluate(([ref, col]) => {
      const c = [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => r.querySelector('[data-col="ref"]')?.textContent === ref)?.querySelector(`[data-col="${col}"]`);
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: c.textContent, focused: document.activeElement === c, ro: c.getAttribute('aria-readonly') };
    }, [ref, col]);
    const buttons = () => page.evaluate(() => [...document.querySelectorAll('[data-undo]')].map((b) => [b.textContent, b.getAttribute('aria-disabled')]));
    const log = () => page.evaluate(() => [...document.querySelectorAll('#log li')].map((l) => l.textContent));
    const b0 = await buttons();
    const c0 = await cell('O-0004', 'client');
    await page.mouse.dblclick(c0.x, c0.y);
    await frames(page, 2);
    await page.keyboard.press('End');
    await page.keyboard.type(' Sud');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);
    const b1 = await buttons();
    // The Undo button: the value back, the focus on its cell, the log line.
    await page.click('[data-undo="undo"]');
    await page.waitForTimeout(900);
    const c1 = await cell('O-0004', 'client');
    const l1 = await log();
    const b2 = await buttons();
    check(name, `playground orders-edit (${tag}): « ${b0[0]?.[0]} » / « ${b0[1]?.[0]} » disabled at first, Undo enabled after a save; pressed: the value back, the focus on the cell, « ${l1.find((l) => /Client|العميل/.test(l))} »`,
      b0.length === 2 && b0.every((b) => b[1] === 'true') && b1[0][1] === 'false' && c1.text === c0.text && c1.focused && l1.some((l) => (ar ? /^تراجع: العميل/ : /^Annulé : Client/).test(l)) && b2[1][1] === 'false', { b0, b1, b2, c0, c1, l1 });
    // The keys: Cmd/Ctrl+Y (here Shift+Z with the command key) gives it again.
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await page.waitForTimeout(900);
    const c2 = await cell('O-0004', 'client');
    check(name, `playground orders-edit (${tag}): Ctrl/Cmd+Shift+Z on the cell redoes (« ${c2.text} »)`, c2.text === `${c0.text} Sud`, c2);
    check(name, `playground orders-edit (${tag}): no page error (undo)`, errors.length === 0, errors);
    await page.close();
    // `?tree=1`: sub-orders as child rows, editable on both levels; « Commande mère » read-only.
    const tp = await open(`orders-edit.html?${qs}&tree=1`);
    const t = await tp.page.evaluate(() => {
      const rows = [...document.querySelectorAll('.dzg-layer > .dzg-row')];
      return { levels: [...new Set(rows.map((r) => r.getAttribute('aria-level')))], parentRo: rows[0]?.querySelector('[data-col="parent"]')?.getAttribute('aria-readonly'), role: document.querySelector('.dzg-viewport').getAttribute('role') };
    });
    await tp.page.evaluate(() => window.demo.grid.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'api'));
    await frames(tp.page, 3);
    const child = await tp.page.evaluate(() => { const r = [...document.querySelectorAll('.dzg-layer > .dzg-row[aria-level="2"]')][0]; const c = r.querySelector('[data-col="qty"]'); const b = c.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, text: c.textContent }; });
    await tp.page.mouse.dblclick(child.x, child.y);
    await frames(tp.page, 2);
    const f = await tp.page.evaluate(() => !!document.querySelector('.dzg-field'));
    check(name, `playground orders-edit?tree=1 (${tag}): a treegrid, the « Commande mère » column read-only, a sub-order's Qté opens its field`, t.role === 'treegrid' && t.parentRo === 'true' && f, { t, f, child });
    check(name, `playground orders-edit?tree=1 (${tag}): no page error`, tp.errors.length === 0, tp.errors);
    await tp.page.close();
    // detail.html: an editable visit in its own grid, its own Ctrl/Cmd+Z.
    const dp = await open(`detail.html?locale=${ar ? 'ar-DZ' : 'fr-FR'}&theme=${ar ? 'dark' : 'light'}`);
    await dp.page.waitForSelector('.dzg-dbody .dzg-cell[data-col="fee"]', { timeout: 30000 });
    const fee = await dp.page.evaluate(() => { const c = document.querySelector('.dzg-dbody .dzg-row .dzg-cell[data-col="fee"]'); const b = c.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, text: c.textContent }; });
    await dp.page.mouse.dblclick(fee.x, fee.y);
    await frames(dp.page, 2);
    await dp.page.keyboard.press('ControlOrMeta+A');
    await dp.page.keyboard.type('1234');
    await dp.page.keyboard.press('Enter');
    await dp.page.waitForTimeout(900);
    const saved = await dp.page.evaluate(() => document.querySelector('.dzg-dbody .dzg-row .dzg-cell[data-col="fee"]').textContent);
    await dp.page.keyboard.press('ControlOrMeta+z');
    await dp.page.waitForTimeout(900);
    const back = await dp.page.evaluate(() => document.querySelector('.dzg-dbody .dzg-row .dzg-cell[data-col="fee"]').textContent);
    check(name, `playground detail.html (${tag}): a visit's Montant edited in its grid and saved (« ${saved} »), its Ctrl/Cmd+Z gives « ${back} » back`, saved !== fee.text && /1/.test(saved) && back === fee.text, { fee, saved, back });
    check(name, `playground detail.html (${tag}): no page error`, dp.errors.length === 0, dp.errors);
    await dp.page.close();
  }
}
