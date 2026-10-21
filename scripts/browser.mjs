/**
 * The grid in a real browser: what jsdom cannot see. `npm run test:browser`
 * (Chrome; `-- --all` adds Firefox and WebKit for the RTL and focus checks; `-- --only parts` the cell parts alone, `-- --only rules` the selection rules and the header's box, step 21;
 * `-- --only motion` motion with GSAP, step 26, with a tree's toggles, Phase 4 step 6; `-- --only tree` the tree, Phase 4 step 4).
 * One browser at a time, closed in finally. Screenshots go to
 * packages/dom/test/browser/results/ (gitignored), for a person to look at.
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { serve, browser } from '../spikes/kit.mjs';
import { chromeDump } from '../spikes/s4-a11y/ax.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}packages/dom/test/browser/results`;
mkdirSync(OUT, { recursive: true });
// tzslot for the page's date filters (step 14): bundled once, two entries sharing one core (importmap in index.html).
await build({ entryPoints: { dom: '@tzslot/dom', core: '@tzslot/core' }, bundle: true, splitting: true, format: 'esm', outdir: `${ROOT}node_modules/.cache/dzgrid-browser`, absWorkingDir: ROOT, logLevel: 'error' });
const engines = process.argv.includes('--all') ? ['chrome', 'firefox', 'webkit'] : ['chrome'];
// `-- --only parts`: one group of checks (step 20's cell parts), for work on it; the full run before a commit.
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const site = await serve(import.meta.url);
const checks = [];
let open = null;
process.on('SIGINT', async () => { await open?.close().catch(() => {}); await site.close(); process.exit(130); });

const check = (engine, label, ok, detail) => {
  checks.push({ engine, label, ok: !!ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${engine}: ${label}${ok ? '' : `  ${JSON.stringify(detail).slice(0, 500)}`}`);
};
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

async function load(ctx, qs = '') {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1000, height: 760 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(site.root(`packages/dom/test/browser/index.html?${qs}`));
  await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
  await frames(page, 3);
  return { page, errors };
}

async function axe(page) {
  await page.addScriptTag({ path: `${ROOT}node_modules/axe-core/axe.min.js` });
  return page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id}: ${v.nodes.length} (${v.nodes[0]?.target?.join(' ')})`);
  });
}

/** Header and body cells of each mounted column line up; pinned segments sit at their edges. */
const geometry = (page) => page.evaluate(() => {
  const vp = document.querySelector('.dzg-viewport');
  const v = vp.getBoundingClientRect();
  const rtl = getComputedStyle(vp).direction === 'rtl';
  const row = [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => { const b = r.getBoundingClientRect(); return b.top > v.top + 40 && b.bottom < v.bottom - 20; });
  let worst = 0;
  for (const cell of row.querySelectorAll('[data-col]')) {
    // The column header (a group header names its first column too).
    const h = document.querySelector(`.dzg-header .dzg-hcell[data-col="${cell.dataset.col}"]:not(.dzg-hgroup)`);
    if (!h) return { missing: cell.dataset.col };
    const a = h.getBoundingClientRect(), b = cell.getBoundingClientRect();
    worst = Math.max(worst, Math.abs(a.left - b.left), Math.abs(a.right - b.right));
  }
  // The selection box's cell, when there is one, as wide as its header.
  const hc = document.querySelector('.dzg-header .dzg-check');
  const bc = row.querySelector('.dzg-check');
  if (hc && bc) {
    const a = hc.getBoundingClientRect(), b = bc.getBoundingClientRect();
    worst = Math.max(worst, Math.abs(a.left - b.left), Math.abs(a.right - b.right));
  }
  const inner = { left: v.left + vp.clientLeft, right: v.left + vp.clientLeft + vp.clientWidth };
  const s = row.querySelector('.dzg-seg-start').getBoundingClientRect();
  const e = row.querySelector('.dzg-seg-end').getBoundingClientRect();
  const startEdge = rtl ? Math.abs(s.right - inner.right) : Math.abs(s.left - inner.left);
  const endEdge = rtl ? Math.abs(e.left - inner.left) : Math.abs(e.right - inner.right);
  return { worst, startEdge, endEdge };
});

/** Step 14 part B: the date filters, tzslot's widgets inside the popup (docs/behaviors/filter-date-picker.md). */
async function dateChecks(name, ctx) {
  const cases = [
    ['locale=fr-FR&theme=light&rows=2000&filters=1&popup=1&dates=1', false, 'Filtre Jour', /29 mars 2026/],
    ['locale=ar-DZ&dir=rtl&theme=dark&rows=2000&filters=1&popup=1&dates=1', true, 'مرشح اليوم', /29.*03.*2026/],
  ];
  const S = (page) => page.evaluate(() => {
    const pop = document.querySelector('.dzg-popup');
    const panel = document.querySelector('.tz-field__panel');
    const r = panel?.getBoundingClientRect();
    const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(24, r.height / 2));
    const trig = document.querySelector('.dzg-fdate .tz-field__trigger, .dzg-fdate .tz-field__wrap');
    const tr = trig?.getBoundingClientRect();
    return {
      open: !!pop, label: pop?.getAttribute('aria-label'), panel: !!panel, panelIn: !!panel && !!pop?.contains(panel), hit: !!hit && !!panel?.contains(hit),
      panelRect: r && { l: r.left, r: r.right, t: r.top, b: r.bottom }, trig: tr && { l: tr.left, r: tr.right, t: tr.top, b: tr.bottom },
      activeInPanel: !!panel?.contains(document.activeElement), activeInPopup: !!pop?.contains(document.activeElement), onButton: document.activeElement?.classList.contains('dzg-fbtn'),
      panelBg: panel && getComputedStyle(panel).backgroundColor, tzBg: pop && getComputedStyle(pop).backgroundColor, dir: panel?.dir,
      trigText: document.querySelector('.dzg-fdate .tz-field__text, .dzg-fdate input')?.[document.querySelector('.dzg-fdate input') ? 'value' : 'textContent'] ?? null,
      status: document.querySelector('.dzg-fdate [role=status]')?.textContent ?? null, alert: document.querySelector('.dzg-fdate [role=alert]')?.textContent ?? null,
    };
  });
  const filter = (page, c) => page.evaluate((c) => window.t.grid.kernel.query.filter[c] ?? null, c);
  const shown = (page) => page.evaluate(() => window.t.grid.kernel.rows.displayed.count);
  const ready = (page) => page.waitForSelector('.dzg-popup .dzg-fdate .tz-field', { timeout: 15000 });
  const openOn = async (page, c) => { await page.click(`.dzg-hcell[role=columnheader][data-col="${c}"] > .dzg-fbtn`); await frames(page); };
  const openPanel = async (page) => { await page.click('.dzg-popup .dzg-fdate .tz-field__trigger:is(button), .dzg-popup .dzg-fdate .tz-field__icon-button'); await frames(page, 3); };
  const op = (page, v) => page.selectOption('.dzg-popup select.dzg-fop', v);
  const set = (page, c, f) => page.evaluate(([c, f]) => window.t.grid.kernel.dispatch({ type: 'filter.column', column: c, filter: f }, 'api'), [c, f]);
  /** The clock moved to `iso` (the grid's clock: the machine's plus an offset). */
  const clockAt = (page, iso) => page.evaluate((iso) => { window.t.clock.offset = Date.parse(iso) - Date.now(); }, iso);
  for (const [qs, rtl, popName, dayText] of cases) {
    const { page, errors } = await load(ctx, qs);
    const tag = `dates ${qs}`;
    // A day column: the popup opens at once, the field arrives; axe with the popup open and with the panel open.
    await openOn(page, 'day');
    const s0 = await S(page);
    await ready(page);
    let v = await axe(page);
    check(name, `${tag}: the day popup (${popName}) opens, the field arrives, axe 0`, s0.open && s0.label === popName && v.length === 0, { s0, v });
    await openPanel(page);
    const s1 = await S(page);
    v = await axe(page);
    check(name, `${tag}: the calendar opens inside the popup, on top under the pointer, focus inside, axe 0`, s1.panelIn && s1.hit && s1.activeInPanel && v.length === 0, { s1, v });
    check(name, `${tag}: the panel takes the popup's surface (${rtl ? 'dark' : 'light'}), and reads ${rtl ? 'right to left' : 'left to right'}`, s1.panelBg === s1.tzBg && s1.dir === (rtl ? 'rtl' : 'ltr'), s1);
    const aligned = rtl ? Math.abs(s1.panelRect.r - s1.trig.r) <= 12 : Math.abs(s1.panelRect.l - s1.trig.l) <= 12;
    check(name, `${tag}: the panel lines up with its trigger's start edge${rtl ? ' (right)' : ''}`, aligned, s1);
    // Tab and Shift+Tab stay inside the open panel.
    let left = 0;
    for (let i = 0; i < 12; i++) { await page.keyboard.press(i % 3 === 2 ? 'Shift+Tab' : 'Tab'); if (!(await S(page)).activeInPanel) left++; }
    check(name, `${tag}: Tab and Shift+Tab stay inside the open calendar`, left === 0, left);
    // Escape: the panel, then the popup; focus back on the header's button.
    await page.keyboard.press('Escape');
    await frames(page);
    const e1 = await S(page);
    await page.keyboard.press('Escape');
    await frames(page);
    const e2 = await S(page);
    check(name, `${tag}: Escape closes the calendar (focus back in the popup), a second Escape the popup (focus on the button)`, !e1.panel && e1.open && e1.activeInPopup && !e2.open && e2.onButton, { e1, e2 });
    // A day picked from the keyboard: Enter on the day the calendar focuses (today, else the selection).
    await set(page, 'day', { type: 'day', op: 'equals', value: '2026-03-29' });
    await openOn(page, 'day');
    await ready(page);
    const named = await page.evaluate(() => document.querySelector('.dzg-popup .dzg-fdate .tz-field__trigger').getAttribute('aria-label'));
    const s2 = await S(page);
    check(name, `${tag}: the trigger shows the day in the grid's locale (${dayText}) and its name carries it (T1)`, dayText.test(s2.trigText ?? '') && named.includes(s2.trigText), { s2, named });
    await openPanel(page);
    await page.keyboard.press(rtl ? 'ArrowLeft' : 'ArrowRight');
    await page.keyboard.press('Enter');
    await frames(page);
    const picked = await filter(page, 'day');
    const s3 = await S(page);
    check(name, `${tag}: → then Enter picks the next day: stored at once, the calendar closed, the popup open`, picked?.value === '2026-03-30' && !s3.panel && s3.open, { picked, s3 });
    // Between and the shortcuts; a shortcut stores the shortcut.
    await op(page, 'between');
    await ready(page);
    await openPanel(page);
    v = await axe(page);
    const presets = await page.evaluate(() => [...document.querySelectorAll('.tz-field__panel .tz-rangefield__preset')].map((b) => b.textContent));
    check(name, `${tag}: between offers the six shortcuts, axe 0 with the period panel open`, presets.length === 6 && v.length === 0, { presets, v });
    await page.click('.tz-field__panel .tz-rangefield__preset >> nth=2');
    await frames(page);
    const rel = await filter(page, 'day');
    check(name, `${tag}: the third shortcut stores {op: relative, range: last7Days}`, rel?.op === 'relative' && rel.range === 'last7Days', rel);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await frames(page);
    await set(page, 'day', null);
    // Midnight: "today" on the instant column moves by itself at midnight in Paris (24 h, then the 25-hour day).
    await clockAt(page, '2026-10-24T21:59:59.600Z');
    await set(page, 'at', { type: 'instant', op: 'relative', range: 'today' });
    await frames(page);
    const before = await shown(page);
    await page.waitForTimeout(1000);
    await frames(page);
    const after = await shown(page);
    check(name, `${tag}: midnight in Paris: "today" moves from 24/10 (96 rows, 24 h) to 25/10 (100 rows, 25 h) by itself`, before === 96 && after === 100, { before, after });
    // The instant column: whole days in Paris, 23 h and 25 h; last 7 days across the change, 169 h.
    await set(page, 'at', { type: 'instant', op: 'onDay', day: '2026-03-29' });
    await frames(page);
    const n29 = await shown(page);
    await set(page, 'at', { type: 'instant', op: 'onDay', day: '2026-10-25' });
    await frames(page);
    const n25 = await shown(page);
    await clockAt(page, '2026-10-25T12:00:00Z');
    await set(page, 'at', { type: 'instant', op: 'relative', range: 'last7Days' });
    await frames(page);
    const n7 = await shown(page);
    check(name, `${tag}: on 2026-03-29 92 rows (23 h), on 2026-10-25 100 (25 h), last 7 days to 25/10 676 (169 h)`, n29 === 92 && n25 === 100 && n7 === 676, { n29, n25, n7 });
    await clockAt(page, '2026-10-19T12:00:00Z');
    await set(page, 'at', null);
    // A moment at the gap and at the repeat (fr only: the typed pattern is the locale's).
    if (!rtl) {
      await openOn(page, 'at');
      await ready(page);
      const zone = await page.evaluate(() => document.querySelector('.dzg-popup .dzg-fzone bdi')?.textContent);
      await op(page, 'before');
      await ready(page);
      await page.focus('.dzg-popup .dzg-fdate input');
      await page.keyboard.type('29/03/2026 02:30');
      await frames(page, 3);
      const note = await page.evaluate(() => document.querySelector('.tz-field__panel')?.textContent.includes('02:30'));
      v = await axe(page);
      check(name, `${tag}: a skipped time (Paris 29/03 02:30) shows tzslot's note; the zone line says Europe/Paris; axe 0`, note && zone === 'Europe/Paris' && v.length === 0, { note, zone, v });
      await page.keyboard.press('Enter');
      await frames(page);
      const gap = await filter(page, 'at');
      check(name, `${tag}: Enter applies the moment moved later, 01:30Z, and closes`, gap?.at === '2026-03-29T01:30:00.000Z' && !(await S(page)).open, gap);
      await openOn(page, 'at');
      await ready(page);
      await page.focus('.dzg-popup .dzg-fdate input');
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type('25/10/2026 02:30');
      await frames(page, 3);
      const readings = await page.evaluate(() => [...document.querySelectorAll('.tz-field__panel .tz-datetime__reading')].map((b) => `${b.textContent}:${b.getAttribute('aria-pressed')}`));
      v = await axe(page);
      check(name, `${tag}: a repeated time shows two readings, the first pressed; axe 0`, readings.length === 2 && readings[0].endsWith(':true') && v.length === 0, { readings, v });
      await page.click('.tz-field__panel .tz-datetime__reading >> nth=1');
      // The open calendar covers the footer: Escape closes it first (the popup stays).
      await page.keyboard.press('Escape');
      await page.click('.dzg-popup .dzg-fapply');
      await frames(page);
      const second = await filter(page, 'at');
      check(name, `${tag}: the second reading applies 01:30Z`, second?.at === '2026-10-25T01:30:00.000Z', second);
      await set(page, 'at', null);
    }
    // Forced colours: the chosen day keeps its mark.
    await page.emulateMedia({ forcedColors: 'active' });
    await set(page, 'day', { type: 'day', op: 'equals', value: '2026-10-19' });
    await openOn(page, 'day');
    await ready(page);
    await openPanel(page);
    const fc = await page.evaluate(() => { const d = document.querySelector('.tz-field__panel .tz-cal__day--selected'); return d && { adjust: getComputedStyle(d).forcedColorAdjust, bg: getComputedStyle(d).backgroundColor }; });
    check(name, `${tag}: forced colours: the chosen day keeps a Highlight background`, fc?.adjust === 'none' && fc.bg !== 'rgba(0, 0, 0, 0)', fc);
    await page.screenshot({ path: `${OUT}/${name}-dates-${qs.replace(/[&=]/g, '_')}.png`, clip: { x: 0, y: 0, width: 1000, height: 640 } });
    await page.emulateMedia({ forcedColors: 'none' });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    // Near the bottom, in a transformed card: the popup in the top layer, its panel too, seen.
    await page.evaluate(() => { document.querySelector('main').style.paddingBlockStart = '480px'; const h = document.getElementById('host'); h.style.transform = 'translateZ(0)'; h.style.overflow = 'hidden'; window.scrollTo(0, 0); });
    await frames(page, 3);
    await openOn(page, 'day');
    await ready(page);
    await openPanel(page);
    const s4 = await S(page);
    const layer = await page.evaluate(() => document.querySelector('.dzg-popup').matches(':popover-open'));
    check(name, `${tag}: in a transformed card near the bottom, the popup is in the top layer and its calendar on top, inside the window`, layer && s4.hit && s4.panelRect.t >= 0 && s4.panelRect.b <= 760, s4);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    check(name, `no page error ${tag}`, errors.length === 0, errors);
    await page.close();
  }
  // Digits: ar-EG with the locale's digits.
  {
    const { page, errors } = await load(ctx, 'locale=ar-EG&dir=rtl&rows=200&filters=1&popup=1&dates=1&numerals=locale');
    await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'filter.column', column: 'day', filter: { type: 'day', op: 'equals', value: '2026-03-29' } }, 'api'));
    await openOn(page, 'day');
    await ready(page);
    const s = await S(page);
    check(name, 'dates ar-EG numerals=locale: the trigger writes Arabic-Indic digits (٢٠٢٦), Gregorian', /٢٠٢٦/.test(s.trigText ?? ''), s);
    check(name, 'no page error dates ar-EG', errors.length === 0, errors);
    await page.close();
  }
  // A chunk that arrives late, then one that never does (aborted), then Retry.
  {
    const { page, errors } = await load(ctx, 'locale=fr-FR&rows=200&filters=1&popup=1&dates=1');
    let release;
    const late = new Promise((r) => (release = r));
    await page.route('**/filters/dates/range.js', async (route) => { await late; await route.continue(); });
    // Every fetch of the chunk fails until Retry is clicked: current Chrome re-fetches a failed
    // import() (older engines kept the failure, spike S13), so a one-shot abort would let the next
    // operator load the field and Retry would never show.
    let aborts = 0;
    const abortMoment = (route) => { aborts++; return route.abort('failed'); };
    await page.route('**/filters/dates/moment.js', abortMoment);
    await openOn(page, 'day');
    await ready(page);
    await op(page, 'between');
    await frames(page);
    const loading = await S(page);
    const busy = await page.evaluate(() => document.querySelector('.dzg-popup .dzg-fdate').getAttribute('aria-busy'));
    const v = await axe(page);
    release();
    await ready(page);
    const arrived = await S(page);
    check(name, 'dates: a late chunk shows the loading line (aria-busy, axe 0), then the field', loading.status === 'Chargement du calendrier…' && busy === 'true' && v.length === 0 && arrived.status === null, { loading, busy, v, arrived });
    await page.keyboard.press('Escape');
    await openOn(page, 'at');
    await ready(page);
    await op(page, 'before');
    await page.waitForSelector('.dzg-popup .dzg-fdate [role=alert]', { timeout: 10000 });
    const failed = await S(page);
    const va = await axe(page);
    await op(page, 'blank');
    await frames(page);
    const blank = await filter(page, 'at');
    check(name, 'dates: an aborted chunk shows the failure (alert, Retry, axe 0); blank still filters', !!failed.alert && va.length === 0 && blank?.op === 'blank', { failed, va, blank });
    await op(page, 'after');
    await page.waitForSelector('.dzg-popup .dzg-fretry', { timeout: 10000 });
    const failedFetches = aborts;
    await page.unroute('**/filters/dates/moment.js', abortMoment);
    await page.click('.dzg-popup .dzg-fretry');
    const widget = await page.waitForSelector('.dzg-popup .dzg-fdate .tz-field', { timeout: 10000 }).then(() => true, () => false);
    const retried = await S(page);
    console.log(`note ${name}: failed fetches of the chunk before Retry: ${failedFetches}`);
    check(name, 'dates: once the network is back, Retry re-imports the chunk and shows the field (no alert)', widget && !retried.alert, { widget, retried, failedFetches });
    check(name, 'no page error dates chunks', errors.filter((e) => !/unreachable|Failed to fetch|ERR_FAILED/.test(e)).length === 0, errors);
    await page.close();
  }
  // dates=fail: the failure message from the start, axe 0, Escape closes.
  {
    const { page, errors } = await load(ctx, 'locale=ar-DZ&dir=rtl&theme=dark&rows=200&filters=1&popup=1&dates=fail');
    await openOn(page, 'day');
    await page.waitForSelector('.dzg-popup .dzg-fdate [role=alert]', { timeout: 10000 });
    const s = await S(page);
    const v = await axe(page);
    await page.keyboard.press('Escape');
    const closed = !(await S(page)).open;
    check(name, 'dates=fail (ar, dark): the failure said in Arabic with Retry, axe 0, Escape closes', s.alert?.startsWith('تعذر') && v.length === 0 && closed, { s, v, closed });
    check(name, 'no page error dates=fail', errors.filter((e) => !/unreachable/.test(e)).length === 0, errors);
    await page.close();
  }
}

