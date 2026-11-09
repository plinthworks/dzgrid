# Vertical column titles

Written before the code (CLEANROOM). Sources: a spreadsheet's « rotate text up » on a header cell, and Tabulator's public
feature list (« vertical column headers »), as a checklist only; CSS Writing Modes 4. Owner answers 2026-11-09 (1.9.0
lot A, item 4). Entry: `@dzgrid/dom/vertical-headers` (`verticalHeaders()`), look `@dzgrid/theme/vertical-headers.css`.

## What the user does
Reads a grid of many narrow columns (a yes / no per month, a score per test) whose long titles are written upwards, so the
columns stay narrow.

## Behaviours (numbered, each one a test)
1. `headerVertical: true` on a column, with the `verticalHeaders()` feature: its header's title is turned a quarter turn
   counter-clockwise — Latin text reads from the bottom up; Arabic text, whose lines begin on the right, begins at the
   top. The title sits at the bottom of the header (near the data), centred in the column's width.
2. Without the feature: one warning `missing-feature` (path `columns[i].headerVertical`, detail `vertical-headers`); the
   title stays horizontal.
3. The column headers' row grows to the longest vertical title (measured once per change of the titles, the text size or
   the density; never at a scroll), at least a row's height, at most `maxHeight` (240 px by default); a longer title is
   cut at the end with « … », its whole text still in the cell's name.
4. Only the title turns: the sort mark, the filter button and the menu button stay as they are; the column's width is the
   developer's (a vertical title does not widen it).
5. **Keyboard and screen readers unchanged**: the cell keeps its role, name (`aria-label`), keys and focus ring; a
   screen reader reads the title as written.
6. Right to left: the same turn (a quarter counter-clockwise), the title centred in the column — nothing mirrored but
   the columns' order.
7. Other header rows (groups above, the floating filters below) keep their heights; the pinned top band sits under the
   taller header (its offset read from the header, `pinned-rows.md` 5).
8. Print and exports: titles as text, horizontal (a file has no rotation).

## Where DzGrid differs on purpose
- One turn only (up). Free angles do not read well at a grid's sizes.

## Tests
`packages/dom/test/vertical-headers.test.ts` (attribute, height from a measured title, cap, cache, missing feature,
name unchanged); browser `scripts/browser-lot-a.mjs` (Chrome fr and ar, Firefox and WebKit once: the title turned,
read upwards, the row as tall as the longest title).
