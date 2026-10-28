# Printing the grid

Written before the code (CLEANROOM). Sources: the public documentation of data grids about print layout
(every row drawn without scrolling, headers repeated), CSS Paged Media and CSS Fragmentation (`break-inside`,
`thead` repeated per page), HTML tables (`caption`, `th scope`), WCAG 2.2 (1.3.1, 1.3.2 meaningful
sequence). Plan D14; owner decision Q-I (A: the shown rows, filtered and sorted, at most 5 000, a real table,
headers repeated, Arabic right to left; « 5 000 premières lignes » beyond; a server-paged grid prints its
shown page). Entry: `@dzgrid/dom/print` (`preparePrint`, `print`), style `@dzgrid/theme/print.css`.

## What the user does
Presses the application's « Imprimer » button (or the browser's print command after the application
prepared the grid).

## What they observe
- The print preview shows the whole list as it is on screen — same columns, order, sort and filters — not
  only the rows that were visible.
- The column headers repeat at the top of each page; no row is cut across two pages.
- In Arabic the table reads from right to left.
- Above 5 000 rows, a line says only the first 5 000 are printed.

## Behaviours (numbered, each one a test)
1. `preparePrint(grid, { maxRows = 5000, title? }) → Promise<() => void>` builds a print-only `<table>` and
   resolves with a cleanup; `print(grid, opts)` prepares, calls `window.print()`, cleans up on `afterprint` (the
   plan's `matchMedia('print')` fallback was left out to hold the 1 600 B line, as plan §5 orders: every engine of the
   support matrix sends `afterprint`).
2. Rows: the displayed rows in order (filtered, sorted, searched), the tree's shown rows (expanded only, the
   level shown as an indentation of the tree column's text); **top pinned rows at the start of `tbody`**
   (printed once, never repeated per page: only `thead` repeats) and bottom pinned rows at its end
   (`pinned-rows.md`); detail panels and loading or filler rows are not printed (O9). A server-paged
   grid: the shown page only, with `print.page` in the caption.
3. Columns: the shown columns in reading order (start-pinned, centre, end-pinned), hidden and group-closed
   ones left out; header groups as header rows of `th scope="colgroup"` with `colspan` (and a `<colgroup>`
   per group so the scope has its columns); merged cells written on every row they cover (as the CSV, O9); full-width rows as one `colspan` cell.
4. Cells: the formatted text (the column's formatter, the grid's locale); custom parts print their `text`
   (the `ui` part's text), else empty. Edits shown on screen (saved or pending) print as shown.
5. A real `<table>`: `caption` = `title`, else the grid's own accessible name (its `aria-label` or the
   text of its `aria-labelledby`), else no caption; `thead` with `th scope="col"`, `tbody`; `dir` and
   `lang` of the grid; `print.css`: `thead { display: table-header-group }`, `tr { break-inside: avoid }`,
   borders in black, no background colours needed; the grid's own screen is hidden while printing.
6. More than `maxRows`: the first `maxRows` are printed, a line `print.truncated` above the table, and a
   problem `print-too-many` (count only).
7. Built in chunks (no long task over 200 ms; 5 000 × 20 within 1.5 s), so the page stays responsive; a second
   call while one is being built cancels the first; the cleanup removes everything (idempotent).
8. Never mounts the virtual body: the screen grid is untouched (no scroll, no focus change, no event).
9. The print container is `display: none` on screen and not in the accessibility tree there (an inline `display: none`
   and `aria-hidden`; `print.css` shows it in print only while `.dzg-printing` is on `<html>`, with `!important` outside the
   layer, and hides the rest of the page; `print.unlayered.css` for a page whose reset is unlayered, such as Tailwind's
   preflight).

## Keyboard
None of its own (the application's button and the browser's Ctrl+P).

## Announcements
None from the grid (the browser's print dialog speaks for itself).

## Texts (`locales/{en,fr,ar}-print`)
| Key | en | fr | ar |
|---|---|---|---|
| `print.truncated` | First {n} rows of {total} | {n} premières lignes sur {total} | أول {n} صف من {total} |
| `print.page` | Page {page} of {pages} | Page {page} sur {pages} | الصفحة {page} من {pages} |

## Right to left
The table carries `dir="rtl"`: the first column on the right; the caption and the truncation line aligned to
the start. Numbers and dates isolated as on screen.

## WCAG notes
- 1.3.1: a real table with header cells, `scope="col"` and `scope="colgroup"` for groups; 1.3.2: the reading order is the logical order.
- The printed list never depends on colour (borders only).

## Decided (`docs/phase-6-steps/decisions.md` « Step 1 follow-ups »)
- O9 (lead): detail panels are not printed; merged cells are written on every row (not as `rowspan`).

## Choices to confirm (not settled by the decisions)
1. The Ctrl+P of the browser, without `preparePrint`, prints only what is on screen (as today); no
   `beforeprint` hook building the table by itself. Kept at step 11.

## Tests
`packages/dom/test/print.test.ts` (32: the table, caption, groups, `dir` / `lang`; rows in order after sort, filter and
search, a tree's shown rows, pinned rows, no detail or filler, merged and full-width cells; columns in reading order;
the screen's text, parts, edits, HTML-looking text; the cap and its one problem; chunks, cancel, cleanup, `afterprint`;
a server page; the screen untouched; the texts), `print-size.test.ts`, `packages/theme/test/print.test.ts` (the sheet and
its twin under a simulated preflight). Browser: `npm run test:browser -- --only print` (Chrome `page.pdf()` fr and ar,
under Tailwind's preflight and with the layered sheet, 1 200 and 5 001 rows: the header rows on every page, every row once
and none cut, the pinned column first, the caption, the truncation line; `print()` and `afterprint`; orders.html's button).
Playground: `print.html` (`?lang=ar`, `?rows=5001`, `?preflight=1`) and « Imprimer » on `orders.html`.
