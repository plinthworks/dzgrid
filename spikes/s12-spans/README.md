# S12 — cell spans in the browser (rowspan / colspan)

Phase 3 step 9b (docs/phase-3-steps/step9b-spans-blueprint.md, decisions in step9b-decisions.md). The questions the plan could not settle on paper, measured in a static page that mimics the grid (sticky header, rows absolutely placed in a layer with start / centre / end segments, pinned sticky segments, `contain: content` rows, an S11-style scaled body).

Run: `node spikes/s12-spans/run.mjs` (one headless browser at a time, closed in a `finally`; Chrome, then Firefox and WebKit if installed for playwright-core). Results: `results/result.json` (every check and observation), screenshots `results/*.png`.

Last run (2026-10-18): Chrome 155, Firefox 157, WebKit 27.2 — **188 checks passed, 0 failed.** (The spike agent stopped before writing this file; the conclusions below are read from `result.json`.)

## 1. Stacking with pinned segments
- **Plan without fillers** (rows hosting spans get `contain: style` only, backgrounds on cells not segments, pointer events on cells): every hit right, no paint leak — but a covered slot in a **pinned** segment loses its row tint (the selected/hover colour of the covered row).
- **Plan + fillers** (an `aria-hidden` filler in each covered row of a pinned segment, z by rank: centre spans < pinned < header): **every hit and pixel as intended** in the three engines — tall cells are hit over covered slots, pinned cells above centre spans, the header above all, the tints of covered rows kept, no leak.
- Control: without a filler in the origin row, the centre shows through a transparent pinned tall cell (the leak scan catches it).
- **Decision:** rows hosting spans: `contain: style` only; backgrounds on cells; tall cells transparent so covered rows' tints show; **fillers in pinned segments** (`aria-hidden`, no role, no focus) for covered slots, and one in the origin row behind a transparent pinned tall cell; z order by rank (centre span cells < pinned segment < header). Centre-segment spans need no filler.

## 2. The O1 label (centred, travelling to the visible edge on long merges)
- Measured at 261 to 372 positions per configuration and at every frame of paced scrolls (75 and 450 measures, steps of 3 and 23 physical px): the label is centred in the whole span when the centre is visible, clamped into the visible part otherwise, **within 0.6 px, never outside the view**, in LTR and RTL, for short merges, long merges (5 000 rows clipped to the window) and under the scaled mapping.
- Both implementations pass: the painter computing the offset each frame (`label=js`), and **pure CSS** (`label=sticky`: the label is placed at the span's centre and made sticky to the top and bottom of the cell's visible part).
- Control: with `overflow: hidden` on the cell the sticky label does **not** follow: `overflow: clip` is what makes it work.
- **Decision:** pure CSS (no per-frame work, less code): span cell `overflow: clip`, label `position: sticky` with block-start and block-end insets at the header height and the view's end; the painter only writes the cell's clipped geometry and the label's centre offset when the geometry changes. The JS clamp stays as the documented fallback.

## 3. Ellipsis under `overflow: clip`
- The ellipsis is drawn on the label with `overflow: hidden` and with `overflow: clip`, inside a cell with `overflow: clip`, LTR and RTL. **Decision:** the label carries `text-overflow: ellipsis` with its own `overflow: hidden`.

## 4. Element height caps
- Chrome and WebKit lay out at most **33 554 428 px** (of 100 M asked), Firefox **17 500 000 px**. Every length the spike writes stays ≤ 2^22 px.
- **Decision (confirms the plan):** a tall cell is clipped to the window plus overscan, never laid out at its full extent.

## 5. Chrome's accessibility tree
- `aria-rowspan` / `aria-colspan` are exposed as ARIA attributes on the origin cell; the anchor row's tall cell is in the tree, not ignored (aria-rowindex 7, aria-rowspan 10); the `aria-hidden` fillers are absent from the tree.
- Not measured: Firefox's and WebKit's trees; what screen readers actually say. **Decision:** keep the plan (ARIA spans on the origin cell, covered slots absent, fillers `aria-hidden`); the owner's by-ear protocol (NVDA, JAWS, VoiceOver, TalkBack) decides whether the hidden `repeat` cells (O10) are needed.

## Consequences for the build (commit 3 of step 9b)
1. Fillers are part of the DOM spans feature, for pinned segments only.
2. The label is CSS sticky inside an `overflow: clip` cell; no per-frame label work.
3. Geometry is always clipped to window + overscan.
4. `scripts/browser.mjs` repeats the hit, pixel and label checks of this spike on the real grid (one Chrome page).
