# Sticky parent rows: blueprint (architect, 2026-10-21; owner Q10, Q11)

Decisions: `decisions.md` Q10–Q11 (they win). Sheet first: `docs/behaviors/tree-sticky.md`. Sources: WAI-ARIA treegrid, WCAG 2.4.11 (focus not obscured), 2.5.8, 1.4.11, forced colours.

## Findings
- `.dzg-header` is `position: sticky; top: 0; z-index: 3` (styles.ts:13), header and body share the segment structure; `afterRows(frame)` gets layout, cols, epoch, partFor, rowAttrs; `g.layout`, `g.scroll.logicalTop`, `g.viewBlock` set before it.
- `TreeRows` already gives levelAt, parentOf, indexOf, expandedAt, nodeAt: no core change.
- Handlers match real rows by `rowRenderer.keyOf(el)` (tree/index.ts:96, interact/select.ts:41, tooltips.ts:19): unknown elements are ignored. Motion walks only `g.rowRenderer.mounted`.

## Design
- Copies rendered by a second RowRenderer (`rowRenderer.spawn(layer)`, ~60 B base) into `<div class="dzg-sticky" aria-hidden="true">`, `position:relative; block-size:0`, last child of `.dzg-header`; copies absolute with inset-block-start in px. Pinned under the header for free, horizontal scroll, pinned segments and RTL as header rows (S2/S11), above body rows. Rejected: CSS sticky in the body (needs the header height, cannot push).
- Pure `stickyStack({ top, n, viewBlock, count, layout, levelAt, ancestorOf, endScanMax }) -> { at, y }` in `packages/dom/src/tree/sticky.ts`: n_eff = min(n, floor(viewBlock/2/h)); fixed point ≤ 4 rounds (p = indexAt(top + stack height); chain = nearest n_eff ancestors via parentOf/indexOf; pinned slots are a prefix); push: subtree end = first row after p with level ≤ L, forward scan bounded to ~n+2 rows; y_s = min(slot, offsetOf(end) − top − height); copies with y ≤ −height dropped. Offsets from `g.layout` only (heightOf: ready for step 9), logical differences only (scaled scrolling safe). One-frame lag of the push edge accepted (screenshot check).
- `tree({ sticky })`: 0 off (no layer, no code run), 1 direct parent, n nearest n (outermost dropped first), default 3; clamp max(0, floor(x)), NaN → 3.
- afterRows: compute, `stack.render({...frame, rowTop: y, partFor: () => null, spans: null, focus none}, at, [])`, `g.inset = stack height`, `decorate(stack.mounted)` (refactor of tree/index.ts:149-185). Unchanged stack touches nothing. Copies: TEXT ONLY (owner Q11b). Selection look via rowAttrs, inert. destroy clears and removes the layer.

## Accessibility and pointer
- Layer aria-hidden; no tab stops; layer pointerdown preventDefault (no DOM focus inside). aria-rowindex/level/expanded and focus on real rows only; keys untouched.
- One capture listener on the layer: toggle → `expand([key], !open)` source user (one sentence); elsewhere → `focusCellAs(key, data-col, 'user')`: focus the real parent and scroll to it, no selection, modifiers ignored; the copy's check box is inert (owner Q11c).
- Collapse from a copy: the existing 'expand' anchor rule sends the top row to its nearest shown ancestor.
- Base seams ~90 B: `g.inset`, `g.insetFor?(i)` = min(n_eff, levelAt(i)) × h; focus.ts:74 ensureVisible scrolls a row above `top + inset` to `off − insetFor(i)` (WCAG 2.4.11). Print: hidden. Forced colours: border-block-end separator, ButtonText chevron.

## Interplay
Own pool (≤ n+1 rows); filters (muted ancestors, fillers with labels), sort, transactions: recomputed every paint; loading rows never ancestors; motion ignores copies (they snap); density/zoom via h and epoch; master/detail not combined.

## Performance and bytes
Stack ≤ 0.2 ms per frame (unit bench on 1M rows); no layout read; no LoAF > 50 ms in a 2 s wheel scroll on the 1M tree (perf/profiles/tree.ts, Chrome --only tree).
dom/tree +~1 000 → owner budget 3 700 (Q11a); dom base +~90 (21 300 held, measure); theme +~160 (2 500 held, measure).

## Tests first
1. Unit tree-sticky-stack (brute-force oracle, 1 000 seeded trees × tops; n 0/1/3, short chain, push, half-view cap, non-uniform heightOf, round bound, bench).
2. DOM tree-sticky (aria-hidden, no rowindex/level on copies; toggle collapses once with one sentence; click focuses the real row; Up onto a row under the stack scrolls it clear; no parts on copies; sticky 0 = no layer; filter/sort/transaction repaint; focus unchanged by a pointer on a copy; existing tree tests unedited).
3. Walk (deep tree scroll, collapse from a copy, sort/filter/update while scrolling).
4. Browser --only tree fr and ar RTL with pinned columns and horizontal scroll: alignment 0 px, axe, push screenshot, forced colours, print, 1M profile.
5. a11y-protocol §16: copies are silent.
