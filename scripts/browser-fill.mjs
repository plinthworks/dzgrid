/**
 * Phase 5 step 12 in real browsers (docs/phase-5-steps/step12-plan.md « Browser checks », owner S12-Q8), called by
 * scripts/browser.mjs (`-- --only fill`, and in the full run): the REAL playground page `orders-edit.html?focus=range`
 * on 127.0.0.1:4700 (or DZG_PLAYGROUND), never restarted. In fr light Clinic and ar dark Midnight:
 * - S12-Q8: the handle on a single clicked cell and on a block (bottom-right, bottom-left right to left, a 10 px hit box
 *   found by `elementFromPoint`), the crosshair over it; the block's 2 px edge and its contrast; after ArrowDown × 2 the
 *   active cell's 2 px ring, its tint and its row's tint, each contrast-checked (ring ≥ 3:1 on the cell and its row,
 *   text ≥ 4.5:1 on both tints);
 * - a REAL drag of the handle with the mouse (Playwright mouse, real hit testing): the series written at once (before
 *   the simulated server answers), one sentence, Ctrl+Z gives it back; Ctrl held at the drop swaps; Escape mid-drag
 *   writes nothing; the no-drag click-then-click; Ctrl+D (prevented); Ctrl+Enter bulk on « Statut »;
 * - Chrome only: a pen drag by CDP writes nothing (S12-Q12), forced colours (the square and the outline drawn), axe 0 with the block, the handle and
 *   the fill mode; screenshots in docs/screenshots/.
 * Firefox and WebKit (`--engine`): the same page, fr and ar: the handle, the crosshair, the ring, the drag, Ctrl+D.
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SHOTS = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));

/** In the page: WCAG contrast of two computed colours (rgb / rgba over a background). */
const CONTRAST = `window.__ratio = (a, b) => {
  // Any computed colour (rgb, color(srgb …), oklab …) to sRGB 0–255 through a canvas pixel.
  const cv = (window.__cv ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true }));
  const p = (s) => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#fff'; cv.fillRect(0, 0, 1, 1); cv.fillStyle = s; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data].slice(0, 3); };
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const x = L(p(a)), y = L(p(b));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
window.__bg = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!/rgba\\(0, 0, 0, 0\\)|transparent/.test(c)) return c; } return 'rgb(255, 255, 255)'; };`;

