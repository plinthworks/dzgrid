# Phase 5, step 1 — behaviour sheets, listening §19, docs (plan)

Sources: `docs/phase-5-plan.md` step 1, D1–D16; `decisions.md` Q1–Q19 (they win, Q9 and Q10 as amended
by the owner); WAI-ARIA 1.2 grid (`aria-readonly`, `aria-invalid`, `aria-describedby`), APG
grid "editing" keys and the select-only combobox, WCAG 2.2 (2.3.1, 3.3.1, 3.3.3, 4.1.3). Clean room: our
words, behaviour from public docs only. **No code, no tests, no budgets this step** (Q16's grants go into
`size-budget.json` with the step that first builds the entry).

## Sheets to write (`docs/behaviors/`)

| Sheet | Must settle |
|---|---|
| `editing.md` | start keys (F2, Enter, double click, printable, Delete/Backspace clear), end keys (Enter/Shift+Enter with `edit.enterMoves`, Tab/Shift+Tab with `edit.tab`, Escape, blur), what belongs to the field, `data-dzg-owner="editor"`, `aria-readonly` per cell, rows never editable (detail, filler, loading), tree structure columns read-only (Q13), tree column Left/Right in the editor, nested grids, accessible name of the field |
| `edit-save.md` | the save handler, one gesture one request, states and classes, the running border while saving (Q10 amended), flash on saved, server refusal (Q9: animation, back to the last saved value, mark that stays), server grids (Q18), row gone while editing (Q8), announcements |
| `edit-reapply.md` | muted rows, header mark, one sentence, reapply by the mark or the app (Q6, Q7), focus after reapply |
| `edit-undo.md` | keys, 100 gestures, undo of a saved value saves again (Q11), skip when changed since, nested grids, API |
| `edit-validation.md` | local refusal (editor stays open, typed text kept, message, Escape), the 0.5 s red border, reduced motion, codes, sentence, blur and Tab with an invalid value |
| `editors.md` | text, number, day/instant (typed + tzslot calendar loaded on demand, Q14), boolean, simple list with type-ahead (Q15), custom `editor.<name>` part |
| `edit-angular.md` | inputs, outputs, `dzgEditor` template, no forms (Q17), zone |

Each sheet: numbered testable statements, a keyboard table, announcements, fr/en/ar texts (Arabic in
raw characters, to be read by the Arabic reader), RTL notes, the tests to be written later.

Also: `docs/a11y-protocol.md` §19 (items 111–), `phase-5-plan.md` aligned on `decisions.md` with an
« Owner decisions applied » note, ARCHITECTURE §6 and ROADMAP renamed per Q2 (editing = Phase 5, later
phases +1, 0.3.0), `docs/STATUS.md`. Short pointers in older sheets (`motion.md`, `cell-class.md`,
`tree-keys.md`) are left to the steps that touch them (wording only, not needed to start step 2).

## Architect's picks (lightest that works; owner may override)

1. **Running border while saving (Q10 amended): CSS in the theme, not GSAP.** A class
   `dzg-cell--saving` written by the base from the overlay's statuses (so a pooled cell always shows
   the right state, and scrolling needs nothing), a `::after` ring drawn with a conic gradient masked
   to the border, turned by an animated registered custom property (`@property`). Runs without the
   motion feature and without GSAP (on by default, as decided); turned the other way under
   `dir="rtl"`; `prefers-reduced-motion` or `data-motion="off"` → a still dashed border; still too after 5 s of saving (WCAG 2.2.2); off by
   `edit({ savingBorder: false })` (`data-dzg-saving="still"`… on the root). Cost: theme, ~150–250 B
   (grant 2 900). The motion run chunk only gains the `onCell(el, c, 'saving' | 'saved' | 'failed')`
   reasons (host's own effects) and the built-in saved flash (grant 3 500). To check at step 7 in
   Chrome, Firefox, WebKit: `@property` support, paint cost with 50 saving cells while scrolling.
2. **Refusal animation (Q9): CSS in the theme** (`dzg-cell--refused`, 500 ms, two blinks inside the
   500 ms; a new refusal restarts the 500 ms (never a second animation stacked) and blinks again only
   if the last blinks started 1 s ago or more, else stays still red: never more than 3 flashes in any
   second, WCAG 2.3.1), removed by the base after 500 ms; reduced motion → a still
   red border for 500 ms.
3. **Simple list editor: APG select-only combobox** (not a native `select`: same keys in every
   browser, our type-ahead with the grid's folding).

## Open points (choices the sheets make; to confirm with the owner)

See the « Choices to confirm » list at the end of each sheet; the main ones:
O1 blur or a click elsewhere with an **invalid** value: the typed text is dropped (refusal shown and
said) rather than trapping the focus. O2 a **failed** save: the editor reopened by F2/Enter on that
cell offers the refused text again (the retry); the refused gesture leaves no undo entry. O3 « saved »
is silent (the pending sentence is said once, the flash shows the rest). O4 muted rows = rows that no
longer pass the filters; a row only out of sort order is not muted (the header mark tells it). O5 the
reapply mark sits on every sorted or filtered header; with only a quick search, on the edited column's
header. O6 reapply from the keyboard: the mark is a header button (F2/Enter as other header controls);
no new shortcut. O7 which columns feed a tree's structure: `tree({ structure: [...] })` names them,
default the tree column in path mode. O8 boolean cells: Space toggles the value on an editable boolean
cell (row selection by Space stays on every other cell). O9 a server grid's page change while editing
counts as « hidden » (typed value saved). O10 undo moves the focus to the undone cell. O11 the host's
refusal reason comes as `error.reason` (a string the host translated); without it, a generic text.
