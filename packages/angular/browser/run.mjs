/**
 * The Angular fixture in real Chrome (step 22): `node packages/angular/browser/run.mjs`, after
 * `npm run build`. Builds the page (build.mjs), then checks, in French and in Arabic right to
 * left: the Angular parts draw (cell component and template, header with its filter box, floating
 * cell, footer, overlay), emit reaches the application, axe finds nothing, 1 000 scrolls leave
 * mounts = destroys + live, destroying the grid leaves nothing; and measures the rebind (`?bench=1`).
 * One headless Chrome, closed in finally. Exits 1 on a failed check.
 */
import { fileURLToPath } from 'node:url';
import { serve, browser } from '../../../spikes/kit.mjs';
import { buildFixture } from './build.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
/** `--only tree`: the tree and detail pages alone (Phase 4 step 11). */
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const checks = [];
const check = (label, ok, detail) => {
  checks.push({ label, ok: !!ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `  ${JSON.stringify(detail).slice(0, 600)}`}`);
};

const built = await buildFixture();
console.log(`fixture: ${built.bytes} B, ${built.gzip} B gz (not a budget: tzslot and Angular inside, no CLI optimiser)`);
const site = await serve(import.meta.url);
const b = await browser('chrome');
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

async function open(qs) {
  const page = await b.newPage();
  await page.setViewportSize({ width: 1100, height: 800 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(site.root(`packages/angular/browser/build/index.html?${qs}`));
  await page.waitForFunction(() => window.fxReady || window.fxError, null, { timeout: 30000 });
  const boot = await page.evaluate(() => window.fxError);
  if (boot) throw new Error(boot);
  await frames(page, 3);
  return { page, errors };
}

async function axe(page) {
  await page.addScriptTag({ path: `${ROOT}node_modules/axe-core/axe.min.js` });
  return page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((v) => `${v.id}: ${v.nodes.length} (${v.nodes[0]?.target?.join(' ')})`));
}

try {
  for (const lang of only === 'tree' ? [] : ['fr', 'ar']) {
    const { page, errors } = await open(lang === 'ar' ? 'lang=ar' : '');
    const seen = await page.evaluate(() => ({
      dir: document.querySelector('.dzg')?.getAttribute('dir'),
      status: document.querySelectorAll('.dzg-layer fx-status').length,
      flags: document.querySelectorAll('.dzg-layer .fx-flag').length,
      head: document.querySelectorAll('.dzg-hcell fx-head').length,
      headBox: document.querySelectorAll('.dzg-hcell .fx-hf').length,
      floating: document.querySelectorAll('.dzg-hextra fx-float').length,
      footer: document.querySelector('.fx-ft')?.textContent ?? null,
      host: getComputedStyle(document.querySelector('dz-grid')).display,
    }));
    check(`${lang}: direction ${lang === 'ar' ? 'rtl' : 'ltr'}`, seen.dir === (lang === 'ar' ? 'rtl' : 'ltr'), seen);
    check(`${lang}: Angular parts drawn (cell component, template, header box, floating, footer)`, seen.status > 10 && seen.flags === seen.status && seen.head === 1 && seen.headBox === 1 && seen.floating >= 1 && /1–5000 \/ 100000/.test(seen.footer ?? ''), seen);
    check(`${lang}: <dz-grid> takes no box`, seen.host === 'contents', seen);
    const click = await page.evaluate(() => window.fx.clickStatus());
    check(`${lang}: a cell component's emit reaches (cellAction)`, click.ok && click.sent === click.label, click);
    const v = await axe(page);
    check(`${lang}: axe, no violation`, v.length === 0, v);
    // The header's own box filters the column (debounced).
    await page.fill('.dzg-hcell .fx-hf', lang === 'ar' ? 'مريض 1234' : 'Patient 1234');
    await page.waitForTimeout(400);
    await frames(page, 2);
    const footer = await page.evaluate(() => document.querySelector('.fx-ft')?.textContent);
    check(`${lang}: the header part's box filters (footer counts 11)`, /\/ 11$/.test(footer ?? ''), footer);
    await page.fill('.dzg-hcell .fx-hf', '');
    await page.waitForTimeout(400);
    const overlay = await page.evaluate(() => window.fx.toggleRows());
    check(`${lang}: overlay part on an empty grid`, /\(empty\)/.test(overlay.overlay ?? ''), overlay);
    await page.evaluate(() => window.fx.toggleRows());
    await frames(page, 2);
    // Pooled rows keep their parts while detached (parts.md): alive = made − gone counts them; the
    // pool reaches its size, then scrolling only rebinds (500 more scrolls make no new part).
    const s1 = await page.evaluate(() => window.fx.scroll(1000));
    const s2 = await page.evaluate(() => window.fx.scroll(500));
    console.log(`     ${lang}: after 1 000 scrolls ${s1.made} made, ${s1.gone} destroyed, ${s1.made - s1.gone} alive (${s1.live} in the page); after 500 more ${s2.made - s2.gone} alive`);
    check(`${lang}: 1 000 scrolls then 500: the pool stops growing, no part is lost`, s2.made - s2.gone <= s1.made - s1.gone && s1.live > 0 && s1.made - s1.gone >= s1.live, { s1, s2 });
    const gone = await page.evaluate(() => window.fx.destroyGrid());
    check(`${lang}: grid destroyed, mounts = destroys, nothing left`, gone.made === gone.gone && gone.live === 0 && gone.grids === 0, gone);
    check(`${lang}: no error in the page`, errors.length === 0, errors);
    await page.close();
  }
  // Phase 4 step 11: a tree and master/detail panels with a nested <dz-grid>, French and Arabic.
  for (const lang of ['fr', 'ar']) {
    const q = lang === 'ar' ? '&lang=ar' : '';
    {
      const { page, errors } = await open(`page=tree${q}`);
      const s0 = await page.evaluate(() => window.fx.state());
      check(`${lang} tree: a treegrid, ${lang === 'ar' ? 'rtl' : 'ltr'}, Angular cells drawn`, s0.role === 'treegrid' && s0.dir === (lang === 'ar' ? 'rtl' : 'ltr') && s0.cells > 5 && s0.open === '2', s0);
      const a = await axe(page);
      check(`${lang} tree: axe, no violation`, a.length === 0, a);
      const closed = await page.evaluate(() => window.fx.toggleFirst());
      const reopened = await page.evaluate(() => window.fx.toggleFirst());
      check(`${lang} tree: a click on a toggle comes back into [(expanded)] (2 → 1 → 2)`, closed === '1' && reopened === '2', { closed, reopened });
      const h = await page.evaluate(() => document.querySelector('.dzg-layer .dzg-row').getBoundingClientRect().height);
      await page.evaluate((top) => window.fx.scrollTo(top), Math.round(h * 4.5));
      const s1 = await page.evaluate(() => ({ ...window.fx.state(), text: document.querySelector('.dzg-sticky > .dzg-row')?.textContent ?? '' }));
      check(`${lang} tree: pinned parents drawn, text only (no Angular part in them)`, s1.stickyRows >= 1 && s1.stickyParts === 0 && /0/.test(s1.text), s1);
      const sc = await page.evaluate(() => window.fx.scroll(300));
      const sc2 = await page.evaluate(() => window.fx.scroll(200));
      // Pooled rows keep their parts while detached (parts.md): alive ≥ in the page, and the pool stops growing.
      check(`${lang} tree: 300 scrolls then 200: alive = made − destroyed ≥ in the page, the pool stops growing`, sc.made - sc.gone >= sc.live && sc.live > 0 && sc2.made - sc2.gone <= sc.made - sc.gone, { sc, sc2 });
      const gone = await page.evaluate(() => window.fx.destroyGrid());
      check(`${lang} tree: grid destroyed, mounts = destroys, nothing left`, gone.made === gone.gone && gone.live === 0 && gone.roots === 0, gone);
      check(`${lang} tree: no error in the page`, errors.length === 0, errors);
      await page.close();
    }
    {
      const { page, errors } = await open(`page=detail${q}`);
      const s0 = await page.evaluate(() => window.fx.state());
      check(`${lang} detail: master m0 open, its panel a component holding a nested grid`, s0.roots === 2 && s0.panels === 1 && s0.dir === (lang === 'ar' ? 'rtl' : 'ltr'), s0);
      const a = await axe(page);
      check(`${lang} detail: axe with a panel open, no violation`, a.length === 0, a);
      await page.click('fx-visits .fx-vb');
      const acts = await page.evaluate(() => window.fx.treeStats.actions);
      check(`${lang} detail: the panel's emit reaches (partAction) with the master`, acts.length === 1 && /^d:.*m0$/.test(acts[0]), acts);
      await page.click('.dzg-dbody .dzg-layer .dzg-row[aria-rowindex="2"] .dzg-cell');
      await page.keyboard.press('ArrowDown');
      await frames(page, 2);
      const inner = await page.evaluate(() => ({ inInner: !!document.activeElement?.closest('.dzg-dbody'), row: document.activeElement?.closest('.dzg-row')?.getAttribute('aria-rowindex') }));
      check(`${lang} detail: keys move inside the nested grid`, inner.inInner && inner.row === '3', inner);
      await page.keyboard.press('Escape');
      await frames(page, 2);
      const out = await page.evaluate(() => ({ dcell: !!document.activeElement?.classList.contains('dzg-dcell'), inInner: !!document.activeElement?.closest('.dzg-dbody') }));
      check(`${lang} detail: Escape from the nested grid goes back to the panel's cell`, out.dcell && !out.inInner, out);
      await page.keyboard.press('Enter');
      await frames(page, 2);
      const back = await page.evaluate(() => ({ inInner: !!document.activeElement?.closest('.dzg-dbody'), row: document.activeElement?.closest('.dzg-row')?.getAttribute('aria-rowindex') }));
      check(`${lang} detail: Enter goes back into the nested grid, where it was left`, back.inInner && back.row === '3', back);
      const n = await page.evaluate(() => window.fx.openAll(200));
      const sc = await page.evaluate(() => window.fx.scroll(200));
      check(`${lang} detail: 200 masters open, 200 scrolls: panels alive = made − destroyed (none pooled), one grid each`, n >= 1 && sc.panels - sc.panelsGone === sc.panelsLive && sc.roots === sc.panelsLive + 1, { n, sc });
      const gone = await page.evaluate(() => window.fx.destroyGrid());
      check(`${lang} detail: grid destroyed, panels made = destroyed, no grid left`, gone.panels === gone.panelsGone && gone.live === 0 && gone.roots === 0, gone);
      check(`${lang} detail: no error in the page`, errors.length === 0, errors);
      await page.close();
    }
  }
  if (only === 'tree') throw Object.assign(new Error('only'), { only: true });
  const { page, errors } = await open('bench=1');
  const r = await page.evaluate(() => window.fx.bench(200, 40));
  console.log(`rebind in Chrome: ${r.usPerCell.toFixed(2)} µs per Angular cell (jump of 40 rows ${r.onMs.toFixed(2)} ms with ${r.templatedCells} component cells, ${r.offMs.toFixed(2)} ms as text; S6 ≈ 5 µs)`);
  check('bench: a pooled component rebind costs about S6’s (< 15 µs)', r.usPerCell > 0 && r.usPerCell < 15, r);
  check('bench: no error in the page', errors.length === 0, errors);
  await page.close();
} catch (e) {
  if (!e.only) throw e;
} finally {
  await b.close();
  await site.close();
}
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
