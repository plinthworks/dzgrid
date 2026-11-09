# Columns that collapse under their rows (responsive)

Written before the code (CLEANROOM). Sources, as a checklist only: the public feature lists of grids and table plugins
that « collapse columns » on narrow screens (a chevron per row shows the hidden columns as « Title: value » lines), WCAG
2.2 (1.4.10 reflow, 2.1.1 keyboard, 4.1.2 name, role, value), the APG grid pattern. Owner answers 2026-11-09 (1.9.0 lot B,
item 1, « ★ partout »). Entry: `@dzgrid/dom/responsive` (`responsive({ priority })`), over the detail rows of
`@dzgrid/dom/detail` (master-detail.md): the same chevron, panel, keys and names.

## What the user does
Opens a wide grid on a phone, a half screen, or at 400 % zoom. Instead of scrolling sideways, they read the first columns
in the row and open a row's chevron to read the others underneath, one « Title: value » line each.

## Behaviours (numbered, each one a test)
1. **When columns collapse.** With the feature, when the shown columns need more room than the view has (the view's width
   less the selection boxes' column and the row numbers' strip), centre columns collapse one by one until the rest fit.
   A column needs its width (the user's, else its definition's, 150 by default); a flexible one its `minWidth`, else its
   `width`, else 150. The order: the highest `collapsePriority` first (`responsive({ priority: { id: n } })` wins over the
   column's own); among equals, the last on screen first. Default priority 1. Never collapsed: the first shown column
   (it carries the chevron and names the row), a pinned column, a column with priority 0.
2. **What the user sees.** A collapsed column leaves the header and the rows; the other columns share the room again
   (flexible ones grow). Each row's first cell shows the detail chevron; opening it shows a panel under the row with one
   line per collapsed column, in screen order: its title, then its value as its cell would show it (format, language,
   time zone, an edit in progress), « Title: value » (the colon drawn by the theme's sheet, a narrow space before it in
   French). A blank value shows an empty line. The panel takes its lines' height (`'auto'`, measured).
3. **Followed live**: a resize, a zoom, a new text size, a column's width, order, pinning or hiding, new columns —
   re-decided in the paint that lays the columns out (the core's column model, from the room it is given, as the pinned
   columns' release, pinned-columns.md), so no frame shows a sideways scrollbar first. A panel already open shows the new
   set of lines.
4. **Nothing collapsed** (the view wide enough): no chevron, no empty slot, no panel; the rows the user opened stay
   remembered and show their panels again when columns collapse again.
5. **Not the columns' state.** Collapsing hides nothing in `state()`: no `columnsChanged`, nothing saved by a
   `GridState`, the columns chooser shows them ticked, their widths kept.
6. **Keyboard.** On a row's first cell (the chevron's): Enter or Space opens or closes its lines (Space there does not
   tick the row while columns are collapsed; it still does elsewhere; F2 still edits); forward (→, ← in Arabic) opens,
   back closes (the detail's keys). Down from the row reaches its panel, one stop; Tab leaves the grid.
7. **Screen readers.** `aria-expanded` on the first cell; the panel is a group named « Details of {name} » (`detail.label`,
   the `-detail` texts); the lines are a description list (title, value); the user's opening and closing are said
   (`detail.expanded` / `detail.collapsed`).
8. **Focus on a column that collapses**: a cell goes to the same row's first cell; a header to the first column's header.
9. **Search, filters, sort.** The quick search still reads the collapsed columns (a row never disappears because the view
   narrowed); a filter or a sort on a collapsed column stays in force (the filters panel still reaches it); the rows are
   not filtered or sorted again when columns collapse.
10. **Selection** unchanged (a panel is never selected).
11. **Export and print write every column**: CSV, Excel and JSON with no `columns` given, and `print()`, write the
    collapsed columns in their places, as if the view were wide; panels are never written.
12. **Pinned columns** (pinned-columns.md L4a): never collapsed. Columns collapse first; when only columns that never
    collapse are left and they still do not fit, the pinned columns are released as before and the row scrolls sideways.
13. **Right to left**: the chevron mirrored (the detail's), the lines start at the start side; nothing else differs.
14. **Not with** another row shape: a tree, row grouping (and the pivot), header groups or spans (`spans()`), the
    application's own `detail()` — one is told `unsupported-combination`, the first listed wins; with infinite scrolling
    (no row shape) nothing collapses. `collapsePriority` without the feature: `missing-feature` (path
    `columns[i].collapsePriority`, detail `responsive`).
15. **Read-only lines**: a line never edits; a column drawn by a cell part shows its text.

## Where DzGrid differs on purpose
- The collapse is decided where the columns are laid out (the column model), not by a later observer: no flash of a
  sideways scrollbar, and the same rule in every engine.
- A collapsed column keeps its place in the search, the filters, the files and print: only the screen is narrow.

## Tests
`packages/core/test/columns-collapse.test.ts` (order, priority, never-collapsed columns, flexible needs, the search reading
collapsed columns, no `dataVersion` move, the files' columns); `packages/dom/test/responsive.test.ts` (chevron, lines,
nothing collapsed, keys, focus, export, print, problems); browser `scripts/browser-lot-b.mjs` (Chrome fr and ar at 1200,
600 and 360 px with axe; Firefox and WebKit once at 360 px).
