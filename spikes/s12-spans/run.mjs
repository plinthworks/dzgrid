// S12 — cell spans: stacking against pinned segments, the O1 label, ellipsis, height caps, Chrome's AX tree.
// One browser at a time, closed in finally. BROWSERS=chrome,firefox,webkit (default all; Chrome first).
// `node spikes/s12-spans/run.mjs` or `npm run spike -- s12`.
import { serve, browser, record, median, percentile } from '../kit.mjs';
import { decodePng } from '../s1-virtual-1m/png.mjs';
import { chromeDump } from '../s4-a11y/ax.mjs';

const site = await serve(import.meta.url);
const engines = (process.env.BROWSERS ?? 'chrome,firefox,webkit').split(',');
const checks = [], observations = [];
let open = null;
process.on('SIGINT', async () => { await open?.close().catch(() => {}); await site.close(); process.exit(130); });

const check = (engine, cfg, label, ok, detail) => {
  checks.push({ engine, cfg, label, ok: !!ok, ...(ok ? {} : { detail }) });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${engine} [${cfg}] ${label}${ok ? '' : `  ${JSON.stringify(detail).slice(0, 300)}`}`);
};
const observe = (engine, cfg, label, value) => {
  observations.push({ engine, cfg, label, value });
  console.log(`obs  ${engine} [${cfg}] ${label}: ${JSON.stringify(value).slice(0, 400)}`);
};
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

async function load(ctx, qs, file = 'index.html') {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1000, height: 800 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(site.url(`${file}?${qs}`));
  await page.waitForFunction(() => window.ready, null, { timeout: 15000 });
  return { page, errors };
}

// ---------------------------------------------------------------- Q1 stacking
const COLOURS = { white: [255, 255, 255], tint: [0xcf, 0xe0, 0xff], pin: [0xf0, 0xf0, 0xf0], center: [0xe2, 0xf5, 0xe9], tall: [0xff, 0xe0, 0x8a], head: [0xe8, 0xea, 0xf0] };
const near = (a, b) => Math.abs(a[0] - b[0]) <= 3 && Math.abs(a[1] - b[1]) <= 3 && Math.abs(a[2] - b[2]) <= 3;
const colourName = (p) => Object.entries(COLOURS).find(([, c]) => near(p, c))?.[0] ?? `rgb(${p.join(',')})`;

/** What is under a slot's point: the span id, the cell's column and row, or the header. */
const hit = (page, seg, col, row, dx = 3, dy = 3) => page.evaluate(([seg, col, row, dx, dy]) => {
  const { x, y } = window.api.point(seg, col, row, dx, dy);
  const el = document.elementFromPoint(x, y);
  if (!el) return { none: true };
  if (el.closest('.head')) return { head: el.closest('[data-col]')?.dataset.col ?? el.className };
  const row_ = el.closest('.row');
  return { span: el.closest('[data-span]')?.dataset.span ?? null, col: el.closest('[data-col]')?.dataset.col ?? null, row: row_ ? Number(row_.dataset.i) : null, cls: el.className };
}, [seg, col, row, dx, dy]);

async function pixels(page) {
  const box = await page.evaluate(() => { const r = document.querySelector('.vp').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
  const img = decodePng(await page.screenshot({ clip: box }));
  return { at: async (seg, col, row, dx = 3, dy = 3) => { const p = await page.evaluate((a) => window.api.point(...a), [seg, col, row, dx, dy]); return colourName(img.pixel(Math.round(p.x - box.x), Math.round(p.y - box.y))); }, img, box };
}

async function stacking(name, ctx) {
  const configs = [
    'mode=base',
    'mode=plan&covered=content&fill=none&pe=all&z=flat',
    'mode=plan&covered=style&fill=none&pe=all&z=flat',
    'mode=plan&covered=style&fill=none&pe=cells&z=flat',
    'mode=plan&covered=style&fill=pinned&pe=cells&z=flat',
    'mode=plan&covered=style&fill=pinned&pe=cells&z=rank',
    'mode=plan&covered=style&fill=pinned&pe=cells&z=rank&originfill=0', // control: no filler under the origin's own slot
  ];
  for (const dir of ['ltr', 'rtl']) for (const c of configs) {
    const cfg = `${c}&dir=${dir}`;
    // Spans: A start col 0 rows 4-13; B centre cols 1-2 rows 6-15; C start col 1 rows 10-12;
    // D end col 0 rows 5-14. View from row 9: A's origin (row 4) is above the window + overscan.
    const { page, errors } = await load(ctx, `rows=200&at=4&len=10&${cfg}`);
    await page.evaluate(() => window.api.scrollRow(9));
    await frames(page);
    const anchor = await page.evaluate(() => !!document.querySelector('.row[data-i="4"] [data-span=A]'));
    const H = {
      A_covered: await hit(page, 'start', 0, 11),
      A_under_host_C: await hit(page, 'start', 0, 10),
      A_first_visible: await hit(page, 'start', 0, 9),
      C: await hit(page, 'start', 1, 11),
      B_covered: await hit(page, 'center', 1, 12),
      B_colspan_part: await hit(page, 'center', 2, 12),
      D_covered: await hit(page, 'end', 0, 12),
      plain_in_covered_row: await hit(page, 'center', 0, 12),
      header_over_A: await page.evaluate(() => { const v = window.api.view(), p = window.api.point('start', 0, 0); const el = document.elementFromPoint(p.x, v.top - 16); return !!el?.closest('.head'); }),
      header_over_B: await page.evaluate(() => { const v = window.api.view(), p = window.api.point('center', 1, 0); const el = document.elementFromPoint(p.x, v.top - 16); return !!el?.closest('.head'); }),
    };
    const px0 = await pixels(page);
    const P = {
      A_row13_selected: await px0.at('start', 0, 13), A_row12: await px0.at('start', 0, 12),
      B_row13_selected: await px0.at('center', 1, 13), B_row12: await px0.at('center', 1, 12),
      D_row13_selected: await px0.at('end', 0, 13),
    };
    // Centre scrolled 300 px: B (centre cols 1-2) slides under the pinned start segment.
    await page.evaluate(() => window.api.scrollInline(300));
    await frames(page);
    H.pinned_cell_over_B = await hit(page, 'start', 1, 14);
    H.A_after_hscroll = await hit(page, 'start', 0, 12);
    const px1 = await pixels(page);
    // No centre colour may show inside the pinned start segment (rows 9-16).
    let leak = 0;
    const seg = await page.evaluate(() => { const a = window.api.point('start', 0, 9, 1, 1), b = window.api.point('start', 1, 16, 98, 30); return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: a.y, y1: b.y }; });
    for (let y = Math.round(seg.y0 - px1.box.y); y < Math.round(seg.y1 - px1.box.y); y += 2)
      for (let x = Math.round(seg.x0 - px1.box.x); x < Math.round(seg.x1 - px1.box.x); x += 2) {
        const p = px1.img.pixel(x, y);
        // A centre cell's background, or a centre label's ink (dark green), seen inside the pinned segment.
        if (near(p, COLOURS.center) || (p[1] > 70 && p[0] < 60 && p[2] < 90)) leak++;
      }
    P.pinned_B_area_row14 = await px1.at('start', 1, 14);
    P.A_row13_after_hscroll = await px1.at('start', 0, 13);
    if (dir === 'ltr' && c.includes('z=rank')) await page.screenshot({ path: new URL('./results/stacking-plan-fill.png', import.meta.url).pathname, clip: px1.box });
    if (dir === 'ltr' && c === 'mode=base') await page.screenshot({ path: new URL('./results/stacking-base.png', import.meta.url).pathname, clip: px1.box });

    // A's label clamped to the top of the view, i.e. inside row 10, which hosts C: is it painted?
    await page.evaluate(() => { window.api.scrollInline(0); window.api.scrollRow(10); });
    await frames(page);
    const labBox = await page.evaluate(() => { const r = document.querySelector('[data-span=A] .lab').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    const px2 = await pixels(page);
    let ink = 0;
    for (let y = Math.round(labBox.y - px2.box.y) + 2; y < Math.round(labBox.y + labBox.h - px2.box.y) - 2; y++)
      for (let x = Math.round(labBox.x - px2.box.x) + 2; x < Math.round(labBox.x + labBox.w - px2.box.x) - 2; x++) { const [r, g, b] = px2.img.pixel(x, y); if (r > 90 && g < 90 && b < 70) ink++; }
    const isA = (h) => h.span === 'A';
    const verdict = {
      anchorMounted: anchor,
      A: isA(H.A_covered) && isA(H.A_first_visible) && isA(H.A_after_hscroll),
      A_under_second_host: isA(H.A_under_host_C),
      C: H.C.span === 'C', B: H.B_covered.span === 'B' && H.B_colspan_part.span === 'B', D: H.D_covered.span === 'D',
      plain: H.plain_in_covered_row.col === 'center0' && H.plain_in_covered_row.row === 12,
      header: H.header_over_A && H.header_over_B,
      pinnedOverCentreSpan: H.pinned_cell_over_B.col === 'start1' && H.pinned_cell_over_B.row === 14 && P.pinned_B_area_row14 === 'pin',
      noLeak: leak === 0,
      tintCentre: P.B_row13_selected === 'tint' && P.B_row12 === 'white',
      tintPinned: P.A_row13_selected === 'tint' && P.D_row13_selected === 'tint',
      labelOverLaterHost: ink > 20,
    };
    observe(name, cfg, 'stacking', { verdict, hits: H, pixels: P, leak, labelInk: ink });
    const all = Object.values(verdict).every(Boolean);
    if (c.includes('originfill=0')) check(name, cfg, 'control: without a filler in the origin row, the centre shows through the transparent pinned tall cell (the leak scan sees it)', !verdict.noLeak, { leak });
    else if (c.includes('fill=pinned') && c.includes('z=rank')) check(name, cfg, 'plan + fillers: every hit and pixel as intended (tall cells hit over covered slots, pinned above centre spans, header above, tints kept, no leak)', all, verdict);
    if (c === 'mode=plan&covered=style&fill=none&pe=cells&z=flat') check(name, cfg, 'plan without fillers: hits right, no leak (tint lost on pinned covered slots is expected)', Object.entries(verdict).every(([k, v]) => v || k === 'tintPinned'), verdict);
    check(name, cfg, 'no page error', errors.length === 0, errors);
    await page.close();
  }
}

// ---------------------------------------------------------------- Q2 the O1 label
/**
 * In the page: for each logical offset, scroll there (synchronously), then compare each tall
 * label's rect with the O1 rule computed from an in-view plain row's rect (not from the page's
 * own variables): centred in the whole span, clamped into the visible part.
 */
const sweepInPage = ([ids, offsets, paced, step, count]) => new Promise((resolve) => {
  const api = window.api, ROW = api.ROW, LAB = 32;
  const out = { n: 0, skipped: 0, worst: 0, centred: 0, clamped: 0, outside: 0, cellBad: 0, inlineBad: 0, fails: [] };
  const measure = () => {
    const s = api.state(), v = api.view();
    const ref = Math.floor(s.L / ROW) + 2;
    const refEl = document.querySelector(`.row[data-i="${ref}"]`);
    const rowTop = (r) => refEl.getBoundingClientRect().top + (r - ref) * ROW;
    for (const id of ids) {
      const sp = api.spans.find((x) => x.id === id);
      const cell = document.querySelector(`[data-span="${id}"]`);
      const s0 = rowTop(sp.row), s1 = s0 + sp.rows * ROW;
      const lo = Math.max(s0, v.top), hi = Math.min(s1, v.bottom);
      if (hi - lo < LAB) { out.skipped++; continue; }
      if (!cell) { out.fails.push({ id, L: s.L, missing: true }); out.n++; continue; }
      const lab = cell.querySelector('.lab').getBoundingClientRect(), c = cell.getBoundingClientRect();
      const centre = (s0 + s1) / 2 - LAB / 2;
      const exp = Math.min(Math.max(centre, lo), hi - LAB);
      const err = Math.abs(lab.top - exp);
      out.n++;
      if (exp === centre) out.centred++; else out.clamped++;
      out.worst = Math.max(out.worst, err);
      if (err > 0.6) out.fails.push({ id, L: s.L, err: +err.toFixed(2), lab: lab.top, exp, lo, hi });
      if (lab.top < v.top - 0.6 || lab.bottom > v.bottom + 0.6) out.outside++;
      // The cell covers the visible part, and is never taller than the window + overscan.
      if (c.top > lo + 0.6 || c.bottom < hi - 0.6 || c.height > s.bodyView + 9 * ROW) { out.cellBad++; if (out.fails.length < 12) out.fails.push({ id, cell: [c.top, c.bottom, c.height], lo, hi }); }
      // The cell's inline-end border (1 px) is outside the label.
      if (Math.abs(lab.left - c.left) > 1.1 || Math.abs(lab.right - c.right) > 1.1) out.inlineBad++;
    }
  };
  if (!paced) {
    for (const l of offsets) { api.scrollLogical(l); measure(); }
    out.fails = out.fails.slice(0, 12);
    return resolve(out);
  }
  // Paced: one physical step per frame, measured in the next frame after the scroll event painted.
  const vp = document.querySelector('.vp');
  api.scrollLogical(offsets[0]);
  api.resetStats();
  let k = 0;
  const tick = () => {
    if (k > 0) measure();
    if (k++ >= count) { out.fails = out.fails.slice(0, 12); return resolve(out); }
    vp.scrollTop += step;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(() => requestAnimationFrame(tick));
});

function offsetsAround(span, bodyView, K = 90) {
  const ROW = 32, s0 = span.row * ROW, s1 = (span.row + span.rows) * ROW;
  const from = s0 - bodyView, to = s1;
  const out = [];
  for (let k = 0; k <= K; k++) out.push(from + ((to - from) * k) / K + (k % 3) * 0.37);
  // The exact edges: centre at the view's top and bottom, span edges at the view's edges.
  out.push((s0 + s1) / 2 - 16, (s0 + s1) / 2 + 16 - bodyView, s0, s1 - bodyView);
  return out.filter((l) => l >= 0);
}

async function labels(name, ctx) {
  const sets = [
    ['short', 'rows=200&at=40&len=10', ['A', 'B', 'D']],
    ['long', 'rows=20000&at=1000&len=5000', ['A', 'B', 'D']],
    ['scaled', 'rows=1000000&at=500000&len=5000&huge=200000&hugeAt=400000', ['A', 'B', 'D', 'H']],
  ];
  const cost = {};
  for (const [label, qs, ids] of sets) for (const mode of ['js', 'sticky']) for (const dir of ['ltr', 'rtl']) {
    const cfg = `${label}&label=${mode}&dir=${dir}`;
    const { page, errors } = await load(ctx, `${qs}&label=${mode}&dir=${dir}&fill=pinned`);
    const info = await page.evaluate(() => ({ spans: window.api.spans, bodyView: window.api.state().bodyView, scaled: window.api.scaled, ratio: window.api.ratio }));
    const results = {};
    for (const id of ids) {
      const span = info.spans.find((s) => s.id === id);
      results[id] = await page.evaluate(sweepInPage, [[id], offsetsAround(span, info.bodyView), false]);
    }
    const sum = Object.values(results).reduce((a, r) => ({ n: a.n + r.n, worst: Math.max(a.worst, r.worst), fails: a.fails + r.fails.length, outside: a.outside + r.outside, cellBad: a.cellBad + r.cellBad, inlineBad: a.inlineBad + r.inlineBad, centred: a.centred + r.centred, clamped: a.clamped + r.clamped }), { n: 0, worst: 0, fails: 0, outside: 0, cellBad: 0, inlineBad: 0, centred: 0, clamped: 0 });
    // Frame-paced: from the span's top edge entering the view, 150 frames of a physical step.
    const A = info.spans.find((s) => s.id === 'A');
    const step = info.scaled ? 3 : 23;
    const paced = await page.evaluate(sweepInPage, [['A', 'B', 'D'], [A.row * 32 - info.bodyView / 2], true, step, 150]);
    const st = await page.evaluate(() => { const s = window.api.stats(); return { paint: s.paintMs.slice(), label: s.labelMs.slice(), labelWrites: s.labelWrites, geomWrites: s.geomWrites, paints: s.paintMs.length }; });
    const labelCall = await page.evaluate(() => window.api.labelCost(20000));
    const maxWritten = await page.evaluate(() => window.api.state().maxWritten);
    const wanted = label === 'short' ? sum.centred > 0 : sum.clamped > 0 && sum.centred > 0;
    observe(name, cfg, 'label sweep', { ...sum, paced: { n: paced.n, worst: paced.worst, fails: paced.fails.length, skipped: paced.skipped, centred: paced.centred, clamped: paced.clamped }, scaled: info.scaled, ratio: info.ratio, maxWritten });
    check(name, cfg, `O1 label: centred in the span, clamped into the visible part, within 0.6 px at ${sum.n} positions (${sum.centred} centred, ${sum.clamped} clamped); never outside the view; cell covers the visible part, ≤ window + overscan; label spans the cell inline`,
      sum.fails === 0 && sum.outside === 0 && sum.cellBad === 0 && sum.inlineBad === 0 && wanted && sum.n > 50, { sum, sample: Object.values(results).flatMap((r) => r.fails).slice(0, 4) });
    check(name, cfg, `O1 label right at every frame of a paced scroll (${paced.n} measures, step ${step} physical px)`, paced.fails.length === 0 && paced.n > (label === 'short' ? 50 : 100), paced);
    check(name, cfg, 'every length written ≤ 2^22 px; no page error', maxWritten < 2 ** 22 && errors.length === 0, { maxWritten, errors });
    if (dir === 'ltr') cost[`${label}/${mode}`] = { paintMedianMs: +median(st.paint).toFixed(3), paintP95Ms: +percentile(st.paint, 95).toFixed(3), labelPassUs: +(labelCall * 1000).toFixed(2), labelWritesPerPaint: +(st.labelWrites / Math.max(1, st.paints)).toFixed(2), geomWritesPerPaint: +(st.geomWrites / Math.max(1, st.paints)).toFixed(2) };
    if (label === 'long' && dir === 'ltr' && mode === 'sticky') {
      await page.evaluate((A) => window.api.scrollLogical(A.row * 32 + 1234 * 32), A);
      await page.screenshot({ path: new URL('./results/label-long-sticky.png', import.meta.url).pathname, clip: { x: 0, y: 0, width: 840, height: 640 } });
    }
    await page.close();
  }
  observe(name, 'all', 'cost per frame (ltr, paced scroll; label pass = the JS label loop alone, all mounted tall cells)', cost);

  // Negative control: a span cell with overflow: hidden is a scroll container, so its sticky label sticks to it, not the viewport.
  {
    const cfg = 'long&label=sticky&cellov=hidden';
    const { page } = await load(ctx, `rows=20000&at=1000&len=5000&label=sticky&cellov=hidden`);
    const info = await page.evaluate(() => ({ spans: window.api.spans, bodyView: window.api.state().bodyView }));
    const r = await page.evaluate(sweepInPage, [['A'], offsetsAround(info.spans[0], info.bodyView, 40), false]);
    observe(name, cfg, 'sticky label in an overflow: hidden cell', { n: r.n, worst: r.worst, fails: r.fails.length });
    check(name, cfg, 'control: with overflow: hidden on the cell the sticky label does NOT follow (so overflow: clip is what makes it work)', r.fails.length > 0, r);
    await page.close();
  }
}

// ---------------------------------------------------------------- Q3 ellipsis
async function ellipsis(name, ctx) {
  for (const dir of ['ltr', 'rtl']) for (const mode of ['sticky', 'js']) {
    const shots = {};
    let overflow = null;
    for (const labov of ['hidden', 'clip', 'visible']) for (const labte of ['ellipsis', 'clip']) {
      const { page } = await load(ctx, `rows=200&at=4&len=10&label=${mode}&dir=${dir}&labov=${labov}&labte=${labte}&fill=pinned`);
      await page.evaluate(() => window.api.scrollRow(0));
      await frames(page);
      const box = await page.evaluate(() => { const r = document.querySelector('[data-span=A] .lab').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
      overflow ??= await page.evaluate(() => { const l = document.querySelector('[data-span=A] .lab'); return { scrollWidth: l.scrollWidth, clientWidth: l.clientWidth }; });
      shots[`${labov}/${labte}`] = (await page.screenshot({ clip: box })).toString('base64');
      await page.close();
    }
    const drawn = (ov) => shots[`${ov}/ellipsis`] !== shots[`${ov}/clip`];
    const r = { overflowing: overflow.scrollWidth > overflow.clientWidth, hidden: drawn('hidden'), clip: drawn('clip'), visibleInClippedCell: drawn('visible') };
    observe(name, `${mode}&dir=${dir}`, 'ellipsis drawn (screenshot with text-overflow: ellipsis differs from clip)', r);
    check(name, `${mode}&dir=${dir}`, 'ellipsis drawn on the label with overflow: hidden and with overflow: clip, inside a cell with overflow: clip', r.overflowing && r.hidden && r.clip, r);
  }
}

// ---------------------------------------------------------------- Q4 element caps
async function caps(name, ctx) {
  const { page } = await load(ctx, 'rows=1');
  const r = await page.evaluate(() => {
    const out = [];
    for (const h of [1e6, 4e6, 8e6, 16e6, 17.5e6, 18e6, 32e6, 33.5e6, 34e6, 1e8]) {
      const d = document.createElement('div');
      d.style.cssText = `position:absolute;inset-inline-start:0;inset-block-start:0;inline-size:10px;block-size:${h}px`;
      const t = document.createElement('div');
      t.style.cssText = `position:absolute;inline-size:10px;block-size:10px;inset-block-start:${h}px`;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;block-size:0;overflow:clip';
      wrap.append(d, t);
      document.body.append(wrap);
      const w = wrap.getBoundingClientRect().top;
      out.push({ asked: h, height: d.getBoundingClientRect().height, offsetHeight: d.offsetHeight, top: t.getBoundingClientRect().top - w });
      wrap.remove();
    }
    return out;
  });
  const maxH = Math.max(...r.map((x) => x.height));
  observe(name, 'caps', 'element block-size and inset-block-start asked vs laid out', r);
  check(name, 'caps', `the engine caps an element's height (largest laid out: ${maxH} px of the 100 M asked): a span is clipped to window + overscan`, maxH < 1e8, r);
  await page.close();
}

