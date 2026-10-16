# Selecting rows

## What the user does
Clicks a row; Ctrl- or Cmd-clicks; Shift-clicks; presses Space on a row; presses Ctrl+A (Cmd+A on a Mac); ticks the header box.

## What they observe
- A click selects one row, Ctrl/Cmd toggles, Shift selects a range in the order on screen.
- Space toggles the focused row; Ctrl+A selects all.
- The header box selects all the rows displayed after the filters, and shows ticked, unticked or partly ticked.
- The selection survives sorting and filtering.

## What DzGrid does
- Selection is by row id, never by position.
- In the client model, *select all* selects the displayed rows (D8): rows hidden by a filter are not selected.
- For server models (Phase 3) *select all* is stored as *everything except these*, so it costs nothing at ten million rows.
- Screen readers read the state on the row (`aria-selected`); the row checkbox is decorative.
- A Shift range whose anchor is no longer displayed is cancelled, never reinterpreted on other rows.

## Tests
`conformance/cases/selection/*`.
