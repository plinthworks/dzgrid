# DzGrid — roadmap

The plan is `ARCHITECTURE.md`. This file records what is done, what is next,
and what the spikes found.

## Phase 0 — scaffolding and spikes (done, 2026-10-16)

### Done
- Repository, clean-room rules (`CLEANROOM.md`), architecture with the owner's
  decisions K.1–K.14 (2026-10-16).
- Workspace: vitest projects (core and conformance in node), strict tsconfigs
  (core on lib ES2023, no DOM), build script refusing `src/` entry points and
  runtime dependencies, Vite config for the playground on port 4700.
- `@dzgrid/core` seed: `ids` (`RowKey`, `DisplayIndex`, `assignKeys`),
  `problems`, `value/day` (civil arithmetic without `Date`), `value/instant`
  (offset required, `ambiguous-instant` otherwise), `value/zone-day`
  (`zoneDayBounds` on `Intl` only).
- `purity.test.ts`: no `Date`, Temporal, clock, randomness, DOM global or
  package import in the core; checks itself against planted violations.
  Verified to fail on a planted `new Date()`.
- Conformance: `zone-day-bounds` (14 hand-written cases: Paris, Dublin, Los
  Angeles, Auckland clock changes, São Paulo 2018 and Havana days without a
  midnight, Samoa's skipped 2011-12-30, Lord Howe's half hour, Kolkata,
  Algiers, UTC), `day-arith`, `row-key`. 71 tests, green in UTC, Auckland and
  Los Angeles.
- Phase-end reviews (architect + code) done; their findings fixed, each with
  a test that failed first: instants beyond ±8.64e15 ms refused (they made
  every formatter throw later), a missing zone no longer read as the machine
  zone, sparse id lists keep one slot per row, `addDays`/`epochDayToDay` give
  null past 0000–9999 instead of throwing, fractional negative instants on the
  right day, `pinnedKey` validated, milliseconds parsed as digits.
- `purity.test.ts` rewritten on TypeScript's scanner: catches `Date()`,
  `const D = Date`, `globalThis.Date`, `self.document`, `import()`, `require`,
  code hidden after `//` in a string; 23 planted violations, all caught.
- A property test runs every day of 2010–2030 in 12 zones under `test:tz`.
- Conformance runner prints milliseconds (a bound half a second off can no
  longer pass), checks every case against the schema and refuses empty suites.
- Playground on 4700 (`playground/index.html`); `check:size` (core 2.2 kB gz),
  `bench` on a minified bundle with `perf/budgets.json`, `check:contrast` stub
  until the theme; README, CHANGELOG, `docs/a11y-protocol.md`.
- The spike server survives malformed requests (400), never redirects off
  host, reports a TypeScript error as 500; tested in a `tools` project.
- 99 tests, green in UTC, Auckland and Los Angeles.

### Spikes

Numbers: M4 Max, headless. The sequential re-run (`npm run spike`, one
browser at a time, 2026-10-16) passed all eleven spikes and confirmed every
decision below; its raw numbers are in `spikes/<id>/results/result.json`.
Still to measure on a mid-range laptop, headed, at 120 Hz (K.8 targets that
machine, not this one). Details in each `spikes/<id>/README.md`.

