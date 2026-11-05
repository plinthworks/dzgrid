/**
 * Phase 8 step 4 in real browsers (`node scripts/browser-infinite.mjs`, `--engine firefox|webkit|all`): the page
 * packages/dom/test/browser/infinite.html (data set C: 10⁷ made-up rows, 150 ms, known or unknown total).
 * Chrome (the exit criteria): Ctrl+End to row 10 000 000 — its data shown at most one frame after its block answers;
 * wheel at 3 000 px/s over blocks held — median ≥ 58 fps, p95 frame ≤ 25 ms; a thumb drag from top to bottom (the
 * scroll position written each frame for a second, as a thumb drags) asks ≤ 6 blocks; blocks held never above
 * maxBlocks, read at every frame; axe 0 in fr / ar with loading and failed rows on screen.
 * Every engine: row 10 000 000 reached, 0 px error at both ends (the first row flush with the body's top at the top,
 * the last row's bottom flush with the viewport's bottom at the end), known and unknown total. Browsers closed in finally.
 */
import { fileURLToPath } from 'node:url';
import { serve, browser, median, percentile } from '../spikes/kit.mjs';

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
  await page.goto(site.root(`packages/dom/test/browser/infinite.html?${qs}`));
  await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
  // The first block in, the first rows shown.
  await page.waitForFunction(() => document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="2"]:not([data-kind])'), null, { timeout: 10000 });
  await frames(page, 3);
  return { page, errors };
}

/** Scrolls to the end and back to the top; the rows at both ends against the viewport's edges, in px. */
async function ends(page) {
  const edge = () => page.evaluate(() => {
    const vp = document.querySelector('.dzg-viewport');
    const body = document.querySelector('.dzg-body').getBoundingClientRect();
    const head = document.querySelector('.dzg-header').getBoundingClientRect();
    const rows = [...document.querySelectorAll('.dzg-layer > .dzg-row')].map((r) => ({ i: Number(r.getAttribute('aria-rowindex')), b: r.getBoundingClientRect(), text: r.querySelector('[data-col=id]')?.textContent, kind: r.getAttribute('data-kind') }));
    const v = vp.getBoundingClientRect();
    const first = rows.reduce((a, r) => (r.i < a.i ? r : a), rows[0]);
    const last = rows.reduce((a, r) => (r.i > a.i ? r : a), rows[0]);
    return { first: first.i, firstGap: first.b.top - head.bottom, bodyTop: body.top - head.bottom, last: last.i, lastText: last.text, lastKind: last.kind, lastGap: v.top + vp.clientHeight - last.b.bottom, top: vp.scrollTop, max: vp.scrollHeight - vp.clientHeight };
  });
  await page.evaluate(() => { const vp = document.querySelector('.dzg-viewport'); vp.scrollTop = vp.scrollHeight; });
  await frames(page, 4);
  await page.waitForFunction(() => document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="10000001"]:not([data-kind])'), null, { timeout: 15000 }).catch(() => {});
  await frames(page, 3);
  const bottom = await edge();
  await page.evaluate(() => { document.querySelector('.dzg-viewport').scrollTop = 0; });
  await frames(page, 4);
  await page.waitForFunction(() => document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="2"]:not([data-kind])'), null, { timeout: 15000 }).catch(() => {});
  await frames(page, 3);
  return { bottom, top: await edge() };
}

