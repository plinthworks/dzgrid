// S12 — variable row heights (2 000 open details of 240 px over 1 000 000 rows) under the scaled mapper.
// One browser at a time, headless, closed in finally. BROWSERS=chrome,firefox,webkit (default all).
import { serve, browser, record } from '../kit.mjs';

const site = await serve(import.meta.url);
const engines = (process.env.BROWSERS ?? 'chrome,firefox,webkit').split(',');
const checks = [], observations = [];
let open = null;
process.on('SIGINT', async () => { await open?.close().catch(() => {}); await site.close(); process.exit(130); });

const check = (engine, cfg, label, ok, detail) => {
  checks.push({ engine, cfg, label, ok: !!ok, ...(ok ? {} : { detail }) });
  if (!ok) console.error('FAIL', engine, cfg, label, JSON.stringify(detail).slice(0, 500));
};
const observe = (engine, cfg, label, value) => { observations.push({ engine, cfg, label, value }); };
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const A = (page, fn, arg) => page.evaluate(fn, arg);
const S = (page) => A(page, () => window.api.state());
const LIMIT = 2 ** 22;
const PX = 0.5; // Firefox keeps fractional scrollTop: positions agree within half a pixel
/** Waits until scrollTop has not moved for 6 frames (smooth native scrolls), at most 3 s. */
const settle = (page) => page.evaluate(() => new Promise((r) => {
  const vp = document.querySelector('.vp'); let last = vp.scrollTop, still = 0; const t0 = performance.now();
  const f = () => { if (vp.scrollTop === last) still++; else { still = 0; last = vp.scrollTop; } if (still >= 6 || performance.now() - t0 > 3000) r(); else requestAnimationFrame(f); };
  requestAnimationFrame(f);
}));

async function load(ctx, qs) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1000, height: 800 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(site.url(`index.html?${qs}`));
  await page.waitForFunction(() => window.ready, null, { timeout: 20000 });
  return { page, errors };
}

