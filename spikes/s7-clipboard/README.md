# S7 — Clipboard with spreadsheets

## Question

How does a grid that is a focusable, non-editable element copy, cut and paste
in Chrome, Firefox and WebKit? What works without a permission prompt? What do
spreadsheets put in `text/html` and `text/plain`, and which one should a paste
read? What quoting makes TSV round-trip?

Decision to make: the paste path (`text/html` first or `text/plain` first), the
quoting rules, and the permissions model.

## Method

- `index.html`: a focusable `<div id="grid" tabindex="0">` (not editable) and a
  `<textarea>`. `copy`, `cut` and `paste` are listened on the **document** and
  routed by focus (see the Firefox result). The copy handler calls
  `setData('text/plain', TSV)` and `setData('text/html', <table>)`, then
  `preventDefault()`; the paste handler reads both with `getData`.
- `run.mjs` drives each engine with Playwright: real key presses
  (`ControlOrMeta+C/X/V`, i.e. ⌘ on macOS), `document.execCommand('copy'|'paste')`
  inside a click, `navigator.clipboard.writeText/readText/write/read` with and
  without a click, in a context without permissions and in one where
  `grantPermissions(['clipboard-read','clipboard-write'])` was called (where
  Playwright supports it). It also saves `pbpaste` before and after, to see
  whether a headless browser touches the macOS clipboard (it restores it if so).
- `tsv.js`: encoder and decoder, pure. A property test (20 000 random matrices
  made from tabs, CR, LF, CRLF, quotes, Arabic, RLM, `=`…) and 14 decoding cases
  written by hand, run in node and in each engine.
- `html-table.js`: reads the first `<table>` of a `text/html` payload with
  `DOMParser`. Fixtures in `fixtures/`: **written by us from the documented
  shape** (CF_HTML header, Office HTML with `mso-number-format` classes, `x:num`,
  `<br style='mso-data-placement:same-cell'>`, `colspan`/`rowspan`, empty
  trailing cells, `&nbsp;`; a Google-Sheets-shaped one with `data-sheets-value`;
  a LibreOffice-shaped one with `sdval`/`sdnum` and `<td><br></td>`). Expected
  matrices written by hand in `fixtures/expected.json`. No spreadsheet application
  was run: Excel is not installed, and Numbers refused automation (see S8).

Run: `node spikes/s7-clipboard/run.mjs` (or `… run.mjs firefox`).
Engines: Chrome 155, Firefox 157, WebKit 27.2 (Playwright builds), headless, macOS.

## Results

### Copy, cut, paste events from the keyboard — no permission needed anywhere

| | Chrome | Firefox | WebKit |
|---|---|---|---|
| ⌘C / ⌘X on the focused non-editable div fires `copy` / `cut` | yes, target = the div | yes, but **target = `<body>`** | yes, target = the div |
| `clipboardData.setData` text/plain + text/html, then `preventDefault()` | works | works | works |
| ⌘V on the focused div fires `paste` with both types | yes (target the div) | yes (**target `<body>`**) | yes (target the div) |
| `getData('text/html')` returns what our copy wrote | unchanged | unchanged | unchanged |
| order of `types` | plain, html | html, plain | plain, html |
| `new ClipboardEvent('paste', { clipboardData: new DataTransfer() })` (synthetic, for tests) | data readable | **data ignored** (`types` empty) | data readable |

- In Firefox the event never reaches a listener on the grid element: the grid
  must listen on `document` and act only when `document.activeElement` is inside
  it. Do not route by `event.target` either: in Chrome, `execCommand('copy')` fired
  `copy` at the **textarea that still had a selection**, while focus was on the grid.
- The headless browsers each use their own clipboard: **the macOS clipboard was
  not touched** by any engine (`pbpaste` unchanged).

### `document.execCommand` in a click

| | Chrome | Firefox | WebKit |
|---|---|---|---|
| `execCommand('copy')` | returns `true`, fires `copy` | `true`, fires `copy` | returns **`false`** but fires `copy`, and the data is set |
| `execCommand('paste')` | `false`, no event | `true`, fires `paste` with data [À VÉRIFIER: probably a Playwright preference; not in real Firefox] | `false`, no event |

