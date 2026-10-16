# S11 — retained row in scaled mode, and the combinations never measured together

Run: `node spikes/s11-scaled-focus/run.mjs` (or `npm run spike -- s11`); `BROWSERS=chrome` for one engine.
Headless, one browser at a time, closed in `finally`. Results in `results/result.json`
(2026-10-16: **322 checks passed, 0 failed** in Chrome, Firefox and WebKit).

The page (`page.ts`) is a minimal grid on the real core (`scrollMapper`, `layerPlacement`,
`MAX_PHYSICAL`, `REBASE`): 1 000 000 rows (ratio ≈ 8) or 200 000 (≈ 1.6), 2 + 20 + 1 columns
with sticky start and end segments, a re-anchored row layer, rows placed with
`inset-block-start`, roving tabindex, a retained row, a key router, an F2 editor, wheel
interception. Rows are computed from their index (no row objects: memory is short here).

## Findings

1. **The retained row works in scaled mode, both placements** (`image` = at
   `toPhysical(offset) − layerTop`; `clamped` = `offset − base` bounded to ±2·REBASE), in the
   three engines, at 1 M and 200 k rows, LTR and RTL, with and without containment:
   - A: focus on row 500 000, scroll to the top, the end and back — same node, no blur, DOM
     order = `aria-rowindex` order, every length written < 2²² (the largest is the body,
     4 000 000), no `scrollTop` written past `maxPhysical`.
   - B: ArrowDown while the row is off screen — next row focused and fully visible.
   - C: Shift+Tab back from outside — the browser scrolls natively once (physically), the
     grid corrects logically within the next frames, cell fully visible.
   - D: editor ("Bonjour", caret 4), scroll away, type "!" — "Bonj!our", caret 5, no blur,
     editor brought back into view (one native scroll, then the grid's).
   - E: `focusCell(last row)` from the top — no native scroll at all.
   - F: data reversed while the retained row is away — re-placed, still focused, DOM sane.
   - Witness (`retain=none`): focus falls to `body`, so the checks do see a loss.
   **Decision D4: `image`** (as the plan proposed). The correction rule is what makes C and D
   work: a native scroll within 2 frames of a `focusin` or a grid `keydown` is followed by the
   grid's own `ensureVisible(focus)`.
2. **Keys in scaled mode.** With focus on a cell the router consumes PageUp/Down, Home/End,
   arrows and Space: zero native scroll in the three engines. With focus on the viewport
   itself, native PageDown moves 1 632 (WebKit) to 3 288 (Chrome) logical px instead of ~512;
   intercepted at the viewport, it is exact. A click on a non-cell area (a header) gives focus
   back to the focus cell. **Decision D5 (keys): intercept at the viewport, as planned.**
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
5. **Re-anchored layer + `inset-block-start` rows**: every row within 0 px (Chrome, WebKit)
   and 0.27 px (Firefox, which keeps fractional `scrollTop`) of its place, at 11 positions over
   a million rows. Measured from layout rectangles, not painted pixels (S1 did the pixels).
6. **Accessibility of the retained row** (Chrome CDP, `contain: content`): present, focused,
   not ignored.
7. Firefox keeps fractional `scrollTop` (1 999 689.125): visibility checks need ±0.5 px, and
   the grid must read the viewport's client height, never assume it.

## Not measured here

- Scrollbar drag in relative mode (needs classic scrollbars; headless macOS shows overlay
  ones): the drag is detected by a pointer on the scrollbar and mapped absolutely — to check
  by hand.
- Auto height + scaled mapper (J4): auto height is not in Phase 2. Until it is measured,
  scaled mode uses estimates for auto-height columns (problem `autoheight-scaled`).
- Real touch and momentum in Firefox and Safari, on devices.
