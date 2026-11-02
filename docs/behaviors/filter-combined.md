# Several conditions on one column (the combined filter in the popup)

Phase 9, step F1 (`docs/phase-9-steps/filters-plan.md` §1; owner Q-F2 A, 2026-11-02). Written before the code.

## What the user does
Opens a column's filter popup, types a first condition, presses « + Add condition », types a second one, chooses
« All (AND) » or « Any (OR) », ticks « Match case » on a text row, removes a row; reads the floating row.

## What they observe
- Under the last condition, a button adds a row: an operator and its value fields, the same as the first.
- From the second row on, one AND/OR choice sits above the second row and joins every row.
- Every row after the first has a « Remove » button.
- The rows filter together; the floating row says « 2 conditions ».

## What DzGrid does
- **Off by default** (owner Q-F2 A): with no option the popup is today's, element for element, one condition, no
  button, no checkbox. `filters({ maxConditions: n })` for the grid, `filter.maxConditions` on a column (the column
  wins), an integer 1 to 5. A grid value outside is the default (1), told once at setup (`invalid-setting`,
  `features.filters.maxConditions`); a column value outside is ignored (the grid's applies), told each time its popup
  opens (`invalid-column`, `columns.<id>.filter.maxConditions`). Five is a cap of the popup only: the model and the wire keep none.
- **Kinds:** text, number, day, instant (the condition forms). Boolean and the value list keep one form (a value list
  takes a condition above it: `filter-multi.md`).
- **The rows.** « + Add condition » (`filter.conditionAdd`) under the last row, shown while there are fewer rows than
  the cap. Each row after the first carries « Remove » (`filter.conditionRemove {n}` as its name, `n` its place).
  The first row cannot be removed (Clear empties it).
- **The join.** A radio pair in a `radiogroup` named `filter.joinLabel`: « All (AND) » (`filter.joinAnd`) and « Any
  (OR) » (`filter.joinOr`), AND chosen first, shown only with two rows or more, placed before the second row. One
  join for the whole popup: the popup edits a **flat** combined filter. A change of join is a choice: applied at once
  in the browser, kept in the draft on a server or with `apply: 'button'`.
- **What is stored.** Each row is read as today's single form reads (lead decision L1 per row): a row that cannot
  filter yet (an empty value, between with one bound) is left out; a value that does not read keeps the whole draft
  from applying (marked, said once, focused at Apply). No live row: no filter. One live row: that condition, **plain**
  (not wrapped), so a grid using one row sends today's filter. Two or more: `{type: 'combined', join, conditions}`
  in the rows' order.
- **What it shows.** A combined filter set elsewhere is shown when it is flat (no member combined), of the column's
  kind, every member one the row form can show, and no longer than the cap; the join is shown as stored. Anything else
  (nested, mixed kinds, a set inside, more rows than allowed) shows « Filter active » and Clear (today's summary).
- **Focus.** After adding: the new row's operator, or its value when the column offers one operator (the operator is
  then hidden). After removing: the value of the row before (its operator when it has no value field). At the cap
  the add button is hidden; removing a row shows it again.
- **Announcements:** once per action, `filter.conditionAdded {n}` and `filter.conditionRemoved {n}` (polite).
- **Match case** (owner Q-F2 A): with `filters({ matchCase: true })` or `filter.matchCase: true`, each text row carries
  a checkbox « Match case » (`filter.matchCase`), written to that row's `caseSensitive` (`true` only; unticked, the
  field is absent). Without the option the checkbox is not there and a stored `caseSensitive` is kept as today. It
  works with one row too.
- **Keyboard.** Native controls in reading order; Tab and Shift+Tab move through them; the join is one Tab stop
  (arrows inside, as every radio group); Enter in a field applies (today's rule); Escape closes.
- **RTL.** Logical order only: the rows, the join pair and the buttons follow the reading direction; the add button
  sits at the row's start. Values follow their own direction (`dir="auto"`).
- **Floating row.** A flat combined filter of condition rows shows `filter.summaryConditions {n}` (« 2 conditions »,
  the bundle's plural rules: Arabic 2, 3 and 11 take three different forms), still a button opening the popup, Clear
  beside it. A combined holding a value list says « Filter active » (`filter-multi.md`). A host bundle without the new
  texts keeps « Filter active ».
- **Texts.** In `locales/<lang>-filters`. The new keys are not required by `filters()` (a host's own bundle keeps
  working); a grid or a column asking for several conditions, match case or a condition over a list makes them
  required, and `filters()` throws naming the missing ones (today's rule for its keys).
- **Server.** Nothing new on the wire: `{type: 'combined', join, conditions: [...]}` as today; one request at Apply.

## The owner's translator (his `to-query.ts`, ag-like `filterModelRequest`)
A flat combined of one kind becomes
```
{ filterType: 'text' | 'number' | 'date', operator: 'AND' | 'OR',
  conditions: [ { filterType, type, filter, filterTo? }, … ] }
```
operators renamed as his backend expects (`lt` → `lessThan`, `between` → `inRange`…). His backend reads `operator` and
`conditions` first; until then the app keeps `maxConditions` at 1 on server columns (an untranslated filter is
dropped with a warning, which would show more rows than asked).

## Tests
`packages/dom/test/filters-conditions.test.ts`, `filters-match-case.test.ts`; conformance
`filter-combined/ui-three-or-rows.json`, `ui-case-sensitive-in-or.json`, `ui-number-between-in-and.json`; RTL in
`scripts/browser.mjs` (Arabic page).
