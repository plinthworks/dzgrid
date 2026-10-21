# Phase 4 decisions (owner and lead, 2026-10-21)

Plan: `docs/phase-4-plan.md`.

- Q1 (owner): tree data arrives in all three shapes — a parent column (`parentId`), nested lists (`children`), and paths (`path(row) => string[]`, missing levels become folder rows). Owner: « regarde comment ag-Grid fait » — answered from ag-Grid's PUBLIC documentation only (CLEANROOM: behaviour from public docs, never code): it offers the same three ways (a parent-id field, a children field, a data path), which matches D3. Order of work: parent, nested, path.
- Q2 (owner, "Non au début"): selection in trees is independent (no cascade) at first; a cascade option (tri-state parent) later, for fully loaded client trees only.
- Q3 (owner, "Seulement ce qui correspond"): filtering keeps matching rows and their ancestors (muted when they don't match); folders open while the filter is active and get back their state when it is cleared.
- Q6 (owner, "Les deux"): lazy children both ways — the host's own loader (A) and first-class server children in `sourceRows` through the gate (B), both in step 7.
- Q4 (owner): detail height default fixed 240 px, configurable (number, function, or 'auto' measured for free content; a nested grid needs a fixed/function height).
- Q5 (owner): nested grids tested at 2 levels, soft cap 3 (problem beyond); tree and detail on the same grid not in Phase 4.
- Q7 (owner, "Oui"): budgets during Phase 4, reset to the measure + 10 % at its close: core plan ceiling 28 000 → 29 000; theme 2 300 → 2 500; new `@dzgrid/core/tree` 3 500, `@dzgrid/core/detail` 1 000, `@dzgrid/dom/tree` 2 600, `@dzgrid/dom/detail` 3 500, `locales/{en,fr,ar}-tree` 200 / 220 / 250; others held (dom 21 300, filters 10 000, angular 6 000, core/csv up to 2 000, K.8 guard 83 500).
- Q8 (owner, "Oui aux deux"): the floating filter row gets a live toggle (`filters().floating.set(on)`, `.get()`, `.bind(button)`; Angular `[floatingFilters]`); filters typed in the row stay active when it is hidden (the header's filtered mark shows it); a pending edit is flushed on hide; a focus in the row moves to the column header.
- Lead (architect's D1–D12 kept unless contested): Right/Left/`*` on the tree column (mirrored in RTL), Ctrl+A takes visible rows, a detail is one focus stop (Enter in, Escape out), tree animations reuse glide and fade, spans and paging disabled with tree/detail (unsupported-combination).
- Q9 (owner, 2026-10-21, "Oui"): lazy children live in two opt-in entries, `@dzgrid/core/tree-lazy` budget 1 500 and `@dzgrid/dom/tree-lazy` budget 1 000 (measure + 10 %); no existing budget moved.
- Q10 (owner, 2026-10-21, while testing the tree demo): sticky parent rows — while scrolling through children, their ancestors stay pinned under the header. Configurable by the app: `tree({ sticky: 0 | 1 | n })`, default the whole line of ancestors capped at 3. Scheduled right after step 8, before step 9 (both touch row painting).
