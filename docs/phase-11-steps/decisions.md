# Phase 11 (hardening and ecosystem): decisions

The owner's answers (2026-11-08, « ★ partout »): `questions.md`. They win over `docs/phase-11-plan.md`. Below: what the
lead took alone while applying them, and the measures, lot by lot.

## L1 — leftovers and small debts (2026-11-08)

Scope: the plan's R-list items that cost no K.8 byte. Each fix: the sheet amended, a test written by hand that failed
first, then the fix. R3, R4, R9, R10 wait for L2 (K.8).

- **R1 — `planPaste` on a list loaded in blocks** (`core/range`). Taken alone: *bounded*, not refused — both loops walk
  `boxAt` (the rows held, as `boxRows` / the figures already do); a loading row counts for nothing, as in any plan, so
  the plan is the one it was, minus the walk. A refusal would need a new field on `PastePlan` (public type) for a case
  the DOM never reaches (it refuses with `rows-not-loaded` before planning). Test `walks-bounded.test.ts` (Ctrl+A bulk
  edit, a paste running past the rows held): 15 000 300 calls before, under 10⁴ after. Sheet `range-selection.md`.
  Mutants by hand: each loop put back alone fails the test.
- **R2 — `*` in the group column** (`dom/grouping`). One walk of `positions(d)` (the rows held on a server, every row
  in the browser): a row of a lower level before the focused one starts the run again, one after it ends it. Test
  `grouping-server.test.ts` (an open group of 10⁶ rows, 10 held): 2 000 057 reads before, under 10³ after; a two-level
  test in `grouping.test.ts` (own parent only, no cousin, no deeper group). Mutants by hand (no break, no reset,
  `>=` level): all three killed. Sheet `row-grouping.md` 10.
- **R5 — the dock.** Fixed: a panel cleanup that throws is reported (`reportError`), the next ones run. Checked, not
  a bug: an open « Placer … » menu already closes when the grid goes (the menu list lives in the grid's scope); the
  new test pins it. Kept on purpose, written in `dock.md` « API »: a `dock` part restored before the dock exists tells
  its problems in an event (the dock is a feature, set up after the state's restore can run); a state read before the
  first paint may lack the features' panels (collected at the first paint).
- **R6 — `aria-setsize` −1 in the DOM.** Test in `grouping-server.test.ts` (a full block with `hasNext`, no total:
  leaves `-1`, the group `2`); a mutant (`Math.abs`) fails it. Left: scroll gestures in the DOM permutations
  (`perf/permutation.ts`) — a long run, against « travailler doucement »; for L3 (the 4× pass), which runs them anyway.
- **R7 / R8 — kept on purpose**, a sheet line each: `infinite-scroll.md` « The end » and `server-side-groups.md` (a known
  end or total is not moved by `hasNext` without a total); `row-grouping.md` 4 (« Alger » → « alger » is not a sort move,
  the grouping's own check regroups). No test showed a wrong count the user sees that a later short block or total does
  not fix.
- **R11 — docs.** ARCHITECTURE §5.2: the audit profile's row says the line in force (90 000, measured 89 978) and the
  table says `size-budget.json` holds the lines in force; §8: `docs:api` replaced by `check:api` (never built; a readable
  API reference comes with the site). `test-casts-baseline.json`: 850 → 840 (`core/test/csv/rows.test.ts`, its ten
  casts removed by typing its helper on `DisplayedRows`); the others need a comment each, left for when a file is touched.

### Measures (L1)
- `core/range` 3 260 → **3 265** over the core: its line raised +2 % to **3 329** (the plan's figure for R1; pinned in
  `layering.test.ts` and `rebudget.test.ts`). `dom/grouping` 4 973 → 4 966 (line 5 100). `dom/dock` 4 241 (line 4 600).
- K.8 **89 978 / 90 000, unchanged**; the core and DOM bases unchanged (no byte of L1 is in them).
- `check:api`: nothing removed or narrowed, nothing added.
- Gate: `gate:step` green (8 943 tests; test:tz, typecheck, build, check:size, check:api). Run three times: the first
  found `core/range` 1 B over its old line, the second the line's two pins in the scripts' tests.