/** Step 15: the value list (docs/behaviors/filter-set.md): 2 000 values, windowed, keys, RTL, forced colours. */
async function setChecks(name, ctx) {
  const cases = [
    ['locale=fr-FR&theme=light&rows=4000&filters=1&popup=1&sets=1', false, 'Filtre Commune'],
    ['locale=ar-DZ&dir=rtl&theme=dark&rows=4000&filters=1&popup=1&sets=1', true, 'مرشح البلدية'],
  ];
  const S = (page) => page.evaluate(() => {
    const pop = document.querySelector('.dzg-popup');
    const list = pop?.querySelector('[role=listbox]');
    const opts = [...(list?.querySelectorAll('[role=option]') ?? [])];
    const a = document.activeElement;
    return {
      open: !!pop, label: pop?.getAttribute('aria-label'), layer: !!pop?.matches(':popover-open'), options: opts.length, nodes: pop?.querySelectorAll('*').length ?? 0,
      setsize: opts[0]?.getAttribute('aria-setsize'), active: a?.getAttribute('role') === 'option' ? Number(a.getAttribute('aria-posinset')) : null,
      inPopup: !!pop?.contains(a), status: pop?.querySelector('.dzg-fstatus')?.textContent ?? null,
      listH: list?.getBoundingClientRect().height, rect: pop && (({ left, right, top, bottom }) => ({ left, right, top, bottom }))(pop.getBoundingClientRect()),
    };
  });
  const openOn = async (page, c) => {
    const ms = await page.evaluate(async (c) => {
      const t0 = performance.now();
      document.querySelector(`.dzg-hcell[role=columnheader][data-col="${c}"] > .dzg-fbtn`).click();
      while (!document.querySelector('.dzg-popup [role=option]')) await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
      return performance.now() - t0;
    }, c);
    await frames(page);
    return ms;
  };
  for (const [qs, rtl, popName] of cases) {
    const { page, errors } = await load(ctx, qs);
    const tag = `sets ${qs}`;
    const noButton = await page.evaluate(() => !document.querySelector('.dzg-hcell[data-col="status"] > .dzg-fbtn') && !!document.querySelector('.dzg-hcell[data-col="commune"] > .dzg-fbtn'));
    check(name, `${tag}: the explicit set column has a filter button, the enum column none (owner Q2)`, noButton);
    // First open loads the chunk; the second is the one timed.
    await openOn(page, 'commune');
    await page.keyboard.press('Escape');
    const ms = await openOn(page, 'commune');
    const s0 = await S(page);
    let v = await axe(page);
    console.log(`note ${name}: ${tag}: open with ~2 000 values ${ms.toFixed(1)} ms, ${s0.options} options, ${s0.nodes} nodes in the popup`);
    check(name, `${tag}: the popup (${popName}) opens in the top layer, ≤ 40 options drawn of ${s0.setsize}, axe 0`, s0.open && s0.label === popName && s0.layer && s0.options <= 40 && Number(s0.setsize) >= 1990 && v.length === 0, { s0, v });
    // The list scrolled half way: axe 0, the options there.
    await page.evaluate(() => { const l = document.querySelector('.dzg-popup [role=listbox]'); l.scrollTop = l.scrollHeight / 2; });
    await frames(page);
    v = await axe(page);
    const mid = await page.evaluate(() => [...document.querySelectorAll('.dzg-popup [role=option]')].map((o) => Number(o.getAttribute('aria-posinset'))));
    check(name, `${tag}: scrolled half way, the options there are drawn (posinset ~1 000), axe 0`, mid.some((p) => p > 900 && p < 1100) && mid.length <= 40 && v.length === 0, { mid: mid.slice(0, 5), v });
    // Keys: into the list, End, then back Home and PageDown to the end.
    await page.focus('.dzg-popup input.dzg-fsearch');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    const atEnd = await S(page);
    await page.keyboard.press('Home');
    let pd = 0;
    for (; pd < 400 && (await S(page)).active < Number(atEnd.setsize); pd++) await page.keyboard.press('PageDown');
    const walked = await S(page);
    check(name, `${tag}: End reaches the last option; PageDown walks there too (${pd} presses), the focus kept on an option`, atEnd.active === Number(atEnd.setsize) && walked.active === Number(atEnd.setsize) && walked.inPopup, { atEnd, walked, pd });
    // The focused option kept while the wheel scrolls far away.
    await page.keyboard.press('Home');
    const box = await page.evaluate(() => { const r = document.querySelector('.dzg-popup [role=listbox]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(box.x, box.y);
    for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 2000);
    await frames(page, 3);
    const kept = await page.evaluate(() => ({ role: document.activeElement?.getAttribute('role'), pos: document.activeElement?.getAttribute('aria-posinset'), on: document.activeElement?.isConnected }));
    await page.keyboard.press('ArrowDown');
    const next = await S(page);
    check(name, `${tag}: after a long wheel scroll the focused option is still there and focused; ArrowDown goes to 2`, kept.role === 'option' && kept.pos === '1' && kept.on && next.active === 2, { kept, next });
    // Row geometry: 1.75rem rows, ≥ 24 px, one under the other; RTL: the box at the inline start (right).
    const geo = await page.evaluate(() => {
      const o = [...document.querySelectorAll('.dzg-popup [role=option]')].sort((a, b) => a.getAttribute('aria-posinset') - b.getAttribute('aria-posinset'));
      const a = o[0].getBoundingClientRect(), b = o[1].getBoundingClientRect();
      const bx = o[0].querySelector('.dzg-box').getBoundingClientRect(), ct = o[0].querySelector('.dzg-fcount').getBoundingClientRect();
      return { h: a.height, step: b.top - a.top, boxLeft: bx.left - a.left, boxRight: a.right - bx.right, countLeft: ct.left - a.left, countRight: a.right - ct.right };
    });
    const sideOk = rtl ? geo.boxRight < geo.boxLeft && geo.countLeft < geo.countRight : geo.boxLeft < geo.boxRight && geo.countRight < geo.countLeft;
    check(name, `${tag}: rows ≥ 24 px, placed one under the other; the box at the inline start, the count at the end${rtl ? ' (right to left)' : ''}`, geo.h >= 24 && Math.abs(geo.step - geo.h) < 1 && sideOk, geo);
    // Forced colours: a ticked option keeps its check mark (a glyph), an unticked one has none.
    await page.emulateMedia({ forcedColors: 'active' });
    await page.keyboard.press('Home');
    await page.keyboard.press(' ');
    const fc = await page.evaluate(() => {
      const o = [...document.querySelectorAll('.dzg-popup [role=option]')];
      const mark = (x) => x && getComputedStyle(x.querySelector('.dzg-box'), '::before').content;
      return { on: mark(o.find((x) => x.getAttribute('aria-selected') === 'true')), off: mark(o.find((x) => x.getAttribute('aria-selected') === 'false')) };
    });
    check(name, `${tag}: forced colours: the ticked box shows its check mark, the unticked none`, fc.on === '"✓"' && (fc.off === 'none' || fc.off === 'normal'), fc);
    await page.screenshot({ path: `${OUT}/${name}-sets-${qs.replace(/[&=]/g, '_')}.png`, clip: { x: 0, y: 0, width: 1000, height: 640 } });
    await page.emulateMedia({ forcedColors: 'none' });
    await page.keyboard.press('Escape');
    // Twice the root font (the rows are rem): measured again on the next open, still one under the other.
    await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
    await openOn(page, 'commune');
    const big = await page.evaluate(() => {
      const o = [...document.querySelectorAll('.dzg-popup [role=option]')].sort((a, b) => a.getAttribute('aria-posinset') - b.getAttribute('aria-posinset'));
      const a = o[0].getBoundingClientRect(), b = o[1].getBoundingClientRect();
      return { h: a.height, step: b.top - a.top };
    });
    check(name, `${tag}: at twice the root font the rows grow (≥ 48 px) and do not overlap`, big.h >= 48 && Math.abs(big.step - big.h) < 1, big);
    await page.keyboard.press('Escape');
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    check(name, `no page error ${tag}`, errors.length === 0, errors);
    await page.close();
  }
  // Arabic-Indic digits in the counts (ar-EG, numerals=locale).
  {
    const { page, errors } = await load(ctx, 'locale=ar-EG&dir=rtl&rows=4000&filters=1&popup=1&sets=1&numerals=locale');
    await openOn(page, 'commune');
    const c = await page.evaluate(() => document.querySelector('.dzg-popup .dzg-fcount')?.getAttribute('data-n'));
    check(name, 'sets ar-EG numerals=locale: the counts in Arabic-Indic digits', /^[٠-٩]+$/.test(c ?? ''), c);
    check(name, 'no page error sets ar-EG', errors.length === 0, errors);
    await page.close();
  }
  // A chunk that arrives late, then setfail=1.
  {
    const { page, errors } = await load(ctx, 'locale=fr-FR&rows=400&filters=1&popup=1&sets=1');
    let release;
    const late = new Promise((r) => (release = r));
    await page.route('**/filters/set/index.js', async (route) => { await late; await route.continue(); });
    await page.click('.dzg-hcell[role=columnheader][data-col="commune"] > .dzg-fbtn');
    await frames(page);
    const loading = await page.evaluate(() => ({ text: document.querySelector('.dzg-popup .dzg-fset [role=status]')?.textContent, busy: document.querySelector('.dzg-popup .dzg-fset')?.getAttribute('aria-busy') }));
    const v = await axe(page);
    release();
    await page.waitForSelector('.dzg-popup [role=option]', { timeout: 15000 });
    await frames(page);
    const s = await S(page);
    const inWin = s.rect.top >= 0 && s.rect.bottom <= 760 && s.rect.left >= 0 && s.rect.right <= 1000;
    check(name, 'sets: a late chunk shows the loading line (aria-busy, axe 0), then the list, the popup placed again inside the window', loading.text === 'Chargement…' && loading.busy === 'true' && v.length === 0 && inWin, { loading, v, s });
    check(name, 'no page error sets late chunk', errors.length === 0, errors);
    await page.close();
  }
  {
    const { page, errors } = await load(ctx, 'locale=ar-DZ&dir=rtl&theme=dark&rows=400&filters=1&popup=1&sets=1&setfail=1');
    await page.click('.dzg-hcell[role=columnheader][data-col="commune"] > .dzg-fbtn');
    await page.waitForSelector('.dzg-popup .dzg-fset [role=alert]', { timeout: 10000 });
    const alert = await page.evaluate(() => document.querySelector('.dzg-popup [role=alert]')?.textContent);
    const v = await axe(page);
    await page.keyboard.press('Escape');
    const closed = await page.evaluate(() => !document.querySelector('.dzg-popup'));
    check(name, 'setfail=1 (ar, dark): the failure said in Arabic with Retry, axe 0, Escape closes', alert?.startsWith('تعذر') && v.length === 0 && closed, { alert, v, closed });
    check(name, 'no page error setfail=1', errors.filter((e) => !/unreachable/.test(e)).length === 0, errors);
    await page.close();
  }
}

/** Step 16: the quick search box, the page's own field bound with quickSearch() (docs/behaviors/quick-search-box.md). */
async function searchChecks(name, ctx) {
  const cases = [
    // [query, its trimmed folded twin to type in upper case or with marks, the city it finds, the count said]
    ['locale=fr-FR&theme=light&rows=2000&search=1', '  SETIF ', 'Sétif', /^333 lignes$/],
    ['locale=ar-DZ&dir=rtl&theme=dark&rows=2000&search=1', 'قُسَنْطِينَة', 'قسنطينة', /^(333|٣٣٣) /],
  ];
  const S = (page) => page.evaluate(() => {
    const q = document.getElementById('q');
    const grid = document.querySelector('[role=grid]');
    const a = document.activeElement;
    return {
      value: q.value, quick: window.t.grid.kernel.query.quick, shown: window.t.grid.kernel.rows.displayed.count,
      controls: q.getAttribute('aria-controls'), gridId: grid.id, dir: q.getAttribute('dir'), rtl: q.matches(':dir(rtl)'),
      inBox: a === q, inGrid: grid.contains(a), live: document.querySelector('.dzg-live').textContent,
      noMatch: !document.querySelector('.dzg-overlay').hidden,
    };
  });
  const expected = (page, city) => page.evaluate((city) => window.t.rows.filter((r) => r.city === city).length, city);
  for (const [qs, typed, city, said] of cases) {
    const { page, errors } = await load(ctx, qs);
    const tag = `search ${qs}`;
    const s0 = await S(page);
    let v = await axe(page);
    check(name, `${tag}: the page's field is bound (aria-controls = the grid's id, dir=auto), axe 0`, s0.controls && s0.controls === s0.gridId && s0.dir === 'auto' && v.length === 0, { s0, v });
    // Typed (real keys), a pause: the folded rows, the count said once, axe 0.
    await page.focus('#q');
    await page.keyboard.type(typed);
    const early = await S(page);
    await page.waitForTimeout(400);
    const s1 = await S(page);
    const want = await expected(page, city);
    v = await axe(page);
    check(name, `${tag}: "${typed.trim()}" finds the ${want} rows of ${city} after the pause (not before), "${s1.live}" said, axe 0`, early.quick === '' && s1.quick === typed.trim() && s1.shown === want && want > 0 && said.test(s1.live) && v.length === 0, { early, s1, want, v });
    await page.screenshot({ path: `${OUT}/${name}-search-${qs.replace(/[&=]/g, '_')}.png`, clip: { x: 0, y: 0, width: 1000, height: 640 } });
    // Escape: emptied, every row, focus kept in the field.
    await page.keyboard.press('Escape');
    await frames(page);
    const s2 = await S(page);
    check(name, `${tag}: Escape empties the field, shows every row, keeps focus`, s2.value === '' && s2.quick === '' && s2.shown === 2000 && s2.inBox, s2);
    // Enter applies at once; nothing matching shows the overlay.
    await page.keyboard.type('zzzz');
    await page.keyboard.press('Enter');
    const s3 = await S(page);
    await page.waitForTimeout(100);
    const s3b = await S(page);
    check(name, `${tag}: Enter applies at once (no pause); nothing matching: 0 rows and the overlay`, s3.quick === 'zzzz' && s3.shown === 0 && s3b.noMatch && /^0 /.test(s3b.live), { s3, s3b });
    // dir=auto: an Arabic query is laid out right to left, a Latin one left to right, whatever the page.
    await page.fill('#q', 'مريض');
    const rtl = (await S(page)).rtl;
    await page.fill('#q', 'Patient');
    const ltr = !(await S(page)).rtl;
    check(name, `${tag}: dir=auto follows the text (Arabic right to left, Latin left to right)`, rtl && ltr, { rtl, ltr });
    // ArrowDown: into the grid.
    await page.keyboard.press('ArrowDown');
    await frames(page);
    const s4 = await S(page);
    check(name, `${tag}: ArrowDown moves focus into the grid; leaving applied the field's text`, s4.inGrid && s4.quick === 'Patient', s4);
    // An input method (CDP composition): nothing applies mid-composition; its end applies after the pause.
    await page.fill('#q', '');
    await page.keyboard.press('Enter');
    await page.focus('#q');
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: 'مَ', selectionStart: 1, selectionEnd: 1 });
    await page.waitForTimeout(400);
    const mid = await S(page);
    await cdp.send('Input.insertText', { text: 'مَرِيض' });
    await page.waitForTimeout(400);
    const end = await S(page);
    await cdp.detach();
    check(name, `${tag}: inside a composition nothing applies; after it, the composed text after the pause`, mid.quick === '' && end.quick === 'مَرِيض', { mid, end });
    // Safari's last Enter after the composition's end (key code 229): ignored, in the search box and the floating box.
    const late = await page.evaluate(() => {
      const q = document.getElementById('q');
      q.value = 'Patient 1';
      q.dispatchEvent(new InputEvent('input', { bubbles: true }));
      const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      Object.defineProperty(e, 'keyCode', { value: 229 });
      q.dispatchEvent(e);
      return { prevented: e.defaultPrevented, quick: window.t.grid.kernel.query.quick };
    });
    check(name, `${tag}: Enter reported as key code 229 applies nothing at once`, !late.prevented && late.quick === 'مَرِيض', late);
    check(name, `no page error ${tag}`, errors.length === 0, errors);
    await page.close();
  }
  // The floating box, the same Safari Enter (key code 229) and Escape: nothing applied, focus kept.
  {
    const { page, errors } = await load(ctx, 'locale=fr-FR&rows=2000&filters=1&floating=1&search=1');
    const r = await page.evaluate(() => {
      const cell = document.querySelector('.dzg-hextra[data-col="name"]');
      cell.focus();
      cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      const i = cell.querySelector('input');
      i.value = 'Patient 1';
      i.dispatchEvent(new InputEvent('input', { bubbles: true }));
      const k = (key) => {
        const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        Object.defineProperty(e, 'keyCode', { value: 229 });
        i.dispatchEvent(e);
      };
      k('Enter');
      k('Escape');
      return { filter: window.t.grid.kernel.query.filter.name ?? null, focus: document.activeElement === i };
    });
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => window.t.grid.kernel.query.filter.name ?? null);
    check(name, 'search + floating (fr): the floating box ignores Enter and Escape of key code 229 (applied after its pause, focus kept)', r.filter === null && r.focus && after?.value === 'Patient 1', { r, after });
    // With filters: one coherent last sentence.
    await page.focus('#q');
    await page.keyboard.type('Patient 12');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const live = await page.evaluate(() => ({ live: document.querySelector('.dzg-live').textContent, shown: window.t.grid.kernel.rows.displayed.count }));
    check(name, 'search + floating (fr): search and filter AND together, the count said last is the rows shown', new RegExp(`^${live.shown} ligne`).test(live.live), live);
    check(name, 'no page error search + floating', errors.length === 0, errors);
    await page.close();
  }
  // Warm-up: the first focus prepares the search in idle time; the first search then builds nothing (100 000 rows).
  {
    const { page, errors } = await load(ctx, 'locale=fr-FR&rows=100000&search=1');
    const before = await page.evaluate(() => window.t.grid.kernel.rows.diagnostics.foldBuilds);
    await page.waitForTimeout(1500);
    const idleAtLoad = await page.evaluate(() => window.t.grid.kernel.rows.diagnostics.foldBuilds);
    await page.focus('#q');
    await page.waitForTimeout(3000);
    const r = await page.evaluate(() => {
      const d = window.t.grid.kernel.rows.diagnostics;
      const b = d.foldBuilds;
      const t0 = performance.now();
      window.t.grid.kernel.dispatch({ type: 'quick.set', text: 'patient 4242' }, 'user');
      return { ms: performance.now() - t0, built: d.foldBuilds - b, shown: window.t.grid.kernel.rows.displayed.count };
    });
    console.log(`note ${name}: search after the warm-up on 100 000 rows: ${r.ms.toFixed(1)} ms, ${r.shown} rows`);
    check(name, 'search warm-up: nothing prepared at load; after the first focus the first search builds nothing', idleAtLoad === before && r.built === 0 && r.shown >= 1, { before, idleAtLoad, r });
    check(name, 'no page error search warm-up', errors.length === 0, errors);
    await page.close();
  }
}

