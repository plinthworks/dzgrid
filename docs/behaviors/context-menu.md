# The cell menu (right-click on a body cell)

Written before the code (CLEANROOM). Sources: the behaviour seen in other data grids and spreadsheets (a right-click
on a cell offering copy, paste, fill, export), named only, nothing read; WAI-ARIA 1.2 (`menu`, `menuitem`,
`aria-haspopup`, `aria-expanded`, `aria-keyshortcuts`), APG « menu » pattern (submenus), WCAG 2.2 (2.1.1, 2.4.3,
2.5.8, 1.4.10, 4.1.2, 4.1.3); the Async Clipboard API (`clipboard.write`, `writeText`, `readText`; a user gesture).
Plan: `docs/phase-9-steps/context-menu-plan.md`; owner answers `docs/phase-9-steps/decisions.md` (Q-CM1 A, Q-CM2 A,
Q-CM3 A, Q-CM4 sizes). Entry: `@dzgrid/dom/context-menu`, over `@dzgrid/dom/popup`; the list it draws is the column
menu's, shared (`column-menu.md` « As built », « Shared list »).

## What the user does
Right-clicks a cell of the body (or of a pinned band); or, on a focused cell, presses Shift+F10 or the Menu key
(on a Mac: Ctrl+click, VO+Shift+M with VoiceOver, Fn+Shift+F10). Picks an item with the mouse or the arrows and Enter.

## What they observe
- A short list at the pointer (under the cell when opened by a key): copy, copy with headers, cut, paste, fill down /
  right, undo / redo, expand / collapse, pin / unpin the row, export, then the application's own items.
- A right-click inside the selected block of cells keeps the block: the items act on all of it. Outside it, the
  cell clicked is focused first and the items act on it alone.
- Choosing an item does it, the menu closes, the focus is back on the grid's cell.

## Behaviours (numbered, each one a test)

**Opening**
1. A right-click on a data cell; Shift+F10 or the ContextMenu key on a focused data cell (both may also send a
   `contextmenu`: one menu, never two); on a Mac Ctrl+click and VO+Shift+M (both reach the page as `contextmenu`);
   `api.open(at, point?)`. Shift+right-click: the browser's own menu (as the column menu, O11).
