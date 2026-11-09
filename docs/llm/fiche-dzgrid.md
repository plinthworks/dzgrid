# DzGrid reference sheet (for code generation)

Read fully before writing DzGrid code. Only the names below exist. If something is not here, it does not exist: do not invent options, inputs or events from other grid libraries.

## 1. Map

- `@dzgrid/core`: calculations, no DOM (types, `dataKey`, codecs, filters, server models). Subpaths `/server`, `/infinite`, `/server-side`, `/edit`, `/state`.
- `@dzgrid/dom`: drawing, virtual scroll, keyboard, a11y, texts. `definePart` and types from `@dzgrid/dom`; each feature from `@dzgrid/dom/<feature>`; texts from `@dzgrid/dom/locales/<lang>[-<feature>]`.
- `@dzgrid/theme`: CSS only (dom injects the layout CSS; the theme makes it presentable).
- `@dzgrid/angular`: `<dz-grid>` (standalone, signal inputs, Angular 19–22, zoneless first) and its helpers.
- Install: `npm install @dzgrid/core @dzgrid/dom @dzgrid/theme @dzgrid/angular`.
- Languages: `en`, `fr`, `ar`. Base texts: `import { FR } from '@dzgrid/dom/locales/fr'` (also `EN`, `AR`). Each feature has its own text bundle: `FR_FILTERS` from `@dzgrid/dom/locales/fr-filters`, etc. (table in §7).
- `@dzgrid/dom/editors` / `@dzgrid/dom/filters` need `@tzslot/core` + `@tzslot/dom` (>=2.4.0 <3) at build time; otherwise import the same `editors()` / `filters()` from `/editors-base` / `/filters-base` (no date calendar).

## 2. Minimum working grid

```ts
import { Component } from '@angular/core';
import { DzGrid, type DzgColumnOrGroup } from '@dzgrid/angular';
import { FR } from '@dzgrid/dom/locales/fr';

type Patient = { id: string; name: string; born: string; weight: number };

@Component({
  selector: 'app-patients',
  imports: [DzGrid],
  template: `
    <div class="grid-box">
      <dz-grid [rows]="rows" [columns]="columns" [getRowId]="rowId" [messages]="messages" locale="fr-FR" />
    </div>`,
})
export class Patients {
  readonly rows: Patient[] = [{ id: 'p1', name: 'Amina', born: '1990-04-12', weight: 61.5 }];
  readonly columns: DzgColumnOrGroup<Patient>[] = [
    { id: 'name', header: 'Nom', flex: 2 },
    { id: 'born', header: 'Naissance', type: 'day', width: 140 },
    { id: 'weight', header: 'Poids (kg)', type: 'number', numberFormat: { maximumFractionDigits: 1 } },
  ];
  readonly rowId = (p: Patient) => p.id;
  readonly messages = FR;
}
```

