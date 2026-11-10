# Sheets: several tables in one grid, tabs at the bottom (1.10.0)

> **Parked (owner, 2026-11-10: too heavy).** Kept as a plan; nothing of it is built in 1.10.0.

Written before the code (CLEANROOM). Sources, as a checklist only: the public descriptions of spreadsheet applications'
sheet tabs (a row of tabs under the cells, « + » to add one, double-click to rename, drag to reorder), WAI-ARIA 1.2 and
the APG « Tabs » pattern (tablist, tab, tabpanel, roving tabindex, automatic activation), WCAG 2.2 (2.1.1 keyboard,
2.5.7 dragging movements, 4.1.3 status messages, 1.4.10 reflow), ECMA-376 / ISO 29500 (a workbook's sheets and the
rules Excel puts on their names). Owner answers 2026-11-10 (« ★ partout », the multisheet, items 1–8). Plan, measure
and open questions: `docs/phase-12-steps/sheets-plan.md`. **Not coded yet**: the questions Q-S1…Q-S4 of the plan
decide the API's shape; the behaviours below hold whatever the answers.

## What the user does
Sees one table and, under it, a row of tabs — one per sheet, the active one marked. Clicks a tab (or moves to it with
the arrow keys) to see that sheet. Where the application allows it: « + » adds a sheet, a double-click or F2 renames
one, Delete removes one, a drag or Alt+Shift+arrow moves one; a right-click on a tab offers the same.

## What the application does
Gives `sheets: [{ id, title, columns, rows | source, … }]` and, if it wants, the active sheet; receives the user's
switch and the add / rename / delete / move **requests**, and answers them by giving `sheets` (and the active sheet)
again. The grid never adds, renames, deletes or moves a sheet by itself.

## Behaviours (numbered, each one a test)
1. **Each sheet is a whole DzGrid table**: its own columns, rows (or server source), sort, filters, search, selection,
   editing, ranges, undo, export. Nothing of one sheet is seen or changed from another (an undo after a switch undoes
   the active sheet's last edit, never another's). No free cells, no A/B/C letters, no formulas.
2. **One sheet shown at a time.** Under it, the tab list in the sheets' order; the active tab marked by more than colour
   (a top bar and the bold weight, contrast 3:1 for the bar against the tab row).
3. **Switching** by a click on a tab, or by the keyboard on the tab list (8). The sheet shown changes at once; the
   application is told (`sheetActivated`, source `user`; Angular's `activeSheet` model written back). A switch by the
   application (`activeSheet` given) is not told back (no echo).
4. **Each sheet keeps its place.** Going back to a sheet finds its sort, filters, search, column layout, scroll
   position, selection, focus cell and open rows as they were left — nothing is recomputed (each sheet keeps its grid;
   plan « Measure »).
5. **Lazy.** A sheet's table is made at the first opening of its tab, not before. A sheet with a server source sends its
   first request then; left before the answer, that request is aborted (the next opening asks again).
6. **The application owns the list (live).** A new `sheets` array is compared by `id`: a new id adds a tab (its table
   made when opened); a missing id removes its tab and its table; the same id with changed settings updates that table
   live (as `update(patch)`: rows, columns, every live setting; a fixed setting changed is `unsupported-live-change`);
   a new order reorders the tabs; a new `title` renames the tab.
7. **The active sheet removed** by the application: the next sheet becomes active (the previous one if it was the last),
   told (`sheetActivated`, source `data`); no sheet left: an empty area under an empty tab list, the « + » still there
   when allowed. A duplicate or missing `id`: that sheet ignored, `sheets-id` (path `sheets[i].id`, detail `duplicate` /
   `missing`); an unknown `activeSheet`: the first sheet, `sheets-active` (warning). Never thrown; never row data.
8. **Keyboard on the tab list** (APG tabs, automatic activation: a switch costs about 1 ms once a sheet is open): one tab
   in the page's Tab order (the active one); ←/→ move to the previous / next tab *in reading order* (mirrored in
   Arabic), wrapping; Home / End to the first / last; each move activates. Tab leaves the list into the active table;
   Shift+Tab from the table's first stop comes back to it. The table, the panel, says which tab names it.
9. **Screen readers**: `role="tablist"` (named « Sheets », translated), each tab `role="tab"` with `aria-selected`,
   `aria-controls` its panel; the active table's wrapper `role="tabpanel"` `aria-labelledby` its tab. A switch is heard
   through the tab's own name and state (no extra announcement); a request done by the application (a tab added,
   renamed, removed, moved) is said once politely (`sheets.added`, `…renamed`, `…removed`, `…moved`).
