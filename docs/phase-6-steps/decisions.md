# Phase 6 (advanced columns and comfort): the owner's decisions (2026-10-26)

Questions: `questions.md`. These answers win over `docs/phase-6-plan.md`.

- **Q-M1:** A — full column menu: sort, pin, auto-size (this / all), keyboard resize, move one place, hide, « Choisir les colonnes… », « Filtrer… » (when filters exist), reset columns, plus app actions.
- **Q-M2:** A — the ⋮ button (on hover and focus; always on touch) and right-click on the header.
- **Q-M3:** A — no finger drag of columns; on touch, move through the menu or the chooser.
- **Q-K1:** A — Alt+Down keeps opening the filter; the menu opens with Shift+F10 or the Menu key; with no filters, Alt+Down opens the menu.
- **Q-K2:** A — Ctrl+Shift+Left/Right moves a column one place, Ctrl+Shift+Home/End to the edge; a sentence says the new place.
- **Q-K3:** A — keyboard resize mode from the menu or Alt+R on the header; Left/Right ±10 px (Shift: 1 px), Home fits the content, Enter keeps, Escape cancels.
- **Q-C1:** A — the chooser is a dialog over the grid (from the ⋮ menu or an app button), closed by Escape or an outside click.
- **Q-C2:** A — changes apply at once.
- **Q-C3:** A — the side panel « Filtres » tab comes in Phase 9.
- **Q-H:** A — drag handles AND keyboard reordering (Alt+Up/Down on a row, the place said).
- **Q-GH:** A — collapsible header groups with their own open/closed state (~40–80 B core).
- **Q-G:** A — Phase 6 prepares the header drag protocol and writes the drop-zone sheet; the visible « Nom × » zone comes in Phase 7.
- **Q-S1:** A — GridState saves columns (order, width, hidden, pinned, open groups), sort, filters, search, page and page size, density. Not expanded rows, selection or scroll position.
- **Q-S2:** A — the app receives a small JSON plus a change signal; optional helpers for browser storage and for the page address.
- **Q-P:** C (NOT the recommendation) — pinned rows top AND bottom, never sorted or filtered, keyboard-reachable, AND EDITABLE in this phase (through the Phase 5 edit layer). Their cost is measured at their step.
- **Q-R1:** A — auto row height per column (`wrap: true`); a fixed `rowHeight` wins; works with details; a developer warning beyond 10 000 rows.
- **Q-R2:** A — density: a function for the app plus an optional line in the ⋮ menu; kept in the state.
- **Q-I:** A — `preparePrint()`: shown rows (filtered, sorted), at most 5 000, a real table (repeated headers, Arabic RTL); « 5 000 premières lignes » beyond; on a server-paged grid, the shown page.
- **Q-SE + Q-O:** the owner's tie-break — the column MENU and the CHOOSER first (Sehhaty's need). Order: sheets → moving columns → ⋮ menu → chooser → GridState (core, then helpers) → keyboard resize and auto-size → collapsible groups → pinned rows (editable) → auto row height → print → Angular and demos → close (0.4.0 prepared).
- **Q-B:** A — budgets accepted for the phase: core 29 000 → 29 150; dom base 21 980 → 22 400; new entries `core/state` 1 500, `dom/state` 800, `dom/columns` 3 500, `dom/column-menu` 3 000, `dom/columns-panel` 4 000, `dom/pinned-rows` 2 000 (editable rows: re-measured at their step), `dom/auto-height` 1 400, `dom/print` 1 600; texts `-columns` 500/600/800, `-print` 150/150/200; `columns.css` 1 100, `print.css` 400; `dom/spans` 4 950 → 5 300; Angular 7 000 → 7 300; K.8 guard 83 500 → 84 000; real example 92 500 → 94 500. Reset to measure + 10 % at the close, never above.

## Step 1 follow-ups (2026-10-26)

