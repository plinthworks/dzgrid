# @dzgrid/element

[DzGrid](https://github.com/plinthworks/dzgrid) as a Web Component: `<dz-grid>` for plain HTML, a CMS, React 19, Vue,
Svelte or anything that can write a tag. The grid of `@dzgrid/dom`, drawn in the page (the theme applies), its
settings as properties and attributes, its events as `dzg-*` DOM events. No framework, no dependency.

## Install

```sh
npm install @dzgrid/core @dzgrid/dom @dzgrid/theme @dzgrid/element
```

## A first grid

```html
<link rel="stylesheet" href="/node_modules/@dzgrid/theme/dzgrid.css">
<style>dz-grid > .dzg { block-size: 480px; }</style>

<dz-grid locale="fr-FR" density="compact" label="Patients"></dz-grid>

<script type="module">
  import '@dzgrid/element/define';
  import { FR } from '@dzgrid/dom/locales/fr';

  const grid = document.querySelector('dz-grid');
  grid.columns = [{ id: 'name', header: 'Nom' }, { id: 'born', header: 'Né le', type: 'day' }];
  grid.getRowId = (p) => p.id;
  grid.messages = FR;
  grid.rows = [{ id: 'p1', name: 'Amina', born: '1990-04-12' }];
  grid.addEventListener('dzg-row-clicked', (e) => console.log(e.detail.row.key));
</script>
```

The grid is drawn once the element is in the page and has `columns`, `getRowId` and `messages` (the grid bundles no
language). The element is `display: contents`, as Angular's host: size the grid with `dz-grid > .dzg { block-size: … }`.

## Entries

| Import | What it gives |
|---|---|
| `@dzgrid/element/define` | Side effect: defines `<dz-grid>` for the page. Also exports `DzGridElement`, `defineDzGrid`. |
| `@dzgrid/element` | `DzGridElement` and `defineDzGrid(name = 'dz-grid')`. Defines nothing; never throws on a server. |

`<dz-grid>` is also `@dzgrid/angular`'s selector: an Angular application uses `@dzgrid/angular`. A page holding both
defines the element under another name: `defineDzGrid('dz-grid-wc')`.

## Properties

| Property | What it is |
|---|---|
| `rows`, `source`, `columns`, `getRowId`, `messages`, `features`, `parts` | As `createGrid`'s settings. Live (by identity), but `getRowId` and `features`. |
| `settings` | Every other setting (`selection`, `context`, `rowClass`, `pagination`…), compared key by key. |
| `env` | The `GridEnv`, read when the grid is made. |
| `grid` | The `GridInstance` (`kernel`, `api`, `update`) while drawn; null otherwise. |
| `ready` | A promise: resolved when first drawn; rejected when refused. |
| `problems` | The last 100 problems told. |
| `update(patch)` | `grid.update(patch)`. |

Parts are functions made with `definePart` (`@dzgrid/dom`), as with `createGrid`; `<template>` children are not read.

## Attributes

Live; they win over `settings`; taken away, the setting goes back to its default. A value the element cannot read is
left out and told (`invalid-setting`, path `attribute:<name>`).

`locale`, `time-zone`, `numerals` (`latn` | `locale`), `direction` (`auto` | `ltr` | `rtl`; without it the grid
follows the element's `dir`), `density` (`compact` | `comfortable` | `spacious`), `row-height`, `label`, `overlay`
(`loading` | `error`), `busy`, `motion`, `multi-sort` (read when made). Booleans: present or `"true"` is on, `"false"` off.

## Events

Every grid event is dispatched on the element as `dzg-` + its type in kebab case, `detail` the event unchanged:
`dzg-cell-clicked`, `dzg-row-clicked`, `dzg-selection-changed`, `dzg-sort-changed`, `dzg-filter-changed`,
`dzg-row-move`, `dzg-state-changed`, `dzg-problems`… They bubble and are composed. `dzg-ready` (`{ grid }`) follows
each making of the grid. Events of the grid's making come a microtask later, so a page listening right after setting
the last property hears them.

## In the page, not in a shadow root

The theme's sheets, Tailwind or Bootstrap and the page's own rules reach the grid as they do with `createGrid`. The
grid's popups and its print table are placed in the document and its layout sheet is injected once per document: a
shadow root would split the grid from them.

Behaviour sheet: `docs/behaviors/web-component.md`.

## License

MIT
