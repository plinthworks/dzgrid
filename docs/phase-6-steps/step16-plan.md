# Step 16 plan: everything the owner-needs forecast names, before 1.1.0 is published

Sources: `docs/owner-needs-forecast.md` (cited **F:§/row**, e.g. F:L13, F:P3), `decisions.md` « Phase 7 parked; the
forecast's needs first » (owner, 2026-10-29), the owner's materials (`scratchpad/owner-materials.md`, cited **OM:line**;
only owner pastes 1, 4, 5, 9 are owner input), the owner's log-table rewrite `~/Desktop/data-table-dzgrid/` (cited
**RW:file:line**). Code read at `ebaad6d`: `core/src/kernel.ts`, `core/src/sort/toggle.ts`, `core/src/row/store.ts`,
`core/src/server/rows.ts`, `core/src/detail/shape.ts`, `core/src/edit/controller.ts`, `core/src/ids.ts`,
`dom/src/{settings,update,part,grid}.ts`, `dom/src/interact/header-click.ts`, `dom/src/keys/{router,focus}.ts`,
`dom/src/slots/index.ts`, `dom/src/column-menu/index.ts`, `dom/src/filters/set/draft.ts`, `dom/src/detail/{index,nested}.ts`,
`dom/src/motion-gsap/run/index.ts`, `angular/src/{grid,controller,helpers,providers}.ts`, `perf/profiles/audit.ts`.
Sheets: `sort.md`, `filter-set.md`, `master-detail.md`, `selection-rules.md`, `server-selection.md`, `motion.md`,
`edit-save.md`, `header-groups.md`. Sizes measured once (`node scripts/size.mjs`, 2026-10-29); every other number is an
estimate, measured at each sub-step on minified code. Clean room: ag-Grid options (`suppressMultiSort`,
`defaultToNothingSelected`, `suppressSelectAll`, `isRowMaster`, `enableCellChangeFlash`) are named as the behaviour the
owner's screens show; nothing of ag-Grid is read. Plan only: nothing coded, nothing committed.

Every sub-step: behaviour sheet first → tests that fail first (expectations by hand) → code → `npm run gate:step` →
review. The review lists **every place that recomputes the same thing** (screen, export, print, clipboard, server wire,
saved state, URL state) and checks the new rule reached each; the list for each sub-step is written below as « Reach ».

## 0. Facts that shape the plan

1. **The `missing-feature` for `canSelect` without `rules()` already exists.** `dom/src/part.ts:321` tells an
   **error** problem (`missing-feature`, path `settings.selection.canSelect`, detail `rules`) and `update.ts:52`
   (`closed`) turns the mode to `none`. It looked silent because the rewrite never listens: `(problems)` is re-emitted
   by `app-data-table` (RW:html:37) and the example screen does not bind it (RW:alarm-log:20–23). Problems reach the app
   only through `(problems)` / `onEvent`; nothing goes to the console (`dom/src/grid.ts:158` reports thrown errors only).
   So item B4 is about **visibility**, not a new warning (§B4, Q16-5).
2. **Under `rules()` a selection is always an include list.** `selection-rules.md` « Rows it cannot see »: with a rule,
   the header box and Ctrl+A tick the rows of the page shown, and an everything-except selection is refused
   (`needs-rows`). So on the log screen `selectedIds(c).ids` (`angular/src/helpers.ts:21`) is exactly every ticked
   alarm, on every page; `mode` is always `include`.
3. **Four places dispatch a sort from the user**: header click (`interact/header-click.ts:35`, `multi: e.shiftKey`),
   keys (`keys/router.ts:96`, Shift+Enter), header parts (`slots/index.ts:62`, `toggleSort(multi)`), and the column menu
   (`column-menu/index.ts:174`, `sort.set` with one column, so already single). All toggles end in the kernel's
   `nextSort(sort, column, multi)` (`kernel.ts:510`). One rule in the kernel reaches all of them.
4. **The set list's draft** (`filters/set/draft.ts`): no filter reads as « everything ticked » (`draftOf(null)` = exclude
   mode, empty); `filterOf` of an empty include is `include: []` (keeps no row, owner Q1 of Phase 3). Both change under
   « start empty ». The draft, the half rule and the include-only rule (`only`) all live in the lazy set chunk.
5. **Details: one place decides who may open.** The shape's `opens(key)` (`core/src/detail/shape.ts`) is what the
   kernel asks before `rows.expand` (`model/client.ts:614`); today every data row opens. The chevron and `aria-expanded`
   are drawn by `dom/src/detail/index.ts:200–214` for every mounted data row. Detail heights: `'auto'` is measured by a
   ResizeObserver and cannot size a nested grid (`master-detail.md` « Heights »).
6. **Why a full reload never flashes.** `store.replaceAll` counts a row as updated when **the object** differs
   (`row/store.ts:250`) and calls more than half the rows changed a reset (`store.ts:119`); the motion chunk flashes only
   on a `delta` (`motion-gsap/run/index.ts:104`). A server answer goes through the same `replaceAll`
   (`server/rows.ts:319, 361`: `inner.setRows`), and is always new objects (JSON): so **a server refresh is always a
   reset** too — no flash, no `enter`, no « added » keys. One fix (compare by value) serves the flash (P3) and the new
   rows after an SSE refresh (P10).
7. **Already there, to be used rather than built:**
   - scroll to a column: `ensureVisible(row, column)` scrolls the column **before** looking for the row and returns if
     the row is not shown (`keys/focus.ts:84–91`); only its type demands a row (§C7);
   - clear after a bulk action: `{ type: 'selection.clear' }` (`kernel.ts:38`);
   - open rows by id: `idOfDataKey` / `dataKey` / `groupKey` are public (`core/src/index.ts:6`), and `[(expanded)]`
     opens keys whose rows arrive later (`angular/src/grid.ts:184`);
   - time-slot groups: `columns.set` keeps the user's widths by id; `.dzg-hgroup[data-g]` styles a group
     (`header-groups.md` 101–104), a group label hidden visually keeps its accessible name; `editable` per column;
   - batch-ish editing without `save`: `cellEdited` and the local overlay (`edit-save.md` 2).
