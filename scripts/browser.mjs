/**
 * The grid in a real browser: what jsdom cannot see. `npm run test:browser`
 * (Chrome; `-- --all` adds Firefox and WebKit for the RTL and focus checks; `-- --only parts` the cell parts alone, `-- --only rules` the selection rules and the header's box, step 21;
 * `-- --only motion` motion with GSAP, step 26, with a tree's toggles, Phase 4 step 6; `-- --only tree` the tree, Phase 4 step 4; `-- --only detail` detail rows over a million, step 9, and `@dzgrid/dom/detail`, step 10; `-- --only filters` the floating row shown and hidden live, Phase 4 step 12; `-- --only themes` the cascade layer, the showcase themes and the framework bridges on real builds, docs/behaviors/theming.md (`-- --only bridges` the bridges alone); `-- --only dates` the date filters; `-- --only demos` the showcase demos, docs/phase-5-steps/demos-plan.md §4; `-- --only edit-marks` the edit marks, Phase 5 step 4; `-- --only editors` the editors, Phase 5 steps 5–6; `-- --only playground` the editing demo on the running playground, step 6; `-- --only edit-saves` the saves end to end, step 7; `-- --only edit-undo` undo and redo, the tree's field, step 8 — `tree`, `detail` and `playground` gain step 8's checks).
 * One browser at a time, closed in finally. Screenshots go to
 * packages/dom/test/browser/results/ (gitignored), for a person to look at.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { serve, browser } from '../spikes/kit.mjs';
import { chromeDump } from '../spikes/s4-a11y/ax.mjs';
import { buildFrameworks } from './frameworks.mjs';
import { resolveColor } from './check-contrast.mjs';
import { editUndoChecks, editTreeChecks, editDetailChecks, playgroundUndoChecks } from './browser-undo.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}packages/dom/test/browser/results`;
mkdirSync(OUT, { recursive: true });
// tzslot for the page's date filters (step 14): bundled once, two entries sharing one core (importmap in index.html).
await build({ entryPoints: { dom: '@tzslot/dom', core: '@tzslot/core' }, bundle: true, splitting: true, format: 'esm', outdir: `${ROOT}node_modules/.cache/dzgrid-browser`, absWorkingDir: ROOT, logLevel: 'error' });
// `-- --engine webkit`: one engine alone (with `--only`, a group's checks in that engine).
const engines = process.argv.includes('--all') ? ['chrome', 'firefox', 'webkit'] : process.argv.includes('--engine') ? [process.argv[process.argv.indexOf('--engine') + 1]] : ['chrome'];
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
  // A fixed start for the grid's clock (`DATES_CLOCK` to try another: today, a clock-change day, an ordinary day).
  const start = process.env.DATES_CLOCK ?? '2026-06-10T10:00:00Z';
  for (const [qs, rtl, popName, dayText] of cases) {
    const { page, errors } = await load(ctx, `${qs}&clock=${start}`);
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
    // Review of the showcase themes (R1): another month's days in the muted colour, over tzslot's own
    // unlayered `color: inherit` (the theme's rule stays outside its layer for that).
    const outside = await page.evaluate(() => {
      const d = document.querySelector('.dzg-popup :is(.tz-cal__day--outside, .tz-range__day--outside):not(.tz-cal__day--selected, .tz-range__day--start, .tz-range__day--end)');
      const pop = document.querySelector('.dzg-popup');
      if (!d || !pop) return null;
      const ref = document.createElement('span');
      ref.style.color = 'var(--tz-fg-muted)';
      pop.append(ref);
      const want = getComputedStyle(ref).color;
      ref.remove();
      return { got: getComputedStyle(d).color, want, fg: getComputedStyle(pop).color };
    });
    check(name, `${tag}: another month's days in the muted colour (${outside?.got}), not the text colour`, outside && outside.got === outside.want && outside.got !== outside.fg, outside);
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
    // The day filter's shortcut gone and painted before the clock moves: its midnight timer is dropped, so the next
    // one is set from the moved clock, whatever day the run started on.
    await frames(page);
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
        // Step 13: wait on the state, not a fixed two frames (one miss under load): the focused row's aria-expanded
        // turned, and on the motion page the glide started (a tween running, a row translated). At most 4 s, polled
        // each frame; the poll reads attributes and inline styles only (no layout read counted).
        const glides = p === a.page;
        await p.waitForFunction(({ want, glides }) => document.activeElement?.closest('.dzg-row')?.getAttribute('aria-expanded') === want
          && (!glides || (window.t.running() > 0 && [...document.querySelectorAll('.dzg-layer > .dzg-row')].some((r) => (r.style.transform || '').includes('translate')))),
        { want: key === fwd ? 'true' : 'false', glides }, { timeout: 4000, polling: 'raf' }).catch(() => {});
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
  // Lazy children (Phase 4 step 7, tree-lazy.md): the services only; real keys open one, the loading row
  // (busy, its words, axe 0), a failure (the error row, Retry ≥ 24 px, axe 0), Retry by Enter on the row,
  // the children; what is said, in French and in Arabic right to left; the focus to the first child.
  const lazyCases = [
    { qs: 'lazy=1&locale=fr-FR&theme=light', tag: 'tree lazy fr ltr light', fwd: 'ArrowRight', loading: 'Chargement…', error: 'Les données n’ont pas pu être chargées Réessayer', said: ['Chargement', 'Échec du chargement', 'Chargement', 'Service 1 développé, 77 lignes'] },
    { qs: 'lazy=1&locale=ar-DZ&dir=rtl&theme=dark', tag: 'tree lazy ar rtl dark', fwd: 'ArrowLeft', loading: 'جار التحميل…', error: 'تعذر تحميل البيانات إعادة المحاولة', said: ['جار التحميل', 'فشل التحميل', 'جار التحميل', 'تم توسيع Service 1، 77 صفا'] },
  ];
  for (const c of lazyCases) {
    const { page, errors } = await open(c.qs);
    const state = () => page.evaluate(() => {
      const r = document.querySelector('.dzg-layer > .dzg-row[data-kind="loading"]');
      const b = r?.querySelector('.dzg-retry')?.getBoundingClientRect();
      const a = document.activeElement;
      return { busy: r?.getAttribute('aria-busy') ?? null, level: r?.getAttribute('aria-level'), size: r?.getAttribute('aria-setsize'), text: r?.querySelector('.dzg-label')?.textContent ?? null, retry: b ? { h: b.height, w: b.width } : null, loads: window.t.loads.length, focus: a?.closest('.dzg-row')?.getAttribute('aria-rowindex') ?? null, focusKind: a?.closest('.dzg-row')?.getAttribute('data-kind') ?? null };
    });
    await page.evaluate(() => window.t.grid.api.focusCell(window.t.key('s1'), 'name'));
    await frames(page);
    await page.keyboard.press(c.fwd);
    await frames(page, 2);
    const loading = await state();
    let v = await axe(page);
    check(name, `${c.tag}: → opens a declared service: one request, the loading row (busy, level 2, size -1, « ${c.loading} »); axe 0`, loading.loads === 1 && loading.busy === 'true' && loading.level === '2' && loading.size === '-1' && loading.text === c.loading && v.length === 0, { loading, v });
    await page.waitForTimeout(120);
    await page.evaluate(() => window.t.loads[0].no());
    await frames(page, 2);
    await page.waitForTimeout(120);
    const failed = await state();
    v = await axe(page);
    check(name, `${c.tag}: a failure: the error row (not busy, its words, Retry ≥ 24 px); axe 0`, failed.busy === null && failed.text === c.error && failed.retry && failed.retry.h >= 24 && failed.retry.w >= 24 && v.length === 0, { failed, v });
    await page.keyboard.press('ArrowDown');
    await frames(page);
    const onError = await state();
    await page.keyboard.press('Enter');
    await frames(page, 2);
    // The live region says a sentence after a 50 ms beat; a newer one replaces one not yet said.
    await page.waitForTimeout(120);
    const again = await state();
    check(name, `${c.tag}: Enter on the error row retries (a second request, loading again, the focus kept on the row)`, onError.focusKind === 'loading' && again.loads === 2 && again.busy === 'true' && again.focusKind === 'loading', { onError, again });
    await page.evaluate(() => window.t.loads[1].ok());
    await frames(page, 3);
    await page.waitForTimeout(120);
    const done = await state();
    const said = await page.evaluate(() => window.said);
    check(name, `${c.tag}: the children replace the loading row, the focus on the first child; said ${JSON.stringify(c.said)}`, done.busy === null && done.text === null && done.focus === again.focus && JSON.stringify(said.slice(-4)) === JSON.stringify(c.said), { done, said });
    v = await axe(page);
    check(name, `${c.tag}: axe 0 with the children; no page error`, v.length === 0 && errors.length === 0, { v, errors });
    await page.screenshot({ path: `${OUT}/${name}-tree-lazy-${c.qs.includes('ar-DZ') ? 'ar' : 'fr'}.png`, clip: { x: 0, y: 0, width: 1000, height: 640 } });
    await page.close();
  }
  // Sticky parent rows (tree-sticky.md, sticky-blueprint.md): « Nom » pinned at the start, C5 at the end,
  // French and Arabic right to left. Copies under the header line up with it to the pixel, through a
  // horizontal scroll; axe 0; the push (screenshot); a click on a copy focuses the real row clear of the
  // copies, without selecting; its chevron closes; forced colours; print hides them.
  for (const c of [
    { qs: 'pin=1&locale=fr-FR&theme=light', tag: 'tree sticky fr ltr light', rtl: false, closed: 'Patient 3 réduit' },
    { qs: 'pin=1&locale=ar-DZ&dir=rtl&theme=dark', tag: 'tree sticky ar rtl dark', rtl: true, closed: 'تم طي Patient 3' },
  ]) {
    const { page, errors } = await open(c.qs);
    // Service 0 open (index 0), Patient 3 (index 3) opened: its stays at 4, 5, 6; scrolled into the first stay (Patient 4, at 7, is three rows below the stack's edge).
    await page.evaluate(() => { window.t.grid.kernel.dispatch({ type: 'rows.expand', rows: [window.t.key('s0p3')], expanded: true }, 'host'); });
    await frames(page);
    const h = await page.evaluate(() => window.t.rowH());
    await page.evaluate((h) => window.t.scrollTo(4 * h + 5), h);
    await frames(page, 3);
    const look = () => page.evaluate(() => {
      const copies = [...document.querySelectorAll('.dzg-sticky > .dzg-row')];
      const header = document.querySelector('.dzg-header');
      const rows = [...header.querySelectorAll(':scope > .dzg-hrow')];
      const hb = rows.at(-1).getBoundingClientRect().bottom;
      let worst = 0;
      for (const r of copies) for (const cell of r.querySelectorAll('[data-col]')) {
        const hc = document.querySelector(`.dzg-header .dzg-hrow .dzg-hcell[data-col="${cell.dataset.col}"]`);
        if (!hc) return { missing: cell.dataset.col };
        const a = hc.getBoundingClientRect(), b = cell.getBoundingClientRect();
        worst = Math.max(worst, Math.abs(a.left - b.left), Math.abs(a.right - b.right));
      }
      const hcheck = document.querySelector('.dzg-header .dzg-check'), ccheck = copies[0]?.querySelector('.dzg-check');
      if (hcheck && ccheck) { const a = hcheck.getBoundingClientRect(), b = ccheck.getBoundingClientRect(); worst = Math.max(worst, Math.abs(a.left - b.left), Math.abs(a.right - b.right)); }
      const tops = copies.map((r) => r.getBoundingClientRect().top - hb);
      const mid = copies[0] && (() => { const b = copies[0].querySelector('[data-col="x2"]')?.getBoundingClientRect() ?? copies[0].getBoundingClientRect(); return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest('.dzg-sticky') !== null; })();
      return { names: copies.map((r) => r.querySelector('[data-col="name"]')?.textContent), worst, tops, onTop: mid, hidden: document.querySelector('.dzg-sticky')?.getAttribute('aria-hidden'), headerH: header.offsetHeight, rowindex: copies.some((r) => r.hasAttribute('aria-rowindex') || r.hasAttribute('aria-level')) };
    });
    const s0 = await look();
    let v = await axe(page);
    check(name, `${c.tag}: Service 0 and Patient 3 pinned under the header (aria-hidden, no row attributes), aligned with the headers (${s0.worst?.toFixed?.(2)} px), on top of the body; axe 0`,
      JSON.stringify(s0.names) === '["Service 0","Patient 3"]' && s0.worst < 0.5 && Math.abs(s0.tops[0]) < 0.5 && Math.abs(s0.tops[1] - h) < 0.5 && s0.onTop && s0.hidden === 'true' && !s0.rowindex && v.length === 0, { s0, v });
    // A horizontal scroll: the copies' centre cells follow the headers, the pinned ones stay.
    await page.evaluate(() => { const vp = document.querySelector('.dzg-viewport'); vp.scrollLeft = document.documentElement.dir === 'rtl' ? -300 : 300; });
    await frames(page, 3);
    const s1 = await look();
    const pinned = await page.evaluate(() => {
      const r = document.querySelector('.dzg-sticky > .dzg-row');
      const hs = document.querySelector('.dzg-header .dzg-hrow .dzg-seg-start').getBoundingClientRect(), cs = r.querySelector('.dzg-seg-start').getBoundingClientRect();
      const he = document.querySelector('.dzg-header .dzg-hrow .dzg-seg-end').getBoundingClientRect(), ce = r.querySelector('.dzg-seg-end').getBoundingClientRect();
      return Math.max(Math.abs(hs.left - cs.left), Math.abs(he.left - ce.left));
    });
    check(name, `${c.tag}: scrolled 300 px across: copies still aligned (${s1.worst?.toFixed?.(2)} px), pinned segments with the header's (${pinned.toFixed(2)} px); the header's height unchanged`, s1.worst < 0.5 && pinned < 0.5 && s1.headerH === s0.headerH, { s1, pinned });
    await page.evaluate(() => { document.querySelector('.dzg-viewport').scrollLeft = 0; });
    // The push: Patient 3's last stay (6) near the top, Patient 4 (7) under its copy: the copy slides up.
    await page.evaluate((h) => window.t.scrollTo(5 * h + h / 2), h);
    await frames(page, 3);
    const push = await look();
    await page.screenshot({ path: `${OUT}/${name}-tree-sticky-push-${c.rtl ? 'ar' : 'fr'}.png`, clip: { x: 0, y: 0, width: 1000, height: 400 } });
    check(name, `${c.tag}: the push: Patient 3's copy slid up by half a row (${push.tops?.[1]?.toFixed?.(1)} px) as Patient 4 comes`, JSON.stringify(push.names) === '["Service 0","Patient 3"]' && Math.abs(push.tops[1] - h / 2) < 1, push);
    // A click on Patient 3's copy (city): the real row focused, under Service 0's copy, nothing selected.
    await page.evaluate((h) => window.t.scrollTo(4 * h + 5), h);
    await frames(page, 3);
    const box = await page.evaluate(() => {
      const r = [...document.querySelectorAll('.dzg-sticky > .dzg-row')][1];
      const cell = r?.querySelector('[data-col="city"]');
      if (!cell) return { missing: true, cols: r ? [...r.querySelectorAll('[data-col]')].map((x) => x.dataset.col) : null, scrollLeft: document.querySelector('.dzg-viewport').scrollLeft, body: [...document.querySelector('.dzg-layer > .dzg-row').querySelectorAll('[data-col]')].map((x) => x.dataset.col) };
      const b = cell.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    });
    if (box.missing) console.log(`       sticky: no city cell in the copy ${JSON.stringify(box)}`);
    await page.mouse.click(box.x, box.y);
    await frames(page, 3);
    const clicked = await page.evaluate(() => {
      const a = document.activeElement;
      const copies = [...document.querySelectorAll('.dzg-sticky > .dzg-row')];
      const bottom = Math.max([...document.querySelectorAll('.dzg-header > .dzg-hrow')].at(-1).getBoundingClientRect().bottom, ...copies.map((r) => r.getBoundingClientRect().bottom));
      return { inLayer: !!a.closest('.dzg-layer'), col: a.dataset.col, row: String(window.t.grid.kernel.focus?.row), clear: a.getBoundingClientRect().top - bottom, sel: window.t.grid.kernel.selection.keys.size, inSticky: !!a.closest('.dzg-sticky') };
    });
    check(name, `${c.tag}: a click on a copy focuses the real row (city), clear of the copies (${clicked.clear.toFixed(1)} px), nothing selected`, clicked.inLayer && !clicked.inSticky && clicked.col === 'city' && clicked.row.endsWith(':s0p3') && clicked.clear > -0.5 && clicked.sel === 0, clicked);
    // Its chevron closes it, said once.
    await page.evaluate((h) => window.t.scrollTo(4 * h + 5), h);
    await frames(page, 3);
    const tg = await page.evaluate(() => { const b = [...document.querySelectorAll('.dzg-sticky > .dzg-row')][1].querySelector('.dzg-toggle').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height }; });
    await page.mouse.click(tg.x, tg.y);
    await page.waitForTimeout(150);
    const shut = await page.evaluate(() => ({ open: window.t.grid.kernel.expansion.has(window.t.key('s0p3')), said: window.said.at(-1), sel: window.t.grid.kernel.selection.keys.size }));
    check(name, `${c.tag}: the copy's chevron (${tg.w}×${tg.h} px) closes Patient 3, « ${c.closed} », nothing selected`, !shut.open && shut.said === c.closed && shut.sel === 0 && tg.w >= 24 && tg.h >= 24, { shut, tg });
    // Forced colours (the line under the stack, the chevron) and print (no copies).
    await page.evaluate(() => { window.t.grid.kernel.dispatch({ type: 'rows.expand', rows: [window.t.key('s0p3')], expanded: true }, 'host'); });
    await page.evaluate((h) => window.t.scrollTo(4 * h + 5), h);
    await frames(page, 3);
    await page.emulateMedia({ forcedColors: 'active' });
    await page.waitForTimeout(200);
    const forced = await page.evaluate(() => {
      const probe = (c) => { const p = document.createElement('span'); p.style.color = c; document.body.append(p); const v = getComputedStyle(p).color; p.remove(); return v; };
      const last = [...document.querySelectorAll('.dzg-sticky > .dzg-row')].at(-1);
      const cell = last.querySelector('.dzg-cell');
      return { line: getComputedStyle(cell).borderBlockEndColor, width: getComputedStyle(cell).borderBlockEndWidth, canvasText: probe('CanvasText'), chevron: getComputedStyle(last.querySelector('.dzg-toggle'), '::before').borderBottomColor, buttonText: probe('ButtonText') };
    });
    await page.screenshot({ path: `${OUT}/${name}-tree-sticky-forced-${c.rtl ? 'ar' : 'fr'}.png`, clip: { x: 0, y: 0, width: 1000, height: 400 } });
    await page.emulateMedia({ forcedColors: 'none' });
    check(name, `${c.tag}: forced colours: a 2 px line under the stack in CanvasText, the chevron in ButtonText`, forced.line === forced.canvasText && forced.width === '2px' && forced.chevron === forced.buttonText, forced);
    await page.emulateMedia({ media: 'print' });
    const printed = await page.evaluate(() => getComputedStyle(document.querySelector('.dzg-sticky')).display);
    await page.emulateMedia({ media: 'screen' });
    check(name, `${c.tag}: print: the copies are not printed`, printed === 'none', printed);
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

/**
 * Detail rows (Phase 4 step 9, step09-plan.md; S12's numbers): 1 000 000 rows and 2 000 open details of
 * 240 px, French left to right light and Arabic right to left dark. Row 999 999 reachable by Ctrl+End,
 * 0 px offset error at both ends, every mounted row where the layout says, the wheel and PageDown exact,
 * the focus kept on a retained detail row, a detail height change above the view keeping the top row,
 * the detail cell at the view's start under a horizontal scroll, axe 0 with a detail row in view and focused.
 */
