# Phase 5, step 10 — the sheets of Part B and `@dzgrid/core/range`: blueprint (architect, 2026-10-25)

Sources: `partB-plan.md` (B1–B15, QB1–QB10; the owner's answers win), `decisions.md` (Q9 paste counted, Q16
`core/range` 4 000, S3-O2, S5-O5, S9-Q5), `phase-5-plan.md` D2 (« Part B: `@dzgrid/core/range` »), D11, step 10;
ARCHITECTURE §3.0 (`cell-range.ts`: `rowIndex` → `RowKey`, real TSV quoting, `isInjectedRow` gone, `planPaste`
rules kept; `fill-handle.ts`: no `Date`, days through `Day`, `FillColumn.renderer` → `ColumnDef.type`), §3.8 TSV
rules, §3.15 `CellRange`, §5.1 folders `paste-plan/`, `fill-plan/`, `clipboard-tsv/`; spike S7 (`tsv.js`, its
14 decoding cases and 20 000-matrix round trip); `csv/writers.ts` (the copy's value rules); step-8 handover.
Clean room: our code only (spike, ngx-sheetgrid's pure modules; their `Date` use is not ported). **No DOM in this
step** (the DOM half of the re-pins is step 11b). Tests first.

## Findings (code at `7ba1020`)
- `DisplayedRows`: `count`, `index(n)`, `nodeAt(i)`, `keyAt(i)`, `indexOf(key)` (−1 when not shown),
  `nextData(i, ±1)`; node kinds `data | group (filler) | detail | loading`; `matchedAt?(i)` (a filtered tree's
  muted ancestors) — data rows, and ranges take them (B3).
- `writerFor(col, env)` (`csv/writers.ts`): reads through `env.reader` (overlay), blank → `''` (counted),
  unreadable → `''` (counted), numbers with the locale's decimal unless `raw` or `sep === ','`, instants by
  `wallWriter(zone)` unless `iso`, enums by label unless `codes`, `="…"` for `csv: 'text'` digits, the guard
  `FORMULA` unless `guard: false`, `quote` applied last. With `sep: '\t'` and an identity `quote`, it is the
  copy's cell text; the TSV encoder quotes.
- `parseInput` / `checkValue` are exported by `@dzgrid/core/edit` but the paste plan **does not call them**: it
  hands `CellInput`s to `commit`, which parses and checks (one place for the rules; `core/range` stays free of
  `core/edit` at run time).
- `addDays(day, n)` in `value/day.ts` (base): day series without `Date`.
- `SaveOrigin` (`kernel.ts:183`) is a type; `GridEvent` (`kernel.ts:81`) a union of types: new members cost 0 B.
- Core 28 916 / 29 000; the layering seam guard is pinned at the measure.

## Base (`@dzgrid/core`): **0 B runtime**
Types only (erased), exported from `index.ts`:
```ts
// selection/cells.ts (new, types only)
export interface CellAddr { readonly row: RowKey; readonly column: string }
export interface CellRange { readonly anchor: CellAddr; readonly focus: CellAddr }
// kernel.ts
export type SaveOrigin = 'edit' | 'undo' | 'redo' | 'paste' | 'fill' | 'bulk' | 'cut';
| { type: 'rangeChanged'; source: ChangeSource; range: CellRange | null }
| { type: 'rangeCopied'; source: ChangeSource; rows: number; columns: number; cells: number; cut: boolean }  // counts only, never values
```
The layering guard stays at 28 916 (a test pins that the step adds no base runtime).

## API (`@dzgrid/core/range`)
```ts
/** Display positions (inclusive, top ≤ bottom, start ≤ end) and indices into the visible columns; one `displayed` version. */
export interface RangeBox { readonly top: number; readonly bottom: number; readonly start: number; readonly end: number }
export function rangeBox(r: CellRange, displayed: DisplayedRows<unknown>, columns: readonly string[]): RangeBox | null;
/** The data rows of a box in display order (details, fillers, loading rows stepped over). */
export function boxRows<T>(b: RangeBox, displayed: DisplayedRows<T>): DataNode<T>[];
export function boxSize(b: RangeBox, displayed: DisplayedRows<unknown>): { rows: number; cols: number; cells: number };

export function encodeTsv(m: readonly (readonly string[])[]): string;
export function decodeTsv(text: string, o?: { pad?: boolean }): string[][];

export interface CopyOptions<T> { readonly ctx: LocaleCtx; readonly reader: ValueReader<T>; readonly guard?: boolean /* true */;
  readonly raw?: boolean /* false: QB9 */; readonly headers?: boolean /* false */ }
/** The texts (export values, B11) and the values shown (the memo of B10), rows × visible columns of the box. */
export function copyMatrix<T>(b: RangeBox, displayed: DisplayedRows<T>, columns: readonly ResolvedColumn<T>[], o: CopyOptions<T>):
  { readonly text: string[][]; readonly values: unknown[][] };

export interface PlannedCell { readonly key: RowKey; readonly column: string; readonly input: CellInput }
export interface PastePlan { readonly cells: readonly PlannedCell[]; readonly outside: number; readonly tooBig: boolean;
  /** What was written, for the range shown after the paste (Excel selects the pasted block); null when nothing. */
  readonly box: RangeBox | null }
export const PASTE_MAX = 100_000;                                          // QB4
export function planPaste(src: readonly (readonly CellInput[])[], at: RangeBox, displayed: DisplayedRows<unknown>,
  columns: readonly ResolvedColumn<unknown>[], o?: { readonly max?: number }): PastePlan;
/** The text of one pasted cell, made ready for the column's reader (B10–B11; QB3, QB10). */
export function pasteText(text: string, col: ResolvedColumn<unknown>): string;

export type FillWay = 'down' | 'up' | 'end' | 'start';
/** A drag from the source box to a cell (display row, column index): the box to fill and its way; null inside the source. */
export function fillTarget(src: RangeBox, to: { readonly row: number; readonly col: number }): { readonly box: RangeBox; readonly way: FillWay } | null;
export function planFill<T>(src: RangeBox, target: RangeBox, way: FillWay, displayed: DisplayedRows<T>,
  columns: readonly ResolvedColumn<T>[], o: { readonly ctx: LocaleCtx; readonly reader: ValueReader<T>; readonly mode?: 'auto' | 'copy'; readonly swap?: boolean }): PlannedCell[];
```
Bulk is `planPaste([[input]], box, …)` (one value fills the range, rule P2): no function of its own (bytes).
`CellInput` is imported as a **type** from `core/edit/input.ts` (erased; layering test: no run-time import).

## Behaviour (each rule has its conformance cases)

**Box (R)**
- R1 `rangeBox`: both corners' rows displayed (`indexOf ≥ 0`) and both columns in `columns`, else null (B2: the
  DOM drops the range). Normalised: anchor below or after the focus gives the same box.
- R2 `boxRows`: every display index top..bottom whose node is `data`; a corner on a detail, filler or loading row
  is allowed (the focus can rest there) and contributes no row. `boxSize.cells = rows × cols` of data rows.

**TSV (T, ported from the spike, S7 rules)**
- T1 encode: cells joined by TAB, **every row ends with CRLF, the last too**; a cell is quoted when it holds TAB,
  CR, LF or `"`, inner `"` doubled; nothing else quoted (Arabic, RLM, `=`, spaces untouched).
- T2 decode, lenient: CRLF, LF, lone CR end a row; exactly one final break dropped; a field is quoted only when it
  starts with `"` and a closing `"` is followed by TAB, a break or the end, else literal (`5" inch`, `"5" inch`,
  an unterminated `"abc` stay as typed); empty trailing cells kept; ragged rows as they are; `pad` evens them
  with `''`. The empty text decodes to `[['']]`, which the paste plan treats as nothing (P0).
- T3 never throws, any input (property test).

**Copy (C)**
- C1 `copyMatrix`: rows = `boxRows`, columns = `columns[start..end]`; text by `writerFor` with `{ sep: '\t',
  display: false, raw, iso: false, codes: false, guard, quote: identity }`: numbers in the locale's decimal mark
  without groups (QB9 A; `raw: true` a point), Latin digits, ISO days, instants as wall time in `ctx.timeZone`
  (`YYYY-MM-DD HH:mm:ss`), enum labels, booleans `true` / `false`, blank → `''`, `="0123"` for a `csv: 'text'`
  identifier, the guard's `'` (QB3 A). No tree indent (`pad` never passed).
- C2 `values[r][c]` = the shown value (`reader.value`, else `col.read`), coerced by the codec; null for blank or
  unreadable (the memo pastes values back, B10).
- C3 `headers: true` adds a first row of headers (`headerOf` rules, zone after a wall-time instant), not in `values`.
- C4 the box holds data rows only: a detail, filler or loading row inside writes **no line** (D11).

**Paste (P; `planPaste`, ported rules of `cell-range.ts`, ARCH §3.0 change 5)**
- P0 an empty source (`[]`, or `[['']]` from an empty clipboard text) plans nothing (the DOM says nothing).
- P1 the target's rows are the **data rows** from `at.top` down in display order (`nextData`), stepping over
  details, fillers and loading rows **without consuming a source line**; columns from `at.start` to the
  logical end of `columns`.
- P2 shape (QB6 A): source 1 × 1 → every cell of `at` (data rows × columns); `at` a single cell → the source's
  own size from there; `at` a whole multiple of the source (data rows and columns) → repeated; otherwise once
  from `at`'s top-left. Ragged rows: missing cells are `''` (clear), as Excel's rectangular blocks.
- P3 cells past the last data row shown or past the last visible column: not planned, counted in `outside`
  (once per source cell that falls out).
- P4 planned cells over `max` (default `PASTE_MAX`): `tooBig: true`, `cells: []`, `box: null` (nothing written,
  never truncated).
- P5 no editability check here: `commit` refuses `read-only` (non-editable column, locked structure column,
  non-data row) and counts it with the codec's and the rules' codes (one place). The plan never names a
  non-data row (the property test holds it).
- P6 `{ value }` inputs (the memo) pass unchanged; `{ text }` inputs go through `pasteText(text, col)`:
  - number columns (QB10 A): a currency sign (`\p{Sc}`) at the start or end, with the spaces around it,
    removed; nothing else (parentheses, words) — the codec decides the rest;
  - text columns: a leading `'` directly before `=`, `+`, `-`, `@` (the guard's mark, ours or Excel's habit)
    removed; `="digits"` → `digits` (our identifier mark);
  - all: one trailing CR left by a single-cell copy already removed by T2; otherwise the text as is.
- P7 cells in row then column order (the first is the focus target after an undo, O10); each cell once; `box`
  = the written block's corners (data rows only).

**Fill (F; `fillTarget` + `planFill`; `fill-handle.ts` rules re-read, `Date` replaced by `addDays`)**
- F1 `fillTarget`: the axis is the one the cell is farther out of the source on (rows vs columns; ties: rows);
  down / up extend the source's columns, end / start extend its rows; a cell inside the source → null.
- F2 per line (a column for down / up, a row for end / start), the source's values in the fill's direction
  (through the reader, coerced; data rows only); `mode: 'copy'` repeats them in order (cyclic).
- F3 `auto` (B12): numbers — one value copies; two or more, all numbers, with one constant step → the step goes
  on; days — one day steps by one day; two or more days with one constant step in days → the step goes on
  (`addDays`, month ends and leap years by the day arithmetic); anything else (text, lists, yes/no, instants,
  mixed, a blank in the source, unequal steps) repeats. `swap: true` (Ctrl at the drop) turns a copy into a
  series and a series into a copy; a single number swapped steps by 1.
- F4 backwards (`up`, `start`): the series continues before the first source cell (`first − k × step`), the
  repeat runs backwards from it.
- F5 numbers are rounded to the largest count of decimals among the source's export texts (`0.1, 0.2 → 0.3`,
  never `0.30000000000000004`); a step that leaves the safe range plans `{ value }` the codec will refuse.
