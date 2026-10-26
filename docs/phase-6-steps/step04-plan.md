# Phase 6, step 4 — the column chooser (`@dzgrid/dom/columns-panel`): the plan

Architect, 2026-10-26, read-only (nothing run, nothing changed but this file). Wins over it: `decisions.md` (Q-C1, Q-C2, Q-H,
Q-B, O1, O2, O3, O5, O12, Q3-1, Q3-5). Sheets: `columns-chooser.md` (rules cited « C n »), `column-move.md` (M n),
`column-menu.md` 13–15, `header-groups.md`/`spans.md` (groups), a11y §21 152–154, 165. Clean room: behaviour from the sheets, WAI-ARIA
1.2, the APG « dialog (modal) » pattern, WCAG 2.2 only.

## 0. Facts read in the code (they change the sheet)

1. **`popup.ts` `sweep()` closes a popup whose anchor left the page.** The chooser opened from header X would close when the user
   unticks X (or X is recycled out of the column window). **Anchor the popup on a stable element (`g.el.root`)**, place it by
   `from: <header or app button>` + `align: 'end'`, and give `back` (focus the opener if connected, else `g.restoreFocus()`). 0 B host.
2. **Host Tab trap is wrong for this content.** `FOCUSABLE` matches `button:not([disabled])` and `input:not([disabled])` even with
   `tabindex="-1"`: ▲ ▼ handles and the non-current checkboxes count, so « last » is a handle, `Close` is not the last, and Tab
   from `Close` leaves the dialog (§21 165). **Host seam: add `:not([tabindex="-1"])` to the button/input/select/textarea terms**
   (~ +15 B on `popup`, 1 587 / 1 650). Guard: the filter popup tests (they keep passing; red test first for the chooser).
3. The host puts `role="dialog"` + `aria-modal` on `modal: true` and focuses the **first** focusable: the search box (C 3) — free.
   It names with `aria-label` only: the chooser sets `aria-labelledby` itself on `ref.el` to its visible title (0 host cost).
4. The popup root has `data-dzg-owner="popup"`: the grid's key handling ignores keys from inside. Guard test: arrows, Space,
   Home/End, Alt+arrows in the dialog never move the grid's cell focus or block.
5. **`columns/order.ts`**: `fullOrder` (all columns, hidden too), `reorder`, `patchOf`, `step` — `step` walks the **visible** segment
   (`segIds`). The chooser needs the same walk over the **full** order incl. hidden columns, per segment (a hidden column's side
   is `state().pinned`, not the layout) and per group. New pure code is needed (§2). `COLUMNS_KEYS`/`move.edge`/`move.locked`
   texts are reusable.
6. **Reset** lives inline in `column-menu/index.ts:185` (+ its « nothing differs » test). The chooser needs the same patch: extract
   `resetPatch(m)` to `order.ts` (pure, shared; the menu keeps its inline copy this step — switching it is a later cleanup, costs menu bytes).
7. **Groups**: `leaves()` drops the tree; the tree is `g.settings.columns` (`ColumnGroupDef { id, header?, children }`). `ColumnDef`
   has `hideable?: false` (step 3) but **no `chooser: false`**: add the type-only field (C 6).
8. **Texts**: `menu.hidden`/`menu.resetDone` are in `-column-menu`; the chooser must not depend on that bundle. New keys in
   `-columns` (§6): `chooser.hidden`, `chooser.resetDone`, `chooser.last` (description of the disabled last box) on top of the sheet's 18.
9. Subscribe to changes with `kernel.subscribe((e) => e.type === 'columnsChanged' …)` (as `columns/index.ts:243`) for live sync (C 22).
   Our own patches also come back: compare the list to the model, redraw only when different; keep focus by column id.

## 1. Design decisions (lead; confirm in review)

- **Export name `columnsChooser()`** (the sheet's), not `chooser()` (clashes with the menu's `use.chooser` key and reads as a noun).
  Option `use: { chooser: columnsChooser() }` stays as step 3 typed it.
