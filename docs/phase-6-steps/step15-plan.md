# Step 15 plan: merged cells inside a tree, and a gap between categories (1.2.0)

Sources: ROADMAP « 1.1.0 — additions asked by the owner after the Phase 6 close (2026-10-29) » (the two structural
items, owner decision: 1.2.0, planned together); Phase 4 D2, D6, D7, D9 (`docs/phase-4-plan.md` §2;
`docs/phase-4-steps/decisions.md` « Lead »); step 9b (`docs/phase-3-steps/step9b-decisions.md`, `docs/behaviors/spans.md`);
`tree-view.md`, `tree-keys.md`, `tree-sticky.md`, `auto-height.md`, `print.md`, `csv-export.md`. Code read at `fe49d51`:
`packages/core/src/spans/{map,plan}.ts`, `packages/core/src/tree/shape.ts`, `packages/core/src/layout/rows.ts`,
`packages/core/src/detail/layout.ts`, `packages/dom/src/{spans,tree,auto-height,detail}/index.ts`,
`packages/dom/src/spans/body.ts`, `packages/dom/src/tree/sticky.ts`, `packages/dom/src/render/{viewport,rows}.ts`.
Clean room: behaviour only; the owner's arbre screen is described from what it shows, never from its ag-Grid setup's
code. Plan only: nothing built; sizes measured once (`node scripts/size.mjs`, 2026-10-29) and estimated otherwise.

## 0. Facts that shape the plan
1. **D9 was a scope choice, not a technical wall.** The Phase 4 plan says only « spans disabled with tree or detail »;
   no reason is written. The span engine already cuts a run at a level change, a non-data row and a full-width row
   (`map.ts:209-211`, `blockEnd`). In a tree's displayed order (pre-order), two consecutive rows of the same level are
   **always siblings** (a row followed by a same-level row has no child shown, and a last child is followed by a
   shallower row). So, unchanged, the engine already merges **consecutive shown siblings only**; fillers (path trees)
   and loading rows are not data and cut runs. Folding a parent hides all its children at once, so a merged cell is
   never half-folded.
2. **How the refusal works.** `treeConflicts({ spans })` (`core/src/tree/shape.ts:327`) is told once by `dom/tree`
   (`tree/index.ts:62-64`); then each paint `beforeRows` sets `g.spans = null; g.bands = []` (`:204`). So a tree also
   loses **grouped headers and collapsible header groups** today (they live in `dom/spans`): `hr.html` shows them only
   in its list view.
3. **The tree column and a tall cell clash in the DOM.** `dom/tree` puts the toggle as the cell's first child and
   checks `cell.firstElementChild` each paint (`tree/index.ts:247-253`); `dom/spans` moves every child of a tall cell
   into `.dzg-span-label` (`spans/body.ts:44-53`). Together the toggle is wrapped away and a new one is made each paint.
   A parent's toggle (and its `aria-expanded` row) inside a merged cell would also be reachable for one row only.
4. **The travelling label ignores the pinned parents.** It sticks under `--dzg-header-h` = group rows + header rows
   (`spans/body.ts:61`); the pinned parents' layer sits under those (`g.inset`, `tree/index.ts:213`), so a long merged
   label would slide under the copies.
5. **Per-row heights already exist.** `g.layoutFor(d, h, was)` (`dom/src/context.ts:107`, `render/viewport.ts:31-40`)
   gives a `RowLayout` (`count, total, uniform, offsetOf, heightOf, indexAt, setHeight`); details and auto height
   compose through it (`sparseRowLayout`, `core/detail/layout.ts:42`; `auto-height/index.ts:52-66` always makes itself
   the outermost `layoutFor`, and rebuilds a sparse layout from the detail extras only). The paint places each row at
   `offsetOf(i)` with `block-size: heightOf(i)` (`viewport.ts:290-291`, `rows.ts:297,347`). A gap cannot be « one more
   tall row » there without the gap being part of the row's box (its background, hover, selection colour, clicks).
   `dom/detail` casts `g.layout` to a `SparseLayout` and calls `setHeights` (`detail/index.ts:151-165`).
