# DzGrid Phase 3: the plug-in design (refines D1, D3, D5, D9 of phase-3-plan.md)

## B0. Six public concepts, no more

| # | Concept | Package | Replaces |
|---|---|---|---|
| 1 | **Operations**: where `filter`, `quick`, `sort` and `page` run | `@dzgrid/core` | parts of D1 and D3 |
| 2 | **DataSource**: one `fetch(request)`, plus optional `values` | `@dzgrid/core/server` | D3's `PageFetch` |
| 3 | **Part**: `mount` / `update` / `destroy`, the same for every slot | `@dzgrid/dom` | D9's `CellRenderer`, the D6 adapter shape |
| 4 | **Parts by name**: `settings.parts`; defaults named `<slot>.<type>` | `@dzgrid/dom` | D9's `cells` map |
| 5 | **FilterKind**: serialisable state, client test, wire form | `@dzgrid/core` | extends `FilterModel` |
| 6 | **Feature**: a bundle of parts and kinds behind a subpath (`filters()`, `pagination()`…) | `@dzgrid/dom/*` | D9's features seam, now public and smaller |

Column definitions gain three plain-data fields, not concepts:
- `format` (value formatter);
- `filter: { kind, ops, floating, debounceMs, values }`;
- `ui: { cell, header, tooltip }`, holding part names.

---

## B1. Where each operation runs

### B1.1 The setting

```ts
// packages/core/src/model/operations.ts  (@dzgrid/core)
export type Operation = 'filter' | 'quick' | 'sort' | 'page';
export type Placement = 'client' | 'server';
export interface Operations {
  readonly filter: Placement; readonly quick: Placement; readonly sort: Placement;
  readonly page: Placement | 'off';             // 'off' = one scrolling list, no pager
}
export type OperationsInput = 'client' | 'server' | Partial<Operations>;
export function resolveOperations(input: OperationsInput | undefined, hasSource: boolean):
  { readonly ops: Operations; readonly problems: readonly Problem[] };
```

- **Defaults:**
  - with `rows`: all client, `page: 'off'`;
  - with `source`: `'server'`, meaning all four on the server.
- **Shorthands:** `'server'` sets all four to server. `'client'` sets all to client, with `page: 'client'` for a source and `'off'` for rows.

### B1.2 Which combinations are valid

The pipeline order is fixed: filter and quick, then sort, then page.

- Filtering and sorting **commute**: filtering a sorted list keeps its order. So any mix of filter, quick and sort placements gives the right rows.
- Paging does not commute with anything. A page is a cut of the final ordered list.

| `page` | filter / quick / sort | Valid? | What the browser holds | Why |
|---|---|---|---|---|
| `off` or `client` | all client | ✓ | every row | the classic client grid |
| `off` or `client` | any of them server, the rest client | ✓ | the **fetched set**: everything the server-side part matches | the server narrows or orders, the browser finishes; a client change costs no request |
| `server` | all server | ✓ | one page | the audit-logs case |
| `server` | any of them client | **✗** | — | see below |

**Why a client stage over server pages is refused:**
- Client filtering over a page shows 12 rows of a "page of 50". The counts and "51–100 of 1 234" become false, and the rows it should have found are on other pages the client never sees.
- Client sorting over a page reorders 50 rows. The user reads it as a global order, and it is not.
- Client quick search over a page has the same problem as client filtering.

**When the setting is invalid:**
- `resolveOperations` gives the error problem `invalid-operations` (new code, with a conformance case) at `operations.<op>`.
- A client stage under server pages is promoted to server, which is the only valid reading when `page` is server. The promotion is stated in the problem, never silent.
- Any `server` placement without a `source` gives the same problem and falls back to client (`page: 'server'` to `'off'`).
- An unknown value keeps that operation's default; a setting that is neither a shorthand nor an object keeps the defaults. (Step 1 decision, 2026-10-17: the code's reading, `operations.md`.)

**Per-column limits:**
- A column the API cannot sort or filter keeps using the existing flags, `sortable: false` and `filter: false`.
- Per-column placement, where one filter runs on the client and the others on the server, is **not** in Phase 3. It would need a split filter model. It is listed for Phase 7.

### B1.3 The DataSource contract (the host implements it once)

