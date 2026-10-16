# S1 — One million rows in a recycled DOM

## Question

ARCHITECTURE K.3 and §3.7 bet on a recycled DOM (rows **and** columns
virtualised, one scroll container), never a canvas, and assume that:

- browsers cap an element's height around 17.9 M px (Firefox) and 33.5 M px
  (Chrome) **[À VÉRIFIER]**, so a `ScrollMapper` must scale past a physical
  cap, with `maxPhysical` = 8 000 000 px by default **[À VÉRIFIER]**;
- 1 000 000 rows × 30 columns stay scrollable, smoothly, and row 999 999 is
  reachable, with scrolling proportional and pixel-precise near the end.

Decision rule: if it is not scrollable at ≥ 58 fps (median), cap the
scrollable rows and require pagination / infinite rows beyond. **Never canvas.**

## Method

`run.mjs` drives `index.html` (`main.ts`, `grid.ts`, `scroll-mapper.ts`,
`data.ts`) in Chrome, Firefox and WebKit, headless, one browser after the
other. Run: `node spikes/s1-virtual-1m/run.mjs`
(`BROWSERS=chrome REPS=3 FRAMES=300 MAX_PHYSICAL=4000000 HEADED=1` to vary).

- **Data**: 1 000 000 rows × 30 columns (integers, words from a pool, amounts,
  calendar days as strings, flags) from a seeded mulberry32; column widths
  80–200 px from the same PRNG. Row height 32 px, header 32 px, viewport
  1440 × 900.
- **Height cap**: bisection on the block-size of a plain block in a scroll
  container (a request counts as held when the box measures within 2 px —
  see "CSS lengths are floats" below), at device pixel ratio 1, 2 and 3; plus
  what happens above the cap, and whether `scrollTop` reaches the bottom.
- **Is a large offset painted where it should be?** Two 20 px markers at the
  same offset Y, one placed by layout (`inset-block-start`), one by
  `transform: translateY`; the page is scrolled so both should sit at 101 px;
  a screenshot is decoded (`png.mjs`) and the painted top found. Y = 2²²−999,
  2²³−999, 2²⁴−999 and the cap − 1011 (odd values, to expose float rounding).
- **The grid** (`grid.ts`): one scroll container; a sticky header; a body whose
  block-size is the mapper's physical height; inside it a *layer* placed with
  `inset-block-start = physicalTop − logicalTop + base`, holding the rows,
  each at `translateY(row × 32 − base)`, where `base` is the logical offset
  rounded down to 2²⁰. So a transform never receives a value above ~1 M px;
  the one large number goes through layout. Cells sit at
  `inset-inline-start` in their row; column c always uses cell slot
  c mod S, so a one-column shift rewrites one cell per row. Rows slide as a
  contiguous window: rows leaving one end are detached into a pool, entering
  rows are inserted at the other end, so DOM order is row order (§3.7 step 4).
  Overscan 4 rows, 2 columns. Logical properties only.
- **ScrollMapper** (`scroll-mapper.ts`): maps the logical *scroll range*
  [0, L − viewport] onto the physical one [0, P − viewport], end points exact.
  The logical offset is the source of truth: our own `scrollTop` writes are
  recognised and ignored on the `scroll` event; any other physical move
  (scrollbar, keyboard) re-derives the logical offset. When scaled, a
  non-passive `wheel` listener moves the logical offset by the wheel's own
  delta (otherwise a notch would move `ratio` × as far).
- **Reachability and precision**: scroll to the end by the API and by setting
  `scrollTop = scrollHeight` (the scrollbar path): row 999 999 must be mounted
  and its bottom flush with the viewport's. 401 physical positions across the
  range: |logical/maxLogical − physical/maxPhysical|. The last 512 logical
  pixels in 1 px steps: every mounted row's rect against its expected place.
  A real wheel event (`page.mouse.wheel(0, 100)`). Then **pixels**: a row near
  the end, and rows at 11 positions across the range, painted red and found in
  screenshots, at DPR 1, 2, 3, for caps of 8 M and 4 M.
