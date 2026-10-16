# S11 — retained row in scaled mode, and the combinations never measured together

Run: `node spikes/s11-scaled-focus/run.mjs` (or `npm run spike -- s11`); `BROWSERS=chrome` for one engine.
Headless, one browser at a time, closed in `finally`. Results in `results/result.json`
(2026-10-16: **346 checks passed, 0 failed** in Chrome, Firefox and WebKit, after the review
below; the first run's 322 checks missed the near cases).

The page (`page.ts`) is a minimal grid on the real core (`scrollMapper`, `layerPlacement`,
`MAX_PHYSICAL`, `REBASE`): 1 000 000 rows (ratio ≈ 8) or 200 000 (≈ 1.6), 2 + 20 + 1 columns
with sticky start and end segments, a re-anchored row layer, rows placed with
`inset-block-start`, roving tabindex, a retained row, a key router, an F2 editor, wheel
interception. Rows are computed from their index (no row objects: memory is short here).

## Findings

1. **The retained row in scaled mode: `clamped` (its true distance), with `overflow: clip` on the body.**
   Two placements were tried: `image` = at `toPhysical(offset) − layerTop`; `clamped` = at
   `offset − base`, its true logical distance from the visible rows, bounded to ±2·REBASE.
   - Far away (A–F), both work in the three engines, at 1 M and 200 k rows, LTR and RTL:
     same node, no blur, DOM order sane, editor text and caret kept (D), the browser's one
     native scroll after Shift+Tab or typing redone logically (C, D), data reversed (F). The
     witness (`retain=none`) loses focus to `body`, so the checks see a loss.
   - **Near the window (K, added after review) `image` fails**: a focused row 30 to 140 rows
     away is drawn *over* the visible rows (its image falls inside the viewport whenever
     `distance / ratio` < the viewport's height). `clamped` never overlaps: it sits at its
     true distance, and beyond ±2·REBASE still more than REBASE away.
   - **`clamped` grows the scroll range** unless the body clips: with the row 40 000 rows
     below the window near the end, `scrollHeight` went from 4 000 032 to 5 117 976.
     `overflow: clip` on the body keeps it exact (clip makes no scroll container: sticky,
     focus and the AX tree are unaffected, all measured).
   - Every length the page wrote stays ≤ 4 000 000 (the body itself), `scrollTop` never
     past `maxPhysical` (read back from the browser).
   **Decision D4: `clamped` + `overflow: clip` on the body.** The correction rule is what makes
   C and D work: a native scroll within 2 frames of a `focusin` or a grid `keydown` is followed
   by the grid's own `ensureVisible(focus)`. `E` (`focusCell` far away, no native scroll) holds
   by construction (`preventScroll`); it is kept as a guard.
2. **Keys in scaled mode.** With focus on a cell, PageDown, Space, ArrowDown and End land
   exactly where the router says (row 10 + 2 pages + 1, last column), ArrowRight moves toward
   the end in LTR and the start in RTL, and no native scroll is seen. With focus on the
   viewport itself, native PageDown moves 4 472 to 4 536 logical px (≈ ratio × a page) after
   the smooth scroll settles; intercepted at the viewport, focus goes exactly one page from the
   focus cell and nothing scrolls natively. A click on a non-cell area (a header) gives focus
   back to the focus cell. **Decision D5 (keys): intercept at the viewport, as planned.**
   "No native scroll" is a lower bound: scroll events are per frame.
3. **Touch in scaled mode (Chrome, CDP synthesized fling of 600 px).** Absolute mapping moves
   4 800 logical px (ratio × 600). Relative mapping — native delta applied 1:1 to the logical
   offset, then `toPhysical(logical)` written back — moves 601 px against 598 for an unscaled
   list, and the fling goes on (46 scroll events, as unscaled). **Decision D5 (touch):
   relative mapping**, scrollbar drag stays absolute (pointer on the scrollbar). Firefox and
   WebKit touch: not measurable headless here — on a device, by the owner.
4. **`contain: strict` breaks sticky pinned segments in Firefox.** It is the `size` part:
   `strict` and `size layout style` let the start and end segments scroll away (LTR and RTL);
   `content`, `paint` and none keep them. Chrome and WebKit keep them with all five.
   S9 measured `strict` and `content` alike (−10 to −25 % frame cost). **Rows take
   `contain: content`** with an explicit `block-size`. This changes S9's retained choice.
5. **Re-anchored layer + `inset-block-start` rows**: the first, middle and last visible rows
   within 0.09 px (Chrome, WebKit) and 0.37 px (Firefox, which keeps fractional `scrollTop`)
   of where the requested logical offset puts them, at 11 fractional offsets over a million
   rows. Measured from layout rectangles, not painted pixels (S1 did the pixels).
6. **Accessibility of the retained row** (Chrome CDP, `contain: content`): present, focused,
   not ignored, inside a node of role `row`.
7. Firefox keeps fractional `scrollTop` (1 999 689.125): visibility checks need ±0.5 px, and
   the grid must read the viewport's client height, never assume it.

## Review (code reviewer, 2026-10-16)

The first run claimed `image` was validated; the reviewer showed the checks only jumped far
away, `overMaxP` could not fail (it read our own clamped value), G2 started from a stale focus
row, J2 measured one row at an aligned offset with the page's own formula, and RTL keys were
never pressed. All fixed above; the K scenario is what overturned `image`. `rowindexOk`
compares an attribute with the expression that set it: kept, but `orderOk` is the real check.

## Not measured here

- Classic scrollbars: headless macOS shows overlay ones even with the flag, so the RTL
  scrollbar side, the scrollbar width in `ensureVisible` and scrollbar drag in relative mode
  (needs classic scrollbars): the drag is detected by a pointer on the scrollbar and mapped absolutely — to check
  by hand.
- Auto height + scaled mapper (J4): auto height is not in Phase 2. Until it is measured,
  scaled mode uses estimates for auto-height columns (problem `autoheight-scaled`).
- Real touch and momentum in Firefox and Safari, on devices.
