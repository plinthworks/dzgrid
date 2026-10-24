# Keys in a tree

Sources: the APG treegrid pattern (keyboard interaction for rows that expand), WAI-ARIA 1.2,
WCAG 2.2 (2.1.1 keyboard, 2.4.3 focus order, 2.4.7 focus visible). Phase 4 plan D6; lead decision
(Right/Left/`*` on the tree column, mirrored in right-to-left).

## What the user does
With the focus on a cell, presses the arrows, `*`, Enter, Space, Home, End, PageUp, PageDown, in a
left-to-right page and in an Arabic (right-to-left) one.

## What they observe
- In the tree column, the key toward the reading direction (→ in French, ← in Arabic) opens a
  closed parent; on an open parent or a leaf it moves to the next column, as in any grid.
- The key against the reading direction (← in French, → in Arabic) closes an open parent; on a
  closed parent or a leaf, it moves the focus to the parent row, same column. On a root that is
  closed or a leaf, it does nothing in the tree column.
- `*` opens every sibling of the focused row (the rows of the same parent); nothing closes.
- Outside the tree column, the arrows move between cells as on a flat grid.
- Up and Down go through the rows shown, whatever their level; Home and End, PageUp and PageDown,
  Ctrl+Home and Ctrl+End work as on a flat grid.
- Enter and Space keep their flat-grid meaning (Enter edits or activates, Space selects): they do
  not open a parent.
- Closing a parent while the focus is inside it, by the keyboard, the mouse or the application,
  puts the focus on that parent (or the nearest ancestor still shown), same column.

## What DzGrid does
- **One seam in the key router**: a feature may claim a key before the grid's own moves
  (`FeatureHandle.keys?(event, at, owner)`; true = handled). The tree uses it only when the
  focused cell is in the tree column, and only for the keys above. Directions are read through the
  grid's existing intent mapping, so "forward" is → in left-to-right and ← in right-to-left: the
  tree never tests the arrow names itself.
- **Forward**: closed parent → open it (`rows.expand`, source `user`), focus stays; otherwise the
  usual column move.
- **Back**: open parent → close it, focus stays; closed parent or leaf with a parent → focus the
  parent row, same column, scrolled into view; a root → nothing.
- **`*`**: opens the closed siblings that have children, one `rowExpanded` event, one sentence
  ("5 rows expanded").
- **Focus fallback** (D6): a collapse that hides the focused row moves the focus to the nearest
  shown ancestor (`parentOf`), whatever caused it. A row removed while hidden does not move the
  focus.
- **Announcements**: "Service 50 expanded, 100 rows" / "Service 50 collapsed" (the tree column's
  text as the name), said once per action in the live region; `aria-expanded` changes on the row
  too.
- **Modifiers**: with Ctrl, Alt, Meta or Shift held, the tree claims nothing (Shift+arrows stay
  range moves, Alt+Down opens a filter popup in a header).
- **Editing (Phase 5, formerly Part D)**: in an editor, the arrows belong to the editor; the tree claims nothing. On a tree-column cell (no editor open), the tree's keys win: `*` opens the siblings and never starts an edit there (F2, Enter or a double click do; any other printable character still starts one). `editing.md` 6. Built and pinned at Phase 5 step 8 (`edit-tree.test.ts`, browser `--only tree`): in the tree column's field Left and Right move the caret in both directions (the row never opens or closes) and `*` is typed; on another editable column `*` starts an edit; the chevron clicked while editing keeps the text, then toggles; the announcement says the edited name (« Patient One collapsed »). An undo onto a row under a closed parent gives the value back where it is: the focus stays, nothing opens (owner S8-O4).

## Where DzGrid differs on purpose
- Left/Right in the tree column are not column moves when they can open, close or go to the
  parent (APG), but stay column moves on an open parent (forward) and a root leaf (forward):
  the user can still reach the other columns from the tree column with the arrows alone.
- No typeahead (APG optional): a grid of thousands of rows has the quick search for that.

## Tests (to be written with the code)
Step 4: `packages/dom/test/tree-keys.test.ts` — each key on a closed parent, an open parent, a
leaf, a root, in LTR and RTL (the same expected moves, mirrored keys); `*`; modifiers ignored;
focus fallback after a collapse by key, by click, by `rows.expand` from the API, and after a
filter; announcements once; outside the tree column, flat moves unchanged (the existing key tests
pass without edits). Browser: `npm run test:browser -- --only tree` (real keys, French and Arabic).
Manual: `docs/a11y-protocol.md` §16.
