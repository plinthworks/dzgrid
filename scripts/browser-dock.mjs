/**
 * The dock in real browsers (Phase 9, docs/behaviors/dock.md): `node scripts/browser-dock.mjs` (`--engine
 * chrome|firefox|webkit|all`, default all) on the page packages/dom/test/browser/dock.html (made-up stock rows; the
 * columns panel and the filters panel as two tabs in the end area).
 * Every engine (layout and right to left): the end area at the grid's inline end, the rows and headers stopping at it;
 * the edge a 24 px gutter; a real mouse drag of the edge resizes the area, one layout told; ← on the edge; Enter collapses
 * to the 2 rem strip and the rows take the room; « Déplier » restores; the bottom area under the rows, between the
 * sides; in Arabic the end area at the left, a drag toward the rows widens it, → moves the edge right (planted fault: an
 * edge written with a physical side fails here).
 * Chrome: axe 0 (fr with tabs and the place menu open, ar); forced colours: the edge in CanvasText; 320 px: an open side
 * area covers the rows, its edge hidden. Browsers closed in finally.
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
async function open(ctx, qs, width = 1100) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height: 760 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(site.root(`packages/dom/test/browser/dock.html?${qs}`));
  await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
  await page.waitForSelector('.dzg-row');
  await frames(page, 3);
  return { page, errors };
}
/** The boxes that matter: the root, the viewport, the header, each area, each edge. */
const boxes = (page) => page.evaluate(() => {
  const b = (el) => { if (!el || el.hidden) return null; const r = el.getBoundingClientRect(); if (!r.width && !r.height) return null; return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
  const a = (s) => document.querySelector(`.dzg-dock[data-area=${s}]`);
  return {
    root: b(document.querySelector('.dzg')), vp: b(document.querySelector('.dzg-viewport')), head: b(document.querySelector('.dzg-header')),
    end: b(a('end')), start: b(a('start')), bottom: b(a('bottom')),
    sepEnd: b(a('end')?.querySelector('.dzg-dock-sep')), sepBottom: b(a('bottom')?.querySelector('.dzg-dock-sep')),
    now: a('end')?.querySelector('.dzg-dock-sep')?.getAttribute('aria-valuenow'),
  };
});
const axe = (page) => page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.length}`));

for (const name of engines) {
  const b = await browser(name);
  try {
    const ctx = await b.newContext();
    // ---- 1. Left to right (fr): the end area, its edge by the mouse and the keys, collapse, the bottom area ----
    {
      const { page, errors } = await open(ctx, 'locale=fr-FR&theme=light&open=columns:end');
      let x = await boxes(page);
      check(name, 'fr: the end area at the grid’s inline end, the rows and headers stop at it, 288 px', !!x.end && Math.abs(x.end.r - x.root.r) <= 1 && x.vp.r <= x.end.l + 1 && x.head.r <= x.end.l + 1 && Math.abs(x.end.w - 288) <= 2 && !x.start, x);
      check(name, 'fr: the edge is a 24 px gutter on the rows’ side of the area, the whole height', !!x.sepEnd && x.sepEnd.w === 24 && Math.abs(x.sepEnd.l - x.end.l) <= 2 && x.sepEnd.h >= x.end.h - 2, x.sepEnd);
      const tabs = await page.evaluate(() => [...document.querySelectorAll('.dzg-dock[data-area=end] [role=tab]')].map((t) => [t.textContent, t.getAttribute('aria-selected')]));
      check(name, 'fr: two tabs in the end area, the columns panel shown', JSON.stringify(tabs) === JSON.stringify([['Choisir les colonnes', 'true'], ['Filtres', 'false']]), tabs);
      if (name === 'chrome') {
        await page.addScriptTag({ path: `${ROOT}node_modules/axe-core/axe.min.js` });
        check(name, 'fr: axe 0 with the tabs', (await axe(page)).length === 0, await axe(page));
      }
      // A real drag of the edge, 60 px toward the rows.
      const y = x.sepEnd.t + x.sepEnd.h / 2;
      await page.mouse.move(x.sepEnd.l + 12, y);
      await page.mouse.down();
      await page.mouse.move(x.sepEnd.l - 20, y, { steps: 3 });
      await page.mouse.move(x.sepEnd.l - 48, y, { steps: 3 });
      await page.mouse.up();
      await frames(page, 3);
      const was = x;
      x = await boxes(page);
      const told = await page.evaluate(() => window.t.layouts.map((l) => l.areas.end?.size));
      check(name, 'fr: a mouse drag of the edge widens the area by the pointer’s way (60 px), the rows narrower; one layout told', Math.abs(x.end.w - was.end.w - 60) <= 2 && x.now === String(was.end.w + 60 - 0) && Math.abs(x.vp.r - x.end.l) <= 1 && told.length === 1, { w: [was.end.w, x.end.w], now: x.now, told });
      await page.focus('.dzg-dock[data-area=end] .dzg-dock-sep');
      await page.keyboard.press('ArrowLeft');
      await frames(page, 2);
      const k = await boxes(page);
      check(name, 'fr: ← on the edge moves it left, the area 16 px wider', k.end.w - x.end.w === 16, [x.end.w, k.end.w]);
      await page.keyboard.press('Enter');
      await frames(page, 3);
      const c = await boxes(page);
      const f = await page.evaluate(() => document.activeElement?.className);
      check(name, 'fr: Enter collapses to the 2 rem strip, the rows take the room, the focus on « Déplier »', c.end && Math.abs(c.end.w - 32) <= 2 && Math.abs(c.vp.r - c.end.l) <= 1 && f === 'dzg-dock-tog', { w: c.end?.w, vp: c.vp.r, f });
      await page.keyboard.press('Enter'); // the focused « Déplier »
      await frames(page, 3);
      const r = await boxes(page);
      check(name, 'fr: « Déplier » restores the area at its size', r.end.w === k.end.w, [k.end.w, r.end.w]);
      // The filters panel to the bottom: under the rows and the bottom strip, between the sides.
      await page.evaluate(() => window.t.dock.move('filters', 'bottom'));
      await frames(page, 3);
      const bt = await boxes(page);
      check(name, 'fr: the bottom area under the rows, from the grid’s start to the end area, 240 px high', !!bt.bottom && bt.vp.b <= bt.bottom.t + 1 && Math.abs(bt.bottom.b - bt.root.b) <= 1 && Math.abs(bt.bottom.l - bt.root.l) <= 1 && Math.abs(bt.bottom.r - bt.end.l) <= 1 && Math.abs(bt.bottom.h - 240) <= 2, { bottom: bt.bottom, vp: bt.vp, end: bt.end });
      await page.focus('.dzg-dock[data-area=bottom] .dzg-dock-sep');
      await page.keyboard.press('ArrowUp');
      await frames(page, 2);
      const up = await boxes(page);
      check(name, 'fr: ↑ on the bottom edge raises it, the area 16 px higher', up.bottom.h - bt.bottom.h === 16, [bt.bottom.h, up.bottom.h]);
      if (name === 'chrome') {
        await page.click('.dzg-dock[data-area=end] .dzg-dock-place');
        await page.waitForSelector('[role=menu]');
        check(name, 'fr: axe 0 with the place menu open', (await axe(page)).length === 0, await axe(page));
        await page.keyboard.press('Escape');
        await page.emulateMedia({ forcedColors: 'active' });
        const fc = await page.evaluate(() => {
          const probe = document.body.appendChild(document.createElement('i'));
          probe.style.color = 'CanvasText';
          const ct = getComputedStyle(probe).color;
          probe.remove();
          return { line: getComputedStyle(document.querySelector('.dzg-dock[data-area=end] .dzg-dock-sep'), '::before').backgroundColor, ct };
        });
        check(name, 'forced colours: the edge’s line in CanvasText', fc.line === fc.ct, fc);
        await page.emulateMedia({ forcedColors: 'none' });
      }
      check(name, 'fr: no page error', errors.length === 0, errors);
      await page.close();
    }
    // ---- 2. Right to left (ar): the end area at the left, the edge by the mouse and the keys ----
    {
      const { page, errors } = await open(ctx, 'locale=ar-DZ&theme=dark&open=columns:end,filters:start');
      let x = await boxes(page);
      check(name, 'ar: the end area at the left, the start one at the right, the rows between them', !!x.end && !!x.start && Math.abs(x.end.l - x.root.l) <= 1 && Math.abs(x.start.r - x.root.r) <= 1 && x.vp.l >= x.end.r - 1 && x.vp.r <= x.start.l + 1, x);
      check(name, 'ar: the end area’s edge on its right (the rows’ side)', Math.abs(x.sepEnd.r - x.end.r) <= 2, { sep: x.sepEnd, end: x.end });
      const y = x.sepEnd.t + x.sepEnd.h / 2;
      await page.mouse.move(x.sepEnd.r - 12, y);
      await page.mouse.down();
      await page.mouse.move(x.sepEnd.r + 20, y, { steps: 3 });
      await page.mouse.move(x.sepEnd.r + 28, y, { steps: 3 });
      await page.mouse.up();
      await frames(page, 3);
      const d = await boxes(page);
      check(name, 'ar: a drag toward the rows (right) widens the end area by 40 px, its left edge kept', Math.abs(d.end.w - x.end.w - 40) <= 2 && Math.abs(d.end.l - x.end.l) <= 1, [x.end, d.end]);
      await page.focus('.dzg-dock[data-area=end] .dzg-dock-sep');
      await page.keyboard.press('ArrowRight');
      await frames(page, 2);
      const k = await boxes(page);
      check(name, 'ar: → moves the edge right, the end area 16 px wider', k.end.r - d.end.r === 16 && k.end.w - d.end.w === 16, [d.end, k.end]);
      if (name === 'chrome') {
        await page.addScriptTag({ path: `${ROOT}node_modules/axe-core/axe.min.js` });
        check(name, 'ar: axe 0', (await axe(page)).length === 0, await axe(page));
      }
      check(name, 'ar: no page error', errors.length === 0, errors);
      await page.close();
    }
    // ---- 3. Chrome, 320 px: an open side area covers the rows ----
    if (name === 'chrome') {
      const { page, errors } = await open(ctx, 'locale=fr-FR&open=columns:end', 320);
      const x = await boxes(page);
      check(name, '320 px: the open end area covers the rows, its edge hidden', !!x.end && x.end.l <= x.root.l + 1 && x.end.r >= x.root.r - 1 && !x.sepEnd, x);
      check(name, '320 px: no page error', errors.length === 0, errors);
      await page.close();
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
