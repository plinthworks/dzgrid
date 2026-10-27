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
