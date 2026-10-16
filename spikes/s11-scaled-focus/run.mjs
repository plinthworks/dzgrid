// S11 — retained row in scaled mode, and the combinations never measured together.
// One browser at a time, closed in finally. BROWSERS=chrome,firefox,webkit (default all).
import { serve, browser, record } from '../kit.mjs';

const site = await serve(import.meta.url);
const engines = (process.env.BROWSERS ?? 'chrome,firefox,webkit').split(',');
const checks = [], observations = [];
let open = null;
process.on('SIGINT', async () => { await open?.close().catch(() => {}); await site.close(); process.exit(130); });

const check = (engine, cfg, label, ok, detail) => {
  checks.push({ engine, cfg, label, ok: !!ok, ...(ok ? {} : { detail }) });
  if (!ok) console.error('FAIL', engine, cfg, label, JSON.stringify(detail).slice(0, 400));
};
const observe = (engine, cfg, label, value) => observations.push({ engine, cfg, label, value });
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const S = (page) => page.evaluate(() => window.api.state());
const LIMIT = 2 ** 22;

async function load(ctx, qs) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1000, height: 800 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(site.url(`index.html?${qs}`));
  await page.waitForFunction(() => window.ready, null, { timeout: 15000 });
  H0 = await page.evaluate(() => document.querySelector('.vp').scrollHeight);
  return { page, errors };
}

// The body's scrollHeight is read once per page: a retained row must never grow it.
let H0 = null;
const sane = (s) => s.orderOk && s.rowindexOk && s.maxWritten < LIMIT && s.scrollTopOk && !s.retainedOverlaps && (H0 === null || s.scrollHeight === H0);

async function focusScenarios(name, ctx, cfg) {
  const { page, errors } = await load(ctx, cfg);
  const C = (l) => l;
  // A — focus row 500 000, scroll by API to 0, to the end, back.
  const mid = await page.evaluate(() => Math.floor(window.api.N / 2));
  await page.evaluate((k) => window.api.focusCell(k, 3), mid);
  await frames(page);
  await page.evaluate(() => window.api.reset());
  const a = [];
  for (const step of ['top', 'end', 'back']) {
    await page.evaluate(([step, k]) => (step === 'top' ? window.api.scrollToIndex(0) : step === 'end' ? window.api.scrollToEnd() : window.api.scrollToIndex(k - 5)), [step, mid]);
    await frames(page);
    a.push(await S(page));
  }
  const want = `div ${mid}/3`;
  const retainNone = cfg.includes('retain=none');
  if (retainNone) {
    observe(name, cfg, 'A witness: focus without a retained row', a.map((s) => ({ active: s.active, blurs: s.blurs })));
    check(name, cfg, C('A witness loses focus (proves the test sees it)'), a[0].active !== want || a[0].blurs > 0, a[0]);
    await page.close();
    return;
  }
  check(name, cfg, C('A same node focused, no blur, retained while away, sane DOM'),
    a.every((s) => s.active === want && s.blurs === 0 && sane(s)) && a[0].retained.includes(mid) && a[1].retained.includes(mid),
    a.map(({ events, ...s }) => s));

  // B — retained off screen; a real ArrowDown brings focus to the next row, visible.
  await page.evaluate(() => window.api.scrollToIndex(0)); await frames(page);
  await page.evaluate(() => window.api.reset());
  await page.keyboard.press('ArrowDown');
  await frames(page, 2);
  let s = await S(page);
  check(name, cfg, C('B ArrowDown off screen: next row focused and visible within 2 frames'), s.active === `div ${mid + 1}/3` && s.visible && s.blurs <= 2 && sane(s), s); // the old cell's blur and focusout
  observe(name, cfg, 'B scroll events', { native: s.native, ours: s.ours });

  // C — Tab out, scroll to the end, Shift+Tab back.
  await page.focus('#after');
  await page.evaluate(() => window.api.scrollToEnd()); await frames(page);
  await page.evaluate(() => window.api.reset());
  await page.keyboard.press('Shift+Tab');
  await frames(page, 3);
  s = await S(page);
  check(name, cfg, C('C Shift+Tab back: same cell focused and visible within 3 frames'), s.active === `div ${mid + 1}/3` && s.visible && sane(s), s);
  observe(name, cfg, 'C scroll events (native jump, then ours)', { native: s.native, ours: s.ours, cellTop: s.cellTop });

  // D — editor: type, move the caret, scroll away, type again.
  await page.evaluate((k) => window.api.startEdit(k, 4), mid);
  await page.keyboard.type('Bonjour');
  // Arrows move the caret by visual direction (RTL differs): place it.
  await page.evaluate(() => document.activeElement.setSelectionRange(4, 4));
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.api.reset(); window.api.scrollToIndex(0); }); await frames(page);
  s = await S(page);
  check(name, cfg, C('D editor scrolled away: same input, text and caret kept, no blur'), s.inEditor && s.value === 'Bonjour' && s.caret.join() === '4,4' && s.blurs === 0 && sane(s), s);
  await page.keyboard.type('!');
  await frames(page, 3);
  s = await S(page);
  check(name, cfg, C('D typing off screen: "Bonj!our", caret 5, editor visible within 3 frames'), s.value === 'Bonj!our' && s.caret.join() === '5,5' && s.blurs === 0 && s.visible && sane(s), s);
  observe(name, cfg, 'D scroll events after typing off screen', { native: s.native, ours: s.ours, cellTop: s.cellTop });
  await page.keyboard.press('Escape'); await frames(page);

  // E — programmatic focus far away: no native scroll.
  await page.evaluate(() => { window.api.scrollToIndex(0); }); await frames(page);
  await page.evaluate(() => window.api.reset());
  await page.evaluate(() => window.api.focusCell(window.api.N - 1, 3)); await frames(page, 2);
  s = await S(page);
  check(name, cfg, C('E api.focusCell(last row) from the top: grid scroll only, visible'), s.native === 0 && s.visible && s.active === `div ${await page.evaluate(() => window.api.N - 1)}/3` && sane(s), s);

  // F — reverse the order while row 0 is retained and the view is at the end.
  await page.evaluate(() => { window.api.scrollToIndex(0); window.api.focusCell(0, 3); window.api.scrollToEnd(); }); await frames(page);
  await page.evaluate(() => { window.api.reset(); window.api.reverse(); }); await frames(page);
  s = await S(page);
  check(name, cfg, C('F reversed: row 0 now last and in view, still focused, sane'), s.active === 'div 0/3' && s.blurs === 0 && sane(s), s);
  await page.evaluate(() => { window.api.reverse(); window.api.scrollToIndex(1000); }); await frames(page);
  s = await S(page);
  check(name, cfg, C('F reversed back, away: row 0 retained, focused, sane'), s.active === 'div 0/3' && s.blurs === 0 && sane(s), s);
  check(name, cfg, 'no page error', errors.length === 0, errors);
  await page.close();
}

