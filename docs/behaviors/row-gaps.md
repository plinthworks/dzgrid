# A gap between two categories

Written before the code (CLEANROOM). Plan: `docs/phase-6-steps/step15-plan.md` Part B (B-D1…B-D9); owner answers:
`docs/phase-6-steps/decisions.md` « Steps 14 and 15 — owner answers » (all recommendations A). Behaviour borrowed from
what the owner's « arbre » screen shows: three tables in one tree, an empty band of space before each table but
the first.

## What the user does
Reads a long grid made of a few big categories (tables, sections) and wants to see at a glance where one ends and the
next starts. Scrolls, sorts, filters, opens and closes, moves with the keys, selects, copies, exports, prints.

## What they observe
- An **empty space above** the first row of each category but the first: the grid's own background, no line, no
  band. It scrolls with the rows; nothing in it can be clicked, focused, selected or read.
- The space follows the rows shown: after a sort or a filter it is again above the rows the rule names; folding a
  category keeps its space (its top row is still shown).
- The rows keep their own heights: the space is never part of a row (its background, hover and selection colour do
  not fill it).

## What DzGrid does
- **API** (owner Q15-6 A): a feature of its own, `rowGaps({ before, size })` from `@dzgrid/dom/row-gaps` (the core
  part in `@dzgrid/core/row-gaps`; a grid without gaps pays nothing):
  - `before(c) => boolean | number`, with `c = { row, key, index, level, prev }` — `row` the data (`null` for a path
    tree's filler or a loading row), `key` its row key, `index` its place among the rows shown, `level` its depth
    (0 for a root and on a flat grid), `prev` the data of the row shown above it (`null` when that one is not data).
    Asked for each shown row but the first, once per new order of the rows shown (sort, filter, open, close, new
    rows, a page), never per paint or per scroll.
  - `true`: a gap of `size`; a number: a gap of that many pixels for that row; `false`, `0`, `null`, `undefined`:
    none.
  - `size`: pixels at the default text size, **16** by default (owner Q15-7 A). Every gap is scaled with the text
    like the row height (`size × text size / 16`, rounded to whole pixels): a 200 % text zoom doubles it.
  - `roots`, exported: `(c) => c.level === 0` — a gap before each top-level row but the first (the owner's screen:
    `rowGaps({ before: roots })` with `tree({ fixedOpen })`).
- **Where** (Q15-8 A): never above the first row shown (the header separates it already), so never above the first
  row of a client page either; never in the pinned-row bands; never on a pinned parent's copy (a copy has its row's
  own height).
- **Layout**: a gap belongs to the slot of the row under it. The row's box starts after its gap; the grid's height
  counts every gap; the row at a point inside a gap is the row under it (a drag of a block or of the fill handle
  through it reaches that row). Scrolling a row into view shows its box; its gap may stay above the view.
- **Outside every row** (B-D1): no element is added; nothing focused or read; not counted in `aria-rowcount` /
  `aria-rowindex`; Down from the row above a gap lands on the row under it; never selected, filled, copied, pasted.
- **Look** (Q15-7 A): the grid's body background. The row after a gap carries `data-gap` and `--dzg-gap: <px>` (the
  scaled size) so a theme or an app can draw in it (e.g. a line in a `::before` at `inset-block-start:
  calc(-1 * var(--dzg-gap))`); the theme draws nothing by default. Forced colours: nothing to draw.
- **Export and print** (Q15-8 A): never exported (a gap is no row: CSV, the clipboard, Excel paste have no empty
  line). Print: no gap in 1.1.0 (print shows a tree's levels by its indent).
- **Merged cells** (`spans.md`): a gap cuts a merged run; a tall cell never bridges a gap. The CSV export's `spans: 'first'` follows
  the same map: the row under a gap writes its value again.
- **With**: a tree and its pinned parents, rows always open (`fixedOpen`), merged cells, automatic row height (a row
  both taller and gapped; the gaps feature is the outermost layout whatever the order of the features), pinned rows,
  client pages, right to left (the same offsets: a gap is a block-direction space). **Not with** master/detail in
  1.1.0: `unsupported-combination` (path `rowGaps`, detail `detail`), no gap drawn.
- **Problems** (never the row's data): `before` not a function — `invalid-setting` (path `rowGaps.before`), no gap. A
  rule that throws, or answers a negative, non-finite or non-number value: no gap on that row, told once per grid and
  per kind (`invalid-gap`, path `rowGaps.before`, detail `threw` or `not a size`). `size` not a non-negative finite
  number: 16, `invalid-setting` (path `rowGaps.size`).

## Where we differ on purpose
- A gap is layout only, not an empty row: nothing to skip with the keys, nothing for a screen reader to say, nothing
  in an export.

## Tests
`packages/core/test/row-gaps-{layout,property,rule}.test.ts`; conformance `layout-rows/gaps-*.json`,
`spans/gap-cuts-merge.json`; `packages/dom/test/row-gaps{,-walk}.test.ts`; browser `npm run test:browser -- --only
row-gaps` (rows where the layout says at 10 000 rows, LTR and RTL, a click in a gap, pinned parents over a gap).
