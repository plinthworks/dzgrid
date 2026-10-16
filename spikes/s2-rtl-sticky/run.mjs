// S2: RTL with sticky pinned columns in one scroll container, in Chrome, Firefox and WebKit.
import { serve, browser, record } from '../kit.mjs';
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const resultsDir = fileURLToPath(new URL('./results/', import.meta.url));
mkdirSync(resultsDir, { recursive: true });
const site = await serve(import.meta.url);
const out = {};

async function drag(page, id, physicalDx) {
  const h = await page.evaluate((id) => window.spike.handleInfo(id), id);
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  await page.mouse.move(h.x + physicalDx / 2, h.y, { steps: 4 });
  await page.mouse.move(h.x + physicalDx, h.y, { steps: 4 });
  await page.mouse.up();
  const after = await page.evaluate((id) => window.spike.handleInfo(id), id);
  return { before: h, widthAfter: after.width };
}

async function resizeChecks(page, dir) {
  await page.evaluate(async (d) => { await window.spike.resetWidths(); await window.spike.setDir(d); await window.spike.scrollTo(0, 0); }, dir);
  const res = {};
  for (const id of ['c0', 'name', 'status']) {
    const info = await page.evaluate((id) => window.spike.handleInfo(id), id);
    // inline-end edge of the cell; the end-pinned column keeps its handle at its inline-start edge
    const atStartEdge = id === 'status';
    const edge = (dir === 'rtl') !== atStartEdge ? info.cellLeft : info.cellRight;
    const widen = ((dir === 'rtl') !== atStartEdge ? -1 : 1) * 60;
    const a = await drag(page, id, widen);
    const b = await drag(page, id, -widen / 2);
    const geo = await page.evaluate(() => window.spike.alignment());
    res[id] = {
      handleOffsetFromExpectedEdge: +(info.x - edge).toFixed(2), handleHitTest: info.hitIsHandle,
      physicalDragToWiden: widen, w0: info.width, afterWiden: a.widthAfter, afterShrinkHalf: b.widthAfter,
      ok: a.widthAfter === info.width + 60 && b.widthAfter === info.width + 30,
      maxMisalignAfter: geo.maxMisalign,
    };
  }
  await page.evaluate(() => window.spike.resetWidths());
  return res;
}

/**
 * Two passes. `default`: the kit's headless browsers; on macOS every engine then
 * uses overlay scrollbars (0 px), so the scrollbar side cannot be seen by width.
 * `classic`: classic scrollbars forced. Chrome: without Playwright's --hide-scrollbars
 * and with the OverlayScrollbar feature off. WebKit: no switch found; a styled
 * ::-webkit-scrollbar is classic. Firefox: headless always overlays (ui.useOverlayScrollbars=0
 * is ignored headless); only a headed window gives classic scrollbars, and spikes stay
 * headless, so Firefox has no classic pass here (manual check, see README).
 * Only one browser is open at a time, closed in `finally`.
 */
const classicLaunch = {
  chrome: () => chromium.launch({ channel: 'chrome', headless: true, ignoreDefaultArgs: ['--hide-scrollbars'], args: ['--disable-features=OverlayScrollbar'] }),
  firefox: () => null,
  webkit: () => browser('webkit'),
};

