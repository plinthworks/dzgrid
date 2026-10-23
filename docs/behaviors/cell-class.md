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

## The other hooks (showcase themes step 6, owner T5)
Where a framework's utilities (Tailwind, Bootstrap; `docs/theme-in-3-lines.md`) meet the grid, the same
contract (space-separated names, diffed, `dzg-` tokens ignored, a throw reported and its classes cleared):
- **`settings.rowClass(ctx)`**, `ctx` `{ row, key, context }`: classes for a data row (the `.dzg-row`
  element), asked when the row is bound again (another row, new data, new columns, language, context, or a
  new rule given by `update`), never on a paint that changes nothing for it. None on a tree's filler or a
  detail row. Live. The row's pinned parts paint their own surface: to colour a whole row, a class sets
  `--tz-bg` on it (Tailwind `[--tz-bg:var(--color-amber-50)]`), and the pinned parts and the hover tint
  follow. Keep the same function from one update to the next: a new one (an inline arrow in a
  re-rendered template) binds every row again. Angular: `<dz-grid [rowClass]>` (owner T8).
- **`columns[].ui.headerClass`**: a fixed string for the column's header cell (the main header row; not a
  group cell, not a feature's extra row). Follows a new `columns`.
- **`badge({ classes })`**: a class per tone (`badge-boolean.md`).

## Where DzGrid differs on purpose
- One function returning class names, rather than a map of class to predicate: the same thing, smaller, and the application keeps its own logic.

## Tests
`packages/dom/test/cell-class.test.ts`, `packages/dom/test/class-hooks.test.ts`, `packages/angular/test/class-hooks.test.ts`; the documented examples on real framework builds: `npm run test:browser -- --only themes` (`frameworkChecks`).

## Phase 5 step 4
The `dzg-cell--*` classes (`pending`, `saving`, `still`, `saved`, `refused`, `blink-a`, `blink-b`, `failed`) belong to `@dzgrid/dom/edit`; a `cellClass` rule never sets them (the `dzg-` prefix is ignored, as before).
