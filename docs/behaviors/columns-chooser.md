# Choosing columns (« Choisir les colonnes »)

Written before the code (CLEANROOM). Sources: the public documentation of data grids about a columns
tool panel or chooser (a list of every column with a checkbox, a search box, drag to reorder), WAI-ARIA 1.2
(`dialog`, `list`, `group`), HTML checkboxes, APG « dialog (modal) » pattern, WCAG 2.2 (2.1.1, 2.4.3, 2.5.7,
2.5.8, 1.4.10, 3.3.2 labels, 4.1.2, 4.1.3). Plan D8; owner decisions Q-C1 (A, a dialog over the grid), Q-C2
(A, changes apply at once), Q-C3 (A, no « Filtres » tab before Phase 9), Q-H (A, drag handles and
Alt+ArrowUp / ArrowDown), « Step 1 follow-ups » O1 (the last shown column is never hidden, no « Tout
masquer ») and O5 (a finger may drag a row by its handle). Entry: `@dzgrid/dom/columns-panel`
(`columnsChooser()`), over `@dzgrid/dom/popup`.

## What the user does
Opens « Choisir les colonnes… » from a column menu or from the application's own button; types in the
search box; ticks or unticks columns; changes the order by a row's handle (drag), its ▲ / ▼ buttons, or
Alt+ArrowUp / ArrowDown; presses « Tout afficher », « Réinitialiser », or closes the window.

## What they observe
- A window over the grid, titled « Choisir les colonnes », with a search box at the top and every column
  listed in the grid's order, each with a tick, ▲ / ▼ buttons and a handle (⠿).
- Unticking hides the column in the grid at once; ticking shows it again. Moving a row moves the column.
- Typing narrows the list to the matching names (accents and case ignored).
- Escape, the close button or a click outside closes it; the focus goes back where it was.

## Behaviours (numbered, each one a test)

**Opening and closing**
1. Opened by the menu item (`column-menu.md` 14) or `openColumnChooser(anchor?)` on the feature (an
   application button as the anchor). A modal dialog in the top layer (`/popup`): `role="dialog"`,
   `aria-modal="true"`, named by its visible title `chooser.title`; Tab stays inside (trapped, wrapping).