10. **Requests, offered only when the application lists them** (`requests: ['add', 'rename', 'delete', 'move']`, default
    none: tabs only switch). Each goes out as an event and changes nothing on screen until the application gives the
    new `sheets`:
    - **add**: a « + » button after the last tab (named « Add a sheet ») → `sheetAdd { after: activeId | null }`;
    - **rename**: double-click a tab, or F2 on it → the title becomes an input in the tab (its text selected); Enter
      sends `sheetRename { id, title }` (trimmed; empty or unchanged: nothing sent), Escape or leaving it cancels; the
      tab shows the old title until the application renames it;
    - **delete**: Delete on a focused tab → `sheetDelete { id }` (the application asks for confirmation if it wants);
    - **move**: dragging a tab along the list (a mark between tabs shows where), or Alt+Shift+←/→ (one place, in reading
      order) and Alt+Shift+Home/End (first / last) on a focused tab → `sheetMove { id, to }` (`to`: the index in
      `sheets` after the move). The focus follows the tab once moved;
    - the same four from a small menu on the tab: right-click, Shift+F10 or the context-menu key; Escape closes it and
      gives the focus back to the tab.
11. **Narrow screens**: the tab list scrolls along the inline axis (no wrapping, no page scroll), the active tab brought
    into view on each switch and on each focus move; « + » stays visible at the end. Tabs are at least 24 × 24 px
    (WCAG 2.5.8) at every density.
12. **Right to left**: the tabs run from the right; arrows follow reading order; the insertion mark of a drag and the
    menu sit on the logical sides (`inline-start` / `inline-end`), no `left` / `right` outside the direction module.
13. **State of every sheet** (with `gridState()` on the sheets): `state()` gives `{ v: 1, active, sheets: { [id]: GridState } }`
    — each opened sheet's state, and the restored-but-not-yet-opened state of the others; `setState(s)` restores it (a
    sheet not opened yet gets its part at its first opening, a server asked once); unknown ids skipped (`state-sheet`,
    warning). Like `GridState`, never row data, and never the selection or the scroll (kept in memory only, 4).
    `stateChanged` for any sheet comes out with the sheet's id.
14. **Excel export of the workbook**: one `.xlsx`, one worksheet per sheet, in the tabs' order, each written as that
    sheet's « all » export (its visible columns, its sort and filters, typed values, its widths, frozen header and
    pinned columns, right to left in Arabic). Names: the sheet's title made legal for Excel — characters `[ ] : * ? / \`
    and control characters removed, no `'` at either end, at most 31 characters (a surrogate pair never split), empty
    → `Sheet<n>`; two names equal without case get ` (2)`, ` (3)` (shortened to stay ≤ 31). A changed name is a warning
    `xlsx-sheet-name` (path `sheets[i].title`, detail `chars` / `length` / `duplicate` / `empty`), never the title
    itself. A sheet never opened is written from its rows with its definition's order (no sort, no filter).
15. **CSV and JSON export, and print: the active sheet** (a CSV holds one table; a JSON of all sheets would be a new file
    shape no reader expects). The workbook is Excel only.
16. **Excel import of a workbook**: every worksheet is read; each is matched to a sheet by name (the folding of
    `file-import.md` 7 on the sanitised titles of 14, so a file this grid wrote comes back to the same sheets), and its
    rows read with *that* sheet's columns (`file-import.md` 7–10). The application gets one call per file:
    `onSheets([{ sheet: id | null, name, rows, problems }], file)`. A worksheet matching no sheet: `sheet: null`, no rows,
    `import-sheet` (path `sheets[i]`, detail `unmatched`) — the application may add a sheet for it. A CSV file goes to
    the active sheet. The grid never changes rows or sheets by itself.
17. **Opt-in**: an application that does not use sheets loads nothing of it — its own entry, texts `-sheets`, CSS
    `sheets.css`; the grid's base, the theme's base and the Angular grid component are unchanged.

## Where DzGrid differs on purpose
- No sheet is added, renamed, removed or moved by the grid itself: requests only (owner, item 3).
- No formulas, no references from one sheet to another, no free cells (owner, items 1 and 7).
- The workbook export writes every sheet; CSV, JSON and print stay one table (15).

## Tests (planned)
`packages/core/test/xlsx-book.test.ts` (names made legal and unique, one worksheet per sheet, shared strings and styles
once, problems without titles), `packages/core/test/import-book.test.ts` (every worksheet, matching by name),
`packages/dom/test/sheets-*.test.ts` (lazy making, live list by id, removed active sheet, kept place, keyboard, ARIA,
requests, rename input, menu, abort on leave, state of every sheet, workbook export and re-import), Angular and element
specs, browser `scripts/browser-sheets.mjs` (Chrome fr / ar with axe, Firefox and WebKit once, an exported workbook
re-imported).
