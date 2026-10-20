# Step 26 blueprint: motion with GSAP, `ui.cellClass`, the host hook (architect, 2026-10-20)

Decisions on top: `motion-decisions.md` and `step26-decisions.md` (they win). Study: `motion-study.md`.

## Findings
- Features are set up at grid creation: a static gsap import would put 25–30 kB in the initial load (K.8 real build 82 014 / 85 000). So: an EAGER shell `motion-gsap/index.ts` (options, armed state, loader) and a LAZY chunk `motion-gsap/run/*` (gsap and every tween), loaded at idle after `firstDataRendered`; effects before it loads are skipped (the first paint animates nothing anyway).
- Pooled cell/row elements carry inline layout (`inline-size`, `inset-inline-start`; rows: `block-size`, `inline-size`, `inset-block-start`): never `clearProps: 'all'` — clear only `transform,opacity,--dzg-flash` (host-hook tweens too).
- FLIP needs no layout read: the old position is the row's inline `inset-block-start` (a style read) taken in `beforeRows`; delta = old − new, valid while the layer base is unchanged (else a scroll happened: skip).

## API
```
motion({
  preset?: 'sober',
  effects?: { flip?, enter?, flash?, page? },          // default true
  gsap?: typeof gsap,                                   // else import('gsap')
  onCell?(el, c: { key, column, value, text, previousText, row, context, reduced }, reason: 'changed'): void | false,
  onRow?(el, c: { key, row, index, context, reduced }, reason: 'entered' | 'moved'): void | false,
})
```
Hooks: `false` = handled (skip the built-in effect); a throw → `g.report`; run only after our guards (armed, not scrolling, caps, ≤ 50 calls per paint); may animate `el` only (transform, opacity, `--dzg-*`, classes); reduced motion → only 'changed' with `reduced: true`; reasons 'saving' | 'saved' | 'failed' reserved for Phase 4. `settings.motion?: boolean` (live; root `data-motion="off"` honoured by the CSS tier; stops GSAP work and the chunk load). Missing gsap → one `missing-peer` problem, inert.
`ui.cellClass(ctx) => string | null` in the BASE (`rows.ts #fillCell`, after `cellValue`, before the part branch so part cells get it): ctx `{ value, text, row, key, column, context }`; memo per cell; classList token diff (coexists with `dzg-cell--saving`, `dzg-flash`); try/catch → report, class cleared; only for non-`same` binds; types in core columns/defs.ts:49 and parts.ts:11 (0 core bytes).
Angular: no wrapper change; docs/example create `motion()` outside the zone (`ngZone.runOutsideAngular(async () => …import('@dzgrid/dom/motion-gsap')…)`), pass `gsap` if wanted; a test-zone test counts 0 onStable during a flash.

## Behaviour
Arming on kernel `modelUpdated`: `order`/`query` → FLIP + enter; `page` → slide; `rows` WITH `change.transaction` → flash (plain reloads flash nothing). `beforeRows()` once per paint before `rowRenderer.render`, reads only when armed (mounted rows: key, el, inset; cell texts by data-col; page number). `afterRows(f)` writes: gsap `fromTo` with immediate render, gsap's own ticker, no extra rAF, lagSmoothing untouched, `force3D: false`, `overwrite: 'auto'`.
Pooled-row guard: `active: Map<el, {key, col?}>`; at every afterRows, if the element's key/column changed → finish (`progress(1)`) and clear the listed props (host-hook tweens too). Skip FLIP after a scroll between snapshot and paint (a scroll during FLIP finishes it), over 60 moved rows, a delta over a screen (geometry block size, no read), a paint < 150 ms after the previous armed one (typing). FLIP ≤ 300 ms, y only; entering rows opacity 120 ms, stagger capped at 20; leaving rows nothing.
Flash: same key+column, changed text; ≤ 50 cells per paint (more = bulk, none); ≤ 1 per cell per 500 ms (WeakMap); none within 150 ms of `g.scrolledAt`; tween `--dzg-flash` 1→0 with class `dzg-flash` (theme: tint + non-colour inline-start mark; contrast tested); reduced motion: class and variable held, removed by `gsap.delayedCall(0.6)`.
Page slide: the layer, 200 ms, x ±24 px, opacity .4→1, sign from `g.dir` and the page delta; unknown page → fade; not on the first paint.
Popup open and overlay fade-in: CSS ONLY (theme keyframe 140 ms, block-axis 4 px rise; close instant); sort mark, tooltip, floating summary: CSS only; all inside `@media (prefers-reduced-motion: no-preference)` and `:not([data-motion=off])`.
Reduced motion: lazy `gsap.matchMedia`, reduce true at start; a change finishes active effects. Focus/a11y: transform/opacity only; DOM order, aria-rowindex, tab stops, focus untouched; no visibility/hidden delays; the flash is not announced. Scaled scrolling unaffected. destroy: finish and clear all, kill delayedCalls, revert matchMedia, unsubscribe; one `motion()` may serve several grids.

