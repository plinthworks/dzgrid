# Step 17 decisions (owner and lead, 2026-10-20) — pagination

Plan: `step17-pagination-blueprint.md` (same folder).

- Q1 (owner, "Oui, la page seulement"): on browser pages the header box acts on the displayed page only (tick adds the page's rows, untick removes them, other pages untouched; Ctrl+A follows the box); the footer says "N selected (some not shown)" and offers "Select all N rows" and "Clear selection". Server pages unchanged (the box selects the whole query). Closes Q2 of step 7.
- Q2 (owner, "Oui"): with an unknown total the footer says "51 to 100" and "Page 3" (no "of …"), and there is no last-page button on cursor servers.
- Q3 (owner, "Oui"): during Phase 3, reset to the measure + 10 % at the close: `@dzgrid/dom` 18 900 → 19 100; new `@dzgrid/dom/pagination` 3 800; new `@dzgrid/dom/internal` 650 (shared by slots, filters, search, pagination: mounted, the after-the-answer announcer, the IME check); pagination bundles en 560 / fr 680 / ar 880; theme 1 800 → 2 050. Warned: the audit initial load reaches about 69.5 kB of 85; step 26's GSAP code must load on demand.
- Lead: the footer is the feature's (no base element; one base fix: the overlay stops above it via `--dzg-footer-size`); no second live region (the count is plain text, `announce.page` through the grid's live region); disabled buttons are `aria-disabled` (focus never drops); no page-number list or jump input (Phase 5); count in words, not a dash (RTL); `missing-feature` when paging is on without `pagination()`; `pagination()` dormant with paging off (`invalid-page`).
