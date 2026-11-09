# Presentation settings — review (2026-11-09)

Owner request (2026-11-09), after finding the header height could not be set apart from the row height (being added
as `headerHeight`, 1.9.0): go through **every presentation aspect** — sizes, borders, colours, spacing, fonts,
alignment, icons, states — and say, for each, what DzGrid lets an application change today and what it should offer.

**Clean room.** The two reference grids are used as a checklist only, through the option and theme-parameter
names their public documentation gives; no source, CSS, theme or SCSS file of theirs was read. Where a reference
grid has no named option and leaves it to the application's CSS, the column says « CSS ». DzGrid's side was read
from `packages/theme/*.scss`, `packages/dom/src/styles.ts` (the injected layout), `packages/dom/src/settings.ts`,
`packages/core/src/columns/defs.ts`, `packages/dom/src/render/{rows,header,header-decor}.ts` and the sheets
`theming.md`, `density.md`, `virtual-scroll.md`, `docs/guide/theming-rtl.md`.

**Done (1.9.0, owner's answers of 2026-11-09).** Every row marked « Done in 1.9.0 » below
(`docs/behaviors/presentation-settings.md`; the guide « Theming and right to left » has the full table). Left out, each
layout the grid must compute and none asked by an app yet: 1.2, 1.4, 1.5, 1.6, 1.8, 5.7, 6.5; nothing to do: 2.10, 2.11,
8.4.

**Reading the table.**
- *Verdict*: ✅ covered (a setting, a column option or a `--dzg-*` / `--tz-*` variable meant for it) · 🟡 possible but
  only with raw CSS on the grid's classes, or only in part (one token drives several things that cannot be told
  apart) · ❌ missing (not doable cleanly, even with CSS).
- *Proposal*: a `--dzg-*` CSS variable for pure looks, read at its point of use with today's value as the fallback
  (never declared on `:root`, as every `--dzg-*` today); a setting only when the grid must know the value for layout
  (heights, widths, what is drawn).
- *Effort*: S (a few lines and a test), M (several sheets or a DOM hook), L (layout change in the grid).
- *Base / K.8*: where the change lands. « theme » = the base sheet `dzgrid.css`, counted in K.8's audit profile
  (a variable with its fallback is a few tens of bytes gz); « base DOM » = the base JS bundle (K.8 too); « feature »
  or « optional sheet » = outside the base, K.8 untouched; « — » nothing to do.
- A new colour variable joins `contrast-pairs.json` (`check:contrast`), and every line width stays logical
  (`inline` / `block`, never left / right).

Abbreviations: **AG** = AG Grid (grid options and Theming API parameters), **Tab** = Tabulator (setup options,
column options, style docs).

## 1. Sizes and spacing

