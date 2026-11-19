/**
 * 1.14.0's five additions in real browsers (owner 2026-11-18 « oui lance 1 à 5 »): the playground page `v1-14.html` on
 * 127.0.0.1:4700 (or DZG_PLAYGROUND), never restarted. Chrome, Firefox and WebKit one after another, each closed in a
 * `finally`. `--only heights|textarea|share|groups|xlsx`, `--engine chrome|firefox|webkit`.
 * - heights (virtual-scroll.md « Row height by a function »): rows as tall as the function says (72 / 44 / 32), a panel
 *   under its master, `ensureVisible` lands exactly; 100 000 rows: the first paint, a function changed, and a scroll of
 *   120 frames (frame times: median, p95, worst) against the same grid at one height.
 * - textarea (editors.md 18–22): over the cell, above the rows under it, grows with a line, upward near the view's end;
 *   Ctrl/Cmd+Enter keeps the two lines.
 * - share (aggregation.md 19–24): the shares and the grand total written, isolated left to right in Arabic.
 * - groups (row-grouping.md 25–29): a group's box ticks its rows, Space unticks them.
 * - xlsx (xlsx-export.md 6–10): the file built in the browser holds the title rows, merged, the filter on the table.
 */
import { inflateRawSync } from 'node:zlib';
import { browser, median, percentile } from '../spikes/kit.mjs';