/**
 * K — the focused row a few rows to a few viewports away from the window, above and below,
 * at the top, the middle and near the end: never drawn over the viewport, never growing the
 * scroll range, focus kept, then brought back by ArrowDown.
 */
async function nearScenario(name, ctx, cfg) {
  const { page } = await load(ctx, cfg);
  const N = await page.evaluate(() => window.api.N);
  const bad = [];
  for (const at of [Math.floor(N / 2), N - 400, 300]) {
    for (const d of [-200000, -40000, -3000, -140, -100, -30, -8, 8, 30, 100, 140, 3000, 40000, 200000]) {
      const top = at + d;
      if (top < 0 || top >= N - 20) continue;
      await page.evaluate(([at, top]) => { window.api.focusCell(at, 3); window.api.reset(); window.api.scrollToLogical(top * window.api.ROW + 13.37); }, [at, top]);
      await frames(page);
      const s = await S(page);
      if (s.focusInWindow) continue;
      if (!(s.active === `div ${at}/3` && s.blurs === 0 && sane(s))) bad.push({ at, d, active: s.active, blurs: s.blurs, overlaps: s.retainedOverlaps, h: s.scrollHeight, H0, maxWritten: s.maxWritten });
    }
  }
  await page.close();
  return bad;
}

async function keysScenario(name, ctx, cfg) {
  const { page } = await load(ctx, cfg);
  const r = {};
  // (1) focus on a cell: the keys move focus, no native scroll.
  await page.evaluate(() => window.api.focusCell(10, 3)); await frames(page);
  await page.evaluate(() => window.api.reset());
  for (const k of ['PageDown', 'Space', 'ArrowDown', 'End']) await page.keyboard.press(k);
  await frames(page, 2);
  let s = await S(page);
  r.onCell = { native: s.native, active: s.active, logicalTop: s.logicalTop };
  const page0 = await page.evaluate(() => Math.floor(window.api.BODY_VIEW() / window.api.ROW) - 1);
  const rtl = cfg.includes('dir=rtl');
  // PageDown, Space (a page), ArrowDown, End (last column): row 10 + 2 pages + 1, column 22.
  check(name, cfg, 'G1 keys on a cell: focus moves where the keys say, no native scroll, visible', s.native === 0 && s.visible && s.active === `div ${10 + 2 * page0 + 1}/22`, s);
  await page.evaluate(() => window.api.focusCell(10, 5)); await frames(page);
  await page.keyboard.press('ArrowRight'); await frames(page);
  s = await S(page);
  check(name, cfg, 'G1 ArrowRight moves toward the end in LTR, the start in RTL', s.active === `div 10/${rtl ? 4 : 6}`, s);
  // (2) focus on the viewport itself.
  await page.evaluate(() => { window.api.focusCell(0, 3); window.api.scrollToIndex(0); document.querySelector('.vp').focus({ preventScroll: true }); }); await frames(page);
  await page.evaluate(() => window.api.reset());
  const before = (await S(page)).logicalTop;
  await page.keyboard.press('PageDown');
  await frames(page, 40);  // let a native smooth scroll finish
  s = await S(page);
  r.onViewport = { native: s.native, delta: s.logicalTop - before, active: s.active };
  const page1 = await page.evaluate(() => Math.floor(window.api.BODY_VIEW() / window.api.ROW) - 1);
  if (cfg.includes('intercept=1')) check(name, cfg, 'G2 PageDown on the viewport, intercepted: focus goes one page from the focus cell, no native scroll', s.native === 0 && s.active === `div ${page1}/3` && s.visible, s);
  observe(name, cfg, 'G2 PageDown with focus on the viewport', r.onViewport);
  // (3) a click on a non-cell area (the header gap, or the empty body) gives focus to the focus cell.
  await page.evaluate(() => window.api.focusCell(20, 3)); await page.focus('#after');
  const box = await page.locator('.vp').boundingBox();
  await page.mouse.click(box.x + 790 - 20, box.y + 10); // over the header's end segment
  await frames(page);
  s = await S(page);
  r.click = s.active;
  observe(name, cfg, 'G3 click on a header gives focus to', s.active);
  await page.close();
  return r;
}

