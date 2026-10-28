/**
 * The light « real app » check (Phase 6 close; docs/phase-6-steps/decisions.md « Back to Phase 6 »): the playground
 * page `real-app.html` — Tailwind 3's preflight unlayered, a teal and slate brand on the tokens, the unlayered theme,
 * comfort and print sheets, row boxes, set-filter pills, the inline period filter with `apply: 'button'`, the header
 * search boxes, the pager and its selection buttons, the ⋮ menu, the chooser — in Chrome, light and dark.
 *
 *   npm run test:real-app                 the checks and the screenshot comparisons
 *   npm run test:real-app -- --update     the same, and the reference screenshots written again (look at them first)
 *
 * Run at phase closes only, as part of the close gate (owner: the light version, for its cost). It starts its own
 * Vite on 127.0.0.1:4711 and stops it at the end (4700, the owner's playground, is never touched); DZG_PLAYGROUND=<url>
 * uses a running server instead. The page's clock is fixed (2026-10-28, Paris), so the calendar's month and today are
 * the references'. References: docs/screenshots/real-app/*.png, compared pixel by pixel in the browser (a channel
 * moved by more than 32 counts; at most 0.3 % of the pixels may differ: antialiasing, never a moved box). Results and
 * the failing captures go to packages/dom/test/browser/results/.
 *
 * Layout assertions, at 1 280 × 900 and 760 × 640: no horizontal overflow (page, grid, footer); square buttons in the
 * footer are the pager's only (« Sélectionner les N lignes » / « Effacer la sélection » wider than tall); one box per
 * row of the set filter (and its « Tout sélectionner »); every popup inside the viewport; focus inside each popup on
 * open, in « Du » for the period.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { browser } from '../spikes/kit.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REF = `${ROOT}docs/screenshots/real-app`;
const OUT = `${ROOT}packages/dom/test/browser/results`;
const UPDATE = process.argv.includes('--update');
const PORT = 4711;
mkdirSync(REF, { recursive: true });
mkdirSync(OUT, { recursive: true });

const checks = [];
const check = (label, ok, detail) => {
  checks.push({ label, ok: !!ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} chrome: ${label}${ok ? '' : `  ${JSON.stringify(detail).slice(0, 600)}`}`);
};

/** Our own Vite on 4711 (never 4700), or the server DZG_PLAYGROUND names. */
async function server() {
  if (process.env.DZG_PLAYGROUND) return { base: process.env.DZG_PLAYGROUND, stop: async () => {} };
  const vite = spawn(process.execPath, [`${ROOT}node_modules/vite/bin/vite.js`, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  vite.stdout.on('data', (d) => (log += d));
  vite.stderr.on('data', (d) => (log += d));
  const base = `http://127.0.0.1:${PORT}`;
  for (let i = 0; ; i++) {
    if (vite.exitCode !== null) throw new Error(`vite on ${PORT} did not start: ${log}`);
    if (await fetch(`${base}/real-app.html`).then((r) => r.ok, () => false)) break;
    if (i > 120) throw new Error(`vite on ${PORT}: no answer after 30 s`);
    await new Promise((r) => setTimeout(r, 250));
  }
  return { base, stop: () => new Promise((r) => (vite.once('exit', r), vite.kill('SIGTERM'), setTimeout(() => (vite.kill('SIGKILL'), r()), 3000))) };
}

const frames = (page, n = 3) => page.evaluate((k) => new Promise((r) => { let i = 0; const f = () => (++i >= k ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

/** The page's layout facts the assertions read. */
const layout = (page) => page.evaluate(() => {
  const de = document.documentElement;
  const vp = document.querySelector('.dzg-viewport');
  const f = document.querySelector('.dzg-footer');
  const box = (e) => { const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), name: e.getAttribute('data-go') ?? e.getAttribute('data-act') ?? e.textContent.trim() }; };
  const shown = (e) => !!e.offsetParent && e.getBoundingClientRect().width > 0;
  return {
    page: de.scrollWidth - de.clientWidth,
    grid: document.querySelector('.dzg').scrollWidth - document.querySelector('.dzg').clientWidth,
    footer: f.scrollWidth - f.clientWidth,
    viewport: { scroll: vp.scrollWidth, client: vp.clientWidth },
    buttons: [...f.querySelectorAll('button')].filter(shown).map(box),
  };
});

/** The open popup: inside the viewport, and whether the focus is in it. */
const popup = (page) => page.evaluate(() => {
  const p = [...document.querySelectorAll('.dzg-popup')].find((e) => e.matches(':popover-open') || getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0);
  if (!p) return null;
  const b = p.getBoundingClientRect();
  const W = document.documentElement.clientWidth;
  const H = document.documentElement.clientHeight;
  const ae = document.activeElement;
  return { inside: b.left >= -0.5 && b.top >= -0.5 && b.right <= W + 0.5 && b.bottom <= H + 0.5, rect: [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)], view: [W, H], focusIn: p.contains(ae), focus: ae?.getAttribute('aria-label') || ae?.textContent?.trim().slice(0, 30) || `${ae?.tagName.toLowerCase()}[type=${ae?.getAttribute('type')}]` };
});

/** Each row of the set filter (and « Tout sélectionner »): how many boxes a person sees in it. */
const boxesPerRow = (page) => page.evaluate(() => {
  const shown = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 2 && b.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
  const rows = [...document.querySelectorAll('.dzg-popup .dzg-fopt, .dzg-popup .dzg-fallw')];
  return rows.map((r) => [...r.querySelectorAll('input[type="checkbox"], [role="checkbox"], .dzg-box')].filter(shown).length);
});

/** Compares a capture with its reference in the page (canvas): the share of pixels where a channel moved by > 32. */
async function compare(ctx, name, png) {
  const ref = `${REF}/${name}.png`;
  writeFileSync(`${OUT}/real-app-${name}.png`, png);
  if (UPDATE || !existsSync(ref)) {
    writeFileSync(ref, png);
    check(`${name}: reference ${UPDATE ? 'written again' : 'written (none before)'}`, true);
    return;
  }
  const page = await ctx.newPage();
  try {
    const r = await page.evaluate(async ([a, b]) => {
      const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
      const [x, y] = await Promise.all([load(a), load(b)]);
      if (x.width !== y.width || x.height !== y.height) return { size: [x.width, x.height, y.width, y.height] };
      const px = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
      const p = px(x);
      const q = px(y);
      let diff = 0;
      for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) > 32 || Math.abs(p[i + 1] - q[i + 1]) > 32 || Math.abs(p[i + 2] - q[i + 2]) > 32) diff++;
      return { diff, total: p.length / 4 };
    }, [`data:image/png;base64,${png.toString('base64')}`, `data:image/png;base64,${readFileSync(ref).toString('base64')}`]);
    const share = r.size ? 1 : r.diff / r.total;
    check(`${name}: the screenshot matches its reference (${r.size ? `size ${r.size.join('×')}` : `${r.diff} px differ, ${(share * 100).toFixed(3)} %`})`, share <= 0.003, r);
  } finally {
    await page.close();
  }
}

async function run(ctx, base, theme, width, height) {
  const tag = `${theme} ${width}×${height}`;
  const shots = width === 1280;
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height });
  await page.clock.setFixedTime(new Date('2026-10-28T10:00:00Z'));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${base}/real-app.html?theme=${theme}`);
  await page.waitForSelector('.dzg-layer > .dzg-row .dzg-cell', { timeout: 30000 });
  await frames(page);
  // Two rows ticked by their boxes, then the page by the header's box: the footer shows its two selection buttons
  // (« Sélectionner les 1 604 lignes » is offered once the whole page is ticked).
  for (const i of [0, 1]) await page.click(`.dzg-layer > .dzg-row[aria-rowindex="${i + 2}"] .dzg-box`);
  await page.click('.dzg-hrow .dzg-box');
  await frames(page);
  const L = await layout(page);
  check(`${tag}: no horizontal overflow (page ${L.page}, grid ${L.grid}, footer ${L.footer})`, L.page <= 0 && L.grid <= 0 && L.footer <= 0, L);
  const pager = L.buttons.filter((b) => ['first', 'prev', 'next', 'last'].includes(b.name));
  const others = L.buttons.filter((b) => !pager.includes(b));
  check(`${tag}: square buttons in the footer are the pager's only (${pager.map((b) => `${b.w}×${b.h}`).join(' ')} | ${others.map((b) => `${b.w}×${b.h}`).join(' ')})`,
    pager.length === 4 && pager.every((b) => b.w === b.h && b.w === 32) && others.length === 2 && others.every((b) => b.w > b.h + 8), L.buttons);
  if (shots) await compare(ctx, `${theme}-grid`, await page.screenshot({ caret: 'hide', animations: 'disabled' }));

  // The set filter with pills.
  await page.click('.dzg-hcell[data-col="source"] .dzg-fbtn');
  await page.waitForSelector('.dzg-popup .dzg-fopt', { timeout: 10000 });
  await frames(page);
  const set = await popup(page);
  const per = await boxesPerRow(page);
  check(`${tag}: set filter inside the viewport ${JSON.stringify(set?.rect)} in ${JSON.stringify(set?.view)}`, set?.inside, set);
  check(`${tag}: set filter, the focus in it on open (${set?.focus})`, set?.focusIn, set);
  check(`${tag}: set filter, one box per row (${per.join(' ')})`, per.length === 4 && per.every((n) => n === 1), per);
  if (shots) await compare(ctx, `${theme}-set`, await page.screenshot({ caret: 'hide', animations: 'disabled' }));
  await page.keyboard.press('Escape');
  await frames(page);

  // The inline period (FROM / TO and one month) with « Appliquer ».
  await page.click('.dzg-hcell[data-col="updatedAt"] .dzg-fbtn');
  await page.waitForSelector('.dzg-popup .tz-dateinput__input', { timeout: 15000 });
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Du', null, { timeout: 5000 }).catch(() => {});
  await frames(page);
  const per2 = await popup(page);
  const apply = await page.evaluate(() => [...document.querySelectorAll('.dzg-popup .dzg-fapply')].filter((b) => b.offsetParent).length);
  check(`${tag}: period filter inside the viewport ${JSON.stringify(per2?.rect)}`, per2?.inside, per2);
  check(`${tag}: period filter, the focus in « Du » on open (${per2?.focus})`, per2?.focusIn && per2.focus === 'Du', per2);
  check(`${tag}: period filter, one « Appliquer » button (apply: 'button')`, apply === 1, apply);
  if (shots) await compare(ctx, `${theme}-period`, await page.screenshot({ caret: 'hide', animations: 'disabled' }));
  await page.keyboard.press('Escape');
  await frames(page);

  // The ⋮ menu on « Marque ».
  await page.hover('.dzg-hcell[data-col="brand"]');
  await page.click('.dzg-hcell[data-col="brand"] .dzg-mbtn');
  await page.waitForSelector('.dzg-popup [role="menu"], .dzg-popup[role="menu"], [role="menu"]', { timeout: 10000 });
  await frames(page);
  const menu = await popup(page);
  check(`${tag}: ⋮ menu inside the viewport ${JSON.stringify(menu?.rect)}`, menu?.inside, menu);
  check(`${tag}: ⋮ menu, the focus in it on open (${menu?.focus})`, menu?.focusIn, menu);
  await page.keyboard.press('Escape');
  await frames(page);

  // The chooser from the app's « Colonnes » button.
  await page.click('#cols');
  await page.waitForSelector('.dzg-popup input[type="search"]', { timeout: 10000 });
  await frames(page);
  const ch = await popup(page);
  check(`${tag}: chooser inside the viewport ${JSON.stringify(ch?.rect)}`, ch?.inside, ch);
  check(`${tag}: chooser, the focus in it on open (${ch?.focus})`, ch?.focusIn, ch);
  await page.keyboard.press('Escape');
  check(`${tag}: no page error`, errors.length === 0, errors);
  await page.close();
}

const site = await server();
let chrome = null;
try {
  chrome = await browser('chrome');
  const ctx = await chrome.newContext({ deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce' });
  for (const theme of ['light', 'dark']) for (const [w, h] of [[1280, 900], [760, 640]]) await run(ctx, site.base, theme, w, h);
} catch (e) {
  check(`the run itself: ${e.message}`, false, String(e.stack).slice(0, 400));
} finally {
  await chrome?.close().catch(() => {});
  await site.stop();
}
const failed = checks.filter((c) => !c.ok);
console.log(`\nreal app: ${checks.length - failed.length} / ${checks.length} ok`);
if (failed.length) process.exitCode = 1;
