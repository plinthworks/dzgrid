# Scrolling a long list

## What the user does
Scrolls through thousands or millions of rows.

## What they observe
- Only the visible rows exist on the page; the scrollbar reflects the full length; the last row is always reachable; rows do not jump when their heights are measured.

## What DzGrid does
- Above about 125 000 rows the scroll range is mapped, not the height (S1), so the end stays exact; there is no row cap.
- The anchor is the first visible row already measured, or the end when at the bottom (S3); rows laid out again just after a scroll keep the row the user scrolled to, never the one before (Phase 6 step 9).
- Rows are recycled in DOM order and rebound, never rebuilt, even on a jump (S9); each cell writes only when its value, column or language changed.
- The focused row stays in the page while scrolled away (the retained row, S10); above ~125 000 rows at its true distance, bounded, and the body clips so it never grows the scroll range (S11).
- Above ~125 000 rows the wheel and the scroll keys are handled by the grid, and touch moves the list by the distance of the finger (S11).

## Row height (density, `rowHeight`)

### What the user does
Reads rows of one height chosen by the application: a density (`compact` 28, `comfortable` 32,
`spacious` 40 px), or a number of pixels (`rowHeight`, e.g. 52 for a two-line cell: a photo, a name
and a job title). The application may change either while the grid is shown.

### What they observe
- Every data row and every header row is that tall; the scrollbar, PageUp / PageDown, the wheel and
  the end of the list follow it, also past the browser's height limit (a million rows, scaled scrolling).
- `rowHeight` wins over the density; removing it goes back to the density.
- The height is given for a 16 px default text size and grows with the reader's text size — the
  browser's default size (its font-size setting, `font-size: medium`), never the page's own root size (an
  application's `html { font-size: 62.5% }` does not shrink the rows) — as a density's does (WCAG 1.4.4);
  whole pixels, never under 24 px (WCAG 2.5.8).
- A tree's pinned parents are copies of their rows: as tall as they are, never more than half the view.
- An opened detail panel keeps its own height (given or measured); only the data rows change.
- A change while the grid is shown keeps the row at the top of the view where it was (the same fraction
  into it) and keeps the focused row in view if it was in view (WCAG 2.4.11), under the pinned parents.
- A value sent again (the same one, `NaN` included) is not told again.
- A value that is not a number from 24 to 1 000 (24: WCAG 2.5.8's target size) is ignored: the grid
  uses the density's height and tells a warning (`problems` event, code `invalid-setting`, path
  `settings.rowHeight`).

### What DzGrid does instead
- The header rows are one row high, as with densities, unless the application sets `headerHeight` (1.9.0,
  `density.md` « Header height »).

### Tests (row height)
`packages/dom/test/row-height.test.ts`; `npm run test:browser -- --only demos` (the HR demo, 52 px rows).

## The grid's height comes from its container (owner, 2026-11-10)
**Rule: the grid's height always comes from its container, never from its rows.** A grid that grew and shrank with
its rows would jump each time a filter or a search changes the count (the page below it moving up and down under the
reader's pointer — the « yo-yo »). So DzGrid has no « as tall as its rows » mode (review row 1.6, « Won't do »): the
application gives the host a height (a fixed one, a share of a flex or grid layout, `100dvh` minus its bar), the rows
scroll inside. A host sized by its content is the unbounded case below, held to the window and told.

**The root fills its container whatever its rows (1.11.0).** The layout sheet gives the grid's root `flex: 1 1 auto`
(it grows in a flex-column host, or in a share of one), `block-size: 100%` (it fills a host with a height, flex or
not), `box-sizing: border-box` (its border inside that height) and keeps `min-block-size: 0` (10 000 rows scroll
inside, never grow the host). The same for `createGrid`, Angular's host and the Web Component (both `display:
contents`: their parent is the container). Before 1.11.0 the root did not grow: with 3 rows in a 300 px flex-column
host the grid was 130 px tall, and a host with a height but no flex column made the grid grow with its rows (the
unbounded case below). Checked in Chrome, Firefox and WebKit: `scripts/browser-host-fill.mjs` (a fixed height, a flex
column, a share of one; 3 and 10 000 rows; the three ways in); the CSS in `packages/dom/test/host-fill.test.ts`.

## A host with no height (unbounded viewport, Phase 11 L9)

### What the application does
Gives the host no height (it is sized by its content: no fixed height, no flex or grid share; before 1.11.0 also a
height without a flex column): the grid's `.dzg` is then as tall as its content, and its viewport grows with its rows
instead of scrolling.

### What the user observes
- The grid stays fast whatever the number of rows: the view is held to the window's height and scrolls on its
  own scrollbar; every row stays reachable. Before (1.7.0): every row was drawn (20 001 row elements for
  20 000 rows), a sort of 100 000 rows took 37 s, a million rows took the tab to 16 GB.
- The application is told once: a `problems` event, code `unbounded-viewport`, severity `warning`, path `host`,
  no detail (never a row's data). The fix is the application's: the documented layout.

### What DzGrid does
- A paint finds the viewport **unbounded** when the view is taller than the window (`innerHeight`) and shows
  every row with less than one row of room left beyond the body and the pinned rows: that is a view grown to
  its rows. A grid sized taller than the window on purpose with fewer rows than its room is not touched.
- From then on, for the grid's life: the viewport's `max-block-size` is set to the window's height (followed at
  each paint, a resized window included), and the paint draws only what that height shows (never all rows,
  even in the frame that found it). Told once per grid.
- No window (a server, a test without one): nothing measured, nothing told.

### Kept on purpose
- A grid sized taller than the window whose rows fill it to within one row is held to the window too (the
  same signal as a grown view); its rows stay reachable by the grid's own scrollbar, and the warning says why.
- No text: problems are told to the application, never shown to the user (no message key).

### Tests
`packages/dom/test/unbounded-viewport.test.ts` (a planted geometry); Chrome once, a 100 000-row page without the
layout (`scripts/browser-unbounded.mjs`).

## Tests
`conformance/cases/layout-rows/*`, `packages/core/test/layout.test.ts`, `packages/dom/test/{grid,scroll}.test.ts`; `npm run test:browser` and `npm run bench:browser` (no frame without rows, 60 fps, a million rows).
