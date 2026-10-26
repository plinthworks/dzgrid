# Phase 5, Part B — ranges, clipboard, fill, bulk edit: plan (architect, 2026-10-25)

Status: **to validate with the owner** (questions QB1–QB10 at the end, in French). Sources, which win in this
order: `decisions.md` (Q1, Q9 « paste: refused cells skipped and counted », Q11, Q16, Q18, S3-O2, S5-O5, S9-Q5,
S9-Q6, « Order after Part A »), `phase-5-plan.md` (D1, D2, D11, D13, D15, step list 10–13, §4, §5), ARCHITECTURE
(K.4, K.6, K.8, K.14, §2.5, §3.0 `cell-range.ts` / `fill-handle.ts` changes, §3.8 « Presse-papiers », the key table
and « Superpositions », §3.10 rule 1, §3.15 `CellRange`, §5.1 conformance folders, §5.3 bench lines), spike S7
(`spikes/s7-clipboard/README.md`: decision 1–5 and its open points), sheets `selection.md`, `tree-selection.md`,
`master-detail.md`, `editing.md` (19, 24), `edit-save.md` (1, 5, 5b), `edit-undo.md` (1, 2, 8), `csv-export.md`
(the value rules a copy reuses), `value-input.md`; step 3–9 plans (Done / Review), the step-8 handover. Part A is
closed technically (`7ba1020`); 124a–b stay with the owner (S9-Q5). The `pharma/stock` sheet is not a
prerequisite: Part B is built and shown on the invented orders demo (`orders-edit.html`) and the real example's
« stock » screen.

Clean room: behaviour from public documentation of grids and spreadsheets (what a user sees when they select,
copy, paste, drag a fill handle), the WAI-ARIA 1.2 grid pattern (`aria-selected`, `aria-multiselectable`), APG
grid keys, WCAG 2.2 (1.4.1, 1.4.11, 2.1.1, 2.4.11, 2.5.7 dragging, 2.5.8 target size, 3.3.1, 4.1.3), RFC 4180 and
the TSV / HTML clipboard shapes spreadsheets exchange (S7, fixtures written by us from the documented shape).
Ported, ours: the spike's `tsv.js` and `html-table.js`, ngx-sheetgrid's pure `cell-range.ts` (`planPaste`) and
`fill-handle.ts` with the §3.0 changes (no `Date`: its `nextInSeries` uses `Date` and `Date.UTC` — replaced by
`addDays` of the core; `rowIndex` replaced by `RowKey`; real TSV quoting; `isInjectedRow` gone). Never another
grid's or spreadsheet's code, `node_modules` included.

## 1. Facts read in the code (at `7ba1020`)