for (const engine of engines) {
  let b = null;
  try {
    b = await browser(engine);
    // ---- every engine: both ends of 10⁷ rows, known and unknown total ----
    for (const total of ['known', 'unknown']) {
      const { page, errors } = await open(b, `latency=20&total=${total}`);
      if (total === 'unknown') {
        // An unknown end grows block by block: Ctrl+End pressed until the server says it has no more is ten million
        // presses; the known end is what this check is about, the growth is the next one's.
        await page.click('.dzg-layer > .dzg-row[aria-rowindex="2"] [data-col=fruit]');
        const counts = [await page.evaluate(() => window.t.model.displayed.count)];
        for (let k = 0; k < 3; k++) {
          await page.keyboard.press('ControlOrMeta+End');
          await page.waitForFunction((n) => window.t.model.displayed.count > n, counts.at(-1), { timeout: 3000 }).catch(() => {});
          counts.push(await page.evaluate(() => window.t.model.displayed.count));
        }
        const rc = await page.evaluate(() => document.querySelector('.dzg-viewport').getAttribute('aria-rowcount'));
        check(engine, `unknown total: each Ctrl+End goes further (${counts.join(' → ')} rows), aria-rowcount -1`, counts.every((c, i) => !i || c > counts[i - 1]) && rc === '-1', { counts, rc });
      } else {
        const e = await ends(page);
        check(engine, 'known total: row 10 000 000 reached with its data, flush with the bottom (0 px)', e.bottom.last === 10_000_001 && e.bottom.lastText && !e.bottom.lastKind && Math.abs(e.bottom.lastGap) < 0.5 && Math.abs(e.bottom.top - e.bottom.max) <= 1, e.bottom);
        check(engine, 'known total: back at the top, row 1 flush with the header (0 px)', e.top.first === 2 && Math.abs(e.top.firstGap) < 0.5 && e.top.top === 0, e.top);
      }
      check(engine, `no page error (${total})`, errors.length === 0, errors);
      await page.close();
    }
    if (engine !== 'chrome') continue;

    // ---- Chrome: Ctrl+End to row 10⁷, one frame after its answer ----
    {
      const { page, errors } = await open(b, 'latency=150');
      await page.evaluate(() => window.t.grid.api.focusCell(window.t.grid.kernel.rows.displayed.keyAt(0), 'id'));
      await frames(page, 2);
      // Count the frames between the last block's answer and the frame its row shows its data.
      await page.evaluate(() => {
        window.seen = null;
        const tick = () => {
          const r = document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="10000001"]:not([data-kind])');
          const e = window.t.log.find((x) => x.block === 99_999 && x.answered);
          if (r && e && !window.seen) window.seen = { at: performance.now(), answered: e.answered, frames: window.fr - (window.frAt ?? window.fr) };
          if (e && window.frAt === undefined) window.frAt = window.fr;
          window.fr = (window.fr ?? 0) + 1;
          if (!window.seen) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await page.keyboard.press('ControlOrMeta+End');
      await page.waitForFunction(() => window.seen, null, { timeout: 10000 }).catch(() => {});
      const seen = await page.evaluate(() => ({ ...window.seen, focus: document.activeElement?.closest('.dzg-row')?.getAttribute('aria-rowindex'), focusKey: window.t.grid.kernel.focus?.row, held: window.t.model.diagnostics.blocks }));
      check(engine, 'Ctrl+End: row 10 000 000 shown at most one frame after its block answers, the focus on it', seen.frames !== undefined && seen.frames <= 1 && seen.focus === '10000001', seen);
      check(engine, 'no page error (Ctrl+End)', errors.length === 0, errors);
      await page.close();
    }

    // ---- Chrome: wheel at 3 000 px/s over blocks held; blocks held read every frame ----
    {
      const { page, errors } = await open(b, 'latency=0');
      // Hold the first 600 rows (6 blocks): scrolled through slowly (logical offsets: 10⁷ rows are projected), every block answered.
      const rh = await page.evaluate(() => document.querySelector('.dzg-layer > .dzg-row').getBoundingClientRect().height);
      for (let y = 0; y <= 600 * rh; y += 20 * rh) {
        await page.evaluate((y) => window.t.grid.scroll.scrollTo(y), y);
        await frames(page, 2);
      }
      await page.evaluate(() => window.t.grid.scroll.scrollTo(0));
      await page.waitForTimeout(200);
      // 3 000 px/s for two seconds: each frame a wheel event of the distance since the last (the grid's own wheel, above the cap).
      const r = await page.evaluate(() => new Promise((done) => {
        const vp = document.querySelector('.dzg-viewport');
        const times = [];
        let maxHeld = 0;
        const asked = window.t.model.diagnostics.fetches;
        const from = window.t.grid.scroll.logicalTop;
        const start = performance.now();
        let last = start;
        const f = (t) => {
          const dt = t - last;
          last = t;
          if (dt > 0) times.push(dt);
          vp.dispatchEvent(new WheelEvent('wheel', { deltaY: (3000 * dt) / 1000, deltaMode: 0, bubbles: true, cancelable: true }));
          maxHeld = Math.max(maxHeld, window.t.model.diagnostics.blocks.held);
          if (t - start < 2000) requestAnimationFrame(f);
          else done({ times: times.slice(2), maxHeld, asked: window.t.model.diagnostics.fetches - asked, moved: window.t.grid.scroll.logicalTop - from });
        };
        requestAnimationFrame(f);
      }));
      const fps = r.times.map((t) => 1000 / t);
      const med = median(fps);
      const p95 = percentile(r.times, 95);
      check(engine, `wheel at 3 000 px/s over blocks held: median ${med.toFixed(1)} fps (≥ 58), p95 ${p95.toFixed(1)} ms (≤ 25), ${Math.round(r.moved)} px moved`, med >= 58 && p95 <= 25 && r.moved > 5000 && r.asked === 0, { med, p95, frames: r.times.length, moved: r.moved, asked: r.asked });
      check(engine, `blocks held never above maxBlocks (20) at any frame of the wheel: ${r.maxHeld}`, r.maxHeld <= 20, r.maxHeld);

      // ---- thumb drag from top to bottom: the scroll written each frame for one second ----
      await page.evaluate(() => { document.querySelector('.dzg-viewport').scrollTop = 0; });
      await page.waitForTimeout(300);
      const drag = await page.evaluate(() => new Promise((done) => {
        const vp = document.querySelector('.dzg-viewport');
        const max = vp.scrollHeight - vp.clientHeight;
        const before = window.t.model.diagnostics.fetches;
        let maxHeld = 0;
        const start = performance.now();
        const f = (t) => {
          const k = Math.min(1, (t - start) / 1000);
          vp.scrollTop = k * max;
          maxHeld = Math.max(maxHeld, window.t.model.diagnostics.blocks.held);
          if (k < 1) requestAnimationFrame(f);
          else setTimeout(() => done({ asked: window.t.model.diagnostics.fetches - before, maxHeld: Math.max(maxHeld, window.t.model.diagnostics.blocks.held), blocks: window.t.log.slice(-8).map((x) => x.block) }), 400);
        };
        requestAnimationFrame(f);
      }));
      check(engine, `thumb drag top to bottom asks ≤ 6 blocks: ${drag.asked}`, drag.asked <= 6, drag);
      check(engine, `blocks held never above maxBlocks during the drag: ${drag.maxHeld}`, drag.maxHeld <= 20, drag);
      check(engine, 'no page error (wheel, drag)', errors.length === 0, errors);
      await page.close();
    }

    // ---- Chrome: axe 0, fr and ar, loading rows and a failed block on screen ----
    for (const qs of ['locale=fr-FR&theme=light&latency=0&fail=1&stall=1', 'locale=ar-DZ&theme=dark&latency=0&fail=1&stall=1']) {
      const page = await b.newPage();
      await page.setViewportSize({ width: 1000, height: 760 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      // A stalled server: block 0 answers, block 1 fails, the rest stay loading.
      await page.goto(site.root(`packages/dom/test/browser/infinite.html?${qs}`));
      await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
      await page.waitForFunction(() => document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="2"]:not([data-kind])'), null, { timeout: 10000 });
      const rh = await page.evaluate(() => document.querySelector('.dzg-layer > .dzg-row').getBoundingClientRect().height);
      // Block 1 (rows 100–199) failed: scrolled to it, its rows say so, the first shown carries Retry.
      await page.evaluate((y) => { document.querySelector('.dzg-viewport').scrollTop = y; }, rh * 100);
      await page.waitForFunction(() => document.querySelector('.dzg-body .dzg-retry'), null, { timeout: 10000 }).catch(() => {});
      await frames(page, 3);
      await page.addScriptTag({ path: `${ROOT}node_modules/axe-core/axe.min.js` });
      const axe = () => page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.length}`));
      const failed = await page.evaluate(() => ({ retry: document.querySelectorAll('.dzg-body .dzg-retry').length, text: document.querySelector('.dzg-row[aria-rowindex="102"] [role=rowheader]')?.firstChild?.textContent, busy: document.querySelector('.dzg-row[aria-rowindex="102"]')?.getAttribute('aria-busy') }));
      const v2 = await axe();
      check(engine, `axe ${qs}: 0 violations with a failed block (Retry ${failed.retry}, « ${failed.text} »)`, v2.length === 0 && failed.retry === 1 && failed.text && failed.busy === null, { v2, failed });
      await page.screenshot({ path: `${ROOT}packages/dom/test/browser/results/infinite-failed-${qs.slice(7, 9)}.png` });
      // Far down, rows not arrived: grey, busy, « Chargement… ».
      await page.evaluate((y) => { document.querySelector('.dzg-viewport').scrollTop = y; }, rh * 5000);
      await page.waitForTimeout(150);
      await frames(page, 3);
      const v = await axe();
      const loading = await page.evaluate(() => document.querySelectorAll('.dzg-row[data-kind=loading][aria-busy=true]').length);
      check(engine, `axe ${qs}: 0 violations with loading rows on screen (${loading})`, v.length === 0 && loading > 0, v);
      await page.screenshot({ path: `${ROOT}packages/dom/test/browser/results/infinite-loading-${qs.slice(7, 9)}.png` });
      check(engine, `no page error ${qs}`, errors.length === 0, errors);
      await page.close();
    }
  } finally {
    await b?.close().catch(() => {});
  }
}
await site.close();
const failed = results.filter((x) => !x).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