- F6 outputs `{ value }` inputs (`commit` checks `min`, `max`, the codec); details and fillers in the target are
  stepped over and never planned; the source cells are never planned again.
- F7 Ctrl+D / Ctrl+R are fills with `mode: 'copy'` from the box's first row / first column (the DOM builds the
  boxes, including « one cell: from the cell above / before »).

## The sheets, written first (in this step's first commit, before any code)
- **`docs/behaviors/range-selection.md`** (new): what the user does (Shift+arrows, Shift+click, drag, Ctrl+A,
  Shift+Space, Escape), observes (the tinted block with its edge, the size said); behaviours B2–B8 and B13 in our
  words, numbered; the keyboard table (ltr / rtl / Mac); a11y (`aria-selected` on range cells only — the APG
  « should » not followed on purpose, why; `aria-multiselectable`; the size sentence; forced colours); trees,
  details, nested grids, spans, server pages; clearing (QB7); tests to come.
- **`docs/behaviors/clipboard.md`** (new): copy, cut, paste, Delete on a range; the routing (document, active
  element, nested grids, fields and text selections left alone); `text/plain` first, HTML only when the text is
  empty; **the security rule** (pasted HTML read in an inert document, text only, never inserted, no `innerHTML`;
  our HTML escaped, no attribute from data); shapes (P2), outside, read-only, refused and too-long counted, too
  big (QB4); one gesture, one request, one undo; the memo; health data (`canCopy`, `rangeCopied` counts only);
  **an Excel interop table**, one line per case with the text, the locale and the result: quotes, newlines in a
  cell, a last empty row, a single cell's CRLF, `1 234,50` fr, `1,234.50` en, `1,5` en refused, `١٢٫٥` ar,
  `1 234,50 €` (QB10), `05/03/2026` fr, `3/5/2026` en-US, `2026-03-05` everywhere, a wall time inside a clock change
  refused, `VRAI` / `faux` / `نعم`, Arabic text with RLM untouched, `'=1+1` read back, `="0123"` read back, RTL
  column order logical; server grids; menus later (S7 decision 4).
