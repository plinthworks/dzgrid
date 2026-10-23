# Un thème en 3 lignes

How to give DzGrid your application's look in a few lines, with plain CSS, a showcase theme, Tailwind CSS
4 or 3, or Bootstrap 5.3. Each framework setup below is a file the browser suite builds with the real
tool and checks in Chrome, light and dark (`npm run test:browser -- --only themes`; the files are in
`packages/theme/test/frameworks/`, a test checks this page quotes them). The contract behind them:
`docs/behaviors/theming.md`.

Two things to know first:

- The grid's CSS sits in the cascade layer `dzgrid`. Your own classes win over it without `!important`,
  as long as `dzgrid` comes before them: a framework that layers its CSS gets one order line, first.
- A bridge (`tailwind.css`, `tailwind3.css`, `bootstrap.css`) maps the grid's ten colours, its font and
  its corners to your framework's variables: change your framework's colours and the grid follows, dark
  mode included. A bridge wins over a showcase theme: with a bridge, the grid wears your framework's
  colours; to show Midnight or Clinic, load no bridge.

## Plain CSS

```css
@import "@dzgrid/theme";
:root {
  --tz-accent: light-dark(#0f766e, #5eead4);
}
```

Each colour is a `light-dark()` pair. The ten are `--tz-bg`, `--tz-bg-raised`, `--tz-fg`, `--tz-fg-muted`,
`--tz-border`, `--tz-accent`, `--tz-accent-fg`, `--tz-danger`, `--tz-warning`, `--tz-success`: set the
first four or five, and the others when your surface is far from grey. `npm run check:contrast --
--palette yours.json` checks every pair the grid draws.

## A showcase theme

```css
@import "@dzgrid/theme";
@import "@dzgrid/theme/midnight.css";
```

`midnight.css` (dark and elegant, with a light twin) or `clinic.css` (light and calm, with a dark twin).
Not with a bridge: a framework's bridge wins over a showcase theme.
`data-dzg-skin="midnight"` on a container themes only that area.

## Tailwind CSS 4

In the CSS file Tailwind builds:

```css
@layer theme, base, dzgrid, components, utilities;
@import "tailwindcss";
@import "@dzgrid/theme";
@import "@dzgrid/theme/tailwind.css";
```

- The bridge must go **through Tailwind**: Tailwind emits only the theme variables it sees used, and
  sees those the bridge reads only when it imports it. Linked beside Tailwind's output (a `<link>`, a
  JavaScript import), the grid loses its colours.
- **Without the order line**, `dzgrid` lands after Tailwind's `utilities` and the grid beats your
  utility classes.
- Dark mode follows the system. With a `.dark` class instead, tell Tailwind (its `dark:` variants then
  follow the class) and the grid (the bridge turns dark on `.dark`, but without it would follow a dark
  system; the last line keeps it light then):

```css
@layer theme, base, dzgrid, components, utilities;
@import "tailwindcss";
@import "@dzgrid/theme";
@import "@dzgrid/theme/tailwind.css";
@custom-variant dark (&:where(.dark, .dark *));
:root:not(.dark) { --tz-color-scheme: light; }
```

The accent is your `--color-primary-600` / `-400` when your `@theme` has them, Tailwind's blue otherwise.

Classes where the grid takes them: a negative amount, a highlighted row (it sets `--tz-bg`, so the
pinned columns follow and the hover tint mixes into it), a status pill per tone, a header.

```ts
import { badge } from '@dzgrid/dom/parts';

createGrid(host, {
  // …rows, getRowId, messages
  columns: [
    { id: 'city', ui: { headerClass: 'uppercase tracking-wide' } },
    { id: 'amount', type: 'number', ui: { cellClass: ({ value }) => (value < 0 ? 'text-red-700 dark:text-red-400' : null) } },
    { id: 'status', type: 'enum', enumOptions, ui: { cell: 'status' } },
  ],
  rowClass: ({ row }) => (row.flagged ? '[--tz-bg:var(--color-amber-50)] dark:[--tz-bg:var(--color-amber-950)]' : null),
  parts: {
    status: badge({
      tones: { paid: 'success', late: 'danger' },
      classes: { danger: 'bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100', success: 'bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100' },
    }),
  },
});
```

## Tailwind CSS 3

Tailwind 3 has no colour variables: the bridge reads its theme through `theme()`, so Tailwind's build
must process it. Its preflight is unlayered, so the grid's unlayered copy goes after it and before the
utilities:

