// S3: automatic row height in a virtualised list; visible jump while scrolling, three engines.
import { serve, browser, record } from '../kit.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const resultsDir = fileURLToPath(new URL('./results/', import.meta.url));
mkdirSync(resultsDir, { recursive: true });
const site = await serve(import.meta.url);
const only = process.env.S3_QUICK ? (c) => c.count === 10_000 : () => true; // S3_QUICK=1: 10 000 rows only
const configs = [
  { count: 10_000, mode: 'naive' },
  { count: 10_000, mode: 'read' },
  { count: 10_000, mode: 'ro' },
  { count: 100_000, mode: 'read' },
  { count: 100_000, mode: 'ro' },
  { count: 100_000, mode: 'read', place: 'inset' }, // transform against inset-block-start at ~4.8 M px
].filter(only);
const out = {};
for (const name of (process.env.S3_ENGINES ?? 'chrome,firefox,webkit').split(',')) {
  const b = await browser(name);
  const r = { version: b.version(), runs: [] };
  try {
  for (const cfg of configs) {
    const page = await b.newPage({ viewport: { width: 900, height: 700 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(site.url());
    await page.waitForFunction(() => window.ready, null, { timeout: 15000 });
    const res = await page.evaluate((c) => window.spike.run(c), cfg);
    res.errors = errors;
    r.runs.push(res);
    if (cfg.mode === 'read' && cfg.count === 10_000) {
      // a view of the list as it is after the run (re-created, scrolled up from the middle)
      await page.evaluate(async () => {
        const { AutoList } = await import('./autoheight.ts');
        const l = new AutoList(document.getElementById('host'), { count: 10000, mode: 'read', estimate: 48, overscan: 4, seed: 42 });
        l.viewport.scrollTop = l.sums.total / 2;
        for (let i = 0; i < 30; i++) { await new Promise((r) => requestAnimationFrame(r)); l.viewport.scrollTop -= 40; }
        for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
      });
      await page.screenshot({ path: `${resultsDir}${name}-read-10k.png`, fullPage: true, clip: { x: 0, y: 0, width: 460, height: 640 } });
    }
    await page.close();
  }
  } finally {
    await b.close(); // one browser at a time
  }
  out[name] = r;
}
await site.close();

const summary = {};
for (const [name, r] of Object.entries(out)) {
  summary[name] = { version: r.version };
  for (const x of r.runs) {
    const k = `${x.mode}-${x.count / 1000}k${x.place === 'inset' ? '-inset' : ''}`;
    const sc = ['downFromTop', 'upFromMiddle', 'upFromEnd', 'upToTop'];
    summary[name][k] = {
      ...Object.fromEntries(sc.map((s) => [s, `max ${x[s].maxJump}px p99 ${x[s].p99Jump}px >0.5px:${x[s].framesOver0_5px}/${x[s].frames} anchor ${x[s].maxAnchorJump}px blank:${x[s].framesWithBlank}(${x[s].maxBlankPx}px)`])),
      endReached_px: x.endReached, topReached: x.topReached, syncMs: x.syncMs, corrections: x.corrections, measured: x.measured,
      roLoopErrors: x.roLoopErrors, errors: x.errors,
    };
  }
}
record(import.meta.url, { summary, raw: out });
