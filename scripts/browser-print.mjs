/**
 * Phase 6 step 11 in a real browser (docs/phase-6-steps/step11-plan.md §6, docs/behaviors/print.md; `-- --only print`): the REAL
 * playground page `print.html` on 127.0.0.1:4700 (or DZG_PLAYGROUND), never restarted — 1 200 invented patients × 12 columns,
 * « Dossier » pinned at the start, two header groups. Chrome only (`page.pdf()` is Chrome's). For fr (LTR) and ar (RTL), each
 * under Tailwind's unlayered preflight with `print.unlayered.css` (`?preflight=1`, the app's lesson), and fr with the layered
 * sheet alone: `preparePrint` then `page.pdf()`, the text of every page read back (scripts/pdf-text.py, pdfminer) —
 * the header rows on every page; every row once, its cells on one page (its « Dossier » and « Code » ids on the same page);
 * the pinned column first (LTR leftmost, RTL rightmost); the caption on page 1; in print media a td's border 1 px solid black
 * and the grid hidden. With `?rows=5001`: 5 000 rows printed and the line saying so. Then `print()` with the dialog stubbed:
 * after `afterprint` the container and the root marker are gone, the screen grid as before (scroll, DOM).
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export async function printChecks(name, ctx, h) {
  const { check, frames, OUT } = h;
  if (name !== 'chrome') return;
  const base = process.env.DZG_PLAYGROUND ?? 'http://127.0.0.1:4700';

  const open = async (qs) => {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1000, height: 800 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}/print.html?${qs}`);
    await page.waitForFunction(() => window.t?.grid);
    await page.waitForSelector('.dzg-layer .dzg-row');
    await frames(page, 3);
    return { page, errors };
  };
  /** The PDF's text, page by page (lines with their boxes, in points from the bottom left). */
  const read = (file) => JSON.parse(execFileSync('python3', ['-I', `${ROOT}scripts/pdf-text.py`, file], { timeout: 240_000, maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8'));
  const id = (t, p) => new RegExp(`^${p}(\\d{4})$`).exec(t)?.[1];

  for (const [qs, label, rtl, rows] of [
    ['lang=fr&preflight=1', 'fr, under the preflight', false, 1200],
    ['lang=ar&preflight=1', 'ar, under the preflight', true, 1200],
    ['lang=fr', 'fr, the layered sheet', false, 1200],
    ['lang=fr&rows=5001', 'fr, 5 001 rows', false, 5000],
    ['lang=ar&rows=5001&preflight=1', 'ar, 5 001 rows, under the preflight', true, 5000],
  ]) {
    const { page, errors } = await open(qs);
    const screen = await page.evaluate(() => ({ html: document.querySelector('#host').innerHTML.length, top: document.querySelector('.dzg-viewport').scrollTop }));
    const title = await page.evaluate(() => document.querySelector('#title').textContent);
    const t0 = Date.now();
    await page.evaluate(async (title) => { window.undo = await window.t.preparePrint(window.t.grid, { title }); }, title);
    const built = Date.now() - t0;
    await page.emulateMedia({ media: 'print' });
    const looks = await page.evaluate(() => {
      const td = getComputedStyle(document.querySelector('.dzg-print td'));
      const tb = getComputedStyle(document.querySelector('.dzg-print table'));
      return { td: `${td.borderTopWidth} ${td.borderTopStyle} ${td.borderTopColor} ${td.borderInlineStartWidth}`, collapse: tb.borderCollapse, head: getComputedStyle(document.querySelector('.dzg-print thead')).display, grid: getComputedStyle(document.querySelector('main')).display, box: getComputedStyle(document.querySelector('.dzg-print')).display, note: document.querySelector('.dzg-print-note')?.textContent ?? null };
    });
    check(name, `print ${label}: in print media, cells bordered 1 px solid black, collapsed, thead repeated, the page's own content hidden, the table shown`, looks.td === '1px solid rgb(0, 0, 0) 1px' && looks.collapse === 'collapse' && looks.head === 'table-header-group' && looks.grid === 'none' && looks.box === 'block', looks);
    const file = `${OUT}/print-${qs.replace(/[&=]/g, '_')}.pdf`;
    await page.pdf({ path: file, format: 'A4' });
    await page.emulateMedia({ media: 'screen' });
    const pages = read(file);
    // Per page: the body rows' ids (« Dossier » D0001 and « Code » C0001), and the lines above the first row (the header rows, the caption, the note).
    const seenD = new Map();
    const seenC = new Map();
    const heads = [];
    let pinnedFirst = true;
    let worst = null;
    pages.forEach((p, k) => {
      const rowsHere = p.lines.filter((l) => id(l.text, 'D'));
      const topRow = Math.max(...rowsHere.map((l) => l.y1));
      heads.push(p.lines.filter((l) => l.y0 > topRow + 1).map((l) => l.text).sort());
      for (const l of p.lines) {
        const d = id(l.text, 'D');
        const c = id(l.text, 'C');
        if (d) seenD.set(d, [...(seenD.get(d) ?? []), k]);
        if (c) seenC.set(c, [...(seenC.get(c) ?? []), k]);
        if (d) {
          // The pinned column first: on its row's line, the outermost cell on the start side.
          const line = p.lines.filter((o) => Math.abs(o.y1 - l.y1) < 1.5 && o !== l);
          const ok = rtl ? line.every((o) => o.x1 <= l.x0 + 0.5) : line.every((o) => o.x0 >= l.x1 - 0.5);
          if (!ok && pinnedFirst) worst = { page: k, row: d, line: line.map((o) => [o.text, o.x0, o.x1]), at: [l.x0, l.x1] };
          pinnedFirst &&= ok;
        }
      }
    });
    const want = Array.from({ length: rows }, (_, i) => String(i + 1).padStart(4, '0'));
    const once = want.every((n) => seenD.get(n)?.length === 1 && seenC.get(n)?.length === 1);
    const split = want.filter((n) => seenD.get(n)?.[0] !== seenC.get(n)?.[0]);
    check(name, `print ${label}: ${rows} rows, each printed once, none cut across two pages (its first and last cell on one page; ${pages.length} pages, built in ${built} ms)`, once && split.length === 0 && seenD.size === rows, { size: seenD.size, split: split.slice(0, 5), missing: want.filter((n) => !seenD.has(n)).slice(0, 5) });
    // The header rows on every page: the same lines above the first row on pages 2…n, and those on page 1 too (with the caption, the note).
    const rest = heads.slice(1).map((x) => JSON.stringify(x));
    const same = rest.every((x) => x === rest[0]);
    const first = JSON.parse(rest[0] ?? '[]');
    const onFirst = first.every((x) => heads[0].includes(x));
    const words = rtl ? first.length === 14 : ['Dossier', 'Code', 'Patient', 'Constantes', 'Nom'].every((w) => first.some((x) => x.split(' ').includes(w)));
    check(name, `print ${label}: the header rows (the groups and the 12 column headers) at the top of every page`, pages.length > 1 && same && onFirst && words, { first, p1: heads[0], differs: heads.findIndex((x, i) => i > 0 && JSON.stringify(x) !== rest[0]) });
    const extra = heads[0].filter((x) => !first.includes(x));
    check(name, `print ${label}: the caption on page 1 only${rows === 5000 ? ', and the truncation line' : ''}`, extra.length >= (rows === 5000 ? 2 : 1) && (rtl || extra.some((x) => x.includes(title))) && (rows !== 5000 || (looks.note && /5\D?000/.test(looks.note) && /5\D?001/.test(looks.note))), { extra, note: looks.note });
    check(name, `print ${label}: the pinned column « Dossier » first (${rtl ? 'rightmost' : 'leftmost'}) on every row`, pinnedFirst, worst);
    // The cleanup: the screen grid as it was.
    await page.evaluate(() => window.undo());
    const after = await page.evaluate(() => ({ html: document.querySelector('#host').innerHTML.length, top: document.querySelector('.dzg-viewport').scrollTop, box: document.querySelectorAll('.dzg-print').length, marker: document.documentElement.classList.contains('dzg-printing') }));
    check(name, `print ${label}: the cleanup leaves the screen grid as it was`, after.box === 0 && !after.marker && after.html === screen.html && after.top === screen.top, { screen, after });
    check(name, `print ${label}: no page error`, errors.length === 0, errors);
    await page.close();
  }

  // `print()`: the dialog (stubbed) opened once, then `afterprint` cleans up; the « Imprimer » button does the same.
  {
    const { page, errors } = await open('lang=ar');
    await page.evaluate(() => { window.calls = []; window.print = () => window.calls.push([document.querySelectorAll('.dzg-print').length, document.documentElement.classList.contains('dzg-printing')]); });
    await page.evaluate(() => document.querySelector('.dzg-viewport').scrollTo(0, 3000));
    await frames(page, 3);
    const before = await page.evaluate(() => ({ top: document.querySelector('.dzg-viewport').scrollTop, rows: [...document.querySelectorAll('.dzg-layer > .dzg-row')].map((r) => r.getAttribute('aria-rowindex')).join() }));
    await page.click('#print');
    await page.waitForFunction(() => window.calls.length === 1);
    const during = await page.evaluate(() => ({ calls: window.calls, dir: document.querySelector('.dzg-print table').getAttribute('dir'), lang: document.querySelector('.dzg-print table').getAttribute('lang'), rows: document.querySelector('.dzg-print tbody').rows.length }));
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await frames(page, 2);
    const after = await page.evaluate(() => ({ top: document.querySelector('.dzg-viewport').scrollTop, rows: [...document.querySelectorAll('.dzg-layer > .dzg-row')].map((r) => r.getAttribute('aria-rowindex')).join(), box: document.querySelectorAll('.dzg-print').length, marker: document.documentElement.classList.contains('dzg-printing') }));
    check(name, 'print(): « طباعة » prepares the table (rtl, ar, 1 200 rows), opens the dialog once; afterprint removes it, the screen grid unchanged (scroll, rows)', JSON.stringify(during.calls) === '[[1,true]]' && during.dir === 'rtl' && during.lang === 'ar' && during.rows === 1200 && after.box === 0 && !after.marker && after.top === before.top && after.rows === before.rows, { during, before, after });
    check(name, 'print(): no page error', errors.length === 0, errors);
    await page.close();
  }

  // orders.html: its « Imprimer » button, the orders shown (a tree: the open sub-orders indented), as a table.
  {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/orders.html`);
    await page.waitForSelector('.dzg-layer .dzg-row');
    await page.evaluate(() => { window.calls = 0; window.print = () => { window.calls++; window.rowsPrinted = document.querySelector('.dzg-print tbody').rows.length; }; });
    await page.click('#print');
    await page.waitForFunction(() => window.calls === 1);
    const r = await page.evaluate(() => ({ rows: window.rowsPrinted, shown: window.demo.grid.kernel.rows.displayed.count, caption: document.querySelector('.dzg-print caption')?.textContent }));
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    check(name, 'orders.html: « Imprimer » prints the orders shown, captioned with the page title', r.rows === r.shown && r.rows > 0 && !!r.caption, r);
    check(name, 'orders.html: no page error', errors.length === 0, errors);
    await page.close();
  }
}