8. **Bytes now** (gz, 2026-10-29): `@dzgrid/core` 29 064 / 29 150, **core base guard** (`layering.test.ts` `BASE`)
   29 064 / **29 070**; `@dzgrid/dom` 22 347 / 22 400; **K.8 audit profile 84 912 / 84 950** (hard ceiling 85 000; it
   bundles core base, dom base, filters eager, search, pagination, export, `core/server` and the `DzGrid` component);
   `filters: set (lazy)` 4 339 / 4 350; `@dzgrid/dom/filters` 10 091 / 10 100; `core/detail` 1 012 / 1 050;
   `dom/detail` 4 077 / 4 150; `core/edit` 3 156 / 3 160; `dom/edit` **4 150 / 4 150**; `theme/edit.css` 2 236 / 2 250;
   `@dzgrid/angular` 7 316 / 7 350; `motion-gsap run` 3 484 / 3 500; `fr-edit` 598 / 630, `ar-edit` 895 / 900.

---

## A. The owner's log-table rewrite (outside the repo; the lead applies it)

Each change says which DzGrid sub-step it needs; « now » means 1.1.0 as built.

### A1. `data-table.component.ts`
1. **Imports** (now): add `effect` to the `@angular/core` import; add
   `import { rules } from '@dzgrid/dom/rules';` and `import { FR_RULES } from '@dzgrid/dom/locales/fr-rules';`;
   add `type ColumnFilter, type FilterModel` to the `@dzgrid/core` import.
2. **`MESSAGES`** (now, RW:ts:24–27): add `...FR_RULES.text` to `text`.
3. **Checkboxes** (now, F:L13, RW:ts:115–131): in `features`, add `...(this.selectable() ? [rules()] : [])`. Without
   it the grid tells `missing-feature` (error) and selects nothing.
4. **Acquit across pages** (now, F:L14, RW:ts:144–152): replace `selectedRows()` by
   ```ts
   /** Les ids cochés, sur toutes les pages (avec une règle, la sélection est toujours une liste : jamais « tout sauf »). */
   selectedIds(): string[] { const c = this.grid(); return c ? selectedIds(c)?.ids ?? [] : []; }
   /** Après une action groupée : plus rien de coché (les lignes acquittées ne sont plus cochables, la règle ne décoche pas). */
   clearSelection(): void { this.grid()?.dispatch({ type: 'selection.clear' }); }
   ```
   Remove the `console.warn` and the `k.rows.row` mapping. If the acquit API needs whole rows (Q16-6 B), keep instead a
   `Map<string, T>` filled on `(gridEvent)` `selectionChanged` from `kernel().rows.row(key)?.data` (the page shown holds
   every row the user can tick) and emptied on `clearSelection()`.
5. **Detail height** (now, F:L21, RW:ts:123–128): replace `height: 'auto'` by a function, and pin the inner row height
   so the sum is right:
   ```ts
   height: (m: T) => (d.rowsOf(m).length + 1) * 32 + 9,   // header + rows at 32 px + borders (the old « length × rowHeight + 7 »)
   part: nestedGrid({ settings: (c) => ({ rows: d.rowsOf(c.row as T), getRowId: d.getRowId, columns: d.columns, messages: MESSAGES, rowHeight: 32 }) }),
   ```
   (Known limit, said in `master-detail.md`: a reader who enlarges the text gets taller inner rows than 32 px; the
   inner grid then scrolls. Accepted for now.)
6. **Chevron only on rows with a detail** (after **16c**, F:L19): add `readonly isMaster?: (master: T) => boolean;` to
   `DataTableDetail` (the old `isRowMaster` input, OM:71) and pass `isMaster: d.isMaster ?? ((m) => d.rowsOf(m).length > 0)`
   to `detail<T>({ … })`.
7. **One sort only** (after **16a**, F:L3): bind `[multiSort]="false"` on `<dz-grid>` (A2). Until then Shift+click
   shows two arrows and `toQuery` sends the first only.
8. **External column filters — the sources** (now, F:L9, OM:344–368): add an input and one effect that writes them in
   one request:
   ```ts
   /** Filtres de colonnes venus d'en dehors (ex. les sources) : colonne → valeurs (Set), null pour retirer. */
   readonly columnFilters = input<Readonly<Record<string, readonly string[] | null>>>({});
   constructor() {
     effect(() => {
       const ext = this.columnFilters(); const c = this.grid(); const k = c?.kernel();
       if (!c || !k || !Object.keys(ext).length) return;
       const next: Record<string, ColumnFilter> = { ...k.query.filter };
       for (const [col, vs] of Object.entries(ext)) {
         if (vs?.length) next[col] = { type: 'set', include: [...vs] };
         else delete next[col];
       }
       c.dispatch({ type: 'filter.set', filter: next as FilterModel });   // une seule demande, page 1 ; le popup de la colonne montre les coches
     });
   }
   ```
   (`untracked` around `k.query` if the lead prefers; the kernel is not a signal, so it is not tracked anyway.)
9. **« Effacer filtres » resets the page size too** (now, F:L12, OM:432): in `clearFilters()`, dispatch
   `{ type: 'page.size', size: 100 }` before the `query.set` (the gate keeps the last request only: one call reaches the
   server).
10. **Loading on « Rafraîchir »** (now, F:L10, recipe until Q16-10): `readonly refreshing = signal(false);` —
    `reLoadData()` sets it true before `rows.refresh`; the `fetchPage` pipe ends with `finalize(() => this.refreshing.set(false))`;
    bind `[overlay]="refreshing() ? 'loading' : null"`. This hides the rows while reloading, as the ag-Grid screen did.

### A2. `data-table.component.html`
1. `(problems)` stays re-emitted (RW:html:37).
2. After **16a**: add `[multiSort]="false"` to `<dz-grid>`.
3. Recipe A1.10: add `[overlay]="refreshing() ? 'loading' : null"`.
4. Optional (F:L22): `[tooltips]="{ delayMs: 500 }"` if the screens use cell tooltips.

### A3. `alarm-log.screen.example.ts`
1. **See the configuration problems** (now, fact 1): bind `(problems)="onProblems($event)"` with
   `onProblems(ps: readonly Problem[]) { if (isDevMode()) for (const p of ps) console.warn('dzgrid', p.code, p.path, p.detail); }`
   (a `Problem` never holds row data, so logging it is safe).
2. **Acquit** (now, F:L14, F:P9): `this.http.post('/api/alarms/acquit', { ids: this.table().selectedIds() })` (or the
   rows map, Q16-6), then `.subscribe(() => { this.table().clearSelection(); this.table().reLoadData(); })`.
3. **Sources** (now): `[columnFilters]="sources()"` with `sources = toSignal(agGridService.onSourcesFilterChanged …)`
   mapped from the ag model `{ col: { values, filterType: 'set' } }` to `{ col: values }` (one line, in the screen).

