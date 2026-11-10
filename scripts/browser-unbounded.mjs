/**
 * A host without the documented layout in real Chrome (Phase 11 L9, docs/behaviors/virtual-scroll.md « A host without
 * the layout »): `node scripts/browser-unbounded.mjs`. The page `packages/dom/test/browser/unbounded.html` gives the host
 * no height (sized by its content; since 1.10.1 a host with a height is filled); 100 000 rows. Checked: a few rows drawn (not all), the viewport held to the window and
 * scrolling, `unbounded-viewport` told once, a sort and a jump to the end each answered within a second. One browser,
 * closed in finally.
 */
import { serve, browser } from '../spikes/kit.mjs';

const results = [];
const check = (label, ok, detail) => {
  results.push(!!ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} chrome: ${label}  ${JSON.stringify(detail ?? null).slice(0, 600)}`);
};
const site = await serve(new URL('../packages/dom/test/browser/unbounded.html', import.meta.url).href);
const b = await browser('chrome');
try {
  const page = await b.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(site.url('unbounded.html'));
  await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
  const frames = (n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  await frames(5);
  const seen = await page.evaluate(() => {
    const vp = document.querySelector('.dzg-viewport');
    return { rows: document.querySelectorAll('.dzg-layer > .dzg-row').length, vp: Math.round(vp.getBoundingClientRect().height), scrolls: vp.scrollHeight > vp.clientHeight, max: vp.style.maxBlockSize, told: window.told.filter((p) => p.code === 'unbounded-viewport') };
  });
  check('a few rows drawn, not 100 000', seen.rows > 0 && seen.rows < 60, seen);
  check('the viewport held to the window (720 px) and scrolling on its own', seen.vp <= 720 && seen.scrolls && seen.max === '720px', seen);
  check('unbounded-viewport told once, path host, no detail', seen.told.length === 1 && seen.told[0].path === 'host' && seen.told[0].detail === undefined, seen.told);
  const sort = await page.evaluate(() => new Promise((r) => {
    const t = performance.now();
    window.grid.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', direction: 'desc' }] }, 'api');
    requestAnimationFrame(() => requestAnimationFrame(() => r({ ms: Math.round(performance.now() - t), rows: document.querySelectorAll('.dzg-layer > .dzg-row').length })));
  }));
  check(`a sort of 100 000 rows answered in ${sort.ms} ms (1.7.0: 37 s)`, sort.ms < 1000 && sort.rows < 60, sort);
  const end = await page.evaluate(() => new Promise((r) => {
    const t = performance.now();
    window.grid.api.ensureVisible(window.grid.kernel.rows.displayed.keyAt(99_999));
    requestAnimationFrame(() => requestAnimationFrame(() => r({ ms: Math.round(performance.now() - t), last: [...document.querySelectorAll('.dzg-layer > .dzg-row')].some((e) => e.getAttribute('aria-rowindex') === '100001') })));
  }));
  check(`the last row reached in ${end.ms} ms`, end.ms < 1000 && end.last, end);
  const heap = await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6));
  console.log(`     heap ${heap} MB`);
  check('no page error', errors.length === 0, errors);
} finally {
  await b.close();
  await site.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} / ${results.length}`);
process.exit(failed ? 1 : 0);