/** Ends, placement in the middle, wheel and PageDown: run on the variable list and on the uniform witness. */
async function common(name, ctx, cfg, out) {
  const { page, errors } = await load(ctx, cfg);
  const info = await A(page, () => ({ N: window.api.N, D: window.api.D, COUNT: window.api.COUNT, BODY_VIEW: window.api.BODY_VIEW, mapper: window.api.mapper(), total: window.api.layout().total, masters: window.api.masters() }));
  observe(name, cfg, 'mapper', { ...info.mapper, total: info.total, count: info.COUNT });
  const H0 = await A(page, () => document.querySelector('.vp').scrollHeight);
  const sane = (s) => s.orderOk && s.maxWritten < LIMIT && s.scrollTopOk && s.scrollHeight === H0;
  const lastKey = info.D ? `x${info.N - 1}` : `d${info.N - 1}`;

  // Top.
  await A(page, () => window.api.scrollToLogical(0)); await frames(page);
  let e = await A(page, () => window.api.ends());
  let p = await A(page, () => window.api.placement());
  check(name, cfg, 'top: first row at the body top, offset error 0', Math.abs(e.topErr) <= PX && p.err <= PX, { e, p });
  out.topErr = e.topErr;

  // End by the API, by a native scrollTop past the end (scrollbar drag), by Ctrl+End.
  const endChecks = [];
  for (const how of ['api', 'native', 'ctrl+end']) {
    await A(page, () => window.api.scrollToLogical(0)); await frames(page);
    if (how === 'api') await A(page, () => window.api.scrollToEnd());
    if (how === 'native') await A(page, () => window.api.nativeScrollTop(1e9));
    if (how === 'ctrl+end') {
      await A(page, () => window.api.focusCell('d0', 3));
      await page.keyboard.press(process.platform === 'darwin' && name === 'webkit' ? 'Meta+End' : 'Control+End');
    }
    await frames(page, 3);
    e = await A(page, () => window.api.ends());
    p = await A(page, () => window.api.placement());
    const lt = await A(page, () => window.api.logicalTop());
    const s = await S(page);
    endChecks.push({ how, ...e, err: p.err, lt, maxLogical: info.mapper.maxLogical, active: s.active });
    check(name, cfg, `end (${how}): row 999 999 shown, last row's bottom on the viewport's, offset error 0`,
      e.lastDataShown && e.lastKey === lastKey && Math.abs(e.bottomErr) <= PX && p.err <= PX && Math.abs(lt - info.mapper.maxLogical) < 1e-6 && sane(s) &&
      (how !== 'ctrl+end' || s.active === `div ${lastKey}/${info.D ? 0 : 3}`), { e, p, lt, s: { ...s, events: undefined } });
  }
  out.end = endChecks.map(({ how, bottomErr, err }) => ({ how, bottomErr, err }));
  if (info.D) {
    await page.keyboard.press('ArrowUp'); await frames(page);
    const s = await S(page);
    check(name, cfg, 'Ctrl+End then ArrowUp: data row 999 999 focused (goal column 3 kept), visible', s.active === `div d${info.N - 1}/3` && s.visible, s);
  }

  // Placement at 300 logical offsets (seeded), details, REBASE edges and fractions included.
  let seed = 12;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  let worst = { err: 0 };
  const tops = [];
  for (let n = 0; n < 300; n++) {
    let l;
    if (n < 40 && info.D) l = await A(page, ([m, f]) => window.api.offsetOf(window.api.indexOf(`x${m}`)) + f, [info.masters[(n * 53) % info.D], (n % 7) * 37.5]);
    else if (n < 60) l = (Math.floor(n / 2) + 1) * 1048576 + (n % 2 ? -0.5 : 0.25);
    else l = rnd() * info.mapper.maxLogical;
    tops.push(l);
  }
  for (const l of tops) {
    await A(page, (l) => window.api.scrollToLogical(l), l);
    const pl = await A(page, () => window.api.placement());
    if (pl.err > worst.err) worst = { ...pl, l };
  }
  check(name, cfg, 'placement: 300 offsets, every mounted row where the layout says, ≤ 0.5 px', worst.err <= PX, worst);
  out.placementMaxErr = worst.err;

  // Wheel (intercepted in scaled mode, S11 D5): 20 × 100 px moves the content exactly 2 000 logical px.
  await A(page, (l) => window.api.scrollToLogical(l), info.mapper.maxLogical * 0.4321);
  await frames(page);
  const box = await page.locator('.vp').boundingBox();
  await page.mouse.move(box.x + 300, box.y + 300);
  await A(page, () => window.api.reset());
  const before = await A(page, () => window.api.logicalTop());
  for (let n = 0; n < 20; n++) { await page.mouse.wheel(0, 100); await frames(page, 1); }
  await frames(page, 2);
  const after = await A(page, () => window.api.logicalTop());
  let s = await S(page);
  const sum = s.wheels.reduce((a, w) => a + (w.mode === 1 ? w.dy * 32 : w.dy), 0);
  p = await A(page, () => window.api.placement());
  check(name, cfg, 'wheel 20 × 100: logical move = Σ deltas, rows placed exactly, no native scroll', s.wheels.length === 20 && Math.abs(after - before - sum) < 1e-6 && p.err <= PX && s.native === 0, { before, after, sum, wheels: s.wheels.slice(0, 3), native: s.native, p });
  out.wheel = { moved: after - before, sum, mode: s.wheels[0]?.mode, renderMedianMs: s.renderMedian };

  // PageDown × 12 then PageUp × 12 from data row 400 000, reached from the top (it sits at the bottom of the view).
  await A(page, () => window.api.scrollToLogical(0)); await frames(page);
  await A(page, () => window.api.focusCell('d400000', 3)); await frames(page);
  await A(page, () => window.api.reset());
  for (let n = 0; n < 12; n++) { await page.keyboard.press('PageDown'); await frames(page, 1); }
  s = await S(page);
  const downOk = s.pageMoves.length === 12 && s.visible && s.native === 0 && s.blurs <= 24 && sane(s) && s.active === `div ${s.focus.key}/${s.focus.key[0] === 'x' ? 0 : 3}`;
  const drifts = s.pageMoves.map((m) => m.drift);
  // Each target is the row under the point one body height below the old focus row's top (the layout is oracle-checked).
  const expectTo = await A(page, ([moves, bv]) => moves.map((m) => window.api.keyAt(window.api.indexAt(window.api.offsetOf(window.api.indexOf(m.from)) + bv))), [s.pageMoves, info.BODY_VIEW]);
  check(name, cfg, 'PageDown: each target is the row one body height below', expectTo.every((k, n) => k === s.pageMoves[n].to), { expectTo, moves: s.pageMoves });
  const reachedDetail = s.pageMoves.some((m) => m.to[0] === 'x');
  for (let n = 0; n < 12; n++) { await page.keyboard.press('PageUp'); await frames(page, 1); }
  const s2 = await S(page);
  check(name, cfg, 'PageDown × 12, PageUp × 12: focus moves a page each time, stays visible, grid scroll only', downOk && s2.visible && s2.native === 0 && sane(s2), { s: { ...s, events: undefined }, back: s2.focus });
  out.page = { drifts: [...new Set(drifts)], reachedDetail, moves: s.pageMoves.map((m) => `${m.to} ${m.drift}`), backTo: s2.focus.key };
  check(name, cfg, 'no page error', errors.length === 0, errors);
  await page.close();
  return info;
}

