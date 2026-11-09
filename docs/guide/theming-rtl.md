# Theming and right to left

## The theme

`@dzgrid/dom` injects the grid's layout CSS by itself; `@dzgrid/theme` makes it presentable (colours, lines, header,
hover, selection, focus, popups), light and dark, checked for contrast. Each feature with a look has its own sheet,
loaded after `dzgrid.css`: `columns.css`, `menu.css`, `grouping.css`, `pivot.css`, `edit.css`, `range.css`,
`fill.css`, `dock.css`, `columns-panel.css`, `filters-panel.css`, `find.css`, `search.css`, `print.css`,
`row-drag.css`, `pinned-rows.css`, `row-numbers.css`, `fresh-rows.css`.

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
`--dzg-line`, `--dzg-pill-radius`, `--dzg-header-size`, `--dzg-select-bar`, `--dzg-flash`, `--dzg-flash-color`.

```css
:root { --tz-accent: light-dark(#7c3aed, #c4b5fd); }
.dzg { --dzg-radius: 6px; --dzg-font: "Atkinson Hyperlegible", system-ui, sans-serif; }
.dzg-cell.is-late { color: var(--tz-danger); }
```

**Light and dark** follow the system; `data-theme="light"` or `data-theme="dark"` on any ancestor forces one.

**Row height** comes from the `density` setting (`compact` 28 px, `comfortable` 32 px, the default, `spacious` 40 px)
or `rowHeight` in pixels, which wins. Rows follow the reader's text zoom. The column menu can offer the density to the
user (`columnMenu({ density: true })`), and the [state](state.md) keeps it.

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
