# Theming and right to left

## The theme

`@dzgrid/dom` injects the grid's layout CSS by itself; `@dzgrid/theme` makes it presentable (colours, lines, header,
hover, selection, focus, popups), light and dark, checked for contrast. Each feature with a look has its own sheet,
loaded after `dzgrid.css`: `columns.css`, `menu.css`, `grouping.css`, `pivot.css`, `edit.css`, `range.css`,
`fill.css`, `dock.css`, `columns-panel.css`, `filters-panel.css`, `find.css`, `search.css`, `print.css`,
`row-drag.css`, `pinned-rows.css`, `row-numbers.css`, `fresh-rows.css`; `variables.css` for the presentation knobs
(1.9.0, below).

```ts
import '@dzgrid/theme/dzgrid.css';
import '@dzgrid/theme/menu.css';
import '@dzgrid/theme/contrast.css';   // more contrast when the system asks for it
```

- **Cascade layer.** Every rule sits in the layer `dzgrid`: your own classes win without `!important`. When you layer
  your own CSS, name the order once, first: `@layer theme, base, dzgrid, components, utilities;`. With an unlayered
  reset (Tailwind 3's preflight, Bootstrap's Reboot), load the `*.unlayered.css` copies instead.
- **Bridges.** `tailwind.css` (Tailwind 4), `tailwind3.css`, `bootstrap.css` (5.3, follows `data-bs-theme`) map the
  grid's colours, font and corners to your framework's.
- **Showcase themes.** `midnight.css` and `clinic.css`, each with a light and a dark twin; `data-dzg-skin="midnight"`
  on a container styles only that area.

## Colours and sizes

Colours are CSS variables only. The palette (shared with tzslot), each a `light-dark()` pair on `:root`: `--tz-bg`,
`--tz-bg-raised`, `--tz-fg`, `--tz-fg-muted`, `--tz-border`, `--tz-accent`, `--tz-accent-fg`, `--tz-danger`,
`--tz-warning`, `--tz-success`. What the grid derives, set on any ancestor of `.dzg`: `--dzg-font`, `--dzg-radius`,
`--dzg-cell-padding-inline`, `--dzg-header-bg`, `--dzg-row-hover-bg`, `--dzg-row-selected-bg`, `--dzg-focus-ring`,
`--dzg-line`, `--dzg-pill-radius`, `--dzg-header-size`, `--dzg-select-bar`, `--dzg-flash`, `--dzg-flash-color` — every
one in the table below.

```css
:root { --tz-accent: light-dark(#7c3aed, #c4b5fd); }
.dzg { --dzg-radius: 6px; --dzg-font: "Atkinson Hyperlegible", system-ui, sans-serif; }
.dzg-cell.is-late { color: var(--tz-danger); }
```

### Every variable

Set any of them on an ancestor of `.dzg` (or on `.dzg`), or from code with the `theme` setting below. *Sheet* says
which stylesheet reads it: **base** = `dzgrid.css` (and the layout `@dzgrid/dom` injects); **variables** =
`@dzgrid/theme/variables.css`, loaded after `dzgrid.css` (`variables.unlayered.css` after the unlayered copy) — it
changes nothing by itself; a feature's sheet is named. *Key* is the `theme` setting's key.