- **`docs/behaviors/fill.md`** (new): the handle (24 px hit area, drawn small, bottom inline-end corner, bottom-left
  in RTL, hidden on one cell and while a field is open, `aria-hidden` with the keyboard alternative); the series
  table (F3) with examples written by hand; backwards; Ctrl at the drop; Ctrl+D / Ctrl+R (copy only, from the
  first row / column, one cell from the cell above / before, logical end in RTL, Mac Cmd); bulk (Ctrl+Enter in a
  field per QB5, `api.apply`); one gesture each; refused counted; stale order (K.14) after a fill on a sorted
  column.
- **Updates**: `selection.md` (with `range()`: Shift+click and Ctrl+A per QB1); `tree-selection.md` (cell ranges
  across levels, the tree column copied without indent, structure columns read-only); `master-detail.md` (never in
  a range; paste and fill step over; each nested grid its own range and clipboard); `editing.md` 19 (the Ctrl+Enter
  hand-off, QB5) and 24 (origins `paste`, `fill`, `bulk`, `cut`); `edit-save.md` 1 and `edit-undo.md` 1 (the Part B
  gestures are now real); `value-input.md` (pasted text: P6); `spans.md` (ranges not grown); `cell-class.md`
  (`dzg-cell--range` and the edge classes); `docs/a11y-protocol.md` **§20** (in French, items 125–136: select with
  Shift+arrows and hear each cell then the size; Shift+Space; Ctrl+A; Escape; copy said; paste counted with a refused
  cell blinking; Ctrl+Z after a paste; Ctrl+D; Delete on a range; a range in Arabic, mirrored keys; a nested grid;
  the « not selected » noise check of B7).