```ts
// packages/core/src/server/source.ts  (@dzgrid/core/server)
export type Json = null | boolean | number | string | readonly Json[] | { readonly [k: string]: Json };

export interface DataSource<T> {
  /** Called with the server-side parts of the query only. */
  fetch(req: DataRequest): Promise<DataResponse<T>> | DataResponse<T>;
  /** Distinct values for a value-list filter when `filter` is server. Optional: without it the list uses enumOptions only.
   *  Step 9 amendment: `ValuesRequest { column, search, limit, filter? (wire form minus this column), quick? (server search only), params, zone, key, signal }`,
   *  answered by `readonly SetValue[] | { values, blanks?, truncated? }` (sync, thenable or Promise), read as `value-list.md` says. */
  values?(req: ValuesRequest): Promise<ValuesResponse> | PromiseLike<ValuesResponse> | ValuesResponse;
}

export interface DataRequest {
  readonly filter?: WireFilterModel;          // present iff ops.filter === 'server'
  readonly quick?: string;                    // present iff ops.quick === 'server' (and non-empty)
  readonly sort?: readonly SortItem[];        // present iff ops.sort === 'server'
  readonly page?: PageWindow;                 // present iff ops.page === 'server'
  readonly params: Readonly<Record<string, Json>>;   // D4b: tenant, role… (always)
  readonly zone: string;                      // display zone, which the instant bounds depend on
  readonly key: string;                       // canonical form of the fields above (logs, host cache)
  readonly signal: AbortSignalLike;           // aborted when superseded or destroyed
}
export interface PageWindow { readonly index: number; readonly size: number; readonly offset: number; readonly cursor: string | null }
export interface DataResponse<T> {
  readonly rows: readonly T[];
  readonly total?: number;                    // server paging: optional (unknown total)
  readonly hasNext?: boolean;                 // required when total is absent
  readonly nextCursor?: string | null;        // cursor mode
}
export interface ValuesRequest { readonly column: string; readonly search: string;
  readonly filter?: WireFilterModel /* the other columns */; readonly quick?: string;
  readonly params: Readonly<Record<string, Json>>; readonly zone: string; readonly signal: AbortSignalLike }

/** Row-model factory for a source. Operations come from the grid settings. */
export function sourceRows<T>(source: DataSource<T>, o?: {
  readonly pageSize?: number; readonly pageSizes?: readonly number[];  // 50, [25, 50, 100]
  readonly paging?: 'offset' | 'cursor';                               // server page only
  readonly maxRows?: number;     // fetched-set guard, default 100 000 → warning 'fetched-set-large'; the rows are kept
}): RowModelFactory<T, SourceModel<T>>;
```

- `WireFilterModel` is `toWire(filter, { ctx, columns, kinds? })`'s result (step 6, `docs/behaviors/server-filter.md`): a narrowed union per kind; instants carry their resolved UTC `[from, to)` bounds (`YYYY-MM-DDTHH:mm:ss.sssZ`, three digits of milliseconds) and the zone; days travel as the model; half-typed filters are dropped, refused ones dropped with the browser's problems; a custom kind travels as `{type: 'custom', kind, value}`. The request key is made from this form.
- Custom kinds go on the wire through their own `wire()` (§B2.6).
- With `page` client, the response `rows` are the whole fetched set, and `total` and `hasNext` are ignored.
- **One fetch function serves both modes:** it pages when `req.page` is present and returns everything otherwise. That is why example 3 is a one-setting switch.

### B1.4 How the model composes server and client stages

```ts
// packages/core/src/model/types.ts  (D1, refined)
export interface RowCounts { readonly total: number | null; readonly filtered: number | null; readonly displayed: number }
export interface PageState { readonly index: number; readonly size: number; readonly sizes: readonly number[];
  readonly total: number | null; readonly hasNext: boolean; readonly canJump: boolean }
export interface RowModel<T> {
  readonly kind: 'client' | 'source';
  readonly ops: Operations;
  readonly displayed: DisplayedRows<T>; readonly status: ModelStatus; readonly counts: RowCounts;
  readonly page: PageState | null;                 // null when ops.page === 'off'
  readonly selectAll: 'displayed' | 'query';       // 'query' only when ops.page === 'server'
  keeps(key: RowKey): boolean;
  row(key: RowKey): DataNode<T> | undefined;
  setQuery(q: Query, source?: ChangeSource): void;
  setPage(p: { index?: number; size?: number }, source?: ChangeSource): void;
  setColumns(c: ColumnLookup<T>, source?: ChangeSource): void;
  setContext(ctx: LocaleCtx, source?: ChangeSource): void;
  invalidate(o?: { readonly purge?: boolean }): void;
  subscribe(fn: (c: ModelChange<T>) => void): () => void; destroy(): void;
}
export function splitQuery(q: Query, ops: Operations): { readonly server: ServerQuery; readonly client: Query };
// ServerQuery: { filter?, quick?, sort?, params, key }: the parts placed on the server, with their canonical key.
```

**The existing `ClientModel` pipeline stays and gains one stage:**
- The stages become filter (with quick) → sort → **page** → displayed.
- The page stage is a cut of the sorted order (`subarray`), memoised like the others. A page change only cuts again.
- With `page: 'off'` the stage is identity.

**`sourceRows` = a server stage in front of an inner `ClientModel`:**

```
Query ─splitQuery─► server part ──(key changed?)──► gate.begin ─► source.fetch ─► accepted?
                                                                              │ yes
                      client part ─────────────────────────────► inner.setRows(rows,'data')
                                                                  inner.setQuery(client part)
                                                                  inner.setPage(…) when page is client
displayed = inner.displayed
```

**Server part changes and client part changes:**
- When the server part's key changes, a new **epoch** starts, the page goes back to 0, and the model fetches.
- When only the client part changes, the model calls `inner.setQuery` and makes no request.

