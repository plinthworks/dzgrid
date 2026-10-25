# Phase 5, step 11b — `@dzgrid/dom/range`, part 2: the clipboard — blueprint (architect, 2026-10-25)

Status: **to validate with the owner** (questions S11b-Q1 to S11b-Q4 at the end, in French). Sources, which win in
this order: `decisions.md` (Q9 « paste: refused cells skipped and counted », S3-O2, S5-O5, S8-O2, QB3, QB4, QB6, QB9,
QB10 + its confirmation, S11-Q5 « the clipboard stays in `dom/range` »); `partB-plan.md` B8–B11, B13, PB4–PB9, PB11;
the sheets `clipboard.md` (cited `CB n`), `range-selection.md` (`RS n`), `edit-save.md` 1, 5b, `edit-undo.md` 1–8;
`step10-plan.md` and `step11a-plan.md` (Done / Review); spike S7 (`spikes/s7-clipboard/README.md`, decisions 1–5).
Code read: `core/src/range/*`, `core/src/edit/{controller,input}.ts`, `dom/src/range/*`, `dom/src/edit/*`,
`dom/src/editors/index.ts`, `dom/src/keys/{router,owner}.ts`, `dom/src/a11y/live-region.ts`. Clean room: browsers'
public docs of `copy` / `cut` / `paste`, `DataTransfer`, `DOMParser`, the Async Clipboard API; spreadsheets' public
docs (what Excel / Sheets show when one cuts and pastes); never another grid's or spreadsheet's code (`node_modules`
included). Fill handle, Ctrl+D / R, Ctrl+Enter bulk and Angular: step 12 (own entry for the fill, S11-Q5).

## Findings (code read at the step-11a working tree)
1. **Everything pure is built** (`@dzgrid/core/range`, external to `dom/range`, so 0 B here): `copyMatrix` (texts by
   `writerFor` with the guard and the `''=` tick, values shown), `encodeTsv` / `decodeTsv`, `planPaste` (shape QB6,
   data rows only, `outside`, `tooBig` before any cell is built, `box`), `pasteText` (QB10 currency, guard read back,
   `="0123"`, midnight days) — `planPaste` already applies `pasteText` to `{ text }` inputs.
2. **The edit layer takes the gesture as it is**: `commit(cells, { origin, source })` = one generation, one
   `SaveRequest`, one undo batch (every origin but undo / redo), unchanged cells dropped, `refused: [{ key, column,
   code }]` with `read-only` for a non-editable cell, a structure column or a non-data row; `SaveOrigin` has
   `paste | cut`. S3-O2 partial refusals are the controller's. `dom/edit` is full (4 146 / 4 150): **no change there**.
3. **Sentences collide**: `marks.say` announces « Enregistrement en cours » from a **microtask** queued inside
   `commit`; a range sentence announced synchronously after `commit` would be replaced by it (`LiveRegion.announce`:
   « a newer sentence replaces one not yet said »). `EditApi` has no `say`. `LiveRegion.said` is public.
4. **Delete has an owner already**: `editors` clears the focused cell on Delete / Backspace; the router asks the
   features **in order**, so with `editors()` before `range()` a Delete on a block would clear one cell.
5. **Keydown must stay free**: the router `preventDefault`s every key a feature takes; a prevented Ctrl+C / X / V
   keydown kills the browser's `copy` / `cut` / `paste` event. Today nothing takes them (`intentFor` has no C / V / X).
6. `ownerOf(target, viewport)` (`keys/owner.ts`, base) says `editor`, `cell-widget`, `popup`, `filter-input`, `cell`,
   `header`; imported by the entry it costs ~0 B (the size line is `over: @dzgrid/dom`, base code shared).
7. Editors' cap (S5-O5): `col.def.edit?.maxLength ?? 1000`, `0` / `Infinity` = none (`editors/index.ts:255`); not
   exported (the entry duplicates the 3-line rule).
