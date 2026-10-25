# Typing or pasting a value

## What the user does
Types into a cell, or pastes text from a spreadsheet, into a column with a type.

## What they observe
- The text is read as the column's type. What cannot be read is refused, not stored as text.
- A percent sign means divided by 100. A day is read in the order the user writes days.

## What DzGrid does
- No guessing, because the data may be medical (D5): `1,5` in an English locale is refused, not read as 15 or 1.5; two-digit years and month names are refused.
- Arabic-Indic and Persian digits, the Arabic decimal and group separators (U+066B, U+066C) and percent sign (U+066A) are read; invisible direction marks are dropped.
- Yes/no words are read in French, English and Arabic.
- A typed date-time inside a clock change is refused (D8); one loaded from the host is read `compatible`, with a warning (see `instant-reading.md`).

## Pasted text (Phase 5 Part B, `clipboard.md` 19)
Before a pasted cell is read, its text is made ready for the column (`pasteText`): in a number column one
currency sign or code at the start or the end is removed (owner QB10: `1 234,50 €` → 1234.5; `(1 234)`
still refused); in other columns the copy's formula guard `'` (`'=1+1`) and identifier mark (`="0123"`)
are removed. Everything else is read as typed, by the same reader.

## Tests
`conformance/cases/value-parse/*`; pasted text: `packages/core/test/range-paste-text.test.ts`.
