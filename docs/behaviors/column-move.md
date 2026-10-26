# Moving a column

Written before the code (CLEANROOM). Sources: the public documentation of data grids about moving
columns (drag a header sideways; a marker shows where it lands; dropping into a pinned area pins it;
some columns can be locked in place), WAI-ARIA 1.2 (grid, `aria-colindex`), APG « grid » pattern,
WCAG 2.2 (2.5.7 dragging movements, 2.5.8 target size, 2.1.1 keyboard, 4.1.3 status messages, 1.4.11
non-text contrast). Plan `docs/phase-6-plan.md` D2, D3, D12; owner decisions `docs/phase-6-steps/decisions.md`
Q-M3 (no finger drag), Q-K2 (Ctrl+Shift+arrows), Q-G (the drop protocol, `group-drop-zone.md`), « Step 1
follow-ups » (Cmd+Shift+arrows on macOS; O2, O3, O4).
Entry: `@dzgrid/dom/columns`. Related: `pinned-columns.md`, `spans.md` (split groups), `column-menu.md`
(« Déplacer vers le début / la fin »), `columns-chooser.md` (reordering in the list).

## What the user does
Presses a column header with the mouse and drags it sideways (a pen clicks, see « As built »); or, on a focused header, presses
Ctrl+Shift+Left / Right (one place) or Ctrl+Shift+Home / End (to the edge) — Cmd+Shift on a Mac; or uses the column menu or the
chooser. On a touch screen, a finger on a header scrolls: the column moves through the menu or the chooser.

## What they observe
- After a few pixels of movement a light copy of the header follows the pointer and a bar between two
  headers shows where the column will land. The other columns do not move until the drop.
- Near the grid's side edges the columns scroll so a far place can be reached.
- On release the column takes its new place, header and cells together; the header and the body stay
  aligned. Escape during the drag puts everything back.
- Dropped among the columns pinned to the start (or the end), the column becomes pinned there; dragged out
  of a pinned area, it is unpinned.
- In Arabic the start is on the right: everything is mirrored, the bar included.
- With the keyboard, the column moves one place at a time and its new place is said.

## Behaviours (numbered, each one a test)

**Pointer**
1. A drag starts on a column header's label area after the pointer moved **4 px** (logical distance, either
   axis) with the primary button down, the mouse only (a pen: « As built »). Under 4 px it is a click (sort, as today). A press on the
   resize edge, the ⋮ button, the filter button, the reapply mark, a header part's control or a floating
   filter cell never starts a drag.
2. **Touch** (`pointerType: 'touch'`): never starts a drag; the header keeps `touch-action` scrolling
   (Q-M3). Group headers do not drag in this phase (O4).
