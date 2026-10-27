# Sticky parent rows

Sources: WAI-ARIA 1.2 treegrid (what a screen reader reads: the real rows only), WCAG 2.2 — 2.4.11
focus not obscured (minimum), 2.5.8 target size, 1.4.11 non-text contrast, forced colours — and
what a person sees in tools that keep the enclosing lines of a long block at the top of the view
while its content scrolls (code editors, file trees). Never any grid's code. Owner decisions
`docs/phase-4-steps/decisions.md` Q10, Q11; blueprint `docs/phase-4-steps/sticky-blueprint.md`.

## What the user does
Opens a service with hundreds of patients, some with stays, and scrolls down through them. Clicks
a pinned parent to go back to it; clicks its chevron to close it; moves with the keys up into rows
the pinned parents cover.

## What they observe
- Once a parent's own row scrolls up under the header, a copy of it stays pinned just under the
  header, as long as one of its children is still in view. Its own parent above it, and so on: the
  whole line of ancestors, outermost first, one row each, indented as in the tree.
- When the last child of a pinned parent scrolls up, the next row of the same level pushes the
  copy up and out of the way, smoothly — the copy never covers a row that is not its own child.
- The copies look like the rows they stand for: the same cells, the same indent, the same open
  chevron, the selected colour when the row is selected, the muted colour when the row is shown
  only for its matches under a filter. They show the cells' text only (owner Q11b): a column drawn
  by a part (a badge, a button) shows its plain text in the copy; the real row stays complete.
- A click on a copy goes to the real row: it scrolls back so that the row sits just under its own
  pinned ancestors, and the keyboard focus lands on the cell clicked, in that row (owner Q11c). It
  does not select the row, whatever the selection settings, and it fires no row click.
- A click on a copy's chevron closes that parent (said once, as any closing by the user); the view
  puts the parent just under its own pinned ancestors (never under their copies, WCAG 2.4.11), the
  rows below it move up. Any closing that hides the row at the top does the same (Left, the API). The copy's selection box does
  nothing.
- A row the keyboard moves onto is never left under the copies: the view scrolls so that it sits
  just under its own ancestors' copies.
- Right to left: the copies line up with their columns as the real rows do, pinned columns
  included, through a horizontal scroll.
- Printing: the copies are not printed (the rows are). Forced colours: the system's colours, with
  a line under the stack and the chevron in the system's button text colour.
- With a screen reader, nothing changes: the copies are not read and cannot be reached; the real
  rows keep their level, place and open state; scrolling says nothing.

## What DzGrid does
- **Option** `tree({ sticky })`: how many ancestors at most are pinned, the nearest ones (when a
  row has more, the outermost are dropped first). `0`: none — no layer is made and no code runs at
  paint; `1`: the direct parent; `3` by default (owner Q10). A fraction is cut down, a negative
  number is `0`, anything not a number is the default. Never more than fit in half of the view:
  `floor(view height / 2 / row height)` (a short grid keeps rows to read); with rows of their own heights (automatic
  row height, owner Q9-5) also never more pixels than half the view, the outermost copies dropped first (a parent
  taller than half the view is not pinned).
- **Which rows** (pure function `stickyStack`, `packages/dom/src/tree/sticky.ts`): starting with no
  copy, the row at the stack's lower edge is looked at; its ancestors, and itself when it is an
  open parent whose row starts above that edge, are pinned if they continue the stack; the edge
  moves down by the new copies; repeated until the stack stops growing or the row at the edge is
  no longer inside the innermost copy. Each copy then sits at its slot, or higher when its subtree
  ends above its slot's lower edge (the push): `y = min(slot, top of the row after its subtree −
  view top − its height)`; a copy pushed fully out is dropped. Pinned copies are always a prefix of
  the line (outermost first). Offsets come from the paint's row layout (heights per row ready for
  step 9), logical differences only (a scaled scroll changes nothing).
- **Where**: a layer `.dzg-sticky`, `aria-hidden="true"`, last child of the header (sticky already,
  above the body), zero height; copies placed under it, each painted by a second row renderer of
  the grid's (`rowRenderer.spawn(layer)`, its own pool of at most `sticky + 1` rows). It slides
  under the header rows, an outer copy over an inner one. The header's own height does not change.
- **Copies carry no row semantics**: no `aria-rowindex`, `aria-level`, `aria-posinset`,
  `aria-setsize`, `aria-expanded`, `aria-busy`; never a tab stop, never the DOM focus (the layer
  stops the pointer's default focusing); the grid's handlers (selection, tooltips, row and cell
  clicks, the header's sort) do not know them. The live region says nothing about them.
- **Pointer on a copy** (one listener on the layer): the chevron → `rows.expand` of that row,
  source user; the selection box → nothing; anything else → `focus.set` on the real row (the
  clicked column, the tree column otherwise), then the grid's own focusing, which scrolls.
- **Focus not obscured** (WCAG 2.4.11): the base's scroll-into-view leaves room above a row for
  its own copies (`min(sticky in effect, its level) × row height`) when the row is above the view
  or under the stack drawn at the last paint.
- **Repaint**: the stack is worked out at every paint (scroll, filter, sort, transaction, opening,
  density, zoom); when the same copies sit at the same places over the same rows and columns,
  nothing is written. Motion never moves the copies (they snap). Master/detail is not combined
  with it.

## Where we differ on purpose
- No row semantics on copies: a copy is a picture of a row, not a second row; assistive
  technologies meet each row once, in its place.
- The cap at half the view.

## Tests
- `packages/dom/test/tree-sticky-stack.test.ts`: `stickyStack` against the brute-force oracle
  (`support-sticky.ts`) over 1 000 seeded trees × 12 tops × five `n`, uniform and mixed heights;
  properties (cap, chain, prefix, never over a row outside the copy's subtree); hand cases (push,
  cap, heights per row, rounds ≤ n + 2); cost on the 1 000 000-row profile (≤ 0.2 ms).
- `packages/dom/test/tree-sticky.test.ts`: the layer, what copies carry and do not, `sticky` values,
  push and stacking, header rows added, sort / filter / transaction, an unchanged stack untouched,
  right to left, silence; the pointer (chevron, cell, box, no default focus); WCAG 2.4.11 (Up, Left,
  `api.ensureVisible`).
- `packages/dom/test/tree-sticky-walk.test.ts`: a DOM walk (scrolls, closing and clicking copies,
  sorts, filters, transactions, keys) against the oracle, fr and ar, `sticky` 0 / 1 / 2 / 3.
- `packages/theme/test/sticky.test.ts`; `scripts/browser.mjs` `--only tree` (« tree sticky »: fr and
  ar RTL, pinned columns, horizontal scroll, axe, push screenshot, forced colours, print);
  `scripts/perf-browser.mjs --only tree` (frames with pinned parents, their cost).