| # | Aspect | AG / Tab (public names) | DzGrid today | Verdict | Proposed DzGrid answer | Effort | Base / K.8 |
|---|---|---|---|---|---|---|---|
| 1.1 | Height of a data row | AG `rowHeight` (option and theme parameter); Tab `rowHeight` | `rowHeight` (24–1 000 px, grows with text size), `density`; `--dzg-row-height` written by the grid, read-only (`settings.ts`, `density.md`) | ✅ | — | — | — |
| 1.2 | A different height per row | AG `getRowHeight`; Tab rows sized by their content | `autoHeight()` feature + column `wrap` (measured); no per-row function | 🟡 | Keep measured heights; a `rowHeight(row)` function only if an app asks (virtualisation must know it) | L | base DOM |
| 1.3 | Height of the column headers' row | AG `headerHeight`; Tab CSS | `headerHeight` (1.9.0, being added; `density.md` « Header height »), `--dzg-header-height` read-only | ✅ | — (in progress, not touched here) | — | — |
| 1.4 | Height of the column-group rows apart from the headers | AG `groupHeaderHeight`, `pivotHeaderHeight` | Group rows take `headerHeight` (decided 2026-11-09, `density.md` « Header height » 3) | 🟡 | If asked: `headerHeight: { columns, groups }` (the grid lays them out) | S | base DOM |
| 1.5 | Height of the filter row under the headers | AG `floatingFiltersHeight` | Keeps the row height (`density.md` « Header height » 4) | 🟡 | `filters({ rowHeight })` if asked | S | feature |
| 1.6 | Grid as tall as its rows (no inner scroll) | AG `domLayout: 'autoHeight'`; Tab no `height` / `maxHeight` | The grid fills its host; a host grown to its rows is held to the window and told `unbounded-viewport` (`virtual-scroll.md`) | 🟡 | A setting `fit: 'host' \| 'rows'` with a row cap (`maxRows`), the view sized by the grid; beyond the cap it scrolls | M | base DOM |
| 1.7 | Column width, min, max, share of the free room | AG `width`, `minWidth`, `maxWidth`, `flex`; Tab `width`, `minWidth`, `maxWidth`, `widthGrow` | Column `width`, `minWidth`, `maxWidth`, `flex` (`defs.ts`) | ✅ | — | — | — |
| 1.8 | Columns fitted to their content or to the view at load | AG `autoSizeStrategy`, size-to-fit; Tab `layout` (`fitData`, `fitColumns`, `fitDataFill`, `fitDataStretch`) | `flex` shares the room; « fit » on demand (columns feature: menu, double-click on an edge) | 🟡 | `columns({ fitOnLoad: 'content' })` if asked | M | feature |
| 1.9 | Cell padding along the line | AG `cellHorizontalPadding`; Tab cell padding (style docs) | `--dzg-cell-padding-inline` (`dzgrid.scss`) | ✅ | — | — | — |
| 1.10 | Cell padding above / below (wrapped text) | AG `rowVerticalPaddingScale` | None: text centred by its line height; a wrapped cell has no block padding | 🟡 | **Done in 1.9.0** — `--dzg-cell-padding-block` (default 0), read on `[data-wrap]` cells| S | theme |
| 1.11 | One spacing unit that scales the whole grid | AG `spacing` | None: gaps hard-written in rem (header gap .25rem, popup .75rem, footer .25/.5rem, menu items 32 px) | ❌ | **Done in 1.9.0** — `--dzg-space` (default .25rem); the sheets' gaps written as multiples of it| M | theme + every feature sheet |
| 1.12 | Gap between the header's label, sort mark and filter button | AG `cellWidgetSpacing` | `.dzg-hcell` gap .25rem fixed | 🟡 | **Done in 1.9.0** — Covered by 1.11 (`calc(var(--dzg-space) * 1)`)| S | theme |
| 1.13 | Indent per level (tree, grouped rows) | AG `rowGroupIndentSize`; Tab `dataTreeChildIndent` | `tree({ indent })` (number or per row), `--dzg-tree-pad` written by the grid | ✅ | — | — | — |
| 1.14 | Space between categories of rows | — | `rowGaps({ before, size })` (`row-gaps.md`) | ✅ | — | — | — |
| 1.15 | Selection box size and its column's width | AG checkbox style part | Box 1rem, column `CHECK_WIDTH` fixed (`render/write.ts`) | 🟡 | **Done in 1.9.0** — `--dzg-box-size` (look only; the column keeps its width, ≥ 24 px target)| S | theme |
| 1.16 | Minimum target size of the grid's buttons | — | `--dzg-target-min` (24 px, WCAG 2.5.8) | ✅ | — | — | — |

## 2. Borders and separators

