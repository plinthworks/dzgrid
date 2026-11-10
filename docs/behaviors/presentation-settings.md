# Presentation settings (1.9.0)

Written before the code (CLEANROOM). Work list: `docs/presentation-review.md` (every 🟡 / ❌ row with a proposed
answer); the owner's answers of 2026-11-09 to its eight questions win over it. Sources: public documents only — CSS
Cascading 5 (custom properties, guaranteed-invalid values), CSS Box Alignment 3 (`align-content` on block containers),
CSS Fonts 4 (`font-variant-numeric`), CSS Masking 1 (`mask`), SVG 2 (what an image-mode SVG may load), WCAG 2.2
(1.4.3, 1.4.11, 2.4.13, 2.5.8). The reference grids' public option names were only a checklist (the review).

## What the application does
- Sets a `--dzg-*` variable on any ancestor of the grid (or on `.dzg`) to change one look: the line between rows,
  the header's weight, the tooltip's colours…
- Or gives the same values from code: `theme: { rowOddBg: '…', headerWeight: 500 }` (a grid setting, live; Angular
  `[theme]`, `<dz-grid>`'s `theme` property), with the `theming()` feature of `@dzgrid/dom/theme`.
- Gives its own icons: `icons: { sortAsc: '<svg …>', filter: svgElement }` (same feature, live).
- Chooses a density: the paddings follow the rows.

## What the reader observes
- Nothing changes until the application asks, except three things decided by the owner (visible, in the CHANGELOG):
  a header title sits over its column's cells (a number column's title at the end), digits in number cells are of
  equal width, and a compact or spacious density also tightens or loosens the cells' side paddings.
- Alternate rows keep their tint while scrolling, sorting, filtering, grouping: the tint follows the row's place on
  screen, not the row.
- A shadow at the pinned columns' edge only while content is scrolled under them.

## Behaviours (numbered, each one a test)

### Alternate rows (owner A, review 6.1)
1. Each body row carries `data-odd` when its displayed position, counted from 0, is odd (the 2nd, 4th… row shown),
   rewritten at each paint: a row moved by a sort, a filter, a scroll (pooled rows reused for other places), a group
   opened or a detail shown takes its new place's mark. Every displayed row counts (group rows, a detail panel).
   `presentation.test.ts`.
2. `--dzg-row-odd-bg` tints them; not set (the default), nothing changes. Hover, the focused row and a selected row
   stay above it. Pinned rows (`@dzgrid/dom/pinned-rows`) keep their own surface. `presentation-theme.test.ts`.

### Header title aligned with its column (owner A, review 5.5)
3. A column header carries `data-align` from the column's `headerAlign`, else its `align`, else `end` for a number
   column (as its cells); none for `start` by default. The title sits at the end (or the centre) of the header, the
   sort mark and the buttons after it. `headerAlign: 'start' | 'center' | 'end'` overrides (a column option, no runtime
   check: a wrong word is a type error). Group header cells keep theirs.
4. Visible change: a number column's title moves to the end. Noted in the CHANGELOG; the real-app screenshots updated
   knowingly.

### Equal-width digits (review 4.8)
5. Number cells carry `data-num`; their digits are tabular (`font-variant-numeric: tabular-nums`) so a column of
   figures lines up. `--dzg-num-figures: normal` turns it off.

### Pinned edge (owner A, review 7.4, 2.9)
6. The grid writes `data-under-start` on its root while content is scrolled under the start-pinned part (the inline
   scroll past 0 and something pinned at the start — the box column counts), `data-under-end` while content is under
   the end-pinned part (the view not at its inline end). Rewritten at each paint (every scroll paints). Logical:
   start is the right side in Arabic.
7. `--dzg-pinned-shadow` (a `box-shadow`, written for the start side in left to right, e.g. `4px 0 6px -4px
   color-mix(…)`) is drawn at the edge only then; not set, nothing. The grid mirrors it for the end side and in right
   to left, so the application writes one value.

