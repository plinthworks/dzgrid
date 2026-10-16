# Clean room

DzGrid is written from scratch. It reproduces what a person **sees and does**
with a data grid such as ag-Grid — never how ag-Grid does it.

## Allowed

- ag-Grid's public documentation and live demos, to learn observable
  behaviour: what a click, a drag, a key, a sort or a filter produces.
- Public issue *reports*, for the bug they describe (the symptom), cited by
  number in tests (`refs: ["AGG#1234"]`).
- Standards: WAI-ARIA (grid and treegrid patterns), WCAG, Intl, Temporal,
  RFC 4180 (CSV), the clipboard formats spreadsheets exchange.
- Our own code: tzslot, DzCalendar, and the pure modules of ngx-sheetgrid
  (cell ranges, fill handle, edit buffer, value parsing, rules), which contain
  no ag-Grid code.

## Not allowed

- Reading, copying or translating ag-Grid's source code — Community (MIT) as
  well as Enterprise — its internal types, tests, CSS, themes or build setup;
  nor that of any other grid library, commercial or not.
- Decompiling or reverse-engineering minified bundles of any grid library.
- Pasting their documentation text into ours.
- Reusing the parts of ngx-sheetgrid that talk to ag-Grid (`data-grid.ts`,
  the column mapper, the renderers' ag-Grid interfaces).

## How a behaviour is borrowed

Each imitated behaviour gets a sheet in `docs/behaviors/<name>.md`, in our own
words: what the user does, what they observe, what DzGrid does instead where
we differ on purpose (right-to-left, keyboard, accessibility, time zones).
The sheet is written before the code, and the code's tests point to it.

This applies to every contributor, human or agent.