| # | Aspect | AG / Tab (public names) | DzGrid today | Verdict | Proposed DzGrid answer | Effort | Base / K.8 |
|---|---|---|---|---|---|---|---|
| 2.1 | Width of every line at once | AG `borderWidth`-style parameters per border | `--dzg-line` (default 1px) | ✅ | — | — | — |
| 2.2 | Line colour | AG `borderColor`; Tab border colours (style docs) | `--tz-border` (palette, shared with tzslot) | ✅ | — | — | — |
| 2.3 | The grid's outer frame (on / off, its own colour) | AG `wrapperBorder`; Tab table border (CSS) | `.dzg` border from `--dzg-line` + `--tz-border`, same as every line | 🟡 | **Done in 1.9.0** — `--dzg-frame` (a border shorthand; `none` removes it)| S | theme |
| 2.4 | The frame's corner radius apart from buttons and popups | AG `wrapperBorderRadius`, `borderRadius` | `--dzg-radius` drives frame, buttons, popups, tooltips together | 🟡 | **Done in 1.9.0** — `--dzg-frame-radius`, falling back to `--dzg-radius`| S | theme |
| 2.5 | Lines between rows (on / off, colour) | AG `rowBorder`; Tab row border (style docs) | Cell `border-block-end` from `--dzg-line` + `--tz-border` | 🟡 | **Done in 1.9.0** — `--dzg-row-line` (shorthand; `none` removes)| S | theme |
| 2.6 | Lines between columns in the body | AG `columnBorder`; Tab cell borders (on by default) | None drawn; raw CSS on `.dzg-cell` works (cells are border-box) but meets the pinned segments' edge and the selection bar | ❌ | **Done in 1.9.0** — `--dzg-column-line` (default `none`), drawn at each cell's inline end, not after the last of a segment| S | theme |
| 2.7 | Line under the header | AG `headerRowBorder` | Header cell `border-block-end`, same token as rows | 🟡 | **Done in 1.9.0** — `--dzg-header-line`| S | theme |
| 2.8 | Separators between header cells | AG `headerColumnBorder`, `headerColumnBorderHeight`, `headerColumnResizeHandleColor` / `Height` / `Width` | The resize grip's `::after`: 2 px, half the height, only on resizable columns; group headers an end line (`.dzg-hgroup`) | 🟡 | **Done in 1.9.0** (resizable columns only, as today) — `--dzg-header-separator` (colour), `--dzg-header-separator-size` (width), `--dzg-header-separator-height`; drawn on every column, not only resizable ones| S | theme |
| 2.9 | Edge of pinned (frozen) columns | AG `pinnedColumnBorder`; Tab frozen columns (CSS) | Line `--dzg-line` + `--tz-border` on the segment's `::after` | 🟡 | **Done in 1.9.0** — `--dzg-pinned-column-line`| S | theme |
| 2.10 | Edge of pinned rows | AG `pinnedRowBorder` | `--dzg-pinned-line` (colour), 2 px fixed (`pinned-rows.scss`) | ✅ | Width could follow `--dzg-line` doubled; not needed | — | — |
| 2.11 | Line above a footer / totals row | AG `footerRowBorder` | Pager footer: `--dzg-line`; group footer: `--dzg-line`; totals row through the pinned-row line | 🟡 | Reuse `--dzg-pinned-line` / `--dzg-header-line`; nothing new | S | optional sheet |
| 2.12 | Detail panel rule | — | 3 px `--tz-border` at its start (`.dzg-dcell`) | 🟡 | **Done in 1.9.0** — `--dzg-detail-line` if asked| S | theme |

## 3. Colours and states (cells)

