# Saving and restoring the grid's state (`GridState`)

Written before the code (CLEANROOM). Sources: the public documentation of data grids about saving and
restoring a grid's state (column order, widths, visibility, pinning, sort, filters, pagination, as one
serialisable object), the URL standard (`URLSearchParams`), the Web Storage standard, WCAG 2.2 (3.2.3
consistent navigation; nothing is announced on restore). Plan D11; owner decisions Q-S1 (A: what is saved),
Q-S2 (A: JSON + a change signal, two optional helpers), « Step 1 follow-ups » O6 (the address leaves typed
filters and the search out by default), O1 (the last shown column is never hidden), O7 (one opaque URL
parameter). Entries: `@dzgrid/core/state` (pure) and `@dzgrid/dom/state` (persistence helpers).

## What the user does
Arranges the grid (moves, resizes, hides, pins columns, opens or closes header groups, sorts, filters,
searches, pages, picks a density), leaves the page, comes back — or shares the page's address.

## What they observe
- The grid comes back as they left it: same columns, same order and widths, same sort, filters, search,
  page and density (from the browser's storage).
- An address copied from the audit screen opens on the same columns, sort and page for a colleague; typed
  filters and the search travel in the address only when the application asked for them (O6).
- Opened in Arabic after being saved in French, the same columns are pinned to the same logical side (the
  start, now on the right) in the same logical order.

## Behaviours (numbered, each one a test)

**Shape** (version 1, JSON-safe, logical sides and ids only, **no row data**)
1. `{ v: 1, columns: [{ id, width?, hidden?, pinned: 'start' | 'end' | null, order }], groups?: { [groupId]:
   boolean }, sort, filter, quick?, page?, pageSize?, density? }`. `width` only for a column the user sized
   (a flexible column stays flexible); `order` is the index in the full order.
2. Not saved (Q-S1): expanded rows, selection, focus, scroll position, edits in progress, the floating filter
   row's visibility (choice 1).
3. `sort` and `filter` are the core's canonical query; `filter` holds what the user typed into filters (a
   name searched in a « Patient » filter is in the JSON state). No row object, `RowKey` or cell value ever
   enters the state (a planted row value is absent: tested).

**Capture**
4. `captureState(kernel, opts?)` in the core: deterministic (same grid, same JSON text, keys in a fixed
   order), pure, no clock. `grid.state()` on the DOM grid returns the same.
5. `stateChanged` (debounced 300 ms) fires once per user gesture that changes a saved part (a drag, a key, a
   menu item, a filter after its own pause, a page); **never** for `source: 'host'` changes nor for a
   restore. It carries the new state.

**Restore**
6. `restoreState(kernel, state, opts?) → Problem[]` / `grid.setState(state)`. Order: columns (order, pins,
   widths, hidden) → groups open / closed → density → one `query.set` (sort + filter + quick) → page size →
   page. One `stateRestored` event at the end.
7. **A restore costs at most one server request** (query, page size and page sent together). Step 5
   measures it; if the kernel sends two today, step 5 adds the seam that joins them (plan fact 2).
8. Never throws. Not an object, or no `v`: problem `state-version`, **nothing applied**.
9. **Versions**: `v: 1` is read as written. A **lower** version than the reader knows is upgraded by the
   reader's own upgrade steps, one version at a time (none exist yet; each later version adds the step from
   the one before), then restored. A **higher** version (written by a newer application): `state-version`,
   nothing applied (never guessed).
10. **Unknown or removed column ids** (renamed in a newer application): that entry skipped, warning
    `state-column` (path `columns.<i>`; ids are not row data and are given). A filter or a sort on such a
    column: dropped with the same warning. Columns the state does not name keep their current settings and go
    after the named ones in their current relative order. **Unknown or removed group ids** in `groups`:
    skipped, warning `state-group` (path `groups.<id>`); a non-collapsible group named there: ignored, same
    warning.