### Lines (owner A, review 2.3–2.9, 2.12)
8. Separate variables, each a full border value (`none` removes it), defaults today's: `--dzg-frame` (the grid's
   outer edge), `--dzg-frame-radius` (falls back to `--dzg-radius`), `--dzg-row-line` (between rows),
   `--dzg-header-line` (under the header), `--dzg-pinned-column-line` (the pinned edge), `--dzg-detail-line` (a
   detail panel's start rule, 3 px today); `--dzg-header-separator` (colour), `--dzg-header-separator-size` (2 px) and
   `--dzg-header-separator-height` (50 %) for the marks between resizable header cells.
9. `--dzg-column-line` (default `none`): a line at each body and header cell's inline end. Inside a pinned part, the
   last cell draws none (the pinned edge is there).
10. Header hover: `--dzg-header-hover-bg` on a sortable header under the pointer (default: no change).

### Type and places (review 4.2, 4.4, 4.5, 4.7, 5.2, 5.6, 1.10, 6.11)
11. `--dzg-header-weight` (600), `--dzg-header-fg` (the text colour), `--dzg-header-font-family`,
    `--dzg-header-case` (`none`; `uppercase` changes no Arabic letter), `--dzg-header-align-block` (`center`; `start` /
    `end` for a tall header), `--dzg-cell-font-size`, `--dzg-cell-padding-block` (0) and `--dzg-cell-align-block`
    (a wrapped or part-drawn cell's content: `start` by default, `center`, `end`).

### Small surfaces (review 1.15, 3.4, 3.6, 3.8, 6.7, 8.5, 9.2, 10.3–10.8)
12. Box: `--dzg-box-size` (1rem; its cell keeps its width), `--dzg-box-radius`, `--dzg-box-on-bg` (accent),
    `--dzg-box-edge`. Focus: `--dzg-focus-width` (2 px; never under 2 px: a smaller value is raised, WCAG 2.4.13).
    Popups: `--dzg-popup-bg`, `--dzg-popup-shadow`. Tooltip: `--dzg-tooltip-bg`, `--dzg-tooltip-fg`. Inputs:
    `--dzg-input-bg`, `--dzg-input-border`. Buttons: `--dzg-button-bg`, `--dzg-button-border` (Apply keeps the
    accent). Menu items: `--dzg-menu-item-height` (32 px, never under 24). Panels and the dock: `--dzg-panel-bg`.
    Group rows: `--dzg-group-row-bg`. An editor's frame: `--dzg-editor-border`. Scrollbars (comfort sheet):
    `--dzg-scrollbar-thumb`, `--dzg-scrollbar-thumb-active`.
13. Every new colour's default is today's colour and joins `contrast-pairs.json` with the pairs it is drawn in.

### Spacing and density (owner A, review 1.11, 1.12, 11.2)
14. `--dzg-space` (.25rem): the base sheet's gaps and chrome paddings are multiples of it (header gap 1, overlay gap
    2, popup padding 3, footer 1 / 2, tooltip 1 / 2, detail body 2, buttons 3).
15. Density: the root's `data-density` sets `--dzg-density` (compact .75, comfortable 1, spacious 1.25); a cell's
    side padding is `--dzg-cell-padding-inline` × it. A theme's own padding is scaled too. An application that wants
    fixed paddings sets `.dzg { --dzg-density: 1 }` in its own CSS.

### Icons (owner Q7, review 8.1–8.4)
16. Today's marks are the grid's own drawings (characters and clipped shapes, no file): they stay the defaults.
    `--dzg-icon-size` sizes the sort mark, the chevrons, the submenu arrow, the grip and the funnel (its insets relative
    to it; 12 px by default for the funnel, today's).
17. `icons` setting (needs `theming()`): `sortAsc`, `sortDesc`, `filter`, `filterActive` (the filtered column's;
    default: `filter`), `menu`, `chevron` (tree, detail, groups: turned and mirrored as today's), `submenu`, `grip`.
    Each an SVG string or an `SVGElement` (copied, never moved). Drawn in the mark's colour (`currentColor` whatever
    the SVG's own fill), at the mark's size, mirrored where the default is.
18. Cleaned before use: the root must be `<svg>`; no `<script>`, `<style>`, `<foreignObject>`, no other element than
    shapes, groups, definitions, gradients, `use`, `title` / `desc`; no `on…` attribute; a link (`href`) only to `#…`;
    `url(…)` only to `#…`; no `\` in a value (a CSS escape could spell `url(`) and no DOCTYPE (its entities): 1.9.0 review; at most 20 000 characters. Anything else: the icon is refused, the default drawn, a warning
    `invalid-setting` at `settings.icons.<name>` (detail: the reason, never the SVG). An unknown name: same, detail
    `unknown`. The icon is shown as an image (`mask`, a `data:` URL): nothing in it can run even if a rule were
    missed. A page whose CSP forbids `data:` images keeps the defaults.
19. Live: `update({ icons })` replaces them; a name taken away comes back to the default.

### `theme` setting (owner B)
20. `theme: { … }` (needs `theming()`): typed keys, each a variable — the ten palette colours (`accent` →
    `--tz-accent`, `bgRaised` → `--tz-bg-raised`…) and every `--dzg-*` knob of the guide's table in camel case
    (`rowOddBg` → `--dzg-row-odd-bg`). Written on the grid's root (so they win over the stylesheets for this grid only).
21. A value is a string or a finite number (written as is: `600`, `0`); a key not in the list, or a value with `;`,
    `{`, `}`, `<`, `\`, `!`, `url(` (or an image's other spellings `image(`, `image-set(`, `src(`: 1.9.0 review), or another type: not written, warning `invalid-setting` at `settings.theme.<key>`
    (detail: the value as given, cut to 80 characters). Never throws.
22. Live: `update({ theme })` writes the new set and takes away the variables the previous one wrote that the new one
    does not hold. Read-only variables (`--dzg-row-height`, `--dzg-header-height`, `--dzg-density`) are not keys.
23. `theme` or `icons` without `theming()`: one warning `missing-feature` (detail `theme`) at creation, nothing drawn.

## Where DzGrid differs on purpose
- One opt-in sheet for the knobs: `@dzgrid/theme/variables.css`, after `dzgrid.css` (and `variables.unlayered.css`
  after the unlayered copy). The base sheet only reads the variables of behaviours 2, 5, 7 and 15: the audit screen's
  size (K.8) has no room for the rest, and an application that changes nothing pays nothing.
- No icon set shipped, no icon font: the grid's own marks stay CSS drawings (owner Q7: our own, `currentColor`).
- A theme object, not a theme class: the variables are the contract; the object writes them.

## Left out (review « later, only if an app asks »)
Header titles that wrap and grow the header (5.7), a grid as tall as its rows (1.6), column hover (6.5), separate
heights for the group and filter rows (1.4, 1.5), a per-row height function (1.2), columns fitted at load (1.8): each
is layout the grid must compute, none is cheap. 2.10 and 2.11 need nothing new; 7.3 is a documented raw-CSS hook.

**1.10.0 (owner 2026-11-10):** 1.4 (`headerHeight: { columns, groups }`, `density.md` « Group rows' height »), 1.5
(`filters({ rowHeight })`, `filter-ui.md`), 1.8 (`columns({ fitOnLoad: 'content' })`, `column-resize.md` 16–21), 5.7
(`headerWrap`, `header-wrap.md`) and 6.5 (`columnHover()`, `column-hover.md`) are built. 1.6 **won't be done**: the
grid's height always comes from its container, never from its rows (`virtual-scroll.md`). 1.2 stays « only if asked ».

## Right to left
Every new line and mark is logical. The pinned shadow and the chevron icon are mirrored by the grid (`scale: -1 1`);
a header title at the end sits on the left in Arabic; `--dzg-header-case` leaves Arabic as it is.

## Tests
`packages/dom/test/presentation.test.ts` (1, 3, 5, 6, 23), `packages/dom/test/theming.test.ts` (16–22),
`packages/theme/test/presentation-theme.test.ts` (2, 7–15, the variables sheet, contrast pairs), browsers
`scripts/browser-presentation.mjs` (Chrome fr / ar with axe, Firefox and WebKit once).