## Files
Create `core/src/range.ts` (entry), `core/src/range/{box,tsv,copy,paste,fill}.ts`, `core/src/selection/cells.ts`
(types); modify (types) `kernel.ts`, `index.ts`; `packages/core/package.json` export `./range`; `scripts/build.mjs`
entry; vitest and `tsconfig.spec.json` aliases; `size-budget.json` `@dzgrid/core/range` 4 000 over the core;
`scripts/rebudget.mjs` ceiling 4 000 (Q16). Conformance: `conformance/cases/{range-box,clipboard-tsv,paste-plan,
fill-plan}/*.json`, `conformance/runner/suites/range.ts`, schema entries. Tests:
`core/test/{tsv-property,paste-plan-property,range-copy,range-fill,range-paste-text}.test.ts`; `public-api`,
`types`, `layering`, `purity` (scans `src/range/`), `rebudget` updated.

## Tests first (each red before its code, on a stub entry that returns nothing)
1. **Conformance `clipboard-tsv`** (hand-written both ways): the spike's 14 decoding cases; encode of TAB, CR, LF,
   `"`, a last row of empty cells, Arabic with RLM and `=` unquoted; decode of CRLF / LF / CR, one final break
   dropped, two kept as an empty row, `5" inch`, `"5" inch`, `"abc` unterminated, `"a""b"`, a quoted cell with
   CRLF inside, ragged rows with and without `pad`, the empty text.
