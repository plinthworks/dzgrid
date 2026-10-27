/**
 * The audit screen in Chrome (step 18, docs/behaviors/audit-screen.md): `npm run test:audit`.
 * - Permutations, tier 2: the scripts of perf/permutation.ts played in the page with real DOM
 *   events and a clock of the page's own, 100 per configuration (`--full`: 1 000, the exit
 *   criterion); then scripts with typing on real timers and Playwright's keyboard, 10 per
 *   configuration (`--full`: 30).
 * - axe 0 on every state of A and B, in French light and Arabic dark right to left.
 * - The value list's size stable from loading to loaded; aria-busy and stale styling within
 *   100 ms of "next"; the palette switched live with the pager shown.
 * - The CSV export (step 19, `--only export`): a real download per configuration (client, A, B) —
 *   its name, EF BB BF, its rows equal to the oracle's; axe 0 with the export button busy; French and
 *   Arabic right to left (the file name, the sentence said); the run chunk fetched on a hover or a
 *   click only, never at the first paint; 100 000 × 30 exported, its wall time and long frames recorded.
 * - Screenshots to packages/dom/test/browser/results/ (scratch, not tracked); `--update-shots`
 *   writes the reference set to docs/screenshots/step18/ too.
 * One browser at a time, closed in finally.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { serve, browser } from '../spikes/kit.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}packages/dom/test/browser/results`;
const SHOTS = `${ROOT}docs/screenshots/step18`;
const FULL = process.argv.includes('--full');
const UPDATE = process.argv.includes('--update-shots');
const arg = (name, d) => { const i = process.argv.indexOf(name); return i > 0 ? Number(process.argv[i + 1]) : d; };
const FAST = arg('--perms', FULL ? 1000 : 100);
const TYPED = arg('--typed', FULL ? 30 : 10);
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
mkdirSync(OUT, { recursive: true });
if (UPDATE) mkdirSync(SHOTS, { recursive: true });
// tzslot for the instant filter's date kit: bundled once (importmap in audit.html), as test:browser does.
await build({ entryPoints: { dom: '@tzslot/dom', core: '@tzslot/core', 'dom-lazy': '@tzslot/dom/lazy', 'core-lazy': '@tzslot/core/lazy' }, bundle: true, splitting: true, format: 'esm', outdir: `${ROOT}node_modules/.cache/dzgrid-browser`, absWorkingDir: ROOT, logLevel: 'error' });

const site = await serve(import.meta.url);
const checks = [];
const timings = {};
let open = null;
process.on('SIGINT', async () => { await open?.close().catch(() => {}); await site.close(); process.exit(130); });
const check = (label, ok, detail) => {
  checks.push({ label, ok: !!ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `  ${JSON.stringify(detail).slice(0, 1500)}`}`);
};
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const run = (part) => !ONLY || ONLY === part;

async function load(ctx) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1200, height: 800 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(site.root('packages/dom/test/browser/audit.html'));
  await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
  return { page, errors };
}

async function axe(page) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: `${ROOT}node_modules/axe-core/axe.min.js` });
  return page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id}: ${v.nodes.length} (${v.nodes[0]?.target?.join(' ')})`);
  });
}

// ---- in-page helpers (the hold server, the grid's state)
const releaseAll = async (page, fail = false) => {
  await page.evaluate((fail) => { const s = window.audit.server; for (const e of s.pending()) fail ? s.fail(e.seq) : s.release(e.seq); }, fail);
  await frames(page, 3);
};
const pending = (page, channel) => page.evaluate((c) => window.audit.server.pending().filter((e) => !c || e.channel === c).length, channel ?? null);
const state = (page) => page.evaluate(() => ({
  busy: document.querySelector('.dzg-viewport')?.getAttribute('aria-busy'), stale: document.querySelector('.dzg')?.hasAttribute('data-stale'),
  overlay: document.querySelector('.dzg-overlay:not([hidden])')?.textContent ?? null, popup: !!document.querySelector('.dzg-popup'),
  page: window.audit.grid.kernel.rows.page?.index, rows: window.audit.grid.kernel.rows.displayed.count, phase: window.audit.grid.kernel.rows.status.phase,
}));
const mount = async (page, o) => { await page.evaluate((o) => window.audit.mount(o), o); await frames(page, 3); };
const filterBtn = (col) => `.dzg-hcell[role=columnheader][data-col="${col}"] > .dzg-fbtn`;

async function permutations(ctx) {
  const { page, errors } = await load(ctx);
  for (const config of ['fetched', 'server']) {
    const t0 = Date.now();
    let done = 0;
    let failure = null;
    // In slices of 50: progress is printed, and no single evaluate runs for minutes.
    for (let from = 1; from <= FAST && !failure; from += 50) {
      const seeds = Array.from({ length: Math.min(50, FAST - from + 1) }, (_, i) => from + i);
      const r = await page.evaluate(([c, s]) => window.audit.perm(c, s, false), [config, seeds]);
      done += r.done;
      if (!r.ok) failure = r.error;
    }
    timings[`fast ${config}`] = Date.now() - t0;
    check(`permutations, ${FAST} seeds on ${config === 'fetched' ? 'A (fetched set)' : 'B (server pages)'}, real DOM events, page clock (${Math.round((Date.now() - t0) / 1000)} s)`, !failure && done === FAST, failure ?? done);
  }
  check('no page error during the permutations', errors.length === 0, errors);
  await page.close();
}

async function typedPermutations(ctx) {
  const { page, errors } = await load(ctx);
  // The keyboard, for the page's runner: one key at a time, the page's event loop running between.
  let keys = 0;
  await page.exposeFunction('pwKey', async (k) => (keys++, k.length === 1 ? page.keyboard.type(k) : page.keyboard.press(k)));
  for (const config of ['fetched', 'server']) {
    const t0 = Date.now();
    const seeds = Array.from({ length: TYPED }, (_, i) => 5001 + i);
    const r = await page.evaluate(([c, s]) => window.audit.perm(c, s, true), [config, seeds]);
    timings[`typed ${config}`] = Date.now() - t0;
    check(`permutations with typing, ${TYPED} seeds on ${config}, Playwright keyboard (${keys} keys so far), real timers (${Math.round((Date.now() - t0) / 1000)} s)`, r.ok && r.done === TYPED && keys > 0, r.error ?? r.done);
  }
  check('no page error during the typed permutations', errors.length === 0, errors);
  await page.close();
}

const COMBOS = [
  { lang: 'fr', theme: 'light', dir: 'ltr' },
  { lang: 'ar', theme: 'dark', dir: 'rtl' },
];

/** axe on every state of the screen (step 18 checks), A and B, French light and Arabic dark right to left. */
async function axeStates(ctx) {
  const { page, errors } = await load(ctx);
  for (const config of ['fetched', 'server']) {
    for (const c of COMBOS) {
      const tag = `axe ${config} ${c.lang} ${c.theme} ${c.dir}`;
      const seen = {};
      let errorShown = false;
      const at = async (name) => { seen[name] = await axe(page); };
      await mount(page, { config, ...c });
      const s0 = await state(page);
      await at('first load (aria-busy, loading overlay)');
      await releaseAll(page);
      await at('loaded');
      // Next twice: page 3; once more held: the rows kept, aria-busy.
      for (let i = 0; i < 2; i++) { await page.click('.dzg-footer button[data-go="next"]'); await releaseAll(page); }
      const p3 = await state(page);
      await at('pager on page 3');
      await page.click('.dzg-footer button[data-go="next"]');
      await frames(page, 2);
      const held = await state(page);
      if (config === 'server') await at('loading, the rows kept (aria-busy, stale)');
      if (config === 'server') {
        await releaseAll(page, true);
        await at('error overlay with Retry');
        errorShown = await page.evaluate(() => !!document.querySelector('.dzg-overlay:not([hidden]) button'));
        await page.click('.dzg-overlay button');
        await releaseAll(page);
      } else {
        // A pages without asking: a refresh fails instead.
        await page.evaluate(() => window.audit.grid.kernel.dispatch({ type: 'rows.refresh' }, 'user'));
        await releaseAll(page, true);
        await at('error overlay with Retry');
        errorShown = await page.evaluate(() => !!document.querySelector('.dzg-overlay:not([hidden]) button'));
        await page.click('.dzg-overlay button');
        await releaseAll(page);
      }
      // The floating row: a name typed, a duration that does not read (marked after its pause).
      await page.click('.dzg-hextra[data-col="actor"] input');
      await page.keyboard.type('ami');
      await page.click('.dzg-hextra[data-col="durationMs"] input');
      await page.keyboard.type('abc');
      await page.waitForTimeout(400);
      await releaseAll(page);
      const invalid = await page.evaluate(() => document.querySelector('.dzg-hextra[data-col="durationMs"] input')?.getAttribute('aria-invalid'));
      await at('floating row typed and invalid');
      await page.fill('.dzg-hextra[data-col="durationMs"] input', '');
      await page.fill('.dzg-hextra[data-col="actor"] input', '');
      await page.waitForTimeout(400);
      await releaseAll(page);
      // The popups: text, number, instant between (its date kit, lazy), the value list.
      for (const [col, name] of [['actor', 'text popup'], ['durationMs', 'number popup']]) {
        await page.click(filterBtn(col));
        await frames(page);
        await at(name);
        await page.keyboard.press('Escape');
        await frames(page);
      }
      await page.click(filterBtn('occurredAt'));
      await page.selectOption('.dzg-popup select.dzg-fop', 'between');
      await page.waitForSelector('.dzg-popup .dzg-fdate .tz-field', { timeout: 15000 });
      await frames(page, 2);
      await at('instant between popup (date kit loaded)');
      await page.keyboard.press('Escape');
      await frames(page);
      await page.click(filterBtn('resource'));
      await page.waitForFunction(() => window.audit.server.pending().some((e) => e.channel === 'values:resource'), null, { timeout: 15000 });
      await frames(page);
      await at('value list loading');
      const listBusy = await page.evaluate(() => document.querySelector('.dzg-popup [aria-busy=true]') !== null);
      await releaseAll(page);
      await at('value list loaded');
      const options = await page.evaluate(() => document.querySelectorAll('.dzg-popup [role=option]').length);
      await page.fill('.dzg-popup input.dzg-fsearch', 'compte');
      await page.waitForTimeout(400);
      await releaseAll(page, true);
      await at('value list failed (Retry)');
      const listFailed = await page.evaluate(() => !!document.querySelector('.dzg-popup .dzg-flistw [role=alert]') && !!document.querySelector('.dzg-popup .dzg-fretry'));
      await page.keyboard.press('Escape');
      await frames(page);
      // The search: with results, then none.
      await page.fill('#q', 'compte-1');
      await page.waitForTimeout(400);
      await releaseAll(page);
      await at('search with results');
      const found = await state(page);
      await page.fill('#q', 'zzzz');
      await page.waitForTimeout(400);
      await releaseAll(page);
      const none = await state(page);
      await at('search with no result');
      const bad = Object.entries(seen).filter(([, v]) => v.length);
      check(`${tag}: axe 0 on ${Object.keys(seen).length} states (${Object.keys(seen).join('; ')})`, bad.length === 0, bad);
      check(`${tag}: the states are what they say (busy at first, page 3, ${config === 'server' ? 'busy and stale while next loads' : 'next asks nothing'}, the error and Retry, invalid marked, the list busy then filled then failed with Retry, rows found, the no-match overlay)`,
        s0.busy === 'true' && p3.page === 2 && (config === 'server' ? held.busy === 'true' && held.stale : held.busy !== 'true' && held.page === 3) && invalid === 'true' && none.rows === 0 && !!none.overlay
          && errorShown && listBusy && options > 0 && listFailed && found.rows > 0,
        { s0, p3, held, invalid, none, errorShown, listBusy, options, listFailed, found });
    }
  }
  check('no page error in the axe states', errors.length === 0, errors);
  await page.close();
}