- **List order = the full order, segment by segment** (start-pinned, centre, end-pinned; each by `order`), hidden included. Group
  headings are the grid's header groups: render **consecutive runs** of the same group path (a group split by a pin repeats its
  label, as the grid header does) — no folding, no tick on a group (choice 1). Moves inside a group only (choice 3).
- **No JS windowing above 200 columns** (C 10): all rows are rendered with CSS `content-visibility: auto; contain-intrinsic-size`,
  and `aria-setsize`/`aria-posinset` are not needed. Saves ~150 B; sheet 10 amended in « As built ». Ask not needed (same outcome).
- **Reorder logic** goes in `columns/order.ts`, not in the chooser file (pure, mutation-tested, reused by `columns()` later).
- Pointer drag is its own small code (pointer events + capture on the handle, `touch-action: none` on the handle only, 4 px,
  Escape cancels, list auto-scroll near its top/bottom 24 px); it shares nothing with the header drag (different geometry).
- A drop = `landing gap among shown-in-list rows` → `reorder(full, id, gap, locked)` → one `column.state` patch, same as the
  keys. A drop that would cross a segment or group edge snaps to the nearest allowed gap (as `land`) — never pins.

## 2. API

```ts
import { columnsChooser } from '@dzgrid/dom/columns-panel';
const chooser = columnsChooser({ onClose? });
createGrid(host, { …, features: [moves, columnMenu({ use: { columns: moves, chooser } }), chooser] });
chooser.api(grid).open(buttonEl?)   // → boolean
chooser.api(grid).close()
chooser.api(grid).isOpen            // boolean
```