| # | Question | Result | Decision |
|---|---|---|---|
| S1 | 1M rows, recycled DOM | 60 fps in Chrome, Firefox, WebKit; row 999 999 reachable, 0 px error; height caps 33.5 M px (Chrome, WebKit) and 17.9 M px (Firefox, collapses to 0 above); WebKit wraps a huge `scrollTop` to 0; float precision breaks above 2²² px | No row cap, no pagination imposed, no canvas; `maxPhysical` 4 M px; scroll-range mapper; clamp before writing `scrollTop` |
| S2 | RTL + sticky pinned, 3 engines | Pinned sides and header/body alignment 0 px off in all three; `scrollLeft` 0 → −max everywhere; `scrollIntoView` needs `scroll-padding`; scrollbar side in Firefox headed only | One scroll container, no fallback; bidi: flex cell + `plaintext` span in free-text columns (owner, 2026-10-16) |
| S3 | Auto row height | 0 px jump at 10 000 rows in all three; Firefox ≤ 1.5 px at 100 000; 365–508 px without correction | Free up to 10 000 rows, a developer warning above; batched read in rAF |
| S4 | Screen readers, virtualised grid — **structure only; readers pending** | axe 0 violations ×3 engines, fr and ar; macOS AX tree reports row 5001 of 10001 with headers; 3 structure fixes | Exact `aria-rowindex` + retained row + polite live region; manual protocol in `spikes/s4-a11y/protocol.md` |
| S5 | Intl | Sort 100 000 strings 77–212 ms; Safari defaults `ar-SA` to Umm al-Qura; `zoneDayBounds` identical in 4 engines over 92 040 bounds | Rank keys for text sort; always `calendar` and `numberingSystem` |
| S6 | Angular templates in cells | ~5 µs per pooled re-bound cell (25 µs at CPU ×4); fresh views 2× | Pooled views, `detectChanges` per view; ≤ ~3 templated columns advised |
| S7 | Clipboard | Keyboard copy/paste needs no permission ×3; TSV codec 0 failures in 20 000 round trips | `text/plain` first; listeners on `document`; no `execCommand` |
| S8 | Hand-written XLSX | Valid zip and XML; 0 wrong cells of 100 010; 10 000 × 10 in 62–102 ms, 607 kB | Keep deflate, stored as fallback; Excel opened by hand pending |
| S9 | Composition | Recycling 2.4–3.5× faster than rebuilding; `contain: strict` −10–26 % in Chrome; `content-visibility` +17–27 % | Recycled rows in DOM order, `contain: strict`, rows in `inset-block-start` (owner, 2026-10-16) |
| S10 | Focus against recycling | With the retained row: focus, editor text and caret survive scroll, sort, update in all three; without it Firefox and WebKit lose focus silently | Retained-row contract in ARCHITECTURE.md (Phase 0 adjustments) |

### Left to the owner (by hand)
- Open `spikes/s8-xlsx/results/sample-rtl.xlsx` in Excel (and Numbers): values, dates, Arabic, right-to-left sheet.
- Screen readers per `spikes/s4-a11y/protocol.md` (NVDA, JAWS, VoiceOver, TalkBack; fr and ar).
- Firefox's vertical scrollbar side in RTL, with classic scrollbars.
- Real wheel, trackpad and touch scrolling; a mid-range laptop; Safari itself.
- Before Phase 4: Enter in an editor (stay or move down); an edited row that disappears (commit or cancel).

## Phase 2 — read-only DOM, theme, RTL, accessibility (in progress)

Plan: `docs/phase-2-plan.md`; decisions D1–D14 validated 2026-10-16.

- [x] step 0 spike S11 (above)
- [x] step 1 behaviour sheets
- [x] step 2 keyboard intents in the core (45 cases)
- [x] step 3 kernel: sort toggle, selection, anchor, focus fallback (suites `sort-toggle`, `focus-fallback`).
  **Size budget raised** (decision): the kernel lives in the core (D2), 19.5 kB gz measured,
  budget 21.5 kB (+10 %), K.8's 28 kB untouched.

### Settled before Phase 2 by spike S11 (2026-10-16, 346 checks, three engines)
- **Retained row in scaled mode**: at its true distance from the visible rows
  (bounded to ±2·REBASE), with `overflow: clip` on the body so it never grows
  the scroll range; a native scroll right after a focus or key event is redone
  logically. Focus, editor text and caret survive (D4). The "physical image"
  placement was rejected after review: near the window it covers visible rows.
- **Keys** intercepted at the viewport; **touch** mapped relatively (Chrome
  measured: 601 px for 600, fling kept); scrollbar drag absolute (D5).
- **`contain: strict` breaks sticky pinned columns in Firefox** (its `size`
  part): rows take `contain: content`, same gain per S9.
- Still open: scrollbar drag and touch on real devices (owner); auto height in
  scaled mode (when auto height comes, problem `autoheight-scaled` meanwhile).

