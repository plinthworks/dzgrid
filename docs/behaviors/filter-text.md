# Filtering a text column

## What the user does
Types into a column's filter, picks an operator: contains, starts with, ends with, equals, does not contain, is not equal, blank, not blank.

## What they observe
- Case is ignored. An empty box means no filter at all.
- The count of displayed rows updates as the filter changes.

## What DzGrid does
- Accents, Arabic short vowels, tatweel and alef forms are ignored, and `ى` is read as `ي`, by default (D2): `helene` finds `Hélène`, `محمد` finds `مُحَمَّد`. `caseSensitive: true` makes the comparison exact.
- Negations are exact complements (D4): *does not contain* and *is not equal* include blank cells.
- The typed text is not trimmed: a trailing space is part of what is searched.
- A cell holding only spaces is not blank.
- **The popup** (step 13): an operator (`contains` first; the column's `filter.ops` narrows the eight and orders them) and one value field, hidden for blank and not blank (which apply at once). An empty value removes the filter. A stored `caseSensitive` is kept. Phase 9 (owner Q-F2 A): with `filters({ matchCase: true })` or `filter.matchCase: true` each text row carries a « Match case » checkbox writing its `caseSensitive`; with `maxConditions` above 1, several rows joined by AND or OR (`filter-combined.md`). A combined filter the rows cannot show still shows "Filter active" and Clear.

## Tests
`conformance/cases/filter-text/*`.
