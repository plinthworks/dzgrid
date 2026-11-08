# Moving rows

Written before the code (CLEANROOM). Sources: the public pages of data grids about dragging rows (a handle at the start
of a row, a line between two rows showing where it lands, several selected rows dragged at once, a row dropped onto
another one in a tree becomes its child, the grid either reordering by itself or only telling the application), WAI-ARIA
1.2 (grid and treegrid; `aria-grabbed` and `aria-dropeffect` are deprecated since ARIA 1.1 and not used), the APG grid
pattern, WCAG 2.2 (2.1.1 keyboard, 2.5.7 dragging movements, 2.5.8 target size, 4.1.3 status messages, 1.4.11 non-text
contrast, 2.4.11 focus not obscured). Plan `docs/phase-9-steps/row-drag-plan.md`; owner answers « Row drag — owner
answers » in `docs/phase-9-steps/decisions.md` (Q-RD1…Q-RD12, all A).
Entries: `@dzgrid/core/row-drag` (the rules, pure), `@dzgrid/dom/row-drag` (the gestures), texts
`@dzgrid/dom/locales/<lang>-row-drag`, look `@dzgrid/theme/row-drag.css`. Related: `column-move.md` (the drag it
copies), `columns-chooser.md` (a handle a finger can use), `group-drop-zone.md` (drop targets), `tree-view.md`,
`selection.md`, `context-menu.md`.

## What the user does
Presses the grip (⠿) at the start of a row and drags it up or down — mouse, pen or finger; or, on a focused cell,
presses Alt+Shift+↑ / ↓ (Option+Shift on a Mac), Alt+Shift+Home / End, and in a tree Alt+Shift+→ / ←; or right-clicks a
cell and picks « Monter », « Descendre », « En haut », « En bas » (in a tree also « Rentrer », « Ressortir »).

## What they observe
- After a few pixels a light copy of the row (or « 3 lignes ») follows the pointer and a line between two rows shows
  where it will land; in a tree the middle of a row outlines it instead: the row goes inside, as its last child.
- Near the top or the bottom of the rows the view scrolls so a far place can be reached; it never scrolls sideways.
- On release the row is in its new place, the focus on it, its place said (« Ligne 4 sur 120 »). Escape puts
  everything back.
- With the keyboard the row moves one place at a time among its siblings, the focus staying on it.
- In Arabic everything is mirrored: the grip on the right, the line's indent from the right, → outdents.

## Who reorders (owner Q-RD1 A)
The application, by default: the grid sends one `rowMove` event and changes nothing; the application gives the rows back
in their new order (the pure helper `moveRows(rows, move, getRowId)` does it in one line, flat lists and `parentId`
trees). Opt-in `rowDrag({ apply: true })`, for flat browser rows only: the grid reorders by itself (the same objects in a
new order: nothing added, updated or removed; the selection, the edits and the focus kept) and the event says
`applied: true`.

## Behaviours (numbered, each one a test)

**The grip**
1. `rowDrag()` absent: no grip, no key, no item, no event. Present: a grip drawn at the inline start of the cell of one
   column the application names (`column`, default the first visible column), on data rows only (never a group,
   totals, detail, loading row, nor a pinned row). It is `aria-hidden`, not a tab stop, a 24 × 24 px target (2.5.8),
   drawn by a character (U+283F) a host's reset cannot erase. In a tree it sits after the chevron, so it follows the
   indent. `drag: false`: no grip (the keys and the menu stay).
2. A press on the grip starts no block (`range()`), takes no focus, selects no text and is no row click.
3. The grip takes mouse, pen **and finger** (owner Q-RD9 A): `touch-action: none` on the grip only; a finger elsewhere
   scrolls the view as before.
4. While a move is refused for the whole grid (behaviour 14) the grip is drawn off (`data-dzg-off`, muted, `cursor:
   not-allowed`); a press on it says why, once per press.

**The drag**
5. A drag starts once the pointer moved **4 px** with the primary button (one finger) down on the grip; less is
   nothing. An open editor: no drag.
