# S12 — variable row heights (open details) under the scaled scroll mapper

Run: `node spikes/s12-variable-heights/run.mjs` (`BROWSERS=chrome` for one engine). The folder
number clashes with `s12-spans` (Phase 3): `npm run spike -- s12` runs both.
Headless, one browser at a time, closed in `finally`. Results in `results/result.json`
(2026-10-21: **102 checks passed, 0 failed** in Chrome, Firefox and WebKit, 34 per engine).

The page (`page.ts`) is a minimal grid on the real core (`scrollMapper`, `layerPlacement`,
`uniformRowLayout`, `MAX_PHYSICAL`, `REBASE`): 1 000 000 data rows of 32 px and **2 000 open
details of 240 px**, one after each master, masters spread from row 0 to row 999 999 (so the
last displayed row is the detail of row 999 999). 1 002 000 displayed rows, 32 480 000 logical px,
ratio 8.121 (the uniform witness: 32 000 000 px, ratio 8.001). Rows are computed from their
index. The layout is a prototype of D7's `sparseRowLayout` (`sparse-layout.ts`): every row 32 px
except the D listed ones, found by binary search over them, with prefix sums of their extra
heights; no per-row memory; `setHeight` recomputes the sums from the changed detail on, O(D). Timings in the tables: two full runs, the range of both.
Detail rows are one cell (`aria-colspan` 8), one focus stop; the goal column is kept across one.
Retained row: S11's D4 (`clamped`, body `overflow: clip`). Wheel and keys intercepted in scaled
mode (S11 D5); a native scroll (scrollbar) maps absolutely.

## Measures (2026-10-21, M4, headless)

| | Chrome | Firefox | WebKit |
|---|---|---|---|
| layout vs brute-force oracle (765 000 probes, 51 height sets) | 0 wrong | 0 wrong | 0 wrong |
| top: first row's offset error | 0 | 0 | 0 |
| end (API, native scrollTop past the end, Ctrl+End): last row's bottom error | 0 | 1.5·10⁻⁵ px | 0 |
| row 999 999 reachable (all three ways; Ctrl+End then ↑ focuses it, column kept) | yes | yes | yes |
| placement, 300 offsets (details, REBASE edges, fractions): max error, variable / uniform | 0.123 / 0.124 px | 0.459 / 0.464 px | 0.123 / 0.124 px |
| wheel 20 × 100 px (intercepted): logical move | 2 000 (exact) | 2 000 (exact) | 2 000 (exact) |
| wheel deltaMode | 0 (px) | 0 (px) | 0 (px) |
| PageDown × 12 (intercepted): focus's screen drift, variable / uniform | −24, −120 on a detail / −24 | same | same |
| retained data row and retained detail row through top, end, middle | kept, no blur | kept, no blur | kept, no blur |
| detail resize above the viewport (4 cases): top row's move | 0 | ≤ 0.34 px | 0 |
| witness without the anchor: top row's move | 240 px | 240 px | 240 px |
| resize while at the end | stays at the end, error 0 | −0.07 px | 0 |
| render of one window (median, two runs) | 0.3–0.4 ms | ≤ 1 ms | < 0.1 ms |

**Native drift (not intercepted, for the record).** A native scroll moves `ratio` logical px per
physical px, and the ratio grows with the total height: 8.121 with the details against 8.001
uniform, **+1.5 %** (wheel 5 × 100 px: 4 060 logical px against 4 000; native PageDown on the
viewport: 7.99–8.12 pages against 7.89–8.00 — S11's known "≈ ratio × a page"). That is why the
grid intercepts the wheel and the scroll keys in scaled mode: intercepted, the drift is 0 (the
logical move is the delta exactly) in both cases. A scrollbar drag stays absolute: the thumb's
place is the logical fraction, the content under it is right (placement exact after it).

**PageDown drift.** PageDown moves the content one body height (566 px) and focuses the row
under the old focus row's screen place; `ensureVisible` then aligns it. Uniform: −24 px each
time (566 is not a multiple of 32). Variable: the same, except when the target is a detail:
−120 px (its 240 px are brought fully into view). The target is always the row one body height
below (checked against the layout). Twelve PageDown then twelve PageUp come back to row 399 985
(uniform 399 988): pages are not symmetric across a detail, as expected.

**Cost of the prototype** (per call; `setHeight` per change):

| open details | build | offsetOf | indexAt | setHeight |
|---|---|---|---|---|
| 2 000 | ≤ 0.1 ms | 20–35 ns | 46–70 ns | 1–2 µs |
| 20 000 | ≤ 0.1 ms | 60–80 ns | 73–90 ns | 15–27 µs |
| 200 000 | 1–2 ms | 95–125 ns | 90–110 ns | 265–865 µs |

## Verdict: go, no cap

With 2 000 open details of 240 px over a million rows, the scaled mapper and a sparse layout
behave as with uniform rows: row 999 999 is reachable by API, scrollbar and keys, the ends are
exact (0 px; Firefox 1.5·10⁻⁵), every mounted row is where the layout says within the same
sub-pixel error as uniform rows, the intercepted wheel and PageDown are exact, focus survives on
a retained data or detail row, and a detail resize above the viewport keeps the top row (0 px;
Firefox ≤ 0.34, its fractional `scrollTop`). No cap is needed for Phase 4. Notes for step 8–10:

- `setHeight` is O(D): fine to 20 000 open details (≤ 27 µs). Past that, or for many `'auto'`
  heights changing in one frame (a ResizeObserver batch), recompute the sums once from the lowest
  changed detail (a `setHeights` batch or lazy recompute): 200 000 open details cost up to 0.87 ms
  per change in Firefox.
- The anchor rule is D7's: before the change, take the row at the logical top and the distance into
  it; after it, a new `scrollMapper` (the total changed, so the ratio) and the logical top set to
  that row's new offset plus the distance; at the end, stay at the end.
- The four resize cases: a detail far above 240 → 480, the nearest one above 240 → 120, the far
  one again 480 → 777, and row 0's detail 240 → 40.

## Not measured here

- `'auto'` heights (ResizeObserver, estimate then measure) and a nested grid inside the detail.
- Real touch, momentum, classic scrollbars (as S11).
- Screen readers on the detail row (a11y protocol §17).
- A resize of the detail that is itself the top row (partly scrolled past): D7's rule keeps the
  distance into it, which may exceed its new height; step 9 must clamp it (to be tested there).