6. **Sizes now** (gz): core base 29 064 / 29 150 (layering guard 29 070: **6 B**), `core/spans` 3 749 / 3 800,
   `core/tree` 3 414 / 3 500, `core/detail` 1 012 / 1 050, dom base 22 334 / 22 400 (**66 B**), `dom/spans`
   4 577 / 5 050, `dom/tree` 3 821 / 3 850 (**29 B**), `dom/auto-height` 1 237 / 1 400, `dom/print` 1 598 / 1 600,
   theme 2 764 / 2 850, K.8 84 901 / 84 950, Angular 7 316 / 7 350. Neither K.8 (no tree in the audit screen) nor
   Angular (features go through `[features]`) is touched.

## Part A — merged cells inside a tree

### A.1 Behaviour (decisions; the owner's answers in §6 win)
- **A-D1 Which rows (Q15-1, lead A):** a merged cell covers **consecutive shown siblings** only (same parent, same
  level), never a parent and its children, never across a filler, a loading row, a full-width row, a page or a gap
  (Part B). It is computed on the rows shown, like after a sort or filter: opening a parent that sits inside a run
  splits the run at it (the children come between); closing it joins the siblings again. Hidden (folded or filtered)
  rows are never part of a merged cell.
- **A-D2 The tree column (Q15-2, lead A):** it may merge, but **only between leaves** (rows with no children, a lazy
  parent not loaded counts as a parent): a parent always keeps its own cell, its chevron and its keys. A `rowSpan`
  asked on a parent in the tree column is cut to one row and told (`span-clipped`, detail `rows`, as today).
