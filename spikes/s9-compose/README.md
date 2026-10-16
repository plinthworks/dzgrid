# S9 — Composition while scrolling

## Question

ARCHITECTURE §3.7 places rows with `transform: translateY` ("composited by the
GPU, does not touch layout") and cells with `inset-inline-start`, recycles rows
from a pool, and leaves open **[À VÉRIFIER]** whether `inset-block-start` is as
good. Which of these composes the visible window fastest while scrolling?

- row position: `transform: translateY(y)` vs `inset-block-start: y`;
- containment on each row: none, `contain: strict`, `contain: content`,
  `content-visibility: auto` (+ `contain-intrinsic-size`);
- strategy: recycling vs rebuilding the visible window.

Decision rule: keep the fastest variant, with the numbers to justify it.

## Method

`run.mjs` loads `index.html?position=…&contain=…&strategy=…` (`main.ts`,
`compose.ts`, `data.ts`) once per variant, in a fresh page, and scrolls it.
Run: `node spikes/s9-compose/run.mjs`
(`BROWSERS=chrome,firefox-asap REPS=3 FRAMES=180` to vary).

- **Data**: 100 000 rows × 30 columns, seeded mulberry32 (same generator as
  S1), columns 120 px, rows 32 px. Viewport 1455 × 1327: 40 rows × 12 columns
  visible; overscan 4 rows / 2 columns → 49 rows × 15 cells ≈ 735 cells
  mounted. One scroll container, sticky header, cells at
  `inset-inline-start` in every variant (logical; `translateX` would flip in
  right-to-left). 3.2 M px of body: no ScrollMapper needed (S1).
- **24 variants** = 2 positions × 4 containments × 3 strategies:
  - `ordered` — recycle; rows leaving one end are detached into a pool and
    rebound rows inserted at the other end, so **DOM order = row order**
    (what §3.7 step 4 and accessibility need);
  - `inplace` — recycle; row r always uses view r mod W: nothing moves in the
    DOM, but DOM order is not row order (shown for cost only);
  - `rebuild` — every window change throws the rows away and builds the
    window again from new elements.
- **Scroll**: a rAF loop sets `scrollTop` and renders synchronously, 120
  frames, at two speeds: `slow` 32 px/frame (one row enters per frame) and
  `fast` 320 px/frame (ten rows per frame, ~150 cell writes). Each frame
  records the rAF delta, our update time, and update + forced style/layout
  (`scrollWidth` read) time. Every run checks after the fact that each mounted
  row is painted at its place (rects, < 0.5 px) and whether DOM order is row
  order.
- **Runs**: Chrome, Firefox and WebKit at vsync (60 Hz headless), and
  `firefox-asap`: Firefox with `layout.frame_rate = 1000`, so each frame lasts
  as long as its whole work (script + style + layout + paint) — the only
  uncapped engine available (Chrome headless ignores
  `--disable-frame-rate-limit`; WebKit has no switch). In Chrome, CDP
  `Performance.getMetrics` gives the main-thread task time per frame (all
  rendering work on the main thread, paint included). Firefox runs with
  full-resolution timers; WebKit's clock ticks in 1 ms, so its timings are
  means (unbiased under truncation), not medians.
- 2 reps, variants in alternating order, median over reps.
- **Ranking** (`result.json → ranking.fullFrameCost`): Chrome's task time per
  frame and Firefox's uncapped mean frame time, each divided by the best
  variant of its run, averaged. `ranking.scriptStyleLayout` ranks by the
  forced-layout timing in Firefox (vsync) and WebKit instead; that view
  **flatters `content-visibility: auto`**, whose deferred work lands after the
  forced layout (Chrome's full task time shows it is not cheaper).

## Results (indicative)

Apple M4 Max, macOS, headless, 2026-10-16, with other agents running browser
spikes at the same time. `results/result.json` has every rep.

At vsync **every variant holds 60 fps** in all three engines (mean fps 60.0;
`rebuild` drops 1.7–4 % of frames in WebKit, the others 0 %, one stray 1.7 %
in Firefox). So the comparison is on cost per frame.

### Fast scroll (320 px/frame), ms per frame

| Variant | Chrome task (CDP) | Firefox uncapped frame | Firefox script+style+layout | WebKit script+style+layout (mean) | Relative full cost |
|---|---|---|---|---|---|
| transform / none / ordered | 2.37 | 3.62 | 1.66 | 2.12 | 1.15 |
| inset / none / ordered | 2.62 | 3.63 | 1.60 | 2.33 | 1.21 |
| transform / strict / ordered | 2.13 | 3.75 | 1.62 | 2.19 | 1.11 |
| **inset / strict / ordered** | **2.10** | **3.71** | 1.80 | 2.07 | **1.09** |
| transform / content / ordered | 2.11 | 3.71 | 1.60 | 2.22 | 1.09 |
| inset / content / ordered | 2.10 | 3.77 | 1.66 | 2.06 | 1.10 |
| transform / cv-auto / ordered | 2.50 | 4.05 | 2.36 | 1.68 | 1.24 |
| inset / cv-auto / ordered | 2.71 | 4.09 | 1.98 | 1.60 | 1.30 |
| transform / strict / inplace | 1.97 | 3.45 | 1.26 | 1.50 | 1.02 |
| inset / content / inplace (fastest) | 1.95 | 3.44 | 1.18 | 1.64 | 1.01 |
| transform / none / rebuild | 5.21 | 7.70 | 6.20 | 7.88 | 2.48 |
| inset / strict / rebuild | 5.06 | 7.54 | 6.30 | 7.42 | 2.42 |
| transform / cv-auto / rebuild | 5.60 | 9.23 | 6.20 | 5.08 | 2.81 |

### Slow scroll (32 px/frame), ms per frame

| Variant | Chrome task | Firefox uncapped | WebKit (mean) | Relative full cost |
|---|---|---|---|---|
| transform / none / ordered | 1.77 | 2.53 | 0.98 | 1.18 |
| **transform / strict / ordered** (fastest) | **1.31** | 2.55 | 0.99 | **1.01** |
| inset / strict / ordered | 1.30 | 2.68 | 0.98 | 1.03 |
| transform / content / ordered | 1.33 | 2.67 | 1.01 | 1.04 |
| inset / cv-auto / ordered | 1.68 | 2.53 | 0.79 | 1.15 |
| transform / strict / inplace | 1.36 | 2.57 | 1.01 | 1.04 |
| inset / none / rebuild | 5.23 | 7.36 | 7.15 | 3.48 |

Per frame at the fast speed, recycling binds ~10 rows and writes ~151 cells;
rebuilding creates ~49 rows and ~741 cells. All variants painted every row
at its place.

## What the numbers say

1. **Recycle, never rebuild**: rebuilding the window costs 2.4× (fast) to
   3.5× (slow) the full frame in Chrome and Firefox, 3.7–7.5× the
   script+style+layout in WebKit, and is the only family that drops frames.
2. **`contain: strict` (or `content`) on rows**: −10 to −25 % of Chrome's
   frame cost against no containment (fast 2.37 → 2.13, slow 1.77 → 1.31);
   neutral in Firefox and WebKit. `strict` and `content` are equal within
   noise; `strict` is correct here because rows have a fixed size.
3. **`content-visibility: auto` brings nothing and costs a little**: all rows
   of the window lie within its proximity margin (half a viewport), so there
   is nothing to skip; Chrome pays 17–27 % more than `strict`, Firefox up to 8 % more (fast speed). Only
   WebKit's forced-layout timing looks better, because the work is deferred
   past the measurement.
4. **`transform` vs `inset-block-start`: a tie.** With containment, the two
   are within 2 % of each other in every run and speed (Chrome fast 2.13 vs
   2.10, slow 1.31 vs 1.30; Firefox fast 3.75 vs 3.71), and their order flips
   between speeds. The "transforms avoid layout" premise of §3.7 does not show:
   an absolutely positioned, contained row moved by `inset-block-start` costs
   the same as a transform.
5. **Keeping DOM order costs 0–10 %**: `inplace` beats `ordered` by ~8 % at
   fast speed (fewer DOM insertions), by nothing at slow speed. DOM order
   must equal row order for screen readers and Tab order (§3.7, S4, S10), so
   the in-place ring is not an option; the cost is small.

## Decision

Keep: **recycled rows in DOM order (`ordered`), `contain: strict` on each
row, no `content-visibility`, cells at `inset-inline-start`.** It is within
9 % of the fastest variant overall (the fastest ones break DOM order), and
2.4–3.5× cheaper than rebuilding.

For the row position, speed does not decide (tie). Proposed tie-break, to be
confirmed by the owner: **`inset-block-start`**, because S1 measured that
transforms lose precision first at large offsets (Chrome at DPR 3 is a device
pixel off from 2²³ px, where layout is exact up to 2²⁴), because it is a
logical property like everything else, and because it does not promote rows
to compositor layers. Keeping `translateY` as §3.7 says is equally fast, as
long as transform values stay small (S1's rebased layer).

Changes to ARCHITECTURE §3.7: the "Positionnement" paragraph — the reason
given for `translateY` (GPU, no layout) is not borne out; add `contain:
strict` on rows; state that `content-visibility` is not used; state that
the window is never rebuilt, even on a jump (a jump rebinds the mounted rows
in order, as the prototype does).

## Open points

- **Headless**: no GPU, software raster, 60 Hz timer; Chrome's figures are
  main-thread time only (raster and compositing threads are not counted), and
  WebKit has no uncapped measure at all **[À VÉRIFIER]**, headed, on a
  mid-range laptop and at 120 Hz.
- Rows here have plain text cells. Custom renderers (Angular cells, S6),
  images or wrapped text may change the containment trade-off.
- `content-visibility: auto` could matter for very tall overscan or very wide
  rows (many unpinned columns rendered); not the case with column
  virtualisation.
- Horizontal scrolling was not part of this comparison (S1's diagonal
  scenario covers it for the chosen design).
- The pool in `ordered` detaches rows; whether keeping them attached but
  hidden is cheaper was not measured.
- Timings were taken under load from other agents: indicative, to be re-run
  sequentially.