async function touchScenario(name, ctx, cfg) {
  const { page } = await load(ctx, cfg);
  const cdp = await ctx.newCDPSession(page);
  const box = await page.locator('.vp').boundingBox();
  await page.evaluate(() => window.api.reset());
  const before = (await S(page)).logicalTop;
  await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(box.x + 400), y: Math.round(box.y + 400), yDistance: -600, speed: 800, gestureSourceType: 'touch' });
  await page.waitForTimeout(1500);
  const s = await S(page);
  const r = { delta: s.logicalTop - before, scrollTopDelta: s.scrollTop, native: s.native, ours: s.ours };
  await page.close();
  return r;
}

async function pinnedScenario(name, ctx, cfg) {
  const { page } = await load(ctx, cfg);
  const out = [];
  for (const where of ['top', 'mid', 'end']) {
    await page.evaluate((w) => (w === 'top' ? window.api.scrollToIndex(0) : w === 'mid' ? window.api.scrollToIndex(Math.floor(window.api.N / 2)) : window.api.scrollToEnd()), where);
    for (const x of ['0', 'mid', 'max']) {
      await page.evaluate((x) => {
        const vp = document.querySelector('.vp'); const max = vp.scrollWidth - vp.clientWidth; const sign = document.documentElement.dir === 'rtl' ? -1 : 1;
        vp.scrollLeft = sign * (x === '0' ? 0 : x === 'mid' ? max / 2 : max);
      }, x);
      await frames(page);
      out.push(await page.evaluate(([where, x]) => {
        const vp = document.querySelector('.vp'); const v = vp.getBoundingClientRect();
        const rtl = document.documentElement.dir === 'rtl';
        const inner = { left: v.left + vp.clientLeft, right: v.left + vp.clientLeft + vp.clientWidth };
        // In RTL Chrome puts the vertical scrollbar on the left: clientLeft does not count it.
        const sb = vp.offsetWidth - vp.clientWidth - 2;
        if (rtl && document.elementFromPoint(v.left + 2, v.top + 300) === vp) inner.left = v.left + 1 + sb;
        const rows = [...document.querySelectorAll('.layer .row')].filter((r) => { const b = r.getBoundingClientRect(); return b.top >= v.top + 32 && b.bottom <= v.bottom; });
        const row = rows[2];
        const start = row.querySelector('.seg.start').getBoundingClientRect(), end = row.querySelector('.seg.end').getBoundingClientRect();
        const hs = document.querySelector('.head .seg.start').getBoundingClientRect(), he = document.querySelector('.head .seg.end').getBoundingClientRect();
        const startEdge = rtl ? Math.abs(start.right - inner.right) : Math.abs(start.left - inner.left);
        const endEdge = rtl ? Math.abs(end.left - inner.left) : Math.abs(end.right - inner.right);
        const cx = rtl ? start.right - 50 : start.left + 50, ex = rtl ? end.left + 50 : end.right - 50;
        const hit = (x) => document.elementFromPoint(x, start.top + 10)?.closest('.seg')?.className ?? null;
        // A centre cell's header and body cell line up.
        const hc = document.querySelector('.head [data-col="10"]').getBoundingClientRect(), bc = row.querySelector('[data-col="10"]').getBoundingClientRect();
        return { where, x, startEdge, endEdge, headAlign: Math.max(Math.abs(hs.left - start.left), Math.abs(he.left - end.left), Math.abs(hc.left - bc.left)), hitStart: hit(cx), hitEnd: hit(ex) };
      }, [where, x]));
    }
  }
  await page.close();
  return out;
}

