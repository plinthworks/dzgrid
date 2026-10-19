# Step 11 decisions (owner and lead, 2026-10-19) — header, overlay and tooltip slots

Plan: `step11-slots-blueprint.md` (same folder).

- O1 (owner, "Module à part"): the base keeps today's built-in header, overlay and tooltip as the defaults (no part machinery); the drivers that let a host replace them by its own parts live in a new optional entry `@dzgrid/dom/slots` (feature `slots()`). Budgets during Phase 3, reset to the measure + 10 % at the close: `@dzgrid/dom` 18 000 → 18 600 B gz; `@dzgrid/dom/slots` 1 300 B gz (externals core, core/internal and the dom base, as spans); locales en 540 → 560, fr 660 → 680, ar 850 → 870 (key `grid.retry`); theme 1 180 → 1 280 (the retry button).
- O2 (owner, same answer): `grid.retry` is a new required message key in every bundle (pre-1.0, custom bundles add it).
- O3 (owner, same answer): the retry button on the error overlay is built into the base (every server grid needs it, no opt-in); it dispatches `rows.refresh` and gives the focus back to the grid.
- O4 (lead): a header part draws the label's content only; the grid keeps the role, aria-sort, the sort mark, the resize grip and the click-to-sort; the filter button and active mark (step 13) are feature decorations next to the sort mark, not part content (amends B2.2).
- O5 (lead): a tooltip part shows only when the host's text is non-empty (D11 stays); it is mounted at show and destroyed at hide (no row kept by a hidden tooltip).
- O6 (lead): the overlay part's context has `retry()` and `clearFilters()`.
- O7 (lead): full-width rows drawn by a part are deferred (step 20 or Phase 5; spans has 27 B of margin).
- O8 (lead): `GridFeature.parts` deferred to step 12 (its first user); parts.md is corrected.
- Without `slots()`, a registered `header`, `overlay` or `tooltip` part is `missing-feature` (warning), once.