3. During the drag: a ghost (a copy of the header's text, 0.8 opacity, `aria-hidden`, `pointer-events:
   none`) follows the pointer; an **insertion bar** at least 2 px wide, the full header height plus the
   visible body, colour `--dzg-move-bar` at 3:1 against the header and the rows (WCAG 1.4.11), in forced
   colours `Highlight`. The source header is dimmed (`data-dzg-moving`).
4. The landing place is the gap between visible columns nearest to the pointer's inline position, computed
   in logical coordinates (the same code in both directions). Hidden columns are not gaps: a column dropped
   next to a hidden one lands after it in the full order (the hidden column keeps its relative order).
5. Auto-scroll: within 32 px of the centre segment's start or end edge, the view scrolls sideways
   (speed growing with closeness, at most one column width per frame, scaled scrolling respected); it stops
   when the pointer leaves the band, at the end of the columns, or on release.
6. **Segments**: a gap inside the start-pinned segment pins the column `start`; inside the end-pinned
   segment `end`; in the centre, `pinned: null`. The bar sits inside the segment it targets.
7. Release on the same place (or over the source itself): nothing changes, no event, no sentence.
   Release elsewhere: **one** `column.state` patch (order, and pin when it changed), one `columnsChanged`
   (source `user`), never a re-sort or re-filter. The click that follows the release is swallowed (no sort).
8. **Escape** during a drag cancels it (sentence `move.cancelled`); `pointercancel`, a lost capture, the
   window losing focus, new column definitions, a direction change or the grid destroyed cancel quietly.
9. Released outside the grid and outside any registered drop target: cancelled quietly. Dragging out of
   the header row **never hides** the column (differs on purpose: a column is hidden by the menu or the
   chooser only).
10. **Drop targets** (protocol for Phase 7's group zone, `group-drop-zone.md`): while the pointer is over a
    registered target whose `accept(column)` is true, the insertion bar is hidden and the target gets
    `data-dzg-drop="over"`; releasing there calls its `drop(column)` and patches nothing.

**`movable: false`**
11. A column with `movable: false` cannot be dragged (no ghost; the press is a click) nor moved by keys
    (the key does nothing, sentence `move.locked`); its menu items « Déplacer » are disabled.
12. Its **position number** in the full order never changes through a user gesture: another column moved
    across it jumps over it (Ctrl+Shift+Right next to a locked column lands after it), and no gap next to it
    is offered if landing there would shift it. The application can still move it (`column.state`).
13. Pinning a locked column from the menu is disabled too (a pin is a move; O3).

**Keyboard** (focus on a column header; **Mac: Cmd+Shift**, owner « Step 1 follow-ups »: macOS takes
Ctrl+arrows for Spaces; read by `metaKey` on macOS, `ctrlKey` elsewhere)
14. Ctrl+Shift+ArrowRight moves the focused column **one visible place toward the logical end**
    (ArrowLeft in right to left); Ctrl+Shift+ArrowLeft toward the start. Ctrl+Shift+End / Home to the last /
    first place **of its segment**. The keyboard never crosses a pinned edge (O2): pinning is in the
    menu. At the edge: nothing moves, sentence `move.edge`.
15. The focus stays on the moved header; the view scrolls so it is fully visible (WCAG 2.4.11).
16. One polite sentence per key: `move.placed` « Nom : colonne 3 sur 9 » (place among the **visible** columns
    only, in reading order, counting the three segments; the chooser has its own `chooser.placed`, which counts
    hidden columns too). Keys repeated fast: one sentence after a 300 ms pause.
17. Each key is one `column.state` patch and one `columnsChanged` (source `user`).
18. These keys act only on a column header (owner `header`): on a body cell Ctrl+Shift+arrows stay the
    block's (`range-selection.md`); in a header part's control, a floating filter box, a popup or a nested
    grid they are not the grid's.

**Groups and spans**
19. A column may leave its header group; the group then shows on each side with its label repeated
    (`spans.md`). Moving it back next to its siblings joins the group again.
20. Spans recompute after a move (`spans.md`: moving re-runs them); a merged column stays merged.

**Events and state**
21. `columnsChanged` carries the new state; `GridState` saves `order` and `pinned` (`grid-state.md`).

## Keyboard

| Where | Key (Windows, Linux) | Key (Mac) | LTR | RTL |
|---|---|---|---|---|
| column header | Ctrl+Shift+ArrowRight | Cmd+Shift+ArrowRight | one place toward the end (right) | one place toward the start (right) |
| column header | Ctrl+Shift+ArrowLeft | Cmd+Shift+ArrowLeft | one place toward the start (left) | one place toward the end (left) |
| column header | Ctrl+Shift+Home / End | Cmd+Shift+Home / End (Fn+Cmd+Shift+Left / Right on a compact keyboard) | first / last place of its segment | same (logical) |
| during a pointer drag | Escape | Escape | cancel | cancel |
| group header | Ctrl+Shift+arrows | Cmd+Shift+arrows | nothing (O4) | nothing |
| body cell | Ctrl+Shift+arrows | Cmd+Shift+arrows | the block's (`range-selection.md`) | mirrored |

## Announcements
Polite (the grid's live region), one per gesture: `move.placed` after a drop or a key; `move.edge`,
`move.locked`, `move.cancelled` (Escape only). Nothing during a pointer drag.

## Texts (`locales/{en,fr,ar}-columns`)
| Key | en | fr | ar |
|---|---|---|---|
| `move.placed` | {column}: column {n} of {total} | {column} : colonne {n} sur {total} | {column}: العمود {n} من {total} |
| `move.edge` | {column}: already at the edge | {column} : déjà au bord | {column}: في الطرف أصلًا |
| `move.locked` | {column}: cannot be moved | {column} : ne se déplace pas | {column}: لا يمكن نقله |
| `move.cancelled` | Move cancelled | Déplacement annulé | أُلغي النقل |

## Right to left
Logical start and end only; the ghost and the bar placed with `inset-inline-*`; auto-scroll near the
logical edges (the start edge is on the right). Checked in Chrome, Firefox and WebKit (S2: scroll sign in
RTL differs by engine).

## WCAG notes
- 2.5.7: dragging is never the only way: keys (14), the menu (`column-menu.md`), the chooser.
- 2.5.8: no new small target (the header is the target).
- 1.4.11: the bar at 3:1; not colour alone (it is a shape).
- 4.1.3: the place said politely; 2.4.11: the moved header kept in view.
- 2.1.4 does not apply (modifier keys).

## Where DzGrid differs on purpose
- Dragging out never hides a column. No finger drag (Q-M3). Keys never cross a pinned edge.

## Decided (`docs/phase-6-steps/decisions.md` « Step 1 follow-ups »)
- Mac (owner): Cmd+Shift+arrows on macOS, Ctrl+Shift+arrows elsewhere.
- O2 (lead): the keyboard move stays inside its segment; pinning through the menu (a drag may cross).
- O3 (lead): locked columns keep their position number (others jump over them) and their pin items are disabled.
- O4 (lead): group headers do not move (a whole group) in this phase.

## Choices to confirm (not settled by the decisions)
None left from this sheet.

## Tests (to be written with the code)
`packages/dom/test/columns-move.test.ts` (patches, thresholds, segments, locked, Escape, swallowed click),
`columns-move-keys.test.ts` (LTR / RTL, edges, sentences, owners), `columns-drop-targets.test.ts`;
browser: drag in Chrome fr / ar RTL dark (bar on the right side, pinned edges, header alignment 1 px after a
move), Firefox and WebKit for the RTL drag and auto-scroll.

## As built (Phase 6 step 2, 2026-10-26)

- Entry `@dzgrid/dom/columns`: `columns({ drag? })` → `api(grid).move(column, -1 | 1 | 'start' | 'end', { say? })`
  (`'moved' | 'edge' | 'locked' | 'unknown'`, source `user`) and `api(grid).dropTargets.add(el, { accept, drop, label? })`;
  texts `locales/{en,fr,ar}-columns` (`COLUMNS_KEYS`, a missing one throws at setup); look `@dzgrid/theme/columns.css`
  (`.dzg-move` layer, `.dzg-move-ghost`, `.dzg-move-bar` in `--dzg-move-bar`, fallback the accent; `data-dzg-moving`,
  `data-dzg-dragging`; the host styles `data-dzg-drop="over"`).
- Order logic `columns/order.ts`, DOM-free (reused by the chooser at step 4): the full order is the model's sort over
  every column, hidden ones too; a move rewrites the ranks 0..n−1 that changed (the first move freezes them all) and the
  pin in the same patch. Locked columns (`movable: false`) keep their slot in the full order; the others are reordered,
  then poured into the free slots. A drop gap whose result would not land the column where the bar shows is not offered:
  the bar goes to the nearest gap that is, toward the column's own place first.
- **A pen does not drag a header** (review 2026-10-26, consistent with blocks and the fill, S12-Q12, in Q-M3's
  spirit): its press is a click (sort); rule 1's « mouse or pen » is read « mouse » only. Columns move with a pen
  through the keys, the menu (step 3) or the chooser (step 4).
- The click that follows a drop or a cancelled drag (Escape, a lost capture, a blur…) is swallowed: a drag never sorts;
  the swallow ends with the press's task (a later keyboard click sorts) or at the next press.
- Rules 1–21 as written, with these details: the 4 px are a straight-line distance; a press while a cell editor is open
  is a click; a thrown `drop` is reported through the grid's error report (no `invalid-drop-target` problem code: it would
  add bytes to the core, step02-plan « Done »); an edge or locked sentence by the keys is not repeated within 300 ms;
  pressing a header that does not have the focus moves the focus, which drops a block of cells by the block's own rule
  (`range-selection.md`), the drag itself never does.
- Tests: `packages/dom/test/columns-{order,texts,move,move-geom,move-keys,drop-targets,interplay}.test.ts`,
  `packages/theme/test/columns.test.ts`; browser `npm run test:browser -- --only columns` (`--engine firefox|webkit`: the
  right-to-left drag).

## Known limit (step 2)

The locked slots are kept in the **full** order, hidden columns and the other segments' columns included. When a movable
column that is hidden, or pinned on another side, sits next to a locked one, it may be the column that crosses the locked
one the other way. A key move is then not undone exactly by the reverse key. Example (`columns-order.test.ts`, « known
limit »): full order a, h (hidden), L (locked), b — shown a, L, b. Ctrl+Shift+Left on b gives b, a, L (full b, a, L, h);
Ctrl+Shift+Right then gives a, b, L, not a, L, b. Without a locked column, a move and its reverse are always exact
(1 000-seed property). To revisit with the chooser (step 4) if the owner wants it.
