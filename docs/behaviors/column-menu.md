# The column menu (⋮)

Written before the code (CLEANROOM). Sources: the public documentation of data grids about a column's
menu (a button in the header opening sort, pin, size, hide and column choices), WAI-ARIA 1.2 (`menu`,
`menuitem`, `menuitemradio`, `separator`, `aria-haspopup`, `aria-expanded`, `aria-keyshortcuts`), APG
« menu button » and « menu » patterns, WCAG 2.2 (2.1.1, 2.4.3 focus order, 2.4.11, 2.5.8, 1.4.10 reflow,
1.4.13 content on hover, 4.1.2, 4.1.3). Plan D7, D10; owner decisions Q-M1 (A, full menu), Q-M2 (A, button
and right-click), Q-K1 (A, Shift+F10 / Menu key; Alt+ArrowDown stays the filter's), Q-R2 (an optional
density line); `decisions.md` « Step 1 follow-ups » (O1, O3, O11, C3, C5, Mac keys). Entry: `@dzgrid/dom/column-menu`, over `@dzgrid/dom/popup`.

## What the user does
Hovers or focuses a header and clicks its ⋮ button; or right-clicks the header; or presses Shift+F10 or
the Menu key on a focused header (on a Mac: Ctrl+click, or VO+Shift+M with VoiceOver; Alt+ArrowDown on a column without a filter popup). Picks an item with the
mouse or the arrows and Enter.

## What they observe
- A short list under the button: sort, pin, size, move, filter, hide, choose columns, reset, and the
  application's own items. The current sort and pin are ticked.
- Choosing an item does it and closes the menu; the focus is back on the header.
- Escape or a click elsewhere closes it without doing anything.
- In Arabic the button sits at the header's left end and the menu opens toward the right edge's mirror.

## Behaviours (numbered, each one a test)

**The button**
1. A `<button>` near the header's **inline end**. **Order of the header's decorations**, from the label
   toward the inline end: the label, the sort mark, the filter button, **the ⋮ button**, **the reapply mark
   last** (`edit-reapply.md` 4–5), then the resize edge. Hit area at least 24 × 24 px (`--dzg-target-min`),
   drawn as three vertical dots (a shape); the targets never overlap one another nor the resize edge.
   Named `menu.button {column}`; `aria-haspopup="menu"`, `aria-expanded` while open; `tabindex="-1"` (the
   header stays one tab stop).
2. Shown when the header is hovered or holds the focus (`:focus-within`), while its menu is open, and
   **always** on a screen without hover (`(hover: none)` or `(any-pointer: coarse)`). Hidden is
   `opacity: 0` with its space kept (the label never jumps). Not shown on group headers, floating filter
   cells, columns with `menu: false` (a new type-only `ColumnDef` field).
2a. **Minimum header width**: below 96 px of column width (`--dzg-menu-min-header`, read from the column's
   width in the core, never by a layout read) the ⋮ button is not drawn, so the 24 px targets left (filter
   button, reapply mark) keep their room. The menu stays reachable by right-click, Shift+F10, the Menu key,
   Alt+ArrowDown (no filter popup) and, on a Mac, Ctrl+click and VO+Shift+M (4). The header's
   `aria-keyshortcuts` is unchanged (the keys still work).
3. A click on it never sorts and never starts a column drag.

