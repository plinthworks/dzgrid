# Filtering a text column

## What the user does
Types into a column's filter, picks an operator: contains, starts with, ends with, equals, does not contain, is not equal, blank, not blank.

## What they observe
- Case is ignored. An empty box means no filter at all.
- The count of displayed rows updates as the filter changes.

## What DzGrid does
- Accents, Arabic short vowels, tatweel and alef forms are ignored by default (D2): `helene` finds `Hélène`, `محمد` finds `مُحَمَّد`. `caseSensitive: true` makes the comparison exact.
- Negations are exact complements (D4): *does not contain* and *is not equal* include blank cells.
- The typed text is not trimmed: a trailing space is part of what is searched.
- A cell holding only spaces is not blank.

## Tests
`conformance/cases/filter-text/*`.
