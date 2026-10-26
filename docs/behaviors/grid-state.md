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
    column of the restored order shown; a `hideable: false` column is never hidden by a state; each case gives
    `state-field` (path `columns.<i>.hidden`).
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
    { name }) → GridState | null`: one parameter, a compact, stable, URL-safe text (`1.` + base64url of the
    JSON, O7), the version first. Same state → same text. A truncated or edited parameter: null and
    `state-version`.
19. **The address leaves typed filters and the search out by default** (O6): `filter` and `quick` are
    written only with `include: ['filter', 'quick']` (either or both). Read back, a parameter without them
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

## Tests (to be written with the code)
Conformance `conformance/cases/grid-state/*` (capture → JSON → restore round trips, unknown version /
column / group / field, an older version upgraded, all-hidden refused, restore order, a planted row value
absent), `packages/core/test/state-property.test.ts` (RTL identity, 1 000 seeds),
`packages/dom/test/state.test.ts` (debounce, one event per gesture, none on restore, storage blocked, URL round
trip and tamper, filters and search absent from the address without `include`); server request count: one
for a restore, one at start with `persistLocal`; browser: save in fr LTR, reload in ar RTL, identical.
