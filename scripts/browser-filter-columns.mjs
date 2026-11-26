/**
 * A column's filter stays on its column (docs/behaviors/filter-ui.md « On its column », owner 2026-11-26):
 * `node scripts/browser-filter-columns.mjs [--engine chrome|firefox|webkit]` (`npm run test:filter-columns`).
 * Page `packages/dom/test/browser/filter-columns.html`: column groups, a column pinned at each end, a column without a
 * floating filter, enough columns to scroll sideways; French, and Arabic right to left. In each engine and direction:
 * at load, after a sideways scroll by the wheel, while and after a column is resized by its grip, after a column is
 * moved: every mounted column's floating cell has its header cell's and its body cell's start and end edges (0.5 px),
 * its filter button sits inside its header cell, and the popup opened from a grouped, a pinned-start, a pinned-end and
 * a scrolled column starts on the button and on the column, below the header (or, at the window's end, stays in the
 * window and still over the column). Real pointer and wheel, no layout read from jsdom. Browsers closed in finally.
 * `PLANT_CSS='…'` adds a stylesheet to the page after load: how the test was shown to fail (a floating cell 3 px off,
 * a button past its header, a popup moved; see filter-ui.md « Tests »).
 */
import { serve, browser } from '../spikes/kit.mjs';

const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1]; };
const engines = arg('--engine') ? [arg('--engine')] : ['chrome', 'firefox', 'webkit'];
const EDGE = 0.5;
let passes = 0;
let fails = 0;
const check = (label, ok, detail) => {
  ok ? passes++ : fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `  ${JSON.stringify(detail ?? null).slice(0, 900)}`}`);
};
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));

/** Every mounted leaf column: its header cell, floating cell, first body cell and filter button, as boxes. */
const measure = (page) => page.evaluate(() => {
  const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width }; };
  const row = document.querySelector('.dzg-row');
  const view = document.querySelector('.dzg-viewport').getBoundingClientRect();
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  // The columns the user sees: the header may keep one mounted past the view's edge, with no cell under it.
  return [...document.querySelectorAll('.dzg-hcell:not(.dzg-hgroup)[role=columnheader][data-col]')].filter((h) => {
    const r = h.getBoundingClientRect();
    return r.right > view.left + 1 && r.left < view.right - 1;
  }).map((h) => {
    const id = h.dataset.col;
    const cs = getComputedStyle(h);
    // The width the header's container query reads (filters/styles.ts: under 6.5 rem the button folds until hovered).
    const inner = h.getBoundingClientRect().width - parseFloat(cs.paddingInlineStart) - parseFloat(cs.paddingInlineEnd) - parseFloat(cs.borderInlineStartWidth) - parseFloat(cs.borderInlineEndWidth);
    return {
      id, narrow: inner < 6.5 * rem, head: box(h), extra: box(document.querySelector(`.dzg-hextra[data-col="${id}"]`)),
      body: box(row?.querySelector(`[data-col="${id}"]`)), button: box(h.querySelector(':scope > .dzg-fbtn')),
    };
  });
});

/** The columns whose pieces are off their column (an empty list when all hold). */
const offColumn = (cols) => cols.flatMap((c) => {
  const bad = [];
  const same = (a, b) => a && b && Math.abs(a.l - b.l) <= EDGE && Math.abs(a.r - b.r) <= EDGE;
  if (!same(c.extra, c.head)) bad.push({ id: c.id, what: 'floating cell vs header', extra: c.extra, head: c.head });
  if (!same(c.body, c.head)) bad.push({ id: c.id, what: 'body cell vs header', body: c.body, head: c.head });
  const b = c.button, h = c.head;
  // Under 6.5 rem inside, a header folds its button to nothing until hovered or focused (filters/styles.ts); else ≥ 24 px.
  const folded = b && c.narrow && b.w === 0;
  if (!b || (!folded && b.w < 24) || b.l < h.l - EDGE || b.r > h.r + EDGE || b.t < h.t - EDGE || b.b > h.b + EDGE) bad.push({ id: c.id, what: 'button outside its header cell or under 24 px', button: b, head: h });
  return bad;
});

const site = await serve(new URL('../packages/dom/test/browser/filter-columns.html', import.meta.url).href);
try {
  for (const engine of engines) {
    const B = await browser(engine);
    try {
      for (const lang of ['fr', 'ar']) {
        const rtl = lang === 'ar';
        const tag = `${engine} ${lang}`;
        const page = await B.newPage();
        await page.setViewportSize({ width: 1000, height: 640 });
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(site.url(`filter-columns.html${rtl ? '?lang=ar' : ''}`));
        await page.waitForFunction(() => window.ready === true && !!document.querySelector('.dzg-row'), null, { timeout: 30000 });
        if (process.env.PLANT_CSS) await page.addStyleTag({ content: process.env.PLANT_CSS });
        await frames(page);

        const all = (label) => measure(page).then((cols) => {
          const bad = offColumn(cols);
          check(`${tag}: ${label}: every column's floating cell, body cell and button on its column (${cols.length} columns)`, cols.length >= 6 && bad.length === 0, bad);
          return cols;
        });
        const at = (cols, id) => cols.find((c) => c.id === id);

        // The popup from a column's button: on the button's start edge and the column, below the header; at the
        // window's end, in the window and still over the column. Escape closes it.
        const popup = async (id, label) => {
          // As a user: the pointer on the header first (a narrow header shows its button only then), then the button.
          await page.hover(`.dzg-hcell:not(.dzg-hgroup)[role=columnheader][data-col="${id}"] > .dzg-hlabel`);
          await frames(page);
          const shown = await page.evaluate((id) => {
            const h = document.querySelector(`.dzg-hcell:not(.dzg-hgroup)[role=columnheader][data-col="${id}"]`).getBoundingClientRect();
            const b = document.querySelector(`.dzg-hcell:not(.dzg-hgroup)[role=columnheader][data-col="${id}"] > .dzg-fbtn`).getBoundingClientRect();
            return { w: b.width, inside: b.left >= h.left - 0.5 && b.right <= h.right + 0.5 };
          }, id);
          check(`${tag}: ${label}: under the pointer, the button of ${id} shows, ≥ 24 px, inside its header cell`, shown.w >= 24 && shown.inside, shown);
          await page.click(`.dzg-hcell:not(.dzg-hgroup)[role=columnheader][data-col="${id}"] > .dzg-fbtn`);
          await page.waitForSelector('.dzg-popup .dzg-fpop');
          await frames(page);
          const s = await page.evaluate((id) => {
            const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
            return {
              pop: box(document.querySelector('.dzg-popup')), head: box(document.querySelector(`.dzg-hcell:not(.dzg-hgroup)[role=columnheader][data-col="${id}"]`)),
              button: box(document.querySelector(`.dzg-hcell:not(.dzg-hgroup)[role=columnheader][data-col="${id}"] > .dzg-fbtn`)), win: document.documentElement.clientWidth,
            };
          }, id);
          const start = rtl ? s.pop.r : s.pop.l;
          const onButton = Math.abs(start - (rtl ? s.button.r : s.button.l)) <= 1;
          const inColumn = start >= s.head.l - 1 && start <= s.head.r + 1;
          const inWindow = s.pop.l >= -0.5 && s.pop.r <= s.win + 0.5;
          const overColumn = s.pop.l < s.head.r && s.pop.r > s.head.l;
          const clamped = rtl ? s.button.r - (s.pop.r - s.pop.l) < 8 : s.button.l + (s.pop.r - s.pop.l) > s.win - 8;
          const below = s.pop.t >= s.button.b - 1;
          check(`${tag}: ${label}: the popup of ${id} ${clamped ? 'kept in the window, over its column' : 'on its button and its column'}, below the header`,
            below && inWindow && (clamped ? overColumn : onButton && inColumn), { ...s, clamped });
          await page.keyboard.press('Escape');
          await page.waitForSelector('.dzg-popup .dzg-fpop', { state: 'detached' });
        };

        // At load: groups above, pins at both ends, an empty floating cell (note).
        const c0 = await all('at load');
        check(`${tag}: at load: the empty floating cell of note is there and holds no box`, await page.evaluate(() => { const e = document.querySelector('.dzg-hextra[data-col="note"]'); return !!e && !e.querySelector('input'); }));
        check(`${tag}: at load: the floating row sits under the group row and the column headers`, (() => { const t = at(c0, 'title'); return t && t.extra.t >= t.head.b - EDGE; })(), at(c0, 'title'));
        await popup('title', 'at load (grouped)');
        await popup('id', 'at load (pinned start)');
        await popup('total', 'at load (pinned end)');

        // A sideways scroll by the wheel: the scrolled columns' pieces move with them, the pinned ones stay.
        await page.mouse.move(500, 400);
        await page.mouse.wheel(rtl ? -480 : 480, 0);
        await page.waitForFunction(() => Math.abs(document.querySelector('.dzg-viewport').scrollLeft) > 100, null, { timeout: 5000 });
        await frames(page);
        const c1 = await all('after a sideways scroll');
        const still = (id) => { const a = at(c0, id), b = at(c1, id); return a && b && Math.abs(a.head.l - b.head.l) <= EDGE && Math.abs(a.extra.l - b.extra.l) <= EDGE; };
        check(`${tag}: after a sideways scroll: the pinned id and total stay put, header and floating cell`, still('id') && still('total'), { id: [at(c0, 'id'), at(c1, 'id')], total: [at(c0, 'total'), at(c1, 'total')] });
        const moved = c1.find((c) => /^c\d$/.test(c.id) && at(c0, c.id) && Math.abs(at(c0, c.id).head.l - c.head.l) > 50);
        check(`${tag}: after a sideways scroll: a scrolled column really moved`, !!moved, c1.map((c) => c.id));
        const mid = c1.find((c) => /^c\d$/.test(c.id) && c.head.l > 300 && c.head.r < 700);
        if (mid) await popup(mid.id, 'after a sideways scroll');
        else check(`${tag}: after a sideways scroll: a scrolled column in the middle to open`, false, c1.map((c) => [c.id, c.head.l]));
        await page.mouse.wheel(rtl ? 480 : -480, 0);
        await page.waitForFunction(() => Math.abs(document.querySelector('.dzg-viewport').scrollLeft) < 1, null, { timeout: 5000 });
        await frames(page);

        // A resize by the grip, 60 px toward the end: during the drag and after it.
        const grip = await page.evaluate(() => { const r = document.querySelector('.dzg-hcell:not(.dzg-hgroup)[role=columnheader][data-col="reader"] > .dzg-resize').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        const w0 = at(await measure(page), 'reader').head.w;
        const dx = rtl ? -60 : 60;
        await page.mouse.move(grip.x, grip.y);
        await page.mouse.down();
        for (let k = 1; k <= 6; k++) await page.mouse.move(grip.x + (dx * k) / 6, grip.y);
        await frames(page);
        await all('during a grip resize');
        await page.mouse.up();
        await frames(page);
        const c2 = await all('after a grip resize');
        check(`${tag}: after a grip resize: reader is 60 px wider`, Math.abs(at(c2, 'reader').head.w - w0 - 60) <= 2, { before: w0, after: at(c2, 'reader').head.w });
        await popup('reader', 'after a grip resize');

        // A column moved: fine first among the scrolling columns, out of its group.
        await page.evaluate(() => window.grid.kernel.dispatch({ type: 'column.state', patch: [{ id: 'fine', order: 1 }] }, 'user'));
        await frames(page);
        const c3 = await all('after a column moved');
        const order = c3.filter((c) => c.id !== 'id').sort((a, b) => (rtl ? b.head.r - a.head.r : a.head.l - b.head.l)).map((c) => c.id);
        check(`${tag}: after a column moved: fine is first after the pinned id`, order[0] === 'fine', order);
        await popup('fine', 'after a column moved');

        check(`${tag}: no page error, nothing told`, errors.length === 0 && (await page.evaluate(() => window.told.length)) === 0, { errors, told: await page.evaluate(() => window.told) });
        await page.close();
      }
    } finally {
      await B.close().catch(() => {});
    }
  }
} finally {
  await site.close();
}
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
