# Angular: the grid as a component, parts as components and templates (`@dzgrid/angular`, step 22)

Plan: `docs/phase-3-steps/step22-angular-blueprint.md`; decisions: `step22-decisions.md` (Q1–Q4, they win).

## What the user does
Nothing different from the plain grid: they scroll, sort, filter, search, tick rows and press the buttons an application drew in its cells, headers, overlay, floating row and footer. The application is written in Angular.

## What they observe
- The grid looks and behaves exactly as `createGrid` does (same DOM, same keys, same right to left, same announcements): the wrapper adds no element of its own around it (its host takes no box).
- A cell drawn by an Angular component or template keeps its state while the list scrolls; a button in it keeps its focus while its row stays retained; nothing flickers.
- A button the application drew in a cell does what the application says (opens a record, flags a row) for the row it was drawn for, even after the cell was reused for another row.
- One broken cell component costs that cell only: it is empty, the rest paints.
- Pressing a search field or an export button the application placed outside the grid drives the grid's quick search or CSV export.

## What DzGrid does
- **`<dz-grid>`** (standalone, OnPush, signal inputs, `exportAs: 'dzGrid'`). Required: `columns`, `getRowId`; `messages` is required unless `provideDzGrid({ messages })` gave it (a tag binding wins). Live inputs, passed to `update()` only when their identity changed: `rows`, `source`, `columns`, `messages`, `locale`, `timeZone`, `numerals`, `direction`, `density`, `overlay`, `label`, `tooltips`, `overscan`, `searchWarmup`, `selection` (mode, checkbox, `canSelect`), `context`, `fullWidth`, `parts`. Fixed, taken at creation: `getRowId`, `operations`, `pagination`, `filterKinds`, `clock`, `injectStyles`, `nonce`, `features`; a later change is refused by the grid (`unsupported-live-change`, an error problem), as `update()` does. `T` is inferred from `[rows]` (and `[columns]`, `[getRowId]`). `rowHeight` (owner D1, D3) is a live input too, and a `provideDzGrid` default (`@dzgrid/angular` 6 323 B gz, budget 6 350).
- **The host element** takes no box: its `display` is `contents`, set through the CSSOM (a strict CSP allows it), so the grid's root sizes against the application's container.
- **Models** (`[(quick)]`, `[(filter)]`, `[(selected)]`; `[(expanded)]` below): unset (undefined), the grid owns its state; set, the application's value is written to the grid as the host (`quick.set`, `filter.set`, `selection.set`), and what the user (or the data) changes comes back into the model. A value equal to the grid's state is not written again (no echo loop). When the grid drops what the model holds because of the host itself (a narrower `[selection]` mode, a `[(filter)]` write that clears the selection), the `selected` model follows the grid; the host's own write is never echoed. If `[messages]` becomes undefined after creation and no provider gives a bundle, the bundle in force stays. The selection's model is `selected` because `selection` is the settings input (mode, checkbox, rule).
- **Outputs:** `gridEvent` (every event), `cellClicked`, `rowClicked`, `cellAction`, `partAction`, `fetchFailed`, `rowExpanded` (step 11), `problems` (each problem batch), `gridReady` (the controller, once the grid exists). They are emitted in Angular's zone when the application has one; never after the component is destroyed.
- **Controller `DzgController<T>`** (injectable inside the grid: parts, templates, children): signals `ready()` and `kernel()` (null before the grid exists, after it is gone and on a server; set from the first paint on, so a part's init already sees the grid ready and can dispatch); `focusCell`, `ensureVisible`, `refresh` and `announce` act once that first paint is over; `dispatch(command)` (as the API), `focusCell`, `ensureVisible`, `refresh`, `announce`, `openFilter(column)` / `closeFilter()` (through the `filters()` feature given in `features`; false / nothing without it).
- **`provideDzGrid({ messages?, parts?, defaults? })`**: an application's settings once (`defaults`: `locale`, `timeZone`, `direction`, `density`, `numerals`); a binding on the tag wins. Tokens `DZG_MESSAGES`, `DZG_PARTS`, `DZG_DEFAULTS`.
- **A part as a component:** `componentPart(slot, Component)` makes a registry entry, like `definePart`. The component receives its slot's whole context in one signal input named **`cell`**, whatever the slot (owner Q2): a `header` component reads `cell().label`, `cell().filter`, `cell().toggleSort`; a `footer` component `cell().page`. The interface `DzgPartComponent<S>` (and `DzgCell` for cells) types it.
- **A part as a template:** `<ng-template dzgPart="name" slot="header" let-c>…</ng-template>` inside `<dz-grid>` registers the template under `name` for that slot (`cell` by default); `c` is the slot's context (typed by the `slot`), also available as `let-c="cell"`.
- **`emit`:** every Angular part's context carries `emit(name, detail?)`. In a cell it sends the grid event `cellAction { column, key, name, detail }` (source `user`) for the row and column the cell shows **at the moment of the call** (a reused cell sends its new row's key); in any other slot `partAction { slot, column, name, detail }` (`column` null for the overlay and the footer). An emit during the grid's first paint (a part's init) is heard like any other. A template whose `slot` changes is bound again for its new slot. Both reach `(gridEvent)`, their own output and the grid's `onEvent` subscribers. Plain DOM parts do not get it (zero bytes in the core and the DOM layer).
- **Registry order** (the later wins a name): the features' parts, `provideDzGrid({ parts })`, `[parts]`, then the `dzgPart` templates. A name a later layer takes from an earlier one is the warning **`part-shadowed`** at `parts.<name>`, the detail naming the layer hidden (`feature`, `provider`, `parts`), told once per name per grid. A name given twice inside one layer (two `dzgPart` templates, two features) is told the same way, the detail naming that layer (`template`, `feature`): of two templates the last wins, of two features the first.
- **Mounting (S6's pool):** a part mounts once per pooled host: the component is created with the application's environment and the grid's element injector (so it can inject `DzgController` and `DzGrid`), its view attached to the application (signals it reads keep it current), its input set, checked once, its element appended to the host. A rebind of the cell to another row gives the same instance a new `cell` value and checks that view only; a rebind that changes nothing the part sees does not reach it (the grid's rule). A template's view is created once and its context replaced on rebind.
- **Destroyed with its host:** the view is detached and destroyed, its nodes removed, when the grid destroys the part (the column leaves the window, the registry changes, a throw, the grid's end). Mounts equal destroys once `<dz-grid>` is destroyed.
- **A component that throws** (in its constructor, its first check or a later one) follows the grid's rule: that cell is empty, the error reported (`reportError`), the component destroyed; not tried again on that row until the row's data changes.
- **Focus:** the grid's Enter or F2 calls the component's `focus()` when it has one, else focuses the first tabbable element inside it that is neither disabled nor a hidden input (none: the focus stays on the cell). A control inside owns its keys as a plain part's does (`cell-widget`); a component must not stop Tab or Escape from reaching the grid.
- **Directives:** `input[dzgSearch]="search"` binds the page's field to a `quickSearch()` feature (`dzgSearchDebounce` optional), `button[dzgExport]="exporter"` binds a button to a `csvExport()` feature (`dzgExportScope` optional). Both bind after the first render, before or after the grid exists, and unbind on destroy.
- **`fromObservable(fn)`** turns `(request) => Observable<response>` into a `DataSource`: the first value answers; an abort of the request unsubscribes (the abort listener is removed once the request settles) (an HTTP call is cancelled); an error rejects; completing without a value rejects.
- **Zones:** zoneless first. With zone.js, the grid is created outside Angular's zone (its scroll and pointer listeners run no change detection); parts mount outside it; outputs are emitted inside it. So a handler in a part's template (a `(click)` calling the application's code) runs outside Angular's zone too: a signal it sets updates the view at once (signals schedule their own check); a plain field it sets shows only at the next change detection. Use signals in parts.
- **Server rendering:** on a server the component renders nothing and creates no grid (no `document` touched); `componentPart` and `provideDzGrid` can be imported there.

## Trees and master/detail (Phase 4 step 11, `docs/phase-4-steps/step11-plan.md`)
- **Features** pass through `[features]` (fixed): `tree({ … })`, `tree({ lazy: lazyChildren({ has, load }) })`, `detail({ part: 'visits' })`. Their texts come in `[messages]` as for `createGrid` (`…-tree`, `…-detail` bundles).
- **`[(expanded)]`**: a `ReadonlySet<RowKey>` of the rows open (tree parents, detail masters; keys as `dataKey(id)`). Unset, the grid owns it. Set, the application's set is written as the host: rows open and not in it are closed, then rows in it are opened (`rows.expand`, source `host`; an empty set closes everything); a set equal to the grid's is not written (no echo). What the user (or the API, or the data) changes comes back as a new set: a toggle, rows removed (their keys leave), the tree's `initial` applied when no model is set. The application's own write never comes back.
- **Pending keys** (review of step 11): a key the application names whose row the grid does not hold yet stays **pending**. It opens when its row arrives, however that happens: several batches (`[rows]`, transactions, pages), or lazy children level by level, so a deep link `{a, a1, a11}` opens all three as each level loads. A key stays pending until the application writes a new set (the new set alone counts then). A pending key is not reported back in the model until it applies: the model shows what is open. When the user (or the API) closes a row, that row's pending descendants are dropped: a pending key whose row arrives under a row closed since the application's write does not open. A row the user closed is never opened again by the grid.
- **Under a tree filter** the toggles belong to the filter (tree-filter.md), the application's write too: the model stays the set outside the filter, which is the application's set when it wrote under the filter. A data change or a user toggle under the filter does not overwrite it, and when the query changes (the filter cleared) the grid shows the application's set.
- **Saving the open rows by the app's own ids** (step 16f, forecast F:P7): `expandedIds(controller)` (as
  `selectedIds`) gives the ids (`getRowId`'s, as strings) of the open **data** rows;
  a path tree's filler rows (a level no row has: `g:` keys) have no id and are left out, as are details' and pinned
  rows' keys. Null without a grid. Restore with `[expanded]="openKeys()"` and `openKeys = computed(() => new
  Set(saved().map((id) => dataKey(id)!)))`: keys whose rows are not there yet open once they arrive. A filler is saved
  by its path instead (`groupKey(path)`): which one the owner's tree screen needs is owner question Q16-8 (are its categories real
  rows with an id?); the helper is right either way — a category that is a row is listed by id, one that is a filler
  is restored by path.
- **When the model is told**: the grid is made during the host's change detection, so what it tells while being made (a tree's `initial` coming back, the `(rowExpanded)` of the set written at creation, `(problems)`) waits until after the first render. A plain field bound with `[(expanded)]`, or written by `(rowExpanded)`, raises no `NG0100`.
- **Two-way binding, Angular's own rule**: the model holds the last value set from either side. If the user toggles a row after the application set a new value but before change detection has passed it to the grid, the user's set comes back through `expandedChange` and replaces the application's value (Angular's behaviour for every model, not DzGrid's).
- **`(rowExpanded)`**: the grid's `rowExpanded` event (`source`, `rows`, `expanded`), keys only.
- **A detail panel from Angular**: `componentPart('detail', Visits)` in `[parts]` or `provideDzGrid({ parts })`, or `<ng-template dzgPart="visits" slot="detail" let-c>`, named by `detail({ part: 'visits' })`. The `cell` input (or `c`) is the panel's context: `row` (the master's data), `key`, `master`, `height`, `depth`, `leave()` and the usual `ctx`, `dir`, `msg`, `announce`, `context`; `emit(name, detail)` sends `partAction { slot: 'detail', column: null, name, detail }` (pass `cell().master` in `detail` to say which). The panel's part mounts when the panel is first shown, gets a new `cell` in place when the master's data, its height or the language change, and is destroyed with the panel (closed, scrolled away, grid ended). A `componentPart` object given straight to `detail({ part })` cannot be mounted (the feature is made before the grid): use a name.
- **A grid inside a panel**: the panel's component (or template) holds its own `<dz-grid>` and binds the panel's context to its input **`dzgNested`** (`<dz-grid [dzgNested]="cell()" …>`, read when that grid is made). The inner grid has its own controller, keys, scroll and focus (the outer grid ignores keys from it). Escape that the inner grid does not use (no editor, no menu, no composition, no tooltip to hide) puts the focus back on the panel's cell, one level only. Past three levels the inner grid tells `unsupported-combination` (`detail.depth`). Enter or F2 on the panel goes into the inner grid (its focused cell, else its first cell in view): the part's usual focus fallback finds the grid's tab stop, so the component needs no `focus()`. Unlike `nestedGrid`, nothing is remembered per master when a panel closes: the application keeps what it wants with the inner grid's models (`[(filter)]`, `[(expanded)]`, …). With zone.js, the inner grid is made outside the zone like the outer one, and its keys cost no change detection.
- **Pinned parents** (tree-sticky.md) are text only: no Angular part is created in them.

## Not done here
- `onEvent` as an input: `(gridEvent)` is the Angular form.
- A real `ng build`, the Angular audit example, `ng build` smoke on 19 and 22: step 23.

## Tests
`packages/angular/test/parts-component.test.ts`, `parts-template.test.ts`, `expanded.test.ts`, `detail-parts.test.ts`, `detail-nested.test.ts` (step 11), `expanded-ready.test.ts`, `expanded-walk.test.ts`, `expanded-lazy.test.ts`, `expanded-path.test.ts`, `detail-walk.test.ts` (its review), `slots-angular.test.ts`, `inputs.test.ts`, `directives.test.ts`, `ssr.test.ts`, `bench.test.ts`, `packaging.test.ts`, `template.test.ts`; `lifecycle-walk.test.ts`, `review-gaps.test.ts`, `corrections.test.ts` (the review of step 22); zone.js in its own project: `packages/angular/test-zone/zone.test.ts`, `zone-later.test.ts`, `tree-zone.test.ts` (step 11); the conformance case `conformance/cases/problems/part-shadowed.json`; in Chrome: `packages/angular/browser/` (`node packages/angular/browser/run.mjs`).

## The floating filter row (Phase 4 step 12)
`[floatingFilters]` (boolean, live, one-way): shows or hides the floating filter row of the `filters()` feature
given in `[features]` (`filters().floating.set`). Unset, the feature decides; a new value only is written, never
over the user's toggle (a button bound with `filters().floating.bind`) made since. No output: a host wanting the
state reads `filters().floating.get()`. Without `filters()` among the features: ignored. Sheet: `floating-toggle.md`.

## Editing (Phase 5 step 9, `docs/behaviors/edit-angular.md`, `docs/phase-5-steps/step09-plan.md`)
- **Features** `edit({ save })`, `editors({ enterMoves, list: listEditor })` through `[features]` (fixed, as the tree's); their texts (`…-edit`, `…-editors`) in `[messages]`. Live input **`[save]`**; outputs **`(cellEdited)`**, **`(saveFailed)`**, **`(orderStale)`**, **`(undoChanged)`**, held until the first render like every output; **`controller.edit()`** gives the grid's `EditApi` (null without `edit`, before the grid, after it, on a server).
- **An editor as a template:** `<ng-template dzgPart="stock" slot="editor" let-c>`; `c.keep(input)`, `c.cancel()`, `c.refuse(code)`, and `c.reads(() => input)` for what Enter, Tab and a click elsewhere keep. **As a component:** `componentPart('editor', C)`, with an optional `read()` and `focus()`. Its view is created when the editor opens and destroyed when it closes.

## Notes from an app (feedback pass M, 2026-10-27)
- **`slot` is a binding.** `<ng-template dzgPart="search" [slot]="'header'" let-c>`: a static `slot="header"` sets an
  attribute, not the signal input, so the part registers as a `cell` part and the header shows its default label (the
  symptom). Same for `[slot]="'filterOption'"` (the set filter's row, filter-set.md) and every other slot.
- **No CSS `content` for the grid's glyphs.** The pager's arrows are characters in the DOM and the chevrons characters
  in the grid's own CSS (feedback pass A): an app writes no `::before` for them. If an app writes its own `content`,
  use escapes in `.scss` (`content: '\00AB'`): a raw `«` came out of the Angular build as `content: ""` (the file's
  charset), an empty glyph.
- **The popup is out of the component's styles.** The filter popup is in the top layer, outside the host: emulated
  encapsulation never reaches it. Global CSS (`styles.scss`) or `ViewEncapsulation.None`, keyed on the popup's
  `data-column` / `data-kind` (theming.md); `::ng-deep` is deprecated.
- **An unlayered reset** (Tailwind 3's `@tailwind base`): import `@dzgrid/theme/dzgrid.unlayered.css`, not
  `dzgrid.css` (theming.md).
- **The row height** is `[rowHeight]`; `--dzg-row-height` in CSS does nothing (it is the grid's output, density.md).
- **A part's data**: `[columns]` with `ui: { data: { … } }`, read in the template as `c.column.def.ui.data`; another
  key of `ui` is warned (`unknown-ui-key`).

## Layout, pinned rows, density, selection and the controller (Phase 6 step 12, 1.1.0; `docs/phase-6-steps/step12-plan.md`)
All additive: every 1.0.0 input, output and controller method is unchanged (`compat` test in `step12-api.test.ts`).

### The outputs `<dz-grid>` has — and the silent trap
An unknown `(event)` on `<dz-grid>` is **not an error**: Angular binds it as a DOM event on the host element, which
never fires. Strict templates do not catch it (a typo, an output from another library, a renamed one). The outputs
are exactly these; anything else goes through `(gridEvent)` and its `type`:

| Output | Its `$event` | Since |
|---|---|---|
| `(gridEvent)` | every `GridEvent` (filter on `$event.type`) | 1.0.0 |
| `(cellClicked)`, `(rowClicked)` | the event, with the row | 1.0.0 |
| `(cellAction)`, `(partAction)` | `{ column, key, name, detail }`, `{ slot, column, name, detail }` | 1.0.0 |
| `(fetchFailed)`, `(rowExpanded)` | the event | 1.0.0 |
| `(cellEdited)`, `(saveFailed)`, `(orderStale)`, `(undoChanged)` | the edit events (edit-angular.md) | 1.0.0 |
| `(rangeChanged)`, `(rangeCopied)` | the block's events | 1.0.0 |
| `(problems)` | `readonly Problem[]` | 1.0.0 |
| `(gridReady)` | the `DzgController` | 1.0.0 |
| `(quickChange)`, `(filterChange)`, `(selectedChange)`, `(expandedChange)` | the models' two-way halves (`[(quick)]`…) | 1.0.0 |
| `(stateChanged)` | `{ state, source }` | 1.1.0 |
| `(densityChanged)` | `{ density, source }` | 1.1.0 |
| `(selectionChanged)` | `{ selection: { mode, keys }, count, source }` — **keys, not ids** (below) | 1.1.0 |

Before 1.1.0, `(selectionChanged)` was such a silent DOM binding (the allergen app's « selected rows stay empty »); it is
now a real output. Strict templates check `$event` on these: `$event.rows` on `(selectionChanged)` does not compile
(`scripts/test/angular-strict.test.ts`). No dev-mode check of unknown host listeners: the DOM gives no way to list them,
and any check would cost the wrapper's bytes in production.

### `[state]` and `(stateChanged)` (needs `gridState()` in `[features]`, grid-state.md)
- `[state]` set when the grid is made is restored **before its first request**: a server grid asks **once**, with the
  restored sort, filter and page (the wrapper holds the model; `gridState()` releases only the hold it made itself, with
  `persist`). Each later value is restored, outside Angular's zone.
- **No echo:** a value equal (canonically) to the grid's state, or to the value applied last, does nothing. So the
  usual loop `[state]="saved()" (stateChanged)="saved.set($event.state)"` settles: the state just received is never
  restored back. A restore never fires `(stateChanged)`; its problems come in `stateRestored` (`(gridEvent)`).
- `(stateChanged)` fires once per gesture after the pause (300 ms), inside the zone; the pause's timer runs outside it.
- `gridState({ persist })` is for the browser's storage; `[state]` for the page's address or the app's own store. Both:
  the storage at creation, then `[state]` wins (two requests on a server; prefer one of them).
- Without `gridState()`: one `missing-feature` (path `state`), the grid as defined.

### `[pinnedRows]` (needs `pinnedRows()`, pinned-rows.md)
`[pinnedRows]="{ bottom: [totals()] }"`: each new value is `api.set(value)` (an omitted side stays, `[]` empties it),
outside the zone. A literal in the template is a new object only when its signal changes; a `computed` is clearer.
Editing a pinned cell is the usual `edit()`; the save request carries `pinned: 'top' | 'bottom'`. Without the feature,
one `missing-feature` (path `pinnedRows`).

### `(densityChanged)`
The user's density (the ⋮ menu's density line), a state restore, the api. One-way: the `density` input is not written
back; after a user's choice the grid holds it, and the host imposes again by binding a **new** value.

### Selection: keys are not ids — `selectedIds()`
`SelectionState.keys` and the event's `selection.keys` are the grid's **row keys** (`d:13:6132500711040`), not your
`getRowId` ids: sent to a server they match nothing. `selectedIds(controller)` gives
`{ mode, ids, query }`: the ids (`idOfDataKey` of each key, held rows or not), the mode, and the grid's query (filter
model, sort, search). With `mode: 'exclude'` (« Select all », then a few unticked) the selection is « every row the
query matches but these »: the server replays the query. On a server grid the query as the server reads it is the
last `DataRequest` its `fetch` received (`filter` in wire form, `sort`, `quick`, `key`); the CSV export's `exportAll`
request carries it too (`request.server`). selection.md « Keys and ids ».

```ts
onSelection(): void {
  const s = selectedIds(this.ctrl);              // null before the grid
  if (s?.mode === 'include') this.api.delete(s.ids);
  else if (s) this.api.deleteAllBut(s.ids, this.lastRequest); // the query the server last answered
}
```

### `DzgController.use(feature)` and `.grid()`
- `ctrl.use(chooser)?.open(button)`, `ctrl.use(pins)?.set({ bottom })`, `ctrl.use(state)?.state()`: the feature
  object's own `api`, typed from it, no cast, no fake grid object; null before the grid, after it, on a server.
- `ctrl.grid()`: the grid instance (same lifetime as `kernel()`), e.g. **printing**:
  `print(this.ctrl.grid()!, { title })` from `@dzgrid/dom/print` (imported by the app where it prints).

### `DzgController.clearFilters()` and `.resetState()` (1.1.0)
- `clearFilters()`: every column filter and the quick search emptied, the sort kept, in one `query.set` (one request on
  a server; the no-results panel's `clearFilters`, overlays.md); `(stateChanged)` follows as a gesture. False before
  the grid.
- `resetState()` (needs `gridState()`): the grid as defined at creation — columns, groups, sort, filters, search, page,
  density — in one request (grid-state.md « Reset »); `(stateChanged)` follows, no restore back with `[state]` bound
  to it. Null without the feature or the grid, else the restore's problems.

### `uiData<D>(c)`
A column's `ui.data`, typed by the caller, from any part's context: `uiData<{ colours: Record<string, string> }>(c)`.
Undefined when the column gives none. Tree-shaken when unused (as `selectedIds`).

### A template per column-menu item (owner Q12-2)
```html
<dz-grid … [features]="[menu]">
  <ng-template dzgPart="swatch" [slot]="'menuItem'" let-c>
    <i class="dot" [class.on]="c.checked"></i>{{ c.label }}
  </ng-template>
</dz-grid>
```
```ts
menu = columnMenu({ items: (col, defaults) => [...defaults, { separator: true },
  { id: 'mark', label: 'Mettre en évidence', kind: 'check', checked: this.marked(col.id), part: 'swatch', action: … }] });
```
The template draws the item's content inside the menuitem, in a host the grid makes `inert` and `aria-hidden`; the item
keeps its role, its check state, the keys, the type-ahead and its **name, the `label`** — show that text too (WCAG
2.5.3), and put no control in it (none could take the focus). `c` has `id`, `label`, `kind`, `checked`, `disabled`,
`column` and what every part gets. Destroyed when the menu redraws or closes. column-menu.md « Item content ».

### `[slot]` is a binding, strictly typed
`<ng-template dzgPart="x" [slot]="'menuItem'" let-c>` types `c` as that slot's context; `{{ c.nope }}` does not
compile. A static `slot="…"` is an attribute (the input stays `cell`; « Notes from an app » below).