1. **Nothing of ranges exists.** `core/src/selection/rows.ts` is row selection only; `intentFor`
   (`core/src/keys/intent.ts`) returns null for every Shift combination (« ranges come in Phase 4 ») and maps
   Ctrl/Cmd+A to `selectAll` (rows). No `copy` / `cut` / `paste` listener anywhere; two placeholder pins wait:
   `dom/test/edit-detail.test.ts` « a paste on the panel's cell … placeholder until step 10 » and
   `dom/test/editors-paste-pin.test.ts` (a paste inside an open field is the field's).
2. **The feature seam is enough for the keys and the paint.** `FeatureHandle.keys(e, at, owner)` runs before
   `intentFor` (router line « A feature's own meaning of the key first »); `afterRows(frame)` runs at each paint
   over the mounted cells (the save marks write `dzg-cell--*` there, `dom/src/edit/marks.ts`); `g.step(intent)`
   moves the focus as the grid's keys do (spans, details as one stop, pages, variable heights); `g.scope.on`
   gives listeners cleaned with the grid; `g.edit.api` (the `EditSeam`) gives `commit`, `refuse`, `alert`,
   `reason`, `undo`. So `@dzgrid/dom/range` needs **no base hook** for keys, paint or edits.
3. **The edit layer already takes a gesture of many cells.** `EditController.commit(cells, { origin })` stages all
   cells as **one** generation, **one** `SaveRequest`, **one** undo batch (every origin but `undo`/`redo` pushes
   one), returns `refused: [{ key, column, code }]` (codec, rules, `read-only` for a non-editable cell or a
   non-data row); S3-O2's `error.cells` refuses only the named cells of a server answer. `SaveOrigin` already
   has `'paste' | 'fill' | 'bulk'`. `core/edit` is frozen (3 098 / 3 100) and **does not change in Part B**.
4. **The copy can reuse the CSV writer.** `core/src/csv/writers.ts` `writerFor(col, env)` gives the export text
   of a cell through the overlay (numbers in the locale's decimal mark when the separator is not `,`, Latin
   digits, no groups; ISO days; instants as wall time in the display zone; enum labels; the formula guard; `="…"`
   for a `csv: 'text'` identifier); its `quote` is a parameter (identity for TSV, the TSV encoder quotes).
5. **Readers of pasted text exist.** `parseInput` (`core/edit/input.ts`) reads text by the column codec and the
   grid's `LocaleCtx`: `1,5` fr yes / en refused, groups only when unambiguous, Arabic-Indic digits, U+066B / U+066C,
   `%`, yes/no in fr/en/ar (`vrai`/`faux`, `true`/`false`, `نعم`/`لا`), days in the locale's order, instants as wall
   time (skipped / ambiguous refused). A currency sign is **refused** today (`1 234,50 €`).
6. **Row selection already uses Shift+click, Space, Ctrl+A and `aria-selected` on rows**; Shift+click on a cell
   selects rows only with `selection.click: true` or on the box (`dom/src/interact/select.ts`); the base writes
   `aria-multiselectable` on the viewport from the row selection mode (`render/viewport.ts:212`).
7. **Sizes now** (gz, ceilings): core **28 916 / 29 000** (84 B), `core/edit` 3 098 / 3 100 (frozen), dom
   **21 548 / 21 700** (line; owner grant up to 21 980, T7), `dom/edit` 4 146 / 4 150, `/editors` 6 601 / 6 650,
   `edit.css` 2 197 / 2 200, `ar-edit` 895 / 900, angular 6 743 / 6 793 (S9-Q6: measure + 50, ≤ 7 000), K.8
   82 829 / 83 500, real example 91 093 / 92 000. Every full entry above stays untouched by Part B, by design.
8. **No dataset B yet** (`perf/dataset.ts` has dataset A only; ARCH §5.3: B = 3 000 × 12).

## 2. Decisions (lead picks unless marked QB; the owner's answers will win)

- **B1 split.** `@dzgrid/core/range` (pure: range by keys, bounds, TSV, copy matrix, paste plan, fill plan, bulk
  plan); `@dzgrid/dom/range` (the `range()` feature: selection by keys and pointer, paint, a11y, clipboard,
  fill handle, Ctrl+D/R, Delete on a range, bulk, API); texts `locales/{en,fr,ar}-range`; styles
  `@dzgrid/theme/range.css` (like `edit.css`). Base core and base dom: **types only**, plus at most one small DOM
  seam (B14). Import graph: the base never imports `/range`; `/range` never imports `/editors` or `/filters`;
  `core/range` never imports `core/edit` at run time except the pure `CellInput` type.
- **B2 state lives in the DOM feature, by keys.** `CellRange { anchor: CellAddr; focus: CellAddr }`, `CellAddr =
  { row: RowKey; column: string }` (ARCH §3.15). Resolved at each use by `rangeBox(range, displayed,
  visibleColumns)` into display positions valid for one version; **a corner no longer displayed, or a column no
  longer visible, drops the range**, said once (never reinterpreted on other rows). No kernel command, no kernel
  state (base bytes); event `rangeChanged { range: CellRange | null }` (a `GridEvent` type, sent by `emit`, 0 B).
- **B3 what a range covers.** Visible columns in reading order (start pinned, centre, end pinned), logical, never
  visual. Rows: displayed rows between the corners; **data rows only** for copy, paste, fill, bulk, Delete
  (details, fillers, loading rows stepped over without consuming a source line, D11); a filtered tree's muted
  ancestors are data rows shown and count. Collapsed children, filtered-out rows, other pages: not displayed, not
  in the range. One cell = no range (the focus); `aria-selected` and the paint start at two cells.
- **B4 when a range is cleared.** Escape on a cell, a plain click or arrow without Shift, a sort, a filter or
  search change, a column hidden / moved / pinned, a page change, a model change (QB7 confirms). A host
  transaction keeps it unless a corner leaves.
- **B5 keys** (owner `cell`, the feature's `keys` hook; RTL mirrored by asking `intentFor` for the same key
  without Shift): Shift+arrows extend by one; Shift+Home/End to the row's first / last column; Ctrl/Cmd+Shift+
  arrows to the edge; Shift+PageUp/Down by a page; Ctrl/Cmd+Shift+Home/End to the first / last cell; Shift+Space
  the whole row (visible columns); Ctrl/Cmd+A the whole grid shown (QB1); Escape clears; Delete/Backspace clears
  the editable cells of the range (one gesture); Ctrl/Cmd+D fill down, Ctrl/Cmd+R fill to the logical end;
  inside a field Ctrl/Cmd+Enter keeps the value in every cell of the range (bulk, QB5). The moving corner takes
  the focus (QB2). Ctrl+Space (column) not in this phase (it switches the input source on a Mac).
- **B6 pointer.** Mouse / pen press on a data cell and drag: a range, auto-scroll near the scroller's edges (one
  `requestAnimationFrame` loop, positions from the row layout and column widths, one `elementFromPoint` per
  frame); Shift+click extends from the anchor (QB1). Never on a widget, an editor, the box column, a header. Touch:
  a tap focuses as today; ranges by touch are not in this phase (§8).
- **B7 paint and a11y.** Classes written in `afterRows` on mounted cells (pooled and scrolled cells always
  right; pinned columns, spans and variable heights for free): `dzg-cell--range` (tint) and four edge classes
  `--rs/--re/--rt/--rb` (logical start / end / top / bottom: inset box-shadow in `range.css`, flipped by
  logical properties). The ARCH « overlays from geometry » idea is dropped for ranges (lead): classes cost no
  layout read and need no split rectangles across pinned columns; the fill handle is the one drawn element.
  `aria-selected="true"` on the range's mounted data cells; **absent elsewhere** (not `false` on every cell:
  readers say « not selected » on each cell otherwise; listening §20 checks; a deviation from the APG « should »
  written in the sheet); `aria-multiselectable="true"` on the grid while `range()` is on (B14). Forced colours:
  `Highlight` / `HighlightText`; contrast pairs in `check:contrast` (tint vs text 4.5:1, edge 3:1, hue apart from
  the focus ring and the saving border).
