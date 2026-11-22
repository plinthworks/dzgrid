/**
 * 1.17.0 in real browsers (owner 2026-11-21 « on passe au filtre avancé… en autonome »): the advanced filter's builder
 * (docs/behaviors/advanced-filter.md 9–17) on `playground/v1-17.html` (not committed). Its own Vite on 127.0.0.1:4717
 * from this tree (never the owner's 4700), or DZG_PLAYGROUND. Chrome, Firefox and WebKit one after another, each closed
 * in a `finally`; French light and Arabic dark right to left. `--engine chrome|firefox|webkit`.
 *
 * Per engine and language:
 * - the page's button says it opens a dialog; Enter on it opens the builder, a modal dialog in the window, the focus on
 *   the first column list; the owner's example set by the api, `(Statut = Erreur OU Statut = Alerte) ET Jour ≥
 *   2026-11-01`, shown back in the forms (the lists, the ticks, the day's field); 14 rows of 40;
 * - the keys: Alt+ArrowDown to the next condition's list, Tab to « + Condition » and Enter (said « Condition ajoutée »,
 *   the focus on the new list), a column and an operator chosen, a number typed, Enter applies: 4 rows;
 * - Escape drops a draft and gives the focus back to the button; « Supprimer la condition » by Enter moves the focus;
 * - the look: the root group's line on its inline start (right in Arabic), in the accent; Apply in the accent; the dialog
 *   carries the grid's direction; axe 0 with the dialog open; no page error.
 *
 * `--only pdf` (the PDF export, docs/behaviors/pdf-export.md; page `playground/v1-17-pdf.html`, not committed; `--only
 * filter` the builder alone): per engine, the page's « PDF » button downloads a `.pdf` (a real `<a download>`), read
 * back by the test-only reader (core/test/support/pdf-read.ts: the frame, the pages, the header on each, « x / y », the
 * title on the first, the footer on the last, every row once), the same text in the three engines, Ghostscript happy
 * with it when installed, `exportFinished` done; an Arabic grid refused (`pdf-script`, nothing downloads); 10 000 rows ×
 * 10 columns timed (click to download) and weighed. Then Chrome opens the file in its PDF viewer and a page is
 * screenshot (its path printed, to be looked at).
 *
 * `--only full` (1.17.0 fix, spans.md « A full-width row drawn by a part »; page `playground/v1-17-full.html`, not
 * committed): per engine, left to right and right to left, a full-width row naming a part (`{ part: 'note' }`) 72 px
 * tall among 32 px rows (`rowHeights()`): the part's element in the one cell, as tall as the row, the cell as wide as
 * the view from its inline start, still there after a sideways scroll; the other rows keep their text, no part.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { browser } from '../spikes/kit.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 4717;
const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1]; };
const engines = arg('--engine') ? [arg('--engine')] : ['chrome', 'firefox', 'webkit'];
const only = arg('--only');
let fails = 0;
let passes = 0;
const check = (name, ok, detail = '') => { ok ? passes++ : fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === '' ? '' : ` — ${JSON.stringify(detail)}`}`); };
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

async function serve() {
  if (process.env.DZG_PLAYGROUND) return { base: process.env.DZG_PLAYGROUND, stop: async () => {} };
  const vite = spawn(process.execPath, [`${ROOT}node_modules/vite/bin/vite.js`, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  vite.stdout.on('data', (d) => (log += d));
  vite.stderr.on('data', (d) => (log += d));
  const base = `http://127.0.0.1:${PORT}`;
  for (let i = 0; ; i++) {
    if (vite.exitCode !== null) throw new Error(`vite on ${PORT} did not start: ${log}`);
    try { if ((await fetch(`${base}/v1-17.html`)).ok) break; } catch { /* not yet */ }
    if (i > 120) throw new Error(`vite on ${PORT}: no answer after 30 s`);
    await new Promise((r) => setTimeout(r, 250));
  }
  return { base, stop: () => new Promise((r) => (vite.once('exit', r), vite.kill('SIGTERM'), setTimeout(() => (vite.kill('SIGKILL'), r()), 3000))) };
}

