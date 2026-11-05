/**
 * Phase 8 step 7 in real browsers (`node scripts/browser-server-groups.mjs`, `--engine firefox|webkit|all`): the page
 * packages/dom/test/browser/server-groups.html (data set C grouped by fruit then shop on a simulated server, 150 ms).
 * Chrome, fr and ar: the first level drawn as a treegrid with the server's counts and totals; groups opened and closed by
 * the keyboard while their blocks load (a group closed while loading reopens with no new request); a shop opened under a
 * fruit, its rows at level 3; the opening said once loaded; a level whose first block fails shows the error and Retry;
 * axe 0 with loading and failed rows on screen. Every engine: the arrow keys open and close a group, mirrored right to
 * left (forward is ArrowLeft in Arabic). Browsers closed in finally.
 */
import { fileURLToPath } from 'node:url';
import { serve, browser } from '../spikes/kit.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const arg = process.argv.includes('--engine') ? process.argv[process.argv.indexOf('--engine') + 1] : 'chrome';
const engines = arg === 'all' ? ['chrome', 'firefox', 'webkit'] : [arg];
const site = await serve(import.meta.url);
const results = [];
const check = (engine, label, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${engine}: ${label}  ${JSON.stringify(detail).slice(0, 400)}`);
};
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

async function open(b, qs) {
  const page = await b.newPage();
  await page.setViewportSize({ width: 1000, height: 760 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(site.root(`packages/dom/test/browser/server-groups.html?${qs}`));
  await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
  // Every sentence of the live region, as it is written.
  await page.evaluate(() => {
    window.said = [];
    new MutationObserver(() => { const t = document.querySelector('.dzg-live')?.textContent; if (t) window.said.push(t); }).observe(document.querySelector('.dzg-live'), { childList: true, subtree: true, characterData: true });
  });
  await page.waitForFunction(() => document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="2"] .dzg-label'), null, { timeout: 10000 });
  await frames(page, 3);
  return { page, errors };
}
/** The rows mounted, in order: index, level, expanded, kind, the label or the first cell's text. */
const rows = (page) => page.evaluate(() => [...document.querySelectorAll('.dzg-layer > .dzg-row')]
  .map((r) => ({ i: Number(r.getAttribute('aria-rowindex')), level: r.getAttribute('aria-level'), open: r.getAttribute('aria-expanded'), kind: r.getAttribute('data-kind'), busy: r.getAttribute('aria-busy'), text: (r.querySelector('.dzg-label') ?? r.querySelector('[data-col=fruit]'))?.textContent }))
  .sort((a, b) => a.i - b.i));
const focusRow = (page, i) => page.click(`.dzg-layer > .dzg-row[aria-rowindex="${i}"] [data-col=fruit]`, { position: { x: 120, y: 10 } });
/** Requests of a level's first block (the block ahead, its second, is a prefetch). */
const asked = (page, path) => page.evaluate((p) => window.t.log.filter((x) => x.block === 0 && JSON.stringify(x.path) === JSON.stringify(p)).length, path);

for (const engine of engines) {
  let b = null;
  try {
    b = await browser(engine);
    // ---- every engine: the arrow keys mirrored right to left ----
    for (const locale of ['fr-FR', 'ar-DZ']) {
      const { page, errors } = await open(b, `locale=${locale}&latency=20`);
      const rtl = locale.startsWith('ar');
      await focusRow(page, 2);
      await page.keyboard.press(rtl ? 'ArrowLeft' : 'ArrowRight');
      await page.waitForFunction(() => document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="3"][aria-level="2"] .dzg-label'), null, { timeout: 5000 }).catch(() => {});
      const opened = await rows(page);
      await page.keyboard.press(rtl ? 'ArrowRight' : 'ArrowLeft');
      await frames(page, 2);
      const closed = await rows(page);
      check(engine, `${locale}: ${rtl ? 'ArrowLeft' : 'ArrowRight'} opens a group (its shops at level 2), the other arrow closes it`, opened[0].open === 'true' && opened[1].level === '2' && closed[0].open === 'false' && closed[1].level === '1', { opened: opened.slice(0, 3), closed: closed.slice(0, 2) });
      check(engine, `no page error (${locale} keys)`, errors.length === 0, errors);
      await page.close();
    }
    if (engine !== 'chrome') continue;

    for (const [locale, theme] of [['fr-FR', 'light'], ['ar-DZ', 'dark']]) {
      const ar = locale.startsWith('ar');
      // ---- the first level, the treegrid, the server's numbers ----
      const { page, errors } = await open(b, `locale=${locale}&theme=${theme}&latency=150`);
      const first = await rows(page);
      const role = await page.evaluate(() => document.querySelector('.dzg-viewport').getAttribute('role'));
      const total = await page.evaluate(() => document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="2"] [data-col=qty]').textContent);
      check(engine, `${locale}: 7 fruit groups and the grand total, a treegrid, the server's counts and totals`, role === 'treegrid' && first.length === 8 && first.every((r) => r.level === '1') && /1.?428.?500/.test(first[0].text) && /1.?234.?567/.test(total), { role, n: first.length, label: first[0].text, total });

      // ---- open and close while loading: a group closed while its block loads reopens with no new request ----
      await focusRow(page, 2);
      await page.keyboard.press('Enter');
      await frames(page, 1);
      const loading = (await rows(page))[1];
      await page.keyboard.press('Enter');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);
      const before = await asked(page, [ar ? 'تفاح' : 'pomme']);
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Enter');
      await frames(page, 2);
      const again = await rows(page);
      const after = await asked(page, [ar ? 'تفاح' : 'pomme']);
      const live = await page.evaluate(() => window.said.join(' | '));
      check(engine, `${locale}: opened while loading (« ${loading.text} », busy), closed, the next opened; reopened at once with no new request`, loading.kind === 'loading' && loading.busy === 'true' && before === 1 && after === 1 && again[1].level === '2' && again[1].kind === 'group', { loading, before, after, second: again.slice(0, 3) });
      // The first opening was closed before its block came: said closed, never « expanded » without its count; the second's sentence once loaded.
      check(engine, `${locale}: the openings said once loaded, with their count: « ${live} »`, /500/.test(live) && !/Chargement|تحميل/.test(live), live);

      // ---- a shop under a fruit: its rows at level 3 ----
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('.dzg-layer > .dzg-row[aria-level="3"]:not([data-kind])'), null, { timeout: 5000 }).catch(() => {});
      const leaves = (await rows(page)).filter((r) => r.level === '3');
      const shopPath = await page.evaluate(() => window.t.log.at(-1).path);
      check(engine, `${locale}: a shop opened under a fruit: its rows at level 3, asked with the typed path`, leaves.length > 3 && leaves.every((r) => r.kind === null) && shopPath.length === 2, { n: leaves.length, shopPath });

      // ---- axe with groups, rows and a loading row ----
      await page.addScriptTag({ path: `${ROOT}node_modules/axe-core/axe.min.js` });
      const axe = () => page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.length}`));
      const v = await axe();
      check(engine, `${locale} ${theme}: axe 0 violations with groups open`, v.length === 0, v);
      await page.screenshot({ path: `${ROOT}packages/dom/test/browser/results/server-groups-${locale.slice(0, 2)}.png` });
      check(engine, `no page error (${locale})`, errors.length === 0, errors);
      await page.close();

      // ---- a level whose first block fails: the error and Retry under the group; axe 0 ----
      const f = await open(b, `locale=${locale}&theme=${theme}&latency=20&fail=${ar ? 'إجاص' : 'poire'}`);
      await focusRow(f.page, 3);
      await f.page.keyboard.press('Enter');
      await f.page.waitForFunction(() => document.querySelector('.dzg-body .dzg-retry'), null, { timeout: 5000 }).catch(() => {});
      const failed = await f.page.evaluate(() => ({ retry: document.querySelectorAll('.dzg-body .dzg-retry').length, kind: document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="4"]')?.getAttribute('data-kind'), busy: document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="4"]')?.getAttribute('aria-busy') }));
      await f.page.addScriptTag({ path: `${ROOT}node_modules/axe-core/axe.min.js` });
      const v2 = await f.page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.length}`));
      check(engine, `${locale}: a level failing shows its error with one Retry under its group; axe 0`, failed.retry === 1 && failed.kind === 'loading' && failed.busy === null && v2.length === 0, { failed, v2 });
      await f.page.screenshot({ path: `${ROOT}packages/dom/test/browser/results/server-groups-failed-${locale.slice(0, 2)}.png` });
      // Retry by the mouse: the button runs over the empty cells beside, above them (their cells would take the click).
      await f.page.click('.dzg-body .dzg-retry', { timeout: 3000 });
      await f.page.waitForFunction(() => document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="4"][aria-level="2"] .dzg-label'), null, { timeout: 5000 }).catch(() => {});
      const retried = (await rows(f.page))[2];
      check(engine, `${locale}: Retry brings the level's groups`, retried.level === '2' && retried.kind === 'group', retried);
      check(engine, `no page error (${locale} failure)`, f.errors.length === 0, f.errors);
      await f.page.close();
    }
  } finally {
    await b?.close().catch(() => {});
  }
}
await site.close();
const failed = results.filter((x) => !x).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