- **B8 announcements** (polite, through the grid's region; one per gesture; texts `-range`): the range's size
  after the keys pause (~400 ms, a DOM clock: « 3 lignes, 2 colonnes sélectionnées »), cleared once; copied
  (« 6 cellules copiées »), cut, pasted with counts (« 12 cellules collées ; 2 refusées ; 3 en lecture seule ;
  4 hors de la grille »), filled, bulk, too big, read-only grid, clipboard refused (menu path). Refusals by a
  server answer keep Part A's sentences (S3-O2 counts per answer).
- **B9 copy** (S7 decision 2, 3): `copy` / `cut` / `paste` **DOM events** on `document`, routed by
  `document.activeElement` to the innermost `.dzg` root (nested grids each their own, D13), never by `target`;
  nothing taken when the focus is in a field, a widget, a popup, or when the page has a non-empty text
  selection and no multi-cell range (the browser copies the text). `text/plain` = TSV of the export values
  (`writerFor` with an identity quote, separator TAB, guard per QB3); `text/html` = an escaped `<table>` with
  `dir` of the grid, `<br>` for line breaks, nothing else from the data (no attribute, no style). Headers only
  through the API (`copy({ headers: true })`). **Cut** = the copy, then the editable cells cleared as one gesture
  (origin `'cut'`, a new `SaveOrigin` member, type only); read-only cells copied, not cleared, counted. Delete on a
  range: origin `'edit'`, as Delete on one cell (editing.md 24). Range, else the focused cell. `range({ canCopy })` may refuse
  (health data, ARCH risk table): nothing written, said; `rangeCopied { rows, columns, cells }` tells the app
  counts only, never values. No `execCommand`. Menu path later (Phase 9 menus) through `clipboard.write` /
  `readText` with the « utilisez Ctrl+V » sentence (S7 decision 4): the API (`api.copy()`, `api.paste(text)`)
  is ready for it.
- **B10 paste** (S7 decision 1; Q9; S3-O2): `text/plain` first, decoded by the tolerant TSV rules; `text/html`
  only when the text is empty, its first `<table>` read in an **inert document** (`DOMParser`, never appended,
  imported or adopted; only `textContent` of `td`/`th` walked, `<br>` → LF, `colspan`/`rowspan` → empty covered
  cells; HTML over 4 MB ignored). **Pasted HTML never reaches the live DOM; no `innerHTML` anywhere**; cells keep
  writing text nodes. Shape (Excel-like, QB6): one value on a range fills the range; a block on one cell writes
  its own size from there; a block on a larger range whose size is a whole multiple repeats; otherwise it
  writes once from the top-left. Outside the grid (rows past the last, columns past the last visible) ignored
  and counted; hidden columns are not in the visible list, so never written. Cells → `commit(cells, { origin:
  'paste' })`: **one gesture, one request, one undo**; refused cells (codec, rules, `read-only`, too long)
  skipped and counted, each refused mounted cell blinks (`api.refuse`, its limiter); a server's partial refusal
  is S3-O2's. Too long: the editors' cap (S5-O5, 1 000 characters, or the column's `edit.maxLength`) applied
  before `commit`. **Own copy memo**: the last matrix this page copied (values, not text) kept while the
  clipboard text is the same string; a paste of exactly that text pastes the values (`{ value }` inputs: exact
  round trip of types, no locale re-read, no guard marks); cleared at destroy, never sent anywhere.
  Max size (QB4): over the cap, nothing is pasted, said once.
- **B11 Excel interop** (the sheet `clipboard.md` lists each case): TSV with CRLF after every row, the last too;
  quotes only around TAB / CR / LF / `"`, inner quotes doubled; lenient decoding (LF or CR alone, one final break
  dropped, `5" inch` literal, ragged rows kept); a single copied Excel cell's trailing CRLF is not an empty row.
  Numbers: copy writes the grid locale's decimal sign without groups, Latin digits (QB9); paste reads by the
  grid's locale (Excel's displayed text: `1 234,50` fr, `1,234.50` en); currency signs per QB10. Days: copy ISO
  `YYYY-MM-DD` (Excel reads it in every locale); paste in the locale's order (`05/03/2026` fr, `3/5/2026`
  en-US) or ISO. Instants: copy wall time in the display zone `YYYY-MM-DD HH:mm:ss`; paste as typed (skipped /
  ambiguous refused). Booleans: `true` / `false` out; `vrai` / `faux` / `oui` / `نعم` … in. Arabic text untouched
  (RLM, `=`, spaces). **RTL column order**: logical in both directions — the grid's first column is the TSV's
  first, which is column A of an RTL sheet too. The formula guard's `'` and `="…"` written by our copy are read
  back by our paste (B10 memo; without it, a leading `'` before `=+-@` in a text column is dropped, as Excel's
  own copy does). Real captures from Excel (Windows, macOS), Sheets, LibreOffice, Numbers: the owner, non-blocking
  (S7 open point), added to `spikes/s7-clipboard/fixtures/` when they come.