2. Placed under its anchor (end edge on the anchor's end edge, flipped above when no room), the grid's `dir`;
   at most 360 px wide and 70 % of the view high, the list scrolling inside; at 320 CSS px wide it takes the
   view's width (1.4.10).
3. The focus goes to the search box on opening.
4. Closed by Escape (an Escape in a non-empty search box first empties it, O12), the close button
   (`chooser.close`), a pointer press outside, the grid destroyed or its definitions replaced. The focus goes
   back to the anchor (the header the menu came from, or the application's button), else to the grid's
   focused cell.
5. Nothing to apply on closing: every change was already applied (Q-C2).

**The list** (a list of native checkboxes, not a `listbox`: an `option`'s children are presentational, so
buttons and a named handle could not live inside it)
6. A `list` (labelled `chooser.list`) of every column the user may see (`chooser: false` columns are left
   out), in the grid's full order (start-pinned, centre, end-pinned), hidden ones included. Each `listitem`
   holds: a native `<input type="checkbox">` labelled by the header text (checked = shown; the pin state
   joins its description: `chooser.pinnedStart` / `chooser.pinnedEnd`), a ▲ button `chooser.up {column}`, a ▼
   button `chooser.down {column}`, and the handle, a `<button>` named `chooser.handle {column}` (named, not
   `aria-hidden`: voice control and touch readers can reach it). All targets 24 × 24 px.
7. **One tab stop for the list**: the checkboxes use a roving `tabindex`; ▲, ▼ and the handle have
   `tabindex="-1"` (pointer and assistive-technology targets; the keyboard way is Alt+arrows).
8. Header groups: the group's name as a `group` (`role="group"`, `aria-labelledby` its label) with its columns
   indented inside, nested as in the definitions. The group has no tick of its own and does not fold in this
   phase (choice 1).
9. A column hidden only because its collapsible group is closed (`header-groups.md`) stays checked and says
   `chooser.inClosedGroup` in its description.
10. Windowed above 200 columns (`aria-setsize` / `aria-posinset` on each `listitem`); below, all rendered.

**Showing and hiding** (Q-C2: at once)
11. Space on the focused checkbox, or a click on it or its label, flips it: one `column.state` patch
    (`hidden`), one `columnsChanged` (source `user`), one polite sentence `menu.hidden` / `chooser.shown`.
12. Disabled (`aria-disabled="true"`, drawn disabled, Space does nothing, kept in the roving order, choice 2): a column
    with `hideable: false` (a new type-only `ColumnDef` field); the **last shown** column (O1).
13. « Tout afficher » (`chooser.showAll`): every column shown, one patch, sentence `chooser.allShown`.
    « Réinitialiser » (`chooser.reset`): as the menu's reset (`column-menu.md` 15). **No « Tout masquer »** (O1).

**Search**
14. A text box labelled `chooser.search` (visible label, no placeholder alone), `type="search"`. Matching:
    the header text and the group names, folded as the quick search (case, accents, Arabic hamza forms,
    harakat, tatweel, digits), « contains ». A group matches → all its columns show; a column matches → its
    groups show around it.
15. Filtering the list never changes the grid. No match: the text `chooser.none` in the list (a `status`).
    The count of matches is said politely after a 500 ms pause (`chooser.matches`).
16. ArrowDown in the search box goes to the first checkbox; ArrowUp on the first one goes back to the box.

**Reordering** (Q-H)
17. **Keyboard**: Alt+ArrowUp / Alt+ArrowDown on a focused checkbox moves its column one place up / down in
    the list, which is the grid's full order (up = toward the start). Same rules as `column-move.md`: inside its
    segment (O2), `movable: false` columns do not move and keep their position number (O3), hidden columns move
    too (they are in the list). One `column.state` patch per key, one sentence **`chooser.placed`** — its place
    among **all** columns of the list, hidden ones included (the headers' `move.placed` counts visible columns
    only). The focus stays on the moved checkbox.
18. **Single pointer** (WCAG 2.5.7): ▲ / ▼ do the same as Alt+ArrowUp / ArrowDown, one place per click, same
    sentence; disabled (`aria-disabled`) at the edge of the segment or group and for `movable: false`.
19. Inside a group, a column moves only among its group's columns (the list keeps groups whole, choice 3); at
    the top of its group: nothing, `move.edge`.
20. **Drag**: the handle (cursor `grab`) starts a drag after 4 px; a bar shows the landing gap; Escape cancels;
    one patch on release; the list scrolls near its top and bottom edges. **A finger works on the handle** (O5:
    `touch-action: none` on the handle only, the list still scrolls elsewhere).
21. While the search box is not empty, reordering is off (handles, ▲ and ▼ hidden; Alt+arrows say
    `chooser.clearToMove`).

**Live sync**
22. A change made elsewhere while the chooser is open (a header drag, the menu, the application) redraws the
    list; the focused checkbox keeps the focus by column id.

## Keyboard

| Where | Key | Result (RTL: same; the list is vertical) |
|---|---|---|
| search box | typing | narrows the list |
| search box | ArrowDown | first checkbox |
| search box | Escape | empties the box; empty: closes |
| checkbox | ArrowDown / ArrowUp | next / previous checkbox |
| checkbox | Home / End | first / last checkbox |
| checkbox | Space | show / hide the column |
| checkbox | Alt+ArrowUp / Alt+ArrowDown (Mac: Option) | move the column one place toward the start / end |
| anywhere inside | Tab / Shift+Tab | search box → list (one stop) → « Tout afficher » → « Réinitialiser » → close, wrapping (trapped) |
| anywhere inside | Escape | close, focus back to the anchor |

## Announcements
Polite: `menu.hidden` / `chooser.shown` per tick, `chooser.placed` per move, `chooser.allShown`,
`menu.resetDone`, `chooser.matches` after a pause. Nothing on opening beyond the dialog's name.

## Texts (`locales/{en,fr,ar}-columns`)
| Key | en | fr | ar |
|---|---|---|---|
| `chooser.title` | Choose columns | Choisir les colonnes | اختيار الأعمدة |
| `chooser.search` | Search a column | Rechercher une colonne | البحث عن عمود |
| `chooser.list` | Columns | Colonnes | الأعمدة |
| `chooser.handle` | Drag {column} | Glisser {column} | سحب {column} |
| `chooser.up` | Move {column} up | Monter {column} | نقل {column} إلى الأعلى |
| `chooser.down` | Move {column} down | Descendre {column} | نقل {column} إلى الأسفل |
| `chooser.placed` | {column}: place {n} of {total} | {column} : place {n} sur {total} | {column}: الموضع {n} من {total} |
| `chooser.showAll` | Show all | Tout afficher | إظهار الكل |
| `chooser.reset` | Reset | Réinitialiser | إعادة التعيين |
| `chooser.close` | Close | Fermer | إغلاق |
| `chooser.none` | No column | Aucune colonne | لا يوجد عمود |
| `chooser.matches` | Columns found: {n} | Colonnes trouvées : {n} | الأعمدة الموجودة: {n} |
| `chooser.shown` | {column} shown | {column} affichée | {column} ظاهر |
| `chooser.allShown` | All columns shown | Toutes les colonnes affichées | كل الأعمدة ظاهرة |
| `chooser.pinnedStart` | pinned to the start | épinglée au début | مثبّت في البداية |
| `chooser.pinnedEnd` | pinned to the end | épinglée à la fin | مثبّت في النهاية |
| `chooser.inClosedGroup` | hidden by its closed group | masquée par son groupe replié | مخفي لأن مجموعته مطويّة |
| `chooser.clearToMove` | Empty the search to change the order | Videz la recherche pour changer l'ordre | أفرغ البحث لتغيير الترتيب |

## Right to left
The dialog's start edge on the anchor's start edge (right in Arabic); checkboxes at the inline start; ▲, ▼
and the handle at the inline end; indentation by `padding-inline-start`. The order of the list is the grid's
logical order (top = start) in both directions; ▲ / ▼ are vertical, not mirrored. A Latin column name in an
Arabic list is isolated (`<bdi>`).

## WCAG notes
- 2.5.7: reordering by a single pointer without dragging (▲ / ▼, 18); Alt+arrows for the keyboard.
- 2.5.8: checkboxes, ▲, ▼, handles and buttons 24 × 24 px.
- 2.4.3: focus in on opening, back to the anchor on closing; Tab trapped while modal.
- 3.3.2: visible label on the search box; 4.1.2: native checkboxes (checked state said by every reader).
- 4.1.3: counts and changes said politely; 1.4.10: fits 320 px; forced colours: ticks and focus as shapes.

## Decided (`docs/phase-6-steps/decisions.md` « Step 1 follow-ups »)
- O1 (owner): the last shown column cannot be hidden; no « Tout masquer ».
- O5 (owner): a finger can drag a row by its handle.
- O2, O3, O12 (lead): reordering never crosses a pinned edge; `movable: false` keeps its place; Escape in a
  non-empty search empties it first.

## Choices to confirm (not settled by the decisions)
1. Group rows have no tick and do not fold in this phase.
2. A disabled checkbox stays reachable by the arrows (so its name is heard), using `aria-disabled` rather
   than the native `disabled` that would drop it from the roving order.
3. Columns move only within their group in the list.

## Tests (to be written with the code)
`packages/dom/test/columns-chooser.test.ts` (opening, focus in and back, Tab trap, ticks, disabled, show all,
reset, live sync), `columns-chooser-search.test.ts` (folding fr / ar, groups, counts),
`columns-chooser-keys.test.ts` (Alt+arrows, ▲ / ▼, segments, groups, locked, `chooser.placed` counting hidden
columns); browser: Chrome fr / ar RTL, 320 px, touch target sizes, a finger drag on the handle, axe 0, forced
colours.

## As built (Phase 6 step 4, 2026-10-26; `docs/phase-6-steps/step04-plan.md` « Done »)
- Entry `@dzgrid/dom/columns-panel`: `columnsChooser({ onClose })`; `api(grid).open(anchor?)` (false when nothing is
  listed; already open: the focus to the search), `close()`, `isOpen`. The menu's `use: { chooser }` opens it from the
  header (step 3 seam). Texts in `locales/<lang>-columns` (`chooser.*`, owner Q4-1); look in `@dzgrid/theme/columns-panel.css` (Q4-2).
- 1–2: anchored on the grid's root (unticking the opener's own column keeps it open), placed under the opener with its
  **end edge on the opener's end edge** (the plan's choice over « Right to left »'s « start edge »: in Arabic its left
  edge on the button's left edge), above when there is no room; without an anchor, under the grid's header. The width is
  `min(22.5rem, 100vw − 2rem)` plus the popup's padding: inside a 320 px view.
- 4: a press on the application's button while open leaves it open (its click opens it again: the focus to the search).
  Closing gives the focus to that button; from a header, to the grid's own focus (that header when the grid had none).
  New definitions with the same columns (a header renamed) redraw it; another set of columns closes it.
- 6, 8: rows are `li.dzg-cp-row` in `ul[role=list]`; a group is `li > div[role=group][aria-labelledby]` (its label and
  its own list), never a `listitem` with a group role. The description joins the pin and `chooser.last` (« dernière
  colonne affichée ») for the last shown column.
- 9: not built — collapsible groups come at step 8 (`chooser.inClosedGroup` lands with them).
- 10 (owner Q4-3): no windowing code; above 200 rows the list is marked `data-dzg-long` and its rows get
  `content-visibility: auto` (not below: WebKit misses a click on a freshly drawn skipped row). 300 columns open in ≈ 80 ms
  in Chrome.
- 11: sentences `chooser.shown` / `chooser.hidden` (the chooser's own, not the menu's `menu.hidden`); 13: `chooser.allShown`,
  `chooser.resetDone`.
- 15: the count is not said when the search is emptied.
- 17–19: one place in the list = one step among the columns and sub-groups beside it at its level: a column outside a
  group passes the whole group (groups stay whole), a grouped column stays in its group; a locked column is jumped and
  keeps its slot. Sentences `chooser.placed`, `move.edge`, `move.locked`.
- 20: the bar lands among the dragged row's own list items of its segment (never pins); Escape says `move.cancelled`
  and keeps the dialog open; a locked column's handle is disabled.
- Tab: the chooser moves the focus itself along search → list → « Tout afficher » → « Réinitialiser » → « Fermer »
  (WebKit's Tab skips buttons by default); a click focuses what it pressed. « Fermer » is the third footer button.
- Known risk: sentences go to the grid's live region, outside the `aria-modal` dialog; to be checked by ear (a11y §21).