6. During the drag a layer (`.dzg-rmove`, `aria-hidden`, no pointer) holds a ghost (the grip column's text of the row, or
   « {n} lignes » for several, 0.8 opacity) following the pointer, and either a **line** 2 px high across the rows
   (`--dzg-move-bar`, the column move's colour, 3:1 checked) or, in a tree, an **outline** around the row it goes
   inside. The source rows are dimmed (`data-dzg-moving`); the root carries `data-dzg-dragging`.
7. **Where it lands** — a flat list: the upper half of a row puts it before, the lower half after. A tree: the upper
   quarter before, the lower quarter after, the middle half **inside** (as its last child). The line starts at the
   target level's indent (logical: from the right in Arabic). Lower quarter of an open parent whose children show:
   before its first child (the gap the eye sees). A detail panel is never split from its master: over a panel, after
   its master (under the panel).
8. **Never offered**: a row being moved, any of its descendants (a row never goes into itself), a group, totals,
   loading row; a place where nothing would change (the line is hidden); a place `canDrop` refuses (a throw counts as
   no, reported once).
9. **Auto-scroll**: near the top or bottom edge of the rows (the pinned bands and parents kept out) the view scrolls,
   faster deeper in the band (at most a row a frame); never sideways.
10. **Spring-open** (owner Q-RD4 A): a closed parent held « inside » for **0.8 s** opens (a lazy one starts loading;
    its « Chargement… » row is never a target). Leaving it before cancels the timer. Nothing is said.
11. **Release** on a place: one `rowMove` event (via `pointer`), then (managed mode) the rows reordered; the focus on the
    first moved row (the grip's column, or the column focused in that row before), scrolled into view; its place said
    once. Released on no place, outside the grid, or where nothing changes: nothing happens, nothing is said. The click
    after a drag is swallowed once.
12. **Escape** during a drag cancels it, said (`rmove.cancelled`); `pointercancel`, a lost capture, the window losing
    focus, a direction change, the moved rows gone from the rows and `destroy` cancel quietly.
13. **Several rows** (owner Q-RD3 A): the grip of a **selected** row drags every selected row shown (an « all but »
    selection: the rows shown and held that it selects), in display order, landing together in that order; in a tree
    a selected row whose ancestor is selected too travels with that ancestor. The grip of an unselected row drags it
    alone and leaves the selection. More than `maxRows` (default 1 000): refused, said (`rmove.tooMany`). A row
    `canDrag` refuses (a throw counts as no) refuses the whole gesture, said (`rmove.locked`).

**When a move is refused (owner Q-RD5 A)**
14. **Sorted** (a sort in the query) or **grouped** (`grouping()` with columns): every way is refused and says
    « Tri actif : déplacement impossible » / « Regroupé : déplacement impossible »; the grips are off, the items
    disabled. `whenSorted: 'allow'`: the event is sent anyway and the application decides (the managed mode never
    reorders sorted or grouped rows: it sends the event with `applied: false`).
15. **Filtered** (a filter or the quick search): allowed. The target is a shown row, so « before row X » keeps one meaning
    in the full list; the managed mode leaves the hidden rows where they are.
16. **Server sources** (owner Q-RD6 A: pages, `infiniteRows`, `serverSideRows`): event only — `apply: true` is ignored
    and told once (`invalid-setting`, `rowDrag.apply`); moves among the rows held (a loading row is never a target nor
    a source); the page's edge is the keyboard's edge. The application saves, then gives rows back
    (`applyTransaction`, `refresh()`).

**Keyboard (owner Q-RD8 A; 2.1.1, 2.5.7)**
17. On a focused body cell of a data row: **Alt+Shift+↑ / ↓** one place among its siblings, **Alt+Shift+Home / End**
    first / last among its siblings (Mac: Option+Shift, the same keys). Tree: **Alt+Shift+→** (the logical end: ← in
    Arabic) moves it inside the sibling before it, as its last child (that parent opens); **Alt+Shift+←** moves it out,
    right after its parent. The focus stays on the moved row, same column, scrolled into view (2.4.11).
18. At an edge nothing moves and « Déjà au bord » is said (a key held: said once per 300 ms). The new place is said once
    the keys pause for 300 ms (a key held does not queue sentences).
19. A selected focused row moves the selection's rows shown with it (behaviour 13); an unselected one moves alone.
20. The focused cell carries `aria-keyshortcuts` with these keys (only the focused cell, no other); the grip has none.
21. Note for Windows: Alt+Shift can be the system's « switch keyboard layout » chord. Pressed with an arrow it is not
    taken by Windows in the usual set-up, but this has to be checked on a real Windows (the owner's check). Ctrl+Alt is
    never used (VoiceOver's keys).

**Menu (single pointer, 2.5.7; owner Q-RD12 A)**
22. `rowDrag` hands out items for the cell menu (`contextMenu({ items })`, the application adds them): « Monter »,
    « Descendre », « En haut », « En bas », and in a tree « Rentrer », « Ressortir »; each shows its keys, is
    disabled at an edge or when refused, and acts as its key (the place said at once). The menu's own bundle is
    unchanged: the labels come from the `-row-drag` texts.

**Other grids and zones (owner Q-RD7 A)**
23. `api(grid).dropTargets.add(el, { accept(keys), drop(keys), label? })`, as the column move's: while the pointer is over
    a target whose `accept` is true, the line is hidden and the target gets `data-dzg-drop="over"`; releasing there calls
    `drop(keys)` once (a throw is reported) and the grid moves nothing. Another grid's root can be a target as a whole;
    the exact gap inside another grid comes later.

**The event**
24. `{ type: 'rowMove', source, via: 'pointer' | 'keys' | 'menu' | 'api', keys, rows, target: { key, where }, parent,
    applied }` — `keys` and `rows` in display order, `target.where` `before` / `after` / `inside`, `key: null` the end of
    the list (or of the roots), `parent` the new parent's key in a tree (null: a root; always null in a flat list).
    Never a `DisplayIndex` (one version only), never a cell value in a sentence or a `Problem`.

**Announcements** (polite, one per gesture; rows named by position, never by value: rows may be health records)
25. `rmove.placed` « Ligne {n} sur {total} » (flat: among the data rows shown; a paged grid: among its page's);
    `rmove.placedLevel` « Ligne {n} sur {total}, niveau {level} » in a tree (among its siblings shown); `rmove.many`
    « {n} lignes déplacées »; `rmove.hidden` « Ligne déplacée » when the row is no longer shown (filtered out, or
    the application did not give it back yet); `rmove.edge`, `rmove.locked`, `rmove.sorted`, `rmove.grouped`,
    `rmove.refused` (a `canDrop` no on the keys and the menu), `rmove.tooMany`, `rmove.cancelled`. No sentence during a
    drag.

**Undo (owner Q-RD10 A)**
26. No grid undo for a move: Ctrl+Z stays the cell edits' and never undoes a move. The opposite key undoes it; an
    application keeps its own history if it wants one.

**Edits, blocks, motion**
27. A drag never starts while a field is open. A block (`range()`) whose rows changed order follows its own rule; the
    row numbers repaint in display order. Pinned bands are neither sources nor targets. Under reduced motion nothing
    animates (nothing animates in V1 anyway).

## Keys table

| Keys (Mac: Option+Shift) | Left to right | Right to left |
|---|---|---|
| Alt+Shift+↑ | one place up among siblings | the same |
| Alt+Shift+↓ | one place down | the same |
| Alt+Shift+Home / End | first / last among siblings | the same |
| Alt+Shift+→ (tree) | inside the sibling before (indent) | **out** (outdent) |
| Alt+Shift+← (tree) | out, after its parent (outdent) | **inside** (indent) |

## Texts

| Key | en | fr | ar |
|---|---|---|---|
| `rmove.placed` | Row {n} of {total} | Ligne {n} sur {total} | الصف {n} من {total} |
| `rmove.placedLevel` | Row {n} of {total}, level {level} | Ligne {n} sur {total}, niveau {level} | الصف {n} من {total}، المستوى {level} |
| `rmove.many` | {n} rows moved | {n} lignes déplacées | الصفوف المنقولة: {n} |
| `rmove.hidden` | Row moved | Ligne déplacée | نُقل الصف |
| `rmove.edge` | Already at the edge | Déjà au bord | الصف عند الحافة |
| `rmove.locked` | This row cannot be moved | Cette ligne ne se déplace pas | لا يمكن نقل هذا الصف |
| `rmove.sorted` | Sorted: rows cannot be moved | Tri actif : déplacement impossible | الترتيب مفعّل: لا يمكن نقل الصفوف |
| `rmove.grouped` | Grouped: rows cannot be moved | Regroupé : déplacement impossible | الصفوف مجمّعة: لا يمكن نقلها |
| `rmove.refused` | Cannot go there | Déplacement refusé ici | لا يمكن النقل إلى هنا |
| `rmove.tooMany` | Too many rows ({max} at most) | Trop de lignes ({max} au plus) | صفوف كثيرة جدًا ({max} على الأكثر) |
| `rmove.cancelled` | Move cancelled | Déplacement annulé | أُلغي النقل |
| `rmove.ghost` | {n} rows | {n} lignes | صفوف: {n} |
| `rmove.up` / `down` | Move up / Move down | Monter / Descendre | نقل لأعلى / نقل لأسفل |
| `rmove.top` / `bottom` | Move to top / Move to bottom | En haut / En bas | إلى الأعلى / إلى الأسفل |
| `rmove.in` / `out` | Indent / Outdent | Rentrer / Ressortir | إزاحة للداخل / إزاحة للخارج |

## Differs on purpose
- The grid does not reorder the application's data unless asked (`apply: true`): an application with a store (NgRx) or a
  server owns the order.
- A finger can drag rows (the grip only), unlike columns: the cell menu has no long-press.
- No « grabbed » state for assistive technology (deprecated ARIA); the keys and the menu are the accessible ways.
- No grid undo for a move; no drop at an exact gap inside another grid in V1.
- The ghost shows the grip column's text (visual only, `aria-hidden`); nothing of a row's values is said.

## As built
- API: `api(grid).move(keys, target, { say })`, `api(grid).step(key, -1 | 1 | 'start' | 'end' | 'in' | 'out', { say })`
  (silent unless `say`), `api(grid).dropTargets.add(el, t)`; the menu's items by `feature.menuItems(c)` (the context
  menu's `items` hook). No `handle: 'row'` mode in V1 (the grip only, Q-RD2).
- Angular: `(rowMove)` (and `(gridEvent)`) carries the event; `ctl.rowDrag()` (or `ctl.use(feature)`) gives the api, null without the grid (1.8.0, Phase 11 L2: room made in K.8).
- A grip's own pointer capture (a finger: the browser captures to the pressed element) is handed to the grid's root; only
  the root's lost capture cancels.
- The focused row travelling with a selected ancestor: the keys step that ancestor.
- The outline of « inside » is a box drawn in the drag layer (`.dzg-rmove-in`), not an attribute on the row (rows are
  recycled while scrolling).
- The line's indent reads the tree cell's own indent (`--dzg-tree-pad`); a tree without `tree()` drawing: level × 16 px.