/** The value list keeps its size from loading to loaded (no jump under the pointer), both directions. */
async function stableSize(ctx) {
  const { page, errors } = await load(ctx);
  for (const c of COMBOS) {
    await mount(page, { config: 'server', ...c });
    await releaseAll(page);
    const rects = () => page.evaluate(() => {
      const r = (el) => { const b = el?.getBoundingClientRect(); return b && { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
      return { pop: r(document.querySelector('.dzg-popup')), list: r(document.querySelector('.dzg-popup .dzg-flistw')), busy: document.querySelector('.dzg-popup [role=listbox]')?.getAttribute('aria-busy') ?? document.querySelector('.dzg-popup .dzg-fset [aria-busy]')?.getAttribute('aria-busy') ?? null };
    });
    const shift = (a, b) => (a && b ? Math.max(...['l', 'r', 't', 'b'].map((k) => Math.abs(a[k] - b[k]))) : Infinity);
    // The chunk loaded once beforehand: what is measured is the values loading, not the chunk.
    await page.click(filterBtn('resource'));
    await page.waitForSelector('.dzg-popup [role=listbox]', { timeout: 15000 });
    await releaseAll(page);
    await page.keyboard.press('Escape');
    await page.click(filterBtn('resource'));
    await page.waitForSelector('.dzg-popup [role=listbox][aria-busy=true]', { timeout: 15000 });
    await frames(page, 2);
    const loading = await rects();
    await releaseAll(page);
    const loaded = await rects();
    await page.fill('.dzg-popup input.dzg-fsearch', 'dossier-1');
    await page.waitForTimeout(400);
    await frames(page, 2);
    const narrowing = await rects();
    await releaseAll(page);
    const narrowed = await rects();
    const d1 = Math.max(shift(loading.pop, loaded.pop), shift(loading.list, loaded.list));
    const d2 = Math.max(shift(narrowing.pop, narrowed.pop), shift(narrowing.list, narrowed.list));
    check(`value list size stable (${c.lang} ${c.dir}): first load ${d1.toFixed(2)} px, a narrower search ${d2.toFixed(2)} px (≤ 1)`, d1 <= 1 && d2 <= 1 && loading.busy === 'true' && narrowing.busy === 'true', { loading, loaded, narrowing, narrowed });
    await page.keyboard.press('Escape');
  }
  check('no page error in the stable size check', errors.length === 0, errors);
  await page.close();
}

/** aria-busy and stale styling within 100 ms of "next"; the palette switched live with the pager shown. */
async function busyAndPalette(ctx) {
  const { page, errors } = await load(ctx);
  for (const c of COMBOS) {
    await mount(page, { config: 'server', ...c });
    await releaseAll(page);
    const ms = await page.evaluate(() => new Promise((done) => {
      const vp = document.querySelector('.dzg-viewport');
      const root = document.querySelector('.dzg');
      const t0 = performance.now();
      const look = () => (vp.getAttribute('aria-busy') === 'true' && root.hasAttribute('data-stale') ? done(performance.now() - t0) : requestAnimationFrame(look));
      document.querySelector('.dzg-footer button[data-go="next"]').click();
      look();
    }));
    check(`aria-busy and stale styling ${Math.round(ms)} ms after "next" (${c.lang} ${c.dir}, ≤ 100)`, ms <= 100, ms);
    await releaseAll(page);
    const r = await page.evaluate(async () => {
      const root = document.querySelector('.dzg');
      const footer = document.querySelector('.dzg-footer');
      document.querySelector('.dzg-layer > .dzg-row .dzg-box')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const row = document.querySelector('.dzg-layer > .dzg-row[aria-selected="true"]');
      const before = row && getComputedStyle(row).backgroundColor;
      document.documentElement.style.setProperty('--tz-accent', 'light-dark(#be123c, #fb7185)');
      await new Promise((r) => requestAnimationFrame(r));
      const after = row && getComputedStyle(row).backgroundColor;
      document.documentElement.style.removeProperty('--tz-accent');
      return { before, after, same: document.querySelector('.dzg') === root && document.querySelector('.dzg-footer') === footer, pager: !!document.querySelector('.dzg-footer nav') };
    });
    check(`palette switched live with the pager shown (${c.lang} ${c.theme}): the selected row changes colour, nothing re-created`, r.before && r.before !== r.after && r.same && r.pager, r);
  }
  check('no page error in the busy and palette checks', errors.length === 0, errors);
  await page.close();
}

/** About twelve screenshots for the owner: A and B, French light and Arabic dark, loaded, the value list open, the error. */
async function screenshots(ctx) {
  const { page, errors } = await load(ctx);
  const names = [];
  for (const config of ['fetched', 'server']) {
    for (const c of COMBOS) {
      const shot = async (state) => {
        const name = `audit-${config}-${c.lang}-${c.theme}-${state}.png`;
        await frames(page, 3);
        const buf = await page.screenshot({ path: `${OUT}/${name}`, caret: 'hide', animations: 'disabled' });
        if (UPDATE) await page.screenshot({ path: `${SHOTS}/${name}`, caret: 'hide', animations: 'disabled' });
        names.push(name);
        return buf;
      };
      await mount(page, { config, ...c, total: config === 'server' });
      await releaseAll(page);
      await shot('loaded');
      await page.click(filterBtn('resource'));
      await page.waitForFunction(() => window.audit.server.pending().some((e) => e.channel === 'values:resource'), null, { timeout: 15000 });
      await releaseAll(page);
      await page.waitForSelector('.dzg-popup [role=option]', { timeout: 15000 });
      await shot('value-list');
      await page.keyboard.press('Escape');
      await page.evaluate(() => window.audit.grid.kernel.dispatch({ type: 'rows.refresh' }, 'user'));
      await releaseAll(page, true);
      await page.mouse.move(0, 0);
      await shot('error');
    }
  }
  check(`screenshots: ${names.length} written to results/${UPDATE ? ' and docs/screenshots/step18/' : ''}`, names.length === 12, names);
  check('no page error in the screenshots', errors.length === 0, errors);
  await page.close();
}

/** The CSV export (step 19): downloads per configuration, axe with the busy button, fr and ar, the lazy chunk, the bench. */
async function exportChecks(ctx) {
  const { page, errors } = await load(ctx);
  const said = () => page.evaluate(() => document.querySelector('.dzg-live')?.textContent ?? '');
  const download = async () => {
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#export')]);
    const buf = readFileSync(await d.path());
    return { name: d.suggestedFilename(), bom: [...buf.subarray(0, 3)], text: buf.toString('utf8') };
  };
  for (const config of ['client', 'fetched', 'server']) {
    for (const seed of [3, 12]) {
      const { want } = await page.evaluate((o) => window.audit.exportMount(o), { config, seed });
      const f = await download();
      const cmp = await page.evaluate(([t, w]) => window.audit.exportCompare(t, w), [f.text, want]);
      await page.waitForTimeout(120);
      const sentence = await said();
      const nameOk = config === 'server' ? f.name === 'journal-serveur.csv' : /^export-\d{4}-\d\d-\d\d-\d{4}\.csv$/.test(f.name);
      check(`export download, ${config} seed ${seed}: ${f.name}, EF BB BF, ${cmp.got} rows = the oracle's, "${sentence}"`,
        nameOk && f.bom.join() === '239,187,191' && cmp.ok && sentence.startsWith('Exported'), { name: f.name, bom: f.bom, cmp, sentence });
    }
  }
  // fr and ar (right to left): the file name, the sentence, the separator.
  for (const [lang, prefix, start, sep] of [['fr', 'export-', 'Exporté. ', ';'], ['ar', 'تصدير-', 'تم التصدير. ', ';']]) {
    const { want } = await page.evaluate((o) => window.audit.exportMount(o), { config: 'client', seed: 19, lang });
    const f = await download();
    const cmp = await page.evaluate(([t, w]) => window.audit.exportCompare(t, w), [f.text, want]);
    await page.waitForTimeout(120);
    const sentence = await said();
    const dir = await page.evaluate(() => document.querySelector('.dzg')?.getAttribute('dir'));
    const header = f.text.slice(1, f.text.indexOf('\r\n'));
    check(`export in ${lang} (${dir}): ${f.name}, "${sentence}", header "${header.slice(0, 60)}…"`,
      f.name.startsWith(prefix) && /-\d{4}-\d\d-\d\d-\d{4}\.csv$/.test(f.name) && sentence.startsWith(start) && cmp.ok && header.includes(sep) && dir === (lang === 'ar' ? 'rtl' : 'ltr'), { name: f.name, sentence, cmp, header, dir });
  }
  // axe with the button busy (aria-busy, never disabled), A and B.
  for (const config of ['fetched', 'server']) {
    await page.evaluate((o) => window.audit.exportMount(o), { config, seed: 7, never: true });
    await page.click('#export');
    await page.waitForSelector('#export[aria-busy=true]', { timeout: 10000 });
    const v = await axe(page);
    const disabled = await page.evaluate(() => document.getElementById('export').disabled);
    await page.evaluate(() => window.audit.xg.exporter.cancel());
    await page.waitForFunction(() => !document.getElementById('export').hasAttribute('aria-busy'), null, { timeout: 10000 });
    await page.waitForTimeout(120);
    const sentence = await said();
    check(`export button busy (${config}): axe 0, aria-busy, not disabled; cancelled: "${sentence}"`, v.length === 0 && !disabled && sentence === 'Export cancelled', { v, disabled, sentence });
  }
  check('no page error in the export checks', errors.length === 0, errors);
  await page.close();

  // The run chunk: not fetched at the first paint; fetched on a hover; on a click alone too.
  for (const how of ['hover', 'click']) {
    const { page: p2, errors: e2 } = await load(ctx);
    const asked = [];
    p2.on('request', (r) => { if (/\/export\/run\//.test(r.url())) asked.push(r.url()); });
    await p2.evaluate((o) => window.audit.exportMount(o), { config: 'client', seed: 2 });
    await frames(p2, 3);
    const atPaint = asked.length;
    if (how === 'hover') await p2.hover('#export');
    else await p2.dispatchEvent('#export', 'click');
    await p2.waitForTimeout(500);
    check(`export chunk lazy: none at the first paint, fetched on a ${how} (${asked.length} request${asked.length === 1 ? '' : 's'})`, atPaint === 0 && asked.length > 0, { atPaint, asked });
    check(`no page error in the lazy check (${how})`, e2.length === 0, e2);
    await p2.close();
  }

  // 100 000 × 30, all, French: the wall time and the longest frames (recorded; plan ≤ 1 s, ≤ 50 ms).
  const { page: p3, errors: e3 } = await load(ctx);
  const b = await p3.evaluate(() => window.audit.exportBench(3));
  timings.exportBench = b;
  const walls = b.runs?.map((r) => r.wall) ?? [];
  check(`export bench 100 000 × 30: wall ${walls.join(' / ')} ms, longest animation frame ${b.runs?.map((r) => r.loaf).join(' / ')} ms, longest task ${b.runs?.map((r) => r.longtask).join(' / ')} ms, ${b.bytes} bytes, ${b.lines} lines (recorded)`,
    !b.error && b.lines === 100000 && b.bom?.join() === '239,187,191', b);
  check('no page error in the export bench', e3.length === 0, e3);
  await p3.close();
}

try {
  const b = (open = await browser('chrome'));
  try {
    const ctx = await b.newContext({ reducedMotion: 'reduce', acceptDownloads: true });
    if (run('axe')) await axeStates(ctx);
    if (run('size')) await stableSize(ctx);
    if (run('busy')) await busyAndPalette(ctx);
    if (run('shots')) await screenshots(ctx);
    if (run('perm')) await permutations(ctx);
    if (run('typed')) await typedPermutations(ctx);
    if (run('export')) await exportChecks(ctx);
  } finally {
    await b.close();
    open = null;
  }
} finally {
  await site.close();
}
const failed = checks.filter((c) => !c.ok).length;
console.log(`\ntest:audit${FULL ? ' --full' : ''}: ${checks.length - failed} passed, ${failed} failed; timings ${JSON.stringify(timings)}`);
process.exit(failed ? 1 : 0);
