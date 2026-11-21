# Advanced filter (one expression across columns, AND / OR groups)

1.17.0. Written before the code (CLEANROOM): what other grids show (an « advanced filter » bar or builder that joins
conditions on several columns with AND and OR) is named from their public pages and from using them, nothing read.
Plan and the decisions taken alone: `docs/phase-14-steps/advanced-filter-plan.md`.

## What the user does
Opens the builder from a button of the page (« Filtre avancé »), adds a condition (a column, then the column's own
filter form: an operator and a value, a date, ticks in a value list), adds a second one, switches the group's join
between « All (AND) » and « Any (OR) », adds a group inside the group for `(Statut = Erreur OU Statut = Alerte) ET
Date ≥ 2026-11-01`, removes a condition, applies; the rows narrow. Reopens it, cancels a change, clears it.

## What they observe

### The model (core, always there)
1. **One expression per grid**, a tree: a **group** `{ join: 'and' | 'or', items }` holds conditions and groups; a
   **condition** `{ column, filter }` names a column and holds a column filter exactly as a column filter is written
   (`ColumnFilter`: text, number, day, instant, boolean, set, combined, custom), so every type and operator the column
   filters know is known here, typed by the column's type. Groups nest 5 deep at most (the root is level 1).
2. **Where it lives:** in the filter model, under the key `''` (a column id is never empty):
   `{ status: …, '': { type: 'advanced', expression } }`. So the saved state, the URL a host builds from the filter,
   `[(filter)]`, `filterChanged`, the server's request and the « select all » membership carry it with no new channel.
   `advancedOf(filter)` reads it, `withAdvanced(filter, expression | null)` writes it (`@dzgrid/core`).
3. **With the column filters: both apply, AND between them** (the safer choice). The column filters keep their
   popups, floating row and panel; the expression is one more filter (the filters panel counts it among those in
   force). « Clear all filters » (menus, filters panel, `clearFilters()`) clears it too: one gesture empties
   everything that hides rows. `setAdvanced(kernel, expression, source?)` writes it on a grid.
4. **Evaluation:** a group with `and` keeps a row when every live item keeps it, `or` when one does. A condition is
   the column filter's own test (folding, blanks, negations as exact complements, zones, shortcuts against the clock).
   A condition that cannot filter yet (an empty value, `between` with one bound) is left out quietly; a group with no
   live item is left out; an expression with nothing live filters nothing.
5. **Bad input never throws.** An unknown column (`unknown-column`), a column that does not filter, a filter the
   column's type cannot take, a bad value, a join that is neither `and` nor `or`, a group too deep, an item that is
   neither a group nor a condition (`invalid-filter`; a bad day `invalid-day`) make **the whole expression not apply**
   (as a combined filter with one bad member), each told with its path: `advancedFilter.items[1].filter.value`. The
   column filters still apply. A value that is not plain data (a cycle, a BigInt, a getter that throws) is refused by
   the grid before it is kept (`invalid-filter`, `not json`); the filter in force stays.
6. **On a server** (`sourceRows`, the server-side and infinite sources): the request's `filter` carries
   `'': { type: 'advanced', expression }`, each condition's filter in its wire form (instants resolved to UTC with their
   zone, shortcuts as days, half-typed conditions and empty groups dropped). A server that does not know it must refuse
   it (the application chose the feature). The value-list requests leave it out (7).
7. **Value lists ignore it:** a column's list (popup, builder) counts the rows the other **column** filters keep, never
   the expression's — otherwise `Statut = Erreur` would hide « Alerte » from the list used to add `OU Statut = Alerte`.
8. **Saved state:** `filter` keeps the `''` entry; restoring checks it like any filter (a removed column makes it not
   apply, told).

### The builder (`advancedFilter()`, `@dzgrid/dom/advanced-filter`, opt-in)
9. **Opt-in, beside `filters()`** whose forms it reuses. Without `filters()`: nothing drawn, one `missing-feature`
   warning (`features.advancedFilter`). The application opens it with `api(grid).open()` or binds its own button with
   `bind(button)` (`aria-haspopup="dialog"`, `aria-expanded`); `close()`, `get()`, `set(expression | null)`,
   `isOpen`.
