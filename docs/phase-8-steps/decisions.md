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
- **Not done in steps 1–4** (step 5): edits on a block list (`setReader` / `reapply`), the « next frame » flush of async
  transactions, `range-not-loaded`, exports' `displayed` note, the find bar's « lignes chargées » wording (it keeps the
  server pages' note).

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


## Owner, 2026-11-05

- The loading row without a parent: `BlockLoadingNode` added to `RowNode` (A); `LoadingNode` unchanged.
