# The grid as a Web Component (`<dz-grid>`)

Written before the code (CLEANROOM). Sources: the HTML Standard on custom elements (`customElements.define`, the
`connectedCallback` / `disconnectedCallback` / `attributeChangedCallback` reactions, upgrades of elements parsed before
their definition), the DOM Standard's `CustomEvent`, and our own sister project DzCalendar's `@dzcalendar/element`
(`<dz-calendar>`), whose conventions this follows. Plan Phase 11 L7; owner Q3 A (a Web Component, as DzCalendar).
Package: `@dzgrid/element` (entries `@dzgrid/element`, `@dzgrid/element/define`).

## What the user does
A page with no framework (or React, Vue, Svelte…) writes `<dz-grid locale="fr-FR" density="compact"></dz-grid>`,
imports `@dzgrid/element/define` and the theme, and gives the element its columns, rows, row id and texts as
properties. It listens to `dzg-*` events.

## What they observe
- The same grid as `createGrid` draws, with the theme's look: the element lives in the page (no shadow root).
- Changing an attribute or a property changes the grid in place (sort, filter, focus and scroll stay).
- Removing the element from the page frees the grid; putting it back draws it again.

## Behaviours (numbered, each one a test)
1. **Definition.** `@dzgrid/element` defines nothing. `defineDzGrid(name = 'dz-grid')` defines the element under
   `name`, once (a second call, or a name already taken, does nothing). `@dzgrid/element/define` calls it with
   `dz-grid` and re-exports `DzGridElement` and `defineDzGrid`. The tag name is Angular's `<dz-grid>` selector too:
   an Angular application uses `@dzgrid/angular`, and a page holding both defines the element under another name
   (`defineDzGrid('dz-grid-wc')`). An element that finds a grid already drawn as its direct child (`:scope > .dzg`,
   Angular's) leaves it alone and tells `invalid-setting`, path `element`, detail `already-a-grid`.
2. **Server-safe.** Importing either entry where `HTMLElement` and `customElements` do not exist (Node, a server
   render) never throws; defining does nothing there.
3. **Properties.** `rows`, `source`, `columns`, `getRowId`, `messages`, `features`, `parts`, `theme`, `icons` (1.9.0, presentation-settings.md; with `theming()`), `env` (the `GridEnv`,
   read when the grid is made) and `settings` (every other `GridSettings` key: `selection`, `context`, `rowClass`,
   `pagination`, `operations`…). The grid is made when the element is connected and has `columns`, `getRowId` and
   `messages` (the grid bundles no language, D1); before that nothing is drawn and nothing is told (a framework sets
   properties in any order). Properties set before the element was defined (a framework rendering first) are taken.
4. **Live.** After the grid is made, a property set to a new value (by identity, `Object.is`) is one `update()` of
   the keys that changed; `settings` is compared key by key (a framework handing a new object each render with the
   same values changes nothing). Fixed keys (`getRowId`, `features`, `operations`, `pagination`, `filterKinds`,
   `clock`, `injectStyles`, `nonce`, `multiSort`, `sameRow`) changed later are the grid's own
   `unsupported-live-change`, as with `update()`; `env` changed later is ignored (read once).
5. **Attributes** (live; they win over `settings`): `locale`, `time-zone`, `numerals` (`latn` | `locale`),
   `direction` (`auto` | `ltr` | `rtl`), `density` (`compact` | `comfortable` | `spacious`), `row-height` (a number),
   `label`, `overlay` (`loading` | `error`), `busy`, `motion`, `multi-sort` (fixed, read when the grid is made). A
   boolean attribute is on when present (or `"true"`), off with `"false"`. Taken away, the setting goes back to the
   grid's default (the key is updated to `undefined`). A value the element cannot read — an unknown word, a locale
   or zone `Intl` refuses, a `row-height` empty or not a number — is left out and told: `invalid-setting`, severity `warning`, path `attribute:<name>`,
   detail the raw value (an attribute is the page's markup, never row data). A row height out of range is the grid's
   own warning (`settings.rowHeight`).
6. **Direction.** Without `direction` the grid follows the element's own direction: `<dz-grid dir="rtl">`, or a
   `dir` on any ancestor, and its changes (`direction: 'auto'`).
7. **Events.** Every grid event is re-dispatched on the element as a `CustomEvent` named `dzg-` + its type in
   kebab case — `cellClicked` → `dzg-cell-clicked`, `rowMove` → `dzg-row-move`, `selectionChanged` →
   `dzg-selection-changed`, `problems` → `dzg-problems` — whose `detail` is the grid's event object unchanged. One
   rule, no list: an event a later feature adds gets its name the same way. They bubble and are composed; none is
   cancelable. `settings.onEvent`, when given, is called after the element dispatched.
8. **The element's own problems** (rules 1, 5, 11) are `dzg-problems` too, with the same detail shape
   (`{ type: 'problems', source: 'host', problems }`). Events heard while the grid is being made (its creation
   problems) are dispatched a microtask later, in order: a page that listens right after setting the last property
   hears them. `problems` holds the last 100 problems seen, for a page that listened late.
9. **Ready.** `ready` is a promise resolved once the grid is first made, and a `dzg-ready` event (detail
   `{ grid }`) is dispatched then (after the creation events of rule 8). `grid` is the `GridInstance` (its `kernel`,
   `api`, `update`) while drawn, null otherwise. `update(patch)` is `grid.update` (nothing before the grid exists).
10. **Disconnect and reconnect.** Taken out of the document, the element destroys its grid a microtask later,
    unless it was put back in the meantime (a move within the page keeps the grid, its sort and scroll; what was
    changed while it was out — an attribute, a property — reaches the grid when it is put back). Put back
    later, it makes a new grid from the same properties and attributes (what the user changed since — sort, filter,
    scroll — is not kept; `gridState()` with `persist` keeps it), and `dzg-ready` is dispatched again.
11. **Bad input never throws.** A property of the wrong kind (`columns` not a list, `settings` not an object…) is
    refused and told: `invalid-setting`, severity `error`, path `property:<name>`. A grid `createGrid` refuses (its
    texts incomplete) is not drawn (the element's own children, text included, are kept), told (`invalid-setting`, path `element`, detail `refused`) and `ready` rejects
    with that error; an `update` the grid refuses (it throws) is told the same way with path `update`.
12. **Light DOM only.** The grid is drawn inside the element, in the page: the theme's sheets (`@dzgrid/theme`,
    cascade layers), Tailwind or Bootstrap, the page's own rules and `--tz-*` / `--dzg-*` variables apply as they
    do to `createGrid`. Not in a shadow root, because the grid's popups (filter, column menu, context menu) and the
    print table are placed in the document, its layout sheet is injected once per document, and a theme would have
    to be linked again inside every shadow root; a shadow root would split the grid from them.
13. **Display.** The element has no box of its own, as Angular's host: the grid's box is laid out by the element's
    parent and fills it whatever its rows (virtual-scroll.md « The grid's height comes from its container »), or is
    sized itself (`dz-grid > .dzg { block-size: … }`). Connected, the element marks itself `data-dzg-host`; the layout
    sheet's `:where([data-dzg-host]) { display: contents }` (zero specificity, layer `dzgrid.layout`) reads the mark,
    also under a flex or grid parent, which makes an unknown element a block (1.11.0: before, the element stayed a
    block there and its grid did not fill the host). An element still displayed `inline` before that sheet is in the
    page is given `display: contents` inline. A page that styles the element's `display` itself keeps its own (any
    page rule wins over the layer's). Angular's host takes `display: contents` inline, always.
14. **Parts are functions.** Cells, headers, editors and the other slots take parts made with `definePart`
    (`parts` property, or a feature's own), as with `createGrid`. `<template>` children are not read: a template
    would need a binding language of its own (which field into which node, events, cleanup) that the grid does not
    have; a part is a few lines and builds nodes, never HTML from data. Other children of the element are left as they
    are, beside the grid.
15. **`reload()`** (1.12.0, reload.md 5): the element's method asks the data again — its grid's `api.reload()`;
    nothing before the grid exists. `grid.api.refresh()` only paints.