async function placementScenario(name, ctx, cfg) {
  // J2 — rows placed through the re-anchored layer land where they should, at fractional
  // offsets, for the first, a middle and the last visible row, all along a million rows.
  const { page } = await load(ctx, cfg);
  const out = [];
  const N = await page.evaluate(() => window.api.N);
  for (let k = 0; k <= 10; k++) {
    const i = Math.min(N - 40, Math.floor((N - 40) * k / 10));
    const l = i * 32 + (k * 7.37) % 32;
    await page.evaluate((l) => window.api.scrollToLogical(l), l); await frames(page);
    out.push(await page.evaluate((l) => {
      const vp = document.querySelector('.vp'); const v = vp.getBoundingClientRect();
      // Expected from the logical offset asked for, not from what the page computed.
      const rows = [...document.querySelectorAll('.layer .row')].map((el) => ({ i: Number(el.getAttribute('aria-rowindex')) - 2, top: el.getBoundingClientRect().top }));
      const seen = rows.filter((r) => r.top >= v.top + 33 && r.top < v.bottom - 32);
      const pick = [seen[0], seen[Math.floor(seen.length / 2)], seen[seen.length - 1]];
      return { l, worst: Math.max(...pick.map((r) => Math.abs(r.top - (v.top + vp.clientTop + 32 + r.i * 32 - l)))) };
    }, l));
  }
  await page.close();
  return out;
}

async function axScenario(name, ctx, cfg) {
  // J3 — the retained row with contain: strict is still in the accessibility tree.
  const { page } = await load(ctx, cfg);
  await page.evaluate(() => { window.api.focusCell(500000, 3); window.api.scrollToIndex(0); }); await frames(page);
  const cdp = await ctx.newCDPSession(page);
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const cell = nodes.find((n) => n.name?.value === 'r500000 c3' && n.role?.value === 'gridcell');
  let row = cell && byId.get(cell.parentId);
  while (row && row.role?.value !== 'row') row = byId.get(row.parentId);
  const r = { cell: !!cell, cellIgnored: cell?.ignored ?? null, focused: cell?.properties?.find((p) => p.name === 'focused')?.value?.value ?? null, row: row?.role?.value ?? null, rowIndex: row?.properties?.find((p) => p.name === 'rowindex')?.value?.value ?? null };
  await page.close();
  return r;
}