**With `page: 'server'`:**
- The client part is empty by construction (§B1.2).
- The inner model holds one page with an empty query. It is pass-through, but it keeps row identity, duplicate-id problems, the retained-row focus and transactions.
- `setPage` gives a new request with the same epoch and a new seq.
- Changing the page size keeps the first row, as in D3.

**With `page: 'client'` and a source:**
- `setPage` stays in the browser.
- `counts.total` is the length of the fetched set.

**The kernel:**
- It holds `query` and `page` (D1), and pushes both: commands `page.go {index}`, `page.size {size}`, event `pageChanged {page: PageState}` (step 1 decision).
- It never reads `ops` except to pick the selection rules (§B1.6).
- `operations` is a **fixed** setting under `UPDATE_POLICY`: changing it live gives `unsupported-live-change`, so the host recreates the grid.
- `source` is **live**: a new object refetches.

### B1.5 Stale responses, unknown total, cursor (D3 kept, restated against the new contract)

- **Gate:**
  - one channel, `rows` (plus `values:<col>` for the value lists);
  - the latest seq of the current epoch wins;
  - superseded requests are aborted through `signal`;
  - a stale rejection is dropped silently, and an abort is never an error;
  - an accepted rejection gives `status: error` (`failure` = the host's error, unchanged), the `fetchFailed {error, key, page}` event, and the error overlay with retry (`rows.refresh`); the page asked and the last accepted rows are kept under it;
  - `destroy` drops everything in flight.
  - The 1 000-permutation test runs for **both** source configurations.
- **Unknown total:**
  - If `total` is absent, `hasNext` is required.
  - If both are missing, the model gives the warning `invalid-page-response` and infers `hasNext = rows.length >= size`.
  - The pager shows "51–100 of many" and disables "last".
  - An empty page past the end steps back to the page before, with `hasNext` false (step 1 decision, `server-pagination.md`).
- **Cursor:** cursor mode keeps one cursor per page reached in the epoch, so next, previous and back to page 0 work. `canJump` is false, and "last" is hidden.
- **While loading:** the previous rows stay displayed (`status: loading`, `aria-busy`, stale styling); no loading overlay over them, only on a first load with no rows. A page past the end, with a known total, clamps to the last page and refetches once.
- **Debounce:** debouncing stays in the DOM inputs (the core has no timers). The defaults are 300 ms when the operation is on the server and 150 ms on the client.

### B1.6 Selection rules

| Operations | `selectAll` means | When the query changes | `selectionChanged` |
|---|---|---|---|
| all client | the displayed (filtered) rows, as an include set | keys whose row is gone are dropped (`keeps` = the row exists) | `count` exact |
| fetched set (`page` off or client) | the displayed rows of the fetched set | a server-part change replaces the set: keys not in the new set are dropped, with source `data` | `count` exact |
| server page | everything the query matches, as **exclude** mode bound to `rows.membershipOf(query)` (the filters as sent, the search, `params`, the zone), not the sort | include keys survive across pages; exclude mode is cleared when the membership changes (filters, search, params, zone), with an announcement (D2); a sort keeps it | `count` is `counts.filtered − excluded`, or null when unknown; `query` and `scope` are attached, `reason` says a clearing |
| `selection.allFiltered` | paged (browser pages, a fetched set paged in the browser): everything-except over every page, bound the same way; server pages: `selection.all`; unpaged: the displayed rows | as the row above | as the row above |

The header box describes what its click acts on (`kernel.headerState`): the whole query on server pages, what is displayed (the page, or the list) elsewhere (step 7). A host's exclude selection (`selection.set`) is accepted on any model and tied by the same rule. There is no `selection.selectAll` option (step 1 decision, `server-selection.md`).

---

## B2. Parts and the registry

### B2.1 One contract for every slot

```ts
// packages/dom/src/parts/part.ts  (@dzgrid/dom base)
export type Slot = 'cell' | 'header' | 'filter' | 'floating' | 'overlay' | 'tooltip' | 'footer' | 'editor' /* P4 */;
export interface Part<C> { mount(host: HTMLElement, c: C): PartHandle<C> }
export interface PartHandle<C> {
  update?(c: C): void;          // same handle, new context (pooled cells, state echo)
  destroy?(): void;             // remove listeners; the grid empties the host after
  focus?(): boolean;            // grid asks the part to take focus (popup open, Enter on a cell); false = nothing focusable
}
export interface SlotPart<S extends Slot = Slot> { readonly slot: S; readonly part: Part<SlotContext[S]> }
export function definePart<S extends Slot>(slot: S, part: Part<SlotContext[S]>): SlotPart<S>;

interface PartBase {
  readonly ctx: LocaleCtx; readonly dir: 'ltr' | 'rtl';
  msg(key: MessageKey | `app.${string}`, p?: Readonly<Record<string, string | number>>): string;
  announce(text: string): void;
  readonly doc: Document;
}
export interface SlotContext {
  cell:     PartBase & { readonly value: unknown; readonly text: string; readonly row: Readonly<unknown>; readonly key: RowKey;
                         readonly column: ResolvedColumn<unknown>; readonly focused: boolean };
  header:   PartBase & { readonly column: ResolvedColumn<unknown>; readonly label: string; readonly sort: SortItem | null;
                         readonly sortIndex: number | null; readonly filtered: boolean; toggleSort(multi: boolean): void; openFilter(): void };
  filter:   PartBase & FilterSlot;
  floating: PartBase & FilterSlot & { openPopup(): void };
  overlay:  PartBase & { readonly phase: 'loading' | 'empty' | 'no-match' | 'error'; readonly failure: unknown; retry(): void; clearFilters(): void };
  tooltip:  PartBase & { readonly text: string; readonly value: unknown; readonly row: Readonly<unknown> | null; readonly column: ResolvedColumn<unknown> };
  footer:   PartBase & { readonly counts: RowCounts; readonly page: PageState | null; readonly selected: number | null;
                         readonly status: ModelStatus; go(index: number): void; next(): void; prev(): void; setSize(n: number): void };
  editor:   never;   // Phase 4
}
interface FilterSlot {
  readonly column: ResolvedColumn<unknown>; readonly kind: string;
  readonly state: Json | null;                  // this kind's state for the column, or null
  readonly where: Placement;                    // ops.filter: tells the part whether to debounce longer or show Apply
  set(next: Json | null, o?: { readonly commit?: 'now' | 'debounced' }): void;   // dispatches filter.column with source 'user'
  // Step 9 amendment: a handle, not a Promise (a Promise can neither be cancelled nor show the old list while a new one loads):
  values(o?: { readonly search?: string; readonly max?: number }): ValuesHandle;   // = kernel.values(column, o), value-list.md
  close(): void;
}
```

**Rules every part follows, enforced by the grid:**
- **Mount and update:**
  - `mount` is called once per pooled host.
  - `update` is called only when the context changed: the row key, the row data, `focused`, the filter state, or what the context carries (language, zone, numerals, direction, messages, the column's definition). A rebind for the row height, the checkbox column or the column window calls nothing.
  - `destroy` is called before reuse elsewhere and on grid `destroy`.
- **A part that throws** (in `mount`, `update` or `destroy`) costs only its host, for that row: the grid writes empty text and reports the error with `reportError`.
- **The default text cell is not a part.** It stays on the fast `textContent` path. Registering `cell.text` moves every text column to the part path, on purpose.
- **Safety:** the grid never writes HTML. A part writes its own DOM, and the existing guards apply to built-in parts (no colour, no literal text, no left or right).

### B2.2 Default names and how a name is resolved

The defaults are registered by features under `<slot>.<type-or-kind>`:

| Slot | Default names |
|---|---|
| cell | (fast path for every type); `cell.badge` and `cell.boolean` ship in `/filters`' sibling `/parts` (see §B3) |
| header | `header` (sort button, filter button, active mark) |
| filter | `filter.text`, `filter.number`, `filter.day`, `filter.instant`, `filter.boolean`, `filter.set` |
| floating | `floating.text`, `floating.number` (live input); `floating.*` fallback = summary button opening the popup |
| overlay | `overlay` (all four phases) |
| tooltip | `tooltip` |
| footer | `footer.pager`, `footer.count`, `footer.selected` |

**The column's filter kind** defaults from its type: text, number, day, instant and boolean map to themselves, and **enum maps to set**. The kind picks both the core `FilterKind` and the parts `filter.<kind>` and `floating.<kind>`.

**Resolution, for a column and a slot:**
1. the column's explicit name (`ui.cell`, `ui.header`, `ui.tooltip`, or for filters `filter.kind`);
2. `settings.parts['<slot>.<type or kind>']`;
3. the part a feature registered under that name;
4. the built-in.

A name that cannot be resolved among the parts of that slot (a `header` part named in `ui.cell` included) gives the error problem `unknown-part`. The column then falls back to the default, and a filter with an unknown kind is ignored with `invalid-filter`.

**Where parts live:**
- There is one registry per grid, `settings.parts: Readonly<Record<string, SlotPart>>`.
- There is **no global mutable registry**: several grids and SSR stay safe. App-wide parts come from one shared object, which Angular supplies through `provideDzGrid({ parts })`.
- `parts` is a **live** setting: changing it remounts the affected hosts.

**The footer** is a list of names, `footer?: readonly string[]`. The default is `['footer.count', 'footer.pager']` when `page !== 'off'`, and none otherwise. It sits outside `role="grid"`, as `<nav>` plus a status region.

### B2.3 Replacing defaults

- **Globally, for one app:** `parts: { 'filter.instant': definePart('filter', myInstantFilter) }`.
- **Per column:** `ui: { cell: 'statusBadge' }`, or `filter: { kind: 'between' }`.
- **A new part:** register any name that has no dot (`statusBadge`) and reference it from columns.
- **The date picker inside the built-in day and instant filters:** D6's `DatePickerAdapter` stays, passed as `filters({ datePicker })`. It is an option of a feature, not a seventh concept.

### B2.4 Value formatters (core, pure)

```ts
// ColumnDef (core), additive
readonly format?: (value: V, ctx: LocaleCtx) => string;
```

- `format` drives the displayed text, `CellCtx.text`, the tooltip default and the **quick search haystack**.
- CSV writes values by D7's rules, never `format`, unless `CsvOptions.text: 'display'` is set. Owner decision 8 (step 1 decision, `csv-export.md`).
- The formatter must be pure: the haystack caches depend on that.

### B2.5 FilterKind: how a custom filter joins the model and the request

```ts
// packages/core/src/filter/kind.ts  (@dzgrid/core)
export interface FilterKind<S extends Json = Json, V = unknown> {
  readonly name: string;                              // 'between'; no dot; built-ins: text number day instant boolean set
  readonly types?: readonly ColumnType[];             // columns it accepts; absent = any
  read(state: unknown): S | 'invalid';                // validates JSON from the host, the URL or a saved view
  active(s: S): boolean;                              // half-typed = inactive (no problem)
  test?(s: S, ctx: LocaleCtx): (value: V | null, row: Readonly<unknown>) => boolean;  // client predicate on the coerced value
  wire?(s: S, ctx: LocaleCtx, zone: string): Json;    // server form; default = the state itself
}
// FilterModel gains one variant:
//   | { readonly type: 'custom'; readonly kind: string; readonly state: Json }
// Wire form of a custom filter:  { type: 'custom', kind, value: wire(state) }
// Settings (core-level, passed through createGrid): filterKinds?: readonly FilterKind[]
```

- **Client side:** `compileFilter` handles `custom` through a generic path.
  - It reads the state with `read`, then runs `test` over the column's coerced values.
  - It uses a new lazily built `ColumnCache.values(col)` (one array per column, released with the cache).
  - A slow kind costs only its own column.
  - Built-in kinds keep their specialised compiled tests.
- **A server-only kind** is a kind with no `test`. It is allowed only when `ops.filter === 'server'`. Otherwise the problem `filter-needs-server` is raised and the filter is ignored.
- **The query key** includes the state, so the gate, the epochs and the selection rules apply unchanged. The kernel refuses a filter command whose custom state is not JSON (`invalid-filter`, detail `not json`) before the key is made.
- **Step 8 as built** (docs/behaviors/filter-custom.md): `filterKinds` is a fixed grid setting, read once by `filterKindLookup` (bad or duplicate names: `invalid-filter` at `filterKinds[i]`); `compileFilter(model, env, kinds?)` mirrors the wire checks and details; `filter-needs-server` is raised by the browser compile only, so it follows placement with no extra logic; a row whose `test` throws is not kept and the problem is said once; a filter problem new to a query change is told once (`ModelChange.told`). `GridFeature.kinds` is deferred.
- **The floating summary** for a custom kind with no `floating.<kind>` part is a button labelled `filter.summaryActive {column}`, which opens the popup.

### B2.6 Accessibility, RTL, messages

- **Popup filter:**
  - The popup is `role="dialog"`, named by `aria-label` from `filter.popupLabel {column}` (step 1 decision; not `aria-labelledby`).
  - It opens from the header filter button (≥ 24 px) or with Alt+ArrowDown on the header. The `openMenu` intent's owner is `header`.
  - Focus goes to `part.focus()`, or to the first focusable element. Tab is trapped inside, a pointer down outside does not close it, and Escape closes and returns focus to the anchor (the button, or the header cell after Alt+ArrowDown).
  - It is placed logically (block-end, inline-start in the reading direction) through `dir.ts` and the top-layer popup host from step 0.8.
- **Floating row:**
  - It is a header row (step 0.3), with cells that take focus in the grid's roving order.
  - Enter or F2 enters the input. Its owner is `filter-input`, so arrows, Home, End and Ctrl+A stay in the input. Escape returns to the cell.
  - Inputs are labelled `filter.inputLabel {column}`.
  - An unreadable number gets `aria-invalid` and no dispatch.
- **Cell parts with controls (buttons, links):**
  - The cell keeps grid focus. Enter calls `focus()` on the part, and Tab cycles inside it, as in the WAI-ARIA grid pattern for widgets in cells. Escape returns to the cell.
  - The owner `cell-widget` is inferred from the control (`keys/owner.ts`); the part's container need not carry `data-dzg-owner`. Enter or F2 calls `focus()`.
- **Footer:** the page change is announced (`announce.page`), and focus stays on the control that was used.
- **Messages:**
  - Built-in parts use only `MessageKey`s. The guards forbid literal text.
  - Host parts may use `app.*` keys, which the host adds to its `messages` bundle. An `app.*` key missing from the bundle gives the key itself and the warning `missing-message`, once per key (step 1 decision: it is found when used, not by `checkMessages`).
  - Bundles stay one per language, within 2 kB gz each.

### B2.7 The Angular adapter (Phase 3, step 22)

```ts
export function componentPart<S extends Slot>(slot: S, cmp: Type<unknown>): SlotPart<S>;
// mount = createComponent + attachView; update = setInput('context', c) + detectChanges on that view (S6 pooled pattern)
@Directive({ selector: 'ng-template[dzgPart]' })   // <ng-template dzgPart="statusBadge" slot="cell" let-c> … </ng-template>
export class DzgPart { readonly dzgPart = input.required<string>(); readonly slot = input.required<Slot>(); }
// provideDzGrid({ parts: { statusBadge: componentPart('cell', BadgeComponent) } })
```

- Templates and components both become entries in `parts`. There is one resolution path.
- D8's "template wins over a `cells[id]` renderer" rule is replaced by the resolution order in §B2.2. A template named like a provided part overrides it, with the warning `part-shadowed`.

### B2.8 Three worked examples

**1. A status badge cell**

```ts
import { createGrid, definePart } from '@dzgrid/dom';
const statusBadge = definePart('cell', {
  mount(host, c) {
    const el = c.doc.createElement('span');
    host.append(el);
    const paint = (c: typeof c) => {
      el.className = `app-badge app-badge--${String(c.value ?? 'none')}`;  // tone through theme classes, no colour in TS
      el.textContent = c.text;                                             // the translated enum label
    };
    paint(c);
    return { update: paint, destroy: () => el.remove() };
  },
});
createGrid(root, { /* … */ parts: { statusBadge },
  columns: [{ id: 'status', type: 'enum', enumOptions, ui: { cell: 'statusBadge' } }] });
```

What the user sees and gets for free: sorting by label rank, the value-list filter (`filter.set`, the enum default), quick search on the label, CSV with the label or the code, and RTL. Nothing else changes.

**2. A "between two numbers" filter with a slider**

```ts
// core part (pure, also usable in Node tests)
type Between = { readonly min: number | null; readonly max: number | null };
export const between: FilterKind<Between, number> = {
  name: 'between', types: ['number'],
  read: (s) => isBetween(s) ? s : 'invalid',
  active: (s) => s.min !== null || s.max !== null,
  test: (s) => (v) => v !== null && (s.min === null || v >= s.min) && (s.max === null || v <= s.max),
  wire: (s) => ({ gte: s.min, lte: s.max }),
};
// DOM part
const betweenSlider = definePart('filter', {
  mount(host, c) {
    const lo = range(c, 'app.between.min'), hi = range(c, 'app.between.max');   // <input type="range"> + labels via c.msg
    const push = () => c.set({ min: lo.valueAsNumber, max: hi.valueAsNumber }, { commit: 'debounced' });
    lo.addEventListener('input', push); hi.addEventListener('input', push);
    host.append(lo, hi);
    const show = (c: typeof c) => { const s = c.state as Between | null; lo.value = String(s?.min ?? ''); hi.value = String(s?.max ?? ''); };
    show(c);
    return { update: show, focus: () => (lo.focus(), true), destroy: () => { lo.remove(); hi.remove(); } };
  },
});
createGrid(root, { /* … */ filterKinds: [between], parts: { 'filter.between': betweenSlider },
  columns: [{ id: 'age', type: 'number', filter: { kind: 'between', floating: true } }] });
```

- **Filter model:** `{ age: { type: 'custom', kind: 'between', state: { min: 18, max: 65 } } }`. It is serialisable, fits in a URL, and round-trips through `read`.
- **On the client:** `test` filters the rows.
- **On the server:** the request carries `filter.age = { type: 'custom', kind: 'between', value: { gte: 18, lte: 65 } }`.
- **Floating row:** a summary button that opens the popup, until a `floating.between` part is registered.
- **Note:** in RTL a native range input fills from the inline end, so the parts must not set any physical side.

**3. Switch the audit grid from client paging to server paging with one setting**

```ts
const audit: DataSource<AuditRow> = {
  fetch: (req) => api.auditLogs(toParams(req), req.signal),   // toParams maps req.filter/sort/quick/page (page may be absent)
  values: (req) => api.auditValues(req.column, req.search, req.signal),
};
// Before: the server filters, sorts and searches; the browser pages a fetched set (≤ maxRows)
createGrid(root, { source: audit, operations: { filter: 'server', quick: 'server', sort: 'server', page: 'client' }, columns, /* … */ });
// After: 10⁷ rows, unknown total
createGrid(root, { source: audit, operations: 'server', columns, /* … */ });
```

- The columns, filters, parts and pager stay the same.
- What changes:
  - `fetch` now receives `req.page`;
  - the pager shows "of many" when there is no `total`;
  - select-all switches to exclude mode bound to the filters and the search (§B1.6);
  - CSV "all" goes through `exportAll` (D7).
- In Angular, `[operations]` is fixed: the host swaps it under `@if`, as D8 already prescribes for `rowModel`.

---

## B3. Packages and tree-shaking

| Subpath | Contents |
|---|---|
| `@dzgrid/core` | kernel; `RowModel` contract; `ClientModel` with the page stage and `allRows`; `resolveOperations` and `splitQuery`; `FilterKind` and the custom variant; `setValues` |
| `@dzgrid/core/server` | gate; `sourceRows`; `toWire` |
| `@dzgrid/core/spans` | the span engine: `buildSpanMap`, `headerBands`, `navigate` (step 9b) |
| `@dzgrid/core/csv` | the CSV writer: `toCsv`, `csvChunks`, `csvRows`, `csvColumns`, `csvSeparatorFor`; types `CsvOptions`, `CsvInput`, `CsvSummary`, `ExportRequest` (step 10) |
| `@dzgrid/dom` | `createGrid`; `Part`, `definePart`; registry resolution for cells; the built-in header, overlay (with its retry button) and tooltip, and their seams |
| `@dzgrid/dom/slots` | `slots()`: header, overlay and tooltip parts in place of the built-ins (step 11, decision O1) |
| `@dzgrid/dom/popup` | the popup host (`popupsFor(g)`), imported by the features that open popups |
| `@dzgrid/dom/filters` | `filters({ datePicker?, floating?, debounceMs? })`: the six `filter.*` parts, `floating.text` and `floating.number`, the summary floating part, `bindQuickSearch`. The value list is loaded lazily inside it (cut 3). |
| `@dzgrid/dom/pagination` | `pagination()`: `footer.pager`, `footer.count`, `footer.selected` |
| `@dzgrid/dom/parts` | `cell.badge`, `cell.boolean` (small, optional) |
| `@dzgrid/dom/export` | `csvExport()` |
| `@dzgrid/dom/tzslot-picker` | optional date-picker adapter |
| `@dzgrid/angular` | `DzGrid`, controller, `provideDzGrid`, `DzgPart`, `componentPart`, `fromObservable` |

- **Feature contract:**
  ```ts
  interface GridFeature {
    readonly id: string;
    readonly parts?: Readonly<Record<string, SlotPart>>;
    readonly kinds?: readonly FilterKind[];
    setup?<T>(ctx: FeatureContext<T>): FeatureHandle;
  }
  ```
  `FeatureContext` and `FeatureHandle` are as in D9, kept internal-facing.
- **Missing features:** a grid with `page !== 'off'` and no `pagination()` gives `missing-feature` (warning). The same applies to a filterable column with no `filters()`.
- **Import-graph test:** the base never imports a subpath, and `/filters` never imports `/tzslot-picker`.

---

## B4. Phase 3 steps, mapped onto this design

**Step 0: the eight items stay first, in order, with these refinements.**

| Item | What it covers |
|---|---|
| 0.1 | The `RowModel` contract of §B1.4 (`kind: 'client' \| 'source'`, `ops`, `page`, `counts`, `keeps`, `selectAll`); kernel commands `filter.set`, `filter.column`, `quick.set`, `page.go`, `page.size`, `selection.all`, `rows.refresh`; `resolveOperations` and `splitQuery`, with conformance cases for every row of the §B1.2 matrix |
| 0.2 | Split `grid.ts` (unchanged) |
| 0.3 | Header rows as a value (unchanged) |
| 0.4 | Owners `filter-input`, `popup`, `cell-widget`; header clicks ignore interactive descendants |
| 0.5 | `UPDATE_POLICY`: `operations` fixed; `source` and `parts` live |
| 0.6 | Events (unchanged) |
| 0.7 | **The `Part` contract and the registry**, wired for the `cell` slot first: pooling, update rules, throw isolation, `unknown-part`. It replaces the D9 cell contract. |
| 0.8 | Popup host in the top layer, tooltip as the `tooltip` slot, row height following text zoom |

**Then:**

| # | Step | Layer |
|---|---|---|
| 1 | Behaviour sheets: `operations.md` (the matrix, the fetched set, refusals), `server-pagination.md`, `request-order.md`, `filter-ui.md`, `parts.md`, `csv-export.md`, `server-selection.md` | docs |
| 2 | Angular and packaging tooling (unchanged) | build |
| 3 | Request gate (unchanged; ≥ 12 cases plus the property test) | core/server |
| 4 | Page stage in `ClientModel` (client paging, memoised, `aria-rowcount` per page) | core |
| 5 | `sourceRows`: server stage plus inner `ClientModel`; fetched set and server page; unknown total; cursor; `maxRows` | core/server |
| 6 | `toWire` with resolved instant bounds and the custom wire form | core/server |
| 7 | Selection across pages and fetched-set reconciling (§B1.6) | core |
| 8 | `FilterKind`, the custom variant, `ColumnCache.values`, `filter-needs-server` | core |
| 9 | `setValues` (client) and `DataSource.values` through the gate channel `values:<col>` | core |
| 10 | CSV (unchanged) | core |
| 11 | Parts for `header`, `overlay` and `tooltip` slots, in `@dzgrid/dom/slots`; the retry button in the base (decisions `step11-decisions.md`) | dom |
| 12 | `/filters` part 1: the floating row (`floating.text`, `floating.number`, the summary part) | dom |
| 13 | `/filters` part 2: popup with `filter.text`, `filter.number`, `filter.boolean`, active mark, `openMenu` | dom |
| 14 | `/filters` part 3: `filter.day` and `filter.instant` with the native picker | dom |
| 15 | `/filters` part 4: `filter.set`, virtualised, with Apply when the filter runs on the server | dom |
| 16 | `/filters` part 5: `bindQuickSearch` (server `quick` or the client warm-up) | dom |
| 17 | `/pagination`: `footer.pager`, `footer.count`, `footer.selected`, for client and server paging | dom |
| 18 | Playground audit screen in **both** configurations of example 3; 1 000 permutations each; axe; screenshots | browser |
| 19 | `/export`: `csvExport` and `exportAll` | dom |
| 20 | `/parts`: `cell.badge`, `cell.boolean`; plus worked example 2 as a test fixture | dom |
| 21 | `/tzslot-picker` (optional) | dom |
| 22 | `@dzgrid/angular`: component, controller, providers, `componentPart`, `DzgPart` (S6 pooling) | angular |
| 23 | The Angular audit example from the tarballs, `ng build` | example |
| 24 | Sehhaty transposition (`to-query.ts` maps `DataRequest`; needs the owner's §1.1 inputs) | example |
| 25 | Budgets, review, close | all |

**Cut order if a step overruns.** Each cut goes into ROADMAP with its target phase.

1. `/tzslot-picker`, to P5.
2. Cursor paging, if the owner's API uses offsets.
3. Value-list virtualisation above 2 000 values (cap plus "refine your search"), to P5.
4. The second AND/OR condition in the popup UI (the model keeps `combined`), to P5.
5. Editable floating filters beyond text and number (summary only).
6. `/parts` (badge, boolean): hosts register their own, and the contract is untouched.
7. `componentPart` in Angular (keep `DzgPart` templates).
8. `header` as a host-replaceable slot (keep the default header, reserve the slot).
9. The fetched-set mixes other than "all server except page" (keep `rows`, `'server'`, and server filter, sort and quick with client paging).
10. Firefox and WebKit browser runs (Chrome is mandatory).

**Never cut:**
- the gate suite and the 1 000 permutations;
- the `invalid-operations` matrix;
- the resolved `[from, to)` bounds;
- the CSV guard and BOM;
- the 85 kB audit profile;
- the Angular echo tests;
- axe on the popup, the floating row and the pager;
- the `Part` contract (0.7) and the custom `FilterKind`, because the owner's request is exactly this extensibility.

**Budget changes:**
- `@dzgrid/core/server` grows by `sourceRows`, expected ≤ 6 kB.
- The core grows by `operations`, the page stage and `FilterKind`, about 1 kB more.
- The `/parts` entry is ≤ 1.5 kB.
- Two benches are added:
  - `custom kind test 100 000 rows` ≤ 15 ms;
  - `client page change (100 000 sorted)` ≤ 1 ms.

---

## B5. Decisions for the owner

1. **Where operations run.**
   - Each of filter, search, sort and paging is set to "browser" or "server" in one setting, with `'server'` as the default when you give a fetch function.
   - The one rule: **if paging is on the server, everything else must be too.** Otherwise one page would be filtered or sorted alone and the counts would lie.
   - An invalid setting is refused with a clear error and treated as "all server". OK?
   - *Step 1 (2026-10-17):* the reading is per refusal, as `resolveOperations` does it: "server" only under server pages; a server placement without a source is read as the browser; an unknown value keeps the default (`operations.md`).
2. **The "fetched set" mode in Phase 3**: the server filters and sorts, and the browser pages a result of up to 100 000 rows, with a warning above that. Keep it in Phase 3, or ship only "all browser" and "all server" now?
3. **Plug-ins are referenced by name**: you register `statusBadge` once (app-wide in Angular) and columns say `ui: { cell: 'statusBadge' }`. Column definitions stay plain data, which can be saved and shared. There is no second way of passing objects directly. OK?
4. **Custom filters**: a custom filter is a small pure description (its saved state, how to test a row in the browser, what to send to the server) plus its screen part. A filter with no browser test works only when filtering is on the server. OK?
5. **Floating filter row**: off by default and turned on per column? On the audit screen: text and number as live boxes, dates and lists as a summary button that opens the popup?
6. **When filters apply**: live as you type (300 ms pause when the server filters), but value lists on the server wait for an "Apply" button so that each tick is not a request. OK?
7. **Inventory priorities**: confirm the "M" rows for Phase 3, and say what moves to later. My proposals are relative dates, the page-number jump and tool panels to Phase 5, and the advanced expression filter to Phase 8.
8. **Value formatter**: it changes what is shown, searched and put in tooltips. CSV keeps the raw value (numbers and dates Excel can compute with) unless you ask for "as displayed". OK?

### Critical files for implementation
- /Users/nadou/Dev/dzgrid/packages/core/src/model/client.ts
- /Users/nadou/Dev/dzgrid/packages/core/src/kernel.ts
- /Users/nadou/Dev/dzgrid/packages/core/src/filter/compile.ts
- /Users/nadou/Dev/dzgrid/packages/core/src/columns/defs.ts
- /Users/nadou/Dev/dzgrid/packages/dom/src/grid.ts
- /Users/nadou/Dev/dzgrid/packages/dom/src/render/rows.ts