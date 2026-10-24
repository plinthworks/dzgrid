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

## Built at step 5 (2026-10-23, `@dzgrid/dom/editors`)
- 1: `text` → text field, `number` → number field; `edit.editor: 'text' | 'number'` forces one (a custom-typed
  column read by its codec through a text field); any other name: a warning `unknown-part` at
  `columns.<id>.edit.editor`, told once per column and name, and no field (the `editor.<name>` part is step 6).
  `day`, `instant`, `boolean`, enum and custom columns open no field at this step.
- 2: one `<input class="dzg-field">` per open editor, built at the opening, dropped at the close;
  `autocomplete="off"`, `enterkeyhint="done"`, `maxLength` = `edit.maxLength` or **1 000** (owner S5-O5; a
  longer value from the data opens whole and can only shrink).
- 3: `dir="auto"`, opened with the value shown (the edit overlay), `null` → empty; spaces kept.
- 4: `dir="ltr"`, `inputmode="decimal"`, `spellcheck="false"`, `text-align: end` (edit.css). **Opening text**:
  the shortest text that reads back the same number (`0.1 + 0.2` opens « 0,30000000000000004 » in French),
  the locale's decimal sign, the grid's numerals (Arabic-Indic with `numerals: 'locale'` in `ar-EG`), **no
  group separators, no format scaling** (a percent column opens 0,15, not 15 %); exponent forms (`1e+21`) open
  as they are (the codec reads them back: kept unchanged, nothing is saved).
- Review (2026-10-24): `edit.maxLength` — a whole number ≥ 1 is the cap (above 2^31 − 1: clamped); **0 or
  Infinity: no cap**; absent: 1 000; any other value (negative, fractional, NaN): 1 000.

## Built at step 6 (2026-10-24, `@dzgrid/dom/editors` part 2, `@dzgrid/dom/editors-list`)
- 1 (choice, in this order): `edit.editor` a built-in name (`text`, `number`, `day`, `instant`, `boolean`, `list`); another
  name → the part of slot `editor` of that name (none: `unknown-part`, no editor); else a part `editor.<type>`
  replaces that type's built-in; else `edit.options` given, or an `enum` column → the list; else by type.
  `edit.editor: 'list'` without options: `invalid-column` at `columns.<id>.edit.editor`, a text field. More than 500
  options: `invalid-column` at `columns.<id>.edit.options` (detail `500`), a text field read by the codec.
- **The list is its own entry** (owner S6-O7): `editors({ list: listEditor })` with `listEditor` from
  `@dzgrid/dom/editors-list`; without it a list column opens a text field read by its codec (an enum's labels and
  aliases read) and one warning `missing-feature` at `columns.<id>.edit`, detail `@dzgrid/dom/editors-list`.
- 6: the opening text is written by the editors, not the column's display format: a day as numbers in
  `dayFieldOrder`, two-digit day and month, four-digit year, the locale's separator (its bidi marks dropped), the
  grid's digits; an instant that day in the grid's zone, then `HH:mm` (24 h), `:ss` only when not 0. The example in
  the placeholder and in `validation.day {pattern}` is today written so. **Written-value rule**: Enter, Tab or a blur
  with the text the grid wrote (at the opening or by a pick) unchanged keep that value (an untouched second reading
  of a repeated hour is not refused; a reading picked is kept as picked); any typed change goes through the codec.
- 7 (**the calendar on its button**, owner S6-O4): the calendar is downloaded only when the button is hovered or
  pressed, or at the first open (button or Alt+ArrowDown); typing a date, opening the field or focusing it never
  downloads tzslot (replaces « focusing the field prefetches it »). One chunk (`editors/dates/calendar.js`), imported
  once; a failure is forgotten so Retry imports again. The field is an ARIA 1.2 combobox opening a dialog
  (`role="combobox"`, `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`, `aria-keyshortcuts`): a text box
  may not carry `aria-expanded` (axe, Chrome). `editors({ calendar: false })`: no button, typing only, nothing loaded.
