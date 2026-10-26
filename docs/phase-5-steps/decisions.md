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

## Step 3 (owner, 2026-10-23) — plan `step03-plan.md`

- **S3-O1:** A — validators are synchronous only; checks that need the server happen at save (a server refusal blinks and returns to the previous value, Q9).
- **S3-O2:** the owner asked for "a global system" that follows the app's API shape: the app's `save` decides. One request per cell → each cell gets its own answer. One request for a batch → a thrown/rejected error refuses the whole batch (all cells blink and return), OR the answer names cells (e.g. `error.cells` / a per-cell result) → only those are refused, the others kept. ~120 B in `core/edit` (inside its 3 000).
- **S3-O3:** A — simple rules in the column: `edit: { required, min, max, pattern, options }`; messages can quote the limit (« au moins 5 »).
- Lead: move the `validate` shape check from the base into `core/edit` (base −17 B) as the plan proposes.
- **S3-O4 (2026-10-23):** `@dzgrid/core/edit` 3 000 → 3 100 (measured 3 045 with the global refusal system).

## Step 4 (owner, 2026-10-23) — plan `step04-plan.md`

- **S4-O1:** a new entry `@dzgrid/dom/edit` (wires createEdits to the grid: marks, timers, stale rows, header mark, announcements), taken out of the 8 000 B granted to `/editors` (the two together stay ≤ 8 000; split set at the measure).
- **S4-O2:** the mark styles go in a separate `edit.css` of `@dzgrid/theme` (the base theme does not grow). Its budget is taken from the unused part of the theme grants (base kept ≤ 2 500 of the 2 900/3 050 granted); the measured size is reported to the owner before a ceiling is fixed.
- **S4-O3:** no muted rows on server-paged grids; the header mark is enough.
- **S4-O4 (2026-10-23):** `-edit` text bundles en/fr/ar 350/400/450 → 560/630/810 (measure + 10 %); `edit.css` ceiling 1 350 (measured 1 231); `/editors` stays at 4 350 (8 000 minus `@dzgrid/dom/edit` 3 650) — measured at step 5 and asked again if the editors need more; dom base entry 21 300 → 21 700 (inside the 21 980 grant).

## Step 5 (owner, 2026-10-23) — plan `step05-plan.md`

