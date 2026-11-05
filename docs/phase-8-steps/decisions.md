# Phase 8 (infinite scroll, server-side row model): decisions

The owner's answers (2026-11-05, « ★ everywhere in §5, sizes OK »): `questions.md`. They win over `docs/phase-8-plan.md`.
Below: what the lead took alone while applying them (steps 1–4), and the measures.

## Decisions taken alone (steps 1–4)
- **A block's place is a node of its own**: `BlockLoadingNode { kind: 'loading', key: 'l:#' + position, parent: null }`,
  a new member of `RowNode`, instead of the plan's `LoadingNode.parent: RowKey | null` — `check:api` flagged that one as
  a change of an existing export; a union member added is an addition by the API rule. The lazy tree's `LoadingNode` is
  unchanged. (A consumer narrowing on `kind === 'loading'` now sees `parent: RowKey | null`: three of our own lazy-tree tests needed a `node.parent` check to compile — a typed consumer may too. The owner decides: keep, or accept the plan's `LoadingNode` change with `scripts/api.mjs --accept`.)
- **Channels forgotten**: one gate channel per block (`block:<n>`, ARCH l. 1223), but a list of 10⁵ blocks must not keep
  10⁵ channels: the gate gains an optional `forget(channel)` (drops a channel nothing waits on; a late answer to it is
  then dropped as `superseded`). Called after each block's answer or abort. `core/server` +14 B.
- **Timers come from the DOM**: the core has no clock. `ModelEnv.timer?` (types only); the DOM base passes
  `scope.timeout`. Without one (the core alone) nothing waits: no rest rule, async transactions applied at once.
- **Order of asking**: the focused row's block first, then the window in the scroll's direction, then `ahead`. Ctrl+End
  then asks the last row's block before its neighbour (the exit criterion's « row 10⁷ shown one frame after its block »).
- **Cancellation**: with two blocks or more waiting, the requests running out of the window are aborted, farthest first,
  as many as wait (the plan's « unless 2 newer ones wait »; one at a time left a thumb drag waiting on old blocks).
- **Retry = refresh**: a failed row's Retry and Enter dispatch `rows.refresh` (the window asked again, failed blocks
  included, `announce.loading`), sharing the overlay's button code (`retryButton`). One button per run of failed rows
  shown (the first failed row mounted), `.dzg-retry`, out of the Tab order.
- **Failures**: a block failing while scrolling is its rows' only (`status` stays idle, no `fetchFailed`, nothing said;
  counted in `diagnostics.blocks.failed`). The first block of an epoch, or a refresh's block, failing is the model's
  error (overlay, `fetchFailed`). A failed block that leaves the window is forgotten (asked again when shown).
- **Duplicate ids**: the newer answer wins the key; the older block is let go and asked again once when shown; the second
  time in the epoch it fails (a server sending one id twice would otherwise be asked forever). `duplicate-row-id`
  (warning); a row without an id fails its place (`invalid-row-id`).
- **The end**: a short block or `hasNext: false` ends the list there, whatever a total said; an answer with neither
  `total` nor `hasNext` is read as pages read it and warned (`invalid-page-response`, `response.hasNext`).