- **B12 fill and bulk** (sheet `fill.md`): the 24 × 24 px handle (hit area; drawn 8 px) at the range's bottom
  inline-end corner (bottom-left in RTL), `aria-hidden` (keyboard: Ctrl+D / Ctrl+R, WCAG 2.5.7), pointer only;
  drag along one axis, the target box shown as the range; drop → `planFill` → `commit(…, { origin: 'fill' })`.
  Series (lead, Excel's documented defaults): one number copies; one day steps by a day; two or more numbers or
  days with a constant step continue it (decimals rounded to the sources' own); anything else repeats its
  pattern; instants, text, lists, yes/no repeat; Ctrl/Cmd held at the drop swaps copy and series. Backwards
  (up, to the start) continues the step backwards. Ctrl+D copies the range's first row down (one cell: the cell
  above), Ctrl+R the first column to the end (one cell: the cell before) — copy, never a series. Bulk: Ctrl+Enter
  in a field (QB5) or `api.apply(input)` writes one input into every editable cell of the range, origin `bulk`.
- **B13 trees, details, nested, spans, server grids.** Trees: a range across levels takes the rows shown; the
  tree column is copied without its indent; structure columns (`tree({ structure })`) are read-only, counted.
  Details: never in a range's cells, stepped over (re-pins of `edit-detail.test.ts`). Nested grids: each grid its
  own range, keys and clipboard; a range of the outer grid never reaches into a panel. Spans: a range is not
  grown to cover a span (lead, v1); covered cells are real cells, written like others; pinned by tests.
  **Server grids** (Q18): a range within the page shown; a page change clears it; a paste past the page's last
  row is « outside »; a server-sorted or -filtered column gets the stale mark (S2-O2); source models keep a
  pasted value for a row off the page (O9); copy writes only rows held. `exclude` row selections are not
  ranges and are never written by bulk.
- **B14 the one base seam** (dom, ~15–25 B, inside 21 700): `aria-multiselectable` written by the base from row
  selection **or** a feature's flag, so the feature never fights the base's write. Nothing else in the base;
  if the measure says otherwise, the step stops and asks.
- **B15 Angular**: `range()` goes into `[features]` (as `edit()`, S9-Q1); one output `(rangeChanged)` and
  `DzgController.range()`; the S9-Q6 rule (measure + 50, ≤ 7 000). No `[(range)]` two-way binding this phase.

## 3. Steps (each: sheet changes first, tests that fail first, code; touched tests while working; the full gate
once at the commit; Chrome when the screen changes; review + test analysis + mutants after each step)

