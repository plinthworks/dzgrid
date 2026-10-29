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

## As built (Phase 6 step 9, 2026-10-27; plan `docs/phase-6-steps/step09-plan.md` « Done »)
- `ColumnDef.wrap: true` (core type only). The base marks the column's cells `data-wrap` and its layout CSS lets them
  wrap in the body and the tree's pinned parents (`white-space: normal; overflow-wrap: anywhere`), never in the pinned
  bands (Q9-1: one line there, clipped with …; no automatic tooltip — the grid never guesses one from the content, a
  column `tooltip` gives the full text). Without `autoHeight()`: one `missing-feature` warning, path
  `columns.<id>.wrap`, detail `auto-height` (1).
- `autoHeight()` from `@dzgrid/dom/auto-height` (no options). It injects one rule once per document or shadow root
  (`style[data-dzgrid-wrap]`, the grid's `nonce`): a wrapped cell's lines `--dzg-wrap-line` (1.25rem) tall, one line
  centred in a row of the normal height, more below it.
- **The measure** (4): after each paint, before the browser shows it (`GridContext.again`), the mounted data rows not
  measured yet at these widths: a hidden copy of each wrapped cell in its own segment (same font, direction, padding,
  width), all written, then read (`getBoundingClientRect`, whole pixels up), then all removed. Not measured: a row
  with an open editor (it keeps its height until saved or cancelled), a detail panel, a cell spanning rows. A row's
  height = the tallest of them, never under the row height (3). Rows changed are found by their wrapped cells' text
  (a hash), so a host update, an edit saved, an undo measure that row again; a cancelled edit measures nothing (7).
- **The frame** (5): when heights changed, the grid paints again in the same frame — three times at most, then at the
  next frame — and only the last paint is shown. The anchor is the painter's (S3): the row at the view's top keeps its
  distance into it (at most its new height), the top stays the top, the end the end; past the browser's height
  (scaled scrolling) the same, logically. A scroll since the last paint (the user's, or one written just before the
  frame) moves the anchor to the row now at the top, in the layout the user saw (a base fix: before it, rows laid
  out again in that frame put the view back where the last paint left it).
- **Forgotten and measured again** (7): every height when the wrapped columns' widths (resize, flex, auto-size, a
  wrapped column shown or hidden), the row height (density, `rowHeight`, the reader's text size), the direction or
  the language change, the wrapped cells' line height (`--dzg-wrap-line`) or font size change (read off one wrapped
  cell's computed style at each paint: a theme change alone paints nothing, the next paint — a scroll, or
  `api.refresh()` — measures again; review of b64ba02), and when late fonts load (`document.fonts` `loadingdone`, Q9-4).
  A row's text is told apart by code points (two emojis sharing a high surrogate are two texts). As built, a column that is
  not wrapped, moved, shown or hidden measures nothing (the wrapped widths are unchanged). Heights of rows gone from
  the grid are dropped; rows scrolled away keep theirs until one of those changes.
- **Layout**: the measured rows taller than the row height are rows of their own height in the core's sparse layout
  (`@dzgrid/core/detail`'s, memory O(tall rows)), merged with a detail panel's (8): `autoHeight()` always lays out
  outermost, whatever the features' order, and either feature taken away leaves the other working.
- **Warning** (6): more than 10 000 rows shown (detail panels count) with a wrapped column: one `auto-height-large`
  (path `columns.<id>.wrap`), once per grid.
- **Tree** (9): a pinned parent copies its row's measured height; the copies never take more than half the view in
  pixels, the outermost dropped first (owner Q9-5): a parent taller than half the view is not pinned.
- Keys (12): PageDown / PageUp over measured rows; a row taller than the view gets the focus at its top and PageDown
  moves past it.

- **With gaps** (1.1.0, `row-gaps.md`): a row may be both measured taller and gapped; the gaps feature wraps whatever
  layout auto height makes (it is the outermost one whatever the order of the features).

## Tests
`packages/dom/test/auto-height{,-layout,-detail,-tree,-edit,-keys}.test.ts` (support `support-auto-height.ts`: a
measure stub for jsdom), conformance `layout-rows/auto-{mixed-heights,with-details,empty}`; browser `npm run
test:browser -- --only auto-height` on `playground/auto-height.html` (Chrome fr / ar: fit, the panel under its
master, resize and density anchors, the keys, axe; S3's four scenarios at 10 000 rows ≤ 0.5 px; a million rows with
the warning, the wheel, Ctrl+End; Firefox and WebKit `--engine`: Arabic wrapping and the 10 000-row scenarios; Firefox
100 000 rows ≤ 1.5 px).
