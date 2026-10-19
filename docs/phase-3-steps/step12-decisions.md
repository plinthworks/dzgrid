# Step 12 decisions (owner and lead, 2026-10-19) — the floating filter row

Plan: `step12-floating-blueprint.md` (same folder).

- O1 (owner, "Fichier à part"): filter texts live in separate bundles per language, `@dzgrid/dom/locales/{en,fr,ar}-filters`, spread by the host into its messages; the base bundles do not grow; filter keys are optional in `GridMessages`, and `filters()` throws a TypeError naming any missing key.
- O2 (owner, "Oui à tout"): during Phase 3, reset to the measure + 10 % at the close: `@dzgrid/dom` 18 600 → 18 750 (GridFeature.parts, the slot→feature map, missing-feature for filters, the header column CSS); new `@dzgrid/dom/filters` 2 900 (outlook about 10.5 kB at step 16, asked again at each step); filter bundles en 200, fr 230, ar 290; theme 1 280 → 1 400.
- O3 (owner, "Comme proposé"): the floating row is fixed at creation (no live show/hide yet); the inline box edits only "contains" (text) and "equals" (number); any other filter on that column shows "Filter active" and a Clear button (set from the popup at step 13).
- O4 (lead): the summary text is short and static ("Filter active"); the Clear button's name carries the column.
- Lead: Enter/F2/Escape handled by the feature on the cell (no core or conformance change); clear-all from the overlay becomes one `query.set` (one server request); built-in parts never store an inactive filter, custom parts must send null when inactive (filter-custom.md); the header decoration seam (filter button, active mark) waits for step 13; `part-shadowed` waits for step 22; `Mounted` moves to a shared `src/mounted.ts`.