/** Retained focus and a detail resize above the viewport: the variable list only. */
async function variableOnly(name, ctx, cfg, out) {
  const { page, errors } = await load(ctx, cfg);
  const info = await A(page, () => ({ N: window.api.N, D: window.api.D, masters: window.api.masters(), BODY_VIEW: window.api.BODY_VIEW }));
  const H0 = await A(page, () => document.querySelector('.vp').scrollHeight);
  const sane = (s) => s.orderOk && s.maxWritten < LIMIT && s.scrollTopOk && s.scrollHeight === H0;

  // Oracle.
  const o = await A(page, () => window.api.oracle(12));
  check(name, cfg, `layout = brute-force oracle (${o.checked} probes over 51 height sets)`, o.bad === 0, o);
  out.oracle = o;
  out.timing = [];
  for (const d of [2000, 20000, 200000]) out.timing.push(await A(page, (d) => window.api.timing(d), d));

  // Retained data row.
  await A(page, () => window.api.focusCell('d500000', 3)); await frames(page);
  await A(page, () => window.api.reset());
  const seq = [];
  for (const step of ['top', 'end', 'mid', 'back']) {
    await A(page, (step) => (step === 'top' ? window.api.scrollToLogical(0) : step === 'end' ? window.api.scrollToEnd() : step === 'mid' ? window.api.scrollToIndex(250000) : window.api.scrollToIndex(window.api.indexOf('d499990'))), step);
    await frames(page);
    seq.push(await S(page));
  }
  check(name, cfg, 'retained data row: same cell focused through top, end, middle and back, no blur, sane DOM, range unchanged',
    seq.every((s) => s.active === 'div d500000/3' && s.blurs === 0 && sane(s)), seq.map(({ events, pageMoves, wheels, ...s }) => s));
  await A(page, (l) => window.api.scrollToLogical(l), 0);
  await page.keyboard.press('ArrowDown'); await frames(page, 2);
  let s = await S(page);
  check(name, cfg, 'retained, off screen: ArrowDown focuses the next row, visible', s.active === 'div d500001/3' && s.visible && sane(s), s);

  // Retained detail row: Down from its master, scroll away and back, Up keeps the goal column.
  const m = info.masters[1000];
  await A(page, (m) => window.api.focusCell(`d${m}`, 5), m); await frames(page);
  await page.keyboard.press('ArrowDown'); await frames(page);
  s = await S(page);
  const inDetail = s.active === `div x${m}/0`;
  await A(page, () => window.api.reset());
  await A(page, () => window.api.scrollToLogical(0)); await frames(page);
  const s1 = await S(page);
  await A(page, () => window.api.scrollToEnd()); await frames(page);
  const s2 = await S(page);
  await page.keyboard.press('ArrowUp'); await frames(page, 2);
  const s3 = await S(page);
  check(name, cfg, 'retained detail row: Down reaches it, kept through top and end, Up returns to the master on column 5, visible',
    inDetail && [s1, s2].every((x) => x.active === `div x${m}/0` && x.blurs === 0 && sane(x)) && s3.active === `div d${m}/5` && s3.visible, { s, s1, s2, s3 });

  // Detail resize above the viewport: top row and focus kept.
  const resize = [];
  const target = 'd600000';
  await A(page, () => window.api.scrollToIndex(window.api.indexOf('d600000')));
  await A(page, () => window.api.scrollToLogical(window.api.logicalTop() + 13.25));
  await A(page, () => window.api.focusCell('d600003', 2)); await frames(page);
  const below = info.masters.filter((k) => k < 600000);
  const cases = [
    ['far above, 240 → 480', below[3], 480],
    ['nearest above, 240 → 120', below[below.length - 1], 120],
    ['far above, 480 → 777', below[3], 777],
    ['row 0\'s detail, 240 → 40', 0, 40],
  ];
  for (const [label, master, h] of cases) {
    await A(page, () => window.api.reset());
    const top0 = await A(page, () => window.api.topRow());
    const y0 = await A(page, (k) => window.api.rowTop(k), top0);
    const f0 = await A(page, () => window.api.rowTop('d600003'));
    const ok = await A(page, ([k, h]) => window.api.resizeDetail(k, h), [master, h]);
    await frames(page, 2);
    const top1 = await A(page, () => window.api.topRow());
    const y1 = await A(page, (k) => window.api.rowTop(k), top0);
    const f1 = await A(page, () => window.api.rowTop('d600003'));
    s = await S(page);
    const p = await A(page, () => window.api.placement());
    resize.push({ label, top0, top1, dy: y1 - y0, focusDy: f1 - f0, err: p.err });
    check(name, cfg, `resize above (${label}): same top row at the same place, focus kept and still, rows exact`,
      ok && top1 === top0 && Math.abs(y1 - y0) <= PX && Math.abs(f1 - f0) <= PX && s.active === 'div d600003/2' && s.blurs === 0 && p.err <= PX && sane(s), { label, top0, top1, y0, y1, f0, f1, p, s: { ...s, events: undefined } });
  }
  // Witness: without the anchor, the same change moves the top row (proves the check sees it).
  {
    const w = await load(ctx, `${cfg}&anchor=0`);
    await A(w.page, () => window.api.scrollToIndex(window.api.indexOf('d600000')));
    await A(w.page, () => window.api.scrollToLogical(window.api.logicalTop() + 13.25));
    await frames(w.page);
    const top0 = await A(w.page, () => window.api.topRow());
    const y0 = await A(w.page, (k) => window.api.rowTop(k), top0);
    await A(w.page, ([k, h]) => window.api.resizeDetail(k, h), [below[3], 480]);
    await frames(w.page, 2);
    const y1 = await A(w.page, (k) => window.api.rowTop(k), top0);
    const top1 = await A(w.page, () => window.api.topRow());
    check(name, `${cfg}&anchor=0`, 'witness: without the anchor the top row moves (proves the check sees it)', top1 !== top0 || y1 === null || Math.abs(y1 - y0) > PX, { top0, top1, y0, y1 });
    resize.push({ label: 'witness, no anchor', top0, top1, dy: y1 === null ? null : y1 - y0 });
    await w.page.close();
  }
  // At the end: stays at the end.
  await A(page, () => window.api.scrollToEnd()); await frames(page);
  await A(page, (k) => window.api.resizeDetail(k, 400), info.masters[10]);
  await frames(page, 2);
  const e = await A(page, () => window.api.ends());
  check(name, cfg, 'resize above while at the end: still at the end, row 999 999 shown, bottom exact', e.lastDataShown && Math.abs(e.bottomErr) <= PX, e);
  resize.push({ label: 'at the end', bottomErr: e.bottomErr });
  out.resize = resize;
  check(name, cfg, 'no page error', errors.length === 0, errors);
  await page.close();
}

