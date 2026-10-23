# Phase 5 (editing): the owner's decisions (2026-10-22)

Questions: `questions.md`. These answers win over `docs/phase-5-plan.md`.

- **Q1 scope:** A — everything in this phase, in two parts (Part A cell editing with saves and undo; Part B ranges, clipboard, fill handle, bulk edit).
- **Q2 naming:** A — editing is Phase 5; later phases move up by one; 0.3.0 at the end.
- **Q3 Enter:** A — Enter saves and moves down, Shift+Enter up; configurable by the app (`edit.enterMoves`, "stay").
- **Q4 start:** A — F2, Enter, double-click, or typing a printable character (replaces the text); Delete clears. Not on a single click.
- **Q5 leaving the cell** (click elsewhere, Tab): A — what was typed is kept and saved.
- **Q9 refused value:** owner's own variant, then "Mixte" chosen:
  - every refusal shows a short problem animation: the cell border turns red / blinks for about 0.5 s, then returns to normal;
  - **local check** (validator): the editor stays open with the typed text, a message says why; Escape cancels;
  - **server refusal**: after the 0.5 s animation the cell returns to its previous value; an error mark stays (reason on hover/focus);
  - always one sentence for screen readers (e.g. « Stock : valeur refusée, nombre attendu »); reduced motion → the red border without movement;
  - paste: refused cells are skipped and counted (as proposed).
- **Q11 undo/redo:** A — in this phase, 100 gestures; undoing a saved value saves again.
- **Q6 row no longer matching sort/filter:** A — stays in place, muted, until reapply.
- **Q7 reapply gesture:** A — a small mark on the sorted/filtered header, announced once; a click reapplies; the app can too.
- **Q8 row gone while editing:** A — only hidden: kept and saved; deleted: cancelled and announced.
- **Q13 tree parent/path columns:** A — read-only this phase (row moves come with row dragging).
- **Q10 save states:** B, then amended by the owner the same day (« lors de la modification serveur une animation du bordure avec gsap ou autre chose qui montre une modification est en cours »): fixed marks (pending sign, brief check, error sign that stays) plus a small flash when saved, AND an animated border around the cell while a save is in progress (moving/running border; GSAP or CSS/SVG, the step architect picks the lightest that works in RTL, with pooled rows and scrolling). Lead defaults: on by default, the app can switch it off; reduced motion or `data-motion="off"` → a still border; never announced (the pending state is announced once by text); stops at once on saved/failed, then the flash or the Q9 refusal animation follows.
- **Q18 server-paged grids:** A — editable; the value stays shown until the next server answer; the app decides whether to reload.
- **Q12 app context to filters and sort:** A — now (~100 B core).
- **Q14 dates:** A — typing, plus a tzslot calendar loaded on demand.
- **Q15 lists:** A — a simple list with type-ahead; the searchable list later.
- **Q17 Angular:** A — the app gives its save function and receives events; its editors by template; no Angular forms.
- **Q19 Sehhaty `pharma/stock`:** A — an invented "stock" demo in the playground first; the owner writes the real sheet before Part B.
- **Q16 budgets:** A — all accepted for the phase: core held 29 000; `core/edit` 3 000; `core/range` 4 000 (Part B); DOM base 21 300 → 21 800; `/editors` 8 000 + lazy calendar 2 600; `dom/range` 4 500 (Part B); `-edit` texts en/fr/ar 350/400/450; theme 2 500 → 2 900; Angular 6 250 → 6 900; motion run 3 150 → 3 500 (the saving border, Q10 amended; the Q16 ask already covered it). Real example under 90 000, K.8 under 83 500. Reset to measure + 10 % at the close, never above these grants. Note: the Q9 refusal animation must fit these numbers (CSS in the theme preferred); any overrun goes back to the owner.

## Step 1 follow-ups (2026-10-22)

- **O1 (owner):** a value refused by a local check when the user clicks away (the editor cannot stay open): the typed text is dropped, the border blinks red ~0.5 s, the previous value returns, one sentence is announced (« modification abandonnée : nombre attendu »); nothing to undo. Enter and Tab keep the editor open as in Q9.
- **O2–O11 (lead decisions, written in the sheets):** O2 a failed save is retried by reopening the cell, which offers the refused text; a refused change leaves nothing to undo. O3 « saved » is not spoken. O4 only rows failing the filter are muted. O5 the reapply mark goes on every sorted/filtered header. O6 keyboard reapply through that header button only. O7 the app names the tree's parent/path columns with `tree({ structure })`. O8 Space toggles a yes/no cell instead of selecting the row. O9 a server page change while editing counts as "hidden" (the value is saved). O10 undo moves focus to the changed cell. O11 the server's refusal reason comes from `error.reason`. Also: a network failure is treated like a server refusal; Backspace clears like Delete.

