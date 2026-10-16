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

Indicative numbers: M4 Max, headless, other spikes running. The sequential
re-run (`npm run spike`) replaces them below when it lands. Details in each
`spikes/<id>/README.md`.

| # | Question | Result | Decision |
|---|---|---|---|
| S1 | 1M rows, recycled DOM | 60 fps in Chrome, Firefox, WebKit; row 999 999 reachable, 0 px error; height caps 33.5 M px (Chrome, WebKit) and 17.9 M px (Firefox, collapses to 0 above); WebKit wraps a huge `scrollTop` to 0; float precision breaks above 2²² px | No row cap, no pagination imposed, no canvas; `maxPhysical` 4 M px; scroll-range mapper; clamp before writing `scrollTop` |
| S2 | RTL + sticky pinned, 3 engines | Pinned sides and header/body alignment 0 px off in all three; `scrollLeft` 0 → −max everywhere; `scrollIntoView` needs `scroll-padding`; scrollbar side in Firefox headed only | One scroll container, no fallback; bidi: flex cell + `plaintext` span in free-text columns (owner, 2026-10-16) |
| S3 | Auto row height | 0 px jump at 10 000 rows in all three; Firefox ≤ 1.5 px at 100 000; 365–508 px without correction | Free up to 10 000 rows, a developer warning above; batched read in rAF |
| S4 | Screen readers, virtualised grid | axe 0 violations ×3 engines, fr and ar; macOS AX tree reports row 5001 of 10001 with headers; 3 structure fixes | Exact `aria-rowindex` + retained row + polite live region; manual protocol in `spikes/s4-a11y/protocol.md` |
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

### Exit criteria (ARCHITECTURE.md §6)
- [x] the ten questions have measured answers (sequential re-run pending)
- [x] K.1–K.9 decided
- [x] `npm test` and `npm run typecheck` green
- [x] `npm run build` produces `dist/`
- [x] `purity.test.ts` fails on a planted `new Date()`
- [ ] architect review and code review of the phase, findings fixed
