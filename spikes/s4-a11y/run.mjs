// S4 — accessibility of a virtualised grid (10 000 rows, window of ~30).
// Chrome: axe-core + CDP getFullAXTree + chrome://accessibility dumps (Blink internal and native macOS tree).
// Firefox / WebKit: axe-core + DOM/focus checks (Playwright 1.64 exposes no engine AX tree for them).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve, browser, record } from '../kit.mjs';
import { chromeDump, macSummary, blinkSummary, cdpView } from './ax.mjs';

const AXE = readFileSync(fileURLToPath(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url)), 'utf8');
const site = await serve(import.meta.url);
const open_browsers = new Set();
const checks = [];
const evidence = {};
const observations = [];
const observe = (engine, label, value) => observations.push({ engine, label, value });
const check = (engine, label, ok, detail) => { checks.push({ engine, label, ok: !!ok, ...(ok ? {} : { detail }) }); if (!ok) console.error('FAIL', engine, label, JSON.stringify(detail)); };
let uid = 0;

async function open(b, ctx, qs) {
  const title = `S4-${qs.replace(/\W+/g, '-')}-${++uid}`;
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(site.url(`index.html?${qs}&title=${title}`));
  await page.waitForFunction(() => window.ready);
  return { page, title, errors };
}
async function axe(page) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] }))
    .violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, target: v.nodes[0]?.target, summary: v.nodes[0]?.failureSummary })));
}
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const dom = (page) => page.evaluate(() => {
  const g = window.grid, a = document.activeElement, row = a?.closest('[role=row]');
  const rows = g.domRows();
  return {
    rowcount: Number(g.root.getAttribute('aria-rowcount')), colcount: Number(g.root.getAttribute('aria-colcount')),
    mounted: rows.length, rows, active: { key: row?.dataset.key, rowindex: Number(row?.getAttribute('aria-rowindex')), colindex: Number(a?.getAttribute('aria-colindex')), role: a?.getAttribute('role'), text: a?.textContent },
    tabStops: g.root.querySelectorAll('[tabindex="0"]').length, live: g.live.textContent, focus: g.focus,
    orderOk: rows.every((r, i) => i === 0 || r[1] > rows[i - 1][1]),
  };
});
const key = async (page, k, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(k); await settle(page); };

