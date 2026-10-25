/**
 * Phase 5 step 11a in real browsers (docs/phase-5-steps/step11a-plan.md « Browser »), called by scripts/browser.mjs:
 * `rangeChecks` (`-- --only range`) on packages/dom/test/browser/range.html — axe 0 with a block (fr light Clinic, ar dark
 * Midnight, forced colours), a real mouse drag across cells and into the bottom band (auto-scroll), across the pinned
 * start column right to left, the edges' physical sides (rects and the computed box-shadow), Shift+arrows by the real
 * keyboard in fr and ar (Shift+← grows toward the screen's left in ar), a million rows (scaled scrolling) against the
 * oracle, the tree's pinned parents tinted, no animation under reduced motion. Firefox and WebKit (`--engine`): the
 * keys right to left and the drag. `playgroundRangeChecks` (with `--only range` and the full run): the REAL playground
 * page `orders-edit.html` on 127.0.0.1:4700 (or DZG_PLAYGROUND), fr and ar: a block on « Qté », an editor opened in the
 * block and closed, Shift+click, Ctrl+A, Escape; screenshots in docs/screenshots/.
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SHOTS = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));

export async function rangeChecks(name, ctx, h) {
  const { check, frames, site, axe } = h;
  const open = async (qs, o = {}) => {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1000, height: 760 });
    if (o.forced) await page.emulateMedia({ forcedColors: 'active' });
    if (o.reduce) await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(site.root(`packages/dom/test/browser/range.html?${qs}`));
    await page.waitForFunction(() => window.ready, null, { timeout: 60000 }).catch((e) => { throw new Error(`range.html?${qs}: ${errors.join(' | ')} ${e.message}`); });
    await frames(page, 3);
    return { page, errors };
  };
  const at = (page, id, col) => page.evaluate(([id, col]) => { const c = window.t.cell(id, col); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right }; }, [id, col]);
  const block = (page) => page.evaluate(() => window.t.block());
  const drag = async (page, from, to, steps = 8) => {
    const a = await at(page, ...from);
    const b = await at(page, ...to);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps });
    await frames(page, 2);
    await page.mouse.up();
    await frames(page, 2);
  };
  const engines = name === 'chrome';
  const pages = engines ? [['fr light clinic', 'locale=fr-FR&theme=light&skin=clinic', false], ['ar dark midnight', 'locale=ar-DZ&theme=dark&skin=midnight', true]] : [['ar', 'locale=ar-DZ', true]];
  for (const [tag, qs, rtl] of pages) {
    const { page, errors } = await open(qs);
    // A real drag across cells: the block, the focus on the corner after the release.
    await drag(page, ['r2', 'qty'], ['r5', 'c3']);
    const b1 = await block(page);
    const focus = await page.evaluate(() => { const f = window.t.grid.kernel.focus; return f && `${String(f.row).replace(/^d:\d+:/, '')}/${f.column}`; });
    const bad1 = await page.evaluate(() => window.t.disagree());
    check(name, `range ${tag}: a real mouse drag r2/Qté → r5/C3 makes the block, the focus on the moving corner at release, every mounted cell agrees`, b1 === 'r2/qty:r5/c3' && focus === 'r5/c3' && bad1.length === 0, { b1, focus, bad1 });
    // The edges on their physical sides: start = left in ltr, right in rtl (rects and the computed shadow's sign).
    const side = await page.evaluate(() => {
      const s = window.t.cell('r3', 'qty');
      const e = window.t.cell('r3', 'c3');
      const sh = (c) => getComputedStyle(c).boxShadow;
      return { startLeft: s.getBoundingClientRect().left, endLeft: e.getBoundingClientRect().left, s: sh(s), e: sh(e), cls: s.className };
    });
    const firstOffset = (shadow) => Number(/(-?\d+(?:\.\d+)?)px/.exec(shadow)?.[1]);
    const ok = rtl ? side.startLeft > side.endLeft && firstOffset(side.s) < 0 : side.startLeft < side.endLeft && firstOffset(side.s) > 0;
    check(name, `range ${tag}: the start edge on the ${rtl ? 'right' : 'left'} (the first column read), the shadow's inline offset ${rtl ? 'negative' : 'positive'}`, ok && /dzg-cell--rs/.test(side.cls), side);
    if (engines) {
      const v = await axe(page);
      check(name, `range ${tag}: axe 0 with a block`, v.length === 0, v);
      await page.screenshot({ path: `${SHOTS}step11a-range-${rtl ? 'ar' : 'fr'}.png` });
    }
    // Shift+arrows by the real keyboard: in ar, Shift+← grows toward the screen's left (the logical end).
    await page.keyboard.press('Escape');
    const c0 = await at(page, 'r8', 'qty');
    await page.mouse.click(c0.x, c0.y);
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press(rtl ? 'Shift+ArrowLeft' : 'Shift+ArrowRight');
    await frames(page, 2);
    const b2 = await block(page);
    const corner = await at(page, 'r10', 'amount');
    check(name, `range ${tag}: Shift+↓ ×2, Shift+${rtl ? '←' : '→'}: r8/Qté → r10/Montant, the corner to the screen's ${rtl ? 'left' : 'right'}`, b2 === 'r8/qty:r10/amount' && (rtl ? corner.x < c0.x : corner.x > c0.x), { b2, c0, corner });
    await page.waitForTimeout(500);
    const said = await page.evaluate(() => window.t.said.slice());
    check(name, `range ${tag}: the size said once after the pause (« ${rtl ? '3 صفوف، عمودان محددة' : '3 lignes, 2 colonnes sélectionnées'} »)`, said.filter((s) => s === (rtl ? '3 صفوف، عمودان محددة' : '3 lignes, 2 colonnes sélectionnées')).length === 1, said);
    // Into the bottom band: the view scrolls, the corner goes past the first screen.
    await page.keyboard.press('Escape');
    const a = await at(page, 'r1', 'qty');
    const vp = await page.evaluate(() => { const r = document.querySelector('.dzg-viewport').getBoundingClientRect(); return { bottom: r.bottom }; });
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x, a.y + 40, { steps: 3 });
    await page.mouse.move(a.x, vp.bottom - 6, { steps: 4 });
    await page.waitForTimeout(700);
    await page.mouse.up();
    await frames(page, 2);
    const auto = await page.evaluate(() => ({ top: document.querySelector('.dzg-viewport').scrollTop, corner: window.t.api.get() && window.t.grid.kernel.rows.displayed.indexOf(window.t.api.get().focus.row), bad: window.t.disagree() }));
    check(name, `range ${tag}: a drag held in the bottom band scrolls the view (by frames) and the corner follows past the first screen`, auto.top > 100 && auto.corner > 16 && auto.bad.length === 0, auto);
    // Right to left across the pinned start column.
    if (rtl) {
      await page.evaluate(() => { document.querySelector('.dzg-viewport').scrollTop = 0; });
      await frames(page, 3);
      await drag(page, ['r3', 'amount'], ['r4', 'name']);
      const b3 = await block(page);
      check(name, `range ${tag}: a drag from Montant onto the pinned start column (on the right) takes it`, b3 === 'r3/amount:r4/name', b3);
    }
    check(name, `range ${tag}: no page error`, errors.length === 0, errors);
    await page.close();
  }
  if (!engines) return;

  // Forced colours: the tint Highlight, the text HighlightText; axe 0.
  {
    const { page, errors } = await open('locale=fr-FR&theme=light', { forced: true });
    await drag(page, ['r2', 'qty'], ['r4', 'amount']);
    const fc = await page.evaluate(() => {
      const c = window.t.cell('r3', 'qty');
      const probe = document.createElement('span');
      probe.style.cssText = 'background: Highlight; color: HighlightText; forced-color-adjust: none';
      document.body.append(probe);
      const want = getComputedStyle(probe);
      const r = { bg: getComputedStyle(c).backgroundColor, fg: getComputedStyle(c).color, hl: want.backgroundColor, ht: want.color, shadow: getComputedStyle(window.t.cell('r2', 'qty')).boxShadow };
      probe.remove();
      return r;
    });
    const v = await axe(page);
    check(name, 'range forced colours: the block Highlight with HighlightText, its edges kept; axe 0', fc.bg === fc.hl && fc.fg === fc.ht && fc.shadow !== 'none' && v.length === 0, { fc, v });
    await page.screenshot({ path: `${SHOTS}step11a-range-forced.png` });
    check(name, 'range forced colours: no page error', errors.length === 0, errors);
    await page.close();
  }
  // Review 5: a CSS scale and a zoom on an ancestor: the cell under the pointer is still the right one.
  for (const how of ['transform', 'zoom']) {
    const { page, errors } = await open('locale=fr-FR&theme=light');
    await page.evaluate((how) => {
      const host = document.getElementById('host');
      if (how === 'transform') (host.style.transform = 'scale(0.75)'), (host.style.transformOrigin = '0 0');
      else host.style.zoom = '1.25';
    }, how);
    await frames(page, 3);
    await drag(page, ['r2', 'qty'], ['r5', 'c3']);
    const b = await block(page);
    check(name, `range under a ${how === 'transform' ? 'CSS scale(0.75)' : 'zoom: 1.25'} on an ancestor: a real drag r2/Qté → r5/C3 makes that block`, b === 'r2/qty:r5/c3', b);
    check(name, `range under a ${how}: no page error`, errors.length === 0, errors);
    await page.close();
  }
  // Reduced motion: nothing animates on a block's cells.
  {
    const { page } = await open('locale=fr-FR', { reduce: true });
    await drag(page, ['r2', 'qty'], ['r3', 'amount']);
    const m = await page.evaluate(() => { const s = getComputedStyle(window.t.cell('r2', 'qty')); return { t: s.transitionDuration, a: s.animationName }; });
    check(name, 'range reduced motion: no transition, no animation on the block', m.t === '0s' && m.a === 'none', m);
    await page.close();
  }
  // A million rows (scaled scrolling): Ctrl+Shift+End from the first cell, then the middle: every mounted cell agrees.
  {
    const { page, errors } = await open('locale=fr-FR&rows=1000000');
    const c = await at(page, 'r0', 'qty');
    await page.mouse.click(c.x, c.y);
    await page.keyboard.press('ControlOrMeta+Shift+End');
    await frames(page, 3);
    const end = await page.evaluate(() => ({ b: window.t.block(), bad: window.t.disagree(), top: document.querySelector('.dzg-viewport').scrollTop }));
    await page.evaluate(() => { const v = document.querySelector('.dzg-viewport'); v.scrollTop = (v.scrollHeight - v.clientHeight) / 2; });
    await frames(page, 4);
    const mid = await page.evaluate(() => ({ bad: window.t.disagree(), tinted: document.querySelectorAll('.dzg-cell--range').length }));
    check(name, 'range 1 M rows: Ctrl+Shift+End makes r0 … r999999, then halfway down every mounted cell agrees with the oracle', end.b === 'r0/qty:r999999/c6' && end.bad.length === 0 && mid.bad.length === 0 && mid.tinted > 20, { end, mid });
    check(name, 'range 1 M rows: no page error', errors.length === 0, errors);
    await page.close();
  }
  // The tree's pinned parents: tinted, never aria-selected.
  {
    const { page } = await open('locale=fr-FR&tree=1');
    await page.evaluate(() => window.t.api.set({ anchor: { row: window.t.key('r0'), column: 'name' }, focus: { row: window.t.key('r15'), column: 'qty' } }));
    await page.evaluate(() => { document.querySelector('.dzg-viewport').scrollTop = 32 * 8; });
    await frames(page, 4);
    const st = await page.evaluate(() => { const c = document.querySelector('.dzg-sticky .dzg-cell[data-col="name"]'); return c && { tint: c.classList.contains('dzg-cell--range'), sel: c.hasAttribute('aria-selected') }; });
    check(name, 'range tree: the pinned parent copy is tinted, never aria-selected (S11-Q3)', !!st && st.tint && !st.sel, st);
    await page.close();
  }
}

export async function playgroundRangeChecks(name, ctx, h) {
  const { check, frames } = h;
  const base = process.env.DZG_PLAYGROUND ?? 'http://127.0.0.1:4700';
  mkdirSync(SHOTS, { recursive: true });
  for (const [tag, qs, ar] of [['fr', 'locale=fr-FR&theme=light&skin=clinic', false], ['ar', 'locale=ar-DZ&theme=dark&skin=midnight', true]]) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}/orders-edit.html?${qs}`);
    await page.waitForSelector('.dzg-layer > .dzg-row .dzg-cell[data-col="qty"]', { timeout: 30000 });
    await frames(page, 3);
    const cell = (ref, col) => page.evaluate(([ref, col]) => {
      const c = [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => r.querySelector('[data-col="ref"]')?.textContent === ref)?.querySelector(`[data-col="${col}"]`);
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, cls: c.className, sel: c.getAttribute('aria-selected'), text: c.textContent };
    }, [ref, col]);
    const tinted = () => page.evaluate(() => document.querySelectorAll('.dzg-layer .dzg-cell--range').length);
    // What the live regions said, recorded as it is said (a region empties itself afterwards).
    await page.evaluate(() => { window.said = []; for (const el of document.querySelectorAll('.dzg-live')) new MutationObserver(() => { if (el.textContent) window.said.push(el.textContent); }).observe(el, { childList: true, characterData: true, subtree: true }); });
    const live = () => page.evaluate(() => window.said.join(' | '));
    // A block on « Qté » by a real drag, three rows.
    const a = await cell('O-0002', 'qty');
    const b = await cell('O-0004', 'qty');
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.mouse.up();
    await frames(page, 2);
    const n1 = await tinted();
    const s1 = await cell('O-0003', 'qty');
    check(name, `playground orders-edit (${tag}): a drag on « Qté » makes a block of 3 cells, tinted, aria-selected`, n1 === 3 && /dzg-cell--range/.test(s1.cls) && s1.sel === 'true', { n1, s1 });
    await page.waitForTimeout(500);
    const l1 = await live();
    check(name, `playground orders-edit (${tag}): its size said`, ar ? /3 صفوف/.test(l1) : /3 lignes, 1 colonne sélectionnées/.test(l1), l1);
    await page.screenshot({ path: `${SHOTS}step11a-orders-edit-${tag}.png` });
    // F2 on the corner opens its editor; Escape closes it; the block is still there.
    await page.keyboard.press('F2');
    await frames(page, 2);
    const opened = await page.evaluate(() => !!document.querySelector('.dzg-field'));
    await page.keyboard.press('Escape');
    await frames(page, 2);
    const n2 = await tinted();
    check(name, `playground orders-edit (${tag}): F2 opens the corner's editor, Escape closes it, the block stays`, opened && n2 === 3, { opened, n2 });
    // Shift+click extends from the anchor to « Montant ».
    const c = await cell('O-0005', 'amount');
    await page.keyboard.down('Shift');
    await page.mouse.click(c.x, c.y);
    await page.keyboard.up('Shift');
    await frames(page, 2);
    const n3 = await tinted();
    check(name, `playground orders-edit (${tag}): Shift+click on « Montant » extends the block (4 rows × 2 columns)`, n3 === 8, n3);
    // Ctrl+A: every cell shown; no row ticked; Escape clears, said.
    await page.keyboard.press('ControlOrMeta+A');
    await frames(page, 2);
    const n4 = await tinted();
    await page.keyboard.press('Escape');
    await frames(page, 2);
    const n5 = await tinted();
    // The region writes its sentence 50 ms after being emptied.
    await page.waitForTimeout(200);
    const l2 = await live();
    check(name, `playground orders-edit (${tag}): Ctrl+A tints every mounted cell, Escape clears it (« ${ar ? 'أُلغي التحديد' : 'Sélection effacée'} »)`, n4 > 20 && n5 === 0 && l2.includes(ar ? 'أُلغي التحديد' : 'Sélection effacée'), { n4, n5, l2 });
    check(name, `playground orders-edit (${tag}): no page error`, errors.length === 0, errors);
    await page.close();
  }
}
