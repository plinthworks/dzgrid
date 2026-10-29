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

## Rows compared by value (step 16e, `sameRow`, forecast F:P3)
A full reload (`rows` given again, or a server's answer, which is always new objects) normally counts every row whose
**object** differs as updated, and more than half the rows updated is a reset: nothing flashes, nothing is « added ».
`GridSettings.sameRow?: (a, b) => boolean` (fixed; owner question Q16-7, answer A: the app turns it on; a default
for every grid would be one line in `grid.ts`) compares a row kept by id with its new copy:
1. In a `rows` replacement or a server answer, a row with the same id whose new copy `sameRow` calls equal is
   **unchanged**: it keeps its **previous object**, so every cache keyed by the object stays (the quick-search
   haystack, the selection rule's answers, the merged-cell memo, `rowClass`, the edit overlay's saved entries).
2. Only rows that really changed count as updated; added and removed as before. **The > 50 % rule stays**: more than
   half the rows really changed is a reset (a new data set, not a live change), and nothing flashes.
3. The flash then marks the cells whose text changed in the updated rows (motion.md « Value flash », unchanged).
4. A `sameRow` that throws: that row counts as changed; one `invalid-setting` warning per load (path `sameRow`,
   detail `threw`; never the row).
5. Cost: one call per row kept by id with a new object, O(rows × fields) with `sameValues`. Without the option: none.

`sameValues(a, b)` from the new entry `@dzgrid/core/compare` (nobody pays for it unused): plain data compared deeply —
objects by their own enumerable keys, arrays item by item, numbers with `Object.is` (`NaN` equals `NaN`; `0` and `-0`
differ), anything else (a `Date`, a `Map`, a class instance, a function) by identity. A version field compared by the
app (`(a, b) => a.version === b.version`) is cheaper when the server has one.

## Tests
`conformance/cases/row-key/*`, `conformance/cases/displayed-order/*`; rows compared by value:
`packages/core/test/store-same.test.ts`, `packages/core/test/compare.test.ts`, `packages/core/test/source-same.test.ts`,
`packages/dom/test/motion-same.test.ts`, `conformance/cases/transaction/same-*.json`.
