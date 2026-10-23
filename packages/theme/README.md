# @dzgrid/theme

An optional stylesheet for [DzGrid](https://github.com/plinthworks/dzgrid): colours, spacing and
interaction states (header, hover, selection, focus, filters, popups), light and dark, more
contrast, forced colours. Plain CSS, no JavaScript. The grid's layout CSS is injected by
`@dzgrid/dom`; this package only makes it presentable. Every text and part is checked for contrast.

## Import

```ts
import '@dzgrid/theme';             // the same file as '@dzgrid/theme/dzgrid.css'
import '@dzgrid/theme/contrast.css'; // optional: more contrast (see below)
```

From CSS: `@import "@dzgrid/theme/dzgrid.css";`. With Sass, `@use "@dzgrid/theme/dzgrid"` gives
the source, whose `$tz-palette` map can be overridden with `with (...)`.

In Angular, add `node_modules/@dzgrid/theme/dzgrid.css` to the `styles` of `angular.json`.

## Showcase themes

Two optional themes, each one more import (or one attribute on an area):

```ts
import '@dzgrid/theme';
import '@dzgrid/theme/midnight.css'; // dark elegant, with a light twin
// or '@dzgrid/theme/clinic.css';    // light medical, with a dark twin
```

Imported, a theme styles every grid of the page; `data-dzg-skin="midnight"` (or `"clinic"`) on any
container styles only that area, so both can stand side by side (the last file imported themes the
page). Light and dark follow the system or `data-theme`, as below. Every colour is given by hand and
checked for contrast; more contrast (below) still wins over them.

## Cascade layer

The theme's rules sit in the cascade layer `dzgrid` (each file opens with
`@layer dzgrid.layout, dzgrid.theme, dzgrid.skin, dzgrid.bridge, dzgrid.contrast;`), and so does the layout
`@dzgrid/dom` injects. Your own classes win over the grid's look without `!important`. If you layer your
own CSS, name the order once, first: e.g. `@layer theme, base, dzgrid, components, utilities;`.

If an unlayered reset of yours (Tailwind 3's preflight, Bootstrap's Reboot) would beat the layered
grid, import `@dzgrid/theme/dzgrid.unlayered.css` (and `contrast.unlayered.css`) instead: the same rules
outside the layer.

## CSS variables

The palette is tzslot's: a page that themes tzslot themes the grid. Each colour is a
`light-dark()` pair declared on `:root`.

| Variable | Used for |
| --- | --- |
| `--tz-bg`, `--tz-bg-raised` | the grid's surface, headers and popups |
| `--tz-fg`, `--tz-fg-muted` | text, secondary text |
| `--tz-border` | lines between cells, popups |
| `--tz-accent`, `--tz-accent-fg` | focus, selection, primary buttons |
| `--tz-danger`, `--tz-warning`, `--tz-success` | errors, refused edits, badges |

What the grid derives can be set on any ancestor of `.dzg` (each has a fallback on the palette):
`--dzg-font`, `--dzg-radius`, `--dzg-row-height`, `--dzg-cell-padding-inline`, `--dzg-header-bg`,
`--dzg-row-hover-bg`, `--dzg-row-selected-bg`, `--dzg-focus-ring`, `--dzg-stale-fg`,
`--dzg-refused-bg`, `--dzg-flash`, `--dzg-flash-color`, `--dzg-line` (rule width), `--dzg-pill-radius`,
`--dzg-header-size`, `--dzg-header-tracking` (none in Arabic), `--dzg-select-bar` (a selected row's bar
at its start, 0 by default).

```css
:root {
  --tz-accent: light-dark(#0f766e, #5eead4);
  --dzg-row-height: 2.25rem;
}
```

## Light and dark

By default the grid follows the system (`color-scheme: light dark`). To force one, set
`data-theme="light"` or `data-theme="dark"` on the root or on any ancestor of the grid. With
Tailwind v4, `@import "@dzgrid/theme/tailwind.css"` after the theme maps the palette to Tailwind's
colours and follows a `.dark` class.

## More contrast and forced colours

`contrast.css` switches to a high-contrast palette when the system asks for more contrast
(`prefers-contrast: more`) or under `data-contrast="more"`; `data-contrast="normal"` on the root
opts out. In forced-colours mode (Windows High Contrast) the theme uses the system's colours.

## Licence

MIT. See [LICENSE](LICENSE).