async function detailChecks(name, ctx) {
  const cases = [
    { qs: 'locale=fr-FR&theme=light', tag: 'detail fr ltr light', rtl: false },
    { qs: 'locale=ar-DZ&dir=rtl&theme=dark', tag: 'detail ar rtl dark', rtl: true },
  ];
  for (const c of cases) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1000, height: 760 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(site.root(`packages/dom/test/browser/detail.html?${c.qs}`));
    await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
    await frames(page, 3);
    // Where the rows really are against the layout, and the ends.
    const look = () => page.evaluate(() => {
      const { ctx } = window.t;
      const vp = document.querySelector('.dzg-viewport');
      const v = vp.getBoundingClientRect();
      const hb = document.querySelector('.dzg-header').getBoundingClientRect().bottom;
      const d = ctx.rows.displayed;
      const L = ctx.layout;
      const top = ctx.scroll.logicalTop;
      let worst = 0;
      let n = 0;
      for (const r of document.querySelectorAll('.dzg-layer > .dzg-row')) {
        const i = Number(r.getAttribute('aria-rowindex')) - 2;
        const b = r.getBoundingClientRect();
        if (b.bottom < hb || b.top > v.bottom) continue;
        n++;
        worst = Math.max(worst, Math.abs(b.top - (hb + L.offsetOf(i) - top)), Math.abs(b.height - L.heightOf(i)));
      }
      const first = document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="2"]');
      const last = document.querySelector(`.dzg-layer > .dzg-row[aria-rowindex="${d.count + 1}"]`);
      const inner = v.top + vp.clientTop + vp.clientHeight;
      return { count: d.count, total: L.total, n, worst, top, firstErr: first ? first.getBoundingClientRect().top - hb : null, lastErr: last ? last.getBoundingClientRect().bottom - inner : null };
    });
    const at0 = await look();
    const cell0 = await page.evaluate(() => {
      const r = document.querySelector('.dzg-layer > .dzg-row[data-kind="detail"]');
      const dc = r.querySelector('.dzg-dcell');
      return { kids: r.querySelectorAll('.dzg-cell').length, role: dc.getAttribute('role'), span: dc.getAttribute('aria-colspan'), label: dc.getAttribute('aria-label'), h: r.getBoundingClientRect().height, rowcount: document.querySelector('.dzg-viewport').getAttribute('aria-rowcount') };
    });
    let v = await axe(page);
    check(name, `${c.tag}: 1 002 000 rows (1 000 000 + 2 000 details), the top at 0 px, every row in view where the layout says (< 0.5 px), a detail row one gridcell over 8 columns named after its master, 240 px; axe 0`,
      at0.count === 1_002_000 && at0.firstErr === 0 && at0.n > 5 && at0.worst < 0.5 && cell0.kids === 0 && cell0.role === 'gridcell' && cell0.span === '8' && cell0.label === (c.rtl ? 'مريض 0' : 'Patient 0') && cell0.h === 240 && cell0.rowcount === '1002001' && v.length === 0, { at0, cell0, v });
    // Keys: Down onto the detail of row 0 (one stop), Left stays, Down to row 1, the column kept.
    await page.evaluate(() => window.t.grid.api.focusCell(window.t.key(0), 'c2'));
    await frames(page);
    const where = () => page.evaluate(() => {
      const a = document.activeElement;
      const r = a.closest('.dzg-row');
      return { i: r ? Number(r.getAttribute('aria-rowindex')) - 2 : null, detail: a.classList.contains('dzg-dcell'), col: a.dataset.col ?? null, focus: window.t.grid.kernel.focus };
    });
    await page.keyboard.press('ArrowDown');
    await frames(page);
    const k1 = await where();
    await page.keyboard.press(c.rtl ? 'ArrowLeft' : 'ArrowRight');
    await page.keyboard.press('Home');
    await frames(page);
    const k2 = await where();
    v = await axe(page);
    await page.keyboard.press('ArrowDown');
    await frames(page);
    const k3 = await where();
    check(name, `${c.tag}: Down reaches the detail as one stop, ${c.rtl ? 'Left' : 'Right'} and Home stay, Down goes on to row 1 in the same column; axe 0 with the detail focused`,
      k1.i === 1 && k1.detail && k2.i === 1 && k2.detail && k2.focus.column === 'c2' && k3.i === 2 && k3.col === 'c2' && v.length === 0, { k1, k2, k3, v });
    // Ctrl+End: the last row, the detail of row 999 999, the bottom at 0 px; Up: row 999 999 itself.
    await page.keyboard.press('ControlOrMeta+End');
    await frames(page, 3);
    const end = { at: await where(), ...(await look()) };
    await page.keyboard.press('ArrowUp');
    await frames(page);
    const up = await page.evaluate(() => { const a = document.activeElement; return { i: Number(a.closest('.dzg-row').getAttribute('aria-rowindex')) - 2, key: String(window.t.grid.kernel.focus.row), col: a.dataset.col }; });
    check(name, `${c.tag}: Ctrl+End reaches the last row (the detail of row 999 999), its bottom at 0 px, rows placed (< 0.5 px); Up focuses row 999 999`,
      end.at.i === 1_001_999 && end.at.detail && end.lastErr === 0 && end.worst < 0.5 && up.i === 1_001_998 && up.key === String(await page.evaluate(() => window.t.key(999_999))) && up.col === 'c5', { end, up });
    // The wheel, intercepted above the cap: exact logical moves, rows placed.
    await page.evaluate(() => window.t.scrollTo(window.t.ctx.layout.total / 2));
    await frames(page, 2);
    const box = await page.locator('.dzg-viewport').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const w0 = await page.evaluate(() => window.t.logicalTop());
    for (let k = 0; k < 20; k++) { await page.mouse.wheel(0, 100); await frames(page, 1); }
    await frames(page, 2);
    const w1 = { top: await page.evaluate(() => window.t.logicalTop()), scaled: await page.evaluate(() => window.t.ctx.scroll.mapper.scaled), ...(await look()) };
    check(name, `${c.tag}: 20 wheel steps of 100 px move exactly 2 000 logical px (scaled), rows placed (< 0.5 px)`, w1.scaled && w1.top - w0 === 2000 && w1.worst < 0.5 && w1.n > 5, { w0, w1 });
    // PageDown from a row above a detail: the row a page (in px) below, brought into view.
    const pd = await page.evaluate(async () => {
      const { ctx, grid, masters, key } = window.t;
      const d = ctx.rows.displayed;
      const m = masters[1000];
      const at = d.indexOf(key(m - 3));
      grid.api.focusCell(key(m - 3), 'n');
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { at };
    });
    await page.keyboard.press('PageDown');
    await frames(page, 2);
    const pd2 = await page.evaluate((from) => {
      const { ctx } = window.t;
      const L = ctx.layout;
      const h = ctx.rowHeight();
      const page = Math.max(1, Math.floor(ctx.viewBlock / h) - 1);
      const want = L.indexAt(L.offsetOf(from) + page * h);
      const a = document.activeElement;
      const r = a.closest('.dzg-row');
      const b = r.getBoundingClientRect();
      const vp = document.querySelector('.dzg-viewport').getBoundingClientRect();
      const hb = document.querySelector('.dzg-header').getBoundingClientRect().bottom;
      return { want, byCount: from + page, got: Number(r.getAttribute('aria-rowindex')) - 2, inView: b.top >= hb - 0.5 && b.bottom <= vp.bottom + 0.5 };
    }, pd.at);
    check(name, `${c.tag}: PageDown lands on the row a page below by distance (over a 240 px detail), in view`, pd2.want === pd2.got && pd2.inView && pd2.got !== pd2.byCount, { pd, pd2 });
    // The focus on a retained detail row through the end and the top, then back.
    await page.evaluate(() => window.t.grid.api.focusCell(window.t.x(window.t.masters[700]), 'n'));
    await frames(page, 2);
    const held = await page.evaluate(async () => {
      const el = document.activeElement;
      const go = async (l) => { window.t.scrollTo(l); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return document.activeElement === el && el.isConnected; };
      const a = await go(1e12);
      const b = await go(0);
      window.t.grid.api.ensureVisible(window.t.x(window.t.masters[700]));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { detail: el.classList.contains('dzg-dcell'), a, b, c: document.activeElement === el };
    });
    check(name, `${c.tag}: the focus on a detail row is kept, the same element, through the end and the top`, held.detail && held.a && held.b && held.c, held);
    // A detail above the view grows: the top row stays, on screen too.
    const grow = await page.evaluate(async () => {
      const { ctx, masters, x } = window.t;
      window.t.scrollTo(ctx.layout.offsetOf(ctx.rows.displayed.indexOf(x(masters[1500]))) + 5000);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const d = ctx.rows.displayed;
      const topKey = () => d.keyAt(ctx.layout.indexAt(ctx.scroll.logicalTop));
      const screen = (k) => document.querySelector(`.dzg-layer > .dzg-row[aria-rowindex="${d.indexOf(k) + 2}"]`).getBoundingClientRect().top;
      const k0 = topKey();
      const y0 = screen(k0);
      const before = [];
      for (const [h, m] of [[480, 1499], [120, 1500], [777, 1200], [40, 0]]) {
        ctx.layout.setHeights([[d.indexOf(x(masters[m])), h]]);
        ctx.schedule();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        before.push({ same: topKey() === k0, dy: screen(k0) - y0 });
      }
      return before;
    });
    check(name, `${c.tag}: four detail height changes above the view (240 → 480, 120, 777, 40) keep the top row, 0 px on screen`, grow.every((g) => g.same && Math.abs(g.dy) <= 0.5), grow);
    // Horizontal scroll: the detail cell stays at the view's inline start.
    const hz = await page.evaluate(async () => {
      const vp = document.querySelector('.dzg-viewport');
      window.t.scrollTo(0);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      vp.scrollLeft = document.documentElement.dir === 'rtl' ? -200 : 200;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const dc = document.querySelector('.dzg-dcell').getBoundingClientRect();
      const v = vp.getBoundingClientRect();
      const left = v.left + vp.clientLeft;
      const right = left + vp.clientWidth;
      return { moved: Math.abs(vp.scrollLeft), off: document.documentElement.dir === 'rtl' ? right - dc.right : dc.left - left, w: dc.width, view: vp.clientWidth };
    });
    check(name, `${c.tag}: under a horizontal scroll the detail cell stays at the view's start, as wide as the view`, hz.moved > 100 && Math.abs(hz.off) < 0.5 && Math.abs(hz.w - hz.view) < 0.5, hz);
    check(name, `${c.tag}: no page error`, errors.length === 0, errors);
    await page.close();
  }
}

/**
 * `@dzgrid/dom/detail` (Phase 4 step 10, step10-plan.md): 1 000 000 masters, 200 open, each panel a grid of
 * visits (`nestedGrid`), French left to right light and Arabic right to left dark. axe 0 with a panel open,
 * focused, its inner grid focused, and closed; the panel's name; the nested grid's keys (Enter in, arrows
 * inside only, Escape out once, Down on); the wheel: inner first, outer at the inner edge (scaled: the
 * feature's; 10 000 rows: the browser's own chaining); end to end with the inner grids balanced; 'auto'
 * heights measured (free content), a line added grows the row, no ResizeObserver loop.
 */
async function detailFeatureChecks(name, ctx) {
  const cases = [
    { qs: 'locale=fr-FR&theme=light', tag: 'detail() fr ltr light', rtl: false, label: 'Détails de Patient 0', closed: 'Patient 0 réduit' },
    { qs: 'locale=ar-DZ&dir=rtl&theme=dark', tag: 'detail() ar rtl dark', rtl: true, label: 'تفاصيل Patient 0', closed: 'تم طي Patient 0' },
  ];
  const open = async (qs) => {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1000, height: 760 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(site.root(`packages/dom/test/browser/detail-feature.html?${qs}`));
    await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
    await frames(page, 3);
    return { page, errors };
  };
  const where = (page) => page.evaluate(() => {
    const a = document.activeElement;
    const outer = document.querySelector('#host > .dzg');
    const inner = a.closest('.dzg') !== outer;
    const r = a.closest('.dzg-row');
    return { inner, dcell: a.classList.contains('dzg-dcell'), label: a.querySelector(':scope > .dzg-dbody')?.getAttribute('aria-label') ?? null, row: r ? Number(r.getAttribute('aria-rowindex')) - 2 : null, col: a.dataset.col ?? null, top: window.t.logicalTop(), focus: window.t.grid.kernel.focus };
  });
  for (const c of cases) {
    const { page, errors } = await open(c.qs);
    // Open at load: the panel of row 0 holds its inner grid; names; axe.
    const at0 = await page.evaluate(() => {
      const r = document.querySelector('.dzg-layer > .dzg-row[data-kind="detail"]');
      const dc = r.querySelector(':scope > .dzg-dcell');
      const inner = dc.querySelector('.dzg-dbody > .dzg .dzg-viewport');
      const master = document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="2"] .dzg-cell[data-col="name"]');
      return { count: window.t.ctx.rows.displayed.count, own: dc.getAttribute('aria-label'), label: dc.querySelector('.dzg-dbody[role="group"]').getAttribute('aria-label'), inner: inner?.getAttribute('aria-label'), h: r.getBoundingClientRect().height, expanded: master.getAttribute('aria-expanded'), rowExpanded: master.closest('.dzg-row').hasAttribute('aria-expanded'), toggle: !!master.querySelector('.dzg-toggle[aria-hidden="true"][data-open]') };
    });
    // The cell's computed name (Playwright's accname): its content's group, « Détails de Patient 0 » alone.
    at0.named = await page.getByRole('gridcell', { name: c.label, exact: true }).count();
    let v = await axe(page);
    check(name, `${c.tag}: 1 000 200 rows, the panel of Patient 0 named « ${c.label} » (from its content's group), a grid of visits inside, 240 px; aria-expanded on the chevron cell, not the row; axe 0 open`,
      at0.count === 1_000_200 && at0.label === c.label && at0.own === null && at0.named === 1 && /Patient 0$/.test(at0.inner ?? '') && at0.h === 240 && at0.expanded === 'true' && !at0.rowExpanded && at0.toggle && v.length === 0, { at0, v });
    // Keys: Down to the panel, Enter into the inner grid, arrows inside only, Escape out once, Down on.
    await page.evaluate(() => window.t.grid.api.focusCell(window.t.key(0), 'n'));
    await frames(page, 2);
    await page.keyboard.press('ArrowDown');
    await frames(page, 2);
    const k1 = await where(page);
    const v1 = await axe(page);
    await page.keyboard.press('Enter');
    await frames(page, 2);
    const k2 = await where(page);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press(c.rtl ? 'ArrowLeft' : 'ArrowRight');
    await frames(page, 2);
    const k3 = await where(page);
    const inner3 = await page.evaluate(() => [...window.t.count.grids][0]?.kernel.focus ?? null);
    const v3 = await axe(page);
    await page.keyboard.press('Escape');
    await frames(page, 2);
    const k4 = await where(page);
    await page.keyboard.press('ArrowDown');
    await frames(page, 2);
    const k5 = await where(page);
    check(name, `${c.tag}: Down reaches the panel (one stop, its name), Enter goes into the inner grid, arrows move it only (the outer focus and scroll stay), Escape back to the panel, Down to Patient 1 in the same column; axe 0 focused and inside`,
      k1.dcell && k1.label === c.label && !k1.inner && k2.inner && k3.inner && k3.top === k1.top && k3.focus.row === k1.focus.row && inner3?.row?.endsWith('0-2') && inner3?.column === 'n' && k4.dcell && !k4.inner && k5.row === 2 && k5.col === 'n' && v1.length === 0 && v3.length === 0,
      { k1, k2, k3, inner3, k4, k5, v1, v3 });
    // Closed by the user (back on the chevron column): said, the row gone, axe 0 closed; reopened.
    await page.evaluate(() => window.t.grid.api.focusCell(window.t.key(0), 'name'));
    await frames(page, 2);
    await page.keyboard.press(c.rtl ? 'ArrowRight' : 'ArrowLeft');
    await frames(page, 4);
    const shut = await page.evaluate(() => ({ open: window.t.grid.kernel.expansion.has(window.t.key(0)), said: window.t.ctx.live.said, count: window.t.ctx.rows.displayed.count, cell: document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="2"] .dzg-cell[data-col="name"]').getAttribute('aria-expanded') }));
    v = await axe(page);
    await page.keyboard.press(c.rtl ? 'ArrowLeft' : 'ArrowRight');
    await frames(page, 2);
    check(name, `${c.tag}: back on the chevron column closes Patient 0, said « ${c.closed} », 1 000 199 rows; axe 0 closed`,
      !shut.open && shut.said === c.closed && shut.count === 1_000_199 && shut.cell === 'false' && v.length === 0, { shut, v });
    // The wheel over the inner grid (the outer one is scaled): the inner scrolls first, the outer at its edge.
    const wheelAt = async (deltaY) => {
      const b = await page.locator('.dzg-dbody .dzg-viewport').first().boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.7);
      await page.mouse.wheel(0, deltaY);
      await frames(page, 3);
      return page.evaluate(() => ({ inner: document.querySelector('.dzg-dbody .dzg-viewport').scrollTop, outer: window.t.logicalTop(), scaled: window.t.ctx.scroll.mapper.scaled }));
    };
    await page.evaluate(() => window.t.scrollTo(0));
    await frames(page, 3);
    const w0 = await page.evaluate(() => window.t.logicalTop());
    const w1 = await wheelAt(100);
    await page.evaluate(() => { const vp = document.querySelector('.dzg-dbody .dzg-viewport'); vp.scrollTop = vp.scrollHeight; });
    await frames(page, 3);
    const w2 = await wheelAt(100);
    check(name, `${c.tag}: the wheel over the inner grid scrolls it first (the outer grid, scaled, stays), at its bottom the outer grid takes it (+100 px)`,
      w1.scaled && w1.inner > 0 && w1.outer === w0 && w2.outer === w0 + 100, { w0, w1, w2 });
    // End to end over a million masters with 200 panels: rows placed, the last at 0 px, the inner grids balanced.
    const sweep = await page.evaluate(async () => {
      const { ctx, count } = window.t;
      const next = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const out = [];
      for (let s = 0; s <= 20; s++) {
        window.t.scrollTo(s === 20 ? 1e12 : (ctx.layout.total * s) / 20);
        await next();
        const hb = document.querySelector('.dzg-header').getBoundingClientRect().bottom;
        const vp = document.querySelector('.dzg-viewport').getBoundingClientRect();
        let worst = 0;
        for (const r of document.querySelectorAll('#host > .dzg > .dzg-viewport > .dzg-body > .dzg-layer > .dzg-row')) {
          const i = Number(r.getAttribute('aria-rowindex')) - 2;
          const b = r.getBoundingClientRect();
          if (b.bottom < hb || b.top > vp.bottom) continue;
          worst = Math.max(worst, Math.abs(b.top - (hb + ctx.layout.offsetOf(i) - ctx.scroll.logicalTop)));
        }
        out.push({ worst, alive: count.grids.size, panels: document.querySelectorAll('#host .dzg-dbody > .dzg').length, balance: count.mounts - count.destroys });
      }
      const d = ctx.rows.displayed;
      const last = document.querySelector(`.dzg-layer > .dzg-row[aria-rowindex="${d.count + 1}"]`);
      const v = document.querySelector('.dzg-viewport');
      const inner = v.getBoundingClientRect().top + v.clientTop + v.clientHeight;
      return { out, lastErr: last ? last.getBoundingClientRect().bottom - inner : null, lastKind: last?.dataset.kind ?? null };
    });
    check(name, `${c.tag}: scrolled end to end in 21 steps, rows placed (< 0.5 px), the last row (the panel of Patient 999 999) at 0 px, inner grids alive = panels shown = mounts − destroys`,
      sweep.out.every((s) => s.worst < 0.5 && s.alive === s.panels && s.balance === s.alive) && sweep.lastErr === 0 && sweep.lastKind === 'detail', sweep);
    check(name, `${c.tag}: no page error`, errors.length === 0, errors);
    await page.close();
  }
  // The browser's own chaining (outer not scaled, 10 000 rows): at the inner bottom a new wheel gesture scrolls the page's grid.
  {
    const { page, errors } = await open('locale=fr-FR&rows=10000');
    const b = await page.locator('.dzg-dbody .dzg-viewport').first().boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.7);
    await page.mouse.wheel(0, 100);
    await frames(page, 4);
    const n1 = await page.evaluate(() => ({ inner: document.querySelector('.dzg-dbody .dzg-viewport').scrollTop, outer: document.querySelector('#host > .dzg > .dzg-viewport').scrollTop, scaled: window.t.ctx.scroll.mapper.scaled }));
    await page.evaluate(() => { const vp = document.querySelector('.dzg-dbody .dzg-viewport'); vp.scrollTop = vp.scrollHeight; });
    await frames(page, 4);
    await page.waitForTimeout(400);
    await page.mouse.wheel(0, 100);
    await frames(page, 6);
    await page.waitForTimeout(300);
    const n2 = await page.evaluate(() => ({ inner: document.querySelector('.dzg-dbody .dzg-viewport').scrollTop, outer: document.querySelector('#host > .dzg > .dzg-viewport').scrollTop }));
    check(name, `detail() fr, 10 000 rows (not scaled): the browser's own chaining, inner first, then at its bottom a new wheel scrolls the outer grid`,
      !n1.scaled && n1.inner > 0 && n1.outer === 0 && n2.outer > 0 && errors.length === 0, { n1, n2, errors });
    await page.close();
  }
  // 'auto' heights (free content): the row as tall as its content box; a line added grows it; the rows above stay; no observer loop.
  {
    const { page, errors } = await open('locale=fr-FR&rows=1000&content=free');
    const look = () => page.evaluate(() => {
      const { ctx, x } = window.t;
      const d = ctx.rows.displayed;
      const row = (k) => document.querySelector(`.dzg-layer > .dzg-row[aria-rowindex="${d.indexOf(k) + 2}"]`);
      const r1 = row(x(1));
      return { row: r1.getBoundingClientRect().height, box: r1.querySelector('.dzg-dbody').getBoundingClientRect().height, layout: ctx.layout.heightOf(d.indexOf(x(1))), top0: row(window.t.key(0)).getBoundingClientRect().top, next: row(window.t.key(2)).getBoundingClientRect().top - r1.getBoundingClientRect().bottom };
    });
    const a = await look();
    await page.evaluate(() => { const d = window.t.ctx.rows.displayed; document.querySelector(`.dzg-layer > .dzg-row[aria-rowindex="${d.indexOf(window.t.x(1)) + 2}"] .free button`).click(); });
    await frames(page, 4);
    const b2 = await look();
    check(name, `detail() fr 'auto': a panel as tall as its content (${a.box} px, measured, not 240), a line added grows it (${b2.box} px), the next row follows (0 px gap), the rows above stay, no observer loop`,
      Math.abs(a.row - a.box) < 0.5 && a.box !== 240 && b2.box > a.box && Math.abs(b2.row - b2.box) < 0.5 && b2.layout === b2.row && Math.abs(b2.next) < 0.5 && b2.top0 === a.top0 && errors.length === 0, { a, b2, errors });
    await page.close();
  }
}

/**
 * The floating row shown and hidden live (Phase 4 step 12, floating-toggle.md): French light and Arabic right to
 * left dark, a bound button (with its words, then an icon one named by the bundle), pinned columns, groups and the
 * box column. Both states: axe 0, header and body rowindex in order, aria-rowcount, the body right under the header
 * with no gap, header and body cells aligned, rows down to the view's bottom; a pending edit applied at the hide, the
 * focus in the row moved to the column's header; shown again, the box holds the filter, nothing emitted; the user's
 * toggle said. Then the tree page: the pinned parents stay under the header rows, aligned, through both states.
 */