**Opening**
4. The button (click, or Enter / Space while it is focused); a right-click on a column header (the browser's
   own menu is replaced; Shift+right-click keeps the browser's, O11); **Shift+F10** or the **Menu key**
   on a focused column header (both fire `contextmenu` in some browsers: one menu, never two); **Alt+ArrowDown**
   on a focused column header **when the column has no filter popup** (C3, per column; with a popup it keeps
   opening the filter, `filter-ui.md`); `openColumnMenu(column)` on the feature.
   - **Alt+ArrowDown hand-over**: the filters feature handles Alt+ArrowDown only when it opens a popup; on a
     column with no popup it leaves the key **unhandled** (not prevented, not stopped: as built in
     `filters/menu.ts`), and the menu feature, listening after it, takes it. Without the menu feature the key
     stays the page's.
   - **On a Mac** (no Menu key; Shift+F10 needs fn on most Mac keyboards): **Ctrl+click** on a header and
     VoiceOver's **VO+Shift+M** (« open shortcut menu ») both reach the page as a `contextmenu` event, which
     opens the menu (keyboard: the focus moves to its first item). Fn+Shift+F10 works too.
5. **`aria-keyshortcuts` is built in one place.** The base header owns the attribute and joins, in a fixed
   order, the shortcut lists each feature declares for that header (`decorateHeader` returns its list instead
   of writing the attribute): filters `Alt+ArrowDown` when the column has a popup; the menu `Shift+F10` (and
   `Alt+ArrowDown` when the column has no popup); the resize mode `Alt+R`; moving `Control+Shift+ArrowLeft
   Control+Shift+ArrowRight` (`Meta+…` on a Mac). No feature writes the attribute itself, so the filter's
   value can never wipe the menu's (today `filters/menu.ts` sets it alone: changed with step 3). Duplicates
   dropped; empty list: no attribute.
6. One menu per grid: opening another closes the first. A column outside the column window does not open
   its menu (as the filter popup).
7. Placement: by the button or a key, under the header, its **end** edge aligned with the button's end edge,
   flipped above when there is no room below; by right-click, at the pointer (its start corner there). Top
   layer (`/popup`), the grid's `dir`, never clipped by a host's `overflow`. At 320 CSS px wide (1.4.10) it
   fits the view, scrolling inside if taller than the view.

**Contents** (in this order; separators between sections; an item is absent when its feature is absent,
disabled when it cannot act now)
8. **Sort** (radio group): « Tri croissant », « Tri décroissant », « Sans tri »; the current one checked.
   Choosing one replaces the whole sort with this column alone (multi-sort stays Shift+click / Shift+Enter).
   Absent for a column that cannot sort.
9. **Pin** (radio group): « Épingler au début », « Épingler à la fin », « Ne pas épingler ». Disabled for
   `movable: false` (`column-move.md` 13, O3).
10. **Size**: « Ajuster cette colonne », « Ajuster toutes les colonnes » (auto-size), « Élargir » and
    « Rétrécir » (±10 px each click, **the menu stays open**, the single-pointer way of WCAG 2.5.7,
    `column-resize.md` 9), « Redimensionner au clavier » (the resize mode). Present only when `columns()`
    gives auto-size and resize (Phase 6 step 7; before it these items are absent).
11. **Move**: « Déplacer vers le début », « Déplacer vers la fin » (one place, inside the segment, as
    Ctrl+Shift+arrows; the no-drag way, WCAG 2.5.7). Disabled at the edge and for `movable: false`.
12. « Filtrer… » when the column has a filter popup: opens it, anchored to the header (the filter feature's
    own `openFilter`, no import of `/filters`).
13. « Masquer la colonne »: disabled for `hideable: false` and for the **last visible column** (O1).
14. « Choisir les colonnes… »: opens the chooser (`columns-chooser.md`), anchored to the header; present when
    `columnsChooser()` is on the grid.
15. « Réinitialiser les colonnes »: back to the columns as the application defined them (order, widths,
    pins, hidden, groups open), one `column.state` patch; sort and filters untouched.
16. **Density** (radio group, only with `columnMenu({ density: true })`, off by default: Q-R2, C5; `density.md`): « Compacte »,
    « Normale », « Aérée ». Absent when `rowHeight` is a number.
17. The application's items: `columnMenu({ items(column, defaults) => MenuItem[] })` may reorder, remove or add
    (`{ id, label, action, disabled?, checked?, icon? }`); a thrown `items` gives the defaults and one
    `invalid-menu` problem (path `columnMenu.items`, no row data).
    With `fill(blocks, { along: 'row' })` (1.1.0, fill.md 26) « Fill down » does nothing; the host removes it:
    `items: (col, defaults) => defaults.filter((i) => i.id !== 'fill.down')` (`fill.end` with `along: 'column'`).

**Keys inside** (APG menu; the menu owns every key, `data-dzg-owner="popup"`)
18. ArrowDown / ArrowUp: next / previous item, wrapping; disabled items stay focusable (APG),
    `aria-disabled="true"`, and do nothing; Home / End: first / last. A printable character moves to the next
    item starting with it (type-ahead, folded as the quick search: case, accents, Arabic hamza forms).
19. Enter or Space: does the item and closes; a radio item checks and closes. ArrowLeft / ArrowRight: nothing
    (no submenu in this phase).
20. Escape: closes, the focus back on the header (on the button if it was focused). Tab / Shift+Tab: closes
    and the focus goes back to the header (choice 1).
21. A pointer press outside closes it as Escape (the press's own target then acts).

**After an item**
22. The focus goes back to the column's header — moved with its column, or to the nearest visible header
    when the column was hidden — never to the page's body. « Filtrer… » and « Choisir les colonnes… » hand the
    focus to what they open.
23. One sentence per action (below); sort says the sort's existing sentence.
24. The menu closes on its own when its column leaves, the definitions change, the direction or language
    changes, the grid is destroyed (no focus moved then).

## Keyboard

| Where | Key | Result (RTL: same, the menu is vertical) |
|---|---|---|
| column header | Shift+F10, Menu key (Mac: Fn+Shift+F10) | open the menu, first item focused |
| column header, Mac | Ctrl+click, VO+Shift+M (VoiceOver) | open the menu (`contextmenu`) |
| column header, no filter popup | Alt+ArrowDown (Mac: Option+ArrowDown) | open the menu (the filters feature leaves it unhandled) |
| column header, filter popup | Alt+ArrowDown | the filter popup (unchanged) |
| menu | ArrowDown / ArrowUp | next / previous item (wraps) |
| menu | Home / End | first / last item |
| menu | letter | type-ahead |
| menu | Enter, Space | do the item, close (« Élargir » / « Rétrécir »: stay open) |
| menu | Escape, Tab, Shift+Tab | close, focus to the header |

## Announcements
Polite: `menu.pinnedStart` / `menu.pinnedEnd` (« Nom épinglée au début »), `menu.unpinned`, `menu.hidden`,
`menu.resetDone`; the move
items say `move.placed`; auto-size says `size.auto`; density `density.changed`. Opening says nothing of its
own (the reader says the menu and its first item).

## Texts (`locales/{en,fr,ar}-columns`)
| Key | en | fr | ar |
|---|---|---|---|
| `menu.button` | {column} column menu | Menu de la colonne {column} | قائمة العمود {column} |
| `menu.label` | {column} column | Colonne {column} | العمود {column} |
| `menu.sortAsc` | Sort ascending | Tri croissant | ترتيب تصاعدي |
| `menu.sortDesc` | Sort descending | Tri décroissant | ترتيب تنازلي |
| `menu.sortNone` | No sort | Sans tri | بلا ترتيب |
| `menu.pinStart` | Pin to the start | Épingler au début | تثبيت في البداية |
| `menu.pinEnd` | Pin to the end | Épingler à la fin | تثبيت في النهاية |
| `menu.pinNone` | Do not pin | Ne pas épingler | بلا تثبيت |
| `menu.autoSize` | Fit this column | Ajuster cette colonne | ملاءمة هذا العمود |
| `menu.autoSizeAll` | Fit all columns | Ajuster toutes les colonnes | ملاءمة كل الأعمدة |
| `menu.resize` | Resize with the keyboard | Redimensionner au clavier | تغيير العرض بلوحة المفاتيح |
| `menu.widen` | Widen | Élargir | توسيع |
| `menu.narrow` | Narrow | Rétrécir | تضييق |
| `menu.moveStart` | Move toward the start | Déplacer vers le début | نقل نحو البداية |
| `menu.moveEnd` | Move toward the end | Déplacer vers la fin | نقل نحو النهاية |
| `menu.filter` | Filter… | Filtrer… | تصفية… |
| `menu.hide` | Hide column | Masquer la colonne | إخفاء العمود |
| `menu.choose` | Choose columns… | Choisir les colonnes… | اختيار الأعمدة… |
| `menu.reset` | Reset columns | Réinitialiser les colonnes | إعادة تعيين الأعمدة |
| `menu.pinnedStart` | {column} pinned to the start | {column} épinglée au début | {column} مثبّت في البداية |
| `menu.pinnedEnd` | {column} pinned to the end | {column} épinglée à la fin | {column} مثبّت في النهاية |
| `menu.unpinned` | {column} unpinned | {column} n'est plus épinglée | {column} لم يعد مثبّتًا |
| `menu.hidden` | {column} hidden | {column} masquée | {column} مخفي |
| `menu.resetDone` | Columns reset | Colonnes réinitialisées | أُعيد تعيين الأعمدة |

(Density texts in `density.md`; size sentences in `column-resize.md`.)

## Right to left
The button at the inline end (left in Arabic); the menu's end edge on the button's end edge; by
right-click, the menu's start corner at the pointer (it opens leftward in Arabic). Item texts follow the
language; a column name in another script is isolated (`<bdi>`).

## WCAG notes
- 2.5.8: the button 24 × 24 px; items at least 24 px tall (32 px in the theme).
- 1.4.13: the button shown on hover is not « content » (it is a control that stays while hovered or
  focused); it never covers the label.
- 2.1.1: every item reachable by keys; the button is not a tab stop but the menu has keys of its own.
- 4.1.2: radio items `menuitemradio` + `aria-checked`; disabled items `aria-disabled`.
- 1.4.10 / 1.4.4: fits 320 px and 200 % text; forced colours: borders and the checked sign in system colours.

## Parts and classes
`menu.button` and `menu.item` are replaceable parts; `ui.menuClass` / `ui.menuItemClass` add host classes
(Tailwind / Bootstrap), as `headerClass`.

## Decided (`docs/phase-6-steps/decisions.md` « Step 1 follow-ups »)
- O1 (owner): the last visible column cannot be hidden (13).
- O3, O11, C3, C5 (lead): pin items disabled for `movable: false`; Shift+right-click keeps the browser's
  menu; Alt+ArrowDown per column; the density line off by default.

## Choices to confirm (not settled by the decisions)
1. Tab in the menu closes it and goes back to the header (APG would move on to the next element).
2. A menu sort replaces the whole sort (no « add to the sort » item).
3. No right-click menu on body cells in this phase (Phase 9's menus).

## Tests (to be written with the code)
`packages/dom/test/column-menu.test.ts` (opening ways, one menu, items present / absent / disabled, focus
return, sentences, host items, thrown items), `column-menu-keys.test.ts` (APG keys, type-ahead folding fr /
ar, Alt+ArrowDown with and without a filter popup, Shift+F10 + `contextmenu` once, Ctrl+click on a Mac,
`aria-keyshortcuts` joined and never wiped by the filter, the ⋮ gone under 96 px with the keys still working,
« Élargir » keeping the menu open), nested grids; browser:
Chrome fr light / ar RTL dark, forced colours, 200 % zoom and 320 px, axe 0.

## As built (Phase 6 step 3, 2026-10-26; `step03-plan.md` « Done »)

`@dzgrid/dom/column-menu` (`packages/dom/src/column-menu.ts`, `column-menu/index.ts`) over `@dzgrid/dom/popup`; texts
`locales/{en,fr,ar}-column-menu` (owner Q3-2), look in `@dzgrid/theme/columns.css`. Where this differs from the rules above:

- **API**: `columnMenu({ use, density, onDensity, items, classes })`; `columnMenu().api(grid)` gives `open(column)`,
  `close()`, `current()` (rule 4's `openColumnMenu`). `use.columns` / `use.range` / `use.fill` / `use.chooser` are the
  other features' objects, reached through their `api(grid)` only (no import: an app with the menu ships none of them).
  Without `use.columns` the move items are absent; auto-size and « Redimensionner au clavier » appear when `columns()`
  gives `autoSize` / `autoSizeAll` / `resizeMode` (step 7); « Choisir les colonnes… » with `use.chooser` (step 4).
- **Sections** (separators between): sort | pin | size | move | fill (S12-Q12) | filter | hide, choose, reset | density.
  « Recopier vers le bas (Ctrl+D) » / « Recopier vers la droite (Ctrl+R) » (⌘D / ⌘R on a Mac, `aria-keyshortcuts`) act
  on the current block (or the focused data cell) as the keys, source `user`, the key's sentence; disabled without one.
- **Focus (owner Q3-1, replaces 20 and 22 for a pointer)**: a press on the ⋮, a right-click or a Mac's Ctrl+click never
  moves the grid's focus (`mousedown` prevented), so a block of cells survives; on close the focus goes back where it
  was — an element outside the grid gets it back, else the grid's own focus (the header when the grid had none). Opened
  by the keys: back on the header (moved with its column; the nearest visible header after « Masquer »). « Filtrer… »
  and « Choisir les colonnes… » hand the focus to what they open.
- **Rule 5**: the base sorts the joined list alphabetically (one value whatever the features' order), not « filters,
  menu, resize, move ». The menu declares `Alt+ArrowDown Shift+F10` on every column with a menu (Alt+ArrowDown opens the
  filter or the menu: either way the header takes it); `columns()` declares `Control+Shift+ArrowLeft/Right`
  (`Meta+…` on a Mac). Duplicates dropped.
- **Rule 7**: by a pointer the menu's start corner is 2 px under the pointer. The popup host now keeps a popup inside the
  window when it fits neither below nor above (its end at the window's end; the list scrolls inside: `max-block-size:
  calc(100dvh − 2rem)`); a filter popup benefits too. The menu never moves while open (« Élargir » moves the button
  under it).
- **Rule 15**: one patch giving each column its definition's order, pin, hidden and width (`width: null`, a core
  addition, Q3-3: a flexible column flexible again). Disabled when nothing differs from the definitions (a column moved
  away and back by hand may keep it enabled: its order numbers changed).
- **Rule 16**: density radios with `columnMenu({ density: true })`, absent when `rowHeight` is a number; the grid's
  density changed at once, `onDensity(d)` told, « Densité : … » said (Q3-4; `setDensity` at step 6).
- **Rule 17**: a throwing `items` or `action` is reported (`reportError`), the defaults shown / the menu closed; no
  `invalid-menu` problem code. No replaceable parts: `classes.menu` / `classes.item` and an item's `icon` class.
- **Rule 18**: type-ahead folds as the quick search (one letter again goes on to the next item; a prefix within 500 ms).
- **Texts**: the size items read `menu.sizeAuto`, `menu.sizeAutoAll`, `menu.sizeWiden`, `menu.sizeNarrow`,
  `menu.sizeResize` (an item's text is `menu.` + its id); added `menu.sort` / `menu.pin` (the radio groups' names),
  `menu.width` (« Nom : 130 pixels », after « Élargir » / « Rétrécir »), `menu.fillDown` / `menu.fillEnd` (ar « نحو
  اليسار »: Ctrl+R fills toward the logical end; owner's Arabic review), and the density keys of `density.md`.
- **Look**: the ⋮ is drawn `order: 2` (after the filter button, before the reapply mark `order: 3`); the decorations' DOM
  order follows the features' (the base appends the sort mark when a sort appears). Forced colours: Highlight on the
  focused item, ButtonText on the ⋮.
- **Engines (headless)**: Firefox sends the page no `contextmenu` for Shift+right-click (its own menu) nor for a Mac's
  Ctrl+click; WebKit and Chrome turn Ctrl+click into `contextmenu`, which opens the menu without sorting.

## Item content (Phase 6 step 12, owner Q12-2; 1.1.0)
- `MenuItem.part` names a part of slot **`menuItem`** (`definePart('menuItem', …)` in `settings.parts`, or an Angular
  `dzgPart` template with `[slot]="'menuItem'"`). Built-in items can get one too, through `items` (`{ ...d, part }`).
- The part paints the item's content inside the menuitem, in a `span.dzg-mpart` the grid makes **`inert`** and
  **`aria-hidden`**: no control of the part's takes the focus, nothing of it joins the name. The item keeps its role,
  `aria-checked`, `aria-disabled`, the roving focus, the keys and the type-ahead (on `label`); its accessible name is
  the `label` (`aria-label`), so the part should show that text (WCAG 2.5.3, label in name). A click on the part is the
  item's click.
- Its context: `id`, `label`, `kind` (`item`, `radio`, `check`), `checked`, `disabled`, `column`, and `PartBase`.
- Mounted when the menu draws the item; destroyed when the menu redraws (an item that keeps it open) or closes. A part
  that throws is reported and the item shows its plain text. An unknown name: plain text and `unknown-part` (path
  `menu.<id>.part`); a part of another slot: plain text.
- Bytes: in `@dzgrid/dom/column-menu` (4 297 / 4 300, measured; the parts' mounter is `@dzgrid/dom/internal`'s shared
  one). Tests: `packages/dom/test/column-menu-item-part.test.ts`, Angular `packages/angular/test/menu-template.test.ts`.