- **Smoothness**: a rAF loop scrolls programmatically for 300 frames, ×2 reps,
  keeping the least-disturbed rep (lowest p95): `wheel` (48 px/frame, middle),
  `fling` (1 600 px/frame: the whole window replaced each frame),
  `scrollbarDrag` (2 000 physical px/frame = 16 000 logical, the browser's
  path), `diagonalNearEnd` (48 px down + 24 px across per frame, in the last
  15 000 rows). Recorded: rAF-to-rAF deltas (median, p95, % > 16.7 ms, %
  > 25 ms = a missed vsync), long tasks (Chrome only), our update time, and
  update + forced style/layout time; in Chrome also CDP `Performance.getMetrics`
  per frame (style, layout, script, whole main-thread task).
- **Memory**: Chrome only, CDP `HeapProfiler.collectGarbage` then
  `Runtime.getHeapUsage` and `Memory.getDOMCounters`: empty page, with the
  data, grid mounted, after all scrolling. Plus the same rows built property
  by property under computed keys.

Firefox is launched with `privacy.reduceTimerPrecision: false` (otherwise
`performance.now()` ticks in 1 ms without cross-origin isolation, which the
kit's server does not send). WebKit's clock stays at 1 ms: its per-frame
timings are whole milliseconds, and its *median* frame reads 17 ms
(58.8 fps) while its *mean* is 16.67 ms (60.0 fps).

## Results (indicative)

Apple M4 Max, macOS, headless, 2026-10-16, **other agents running browser
spikes at the same time** (load average 5–6). `results/result.json` has
everything. To be re-run on a quiet machine.

### Height cap and float precision

| | Chrome | Firefox | WebKit |
|---|---|---|---|
| Max element block-size (DPR 1, 2, 3 alike) | 33 554 428 px | 17 895 696 px | 33 554 428 px |
| Above the cap | clamped to 33 554 428 | **collapses to 0** | clamped |
| `scrollTop = 1e12` | clamps to max | clamps to max | **wraps to 0** |
| `block-size: 2²⁴+1 px` / `2²⁴+3 px` | 16 777 216 / 16 777 220 | same | same |
| Marker at 2²²−999 (layout / transform), DPR 1–3 | 0 / 0 px | 0 / 0 | 0 / 0 |
| Marker at 2²³−999, DPR 1–2 | 0 / 0 | **+0.5 / −0.5** (and `scrollTop` reads x.5) | 0 / 0 |
| Marker at 2²³−999, DPR 3 | 0 / **+⅓** (one device px) | +0.5 / −0.5 | 0 / 0 |
| Marker at cap − 1011 | −1 / −1 (DPR 3: −2⅓) | 0…−0.5 / −1 | −1 / −1 |

So: the caps in ARCHITECTURE K.3 are right, but they are not the binding
limit. **CSS lengths are single-precision floats**: above 2²⁴ = 16 777 216 px
an odd pixel cannot even be written. And engines lose sub-pixel precision
well before that: Firefox at 2²³ (positions in 1/60 px units through floats),
Chrome's transforms at DPR 3 at 2²³ CSS px (= 2²⁴·⁶ device px). Everything was
exact at 2²² ≈ 4.19 M px, in every engine at every ratio.

### The grid with 1 000 000 rows, `maxPhysical` = 4 000 000

| | Chrome | Firefox | WebKit |
|---|---|---|---|
| Generate 1 M × 30 rows | 373 ms | 354 ms | 197 ms |
| Mount: synchronous / to first painted frame | 6.5 / 15 ms | 10 / 30 ms | 12 / 30 ms |
| Scaled, ratio (logical px per physical px) | yes, 8.0016 | same | same |
| Row 999 999 mounted, bottom gap — API / scrollbar end | 0 px / 0 px | 0 / 0 | 0 / 0 |
| Max deviation logical vs physical (401 points) | 1.6 × 10⁻⁸ | 1.6 × 10⁻⁸ | 1.6 × 10⁻⁸ |
| Last 512 px, 1 px steps: max rect error | 0 px | 0.13 px (rect API only) | 0 px |
| Wheel 100 px → logical move | 100 | 100 | 100 |
| Pixels, 11 positions, DPR 1/2/3, cap 4 M | 0 / 0 / 0 px | 0 / 0 / 0 | 0 / 0 / 0 |
| Pixels, 11 positions, DPR 1/2/3, cap **8 M** | 0 / 0 / **⅓ px** | 0 / 0 / 0 | 0 / 0 / 0 |
| DOM elements mounted / after all scenarios | 605 / 677 | 605 / 677 | 605 / 677 |

Firefox's rects stray by up to 0.25 px at a few million px (its
`getBoundingClientRect` goes through floats); the painted pixels do not.