| Variable | Key | What it sets | Default | Sheet |
|---|---|---|---|---|
| `--tz-bg`, `--tz-bg-raised`, `--tz-fg`, `--tz-fg-muted`, `--tz-border` | `bg`, `bgRaised`, `fg`, `fgMuted`, `border` | The palette's surfaces, text and lines | tzslot's palette | base |
| `--tz-accent`, `--tz-accent-fg`, `--tz-danger`, `--tz-warning`, `--tz-success` | `accent`, `accentFg`, `danger`, `warning`, `success` | Accent and tones | tzslot's palette | base |
| `--dzg-font` | `font` | The grid's `font` shorthand | inherited | base |
| `--dzg-radius` | `radius` | Corners of buttons, popups, tooltips (and the frame) | `.375rem` | base |
| `--dzg-line` | `line` | Width of every line | `1px` | base |
| `--dzg-pill-radius` | `pillRadius` | A badge's corners | `1em` | base |
| `--dzg-cell-padding-inline` | `cellPaddingInline` | Cells' side padding (× the density) | `.5rem` | base |
| `--dzg-cell-padding-block` | `cellPaddingBlock` | A wrapped cell's top and bottom padding | `0` | variables |
| `--dzg-cell-align-block` | `cellAlignBlock` | A wrapped or part-drawn cell's content: `start`, `center`, `end` | top | variables |
| `--dzg-cell-font-size` | `cellFontSize` | The cells' text size | the grid's | variables |
| `--dzg-num-figures` | `numFigures` | Number cells' digits (`normal` to turn equal widths off) | `tabular-nums` | base |
| `--dzg-space` | `space` | The spacing unit: header gap ×1, overlay ×2, popup padding ×3, footer ×1 / ×2 | `.25rem` | variables |
| `--dzg-target-min` | `targetMin` | The smallest button, grip and toggle (WCAG 2.5.8) | `24px` | base |
| `--dzg-header-bg` | `headerBg` | Header, footer, group rows, buttons | `--tz-bg-raised` | base |
| `--dzg-header-fg` | `headerFg` | Header text | `--tz-fg` | variables |
| `--dzg-header-size` | `headerSize` | Header text size | `1em` | base |
| `--dzg-header-weight` | `headerWeight` | Header weight | `600` | variables |
| `--dzg-header-font-family` | `headerFontFamily` | Header font family | the grid's | variables |
| `--dzg-header-tracking` | `headerTracking` | Header letter spacing (never in Arabic) | `normal` | base |
| `--dzg-header-case` | `headerCase` | `uppercase` titles (Arabic has no case) | `none` | variables |
| `--dzg-header-align-block` | `headerAlignBlock` | A tall header's title: `start`, `center`, `end` | `center` | variables |
| `--dzg-header-hover-bg` | `headerHoverBg` | A sortable header under the pointer | unchanged | variables |
| `--dzg-frame` | `frame` | The grid's outer edge (a border; `none`) | `--dzg-line` solid `--tz-border` | variables |
| `--dzg-frame-radius` | `frameRadius` | The frame's corners | `--dzg-radius` | variables |
| `--dzg-row-line` | `rowLine` | The line between rows (a border; `none`) | as the frame | variables |
| `--dzg-column-line` | `columnLine` | A line between columns (a border) | `none` | variables |
| `--dzg-header-line` | `headerLine` | The line under each header row | as the frame | variables |
| `--dzg-header-separator`, `-size`, `-height` | `headerSeparator`, `headerSeparatorSize`, `headerSeparatorHeight` | The marks between resizable header cells | `--tz-border`, `2px`, `50%` | variables |
| `--dzg-pinned-column-line` | `pinnedColumnLine` | The pinned columns' edge | as the frame | variables |
| `--dzg-pinned-shadow` | `pinnedShadow` | A `box-shadow` at that edge while content is under it, written for the start side (mirrored by the grid) | none | base |
| `--dzg-detail-line` | `detailLine` | A detail panel's start rule | `3px solid --tz-border` | variables |
| `--dzg-row-odd-bg` | `rowOddBg` | Alternate rows (the 2nd, 4th… shown) | none | base |
| `--dzg-row-hover-bg`, `--dzg-row-selected-bg`, `--dzg-row-active-bg` | `rowHoverBg`, `rowSelectedBg`, `rowActiveBg` | Row under the pointer, selected, holding the focus | tints of the palette | base |
| `--dzg-cell-active-bg`, `--dzg-focus-ring` | `cellActiveBg`, `focusRing` | The focused cell's tint and ring | accent tints | base |
| `--dzg-focus-width` | `focusWidth` | The ring's width (never under 2 px) | `2px` | variables |
| `--dzg-select-bar` | `selectBar` | A selected row's bar at its start | `0` | base |
| `--dzg-stale-fg`, `--dzg-context-fg`, `--dzg-toggle-fg` | `staleFg`, `contextFg`, `toggleFg` | Rows kept while loading, a tree's context rows, chevrons | `--tz-fg-muted` | base |
| `--dzg-detail-bg` | `detailBg` | A detail panel's surface | `--tz-bg-raised` | base |
| `--dzg-group-row-bg` | `groupRowBg` | Group rows and their footers | `--dzg-header-bg` | `grouping.css` |
| `--dzg-pinned-bg`, `--dzg-pinned-line` | `pinnedBg`, `pinnedLine` | Pinned rows' surface and edge | `--tz-bg-raised`, `--tz-fg-muted` | `pinned-rows.css` |
| `--dzg-busy-bar` | `busyBar` | The busy bar | `--tz-accent` | base |
| `--dzg-flash-color` | `flashColor` | A changed value's flash | `--tz-warning` | base |
| `--dzg-fresh-color`, `--dzg-fresh-bg`, `--dzg-fresh-bar` | `freshColor`, `freshBg`, `freshBar` | Rows a refresh brought | `--tz-success`, 14 %, `3px` | `fresh-rows.css` |
| `--dzg-saving-color`, `--dzg-saved-color`, `--dzg-refused-color`, `--dzg-refused-bg` | `savingColor`, `savedColor`, `refusedColor`, `refusedBg` | Save marks, a refused value | tones | `edit.css`, base |
| `--dzg-editor-border` | `editorBorder` | An open editor's frame | `--dzg-focus-ring` | `edit.css` |
| `--dzg-range-bg`, `--dzg-range-edge`, `--dzg-fill-handle` | `rangeBg`, `rangeEdge`, `fillHandle` | A block of cells, its edge, the fill handle | selection tint, `--tz-success` | `range.css`, `fill.css` |
| `--dzg-move-bar`, `--dzg-resize-mode` | `moveBar`, `resizeMode` | Where a moved column lands; the keyboard resize | `--tz-accent` | `columns.css` |
| `--dzg-search-mark`, `--dzg-find-color`, `--dzg-find-bg`, `--dzg-find-current-bg`, `--dzg-find-mark`, `--dzg-find-mark-current` | `searchMark`, `findColor`, `findBg`, `findCurrentBg`, `findMark`, `findMarkCurrent` | Search and find marks | palette mixes | `search.css`, `find.css` |
| `--dzg-box-size`, `--dzg-box-radius` | `boxSize`, `boxRadius` | The selection box (its column keeps its width) | `1rem`, `.25rem` | variables |
| `--dzg-box-on-bg`, `--dzg-box-edge` | `boxOnBg`, `boxEdge` | A ticked box's fill, an unticked one's edge | `--tz-accent`, `--tz-fg-muted` | variables |
| `--dzg-icon-size` | `iconSize` | Sort mark, chevrons, grip, funnel, the app's icons in buttons | each mark's own (funnel `12px`) | variables, feature layouts |
| `--dzg-popup-bg`, `--dzg-popup-shadow` | `popupBg`, `popupShadow` | Filter popups and menus | `--tz-bg`, a soft shadow | variables |
| `--dzg-tooltip-bg`, `--dzg-tooltip-fg` | `tooltipBg`, `tooltipFg` | The tooltip | `--tz-fg` on `--tz-bg` reversed | variables |
| `--dzg-input-bg`, `--dzg-input-border` | `inputBg`, `inputBorder` | The filters' boxes | `--tz-bg`, `--tz-fg-muted` | variables |
| `--dzg-button-bg`, `--dzg-button-border` | `buttonBg`, `buttonBorder` | Pager, filter footer, retry buttons (Apply keeps the accent) | `--dzg-header-bg`, `--tz-fg-muted` | variables |
| `--dzg-menu-item-height`, `--dzg-menu-disabled` | `menuItemHeight`, `menuDisabled` | Menu items (never under 24 px), a disabled one | `32px`, `--tz-fg-muted` | `menu.css`, `columns.css` |
| `--dzg-panel-bg` | `panelBg` | The dock and the filters panel | `--tz-bg` | `dock.css`, `filters-panel.css` |
| `--dzg-chip-bg`, `--dzg-chip-hover-bg`, `--dzg-control-active-bg` | `chipBg`, `chipHoverBg`, `controlActiveBg` | Chips; a pressed panel button | accent / text mixes | feature sheets |
| `--dzg-scrollbar`, `--dzg-scrollbar-thumb`, `--dzg-scrollbar-thumb-active` | `scrollbar`, `scrollbarThumb`, `scrollbarThumbActive` | Thin or system scrollbars, the thumb at rest and under the pointer | `thin`, `--tz-border`, `--tz-fg-muted` | `dzgrid.comfort.css` |

