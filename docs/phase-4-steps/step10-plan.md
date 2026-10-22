# Step 10 plan: `@dzgrid/dom/detail`, master/detail on screen (lead, 2026-10-22)

Plan: `docs/phase-4-plan.md` D8, step 10, risks (« nested grids: memory, focus, inner keys, wheel chaining,
ResizeObserver loops, destroy during scroll », « a11y of a whole-row stop »); owner Q4 (fixed 240 px by
default, configurable), Q5 (nesting tested at 2, soft cap 3; no tree and detail on one grid);
`step08-plan.md` (`detailShape`, `sizes`, `sparseRowLayout`, `setHeights`, `detailConflicts({ depth })`);
`step09-plan.md` and its review (the base: `g.layoutFor(d, h, was)`, `RowView.slot` / `part`, the part slot
`'detail'`, Enter/F2 → the part's `focus()`, Escape from a widget back to the cell, the outer router
ignoring a key from another grid or already handled). Sheet `docs/behaviors/master-detail.md` (stands,
completed below). Clean room: behaviour only, from the sheet and WAI-ARIA.

## Decisions and reasons

1. **One entry, three files.** `@dzgrid/dom/detail` (`packages/dom/src/detail.ts`) re-exports
   `detail/index.ts` (the feature), `detail/nested.ts` (`nestedGrid`), `detail/styles.ts` (its layout CSS).
   It imports the core, `@dzgrid/core/internal`, `@dzgrid/core/detail` and, for `nestedGrid` only,
   `createGrid` from `@dzgrid/dom` by the package's own name (a self-reference, as the entries already
   import `@dzgrid/dom/internal`): external in its size line, so the base is never bundled twice. The
   base never imports it (structure test).
