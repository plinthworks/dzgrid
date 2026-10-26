# Phase 6, step 1 — behaviour sheets, listening §21, docs (plan)

Sources: `docs/phase-6-plan.md` (D1–D14), `decisions.md` (Q-M1…Q-B; they win, in particular **Q-P = C**,
pinned rows editable, and the owner's order: column menu and chooser first, Sehhaty's need); WAI-ARIA 1.2
(grid, menu / menuitemradio, dialog, listbox with `aria-checked`, toolbar), APG (menu button, menu,
rearrangeable listbox, modal dialog, toolbar, grid), WCAG 2.2 (2.1.1, 2.4.3, 2.4.11, 2.5.7, 2.5.8, 1.4.4,
1.4.10, 1.4.11, 1.4.12, 4.1.2, 4.1.3), CSS Paged Media. Clean room: our words, behaviour from public
documentation only. **No code, no tests, no budgets, no config this step.**

## Sheets to write (`docs/behaviors/`)

| Sheet | Must settle |
|---|---|
| `column-move.md` (new) | pointer drag (4 px, mouse and pen, never touch: Q-M3), ghost and insertion bar (≥ 2 px, 3:1), auto-scroll, Escape, segments and pinning by drop, `movable: false` exact rule, split groups, one patch per drop, swallowed click; Ctrl+Shift+arrows / Home / End on a header (Q-K2), RTL mirroring, segment edges, sentence « colonne n sur N »; the drop-target hook (Q-G) |
| `column-menu.md` (new) | the ⋮ button (place, size, when shown, not a tab stop), the opening ways (Q-M2, Q-K1: Shift+F10 / Menu key, Alt+Down only without the filter popup), placement and top layer, item list and order (Q-M1), radio groups, disabled vs absent, host items, APG keys, focus after an item, sentences, density line (Q-R2) |
| `columns-chooser.md` (new; the plan said `column-chooser.md`) | modal dialog (Q-C1), changes at once (Q-C2), no Filtres tab (Q-C3), the list's ARIA, groups, search folding, ticks and disabled ones, show all / reset, reordering by handles and Alt+Up/Down (Q-H), segments, live sync, focus in and back |
| `grid-state.md` (new) | the v1 shape per Q-S1 (columns, groups, sort, filter, quick, page, pageSize, density; not expanded / selection / scroll), capture determinism, `stateChanged` debounced, restore order, problems (`state-version`, `state-column`, `state-field`), RTL identity, server request count, helpers per Q-S2 (`persistLocal`, URL params), privacy of typed filters in an address |
| `column-resize.md` (update) | the keyboard mode (Alt+R or the menu; not F2), ±10 / ±1 px mirrored in RTL, Home = fit, Enter / Escape / Tab, events, sentences; auto-size: double-click, menu, API, the deterministic sample in one read phase |
| `header-groups.md` (new; the plan said an amendment to `spans.md`) | `collapsible`, `open`, `groupShow`; own collapse state apart from `hidden` (Q-GH); nested and split groups; the button and keys; focus fallback; sentences; state |
| `pinned-rows.md` (new) | top and bottom (Q-P = C), key space, never sorted / filtered / paged, ARIA counts and indexes, keyboard across the bands, **editing through the edit layer** (`context.pinned`, save payload, never stale, undo), blocks / paste / fill limits, print and CSV |
| `auto-height.md` (new) | `wrap: true` (Q-R1), `rowHeight` wins, one read phase, anchor (S3), warning > 10 000, re-measure triggers, details / tree / pinned rows |
| `print.md` (new) | `preparePrint` / `print` (Q-I), rows and columns printed, table semantics, cap and line, chunks, RTL, server page |
| `density.md` (new) | `setDensity`, event, the menu line (Q-R2), `rowHeight` wins, state |
| `group-drop-zone.md` (new; the plan said `group-zone.md`) | Phase 6 drop protocol (Q-G); the Phase 7 zone's behaviour and texts written now |

Each sheet: numbered testable statements, a keyboard table with the RTL column where arrows matter, the
announcements, the fr / en / ar texts (Arabic in raw characters, for the Arabic reader), WCAG notes, the
choices not settled by `decisions.md`, the tests to write later.

Also: `docs/a11y-protocol.md` §21 (items 143–), `phase-6-plan.md` aligned on `decisions.md` (« Owner
decisions applied », the new step order, editable pinned rows), `docs/STATUS.md`, ROADMAP « Phase 6 ».
Left to their steps: a pointer from `spans.md` to `header-groups.md`, from `virtual-scroll.md` to `density.md`
and `auto-height.md`, the edit sheets' rule 1 « data row » widened to pinned rows (`editing.md` 1), ARCHITECTURE
index of Phase 6.

## Architect's picks (lightest that works; the owner may override)
1. **Pinned rows are body-like rows, not header rows.** Q-P = C makes them editable; the edit layer works on
   `{kind: 'cell'}` focus and data rows. The plan's D13 (top rows through the `headerRows` seam, focus
   `{kind:'header'}`) cannot carry editing without teaching the edit layer header focus. The sheet states the
   behaviour only; step 9's architect picks the seam (likely: two sticky row bands the router and the edit
   layer see as rows with a pinned flag). Cost re-measured there (Q-B).
