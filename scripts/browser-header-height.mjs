/**
 * `headerHeight` in Chrome (docs/behaviors/density.md « Header height », 1.9.0): `node scripts/browser-header-height.mjs`.
 * Page `packages/dom/test/browser/header-height.html`, French: a 70 px header over 40 px rows with a pinned top row,
 * then with column groups; a live change; axe. The browser closed in finally. `SHOTS=dir` keeps screenshots.
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
const site = await serve(new URL('../packages/dom/test/browser/header-height.html', import.meta.url).href);
const SHOTS = process.env.SHOTS;
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
const read = (page) => page.evaluate(() => {
  const R = (e) => { const r = e.getBoundingClientRect(); return { t: r.top, b: r.bottom, h: r.height }; };
  return {
    hrows: [...document.querySelectorAll('.dzg-header .dzg-hrow')].map((e) => R(e).h),
    head: R(document.querySelector('.dzg-header')),
    pin: R(document.querySelector('.dzg-pins-top .dzg-row')),
    row: R(document.querySelector('.dzg-layer > .dzg-row')),
    lone: R(document.querySelector('.dzg-hcell[data-col=seed]')),
    cell: R(document.querySelector('.dzg-hcell[data-col=jan]')),
  };
});

let b;
try {
  b = await browser('chrome');
  for (const mode of ['plain', 'groups']) {
    const page = await b.newPage();
    await page.setViewportSize({ width: 1000, height: 600 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(site.url(`header-height.html?mode=${mode}`));
    await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
    await frames(page);
    const a = await read(page);
    const n = mode === 'groups' ? 2 : 1;
    check(`${mode}: every header row 70 px, the header ${70 * n} px`, a.hrows.length === n && a.hrows.every((h) => Math.abs(h - 70) < 0.5) && Math.abs(a.head.h - 70 * n) < 1, a);
    check(`${mode}: the pinned row 40 px right under the header`, Math.abs(a.pin.h - 40) < 0.5 && Math.abs(a.pin.t - a.head.b) < 1, a);
    check(`${mode}: body rows 40 px, under the pinned row`, Math.abs(a.row.h - 40) < 0.5 && a.row.t >= a.pin.b - 1, a);
    if (mode === 'groups') check('groups: the column without a group stretched over both rows', Math.abs(a.lone.h - 140) < 1 && Math.abs(a.lone.t - a.head.t) < 1, a);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/header-height-${mode}.png` });
    await page.evaluate(() => window.grid.update({ headerHeight: 50 }));
    await frames(page);
    const c = await read(page);
    check(`${mode}: live 50 px: the header, the pinned row and the body follow`, c.hrows.every((h) => Math.abs(h - 50) < 0.5) && Math.abs(c.pin.t - c.head.b) < 1 && c.row.t >= c.pin.b - 1, c);
    await page.addScriptTag({ content: AXE });
    const axe = await page.evaluate(async () => (await window.axe.run(document.querySelector('#host'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes.length}`));
    check(`${mode}: axe finds nothing`, axe.length === 0, axe);
    check(`${mode}: no page error, nothing told`, errors.length === 0 && (await page.evaluate(() => window.told.length)) === 0, errors);
    await page.close();
  }
} finally {
  await b?.close().catch(() => {});
  await site.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} / ${results.length}`);
process.exit(failed ? 1 : 0);
