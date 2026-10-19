# Step 10 decisions (owner and lead, 2026-10-19) — CSV export in the core

Plan: the architect's blueprint, summarised in `step10-csv-blueprint.md` (same folder).

- Q1 (owner): optional entry `@dzgrid/core/csv`, budget 2 500 B gz measured over the core; core budget 26 000 → 26 100 B gz for `ClientModel.allRows` (all rows the query matches, across pages). Both during Phase 3, reset to the measure + 10 % at the close.
- Q2 (owner): scope `selected` exports only the selected rows the current query shows (filters apply, as for `all`); a selected row hidden by a filter (keepOnFilter) is not exported; the count given before the export says so.
- Q4 (owner): a per-column option `csv: 'text'` (column definition) keeps numeric-looking identifiers as text in Excel (leading zeros kept). Lead's rule: the field is written `="0123"` ONLY when the value is digits only (`^[0-9]+$`) — such a formula cannot carry an injection, so the formula guard stays whole; any other value of that column is written normally (and guarded).
- Q3 (lead): the formula guard also covers a leading LF and the invisible bidi marks (U+200E, U+200F, U+061C) before `= + - @`.
- Q5, Q6 (owner, already on file): logical column order for Arabic readers checked on the sample at step 23; canExport and audit events are step 19.
- Q7–Q10 (lead): one header row of leaf labels (no group rows); full-width rows written as ordinary rows; wall-time instants without milliseconds (`instants: 'iso'` for exactness); no `eol` option and no `sep=` line.