// ---------------------------------------------------------------------------
async function runEngine(name) {
  const isChrome = name === 'chrome';
  const b = await browser(name, isChrome ? { args: ['--force-renderer-accessibility'] } : {});
  open_browsers.add(b);
  const ctx = await b.newContext();
  const ev = (evidence[name] = {});
  const mac = async (title) => macSummary(await chromeDump(ctx, title, 'mac'));
  const blink = async (title) => blinkSummary(await chromeDump(ctx, title, 'blink'));

  for (const lang of ['fr', 'ar']) {
    const L = (s) => `${lang}: ${s}`;
    const fwd = lang === 'ar' ? 'ArrowLeft' : 'ArrowRight';
    const e = (ev[lang] = {});
    // ---- flat grid -------------------------------------------------------
    {
      const { page, title, errors } = await open(b, ctx, `lang=${lang}`);
      e.axeLoad = await axe(page);
      check(name, L('axe: 0 violations on load'), e.axeLoad.length === 0, e.axeLoad);
      // Tab enters on the single tab stop, arrows move by logical column
      await page.focus('#before'); await key(page, 'Tab');
      let d = await dom(page);
      check(name, L('Tab lands on the roving tab stop (row 2, col 1)'), d.active.rowindex === 2 && d.active.colindex === 1 && d.tabStops === 1, d.active);
      await key(page, fwd);
      d = await dom(page);
      check(name, L(`${fwd} moves to logical next column (colindex 2)`), d.active.colindex === 2 && d.tabStops === 1, d.active);
      check(name, L('aria-rowcount 10001, aria-colcount 6'), d.rowcount === 10001 && d.colcount === 6, d);
      // row 5 000 (display index 4999 -> aria-rowindex 5001)
      await page.evaluate(() => { grid.scrollToIndex(4999 - 3); grid.focusCell('r4999', 'city'); });
      await settle(page);
      d = await dom(page);
      e.at5000 = { mounted: d.mounted, active: d.active };
      check(name, L('row 5000: focus on r4999, aria-rowindex 5001, colindex 2'), d.active.key === 'r4999' && d.active.rowindex === 5001 && d.active.colindex === 2, d.active);
      check(name, L(`row 5000: window of ~30 rows mounted (${d.mounted})`), d.mounted >= 25 && d.mounted <= 36, d.mounted);
      check(name, L('row 5000: DOM order = aria-rowindex order'), d.orderOk, d.rows);
      const axe5000 = await axe(page);
      check(name, L('axe: 0 violations at row 5000'), axe5000.length === 0, axe5000);
      if (isChrome) {
        const m = await mac(title);
        e.mac5000 = { role: m.role, label: m.label, rowcount: m.rowcount, colcount: m.colcount, focused: m.focused, firstRows: m.rows.slice(0, 3) };
        check(name, L('macOS AX: table rowcount 10001 colcount 6'), m.rowcount === 10001 && m.colcount === 6, m);
        check(name, L('macOS AX: focused cell 5001/2 with column header and row header'),
          m.focused?.rowindex === 5001 && m.focused?.colindex === 2 && m.focused.columnHeaders[0] === (lang === 'fr' ? 'Ville' : 'المدينة')
          && m.focused.rowHeaders[0] === (lang === 'fr' ? 'Patient 4999' : 'مريض 4999'), m.focused);
        const c = await cdpView(page);
        e.cdp5000 = c;
        check(name, L('CDP: focused node is the gridcell of r4999'), c.focused?.role === 'gridcell' && c.focused.dom.key === 'r4999', c.focused);
      }
      // retained row: keep focus on r4999, scroll to the end
      await page.evaluate(() => grid.scrollToIndex(9999));
      await settle(page);
      d = await dom(page);
      e.retained = { mounted: d.mounted, first: d.rows.slice(0, 2), last: d.rows.at(-1), active: d.active };
      check(name, L('row 9999: focused row retained (still the active element)'), d.active.key === 'r4999' && d.rows.some((r) => r[0] === 'r4999' && r[2]), d);
      check(name, L('row 9999: retained row first in DOM, then the window, last rowindex 10001'), d.rows[0][0] === 'r4999' && d.rows.at(-1)[1] === 10001 && d.orderOk, d.rows.slice(0, 3));
      const axe9999 = await axe(page);
      check(name, L('axe: 0 violations with a retained row off screen'), axe9999.length === 0, axe9999);
      if (isChrome) {
        const m = await mac(title);
        const bl = await blink(title);
        const br = bl.rows.find((r) => r.rowindex === 5001);
        e.mac9999 = { rowcount: m.rowcount, rows: [m.rows[0], m.rows[1], m.rows[2], m.rows.at(-1)], focused: m.focused, lastCell: m.cell(10001, 1) };
        e.blink9999 = { retainedRow: br, tableRowCount: bl.tableRowCount, lastRow: bl.rows.at(-1) };
        check(name, L('macOS AX: retained row exposed (rowindex 5001) right after the header'), m.rows[1]?.rowindex === 5001, m.rows.slice(0, 3));
        check(name, L('macOS AX: focused cell still 5001/2 with its headers after scrolling away'),
          m.focused?.rowindex === 5001 && m.focused.columnHeaders.length === 1 && m.focused.rowHeaders.length === 1, m.focused);
        check(name, L('macOS AX: last row 10001 exposed'), m.rows.at(-1)?.rowindex === 10001, m.rows.at(-1));
        check(name, L('Blink: retained row not ignored (offscreen flag only)'), br && !br.ignored, br);
        const c = await cdpView(page, '[data-retained]');
        e.cdp9999 = c;
        check(name, L('CDP: retained row is an exposed row node, focus still inside it'), c.target?.role === 'row' && !c.target.ignored && c.focused?.dom.key === 'r4999', c);
      }
      // Ctrl+End: last cell of the grid, retained row released
      await key(page, 'Control+End');
      d = await dom(page);
      check(name, L('Ctrl+End: focus on rowindex 10001, colindex 6, nothing retained'), d.active.rowindex === 10001 && d.active.colindex === 6 && !d.rows.some((r) => r[2]), d.active);
      // Tab out and back: still one tab stop, on the same logical cell
      await key(page, 'Tab');
      const outId = await page.evaluate(() => document.activeElement.id);
      await page.evaluate(() => grid.scrollToIndex(0)); await settle(page);
      await key(page, 'Shift+Tab');
      d = await dom(page);
      check(name, L('Tab out, scroll to top, Shift+Tab back: same logical cell (r9999, col 6)'), outId === 'after' && d.active.key === 'r9999' && d.active.colindex === 6, { outId, active: d.active });
      // live region: sort from the header, filter
      await page.evaluate(() => grid.focusCell('__header', 'city')); await key(page, 'Enter');
      await page.waitForTimeout(150);
      d = await dom(page);
      const sortMsg = lang === 'fr' ? 'Trié par Ville, ordre croissant. 10\u202f000 lignes.' : 'مرتب حسب المدينة، تصاعديًا. 10.000 صف.';
      e.liveSort = d.live;
      check(name, L('live region announces the sort'), d.live === sortMsg, d.live);
      const sortAttr = await page.evaluate(() => document.querySelector('[role=columnheader][aria-sort]')?.getAttribute('aria-sort'));
      check(name, L('aria-sort=ascending on the sorted header, focus stays on it'), sortAttr === 'ascending' && d.active.role === 'columnheader', { sortAttr, active: d.active });
      if (isChrome) {
        const m = await mac(title);
        const c = await cdpView(page);
        e.macSort = m.sorted; e.cdpLive = c.live;
        check(name, L('macOS AX: sort direction exposed on the header'), m.sorted.length === 1 && m.sorted[0].dir === 'AXAscendingSortDirection', m.sorted);
        check(name, L('CDP: live region polite + atomic'), c.live?.live === 'polite' && c.live.atomic === true, c.live);
      }
      await page.evaluate((city) => grid.setFilter((r) => r.city === city), lang === 'fr' ? 'Oran' : 'وهران');
      await page.waitForTimeout(150);
      d = await dom(page);
      e.liveFilter = d.live;
      check(name, L('live region announces the filter and rowcount follows'), /1[\s ,.]?667/.test(d.live) && d.rowcount === 1668, { live: d.live, rowcount: d.rowcount });
      check(name, L('no page errors'), errors.length === 0, errors);
      await page.close();
    }
    // ---- treegrid --------------------------------------------------------
    {
      const { page, title, errors } = await open(b, ctx, `lang=${lang}&mode=treegrid`);
      const a = await axe(page);
      e.axeTree = a;
      check(name, L('treegrid: axe 0 violations'), a.length === 0, a);
      await page.evaluate(() => { grid.scrollToIndex(5000 - 3); grid.focusCell('r5001', 'name'); });
      await settle(page);
      const attrs = await page.evaluate(() => ['r5000', 'r5001'].map((k) => {
        const r = document.querySelector(`[data-key="${k}"]`);
        return ['aria-rowindex', 'aria-level', 'aria-setsize', 'aria-posinset', 'aria-expanded'].map((x) => r.getAttribute(x));
      }));
      e.treeAttrs = attrs;
      check(name, L('treegrid: Service 50 = rowindex 5002 level 1 51/100 expanded; child level 2 1/99'),
        JSON.stringify(attrs) === JSON.stringify([['5002', '1', '100', '51', 'true'], ['5003', '2', '99', '1', null]]), attrs);
      if (isChrome) {
        const bl = await blink(title);
        const m = await mac(title);
        const p = bl.rows.find((r) => r.rowindex === 5002), c = bl.rows.find((r) => r.rowindex === 5003);
        e.blinkTree = { parent: p, child: c, role: bl.role, rowcount: bl.rowcount };
        e.macTree = { role: m.role, focused: m.focused, rows: m.rows.filter((r) => r.rowindex === 5002 || r.rowindex === 5003) };
        check(name, L('Blink: treegrid level/setsize/posinset/expanded exposed'), bl.role === 'treeGrid' && p?.level === 1 && p.setsize === 100 && p.posinset === 51 && p.expanded === true
          && c?.level === 2 && c.setsize === 99 && c.posinset === 1, { p, c });
        check(name, L('macOS AX: disclosure level and expanded state'), e.macTree.rows[0]?.level === 1 && e.macTree.rows[0]?.expanded === true && e.macTree.rows[1]?.level === 2, e.macTree.rows);
      }
      // keyboard: back = to parent, back again = collapse (RTL inverted)
      const back = lang === 'ar' ? 'ArrowRight' : 'ArrowLeft';
      await key(page, back);
      let d = await dom(page);
      check(name, L(`treegrid: ${back} on a child goes to its parent`), d.active.key === 'r5000', d.active);
      await key(page, back);
      await page.waitForTimeout(120);
      d = await dom(page);
      const exp = await page.evaluate(() => document.querySelector('[data-key="r5000"]').getAttribute('aria-expanded'));
      check(name, L(`treegrid: ${back} on an expanded parent collapses it, rowcount 10001 -> 9902, announced`), exp === 'false' && d.rowcount === 9902 && d.live.length > 0 && d.active.key === 'r5000', { exp, rowcount: d.rowcount, live: d.live });
      e.liveCollapse = d.live;
      await page.evaluate(() => grid.scrollToIndex(9800)); await settle(page);
      d = await dom(page);
      check(name, L('treegrid: focused parent retained when scrolled away'), d.active.key === 'r5000' && d.rows.some((r) => r[0] === 'r5000' && r[2]) && d.orderOk, d.rows.slice(0, 2));
      if (isChrome) {
        const bl = await blink(title);
        const r = bl.rows.find((x) => x.rowindex === 5002);
        e.blinkTreeRetained = r;
        check(name, L('Blink: retained collapsed parent exposed with level 1, collapsed'), r && !r.ignored && r.level === 1 && r.expanded === false, r);
      }
      const a2 = await axe(page);
      check(name, L('treegrid: axe 0 violations after collapse + scroll'), a2.length === 0, a2);
      check(name, L('treegrid: no page errors'), errors.length === 0, errors);
      await page.close();
    }
    // ---- master / detail -------------------------------------------------
    {
      const { page, title, errors } = await open(b, ctx, `lang=${lang}&mode=detail`);
      const a = await axe(page);
      check(name, L('detail: axe 0 violations'), a.length === 0, a);
      const i = await page.evaluate(() => grid.indexOf('detail:r5000'));
      await page.evaluate((i) => { grid.scrollToIndex(i - 3); grid.focusCell('r5000', 'name'); }, i);
      await settle(page);
      const det = await page.evaluate(() => {
        const r = document.querySelector('[data-key="detail:r5000"]'), c = r.firstElementChild;
        const m = document.querySelector('[data-key="r5000"] [aria-colindex="1"]');
        return { rowindex: r.getAttribute('aria-rowindex'), cells: r.children.length, colspan: c.getAttribute('aria-colspan'), masterExpanded: m.getAttribute('aria-expanded'), masterRow: m.parentElement.getAttribute('aria-rowindex'), text: c.textContent };
      });
      e.detail = det;
      check(name, L('detail: one cell spanning 6 columns, right after its master, master expanded'), det.cells === 1 && det.colspan === '6' && Number(det.rowindex) === Number(det.masterRow) + 1 && det.masterExpanded === 'true', det);
      const a2 = await axe(page);
      check(name, L('detail: axe 0 violations at row 5000'), a2.length === 0, a2);
      if (isChrome) {
        const bl = await blink(title);
        const m = await mac(title);
        const cell = bl.cells.find((c) => c.rowindex === Number(det.rowindex));
        const master = bl.cells.find((c) => c.rowindex === Number(det.masterRow) && c.colindex === 1);
        e.blinkDetail = { cell, master, rowcount: bl.rowcount };
        e.macDetail = m.cell(Number(det.rowindex), 1);
        check(name, L('Blink: detail cell aria-colspan 6 exposed, master cell expanded'), cell?.ariaColspan === 6 && master?.expanded === true, { cell, master });
        observe(name, L('detail cell: table geometry span (Blink tableCellColumnSpan, macOS AXColumnIndexRange.len) and its column header'),
          { blinkTableSpan: cell?.colspan, macRange: e.macDetail?.colspan, macColumnHeaders: e.macDetail?.columnHeaders });
      }
      await key(page, 'Enter');
      const after = await page.evaluate(() => ({ gone: !document.querySelector('[data-key="detail:r5000"]'), exp: document.querySelector('[data-key="r5000"] [aria-colindex="1"]').getAttribute('aria-expanded'), rc: grid.root.getAttribute('aria-rowcount') }));
      check(name, L('detail: Enter on the master closes the detail, rowcount -1'), after.gone && after.exp === 'false' && after.rc === '10005', after);
      check(name, L('detail: no page errors'), errors.length === 0, errors);
      await page.close();
    }
    // ---- column virtualisation stand-in ------------------------------------
    {
      const { page, title } = await open(b, ctx, `lang=${lang}&mode=colvirt`);
      const a = await axe(page);
      check(name, L('colvirt: axe 0 violations (colindex with gaps 1,7..11 of 18)'), a.length === 0, a);
      await page.evaluate(() => grid.focusCell('r10', 'x1'));
      if (isChrome) {
        const m = await mac(title);
        e.macColvirt = m.focused;
        check(name, L('macOS AX: cell colindex 8 of 18 gets header "Mesure 2"'), m.colcount === 18 && m.focused?.colindex === 8 && m.focused.columnHeaders[0] === (lang === 'fr' ? 'Mesure 2' : 'قياس 2'), m.focused);
      }
      await page.close();
    }
    // ---- paged: page announcement ------------------------------------------
    {
      const { page } = await open(b, ctx, `lang=${lang}&mode=paged`);
      await page.evaluate(() => grid.setPage(2));
      await page.waitForTimeout(150);
      const d = await dom(page);
      e.livePage = d.live;
      check(name, L('paged: page change announced, rowcount = rows of the page + header'), d.live.length > 0 && /201/.test(d.live) && d.rowcount === 101, { live: d.live, rowcount: d.rowcount });
      await page.close();
    }
  }
  // ---- scroll container without tabindex=-1: is it an extra tab stop? --------------
  {
    const { page } = await open(b, ctx, 'lang=fr&scrollerTabIndex=0');
    await page.focus('#before'); await key(page, 'Tab');
    ev.scrollerWithoutTabindex = await page.evaluate(() => document.activeElement.getAttribute('role') + (document.activeElement.getAttribute('aria-colindex') ? '/' + document.activeElement.getAttribute('aria-colindex') : ''));
    observe(name, 'Tab from the field before the grid, scroll container WITHOUT tabindex=-1, lands on', ev.scrollerWithoutTabindex);
    await page.close();
  }
  // ---- §3.7 tree as written: role=grid on the wrapper (comparison) ------------
  {
    const { page } = await open(b, ctx, 'lang=fr&layout=arch');
    ev.axeArchLayout = await axe(page);
    check(name, '§3.7 as written (live region + viewport inside role=grid) is flagged by axe', ev.axeArchLayout.some((v) => v.id === 'aria-required-children'), ev.axeArchLayout);
    await page.close();
  }
  await b.close(); open_browsers.delete(b);
}

const engines = process.argv.slice(2).length ? process.argv.slice(2) : ['chrome', 'firefox', 'webkit'];
// One browser at a time, closed even on failure (runEngine closes it on success; this catches throws).
try { for (const e of engines) await runEngine(e); } finally { for (const b of open_browsers) await b.close().catch(() => {}); await site.close(); }
const failed = checks.filter((c) => !c.ok);
record(import.meta.url, {
  spike: 'S4', engines, passed: checks.length - failed.length, failed: failed.length,
  checks, observations, evidence,
});
process.exit(failed.length ? 1 : 0);