- 7–8: the dialog is modal (`PopupHost`), under the field (above when no room), never over it; focus on the day
  selected or today; while loading `role=status` « Chargement du calendrier » and `aria-busy`, focus on the dialog's
  box; failed: `role=alert` and Retry (`grid.retry`), the error reported. A day picked writes the field and closes;
  an instant: the day moves the focus to tzslot's hour menu, each menu change writes the field, Enter on a menu
  closes. Escape in the dialog closes it only (focus back in the field, caret at the end); a second Escape gives the
  edit up. A press outside closes the dialog, the field's blur rule then keeps (Q5).
- 9 (changed): without tzslot the import fails like an offline chunk — the alert and Retry; no `missing-feature`
  (a missing package cannot be told from a failed network without importing). The app turns the button off with
  `calendar: false`.
- Instants: tzslot's hour and minute menus (`readingStyle: 'named'`, 24 h, the grid's zone): the hour a clock skips
  is not offered, the repeated hour twice by its offsets (owner S6-O5); a day that never was (Samoa 2011-12-30) is
  disabled. **Days** are zone-free calendar days: no day is disabled there (a deviation from the plan's wording).
- 10–11: Space and Enter toggle an editable yes/no cell (Enter goes first to a part whose `focus()` takes it), a double
  click or a double tap toggles once (the browser's double click after a double tap is not a second toggle), Delete
  clears; one save each, origin `edit`, no `editingStarted`; the new text said politely; refused: the blink and the
  sentence. A yes/no cell is skipped by Tab (it opens no editor).
- 12–17: the combobox in the cell keeps the focus, the listbox in a popup under the cell (`aria-activedescendant`);
  options ≥ 24 px (44 px under a coarse pointer); Up/Down, Home/End, PageUp/PageDown clamped; letters within 500 ms a
  folded prefix (case, accents, tashkil, alef forms), the same letter again cycles, Backspace shortens it; Space picks
  and keeps without moving (a letter during a prefix); Enter keeps and moves, Tab keeps and goes on, Escape gives up;
  a press on an option keeps (the focus stays). A blur keeps the active option (unmoved, it is the cell's own value:
  nothing saved). An options function is called at the opening with the row and `settings.context`; one that throws
  is reported and opens nothing. Refused: the list closes, the combobox stays invalid under the bubble; Down shows it.
- 18–19 (the app's editor): a part of slot `editor` gets `{ value, text, row, key, column, start, char?, keep(input),
  cancel(), refuse(code), own(el) }` and the base; its handle may give `read()`, what Enter, Tab and a blur keep (none:
  nothing kept). `keep(input)` keeps what it is given and moves as Enter; refused, it stays open under the bubble.
  Keys the part prevents are its own. A part that throws at mount is reported, the cell focused, not tried again on
  that cell until its row's data changes. `destroy()` runs before its host is emptied.
- Field keys (found on the playground): Home, End, PageUp, PageDown in an open field are the field's — Home and End
  move the caret (Shift extends the selection), the pages do nothing — and the grid never scrolls under it. Chrome
  on macOS scrolls the nearest scroller on Home/End instead of moving the caret: the grid ran to its last row and the
  edit was kept out of sight.

## Review of step 6 (2026-10-24)
- The list: an empty options list moves nothing; options (or an options function) that give no list: refused
  « invalid » (the blink, the sentence), nothing opens, one warning `invalid-column` at `columns.<id>.edit.options`
  per column. **`aria-selected` follows the active option** (APG select-only combobox); the check mark follows it.
- Field keys: Shift+Home and Shift+End keep the selection's anchor (the end it started from).
- Instants: seconds are floored, never rounded — 23:59:59.5 opens as 23:59:59 (never « 24:00 »), 12:05:00.600 as 12:05;
  an untouched text keeps the stored value, milliseconds included (nothing saved).
- Yes/no: a held Space or Enter (key repeat) toggles once and selects nothing.
- The app's editor: a `mount` that gives no handle is a broken part (reported, the cell focused, not tried again on that
  cell until its data changes); `cancel()` and `refuse()` after the editor closed do nothing.
