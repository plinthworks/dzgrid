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

## Tests
`conformance/cases/value-parse/*`.
