# Pinned rows (top and bottom), editable

Written before the code (CLEANROOM). Sources: the public documentation of data grids about rows pinned to
the top or the bottom (a totals or reference row that stays in view while the body scrolls, never sorted or
filtered), WAI-ARIA 1.2 (grid, `rowgroup`, `aria-rowcount`, `aria-rowindex`, `aria-readonly`), APG grid,
WCAG 2.2 (2.1.1, 2.4.11 focus not obscured, 1.3.1, 4.1.2, 4.1.3). Plan D13 **as changed by the owner**:
decision Q-P = **C** — top and bottom, never sorted or filtered, keyboard-reachable, **and editable in this
phase through the Phase 5 edit layer** (`editing.md`, `edit-save.md`, `edit-undo.md`, `edit-validation.md`);
their cost measured at their step. Entry: `@dzgrid/dom/pinned-rows` (`pinnedRows()` feature) plus base seams.

## What the user does
Reads a totals row fixed under the headers or at the bottom of the grid while scrolling; moves onto it with
the arrows; edits one of its cells as any other (F2, Enter, typing), saves, undoes.

## What they observe
- The pinned rows stay in view, top rows under the headers, bottom rows above the grid's bottom edge; the body
  scrolls between them; their columns stay aligned with the headers, pinned columns and sideways scroll
  included.
- Sorting, filtering, searching and paging never move, hide or repeat them.
- Their editable cells edit exactly like body cells: the same keys, the same saving marks, refusals and undo.

## Behaviours (numbered, each one a test)

**Data**
1. `pinnedRows({ top?: T[], bottom?: T[] })`, live (`api.set({ top, bottom })`); each row keyed by the grid's
   `getRowId`, kept in **its own key space** (`top:` / `bottom:` prefixed internally) so a pinned row never
   clashes with a body row of the same id. A duplicate id inside one side: the later one dropped, warning
   `duplicate-row-id`.
2. Drawn with the columns' cell parts, formats, classes (`cellClass`, `rowClass` with `pinned` in its context)
   and widths; hidden columns hidden; spans do not merge across the pinned / body edge.
3. Never sorted, filtered, searched, paged, grouped or counted in the row counts said (`announce.rows`):
   shown on every page of a paged grid; the same in a tree (flat, no chevron).
4. More than 5 rows on one side: warning `too-many-pinned-rows` (path `pinnedRows.top|bottom`); still drawn.
   Together they never take more than half the view: beyond, the pinned band scrolls inside itself (O8).

**Place and screen readers**
5. Top rows sit right under the last header row (after the floating filter row), `position: sticky`; bottom rows
   in a sticky foot under the body. Rows use `contain: content`, never `strict` (S11).
