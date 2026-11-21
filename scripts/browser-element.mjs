/**
 * `<dz-grid>` in real Chrome, Firefox and WebKit (Phase 11 L7; all three engines since 1.15.0,
 * docs/behaviors/web-component.md): `node scripts/browser-element.mjs [chrome|firefox|webkit…]` (all three by default).
 * The page `packages/element/test/browser/element.html` (a plain HTML page, three elements: a tree, a pivot, a form), in
 * French light and Arabic dark: both grids drawn in the page (no shadow root), the theme's look reached (its
 * header colour), the attributes read (density, row height, label, locale), the tree opened by a click on its
 * toggle and the pivot's month columns; `dzg-ready`, `dzg-row-expanded` and `dzg-sort-changed` heard as DOM events;
 * right to left from the page's `dir`; the element removed then put back draws again; axe 0. The form (1.12–1.15):
 * a cell drawn by a part (a function), `header-height`, properties changed live (one update, the grid kept),
 * `focus-visible="keyboard"` (the ring follows the last gesture), a cell kept pending by batch editing
 * (`dzg-pending-change`, nothing saved), `headers="none"` set live. One browser at a time, closed in finally; one page
 * at a time. Then the framework smoke page (`smoke.html`): `<dz-grid>` from the built packages (`npm run build` first),
 * no framework, no bundler — drawn, sorted by a click, axe 0.
 */
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { serve, browser } from '../spikes/kit.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const results = [];
const ENGINES = process.argv.slice(2).length ? process.argv.slice(2) : ['chrome', 'firefox', 'webkit'];
let engine = '';
const check = (label, ok, detail) => {
  results.push(!!ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${engine}: ${label}${ok ? '' : `  ${JSON.stringify(detail ?? null).slice(0, 900)}`}`);
};
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

const site = await serve(new URL('../packages/element/test/browser/element.html', import.meta.url).href);
try {
for (engine of ENGINES) {
const b = await browser(engine);
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
      check(`${tag}: both grids drawn in the page (no shadow root, display contents), ${dir}, labelled, 360 px from the page's rule, the theme's border inside (1.11.0: border-box; before, 362)`,
        [drawn.tree, drawn.pivot].every((g) => !g.shadow && g.display === 'contents' && g.rows > 0 && g.dir === dir && Math.round(g.height) === 360) && drawn.tree.label === (ar ? 'المصالح' : 'Services') && drawn.pivot.label === (ar ? 'المبيعات' : 'Ventes'), drawn);
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
      check(`${tag}: the tree opened by a click (${before} → ${after} rows); dzg-ready ×3, dzg-row-expanded, dzg-sort-changed heard`,
        after === before + 30 && heard.filter((h) => h.endsWith('dzg-ready')).length === 3 && heard.includes('tree:dzg-row-expanded') && heard.includes('tree:dzg-sort-changed'), { before, after, heard });

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

      // The form: a part draws the id cells; the header row 44 px from `header-height`.
      const form = await page.evaluate(() => {
        const el = window.t.form;
        return { badges: [...el.querySelectorAll('.dzg-cell[data-col="id"] b.badge')].map((b) => b.textContent).slice(0, 3), head: el.querySelector('.dzg-header .dzg-hrow')?.getBoundingClientRect().height };
      });
      check(`${tag}: the form's id cells drawn by a part (a function), its header row 44 px from header-height`,
        ['#i0', '#i1', '#i2'].every((x) => form.badges.includes(x)) && Math.round(form.head) === 44, form);

      // Properties set live: new columns (a header renamed) and new rows, one update each, the same grid kept.
      const live = await page.evaluate(async () => {
        const el = window.t.form;
        const grid = el.grid;
        el.columns = el.columns.map((c) => (c.id === 'name' ? { ...c, header: 'Libellé' } : c));
        el.rows = [...el.rows, { id: 'i12', name: 'Article 12', qty: 36 }];
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return { same: el.grid === grid, head: el.querySelector('.dzg-hcell[data-col="name"]')?.textContent.trim(), count: el.grid.kernel.rows.displayed.count };
      });
      check(`${tag}: properties changed live (columns, rows): the same grid updated (« ${live.head} », ${live.count} rows)`, live.same && live.head?.includes('Libellé') && live.count === 13, live);

      // focus-visible="keyboard": the ring's mark follows the last gesture (keys at first, pointer after a click).
      const ring = () => page.evaluate(() => window.t.form.querySelector('.dzg').getAttribute('data-dzg-ring'));
      const ring0 = await ring();
      const cellOf = (id, col) => `#form .dzg-layer > .dzg-row:has(b.badge:text-is("#${id}")) .dzg-cell[data-col="${col}"]`;
      await page.click(cellOf('i2', 'qty'));
      await frames(page, 2);
      const ring1 = await ring();
      await page.keyboard.press('ArrowUp');
      await frames(page, 2);
      const ring2 = await ring();
      check(`${tag}: focus-visible="keyboard": ring ${ring0} → ${ring1} (a click) → ${ring2} (a key)`, ring0 === 'keys' && ring1 === 'pointer' && ring2 === 'keys', { ring0, ring1, ring2 });

      // Batch editing (1.15.0): a cell typed and kept by Enter stays pending; dzg-pending-change heard, nothing saved.
      await page.click(cellOf('i2', 'qty'));
      await page.keyboard.press('F2');
      await frames(page, 2);
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type('42');
      const typed = await page.evaluate(() => (document.activeElement instanceof HTMLInputElement ? document.activeElement.value : null));
      await page.keyboard.press('Enter');
      await frames(page, 3);
      const pend = await page.evaluate(() => {
        const ev = window.t.heard.filter((h) => h === 'form:dzg-pending-change').length;
        const row = [...window.t.form.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => r.querySelector('b.badge')?.textContent === '#i2');
        const cell = row?.querySelector('.dzg-cell[data-col="qty"]');
        return { ev, count: window.t.batch().count, saves: window.t.saves.length, text: cell?.textContent.trim(), unsaved: cell?.classList.contains('dzg-cell--unsaved') };
      });
      check(`${tag}: batch editing: 42 kept pending (dzg-pending-change ×${pend.ev}, count ${pend.count}, nothing saved, cell marked)`,
        typed === '42' && pend.ev === 1 && pend.count === 1 && pend.saves === 0 && pend.text === '42' && pend.unsaved, { typed, ...pend });

      // headers="none" set live: the header rows out of the flow and clipped; the body moves up by the header's height.
      const bare = await page.evaluate(async () => {
        const el = window.t.form;
        const top = () => el.querySelector('.dzg-layer > .dzg-row').getBoundingClientRect().top - el.querySelector('.dzg').getBoundingClientRect().top;
        const was = top();
        el.setAttribute('headers', 'none');
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const h = getComputedStyle(el.querySelector('.dzg-header .dzg-hrow'));
        return { was, now: top(), position: h.position, clip: h.clipPath };
      });
      check(`${tag}: headers="none" set live: header rows clipped out of the flow, body up ${Math.round(bare.was - bare.now)} px`,
        bare.position === 'absolute' && bare.clip.includes('inset(50%') && Math.round(bare.was - bare.now) === 44, bare);

      await page.addScriptTag({ path: `${ROOT}node_modules/axe-core/axe.min.js` });
      const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.length} (${x.nodes[0]?.target?.join(' ')})`));
      check(`${tag}: axe 0`, v.length === 0, v);
      check(`${tag}: no page error`, errors.length === 0, errors);
    } finally {
      await page.close();
    }
  }
  // The framework smoke page: the built packages, one import map, no framework.
  const page = await b.newPage();
  try {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    if (!existsSync(`${ROOT}packages/element/dist/define.js`)) throw new Error('smoke page: run `npm run build` first');
    await page.goto(site.url('smoke.html'));
    await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
    await page.click('#g .dzg-header .dzg-hcell[data-col="kg"]');
    await frames(page, 2);
    const smoke = await page.evaluate(() => ({ rows: document.querySelectorAll('#g .dzg-layer > .dzg-row').length, heard: window.heard }));
    await page.addScriptTag({ path: `${ROOT}node_modules/axe-core/axe.min.js` });
    const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.length}`));
    check(`smoke page (built packages, no framework): 5 rows drawn, dzg-ready and dzg-sort-changed heard, axe 0, no page error`,
      smoke.rows === 5 && smoke.heard.join() === 'dzg-ready,dzg-sort-changed' && v.length === 0 && errors.length === 0, { ...smoke, v, errors });
  } finally {
    await page.close();
  }
} finally {
  await b.close();
}
}
} finally {
  await site.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} / ${results.length} passed`);
process.exit(failed ? 1 : 0);
