# Selecting rows

## What the user does
Clicks a row; Ctrl- or Cmd-clicks; Shift-clicks; ticks the header box.

## What they observe
- A click selects one row, Ctrl/Cmd toggles, Shift selects a range in the order on screen, the header box selects all.
- The selection survives sorting and filtering.

## What DzGrid does
- Selection is by row id, never by position.
- *Select all* is stored as *everything except these*, so it costs nothing at ten million rows.
- A Shift range whose anchor is no longer displayed is cancelled, never reinterpreted on other rows.

## Tests
`conformance/cases/selection/*`.
