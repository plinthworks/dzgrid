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
    default: `filter`), `menu`, `chevron` (tree, detail, groups: turned and mirrored as today's), `submenu`, `grip`;
    the pager's `pagerFirst`, `pagerPrevious`, `pagerNext`, `pagerLast` (1.12.0, 41).
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

# 1.12.0 — every look a choice (owner 2026-11-13)

Written before the code (CLEANROOM). Work list: an application's CSS audit (gaps G1–G13, generic wording) and the
owner's answers of 2026-11-13, whose rule wins over the rest: **« toujours laisser le choix »** — every look has a
sensible default and a variable (or a setting) the application changes without fighting the grid. Owner B: **no CSS
class is promised**; the grid's classes, pseudo-elements and DOM order are internal and may change in any release;
everything an application needs is a `--dzg-*` variable (or a `theme` key, or a setting). Sources: CSS Cascading 5
(layers, guaranteed-invalid values), CSS Backgrounds 3, CSS Masking 1 (`clip-path`), Selectors 4 (`:where`, complex
`:not`), WCAG 2.2 (1.4.3, 1.4.11, 1.4.13).

## Behaviours (numbered after 23, each one a test)

### The application's icons always win (G1, a bug)
24. A default mark (the sort triangles, the funnel and its hollow, the ⋮ of the column menu, the submenu arrow) is
    drawn only when the application gave no icon for it: each default rule of the theme sheets is guarded by
    `:where(:not([data-dzg-icons~=<name>] *))` (no weight added). So an icon is never clipped, shrunk or overdrawn,
    with the layered sheets **and** with the `*.unlayered.css` copies (under an unlayered reset: Tailwind 3's
    preflight, Bootstrap's Reboot). The filtered funnel: `filterActive` replaces it on filtered columns, `filter`
    everywhere.
25. `icons.sortNone` (opt-in): when given, every **sortable** column that is not sorted keeps a mark `data-dir="none"`
    drawn with it (decorative, `aria-hidden`; `aria-sort` unchanged); sorted, the asc / desc mark replaces it; sorted
    back to none, it returns; not given, nothing changes. Live with `update({ icons })`.
26. `--dzg-sort-fg`: the sort marks' colour (default `--tz-fg-muted`, today's).

### Rows: the hovered and selected text (owner 1, G3)
27. `--dzg-row-hover-fg`, `--dzg-row-selected-fg`, `--dzg-row-active-fg` (the row holding the focus): the text colour
    of such a row's cells. Not set: the cells inherit the row's colour, as today (a stale or context row keeps its
    muted text). Set: the cells take it; content that sets its own colour (an application's part, a badge, a mark)
    keeps it — the rule weighs nothing (`:where`). Content that should follow uses `color: inherit` /
    `currentColor` in its own CSS. A selected row under the pointer takes the selected colour (as its background).
    Defaults of the backgrounds unchanged: a light tint in light mode, a dark band in dark mode.

### Lines between columns, last row, last column (owner 2, 6, G11, G12)
28. `--dzg-column-separator` (a colour; not set: nothing drawn), `--dzg-column-separator-size` (`--dzg-line`),
    `--dzg-column-separator-height` (`100%`; `60%` gives a short centred divider): a mark at each body cell's inline
    end, drawn as the cell's background image (logical: at the left in right to left). Not after the last cell of a
    pinned part (the pinned edge is there), nor after the last column. The full-height border `--dzg-column-line`
    (1.9.0) stays as it was.
29. The grid marks the last displayed body row (`data-last-row`) and every cell of the last displayed column, header
    included (`data-last-col`), at each paint: a sort, a filter, a scroll (pooled rows reused), grouping, a column
    hidden, moved, pinned or collapsed take their new marks; pinned rows are not body rows. « Last » is the last
    displayed body row whatever its kind (review 1.12.0, `presentation-1-12-last-row.test.ts`): a closed group's row, an
    open group's last child, the grand total when it ends the list, a tree's last visible child, a detail panel under
    the last master (the master again once closed); a pinned bottom row never. Variables:
    `--dzg-last-row-line` (a border; default `--dzg-row-line`, today's), `--dzg-last-column-line` (a border; default
    `--dzg-column-line`, i.e. none), `--dzg-header-separator-end` (the resize mark after the last column; default as
    the others, `transparent` drops it). These marks are not a promised hook (owner B): the variables are.

### Filter inputs (owner 3)
30. The boxes of the filter row and popups draw their edge as a 1 px outline inside a transparent border (as the
    selection box), not a border: an unlayered reset (`border-width: 0`) cannot erase it. `--dzg-input-border` is its colour,
    or `none` (no edge); default a discreet line in light mode, `--tz-fg-muted` mixed 75 % into `--tz-bg` (3:1 at
    least on the input and on the header, WCAG 1.4.11), unchanged in dark mode. An invalid number keeps its 2 px
    danger outline and its thicker end edge (now in the danger colour). Forced colours: the outline in the system's
    colour.
    `--dzg-input-fg`, `--dzg-input-radius`.

### Tooltip (owner 4, 5, G4, G7)
31. Its text size is the cells' (`--dzg-cell-font-size`, else the grid's) — was 0.875 em. Variables (all in
    `variables.css`): `--dzg-tooltip-font-size`, `-font-family`, `-font-weight`, `-line-height`, `-max-width`
    (`20rem`), `-padding-block` / `-padding-inline` (1 and 2 spacing units), `-radius` (`--dzg-radius`),
    `-white-space` (`normal`; `pre-line` keeps the value's line breaks), `--dzg-tooltip-bg` / `-fg` (1.9.0).
32. The tooltip says its side: `data-side="block-end"` (below its cell) or `"block-start"` (above, when there is no
    room below), rewritten at each show. An arrow (a CSS triangle, no border: a reset cannot erase it) points from
    that side to the cell, at the cell's middle, clamped inside the tooltip; the grid writes the place
    (`--dzg-tip-at`, from the inline start: right to left needs nothing more). `--dzg-tooltip-arrow-size` (`.375rem`;
    `0` turns it off), `--dzg-tooltip-arrow-color` (the tooltip's background). The tooltip moves away from its cell by
    the arrow's size. Forced colours: the arrow in `CanvasText`. The arrow is drawn by `variables.css` (on as soon as
    that sheet is loaded): the base sheet has no room for it in the audit screen's size (K.8).

### More surfaces (owner « pense à toutes les variables », G5, G9, G10)
33. Each a variable whose default is today's look (`variables.css` unless the base must read it): header
    `--dzg-header-padding-inline` (default the cells', × the density), `--dzg-header-button-fg` /
    `--dzg-header-button-active-fg` (filter and menu buttons, the filtered funnel), `--dzg-header-group-line`;
    popups `--dzg-popup-radius`, `--dzg-popup-border`, `--dzg-popup-padding`; set filter
    `--dzg-option-selected-bg`; buttons `--dzg-button-fg`, `--dzg-button-radius`; overlay `--dzg-overlay-fg`,
    `--dzg-overlay-bg`; pager `--dzg-footer-bg`, `--dzg-footer-fg`. (A menu item's hover tint was left out: `menu.css`
    has no room under its size line.) Not done, owner's call: `autoColumns` generic in its column type (gap M8) changes
    three public declarations (`check:api`); the change is ready, not applied. The guide's table lists every variable the
    sheets read (a test fails on one missing, either way).

### Five corrections before publishing (owner 2026-11-13, « oui lance les 5 corrections »)
34. **A header's title stays at its start under a page's reset** (a defect, seen in a real app with Tailwind 3's
    preflight and the `*.unlayered.css` copies). Cause: the filter button (and the column menu's ⋮) were pushed to the
    header's end by an auto margin (`margin-inline-start: auto`, in the layered layout), and since 1.11.0 a cell with
    buttons packs at its end (`justify-content: end`, so a too-narrow cell cuts the title's side, never the grip's
    gap). Tailwind 3's preflight (`button { margin: 0 }`, unlayered) takes that margin; with nothing taking the free
    room, the end packing sent the title, its sort mark and the buttons to the column's end. Now the push is an empty
    item that grows (`::before`, ordered after the title and the sort mark, before the buttons; a size, which no common
    reset touches), its gap given back so nothing moves by a pixel. A title that grows itself (an aligned column's, the
    header filter box) needs none. Where: the filters' layout (`FILTERS_CSS`, injected: the layered and the unlayered
    sheets alike) for a header with a filter button, `columns.css` (both copies) for one with a ⋮. The audit screen's
    size (K.8) line goes 91 000 → 92 000 for it (owner 2026-11-13, « tu peux augmenter »; measured 91 037). Start- and
    end-aligned, with and without the column menu, left to right and Arabic, both copies, with and without the reset:
    `browser-1-12.mjs` (9).
35. `--dzg-sort-none-fg`: the colour of the unsorted mark (`icons.sortNone`, 25), apart from the active one
    (`--dzg-sort-fg`); default the latter (today's look), so an app greys the unsorted mark and keeps the accent on the
    sorted one. `variables.css`.
36. **Buttons**: the popups' buttons (a filter's Clear and Apply, the condition rows' add / remove, the period
    shortcuts, the overlay's Retry; the pager's have their own, 39) read, beside 1.9.0's `--dzg-button-bg`, `-fg`, `-border` (a colour) and
    `-radius`: `--dzg-button-font-weight` (inherited), `--dzg-button-padding-inline` (.75rem; on the footer's, the
    overlay's, add / remove and Retry: the shortcuts keep their own) and `--dzg-button-height`
    (2rem, the same buttons but a row's Retry, a 24 px target; a height, not a block padding: the browsers' own button
    padding differs, so no default could be today's in all three), `--dzg-button-hover-bg` / `--dzg-button-hover-fg` / `--dzg-button-active-bg` (under the pointer, pressed:
    unset, no change — today); the primary one (Apply) `--dzg-button-primary-bg` (accent), `-fg` (accent's text),
    `-border` (accent), `-hover-bg`, `-hover-fg`, `-active-bg` (unset: no change). A pager button that cannot act takes
    no hover. Defaults today's look. In their own opt-in sheet `@dzgrid/theme/buttons.css` (and `buttons.unlayered.css`),
    loaded after `variables.css`: that one had no room under its size line (+2 % rule). With it, no rule on the grid's
    classes is needed. The columns panel and the dock draw their own quiet buttons (another look, `_controls.scss`): not
    these.
37. **Every text of a hovered or selected row in the row's colour, opt-in**: `data-dzg-row-fg="force"` on the grid's
    host or any ancestor (a CSS switch read by `variables.css`; no setting, no code). Then a hovered row's and a selected
    row's cells and everything in them (an app's coloured status mark included) take the row's text colour
    (`--dzg-row-hover-fg` / `--dzg-row-selected-fg`, else the row's own), over the content's own colour (`!important`
    in the grid's layer: an app's unlayered rule cannot keep it); light and dark alike (the variables follow the
    palette). Without the switch, 27 as before: content with its own colour keeps it. A focused row is not forced.
    For content that should follow without the switch, or for what is not a text colour (a badge's background, an
    icon's fill), the theme sets `--dzg-row-state-fg` on the cells of a hovered, focused or selected row: the colour the
    application gave that row's text (unset when it gave none, and on the other rows), so a part writes
    `color: var(--dzg-row-state-fg, <its own colour>)`. Written by the theme, not a `theme` key.
38. **The set filter's list as wide as its longest value**: filter-set.md « The list's width ». Variables
    `--dzg-set-list-min-width` (14rem, today's) and `--dzg-set-list-max-width` (`min(32rem, 90vw)`), read by the set
    chunk's layout.

### The pagination bar, every look a variable (owner 2026-11-13, « oui ajoute-les », « donne la possibilité de styler la pagination »)
39. **The pager's buttons apart from the popups' buttons.** The pager's buttons (`«` `‹` `›` `»`, and the
    selection's « Select all N » and « Clear » in the same bar) read none of the popups' button variables
    (`--dzg-button-*`, 1.9.0's `-bg` and `-border` included): an app that draws a popup's Clear as a link keeps a
    framed pager. One exception, asked: their text size falls back on `--dzg-button-font-size`. Which control follows
    which:
    - a filter popup's Clear and Apply, the condition rows' add / remove, the period shortcuts, the overlay's Retry:
      `--dzg-button-*` (36), and `--dzg-button-font-size` (`1em`: today, each inherits its popup's or overlay's size);
    - the pager's buttons: `--dzg-pager-button-*` only;
    - the rows-per-page `<select>`: `--dzg-pager-select-*`, each falling back on the pager button's same one, then
      today's (one set styles the pager's controls alike; the select's own set parts them);
    - menu items (`menu.css`) and the panels' quiet buttons (`_controls.scss`: columns panel, dock, filters panel):
      none of these, their own look, their text the menu's or the panel's size (unchanged); the header's filter and
      menu buttons: `--dzg-header-button-*` (33); the filter boxes and the floating row's clear button:
      `--dzg-input-*` (30).
40. **Every look of the bar a variable**, default today's (the computed styles with the sheet equal those without it).
    The strip (`--dzg-footer-*`: it is the status bar's too): `--dzg-footer-bg`, `-fg` (33), `-line` (the line above
    it, a border; `--dzg-line` solid `--tz-border`), `-padding-block` / `-padding-inline` (1 and 2 spacing units),
    `-height` (its least height, `auto`), `-gap` (between its parts, `.25rem 1rem`), `-font-size` (`1em`), `-justify`
    (its parts along the line, `normal`), `-align` (across it, `center`); `--dzg-pager-margin-inline-start` (`auto`:
    the pager at the inline end; `0` lets `-justify` place it). Texts, each `-fg`, `-font-weight`, `-font-size`
    (default the strip's colour, weight and size): `--dzg-pager-count-*` (« 1 à 100 sur 150 »), `--dzg-pager-page-*`
    (« Page 1 sur 2 »; its colour `--tz-fg`), `--dzg-pager-label-*` (« Lignes par page »), `--dzg-pager-selected-*`
    (« 12 lignes sélectionnées »). Buttons: `--dzg-pager-button-bg` (`--dzg-header-bg`), `-fg` (`--tz-fg`), `-border`
    (a colour, `--tz-fg-muted`), `-radius` (`--dzg-radius`), `-padding-inline` (`.75rem`, the worded ones; the arrows
    stay square), `-size` (`2rem`: the arrows' side, every pager button's least height), `-font-size`
    (`--dzg-button-font-size`, then `1em`), `-font-weight` (inherited), `-hover-bg` / `-hover-fg` / `-active-bg` (unset:
    no change), `-hover-border` / `-active-border` (unset: no change; `-active-border` falls back on `-hover-border`),
    `-disabled-fg` (`--tz-fg-muted`) / `-disabled-bg` (the button's) / `-disabled-border` (the button's `-border`); a
    button that cannot act takes no hover. The select has no disabled state (it is never disabled: hidden with fewer
    than two sizes). The select: `--dzg-pager-select-bg`, `-fg`, `-border`, `-radius`, `-padding-inline`, `-height`, `-font-size`,
    `-font-weight` (WebKit draws the select natively: its corners, padding and height stay its own there, as today —
    the base's do not reach it either). `--dzg-pager-focus-ring` (an `outline`, on the pager's buttons and select at `:focus-visible`;
    unset: the browser's own ring, as today — `revert-layer`, never a reset's). Forced colours keep the system's.
    In their own opt-in sheet `@dzgrid/theme/pager.css` (and `pager.unlayered.css`), after `variables.css`: the base
    (K.8), `variables.css` and `buttons.css` have no room under their lines (+2 %; the bar's rules weigh ≈ 740 B). CSS
    variables only, not `theme` keys (39 keys cost ≈ 150 B of `@dzgrid/dom/theme`, past its line); `buttonFontSize`
    is one. Not reachable without a change of structure or look: the select's arrow (the browser's own, in the
    select's text colour in Chrome and Firefox; its own colour would mean drawing it, `appearance: none`); a current
    page mark (there is none: no list of page numbers). Which parts and in which order: `pagination({ footer })`
    (`['footer.selected', 'footer.count', 'footer.pager']`, fixed at creation; a host's part replaces one); the select
    is hidden with fewer than two sizes (`pagination: { pageSizes }`); « last » is not drawn when pages go by cursor.

### The pager's marks as icons (owner 2026-11-14)
41. **`icons.pagerFirst`, `pagerPrevious`, `pagerNext`, `pagerLast`** (needs `theming()`, as every icon): the pager's
    « « ‹ › » » marks drawn as the application's icons, each one only when given — a mark not given keeps its character,
    unchanged. Cleaned and refused as the others (18), live (19). Drawn at the pager button's text size (`1em`) or
    `--dzg-icon-size` when set, in the button's colour (`--dzg-pager-button-fg`, and `--dzg-pager-button-disabled-fg` on
    a button that cannot act), as a mask over that colour (forced colours: the system's text colour). Mirrored in right
    to left, as the characters are: an icon drawn pointing left in left to right points right in Arabic — previous and
    first point to the line's start. The buttons' accessible names are unchanged (« First page », …): the icon, as the
    character, is hidden from screen readers. With the layered and the unlayered sheets, under a page's reset.

## Right to left
The separator, the last column's line, the arrow's place and the header padding are logical; the separator's
background position is mirrored by `:dir(rtl)`.

## Tests
`packages/dom/test/presentation-1-12.test.ts` (25, 29, 32), `packages/theme/test/presentation-1-12.test.ts` (24, 26–33,
both copies, contrast pairs, the guide's table), `packages/theme/test/presentation-1-12-fixes.test.ts` (34–37, 39–40),
`packages/dom/test/filters-set-width.test.ts` (38), `packages/dom/test/pager-icons.test.ts` (41), browsers `node scripts/browser-1-12.mjs` (Chrome, Firefox, WebKit ×
layered / unlayered × light / dark × ltr / ar × a page with Tailwind 3's preflight; axe; every variable's default and
effect, table-driven; 34 the header's places, 37 the forced row text, 38 the list's width; 39–40 the pager apart from the popups' buttons, each bar variable's default and effect; 41 the pager's icons: size, colour, disabled colour, mirrored, names).
