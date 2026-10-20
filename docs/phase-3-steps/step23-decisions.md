# Step 23 decisions (owner and lead, 2026-10-20) — the Angular example

Plan: `step23-example-blueprint.md` (same folder).

- Q1 (owner, "Non, lancement séparé"): the full Angular example (`examples/angular-audit`, its own dependencies, not a workspace member) is launched apart (`npm run example:build`, then `ng serve` in its folder); the playground menu keeps its light « Angular » fixture.
- Q2 (owner, "21 complet, 19 et 22 en essai rapide"): Angular 21 fully (build, SSR, zone.js, bytes); 19 and 22 as a smoke (build + SSR), run by hand when the network is available, trees in the scratchpad deleted after; offline → "not run", never "passed".
- Lead: the Arabic CSV sample is written to `examples/angular-audit/out/audit-ar.csv` (untracked) for the owner's Excel check; K.8 stays the esbuild profile gate in check:size, the real-build DzGrid share recorded as information; over 85 000 → stop.
