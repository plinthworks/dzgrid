# Column titles on several lines

Written before the code (CLEANROOM). Sources: AG Grid's public option names `wrapHeaderText` and `autoHeaderHeight`
(checklist only), a spreadsheet's « wrap text » on a header cell. Owner answer 2026-11-10 (review 5.7, 1.10.0). Entry:
`@dzgrid/dom/wrapped-headers` (`wrappedHeaders()`); its few layout rules are injected by the feature (no stylesheet to
load).

## What the user does
Reads a grid whose columns are narrow but whose titles are long (« Average delivery time in days »): instead of a title
cut with « … », the title goes on two or three lines and the header row is as tall as the longest one.

## Behaviours (numbered, each one a test)
1. `headerWrap: true` on a column, with the `wrappedHeaders()` feature: its title breaks between words (a word longer
   than the column breaks inside), on as many lines as it needs, at most `maxLines` (3 by default, 1 to 10); past them
   the last line ends with « … » and the whole title stays in the cell's name.
2. Without the feature: one warning `missing-feature` (path `columns[i].headerWrap`, detail `wrapped-headers`); the
   title stays on one line.
3. The column headers' row grows to the tallest wrapped title: measured on hidden copies of the header cells (the same
   room the sort mark and the buttons take), all written then all read, once per change of the titles, the columns'
   widths, the text size, the density, the direction or `headerHeight` — never at a scroll. A drag on a column's edge
   measures again at each frame of the drag (one read per frame).
4. With `headerHeight` (`density.md` « Header height »): the taller wins — the row is never shorter than `headerHeight`;
   short titles leave it as it is. With vertical titles (`vertical-headers.md`) in the same grid: the taller of the two
   needs wins too (each feature says its need; the row takes the largest).
5. Only the column headers' row grows: the group rows above and the filter row below keep their heights.
6. **Keyboard and screen readers unchanged**: the cell keeps its role, its name, its keys and its focus ring.
7. Right to left: lines start at the right, nothing else mirrored; Arabic titles break between words, as Latin ones.
8. Print and exports: the title as text (a printed table wraps by itself).
9. `maxLines` outside 1–10 or not a whole number: 3, told once (`invalid-setting`, path `wrappedHeaders.maxLines`).
10. Fitting the column to its content (the menu, a double-click, `fitOnLoad`, `column-resize.md` 11, 16) measures its
    cells and only the title's longest word (with the header's marks and buttons): the title goes on lines instead of
    widening the column.
11. (1.11.0, owner 2026-11-10 « C ») A title cut at the cap says `data-hclamp` on its header cell and its label is set
    (inline) at the start of the cell, whatever the column's alignment, so its « … » shows in Chrome, Firefox and WebKit,
    left to right and right to left. Known from the same copies the row's height is measured on (one read more of each
    copy, in the same pass: no layout added); a title that fits again loses it.

## Where DzGrid differs on purpose
- A cap in lines, not in pixels: it follows the text size and the density by itself.
- The row grows; the column never widens for its title, not even when fitted to its content (10).
- A title cut at the cap is set at the start of its cell, even in a number or centred column (11): Chrome (157, seen
  2026-11-10) draws a clamped line aligned at the end, or centred in right-to-left text, past the label's edge, so its
  « … » was cut off; Firefox and WebKit draw it. Its lines are nearly full anyway, so the move is slight.

## Tests
`packages/dom/test/wrapped-headers.test.ts` (attribute, height from measured copies, the cap, the cache, missing
feature, `headerHeight` and vertical titles together, the name unchanged); browser `scripts/browser-1-10.mjs`
(Chrome fr and ar at narrow widths with axe; Firefox and WebKit once: the title on several lines, the row as tall as the
tallest).