- **S5-O1:** `/editors` stays 4 350 for step 5 (owner's earlier word: measure, ask again at step 6).
- **S5-O2:** field and bubble styles in `edit.css`; ceiling 1 350 → 1 700.
- **S5-O3:** new `-editors` text bundles en/fr/ar 450 / 500 / 620 (the 5 parse codes move there from `-edit`).
- **S5-O4:** on touch, a double tap opens the editor; a single tap selects.
- **S5-O5:** default input length cap 1 000 characters (the app can change it).

## Step 6 (owner, 2026-10-24) — plan `step06-plan.md`

- **S6-O1:** `/editors` 4 350 → 6 500 (DOM editing ~10 150 vs the 8 000 of Q16: a new grant).
- **S6-O2:** our own list (APG combobox, folded Arabic type-ahead), not the native `<select>`.
- **S6-O3 (lead, recommendation kept):** focus stays on the cell; no hidden proxy input; manual check 124a decides (blocking for the Part A close); EditContext only after a spike.
- **S6-O4:** the calendar is downloaded on its button only (typing a date downloads nothing); the editors sheet is updated.
- **S6-O5 + S6-O6:** date-and-time calendar with tzslot's hour/minute menus; `edit.css` 1 700 → 2 100; the tzslot loader moved (not copied) into `@dzgrid/dom/internal` (ceiling measure + 50, up to 1 250); new lazy calendar chunk 1 500 (inside the 2 600 of Q16 d).
- **S6-O7 (2026-10-24):** `/editors` measured 7 158 / 6 500: the list moves to its own entry `@dzgrid/dom/editors-list` (ceiling at the measure + 10 %, ~1 650), loaded only when a column has a list; `/editors` stays ≤ 6 500.

## Step 7 (owner, 2026-10-24) — plan `step07-plan.md`

- **S7-O1:** `@dzgrid/dom/edit` 3 650 → 3 750; `/editors` 6 500 → 6 650; `edit.css` reserve up to 2 200 only if Firefox/WebKit need a fix. Re-measure the `-edit` texts first (step 5 moved five texts out).
- **S7-O2:** a network failure says « serveur injoignable » (its own sentence), not « refusé par le serveur ».
- **S7-O3:** on a page/query change of a server grid, the typed text is kept and sent when the change is announced, while the row is still held (the recommended option, no `core/edit` change).
- **S7-O4:** on a failed cell, the refusal reason replaces the column's own tooltip while the error stays.
- **S7-O5 / S7-O6 (lead, recommendations kept):** under reduced motion `onCell` is still called with `reduced: true`; the same `orders-edit` demo is extended (paged mode included).
- **Q3 revised (owner, 2026-10-24):** the DEFAULT of `enterMoves` becomes 'stay': Enter saves and the focus stays on the cell; 'down' (Excel-like, Shift+Enter up) is the option. Sheets, docs and tests updated in step 7.
- **Saving border vs focus ring (owner feedback, 2026-10-24):** with Enter staying on the cell, the running border must be clearly distinct from the focus ring: its own colour (applied: the palette's warning, `--tz-warning`; contrast.css a cyan in the dark, where its accent and warning are both yellow), a different shape (applied: 3 px inside the 2 px focus ring), the ring kept visible; a browser check (fr light Clinic, ar dark Midnight, reduced motion) and `check:contrast` hue pairs (≥ 60°). It stays in `edit.css`, which used the S7-O1 reserve: 2 101 / 2 200.

## Step 8 (owner, 2026-10-24) — plan `step08-plan.md`

- **S8-O1:** `@dzgrid/dom/edit` 3 750 → 4 000; `@dzgrid/dom/tree` 3 700 → 3 800; `ar-edit` 810 → 900 only if the measure needs it.
- **S8-O2 (lead, recommendation kept):** `api.undo()` / `api.redo()` behave like the keys (focus, reveal, sentence).
- **S8-O3:** a nested grid whose panel closes while a save is in flight stays alive until the answer; nothing is lost. `@dzgrid/dom/detail` 3 900 → 4 000.
- **S8-O4:** undoing a change whose cell is hidden (parent closed, row filtered out): the value is restored and said; focus does not move; nothing is expanded.
- **S8-O5 (lead, recommendation kept):** demos — an editable tree (`orders-edit?tree=1`) and editable visits in `detail.html`; Undo/Redo buttons in orders-edit.
- **S8-O6 (owner, 2026-10-24):** `@dzgrid/dom/edit` 4 000 → 4 150 (measured 4 085). After Ctrl+Z the undo sentence is joined with the saving one (« Annulé : Client …, enregistrement en cours »), as built. Lead: Ctrl+Z while an editor waits for its paint is left to the browser (no change in `/editors`).

## Order after Part A (owner, 2026-10-24)

- Step 9 (Angular + Part A gate) → Part B (steps 10–13: ranges, clipboard, fill handle, bulk edit, 0.3.0) → the docs website.
- Part B starts with the invented orders demo; the owner's real `pharma/stock` sheet (Q19) is integrated when it arrives (no longer a prerequisite).
- **S8-O7 (owner, 2026-10-24):** `@dzgrid/dom/detail` 4 000 → 4 150 (measured 4 092): nothing lost in a closed nested grid (kept alive while saving or refused, released when its master row leaves or at the outer destroy).

## Step 9 (owner, 2026-10-25) — plan `step09-plan.md`

- **S9-Q4:** the real Angular example gets a second « stock » screen, loaded on demand, with editable columns; the audit screen's initial load stays under 90 000; the stock screen is measured apart.
- **S9-Q5:** Part B may start before the owner's manual checks 124a–b; Part A stays open on that point until they are done.
- **S9-Q6:** `@dzgrid/angular` ceiling at the measure + 50, at most 7 000.
- **S9-Q1–Q3 (lead, recommendations kept):** editing wired through `[features]` (`edit()`, `editors()`, `listEditor`), no `[editing]` input; a live `[save]` input; outputs for the existing events; `c.reads(...)` for template editors through the existing `dzgPart slot="editor"`.
- **S9-Q7 (owner, 2026-10-25):** the real Angular example's ceiling 90 000 → 92 000 (the stock screen loaded on demand splits the build: audit 91 082 with the split, 89 349 without; the ~1 700 B is the cost of two gzip streams, not editing code). The K.8 profile guard stays 83 500.

## Part B (owner, 2026-10-25) — plans `partB-plan.md`, `step10-plan.md`

- **QB1:** Shift+click and Ctrl+A select a block of cells (like Excel); rows are checked by their box.
- **QB2 (lead, recommendation kept):** during Shift+arrows the focus follows the moving corner.
- **QB3:** copy guards formula starts (= + - @) like the CSV; our own paste removes the guard.
- **QB4:** paste limit 100 000 cells; over it nothing is pasted and a sentence says so.
- **QB5:** bulk edit by Ctrl+Enter in the field (`/editors` 6 650 → 6 720).
- **QB6:** a value or a small block pasted on a larger range repeats, like Excel.
- **QB7:** a sort/filter change while a block is selected drops the block, said once.
- **QB8:** if `dom/range` goes over 4 500, the fill handle moves to its own entry; benches measured in Chrome at step 12, marked indicative until the quiet-machine run (Q17d).
- **QB9 + QB10:** copied numbers follow the locale (decimal comma in fr, point in en, as the CSV); a pasted « 1 234,50 € » / « DZD » in a number column has the currency removed and is read as 1234.5.
- **Budgets:** `core/range` 4 000, `dom/range` 4 500 (Q16); new `-range` texts en/fr/ar 350/400/500; `range.css` 500; `/editors` 6 720 (QB5); dom base ~+20 B for `aria-multiselectable` inside the 21 980 grant.
- **QB10 confirmed (owner, 2026-10-25):** 3-letter codes are stripped too. Lead precision after the review: only REAL currency codes (ISO 4217, `Intl.supportedValuesOf('currency')`) plus the local forms `DA`, `د.ج`, `دج`, `ج.م`; never any 3 capitals (`SKU 100` stays refused). Bidi marks are ignored around the symbol; a sign before a leading symbol is kept (`-$1,234.50` → −1234.5); accounting parentheses stay refused.

## Step 11a (owner, 2026-10-25) — plan `step11a-plan.md`

- **S11-Q1:** during a mouse drag the focus moves to the moving corner when the button is released (not on every cell).
- **S11-Q2:** after Ctrl+A or Shift+Space the focus stays where it is.
- **S11-Q3:** a tree's pinned parent copies show the block tint (~15 B in the base).
- **S11-Q4:** a sort/filter that drops the block has its own sentence (« Sélection effacée : l'ordre a changé »), one more text.
- Lead: `vite.config.ts` is not edited (it would restart the owner's 4700 server); the playground imports the range entry by path.
- **S11-Q5 (owner, 2026-10-25):** 11a accepted at 2 846 B gz in `dom/range` (4 500); per QB8 the fill handle (step 12) goes to its own entry; the clipboard (11b) stays in `dom/range`.
- **S11-Q6 (owner, 2026-10-25):** the `@dzgrid/core/range` (and needed `@dzgrid/dom/range`) aliases may be added to `vite.config.ts`; vite on 4700 reloads itself (never stopped or killed by an agent).

## Step 11b (owner, 2026-10-25) — plan `step11b-plan.md`

- **S11b-Q1:** cut (Ctrl+X) copies and clears the cells at once (one save, undoable).
- **S11b-Q2:** no Safari workaround now; the owner tests on a real Safari; added only if that test shows a problem.
- **S11b-Q3:** if `dom/range` goes over 4 500, its ceiling may rise to at most 4 800.
- **S11b-Q4:** the paste sentence is « Cellules collées : 12 ; refusées : 2 » (no plural forms).
- **S11b-Q5 (owner, 2026-10-25):** `dom/range` measured 5 098 > 4 800: the pasted-HTML reader becomes a lazy chunk loaded only when a paste carries no plain text (~4 710 in `dom/range`; the lazy chunk gets its own size line at the measure + 10 %). The shortened Arabic texts (to fit 500) go to the Arabic reviewer.

## Order revised (owner, 2026-10-25)

- After Phase 5 (step 13, 0.3.0 prepared): **Phase 6** (column menu, column chooser, group drop zone, column moving, GridState, pinned rows…) comes BEFORE the docs website. Docs website after Phase 6.
- **Order confirmed (owner, 2026-10-25):** Phase 5 close → Phase 6 → docs website → Phase 7 (grouping) → 8 (server infinite/blocks) → 9 (xlsx, menus, status bar, advanced filter, row drag) → 10 (pivot) → 11 (hardening, ecosystem). `dmp-doctor-patients` last, after a security review.

## Step 12 (owner, 2026-10-25) — plan `step12-plan.md`

- **S12-Q1/Q4:** the fill handle in its own entry `@dzgrid/dom/fill` 1 600; texts `-fill` en/fr/ar 250/300/380; `fill.css` 300.
- **WCAG 2.5.7:** a single-pointer, no-drag way to fill is built NOW (e.g. a « Recopier vers le bas / la droite » control), ~150 B.
- **S12-Q3:** no handle for touch (finger) only; mouse and pen drag it; on touch, Ctrl+D/R or the no-drag control.
- **S12-Q6:** Ctrl+D on a one-row block copies the row above (as Excel); Ctrl+R the column to the left (mirrored in RTL).
- **S12-Q2/Q5/Q7 (lead, recommendations kept):** keyboard fill mode Ctrl+Shift+Enter then arrows; Ctrl+Enter when the field's own cell refuses: one save, the field stays open; the dataset B bench is indicative only (Q17d).
- **S12-Q8 (owner, 2026-10-25):** Excel-like cues: the fill handle (small square, crosshair cursor on hover) shows on a single active editable cell too, not only on a block (bottom-right, bottom-left in RTL); the block and active cell get a clearly visible accent border (≥ 2 px, ≥ 3:1), distinct from the saving/refused borders; hidden on touch-only, read-only cells and non-data rows.
- **S12-Q8 bis (owner, 2026-10-25):** « avec les flèches je ne vois pas la cellule, je ne sais pas où je suis »: the keyboard position must be obvious: a stronger ring plus a cell tint on the active cell, and a subtle active-row tint (contrast-checked, forced colours, RTL, no layout move), in the base theme and both skins.
- **S12-Q9 (owner, 2026-10-25):** `@dzgrid/dom/fill` 1 600 → 3 000 (measured 2 729: base ~1 700, drag, keyboard mode, Ctrl+D/R, click-click all kept); `fill.css` 300 → 460.
- **S12-Q10 (owner, 2026-10-26):** the real Angular example ceiling 92 000 → 92 500 (measured 92 059 after S12-Q8's theme cues and the Angular range/fill inputs). K.8 guard stays 83 500.
