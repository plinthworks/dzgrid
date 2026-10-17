# DzGrid Phase 3: server paging, filter UI, CSV export, Angular wrapper. Implementation plan

## 0. Caveats

- **Nothing was run.** I ran no tests, typecheck, build, browser or bench. Every number here is quoted from `ROADMAP.md`, a spike README or `size-budget.json`, or it is a target that still has to be measured.
- **Read in full:**
  - `CLEANROOM.md`, `CLAUDE.md`, `ROADMAP.md`, `docs/phase-2-plan.md`;
  - `ARCHITECTURE.md`: every owner decision, every "Ajustements" section, and §2–§8;
  - the behaviour sheets `filter-*`, `quick-filter`, `overlays`, `selection`, `sort`, `instant-reading`, `display-format`;
  - in the core: `kernel.ts`, `model/{types,query}.ts`, the head and interface of `model/client.ts`, `selection/rows.ts`, `filter/{model,instant}.ts`, `row/displayed.ts`, `value/codec.ts`, `problems.ts`, `focus.ts`, the heads of `columns/{defs,model}.ts`, `index.ts`, `internal.ts`, and the forbidden-names list in `purity.test.ts`;
  - in the DOM layer: `grid.ts` (832 lines), `settings.ts`, `messages.ts`, `locales/en.ts`, `keys/owner.ts`, `render/{header,rows}.ts`, and the heads of `render/tooltip.ts`, `idle.ts`, `interact/scroll.ts`, `a11y/live-region.ts`;
  - the S6 README in full and the head of the S8 README;
  - `scripts/{build,size}.mjs`, the head of `scripts/browser.mjs`, `size-budget.json`, `perf/{budgets,browser-budgets}.json`, `perf/profiles/readonly-client.ts`, `vitest.config.ts`, `package.json`.
- **Not read:** the S7 README (CSV does not need it); `filter/compile.ts` beyond its signatures; `column-cache.ts`; the conformance harness internals; the DOM tests.
- **Sister projects:**
  - tzslot: `packages/angular` (calendar wrapper, providers, `ng-package.json`, `tsconfig.lib.json`, test `setup.ts`, `packaging.test.ts`), its build `angular()` step, `pack:local`, `vitest.config.ts`.
  - **DzCalendar has no Angular package** (`packages/` = core, dom, motion-gsap, rrule, theme), so the Angular conventions come from tzslot only.
- **Tooling gap, confirmed:**
  - dzgrid's `node_modules/@angular` has no `build` package, and the root has no `ng-packagr`. S6 hit the same gap.
  - tzslot has `@angular/build ^21.2.24` and `ng-packagr ^21.2.7` as devDependencies, which is why its Analog vitest plugin works.
- **Not read, as instructed:** Sehhaty and sehhaty-dashboard. The audit-logs screen's columns, filters and API are listed as owner inputs in §1.1.
- **From memory, [À VÉRIFIER]:**
  - `popover` arrived in Firefox 125, but K.7 targets 120.
  - Native `<input type="date">` takes its display and digits from the browser's locale, not the grid's.
  - `provideZonelessChangeDetection` is stable from Angular 20; Angular 19 has the experimental name.
- **Clean room:** no grid library source was opened, `node_modules` included.

## 1. Decisions to validate with the owner before coding

### 1.1 Inputs the owner must provide (blocking for exit criterion 1 only)

Write these as `docs/sehhaty/audit-logs.md`. Steps 1–21 do not wait for them: they are built against the simulated server.

```ts
// The seven columns, one entry each
interface AuditColumnSpec {
  id: string;                    // stable, e.g. 'occurredAt'
  field: string;                 // path in the API row, e.g. 'actor.name'
  header: { fr: string; ar: string };
  type: 'text' | 'number' | 'day' | 'instant' | 'enum' | 'boolean';
  enumOptions?: { value: string; label: { fr: string; ar: string } }[];  // e.g. action codes
  freeText?: boolean;            // names, comments (bidi isolation)
  serverSortable: boolean;       // can the API sort by it?
  width?: number; pinned?: 'start' | 'end';
  instantPrecision?: 'minute' | 'second' | 'millisecond';
}

// The seven server filters
interface AuditFilterSpec {
  name: string;                  // as shown today (fr/ar)
  column: string | null;         // the column it filters, or null (actor role, IP, tenant…)
  kind: 'text-contains' | 'text-equals' | 'enum-one' | 'enum-many' | 'day-range' | 'instant-range' | 'number-range' | 'boolean';
  apiParam: string | string[];   // e.g. 'from'/'to', 'action[]'
  wire: string;                  // exact value format: ISO with Z? 'YYYY-MM-DD'? CSV list? repeated param?
  valuesSource?: 'static' | 'endpoint';  // enum lists: fixed, or fetched (URL + shape)
}

// The API
interface AuditApiSpec {
  paging: 'page-0' | 'page-1' | 'offset-limit' | 'cursor';  // cursor: param name + where the next cursor comes back
  pageSizes: number[]; maxPageSize: number;
  sortParam: string;             // e.g. 'sort=occurredAt,desc'; multi-sort allowed?
  count: 'total' | 'hasNext' | 'none';                      // does the response carry a total, a has-next, or neither?
  envelope: string;              // JSON response example with 2 rows (fake values)
  rowId: string;                 // which field is unique
  timestamps: 'with-offset' | 'no-offset';                  // if no offset: the zone they are written in
  displayZone: string;           // e.g. 'Africa/Algiers'
  errors: string;                // HTTP codes and body
  export: 'none' | 'sync-file' | 'async-job';               // endpoint, params, what comes back (url? blob?)
  quickSearch: boolean;          // does the API take a free-text search?
  urlState: boolean;             // are filters kept in the URL today?
  selectionUsed: boolean;        // does the screen select rows (bulk action)?
  ssr: boolean;                  // is the dashboard server-rendered?
}
```

The owner also still owes, from Phase 2:
- `packages/theme/test/fixtures/sehhaty.json`: six palettes × light/dark, shape as in `sehhaty.example.json`;
- an Arabic reader for `locales/ar.ts`.

### 1.2 Decisions (D1–D9)

**D1 — The kernel owns the query, and every row model meets one contract (Before-Phase-3 item 1).**
- **Recommendation:**
  - The kernel holds `query: Query` and pushes it with `rows.setQuery(q, source)`. `RowModel` loses no capability, but the kernel never reads `rows.query` again.
  - `createKernel` takes `RowModel<T>` instead of `ClientModel<T>`. The grid narrows on `kind === 'client'` for `setRows` and `applyTransaction`.
  - Models are created through a factory that receives what the core cannot name: the abort controller and `getRowId`.
- **Reason:** the paged model must not wipe the selection of rows on other pages, and the core cannot name `AbortController` (lib ES2023 only). Keeping one `getRowId`, in the settings, avoids two sources of identity.

```ts
// packages/core/src/model/types.ts
export interface RowCounts { readonly total: number | null; readonly filtered: number | null; readonly displayed: number }
export type ModelStatus = { readonly phase: 'idle' } | { readonly phase: 'loading' } | { readonly phase: 'error'; readonly failure: FetchFailure };
export interface FetchFailure { readonly key: string; readonly page: number; readonly error: unknown }  // the host's error, unchanged
// [Superseded by phase-3-plugins.md B1.5: `failure` is the host's error itself (unknown); `fetchFailed {error, key, page}` carries the context.]
export interface ModelChange<T> { readonly source: ChangeSource; readonly displayed: DisplayedRows<T>;
  readonly kind: 'rows' | 'order' | 'query' | 'context' | 'page' | 'status'; readonly transaction?: TransactionResult; readonly problems: readonly Problem[] }
export interface RowModel<T> {
  readonly kind: 'client' | 'paged';
  readonly displayed: DisplayedRows<T>; readonly status: ModelStatus; readonly counts: RowCounts;
  /** What a select-all means here. Client: the displayed rows (include). Paged: everything the query matches (exclude). */
  readonly selectAll: 'displayed' | 'query';
  /** Whether a selected key survives a change. Client: the row still exists. Paged: always (unseen pages). */
  keeps(key: RowKey): boolean;
  row(key: RowKey): DataNode<T> | undefined;          // paged: the current page only
  setQuery(q: Query, source?: ChangeSource): void;
  setColumns(c: ColumnLookup<T>, source?: ChangeSource): void;
  setContext(ctx: LocaleCtx, source?: ChangeSource): void;
  invalidate(o?: { readonly purge?: boolean }): void;
  subscribe(fn: (c: ModelChange<T>) => void): () => void;
  destroy(): void;
}
export interface AbortSignalLike { readonly aborted: boolean; readonly reason?: unknown }
export interface AbortHandle { readonly signal: AbortSignalLike; abort(reason?: unknown): void }
export interface ModelEnv<T> { readonly getRowId: (r: T) => RowIdInput; readonly columns: ColumnLookup<T>; readonly ctx: LocaleCtx;
  readonly abort: () => AbortHandle }   // the DOM layer passes () => new AbortController()
export interface RowModelFactory<T, M extends RowModel<T> = RowModel<T>> { readonly kind: M['kind']; create(env: ModelEnv<T>): M }
```