/** Step 17: the pagination footer (docs/behaviors/pagination-footer.md), French light in the browser, Arabic dark by cursor. */
async function pagingChecks(name, ctx) {
  const F = (page) => page.evaluate(() => {
    const f = document.querySelector('.dzg-footer');
    const r = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
    const btn = (go) => f.querySelector(`[data-go="${go}"]`);
    const before = (go) => btn(go) && getComputedStyle(btn(go), '::before').rotate;
    return {
      first: btn('first') && r(btn('first')), next: r(btn('next')), last: btn('last') && r(btn('last')),
      rot: { first: before('first'), next: before('next') },
      targets: [...f.querySelectorAll('button:not([hidden]), select')].filter((e) => e.offsetParent).map((e) => { const b = e.getBoundingClientRect(); return Math.min(b.width, b.height); }),
      page: f.querySelector('.dzg-ppage').textContent, count: f.querySelector('.dzg-pcount').textContent,
      lives: document.querySelectorAll('.dzg [aria-live]').length, grids: document.querySelectorAll('.dzg').length,
      navs: [...document.querySelectorAll('.dzg-footer nav')].map((n) => n.getAttribute('aria-label')),
      footer: r(f), fScroll: f.scrollWidth - f.clientWidth, docScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      active: document.activeElement?.dataset?.go ?? document.activeElement?.tagName, live: document.querySelector('.dzg-live').textContent,
      index: window.t.grid.kernel.rows.page.index, fetches: window.t.served.fetches,
    };
  });
  // [query, rtl, the count's first words]
  for (const [qs, rtl] of [['locale=fr-FR&theme=light&rows=2000&paging=client&two=1', false], ['locale=ar-DZ&dir=rtl&theme=dark&rows=2000&paging=cursor&delay=300&two=1', true]]) {
    const { page, errors } = await load(ctx, qs);
    const tag = `paging ${qs}`;
    if (rtl) await page.waitForFunction(() => window.t.grid.kernel.rows.status.phase === 'idle');
    await frames(page);
    const s0 = await F(page);
    let v = await axe(page);
    check(name, `${tag}: axe 0 with two grids; two distinct nav names; one live region per grid`, v.length === 0 && s0.navs.length === 2 && s0.navs[0] !== s0.navs[1] && s0.lives === s0.grids, { v, navs: s0.navs, lives: s0.lives });
    // First at the inline start: left in French, right in Arabic; the chevrons turned the other way.
    const startFirst = rtl ? s0.first.l > s0.next.r : s0.first.r < s0.next.l;
    check(name, `${tag}: first page at the inline start, chevrons mirrored (${s0.rot.first} / ${s0.rot.next})`, startFirst && s0.rot.first === (rtl ? '45deg' : '-45deg') && s0.rot.next === (rtl ? '-135deg' : '135deg'), s0);
    check(name, `${tag}: targets at least 24 px; ${rtl ? 'no last button by cursor, "' + s0.page + '"' : 'a last button'}`, s0.targets.every((x) => x >= 24) && (rtl ? s0.last === null && !/ من /.test(s0.page) : s0.last !== null), s0);
    // Digits not reversed: "50" reads 5 then 0 in the reading order of the line, whatever the direction.
    const digits = await page.evaluate(() => {
      const t = document.querySelector('.dzg-pcount').firstChild;
      const i = t.data.indexOf('50');
      const at = (k) => { const r = document.createRange(); r.setStart(t, k); r.setEnd(t, k + 1); return r.getBoundingClientRect().left; };
      return i < 0 ? null : { five: at(i), zero: at(i + 1), text: t.data };
    });
    check(name, `${tag}: the count "${digits?.text}": digits not reversed`, digits && digits.five < digits.zero, digits);
    if (!rtl) {
      // A hidden footer button is really hidden ([hidden] after the buttons' display rule, review R1).
      const vis = async () => { await frames(page); return page.evaluate(() => { const b = document.querySelector('.dzg-footer [data-act=all]'); return { hidden: b.hidden, shown: b.offsetParent !== null }; }); };
      await page.evaluate(() => { const d = window.t.grid.kernel.rows.displayed; window.t.grid.kernel.dispatch({ type: 'selection.toggle', row: d.keyAt(d.index(0)) }, 'user'); });
      const one = await vis();
      await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'selection.all' }, 'user'));
      const pageAll = await vis();
      await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'selection.clear' }, 'user'));
      check(name, `${tag}: "Select all N rows" hidden (one row ticked), shown once the page is ticked`, one.hidden && !one.shown && !pageAll.hidden && pageAll.shown, { one, pageAll });
    }
    // Next: one click; on the server the request leaves in the click's own task, the page at once, the sentence at the answer.
    const n = await page.evaluate(() => {
      const before = window.t.served.fetches;
      document.querySelector('.dzg-footer [data-go="next"]').click();
      return { asked: window.t.served.fetches - before, index: window.t.grid.kernel.rows.page.index };
    });
    await page.focus('.dzg-footer [data-go="next"]');
    await page.waitForTimeout(rtl ? 600 : 150);
    const s1 = await F(page);
    check(name, `${tag}: next ${rtl ? 'asks in the click\'s frame, ' : ''}moves to page 2, focus stays, "${s1.live}" said`, n.index === 1 && (!rtl || n.asked === 1) && s1.index === 1 && /^(Page 2 sur|الصفحة 2)/.test(s1.live), { n, s1 });
    await page.screenshot({ path: `${OUT}/${name}-paging-${qs.replace(/[&=]/g, '_')}.png` });
    // The keyboard: Enter on the focused Next, focus kept on it.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(rtl ? 600 : 150);
    const s2 = await F(page);
    check(name, `${tag}: Enter on Next: page 3, focus kept on Next`, s2.index === 2 && s2.active === 'next', s2);
    // The overlay stops above the footer; Tab goes grid -> retry -> footer.
    await page.evaluate(() => window.t.grid.update({ overlay: 'error' }));
    await frames(page);
    const ov = await page.evaluate(() => ({ o: document.querySelector('.dzg-overlay').getBoundingClientRect().bottom, f: document.querySelector('.dzg-footer').getBoundingClientRect().top }));
    await page.evaluate(() => { const d = window.t.grid.kernel.rows.displayed; window.t.grid.api.focusCell(d.keyAt(d.index(0)), 'name'); });
    await frames(page);
    await page.keyboard.press('Tab');
    const t1 = await page.evaluate(() => document.activeElement.closest('.dzg-overlay') ? 'retry' : document.activeElement.className);
    await page.keyboard.press('Tab');
    const t2 = await page.evaluate(() => !!document.activeElement.closest('.dzg-footer'));
    check(name, `${tag}: the overlay stops above the footer; Tab: grid, retry, footer`, ov.o <= ov.f + 0.5 && t1 === 'retry' && t2, { ov, t1, t2 });
    await page.evaluate(() => window.t.grid.update({ overlay: null }));
    v = await axe(page);
    check(name, `${tag}: axe 0 after paging`, v.length === 0, v);
    // 320 px wide: the strip wraps, nothing scrolls sideways.
    await page.setViewportSize({ width: 320, height: 640 });
    await page.evaluate(() => { document.getElementById('host').style.inlineSize = '100%'; });
    await frames(page);
    const narrow = await F(page);
    check(name, `${tag}: at 320 px the footer wraps, no sideways scroll`, narrow.fScroll <= 0 && narrow.docScroll <= 0 && narrow.footer.w <= 320, narrow);
    await page.screenshot({ path: `${OUT}/${name}-paging-320-${qs.replace(/[&=]/g, '_')}.png` });
    check(name, `no page error ${tag}`, errors.length === 0, errors);
    await page.close();
  }
}

/** Step 20: the ready cell parts, a badge over every tone and yes/no (docs/behaviors/badge-boolean.md). */
async function partsChecks(name, ctx) {
  const cases = [
    ['locale=fr-FR&theme=light&rows=600&parts=1&box=1', false, ['Terminé', 'À lire', 'En attente', 'En retard', 'Ouvert'], ['Oui', 'Non']],
    ['locale=ar-DZ&dir=rtl&theme=dark&rows=600&parts=1&box=1', true, ['منتهٍ', 'للقراءة', 'معلّق', 'متأخر', 'مفتوح'], ['نعم', 'لا']],
  ];
  const GLYPHS = ['✓', 'i', '!', '✕', null];
  for (const [qs, rtl, labels, yesNo] of cases) {
    const { page, errors } = await load(ctx, qs);
    const tag = `parts ${rtl ? 'ar rtl dark' : 'fr ltr light'}`;
    // Rows 0 to 5 (aria-rowindex 2 to 7): done, info, held, late, open, blank; seen: yes, no, blank.
    const cells = await page.evaluate(() => [2, 3, 4, 5, 6, 7].map((r) => {
      const c = (col) => document.querySelector(`.dzg-row[aria-rowindex="${r}"] [data-col="${col}"]`);
      const s = c('state'), b = s.querySelector('.dzg-badge'), g = s.querySelector('.dzg-glyph'), l = b?.lastElementChild;
      const gr = g?.getBoundingClientRect(), lr = l?.getBoundingClientRect();
      return {
        tone: b?.dataset.tone ?? null, glyph: g?.textContent ?? null, hidden: g?.getAttribute('aria-hidden') ?? null, label: l?.textContent ?? null, empty: s.childNodes.length === 0,
        glyphStart: gr && lr ? (getComputedStyle(s).direction === 'rtl' ? gr.left >= lr.right - 1 : gr.right <= lr.left + 1) : null,
        border: b && getComputedStyle(b).borderInlineStartColor, glyphColour: g && getComputedStyle(g).color, labelColour: l && getComputedStyle(l).color, bg: b && getComputedStyle(b).backgroundColor,
        seen: c('seen').textContent, seenGlyph: c('seen').querySelector('.dzg-glyph')?.getAttribute('aria-hidden') ?? null,
      };
    }));
    const tones = cells.map((c) => c.tone);
    check(name, `${tag}: the five tones and a blank, each with its shape, the label after it`, JSON.stringify(tones) === JSON.stringify(['success', 'info', 'warning', 'danger', 'neutral', null]) && cells.slice(0, 5).every((c, i) => c.glyph === GLYPHS[i] && c.label === labels[i] && (c.glyph === null || (c.hidden === 'true' && c.glyphStart))) && cells[5].empty, cells);
    check(name, `${tag}: the frame and the shape in the tone colour, the label in the text colour, distinct surfaces per tone`, cells.slice(0, 5).every((c) => c.border === (c.glyph ? c.glyphColour : c.border) && c.labelColour !== c.border) && new Set(cells.slice(0, 5).map((c) => c.bg)).size === 5, cells);
    check(name, `${tag}: yes/no reads ✓ ${yesNo[0]}, ✗ ${yesNo[1]}, blank; its glyph hidden`, cells[0].seen === `✓${yesNo[0]}` && cells[1].seen === `✗${yesNo[1]}` && cells[2].seen === '' && cells[0].seenGlyph === 'true', cells.map((c) => c.seen));
    // The accessible names: the label only, never the shape or the tone.
    const snap = async (r, col) => page.locator(`.dzg-row[aria-rowindex="${r}"] [data-col="${col}"]`).ariaSnapshot();
    const names = { done: await snap(2, 'state'), late: await snap(5, 'state'), yes: await snap(2, 'seen'), no: await snap(3, 'seen') };
    const clean = (s, word) => s.includes(word) && !/[✓✕✗!]|success|danger|warning/.test(s);
    check(name, `${tag}: the cells' accessible names carry the label and no shape (${labels[0]}, ${yesNo[0]})`, clean(names.done, labels[0]) && clean(names.late, labels[3]) && clean(names.yes, yesNo[0]) && clean(names.no, yesNo[1]), names);
    let v = await axe(page);
    check(name, `${tag}: axe 0 with every tone and yes/no shown`, v.length === 0, v);
    // Selected and hovered rows.
    await page.evaluate(() => { for (const i of [0, 3]) window.t.grid.kernel.dispatch({ type: 'selection.toggle', row: window.t.key(i) }, 'user'); });
    await page.hover('.dzg-row[aria-rowindex="4"] [data-col="state"]');
    await frames(page);
    v = await axe(page);
    const sel = await page.evaluate(() => getComputedStyle(document.querySelector('.dzg-row[aria-rowindex="2"]')).backgroundColor !== getComputedStyle(document.querySelector('.dzg-row[aria-rowindex="3"]')).backgroundColor);
    check(name, `${tag}: axe 0 with selected and hovered rows over badges`, v.length === 0 && sel, { v, sel });
    // A badge survives a scroll, the focus kept on its cell.
    await page.evaluate(() => window.t.grid.api.focusCell(window.t.key(3), 'state'));
    await frames(page);
    const before = await page.evaluate(() => { window.t.kept = document.activeElement.querySelector('.dzg-badge'); return { col: document.activeElement.dataset.col, tone: window.t.kept?.dataset.tone }; });
    await page.evaluate(() => window.t.scrollTo(400 * 32));
    await frames(page, 3);
    await page.evaluate(() => window.t.scrollTo(410 * 32));
    await frames(page, 3);
    const after = await page.evaluate(() => ({ same: document.activeElement.querySelector('.dzg-badge') === window.t.kept, connected: window.t.kept.isConnected, tone: window.t.kept.dataset.tone, text: window.t.kept.textContent, col: document.activeElement.dataset.col }));
    check(name, `${tag}: a focused badge survives a scroll, the focus kept on its cell, the same element`, before.col === 'state' && before.tone === 'danger' && after.same && after.connected && after.tone === 'danger' && after.text === `✕${labels[3]}` && after.col === 'state', { before, after });
    // Scrolled rows rebind: each mounted row shows its own state.
    const rebound = await page.evaluate((labels) => [...document.querySelectorAll('.dzg-layer > .dzg-row')].filter((r) => r.querySelector('[data-col="state"]')).every((r) => {
      const i = Number(r.getAttribute('aria-rowindex')) - 2;
      const text = r.querySelector('[data-col="state"]').textContent;
      return i % 6 === 5 ? text === '' : text.endsWith(labels[i % 6]);
    }), labels);
    check(name, `${tag}: after the scroll every row's badge is its own`, rebound, null);
    // Forced colours: the frame in the text colour; a screenshot for a person to look at.
    await page.evaluate(() => window.t.scrollTo(0));
    await page.addStyleTag({ path: `${ROOT}packages/theme/contrast.css` });
    await page.emulateMedia({ forcedColors: 'active' });
    await frames(page, 3);
    await page.waitForTimeout(200);
    // Row 0 is selected (the row opts out of the system's colours): its badge takes them all the same.
    const forced = await page.evaluate(() => [2, 3].map((r) => { const b = document.querySelector(`.dzg-row[aria-rowindex="${r}"] .dzg-badge`); const s = getComputedStyle(b); const g = getComputedStyle(b.querySelector('.dzg-glyph')); return { border: s.borderInlineStartColor, colour: s.color, glyph: b.querySelector('.dzg-glyph').textContent, glyphColour: g.color, bg: s.backgroundColor }; }));
    await page.screenshot({ path: `${OUT}/${name}-parts-${rtl ? 'ar' : 'fr'}-forced.png`, clip: { x: 0, y: 0, width: 1000, height: 640 } });
    check(name, `${tag}: forced colours: the frame and the shape in the text colour, on the system's surface, in a selected row too`, forced.every((f) => f.border === f.colour && f.glyphColour === f.colour) && forced[0].glyph === '✓' && forced[1].glyph === 'i' && forced[0].bg === forced[1].bg, forced);
    await page.emulateMedia({ forcedColors: 'none' });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${name}-parts-${rtl ? 'ar' : 'fr'}.png`, clip: { x: 0, y: 0, width: 1000, height: 640 } });
    check(name, `no page error ${tag}`, errors.length === 0, errors);
    await page.close();
  }
}

async function rulesChecks(name, ctx) {
  const cases = [
    ['locale=fr-FR&theme=light&rows=600&rules=1&box=1', false, 'Non sélectionnable : la ligne 4 est cochée', 'Chercher dans Nom', 'Patient 1'],
    ['locale=ar-DZ&dir=rtl&theme=dark&rows=600&rules=1&box=1', true, 'غير قابل للتحديد: الصف 4 محدد', 'البحث في الاسم', 'مريض 1'],
  ];
  for (const [qs, rtl, reason, searchName, typed] of cases) {
    const { page, errors } = await load(ctx, qs);
    const tag = `rules ${rtl ? 'ar rtl dark' : 'fr ltr light'}`;
    // What the live region says, each time it is filled.
    await page.evaluate(() => { window.said = []; new MutationObserver(() => { const t = document.querySelector('.dzg-live').textContent; if (t) window.said.push(t); }).observe(document.querySelector('.dzg-live'), { childList: true, characterData: true, subtree: true }); });
    let v = await axe(page);
    check(name, `${tag}: axe 0 at load`, v.length === 0, v);
    const box = (i) => `.dzg-row[aria-rowindex="${i + 2}"] .dzg-check`;
    await page.click(box(4));
    await frames(page);
    const look = await page.evaluate((sel) => {
      const c = document.querySelector(sel), b = c.querySelector('.dzg-box'), s = getComputedStyle(b);
      const plain = getComputedStyle(document.querySelector('.dzg-row[aria-rowindex="5"] .dzg-box'));
      return { refused: c.hasAttribute('data-dzg-refused'), cursor: getComputedStyle(c).cursor, style: s.borderTopStyle, plainStyle: plain.borderTopStyle, bg: s.backgroundColor, plainBg: plain.backgroundColor, disabled: !!document.querySelector('.dzg-row[aria-disabled], [aria-disabled][role=row]'), selected: c.closest('.dzg-row').getAttribute('aria-selected') };
    }, box(8));
    check(name, `${tag}: row 4 ticked, row 8's box greyed (dashed, raised surface, not-allowed), no aria-disabled`, look.refused && look.cursor === 'not-allowed' && look.style === 'dashed' && look.plainStyle === 'solid' && look.bg !== look.plainBg && !look.disabled && look.selected === 'false', look);
    // Space on row 8: the rule's own sentence, said again on a second try.
    await page.evaluate(() => { window.t.grid.api.focusCell(window.t.key(8), 'name'); window.said.length = 0; });
    await frames(page);
    await page.keyboard.press('Space');
    await page.waitForTimeout(120);
    await page.keyboard.press('Space');
    await page.waitForTimeout(120);
    const said = await page.evaluate(() => ({ said: [...window.said], sel: [...window.t.grid.kernel.selection.keys].map(String) }));
    check(name, `${tag}: Space on row 8 says "${reason}", twice for two tries; row 8 stays unticked`, said.said.filter((x) => x === reason).length === 2 && said.sel.length === 1, said);
    v = await axe(page);
    check(name, `${tag}: axe 0 after a refusal`, v.length === 0, v);
    // Ctrl+A: the allowed rows up to the maximum; the box then reads ticked (the rest refused).
    await page.keyboard.press('ControlOrMeta+a');
    await page.waitForTimeout(120);
    const all = await page.evaluate(() => ({ n: window.t.grid.kernel.selection.keys.size, box: document.querySelector('.dzg-header [role=checkbox]')?.getAttribute('aria-checked'), last: window.said.at(-1) }));
    check(name, `${tag}: Ctrl+A ticks five rows, one partial sentence, the header box ticked`, all.n === 5 && all.box === 'true' && /5/.test(all.last ?? ''), all);
    // A new context repaints the refused look: at most 6 frees the next row.
    const ctxLook = await page.evaluate(async () => {
      const before = document.querySelector('.dzg-row[aria-rowindex="12"] .dzg-check').hasAttribute('data-dzg-refused');
      window.t.grid.update({ context: { max: 6 } });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { before, after: document.querySelector('.dzg-row[aria-rowindex="12"] .dzg-check').hasAttribute('data-dzg-refused') };
    });
    check(name, `${tag}: a new context repaints the greyed boxes`, ctxLook.before && !ctxLook.after, ctxLook);
    // Forced colours: the refused box keeps a mark (GrayText, dashed).
    await page.emulateMedia({ forcedColors: 'active' });
    await page.waitForTimeout(200);
    const forced = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'GrayText';
      document.body.append(probe);
      const gray = getComputedStyle(probe).color;
      probe.remove();
      const b = getComputedStyle(document.querySelector('.dzg-row[aria-rowindex="10"] .dzg-box'));
      return { border: b.borderTopColor, gray, style: b.borderTopStyle };
    });
    await page.screenshot({ path: `${OUT}/${name}-rules-${rtl ? 'ar' : 'fr'}-forced.png`, clip: { x: 0, y: 0, width: 1000, height: 640 } });
    check(name, `${tag}: forced colours: the refused box dashed in GrayText`, forced.border === forced.gray && forced.style === 'dashed', forced);
    await page.emulateMedia({ forcedColors: 'none' });
    // The header's own search box: one tab stop, F2 in, typing, the filter after the pause, Escape out.
    await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'selection.clear' }, 'user'));
    const tabs = await page.evaluate(() => document.querySelector('.dzg-hcell[data-col="name"] input.hsearch').tabIndex);
    await page.focus('.dzg-hcell[data-col="name"]');
    await page.keyboard.press('F2');
    const inBox = await page.evaluate(() => ({ active: document.activeElement.className, name: document.activeElement.getAttribute('aria-label'), dir: getComputedStyle(document.activeElement).direction }));
    await page.keyboard.type(typed);
    const caret = await page.evaluate(() => ({ at: document.activeElement.selectionStart, len: document.activeElement.value.length, quick: window.t.grid.kernel.query.filter.name ?? null }));
    await page.waitForTimeout(400);
    const filtered = await page.evaluate(() => ({ f: window.t.grid.kernel.query.filter.name ?? null, shown: window.t.grid.kernel.rows.displayed.count, live: window.said.at(-1) }));
    v = await axe(page);
    check(name, `${tag}: the header's box is out of the Tab order, F2 enters it ("${searchName}", ${rtl ? 'rtl' : 'ltr'}), the caret at the end`, tabs === -1 && inBox.active === 'hsearch' && inBox.name === searchName && inBox.dir === (rtl ? 'rtl' : 'ltr') && caret.at === caret.len && caret.quick === null, { tabs, inBox, caret });
    check(name, `${tag}: typed "${typed}", the column filtered after the pause (111 rows), said, axe 0`, filtered.f?.value === typed && filtered.shown === 111 && /111/.test(filtered.live ?? '') && v.length === 0, { filtered, v });
    await page.keyboard.press('Escape');
    const out = await page.evaluate(() => ({ col: document.activeElement.dataset.col, cls: document.activeElement.className, value: document.querySelector('input.hsearch').value, tab: document.querySelector('input.hsearch').tabIndex }));
    check(name, `${tag}: Escape comes back to the header, the text kept, out of the Tab order again`, out.col === 'name' && /dzg-hcell/.test(out.cls) && out.value === typed && out.tab === -1, out);
    // Shared with the popup: Alt+ArrowDown opens the column's popup on the typed filter.
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForTimeout(150);
    const pop = await page.evaluate(() => ({ open: !!document.querySelector('.dzg-fpop'), value: document.querySelector('.dzg-fpop input')?.value ?? null }));
    v = await axe(page);
    check(name, `${tag}: the popup opens on the same filter ("${typed}"), axe 0`, pop.open && pop.value === typed && v.length === 0, { pop, v });
    await page.keyboard.press('Escape');
    await page.screenshot({ path: `${OUT}/${name}-rules-${rtl ? 'ar' : 'fr'}.png`, clip: { x: 0, y: 0, width: 1000, height: 640 } });
    check(name, `no page error ${tag}`, errors.length === 0, errors);
    await page.close();
  }
}