export async function fillChecks(name, ctx, h) {
  const { check, frames, axe } = h;
  const base = process.env.DZG_PLAYGROUND ?? 'http://127.0.0.1:4700';
  mkdirSync(SHOTS, { recursive: true });
  for (const [tag, qs, ar] of [['fr', 'locale=fr-FR&theme=light&skin=clinic', false], ['ar', 'locale=ar-DZ&theme=dark&skin=midnight', true]]) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}/orders-edit.html?${qs}&focus=range`);
    await page.waitForSelector('.dzg-layer > .dzg-row .dzg-cell[data-col="qty"]', { timeout: 30000 });
    await frames(page, 3);
    await page.evaluate(CONTRAST);
    await page.evaluate(() => { window.said = []; for (const el of document.querySelectorAll('.dzg-live')) new MutationObserver(() => { if (el.textContent) window.said.push(el.textContent); }).observe(el, { childList: true, characterData: true, subtree: true }); });
    const live = () => page.evaluate(() => window.said.join(' | '));
    const cell = (ref, col) => page.evaluate(([ref, col]) => {
      const c = [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => r.querySelector('[data-col="ref"]')?.textContent === ref)?.querySelector(`[data-col="${col}"]`);
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom, text: c.textContent.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)) };
    }, [ref, col]);
    const num = (t) => Number(String(t).replace(/[^\d-]/g, ''));
    const handle = () => page.evaluate(() => {
      const hs = document.querySelectorAll('.dzg-fill');
      const x = hs[0];
      if (!x) return { n: 0 };
      const r = x.getBoundingClientRect();
      const c = x.closest('.dzg-cell').getBoundingClientRect();
      const sq = getComputedStyle(x, '::before');
      const corners = [[r.left + 1, r.top + 1], [r.right - 1, r.top + 1], [r.left + 1, r.bottom - 1], [r.right - 1, r.bottom - 1]].map(([px, py]) => document.elementFromPoint(px, py) === x);
      const row = x.closest('.dzg-row');
      return { n: hs.length, ref: row.querySelector('[data-col="ref"]')?.textContent, col: x.closest('.dzg-cell').dataset.col, w: r.width, h: r.height, dr: Math.abs(c.right - r.right), dl: Math.abs(c.left - r.left), db: Math.abs(c.bottom - r.bottom), corners, cursor: getComputedStyle(x).cursor, sq: { w: sq.width, bg: sq.backgroundColor }, ratio: window.__ratio(sq.backgroundColor, window.__bg(x.closest('.dzg-cell'))) };
    });
    const corner = (hd) => (ar ? hd.dl <= 1 : hd.dr <= 1) && hd.db <= 1;

    // S12-Q8: a click on one Qté cell shows the handle on it, bottom-right (bottom-left in Arabic), a 10 px hit box, a crosshair.
    const c2 = await cell('O-0002', 'qty');
    await page.mouse.click(c2.x, c2.y);
    await frames(page, 2);
    const h1 = await handle();
    check(name, `fill ${tag}: one clicked Qté cell carries the handle, one in the page, at its ${ar ? 'bottom-left' : 'bottom-right'} corner, a 10 px hit box (its square and 2 px, owner 2026-10-26; elementFromPoint at its four corners), the square 8 px at ≥ 3:1`, h1.n === 1 && h1.ref === 'O-0002' && h1.col === 'qty' && corner(h1) && h1.w === 10 && h1.h === 10 && h1.corners.every(Boolean) && h1.sq.w === '8px' && h1.ratio >= 3, h1);
    const hr = await page.evaluate(() => { const r = document.querySelector('.dzg-fill').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(hr.x, hr.y);
    const cur = await page.evaluate(([x, y]) => getComputedStyle(document.elementFromPoint(x, y)).cursor, [hr.x, hr.y]);
    check(name, `fill ${tag}: the pointer over the handle is a crosshair`, cur === 'crosshair', cur);

    // S12-Q8 bis: ArrowDown × 2 — the active cell's ring and tint, the row's tint, all checked.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await frames(page, 2);
    const act = await page.evaluate(() => {
      const c = document.activeElement;
      const row = c.closest('.dzg-row');
      const other = [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => r !== row && r.getAttribute('aria-selected') !== 'true' && !r.matches(':hover'));
      const s = getComputedStyle(c);
      const rowBg = getComputedStyle(row).backgroundColor;
      return { ref: row.querySelector('[data-col="ref"]')?.textContent, col: c.dataset.col, ow: s.outlineWidth, os: s.outlineStyle, oc: s.outlineColor, oo: s.outlineOffset, cellBg: s.backgroundColor, rowBg, otherBg: getComputedStyle(other).backgroundColor, ringCell: window.__ratio(s.outlineColor, s.backgroundColor), ringRow: window.__ratio(s.outlineColor, rowBg), textCell: window.__ratio(s.color, s.backgroundColor), textRow: window.__ratio(getComputedStyle(row).color, rowBg), shadow: s.boxShadow };
    });
    check(name, `fill ${tag}: after ArrowDown × 2 the active cell (O-0004 / Qté) has a 2 px solid ring inside it and an inner line, its own tint; its row a tint of its own; ring ≥ 3:1 on the cell (${act.ringCell?.toFixed(2)}) and the row (${act.ringRow?.toFixed(2)}), text ≥ 4.5:1 on both (${act.textCell?.toFixed(2)}, ${act.textRow?.toFixed(2)})`,
      act.ref === 'O-0004' && act.col === 'qty' && act.ow === '2px' && act.os === 'solid' && act.oo === '-2px' && /inset/.test(act.shadow) && act.cellBg !== act.rowBg && act.rowBg !== act.otherBg && act.ringCell >= 3 && act.ringRow >= 3 && act.textCell >= 4.5 && act.textRow >= 4.5, act);
    const h2 = await handle();
    check(name, `fill ${tag}: the handle follows the focus (O-0004 / Qté)`, h2.n === 1 && h2.ref === 'O-0004' && corner(h2), h2);

    // A block (Shift+ArrowDown × 2): its 2 px edge all round, ≥ 3:1, the handle on its last row.
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await frames(page, 2);
    const edge = await page.evaluate(() => {
      const c = [...document.querySelectorAll('.dzg-cell--range')].find((x) => !x.matches(':focus'));
      const s = getComputedStyle(c).boxShadow;
      const col = s.match(/rgba?\([^)]+\)/)?.[0];
      return { n: document.querySelectorAll('.dzg-cell--range').length, shadow: s, two: /2px/.test(s), ratio: col ? window.__ratio(col, window.__bg(c.closest('.dzg-row'))) : 0 };
    });
    const h3 = await handle();
    check(name, `fill ${tag}: a block of 3 Qté cells: a 2 px edge at ≥ 3:1 (${edge.ratio?.toFixed(2)}), the handle on its last row (O-0006)`, edge.n === 3 && edge.two && edge.ratio >= 3 && h3.ref === 'O-0006' && corner(h3), { edge, h3 });
    await page.screenshot({ path: `${SHOTS}step12-orders-edit-${tag}.png` });
    await page.keyboard.press('Escape');

    // A real drag of the handle: O-0002, O-0003 (a, b) down to O-0006: the series, at once, one sentence; Ctrl+Z.
    const drag = async (from, to, o = {}) => {
      const a = await cell(...from);
      await page.mouse.click(a.x, a.y);
      if (o.to2) { const b = await cell(...o.to2); await page.keyboard.down('Shift'); await page.mouse.click(b.x, b.y); await page.keyboard.up('Shift'); }
      await frames(page, 2);
      const p = await page.evaluate(() => { const r = document.querySelector('.dzg-fill').getBoundingClientRect(); return { x: r.right - 3, y: r.bottom - 3, l: r.left + 3 }; });
      const t = await cell(...to);
      await page.mouse.move(ar ? p.l : p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(t.x, t.y, { steps: 8 });
      await frames(page, 2);
      const outlined = await page.evaluate(() => document.querySelectorAll('.dzg-cell--fill').length);
      if (o.escape) await page.keyboard.press('Escape');
      if (o.ctrl) await page.keyboard.down('Control');
      await page.mouse.up();
      if (o.ctrl) await page.keyboard.up('Control');
      await frames(page, 2);
      return outlined;
    };
    const ref = (i) => `O-${String(i).padStart(4, '0')}`;
    // Two orders in a row whose quantities grow (a series that stays ≥ 1, the column's minimum).
    let i0 = 2;
    while (i0 < 12 && num((await cell(ref(i0 + 1), 'qty')).text) <= num((await cell(ref(i0), 'qty')).text)) i0++;
    const v2 = num((await cell('O-0002', 'qty')).text);
    const v3 = num((await cell('O-0003', 'qty')).text);
    const a0 = num((await cell(ref(i0), 'qty')).text);
    const a1 = num((await cell(ref(i0 + 1), 'qty')).text);
    const tg = [ref(i0 + 2), ref(i0 + 3), ref(i0 + 4)];
    const before = await Promise.all(tg.map(async (r) => (await cell(r, 'qty')).text));
    await page.evaluate(() => (window.said.length = 0));
    const outlined = await drag([ref(i0), 'qty'], [tg[2], 'qty'], { to2: [ref(i0 + 1), 'qty'] });
    const after = await Promise.all(tg.map(async (r) => num((await cell(r, 'qty')).text)));
    // By hand: the series a, b, then b + k (b − a), every value ≥ 1.
    const want = [1, 2, 3].map((k) => a1 + k * (a1 - a0));
    const ok = want.every((w, i) => after[i] === w);
    await page.waitForTimeout(150);
    const said = await live();
    check(name, `fill ${tag}: a real mouse drag of the handle from ${ref(i0)}…${ref(i0 + 1)} (${a0}, ${a1}) down 3 rows outlines 3 cells and writes the series ${want.join(', ')} at once; one sentence`, outlined === 3 && ok && (ar ? /التعبئة: \d/ : /Cellules recopiées/).test(said) && said.split(ar ? /التعبئة: \d/ : /Cellules recopiées/).length === 2, { outlined, a0, a1, after, want, said });
    await page.waitForTimeout(900);
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(900);
    const back = await Promise.all(tg.map(async (r) => (await cell(r, 'qty')).text));
    check(name, `fill ${tag}: Ctrl+Z gives the three cells back`, JSON.stringify(back) === JSON.stringify(before), { back, before });

    // Ctrl at the drop swaps (a copy of a, b); Escape mid-drag writes nothing.
    await drag(['O-0002', 'qty'], ['O-0005', 'qty'], { to2: ['O-0003', 'qty'], ctrl: true });
    const sw = await Promise.all(['O-0004', 'O-0005'].map(async (r) => num((await cell(r, 'qty')).text)));
    check(name, `fill ${tag}: Ctrl held at the drop copies the pattern (${v2}, ${v3})`, sw[0] === v2 && sw[1] === v3, { sw, v2, v3 });
    await page.waitForTimeout(900);
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(900);
    const pre = (await cell('O-0005', 'qty')).text;
    await drag(['O-0002', 'qty'], ['O-0005', 'qty'], { escape: true });
    check(name, `fill ${tag}: Escape during the drag writes nothing`, (await cell('O-0005', 'qty')).text === pre && (await page.evaluate(() => document.querySelectorAll('.dzg-cell--fill').length)) === 0, pre);

    // The no-drag way: a click on the handle, then a click on O-0005: O-0002's value copied down (one number: a copy).
    const c = await cell('O-0002', 'qty');
    await page.mouse.click(c.x, c.y);
    await frames(page, 2);
    const hp = await page.evaluate(() => { const r = document.querySelector('.dzg-fill').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(hp.x, hp.y);
    const t5 = await cell('O-0005', 'qty');
    await page.mouse.click(t5.x, t5.y);
    await frames(page, 2);
    const picked = await Promise.all(['O-0003', 'O-0004', 'O-0005'].map(async (r) => num((await cell(r, 'qty')).text)));
    check(name, `fill ${tag}: click the handle, then click O-0005: ${v2} copied into O-0003…O-0005 (WCAG 2.5.7)`, picked.every((x) => x === v2), { picked, v2 });
    await page.waitForTimeout(900);
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(900);

    // Ctrl+D on a one-cell focus: the row above copied in; the browser's default prevented.
    await page.evaluate(() => { window.prevented = null; addEventListener('keydown', (e) => { if (e.key === 'd' || e.code === 'KeyD') window.prevented = e.defaultPrevented; }); });
    const c7 = await cell('O-0007', 'qty');
    const above = num((await cell('O-0006', 'qty')).text);
    await page.mouse.click(c7.x, c7.y);
    await page.keyboard.press('ControlOrMeta+d');
    await frames(page, 2);
    const d7 = num((await cell('O-0007', 'qty')).text);
    check(name, `fill ${tag}: Ctrl/Cmd+D on O-0007 copies O-0006 (${above}) and is prevented`, d7 === above && (await page.evaluate(() => window.prevented)) === true, { d7, above });
    await page.waitForTimeout(900);
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(900);

    // Ctrl+Enter bulk on « Statut »: O-0008…O-0010, the field opened on the first, one option down, Ctrl+Enter.
    const s8 = await cell('O-0008', 'status');
    await page.mouse.click(s8.x, s8.y);
    // The focus follows the moving corner (QB2): F2 opens O-0010's field, inside the block.
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await frames(page, 2);
    const blk = await page.evaluate(() => document.querySelectorAll('.dzg-cell--range').length);
    await page.keyboard.press('F2');
    await frames(page, 2);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ControlOrMeta+Enter');
    await frames(page, 2);
    const st = await Promise.all(['O-0008', 'O-0009', 'O-0010'].map(async (r) => (await cell(r, 'status')).text));
    const field = await page.evaluate(() => !!document.querySelector('.dzg-field'));
    await page.waitForTimeout(150);
    check(name, `fill ${tag}: Ctrl+Enter in the Statut field of a 3-cell block writes one value in the three, closes the field, one sentence`, blk === 3 && !field && new Set(st).size === 1 && (ar ? /التعديل: 3/ : /Cellules modifiées\s?: 3/).test(await live()), { blk, st, field, said: await live() });

    if (name === 'chrome') {
      // A pen does not drag it (S12-Q12), by CDP.
      await page.waitForTimeout(900);
      await page.keyboard.press('ControlOrMeta+z');
      await page.waitForTimeout(900);
      const p1 = await cell('O-0002', 'qty');
      await page.mouse.click(p1.x, p1.y);
      await frames(page, 2);
      const hp2 = await page.evaluate(() => { const r = document.querySelector('.dzg-fill').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      const t3 = await cell('O-0003', 'qty');
      const before3 = (await cell('O-0003', 'qty')).text;
      const s = await page.context().newCDPSession(page);
      const pen = (type, x, y, buttons) => s.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1, pointerType: 'pen' });
      await pen('mousePressed', hp2.x, hp2.y, 1);
      for (let i = 1; i <= 6; i++) await pen('mouseMoved', hp2.x, hp2.y + ((t3.y - hp2.y) * i) / 6, 1);
      await pen('mouseReleased', t3.x, t3.y, 0);
      await frames(page, 2);
      const pre3 = (await cell('O-0003', 'qty')).text;
      check(name, `fill ${tag}: a pen drag of the handle writes nothing (S12-Q12: a pen is like a finger, as for blocks)`, pre3 === before3, { before3, pre3 });
      // axe 0 with a block, the handle and the fill mode on.
      await page.keyboard.press('Shift+ArrowDown');
      await page.keyboard.press('ControlOrMeta+Shift+Enter');
      await page.keyboard.press('ArrowDown');
      await frames(page, 2);
      // The grid only (the demo page's own log and headings are not the grid's).
      await axe(page);
      const v = await page.evaluate(async () => (await window.axe.run('#host', { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.length} (${x.nodes[0]?.target?.join(' ')})`));
      const fillOn = await page.evaluate(() => document.querySelectorAll('.dzg-cell--fill').length);
      check(name, `fill ${tag}: axe 0 on the grid with a block, the handle and the fill mode (its target outlined)`, v.length === 0 && fillOn > 0, { v, fillOn });
      await page.keyboard.press('Escape');
      // Forced colours: the square and the target still drawn (Highlight).
      await page.emulateMedia({ forcedColors: 'active' });
      await frames(page, 2);
      const fc = await page.evaluate(() => { const x = document.querySelector('.dzg-fill'); return x && getComputedStyle(x, '::before').backgroundColor; });
      check(name, `fill ${tag}: forced colours: the handle's square drawn in the system's Highlight`, !!fc && !/rgba\(0, 0, 0, 0\)/.test(fc), fc);
      await page.emulateMedia({ forcedColors: 'none' });
    }
    check(name, `fill ${tag}: no page error`, errors.length === 0, errors);
    await page.close();
  }
}