**10. `@dzgrid/core/range` and the sheets** (blueprint `step10-plan.md`). Sheets `range-selection.md`,
`clipboard.md`, `fill.md` (fill and bulk) and the updates (selection, tree-selection, master-detail, editing,
edit-save, edit-undo, value-input, spans, a11y §20 written in French) **before any code**; then the pure entry:
`rangeBox`, `boxRows`, TSV codec, `copyMatrix`, `planPaste`, `planFill`, `planBulk`; conformance `range-box`,
`clipboard-tsv`, `paste-plan`, `fill-plan`; 20 000-matrix TSV property test; the detail / filler / loading
cases (the handover's core half). No DOM. Target 2 200–3 000 B.

**11a. `@dzgrid/dom/range`: selecting.** The `range()` feature: keys (B5 without clipboard, fill, bulk), pointer
(B6), paint and a11y (B7, B14), sentences (B8: size, cleared), `rangeChanged`, API `get/set/clear`; texts
`-range` (size sentences); `range.css`. Tests: `range-keys` (each key, ltr / rtl, Mac Cmd, AZERTY, Arabic layout
by `code`, nested grid ignored, editor / widget / popup owners ignored), `range-pointer` (drag, Shift+click,
auto-scroll by a fake clock), `range-paint` (pooled cells, scroll, pinned, spans, tree, details, 100 000 rows
then scroll), `range-clear` (B4). Browser `--only range`: Chrome fr light Clinic, ar dark Midnight, forced
colours; keys in Firefox and WebKit; axe 0 with a range. Target ~1 600–2 000 B of the 4 500.

**11b. Clipboard.** Copy / cut / paste (B9–B11), Delete on a range, the memo, the HTML reader, the counted
sentences, `canCopy`, `rangeCopied`, API `copy/paste/cut`. Tests: `range-copy` (TSV and HTML exact text by
hand, fr / en / ar numbers, days, instants in Algiers, enums, guard, RTL order, headers by API, nested routing,
text selection left to the browser, `canCopy` false), `range-paste` (shapes, outside, read-only, refused codes,
too long, too big, memo round trip, `'=` read back, one request and one undo by a recording `save`, S3-O2
partial refusal, server page edge, tree structure column), **the re-pins** (`edit-detail` paste stepped over
and counted; `editors-paste-pin` still the field's, now against a real paste handler), `range-html-safety`
(`<img src onerror>`, `<script>`, `<iframe>`, `<svg onload>`, `style` and a 5 MB payload: nothing in the
document — a MutationObserver counts 0 nodes —, no handler run, nothing fetched; only text kept), `range-cut`
(one gesture, read-only copied not cleared). Browser: real Ctrl/Cmd+C/X/V in the three engines (Playwright keys,
S7), Firefox's `<body>` target, CDP network log empty for the hostile HTML, our fixtures (Excel Windows shape,
Sheets, LibreOffice) pasted fr / ar. Target ~1 400–1 800 B.

**12. Fill handle, Ctrl+D / Ctrl+R, bulk, dataset B.** The handle (B12) and its drag, Ctrl+D / Ctrl+R, Ctrl+Enter
(QB5, the one `/editors` change), `api.fill`, `api.apply`; Angular (B15); demos (`orders-edit` with ranges on,
`?range=0` off; the stock screen of the real example: range and paste, measured apart); `perf/dataset.ts`
`datasetB(3 000)` (12 columns: product, lot, stock, min, price, expiry day, status list, active yes/no, …) and
`perf/profiles/stock.ts`. Tests: `range-fill` (series rules by hand, backwards, Ctrl swap, RTL drag toward the
logical end, handle hidden while editing and on one cell, 24 px hit area), `range-fill-keys` (Ctrl+D/R, Mac Cmd,
a browser's own Ctrl+D / Ctrl+R prevented only when taken), `range-bulk` (one request of 3 000 changes, refused
counted, undo one gesture), the walk `range-walk` (random ranges, sorts, filters, pastes, fills, undos, scrolls:
no stale paint, focus never lost, source rows deep-equal). Bench (QB8): bulk B 3 000 ≤ 30 ms to the repaint,
one request; paste 1 000 cells ≤ 40 ms. Browser: handle in ltr / rtl, forced colours, drag with auto-scroll,
Ctrl+D / Ctrl+R in the three engines ([À VÉRIFIER] Ctrl/Cmd+R and +D are taken from the browser when prevented;
if one engine refuses, the sheet says so and the API stays). Target ~900–1 200 B (fill) + ~150 B (bulk).

**13. Close: 0.3.0 prepared, unpublished.** Rebudget (measure + 10 %, rounded to 50, never above the grants:
`node scripts/rebudget.mjs sizes`, `--write` on the owner's word); full gate once (`build`, `typecheck`,
`test:ci`, `test:perm`, `test:tz`, `check:size`, `check:contrast`, `test:browser`, `test:audit -- --full`, the
Angular fixture, `example:build|bytes|csv|ssr|browser`, `pack:local`); the four packages at **0.3.0**, peers
`^0.3.0`, `CHANGELOG [0.3.0] - unreleased`; ARCHITECTURE index (Part B decisions in French), ROADMAP (Phase 5
closed technically, final budgets), STATUS, `decisions.md`; a11y §19 and §20 listening and the Excel captures in
« Ce qui attend le propriétaire » (non-blocking); 124a–b still open (S9-Q5). Commit, local tag `v0.3.0` and push
by the lead after the owner reads the gate; **never `npm publish`**. Order: 10 → 11a → 11b → 12 → 13, one commit
each (11a and 11b may share the step-11 review).

## 4. Budgets (gz, minified; estimates to measure; Q16 grants checked against the ceilings of today)

| Entry | Now / line | Part B adds | Ask |
|---|---|---|---|
| `@dzgrid/core` | 28 916 / 29 000 | 0 runtime (types: `CellAddr`, `CellRange`, `rangeChanged`, `rangeCopied`) | none; layering guard keeps 28 916 |
| `@dzgrid/core/range` | new | 2 200–3 000 (TSV ~550, box/rows ~300, copy over `writerFor` ~500, paste ~450, fill ~700, bulk ~100) | **Q16's 4 000 held**, line at measure + 10 % |
| `@dzgrid/core/edit` | 3 098 / 3 100 | 0 (frozen; the new `'cut'` origin is a type only: every origin but undo/redo already pushes an undo batch) | none |
| `@dzgrid/dom` | 21 548 / 21 700 | B14 ~15–25 | none (inside the line; grant 21 980 untouched) |
| `@dzgrid/dom/range` | new | 11a 1 600–2 000, 11b 1 400–1 800, 12 1 050–1 350 → **4 050–5 150** | Q16's 4 500 **is tight**: QB8 (split the fill into `@dzgrid/dom/range-fill`, loaded on the first drag or Ctrl+D, or a raise) |
| `locales/{en,fr,ar}-range` | new | ~14 texts: ~300 / 350 / 450 | **new grant 350 / 400 / 500** (not in Q16) |
| `@dzgrid/theme/range.css` | new | tint, edges, handle, forced colours, reduced motion: ~350–450 | **new grant 500** (`edit.css` is full, 2 197 / 2 200; base theme 2 500 untouched) |
| `@dzgrid/dom/editors` | 6 601 / 6 650 | Ctrl+Enter bulk hand-off ~40–70 (QB5 A) | **6 650 → 6 720** |
| `@dzgrid/dom/edit` | 4 146 / 4 150 | 0 (the range uses the `EditSeam` API as it is) | none |
| `@dzgrid/angular` | 6 743 / 6 793 | ~40–80 | S9-Q6 rule (≤ 7 000), no new ask |
| K.8 profile | 82 829 / 83 500 | base seam only (~+25) | none |
| Real example | 91 093 / 92 000 | initial load: base seam only; the stock screen grows (measured apart) | none |

Time (ARCH §5.3, measured on minified code, on a quiet machine): bulk B 3 000 × 1 ≤ 30 ms to the repaint and one
request; paste 1 000 cells (B) ≤ 40 ms from the event to the repaint; a Shift+arrow ≤ 1 frame, 0 layout reads but
the focus move's own; copy 10 000 cells ≤ 50 ms with no long task beyond it; TSV decode 300 000 cells measured
9–18 ms in S7 (not a risk). Memory: the memo holds at most one matrix, dropped when the clipboard text changes.

## 5. Exit criteria (Part B; Phase 5 §5 Part B items plus this plan's)
- PB1 sheets before code (`range-selection.md`, `clipboard.md`, `fill.md` and the updates in the commit before
  the first code); every Part B test file names its sheet.
- PB2 full range keyboard (B5) with no pointer, in ltr and rtl, Mac Cmd; a range is never made from inside a
  field, a widget, a popup, a filter input or a nested grid.
- PB3 range and fill handle right in RTL (keys mirrored, handle bottom-left, drag toward the logical end, TSV
  logical order) — jsdom and Chrome, keys in Firefox and WebKit.
- PB4 one paste = one gesture = one request = one undo (Ctrl+Z gives every cell back, one sentence); cut and
  Delete on a range likewise; fill and bulk likewise.
- PB5 refused cells skipped and counted (Q9), each refused mounted cell blinks; S3-O2 partial server refusals.
- PB6 details, fillers, loading rows never pasted, filled, bulk-edited, cleared or copied (criterion 5 complete;
  the `edit-detail` placeholder re-pinned).
- PB7 Ctrl/Cmd+C, X, V, A, D, R, Z, Enter inside a field are the field's (the `editors-paste-pin` re-pinned on
  the real handler) — except Ctrl+Enter's bulk hand-off when a range exists (QB5).