**D2 — Selection on a server model.**
- **Recommendation:**
  - Include-mode keys survive page, sort and filter changes (invariant 11; `keeps()` is always true).
  - Select-all on a paged model gives `{ mode: 'exclude', keys: ∅ }`, **bound to the query key at that moment**. Any later query change clears an exclude selection, with source `data` and an announcement, because "all" meant "all rows matching that query". *[Superseded by phase-3-plugins.md B1.6: bound to the filters and the search (later `params` and the zone), not the sort; a sort keeps it.]*
  - `selectionChanged` gains `query: Query | null`, set in exclude mode, so a host bulk action can send `{ exclude, query }` to the server.
  - `count` is `null` when the total is unknown, which reads as "all rows matching the filters". *[Superseded by phase-3-plugins.md B1.6: `count` = `counts.filtered − excluded`.]*
  - The header box acts on the whole query, not the page. Its tri-state is computed over the page.
  - The option `selection.selectAll: 'query' | 'page'` exists; the default for paged is `'query'`. *[Superseded by phase-3-plugins.md B1.6: no such option; a host selects the page with `selection.set`.]*
- **Reason:** 10⁷ keys are never held in memory, and an exclude set carried over to a different filter would select rows the user never saw.

**D3 — The paged model's API.**
- **Recommendation:**
  - Pages are 0-based. `pageSize` defaults to 50, `pageSizes` to `[25, 50, 100]`.
  - Offset paging is the default. Cursor paging is an option (`paging: 'cursor'`): the model caches the cursor of each page reached within the epoch, so you can go next, previous or back to page 0, but never jump.
  - If `total` is absent, `hasNext` is required. If both are missing, the problem `invalid-page-response` (warning) is raised and `hasNext = rows.length >= pageSize`.
  - Rows beyond `pageSize` are kept, with the same warning.
  - A query change (sort, filter, quick, params, pageSize, zone) starts a new **epoch** and goes back to page 0, except a page-size change, which keeps the first row: `page = floor(page·old / new)`.
  - The previous page stays displayed while the next one loads (`status: loading`, `aria-busy`, stale-row styling), so focus and selection keep their rows.
  - A page past the end when the total is known is clamped to the last page and refetched once.
  - **Stale gate:**
    - one channel, `page`; *[Superseded by phase-3-plugins.md B1.5: the channel is `rows`.]*
    - the latest `seq` in the current epoch wins;
    - superseded requests are aborted;
    - a rejected promise from a stale ticket is dropped silently, and an abort is never an error;
    - an accepted rejection gives `status: error` plus a `fetchFailed` event, and the overlay offers a retry (`rows.refresh`).
  - Debouncing belongs to the filter inputs in the DOM layer (300 ms for paged), not to the model, because the core has no timers.
- **Reason:** audit logs at 10⁷ rows are often paged by keyset, so cursor mode has to exist. It ships only if the owner's API needs it (cut 2).

```ts
// packages/core/src/server/paged.ts  (@dzgrid/core/server)
export interface PageRequest {
  readonly page: number; readonly pageSize: number; readonly offset: number; readonly cursor: string | null;
  readonly sort: readonly SortItem[]; readonly filter: WireFilterModel; readonly quick: string;
  readonly params: Readonly<Record<string, Json>>; readonly zone: string;
  readonly key: string;                // canonical: query + page + size (for host caching and logs)
  readonly signal: AbortSignalLike;
}
export interface PageResponse<T> { readonly rows: readonly T[]; readonly total?: number; readonly hasNext?: boolean; readonly nextCursor?: string | null }
export type PageFetch<T> = (req: PageRequest) => Promise<PageResponse<T>> | PageResponse<T>;
export interface PagedOptions<T> { readonly fetch: PageFetch<T>; readonly pageSize?: number; readonly pageSizes?: readonly number[];
  readonly page?: number; readonly paging?: 'offset' | 'cursor' }
export interface PagedModel<T> extends RowModel<T> {
  readonly kind: 'paged'; readonly page: number; readonly pageSize: number; readonly pageSizes: readonly number[];
  readonly total: number | null; readonly hasNext: boolean; readonly canJump: boolean;
  readonly diagnostics: { readonly requests: number; readonly applied: number; readonly dropped: Readonly<Record<DropReason, number>> };
}
export function pagedRows<T>(o: PagedOptions<T>): RowModelFactory<T, PagedModel<T>>;
```

**D4 — Server filters that are not a visible column.**
- **Recommendation:** two mechanisms.
  - (a) A filter may target a column with `hidden: true`. It keeps its type and codec, and for instants its resolved bounds.
  - (b) `Query.params`: free JSON owned by the host, included in the key and passed through in `PageRequest.params`, for things like a tenant.
- `FilterModel` stays keyed by column id.
- **Reason:** typed values and `[from, to)` bounds come for free with (a). (b) covers what has no type.

**D5 — The filter UI.**
- **Recommendation:**
  - A **filter button** in each filterable header opens a **popup** (`role="dialog"`). The same popup opens with `Alt+ArrowDown` on the header, through a new intent `openMenu` whose owner is `header`.
  - Popup content by type:
    - text and number: operator, value, and an optional second condition joined by AND/OR;
    - boolean: all / yes / no;
    - day and instant: operator and date inputs (D6);
    - enum and set: a searchable checkbox list with "blanks" and "select all", virtualised beyond 2 000 values.
  - **Floating filters** are opt-in per column (`floatingFilter: true`) or grid-wide. *[Superseded by phase-3-plugins.md B0: `filter.floating` per column, `filters({ floating })` for the grid.]* They are a second header row: text and number get a live input (debounced 300 ms paged, 150 ms client); the other types get a read-only summary button that opens the popup.
  - Apply on change. There is no "Apply" button, except the value list in paged mode, where each tick would be a request. *[Superseded by phase-3-plugins.md B5.6: the Apply button shows whenever `filter` runs on the server, fetched set included.]*
  - Value-list source, in order:
    1. `enumOptions` (static, translated labels);
    2. client: `setValues()` from the data, with counts, ignoring the column's own filter;
    3. paged: the host's `values(column, request) => Promise<readonly SetValue[]>`, counts optional.
  - The header shows an "active filter" mark, and a label carries the state for screen readers.
- **Reason:** this is the §6 deliverable as written, and the popup is the only shape that holds day, instant and value-list filters. Whether the audit screen shows the floating row is the owner's call (§1.1 `AuditFilterSpec.kind` decides per filter).

```ts
// packages/core/src/columns/defs.ts (additive)
export type FilterSpec = { readonly ops?: readonly string[]; readonly floating?: boolean; readonly debounceMs?: number;
  readonly values?: 'data' | 'options' | 'host' };
// ColumnDef: readonly filter?: false | FilterSpec;  readonly floatingFilter?: boolean;   [Superseded by B0: no floatingFilter, FilterSpec.floating]
// packages/core/src/filter/set-values.ts
export interface SetValue { readonly value: string /* toExport form */; readonly label: string; readonly count: number | null }
export function setValues<T>(model: ClientModel<T>, column: string, o?: { search?: string; limit?: number }): { values: readonly SetValue[]; blanks: number; truncated: boolean };
```