async function floatingToggleChecks(name, ctx) {
  const cases = [
    { qs: 'locale=fr-FR&theme=light&rows=2000&filters=1&floating=1&popup=1&toggle=icon&pin=1&box=1', typed: '1', btn: 'Ligne de filtres', hid: 'Ligne de filtres masquée', shown: 'Ligne de filtres affichée', mark: 'Nom, filtré', tag: 'floating toggle fr icon' },
    { qs: 'locale=ar-DZ&dir=rtl&theme=dark&rows=2000&filters=1&floating=1&popup=1&toggle=1&groups=1&pin=1&box=1', typed: '1', btn: 'صف المرشحات', hid: 'تم إخفاء صف المرشحات', shown: 'تم إظهار صف المرشحات', mark: 'الاسم، مرشح', tag: 'floating toggle ar rtl groups' },
  ];
  const state = (page) => page.evaluate(() => {
    const vp = document.querySelector('.dzg-viewport');
    const hrows = [...document.querySelectorAll('.dzg-header > [role=row]')];
    const body = [...document.querySelectorAll('.dzg-layer > .dzg-row')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const v = vp.getBoundingClientRect();
    const hb = hrows.at(-1).getBoundingClientRect().bottom;
    const first = body.find((r) => r.getBoundingClientRect().bottom > hb + 1);
    const idx = body.map((r) => Number(r.getAttribute('aria-rowindex')));
    const d = window.t.grid.kernel.rows.displayed;
    const b = document.getElementById('floating');
    const nameHead = document.querySelector('.dzg-hcell[data-col="name"]:not(.dzg-hextra):not(.dzg-hgroup)');
    return {
      headers: hrows.map((r) => r.getAttribute('aria-rowindex')), count: vp.getAttribute('aria-rowcount'), n: d.count,
      firstIndex: idx.length ? Math.min(...idx) : null, consecutive: idx.every((x, i) => i === 0 || x === idx[i - 1] + 1),
      gap: first ? Math.round((first.getBoundingClientRect().top - hb) * 10) / 10 : null, top: vp.scrollTop,
      // The rows reach the view's bottom (the window computed with the header's new height).
      filled: body.length ? Math.max(...body.map((r) => r.getBoundingClientRect().bottom)) >= v.top + vp.clientHeight - 1 : false,
      pressed: b?.getAttribute('aria-pressed'), bname: b?.getAttribute('aria-label') ?? b?.textContent, controls: b && document.getElementById(b.getAttribute('aria-controls'))?.getAttribute('role'),
      bw: b?.getBoundingClientRect().width, bh: b?.getBoundingClientRect().height,
      extra: !!document.querySelector('.dzg-hextra'), mark: nameHead?.getAttribute('aria-label'), filtered: nameHead?.hasAttribute('data-dzg-filtered'),
      active: document.activeElement?.matches('.dzg-hextra, .dzg-hextra *') ? 'row' : document.activeElement?.matches('.dzg-hcell') ? `header ${document.activeElement.dataset.col}` : document.activeElement?.id || document.activeElement?.tagName,
      focus: JSON.stringify(window.t.grid.kernel.focus), filter: window.t.grid.kernel.query.filter.name ?? null,
      value: document.querySelector('.dzg-hextra[data-col="name"] input')?.value ?? null,
    };
  });
  for (const c of cases) {
    const { page, errors } = await load(ctx, c.qs);
    await page.evaluate(() => {
      window.said = []; window.fc = 0;
      new MutationObserver(() => { const t = document.querySelector('.dzg-live').textContent; if (t) window.said.push(t); }).observe(document.querySelector('.dzg-live'), { childList: true, characterData: true, subtree: true });
      window.t.grid.kernel.subscribe((e) => { if (e.type === 'filterChanged') window.fc++; });
    });
    const s0 = await state(page);
    let v = await axe(page);
    const n0 = String(s0.n + s0.headers.length);
    check(name, `${c.tag}: shown: button pressed, named ${c.btn}, controls the grid, ≥ 24 px; rowindex in order; axe 0`,
      s0.pressed === 'true' && s0.bname === c.btn && s0.controls === 'grid' && s0.bw >= 24 && s0.bh >= 24 && s0.count === n0 && s0.firstIndex === s0.headers.length + 1 && s0.consecutive && Math.abs(s0.gap) < 1 && v.length === 0, { s0, v });
    // Typed and still waiting, the focus in the box: hidden (the API, the focus where it is).
    await page.evaluate(() => document.querySelector('.dzg-hextra[data-col="name"]').focus());
    await page.keyboard.press('Enter');
    await page.keyboard.type(c.typed);
    await page.evaluate(() => window.t.filters.floating.set(false));
    await frames(page, 3);
    const s1 = await state(page);
    const g1 = await geometry(page);
    v = await axe(page);
    check(name, `${c.tag}: hidden: the pending "1" applied, the focus on Nom's header, one header row less (rowcount ${s1.count}, first row ${s1.firstIndex}), the body right under it (${s1.gap} px), aligned (${g1.worst?.toFixed?.(2)} px), rows to the bottom, marked "${c.mark}", axe 0`,
      s1.filter?.op === 'contains' && s1.filter?.value === '1' && s1.active === 'header name' && s1.focus === '{"kind":"header","column":"name"}' && !s1.extra && s1.headers.length === s0.headers.length - 1 && s1.headers.every((x, i) => x === String(i + 1)) &&
      s1.count === String(s1.n + s1.headers.length) && s1.firstIndex === s1.headers.length + 1 && s1.consecutive && Math.abs(s1.gap) < 1 && g1.worst < 0.5 && g1.startEdge < 0.5 && g1.endEdge < 0.5 && s1.filled && s1.mark === c.mark && s1.filtered && s1.pressed === 'false' && v.length === 0, { s1, g1, v });
    await page.screenshot({ path: `${OUT}/${name}-floating-hidden-${c.qs.includes('ar-DZ') ? 'ar' : 'fr'}.png`, clip: { x: 0, y: 0, width: 1000, height: 300 } });
    // Scrolled to the end while hidden: the last row reachable, rows to the bottom.
    await page.evaluate(() => window.t.scrollTo(1e9));
    await frames(page, 3);
    const end = await page.evaluate(() => { const vp = document.querySelector('.dzg-viewport'); const last = [...document.querySelectorAll('.dzg-layer > .dzg-row')].map((r) => Number(r.getAttribute('aria-rowindex'))); return { max: Math.max(...last), count: Number(vp.getAttribute('aria-rowcount')) }; });
    await page.evaluate(() => window.t.scrollTo(0));
    await frames(page, 3);
    // The user's toggle: the button, said; shown again with "1" in the box, nothing emitted.
    const fc = await page.evaluate(() => window.fc);
    await page.click('#floating');
    await frames(page, 3);
    // The live region speaks after a 50 ms beat.
    await page.waitForTimeout(150);
    const s2 = await state(page);
    const g2 = await geometry(page);
    const said2 = await page.evaluate(() => window.said.at(-1));
    v = await axe(page);
    check(name, `${c.tag}: the button shows it again: said "${c.shown}", pressed, the box holds ${s2.value}, no filter event, counts back, aligned (${g2.worst?.toFixed?.(2)} px), axe 0; the last row (${end.max}) reachable while hidden`,
      said2 === c.shown && s2.pressed === 'true' && s2.value === c.typed && (await page.evaluate(() => window.fc)) === fc && s2.headers.length === s0.headers.length && s2.count === String(s2.n + s2.headers.length) && s2.firstIndex === s0.firstIndex && s2.consecutive && Math.abs(s2.gap) < 1 && g2.worst < 0.5 && s2.filled && v.length === 0 && end.max === end.count, { s2, fc, said2, v, end, g2 });
    await page.click('#floating');
    await frames(page, 3);
    await page.waitForTimeout(150);
    const s3 = await state(page);
    const said3 = await page.evaluate(() => window.said.at(-1));
    check(name, `${c.tag}: pressed again: hidden, said "${c.hid}", the focus stays on the button`, said3 === c.hid && s3.pressed === 'false' && !s3.extra && s3.active === 'floating', { s3, said3 });
    check(name, `no page error ${c.tag}`, errors.length === 0, errors);
    await page.close();
  }
  // The tree page: the pinned parents under the header rows, aligned, in both states (fr and ar RTL, pinned columns).
  for (const c of [{ qs: 'pin=1&locale=fr-FR&theme=light', tag: 'floating toggle tree fr' }, { qs: 'pin=1&locale=ar-DZ&dir=rtl&theme=dark', tag: 'floating toggle tree ar rtl' }]) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1000, height: 760 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(site.root(`packages/dom/test/browser/tree.html?${c.qs}`));
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
    await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'rows.expand', rows: [window.t.key('s0p3')], expanded: true }, 'host'));
    await frames(page);
    const h = await page.evaluate(() => window.t.rowH());
    await page.evaluate((h) => window.t.scrollTo(4 * h + 5), h);
    await frames(page, 3);
    const look = () => page.evaluate(() => {
      const copies = [...document.querySelectorAll('.dzg-sticky > .dzg-row')];
      const rows = [...document.querySelectorAll('.dzg-header > .dzg-hrow')];
      const hb = rows.at(-1).getBoundingClientRect().bottom;
      let worst = 0;
      for (const r of copies) for (const cell of r.querySelectorAll('[data-col]')) {
        const a = document.querySelector(`.dzg-header .dzg-hrow .dzg-hcell[data-col="${cell.dataset.col}"]`).getBoundingClientRect(), b = cell.getBoundingClientRect();
        worst = Math.max(worst, Math.abs(a.left - b.left), Math.abs(a.right - b.right));
      }
      const idx = [...document.querySelectorAll('.dzg-layer > .dzg-row')].map((r) => Number(r.getAttribute('aria-rowindex')));
      return { n: copies.length, top: copies[0] ? Math.round((copies[0].getBoundingClientRect().top - hb) * 10) / 10 : null, worst, headers: rows.length, first: Math.min(...idx), count: document.querySelector('.dzg-viewport').getAttribute('aria-rowcount'), shown: window.t.grid.kernel.rows.displayed.count };
    });
    const a = await look();
    await page.evaluate(() => window.t.filters.floating.set(false));
    await frames(page, 3);
    const b = await look();
    let v = await axe(page);
    await page.evaluate(() => window.t.filters.floating.set(true));
    await frames(page, 3);
    const d = await look();
    v = [...v, ...(await axe(page))];
    check(name, `${c.tag}: pinned parents right under the header rows (${a.top} / ${b.top} / ${d.top} px), aligned (${Math.max(a.worst, b.worst, d.worst).toFixed(2)} px) shown, hidden, shown; rowindex follows; axe 0`,
      a.n === 2 && b.n === 2 && d.n === 2 && [a, b, d].every((x) => Math.abs(x.top) < 0.5 && x.worst < 0.5 && x.first >= x.headers + 1 && x.count === String(x.shown + x.headers)) && b.headers === a.headers - 1 && d.headers === a.headers && errors.length === 0 && v.length === 0, { a, b, d, v, errors });
    await page.close();
  }
}

/**
 * The showcase themes (docs/behaviors/theming.md, themes-plan §7 steps 2–4), on themes.html: the cascade
 * layer (the app's classes win, the popup keeps its look, a shadow root is styled), Midnight and Clinic
 * on the page and on an area, light and dark, French and Arabic (no letter spacing, the bar at the
 * inline start), more contrast over them, forced colours; axe 0 outside forced colours. The full per-theme suite
 * (Firefox, WebKit, overflow, focus) is step 7's.
 */
async function themeChecks(name, ctx) {
  // Firefox and WebKit (`--all`): the right-to-left checks of each theme only (themes-plan §7 step 7).
  const lite = name !== 'chrome';
  const TZ = ['bg', 'bg-raised', 'fg', 'fg-muted', 'border', 'accent', 'accent-fg', 'danger', 'warning', 'success'];
  const FIX = Object.fromEntries(['midnight', 'clinic'].map((n) => [n, JSON.parse(readFileSync(`${ROOT}packages/theme/test/fixtures/${n}.json`, 'utf8')).palettes[0]]));
  const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
  const open = async (qs, setup) => {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1000, height: 1100 });
    if (setup) await setup(page);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(site.root(`packages/dom/test/browser/themes.html?${qs}`));
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
    await frames(page, 3);
    return { page, errors };
  };
  /** Per grid: a body row's surface, the header row's tracking, a badge's corners, the frame's radius. */
  const look = (page) => page.evaluate(() => [...document.querySelectorAll('#host > .dzg, #area > .dzg'), ...(document.querySelector('#shadow')?.shadowRoot?.querySelectorAll('.dzg') ?? [])].map((el) => {
    const row = [...el.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => r.getAttribute('aria-selected') !== 'true');
    const hrow = el.querySelector('.dzg-hrow');
    const badge = el.querySelector('.dzg-badge');
    return { bg: getComputedStyle(row).backgroundColor, tracking: getComputedStyle(hrow).letterSpacing, pill: badge && getComputedStyle(badge).borderStartStartRadius, radius: getComputedStyle(el).borderStartStartRadius, nowrap: getComputedStyle(el.querySelector('.dzg-cell')).whiteSpace };
  }));
  /** Selects row 0 of the page's grid; the bar (::before of its start segment): width, sides, colour. */
  const bar = (page) => page.evaluate(async () => {
    const g = window.t.grids[0];
    g.kernel.dispatch({ type: 'selection.toggle', row: window.t.key(0) }, 'user');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const seg = document.querySelector('#host .dzg-row[aria-selected=true] > .dzg-seg-start');
    if (!seg) return null;
    const b = getComputedStyle(seg, '::before');
    return { width: b.width, left: b.left, right: b.right, bg: b.backgroundColor, content: b.content };
  });

  // ---- step 2: the layer. The app's classes win (unlayered at zero specificity, and in a later layer); the
  // popup keeps the theme's look over the layout's popover reset; a grid in a shadow root takes the theme
  // (and Midnight) adopted there; the layout still reaches the cells.
  if (!lite) {
    const { page, errors } = await open('locale=fr-FR&theme=dark&shadow=1');
    const app = await page.evaluate(() => {
      const hot = document.querySelector('#host .dzg-cell.app-hot');
      const other = [...document.querySelectorAll('#host .dzg-cell[data-col=name]')].find((c) => !c.classList.contains('app-hot'));
      const s = (c) => ({ pad: getComputedStyle(c).paddingInlineStart, rule: getComputedStyle(c).borderBlockEndColor });
      return { hot: hot && s(hot), other: other && s(other) };
    });
    check(name, `themes: the app's classes beat the layered grid without !important (unlayered :where(), and a later layer): padding ${app.hot?.pad} vs the theme's ${app.other?.pad}, rule ${app.hot?.rule}`,
      app.hot?.pad === '3px' && app.other?.pad === '8px' && app.hot?.rule === 'rgb(4, 5, 6)' && app.other?.rule !== 'rgb(4, 5, 6)', app);
    await page.click('#host .dzg-fbtn');
    await frames(page, 2);
    const pop = await page.evaluate(() => {
      const p = document.querySelector('.dzg-popup:popover-open') ?? document.querySelector('.dzg-popup');
      if (!p) return null;
      const s = getComputedStyle(p);
      return { pad: s.paddingTop, border: s.borderTopWidth, bg: s.backgroundColor, radius: s.borderStartStartRadius };
    });
    check(name, `themes: the filter popup keeps the theme's look over the layout's popover reset (padding ${pop?.pad}, border ${pop?.border}, surface ${pop?.bg})`,
      pop && pop.pad === '8px' && pop.border === '1px' && pop.bg === 'rgb(24, 24, 27)', pop);
    await page.keyboard.press('Escape');
    const l = await look(page);
    const shadow = l[1];
    check(name, `themes: a grid in a shadow root is styled by the theme and Midnight adopted there (surface ${shadow?.bg}, corners ${shadow?.radius}, layout injected)`,
      shadow && shadow.bg === rgb(FIX.midnight.dark.bg) && shadow.radius === '12px' && shadow.nowrap === 'nowrap' && l[0].nowrap === 'nowrap', l);
    const v = await axe(page);
    check(name, 'themes: layer page, axe 0, no page error', v.length === 0 && errors.length === 0, { v, errors });
    await page.close();
  }

  // ---- steps 3–4: each theme on the page, the other on an area; light and dark; French and Arabic.
  for (const skin of ['midnight', 'clinic']) {
    const other = skin === 'midnight' ? 'clinic' : 'midnight';
    for (const scheme of ['light', 'dark']) for (const locale of lite ? ['ar-DZ'] : ['fr-FR', 'ar-DZ']) {
      const qs = `locale=${locale}&theme=${scheme}&skin=${skin}&area=${other}`;
      const { page, errors } = await open(qs);
      const l = await look(page);
      // Step 7: every colour of each grid is its theme's (the hand-written fixture); the page never scrolls
      // sideways; the focus ring, reached by Tab, is drawn in the accent.
      const m = await page.evaluate((TZ) => {
        const probe = (root, k) => { const s = document.createElement('span'); s.style.color = `var(--tz-${k})`; root.append(s); const c = getComputedStyle(s).color; s.remove(); return c; };
        const grids = [...document.querySelectorAll('#host > .dzg, #area > .dzg')];
        return { tokens: grids.map((g) => Object.fromEntries(TZ.map((k) => [k, probe(g, k)]))), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      }, TZ);
      const off = [skin, other].flatMap((sk, i) => TZ.filter((k) => m.tokens[i]?.[k] !== rgb(FIX[sk][scheme][k])).map((k) => `${i ? 'area' : 'page'} ${k}`));
      await page.focus('#before');
      await page.keyboard.press('Tab');
      const ring = await page.evaluate(() => { const a = document.activeElement; const s = getComputedStyle(a); return { inGrid: !!a.closest('#host'), style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor }; });
      check(name, `themes ${qs}: the ten colours of the page's grid and the area's are their themes' (fixtures)${off.length ? `, off: ${off.join(', ')}` : ''}; no horizontal overflow (${m.overflow}); Tab shows the ring (${ring.style} ${ring.width}) in the accent`,
        off.length === 0 && m.overflow <= 0 && ring.inGrid && ring.style === 'solid' && ring.width === '2px' && ring.color === rgb(FIX[skin][scheme].accent), { off, m: m.overflow, ring });
      const b = await bar(page);
      const rtl = locale.startsWith('ar');
      const tracking = l[0].tracking;
      const wantTracking = skin === 'midnight' && !rtl ? 0.26 : 0;
      const ok = l[0].bg === rgb(FIX[skin][scheme].bg) && l[1].bg === rgb(FIX[other][scheme].bg) && l.every((x) => x.pill === '999px')
        && Math.abs((parseFloat(tracking) || 0) - wantTracking) < 0.01
        && b && b.width === (skin === 'midnight' ? '2px' : '0px') && (rtl ? b.right === '0px' && b.left !== '0px' : b.left === '0px' && b.right !== '0px')
        && (skin === 'clinic' || b.bg === rgb(FIX.midnight[scheme].accent));
      check(name, `themes ${qs}: page ${l[0].bg}, area ${l[1].bg}, pills ${l[0].pill}, header tracking ${tracking}, bar ${b?.width} at the inline start (${rtl ? 'right' : 'left'})`, ok, { l, b });
      const v = lite ? [] : await axe(page);
      check(name, `themes ${qs}: ${lite ? '' : 'axe 0 (contrast included) with a row selected, '}no page error`, v.length === 0 && errors.length === 0, { v, errors });
      await page.screenshot({ path: `${OUT}/${name}-themes-${skin}-${scheme}-${locale}.png`, clip: { x: 0, y: 0, width: 1000, height: 720 } });
      await page.close();
    }
  }

  if (lite) return;
  // ---- R4: an Arabic grid in a French page: no header tracking (by its direction, :dir(rtl)).
  {
    const { page, errors } = await open('locale=ar-DZ&pagelang=fr&theme=light&skin=midnight');
    const t = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.querySelector('#host .dzg').getAttribute('dir'), tracking: getComputedStyle(document.querySelector('#host .dzg-hrow')).letterSpacing }));
    check(name, `themes: an Arabic grid in a lang="fr" page under Midnight, header tracking ${t.tracking}`, t.lang === 'fr' && t.dir === 'rtl' && (parseFloat(t.tracking) || 0) === 0 && errors.length === 0, { t, errors });
    await page.close();
  }

  // ---- R2: a shadow root holding an app's Tailwind-4-like stack (a `base` reset of padding and borders):
  // with its order line first (a <style> before the grid mounts, or injectStyles false and the sheets adopted
  // in order), the theme beats the reset; without (naive), the grid's injected <style> makes dzgrid the
  // lowest layer and the reset wins — what theming.md warns of.
  for (const mode of ['order', 'adopt', 'naive']) {
    const { page, errors } = await open(`locale=fr-FR&theme=light&shadowbase=${mode}`);
    const r = await page.evaluate(() => {
      const root = document.querySelector('#shadow2').shadowRoot;
      const cell = [...root.querySelectorAll('.dzg-cell[data-col=city]')][1];
      const el = root.querySelector('.dzg');
      return cell && { pad: getComputedStyle(cell).paddingInlineStart, frame: getComputedStyle(el).borderTopWidth, layout: getComputedStyle(root.querySelector('.dzg-row')).position, styles: root.querySelectorAll('style').length };
    });
    const ok = mode === 'naive' ? r && r.pad === '0px' && r.frame === '0px' : r && r.pad === '8px' && r.frame === '1px' && r.layout === 'absolute';
    check(name, `themes: shadow root with a base reset, ${mode}: cell padding ${r?.pad}, frame ${r?.frame}${mode === 'naive' ? ' (the reset wins: the documented pitfall)' : ' (the theme wins)'}`, ok && errors.length === 0, { r, errors });
    await page.close();
  }

  // ---- R3: more contrast asked by the system reaches a themed area inside a shadow root.
  {
    const { page, errors } = await open('locale=fr-FR&theme=dark&shadow=1&contrast=more', (p) => p.emulateMedia({ contrast: 'more' }));
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('#shadow').shadowRoot.querySelector('.dzg-layer > .dzg-row')).backgroundColor);
    check(name, `themes: prefers-contrast more reaches Midnight's area inside a shadow root (${bg})`, bg === 'rgb(0, 0, 0)' && errors.length === 0, { bg, errors });
    await page.close();
  }

  // ---- more contrast wins over a showcase theme, on the page and in an area.
  {
    const { page, errors } = await open('locale=fr-FR&theme=dark&skin=midnight&area=clinic&contrast=more');
    const l = await look(page);
    check(name, `themes: more contrast wins over Midnight on the page and Clinic in an area (${l.map((x) => x.bg).join(', ')})`, l.length === 2 && l.every((x) => x.bg === 'rgb(0, 0, 0)') && errors.length === 0, { l, errors });
    await page.close();
  }

  // ---- forced colours: the system paints; Midnight's bar stays, in Highlight; French and Arabic; each theme
  // on the page (step 7: Clinic too, the other on an area). The selected row keeps its ticked box.
  for (const skin of ['midnight', 'clinic']) for (const locale of ['fr-FR', 'ar-DZ']) {
    const other = skin === 'midnight' ? 'clinic' : 'midnight';
    const { page, errors } = await open(`locale=${locale}&theme=dark&skin=${skin}&area=${other}`, (p) => p.emulateMedia({ forcedColors: 'active' }));
    const b = await bar(page);
    const sys = await page.evaluate(() => {
      const d = document.createElement('div');
      document.body.append(d);
      const read = (c) => ((d.style.color = c), getComputedStyle(d).color);
      const out = { hl: read('Highlight'), canvas: read('Canvas'), text: read('CanvasText') };
      d.remove();
      const row = [...document.querySelectorAll('#host .dzg-layer > .dzg-row')].find((r) => r.getAttribute('aria-selected') !== 'true');
      const cell = row.querySelector('.dzg-cell');
      return { ...out, bg: getComputedStyle(row).backgroundColor, fg: getComputedStyle(cell).color, ticked: (() => { const box = document.querySelector('#host .dzg-row[aria-selected=true] .dzg-box'); return !!box && !['none', 'normal'].includes(getComputedStyle(box, '::before').content); })() };
    });
    // No axe here: under emulated forced colours it mixes forced text with unforced surfaces (the page's
    // own heading fails); the existing forced-colours checks read the system's colours instead.
    const barOk = skin === 'clinic' ? b && b.width === '0px' : b && b.width === '2px' && b.bg === sys.hl && (locale.startsWith('ar') ? b.right === '0px' : b.left === '0px');
    check(name, `themes: forced colours, ${skin} ${locale}: rows in the system's Canvas and CanvasText (${sys.bg} / ${sys.fg}), the selected row's box ticked; bar ${b?.width}${skin === 'midnight' ? ` at the inline start in Highlight (${b?.bg})` : ''}`,
      barOk && sys.bg === sys.canvas && sys.fg === sys.text && sys.ticked && errors.length === 0, { b, sys, errors });
    await page.screenshot({ path: `${OUT}/${name}-themes-forced-${skin}-${locale}.png`, clip: { x: 0, y: 0, width: 1000, height: 720 } });
    await page.close();
  }
  // With contrast.css too: its selected row is Highlight, the bar HighlightText (review of part 1).
  {
    const { page, errors } = await open('locale=fr-FR&theme=dark&skin=midnight&contrast=more', (p) => p.emulateMedia({ forcedColors: 'active' }));
    const b = await bar(page);
    await page.waitForTimeout(300); // the row's 80 ms background transition
    const sys = await page.evaluate(() => {
      const d = document.createElement('div');
      document.body.append(d);
      d.style.color = 'HighlightText';
      const fg = getComputedStyle(d).color;
      d.style.color = 'Highlight';
      const hl = getComputedStyle(d).color;
      d.remove();
      const seg = document.querySelector('#host .dzg-row[aria-selected=true] > .dzg-seg-start');
      return { fg, hl, seg: seg && getComputedStyle(seg).backgroundColor };
    });
    check(name, `themes: forced colours with more contrast, Midnight's bar ${b?.bg} (HighlightText) on the Highlight row ${sys.seg}`, b && b.width === '2px' && b.bg === sys.fg && sys.seg === sys.hl && b.bg !== sys.seg && errors.length === 0, { b, sys, errors });
    await page.close();
  }
  await frameworkChecks(name, ctx);
}

/**
 * The framework bridges on real builds (showcase themes step 5, owner T4; docs/theme-in-3-lines.md): each
 * setup of packages/theme/test/frameworks/ built by the real tool (scripts/frameworks.mjs), then in Chrome:
 * the ten colours the grid draws equal the framework's documented defaults (fixtures/*-defaults.json, as
 * sRGB bytes), light and dark (the system, Tailwind's .dark, Bootstrap's data-bs-theme on the root or an
 * area), the font and the corners follow, the framework's reset leaves the grid's rules, the app's utility
 * class on a cell wins; the pitfalls the docs name are pinned (no order line; the bridge beside Tailwind's
 * build); a showcase theme imported wins over a bridge.
 */
