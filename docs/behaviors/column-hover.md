# Column under the pointer

Written before the code (CLEANROOM). Sources: AG Grid's public option names `columnHoverHighlight` and the theme
parameter `columnHoverColor` (checklist only). Owner answer 2026-11-10 (review 6.5, 1.10.0). Entry:
`@dzgrid/dom/column-hover` (`columnHover()`), a tiny feature: the base and K.8 do not grow.

## What the user does
Moves the mouse over a wide grid of numbers and sees the whole column under the pointer lightly tinted, so the eye
follows it down to the row it reads.

## Behaviours (numbered, each one a test)
1. With `columnHover()`, the pointer over a column's header or one of its cells: the grid writes the column's id in
   `data-hover-col` on its root, and `data-col-hover` on that column's mounted header and body cells (pinned rows
   included). Leaving the grid, or a part with no column (the gap after the last column, the group rows, a full-width
   row), clears both.
2. The look: the theme variable `--dzg-column-hover-bg`, drawn over the row's own surface (as a layer, so an alternate,
   hovered or selected row keeps its colour under a translucent tint). Unset by default: nothing drawn, the attributes
   still written (an application's own CSS may read them). The focused cell keeps its own look above it.
3. The **pointer only** (mouse and pen): keyboard focus never moves it (the focused cell, its row and the header already
   say where the reader is), and a finger's touch does not (no hover on a touch screen).
4. Cheap: one `pointerover` listener on the grid; the work (attributes only, no layout read, no style read) is done at
   most once per animation frame, and only when the column under the pointer changes. A paint while a column is hovered
   (a scroll, new rows) marks the newly mounted cells of that column.
5. Right to left: nothing differs (the column is the column, whatever its side).
6. Print: not printed (the attribute is on the screen grid; the print table is apart).
7. The feature gone (`destroy`): attributes removed.

## Tests
`packages/dom/test/column-hover.test.ts` (attributes on header and cells, the frame throttle, no layout read, keyboard
and touch ignored, cleared on leaving, cells mounted later marked); browser `scripts/browser-1-10.mjs` (Chrome fr and ar,
the tint seen, axe).
