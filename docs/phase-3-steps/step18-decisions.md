# Step 18 decisions (owner and lead, 2026-10-20) — audit screen, permutations, K.8

Plan: `step18-audit-blueprint.md` (same folder).

- Q1 (owner, "Oui, premier chargement"): the K.8 ceiling (85 000 B gz) counts the initial load of the audit screen (what loads before the first gesture); lazy chunks (tzslot date kits, the set filter chunk, the date adapters) are measured and printed beside it, with no budget.
- Q2 (lead, owner informed): the owner's audit-logs spec is not needed for step 18 (an invented seven-column example); it is needed at step 24 (columns with fr/ar titles, types, server-sortable; filters with API parameter and exact format; API paging offset/cursor, total, max page size, sort parameter, text search, timestamp zone, error shape, export route/file/job; export audit trace).
- Q3 (owner, "Oui"): about twelve reference screenshots tracked in `docs/screenshots/step18/`, written only with `--update-shots`; `packages/dom/test/browser/results/` becomes untracked scratch (.gitignore, `git rm --cached` the tracked ones).
- Q4 (owner, "Fermer au clic dehors"): revises step 13's O7 — a pointer down outside the filter popup closes it. In the browser the typed filter is kept (the pending edit is flushed, as Escape); on a server an unapplied draft is dropped (as Escape). The focus goes where the user clicked (no focus stolen back); if nothing focusable took it, it returns to the anchor. A pointer down inside a tzslot panel (inside the popup) does not close it. Update filter-ui.md and the step 13 decisions note.
- Lead: tier 1 (1 000 permutations per configuration, jsdom) stays in `test:ci` only if it measures under ~90 s total, else `npm run test:perm` joins the commit gate; keep main.ts's small server; in configuration B only `occurredAt` is server-sortable (arithmetic).

## At the step's close (2026-10-20, lead)
- Tier 1 measured: 1 000 seeds per configuration in about 107 s on one worker (over the ~90 s rule): `npm run test:perm` runs them and joins the commit gate in STATUS; `test:ci` plays the first 25 per configuration. No seed cut, no script shortened.
- The listening steps of the audit screen are `docs/a11y-protocol.md` §14 (§13 was taken by the pagination at step 17); §11 item 54 and §12 item 63 now point to `/audit.html?config=server&latency=1200`.
- Found by the permutations and fixed, tests first: the sort sentence said before the answer with the old page's count; two sentences for one clear-all; the value list moving 32 px as it filled (Chrome); a fetched set keeping its page when the query changed and changed back. **For the owner:** the last one revises how step 5 part 3 read "changed and changed back" (the same set, page kept): now page 1, as server pages and the sheet's "a search change goes back to the first page" say.
- Q5 (owner, 2026-10-20, permutation finding): a fetched set goes back to page 1 when its query changes, even back to an earlier query (as server pages); a refresh keeps the page. Reverses a step 5 behaviour.
