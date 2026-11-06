/**
 * Moving rows in real browsers (Phase 9, docs/behaviors/row-move.md; row-drag-plan.md R5): `node scripts/browser-row-drag.mjs`
 * (`--engine chrome|firefox|webkit|all`, default all) on the page packages/dom/test/browser/row-drag.html (made-up tasks,
 * 10 000 rows; `shape=tree` a tree of folders).
 * Every engine: a real mouse drag from a grip with auto-scroll to the far rows (no frame over 50 ms while it scrolls), one
 * `rowMove`, the order given back, the focus on the moved row; the line on the gap within 1 px; right to left (ar): the grip
 * at the right edge of its cell, a tree's line starting at its indent from the right; the keys (Alt+Shift+↓, and in a tree
 * ← indents right to left), the focus kept; the grip a 24 × 24 px target.
 * Chrome: axe 0 mid-drag and after (fr and ar); a finger on the grip moves the row, a finger elsewhere scrolls; forced
 * colours: the line in Highlight; a drop on the zone calls it, the rows unchanged. Browsers closed in finally.
 */
import { fileURLToPath } from 'node:url';
import { serve, browser } from '../spikes/kit.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const arg = process.argv.includes('--engine') ? process.argv[process.argv.indexOf('--engine') + 1] : 'all';
const engines = arg === 'all' ? ['chrome', 'firefox', 'webkit'] : [arg];
const results = [];
const check = (engine, label, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${engine}: ${label}  ${JSON.stringify(detail ?? null).slice(0, 400)}`);
};
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

const site = await serve(import.meta.url);
async function open(ctx, qs) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1000, height: 760 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(site.root(`packages/dom/test/browser/row-drag.html?${qs}`));
  await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
  await page.waitForSelector('.dzg-grip');
  await frames(page, 3);
  return { page, errors };
}
/** A row's grip (its centre) and its row's box. */
const gripOf = (page, id) => page.evaluate((id) => {
  const t = window.t;
  const key = t.grid.kernel.rows.displayed.keyAt(t.grid.kernel.rows.displayed.indexOf(`d:${id.length}:${id}`));
  const row = [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => r.querySelector('.dzg-grip') && r.querySelector('[data-col=title]')?.textContent?.includes(t.grid.kernel.rowOf(key)?.data.title));
  const g = row?.querySelector('.dzg-grip');
  if (!g) return null;
  const b = g.getBoundingClientRect();
  const c = g.closest('.dzg-cell').getBoundingClientRect();
  const r = row.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height, gl: b.left, gr: b.right, cl: c.left, cr: c.right, top: r.top, bottom: r.bottom, rl: r.left, rr: r.right };
}, id);
const bar = (page) => page.evaluate(() => {
  const b = document.querySelector('.dzg-rmove-bar');
  if (!b || b.hidden) return null;
  const r = b.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, mid: (r.top + r.bottom) / 2, bg: getComputedStyle(b).backgroundColor };
});

for (const name of engines) {
  const b = await browser(name);
  try {
    const ctx = await b.newContext();
    // ---- 1. A mouse drag over 10 000 rows with auto-scroll (fr) ----
    {
      const { page, errors } = await open(ctx, 'locale=fr-FR&theme=light');
      const g = await gripOf(page, 't1');
      check(name, 'the grip is a 24 × 24 px target at the inline start of its cell', g && g.w >= 24 && g.h >= 24 && Math.abs(g.gl - g.cl) <= 12, g);
      const vp = await page.evaluate(() => { const r = document.querySelector('.dzg-viewport').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left }; });
      await page.mouse.move(g.x, g.y);
      await page.mouse.down();
      await page.mouse.move(g.x, g.y + 6, { steps: 2 });
      // Near the bottom edge: the rows scroll; frame times read in the page meanwhile.
      await page.evaluate(() => { window.gaps = []; let last = performance.now(); window.stop = false; const f = (t) => { window.gaps.push(t - last); last = t; if (!window.stop) requestAnimationFrame(f); }; requestAnimationFrame(f); });
      await page.mouse.move(g.x + 100, vp.bottom - 6, { steps: 6 });
      await page.waitForTimeout(1500);
      const mid = await page.evaluate(() => ({ top: document.querySelector('.dzg-viewport').scrollTop, gaps: (window.stop = true, window.gaps.slice(2)) }));
      // The line on a gap: a row's top or bottom edge within 1 px.
      const line = await bar(page);
      const edges = await page.evaluate(() => [...document.querySelectorAll('.dzg-layer > .dzg-row')].flatMap((r) => { const x = r.getBoundingClientRect(); return [x.top, x.bottom]; }));
      const worst = Math.max(...mid.gaps);
      check(name, 'auto-scroll near the bottom: the rows scroll, no frame over 50 ms', mid.top > 500 && worst <= 50, { top: mid.top, worst: Math.round(worst), frames: mid.gaps.length });
      check(name, 'the line sits on a gap between two rows (within 1 px), its layer aria-hidden', !!line && edges.some((e) => Math.abs(e - line.mid) <= 1) && (await page.evaluate(() => document.querySelector('.dzg-rmove').getAttribute('aria-hidden'))) === 'true', { line, near: line && Math.min(...edges.map((e) => Math.abs(e - line.mid))) });
      if (name === 'chrome') {
        await page.addScriptTag({ path: `${ROOT}node_modules/axe-core/axe.min.js` });
        const axe = () => page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.length}`));
        check(name, 'fr: axe 0 mid-drag', (await axe()).length === 0, await axe());
      }
      await page.mouse.up();
      await frames(page, 3);
      // The live region fills after a beat (50 ms).
      await page.waitForTimeout(150);
      const after = await page.evaluate(() => {
        const t = window.t;
        const m = t.moves();
        const f = t.grid.kernel.focus;
        const a = document.activeElement;
        return { n: m.length, keys: m[0]?.keys, at: t.order().indexOf('t1'), first: t.order()[0], focus: f && f.row, active: a?.closest('.dzg-row')?.querySelector('[data-col=title]')?.textContent, said: t.said.slice(-1)[0] };
      });
      check(name, 'one rowMove on release; the order given back; the focus on the moved row (DOM too); its place said', after.n === 1 && after.at > 10 && after.first === 't0' && /Tâche|Acheter|Arroser|Ranger|Écrire/.test(after.active ?? '') && after.active?.endsWith(' 2') && /^Ligne \d+ sur 10\s?000$/.test(after.said ?? ''), after);
      if (name === 'chrome') {
        const axe = () => page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.length}`));
        check(name, 'fr: axe 0 after the drop', (await axe()).length === 0, await axe());
      }
      // ---- The keys: Alt+Shift+↓ moves the focused row, the focus stays ----
      const k0 = await page.evaluate(() => window.t.order().indexOf('t1'));
      await page.keyboard.press('Alt+Shift+ArrowDown');
      await frames(page, 2);
      const k1 = await page.evaluate(() => ({ at: window.t.order().indexOf('t1'), active: document.activeElement?.closest('.dzg-row')?.querySelector('[data-col=title]')?.textContent }));
      check(name, 'Alt+Shift+↓ moves the focused row one place; the DOM focus stays on it', k1.at === k0 + 1 && k1.active?.endsWith(' 2'), { k0, k1 });
      // ---- A drop on the zone ----
      const z = await page.evaluate(() => { const r = document.getElementById('zone').getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; });
      await page.evaluate(() => (document.querySelector('.dzg-viewport').scrollTop = 0));
      await frames(page, 2);
      const g3 = await gripOf(page, 't0');
      await page.mouse.move(g3.x, g3.y);
      await page.mouse.down();
      await page.mouse.move(g3.x, g3.y + 8, { steps: 2 });
      await page.mouse.move(z.x, z.y, { steps: 6 });
      await frames(page, 2);
      const over = await page.evaluate(() => document.getElementById('zone').getAttribute('data-dzg-drop'));
      await page.mouse.up();
      const dz = await page.evaluate(() => ({ dropped: window.t.dropped, moves: window.t.moves().length }));
      check(name, 'over the zone: marked; released: drop(keys) once, no move', over === 'over' && dz.dropped.length === 1 && dz.moves === 2, { over, dz });
      check(name, 'fr: no page error', errors.length === 0, errors);
      await page.close();
    }
    // ---- 2. Right to left: the grip on the right, a tree's line from its indent on the right; ← indents ----
    {
      const { page, errors } = await open(ctx, 'locale=ar-DZ&theme=dark&shape=tree');
      const g = await gripOf(page, 'B1');
      check(name, 'ar: the grip at the right edge of its cell (after the chevron and the indent)', g && g.gr <= g.cr && g.cr - g.gr < 80 && g.w >= 24, g);
      const tgt = await gripOf(page, 'A1');
      await page.mouse.move(g.x, g.y);
      await page.mouse.down();
      await page.mouse.move(g.x, g.y - 8, { steps: 2 });
      // A1's upper quarter: before A1, at level 1 (one indent from the right).
      await page.mouse.move(g.x - 60, tgt.top + (tgt.bottom - tgt.top) * 0.15, { steps: 6 });
      await frames(page, 3);
      const line = await bar(page);
      const rowR = tgt.rr;
      check(name, 'ar: the line before A1 starts one indent (16 px) from the rows\' right edge, on the gap', !!line && Math.abs(rowR - line.right - 16) <= 2 && Math.abs(line.mid - tgt.top) <= 1.5, { line, rowR, top: tgt.top });
      if (name === 'chrome') {
        await page.addScriptTag({ path: `${ROOT}node_modules/axe-core/axe.min.js` });
        const axe = () => page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.length}`));
        check(name, 'ar: axe 0 mid-drag (tree)', (await axe()).length === 0, await axe());
        await page.emulateMedia({ forcedColors: 'active' });
        await frames(page, 2);
        const fc = await page.evaluate(() => {
          const probe = document.body.appendChild(document.createElement('div'));
          probe.style.background = 'Highlight';
          const hl = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return { bar: getComputedStyle(document.querySelector('.dzg-rmove-bar')).backgroundColor, hl };
        });
        check(name, 'forced colours: the line in Highlight', fc.bar === fc.hl, fc);
        await page.emulateMedia({ forcedColors: 'none' });
      }
      await page.mouse.up();
      await frames(page, 3);
      const m = await page.evaluate(() => { const e = window.t.moves().at(-1); return e && { target: e.target, parent: e.parent }; });
      check(name, 'ar: released: B1 before A1, under A', m?.target?.where === 'before' && m.parent === 'd:1:A', m);
      // ← indents in Arabic: A2 into A1 (B1 now sits between? the order given back), the focus kept.
      await page.evaluate(() => window.t.grid.api.focusCell('d:2:A2', 'title'));
      await frames(page, 2);
      await page.keyboard.press('Alt+Shift+ArrowLeft');
      await frames(page, 3);
      const k = await page.evaluate(() => { const e = window.t.moves().at(-1); return { where: e.target.where, parent: e.parent, active: document.activeElement?.closest('.dzg-row')?.querySelector('[data-col=title]')?.textContent }; });
      check(name, 'ar: Alt+Shift+← moves inside the sibling before (right to left), the focus kept', k.where === 'inside' && k.active?.includes('A2'), k);
      if (name === 'chrome') {
        const axe = () => page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.length}`));
        check(name, 'ar: axe 0 after', (await axe()).length === 0, await axe());
      }
      check(name, 'ar: no page error', errors.length === 0, errors);
      await page.close();
    }
    // ---- 3. Chrome: a finger on the grip moves, a finger elsewhere scrolls ----
    if (name === 'chrome') {
      const tctx = await b.newContext({ hasTouch: true });
      const { page, errors } = await open(tctx, 'locale=fr-FR');
      const cdp = await tctx.newCDPSession(page);
      const touch = async (pts) => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pts[0]] });
        for (const p of pts.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] }), await frames(page, 1);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await frames(page, 3);
      };
      const g = await gripOf(page, 't0');
      const to = await gripOf(page, 't4');
      await touch([{ x: g.x, y: g.y }, { x: g.x, y: g.y + 10 }, { x: g.x, y: g.y + 40 }, { x: g.x + 20, y: to.top + (to.bottom - to.top) * 0.8 }]);
      const t1 = await page.evaluate(() => ({ moves: window.t.moves().length, at: window.t.order().indexOf('t0'), top: document.querySelector('.dzg-viewport').scrollTop }));
      const c = await page.evaluate(() => { const r = document.querySelector('.dzg-layer > .dzg-row:nth-child(8) [data-col=who]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await touch([{ x: c.x, y: c.y }, { x: c.x, y: c.y - 40 }, { x: c.x, y: c.y - 120 }, { x: c.x, y: c.y - 200 }]);
      const t2 = await page.evaluate(() => ({ moves: window.t.moves().length, top: document.querySelector('.dzg-viewport').scrollTop }));
      check(name, 'a finger on the grip moves the row (one rowMove); a finger elsewhere scrolls, no move', t1.moves === 1 && t1.at === 4 && t2.moves === 1 && t2.top > t1.top, { t1, t2 });
      check(name, 'touch: no page error', errors.length === 0, errors);
      await page.close();
      await tctx.close();
    }
    await ctx.close();
  } finally {
    await b.close();
  }
}
await site.close();
const fail = results.filter((r) => !r).length;
console.log(`${results.length - fail} / ${results.length} ok`);
process.exit(fail ? 1 : 0);
