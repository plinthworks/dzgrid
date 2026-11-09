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
1. `preparePrint(grid, { maxRows = 5000, title? }) → Promise<(() => void) | null>` builds a print-only `<table>` and
   resolves with a cleanup, or with null when cancelled (a newer call, a cleanup, the grid gone); `print(grid, opts)`
   prepares, calls `window.print()` only for the newest build (a cancelled or overtaken one opens no dialog), cleans up
   on `afterprint`, or on the first `focus` or `pointerdown` after the dialog when no `afterprint` comes (Safari's PDF
   path; the plan's `matchMedia('print')` fallback was left out to hold the 1 600 B line, as plan §5 orders). Each
   cleanup removes its own table only. `maxRows` not a positive integer (0, −1): the default 5 000.
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

- **Gaps** (1.1.0, `row-gaps.md`): not printed in 1.1.0; print shows a tree's levels by its indent. Merged cells in a
  tree: written on every row, as on a flat grid.

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
   `beforeprint` hook building the table by itself. Kept at step 11. **Phase 11 L5**: an opt-in hook added
   (`printOnMenu`, behaviour 10 below); without it, still the screen, now printed light (13).

## On paper (Phase 11 L5, plan « L5 »; written before the code)
What the user gets on paper, in Chrome, Firefox and Safari, also from the browser's own menu.

10. **The browser's own print** (Ctrl+P, the File menu — no `print()` called). The plan offered two answers: a
    `beforeprint` hook building the table, or a print-only line « use the Print button ». The hook is the smaller
    (one listener; the line needs a translated text written by the DOM base, which a grid
    that never prints would carry) and the user gets the whole list, so the hook, in its own entry
    `@dzgrid/dom/print-menu` (a grid printed only by its button ships none of it). `printOnMenu(grid, options?)`: from
    then on, `beforeprint` builds the same table as `preparePrint(grid, options)` **at once** (the browser lays the
    pages out right after `beforeprint` returns: a table built in slices would be cut at its first slice; 5 000 rows at
    4× CPU is one task of a few hundred ms, the dialog opens that much later), and it is removed as `print()` removes its
    own (`afterprint`, else the first `focus` or `pointerdown`). A table already in the page (`print()`'s, or one the
    application prepared) is left as it is: it prints. It lasts as long as the grid (its destruction ends it; no stop
    handle of its own, to hold the size line). Opt-in: an application that never asks keeps today's behaviour.
11. **Page breaks.** No row cut across two pages (`tr { break-inside: avoid }`); the header rows — the groups, the
    pivot's bands, the column headers — at the top of every page (`thead` as a header group). Where the engine allows:
    a group's first row stays with its group row (`break-before: avoid` on a data row right after a group row), so a
    group row never ends a page above its rows, and a totals row never starts a page (`break-before: avoid`): it stays
    with the row before it, the grand total alike. Not tied: a group row followed by another group row (an outer level,
    a pivot's rows, a closed group) — tying every group row to the next made a pivot one unbreakable run (Chrome then
    left page 1 empty). Group and totals rows keep `dzg-print-group`; a totals row also has `dzg-print-footer`.
12. **Width.** The table takes the page's width (`inline-size: 100%`) and the browser shares it between the columns by
    their content; a text wraps at its spaces and hyphens, **a word is never cut**. Tried and left out (L5):
    `overflow-wrap: anywhere` fits any table, but it lowers every column's narrowest width to one letter, so the browser
    narrows all of them together and cuts short words and ids (« Dossie|r », « C00|02 ») on an ordinary 12-column list
    in portrait. Limit, kept: a list whose words alone are wider than the page (many columns of long unbroken text) runs
    past the page's edge; the application prints it in landscape (`@page { size: landscape }`) or with fewer columns.
    Long lists: one table, as many pages as needed (5 000 rows at most, 6).
13. **Colours.** The print container is black on white whatever the page's theme (a dark page's light text would be
    invisible on paper; the truncation line and the caption included). The screen grid printed without a prepared
    table (an application without the hook) is printed in the light scheme (`color-scheme: light` in print): never
    light text on white paper.
14. **Right to left.** Unchanged (the table's `dir`): pages run top to bottom as in every language, the first column on
    the right of each.

Engines (`npm run test:browser -- --only paper --all`, `scripts/browser-print.mjs` « paper »): Chrome's `page.pdf()`
(which sends `beforeprint` and `afterprint`, so 10 is checked without `print()`), Firefox's own « Save to PDF » printer
reached by `window.print()` (silent, to a file), both read back as text (`scripts/pdf-text.py`, with each line's
colour); WebKit has no print to a file in Playwright: its print media emulated (no pages), the computed rules
checked and a screenshot kept — 11's repetition and breaks are not verified there.

## Tests
`packages/dom/test/print.test.ts` (32: the table, caption, groups, `dir` / `lang`; rows in order after sort, filter and
search, a tree's shown rows, pinned rows, no detail or filler, merged and full-width cells; columns in reading order;
the screen's text, parts, edits, HTML-looking text; the cap and its one problem; chunks, cancel, cleanup, `afterprint`;
a server page; the screen untouched; the texts), `print-size.test.ts`, `packages/theme/test/print.test.ts` (the sheet and
its twin under a simulated preflight). Browser: `npm run test:browser -- --only print` (Chrome `page.pdf()` fr and ar,
under Tailwind's preflight and with the layered sheet, 1 200 and 5 001 rows: the header rows on every page, every row once
and none cut, the pinned column first, the caption, the truncation line; `print()` and `afterprint`; orders.html's button).
Playground: `print.html` (`?lang=ar`, `?rows=5001`, `?preflight=1`) and « Imprimer » on `orders.html`.

## Grouped rows (Phase 7, owner Q-EX A; built at step 7)
Print shows the group rows as shown on screen (label indented, count, totals), their footers and the grand total; a
closed group prints as its row only.

Numbered (step 7, 2026-11-05; `packages/dom/test/print-grouping.test.ts`, Chrome `page.pdf()` fr and ar):
1. The printed rows are the screen's rows, in order: group rows, the rows of open groups, footers, the grand total
   (first or last, as shown). A closed group prints as its row only.
2. **The group column** prints the label as the screen writes it (« Alger (3) », « Total Alger », « Total »), indented
   one em per level; data rows one step deeper, as on screen. The group column is the grouping's (its `column`, else
   the first shown), not always the first.
3. **Totals** print as the screen shows them (the column's format; a count as a number of the language); the group
   column holds the label.
4. Group and totals rows are set in bold (`dzg-print-group`), so they read apart without colour.
5. `maxRows` counts printed lines, group and totals lines included.

## A list loaded in blocks (Phase 8, `infinite-scroll.md`, plan D15–D16; owner Q-EX A)
Print prints the rows held, in order, 5 000 at most (`print-too-many` above, as today); loading and failed rows are never
printed. The walk reads `DisplayedRows.held`, never ten million positions (step 4; tested on 10⁷ rows).

## Pivot (Phase 10, `pivot.md` 27; plan D18 A; checked 2026-11-07, no code)
The created bands print as `th scope="colgroup"` rows when bands are on (`spans()`); `all` = every group open.