async function frameworkChecks(name, ctx) {
  await buildFrameworks(ROOT);
  const fx = (f) => JSON.parse(readFileSync(`${ROOT}packages/theme/test/fixtures/${f}`, 'utf8'));
  const TW4 = fx('tailwind4-defaults.json').vars;
  const TW3 = fx('tailwind3-defaults.json').theme;
  const BS = fx('bootstrap-defaults.json');
  const TZ = ['bg', 'bg-raised', 'fg', 'fg-muted', 'border', 'accent', 'accent-fg', 'danger', 'warning', 'success'];
  /** The bridge's own declarations (its first rule), read from the file. */
  const mapOf = (file) => {
    const css = readFileSync(`${ROOT}packages/theme/${file}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const body = /\{\s*:root[^{]*\{([^}]*)\}/.exec(css)[1];
    return Object.fromEntries([...body.matchAll(/--tz-([a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  };
  const MAPS = { tailwind4: mapOf('tailwind.css'), tailwind3: mapOf('tailwind3.css'), bootstrap: mapOf('bootstrap.css') };
  const family = (fw) => (fw.startsWith('tailwind4') ? 'tailwind4' : fw.startsWith('bootstrap') ? 'bootstrap' : 'tailwind3');
  /** sRGB bytes of a token by the fixtures (the framework's documented values), in a scheme. */
  const expected = (fw, k, scheme) => {
    const f = family(fw);
    const expr = MAPS[f][k].replace(/theme\('([^']+)'\)/g, (_, p) => TW3[p]);
    const vars = f === 'bootstrap' ? { ...BS.light, ...(scheme === 'dark' ? BS.dark : {}) } : TW4;
    const c = resolveColor(expr, vars, scheme);
    return [...c.slice(0, 3).map(Math.round), Math.round(c[3] * 255)];
  };
  const near = (a, b) => a && b && a.every((x, i) => Math.abs(x - b[i]) <= 2);
  const open = async (qs, scheme) => {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1000, height: 760 });
    await page.emulateMedia({ colorScheme: scheme ?? 'light' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(site.root(`packages/dom/test/browser/frameworks.html?${qs}`));
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
    await frames(page, 3);
    return { page, errors };
  };
  /** Per grid i: every token's bytes, the row's surface, the font, the corners, the frame, a cell's padding with and without the app's class. */
  const read = (page, i = 0) => page.evaluate(({ i, TZ }) => {
    const root = document.querySelectorAll('#host > .dzg, #area > .dzg')[i];
    const s = getComputedStyle(root);
    const row = [...root.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => r.getAttribute('aria-selected') !== 'true');
    const hot = root.querySelector('.dzg-cell.px-1');
    const other = [...root.querySelectorAll('.dzg-cell[data-col=name]')].find((c) => !c.classList.contains('px-1'));
    return {
      tokens: Object.fromEntries(TZ.map((k) => [k, window.t.probe(i, `var(--tz-${k})`)])),
      row: window.t.bytes(getComputedStyle(row).backgroundColor),
      size: s.fontSize, family: s.fontFamily.split(',')[0].trim(), radius: s.borderStartStartRadius, frame: s.borderTopWidth,
      rule: getComputedStyle(other).borderBlockEndWidth, hot: hot && getComputedStyle(hot).paddingInlineStart, pad: getComputedStyle(other).paddingInlineStart,
    };
  }, { i, TZ });
  /** The examples of docs/theme-in-3-lines.md (examples.json) on grid 0: each class wins where it is put. */
  const examples = (page) => page.evaluate(() => {
    const { ex, classed, bytes } = window.t;
    const root = document.querySelector('#host > .dzg');
    const same = (a, b) => a.every((x, i) => Math.abs(x - b[i]) <= 1);
    const neg = [...root.querySelectorAll('.dzg-cell[data-col=amount]')].find((c) => c.className.includes(ex.negative.split(' ')[0]));
    const pos = [...root.querySelectorAll('.dzg-cell[data-col=amount]')].find((c) => c !== neg && !c.className.includes(ex.negative.split(' ')[0]));
    const want = classed(0, ex.negative).color;
    const flagged = root.querySelector('.dzg-layer > .dzg-row[aria-rowindex="3"]');
    const plain = root.querySelector('.dzg-layer > .dzg-row[aria-rowindex="2"]');
    const rowBg = bytes(getComputedStyle(flagged).backgroundColor);
    const segBg = bytes(getComputedStyle(flagged.querySelector('.dzg-seg-start')).backgroundColor);
    const plainBg = bytes(getComputedStyle(plain).backgroundColor);
    const rowWant = classed(0, ex.row).tz;
    const danger = root.querySelector('.dzg-badge[data-tone=danger]');
    const success = root.querySelector('.dzg-badge[data-tone=success]');
    const pill = danger && bytes(getComputedStyle(danger).backgroundColor);
    const pillWant = classed(0, ex.pills.danger).bg;
    const head = getComputedStyle(root.querySelector('.dzg-hcell[data-col=city]')).textTransform;
    const r = {
      neg: neg && bytes(getComputedStyle(neg).color), want, pos: pos && bytes(getComputedStyle(pos).color),
      rowBg, segBg, plainBg, rowWant, pill, pillWant, success: success && bytes(getComputedStyle(success).backgroundColor), head,
    };
    r.ok = !!neg && same(r.neg, want) && !same(r.pos, want) && same(rowBg, segBg) && same(rowBg, rowWant) && !same(rowBg, plainBg)
      && !!pill && same(pill, pillWant) && !same(pill, r.success) && head === 'uppercase';
    return r;
  });
  const tokensOk = (fw, r, scheme) => TZ.filter((k) => !near(r.tokens[k], expected(fw, k, scheme)));
  // The first family of each framework's default sans stack, as the pinned versions build it.
  const FAMILY = { tailwind4: '-apple-system', tailwind3: 'ui-sans-serif', bootstrap: 'system-ui' };

  for (const fw of ['tailwind4', 'tailwind3', 'bootstrap', 'bootstrap-unlayered']) {
    for (const scheme of ['light', 'dark']) {
      // Tailwind: the system's scheme (darkMode 'media'); Bootstrap: data-bs-theme on the root.
      const bs = fw.startsWith('bootstrap');
      const qs = `fw=${fw}${bs ? `&bs=${scheme}` : ''}`;
      const { page, errors } = await open(qs, bs ? 'light' : scheme);
      const r = await read(page);
      const off = tokensOk(fw, r, scheme);
      check(name, `bridges ${qs} (${scheme}): the ten colours are the framework's documented ones${off.length ? `, off: ${off.join(' ')}` : ''}; the row's surface too`,
        off.length === 0 && near(r.row, expected(fw, 'bg', scheme)), { off: Object.fromEntries(off.map((k) => [k, [r.tokens[k], expected(fw, k, scheme)]])), row: r.row });
      check(name, `bridges ${qs} (${scheme}): font ${r.size} ${r.family}, corners ${r.radius}; frame ${r.frame} and cell rule ${r.rule} kept over the framework's reset; the app's px-1 wins (${r.hot} vs ${r.pad})`,
        r.size === '14px' && r.family === FAMILY[family(fw)] && r.radius === '6px' && r.frame === '1px' && r.rule === '1px' && r.hot === '4px' && r.pad === '8px', r);
      const e = await examples(page);
      check(name, `bridges ${qs} (${scheme}): the documented examples hold: a negative amount in the class's colour, a highlighted row (pinned part too), a danger pill, an uppercase header`, e.ok, e);
      const v = await axe(page);
      check(name, `bridges ${qs} (${scheme}): axe 0 (contrast included, the examples shown), no page error`, v.length === 0 && errors.length === 0, { v, errors });
      await page.screenshot({ path: `${OUT}/${name}-bridge-${fw}-${scheme}.png`, clip: { x: 0, y: 0, width: 1000, height: 600 } });
      await page.close();
    }
  }

  // Tailwind's .dark class (Tailwind 4: @custom-variant dark; Tailwind 3: darkMode 'class') under a light system; Arabic, right to left.
  {
    const { page, errors } = await open('fw=tailwind4-class&dark=class&locale=ar-DZ', 'light');
    const r = await read(page);
    const off = tokensOk('tailwind4', r, 'dark');
    const v = await axe(page);
    check(name, `bridges tailwind4 with its dark variant on .dark (@custom-variant), .dark under a light system, Arabic: dark colours${off.length ? `, off: ${off.join(' ')}` : ''}, the app's px-1 wins (${r.hot}); axe 0`, off.length === 0 && r.hot === '4px' && v.length === 0 && errors.length === 0, { off, r, v, errors });
    await page.close();
  }
  // Bootstrap's colour mode on an area, nested in the root's (review 2): that grid takes the area's mode, the
  // page's grid the root's; light inside dark and dark inside light.
  for (const fw of ['bootstrap', 'bootstrap-unlayered']) for (const [root, area] of [['light', 'dark'], ['dark', 'light']]) {
    const { page, errors } = await open(`fw=${fw}&bs=${root}&area=${area}`, 'light');
    const a = await read(page, 0);
    const b = await read(page, 1);
    const off = [...tokensOk(fw, a, root), ...tokensOk(fw, b, area).map((k) => `area ${k}`)];
    const v = await axe(page);
    check(name, `bridges ${fw}: data-bs-theme="${area}" on an area inside a "${root}" root: each grid in its own mode${off.length ? `, off: ${off.join(' ')}` : ''}; axe 0`, off.length === 0 && v.length === 0 && errors.length === 0, { off, v, errors });
    await page.screenshot({ path: `${OUT}/${name}-bridge-${fw}-${root}-area-${area}.png`, clip: { x: 0, y: 0, width: 1000, height: 640 } });
    await page.close();
  }
  // Tailwind's class mode under a dark system, no .dark on the root (review 1): the grid stays light, as the page.
  {
    const { page, errors } = await open('fw=tailwind4-class', 'dark');
    const r = await read(page);
    const off = tokensOk('tailwind4', r, 'light');
    const e = await examples(page);
    const v = await axe(page);
    check(name, `bridges tailwind4 class mode, dark system, no .dark: the grid stays light${off.length ? `, off: ${off.join(' ')}` : ''}; examples hold; axe 0`, off.length === 0 && e.ok && v.length === 0 && errors.length === 0, { off, e, v, errors });
    await page.close();
  }
  // The bridge wins over a showcase theme imported for the page (owner T9: dzgrid.bridge after dzgrid.skin).
  for (const skin of ['midnight', 'clinic']) {
    const { page, errors } = await open(`fw=tailwind4&skin=${skin}`, 'dark');
    const r = await read(page);
    const off = tokensOk('tailwind4', r, 'dark');
    check(name, `bridges tailwind4 + ${skin}.css for the page: the framework's colours win over the showcase theme (T9)${off.length ? `, off: ${off.join(' ')}` : ''}`, off.length === 0 && errors.length === 0, { off, errors });
    await page.close();
  }
  // The pitfalls the docs name. Without the order line, dzgrid lands after Tailwind's utilities: the
  // grid beats px-1. The bridge linked beside Tailwind's build: the colours Tailwind did not emit are missing.
  {
    const { page, errors } = await open('fw=tailwind4-noorder', 'light');
    const r = await read(page);
    check(name, `bridges tailwind4 without the order line: the grid beats the app's px-1 (${r.hot}; the documented pitfall)`, r.hot === '8px' && errors.length === 0, { r, errors });
    await page.close();
  }
  {
    const { page, errors } = await open('fw=tailwind4-bare&raw=1', 'light');
    const r = await read(page);
    const off = tokensOk('tailwind4', r, 'light');
    check(name, `bridges tailwind.css linked beside Tailwind's build: colours Tailwind did not emit are lost (${off.join(' ')}; the documented pitfall)`, off.length > 0 && errors.length === 0, { off, errors });
    await page.close();
  }
}

/**
 * The showcase demos (docs/phase-5-steps/demos-plan.md §4; `-- --only demos`): the playground's own modules on
 * packages/dom/test/browser/demos.html, fr light Clinic and ar dark Midnight. axe; the orders' sub-orders as
 * child rows under one header, on the app's background variable (owner D4), kept under their order by a sort
 * and a filter; the HR grid's keys
 * into the contact links and out, its pinned parents, right to left, 52 px rows (`rowHeight`, owner D1)
 * holding their two lines; the demo's pills at 4.5:1 (owner D2); no page error, no problem, no request
 * elsewhere; the same rows on every load. Firefox and WebKit (`--all`): the right-to-left checks only.
 */
async function demosChecks(name, ctx) {
  const lite = name !== 'chrome';
  const PAGES = [['fr', 'locale=fr-FR&theme=light&skin=clinic'], ['ar', 'locale=ar-DZ&theme=dark&skin=midnight']];
  const open = async (qs) => {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1300, height: 900 });
    const errors = [];
    const elsewhere = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', (r) => { if (!r.url().startsWith(site.root('')) && !r.url().startsWith('data:')) elsewhere.push(r.url()); });
    await page.goto(site.root(`packages/dom/test/browser/demos.html?${qs}`));
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
    await frames(page, 3);
    return { page, errors, elsewhere };
  };
  const clean = async (tag, o) => {
    const problems = await o.page.evaluate(() => window.t.problems.length);
    check(name, `${tag}: no page error, no problems event, no request but the page's own files`, o.errors.length === 0 && problems === 0 && o.elsewhere.length === 0, { errors: o.errors, problems, elsewhere: o.elsewhere });
  };
  /** Text over background of the demo's drawings (pills, discs), resolved by a canvas, as WCAG's ratio: the lowest. */
  const contrast = (page, sel) => page.evaluate((sel) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const c2 = cv.getContext('2d', { willReadFrequently: true });
    const rgb = (css) => { c2.clearRect(0, 0, 1, 1); c2.fillStyle = '#000'; c2.fillStyle = css; c2.fillRect(0, 0, 1, 1); return [...c2.getImageData(0, 0, 1, 1).data].slice(0, 3); };
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    let worst = { ratio: 99 };
    for (const el of document.querySelectorAll(sel)) {
      const s = getComputedStyle(el);
      let p = el;
      while (p && getComputedStyle(p).backgroundColor.replace(/\s/g, '').match(/rgba\(.*,0\)$|transparent/)) p = p.parentElement;
      const bgc = p ? getComputedStyle(p).backgroundColor : 'rgb(255, 255, 255)';
      const [a, b] = [lum(rgb(s.color)), lum(rgb(bgc))].sort((x, y) => y - x);
      const ratio = (a + 0.05) / (b + 0.05);
      if (ratio < worst.ratio) worst = { ratio: Math.round(ratio * 100) / 100, text: el.textContent, fg: s.color, bg: bgc };
    }
    return worst;
  }, sel);

  // ---- orders (owner D4): sub-orders as child rows of the same grid, one header, the app's background ----
  for (const [lang, qs] of PAGES) {
    if (lite && lang !== 'ar') continue;
    const ar = lang === 'ar';
    const tag = `demos orders ${lang}`;
    const o = await open(`demo=orders&${qs}`);
    const { page } = o;
    await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'rows.expand', rows: ['O-0001', 'O-0002'].map(window.t.key), expanded: true }, 'user'));
    await frames(page, 3);
    const tree = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#host .dzg-layer > .dzg-row')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      const ref = (r) => r.querySelector('.dzg-cell[data-col=ref]')?.textContent?.trim();
      const shown = rows.slice(0, 14).map((r) => ({ ref: ref(r), level: r.getAttribute('aria-level'), child: r.classList.contains('orders-child') }));
      return {
        shown, headers: document.querySelectorAll('#host .dzg-header').length, hrows: document.querySelectorAll('#host .dzg-header .dzg-hrow').length,
        panels: document.querySelectorAll('#host .dzg-dbody, #host .dzg-dcell').length, grids: document.querySelectorAll('#host .dzg').length,
      };
    });
    const kids = (p) => tree.shown.filter((r) => r.ref?.startsWith(`${p}-`));
    const under = tree.shown[0]?.ref === 'O-0001' && kids('O-0001').length > 0 && tree.shown.slice(1, 1 + kids('O-0001').length).every((r) => r.ref.startsWith('O-0001-') && r.level === '2' && r.child) && !tree.shown[0].child;
    check(name, `${tag}: sub-orders right under their order (level 2, marked by rowClass), in one grid with one header row, no panel`, under && tree.headers === 1 && tree.hrows === 1 && tree.panels === 0 && tree.grids === 1, tree);
    // The background: the app's variable on the child rows (and their pinned segments), not on the orders.
    const bg = () => page.evaluate(() => {
      const row = (child) => [...document.querySelectorAll('#host .dzg-layer > .dzg-row')].find((r) => r.classList.contains('orders-child') === child && !r.matches(':hover'));
      return { order: getComputedStyle(row(false)).backgroundColor, child: getComputedStyle(row(true)).backgroundColor };
    });
    const b0 = await bg();
    await page.evaluate(() => document.getElementById('host').style.setProperty('--orders-child-bg', 'rgb(1, 2, 3)'));
    // The theme eases a row's background: read once it has settled.
    await page.waitForTimeout(700);
    const b1 = await bg();
    await page.evaluate(() => document.getElementById('host').style.removeProperty('--orders-child-bg'));
    await page.waitForTimeout(700);
    check(name, `${tag}: a sub-order's background differs from an order's (${b0.child} / ${b0.order}) and follows --orders-child-bg`, b0.child !== b0.order && b1.child === 'rgb(1, 2, 3)' && b1.order === b0.order, { b0, b1 });
    const c = await contrast(page, '#host .orders-child .dzg-cell[data-col=client], #host .orders-child .dzg-cell[data-col=amount]');
    check(name, `${tag}: sub-order text on its background at least 4.5:1 (lowest ${c.ratio}:1)`, c.ratio >= 4.5, c);
    // Right to left (and left to right): the tree column at the start edge, a sub-order's text indented from it.
    const edge = await page.evaluate(() => {
      const rtl = document.documentElement.dir === 'rtl';
      const vp = document.querySelector('#host .dzg-viewport').getBoundingClientRect();
      const h = document.querySelector('#host .dzg-hcell[data-col=ref]').getBoundingClientRect();
      const textStart = (child) => {
        const cell = [...document.querySelectorAll('#host .dzg-layer > .dzg-row')].find((r) => r.classList.contains('orders-child') === child).querySelector('.dzg-cell[data-col=ref]');
        const range = document.createRange();
        range.selectNodeContents(cell);
        const rs = [...range.getClientRects()].filter((x) => x.width > 0);
        return rtl ? vp.right - Math.max(...rs.map((x) => x.right)) : Math.min(...rs.map((x) => x.left)) - vp.left;
      };
      return { start: Math.round(rtl ? vp.right - h.right : h.left - vp.left), order: Math.round(textStart(false)), child: Math.round(textStart(true)) };
    });
    check(name, `${tag}: the « ${ar ? 'الطلب' : 'Commande'} » column at the ${ar ? 'right' : 'left'} edge, a sub-order indented from it (${edge.order} → ${edge.child} px)`, Math.abs(edge.start) <= 1 && edge.child > edge.order, edge);
    if (!lite) {
      // A sort and a filter keep each sub-order under its order.
      const kept = await page.evaluate(async () => {
        const g = window.t.grid;
        g.kernel.dispatch({ type: 'sort.toggle', column: 'amount', multi: false }, 'user');
        g.kernel.dispatch({ type: 'filter.column', column: 'qty', filter: { type: 'number', op: 'gt', value: 5 } }, 'user');
        g.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const d = g.kernel.rows.displayed;
        let order = null;
        let bad = 0;
        let children = 0;
        let last = -1;
        for (let i = 0; i < d.count; i++) {
          const x = d.nodeAt(i).data;
          if (!x.parent) order = x;
          else {
            children++;
            if (x.parent !== order?.id) bad++;
          }
          if (x.parent && last >= 0 && x.amount < last && d.nodeAt(i - 1).data.parent === x.parent) bad++;
          last = x.parent ? x.amount : -1;
        }
        return { bad, children, count: d.count };
      });
      check(name, `${tag}: sorted by amount and filtered, every sub-order stays under its own order, sorted among its siblings (${kept.children} sub-orders)`, kept.bad === 0 && kept.children > 100, kept);
      await page.evaluate(() => { const g = window.t.grid; g.kernel.dispatch({ type: 'sort.set', sort: [] }, 'user'); g.kernel.dispatch({ type: 'filter.set', filter: {} }, 'user'); });
      await frames(page, 2);
      const v = await axe(page);
      check(name, `${tag}: axe 0 with orders open`, v.length === 0, v);
      const sample = (p) => p.evaluate(() => { const d = window.t.grid.kernel.rows.displayed; return Array.from({ length: 20 }, (_, i) => { const x = d.nodeAt(i).data; return `${x.id}|${x.qty}|${x.amount}|${x.day}`; }).join(); });
      const again = await open(`demo=orders&${qs}`);
      const third = await open(`demo=orders&${qs}`);
      const a = await sample(again.page);
      const b = await sample(third.page);
      check(name, `${tag}: two loads, the same first 20 orders and figures`, a === b && a.length > 100, { a: a.slice(0, 120), b: b.slice(0, 120) });
      await again.page.close();
      await third.page.close();
      await page.screenshot({ path: `${OUT}/demos-orders-${lang}.png` });
    }
    await clean(tag, o);
    await page.close();
  }

  // ---- HR ----
  for (const [lang, qs] of PAGES) {
    if (lite && lang !== 'ar') continue;
    const ar = lang === 'ar';
    const tag = `demos hr ${lang}`;
    const o = await open(`demo=hr&${qs}`);
    const { page } = o;
    // 52 px rows (`rowHeight`), their two lines inside.
    const rows = await page.evaluate(() => {
      const hs = [...document.querySelectorAll('#host .dzg-layer > .dzg-row')].map((r) => Math.round(r.getBoundingClientRect().height));
      const clipped = [...document.querySelectorAll('#host .hr-emp')].filter((e) => { const b = e.getBoundingClientRect(); const c = e.closest('.dzg-cell').getBoundingClientRect(); return b.top < c.top - 0.5 || b.bottom > c.bottom + 0.5; }).length;
      return { hs: [...new Set(hs)], clipped, var: document.querySelector('#host > .dzg').style.getPropertyValue('--dzg-row-height') };
    });
    check(name, `${tag}: rows are 52 px (rowHeight), the disc, name and title inside them`, rows.hs.length === 1 && rows.hs[0] === 52 && rows.clipped === 0 && rows.var === '52px', rows);
    if (!lite) {
      // An app's root font size (62.5 %): the rows keep the browser's default size (review R3), the text inside them.
      const small = await open(`demo=hr&${qs}&rootfont=62.5%25`);
      const r = await small.page.evaluate(() => ({ root: getComputedStyle(document.documentElement).fontSize, hs: [...new Set([...document.querySelectorAll('#host .dzg-layer > .dzg-row')].map((x) => Math.round(x.getBoundingClientRect().height)))] }));
      check(name, `${tag}: with html { font-size: 62.5% } (${r.root}) rows stay 52 px`, r.root === '10px' && r.hs.length === 1 && r.hs[0] === 52, r);
      await small.page.close();
    }
    // Right to left: the pinned column at the right edge, flags not mirrored, amounts and dates in ar-DZ, no tracking.
    const rtl = await page.evaluate(() => {
      const vp = document.querySelector('#host .dzg-viewport').getBoundingClientRect();
      const h = document.querySelector('#host .dzg-hcell[data-col=name]').getBoundingClientRect();
      const fr = document.querySelector('#host svg.demo-flag[data-country=FR]');
      const rects = fr ? [...fr.querySelectorAll('rect')].slice(0, 3).map((r) => r.getBoundingClientRect().left) : [];
      const sal = document.querySelector('#host .dzg-cell[data-col=salary]');
      const day = document.querySelector('#host .dzg-cell[data-col=hired]');
      const key = sal.closest('.dzg-row');
      const p = window.t.demo.rows.find((x) => x.name === key.querySelector('.hr-name').textContent);
      const want = new Intl.NumberFormat(document.documentElement.lang, { style: 'currency', currency: 'DZD', maximumFractionDigits: 0 }).format(p.salary);
      const strip = (s) => s.replace(/[‎‏⁦-⁩؜]/g, '').replace(/\s/g, ' ');
      return {
        start: Math.round(document.documentElement.dir === 'rtl' ? vp.right - h.right : h.left - vp.left), transform: fr && getComputedStyle(fr).transform,
        flag: rects.length === 3 && rects[0] < rects[1] && rects[1] < rects[2], salary: strip(sal.textContent), want: strip(want), latin: /^[^٠-٩۰-۹]*$/.test(sal.textContent + day.textContent),
        day: day.textContent, tracking: getComputedStyle(document.querySelector('#host .dzg-hrow')).letterSpacing,
      };
    });
    check(name, `${tag}: the pinned « Employé » column at the ${ar ? 'right' : 'left'} edge; flags never mirrored (FR blue, white, red from the left)`, Math.abs(rtl.start) <= 1 && rtl.flag && rtl.transform === 'none', rtl);
    check(name, `${tag}: salary in the ${ar ? 'ar-DZ' : 'fr-FR'} currency form (${rtl.salary}), Latin digits; header tracking ${ar ? '0' : 'as the theme'}`, rtl.salary === rtl.want && rtl.latin && (!ar || rtl.tracking === 'normal' || rtl.tracking === '0px'), rtl);
    const pills = await contrast(page, '#host .hr-dep, #host .hr-avatar');
    check(name, `${tag}: department pills and discs at least 4.5:1 (lowest ${pills.ratio}:1)`, pills.ratio >= 4.5, pills);
    // Sticky parents: everyone open, a staff row at the top: its head, manager and lead pinned, in the pinned column too.
    const sticky = await page.evaluate(async () => {
      const g = window.t.grid;
      g.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const people = window.t.demo.rows;
      const by = new Map(people.map((p) => [p.id, p]));
      const d = g.kernel.rows.displayed;
      // The 4th child of a lead, deep in the list.
      const staff = people.filter((p) => p.level === 4)[200];
      const i = d.indexOf(window.t.key(staff.id));
      const vp = document.querySelector('#host .dzg-viewport');
      vp.scrollTop = i * 52;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
      const want = [];
      for (let p = by.get(staff.manager); p && want.length < 3; p = p.manager ? by.get(p.manager) : null) want.unshift(p.name);
      const copies = [...document.querySelectorAll('#host .dzg-sticky > .dzg-row')];
      const header = document.querySelector('#host .dzg-header').getBoundingClientRect();
      const seen = copies.map((c) => { const r = c.getBoundingClientRect(); const cell = c.querySelector('.dzg-seg-start .dzg-cell[data-col=name]'); return { text: cell?.textContent?.trim() ?? null, top: Math.round(r.top - header.bottom), h: Math.round(r.height), pinned: !!cell }; });
      return { i, staff: staff.name, want, seen };
    });
    check(name, `${tag}: a staff row at the top: its 3 nearest managers pinned under the header, outermost first, in the pinned column, 52 px each`,
      sticky.seen.length === 3 && sticky.seen.every((s, j) => s.pinned && s.h === 52 && s.text === sticky.want[j]), sticky);
    if (!lite) {
      // Keys: a staff row's « Employé » cell, → ×6 to « Contact », Enter onto « Écrire à … », → (← in Arabic) to « Appeler … », Escape back, Tab out.
      await page.evaluate(() => { const g = window.t.grid; g.kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'user'); g.kernel.dispatch({ type: 'rows.expand', rows: ['E001', 'E002', 'E003', 'E004'].map(window.t.key), expanded: true }, 'user'); });
      await frames(page, 2);
      const leaf = await page.evaluate(() => {
        const g = window.t.grid;
        const d = g.kernel.rows.displayed;
        const p = window.t.demo.rows.find((x) => x.manager === 'E004');
        const k = window.t.key(p.id);
        g.api.focusCell(k, 'name');
        return p.name;
      });
      await frames(page, 2);
      const fwd = ar ? 'ArrowLeft' : 'ArrowRight';
      for (let n = 0; n < 6; n++) await page.keyboard.press(fwd);
      await frames(page);
      const at = () => page.evaluate(() => { const a = document.activeElement; return { col: a.closest('.dzg-cell')?.dataset.col ?? null, cell: a.classList.contains('dzg-cell'), label: a.getAttribute('aria-label'), tag: a.tagName, inGrid: !!a.closest('#host') }; });
      const a0 = await at();
      await page.keyboard.press('Enter');
      const a1 = await at();
      await page.keyboard.press(fwd);
      const a2 = await at();
      let v = await axe(page);
      check(name, `${tag}: axe 0 with the focus on a contact link`, v.length === 0, v);
      // A tooltip shown meanwhile (axe takes time) takes the first Escape (WCAG 1.4.13); the next one leaves the link.
      const tipShown = await page.evaluate(() => !document.querySelector('#host .dzg-tooltip')?.hidden);
      await page.keyboard.press('Escape');
      if (tipShown) await page.keyboard.press('Escape');
      const a3 = await at();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      const a4 = await at();
      const W = ar ? ['مراسلة ', 'الاتصال بـ '] : ['Écrire à ', 'Appeler '];
      check(name, `${tag}: from « Employé », ${fwd} ×6 reaches « Contact »; Enter: « ${W[0]}${leaf} »; ${fwd}: « ${W[1]}${leaf} »; Escape: the cell; Tab leaves the grid`,
        a0.col === 'contact' && a0.cell && a1.tag === 'A' && a1.label === `${W[0]}${leaf}` && a2.tag === 'A' && a2.label === `${W[1]}${leaf}` && a3.cell && a3.col === 'contact' && !a4.inGrid, { a0, a1, a2, a3, a4 });
      v = await axe(page);
      check(name, `${tag}: axe 0 with the tree open`, v.length === 0, v);
      const one = await page.evaluate(() => { const d = window.t.grid.kernel.rows.displayed; return Array.from({ length: 20 }, (_, i) => { const p = d.nodeAt(i).data; return `${p.id}|${p.name}|${p.salary}|${p.hired}|${p.country}|${p.status}`; }).join(); });
      const again = await open(`demo=hr&${qs}`);
      await again.page.evaluate(() => { const g = window.t.grid; g.kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'user'); g.kernel.dispatch({ type: 'rows.expand', rows: ['E001', 'E002', 'E003', 'E004'].map(window.t.key), expanded: true }, 'user'); });
      const two = await again.page.evaluate(() => { const d = window.t.grid.kernel.rows.displayed; return Array.from({ length: 20 }, (_, i) => { const p = d.nodeAt(i).data; return `${p.id}|${p.name}|${p.salary}|${p.hired}|${p.country}|${p.status}`; }).join(); });
      check(name, `${tag}: two loads, the same first 20 people and figures`, one === two && one.length > 100, { one: one.slice(0, 160), two: two.slice(0, 160) });
      await again.page.close();
      await page.screenshot({ path: `${OUT}/demos-hr-${lang}.png` });
    }
    await clean(tag, o);
    await page.close();
  }
}