## Sizes
dom base +~210 (beforeRows ~45, data-motion ~25, cellClass ~140) → ask 19 450; core 0; angular 0; theme +~400 → ask 2 350; `@dzgrid/dom/motion-gsap` shell 800 + `: run (lazy)` 3 700 (over the shell; gsap, core, core/internal, dom/internal external); gsap recorded apart (`gsap kit: core`). K.8: the audit profile does not import motion (0); real build +210 base +400 theme → ~82 650 / 85 000; an opting app adds the 800 B shell (~83 450), the run chunk and gsap lazy beside; informational line `profile: audit screen + motion`; audit-profile test: no static motion-gsap/gsap import.

## Files and tests first
Docs: `docs/behaviors/motion.md`, `docs/behaviors/cell-class.md` (or parts.md), motion-decisions/ROADMAP/STATUS/CHANGELOG, ARCHITECTURE (GSAP licence note). Modify features.ts (`beforeRows?`), render/viewport.ts (call before render ~l.210; `data-motion`), settings.ts (`motion?`), render/rows.ts (cellClass), core columns/{defs,parts}.ts (types), theme, build/exports/aliases, size-budget.json (3 lines + dom/theme caps), package.json (peer `gsap ^3.13.0` optional; gsap root devDependency), perf/profiles/audit.ts + test, the example (lazy, outside the zone). Create packages/dom/src/motion-gsap.ts, motion-gsap/{index,loader}.ts, motion-gsap/run/{index,flip,flash,page,guard,reduced}.ts.
Tests: cell-class (applied/diffed on pooled rebind, part cells too, throwing rule reported and cleared, not on `same`, coexists, layout styles untouched); motion-seam (beforeRows once per paint before render, sync mode, nothing without a feature, data-motion live); motion-gsap (real gsap in jsdom, matchMedia stubbed: reduced → no tween but the still mark 0.6 s; motion:false, switches; first paint / scroll-only / plain reload animate nothing; FLIP cap 60; 150 ms typing skip; pooled-row guard; flash rules; destroy mid-tween leaves no listed props and the layout props intact; two grids one instance; nothing before the chunk loads; missing gsap → missing-peer; hooks: arguments, false suppresses, throw reported, reduced → 'changed' only, cap 50, pooled hook tween finished); motion-walk (random sort/filter/update/scroll/page with real gsap: no leftover props; DOM, aria-rowindex, focus equal to a motion:false twin); structure (no gsap outside motion-gsap/run; the shell has no static gsap import); theme (rules only under no-preference and not data-motion=off; flash contrast incl. selected rows; forced colours); Angular test-zone (0 zone turns per frame during a flash); mutants on guard, caps, clearProps.
Browser (`-- --only motion`, fr light + ar RTL dark): 0 getBoundingClientRect/offsetHeight from arm to complete; activeElement unchanged across a sort FLIP and a popup open; tab order and aria-rowindex unchanged; LoAF < 50 ms during a 300-row-window sort; slide sign in RTL; axe 0 mid-flash; reduced motion via CDP → no transform, still mark 600 ms; final screenshot = the motion:false twin; sort at 1 M rows.

## Done (2026-10-20, not committed) — deviations
- GSAP missing → `missing-feature` (`features.motion`, detail `gsap`), not a new `missing-peer` code (no core or conformance change).
- Arming from `g.rows.subscribe` (it carries the transaction); the old page is the previous paint's; `beforeRows` runs before the layer moves.
- Entering rows: at most 20 fade (more: the window simply shows) — 250 entering tweens made an 89 ms frame in Chrome.
- The popup's content is animated, not the popup (GSAP moves an element without an offset parent out and back to read it: a fixed popover would close and lose the focus); each popup once.
- Effect switch `popup` added; hook contexts carry the column id; the run line is measured with `./run/*` external too.
- Sizes: dom 19 360, theme 2 046, shell 586, run 2 369 over the shell, gsap core 28 277; K.8 profile 75 879, with motion 76 301.
