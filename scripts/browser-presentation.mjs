/**
 * Presentation settings in real browsers (docs/behaviors/presentation-settings.md, 1.9.0): `node scripts/browser-presentation.mjs`.
 * Page `packages/dom/test/browser/presentation.html`: Chrome in French and Arabic, light and dark, with axe; then Firefox
 * and WebKit once in French (`--no-others` skips them, `--others-only` runs only them). One browser at a time, closed in finally. `SHOTS=dir` keeps
 * screenshots. Checks: alternate rows right while scrolling and after a sort; a number column's title over its cells;
 * column lines; the pinned shadow only while content is under, mirrored in Arabic; the custom sort icon drawn as a mask;
 * tabular digits.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { serve, browser } from '../spikes/kit.mjs';

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const results = [];
const check = (label, ok, detail) => {
  results.push(!!ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}  ${ok ? '' : JSON.stringify(detail ?? null).slice(0, 700)}`);
};
const site = await serve(new URL('../packages/dom/test/browser/presentation.html', import.meta.url).href);
const SHOTS = process.env.SHOTS;
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));

/** Every mounted body row's place parity against its painted background (odd rows tinted, the others the surface). */
const zebra = (page) => page.evaluate(() => {
  const rows = [...document.querySelectorAll('.dzg-layer > .dzg-row')];
  const bg = (r) => getComputedStyle(r).backgroundColor;
  const odd = rows.filter((r) => (Number(r.getAttribute('aria-rowindex')) - 2) % 2 === 1);
  const even = rows.filter((r) => (Number(r.getAttribute('aria-rowindex')) - 2) % 2 === 0 && !r.matches(':hover, :focus-within'));
  const oddBg = new Set(odd.map(bg));
  const evenBg = new Set(even.map(bg));
  return { n: rows.length, oddBg: [...oddBg], evenBg: [...evenBg], marks: rows.every((r) => r.hasAttribute('data-odd') === odd.includes(r)) };
});

const shadow = (page) => page.evaluate(() => {
  const segs = (s) => document.querySelector(`.dzg-layer > .dzg-row .dzg-seg-${s}`);
  const after = (el) => getComputedStyle(el, '::after');
  return { start: after(segs('start')).boxShadow, end: after(segs('end')).boxShadow, startScale: after(segs('start')).scale, endScale: after(segs('end')).scale };
});