### Smoothness (best of 2 reps, 300 frames each)

All three run their rAF at 60 Hz headless, so frame deltas show whether a
frame was missed, not the headroom; the work columns show the headroom.

| Scenario | Browser | fps median (mean) | p95 frame | > 25 ms | update (median / p95) | update + style + layout (median / p95) | Chrome main-thread task / frame |
|---|---|---|---|---|---|---|---|
| wheel 48 px/f | Chrome | 59.9 (60.0) | 16.7 ms | 0 % | 0.1 / 0.2 ms | 0.3 / 0.4 ms | 1.99 ms |
| | Firefox | 60.0 (60.0) | 17.4 | 0 % | 0.12 / 0.16 | 0.48 / 0.62 | — |
| | WebKit | 58.8 (60.0) | 17 | 0 % | 0 / 1 (1 ms clock) | 1 / 1 | — |
| fling 1 600 px/f | Chrome | 59.9 (60.0) | 16.7 | 0 % | 0.2 / 0.3 | 1.2 / 1.3 | 2.69 |
| | Firefox | 60.0 (60.0) | 17.2 | 0 % | 0.32 / 0.38 | 2.4 / 2.7 | — |
| | WebKit | 58.8 (60.0) | 17 | 0 % | 1 / 1 | 3 / 3 | — |
| scrollbar drag 2 000 phys px/f | Chrome | 59.9 (60.0) | 16.8 | 0 % | 0.2 / 0.3 | 1.2 / 1.4 | 3.02 |
| | Firefox | 60.0 (60.0) | 17.2 | 0 % | 0.32 / 0.38 | 2.4 / 2.8 | — |
| | WebKit | 58.8 (60.0) | 17 | 0 % | 1 / 1 | 3 / 3 | — |
| diagonal near end | Chrome | 59.9 (60.0) | 16.8 | 0 % | 0.1 / 0.2 | 0.3 / 0.7 | 1.73 |
| | Firefox | 60.0 (60.0) | 17.2 | 0 % | 0.16 / 0.24 | 0.52 / 1.1 | — |
| | WebKit | 58.8 (60.0) | 17 | 0 % | 1 / 1 | 1 / 2 | — |

(An earlier run under heavier load had one 67 ms frame in Firefox `wheel`.)

Per frame, `wheel` binds ~1.5 rows and writes ~21 cells; `fling` and
`scrollbarDrag` bind ~36 rows and write ~506 cells (the whole window). No long
task in Chrome. The "% > 16.7 ms" column of `result.json` (15–65 %) is jitter
around 16.67 ms, not dropped frames: "> 25 ms" is the meaningful one.

### Memory (Chrome)

| | JS heap used | DOM nodes |
|---|---|---|
| Empty page | 1.1 MB | 17 |
| + 1 M × 30 rows, one shape (object literal, as JSON.parse gives) | 199.6 MB (≈ 208 B/row) | 17 |
| + grid mounted | 199.8 MB (+0.2 MB) | 1 175 |
| after all scenarios | 200.2 MB | 1 350 |
| same rows built key by key (`row[id] = v`) | **847.9 MB** (×4.2), generation 1.1 s | 17 |