const base = process.env.DZG_PLAYGROUND ?? 'http://127.0.0.1:4700';
const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1]; };
const only = arg('--only');
const engines = arg('--engine') ? [arg('--engine')] : ['chrome', 'firefox', 'webkit'];
let fails = 0;
let passes = 0;
const check = (name, ok, detail = '') => { ok ? passes++ : fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

/** The entries of a ZIP by name (central directory, PKWARE APPNOTE §4.3), inflated: our own reading. */
const unzip = (b) => {
  let end = b.length - 22;
  while (b.readUInt32LE(end) !== 0x06054b50) end--;
  const out = new Map();
  for (let i = 0, p = b.readUInt32LE(end + 16); i < b.readUInt16LE(end + 10); i++) {
    const method = b.readUInt16LE(p + 10), size = b.readUInt32LE(p + 20), nl = b.readUInt16LE(p + 28), off = b.readUInt32LE(p + 42);
    const name = b.subarray(p + 46, p + 46 + nl).toString();
    const start = off + 30 + b.readUInt16LE(off + 26) + b.readUInt16LE(off + 28);
    const raw = b.subarray(start, start + size);
    out.set(name, (method === 8 ? inflateRawSync(raw) : raw).toString());
    p += 46 + nl + b.readUInt16LE(p + 30) + b.readUInt16LE(p + 32);
  }
  return out;
};

async function run(name) {
  const B = await browser(name);
  try {
    const ctx = await B.newContext({ viewport: { width: 1000, height: 700 } });
    const open = async (qs) => {
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${base}/v1-14.html?${qs}`);
      await page.waitForSelector('.dzg-layer .dzg-row');
      await frames(page, 3);
      return { page, errors };
    };
    const cell = (page, row, col) => page.locator(`.dzg-layer .dzg-row[aria-rowindex="${row + 2}"] .dzg-cell[data-col="${col}"]`);

    if (!only || only === 'heights') {
      const { page, errors } = await open('case=heights&rows=200');
      const hs = await page.evaluate(() => [...document.querySelectorAll('.dzg-layer > .dzg-row')].slice(0, 6).map((r) => [Number(r.getAttribute('aria-rowindex')) - 2, Math.round(r.getBoundingClientRect().height)]).sort((a, b) => a[0] - b[0]));
      const want = (i) => (i % 5 === 0 ? 72 : i % 2 ? 32 : 44);
      check(`${name} heights: each row as the function says`, hs.every(([i, h]) => h === want(i)), JSON.stringify(hs));
      const gap = await page.evaluate(() => { const r = [...document.querySelectorAll('.dzg-layer > .dzg-row')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top); return r.slice(1).every((x, k) => Math.abs(x.getBoundingClientRect().top - r[k].getBoundingClientRect().bottom) < 0.6); });
      check(`${name} heights: rows touch, no gap nor overlap`, gap);
      await page.evaluate(() => { const g = window.grid; g.api.ensureVisible(g.kernel.rows.displayed.keyAt(150)); });
      await frames(page);
      // Row 150's end at the view's end: its top + height = the viewport's bottom (the header above it).
      const seen = await page.evaluate(() => { const r = [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((x) => x.getAttribute('aria-rowindex') === '152'); const v = document.querySelector('.dzg-viewport').getBoundingClientRect(); return r && Math.abs(r.getBoundingClientRect().bottom - v.bottom); });
      check(`${name} heights: ensureVisible lands exactly`, seen !== null && seen < 1.5, String(seen));
      await page.evaluate(() => { const g = window.grid; g.kernel.dispatch({ type: 'rows.expand', rows: [g.kernel.rows.displayed.keyAt(0)], expanded: true }, 'api'); g.api.ensureVisible(g.kernel.rows.displayed.keyAt(0)); });
      await frames(page);
      const panel = await page.evaluate(() => { const d = document.querySelector('.dzg-layer > .dzg-row[data-kind=detail]'); const m = [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((x) => x.getAttribute('aria-rowindex') === '2'); return d && m ? [Math.round(d.getBoundingClientRect().height), Math.round(d.getBoundingClientRect().top - m.getBoundingClientRect().bottom), Math.round(m.getBoundingClientRect().height)] : null; });
      check(`${name} heights: a 120 px panel right under its 72 px master`, JSON.stringify(panel) === '[120,0,72]', JSON.stringify(panel));
      check(`${name} heights: no page error`, errors.length === 0, errors.join('; '));
      await page.close();
      // 100 000 rows: the first paint, a new function, a scroll of 120 frames; and the same at one height.
      const perf = {};
      for (const fixed of [false, true]) {
        const { page: p } = await open(`case=heights&rows=100000${fixed ? '&fixed=1' : ''}`);
        await p.waitForFunction(() => window.made > 0);
        const made = await p.evaluate(() => window.made);
        const again = fixed ? null : await p.evaluate(async () => { const t = performance.now(); window.grid.update({ rowHeight: (r) => (r.n % 3 ? 40 : 60) }); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return performance.now() - t; });
        const ft = await p.evaluate(async () => {
          const vp = document.querySelector('.dzg-viewport');
          const out = [];
          let last = performance.now();
          for (let k = 0; k < 120; k++) {
            vp.scrollTop += 240;
            await new Promise((r) => requestAnimationFrame(r));
            const now = performance.now();
            out.push(now - last);
            last = now;
          }
          return out;
        });
        perf[fixed ? 'fixed' : 'fn'] = { made: Math.round(made), again: again && Math.round(again), median: +median(ft).toFixed(1), p95: +percentile(ft, 95).toFixed(1), worst: +Math.max(...ft).toFixed(1) };
        await p.close();
      }
      console.log(`     ${name} 100 000 rows: ${JSON.stringify(perf)}`);
      check(`${name} heights: 100 000 rows scroll at the pace of one height (p95 within 2 ms of it, or under 20 ms)`, perf.fn.p95 <= Math.max(20, perf.fixed.p95 + 2), JSON.stringify(perf));
    }

    if (!only || only === 'textarea') {
      for (const lang of ['fr', 'ar']) {
        const { page, errors } = await open(`case=textarea&lang=${lang}`);
        await cell(page, 0, 'note').click();
        await page.keyboard.press('F2');
        const ta = page.locator('textarea.dzg-field');
        await ta.waitFor();
        const h0 = await ta.evaluate((t) => t.getBoundingClientRect().height);
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        await page.keyboard.type('Ligne trois');
        await frames(page);
        const box = await ta.evaluate((t) => { const r = t.getBoundingClientRect(); const row = t.closest('.dzg-row').getBoundingClientRect(); const at = document.elementFromPoint(r.left + 10, r.bottom - 6); return { h: r.height, below: r.bottom > row.bottom + 4, top: at === t, lines: t.value.split('\n').length }; });
        check(`${name} ${lang} textarea: Enter adds a line, the box grows over the rows under it`, box.h > h0 && box.below && box.top && box.lines === 3, JSON.stringify({ h0, ...box }));
        await page.keyboard.press('ControlOrMeta+Enter');
        await frames(page);
        // The edits' overlay (no save handler on the page): the cell shows what was kept.
        const kept = await cell(page, 0, 'note').evaluate((c) => c.textContent);
        check(`${name} ${lang} textarea: Ctrl/Cmd+Enter keeps the lines`, kept.split('\n').length === 3 && (await page.locator('textarea.dzg-field').count()) === 0, JSON.stringify(kept));
        // Near the view's end: it grows upward.
        await page.evaluate(() => { const vp = document.querySelector('.dzg-viewport'); vp.scrollTop = 0; });
        const last = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.dzg-layer > .dzg-row')].filter((r) => r.getBoundingClientRect().bottom <= document.querySelector('.dzg-viewport').getBoundingClientRect().bottom).map((r) => Number(r.getAttribute('aria-rowindex')) - 2)));
        await page.evaluate((i) => { const g = window.grid; g.api.focusCell(g.kernel.rows.displayed.keyAt(i), 'note'); }, last);
        await frames(page);
        await page.keyboard.press('F2');
        await page.keyboard.press('End');
        for (let k = 0; k < 4; k++) await page.keyboard.press('Enter');
        await frames(page);
        const up = await page.locator('textarea.dzg-field').evaluate((t) => ({ up: t.hasAttribute('data-up'), inView: t.getBoundingClientRect().bottom <= document.querySelector('.dzg-viewport').getBoundingClientRect().bottom + 1 }));
        check(`${name} ${lang} textarea: near the end it grows upward, whole in the view`, up.up && up.inView, JSON.stringify(up));
        await page.keyboard.press('Escape');
        check(`${name} ${lang} textarea: no page error`, errors.length === 0, errors.join('; '));
        await page.close();
      }
    }

    if (!only || only === 'share') {
      for (const lang of ['fr', 'ar']) {
        const { page, errors } = await open(`case=share&lang=${lang}&rows=6`);
        // Sales 5, 15, 25, 35, 45, 55: total 180; r0 5 / 180 = 2,8 %; Oran (r0, r3) 40 / 180 = 22,2 %.
        const t = await page.evaluate(() => {
          const rows = [...document.querySelectorAll('.dzg-layer > .dzg-row')];
          const of = (r) => r?.querySelector('.dzg-cell[data-col=share]');
          const data = rows.find((r) => window.grid.kernel.rows.displayed.nodeAt(Number(r.getAttribute('aria-rowindex')) - 2)?.key?.endsWith(':r0'));
          const group = rows.find((r) => r.getAttribute('data-kind') === 'group' && /Oran|وهران/.test(r.textContent));
          const foot = rows.find((r) => r.getAttribute('data-kind') === 'footer');
          return { data: of(data)?.textContent, group: of(group)?.textContent, foot: of(foot)?.textContent, iso: !!of(data)?.querySelector('.dzg-num'), dir: of(data) && getComputedStyle(of(data).querySelector('.dzg-num') ?? of(data)).direction };
        });
        const pct = (x) => new Intl.NumberFormat(lang === 'ar' ? 'ar-DZ' : 'fr-FR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(x);
        check(`${name} ${lang} share: a row, its group, the grand total`, t.data === pct(5 / 180) && t.group === pct(40 / 180) && t.foot === pct(1), JSON.stringify(t));
        if (lang === 'ar') check(`${name} ar share: isolated left to right`, t.iso && t.dir === 'ltr', JSON.stringify(t));
        check(`${name} ${lang} share: no page error`, errors.length === 0, errors.join('; '));
        await page.close();
      }
    }

    if (!only || only === 'groups') {
      const { page, errors } = await open('case=groups&rows=9');
      const box = page.locator('.dzg-layer .dzg-row[data-kind=group]').first().locator('.dzg-check .dzg-box');
      await box.click();
      await frames(page);
      const a = await page.evaluate(() => ({ n: window.grid.kernel.selection.keys.size, s: document.querySelector('.dzg-layer .dzg-row[data-kind=group] .dzg-box').getAttribute('aria-checked') }));
      check(`${name} groups: a click ticks the group's 3 rows`, a.n === 3 && a.s === 'true', JSON.stringify(a));
      await page.keyboard.press('Space');
      await frames(page);
      const b = await page.evaluate(() => window.grid.kernel.selection.keys.size);
      check(`${name} groups: Space on the group row unticks them`, b === 0, String(b));
      check(`${name} groups: no page error`, errors.length === 0, errors.join('; '));
      await page.close();
    }

    if (!only || only === 'xlsx') {
      const { page, errors } = await open('case=xlsx&rows=20');
      const bytes = await page.evaluate(async () => { await window.feature.run('displayed', { format: 'xlsx' }); return [...new Uint8Array(await window.file.arrayBuffer())]; });
      const parts = unzip(Buffer.from(bytes));
      const sheet = parts.get('xl/worksheets/sheet1.xml') ?? '';
      check(`${name} xlsx: the title rows merged, the filter on the table, the footer after it`, sheet.includes('<mergeCell ref="A1:E1"/>') && sheet.includes('<mergeCell ref="A2:E2"/>') && sheet.includes('<autoFilter ref="A4:E24"/>') && sheet.includes('<row r="26">') && /ySplit="4"/.test(sheet), sheet.match(/<autoFilter[^>]*>|<pane[^>]*>/g)?.join(' '));
      check(`${name} xlsx: the subtitle from its function`, (parts.get('xl/sharedStrings.xml') ?? '').includes('20 lignes'));
      check(`${name} xlsx: no page error`, errors.length === 0, errors.join('; '));
      await page.close();
    }
  } finally {
    await B.close();
  }
}

for (const e of engines) await run(e);
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
