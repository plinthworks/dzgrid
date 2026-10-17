# Parts: what a host draws in the grid

## What the user does
Nothing different: they scroll, sort and filter a grid whose cells hold a badge, a button, a link drawn by the host's own code.

## What they observe
- The custom cells look the same as the rows scroll by; nothing flickers, a button keeps its focus while the list moves.
- One broken cell drawing does not blank the grid: that cell is empty, the rest paints.
- Sorting, filtering, quick search, CSV and right-to-left work on those columns as on the others.

## What DzGrid does
- **One contract for every slot:** a part is `mount(host, context)`, which returns a handle with `update(context)`, `destroy()` and `focus()`, each optional. The grid gives the host element; the part writes its own DOM. The grid never writes HTML.
- **Mount once, update on rebinding:** a part mounts once into a pooled cell. When the cell shows another row, new data, takes or loses the focus, or gets a new language, direction, column definition or message bundle, the grid calls `update` on the same handle; nothing else calls it.
- **Destroyed before its host moves:** when its column leaves the row's window, when the registry gives the column another part, and on the grid's `destroy` (pooled and spare cells included). Then the grid gives the cell back its plain text. Mounts equal destroys at the end.
- **Pooled rows keep their parts** while off screen, until they are rebound to a row; the grid itself holds no row data for them.
- **Context:** `value` (coerced by the column's codec, null when blank or unreadable), `text` (what the grid would show), `row`, `key`, `column`, `focused`, plus `ctx`, `dir`, `msg`, `announce` and `doc`.
- **By name, per grid:** `settings.parts` is one registry per grid, a plain record of `definePart(slot, part)` entries; no global registry, so several grids and SSR stay safe. It is live: a new record re-resolves every column, remounting what changed and going back to plain text for what lost its part.
- **How a column finds its part:** its own name (`ui.cell`, later `ui.header`, `ui.tooltip`), else `${slot}.${type}` (`cell.number`), else the built-in. Filters use the column's kind: `filter.kind`, or the type, an enum being `set` (`filter.set`, `floating.set`).
- **No part, fast path:** a column with no part keeps the grid's text path. Registering `cell.text` moves every text column to parts, on purpose.
- **`unknown-part`:** a name no one registered for that slot is an error problem at `columns.<id>.ui.<slot>`, told once per registry (not again on every resize); the column takes the type default or the plain text.
- **A part that throws** (in `mount` or `update`) costs its cell for that row only: the part is destroyed, the cell left empty, the error passed to `reportError`. It is not tried again on that row until the row's data changes; the next row the cell shows mounts it afresh. A `destroy` that throws is reported the same way and never stops the grid.
- **Focus:** focus inside a part survives scrolling, because the focused row is retained in place. A control a part draws (a button, a focusable span) owns its keys (`cell-widget`): arrows do not move the grid's focus.
- **Slots:** `cell` now. `header`, `overlay` and `tooltip` next, then `filter` and `floating`, then `footer` (`footer.pager`, `footer.count`, `footer.selected`). `editor` is Phase 4. Angular templates and components become entries of the same registry.

## Tests
- Now: `conformance/cases/part-name/*`, `packages/dom/test/parts.test.ts`, `packages/dom/test/review-p3c.test.ts`, `packages/dom/test/review-p3d.test.ts`.
- `header`, `overlay` and `tooltip` slots as default parts (planned, step 11).
- `filter.*` and `floating.*` parts, custom kinds through `filter.<kind>` (planned, steps 12 to 15).
- `footer.*` parts (planned, step 17). `cell.badge`, `cell.boolean` and worked example 2 as a fixture (planned, step 20).
- `componentPart`, `DzgPart`, `part-shadowed` (planned, step 22).

## Decisions (step 1, 2026-10-17)
- **`update`, `destroy` and `focus` are all optional** (the code). A part without `update` keeps what it drew; without `destroy`, the grid only empties the host.
- **`msg` takes `MessageKey | app.${string}`.** An `app.*` key missing from the bundle gives the key itself and the warning `missing-message`, once per key. Step 0 follow-up.
- **The cell context gains `focused`**, true while the grid's focus is on that cell. Step 0 follow-up.
- **When `update` runs:** only when the context changed — another row key, new row data, `focused`, or what the context carries (language, zone, numerals, direction, messages, the column's definition). A rebind for the row height, the checkbox column or the column window calls nothing. Step 0 follow-up (`render/rows.ts` today calls `update` on every rebind).
- **Resolution:** the column's name, then `settings.parts`, then a feature's parts, then the built-in. Features gain `parts` at step 11, the first that ships default parts.
- **A name registered for another slot** is `unknown-part`, as the code does: a name is looked up among the parts of that slot only.
- **A filter kind no one registered** gives `invalid-filter` and the column's filter is ignored. Step 8.
- **A `destroy` that throws** is reported through `reportError`, like `mount` and `update`, and the grid goes on. Step 0 follow-up.
- **Cell widgets:** the owner `cell-widget` is inferred from the control, as the code does; a part need not mark its container. Enter or F2 on a cell calls the part's `focus()`; when it is absent or returns false, focus stays on the cell. Escape returns to the cell. Step 0 follow-up.

## Owner questions
- A pooled row, detached from the document, keeps its part with the last context (row object included), as plain cells keep their last text. Is that acceptable under Sehhaty's health-data policy, or must the grid clear what pooled rows hold (an `update` with an empty context, a cost on every scroll)? Until answered, the code stays as it is.