// ---------------------------------------------------------------- Q5 Chrome's AX tree
const LEAF = ['Ward', 'Name', 'Pulse', 'Temp', 'BP', 'Note'];
const GROUP = { 1: 'Patient', 2: 'Patient', 3: 'Measures', 4: 'Measures', 5: 'Measures' };
const range = (s) => { const m = /loc:\s*(\d+),\s*len:\s*(\d+)/.exec(s ?? ''); return m ? { loc: Number(m[1]), len: Number(m[2]) } : null; };

function macCells({ nodes, ref }) {
  const seen = new Set();
  return nodes.filter((n) => n.role === 'AXCell' && !seen.has(n.attrs.ChromeAXNodeId) && seen.add(n.attrs.ChromeAXNodeId)).map((c) => ({
    text: c.text, row: Number(c.attrs.AXARIARowIndex), col: Number(c.attrs.AXARIAColumnIndex),
    colRange: range(c.attrs.AXColumnIndexRange), rowRange: range(c.attrs.AXRowIndexRange),
    headers: ref(c.attrs.AXColumnHeaderUIElements).map((h) => h.text),
  }));
}
function blinkCells({ nodes }) {
  return nodes.filter((n) => ['gridCell', 'columnHeader', 'rowHeader'].includes(n.role)).map((n) => {
    const a = n.attrs, num = (k) => (a[k] == null ? null : Number(a[k]));
    return { role: n.role, text: a.name ?? n.text, ignored: n.flags.has('ignored'), offscreen: n.flags.has('offscreen'),
      aria: { row: num('ariaCellRowIndex'), col: num('ariaCellColumnIndex'), rowspan: num('ariaCellRowSpan'), colspan: num('ariaCellColumnSpan') },
      table: { row: num('tableCellRowIndex'), col: num('tableCellColumnIndex'), rowspan: num('tableCellRowSpan'), colspan: num('tableCellColumnSpan') } };
  });
}