/** Step 26: motion with GSAP (docs/behaviors/motion.md), on its own page, against its motion:false twin. */
async function motionChecks(name, ctx) {
  const open = async (qs, o = {}) => {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1000, height: 760 });
    if (o.reduce) await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(site.root(`packages/dom/test/browser/motion.html?${qs}`));
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
    await frames(page, 3);
    return { page, errors };
  };
  // Until every tween and delayed call is over.
  const settle = (page) => page.waitForFunction(() => window.t.running() === 0, null, { timeout: 5000 }).then(() => frames(page, 2));
  const sortBy = (page, dir = 'desc') => page.evaluate((dir) => window.t.grid.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'amount', dir }] }, 'user'), dir);
  const state = (page) => page.evaluate(() => [...document.querySelectorAll('.dzg-layer > .dzg-row')].map((r) => `${r.getAttribute('aria-rowindex')}:${r.querySelector('[data-col="name"]')?.textContent}`));
  for (const [qs, rtl] of [['locale=fr-FR&theme=light', false], ['locale=ar-DZ&theme=dark', true]]) {
    const tag = `motion ${rtl ? 'ar rtl dark' : 'fr ltr light'}`;
    const { page, errors } = await open(qs);
    const twin = await open(`${qs}&motion=0`);
    // A sort: rows glide; no layout read from the change to the end of the tweens (the paint's own reads
    // aside: the twin makes the same); the focus stays on its cell; the order and aria-rowindex are final at once.
    for (const p of [page, twin.page]) {
      await p.evaluate(() => window.t.grid.api.focusCell(window.t.key(3), 'name'));
      await frames(p, 2);
    }
    const before = await page.evaluate(() => ({ focus: document.activeElement?.textContent }));
    const counts = [];
    for (const p of [page, twin.page]) {
      await p.evaluate(() => { window.t.kept = document.activeElement; window.t.reads.rect = 0; window.t.reads.offset = 0; });
      await sortBy(p);
      await frames(p, 2);
      counts.push(await p.evaluate(() => ({ ...window.t.reads, running: window.t.running(), y: [...document.querySelectorAll('.dzg-layer > .dzg-row')].some((r) => (r.style.transform || '').includes('translate')), same: document.activeElement === window.t.kept })));
    }
    const mid = await state(page);
    const midTwin = await state(twin.page);
    await frames(page, 4);
    const during = await page.evaluate(() => ({ ...window.t.reads, same: document.activeElement === window.t.kept }));
    await settle(page);
    const after = await page.evaluate(() => ({ ...window.t.reads, same: document.activeElement === window.t.kept, left: [...document.querySelectorAll('.dzg-row, .dzg-cell')].filter((e) => e.style.transform || e.style.opacity).length }));
    const twinReads = await twin.page.evaluate(() => ({ ...window.t.reads }));
    check(name, `${tag}: a sort glides (y tweens on the rows), its twin does not`, counts[0].running > 0 && counts[0].y && counts[1].running === 0 && !counts[1].y, counts);
    check(name, `${tag}: no getBoundingClientRect / offsetHeight from the sort to the tweens' end beyond the twin's paint`, after.rect === twinReads.rect && after.offset === twinReads.offset && during.rect === counts[0].rect && during.offset === counts[0].offset, { counts, during, after, twinReads });
    check(name, `${tag}: activeElement unchanged across the sort glide`, before.focus && counts[0].same && during.same && after.same, { before, counts, during, after });
    check(name, `${tag}: DOM order and aria-rowindex final at once, equal to the twin's mid-glide`, JSON.stringify(mid) === JSON.stringify(midTwin) && mid.length > 5, { mid: mid.slice(0, 4), midTwin: midTwin.slice(0, 4) });
    check(name, `${tag}: nothing left inline once the glide ends`, after.left === 0, after);
    // A live change: the cell flashes (tint, a mark at its start edge); axe 0 mid-flash; the hook ran.
    const flash = await page.evaluate(async () => {
      const d = window.t.grid.kernel.rows.displayed;
      const k = d.keyAt(d.index(2));
      const row = window.t.grid.kernel.rows.row(k).data;
      window.t.grid.kernel.rows.applyTransaction({ update: [{ ...row, city: `${row.city}*` }] });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const c = document.querySelector('.dzg-cell.dzg-flash');
      if (!c) return null;
      const s = getComputedStyle(c);
      return { col: c.dataset.col, mark: s.borderInlineStartWidth, markColour: s.borderInlineStartColor, bg: s.backgroundColor, rtlMark: s.borderRightWidth, ltrMark: s.borderLeftWidth, v: c.style.getPropertyValue('--dzg-flash') };
    });
    let v = await axe(page);
    check(name, `${tag}: a live change flashes its cell, the mark on the start side (${rtl ? 'right' : 'left'})`, flash && flash.col === 'city' && flash.mark === '3px' && (rtl ? flash.rtlMark === '3px' : flash.ltrMark === '3px'), flash);
    check(name, `${tag}: axe 0 mid-flash`, v.length === 0, v);
    await settle(page);
    // The popup opening: GSAP fades its content in; the focus the popup host moved stays.
    await page.click('.dzg-hcell[data-col="city"] .dzg-fbtn');
    await frames(page, 1);
    const pop = await page.evaluate(() => { const p = document.querySelector('.dzg-popup'); const c = p?.firstElementChild; window.t.inPopup = document.activeElement; return p ? { opacity: Number(getComputedStyle(c).opacity), tweens: window.t.gsap.getTweensOf(c).length, popupTransform: p.style.transform, focusIn: p.contains(document.activeElement) } : null; });
    await page.waitForTimeout(250);
    const popAfter = await page.evaluate(() => ({ same: document.activeElement === window.t.inPopup, opacity: getComputedStyle(document.querySelector('.dzg-popup').firstElementChild).opacity, left: document.querySelector('.dzg-popup').firstElementChild.style.opacity }));
    check(name, `${tag}: the filter popup fades in by GSAP (its content; the popup itself untouched), the focus kept inside`, pop && pop.tweens === 1 && pop.opacity < 1 && pop.popupTransform === '' && pop.focusIn && popAfter.same && popAfter.opacity === '1' && popAfter.left === '', { pop, popAfter });
    await page.keyboard.press('Escape');
    await frames(page, 2);
    check(name, `${tag}: the popup closes at once`, await page.evaluate(() => !document.querySelector('.dzg-popup')), null);
    // The final picture equals the twin's after the same changes.
    await twin.page.evaluate(async () => {
      const d = window.t.grid.kernel.rows.displayed;
      const k = d.keyAt(d.index(2));
      const row = window.t.grid.kernel.rows.row(k).data;
      window.t.grid.kernel.rows.applyTransaction({ update: [{ ...row, city: `${row.city}*` }] });
    });
    for (const p of [page, twin.page]) {
      await p.evaluate(() => window.t.grid.api.focusCell(window.t.key(3), 'name'));
      await p.mouse.move(990, 750);
      await frames(p, 3);
    }
    await settle(page);
    const shots = [await page.locator('#host').screenshot(), await twin.page.locator('#host').screenshot()];
    await page.locator('#host').screenshot({ path: `${OUT}/${name}-motion-${rtl ? 'ar' : 'fr'}.png` });
    check(name, `${tag}: the final screenshot equals the motion:false twin's`, shots[0].equals(shots[1]), { a: shots[0].length, b: shots[1].length });
    check(name, `no page error ${tag}`, errors.length === 0 && twin.errors.length === 0, [...errors, ...twin.errors]);
    await page.close();
    await twin.page.close();

    // The page slide: from the end side for the next page (negative x right to left).
    const paged = await open(`${qs}&paging=1`);
    const x = await paged.page.evaluate(async () => {
      window.t.grid.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return Number(window.t.gsap.getProperty(document.querySelector('.dzg-layer'), 'x'));
    });
    check(name, `${tag}: the next page slides in from the end side (x ${rtl ? '< 0' : '> 0'})`, rtl ? x < 0 : x > 0, x);
    await settle(paged.page);
    check(name, `no page error ${tag}, paged`, paged.errors.length === 0, paged.errors);
    await paged.page.close();
  }
  // A tree (Phase 4 step 6): a parent opened by the key, then closed: the rows below glide (y), the children
  // fade; the focus stays on its cell; order, aria-rowindex and aria-expanded final at once (the twin's); no
  // layout read beyond the twin's paint; the chevron turns by CSS in the focused row only; nothing left after.
  for (const [qs, rtl] of [['locale=fr-FR&theme=light', false], ['locale=ar-DZ&theme=dark', true]]) {
    const tag = `motion tree ${rtl ? 'ar rtl dark' : 'fr ltr light'}`;
    const a = await open(`tree=1&${qs}`);
    const b = await open(`tree=1&${qs}&motion=0`);
    const fwd = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    const toggled = async (key) => {
      const out = [];
      for (const p of [a.page, b.page]) {
        await p.evaluate(() => { window.t.grid.api.focusCell(window.t.key(11), 'name'); });
        await frames(p, 2);
        await p.evaluate(() => { window.t.kept = document.activeElement; window.t.reads.rect = 0; window.t.reads.offset = 0; });
        await p.keyboard.press(key);
        await frames(p, 2);
        out.push(await p.evaluate(() => ({
          running: window.t.running(), reads: { ...window.t.reads }, same: document.activeElement === window.t.kept,
          y: [...document.querySelectorAll('.dzg-layer > .dzg-row')].filter((r) => (r.style.transform || '').includes('translate')).length,
          faded: [...document.querySelectorAll('.dzg-layer > .dzg-row')].filter((r) => r.style.opacity && Number(r.style.opacity) < 1).length,
          rows: [...document.querySelectorAll('.dzg-layer > .dzg-row')].map((r) => `${r.getAttribute('aria-rowindex')}:${r.getAttribute('aria-expanded')}:${r.querySelector('[data-col="name"]')?.textContent}`),
          turn: getComputedStyle(document.activeElement.closest('.dzg-row').querySelector('.dzg-toggle'), '::before').transitionProperty,
          still: [...document.querySelectorAll('.dzg-layer > .dzg-row:not(:focus-within) .dzg-toggle')].map((t) => getComputedStyle(t, '::before').transitionDuration).filter((d) => d !== '0s').length,
        })));
      }
      await settle(a.page);
      const after = await a.page.evaluate(() => ({ reads: { ...window.t.reads }, same: document.activeElement === window.t.kept, left: [...document.querySelectorAll('.dzg-row, .dzg-cell')].filter((e) => e.style.transform || e.style.opacity).length }));
      return { m: out[0], twin: out[1], after };
    };
    const o = await toggled(fwd);
    check(name, `${tag}: ${fwd} opens a parent: the rows below glide (${o.m.y}), the children fade (${o.m.faded}); the twin moves nothing`, o.m.running > 0 && o.m.y > 0 && o.m.faded > 0 && o.twin.running === 0 && o.twin.y === 0, o);
    check(name, `${tag}: opening: focus kept, DOM order / aria-rowindex / aria-expanded equal to the twin's mid-glide, no layout read beyond the twin's, nothing left after`,
      o.m.same && o.after.same && JSON.stringify(o.m.rows) === JSON.stringify(o.twin.rows) && o.m.rows.some((r) => r.includes(':true:')) && o.after.reads.rect === o.twin.reads.rect && o.after.reads.offset === o.twin.reads.offset && o.after.left === 0, o);
    check(name, `${tag}: the chevron turns by CSS in the focused row only (rotate), not in the twin (motion off)`, o.m.turn === 'rotate' && o.m.still === 0 && o.twin.turn !== 'rotate', { m: o.m.turn, still: o.m.still, twin: o.twin.turn });
    const c = await toggled(back);
    check(name, `${tag}: ${back} closes it: the rows below glide up (${c.m.y}), nothing fades; focus and order final at once, nothing left after`,
      c.m.running > 0 && c.m.y > 0 && c.m.faded === 0 && c.m.same && c.after.same && JSON.stringify(c.m.rows) === JSON.stringify(c.twin.rows) && c.after.left === 0, c);
    for (const p of [a.page, b.page]) { await p.mouse.move(990, 750); await frames(p, 3); }
    await settle(a.page);
    const shots = [await a.page.locator('#host').screenshot(), await b.page.locator('#host').screenshot()];
    check(name, `${tag}: the final screenshot equals the motion:false twin's`, shots[0].equals(shots[1]), { a: shots[0].length, b: shots[1].length });
    check(name, `no page error ${tag}`, a.errors.length === 0 && b.errors.length === 0, [...a.errors, ...b.errors]);
    await a.page.close();
    await b.page.close();
  }
  // A tree over about 300 mounted rows (364 parents, nothing open): opening and closing parents, no long animation frame over 50 ms; and
  // under reduced motion a toggle moves nothing.
  {
    const { page, errors } = await open('tree=1&rows=4000&locale=fr-FR&theme=light&tall=1');
    const r = await page.evaluate(async () => {
      const seen = [];
      const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) seen.push(e.duration); });
      po.observe({ type: 'long-animation-frame', buffered: false });
      // At the top more than 60 rows would move (no glide); near the window's end fewer (they glide).
      for (const [id, open] of [[0, true], [2860, true], [2860, false], [2750, true], [0, false]]) {
        window.t.grid.kernel.dispatch({ type: 'rows.expand', rows: [window.t.key(id)], expanded: open }, 'user');
        await new Promise((r) => setTimeout(r, 500));
      }
      po.disconnect();
      return { mounted: document.querySelectorAll('.dzg-layer > .dzg-row').length, max: Math.round(Math.max(0, ...seen)) };
    });
    check(name, `motion tree: toggles over a ${r.mounted}-row window: the longest animation frame ${r.max} ms (under 50)`, r.mounted >= 150 && r.max < 50, r);
    check(name, 'no page error, tree tall window', errors.length === 0, errors);
    await page.close();
    const red = await open('tree=1&locale=fr-FR&theme=light', { reduce: true });
    const moved = await red.page.evaluate(async () => {
      window.t.grid.kernel.dispatch({ type: 'rows.expand', rows: [window.t.key(0)], expanded: true }, 'user');
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { running: window.t.running(), t: [...document.querySelectorAll('.dzg-row')].filter((r) => r.style.transform || r.style.opacity).length, turn: getComputedStyle(document.querySelector('.dzg-toggle'), '::before').transitionDuration };
    });
    check(name, 'motion tree reduced: a toggle moves nothing, fades nothing, the chevron does not turn', moved.running === 0 && moved.t === 0 && moved.turn === '0s', moved);
    check(name, 'no page error, tree reduced motion', red.errors.length === 0, red.errors);
    await red.page.close();
  }
  // Reduced motion (CDP's emulated media): no transform, a still mark held 0.6 s.
  {
    const { page, errors } = await open('locale=fr-FR&theme=light', { reduce: true });
    await sortBy(page);
    await frames(page, 3);
    const moved = await page.evaluate(() => ({ running: window.t.running(), t: [...document.querySelectorAll('.dzg-row')].filter((r) => r.style.transform).length }));
    const marks = await page.evaluate(async () => {
      const d = window.t.grid.kernel.rows.displayed;
      const k = d.keyAt(d.index(2));
      const row = window.t.grid.kernel.rows.row(k).data;
      window.t.grid.kernel.rows.applyTransaction({ update: [{ ...row, city: `${row.city}!` }] });
      const at = (ms) => new Promise((r) => setTimeout(() => { const c = document.querySelector('.dzg-cell.dzg-flash'); r(c ? { v: c.style.getPropertyValue('--dzg-flash'), transform: c.style.transform } : null); }, ms));
      return [await at(100), await at(350), await at(400)];
    });
    check(name, 'motion reduced: a sort moves nothing (no tween, no transform)', moved.running === 0 && moved.t === 0, moved);
    check(name, 'motion reduced: a live change keeps a still mark (--dzg-flash 1) about 0.6 s, then none', marks[0]?.v === '1' && marks[1]?.v === '1' && marks[2] === null, marks);
    check(name, 'no page error, reduced motion', errors.length === 0, errors);
    await page.close();
  }
  // Sorts with about 300 rows mounted: no long animation frame over 50 ms (LoAF); the twin (motion:false)
  // measured the same way, for comparison. Three sorts each, the worst kept.
  {
    const res = [];
    for (const twin of [false, true]) {
      const { page, errors } = await open(`locale=fr-FR&theme=light&tall=1${twin ? '&motion=0' : ''}`);
      res.push(await page.evaluate(async () => {
        const seen = [];
        const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) seen.push(e.duration); });
        po.observe({ type: 'long-animation-frame', buffered: false });
        const mounted = document.querySelectorAll('.dzg-layer > .dzg-row').length;
        for (const dir of ['asc', 'desc', 'asc']) {
          window.t.grid.kernel.dispatch({ type: 'sort.set', sort: [{ column: dir === 'desc' ? 'amount' : 'name', dir }] }, 'user');
          await new Promise((r) => setTimeout(r, 600));
        }
        po.disconnect();
        return { mounted, max: Math.round(Math.max(0, ...seen)), n: seen.length };
      }));
      check(name, `no page error, tall window${twin ? ', twin' : ''}`, errors.length === 0, errors);
      await page.close();
    }
    const [m, t] = res;
    check(name, `motion: sorts over a ${m.mounted}-row window: the longest animation frame ${m.max} ms, the twin's ${t.max} ms (0: none over 50 ms)`, m.mounted >= 250 && m.max < 50, res);
  }
  // A million rows: the sort still glides what it can, and nothing is left.
  {
    const { page, errors } = await open('locale=fr-FR&theme=light&rows=1000000');
    const ms = await page.evaluate(async () => {
      const t0 = performance.now();
      window.t.grid.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'amount', dir: 'desc' }] }, 'user');
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return performance.now() - t0;
    });
    await settle(page);
    const left = await page.evaluate(() => [...document.querySelectorAll('.dzg-row, .dzg-cell')].filter((e) => e.style.transform || e.style.opacity).length);
    check(name, `motion: a sort at 1 000 000 rows paints (${Math.round(ms)} ms) and leaves nothing inline`, left === 0, { ms, left });
    check(name, 'no page error, a million rows', errors.length === 0, errors);
    await page.close();
  }
}

