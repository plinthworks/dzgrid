# Exporting to PDF (.pdf)

Written before the code (1.17.0, owner 2026-11-21 « on passe au filtre avancé et l'export, tu peux continuer en
autonome »; plan and decisions `docs/phase-14-steps/pdf-export-plan.md`). Gap analysis `docs/gap-aggrid-2026-11.md`
row « Export PDF ». Sources: ISO 32000-1 (PDF 1.7: file structure, the 14 standard fonts, WinAnsiEncoding, Type 0 /
CIDFontType2 fonts, ToUnicode), Apple's and Microsoft's public TrueType specification (the `head`, `hhea`, `hmtx`,
`maxp`, `cmap`, `loca`, `glyf` tables), Adobe's published metrics of Helvetica. No PDF or font library is read or used;
nothing of another grid's export code (CLEANROOM.md). Data grids that offer a PDF document behave like a report: a
table across pages, its header on each page, a title, page numbers.

## What the user does
Presses the application's « PDF » button, or right-clicks a cell → « Exporter en PDF ».

## What they observe
- A `.pdf` file downloads; Chrome's, Firefox's and Safari's viewers open it; text can be selected and searched.
- The rows the export writes (the same as the Excel file's), across as many pages as needed; the header row on top
  of every page; « 1 / 3 » at the bottom of each page.
- Numbers on the end side of their column, text on the start side, as on screen; group rows and totals in bold.
- A table wider than the page is shrunk to the page's width (never cut into side pages).

## What DzGrid does

One export feature, a fourth format: the same `canExport`, busy state, cancel, progress, events, cap and sentences as
CSV and Excel (csv-export.md, xlsx-export.md). `csvExport({ …, pdf: true | { … } })`; `run(scope, { format: 'pdf' })`;
`bind(button, { format: 'pdf' })`; the cell menu's `use: { pdf: { run: (s) => exporter.run(s, { format: 'pdf' }) } }`
(its label `cmenu.exportPdf` from `locales/<lang>-pdf`). `@dzgrid/core/pdf` writes the file (pure: no DOM, no clock;
the same input gives the same bytes; runs on a Node server: `toPdf`).

### What is written (the « same values everywhere » rule)
1. **Rows**: the rows the export writes for its scope (`displayed`, `all`, `selected`), as the Excel file: group rows,
   footers and the grand total of a grouped grid (`groupRows: false`: the data rows only), the totals row last; a
   tree's rows indented in its column; never a detail panel, a loading row or a filler. Pinned rows are not written
   (as CSV and Excel). Master / detail: the masters only (the detail blocks are Excel's).
2. **Columns**: the export's columns (`columns`, else the visible ones, start-pinned, centre, end-pinned), as Excel.
3. **Text**: each cell as the screen shows it (the column's format, the edit overlay, a `showAs` share), as print
   writes it; group and totals rows with the grid's own labels and totals. Blank: an empty cell.
4. **Header**: the columns' labels (bold), with a row per column-group level above (a group's label across its
   columns), on every page; `header: false` writes none; `groups: false` one row.

### Page
5. **Size** `page: 'a4'` (default) or `'letter'`; **orientation** `'auto'` (default: landscape when the columns at
   their screen widths do not fit the portrait page), `'portrait'`, `'landscape'`; **margins** `margin` in points
   (default 36, half an inch).
6. **Widths**: the grid's widths (CSS pixels, 96 to the inch, so × 0.75 in points). Wider than the page: every width
   and the text shrink by the same factor to fit (★ scale to fit, never split); the text never under half its size
   (`fontSize`, default 8 pt) — narrower columns then wrap or clip more.
7. **Long text**: wrapped on word boundaries (a word longer than its column broken), at most `wrap` lines (default 3);
   the rest cut with « … » and one warning `pdf-text-cut` per column (the count). `wrap: 1`: one line each, clipped.
   A number is never wrapped: one line, clipped with « … » if it does not fit.
8. **Breaks**: a row is never split across pages; the header rows repeat at the top of each page.
9. **Title, subtitle, footer**: `title` (bold, 14 pt), `subtitle` (grey) above the table on the first page, `footer`
   under the table on the last page — each a text, texts one line each, or (in the DOM export) a function of the export
   as Excel's (`{ rows, scope, query, now, ctx }`). The document's title (its properties) is the first title line.
10. **Page numbers**: « 1 / 3 » centred at the bottom of each page (digits and a slash: no language needed);
    `pageNumbers: false` none; a function `(page, pages) => string` the application's words.
11. **Look**: fixed print colours, never the page's CSS variables (a dark theme prints light): black text, the header
    on a light grey band with a darker line under it, thin grey lines between rows, group rows on a paler band, totals
    bold with a line above. Right-to-left grid (`rtl`, default the grid's direction): the first column on the right,
    start-aligned text on the right.

### Fonts and scripts (the safest scope, said plainly)
12. **Default**: Helvetica, one of the 14 fonts every PDF viewer has, nothing embedded, small files. It covers the
    WinAnsi set (English, French, Spanish, German, the Nordic languages, Italian, Portuguese… and € ‘ ’ “ ” – — …).
    French number spaces (U+202F, U+00A0) are written as spaces and U+2212 as a hyphen. Any other character is
    written « ? » and one warning `pdf-glyph` per column (or `pdf.title`…) gives the count: never a crash, never a
    missing row.
13. **`font: ArrayBuffer`** (and `boldFont`): the application's own TrueType font (`.ttf`, glyf outlines; not
    `.otf` CFF, not `.ttc`), embedded as a Unicode font with only the glyphs used kept (the others emptied, so a large
    font stays small), and a ToUnicode map so the text copies and searches. Greek, Cyrillic, Chinese, Japanese,
    Korean, Vietnamese then print. A character the font lacks: « ? » (`pdf-glyph`). A file that is not such a font:
    `pdf-font` (error), and Helvetica instead.
14. **Right-to-left and shaped scripts are refused** (Arabic, Hebrew, Syriac, Thaana, N'Ko, and the Indic and
    South-East Asian scripts that join or reorder letters): writing them needs shaping and the bidirectional
    algorithm, which this writer does not do; it never writes such text wrong. Any such character in a cell, a
    header or a title: nothing is written, one error `pdf-script` (path where it was first met, the count), the export
    fails (« Échec de l'export »). For Arabic, use `print()` (the browser's « Enregistrer en PDF », which shapes).

### Limits and speed
15. Built in slices, the cancel checked between them, progress `building` (rows laid out); compressed by the browser
    (`CompressionStream('deflate')`, the PDF's FlateDecode), stored where it is missing. The cell cap `maxCells` is
    the export's (10 000 000 by default).
16. **Problems** hold a code, a path and a count: never a value, a row key or a row number. `run(…, { format: 'pdf' })`
    without the `pdf` option fails with `missing-feature` at `export.pdf`. `ExportRequest.format` and the events'
    `format` are `'pdf'`.
17. **Not in the file**: dates (no creation date: the same rows give the same bytes), images, links, forms, colours
    of the application's cells (`xlsxStyle` is Excel's), the screen's theme.

## Tests
- Core `packages/core/test/pdf.test.ts`, by hand, with a small test-only reader: the header, every object at its xref
  offset, `startxref`, page count, text runs on each page, the header on every page, « 2 / 2 », end alignment, wrap and
  cut, WinAnsi replacement and `pdf-glyph`, Arabic refused (`pdf-script`), a tiny hand-built TrueType font embedded
  (subset, widths, ToUnicode), bad font → `pdf-font`, same bytes twice. Ghostscript (`gs -dNODISPLAY`) when present.
- DOM `packages/dom/test/export-pdf.test.ts`: the format in the request and events, the file, the option missing,
  cancel, the cell menu item.
- Real browsers `scripts/browser-1-17.mjs --only pdf`: the file downloads in Chrome, Firefox and WebKit, and opens in
  Chrome's PDF viewer (a page looked at).