- **O6 (owner):** the address helper leaves typed filters and the search OUT by default (privacy: patient names in history and server logs); the app may opt in.
- **Mac (owner):** column moves use Cmd+Shift+arrows on macOS, Ctrl+Shift+arrows elsewhere.
- **O1 (owner):** the last shown column can never be hidden; no « Tout masquer ».
- **O5 (owner):** in the chooser dialog a finger may drag a row by its handle.
- **Lead decisions (as written in the sheets):** O2 keyboard moves never cross a pinned edge; O3 `movable: false` keeps its place and disables the pin items; O4 group headers do not move this phase; O7 one opaque `grid=1.…` URL parameter; O8 blocks/paste/fill stay inside one pinned band, Ctrl+Home/End stay on body rows, pinned bands take at most half the view; O9 print leaves out detail panels and writes merged cells on every row; O10 Tab or a click keeps the new width in resize mode; O11 Shift+right-click keeps the browser's menu; O12 Escape in a non-empty chooser search empties it first; C3 « no filters » is per column; C5 the density line in the menu is off by default; C6 editing.md rule 1 widened for pinned rows at their step.

## Step 2 (owner, 2026-10-26) — plan `step02-plan.md`

- **Q2-1:** A — the header drag ships in step 2; keyboard moves and `api.move()` cover access until the ⋮ menu (step 3) brings the single-pointer path; nothing is published before step 3.
- **Q2-2:** A — no drop animation in Phase 6.
- **S12-Q12 (owner, 2026-10-26; Phase 5 fill carried into Phase 6):** WCAG 2.5.8 for the fill: the 10 px handle stays (no accidental fills); the ≥ 24 px pointer equivalent is a pair of items in the column ⋮ menu (step 3): « Recopier vers le bas (Ctrl+D) » and « Recopier vers la droite (Ctrl+R) » acting on the current block. Until step 3, the fill is not WCAG 2.5.8-complete (nothing is published before). Lead: pen behaves like touch for the fill too (no pen fill), as for range.

## Working method (owner, 2026-10-26: cost)