2. **Conformance `range-box`**: normalised corners; a corner off the display → null; a hidden column → null;
   a box across a detail, a filler, a loading row (rows skipped, `boxSize` counts data rows); a muted ancestor
   counted; pinned columns in reading order.
3. **Conformance `paste-plan`**: 1 × 1 on a 3 × 2 range (6 cells); 2 × 2 on one cell; 2 × 2 on 4 × 4 (tiled);
   2 × 2 on 3 × 3 (once); outside rows and columns counted; **a detail between target rows stepped over without
   consuming a line** (the step-8 handover, core half), a filler and a loading row the same; a corner on a detail;
   `max` exceeded → `tooBig`, nothing; empty source; ragged → `''`; `{ value }` inputs untouched; order of cells;
   `box` of the written block; a server page's last row (outside).
4. **Unit `range-paste-text`** (P6): `1 234,50 €`, `€ 12`, `$1,234.50`, `12 $` in a number column → sign removed;
   `(1 234)` unchanged; `'=1+1` → `=1+1` in a text column, kept in a number column; `'abc` unchanged; `="0123"` →
   `0123`; `="a1"` unchanged; Arabic text with RLM unchanged.
5. **Conformance `fill-plan`**: one number down copies; `1, 2` down → `3, 4, 5`; `2, 4` up → `0, −2`; `0.1, 0.2` →
   `0.3, 0.4` exactly; `1, 2, 4` repeats; one day → next days across 2028-02-28 → 02-29 → 03-01; `2026-01-31,
   2026-02-28` → a 28-day step, then `2026-03-28`; text `a, b` repeats; an enum
   repeats; an instant repeats; a blank in the source repeats; `swap` on one number → +1, on `1, 2` → copy; end /
   start in reading order; a detail inside the target stepped over; `fillTarget` axis and ties; inside → null.
6. **Unit `range-copy`**: values through an overlay reader (the edited value, not the source); fr `1,5`, en
   `1.5`, `raw` `1.5`, ar-DZ `1,5` Latin digits, ar-EG Latin digits too; Algiers instant wall time; enum label;
   yes/no `true`; blank and unreadable `''`; guard `'=1`, off with `guard: false`; `="0123"`; headers row with the
   zone; a tree's column without indent; a detail row writes no line; `values` coerced, null for blanks.
7. **Property `tsv-property`** (20 000 seeds, test PRNG, alphabet: TAB, CR, LF, CRLF, `"`, Arabic, RLM, `=`,
   spaces, empty): `decodeTsv(encodeTsv(m), { pad: true })` equals `m` padded; `decodeTsv` of random strings never
   throws and gives rows of strings.
8. **Property `paste-plan-property`** (1 000 seeds; displayed rows mixing data, details, fillers, loading; random
   box and source up to 6 × 6): every planned cell is a data row at or below `at.top` in display order and a column
   at or after `at.start`; no cell twice; no non-data row ever; `cells + outside` equals the shape's source cells
   (P2) unless `tooBig`; the order is row then column; `box` covers exactly the planned cells.
9. **Layering / purity / public API / rebudget**: `/range` imports nothing from `/edit` at run time and the base
   never imports `/range` (planted case red first); purity on `src/range/`; the `/range` export list; the budget
   line and the ceiling 4 000; the base guard unchanged at 28 916.

