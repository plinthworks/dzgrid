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

/**
 * Phase 11 L5 (docs/behaviors/print.md 10–14; `npm run test:browser -- --only paper [--all | --engine <e>]`): the grid on
 * paper, on the browser suite's own page `paper.html` (no playground). Each engine's own print, with no `print()` called
 * where the page has the hook (`menu=1`): Chrome's `page.pdf()` (it sends `beforeprint` and `afterprint`); Firefox's
 * « Save to PDF » printer reached by `window.print()`, silent, to a file — one Firefox per file, the file being a launch
 * preference; both read back as text with each line's colour. WebKit cannot print to a file in Playwright: `beforeprint`
 * sent by hand, its print media emulated (no pages: repetition and breaks unverified), computed rules and a screenshot.
 * Then, in Chrome alone, the timing at 4× CPU (L3's tooling: `perf-features.html`, minified, CDP throttle). It opens its
 * own browsers, one at a time, each closed in `finally`.
 */
export async function paperChecks(name, h) {
  const { check, frames, site, OUT } = h;
  const { chromium, firefox, webkit } = await import('playwright-core');
  const { existsSync, statSync, rmSync } = await import('node:fs');
  const { serve } = await import('../spikes/kit.mjs');
  const read = (file) => JSON.parse(execFileSync('python3', ['-I', `${ROOT}scripts/pdf-text.py`, file], { timeout: 240_000, maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8'));
  const launch = (prefs) => (name === 'chrome' ? chromium.launch({ channel: 'chrome', headless: true }) : name === 'firefox' ? firefox.launch({ headless: true, firefoxUserPrefs: prefs }) : webkit.launch({ headless: true }));
  // Firefox's PDF printer: silent, to `file`, A4, no page headers or footers (title, address, date, page number).
  const ffPrefs = (file) => {
    const P = 'print.printer_Mozilla_Save_to_PDF.';
    const o = { 'print.always_print_silent': true, print_printer: 'Mozilla Save to PDF', 'print.show_print_progress': false, [`${P}print_to_file`]: true, [`${P}print_to_filename`]: file, [`${P}print_paper_id`]: 'iso_a4', [`${P}print_paper_width`]: '210', [`${P}print_paper_height`]: '297', [`${P}print_paper_size_unit`]: 1 };
    for (const s of ['header', 'footer']) for (const k of ['left', 'center', 'right']) o[`print.print_${s}${k}`] = o[`${P}print_${s}${k}`] = '';
    return o;
  };
  const open = async (b, qs) => {
    const page = await (await b.newContext()).newPage();
    await page.setViewportSize({ width: 1000, height: 800 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(site.root(`packages/dom/test/browser/paper.html?${qs}`));
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
    await page.waitForSelector('.dzg-layer .dzg-row');
    await frames(page, 3);
    return { page, errors };
  };
  const after = (page) => page.evaluate(() => ({ box: document.querySelectorAll('.dzg-print').length, marker: document.documentElement.classList.contains('dzg-printing') }));
  /** The page printed by the engine itself: its PDF read back, the page's errors, what is left in the page after. */
  const paper = async (qs, tag) => {
    const file = `${OUT}/paper-${name}-${tag}.pdf`;
    rmSync(file, { force: true });
    const b = await launch(ffPrefs(file));
    try {
      const { page, errors } = await open(b, qs);
      const hook = await page.evaluate(() => window.t.hooked);
      if (name === 'chrome') await page.pdf({ path: file, format: 'A4', preferCSSPageSize: true });
      else {
        await page.evaluate(() => window.print());
        // Firefox writes the file as it goes, a first %%EOF included, and pauses mid-way on a long list (5 001 rows: read
        // at one page after a 1 s pause, 201 pages after a 7.5 s one): read it once it ends with %%EOF and its size held
        // for 7.5 s; four minutes at most.
        const { readFileSync } = await import('node:fs');
        const ended = () => existsSync(file) && readFileSync(file).subarray(-32).toString('latin1').includes('%%EOF');
        let size = -1;
        for (let k = 0, still = 0; k < 960 && !(still >= 30 && ended()); k++) {
          await new Promise((r) => setTimeout(r, 250));
          const s = existsSync(file) ? statSync(file).size : -1;
          still = s > 0 && s === size ? still + 1 : 0;
          size = s;
        }
      }
      await frames(page, 2);
      let pages = [];
      try {
        pages = read(file);
      } catch (e) {
        errors.push(`the PDF could not be read: ${String(e.message).slice(0, 120)}`);
      }
      return { pages, errors, left: await after(page), hook };
    } finally {
      await b.close();
    }
  };
  /** Each page's rows, top to bottom: `anchor(text)` names a line's row (null: not a row's anchor). */
  const rowsOf = (pages, anchor) => pages.map((p) => p.lines.map((l) => ({ ...l, a: anchor(l.text) })).filter((l) => l.a).sort((x, y) => y.y1 - x.y1));
  /** The lines above a page's first row: its header rows (and on page 1 the caption, the note). */
  const headsOf = (pages, rows) => pages.map((p, k) => p.lines.filter((l) => l.y0 > (rows[k][0]?.y1 ?? Infinity) + 1).map((l) => l.text).sort());
  const dark = (c) => c.length > 0 && Math.max(...c) <= 0.3;
  const D = (t) => /^D(\d{4})$/.exec(t)?.[1];
  const C = (t) => /^C(\d{4})$/.exec(t)?.[1];
  /** Every one of `n` rows printed once, its first and last cell on one page. */
  const once = (pages, n) => {
    const d = new Map();
    const c = new Map();
    pages.forEach((p, k) => p.lines.forEach((l) => { const x = D(l.text); const y = C(l.text); if (x) d.set(x, [...(d.get(x) ?? []), k]); if (y) c.set(y, [...(c.get(y) ?? []), k]); }));
    const want = Array.from({ length: n }, (_, i) => String(i + 1).padStart(4, '0'));
    const bad = want.filter((x) => d.get(x)?.length !== 1 || c.get(x)?.length !== 1 || d.get(x)[0] !== c.get(x)[0]);
    return { ok: bad.length === 0 && d.size === n, bad: bad.slice(0, 5), d: d.size, c: c.size };
  };
  const repeated = (heads, words) => {
    const rest = heads.slice(1).map((x) => JSON.stringify(x));
    // The words looked for in the header lines' joined text: pdfminer may join two short neighbours into one line.
    const text = ` ${JSON.parse(rest[0] ?? '[]').join(' ')} `;
    return heads.length > 1 && rest.every((x) => x === rest[0]) && words.every((w) => text.includes(` ${w} `)) && JSON.parse(rest[0]).every((x) => heads[0].includes(x));
  };

  if (name !== 'webkit') {
    const how = name === 'chrome' ? 'page.pdf()' : 'its PDF printer';
    // 10: the browser's own print, the hook on: the whole list, the headers on every page, nothing left after.
    for (const [qs, tag, rtl] of [['menu=1', 'menu-fr', false], ['menu=1&locale=ar-DZ', 'menu-ar', true]]) {
      const r = await paper(qs, tag);
      const o = once(r.pages, 1200);
      const rows = rowsOf(r.pages, D);
      const heads = headsOf(r.pages, rows);
      check(name, `paper ${tag}: the browser's own print (${how}, no print() called) prints all 1 200 rows, each once and whole, on ${r.pages.length} pages`, r.hook && o.ok, { hook: r.hook, ...o, pages: r.pages.length });
      const words = rtl ? ['SpO2'] // Arabic comes out of pdfminer in visual order, letters missing: the same lines on every page, and SpO₂
        : ['Dossier', 'Nom', 'Naissance', 'Service', 'Chambre', 'Pouls', 'Temp.', 'Tension', 'SpO2', 'Médecin', 'Statut', 'Code'];
      check(name, `paper ${tag}: the column headers at the top of every page`, repeated(heads, words), heads.slice(0, 2));
      check(name, `paper ${tag}: afterprint removed the table and the marker; no page error`, r.left.box === 0 && !r.left.marker && r.errors.length === 0, { ...r.left, errors: r.errors });
    }
    // 13: a dark page printed by the hook: every line black (the caption, the truncation line, the cells).
    {
      const r = await paper('menu=1&theme=dark&rows=5001', 'dark-5001');
      const light = r.pages.flatMap((p) => p.lines).filter((l) => !dark(l.color));
      const o = once(r.pages, 5000);
      check(name, `paper dark-5001: a dark page's print is black on white, the truncation line too (${light.length} light lines), 5 000 rows once`, light.length === 0 && o.ok && r.pages[0]?.lines.some((l) => /5\D?000/.test(l.text) && /5\D?001/.test(l.text)), { light: light.slice(0, 4), ...o });
    }
    // 13: the fallback, no hook, a dark page: the screen grid printed, in the light scheme.
    {
      const r = await paper('theme=dark', 'fallback-dark');
      const cells = r.pages.flatMap((p) => p.lines).filter((l) => D(l.text) || /^Patient \d+$/.test(l.text));
      const light = cells.filter((l) => !dark(l.color));
      check(name, `paper fallback-dark: without the hook the screen grid prints, its text dark on the paper (${cells.length} cells read, ${light.length} light)`, cells.length > 0 && light.length === 0, { light: light.slice(0, 4), pages: r.pages.length });
    }
    // 12: a wide list (16 columns, long notes with spaces, landscape by @page): nothing past the page's edge, every row's
    // first and last cell on one page, no id cut. Then the limit (`solid=1`: 28 columns, notes without a space, portrait):
    // measured and printed, not a check.
    {
      const r = await paper('menu=1&kind=wide&rows=300', 'wide');
      const out = r.pages.flatMap((p, k) => p.lines.filter((l) => l.x0 < -0.5 || l.x1 > p.width + 0.5).map((l) => [k, l.text, l.x0, l.x1]));
      const o = once(r.pages, 300);
      check(name, `paper wide: 16 columns with long notes fit the landscape page (${out.length} lines past an edge), every row whole, no id cut`, out.length === 0 && o.ok && r.pages[0]?.width > r.pages[0]?.height, { out: out.slice(0, 4), ...o, width: r.pages[0]?.width });
      const solid = await paper('menu=1&kind=wide&solid=1&rows=60', 'wide-solid');
      const past = solid.pages.flatMap((p) => p.lines.filter((l) => l.x1 > p.width + 0.5));
      console.log(`       paper wide-solid (the limit, print.md 12): ${past.length} lines past the page's edge, ${once(solid.pages, 60).c} of 60 last cells on the page`);
    }
    // 11: grouped (300 teams, footers, grand total): no page ends on a group row, none starts with a totals row.
    {
      const r = await paper('menu=1&kind=grouped', 'grouped');
      const anchor = (t) => (/^R\d{5}$/.test(t) ? 'data' : /^Équipe \d{3} \(\d+\)$/.test(t) ? 'group' : /^Total( Équipe \d{3})?$/.test(t) ? 'footer' : null);
      const rows = rowsOf(r.pages, anchor);
      const ends = rows.slice(0, -1).map((p, k) => [k, p.at(-1)?.a, p.at(-1)?.text]).filter((x) => x[1] === 'group');
      const starts = rows.slice(1).map((p, k) => [k + 1, p[0]?.a, p[0]?.text]).filter((x) => x[1] === 'footer');
      const counts = rows.flat().reduce((m, l) => ((m[l.a] = (m[l.a] ?? 0) + 1), m), {});
      check(name, `paper grouped: 300 group rows, 301 totals rows, 1 503 rows printed once on ${r.pages.length} pages`, counts.group === 300 && counts.footer === 301 && counts.data === 1503, counts);
      // Firefox does not honour `break-before: avoid` between table rows (16 pages began with a totals row, 2026-11-08):
      // « where the engine allows » (print.md 11) — counted and printed there, checked in Chrome.
      if (name === 'firefox') console.log(`       paper grouped (Firefox, the engine's limit): ${ends.length} pages end on a group row, ${starts.length} begin with a totals row`);
      else check(name, `paper grouped: no page ends on a group row (${ends.length}), none starts with a totals row (${starts.length})`, ends.length === 0 && starts.length === 0, { ends: ends.slice(0, 4), starts: starts.slice(0, 4) });
      check(name, `paper grouped: the headers on every page; no page error`, repeated(headsOf(r.pages, rows), ['Équipe', 'Numéro', 'Heures']) && r.errors.length === 0, { heads: headsOf(r.pages, rows).slice(0, 2), errors: r.errors });
    }
    // 11: the pivot's month bands on every page, above the value headers; each town once.
    {
      const r = await paper('menu=1&kind=pivot', 'pivot');
      const rows = rowsOf(r.pages, (t) => /^V(\d{3})\b/.exec(t)?.[1] ?? null);
      const heads = headsOf(r.pages, rows);
      const towns = new Map();
      rows.flat().forEach((l) => towns.set(l.a, (towns.get(l.a) ?? 0) + 1));
      const bands = heads.every((x) => ['M01', 'M02', 'M03', 'M04'].every((m) => x.some((t) => t.split(' ').includes(m))));
      const out = r.pages.flatMap((p) => p.lines.filter((l) => l.x0 < -0.5 || l.x1 > p.width + 0.5));
      check(name, `paper pivot (landscape by @page): the four month bands at the top of every page (${r.pages.length} pages), each of the 150 towns once, nothing past an edge; no page error`, r.pages.length > 1 && r.pages[0].width > r.pages[0].height && bands && out.length === 0 && towns.size === 150 && [...towns.values()].every((n) => n === 1) && r.errors.length === 0, { heads: heads.slice(0, 2), towns: towns.size, out: out.length, size: [r.pages[0]?.width, r.pages[0]?.height], errors: r.errors });
    }
  } else {
    // WebKit: `beforeprint` sent by hand (the hook's table is whole at once), the print media emulated, a screenshot.
    const b = await launch();
    try {
      for (const [qs, tag, n] of [['menu=1', 'menu-fr', 1200], ['menu=1&locale=ar-DZ&theme=dark', 'menu-ar-dark', 1200], ['menu=1&kind=wide&rows=300', 'wide', 300], ['menu=1&kind=grouped', 'grouped', 2104], ['menu=1&kind=pivot', 'pivot', 0]]) {
        const { page, errors } = await open(b, qs);
        // The emulation has no page: the landscape pages (`@page`, wide and pivot) measured at A4 landscape's width.
        if (/kind=(wide|pivot)/.test(qs)) await page.setViewportSize({ width: 1123, height: 794 });
        const sync = await page.evaluate(() => { dispatchEvent(new Event('beforeprint')); return document.querySelector('.dzg-print tbody')?.rows.length ?? -1; });
        await page.emulateMedia({ media: 'print' });
        const looks = await page.evaluate(() => {
          const s = (q) => getComputedStyle(document.querySelector(q));
          const box = document.querySelector('.dzg-print');
          return { head: s('.dzg-print thead').display, tr: s('.dzg-print tbody tr').breakInside, td: s('.dzg-print td').color, caption: s('.dzg-print caption').color, fits: document.querySelector('.dzg-print table').getBoundingClientRect().width <= box.getBoundingClientRect().width + 0.5, grid: s('main').display, firstAfter: document.querySelector('.dzg-print-group:not(.dzg-print-footer) + :not(.dzg-print-group)') ? s('.dzg-print-group:not(.dzg-print-footer) + :not(.dzg-print-group)').breakBefore : null, footBefore: document.querySelector('.dzg-print-footer') ? s('.dzg-print-footer').breakBefore : null };
        });
        await page.screenshot({ path: `${OUT}/paper-webkit-${tag}.png`, fullPage: false });
        await page.emulateMedia({ media: 'screen' });
        await page.evaluate(() => dispatchEvent(new Event('afterprint')));
        const left = await after(page);
        const black = looks.td === 'rgb(0, 0, 0)' && looks.caption === 'rgb(0, 0, 0)';
        check(name, `paper ${tag}: beforeprint builds the whole table at once${n ? ` (${n} lines)` : ''}; in print media thead repeated, rows unbroken, black on white, the table within its box${tag === 'grouped' ? ', a group’s first row kept with it, totals with the row before' : ''}; afterprint removes it`,
          (n ? sync === n : sync > 0) && looks.head === 'table-header-group' && looks.tr === 'avoid' && black && looks.fits && looks.grid === 'none' && (tag !== 'grouped' || (looks.firstAfter === 'avoid' && looks.footBefore === 'avoid')) && left.box === 0 && !left.marker && errors.length === 0, { sync, looks, left, errors });
        await page.close();
      }
      const { page, errors } = await open(b, 'theme=dark');
      await page.emulateMedia({ media: 'print' });
      const fg = await page.evaluate(() => getComputedStyle(document.querySelector('.dzg-cell')).color);
      const lum = (fg.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      check(name, `paper fallback-dark: without the hook, the screen grid in print media is in the light scheme (cell text ${fg})`, lum.length === 3 && Math.max(...lum) <= 80 && errors.length === 0, { fg, errors });
      await page.screenshot({ path: `${OUT}/paper-webkit-fallback-dark.png` });
    } finally {
      await b.close();
    }
  }

  // The timing at 4× CPU (Chrome, L3's tooling): 5 000 rows of A (30 columns) by print()'s slices, and by the hook at once.
  if (name === 'chrome') {
    const fast = await serve(import.meta.url, { minify: true });
    const b = await launch();
    try {
      const page = await b.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(fast.root('packages/dom/test/browser/perf-features.html'));
      await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
      await page.evaluate(() => window.p.prepare?.());
      await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const sliced = [];
      const menu = [];
      for (let k = 0; k < 3; k++) sliced.push(await page.evaluate(() => window.p.print()));
      for (let k = 0; k < 3; k++) menu.push(await page.evaluate(() => window.p.menu()));
      const med = (xs) => [...xs].sort((a, b) => a - b)[1];
      console.log(`       4× print(): ${sliced.map((x) => `${Math.round(x.ms)} ms, longest task ${Math.round(x.longtask)}`).join('; ')}`);
      console.log(`       4× the hook: ${menu.map((x) => `${Math.round(x.ms)} ms, ${x.rows} rows`).join('; ')}`);
      check(name, `paper 4×: print() builds 5 000 × 30 in ${Math.round(med(sliced.map((x) => x.ms)))} ms (budget 342), longest frame ${Math.round(Math.max(...sliced.map((x) => x.loaf)))} ms (budget 100); the hook at once in ${Math.round(med(menu.map((x) => x.ms)))} ms`,
        sliced.every((x) => x.rows === 5000) && menu.every((x) => x.rows === 5000) && med(sliced.map((x) => x.ms)) <= 342 && Math.max(...sliced.map((x) => x.loaf)) <= 100, { sliced, menu });
    } finally {
      await b.close();
      await fast.close();
    }
  }
}