The grid itself costs nothing measurable; the data costs everything, and its
shape matters four-fold.

## Decision

**One million rows are scrollable at 60 fps in all three engines** (≥ 58 fps
median: Chrome 59.9, Firefox 60.0, WebKit 58.8 by the median of a 1 ms clock,
60.0 by the mean), row 999 999 is reachable by API and scrollbar, flush with
the bottom, and every position is pixel-exact. So by the rule: **no cap on
scrollable rows from rendering; no pagination imposed; no canvas.** The worst
frame costs ~3 ms of main thread in Chrome (scrollbar drag), ~2.8 ms of script + style
+ layout in Firefox, ~3 ms in WebKit.

What changes in ARCHITECTURE §3.7:

1. **`scrollMapper` needs the viewport's block size**:
   `scrollMapper(logicalHeight, maxPhysical, viewportBlockSize)`, mapping the
   scroll ranges (L − vp → P − vp) with exact end points, rebuilt on resize.
   Mapping heights (p × L/P) leaves the last `vp × (ratio − 1)` px of rows
   unreachable.
2. **`maxPhysical` = 4 000 000 px, not 8 000 000**: 8 M gives one-device-pixel
   errors in Chrome at DPR 3 and half-pixel scroll positions in Firefox past
   2²³; 4 M was exact everywhere. Consequence: scaling starts at 125 000 rows
   of 32 px (not 250 000), ratio 8 for 1 M rows.
3. **Big numbers go through layout, small ones through transforms**: the rows
   sit in a layer placed by `inset-block-start`; row transforms are relative
   to a base re-anchored every 2²⁰ px. Never write a CSS length above 2²⁴.
4. **Never write a huge `scrollTop`**: WebKit wraps 1e12 to 0; clamp to
   `mapper.maxPhysical` first (the prototype does).
5. **Logical offset is the source of truth**, physical is derived; our own
   `scrollTop` writes are recognised on the `scroll` event (±1 px).
6. The caps quoted in K.3 are confirmed (Chrome and WebKit 33 554 428 px,
   Firefox 17 895 696 px); note that Firefox **collapses** an element above its
   cap to height 0 instead of clamping.
7. K.8 budget "first render ≤ 1.2 s" for 1 M rows: the grid mounts in ≤ 30 ms;
   the time is in producing the rows (0.2–0.4 s here) and in the row model.

## Open points

- **Headless frame timing** **[À VÉRIFIER]**: headless rAF is a 60 Hz timer
  without a real display or GPU compositing; frame deltas prove "no missed
  frame at 60 Hz", not behaviour on a 120 Hz display or a slow laptop. Chrome
  headless ignores `--disable-frame-rate-limit`, so no uncapped number for
  Chrome. Re-run headed (`HEADED=1`) and on a mid-range laptop (K.8).
- **Scrolling that is not a wheel** in scaled mode moves `ratio` × too fast:
  touch scrolling and momentum on touch screens, the browser's own
  PageDown / Space / arrow scrolling of the viewport. The grid's key router
  owns those keys (§3.8), but touch is not intercepted **[À VÉRIFIER]**
  (likely acceptable: a touch fling over 1 M rows is coarse anyway).
- A non-passive `wheel` listener (scaled mode only) makes Chrome scroll on
  the main thread; measured fine here, unverified on a slow machine.
- Scrollbar dragging in scaled mode has a granularity of `ratio` logical px
  (8 px for 1 M rows) — invisible in practice, but the thumb and the rows can
  be one frame apart during a drag, since the browser moves the content by
  physical pixels before our frame re-places it **[À VÉRIFIER, visually]**.
- Memory is the real limit of a client-side million: 200 MB for well-shaped
  rows, 850 MB for badly shaped ones. Worth a note in the docs for
  `clientRows`, and a reason to keep Sehhaty's audit logs paginated.
- Timings under load from other agents: indicative only.