`angular.json` → `"styles": ["node_modules/@dzgrid/theme/dzgrid.css", "src/styles.css"]`. Global `src/styles.css` (not component styles: emulated encapsulation does not reach the grid's DOM):

```css
.grid-box { block-size: 480px; display: flex; flex-direction: column; }
.grid-box > dz-grid > .dzg { flex: 1; }
```

The `<dz-grid>` host has `display: contents` (no box of its own): size its parent, not the tag.

Pitfalls (exact symptoms):
1. **No `getRowId`** (or no `columns`): build fails, `NG8008: Required input 'getRowId' from component DzGrid must be specified.`
2. **No `messages`**: compiles, page empty, console `Error: dz-grid: messages are required ([messages] or provideDzGrid({ messages }))`.
3. **Feature texts missing**: a feature in `[features]` whose bundle is not merged into `messages` throws at creation, e.g. `TypeError: filters: missing filter.inputLabel, …` (same for `pagination:`, `tree:`, `edit:`, `grouping:` …).
4. **Theme CSS missing**: no error; the grid lays out and scrolls but looks raw (no borders, header colour, hover, selection or focus colours).
5. **Unknown output** (e.g. `(selectionChange)`): no error, never fires (bound as a DOM event). Only §3's outputs exist.
6. **Untyped column arrays** hide unknown keys. Type them `DzgColumnOrGroup<T>[]`; untyped literals need `type: 'number' as const`.

Merging feature texts (the only correct shape):

```ts
const MESSAGES = { ...FR, text: { ...FR.text, ...FR_FILTERS.text, ...FR_PAGINATION.text } };
```

App-wide defaults (a tag binding wins): `providers: [provideDzGrid({ messages: FR, defaults: { locale: 'fr-FR', timeZone: 'Europe/Paris', density: 'compact' } })]`. `provideDzGrid({ messages?, parts?, defaults? })`; `defaults`: `locale`, `timeZone`, `direction`, `density`, `rowHeight`, `numerals`, `features`.

## 3. `<dz-grid>` inputs and outputs

Live = a new value (by identity: new array/object, never mutate) is applied. Fixed = read once at creation; a later change is problem `unsupported-live-change`.

Inputs (all optional except the required three):
- `rows: Iterable<T>` live (new array = reload, rows matched by id). `source: SourceBinding<T>` live (server, §7).
- `columns: DzgColumnOrGroup<T>[]` **required**, live. `getRowId: (row: T) => string | number` **required**, fixed. `messages: GridMessages` required unless provided, live.
- `locale: string` live (e.g. `'fr-FR'`). `timeZone: string` live (IANA, for instants). `numerals: 'latn' | 'locale'` live (default Latin digits).
- `direction: 'ltr' | 'rtl' | 'auto'` live. `density: 'compact' | 'comfortable' | 'spacious'` live (28/32/40 px, default comfortable). `rowHeight: number` live (px, 24–1000, wins over density). `headerHeight: number` live (px, 24–1000; column-header and group rows, the filter row keeps the row height; absent: the row height).
- `overlay: 'loading' | 'error' | null` live. `busy: boolean` live (thin bar while reloading kept rows).
- `label: string` (accessible name), `tooltips: { delayMs? }`, `overscan: { rows?, cols? }`, `searchWarmup: 'idle' | 'off'`.
- `selection: { mode: 'none' | 'single' | 'multi'; checkbox?; click?; keepOnFilter?; canSelect?(row: DataNode<T>, sel, context) => boolean | string }` live. `canSelect` needs `rules()`.
- `context: unknown` live: app object given to parts (`c.context`), `canSelect`, `editable`, `tooltip`.
- `rowClass: (c: { row, key, context, pinned? }) => string | null | undefined` live (keep one function instance).
- `fullWidth: (row) => boolean` live, needs `spans()` (row shows its first visible column's value full width).
- `parts: Record<string, SlotPart>` live (§5). `dzgNested` (grid inside a detail panel, §5).
- `features: GridFeature[]` **fixed**. Define once as a class field, never `[features]="[filters()]"` in the template.
- `operations: 'client' | 'server' | { filter?, quick?, sort?, page? }` fixed. Default: with `rows` all client, no paging; with `source` all server.
- `pagination: { pageSize?, pageSizes? }` fixed. `filterKinds` fixed (custom filters). `clock: () => number` fixed. `multiSort: boolean` fixed (false = one sort only). `sameRow: (a, b) => boolean` fixed. `injectStyles: boolean`, `nonce: string` fixed (strict CSP).
- `floatingFilters: boolean` live (needs `filters()`). `save: SaveHandler<T>` live (needs `edit()`). `state: GridState | null` (needs `gridState()`). `pinnedRows: { top?: T[]; bottom?: T[] }` live (needs `pinnedRows()`).

Two-way models (unset = the grid owns the state):
- `[(quick)]: string`, `[(filter)]: Record<string, ColumnFilter>`, `[(selected)]: SelectionState` (`{ mode: 'include' | 'exclude', keys: ReadonlySet<RowKey> }`), `[(expanded)]: ReadonlySet<RowKey>` (open tree/detail rows), `[(groupBy)]: readonly string[]` (`grouping()`).

Outputs (`$event`):
- `(gridReady)`: `DzgController<T>` (once the grid exists).
- `(cellClicked)`: `{ type, source: 'user', row: RowNode<T>, column: string }`. `(rowClicked)`: `{ type, source: 'user', row: RowNode<T> }`. Data is `row.data` only when `row.kind === 'data'`.
- `(cellAction)`: `{ column, key: RowKey, name, detail }` (a cell part called `emit`). `(partAction)`: `{ slot, column: string | null, name, detail }` (other slots).
- `(selectionChanged)`: `{ selection: SelectionState, count: number | null, source, query, scope, reason }` (keys, not ids).
- `(rowExpanded)`: `{ rows: RowKey[], expanded: boolean, source }`.
- `(cellEdited)` `{ key, column, value, previous, origin }`, `(saveFailed)` `{ key, column, value, error, reason, code }`, `(orderStale)` `{ stale }`, `(undoChanged)` `{ canUndo, canRedo }`, `(rangeChanged)` `{ range }`, `(rangeCopied)` `{ rows, columns, cells, cut }`, `(fetchFailed)` `{ error, key, page }`, `(stateChanged)` `{ state, source }`, `(densityChanged)` `{ density, source }`.
- `(problems)`: `readonly Problem[]`. `(gridEvent)`: every `GridEvent<T>`; switch on `$event.type` (`sortChanged`, `filterChanged`, `quickChanged`, `pageChanged`, `columnsChanged`, `focusChanged`, `firstDataRendered`, `groupByChanged`, …).
- Model halves: `(quickChange)`, `(filterChange)`, `(selectedChange)`, `(expandedChange)`, `(groupByChange)`.

Always bind `(problems)` in development: `onProblems(ps: readonly Problem[]) { if (isDevMode()) for (const p of ps) console.warn('dzgrid', p.code, p.path, p.detail); }`.

## 4. Columns

`ColumnDef<T, V>` (core); `DzgColumnDef<T>` (angular) also takes component classes in `ui`. Only these keys exist:

- `id: string` required, unique, stable. `header?: string` (already translated). `headerShort?`. `headerTooltip?: string`.
- Value: `field?: string` (path `'a.b.c'`, own properties only; default = `id`), or `value?: (row) => V` (computed; use for class instances/getters).
- `type?: 'text' | 'number' | 'day' | 'instant' | 'boolean' | 'enum' | 'custom'` (default text). `day` = `'YYYY-MM-DD'` string. `instant` = epoch ms number or ISO string **with offset** (`Z`, `+01:00`); an offset-less string is blank (`ambiguous-instant`) unless `assumeZone: 'Europe/Paris'`. JS `Date` objects are not read: pass `date.getTime()`.
- Display: `numberFormat?: { style?: 'decimal' | 'percent' | 'currency'; currency?; minimumFractionDigits?; maximumFractionDigits?; useGrouping? }`, `instantFormat?: { date?; time?; seconds? }`, `enumOptions?: { value, label?, aliases? }[]`, `codec?: ValueCodec<V>` (own read/format/sort; e.g. `{ ...textCodec, format: (v) => v.toUpperCase() }`).
- Size: `width?`, `minWidth?`, `maxWidth?` (px), `flex?: number`, `resizable?`, `movable?`, `wrap?` (multi-line; row grows with `autoHeight()`).
- Place: `pinned?: 'start' | 'end' | null`, `hidden?`, `align?: 'start' | 'center' | 'end'`, `hideable?: false`, `chooser?: false`, `menu?: false`.
- Sort/filter: `sortable?: boolean`, `filter?: false | { kind?: 'text' | 'number' | 'day' | 'instant' | 'boolean' | 'set' | string; floating?; debounceMs?; ops?: string[]; optionPart?; maxConditions?; matchCase? }`.
- Look: `ui?: { cell?, header?, tooltip?` (part name, or in Angular a component class) `, cellClass?: (c: { value, text, row, key, column, context }) => string | null, headerClass?: string, data?: Record<string, unknown> }`. Any other `ui` key is warning `unknown-ui-key`. `tooltip?: (value, row, context) => string | null`.
- `merge?`, `rowSpan?(ctx)`, `colSpan?(ctx)` (need `spans()`); `groupShow?: 'open' | 'closed'`; `groupable?`, `aggFunc?: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'first' | 'last' | fn`; `csv?: 'text'`.
- Editing (needs `edit()` + `editors()`): `editable?: boolean | (row, context, info) => boolean`, `validate?: (value, row, context) => code | null`, `edit?: { required?, min?, max?, pattern?, options?, maxLength?, editor?: string }`.

Column group: `{ id, header?, children, collapsible?, open? }` (its header row needs `spans()`).

```ts
import type { ColumnOrGroup } from '@dzgrid/core';
import { textCodec } from '@dzgrid/core';

type Order = { id: number; ref: string; client: { name: string }; status: string; total: number; createdAt: string; paid: boolean };
const upper = { ...textCodec, format: (v: string) => v.toUpperCase() };

export const columns: ColumnOrGroup<Order>[] = [
  { id: 'ref', header: 'Ref', width: 120, pinned: 'start', codec: upper },
  { id: 'client', header: 'Client', field: 'client.name', flex: 2, minWidth: 160 },
  { id: 'status', header: 'Status', type: 'enum', enumOptions: [{ value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }], filter: { kind: 'set' } },
  { id: 'money', header: 'Money', children: [
    { id: 'total', header: 'Total', type: 'number', align: 'end', numberFormat: { style: 'currency', currency: 'EUR' } },
    { id: 'paid', header: 'Paid', type: 'boolean' },
  ] },
  { id: 'createdAt', header: 'Created', type: 'instant', instantFormat: { date: true, time: true }, filter: { kind: 'instant' } },
  { id: 'late', header: 'Late', type: 'number', value: (o) => (o.paid ? 0 : 3), sortable: false, filter: false,
    tooltip: (v) => (v ? `${v} days` : null), ui: { cellClass: (c) => (c.value ? 'is-late' : null) } },
];
```

No sort key on a column: an initial sort is `gridState({ initial: { v: 1, sort: [{ column: 'name', dir: 'asc' }] } })` in features (one request on a server), or `dispatch({ type: 'sort.set', … })` after `gridReady`.

## 5. Parts (custom rendering)

A part draws inside a host element the grid gives (the grid keeps roles, focus, sort marks). Parts are found **by name** in a per-grid registry: features' parts < `provideDzGrid({ parts })` < `[parts]` < `<ng-template dzgPart>` (later wins, warning `part-shadowed`). Unknown name: problem `unknown-part`, plain text shown.

Slots and context (all also get `ctx`, `dir`, `msg(key)`, `announce(text)`, `doc`, `context`):
- `cell` (base): `value` (coerced, null if blank), `text` (what the grid shows), `row` (typed `unknown`: cast it), `key`, `column` (`.id`, `.def`), `focused`, `search`.
- `header` (needs `slots()`): `column`, `label`, `sort`, `sortIndex`, `toggleSort(multi)`, `filter` (with `filters()`).
- `tooltip` (`slots()`): `text`, `value`, `row`, `column`. `overlay` (`slots()`): `phase: 'loading' | 'empty' | 'no-match' | 'error'`, `failure`, `retry()`, `clearFilters()`. `busy` (`slots()`).
- `editor` (`editors()`): `value`, `text`, `row`, `key`, `column`, `start`, `char`, `keep(input)`, `cancel()`, `refuse(code)`, `own(el)`; Angular adds `reads(fn)`.
- `detail` (`detail()`): `row` (master), `key`, `master`, `height`, `depth`, `leave()`.
- Also `floating`, `filter` (`filters()`), `filterOption` (set filter list row), `menuItem` (`columnMenu`), `footer` (`pagination()`), `status`.

Name resolution for a column: `ui.cell` name, else `'cell.<type>'` (e.g. register `'cell.number'` to restyle all number columns), else built-in. Same for `header.<type>`, `editor.<type>`.

Ways to give a part in Angular:
1. **Component class directly in the column** (simplest; `cell`, `header`, `tooltip` only): `ui: { cell: StatusCell }`.
2. `componentPart(slot, Component)` in `[parts]` / `provideDzGrid({ parts })`, named by the column.
3. `<ng-template dzgPart="name" [slot]="'header'" let-c>` inside `<dz-grid>`; slot defaults to `cell`. Write `[slot]="'x'"` (a binding), which types `c` strictly.
4. Plain DOM: `definePart('cell', { mount(host, c) { /* build DOM in host */ return { update(n) {…}, destroy() {…} }; } })` from `@dzgrid/dom`, put in `[parts]`.

A part component has **one** signal input named `cell` (any slot), type `DzgPartContext<slot>`, which adds `emit(name, detail?)`: in a cell it fires `(cellAction)` for the row shown at that moment, elsewhere `(partAction)`. Parts may `inject(DzgController)`. Instances are reused across rows: derive everything from `cell()`, keep no row state in fields; use signals (with zone.js, part handlers run outside the zone).

Example A, cell component with a button:
```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { DzgColumnOrGroup, DzgPartContext } from '@dzgrid/angular';

type User = { id: string; name: string; status: 'active' | 'blocked' };

@Component({
  selector: 'app-status-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="pill" [class.bad]="row().status === 'blocked'">{{ cell().text }}</span>
    <button type="button" (click)="cell().emit('block', row().id)">Block</button>`,
})
export class StatusCell {
  readonly cell = input.required<DzgPartContext<'cell'>>();
  row(): User { return this.cell().row as User; }
}