- PB8 Excel interop cases of `clipboard.md` each a hand-written test (fr, en, ar; numbers, days, instants,
  quotes, newlines, Arabic, RTL order, guard read back).
- PB9 pasted HTML never in the live DOM, no script run, nothing fetched (jsdom + Chrome CDP).
- PB10 a11y: axe 0 with a range in fr light / ar dark / forced colours; `aria-selected` on range cells;
  `aria-multiselectable`; the sentences; contrast pairs green.
- PB11 trees, nested grids, spans, server pages: their tests (B13).
- PB12 dataset B: bulk ≤ 30 ms and one request; paste 1 000 ≤ 40 ms (QB8 for when and where it is measured).
- PB13 budgets only by written decisions; `core/edit`, `dom/edit` unchanged; final gate green; docs; 0.3.0
  prepared, unpublished; listening §20 and the Excel captures scheduled (owner, non-blocking).

## 6. Risks
`dom/range` over 4 500 (QB8; the fill is the natural split); Ctrl/Cmd+D (bookmark) and Ctrl/Cmd+R (reload) not
preventable in some engine (browser check at step 12; the API and the handle stay); real Excel clipboard shapes
differ from our fixtures (owner captures; tolerant decoder); a user's text selection vs our copy (rule B9); the
memo matching a text copied elsewhere that happens to be equal (harmless: same text, our values); paste of
100 000 cells and the edit layer's marks (four clocks, S7 plan; measured at 12); aria-selected noise or silence
by reader (listening §20); a range resolved on a version where a corner left (dropped, said); pointer drag and
the retained row (the focused row never moved, §3.7); Firefox `<body>` target (document listeners, S7); Safari
copy on a focused non-editable element with no selection ([À VÉRIFIER] headed Safari 17.5, S7 open point);
the bench on a shared machine (Q17d).

