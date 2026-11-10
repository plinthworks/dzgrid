/**
 * The grid's height comes from its container, never its rows (owner 2026-11-10, docs/behaviors/virtual-scroll.md;
 * web-component.md 13): `node scripts/browser-host-fill.mjs [chrome|firefox|webkit]`. The page
 * `packages/element/test/browser/host-fill.html`: a fixed-height container, a flex column with a height, a share of
 * a flex column; 3 and 10 000 rows; createGrid on the container, Angular's host (`display: contents`) and the Web
 * Component placed directly in it. Each grid fills its container (border included), scrolls inside with 10 000
 * rows, draws a few rows only, and tells no `unbounded-viewport`. One browser, closed in finally.
 */
import { serve, browser } from '../spikes/kit.mjs';

const name = process.argv[2] ?? 'chrome';
const results = [];
const check = (label, ok, detail) => {
  results.push(!!ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${label}${ok ? '' : `  ${JSON.stringify(detail ?? null).slice(0, 600)}`}`);
};
const site = await serve(new URL('../packages/element/test/browser/host-fill.html', import.meta.url).href);
const b = await browser(name);
try {
  const page = await b.newPage();
  await page.setViewportSize({ width: 1000, height: 800 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(site.url('host-fill.html'));
  await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
  await page.evaluate(() => new Promise((r) => { let k = 0; const f = () => (++k >= 5 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
  const seen = await page.evaluate(() => window.cases.map((id) => {
    const c = document.getElementById(id);
    const root = c.querySelector('.dzg');
    const vp = root.querySelector('.dzg-viewport');
    return { id, container: Math.round(c.getBoundingClientRect().height), grid: Math.round(root.getBoundingClientRect().height), scrolls: vp.scrollHeight > vp.clientHeight + 1, rows: root.querySelectorAll('.dzg-layer > .dzg-row').length, unbounded: window.told[id].filter((p) => p.code === 'unbounded-viewport').length };
  }));
  for (const s of seen) {
    const many = s.id.includes('-10000-');
    check(`${s.id}: the grid ${s.grid} px fills its container ${s.container} px${many ? ', scrolls inside, few rows drawn' : ''}, nothing told`,
      s.grid === s.container && s.unbounded === 0 && (!many || (s.scrolls && s.rows < 40)), s);
  }
  const own = await page.evaluate(() => ({ display: getComputedStyle(window.own).display, grid: Math.round(window.own.querySelector('.dzg').getBoundingClientRect().height) }));
  check('a page that styles the element\'s display keeps its own (block, 200 px)', own.display === 'block' && own.grid === 200, own);
  check('no page error', errors.length === 0, errors);
} finally {
  await b.close();
  await site.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} / ${results.length}`);
process.exit(failed ? 1 : 0);
