# S8 — Hand-written XLSX

## Question

Can DzGrid write a valid `.xlsx` itself (K.11): a ZIP with `CompressionStream('deflate-raw')`
and CRC-32, the SpreadsheetML parts, typed cells, a number format for dates, a
header style, a right-to-left sheet, Arabic strings — 10 000 rows × 10 columns,
in node and in the browsers? How large, how fast, and is it fragile?

Decision rule: if it is fragile, store without compression.

## Method

Written from the standards only: PKWARE APPNOTE (ZIP), RFC 1951 (the deflate
stream comes from the platform), ECMA-376 Part 1 §18 (SpreadsheetML) and Part 2
(packaging). No spreadsheet or zip library was read or used.

- `zip.js`: local headers, central directory, end record; method 0 (stored) or
  8 (deflate, through `CompressionStream('deflate-raw')`, kept only if smaller);
  UTF-8 names (bit 11); a fixed 1980-01-01 timestamp, so no clock is read and
  the same input gives the same bytes; CRC-32 with slicing-by-8; no ZIP64 (it
  throws past 4 GB).
- `xlsx.js`: `[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml` (+ rels),
  `xl/styles.xml`, `xl/worksheets/sheet1.xml`, `xl/sharedStrings.xml` (or inline
  strings). Cell types: text (`t="s"` or `t="inlineStr"`), number, money
  (`#,##0.00`), day (serial + `yyyy-mm-dd`), instant (serial of the **wall time
  in the export zone** + `yyyy-mm-dd hh:mm:ss`), boolean (`t="b"`). Header row in
  bold on a fill with a bottom border, frozen; an `autoFilter` over the range;
  column widths; `<sheetView rightToLeft="1">` as an option. Text is never written
  as a formula, so `=1+1` stays text. Characters XML cannot carry are written
  `_xHHHH_`, and a literal `_xHHHH_` is protected as `_x005F_xHHHH_` (§22.9.2.19);
  lone surrogates become U+FFFD; text over 32 767 characters is cut and reported.
- `data.js`: 10 000 seeded rows — Arabic names, French names with diacritics,
  wilayas, amounts, birth days 1930–2024, instants 2020–2026 shown in
  Africa/Algiers, booleans, codes with leading zeros (`00123`, text), and remarks that test
  escaping (`<b>&"'</b>`, `=1+1`, a line break, a tab, a control character, an emoji
  with skin tone, a lone surrogate, RLM/LRM, leading spaces).
- `run.mjs`: builds four variants in node (shared strings + deflate, shared +
  stored, inline + deflate, left-to-right) and a 12-row `sample-rtl.xlsx`;
  checks each with `unzip -t`, every part with `xmllint --noout`, and reads every
  cell back (`readback.mjs`: central directory + `zlib.inflateRawSync`, our own
  checking code). It then builds the same file in Chrome, Firefox and WebKit,
  compares it with node's, and opens the sample with what macOS has.

Run: `node spikes/s8-xlsx/run.mjs`. It launches no GUI application (Numbers,
Excel, LibreOffice with a window would appear on the owner's screen); only
windowless checks: `unzip -t`, `xmllint`, Quick Look's converter (`qlmanage -p -o`,
writes HTML to a folder), and `soffice --headless` if LibreOffice is installed.
Machine: Apple M4 Max; other agents ran browsers at the same time, so timings are noisy.

## Results

### Validity

- `unzip -t`: **no errors** for all node variants, the sample, and the files
  made in Chrome, Firefox and WebKit.
- `xmllint --noout`: all 7 parts well-formed.
- CRC-32 equals `zlib.crc32` (including the `123456789` → `cbf43926` check value);
  about 1.7 GB/s in node.
- Read-back: **0 wrong cells out of 100 010** (header + 10 000 × 10) in each of
  the three node variants: strings exactly (escapes undone), days as serials,
  instants as wall-time serials, booleans, numbers.
- Stored variant: **byte-identical** across node, Chrome, Firefox and WebKit.
  Deflated variant: different bytes (each engine has its own deflater), but
  **the same content once inflated**, in all three browsers.
- `CompressionStream('deflate-raw')` exists in node 22 and in all three engines
  (all K.7 targets have it: Chrome 103+, Safari 16.4+, Firefox 113+).

### Size and time, 10 000 × 10 (median of 3)

| variant | file | node | Chrome | Firefox | WebKit |
|---|---|---|---|---|---|
| shared strings + deflate | 607 kB (614–635 kB in Firefox/WebKit) | 102 ms | 72 ms | 72 ms | 62 ms |
| shared strings, stored | 3 516 kB | 58 ms | 38 ms | 40 ms | 28 ms |
| inline strings + deflate | 637 kB | 99 ms | 81 ms | 74 ms | 68 ms |