8. Placeholders to re-pin: `edit-detail.test.ts:45` (« a paste on the panel's cell: not taken »),
   `editors-paste-pin.test.ts` (a paste in an open field is the field's). Synthetic `ClipboardEvent` data is ignored
   by Firefox (S7 5): jsdom tests dispatch an `Event` with a defined `clipboardData` `{ getData, setData, types }`.
9. Sizes: `dom/range` 2 949 / 4 500 (**1 551 left**); texts `-range` 179 / 203 / 305 of 350 / 400 / 500; base
   21 566 / 21 700; `range.css` 398 / 500.

## Lead decisions (written into the sheets in this step's first change, before code)
- **L1 routing (CB 1–2, S7 3).** `copy`, `cut`, `paste` listened on `g.doc` (bubble, `g.scope.on`). Ours only when:
  not `defaultPrevented` (a host's own handler wins); `a = doc.activeElement`, `a.closest('.dzg') === el.root`
  (innermost: a nested grid is its own); `ownerOf(a, el.viewport)` is `cell`, or `header` with a block; the target
  exists (L2). Copy / cut only: not ours when there is **no block** and `doc.getSelection()` holds non-empty text
  (the browser copies it). Never by `e.target`.
- **L2 target.** The block's box (`rangeBox`), else the focused cell **when it is a data row** (`isDataKey`) and its
  column visible. A focus on a detail, filler or loading row with no block: not taken (nothing prevented, nothing
  said) — the `edit-detail` re-pin. A block over a detail steps over it (core P1).
- **L3 keydown free.** No Ctrl / Cmd + C, X, V in any `keys` hook; a test pins the keydown not prevented. Shift+Delete,
  Ctrl+Insert, Shift+Insert, the browser's Edit menu reach us through the same events (free).
- **L4 copy / cut.** `preventDefault()` always once ours (a refused copy writes an empty clipboard rather than leaking
  a page selection); then `canCopy` (L9); `copyMatrix` → `setData('text/plain', encodeTsv(text))` and
  `setData('text/html', table)`; memo (L7); `rangeCopied { source, rows, columns, cells, cut }`; sentence. A cut sets
  the data **before** clearing (values read first), then `commit(editable cells → { text: '' }, { origin: 'cut' })`.
- **L5 the HTML written (CB 7).** `<table dir="ltr|rtl"><tbody><tr><td>…</td></tr></tbody></table>` (`<th>` for
  headers by the API); every text through one `esc` (`&` `<` `>` `"`), CR LF / LF / CR → `<br>`; `dir` from `g.dir`
  only; no attribute, class or style from data; no `<meta>` (the browser adds its own).
- **L6 paste.** `preventDefault()` once ours; `text = getData('text/plain')`; empty → `html = getData('text/html')`
  (L8). Both empty → nothing, nothing said (CB 14). `decodeTsv(text)` → `{ text }` inputs (or memo values, L7) →
  `planPaste(src, box, displayed, visible, { max })`; `tooBig` → one sentence, nothing else; then the **too long**
  cells (a `{ text }` or string `{ value }` longer than the column's cap, finding 7) set aside and counted; without
  `edit()` every planned cell counts « read-only », nothing committed; else **one** `commit(rest, { origin: 'paste',
  source })`; `read-only` codes counted apart and **not blinked**, other codes counted « refusées » and each mounted
  one blinked (`api.refuse`, its limiter); « pasted » = planned − too long − refused (unchanged cells count as pasted:
  the user sees the value). The block becomes the written box (CB 21): anchor top-start, focus bottom-end,
  `follows = false`, the keyboard focus not moved, no size sentence; one cell written → no block.
- **L7 the memo (CB 22), page-wide.** A module variable `{ text, values, types, cols, owner }`: the TSV string last
  written by any grid of the page, its values, each cell's column type and id. A paste whose `text/plain` is exactly
  `text` takes `{ value }` per cell **only where the target column has the same type** (an enum: the same column id
  of the same grid), else that cell's text. Cleared when a later copy writes, and at the destroy of the grid that
  wrote it. Never sent, never in an event.
- **L8 the HTML read (security, below).** Only when `text/plain` is empty; first `<table>`; text only; result as
  `{ text }` inputs, never the memo.
- **L9 options** (added to `RangeOptions`): `canCopy?(c: { columns: readonly string[]; rows: number; cells: number;
  cut: boolean }): boolean` (column ids, counts — never values; a throw counts as false); `guard?` (QB3, default true);
  `raw?` (QB9, default false); `maxPaste?` (QB4, default `PASTE_MAX`; a non-positive or non-number value →
  `invalid-setting` at `range.maxPaste`, default kept).
- **L10 Delete / Backspace on a block (CB 24).** A second handle `head` put **first** in `g.features` at the first
  paint (as 11a's `tail` is put last), taking plain Delete / Backspace on owner `cell` **only while a block exists**:
  one `commit` of clears, origin `edit`; read-only counted; refusals (a required column) blink; sentence
  « Cellules effacées : n ». With no block the editors keep their one-cell Delete (finding 4).
- **L11 sentences (B8, S11b-Q4).** Built as `[main, ...parts].join(' ; ')`, then announced in a **microtask queued
  after `commit`**: when `g.live.said` changed during the gesture (the saving sentence), the result is
  `${ours}. ${said}`, else ours (finding 3; 0 B in `dom/edit`). A server refusal later keeps Part A's sentences.
- **L12 API speaks like the keys** (precedent S8-O2: `api.undo()` acts as Ctrl+Z): `copy`, `cut`, `paste`, `erase`
  say their sentence, send `rangeCopied` with source `api`, set the block after a paste; they never touch the
  system clipboard (a menu, Phase 9, writes what `copy()` returns with `navigator.clipboard.write`).
- **L13 server grids, trees, details, spans, nested (CB 25–26, B13).** Nothing of their own: the rows shown are the
  page held; past the page's last row is « outside »; a server-sorted column gets the stale mark from `commit`
  (S2-O2); structure columns refuse `read-only`; the tree column copies without indent (`copyMatrix`); covered span
  cells are written like others; each nested grid its own listener and memo owner.

## API
```ts
// @dzgrid/dom/range — 11a's exports plus:
export interface RangeOptions {
  readonly drag?: boolean;                                   // 11a
  readonly canCopy?: (c: CopyAsk) => boolean;                // L9
  readonly guard?: boolean;                                  // QB3, default true
  readonly raw?: boolean;                                    // QB9, default false
  readonly maxPaste?: number;                                // QB4, default 100 000
}
export interface CopyAsk { readonly columns: readonly string[]; readonly rows: number; readonly cells: number; readonly cut: boolean }
export interface ClipboardText { readonly text: string; readonly html: string }
export interface PasteCounts {
  readonly pasted: number; readonly refused: number; readonly readOnly: number;
  readonly tooLong: number; readonly outside: number; readonly tooBig: boolean;
}
export interface RangeApi {
  get(): CellRange | null; set(r: CellRange | null): boolean; clear(): void; box(): RangeBox | null;   // 11a
  /** As Ctrl+C on the block, else the focused data cell (headers only here); null: nothing to copy or `canCopy` refused. */
  copy(o?: { readonly headers?: boolean }): ClipboardText | null;
  /** As Ctrl+X: the copy, then the editable cells cleared (one gesture, origin `cut`). */
  cut(): ClipboardText | null;
  /** As Ctrl+V with this text (TSV; `html` read only when `text` is empty); null: no target. */
  paste(text: string, html?: string): PasteCounts | null;
  /** As Delete on the block (origin `edit`); null: no block. */
  erase(): PasteCounts | null;
}
// RANGE_KEYS gains: 'range.copied','range.cut','range.pasted','range.erased','range.refused','range.readOnly',
//                   'range.tooLong','range.outside','range.tooBig','range.noCopy'
```
Texts (S11b-Q4 A, label form, no plural forms): fr « Cellules copiées : {n} », « Cellules coupées : {n} »,
« Cellules collées : {n} », « Cellules effacées : {n} », « refusées : {n} », « en lecture seule : {n} »,
« trop longues : {n} », « hors de la grille : {n} », « Collage trop grand : {n} cellules, au plus {max} ; rien n'est
collé », « Copie non autorisée » (NNBSP before « : » as the bundle does); en / ar the same shapes. `clipboard.md`'s
example sentence updated to this form. Zero counts are left out of the joined sentence (the main count always said).

## Event flow per browser (keyboard; menus by the same events)
| Step | Chrome / Edge | Firefox | Safari / WebKit |
|---|---|---|---|
| keydown Ctrl/Cmd+C on a cell | router: no feature takes it, not prevented (L3) | same | same |
| event fired | `copy` at the focused cell, bubbles to `document` | `copy` at **`<body>`** | WebKit (Playwright): `copy` at the cell. **Real Safari with no text selection: [À VÉRIFIER], owner S11b-Q2** |
| ours? | `activeElement` rule (L1), never `target` | same (target ignored) | same |
| write | `setData` plain + html, `preventDefault` | same | same (WebKit adds styles only to what `clipboard.write` puts, S7) |
| paste | `paste` at the cell; `getData('text/plain')` | at `<body>`; same | at the cell |
| permission | none for the keys, in a secure **and an insecure** context (`clipboardData` is the event's) | none; a privacy pref (`dom.event.clipboardevents.enabled=false`) silences the events: nothing happens, written in the sheet | none |
| `navigator.clipboard` | not used by the grid; absent in an insecure context (only a future menu cares) | real Firefox shows its own « Coller » menu on `readText` | `readText` shows Safari's « Coller » bubble |
| a field open (editor, list search, calendar, filter input, quick search) | `ownerOf` = `editor` / `popup` / `filter-input` → not ours; the field's native copy / paste | same | same |

## The security rules for pasted HTML (CB 13; PB9)
1. Read only when `text/plain` is empty or missing; ignored (nothing pasted, nothing said) over **4 MB**
   (`html.length > 4 << 20`), checked **before** parsing.
2. Parsed by `new win.DOMParser().parseFromString(html, 'text/html')`: a document with no browsing context —
   scripts never run, nothing is fetched (img, link, iframe, object, video poster, `<svg><image>`, CSS `url()` /
   `@import`, `<meta http-equiv=refresh>`, `<base>`).
3. **Nothing from it ever enters the page**: no `innerHTML`, `outerHTML =`, `insertAdjacentHTML`,
   `createContextualFragment`, `document.write`, `importNode`, `adoptNode`, `append*` / `insert*` / `replace*` of a
   parsed node, `<template>` in the live document — anywhere in `dom/src/range/` (a source grep in `range-seams`).
   No reference to the parsed document is kept after the read.
4. Read: `doc.querySelector('table')` (the first), `table.rows`, `tr.cells`; per cell only its **text nodes**, by a
   walk that skips `script`, `style`, `noscript`, `template`; `<br>` → LF; source whitespace collapsed; a cell of
   only spaces / NBSP / breaks → `''`. No attribute is read except `colSpan` / `rowSpan`, clamped to 1..1 000 and to
   the rows left in the table; covered cells `''`. No hint (`x:num`, `sdval`, `data-sheets-value`) is used.
5. Bombs: the matrix stops growing at `maxPaste + 1` cells → treated as too big (one sentence); a `rowspan=65534
   colspan=1000` cell costs at most that.
6. The result is strings only, fed as `{ text }` inputs to the same plan and `commit` (all the editing rules apply);
   cells write text nodes, as always.

## Tests to write FIRST (red on a stub whose new handlers do nothing; runs saved as scratchpad `s11b-red*.txt`)
Each file names `clipboard.md`; ltr / rtl; jsdom; a helper `clip(t, type, data?)` in `support-range.ts` dispatches an
`Event` with a fake `clipboardData` at `document.body` (Firefox's shape) or at a cell, the focus set beforehand.
1. **`range-paste-property.test.ts` (first of all)** — through the **real** `edit()` with a recording `save`
   (`PASTE_DOM_SEED`; 300 seeds in the suite, 3 000 once): random shown rows (flat, tree with a structure column,
   details, a path tree's fillers, a server page), random visible columns (text, number fr / en / ar-DZ, day, instant
   in Algiers, enum, yes/no, a read-only column, `required`, `min`, `maxLength` 5 / 0), a random block or a focused
   cell, a random clipboard: a matrix drawn from **per-type tables of (text → expected value | refusal code)** written
   by hand (currency, guard, `="0123"`, Arabic-Indic digits, `1,5` in en, too long, empty), sometimes ragged, sometimes
   a memo hit, sometimes over a lowered `maxPaste`. The **oracle**, by hand from the sheet (not from `planPaste`):
   target data rows, tiling, outside, too big, per cell read-only / too long / refused / value. Assertions: **at most
   one** save request, its changes deep-equal the oracle's accepted-and-changed cells; `undo` once → the shown values
   deep-equal those before; counts and the joined sentence; the blinked set = the oracle's refused mounted cells
   (never a read-only one); the block after = the oracle's written box; never a non-data row named; a random
   `error.cells` answer (S3-O2) refuses exactly those cells.
2. `range-copy.test.ts` — exact `text/plain` and `text/html` by hand: the `clipboard.md` copy table (fr / en / ar-DZ /
   ar-EG numbers, `raw`, ISO day, Algiers wall time, enum label, `true`, guard on / off, `''=x`, `="0123"`, tab /
   newline / quote, RLM Arabic, last empty row, RTL logical order and `dir="rtl"`); `<script>` text in a cell escaped;
   headers by `api.copy({ headers: true })` only; a detail inside writes no line; one focused cell with no block;
   focus on the header with a block (Ctrl+A); the event at `<body>` (Firefox) and with a textarea holding a selection
   elsewhere (Chrome); not ours: owner editor / popup / filter-input / cell-widget / outside, a nested grid's cell, a
   page text selection with no block (not prevented), `defaultPrevented` by the host; keydown Ctrl / Cmd+C not
   prevented; `canCopy` false (prevented, nothing written, « Copie non autorisée », no event) and throwing (= false);
   `rangeCopied` counts only (no value anywhere in the event, deep-checked).
3. `range-paste.test.ts` — the paste table of `clipboard.md` through the DOM; shapes (one value on a block, block on a
   cell, tiling, not a multiple, ragged); outside (rows, columns, server page's last row); read-only (column, tree
   structure, without `edit()`); refused codes counted and blinked; too long (1 000 default, `maxLength`, `0` none);
   too big (100 000 planned ok / 100 001 nothing, said once; `maxPaste`); memo round trip (an ambiguous wall time and
   `0.1 + 0.2` exact; an enum code never into a text column; another grid of the page; cleared at destroy; a
   different text → the text path); one request + one undo + one sentence joined with « Enregistrement en cours »;
   S3-O2 partial; empty clipboard nothing said; `"\r\n"` (one empty Excel cell) clears; the block after; focus unmoved.
4. `range-html-safety.test.ts` — payloads `<img src=x onerror>`, `<script>`, `<iframe src>`, `<svg onload>`,
   `<object>`, `<link rel=stylesheet>`, `<style>@import</style>`, `<meta http-equiv=refresh>`, `<base>`, `style=
   "background:url()"`, a `<td><script>t</script>a</td>` (→ `a`), a rowspan / colspan bomb, 5 MB: a MutationObserver
   on the live document records **0** nodes, a global flag set by every handler stays unset, `text/plain` non-empty
   wins over hostile HTML, only text reaches `commit`; the S7 fixtures (Excel Windows CF_HTML, Sheets, LibreOffice)
   give `expected.json`'s matrices.
5. `range-cut.test.ts` — one request, one undo, origin `cut`; read-only copied not cleared, counted; values read
   before the clear (the text is the old values); `canCopy` false clears nothing; Delete / Backspace on a block
   (L10) with `editors()` **before** and after `range()` in `features`; Delete with no block still the editors' one cell.
6. **Re-pins**: `edit-detail.test.ts` « a paste on the panel » — with the real handler: not taken (not prevented,
   nothing kept); a block across the master rows and the panel: the panel stepped over, its line not used, nothing
   counted for it. `editors-paste-pin.test.ts` — with `range()` + `edit()` + `editors()`: a paste in the open field
   is not prevented, nothing committed, the field open; the same paste with the focus on the cell **is** taken
   (proves the listener is live).
7. `range-seams` (the grep of rule 3, no `execCommand`, no `navigator.clipboard`), `range-layering` (no run-time
   import of `/edit`, `/editors`, `/filters`, `/tree`; `EditApi` as a type), `range-texts` (the ten keys in en / fr /
   ar, `RANGE_KEYS` = the bundles' keys), `range-api` (copy / cut / paste / erase speak and send `source: 'api'`).

## Mutants (in a repo copy, rsync without `node_modules`, linked; deleted after; each must be killed)
Routed by `e.target`; taken from an open field / a popup / a filter input / a widget; taken with a page selection and
no block; `defaultPrevented` ignored; copy not prevented; html not written; `esc` without `<` or `"`; `dir` fixed to
ltr; headers on the keyboard copy; HTML read when `text/plain` is not empty; the 4 MB cap removed; spans not clamped;
`script` text kept; a parsed node imported into the page; `commit` per cell (n requests); origin `edit` for a paste
or a cut; read-only blinked / refused not blinked; too long not applied, or `maxLength: 0` capped; too big
truncating or silent; the memo used for a different text, across column types, or kept after destroy; empty clipboard
clearing; the block after not set / the focus moved; a cut clearing read-only cells, clearing before reading, or
clearing when `canCopy` refuses; `rangeCopied` sent on a refusal or with values; the sentence not joined (lost to
« saving ») or said twice; Delete on a block clearing one cell (head handle removed); Delete with no block taken;
a nested grid's paste taken by the outer; a detail focus taken; a Ctrl+C keydown prevented; `guard`, `raw`, `maxPaste`
ignored; without `edit()` a throw.

## Browser checks (one headless browser at a time, always closed; `npm run test:browser -- --only range`)
- **Chrome**, real clipboard: `context.grantPermissions(['clipboard-read','clipboard-write'])` (CDP); real
  `ControlOrMeta+C` / `X` / `V`; `navigator.clipboard.read()` → our exact TSV and `<table dir>`; fixtures put by
  `clipboard.write` (Excel-Windows-shaped TSV, Sheets, LibreOffice, an HTML-only payload) then `ControlOrMeta+V`;
  memo round trip; cut then Ctrl+Z; hostile HTML-only payloads: **CDP `Network.requestWillBeSent` 0** and
  `page.on('request')` 0, MutationObserver 0, flag unset; 5 MB ignored without a long task; a field open: Ctrl+V lands
  in the input natively; a nested grid; a text selection outside with no block copies the text. An **insecure
  context** (`http://dzg.test:<port>` mapped by `--host-resolver-rules`, `isSecureContext === false`): the keyboard
  copy and paste still work. The headless clipboard is the browser's own (S7: `pbpaste` unchanged — checked before /
  after, read-only).
- **Firefox and WebKit** (Playwright builds, no read permission): through the events — copy in the grid, then
  `Cmd+V` into a page `<textarea>` (the TSV) and into a listener recording `getData('text/html')`; paste: a helper
  element whose own `copy` handler writes a fixture, `Cmd+C` there, focus a cell, `Cmd+V`; Firefox's `<body>`
  target; hostile HTML with `page.on('request')` 0 and MutationObserver 0.
- **Arabic**: `ar-DZ`, dark Midnight: copy writes `1,5` and the logical order; `١٢٫٥` and `‏-1.234,50 د.ج.‏` pasted;
  the sentences in Arabic; `dir="rtl"` in the HTML.
- **Playground `orders-edit.html`** fr and `?locale=ar-DZ&theme=dark&skin=midnight` (and `?paged=1`): copy a block
  of « Qté », paste it on another block → one request in the demo's log, Ctrl+Z gives every cell back, the joined
  sentence; « 1 234,50 € » into a price; cut; Delete on a block; Ctrl+V in an open editor is the field's. Screenshots
  `docs/screenshots/step11b-*.png`.
- **Owner, by hand** (not blocking the commit, listed in STATUS): grid → Excel (Windows and macOS) and Google Sheets,
  fr and ar: numbers as numbers, days as dates, `'=1+1` shown as text, `0123` kept, line breaks in a cell, column A =
  the grid's first column in RTL — **Excel and Sheets may read our HTML before the TSV** (risk K1); Excel → grid;
  real Safari Cmd+C / Cmd+V on `orders-edit` (S11b-Q2); the sentences with VoiceOver / NVDA (a11y §20).
Gate at the commit (once): `build`, `typecheck`, `test:ci`, `test:perm`, `check:size`, `check:contrast`, `test:browser`
(full); no orphan process (`ps`).

## Sizes (gz, estimates to measure; `dom/range` measured over the base, `core/range` external)
| Where | What | Bytes |
|---|---|---|
| `@dzgrid/dom/range` | routing + listeners ~170, copy + HTML writer ~220, memo ~120, paste + counts ~360, HTML reader ~300, cut + erase + head handle ~140, API ~140, options + `canCopy` + event ~90, sentence join ~50 | **~1 450–1 700** → 4 400–4 650 / 4 500 (S11b-Q3) |
| `locales/{en,fr,ar}-range` | 10 texts, no plural forms (S11b-Q4 A) | ~+110 / +130 / +170 → ~290 / 335 / 475 of 350 / 400 / 500 |
| `@dzgrid/core/range`, `core/edit`, `dom/edit`, `/editors`, base | untouched | 0 (2 897, 3 098, 4 146, 6 601, 21 566) |
| `range.css` | nothing | 398 / 500 |
Measure after copy + paste (before the HTML reader and the API): above 4 200 at that point, stop and ask (S11b-Q3).
Time (indicative until the quiet machine, Q17d): copy 10 000 cells ≤ 50 ms; paste 1 000 cells ≤ 40 ms to the repaint
(bench at step 12, QB8); 100 000 planned cells in jsdom without a deep stack.

## Risks
K1 Excel / Sheets paste our **HTML first**: the guard's `'` may show and `="0123"` be read as a formula there (owner
check; if so, the HTML cell carries the plain text with Office's documented text format, a follow-up). K2 real Safari
fires no `copy` without a text selection (S11b-Q2). K3 a browser normalising CRLF in `text/plain` makes the memo miss
(the text path still reads; browser check in three engines). K4 the joined sentence depends on `commit` queueing its
microtask first (a test pins the order; a `dom/edit` change would break it loudly). K5 `dom/range` over 4 500 (S11b-Q3).
K6 `ar-range` near 500 (label form keeps it). K7 a paste during the editors' « typed ahead » wait (one frame) writes
the cell, then the editor opens with the typed text (rare; pinned by a test as built). K8 a block's paste of 100 000
cells and the marks' four clocks (step-12 bench). K9 a refused copy empties the clipboard (on purpose, L4; written).
K10 Firefox's privacy pref disables the events (nothing we can do; sheet).

## Not in 11b
Fill handle, Ctrl+D / R, Ctrl+Enter bulk, Angular `(rangeCopied)` (step 12); menus « Copier / Coller » (Phase 9:
`api.copy()` + `navigator.clipboard.write`, `readText` with « utilisez Ctrl+V »); marching ants, paste special, paste
that adds rows, HTML number hints.

## Questions au propriétaire (★ = recommandé)

**S11b-Q1. Couper (Ctrl+X) : quand les cellules sont-elles vidées ?** (Excel et Google Sheets, d'après leur aide
publique : rien n'est vidé en coupant ; un cadre pointillé animé montre la coupe ; les cellules se vident quand on colle,
une seule fois ; Échap annule.)
- **A ★** tout de suite, en un seul geste (Ctrl+Z rend tout) ; coller ensuite = un collage normal. Simple et visible :
  sans cadre animé (pas dans cette phase), une coupe « en attente » serait invisible.
- B comme Excel : vidées seulement au collage dans cette grille (coller + vider = un geste, une annulation) ; collé
  dans une autre application = simple copie ; ~250 o de plus, sans cadre animé.
- C pas de couper : Ctrl+X copie seulement.

**S11b-Q2. Safari (le vrai, sur Mac) ne donne peut-être pas l'événement « copier » sans texte sélectionné.**
- **A ★** on livre sans parade ; vous essayez Cmd+C / Cmd+V sur `orders-edit` dans Safari ; si rien ne se passe, la
  parade vient à l'étape 12.
- B on ajoute la parade tout de suite (`navigator.clipboard`, ~120 o), sans pouvoir la tester en machine.

**S11b-Q3. Si `@dzgrid/dom/range` dépasse 4 500 o à la mesure (estimé 4 400–4 650) :**
- **A ★** relever le plafond à la mesure + 50, au plus 4 800.
- B retirer la « mémoire de copie » (~120 o) : un collage de notre propre copie relit le texte ; une heure du
  changement d'heure (ambiguë) serait alors refusée.
- C mettre la lecture du HTML collé dans un morceau chargé à la demande (rare : seulement sans texte).

**S11b-Q4. La forme des phrases dites après un collage :**
- **A ★** « Cellules collées : 12 ; refusées : 2 ; en lecture seule : 3 » (sans accord au pluriel ; l'arabe tient
  dans ses 500 o).
- B « 12 cellules collées, 2 refusées, 3 en lecture seule » (accordées ; six formes de pluriel en arabe : `ar-range`
  ~650 o, un relèvement).

## Done
(2026-10-25, not committed. Owner S11b-Q1–Q4 before the code; S11b-Q5 after the first stop at the size budget.)

**Built.** `packages/dom/src/range/clip.ts` (the table a copy writes), `range/html/index.ts` (the pasted-HTML reader,
a chunk loaded on demand, S11b-Q5), `range/index.ts` (routing L1–L2, copy / cut L4, paste L6, memo L7, options L9,
Delete on a block by a `head` handle L10, sentences L11 — batched per task, the latest microtask speaks — API L12),
ten texts in `locales/{en,fr,ar}-range` (label form, S11b-Q4; the parts after the first carry their own separator),
`RangeMessageKey`. The sheet's « As built at step 11b » written before the code. Guards: `range/html/index.ts` alone may
call `parseFromString` (guards.ts, with its test). Budgets: `dom/range` 4 800 (S11b-Q3), its lazy reader 500
(`size-budget.json`, `scripts/rebudget.mjs`). Browser: `packages/dom/test/browser/clipboard.{html,ts}`,
`scripts/browser-clipboard.mjs` (`-- --only clipboard`, and in the full run; the Chrome launch maps `dzg.test` to
127.0.0.1 for the insecure context). Test support `support-clip.ts`; `support-nested-edit.ts` gains `range`.

**Tests that failed first** (stubs; scratchpad `s11b-red-dom.txt`, `s11b-red-dom2.txt`, `s11b-red-lazy.txt`,
`s11b-red-guard.txt`):
- On a stub whose API returned null and handlers did nothing: 60 of 97, then 9 more once paths were fixed —
  `range-paste-property` (the oracle), `range-copy` 19 / 25, `range-paste` all, `range-cut` all, `range-html-safety` 7 / 7,
  `range-api` « the clipboard », `range-seams` « no sink », the re-pins `edit-detail` « a block across master rows and
  an open panel » and `editors-paste-pin` « the same paste with the focus on the cell is the grid's ».
- S11b-Q5, before the split: `rebudget` « step 11b » (4 800, the lazy line), `range-html-lazy` 3 / 6 (destroyed before
  the load, `api.paste('', html)` null, the event's corners), `range-html-fail` « refused, said, tried again »,
  `range-seams` « the lazy folder », `range-html-safety` (the reader's new place).
- The guard's exception: red, then the narrow rule.
- Green on the stubs (guards asserting an absence, kept): the focus outside, a field / popup / filter input / widget, an
  open editor, a header with no block, a host's handler first, Ctrl / Cmd + C, X, V keydowns not prevented, the
  planted-sink self-check, a text paste never loading the reader, the re-pinned placeholders (« not taken », « left to the
  field »).

**Found by the tests while building:** two gestures in one task said each other's sentence, then « Saving » replaced
both (each gesture now queues its microtask after its commit, the latest speaks); several quick HTML-only pastes all
landed at the focus of the load (the event's corners are kept now, as keys); the hand expectations had to include
« . Saving » whenever a request leaves.

**Property test** (`range-paste-property.test.ts`, oracle by hand): 300 seeds in the suite, every path reached three times
at least (asserted); **3 000 seeds once in the gate: green**.

**Mutants** (a copy, rsync without node_modules, linked; deleted after): **52 run, 51 killed, 1 equivalent**. Three
survived the first pass and gave three tests (the memo across column types: an instant onto a number column; an enum's
value onto another enum column; a paste inside a panel's own grid while the outer holds a block). Equivalent: « the
nested grid's paste taken by the outer » — inside a panel the inner grid's elements are the detail cell's widgets for the
outer grid (`ownerOf` → `cell-widget`), so the root check is a second guard (kept, as the plan's L1 says).

**Browser** (one headless browser at a time, closed): `--only clipboard` Chrome **34 / 34** (the real clipboard by CDP
permissions: our TSV and `<table dir>` read back; our copy pasted back in one request, one undo; an Excel-shaped TSV with
a refused cell; an HTML-only LibreOffice payload through the lazy reader; hostile HTML-only: 0 request by `page.on` and
CDP, nothing added, no handler; 5 MB ignored, no long task; a field keeps Ctrl+V; a page selection copies the page; cut and
undo; Arabic; an insecure context `http://dzg.test`: no `navigator.clipboard`, the keys work; `pbpaste` unchanged), and
the real playground `orders-edit.html` fr and ar (a block of Qté copied and pasted on another in one generation, the
joined sentence, Ctrl+Z gives both back; « 1 234,50 € » / « ١٢٣٤ » into Montant; « 5 / abc » with the refusal counted; cut;
Delete on a block; Ctrl+V in an open editor); Firefox **13 / 13** and WebKit **13 / 13** through the events (a copy into a
page textarea, a paste from an element's own `copy` handler — on the document, as Firefox sends it to `<body>` —, hostile
HTML, Arabic). Screenshots `docs/screenshots/step11b-*.png`.

**Sizes** (gz): `@dzgrid/dom/range` **4 787** over the base (4 500 → **4 800**, S11b-Q3); its lazy HTML reader **422**
(**500**, S11b-Q5); texts 319 / 366 / **500** of 350 / 400 / 500 (Arabic shortened: « النسخ: n » …, to the Arabic reader);
`dom/edit`, `/editors`, core, `core/range` and the base untouched.

**Deviations (lead):**
1. Each sentence part after the first carries its own separator (` ; ` fr, `; ` en, `؛ ` ar) instead of one joiner.
2. « Too large » gives the limit, not the count (an HTML table stops being read at the limit).
3. The 11a size sentence counts data rows by `boxSize` (the same count, fewer bytes).
4. A failed load of the reader says the grid's own « Échec du chargement » (no new text: `ar-range` is at 500).
5. `api.paste('', html)` answers null at once; the paste lands with the reader.

**Gate** (`caffeinate -i`, one command at a time, every vitest pass at `--maxWorkers=2`). First run: `test:ci` 1 red —
`guards.test.ts`: the DOM rule « html » refused the reader's `parseFromString` (fixed by a narrow exception, test first,
above); the 3 000-seed property run red at seed 317 — a generator bug in the test (ragged trimming shortened every row,
so a text drawn for a text column landed in an instant column; the first row is now kept whole). Everything else green
(browser 919 / 919). Run again, whole: `build` green; `typecheck` green; `vitest run` **391 files, 6 178 tests, all
green** (223 s); `test:perm` (PERMS=1000) 5 files, 10 tests green; the property test **3 000 seeds** green; `check:size`
0 over (`dom/range` 4 787 / 4 800, lazy reader 422 / 500, texts 319 / 366 / 500); `check:contrast` 852 pairs, 0 below;
`test:browser` (full, Chrome, the clipboard and playground checks included) **919 / 919**; Firefox and WebKit
`--only clipboard` 13 / 13 each. No orphan process. Angular untouched.

## Review
(2026-10-25, not committed; the reviewer's and the test analyser's reports. Each fix with a test first, red on the step's
code: run `scratchpad/s11b-rev-red.txt`, 9 red.)

- **R1 shadow roots** (HIGH): the focus is followed into shadow roots (`activeElement` of each open shadow root), the
  selection read from the grid's root node. Tests: a grid in an open shadow root copies and pastes; an inner grid in a
  shadow root inside the outer grid's detail panel copies its own cell, never the outer's block; browser check
  `clipboard.html?shadow=1` (Chrome).
- **R2** the reader skips `script` / `style` / `noscript` / `template` in any case (SVG / MathML ones are lower case).
- **R3 a huge text**: over 64 K characters a plain text goes through the on-demand chunk, which counts lines × the
  first line's cells before decoding and refuses with « too large » (`range-paste-big.test.ts`, a mocked `decodeTsv`
  never called; a million rows refused in well under 2 s). Lead decision: counting in the entry cost 104 B (over 4 800),
  in the chunk ~20 B; a long text within the cap lands a moment later; a short one stays immediate.
- **R4** a paste still waiting for the reader is dropped by any later paste (a counter; NaN at destroy, which also
  silences a failed load after destroy, m20).
- **R5** with no block, the browser copies only a text selection inside the grid; a paragraph selected elsewhere then
  Tab to a cell copies the cell (jsdom and Chrome).
- **R6 nits**: the memo's JSDoc on `memo`; `rowspan="0"` spans to the end of its section, within the cap (m32 pinned
  with HTML's rule: `[['x','a'],['','b']]`, a `thead` case, the cap). **Not applied, answered**: the lazy line's
  `./html/*` external is needed — without it the line's « alone » build of `dom/range` inlines the chunk and the line
  measured 14 B (the budget test keeps it, with the reason).
- **R7 bytes**: the copy's `put` callback dropped (the handler writes the returned texts); the memo keeps each column's
  kind computed at copy (an enum: the column object itself, its options being its own), no grid counter; `zero()` kept
  inline (a hoisted literal measured 6 B more). Further cuts to fit 4 800 with the fixes: the sentence queue a string,
  the problem details shorter (`shape`, `row`, `column`; codes unchanged), a `speak` helper, the paint's five
  `toggle` calls one loop, `copy` / `cut` sorting before `paste` in `ours`.
- **Test gaps** (the analyser's 20 probes, kept in `scratchpad/t11b-probe*.test.ts`): moved into `range-paste` (m01,
  m03, m05, m06/m07, m08, m11, m12/m13, m14, m19, m21, m24, m34), `edit-detail` (m09/m10, `nest({ rangeOpts })`),
  `range-html-fail` (m20), `range-html-safety` (m27, m29, m32 per R6); a 50-cell « one request » test so the
  per-cell-commit mutant fails fast.
- Tests changed on purpose: two lazy tests paste one HTML at a time now (R4 drops a waiting one); the Chrome check of a
  page selection now expects the cell (R5).

**Gate after the review** (once, `caffeinate -i`, every vitest pass at `--maxWorkers=2`; a first run stopped at a test
file's type — a cast in `range-html-safety`, then the whole gate again): `build`, `typecheck` green; `vitest run` **392
files, 6 205 tests green**; `test:perm` 10 / 10; the property test 3 000 seeds green; `check:size` 0 over;
`check:contrast` 852 pairs, 0 below; `test:browser` (full, Chrome, with the clipboard page, its shadow root and the
playground `orders-edit` fr / ar) **921 / 921**; Firefox `--only clipboard` 13 / 13, WebKit 13 / 13. No orphan process.

**Sizes after the review**: `dom/range` **4 796** / 4 800; the lazy reader **517** (500 → **600**, the measure + 10 %,
S11b-Q5's rule, the long-text count added there); texts 319 / 366 / 500.