2. **API.** `detail({ height?, initial?, part, column?, nested? })`:
   - `height`, `initial`: `detailShape`'s (number, default 240; `(master) => number`; `'auto'`), handed to
     the client model at creation through `GridFeature.shape` (the first feature giving a shape wins);
   - `part`: a `SlotPart<'detail'>`, or the name of one in `settings.parts` (Angular's `dzgPart` /
     `componentPart` register by name, step 11); a name looked up at each paint, so a host's own part wins;
   - `column`: where the chevron goes, the first visible column by default (as the tree's);
   - `nested`: this grid's depth (1 at the top). Not given: one more than the grids around it in the page
     (its root's `.dzg` ancestors), which is right for every grid made inside a detail.
   `nestedGrid({ settings, keep?, onGrid?, env? })`: a ready `'detail'` part making a grid in the panel
   from `settings(c)` (the panel's context: the master row, its key, the depth); `keep` the memory size
   (20); `onGrid(grid, c)` each grid made (a host's toolbar, tests); `env(c)` the grid's test seams (as
   `createGrid`'s, per grid).
3. **Opening.** Every data row is a master. A decorative chevron (`.dzg-toggle`, `aria-hidden`, 24 px target,
   the tree's class so the theme's colour and forced-colour rules apply) in the chevron column; a click on
   it opens or closes (captured: no selection, no row click). Keys, as the tree's on its column (protocol
   §17 step 102): forward (Right, Left in RTL) on a closed master opens, else the column move; back on an
   open master closes, else the column move. `aria-expanded` goes on the **chevron cell**, not the row:
   axe (4.14, `aria-conditional-attr`) refuses `aria-expanded` on a row of a `grid` (it is a treegrid
   row's), and ARIA 1.2 lets a `gridcell` carry it; the reader says « développé » on that cell. The click guard needs no « is it this grid's row » test:
   the renderer's `keyOf` knows only its own rows (a nested grid's chevron is never the outer grid's, a
   test pins it).
4. **The rows' layout.** `g.layoutFor = (d, h, was) => sparseRowLayout(d, h, { at: d.details, heights: was
   ? Array.from(d.details, (i) => was.heightOf(i)) : d.heights })`: on a new row height over the same rows
   the heights set on the old layout (measures) are carried (step 9 review, point 4). Only when the
   feature's shape is the one in use (a tree first in the list: no layout, no panels, the conflict told).
5. **The panel.** The base makes the cell (`RowView.slot`); the feature puts one content box in it,
   `<div class="dzg-dbody" data-dzg-owner="cell-widget">` (D8: anything focused inside is a widget, Escape
   back to the cell), and mounts the part there at the first paint showing the row (lazy). Context:
   `PartBase` (ctx, dir, msg, announce, doc, context) + `row` (the master's data), `key`, `master`,
   `height` (the layout's), and two additions (types only in `part.ts`): `depth` (this grid's + 1: what a
   grid in the panel is) and `leave()` (the focus back on this panel's cell, as Escape). `update` when the
   height, the master's data, the language, direction or messages change. Destroyed by the base when the
   row leaves the window, is rebound to another master, or the grid ends (step 9); a collapse removes the
   row, so it is the same path. A part that throws: reported (`g.report`), the box left empty, not tried
   again for that master until its data changes.
6. **Accessible name.** `detail.label` « Détails de {name} » (`{name}`: the master's text in the first
   column, as the base's). **Not** an `aria-label` on the cell (first draft): axe's
   `label-content-name-mismatch` (WCAG 2.5.3) refuses a name that does not hold the cell's visible text
   (an inner grid's). The content box is a `role="group"` with that `aria-label`, and the cell's name
   comes from its content: the group's label alone (accname: a child's `aria-label` stops the walk), so
   the reader still hears « Détails de Patient 0 » on the stop; the feature removes the base's
   `aria-label` from the cell.
7. **Heights `'auto'`.** One `ResizeObserver` per grid, on each mounted content box (`block-size: auto`;
   fixed heights: `100%` and no observer). Its callback (the browser gives one per frame, every entry in
   it) reads `borderBoxSize`, keeps the changes of more than 0.5 px in the `sizes` map handed to
   `detailShape` (a reopened panel starts at its last height; a new build reads them), sends them to the
   current layout in **one** `setHeights`, and schedules one paint. No loop: what is observed (the
   content's own height) does not depend on the row height written by the paint. Unobserved when its row
   goes. Estimate 240 until measured (the shape's).
8. **Announcements.** Only a user's opening or closing of one master (`rowExpanded`, `source: 'user'`,
   one row): `detail.expanded` « {name} développé » / `detail.collapsed` « {name} réduit » — new keys in
   the detail bundles rather than the tree's `tree.expanded` (that one counts rows: « {n} lignes » means
   nothing for a panel), same words as the tree so a reader hears one vocabulary. Bundles
   `locales/{en,fr,ar}-detail` (`DETAIL_KEYS` required by `detail()`, a `TypeError` naming the missing).
9. **Conflicts.** `detailConflicts({ spans, tree })` told once at setup (`problems`, source host); spans off
   beside details (`g.spans = null` before the rows, as the tree). Depth: `nestedGrid` tells
   `detailConflicts({ depth })` on each grid it makes past 3 (that grid's `problems`: « told by that grid »,
   step 8 point 9); the grid still works. A host making its own inner grid calls `detailConflicts` itself.
10. **`nestedGrid`.** Mounts `createGrid(host, settings(c))` in the content box (its own keys, scroll and
    focus: the outer router already ignores keys from another `.dzg`). `focus()`: the inner focus, else its
    first cell. Escape not taken by the inner grid (its target in **this** inner grid, not handled):
    `c.leave()` and `preventDefault`, so a grid two levels down goes back one level only (« once »). The
    memory: a `Map` by master key of `{ query, scrollTop }` (the inner kernel's query, the logical top),
    saved at destroy (collapse, out of the window, grid end), restored at mount (the query by
    `query.set`, source `api`; the scroll after the first paint), least recently used first out past `keep`.
11. **Wheel chaining.** The browser's default: the innermost scroller takes the wheel; at its edge a
    **new** gesture goes to the scroller around it (latching), never mid-gesture. But the base sets
    `overscroll-behavior: contain` on every grid's viewport (a grid never scrolls the page), which also
    stops a nested grid from chaining to the grid around it (seen in Chrome: the outer grid never moved).
    The detail CSS gives a nested grid's viewport `overscroll-behavior: auto` back: it chains to the outer
    grid, whose own `contain` still keeps the page still. Above the scroll cap the outer grid takes the
    wheel itself (`interact/scrolling.ts`), and an inner grid's wheel bubbles to it: the outer would
    scroll and the inner never. The content box stops (`stopPropagation`) a wheel whose target can still
    scroll that way inside the panel, or that something inside already took (`defaultPrevented`): the
    inner first, the outer at the inner's edge. The inner grid's root is `border-box` (its 2 px border
    made the content box a 2 px scroller that took the wheel at the inner's edge). In the feature, no
    base byte.
12. **Not data.** Inherited from steps 8–9 (selection, CSV, `rowClicked`, copy; the base ignores a click
    in a panel, a test pins it with the feature, no capture added). No event carries row data: the
    feature emits only `problems` (paths and codes) and the kernel's `rowExpanded` (keys).
13. **Theme** (`@dzgrid/theme`): `.dzg-dcell` background `--dzg-detail-bg` (default `--tz-bg-raised`), a rule
    under it (`border-block-end`), the content box padded; focus ring already on `.dzg-dcell:focus-visible`;
    forced colours: the cell's rule `CanvasText`. Contrast pairs: text, focus ring and toggle on the panel.
14. **Budget** `@dzgrid/dom/detail` 3 500 (external: core, core/internal, core/detail, dom, dom/internal).
    Bundles measured and proposed (≤ 200 / 220 / 250).

## Tests first (seen failing)
`packages/dom/test/detail.test.ts` (feature: lazy mount/destroy balanced, context, update, name, toggle,
keys, announcements by the user only, `'auto'` measured once per resize batch, top row kept, carry over
`was`, part by name, part errors, conflicts, not selectable/exported/clicked, no row data in events, missing
keys); `detail-nested.test.ts` (nestedGrid: Enter/F2, inner keys ignored, Escape once at 2 levels, LRU
restore and cap, depth 2 ok / 4 problem, wheel); `detail-ssr.test.ts` (node import). Browser `--only detail`.

## Review (2026-10-22, before the gate; a read-only reviewer on the uncommitted step)
Fixed, each with a test seen failing on its mutant: (1) an Escape the inner grid left only half-handled —
a composition cancelled (`isComposing`), or its tooltip hidden (read in the capture phase, before the
inner router hides it) — no longer also leaves the inner grid; (2) a host callback (`onGrid`) throwing after
the inner grid was made: the grid is destroyed before the error goes on (no listener or observer left);
(3) **base** `interact/tooltips.ts`: the outer grid no longer shows its own column's `headerTooltip` for a
nested grid's header of the same id (target's nearest `.dzg` must be its own; base +11 B); (4) decision:
`nestedGrid`'s `update` with another master row (new data) or another language makes the grid again from
the host's `settings(c)`, its state kept through the memory (a height change does nothing); (5) a sideways
wheel (Shift + wheel, a swipe) is always the panel's (its cell is as wide as the view; `sideways()` in
`dir.ts`, the base guard's one file of physical sides, imported by the entry: a pure function). Tests
strengthened: the cleanup test checks `disconnect` and the chevrons taken off; the « no depth problem »
test proves the inner grids' events are captured.

## Done (2026-10-22, not committed)
Tests first: `detail.test.ts` (24), `detail-nested.test.ts` (15), `detail-ssr.test.ts` (2): the first 35 all failing on a stub entry; the others added after the mutants and the review, each failing on its mutant. Mutants 28 by hand, all killed (4 survivors of the first 21 led to 4 tests, 1 of the review's to a stronger test). Review (read-only reviewer, before the gate): Escape while composing or hiding the inner tooltip stays inside; a throwing `onGrid` destroys its grid; **base** `interact/tooltips.ts`: no outer header tooltip for a nested grid's header (+11 B); `update` with a new master row or language makes the inner grid again (state kept); a sideways wheel stays in the panel (`sideways()` in `dir.ts`). Browser `--only detail` (Chrome, fr ltr light, ar rtl dark): 32 / 32 (14 new): axe 0 open, focused, inside the inner grid and closed; the name « Détails de Patient 0 » / « تفاصيل Patient 0 » computed from the group; keys in and out; wheel inner first then outer (scaled and the browser's chaining at 10 000 rows); 1 000 000 masters with 200 grids, 21 steps end to end, rows < 0.5 px, the last at 0 px, inner grids alive = panels = mounts − destroys; `'auto'` free content measured, a line added grows the row, no observer loop. Sizes: `@dzgrid/dom/detail` **3 413** (3 500); bundles en/fr/ar-detail **133 / 146 / 159** (lines at 200 / 220 / 250, measure + 10 % would be 150 / 200 / 200); dom base 20 618 → **20 627** (21 300); theme 2 238 → **2 268** (2 500); core/detail 994. Gate: `test:ci` 287 files, 4 641 tests; `test:perm` 6 / 6; `typecheck`, `check:size`, `build`, `check:contrast` green (a first run found the base guard: `deltaX`/`scrollLeft` outside `dir.ts`, fixed).