## Step 2 (owner, 2026-10-22)

- **S2-O1:** a host update that moves rows while the order is stale reapplies everything, edited rows included.
- **S2-O2:** on a server-sorted/filtered column the stale mark is shown; reapply sends one request.
- **S2-O3:** the app context reaches filter kinds, `editable` and `validate` only; sorting (via `value(row, context)`) later. This narrows Q12.
- **S2-O4:** `@dzgrid/core/server` 6 000 → 6 100 (grant). The `tree({ structure })` wiring in `dom/tree` moves to step 8 with its own budget request; the core seam stays in step 2.
- **S2-O5 (2026-10-23):** `@dzgrid/core/detail` 1 000 → 1 050. Its code is unchanged (2 181 B min); its gzip delta over the grown core moved to 1 002. Ceiling in `scripts/rebudget.mjs` and `size-budget.json`.

## Showcase themes (owner, 2026-10-23) — plan `themes-plan.md`

- **T1:** the grid's CSS in `@layer dzgrid` by default, plus an unlayered copy for apps whose reset (Tailwind 3 preflight, Bootstrap Reboot) would beat it.
- **T2:** NOT the recommendation: a theme gives all its colours by hand (no secondary colours computed from the four main ones). The bridges still map every colour.
- **T3:** the Tailwind 3 bridge is a CSS file using `theme()`.
- **T4:** Tailwind 4, Tailwind 3 and Bootstrap become root devDependencies, to RUN tests only — never shipped, their source never read (clean room).
- **T5:** `rowClass`, `headerClass` and a class per pill tone, now.
- **T6:** names `midnight` and `clinic`; applied on import, or on one area with `data-dzg-skin`.
- **T7 sizes (grants):** `midnight.css` 650, `clinic.css` 650, each bridge 500 (Tailwind 4, Tailwind 3, Bootstrap); theme base inside 2 900, up to 3 050 if needed; dom base 21 800 → 21 980 (class hooks ~120 + layer wrapper ~30). Reset to measure + 10 % at the close, never above.
- **T8 (2026-10-23):** Angular `[rowClass]` added; `@dzgrid/angular` 6 250 → 6 300 (a separate grant; the 6 900 editing grant stays for editing, so the Phase 5 ceiling becomes 6 950).
- **T9 (2026-10-23):** the owner chose that the BRIDGE wins over a showcase skin: layer order stays layout < theme < skin < bridge < contrast (the part 2 change to bridge < skin is reverted). An app using a bridge sees its framework's colours; to show midnight/clinic it does not load a bridge (document this).

## Demos (owner, 2026-10-23) — plan `demos-plan.md`

- **D1:** NOT the recommendation: add a numeric `rowHeight` setting (px, chosen by the app; ~40–60 B gz in dom, inside the dom grants). It overrides the density's row height; live; behaviour sheet and tests first (scroll math, paging, sticky parents, detail heights, 1 M rows, scaled scrolling). The HR demo uses it for two-line cells.
- **D2:** department pills are drawn by the demo with 6 neutral colours (contrast-checked), not `badge` tones.
- **D3 (2026-10-23):** Angular `[rowHeight]` input added; `@dzgrid/angular` 6 300 → 6 350 (separate grant; the editing grant stays for editing). Lead defaults kept (to confirm with the owner later if needed): header rows follow `rowHeight`; range 24–1 000 px; `null` = no value (density height).
- **D4 (2026-10-23):** in the orders demo the owner does not want the detail's header: sub-orders are shown as child rows in the SAME grid (tree shape, `parentId`), same columns, no repeated header, with a slightly different background the app controls (a CSS variable set by the demo, applied through `rowClass`). No library change. Sort/filter apply to the whole grid. The nested-grid "same columns" version is replaced by this one (the Phase 4 master/detail demos stay).
- **D3 (2026-10-23):** Angular `[rowHeight]` put back; `@dzgrid/angular` 6 300 → 6 350 (budget and rebudget ceiling).
- **D4 (2026-10-23):** the orders demo has no detail header: sub-orders are child rows of the same grid (tree shape, `parentId`), same columns, a slightly different background the app sets through a CSS variable (`--orders-child-bg`) applied by `rowClass`. No library change. It replaces the nested-grid « same columns » version (the Phase 4 master/detail demos stay).