| # | Aspect | AG / Tab (public names) | DzGrid today | Verdict | Proposed DzGrid answer | Effort | Base / K.8 |
|---|---|---|---|---|---|---|---|
| 3.1 | Background, text, accent, borders, danger / warning / success | AG `backgroundColor`, `foregroundColor` / `textColor`, `accentColor`, `borderColor`, `invalidColor`; Tab theme files | Ten `--tz-*` colours, each a `light-dark()` pair (`dzgrid.scss` `$tz-palette`) | ✅ | — | — | — |
| 3.2 | Light and dark | AG colour-scheme parts, `browserColorScheme`; Tab dark theme files | System or `data-theme`; showcase themes and bridges both ways | ✅ | — | — | — |
| 3.3 | Ready themes | AG built-in themes; Tab theme files (simple, midnight, modern, framework ones) | `midnight.css`, `clinic.css`, Tailwind 4 / 3 and Bootstrap bridges, `contrast.css` | ✅ | — | — | — |
| 3.4 | Chrome surfaces (header, footer, side panels) | AG `chromeBackgroundColor`, `sideBarBackgroundColor`, `sidePanelBorder` | `--dzg-header-bg` (header, pager footer, group rows, buttons); panels on `--tz-bg-raised` | 🟡 | **Done in 1.9.0** (`--dzg-panel-bg`, default `--tz-bg`: the panels sit on the surface) — `--dzg-panel-bg` for the dock and panels, falling back to `--tz-bg-raised`| S | optional sheets |
| 3.5 | Focused cell: ring colour and tint | AG `focusShadow`, range border colour | `--dzg-focus-ring`, `--dzg-cell-active-bg` | ✅ | — | — | — |
| 3.6 | Focused cell: ring width | AG `focusShadow` | 2 px fixed | 🟡 | **Done in 1.9.0** — `--dzg-focus-width` (never under 2 px: WCAG 2.4.13)| S | theme |
| 3.7 | Block of cells and fill handle | AG `rangeSelectionBackgroundColor`, `rangeSelectionBorderColor` | `--dzg-range-bg`, `--dzg-range-edge`, `--dzg-fill-handle` (`range.scss`, `fill.scss`) | ✅ | — | — | — |
| 3.8 | Cell being edited | AG `cellEditingBorder`, `cellEditingShadow`, `inputFocusBorder`; Tab edit box colour (style docs) | Framed by the focus ring colour; save marks `--dzg-saving-color`, `--dzg-saved-color` (`edit.scss`) | 🟡 | **Done in 1.9.0** — `--dzg-editor-border`| S | optional sheet |
| 3.9 | Invalid / refused value | AG `invalidColor`; Tab validation (CSS) | `--dzg-refused-color`, `--dzg-refused-bg` | ✅ | — | — | — |
| 3.10 | Value change flash | AG cell flash, value-change highlight colour | `--dzg-flash-color`, `--dzg-flash` (`motion.md`) | ✅ | — | — | — |
| 3.11 | New row tint | — | `--dzg-fresh-color`, `--dzg-fresh-bg`, `--dzg-fresh-bar` (`fresh-rows.scss`) | ✅ | — | — | — |
| 3.12 | Search and find marks | AG find highlight colours | `--dzg-search-mark`, `--dzg-find-*` | ✅ | — | — | — |
| 3.13 | Badges, yes / no | — | Tones from the palette, `--dzg-pill-radius` | ✅ | — | — | — |
| 3.14 | Rows kept while reloading, context rows | AG loading skeleton colour | `--dzg-stale-fg`, `--dzg-context-fg`, `--dzg-toggle-fg` | ✅ | — | — | — |
| 3.15 | A cell's or a column's own look from its data | AG `cellClass`, `cellClassRules`, `cellStyle`; Tab `formatter`, `cssClass` | `ui.cellClass` (function; a constant does a static class), `data-col` on every cell | ✅ | — | — | — |
| 3.16 | More contrast and forced colours | — | `contrast.css` (`prefers-contrast` or `data-contrast`), forced-colours rules throughout | ✅ | — | — | — |

## 4. Typography

| # | Aspect | AG / Tab (public names) | DzGrid today | Verdict | Proposed DzGrid answer | Effort | Base / K.8 |
|---|---|---|---|---|---|---|---|
| 4.1 | Font family and size | AG `fontFamily`, `fontSize`; Tab CSS | `--dzg-font` (a full `font` shorthand) | ✅ | — | — | — |
| 4.2 | Data font size apart from the chrome | AG `dataFontSize` | One font for all; header has its own size | 🟡 | **Done in 1.9.0** — `--dzg-cell-font-size` if asked| S | theme |
| 4.3 | Header font size | AG `headerFontSize` | `--dzg-header-size` | ✅ | — | — | — |
| 4.4 | Header font weight | AG `headerFontWeight` | 600 fixed (`.dzg-header`) | 🟡 | **Done in 1.9.0** — `--dzg-header-weight`| S | theme |
| 4.5 | Header font family | AG `headerFontFamily` | Same as the grid's | 🟡 | **Done in 1.9.0** — `--dzg-header-font-family` if asked| S | theme |
| 4.6 | Header letter spacing | — | `--dzg-header-tracking` (0 in Arabic and in any right-to-left grid) | ✅ | — | — | — |
| 4.7 | Header capitals | AG / Tab: CSS | Raw CSS `text-transform` on `.dzg-hrow` | 🟡 | **Done in 1.9.0** — `--dzg-header-case` (`none` / `uppercase`; no effect on Arabic)| S | theme |
| 4.8 | Digits of equal width in number columns | AG / Tab: CSS | Not set (row numbers and find count use it; number cells do not) | 🟡 | **Done in 1.9.0** — `font-variant-numeric: tabular-nums` on number cells by default, `--dzg-num-figures` to turn off| S | theme |

