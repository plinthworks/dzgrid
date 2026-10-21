# Step 25 decisions (owner and lead, 2026-10-21) — the Phase 3 close

Plan: `step25-close-blueprint.md` (same folder).

- Q1 (owner, "Oui"): Phase 3 closes on the DzGrid side without step 24; an "Intégration Sehhaty" track opens with step 24 first (the audit-logs spec, palettes `sehhaty.json`, the Arabic review, the Excel check, the screen-reader listening §7–§15, API answers, criterion 7 in production). Exit criteria 1 (Sehhaty part), 4, 5 and 7 are marked "renvoyés, décision du propriétaire, 2026-10-21". Then Phase 4 (tree, master/detail).
- Q2 (owner, "Oui, +35 % pour Chrome"): sizes and Node times = measure + 10 % (sizes rounded up to 50 B; Node times to the half-ms, sub-ms lines keep their ceiling); headless-Chrome times = measure + 35 %.
- Q3 (owner, "Oui"): the K.8 profile guard is set to measure + 10 % (about 83 500); the official K.8 ceiling stays 85 000 and guards the real Angular example (`example:bytes`).
- Q4 (owner, "Pas maintenant, 0.1.0 prête"): no npm publication now; prepare 0.1.0 (four aligned packages, CHANGELOG, a local tag `v0.1.0`), published later on the owner's word only, after the GSAP licence confirmation, reserving the @dzgrid scope and publishing @tzslot 2.2.0.
- Lead: budgets are set last, after the final review; never above the plan's ceilings (core 28 000, dom 30 000, locales 2 000, theme 9 000, /server 6 000); raises where the measure + 10 % is above the old cap (e.g. export) are applied too (the owner's rule works both ways); carried items placed per the blueprint (later-phase targets confirmed when Phase 4 is planned), plus the owner's question of 2026-10-21: a live show/hide of the floating row → Phase 4.
