/**
 * `<dz-grid>` in real Chrome (Phase 11 L7, docs/behaviors/web-component.md): `node scripts/browser-element.mjs`.
 * The page `packages/element/test/browser/element.html` (a plain HTML page, two elements: a tree and a pivot), in
 * French light and Arabic dark: both grids drawn in the page (no shadow root), the theme's look reached (its
 * header colour), the attributes read (density, row height, label, locale), the tree opened by a click on its
 * toggle and the pivot's month columns; `dzg-ready`, `dzg-row-expanded` and `dzg-sort-changed` heard as DOM events;
 * right to left from the page's `dir`; the element removed then put back draws again; axe 0. One browser, closed in
 * finally; one page at a time.
 */
import { fileURLToPath } from 'node:url';
import { serve, browser } from '../spikes/kit.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const results = [];
const check = (label, ok, detail) => {
  results.push(!!ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} chrome: ${label}${ok ? '' : `  ${JSON.stringify(detail ?? null).slice(0, 900)}`}`);
};
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

const site = await serve(new URL('../packages/element/test/browser/element.html', import.meta.url).href);
const b = await browser('chrome');
try {
  for (const [tag, qs, ar] of [['fr', 'locale=fr-FR&theme=light', false], ['ar', 'locale=ar-DZ&theme=dark', true]]) {
    const page = await b.newPage();
    try {
      await page.setViewportSize({ width: 1200, height: 1000 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(site.url(`element.html?${qs}`));
      await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
      await frames(page, 3);

      const drawn = await page.evaluate(() => {
        const one = (id) => {
          const el = document.getElementById(id);
          const vp = el.querySelector(':scope > .dzg > .dzg-viewport');
          return { shadow: el.shadowRoot !== null, display: getComputedStyle(el).display, rows: el.querySelectorAll('.dzg-layer > .dzg-row').length, label: vp?.getAttribute('aria-label'), dir: el.querySelector('.dzg').getAttribute('dir'), height: el.querySelector('.dzg').getBoundingClientRect().height, rowH: el.querySelector('.dzg-layer > .dzg-row')?.getBoundingClientRect().height, header: getComputedStyle(el.querySelector('.dzg-header')).backgroundColor };
        };
        return { tree: one('tree'), pivot: one('pivot'), plain: getComputedStyle(document.body).backgroundColor };
      });
      const dir = ar ? 'rtl' : 'ltr';
      check(`${tag}: both grids drawn in the page (no shadow root, display contents), ${dir}, labelled, 360 px from the page's rule + the theme's 1 px border each side`,
        [drawn.tree, drawn.pivot].every((g) => !g.shadow && g.display === 'contents' && g.rows > 0 && g.dir === dir && Math.round(g.height) === 362) && drawn.tree.label === (ar ? 'المصالح' : 'Services') && drawn.pivot.label === (ar ? 'المبيعات' : 'Ventes'), drawn);
      check(`${tag}: the theme reached the grids (header colour set, not transparent)`, drawn.tree.header !== 'rgba(0, 0, 0, 0)' && drawn.tree.header === drawn.pivot.header, drawn);
      check(`${tag}: attributes read: compact rows (28 px) in the tree, row-height 36 in the pivot`, Math.round(drawn.tree.rowH) === 28 && Math.round(drawn.pivot.rowH) === 36, drawn);

      // The pivot: one column per month, totals in the locale's digits (both latn by default).
      const heads = await page.evaluate(() => [...document.querySelectorAll('#pivot .dzg-header .dzg-hcell[data-col]')].map((h) => h.textContent.trim()).filter(Boolean));
      check(`${tag}: the pivot's headers name its four months (${heads.length} headers)`, ['01', '02', '03', '04'].every((m) => heads.some((h) => h.includes(m))), heads);

      // The tree: a click on the first service's toggle opens it; dzg-row-expanded heard on the element.
      const before = await page.evaluate(() => window.t.tree.grid.kernel.rows.displayed.count);
      await page.click('#tree .dzg-layer > .dzg-row .dzg-toggle, #tree .dzg-layer > .dzg-row [aria-expanded]');
      await frames(page, 3);
      const after = await page.evaluate(() => window.t.tree.grid.kernel.rows.displayed.count);
      // A sort by a click on the « Âge » header.
      await page.click('#tree .dzg-header .dzg-hcell[data-col="age"]');
      await frames(page, 2);
      const heard = await page.evaluate(() => window.t.heard);
      check(`${tag}: the tree opened by a click (${before} → ${after} rows); dzg-ready ×2, dzg-row-expanded, dzg-sort-changed heard`,
        after === before + 30 && heard.filter((h) => h.endsWith('dzg-ready')).length === 2 && heard.includes('tree:dzg-row-expanded') && heard.includes('tree:dzg-sort-changed'), { before, after, heard });

      // Removed, then put back: drawn again.
      const again = await page.evaluate(async () => {
        const el = window.t.pivot;
        const box = el.parentElement;
        el.remove();
        await Promise.resolve();
        const gone = el.grid === null && el.querySelector('.dzg') === null;
        box.append(el);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return { gone, back: el.querySelectorAll('.dzg-layer > .dzg-row').length };
      });
      check(`${tag}: the pivot removed (grid gone), put back (drawn again, ${again.back} rows)`, again.gone && again.back > 0, again);

      await page.addScriptTag({ path: `${ROOT}node_modules/axe-core/axe.min.js` });
      const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.length} (${x.nodes[0]?.target?.join(' ')})`));
      check(`${tag}: axe 0`, v.length === 0, v);
      check(`${tag}: no page error`, errors.length === 0, errors);
    } finally {
      await page.close();
    }
  }
} finally {
  await b.close();
  await site.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} / ${results.length} passed`);
process.exit(failed ? 1 : 0);