const EXAMPLE = (S) => ({
  join: 'and',
  items: [
    { join: 'or', items: [{ column: 'status', filter: { type: 'set', include: [S[0], S[1]] } }] },
    { column: 'day', filter: { type: 'day', op: 'gte', value: '2026-11-01' } },
  ],
});

const server = await serve();
try {
  if (only === 'full') await fullChecks();
  for (const name of only === 'pdf' || only === 'full' ? [] : engines) {
    const B = await browser(name);
    try {
      for (const [lang, dark] of [['fr', false], ['ar', true]]) {
        const tag = `${name} ${lang} ${dark ? 'dark' : 'light'}`;
        const ctx = await B.newContext({ viewport: { width: 1040, height: 720 } });
        try {
          const page = await ctx.newPage();
          const errors = [];
          page.on('pageerror', (e) => errors.push(String(e)));
          await page.goto(`${server.base}/v1-17.html?${lang === 'ar' ? 'lang=ar' : ''}${dark ? '&dark' : ''}`);
          await page.waitForSelector('.dzg-row');
          const count = () => page.evaluate(() => window.grid.kernel.rows.displayed.count);
          const S = await page.evaluate(() => window.S);
          const btn = page.locator('#adv');
          check(`${tag}: the button says it opens a dialog, closed`, (await btn.getAttribute('aria-haspopup')) === 'dialog' && (await btn.getAttribute('aria-expanded')) === 'false');

          // The owner's example, set by the api, then opened by the keyboard.
          await page.evaluate((e) => window.adv.set(e), EXAMPLE(S));
          check(`${tag}: the example filters 14 rows of 40`, (await count()) === 14, await count());
          await btn.focus();
          await page.keyboard.press('Enter');
          await page.waitForSelector('.dzg-adv-pop .dzg-adv-c');
          // The set list and the day form load on demand.
          await page.waitForSelector('.dzg-adv-pop [role=option]');
          await page.waitForSelector('.dzg-adv-pop .dzg-adv-form[data-kind=day] .tz-field__trigger');
          await frames(page);
          const open = await page.evaluate(() => {
            const d = document.querySelector('.dzg-adv-pop');
            const r = d.getBoundingClientRect();
            const sels = [...d.querySelectorAll('.dzg-adv-col select')];
            const ticked = [...d.querySelectorAll('.dzg-adv-form[data-kind=set] [role=option][aria-selected=true]')].map((o) => o.textContent);
            const day = d.querySelector('.dzg-adv-form[data-kind=day] .tz-field__trigger')?.getAttribute('aria-label') ?? '';
            return {
              role: d.getAttribute('role'), modal: d.getAttribute('aria-modal'), title: document.getElementById(d.getAttribute('aria-labelledby'))?.textContent,
              inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, dir: d.dir,
              focus: document.activeElement === sels[0], cols: sels.map((s) => s.value), ticked, day,
              expanded: document.getElementById('adv').getAttribute('aria-expanded'),
            };
          });
          check(`${tag}: Enter on the button opens a modal dialog named by its title, in the window, the focus on the first column`,
            open.role === 'dialog' && open.modal === 'true' && !!open.title && open.inside && open.focus && open.expanded === 'true', open);
          check(`${tag}: the dialog carries the grid's direction`, open.dir === (lang === 'ar' ? 'rtl' : 'ltr'), open.dir);
          // A long expression: the groups scroll, Apply stays in the window.
          for (let i = 0; i < 2; i++) await page.evaluate(() => document.querySelector('.dzg-adv-root > .dzg-adv-g > .dzg-adv-acts > .dzg-adv-add').click());
          await frames(page);
          const fit = await page.evaluate(() => {
            const a = document.querySelector('.dzg-adv-apply').getBoundingClientRect();
            const t = document.querySelector('.dzg-adv-tree');
            return { apply: a.top >= 0 && a.bottom <= innerHeight, scrolls: t.scrollHeight > t.clientHeight };
          });
          check(`${tag}: a long expression scrolls between the title and the buttons, Apply in the window`, fit.apply, fit);
          // The two empty conditions added are left out at Apply; removed now to keep the walk below.
          for (let i = 0; i < 2; i++) await page.evaluate(() => [...document.querySelectorAll('.dzg-adv-pop .dzg-adv-rm')].at(-1).click());
          await page.locator('.dzg-adv-pop .dzg-adv-col select').first().focus();
          check(`${tag}: the expression in force shown back: the columns, the ticks, the day`,
            open.cols.join() === 'status,day' && open.ticked.some((t) => t.includes(S[0])) && open.ticked.some((t) => t.includes(S[1])) && !open.ticked.some((t) => t.includes(S[2])) && /2026|٢٠٢٦/.test(open.day), open);

          // The look: the root line on the inline start in the accent, Apply in the accent.
          const look = await page.evaluate((rtl) => {
            const g = document.querySelector('.dzg-adv-root > .dzg-adv-g');
            const cs = getComputedStyle(g);
            const probe = document.createElement('span');
            probe.style.color = 'var(--tz-accent)';
            g.append(probe);
            const accent = getComputedStyle(probe).color;
            probe.remove();
            const ap = getComputedStyle(document.querySelector('.dzg-adv-apply'));
            return { start: rtl ? cs.borderRightWidth : cs.borderLeftWidth, startColor: rtl ? cs.borderRightColor : cs.borderLeftColor, accent, apply: ap.backgroundColor };
          }, lang === 'ar');
          check(`${tag}: the root group's line on its inline start, in the accent; Apply in the accent`, look.start === '3px' && look.startColor === look.accent && look.apply === look.accent, look);

          // axe with the dialog open.
          await page.addScriptTag({ path: `${ROOT}node_modules/axe-core/axe.min.js` });
          const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.length} (${x.nodes[0]?.target?.join(' ')})`));
          check(`${tag}: axe 0 with the dialog open`, v.length === 0, v);

          // Keys: Alt+ArrowDown to the next list; then « + Condition » of the root by Tab and Enter.
          await page.keyboard.press('Alt+ArrowDown');
          check(`${tag}: Alt+ArrowDown goes to the next condition's list`, await page.evaluate(() => document.activeElement === document.querySelectorAll('.dzg-adv-pop .dzg-adv-col select')[1]));
          await page.locator('.dzg-adv-root > .dzg-adv-g > .dzg-adv-acts > .dzg-adv-add').focus();
          await page.keyboard.press('Enter');
          await page.waitForTimeout(120);
          const added = await page.evaluate(() => {
            const sels = document.querySelectorAll('.dzg-adv-pop .dzg-adv-col select');
            return { n: sels.length, focus: document.activeElement === sels[sels.length - 1], said: document.querySelector('.dzg [aria-live=polite]')?.textContent ?? '' };
          });
          check(`${tag}: Enter on « + Condition » adds one, focused, said`, added.n === 3 && added.focus && added.said === (lang === 'ar' ? 'أُضيف شرط' : 'Condition ajoutée'), added);
          await page.locator('.dzg-adv-pop .dzg-adv-col select').nth(2).selectOption('n');
          await page.waitForSelector('.dzg-adv-pop .dzg-adv-c >> nth=2 >> select.dzg-fop');
          await page.locator('.dzg-adv-pop .dzg-adv-c').nth(2).locator('select.dzg-fop').selectOption('gt');
          const val = page.locator('.dzg-adv-pop .dzg-adv-c').nth(2).locator('input.dzg-fval');
          await val.focus();
          await page.keyboard.type('30');
          await page.keyboard.press('Enter');
          await page.waitForTimeout(50);
          const applied = await page.evaluate(() => ({ open: !!document.querySelector('.dzg-adv-pop'), focus: document.activeElement?.id, n: window.grid.kernel.rows.displayed.count, items: window.adv.get()?.items?.length }));
          check(`${tag}: typed « 30 », Enter applies the whole draft: 4 rows, the focus back on the button`, !applied.open && applied.n === 4 && applied.items === 3 && applied.focus === 'adv', applied);

          // Escape drops a draft; Enter on « Supprimer la condition » moves the focus.
          await btn.focus();
          await page.keyboard.press('Enter');
          await page.waitForSelector('.dzg-adv-pop .dzg-adv-rm');
          await page.locator('.dzg-adv-pop .dzg-adv-rm').last().focus();
          await page.keyboard.press('Enter');
          const rm = await page.evaluate(() => ({ n: document.querySelectorAll('.dzg-adv-pop .dzg-adv-c').length, tag: document.activeElement?.tagName, inDialog: !!document.activeElement?.closest('.dzg-adv-pop') }));
          check(`${tag}: Enter on « Supprimer la condition » removes it, the focus on the item before`, rm.n === 2 && rm.tag === 'SELECT' && rm.inDialog, rm);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(30);
          const esc = await page.evaluate(() => ({ open: !!document.querySelector('.dzg-adv-pop'), focus: document.activeElement?.id, n: window.grid.kernel.rows.displayed.count }));
          check(`${tag}: Escape drops the draft (4 rows still), the focus back on the button`, !esc.open && esc.focus === 'adv' && esc.n === 4, esc);
          check(`${tag}: no page error`, errors.length === 0, errors);
        } finally {
          await ctx.close();
        }
      }
    } finally {
      await B.close();
    }
  }
  if (only !== 'filter' && only !== 'full') await pdfChecks();
} finally {
  await server.stop();
}