/**
 * Review 1 (step 12): the handle in start-pinned columns (range.html?fill=1: « Commande » and « Qté » both pinned at the
 * start), LTR and RTL, scrolled sideways: drawn at its own cell's bottom inline-end corner, not the segment's.
 */
export async function fillPinnedChecks(name, ctx, h) {
  const { check, frames, site } = h;
  for (const [tag, qs, ar] of [['ltr', 'locale=fr-FR', false], ['rtl', 'locale=ar-DZ', true]]) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto(site.root(`packages/dom/test/browser/range.html?fill=1&${qs}`));
    await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
    await frames(page, 2);
    // Scrolled sideways, so the pinned segment and its cells stand apart from the centre.
    await page.evaluate(() => { document.querySelector('.dzg-viewport').scrollLeft = document.dir === 'rtl' ? -200 : 200; });
    await frames(page, 2);
    for (const col of ['name', 'qty']) {
      await page.evaluate((col) => window.t.grid.api.focusCell(window.t.key('r3'), col), col);
      await frames(page, 2);
      const r = await page.evaluate((col) => {
        const c = window.t.cell('r3', col);
        const x = c.querySelector('.dzg-fill');
        if (!x) return null;
        const a = x.getBoundingClientRect();
        const b = c.getBoundingClientRect();
        return { pinned: !!c.closest('.dzg-seg-start'), dEnd: document.dir === 'rtl' ? Math.abs(a.left - b.left) : Math.abs(a.right - b.right), dBottom: Math.abs(a.bottom - b.bottom), inside: a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5, pos: getComputedStyle(c).position };
      }, col);
      check(name, `fill pinned ${tag}: the handle of a start-pinned cell (« ${col} », r3) sits at that cell's bottom ${ar ? 'left' : 'right'} corner, inside it (the cell its anchor)`, !!r && r.pinned && r.inside && r.dEnd <= 1 && r.dBottom <= 1 && r.pos === 'relative', r);
    }
    await page.close();
  }
}