/**
 * The tree (Phase 4 step 4, docs/behaviors/tree-view.md, tree-keys.md, tree-filter.md): French light and
 * Arabic right to left dark. axe 0 closed, open, filtered, with selected and hovered rows; the toggle a
 * 24 px target whose chevron points to the inline end; real keys (mirrored in Arabic); what is said; the
 * focus kept through a collapse on the next frame; forced colours; then a 100 000-row tree opened and scrolled.
 */
async function treeChecks(name, ctx) {
  const open = async (qs) => {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1000, height: 760 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(site.root(`packages/dom/test/browser/tree.html?${qs}`));
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
    await frames(page, 3);
    await page.evaluate(() => { window.said = []; new MutationObserver(() => { const t = document.querySelector('.dzg-live').textContent; if (t) window.said.push(t); }).observe(document.querySelector('.dzg-live'), { childList: true, characterData: true, subtree: true }); });
    return { page, errors };
  };
  const cases = [
    { qs: 'locale=fr-FR&theme=light', rtl: false, tag: 'tree fr ltr light', fwd: 'ArrowRight', back: 'ArrowLeft', opened: 'Service 1 développé, 77 lignes', closed: 'Service 1 réduit' },
    { qs: 'locale=ar-DZ&dir=rtl&theme=dark', rtl: true, tag: 'tree ar rtl dark', fwd: 'ArrowLeft', back: 'ArrowRight', opened: 'تم توسيع Service 1، 77 صفا', closed: 'تم طي Service 1' },
  ];
  const rowOf = (id) => `.dzg-layer > .dzg-row[data-tid="${id}"]`;
  for (const c of cases) {
    const { page, errors } = await open(c.qs);
    // Rows by id, for the checks (the DOM holds no id: tagged here from the kernel's keys).
    const tag = () => page.evaluate(() => {
      const d = window.t.grid.kernel.rows.displayed;
      for (const r of document.querySelectorAll('.dzg-layer > .dzg-row')) {
        const i = Number(r.getAttribute('aria-rowindex')) - 3;
        r.dataset.tid = i >= 0 && i < d.count ? String(d.keyAt(i)).replace(/^d:\d+:/, '') : '';
      }
    });
    await tag();
    const s0 = await page.evaluate(() => {
      const vp = document.querySelector('.dzg-viewport');
      const row = (i) => document.querySelector(`.dzg-layer > .dzg-row[aria-rowindex="${i}"]`);
      const a = (r) => r && ['aria-level', 'aria-posinset', 'aria-setsize', 'aria-expanded'].map((x) => r.getAttribute(x));
      return { role: vp.getAttribute('role'), first: a(row(3)), child: a(row(4)), stops: document.querySelectorAll('.dzg [tabindex="0"]').length };
    });
    let v = await axe(page);
    check(name, `${c.tag}: role treegrid, Service 0 open (level 1, 1 of 100), its first child level 2; one tab stop; axe 0`, s0.role === 'treegrid' && JSON.stringify(s0.first) === '["1","1","100","true"]' && s0.child?.[0] === '2' && s0.stops === 1 && v.length === 0, { s0, v });
    // The toggle: a 24 px target, its chevron to the inline end when closed, down when open.
    // Patient 3 of Service 0 has stays (closed); Service 0 is open, at level 1 (its toggle at the cell's start).
    const tg = await page.evaluate((sel) => {
      const t = document.querySelector(`${sel} .dzg-toggle`);
      const open = document.querySelector('.dzg-layer > .dzg-row[data-tid="s0"] .dzg-toggle');
      const b = t.getBoundingClientRect();
      const o = open.getBoundingClientRect();
      const cell = open.closest('.dzg-cell').getBoundingClientRect();
      const rot = (x) => getComputedStyle(x, '::before').rotate;
      return { w: b.width, h: b.height, rot: rot(t), openRot: rot(open), startGap: document.documentElement.dir === 'rtl' ? cell.right - o.right : o.left - cell.left, indent: Math.abs(b.left - o.left), hidden: t.getAttribute('aria-hidden'), focusable: t.tabIndex };
    }, rowOf('s0p3'));
    check(name, `${c.tag}: the toggle is aria-hidden, not focusable, ≥ 24 × 24 px at the cell's start; chevron ${c.rtl ? '45deg (left)' : '-45deg (right)'} closed, down open`, tg.w >= 24 && tg.h >= 24 && tg.hidden === 'true' && tg.focusable === -1 && tg.rot === (c.rtl ? '45deg' : '-45deg') && tg.openRot === (c.rtl ? '-45deg' : '45deg') && tg.startGap >= 0 && tg.startGap < 16 && Math.abs(tg.indent - 16) < 1, tg);
    // Real keys on Service 1 (closed), in the tree column.
    await page.evaluate(() => window.t.grid.api.focusCell(window.t.key('s1'), 'name'));
    await frames(page);
    const at = () => page.evaluate(() => { const a = document.activeElement; const r = a.closest('.dzg-row'); const d = window.t.grid.kernel.rows.displayed; return `${r ? String(d.keyAt(Number(r.getAttribute('aria-rowindex')) - 3)).replace(/^d:\d+:/, '') : null}/${a.dataset.col}`; });
    await page.keyboard.press(c.fwd);
    await page.waitForTimeout(120);
    const k1 = { at: await at(), exp: await page.evaluate(() => document.activeElement.closest('.dzg-row').getAttribute('aria-expanded')), said: await page.evaluate(() => window.said.at(-1)) };
    await page.keyboard.press(c.fwd);
    await frames(page);
    const k2 = await at();
    await page.keyboard.press(c.back);
    await frames(page);
    await page.keyboard.press(c.back);
    await page.waitForTimeout(120);
    const k3 = { at: await at(), exp: await page.evaluate(() => document.activeElement.closest('.dzg-row').getAttribute('aria-expanded')), said: await page.evaluate(() => window.said.at(-1)) };
    await page.keyboard.press(c.back);
    await frames(page);
    const k4 = await at();
    check(name, `${c.tag}: ${c.fwd} opens Service 1 ("${c.opened}"), again moves to the next column; ${c.back} back, closes ("${c.closed}"), on a closed root does nothing`,
      k1.at === 's1/name' && k1.exp === 'true' && k1.said === c.opened && k2 === 's1/city' && k3.at === 's1/name' && k3.exp === 'false' && k3.said === c.closed && k4 === 's1/name', { k1, k2, k3, k4 });
    // Down into Service 0's children, back to the parent; `*` opens the siblings.
    await page.evaluate(() => window.t.grid.api.focusCell(window.t.key('s0p2'), 'name'));
    await frames(page);
    await page.keyboard.press(c.back);
    await frames(page);
    const up = await at();
    await page.keyboard.press('*');
    await page.waitForTimeout(120);
    const star = await page.evaluate(() => ({ open: window.t.grid.kernel.expansion.size, said: window.said.at(-1), at: document.activeElement.dataset.col }));
    check(name, `${c.tag}: ${c.back} on a leaf goes to its parent, same column; * opens the 99 other services, one sentence`, up === 's0/name' && star.open === 100 && /99/.test(star.said ?? '') && star.at === 'name', { up, star });
    v = await axe(page);
    check(name, `${c.tag}: axe 0 with every service open`, v.length === 0, v);
    // The focus kept: in a child, Service 2 collapsed by the application, the focus on Service 2 on the next frame.
    await page.evaluate(() => window.t.grid.api.focusCell(window.t.key('s2p5'), 'age'));
    await frames(page);
    await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'rows.expand', rows: [window.t.key('s2')], expanded: false }, 'api'));
    await frames(page, 3);
    const kept = await at();
    check(name, `${c.tag}: a collapse by the application hiding the focus puts it on the parent row, same column (not body)`, kept === 's2/age', kept);
    // Review of step 4 (B1, B2): pinning the focused column keeps the focus on its cell; an outside
    // input then keeps it through a collapse by the application.
    await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'column.state', patch: [{ id: 'age', pinned: 'end' }] }, 'api'));
    await frames(page, 3);
    const pinned = await at();
    await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'column.state', patch: [{ id: 'age', pinned: null }] }, 'api'));
    await frames(page, 3);
    const unpinned = await at();
    const out = await page.evaluate(async () => {
      const g = window.t.grid;
      const two = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      g.kernel.dispatch({ type: 'rows.expand', rows: [window.t.key('s2')], expanded: true }, 'api');
      g.api.focusCell(window.t.key('s2p5'), 'age');
      await two();
      const input = document.createElement('input');
      document.body.append(input);
      input.focus();
      g.kernel.dispatch({ type: 'rows.expand', rows: [window.t.key('s2')], expanded: false }, 'api');
      await two();
      const kept = document.activeElement === input && String(g.kernel.focus.row).endsWith(':s2');
      input.remove();
      return kept;
    });
    check(name, `${c.tag}: pinning and unpinning the focused column keep the focus on its cell; an outside input keeps it through a collapse`, pinned === 's2/age' && unpinned === 's2/age' && out, { pinned, unpinned, out });
    // Selected and hovered rows, the pointer on a toggle (no selection).
    await page.evaluate(() => { const g = window.t.grid; g.kernel.dispatch({ type: 'selection.toggle', row: window.t.key('s0') }, 'user'); g.kernel.dispatch({ type: 'selection.toggle', row: window.t.key('s0p1') }, 'user'); window.t.scrollTo(0); });
    await frames(page);
    await tag();
    await page.hover(`${rowOf('s0p3')} .dzg-cell[data-col="city"]`);
    v = await axe(page);
    await page.click(`${rowOf('s0p3')} .dzg-toggle`);
    await frames(page);
    const clickTg = await page.evaluate(() => ({ exp: window.t.grid.kernel.expansion.has(window.t.key('s0p3')), sel: window.t.grid.kernel.selection.keys.size }));
    check(name, `${c.tag}: axe 0 with selected and hovered rows; a click on a toggle opens without selecting`, v.length === 0 && clickTg.exp && clickTg.sel === 2, { v, clickTg });
    await page.screenshot({ path: `${OUT}/${name}-tree-${c.rtl ? 'ar' : 'fr'}.png`, clip: { x: 0, y: 0, width: 1000, height: 640 } });
    // Filtered: matches and their muted ancestors, setsize of what is shown; axe 0; cleared, the tree as it was.
    await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'equals', value: 'Patient 13' } }, 'user'));
    await page.waitForTimeout(150);
    await tag();
    const f = await page.evaluate(() => {
      const ctxRow = document.querySelector('.dzg-layer > .dzg-row[data-context-row]');
      const match = document.querySelector('.dzg-layer > .dzg-row:not([data-context-row])');
      const col = (r) => getComputedStyle(r.querySelector('.dzg-cell[data-col="name"]')).color;
      return { shown: window.t.grid.kernel.rows.displayed.count, filtered: window.t.grid.kernel.rows.counts.filtered, muted: col(ctxRow), plain: col(match), set: match.getAttribute('aria-setsize'), level: match.getAttribute('aria-level'), said: window.said.at(-1) };
    });
    v = await axe(page);
    check(name, `${c.tag}: filtered on "Patient 13": 100 matches with their services muted (another colour), each 1 of 1 at level 2; axe 0`, f.shown === 200 && f.filtered === 100 && f.muted !== f.plain && f.set === '1' && f.level === '2' && v.length === 0, { f, v });
    await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'filter.column', column: 'name', filter: null }, 'user'));
    await page.waitForTimeout(100);
    const back = await page.evaluate(() => ({ open: window.t.grid.kernel.expansion.size, muted: document.querySelectorAll('[data-context-row]').length }));
    check(name, `${c.tag}: the filter cleared, the tree as the user had it (99 services and one patient open), nothing muted`, back.open === 100 && back.muted === 0, back);
    // Forced colours: the chevron in ButtonText.
    await page.emulateMedia({ forcedColors: 'active' });
    await page.waitForTimeout(200);
    const forced = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'ButtonText';
      document.body.append(probe);
      const want = getComputedStyle(probe).color;
      probe.remove();
      const t = document.querySelector('.dzg-row[aria-expanded] .dzg-toggle');
      return { want, color: getComputedStyle(t, '::before').borderBottomColor, visible: getComputedStyle(t).visibility };
    });
    await page.screenshot({ path: `${OUT}/${name}-tree-${c.rtl ? 'ar' : 'fr'}-forced.png`, clip: { x: 0, y: 0, width: 1000, height: 640 } });
    // No axe here: Chrome's emulated forced colours over a dark page give the page's own heading a failing
    // pair (an artefact of the emulation, seen outside the grid); the system draws real forced colours itself.
    check(name, `${c.tag}: forced colours: the chevron drawn in ButtonText`, forced.color === forced.want && forced.visible === 'visible', forced);
    await page.emulateMedia({ forcedColors: 'none' });
    check(name, `${c.tag}: no page error`, errors.length === 0, errors);
    await page.close();
  }
  // Path trees (step 5, tree-view.md, tree-selection.md): the services are filler rows — a label in the
  // tree column, no values, no box, no aria-selected, attributes like any parent; Ctrl+A and the header box
  // take the data rows only; a filler opens by its toggle and is said by its label; axe 0, fr and ar RTL.
  for (const c of [
    { qs: 'shape=path&locale=fr-FR&theme=light', tag: 'tree path fr ltr light', rtl: false, opened: 'Service 1 développé, 77 lignes' },
    { qs: 'shape=path&locale=ar-DZ&dir=rtl&theme=dark', tag: 'tree path ar rtl dark', rtl: true, opened: 'تم توسيع Service 1، 77 صفا' },
  ]) {
    const { page, errors } = await open(c.qs);
    const f = await page.evaluate(() => {
      const row = document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="3"]');
      const name = row.querySelector('.dzg-cell[data-col="name"]');
      const label = name.querySelector('.dzg-label');
      const box = row.querySelector('.dzg-check .dzg-box');
      const city = row.querySelector('.dzg-cell[data-col="city"]');
      const child = document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="4"]');
      return {
        kind: row.getAttribute('data-kind'), attrs: ['aria-level', 'aria-posinset', 'aria-setsize', 'aria-expanded'].map((x) => row.getAttribute(x)),
        label: label?.textContent, bidi: label && getComputedStyle(label).unicodeBidi, city: city?.textContent, selected: row.hasAttribute('aria-selected'),
        box: box ? getComputedStyle(box).display : 'none', childBox: getComputedStyle(child.querySelector('.dzg-check .dzg-box')).display, childLevel: child.getAttribute('aria-level'),
      };
    });
    let v = await axe(page);
    check(name, `${c.tag}: Service 0 a filler row (data-kind group, label isolated, other cells empty, no box, no aria-selected; level 1, 1 of 100, open), its rows at level 2 with a box; axe 0`,
      f.kind === 'group' && JSON.stringify(f.attrs) === '["1","1","100","true"]' && f.label === 'Service 0' && f.bidi === 'plaintext' && f.city === '' && !f.selected && f.box === 'none' && f.childBox !== 'none' && f.childLevel === '2' && v.length === 0, { f, v });
    // Ctrl+A from a data cell: the data rows shown, not the fillers; the header box says all.
    await page.evaluate(() => window.t.grid.api.focusCell(window.t.grid.kernel.rows.displayed.keyAt(1), 'name'));
    await frames(page);
    await page.keyboard.press('ControlOrMeta+a');
    await frames(page);
    const sel = await page.evaluate(() => {
      const g = window.t.grid;
      const d = g.kernel.rows.displayed;
      let data = 0;
      for (let i = 0; i < d.count; i++) if (d.nodeAt(i).kind === 'data') data++;
      return { size: g.kernel.selection.keys.size, data, fillers: [...g.kernel.selection.keys].filter((k) => !k.startsWith('d:')).length, header: g.kernel.headerState, ariaFiller: document.querySelector('.dzg-row[data-kind="group"]').hasAttribute('aria-selected') };
    });
    v = await axe(page);
    check(name, `${c.tag}: Ctrl+A takes the ${sel.data} data rows shown, no filler, the header box all; axe 0 with rows selected`, sel.size === sel.data && sel.fillers === 0 && sel.header === 'all' && !sel.ariaFiller && v.length === 0, { sel, v });
    // The pointer on Service 1's toggle opens it; said by its label.
    await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'selection.clear' }, 'user'));
    await page.evaluate(() => window.t.grid.api.focusCell(window.t.key('s1'), 'city'));
    await frames(page);
    const toggle = await page.evaluateHandle(() => [...document.querySelectorAll('.dzg-row[data-kind="group"]')].find((r) => r.querySelector('.dzg-label')?.textContent === 'Service 1').querySelector('.dzg-toggle'));
    await toggle.asElement().click();
    await page.waitForTimeout(120);
    const op = await page.evaluate(() => ({ said: window.said.at(-1), exp: [...document.querySelectorAll('.dzg-row[data-kind="group"]')].find((r) => r.querySelector('.dzg-label')?.textContent === 'Service 1').getAttribute('aria-expanded'), selected: window.t.grid.kernel.selection.keys.size }));
    check(name, `${c.tag}: the toggle of a filler opens it, said « ${c.opened} »; nothing selected`, op.said === c.opened && op.exp === 'true' && op.selected === 0, op);
    await page.screenshot({ path: `${OUT}/${name}-tree-path-${c.rtl ? 'ar' : 'fr'}.png`, clip: { x: 0, y: 0, width: 1000, height: 640 } });
    check(name, `${c.tag}: no page error`, errors.length === 0, errors);
    await page.close();
  }
  // ≈ 100 000 rows, everything opened, scrolled to the middle and the end: the rows there say their place.
  {
    const { page, errors } = await open('locale=fr-FR&rows=100000');
    const r = await page.evaluate(async () => {
      const g = window.t.grid;
      const t0 = performance.now();
      g.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const ms = performance.now() - t0;
      const d = g.kernel.rows.displayed;
      const look = () => [...document.querySelectorAll('.dzg-layer > .dzg-row')].map((el) => {
        const i = Number(el.getAttribute('aria-rowindex')) - 3;
        return { i, ok: el.getAttribute('aria-level') === String(d.levelAt(i) + 1) && el.getAttribute('aria-posinset') === String(d.posAt(i)) && el.getAttribute('aria-setsize') === String(d.sizeAt(i)) && !!el.querySelector('.dzg-cell[data-col="name"] > .dzg-toggle') };
      });
      window.t.scrollTo(window.t.logicalTop() + d.count * 16);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const mid = look();
      document.querySelector('.dzg-viewport').scrollTop = 1e9;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const end = look();
      return { count: d.count, ms, mid: { n: mid.length, bad: mid.filter((x) => !x.ok).length, first: mid[0]?.i }, end: { n: end.length, bad: end.filter((x) => !x.ok).length, last: Math.max(...end.map((x) => x.i)) } };
    });
    check(name, `tree 100 000: every row opened (${r.count} shown, ${Math.round(r.ms)} ms to the paint), the middle and the end drawn with their level, place and toggle`, r.count > 99_000 && r.mid.n > 5 && r.mid.bad === 0 && r.mid.first > 40_000 && r.end.bad === 0 && r.end.last === r.count - 1, r);
    check(name, 'tree 100 000: no page error', errors.length === 0, errors);
    await page.close();
  }
}

