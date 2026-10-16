# Rows, their identity, and updates

## What the user does
The host gives rows with an id, then adds, updates and removes some, or sends the whole list again from a feed.

## What they observe
- The grid updates without losing the selection or the scroll position.

## What DzGrid does
- The id is required (`getRowId`), never guessed from the first row.
- A second row with an id already seen is refused with a problem; the first one stays. `1` and `'1'` are one id.
- Inside one transaction: removals, then updates, then additions. One transaction is one version and one notification.
- The host's row objects are never modified.

## Tests
`conformance/cases/row-key/*`, `conformance/cases/displayed-order/*`.
