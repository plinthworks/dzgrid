# Sparklines — a small drawing of a list of numbers in a cell

Sources: the public documentation and demos of grids that draw « sparklines » in cells (what a user sees: a tiny line,
area or bar chart per row, a tooltip with the point under the pointer), spreadsheets' sparklines, WCAG 2.2 (1.1.1 text
alternative, 1.4.1 use of colour, 1.4.11 non-text contrast, 1.4.13 content on hover or focus). Owner 2026-11-21
(« commence par les mini-courbes », gap analysis Q-G3 « A »: a small SVG drawing of our own, no library). Opt-in, its
own entry: a grid without it pays nothing but the column type. Sheet written before the code (CLEANROOM.md).

## What the user does
Looks down a column of small curves (a counter's last thirty days, per row); moves the pointer along one to read a
point; tabs or arrows onto the cell; sorts by it; copies it, exports it, prints it; reads it with a screen reader.

## Behaviours

1. **Opt-in**: a column `type: 'sparkline'` holds a list of numbers in time order. Drawn by `sparklines()` of
   `@dzgrid/dom/sparkline` in `features`; its look in `@dzgrid/theme/sparkline.css`; its texts in
   `@dzgrid/dom/locales/<lang>-sparkline`. Without the feature the cell shows its numbers as text (2); a column with
   `sparkline` options and no feature is told once (`missing-feature`).
2. **The value**: an array of numbers (`[3, 5, 41, 27]`), a blank point (`null`, `undefined`, `''`) being a **gap**; or
   text of numbers with `.` decimals between spaces, `;` or `,` (`'3 5 41 27'`). Anything else (a word, `NaN`,
   `Infinity`, an object) is unreadable: the cell is blank, as any unreadable value. An empty list is blank.
3. **Kinds** (`sparkline: { kind }`, default `line`):
   - `line`: the points joined, a gap breaking the line;
   - `area`: the line over a filled area down to zero (or the bottom when every value is above zero);
   - `bar`: one bar per point from zero, negative bars in the negative colour;
   - `winloss`: one bar per point, up for a value above zero, down for one below, nothing for zero or a gap —
     every bar the same height (the sign only).
4. **The range**: from the row's smallest to its largest value (`bar` takes zero in), unless `min` / `max` fix it (so
   rows compare at a glance); a value outside a fixed range is drawn at its edge. All values equal: a flat line in the
   middle.
5. **Markers** (`markers`, default `'last'`): `'last'` a dot on the last point (a line, an area) or the last bar in the
   marker colour; `'minmax'` the smallest and the largest (their first time); `'none'`. A shape (a dot, a bar's own
   colour beside its size), never colour alone: the values are in the words (7).
6. **Options**: `sparklines(options)` gives the grid's defaults, a column's `sparkline: { … }` wins over them, key by
   key: `kind`, `min`, `max`, `markers`, `tooltip: false` (no point tooltip).
7. **Words for screen readers** (WCAG 1.1.1): the cell's text is a summary, « 12 values, from 3 to 41, last 27 »
   (`sparkline.summary`, plural by count; « 1 value: 27 » for one), the numbers in the grid's language; the drawing is
   hidden from assistive technologies. A list whose points are all gaps reads as blank.
8. **Tooltip on hover** (through the grid's tooltip, so a feature drawing the tooltips — `@dztooltip/dzgrid` — shows
   it too): over the drawing, the point nearest the pointer, « 41 (3 of 12) » (`sparkline.point`), and a ring on that
   point; it follows the pointer from point to point at once, after the grid's hover delay the first time. Leaving the
   cell hides it as any tooltip (Escape, a press, a scroll). `tooltip: false` on the column, or the column's own
   `tooltip`: the grid's tooltip as before, no point tooltip.
9. **Tooltip on keyboard focus**: the summary (7), at once, as a column tooltip is (tooltips.md 12) — the keys move
   between cells, not between points.
10. **Right to left** (decision): time runs **left to right in both directions**, as numbers and clock times do inside
    Arabic text; the drawing is never mirrored, the pointer read from its left edge. The cell, its padding and its
    alignment follow the grid's direction; the summary is in the grid's language.
11. **Sorting** by the column sorts by each row's **last** value (a blank list last, as blanks are); a list ending in
    gaps by its last number.
12. **Files, clipboard, print, find** (decision: the data, not words): CSV, Excel, JSON and the clipboard write the
    numbers between spaces (`3 5 41 27`, a gap an empty place: `3  41`), read back the same way by a paste or an
    import; print and find read the same numbers. The summary is for the screen and screen readers only (it is in a
    language; a file is data).
13. **Editing**: an editable sparkline column edits as text of numbers (2); a word refused as any unreadable value.
14. **Colours** only as variables, in `sparkline.css`: `--dzg-sparkline-line` (line, area edge, bars; default the
    accent), `--dzg-sparkline-area` (the area's fill; default the accent at 20 %), `--dzg-sparkline-negative`
    (negative bars, a loss; default the palette's danger), `--dzg-sparkline-marker` (markers and the hover ring;
    default the text colour). Non-text contrast 3:1 on the row's background, hovered, selected and focused
    (contrast-pairs.json). Forced colours: the drawing in `CanvasText`, markers
    and the hover ring in `Highlight` (a negative bar told by its side of zero).
15. **Size and speed**: the drawing scales to its cell (no measure, no layout read); a pooled cell redraws only when
    its list or its options changed. 10 000 rows of 30 points scroll as a grid of text does (measured, browser-1-16).
