/**
 * 1.9.0 lot B in real browsers (docs/behaviors/responsive-columns.md, file-import.md): `node scripts/browser-lot-b.mjs`.
 * Page `packages/dom/test/browser/lot-b.html`. Chrome in French and Arabic at 1200, 600 and 360 px with axe; Firefox and
 * WebKit once at 360 px; one real drop of a file in Chrome (an Excel file the grid exported, inflated by the browser).
 * One browser at a time, closed in finally.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { serve, browser } from '../spikes/kit.mjs';

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const results = [];
const check = (b, label, ok, detail) => {
  results.push(!!ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${b}: ${label}  ${ok ? '' : JSON.stringify(detail ?? null).slice(0, 700)}`);
};
const site = await serve(new URL('../packages/dom/test/browser/lot-b.html', import.meta.url).href);
const SHOTS = process.env.SHOTS;
const open = async (b, lang, width) => {
  const page = await b.newPage();
  await page.setViewportSize({ width, height: 640 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(site.url(`lot-b.html?lang=${lang}`));
  await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
  await settle(page);
  return { page, errors };
};
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
const state = (page) => page.evaluate(() => {
  const vp = document.querySelector('.dzg-viewport');
  const first = document.querySelector('.dzg-layer > .dzg-row');
  const t = first.querySelector('.dzg-toggle');
  return {
    heads: [...document.querySelectorAll('.dzg-hcell[data-col]')].map((c) => c.getAttribute('data-col')),
    sideways: vp.scrollWidth - vp.clientWidth,
    chevron: !!t && getComputedStyle(t).display !== 'none' && t.getBoundingClientRect().width > 0,
    expanded: first.querySelector('[aria-expanded]')?.getAttribute('aria-expanded') ?? null,
  };
});

async function widths(name, b, lang, sizes, axe) {
  for (const w of sizes) {
    const { page, errors } = await open(b, lang, w);
    const tag = `${lang} ${w}px`;
    const s = await state(page);
    if (w >= 1200) check(name, `${tag}: every column, no chevron, no sideways scroll`, s.heads.length === 6 && !s.chevron && s.expanded === null && s.sideways <= 1, s);
    else {
      check(name, `${tag}: columns collapsed (stock never, seed first), a chevron, no sideways scroll`, s.heads.length < 6 && s.heads[0] === 'seed' && s.heads.includes('stock') && s.chevron && s.expanded === 'false' && s.sideways <= 1, s);
      // The chevron clicked: the row's lines under it, « Title: value », as many as the columns gone.
      await page.click('.dzg-layer > .dzg-row .dzg-toggle');
      await settle(page);
      const p = await page.evaluate(() => {
        const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, h: r.height }; };
        const body = document.querySelector('.dzg-dbody');
        const lines = [...body.querySelectorAll('dl.dzg-rlines > div')];
        const dt = lines[0].querySelector('dt');
        const dd = lines[0].querySelector('dd');
        const row = document.querySelector('.dzg-layer > .dzg-row');
        return {
          n: lines.length, heads: document.querySelectorAll('.dzg-hcell[data-col]').length, name: body.getAttribute('aria-label'), h: R(body).h, dt: R(dt), dd: R(dd),
          colon: getComputedStyle(dt, '::after').content, row: R(row), panel: R(body.closest('.dzg-row')),
          expanded: row.querySelector('[aria-expanded]').getAttribute('aria-expanded'),
          texts: lines.map((l) => `${l.querySelector('dt').textContent}=${l.querySelector('dd').textContent}`),
        };
      });
      const rtl = lang === 'ar';
      check(name, `${tag}: the lines under the row, one per column gone, named after the row`, p.n === 6 - p.heads && p.h > 20 && p.panel.t >= p.row.b - 1 && p.expanded === 'true' && /Détails de|تفاصيل/.test(p.name), p);
      check(name, `${tag}: title then value from the start side, the colon drawn`, (rtl ? p.dt.l > p.dd.l : p.dt.l < p.dd.l) && /:/.test(p.colon) && p.texts.every((t) => /=./.test(t) || /^[^=]+=$/.test(t)), p);
      // The keyboard: the first cell focused, Enter closes, Space opens.
      await page.evaluate(() => document.querySelector('.dzg-layer > .dzg-row [aria-expanded]').focus());
      await page.keyboard.press('Enter');
      await settle(page);
      const closed = await page.evaluate(() => document.querySelector('.dzg-layer > .dzg-row [aria-expanded]').getAttribute('aria-expanded'));
      await page.keyboard.press(' ');
      await settle(page);
      const opened = await page.evaluate(() => document.querySelector('.dzg-layer > .dzg-row [aria-expanded]').getAttribute('aria-expanded'));
      check(name, `${tag}: Enter closes, Space opens`, closed === 'false' && opened === 'true', { closed, opened });
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/responsive-${name}-${lang}-${w}.png` });
      // Wider again: everything back, the panel gone.
      await page.setViewportSize({ width: 1300, height: 640 });
      await settle(page);
      await settle(page);
      const back = await state(page);
      check(name, `${tag} → 1300px: every column back, no chevron, no panel`, back.heads.length === 6 && !back.chevron && !(await page.$('.dzg-dbody')), back);
      await page.setViewportSize({ width: w, height: 640 });
      await settle(page);
      await settle(page);
    }
    if (axe) {
      await page.addScriptTag({ content: AXE });
      const v = await page.evaluate(async () => (await window.axe.run(document.querySelector('main'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((x) => `${x.id}: ${x.nodes.length}`));
      check(name, `${tag}: axe finds nothing`, v.length === 0, v);
    }
    check(name, `${tag}: no page error, nothing told`, errors.length === 0 && (await page.evaluate(() => window.told.length)) === 0, { errors, told: await page.evaluate(() => window.told) });
    await page.close();
  }
}

async function drop(b) {
  const { page, errors } = await open(b, 'fr', 1200);
  // An Excel file of the grid's rows, made by its own export (deflated by the browser), then dropped on the grid.
  await page.evaluate(async () => { await window.exp.run('all', { format: 'xlsx' }); });
  await page.waitForFunction(() => window.files.length === 1);
  const zone = await page.evaluate(async () => {
    const root = document.querySelector('.dzg');
    const dt = (window.dt = new DataTransfer());
    dt.items.add(new File([window.files[0]], 'graines.xlsx'));
    root.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
    root.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    await new Promise((r) => requestAnimationFrame(r));
    const z = root.querySelector('.dzg-drop');
    const r = z.getBoundingClientRect();
    return { shown: root.hasAttribute('data-dzg-drop'), text: z.textContent, w: r.width, h: r.height, display: getComputedStyle(z).display, hidden: z.getAttribute('aria-hidden') };
  });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/import-drop.png` });
  zone.after = await page.evaluate(() => {
    const root = document.querySelector('.dzg');
    root.dispatchEvent(new DragEvent('drop', { dataTransfer: window.dt, bubbles: true, cancelable: true }));
    return root.hasAttribute('data-dzg-drop');
  });
  check('chrome', 'drop: the zone over the grid while a file is over it, its words, hidden from the tree, gone on drop', zone.shown && zone.display === 'flex' && zone.w > 300 && /Déposez/.test(zone.text) && zone.hidden === 'true' && !zone.after, zone);
  await page.waitForFunction(() => window.got.length === 1, null, { timeout: 10000 });
  const got = await page.evaluate(() => ({ ...window.got[0], first: window.got[0].rows[0], n: window.got[0].rows.length, count: window.grid.kernel.rows.displayed.count }));
  check('chrome', 'drop: the exported .xlsx read back, 120 rows, values typed, no problem, the grid untouched', got.format === 'xlsx' && got.n === 120 && got.problems.length === 0 && got.first.seed === 'Basilic 0' && got.first.grams === 0.5 && got.first.sown === '2026-01-10' && got.first.stock === 0 && got.count === 120, got);
  check('chrome', 'drop: no page error', errors.length === 0, errors);
  await page.close();
}

let b;
try {
  b = await browser('chrome');
  for (const lang of ['fr', 'ar']) await widths('chrome', b, lang, [1200, 600, 360], true);
  await drop(b);
  await b.close();
  for (const name of ['firefox', 'webkit']) {
    b = await browser(name);
    await widths(name, b, 'fr', [360], false);
    await b.close();
  }
  b = null;
} finally {
  await b?.close().catch(() => {});
  await site.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} / ${results.length}`);
process.exit(failed ? 1 : 0);