### Async Clipboard API (`navigator.clipboard`), secure context (127.0.0.1)

| | Chrome | Firefox | WebKit |
|---|---|---|---|
| `writeText` without a click | works | works | works |
| `write([ClipboardItem{text/plain, text/html}])` in a click | works | works | works |
| `readText` / `read` without permission | `NotAllowedError: Read permission denied` (with or without a click) | **works** [À VÉRIFIER: Playwright's Firefox; real Firefox 125+ shows a "Paste" menu first] | `NotAllowedError` (with or without a click) |
| `grantPermissions(['clipboard-read','clipboard-write'])` | accepted; `readText` and `read` then work, without a click | `Unknown permission: clipboard-read` | `Unknown permission: clipboard-write` |
| html written by `write()` as read back by a paste | wrapped: `<html><head></head><body><table><tbody>…` | same wrapping | **inline styles added** to `<table>` (`color: rgb(0,0,0); font-size: medium; …`) |

`ClipboardItem.supports('text/html')` is true in all three. In real browsers,
`readText` asks the user: Chrome shows a permission prompt, Safari a "Paste"
button, Firefox a "Paste" menu. **[À VÉRIFIER]** in headed, real browsers; a
headless run cannot show it.

### TSV codec (`tsv.js`)

- Round-trip `decode(encode(m)) === m`: **0 failures out of 20 000** random matrices, in node,
  Chrome, Firefox and WebKit. All 14 hand-written decoding cases pass everywhere.
- Encoding rules: cells joined by TAB; **every row ends with CRLF, the last one
  too** (what spreadsheets write, and the only way a last row of empty cells
  survives); a cell is quoted when it contains TAB, CR, LF or `"`, with
  inner `"` doubled. Nothing else is quoted, so plain values paste cleanly into
  a text field.
- Decoding rules, lenient: CRLF, LF and lone CR all end a row; exactly one final
  line break is dropped; a field is quoted only if it **starts** with `"` **and** a
  closing quote is followed by TAB, a line break or the end — otherwise it is
  literal (`5" inch` and `"5" inch` both stay as typed, and so does an unterminated `"abc`);
  empty trailing cells are kept; ragged rows are returned as they are (`pad`
  option evens them).
- Copying Arabic text with RLM, `=1+1`, leading spaces: untouched. Escaping for
  formulas is an export concern (§3.16), not a clipboard one: pasting into a
  spreadsheet does evaluate `=…` text, and Excel does the same for its own
  copies. [À VÉRIFIER] whether we want the CSV sanitisation on copy as well.

### HTML parsing (`html-table.js`), the same in the three engines

All three fixtures parse to the expected matrices in Chrome, Firefox and WebKit:
`colspan`/`rowspan` (value in the top-left cell, covered cells `''`, merge
listed), `<br>` → `\n` (`Ligne 1\nLigne 2`), source whitespace and tabs collapsed
(a TAB inside a `<td>` becomes a space — **HTML loses tabs**, `text/plain`
keeps them), `&nbsp;`-only and `<br>`-only cells read as empty, number formats
taken from `<style>` classes (`.xl65 {mso-number-format:"\#\,\#\#0\.00"}` →
`#,##0.00`) or inline styles (inline wins), and `x:num`, `sdval`,
`data-sheets-value` kept as hints. The CF_HTML header (`Version:0.9
StartHTML:…`) and `<!--StartFragment-->` comments are harmless to `DOMParser`.

Even our own copy shows the limits of HTML: `a<TAB>b` in a cell comes back as
`a b` from `text/html`, and exactly from `text/plain`.

## Decision

1. **Paste reads `text/plain` first** and decodes it as TSV with the rules above.
   `text/html` is read only when `text/plain` is empty or missing, and then only
   its first `<table>`. Reasons: the text is the same in every engine and every
   spreadsheet (TSV of the displayed values), needs no `DOMParser` and no
   whitespace guessing, and keeps tabs and line breaks exactly; the HTML is
   different per application (Office classes, Sheets JSON attributes, WebKit's
   added styles) and loses tabs. The raw-value hints in HTML (`x:num`, `sdval`,
   `data-sheets-value`) are a possible later improvement for locale-formatted
   numbers ("1 234,50"), not a v1 need: the locale-aware reader of §3.4 handles them.
2. **Copy and cut** write both types from the `copy`/`cut` event:
   `text/plain` = TSV of the raw export values (`toExport`), `text/html` = a
   simple escaped `<table>` (`<br>` for line breaks, `colspan`/`rowspan` for merges),
   then `preventDefault()`. A cut is a copy followed by clearing the cells
   through the edit layer, as one undo step.
3. **Listeners on `document`**, routed by `grid.contains(document.activeElement)`,
   never by `event.target` (Firefox targets `<body>`, Chrome may target a
   selection elsewhere). Do nothing when the focus is in a cell editor: the
   browser's own text copy applies there.
4. **Permissions**: keyboard ⌘/Ctrl+C, X, V need **none**, in all three engines,
   and are the main path. A context-menu "Copy" uses
   `navigator.clipboard.write([ClipboardItem])` (or `writeText`), which needs no
   permission. A context-menu "Paste" uses `navigator.clipboard.readText()` in
   the click and, when it is refused (`NotAllowedError`, or no API), shows a
   message such as "use Ctrl+V" — never a silent failure. No `execCommand`
   (deprecated; Safari returns `false` even when it worked).
5. For tests: synthetic `ClipboardEvent`s with a `DataTransfer` work in Chrome
   and WebKit only; the DOM tests of the paste handler should call the handler
   with a fake `{ clipboardData: { getData } }` instead, and the real path is
   covered by Playwright key presses as here.

## Changes to ARCHITECTURE.md

- §3.8 *Presse-papiers*: replace "Collage : lecture de `text/plain` (et
  `text/html` d'Excel en repli [À VÉRIFIER, spike S7])" by "Collage : `text/plain`
  d'abord (TSV, règles de S7) ; `text/html` (premier `<table>`) seulement si le
  texte est vide. Écouteurs sur `document`, routés par `document.activeElement` :
  Firefox envoie `copy`/`paste` à `<body>` quand l'élément focalisé n'est pas
  éditable. Clavier : aucune permission ; menu « Coller » : `readText` dans le
  clic, message de repli si refusé." State the TSV rules: CRLF after every row,
  quotes when TAB/CR/LF/`"`.
- §7.1 risk "Presse-papiers entre navigateurs": the event path is confirmed in
  the three engines; the remaining risk is the menu "Paste" (permission UI).

## Open points

- [À VÉRIFIER] Real clipboard contents from Excel (Windows and macOS), Google
  Sheets, LibreOffice and Numbers: our fixtures follow the documented shape,
  not a capture. Capture one per application (a `paste` listener that dumps
  `getData('text/html')` and `getData('text/plain')`) and add them to `fixtures/`.
  Points to check: whether Excel for macOS sends LF or CRLF, and whether a
  single copied cell ends with a line break (our decoder accepts both).
- [À VÉRIFIER] Headed, real Safari 17.5 and Firefox 120: the permission UI for
  `readText`, and whether ⌘C on a focused non-editable element with no
  selection fires `copy` in Safari as it does in Playwright's WebKit.
- Large paste, 10 000 × 30 cells (2.7 MB of TSV, quoted cells included): decoding
  takes 9 ms in Chrome, 16 ms in Firefox, 18 ms in WebKit, 13–43 ms in node (median of 3, cold
  in node); encoding takes 20 ms in node. The codec is not the bottleneck; planning and applying
  300 000 cell edits is (Phase 4).
- Hidden or filtered rows in a spreadsheet selection: Excel copies only the
  visible rows of a filtered range; nothing to do on our side, noted for the
  behaviour sheet.