**D6 — Day and instant inputs (K.2: no Temporal in core or dom).**
- **Recommendation:**
  - `DatePickerAdapter` lives in `@dzgrid/dom/filters`. The default is native `<input type="date">`, plus `<input type="time" step="1">` for instant moments.
  - A typed wall time becomes an instant through `resolveWall(zone, 'reject')` (Phase 1 D8). A time inside a clock change is an input error with its message, never shifted.
  - `onDay` and `betweenDays` need days only.
  - The tzslot adapter is an optional subpath, `@dzgrid/dom/tzslot-picker`, with `@tzslot/dom` as an **optional peer**. It sits outside the audit profile and is the first thing cut.
- **Reason:** the native input works without dependencies, and its value is always ISO Gregorian. Its displayed locale may differ from the grid's [À VÉRIFIER per engine]; the tzslot adapter is the fix for whoever cares.

```ts
export interface DatePickerAdapter {
  mount(host: HTMLElement, o: { readonly kind: 'day' | 'time'; readonly value: string | null; readonly label: string;
    readonly locale: string; readonly dir: 'ltr' | 'rtl'; readonly onChange: (v: string | null) => void }): { update(v: string | null): void; focus(): void; destroy(): void };
}
export const nativeDatePicker: DatePickerAdapter;
```

**D7 — CSV format and the export gate.**
- **Recommendation:**
  - RFC 4180, CRLF line ends, BOM on by default.
  - The separator follows the locale: `;` when the locale's decimal separator is `,` (fr, ar-DZ in latn digits), `,` otherwise.
  - **Numbers** use the locale's decimal mark when the separator is `;` (`numbers: 'excel'`, the default) and machine form with `numbers: 'raw'`. Excel in French reads `1.5` as text, or as a date.
  - Days are ISO `YYYY-MM-DD`.
  - Instants are written as **wall time in the display zone**, `YYYY-MM-DD HH:mm:ss`, with the zone named in the header (`Date (Africa/Algiers)`). `instants: 'iso'` gives `…Z` instead. This is the same rule as S8.
  - Enum cells hold the translated label by default; `enums: 'code'` gives the raw code. These are the "value" rules; `CsvOptions.text: 'display'` writes the displayed text instead (B2.4, step 1 decision).
  - Formula guard: a **text** cell starting with `= + - @ \t \r` gets a `'` prefix. Typed numbers never do.
  - What is exported:
    - client: displayed (filtered and sorted), or selected;
    - paged: the current page, or the host's `exportAll(req)`, which receives the current `PageRequest` minus page and signal and returns `{ url } | { blob } | void`. 10⁷ rows never go through the client. *[Superseded by phase-3-plugins.md B1.3, and `csv-export.md`: `exportAll(req: ExportRequest)`, whose `server` is the `DataRequest` without page and signal; `all` is every row the query matches, `selected` with server pages goes to `exportAll` too.]*
  - **Audit hook:**
    - a settings callback `canExport(req: ExportRequest) => boolean | Promise<boolean>` — false refuses, with an announcement;
    - events `exportRequested`, `exportFinished` and `exportRefused`, which are data only.
  - This replaces the "cancellable event" of §3.16, because kernel events are serialisable data with no `preventDefault`.
- **Reason:** what an administrator opens in Excel has to be numbers and local times, and a health-data host has to be able to refuse or log the export.

```ts
// packages/core/src/export/csv.ts (core base, tree-shaken when unused)
export interface CsvOptions { readonly separator?: ',' | ';' | '\t'; readonly bom?: boolean; readonly header?: boolean;
  readonly sanitizeFormulas?: boolean; readonly numbers?: 'excel' | 'raw'; readonly instants?: 'wall' | 'iso';
  readonly enums?: 'label' | 'code'; readonly columns?: readonly string[]; readonly text?: 'value' | 'display' /* step 1 decision */ }
export function csvSeparatorFor(ctx: LocaleCtx): ',' | ';';
export function* csvChunks<T>(rows: Iterable<DataNode<T>>, cols: readonly ResolvedColumn<T>[], ctx: LocaleCtx, o?: CsvOptions & { readonly chunkRows?: number }): Generator<string>;
```

**D8 — The Angular wrapper.**
- **Recommendation:**
  - Standalone, OnPush, signal inputs, `model()` for state, no NgModule, no CDK, no RxJS at runtime (`fromObservable` uses `firstValueFrom`, and `rxjs` is an optional peer).
  - `createGrid` is called in **`ngOnInit`**, not in the constructor (deviation from §3.12). Required inputs (`columns`, `getRowId`) throw NG0950 if read before binding. On a server platform it does nothing.
  - One `computed` of settings, applied by `effect(() => untracked(() => grid.update(s)))`, as in tzslot.
  - State models dispatch `*.set` commands with source `host`. Kernel events update models only for sources `user` and `data`. The kernel ignores equal values (query key, `sameSelection`), which is the echo guard.
  - Outputs: one `gridEvent` with the full `GridEvent<T>`, plus typed `cellClicked`, `rowClicked`, `fetchFailed`, `problems` and `gridReady`.
  - Cell templates follow S6, behind the DOM cell contract (D9): pooled views, a mutated context plus `detectChanges` on that view, attached to `ApplicationRef`. When both a `dzgCell` template and a `cells[id]` renderer exist for a column, **the template wins**, with the warning problem `cell-renderer-shadowed`.
  - Under zone.js, `runOutsideAngular` for the instance and `run` for outputs. Zoneless is the tested path.
  - Peers `@angular/core ^19 || ^20 || ^21`. Tests run on 21 only; 19 and 20 get a smoke `ng build` from the tarballs if time allows, otherwise [À VÉRIFIER].
- **Reason:** this is the tzslot pattern, S6's measurements, and K.7.

**D9 — Package layout, the features seam, and the cell contract.**
- **Recommendation:**
  - Core:
    - `@dzgrid/core` base gains the kernel and model contract, `setValues` and CSV (pure, tree-shaken);
    - new subpath `@dzgrid/core/server`: gate and paged model.
  - DOM:
    - base gains the features seam, the popup module (top layer, also used by the tooltip) and the cell-renderer contract;
    - new subpaths `@dzgrid/dom/filters`, `@dzgrid/dom/pagination`, `@dzgrid/dom/export` and `@dzgrid/dom/tzslot-picker`.
  - Message bundles stay **one per language holding every key**, with a 2 kB gz budget each; a split per feature only if one goes over.
  - A paged model without `pagination()` gives the warning problem `missing-feature`.
  - Cell renderers live in **DOM settings** (`cells: Record<columnId, CellRenderer>`), not in the core `ColumnDef`, which keeps the core free of the DOM.

```ts
// packages/dom/src/features.ts
export interface GridFeature { readonly id: string; setup<T>(ctx: FeatureContext<T>): FeatureHandle }
export interface FeatureContext<T> {
  readonly kernel: GridKernel<T>; readonly doc: Document; readonly root: HTMLElement; readonly viewport: HTMLElement; readonly footer: HTMLElement;
  readonly scope: Scope; readonly popup: PopupHost; readonly live: { announce(text: string): void };
  settings(): GridSettings<T>; ctx(): LocaleCtx; dir(): Dir; msg(key: MessageKey, p?: Readonly<Record<string, string | number>>): string; schedule(): void;
}
export interface FeatureHandle {
  readonly headerRows?: readonly HeaderRowSpec[];                // e.g. floating filters
  decorateHeader?(col: ResolvedColumn<unknown>, el: HTMLElement): void;
  onIntent?(intent: Intent, at: FocusPos | null): boolean;      // true = handled
  update?(prev: GridSettings<unknown>, next: GridSettings<unknown>): void;
  destroy(): void;
}
// packages/dom/src/render/cell-renderer.ts
export interface CellContext<T, V = unknown> { readonly value: V | null; readonly text: string; readonly row: Readonly<T>; readonly key: RowKey;
  readonly column: string; readonly ctx: LocaleCtx; readonly dir: Dir }
export interface CellRenderer<T, V = unknown> { mount(cell: HTMLElement, c: CellContext<T, V>): CellHandle<T, V> }
export interface CellHandle<T, V = unknown> { update(c: CellContext<T, V>): void; unmount(): void }
```

## 2. Step 0: the eight "Before Phase 3" items (first, in this order)

Each item is small, its tests are written first, and the existing ~330 tests stay green.

