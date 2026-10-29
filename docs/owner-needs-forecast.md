# Owner needs forecast (architect, 2026-10-29)

## Résumé pour le propriétaire

- Les six demandes de 1.1.0 venaient de vos écrans, pas de notre liste générique. On a donc relu tout votre code
  (le tableau des journaux, les requêtes, l'écran arbre du propriétaire) pour deviner les prochaines.
- **Déjà cassé dans la réécriture du tableau des journaux** (`~/Desktop/data-table-dzgrid`) :
  1. Les cases à cocher n'apparaissent pas : `selectable` donne une règle `canSelect`, mais la fonction `rules()`
     n'est pas dans `features`. Sans elle, la grille passe en « aucune sélection ». « Tout acquitter » n'envoie rien.
  2. Avec la pagination serveur, la grille garde les lignes cochées des autres pages, mais `selectedRows()` ne
     renvoie que la page affichée. Les autres sont perdues sans le dire. Il faut envoyer `selectedIds()`.
  3. Le détail : `height: 'auto'` ne marche pas avec une grille imbriquée. Et chaque ligne a un chevron, car
     DzGrid n'a pas d'équivalent de `isRowMaster`.
  4. Maj+clic ajoute un deuxième tri. La grille affiche deux flèches, mais le serveur n'en reçoit qu'une.
  5. Le filtre « sources » venu de l'extérieur n'est plus branché.
  6. Le filtre à liste s'ouvre avec tout coché. Aujourd'hui il s'ouvre vide, sans « tout sélectionner ».
- **Piège pour l'écran arbre du propriétaire** : si l'appli recharge tout le tableau (de nouveaux objets à chaque fois), la grille
  le traite comme un rechargement complet et **ne fait aucun flash**. Il faut garder les objets inchangés ou
  envoyer des `patch`.
- **Les trois besoins les plus probables qui arrivent** :
  1. L'écran arbre du propriétaire : saisir puis « Appliquer » d'un coup (votre bouton `autoApply`). Il faut des cellules marquées
     « modifiées », un envoi groupé, et un « annuler tout ».
  2. L'écran arbre du propriétaire : des colonnes par créneau horaire (vos groupes PAST / REAL_TIME / ADJUST_*), qui changent de groupe
     avec l'heure, avec le passé en lecture seule et un défilement jusqu'à « maintenant ».
  3. Journaux : marquer les nouvelles lignes après un rafraîchissement SSE.
- Une partie est déjà possible avec 1.1.0, souvent au prix d'un peu de code dans l'appli. Le regroupement de la
  Phase 7 n'aide pas l'écran arbre du propriétaire : il refuse les arbres. Les totaux dans un arbre ne sont prévus nulle part.

## Sources read

- Owner materials: `/private/tmp/claude-501/-Users-nadou-Dev-dzgrid/7010c6e2-c17b-44c1-895d-a4353eb5fd98/scratchpad/owner-materials.md`,
  cited as **OM:line**. Owner text: pastes 1, 4, 5 and 9. Every `<agent-message>` and `<task-notification>` block is
  model output, not owner input, and was used only as a pointer to code.
- The DzGrid rewrite: `~/Desktop/data-table-dzgrid/{data-table.component.ts,html, alarm-log.screen.example.ts, to-query.ts}`,
  cited as **RW:file:line**.
- DzGrid at `3953e8a`: `packages/core/src/kernel.ts` (`GridCommand`, `GridEvent`), `packages/angular/src/{grid,controller,helpers}.ts`,
  `packages/core/src/columns/defs.ts`, `docs/behaviors/*`, `ROADMAP.md` « 1.1.0 », `docs/phase-7-plan.md` (draft).
- Not given: the owner's tree screen's own `columnDefs` (only `autoGroupColumnDef`), `TreeScreenUtils`, its cell renderers and its
  save code. Predictions that depend on them are marked *inferred*.

## 1. Inventory and mapping

Grades: **(a)** covered, **(b)** covered but awkward, **(c)** missing. **(!)** marks something broken today in the
rewrite or for the owner's tree screen.

### 1.1 Shared log table (`DataTableComponent`, OM:7–593)

| # | ag-Grid usage (evidence) | What it does for them | DzGrid today | Grade |
|---|---|---|---|---|
| L1 | `rowModelType: 'clientSide'` + their own pager, `notifyOnChangePageAndSize` (OM:150, 297–305) | server paging by hand | `sourceRows(..., { paging: 'offset' })` + `operations="server"` + `pagination()` (RW:ts:105, html:34) | a |
| L2 | `onFilterChanged` → emit the filter model, page 1 (OM:307–312) | refetch | the grid builds the `DataRequest`; `toQuery` maps it (RW:to-query.ts:55) | a |
| L3 | `onSortChangedEvent`, `suppressMultiSort: true` (OM:195, 317–330) | one sort column for the backend | the sort goes into the request; **Shift+click still adds a second sort** (`interact/header-click.ts:35`), and `toQuery` sends `sort[0]` only. No setting turns multi-sort off | **c (!)** |
| L4 | Set filter: `values(params)` waits for the server, `notifyGetValuesFilterFromServer` (OM:225–263, 265–273, 370–379) | DISTINCT values with the other filters | `fromObservable(..., values)` → `ValuesRequest` with the other filters (RW:ts:94–101) | a |
| L5 | `filterParams.valueFormatter` with `filterTranslateKey`; `useName` (OM:238–240, 283–290, 111) | translated value labels | `label` in the values response (RW:alarm-log:50–55); cell text through `enumOptions` labels | a |
| L6 | `defaultToNothingSelected: true`, `suppressSelectAll: true`, `buttons: reset/apply`, `closeOnApply` (OM:231–236) | the list opens empty, no "select all" | `apply: 'button'` covered. The popup **opens with everything ticked** and always shows "Select all" (`filter-set.md` 45–46); no option for either | **c (!)** |
| L7 | Include-only set lists (OM:4 request bodies: `{"values":[…],"filterType":"set"}`) | backend reads inclusions only | `filter: { kind: 'set', exclude: false }` (1.1.0, `filter-set.md` « Include only ») | a |
| L8 | `onFilterOpened` adds class `exchange-type` to `.ag-popup` for column `type` (OM:275–280) | style one popup | `.dzg-fpop[data-column="type"]` (`theming.md` 87–91) | a |
| L9 | External filters: `agGridService.onDateFilterChanged` / `onSourcesFilterChanged` → `getColumnFilterInstance().setModel()` (OM:345–368) | date range and sources from outside the grid | dates: `external` params (RW:ts:58, to-query:58–61). **Sources are not wired in the rewrite.** DzGrid can do it with `controller.dispatch({ type: 'filter.column', … })` | **b (!)** rewrite gap |
| L10 | Loading overlay through a signal and `setGridOption('loading')`, custom templates (OM:120–125, 151–157, 401–408) | spinner, "Aucune donnée" | `overlay` part with `loading/empty/no-match/error` (RW:html:40–57); the host's `[overlay]="'loading'"` exists (`settings.ts:48`). On a refresh with rows kept, the server loading overlay is **not** shown (`overlays.md` 15), whereas "Rafraîchir" shows it today | b |
| L11 | `reLoadData()` (Rafraîchir), SSE refresh via store | refetch the current page | `rows.refresh` (RW:ts:131; keeps page and scroll, `server-pagination.md` 24, 45) | a |
| L12 | `clearFilters()`: filter model null, default sort, reset dates, page size 100 (OM:410–434) | reset | `query.set` with the default sort (RW:ts:136) or `DzgController.clearFilters()` / `resetState()` (`controller.ts:66–77`). The page size is not reset in the rewrite | a |
| L13 | `rowSelection: multiRow` + `isRowSelectable: status === 'PENDING'` (OM:190–193) | only pending alarms can be ticked | `selection.canSelect` **requires the `rules()` feature**: without it the selection mode becomes `none` and a `missing-feature` error is told (`dom/src/update.ts:54`, `part.ts:321`, `selection-rules.md`). The rewrite passes `canSelect` without `rules()` (RW:ts:113–116, 119–137) | **a, broken in the rewrite (!)** |
| L14 | `acquitAlarms()`: `getSelectedRows()` → emit (OM:436–439) | bulk action | on server pages the selection keeps keys from other pages (`server-selection.md` 14). `selectedRows()` (RW:ts:141–149) returns the loaded rows only, so ticks on other pages are **silently dropped**. `selectedIds(controller)` (`angular/src/helpers.ts:21`) gives every id | **b (!)** |
| L15 | `onFirstDataRendered` → unselect every node (OM:470–474) | start with nothing ticked | the default; `firstDataRendered` is in `GridEvent` (through `(gridEvent)`) | a |
| L16 | `ngxPermissionsOnly` on the acquit button (OM:531) | permission | outside the grid; `[actions]` slot (RW:html:27) | a |
| L17 | Columns with `width === 0` hidden at ready (OM:335–339) | hidden columns | `ColumnDef.hidden` (`defs.ts:54`) | a |
| L18 | `columnMoved` / `columnVisible` listeners, `getColumnState` / `applyColumnState` to every detail grid (OM:340–342, 383–393, 206–208) | detail grids follow the master's column order and visibility | the user cannot move columns in the rewrite at all (`columns()` not in `features`; ag-Grid lets them by default). There is no master → nested column-state link. The app could pass the master's state to `nestedGrid({ settings })` itself | **c** |
| L19 | `masterDetail`, `isRowMaster` (OM:68–72, 197–198) | only some rows open a detail | `detail()` has no `isMaster` option (`core/src/detail/shape.ts:8–19`, `dom/src/detail/index.ts:15–22`): **every row gets a chevron**, and an empty one opens an empty grid | **c (!)** |
| L20 | `getDetailRowData`, `detailColDefs` (OM:200–211) | detail rows from the master's data | `nestedGrid({ settings: (c) => ({ rows: d.rowsOf(c.row) … }) })` (RW:ts:124–127) | a |
| L21 | `getRowHeight`: detail height = `linkedBidTimeSeries.length × rowHeight + 7` (OM:213–215, 441–449) | detail sized to its rows | `detail.height` as a function of the master (`shape.ts:10`) covers it. The rewrite uses `'auto'`, which `master-detail.md` 62 says a nested grid cannot use (an inner virtual grid has no natural height) | **a, broken in the rewrite (!)** |
| L22 | `tooltipShowDelay: 500`, `appTooltip` (OM:558) | tooltips | `tooltips: { delayMs }` (`settings.ts:51`); not set in the rewrite | a |
| L23 | `AG_GRID_LOCALE_FR` (OM:33, 146–148) | French texts | `FR` + feature bundles (RW:ts:24–27) | a |
| L24 | `defaultColDef`: sortable, resizable, filter, `unSortIcon`, `minWidth: 30` (OM:134–145) | defaults | per-column defaults; no "always show the unsorted icon" | a |
| L25 | `screenName === 'alarmLog'` branching inside the shared table (OM:527) | screen-specific buttons | content projection `[actions]` | a |

### 1.2 The owner's tree screen (OM:692–761, 1030–1092)

| # | ag-Grid usage (evidence) | DzGrid today | Grade |
|---|---|---|---|
| B1 | `treeData` + `getDataPath: hierarchyPath` (OM:728–729) | `tree({ path })` (`core/src/tree/shape.ts:16`) | a |
| B2 | `getRowId: data.id` (OM:722–724) | `getRowId`, required | a |
| B3 | `enableCellChangeFlash`, `cellFlashDuration: 3000`, `cellFadeDuration: 1000` (OM:713–718) | `motion({ effects: { flash: { hold: 3000, fade: 1000 } } })` (1.1.0, `motion.md` 20). **But** the flash runs only for a delta. A `[rows]` replacement counts a row as "updated" when **the object is a new one** (`core/src/row/store.ts:250`), and more than half the rows updated is a reset with no flash (`store.ts:119`). Reloading the whole table as new objects = **no flash at all** | **b (!)** |
| B4 | `cellSelection.handle: { mode: 'fill', direction: 'x' }` (OM:719–721) | `fill(blocks, { along: 'row' })` (1.1.0) | a |
| B5 | `suppressMovableColumns`, `animateRows: false` (OM:716, 727) | no `columns()` feature; motion off by default | a |
| B6 | `autoGroupColumnDef` with `field: 'groupLabel'`, width 180, no fill, no menu or filter button (OM:730–757) | the tree column is an ordinary column: `menu: false`, `filter: false`, `editable` false | a |
| B7 | `cellRendererSelector` main vs sub label (OM:746–752) | one `ui.cell` part that branches on the row | a |
| B8 | `cellClassRules: hide-duplicate` + `rowSpan` (OM:742–745) | `merge` / `rowSpan` with `spans()` inside a tree (1.1.0) | a |
| B9 | `cellRendererParams: suppressCount / suppressExpandIcon / suppressPadding` (OM:753–756) | `tree({ fixedOpen })` (1.1.0) for the always-open rows; no count is drawn | a |
| B10 | Header component on the tree column with `autoApply` callback (OM:733–736) | `ui.header` part (Angular `componentPart`), `partAction` to the app | a |
| B11 | `getRowStyle: TreeScreenUtils.getRowStyle` (OM:759) | `rowClass` (classes, colours via CSS variables only) | b (style → class) |
| B12 | Header group renderer: `'SAM.' + groupName \| translate`, label hidden for `PAST`, background per group (OM:1030–1092) | `data-g` hook on `.dzg-hgroup` for the background (1.1.0, `header-groups.md`). The header is a pre-translated string (`defs.ts:165`), so a language change means `columns.set`. An empty header shows the id, so hiding PAST's label needs a visually hidden real label (`theming.md`). There is no part slot for a group header | b |
| B13 | `gridContext.getSelectedValue` / `onRadioSelection` (OM:692–706) | `settings.context` reaches every part (`parts.md` 37). **A context changed in place is not seen**, and their code mutates `this.selectedValue` in place. They must pass a new object | b |
| B14 | `gridContext.onExpandNode` → `localProfileService.saveGridState("TREE_SCREEN_GRID", ids)` (OM:695–704) | `[(expanded)]` model / `rowExpanded` (`angular/src/grid.ts:132`). It holds **RowKeys** (`d:…`; path fillers `g:…`), not ids, and expansion is never in `GridState` (Q-S1). ROADMAP 1.1.0 already flags "the keys of a path tree's fillers versus the ids the app saves" | b |

### 1.3 Events they listen to, and DzGrid's

| They listen to | Why | DzGrid | Grade |
|---|---|---|---|
| `gridReady` | keep the api, wire external filters | `(gridReady)` → `DzgController` | a |
| `filterChanged`, `sortChanged` | refetch | not needed (the grid asks); `filterChanged` / `sortChanged` exist | a |
| `filterOpened` | ask for set values, style the popup | not needed (values request; `data-column`) | a |
| `firstDataRendered` | clear the selection | `firstDataRendered` via `(gridEvent)` | a |
| `columnMoved`, `columnVisible` | sync detail grids | `columnsChanged { changed, layoutChanged }` | a (the sync itself is c, L18) |
| expand via renderer → context | save open rows | `rowExpanded`, `[(expanded)]` | b (keys, B14) |
| radio via renderer → context | one chosen value | `cellAction` from an Angular part | a |
| *(implicit, the owner's tree screen)* cell value changed after edit or fill | save, recompute | `cellEdited { key, column, value, previous, origin }` (`origin` includes `fill`, `paste`, `undo`) | a |
| *(implicit)* editing started or stopped | lock, presence | `editingStarted` / `editingStopped` | a |
| *(implicit)* selection changed | enable "Tout acquitter" | `selectionChanged` gives keys and a count, **not rows**; rows through `kernel().rows.row(key)` (held rows only) or `selectedIds()` | b |

## 2. Predicted needs

Each prediction cites the owner's code. Likelihood: H(igh), M(edium), L(ow). Cost: S (≤ 1 session), M (2–4), L (≥ 5).

### The owner's tree screen (editable tree, flash, fill)

**P1. Deferred apply: dirty cells, one batch "Appliquer", discard all. H · M.**
Evidence: `headerComponentParams: { autoApply: this.autoApply.bind(this) }` (OM:734–736). An "auto apply" switch
implies a manual mode, where edits wait for an explicit apply. The fill handle (OM:719) makes many edits per gesture.
Today: `edit({ save })` saves each gesture at once (`edit-save.md` 1). Without `save`, values are kept locally and
`cellEdited` tells the host, but the `saved` mark disappears after 1.5 s, so there is no lasting "modified" marker,
no `pending()` list, no `applyAll()` and no `discardAll()`. Workable in the app: track a dirty map from `cellEdited`,
paint it with `ui.cellClass` + `context`, send one request, then update the rows. That is **(b)**. A first-class
`edit({ save: 'manual' })` (the dirty state, a batch commit through the existing many-cell `save` with `error.cells`,
and discard as an undo of everything) is **new**.

**P2. Time-slot columns generated from data, regrouped as time passes. H · S–M.**
Evidence: header groups `PAST`, `REAL_TIME`, `ADJUST_A`, `ADJUST_B` and a default (OM:1066–1084). These are horizons of
a day of the owner's tree screen (A / B adjustments). The header label is hidden for PAST (OM:1043). Likely 96 quarter-hour or 24
hourly columns, each moving from REAL_TIME to PAST over the day.
Needs:
- `columns.set` every slot change, keeping the user's widths by id (covered, `kernel.ts` `columns.set`).
- PAST columns read-only: an `editable` rule by column. Covered.
- A current-slot highlight: `ui.headerClass` / `ui.cellClass`. Covered.
- Horizontal column virtualisation: covered (K.3).
- **Scroll to "now" without a row**: `ensureVisible(row, column?)` needs a row (`dom/src/grid.ts:32`). Awkward: pass the first row's key.
- DST days with 92 or 100 quarter-hours: built by the app with tzslot, since the core has no `Date`. Covered by design, but worth a conformance example.

**P3. Live updates that flash, without a reset. H · S.**
Evidence: `enableCellChangeFlash` + `getRowId` (OM:713–724). The flash only makes sense if values change under the user.
Needs: the delta from a full reload, keyed by id and compared by value. Today a `[rows]` replacement made of new
objects is a reset with no flash (B3), so **(b) bordering on broken**. The fix in the app is to send `patch`
transactions (`kernel().rows.applyTransaction`, `store.ts:172–179`) or to keep unchanged objects. The fix in DzGrid is
an option that compares fields of rows with the same id (`rows` diff by value). That is **new**, small.

**P4. A live update hitting a cell the user changed and has not applied (or is saving). M · M.**
Evidence: P1 plus P3 on the same cells.
Today: the overlay value stays until the source shows it (`edit-save.md` 3, 17). A different incoming value is not a
defined conflict: there is no "server changed this cell under you" state and no event. This is **(c)**, and must be
specified before P1 ships.

**P5. Totals or balance rows inside the tree. M · L.**
Evidence: `isMainLabel` rows with their own renderer (OM:747–749), merged duplicate labels (OM:743–745), and the domain
itself (need versus offers).
If the server sends the totals, P3 covers it. If the client must sum children after an edit, nothing covers it: Phase 7
aggregation refuses a tree (`phase-7-plan.md` D20). A pinned bottom row with host-computed totals is covered
(`pinned-rows`, editable, but a `T` row). Grade: **(c)** for in-tree aggregates, **new**.

**P6. Paste blocks from Excel, undo, validation of numbers. H · 0.**
Evidence: `cellSelection` (OM:719). Covered: `range()`, clipboard, `edit-undo.md`, `validate` / `min` / `max` on columns. **(a)**.

**P7. Save open rows per user, restore them. H · S.**
Evidence: OM:698–703. `[(expanded)]` works, with pending keys opened on arrival (`grid.ts:184`). But it holds keys, not
ids, and path fillers have no id. A helper `expandedIds(controller)` / `expandIds(ids)` mirroring `selectedIds` is
**new**, small. Grade **(b)**.

**P8. Column state saved to the same profile service (server, per user). M · 0.**
Evidence: `localProfileService.saveGridState(...)` (OM:703). The service exists, so widths, order and sort will follow.
Covered: `gridState()` + `(stateChanged)` + `[state]` (`grid-state.md`). **(a)**.

### Log screens (server pages, SSE, alarms)

**P9. Bulk actions on the selection across pages, then a clean selection. H · S.**
Evidence: `acquitAlarms()` + `getSelectedRows()` (OM:436–439) and server paging (OM:297–305).
- Covered: `selectedIds()` (ids, mode, query) for the request.
- Awkward: after the action plus refresh, the acquitted rows stay selected, because a rule is never re-run on rows
  already selected (`selection-rules.md` « A live rule change »). The app must `selection.clear` (one line).
- Optional **new** option: drop selected rows that the rule now refuses when their data changes.

**P10. Mark rows that are new or changed after an SSE refresh. M · M.**
Evidence: the SSE refresh path (RW:alarm-log:58–61) on a log sorted `desc` by `xlogTimestamp` (OM:4). New lines arrive on
top and the user cannot see which are new.
The flash and `enter` effects run for client deltas only (`motion.md` 19); a server refresh is a new answer, not a
transaction. **(c)**, **new**: "rows not in the previous answer" from the server model, by id.

**P11. One sort only, and a set list that opens empty. H · S.**
Evidence: `suppressMultiSort: true` (OM:195), `defaultToNothingSelected`, `suppressSelectAll` (OM:234–235).
Both are visible differences on every log screen today (L3, L6). **(c)**, **new**, small:
- `sort: { multi: false }`;
- `filter: { kind: 'set', start: 'empty', selectAll: false }`.

**P12. Master/detail only where there is a detail, sized to it, columns in step with the master. H · S–M.**
Evidence: `isRowMaster` (OM:71, 198), `calculateDetailRowHeight` (OM:441–449), master → detail column state (OM:383–393).
- `isMaster`: **(c)**, **new**, small (core `detail` shape and the chevron).
- Height: **(a)** with a function.
- Column sync: **(c)**; the app can pass the master's state into `nestedGrid` settings, which is awkward. A
  `nestedGrid({ followColumns: true })` would be **new**.

**P13. Loading shown on "Rafraîchir" and SSE, with the rows kept. M · S.**
Evidence: `showLoadingLayer()` before every reload (OM:401–408).
DzGrid hides the server loading overlay when rows are kept (`overlays.md` 15). The host can set `[overlay]`. **(b)**.
A thin "refreshing" bar that does not hide the rows may be what they want; that would be **new**.

**P14. External column filters driven from outside the grid (sources, calendar). H · S.**
Evidence: OM:345–368. Covered by `filter.column` / `query.set` dispatches and `external` params. **(a)**, but the
rewrite must wire sources (L9).

**P15. Export of the filtered log (CSV), with permission. M · 0.**
Evidence: indirect. These are audit and log screens with permission-gated actions (OM:531). Covered: CSV export with
`canExport(request, context)` and server `exportAll` (`csv-export.md`). **(a)**.

**P16. Translated cell values and a language switch at run time. M · S.**
Evidence: `filterTranslateKey` (OM:284–288), `'SAM.' + groupName | translate` (OM:1036). Labels are pre-translated
strings (`defs.ts:23, 165`, `enumOptions`). A language switch means new `columns` + `messages` from the app. **(b)**.

## 3. Ranking

Ordered by likelihood × how soon their screens hit it, then by cost.

| Rank | Need | Likelihood | Cost | Today | Where it belongs |
|---|---|---|---|---|---|
| 0 | Fix the rewrite: `rules()`, `selectedIds`, detail height function, sources filter (L13, L14, L21, L9) | certain | XS | broken in the rewrite, DzGrid has it | app code (1.1.0 as built) |
| 1 | P11 one sort only + set list opening empty / no "select all" | H | S | missing | new, small (1.1.x / 1.2.0) |
| 2 | P12 `isMaster` for details (+ column sync later) | H | S (+M) | missing | new (1.2.0); sync later |
| 3 | P3 flash on full reloads (diff by value) | H | S | awkward, looks broken | new, small; app workaround in 1.1.0 (`patch`) |
| 4 | P1 deferred apply: dirty cells, batch apply, discard | H | M | awkward | new (1.2.0), before Phase 7 |
| 5 | P2 time-slot columns: reveal a column, DST example | H | S | mostly covered | 1.1.0 as built + `ensureVisible(column)` new, small |
| 6 | P9 bulk action across pages, clean selection after | H | S | covered / awkward | 1.1.0 (docs recipe); option new |
| 7 | P7 open rows by id (save / restore) | H | S | awkward | new helper, small |
| 8 | P4 live update vs pending edit conflict | M | M | missing (unspecified) | new, must come with P1 |
| 9 | P10 new rows after a server refresh | M | M | missing | new |
| 10 | P5 totals inside a tree | M | L | missing | new; **not** Phase 7 as planned (D20 refuses tree + grouping) |
| 11 | P13 refresh indicator with rows kept | M | S | awkward | 1.1.0 (`[overlay]`) or small new |
| 12 | P16 language switch | M | S | awkward | 1.1.0 as built (recipe) |
| — | P6, P8, P14, P15 | H/M | 0 | covered | 1.1.0 as built |

**Phase 7 (grouping) does not serve these screens.** The log screens are server-paged, and Phase 7 refuses
grouping on a server (D16). The owner's tree screen is a tree, and Phase 7 refuses grouping beside a tree (D20). Two Phase 7 items
still matter: D14 / D15 (edits and transactions marking order stale and re-aggregating) should be designed so that a
later in-tree aggregation (P5) can reuse them. And Q-SE should be extended: ask the owner whether any of *their* screens
groups rows at all.

## 4. Broken today (for the owner to act on)

1. **Rewrite, selection** (RW:ts:113–116, 119–128): `canSelect` without `rules()`. The mode becomes `none` and the
   problem is `missing-feature`. Add `rules()` from `@dzgrid/dom/rules`, plus `FR_RULES` texts.
2. **Rewrite, acquit** (RW:ts:141–149): `selectedRows()` drops ticks from other pages. Send `selectedIds(c).ids`, or
   clear the selection on page change.
3. **Rewrite, detail** (RW:ts:123–128): `height: 'auto'` with `nestedGrid`. Use
   `height: (m) => rowsOf(m).length * rowHeight + header + 7`. Every row also shows a chevron (no `isMaster`).
4. **Rewrite, sort** (RW:to-query.ts:65): Shift+click shows two sorts, but one is sent.
5. **Rewrite, sources filter**: not wired (OM:347).
6. **The owner's tree screen, flash**: whole-table reloads of new objects never flash (`store.ts:119, 250`).
7. **The owner's tree screen, context**: mutating `selectedValue` in place is not seen by the parts (`parts.md` 37).