### A4. `to-query.ts`, `to-query.spec.ts`
No change: `sort?.[0]` stays right (one sort after 16a), set include is already mapped. One spec case added: a request
whose filter came from `columnFilters` (`{ sources: { type: 'set', include: ['A', 'B'] } }`) → `filterModelRequest.sources
= { filterType: 'set', values: ['A', 'B'] }` (expectation by hand).

### A5. The owner's tree screen, when ported (notes only; its code is not in the rewrite)
- Flash on reload: after **16e**, `[sameRow]="sameValues"`; before it, send `patch` transactions or keep the unchanged
  objects (F:P3).
- `gridContext`: pass a **new object** when `selectedValue` changes; a context changed in place is not seen
  (`parts.md` 37, F:B13).
- Saved open rows: §C6.

---

## B. Small DzGrid options

### B1 → 16a. One sort only — `multiSort: false`
**API.** `GridSettings.multiSort?: boolean` (default true = today; fixed: set once). Angular: `readonly multiSort = input<boolean>()`.
Core: `createKernel({ …, multiSort?: boolean })`; in `sort.toggle`, `nextSort(query.sort, cmd.column, cmd.multi && multi)`.
**Behaviour (`sort.md`, new bullet).** Shift+click and Shift+Enter act as a plain click / Enter: the column becomes the
only sort (asc → desc → none). Header parts' `toggleSort(true)` too. `sort.set`, `query.set`, a restored state or URL
holding several sort items are **kept** (they are the application's own commands; lead decision, said in the sheet:
the option is about the user's gestures). The sort indicator then shows numbers only if the app sets several.
**Core vs DOM.** Core (kernel): one rule for the four sites of fact 3; the DOM passes the setting through.
**Files.** `core/src/kernel.ts`, `dom/src/grid.ts` (pass), `dom/src/settings.ts` (type + doc), `dom/src/update.ts`
(`multiSort: 'fixed'` in `UPDATE_POLICY`), `angular/src/grid.ts`, `docs/behaviors/sort.md`.
**Tests first.** `core/test/sort-single.test.ts`: kernel with `multiSort: false`, `sort.toggle {multi: true}` on B after
A asc → `[B asc]`; again → `[B desc]`; again → `[]`; `sort.set` of two items → both kept. `dom/test/sort-single.test.ts`:
Shift+click on « Type » after « Date » → one `aria-sort` header, `sortChanged` with one item; Shift+Enter the same; a
header part calling `toggleSort(true)` the same; `update({ multiSort: true })` refused as fixed (`fixed-setting`).
Angular: `[multiSort]="false"` reaches the settings (one test in `angular/test`). Planted fault: the rule placed in
`header-click.ts` only → the keys and the part tests go red.
**Reach.** Header click, keys, header part, column menu, server wire (`DataRequest.sort` one item), saved state, URL state.
**Size.** core base +≈12 B, Angular +≈18 B (and K.8, which bundles `DzGrid`). Small: **build now**.

### B2 → 16b. A set list that opens with nothing ticked, without « select all »
**API** (types in `core/src/columns/defs.ts`, 0 B):
`filter: { kind: 'set', start?: 'all' | 'empty', selectAll?: boolean }` — `start: 'empty'` (default `'all'` = today),
`selectAll: false` (default true). The log screen: `filter: { kind: 'set', exclude: false, start: 'empty', selectAll: false }`.
**Behaviour (`filter-set.md`, new section « Starting empty »).**
1. With no filter in force, the list opens with **nothing ticked**; with a filter in force, it shows that filter's ticks
   (as today).
2. **Nothing ticked is no filter** (null), on Apply or closing (Q16-1 A): with `start: 'empty'`, `include: []` is never
   written. (Default columns keep Phase 3's Q1: nothing ticked keeps no row.)
3. **With `exclude: false`** (1.1.0 « Include only »): the list writes exactly what is ticked, an `include`; its rule 2
   (« everything ticked on a complete list = no filter ») and rule 3 (« leaving everything ») do not apply, because the
   list never starts from « everything » (Q16-2 A: everything ticked writes an include of every value, so reopening
   shows them ticked). Rule 5 (no blanks row) and rule 6 (an `exclude` from elsewhere ignored with `invalid-filter`)
   are unchanged.
4. **With `exclude` allowed** (default) and `start: 'empty'`: the half rule still writes the shorter list; nothing
   ticked is null in either mode; blanks row unticked at the start.
5. `selectAll: false`: no « Select all » / « Select all shown » box; Tab order search → list → Clear → Apply; Space on
   rows unchanged. A value outside {true, false} / {'all','empty'}: the default and one `invalid-setting` warning per
   column (path `columns.<id>.filter.start` / `.selectAll`), read in the chunk.
6. Floating summary, saved state, wire: unchanged (they read the stored filter, never the draft).
**Core vs DOM.** DOM, lazy set chunk only (`draft.ts`: `draftOf(f, empty)`, `filterOf(d, empty)`; `index.ts`: no box).
**Files.** `dom/src/filters/set/{draft,index}.ts`, `core/src/columns/defs.ts` (types, doc), `docs/behaviors/filter-set.md`.
**Tests first.** `filters-set-draft.test.ts` « start empty »: `draftOf(null, true)` ticks nothing; tick Oran → `include:
['Oran']`; untick → null; with `exclude: false` every value of a complete list ticked → `include` of all (sorted);
default mode, 3 of 4 ticked → `exclude: [x]`, nothing ticked → null. `filters-set.test.ts` « start empty »: no box with
`selectAll: false` (and no `filter.set.all` text node), Tab order, opening with `include: ['KO']` stored shows KO ticked,
server: Apply with nothing ticked sends **no** request when no filter was in force and clears it when one was. The
seeded walk (`only`) extended with `start: 'empty'`: never writes `exclude`, `blanks` or `include: []`. Planted fault:
`filterOf` forgetting `empty` → `include: []` sent (red).
**Reach.** Draft → `toWire` (server request), `ValuesRequest` of the other columns, floating summary, saved state,
`stateRestored`, CSV of the filtered rows (follows the filter).
**Size.** set chunk +≈60 B → over 4 350 (raise). Small: **build now**; Q16-1 / Q16-2 change one line each.

### B3 → 16c. Details on some rows only — `detail({ isMaster })`; detail grids following the master's columns
**API.** `DetailOptions.isMaster?: (master: Readonly<T>) => boolean` (default: every row, today).
**Behaviour (`master-detail.md`, new section « Rows without a detail »).**
- A row it answers false for: no chevron, no `aria-expanded` on its cell, forward / back are plain column moves,
  `rows.expand` / `rows.expandAll` / `initial: 'all'` / a restored open key leave it closed (the kernel's `opens`).
- Its first cell keeps an empty 24 px slot so texts line up (Q16-3 A).
- A function that throws: that row is not a master (fail closed), silently, as `height` (no room for a problem in
  `core/detail`; said in the sheet).
- An open master whose data stops being a master is shown closed; its key stays in the open set and it reopens if it
  becomes a master again (said in the sheet; `[(expanded)]` unchanged).
**Core vs DOM.** Core decides once: `DetailRows.isMaster(key)` (from the last build; the shape's `opens` and
`parents` use it, `build` drops non-masters from `ms`). The DOM **reads** it for the chevron, `aria-expanded` and the
keys (never calls the app's function again — the step 14 rule).
**Columns following the master (F:L18).** Recommended 0 B (Q16-4 A): a recipe — the app keeps the outer grid's column
state (`(gridEvent)` `columnsChanged`) in a signal, passes a **new** `context` object, and `nestedGrid({ settings: (c) =>
({ …, columns: follow(detailColumns, c.context) }) })` reorders / hides / sizes the shared ids; a new context updates each
inner grid in place (`grid.update`, columns live, `update.ts:93`). The log rewrite does not need it today (its columns
cannot move: no `columns()` feature). B: `nestedGrid({ followColumns: true })` built in (+≈150 B `dom/detail`, raise).
**Files.** `core/src/detail/shape.ts`, `dom/src/detail/index.ts`, `dom/src/detail/styles.ts` (the empty slot),
`docs/behaviors/master-detail.md`, a recipe section « Detail columns that follow the master ».
**Tests first.** `core/test/detail-master.test.ts`: 4 rows, `isMaster` true for rows 1 and 3; `rows.expandAll` opens
exactly 1 and 3; `rows.expand([d2])` → no `rowExpanded`; `initial: 'all'` the same; row 3 patched to non-master while
open → no detail row after it, key still in `kernel.expansion`; patched back → detail back; a throwing `isMaster` →
not a master, no throw. `dom/test/detail-master.test.ts`: chevron and `aria-expanded` on rows 1 and 3 only, row 2's
cell has the empty slot (`data-none` or class), ArrowRight on row 2 moves the column; a server source (`sourceRows`)
the same. Recipe test (`dom/test/detail-follow.test.ts`): outer column moved → a new context → the inner grid's
`columns.state()` order follows, its focus kept. Planted fault: the DOM calling `o.isMaster` itself while core caches
a stale build → red on the patched-row case.
**Reach.** Chevron, keys, `aria-expanded`, expand-all, `initial`, `[(expanded)]`, motion's expand glide, print and CSV
(detail rows never written: unchanged), selection (unchanged).
**Size.** `core/detail` +≈45 B → over 1 050 (raise); `dom/detail` +≈40 B (fits, tight). Small: **build now**.

### B4 → 16d (docs) / Q16-5. Selection rule without `rules()`
Fact 1: the error problem exists. What is missing is that nobody sees it. Recommended (Q16-5 A, 0 B): the Angular
docs (`angular-example.md`, `selection-rules.md`) show `(problems)` logged in dev mode (A3.1), and the README's
« first screen » snippet binds it. B: the Angular wrapper itself writes **error** problems to `console.warn` in dev mode
(`isDevMode()`), once per code and path (+≈60 B Angular **and K.8**: with 16a and 16e this passes K.8's hard ceiling
85 000 — not recommended now). No change to the fail-closed rule.

---

## C. The foreseen needs

Grades: **small** = build now, owner only asked for a default; **structural** = owner questions first.

### C1 → 16e. The flash after a full reload — compare rows by value (F:P3) — small
**API.** `GridSettings.sameRow?: (a: T, b: T) => boolean` (fixed), for `[rows]` and for a source's answers (passed to
the inner model by `sourceRows`' env). Helper `sameValues(a, b)`: plain data compared deeply (objects by own
enumerable keys, arrays by items, numbers with `Object.is`; anything else by identity), in a **new entry**
`@dzgrid/core/compare` so nobody pays for it unused. Angular: `readonly sameRow = input<…>()`.
**Behaviour (`row-identity-transactions.md`, new section « Rows compared by value »).**
1. In a `rows` replacement or a server answer, a row with the same id and an equal value (`sameRow` true) is
   **unchanged**: it keeps its **previous object** (so every cache keyed by the object stays: the quick-search
   haystack, the selection rule's answers, the span memo, `rowClass`, the edit overlay's `saved` entries).
2. Only rows that really changed count as updated; added and removed as today. **The > 50 % rule stays**: if more than
   half the rows really changed, it is a reset and nothing flashes (a new data set, not a live change; the flash's own
   cap is 50 cells a paint anyway).
3. The flash then marks the cells whose text changed in the updated rows (unchanged code, `motion.md` « Value flash »).
4. A throwing `sameRow`: that row counts as changed, the error reported once per load.
**Cost.** One call per row with the same id and a new object: O(rows × fields). Perf line to add
(`perf/browser-budgets.json`): « rows replaced by equal copies, 100 000 rows × 20 fields, `sameValues` » ≤ 60 ms in Chrome
(to measure; if over, the sheet tells the app to pass a cheaper `sameRow`, e.g. a version field). Without the option:
0 cost, today's behaviour.
**Core vs DOM.** Core: `store.replaceAll` (base) takes `same?`; `clientRows` / `sourceRows` pass it; the helper in its
entry. DOM: pass-through (`grid.ts`, `update.ts` `'fixed'`).
**Files.** `core/src/row/store.ts`, `core/src/model/client.ts`, `core/src/server/rows.ts`, new `core/src/compare.ts`
(+ `package.json` export, `size-budget.json` line), `dom/src/{settings,grid,update}.ts`, `angular/src/grid.ts`,
`docs/behaviors/row-identity-transactions.md`, `motion.md` (one line: « with `sameRow`, a full reload flashes only the
changed cells »).
**Tests first.** `core/test/store-same.test.ts`: 10 rows replaced by deep copies with one field changed in row 4 →
`kind: 'delta'`, `updated: [d4]`, row 1's object is the old one; 6 of 10 really changed → `reset`; `hierarchyPath`
arrays copied → equal; `NaN` equal to `NaN`; a throwing `sameRow` → that row updated. Conformance
`conformance/cases/store/same-*.json` (language-independent). `core/test/source-same.test.ts`: a server refresh of the
same page with 2 new rows on top and 2 gone at the bottom → `added` 2, `removed` 2, delta. `dom/test/motion-same.test.ts`:
tree-screen-like tree, full reload with one value changed → exactly one `dzg-flash` cell. Planted fault: keeping the new
object on equal rows → the rule-cache and haystack tests (identity) go red.
**Reach.** Client `[rows]`, server answers, edit overlay sweep (`controller.ts:269` `n !== e.d`), selection reconcile,
rule cache, span memo, haystacks, tree build (`tree({ path })` reads the kept object), pinned rows (not concerned:
their own `set`), motion flash and enter.
**Size.** core base +≈28 B, new `core/compare` ≈ 180 B (line 250), Angular +≈15 B (and K.8). Small: **build now**
(Q16-7 only decides opt-in vs default; opt-in is built first, a default is a one-line change later).

### C2 → 16i (**dropped**, owner Q16-11, 2026-10-29: no batch apply, so no held edit to meet a live value).
### (was) C2 → 16i. A live value landing on a cell with an unapplied or unsaved edit (F:P4) — structural, before C3
Today: entries `pending` / `saving` survive a source change and keep showing the user's value; the incoming value is
silently hidden (`edit-save.md` 17; `controller.ts:266–282`). With batch apply (C3) such entries live for minutes, so the
rule must be chosen first.
**Recommended (Q16-13 A).** The user's value stays; the cell gets a **conflict mark** (an orange corner at the inline
start and a dotted underline — not colour only); its description and tooltip say « Modifié ailleurs : 12,5 » (the
incoming value as the column writes it); event `editConflict { key, column, mine, theirs }` (values, never in a
Problem). Applying sends the user's value (the app's server decides); Escape / discard on that cell takes the server's.
Each conflict is said once (« Valeur modifiée ailleurs »).
**Core vs DOM.** Core `edit/controller.ts` (detect in `sweep`: the source value of a live entry changed since the
gesture), DOM `edit/marks.ts` + `theme/edit.css`, texts in `{en,fr,ar}-edit`.
**Tests first** (`core/test/edit-conflict.test.ts`, `dom/test/edit-conflict.test.ts`): pending cell, a patch changes the
same field → one `editConflict` with both values, cell keeps mine, `dzg-cell--conflict`, described; a patch on another
field of the row → no conflict; the same value arriving → no conflict, the entry becomes saved (it is what I typed);
server page answer carrying the row → same; reduced motion: still mark. With `sameRow` (C1): an equal row is no change,
no conflict.
**Reach.** Overlay, marks, tooltip, undo (undo of a conflicting cell goes to the server value), CSV / clipboard (they
read the overlay: mine), print (mine), server wire (mine on apply).
**Size.** `core/edit` +≈100, `dom/edit` +≈80, `edit.css` +≈40, each `*-edit` text bundle +≈30 → raises (table §E).

### C3 → 16j (**dropped**, owner Q16-11, 2026-10-29: `autoApply` sends a request to the server and does nothing to the grid).
### (was) C3 → 16j. Batch apply: modified cells marked, one « Appliquer », « Annuler tout » (F:P1) — structural
First Q16-11: what the owner's tree screen's `autoApply` button does (OM:733–736). The plan below holds if it switches between
« each edit is sent » and « edits wait for Apply ».
**Recommended API.** `edit({ save, hold: true })` (live: `hold: false` sends everything held, as one request). The
`EditApi` gains `held(): number`, `apply(): Promise<void>` (one `save` request with every held cell, origin `'apply'`;
`error.cells` refuses some, the rest saved — `edit-save.md` 5b unchanged) and `discard(): void` (every held cell back to
its source value; one undo step). Event `heldChanged { count }` for the app's « Appliquer (3) » button and its « Annuler
tout ». The buttons are the app's (in its header part), not the grid's (Q16-12 A).
**Behaviour.** A kept value is **held**: today's `pending` state kept out of the queue (`dzg-cell--held`: a tinted cell
and a dot at the inline end, described « Modifié, pas encore appliqué »); fill, paste, bulk edit and undo hold too;
rows do not move (K.14); held cells on other server pages are kept and sent (O9 rule); live values meet C2's rule.
Leaving the page with held cells is the app's to warn (`beforeunload` recipe), never the grid's.
**Interim (1.1.0 as built, 0 B, documented).** No `save`: values stay local (`edit-save.md` 2); the app collects
`cellEdited` in a map, paints it with `ui.cellClass` + a new `context`, sends one request, then patches its rows.
**Core vs DOM.** Core `edit/controller.ts` (`pump()` holds; `flush`; `discard`), DOM `edit/index.ts` (api, event),
`edit/marks.ts`, `theme/edit.css`, texts. Not in K.8 (the audit screen does not edit).
**Tests first.** `core/test/edit-hold.test.ts` (3 commits → 0 save calls, `held()` 3; `apply()` → one request with 3
changes in gesture order; `error.cells` naming one → 2 saved, 1 refused as today (blink, last saved value, error mark); `discard()` →
source values, `cellEdited` with origin `'undo'`, one undo step; fill of 6 cells → 6 held; `hold` turned false → one
request). `dom/test/edit-hold.test.ts` (marks, description, Ctrl+Z on a held cell, a page change keeps them, the
running border only after `apply`). Planted fault: `apply()` sending one request per cell → red.
**Reach.** Overlay → screen, CSV, clipboard, print (held values shown and copied, as pending today), server wire
(one request), saved state (held cells never saved in `GridState`), undo stack.
**Size.** `core/edit` +≈150, `dom/edit` +≈150, `edit.css` +≈50, `*-edit` +≈40 → raises (§E).