// screen: <dz-grid … (cellAction)="onAction($event.name, $event.detail)" />  ($event.key = the row's RowKey)
export const columns: DzgColumnOrGroup<User>[] = [{ id: 'name', header: 'Name' }, { id: 'status', header: 'Status', ui: { cell: StatusCell } }];
```

Example B, templates (cell + header) and the ready `badge` part (`imports: [DzGrid, DzgPart]`):
```html
<dz-grid [rows]="rows" [columns]="columns" [getRowId]="rowId" [messages]="messages" [parts]="parts" [features]="features">
  <ng-template dzgPart="titleCell" let-c><b>{{ c.text }}</b></ng-template>
  <ng-template dzgPart="sortHeader" [slot]="'header'" let-h>
    <span>{{ h.label }}</span> <button type="button" (click)="h.toggleSort(false)">sort</button>
  </ng-template>
</dz-grid>
```
```ts
readonly columns = [
  { id: 'title', header: 'Title', ui: { cell: 'titleCell', header: 'sortHeader' } },
  { id: 'prio', header: 'Priority', ui: { cell: 'prio' } },
];
readonly features = [slots()];                     // header/tooltip/overlay parts need slots() ('@dzgrid/dom/slots')
readonly parts: Record<string, SlotPart> = { prio: badge({ tones: { high: 'danger', low: 'neutral' }, fallback: 'info' }) };
readonly messages = { ...EN, text: { ...EN.text, ...EN_PARTS.text } };  // badge: '@dzgrid/dom/parts', texts '-parts'
```
`badge({ tones, fallback, classes })` tones: `'neutral' | 'info' | 'success' | 'warning' | 'danger'`. `cellBoolean` (register as `'cell.boolean'`). Both need the `-parts` texts.

Example C, master/detail with a nested grid:
```ts
import { Component, computed, input } from '@angular/core';
import { DzGrid, componentPart, type DzgPartContext } from '@dzgrid/angular';
import type { RowKey } from '@dzgrid/core';
import type { SlotPart } from '@dzgrid/dom';
import { detail } from '@dzgrid/dom/detail';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_DETAIL } from '@dzgrid/dom/locales/en-detail';

