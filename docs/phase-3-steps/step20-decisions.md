# Step 20 decisions (owner and lead, 2026-10-20) — ready cell parts

Plan: `step20-parts-blueprint.md` (same folder).

- Q1 (owner, "Oui"): badges have five fixed tones (neutral, info, success, warning, danger), each with a small shape (✓, !, ✕, i; none for neutral) besides the colour; the host maps each value to a tone; a "success" (green) colour joins the theme palette.
- Q2 (owner, "Texte visible"): boolean cells show "✓ Yes" / "✗ No" as visible text, no tone colour; null shows nothing.
- Q3 (owner, "Oui aux deux"): `ui.cellClass` stays at step 26 (shared cell hook with the flash and motion-gsap; base margin 52 B); until then a part can style. Budgets during Phase 3, reset to the measure + 10 % at the close: `@dzgrid/dom/parts` 600 B gz; `@dzgrid/dom/locales/{en,fr,ar}-parts` 130 / 140 / 160; theme stays 2 050; base and core unchanged.
- Lead: worked example 2 (the between-two-numbers slider filter, plugins §B2.8) is a test fixture only; no GridFeature for parts (they only mount into hosts); new keys `cell.yes`, `cell.no` in their own bundles.