### C4 → 16h. New rows after an SSE refresh (F:P10) — structural (what the user sees)
**Done** (2026-10-29, not committed): as recommended, `freshRows({ ms })` with `ms`, texts `announce.fresh` (`{n}`); the
keys go to a callback `freshRows({ rowsArrived: (keys, source) => … })`, not a `GridEvent`: adding `rowsArrived` to the
1.0.0 `GridEvent` union is refused by `check:api` (an app's exhaustive switch would break) — an owner decision
(`node scripts/api.mjs --accept`), not taken here. Built beside the plan: a server source without `sameRow` tells `missing-feature`
(`freshRows`, `sameRow`); the rows counted and marked are those the query keeps (on any page); a row keeps its mark for
the rest of its time when sorted, filtered back, paged or scrolled into view; the look in its own file
`@dzgrid/theme/fresh-rows.css` (not the base theme: 0 B to grids without it), `--dzg-fresh-color` the palette's
success (Clinic and the high-contrast palette's dark a violet, Bootstrap its warning). Tests: `dom/test/fresh-rows.test.ts`
(31), `theme/test/fresh-rows.test.ts` (7), five planted faults caught. No conformance case: no core logic (the core
gained only the event's type). Sizes: `dom/fresh-rows` 544 / 700, texts 115 / 132 / 197 under 150 / 150 / 200,
`fresh-rows.css` 308 / 350 (a new line, the measure + 10 %).
Needs C1 (`sameRow`), so that a refresh of the same page is a delta with `added` keys (fact 6).
**Recommended (Q16-9 A).** A feature `freshRows({ ms: 5000 })` in a new entry `@dzgrid/dom/fresh-rows`: rows added by a
live change (a client delta, or a server refresh of the **same** page and query) get `data-dzg-fresh` for `ms`: a tint
and a bar at the row's inline start (not colour only), then nothing. Not on the first load, a page change, a sort or a
filter (those are new answers, not arrivals). The screen reader hears once « 3 nouvelles lignes » (polite). Reduced
motion: the same still mark (it is not a movement). Event `rowsArrived { keys }` so an app can count them.
**Core vs DOM.** DOM only (reads `ModelChange.transaction.added`, as the motion chunk does); texts `{en,fr,ar}-fresh`.
**Tests first** (`dom/test/fresh-rows.test.ts`): server source, `rows.refresh` answering 2 new rows on top → those 2
rows marked, others not, one sentence; same rows → nothing; page 2 → nothing; query change → nothing; after 5 s (fake
clock) the attribute is gone; a pooled row element shown for another row loses it at once.
**Reach.** Screen only (never exported, printed or copied); selection untouched.
**Size.** new entry ≈ 600 B (line 700), texts ≈ 120 B each (lines 150 / 150 / 200). 0 B elsewhere.

### C5 → 16k (**dropped**, owner Q16-14, 2026-10-29: no totals computed in the browser).
### (was) C5 → 16k. Totals inside a tree (F:P5) — structural
First Q16-14: who computes the owner's tree screen's totals today (the server, or ag-Grid). If **the server**: nothing to build —
C1 makes the new totals flash; the doc says so (recommended path if true). If **the browser must sum children after
an edit**: a later sub-step `tree({ sums: { <column>: 'sum' } })` (a parent row's cell shows its children's sum,
recomputed after edits, fill and live changes; read-only on parents), in a new entry `@dzgrid/core/tree-sums`
(≈ 700 B) plus `dom/tree` (≈ 150 B), designed to reuse Phase 7's D14/D15 seams (`phase-7-plan.md`). Planned only after
the answer; not in 1.1.0 unless the owner says so.

### C6 → 16f. Saving open rows by the app's own ids (F:P7, OM:695–703) — small
Fact 7: the pieces exist. Built: `expandedIds(controller): string[]` in `angular/src/helpers.ts` (mirror of
`selectedIds`: the ids of the open data rows, `idOfDataKey`, fillers left out). Restore: the recipe
`[expanded]="openKeys()"` with `openKeys = computed(() => new Set(saved().map(dataKey)))` — keys whose rows are not there
yet open when they arrive (`grid.ts:184`). Path-tree fillers (parents with no row of their own) have no id:
`groupKey(path)` restores them, and Q16-8 asks whether the owner's tree screen has any.
**Tests first** (`angular/test/expanded-ids.test.ts`): tree with ids 'A', 'A1'; open A → `['A']`; filler `g:` key open →
not listed; restore before rows arrive → A open once they arrive.
**Size.** Angular +≈40 B (not K.8: the audit profile does not import it). Small: **build now**.

### C7 → 16d. Scrolling to a column without naming a row (F:P2) — small
`ensureVisible(row: RowKey | null, column?: string)` in `GridApi` and `DzgController`: null scrolls the column only.
Already the runtime behaviour (fact 7); a widened type (allowed by `check:api`), a sentence in `column-layout.md`, and
a test (`dom/test/ensure-column.test.ts`: 200 columns, `ensureVisible(null, 'c150')` → column 150 in view, block
scroll unchanged, focus unchanged; in Arabic, the same column in view from the other side). 0 B.

### C8 → 16d. Clearing the selection after a bulk action (F:P9) — small
Recipe (0 B): `dispatch({ type: 'selection.clear' })` after the action (A1.4, A3.2), written in `server-selection.md`
and `selection-rules.md` (« a rule never unticks: clear after the action »). The optional « drop rows the rule now
refuses » is **not** built (it would untick rows under the user's eyes without a gesture).

### C9 → 16d. Time-slot column groups (F:P2, OM:1030–1092) — small (docs and one conformance case)
A recipe page `docs/recipes/time-slots.md`: the app builds the slots with tzslot (92 / 96 / 100 quarter-hours on DST
days), groups them PAST / REAL_TIME / ADJUST_A / ADJUST_B, calls `columns.set` when « now » crosses a slot (widths kept by
id), makes PAST read-only with `editable: false`, styles groups with `.dzg-hgroup[data-g="REAL_TIME"]` (colours as
`--dzg-*` / app variables), hides PAST's label visually (its name stays), translates labels by giving new `columns` and
`messages` on a language change (F:P16), and scrolls to the current slot with `ensureVisible(null, slotId)` (C7).
Test: `core/test/columns-regroup.test.ts` — a slot moving from REAL_TIME to PAST via `columns.set` keeps its width and
the user's order; conformance `conformance/cases/header-bands/regroup-slot.json`. 0 B. A group-header part slot is not
needed (the old renderer only translated and coloured).

### C10 → 16l. A loading sign on « Rafraîchir » with the rows kept (F:P13) — Q16-10
A (recommended, 0 B): the recipe A1.10 (the overlay over the rows, as the ag-Grid screen did). B: a thin indeterminate
bar under the header while a refresh runs, rows readable (`aria-busy` on the grid; ≈ 80 B in `@dzgrid/dom` base and
K.8: not affordable under 85 000 with 16a and 16e).

---

## D. Order of work

Small first; each line ends with `npm run gate:step` and a review (code review + the « Reach » list).

| Sub-step | What | Waits for | Can start now |
|---|---|---|---|
| **16a** | one sort only (`multiSort`) | — | **yes** |
| **16b** | set list: start empty, no select all | Q16-1, Q16-2 (defaults built as A) | **yes** |
| **16c** | `detail({ isMaster })` + follow-columns recipe test | Q16-3, Q16-4 (A built) | **yes** |
| **16d** | docs: B4 problems recipe, C7 `ensureVisible(null, col)`, C8 clear recipe, C9 time slots, F:P16 language | — | **yes** |
| **16e** | `sameRow` + `@dzgrid/core/compare` + perf line | Q16-7 (opt-in built) | **yes** |
| **16f** | `expandedIds` + restore recipe | Q16-8 for fillers only | **yes** |
| — | apply §A to the rewrite (lead, outside the repo) | 16a, 16c for A1.6–A1.7 | **yes** for the rest |
| **16h** | `freshRows()` — **done** (2026-10-29) | Q16-9 (A), needs 16e | done |
| ~~16i~~ | ~~live value vs held edit (conflict)~~ — **dropped** (owner Q16-11, 2026-10-29) | — | — |
| ~~16j~~ | ~~batch apply (`hold`)~~ — **dropped** (owner Q16-11: `autoApply` only calls the server) | — | — |
| ~~16k~~ | ~~tree totals~~ — **dropped** (owner Q16-14: the server computes every value) | — | — |
| **16l** | refresh bar (only if Q16-10 B) | Q16-10 | no |
| **16z** | close: CHANGELOG `[1.1.0]`, `release-1.1.0.md` « Ajouté pour vos écrans », ROADMAP, `decisions.md`, STATUS; architect check against ARCHITECTURE; `test:real-app` | all above | — |

## E. Bytes (gz; estimates, measured at each sub-step; stop and ask past any granted line)

| Budget | Now / line | After (est.) | Verdict |
|---|---|---|---|
| core base guard (`layering.test.ts` BASE) | 29 064 / 29 070 | ≈ 29 105 (16a +12, 16e +28) | **raise → 29 110** |
| `@dzgrid/core` | 29 064 / 29 150 | ≈ 29 105 | fits |
| **K.8 audit profile** | 84 912 / 84 950 | ≈ 84 990 (core +40, `DzGrid` inputs +35) | **raise → 85 000 (the hard ceiling; no room left after)** |
| `@dzgrid/dom` | 22 347 / 22 400 | ≈ 22 360 | fits |
| `filters: set (lazy)` | 4 339 / 4 350 | ≈ 4 400 | **raise → 4 450** |
| `@dzgrid/dom/filters` | 10 091 / 10 100 | 10 091 (all in the chunk) | fits |
| `@dzgrid/core/detail` | 1 012 / 1 050 | ≈ 1 057 | **raise → 1 100** |
| `@dzgrid/dom/detail` | 4 077 / 4 150 | ≈ 4 120 (B: ≈ 4 270) | fits (B: raise → 4 300) |
| `@dzgrid/angular` | 7 316 / 7 350 | ≈ 7 390 | **raise → 7 450** |
| `@dzgrid/core/compare` (new) | — | ≈ 180 | **new line 250** |
| `@dzgrid/dom/fresh-rows` (new, 16h) | — | ≈ 600 | **new line 700**; texts 150 / 150 / 200 |
| `@dzgrid/core/edit` (16i + 16j) | 3 156 / 3 160 | ≈ 3 410 | **raise → 3 450** |
| `@dzgrid/dom/edit` (16i + 16j) | 4 150 / 4 150 | ≈ 4 380 | **raise → 4 400** |
| `@dzgrid/theme/edit.css` | 2 236 / 2 250 | ≈ 2 330 | **raise → 2 350** |
| `en / fr / ar-edit` | 517 / 560, 598 / 630, 895 / 900 | ≈ +70 each | **raise → 600 / 700 / 1 000** |
| `core/tree-sums`, `dom/tree` (16k, only if built) | — | ≈ 700 / +150 | asked after Q16-14 |

Verdict: the six small sub-steps cost ≈ 40 B of core base and ≈ 35 B of Angular inputs, which **use up K.8 to its
85 000 ceiling**; nothing else may touch the base, the filters' eager part or the `DzGrid` component after them (hence
B4 B and C10 B are not recommended). The structural steps live in entries the audit screen does not load (edit,
fresh rows, tree), so they need line raises but no K.8 bytes.

## F. Owner questions (en français, simple)

*Peuvent attendre que les petites étapes soient construites (on construit la réponse A en attendant) :*

**Q16-1 — Liste de filtre « vide au départ » : rien coché puis Appliquer.**
A (recommandé) : pas de filtre, toutes les lignes reviennent. B : aucune ligne (le tableau est vide).

**Q16-2 — Même liste : tout coché puis Appliquer.** — **réglée par la Q1 du propriétaire** (« tout coché == pas de filtre du tout », decisions.md « Set filter include only ») : pas de filtre ; construit ainsi (`ALL_TICKED_IS_INCLUDE = false`).
A (recommandé) : on envoie toutes les valeurs cochées ; en rouvrant, tout est coché. B : pas de filtre ; en rouvrant,
rien n'est coché.

**Q16-3 — Lignes sans détail (pas de flèche).**
A (recommandé) : la place de la flèche reste vide, les textes de la colonne restent alignés. B : le texte commence au bord.

**Q16-4 — Les colonnes du détail suivent celles du tableau principal.**
Aujourd'hui vos colonnes ne bougent pas. A (recommandé) : une recette de 10 lignes dans l'app, 0 octet. B : une option
de la grille (+150 octets).

**Q16-5 — Les erreurs de réglage (ex. cases à cocher sans `rules()`).**
La grille les signale déjà, mais seulement si l'app écoute `(problems)`. A (recommandé) : l'app les écrit dans la
console en développement (2 lignes, déjà dans la réécriture). B : la grille les écrit elle-même (prend la dernière place
de l'écran d'audit).

**Q16-6 — « Tout acquitter » : que veut le serveur ?**
A (recommandé) : la liste des identifiants cochés, toutes pages. B : les lignes entières (l'écran les garde page par page).

**Q16-7 — Flash après un rechargement complet.**
A (recommandé) : l'app l'active (`sameRow`) ; seules les cellules vraiment changées clignotent. B : actif pour toutes
les grilles par défaut.

**Q16-8 — answered « oui » (owner, 2026-10-29): categories are real rows with an id; open rows saved by id with `expandedIds` (16f). — l'écran arbre du propriétaire : les lignes parents (les catégories) sont-elles de vraies lignes envoyées par le serveur, avec un id ?**
Oui : on sauve les lignes ouvertes par id. Non : on les sauve par leur chemin.

*Avant les grosses étapes :*

**Q16-9 — Nouvelles lignes après un rafraîchissement (SSE).**
A (recommandé) : les nouvelles lignes sont teintées avec une barre au début, 5 secondes ; le lecteur d'écran dit « 3
nouvelles lignes ». B : la marque reste jusqu'au prochain clic. C : rien.

**Q16-10 — Pendant « Rafraîchir ».**
A (recommandé) : le sablier par-dessus les lignes, comme aujourd'hui. B : une fine barre sous l'en-tête, les lignes
restent lisibles (pas de place dans la limite de taille actuelle).

**Q16-11 — l'écran arbre du propriétaire : à quoi sert le bouton `autoApply` ?**
Est-ce « envoyer chaque saisie tout de suite » contre « garder les saisies jusqu'à Appliquer » ? Ou autre chose (un
calcul automatique) ?

**Q16-12 — Saisie en lot (si Q16-11 = garder jusqu'à Appliquer).**
A (recommandé) : chaque cellule modifiée est teintée avec un point ; vos boutons « Appliquer (3) » et « Annuler tout »
restent dans votre en-tête ; un seul envoi au serveur. B : la grille dessine ces boutons elle-même.

**Q16-13 — Une valeur arrive du serveur sur une cellule modifiée mais pas encore appliquée.**
A (recommandé) : on garde la saisie ; la cellule prend une marque orange « modifié ailleurs » avec la valeur du serveur
dans la bulle. B : la valeur du serveur gagne, la saisie est perdue (on le dit). C : comme aujourd'hui, la saisie gagne
sans rien dire.

**Q16-14 — l'écran arbre du propriétaire : les totaux de l'arbre, qui les calcule aujourd'hui ?**
Le serveur : rien à construire, ils clignoteront quand ils changent. ag-Grid (dans le navigateur) : il faut une
fonction « somme des enfants » dans la grille (gros travail, à planifier après).

**Q16-15 — Limites de taille.**
Il faut monter : écran d'audit 84 950 → 85 000 (le plafond : plus aucune place ensuite), base du cœur 29 070 → 29 110,
liste de filtre 4 350 → 4 450, détail (cœur) 1 050 → 1 100, Angular 7 350 → 7 450 ; nouvelles lignes : comparaison 250,
nouvelles lignes 700 ; et pour la saisie en lot : édition (cœur) 3 450, édition 4 400, `edit.css` 2 350, textes
d'édition 600 / 700 / 1 000. D'accord ?

## Sizes awaiting the owner (16a–16f built, 2026-10-29) — **granted** (owner Q16-15, 2026-10-29, « ok pour les hausses »; lines in decisions.md « Step 16 — owner answers »: K.8 90 000, set 4 500, core/detail 1 150, Angular 7 450, core base guard 29 150, core/compare 300)

Measured with `node scripts/size.mjs` after `npm run build` (gz, level 9, minified, on this machine), all six
sub-steps in. **No budget was raised** (Q16-15 unanswered); these lines are red in `check:size`, and the core base
guard in `packages/core/test/layering.test.ts` (`BASE`) is red in `test:ci`.

Golfed first: the core base dropped the descriptions of nine internal symbols (`Symbol('dzgrid.emit')` → `Symbol()`,
…; behaviour unchanged): −51 B gz, which paid for 16a and part of 16e. `INACTIVE` keeps its description: removing it
pushed `core/state` to 1 511 / 1 510 by compression noise. The set chunk and `core/detail` were golfed by several
variants (the cheapest kept); an Angular input costs ≈ 49 B gz by itself (the compiler's input metadata).

| Budget | Before | Line | Measured now | Over by | Where it comes from | Q16-15 asked |
|---|---|---|---|---|---|---|
| core base guard (`layering.test.ts` `BASE`) | 29 064 | 29 070 | **29 106** | **+36** | 16a +10, 16e +72 (store's `sameRow`, its try and its warning), symbols −51, noise | 29 110 |
| `@dzgrid/core` (check:size) | 29 064 | 29 150 | 29 106 | fits | — | — |
| **K.8 audit profile** | 84 912 | 84 950 | **85 133** | **+183** (and **+133 over the hard ceiling 85 000**) | core base +42, `DzGrid` inputs `multiSort` and `sameRow` ≈ +100 (16a, 16e), DOM base +42 (settings passed, `ensureColumnVisible`), `core/server` +11 | 85 000 — **not enough** |
| `@dzgrid/dom/filters: set (lazy)` | 4 339 | 4 350 | **4 467** | **+117** | 16b: `start` / `selectAll`, their two warnings, the draft's two rules | 4 450 — not enough (+17) |
| `@dzgrid/core/detail` | 1 012 | 1 050 | **1 132** | **+82** | 16c: `isMaster` asked once per row and version, `DetailRows.isMaster` | 1 100 — not enough (+32) |
| `@dzgrid/dom/detail` | 4 077 | 4 150 | 4 148 | fits (2 left) | 16c: the empty slot, the keys; `nestedGrid` sees a new `context` | — |
| `@dzgrid/dom` | 22 347 | 22 400 | 22 389 | fits (11 left) | 16a, 16d, 16e pass-through | — |
| `@dzgrid/angular` | 7 316 | 7 350 | **7 438** | **+88** | 16a `[multiSort]` +49, 16e `[sameRow]` ≈ +50, 16d `ensureColumnVisible`, 16f `expandedIds` | 7 450 |
| `@dzgrid/core/compare` (new) | — | none (`maxGzip: null`, measured only) | **273** | +23 over the 250 asked | 16e: `sameValues` | new line 250 — not enough |

What the owner decides: the lines above (or which feature to drop). K.8 is past the hard ceiling: with Q16-15 as
asked it would still be red; the plan's estimate (+40 core, +35 Angular) was low — each Angular input costs ≈ 49 B gz,
and `sameRow`'s core part 72. Options to put before the owner: raise K.8 past 85 000; or keep `[sameRow]` /
`[multiSort]` out of `<dz-grid>` (set through `provideDzGrid` defaults, ≈ 0 B in the component) — a structural
choice, not taken here.

Other measures: `sameValues` on a full reload of 100 000 rows × 20 fields, in node (vitest, this machine): the store's
`replaceAll` 110 ms median with it, 56 ms without (+54 ms). The Chrome perf line the plan asks for
(`perf/browser-budgets.json`, ≤ 60 ms) is **not added**: not measured in Chrome in this pass.
