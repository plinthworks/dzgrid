# Copy, cut, paste and Delete on a block

Written before the code (CLEANROOM). Sources: the public documentation of spreadsheets and grids about
copying cells (what lands in a spreadsheet, what a paste writes), the browsers' public documentation of the
clipboard events (`copy`, `cut`, `paste`, `clipboardData.setData` / `getData`, `text/plain` and `text/html`)
and of the Async Clipboard API, RFC 4180 (quoting), the TSV and HTML shapes spreadsheets exchange as their
public documentation describes them (spike S7: `spikes/s7-clipboard/README.md`, decisions 1–5; fixtures
written by us from the documented shape), WCAG 2.2 (3.3.1, 4.1.3). Plans: `partB-plan.md` (B9–B11, B13),
`step10-plan.md` (T1–T3, C1–C4, P0–P7); owner decisions Q9 (refused cells skipped and counted), S3-O2
(partial server refusals), S5-O5 (1 000 characters), QB3, QB4, QB6, QB9, QB10. Blocks:
`range-selection.md`; values typed or pasted: `value-input.md`; the export rules a copy reuses:
`csv-export.md`.

## What the user does
Selects a block (or stays on one cell) and presses Ctrl+C, Ctrl+X or Delete; goes to a cell or a block and
presses Ctrl+V (Cmd on a Mac); copies cells in Excel, Google Sheets, LibreOffice or Numbers and pastes them
into the grid, or the other way round.

## What they observe
- Ctrl+C on a block puts its cells on the clipboard: pasted into a spreadsheet, each value lands in its own
  cell, numbers as numbers, dates as dates. « Cellules copiées : 6 » is said.
- Ctrl+V writes the cells from the focused cell or into the block, in one go: the saving marks show on each
  cell, and one Ctrl+Z gives every cell back. « Cellules collées : 12 ; refusées : 2 ; en lecture seule : 3 ;
  hors de la grille : 4 » is said (owner S11b-Q4: a label and its count, no plural forms), the refused cells
  blink.
- Ctrl+X copies, then clears the editable cells; Delete clears them without copying.
- Inside a field (an open editor, a filter input, the search box), these keys are the field's, as always.

## Behaviours (numbered, each one a test)

**Where the keys go** (S7 decision 3)
1. The grid listens to `copy`, `cut` and `paste` on the **document** and acts only when
   `document.activeElement` is inside its own root (the innermost `.dzg` root: a nested grid acts for
   itself, D13), never by the event's target (Firefox targets `<body>`; Chrome may target a field that
   still holds a selection).
2. Nothing is taken when the focus is in a field, a widget, a popup or a nested grid's cells, or when the
   page holds a non-empty text selection and there is no block of two cells or more: the browser copies
   the text.
3. No `execCommand`. Keyboard copy, cut and paste need no permission in any engine. A menu « Copier » /
   « Coller » (Phase 9 menus) will use `navigator.clipboard.write` / `readText` and, when reading is
   refused, say « utilisez Ctrl+V » (S7 decision 4); the API is ready (`api.copy()`, `api.paste(text)`).

**Copy** (B9, C1–C4; QB3, QB9)
4. What is copied: the block, else the focused cell. Rows: the data rows of the block in display order;
   a detail, filler or loading row inside writes **no line**. Columns: the visible columns of the block in
   reading order (logical in both directions).
5. `text/plain` is TSV (4–6 below) of the **export values**, the CSV writer's rules with a tab
   (`csv-export.md`, the table of types): numbers in the grid locale's decimal mark without groups
   (owner QB9: a comma in French and in Algerian Arabic, a point in English and in Egyptian Arabic; Latin
   digits always; `raw` writes a point); days ISO `YYYY-MM-DD`; instants as the wall time of the display
   zone `YYYY-MM-DD HH:mm:ss`; enum labels; yes/no `true` / `false`; a blank or unreadable cell empty; a
   digits-only identifier (`csv: 'text'`) as `="0123"`; values read through the edit overlay (what the
   user sees, not the host's old value); a tree's column without its indent.
6. The formula guard (owner QB3): a text whose first visible character is `=`, `+`, `-` or `@` (or a TAB,
   CR, LF) is written with a `'` in front, as in the CSV; so is a text that starts with `'` followed by
   `=`, `+`, `-` or `@` (`'=x` → `''=x`, `'+33` → `''+33`: Excel takes the first `'` as its text mark, so the
   cell's own quote survives the trip; the clipboard only, the CSV export is unchanged). `range({ guard:
   false })` turns it off. A typed number is never guarded. Our own paste removes one guard (19).
7. `text/html` is a `<table>` with `dir` of the grid, every text escaped (`&`, `<`, `>`, `"`), `<br>` for
   a line break inside a cell, nothing else from the data: no attribute, no style, no class.
