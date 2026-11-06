# Filters panel

Written before the code (CLEANROOM). Owner answers: `phase-9-steps/decisions.md` « Filters panel — owner answers
(2026-11-03) », which win over this sheet. What other products show (a side bar listing every column's filter, an
editor's tool window) is named from their public pages and from using them, nothing read.

## What the user does
Presses the « Filtres » button on the side of the grid, finds a column by typing a few letters of its name, unfolds it,
sets its filter with the same form as the column's filter popup, sees a dot on each filtered column, and clears every
filter at once from the top of the panel.

## What they observe
1. **Opt-in.** The panel exists only when the application adds the feature (`filtersPanel()` from
   `@dzgrid/dom/filters-panel`) beside `filters()` (from `@dzgrid/dom/filters` or `@dzgrid/dom/filters-base`). Without
   `filters()`, nothing is drawn and one `missing-feature` warning is told (`features.filtersPanel`).
2. **A side panel.** It stands beside the rows, inside the grid's box, at the side the application chose (`side: 'end'`
   by default, or `'start'`), outside `role="grid"`. Logical sides: in right-to-left `end` is the left. The rows, the
   headers, the find bar and the footer take the room left; nothing is covered. A narrow screen (30 rem or less): the
   open panel covers the rows instead.
3. **The button.** A narrow strip on that side holds a « Filtres » button (`aria-expanded`, `aria-controls`), with the
   number of active filters when there are some (« Actifs : 2 »). It opens and closes the panel. `button: false`: no
   strip; the application opens it with `api(grid).open()` / `close()` / `toggle()`. The panel's head has its own
   close button (×, « Fermer les filtres »).
4. **Opening** puts the focus in the column search; **closing** gives it back to the « Filtres » button, else to the
   grid (its focused cell or header). Open or closed survives nothing: a new grid starts as `open` says (closed by
   default).
5. **The panel** is a `region` named « Filtres »; from top to bottom: its title and ×, « Effacer tous les filtres »,
   the column search, then the list.
6. **« Effacer tous les filtres »** empties every column filter and the quick search in one command (the sort kept),
   as the menus' item and `clearFilters()`; the grid then says the row count. Nothing to clear: the button is
   `aria-disabled` (still reached, does nothing).
7. **The list**: every column that has a filter form (`filter.<kind>` part), hidden columns too, in the columns'
   order; each a button with the column's name and `aria-expanded`. A column whose filter is in force shows a dot, and
   its button's name ends with « filtre actif ».
8. **Unfolding** a column shows its full filter, the popup's own form: operators, several conditions and AND/OR,
   match case, the value list, a list and a condition, the date forms (loaded on demand, as in the popup). Several
   columns may be open at once. Folding (or closing the panel) applies what is pending in the browser, as closing the
   popup does; with `apply: 'button'` a draft not applied is dropped.
9. **Apply as the popups do** (`filters({ apply })`): live by default (typed text after the pause, a choice at once);
   with `apply: 'button'`, or on a server, the form keeps a draft sent by « Appliquer » or Enter. The form stays open
   after Apply (a panel is not a popup): the dot appears.
10. **Always in step.** A filter set elsewhere (the popup, the floating row, a header box, the application's API, a
    restored state, « Effacer tous les filtres ») shows at once: the dots, the count on the button, and the open
    forms (a field being edited is never rewritten, as in the popup). A column gone leaves the list; a new one joins it;
    new texts (another language) are drawn again.
11. **Column search**: case and accents ignored, on the column's name. No match: « Aucune colonne ». After a pause, the
    number found is said (« Colonnes trouvées : 3 »). Escape in the search empties it.
12. **Keyboard.** Tab: × → « Effacer tous les filtres » → search → the list's buttons and the open forms in order.
    On a column button: ↑ ↓ to the previous / next column button, Home / End to the first / last, Enter or Space folds
    or unfolds it; ↓ in the search goes to the first column. Escape inside a column's form (when the form did not
    use it) goes back to that column's button. Escape elsewhere in the panel does not close it (it is not modal).
13. **Screen reader.** The region and its name; buttons named; the dot heard in the name (« Nom, filtre actif »);
    the open form is a group named by its column; announcements polite, through the grid's region.
14. **Beside the columns panel.** Both may be used: the columns dialog opens under the headers, which stop where the
    filters panel starts, so the two stand side by side, never one over the other. The application may show only one.
15. **In the dock.** The panel's body is built apart from where it stands: with `dock()` (docs/behaviors/dock.md) it is
    the dock's panel `filters` and the application changes nothing (`filtersPanel(options)` and its api stay): on its
    `side` (`end` by default); its strip is its area collapsed (« Filtres » with the count), `open: true` expanded,
    `button: false` hidden until `api(grid).open()`; the area's head names it, its × collapses the area while there is a
    strip (else hides it); its own side, strip and head are not drawn; beside the columns panel, two tabs.
16. **Look.** Colours from the theme (`@dzgrid/theme/filters-panel.css`), CSS variables only; layout injected by the
    feature. The panel's width: `--dzg-fpanel-size` (18 rem), the strip's: `--dzg-fstrip-size` (2 rem).

## Texts
`locales/<lang>-filters-panel` (en, fr, ar): `fpanel.title`, `fpanel.close`, `fpanel.clearAll`, `fpanel.search`,
`fpanel.none`, `fpanel.matches` (`{n}`), `fpanel.active`, `fpanel.count` (`{n}`). Missing ones: `filtersPanel()` throws
at setup, naming them.

## Where DzGrid differs on purpose
- The panel is inside the grid's box, not a page's sidebar: one component to place.
- No drag-and-drop docking: the dock's « Placer » menu moves it (dock.md 10).