11. A field of the wrong type: that field skipped, warning `state-field` (path only).
12. **Never every column hidden** (O1): a state whose `hidden` would leave no column shown keeps the first
    column of the restored order shown — a column a closed group folds counts as not shown, so the column kept is
    the first one no group folds (review R4, Phase 6 step 8b-2); a `hideable: false` column is never hidden by a
    state; each case gives `state-field` (path `columns.<i>.hidden`).
13. A page past the last page: the last page.
14. **RTL identity**: a state captured in LTR and restored in RTL gives the same columns state (order, pins,
    widths) and the same query, and back (property test, 1 000 seeds).
15. A restore while a server request is in flight: the restore's request wins (generation guard).
16. A restore is silent for screen readers (the host's action; the page usually just loaded); the focus is
    not moved.

**Helpers** (`@dzgrid/dom/state`, optional)
17. `persistLocal(grid, key, { include? }) → stop()`: reads `localStorage[key]` and restores it **before the
    grid's first fetch**: on a server grid the first request already carries the saved query and page —
    **one** request at start, never a default fetch followed by a restore. It saves on `stateChanged`. Storage
    blocked, full or holding bad JSON: nothing thrown, one warning `state-storage` (no content), the grid as
    defined. Local storage keeps every part by default (it stays in the user's own browser).
18. `toSearchParams(state, { name = 'grid', include? }) → URLSearchParams` and `fromSearchParams(params,
    { name, include? }) → GridState | null`: one parameter, a compact, stable, URL-safe text (`1.` + base64url of the
    JSON, O7), the version first. Same state → same text. A truncated or edited parameter: null and
    `state-version`.
19. **The address leaves typed filters and the search out by default** (O6): `filter` and `quick` are
    written only with `include: ['filter', 'quick']` (either or both), and read back only with the same
    `include` (review 2026-10-27: a hand-edited address cannot slip them in). Over 4 KB the address keeps
    columns and sort (`too-large`), and if that is still over 4 KB the sort alone (`sort-only`). Read back, a parameter without them
    leaves the grid's filters and search as they are. Columns, groups, sort, page, page size and density are
    always written.
20. Never a cookie; never row data; the helpers never touch `history` themselves (the application chooses
    `pushState` or `replaceState`).

## Health data
Typed filter values and the quick search may be names or record numbers. In an address they reach the
browser history, server logs and `Referer` headers. Decided (« Step 1 follow-ups » O6): the URL helper
leaves them out unless the application opts in with `include` (19); an application that opts in (the audit
screen, for its own filters) does so knowingly.

## Keyboard
None (no user control of its own).

## Announcements
None (16).

## Texts
None in the bundles (problems are codes; sentences belong to the application).

## WCAG notes
- 3.2.3: a restored layout is the user's own; nothing changes by itself after the restore.
- No focus move and no live-region noise on restore (16).

## Where DzGrid differs on purpose
- No row data, ever (health records); no cookie; typed filters out of the address unless asked; versioned
  from day one; logical sides only.

## Decided (`docs/phase-6-steps/decisions.md` « Step 1 follow-ups »)
- O6 (owner): the address omits typed filters and the search by default; `include` opts in (19).
- O1 (owner): never every column hidden, never a `hideable: false` column (12).
- O7 (lead): one opaque parameter `grid=1.…` (18).

## Choices to confirm (not settled by the decisions)
1. The floating filter row's shown / hidden is not in the state.
2. Expanded rows, selection and scroll are not offered even on request (C4: Q-S1's question text said
   « the application may ask for them »; decisions.md does not).
3. `width` saved in CSS pixels as set (not scaled back for the reader's text size).

## As built (Phase 6 steps 5–6, 2026-10-26; `docs/phase-6-steps/step05-plan.md` « Done »)
- Entries: `@dzgrid/core/state` (`captureState(kernel, env?, opts?)`, `checkState(raw, upgrades?)`, `restoreState(kernel,
  raw, env?, source = 'host')`, `stateText`, `STATE_UPGRADES` (empty: v1 is the first), `STATE_VERSION`); `@dzgrid/dom/state`
  (`gridState({ debounce = 300, persist?: { key, include? } })` with `api(grid).state()` / `setState()`, `persistLocal(grid,
  key, { include? })`, `toSearchParams(state, { name = 'grid', include? })` → `{ params, problems }`, `fromSearchParams(params,
  { name, include? })` → `{ state, problems }`).
- The text is the core's `canonical` form: every object's keys sorted (so `v` is not first); the address's own version is
  its `1.` prefix.
- Restore order as rule 6, all under the server model's `hold(fn)`: one request (3 before the seam, measured). A state
  given at creation (`persist`): the server model is made held (`GridFeature.held` → `ModelEnv.held`) and its first
  request is the restored one.
- A part absent from the state is not applied (the grid keeps its own); a column field absent means its default (no user
  width, shown, unpinned); a wrong one keeps the grid's. Every column is named in the restore's patch (a state equal to the
  grid sends no request). A `movable: false` column keeps its place and side; a state placing it elsewhere gives
  `state-field` on its `order`.
- Sort items that are not sortable, doubled or with a bad `nulls` go to the model, which refuses them (`invalid-sort`).
- Density: checked by the DOM (`state-field` when not one of the three); the menu's line says `densityChanged`, which
  `stateChanged` follows; an application's `update({ density })` is the host's and says nothing.
- `stateChanged` compares with the last state told: a host change made before a gesture rides with that gesture's event.
- Groups: an adapter `{ collapsible, get, set }` (step 8 wires it); until then every named group is `state-group`.
- Problems never carry a value: `state-column` gives the id (not row data), `state-field` the path only; the 4 KB warning
  is `state-field` at the parameter's name, detail `too-large`.

## An initial state (step 16, `gridState({ initial })`)
`initial: { v: 1, …parts }` is applied at setup, before the first request: a server grid is asked once, with it (as
Angular's `[state]`; with another holder, it stays held until that one releases). With `persist`, the stored state
applies over it, still one request. `reset()` is unchanged (the definitions, not `initial`). The plain-DOM way to start
on a sort or a filter (sort.md « An initial sort », server-pagination.md).

## Reset (1.1.0, `api(grid).reset()`; Angular `DzgController.resetState()`)
- **Initial** is the grid as defined at creation, captured when the feature is set up, before any restore (the
  storage's with `persist`, the Angular wrapper's `[state]`): columns (order, widths, hidden, pins), sort, filters,
  search, page and page size (paged grid), density. Taken once: a later `setState`, `update({ density })` or
  `columns.set` does not move it.
- Groups: always `{}`, the definitions back (one fold).
- Applied as `setState` applies a state: under the model's hold, **one request** on a server; returns what was skipped.
  As the host's change, then told as a gesture: **one `stateChanged`** (source `'api'`) after the pause, none when nothing
  moved; **no `stateRestored`**. With Angular's `[state]="saved()" (stateChanged)="saved.set($event.state)"` the loop
  settles (the value received equals the grid's state: not restored back).
- Known limit: after the host's `columns.set`, a column of the initial state that is gone is skipped and told
  (`state-column`, as any restore); a column added since is left as it is (it goes after the named ones).

## Tests (to be written with the code)
Conformance `conformance/cases/grid-state/*` (capture → JSON → restore round trips, unknown version /
column / group / field, an older version upgraded, all-hidden refused, restore order, a planted row value
absent), `packages/core/test/state-property.test.ts` (RTL identity, 1 000 seeds),
`packages/dom/test/state.test.ts` (debounce, one event per gesture, none on restore, storage blocked, URL round
trip and tamper, filters and search absent from the address without `include`); server request count: one
for a restore, one at start with `persistLocal`; browser: save in fr LTR, reload in ar RTL, identical.