```css
@import "tailwindcss/base";
@import "@dzgrid/theme/dzgrid.unlayered.css";
@import "@dzgrid/theme/tailwind3.css";
@import "tailwindcss/components";
@import "tailwindcss/utilities";
```

Dark mode follows the system (`darkMode: 'media'`, the default) or a `.dark` class (`'class'`,
`'selector'`; then add `:root:not(.dark) { --tz-color-scheme: light; }` after the bridge, or a dark
system would darken the grid on a light page). The accent is Tailwind's blue: put your own after the bridge,
`:root { --tz-accent: light-dark(theme('colors.teal.700'), theme('colors.teal.300')); }`.

```ts
columns: [
  { id: 'city', ui: { headerClass: 'uppercase tracking-wide' } },
  { id: 'amount', type: 'number', ui: { cellClass: ({ value }) => (value < 0 ? 'text-red-700 dark:text-red-400' : null) } },
],
rowClass: ({ row }) => (row.flagged ? '[--tz-bg:theme(colors.amber.50)] dark:[--tz-bg:theme(colors.amber.950)]' : null),
parts: {
  status: badge({
    tones: { paid: 'success', late: 'danger' },
    classes: { danger: 'bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100', success: 'bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100' },
  }),
},
```

## Bootstrap 5.3

Bootstrap's CSS is unlayered: put it in a layer before the grid's.

```css
@layer bootstrap, dzgrid;
@import "bootstrap/dist/css/bootstrap.css" layer(bootstrap);
@import "@dzgrid/theme";
@import "@dzgrid/theme/bootstrap.css";
```

Or keep Bootstrap unlayered (an Angular `styles` array, a `<link>`) and use the grid's unlayered copy
after it:

```css
@import "bootstrap/dist/css/bootstrap.css";
@import "@dzgrid/theme/dzgrid.unlayered.css";
@import "@dzgrid/theme/bootstrap.css";
```

Light and dark follow `data-bs-theme`, on the root or on any container: a `data-bs-theme="light"`
container inside a `"dark"` page draws its grid light, and the reverse, as Bootstrap's components do. The accent is Bootstrap's link
hover colour (its primary one shade deeper: Bootstrap's primary itself falls under 3:1 for a mark on a
selected row). Bootstrap's utilities carry `!important`: they win in both setups.

```ts
columns: [
  { id: 'city', ui: { headerClass: 'text-uppercase' } },
  { id: 'amount', type: 'number', ui: { cellClass: ({ value }) => (value < 0 ? 'text-danger-emphasis' : null) } },
],
rowClass: ({ row }) => (row.flagged ? 'row-flagged' : null),
parts: {
  status: badge({
    tones: { paid: 'success', late: 'danger' },
    classes: { danger: 'bg-danger-subtle text-danger-emphasis', success: 'bg-success-subtle text-success-emphasis' },
  }),
},
```

Bootstrap has no utility that sets a variable, so the highlighted row takes one line of your CSS:

```css
.row-flagged { --tz-bg: var(--bs-warning-bg-subtle); }
```

## Angular

An `angular.json` `styles` array cannot name layers: with Bootstrap, list
`node_modules/bootstrap/dist/css/bootstrap.css`, `node_modules/@dzgrid/theme/dzgrid.unlayered.css`,
`node_modules/@dzgrid/theme/bootstrap.css`, in this order. With Tailwind, the lines above go in the
`styles.css` Tailwind builds. `headerClass`, `cellClass` and `badge({ classes })` ride on the columns and
parts as above; `<dz-grid [rowClass]="rule">` takes the row rule.

## Where classes go

| Hook | On | Told |
|---|---|---|
| `columns[].ui.cellClass(ctx)` | a body cell | its value, text, row, key, column, `context` |
| `rowClass(ctx)` (setting) | a data row (not a tree's filler, not a detail) | its row, key, `context` |
| `columns[].ui.headerClass` | the column's header cell | a fixed string |
| `badge({ classes })` | a status pill, by its tone | — |

Space-separated names; `dzg-` names are the grid's and ignored. Give `rowClass` the same function at
each update (not an inline arrow): a new function binds every row again. A class changes only what it sets:
contrast between the text and the surface you give is yours to keep (the examples above pass AA, light
and dark, in the browser suite).