**0.1 — Kernel and RowModel contract (item 1, D1, D2 for the client side).**
- **Files:** `core/src/model/types.ts`, `model/client.ts` (adds `counts.total: number`, `keeps`, `selectAll: 'displayed'`, the factory `clientRowsFactory`), `kernel.ts`, `selection/rows.ts`.
- **API:**
  - kernel: `readonly query: Query`;
  - new commands `filter.set {filter}`, `filter.column {column, filter: ColumnFilter | null}`, `quick.set {text}`, `selection.all`, `rows.refresh`;
  - events `filterChanged {filter}` and `quickChanged {text}`;
  - `selectionChanged` gains `query: Query | null`.
- **Tests first (`core/test/kernel-p3.test.ts`, suite `selection` extended):**
  - Reconciling through `keeps` with a fake model where `keeps = () => true` keeps keys that `row()` does not know.
  - `selection.all` on `selectAll: 'query'` gives exclude mode; a later `filter.set` clears it with source `data`.
  - `filter.set` with an equal canonical model emits nothing.
  - Every existing kernel test still passes against `ClientModel`.
- **Done when:** `public-api.test.ts` is updated, purity is green, and the core is within 22.3 kB (or raised at measured + 10 % by a ROADMAP decision).

**0.2 — Split `grid.ts` (item 2): a pure move.**
- **New files:**
  - `dom/src/context.ts` (`GridContext<T>`: kernel, settings getter, scope, schedule, geometry, renderers, live, `msg`, `ctx()`, `dir()`);
  - `render/viewport.ts` (`paint`: mapper, window, grid attributes, body sizes);
  - `render/overlay.ts`;
  - `render/header-decor.ts` (`decorateHeader`, `isLastEnd`);
  - `keys/router.ts` (keydown, `apply`, `current`);
  - `keys/focus.ts` (focusin/out, `pendingFocus`, `rovingStop`, `focusCellAs`, `ensureVisible`, `scrollInlineTo`);
  - `interact/select.ts` (body click, `toggleAll`);
  - `interact/header-click.ts`;
  - `features.ts` (an empty seam for now).
- `grid.ts` becomes composition only, ≤ 250 lines.
- **Tests first:**
  - `dom/test/structure.test.ts`: `grid.ts` ≤ 250 lines.
  - An import-graph test: nothing in `src/` outside `features.ts` imports `filters/`, `pagination/`, `export/` or `tzslot-picker/`, and the base does not import them at all.
- **Done when:** every DOM test is green unchanged, and `check:size` for `@dzgrid/dom` stays ≤ 14 kB.

**0.3 — Header rows as a value, and a row-count policy from the model (item 3).**
- **API:**
  - `HeaderRowSpec = { id: string; render(cell: HTMLElement, col: ResolvedColumn<unknown>): void; height?: number }`;
  - `aria-rowindex` of body row *i* = `headerRows.length + 1 + i`;
  - `aria-rowcount` = `displayed.count + headerRows.length` (for paged this covers the current page, per S4);
  - the body offset and the overlay top use the total header height.
- **Tests first:** with one extra header row, the first body row has `aria-rowindex=3` and `aria-rowcount = count + 2`; ArrowDown from a header goes to the next header row, then to the body.
- **Done when:** the `+2` and `+1` literals are gone from `rows.ts` and `viewport.ts`.

**0.4 — Owners for filter inputs; header clicks ignore interactive descendants (item 4).**
- `ownerOf` reads `[data-dzg-owner]` first (`filter-input`, `popup`), before the `input/select` check.
- Header click and Enter on a header do nothing when the target is inside `button, input, select, a, [data-dzg-owner]`.
- **Tests first (jsdom):**
  - In an input carrying `data-dzg-owner="filter-input"` inside a header cell, every key (arrows, Enter, Space, Ctrl+A, Home, End) leaves the grid inert: no sort, no focus move, no selection.
  - Clicking a button inside a header cell does not sort.
  - The `keyboard-intent` cases gain owner `filter-input` and give null.

**0.5 — `update()` as a table per key; columns through the kernel (item 5).**
- **File:** `dom/src/update.ts`, holding `UPDATE_POLICY: { readonly [K in keyof Required<GridSettings<unknown>>]: 'live' | 'fixed' }`. The type is exhaustive: a new setting without a policy does not compile.
- `fixed` keys are `getRowId`, `rowModel` and `selection.mode`. *[Superseded at step 0: `selection` is live (a narrower mode clears); `operations` fixed and `source` live arrive with step 5 of phase-3-plugins.md B4.]* Changing one gives the problem `unsupported-live-change` (new code, with a conformance case) and changes nothing.
- New kernel commands `columns.set {defs}` and `context.set {ctx}`; `update({ columns })` dispatches `columns.set` with source `host`.
- **Tests first:**
  - A type test (`@ts-expect-error`) on a policy entry that is missing.
  - `update({ getRowId: other })` raises a problem and the old ids stay.
  - `update({ columns })` emits `columnsChanged` with source `host`, and focus survives.

**0.6 — Events (item 6).**
- `cellClicked {row, column}` and `rowClicked {row}` are emitted by `interact/select.ts` on a body click, through `emit`.
- `firstDataRendered` is emitted once, at the first paint with `displayed.count > 0` (paged: after the first accepted page).
- The export pattern is D7's `canExport` plus data events. Only the types land here; the export itself is step 16.
- **Tests first:**
  - A click on the third displayed row after a sort gives `cellClicked` with that row's key (invariant 1).
  - `firstDataRendered` fires exactly once across 3 later updates.

**0.7 — Cell-renderer contract (item 7, D9).** *[Superseded by phase-3-plugins.md B2.1: the `Part` contract.]*
- **Files:** `render/cell-renderer.ts`, `render/rows.ts`.
- Behaviour:
  - a column with `cells[id]` gets `mount` once per `CellView` for its life (a pool per column);
  - `update` is called when the row key, the row's data reference or the epoch changes; the same key, data and epoch calls nothing;
  - `unmount` is called before the cell is recycled to another column or dropped, and on `destroy`;
  - a renderer that throws costs its cell: empty text and `reportError`.
- **Tests first:**
  - Scroll 200 rows over 40 mounted ones: mounts equal the cells mounted at peak, and `update` count equals rebinds.
  - Mounts equal unmounts after `destroy`.
  - The focused cell inside a renderer keeps DOM focus across a scroll (retained row).
  - A renderer that throws still lets the other cells paint.

**0.8 — Tooltip in the top layer; row height follows text zoom (item 8).**
- **Files:**
  - `dom/src/popup/popup.ts` *[built as its own entry, `@dzgrid/dom/popup`, `popupsFor(g)`; a modal popup stays open on a pointer down outside]* (`PopupHost`: `open(anchor, el, { placement: 'block-end' | 'inline-end', modal })`; `popover="manual"` + `showPopover()` when present, else `position: fixed` in `.dzg`; logical placement through `dir.ts`; focus trap and return; Escape closes; owner `popup`);
  - `render/tooltip.ts` uses the popup host;
  - `render/measure.ts`: `Geometry.read()` also returns `remPx` from a 1 rem probe;
  - row height = `ROW_HEIGHT[density] × remPx / 16`, rounded to a whole pixel.
- **Tests first:**
  - jsdom: with `showPopover` stubbed, the tooltip calls it; without it, `position: fixed` is used.
  - jsdom: `remPx = 20` gives 40 px rows in `comfortable`.
  - Browser check: at 200 % text zoom (`font-size: 32px` on html) no cell text is clipped vertically, and the tooltip is not clipped by `.dzg-viewport` overflow.

## 3. Ordered steps for the rest (tests first in each)

Conventions as in Phase 2: `npm test`, `typecheck`, `test:tz` and `test:ci` stay green at every step. Browser checks are written before the code and run by the owner or a sequential run. Expectations are written by hand.

### Step 1: behaviour sheets (docs only)
- **New:**
  - `docs/behaviors/server-pagination.md`: page, size, next without a total, previous page kept while loading, page past the end, page-size change keeping the first row, cursor mode;
  - `request-order.md`: the latest request wins, stale responses dropped, errors and retry;
  - `filter-ui.md`: popup, floating row, value list, keys, active mark, debounce;
  - `csv-export.md`: separator, BOM, numbers, instants in wall time, formula guard, scope, server export, refusal;
  - `server-selection.md`: select-all by exclusion, cleared on query change.