/**
 * The edit marks (Phase 5 step 4, docs/phase-5-steps/step04-plan.md « Browser »; `-- --only edit-marks`): a stock
 * list with `@dzgrid/dom/edit` and `@dzgrid/theme/edit.css`, a save the checks hold. French light Clinic, Arabic
 * right to left dark Midnight, the base theme light and dark: axe 0 with every mark shown (pending, saving, saved,
 * refused, failed, a muted row, the reapply mark focused); forced colours; the ring's direction and the marks'
 * side in RTL; reduced motion and motion off stand still; the blink rate; the border still after 5 s; 50 saving
 * cells while scrolling (no layout read in the paint's marks, no long task); the mark's target; the marks'
 * contrast on their rows.
 */
async function editMarksChecks(name, ctx) {
  const PAGES = [
    ['edit fr light clinic', 'locale=fr-FR&theme=light&skin=clinic', false],
    ['edit ar rtl dark midnight', 'locale=ar-DZ&theme=dark&skin=midnight', true],
    ['edit en light base', 'locale=en-GB&theme=light', false],
    ['edit en dark base', 'locale=en-GB&theme=dark', false],
  ];
  const open = async (qs, o = {}) => {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1000, height: 760 });
    if (o.reduce) await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(site.root(`packages/dom/test/browser/edit-marks.html?${qs}`));
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
    await frames(page, 3);
    return { page, errors };
  };
  /** Every mark on screen: m0 pending (its second gesture behind the first), m1 saving, m2 saved, m3 failed, m4 refused (kept by
   * refusals every 300 ms), m5 muted (stock 0 under « stock > 0 »), the reapply mark focused by F2. */
  const showAll = (page) => page.evaluate(async () => {
    const { grid, api, saves, key } = window.t;
    grid.kernel.dispatch({ type: 'filter.column', column: 'stock', filter: { type: 'number', op: 'gt', value: 0 } }, 'user');
    const put = (id, text, column = 'stock') => api.commit([{ key: key(id), column, input: { text } }]);
    put('m0', '50'); put('m0', '51'); put('m2', '7'); put('m3', '8'); put('m5', '0');
    saves[1].ok(); saves[2].no({ code: 'min' });
    saves[3].ok();
    await new Promise((r) => setTimeout(r, 650));
    window.keep = setInterval(() => api.refuse(key('m4'), 'stock'), 300);
    api.refuse(key('m4'), 'stock');
    put('m1', '60');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const cls = (id) => [...document.querySelector(`[data-col="stock"]`) ? [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => grid.context.rowRenderer.keyOf(r) === key(id))?.querySelector('[data-col="stock"]')?.classList ?? [] : []].filter((c) => c.startsWith('dzg-cell--')).join(' ');
    return { m0: cls('m0'), m1: cls('m1'), m2: cls('m2'), m3: cls('m3'), m4: cls('m4'), muted: document.querySelectorAll('.dzg-row[data-dzg-stale]').length };
  });
  const cell = (id, col = 'stock') => `[...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => window.t.grid.context.rowRenderer.keyOf(r) === window.t.key('${id}'))?.querySelector('[data-col="${col}"]')`;
  for (const [tag, qs, rtl] of PAGES) {
    const o = await open(qs);
    const { page } = o;
    const shown = await showAll(page);
    check(name, `${tag}: every mark shown (pending, saving, saved, failed, refused, a muted row)`, /pending/.test(shown.m0) && /saving/.test(shown.m1) && /saved/.test(shown.m2) && /failed/.test(shown.m3) && /refused/.test(shown.m4) && shown.muted === 1, shown);
    const head = await page.evaluate(() => { const h = document.querySelector('.dzg-hcell[data-col="stock"]'); h.focus(); return !!h.querySelector('.dzg-reapply'); });
    await page.keyboard.press('F2');
    const mark = await page.evaluate(() => { const b = document.activeElement; const r = b.getBoundingClientRect(); const h = b.closest('.dzg-hcell').getBoundingClientRect(); return { cls: b.className, w: r.width, h: r.height, end: getComputedStyle(document.documentElement).direction === 'rtl' ? r.left - h.left < h.width / 2 : r.right - h.left > h.width / 2 }; });
    check(name, `${tag}: F2 on the filtered header focuses its reapply mark, at the header's end, a 24 × 24 target`, head && mark.cls === 'dzg-reapply' && mark.w >= 24 && mark.h >= 24 && mark.end, mark);
    let v = await axe(page);
    check(name, `${tag}: axe 0 with every mark shown and the reapply mark focused`, v.length === 0, v);
    await page.screenshot({ path: `${OUT}/${name}-${tag.replace(/ /g, '-')}.png`, clip: { x: 0, y: 0, width: 1000, height: 640 } });
    // The marks' contrast on their rows (3:1): the dot, the check, the sign, the funnel, the button.
    const c = await page.evaluate(() => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 1;
      const c2 = cv.getContext('2d', { willReadFrequently: true });
      const rgb = (css) => { c2.clearRect(0, 0, 1, 1); c2.fillStyle = '#000'; c2.fillStyle = css; c2.fillRect(0, 0, 1, 1); return [...c2.getImageData(0, 0, 1, 1).data].slice(0, 3); };
      const lin = (x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
      const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      const ratio = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
      const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const b = getComputedStyle(e).backgroundColor; if (b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent') return b; } return getComputedStyle(document.body).backgroundColor; };
      const out = {};
      const cells = [...document.querySelectorAll('.dzg-layer [data-col="stock"]')];
      for (const k of ['pending', 'saved', 'failed']) { const el = cells.find((x) => x.classList.contains(`dzg-cell--${k}`)); out[k] = el ? ratio(getComputedStyle(el, '::after').backgroundColor, bgOf(el)) : 0; }
      const head = document.querySelector('.dzg-row[data-dzg-stale] .dzg-cell[data-dzg-stale]');
      out.funnel = head ? ratio(getComputedStyle(head, '::before').backgroundColor, bgOf(head)) : 0;
      const b = document.querySelector('.dzg-reapply');
      out.button = b ? ratio(getComputedStyle(b, '::before').backgroundColor, bgOf(b)) : 0;
      return out;
    });
    check(name, `${tag}: the marks' contrast on their rows ≥ 3:1 (dot, check, sign, funnel, button)`, Object.values(c).every((x) => x >= 3), c);
    // Forced colours: the ring dashed Highlight, the refusal Mark, the signs CanvasText, shapes kept (Chrome: the emulation).
    if (name === 'chrome') {
    await page.emulateMedia({ forcedColors: 'active' });
    await frames(page, 2);
    const fc = await page.evaluate((sel) => {
      const probe = document.createElement('i');
      document.body.append(probe);
      const sys = (k) => ((probe.style.color = k), getComputedStyle(probe).color);
      const s0 = eval(sel.m0); const s3 = eval(sel.m3); const s4 = eval(sel.m4);
      const r = getComputedStyle(s0, '::before'); const f = getComputedStyle(s3, '::after'); const x = getComputedStyle(s4, '::before');
      const out = { ring: r.borderBlockStartStyle, ringColour: r.borderBlockStartColor === sys('Highlight'), ringAnim: r.animationName, sign: f.backgroundColor === sys('CanvasText'), shape: f.clipPath !== 'none', refused: x.borderBlockStartColor === sys('CanvasText') && x.borderBlockStartStyle === 'solid' };
      probe.remove();
      return out;
    }, { m0: cell('m1'), m3: cell('m3'), m4: cell('m4') });
    await page.screenshot({ path: `${OUT}/${name}-${tag.replace(/ /g, '-')}-forced.png`, clip: { x: 0, y: 0, width: 1000, height: 640 } });
    check(name, `${tag}: forced colours: the ring a still dashed Highlight border, the refusal a solid CanvasText border, the signs CanvasText shapes`, fc.ring === 'dashed' && fc.ringColour && fc.ringAnim === 'none' && fc.sign && fc.shape && fc.refused, fc);
    await page.emulateMedia({ forcedColors: 'none' });
    }
    if (rtl) {
      const side = await page.evaluate((sel) => { const s0 = eval(sel.m0); const s3 = eval(sel.m3); const r = getComputedStyle(s0, '::before'); const a = s3.getBoundingClientRect(); const m = getComputedStyle(s3, '::after'); return { dir: r.animationDirection, left: parseFloat(m.left), right: parseFloat(m.right), w: a.width }; }, { m0: cell('m1'), m3: cell('m3') });
      check(name, `${tag}: right to left: the ring turns the other way; the sign at the inline end (left)`, side.dir === 'reverse, normal' && side.left < side.right, side);
    }
    await page.evaluate(() => clearInterval(window.keep));
    check(name, `${tag}: no page error`, o.errors.length === 0, o.errors);
    await page.close();
  }

  // Reduced motion and motion off: no animation on a ring or a refusal, the still borders drawn.
  for (const [how, qs, o] of [['reduced motion', 'locale=fr-FR&theme=light', { reduce: true }], ['motion off', 'locale=fr-FR&theme=light', {}]]) {
    const { page, errors } = await open(qs, o);
    const r = await page.evaluate(async (off) => {
      const { grid, api, key } = window.t;
      if (off) grid.update({ motion: false });
      api.commit([{ key: key('m0'), column: 'stock', input: { text: '50' } }]);
      api.refuse(key('m1'), 'stock');
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const at = (id) => [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => grid.context.rowRenderer.keyOf(r) === key(id)).querySelector('[data-col="stock"]');
      const anims = document.getAnimations().filter((a) => a.effect?.pseudoElement && [at('m0'), at('m1')].includes(a.effect.target)).length;
      return { anims, ring: getComputedStyle(at('m0'), '::before').borderBlockStartStyle, refused: getComputedStyle(at('m1'), '::before').borderBlockStartStyle };
    }, how === 'motion off');
    check(name, `edit ${how}: no animation on the ring or the refusal; the ring dashed, the refusal a still red border`, r.anims === 0 && r.ring === 'dashed' && r.refused === 'solid', r);
    check(name, `edit ${how}: no page error`, errors.length === 0, errors);
    await page.close();
  }

  // The blink rate (WCAG 2.3.1): 10 refusals in 2 s on one cell, sampled every frame: never two blinks at once,
  // a new blink only 1 s after the last began; ≤ 3 flashes (2 per blink) in any second.
  {
    const { page, errors } = await open('locale=fr-FR&theme=light');
    const r = await page.evaluate(() => new Promise((done) => {
      const { grid, api, key } = window.t;
      const at = () => [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => grid.context.rowRenderer.keyOf(r) === key('m1')).querySelector('[data-col="stock"]');
      const starts = [];
      let both = 0;
      let n = 0;
      const t0 = performance.now();
      const fire = setInterval(() => { api.refuse(key('m1'), 'stock'); if (++n === 10) clearInterval(fire); }, 200);
      api.refuse(key('m1'), 'stock');
      const sample = () => {
        const run = document.getAnimations().filter((a) => a.effect?.target === at() && /^dzg-blink/.test(a.animationName) && a.playState === 'running');
        if (run.length > 1) both++;
        for (const a of run) { if (a.startTime === null) continue; const s = Math.round(a.startTime); if (!starts.some((x) => Math.abs(x - s) < 20)) starts.push(s); }
        if (performance.now() - t0 < 2600) requestAnimationFrame(sample);
        else done({ starts: starts.map((s) => s - starts[0]), both });
      };
      requestAnimationFrame(sample);
    }));
    let worst = 0;
    const flashes = r.starts.flatMap((s) => [s, s + 250]);
    for (const w of flashes) worst = Math.max(worst, flashes.filter((f) => f >= w && f < w + 1000).length);
    const gaps = r.starts.slice(1).map((s, i) => s - r.starts[i]);
    check(name, `edit blink rate: 10 refusals in 2 s: ${r.starts.length} blinks, never two at once, each ≥ 1 s after the last, ≤ 3 flashes in any second (worst ${worst})`, r.starts.length >= 2 && r.both === 0 && gaps.every((g) => g >= 980) && worst <= 3, { r, gaps, worst });
    check(name, 'edit blink rate: no page error', errors.length === 0, errors);
    await page.close();
  }

  // The running border stands still after 5 s (WCAG 2.2.2): a held save, 5.1 s later no running animation, dashed.
  {
    const { page, errors } = await open('locale=fr-FR&theme=light');
    const r = await page.evaluate(async () => {
      const { grid, api, key } = window.t;
      api.commit([{ key: key('m0'), column: 'stock', input: { text: '50' } }]);
      const at = () => [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => grid.context.rowRenderer.keyOf(r) === key('m0')).querySelector('[data-col="stock"]');
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const early = document.getAnimations().filter((a) => a.effect?.target === at() && a.playState === 'running').map((a) => a.animationName);
      await new Promise((r) => setTimeout(r, 5100));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const late = document.getAnimations().filter((a) => a.effect?.target === at() && a.playState === 'running').map((a) => a.animationName);
      return { early, late, style: getComputedStyle(at(), '::before').borderBlockStartStyle, still: at().classList.contains('dzg-cell--still') };
    });
    check(name, `edit saving border: turning at first (${r.early.join(', ')}), still after 5 s: no running animation, a dashed border`, r.early.includes('dzg-turn') && r.late.length === 0 && r.style === 'dashed' && r.still, r);
    check(name, 'edit saving border: no page error', errors.length === 0, errors);
    await page.close();
  }

  // 50 saving cells while scrolling: the marks' paint reads no layout, no long task (Chrome: long tasks are its API).
  if (name === 'chrome') {
    const { page, errors } = await open('locale=fr-FR&theme=light');
    const r = await page.evaluate(async () => {
      const { grid, api, key } = window.t;
      const long = [];
      new PerformanceObserver((l) => long.push(...l.getEntries().map((e) => e.duration))).observe({ type: 'longtask', buffered: false });
      api.commit(Array.from({ length: 50 }, (_, i) => ({ key: key(`m${i}`), column: 'stock', input: { text: String(500 + i) } })));
      const h = grid.context.features.find((f) => f.edit);
      let reads = 0;
      let inPaint = false;
      const count = (proto, k) => { const d = Object.getOwnPropertyDescriptor(proto, k); Object.defineProperty(proto, k, { ...d, ...(d.get ? { get() { if (inPaint) reads++; return d.get.call(this); } } : { value(...a) { if (inPaint) reads++; return d.value.apply(this, a); } }) }); };
      count(Element.prototype, 'getBoundingClientRect');
      for (const k of ['offsetTop', 'offsetLeft', 'offsetWidth', 'offsetHeight']) count(HTMLElement.prototype, k);
      const after = h.afterRows;
      h.afterRows = (f) => { inPaint = true; try { after(f); } finally { inPaint = false; } };
      const vp = document.querySelector('.dzg-viewport');
      for (let i = 0; i < 60; i++) { vp.scrollTop = (i % 30) * 40; await new Promise((r) => requestAnimationFrame(r)); }
      const saving = document.querySelectorAll('.dzg-cell--saving').length;
      return { reads, long, saving };
    });
    check(name, `edit: 50 saving cells while scrolling: no layout read in the marks' paint, no long task (${r.saving} saving on screen)`, r.reads === 0 && r.long.length === 0 && r.saving > 5, r);
    check(name, 'edit scrolling: no page error', errors.length === 0, errors);
    await page.close();
  }
}

/**
 * The editors (Phase 5 step 5, docs/phase-5-steps/step05-plan.md « Browser »; `-- --only editors`): a stock list
 * with `@dzgrid/dom/edit` and `@dzgrid/dom/editors`, the medicine column pinned. Chrome: French light Clinic and
 * Arabic right to left dark Midnight — real keys (F2, typing Latin and Arabic, Enter, Shift+Enter, Tab leftwards
 * in Arabic, Escape, Delete), the field's focus ring and never under the pinned column, a refusal (bubble below
 * or above, never over the field, at 320 px and at 200 % zoom), axe 0 with the field and with the bubble, the
 * field's accessible name, invalid state and description, forced colours, an input method (CDP
 * `Input.imeSetComposition`), 100 000 rows edited 50 times down without a long task; a double tap in mobile
 * emulation. WebKit (`--all`): the bubble in the top layer and the double tap.
 */