2. Not on: header cells, header groups, the floating filter row (the column menu keeps the headers; without it, the
   browser's menu); a detail panel's content, a filler, a loading or a group row; a nested grid's cells (that grid's
   own menu, never the outer one's); an open editor's field (the browser's own menu, its spelling and paste: never
   prevented). A right-click on another cell while an editor is open: the editor's blur rule runs first; the menu
   opens only once the field is closed.
3. Touch (Q-CM1 A): a long press with a finger or a pen opens nothing of ours (`contextmenu` of `pointerType`
   `touch` / `pen` left alone). iOS never sends it; one behaviour on every phone. An app may add its own button
   that calls `api.open`.
4. Nothing to offer (Q-CM2 A): when the defaults (features absent) and the app's `items` give no item, the event is
   not prevented: the browser's menu shows, as without the feature.
5. One menu per grid, the column menu included: a cell menu closes a column menu, and back.

**The block**
6. A press inside the current block (its box: row keys and visible columns; a merged cell by the row under the
   pointer): the press's default is prevented, block and focus stay, the menu acts on the whole block. Outside it:
   the focus moves to that cell first (source `user`, the block dropped as a left click would), the menu acts on that
   cell alone. By the keys: the focused cell, inside the block when there is one.
7. A Mac's Ctrl+click is a left press (`button 0`): it never drops the block nor starts a drag; the `contextmenu`
   after it opens the menu, the click after that is swallowed (no row ticked, no sort).
8. The context (`CellMenuContext`): `row`, `key`, `column`, `value` (as the grid reads it, edits applied, not
   formatted), `block` (the block acted on, or null: the cell alone), `band` (`top`, `bottom` or null), `kernel`,
   `grid`, `say(text)`.

**Default items** (in this order, a separator between sections; absent when their feature is absent, disabled when
they cannot act now; each one does what its key does, with the key's sentence)
9. Clipboard (`use.range`): « Copier » (Ctrl+C / ⌘C), « Copier avec les en-têtes », « Couper » (Ctrl+X; with
   `use.edit` only; disabled when no cell of the block, or the cell alone, is editable), « Coller » (Ctrl+V; with
   `use.edit` only; disabled when its target — the block's first cell, or the cell — is read-only). A `canCopy` that
   refuses: « Copier » stays enabled; acting writes nothing to the clipboard and says the range's « Copie non
   autorisée » (`range.noCopy`). Opened outside the block, the items are built once the focus moved to the cell. The system clipboard: `navigator.clipboard.write` (text/plain and
   text/html) called inside the click or key, before any wait; `writeText` where `ClipboardItem` is missing; `readText`
   for paste. Refused or missing: one sentence « Utilisez Ctrl+C pour copier » / « Utilisez Ctrl+V pour coller » (⌘ on
   a Mac).
10. Cut never loses data: the copy is written first; the cells are cleared only when the write succeeded and the
    block is still the same.
11. Fill (`use.fill` and `use.range`): « Recopier vers le bas » (Ctrl+D), « Recopier vers la droite » (Ctrl+R; « vers
    la gauche » meaning in Arabic). With `fill({ along: 'row' })` « vers le bas » is absent; with `'column'` « vers la
    droite » is absent (the fill api says its `along`).
12. Undo (`use.edit`): « Annuler » (Ctrl+Z / ⌘Z), « Rétablir » (Ctrl+Y / ⇧⌘Z); disabled when nothing to undo / redo.
13. Tree (`use.tree`), a parent row only: « Déplier » or « Replier » by its state, through the tree's own toggle (its
    sentence). A leaf, or a row always open (`fixedOpen`): absent.
14. Pinned rows (`use.pinned`, Q-CM3 A): on a body row « Épingler en haut », « Épingler en bas » (disabled when that
    row is already in that band); on a band's row « Désépingler ». The row is copied into the band (it stays in the
    body); `onPin({ top, bottom })` tells the app, which keeps its pinned rows. Sentences `cmenu.pinnedTop`,
    `cmenu.pinnedBottom`, `cmenu.unpinned`.
15. Export (`use.csv`): « Exporter en CSV » (the displayed rows, as the export's own button).
16. Then the application's items: `items(ctx, defaults)` may filter, reorder, add, give submenus and parts. A
    throwing `items`: the defaults, reported; a throwing `action`: the menu closed, reported.

**Inside the menu** (the shared list, `column-menu.md` 18–22)
17. ArrowDown / ArrowUp wrap, Home / End, type-ahead, Enter / Space act, disabled items focusable and inert, Tab and
    Escape close.
18. Submenus: an item with `submenu` has `aria-haspopup="menu"` and `aria-expanded`; it opens beside it toward the
    inline end on the forward arrow (ArrowRight; ArrowLeft in Arabic), Enter, Space, a click or a 300 ms hover; the
    back arrow or Escape closes it alone, the focus back on its item; an item inside acts and closes the whole menu.
    A press inside a submenu never closes its parent. Its own `action` is ignored. One level is advised.
19. Placement: by a pointer its start corner 2 px under the pointer (leftward in Arabic); by the keys under the
    focused cell, start edges aligned, above when there is no room; inside the window, scrolling within. Top layer.

**After**
20. After an item or Escape: the focus back on the grid's focused cell, the block intact unless the item changed it.
21. Closes on its own when its row leaves the displayed rows, its column is hidden, the direction or the language
    changes, the grid is destroyed (no focus moved then).

## Keyboard

| Where | Key | Result |
|---|---|---|
| data cell | Shift+F10, Menu key (Mac: Fn+Shift+F10) | open, first item focused |
| data cell, Mac | Ctrl+click, VO+Shift+M | open (`contextmenu`) |
| menu | ArrowDown / ArrowUp, Home / End, letter | move (wraps), type-ahead |
| menu | Enter, Space | do the item, close; on a submenu item: open it |
| menu | ArrowRight (ArrowLeft in RTL) | open the submenu |
| submenu | ArrowLeft (ArrowRight in RTL), Escape | close it, focus on its item |
| menu | Escape, Tab | close, focus back on the cell |

## Texts (`locales/{en,fr,ar}-context-menu`, `CONTEXT_MENU_KEYS`; a missing key: `TypeError` at setup)
The plan's §5 table: `cmenu.label`, `copy`, `copyHeaders`, `cut`, `paste`, `useCopyKey`, `usePasteKey`, `fillDown`,
`fillEnd`, `undo`, `redo`, `expand`, `collapse`, `pinTop`, `pinBottom`, `unpin`, `pinnedTop`, `pinnedBottom`,
`unpinned`, `exportCsv`. The copied / cut / pasted sentences are the range's own. The Arabic is reviewed by the owner.

## Right to left
The menu opens leftward from the pointer; a submenu toward the inline end (left); its mark mirrored. The block's box
is logical (row keys and column ids), never pixels.

## WCAG notes
2.5.8: items at least 24 px tall (32 px in the theme). 2.1.1: every item by keys; the menu is reached by Shift+F10 and
the Menu key. 4.1.2: `aria-haspopup`, `aria-expanded`, `aria-disabled`. 1.4.10: fits 320 px. Forced colours: system
colours on the focused item and the submenu mark.

## Decided (owner, 2026-11-02, `phase-9-steps/decisions.md`)
- Q-CM1 A: no menu on a touch long press. Q-CM2 A: nothing to offer → the browser's menu. Q-CM3 A: pin copies the row
  into the band, the app told by `onPin`. Q-CM4: sizes as estimated.

## Tests
`packages/dom/test/context-menu*.test.ts` (opening, block, items, clipboard, app items and submenus), Angular
`packages/angular/test/context-menu-template.test.ts`; browsers `scripts/browser-context-menu.mjs`.