- **Extended:** `quick-filter.md` (the box, server `quick`), `filter-misc.md` (`setValues` and its sources), `selection.md` (server).

### Step 2: tooling for Angular and packaging
- **Files:**
  - root `package.json`: devDependencies `@angular/build ^21.2`, `ng-packagr ^21.2`; scripts `pack:local` (copied from tzslot: build, then `npm pack` of each `dist` into `packed/`) and `build:angular`;
  - `packages/angular/{package.json,ng-package.json,tsconfig.lib.json,src/index.ts}`;
  - `vitest.config.ts`: a project `angular` (jsdom, `@analogjs/vite-plugin-angular`, `setupFiles: packages/angular/test/setup.ts` copied from tzslot with the `Symbol.for` guard);
  - `scripts/build.mjs`: `PACKAGES` adds the `core/server` and dom subpaths, and an `angular()` step after dom (ng-packagr, partial compilation, `strictTemplates`; manifest cleaned as in tzslot).
- **Tests first:**
  - `packages/angular/test/packaging.test.ts` (tzslot's): no relative path into another package's `src`.
  - A trivial component test that renders a real template.
  - `build.mjs` refuses an angular `dist` manifest pointing at `src/`.
- **Done when:** `npm run build` produces `packages/angular/dist/fesm2022/*.mjs`, and `npm run pack:local` gives four tarballs.
- **Fallback:** if Analog with vitest 4 fails, the tests compile with S6's `ngc` + linker + esbuild pipeline. Note it in ROADMAP.

### Step 3: the request gate (core, invariant 3)
> Built 2026-10-17 with three additions (`settle`, counted once; `cancel`; `epoch`) and the entry `core/src/server.ts` instead of `server/index.ts`: see ROADMAP and docs/behaviors/request-order.md.
- **Files:** `core/src/server/gate.ts`, `core/src/server/index.ts`, the subpath export `./server` in `core/package.json`, `conformance/cases/server-gate/*.json`, `conformance/runner/suites/server.ts`.
- **API:**
```ts
export type DropReason = 'superseded' | 'stale-epoch' | 'aborted' | 'destroyed';
export interface Ticket { readonly seq: number; readonly epoch: number; readonly channel: string; readonly key: string }
export interface RequestGate {
  begin(channel: string, key: string): { readonly ticket: Ticket; readonly signal: AbortSignalLike };  // aborts the channel's previous request
  accepts(t: Ticket): DropReason | null;
  newEpoch(): void; destroy(): void;
  readonly diagnostics: { readonly begun: number; readonly accepted: number; readonly dropped: Readonly<Record<DropReason, number>> };
}
export function createGate(abort: () => AbortHandle): RequestGate;
```
- **Tests first (≥ 12 hand-written cases):**
  - reversed arrival;
  - two filters close together;
  - a page change during a load;
  - a response after `destroy`;
  - a rejection from a stale ticket (dropped, not an error);
  - an abort reason;
  - `newEpoch` killing an in-flight request with the same key;
  - the same key requested twice (the second wins);
  - a property test: 1 000 seeded permutations (`mulberry32`) of 20 begin/respond steps, where what is applied is always the response of the last `begin`.
- **Done when:** the suite is green, the purity test is green (the gate names no `AbortController`), and the `/server` size is recorded.

### Step 4: the paged model (core)
> Superseded (2026-10-17): step 4 is a page stage in the client model (`core/src/model/page.ts`, `core/test/client-page.test.ts`, conformance `page-model`); fetching, unknown totals and cursors are step 5's `sourceRows`. See ROADMAP and docs/behaviors/server-pagination.md "Decisions (step 4)".
- **Files:** `core/src/server/paged.ts`, `core/src/row/displayed.ts` (a page snapshot over a small store: `createRowStore`, then `flatDisplayed`), `conformance/cases/paged-model/*`, `core/test/paged.test.ts`.
- **API:** as in D3.
- **Behaviour:**
  - `setQuery` starts a new epoch, sets page 0 and fetches;
  - `goTo` and `setPageSize` go through kernel commands `page.go {page}` and `page.size {size}`; `paginationChanged {page, pageSize, total, hasNext}` is a kernel event; *[Superseded by phase-3-plugins.md B1.4: `page.go {index}`, `page.size {size}`, event `pageChanged {page: PageState}`; the model is `sourceRows`, step 5.]*
  - `invalidate()` refetches the same page in a new seq; `{ purge: true }` also clears the selection;
  - responses are validated (`invalid-page-response`; ids through `getRowId`, so `duplicate-row-id` and `invalid-row-id` come from the store);
  - cursor mode keeps `cursors: Map<page, string | null>` per epoch, and `canJump` is false.
- **Tests first:**
  - an unknown total with `hasNext` false on the last page;
  - neither total nor `hasNext` gives the warning plus the inference;
  - a page past the end clamps once;
  - a page-size change from page 4 at 25 to size 100 lands on page 1;
  - the previous rows stay displayed while loading (`status: loading`, `displayed` unchanged);
  - an accepted error gives `status: error` with the host's error object unchanged, and a stale error changes nothing;
  - `destroy()` during a fetch ignores the response;
  - cursor mode passes the right cursor to page 2, then to page 1 back.

### Step 5: the wire filter model with resolved bounds (core, exit criterion 3)
*[Superseded: done as Phase 3 step 6 (ROADMAP), signature `toWire(filter, { ctx, columns, kinds? })` and a narrowed `WireFilter` union; day filters travel as the model (`op`, `value`, `valueTo`); see `docs/behaviors/server-filter.md`.]*
- **Files:** `core/src/server/wire.ts`, `conformance/cases/server-request/*`.
- **API:**
```ts
export type WireFilter = ColumnFilter & { readonly resolved?: { readonly from: string | null; readonly to: string | null }; readonly zone?: string };
export type WireFilterModel = Readonly<Record<string, WireFilter>>;
export function toWire<T>(model: FilterModel, cols: ColumnLookup<T>, ctx: LocaleCtx): { readonly filter: WireFilterModel; readonly problems: readonly Problem[] };
```
- **Rules:**
  - Instant filters carry `resolved` (ISO with milliseconds, `Z`, from `resolveInstantRange`) and `zone`.
  - Day filters stay inclusive days with no zone.
  - Inactive (half-typed) filters are dropped; invalid ones are dropped with `invalid-filter`, the same as on the client.
  - Combined filters keep their structure.
- **Tests first:**
  - "on 5 March 2026, Africa/Algiers" gives `[2026-03-04T23:00:00.000Z, 2026-03-05T23:00:00.000Z)`, and a row at 23:59 local (`22:59:00Z`) falls inside;
  - Paris 2026-03-29 is 23 h long;
  - `betweenDays` swapped;
  - `after` a moment starts at +1 ms;
  - a zone change gives a new request key.

### Step 6: selection across pages (core, invariant 11)
- **Files:** `kernel.ts`, `conformance/cases/selection-across-pages/*`.
- **Tests first:**
  - Select r3 on page 0, go to page 2, select r120, come back: both are selected.
  - Select-all (exclude), untick r7, go to page 5: r7 is unticked and the others ticked; `count` is null for an unknown total and total − 1 for a known one (the server's total is `counts.filtered`).
  - A filter change clears exclude mode (source `data`) but keeps include mode.
  - The header tri-state over the page.

### Step 7: value-list index (core)
- **Files:** `core/src/filter/set-values.ts`, `conformance/cases/filter-set-values/*`.
- **Behaviour:**
  - The index reads `ColumnCache.exports`.
  - It ignores the column's own filter but applies the others and the quick search (filter-misc sheet).
  - Values are sorted with the column's collator; enum labels come from `enumOptions`.
  - Search inside the list is folded the same way as the quick search.
- **Tests first:** counts by hand on 12 rows; blanks counted on their own; another column's filter narrows the counts; the column's own filter does not; Arabic folding in the list search.
- **Bench:** `setValues 100 000 rows one column (cold)` ≤ 30 ms.

### Step 8: CSV (core, invariant 12)
- **Files:** `core/src/export/csv.ts`, `conformance/cases/csv/*`.
- **Tests first (hand-written text):**
  - `=1+1`, `+33…` and `@SUM(` in text become `'`-prefixed; `-5` as a number is not;
  - quotes doubled; CR and LF inside a cell quoted;
  - Arabic text;
  - fr: `;` separator and `1,5`; en: `,` and `1.5`;
  - an instant `2026-03-05T22:59:00Z` in Africa/Algiers becomes `2026-03-05 23:59:00`, with the header naming the zone;
  - a day stays ISO;
  - an enum gives its label, or its code with `enums: 'code'`;
  - BOM present by default;
  - chunks of `chunkRows` joined equal the whole.

### Step 9: features seam wired; floating filter row (`@dzgrid/dom/filters`, part 1)
- **Files:** `dom/src/filters/{index.ts,feature.ts,floating.ts,debounce.ts}`, `dom/package.json` export `./filters`.
- **API:** `export function filters(o?: { adapter?: DatePickerAdapter; floating?: boolean; debounceMs?: number }): GridFeature`. *[Superseded by phase-3-plugins.md B2.3/B3: the option is `datePicker`.]*
- **Behaviour:**
  - The floating row is a `HeaderRowSpec`. Text and number inputs carry `data-dzg-owner="filter-input"` and the label `filter.inputLabel {column}`.
  - Enter in a floating cell focuses its input; Escape returns to the cell.
  - Typing dispatches `filter.column` after the debounce, with source `user`.
  - Numbers are read through `readNumber` (locale), and unreadable text shows `aria-invalid` without dispatching.
- **Tests first (jsdom):**
  - typing "hel" then waiting 300 ms gives one `filterChanged`;
  - typing in fr `1,5` gives the filter value 1.5;
  - the keys in the input never reach the grid;
  - `aria-rowcount` includes the floating row;
  - `update({ filter })` from the host fills the input without emitting.
  - Browser: axe 0 violations with the floating row in fr, ar and RTL [À VÉRIFIER which role the floating cells take: `gridcell` in a header row group, checked by axe].

### Step 10: filter popup, text / number / boolean (`/filters`, part 2)
- **Files:** `dom/src/filters/{menu.ts,conditions.ts}`; the intent `openMenu` added to `core/src/keys/intent.ts` with cases.
- **Behaviour:**
  - The header filter button (≥ 24 px target) and Alt+ArrowDown open a `role="dialog"` popup labelled by the column.
  - Operators come from the column type, restricted by `FilterSpec.ops`; there is an optional second condition with AND/OR, and "Clear".
  - Focus enters the popup and returns to the header on close. *[Superseded by phase-3-plugins.md B2.6: it returns to the anchor, the filter button or the header cell after Alt+ArrowDown.]*
  - The active mark goes on the header, through a `data-dzg-filtered` class plus text in its accessible name (`filter.active`).
- **Tests first:**
  - Alt+Down on a header opens the popup and Escape returns focus;
  - `notContains` gives the exact `ColumnFilter` JSON;
  - "between" with one bound is inactive;
  - the client count is announced (`announce.filtered {rows}`);
  - Tab stays inside the popup;
  - `keyboard-intent` cases: `Alt+ArrowDown` on a header gives `openMenu`, and on a cell gives null in Phase 3.

### Step 11: day and instant filters with the adapter (`/filters`, part 3)
- **Files:** `dom/src/filters/{dates.ts,native-picker.ts}`.
- **Tests first:**
  - the native picker emits `YYYY-MM-DD`;
  - an instant "before 2026-03-29 02:30" in Europe/Paris is refused with `filter.timeSkipped` (`resolveWall` reject);
  - `onDay` builds `{type:'instant', op:'onDay', day}`;
  - in a paged grid, the request carries `resolved` (from step 5);
  - RTL: inputs in logical order.

### Step 12: value-list UI (`/filters`, part 4)
- **Files:** `dom/src/filters/set-list.ts`.
- **Behaviour:**
  - The list is a checkbox list (`role="listbox"` with `aria-multiselectable` and options carrying `aria-selected`), plus a search box, "select all (shown)" and "blanks".
  - It is virtualised beyond 2 000 values with `aria-setsize` and `aria-posinset`.
  - The model is `include` when fewer values are ticked and `exclude` when more.
  - In paged mode, values come from the host's `values()` through its own gate channel `values:<col>`, and there is an "Apply" button.
- **Tests first:**
  - ticking 2 of 5 gives `include`, unticking 1 of 5 gives `exclude`;
  - the search narrows the list without changing the model;
  - 20 000 values mount ≤ 60 option nodes;
  - a stale `values()` response is dropped;
  - the list matches on export text, so it survives a language change.

### Step 13: quick search box binding (`/filters`, part 5)
- **API:** `export function bindQuickSearch(input: HTMLInputElement, grid: GridInstance<unknown>, o?: { debounceMs?: number }): () => void`.
- Client grids turn `searchWarmup: 'idle'` on while it is bound (D13); paged grids send `quick`.
- **Tests first:** debounce; emptying the box releases the caches (existing behaviour); a paged grid's request carries `quick`.

### Step 14: pagination bar (`@dzgrid/dom/pagination`)
- **Files:** `dom/src/pagination/{index.ts,pager.ts}`; export `./pagination`.
- **Behaviour:**
  - The bar sits in `.dzg-footer`, **outside** `role="grid"`, as `<nav aria-label=…>`.
  - Controls: first / previous / next / last (last disabled when the total is unknown, hidden in cursor mode), a page-size `<select>`, and the range text: `pager.range {from,to,total}`, or `pager.rangeOpen {from,to}` when the total is unknown.
  - The page change is announced (`announce.page`).
  - From the model status: `status: loading` sets `aria-busy` and the overlay **in the same frame**; `status: error` shows the error overlay with a retry button (`rows.refresh`). *[Superseded by phase-3-plugins.md B1.5: while loading the rows stay with stale styling and `aria-busy`; the loading overlay only when no rows are held.]*
  - The scroll goes to the top on a page change and stays on a refresh.
- **Tests first (jsdom, fake fetch):**
  - "next" calls fetch synchronously within the click handler's frame;
  - with an unknown total, "next" is enabled while `hasNext`, and "last" is disabled;
  - in ar, the range text uses latn digits by default;
  - retry refetches the same key with a new seq;
  - focus stays on "next" across the load.

### Step 15: playground audit screen and the 1 000-permutation browser test (exit criterion 2)
- **Files:**
  - `playground/audit.html`, `playground/audit.ts`;
  - `perf/fake-server.ts`: 10⁷ rows **computed from the index**, never held. Time decreases with the index, actor = `i mod 97`, action = `(i·7) mod 12`, so sorts and filters are arithmetic over the index. Latency is 150 ms, or seeded permutations; the total is unknown or known;
  - `scripts/browser.mjs` gains checks.
- **Browser checks, written first:**
  - (a) 1 000 seeded permutations of response order across page and filter gestures: 0 stale responses applied, and the displayed ids always equal those of the last request;
  - (b) axe with the popup open, the floating row, the pager, the error overlay, in fr, ar and RTL;
  - (c) the loading overlay is present ≤ 100 ms after "next"; *[Superseded by phase-3-plugins.md B1.5: `aria-busy` and stale styling ≤ 100 ms after "next".]*
  - (d) the palette switched live with the pager shown;
  - (e) screenshots LTR and RTL, light and dark, for the owner.

### Step 16: CSV and server export (`@dzgrid/dom/export`)
- **Files:** `dom/src/export/{index.ts,csv-download.ts}`.
- **API:**
```ts
export interface ExportRequest { readonly scope: 'displayed' | 'selected' | 'all'; readonly columns: readonly string[]; readonly query: Query; readonly page?: PageRequestInfo }
export function csvExport(o?: CsvOptions & { readonly fileName?: (ctx: LocaleCtx) => string;
  readonly canExport?: (r: ExportRequest) => boolean | Promise<boolean>;
  readonly exportAll?: (r: ExportRequest) => Promise<{ url?: string; blob?: Blob } | void> }): GridFeature;
// GridApi gains exportCsv(scope?: ExportRequest['scope']): Promise<'done' | 'refused' | 'failed'>
```
- **Behaviour:** chunks yield every ~20 ms (`setTimeout` slices measured by `performance.now()`); a `Blob` is downloaded through `<a download>`; no row data goes into events or problems.
- **Tests first (jsdom):**
  - `canExport` false gives no Blob, the event `exportRefused` and an announcement;
  - paged `scope: 'all'` calls `exportAll` with the current query and never fetches pages;
  - the Blob text starts with a BOM and matches step 8's text.
  - Bench: dataset A in the browser, total ≤ 700 ms, longest task ≤ 50 ms (LoAF).

### Step 17: tzslot adapter (`@dzgrid/dom/tzslot-picker`, optional, cut first)
- **Files:** `dom/src/tzslot-picker/index.ts`; `@tzslot/dom` as an optional peer (`peerDependenciesMeta`), loaded with `import()` in the DOM layer only.
- **Tests first:** the adapter maps a `PlainDate` to `Day` and back with `toString()`; it is never imported by the `/filters` base (import-graph test).

### Step 18: `@dzgrid/angular`, component, controller, providers
- **Files:** `packages/angular/src/{index,grid,controller,providers,from-observable}.ts`, `test/*.test.ts`.
- **API:**
```ts
@Component({ selector: 'dz-grid', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, template: '', providers: [DzGridController] })
export class DzGrid<T> implements OnInit, OnDestroy {
  readonly rows = input<readonly T[] | undefined>(undefined);
  readonly rowModel = input<RowModelFactory<T> | undefined>(undefined);
  readonly getRowId = input.required<(r: T) => RowIdInput>();
  readonly columns = input.required<readonly ColumnDef<T, any>[]>();
  readonly features = input<readonly GridFeature[]>(NO_FEATURES);
  readonly messages = input<GridMessages | undefined>(inject(DZG_DEFAULTS).messages);
  readonly locale = input<string | undefined>(); readonly timeZone = input<string | undefined>();
  readonly direction = input<'auto' | 'ltr' | 'rtl'>('auto'); readonly density = input<'compact' | 'comfortable' | 'spacious'>('comfortable');
  readonly selectionMode = input<'none' | 'single' | 'multi'>('none'); readonly label = input<string | undefined>();
  readonly options = input<Partial<GridSettings<T>>>(NO_OPTIONS);
  readonly sort = model<readonly SortItem[]>([]); readonly filter = model<FilterModel>({}); readonly quickFilter = model('');
  readonly selection = model<SelectionState>(NO_SELECTION); readonly page = model(0); readonly pageSize = model<number | undefined>(undefined);
  readonly columnState = model<readonly ColumnState[]>([]);
  readonly gridEvent = output<GridEvent<T>>(); readonly cellClicked = output<CellClick<T>>(); readonly rowClicked = output<RowClick<T>>();
  readonly fetchFailed = output<FetchFailure>(); readonly problems = output<readonly Problem[]>(); readonly gridReady = output<GridApi>();
}
@Injectable() export class DzGridController { readonly api: Signal<GridApi | null>; readonly rowCount: Signal<number>; readonly total: Signal<number | null>;
  readonly hasNext: Signal<boolean>; readonly page: Signal<number>; readonly loading: Signal<boolean>; readonly error: Signal<FetchFailure | null>;
  readonly selectedCount: Signal<number | null>; exportCsv(scope?: 'displayed' | 'selected' | 'all'): Promise<'done' | 'refused' | 'failed'> }
export function provideDzGrid(d: { messages?: GridMessages; locale?: string; timeZone?: string; numerals?: 'latn' | 'locale'; defaults?: Partial<GridSettings<unknown>> }): EnvironmentProviders;
export const DZG_DEFAULTS: InjectionToken<DzGridDefaults>;
export function fromObservable<A, R>(fn: (a: A) => Observable<R>): (a: A) => Promise<R>;   // firstValueFrom; rxjs optional peer
```
- **Tests first (Angular project, zoneless TestBed):**
  - For each model (sort, filter, quickFilter, selection, page, columnState), the sequence "gesture, host echoes the value, gesture" leaves the second gesture effective.
  - A host `set` does not emit back.
  - Replacing the `columns` array keeps the user's width and focus.
  - Changing `rowModel` raises the problem `unsupported-live-change` (the host recreates the grid with `@if`).
  - `ngOnDestroy` leaves 0 listeners.
  - Under zone.js, an output runs inside the zone; a `gridEvent` handler that writes a signal does not trigger NG0600.

### Step 19: cell templates (`DzgCell`)
- **Files:** `packages/angular/src/templates.ts`.
- `<ng-template dzgCell="status" let-value let-row="row" let-key="key">` is read with `contentChildren`, typed by `ngTemplateContextGuard`, and mapped onto `cells[id]` (step 0.7).
- Lifecycle: `mount` = `createEmbeddedView` + `appRef.attachView` + moving the root nodes; `update` = mutate the context + `detectChanges()` on that view, skipped when the value and the row are the same; `unmount` = `detachView` + `destroy` + empty the cell.
- **Tests first:**
  - an output inside a template reaches the host's handler;
  - a host signal read in the template refreshes (attached view);
  - views created equal the mounted templated cells; views destroyed equal views created after `destroy`;
  - a template beating `cells[id]` gives `cell-renderer-shadowed`.
- **Bench:** S6 re-run through the real wrapper, 3 templated columns, 40 rows: ≤ 8 ms per full-window recycle (Chrome ×1), with the ×4 figure recorded.

### Step 20: the audit screen through Angular, and a real Angular 21 app (exit criterion 6)
- **Files:**
  - `playground/angular-audit/` (Analog Vite plugin page on 4700/`angular.html`, using `fake-server.ts`);
  - `examples/angular-audit/` (an Angular CLI 21 app **outside the workspaces**, installed from `packed/*.tgz`), with `npm run example:build` = `pack:local` + `npm i` + `ng build`.
- The example exercises: `pagedRows` + `fromObservable`, seven columns, `[(filter)]`, `[(sort)]`, `[(page)]`, the pager, CSV, ar/RTL, a toolbar `inject(DzGridController)`.
- **Done when:** `ng build` passes with `strictTemplates`, and the output bundle's DzGrid share is measured (step 21).
- **Owner:** run it inside Sehhaty itself.

### Step 21: Sehhaty transposition (exit criterion 1; needs §1.1)
- **Files:**
  - `docs/sehhaty/audit-logs.md` (the owner's inputs);
  - `examples/angular-audit/src/audit-columns.ts` (seven `ColumnDef`s plus filter specs);
  - `examples/angular-audit/src/to-query.ts` (`PageRequest` → the API's params; `WireFilterModel` → the API's filter params; paging mode);
  - `examples/angular-audit/test/to-query.spec.ts`.
- **Tests first:** for each of the seven filters, a hand-written `PageRequest` maps to the exact query string the owner documented; instant ranges give the documented `from`/`to` format; the sort mapping; the cursor or offset mapping.

### Step 22: budgets, profile, close
- Add the size entries and bench lines of §4, then set them at measured + 10 %.
- Update `ROADMAP.md` (Phase 3 section, exit checklist, owner items) and add "Ajustements après la Phase 3" to `ARCHITECTURE.md`.
- Architect review and code review; findings fixed with tests that fail first.

### Exit criteria map (§6 Phase 3)

| # | Criterion | Covered by | Owner needed |
|---|---|---|---|
| 1 | Seven columns and filters; sort; server paging with unknown total; CSV (BOM, separator, guard) and server export callback | steps 4, 5, 8, 10–12, 14, 16, 21 | **yes: §1.1 inputs** |
| 2 | `server-gate` green and 1 000 browser permutations, 0 stale | steps 3, 15a | no |
| 3 | `[from, to)` UTC bounds; "5 March" includes 23:59 | step 5 (conformance) | no |
| 4 | Arabic read: filter open, sort, paging, export opened in Excel | step 15e screenshots; step 16 sample file `examples/angular-audit/out/audit-ar.csv` | **yes: Arabic reader, Excel** |
| 5 | Contrast on 12 combinations; live palette; one screen-reader pass | `check:contrast --palette sehhaty.json`, step 15d; `docs/a11y-protocol.md` | **yes: fixture, screen reader** |
| 6 | Profile ≤ 85 kB gz; tarballs in a real Angular 21 app (`ng build`) | steps 20, 22 | partly: the example builds here; Sehhaty integration is the owner's |
| 7 | "Is it better than the previous table?" in production | — | **yes: production** |

## 4. Budgets to add

### Size (`size-budget.json`)

`scripts/size.mjs` gains:
- an entry `css: string[]`, each file gzipped on its own and added to the JS total;
- an `external` that accepts globs (`@angular/*`, `rxjs`);
- a guard that the Angular `dist` exists, failing with "run npm run build first" otherwise.

| Entry | Measured as | Ceiling | Phase 3 budget |
|---|---|---|---|
| `@dzgrid/core` | `core/src/index.ts` | 28 kB (§5.2) | measured + 10 % (expect ~24) |
| `@dzgrid/core/server` | `core/src/server/index.ts`, core external | 6 kB | measured + 10 % |
| `@dzgrid/dom` | base, core external | 30 kB | measured + 10 % (expect ~15) |
| `@dzgrid/dom/filters` | core and dom external | 10 kB | measured + 10 % |
| `@dzgrid/dom/pagination` | idem | 3 kB | measured + 10 % |
| `@dzgrid/dom/export` | idem | 3 kB | measured + 10 % |
| `@dzgrid/dom/locales/{en,fr,ar}` | each file | 2 kB | measured + 10 % |
| `@dzgrid/angular` | `packages/angular/dist/fesm2022/dzgrid-angular.mjs`, `@angular/*` and `@dzgrid/*` external | 8 kB | measured + 10 % |
| **profile: audit screen** | `perf/profiles/audit-screen.ts` = `createGrid` + `pagedRows` + `filters` + `pagination` + `csvExport` + `AR` (largest locale) + Angular `dist` (DzGrid, DzgCell, controller, providers, `fromObservable`), `@angular/*` and `rxjs` external, + `css: packages/theme/dzgrid.css` | **85 000 B (K.8)** | hard ceiling 85 000; expected ~60–65 kB |
| profile: read-only client grid | existing | — | recorded |

The audit-screen entry counts the Angular framework as already present in the app. The `ng build` output of step 20 is reported next to it, as a cross-check: framework excluded, `source-map-explorer`-style attribution [À VÉRIFIER which tool is available offline].

### Time

**Node** (`perf/budgets.json`, minified, median of 7):

| Line | Target |
|---|---|
| `toWire 7 filters (2 instant, Algiers)` | ≤ 0.5 ms |
| `paged settle 100 rows (ids, displayed)` | ≤ 2 ms |
| `gate begin/accepts × 100 000` | ≤ 20 ms |
| `setValues 100 000 × 1 column (cold)` | ≤ 30 ms (§5.3) |
| `setValues search in 20 000 values` | ≤ 10 ms |
| `csv 100 000 × 30, all chunks` | ≤ 700 ms |
| `csv one chunk (default size)` | ≤ 20 ms |

**Browser** (`perf/browser-budgets.json`, dataset C = fake server with 10⁷ rows, latency 150 ms, unknown total; plus dataset A):

| Line | Target |
|---|---|
| "next" click to `fetch` called | ≤ 1 frame (≤ 17 ms) |
| "next" click to `aria-busy` and overlay *[superseded by B1.5: stale styling, no overlay]* | ≤ 100 ms (target: same frame) |
| Response to rows painted | ≤ 1 frame, script ≤ 8 ms |
| Stale responses applied over 1 000 permutations | 0 |
| Floating filter keystroke handling | ≤ 4 ms; one request per debounce window |
| Filter popup open, list of 2 000 values, to first frame | ≤ 50 ms |
| 20 000-value list scroll | ≥ 58 fps median, p95 ≤ 25 ms |
| CSV export of A in the browser | ≤ 700 ms total; no task > 50 ms (LoAF) |
| `<dz-grid>` first render of A (client) | ≤ 130 ms (K.8's 120 + the wrapper; recorded first) |
| `<dz-grid>`, 3 templated columns, scrollbar drag | p95 ≤ 25 ms, script ≤ 8 ms per frame (Chrome ×1); ×4 recorded |
| Paged model memory | ≤ 2 pages of rows held (`diagnostics`) |
| 1 000 create/destroy of `<dz-grid>` | ≤ 1 MB retained |

**How measured:**
- `scripts/perf-browser.mjs`, one Chrome, closed in `finally`.
- The fake server is instrumented: a timestamp when `fetch` is called, then a rAF probe for the painted rows.
- CDP gives `Performance.getMetrics` and LoAF; the heap comes from `HeapProfiler.collectGarbage` plus `Runtime.getHeapUsage`.
- Angular lines run on the AOT build of `playground/angular-audit`.
- Headless numbers on the M4 are indicative. K.8 headed on a mid-range laptop stays the owner's.

## 5. Risks, and what to cut if a step overruns

| Risk | Answer |
|---|---|
| Owner inputs late, or the API is cursor-based or odd | Steps 1–20 run against the fake server; step 21 is isolated in `to-query.ts`; cursor mode is built only if the API needs it. |
| Angular tooling (Analog + vitest 4 + `@angular/build`; ng-packagr partial compilation) | Same versions as tzslot (known to work there); fallback to S6's ngc + linker + esbuild pipeline for tests. |
| Angular 19/20 untested | Peers declared per K.7; smoke `ng build` on 19 and 20 from the tarballs if possible, otherwise marked [À VÉRIFIER] in ROADMAP. |
| Required inputs at construction (NG0950) | Create in `ngOnInit` (D8); a test reads a required input before binding and must not throw. |
| `popover` missing in Firefox 120–124 | `position: fixed` fallback inside `.dzg`, tested in `--all`. |
| Native date input shows the browser's locale or digits, not the grid's | Documented; the tzslot adapter is the remedy; Arabic reader to judge. |
| Floating filter row ARIA (axe `aria-required-children` or roles) | Browser axe check written first; fallback: floating inputs move into the header cell under the label, with no extra row. |
| Filters over 10 kB gz | Lazy value-list chunk (`import()` inside `/filters`) so the popup core stays small; cut 3. |
| The `grid.ts` split causes regressions | Pure moves with every DOM test unchanged; one module per commit. |
| Exclude-mode selection misread by host bulk actions | `selectionChanged.query` plus a sheet (`server-selection.md`); the owner confirms whether the screen selects at all (§1.1). |
| CSV fidelity in Excel (decimal mark, dates, Arabic) | `numbers: 'excel'` default; sample files for the owner; `raw` option kept. |
| Locale bundles over 2 kB with ~35 new keys | Measure at step 10; split per feature only if over. |
| Messages in Arabic unreviewed | Arabic reader before close (exit criterion 4). |
| Shared, memory-constrained machine | Browser scripts are owner-run and sequential; the fake server computes rows from the index. |

**Cut order** (each cut written in `ROADMAP.md` with its target phase):
1. `@dzgrid/dom/tzslot-picker` (step 17), to Phase 5.
2. Cursor paging, if the owner's API is offset-based.
3. Value-list virtualisation beyond 2 000 values: cap at 2 000 with search and a "refine your search" message, to Phase 5.
4. The second condition (AND/OR) in the popup, to Phase 5 (`combined` stays in the model).
5. Floating filters for non-text types: summaries become plain text, popup only.
6. `bindQuickSearch`: hosts bind `quickFilter` themselves.
7. Angular `cellComponent` option (keep `DzgCell` only).
8. Firefox and WebKit browser runs: Chrome mandatory, the others as an owner one-off.

**Never cut:** the `server-gate` suite and the 1 000-permutation browser test, the resolved `[from, to)` bounds, the CSV formula guard and BOM, the 85 kB profile measurement, the Angular echo tests, axe on the filter UI and the pager, and Step 0 items 1, 2, 4, 5 and 7.

### Critical Files for Implementation
- /Users/nadou/Dev/dzgrid/packages/core/src/kernel.ts
- /Users/nadou/Dev/dzgrid/packages/core/src/model/client.ts
- /Users/nadou/Dev/dzgrid/packages/dom/src/grid.ts
- /Users/nadou/Dev/dzgrid/packages/dom/src/render/rows.ts
- /Users/nadou/Dev/dzgrid/packages/core/src/filter/instant.ts
- /Users/nadou/Dev/dzgrid/scripts/size.mjs
- /Users/nadou/Dev/tzslot/packages/angular/src/calendar.ts
- /Users/nadou/Dev/dzgrid/spikes/s6-angular-cells/README.md
