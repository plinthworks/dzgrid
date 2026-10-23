# A refused value

Sources: the public documentation of grids and forms that check a typed value (what a user sees: the
field stays open with a message), WAI-ARIA 1.2 (`aria-invalid`, `aria-describedby`), WCAG 2.2 (3.3.1
error identification, 3.3.3 error suggestion, 1.4.1 not colour only, 2.3.1 three flashes, 2.4.11 focus not obscured, 2.3.3 and
`prefers-reduced-motion`, 4.1.3). Phase 5 plan D6; owner decision Q9 (his own variant, « Mixte »).
Server refusals: `edit-save.md` 13–16.

## What the user does
Types text in a number column, leaves a required cell empty, types a date that does not exist, a value
under the minimum; presses Enter.

## What they observe
- The cell's border blinks red for half a second, then stays marked as wrong while the field is open.
- The field stays open with what they typed; a short message under the cell says why (« nombre
  attendu »).
- They correct it and press Enter, or press Escape to give up.
- A screen reader says one sentence: « Stock : valeur refusée, nombre attendu ».

## Behaviours
1. A value is checked when it is kept (Enter, Tab, blur, Delete's clear): first read by the column's
   codec (`value-input.md`). The codec only says `REJECTED`; the refusal code is chosen by the column's
   type: `number` → `parse`; `day` → `day`; `instant` → the instant reading's own code
   (`packages/core/src/value/instant.ts`: `invalid-instant`, `wall-time-skipped`,
   `wall-time-ambiguous`; `ambiguous-instant` and `unknown-zone` cannot come from a field, which always
   reads in the grid's zone); a list → `options`; `boolean` and `custom` → `invalid`. A value given
   rather than typed (a list pick, a toggle, an undo) the codec cannot read is `invalid` too. An emptied
   field is not a parse refusal: it is the column's empty value (`null`), checked by `required`; a field
   of spaces is empty too, except in a text column, where spaces are a value someone typed (as
   `filter-text.md`), so `required` passes. Then the column's checks, written in the column (owner
   S3-O3): `edit: { required, min, max, pattern, options }`, in that order — `min` / `max` compared by
   the codec (a number, a day, an instant), `pattern` on string values and over the whole value (a RegExp's `g`, `y` and `m`
   flags dropped, `i`, `u` and `s` kept; a pattern is the developer's configuration: one that backtracks
   badly is the app's responsibility, the DOM caps the length typed), `options` a list or a function `(row, context)` (one that throws refuses `invalid`, told once like
   `validate`'s; a list column checks against
   its `enumOptions` when it has no `options`; the cell's current value always passes, editors.md 17) —
   then `validate(value, row, context)` returning a code or null (synchronous only, owner S3-O1; an
   empty string is no code; one that throws refuses `invalid` and is told once per column as a
   warning). The first failing code wins. A cell that cannot be edited answers `read-only` (the DOM
   never asks). A bad rule (`min` the codec cannot read, a `pattern` that does not compile, `options`
   neither a list nor a function, `validate` not a function) is a warning `invalid-column` at
   `columns.<id>.edit.<rule>` (`columns.<id>.validate`), told once while it stays wrong, and ignored.
2. **Every refusal shows the refusal animation**: class `dzg-cell--refused` on the cell for 500 ms, the
   border red and blinking twice inside those 500 ms, then back to normal. Reduced motion or
   `data-motion="off"`: the red border, still, for 500 ms. CSS in the theme.
2b. **Never stacked** (WCAG 2.3.1): a new refusal on the same cell restarts the 500 ms (one animation per
   cell, never two at once); it blinks again only if the previous blinks started 1 s ago or more,
   otherwise the border stays red and still for the new 500 ms. So a cell never shows more than 3 flashes
   in any one second, however fast Enter is pressed.
3. **Local refusal** (1): the field stays open with the typed text and the caret where it was;
   `aria-invalid="true"` on the field; a message bubble under the cell (above near the grid's bottom),
   never covering the field (WCAG 2.4.11; the field itself kept clear of pinned columns and sticky rows,
   `editing.md` 26), linked by `aria-describedby`; while invalid, the field keeps a steady invalid outline (not colour
   only: the bubble's sign and text).
4. Typing again keeps the bubble until the next keep; a value that passes on the next Enter closes the
   field normally (the bubble goes, `aria-invalid` removed).
5. Each refusal is said once (assertive): `edit.refused` with the column's header name and the code's
   text. Enter again on the same wrong value: the animation and the sentence again.
6. **Escape** gives up: the field closes, the old value stays, the bubble goes, nothing said.
7. **Tab** with a wrong value: refused like Enter; the field stays open, the focus does not move.
8. **Blur** with a wrong value (a click elsewhere): the focus is never pulled back; the typed text is
   **dropped**, the old value stays, the animation runs on the cell, and `edit.refusedDropped` is said.
9. **Delete** on a required cell: refused, the animation, `edit.refused` with `validation.required`; no
   field opens.
10. A custom code without a text in the messages: `validation.invalid` (generic). A host may add
    `validation.<code>` texts to the messages.
11. Codes only in the core (`Problem`-free: a refusal is not a host mistake); sentences in the DOM's
    messages; never row data in an event's problem.
12. Paste and fill (Part B): refused cells are skipped and counted, one sentence `edit.refusedCount`, the
    animation on each refused cell that is shown (≤ 50).
13. Nested grids: each grid's own bubble and sentence.

## Keyboard
| In a refused field | Key | Result |
|---|---|---|
| | Enter, Tab | check again (refused again, or kept and moved) |
| | Escape | give up, old value |
| | typing | edit the text; bubble stays |

## Texts (`locales/{en,fr,ar}-edit`)
| Key | en | fr | ar |
|---|---|---|---|
| `edit.refused` | {column}: value refused, {reason} | {column} : valeur refusée, {reason} | {column}: قيمة مرفوضة، {reason} |
| `edit.refusedDropped` | {column}: value refused, change cancelled | {column} : valeur refusée, modification annulée | {column}: قيمة مرفوضة، أُلغي التعديل |
| `edit.refusedCount` (plural, Part B) | {n} cells refused | {n} cellules refusées | one: رُفضت خلية واحدة ({n}) · two: رُفضت خليتان ({n}) · few: رُفضت {n} خلايا · many: رُفضت {n} خلية · other: رُفضت {n} خلية |
| `validation.parse` (number) | number expected | nombre attendu | المطلوب رقم |
| `validation.day` | date expected ({pattern}) | date attendue ({pattern}) | المطلوب تاريخ ({pattern}) |
| `validation.invalid-instant` | date and time expected | date et heure attendues | المطلوب تاريخ ووقت |
| `validation.wall-time-skipped` | this time does not exist that day (clock change) | cette heure n'existe pas ce jour-là (changement d'heure) | هذا الوقت غير موجود في ذلك اليوم (تغيير الساعة) |
| `validation.wall-time-ambiguous` | this time occurs twice that day | cette heure existe deux fois ce jour-là | هذا الوقت يتكرر مرتين في ذلك اليوم |
| `validation.required` | a value is required | valeur obligatoire | القيمة مطلوبة |
| `validation.min` | at least {min} | au moins {min} | الحد الأدنى {min} |
| `validation.max` | at most {max} | au plus {max} | الحد الأقصى {max} |
| `validation.pattern` | wrong format | format incorrect | صيغة غير صحيحة |
| `validation.options` | choose a value from the list | choisir une valeur de la liste | اختر قيمة من القائمة |
| `validation.invalid` | invalid value | valeur invalide | قيمة غير صالحة |

`{pattern}` is the locale's day pattern (« JJ/MM/AAAA », « DD/MM/YYYY », « يوم/شهر/سنة »); `{min}` and
`{max}` are formatted by the column's format.

## Right to left
The bubble aligns with the cell's inline start; the sign before the text (logical); the typed text
keeps its own direction (`dir="auto"`, numbers and dates isolated left-to-right).

## Choices to confirm
- Blur with a wrong value drops the typed text (no focus trap) — the decisions say « editor stays open »
  for a local check, which holds for Enter and Tab.
- Tab with a wrong value stays in the field.
- The red blink = two blinks within 500 ms; a refusal less than 1 s after the last blinks stays still red.

## Tests (to be written with the code)
Step 3: validators' codes (conformance). Step 5: each code's sentence, `aria-invalid` and
`aria-describedby`, animation class added and removed after 500 ms (fake timers), restarted not stacked and no blink within 1 s (2b), the bubble's place clear of the field, reduced motion still
border, Escape, Tab, blur dropped, Delete on required; browser: axe 0 with the bubble open in fr light / ar
RTL dark / forced colours; Arabic-Indic digits accepted, `1,5` in en refused. Manual: §19.