- `ColumnsChooserOptions { readonly onClose?: () => void }` — nothing else (no classes/parts this phase; CSS only).
- `open(anchor?)`: places under `anchor` (header from the menu, or the app's button), else under the grid's top-end corner. Returns
  false when destroyed or no listed column; already open → focuses the search box, true. One chooser per grid; opening the menu
  or a filter popup elsewhere does not close it (outside press does, as the host).
- Events: nothing new. Every tick/move is one `column.state` patch → one `columnsChanged` (source `user`), `column.state` carries
  `hidden`/`order`; the app hears them as for the menu. `onClose` only (the focus is already back).
- Setup throws `TypeError('columns-panel: missing …')` for missing texts (as the menu). Needs no other feature (moves are the
  kernel + `order.ts`); `api()` null before setup/after destroy.
- Types: `ColumnDef.chooser?: false` (type only; the column is not listed, still hideable by the menu).

## 3. Pure logic (new, `columns/order.ts`) — mutants run here only

| Function | Contract |
|---|---|
| `listOrder(m)` | `fullOrder` regrouped by segment (side of a shown column from the layout, of a hidden one from `state().pinned`), start, centre, end |
| `stepList(m, id, by, groupOf)` | one place toward the start/end in the **list** (hidden counted), inside its segment AND group run, locked columns jumped over (M12/O3); returns patch / `'edge'` / `'locked'` / null; reuses `reorder` + `patchOf` |
| `placeInList(m, id, n)` | the sentence's `n`: 1-based place of `id` among **all** listed columns (hidden included) and the total (`chooser: false` columns excluded) |
| `resetPatch(m)` | the menu's reset patch (order 0..n−1, `width: null`, `hidden`, `pinned` from defs) or null when nothing differs |
| `canHide(m, id)` | `def.hideable !== false` and (the column is hidden, or ≥ 2 shown) — O1 |

`step` is refactored to call `stepList`'s core with the visible list (one walk, two candidate lists) — no behaviour change; its
existing tests are the guard.

## 4. UI, ARIA, keys

Structure (inside `.dzg-popup`, dir from the grid): `<div class="dzg-cp">` — header row: title (`h2`-less `div id`, the dialog's
`aria-labelledby`) + `Close` (a `button`, last in DOM, but visually top end); `<label>` + `<input type="search">` (visible label);
`status` region (`chooser.none`, sr-only count sentence uses the grid's live region instead); `<ul role="list" aria-label>` of
`<li>`: `<input type=checkbox id>` + `<label for>` (`<bdi>` for the name) + description via `aria-describedby` (pinned side, closed
group, last shown) + ▲ ▼ + handle (`<button>`s, `tabindex=-1`, named, 24 × 24); group runs as nested `<li role="group"
aria-labelledby>` with its own `ul`; footer `Show all`, `Reset`.
Disabled = `aria-disabled="true"` (never native `disabled`: stays in the roving order, its name heard); a click on it does nothing.
Roving `tabindex`: one checkbox 0, the rest −1 (§0.2 makes the trap right). Sentences go through `g.live.announce`: `chooser.shown`
/ `chooser.hidden` per tick, `chooser.placed` per move, `move.edge`/`move.locked`, `chooser.allShown`, `chooser.resetDone`,
`chooser.matches` after 500 ms, `chooser.clearToMove`. Nothing on opening beyond the dialog's name. ▲ ▼ and handles vanish while the search is non-empty (C 21).

| Where | Key (Mac in brackets) | Result (RTL: identical; the list is vertical, nothing mirrored) |
|---|---|---|
| search | typing | narrows (fold: case, accents, hamza forms, harakat, tatweel, digits; « contains », groups match whole) |
| search | ArrowDown | first visible checkbox |
| search | Escape | non-empty: empties it (once, stops propagation, O12); empty: closes |
| checkbox | ArrowDown / ArrowUp | next / previous checkbox; ArrowUp on the first: search |
| checkbox | Home / End | first / last |
| checkbox | Space | show / hide (native), disabled: nothing |
| checkbox | Alt+ArrowUp / Alt+ArrowDown (Option+arrows) | `stepList` ∓1; focus stays on the moved box (re-found by id); search non-empty: `chooser.clearToMove` |
| button (▲ ▼ ✕ …) | Enter / Space | its action; ▲ ▼ focus returns to the row's checkbox |
| inside | Tab / Shift+Tab | search → list (one stop) → Show all → Reset → Close → wraps (host trap, §0.2) |
| inside | Escape | closes, focus to the opener |
| inside | Ctrl/Cmd+Shift+arrows | nothing (page and header keys never reach: owner flag) |

Pointer: the checkbox/label click flips it; ▲ ▼ one place per click; handle drag after 4 px with a landing bar, Escape cancels
(`move.cancelled` reused), `pointercancel` cancels quietly, finger = same path (O5). WCAG 2.5.7 met by ▲ ▼; 2.5.8 by 24 px CSS.
Close paths: Escape, `Close`, outside press, grid destroyed, defs replaced (`columnsChanged` with a different id set → close). Focus
back: the opener if still connected (header of a hidden column is not: grid focus).

## 5. Tests to write FIRST (red for the reason given)

jsdom unless said; `packages/dom/test/` and `packages/dom/test/popup-*.test.ts`.
1. `popup-focusable.test.ts`: a modal popup holding ▲ (`tabindex=-1`) buttons and a roving checkbox list: Tab from the real last
   control wraps to the first; Shift+Tab from the first wraps to the last — red on today's selector.
2. `popup-anchor-survives.test.ts` (or in the chooser file): the opener header removed → chooser stays open (anchored on the root).
3. `columns-order-list.test.ts` (pure, **mutants here**): `listOrder` segments with hidden columns; `stepList` over hidden columns
   (a hidden neighbour is a real place), inside a segment, edges `'edge'`, locked jumped (O3), group-run edge; `placeInList`
   counts hidden and excludes `chooser: false`; `resetPatch` null / not null; `canHide` O1 incl. a hidden column always allowed.
   Guard: existing `step` tests unchanged.
4. `columns-chooser-texts.test.ts`: setup throws on missing keys; en/fr/ar have the same keys (the pattern of `column-menu-texts`).
5. `columns-chooser-open.test.ts`: role/`aria-modal`/`aria-labelledby` = visible title; focus in the search; Escape/outside/Close
   close, focus back (opener; opener gone → grid focus); open twice = one dialog; `use.chooser` makes the menu item appear and
   open it (the step 3 seam); keys inside never reach the grid (§0.4).
6. `columns-chooser-list.test.ts`: every column but `chooser: false`, hidden ones unchecked, order = full order, groups as runs, pinned
   description, last shown disabled (`aria-disabled`, Space does nothing, O1), `hideable: false` disabled, tick = one patch + one
   sentence, Show all one patch, Reset = menu's patch, live sync (header move, menu hide, defs change) keeps focus by id.
7. `columns-chooser-search.test.ts`: fr accents, ar hamza/harakat (fold), group match shows all children, none → `chooser.none`,
   matches sentence after 500 ms (fake time), Escape order O12, reorder controls hidden, Alt+arrows say `clearToMove`.
8. `columns-chooser-keys.test.ts`: Alt+Up/Down sentences `chooser.placed` counting hidden ones (the 5-of-12 case), focus stays, edge
   and locked sentences, ▲ ▼ same patch + disabled at edges; roving arrows/Home/End; Tab order.
9. `columns-chooser-drag.test.ts`: pointer events with a fake `elementFromPoint` / rects: 4 px threshold, one patch on release, none
   on same place, Escape cancels, a `pointerType: 'touch'` drag works on the handle only, drop across a segment snaps.
10. theme: `columns-panel.css` rules present (§7), contrast pairs added to `contrast-pairs.json`; `rebudget.test.ts`/`release.test.ts`
    step 4 (entry, ceilings, exports, build list — the step 3 pattern).
Mutants: **only** `order.ts` (`stepList`, `listOrder`, `placeInList`, `resetPatch`, `canHide`) by the reviewer, ~25; none on display code.

## 6. Texts

New keys in `-columns` (en/fr/ar): the sheet's 18 + `chooser.hidden`, `chooser.resetDone`, `chooser.last`; `ColumnsMessageKey` unchanged
(the moves keep their own `COLUMNS_KEYS`; add `COLUMNS_CHOOSER_KEYS`; `ColumnsChooserMessageKey` type in `part-texts.ts`).
Estimate by the menu's rate (~12 B gz per key): + ≈ 250 / 310 / 400 → ≈ 420 / 500 / 620 of 500 / 600 / 800 — **fits the grant, no new ceiling**.
Cost: an app with moves only loads that much text unused. Alternative: a separate `-columns-panel` bundle (new ceilings ~300/360/480). Owner Q4-1.

## 7. CSS

`columns.css` is **1 092 / 1 100: full**. The chooser needs ~25 rules (dialog box 360 px / 70 vh / 320 px fit, list scroll, rows,
24 px targets, handle grab/`touch-action`, drop bar, disabled, focus, forced colours, `content-visibility`). Plan **a new
`columns-panel.scss` → `columns-panel.css` (+ unlayered), ceiling ≈ 900 (measure + 10 %)**, wired in `build-theme.mjs`, exports,
`contrast-pairs.json`; apps without the chooser do not load it. Owner Q4-2.

## 8. Sizes

| Item | Now | Plan |
|---|---|---|
| `dom/columns-panel` | new | 4 000 grant. Estimate (gz, over popup): dialog + focus/back 400, list + groups + a11y 800, search/fold 300, keys + roving 350, reorder UI + sentences 350, drag 550, live sync 250, show all/reset 200, `order.ts` imports 450 = **≈ 3 650 – 4 300: risk of exceeding** |
| `popup` | 1 587 / 1 650 | + ≈ 15 (tabindex selector) |
| core 28 930 / 29 150, DOM base 21 773 / 22 400 | | 0 (type-only `chooser?: false` in core defs = 0 B emitted; confirm) |
| texts `-columns` | 162/184/216 of 500/600/800 | ≈ 420/500/620 |
| `columns.css` / `columns-panel.css` | 1 092 / 1 100 | unchanged / ≈ 900 new |
| `dom/columns` | 2 825 / 2 900 | must not grow (`order.ts` extra exports tree-shaken; **measure**: bundles that share `order.ts` count it per entry) |

STOP rule: if `columns-panel` measures > 4 000, report before anything else. Cut order (no sheet loss first): the `matches`
debounce sentence (use at once), `inClosedGroup` description, drag auto-scroll, `Show all`'s sentence merged with the tick one;
then ask the owner (as step 3: measure + 10 %).

## 9. Browser checks (Chrome unless said)

`--only chooser` (new `scripts/browser-chooser.mjs` + `browser.mjs` entry and header comment):
- open from the ⋮ menu and from an app button; focus in the search; unticking the opener's own column keeps the dialog open;
- fr light and ar dark RTL: dialog edge on the opener's end edge, handles at the inline end, Latin names isolated, order top = start;
- real Tab / Shift+Tab loop of 5 stops (165), never the grid; Escape clears then closes; focus back;
- Alt+arrows: the sentence, hidden counted; ▲ ▼ and a real **mouse drag** of a handle; **a touch drag** (CDP touch events) on a handle
  while the list still scrolls on the row; 320 px view (1.4.10); 200 % zoom; targets ≥ 24 px; axe 0 open; forced colours;
- grid behind moves and stays aligned; `content-visibility` list of 300 columns scrolls (smoke).
Firefox and WebKit **`--only chooser` for the drag and the keys only** (Alt+arrows, Option on WebKit, Tab trap, handle drag with the
mouse; touch is Chrome only). Playground: the `orders-edit.html` demo gets `chooser` wired with the menu (`?chooser=0` off): `--only playground` once. No full suite (phase close).

## 10. Risks

1. Size over 4 000 (§8): largest risk; the shared `order.ts` counted per entry.
2. `sweep()` and recycled headers (§0.1): fixed by the root anchor; test 2 is the guard.
3. Host trap change touches the filter popups (§0.2): their tests are the guard; Chrome `--only filters` once.
4. The sheet contradicts itself (C 2 « end edge on the anchor's end edge » vs « Right to left » « start edge »): the plan takes **end edge, `align: 'end'`** (like the menu).
5. `aria-modal` without making the grid inert: some readers still reach the grid; accepted (host choice); noted in a11y 165.
6. Drag of a row touching `order` while a live sync redraw happens (a header drag at the same time): the drag cancels on `columnsChanged` not made by itself.
7. Moves in the list for a column pinned/hidden mix: a hidden column keeps its side by `state().pinned`; a hidden-then-shown column's segment must match (test 3).

## 11. Owner questions (simple French)

**Q4-1 — Où mettre les textes de la fenêtre ?** (≈ 21 phrases)
- A (recommandé) : dans le fichier de textes des colonnes déjà prévu (`-columns`). Aucun budget de plus ; une grille qui ne fait que déplacer les colonnes charge ≈ 250 octets de textes inutiles.
- B : un fichier à part `-columns-panel` (≈ 300 / 360 / 480 octets) : rien d'inutile, mais un budget de plus et un fichier de plus à importer.

**Q4-2 — Où mettre le style de la fenêtre ?** (le fichier `columns.css` est plein, 1 092 sur 1 100)
- A (recommandé) : un nouveau fichier `columns-panel.css` (≈ 900 octets), chargé seulement par ceux qui ont la fenêtre.
- B : agrandir `columns.css` de 1 100 à ≈ 2 000 : un seul fichier, mais tout le monde le paie.

**Q4-3 — Une longue liste (plus de 200 colonnes).**
- A (recommandé) : tout afficher et laisser le navigateur ne dessiner que le visible (CSS), sans code de plus ; la fiche est mise à jour.
- B : une vraie liste « fenêtrée » en code, comme la fiche l'écrit : environ 150 octets de plus et plus de risques.

**Q4-4 — Si la taille dépasse 4 000 octets** (estimation 3 650 à 4 300) : A (recommandé) l'architecte coupe d'abord les petites choses (phrase de comptage avec pause, description « groupe replié »), puis revient vous voir ; B : vous relevez tout de suite le plafond à ≈ 4 500.

## 12. Order of work

1. Red tests 1, 3, 4, 10 (host selector, pure order, texts, budgets); then `order.ts`, host selector, texts, types, configs.
2. Red tests 5–9; `columns-panel/index.ts` + `columns-panel.ts` entry; CSS; contrast pairs.
3. `browser-chooser.mjs`; demo wiring; one full gate (`test:ci`, typecheck, build, `check:contrast`, `check:size`).
4. Update `columns-chooser.md` « As built », a11y §21 notes, `STATUS.md`, this file « Done ». One review (with step 5 if the lead groups them); mutants on `order.ts` once.

## Done (implementer, 2026-10-26; not committed, no review yet)

**Built.** `@dzgrid/dom/columns-panel` (`packages/dom/src/columns-panel.ts`, `columns-panel/index.ts`): `columnsChooser({ onClose })`,
`api(grid).open(anchor?) / close() / isOpen`. A modal dialog in the popup host anchored on the grid's root, placed under its
opener (`align: 'end'`; above when no room), named by its visible title; search box (visible label) focused on opening; the
list (`ul role=list`) in the list's order, hidden columns included, `chooser: false` left out, header groups as `li > div[role=group]`
named by their label (a group cut by a pin named again); a native checkbox per row (`<label for>` + `<bdi>`), the pin and « last
shown » in its description, `aria-disabled` for the last shown and `hideable: false`; ▲ ▼ and a handle (`tabindex=-1`, named,
`aria-disabled` at the edges / locked); « Tout afficher », « Réinitialiser », « Fermer ». Keys: ↓ from the search, ↑ ↓ Home End
between boxes (roving), Alt+↑ / ↓ one place (`stepList`, place said among all listed columns), Escape: drag → search → close
(O12), Tab: the chooser's own five-stop loop. Drag: the handle, 4 px, the bar on the gap among its own list's items of its
segment, auto-scroll near the list's edges, Escape (said) / `pointercancel` (quiet), a finger the same (O5). Live sync on
`columnsChanged` (focus kept by column id); another column set closes it. Pure order functions in `columns/order.ts`:
`listOrder`, `stepList`, `moveNear`, `placeInList`, `resetPatch`, `canHide`, `sidesOf`, `listed` (mutants: these only).
Texts: 20 `chooser.*` keys in `locales/{en,fr,ar}-columns` (Q4-1), `ColumnsChooserMessageKey`. Look: `@dzgrid/theme/columns-panel.css`
(Q4-2), 4 contrast pairs. Core: `ColumnDef.chooser?: false` (type only). Popup host: the Tab trap skips `tabindex="-1"`
controls. Demo `orders-edit.html`: ⋮ → « Choisir les colonnes… » and a « Colonnes » button (`?chooser=0` off). Browser:
`scripts/browser-chooser.mjs`, `--only chooser`.

**Tests written first, each seen failing for its reason before its code:**
- `scripts/test/rebudget.test.ts` step 4 (no `columns-panel` ceiling), `release.test.ts` step 4 (no export / build entry);
- `popup-focusable.test.ts` (Tab from « Close » left the dialog; Shift+Tab landed on a ▲): 2 red, 1 guard green;
- `columns-order-list.test.ts` (10 red: functions absent);
- `columns-chooser-texts.test.ts` (no entry; then no keys);
- `packages/theme/test/columns-panel.test.ts` (8 red: no file);
- `columns-chooser-{open,list,search,keys,drag}.test.ts` against a stub entry (43 red: no dialog);
- after the first WebKit run: the chooser's own Tab loop and focus-on-click (2 red), the long-list mark (`data-dzg-long`, 2 red).
Changed old tests (their intent kept): `columns-texts.test.ts` (the `-columns` bundles now also hold the chooser's keys),
`release.test.ts` step 2 (`'columns-panel'` after `'columns'` in build-theme), `structure.test.ts` (popup import allowed in `columns-panel/`).

**Gate (once, `caffeinate -i`, vitest 2 workers):** `build` ✓; `typecheck` ✓; vitest 435 files, 6 641 tests (one old regex
fixed and rerun); `check:size` 0 over; `check:contrast` 1 050 pairs, 0 below. Browser: `--only chooser` Chrome 29 / 29,
Firefox 8 / 8, WebKit 8 / 8 (three runs); `--only playground` 41, `column-menu` 38, `filters` 12, `columns` 27 (Chrome).

**Sizes (B gz):** `dom/columns-panel` **3 975 / 4 000** (no Q4-4 raise needed; 25 B left); `columns-panel.css` 918 / 1 000
(measure + 10 % = 1 010, capped at the 1 000 ceiling); popup 1 590 / 1 650 (+3); `dom/columns` 2 824 / 2 900 (unchanged);
texts en / fr / ar 391 / 478 / 573 of 500 / 600 / 800; core 28 930 and DOM base 21 773 unchanged.

**Deviations from the plan.**
1. `content-visibility` only on lists of more than 200 rows (`data-dzg-long`): WebKit hit-tests a freshly drawn skipped
   row as its `li` (a click on a label missed after every redraw). Same Q4-3 outcome above 200.
2. Tab is handled by the chooser itself (search → list → three buttons → wrap): WebKit's Tab skips buttons by default.
   A click focuses the control it pressed (WebKit focuses nothing). The host's `tabindex="-1"` fix is kept (§0.2).
3. « Fermer » is the third footer button, not at the top end (one CSS rule less; same Tab order).
4. No `chooser.inClosedGroup` text or code: collapsible groups come at step 8 (it lands with them).
5. `step` is not refactored onto `stepList` (no behaviour change wanted in `dom/columns`; both stay); `patchOf` keeps the
   layout side, `moveNear` passes it (never a pin change), so `dom/columns` does not grow.
6. A column outside a group passes a whole group in one step (a sub-group is one place), so groups stay whole.
7. Defs replaced with the same column set (a header renamed) keep the dialog and redraw it; another set closes it.
8. No `chooser.matches` sentence when the search is emptied. Direction / language changes while open are not watched
   (the menu closes; the chooser keeps its texts until reopened).

**Known risk.** The sentences go to the grid's live region, outside the `aria-modal` dialog: some readers may not speak
them while it is open (§21 152–155 listening will tell; then a status region inside the dialog).

## Review of steps 3–4, fixes (implementer, 2026-10-26; 30 / 30 mutants on `order.ts` killed by the reviewer)

Each fix had a test first, and each test failed on the old code.
1. The chooser's sentences go to its own polite `role=status` inside the dialog (`LiveRegion`: emptied, filled 50 ms later), and to the grid's region only when it is closed; never both (`columns-chooser-review.test.ts`).
2. The menu: the item the keys focus is scrolled into view (`scrollIntoView({ block: 'nearest' })`) (`column-menu-keys`).
3. The chooser: a moved row's box is scrolled into view the same way.
4. The menu leaves Ctrl/Cmd+key, Alt+key (not the arrows) and keys it does not use (F5…) to the browser (`column-menu-keys`).
5. Popup `fit: true` (kept inside the window when there is room neither below nor above) is opt-in: the menu and **the chooser** use it (the chooser's 320 px browser check failed without it); filter popups go below as before (`popup-from`).
6. A disabled box is faded (0.5) and has a lock before its name, which is not colour only; forced colours CanvasText; pair `--tz-fg` / `--tz-bg` ≥ 3 (theme test).
7. A click on a row's ▲ ▼ (even a disabled one) focuses that row's box, so Tab goes on from the row.
8. The drag's auto-scroll runs one frame after another while the pointer rests near an edge, and stops on release, cancel or Escape.

Sizes: `dom/columns-panel` **4 286 / 4 400** (Q4-4 used, line raised to 4 400), `columns-panel.css` 991 / 1 000 (three rules trimmed: `overscroll-behavior`, the group label's block padding, the lock's vertical offset), `column-menu` 4 022 / 4 300, popup 1 594 / 1 650.
Gate: build, typecheck ✓; vitest 436 files, 6 650 tests ✓; check:size 0 over; check:contrast 1 056 pairs, 0 below. Chrome: `chooser` 29, `column-menu` 38, `filters` 12, `playground` 41.