async function runEngine(name) {
  const b = await browser(name, name === 'chrome' ? { args: ['--disable-features=OverlayScrollbar'] } : {});
  open = b;
  try {
    const ctx = await b.newContext({ hasTouch: name === 'chrome' ? false : undefined });
    for (const rows of [1_000_000, 200_000]) {
      for (const retain of ['image', 'clamped']) for (const contain of ['content', 'strict', 'none']) {
        if (contain === 'none' && rows !== 1_000_000) continue;
        await focusScenarios(name, ctx, `rows=${rows}&retain=${retain}&contain=${contain}`);
      }
    }
    await focusScenarios(name, ctx, 'rows=1000000&retain=none');
    await focusScenarios(name, ctx, 'rows=1000000&retain=clamped&contain=content&dir=rtl');
    for (const retain of ['clamped', 'image']) for (const rows of [1_000_000, 200_000]) {
      const bad = await nearScenario(name, ctx, `rows=${rows}&retain=${retain}&contain=content`);
      observe(name, `rows=${rows}&retain=${retain}`, 'K near the window: failures', bad.length ? bad.slice(0, 6) : 'none');
      if (retain === 'clamped') check(name, `rows=${rows}&retain=clamped`, 'K focused row near the window: never over the viewport, scroll range unchanged, focus kept', bad.length === 0, bad.slice(0, 6));
    }
    { const bad = await nearScenario(name, ctx, 'rows=1000000&retain=clamped&contain=content&clip=0');
      observe(name, 'rows=1000000&retain=clamped&clip=0', 'K without overflow: clip on the body: failures', bad.length ? bad.slice(0, 4) : 'none'); }
    for (const [intercept, dir] of [['1', 'ltr'], ['1', 'rtl'], ['0', 'ltr']]) {
      const r = await keysScenario(name, ctx, `rows=1000000&intercept=${intercept}&dir=${dir}`);
      observe(name, `intercept=${intercept}&dir=${dir}`, 'G keys', r);
    }
    for (const dir of ['ltr', 'rtl']) for (const contain of ['strict', 'content', 'size+layout+style', 'paint', 'none']) {
      const p = await pinnedScenario(name, ctx, `rows=1000000&contain=${contain}&dir=${dir}`);
      observe(name, `${dir} contain=${contain}`, 'J1 pinned', p);
      // strict and size are measured, not required: Firefox drops sticky under size containment.
      if (!['content', 'none'].includes(contain)) { observe(name, `${dir} contain=${contain}`, 'J1 sticky holds', p.every((m) => m.startEdge <= 1 && m.endEdge <= 1)); continue; }
      check(name, `dir=${dir}&contain=${contain}`, 'J1 pinned segments stay at their edges, over the centre, header aligned (scaled)',
        p.every((m) => m.startEdge <= 1 && m.endEdge <= 1 && m.headAlign <= 1 && /start/.test(m.hitStart) && /end/.test(m.hitEnd)), p.filter((m) => !(m.startEdge <= 1 && m.endEdge <= 1 && m.headAlign <= 1 && /start/.test(m.hitStart) && /end/.test(m.hitEnd))));
    }
    const pl = await placementScenario(name, ctx, 'rows=1000000');
    observe(name, 'rows=1000000', 'J2 placement offsets (px)', pl);
    check(name, 'rows=1000000', 'J2 re-anchored layer: first, middle and last visible rows within 0.5 px of their place, fractional offsets', pl.every((m) => m.worst <= 0.5), pl);
    if (name === 'chrome') {
      const ax = await axScenario(name, ctx, 'rows=1000000&contain=content');
      observe(name, 'contain=content', 'J3 AX of the retained row', ax);
      check(name, 'contain=content', 'J3 retained row is in the AX tree, focused, not ignored, inside its row', ax.cell && !ax.cellIgnored && ax.focused === true && ax.row === 'row', ax);
      for (const scroll of ['absolute', 'relative']) {
        const t = await touchScenario(name, ctx, `rows=1000000&scroll=${scroll}`);
        observe(name, `scroll=${scroll}`, 'H touch fling of 600 px (logical delta)', t);
      }
      const t = await touchScenario(name, ctx, 'rows=50000');
      observe(name, 'rows=50000 (not scaled)', 'H touch fling of 600 px (reference)', t);
    }
  } finally {
    await b.close();
    open = null;
  }
}

try {
  for (const e of engines) { console.log(`=== ${e}`); await runEngine(e); }
} finally {
  await site.close();
}
const failed = checks.filter((c) => !c.ok);
record(import.meta.url, { passed: checks.length - failed.length, failed: failed.length, checks, observations });
process.exit(failed.length ? 1 : 0);