## 5. Header

| # | Aspect | AG / Tab (public names) | DzGrid today | Verdict | Proposed DzGrid answer | Effort | Base / K.8 |
|---|---|---|---|---|---|---|---|
| 5.1 | Header background | AG `headerBackgroundColor`; Tab header background (style docs) | `--dzg-header-bg` | ✅ | — | — | — |
| 5.2 | Header text colour | AG `headerTextColor`; Tab header text colour (style docs) | `--tz-fg` fixed on `.dzg-header` | 🟡 | **Done in 1.9.0** — `--dzg-header-fg`| S | theme |
| 5.3 | Header cell under the pointer | AG `headerCellHoverBackgroundColor` | Nothing (only the cursor on sortable ones) | ❌ | **Done in 1.9.0** — `--dzg-header-hover-bg` on `.dzg-sortable:hover` (default none: today's look)| S | theme |
| 5.4 | Header cell while dragged | AG `headerCellMovingBackgroundColor` | Drop bar `--dzg-move-bar` (`columns.scss`) | ✅ | — | — | — |
| 5.5 | Header title aligned with its column | Tab `headerHozAlign`; AG `headerClass` | Title always at the start, even over a number column whose cells sit at the end (`data-align` set on cells only, `render/rows.ts`; not on `.dzg-hcell`) | 🟡 | **Done in 1.9.0** — The header follows the column's `align` (`data-align` on `.dzg-hcell`), column `headerAlign` to differ| S | base DOM + theme |
| 5.6 | Header title's vertical place (tall headers) | Tab `columnHeaderVertAlign` | Centred (flex), fixed | 🟡 | **Done in 1.9.0** — `--dzg-header-align-block` (`start` / `center` / `end`): matters now that `headerHeight` makes tall headers| S | theme |
| 5.7 | Long header titles on several lines | AG `wrapHeaderText`, `autoHeaderHeight` | One line, ellipsis; with a fixed `headerHeight`, raw CSS `white-space: normal` on `.dzg-hlabel` wraps within it | 🟡 | Column `headerWrap`, the header row grown to the tallest title (as vertical titles do) | M | feature |
| 5.8 | Titles written upwards | Tab `headerVertical` | Column `headerVertical` (`@dzgrid/dom/vertical-headers`, 1.9.0) | ✅ | — | — | — |
| 5.9 | No header row | Tab `headerVisible` | `headers: 'hidden'` (kept for screen readers, `hidden-headers.md`) | ✅ | — | — | — |
| 5.10 | Classes on one header / one group | AG `headerClass` | `ui.headerClass`; `.dzg-hgroup[data-g][data-level]` (public hook) | ✅ | — | — | — |
| 5.11 | Header tooltip | AG `headerTooltip`; Tab `headerTooltip` | Column `headerTooltip` | ✅ | — | — | — |
| 5.12 | Header replaced by the app's own drawing | AG header component; Tab `titleFormatter` | Part `ui.header` (`parts.md`) | ✅ | — | — | — |

## 6. Rows: alternate, hover, selected, focus

| # | Aspect | AG / Tab (public names) | DzGrid today | Verdict | Proposed DzGrid answer | Effort | Base / K.8 |
|---|---|---|---|---|---|---|---|
| 6.1 | Alternate row tint (zebra) | AG `oddRowBackgroundColor`; Tab even / odd row classes and an alternate colour (style docs) | Impossible: rows are pooled and placed absolutely (`:nth-child` is meaningless) and `rowClass` is not told the row's place | ❌ | **Done in 1.9.0** — The grid writes `data-odd` on a row from its displayed place (updated on rebind, so sort / filter / scroll keep it right; pinned rows apart); `--dzg-row-odd-bg` (default none: today's look); hover, focus and selection stay above it| S–M | base DOM (+ ≈ 30 o) + theme |
| 6.2 | Row under the pointer | AG `rowHoverColor`, `suppressRowHoverHighlight`; Tab row hover colour | `--dzg-row-hover-bg` (set it to `var(--tz-bg)` to turn hover off) | ✅ | — | — | — |
| 6.3 | Selected row | AG `selectedRowBackgroundColor`; Tab selected row colour | `--dzg-row-selected-bg`, `--dzg-select-bar` (bar at the row's start) | ✅ | — | — | — |
| 6.4 | Row holding the focus | — | `--dzg-row-active-bg` | ✅ | — | — | — |
| 6.5 | Column under the pointer | AG `columnHoverHighlight`, `columnHoverColor` | None | ❌ | Only if asked: a feature writes `data-hover-col` on the root, theme tints `[data-col]` cells (`--dzg-column-hover-bg`) | M | feature |
| 6.6 | A row's classes from its data | AG `getRowClass`, `rowClassRules`, `rowStyle`; Tab `rowFormatter` | `rowClass` (row, key, context, pinned side) | ✅ | — | — | — |
| 6.7 | Group rows and group footers | AG group-row styling (CSS) | Header surface, weight 600 (`grouping.scss`) | 🟡 | **Done in 1.9.0** — `--dzg-group-row-bg`, falling back to `--dzg-header-bg`| S | optional sheet |
| 6.8 | Row numbers column | AG `rowNumbers`; Tab row header | `rowNumbers()` feature, header surface (`row-numbers.scss`) | ✅ | — | — | — |
| 6.9 | Cell text: cut, ellipsis or wrapped | AG `wrapText`, `autoHeight`; Tab text formatters, `variableHeight` | Ellipsis by default, column `wrap`, `autoHeight()` | ✅ | — | — | — |
| 6.10 | Cell text alignment | AG `cellClass` / `cellStyle`; Tab `hozAlign` | Column `align` (`start` / `center` / `end`; numbers `end` by default) | ✅ | — | — | — |
| 6.11 | Cell text vertical place (tall rows) | Tab `vertAlign` | Centred by line height; wrapped text starts at the top | 🟡 | **Done in 1.9.0** (`align-content` on the cell) — `--dzg-cell-align-block` for wrapped and part-drawn cells (with 1.10)| S | theme |

## 7. Pinned / frozen

| # | Aspect | AG / Tab (public names) | DzGrid today | Verdict | Proposed DzGrid answer | Effort | Base / K.8 |
|---|---|---|---|---|---|---|---|
| 7.1 | Columns pinned at the start or the end | AG `pinned`; Tab `frozen` | Column `pinned: 'start' \| 'end'` (logical) | ✅ | — | — | — |
| 7.2 | Rows pinned at the top or the bottom, their surface | AG pinned rows; Tab `frozenRows` | `pinnedRows({ top, bottom })`, `--dzg-pinned-bg`, `--dzg-pinned-line` | ✅ | — | — | — |
| 7.3 | Pinned columns' own surface | AG / Tab: CSS | Same as the row (needed: they follow hover, selection, focus) | 🟡 | **Done in 1.9.0** (documented in the guide) — Raw CSS on `.dzg-seg-start` / `.dzg-seg-end` is enough; document it| S | docs only |
| 7.4 | Shadow at the pinned edge while content passes under | AG / Tab: CSS (no named option) | A line only; the grid does not say when content is under the pinned part | ❌ | **Done in 1.9.0** — The grid writes `data-under-start` / `data-under-end` on the root from the horizontal scroll (one read per scroll frame, already done); `--dzg-pinned-shadow` (default none)| M | base DOM + theme |

## 8. Icons

| # | Aspect | AG / Tab (public names) | DzGrid today | Verdict | Proposed DzGrid answer | Effort | Base / K.8 |
|---|---|---|---|---|---|---|---|
| 8.1 | Size of the grid's marks | AG `iconSize` | Each mark sized on its own: sort .75em, funnel drawn with px insets, chevrons and submenu arrow 1rem | 🟡 | **Done in 1.9.0** (the ⋮ keeps its drawing; its custom icon follows the size) — `--dzg-icon-size`; the funnel's insets made relative to it| M | theme + feature sheets |
| 8.2 | Sort marks | AG `icons` (`sortAscending`, `sortDescending`); Tab `headerSortElement` | `▲` `▼` as `content` on `.dzg-sort[data-dir]`; raw CSS can replace them | 🟡 | **Done in 1.9.0** (the `icons` setting, not a content string) — `--dzg-icon-sort-asc`, `--dzg-icon-sort-desc` (strings read by `content`)| S | theme |
| 8.3 | Filter, menu, tree / detail / group chevrons, submenu | AG `icons` map, `iconSet` | Characters or CSS drawings; raw CSS can replace them | 🟡 | **Done in 1.9.0** (the `icons` setting) — `--dzg-icon-*` per mark, same pattern as 8.2; mirrored marks keep their mirror in right to left| M | theme + feature sheets |
| 8.4 | A whole icon set (SVG, icon font) | AG `iconSet`, `iconFont`; Tab formatters | None by design (no image, no font file); a header part can draw its own | 🟡 | Keep: 8.2–8.3 accept `url()` images too; no set shipped | — | — |
| 8.5 | Selection box look | AG checkbox style part, `checkboxCheckedBackgroundColor`, `checkboxUncheckedBorderColor`, `checkboxBorderRadius` | Accent fill, muted outline, radius .25rem fixed (`.dzg-box`) | 🟡 | **Done in 1.9.0** — `--dzg-box-radius`, `--dzg-box-on-bg` (default accent), `--dzg-box-edge` (with 1.15)| S | theme |

## 9. Scrollbars

| # | Aspect | AG / Tab (public names) | DzGrid today | Verdict | Proposed DzGrid answer | Effort | Base / K.8 |
|---|---|---|---|---|---|---|---|
| 9.1 | Thin or system scrollbars | AG / Tab: CSS | `dzgrid.comfort.css`: thin by default, `--dzg-scrollbar: auto` for the system's; base: the system's | ✅ | — | — | — |
| 9.2 | Scrollbar colours | AG / Tab: CSS | `--tz-border` / `--tz-fg-muted` in the comfort sheet | 🟡 | **Done in 1.9.0** — `--dzg-scrollbar-thumb`, `--dzg-scrollbar-thumb-active`| S | optional sheet |

## 10. Overlays and popups

| # | Aspect | AG / Tab (public names) | DzGrid today | Verdict | Proposed DzGrid answer | Effort | Base / K.8 |
|---|---|---|---|---|---|---|---|
| 10.1 | Loading / no rows / error message and its drawing | AG loading and no-rows overlay components; Tab `placeholder`, loader options | `overlay` setting, `messages`, overlay parts (`@dzgrid/dom/slots`) | ✅ | — | — | — |
| 10.2 | Spinner, busy bar | AG loading overlay | Spinner in `dzgrid.comfort.css`; `busy`, `--dzg-busy-bar` | ✅ | — | — | — |
| 10.3 | Popup surface: background, border, shadow | AG `popupShadow`, `cardShadow`, `menuBackgroundColor`, `menuBorder`, `menuShadow` | `--tz-bg`, `--dzg-line`, `--dzg-radius`; shadow fixed | 🟡 | **Done in 1.9.0** — `--dzg-popup-bg`, `--dzg-popup-shadow`| S | theme |
| 10.4 | Menu item height and padding | AG `listItemHeight` | 32 px fixed (`_menu-list.scss`) | 🟡 | **Done in 1.9.0** — `--dzg-menu-item-height` (≥ 24 px)| S | optional sheet |
| 10.5 | Tooltip colours | AG `tooltipBackgroundColor`, `tooltipTextColor` | Inverted text / background, fixed | 🟡 | **Done in 1.9.0** — `--dzg-tooltip-bg`, `--dzg-tooltip-fg` (a contrast pair)| S | theme |
| 10.6 | Tooltip delay | AG `tooltipShowDelay` | `tooltips.delayMs` | ✅ | — | — | — |
| 10.7 | Input boxes (filters, editors) | AG `inputBorder`, `inputBackgroundColor`, `inputFocusBorder`, `inputHeight` | Border `--tz-fg-muted`, surface `--tz-bg`, fixed | 🟡 | **Done in 1.9.0** — `--dzg-input-border`, `--dzg-input-bg`| S | theme |
| 10.8 | Buttons (pager, filter footer, panels) | AG button style part | One look for panels (`_controls.scss`, `--dzg-control-active-bg`); the base's own buttons fixed | 🟡 | **Done in 1.9.0** — `--dzg-button-bg`, `--dzg-button-border`; the primary keeps the accent| S | theme |

## 11. Density presets

| # | Aspect | AG / Tab (public names) | DzGrid today | Verdict | Proposed DzGrid answer | Effort | Base / K.8 |
|---|---|---|---|---|---|---|---|
| 11.1 | Named densities, chosen by the user, saved | AG: `spacing` / compact theme variants | `density` (`compact` 28, `comfortable` 32, `spacious` 40), `setDensity`, menu line, `GridState` | ✅ | — | — | — |
| 11.2 | A density that also tightens paddings and type | AG `spacing` scales everything | Heights only; the root carries `data-density`, so raw CSS can react | 🟡 | **Done in 1.9.0** — The base sheet reads `data-density` to set `--dzg-cell-padding-inline` (and 1.11's unit) per density| S | theme |

## 12. Right to left

| # | Aspect | AG / Tab (public names) | DzGrid today | Verdict | Proposed DzGrid answer | Effort | Base / K.8 |
|---|---|---|---|---|---|---|---|
| 12.1 | Direction | AG `enableRtl`; Tab `textDirection` | `direction: 'auto' \| 'ltr' \| 'rtl'` (follows `dir` live) | ✅ | — | — | — |
| 12.2 | Logical sides for every look | — | Only `start` / `end`, `inline-*` (guarded) | ✅ | Every proposal above stays logical | — | — |
| 12.3 | Joined scripts in headers | — | No letter spacing in Arabic or any right-to-left grid | ✅ | — | — | — |
| 12.4 | Mirrored marks, local digits | — | Submenu arrow mirrored, `numerals: 'locale'` | ✅ | — | — | — |

## Gaps, by priority

1. **Alternate row tint (6.1)** — ❌, the most asked look of a data grid, and not even doable by CSS today. A
   `data-odd` written by the grid plus `--dzg-row-odd-bg`. S–M, base DOM.
2. **Header title aligned with its column (5.5)** — 🟡 but visible: a number column's title sits at the start
   over cells at the end. Follow `align` by default, `headerAlign` to differ. S, base DOM. A change of look (CHANGELOG).
3. **The line tokens, one by one (2.3–2.9, 5.3)** — frame, row line, header line, header separators, column lines
   (❌ today), pinned edge, header hover. One batch of S variables in the base sheet, defaults = today's look.
4. **Header type and colour (4.4, 5.2, 5.6)** — weight, text colour, vertical place (needed now that `headerHeight`
   makes tall headers). S, theme.
5. **Pinned shadow while content passes under (7.4)** — ❌; the grid must say when. M, base DOM.
6. **Equal-width digits in number columns (4.8)** — S, default on; cheap and visible.
7. **Small surfaces as variables (8.5, 10.3, 10.5, 10.7, 10.8, 1.15)** — box, popup, tooltip, inputs, buttons.
   One batch of S variables.
8. **Icons (8.1–8.3)** — one size and one variable per mark. M (the funnel's drawing).
9. **Spacing unit and density-aware paddings (1.11, 11.2)** — M, touches every sheet.
10. **Later, only if an app asks** — header titles that wrap and grow the row (5.7), a grid as tall as its rows
    (1.6), column hover (6.5), separate group-row and filter-row heights (1.4, 1.5), a per-row height function (1.2).

Everything in 3–9 is a CSS variable whose fallback is today's value: no look changes unless an app sets it, no
setting, no `GridState` entry; each new colour goes into `contrast-pairs.json`. Only 1, 2 and 5 touch the base JS.
