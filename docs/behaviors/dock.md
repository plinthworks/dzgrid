# The dock (panels beside and under the grid)

Written before the code (CLEANROOM). Plan: `docs/phase-9-steps/status-dock-plan.md` §2; owner decisions Q-SB5
(2026-11-03) and « Dock — owner B » (2026-11-06) in `phase-9-steps/decisions.md`, which win over the plan and this
sheet. What other products show (an editor's tool windows docked at a side or at the bottom, tabbed, collapsed to a
strip, resized by their edge) is named from their public pages and from using them, nothing read. The keys are WAI-ARIA
APG's: window splitter, tabs (manual activation), menu button.

## What the user does
Opens the columns panel from the column menu and finds it standing beside the grid instead of over it; drags the edge
between the panel and the rows to make it wider; collapses it to a narrow strip and opens it again; puts the filters
panel in the same place and switches between the two with tabs; moves one to the bottom of the grid; comes back the
next day and finds them where they were.

## What they observe
1. **Opt-in.** Nothing changes without `dock()` (from `@dzgrid/dom/dock`): the columns panel stays a dialog, the
   filters panel keeps its own side. With `dock()`, the panels the grid's features have (the columns panel `columns`,
   the filters panel `filters`) and the application's own (`dock({ panels })`) stand in the dock. The application
   changes nothing else: `columnsChooser()`, `filtersPanel()` and their `api(grid)` stay.
2. **Areas.** A panel stands in an area: `start` or `end` (beside the rows, the whole height of the grid) or `bottom`
   (under the rows and the grid's bottom strip, between the side areas). Logical sides: in right to left `start` is the
   right. Each area is inside the grid's box, outside `role="grid"`; the rows, the headers, the find bar and the bottom
   strip take the room left, nothing is covered. An area with no panel shown takes no room.
3. **Where a panel goes first.** `dock({ open: { columns: 'end' } })` shows that panel there at the start. Otherwise
   the panel's own default: the columns panel at the `end`, hidden until opened (the column menu's « Choisir les
   colonnes », its `api(grid).open()`); the filters panel on its `side` (`end` by default), its strip shown (collapsed)
   or open as its `open` says, as without the dock; an application's panel at its `area` (`end` by default), hidden.
4. **The area's head.** One panel: its title. Two or more in one area: **tabs** (below). Then three buttons:
   « Replier » / « Déplier » (collapse, `aria-expanded`), « Placer … » (the menu « Au début · À la fin · En bas »,
   the current place ticked) and « Fermer … » (×). Every button 24 px at least, named with the panel's title.
