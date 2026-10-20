# Cell classes from the data

## What the user does
Reads a grid where some cells stand out by their value: a negative balance, an overdue date, a result out of range.

## What they observe
The cells the application's rule names carry its class (its stylesheet colours or marks them); when the value changes, or a recycled cell shows another row, the class follows at once.

## What DzGrid does
- **The rule**: `columns[].ui.cellClass(ctx) => string | null`, in the base (no feature needed). `ctx`: `{ value, text, row, key, column, context }` — the coerced value, its displayed text, the row, its key, the column's id, `settings.context`. It returns space-separated class names, or null for none.
- **When it is asked**: when a cell is bound to a row again (another row, new data, new columns, language or context); never on a paint that changes nothing for the cell, nor on a scroll for a row already shown. Cells drawn by a part get it too.
- **Diffed**: only the tokens the rule gave are added or removed; the grid's own classes (`dzg-cell`, `dzg-flash`, a later `dzg-cell--saving`) and other classes stay. Tokens starting with `dzg-` are ignored (the grid's).
- **A rule that throws**: the error is reported (`reportError`), the cell's rule classes are removed; the grid goes on.
- **Never a layout write**: the rule's classes change nothing the grid writes inline (sizes, offsets).

## Where DzGrid differs on purpose
- One function returning class names, rather than a map of class to predicate: the same thing, smaller, and the application keeps its own logic.

## Tests
`packages/dom/test/cell-class.test.ts`.