/** Native (not intercepted) wheel and PageDown on the viewport: the drift the mapper's ratio gives. */
async function native(name, ctx, cfg) {
  const { page, errors } = await load(ctx, cfg);
  const mapper = await A(page, () => window.api.mapper());
  await A(page, (l) => window.api.scrollToLogical(l), mapper.maxLogical * 0.5);
  await frames(page);
  const box = await page.locator('.vp').boundingBox();
  await page.mouse.move(box.x + 300, box.y + 300);
  let p0 = await A(page, () => document.querySelector('.vp').scrollTop), l0 = await A(page, () => window.api.logicalTop());
  for (let n = 0; n < 5; n++) { await page.mouse.wheel(0, 100); await frames(page, 1); }
  await settle(page);
  let p1 = await A(page, () => document.querySelector('.vp').scrollTop), l1 = await A(page, () => window.api.logicalTop());
  const wheel = { physical: p1 - p0, logical: l1 - l0, perPhysical: (l1 - l0) / (p1 - p0 || 1) };
  await A(page, () => document.querySelector('.vp').focus());
  p0 = await A(page, () => document.querySelector('.vp').scrollTop); l0 = await A(page, () => window.api.logicalTop());
  await page.keyboard.press('PageDown');
  await settle(page);
  p1 = await A(page, () => document.querySelector('.vp').scrollTop); l1 = await A(page, () => window.api.logicalTop());
  const pageDown = { physical: p1 - p0, logical: l1 - l0, pages: (l1 - l0) / (await A(page, () => window.api.BODY_VIEW)) };
  const pl = await A(page, () => window.api.placement());
  observe(name, cfg, 'native (not intercepted) wheel 5 × 100 and PageDown on the viewport', { ratio: mapper.ratio, wheel, pageDown, placementErr: pl.err });
  check(name, cfg, 'native scroll: rows still placed exactly after it', pl.err <= PX, pl);
  check(name, cfg, 'no page error', errors.length === 0, errors);
  await page.close();
  return { ratio: mapper.ratio, wheel, pageDown };
}

const summary = {};
try {
  for (const name of engines) {
    open = await browser(name);
    try {
      const ctx = await open.newContext();
      const variable = {}, uniform = {};
      await common(name, ctx, 'details=2000', variable);
      await variableOnly(name, ctx, 'details=2000', variable);
      await common(name, ctx, 'details=0', uniform);
      const nv = await native(name, ctx, 'details=2000&intercept=0');
      const nu = await native(name, ctx, 'details=0&intercept=0');
      summary[name] = {
        variable, uniform,
        nativeDrift: { variable: nv, uniform: nu, ratioVsUniform: nv.ratio / nu.ratio, wheelVsUniform: nv.wheel.logical / (nu.wheel.logical || 1), pageVsUniform: nv.pageDown.logical / (nu.pageDown.logical || 1) },
      };
      await ctx.close();
    } finally {
      await open.close().catch(() => {});
      open = null;
    }
  }
} finally {
  await site.close();
}

const failed = checks.filter((c) => !c.ok);
record(import.meta.url, { passed: checks.length - failed.length, failed: failed.length, summary, observations, checks });
console.log(`\nS12: ${checks.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
