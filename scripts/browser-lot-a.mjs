/**
 * 1.9.0 lot A in real browsers (docs/behaviors/vertical-headers.md, hidden-headers.md, totals-row.md):
 * `node scripts/browser-lot-a.mjs`. Page `packages/dom/test/browser/lot-a.html`. Chrome in French and Arabic for all
 * three, plus axe on the hidden headers; Firefox and WebKit once for the vertical titles. Every browser closed in finally.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { serve, browser } from '../spikes/kit.mjs';

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const results = [];
const check = (b, label, ok, detail) => {
  results.push(!!ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${b}: ${label}  ${ok ? '' : JSON.stringify(detail ?? null).slice(0, 700)}`);
};
const site = await serve(new URL('../packages/dom/test/browser/lot-a.html', import.meta.url).href);
const SHOTS = process.env.SHOTS;
const open = async (b, lang, mode) => {
  const page = await b.newPage();
  await page.setViewportSize({ width: 1000, height: 600 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(site.url(`lot-a.html?lang=${lang}&mode=${mode}`));
  await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
  return { page, errors };
};
const rect = (sel) => (el) => { const e = el.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };

async function vertical(name, b, lang) {
  const { page, errors } = await open(b, lang, 'vertical');
  const g = await page.evaluate(() => {
    const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
    const row = document.querySelector('.dzg-header .dzg-hrow');
    const jan = document.querySelector('.dzg-hcell[data-col=jan]');
    const label = jan.querySelector('.dzg-hlabel');
    const seed = document.querySelector('.dzg-hcell[data-col=seed]');
    const first = document.querySelector('.dzg-layer > .dzg-row');
    const body = document.querySelector('.dzg-layer [data-col=jan]');
    return {
      row: R(row), jan: R(jan), label: R(label), seed: R(seed), first: R(first), body: body && R(body),
      mode: getComputedStyle(label).writingMode, transform: getComputedStyle(label).transform,
      name: jan.getAttribute('aria-label') ?? label.textContent, role: jan.getAttribute('role'), full: label.scrollHeight <= label.clientHeight + 1,
      // A Range over the label's text: its first and last characters' places, to see the reading direction.
      dir: (() => { const t = label.firstChild; const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 1); const a = r.getBoundingClientRect(); r.setStart(t, t.length - 1); r.setEnd(t, t.length); const z = r.getBoundingClientRect(); return { first: a.top, last: z.top }; })(),
    };
  });
  const tag = `${lang} vertical`;
  check(name, `${tag}: the title turned (vertical-rl, half a turn)`, g.mode === 'vertical-rl' && /matrix\(-1, .*-1/.test(g.transform), g);
  check(name, `${tag}: Latin reads upwards, Arabic starts at the top`, lang === 'ar' ? g.dir.first < g.dir.last : g.dir.first > g.dir.last, g.dir);
  check(name, `${tag}: the header row as tall as the longest title (taller than a row), the title whole`, g.row.h > g.first.h + 40 && g.full && g.label.h < g.row.h, g);
  check(name, `${tag}: the title at the header's foot, centred in its column`, Math.abs(g.label.b - g.jan.b) < 12 && Math.abs((g.label.l + g.label.r) / 2 - (g.jan.l + g.jan.r) / 2) < 3, g);
  check(name, `${tag}: the columns aligned with the body, the body under the header`, g.body && Math.abs(g.body.l - g.jan.l) < 1 && g.first.t >= g.row.b - 1, g);
  check(name, `${tag}: role and name unchanged`, g.role === 'columnheader' && /Janvier|يناير/.test(g.name), g);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/vertical-${name}-${lang}.png` });
  check(name, `${tag}: no page error`, errors.length === 0, errors);
  await page.close();
}

async function hidden(lang, b) {
  const { page, errors } = await open(b, lang, 'hidden');
  const g = await page.evaluate(() => {
    const vp = document.querySelector('.dzg-viewport');
    const head = document.querySelector('.dzg-header');
    const row = document.querySelector('.dzg-layer > .dzg-row');
    const hcell = document.querySelector('.dzg-hcell[data-col=seed]');
    const hit = document.elementFromPoint(row.getBoundingClientRect().left + 20, vp.getBoundingClientRect().top + 5);
    return { vpTop: vp.getBoundingClientRect().top, rowTop: row.getBoundingClientRect().top, head: head.getBoundingClientRect().height, rows: document.querySelectorAll('.dzg-layer > .dzg-row').length, cellW: hcell.getBoundingClientRect().width, hitRow: !!hit?.closest('.dzg-layer'), headers: document.querySelectorAll('[role=columnheader]').length };
  });
  const tag = `${lang} hidden`;
  check('chrome', `${tag}: no header on screen, the first row at the top, the click there a row's`, g.head === 0 && Math.abs(g.rowTop - g.vpTop) < 2 && g.hitRow, g);
  check('chrome', `${tag}: the column headers still in the page (screen readers)`, g.headers === 5, g);
  // The view's whole height: 420 px less 2 px of border, rows of the comfortable density.
  const view = await page.evaluate(() => { const vp = document.querySelector('.dzg-viewport'); const rows = [...document.querySelectorAll('.dzg-layer > .dzg-row')].map((r) => r.getBoundingClientRect()); const last = Math.max(...rows.map((r) => r.bottom)); return { last, bottom: vp.getBoundingClientRect().bottom }; });
  check('chrome', `${tag}: rows drawn down to the view's foot`, view.last >= view.bottom - 1, view);
  // The keyboard: into the grid, ArrowUp from the first row shows the header while focused, ArrowDown hides it.
  await page.focus('.dzg-viewport');
  await page.keyboard.press('Tab');
  await page.evaluate(() => document.querySelector('.dzg-layer > .dzg-row .dzg-cell').focus());
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(100);
  const up = await page.evaluate(() => ({ active: document.activeElement?.getAttribute('role'), head: document.querySelector('.dzg-header').getBoundingClientRect().height, visible: getComputedStyle(document.querySelector('.dzg-header .dzg-hrow')).clipPath }));
  check('chrome', `${tag}: ArrowUp from the first row: the header focused and shown`, up.active === 'columnheader' && up.head > 20 && up.visible === 'none', up);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/hidden-focused-${lang}.png` });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  const sorted = await page.evaluate(() => window.grid.kernel.query.sort);
  check('chrome', `${tag}: Enter on it sorts`, sorted.length === 1 && sorted[0].column === 'seed', sorted);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(100);
  const down = await page.evaluate(() => ({ active: document.activeElement?.getAttribute('role'), head: document.querySelector('.dzg-header').getBoundingClientRect().height }));
  check('chrome', `${tag}: ArrowDown: back in the rows, the header hidden again`, down.active !== 'columnheader' && down.head === 0, down);
  await page.addScriptTag({ content: AXE });
  const axe = await page.evaluate(async () => (await window.axe.run(document.querySelector('#host'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes.length}`));
  check('chrome', `${tag}: axe finds nothing`, axe.length === 0, axe);
  check('chrome', `${tag}: no page error`, errors.length === 0, errors);
  await page.close();
}

async function totals(lang, b) {
  const { page, errors } = await open(b, lang, 'totals');
  const read = () => page.evaluate(() => {
    const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
    const vp = document.querySelector('.dzg-viewport');
    const row = [...document.querySelectorAll('.dzg-pins-bottom .dzg-row')].at(-1);
    return {
      texts: [...row.querySelectorAll('.dzg-cell')].map((c) => c.textContent),
      row: R(row), vp: R(vp), grams: R(row.querySelector('[data-col=grams]')), hgrams: R(document.querySelector('.dzg-hcell[data-col=grams]')),
      weight: getComputedStyle(row).fontWeight, kind: row.getAttribute('data-kind'),
    };
  });
  const tag = `${lang} totals`;
  const a = await read();
  // By hand, 200 rows: Σ(i mod 9) over 0…199 = 22 × 36 + (0 + 1) = 793, plus 200 × 0.5 = 893; jan: the max of i mod 4,
  // 3; feb: a count, 200; mar: (7i) mod 6 = i mod 6, Σ = 33 × 15 + (0 + 1) = 496, the mean 2.48.
  const fr = ['Total', '893', '3', '200', '2,48'];
  const arab = ['المجموع', '893', '3', '200', '2,48'];
  check('chrome', `${tag}: the row's texts by hand`, JSON.stringify(a.texts.map((t) => t.replace(/[  ٬]/g, ''))) === JSON.stringify(lang === 'ar' ? arab : fr), a.texts);
  check('chrome', `${tag}: at the view's foot, aligned with its header, in the header's weight`, Math.abs(a.row.b - a.vp.b) < 20 && Math.abs(a.grams.l - a.hgrams.l) < 1 && a.weight === '600' && a.kind === 'footer', a);
  await page.evaluate(() => { document.querySelector('.dzg-viewport').scrollTop = 3000; });
  await page.waitForTimeout(150);
  const s = await read();
  check('chrome', `${tag}: still there after a scroll`, Math.abs(s.row.b - a.row.b) < 1, { a: a.row, s: s.row });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/totals-${lang}.png` });
  check('chrome', `${tag}: no page error`, errors.length === 0, errors);
  await page.close();
}

const open3 = [];
try {
  const c = await browser('chrome');
  open3.push(c);
  for (const lang of ['fr', 'ar']) {
    await vertical('chrome', c, lang);
    await hidden(lang, c);
    await totals(lang, c);
  }
  for (const name of ['firefox', 'webkit']) {
    const b = await browser(name);
    open3.push(b);
    await vertical(name, b, 'fr');
  }
} finally {
  for (const b of open3) await b.close().catch(() => {});
  await site.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} / ${results.length}`);
process.exit(failed ? 1 : 0);
