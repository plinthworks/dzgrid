// S13 — tzslot 2.2.0 in DzGrid's top-layer popup (step 14 part B). Chrome only (one browser), closed in finally.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { serve, browser, record } from '../kit.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
// tzslot bundled once for the page (two entries, one shared copy of the core and its Temporal).
await build({ entryPoints: { dom: '@tzslot/dom', core: '@tzslot/core' }, bundle: true, splitting: true, format: 'esm', outdir: `${here}build`, absWorkingDir: `${here}../..`, logLevel: 'error' });
const site = await serve(import.meta.url);
const checks = [], observations = [];
const engines = (process.env.BROWSERS ?? 'chrome').split(',');
let open = null;
const check = (engine, label, ok, detail) => { checks.push({ engine, label, ok: !!ok, ...(ok ? {} : { detail }) }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${engine}: ${label}${ok ? '' : ' ' + JSON.stringify(detail).slice(0, 400)}`); };
const observe = (engine, label, value) => { observations.push({ engine, label, value }); console.log(`obs  ${engine}: ${label}: ${JSON.stringify(value).slice(0, 400)}`); };
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

for (const name of engines) {
  const b = await browser(name);
  open = b;
  try {
    const ctx = await b.newContext();
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1000, height: 760 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(site.url('index.html'));
    await page.waitForFunction(() => window.ready, null, { timeout: 15000 }).catch((e) => { console.log(errors); throw e; });
    const S = () => page.evaluate(() => window.state());
    // The date and the range fields focus inside their panel; the typed moment keeps its text: ArrowDown twice walks in.
    const openPanel = async (kind) => {
      if (kind === 'moment') { await page.focus('.dzg-fdate input'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); }
      else await page.evaluate(() => window.field.open());
      await frames(page);
    };

    for (const kind of ['date', 'range', 'moment']) {
      for (const where of ['card', 'dialog']) {
        const info = await page.evaluate(([k, d]) => window.openWith(k, { guard: true, dialog: d === 'dialog' }), [kind, where]);
        if (kind === 'date' && where === 'card') observe(name, 'Temporal', { usingPolyfill: info.usingPolyfill });
        await openPanel(kind);
        const s = await S();
        check(name, `${kind} in ${where}: popup in the top layer, panel inside it and on top under the pointer`, info.topLayer && s.panelInPopup && s.hitInPanel, { info, s });
        check(name, `${kind} in ${where}: the panel sits under its trigger, above it, or held at the window's edge (within 12 px), focus inside it`, s.panelRect && s.trig && (Math.abs(s.panelRect.t - s.trig.b) <= 12 || Math.abs(s.panelRect.t + s.panelRect.h - s.trig.t) <= 12 || s.panelRect.t === 8) && s.activeInPanel, s);
        observe(name, `${kind} in ${where}: placement`, { panel: s.panelRect, trigger: s.trig });
        // Escape with our capture rule: the panel closes, the popup stays; the second closes the popup.
        await page.keyboard.press('Escape');
        await frames(page);
        const e1 = await S();
        await page.keyboard.press('Escape');
        await frames(page);
        const e2 = await S();
        check(name, `${kind} in ${where}: Escape closes the panel only (focus back in the popup), a second one the popup`, !e1.panelOpen && e1.popupOpen && e1.activeInPopup && !e2.popupOpen, { e1, e2 });
        await page.evaluate(() => window.closeAll());
      }
      // Without the rule: the popup's own Escape (bubbling, stopPropagation) hides it from tzslot's document listener.
      await page.evaluate((k) => window.openWith(k, { guard: false }), kind);
      await page.evaluate(() => window.field.open());
      await frames(page);
      await page.keyboard.press('Escape');
      await frames(page);
      const raw = await S();
      observe(name, `${kind} without the capture rule, Escape with the panel open`, { popupOpen: raw.popupOpen, panelLeft: raw.panelOpen });
      await page.evaluate(() => window.closeAll());
      // Tab inside an open panel: tzslot's trap; the focus never leaves the panel.
      await page.evaluate((k) => window.openWith(k, { guard: true }), kind);
      await openPanel(kind);
      let left = 0;
      for (let i = 0; i < 25; i++) { await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab'); if (!(await S()).activeInPanel) left++; }
      for (let i = 0; i < 15; i++) { await page.keyboard.press('Tab'); if (!(await S()).activeInPanel) left++; }
      check(name, `${kind}: Tab and Shift+Tab stay inside the open panel`, left === 0, left);
      await page.evaluate(() => window.closeAll());
    }

    // Right to left: the panel right-aligned on its trigger.
    await page.evaluate(() => window.openWith('date', { guard: true, dir: 'rtl', locale: 'ar-DZ-u-ca-gregory-nu-latn' }));
    await page.evaluate(() => window.field.open());
    await frames(page, 3);
    const rtl = await S();
    check(name, 'rtl: the panel reads right to left, its right edge on the trigger’s (within 12 px)', rtl.panelDir === 'rtl' && Math.abs(rtl.panelRect.l + rtl.panelRect.w - rtl.trig.r) <= 12, rtl);
    observe(name, 'ar-DZ latn trigger text', rtl.trigText);
    await page.evaluate(() => window.closeAll());
    for (const tag of ['ar-SA-u-ca-gregory-nu-latn', 'ar-EG-u-ca-gregory-nu-arab', 'ar-SA']) {
      await page.evaluate((l) => window.openWith('date', { guard: true, locale: l, dir: 'rtl' }), tag);
      observe(name, `trigger text for ${tag}`, (await S()).trigText);
      await page.evaluate(() => window.closeAll());
    }
    observe(name, 'styles injected by default (data-tzslot ids)', (await S()).styles);

    // An aborted chunk, then the same import again (Retry): does the engine fetch it again?
    let n = 0;
    await page.route('**/spikes/s13-tzslot/chunk.ts', (route) => (n++ === 0 ? route.abort('failed') : route.continue()));
    const url = site.url('chunk.ts');
    const first = await page.evaluate((u) => window.dyn(u), url);
    const second = await page.evaluate((u) => window.dyn(u), url);
    observe(name, 'aborted chunk then the same import()', { first, second, fetches: n });
    const busted = await page.evaluate((u) => window.dyn(u + '?retry=1'), url);
    observe(name, 'the same chunk with a new query', busted);
    check(name, 'no page error', errors.length === 0, errors);
  } finally {
    await b.close();
    open = null;
  }
}
await site.close();
record(import.meta.url, { date: new Date().toISOString(), checks, observations, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length });
process.exit(checks.some((c) => !c.ok) ? 1 : 0);