for (const name of ['chrome', 'firefox', 'webkit']) {
  const r = {};
  for (const pass of ['default', 'classic']) {
    const b = pass === 'default' ? await browser(name) : await classicLaunch[name]();
    if (!b) continue;
    try {
      r.version ??= b.version();
      const page = await b.newPage({ viewport: { width: 900, height: 480 } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      const sb = pass === 'classic' && name === 'webkit' ? 'custom' : 'native';
      await page.goto(site.url(`index.html?sb=${sb}`));
      await page.waitForFunction(() => window.ready, null, { timeout: 15000 });
      const v = { launch: pass === 'default' ? 'kit headless' : { chrome: 'headless, no --hide-scrollbars, OverlayScrollbar off', webkit: 'headless, styled ::-webkit-scrollbar' }[name] };
      v.ltr = await page.evaluate(() => window.spike.scenario('ltr'));
      v.rtl = await page.evaluate(() => window.spike.scenario('rtl'));
      if (pass === 'default') {
        v.flip = await page.evaluate(() => window.spike.flip());
        v.bidi = await page.evaluate(() => window.spike.bidiProbe());
        v.resize = { ltr: await resizeChecks(page, 'ltr'), rtl: await resizeChecks(page, 'rtl') };
      }
      const shots = pass === 'default' ? [['ltr', 'start', 0], ['ltr', 'mid', 0.5], ['rtl', 'start', 0], ['rtl', 'mid', 0.5]] : [['ltr', 'classic-mid', 0.5], ['rtl', 'classic-mid', 0.5]];
      for (const [dir, tag, fx] of shots) {
        await page.evaluate(async ([d, fx]) => { await window.spike.setDir(d); await window.spike.scrollTo(window.spike.grid.maxX * fx, 96); }, [dir, fx]);
        const clip = await page.evaluate(() => window.spike.rect());
        await page.screenshot({ path: `${resultsDir}${name}-${dir}-${tag}.png`, fullPage: true, clip });
      }
      v.errors = errors;
      r[pass] = v;
    } finally {
      await b.close();
    }
  }
  out[name] = r;
}
await site.close();

// Compact summary: the answers, per engine.
const summary = {};
const TOL = 1;
for (const [name, r] of Object.entries(out)) {
  const s = {};
  for (const sb of Object.keys(r).filter((k) => k === 'default' || k === 'classic')) {
    const v = r[sb];
    const per = {};
    for (const dir of ['ltr', 'rtl']) {
      const d = v[dir];
      const pos = Object.values(d.positions);
      per[dir] = {
        convention: d.convention,
        scrollbar: `${d.scrollbar.side} ${d.scrollbar.verticalScrollbarWidth}px, clientLeft includes it: ${d.scrollbar.clientLeftIncludesScrollbar}`,
        rawScrollLeftRange: [d.rawScrollLeft.afterMinusHuge, d.rawScrollLeft.afterPlusHuge],
        scrollXRoundTripOk: d.scrollXRoundTripOk,
        scrollXPutsC5AtStart_px: d.scrollXPutsC5AtStart,
        pinnedStuckMaxOff_px: Math.max(...pos.flatMap((p) => Object.values(p.stuck).map(Math.abs))),
        headerBodyMaxMisalign_px: Math.max(...pos.map((p) => p.maxMisalign)),
        centreOrderMirroredOk: pos.every((p) => p.centreOrderMirrored),
        pinnedPaintOnTopOk: pos.every((p) => p.pinnedPaintsOnTop.name && p.pinnedPaintsOnTop.status && p.pinnedPaintsOnTop.headerOverBody),
        scrollIntoViewPlainOk: Object.entries(d.scrollIntoView).filter(([k]) => k.startsWith('plain')).map(([k, x]) => `${k}:${x.fullyUnobstructed && x.hitIsCell}`),
        scrollIntoViewPaddedOk: Object.entries(d.scrollIntoView).filter(([k]) => k.startsWith('padded')).every(([, x]) => x.fullyUnobstructed && x.hitIsCell),
        ensureVisibleOk: Object.values(d.ensureVisible).every((x) => x.fullyUnobstructed && x.hitIsCell),
      };
      per[dir].stickyOk = per[dir].pinnedStuckMaxOff_px <= TOL && per[dir].headerBodyMaxMisalign_px <= TOL && per[dir].centreOrderMirroredOk && per[dir].pinnedPaintOnTopOk;
    }
    if (v.resize) per.resize = Object.fromEntries(['ltr', 'rtl'].map((d) => [d, Object.fromEntries(Object.entries(v.resize[d]).map(([k, x]) => [k, `${x.ok ? 'ok' : 'FAIL'} handleOff=${x.handleOffsetFromExpectedEdge} hit=${x.handleHitTest} w ${x.w0}->${x.afterWiden}->${x.afterShrinkHalf} misalign=${x.maxMisalignAfter}`]))]));
    if (v.bidi) per.bidi = Object.fromEntries(Object.entries(v.bidi).map(([k, x]) => [k, `arabic ${x.arabicSide}, hugs ${x.hugs}`]));
    if (v.flip) per.flip = { before: v.flip.before, afterDirChange: v.flip.afterRaw, reapplied: { scrollX: v.flip.reapplied.scrollX, misalign: v.flip.reapplied.geometry.maxMisalign } };
    per.launch = v.launch;
    per.errors = v.errors;
    s[sb] = per;
  }
  summary[name] = { version: r.version, ...s };
}
record(import.meta.url, { summary, raw: out });