2. **The menu ships before resize and auto-size** (owner order): the menu's « Ajuster » and « Redimensionner »
   items are absent until `columns()` provides them (step 7); no placeholder, no disabled item.
3. **One `-columns` bundle** for move, menu, chooser, size, groups, density and the pinned rows' two names;
   `-print` apart. Arabic kept short (the `ar-range` lesson): label + number forms (« الأعمدة المضبوطة: 9 »),
   no Arabic plural agreement.
4. **Mac modifiers**: Cmd for Ctrl, as every other grid key (macOS takes Ctrl+arrows).

## Contradictions found (to the owner)
- C1. Plan D13 (top pinned rows through `headerRows`, « not editable ») vs Q-P = C: resolved in favour of the
  decision (pick 1); the plan is amended.
- C2. Plan step order (« 4–5 before 6: the menu calls them ») vs the owner's order (menu at step 3, resize /
  auto-size at step 7): resolved by pick 2.
- C3. Q-K1 « with no filters, Alt+Down opens the menu »: per grid or per column? The sheet reads it per column
  (a column without a filter popup), `column-menu.md` choice 2.
- C4. Q-S1's question text said expanded rows, selection and scroll « l'application peut les demander »;
  `decisions.md` only says « not saved ». The sheet offers none (`grid-state.md` choice 4).
- C5. Q-M1 (A) did not include density; Q-R2 (A) adds an optional density line to the menu: read as « off by
  default, `columnMenu({ density: true })` ».
- C6. `editing.md` 1 says a cell is editable only on a **data row**; pinned rows are not data rows of the
  displayed set. Widened by `pinned-rows.md` 11; `editing.md` gets the pointer at step 9.
- C7. Sheet names: the plan's `column-chooser.md` and `group-zone.md` are `columns-chooser.md` and
  `group-drop-zone.md` (the lead's names); collapsible groups have their own sheet rather than a `spans.md`
  amendment.

## Open points — decided (`decisions.md` « Step 1 follow-ups », 2026-10-26)
**By the owner:** O1 the last shown column can never be hidden; no « Tout masquer » (also enforced on
restore, `grid-state.md` 12). O5 a finger may drag a chooser row by its handle. **O6 the address helper leaves
typed filters and the search OUT by default; the application opts in with `include: ['filter', 'quick']`**
(`grid-state.md` 19). Mac: column moves by Cmd+Shift+arrows on macOS, Ctrl+Shift elsewhere.
**By the lead (as written in the sheets):** O2 keyboard and chooser moves never cross a pinned edge; O3
`movable: false` keeps its place and disables the pin items; O4 group headers do not move this phase; O7 one
opaque `grid=1.…` parameter; O8 pinned rows: blocks, paste and fill inside one band, Ctrl+Home / End on body
rows, bands at most half the view; O9 print leaves out detail panels and writes merged cells on every row;
O10 Tab or a click keeps the width in the resize mode; O11 Shift+right-click keeps the browser's menu; O12
Escape in a non-empty chooser search empties it first; C3 « no filters » is per column; C5 the density line
off by default; C6 `editing.md` rule 1 widened at step 9.
**Still open:** C4 (expanded rows, selection, scroll never offered in the state) and each sheet's remaining
« Choices to confirm ».

## Review fixes (2026-10-26, after the reviewer)
WCAG 2.5.7 single-pointer ways added (resize: the mode's « − / + / ✓ » buttons and the menu's « Élargir /
Rétrécir » that keep it open; chooser: ▲ / ▼ per row); the chooser became a list of native checkboxes (named
handle, no `aria-multiselectable`, own `chooser.placed` counting hidden columns); `aria-keyshortcuts` built in
one place (the filter no longer writes it alone); the header decorations' order (⋮ before the reapply mark,
last) and a 96 px minimum width under which ⋮ is not drawn; Mac ways to the menu (Ctrl+click, VO+Shift+M,
Fn+Shift+F10) and Mac keys in the tables; `GridState`: at most one request per restore (step 5 measures),
`persistLocal` before the first fetch, version upgrades, unknown group ids, never all columns hidden; print:
`scope="colgroup"`, top pinned rows once in `tbody`, caption from the grid's name; §21 items 149, 153, 154,
162 aligned, Tab trap and VoiceOver checks added (165–166).

## Done (2026-10-26)
Sheets written: `column-move.md`, `column-menu.md`, `columns-chooser.md`, `grid-state.md`,
`column-resize.md` (updated), `header-groups.md`, `pinned-rows.md`, `auto-height.md`, `print.md`,
`density.md`, `group-drop-zone.md`; a11y §21 (items 143–166); `phase-6-plan.md` aligned; STATUS and ROADMAP.
Not committed. Next: step 2, moving columns (`@dzgrid/dom/columns` part 1 and the drop protocol); O1–O12,
C3, C5, C6 decided (above), C4 still open (not blocking step 2).