## Mutants worth running (copy of the repo, deleted after)
CRLF only between rows (last row lost); quoting on `,`; decode treating `5" inch` as quoted; dropping two final
breaks; P1 consuming a source line on a detail; tiling when not a multiple; `outside` not counted on columns;
`tooBig` truncating instead of refusing; P6 removing `'` before any character; currency stripped inside the number;
F3 series from one number; F5 without rounding; F4 backwards with the wrong sign; `fillTarget` tie to columns;
`copyMatrix` reading `col.read` instead of the reader; the guard off by default; `rangeBox` keeping a box when a
column is hidden.

## Sizes (gz, measure: `gz(core + entry) − gz(core)`)
Target 2 200–3 000 B (TSV ~550, box ~300, copy over the shared `writerFor` and `wallWriter` ~500 — counted here,
as `/csv` is another entry —, paste with `pasteText` ~500, fill ~700). Ceiling 4 000 (Q16); the line is set at the
close (measure + 10 %). Base: 0 B (pinned). Nothing else moves.

## Docs
The three sheets and the updates above (first commit); `partB-plan.md` « Done » for step 10; ROADMAP Phase 5 Part
B line; STATUS (step 10 done, next 11a); `decisions.md` with the owner's QB answers; ARCHITECTURE Phase 5 index
(Part B decisions, in French) — the §3.8 « Superpositions » paragraph marked superseded for ranges (B7).

## Risks
`writerFor`'s bytes counted inside `/range` (an app with `/csv` and `/range` pays them twice; accepted: shared
chunks are the bundler's job); the decimal-place rule of F5 on numbers written with an exponent (use the codec's
`toExport`; test `1e-7`); P2's multiple test over data rows (a detail inside the target changes the count:
cases 3 hold it); currency stripping deciding too much (P6 strips one sign at an end only; QB10 B removes it);
`'` read-back dropping a quote a user really typed before `=` (rare; written in the sheet); a large paste
(100 000 cells) planned in one array (~ms; measured at step 12).

## Owner questions for this step
Step 10 needs **QB3, QB4, QB6, QB9, QB10** (they fix `copyMatrix` and `planPaste`); QB1, QB2, QB5, QB7 (DOM) and
QB8 (sizes, benches) can wait for steps 11–12 but are asked together (`partB-plan.md` §8).

## Done
(2026-10-25, not committed.)

**Sheets first** (before any code): new `docs/behaviors/range-selection.md`, `clipboard.md` (with the « Excel
interop » tables, copy and paste, one line per case), `fill.md`; updates to `selection.md` (QB1), `tree-selection.md`,
`master-detail.md`, `editing.md` 19 (Ctrl+Enter, QB5) and 24 (origins), `edit-save.md` 1, `edit-undo.md` 1,
`value-input.md` (pasted text), `spans.md`, `cell-class.md`; `docs/a11y-protocol.md` §20 in French (items 125–136).
One sheet line corrected by its test: a last empty row pasted clears the cell (the empty text is the column's empty
value, edit-validation.md 1), it is not written as `''`.