- **A-D3 Keys** (as `spans.md`, plus the tree's): Up / Down step over a merged cell, one stop, the row aimed at
  remembered; Page keys as today. In the tree column, on a merged leaf cell: back (Left in LTR, Right in RTL) goes to
  the parent (the same for every covered sibling); forward moves to the next column; `*` opens the siblings of the
  row aimed at. Folding the parent of a focused merged cell moves the focus to the parent (existing rule).
- **A-D4 Screen readers (Q15-3, lead A):** as on a flat grid: `aria-rowspan` on the cell where the merge starts, in
  that row; covered places absent; each row keeps its `aria-level`, `aria-posinset`, `aria-setsize`,
  `aria-expanded`. Known limit, written in the sheet: on a covered row the focus is on the tall cell, so a reader says
  the first row's index and place (« 1 of 5 ») while the user aims at row 3; the tree's live sentences name the
  right row. A hidden repeat of the value on covered rows (step 9b O10) is added only if the listening (§22 of the
  protocol) shows the value is lost.
- **A-D5 Pinned parents:** copies stay text only and unmerged (`spans: null` in the stack render, unchanged): a copy
  of a row inside a run shows its own value, i.e. the label. An open parent is never the start of a merged run (its
  children follow it), it can only end one. The travelling label sticks under the copies too
  (`--dzg-header-h` + `g.inset`).
- **A-D6 Virtual scroll:** unchanged: the tall cell lives in its first row, kept mounted while any covered row is in
  the window (`anchors`), drawn over the window only.
- **A-D7 Editing, fill, copy, selection:** unchanged from flat grids: the covered places are real cells of their
  rows (copied, pasted, filled, cleared); a click selects the row under the pointer, Space the first row; editing a
  tall cell edits the row where it starts (to pin down in a test first: the behaviour exists, it is not written in
  `editing.md`). Structure columns stay read-only (`tree({ structure })`). Fill and copy take the rows shown
  (`fill.md` 20).
- **A-D8 Full-width rows (Q15-5, lead A):** still refused beside a tree: `settings.fullWidth` with `tree()` →
  `unsupported-combination` (path `settings.fullWidth`, detail `tree`), no row full width; the spans feature passes no
  full-width rule when the rows are a tree's.
- **A-D9 Grouped headers (Q15-4, lead A):** lifting the refusal also gives a tree grouped headers and collapsible
  header groups (they are the same feature). Checked with the pinned parents' layer under the group rows.
- **A-D10 Export, print:** CSV repeats the merged value on every row (default, unchanged); `spans: 'first'` over a
  tree's `all` scope uses a map built on the rows written (collapsed rows included, same rules). Print writes merged
  cells on every row (O9, unchanged).
- Details beside a tree stay refused (owner Q5); details beside spans stay refused.

### A.2 Core vs DOM
- **Core, `@dzgrid/core/spans`** (pure): one optional input `SpanInput.apart?: (row: number, col: string) => boolean`
  — « this slot never continues a span from the row above, in this column » (true also cuts what starts on it from
  going on). Used for the tree column's parents (A-D2) and for gaps (B-D5). Part of the memo key (identity), like
  `text`. Per-column limits are computed only for the columns that have a rule. Est. +40–60 B.
- **Core, `@dzgrid/core/tree`**: `treeConflicts` stops refusing `spans` and refuses `fullWidth` instead (net ≈ 0 B).
  The conformance case `tree/conflicts.json` changes by an owner decision (written in the case's description).
- **DOM, `@dzgrid/dom/tree`**: no more `g.spans = null` / `g.bands = []`; tells `fullWidth` refusal; gives the spans
  feature the tree column's `apart` through a context seam `g.apart?` (a function the spans feature reads; set by
  the tree, composed with the gaps feature's); finds its toggle by class, inside a span label too (fact 3).
  Est. −40 then +40–60 B → ≈ 3 840–3 860 / 3 850: **Q15-9**.
- **DOM, `@dzgrid/dom/spans`**: `wrap` leaves a `.dzg-toggle` first (the label after it, the indent kept); the label's
  sticky top adds `g.inset`; passes `apart` and no full-width rule under a tree. Est. +40–60 B → ≈ 4 630 / 5 050.
- **DOM base, theme:** 0 B expected (the `g.apart` seam is a type on the context).

## Part B — a gap between two big categories

### B.1 Behaviour (decisions; the owner's answers win)
- **B-D1 What it is:** an empty space **above** a row, outside every row: no element, nothing focused, nothing read,
  not in `aria-rowcount` / `aria-rowindex`, never selected, filled, copied, pasted or exported, no click target (a
  click in it hits nothing; a drag of a block or the fill handle through it reaches the next row). The rows keep
  their own height: a gap is layout height only.
- **B-D2 API (Q15-6, lead A):** a feature of its own, `rowGaps({ before, size })` in `@dzgrid/dom/row-gaps`:
  `before(c) => boolean | number` with `c = { row: T | null (null: a path tree's filler), key, index, level, prev:
  T | null }`, asked for each shown row on each new order of the rows shown (sort, filter, open, close, new rows);
  `true` = `size`, a number = that many pixels for that row; `size` in pixels at the default text size (16 by default),
  scaled with the text like the row height. `roots` exported: `(c) => c.level === 0` (arbre: a gap before each
  top-level category). No default rule: without `before`, nothing (and `invalid-setting`).
- **B-D3 Where (Q15-8, lead A):** never above the first row shown (the header separates it already), nor of each
  client page; never in pinned-row bands; never on a pinned parent's copy. Kept by sort, filter and virtual scroll
  (it follows the rows shown, by rule, never by position). Folding a category keeps its gap (the rule is asked on its
  top-level row, still shown).
- **B-D4 Layout:** the gap belongs to the slot of the row below it: `offsetOf(i)` = the row's box top (after its gap),
  `heightOf(i)` = the row's own height, `total` includes the gaps; `indexAt(y)` for a `y` in the gap answers the row
  below it. So the paint, the rows' boxes, the pinned parents' heights and the inset need no change; scrolling a row
  into view shows its box (its gap may stay above the view, as today with a header).
- **B-D5 Gaps and merged cells:** a gap cuts a merged run (through `apart`), so a tall cell never bridges a gap.
- **B-D6 Look (Q15-7, lead A):** the gap shows the grid's body background (no column lines, no band). The row after a
  gap carries `data-gap` and `--dzg-gap: <px>` so a theme or an app can draw in it (e.g. a `::before`); the theme
  draws nothing by default. Forced colours: nothing to draw.
- **B-D7 Print and export (Q15-8):** never exported (no row to write). Print: no gap in 1.2.0 (`dom/print` has 2 B
  left; print shows a tree's levels by indent).
- **B-D8 Combinations:** with auto height (a row tall and gapped: both), with a tree and its pinned parents, with
  spans, with pinned rows, with client pages: yes. With master/detail: `unsupported-combination` in 1.2.0 (detail
  sets heights on the layout itself, fact 5; no use case named).
- **B-D9 Problems:** a rule that throws or answers a negative / non-finite number: no gap on that row, told once per
  rule (`invalid-gap`, a type-only code like `auto-height-large`, path `rowGaps.before`, detail `threw` / `not a
  size`); never the row's data.

### B.2 Core vs DOM
- **Core, new entry `@dzgrid/core/row-gaps`** (pure, no DOM): `gapLayout(inner: RowLayout, at: readonly number[],
  sizes: readonly number[]): RowLayout` — offsets = inner's + the gaps up to and including the row; `indexAt` by a
  binary search over the gaps then the inner's `indexAt`; `setHeight` passed to the inner; O(G) memory, O(log G)
  per call; and `gapsOf(rows, rule, ctx) → { at, sizes, problems }` (index 0 never; fillers asked with `row: null`).
  Est. 300–400 B over the core. (Not in `core/detail`: 38 B left; not in the base: 6 B left.)
- **DOM base, one seam:** `rowLayout()` (`render/viewport.ts:31-40`) wraps whatever layout it made with
  `g.gapsFor?.(d, layout)` and keys `g.laid` on it (the gaps feature stays outermost whatever the feature order, and
  auto height / details compose below it unchanged). Est. +20–30 B → ≈ 22 360 / 22 400.
- **DOM, new entry `@dzgrid/dom/row-gaps`**: the feature: asks the rule once per shown-rows version (memo), scales the
  size with `g.remPx`, sets `g.gapsFor`, composes `g.apart` with the tree's, writes `data-gap` / `--dzg-gap` on the
  mounted rows in `afterRows`, tells `invalid-gap` and the detail refusal. Est. 600–800 B.

## 1. Files touched
| File | Change |
|---|---|
| `packages/core/src/spans/map.ts` (+ `spans/index.ts` types) | `apart` input, per-column limits, memo key |
| `packages/core/src/tree/shape.ts` | `treeConflicts`: `spans` → `fullWidth` |
| `packages/core/src/row-gaps.ts`, `row-gaps/{layout,rule}.ts` (new) | `gapLayout`, `gapsOf` |
| `packages/core/src/problems.ts` | `GapProblemCode = 'invalid-gap'` (type only) |
| `packages/core/package.json`, `size-budget.json`, layering / public-api tests | the new entry, apart from the base |
| `packages/dom/src/context.ts` | `apart?`, `gapsFor?` (types) |
| `packages/dom/src/render/viewport.ts` | the gaps wrap in `rowLayout()` |
| `packages/dom/src/tree/index.ts` | refusal lifted, `apart` for the tree column, toggle found by class |
| `packages/dom/src/spans/{index,body}.ts` | `apart`, no full width under a tree, toggle-aware label, inset |
| `packages/dom/src/row-gaps.ts`, `row-gaps/index.ts` (new), `packages/dom/package.json` | the feature |
| `packages/angular` | nothing (features are plain objects); one example in the guide |
| `playground/arbre.html`, `.ts` (new) | a arbre-like screen: tree, merged label column, gaps, fr / ar |
| `docs/behaviors/*` | §2 |

## 2. Sheets first (`docs/behaviors/`, before any code)
`spans.md` new section « In a tree » (A-D1…D10, the posinset limit); `tree-view.md` (« Not with » rewritten: full-width
rows, details, browser pages), `tree-keys.md` (a merged cell in the tree column), `tree-sticky.md` (copies over a
run; the label under the copies; gaps), new `row-gaps.md` (B-D1…D9), `auto-height.md` (tall and gapped),
`print.md` and `csv-export.md` (one line each), `docs/a11y-protocol.md` §22 (listening: a merged cell in a treegrid
with NVDA, JAWS, VoiceOver, TalkBack; a gap is silent).

## 3. Tests FIRST (red before code; expectations by hand, never copied from output)
**Core (node)**
1. `packages/core/test/spans-tree.test.ts`: on a hand-built tree (roots A, B, C; A open with a1–a3; labels written
   out): siblings merge, a parent and its child never, a1–a3 merge, A+B+C merge when A is closed and split to [A],
   [B, C] when A opens; filler and loading rows cut; `apart` on the tree column keeps a parent alone and lets leaves
   merge; a `rowSpan` over a parent told `span-clipped` once; `apart` changing identity rebuilds, the same keeps the
   map.
2. `packages/core/test/spans-tree-property.test.ts`: 1 000 seeded trees, random opens and filters: every span's rows
   share one parent and one level, no span contains a row with shown children in the tree column, no overlap, one
   owner per place (the existing oracle extended with the sibling rule). **Planted fault**: the test runs once
   against a copy of the engine with the level check removed and must fail (as `purity.test.ts` checks itself).
3. `packages/core/test/row-gaps-layout.test.ts` and `-property.test.ts`: `gapLayout` over uniform, sparse and empty
   inner layouts against a brute-force oracle (prefix sums): `offsetOf`, `heightOf`, `total`, `indexAt` at every
   gap's first and last pixel and in rows; `setHeight` passed through; zero-size gaps; a gap at the last row.
   Planted fault: an oracle check against a layout that counts a row's own gap after it must fail.
4. `packages/core/test/row-gaps-rule.test.ts`: index 0 never asked; fillers get `row: null`; a throwing rule, `-1`,
   `NaN`, `Infinity`: no gap, one `invalid-gap` per rule, no row data in the problem.
5. Conformance: `conformance/cases/spans/tree-siblings-only.json`, `tree-open-splits.json`,
   `tree-column-leaves-only.json`, `gap-cuts-merge.json`; `conformance/cases/layout-rows/gaps-offsets.json`,
   `gaps-index-in-gap.json`, `gaps-with-tall-rows.json`; `tree/conflicts.json` rewritten (`fullWidth`, `detail`).
**DOM (jsdom: behaviour, never layout)**
6. `packages/dom/test/tree-spans.test.ts`: no `unsupported-combination` for spans; `aria-rowspan` on the first row's
   cell; covered places absent; every row keeps `aria-level` / `posinset` / `setsize` / `aria-expanded`; one toggle
   per tree-column cell across 5 paints (fact 3, red today by construction); Left on a merged leaf cell → the parent,
   **in `dir="rtl"` Right**; `*` opens the aimed row's siblings; Up / Down step over the cell; folding the parent of
   a focused merged cell → focus on the parent; full-width rule → one `unsupported-combination`, no `data-full`;
   grouped headers drawn in a treegrid; the travelling label's top includes the inset (`--dzg-header-h` written with
   `g.inset`).
7. `packages/dom/test/tree-spans-edit.test.ts`: F2 on a tall cell edits the first row (first written against the
   flat grid, to pin today's behaviour); copy of a block over a merged run gives the value on each row; fill over it;
   a click on a covered row selects that row.
8. `packages/dom/test/row-gaps.test.ts`: the row after a gap gets `data-gap` and `--dzg-gap`; no element added to the
   layer; `aria-rowcount` unchanged; Down from the row above a gap lands on the row below; sort and filter move the
   gaps with the rule; folding keeps a root's gap; index 0 and pinned bands never; `size` follows the text zoom
   (`remPx` 32 → twice); feature order (`autoHeight()` before or after `rowGaps()`) gives the same `g.layout.total`;
   detail beside it → one `unsupported-combination`; a merged run cut by a gap; CSV and the clipboard have no empty
   line; RTL: same offsets.
9. `packages/dom/test/row-gaps-walk.test.ts`: seeded scrolls / opens / sorts over 10 000 rows with gaps and pinned
   parents: the focused row always mounted, `scrollTop` → top row consistent with the oracle.
10. Sizes: `packages/core/test/layering.test.ts` (the new entry apart; the base guard unchanged), `public-api.test.ts`
    (new names), `size-budget.json` lines asserted by the existing size test.

## 4. Real-Chrome checks (`scripts/browser.mjs`, new `--only tree-spans` and `--only row-gaps`; Firefox and WebKit
for the layout ones)
- Merged label column in `playground/arbre.html`: the tall cell ends exactly at its last row (≤ 1 px), the
  label centred then travelling **below the pinned parents** (screenshot at 3 scroll tops), toggles not duplicated,
  open / close inside a run splits and joins without a jump of the top row, fr and ar, light and dark, forced colours,
  axe 0 (treegrid with `aria-rowspan`), Chrome's accessibility tree showing the span.
- Gaps: rows and gaps where the layout says (each row's `getBoundingClientRect().top` vs `offsetOf`, 0 px drift at
  10 000 rows and at 1 000 000 rows under scaled scrolling, three engines); a click in a gap selects nothing; the fill
  handle and a block drag across a gap; the block's frame across a gap (screenshot, owner looks); pinned parents
  pushed at a gap (screenshot); motion (sort glide) with gaps; auto height + gaps.
- `--only tree`, `spans`, `groups`, `auto-height`, `pinned-rows`, `playground` as regression.

## 5. Sizes (gz; estimates, measured at the end, never asserted)
| Entry | Now / line | After (est.) | Need |
|---|---|---|---|
| `@dzgrid/core/spans` | 3 749 / 3 800 | 3 790–3 810 | maybe 3 850 (Q15-9) |
| `@dzgrid/core/tree` | 3 414 / 3 500 | ≈ 3 414 | — |
| `@dzgrid/core/row-gaps` (new) | — | 300–400 | line 450 (Q15-9) |
| `@dzgrid/dom` base | 22 334 / 22 400 | 22 355–22 365 | — (fits; 35–45 B left after) |
| `@dzgrid/dom/tree` | 3 821 / 3 850 | 3 840–3 860 | 3 900 (Q15-9) |
| `@dzgrid/dom/spans` | 4 577 / 5 050 | 4 620–4 640 | — |
| `@dzgrid/dom/row-gaps` (new) | — | 600–800 | line 900 (Q15-9) |
| core base, K.8, Angular, theme, print | | +0 | — |
Stop rule: past a line, stop and ask; never raise a line alone.

## 6. Order of work and effort
0. Measure (`node scripts/size.mjs`), the owner's answers into `decisions.md`, sheets (§2). — 0.5 session
1. Core: tests 1, 2, 5 (spans) red → `apart`, `treeConflicts`. — 0.5
2. DOM tree + spans: tests 6, 7 red → refusal lifted, toggle, inset, full width. — 1
3. Browser checks of Part A on `arbre.html` (the page built here with its merged column). — 0.5–1
4. Core gaps: tests 3, 4, 5 (layout) red → `@dzgrid/core/row-gaps`. — 0.5
5. DOM gaps: tests 8, 9 red → base seam, `@dzgrid/dom/row-gaps`, gaps cut merges. — 1
6. Browser checks of Part B (three engines), screenshots for the owner. — 0.5–1
7. Docs (sheets' « Done », ROADMAP ticks, CHANGELOG `1.2.0` unreleased, STATUS), one combined review with mutants on
   `core/spans` (new lines) and `core/row-gaps`, gate (`test:ci`, `test:tz`, `typecheck`, `build`, `check:size`,
   `check:contrast`). — 1
**Total: 6–7 working sessions.** Part A is the riskier half (four seams meet in one cell: tree decoration, span
label, pinned parents, keys); Part B is mostly new, isolated code plus one base seam.

## 7. Risks
- The toggle / label clash (fact 3) and feature order (`tree()` before or after `spans()`): both orders tested.
- `aria-posinset` read from the first row while aiming lower (A-D4): only listening tells how bad it is.
- Rebuild cost: a tree open makes a new shown order, so the span map (O(n), text read per merging column) is rebuilt
  per open; at 100 000 shown rows the « expand 10 000 children ≤ 30 ms » line may not hold with a merge column. A new
  perf line (`perf/budgets.json`: open in a 100 000-row tree with one merge column) measured at step 3; if over, an
  incremental map is a later step, not this one.
- The gaps seam must stay outermost: auto height rebuilds its own sparse layout (fact 5); the order test guards it.
- Pinned parents pushed off by the box of the next root, so a copy hangs over the gap until the next category
  arrives: looked at in Chrome; changed only if the owner dislikes it.
- `tree/conflicts.json` and the existing « tree refuses spans » tests flip on purpose (owner decision cited in each).
- An app that passed `spans()` beside `tree()` and ignored the warning now sees merges (CHANGELOG upgrade note).

## 8. Owner questions (simple French)
**Q15-1 — Quelles lignes une cellule fusionnée peut couvrir dans un arbre.**
- A (recommandé) : seulement des lignes sœurs qui se suivent (même parent, même niveau). On recalcule sur ce qui est
  affiché : ouvrir un parent au milieu coupe la fusion en deux, le refermer la recolle. Une fusion n'est jamais à
  moitié repliée. C'est déjà la règle du moteur, peu de travail.
- B : pareil, mais une ligne qui a des enfants reste toujours seule (rien ne bouge quand on ouvre ou ferme).
- C : aussi un parent avec ses enfants ouverts. Plus de travail, et un lecteur d'écran s'y perd (une cellule à
  cheval sur deux niveaux). Pour trancher : pouvez-vous me dire (ou montrer) quelles lignes la colonne libellé de
  arbre fusionne : des lignes du même niveau, ou un parent avec ses enfants ?
**Q15-2 — La colonne de l'arbre (celle du chevron) peut-elle fusionner ?**
- A (recommandé) : oui, mais seulement entre lignes sans enfants ; un parent garde sa cellule à lui, avec son
  chevron et ses touches.
- B : jamais ; on fusionne seulement dans les autres colonnes.
**Q15-3 — Lecteur d'écran sur une cellule fusionnée.** Sur une ligne couverte, le focus est sur la grande cellule,
donc le lecteur dit la place de la première ligne (« 1 sur 5 ») même si on vise la troisième.
- A (recommandé) : comme dans les grilles plates aujourd'hui ; vous écoutez (protocole §22) ; si la valeur se perd,
  on ajoute une copie invisible pour le lecteur.
- B : la copie invisible tout de suite (plus d'octets, et le lecteur répète la valeur sur chaque ligne).
**Q15-4 — En-têtes groupés dans un arbre.** Enlever le refus apporte aussi les groupes d'en-têtes (et les groupes
repliables) aux arbres. A (recommandé) : oui. B : non, seulement les fusions de lignes.
**Q15-5 — Lignes pleine largeur dans un arbre.** A (recommandé) : toujours refusées (une ligne d'arbre a son chevron
et son niveau ; une ligne pleine largeur les cacherait). B : autorisées, à planifier à part.
**Q15-6 — Comment on demande l'espace entre catégories.**
- A (recommandé) : une fonction à part, `rowGaps({ before: roots })` (`roots` = avant chaque ligne du premier
  niveau ; ou votre propre règle sur les données de la ligne). Marche aussi sans arbre.
- B : une option de `tree()`. Moins général, et `dom/tree` n'a que 29 octets de marge.
**Q15-7 — Taille et apparence de l'espace.**
- A (recommandé) : 16 px à la taille de texte normale (grandit avec le zoom du texte comme les lignes), une règle
  peut donner une taille par ligne ; l'espace est vide (fond de la grille) ; la ligne d'après porte `data-gap` pour
  qu'un thème y dessine un trait s'il veut.
- B : la taille dans une variable CSS (il faudrait la relire à chaque dessin : plus lent, plus d'octets).
**Q15-8 — Où l'espace apparaît.** A (recommandé) : jamais au-dessus de la première ligne affichée (ni des lignes
épinglées) ; gardé quand on replie une catégorie (sa ligne de tête reste affichée) ; jamais exporté ; pas imprimé en
1.2.0. B : imprimé aussi (l'impression est à 2 octets de sa limite : il faudrait la monter).
**Q15-9 — Les octets.** A (recommandé) : nouvelles lignes `@dzgrid/core/row-gaps` 450 et `@dzgrid/dom/row-gaps` 900
(une grille sans espace ne paie rien) ; `dom/tree` 3 850 → 3 900 ; `core/spans` 3 800 → 3 850 seulement si la mesure
le demande. Le socle DOM tient dans ses 22 400 ; le cœur, K.8 et Angular ne bougent pas. B : rien de monté ; alors
la colonne de l'arbre ne fusionne pas (Q15-2 B) et l'espace attend.

## Owner input (2026-10-29)

- Q15-1: **siblings under the same parent** — confirmed by the owner, for **row spans and column spans** alike. The plan
  must cover `colSpan` (and `merge` across columns) in a tree too: a column span stays inside one row, so it never
  crosses a parent / child boundary; check it against the tree column (chevron + indent) — a column span starting at
  or covering the tree column is the open case (proposed: refused with `invalid-span`, the cell drawn unmerged).
- The screen is three tables in one tree, each led by an always-open top-level node without chevron (step 14,
  `fixedOpen`); the gap goes before each of those nodes but the first — `rowGaps({ before: roots })` (Q15-6 A) fits.

## Done (2026-10-29)

Built in the plan's order, not committed. Sheets first (`spans.md` « In a tree », new `row-gaps.md`, `tree-view.md`,
`tree-keys.md`, `tree-sticky.md`, `auto-height.md`, `print.md`, `csv-export.md`, `a11y-protocol.md` §22). Tests first,
red then green: core `spans-tree{,-property}` (1 000 seeded trees; planted fault: the engine without its level check
fails the oracle), `row-gaps-{layout,property,rule}` (planted fault: a layout putting a row's gap after it fails the
oracle); conformance `spans/tree-{siblings-only,open-splits,column-leaves-only,colspan-refused}.json`,
`spans/gap-cuts-merge.json`, `layout-rows/gaps-{offsets,index-in-gap,with-tall-rows}.json`, `tree/conflicts.json`
rewritten; DOM `tree-spans` (LTR and RTL keys, both feature orders, the export), `row-gaps`, `row-gaps-walk` (3 seeds
over 10 100 rows). Mutants planted by hand in `core/spans`, `core/row-gaps`, `dom/spans`, `dom/tree`, `dom/row-gaps` and
the base seam: all killed but one (`delete g.laid` at the gaps' setup: redundant, removed). Browser (own Vite, never
:4700): `--only tree-spans` and `--only row-gaps` on `playground/arbre.html`, Chrome, Firefox, WebKit, green; `--only
tree`, `auto-height`, `groups`, `pinned-rows` as regression, green. Not done here: the fill handle and a block drag
across a gap, motion with gaps, auto height + gaps in a browser (covered in jsdom only); the listening (§22). Sizes and
lead decisions: `decisions.md` « Step 15 built ».
