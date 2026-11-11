/**
 * 1.10.0 in real browsers: `node scripts/browser-1-10.mjs`. Page `packages/dom/test/browser/v1-10.html`: Chrome in French
 * and Arabic (light, and dark once each), at 760 px and at a narrow 420 px, with axe; then Firefox and WebKit once in
 * French for the wrapped titles (`--no-others` skips them, `--others-only` runs only them). One browser at a time, closed
 * in finally. Checks: the group rows and the column headers' row at their own heights (density.md « Group rows'
 * height »), the filter row at its own (filter-ui.md), the pinned band under the header; titles on several lines, the row
 * as tall as the tallest, nothing cut but by the line cap (header-wrap.md); columns fitted at load, no cell clipped, the
 * flexible one left alone (column-resize.md 16–21); the column under the pointer tinted, not the keyboard's (column-hover.md);
 * 1.11.0: titles cut at a 2-line cap (`?clamp=2`) marked and set at the start (header-wrap.md 11).
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
const site = await serve(new URL('../packages/dom/test/browser/v1-10.html', import.meta.url).href);
const SHOTS = process.env.SHOTS;
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));

/** The header rows' heights, the wrapped labels' lines, the pinned band's top. */
const heads = (page) => page.evaluate(() => {
  const h = (el) => Math.round(el.getBoundingClientRect().height);
  const rows = [...document.querySelectorAll('.dzg-header > .dzg-hrow')];
  const labels = [...document.querySelectorAll('.dzg-hcell[data-hwrap] > .dzg-hlabel')].map((l) => {
    const cell = l.parentElement.getBoundingClientRect();
    const b = l.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(l).lineHeight) || parseFloat(getComputedStyle(l).fontSize) * 1.2;
    return { col: l.parentElement.dataset.col, lines: Math.round(b.height / lh), inside: b.top >= cell.top - 0.5 && b.bottom <= cell.bottom + 0.5, start: document.dir === 'rtl' ? Math.round(cell.right - b.right) : Math.round(b.left - cell.left) };
  });
  const header = document.querySelector('.dzg-header').getBoundingClientRect();
  const pins = document.querySelector('.dzg-pins-top')?.getBoundingClientRect();
  return { rows: rows.map(h), labels, headerBottom: Math.round(header.bottom), pinsTop: pins && Math.round(pins.top) };
});

