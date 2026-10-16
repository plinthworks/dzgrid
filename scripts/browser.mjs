/**
 * The grid in a real browser: what jsdom cannot see. `npm run test:browser`
 * (Chrome; `-- --all` adds Firefox and WebKit for the RTL and focus checks).
 * One browser at a time, closed in finally. Screenshots go to
 * packages/dom/test/browser/results/ (gitignored), for a person to look at.
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve, browser } from '../spikes/kit.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}packages/dom/test/browser/results`;
mkdirSync(OUT, { recursive: true });
const engines = process.argv.includes('--all') ? ['chrome', 'firefox', 'webkit'] : ['chrome'];
const site = await serve(import.meta.url);
const checks = [];
let open = null;
process.on('SIGINT', async () => { await open?.close().catch(() => {}); await site.close(); process.exit(130); });

const check = (engine, label, ok, detail) => {
  checks.push({ engine, label, ok: !!ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${engine}: ${label}${ok ? '' : `  ${JSON.stringify(detail).slice(0, 500)}`}`);
};
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

async function load(ctx, qs = '') {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1000, height: 760 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(site.root(`packages/dom/test/browser/index.html?${qs}`));
  await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
  await frames(page, 3);
  return { page, errors };
}

async function axe(page) {
  await page.addScriptTag({ path: `${ROOT}node_modules/axe-core/axe.min.js` });
  return page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id}: ${v.nodes.length} (${v.nodes[0]?.target?.join(' ')})`);
  });
}

/** Header and body cells of each mounted column line up; pinned segments sit at their edges. */
const geometry = (page) => page.evaluate(() => {
  const vp = document.querySelector('.dzg-viewport');
  const v = vp.getBoundingClientRect();
  const rtl = getComputedStyle(vp).direction === 'rtl';
  const row = [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => { const b = r.getBoundingClientRect(); return b.top > v.top + 40 && b.bottom < v.bottom - 20; });
  let worst = 0;
  for (const cell of row.querySelectorAll('[data-col]')) {
    const h = document.querySelector(`.dzg-header .dzg-hcell[data-col="${cell.dataset.col}"]`);
    if (!h) return { missing: cell.dataset.col };
    const a = h.getBoundingClientRect(), b = cell.getBoundingClientRect();
    worst = Math.max(worst, Math.abs(a.left - b.left), Math.abs(a.right - b.right));
  }
  const inner = { left: v.left + vp.clientLeft, right: v.left + vp.clientLeft + vp.clientWidth };
  const s = row.querySelector('.dzg-seg-start').getBoundingClientRect();
  const e = row.querySelector('.dzg-seg-end').getBoundingClientRect();
  const startEdge = rtl ? Math.abs(s.right - inner.right) : Math.abs(s.left - inner.left);
  const endEdge = rtl ? Math.abs(e.left - inner.left) : Math.abs(e.right - inner.right);
  return { worst, startEdge, endEdge };
});