6. Each side is a `rowgroup`; its rows are `row`s of `gridcell`s, counted in `aria-rowcount`; `aria-rowindex`
   runs header rows → top rows → body rows → bottom rows (on a paged grid: the page's rows). The rowgroup is
   named `pinned.top` / `pinned.bottom` (choice 1).
7. Not selectable: no checkbox in the box column (an empty cell there), Space selects nothing (an editable
   yes/no cell toggles as in the body), `aria-selected` absent; Ctrl+A blocks (`range-selection.md`) do not
   include them.

**Keyboard**
8. ArrowDown from the last header row goes to the first top row, then to the first body row; ArrowUp back
   the same way. ArrowDown from the last body row goes to the first bottom row; ArrowUp from it back to the
   last body row. Left / Right / Home / End inside a pinned row as in the body (mirrored in RTL).
9. PageDown / PageUp move within the body and stop at its edge; from a pinned row they go into the body by a
   page. Ctrl+Home / Ctrl+End (Cmd on a Mac) go to the first / last **body** row (unchanged; O8).
10. The focused cell of a pinned row is always fully visible (it is in view by nature); a body cell is kept
    clear of both pinned bands when scrolled to (WCAG 2.4.11).

**Editing** (Q-P = C)
11. A pinned row is an **editable row** for the edit layer: a cell is editable when its column says so,
    `editable(row, context)` receiving `context.pinned` = `'top' | 'bottom'` (a totals row says false there).
    `aria-readonly` per cell as in the body (`editing.md` 3).
12. Starting, ending, field keys, validation and the refusal bubble: as `editing.md`, `edit-validation.md`.
    The editor opens over the sticky cell and stays aligned while the body scrolls.
13. Saving: one gesture, one request, through the same `save` handler; each change carries `pinned:
    'top' | 'bottom'` and the row's key as given (without the internal prefix). Saving marks, the running
    border, refusals, rollback: as `edit-save.md`.
14. **Never order-stale**: an edit of a pinned row does not mark the order out of date (they are never
    sorted or filtered); no muted look.
15. Undo / redo: pinned edits are gestures in the same history (`edit-undo.md`); the focus goes back to the
    pinned cell.
16. The application replacing the pinned rows while a cell is edited: same key kept → the field stays; key
    gone → `edit.rowRemoved` as in the body.
17. Blocks, paste, fill (Phase 5 part B) in this phase (O8): a block **never crosses** the pinned / body
    edge; a block inside one pinned band works (copy, paste, Delete, fill inside the band); a paste that
    runs past the band's last row counts the rest `hors de la grille`. Ctrl+D / Ctrl+R within the band only.
18. Bulk (Ctrl+Enter) applies to a block inside the band only.

**Elsewhere**
19. Auto-size samples pinned rows (`column-resize.md` 11); auto height measures them (`auto-height.md`).
20. CSV export: not written by default; `include: ['pinned']` later (not this phase). Print: top rows after
    the header, bottom rows at the end (`print.md`).
21. `GridState` does not save pinned rows (they are the application's data).

## Keyboard

| Where | Key | Result (RTL: Left / Right mirrored) |
|---|---|---|
| last header row | ArrowDown | first top pinned row |
| first top pinned row | ArrowUp | last header row |
| last top pinned row | ArrowDown | first body row |
| last body row | ArrowDown | first bottom pinned row |
| pinned row | PageDown / PageUp | into the body by a page |
| anywhere | Ctrl+Home / Ctrl+End (Mac: Cmd+Home / Cmd+End, or Fn+Cmd+Left / Right) | first / last body row (O8) |
| editable pinned cell | F2, Enter, typing, Delete | as `editing.md` |
| pinned row | Space | nothing (yes/no cell: toggle) |
| pinned row | Ctrl+Z / Ctrl+Y, Ctrl+Shift+Z (Mac: Cmd+Z / Cmd+Shift+Z, Cmd+Y) | undo / redo, as `edit-undo.md` |

## Announcements
None of their own: the reader says the row group's name on entering it and the cells as usual; saves,
refusals and undo say their own sentences (`edit-save.md`).

## Texts (`locales/{en,fr,ar}-columns`, choice 2)
| Key | en | fr | ar |
|---|---|---|---|
| `pinned.top` | Rows pinned at the top | Lignes épinglées en haut | صفوف مثبّتة في الأعلى |
| `pinned.bottom` | Rows pinned at the bottom | Lignes épinglées en bas | صفوف مثبّتة في الأسفل |

## Right to left
Logical insets only; the pinned start columns of a pinned row sit on the right; sticky foot checked in three
engines in RTL (S2, S11).

## WCAG notes
- 2.4.11: body cells scrolled clear of both bands; the bands capped at half the view (4).
- 1.3.1 / 4.1.2: rowgroups named, rows counted; `aria-readonly` per cell.
- 2.1.1: every pinned cell reachable and editable by keys; 4.1.3: edits said as in the body.

## Where DzGrid differs on purpose
- Pinned rows are editable through the same layer as the body, with the same saving and undo; they never
  become stale. Their key space is separate.

## Decided (`docs/phase-6-steps/decisions.md`)
- Q-P = C (owner): editable through the edit layer.
- O8 (lead, « Step 1 follow-ups »): blocks, paste and fill inside one band, never across; Ctrl+Home / End stay
  on body rows; the bands take at most half the view.
- C6 (lead): `editing.md` rule 1 widened for pinned rows at their step.

## Choices to confirm (not settled by the decisions)
1. Each band named as a rowgroup (some readers say it on entry, some never).
2. The two names live in `-columns` (or a small `-pinned` bundle).
3. The save carries `pinned` and the key without the prefix (the application decides where to write a
   totals row).

## Tests (to be written with the code)
`packages/dom/test/pinned-rows.test.ts` (keys, counts, indexes, alignment logic, live set, duplicates),
`pinned-rows-edit.test.ts` (editable per `context.pinned`, save payload, never stale, undo, row replaced,
blocks inside a band, paste clipped), conformance for the focus moves across bands; browser: three engines,
sticky foot in RTL, 1 px alignment with pinned columns and horizontal scroll.