async function run(name, lang, dark, narrow, full) {
  const b = await browser(name);
  try {
    const page = await b.newPage();
    await page.setViewportSize({ width: 900, height: 640 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(site.url(`v1-10.html?lang=${lang}${dark ? '&dark=1' : ''}${narrow ? '&narrow=1' : ''}`));
    await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
    await frames(page);
    await frames(page);
    const tag = `${name} ${lang}${dark ? ' dark' : ''}${narrow ? ' narrow' : ''}`;

    // Heights: group row 28, the column headers ≥ 48 and grown by the wrapped titles, the filter row 44.
    const x = await heads(page);
    const [group, colRow, filterRow] = x.rows;
    const tallest = Math.max(...x.labels.map((l) => l.lines));
    check(`${tag}: the group row 28 px, the filter row 44 px`, group === 28 && filterRow === 44, x);
    check(`${tag}: the column headers' row at least 48 px, grown when a title takes lines`, colRow >= 48 && (tallest < 2 || colRow > 48), x);
    check(`${tag}: wrapped titles on several lines, at most 3, inside their cells, from the start side`, tallest >= 2 && x.labels.every((l) => l.lines <= 3 && l.inside && l.start >= 0 && l.start < 20), x.labels);
    check(`${tag}: the pinned band right under the header`, x.pinsTop !== undefined && Math.abs(x.pinsTop - x.headerBottom) <= 1, x);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/v1-10-${tag.replace(/ /g, '-')}.png` });
    if (!full) return check(`${tag}: no page error`, errors.length === 0, errors);

    // Narrower column: the title takes more lines, the row grows (measured again on a resize).
    const before = x.rows[1];
    await page.evaluate(() => window.grid.kernel.dispatch({ type: 'column.resize', column: 'temp', width: 70, finished: true }, 'user'));
    await frames(page);
    await frames(page);
    const y = await heads(page);
    check(`${tag}: a narrower column, its title on more lines, the row as tall as it`, y.rows[1] >= before && y.labels.every((l) => l.inside), { before, after: y });
    await page.evaluate(() => window.grid.kernel.dispatch({ type: 'column.resize', column: 'temp', width: 120, finished: true }, 'user'));
    await frames(page);

    // Fit at load: no mounted cell clipped in the fitted columns; the flexible name column left alone; source api.
    const fit = await page.evaluate(() => {
      const clipped = [...document.querySelectorAll('.dzg-layer .dzg-cell')].filter((c) => !['name', 'temp', 'note'].includes(c.dataset.col) && c.scrollWidth > c.clientWidth + 1).map((c) => c.dataset.col);
      const state = window.grid.kernel.columns.state();
      return { clipped: [...new Set(clipped)], name: state.find((c) => c.id === 'name')?.width ?? null, origin: state.find((c) => c.id === 'origin')?.width ?? null };
    });
    check(`${tag}: columns fitted at load, no cell clipped, the flexible one left alone`, fit.clipped.length === 0 && fit.name === null && typeof fit.origin === 'number', fit);

    // The column under the pointer: tinted (a layer over the row), the root says it; another column follows.
    const box = await page.evaluate(() => { const r = document.querySelector('.dzg-layer .dzg-cell[data-col=origin]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.move(box.x, box.y);
    await frames(page);
    const hov = await page.evaluate(() => {
      const root = document.querySelector('.dzg');
      const cells = [...document.querySelectorAll('.dzg-cell[data-col=origin], .dzg-hcell[data-col=origin]:not(.dzg-hgroup)')];
      const other = document.querySelector('.dzg-layer .dzg-cell[data-col=minutes]');
      return { col: root.getAttribute('data-hover-col'), all: cells.every((c) => c.hasAttribute('data-col-hover')), image: getComputedStyle(cells[1]).backgroundImage, other: getComputedStyle(other).backgroundImage };
    });
    check(`${tag}: the column under the pointer tinted, the others not`, hov.col === 'origin' && hov.all && /gradient/.test(hov.image) && hov.other === 'none', hov);
    // The keyboard: focus moved to another column, the tint stays with the pointer.
    await page.keyboard.press('ArrowDown');
    await frames(page);
    check(`${tag}: the keyboard does not move it`, (await page.evaluate(() => document.querySelector('.dzg').getAttribute('data-hover-col'))) === 'origin');
    await page.mouse.move(2, 630);
    await frames(page);
    check(`${tag}: leaving the grid clears it`, (await page.evaluate(() => document.querySelector('.dzg').getAttribute('data-hover-col'))) === null);
    // Hovered again for axe (the tint's contrast with the text).
    await page.mouse.move(box.x, box.y);
    await frames(page);

    await page.addScriptTag({ content: AXE });
    const v = await page.evaluate(async () => (await window.axe.run(document.querySelector('#host'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((x) => `${x.id}: ${x.nodes.length}`));
    check(`${tag}: axe finds nothing`, v.length === 0, v);
    check(`${tag}: no page error, nothing told`, errors.length === 0 && (await page.evaluate(() => window.told.length)) === 0, { errors, told: await page.evaluate(() => window.told) });
    await page.close();
  } finally {
    await b.close().catch(() => {});
  }
}

/**
 * 1.11.0 (header-wrap.md 11): titles cut at a 2-line cap say `data-hclamp` and sit at the start, even in the number
 * columns (Chrome drew an end-aligned clamped line's « … » past the edge); the others keep their alignment.
 */
async function clampRun(name, lang) {
  const b = await browser(name);
  try {
    const page = await b.newPage();
    await page.setViewportSize({ width: 900, height: 640 });
    await page.goto(site.url(`v1-10.html?lang=${lang}&clamp=2`));
    await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
    await frames(page);
    await frames(page);
    const tag = `${name} ${lang} clamp 2`;
    const x = await page.evaluate(() => [...document.querySelectorAll('.dzg-hcell[data-hwrap] > .dzg-hlabel')].map((l) => ({
      col: l.parentElement.dataset.col, cut: l.scrollHeight > l.clientHeight + 1, mark: l.parentElement.hasAttribute('data-hclamp'), align: getComputedStyle(l).textAlign,
    })));
    check(`${tag}: a cut title marked and at the start, the others not`, x.some((l) => l.cut) && x.every((l) => l.cut === l.mark && (!l.cut || l.align === 'start')), x);
    if (SHOTS) await page.locator('.dzg-header').screenshot({ path: `${SHOTS}/v1-10-${tag.replace(/ /g, '-')}.png` });
    await page.close();
  } finally {
    await b.close().catch(() => {});
  }
}

try {
  if (!process.argv.includes('--others-only')) for (const lang of ['fr', 'ar']) await clampRun('chrome', lang);
  if (!process.argv.includes('--no-others')) for (const name of ['firefox', 'webkit']) await clampRun(name, 'fr');
  if (!process.argv.includes('--others-only'))
    for (const [lang, dark, narrow] of [['fr', false, false], ['ar', false, false], ['fr', false, true], ['ar', false, true], ['fr', true, false], ['ar', true, false]]) await run('chrome', lang, dark, narrow, true);
  if (!process.argv.includes('--no-others')) for (const name of ['firefox', 'webkit']) await run(name, 'fr', false, false, false);
} finally {
  await site.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
