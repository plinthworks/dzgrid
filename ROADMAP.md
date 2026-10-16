# DzGrid — roadmap

The plan is `ARCHITECTURE.md`. This file records what is done, what is next,
and what the spikes found.

## Phase 0 — scaffolding and spikes (in progress)

### Done
- Repository, clean-room rules (`CLEANROOM.md`), architecture with the owner's
  decisions K.1–K.14 (2026-10-16).
- Workspace: vitest projects (core and conformance in node), strict tsconfigs
  (core on lib ES2023, no DOM), build script refusing `src/` entry points and
  runtime dependencies, Vite playground on port 4700.
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

### Spikes

| # | Question | Result | Decision |
|---|---|---|---|
| S1 | 1M rows, recycled DOM | — | — |
| S2 | RTL + sticky pinned columns, 3 engines | — | — |
| S3 | Auto row height | — | — |
| S4 | Screen readers on a virtualised grid | — | — |
| S5 | Intl speed and correctness | — | — |
| S6 | Angular templates in cells | — | — |
| S7 | Clipboard with spreadsheets | — | — |
| S8 | Hand-written XLSX | — | — |
| S9 | Composition while scrolling | — | — |
| S10 | Focus against recycling | — | — |

### Exit criteria (ARCHITECTURE.md §6)
- [ ] the ten questions have measured answers
- [x] K.1–K.9 decided
- [x] `npm test` and `npm run typecheck` green
- [x] `npm run build` produces `dist/`
- [x] `purity.test.ts` fails on a planted `new Date()`
- [ ] architect review and code review of the phase, findings fixed
