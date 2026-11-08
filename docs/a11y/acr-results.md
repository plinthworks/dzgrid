# Automated accessibility results (Phase 11 L4a) — for the ACR (L4b)

Run on 2026-11-08 by `node scripts/browser-a11y.mjs` (Chrome 157.0.8103.38 with axe-core 4.14.0; `--engine firefox`,
Firefox 157.0; `--engine webkit`, WebKit 27.2; Playwright, headless). Pages: flat grid, tree, grouping, pivot with its
bar, dock, filters panel, row moves, list loaded in blocks — Chrome in French and Arabic, light and dark; Firefox and
WebKit in French light and Arabic dark. Pinned rows: `scripts/browser-pinned-rows.mjs`. Decisions and fixes:
`docs/phase-11-steps/decisions.md` « L4a ». Nothing here rests on a screen reader: those lines wait for L4c's listening.

| Criterion | What is measured | Chrome | Firefox | WebKit | For the ACR |
|---|---|---|---|---|---|
| axe (A, AA rules) | 0 violations on each page at load | 32 / 32 | — | — | Supports (automated part) |
| 1.4.3, 1.4.11 contrast | `check:contrast` (script, not this run) | — | — | — | Supports (themes' pairs) |
| 1.4.10 Reflow | 320 × 256 CSS px: no sideways page scroll, every control outside a scroller in view | 32 / 32 | 16 / 16 | 16 / 16 | Supports, the rows scroll in two directions inside the grid (a data table's exception) |
| 1.4.12 Text spacing | the four spacings injected: no text newly cut | 32 / 32 | 16 / 16 | 16 / 16 | Supports; narrow headers, dock tabs and titles end in « … », full text in the name, widened by the user |
| 2.4.11 Focus not obscured | keys and Tab walks, 1 200 px and 320 px | 32 / 32 (1 200 and 320 px) | 16 / 16 | 16 / 16 | Supports; pinned columns too wide for the view scroll with the rest (`pinned-columns.md`) |
| 2.5.8 Target size | every control and grip ≥ 24 × 24 or spaced | 32 / 32 | 16 / 16 | 16 / 16 | Supports (boxes and the pivot bar's × by spacing) |
| 4.1.3 Status messages | live regions in the tree from the first paint, none added with its text, a sort said | 32 / 32 | 16 / 16 | 16 / 16 | Supports (automated part; heard: L4c) |
| Forced colours | focused cell's outline; a selected row differs | 32 / 32 (selection on 5 pages with rows to select) | not emulated | not emulated | Supports in Windows' contrast themes (Chrome / Edge); others not tested |
| 2.3.3 / reduced motion | no transition or animation over 50 ms under `prefers-reduced-motion: reduce` | 32 / 32 | 16 / 16 | 16 / 16 | Supports |

Fixed during the run (each a test that failed first): the focus below the window at 400 % zoom; a dock area covering
the focused row on a narrow screen; a selected row invisible in forced colours without a box column; the columns
panel's empty status out of the accessibility tree; WebKit's « ResizeObserver loop » on the dock's pages; pinned
columns wider than the view at 320 px (released while too wide, owner A).