## 7. Not done in Part B
Ranges by touch (selection handles), a column range key, ranges in the column menu or a context menu (Phase 9
menus: the API is ready), several ranges at once (Ctrl+drag), charts from a range (K.13), Excel's « marching
ants » cut-then-move, paste that adds rows, HTML clipboard number hints (`x:num`, `sdval`), a `[(range)]` Angular
binding, `pharma/stock` (when the owner's sheet arrives).

## 8. Questions au propriétaire (réponses courtes ; ★ = recommandé)

**QB1. Plage de cellules et sélection de lignes ensemble : qui prend Maj+clic et Ctrl+A ?**
- **A ★** avec `range()`, Maj+clic et Ctrl+A font la plage de cellules ; les lignes se cochent par la case (et
  Espace) ; Ctrl+A ne coche plus toutes les lignes (la case d'en-tête le fait).
- B Ctrl+A coche les lignes comme aujourd'hui ; la plage « tout » seulement par Ctrl+Maj+Fin.
- C l'application choisit (`range({ selectAll: 'cells' | 'rows' })`, ~30 o de plus).

**QB2. Pendant Maj+flèches, où est le focus ?**
- **A ★** il suit le coin qui bouge : le lecteur d'écran lit chaque nouvelle cellule ; Entrée ou F2 modifient
  cette cellule.
- B il reste sur la cellule de départ, comme Excel : rien n'est lu pendant l'extension, sauf la taille.

**QB3. Copier un texte qui commence par `=`, `+`, `-` ou `@` (risque de formule dans Excel) :**
- **A ★** même garde que l'export CSV : une apostrophe devant (Excel l'affiche en texte) ; notre propre collage
  la retire ; l'appli peut l'enlever (`range({ guard: false })`).
- B copier tel quel (Excel peut calculer la formule).

**QB4. Taille maximale d'un collage :**
- **A ★** 100 000 cellules ; au-delà rien n'est collé et une phrase le dit ; l'appli peut changer le nombre.
- B 10 000 cellules (plus prudent pour le serveur).
- C pas de limite.

**QB5. Modification en masse (une valeur dans toute la plage) :**
- **A ★** taper la valeur dans une cellule de la plage, puis Ctrl+Entrée (comme Excel) ; ~60 o dans `/editors`
  (6 650 → 6 720).
- B seulement par l'API de l'appli (`apply`) et Ctrl+D ; `/editors` ne bouge pas.

**QB6. Coller une valeur ou un petit bloc sur une plage plus grande :**
- **A ★** une valeur remplit toute la plage ; un bloc se répète s'il tient un nombre entier de fois, sinon il
  est collé une fois (comme Excel).
- B toujours collé une seule fois, à partir du coin.

**QB7. Un tri, un filtre ou une recherche change pendant qu'une plage existe :**
- **A ★** la plage disparaît (dit une fois) : elle ne couvre jamais d'autres lignes en silence.
- B elle reste entre ses deux coins, même si les lignes entre eux ont changé.

**QB8. Taille de `@dzgrid/dom/range` (accordé 4 500, estimé 4 050–5 150) et bancs du jeu B :**
- **A ★** si la mesure dépasse 4 500 : la poignée de recopie dans sa propre entrée chargée au premier usage ;
  les bancs (3 000 en masse ≤ 30 ms, 1 000 collées ≤ 40 ms) mesurés dans Chrome à l'étape 12 et notés
  « indicatifs » tant que la machine calme (Q17d) n'est pas là ; « une seule requête » vérifiée dans la suite.
- B relever `dom/range` jusqu'à 5 200, une seule entrée ; bancs pareils.
- C attendre la machine calme pour les bancs avant de clore la partie B.

**QB9. Les nombres copiés vers Excel :**
- **A ★** comme l'export CSV : virgule décimale en français et en arabe à chiffres latins, point en anglais, sans
  séparateur de milliers, chiffres latins.
- B toujours un point (Excel français peut alors lire « 1.5 » comme du texte ou une date).

**QB10. Coller « 1 234,50 € » ou « $1,234.50 » dans une colonne nombre :**
- **A ★** le signe monétaire est enlevé, le nombre lu (rien d'autre n'est deviné ; « (1 234) » reste refusé).
- B refusé et compté, comme une saisie au clavier.

Budgets à accorder (nouveaux, hors Q16) : textes `-range` 350 / 400 / 500 ; `range.css` 500 ; `/editors`
6 720 (si QB5 A) ; le reste tient dans les accords existants.

## Done

- **Step 10 (2026-10-25, not committed)**: the sheets (`range-selection.md`, `clipboard.md` with its Excel table,
  `fill.md`, the updates, a11y §20) before any code; `@dzgrid/core/range` (2 643 B gz over the core, grant 4 000);
  base types only (28 916 B gz unchanged). Details, tests that failed first, mutants and deviations:
  `step10-plan.md` « Done ».
- **Steps 11a, 11b, 12** (2026-10-25/26; `295e4e8`, `832154d`, `a21428b`): `@dzgrid/dom/range` (blocks, then the clipboard) and `@dzgrid/dom/fill`; details in each step plan's « Done ».
- **Step 13, the close (2026-10-26, not committed)**: budgets by the close rule (Q-C2, Q-C3), 0.3.0 prepared, the final gate green, PB1–PB13 recorded in ROADMAP « Phase 5 — close techniquement » (PB8 real spreadsheets and PB12 timings: owner / indicatif). `step13-plan.md` « Done ».