type Visit = { id: string; date: string; reason: string };
type Patient = { id: string; name: string; visits: Visit[] };
const MESSAGES = { ...EN, text: { ...EN.text, ...EN_DETAIL.text } };

@Component({
  selector: 'app-visits',
  imports: [DzGrid],
  template: `<dz-grid [dzgNested]="cell()" [rows]="visits()" [columns]="columns" [getRowId]="visitId" [messages]="messages" />`,
})
export class VisitsPanel {
  readonly cell = input.required<DzgPartContext<'detail'>>();
  readonly visits = computed(() => (this.cell().row as Patient).visits);
  readonly columns = [{ id: 'date', header: 'Date', type: 'day' as const }, { id: 'reason', header: 'Reason', flex: 1 }];
  readonly visitId = (v: Visit) => v.id;
  readonly messages = MESSAGES;
}

@Component({
  selector: 'app-patients-detail',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="rowId" [messages]="messages"
    [features]="features" [parts]="parts" [(expanded)]="open" />`,
})
export class PatientsDetail {
  readonly rows: Patient[] = [];
  readonly columns = [{ id: 'name', header: 'Name' }];
  readonly rowId = (p: Patient) => p.id;
  readonly messages = MESSAGES;
  readonly features = [detail<Patient>({ part: 'visits', height: 240 })];
  readonly parts: Record<string, SlotPart> = { visits: componentPart('detail', VisitsPanel) };
  open: ReadonlySet<RowKey> = new Set();
}
```
`detail({ part: 'name', height?: number | (master) => number | 'auto', initial?: 'none' | 'all', isMaster?, column? })`; give `part` as a **name**, not a `componentPart` object. Nesting stops past 3 levels (`unsupported-combination`).

Example D, editor template:
```html
<dz-grid [rows]="rows" [columns]="columns" [getRowId]="rowId" [messages]="messages" [features]="features">
  <ng-template dzgPart="qtyEditor" [slot]="'editor'" let-c>
    <input #box type="number" [value]="c.char ?? c.text" (focus)="c.reads(textOf(box))" />
  </ng-template>
</dz-grid>
```
```ts
readonly columns = [{ id: 'qty', header: 'Qty', type: 'number' as const, editable: true, edit: { editor: 'qtyEditor', min: 0 } }];
readonly features = [edit<Stock>(), editors()];   // texts: -edit, -editors
textOf(el: HTMLInputElement) { return () => ({ text: el.value }); }   // CellInput: { text } or { value }
```
An editor component: `componentPart('editor', C)` with optional `read(): CellInput | undefined` and `focus()` (`DzgEditorComponent`).

Column-specific data for parts: `ui: { data: { colours: {...} } }`, read with `uiData<{ colours: Record<string, string> }>(c)` (from `@dzgrid/angular`).

## 6. Driving the grid from code

Get the controller: `(gridReady)="ctrl = $event"`, or `#g="dzGrid"` then `g.controller`, or `inject(DzgController)` inside a part. All methods are null/false/no-op before the grid exists.

`DzgController<T>`:
- Signals `ready()`, `kernel()` (`kernel()?.query` = `{ sort, filter, quick }`, `kernel()?.selection`).
- `dispatch(cmd: GridCommand): { ok: true } | { ok: false, reason, problems }`.
- `focusCell(key, column)`, `ensureVisible(key, column?)`, `ensureColumnVisible(column)`, `announce(text)`.
- `refresh()` repaint; `refresh({})` ask the server again keeping rows; `refresh({ purge: true })` restart from top.
- `applyTransaction({ add?, addAt?, update?, patch?: [{ id, set }], remove?: ids })` → `TransactionResult | null`; `applyTransactionAsync(tx, done?)`.
- `openFilter(column): boolean`, `closeFilter()` (need `filters()`), `clearFilters(): boolean`, `resetState()` (needs `gridState()`).
- `edit()` → `EditApi` (`undo()`, `redo()`, `canUndo`, `canRedo`, `commit`, `reapply()`, `setSave()`), `range()`, `fill()`, `grouping()` → `{ by(), setBy(ids), expandAll(depth?), collapseAll(), totals() }`.
- `use(feature)` → that feature's api (e.g. `ctrl.use(chooser)?.open(button)`, `ctrl.use(pins)?.set({ bottom })`); `grid()` → `GridInstance` (for `print(grid, { title })`).

Commands (`dispatch`): `sort.set { sort: SortItem[] }` (`{ column, dir: 'asc' | 'desc', nulls? }`), `sort.toggle { column, multi }`, `filter.set { filter }`, `filter.column { column, filter: ColumnFilter | null }`, `quick.set { text }`, `query.set { query }` (from `makeQuery({ sort, filter, quick })`), `selection.toggle | selection.only { row }`, `selection.range { target, additive }`, `selection.set { selection }`, `selection.all`, `selection.allFiltered`, `selection.allDisplayed`, `selection.clear`, `page.go { index }` (from 0), `page.size { size }`, `rows.expand { rows: RowKey[], expanded }`, `rows.expandAll { expanded, depth? }`, `rows.refresh`, `column.state { patch: [{ id, width?, hidden?, pinned?, order? }] }`, `column.resize { column, width, finished }`, `columns.set { defs }`, `focus.set`.

`ColumnFilter`: `{ type: 'text', op, value?, caseSensitive? }`, `{ type: 'number', op, value?, valueTo? }`, `{ type: 'day', op, value?, valueTo?, range? }`, `{ type: 'instant', op, day?, dayTo?, at?, atTo?, range? }`, `{ type: 'boolean', value }`, `{ type: 'set', include?, exclude?, blanks? }`, `{ type: 'combined', join: 'and' | 'or', conditions }`, `{ type: 'custom', kind, state }`.

Row ids vs keys: commands take `RowKey`, never your id or a position. `dataKey(id)` (core) → `RowKey | null`; `idOfDataKey(key)` → id string. For a server, send ids: `selectedIds(ctrl)` → `{ mode: 'include' | 'exclude', ids, query } | null`; `expandedIds(ctrl)` → ids of open rows.

```ts
// in a component: ctrl: DzgController<Row> | null = null;  template: (gridReady)="ctrl = $event"
this.ctrl?.dispatch({ type: 'sort.set', sort: [{ column: 'age', dir: 'desc' }] });
this.ctrl?.dispatch({ type: 'filter.column', column: 'age', filter: { type: 'number', op: 'gte', value: 18 } });
const key = dataKey('a');                                  // RowKey | null, from '@dzgrid/core'
if (key) {
  this.ctrl?.ensureVisible(key, 'name');
  this.ctrl?.focusCell(key, 'name');
  this.ctrl?.dispatch({ type: 'selection.only', row: key });
}
this.rows.update((rs) => [...rs, { id: 'b', name: 'Bob', age: 12 }]);  // [rows]="rows()": new array = reload
this.ctrl?.applyTransaction({ patch: [{ id: 'a', set: { age: 41 } }] });
const sel = this.ctrl && selectedIds(this.ctrl);            // { mode, ids, query } | null
```

## 7. Features

Factory from `@dzgrid/dom/<entry>`, put in `[features]` (class field). Texts `<LANG>_<NAME>` from `@dzgrid/dom/locales/<lang>-<name>` merged into `messages` (e.g. `-row-drag` → `FR_ROW_DRAG`). CSS from `@dzgrid/theme/` after `dzgrid.css`. An input/part needing an absent feature: warning `missing-feature`.

| Need | Factory (entry) | Texts | CSS |
|---|---|---|---|
| filters | `filters({ floating?, apply?: 'button' \| 'live', debounceMs? })` (`/filters`, `/filters-base`) | `-filters` | |
| pager footer | `pagination({ footer? })` + input `[pagination]="{ pageSize: 50 }"` | `-pagination` | |
| search box | `quickSearch({ highlight? })` (`/search`) + `<input [dzgSearch]="search">` (`DzgSearch`) | | `search.css` |
| header/overlay/tooltip parts | `slots()` | | |
| spans, group headers, full-width | `spans()` | | |
| tree | `tree({ parentId? \| children? \| path?, column?, initial?: 'none' \| 'all' \| n, lazy?, filter?: 'ancestors' \| 'subtree' })` (`/tree`) | `-tree` | |
| master/detail | `detail({ part, height, … })` (`/detail`) | `-detail` | |
| row grouping, totals | `grouping({ by, aggFuncs?, expanded?, footers?, grandTotal? })` (`/grouping`); drop band `groupZone({ use: { grouping } })` (`/group-zone`); `[(groupBy)]` | `-group` | `grouping.css` |
| pivot | `pivot({ columns, values, … })` (`/pivot`) passed as `grouping({ by, pivot: p })`; bar `pivotBar({ use: { grouping, pivot, columns? } })` (`/pivot-bar`) | `-pivot`, `-pivot-bar` | `pivot.css` |
| editing | `edit({ save? })` (`/edit`) + `editors({ enterMoves?, tab? })` (`/editors`, `/editors-base`) | `-edit`, `-editors` | `edit.css` |
| cell blocks, copy/paste | `range({ … })` (`/range`); fill handle `fill(rangeFeature)` (`/fill`) | `-range`, `-fill` | `range.css`, `fill.css` |
| move/resize columns | `columns()` (`/columns`) | `-columns` | `columns.css` |
| columns panel | `columnsChooser()` (`/columns-panel`); open with `ctrl.use(chooser)?.open(button)` | `-columns` | `columns-panel.css` |
| filters panel | `filtersPanel()` (`/filters-panel`) | `-filters-panel` | `filters-panel.css` |
| dock (side panels) | `dock({ open?: { columns: 'end' }, panels?, sizes? })` (`/dock`); areas `start`, `end`, `bottom`, `float` | `-dock` | `dock.css` |
| column menu | `columnMenu({ use?: { columns, chooser, grouping, … }, density?, items? })` (`/column-menu`) | `-column-menu` | `menu.css` |
| right-click menu | `contextMenu({ use?: { range, csv, edit, … }, items? })` (`/context-menu`) | `-context-menu` | `menu.css` |
| CSV / Excel | `csvExport({ canExport: true, xlsx?: true, fileName? })` (`/export`); `<button [dzgExport]="exporter">` or `exporter.run('displayed' \| 'selected' \| 'all')` | `-export` | |
| print | `print(ctrl.grid()!, { title })` (`/print`, a function, not a feature) | `-print` | `print.css` |
| pinned rows | `pinnedRows()` (`/pinned-rows`) + `[pinnedRows]="{ bottom: [...] }"` | `-pinned` | `pinned-rows.css` |
| row drag | `rowDrag({ apply?: true, canDrag?, canDrop? })` (`/row-drag`); `apply` for flat client rows | `-row-drag` | `row-drag.css` |
| save/restore layout | `gridState({ initial?, persist?: { key } })` (`/state`) + `[state]` / `(stateChanged)` | | |
| selection rule | `rules()` (`/rules`) for `selection.canSelect` | `-rules` | |
| row numbers, status bar, find (Ctrl+F) | `rowNumbers()`, `statusBar()`, `find()` | `-row-numbers`, `-status`, `-find` | `row-numbers.css`, `find.css` |
| wrapped text grows rows | `autoHeight()` (`/auto-height`) + column `wrap: true` | | |
| new-row flash | `freshRows()` (`/fresh-rows`) | `-fresh` | `fresh-rows.css` |

Server data (rows never all in memory):
```ts
import { sourceRows, type DataRequest, type DataResponse } from '@dzgrid/core/server';
readonly source = sourceRows<Log>({ fetch: (req: DataRequest) => this.api.page(req) /* Promise<DataResponse<Log>> */ });
// or from an Observable: sourceRows(fromObservable((req) => this.http.post<DataResponse<Log>>(url, req)))
```
`<dz-grid [source]="source" operations="server" [pagination]="{ pageSize: 100 }" (fetchFailed)="…">`. `DataRequest`: `{ filter?, quick?, sort?, page?, params, zone, key, signal }` → `{ rows, total?, hasNext?, nextCursor? }`. `sourceRows(data, { paging?: 'offset' | 'cursor', params?, maxRows? })`; blocks while scrolling: `infiniteRows` (`@dzgrid/core/infinite`); server groups: `serverSideRows` (`@dzgrid/core/server-side`). Stale requests are aborted; only the latest answer shows.

Selection: `[selection]="{ mode: 'multi', checkbox: true }"`, read via `[(selected)]` / `selectedIds(ctrl)`. Handle `mode: 'exclude'` (after « Select all » on paged/server rows: every matching row except `keys`).

Editing: `edit({ save })`, `save(req, signal)` gets `req.changes: { key, column, value, previous, row }[]`; resolve = saved, throw/reject = refused (`(saveFailed)`); no `save` = kept locally. Undo: Ctrl+Z or `ctrl.edit()?.undo()`.

## 8. Styling

- `dzgrid.css` sits in CSS layer `dzgrid` (your classes win without `!important`); with an unlayered reset (Tailwind 3, Bootstrap Reboot) load `dzgrid.unlayered.css` instead. Framework bridges: `tailwind.css` (v4, via Tailwind, order line `@layer theme, base, dzgrid, components, utilities;`), `tailwind3.css`, `bootstrap.css`. Skins: `midnight.css`, `clinic.css`. `contrast.css`: more contrast.
- Palette (each a `light-dark()` pair on `:root`): `--tz-bg`, `--tz-bg-raised`, `--tz-fg`, `--tz-fg-muted`, `--tz-border`, `--tz-accent`, `--tz-accent-fg`, `--tz-danger`, `--tz-warning`, `--tz-success`.
- Grid tokens (set on any ancestor of `.dzg`): `--dzg-font`, `--dzg-radius`, `--dzg-cell-padding-inline`, `--dzg-header-bg`, `--dzg-row-hover-bg`, `--dzg-row-selected-bg`, `--dzg-focus-ring`, `--dzg-line`, `--dzg-pill-radius`, `--dzg-header-size`, `--dzg-select-bar`, `--dzg-flash`, `--dzg-flash-color`.
- Row height: `[rowHeight]` or `[density]` (setting `--dzg-row-height` does nothing); a taller header: `[headerHeight]`. Dark/light: follows the system, or `data-theme="dark" | "light"` on an ancestor. RTL: `[direction]="'rtl'"` or `'auto'` (follows ancestors' `dir`).
- Classes: `ui.cellClass`, `ui.headerClass`, `[rowClass]`. DOM: `.dzg`, `.dzg-row`, `.dzg-cell[data-col="id"]`, `.dzg-hcell`. Grid and popups are outside component style scope: style them in global CSS.

```css
:root { --tz-accent: light-dark(#0f766e, #5eead4); }
.dzg-cell.is-late { color: var(--tz-danger); }
```

## 9. Rules generated code must respect

1. Rows are identified by `getRowId` → `RowKey` (`dataKey(id)`), never by index/position. Ids unique and stable.
2. Logical sides only: `start` / `end`, `inline-start`, `margin-inline-*`, `inset-inline-*`; never `left` / `right` (`pinned: 'start'`, not `'left'`).
3. No hard-coded colours: use `--tz-*` / `--dzg-*` variables (`var(--tz-danger)`).
4. Bad input never throws: it becomes a `Problem` `{ code, severity: 'error' | 'warning', path, detail? }` through `(problems)`; a Problem never carries row data. Exceptions (developer setup errors that throw): missing `messages`, missing feature texts.
5. Angular inputs are signal inputs, compared by identity: update with new arrays/objects (`signal.update(rs => [...rs, x])`), never `push`/mutate. Keep functions (`getRowId`, `rowClass`, `canSelect`) and `features` as stable class fields.
6. Dates: `day` columns hold `'YYYY-MM-DD'`; `instant` columns hold epoch ms or ISO with offset; never `Date`, never offset-less strings without `assumeZone`.
7. Grid texts come from `messages`; your headers are already-translated strings; a part's own keys use `msg('app.<key>')`.
8. Parts render from their context only (cast `row`); act through `emit`, never a captured row.

## 10. What DzGrid does NOT do

- No option names from other grid libraries: display text comes from `type` + `numberFormat`/`instantFormat`/`enumOptions`/`codec`, computed values from `value`, custom cells from `ui.cell`.
- No HTML-string renderers (the grid never writes HTML; parts build DOM or Angular views).
- No sort setting on a column; no automatic tooltips from content; no global part registry; no `onEvent` input (use `(gridEvent)`).
- No `expandAll()`/`collapseAll()` on the controller (use `ctrl.grouping()?.expandAll()` or command `rows.expandAll`).
- No rows rendered on the server (SSR draws an empty `<dz-grid>`; no hydration).
- No charts (the pivot api's `series()` gives data for your own chart library). No spreadsheet import (export to CSV/XLSX only).
- No full-width rows together with `tree()` (`unsupported-combination`). A detail panel cannot nest past 3 levels.

Version: 1.6.0, generated from api/*.api.txt on 2026-11-07