Read-only (written by the grid; no key): `--dzg-row-height`, `--dzg-header-height`, `--dzg-density` (`.75` compact,
`1`, `1.25` spacious: the side padding follows the density; `.dzg { --dzg-density: 1 }` in your own CSS keeps it fixed).
Pinned columns' own surface: `.dzg-seg-start`, `.dzg-seg-end` in your CSS (they follow hover and selection).

### The `theme` setting

```ts
import { createGrid } from '@dzgrid/dom';
import { theming } from '@dzgrid/dom/theme';
import { FR } from '@dzgrid/dom/locales/fr';
import '@dzgrid/theme/dzgrid.css';
import '@dzgrid/theme/variables.css';

type Hive = { id: string; name: string; frames: number };

const grid = createGrid<Hive>(document.getElementById('hives')!, {
  rows: [{ id: 'h1', name: 'Ruche du verger', frames: 10 }],
  columns: [{ id: 'name', header: 'Ruche' }, { id: 'frames', header: 'Cadres', type: 'number' }],
  getRowId: (h) => h.id,
  messages: FR,
  theme: { accent: 'light-dark(#0f766e, #5eead4)', rowOddBg: 'color-mix(in srgb, var(--tz-accent) 6%, var(--tz-bg))', headerWeight: 500, columnLine: 'var(--dzg-line) solid var(--tz-border)' },
  features: [theming()],
});
grid.update({ theme: { headerWeight: 700 } });   // live: the previous keys not given again are taken away
```