async function runEngine(name) {
  const b = await browser(name);
  open = b;
  try {
    const ctx = await b.newContext();

    // ---- axe, in fr and ar, light and dark, with selection, scrolled, and with each overlay ----
    if (name === 'chrome') {
      for (const qs of ['locale=fr-FR&theme=light', 'locale=ar-DZ&theme=dark', 'locale=fr-FR&theme=dark&box=1', 'locale=ar-DZ&theme=light&box=1&select=single']) {
        const { page, errors } = await load(ctx, qs);
        let v = await axe(page);
        check(name, `axe ${qs}: 0 violations at load`, v.length === 0, v);
        await page.evaluate(() => { window.t.scrollTo(5000 * 32); const k = window.t.key(10); window.t.grid.kernel.dispatch({ type: 'selection.toggle', row: k }, 'user'); });
        await frames(page);
        v = await axe(page);
        check(name, `axe ${qs}: 0 violations scrolled, selection active`, v.length === 0, v);
        for (const overlay of ['loading', 'error']) {
          await page.evaluate((o) => window.t.grid.update({ overlay: o }), overlay);
          await frames(page);
          v = await axe(page);
          const shown = await page.evaluate(() => { const o = document.querySelector('.dzg-overlay'); return { display: getComputedStyle(o).display, inGrid: !!o.closest('[role=grid]'), text: o.textContent }; });
          check(name, `axe ${qs}: 0 violations with the ${overlay} overlay, shown outside the grid`, v.length === 0 && shown.display !== 'none' && !shown.inGrid && shown.text, { v, shown });
        }
        await page.evaluate(() => window.t.grid.update({ overlay: null }));
        await frames(page);
        const hidden = await page.evaluate(() => getComputedStyle(document.querySelector('.dzg-overlay')).display);
        check(name, `${qs}: the overlay really hides (display none)`, hidden === 'none', hidden);
        await page.screenshot({ path: `${OUT}/${name}-${qs.replace(/[&=]/g, '_')}.png`, clip: { x: 0, y: 0, width: 1000, height: 640 } });
        check(name, `no page error ${qs}`, errors.length === 0, errors);
        await page.close();
      }
    }

    // ---- alignment and pinning, LTR and RTL, at three inline positions ----
    for (const dir of ['ltr', 'rtl']) {
      const { page } = await load(ctx, `locale=${dir === 'rtl' ? 'ar-DZ' : 'fr-FR'}&dir=${dir}`);
      const out = [];
      for (const at of [0, 0.5, 1]) {
        await page.evaluate((at) => {
          const vp = document.querySelector('.dzg-viewport');
          const max = vp.scrollWidth - vp.clientWidth;
          vp.scrollLeft = (getComputedStyle(vp).direction === 'rtl' ? -1 : 1) * max * at;
        }, at);
        await frames(page, 3);
        out.push(await geometry(page));
      }
      check(name, `${dir}: header and body aligned within 1 px, pinned segments at their edges, at start, middle and end`, out.every((m) => m.worst <= 1 && m.startEdge <= 1 && m.endEdge <= 1), out);
      await page.close();
    }

    // ---- aria-rowindex exact after scroll, and the retained row in the AX tree ----
    {
      const { page } = await load(ctx, 'rows=100000');
      await page.evaluate(() => window.t.grid.api.focusCell(window.t.key(42), 'city'));
      const res = [];
      for (const i of [0, 5000, 99990]) {
        await page.evaluate((i) => window.t.scrollTo(i * 32), i);
        await frames(page, 2);
        res.push(await page.evaluate(() => {
          const rows = [...document.querySelectorAll('.dzg-layer > .dzg-row')];
          const idx = rows.map((r) => Number(r.getAttribute('aria-rowindex')));
          // The model's index of each row, read from its first cell's text ("Patient 123").
          const exact = rows.every((r) => Number(r.querySelector('[data-col="name"]').textContent.replace(/\D/g, '')) + 2 === Number(r.getAttribute('aria-rowindex')));
          return { ordered: idx.every((x, k) => k === 0 || x > idx[k - 1]), exact, retained: idx.includes(44), focused: document.activeElement?.closest('.dzg-row')?.getAttribute('aria-rowindex') };
        }));
      }
      check(name, 'aria-rowindex exact and in DOM order after scrolling to 0, 5 000 and 99 990; the focused row retained', res.every((r) => r.ordered && r.exact && r.retained && r.focused === '44'), res);
      if (name === 'chrome') {
        const cdp = await ctx.newCDPSession(page);
        const { nodes } = await cdp.send('Accessibility.getFullAXTree');
        // Headless, the window itself has no focus, so the AX tree puts it on the page: the DOM
        // focus is checked above; here the retained row and its focused cell must be exposed.
        const header = nodes.find((n) => n.name?.value === 'Patient 42' && n.role?.value === 'rowheader');
        const row = header && nodes.find((n) => n.childIds?.includes(header.parentId) || n.nodeId === header.parentId);
        const city = nodes.find((n) => n.role?.value === 'gridcell' && n.parentId === header?.parentId && /^(Alger|Oran|Constantine|Annaba|Blida|Sétif)$/.test(n.name?.value ?? ''));
        check(name, 'the retained row and its focused cell are in the accessibility tree, not ignored', header && !header.ignored && city && !city.ignored, { header: !!header, row: row?.role?.value, city: city?.name?.value });
      }
      await page.close();
    }

    // ---- focus survives updates and scrolling, in a real browser (a moved node blurs here) ----
    {
      const { page } = await load(ctx, 'rows=20000');
      // A far cell is focused at the next paint (the grid scrolls first): wait a frame.
      await page.evaluate(() => window.t.grid.api.focusCell(window.t.key(42), 'city'));
      await frames(page, 2);
      await page.evaluate(() => { window.t.mark = document.activeElement; window.t.events.length = 0; });
      check(name, 'focusCell on a far row moves the DOM focus there at the next paint', await page.evaluate(() => window.t.mark.closest('.dzg-row')?.getAttribute('aria-rowindex') === '44'), null);
      await page.evaluate(() => {
        const g = window.t.grid;
        g.update({ locale: 'ar-DZ' });
        g.update({ direction: 'rtl' });
        g.update({ direction: 'ltr' });
        g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'amount', dir: 'desc' }] }, 'user');
      });
      await frames(page, 3);
      await page.evaluate(() => window.t.scrollTo(15000 * 32));
      await frames(page, 2);
      await page.evaluate(() => window.t.scrollTo(0));
      await frames(page, 2);
      const s = await page.evaluate(() => ({ same: document.activeElement === window.t.mark, blurs: window.t.events.filter((e) => e.startsWith('blur')).length }));
      check(name, 'focus kept through locale, direction and sort updates and a long scroll: same element, no blur', s.same && s.blurs === 0, s);
      // Tab out and Shift+Tab back.
      await page.focus('#after');
      await page.keyboard.press('Shift+Tab');
      await frames(page);
      const back = await page.evaluate(() => document.activeElement === window.t.mark);
      check(name, 'Shift+Tab comes back to the same cell', back, back);
      await page.close();
    }

    // ---- a million rows: focus far away, scrolled to the end and back, and the last row flush ----
    {
      const { page, errors } = await load(ctx, 'rows=1000000');
      const scaled = await page.evaluate(() => window.t.mapper().scaled);
      await page.evaluate(() => window.t.grid.api.focusCell(window.t.key(500000), 'amount'));
      await frames(page, 2);
      await page.evaluate(() => { window.t.mark = document.activeElement; window.t.events.length = 0; });
      for (const to of ['end', 'top', 'mid']) {
        await page.evaluate((to) => window.t.scrollTo(to === 'end' ? 1e12 : to === 'top' ? 0 : 499995 * 32), to);
        await frames(page, 2);
      }
      const s = await page.evaluate(() => ({ same: document.activeElement === window.t.mark, blurs: window.t.events.filter((e) => e.startsWith('blur')).length, bodyH: document.querySelector('.dzg-body').getBoundingClientRect().height }));
      check(name, '1 M rows (scaled): focused cell kept through end, top and back; the body never taller than the cap', scaled && s.same && s.blurs === 0 && s.bodyH <= 4_000_000 + 1, { scaled, ...s });
      await page.keyboard.press('ArrowDown');
      await frames(page, 2);
      const down = await page.evaluate(() => {
        const a = document.activeElement, v = document.querySelector('.dzg-viewport').getBoundingClientRect(), r = a.getBoundingClientRect();
        return { row: a.closest('.dzg-row')?.getAttribute('aria-rowindex'), visible: r.top >= v.top + 30 && r.bottom <= v.bottom + 0.5 };
      });
      check(name, '1 M rows: ArrowDown focuses the next row, fully visible', down.row === '500003' && down.visible, down);
      await page.evaluate(() => window.t.scrollTo(1e12));
      await frames(page, 2);
      const last = await page.evaluate(() => {
        const v = document.querySelector('.dzg-viewport');
        const vr = v.getBoundingClientRect();
        const row = document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="1000001"]');
        if (!row) return null;
        const r = row.getBoundingClientRect();
        return { gap: vr.top + v.clientTop + v.clientHeight - r.bottom };
      });
      check(name, '1 M rows: the last row is flush with the bottom', last && Math.abs(last.gap) <= 1, last);
      check(name, 'no page error at 1 M rows', errors.length === 0, errors);
      await page.close();
    }

    // ---- palette switched live, direction switched live keeping the logical inline scroll ----
    {
      const { page } = await load(ctx, 'select=multi');
      const r = await page.evaluate(async () => {
        const root = document.querySelector('.dzg');
        const g = window.t.grid;
        g.kernel.dispatch({ type: 'selection.toggle', row: window.t.key(1) }, 'user');
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const row = document.querySelector('.dzg-row[aria-rowindex="3"]');
        const before = getComputedStyle(row).backgroundColor;
        document.documentElement.style.setProperty('--tz-accent', 'light-dark(#be123c, #fb7185)');
        await new Promise((r) => requestAnimationFrame(r));
        const after = getComputedStyle(row).backgroundColor;
        return { before, after, same: document.querySelector('.dzg') === root };
      });
      check(name, 'palette switched live: the selected row changes colour, the grid is not re-created', r.before !== r.after && r.same, r);
      const d = await page.evaluate(async () => {
        const vp = document.querySelector('.dzg-viewport');
        vp.scrollLeft = 300;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const t0 = performance.now();
        window.t.grid.update({ direction: 'rtl' });
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return { logical: -vp.scrollLeft, ms: performance.now() - t0 };
      });
      check(name, 'direction switched live keeps the logical inline scroll, within 100 ms', Math.abs(d.logical - 300) <= 1 && d.ms <= 100, d);
      await page.close();
    }
  } finally {
    await b.close();
    open = null;
  }
}

try {
  for (const e of engines) await runEngine(e);
} finally {
  await site.close();
}
const failed = checks.filter((c) => !c.ok).length;
console.log(`\ntest:browser: ${checks.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
