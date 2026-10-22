# The editors

Sources: the public documentation of grids with typed editors (what a user sees: a text field, a number
field, a date field with a calendar, a list), the APG select-only combobox and date picker dialog
patterns, WAI-ARIA 1.2, WCAG 2.2 (2.5.8 target size, 3.3.2 labels). Phase 5 plan D4, D15; owner
decisions Q14 (dates: typing, plus a tzslot calendar loaded on demand), Q15 (a simple list with
type-ahead). Keys common to all: `editing.md`.

## What the user does
Edits text, a number, a date, a date and time, a yes/no value, a status chosen from a list, or a field
the application made itself.

## Behaviours

**Choice of editor**
1. The column's type chooses: `text` → text; `number` → number; `day` → date; `instant` → date and time;
   `boolean` → toggle; a column with `edit.options` → list; `edit.editor: '<name>'` → the part
   `editor.<name>`.
2. Every editor's root carries `data-dzg-owner="editor"`, fills the cell's content box (after a tree's
   indent), and is named by the column's and the row's headers.

**Text**
3. A single-line field, `dir="auto"`, the cell's font; `maxLength` from `edit.maxLength` if given. The
   value kept is the text as typed (no trimming; `pattern` and `required` check it).

**Number**
4. A text field with `inputmode="decimal"`, isolated left-to-right (`dir="ltr"`) inside any cell, aligned
   as the column. It opens with the number in the locale's decimal sign, without group separators.
5. Read by the codec (`value-input.md`): the locale's decimal sign, Arabic-Indic and Persian digits, the
   Arabic separators; `1,5` in an English locale is refused (`validation.parse`). Up and Down do not
   change the number (they are the field's caret keys; no spinner).

**Date (`day`) and date and time (`instant`)**
6. A text field isolated left-to-right, opening with the value in the locale's pattern; read by the
   codec (two-digit years and month names refused; a date-time in a clock change refused: `gap`,
   `ambiguous`; the grid's zone for instants).
7. A calendar button inside the field's inline end (24 × 24 px, name `edit.calendar`), and
   **Alt+ArrowDown** in the field, open the tzslot calendar (date: `day` panel; instant: the `moment`
   panel) in the top layer. The calendar is a chunk loaded on first use, through the same loader as the
   filters' dates (cache, a « Retry » on failure, `aria-busy` while loading) without importing
   `/filters`; hovering the button or focusing the field prefetches it.
8. The calendar is placed so it never covers the field (below, or above when there is no room).
   Picking a day in the calendar writes it to the field and closes the calendar; the field stays open
   (Enter keeps it). **Escape** in the calendar closes the calendar only (focus back in the field); a
   second Escape gives the edit up.
9. Without tzslot installed (optional peer): no button, typing only, one problem `missing-feature`
   (`edit.calendar`, detail `@tzslot/dom`).

**Boolean**
10. No field: on an editable boolean cell, **Space** and **Enter** toggle the value (one save each,
    origin `edit`); Enter first goes to an interactive part (`editing.md` 5: `focus()` returning true);
    a double click toggles; Delete clears to `null`. Space on any other cell keeps selecting the row.
    The order is `null → true → false → true`.
11. The cell keeps its part (badge or check, `badge-boolean.md`); the toggle is said by the reader
    through the cell's new text.

**List (simple, with type-ahead)** — APG select-only combobox
12. Opening (F2, Enter as in `editing.md` 5, a printable character, a double click) shows the field
    with the current choice and the list below the cell (above near the bottom), in the top layer, the
    current option active (`aria-activedescendant`). The list never covers the field (WCAG 2.4.11), and
    the active option is scrolled into the list's view.
13. Up / Down move the active option; Home / End the first / last; PageUp / PageDown by 10.
14. Typing letters within 500 ms builds a prefix and moves to the first option whose label starts with
    it (folded as the quick search folds: case, diacritics, Arabic tashkil); the same letter again cycles
    through the options starting with it. A printable key opening the editor is the prefix's first
    letter.
15. Enter picks the active option and keeps it (moves per `enterMoves`); Tab picks and moves; Escape
    closes and gives up; a click on an option picks and keeps.
16. Options: `edit.options: [{ value, label? }]` or a function of the row and context; labels from the
    column's value labels when not given. Up to 500 options (more: the searchable list, later).
17. A value not among the options (from the data) shows as an extra first option, marked; keeping it is
    allowed only if it was the cell's value.

**Custom editor** (`editor.<name>` part)
18. A part given the context `{ value, text, row, key, column, context, locale, dir, start: 'key' |
    'f2' | 'enter' | 'dblclick', char?, keep(value), cancel(), refuse(code) }`; it must return an element
    and a `focus()`.
19. The grid marks the part's root `data-dzg-owner="editor"`; Enter, Tab and Escape reaching the root
    unhandled act as in `editing.md`; `keep(value)` goes through the same checks and save.

## Keyboard (besides `editing.md`)
| Editor | Key | Result |
|---|---|---|
| date, instant | Alt+ArrowDown | open the calendar |
| calendar | Escape | close the calendar only |
| boolean cell | Space, Enter (unless an interactive part takes Enter), double click | toggle (one save) |
| list | Up, Down, Home, End, PageUp, PageDown | move the active option |
| list | letters | type-ahead |
| list cell | Enter (unless an interactive part takes it), F2, printable | open the list |
| list | Enter / Tab / Escape | pick and keep / pick and move / give up |

## Texts
| Key | en | fr | ar |
|---|---|---|---|
| `edit.calendar` | Open calendar | Ouvrir le calendrier | فتح التقويم |
| `edit.calendarLoading` | Loading calendar | Chargement du calendrier | جارٍ تحميل التقويم |
| `edit.calendarFailed` | Calendar could not load | Le calendrier n'a pas pu se charger | تعذّر تحميل التقويم |
| `edit.retry` | Retry | Réessayer | إعادة المحاولة |
| `edit.optionNotInList` | {label} (not in the list) | {label} (hors liste) | {label} (خارج القائمة) |

## Right to left
Text fields `dir="auto"`; number and date fields isolated left-to-right with their caret logical; the
calendar button at the inline end (left in Arabic); the list aligned to the cell's inline start; the
calendar in tzslot's own right-to-left layout.

## Choices to confirm
- Boolean: Space toggles on an editable boolean cell (row selection by Space elsewhere), also Enter and
  double click; `null` never comes back by toggling.
- The list is an APG select-only combobox (not a native `select`), capped at 500 options.
- Number fields have no spinner; Up/Down never change the value.

## Tests (to be written with the code)
Step 5: text and number (Arabic-Indic digits, `1,5` refused in en, caret in ar). Step 6: day and instant
(bug 3 of `a6c97f5`, a date one day off, replayed across 13 zones), calendar lazy load, Retry, Escape
twice, top layer in a transformed card, no `/filters` import; boolean; list (type-ahead with diacritics
and Arabic, cycling, 500 cap, a value not in the list); custom part contract. Browser fr light / ar RTL
dark: axe 0 with each editor open.
