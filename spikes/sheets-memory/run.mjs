// node spikes/sheets-memory/run.mjs — heap and switch time, 10 sheets × 10 000 rows: one grid swapping vs one per sheet.
// Parked (owner, 2026-11-10: too heavy): the sheets plan is kept, nothing of it is built.
import { serve, browser, record, median } from '../kit.mjs';
const site = await serve(import.meta.url, { minify: true });
const out = {};
for (const mode of ['data', 'one', 'many']) {
  const b = await browser('chrome');
  try {
    const page = await b.newPage();
    await page.setViewportSize({ width: 1000, height: 700 });
    page.on('pageerror', (e) => console.error('pageerror', e.message)); page.on('console', (m) => m.type() === 'error' && console.error(m.text()));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await page.goto(site.url(`index.html?mode=${mode === 'data' ? 'one' : mode}`));
    await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
    const heap = async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
      return { mb: +(m.JSHeapUsedSize / 1048576).toFixed(1), nodes: m.Nodes };
    };
    if (mode === 'data') { out.data = await heap(); continue; }
    const first = [];
    for (let s = 1; s < 10; s++) first.push(await page.evaluate((s) => window.timed(s), s));
    await page.evaluate(() => window.scrollTo(12000));
    const kept = await page.evaluate(() => window.topOf());
    const again = [];
    for (let round = 0; round < 3; round++) for (let s = 0; s < 10; s++) again.push(await page.evaluate((s) => window.timed(s), (s + 0) % 10));
    const back = await page.evaluate(() => window.topOf());
    out[mode] = { ...(await heap()), firstOpenMs: +median(first).toFixed(1), switchMs: +median(again).toFixed(1), switchMaxMs: +Math.max(...again).toFixed(1), scrollKept: kept === back ? kept : `${kept} → ${back}` };
  } finally { await b.close(); }
}
await site.close();
record(import.meta.url, out);