10. **A modal dialog** (the filter popup's host: top layer, placed under its button, never past the window; the groups
    scroll between the title and the buttons, so Apply stays in the window), named « Filtre avancé ». Inside, from top to bottom: the root group, then « Appliquer », « Effacer »,
    « Annuler ». It edits a **draft**: nothing filters until Apply (or Enter in a value field). Escape, Cancel or a
    press outside drop the draft; the focus goes back to the button (or the grid).
11. **A group** is a `group` named « Groupe : tous (ET) » / « Groupe : au moins un (OU) » (with its level from 2):
    a join switch (a `radiogroup` with two radios « Tous (ET) », « Au moins un (OU) »), its items as a list (`ul`,
    `li`), « + Condition », « + Groupe » (hidden at the 5th level), and for a nested group « Supprimer le groupe ».
12. **A condition** is a `li` holding a `group` named « Condition n »: a column `select` (« Colonne », the filterable
    columns, hidden ones too, in the columns' order, by their header), the column's own filter form (the popup's:
    operator, value, match case, several conditions, the value list with its search, the date forms loaded on demand;
    an `enum` column gets the value list; its Clear and Apply buttons are not shown), and « Supprimer la condition ».
    Choosing another column empties the condition. A new builder starts with one empty condition.
13. **Focus.** Opening: the first column `select` (nested or not). After adding: the new condition's column `select` (a new group: its
    first condition's). After removing: the item before, else the group's « + Condition ». Tab and Shift+Tab go
    through every control in reading order and stay in the dialog. ArrowUp / ArrowDown on a column `select` with
    Alt move to the previous / next condition's column (a quick walk; plain arrows stay the `select`'s).
14. **Announcements** (polite, once per action): « Condition ajoutée », « Groupe ajouté », « Supprimé », the join
    switched (« Tous (ET) »), and after Apply the row count as any filter change says it.
15. **What Apply stores:** the draft read through the forms; a condition with no column, or whose form filters
    nothing yet, is left out; an empty group is left out; nothing left: the entry is removed. A form that holds a
    value that does not read (a number) keeps the dialog open, the focus on that field (the form marks it).
16. **What it shows on opening:** the expression in force, every condition in its column's form; a condition whose
    form cannot show its filter (a custom kind without a form) shows the form's summary « Filtre actif » and Clear.
    The expression changed from elsewhere while the dialog is open: the draft is kept (Apply wins).
17. **RTL, look, languages.** Logical sides only; the nesting indent on the inline start; the dialog carries the
    grid's `dir`. Colours and spacing as `--dzg-*` variables over the shared `--tz-*` palette
    (`@dzgrid/theme/advanced-filter.css`), light and dark. Texts from `@dzgrid/dom/locales/<lang>-advanced-filter`
    (en, fr, ar), missing texts told as for every feature.
18. **Not done (later, if asked):** a typed text form (`Statut = "Erreur" ET …` parsed with errors at a position); a
    docked panel; NOT groups; dragging items.

## Frameworks
19. **Angular:** `<dz-grid [features]="…" [(advancedFilter)]="expression">`: unset, nothing written; set, the
    expression in force (null removes it, the column filters kept); the user's change (the builder, the api, a restored
    state) comes back out (`(advancedFilterChange)`), only when the expression itself changed. `[(filter)]` keeps
    working and carries the `''` entry.
20. **Element:** `el.advancedFilter` (get / set, null removes it; set before the grid exists, or before the element is
    defined, it is written when the grid is made). Its changes come with `dzg-filter-changed`
    (`advancedOf(detail.filter)`): no event of its own (the element's size line had no room for one).

## Tests
`packages/core/test/advanced-filter.test.ts`, `conformance/cases/filter-advanced/*.json`,
`packages/dom/test/advanced-filter.test.ts`, `packages/angular/test/advanced-filter.test.ts`,
`packages/element/test/advanced-filter.test.ts`; browsers `scripts/browser-1-17.mjs`.