async function run(name, lang, dark, axe) {
  const b = await browser(name);
  try {
    const page = await b.newPage();
    await page.setViewportSize({ width: 900, height: 600 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(site.url(`presentation.html?lang=${lang}${dark ? '&dark=1' : ''}`));
    await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
    await frames(page);
    const tag = `${name} ${lang}${dark ? ' dark' : ''}`;
    const rtl = lang === 'ar';

    // Alternate rows (1, 2): the marks follow the place, two backgrounds, the odd one tinted.
    let z = await zebra(page);
    check(`${tag}: alternate rows marked by place, one tint each`, z.n > 5 && z.marks && z.oddBg.length === 1 && z.evenBg.length === 1 && z.oddBg[0] !== z.evenBg[0], z);
    for (const top of [32 * 37, 32 * 120 + 11]) {
      await page.evaluate((t) => { document.querySelector('.dzg-viewport').scrollTop = t; }, top);
      await frames(page);
      z = await zebra(page);
      check(`${tag}: still right scrolled to ${top}`, z.marks && z.oddBg.length === 1 && z.evenBg.length === 1 && z.oddBg[0] !== z.evenBg[0], z);
    }
    await page.evaluate(() => window.grid.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'feb', dir: 'desc' }] }, 'host'));
    await frames(page);
    z = await zebra(page);
    check(`${tag}: still right after a sort`, z.marks && z.oddBg.length === 1 && z.evenBg.length === 1 && z.oddBg[0] !== z.evenBg[0], z);
    await page.evaluate(() => { document.querySelector('.dzg-viewport').scrollTop = 0; window.grid.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'jan', dir: 'asc' }] }, 'host'); });
    await frames(page);

    // A number column's title over its cells (3): the text's end edge where the cells' is.
    const align = await page.evaluate((r) => {
      const text = (el) => { const range = document.createRange(); range.selectNodeContents(el); const b = range.getBoundingClientRect(); return r ? b.left : b.right; };
      const label = document.querySelector('.dzg-hcell[data-col=grams] .dzg-hlabel');
      const cells = [...document.querySelectorAll('.dzg-layer .dzg-cell[data-col=grams]')].slice(0, 5);
      const ends = cells.map(text);
      return { label: text(label), cells: ends, name: text(document.querySelector('.dzg-hcell[data-col=note] .dzg-hlabel')), nameCell: (() => { const range = document.createRange(); range.selectNodeContents(document.querySelector('.dzg-layer .dzg-cell[data-col=note]')); const b = range.getBoundingClientRect(); return r ? b.right : b.left; })(), nameStart: (() => { const range = document.createRange(); range.selectNodeContents(document.querySelector('.dzg-hcell[data-col=note] .dzg-hlabel')); const b = range.getBoundingClientRect(); return r ? b.right : b.left; })() };
    }, rtl);
    check(`${tag}: the number column's title ends where its numbers end`, align.cells.every((c) => Math.abs(c - align.label) <= 2), align);
    check(`${tag}: a text column's title still starts where its text starts`, Math.abs(align.nameStart - align.nameCell) <= 2, align);

    // Tabular digits (5), column lines (9).
    const look = await page.evaluate(() => {
      const cell = document.querySelector('.dzg-layer .dzg-cell[data-col=jan]');
      const seg = document.querySelector('.dzg-layer > .dzg-row .dzg-seg-start');
      const cs = (el) => getComputedStyle(el);
      return { digits: cs(cell).fontVariantNumeric, line: cs(cell).borderInlineEndWidth + ' ' + cs(cell).borderInlineEndStyle, lastPinned: cs(seg.lastElementChild).borderInlineEndStyle };
    });
    check(`${tag}: number cells in tabular digits`, look.digits === 'tabular-nums', look);
    check(`${tag}: a line between columns, none after a pinned part's last cell`, look.line === '1px solid' && look.lastPinned === 'none', look);

    // The pinned shadow (6, 7): none at rest on the start side, the end side shadowed; after a scroll both; at the end only the start.
    const s0 = await shadow(page);
    check(`${tag}: at rest, the end part shadowed, the start part not`, s0.start === 'none' && s0.end !== 'none', s0);
    check(`${tag}: mirrored where it must be (${rtl ? 'start' : 'end'} side)`, rtl ? s0.startScale === '-1 1' && s0.endScale === 'none' : s0.endScale === '-1 1' && s0.startScale === 'none', s0);
    await page.evaluate((r) => { document.querySelector('.dzg-viewport').scrollLeft = r ? -120 : 120; }, rtl);
    await frames(page);
    const s1 = await shadow(page);
    check(`${tag}: scrolled sideways, both parts shadowed`, s1.start !== 'none' && s1.end !== 'none', s1);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/presentation-${name}-${lang}${dark ? '-dark' : ''}.png` });
    await page.evaluate((r) => { const v = document.querySelector('.dzg-viewport'); v.scrollLeft = r ? -v.scrollWidth : v.scrollWidth; }, rtl);
    await frames(page);
    const s2 = await shadow(page);
    check(`${tag}: at the far end, only the start part shadowed`, s2.start !== 'none' && s2.end === 'none', s2);
    await page.evaluate(() => { document.querySelector('.dzg-viewport').scrollLeft = 0; });
    await frames(page);

    // The custom sort icon (17): a mask over currentColor, the default arrow gone.
    const icon = await page.evaluate(() => {
      const mark = document.querySelector('.dzg-hcell[data-col=jan] .dzg-sort');
      const cs = getComputedStyle(mark, '::before');
      const r = (() => { const x = mark.getBoundingClientRect(); return { w: x.width, h: x.height }; })();
      return { content: cs.content, mask: cs.maskImage || cs.webkitMaskImage, bg: cs.backgroundColor, color: getComputedStyle(mark).color, box: r };
    });
    check(`${tag}: the app's sort icon drawn in the mark's colour`, icon.content === '""' && /data:image\/svg\+xml/.test(icon.mask) && icon.bg === icon.color && icon.box.w > 4, icon);

    if (axe) {
      await page.addScriptTag({ content: AXE });
      const v = await page.evaluate(async () => (await window.axe.run(document.querySelector('#host'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((x) => `${x.id}: ${x.nodes.length}`));
      check(`${tag}: axe finds nothing`, v.length === 0, v);
    }
    check(`${tag}: no page error, nothing told`, errors.length === 0 && (await page.evaluate(() => window.told.length)) === 0, { errors, told: await page.evaluate(() => window.told) });
    await page.close();
  } finally {
    await b.close().catch(() => {});
  }
}

try {
  if (!process.argv.includes('--others-only')) for (const [lang, dark] of [['fr', false], ['ar', false], ['fr', true], ['ar', true]]) await run('chrome', lang, dark, true);
  if (!process.argv.includes('--no-others')) for (const name of ['firefox', 'webkit']) await run(name, 'fr', false, false);
} finally {
  await site.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} / ${results.length}`);
process.exit(failed ? 1 : 0);