- **Block answers are `rows` changes**; the first answer of an epoch a `query` change (the DOM scrolls to the top on a
  block list's `query`). The DOM's « the end stays the end » anchoring is off on a block list: it would chain-load an
  unknown end.
- **Operations** are read without `resolveOperations` (its « unsaid follows page » would put a `page: 'off'` list's sort in
  the browser): anything placed in the browser is refused (`invalid-operations`, detail `blocks`), `page` reads `off`.
- **Shapes** given beside blocks (tree, details, groups) are refused by the model (`unsupported-combination`, path
  `shape`, detail the kind). Row gaps and cells spanning rows are refused by their features (detail `blocks`); header
  groups alone stay (the span map walks no row without a span rule).
- **Conformance**: one new suite `block-cache` (runner `conformance/runner/suites/blocks.ts`) holds both the plan's
  « block-cache » and « source-model/blocks-* » cases (19 cases); `server-gate` gains 7 `blocks-*` cases and the
  `forget` op.
- **The view is immutable per version** (a snapshot of the blocks held, its key index built on first use): the kernel's
  focus fallback reads the old view after the model moved.
- **Not done in steps 1–4**: done at step 5 (edits, the frame, rows not loaded, exports' `displayed` count) but the find
  bar's « lignes chargées » wording (it keeps the server pages' note).

## Review (code review + test analysis, step 4)
- **Fixed**: a block a refresh waited for, let go without a request ended (left the window while waiting, dropped by an
  end or a duplicate), kept the model `loading` forever — the commit now forgets such blocks (test « review 1 », shown to
  fail without the fix). A first block that failed and was answered later outside Retry left the status `error` — an
  accepted answer with nothing else awaited ends it (« review 2 »).
- **Left, noted**: a refresh answering `hasNext` without a total after an earlier total keeps the older length until a
  short block or a total says otherwise.
- Mutation checks: the permutation test fails at seed 1 when stale answers are let through; walks-bounded fails without
  `held`.

## Measures (minified, gzip; node 24, system Chrome headless, this machine)
- **Sizes**: core base 29 258 / 29 300 (+56: the walks bounded, `rows-not-loaded`, the shared server helpers; plan
  29 300); `core/server` 6 151 / 6 200 (`forget` +14); **`core/infinite` 7 867, line 8 580 (new entry, measure + 10 %;
  the plan estimated 2 600–3 400: the wire form, the gate and the value lists come with it — it is 4 273 over
  `core/server`)**; dom base 23 637 / 23 660 (+355 over 23 282; plan asked 23 500, +2 % rule allows 23 755); theme
  2 913 / 2 960; `core/csv` 2 072 / 2 080; `dom/print` 1 642 / 1 664; `core/spans` 4 030 / 4 050 (noise); export run
  (lazy) 5 382 / 5 450; K.8 89 882 / 90 000 (118 B left); Angular 7 803 unchanged.
- **Node (perf/budgets.json)**: 10 000 seeded windows over 10⁷ rows, held ≤ maxBlocks checked at every step: 175.7 ms
  (line 193.5); nodeAt over a 60-row window 0.001 ms (plan ≤ 0.05; 10 000 windows 10.5 ms, line 12); purge on a sort
  with 20 held and 2 running: 0.1 ms, 0 blocks left, block 0 asked in the same call, 0 old answers applied (line 1);
  heap after 10 000 windows less the rows held 399–439 kB (line 1 MiB).
- **Permutations**: 1 000 seeded scripts (windows, jumps, sorts, searches, refreshes, purges, the rest timer, answers in
  any order, 8 % failures): 0 row of an old query or another place shown; blocks held bounded.
- **Chrome** (`node scripts/browser-infinite.mjs`): Ctrl+End to row 10 000 000 shown 1 frame after its block answers;
  wheel at 3 000 px/s over held blocks (6 030 px in 2 s) median 59.9 fps, p95 16.7 ms, 0 requests; thumb drag top to
  bottom (1 s) asked 1 block; blocks held ≤ 20 at every frame; axe 0 fr / ar with loading rows and a failed block.
- **Firefox, WebKit, Chrome**: row 10 000 000 reached with its data, 0 px from the bottom; back at the top 0 px; with an
  unknown total each Ctrl+End goes further (300 → 400 → 500 → 600), `aria-rowcount` -1.


## Decisions taken alone (steps 5–7)
- **The frame** (step 5): `ModelEnv.frame?` (types); the DOM base passes `requestAnimationFrame` (+11 B, base 23 648 /
  23 660). The async batch lands at the frame or at `batchMs`, the first cancels the other; its change carries
  `transaction.updated` (every key of the batch, for fresh-rows).
- **Edits on blocks** (step 5): `setReader` marks the order stale when a column the server sorts, filters or searches by is
  touched; `reapply` = the refresh of the window, told as `order`; the first answer asked after the edit ends the mark.
- **One code for rows not loaded**: `rows-not-loaded` (the selection's reason since step 4) is also the `Problem` of a copy,
  cut, paste or Delete refused (path `range`, detail `rows`); the sheet's `range-not-loaded` renamed. Its sentence
  `range.notLoaded` is optional in a bundle (`RangeLoadKey`), required by `range()` beside a block list only.
- **The status bar** shows the figures of the rows held, said partial (as a lazy tree's loading rows), not refused; **the
  fill** takes no source nor target over rows not loaded (nothing filled, no sentence: the bytes of `fill` are at its line).
- **Bounded block walks**: `@dzgrid/core/range` `boxHeld` (exported) and an internal `boxAt`; `boxRows`, the figures and the
  plans read the rows held (Ctrl+A on 10⁷ rows: its size said in ms).
- **The server-side model** (step 6): one module `server/server-side.ts`, the block store shared (`take(order, keep, near)`
  added: blocks that are not one run); block ids = level × 2²¹ + block. Group keys take the **value's own type tag**
  (`typeof` initial + value), so `1` / `'1'` and a day / an instant are two groups whatever the column; labels the column's
  format (text). An open group not answered shows one `LoadingNode` (`l:` + its key, the lazy tree's); unheld places of a
  level are `BlockLoadingNode`s. The group rows above every level shown are pinned (their levels hang from them).
  `expandAll(true)` opens the groups held, never a request by itself; past the first level it is told
  (`unsupported-combination`, path `expandAll`, detail `server`). Grouped, `counts.filtered` is null (`aria-rowcount` -1).
  The DOM grouping's shape hands its `by` and options (`GroupShape.options`, added): the first request is grouped already.
  `ServerSideModel.group` (the export's `server.group`). Transactions and edits on a server-side grid: not built (not asked).
- **Step 7**: the grouping adapts to the model (`setBy`, `reads`, `totals`); totals from a server coerced by the column; the
  « développé, n lignes » sentence waits for the group's loading row to go. A state restored before the grouping's setup
  hands `rowGroups` to the model inside its hold (`@dzgrid/dom/state`, +2 %): one request in either order of the features.
- **Seen in Chrome**: an in-row Retry running over the next empty cells could not be clicked (the cells beside took the
  click): `.dzg-retry` raised (`position: relative; z-index: 1`, theme +5 B). It touched the step-4 rows too.

## Review (steps 5–7)
- Fixed: a `groups` entry that is no record (`null`) threw (review 1, test). Tests added for a stale answer after `setBy`, a
  level's total shrinking, duplicate ids across a level's blocks.
- Left, noted: a level whose end was found does not grow again on a later full block without a total (as `infiniteRows`);
  levels of closed groups are kept for the epoch (reopening is instant); a group whose first block failed is never said
  « développé » (it did not open).

## Measures (steps 5–7)
- Sizes: `core/server-side` **10 241, line 11 265** (new entry, measure + 10 %; plan 3 800–5 000); `core/infinite` 8 071 /
  8 580; `core/range` 3 260 / 3 264, `dom/fill` 3 226 / 3 264, `dom/state` 1 244 / 1 264 (+2 %); `dom/grouping` 4 782 / 5 100;
  export run 5 396 / 5 450; theme 2 918 / 2 960; dom base 23 648 / 23 660; K.8 89 894 / 90 000. **Beyond the rule:
  `locales/ar-range` 535 (line 500, +7 %)** — the shortest correct sentence is 519: the owner decides (the line is set at
  535 pending his answer).
- Node: async batch of 100 updates on 2 000 rows held 0.1 ms (one change, line 4); server-side flatten (1 000 groups, 50
  open) 0.0–0.1 ms (line 2); a 10⁶-row group's first block 0.0 ms (line 30); 1 000 windows through it 85 ms (line 94),
  blocks held ≤ maxBlocks + the group row above.
- Browsers: `node scripts/browser-server-groups.mjs --engine all` 30/30 (Chrome fr/ar: treegrid, counts and totals as
  sent, groups opened and closed while loading — reopened with no new request, the sentence once loaded, a shop's rows at
  level 3, a failed level with Retry by the mouse, axe 0; Firefox, WebKit, Chrome: arrows mirrored right to left);
  `browser-infinite.mjs` 18/18 again.

- Gate: test:ci, test:tz, typecheck, build, check:size green; **check:api flags four existing exports as changed** — the
  optional `range.notLoaded` key added to `RangeMessages` and the new key in `EN_RANGE` / `FR_RANGE` / `AR_RANGE` (additions
  the guard cannot read as such, as `GridEvent` at Phase 7). Not accepted: the owner's (`scripts/api.mjs --accept`).

## Owner, 2026-11-05

- The loading row without a parent: `BlockLoadingNode` added to `RowNode` (A); `LoadingNode` unchanged.

## Owner, 2026-11-05 (steps 5–7)

- `locales/ar-range` line 500 → 535 (« 1 oui »).
- `RangeMessages`, `EN_RANGE`, `FR_RANGE`, `AR_RANGE` gain the optional `range.notLoaded`: accepted in api/ (« 2 oui »).
