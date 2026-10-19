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
- **Slots:** `cell` in the base; `header`, `overlay` and `tooltip` with the feature `slots()` from `@dzgrid/dom/slots` (step 11); then `filter` and `floating`, then `footer` (`footer.pager`, `footer.count`, `footer.selected`). `editor` is Phase 4. Angular templates and components become entries of the same registry.
- **Header, overlay and tooltip (step 11, decision O1):** the base keeps its own header label, overlay message (with its retry button) and tooltip text, with no part machinery; `slots()` lets a host's parts replace them. Same `Part` contract, same throw rule: a part that throws in `mount` or `update` is destroyed, its host shows the grid's own text again, the error goes to `reportError`, and it is not tried again until its context changes.
  - **`header`** (per column) draws the label's content only (decision O4). The grid keeps `role="columnheader"`, `aria-colindex`, `aria-sort`, the name with the sort precedence, the sort mark, the resize grip, `dzg-sortable` and click-to-sort; a click on a control the part draws (a button, a link, `data-dzg-owner`) does not sort. Context: `column`, `label` (the column's `header`, or its id), `sort` (this column's sort item or null), `sortIndex` (its precedence from 0, or null), `toggleSort(multi)` (a `sort.toggle` by the user, Shift's behaviour when `multi`). `update` runs only when one of them, the language, the direction or the messages changed. The rows a feature adds under the headers and the group rows never take it. The filter button and the active filter mark (step 13) are decorations beside the sort mark, never part content.
  - **`overlay`** (one per grid): context `phase` (`loading`, `empty`, `no-match`, `error`), `failure`, `retry()`, `clearFilters()` (`overlays.md`).
  - **`tooltip`** (per column): context `text`, `value`, `row`, `column` (`tooltips.md`); shown only when the host gives text.
  - **Resolution:** a name is looked up among that slot's parts only. Header: `ui.header`, `header.<type>`, the bare name `header` (every column), then the built-in. Tooltip: `ui.tooltip`, `tooltip.<type>`, `tooltip`, then the built-in. Overlay: `overlay`, then the built-in. An unknown `ui.header` or `ui.tooltip` is `unknown-part`, told once per registry, and the next choice is taken.
  - **Without `slots()`:** a registered `header`, `overlay` or `tooltip` part is `missing-feature` (warning, `parts.<name>`, detail `slots`), told once when the grid is made; the grid draws its own.
  - **Lifecycle:** a header part is mounted with its header cell and destroyed when the cell leaves the column window, when its column gets another part, and on the grid's `destroy`; the overlay part when the overlay shows and hides; the tooltip part when the tooltip shows and hides. Mounts equal destroys at the end.

## Tests
- Now: `conformance/cases/part-name/*`, `packages/dom/test/parts.test.ts`, `packages/dom/test/review-p3c.test.ts`, `packages/dom/test/review-p3d.test.ts`.
- `header`, `overlay` and `tooltip` slots (step 11): `slots-header.test.ts`, `slots-overlay.test.ts`, `slots-tooltip.test.ts`, `slots-missing.test.ts`.
- `filter.*` and `floating.*` parts, custom kinds through `filter.<kind>` (planned, steps 12 to 15).
- `footer.*` parts (planned, step 17). `cell.badge`, `cell.boolean` and worked example 2 as a fixture (planned, step 20).
- `componentPart`, `DzgPart`, `part-shadowed` (planned, step 22).

## Decisions (step 1, 2026-10-17)
- **`update`, `destroy` and `focus` are all optional** (the code). A part without `update` keeps what it drew; without `destroy`, the grid only empties the host.
- **`msg` takes `MessageKey | app.${string}`.** An `app.*` key missing from the bundle gives the key itself and the warning `missing-message`, once per key. Step 0 follow-up.
- **The cell context gains `focused`**, true while the grid's focus is on that cell. Step 0 follow-up.
- **When `update` runs:** only when the context changed — another row key, new row data, `focused`, or what the context carries (language, zone, numerals, direction, messages, the column's definition). A rebind for the row height, the checkbox column or the column window calls nothing. Step 0 follow-up (`render/rows.ts` today calls `update` on every rebind).
- **Resolution:** the column's name, then `settings.parts`, then a feature's parts, then the built-in. Features gain `parts` at step 12, their first user (decision O8 of step 11; step 11 ships no default part).
- **A name registered for another slot** is `unknown-part`, as the code does: a name is looked up among the parts of that slot only.
- **A filter kind no one registered** gives `invalid-filter` and the column's filter is ignored. Step 8.
- **A `destroy` that throws** is reported through `reportError`, like `mount` and `update`, and the grid goes on. Step 0 follow-up.
- **Cell widgets:** the owner `cell-widget` is inferred from the control, as the code does; a part need not mark its container. Enter or F2 on a cell calls the part's `focus()`; when it is absent or returns false, focus stays on the cell. Escape returns to the cell (inside a host dialog, a first Escape returns to the cell, a second one reaches the dialog). Enter on a cell without a part is left to the host. Done (69b47fb).

## Owner questions
- A pooled row, detached from the document, keeps its part with the last context (row object included), as plain cells keep their last text. Is that acceptable under Sehhaty's health-data policy, or must the grid clear what pooled rows hold (an `update` with an empty context, a cost on every scroll)? Until answered, the code stays as it is.