**Built.** Base: types only — `selection/cells.ts` (`CellAddr`, `CellRange`), `SaveOrigin` + `cut`, events
`rangeChanged`, `rangeCopied` (counts only); the base measures 28 916 B gz, unchanged. Entry `@dzgrid/core/range`
(`range.ts`, `range/{box,tsv,copy,paste,fill}.ts`): exactly the API above, plus the type `FillOptions`. Wiring:
`packages/core/package.json` `./range`, `scripts/build.mjs`, the vitest and `tsconfig.spec.json` aliases,
`size-budget.json` (`@dzgrid/core/range` 4 000 over the core), `scripts/rebudget.mjs` ceiling 4 000. Conformance:
`range-box` 8, `clipboard-tsv` 29 (the spike's 14 decoding cases among them), `paste-plan` 21, `fill-plan` 33
(runner `conformance/runner/suites/range.ts`, README table; shown rows written as tokens through the new
`packages/core/test/support/shown.ts`).

**Tests that failed first** (on a stub entry returning nothing; recorded runs in the scratchpad `s10-red*.txt`):
- `rebudget.test.ts` « Phase 5 step 10 » (ceiling null ≠ 4 000) and `release.test.ts` « @dzgrid/core/range » (run with
  the manifest and build list stashed): red, then green with the budget, the ceiling and the export;
- `public-api.test.ts` (no module `@dzgrid/core/range`), `layering.test.ts` (« holds its modules »: no build, then
  `src/csv/writers.ts` missing from the stub; « fits its grant »: 204 B ≤ 500 on the stub), `purity.test.ts`
  planted range cases (run with the checker's new rules taken out: `[]` ≠ `['range import']`);
- `types.test.ts` (typecheck red with the base types stashed: no `CellAddr` / `CellRange`, `SaveOrigin` without
  `cut`, no `rangeChanged` / `rangeCopied`);
- conformance: 85 of the 91 new cases red; the 6 green on the stub assert an absence (`encode-empty-matrix`,
  `target-inside`, `empty-source`, `empty-clipboard-text`, `column-hidden`, `corner-not-shown`), kept as guards;
- units: `range-copy` 11 / 11, `range-paste-text` 8 / 9 (the one green: « Arabic … as it is », an identity guard),
  `range-fill` 7 / 7, `tsv-property` 5 / 5, `paste-plan-property` 1 / 1 red.

**Property tests**: TSV round trip of 20 000 random grids (tabs, CR, LF, CRLF, quotes, Arabic, Arabic-Indic digits,
RLM and LRM, an emoji, `=`, spaces), padded ragged grids (2 000), random text never failing (20 000), 100 000 rows
decoded and padded without a deep stack; the paste plan against an oracle (1 000 seeds; data, muted, details,
fillers, loading rows; random boxes, sources up to 6 × 6, caps); number series against a scaled-integer oracle
(2 000 seeds, Ctrl swap, backwards) and day series against `Date.UTC` (1 000 seeds); `fillTarget` over every cell
around a source. Seeds replay (`TSV_SEED`, `PASTE_SEED`, `FILL_SEED`).

**Mutants** (in a copy of the repo, rsync without `node_modules`, symlinked; deleted after): **33 run, 33 killed** —
the blueprint's 17 (CRLF only between rows; quoting on `,`; `"5" inch` quoted; two final breaks dropped; a detail
using a line; tiling when not a multiple; outside not counted on columns; too big truncating; `'` removed before
anything; a currency stripped inside the number; a series from one number; no rounding; backwards with the wrong
sign (down/up and end/start); the tie to columns; `copyMatrix` reading `col.read` (copy and the shown values); the
guard off by default; a box kept over a hidden column) and 15 more (a lone CR not a break, `pad` ignored, the empty
clipboard planned, a currency at both ends, the identifier mark read in number columns, the box from the target's
top, swap ignored on a series, copy mode ignored, exponent decimals ignored, a day overflow planned blank, `raw`
ignored, headers at the end, detail rows copied, corners not normalised).

**Sizes**: `@dzgrid/core/range` **2 643 B gz** over the core (target 2 200–3 000; grant 4 000; the line at the close,
measure + 10 %); core 28 916 / 29 000 (unchanged, pinned); `core/edit` 3 098 / 3 100 (untouched, frozen).

**Deviations** (lead):
1. `planPaste` and `pasteText` are generic over the row type (`ResolvedColumn<T>`): `ResolvedColumn<unknown>` refused
   a grid's own columns (parameter variance).
2. QB10: besides a Unicode currency sign, an ISO code in capitals (`DZD`, `EUR`) and the Algerian dinar's `د.ج` are
   removed at one end (the owner named DZD); `€ 12 €` loses the first only; a text that would be left empty is kept.
3. The guard is read back in every non-number column by the same rule the copy writes it (`'` followed by what
   `FORMULA` matches: a leading TAB or spaces before `=+-@` too), not only `'` directly before `=+-@`.
4. A block or one value pasted on a box holding no data row (a detail only) writes from the next data row down
   (P1's rule); with none below, all of it is outside.
5. Fill: unequal steps stay a repeat with Ctrl too (no trend); two equal numbers are a series of step 0 (the same
   cells as a copy); a series past the numbers or days the grid holds plans `Infinity` / `NaN`, which the column
   refuses and counts (never a blank).
6. Not touched in this step: `vite.config.ts` (editing it restarts the vite of port 4700) and
   `packages/dom/tsconfig.json`; their `@dzgrid/core/range` aliases come with step 11a, the first DOM import.

**Gate** (once, `caffeinate -i`, every vitest pass at `--maxWorkers=2`, in a Python subprocess per command): `build` green
(core gains `./range`); `typecheck` green (core, dom, tests, Angular templates); `check:size` 79 entries, 0 over
(core 28 916 / 29 000, `core/range` 2 643 / 4 000, `core/edit` 3 098 / 3 100, angular 6 743 / 6 793); `test:ci`
**373 files, 5 953 tests, all green** (216 s); `test:perm` (PERMS=1000) 5 files, 10 tests green (154 s). No browser:
no DOM change. No orphan test process left.

## Review
(2026-10-25, not committed; the reviewer's and the test analyser's reports; owner « QB10 confirmed » in
`decisions.md`.) Each fix with a test first, red on the step's code (run `s10-rev-red.txt`: 10 red).

- **R1–R2, currency (paste.ts):** only real ISO 4217 codes (`Intl.supportedValuesOf('currency')`, read once into a
  Set; a short built-in list when Intl lacks it) and the local forms `DA`, `د.ج`, `دج`, `ج.م`; `SKU 100`, `100 PCS`,
  `ABC 12` stay refused. Bidi marks ignored (`stripMarks`), so Intl's own ar-DZ / ar-EG / fr-DZ currency texts read;
  a sign before a leading symbol kept (`-$1,234.50` → −1234.5); accounting parentheses stay refused. Red first: the
  three `range-paste-text` « currency codes and local forms » tests.
- **R3, a leading BOM (tsv.ts):** dropped. Red first: `clipboard-tsv/decode-bom`.
- **R4, the copy guard (lead):** a text starting with `'` before `=+-@` gets a `'` too (`'=x` → `''=x`), the
  clipboard only (`WriterEnv.tick`, set by `copyMatrix`; the CSV export unchanged); the paste removes one `'`
  directly before a formula start or before our guarded `'`. Red first: `range-copy` « a real quote … survives a trip
  through Excel », and `pasteText("''=1")` now `'=1`.
- **R5:** clipboard.md 19 says a literal `="12"` is read as 12 (Excel's text number form).
- **R6, days:** an ISO day at midnight (`2026-03-05 00:00:00`) reads as the day; `5-Mar-2026`, `46086` and another
  time are refused (sheet and tests). Red first: `range-paste-text` « day columns ».
- **Real bug (analyser): bulk edit of an emptied field planned nothing** (P0 dropped `[['']]`). P0 now plans
  nothing only for a source with no cell; one empty text plans clears; the empty clipboard text is the DOM's to
  skip before planning (clipboard.md 14). `paste-plan/empty-clipboard-text` replaced by `bulk-empty-clears` (red
  first) with `bulk-value-null` and `space-clears` (guards); the property oracle follows (red first).
- **Gaps added** (green on the code, kept as guards): currency limits (`12 %`, `12 abc`, `-$12`, `12 دج`, `12 ﷼`,
  `₹12`; the first three of the « limits » test were red through `-$12`); guard read back (`' =1`, `'\t=1`, enum and
  day columns, `="0123"x`, `=""`; red through `' =1`, which the step's code unguarded); `clipboard-tsv/
  decode-quoted-lone-cr`; `range-box/anchor-column-hidden`, `anchor-row-not-shown`; `PASTE_MAX` 100 000 and the
  default cap (100 000 planned, 100 001 refused, no `max`); the fill overflow `toBe(Infinity)`.
- Sheets: clipboard.md 6, 11, 14, 19 and the interop table; fill.md 9.

**Gate after the review** (once, `caffeinate -i`, every vitest pass at `--maxWorkers=2`): `build` green; `typecheck`
red once (a test's `string | undefined`, `range-copy.test.ts`), fixed with a non-null mark, green again; `check:size`
0 over (core 28 916 / 29 000, `core/range` **2 897** / 4 000, `core/csv` 1 868 / 2 000 for the clipboard's `tick`);
`test:ci` **373 files, 5 966 tests green**; `test:perm` 10 / 10. No orphan test process.