### Exit criteria (Phase 0)
- [x] the ten questions have measured answers (sequential re-run passed)
- [x] K.1–K.9 decided
- [x] `npm test` and `npm run typecheck` green
- [x] `npm run build` produces `dist/`
- [x] `purity.test.ts` fails on a planted `new Date()`
- [x] architect review and code review of the phase, findings fixed

## Phase 1 — data core (done, 2026-10-17)

### Done (2026-10-16/17), each step tests first
1. Offset-less date-times read only in a named zone; `resolveWall` with Temporal's policies, warnings on every choice.
2. Thirteen behaviour sheets before code.
3. Foundations: full `ProblemCode` list, canonical ids, the type test (a number is never a `DisplayIndex`), dataset A, bench with untimed setup and memory.
4. Locale context (always Gregorian, digits stated), `readNumber` (no guessing), cached formatters.
5. Codecs: text, number, boolean (fr/en/ar), enum, day (locale order, four-digit year, no swap), instant (typed wall times in a clock change refused).
6. Columns: definitions checked into problems, user state kept by id, flex in whole pixels; `PrefixSums` (Fenwick).
7. Row store: parallel arrays, immutable generations, transactions with per-entry problems; displayed rows mint positions only through `index()`.
8. Sort with a per-column key cache and rank keys; `parseDay` on char codes.
9–10. Filters: text (folded), number, day, instant (bounds from `zoneDayBounds`, half-open), boolean, value list, combined; negations are exact complements.
11. Quick search, narrowing as the user types.
12. Client model: filter → sort → displayed, memoised; one-row updates patched; K.14.
13. Layout: row layouts, the S1 scroll mapper, layer placement, 2D window, the S3 anchor.
14. Selection by key, everything-except for select all.
15. One conformance case per problem code; the public surface frozen; internals in `@dzgrid/core/internal`.

Two mid-phase reviews (code, and a mutation run of 175 mutants) and the two
end-of-phase reviews (architect, code) were fixed with tests that failed
first. The memory the reviews asked to measure showed the search caches at
1.8 kB per row; joined haystacks brought it to 452 B per row while
searching and 107 B at rest.

### Measured on dataset A (100 000 × 30)
| Line | K.8 | Measured |
|---|---|---|
| Load | ≤ 80 ms | 20 ms |
| Numeric sort | ≤ 40 ms | 18 ms |
| Text sort (cold, fr / ar) | ≤ 250 ms | 162 / 206 ms |
| Text filter (cold, fr / ar) | ≤ 35 ms | 30 / 33 ms |
| Memory, store | ≤ 120 B/row | 55 B/row |
| Memory, model at rest (sort + filters) | ≤ 25 MB | 107 B/row (10.7 MB) |
| Memory, while searching | — | 452 B/row (45 MB), released when the box is emptied |
| Core size | ≤ 28 kB gz | 17.8 kB gz (budget 18.8 kB) |

### Measured gaps (to revisit)
- Quick search, first keystroke, 10 text columns of accented French and
  Arabic over 100 000 rows: ~0.3 s (K.8's 150 ms holds for ASCII text:
  149 ms, at the limit). The cost is folding and joining a million cells
  once; later keystrokes take ~5 ms. Phase 2 can build the search
  haystacks in idle time after a load.
- Appending 1 000 rows to 100 000 sorted and filtered rows recomputes
  (24 ms): appends do not patch the caches yet.

### Exit criteria (Phase 1)
- [x] dataset A loads in ≤ 80 ms (20 ms)
- [x] numeric sort ≤ 40 ms, text sort ≤ 250 ms, text filter ≤ 35 ms, ≤ 120 B/row
- [x] `types.test.ts`: a `number` is never a `DisplayIndex`
- [x] `zoneDayBounds` correct on the 12 zones
- [x] `purity.test.ts` green
- [x] one conformance case per `ProblemCode`
- [x] `npm test`, `test:ci`, `test:tz`, `typecheck` green
- [x] phase-end architect review and code review, findings fixed (2026-10-17)
