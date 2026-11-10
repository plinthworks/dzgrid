# Getting started with the Web Component

`@dzgrid/element` defines `<dz-grid>` for plain HTML, a CMS, or any framework that can write a tag (React 19, Vue,
Svelte…). It is the grid of `@dzgrid/dom`, drawn in the page (no shadow root, so the theme and your own CSS reach
it); its settings are properties and attributes, its events `dzg-*` DOM events.

An Angular application uses `@dzgrid/angular` instead: both name their tag `<dz-grid>`. A page that needs both defines
the element under another name with `defineDzGrid('dz-grid-wc')`.

## Install

```sh
npm install @dzgrid/core @dzgrid/dom @dzgrid/theme @dzgrid/element
```

## A first grid

```html
<link rel="stylesheet" href="/node_modules/@dzgrid/theme/dzgrid.css">
<style>dz-grid > .dzg { block-size: 420px; }</style>

<dz-grid locale="en-GB" density="compact" label="Moons"></dz-grid>

<script type="module">
  import '@dzgrid/element/define';
  import { EN } from '@dzgrid/dom/locales/en';

  const grid = document.querySelector('dz-grid');
  grid.columns = [{ id: 'name', header: 'Moon' }, { id: 'found', header: 'Found', type: 'day' }];
  grid.getRowId = (m) => m.id;
  grid.messages = EN;
  grid.rows = [{ id: 'm1', name: 'Quill', found: '2023-05-30' }];
  grid.addEventListener('dzg-row-clicked', (e) => console.log(e.detail.row.key));
</script>
```

The grid is drawn once the element is in the page and has `columns`, `getRowId` and `messages`. The element has no
box of its own (`display: contents`, as Angular's host, in a flex parent too): give its parent a height and the grid
fills it, whatever its row count — or size the grid itself: `dz-grid > .dzg { block-size: … }`. A page that styles
the element's `display` keeps its own.

## In TypeScript

The element class is generic over the row type; ask `querySelector` for it.

```ts
import '@dzgrid/element/define';
import type { DzGridElement } from '@dzgrid/element';
import type { GridEvent } from '@dzgrid/core';
import { filters } from '@dzgrid/dom/filters-base';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_FILTERS } from '@dzgrid/dom/locales/en-filters';

type Moon = { id: string; name: string; radius: number };

const grid = document.querySelector<DzGridElement<Moon>>('dz-grid')!;
grid.columns = [{ id: 'name', header: 'Moon' }, { id: 'radius', header: 'Radius (km)', type: 'number' }];
grid.getRowId = (m) => m.id;
grid.messages = { ...EN, text: { ...EN.text, ...EN_FILTERS.text } };
grid.features = [filters()];
grid.settings = { selection: { mode: 'single' } };
grid.rows = [{ id: 'm1', name: 'Quill', radius: 812 }];

grid.addEventListener('dzg-sort-changed', (e) => {
  const event = (e as CustomEvent<GridEvent<Moon>>).detail;
  console.log(event.type);
});

await grid.ready;   // resolved when first drawn
grid.grid?.kernel.dispatch({ type: 'quick.set', text: 'quill' }, 'api');
```

## Properties

| Property | What it is |
|---|---|
| `rows`, `source`, `columns`, `getRowId`, `messages`, `features`, `parts` | As `createGrid`'s settings. Live (by identity), except `getRowId` and `features`, read when the grid is made. |
| `settings` | Every other setting (`selection`, `context`, `rowClass`, `pagination`…), compared key by key. |
| `env` | The `GridEnv`, read when the grid is made. |
| `grid` | The `GridInstance` (`kernel`, `api`, `update`) while drawn; `null` otherwise. |
| `ready` | A promise: resolved when first drawn, rejected when the settings are refused. |
| `problems` | The last 100 problems told. |
| `update(patch)` | Same as `grid.update(patch)`. |

Parts are functions made with `definePart` from `@dzgrid/dom`; `<template>` children are not read.

## Attributes

Live, and they win over `settings`; removing one puts the setting back to its default. A value the element cannot
read is left out and reported (`invalid-setting`, path `attribute:<name>`).

`locale`, `time-zone`, `numerals` (`latn` | `locale`), `direction` (`auto` | `ltr` | `rtl`; without it the grid follows
the element's `dir`), `density` (`compact` | `comfortable` | `spacious`), `row-height`, `header-height`, `label`, `overlay` (`loading` |
`error`), `busy`, `motion`, `multi-sort` (read when the grid is made). Booleans: present or `"true"` is on, `"false"` off.

## Events

Every grid event is dispatched on the element as `dzg-` plus its type in kebab case, with the event itself as
`detail`: `dzg-cell-clicked`, `dzg-row-clicked`, `dzg-selection-changed`, `dzg-sort-changed`, `dzg-filter-changed`,
`dzg-row-move`, `dzg-state-changed`, `dzg-problems`… They bubble and are composed. `dzg-ready` follows each making
of the grid. The events of the grid's first drawing come a microtask later, so a listener added right after the last
property still hears them.

## In a framework

React 19 and Vue pass properties to custom elements: bind `columns`, `rows`, `getRowId` and `messages` as
properties, listen to `dzg-*` events. Keep `features` and `getRowId` stable (outside the render function, or memoised):
they are read once.
