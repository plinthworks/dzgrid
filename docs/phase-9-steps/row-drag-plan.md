# Row drag plan (Phase 9, with a keyboard alternative)

Sources: ARCHITECTURE §6 Phase 9 (« glisser-déposer de lignes avec alternative clavier »), §2's WCAG notes (l. 1394:
alternatives to every drag, no `Ctrl+Alt+arrows`, VoiceOver's), `decisions.md` « Next in Phase 9 » (owner,
2026-11-03: row dragging after the Excel export); `docs/behaviors/{column-move,columns-chooser,group-drop-zone,
range-selection,fill,tree-view,tree-keys,tree-lazy,row-grouping,pinned-rows,row-numbers,selection,edit-undo,
row-identity-transactions,infinite-scroll,server-side-groups,server-pagination,context-menu,motion}.md`;
`packages/dom/src/columns/index.ts` (the column drag), `columns-panel/index.ts` (the chooser's handle),
`range/{geom,pointer}.ts`, `row-numbers/index.ts`, `tree/index.ts`, `context-menu/index.ts`, `features.ts`,
`context.ts`; `packages/core/src/{kernel.ts,row/store.ts,row/node.ts,model/client.ts,selection/rows.ts,
keys/intent.ts,tree/shape.ts}`; `npm run check:size` run on 2026-11-05. What other grids show (a handle, a line
between rows, a row dropped onto another in a tree, several rows at once) is named from their public pages, nothing
read (CLEANROOM.md). Plan only; nothing coded. Sheet → tests first (red) → code → review → gate.

## 0. What the code already holds

- **The column drag is the pattern to copy** (`packages/dom/src/columns/index.ts`, `column-move.md`): pointer events,
  not HTML5 drag-and-drop; a press arms a drag that starts past **4 px** (`travel`), the **mouse only** (Q-M3, a pen
  clicks); `setPointerCapture`; one `aria-hidden` layer `.dzg-move` holding a ghost and a bar, placed with
  `inset-inline-*` from `logicalX` / `logicalSpan` (`dir.ts`), so one code for both directions; `compute()` in a
  `requestAnimationFrame` `tick` that auto-scrolls within 32 px of an edge (speed by depth, ≤ 24 px a frame);
  Escape (captured on the document) cancels with `move.cancelled`; `pointercancel`, lost capture, window blur, new
  columns, a direction change, `destroy` cancel quietly; the click after a drag is swallowed once; `g.editor` open →
  no drag; one `column.state` dispatch on release, then **one** polite sentence `move.placed` (« colonne 3 sur 9 »);
  keys repeated fast said once after 300 ms; `data-dzg-dragging` on the root, `data-dzg-moving` on the source;
  `dropTargets.add(el, { accept, drop, label })` for elements outside the grid (the group zone).
- **The chooser's handle** (`columns-panel/index.ts:297`, `columns-chooser.md` 6–7, 17–18, O5): a named `<button>`
  handle taking mouse, pen **and finger** (`touch-action: none` on the handle only), ▲ / ▼ as the single-pointer
  way (WCAG 2.5.7), **Alt+↑ / ↓** as the keyboard way, `chooser.placed` said.
- **Body geometry without `elementFromPoint`**: `range/geom.ts` `cellAt(g, p, dy, k)` finds the row from the row
  layout (scaled scrolling, the top pinned band, the lead strip and box column counted) and `autoScroll(g, p, k)` moves
  the view near the body's edges (`range/pointer.ts:76`); the fill reuses both (`fill` is measured over `range`).
- **Rows have no order of their own in the core.** `RowTransaction` (`row/store.ts:5`) has `add`, `addAt`, `update`,
  `patch`, `remove`: no move. But `setRows` with **the same objects in a new order** (`store.replaceAll`,
  `row/store.ts:238–277`) publishes a `structural` change with **no** added, updated or removed key: identity, the
  edit overlay, the selection and the expansion (all keyed by `RowKey`) survive. A managed mode needs no core change.
- **The displayed order is not the source order** when a sort, a filter, a quick search, a tree, a grouping or pages
  are on (`model/client.ts`). The tree is built from `parentId`, `children` or `path` (`tree/shape.ts:10–16`); a
  grouping places rows by column values (`RowShape.reads()`).
- **Node kinds** (`row/node.ts`): `data`, `group`, `footer`, `detail`, `loading` (two). Pinned rows live in their own
  key space (`p:t:` / `p:b:`, `pinned-rows.md` 1).
- **Selection** is `{ mode: 'include' | 'exclude', keys }` (`selection/rows.ts:10`): an `exclude` selection (« all
  but ») on a server source does not list its rows.
- **Keys taken around a body cell**: Ctrl+Shift+arrows = the block's edge (`range-selection.md` l. 51), Shift+arrows
  the block, Alt+↓ a header's filter / menu (`column-menu.md` 46), Alt+↓ inside a date field its calendar
  (`editors.md` 38), Alt+↑/↓ the chooser's reorder (outside the grid), Ctrl/Cmd+Z / Y undo (`edit-undo.md`).
  `intentFor` gives nothing for any Alt chord (`keys/intent.ts:57`), so **Alt+Shift+arrows on a body cell are free**.
- **Features paint into mounted rows in `afterRows`** (`tree/index.ts:335`, `row-numbers/index.ts:150`): no
  `decorateCell` seam is needed for a handle. `FeatureHandle.keys` takes keys before `intentFor` (`features.ts:90`).
- **The cell menu takes the application's items** (`context-menu/index.ts:88`, `items(c, defaults)`): a feature can
  hand out entries with its own texts, the menu and its locales unchanged.
- **Events are emitted from a feature** with `emit(kernel, …)` (`@dzgrid/core/internal`, as `columnResized`); a new
  `GridEvent` member is a type only (0 B in the core), reported « changed » by `check:api` (accepted once in Phase 7).
- **Undo** holds cell gestures only, 100 per grid (`edit-undo.md` 1); nothing else.
- **Budgets with no room** (measured 2026-11-05): core 29 258 / 29 300, dom 23 650 / 23 660, theme 2 918 / 2 960,
  `dom/edit` 4 150 / 4 150, `context-menu` 2 560 / 2 560, `fr-context-menu` 413 / 420, Angular 7 883 / 7 900,
  **K.8 89 976 / 90 000**. → Everything in this plan lives in new entries; the base and the audit profile do not move.

## 1. Behaviour (sheet `docs/behaviors/row-move.md`, written first)

**What the user does.** Presses the grip at the start of a row and drags it up or down; or, on a focused cell,
presses Alt+Shift+↑ / ↓ (Option+Shift on a Mac); or right-clicks → « Monter », « Descendre », « Déplacer en haut »,
« Déplacer en bas » (and, in a tree, « Rentrer » / « Ressortir »).
**What they observe.** A light copy of the row (or « 3 lignes ») follows the pointer, a line between two rows shows
where it lands (in a tree, a row outlined: it goes inside); near the top or bottom edge the rows scroll; on release
the row is in its new place, the focus on it, its place said. Escape puts everything back. In Arabic everything is
mirrored, the indent of the line too.

### 1.1 Decisions (lead recommendation; the owner's choices are §5)

| Subject | Recommendation |
|---|---|
| **Who reorders the data** (Q-RD1) | **The application, by default.** The grid emits one `rowMove` event and changes nothing; the app (an NgRx reducer, a server call) gives the rows back in the new order. A pure helper `moveRows(rows, move, getRowId)` (flat list and `parentId` trees) does it in one line. Opt-in `rowDrag({ apply: true })` (flat client rows only): the grid calls the helper and `setRows` itself — same objects, so nothing is « added » or « updated » (fact §0). |
| **What the event carries** | `{ type: 'rowMove', source: 'user' \| 'api', via: 'pointer' \| 'keys' \| 'menu' \| 'api', keys: RowKey[] (display order), rows: T[], target: { key: RowKey \| null, where: 'before' \| 'after' \| 'inside' }, parent: RowKey \| null (tree: the new parent), applied: boolean }`. `key: null` + `where: 'inside'`: the root level's end (a tree) or the end of the list. Never a `DisplayIndex` (valid one version only). |
| **What is pressed** (Q-RD2) | **A grip** (⠿, 24 × 24 px target, WCAG 2.5.8) painted at the start of the cell of one column the app names (`rowDrag({ column: 'name' })`, default the first visible column), `aria-hidden`, not a tab stop. The rest of the row keeps its meaning: a press selects a row, drags a block (`range()`), selects text. Option `handle: 'row'` (whole row, only when `range()` is absent, no text selection). The lead strip (row numbers) is **not** used: it is one lane owned by `rowNumbers()`, sharing it needs a base seam (bytes in the base). |
| **Pointer kinds** (Q-RD9) | Mouse and pen on the grip; **a finger too** (`touch-action: none` on the grip only, the chooser's O5), since the cell menu has no long-press (Q-CM1). A finger elsewhere scrolls. |
| **Several rows** (Q-RD3) | The grip of a **selected** row drags **every selected row** that is shown or held (display order kept, they land together, in that order); a grip of an unselected row drags that row alone and leaves the selection. An `exclude` selection (« all but ») drags the held selected rows only, or refuses past `maxRows` (default 1 000, sentence). Group, footer, detail, loading, filler and pinned rows never move. |
| **Where it lands** | Flat: the gap nearest the pointer (upper half of a row: before, lower half: after), the line drawn across the full width of the rows (start, centre and end segments), 2 px, `--dzg-move-bar` (the column bar's colour, contrast already checked). Tree (Q-RD4): upper quarter before, lower quarter after, the middle half **inside** (outlined row, `data-dzg-drop="inside"`); the line starts at the target level's indent (logical). A row is never dropped into itself or its descendants (offered nothing there). A closed parent hovered 800 ms opens (a lazy one starts loading; « Chargement… » rows are never targets). A detail panel moves with its master; no gap between a master and its panel. |
| **Sorted, filtered, grouped** (Q-RD5) | **Sort or grouping on: refused** — the grip is drawn disabled (`data-dzg-off`), the keys and items say « Tri actif : déplacement impossible » / « Regroupé : … »; the app may opt in (`whenSorted: 'allow'`): the event is then sent and the app decides (the managed mode never). **Filter or quick search on: allowed** — the target is a shown row, so « before row X » keeps one meaning in the full list; in managed mode the rows hidden between keep their place. |
| **Server sources** (Q-RD6) | `serverRows` pages, `infiniteRows`, `serverSideRows`: **event only** (`apply` refused, `invalid-setting`); moves among held rows; a page's edge is the keyboard's edge (« déjà en haut de la page »); auto-scroll stops on loading rows. The app saves, then `applyTransaction` / `refresh()`. |
| **Between two grids** (Q-RD7) | V1: `api(grid).dropTargets.add(el, { accept(keys), drop(keys) })` exactly as the columns' protocol (an app's trash zone, a list, another grid's root as a whole). The precise gap inside another grid: later. |
| **Auto-scroll** | `range/geom.ts` `autoScroll` reused (the body's edge bands, speed by depth, scaled scrolling, pinned bands kept out); sideways scroll never moves during a row drag. |
| **Keyboard** (Q-RD8, WCAG 2.1.1 / 2.5.7) | On a focused body cell: **Alt+Shift+↑ / ↓** one place among its siblings, **Alt+Shift+Home / End** first / last among its siblings (Mac: Option+Shift). Tree: **Alt+Shift+→** (logical end, ← in RTL) indents under the previous sibling (as its last child), **Alt+Shift+←** outdents after its parent. The focus stays on the moved row (same column), scrolled into view (2.4.11); sentence after a 300 ms pause, as the columns. Several selected rows: the focused one's selection moves. |
| **Menu** (single pointer, 2.5.7) | `rowDrag` hands out entries for `contextMenu({ items })`: Monter, Descendre, Déplacer en haut, Déplacer en bas (+ Rentrer / Ressortir in a tree), disabled at an edge or when refused. Texts from `row-drag` locales; the menu's own bundle unchanged. No « click the grip, then click the gap » mode in V1 (the menu covers 2.5.7). |
| **Undo** (Q-RD10) | **No grid undo for a move** in V1: in event mode the grid does not own the change; Ctrl+Z stays the cell edits' (a move between two edits must not be skipped silently — the sheet says Ctrl+Z never undoes a move). The keys' opposite move undoes it; the app keeps its own history if it wants one. Escape during a drag puts it back. |
| **Edit, block, focus** | A drag never starts while a field is open (as the columns). A block (`range()`) whose rows changed order follows its existing rule (« Sélection effacée : l'ordre a changé », S11-Q4). Row numbers repaint (display order). Pinned bands are neither sources nor targets. |
| **Motion** | The sort's place-reading animation is reused when the change is `rows` and motion is on; nothing under reduced motion. No sentence during the drag. |
| **Announcements** (polite, one per gesture) | `move.placed` « Ligne 4 sur 120 » (in a tree « Ligne 2 sur 5 sous {parent}, niveau 3 »), `move.many` « 3 lignes déplacées », `move.edge`, `move.locked` (a `canDrag` false), `move.sorted`, `move.grouped`, `move.refused` (`canDrop` false), `move.cancelled`. Never a cell value: the row is named by place (rows may be health records). |
| **ARIA** | No `aria-grabbed` / `aria-dropeffect` (deprecated in ARIA 1.1). `aria-keyshortcuts` written on the focused cell only (`Alt+Shift+ArrowUp Alt+Shift+ArrowDown`, in `afterRows`); the grip `aria-hidden`. |
| **App vetoes** | `canDrag(row) => boolean` (per row), `canDrop({ keys, target, parent }) => boolean` (called during the drag, at most once a frame; a throw counts as no and is reported once). |

## 2. API (default: nothing changes; `rowDrag()` absent = no grip, no key, no event)

```ts
// @dzgrid/dom/row-drag
rowDrag<T>({ column?, handle?: 'grip' | 'row', apply?: boolean, whenSorted?: 'refuse' | 'allow',
  canDrag?, canDrop?, maxRows?, drag?: boolean /* false: keys and menu only */ }): RowDragFeature<T>
feature.api(grid) → { move(keys, target, o?): MoveResult; up(key) / down(key) / indent(key) / outdent(key);
                      dropTargets: { add(el, t): () => void }; menuItems(c): MenuEntry[] }
// @dzgrid/core/row-drag (pure)
moveRows(rows, move, getRowId, o?: { parentId?: (row) => …, setParent?: (row, parent) => row }): T[]
dropPlace(…), nextPlace(…)        // the shared rules: legal targets, descendants, siblings, keyboard steps
// @dzgrid/core (types only, 0 B): GridEvent gains { type: 'rowMove', … }
// Angular: output (rowMove); DzgController.rowDrag()
```
`check:api`: additions, plus `GridEvent` « changed » (a member added: owner to accept, as in Phase 7).

## 3. Core vs DOM

- **`@dzgrid/core/row-drag`** (new sub-entry, pure, lib ES2023): the legal-target rule (kinds, pinned, descendants,
  `canDrop`), the keyboard step among siblings (flat, tree, edges, indent / outdent), the managed reorder
  `moveRows` (flat; `parentId` trees through two callbacks; `children` and `path` trees: the app's), and the place
  numbers for sentences. Conformance `conformance/cases/row-move/*.json` (≈ 30, by hand).
- **`@dzgrid/dom/row-drag`** (new entry over the DOM base): the grip painted in `afterRows`, the pointer drag (copy
  of the columns' state machine on the block axis), the layer (ghost, line, inside outline), `cellAt` / `autoScroll`
  from `range/geom.ts` (imported, not copied), the 800 ms spring-open through the tree's / grouping's `api`, keys,
  menu entries, sentences, drop targets, `emit(kernel, { type: 'rowMove', … })`, the managed `setRows`.
- **`@dzgrid/dom/locales/{en,fr,ar}-row-drag`**, **`@dzgrid/theme/row-drag.css`** (grip, ghost, line, inside, off,
  forced colours `Highlight`, `cursor: grab / grabbing`).
- **Angular**: `(rowMove)` output (the `gridEvent` filter as the others), `DzgController.rowDrag()`.
- **Not touched**: core base, DOM base, `range`, `columns`, `context-menu`, `edit`, theme base, K.8.

## 4. Steps (sessions; each ends with `npm run gate:step`, tests written red first, expectations by hand)

| Step | Content | Sessions |
|---|---|---|
| R0 | Sheet `row-move.md` (behaviours numbered, keys table LTR / RTL, texts en / fr / ar, WCAG notes, « differs on purpose »); conformance `row-move/` by hand; owner answers in `decisions.md` | 0.5 |
| R1 | `@dzgrid/core/row-drag`: targets, steps, `moveRows`, places; conformance + a 1 000-seed property (a move then its inverse gives the list back; a managed move keeps every key, object and the selection; never into a descendant); purity test passing | 1 |
| R2 | DOM pointer: grip, 4 px threshold, ghost, line, tree inside, auto-scroll, Escape and the quiet cancels, swallowed click, several rows, `canDrag` / `canDrop`, refusals when sorted / grouped, event and managed `setRows`; jsdom tests (`row-drag-{move,geom,tree,many,refuse,managed}.test.ts`) | 1.5 |
| R3 | Keys and menu: Alt+Shift arrows / Home / End, indent / outdent, focus kept, sentences (300 ms), `aria-keyshortcuts`, menu entries; locales; CSS + `check:contrast`; server sources (event only, held rows, page edge) | 1 |
| R4 | Angular `(rowMove)`, `DzgController.rowDrag()`; playground page (LTR, `rtl.html`, tree, server pages); drop targets | 0.5 |
| R5 | Browsers: `scripts/browser-row-drag.mjs` — Chrome, Firefox, WebKit: drag with auto-scroll over 10 000 rows (no frame over 50 ms), RTL (line and indent on the right side), a finger on the grip (touch emulation), keys in RTL; axe 0 on the drag page; screen reader pass (VoiceOver + one Windows reader by the owner, the S4 protocol); review (new code), fixes, gate | 1 |
| | **Total** | **5.5** |

## 5. Sizes (gzipped, minified; measured 2026-11-05 → estimate → line asked)

Owner's rule: a new entry's line = its measure + 10 %; an existing line moves +2 % at most.

| Entry | Today / line | Estimate | Line |
|---|---|---|---|
| `@dzgrid/core/row-drag` (new, over core) | — | 900–1 200 | measure + 10 % |
| `@dzgrid/dom/row-drag` (new, over dom; `range/geom` inside it) | — | 3 000–3 600 (columns' drag and keys ≈ 2 400 of `columns`' 3 972, + the tree, several rows, menu entries, managed mode) | measure + 10 % |
| `locales/{en,fr,ar}-row-drag` (new, ≈ 14 texts) | — | 280 / 330 / 420 | measure + 10 % |
| `@dzgrid/theme/row-drag.css` (new) | — | 400 | measure + 10 % |
| `@dzgrid/angular` (`(rowMove)`, controller) | 7 883 / 7 900 | +40 | ≤ 8 058 (+2 %) |
| `@dzgrid/core` base (`GridEvent` member: a type) | 29 258 / 29 300 | 0 | kept |
| `@dzgrid/dom` base, `@dzgrid/theme` | 23 650 / 23 660, 2 918 / 2 960 | 0 | kept |
| `range`, `columns`, `tree`, `grouping`, `context-menu` (+ locales), `edit` | 5 139, 3 972, 4 193, 4 782, 2 560 | 0 | kept |
| **K.8 audit profile** | **89 976 / 90 000** | **0** (the audit screen does not drag rows) | kept |
| real Angular example | 99 426 / 99 500 | 0 unless the owner adds row drag to it (then +≈ 4 800: owner) | kept |

**A grid without `rowDrag()` pays nothing.** If a measure passes its line, the step stops and asks.

## 6. Exit criteria

- `row-move` conformance green; the 1 000-seed property green; the purity test passes on the new sub-entry.
- Every behaviour of the sheet is a test; every way (pointer, keys, menu, API) goes through the core's same rules
  and emits the same event (one place that computes targets — the review checks no second one).
- Chrome, Firefox, WebKit: a drag over 10 000 rows with auto-scroll, no frame over 50 ms; RTL drag, keys and indent
  mirrored; a finger on the grip moves, a finger elsewhere scrolls; axe 0.
- Managed mode: after a move, selection, focus, expansion, edits in flight and their undo are kept (same keys).
- Sizes as §5; K.8, core base and DOM base unchanged byte for byte in their lines; `check:api` additions + `GridEvent`.
- Architect check against ARCHITECTURE Phase 9, code review, fixes, `gate:step` green; `test:real-app` at the phase's close.

## 7. Risks

- **R1 Windows' Alt+Shift** switches the keyboard layout on some machines (the system hotkey). If it fires with an
  arrow pressed in between, the owner's Windows check fails → fallback Ctrl+Alt is banned (VoiceOver), so **Alt+arrows
  without Shift** (the chooser's keys; Alt+↓ on a body cell is free today). To check on a real Windows at R3.
- **R2 Event mode lag**: if the app answers late (a server first), the row snaps back until the new rows arrive. The
  sheet tells apps to update locally first; the grid shows no « pending » state in V1.
- **R3 Spring-open in a lazy tree** may load children the user did not want (800 ms, cancelled when the pointer
  leaves; no load under the keyboard).
- **R4 `exclude` selections** on server sources cannot list their rows: capped by `maxRows` and the held rows.
- **R5 The grip in a narrow first column** may squeeze its text: the grip takes 24 px; the app picks the column.
- **R6 `range/geom.ts` imported** into a second entry: an app with both pays it once in its bundle, but our size check
  counts it in both lines (as `fill`). If it weighs too much, measure `row-drag` over `range` instead.
- **R7 Focus after a structural change** may be lost in some engines (the columns' R1): given back in `afterRows`.
