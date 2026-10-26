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