5. **Collapse.** The area shrinks to its head, laid along the edge (a strip of `--dzg-dock-strip`, 2 rem, beside the
   rows; the head's height under them); the rows take the room. « Déplier », a tab, `Enter` on the edge (8), or the
   panel opened again restore it at its size. Collapsing does not hide the panel: its tab stays in the strip.
6. **Close (×).** The panel leaves the screen (its area disappears when it was the only one); the focus goes back to
   what opened it when that is still on the page, else to the grid's focused cell or header. Opening it again (the
   menu item, the application's button) brings it back to the same place and size. The filters panel's × collapses its
   area instead (its strip stays, as without the dock), unless `filtersPanel({ button: false })`.
7. **Tabs (two panels or more in one area).** A `tablist` named « Panneaux »: each tab is the panel's title, the shown
   one `aria-selected`; one tab stop. Manual activation (APG): ← → (↑ ↓ in a collapsed side strip) move the focus
   between tabs, following the reading direction; Home / End to the first / last; Enter or Space shows that panel.
   A click shows it. Only the shown panel's body is in the page's Tab order (`role="tabpanel"`, named by its tab).
8. **Resize by the edge.** The edge between an area and the rows is a focusable `role="separator"` (APG window
   splitter), named « Largeur de Colonnes » (« Hauteur de … » for the bottom), `aria-orientation` (vertical beside,
   horizontal under), `aria-valuenow` / `aria-valuemin` / `aria-valuemax` in CSS pixels (the area's size). Dragging it
   (mouse, pen, finger) resizes the area; the keys: ← → (beside) or ↑ ↓ (under) move the edge 16 px the way the arrow
   points (whatever the reading direction), with Shift 64 px; Home the smallest size, End the largest; **Enter
   collapses** (the focus goes to « Déplier ») **and restores**. The edge is 24 px wide (a gutter between the rows and
   the panel), its line drawn in its middle.
9. **Sizes.** Beside: 288 px by default (18 rem at 16 px), under: 240 px. Between `dock({ sizes: { min, max } })`
   (160 and 800 by default) and what leaves the rows 160 px. A size that no longer fits (the window narrowed) is kept
   and shown smaller; it comes back when there is room.
10. **Move between areas.** « Placer … » or `api(grid).move(id, area)`: the panel goes to that area (a tab there when
    it already holds one), shown, the focus on its tab or title in its new place. No drag-to-dock (plan §2.1).
11. **Kept in the grid's state.** With `gridState()`, its part `dock`: where each panel stands and whether it is
    shown, each area's shown tab, size and collapse:
    `{ panels: { columns: { area: 'end', open: true } }, areas: { end: { active: 'columns', size: 320 } } }`.
    Absent from a grid without the dock (the state's text unchanged). A restore puts each panel back; an unknown area,
    a size or a flag that is not one is skipped and told (`state-field`, a path such as `dock.panels.columns.area`); a
    size is kept between `min` and `max`; a panel the grid does not have (yet) is kept for when it comes. A change of
    the dock is a gesture: `stateChanged` after the pause, as a column moved. `reset()` puts the dock back as it was
    at creation.
12. **The floating window is not there yet** (owner B: later). The area `float` is part of the model and the state's
    shape, but `dock({ open })`, `move()` and a restored state naming it are refused: the panel stays where it was (its
    default area for a first placement), one `invalid-setting` warning (`dock.open.<id>`, `dock.move`) or `state-field`
    (`dock.panels.<id>.area`, detail `float`).
13. **Right to left.** Areas, edge, strip and tabs are placed by logical sides only: `start` is the right; dragging the
    edge toward the rows widens the panel on either side; ← → move the edge the way they point.
14. **Narrow screens (30 rem or less).** A side area open covers the rows (the whole width), its edge hidden; collapsed,
    it is its strip as on a wide screen.
    The focus going into the rows (a cell or a header, by Tab or a click) collapses an open side area to its strip, so
    the focused cell is never hidden under it (Phase 11 L4a, WCAG 2.4.11; told as a user change; owner yes, 2026-11-08). « Déplier » opens it
    again. The grid's size is measured on the next task after a resize, never inside the observer's delivery (WebKit
    reported a « ResizeObserver loop »).
15. **Screen readers.** Each area is a `region` named « <panel>, <grid> » (« Colonnes, Patients »); its head's buttons
    and the edge are named with the panel's title; nothing is said on its own (the expanded state, the selected tab and
    the edge's value are heard on the control). Regions are in the page's Tab order: the start area before the grid,
    the end area and the bottom area after it. **No F6** (decisions: the browsers keep F6 for their own bars; a page
    cannot count on receiving it).
16. **Forced colours.** The edge's line, the focus rings and the selected tab stay visible (system colours).
17. **Look.** Colours from the theme (`@dzgrid/theme/dock.css`), CSS variables only (`--dzg-dock-*`); layout injected
    by the feature. `--dzg-dock-strip` (2 rem) the collapsed strip.

## Texts
`locales/<lang>-dock` (en, fr, ar): `dock.region` (`{panel}`, `{grid}`), `dock.tabs`, `dock.collapse`,
`dock.expand`, `dock.close`, `dock.place` (`{panel}`), `dock.start`, `dock.end`, `dock.bottom`, `dock.width`,
`dock.height` (`{panel}`). Missing ones: `dock()` throws at setup, naming them.

## API
```ts
import { dock } from '@dzgrid/dom/dock';
import { FR_DOCK } from '@dzgrid/dom/locales/fr-dock';
import '@dzgrid/theme/dock.css';
const d = dock({ open: { columns: 'end' } });
createGrid(host, { …, features: [columnsChooser(), filtersPanel(), d] });
d.api(grid)?.move('filters', 'bottom');
```
- `dock({ open?, panels?, sizes?, onChange? })`; `panels`: `{ id, title, area?, mount(host) → cleanup? }`.
- `DockApi`: `show(id, area?)`, `hide(id)`, `move(id, area)`, `collapse(area, on?)`, `resize(area, px)`,
  `layout()` (the state's part now), `setLayout(raw)` (problems). Each returns false when it did nothing.
- `onChange(layout)`: after each change made by the user or the API (never a restore).
- The grid going (Phase 11 R5): the areas leave, an open « Placer … » menu closes with the grid, every panel's
  cleanup runs — one that throws is reported (`reportError`), the next ones still run.
- Kept on purpose (Phase 11 R5): a state's `dock` restored before the dock is set up (a feature listed after the state)
  tells its problems in a `problems` event when the dock comes, not in `setState`'s return; a state read before the
  first paint may lack the features' panels (collected at the first paint) — the dock comes with the grid's features,
  never before them.

## Where DzGrid differs on purpose
- Inside the grid's box, not a page frame: an application's `#host > .dzg` rule keeps working.
- Keyboard first: the menu « Placer … » instead of dragging a panel to an area; a gutter of 24 px for the edge.
- No F6 (15).

## Tests
Conformance `conformance/cases/grid-state/dock-*.json` (by hand). DOM `packages/dom/test/dock*.test.ts`. Browsers
`node scripts/browser-dock.mjs` (Chrome; Firefox and WebKit for layout and right to left; axe fr / ar);
`packages/dom/test/a11y-l4a.test.ts` and `node scripts/browser-a11y.mjs --only dock,filters,pivot` (narrow screens, the measure).

## Beside a pivot (follow-up, owner 2026-11-07)
The docked columns panel shows the pivot's « Mode pivot » switch and its three parts at its top (`columns-chooser.md`
« Beside a pivot », `pivot.md` 35–36). Nothing else of the dock changes.
Owner 2026-11-07: the docked columns panel shows no « Fermer » in its footer (the area's × closes it; the dialog keeps
its own); the edge's grip shows only under the pointer and while focused, in the accent, centred in the gutter (at rest
the area's line alone marks the edge: a grip at rest read as a stray scroll bar beside the list).