async function editorsChecks(name, ctx) {
  const open = async (qs, o = {}) => {
    const c = o.ctx ?? ctx;
    const page = await c.newPage();
    if (!o.ctx) await page.setViewportSize(o.size ?? { width: 1000, height: 760 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(site.root(`packages/dom/test/browser/editors.html?${qs}`));
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
    await frames(page, 3);
    return { page, errors };
  };
  const cellSel = (id, col) => `[...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => window.t.grid.context.rowRenderer.keyOf(r) === window.t.key('${id}'))?.querySelector('[data-col="${col}"]')`;
  const focusCell = (page, id, col) => page.evaluate(([id, col]) => { const { grid, key } = window.t; grid.api.focusCell(key(id), col); }, [id, col]).then(() => frames(page, 2));
  const state = (page) => page.evaluate(() => {
    const f = document.querySelector('.dzg-field');
    const fo = window.t.grid.kernel.focus;
    const at = fo?.kind === 'cell' ? `${String(fo.row).replace(/^d:\d+:/, '')}/${fo.column}` : null;
    const r = f?.getBoundingClientRect();
    return { open: !!f, value: f?.value ?? null, active: document.activeElement === f, at, rect: r && { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, caret: f?.selectionStart ?? null, outline: f ? getComputedStyle(f).outlineWidth : null };
  });
  const text = (page, id, col) => page.evaluate((s) => eval(s)?.textContent, cellSel(id, col));
  // A key with its text through CDP (Input.dispatchKeyEvent), as a keyboard sends it: Arabic letters included.
  const keyText = async (page, ch) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
    await cdp.detach();
  };

  if (name !== 'chrome') {
    // WebKit (spike rule): the bubble in the top layer, and a double tap.
    if (name !== 'webkit') return;
    const { page } = await open('locale=fr-FR&theme=light&skin=clinic');
    await focusCell(page, 'm3', 'stock');
    await page.keyboard.press('F2');
    await page.keyboard.type('abc');
    await page.keyboard.press('Enter');
    await frames(page, 2);
    const b = await page.evaluate(() => { const b = document.querySelector('.dzg-bubble'); const f = document.querySelector('.dzg-field'); const r = b.getBoundingClientRect(), q = f.getBoundingClientRect(); let top = false; try { top = b.matches(':popover-open'); } catch {} return { top, shown: !b.hidden && r.height > 0, clear: r.top >= q.bottom || r.bottom <= q.top }; });
    check(name, 'editors: the bubble shown in the top layer, clear of the field', b.shown && b.top && b.clear, b);
    await page.close();
    const mctx = await ctx.browser().newContext({ hasTouch: true, viewport: { width: 390, height: 700 } });
    const t = await open('locale=fr-FR', { ctx: mctx });
    const box = await t.page.evaluate((s) => { const r = eval(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, cellSel('m2', 'stock'));
    await t.page.touchscreen.tap(box.x, box.y);
    await t.page.waitForTimeout(80);
    await t.page.touchscreen.tap(box.x, box.y);
    await frames(t.page, 2);
    const tapped = await state(t.page);
    check(name, 'editors: a double tap opens the field', tapped.open && tapped.active, tapped);
    await mctx.close();
    return;
  }

  for (const [tag, qs, rtl] of [['editors fr light clinic', 'locale=fr-FR&theme=light&skin=clinic', false], ['editors ar rtl dark midnight', 'locale=ar-EG&theme=dark&skin=midnight&numerals=locale', true]]) {
    const { page, errors } = await open(qs);
    // F2: open with the text, caret at the end, the ring visible; Enter keeps and goes down.
    await focusCell(page, 'm2', 'stock');
    await page.keyboard.press('F2');
    let st = await state(page);
    check(name, `${tag}: F2 opens the field with the cell's text, caret at its end, focused, a 2 px ring`, st.open && st.active && st.caret === st.value.length && st.outline === '2px', st);
    let v = await axe(page);
    check(name, `${tag}: axe 0 with the field open`, v.length === 0, v);
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('12');
    await page.keyboard.press('Enter');
    await frames(page, 2);
    st = await state(page);
    const shown = await text(page, 'm2', 'stock');
    check(name, `${tag}: typed 12, Enter: kept (digits ${rtl ? 'Arabic-Indic' : 'Latin'}) and down one row, the field closed`, !st.open && st.at === 'm3/stock' && shown === (rtl ? '١٢' : '12'), { st, shown });
    await page.keyboard.press('F2');
    await page.keyboard.press('End');
    await page.keyboard.type('0');
    await page.keyboard.press('Shift+Enter');
    await frames(page, 2);
    st = await state(page);
    check(name, `${tag}: Shift+Enter keeps and goes up`, !st.open && st.at === 'm2/stock', st);
    // Typing a character (Latin; Arabic letters and ٣ in Arabic) opens with it alone.
    await focusCell(page, 'm4', 'shelf');
    await keyText(page, rtl ? 'ب' : 'x');
    st = await state(page);
    check(name, `${tag}: a ${rtl ? 'letter ب' : 'letter x'} typed on a cell opens the field holding it alone`, st.open && st.value === (rtl ? 'ب' : 'x') && st.caret === 1, st);
    await page.keyboard.press('Escape');
    await focusCell(page, 'm4', 'stock');
    await keyText(page, rtl ? '٣' : '3');
    st = await state(page);
    check(name, `${tag}: a digit (${rtl ? '٣' : '3'}) opens the number field with it`, st.open && st.value === (rtl ? '٣' : '3'), st);
    // Tab: the next editable cell in reading order (leftwards in Arabic).
    const before = st.rect;
    await page.keyboard.press('Tab');
    await frames(page, 2);
    st = await state(page);
    check(name, `${tag}: Tab keeps and opens the next editable cell, ${rtl ? 'to the left' : 'to the right'}`, st.open && st.at === 'm4/price' && (rtl ? st.rect.right <= before.left + 1 : st.rect.left >= before.right - 1), { before, st });
    await page.keyboard.press('Escape');
    st = await state(page);
    const esc = await page.evaluate(() => document.activeElement.classList.contains('dzg-cell'));
    check(name, `${tag}: Escape closes, the focus on the cell`, !st.open && esc && st.at === 'm4/price', st);
    await page.keyboard.press('Delete');
    await frames(page, 2);
    check(name, `${tag}: Delete clears the cell, no field`, (await text(page, 'm4', 'price')) === '' && !(await state(page)).open);
    // Never under the pinned column (2.4.11): scrolled sideways, Tab from the last column to the next row's first editable.
    await focusCell(page, 'm6', 'note');
    await page.keyboard.press('F2');
    await page.keyboard.press('Tab');
    await frames(page, 3);
    const clear = await page.evaluate(() => { const f = document.querySelector('.dzg-field').getBoundingClientRect(); const pin = document.querySelector('.dzg-layer .dzg-seg-start').getBoundingClientRect(); const v = document.querySelector('.dzg-viewport').getBoundingClientRect(); const rtl = getComputedStyle(document.querySelector('.dzg')).direction === 'rtl'; return { overlap: rtl ? f.right > pin.left + 1 : f.left < pin.right - 1, inView: f.top >= v.top && f.bottom <= v.bottom }; });
    st = await state(page);
    check(name, `${tag}: Tab to the next row's first editable cell: the field clear of the pinned column, in view`, st.at === 'm7/stock' && !clear.overlap && clear.inView, { st, clear });
    await page.keyboard.press('Escape');
    // A refusal: the bubble below the cell (above near the bottom), never over the field; the name, invalid, description.
    await focusCell(page, 'm8', 'stock');
    await page.keyboard.press('F2');
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('-4');
    await page.keyboard.press('Enter');
    await frames(page, 2);
    const bub = () => page.evaluate(() => { const b = document.querySelector('.dzg-bubble'); const f = document.querySelector('.dzg-field'); const c = f.closest('.dzg-cell').getBoundingClientRect(); const r = b.getBoundingClientRect(), q = f.getBoundingClientRect(); return { shown: !b.hidden && r.height > 0, below: r.top >= c.bottom, above: r.bottom <= c.top, clear: r.top >= q.bottom || r.bottom <= q.top, start: getComputedStyle(b).direction === 'rtl' ? Math.abs(r.right - c.right) <= 1 || r.right >= innerWidth - 1 : Math.abs(r.left - c.left) <= 1, invalid: f.getAttribute('aria-invalid'), text: b.textContent }; });
    let bb = await bub();
    check(name, `${tag}: refused (-4 under min 0): the field kept, invalid, the bubble below the cell at its inline start, clear of the field`, bb.shown && bb.below && bb.clear && bb.start && bb.invalid === 'true', bb);
    v = await axe(page);
    check(name, `${tag}: axe 0 with the field refused and the bubble`, v.length === 0, v);
    // Review R2: the page scrolled with the bubble shown: placed again, still clear of the field; the cell scrolled out
    // of the grid's view: hidden, back when it returns. R4: a press on the bubble keeps the field and its text.
    const scrolled = await page.evaluate(async () => {
      document.body.style.paddingBlockEnd = '1600px';
      scrollTo(0, 150);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const b = document.querySelector('.dzg-bubble').getBoundingClientRect(), q = document.querySelector('.dzg-field').getBoundingClientRect();
      const out = { shown: !document.querySelector('.dzg-bubble').hidden, clear: b.top >= q.bottom || b.bottom <= q.top, below: b.top >= q.bottom - 1 && b.top - q.bottom < 12 };
      scrollTo(0, 0);
      document.body.style.paddingBlockEnd = '';
      return out;
    });
    check(name, `${tag}: the page scrolled with the bubble shown: placed again, below the field, clear of it`, scrolled.shown && scrolled.clear && scrolled.below, scrolled);
    const away = await page.evaluate(async () => {
      const vp = document.querySelector('.dzg-viewport');
      const b = document.querySelector('.dzg-bubble');
      const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      vp.scrollTop = 4000;
      await raf();
      const gone = b.hidden;
      vp.scrollTop = 0;
      await raf();
      return { gone, back: !b.hidden, field: !!document.querySelector('.dzg-field') };
    });
    check(name, `${tag}: the cell scrolled out of the grid's view: the bubble hidden, the field kept; back in view: shown`, away.gone && away.back && away.field, away);
    const bx = await page.evaluate(() => { const r = document.querySelector('.dzg-bubble').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(bx.x, bx.y);
    await page.waitForTimeout(30);
    const kept = await page.evaluate(() => { const f = document.querySelector('.dzg-field'); return { open: !!f, value: f?.value, active: document.activeElement === f }; });
    check(name, `${tag}: a click on the bubble keeps the field, its text and the focus (no O1)`, kept.open && kept.value === '-4' && kept.active, kept);
    const ax = await (async () => {
      const cdp = await page.context().newCDPSession(page);
      const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.dzg-field' });
      const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
      await cdp.detach();
      const n = nodes[0];
      return { role: n.role?.value, name: n.name?.value, description: n.description?.value, invalid: n.properties?.find((p) => p.name === 'invalid')?.value?.value };
    })();
    const wantName = rtl ? 'المخزون، باراسيتامول 8' : 'Stock, Paracétamol 8';
    check(name, `${tag}: the field's accessible name « ${wantName} », invalid, described by the bubble`, ax.name === wantName && ax.invalid && ax.invalid !== 'false' && ax.description === bb.text, ax);
    await page.screenshot({ path: `${OUT}/${name}-${tag.replace(/ /g, '-')}-refused.png`, clip: { x: 0, y: 0, width: 1000, height: 640 } });
    // Forced colours: the ring, the dashed outline, the bubble's border and sign.
    await page.emulateMedia({ forcedColors: 'active' });
    await frames(page, 2);
    const fc = await page.evaluate(() => { const f = document.querySelector('.dzg-field'); const b = document.querySelector('.dzg-bubble'); const s = getComputedStyle(f); const t = getComputedStyle(b); const sign = getComputedStyle(b, '::before'); return { outline: s.outlineStyle, ow: s.outlineWidth, border: t.borderTopStyle, bw: t.borderTopWidth, sign: sign.clipPath !== 'none' && sign.backgroundColor !== 'rgba(0, 0, 0, 0)' }; });
    check(name, `${tag}: forced colours: the refused field's dashed outline, the bubble's border and its sign`, fc.outline === 'dashed' && fc.ow === '2px' && fc.border === 'solid' && fc.sign, fc);
    // In forced colours the system draws the colours: axe's colour contrast does not apply (the rest does).
    v = (await axe(page)).filter((x) => !x.startsWith('color-contrast:'));
    check(name, `${tag}: axe 0 in forced colours with the bubble (colour contrast aside: the system's)`, v.length === 0, v);
    await page.emulateMedia({ forcedColors: 'none' });
    // The window's blur keeps the field; a click elsewhere drops the refused text (O1).
    await page.evaluate(() => document.querySelector('#after').focus());
    await page.waitForTimeout(30);
    st = await state(page);
    check(name, `${tag}: a click away from a refused field: the text dropped, the value back (O1)`, !st.open && (await text(page, 'm8', 'stock')) !== '-4' && !(await page.evaluate(() => !document.querySelector('.dzg-bubble').hidden)), st);
    // The last visible row: the bubble above.
    const lastId = await page.evaluate(() => { const v = document.querySelector('.dzg-viewport').getBoundingClientRect(); const rows = [...document.querySelectorAll('.dzg-layer > .dzg-row')].filter((r) => r.getBoundingClientRect().bottom <= v.bottom); rows.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top); return String(window.t.grid.context.rowRenderer.keyOf(rows[0])).replace(/^d:\d+:/, ''); });
    await page.evaluate(() => { document.querySelector('#host').style.marginBlockStart = `${innerHeight - 520}px`; });
    await frames(page, 2);
    await focusCell(page, lastId, 'stock');
    await page.keyboard.press('F2');
    await page.keyboard.type('x');
    await page.keyboard.press('Enter');
    await frames(page, 2);
    bb = await bub();
    check(name, `${tag}: refused on the last visible row near the window's bottom: the bubble above, clear of the field`, bb.shown && bb.above && bb.clear, { lastId, bb });
    await page.keyboard.press('Escape');
    check(name, `${tag}: no page error`, errors.length === 0, errors);
    await page.close();
  }

  // 320 px wide and 200 % zoom (a 500 × 380 CSS viewport): the bubble never over the field.
  for (const [tag, size] of [['320 px', { width: 320, height: 640 }], ['200 % zoom', { width: 500, height: 380 }]]) {
    const { page } = await open('locale=fr-FR&theme=light', { size });
    await focusCell(page, 'm2', 'stock');
    await page.keyboard.press('F2');
    await page.keyboard.type('x');
    await page.keyboard.press('Enter');
    await frames(page, 2);
    const r = await page.evaluate(() => { const b = document.querySelector('.dzg-bubble').getBoundingClientRect(); const q = document.querySelector('.dzg-field').getBoundingClientRect(); return { clear: b.top >= q.bottom || b.bottom <= q.top, inside: b.left >= 0 && b.right <= innerWidth + 1 }; });
    check(name, `editors ${tag}: the bubble clear of the field, inside the window`, r.clear && r.inside, r);
    await page.close();
  }

  // An input method (CDP; the OS path stays the owner's manual check, a11y-protocol §19): the key the IME sends
  // first (229) opens the field empty on the cell; the composition lands in it whole; Enter while composing keeps nothing.
  {
    const { page } = await open('locale=fr-FR&theme=light');
    await focusCell(page, 'm5', 'shelf');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Process', code: 'KeyK', windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
    let st = await state(page);
    const opened = st.open && st.value === '' && st.active;
    await cdp.send('Input.imeSetComposition', { text: 'かな', selectionStart: 2, selectionEnd: 2 });
    st = await state(page);
    const composingShown = st.value === 'かな';
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
    const stillOpen = (await state(page)).open;
    await cdp.send('Input.insertText', { text: 'かな' });
    st = await state(page);
    check(name, 'editors: an input method on a cell: the field opens empty, the composition lands whole, a composing Enter keeps nothing', opened && composingShown && stillOpen && st.open && st.value === 'かな', { opened, composingShown, stillOpen, st });
    await page.keyboard.press('Enter');
    await frames(page, 2);
    check(name, 'editors: then Enter keeps « かな »', (await text(page, 'm5', 'shelf')) === 'かな');
    // Chinese the same way.
    await focusCell(page, 'm6', 'shelf');
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Process', code: 'KeyZ', windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
    await cdp.send('Input.imeSetComposition', { text: 'zhong', selectionStart: 5, selectionEnd: 5 });
    await cdp.send('Input.insertText', { text: '中文' });
    st = await state(page);
    check(name, 'editors: Chinese through an input method lands whole (中文)', st.open && st.value === '中文', st);
    await cdp.detach();
    await page.close();
  }

  // 100 000 rows: 50 edits going down by Enter, while it scrolls: no long task, the field never in a pooled row.
  {
    const { page } = await open('locale=fr-FR&theme=light&rows=100000');
    await page.evaluate(() => { window.long = 0; new PerformanceObserver((l) => { window.long += l.getEntries().length; }).observe({ type: 'longtask', buffered: false }); });
    await focusCell(page, 'm40000', 'stock');
    let pooled = 0;
    for (let i = 0; i < 50; i++) {
      await page.keyboard.press('F2');
      await page.keyboard.type('7');
      await frames(page, 1);
      pooled += await page.evaluate(() => { const f = document.querySelector('.dzg-field'); const e = window.t.grid.context.editor; return f && e && f.closest('.dzg-row') === window.t.grid.context.rowRenderer.cell(e.key, e.column)?.closest('.dzg-row') ? 0 : 1; });
      await page.keyboard.press('Enter');
    }
    await frames(page, 3);
    const r = await page.evaluate(() => ({ long: window.long, at: window.t.grid.kernel.focus.row }));
    check(name, 'editors: 100 000 rows, 50 edits down by Enter: no long task, the field always in its own row', r.long === 0 && pooled === 0 && String(r.at).endsWith('m40050'), { ...r, pooled });
    await page.close();
  }

  // A double tap in mobile emulation opens the field; a single tap does not.
  {
    const mctx = await ctx.browser().newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 700 }, deviceScaleFactor: 2 });
    const { page } = await open('locale=fr-FR', { ctx: mctx });
    const box = await page.evaluate((s) => { const r = eval(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, cellSel('m2', 'stock'));
    await page.touchscreen.tap(box.x, box.y);
    await page.waitForTimeout(500);
    const one = (await state(page)).open;
    await page.touchscreen.tap(box.x, box.y);
    await page.waitForTimeout(80);
    await page.touchscreen.tap(box.x, box.y);
    await frames(page, 2);
    const st = await state(page);
    check(name, 'editors (mobile emulation): one tap only focuses; a double tap opens the field, focused', !one && st.open && st.active && st.at === 'm2/stock', { one, st });
    await mctx.close();
  }
  // Home, End, PageUp, PageDown in an open field (step 6, found on the playground): Chrome on a Mac scrolls the grid on
  // Home/End instead of moving the caret, PageUp/PageDown scroll it everywhere; the field takes them, the view stays.
  {
    const { page, errors } = await open('locale=fr-FR&theme=light&skin=clinic&rows=200');
    await focusCell(page, 'm3', 'note');
    await page.keyboard.press('F2');
    await page.keyboard.type('abc');
    const keys = [];
    for (const k of ['Home', 'End', 'PageDown', 'PageUp', 'End']) {
      await page.keyboard.press(k);
      await page.waitForTimeout(250);
      keys.push(await page.evaluate(() => [document.querySelector('.dzg-viewport').scrollTop, document.querySelector('.dzg-field')?.selectionStart]));
    }
    await page.keyboard.press('Enter');
    await frames(page, 3);
    const after = await page.evaluate((s) => ({ top: document.querySelector('.dzg-viewport').scrollTop, text: eval(s)?.textContent }), cellSel('m3', 'note'));
    check(name, 'editors: Home, End, PageUp, PageDown in a field move the caret only, the grid never scrolls; Enter keeps in view',
      keys.every(([top]) => top === 0) && keys.map((x) => x[1]).join() === '0,3,3,3,3' && after.top === 0 && after.text === 'abc', { keys, after });
    check(name, 'editors: no page error (field keys)', errors.length === 0, errors);
    await page.close();
  }
}

/**
 * The step-6 editors on the test page (`editors.html?kinds=1`; step06-plan « Browser »; `-- --only editors`): the
 * calendar lazy (no request before the first open, one then, none after; a failing chunk shows the alert and Retry
 * loads it), its dialog in the top layer never over the field, its keys (mirrored in Arabic), Escape twice; an
 * instant's hour menu on the clock-change days of Paris (02 twice, 02 absent) and the winter reading kept; the list
 * (combobox, listbox in the top layer, Arabic type-ahead cycling); the yes/no toggle by Space (the row not selected);
 * axe 0 with each open, also in forced colours; 320 px.
 */
async function editorsKindsChecks(name, ctx) {
  const open = async (qs, size = { width: 1400, height: 800 }) => {
    const page = await ctx.newPage();
    await page.setViewportSize(size);
    const errors = [];
    const asked = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/offline \(calfail/.test(m.text())) errors.push(m.text()); });
    page.on('request', (r) => { if (/editors\/dates\/calendar|dzgrid-browser\/(dom|core)\.js/.test(r.url())) asked.push(r.url().replace(/^.*\/(packages|node_modules)/, '$1')); });
    await page.goto(site.root(`packages/dom/test/browser/editors.html?kinds=1&${qs}`));
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
    await frames(page, 3);
    return { page, errors, asked };
  };
  const focusCell = (page, id, col) => page.evaluate(([id, col]) => window.t.grid.api.focusCell(window.t.key(id), col), [id, col]).then(() => frames(page, 2));
  const keyText = async (page, ch) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
    await cdp.detach();
  };
  const rects = (page) => page.evaluate(() => {
    const f = document.querySelector('.dzg-field');
    const p = document.querySelector('.dzg-popup');
    const r = (e) => e && (({ top, bottom, left, right }) => ({ top, bottom, left, right }))(e.getBoundingClientRect());
    let top = false;
    try { top = !!p?.matches(':popover-open'); } catch {}
    return { field: r(f), pop: r(p), top, w: innerWidth, h: innerHeight };
  });
  const clear = (x) => !!x.pop && !!x.field && (x.pop.top >= x.field.bottom - 0.5 || x.pop.bottom <= x.field.top + 0.5) && x.pop.left >= -0.5 && x.pop.right <= x.w + 0.5;
  const saved = (page) => page.evaluate(() => window.t.events.filter((e) => e.type === 'cellEdited').map((e) => [e.column, e.value]));
  if (name === 'webkit') {
    // WebKit (spike rule): the calendar's dialog and the list in the top layer, clear of the field.
    const { page } = await open('locale=fr-FR&theme=light&skin=clinic');
    await focusCell(page, 'm2', 'exp');
    await page.keyboard.press('F2');
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForSelector('.dzg-popup[role=dialog] .tz-cal', { timeout: 15000 });
    const a = await rects(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await focusCell(page, 'm4', 'status');
    await page.keyboard.press('F2');
    await frames(page, 2);
    const b = await rects(page);
    check(name, 'editors kinds (WebKit): the calendar and the list in the top layer, clear of the field', a.top && b.top && clear(a) && clear(b), { a, b });
    await page.close();
    return;
  }

  for (const [tag, qs, rtl] of [['fr light clinic', 'locale=fr-FR&theme=light&skin=clinic', false], ['ar rtl dark midnight', 'locale=ar-DZ&theme=dark&skin=midnight', true]]) {
    const { page, errors, asked } = await open(qs);
    // Lazy: typing a date downloads nothing; the first open one chunk (and tzslot); the second none.
    await focusCell(page, 'm2', 'exp');
    await page.keyboard.press('F2');
    await page.keyboard.type('1');
    await page.keyboard.press('Backspace');
    const before = asked.length;
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForSelector('.dzg-popup[role=dialog] .tz-cal', { timeout: 15000 });
    await frames(page, 2);
    const first = asked.length;
    let r = await rects(page);
    const day0 = await page.evaluate(() => document.activeElement?.dataset?.date ?? null);
    let v = await axe(page);
    check(name, `editors kinds ${tag}: no calendar request before the first open, then the chunk (and tzslot) once; the dialog in the top layer, clear of the field, focus on a day; axe 0`,
      before === 0 && first >= 1 && asked.filter((u) => /calendar\.js$/.test(u)).length === 1 && r.top && clear(r) && day0 === '2026-03-15' && v.length === 0, { before, asked, r, day0, v });
    // Arrows (mirrored in Arabic), Enter picks: the field written, the dialog closed, focus back in the field.
    await page.keyboard.press('ArrowRight');
    const day1 = await page.evaluate(() => document.activeElement?.dataset?.date ?? null);
    await page.keyboard.press('Enter');
    await frames(page, 2);
    const picked = await page.evaluate(() => ({ dialog: !!document.querySelector('.dzg-popup[role=dialog]'), value: document.querySelector('.dzg-field')?.value, active: document.activeElement === document.querySelector('.dzg-field') }));
    check(name, `editors kinds ${tag}: ArrowRight moves to the ${rtl ? 'previous' : 'next'} day (tzslot's mirroring), Enter picks it: written, closed, the field focused`,
      day1 === (rtl ? '2026-03-14' : '2026-03-16') && !picked.dialog && picked.active && /1[46]/.test(picked.value ?? ''), { day1, picked });
    // Escape twice: the calendar, then the edit; nothing saved.
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForSelector('.dzg-popup[role=dialog] .tz-cal');
    await page.keyboard.press('Escape');
    const esc1 = await page.evaluate(() => ({ dialog: !!document.querySelector('.dzg-popup[role=dialog]'), field: !!document.querySelector('.dzg-field'), active: document.activeElement === document.querySelector('.dzg-field') }));
    await page.keyboard.press('Escape');
    const esc2 = await page.evaluate(() => !!document.querySelector('.dzg-field'));
    const s0 = await saved(page);
    check(name, `editors kinds ${tag}: Escape closes the calendar only (the field stays, focused), a second Escape the edit; nothing saved; the chunk not fetched again`,
      !esc1.dialog && esc1.field && esc1.active && !esc2 && s0.length === 0 && asked.filter((u) => /calendar\.js$/.test(u)).length === 1, { esc1, esc2, s0, asked });
    // An instant on 25/10/2026 in Paris: 02 twice in the hour menu; the winter reading picked and kept.
    await focusCell(page, 'm1', 'recv');
    await page.keyboard.press('F2');
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForSelector('.dzg-popup[role=dialog] select');
    const hours = await page.evaluate(() => [...document.querySelectorAll('.dzg-popup select[data-part=hour] option')].map((o) => o.value).filter((x) => x.startsWith('2|')));
    await page.selectOption('.dzg-popup select[data-part=hour]', '2|+01:00');
    await page.focus('.dzg-popup select[data-part=hour]');
    await page.keyboard.press('Enter');
    await frames(page, 2);
    const text = await page.evaluate(() => document.querySelector('.dzg-field')?.value);
    await page.keyboard.press('Enter');
    await frames(page, 2);
    const s1 = await saved(page);
    check(name, `editors kinds ${tag}: Paris 25/10/2026 offers 02 twice; the winter reading picked is saved as 01:30 UTC`,
      hours.join() === '2|+02:00,2|+01:00' && /02:30/.test(text ?? '') && s1.at(-1)?.[0] === 'recv' && s1.at(-1)?.[1] === Date.UTC(2026, 9, 25, 1, 30), { hours, text, s1 });
    // 29/03/2026: the hour the clocks skip is not offered.
    await focusCell(page, 'm2', 'recv');
    await page.keyboard.press('F2');
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForSelector('.dzg-popup[role=dialog] select');
    v = await axe(page);
    const gap = await page.evaluate(() => [...document.querySelectorAll('.dzg-popup select[data-part=hour] option')].map((o) => o.value).filter((x) => x.startsWith('2|')));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    check(name, `editors kinds ${tag}: Paris 29/03/2026 offers no 02 (skipped); axe 0 with the instant's calendar open`, gap.length === 0 && v.length === 0, { gap, v });
    // The list: the combobox in the cell, the listbox in the top layer under it; type-ahead; Enter keeps.
    await focusCell(page, 'm4', 'status');
    await page.keyboard.press('F2');
    await frames(page, 2);
    r = await rects(page);
    const lst = await page.evaluate(() => { const c = document.querySelector('.dzg-combo'); return { role: c?.getAttribute('role'), active: document.activeElement === c, n: document.querySelectorAll('.dzg-popup [role=option]').length, sel: document.getElementById(c?.getAttribute('aria-activedescendant'))?.textContent }; });
    v = await axe(page);
    check(name, `editors kinds ${tag}: the list: a focused combobox, four options in the top layer, clear of the cell; axe 0`, lst.role === 'combobox' && lst.active && lst.n === 4 && r.top && clear(r) && v.length === 0, { lst, r, v });
    const act = () => page.evaluate(() => document.getElementById(document.querySelector('.dzg-combo')?.getAttribute('aria-activedescendant'))?.textContent ?? null);
    const seq = [];
    const letter = rtl ? 'م' : 'é';
    for (let i = 0; i < 3; i++) { await keyText(page, letter); seq.push(await act()); await page.waitForTimeout(60); }
    const want = rtl ? ['منخفض', 'مطلوب', 'متوفر'] : ['Épuisé', 'Épuisé', 'Épuisé'];
    // A fourth press: in Arabic the cycle comes round to منخفض (the third was the cell's own value: nothing to save).
    if (rtl) await keyText(page, letter);
    await page.keyboard.press('Enter');
    await frames(page, 2);
    const s2 = await saved(page);
    check(name, `editors kinds ${tag}: type-ahead by real keys (« ${letter} » ×3: ${rtl ? 'cycles through the three م options' : 'folded é finds Épuisé, the only one'}), Enter keeps it`,
      JSON.stringify(seq) === JSON.stringify(want) && s2.at(-1)?.[0] === 'status' && s2.at(-1)?.[1] === (rtl ? 'low' : 'out'), { seq, want, s2 });
    // Forced colours: the list open, axe 0 (contrast is the system's).
    await focusCell(page, 'm5', 'status');
    await page.keyboard.press('F2');
    await page.emulateMedia({ forcedColors: 'active' });
    await frames(page, 2);
    const vf = (await axe(page)).filter((x) => !x.startsWith('color-contrast'));
    await page.emulateMedia({ forcedColors: 'none' });
    await page.keyboard.press('Escape');
    check(name, `editors kinds ${tag}: forced colours with the list open: axe 0 (contrast aside)`, vf.length === 0, vf);
    // Yes/no: Space toggles, the row is not selected.
    await focusCell(page, 'm3', 'ok');
    const ok0 = await page.evaluate(() => window.t.grid.context.rowRenderer.cell(window.t.key('m3'), 'ok')?.textContent);
    await page.keyboard.press(' ');
    await frames(page, 2);
    const ok1 = await page.evaluate(() => ({ text: window.t.grid.context.rowRenderer.cell(window.t.key('m3'), 'ok')?.textContent, sel: document.querySelector('.dzg-row[aria-selected=true]') !== null }));
    v = await axe(page);
    check(name, `editors kinds ${tag}: Space toggles a yes/no cell, the row not selected; axe 0 after it`, ok0 !== ok1.text && !ok1.sel && v.length === 0, { ok0, ok1, v });
    check(name, `editors kinds ${tag}: no page error`, errors.length === 0, errors);
    await page.close();
  }

  // A real press on the calendar button (review m07): the focus stays in the field while the mouse is down (mousedown
  // prevented), the click opens the dialog.
  {
    const { page } = await open('locale=fr-FR');
    await focusCell(page, 'm2', 'exp');
    await page.keyboard.press('F2');
    const b = await page.evaluate(() => { const r = document.querySelector('.dzg-calbtn').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(b.x, b.y);
    await page.mouse.down();
    const held = await page.evaluate(() => document.activeElement === document.querySelector('.dzg-field'));
    await page.mouse.up();
    await page.waitForSelector('.dzg-popup[role=dialog] .tz-cal', { timeout: 15000 });
    check(name, 'editors kinds: a real press on the calendar button keeps the focus in the field, the click opens the dialog', held, { held });
    await page.close();
  }
  // A failing chunk: the alert and Retry, axe 0; Retry loads it, the focus stays in the dialog.
  {
    const { page, errors } = await open('locale=fr-FR&calfail=1');
    await focusCell(page, 'm2', 'exp');
    await page.keyboard.press('F2');
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForSelector('.dzg-popup[role=dialog] [role=alert]');
    const v = await axe(page);
    const alert = await page.evaluate(() => document.querySelector('.dzg-popup [role=alert]')?.textContent);
    await page.click('.dzg-popup .dzg-fretry');
    await page.waitForSelector('.dzg-popup[role=dialog] .tz-cal', { timeout: 15000 });
    const inside = await page.evaluate(() => document.querySelector('.dzg-popup').contains(document.activeElement));
    check(name, 'editors kinds: a failing calendar chunk shows the alert and Retry (axe 0); Retry loads it, the focus in the dialog', alert === 'Le calendrier n’a pas pu se charger' && v.length === 0 && inside, { alert, v, inside });
    // The page's loader fails once on purpose: the grid reports it (reportError), nothing else.
    check(name, 'editors kinds: no page error (calendar failure) but the reported offline one', errors.filter((e) => !/offline \(calfail=1\)/.test(e)).length === 0, errors);
    await page.close();
  }
  // 320 px: the calendar and the list inside the window, clear of the field.
  {
    const { page } = await open('locale=fr-FR', { width: 320, height: 640 });
    await focusCell(page, 'm2', 'exp');
    await page.keyboard.press('F2');
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForSelector('.dzg-popup[role=dialog] .tz-cal', { timeout: 15000 });
    await frames(page, 2);
    const a = await rects(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await focusCell(page, 'm4', 'status');
    await page.keyboard.press('F2');
    await frames(page, 2);
    const b = await rects(page);
    check(name, 'editors kinds: at 320 px the calendar and the list stay inside the window, clear of the field', clear(a) && clear(b), { a, b });
    await page.close();
  }
}

/**
 * The editing demo as the owner uses it (Phase 5 step 6, owner feedback « ça ne fonctionne pas »; `-- --only
 * playground`): the REAL playground page `orders-edit.html` served by the running vite (127.0.0.1:4700, or
 * DZG_PLAYGROUND), never this suite's own server. Real mouse double clicks and real typing, in French and in Arabic:
 * a visible Client cell opens, a typed change is saved (saving mark, then the value and « saved » in the log); a
 * quantity ending in 7 is refused by the simulated server and returns; « Commande » opens nothing; Urgent toggles;
 * Statut opens its list, a letter picks, Enter saves. No page error.
 */
async function playgroundEditChecks(name, ctx) {
  const base = process.env.DZG_PLAYGROUND ?? 'http://127.0.0.1:4700';
  for (const [tag, qs, ar] of [['fr', 'locale=fr-FR&theme=light&skin=clinic', false], ['ar', 'locale=ar-DZ&theme=dark&skin=midnight', true]]) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}/orders-edit.html?${qs}`);
    await page.waitForSelector('.dzg-layer > .dzg-row .dzg-cell[data-col="client"]', { timeout: 30000 });
    await frames(page, 3);
    const cell = (ref, col) => page.evaluate(([ref, col]) => {
      const c = [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => r.querySelector('[data-col="ref"]')?.textContent === ref)?.querySelector(`[data-col="${col}"]`);
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: c.textContent, cls: c.className, ro: c.getAttribute('aria-readonly') };
    }, [ref, col]);
    const dbl = async (ref, col) => {
      const c = await cell(ref, col);
      await page.mouse.dblclick(c.x, c.y);
      await frames(page, 2);
    };
    const field = () => page.evaluate(() => { const f = document.querySelector('.dzg-field'); return f ? { value: f.value ?? f.textContent, active: document.activeElement === f || f.contains(document.activeElement), combo: f.getAttribute('role') === 'combobox' } : null; });
    const log = () => page.evaluate(() => [...document.querySelectorAll('#log li')].map((l) => l.textContent));
    // Client: a real double click on a visible cell, typing, Enter: the saving mark, then the value and « saved ».
    const before = await cell('O-0002', 'client');
    await dbl('O-0002', 'client');
    const opened = await field();
    await page.keyboard.press('End');
    await page.keyboard.type(' Nord');
    await page.keyboard.press('Enter');
    await frames(page, 2);
    const saving = await cell('O-0002', 'client');
    await page.waitForTimeout(1000);
    const saved = await cell('O-0002', 'client');
    const l1 = await log();
    check(name, `playground orders-edit (${tag}): a real double click on a visible Client cell opens the field; Enter saves it (saving mark, then the value and « saved » in the log)`,
      before.ro !== 'true' && !!opened?.active && opened.value === before.text && /dzg-cell--(saving|pending)/.test(saving.cls) && saved.text === `${before.text} Nord` && (ar ? /حُفظ/ : /enregistré/).test(l1[0] ?? ''), { before, opened, saving, saved, l1 });
    // Qté ending in 7: the simulated server refuses, the cell returns to its value, the log says why.
    const q0 = await cell('O-0003', 'qty');
    await dbl('O-0003', 'qty');
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('17');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const qMid = await cell('O-0003', 'qty');
    await page.waitForTimeout(1000);
    const q1 = await cell('O-0003', 'qty');
    const l2 = await log();
    check(name, `playground orders-edit (${tag}): Qté 17 is refused by the simulated server: the cell marks the refusal and returns to ${q0.text}; the log says it`,
      qMid.text === '17' && q1.text === q0.text && /dzg-cell--(refused|failed)/.test(q1.cls) && (ar ? /مرفوض/ : /refusé/).test(l2[0] ?? ''), { q0, qMid, q1, l2 });
    // Commande: read-only, seen so; a double click opens nothing.
    const ref = await cell('O-0004', 'ref');
    await dbl('O-0004', 'ref');
    const none = await field();
    check(name, `playground orders-edit (${tag}): « Commande » is read-only (aria-readonly, muted class) and a double click there opens nothing`, ref.ro === 'true' && /demo-locked/.test(ref.cls) && none === null, { ref, none });
    // Urgent: a double click toggles once.
    const u0 = await cell('O-0005', 'urgent');
    await dbl('O-0005', 'urgent');
    await page.waitForTimeout(50);
    const u1 = await cell('O-0005', 'urgent');
    check(name, `playground orders-edit (${tag}): a double click on Urgent toggles it once`, u0.text !== u1.text && (await field()) === null, { u0, u1 });
    // Statut: the list opens, a letter picks, Enter saves.
    await dbl('O-0006', 'status');
    const combo = await field();
    const listShown = await page.evaluate(() => !!document.querySelector('.dzg-popup [role=listbox]'));
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await frames(page, 2);
    const st = await page.evaluate(() => ({ list: !!document.querySelector('.dzg-popup [role=listbox]'), field: !!document.querySelector('.dzg-field') }));
    await page.waitForTimeout(800);
    const l3 = await log();
    check(name, `playground orders-edit (${tag}): Statut opens the list (combobox, listbox shown); Down then Enter keeps it`, !!combo?.combo && combo.active && listShown && !st.list && !st.field && (ar ? /الحالة/ : /Statut/).test(l3.join(' ')), { combo, listShown, st, l3 });
    // Step 7 (owner S7-O6) on the same page, real mouse and keyboard.
    // Enter stays (Q3 revised): the focus on the cell kept.
    await dbl('O-0007', 'qty');
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('12');
    await page.keyboard.press('Enter');
    await frames(page, 2);
    const stayed = await page.evaluate(() => { const c = document.activeElement; return c?.dataset?.col === 'qty' && c.closest('.dzg-row')?.querySelector('[data-col="ref"]')?.textContent; });
    // The saved flash (motion on).
    const flashed = await page.evaluate(() => new Promise((done) => { const t0 = performance.now(); const f = () => { const c = [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => r.querySelector('[data-col="ref"]')?.textContent === 'O-0007')?.querySelector('[data-col="qty"]'); if (c?.classList.contains('dzg-flash')) return done(true); if (performance.now() - t0 < 1500) requestAnimationFrame(f); else done(false); }; requestAnimationFrame(f); }));
    check(name, `playground orders-edit (${tag}): Enter stays on the cell (default); saved: the flash shows (Animations on)`, stayed === 'O-0007' && flashed, { stayed, flashed });
    // The refusal's reason on hover (Qté 17 above was refused on O-0003).
    const q3 = await cell('O-0003', 'qty');
    await page.mouse.move(q3.x, q3.y + 120);
    await page.waitForTimeout(250);
    await page.mouse.move(q3.x, q3.y);
    await page.waitForTimeout(800);
    const why = await page.evaluate(() => { const t = document.querySelector('.dzg-tooltip'); return t.hidden ? null : t.textContent; });
    check(name, `playground orders-edit (${tag}): hovering the refused cell shows the server's reason`, !!why && why.includes(ar ? 'رفضه خادم العرض' : 'refusé par le serveur de démonstration'), why);
    // Retry by reopening: F2 offers « 17 ».
    await page.mouse.click(q3.x, q3.y);
    await page.keyboard.press('F2');
    await frames(page, 2);
    const offered = (await field())?.value;
    await page.keyboard.press('Escape');
    check(name, `playground orders-edit (${tag}): F2 on the refused cell offers the refused « 17 »`, offered === '17', offered);
    // Animations off: no flash.
    await page.click('#live label:nth-of-type(1) input');
    await dbl('O-0008', 'qty');
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('13');
    await page.keyboard.press('Enter');
    const noFlash = await page.evaluate(() => new Promise((done) => { let seen = false; const t0 = performance.now(); const f = () => { if (document.querySelector('.dzg-flash')) seen = true; if (performance.now() - t0 < 1200) requestAnimationFrame(f); else done(!seen); }; requestAnimationFrame(f); }));
    check(name, `playground orders-edit (${tag}): « Animations » off: saved without a flash`, noFlash, noFlash);
    // The network cut: « serveur injoignable ».
    await page.click('#live label:nth-of-type(2) input');
    await dbl('O-0009', 'qty');
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('14');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    const cut = await page.evaluate(() => document.querySelector('.dzg-live[aria-live="assertive"]')?.textContent ?? '');
    await page.click('#live label:nth-of-type(2) input');
    check(name, `playground orders-edit (${tag}): « ${ar ? 'الخادم غير متاح' : 'Serveur injoignable'} » on: the save fails, « ${ar ? 'تعذّر الوصول إلى الخادم' : 'serveur injoignable'} » said`, cut.includes(ar ? 'تعذّر الوصول إلى الخادم' : 'serveur injoignable'), cut);
    // A row removed while edited: the 3 s button, a double click in its row, typing: the field gone, said.
    const r10 = await cell('O-0010', 'client');
    await page.mouse.click(r10.x, r10.y);
    await page.click('#live button:nth-of-type(1)');
    await dbl('O-0010', 'client');
    await page.keyboard.type(' X');
    await page.waitForTimeout(3300);
    const after = await page.evaluate(() => ({ field: !!document.querySelector('.dzg-field'), said: document.querySelector('.dzg-live[aria-live="assertive"]')?.textContent ?? '', onCell: !!document.activeElement?.closest('.dzg-cell'), row: [...document.querySelectorAll('.dzg-layer [data-col="ref"]')].some((c) => c.textContent === 'O-0010') }));
    const log5 = await log();
    check(name, `playground orders-edit (${tag}): « ${ar ? 'حذف هذا الطلب' : 'Supprimer cette commande'} dans 3 s » while typing: the row and the field gone, « ${ar ? 'حُذف الصف' : 'Ligne supprimée'} » said, the focus on a cell, nothing sent`, !after.field && !after.row && after.onCell && after.said.includes(ar ? 'حُذف الصف' : 'Ligne supprimée') && !log5.some((l) => /O-0010|X»|X »/.test(l) && (ar ? /أُرسل/ : /envoyé/).test(l)) && log5.some((l) => l === (ar ? 'حُذف الصف، أُلغي التعديل' : 'Ligne supprimée, modification annulée')), { after, log5 });
    check(name, `playground orders-edit (${tag}): no page error`, errors.length === 0, errors);
    await page.close();
  }
  // The paged mode (?paged=1): a page asked while a field is open sends the typed value at once.
  {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/orders-edit.html?locale=fr-FR&theme=light&skin=clinic&paged=1`);
    await page.waitForSelector('.dzg-layer > .dzg-row .dzg-cell[data-col="client"]', { timeout: 30000 });
    await page.waitForTimeout(500);
    const c = await page.evaluate(() => { const el = document.querySelector('.dzg-layer > .dzg-row [data-col="qty"]'); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, ref: el.closest('.dzg-row').querySelector('[data-col="ref"]').textContent }; });
    await page.click('#live button:nth-of-type(2)');
    await page.mouse.dblclick(c.x, c.y);
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('21');
    await page.waitForTimeout(3200);
    const sent = await page.evaluate(() => ({ log: [...document.querySelectorAll('#log li')].map((l) => l.textContent), field: !!document.querySelector('.dzg-field'), page: window.demo.grid.kernel.rows.page.index }));
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.demo.grid.kernel.dispatch({ type: 'page.go', index: 0 }, 'api'));
    await page.waitForTimeout(700);
    const back = await page.evaluate((ref) => [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => r.querySelector('[data-col="ref"]')?.textContent === ref)?.querySelector('[data-col="qty"]')?.textContent, c.ref);
    check(name, 'playground orders-edit (paged): « Page suivante dans 3 s » while typing: « 21 » sent at once, the field closed, page 2; back on page 1 the server kept 21', sent.log.some((l) => /21/.test(l) && /envoyé/.test(l)) && !sent.field && sent.page === 1 && back === '21', { sent, back });
    check(name, 'playground orders-edit (paged): no page error', errors.length === 0, errors);
    await page.close();
  }
  // Enter: « descend » (?enter=down) moves one row down.
  {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${base}/orders-edit.html?locale=ar-DZ&theme=dark&skin=midnight&enter=down`);
    await page.waitForSelector('.dzg-layer > .dzg-row .dzg-cell[data-col="client"]', { timeout: 30000 });
    await frames(page, 3);
    const c = await page.evaluate(() => { const el = document.querySelectorAll('.dzg-layer > .dzg-row')[1].querySelector('[data-col="qty"]'); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, idx: el.closest('.dzg-row').getAttribute('aria-rowindex') }; });
    await page.mouse.dblclick(c.x, c.y);
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('5');
    await page.keyboard.press('Enter');
    await frames(page, 2);
    const now = await page.evaluate(() => ({ idx: document.activeElement?.closest('.dzg-row')?.getAttribute('aria-rowindex'), label: document.querySelector('#enter-label')?.textContent, sel: document.querySelector('select[name=enter]').value }));
    check(name, 'playground orders-edit (ar, « Enter : ينزل »): Enter moves one row down; the selector in Arabic', Number(now.idx) === Number(c.idx) + 1 && now.label === 'Enter' && now.sel === 'down', { c, now });
    await page.close();
  }
}

/**
 * The saves end to end (Phase 5 step 7, docs/phase-5-steps/step07-plan.md « Browser »; `-- --only edit-saves`): a
 * stock list with `edit()`, `editors()` and `motion()`, a save the checks hold and answer. Chrome, French light
 * Clinic and Arabic right to left dark Midnight, real mouse and keyboard: the ring running while held and stopped at
 * the answer; the saved check and the flash fading (none without motion); a refusal: the blink, the value back, the
 * reason on hover after 500 ms and at once on a keyboard focus, clear of the cell, read once in the accessibility
 * tree, axe 0; retry by F2 with the refused text; the reapply mark pressed: rows glide, the focus on its header, the
 * sentence; a row removed while edited: the field gone, said, the focus on a cell, nothing sent; a server page
 * changed while open: sent at once; a network cut: « serveur injoignable »; reduced motion: the saved mark still;
 * forced colours; 50 saving cells while scrolling: no layout read in the marks' and the motion's paint, no long task.
 * WebKit (`--engine webkit`): the tooltip in the top layer.
 */
async function editSavesChecks(name, ctx) {
  const open = async (qs, o = {}) => {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1000, height: 760 });
    if (o.reduce) await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(site.root(`packages/dom/test/browser/edit-saves.html?${qs}`));
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
    await frames(page, 3);
    return { page, errors };
  };
  const centre = (page, id, col = 'stock') => page.evaluate(([id, col]) => { const r = window.t.cell(id, col).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }, [id, col]);
  const cls = (page, id, col = 'stock') => page.evaluate(([id, col]) => window.t.cell(id, col)?.className ?? null, [id, col]);
  const text = (page, id, col = 'stock') => page.evaluate(([id, col]) => window.t.cell(id, col)?.textContent ?? null, [id, col]);
  const loud = (page) => page.evaluate(() => document.querySelector('.dzg-live[aria-live="assertive"]').textContent);
  const polite = (page) => page.evaluate(() => window.said ?? []);
  const listen = (page) => page.evaluate(() => { window.said = []; const el = [...document.querySelectorAll('.dzg-live')].find((x) => x.getAttribute('aria-live') !== 'assertive'); new MutationObserver(() => { if (el.textContent) window.said.push(el.textContent); }).observe(el, { childList: true, characterData: true, subtree: true }); });
  /** Double click on a cell, select all, type, Enter. */
  const typeIn = async (page, id, value, col = 'stock') => {
    const c = await centre(page, id, col);
    await page.mouse.dblclick(c.x, c.y);
    await frames(page, 2);
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(value);
    await page.keyboard.press('Enter');
    await frames(page, 2);
  };
  /** On the focused, saving cell (owner, step 7): the focus ring and the saving border both seen, apart in colour and place. */
  const ringAndBorder = (page, id) => page.evaluate((id) => {
    const c = window.t.cell(id, 'stock');
    const cs = getComputedStyle(c);
    const b = getComputedStyle(c, '::before');
    const rgb = (t) => (t.match(/rgba?\(([^)]+)\)/)?.[1] ?? '').split(',').map((x) => parseFloat(x));
    const hue = ([r, g, bl]) => { const x = Math.max(r, g, bl), n = Math.min(r, g, bl), d = x - n; if (d < 1) return null; const h = x === r ? ((g - bl) / d) % 6 : x === g ? (bl - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
    const ring = rgb(cs.outlineColor);
    // The running arc's colour (the conic gradient), or the still border's.
    const border = b.backgroundImage !== 'none' ? rgb(b.backgroundImage) : rgb(b.borderBlockStartColor);
    const [h1, h2] = [hue(ring), hue(border)];
    const gap = h1 === null || h2 === null ? 180 : Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2));
    const cr = c.getBoundingClientRect();
    return { focused: document.activeElement === c, ringStyle: cs.outlineStyle, ringWidth: parseFloat(cs.outlineWidth), offset: parseFloat(cs.outlineOffset), inset: parseFloat(b.insetBlockStart), borderStyle: b.borderBlockStartStyle, running: document.getAnimations().some((a) => a.effect?.target === c && a.effect.pseudoElement === '::before' && a.playState === 'running'), ring, border, gap, h: cr.height };
  }, id);
  const apart = (r) => r.focused && r.ringStyle === 'solid' && r.ringWidth >= 2 && r.inset >= r.ringWidth - (r.offset < 0 ? -r.offset : 0) + 1 && r.gap >= 60;
  if (name === 'webkit') {
    // The tooltip of a failed cell in the top layer (a popover), seen whole.
    const { page, errors } = await open('locale=fr-FR&theme=light&skin=clinic');
    await typeIn(page, 'm2', '17');
    await page.evaluate(() => window.t.saves[0].no({ reason: 'verrouillé' }));
    await page.waitForTimeout(700);
    const c = await centre(page, 'm2');
    // The pointer is still on the cell from the double click: away, then back.
    await page.mouse.move(c.x, c.y + 200);
    await page.waitForTimeout(250);
    await page.mouse.move(c.x, c.y);
    await page.waitForTimeout(700);
    const tip = await page.evaluate(() => { const t = document.querySelector('.dzg-tooltip'); const r = t.getBoundingClientRect(); return { shown: !t.hidden, text: t.textContent, top: t.matches(':popover-open'), seen: t.contains(document.elementFromPoint(r.left + 4, r.top + 4)) }; });
    check(name, 'edit saves (webkit): the refusal\'s reason on hover, in the top layer, seen', tip.shown && /verrouillé/.test(tip.text) && tip.top && tip.seen, tip);
    check(name, 'edit saves (webkit): no page error', errors.length === 0, errors);
    await page.close();
    return;
  }
  for (const [tag, qs, ar] of [['fr', 'locale=fr-FR&theme=light&skin=clinic', false], ['ar', 'locale=ar-DZ&theme=dark&skin=midnight', true]]) {
    const { page, errors } = await open(qs);
    await listen(page);
    // 1. The ring runs while the save is held; stopped at the frame after the answer.
    await typeIn(page, 'm1', '42');
    // Enter stays (owner Q3 revised): the focus ring and the running border on one cell, both seen, apart.
    const rb = await ringAndBorder(page, 'm1');
    check(name, `edit saves ${tag}: a focused, saving cell: the focus ring (solid ${rb.ringWidth}px) and the running border inside it (${rb.inset}px in), hues ${Math.round(rb.gap)}° apart`, apart(rb) && rb.running, rb);
    const ring = () => page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target === window.t.cell('m1', 'stock') && a.effect.pseudoElement === '::before' && a.playState === 'running').length);
    const r1 = await ring();
    // 2. Saved: the check 1.5 s; the flash's --dzg-flash fading 1 → 0 in ~0.6 s.
    const samples = await page.evaluate(() => new Promise((done) => {
      window.t.saves[0].ok();
      const out = [];
      const t0 = performance.now();
      const f = () => { const c = window.t.cell('m1', 'stock'); out.push([Math.round(performance.now() - t0), c.classList.contains('dzg-flash'), parseFloat(getComputedStyle(c).getPropertyValue('--dzg-flash') || 'NaN'), c.classList.contains('dzg-cell--saved')]); if (performance.now() - t0 < 900) requestAnimationFrame(f); else done(out); };
      requestAnimationFrame(f);
    }));
    const r2 = await ring();
    const flashing = samples.filter((s) => s[1]);
    const falls = flashing.length > 3 && flashing[0][2] > 0.6 && flashing.slice(1).every((s, i) => s[2] <= flashing[i][2] + 1e-6) && samples.at(-1)[1] === false && samples.at(-1)[3];
    check(name, `edit saves ${tag}: the ring runs while held (${r1}), stops at the answer (${r2}); saved: the check, the flash fading 1 → 0 in ~0.6 s`, r1 > 0 && r2 === 0 && falls, { r1, r2, samples: samples.filter((_, i) => i % 6 === 0) });
    const hooks = await page.evaluate(() => window.t.hooks.filter((h) => h.includes('m1')).map((h) => h.split(':').pop()));
    check(name, `edit saves ${tag}: onCell told saving then saved`, hooks.join() === 'saving,saved', hooks);
    // 3. A refusal: the blink, the value back, the sign; the reason on hover after 500 ms, clear of the cell.
    const before = await text(page, 'm2');
    await typeIn(page, 'm2', '17');
    await page.evaluate((why) => window.t.saves[1].no({ reason: why }), ar ? 'مقفل' : 'verrouillé');
    await page.waitForTimeout(80);
    const during = await cls(page, 'm2');
    // Review 5: on the focused, refused cell the focus ring and the red border inside it, both seen, apart.
    const rr = await ringAndBorder(page, 'm2');
    check(name, `edit saves ${tag}: a focused, refused cell: the focus ring and the refusal border inside it (${rr.inset}px in), hues ${Math.round(rr.gap)}° apart`, apart(rr), rr);
    await page.waitForTimeout(600);
    const after = { cls: await cls(page, 'm2'), text: await text(page, 'm2') };
    check(name, `edit saves ${tag}: refused: the blink, then the last value (${before}) and the failed sign`, /dzg-cell--refused/.test(during) && /dzg-cell--failed/.test(after.cls) && after.text === before, { during, after, before });
    const c2 = await centre(page, 'm2');
    // The pointer is still on the cell from the double click: away, then back.
    await page.mouse.move(c2.x, c2.y + 200);
    await page.waitForTimeout(250);
    await page.mouse.move(c2.x, c2.y);
    await page.waitForTimeout(300);
    const early = await page.evaluate(() => !document.querySelector('.dzg-tooltip').hidden);
    await page.waitForTimeout(400);
    const tip = await page.evaluate(() => { const t = document.querySelector('.dzg-tooltip'); const r = t.getBoundingClientRect(); return { shown: !t.hidden, text: t.textContent, top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
    const clear = tip.top >= c2.bottom || tip.bottom <= c2.top;
    const side = ar ? Math.abs(tip.right - c2.right) < 2 : Math.abs(tip.left - c2.left) < 2;
    check(name, `edit saves ${tag}: hover: nothing at 300 ms, the reason at 700 ms, clear of the cell, at its inline start`, !early && tip.shown && tip.text.includes(ar ? 'مقفل' : 'verrouillé') && clear && side, { early, tip, c2 });
    let v = await axe(page);
    check(name, `edit saves ${tag}: axe 0 with the reason's tooltip shown`, v.length === 0, v);
    // The accessibility tree: the reason once in the cell's description.
    const cdp = await ctx.newCDPSession(page);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(250);
    await page.evaluate(() => { const g = window.t.grid; g.api.focusCell(window.t.key('m3'), 'stock'); });
    await page.keyboard.press('ArrowUp');
    await frames(page, 2);
    const tipNow = await page.evaluate(() => { const t = document.querySelector('.dzg-tooltip'); return t.hidden ? null : t.textContent; });
    const { result } = await cdp.send('Runtime.evaluate', { expression: 'document.activeElement' });
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { objectId: result.objectId, fetchRelatives: false });
    const desc = nodes[0]?.description?.value ?? '';
    const reason = ar ? 'مقفل' : 'verrouillé';
    check(name, `edit saves ${tag}: keyboard focus: the tooltip at once; the reason read once (the description)`, tipNow?.includes(reason) && desc.split(reason).length === 2, { tipNow, desc });
    await cdp.detach();
    // 4. Retry: F2 offers the refused text; 18 Enter → saved.
    await page.keyboard.press('Escape');
    await page.keyboard.press('F2');
    await frames(page, 2);
    const offered = await page.evaluate(() => document.querySelector('.dzg-field')?.value);
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('18');
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.t.saves[2].ok());
    await page.waitForTimeout(100);
    const retried = { cls: await cls(page, 'm2'), text: await text(page, 'm2') };
    check(name, `edit saves ${tag}: retry: F2 holds « 17 »; « 18 » Enter → saved`, offered === '17' && /dzg-cell--saved/.test(retried.cls) && retried.text === '18', { offered, retried });
    // 5. Reapply: sort by Stock, edit one, press the mark: rows glide, the focus on the header, the sentence.
    const head = await page.evaluate(() => { const r = document.querySelector('.dzg-hcell[data-col="stock"] .dzg-hlabel').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(head.x, head.y);
    await frames(page, 3);
    await page.waitForTimeout(400);
    const firstId = await page.evaluate(() => { const d = window.t.grid.kernel.rows.displayed; return d.nodeAt(0).data.id; });
    await typeIn(page, firstId, '119');
    await page.evaluate(() => window.t.saves.at(-1).ok());
    await page.waitForTimeout(700);
    const mark = await page.evaluate((ar) => { const b = document.querySelector('.dzg-hcell[data-col="stock"] .dzg-reapply'); if (!b) return null; const r = b.getBoundingClientRect(); const h = b.closest('.dzg-hcell').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, end: ar ? r.left - h.left < h.width / 2 : r.right - h.left > h.width / 2 }; }, ar);
    await page.evaluate(() => (window.said = []));
    let glided = false;
    if (mark) {
      await page.mouse.click(mark.x, mark.y);
      glided = await page.evaluate(() => new Promise((done) => { let seen = false; let n = 0; const f = () => { if ([...document.querySelectorAll('.dzg-layer > .dzg-row')].some((r) => /matrix|translate/.test(getComputedStyle(r).transform) && getComputedStyle(r).transform !== 'none')) seen = true; if (++n < 20) requestAnimationFrame(f); else done(seen); }; requestAnimationFrame(f); }));
    }
    await page.waitForTimeout(400);
    const after5 = await page.evaluate(() => ({ onHead: document.activeElement?.matches('.dzg-hcell[data-col="stock"]'), mark: !!document.querySelector('.dzg-reapply') }));
    const said5 = await polite(page);
    check(name, `edit saves ${tag}: the reapply mark (at the header's inline end) pressed: rows glide, the focus on the header, « ${ar ? 'أُعيد الترتيب' : 'Remis en ordre'} » said`, !!mark && mark.end && glided && after5.onHead && !after5.mark && said5.some((s) => s.includes(ar ? 'أُعيد الترتيب' : 'Remis en ordre')), { mark, glided, after5, said5 });
    // 6. A row removed while edited: the field gone, said, the focus on a cell, nothing sent.
    const sent6 = await page.evaluate(() => window.t.saves.length);
    const c6 = await centre(page, await page.evaluate(() => window.t.grid.kernel.rows.displayed.nodeAt(4).data.id));
    await page.mouse.dblclick(c6.x, c6.y);
    await frames(page, 2);
    await page.keyboard.type('5');
    const gone = await page.evaluate(() => window.t.grid.kernel.focus.row);
    await page.evaluate((k) => window.t.remove(String(k).replace(/^d:\d+:/, '')), gone);
    await page.waitForTimeout(300);
    const after6 = await page.evaluate(() => ({ field: !!document.querySelector('.dzg-field'), cell: !!document.activeElement?.closest('.dzg-row .dzg-cell'), sent: window.t.saves.length }));
    const l6 = await loud(page);
    check(name, `edit saves ${tag}: a row removed while edited: the field gone, « ${ar ? 'حُذف الصف' : 'Ligne supprimée'} » said, the focus on a cell, nothing sent`, !after6.field && after6.cell && after6.sent === sent6 && l6.includes(ar ? 'حُذف الصف' : 'Ligne supprimée'), { after6, sent6, l6 });
    // 8. A network cut: « serveur injoignable » said and in the tooltip.
    await typeIn(page, await page.evaluate(() => window.t.grid.kernel.rows.displayed.nodeAt(6).data.id), '33');
    const id8 = await page.evaluate(() => String(window.t.grid.kernel.focus.row).replace(/^d:\d+:/, ''));
    await page.evaluate(() => window.t.saves.at(-1).no(new TypeError('Failed to fetch')));
    await page.waitForTimeout(700);
    const l8 = await loud(page);
    const c8 = await centre(page, id8);
    await page.mouse.move(c8.x, c8.y + 200);
    await page.waitForTimeout(250);
    await page.mouse.move(c8.x, c8.y);
    await page.waitForTimeout(700);
    const t8 = await page.evaluate(() => { const t = document.querySelector('.dzg-tooltip'); return t.hidden ? '' : t.textContent; });
    const net = ar ? 'تعذّر الوصول إلى الخادم' : 'serveur injoignable';
    check(name, `edit saves ${tag}: a network cut: « ${net} » said and in the tooltip`, l8.includes(net) && t8.includes(net), { l8, t8 });
    // 10. Forced colours: the failed sign and the tooltip still seen.
    await page.emulateMedia({ forcedColors: 'active' });
    await frames(page, 2);
    const fc = await page.evaluate((id) => { const c = window.t.cell(id, 'stock'); const s = getComputedStyle(c, '::after'); const t = document.querySelector('.dzg-tooltip'); const ts = getComputedStyle(t); return { sign: s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.clipPath !== 'none', tip: !t.hidden && ts.color !== ts.backgroundColor }; }, id8);
    check(name, `edit saves ${tag}: forced colours: the failed sign and the tooltip seen`, fc.sign && fc.tip, fc);
    await page.emulateMedia({ forcedColors: 'none' });
    v = await axe(page);
    check(name, `edit saves ${tag}: axe 0 at the end (marks, tooltip)`, v.length === 0, v);
    check(name, `edit saves ${tag}: no page error`, errors.length === 0, errors);
    await page.screenshot({ path: `${OUT}/edit-saves-${tag}.png` });
    await page.close();
  }

  // Without motion: the check, no flash. Reduced motion: the saved mark still 0.6 s, nothing moving.
  for (const [how, qs, o] of [['without motion()', 'locale=fr-FR&theme=light&motion=0', {}], ['reduced motion', 'locale=fr-FR&theme=light', { reduce: true }]]) {
    const { page, errors } = await open(qs, o);
    await typeIn(page, 'm1', '42');
    if (how === 'reduced motion') {
      const rb = await ringAndBorder(page, 'm1');
      check(name, `edit saves reduced motion: a focused, saving cell: the focus ring and the still dashed border inside it, apart (${Math.round(rb.gap)}°), nothing running`, apart(rb) && rb.borderStyle === 'dashed' && !rb.running, rb);
    }
    const s = await page.evaluate(() => new Promise((done) => {
      window.t.saves[0].ok();
      const out = [];
      const t0 = performance.now();
      const f = () => { const c = window.t.cell('m1', 'stock'); out.push([Math.round(performance.now() - t0), c.classList.contains('dzg-flash'), getComputedStyle(c).getPropertyValue('--dzg-flash').trim(), c.classList.contains('dzg-cell--saved'), document.getAnimations().filter((a) => a.effect?.target === c && a.playState === 'running').length]); if (performance.now() - t0 < 900) requestAnimationFrame(f); else done(out); };
      requestAnimationFrame(f);
    }));
    const ok = how === 'without motion()'
      ? s.every((x) => !x[1]) && s.some((x) => x[3])
      : s.filter((x) => x[0] > 100 && x[0] < 500).every((x) => x[1] && x[2] === '1' && x[4] === 0) && s.at(-1)[1] === false && s.at(-1)[3];
    check(name, `edit saves ${how}: ${how === 'without motion()' ? 'the check, no flash' : 'the saved mark still (--dzg-flash 1) for 0.6 s, no animation, then gone'}`, ok, s.filter((_, i) => i % 6 === 0));
    check(name, `edit saves ${how}: no page error`, errors.length === 0, errors);
    await page.close();
  }

  // 7. A server page changed while open: the typed value sent at once, before the answer; the server's value after.
  {
    const { page, errors } = await open('locale=fr-FR&theme=light&paged=1');
    const c = await centre(page, 'm3');
    await page.mouse.dblclick(c.x, c.y);
    await frames(page, 2);
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('77');
    const r = await page.evaluate(() => { const s0 = window.t.saves.length; window.t.grid.kernel.dispatch({ type: 'page.go', index: 1 }, 'api'); return { sent: window.t.saves.length - s0, value: window.t.saves.at(-1)?.req.changes[0].value, field: !!document.querySelector('.dzg-field') }; });
    await page.evaluate(() => window.t.saves.at(-1).ok());
    await page.waitForTimeout(100);
    await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'page.go', index: 0 }, 'api'));
    await page.waitForTimeout(200);
    const back = await text(page, 'm3');
    check(name, `edit saves paged: a page changed while open: « 77 » sent at once, the field closed; back on the page the server's value (${back})`, r.sent === 1 && r.value === 77 && !r.field && back !== null, { r, back });
    check(name, 'edit saves paged: no page error', errors.length === 0, errors);
    await page.close();
  }

  // 11. 50 saving cells while scrolling: no layout read in the marks' and the motion's paint, no long task.
  {
    const { page, errors } = await open('locale=fr-FR&theme=light');
    const r = await page.evaluate(async () => {
      const { grid, api, key } = window.t;
      const long = [];
      new PerformanceObserver((l) => long.push(...l.getEntries().map((e) => e.duration))).observe({ type: 'longtask', buffered: false });
      api.commit(Array.from({ length: 50 }, (_, i) => ({ key: key(`m${i}`), column: 'stock', input: { text: String(500 + i) } })));
      const reads = { edit: 0, motion: 0 };
      const stacks = [];
      let inPaint = null;
      const count = (proto, k) => { const d = Object.getOwnPropertyDescriptor(proto, k); const hit = () => { if (inPaint) { reads[inPaint]++; if (stacks.length < 2) stacks.push(`${k} ${new Error().stack.split('\n').slice(2, 6).join(' < ')}`); } }; Object.defineProperty(proto, k, { ...d, ...(d.get ? { get() { hit(); return d.get.call(this); } } : { value(...a) { hit(); return d.value.apply(this, a); } }) }); };
      count(Element.prototype, 'getBoundingClientRect');
      for (const k of ['offsetTop', 'offsetLeft', 'offsetWidth', 'offsetHeight', 'offsetParent']) count(HTMLElement.prototype, k);
      // The edit feature's handle and the motion's (the features' order: edit, editors, motion).
      for (const [n, h] of [['edit', grid.context.features[0]], ['motion', grid.context.features[2]]]) { const after = h.afterRows; h.afterRows = (f) => { inPaint = n; try { after(f); } finally { inPaint = null; } }; }
      const vp = document.querySelector('.dzg-viewport');
      for (let i = 0; i < 60; i++) { vp.scrollTop = (i % 30) * 40; if (i === 30) window.t.saves[0].ok(); await new Promise((r) => requestAnimationFrame(r)); }
      return { reads, stacks, long, saved: document.querySelectorAll('.dzg-cell--saved').length };
    });
    check(name, `edit saves: 50 saving cells while scrolling, then saved: no layout read in the marks' and the motion's paint, no long task`, r.reads.edit === 0 && r.reads.motion === 0 && r.long.length === 0, r);
    check(name, 'edit saves scrolling: no page error', errors.length === 0, errors);
    await page.close();
  }
}

