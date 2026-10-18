# Step 7 owner decisions (2026-10-18), on top of the architect's blueprint

- Q1 (include selection on a server survives a filter change, may hold rows no longer shown): OWNER CHOSE an application option.
  Default: kept (the sheet's rule; count = keys.size). New DOM setting `selection.keepOnFilter?: boolean` (default true, live, part of the existing `selection` setting object).
  With `keepOnFilter: false`: a filter or quick-search change (source user, host or api — any change of the filter model or the quick text) clears an include selection (and an exclude one is already cleared by the scope rule), told with `reason: 'scope-changed'` and announced (`announce.selectionCleared`). Applies to every model (browser and server). A sort or page change never clears.
  Implement it in the kernel (not the DOM) so events stay ordered: a kernel option `createKernel({ ..., keepSelectionOnFilter })` plus a command `selection.keepOnFilter {keep: boolean}` the DOM dispatches at creation and on update when the setting changes — or an equivalent minimal design; justify the choice in the report. The clear happens in setQuery, before rows.setQuery, like dropStale (C3b order: selection drop, modelUpdated, filterChanged).
  Footer wording "N selected (some not shown)" is step 17 (not now).
- Q2 (paged client box replaces the selection with the page's keys): leave as is; decided with the pager UI at step 17. Record in ROADMAP.
- Q3 (allFiltered in the browser as exclude mode selects rows added later that match): accept and document in selection.md.