Angular `[theme]="theme"`, `<dz-grid>`: `el.theme = { … }`. The keys are the table's; each is written on the grid's root,
so it wins over your stylesheets for that grid only. A value is a CSS value or a number (`600`); a key not in the table or
a value with `;`, `{`, `}`, `<`, `\`, `!` or `url(` is told (`invalid-setting`, path `settings.theme.<key>`) and left out.
Contrast is yours to keep: `npm run check:contrast -- --palette` checks a palette file.

### Icons

The grid draws its own marks (characters and shapes, no file, in the text colour). To draw yours:

```ts
import { createGrid } from '@dzgrid/dom';
import { theming } from '@dzgrid/dom/theme';
import { FR } from '@dzgrid/dom/locales/fr';

type Hive = { id: string; name: string; frames: number };
const funnel = document.querySelector<SVGSVGElement>('#my-funnel')!;   // an <svg> already in the page: copied

createGrid<Hive>(document.getElementById('hives')!, {
  rows: [{ id: 'h1', name: 'Ruche du verger', frames: 10 }],
  columns: [{ id: 'name', header: 'Ruche' }, { id: 'frames', header: 'Cadres', type: 'number' }],
  getRowId: (h) => h.id,
  messages: FR,
  icons: { sortAsc: '<svg viewBox="0 0 16 16"><path d="M8 3l5 8H3z"/></svg>', filter: funnel },
  features: [theming()],
});
```

Names: `sortAsc`, `sortDesc`, `filter`, `filterActive` (a filtered column's; else `filter` in the accent — give it to
keep a mark that is not colour alone), `menu`, `chevron` (trees, details, header groups: turned and mirrored as the
default), `submenu`, `grip`. An SVG string or element (copied). Its shape is drawn in the mark's colour and size
(`--dzg-icon-size`), whatever its own fill. Refused, the default kept and `invalid-setting` told: anything but `<svg>`
with shapes, groups, gradients, `use` and `title`; a `<script>`, `<style>` or `<foreignObject>`; an `on…` attribute; a
link or `url()` outside the icon (only `#…`); more than 20 000 characters. Drawn as a `data:` image: a CSP without
`img-src data:` keeps the defaults. With `injectStyles: false`, load `ICONS_CSS` from `@dzgrid/dom/theme` too.

### Alternate rows, lines, the pinned edge

```css
.dzg {
  --dzg-row-odd-bg: color-mix(in srgb, var(--tz-accent) 6%, var(--tz-bg));     /* base */
  --dzg-pinned-shadow: 6px 0 6px -4px color-mix(in srgb, var(--tz-fg) 35%, transparent); /* base */
  --dzg-column-line: var(--dzg-line) solid var(--tz-border);                     /* variables.css */
  --dzg-frame: none;                                                             /* variables.css */
}
```

A header title follows its column's `align` (numbers at the end); `headerAlign` on a column places it otherwise.

**Light and dark** follow the system; `data-theme="light"` or `data-theme="dark"` on any ancestor forces one.

**Row height** comes from the `density` setting (`compact` 28 px, `comfortable` 32 px, the default, `spacious` 40 px)
or `rowHeight` in pixels, which wins. Rows follow the reader's text zoom. The column menu can offer the density to the
user (`columnMenu({ density: true })`), and the [state](state.md) keeps it.

**Header height**: the header rows are one row high unless `headerHeight` (pixels, 24 at least, live) makes them
taller — `{ rowHeight: 40, headerHeight: 70 }`, Angular `[headerHeight]="70"`, `<dz-grid header-height="70">`. It
sets the column headers' row and the column-group rows above it (a 70 px header with one group row is 140 px); the
filter row keeps the row height. It follows the text zoom as rows do; vertical titles still grow the row when they
need more. The grid writes it on its root as `--dzg-header-height` (read-only, as `--dzg-row-height`).

## Right to left

Direction is designed in: pinned columns, scrolling, the arrow keys (in Arabic, → moves toward the start, which is on the right), popups, the
tree's indent and the theme all follow it. Everything in DzGrid speaks of **start** and **end**, never left and right:
`pinned: 'start'`, `align: 'end'`, the dock's `start` area.

```ts
import { createGrid } from '@dzgrid/dom';
import { AR } from '@dzgrid/dom/locales/ar';

type Souk = { id: string; name: string; stalls: number };

const grid = createGrid<Souk>(document.getElementById('souks')!, {
  rows: [{ id: 's1', name: 'سوق النجوم', stalls: 48 }],
  columns: [
    { id: 'name', header: 'السوق', pinned: 'start' },
    { id: 'stalls', header: 'الدكاكين', type: 'number', align: 'end' },
  ],
  getRowId: (s) => s.id,
  messages: AR,
  locale: 'ar-DZ',
  direction: 'rtl',
  numerals: 'locale',
});

grid.update({ direction: 'auto' });   // follow the nearest `dir` attribute instead
```

- `direction`: `'ltr'`, `'rtl'`, or `'auto'` (the nearest ancestor's `dir`).
- `numerals: 'locale'` shows the language's own digits (Arabic-Indic for `ar`); the default `'latn'` keeps 0–9.
- Sorting and searching follow the language: hamza forms, short vowels and tatweel, Arabic-Indic digits.
- Your own CSS should use logical properties as well: `margin-inline-start`, `inset-inline-end`, `text-align: start`.
- Three languages ship: `EN`, `FR`, `AR` (`@dzgrid/dom/locales/*`), each feature with its own bundle, plural rules
  included. Another language is a `GridMessages` object of your own with the same keys; `checkMessages(messages)` throws,
  naming the keys that are missing.