8. Headers only through the API (`copy({ headers: true })`): a first row of the columns' headers, the zone
   after a wall-time instant's (`Date (Africa/Algiers)`).
9. `range({ canCopy })` may refuse (health data): nothing is written, it is said. `rangeCopied { rows,
   columns, cells, cut }` tells the application counts only, **never values**.

**TSV** (T1–T3, S7, the spreadsheets' documented shape)
10. Written: cells joined by TAB; **every row ends with CRLF, the last one too** (what a spreadsheet
    writes, and the only way a last row of empty cells survives); a cell is quoted when it holds TAB, CR,
    LF or `"`, its inner `"` doubled; nothing else is quoted (Arabic, the RLM mark, `=`, spaces stay as
    they are).
11. Read, leniently: a leading byte order mark dropped; CRLF, LF and a lone CR each end a row; exactly one final line break is dropped (a
    single cell copied from Excel ends with CRLF: it is not an empty second row); a cell is quoted only
    when it starts with `"` and a closing `"` is followed by TAB, a line break or the end — otherwise it is
    literal (`5" inch`, `"5" inch`, an unterminated `"abc` stay as typed); empty trailing cells are kept;
    ragged rows are taken as they are (a short row's missing cells are empty, 15). Reading never fails.
12. `text/plain` first; `text/html` only when the text is empty, then only its first `<table>` (S7
    decision 1).

**The security rule for pasted HTML** (B10)
13. Pasted HTML is read in an **inert document** (`DOMParser`), never appended, imported or adopted into
    the page; only the text of `td` / `th` is walked (`<br>` → a line break, `colspan` / `rowspan` →
    empty covered cells). HTML over 4 MB is ignored. **Pasted HTML never reaches the live page; no
    `innerHTML` anywhere**; cells keep writing text nodes. No script runs, nothing is fetched.

**Paste** (B10, P0–P7; Q9, QB4, QB6)
14. Nothing pasted when the clipboard text is empty: the DOM checks the text before planning, nothing is
    said. The plan itself writes one empty text as clears (a bulk edit of an emptied field clears the block,
    `fill.md` 9); only a source with no cell plans nothing (P0).
15. The shape (owner QB6, as Excel): one value on a block fills the block; a block pasted on one cell
    writes its own size from there; a block pasted on a larger block whose rows and columns are each a
    whole multiple of it repeats to fill it; otherwise it is written once from the block's top-left
    corner. A short row's missing cells are written empty (a spreadsheet's block is a rectangle).
16. Rows are the **data rows** from the top of the target down, in display order: a detail, a filler or a
    loading row is stepped over **without using a line** of the clipboard. Columns go from the target's
    first column to the logical end.
17. Cells past the last row shown (a server page's last row too) or past the last visible column are
    not written and counted « hors de la grille ». Hidden columns are not visible, so never written.
18. One paste is **one gesture, one save request, one undo** (`commit(cells, { origin: 'paste' })`).
    Refused cells are skipped and counted (owner Q9): the column's reader refuses (`1,5` in English),
    a rule refuses (`min`), a read-only cell (a column not editable, a tree's structure column, a row
    that is not data) is counted « en lecture seule », a text over the editors' cap (1 000 characters, or
    the column's `edit.maxLength`, S5-O5) « trop long ». Each refused mounted cell blinks. A server that
    refuses some cells of the request refuses only those (S3-O2).
19. Text made ready for the column before it is read (`pasteText`, P6):
    - a number column: the direction marks (LRM, RLM, ALM) are ignored; one currency at the start (a sign
      before it kept: `-$1,234.50` → −1234.5) or else at the end, with the spaces around it, is removed
      (owner QB10, confirmed): any Unicode currency sign (`€`, `$`, `£`, `₹`, `﷼`…), a **real** ISO 4217
      code in capitals (`DZD`, `EUR`; from the browser's list of currencies), or the local forms `DA`,
      `د.ج`, `دج`, `ج.م` — so the browser's own Arabic currency texts (`‏1.234,50 د.ج.‏`) read. Nothing else:
      other capitals (`SKU 100`, `100 PCS`, `ABC 12`), a percent sign, words, accounting parentheses
      (`(1 234 €)`) stay, and the column's reader refuses them;
    - a day column: an ISO day at midnight (`2026-03-05 00:00:00`, Excel's text of a date cell) is read as
      the day. Excel's other forms are refused and counted: `5-Mar-2026`, a serial number (`46086`), a day
      with another time;
    - other columns (days too): one `'` directly before `=`, `+`, `-` or `@`, or before our guarded `'`
      (`''=x` → `'=x`), is removed — the guard our copy writes, and Excel's own habit; `' =1` or `'abc`
      stay. `="0123"` (our identifier mark) becomes `0123`; a **literal** text `="12"` is read the same,
      as 12 (Excel's form of a text number), while `="0123"x` or `=""` stay as typed;
    - the text as it is otherwise.
20. Too big (owner QB4): a paste that would write more than 100 000 cells writes **nothing** and says so
    once (« collage trop grand ») — never truncated. `range({ maxPaste })` changes the number.
21. The block shown after a paste is the block written (Excel selects the pasted block).
22. **Own copy memo** (B10): the last block this page copied is kept as values while the clipboard text is
    exactly what we wrote; a paste of that text writes the **values** (exact types, no locale reading again,
    no guard mark). Cleared when the clipboard text differs, at destroy; never sent anywhere.

**Cut and Delete**
23. Cut = the copy, then the block's editable cells cleared as one gesture (origin `cut`, one request, one
    undo); read-only cells are copied, not cleared, and counted.
24. Delete or Backspace on a block clears its editable cells as one gesture (origin `edit`, as Delete on
    one cell, `editing.md` 24); read-only cells counted.

**Server grids, trees, details** (B13)
25. Server grids: copy writes only the rows held; a paste past the page's last row is « hors de la
    grille »; a pasted value on a server-sorted or -filtered column marks the order stale (S2-O2).
26. Trees: the tree column is copied without its indent; structure columns (`tree({ structure })`) are
    read-only, counted. Details: never copied or pasted; stepped over and counted for nothing.

## Excel interop (each line a hand-written test; PB8)

Copy (grid → spreadsheet; the cell's value, the grid's locale → the `text/plain` written):

| Case | Grid locale | Value | Written |
|---|---|---|---|
| decimal, French | fr-FR | 1234.5 | `1234,5` |
| decimal, English | en-US | 1234.5 | `1234.5` |
| decimal, Algerian Arabic | ar-DZ (Latin digits) | 1.5 | `1,5` |
| decimal, Egyptian Arabic | ar-EG (Latin digits) | 1.5 | `1.5` |
| `raw` numbers | fr-FR | 1.5 | `1.5` |
| a day | any | 2026-03-05 | `2026-03-05` |
| an instant, Algiers | fr-FR, zone Africa/Algiers | 2026-03-05T22:59:00Z | `2026-03-05 23:59:00` |
| yes / no | any | true | `true` |
| an enum | fr-FR | `out` labelled « Rupture » | `Rupture` |
| a formula start | any | `=1+1` | `'=1+1` |
| guard off | any | `=1+1` | `=1+1` |
| an identifier | any | `0123` (`csv: 'text'`) | `="0123"` |
| a tab, a newline, a quote | any | `a<TAB>b`, `l1<LF>l2`, `5" inch` | `"a<TAB>b"`, `"l1<LF>l2"`, `"5"" inch"` |
| Arabic with RLM | ar-DZ | `<RLM>محمد` | `<RLM>محمد` (unquoted, untouched) |
| a last row of empty cells | any | `a`, then `''` | `a<CRLF><CRLF>` |
| right to left | ar-DZ | columns Nom, Stock | `Nom<TAB>Stock` (logical order: the grid's first column is the sheet's column A) |

Paste (spreadsheet → grid; the text, the grid's locale, the column → what the cell receives):

| Case | Text | Grid locale | Column | Result |
|---|---|---|---|---|
| quotes around a tab | `"a<TAB>b"<CRLF>` | any | text | `a<TAB>b` |
| a newline in a cell | `"l1<LF>l2"<TAB>x<CRLF>` | any | text | `l1<LF>l2`, then `x` |
| a last empty row | `a<CRLF><CRLF>` | any | text | two rows: `a`, then the cell cleared (empty) |
| a single Excel cell | `12<CRLF>` | any | number | one cell, 12 |
| a literal quote | `5" inch` | any | text | `5" inch` |
| French groups | `1 234,50` | fr-FR | number | 1234.5 |
| English groups | `1,234.50` | en-US | number | 1234.5 |
| a comma in English | `1,5` | en-US | number | refused (`parse`), counted |
| Arabic-Indic digits | `١٢٫٥` | ar-DZ | number | 12.5 |
| a currency (QB10) | `1 234,50 €` | fr-FR | number | 1234.5 |
| a currency code | `1 234,50 DZD` | fr-FR | number | 1234.5 |
| a dollar | `$1,234.50` | en-US | number | 1234.5 |
| parentheses | `(1 234)` | fr-FR | number | refused, counted |
| a French day | `05/03/2026` | fr-FR | day | 2026-03-05 |
| an American day | `3/5/2026` | en-US | day | 2026-03-05 |
| an ISO day | `2026-03-05` | any | day | 2026-03-05 |
| a wall time in a clock change | `2026-03-29 02:30:00` | fr-FR, zone Europe/Paris | instant | refused (`wall-time-skipped`), counted |
| yes / no words | `VRAI`, `faux`, `نعم` | fr-FR / ar-DZ | yes/no | true, false, true |
| Arabic with RLM | `<RLM>محمد` | ar-DZ | text | `<RLM>محمد` unchanged |
| our guard read back | `'=1+1` | any | text | `=1+1` |
| a guard on a number | `'=1+1` | any | number | refused (the `'` stays), counted |
| our identifier read back | `="0123"` | any | text | `0123` |
| a real currency code only | `SKU 100`, `100 PCS` | en-US | number | refused, counted |
| Intl's Algerian text | `‏-1.234,50 د.ج.‏` | ar-DZ | number | -1234.5 |
| a local code | `1 234,50 DA` | fr-DZ | number | 1234.5 |
| a sign before the symbol | `-$1,234.50` | en-US | number | -1234.5 |
| a midnight day | `2026-03-05 00:00:00` | any | day | 2026-03-05 |
| Excel's other days | `5-Mar-2026`, `46086` | any | day | refused, counted |
| a real `'=x` copied | cell `'=x` | any | text | written `''=x`; read back `'=x` |
| not our identifier | `="a1"` | any | text | `="a1"` unchanged |

Real captures from Excel (Windows, macOS), Google Sheets, LibreOffice and Numbers: the owner, not blocking
(S7 open point), added to `spikes/s7-clipboard/fixtures/` when they come.

## As built at step 11b (lead decisions L1–L13, `docs/phase-5-steps/step11b-plan.md`; owner S11b-Q1–Q4)
- **Routing (L1).** `copy`, `cut` and `paste` are heard on the document. The grid takes one only when no one
  prevented it before (a host's own handler wins), the focused element's innermost `.dzg` root is its own, the
  focus is on a cell (or on a header while a block exists), and there is something to copy or paste into (L2):
  the block, else the focused cell when it is a data row's. A focus on a detail, filler or loading row with no
  block: nothing taken, nothing said. Copy and cut with no block while the user has selected text INSIDE the grid:
  the browser's (a paragraph selected elsewhere, then Tab to a cell, copies the cell — review 5). The focus is
  followed into shadow roots: a grid inside one works, and a grid nested in another's shadow root is its own
  (review 1). The keydown of Ctrl / Cmd + C, X, V is never prevented (a prevented keydown kills the event).
- **Copy (L4, L5).** Once taken, the event is always prevented: a copy `canCopy` refuses leaves the clipboard
  empty rather than leaking a page selection, and says « Copie non autorisée ». `text/html` is
  `<table dir="ltr|rtl"><tbody><tr><td>…</td></tr></tbody></table>` (`<th>` for the API's header row), every
  text escaped (`&`, `<`, `>`, `"` as numeric references) and its line breaks written `<br>`.
- **Cut (owner S11b-Q1).** The copy, then the block's cells cleared at once in one save (origin `cut`), undone
  by one Ctrl+Z. « Cellules coupées : n » counts the cells cleared; read-only cells are copied, not cleared,
  counted apart.
- **Pasted HTML on demand (owner S11b-Q5).** Its reader is a chunk of its own (`range/html/`), loaded only when a
  paste carries no plain text: the HTML string is read inside the event (the data is readable then only), the event
  prevented at once, the cells written when the chunk is there — at the corners of the paste's moment (row keys
  and column ids; a corner no longer shown: nothing). A later paste drops one still waiting (review 4). A chunk
  that fails to load: nothing written, « Échec du chargement » said (the grid's own text); the next paste tries
  again. `api.paste('', html)` answers null at once. The reader skips `script`, `style`, `noscript`, `template` in
  any case (SVG's are lower case, review 2); `rowspan="0"` spans to the end of its table section (HTML), within the
  cap.
- **A huge plain text (review 3).** A text over 64 K characters goes through the same chunk, which counts its cells
  before decoding — its lines (one final break dropped; the count stops past the cap) × its first line's cells, a
  quoted break or tab counted as one — and refuses it with the « too large » sentence; within the cap it is decoded
  and pasted as always (a moment later). A shorter text is decoded at once.
- **Paste (L6).** `text/plain` first; `text/html` only when the text is empty. Cells over their column's cap are
  set aside (« trop longues »); without `edit()` every cell counts « en lecture seule ». Read-only refusals are
  counted, not blinked; other refusals counted « refusées » and each mounted one blinks. The block shown after
  is the block written (one cell written: no block); the keyboard focus does not move.
- **Memo (L7).** Page-wide: the text a grid of the page last wrote, its values, each cell's column type and
  id. A paste of exactly that text writes the values where the target column has the same type (an enum: the
  same column of the same grid), else the text. Replaced by the next copy, dropped at the destroy of the grid
  that wrote it.
- **Options (L9).** `range({ canCopy, guard, raw, maxPaste })`: `canCopy` gets column ids and counts, never
  values (a throw counts as a refusal); a `maxPaste` that is not a positive number is told (`invalid-setting`,
  path `range.maxPaste`) and the default kept.
- **Delete on a block (L10).** Delete or Backspace while a block exists clears its cells in one save (origin
  `edit`), « Cellules effacées : n »; with no block the editors keep their one-cell Delete, whatever the order
  of the features.
- **Sentences (L11).** Each part is a label and its count; a zero count is left out, the first always said; the
  parts after the first carry their own separator (` ; ` in French, `; ` in English, `؛ ` in Arabic). When the
  save says « Enregistrement en cours » in the same moment, both are joined in one sentence (ours first); two
  gestures in one moment (the API called twice) are said in order, the saving sentence once after them. A paste
  too large gives the limit, not the count (an HTML table stops being read at the limit): « Collage trop grand :
  au plus 100 000 cellules ; rien n'est collé ». Arabic, shortened to fit its 500 B (to be read by an Arabic
  reader): « النسخ: n », « القص: n », « اللصق: n », « المسح: n », « اللصق أكبر من {max} خلية؛ لم يُلصق شيء ».
- **API (L12).** `copy()`, `cut()`, `paste(text, html?)` and `erase()` act as the keys (the sentence, the
  `rangeCopied` event with source `api`, the block after a paste); they never touch the system clipboard.

## Where DzGrid differs on purpose
- The guard on copy (QB3): Excel would run `=…` pasted from us; we write `'` in front, as the CSV.
- Too big writes nothing rather than a part (QB4): a part of a paste on health records is worse than none.
- A currency sign is removed on paste (QB10) but nothing else is guessed (`(1 234)` stays refused).
- No marching ants, no « paste special », no paste that adds rows in this phase.

## Tests
Step 10 (core): `conformance/cases/clipboard-tsv/*` (T1–T2, the spike's 14 decoding cases),
`conformance/cases/paste-plan/*` (P0–P7), `packages/core/test/tsv-property.test.ts` (20 000 random grids
round trip; random text never fails), `packages/core/test/paste-plan-property.test.ts` (against an
oracle), `packages/core/test/range-copy.test.ts` (C1–C4, the copy table above),
`packages/core/test/range-paste-text.test.ts` (P6, the paste table above through the editing reader).
Step 11b (DOM): `range-copy`, `range-paste`, `range-cut`, `range-html-safety`, `range-html-lazy`,
`range-html-fail`, `range-paste-property` (against a hand-written oracle, through the real `edit()`), the re-pins
of `edit-detail.test.ts` and `editors-paste-pin.test.ts`, the source scan in `range-seams`; browser
`scripts/browser-clipboard.mjs` (Chrome with the clipboard permissions and an insecure context; Firefox and WebKit
through the events; Arabic; the playground).
