# DzGrid feature inventory (public documentation, own words)

## How to read the tables

- **Grids:** AG = ag-Grid, MUI = MUI X Data Grid, TS = TanStack Table (headless), TB = Tabulator, HT = Handsontable, KD = Kendo UI for Angular, DX = DevExtreme.
- **Marks:**
  - ✓ = built in;
  - € = paid tier only;
  - ~ = logic or a hook only, the host builds the UI;
  - – = not offered, or not found.
- **DzGrid status:**
  - **have** = done in Phase 1 or 2;
  - **P3** = this phase;
  - **P4–P10** = a later phase, from ARCHITECTURE §6;
  - **out** = out of scope for v1.
- **Priority for the Sehhaty admin screens:**
  - **M** = must, needed for audit-logs or the directories;
  - **S** = should;
  - **C** = could;
  - **W** = won't for now.

## A1. Row models and data sources

Sources: [ag row models](https://www.ag-grid.com/javascript-data-grid/row-models/), [MUI server-side data](https://mui.com/x/react-data-grid/server-side-data/), [DevExtreme remote operations](https://js.devexpress.com/DevExtreme/ApiReference/UI_Components/dxDataGrid/Configuration/remoteOperations), [DX large datasets](https://js.devexpress.com/DevExtreme/Guide/UI_Components/DataGrid/Enhance_Performance_on_Large_Datasets/), [Tabulator pages](https://tabulator.info/docs/6.3/page).

| Feature | What the user sees | AG | MUI | TS | TB | HT | KD | DX | DzGrid | Prio |
|---|---|---|---|---|---|---|---|---|---|---|
| Rows in memory | Sort, filter and search are instant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | have | M |
| Each operation placed client or server on its own | The server filters and sorts, the browser pages (or the reverse) | ~ | ✓ | ✓ | ✓ | ~ | ~ | ✓ | P3 | M |
| Paged server model | One page fetched per gesture | ✓ | ✓ | ~ | ✓ | – | ✓ | ✓ | P3 | M |
| Previous rows kept while loading | No blank flash; a busy state is shown | ✓ | ✓ | ~ | – | – | ~ | ✓ | P3 | M |
| Load error with retry | A message with a "retry" button | ~ | ✓ | ~ | ~ | – | ~ | ✓ | P3 | M |
| Host parameters outside columns | A tenant or role filter with no column | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | P3 | M |
| Latest request wins | Fast clicks never show a stale page | ✓ | ✓ | ~ | ? | – | ~ | ✓ | P3 | M |
| Refresh the current view | Data refetched in place | ✓ | ✓ | ~ | ✓ | – | ✓ | ✓ | P3 | S |
| Response cache and revisit | Going back a page costs no request | ✓ | ✓ | ~ | – | – | – | ✓ | P7 | C |
| Periodic refresh (polling) | The list updates by itself | ~ | ✓ | ~ | – | – | – | ~ | P7 | C |
| Infinite scroll by blocks | Scrolling loads more rows | ✓ | € | ~ | ✓ | – | ✓ | ✓ | P7 | C |
| Server-side groups and tree (lazy) | Expanding a group fetches it | € | € | ~ | – | – | ~ | ✓ | P7 | W |
| Server pushes the visible window | Live ticking rows | € | – | – | – | – | – | – | out | W |
| Row transactions (add, update, remove by id) | One row changes, the others stay put | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | have | S |

## A2. Sorting

Sources: [ag sorting](https://www.ag-grid.com/javascript-data-grid/row-sorting/), DX remote operations (above).

| Feature | What the user sees | AG | MUI | TS | TB | HT | KD | DX | DzGrid | Prio |
|---|---|---|---|---|---|---|---|---|---|---|
| Header click cycles ascending, descending, none | One click sorts | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | have | M |
| Multi-column sort (modifier click) | Several sort keys, numbered | ✓ | € | ~ | ✓ | ✓ | ✓ | ✓ | have | S |
| Locale collation and accents | `é` sorts next to `e`; Arabic is correct | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | have | M |
| Custom comparator per column | A column sorts by meaning | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | have (custom codec `compare`) | C |
| Blanks placement | Empty values first or last | ~ | ~ | ✓ | ~ | ~ | ~ | ~ | have | S |
| Sorting on the server | The order applies to the whole result | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | ✓ | P3 | M |
| Per-column "server can sort" | Columns the API cannot sort show no sort action | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | P3 (`sortable: false`) | M |
| Post-sort hook, absolute sort | Pinned-to-top items; sort by magnitude | ✓ | – | ~ | – | – | – | – | later (P5) | W |
| Sort announced to screen readers | "Sorted by date, descending" | ? | ? | – | – | – | ? | ? | have | M |

## A3. Filtering

Sources: [ag filtering](https://www.ag-grid.com/javascript-data-grid/filtering/), [ag floating filters](https://www.ag-grid.com/javascript-data-grid/floating-filters/), [ag set filter](https://www.ag-grid.com/javascript-data-grid/filter-set/), [MUI filtering](https://mui.com/x/react-data-grid/filtering/), [Tabulator filter](https://tabulator.info/docs/6.3/filter), [Handsontable column filter](https://handsontable.com/docs/javascript-data-grid/column-filter/), [Kendo filtering](https://www.telerik.com/kendo-angular-ui/components/grid/filtering), [Syncfusion filtering](https://ej2.syncfusion.com/angular/documentation/grid/filtering/filtering).

| Feature | What the user sees | AG | MUI | TS | TB | HT | KD | DX | DzGrid | Prio |
|---|---|---|---|---|---|---|---|---|---|---|
| Text filter (contains, starts, ends, equals, blank) | Type a word, the rows narrow | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | have core, P3 UI | M |
| Number filter (compare, between, blank) | "> 100", "between 5 and 9" | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | have core, P3 UI | M |
| Day filter (on, before, after, between) | Calendar picker | ✓ | ✓ | ~ | ~ | ✓ | ✓ | ✓ | have core, P3 UI | M |
| Instant filter in the display time zone | "On 5 March" includes 23:59 local | ~ | ~ | ~ | ~ | ~ | ~ | ~ | have core, P3 UI | M |
| Relative date presets (today, yesterday, last N days) | One-click ranges | – | – | – | – | ✓ | – | ✓ | P5 | S |
| Boolean filter | All / yes / no | ✓ | ✓ | ~ | ✓ | ~ | ✓ | ✓ | have core, P3 UI | M |
| Value list (set) with search, select all, blanks | An Excel-like checklist | € | ~ | ~ | ~ | ✓ | ~ | ✓ | have core, P3 UI | M |
| Value list with counts per value | "Login (1 204)" | – | – | ~ | – | – | – | – | P3 (client) | S |
| Value list fetched from the server | The checklist loads distinct values from the API | € | – | ~ | – | – | ~ | ✓ | P3 | M |
| Value list shows labels, matches on codes | Survives a language change | ✓ | ✓ | ~ | – | – | – | ✓ | have | M |
| Two conditions with AND/OR on one column | "contains A or contains B" | ✓ | € | ~ | – | ✓ | ✓ | ✓ | have core, P3 UI (cut 4) | S |
| Two filter kinds in one column (e.g. text and list) | Tabs inside one popup | € | – | – | – | ✓ | – | – | P8 | C |
| Popup filter from a header button | A button opens the column's filter | ✓ | ✓ | ~ | – | ✓ | ✓ | ✓ | P3 | M |
| Floating filter row, editable for text and number | A search box under each header | ✓ | € | ~ | ✓ | – | ✓ | ✓ | P3 | M |
| Floating filter as a read-only summary (list, date range) | "3 selected"; a click opens the popup | ✓ | – | – | – | – | ~ | ~ | P3 | S |
| Live apply with debounce, or an Apply button | Typing filters; a list waits for Apply | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | P3 | M |
| Active-filter mark on the header | A visible dot plus an announced state | ✓ | ✓ | ~ | – | ✓ | ✓ | ✓ | P3 | M |
| Clear one, clear all | Reset buttons | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | P3 | M |
| Quick or global search | One box searches every visible column | ✓ | ✓ | ✓ | ~ | ✓ | ~ | ✓ | have core, P3 box | M |
| Search ignores accents and folds Arabic | `ecole` finds `école`; Arabic variants folded | ~ | ✓ | ~ | – | – | ? | ? | have | M |
| Quick search on the server | The box text goes to the API | ✓ | ✓ | ✓ | ~ | – | ~ | ✓ | P3 | M |
| External filter (host predicate) | A toggle outside the grid narrows the rows | ✓ | ~ | ✓ | ✓ | ~ | ✓ | ✓ | P3 (custom kind or `params`) | S |
| Filter on a hidden column | A filter on a column that is not shown | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | ✓ | P3 (D4a) | M |
| Advanced expression filter across columns (builder) | A tree of AND/OR rules | € | € | ~ | – | – | ✓ | ✓ | P8 | C |
| Custom filter kind (own UI and logic) | A slider, a geographic picker… | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | ✓ | P3 | S |
| Custom floating filter | Its own control in the header row | ✓ | € | ~ | ✓ | – | ✓ | ✓ | P3 | C |
| Regex, wildcard or LIKE match | `a*b` patterns | – | – | ~ | ✓ | – | – | – | out | W |
| Case-sensitive option | Matches respect case | ✓ | – | ~ | – | – | ✓ | ✓ | have core | C |
| Filters sent to the server | The same model goes to the API, with typed bounds | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | ✓ | P3 | M |
| Filter model get/set (URL, saved views) | The filter returns after a reload | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | have model, P3 API | S |
| Filter fixed by the host, visible but locked | "Tenant = X", not editable | ~ | ✓ | ~ | – | – | ~ | ~ | P5 | C |
| Filters tool panel (all filters in a side pane) | One pane for every filter | € | ✓ | – | – | – | – | ✓ | P5 | C |

## A4. Pagination

Sources: [ag pagination](https://www.ag-grid.com/javascript-data-grid/row-pagination/), [ag server-side paging](https://www.ag-grid.com/javascript-data-grid/server-side-model-pagination/), [Tabulator pages](https://tabulator.info/docs/6.3/page), MUI server-side data (above).

| Feature | What the user sees | AG | MUI | TS | TB | HT | KD | DX | DzGrid | Prio |
|---|---|---|---|---|---|---|---|---|---|---|
| Client paging of rows in memory | Pages over a loaded list | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | P3 | S |
| Server paging | One request per page | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | P3 | M |
| Page-size selector | 25 / 50 / 100 | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | P3 | M |
| Range text "51–100 of 1 234" | Where am I | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | P3 | M |
| First, previous, next, last | Arrow buttons | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | P3 | M |
| Unknown total ("51–100 of many"), "last" disabled | Works without a count | ✓ | ✓ | ~ | ~ | – | ~ | ~ | P3 | M |
| Cursor or keyset paging | Next and previous only, no jump | ~ | ~ | ~ | – | – | – | – | P3 (cut 2) | S |
| Page number input, numbered buttons | Jump to page 7 | ✓ | ~ | ~ | ✓ | ✓ | ✓ | ✓ | P5 | C |
| Automatic page size from height | The page fills the viewport | ✓ | ✓ | – | ✓ | – | – | – | P5 | C |
| Back to page 1 on a filter or sort change | Never an empty page 9 | ✓ | ✓ | ~ | ✓ | – | ✓ | ✓ | P3 | M |
| Page past the end clamps to the last page | After rows were deleted | ✓ | ? | ~ | ? | – | ? | ? | P3 | S |
| Page change announced, focus kept | Screen reader says "page 3" | ? | ? | – | – | – | ? | ? | P3 | M |

## A5. Renderers and surrounding UI

Sources: [ag components](https://www.ag-grid.com/javascript-data-grid/components/), MUI filtering and server-side data (above), Kendo filtering (templates), Tabulator filter (header editors).

| Feature | What the user sees | AG | MUI | TS | TB | HT | KD | DX | DzGrid | Prio |
|---|---|---|---|---|---|---|---|---|---|---|
| Value formatter (value to text) | `1 234,5 DA`, "2 days ago" | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | have (codec), P3 `format` | M |
| Custom cell renderer | Any DOM in a cell | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | P3 | M |
| Framework templates in cells (Angular) | `<ng-template>` per column | ✓ | n/a | ✓ | – | ✓ | ✓ | ✓ | P3 | M |
| Ready-made cells: status badge, boolean icon, link | Common looks without code | ~ | ✓ | – | ✓ | ✓ | ~ | ✓ | P3 (badge, boolean); P5 others | S |
| Progress bar, rating, avatar, sparkline | Richer cells | ~ | ~ | – | ✓ | – | – | ~ | P5 | C |
| Action buttons in a cell, keyboard reachable | "View", "Revoke" | ~ | ✓ | ~ | ✓ | ~ | ✓ | ✓ | P3 (contract), P5 (part) | S |
| Cell and row class rules | Tone by value, through classes | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | have (rules), P3 via part | S |
| Safe by default (text, never HTML) | No injection | ~ | ✓ | ✓ | ~ | ~ | ✓ | ✓ | have | M |
| Custom header component | Own header layout or icon | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | P3 (slot), default kept | C |
| Header groups (multi-level) | Spanning headers | ✓ | € | ✓ | ✓ | ✓ | ✓ | ✓ | P5 | C |
| Group row and full-width row renderers | Group labels, detail rows | € | € | ~ | ✓ | – | ✓ | ✓ | P6 | W |
| Loading placeholder cells (block models) | Grey bars while a block loads | ✓ | ✓ | ~ | – | – | – | ✓ | P7 | W |
| Custom tooltip | Rich hover or focus content | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | have (text), P3 slot | C |
| Overlays: loading, no rows, no match, error | A centred message | ✓ | ✓ | ~ | ✓ | ~ | ✓ | ✓ | have (built-in), P3 slot | M |
| Status bar (row count, selected count) | "1 204 rows · 3 selected" | € | ✓ | ~ | ~ | – | ~ | ✓ | P3 (count, selected) | S |
| Status bar aggregates of a range | Sum and average of the selection | € | – | – | – | – | – | ✓ | P8 | W |
| Tool panels (columns, filters) | A side drawer | € | ✓ | – | – | – | ~ | ✓ | P5 | C |
| Toolbar (export, search, density) | A bar above the grid | – | ✓ | – | – | – | ✓ | ✓ | host-built, P5 kit | C |
| Pluggable date picker inside the date filter | Your company's picker | ✓ | ✓ | ~ | ✓ | – | ✓ | ✓ | P3 (adapter) | S |

## A6. Editors (Phase 4, listed only)

| Feature | AG | MUI | TS | TB | HT | KD | DX | DzGrid |
|---|---|---|---|---|---|---|---|---|
| Text, number, date, checkbox and list editors | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | P4 |
| Rich list editor with search | € | ~ | ~ | ✓ | ✓ | ✓ | ✓ | P4 |
| Custom editor (same part contract, slot `editor`) | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | P4 |
| Full-row editing, popup editor | ✓ | ✓ | ~ | – | – | ✓ | ✓ | P4 |
| Validation message, accessible | ~ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | P4 |
| Undo and redo, paste, fill handle | € | € | – | ✓ | ✓ | – | ~ | P4 |

## A7. Column menu

Source: [ag components](https://www.ag-grid.com/javascript-data-grid/components/) (menu items); the others from their docs indexes [À VÉRIFIER].

| Feature | What the user sees | AG | MUI | KD | DX | DzGrid | Prio |
|---|---|---|---|---|---|---|---|
| Menu from the header (button, Alt+ArrowDown) | One place for column actions | ✓ | ✓ | ✓ | ✓ | P3 (filter entry only), P5 full | S |
| Pin, hide, autosize, reset | Column chores | € | ✓ | ✓ | ✓ | P5 | C |
| Sort entries in the menu | Sort without clicking the title | ✓ | ✓ | ✓ | ✓ | P5 | C |
| Choose columns | A checklist of columns | € | ✓ | ✓ | ✓ | P5 | S |
| Custom menu items | Host-defined actions | € | ✓ | ✓ | ✓ | P5 | C |
| Cell context menu | Right-click or Shift+F10 | € | – | ~ | ✓ | P8 | W |

## A8. Export

Sources: [ag CSV export](https://www.ag-grid.com/javascript-data-grid/csv-export/), DX large datasets (above).

| Feature | What the user sees | AG | MUI | TB | HT | KD | DX | DzGrid | Prio |
|---|---|---|---|---|---|---|---|---|---|
| CSV of the filtered and sorted rows | Download a file | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | P3 | M |
| CSV of the selected rows | Download only the ticked rows | ✓ | ✓ | ✓ | ~ | ~ | ✓ | P3 | S |
| Locale separator, BOM, decimal mark that Excel reads | Opens correctly in a French Excel | ~ | ~ | ~ | ~ | ~ | ~ | P3 | M |
| Formula-injection guard | `=cmd` is not executed when opened | ~ | ✓ | – | – | – | ~ | P3 | M |
| Instants as local wall time with the zone named | Excel shows Algiers time | – | – | – | – | – | – | P3 | M |
| "Export everything" through the server | 10⁷ rows never go through the browser | ~ | ~ | ~ | – | ~ | ~ | P3 | M |
| The host can refuse and log an export | Audit trail of exports | ~ | – | – | – | ~ | ✓ | P3 | M |
| Excel (XLSX) | A real spreadsheet | € | € | ✓ | ✓ | ✓ | ✓ | P8 | S |
| Print, PDF | A printable view | – | ✓ | ✓ | – | ✓ | ✓ | P10 / out | W |

That is about 110 rows. **What Phase 3 must deliver for audit-logs** is every row marked M with status P3.

---