async function pdfChecks() {
  const { readPdf } = await import(pathToFileURL(`${ROOT}packages/core/test/support/pdf-read.ts`).href);
  const OUT = join(tmpdir(), 'dzg-pdf-1-17');
  mkdirSync(OUT, { recursive: true });
  const gs = spawnSync('gs', ['--version']).status === 0;
  const pageTexts = (r) => r.pages.map((p) => p.runs.map((x) => x.text));
  let first = null;
  const timings = [];
  for (const name of engines) {
    const B = await browser(name);
    try {
      const ctx = await B.newContext({ acceptDownloads: true, viewport: { width: 1040, height: 720 } });
      try {
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        const tag = `${name} pdf`;
        await page.goto(`${server.base}/v1-17-pdf.html`);
        await page.waitForSelector('.dzg-row');
        const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.click('#pdf')]);
        const file = join(OUT, `grid-${name}.pdf`);
        await dl.saveAs(file);
        check(`${tag}: the button downloads a .pdf named as the export`, /^export-\d{4}-\d\d-\d\d-\d{4}\.pdf$/.test(dl.suggestedFilename()), dl.suggestedFilename());
        const bytes = new Uint8Array(readFileSync(file));
        const r = readPdf(bytes);
        const T = pageTexts(r);
        const P = T.length;
        check(`${tag}: a sound file (header, xref offsets, startxref, trailer), several pages`, r.errors.length === 0 && P >= 3, { errors: r.errors, P });
        check(`${tag}: the title and subtitle on the first page, the footer on the last only`, T[0][0] === 'Rapport des clients' && T[0][1] === '240 lignes' && T.at(-1).includes('Document interne') && !T.slice(0, -1).flat().includes('Document interne'), [T[0].slice(0, 3), T.at(-1).slice(-3)]);
        check(`${tag}: the header (group and columns) on top of every page, « x / y » at the bottom`, T.every((t, k) => t.includes('Identité') && t.includes('Montant') && t.at(-1) === `${k + 1} / ${P}`), T.map((t) => t.at(-1)));
        const names = T.flat().filter((t) => /^Client \d+$/.test(t));
        check(`${tag}: every row once, in order`, names.length === 240 && names.every((t, i) => t === `Client ${i}`), names.length);
        check(`${tag}: the screen's format (fr-FR currency: U+202F written as a space, the no-break space before € kept)`, T.flat().includes('1 234,50\u00a0€'), T[0].slice(0, 20));
        check(`${tag}: compressed by the browser (FlateDecode)`, Buffer.from(bytes).toString('latin1').includes('/Filter /FlateDecode'));
        if (first) check(`${tag}: the same text as Chrome's file`, JSON.stringify(T) === JSON.stringify(first));
        else first = T;
        if (gs) {
          const g = spawnSync('gs', ['-dNODISPLAY', '-dBATCH', '-dNOPAUSE', '-dPDFSTOPONERROR', '-q', '-sDEVICE=nullpage', file], { encoding: 'utf8' });
          check(`${tag}: Ghostscript reads every page, no error`, g.status === 0 && !/error|warning|repair/i.test(g.stdout + g.stderr), g.stderr);
        }
        const fin = await page.evaluate(() => window.events.filter((e) => e.type === 'exportFinished').map((e) => ({ outcome: e.outcome, format: e.format, rows: e.rows })));
        const phases = await page.evaluate(() => [...new Set(window.progress)]);
        check(`${tag}: exportFinished done, format pdf, 240 rows; progress preparing, building, saving`, fin.length === 1 && fin[0].outcome === 'done' && fin[0].format === 'pdf' && fin[0].rows === 240 && ['preparing', 'building', 'saving'].every((p) => phases.includes(p)), { fin, phases });

        const clean = errors.length;
        // Arabic: refused, nothing downloads.
        await page.goto(`${server.base}/v1-17-pdf.html?lang=ar&dark`);
        await page.waitForSelector('.dzg-row');
        let got = false;
        page.on('download', () => (got = true));
        await page.click('#pdf');
        await page.waitForFunction(() => window.events.some((e) => e.type === 'exportFinished'), null, { timeout: 30_000 });
        await page.waitForTimeout(500);
        const arab = await page.evaluate(() => ({ fin: window.events.find((e) => e.type === 'exportFinished'), problems: window.events.filter((e) => e.type === 'problems').flatMap((e) => e.problems.map((p) => p.code)), said: document.querySelector('.dzg [aria-live=polite]')?.textContent ?? '' }));
        check(`${tag}: an Arabic grid is refused — failed (pdf-script), nothing downloads, said`, !got && arab.fin?.outcome === 'failed' && arab.fin?.failure?.name === 'pdf-script' && arab.problems.includes('pdf-script') && arab.said !== '', arab);

        // 10 000 rows × 10 columns: click to download.
        await page.goto(`${server.base}/v1-17-pdf.html?rows=10000&cols=10`);
        await page.waitForSelector('.dzg-row');
        await page.evaluate(() => window.exporter.prefetch());
        await page.waitForTimeout(300);
        const t0 = Date.now();
        const [big] = await Promise.all([page.waitForEvent('download', { timeout: 300_000 }), page.click('#pdf')]);
        const bigFile = join(OUT, `big-${name}.pdf`);
        await big.saveAs(bigFile);
        const ms = Date.now() - t0;
        const size = statSync(bigFile).size;
        const br = readPdf(new Uint8Array(readFileSync(bigFile)));
        timings.push({ name, ms, size, pages: br.pages.length });
        check(`${tag}: 10 000 rows × 10 columns: a sound file (${ms} ms, ${(size / 1e6).toFixed(2)} MB, ${br.pages.length} pages)`, br.errors.length === 0 && br.pages.length > 100, br.errors.slice(0, 3));
        // The refused export's failure goes to the grid's error report (window.reportError), as every failed export's.
        check(`${tag}: no page error but the refused export's one report`, clean === 0 && errors.length === 1, errors);
      } finally {
        await ctx.close();
      }
    } finally {
      await B.close();
    }
  }
  console.log(`10 000 × 10: ${timings.map((t) => `${t.name} ${t.ms} ms, ${(t.size / 1e6).toFixed(2)} MB, ${t.pages} pages`).join('; ')}`);

  // Chrome's PDF viewer: the file opened, the first page screenshot.
  if (engines.includes('chrome')) {
    const B = await browser('chrome', { headless: false });
    try {
      const ctx = await B.newContext({ viewport: { width: 1000, height: 1100 } });
      try {
        const page = await ctx.newPage();
        await page.goto(pathToFileURL(join(OUT, 'grid-chrome.pdf')).href);
        await page.waitForTimeout(2500);
        const shot = join(OUT, 'chrome-viewer.png');
        await page.screenshot({ path: shot });
        const viewer = await page.evaluate(() => !!document.querySelector('embed[type="application/pdf"], embed[type="application/x-google-chrome-pdf"]') || document.contentType === 'application/pdf');
        check(`chrome pdf: Chrome's PDF viewer opens the file (screenshot ${shot})`, viewer, viewer);
      } finally {
        await ctx.close();
      }
    } finally {
      await B.close();
    }
  }
}
async function fullChecks() {
  for (const name of engines) {
    const B = await browser(name);
    try {
      for (const lang of ['fr', 'ar']) {
        const tag = `${name} full ${lang}`;
        const ctx = await B.newContext({ viewport: { width: 900, height: 600 } });
        try {
          const page = await ctx.newPage();
          const errors = [];
          page.on('pageerror', (e) => errors.push(String(e)));
          await page.goto(`${server.base}/v1-17-full.html${lang === 'ar' ? '?lang=ar' : ''}`);
          await page.waitForSelector('.dzg-row[data-full] .fw-note');
          await frames(page);
          const read = () => page.evaluate(() => {
            const vp = document.querySelector('.dzg-viewport').getBoundingClientRect();
            const row = document.querySelector('.dzg-layer > .dzg-row[data-full]');
            const cell = row.querySelector('.dzg-cell');
            const n = cell.querySelector('.fw-note');
            const r = (e) => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), h: Math.round(b.height), w: Math.round(b.width) }; };
            const plain = document.querySelector('.dzg-layer > .dzg-row:not([data-full]) [data-col="name"]');
            return { vp: r(document.querySelector('.dzg-viewport')), vpW: document.querySelector('.dzg-viewport').clientWidth, vpL: Math.round(vp.left), row: r(row), cell: r(cell), note: r(n), text: n.textContent, cells: row.querySelectorAll('.dzg-cell').length, plain: plain?.textContent ?? null, parts: document.querySelectorAll('.fw-note').length, fulls: document.querySelectorAll('.dzg-layer > .dzg-row[data-full]').length };
          });
          const a = await read();
          check(`${tag}: the part draws the full-width cell, the first column's text in its context`, a.cells === 1 && /^(Section|قسم) 1 — t0$/.test(a.text), a.text);
          check(`${tag}: one part per full-width row, none on the others`, a.parts === a.fulls && a.fulls > 0 && /^(Client|زبون) 0-0$/.test(a.plain), [a.parts, a.fulls, a.plain]);
          check(`${tag}: the row and the part are 72 px tall`, a.row.h === 72 && Math.abs(a.note.h - 72) <= 1 && Math.abs(a.cell.h - 72) <= 1, [a.row.h, a.cell.h, a.note.h]);
          const startEdge = (b) => (lang === 'ar' ? b.r : b.l);
          check(`${tag}: the cell as wide as the view, from its inline start`, Math.abs(a.cell.w - a.vpW) <= 2 && Math.abs(startEdge(a.cell) - startEdge(a.vp)) <= 2, [a.cell, a.vp, a.vpW]);
          await page.evaluate((rtl) => { const v = document.querySelector('.dzg-viewport'); v.scrollLeft = rtl ? -400 : 400; }, lang === 'ar');
          await frames(page, 3);
          const b = await read();
          check(`${tag}: after a sideways scroll the cell stays at the view's start`, Math.abs(startEdge(b.cell) - startEdge(b.vp)) <= 2 && b.text === a.text, [b.cell, b.vp]);
          if (name === 'chrome') {
            const shot = join(tmpdir(), `dzgrid-full-${lang}.png`);
            await page.screenshot({ path: shot });
            console.log(`     screenshot ${shot}`);
          }
          check(`${tag}: no page error`, errors.length === 0, errors);
        } finally {
          await ctx.close();
        }
      }
    } finally {
      await B.close();
    }
  }
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