/** What the step-8 checks (scripts/browser-undo.mjs) are given. */
const H = { check, frames, site, axe, OUT };

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
      if (only === 'tree' && name === 'chrome') await treeChecks(name, ctx), await editTreeChecks(name, ctx, H);
      if (only === 'detail' && name === 'chrome') await detailChecks(name, ctx), await detailFeatureChecks(name, ctx), await editDetailChecks(name, ctx, H);
      if (only === 'filters' && name === 'chrome') await floatingToggleChecks(name, ctx);
      if (only === 'themes') await themeChecks(name, ctx);
      if (only === 'bridges' && name === 'chrome') await frameworkChecks(name, ctx);
      if (only === 'dates' && name === 'chrome') await dateChecks(name, ctx);
      if (only === 'demos') await demosChecks(name, ctx);
      // Step 7: the marks in Firefox and WebKit too (`--engine firefox|webkit`: the ring, mask, :dir(rtl), blink, still).
      if (only === 'edit-marks') await editMarksChecks(name, ctx);
      if (only === 'edit-saves' && name !== 'firefox') await editSavesChecks(name, ctx);
      if (only === 'editors') await editorsChecks(name, ctx), name !== 'firefox' && (await editorsKindsChecks(name, ctx));
      if (only === 'playground' && name === 'chrome') await playgroundEditChecks(name, ctx), await playgroundUndoChecks(name, ctx, H);
      if (only === 'edit-undo') await editUndoChecks(name, ctx, H);
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

    if (name === 'chrome') await floatingToggleChecks(name, ctx);

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
    await themeChecks(name, ctx);
    if (name === 'chrome') await rulesChecks(name, ctx);
    if (name === 'chrome') await motionChecks(name, ctx);
    if (name === 'chrome') await treeChecks(name, ctx);
    if (name === 'chrome') await detailChecks(name, ctx), await detailFeatureChecks(name, ctx);
    await demosChecks(name, ctx);
    if (name === 'chrome') await editMarksChecks(name, ctx);
    if (name === 'chrome') await editSavesChecks(name, ctx);
    await editorsChecks(name, ctx);
    if (name !== 'firefox') await editorsKindsChecks(name, ctx);
    if (name === 'chrome') await playgroundEditChecks(name, ctx);
    // Step 8: undo and redo (all engines; Firefox and WebKit the keys and the tree field right to left), the tree's
    // field, editing beside details, the real pages' Undo / Redo, tree and visits.
    await editUndoChecks(name, ctx, H);
    if (name === 'chrome') await editTreeChecks(name, ctx, H), await editDetailChecks(name, ctx, H), await playgroundUndoChecks(name, ctx, H);

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
      // The reader's text size is the browser's default size (`medium`, review R3): in Chrome set through the
      // DevTools protocol (Settings › Font size); a page's own root size does not change the rows.
      const rootOnly = await page.evaluate(async () => {
        document.documentElement.style.fontSize = '10px';
        window.t.grid.api.refresh();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const h = document.querySelector('.dzg-layer > .dzg-row').getBoundingClientRect().height;
        document.documentElement.style.fontSize = '';
        return h;
      });
      check(name, `a page's root font size (10 px) leaves the rows at 32 px (${rootOnly})`, Math.abs(rootOnly - 32) <= 1, rootOnly);
      if (name === 'chrome') await (await ctx.newCDPSession(page)).send('Page.setFontSizes', { fontSizes: { standard: 32 } });
      const z = name !== 'chrome' ? null : await page.evaluate(async () => {
        window.t.grid.api.refresh();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const row = document.querySelector('.dzg-layer > .dzg-row');
        const cells = [...row.querySelectorAll('.dzg-cell')];
        return { height: row.getBoundingClientRect().height, clipped: cells.filter((c) => c.scrollHeight > c.clientHeight + 1).length };
      });
      if (z) check(name, 'at 200 % text (the browser’s default size) the rows double and no cell text is clipped', Math.abs(z.height - 64) <= 1 && z.clipped === 0, z);
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
