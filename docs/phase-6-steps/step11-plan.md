# Step 11 plan: print (`preparePrint`)

Sources: `docs/behaviors/print.md` (the sheet, 9 behaviours), phase-6-plan D14 + step 11, decisions Q-I (A) and O9, « Back to Phase 6 » (1.0.0 published; the close prepares 1.1.0), app-feedback (Tailwind preflight, brand tokens, localised texts). Plan only.

## 1. API (`@dzgrid/dom/print`)
- `preparePrint(grid, { maxRows = 5000, title? }): Promise<() => void>` builds a print-only `<table>` and resolves with an idempotent cleanup. `print(grid, opts)` = prepare, `window.print()`, cleanup on `afterprint` (plus a safety `matchMedia('print')` change event for engines that skip `afterprint`; one listener, `{ once }`). Both exported; `print` is 5 lines over `preparePrint`.
- Both take the grid (like `csvExport`), not a feature: no `g.el` wiring, no `GridFeature` registered, so a grid that does not import the entry pays 0 B (base and K.8 unchanged by construction: the entry imports only types and public kernel/model reads; a size test asserts K.8 stays 84 449).
- Sheet choice kept: no `beforeprint` hook; plain Ctrl+P prints the screen as today.
- The print container: one `<div class="dzg-print" hidden-on-screen>` appended to `document.body` (sibling of the grid, not inside it, so the grid's `contain`/overflow never clips it). `display: none` on screen and `aria-hidden` (not in the a11y tree there). Cleanup removes it and the root marker.

## 2. Build
1. Gather first (sync, from kernel/model reads only): shown columns in reading order = start-pinned, centre, end-pinned (so « pinned columns first » in LTR and RTL; `dir` flips the visual side, order stays logical); group header rows from the group defs (`th scope="colgroup"` + `colspan`, one `<colgroup>` per group); row slice = displayed rows (filtered, sorted, searched), tree shown rows only (indent as leading text for the tree column, `padding-inline-start` via `style`-free class? no: prefix with U+2003 em spaces, depth × 1), top pinned rows at the start of `tbody`, bottom pinned at its end; detail, loading, filler rows skipped (O9); merged cells repeated on every covered row; full-width rows one `colspan` cell.
2. Server grids (any non-client model): rows = the current page only, `print.page` in the caption (« Page {page} sur {pages} »). Never fetches.
3. Cells: the column's formatter with the grid locale = same text as the CSV path (reuse the one text function the CSV export already calls: no second formatter). Parts: their `text` (part-text contract), else empty. Edits as shown (pending/saved value). Row data is not kept: the table holds strings only; the gathered column list and row slice are local to the build and dropped at the end; no closure retains a row.
4. Chunking: rows are written into a `DocumentFragment` per chunk, time-sliced (~8 ms budget per chunk, yield by `scheduler.yield()` else `MessageChannel`/`setTimeout 0`), so no task > 200 ms. Target 5 000 × 20 ≤ 1.5 s. `tr` built by `innerHTML`-free DOM calls (`textContent` only: no HTML injection from cell text, ever).
5. Cancel: a call generation counter; a second call while building cancels the first (the first promise resolves with a no-op cleanup, its partial table removed). Cleanup during a build cancels it.
6. `print-too-many`: rows > `maxRows` → first `maxRows` printed, a `<p class="dzg-print-note">` with `print.truncated` ({n}, {total}) above the table, and ONE problem `print-too-many` through `grid.report`, detail = counts only (`{ total, max }`), never row values.
7. Table: `caption` = `title`, else the grid's accessible name (`aria-label`, else text of `aria-labelledby`), else none; `thead` with `th scope="col"`; `dir` and `lang` copied from the grid root; the screen grid hidden while printing by `@media print` (`print.css`: `body > *:not(.dzg-print){display:none}` would break apps; instead hide only via a root marker class `dzg-printing` set on `<html>` by prepare and removed by cleanup, and `.dzg-printing body > :not(.dzg-print) { display: none }`).
8. Never touches the virtual body: no scroll, focus or event on the screen grid (test: spy on the kernel event bus and `document.activeElement`).

## 3. Texts
`locales/{en,fr,ar}-print` (`print.truncated`, `print.page`), optional in `GridMessages`, required by `preparePrint` (missing text reported once as a problem, like the parts bundle; message key type `PrintMessageKey` + `PrintMessages` in `part-texts.ts`/`messages.ts` types only, 0 B in base). Texts from the sheet; no hard-coded words in the code. fr uses « premières lignes sur ». ar: أول {n} صف من {total}. Caption/notes use the grid's locale and `dir`; numbers/dates isolated with `<bdi>` only if the formatter output already is (no new logic).

## 4. `print.css` (theme, 400 B) and the preflight lesson
- Must survive Tailwind's unlayered preflight and brand tokens: ship the layered AND `print.css` unlayered variant like the other sheets (`print.css`, `print.unlayered.css`, scss source), so an app can import the one that wins. Every rule inside `@media print` (plus `.dzg-print{display:none}` on screen), selectors doubled in specificity via the root marker (`.dzg-printing .dzg-print …`), no reliance on `border-collapse`/`border` defaults that preflight resets: set `border: 1px solid #000; border-collapse: collapse; padding: .2em .4em` explicitly, `color:#000; background:#fff`, `font-size` in pt-free `rem`-less `inherit`.
- `thead{display:table-header-group}`, `tr{break-inside:avoid}`, `caption{caption-side:top; text-align:start}`, `th{text-align:start}`, `.dzg-print-note{text-align:start}`; bottom pinned `tfoot`? No: bottom pinned rows stay in `tbody` end (sheet), so `tfoot` is not used (it would repeat per page).
- The existing `@media print{.dzg-resize,.dzg-tooltip{display:none}}` in the base theme is untouched (theme base held at 2 750).
- `print-color-adjust` not needed (borders only, no colour dependence).

## 5. Bytes (gzip, to be measured; granted by Q-B)
| Entry | Grant |
|---|---|
| `@dzgrid/dom/print` | 1 600 |
| theme `print.css` (and unlayered twin, same budget each) | 400 |
| `locales/en-print` / `fr-print` / `ar-print` | 150 / 150 / 200 |
| dom base, core base, K.8 profile, Angular | +0 (K.8 stays 84 449 / 84 450; asserted) |
If 1 600 is tight: drop the `matchMedia` fallback first, then the tree indent. New entries get `package.json` exports + `size-budget.json` rows at the commit (done by the implementer, not here).

## 6. Tests FIRST (red before code), `packages/dom/test/print.test.ts` (jsdom)
1. Table shape: caption priority (title > aria-label > aria-labelledby > none); `th scope="col"`; colgroup + `scope="colgroup"` colspans; `dir`/`lang` copied.
2. Rows in order after sort + filter + quick search; tree shown rows with indent; top pinned first, bottom pinned last, no `tfoot`; detail/loading/filler absent; merged cells repeated; full-width row single colspan.
3. Columns: start-pinned, centre, end-pinned order; hidden and group-closed absent; same in `dir=rtl`.
4. Cells: formatter + locale text, part `text`, empty for part without text; pending edit printed as shown; HTML-looking cell text stays text (`<img onerror>` is a text node).
5. Cap: 5 001 rows → 5 000 + note + exactly one `print-too-many` with counts only; `maxRows` option; no row value anywhere in the problem.
6. Chunking: fake clock, no slice > budget; yields between chunks; 5 000 × 20 completes; second call cancels the first (first partial table gone, one container).
7. Cleanup: idempotent; `afterprint` triggers it in `print()`; cleanup mid-build cancels; root marker removed; DOM identical to before (snapshot).
8. Server grid: current page only, `print.page` in caption, zero requests.
9. Screen untouched: scrollTop, focus, kernel events unchanged; container `display:none` and `aria-hidden` on screen.
10. No row data kept: after cleanup + GC-style check, no reference from the module (weak ref test / module state empty); missing text bundle → one problem.
11. Size tests: entry, css, locales within the grants; K.8 profile unchanged; `print.css` and unlayered twin contain no rule outside `@media print` except the `display:none`.
12. Theme test: print.css under a simulated unlayered preflight (`table{border-collapse:separate;border-color:currentColor}`, `*{border-width:0}`) still draws 1 px black borders (specificity).
Browser (Chrome, `--only print`, one browser at a time): playground page with 1 200 rows × 12 columns, a pinned start column, two header groups: `page.pdf()` in fr (LTR) and ar (RTL, `dir=rtl`): extract text per page → header row text appears on every page; no row text split across pages (each row's cells on one page); pinned column first (LTR leftmost, RTL rightmost by x of the extracted text); caption present; note present with a 5 001-row variant; screen unchanged after `afterprint`. Also after a Tailwind-preflight CSS injected into the page (lesson from the app).

## 7. Playground
« Imprimer » button on `orders.html` (and the preflight/brand « real app » page at the close) calling `print(grid, { title })`; `?lang=ar` flips; the pdf test drives it.

## 8. Docs at the commit
Sheet `print.md` already written (update the table only if numbers move); STATUS + `docs/phase-6-steps/` refreshed; ROADMAP « Phase 6 » row; CHANGELOG stays for the close (1.1.0).

## 9. Risks
Safari/Firefox `afterprint` gaps (fallback); preflight beating the sheet (unlayered twin, doubled specificity); long tasks with huge tables (budgeted chunks, cap); memory of 100 000 cells (cap 5 000 × columns; user told if exceeded); `thead` repeat requires the table not inside a `display:flex/grid` ancestor (container is a body child).

## 10. Owner questions
None needed: Q-I, O9 and the sheet settle every point.

## Done (2026-10-28)

**Tests first, red.** `packages/dom/test/print.test.ts` and `print-size.test.ts` written before the code, run against a stub
entry (`preparePrint` rejecting, empty bundles): **33 failed, 2 passed** (the two guards that hold already: the base / core /
K.8 / Angular lines unchanged, and neither the base nor K.8 reaching a print module). `packages/theme/test/print.test.ts`:
**8 failed, 3 passed** (no `print.css` yet; the base theme's own print rule, the guards). The size tests moved to a node file
(`print-size.test.ts`: esbuild does not run under jsdom). Expectations hand-written; three corrected against the sheet while
going green, not against the output: the quick search matches words in any column (the test now searches `s3`), the folded
columns need `groups()` (the test adds it), and the full-width row needed the span map, which the spans feature did not
expose (`SpanFeature.map` was declared, never given: now a getter of the current map, `dom/spans` 4 577 / 4 950).

**Built.** `@dzgrid/dom/print` (`print.ts`, `print/index.ts`), `locales/{en,fr,ar}-print`, `PrintMessageKey` /
`PrintMessages` (types, `part-texts.ts` only — see below), `'print-too-many'` in core's `ProblemCode` (an inline literal: a
new type alias there shifted esbuild's short names and cost `core/state` 1 B over its 1 500 line), `print.scss` →
`print.css` / `print.unlayered.css`, exports, build list, budget lines, `rebudget` ceilings; playground `print.html`
(1 200 patients × 12 columns, `?lang=ar`, `?rows=5001`, `?preflight=1`) and « Imprimer » on `orders.html`;
`scripts/browser-print.mjs` (`--only print`) with `scripts/pdf-text.py` (pdfminer.six reads Chrome's PDF back).

**Choices made while building (within the plan).**
- §1: the `matchMedia('print')` fallback **dropped** — the entry measured 1 639 with it, 1 580 without (§5's first cut);
  `print()` cleans up on `afterprint` only. The tree indent kept.
- The container hides on screen by an inline `display: none` (plus `aria-hidden`), not the `hidden` attribute: Tailwind 4's
  preflight hides `[hidden]` with a layered `!important` no author rule beats. `print.css` shows it, and hides the rest of
  the page, with two `!important` rules standing outside the layer (theming.md); colours as `black` / `white` keywords
  (the SCSS guard refuses colour literals).
- The cleanup handed to the app is made by a module-level `cleaner(box)`: it closes over the container only, so keeping it
  keeps no row (the build's closures, which read the rows, end with the build).
- A paged grid in the browser (client pages) also gets its page in the caption: what is shown is that page (§2 says
  server grids; the same rule covers both).
- §3 « optional in `GridMessages` »: **not done**. Naming `PrintMessageKey` in `messages.ts` / `context.ts` / `part.ts` (types
  only) moved esbuild's short names and cost the DOM base +1 B (22 332), against « the base +0 ». The keys reach the grid by
  spreading the bundle (`text: { ...FR.text, ...FR_PRINT.text }`, no excess-property error on a spread), and the print
  module reads them through `g.msg(k as never)`. A literal `'print.page': …` written into `text` is refused by the type;
  to add at the close's rebudget if the owner wants it.
- `print-too-many` detail: `{"total":5001,"max":5000}` (counts only); a missing `-print` bundle: one `missing-message`
  warning per grid (`messages.text`, the keys), the table printed without the line.

**Sizes (gzip).** `@dzgrid/dom/print` 1 590 / 1 600 over the DOM base; `print.css` 334 / 400; `print.unlayered.css` 292 / 400;
`en-print` 132 / 150, `fr-print` 140 / 150, `ar-print` 160 / 200. DOM base, core, K.8, Angular: +0 (asserted by
`print-size.test.ts`; measured in the gate below).

**Gate** (once, `caffeinate -i`, vitest 2 workers, Node 24): vitest **484 files / 7 247 passed** (2 skipped), `test:perm` 5 files / 10, `typecheck`, `build`, `check:size` **118 ok, 0 over** (core 28 999, DOM base 22 331, K.8 84 449 / 84 450, Angular 6 811: all as before), `check:contrast` 1 092 / 0.

**Browser** (Chrome, one at a time): `--only print` **39 / 39** — for fr and ar under Tailwind's preflight with the unlayered
twin, fr with the layered sheet, and 5 001 rows in fr and in ar (preflight): in print media 1 px solid black collapsed
borders, `thead` as `table-header-group`, the page hidden and the table shown; from `page.pdf()` read back: every row once
and none cut across pages (its « Dossier » and « Code » on one page; 45 / 40 pages at 1 200 rows, 186 / 166 at 5 000), the
header rows identical at the top of every page, the caption on page 1 only, the truncation line at 5 001, the pinned
column leftmost (fr) and rightmost (ar) on every row, the screen grid as before after the cleanup; `print()` with the
dialog stubbed: one call with the table in place, `afterprint` removes it, scroll and rows unchanged; `orders.html`'s
« Imprimer » prints the orders shown. `--only playground` **41 / 41**.

**Try it.** `http://127.0.0.1:4700/print.html` → « Imprimer » (the browser's preview: every row, headers on each page);
`?lang=ar` (right to left), `?rows=5001` (the line above the table), `?preflight=1` (Tailwind's reset in the page);
`http://127.0.0.1:4700/orders.html` → « Imprimer ».