- One agent after each change does both the code review and the test analysis; mutants run once, by it (~25); the implementer writes tests first but runs no mutant round.
- During a step, only the touched browser groups (`--only …`, plus the playground page when the demo changes); the full browser suite (and test:tz, Firefox/WebKit `--all`) at a phase close.
- Fewer progress messages to the owner.
- **S12-Q13 (owner, 2026-10-26; replaces S12-Q11):** a pointer press outside the grid CLEARS the block. Lead: a press inside an element marked `data-dzg-keep-range` (an app's « Exporter / Envoyer » button) keeps it, so the app can still read the block; an app setting `range({ clearOnOutside: false })` keeps the old behaviour. The single-cell handle rule (fill.md 25) is unchanged.
- **S12-Q14 (owner, 2026-10-26):** `@dzgrid/dom/range` 4 800 → 4 950 for the outside-press clear (measured 4 873).
- **Step 2 lead (2026-10-26):** `dom/columns` part 1 measured 2 800 against the plan's internal stop of 2 300; accepted inside the owner's 3 500 grant (Q-B), leaving ~650 B for part 2 (step 6); if part 2 needs more, it goes back to the owner.
- **S12-Q15 (owner, 2026-10-26; revises S11-Q1/QB2 for the pointer):** after a mouse drag selection the active cell (focus) stays on the START cell (the anchor), as in Excel; the handle stays at the block's far corner; after a fill the focus does not move and the block covers source + filled rows (handle at the new corner). Keyboard Shift+arrows keep their own rule (to be checked against the anchor rule by the implementer and reported).
- **S12-Q16 (owner, 2026-10-26):** Escape means « je ne veux plus rien faire »: it clears the block AND hides the visible active-cell frame, tint and handle (a "quiet" state); the grid keeps the focus position, and the frame comes back at the next key (arrows, Tab, a character, F2…) or click. Lead note: keeps WCAG 2.4.7 (the indicator is visible whenever the keyboard is used to move).
- **Working method, second round (owner, 2026-10-26):** architects and the combined reviewer run on the lighter model (Sonnet); the implementer keeps the default model; mutants only on pure logic modules (core, order/state/fill planning), not on display code; the combined review runs once every 2–3 steps (each step still has its own implementer gate). The architect stays before each step.

## Step 3 (owner, 2026-10-26) — plan `step03-plan.md`

- **Q3-1:** opening the menu (⋮, right-click, Ctrl+click) does not move the focus; the block survives; on close the focus returns where it was.
- **Q3-2:** a separate text bundle `-column-menu` en/fr/ar 450/550/650, loaded only with the menu.
- **Q3-3:** exact reset: the core accepts `width: null` (~25 B core, inside 29 150).
- **Q3-4:** the density line now through the app (`onDensity`), `setDensity` at step 6.
- Lead: keyboard resize is step 7 (not 6); no `invalid-menu` problem code; classes only (no replaceable parts) for the button and items.
- **Q3-5 (owner, 2026-10-26):** `@dzgrid/dom/column-menu` 3 000 → 4 300 (measured 3 951, full menu kept); `-column-menu` texts en/fr/ar 450/550/650 → 500/600/700. Core seam guard 28 916 → 28 930 for `width: null` (Q3-3).

## Step 4 (owner, 2026-10-26) — plan `step04-plan.md`

- **Q4-1 (lead, recommendation kept):** the chooser texts live in `-columns` (fits 500/600/800).
- **Q4-2:** a new `columns-panel.css` (~900 B; ceiling at the measure + 10 %, up to 1 000).
- **Q4-3:** above 200 columns, CSS `content-visibility` instead of JS windowing.
- **Q4-4:** `@dzgrid/dom/columns-panel` may rise from 4 000 up to 4 400 if needed.
- Lead (from the plan): the chooser anchors on the grid root (unticking the opener's column must not close it); the popup host's Tab trap skips `tabindex="-1"` (+~15 B popup); new pure order functions get the mutants; `align: 'end'`; `columnsChooser()` with `open/close/isOpen` and `onClose`.
- **Order revised again (owner, 2026-10-26):** the docs website moves to the very END (after Phase 11). Order: Phase 6 → 7 → 8 → 9 → 10 → 11 → docs website.

## Step 5 (owner, 2026-10-26) — plan `step05-plan.md`

- **E5-1:** one server request per restore: an internal `rows.hold(fn)` seam (≤ 110 B core) defers the fetch to one `load()` at release; used by `restoreState` and `persistLocal`.
- **E5-3:** the address helper caps the state at 4 KB; beyond it, it keeps the minimum (columns, sort) and warns the developer.
- **E5-2/E5-4/E5-5/E5-6/E5-7 (lead, recommendations kept):** the new problem codes live in `core/state` if the types allow; the state helper is a feature; Angular inputs at step 12; the rest as the plan recommends.
- **E5-8 (owner, 2026-10-26):** `@dzgrid/dom/state` 800 → 1 150 (measured 1 058, one entry kept); `@dzgrid/core/server` 6 100 → 6 150 confirmed for the `rows.hold` seam (E5-1). Reminder to agents: never raise a size line without an owner decision.

## Step 6 (owner, 2026-10-26) — plan `step06-plan.md`

- **Q6-1:** no − / + / ✓ buttons in the resize mode; the single-pointer path (WCAG 2.5.7) is the menu's « Élargir / Rétrécir » (keeps the menu open). `dom/columns` stays within its 3 500 grant (target 3 500–3 800 → if over 3 500, stop and ask).
- **Q6-2:** auto-size measures the real rendered cells (batched DOM probe), exact for Arabic and badges.
- **Q6-3..Q6-5 (lead, recommendations kept):** rows measured = the visible rows plus the first 200; badges/parts measured only when mounted; fonts measured at once, no waiting for font loading.
- Update column-resize.md: remove the − / + / ✓ buttons, cite the menu path for 2.5.7.
- **Q6-6 (owner, 2026-10-27):** `@dzgrid/dom/columns` 3 500 → 4 200 (measured 3 996 with the resize mode and auto-size in the same entry); `columns.css` 1 100 → 1 200; `-columns` texts en/fr/ar 500/600/800 → 550/650/850.

## Step 7 — collapsible header groups (owner, 2026-10-27) — plan `step08-plan.md` (file named after the plan's original numbering)

- **Q8-1:** `-columns` texts en/fr/ar → 600 / 720 / 900 (the 5 group sentences).
- **Q8-2 (lead):** if the core seam goes over 120 B, `columnsChanged` is emitted from `dom/spans`, not a kernel command.
- **Q8-3:** a block touching a column that gets folded shrinks to the remaining columns; if nothing remains it is cleared. If `dom/range` would go over its 4 950 line, stop and ask.
- **Q8-4 (owner, 2026-10-27):** the fold UI goes to its own entry `@dzgrid/dom/groups` (~1 400 B; line at the measure + 10 %), loaded only with collapsible groups; `dom/spans` stays within 5 300.
- **Q8-3 revised (owner, 2026-10-27):** folding a column clears the block (as for a hidden column); no shrink, 0 B in `dom/range`.
- **Q8-5 (owner, 2026-10-27):** lines pushed by compression only: `core/edit` 3 100 → 3 150, `core/server` 6 150 → 6 200, K.8 profile guard 83 500 → 84 000 (already granted in Q-B).

## Step 8 — pinned rows (owner, 2026-10-27) — plan `step08b-plan.md`

- **Q1:** blocks, paste and fill inside the bands by keyboard AND mouse, in two sub-steps (8b-1 core/bands/keys/single-cell editing, 8b-2 blocks and fill); `dom/range` up to ~5 200, `dom/fill` up to ~3 150 (re-asked if over).
- **Q2:** core up to 29 150; dom base +150–200 (≤ 22 400); `dom/pinned-rows` 2 000, up to 2 300 if editing needs it; new `-pinned` texts 120/140/170; `pinned-rows.css` ~450. Over any of these: ask.
- **Q3:** with few rows, the bottom band sticks to the grid's bottom like a table footer (~40 B).
- **Q4/Q5 (lead, recommendations kept):** `editable(row, context, { pinned })` third argument; the save payload gets `pinned: 'top' | 'bottom'`.

## Step 9 — auto row height (owner, 2026-10-27) — plan `step09-plan.md`

- **Q9-1:** pinned bands keep the normal row height (long text truncated with … and a tooltip).
- **Q9-3:** the K.8 profile guard 84 000 → 84 150 for the base seam (~110–170 B).
- **Q9-2/Q9-4 (lead, recommendations kept):** measure at the end of the same frame; re-measure once when late fonts load.

## App feedback pass (owner, 2026-10-27) — `app-feedback.md`

- A small « retours d'usage » pass right after step 9 (auto height), before print: pagination arrows drawn by the theme (bug), « Condition » hidden for a single operator, silent cases turned into problems (header parts without `slots()`, unknown `ui` keys / a pass-through bag for parts), a shorter fr `filter.clear`, Angular guide notes ([slot] binding, CSS escapes).
- In the same pass: an inline period date form (FROM/TO fields + one month, no second panel; a tzslot `'inline'` FieldMode request prepared for the tzslot session if needed) and a `filter.set` option-row part (value, label, count given).
- Reading the app's DzGrid consumer files under /Users/nadou/Dev/allergie-detector/admin-web is allowed by the owner (per the app session). Clean room: never open the app's screens built on other grid libraries (products-list, products-list-v2).
- **Integration in a real app (owner, 2026-10-27):** after the feedback pass, the DzGrid session works directly in /Users/nadou/Dev/allergie-detector on its own branch (`dzgrid-integration`), touching only the DzGrid screen files (products-list-dz, shared/grid-dz/*, the DzGrid part of styles.scss, vendor/dzgrid, the dzgrid deps); re-vendors the tarballs, removes workarounds, verifies in the browser; never pushes or deploys without the owner. The app session commits its DzGrid work first and leaves those files during the integration.
- **Q9-6 (owner, 2026-10-27):** `@dzgrid/dom/pinned-rows` line 2 150 → 2 200 (compression only; inside Q2's 2 300).
- **Q9-5 (owner, 2026-10-27):** tree sticky parents taller than half the view: the outermost copies are dropped beyond half the view in pixels (+~40 B, `@dzgrid/dom/tree` 3 800 → 3 850).

## Feedback pass (owner, 2026-10-27) — plan `feedback-plan.md`

- **Q1:** compress first; if needed `dom/filters` 10 000 → 10 250 and the lazy kits by the strict need.
- **Q2 (owner's words: « pourquoi inline — un popup juste qui s'ouvre en dessous de l'en-tête »):** the column filter popup itself (under the header) holds the FROM/TO fields and tzslot's inline one-month calendar (`createDateRange`), composed by DzGrid, no nested panel. This is the lasting design, not a stopgap; no tzslot request needed.
- **Q5:** `data-column` / `data-kind` attributes on the popup content, plus docs (global CSS).
- **Q3/Q4/Q6 (lead, recommendations kept):** warn unknown keys in `ui` only, plus the `ui.data` pass-through bag; `--dzg-row-height` documented as read-only (use `rowHeight`); `[slot]` binding as an Angular doc note.
- **tzslot upgrade (owner):** in this pass, move DzGrid to tzslot 2.4.x latest (pinned exact, the owner's own package); adopt `@tzslot/dom/lazy` (T3, ~25 kB less), and remove each DzGrid workaround tzslot now fixes (T2 nonce, T6 showZone, T8 Escape, T11 neighbouring months, others found), each proven by its test.
- Item 1 finding: the pager chevrons exist but are layered CSS borders that an unlayered reset (Tailwind 3 preflight) wipes: draw real glyphs in the DOM (aria-hidden, mirrored in RTL); audit the tree toggle the same way; and document that apps with an unlayered reset should use `dzgrid.unlayered.css` (T1).
- **Integration start point (2026-10-27):** allergie-detector branch `dzgrid-screen`, commit `72a99a0` (on main `c54b019`, a backend-only sort tiebreak fix, not deployed). Includes theme.service.ts setting `data-theme` on the root. SAFETY: the app's dev server (port 4200) proxies to the PRODUCTION API — during integration checks, never trigger writes (no create/edit/delete, no row actions, no saves); read-only browsing and filtering only.
- **Integration report (owner, 2026-10-27):** after the allergen-detector integration, write a before/after report (docs/integration/allergen-detector-report.md): lines of app workaround before vs after, what disappeared, what still hurts, time spent, sizes; shared with the owner.
- **Owner's-look budgets (owner, 2026-10-27):** `@dzgrid/dom/filters` 10 000 → 10 100; set chunk 4 205 → 4 250; date adapters 2 745 → 2 800; audit profile K.8 84 150 → 84 300. All owner's-look items kept (one box, buttons, apply:'button', viewport clamp, dateZone, header search box).
- **Feedback after a client filter (owner, 2026-10-27):** both — the filtered count + active icon, and a brief spinner (`filters({ busyFlash })`).
- **Comfort stylesheet (owner, 2026-10-27):** thin scrollbars and the default loading spinner go in a separate optional stylesheet `@dzgrid/theme/dzgrid.comfort.css` (own size line), imported by apps that want them; the base theme keeps only the pinned-edge line, the field focus ring and the search magnifier. Raises: theme 2 750 → 2 850, K.8 audit profile 84 300 → 84 450, date adapters 2 800 → 2 850. Thin scrollbars are on when the comfort sheet is imported (`--dzg-scrollbar: auto` restores system bars). Its line: 650 (measured 551 + 10 %); K.8 loads `dzgrid.css` only.
- **First npm release (owner, 2026-10-28):** publish as **1.0.0** (@dzgrid/core, dom, theme, angular), so allergen-detector uses the registry instead of tarballs. The owner publishes (has an npm account; published tzslot). Agents prepare only: no publish, no login, no remote tag. Consequence accepted: from 1.0.0, breaking API changes need a major version; later phases add features in minors.
- **Back to Phase 6 (owner, 2026-10-28):** files handed back to the allergen session; remaining steps print (11) → Angular and demos (12) → close (13). Since 1.0.0 is published, the close prepares **1.1.0** (not 0.4.0), published by the owner with `npm run publish:latest`. The close adds the light « real app » page (Tailwind preflight, brand tokens, row checkboxes, popups; screenshots compared) run only at phase closes (owner agreed with the light version, cost concern).
- **Step 12 Angular (owner, 2026-10-28):** Q12-1 K.8 84 450 → 84 800, Angular 7 000 → 7 300 (Phase 6 grant). Q12-2 **yes, a template per menu item** (against the recommendation): a content part for column-menu items in `@dzgrid/dom/column-menu` (text stays the accessible name; the part renders inside the menuitem, no focusable controls; an Angular template slot for it); bytes in the column-menu entry and Angular, measured, and stated. Q12-3 URL state on a second on-demand screen `?screen=audit-url` in the real Angular example; the default screen pays nothing.
- **Real Angular example line (owner, 2026-10-28):** 94 500 → 95 000 (measured 94 596; the example build had been broken since 1.0.0, so earlier growth went unmeasured — a gate must catch a broken example build).
- **clearFilters / resetState (owner, 2026-10-28, in 1.1.0):** `DzgController.clearFilters()` (every column filter and the quick search, sort kept, one request) and `resetState()` (back to the grid as defined at creation, before any restore; needs `gridState()`; `GridStateApi.reset()`), asked from the owner's NgRx screen. Budgets raised by the owner (measured over by 24 / 16 / 47 B): `@dzgrid/dom/state` 1 150 → 1 200 (1 174), `@dzgrid/angular` 7 300 → 7 350 (7 316), K.8 audit profile 84 800 → 84 900 (84 847).
- **Set filter include only (owner, 2026-10-29, in 1.1.0):** `ColumnDef.filter: { kind: 'set', exclude: false }` — a set filter on that column only ever writes no filter (null) or `{ type: 'set', include: [...] }`, never `exclude`, never `blanks` (docs/behaviors/filter-set.md « Include only »). (1) Everything ticked on a complete list = no filter (null). (2) The blanks row is hidden on such a column. (3) A set filter with `exclude` or `blanks` arriving from elsewhere on such a column is ignored with a Problem (`invalid-filter`, stored and ignored like a wrong-type filter, not a refused command). (4) Ships in 1.1.0. Budgets (owner, 2026-10-29, accepted; measured over by compression noise and the refusal in compile and wire): `@dzgrid/dom/filters: set (lazy)` 4 250 → 4 350 (4 339), the core base guard (`layering.test.ts` `BASE`) 29 001 → 29 070 (29 064; `check:size`'s `@dzgrid/core` stays 29 150), K.8 audit profile 84 900 → 84 950 (84 902), `@dzgrid/core/edit` 3 150 → 3 160 (3 155), `@dzgrid/core/state` 1 500 → 1 510 (1 506).

## 1.1.0 scope widened (owner, 2026-10-29)

« Je peux attendre la 1.1.0, donc faisons tout dans cette version » : the two structural items (merged cells inside
a tree, a gap between two big categories) join 1.1.0 with the set filter include-only option and the three small
options (fill in one direction, flash duration, tree without its chevron). 1.1.0 is published once all six are done.
Plans: `step14-plan.md` (the three small options), `step15-plan.md` (the two structural items).

## Steps 14 and 15 — owner answers (2026-10-29)

Step 14 (`step14-plan.md`):
- Fill: `fill(blocks, { along: 'row' | 'column' })` — horizontal only / vertical only; none = both, as today (the
  owner's « x ou y »; logical names for right to left). Q14-1: the « fill down » menu entry is removed by the host
  (doc recipe).
- Flash: `effects.flash: { hold, fade }` ms; the saved flash uses the same durations (Q14-6 A); reduced motion: a still
  mark for hold + fade (Q14-5 A).
- Tree: **not** a grid-wide `chevron: false`. `tree({ fixedOpen: (row) => boolean })`: a function; rows it answers
  true for are always open, draw no chevron and no 24 px slot, and no key, collapse-all or saved state closes them;
  other parents keep their chevron. Styling those rows (font, colour) uses what exists: `rowClass` (a class from a
  function on the row) and CSS, or a cell part for the label. `data-dzg-toggle` (Q14-3) not needed now.
- Sizes (Q14-7): accepted — K.8 → 85 000, `theme/edit.css` → 2 250, `dom/tree` see step 15.

Step 14 built (2026-10-29), final sizes (gz, measured on minified code): `dom/tree` 3 863 / **3 950** (raised from
3 850; 87 B left for step 15), `theme/edit.css` 2 236 / **2 250** (raised from 2 200: the field of a row always open
starts at the indent), K.8 84 901 / 84 950 (**not raised**: the audit screen does not load fill, motion or tree; 85 000
not needed). Within their lines, no raise: `dom/fill` 3 143 / 3 150 (the axis rule moved into the core's
`fillTarget(src, to, along)`, `core/range` 2 904 / 3 200), `motion-gsap` 648 / 700 and its chunk 3 479 / 3 500 (the bad
field's problem built in the eager part, the chunk checks), `core/tree` 3 490 / 3 500 (golfed: one loop for the open
flags), `@dzgrid/core` 29 064 unchanged. Lead decisions: the `fixedOpen` gate is in the core (`opens` false, `parents`
leaves them out, the build opens them) so the kernel refuses a close from any side; the DOM reads `opens` rather than
calling the function again; `chevron: false` and `data-dzg-toggle` dropped.

Step 15 (`step15-plan.md`): all recommendations A. Spans (row and column) only between siblings under the same
parent; a column span touching the tree column is refused (`invalid-span`, drawn unmerged). `rowGaps({ before })`,
16 px scaling with the text, never above the first row, not exported, not printed. Sizes accepted: `core/row-gaps`
450, `dom/row-gaps` 900, `dom/tree` → 3 950 (both steps), `core/spans` only if the measure needs it.

Step 15 built (2026-10-29), final sizes (gz, measured on minified code): `@dzgrid/core/row-gaps` 409 / **450** (new line),
`@dzgrid/dom/row-gaps` 575 / **900** (new line), `@dzgrid/core/spans` 3 914 / **3 950** (raised from 3 800 because the
measure needed it: the measure plus 36 B; golfed first — the memo key as one list), `dom/tree` 3 829 / 3 950 (down from
3 863: the refusal and its `beforeRows` went), `dom/spans` 4 733 / 5 050, DOM base 22 347 / 22 400 (the `rowLayout()`
seam, +13 B), K.8 84 912 / 84 950, `core/tree` 3 485 / 3 500, `@dzgrid/core` 29 064 unchanged, Angular 7 316 unchanged.
Perf: « tree open + span map rebuilt, one merge column in the tree column (100 000 rows) » 20.5 ms (median 18.4 of three).
Lead decisions (inside the owner's answers):
- `SpanInput.apart(row)` means « this row never continues a span from the row above » (a span may still start on it);
  the plan's two-sided reading would forbid a merge starting right after a gap. The tree column's rule is the core's
  (`SpanInput.treeColumn`): there a parent's slot and the slot under it never continue a span (a lazy parent counts).
- The full-width refusal beside a tree is told by the spans feature (once), not by `treeConflicts` (`core/tree` had 10 B
  left); `treeConflicts` no longer takes `spans` nor `fullWidth`; the conformance case `tree/conflicts.json` rewritten.
- The pinned parents' height reaches the travelling label as a CSS variable (`--dzg-inset` on the grid's root, written by
  the tree when it changes), so the order of `tree()` and `spans()` in `features` does not matter.
- A merged leaf cell in the tree column hides its (invisible) toggle (`display: none`): the label is centred anyway.
- A gap's size, from `size` or from a number the rule answers, is scaled with the text the same way.
- The export's span map beside a tree follows the tree's rules too (no full-width row, the tree column's).
- Known, for the owner's look: a pinned parent's copy is pushed by the box of the next table's first row, so it hangs
  over the gap until that row arrives (screenshot `chrome-row-gaps-fr-pinned.png`).

## Phase 7 parked; the forecast's needs first (owner, 2026-10-29)

« Je ne veux pas la phase 7 pour l'instant, je veux que tu fixes tout ce que tu as énoncé » : Phase 7 (grouping) is
parked (`docs/phase-7-plan.md` kept, untracked). Next: everything `docs/owner-needs-forecast.md` names — the gaps
found in the owner's log-table rewrite, the small missing options (one sort only, a set list opening with nothing
ticked and without select all, details on some rows only, a warning when `rules()` is missing), and the ten
foreseen needs. Plan: `step16-plan.md`; structural points go to the owner before code. Still before publishing 1.1.0.

## Step 16 — owner answers (2026-10-29)

- Q16-8: **yes** — the owner's tree screen's category (parent) rows are real rows with an id, added from a configuration table.
  They hold no value for the time-slot columns: shown empty, they read as a big title across the table (the owner's
  look; `rowClass` + CSS for the weight). Open rows are saved by id (16f).
- Q16-14: **no totals computed in the browser** — every value comes from the server; ag-Grid only computes CSS classes
  from the data. 16k (tree totals) is dropped. Conditional styles: the existing cell class rules (`cell-class.md`)
  and `rowClass`; values changed by the server flash with `sameRow` (16e).
- Q16-11: `autoApply` **sends a request to the server and does nothing to the grid** (a header button calling the app's
  service). No batch apply is needed: 16j (batch apply) is dropped, and with it 16i (a live value on an unapplied
  batch edit) and Q16-12 / Q16-13. An edit while a live value lands keeps today's behaviour (`edit/stale.ts`).
- Q16-15 (sizes): « ok pour les hausses, pourquoi tu te casses la tête sur la taille » (owner, 2026-10-29). Lines set
  to the measure plus a small margin, after 16a–16f (measured 2026-10-29, `node scripts/size.mjs`):
  | Line | Was | Measured | Now |
  |---|---|---|---|
  | K.8 audit profile | 84 950 | 85 133 | **90 000** (ARCHITECTURE K.8: ≤ 90 kB gz, was 85) |
  | `@dzgrid/dom/filters: set (lazy)` | 4 350 | 4 467 | 4 500 |
  | `@dzgrid/core/detail` | 1 050 | 1 132 | 1 150 |
  | `@dzgrid/angular` | 7 350 | 7 438 | 7 450 |
  | core base guard (`layering.test.ts` `BASE`) | 29 070 | 29 106 | 29 150 (`@dzgrid/core` stays 29 150) |
  | `@dzgrid/core/compare` (new) | — | 273 | 300 |
  No other entry was over its line. Pinned in `size-budget.json`, `scripts/rebudget.mjs`, `scripts/test/rebudget.test.ts`,
  `layering.test.ts`, `print-size.test.ts`, `motion-seam.test.ts`, `spans-collapse.test.ts`, `owner-look-3.test.ts`,
  `perf/test/step12-budgets.test.ts`.
- Q16-2: answered by the owner's earlier Q1 (« tout coché == pas de filtre du tout », « Set filter include only »): on a list that starts empty, every value of a complete list ticked is no filter (`ALL_TICKED_IS_INCLUDE = false`).
- +2 % rule used (2026-10-29): `@dzgrid/dom/state` 1 200 → 1 224 (measured 1 211; `gridState({ initial })`, the plain-DOM initial state of the owner's demo).
- Q16-1, Q16-3 … Q16-7 (not answered): built as answer A each (`step16-plan.md`), one place to change each.

- Q16-9: **A** (owner, 2026-10-29) — new rows after a refresh tinted with a bar at the inline start for 5 s, one sentence
  « 3 nouvelles lignes » (en/fr/ar), a still mark under reduced motion. Built as step 16h (`freshRows()`, fresh-rows.md).
  New lines (the plan's, « nouvelles lignes 700 », granted with Q16-15): `@dzgrid/dom/fresh-rows` 700 (measured 544),
  `en / fr / ar-fresh` 150 / 150 / 200 (115 / 132 / 197); a new line not in the plan: `@dzgrid/theme/fresh-rows.css`
  350 (308, its measure + 10 %, the look kept out of the base theme so a grid without the feature pays 0 B). No raise
  of any existing line; `clinic.css` 483 / 550, `bootstrap.css` 310 / 350 grew by their fresh colour, within their lines.
  The plan's event `rowsArrived { keys }` is a callback option instead (`freshRows({ rowsArrived })`): a new member of
  the 1.0.0 `GridEvent` union is refused by `check:api`; making it an event is the owner's call.

## Size budgets: automatic small raises (owner, 2026-10-29)

« Oui » to: a line may be raised without asking up to **+2 %** of its value, to the measure plus a small margin,
recorded in decisions.md with the numbers; above 2 %, or K.8 past its 90 kB line, the owner decides.

## After 1.1.0: every remaining phase wanted (owner, 2026-10-30)

« Je veux toutes ces fonctionnalités » : Phases 7 (grouping), 8 (infinite scroll, server-side model), 9 (Excel,
menus, status bar, advanced filter, row drag), 10 (pivot), 11 (hardening) and the docs website, in the order of
ARCHITECTURE.md. Phase 7 is no longer parked; its plan `docs/phase-7-plan.md` waits for the owner's answers (§5).
Work resumes the week of 2026-11-02 (the owner's weekly budget), starting with those answers. Spend little:
see CLAUDE.md working rules.

## The owner's tree screen: one case left for DzGrid (owner, 2026-10-30)

Seen on the local demo. Works today: nodes as « Rubriques » with their chevron in the Rubrique column
(`tree({ column: 'group', indent: 0 })`), nodes under nodes, merged blocks of lines under a node. **Missing**: a line
inside a merged block (« TITI », lines 5–8) that is itself a node — its chevron in the label column, its children
also in the « TITI » block. Needs (1) the tree column chosen per row (`tree({ column: (row) => id })`) and (2) a merge
in the Rubrique column that continues across a parent line and its children (today: siblings only, D9 lifted in
step 15). Structural: plan and owner questions first; first item for the week of 2026-11-02.
