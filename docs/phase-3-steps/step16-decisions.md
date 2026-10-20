# Step 16 decisions (owner and lead, 2026-10-19) — quick search box

Plan: `step16-search-blueprint.md` (same folder).

- Q1 (owner, "Oui, le champ de la page"): the grid draws no search box; a feature `quickSearch()` binds the host's own input with `search.bind(input)` (several inputs allowed; unbind restores what we set).
- Q2 (owner, "Oui"): its own optional entry `@dzgrid/dom/search` (an app with only a search box does not load filters), budget 1 100 B gz; `@dzgrid/dom` 18 750 → 18 900 (the warm-up on focus seam); filters, core, bundles, theme unchanged. During Phase 3, reset to the measure + 10 % at the close.
- Q3 (owner, "Oui aux deux"): after a pause the grid says "N rows" (existing `announce.rows`, no new key), nothing when a server does not know the count; the overlay wording stays; highlighting matches in cells is deferred to Phase 5.
- Lead: pauses 150 client / 300 server; trimmed text; Enter applies (preventDefault), blur applies, Escape clears when non-empty (stopPropagation) and passes through when empty; ArrowDown moves to the grid; IME guarded with `isComposing || keyCode === 229` (also applied to the filters boxes); warm-up on the first focus of a bound input, client only; echo: the kernel wins (a clear-all rewrites the boxes), two boxes mirror; attributes set only when absent: aria-controls (same root only), dir=auto, autocomplete=off, enterkeyhint=search, spellcheck=false; never the host's name, describedby, id, type, classes or styles.
- Q4 (owner, 2026-10-20, after the review fixes measured 1 251 B gz): `@dzgrid/dom/search` 1 100 → 1 300 during Phase 3, all fixes kept.