`sheet1.xml` is 3.3 MB with shared strings, 4.3 MB with inline ones. Deflate
divides the file by 5.8 and costs 30–45 ms more. The writer (zip + xlsx),
minified, is 9.9 kB, **3.9 kB gzip**.

### Opening it

- Installed: **Numbers** only (no Excel, no LibreOffice, so no `soffice`).
- Numbers is not opened: no GUI application is launched by this spike. (A first
  run tried AppleScript; macOS refused it with error −1743, so Numbers never
  started; that step has been removed.)
- **Quick Look** (`qlmanage -p`, Apple's own Office importer, no window) converts
  `sample-rtl.xlsx` to HTML: **every text, number, money, day and date-time cell
  shows as expected** — Arabic, line break (`<br>`, wrap style), `<b>&"'</b>`,
  `=1+1` as text, the literal `_x0041_`, the control character, the emoji, RLM/LRM;
  money `11 375,19` with `#,##0.00`; days `1944-08-09`; instants
  `2021-07-06 20:28:31` (Algiers wall time); header bold on its fill with its
  border. Two things it does not show: **booleans are blank** (probably drawn
  as checkboxes, as Numbers does), and the **right-to-left view is ignored**
  (Quick Look always draws left to right).

## Decision

**Not fragile: keep deflate** (`CompressionStream('deflate-raw')`), with stored as the fallback when
the API is missing or throws. The rule ("if fragile, store") is not triggered:
the deflated files pass `unzip -t`, inflate to identical content in every engine, and
are 5.8 times smaller. Shared strings by default (5 % smaller than inline and
faster to read for Excel); inline strings kept as an option for streaming.

Other choices confirmed by the spike:
- dates as serials with a number format, never text; days before 1900-03-01
  refused (the 1900 date system counts a 29 February 1900 that never was);
- an instant is written as the **wall time in the export zone** (the grid's
  display zone), and the zone goes in the header text, because a spreadsheet date
  has no zone;
- fixed ZIP timestamp: reproducible files, no clock.

## Changes to ARCHITECTURE.md

- K.11 / §3.16: "Writer XLSX maison validé (S8) : 10 000 × 10 en 60–100 ms,
  607 kB avec `deflate-raw` (3,5 MB sans), 3,9 kB gzip de code ; `unzip -t`,
  `xmllint` et relecture cellule par cellule sans erreur, contenu identique sous
  Chrome, Firefox, WebKit et node." Add the rules: instants as wall time in the
  display zone (zone named in the header); text cells never formulas; `_xHHHH_`
  escaping; days before 1900-03-01 → text plus a `Problem`; 32 767 characters
  maximum per cell.
- §3.16 should give the XLSX export the same chunked shape as `csvChunks`: for
  100 000 × 30 the XML is about 300 MB of strings, held at once by this spike.
  For the real writer: rows generated in 20 ms slices, each slice encoded and
  pushed into the `CompressionStream` as it comes, CRC-32 computed as the data
  passes, and local headers with bit 3 (data descriptor after the data) so sizes
  need not be known beforehand. Above about 4 GB (or 65 535 entries), ZIP64; out
  of v1 — the server path (`exportAll`) covers it.

## Open points

- **[À VÉRIFIER] Excel fidelity**: not opened in Excel (not installed). To check
  by hand with `results/sample-rtl.xlsx` and `results/node-sharedDeflate.xlsx`
  in Excel for Windows and macOS: opens without a "repair" prompt; sheet
  right-to-left with column A on the right; header frozen and filterable;
  `yyyy-mm-dd` and `yyyy-mm-dd hh:mm:ss` applied; `#,##0.00` shown with the
  user's own separators; booleans as TRUE/FALSE (VRAI/FAUX); `=1+1` stays text;
  `_x0041_` shown literally; the Arabic sheet name `تصدير` accepted.
- [À VÉRIFIER] Numbers and LibreOffice, by hand (the owner): open
  `results/sample-rtl.xlsx`; check booleans and right-to-left. If LibreOffice is
  installed later, `run.mjs` converts the sample with `soffice --headless`.
- No `docProps/core.xml` / `app.xml`: optional per OPC, and leaving them out
  avoids writing a creation date. [À VÉRIFIER] that Excel does not complain.
- Column widths are given in characters by the caller; automatic widths would
  need text measurement in the DOM layer.
