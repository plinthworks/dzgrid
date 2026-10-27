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
   `getRowId`, kept in **its own key space** (`pinnedKey(side, id)`: `p:t:` / `p:b:` and the id, length first) so a
   pinned row never clashes with a body row of the same id, and keeps its key across a `set()`. A duplicate id inside
   one side: the later one dropped, error `duplicate-row-id` (as for body rows; path `pinnedRows.top[i]`); an unusable
   id: dropped, error `invalid-row-id`.
2. Drawn with the columns' cell parts, formats, classes (`cellClass`, `rowClass` with `pinned` in its context)
   and widths; hidden columns hidden; spans do not merge across the pinned / body edge.
3. Never sorted, filtered, searched, paged, grouped or counted in the row counts said (`announce.rows`):
   shown on every page of a paged grid; the same in a tree (flat, no chevron).
4. More than 5 rows on one side: warning `too-many-pinned-rows` (path `pinnedRows.top|bottom`); still drawn.
   Together they never take more than half the view: beyond, the pinned band shows its rows in a window (whole rows,
   the top band first, at least one row each), moved by the wheel over it and by the focus going to a row outside
   it (O8); no native scroller (it would break the pinned columns' sticking). Touch panning inside it: not yet.

**Place and screen readers**
5. Top rows sit right under the last header row (after the floating filter row), `position: sticky`; bottom rows
   in a sticky foot under the body. Rows use `contain: content`, never `strict` (S11). Each band is a **sibling**
   `rowgroup` of the header and the body (never inside the header's: a rowgroup in a rowgroup is invalid). With few
   body rows the bottom band sits at the grid's foot, like a table footer (Q3).
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
    `editable(row, context, { pinned })` receiving a third argument, `pinned` = `'top' | 'bottom'` (undefined on a
    body row; Q4: the application's context is left alone), so a totals row says false there.
    `aria-readonly` per cell as in the body (`editing.md` 3).
12. Starting, ending, field keys, validation and the refusal bubble: as `editing.md`, `edit-validation.md`.
    The editor opens over the sticky cell and stays aligned while the body scrolls. **Enter stays in its region**
    (review R3, 8b-2): Enter / Shift+Enter (`enterMoves: 'down'`) in a band stops at the band's edges, and from the
    body it stops at the body's edges next to a band — Enter on the last body row does not go into the bottom band,
    Shift+Enter on the first does not go into the top band (with no band there, the body's own rule: Shift+Enter on
    the first row goes to the header). The arrows still cross (8).
13. Saving: one gesture, one request, through the same `save` handler; each change carries `pinned:
    'top' | 'bottom'` (undefined on a body row), `key` the grid's key (`p:b:…`) and `row` the application's object
    (Q5: the application finds its row by `row`). Saving marks, the running border, refusals, rollback: as `edit-save.md`.
14. **Never order-stale**: an edit of a pinned row does not mark the order out of date (they are never
    sorted or filtered); no muted look.
15. Undo / redo: pinned edits are gestures in the same history (`edit-undo.md`); the focus goes back to the
    pinned cell.
16. The application replacing the pinned rows while a cell is edited: same key kept → the field stays; key
    gone → `edit.rowRemoved` as in the body.
17. Blocks, paste, fill (Phase 5 part B) in this phase (O8; **step 8b-2**, built — « As built (8b-2) » below): a block **never crosses** the pinned / body
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
| pinned row | Ctrl+Home / Ctrl+End (Mac: Cmd+Home / Cmd+End, or Fn+Cmd+Left / Right) | first / last body row, first / last column (as in the body; O8) |
| pinned row | Ctrl+Up / Ctrl+Down (Mac: Cmd+Up / Cmd+Down) | first / last body row, the column kept |
| first body row / last bottom row | ArrowUp / ArrowDown | last top row / stays |
| pinned row | Left / Right / Home / End | inside the row, as in the body (mirrored in RTL) |
| editable pinned cell, field open | Enter / Shift+Enter (`enterMoves: 'down'`), Tab | the next row or cell **of the band**; never into the body |
| last / first body row, field open | Enter / Shift+Enter (`enterMoves: 'down'`) | stays (never into a band; review R3) |
| pinned row | Shift+arrows, Shift+PageUp / PageDown, Ctrl+Shift+Home / End | the block's moving corner inside the band; never across its edge (8b-2) |
| editable pinned cell | F2, Enter, typing, Delete | as `editing.md` |
| pinned row | Space | nothing (yes/no cell: toggle) |
| pinned row | Ctrl+Z / Ctrl+Y, Ctrl+Shift+Z (Mac: Cmd+Z / Cmd+Shift+Z, Cmd+Y) | undo / redo, as `edit-undo.md` |

## Announcements
None of their own: the reader says the row group's name on entering it and the cells as usual; saves,
refusals and undo say their own sentences (`edit-save.md`).

## Texts (`locales/{en,fr,ar}-pinned`, their own bundles: owner Q2, 120 / 140 / 170 B)
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
2. ~~The two names live in `-columns`~~ — decided: their own `-pinned` bundles (owner Q2).
3. ~~The key without the prefix~~ — decided (Q5): the grid's key and the application's `row`, plus `pinned`.

## Tests (to be written with the code)
`packages/dom/test/pinned-rows.test.ts` (keys, counts, indexes, alignment logic, live set, duplicates),
`pinned-rows-edit.test.ts` (editable per `context.pinned`, save payload, never stale, undo, row replaced,
blocks inside a band, paste clipped), conformance for the focus moves across bands; browser: three engines,
sticky foot in RTL, 1 px alignment with pinned columns and horizontal scroll.

## As built (Phase 6 step 8b-1, 2026-10-27)

`@dzgrid/dom/pinned-rows` (`pinnedRows()`, `PINNED_KEYS`, `api(grid)`: `set`, `get`, `rows(side)`), texts
`locales/{en,fr,ar}-pinned`, look `@dzgrid/theme/pinned-rows.css`. Blocks, paste and the fill inside a band are
step 8b-2 (rules 17–18): until then a block started in a band is inert (it never leaves its row, copies and
changes nothing).

- **Core seam** (+36 B): `setPinned(kernel, store)` (internal): `kernel.rowOf(key)` (a body row, else a pinned
  one, with `pinned` set), `focus.set` accepts a pinned key the store holds, a pinned focus is kept across the
  rows' changes (its column fixed as any cell's), `editable` reads the pinned row and tells the rule `{ pinned }`;
  a pinned key is never selected (`selection.toggle` / `only` refuse it, on server pages too). `pinnedKey(side, id)`
  is id based now; `assignKeys(ids, path, make)` takes the key maker. The problem code `too-many-pinned-rows` is a
  type only (the base ships no byte for it).
- **`@dzgrid/core/edit`**: a pinned cell's overlay id is its key (never a body row's of the same id); its edits
  tell no column to the rows (never order-stale, rule 14); `pinnedChanged` (`api.set`) sweeps its saved values and
  a removed row's changes as `rows.subscribe` does for the body; `SaveChange.pinned`.
- **DOM base seams** (+99 B): a renderer spawned as a **peer** (`spawn(layer, true)`): `keyOf`, `cell`, `partAt`,
  `forEach` find the bands' rows after the body's (the tree's pinned parents are copies, never peers); the paint
  counts the bands in `aria-rowcount` and numbers the body after the top band (`g.pins`); the router asks `g.move`
  first (the bands' moves, then the spans', then the grid's own); `ensureVisible` scrolls sideways before it looks
  for a body row (a pinned cell's far column).
- **The feature**: the bands' layout is written once on the elements (sticky, `overflow: clip`, `contain: content`,
  above the body; no style element, nothing for a CSP); the body's view is the view less the bands (the geometry
  port's `read` wrapped: window, reveal, page keys and the scroll's end all clear of them, WCAG 2.4.11); the bands'
  heights are computed (rows × row height), never read, the top band's offset from the header rows' count (a row
  each: checked to 1 px in Chrome). Key moves: a pure `crossBand` (`pinned-rows/band.ts`, conformance
  `cases/pinned-rows/`); inside a band, the grid's own moves over its rows. The editors' Tab walks the band's rows
  (`g.rowsOf`), their Enter stays inside it. A focused pinned row removed by `set`: the nearest row of its band,
  else the body's first row, else the header. A click on a pinned cell focuses it; it fires no `cellClicked` /
  `rowClicked` (those name body rows), and shows no overflow tooltip (R7).
- **Sizes**: core 29 001 / 29 150; DOM base 21 954 / 22 400; `dom/pinned-rows` 2 080 / 2 150 (ceiling 2 300: the
  editing glue, ~180 B, needs more than 2 000, owner Q2); texts 116 / 130 / 156 (120 / 140 / 170);
  `pinned-rows.css` 301 / 350; `core/edit` 3 136 / 3 150.
- **Known limits**: touch panning inside a capped band; `rowAt` (rows of their own heights) is not used for a page
  from a band (a page is `page` rows); a tree's pinned parents and a top band are not checked together.

## As built (Phase 6 step 8b-2, 2026-10-27): blocks, the clipboard and the fill in a band (17, 18; owner Q1, O8)

- **A block lives in one region**: its anchor's band, else the body. `range()` and `fill()` read a block's rows from
  `g.rowsOf(anchor)` (the band's) or the body's, so its box, its tint and edges, `aria-selected`, its size said, a
  copy, a paste, Delete, a cut, Ctrl+D / Ctrl+R, the keyboard fill mode, the handle and bulk (Ctrl+Enter) all work
  inside a band. Two corners in different regions make no block: the API refuses it (`unknown-row-id`), a
  Shift+click from a pinned cell onto the body (or back) drops the block.
- **Keys**: Shift+arrows, Shift+PageUp / PageDown and Ctrl+Shift+Home / End on a pinned cell move the corner inside
  the band (`crossBand`'s `inside`: the band's edges stop it, a page or an edge key is the grid's own move over the
  band's rows); from the body they never go into a band. Shift+Space on a pinned cell: its row. Ctrl+A stays the
  body's (O8).
- **Mouse**: the block's press, drag, Shift+click and the click swallowed after a drag are listened to on the view
  (the bands are siblings of the body); the cell under the pointer comes from the band when the gesture started in
  one (`g.pinAt`: clamped to the rows the band shows — a drag past its edge stops at its last row, never a body row),
  else from the body as before. The body's rows are measured from the top band's foot (`g.pinTop`; before, a body
  drag under a top band landed rows too low). A gesture in a band scrolls the view sideways only.
- **Paste**: a paste past a band's last row counts the rest `outside` (« hors de la grille »). The band's rows
  replaced (`api.set`) without a corner's row: the block dropped, said once.
- **Values as shown**: a copy and a fill read a pinned cell through the edit overlay like a body cell (its id: the
  key after a NUL, review R1, never a body row's — not even a body id whose text is the key).
- The column menu's « Fill down / right » acts on a focused pinned cell too.
- Sizes: `dom/range` 5 002 / 5 050 (ceiling 5 200, Q1), `dom/fill` 3 042 / 3 100 (ceiling 3 150, Q1),
  `dom/pinned-rows` 2 145 / 2 150; core, the DOM base unchanged; `dom/edit` 4 150 / 4 150 (R1).
- Tests: `pinned-rows-range.test.ts` (keys, API, clipboard, fill, bulk, the mouse, the handle), `pinned-rows-band`
  (`inside`), `pinned-rows-edit` (R1, R3), `column-menu-block`; browser `--only pinned-rows` (`bandBlocks`, every
  engine).
