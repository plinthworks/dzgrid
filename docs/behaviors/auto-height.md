# Automatic row height (wrapped text)

Written before the code (CLEANROOM). Sources: the public documentation of data grids about wrapping cell
text and rows that grow to fit it, WCAG 2.2 (1.4.4 resize text, 1.4.10 reflow, 1.4.12 text spacing, 2.4.11),
our spike S3 (anchor « estimate and correct »: 0 px jump up to 10 000 rows in three engines, Firefox ≤ 1.5 px
at 100 000). Plan D9; owner decision Q-R1 (A: per column `wrap: true`; a fixed `rowHeight` wins; works with
details; a developer warning beyond 10 000 rows). Entry: `@dzgrid/dom/auto-height` (`autoHeight()`), plus a
base seam (`layoutFor` composed with details).

## What the user does
Reads a column of long texts (a diagnosis, a note, an address) that wrap on several lines; scrolls; resizes
the column; zooms the text.

## What they observe
- A row is as tall as its tallest wrapped cell; short rows stay at the normal height.
- Scrolling never jumps: the row at the top of the view stays there while heights are measured.
- Narrowing the column makes rows taller; widening makes them shorter, again without jumping.

## Behaviours (numbered, each one a test)
1. `ColumnDef.wrap: true` lets the cell's text wrap (`white-space: normal`, `overflow-wrap: anywhere`) and the
   row grow. Without `autoHeight()` on the grid: the text wraps inside the fixed height and is clipped,
   warning `missing-feature` once.
2. **`rowHeight` a number wins**: rows keep that height, `wrap` text is clipped (no warning; choice 1).
3. The row's height = the tallest measured cell of its row (wrapped cells; others keep one line), never less
   than the density's or `rowHeight`'s floor (24 px minimum, WCAG 2.5.8). No upper cap (choice 2).
4. **Measured in one read phase** after the paint (one `requestAnimationFrame` read of the mounted rows'
   heights, never a layout read during writes); unmeasured rows use the density's height as estimate.
5. The **anchor** (S3): the first visible measured row keeps its offset from the top through every measure.
   Measured jump: 0 px up to 10 000 rows (three engines), Firefox ≤ 1.5 px at 100 000.
6. More than 10 000 displayed rows with a `wrap` column: one developer warning `auto-height-large` (path
   `columns.<id>.wrap`); still works.
7. Re-measured when: a row's data changes (host `update`, an edit saved or shown), a column's width changes
   (resize, flex, auto-size), columns are shown, hidden or moved, the language or direction changes, the
   reader's text size changes, the density changes. Heights of rows not mounted are forgotten, never guessed
   from an old width.
8. **Details**: a detail panel keeps its own height; the data row above it is measured as any row (the
   `layoutFor` chain composes both).
9. **Tree**: a pinned parent copies its row's height, never more than half the view.
10. **Pinned rows** (`pinned-rows.md`) are measured too; the bands' cap stays.
11. Spans: a tall merged cell is not measured (its rows are); a full-width row is measured.
12. Keys: PageDown / PageUp move by the view's height in pixels over measured rows; a row taller than the
    view: the focus scrolls to its top, PageDown moves past it (never stuck).
13. Header labels do not wrap in this phase (choice 3).

## Keyboard
Unchanged (12).

## Announcements
None.

## Texts
None (problems are codes).

## WCAG notes
- 1.4.12: wrapped cells grow with the user's text spacing instead of clipping it; 1.4.4: re-measured on text
  size; 1.4.10: long text wraps rather than requiring sideways scroll within a cell.
- 2.4.11: the focused row kept in view across a measure (anchor).

## Choices to confirm (not settled by the decisions)
1. A fixed `rowHeight` with `wrap` clips silently (no warning).
2. No maximum row height (a very long note makes a very tall row).
3. Header labels never wrap (`wrapHeader` not in this phase).

## Tests (to be written with the code)
`packages/dom/test/auto-height.test.ts` (no layout read during writes, anchor kept across a measure in jsdom
geometry, re-measure triggers, warning above 10 000, `rowHeight` wins), conformance `layout-rows/auto-*`;
browser: 0 px jump at 10 000 rows in Chrome, Firefox, WebKit (S3's harness), ≤ 1.5 px at 100 000 in
Firefox; the HR demo with wrapped titles, fr and ar.