async function accessibility() {
  const b = await browser('chrome', { args: ['--force-renderer-accessibility'] });
  open = b;
  try {
    const ctx = await b.newContext();
    const variants = ['fill=none&hfill=none', 'fill=hidden&hfill=hidden', 'fill=empty&hfill=empty', 'fill=empty&hfill=repeat', 'fill=repeat&hfill=repeat'];
    const SPANS = { 'Ward A': [3, 1], 'Block 2x2': [2, 2], 'Total over three columns': [1, 3], 'Full-width row: transferred': [1, 6], 'Ward C': [2, 1], Patient: [1, 2], Measures: [1, 3] };
    for (const v of variants) {
      const { page } = await load(ctx, v, 'ax.html');
      const blink = blinkCells(await chromeDump(ctx, 'S12 AX', 'blink'));
      const mac = macCells(await chromeDump(ctx, 'S12 AX', 'mac'));
      // Body cells with text (placeholders excluded): is the column exposed where aria-colindex says, with its own header?
      const real = mac.filter((c) => c.text && c.row >= 3);
      const bad = real.filter((c) => c.colRange?.loc !== c.col - 1 || !c.headers.includes(LEAF[c.col - 1]) || (GROUP[c.col] && !c.headers.includes(GROUP[c.col])));
      const spansSeen = Object.fromEntries(Object.keys(SPANS).map((t) => {
        const bl = blink.find((x) => x.text?.startsWith(t)), m = mac.find((x) => x.text?.startsWith(t));
        return [t, { ariaSpan: bl && [bl.aria.rowspan, bl.aria.colspan], tableSpan: bl && [bl.table.rowspan, bl.table.colspan], macRange: m && [m.rowRange?.len, m.colRange?.len], macCol: m?.colRange?.loc, headers: m?.headers }];
      }));
      const leafHeaders = mac.filter((c) => c.row === 2).map((c) => ({ text: c.text, loc: c.colRange?.loc }));
      observe('chrome', v, 'AX: spans as exposed (aria = Blink aria attrs, table = Blink table geometry, mac = AXRowIndexRange/AXColumnIndexRange len)', spansSeen);
      observe('chrome', v, 'AX: body cells whose macOS column position or column headers are wrong', { wrong: bad.map((c) => `${c.text}@${c.col}→loc ${c.colRange?.loc} [${c.headers.join('|')}]`), of: real.length, leafHeaders });
      if (v === 'fill=none&hfill=none') {
        check('chrome', v, 'AX: aria-rowspan/aria-colspan are exposed as ARIA attributes on the origin cell', Object.values(spansSeen).every((s) => s.ariaSpan && s.ariaSpan.some((x) => x > 1)), spansSeen);
        observe('chrome', v, 'AX verdict: Chrome table geometry honours the spans', Object.values(spansSeen).every((s) => s.tableSpan && (s.tableSpan[0] > 1 || s.tableSpan[1] > 1)));
      }
      await page.close();
    }
    // The live grid: A's origin row is an anchor above the window. Exposed, with its span?
    const { page } = await load(ctx, 'rows=200&at=4&len=10&fill=pinned');
    await page.evaluate(() => window.api.scrollRow(9));
    await frames(page);
    const blink = blinkCells(await chromeDump(ctx, 'S12 spans', 'blink'));
    const A = blink.find((c) => c.text?.startsWith('Cardiology'));
    const fillersExposed = blink.filter((c) => !c.text).length;
    observe('chrome', 'grid', 'AX: anchor cell A (origin row 4 above the window, rowindex 7)', A);
    check('chrome', 'grid', 'AX: the anchor row\'s tall cell is in the tree, not ignored, aria-rowindex 7, aria-rowspan 10; aria-hidden fillers absent', A && !A.ignored && A.aria.row === 7 && A.aria.rowspan === 10 && fillersExposed === 0, { A, fillersExposed });
    await page.close();
  } finally {
    await b.close();
    open = null;
  }
}

// ---------------------------------------------------------------- engines
const meta = {};
for (const name of engines) {
  const b = await browser(name);
  open = b;
  try {
    meta[name] = b.version();
    const ctx = await b.newContext();
    await stacking(name, ctx);
    await labels(name, ctx);
    await ellipsis(name, ctx);
    await caps(name, ctx);
  } finally {
    await b.close();
    open = null;
  }
  if (name === 'chrome') await accessibility();
}
await site.close();

const failed = checks.filter((c) => !c.ok).length;
record(import.meta.url, { browsers: meta, passed: checks.length - failed, failed, checks, observations });
process.exit(failed ? 1 : 0);