async function runEngine(name) {
  // Chrome's own accessibility trees (chrome://accessibility) need it on from the start.
  const b = await browser(name, name === 'chrome' ? { args: ['--force-renderer-accessibility'] } : {});
  open = b;
  try {
    const ctx = await b.newContext();
    if (only) {
      if (only === 'parts' && name === 'chrome') await partsChecks(name, ctx);
      if (only === 'rules' && name === 'chrome') await rulesChecks(name, ctx);
      if (only === 'motion' && name === 'chrome') await motionChecks(name, ctx);
      if (only === 'tree' && name === 'chrome') await treeChecks(name, ctx);
      return;
    }

    // ---- axe, in fr and ar, light and dark, with selection, scrolled, and with each overlay ----
    if (name === 'chrome') {
      for (const qs of ['locale=fr-FR&theme=light', 'locale=ar-DZ&theme=dark', 'locale=fr-FR&theme=dark&box=1', 'locale=ar-DZ&theme=light&box=1&select=single']) {
        const { page, errors } = await load(ctx, qs);
        let v = await axe(page);
        check(name, `axe ${qs}: 0 violations at load`, v.length === 0, v);
        await page.evaluate(() => { window.t.scrollTo(5000 * 32); const k = window.t.key(10); window.t.grid.kernel.dispatch({ type: 'selection.toggle', row: k }, 'user'); });
        await frames(page);
        v = await axe(page);
        check(name, `axe ${qs}: 0 violations scrolled, selection active`, v.length === 0, v);
        for (const overlay of ['loading', 'error']) {
          await page.evaluate((o) => window.t.grid.update({ overlay: o }), overlay);
          await frames(page);
          v = await axe(page);
          const shown = await page.evaluate(() => { const o = document.querySelector('.dzg-overlay'); return { display: getComputedStyle(o).display, inGrid: !!o.closest('[role=grid]'), text: o.textContent }; });
          check(name, `axe ${qs}: 0 violations with the ${overlay} overlay, shown outside the grid`, v.length === 0 && shown.display !== 'none' && !shown.inGrid && shown.text, { v, shown });
        }
        await page.evaluate(() => window.t.grid.update({ overlay: null }));
        await frames(page);
        const hidden = await page.evaluate(() => getComputedStyle(document.querySelector('.dzg-overlay')).display);
        check(name, `${qs}: the overlay really hides (display none)`, hidden === 'none', hidden);
        await page.screenshot({ path: `${OUT}/${name}-${qs.replace(/[&=]/g, '_')}.png`, clip: { x: 0, y: 0, width: 1000, height: 640 } });
        check(name, `no page error ${qs}`, errors.length === 0, errors);
        await page.close();
      }
    }

    // ---- the retry button on the error overlay (step 11), in fr and in ar right to left ----
    if (name === 'chrome') {
      for (const [qs, label] of [['locale=fr-FR&rows=200', 'Réessayer'], ['locale=ar-DZ&dir=rtl&rows=200&theme=dark', 'إعادة المحاولة']]) {
        const { page, errors } = await load(ctx, qs);
        await page.evaluate(() => {
          const k = window.t.grid.kernel;
          window.t.sent = [];
          const dispatch = k.dispatch.bind(k);
          k.dispatch = (cmd, source) => { window.t.sent.push(`${cmd.type}:${source}`); return dispatch(cmd, source); };
          window.t.grid.update({ overlay: 'error' });
        });
        await frames(page);
        const v = await axe(page);
        const b = await page.evaluate(() => {
          const btn = document.querySelector('.dzg-overlay button');
          if (!btn) return null;
          const r = btn.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { text: btn.textContent, type: btn.type, inGrid: !!btn.closest('[role=grid]'), w: r.width, h: r.height, hit: hit === btn || btn.contains(hit), dir: getComputedStyle(btn).direction };
        });
        check(name, `retry ${qs}: axe 0 violations with the error overlay and its button`, v.length === 0 && b, { v, b });
        check(name, `retry ${qs}: a native button named ${label}, outside role grid, at least 24 px, on top under the pointer`, b && b.text === label && b.type === 'button' && !b.inGrid && b.w >= 24 && b.h >= 24 && b.hit && b.dir === (qs.includes('rtl') ? 'rtl' : 'ltr'), b);
        // Tab from the grid's focused cell reaches the button; Enter presses it; the focus comes back to the cell.
        await page.evaluate(() => window.t.grid.api.focusCell(window.t.key(3), 'city'));
        await frames(page);
        await page.keyboard.press('Tab');
        const onButton = await page.evaluate(() => document.activeElement === document.querySelector('.dzg-overlay button'));
        check(name, `retry ${qs}: Tab from the grid reaches the button`, onButton, null);
        await page.keyboard.press('Enter');
        await frames(page);
        const after = await page.evaluate(() => ({ sent: window.t.sent, col: document.activeElement?.dataset?.col ?? null, row: document.activeElement?.closest('.dzg-row')?.getAttribute('aria-rowindex') ?? null }));
        check(name, `retry ${qs}: Enter dispatches rows.refresh as the user and the focus goes back to the cell`, after.sent.includes('rows.refresh:user') && after.col === 'city' && after.row === '5', after);
        // No trap: Tab leaves the button for what follows it, Shift+Tab goes back into the grid.
        await page.evaluate(() => document.querySelector('.dzg-overlay button').focus());
        await page.keyboard.press('Tab');
        const out = await page.evaluate(() => document.activeElement?.id);
        await page.evaluate(() => document.querySelector('.dzg-overlay button').focus());
        await page.keyboard.press('Shift+Tab');
        const back = await page.evaluate(() => !!document.activeElement?.closest('[role=grid]'));
        check(name, `retry ${qs}: no focus trap (Tab leaves forward, Shift+Tab back into the grid)`, out === 'after' && back, { out, back });
        await page.screenshot({ path: `${OUT}/${name}-retry-${qs.replace(/[&=]/g, '_')}.png`, clip: { x: 0, y: 0, width: 1000, height: 640 } });
        check(name, `no page error retry ${qs}`, errors.length === 0, errors);
        await page.close();
      }
    }

    // ---- an overlay part's own controls take the pointer (step 11 review): a link and a field ----
    if (name === 'chrome') {
      const { page, errors } = await load(ctx, 'locale=fr-FR&rows=200&slots=1');
      await page.evaluate(() => window.t.grid.update({ overlay: 'error' }));
      await frames(page);
      const at = (sel) => page.evaluate((sel) => {
        const el = document.querySelector(`.dzg-overlay ${sel}`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, hit: hit === el || el.contains(hit), pe: getComputedStyle(el).pointerEvents };
      }, sel);
      const link = await at('a.help');
      const field = await at('input.ask');
      if (link) await page.mouse.click(link.x, link.y);
      const hash = await page.evaluate(() => location.hash);
      if (field) await page.mouse.click(field.x, field.y);
      const typed = await page.evaluate(() => document.activeElement?.classList.contains('ask') ?? false);
      // The overlay itself still lets the pointer through to the rows around its content.
      const through = await page.evaluate(() => { const o = document.querySelector('.dzg-overlay'); const r = o.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + 8, r.bottom - 8); return getComputedStyle(o).pointerEvents === 'none' && hit !== o; });
      check(name, 'overlay part: a link and a field inside it are on top under the pointer, the link followed by a click, the field focused', link?.hit && field?.hit && hash === '#help' && typed && through, { link, field, hash, typed, through });
      check(name, 'no page error overlay part', errors.length === 0, errors);
      await page.close();
    }

    // ---- the floating filter row (step 12): fr light, ar right to left dark, with the box, with groups and pins ----
    if (name === 'chrome') {
      const cases = [
        ['locale=fr-FR&theme=light&rows=2000&filters=1&floating=1', 'Filtrer Montant', '1,5', 'Effacer le filtre Montant'],
        ['locale=ar-DZ&dir=rtl&theme=dark&rows=2000&filters=1&floating=1', 'ترشيح المبلغ', '\u0661\u066B\u0665', 'مسح مرشح المبلغ'],
        ['locale=fr-FR&rows=2000&filters=1&floating=1&box=1', 'Filtrer Montant', '1.5', 'Effacer le filtre Montant'],
        ['locale=ar-DZ&dir=rtl&rows=2000&filters=1&floating=1&groups=1&pin=1&box=1', 'ترشيح المبلغ', '1,5', 'مسح مرشح المبلغ'],
      ];
      for (const [qs, label, typed, clearName] of cases) {
        const { page, errors } = await load(ctx, qs);
        const tag = `floating ${qs}`;
        // Header rows stacked one under the other (the base's header is a column), as wide as each other.
        const rows = await page.evaluate(() => [...document.querySelectorAll('.dzg-header > [role=row]')].map((r) => { const b = r.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left) }; }));
        check(name, `${tag}: header rows stacked`, rows.length >= 2 && rows.every((r, i) => i === 0 || (Math.abs(r.top - rows[i - 1].bottom) <= 1 && Math.abs(r.left - rows[0].left) <= 1)), rows);
        let v = await axe(page);
        check(name, `${tag}: axe 0 violations, empty`, v.length === 0, v);
        const box = () => page.evaluate(() => {
          const i = document.querySelector('.dzg-hextra[data-col="amount"] input');
          if (!i) return null;
          const r = i.getBoundingClientRect(), c = i.closest('.dzg-hextra').getBoundingClientRect(), st = getComputedStyle(i);
          return { label: i.getAttribute('aria-label'), w: r.width, h: r.height, inside: r.top >= c.top - 0.5 && r.bottom <= c.bottom + 0.5, bidi: st.unicodeBidi, align: st.textAlign, invalid: i.getAttribute('aria-invalid'), outline: parseFloat(st.outlineWidth), outlineStyle: st.outlineStyle, value: i.value };
        });
        const b0 = await box();
        check(name, `${tag}: the box named ${label}, at least 24 px, in its cell, its own direction, aligned at the start`, b0 && b0.label === label && b0.w >= 24 && b0.h >= 24 && b0.inside && b0.bidi === 'plaintext' && b0.align === 'start', b0);
        // One tab stop: Tab from the field before enters the grid once, the next Tab leaves it.
        await page.focus('#before');
        await page.keyboard.press('Tab');
        const inGrid = await page.evaluate(() => !!document.activeElement.closest('[role=grid]'));
        await page.keyboard.press('Tab');
        const out = await page.evaluate(() => document.activeElement.id);
        check(name, `${tag}: one tab stop (Tab enters the grid, the next Tab leaves it)`, inGrid && out === 'after', { inGrid, out });
        // Enter on the floating cell: into the box; type (Latin digits in ar-DZ write the decimal with a comma); the filter applies after the pause.
        await page.evaluate(() => document.querySelector('.dzg-hextra[data-col="amount"]').focus());
        await page.keyboard.press('Enter');
        const entered = await page.evaluate(() => document.activeElement.matches('.dzg-hextra[data-col="amount"] input'));
        await page.keyboard.type(typed);
        await page.waitForTimeout(400);
        await frames(page);
        const f1 = await page.evaluate(() => window.t.grid.kernel.query.filter.amount ?? null);
        check(name, `${tag}: Enter goes into the box; ${typed} filters equals 1.5`, entered && f1?.op === 'equals' && f1?.value === 1.5, { entered, f1 });
        v = await axe(page);
        check(name, `${tag}: axe 0 violations, typed`, v.length === 0, v);
        // A minus first stays put in right to left (the box's own direction), then an unreadable number.
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type('-5');
        await page.waitForTimeout(400);
        const f2 = await page.evaluate(() => ({ f: window.t.grid.kernel.query.filter.amount ?? null, v: document.activeElement.value }));
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type('abc');
        await page.waitForTimeout(400);
        await frames(page);
        const bad = await box();
        check(name, `${tag}: -5 reads as -5; abc is marked invalid with a 2 px outline, the filter kept`, f2.f?.value === -5 && f2.v === '-5' && bad.invalid === 'true' && bad.outline >= 2 && bad.outlineStyle !== 'none', { f2, bad });
        v = await axe(page);
        check(name, `${tag}: axe 0 violations, invalid`, v.length === 0, v);
        await page.screenshot({ path: `${OUT}/${name}-floating-${qs.replace(/[&=]/g, '_')}.png`, clip: { x: 0, y: 0, width: 1000, height: 300 } });
        // Escape: back to the cell; F2: into the box again; Escape again.
        await page.keyboard.press('Escape');
        const onCell = await page.evaluate(() => document.activeElement.matches('.dzg-hextra[data-col="amount"]'));
        await page.keyboard.press('F2');
        const again = await page.evaluate(() => document.activeElement.matches('.dzg-hextra[data-col="amount"] input'));
        await page.keyboard.press('Escape');
        const sort = await page.evaluate(() => window.t.grid.kernel.query.sort.length);
        check(name, `${tag}: Escape back to the cell, F2 into the box, no sort`, onCell && again && sort === 0, { onCell, again, sort });
        // A filter the box cannot edit: the summary and its Clear button.
        await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'filter.column', column: 'amount', filter: { type: 'number', op: 'between', value: 1, valueTo: 50 } }, 'api'));
        await frames(page);
        const sum = await page.evaluate(() => { const c = document.querySelector('.dzg-hextra[data-col="amount"] button'); if (!c) return null; const r = c.getBoundingClientRect(); return { name: c.getAttribute('aria-label'), w: r.width, h: r.height }; });
        v = await axe(page);
        check(name, `${tag}: summary with Clear named ${clearName}, at least 24 px, axe 0`, sum && sum.name === clearName && sum.w >= 24 && sum.h >= 24 && v.length === 0, { sum, v });
        // The overlay sits under every header row; the header stays at the top when the body scrolls.
        await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'zzzz' } }, 'api'));
        await frames(page);
        const under = await page.evaluate(() => { const o = document.querySelector('.dzg-overlay').getBoundingClientRect(); const h = document.querySelector('.dzg-header').getBoundingClientRect(); return { o: o.top, h: h.bottom }; });
        await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'filter.set', filter: {} }, 'api'));
        await frames(page);
        const h0 = await page.evaluate(() => document.querySelector('.dzg-header').getBoundingClientRect().top);
        await page.evaluate(() => window.t.scrollTo(500 * 32));
        await frames(page, 3);
        const h1 = await page.evaluate(() => document.querySelector('.dzg-header').getBoundingClientRect().top);
        check(name, `${tag}: overlay under both header rows; header sticky`, under.o >= under.h - 1 && Math.abs(h0 - h1) <= 1, { under, h0, h1 });
        // Text zoom: the box still fits its cell, still 24 px.
        await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        await frames(page, 4);
        const z = await box();
        check(name, `${tag}: at 200 % text the box fits its cell, at least 24 px`, z && z.inside && z.h >= 24, z);
        check(name, `no page error ${tag}`, errors.length === 0, errors);
        await page.close();
      }
    }

    // ---- the filter popup (step 13): fr light, ar right to left dark, with the floating row ----
    if (name === 'chrome') {
      const cases = [
        ['locale=fr-FR&theme=light&rows=2000&filters=1&popup=1', 'Filtre Montant', 'Montant, filtré', '1,5', 'Filtre Payé', false],
        ['locale=ar-DZ&dir=rtl&theme=dark&rows=2000&filters=1&popup=1', 'مرشح المبلغ', 'المبلغ\u060C مرشح', '\u0661\u066B\u0665', 'مرشح مدفوع', true],
        ['locale=fr-FR&rows=2000&filters=1&popup=1&floating=1', 'Filtre Montant', 'Montant, filtré', '1,5', 'Filtre Payé', false],
      ];
      const rect = (sel) => (page) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height }; }, sel);
      const btn = rect('.dzg-hcell[role=columnheader][data-col="amount"] > .dzg-fbtn');
      const pop = rect('.dzg-popup');
      const state = (page) => page.evaluate(() => {
        const p = document.querySelector('.dzg-popup');
        const a = document.activeElement;
        return { open: !!p, label: p?.getAttribute('aria-label') ?? null, inPopup: !!p && p.contains(a), active: a?.className ?? a?.tagName, expanded: document.querySelector('.dzg-hcell[role=columnheader][data-col="amount"] > .dzg-fbtn')?.getAttribute('aria-expanded') };
      });
      for (const [qs, popName, markName, typed, boolName, rtl] of cases) {
        const { page, errors } = await load(ctx, qs);
        const tag = `popup ${qs}`;
        // Header layout: sort by the column first (a sort mark), then label, mark, grip and button apart, the button at least 24 px.
        await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'sort.toggle', column: 'amount', multi: false }, 'user'));
        await frames(page);
        const lay = await page.evaluate(() => {
          const c = document.querySelector('.dzg-hcell[role=columnheader][data-col="amount"]');
          const r = (sel) => { const e = c.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
          const over = (a, b) => a && b && a.l < b.r - 0.5 && b.l < a.r - 0.5;
          const cb = c.getBoundingClientRect(), cell = { l: cb.left, r: cb.right, t: cb.top, b: cb.bottom }, label = r('.dzg-hlabel'), sort = r('.dzg-sort'), grip = r('.dzg-resize'), button = r('.dzg-fbtn');
          const rtl = getComputedStyle(c).direction === 'rtl';
          return { button, sort, order: !!button && !!sort && (rtl ? sort.l >= button.r - 0.5 : sort.r <= button.l + 0.5), inside: button && button.l >= cell.l - 0.5 && button.r <= cell.r + 0.5 && button.t >= cell.t - 0.5 && button.b <= cell.b + 0.5, overlaps: [over(button, grip), over(button, label), over(button, sort)], hit: button && (() => { const e = document.elementFromPoint((button.l + button.r) / 2, (button.t + button.b) / 2); return e?.classList.contains('dzg-fbtn'); })() };
        });
        check(name, `${tag}: header button ≥ 24 px inside its cell, clear of label, sort mark and grip, after the sort mark, on top under the pointer`, lay.button && lay.button.r - lay.button.l >= 24 && lay.button.b - lay.button.t >= 24 && lay.inside && lay.order && !lay.overlaps.some(Boolean) && lay.hit, lay);
        let v = await axe(page);
        check(name, `${tag}: axe 0 violations, closed`, v.length === 0, v);
        // Open from the button: named, expanded, focus in the value field, start edges aligned.
        await page.click('.dzg-hcell[role=columnheader][data-col="amount"] > .dzg-fbtn');
        await frames(page);
        const s1 = await state(page);
        const b1 = await btn(page), p1 = await pop(page);
        const aligned = rtl ? Math.abs(p1.right - b1.right) <= 1 : Math.abs(p1.left - b1.left) <= 1;
        check(name, `${tag}: the button opens a dialog named ${popName}, expanded, focus inside, start edge on the button's${rtl ? ' (right)' : ''}, below it`, s1.open && s1.label === popName && s1.inPopup && s1.expanded === 'true' && aligned && p1.top >= b1.bottom - 1, { s1, b1, p1 });
        const sort0 = await page.evaluate(() => window.t.grid.kernel.query.sort.length);
        check(name, `${tag}: the button's click did not sort`, sort0 === 1, sort0);
        v = await axe(page);
        check(name, `${tag}: axe 0 violations, number popup open`, v.length === 0, v);
        // Between, typed in the locale; Enter applies and closes, focus back on the button.
        await page.selectOption('.dzg-popup select.dzg-fop', 'between');
        await frames(page);
        v = await axe(page);
        check(name, `${tag}: axe 0 violations, between`, v.length === 0, v);
        await page.focus('.dzg-popup input.dzg-fval');
        await page.keyboard.type(typed);
        await page.focus('.dzg-popup input.dzg-fto');
        await page.keyboard.type('50');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(50);
        await frames(page);
        const f1 = await page.evaluate(() => window.t.grid.kernel.query.filter.amount ?? null);
        const s2 = await state(page);
        const mark = await page.evaluate(() => { const c = document.querySelector('.dzg-hcell[role=columnheader][data-col="amount"]'); return { filtered: c.hasAttribute('data-dzg-filtered'), label: c.getAttribute('aria-label'), focus: document.activeElement.classList.contains('dzg-fbtn') }; });
        check(name, `${tag}: ${typed} to 50 between filters, closed, focus on the button, header named "${markName}"`, f1?.op === 'between' && f1.value === 1.5 && f1.valueTo === 50 && !s2.open && mark.filtered && mark.label === markName && mark.focus, { f1, s2, mark });
        v = await axe(page);
        check(name, `${tag}: axe 0 violations, filtered mark`, v.length === 0, v);
        await page.screenshot({ path: `${OUT}/${name}-popup-mark-${qs.replace(/[&=]/g, '_')}.png`, clip: { x: 0, y: 0, width: 1000, height: 200 } });
        // Unreadable: marked, stays open.
        await page.keyboard.press('Enter');
        await frames(page);
        await page.focus('.dzg-popup input.dzg-fval');
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type('abc');
        await page.keyboard.press('Enter');
        await frames(page);
        const bad = await page.evaluate(() => ({ invalid: document.querySelector('.dzg-popup input.dzg-fval')?.getAttribute('aria-invalid'), open: !!document.querySelector('.dzg-popup'), f: window.t.grid.kernel.query.filter.amount }));
        check(name, `${tag}: Enter on the button reopens; abc is marked invalid, the popup stays, the filter kept`, bad.invalid === 'true' && bad.open && bad.f?.value === 1.5, bad);
        v = await axe(page);
        check(name, `${tag}: axe 0 violations, invalid`, v.length === 0, v);
        await page.screenshot({ path: `${OUT}/${name}-popup-${qs.replace(/[&=]/g, '_')}.png`, clip: { x: 0, y: 0, width: 1000, height: 400 } });
        // Tab stays inside; Escape closes, focus back on the button.
        let inside = true;
        for (let i = 0; i < 8; i++) {
          await page.keyboard.press(i % 3 === 2 ? 'Shift+Tab' : 'Tab');
          inside &&= await page.evaluate(() => !!document.activeElement.closest('.dzg-popup'));
        }
        await page.keyboard.press('Escape');
        const back = await page.evaluate(() => ({ open: !!document.querySelector('.dzg-popup'), focus: document.activeElement.classList.contains('dzg-fbtn') }));
        check(name, `${tag}: Tab and Shift+Tab stay inside; Escape closes, focus on the button`, inside && !back.open && back.focus, { inside, back });
        // Alt+ArrowDown on the boolean header: All / Yes / No; Yes applies at once; Escape back to the header cell.
        await page.evaluate(() => document.querySelector('.dzg-hcell[role=columnheader][data-col="paid"]').focus());
        await page.keyboard.press('Alt+ArrowDown');
        await frames(page);
        const sb = await page.evaluate(() => { const p = document.querySelector('.dzg-popup'); return { label: p?.getAttribute('aria-label'), group: p?.querySelector('[role=radiogroup]')?.getAttribute('aria-label'), radio: document.activeElement.type }; });
        v = await axe(page);
        await page.click('.dzg-popup [role=radiogroup] label:nth-child(2)');
        await frames(page);
        const fb = await page.evaluate(() => window.t.grid.kernel.query.filter.paid ?? null);
        await page.keyboard.press('Escape');
        const onHeader = await page.evaluate(() => document.activeElement.matches('.dzg-hcell[data-col="paid"]'));
        check(name, `${tag}: Alt+ArrowDown opens ${boolName}, a named radio group, axe 0; Yes filters at once; Escape back to the header`, sb.label === boolName && sb.group === boolName && sb.radio === 'radio' && v.length === 0 && fb?.value === true && onHeader, { sb, v, fb, onHeader });
        // A text popup, axe.
        await page.click('.dzg-hcell[role=columnheader][data-col="name"] > .dzg-fbtn');
        await frames(page);
        v = await axe(page);
        check(name, `${tag}: axe 0 violations, text popup`, v.length === 0, v);
        await page.keyboard.press('Escape');
        // The anchor scrolls out of the column window: the popup closes, focus back on the grid.
        await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'filter.set', filter: {} }, 'api'));
        await frames(page);
        await page.click('.dzg-hcell[role=columnheader][data-col="x1"] > .dzg-fbtn');
        await frames(page);
        const before = await state(page);
        await page.evaluate(() => { const vp = document.querySelector('.dzg-viewport'); vp.scrollLeft = (getComputedStyle(vp).direction === 'rtl' ? -1 : 1) * (vp.scrollWidth - vp.clientWidth); });
        await frames(page, 4);
        const after = await page.evaluate(() => ({ open: !!document.querySelector('.dzg-popup'), inGrid: !!document.activeElement.closest('.dzg') }));
        check(name, `${tag}: a popup whose column scrolls out closes, focus back on the grid`, before.open && !after.open && after.inGrid, { before, after });
        await page.evaluate(() => { const vp = document.querySelector('.dzg-viewport'); vp.scrollLeft = 0; });
        await frames(page, 3);
        // Near the bottom of the window it opens above; in a transformed, clipping card it is in the top layer, all of it seen.
        await page.evaluate(() => { document.querySelector('main').style.paddingBlockStart = '560px'; const h = document.getElementById('host'); h.style.transform = 'translateZ(0)'; h.style.overflow = 'hidden'; window.scrollTo(0, 0); });
        await frames(page, 3);
        await page.click('.dzg-hcell[role=columnheader][data-col="amount"] > .dzg-fbtn');
        await frames(page);
        const b2 = await btn(page), p2 = await pop(page);
        const top = await page.evaluate(() => { const p = document.querySelector('.dzg-popup'); const r = p.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + 4); return { layer: p.matches(':popover-open'), seen: p.contains(e) }; });
        check(name, `${tag}: near the bottom it opens above the button; in a transformed card it is in the top layer and seen`, p2 && b2 && p2.bottom <= b2.top + 1 && top.layer && top.seen, { b2, p2, top });
        await page.keyboard.press('Escape');
        check(name, `no page error ${tag}`, errors.length === 0, errors);
        await page.close();
      }
    }

    // ---- date filters on tzslot (step 14 part B): fr light Europe/Paris, ar right to left dark ----
    if (name === 'chrome') await dateChecks(name, ctx);
    if (name === 'chrome') await setChecks(name, ctx);
    if (name === 'chrome') await searchChecks(name, ctx);
    if (name === 'chrome') await pagingChecks(name, ctx);
    if (name === 'chrome') await partsChecks(name, ctx);
    if (name === 'chrome') await rulesChecks(name, ctx);
    if (name === 'chrome') await motionChecks(name, ctx);
    if (name === 'chrome') await treeChecks(name, ctx);

    // ---- alignment and pinning, LTR and RTL, at three inline positions ----
    // With the selection box too (its cell must be as wide as the column it stands for), and over spans.
    // And under grouped headers (step 9b, commit 4): LTR, RTL, pinned, with the box.
    for (const [dir, more] of [['ltr', ''], ['rtl', ''], ['ltr', '&box=1'], ['rtl', '&box=1&spans=1&pin=1&rows=20000'], ['ltr', '&groups=1'], ['rtl', '&groups=1'], ['ltr', '&groups=1&pin=1&box=1'], ['rtl', '&groups=1&pin=1&box=1']]) {
      const { page } = await load(ctx, `locale=${dir === 'rtl' ? 'ar-DZ' : 'fr-FR'}&dir=${dir}${more}`);
      const out = [];
      for (const at of [0, 0.5, 1]) {
        await page.evaluate((at) => {
          const vp = document.querySelector('.dzg-viewport');
          const max = vp.scrollWidth - vp.clientWidth;
          vp.scrollLeft = (getComputedStyle(vp).direction === 'rtl' ? -1 : 1) * max * at;
        }, at);
        await frames(page, 3);
        out.push(await geometry(page));
      }
      check(name, `${dir}${more}: header and body aligned within 1 px, pinned segments at their edges, at start, middle and end`, out.every((m) => m.worst <= 1 && m.startEdge <= 1 && m.endEdge <= 1), out);
      await page.close();
    }

    // ---- aria-rowindex exact after scroll, and the retained row in the AX tree ----
    {
      const { page } = await load(ctx, 'rows=100000');
      await page.evaluate(() => window.t.grid.api.focusCell(window.t.key(42), 'city'));
      const res = [];
      for (const i of [0, 5000, 99990]) {
        await page.evaluate((i) => window.t.scrollTo(i * 32), i);
        await frames(page, 2);
        res.push(await page.evaluate(() => {
          const rows = [...document.querySelectorAll('.dzg-layer > .dzg-row')];
          const idx = rows.map((r) => Number(r.getAttribute('aria-rowindex')));
          // The model's index of each row, read from its first cell's text ("Patient 123").
          const exact = rows.every((r) => Number(r.querySelector('[data-col="name"]').textContent.replace(/\D/g, '')) + 2 === Number(r.getAttribute('aria-rowindex')));
          return { ordered: idx.every((x, k) => k === 0 || x > idx[k - 1]), exact, retained: idx.includes(44), focused: document.activeElement?.closest('.dzg-row')?.getAttribute('aria-rowindex') };
        }));
      }
      check(name, 'aria-rowindex exact and in DOM order after scrolling to 0, 5 000 and 99 990; the focused row retained', res.every((r) => r.ordered && r.exact && r.retained && r.focused === '44'), res);
      if (name === 'chrome') {
        const cdp = await ctx.newCDPSession(page);
        const { nodes } = await cdp.send('Accessibility.getFullAXTree');
        // Headless, the window itself has no focus, so the AX tree puts it on the page: the DOM
        // focus is checked above; here the retained row and its focused cell must be exposed.
        const header = nodes.find((n) => n.name?.value === 'Patient 42' && n.role?.value === 'rowheader');
        const row = header && nodes.find((n) => n.childIds?.includes(header.parentId) || n.nodeId === header.parentId);
        const city = nodes.find((n) => n.role?.value === 'gridcell' && n.parentId === header?.parentId && /^(Alger|Oran|Constantine|Annaba|Blida|Sétif)$/.test(n.name?.value ?? ''));
        check(name, 'the retained row and its focused cell are in the accessibility tree, not ignored', header && !header.ignored && city && !city.ignored, { header: !!header, row: row?.role?.value, city: city?.name?.value });
      }
      await page.close();
    }

    // ---- focus survives updates and scrolling, in a real browser (a moved node blurs here) ----
    {
      const { page } = await load(ctx, 'rows=20000');
      // A far cell is focused at the next paint (the grid scrolls first): wait a frame.
      await page.evaluate(() => window.t.grid.api.focusCell(window.t.key(42), 'city'));
      await frames(page, 2);
      await page.evaluate(() => { window.t.mark = document.activeElement; window.t.events.length = 0; });
      check(name, 'focusCell on a far row moves the DOM focus there at the next paint', await page.evaluate(() => window.t.mark.closest('.dzg-row')?.getAttribute('aria-rowindex') === '44'), null);
      await page.evaluate(() => {
        const g = window.t.grid;
        g.update({ locale: 'ar-DZ' });
        g.update({ direction: 'rtl' });
        g.update({ direction: 'ltr' });
        g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'amount', dir: 'desc' }] }, 'user');
      });
      await frames(page, 3);
      await page.evaluate(() => window.t.scrollTo(15000 * 32));
      await frames(page, 2);
      await page.evaluate(() => window.t.scrollTo(0));
      await frames(page, 2);
      const s = await page.evaluate(() => ({ same: document.activeElement === window.t.mark, blurs: window.t.events.filter((e) => e.startsWith('blur')).length }));
      check(name, 'focus kept through locale, direction and sort updates and a long scroll: same element, no blur', s.same && s.blurs === 0, s);
      // Tab out and Shift+Tab back.
      await page.focus('#after');
      await page.keyboard.press('Shift+Tab');
      await frames(page);
      const back = await page.evaluate(() => document.activeElement === window.t.mark);
      check(name, 'Shift+Tab comes back to the same cell', back, back);
      await page.close();
    }

    // ---- a million rows: focus far away, scrolled to the end and back, and the last row flush ----
    {
      const { page, errors } = await load(ctx, 'rows=1000000');
      const scaled = await page.evaluate(() => window.t.mapper().scaled);
      await page.evaluate(() => window.t.grid.api.focusCell(window.t.key(500000), 'amount'));
      await frames(page, 2);
      await page.evaluate(() => { window.t.mark = document.activeElement; window.t.events.length = 0; });
      for (const to of ['end', 'top', 'mid']) {
        await page.evaluate((to) => window.t.scrollTo(to === 'end' ? 1e12 : to === 'top' ? 0 : 499995 * 32), to);
        await frames(page, 2);
      }
      const s = await page.evaluate(() => ({ same: document.activeElement === window.t.mark, blurs: window.t.events.filter((e) => e.startsWith('blur')).length, bodyH: document.querySelector('.dzg-body').getBoundingClientRect().height }));
      check(name, '1 M rows (scaled): focused cell kept through end, top and back; the body never taller than the cap', scaled && s.same && s.blurs === 0 && s.bodyH <= 4_000_000 + 1, { scaled, ...s });
      await page.keyboard.press('ArrowDown');
      await frames(page, 2);
      const down = await page.evaluate(() => {
        const a = document.activeElement, v = document.querySelector('.dzg-viewport').getBoundingClientRect(), r = a.getBoundingClientRect();
        return { row: a.closest('.dzg-row')?.getAttribute('aria-rowindex'), visible: r.top >= v.top + 30 && r.bottom <= v.bottom + 0.5 };
      });
      check(name, '1 M rows: ArrowDown focuses the next row, fully visible', down.row === '500003' && down.visible, down);
      await page.evaluate(() => window.t.scrollTo(1e12));
      await frames(page, 2);
      const last = await page.evaluate(() => {
        const v = document.querySelector('.dzg-viewport');
        const vr = v.getBoundingClientRect();
        const row = document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="1000001"]');
        if (!row) return null;
        const r = row.getBoundingClientRect();
        return { gap: vr.top + v.clientTop + v.clientHeight - r.bottom };
      });
      check(name, '1 M rows: the last row is flush with the bottom', last && Math.abs(last.gap) <= 1, last);
      // S11 C on the real grid, scaled: Tab out, scroll to the end, Shift+Tab back to the same cell, visible.
      await page.evaluate(() => { window.t.grid.api.focusCell(window.t.key(500000), 'amount'); });
      await frames(page, 2);
      await page.evaluate(() => { window.t.mark = document.activeElement; });
      await page.focus('#after');
      await page.evaluate(() => window.t.scrollTo(1e12));
      await frames(page, 2);
      await page.keyboard.press('Shift+Tab');
      await frames(page, 4);
      const c = await page.evaluate(() => {
        const a = document.activeElement, v = document.querySelector('.dzg-viewport').getBoundingClientRect(), r = a.getBoundingClientRect();
        return { same: a === window.t.mark, visible: r.top >= v.top + 30 && r.bottom <= v.bottom + 0.5 };
      });
      check(name, '1 M rows: Shift+Tab back from outside lands on the same cell, brought into view', c.same && c.visible, c);
      check(name, 'no page error at 1 M rows', errors.length === 0, errors);
      await page.close();
    }

    // ---- a real mouse drag on resize handles, LTR and RTL: centre, start-pinned, end-pinned ----
    for (const dir of ['ltr', 'rtl']) {
      const { page } = await load(ctx, `locale=${dir === 'rtl' ? 'ar-DZ' : 'fr-FR'}&dir=${dir}&rows=200`);
      const out = [];
      for (const col of ['city', 'name', 'ref']) {
        const before = await page.evaluate((c) => document.querySelector(`.dzg-hcell[data-col="${c}"]`).getBoundingClientRect().width, col);
        const h = await page.locator(`.dzg-hcell[data-col="${col}"] .dzg-resize`).boundingBox();
        // Toward the column's outside: the end in LTR is to the right; the last end-pinned grows the other way.
        const outward = (dir === 'ltr' ? 1 : -1) * (col === 'ref' ? -1 : 1);
        await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
        await page.mouse.down();
        await page.mouse.move(h.x + h.width / 2 + outward * 30, h.y + h.height / 2, { steps: 5 });
        await page.mouse.move(h.x + h.width / 2 + outward * 60, h.y + h.height / 2, { steps: 5 });
        await page.mouse.up();
        await frames(page, 3);
        const after = await page.evaluate((c) => document.querySelector(`.dzg-hcell[data-col="${c}"]`).getBoundingClientRect().width, col);
        out.push({ col, grew: Math.round(after - before) });
      }
      const g = await geometry(page);
      check(name, `${dir}: a mouse drag of 60 px widens centre, start-pinned and end-pinned columns by 60, still aligned`, out.every((o) => Math.abs(o.grew - 60) <= 1) && g.worst <= 1, { out, g });
      await page.close();
    }

    // ---- text zoom: rows follow the reader's text size; the tooltip in the top layer ----
    {
      const { page } = await load(ctx, 'rows=200');
      const z = await page.evaluate(async () => {
        document.documentElement.style.fontSize = '32px';
        window.t.grid.api.refresh();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const row = document.querySelector('.dzg-layer > .dzg-row');
        const cells = [...row.querySelectorAll('.dzg-cell')];
        return { height: row.getBoundingClientRect().height, clipped: cells.filter((c) => c.scrollHeight > c.clientHeight + 1).length };
      });
      check(name, 'at 200 % text the rows double and no cell text is clipped', Math.abs(z.height - 64) <= 1 && z.clipped === 0, z);
      const tip = await page.evaluate(async () => {
        document.documentElement.style.fontSize = '';
        // A host card that clips what overflows it, as dialogs and cards do.
        const host = document.getElementById('host');
        host.style.overflow = 'hidden';
        host.style.transform = 'translateZ(0)';
        const h = document.querySelector('.dzg-hcell[data-col="city"]');
        h.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 700));
        const t = document.querySelector('.dzg-tooltip');
        return { shown: !t.hidden, topLayer: t.matches(':popover-open') };
      });
      check(name, 'the tooltip opens in the top layer, out of reach of a clipping, transformed host', tip.shown && tip.topLayer, tip);
      await page.close();
    }

    // ---- spans (step 9b, commit 3): a long merge drawn over the view, its label in view, hit over covered places ----
    for (const pin of ['', '&pin=1']) {
      const { page, errors } = await load(ctx, `rows=20000&spans=1${pin}`);
      const res = await page.evaluate(async () => {
        const vp = document.querySelector('.dzg-viewport');
        const v = vp.getBoundingClientRect();
        const top = document.querySelector('.dzg-header').getBoundingClientRect().bottom;
        const bottom = v.top + vp.clientTop + vp.clientHeight;
        const out = [];
        // Inside the first run (rows 0 to 4 999): before its centre, at it, past it.
        for (const at of [100, 2500, 4890]) {
          window.t.scrollTo(at * 32);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const cell = document.querySelector('.dzg-cell[aria-rowspan][data-col="city"]');
          if (!cell) { out.push({ at, cell: false }); continue; }
          const c = cell.getBoundingClientRect();
          const l = cell.querySelector('.dzg-span-label').getBoundingClientRect();
          const hit = document.elementFromPoint((c.left + c.right) / 2, (top + bottom) / 2);
          out.push({ at, covers: c.top <= top + 1 && c.bottom >= bottom - 1, labelIn: l.top >= top - 1 && l.bottom <= bottom + 1, hit: cell.contains(hit), rowspan: cell.getAttribute('aria-rowspan'), drawn: Math.round(c.height) });
        }
        return out;
      });
      check(name, `spans${pin ? ', pinned' : ''}: a 5 000-row merge covers the view (drawn over the window only), its label stays in view, a covered place hits the tall cell`, res.every((r) => r.covers && r.labelIn && r.hit && r.rowspan === '5000' && r.drawn < 5000), res);
      check(name, `no page error with spans${pin ? ', pinned' : ''}`, errors.length === 0, errors);
      await page.close();
    }

    // ---- spans (step 9b, commit 3 fixes): the hover lights the row under the pointer, not the tall cell's own ----
    for (const qs of ['rows=20000&spans=1', 'rows=200']) {
      const { page, errors } = await load(ctx, qs);
      const box = await page.evaluate(() => {
        const r = (i) => document.querySelector(`.dzg-layer > .dzg-row[aria-rowindex="${i + 2}"]`).getBoundingClientRect();
        // Over the city column (in a spans grid, the tall cell of rows 0 to 4 999), at row 3.
        const c = document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="2"] [data-col="city"]').getBoundingClientRect();
        return { x: (c.left + c.right) / 2, y: (r(3).top + r(3).bottom) / 2 };
      });
      await page.mouse.move(box.x, box.y);
      await frames(page);
      const h = await page.evaluate(() => {
        const bg = (i) => {
          const row = document.querySelector(`.dzg-layer > .dzg-row[aria-rowindex="${i + 2}"]`);
          return [row, row.querySelector('.dzg-seg-start')].map((e) => getComputedStyle(e).backgroundColor).join(' ');
        };
        return { origin: bg(0), under: bg(3), other: bg(6) };
      });
      const spansGrid = qs.includes('spans');
      check(name, `${spansGrid ? 'spans' : 'plain grid'}: the pointer over row 3${spansGrid ? ' (a covered place of the tall cell)' : ''} lights that row and its pinned segment${spansGrid ? ', not the row the tall cell lives in' : ''}`,
        h.under !== h.other && (!spansGrid || h.origin === h.other), h);
      await page.mouse.move(5, 5);
      await frames(page);
      const left = await page.evaluate(() => document.querySelectorAll('.dzg-row[data-hover], .dzg-row:hover').length);
      check(name, `${spansGrid ? 'spans' : 'plain grid'}: no row stays hovered once the pointer leaves the grid`, left === 0, left);
      check(name, `no page error hovering ${qs}`, errors.length === 0, errors);
      await page.close();
    }

    // ---- spans (step 9b, commit 4): the tall cell's drawn rect ends where the span ends; focus through scroll and sort ----
    {
      const { page, errors } = await load(ctx, 'rows=20000&spans=1&pin=1');
      const end = await page.evaluate(async () => {
        // The first run (rows 0 to 4 999) ends in view: the cell's bottom is its last row's bottom.
        window.t.scrollTo(4985 * 32);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const cell = document.querySelector('.dzg-cell[aria-rowspan="5000"][data-col="city"]');
        const last = document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="5001"]');
        const next = document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="5002"] [data-col="city"]');
        if (!cell || !last || !next) return { cell: !!cell, last: !!last, next: !!next };
        const c = cell.getBoundingClientRect(), l = last.getBoundingClientRect();
        const top = document.querySelector('.dzg-header').getBoundingClientRect().bottom;
        return { bottom: c.bottom - l.bottom, covers: c.top <= top + 1, nextTop: next.getBoundingClientRect().top - l.bottom, span: next.getAttribute('aria-rowspan') };
      });
      check(name, 'spans, pinned: a tall cell ending in view ends exactly at its last row (within 1 px), the next run starts under it', end.bottom !== undefined && Math.abs(end.bottom) <= 1 && end.covers && Math.abs(end.nextTop) <= 1 && end.span === '5000', end);
      // Focus on a tall cell, through a long scroll and a sort: the same element, never blurred.
      await page.evaluate(() => window.t.grid.api.focusCell(window.t.key(7), 'city'));
      await frames(page, 2);
      await page.evaluate(() => { window.t.mark = document.activeElement; window.t.events.length = 0; });
      await page.evaluate(() => window.t.scrollTo(15000 * 32));
      await frames(page, 2);
      await page.evaluate(() => window.t.scrollTo(0));
      await frames(page, 2);
      const kept = await page.evaluate(() => ({ same: document.activeElement === window.t.mark, span: window.t.mark.getAttribute('aria-rowspan'), blurs: window.t.events.filter((e) => e.startsWith('blur')).length }));
      await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'city', dir: 'desc' }] }, 'user'));
      await frames(page, 3);
      const sorted = await page.evaluate(() => {
        const f = window.t.grid.kernel.focus;
        const el = window.t.grid.context.rowRenderer.cell(f.row, f.column);
        return { focus: f.column, onIt: document.activeElement === el, blurs: window.t.events.filter((e) => e.startsWith('blur')).length };
      });
      check(name, 'spans: the focused tall cell keeps the focus through a long scroll (same element, no blur) and a sort (the focus on its cell)', kept.same && kept.span === '5000' && kept.blurs === 0 && sorted.focus === 'city' && sorted.onIt && sorted.blurs === 0, { kept, sorted });
      check(name, 'no page error with spans, scroll and sort', errors.length === 0, errors);
      await page.close();
    }

    // ---- grouped headers (step 9b, commit 4): group rects, stretched column headers, keys, AX ----
    for (const qs of ['groups=1', 'groups=1&pin=1&box=1&locale=ar-DZ&dir=rtl', 'groups=1&box=1']) {
      const { page, errors } = await load(ctx, `rows=2000&${qs}`);
      const out = [];
      for (const at of [0, 0.5, 1]) {
        await page.evaluate((at) => {
          const vp = document.querySelector('.dzg-viewport');
          vp.scrollLeft = (getComputedStyle(vp).direction === 'rtl' ? -1 : 1) * (vp.scrollWidth - vp.clientWidth) * at;
        }, at);
        await frames(page, 3);
        out.push(await page.evaluate(() => {
          const leafRow = [...document.querySelectorAll('.dzg-header > [role=row]')].at(-1);
          const leaves = [...leafRow.querySelectorAll('.dzg-hcell[data-col]')];
          const byIndex = new Map(leaves.map((e) => [Number(e.getAttribute('aria-colindex')), e]));
          // Each group whose columns are all mounted: its left and right are theirs, within 1 px.
          let groups = 0, worst = 0;
          for (const gEl of document.querySelectorAll('.dzg-hgroup')) {
            const i = Number(gEl.getAttribute('aria-colindex')), n = Number(gEl.getAttribute('aria-colspan'));
            const cols = Array.from({ length: n }, (_, k) => byIndex.get(i + k));
            if (cols.some((c) => !c)) continue;
            const r = gEl.getBoundingClientRect();
            const rs = cols.map((c) => c.getBoundingClientRect());
            worst = Math.max(worst, Math.abs(r.left - Math.min(...rs.map((x) => x.left))), Math.abs(r.right - Math.max(...rs.map((x) => x.right))));
            groups++;
          }
          // A stretched column header starts at the group row it covers, and is what shows there.
          const bands = [...document.querySelectorAll('.dzg-header > [role=row]')].slice(0, -1).map((r) => r.getBoundingClientRect());
          const vp = document.querySelector('.dzg-viewport').getBoundingClientRect();
          let stretched = 0, badStretch = [];
          for (const leaf of leaves.filter((e) => e.hasAttribute('data-up'))) {
            const up = Math.round(parseFloat(leaf.style.getPropertyValue('--dzg-up')) / 32);
            const r = leaf.getBoundingClientRect();
            const x = (r.left + r.right) / 2;
            if (x < vp.left + 2 || x > vp.right - 2) continue;
            const low = document.elementFromPoint(x, r.bottom - 4)?.closest('.dzg-hcell');
            if (low !== leaf) continue; // under a pinned segment
            const high = document.elementFromPoint(x, r.top + 4)?.closest('.dzg-hcell');
            const want = bands[bands.length - up];
            if (high !== leaf || Math.abs(r.top - want.top) > 1) badStretch.push({ col: leaf.dataset.col, top: r.top, want: want.top, hit: high?.className });
            stretched++;
          }
          // Every group row holds one cell per column of the column headers' row (the box's included).
          const counts = [...document.querySelectorAll('.dzg-header > [role=row]')].map((r) => r.querySelectorAll('[aria-colindex]').length);
          return { groups, worst, stretched, badStretch, counts };
        }));
      }
      check(name, `grouped headers ${qs}: each group cell covers exactly its columns (within 1 px), at start, middle and end`, out.every((o) => o.groups >= 1 && o.worst <= 1) && out.reduce((s, o) => s + o.groups, 0) >= 4, out);
      check(name, `grouped headers ${qs}: a column header with no group above is stretched over the empty group cells and is what shows there`, out.every((o) => o.badStretch.length === 0) && out.reduce((s, o) => s + o.stretched, 0) >= 3, out);
      check(name, `grouped headers ${qs}: each group row holds as many headers as the column headers' row`, out.every((o) => new Set(o.counts).size === 1), out.map((o) => o.counts));
      if (qs === 'groups=1') {
        // Keys: Up from C1's header into Mesures then Données (real DOM focus), Down back to C1.
        const keys = await page.evaluate(async () => {
          const vp = document.querySelector('.dzg-viewport');
          vp.scrollLeft = 0;
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          document.querySelector('.dzg-hcell[data-col="x1"]:not(.dzg-hgroup)').focus();
          const seen = [];
          for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown']) {
            document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            seen.push(document.activeElement.textContent);
          }
          return seen;
        });
        check(name, 'grouped headers: Up from a column header focuses its groups, Down comes back to it', JSON.stringify(keys) === JSON.stringify(['Mesures', 'Données', 'Mesures', 'C1']), keys);
        const v = await axe(page);
        check(name, 'grouped headers: axe, 0 violations', v.length === 0, v);
        if (name === 'chrome') {
          // Chrome's own trees: groups are column headers with their span; VoiceOver's (macOS) headers of a cell
          // (scrolled so that C1 to C6 are mounted; a column with no group repeats its own name in the
          // group rows: shown once here).
          const blink = await chromeDump(ctx, 'DzGrid browser suite', 'blink');
          const groups = blink.nodes.filter((n) => n.role === 'columnHeader' && n.attrs.className?.includes('dzg-hgroup')).map((n) => [n.attrs.name, n.attrs.ariaCellColumnIndex, n.attrs.ariaCellColumnSpan]);
          check(name, 'grouped headers: the accessibility tree exposes group headers as column headers with their column index and span', JSON.stringify(groups.filter((x) => x[0] !== 'Patient')) === JSON.stringify([['Finances', '3', '2'], ['Données', '5', '6'], ['Mesures', '5', '4']]) && groups.filter((x) => x[0] === 'Patient').length === 2, groups);
          await page.evaluate(async () => {
            document.querySelector('.dzg-viewport').scrollLeft = 400;
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          });
          const mac = await chromeDump(ctx, 'DzGrid browser suite', 'mac');
          const cells = mac.nodes.filter((n) => n.role === 'AXCell' && n.attrs.AXARIARowIndex === '5');
          const headers = (col) => { const c = cells.find((x) => x.attrs.AXARIAColumnIndex === String(col)); return c ? mac.ref(c.attrs.AXColumnHeaderUIElements).map((h) => h.text).filter((t, k, a) => t && t !== a[k - 1]) : null; };
          const h = { nom: headers(1), c1: headers(6), c4: headers(9), c6: headers(11) };
          check(name, 'grouped headers: macOS pairs each cell with its own groups (Patient over Nom, Données and Mesures over C1, Données over C4, none over C6)',
            JSON.stringify(h) === JSON.stringify({ nom: ['Patient', 'Nom'], c1: ['Données', 'Mesures', 'C1'], c4: ['Données', 'C4'], c6: ['C6'] }), { h, raw: cells.length });
        }
      }
      check(name, `no page error with grouped headers ${qs}`, errors.length === 0, errors);
      await page.close();
    }

    // ---- palette switched live, direction switched live keeping the logical inline scroll ----
    {
      const { page } = await load(ctx, 'select=multi');
      const r = await page.evaluate(async () => {
        const root = document.querySelector('.dzg');
        const g = window.t.grid;
        g.kernel.dispatch({ type: 'selection.toggle', row: window.t.key(1) }, 'user');
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const row = document.querySelector('.dzg-row[aria-rowindex="3"]');
        const before = getComputedStyle(row).backgroundColor;
        document.documentElement.style.setProperty('--tz-accent', 'light-dark(#be123c, #fb7185)');
        await new Promise((r) => requestAnimationFrame(r));
        const after = getComputedStyle(row).backgroundColor;
        return { before, after, same: document.querySelector('.dzg') === root };
      });
      check(name, 'palette switched live: the selected row changes colour, the grid is not re-created', r.before !== r.after && r.same, r);
      const d = await page.evaluate(async () => {
        const vp = document.querySelector('.dzg-viewport');
        vp.scrollLeft = 300;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const t0 = performance.now();
        window.t.grid.update({ direction: 'rtl' });
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return { logical: -vp.scrollLeft, ms: performance.now() - t0 };
      });
      check(name, 'direction switched live keeps the logical inline scroll, within 100 ms', Math.abs(d.logical - 300) <= 1 && d.ms <= 100, d);
      await page.close();
    }
  } finally {
    await b.close();
    open = null;
  }
}

try {
  for (const e of engines) await runEngine(e);
} finally {
  await site.close();
}
const failed = checks.filter((c) => !c.ok).length;
console.log(`\ntest:browser: ${checks.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
