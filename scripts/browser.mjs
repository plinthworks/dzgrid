/**
 * The grid in a real browser: what jsdom cannot see. `npm run test:browser`
 * (Chrome; `-- --all` adds Firefox and WebKit for the RTL and focus checks).
 * One browser at a time, closed in finally. Screenshots go to
 * packages/dom/test/browser/results/ (gitignored), for a person to look at.
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve, browser } from '../spikes/kit.mjs';
import { chromeDump } from '../spikes/s4-a11y/ax.mjs';

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
    // The column header (a group header names its first column too).
    const h = document.querySelector(`.dzg-header .dzg-hcell[data-col="${cell.dataset.col}"]:not(.dzg-hgroup)`);
    if (!h) return { missing: cell.dataset.col };
    const a = h.getBoundingClientRect(), b = cell.getBoundingClientRect();
    worst = Math.max(worst, Math.abs(a.left - b.left), Math.abs(a.right - b.right));
  }
  // The selection box's cell, when there is one, as wide as its header.
  const hc = document.querySelector('.dzg-header .dzg-check');
  const bc = row.querySelector('.dzg-check');
  if (hc && bc) {
    const a = hc.getBoundingClientRect(), b = bc.getBoundingClientRect();
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
  // Chrome's own accessibility trees (chrome://accessibility) need it on from the start.
  const b = await browser(name, name === 'chrome' ? { args: ['--force-renderer-accessibility'] } : {});
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

    // ---- the retry button on the error overlay (step 11), in fr and in ar right to left ----
    if (name === 'chrome') {
      for (const [qs, label] of [['locale=fr-FR&rows=200', 'Réessayer'], ['locale=ar-DZ&dir=rtl&rows=200&theme=dark', 'إعادة المحاولة']]) {
        const { page, errors } = await load(ctx, qs);
        await page.evaluate(() => {
          const k = window.t.grid.kernel;
          window.t.sent = [];
          const dispatch = k.dispatch.bind(k);
          k.dispatch = (cmd, source) => { window.t.sent.push(`${cmd.type}:${source}`); return dispatch(cmd, source); };
          window.t.grid.update({ overlay: 'error' });
        });
        await frames(page);
        const v = await axe(page);
        const b = await page.evaluate(() => {
          const btn = document.querySelector('.dzg-overlay button');
          if (!btn) return null;
          const r = btn.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { text: btn.textContent, type: btn.type, inGrid: !!btn.closest('[role=grid]'), w: r.width, h: r.height, hit: hit === btn || btn.contains(hit), dir: getComputedStyle(btn).direction };
        });
        check(name, `retry ${qs}: axe 0 violations with the error overlay and its button`, v.length === 0 && b, { v, b });
        check(name, `retry ${qs}: a native button named ${label}, outside role grid, at least 24 px, on top under the pointer`, b && b.text === label && b.type === 'button' && !b.inGrid && b.w >= 24 && b.h >= 24 && b.hit && b.dir === (qs.includes('rtl') ? 'rtl' : 'ltr'), b);
        // Tab from the grid's focused cell reaches the button; Enter presses it; the focus comes back to the cell.
        await page.evaluate(() => window.t.grid.api.focusCell(window.t.key(3), 'city'));
        await frames(page);
        await page.keyboard.press('Tab');
        const onButton = await page.evaluate(() => document.activeElement === document.querySelector('.dzg-overlay button'));
        check(name, `retry ${qs}: Tab from the grid reaches the button`, onButton, null);
        await page.keyboard.press('Enter');
        await frames(page);
        const after = await page.evaluate(() => ({ sent: window.t.sent, col: document.activeElement?.dataset?.col ?? null, row: document.activeElement?.closest('.dzg-row')?.getAttribute('aria-rowindex') ?? null }));
        check(name, `retry ${qs}: Enter dispatches rows.refresh as the user and the focus goes back to the cell`, after.sent.includes('rows.refresh:user') && after.col === 'city' && after.row === '5', after);
        // No trap: Tab leaves the button for what follows it, Shift+Tab goes back into the grid.
        await page.evaluate(() => document.querySelector('.dzg-overlay button').focus());
        await page.keyboard.press('Tab');
        const out = await page.evaluate(() => document.activeElement?.id);
        await page.evaluate(() => document.querySelector('.dzg-overlay button').focus());
        await page.keyboard.press('Shift+Tab');
        const back = await page.evaluate(() => !!document.activeElement?.closest('[role=grid]'));
        check(name, `retry ${qs}: no focus trap (Tab leaves forward, Shift+Tab back into the grid)`, out === 'after' && back, { out, back });
        await page.screenshot({ path: `${OUT}/${name}-retry-${qs.replace(/[&=]/g, '_')}.png`, clip: { x: 0, y: 0, width: 1000, height: 640 } });
        check(name, `no page error retry ${qs}`, errors.length === 0, errors);
        await page.close();
      }
    }

    // ---- alignment and pinning, LTR and RTL, at three inline positions ----
    // With the selection box too (its cell must be as wide as the column it stands for), and over spans.
    // And under grouped headers (step 9b, commit 4): LTR, RTL, pinned, with the box.
    for (const [dir, more] of [['ltr', ''], ['rtl', ''], ['ltr', '&box=1'], ['rtl', '&box=1&spans=1&pin=1&rows=20000'], ['ltr', '&groups=1'], ['rtl', '&groups=1'], ['ltr', '&groups=1&pin=1&box=1'], ['rtl', '&groups=1&pin=1&box=1']]) {
      const { page } = await load(ctx, `locale=${dir === 'rtl' ? 'ar-DZ' : 'fr-FR'}&dir=${dir}${more}`);
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
      check(name, `${dir}${more}: header and body aligned within 1 px, pinned segments at their edges, at start, middle and end`, out.every((m) => m.worst <= 1 && m.startEdge <= 1 && m.endEdge <= 1), out);
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
      // S11 C on the real grid, scaled: Tab out, scroll to the end, Shift+Tab back to the same cell, visible.
      await page.evaluate(() => { window.t.grid.api.focusCell(window.t.key(500000), 'amount'); });
      await frames(page, 2);
      await page.evaluate(() => { window.t.mark = document.activeElement; });
      await page.focus('#after');
      await page.evaluate(() => window.t.scrollTo(1e12));
      await frames(page, 2);
      await page.keyboard.press('Shift+Tab');
      await frames(page, 4);
      const c = await page.evaluate(() => {
        const a = document.activeElement, v = document.querySelector('.dzg-viewport').getBoundingClientRect(), r = a.getBoundingClientRect();
        return { same: a === window.t.mark, visible: r.top >= v.top + 30 && r.bottom <= v.bottom + 0.5 };
      });
      check(name, '1 M rows: Shift+Tab back from outside lands on the same cell, brought into view', c.same && c.visible, c);
      check(name, 'no page error at 1 M rows', errors.length === 0, errors);
      await page.close();
    }

    // ---- a real mouse drag on resize handles, LTR and RTL: centre, start-pinned, end-pinned ----
    for (const dir of ['ltr', 'rtl']) {
      const { page } = await load(ctx, `locale=${dir === 'rtl' ? 'ar-DZ' : 'fr-FR'}&dir=${dir}&rows=200`);
      const out = [];
      for (const col of ['city', 'name', 'ref']) {
        const before = await page.evaluate((c) => document.querySelector(`.dzg-hcell[data-col="${c}"]`).getBoundingClientRect().width, col);
        const h = await page.locator(`.dzg-hcell[data-col="${col}"] .dzg-resize`).boundingBox();
        // Toward the column's outside: the end in LTR is to the right; the last end-pinned grows the other way.
        const outward = (dir === 'ltr' ? 1 : -1) * (col === 'ref' ? -1 : 1);
        await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
        await page.mouse.down();
        await page.mouse.move(h.x + h.width / 2 + outward * 30, h.y + h.height / 2, { steps: 5 });
        await page.mouse.move(h.x + h.width / 2 + outward * 60, h.y + h.height / 2, { steps: 5 });
        await page.mouse.up();
        await frames(page, 3);
        const after = await page.evaluate((c) => document.querySelector(`.dzg-hcell[data-col="${c}"]`).getBoundingClientRect().width, col);
        out.push({ col, grew: Math.round(after - before) });
      }
      const g = await geometry(page);
      check(name, `${dir}: a mouse drag of 60 px widens centre, start-pinned and end-pinned columns by 60, still aligned`, out.every((o) => Math.abs(o.grew - 60) <= 1) && g.worst <= 1, { out, g });
      await page.close();
    }

    // ---- text zoom: rows follow the reader's text size; the tooltip in the top layer ----
    {
      const { page } = await load(ctx, 'rows=200');
      const z = await page.evaluate(async () => {
        document.documentElement.style.fontSize = '32px';
        window.t.grid.api.refresh();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const row = document.querySelector('.dzg-layer > .dzg-row');
        const cells = [...row.querySelectorAll('.dzg-cell')];
        return { height: row.getBoundingClientRect().height, clipped: cells.filter((c) => c.scrollHeight > c.clientHeight + 1).length };
      });
      check(name, 'at 200 % text the rows double and no cell text is clipped', Math.abs(z.height - 64) <= 1 && z.clipped === 0, z);
      const tip = await page.evaluate(async () => {
        document.documentElement.style.fontSize = '';
        // A host card that clips what overflows it, as dialogs and cards do.
        const host = document.getElementById('host');
        host.style.overflow = 'hidden';
        host.style.transform = 'translateZ(0)';
        const h = document.querySelector('.dzg-hcell[data-col="city"]');
        h.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 700));
        const t = document.querySelector('.dzg-tooltip');
        return { shown: !t.hidden, topLayer: t.matches(':popover-open') };
      });
      check(name, 'the tooltip opens in the top layer, out of reach of a clipping, transformed host', tip.shown && tip.topLayer, tip);
      await page.close();
    }

    // ---- spans (step 9b, commit 3): a long merge drawn over the view, its label in view, hit over covered places ----
    for (const pin of ['', '&pin=1']) {
      const { page, errors } = await load(ctx, `rows=20000&spans=1${pin}`);
      const res = await page.evaluate(async () => {
        const vp = document.querySelector('.dzg-viewport');
        const v = vp.getBoundingClientRect();
        const top = document.querySelector('.dzg-header').getBoundingClientRect().bottom;
        const bottom = v.top + vp.clientTop + vp.clientHeight;
        const out = [];
        // Inside the first run (rows 0 to 4 999): before its centre, at it, past it.
        for (const at of [100, 2500, 4890]) {
          window.t.scrollTo(at * 32);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const cell = document.querySelector('.dzg-cell[aria-rowspan][data-col="city"]');
          if (!cell) { out.push({ at, cell: false }); continue; }
          const c = cell.getBoundingClientRect();
          const l = cell.querySelector('.dzg-span-label').getBoundingClientRect();
          const hit = document.elementFromPoint((c.left + c.right) / 2, (top + bottom) / 2);
          out.push({ at, covers: c.top <= top + 1 && c.bottom >= bottom - 1, labelIn: l.top >= top - 1 && l.bottom <= bottom + 1, hit: cell.contains(hit), rowspan: cell.getAttribute('aria-rowspan'), drawn: Math.round(c.height) });
        }
        return out;
      });
      check(name, `spans${pin ? ', pinned' : ''}: a 5 000-row merge covers the view (drawn over the window only), its label stays in view, a covered place hits the tall cell`, res.every((r) => r.covers && r.labelIn && r.hit && r.rowspan === '5000' && r.drawn < 5000), res);
      check(name, `no page error with spans${pin ? ', pinned' : ''}`, errors.length === 0, errors);
      await page.close();
    }

    // ---- spans (step 9b, commit 3 fixes): the hover lights the row under the pointer, not the tall cell's own ----
    for (const qs of ['rows=20000&spans=1', 'rows=200']) {
      const { page, errors } = await load(ctx, qs);
      const box = await page.evaluate(() => {
        const r = (i) => document.querySelector(`.dzg-layer > .dzg-row[aria-rowindex="${i + 2}"]`).getBoundingClientRect();
        // Over the city column (in a spans grid, the tall cell of rows 0 to 4 999), at row 3.
        const c = document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="2"] [data-col="city"]').getBoundingClientRect();
        return { x: (c.left + c.right) / 2, y: (r(3).top + r(3).bottom) / 2 };
      });
      await page.mouse.move(box.x, box.y);
      await frames(page);
      const h = await page.evaluate(() => {
        const bg = (i) => {
          const row = document.querySelector(`.dzg-layer > .dzg-row[aria-rowindex="${i + 2}"]`);
          return [row, row.querySelector('.dzg-seg-start')].map((e) => getComputedStyle(e).backgroundColor).join(' ');
        };
        return { origin: bg(0), under: bg(3), other: bg(6) };
      });
      const spansGrid = qs.includes('spans');
      check(name, `${spansGrid ? 'spans' : 'plain grid'}: the pointer over row 3${spansGrid ? ' (a covered place of the tall cell)' : ''} lights that row and its pinned segment${spansGrid ? ', not the row the tall cell lives in' : ''}`,
        h.under !== h.other && (!spansGrid || h.origin === h.other), h);
      await page.mouse.move(5, 5);
      await frames(page);
      const left = await page.evaluate(() => document.querySelectorAll('.dzg-row[data-hover], .dzg-row:hover').length);
      check(name, `${spansGrid ? 'spans' : 'plain grid'}: no row stays hovered once the pointer leaves the grid`, left === 0, left);
      check(name, `no page error hovering ${qs}`, errors.length === 0, errors);
      await page.close();
    }

    // ---- spans (step 9b, commit 4): the tall cell's drawn rect ends where the span ends; focus through scroll and sort ----
    {
      const { page, errors } = await load(ctx, 'rows=20000&spans=1&pin=1');
      const end = await page.evaluate(async () => {
        // The first run (rows 0 to 4 999) ends in view: the cell's bottom is its last row's bottom.
        window.t.scrollTo(4985 * 32);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const cell = document.querySelector('.dzg-cell[aria-rowspan="5000"][data-col="city"]');
        const last = document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="5001"]');
        const next = document.querySelector('.dzg-layer > .dzg-row[aria-rowindex="5002"] [data-col="city"]');
        if (!cell || !last || !next) return { cell: !!cell, last: !!last, next: !!next };
        const c = cell.getBoundingClientRect(), l = last.getBoundingClientRect();
        const top = document.querySelector('.dzg-header').getBoundingClientRect().bottom;
        return { bottom: c.bottom - l.bottom, covers: c.top <= top + 1, nextTop: next.getBoundingClientRect().top - l.bottom, span: next.getAttribute('aria-rowspan') };
      });
      check(name, 'spans, pinned: a tall cell ending in view ends exactly at its last row (within 1 px), the next run starts under it', end.bottom !== undefined && Math.abs(end.bottom) <= 1 && end.covers && Math.abs(end.nextTop) <= 1 && end.span === '5000', end);
      // Focus on a tall cell, through a long scroll and a sort: the same element, never blurred.
      await page.evaluate(() => window.t.grid.api.focusCell(window.t.key(7), 'city'));
      await frames(page, 2);
      await page.evaluate(() => { window.t.mark = document.activeElement; window.t.events.length = 0; });
      await page.evaluate(() => window.t.scrollTo(15000 * 32));
      await frames(page, 2);
      await page.evaluate(() => window.t.scrollTo(0));
      await frames(page, 2);
      const kept = await page.evaluate(() => ({ same: document.activeElement === window.t.mark, span: window.t.mark.getAttribute('aria-rowspan'), blurs: window.t.events.filter((e) => e.startsWith('blur')).length }));
      await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'city', dir: 'desc' }] }, 'user'));
      await frames(page, 3);
      const sorted = await page.evaluate(() => {
        const f = window.t.grid.kernel.focus;
        const el = window.t.grid.context.rowRenderer.cell(f.row, f.column);
        return { focus: f.column, onIt: document.activeElement === el, blurs: window.t.events.filter((e) => e.startsWith('blur')).length };
      });
      check(name, 'spans: the focused tall cell keeps the focus through a long scroll (same element, no blur) and a sort (the focus on its cell)', kept.same && kept.span === '5000' && kept.blurs === 0 && sorted.focus === 'city' && sorted.onIt && sorted.blurs === 0, { kept, sorted });
      check(name, 'no page error with spans, scroll and sort', errors.length === 0, errors);
      await page.close();
    }

    // ---- grouped headers (step 9b, commit 4): group rects, stretched column headers, keys, AX ----
    for (const qs of ['groups=1', 'groups=1&pin=1&box=1&locale=ar-DZ&dir=rtl', 'groups=1&box=1']) {
      const { page, errors } = await load(ctx, `rows=2000&${qs}`);
      const out = [];
      for (const at of [0, 0.5, 1]) {
        await page.evaluate((at) => {
          const vp = document.querySelector('.dzg-viewport');
          vp.scrollLeft = (getComputedStyle(vp).direction === 'rtl' ? -1 : 1) * (vp.scrollWidth - vp.clientWidth) * at;
        }, at);
        await frames(page, 3);
        out.push(await page.evaluate(() => {
          const leafRow = [...document.querySelectorAll('.dzg-header > [role=row]')].at(-1);
          const leaves = [...leafRow.querySelectorAll('.dzg-hcell[data-col]')];
          const byIndex = new Map(leaves.map((e) => [Number(e.getAttribute('aria-colindex')), e]));
          // Each group whose columns are all mounted: its left and right are theirs, within 1 px.
          let groups = 0, worst = 0;
          for (const gEl of document.querySelectorAll('.dzg-hgroup')) {
            const i = Number(gEl.getAttribute('aria-colindex')), n = Number(gEl.getAttribute('aria-colspan'));
            const cols = Array.from({ length: n }, (_, k) => byIndex.get(i + k));
            if (cols.some((c) => !c)) continue;
            const r = gEl.getBoundingClientRect();
            const rs = cols.map((c) => c.getBoundingClientRect());
            worst = Math.max(worst, Math.abs(r.left - Math.min(...rs.map((x) => x.left))), Math.abs(r.right - Math.max(...rs.map((x) => x.right))));
            groups++;
          }
          // A stretched column header starts at the group row it covers, and is what shows there.
          const bands = [...document.querySelectorAll('.dzg-header > [role=row]')].slice(0, -1).map((r) => r.getBoundingClientRect());
          const vp = document.querySelector('.dzg-viewport').getBoundingClientRect();
          let stretched = 0, badStretch = [];
          for (const leaf of leaves.filter((e) => e.hasAttribute('data-up'))) {
            const up = Math.round(parseFloat(leaf.style.getPropertyValue('--dzg-up')) / 32);
            const r = leaf.getBoundingClientRect();
            const x = (r.left + r.right) / 2;
            if (x < vp.left + 2 || x > vp.right - 2) continue;
            const low = document.elementFromPoint(x, r.bottom - 4)?.closest('.dzg-hcell');
            if (low !== leaf) continue; // under a pinned segment
            const high = document.elementFromPoint(x, r.top + 4)?.closest('.dzg-hcell');
            const want = bands[bands.length - up];
            if (high !== leaf || Math.abs(r.top - want.top) > 1) badStretch.push({ col: leaf.dataset.col, top: r.top, want: want.top, hit: high?.className });
            stretched++;
          }
          // Every group row holds one cell per column of the column headers' row (the box's included).
          const counts = [...document.querySelectorAll('.dzg-header > [role=row]')].map((r) => r.querySelectorAll('[aria-colindex]').length);
          return { groups, worst, stretched, badStretch, counts };
        }));
      }
      check(name, `grouped headers ${qs}: each group cell covers exactly its columns (within 1 px), at start, middle and end`, out.every((o) => o.groups >= 1 && o.worst <= 1) && out.reduce((s, o) => s + o.groups, 0) >= 4, out);
      check(name, `grouped headers ${qs}: a column header with no group above is stretched over the empty group cells and is what shows there`, out.every((o) => o.badStretch.length === 0) && out.reduce((s, o) => s + o.stretched, 0) >= 3, out);
      check(name, `grouped headers ${qs}: each group row holds as many headers as the column headers' row`, out.every((o) => new Set(o.counts).size === 1), out.map((o) => o.counts));
      if (qs === 'groups=1') {
        // Keys: Up from C1's header into Mesures then Données (real DOM focus), Down back to C1.
        const keys = await page.evaluate(async () => {
          const vp = document.querySelector('.dzg-viewport');
          vp.scrollLeft = 0;
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          document.querySelector('.dzg-hcell[data-col="x1"]:not(.dzg-hgroup)').focus();
          const seen = [];
          for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown']) {
            document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            seen.push(document.activeElement.textContent);
          }
          return seen;
        });
        check(name, 'grouped headers: Up from a column header focuses its groups, Down comes back to it', JSON.stringify(keys) === JSON.stringify(['Mesures', 'Données', 'Mesures', 'C1']), keys);
        const v = await axe(page);
        check(name, 'grouped headers: axe, 0 violations', v.length === 0, v);
        if (name === 'chrome') {
          // Chrome's own trees: groups are column headers with their span; VoiceOver's (macOS) headers of a cell
          // (scrolled so that C1 to C6 are mounted; a column with no group repeats its own name in the
          // group rows: shown once here).
          const blink = await chromeDump(ctx, 'DzGrid browser suite', 'blink');
          const groups = blink.nodes.filter((n) => n.role === 'columnHeader' && n.attrs.className?.includes('dzg-hgroup')).map((n) => [n.attrs.name, n.attrs.ariaCellColumnIndex, n.attrs.ariaCellColumnSpan]);
          check(name, 'grouped headers: the accessibility tree exposes group headers as column headers with their column index and span', JSON.stringify(groups.filter((x) => x[0] !== 'Patient')) === JSON.stringify([['Finances', '3', '2'], ['Données', '5', '6'], ['Mesures', '5', '4']]) && groups.filter((x) => x[0] === 'Patient').length === 2, groups);
          await page.evaluate(async () => {
            document.querySelector('.dzg-viewport').scrollLeft = 400;
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          });
          const mac = await chromeDump(ctx, 'DzGrid browser suite', 'mac');
          const cells = mac.nodes.filter((n) => n.role === 'AXCell' && n.attrs.AXARIARowIndex === '5');
          const headers = (col) => { const c = cells.find((x) => x.attrs.AXARIAColumnIndex === String(col)); return c ? mac.ref(c.attrs.AXColumnHeaderUIElements).map((h) => h.text).filter((t, k, a) => t && t !== a[k - 1]) : null; };
          const h = { nom: headers(1), c1: headers(6), c4: headers(9), c6: headers(11) };
          check(name, 'grouped headers: macOS pairs each cell with its own groups (Patient over Nom, Données and Mesures over C1, Données over C4, none over C6)',
            JSON.stringify(h) === JSON.stringify({ nom: ['Patient', 'Nom'], c1: ['Données', 'Mesures', 'C1'], c4: ['Données', 'C4'], c6: ['C6'] }), { h, raw: cells.length });
        }
      }
      check(name, `no page error with grouped headers ${qs}`, errors.length === 0, errors);
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
