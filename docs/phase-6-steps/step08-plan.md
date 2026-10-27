# Phase 6, step 8 (plan numbering: 8, owner's "step 7"): collapsible header groups (Q-GH A)

Architect blueprint, 2026-10-27. Plan only. Wins over this file: `decisions.md`, then `docs/behaviors/header-groups.md` (1-15, choices 1-3), `columns-chooser.md` 8-9, `grid-state.md` (groups), `a11y-protocol.md` 21 (158-160). Clean room: our own words only.

## 0. Facts found in the code (why the design is what it is)
- `resolveColumns` keeps leaves only: the base never knows groups. `columns/model.ts` `recompute()` has one `shown` filter (user `hidden` ?? `def.hidden`). `change()` already bumps `version` when `shownIds()` changes and bumps `dataVersion`, so a new filter input needs no new bookkeeping.
- Group chains are computed only in `core/spans/bands.ts` (`headerBands`, `chain` by leaf, walk of the tree) and in the chooser (own walk, `columns-panel/index.ts` ~79). `bands.ts` already skips hidden leaves, splits per segment, repeats the label on each piece (O7): a closed group needs **no new band maths**; folded leaves just are not in the layout.
- `core/state` already has `GroupsAdapter { collapsible, get, set }` and `StateEnv.groups`, `state-group` problem, `groups` capture/restore. Conformance `grid-state/groups-before-step-8.json` documents "no collapsible groups yet": it must be rewritten (see tests). `dom/state` has `SAVED` events with a "groups at step 8" note.
- `dom/spans/bands.ts` writes group-cell text with `el.textContent = text`: this would erase a button. Must change to a text node + button.
- Menu "reset" (`column-menu/index.ts`) patches columns only; its disabled test knows nothing of groups.

## 1. API

**Types (0 B, type-only):** `ColumnGroupDef.collapsible?: boolean` (default false), `open?: boolean` (initial, default true); `ColumnDef.groupShow?: 'open' | 'closed'` (absent = both). These are the app's answer to "which columns stay when closed".

**Core base seam (target 40-80 B, hard stop 120; room 29 150 - 28 930 = 220):** in `ColumnModel`:
- `readonly folded: ReadonlySet<string>` (column ids hidden by a closed group; empty by default);
- `fold(ids: ReadonlySet<string>): ColumnChange` = `change(() => { folded = ids; return [...ids] })`; `shown` filter becomes `!folded.has(c.id) && !(user hidden...)`.
- Safety rule inside `fold` (about 15 B): if the fold would leave **no** shown column, it is refused (nothing changes). Keeps O1 true when the user also hid columns.
- `state()` / user map untouched: `hidden` stays purely the user's. No new kernel command: dom/spans calls `columns.fold` then `emit(kernel, { type:'columnsChanged', source, changed, layoutChanged })` (internal `emit`, as it does for problems). Fallback if the repaint or `stateChanged` does not follow: a `column.fold` kernel command (+40-60 B), then ask the owner before exceeding 120.

**`@dzgrid/core/spans` (pure; today 3 438-3 458 / 3 800, estimate +200-280):**
- `groupTable(tree): { groups: Map<id, {open: boolean, leaves: string[], shownClosed: string[], shownOpen: string[]}>, problems }` (valid collapsible groups only, nested chains, same validation as `headerBands`; shares its walk if the bytes allow).
- `foldedColumns(table, state: ReadonlyMap<id, boolean>): Set<string>`: a leaf is folded when some collapsible ancestor is closed and the leaf's `groupShow === 'open'`, or the ancestor is open and the leaf's `groupShow === 'closed'`; rule 2 of the sheet: a closed group with no `closed` child shows its first child, one `invalid-column-group` warning (`empty-closed`, path `columns...children`), told once per tree (as bands does).
- `diffState(table, state)`: `Record<id, boolean>` of groups whose state differs from their definition (for `GridState.groups`).

**`@dzgrid/dom/spans` (today 4 455 / 4 950, grant 5 300 = ~845 B room; estimate +450-650):**
- Keeps `open: Map<id, boolean>` (the user's overrides only) and the table, recomputed when `g.settings.columns` changes (unknown ids dropped, known ones kept; no problem).
- `spans().api(grid): GroupsApi | null` (same pattern as `gridState().api`): `isOpen(id)`, `set(id, open, { say? })`, `toggle(id)`, `reset()` (back to definitions), `state()` (= `diffState`), `collapsible(id)`. This object is also the `GroupsAdapter` for `core/state` (`get` = `state()`, `set` = replace overrides, one `fold`). `dom/state` finds it through a kernel-keyed slot registered by spans at setup, read lazily at capture/restore, so feature order does not matter (a few bytes in the DOM base, measured; margin 22 400 - 21 855).
- The button, in `bands.ts`: a `<button type="button" tabindex="-1" aria-expanded aria-label="group.toggle {group}">` as last child of a collapsible group cell, 24x24 px hit area (CSS in `dom/spans/styles.ts`, which counts in `dom/spans`), chevron drawn in CSS (shape; `ButtonText` in forced colours), mirrored with `scale:-1` under `dir=rtl` (closed chevron points to inline end). The cell text goes into a text node so the repaint stops overwriting the button. Group name = `group.open` / `group.closed` text (sheet 9) written as `aria-label` on the cell only when it changed.
- Keys: through the spans `move`/`keys` handle already owning the group rows: Enter and Space on a focused **collapsible** group cell toggle (non-collapsible: nothing, as now). Alt+Up/Down: nothing. Click on the button toggles; the button's click never reaches the cell's own handlers (stopPropagation) and does not move the focus away from the group cell.
- Toggle = pick focus fallback first, then `fold`, then emit `columnsChanged` (source `user`), then `say(group.closedSaid/openedSaid {group, n})` with n = shown leaves of that group.
- Focus fallback (sheet 11): focus on a column header or body cell of a column that is about to be folded: header -> the group cell of that column at the closing group's level (`{kind:'header', column: first shown leaf, level}`); body cell -> same row, first shown column of the group, else the next shown one. Set before the fold so the kernel's own "column vanished" fallback never wins. Focus on the group cell stays.
- Texts (5 keys x 3 languages in `-columns`, the sheet's table): see Q8-1 on size.
- Chooser: `inClosedGroup` set = `columns.folded`; the column row stays ticked (not user-hidden) and the description joins `chooser.inClosedGroup`; the group row still has no tick and does not fold (sheet choice 1). Ticking/unticking never touches group state ("Tout afficher" neither). The chooser listens to `columnsChanged` already; a toggle from the header re-syncs it live. Unticking the last shown column stays refused (count uses `visible()`, which excludes folded ones).
- Menu "Reinitialiser les colonnes": also `groups.reset()` (one extra `fold`, same gesture, one sentence); its disabled test adds `|| groups.state()` non-empty. Menu looks the api up like it looks up `cols`/`chooser`; absent spans: unchanged.

## 2. Bytes per entry (budget lines; read real values in `size-budget.json` and measure first, minified, quiet machine)
| Entry | Budget now | Grant | This step | Stop |
|---|---|---|---|---|
| `@dzgrid/core` base | 29 000 (seam guard 28 930) | 29 150 | +40-80 | 120, then owner |
| `@dzgrid/core/spans` | 3 800 | none | +200-280 (measure was ~3 440-3 460) | 3 800 |
| `@dzgrid/dom/spans` | 4 950 | 5 300 (Q-B) | +450-650 (measure ~4 455) | 5 300 |
| `-columns` texts en/fr/ar | 530/630/800 | 550/650/850 (Q6-6) | +60/+70/+90 est. vs room 38/36/104 | Q8-1 |
| `@dzgrid/dom` base | 21 980 | 22 400 | +0-20 | measure |
| `dom/columns-panel`, `dom/column-menu` | 4 400 / 4 300 | | +20-40 each | their lines; ask before exceeding |
Raising `size-budget.json` is the step's gate only after the owner writes it; the architect changes nothing now.

## 3. Tests to write FIRST (each red before code)
Core (node): `core/test/columns-fold.test.ts` (`fold` hides, never touches `state()`/`hidden`; re-showing a user-hidden column leaves the group alone; user-hidden stays hidden when the group opens; refuses folding the last shown column; `version`/`dataVersion` bump; idempotent fold = no change); `core/test/spans-groups.test.ts` (table: nested, `groupShow` open/closed/absent, non-collapsible group ignores `groupShow`, empty-closed -> first child + one warning, duplicate/empty ids as `headerBands`, split group by pin keeps one state, `diffState` only differences); conformance `conformance/cases/header-bands/collapse-{closed-keeps-listed,nested,pinned-split,user-hidden-kept,empty-closed,all-folded-refused}.json` (hand-written expectations: shown ids and band fragments); rewrite `grid-state/groups-before-step-8.json` into `groups-restore.json` + `groups-unknown.json` (unknown id -> `state-group`, non-collapsible -> `state-group`, wrong type -> `state-field`; capture writes differences only; restore is one fold, one request on a server grid) and a property test: a state with groups restores identically LTR/RTL.
DOM (jsdom, `dom/test/spans-collapse.test.ts` and companions): button present only on collapsible groups, `aria-expanded`/name/text-node survives repaint; click toggles once and does not sort or move focus; Enter and Space on the group cell toggle, on a non-collapsible one do nothing, Alt+Up/Down nothing; focus fallback (header, body cell, group cell stays); polite sentences with counts; split group = two buttons, one state; `columnsChanged` source `user` once per toggle; `stateChanged` fires; `setState` with `groups` calls one fold and says nothing; defs replaced: overrides kept by id, unknown dropped; chooser shows `inClosedGroup`, stays live, "Tout afficher" leaves groups alone; menu reset restores groups and is enabled when only groups differ; column move while a group is closed (keyboard and `api.move`): order numbers among shown columns, folded ones keep their order slot (as hidden ones do), group headers have no drag handle (O4); resize of a shown column in an open group, then close/open: widths kept (sheet 14); column menu "hide" on the only closed-visible child still allowed unless it is the last shown one; RTL: chevron class/mirroring and sentence text via `-columns` ar; texts: three languages carry the 5 keys (existing locale parity test).

## 4. Mutants (pure core logic only, run once by the combined reviewer, ~15)
`foldedColumns` (open/closed inversion, `groupShow` branches, nested any/all, empty-closed first-child fallback, non-collapsible ignore), `diffState` (equal-to-definition kept/dropped), `ColumnModel.fold` guard (last-shown refusal, filter conjunction with `hidden`), the restore groups branch in `core/state` (collapsible check, boolean check). No mutants on DOM code.

## 5. Browser checks (touched groups only, Chrome headless, one browser at a time; add a `groups` check group in `scripts/browser.mjs` on `hr.html`, or extend `--only spans` if one exists; run `--only groups` plus `--only playground` if the demo changes)
Chrome fr light and ar RTL dark: closed group narrows its band and shows the listed columns; open restores widths; 1 px alignment of group cells with column headers after toggle, in pinned start/end bands and a group split by a pin; horizontal scroll with a closed group; the 24x24 hit box (`getBoundingClientRect`), `aria-expanded`, chevron side in RTL, forced-colours emulation outline; keyboard Enter/Space on the group cell and focus fallback in the real DOM; header drag of a column near a closed group; keyboard resize mode still works on a shown column; chooser and menu "Reinitialiser" in the same page; no page error. **Firefox and WebKit** (`--engine firefox|webkit --only groups`, once): only Enter/Space on the group cell (key events and focus), RTL chevron mirroring and band alignment. `check:contrast` for the chevron pair if a new colour variable appears (prefer existing `--dzg-*`). Demo: `hr.html` gets a collapsible "Identite" group (a `?groups=` switch as the others), after which STATUS.md and this file's "Done" are updated.

## 6. Order of work
Tests red -> `core/spans` table/fold/diff -> base `fold` seam (+ measure core base now) -> dom/spans state, api, kernel-slot -> button/band text node/CSS -> keys + focus fallback + sentences -> texts fr/en/ar -> `core/state` adapter wiring and conformance -> chooser `inClosedGroup` -> menu reset -> demo -> browser -> size measure -> mutants. Gate: `build`, `typecheck`, `test:ci`, `check:size`, `check:contrast`, Chrome `--only groups`.

## 7. Risks
1. `textContent` writes in `bands.ts` erase the button; a re-keyed group cell (`keyOf` uses the first column id) when the first leaf folds loses DOM focus: key must stay stable (use the group id and its first *definition* leaf, or restore focus via `pendingFocus`, as the header already does).
2. Virtualised group cells: a group crossing the window edge is drawn from its first column; folding changes the count and window; check the `keep` focused-group logic in `paint`.
3. Base bytes: `emit` from dom vs a kernel command (see 1); `stateChanged` must fire from the emitted `columnsChanged` (subscribed in `dom/state` `SAVED`).
4. Fold + user-hidden can leave zero shown columns: the refusal inside `fold` is silent; the sheet's "closed group with no listed child" case has its own warning; test the combination.
5. Server grids: a fold changes `dataVersion` (shown set) and may refetch; restore wraps in the existing `rows.hold`: check one request per restore and none per toggle on a client grid.
6. aria: button `tabindex=-1` means a keyboard user relies on Enter/Space on the cell; the cell must expose a name carrying the state (sheet 9) and the listening test is scheduled (21, 158-160), never marked validated before.
7. Auto-size "toutes" and CSV/print read `visible()`, so they follow the fold; verify one test each (sheet 14-15) without new code.
8. Closing a group while a range/fill block or an edit is active on a folded column: the range feature must clear or clip (test; if it needs code, report).

## 8. Owner questions (simple French)
**Q8-1. Textes: place.** Les cinq phrases des groupes (nom, ouvert, ferme, annonces) font environ 60 / 70 / 90 octets de plus; il reste 38 / 36 / 104 sous les plafonds accordes de `-columns` (550 / 650 / 850). Options : (A) monter les plafonds a 600 / 720 / 900 *(recommande, c'est 50 octets de texte par langue)*; (B) raccourcir : garder `group.toggle` et `group.closedSaid` / `openedSaid`, retirer `group.open` / `group.closed` (l'etat ne serait dit que par le bouton, pas dans le nom de l'en-tete); (C) un lot de textes a part `-groups`, charge seulement avec les groupes.
**Q8-2. Cote base du coeur.** Le cout vise reste 40-80 o. Si la grille doit emettre l'evenement par une commande du noyau (au lieu de l'emettre depuis `dom/spans`), cela ajoute 40-60 o (total < 150, sous les 220 de marge). Options : (A) emettre depuis `dom/spans`, sans commande *(recommande)*; (B) commande du noyau, si le test montre que A ne declenche pas la sauvegarde. Reponse seulement si on depasse 120 o.
**Q8-3. Fermer un groupe efface-t-il la selection ou le bloc de cellules sur une colonne repliee ?** (A) le bloc est reduit aux colonnes restantes, sans message *(recommande)*; (B) le bloc est efface; (C) la fermeture est refusee tant qu'un bloc touche la colonne.

## Done (2026-10-27; built, not committed, no review yet)

First pass stopped on sizes (`dom/spans` 5 845 / 5 300; the Q8-3 shrink would take `dom/range` to 5 062 / 4 950;
`core/edit`, `core/server`, K.8 pushed by compression). Owner answers: **Q8-4** (the fold UI in its own entry
`@dzgrid/dom/groups`), **Q8-3 revised** (a fold clears the block, no shrink), **Q8-5** (`core/edit` 3 150, `core/server`
6 200, K.8 guard 84 000). Then finished.

**What is built**
- Core base seam: `ColumnModel.folded` / `fold(ids)` (the `shown` filter skips folded ids; a fold leaving no column shown
  is refused, O1; `state()` and `hidden` untouched). **+35 B** (28 930 → 28 965; seam guard in `layering.test.ts`).
- `@dzgrid/core/spans`: `groupChains` (the walk, shared with `headerBands`), `groupTable`, `foldedColumns`, `diffState`.
  Rule as the plan: a column is folded when some collapsible group above it does not show it in its state (`groupShow`
  read against every collapsible ancestor); a group with nothing for its closed state keeps its first child, warning
  `invalid-column-group` / `empty-closed` at the tree path `columns[i].children`.
- `@dzgrid/core/state`: a restore with `groups` always replaces the grid's (`{}` brings the definitions back).
- `@dzgrid/dom/spans` (group rows only): the label in a text node, `data-g` on a group header, two context seams (types
  only in the base): `g.groupBands.find(id)` (row and label) and `g.groupCell(el, id, label)` at each paint.
- **`@dzgrid/dom/groups`** (new entry, Q8-4): `groups()` with `api(grid)` → `GroupsApi` (`collapsible`, `isOpen`,
  `toggle(id, open?, { say, user })`, `reset`, `get`, `set`), also `GridContext.groups` for `gridState()` and the menu.
  Button `button.dzg-gtoggle` (`tabindex=-1`, `aria-expanded`, `group.toggle`) at the inline end, header name
  `group.open/closed`; Enter/Space on a collapsible group header; the press never takes the focus nor reaches the
  header (capture listeners); focus fallback (11); one `columnsChanged` per change after an empty `column.state` (rows
  and focus synced, no kernel command, Q8-2); sentence `group.closedSaid/openedSaid`; its CSS injected by it
  (chevron with logical borders as the tree's, angle mirrored in RTL, `ButtonText` in forced colours). Needs the
  `-columns` texts (`TypeError` at setup). Without `groups()`, `collapsible` does nothing (tested).
- `gridState()` reads the groups lazily. With `persist` at creation, list `groups()` before `gridState()`.
- Chooser: ticked = not hidden by the user; `chooser.inClosedGroup`; « Show all » leaves groups alone; `canHide` treats a
  folded column as shown. Menu « Reset columns »: also `groups.reset({ user: true })`, enabled when only a group differs.
- Block of cells (Q8-3 revised): cleared by a fold, as by any change of the shown columns (0 B in `dom/range`; tested).
- Texts (Q8-1): `group.*` and `chooser.inClosedGroup` in en/fr/ar `-columns`.
- Demo: `playground/spans.html` section 4, « Patient » collapsible (box « Patient repliable », fr / ar by « Données »).
  The page imports the entry by path (no alias added to `vite.config.ts` while 4700 runs).

**Tests written first, each seen failing for the right reason**
- `core/test/columns-fold.test.ts` 8 (`fold` not a function); `core/test/spans-groups.test.ts` (`groupTable` not a
  function); conformance `header-bands/collapse-{closed-keeps-listed,nested,pinned-split,user-hidden-kept,empty-closed,all-folded-refused}`
  and `grid-state/groups-{restore,unknown}` (replacing `groups-before-step-8.json`); `core/test/state-review.test.ts`
  « groups: {} » (red with the old `if (open.length)`).
- `dom/test/spans-collapse.test.ts`: 21 of 24 red at first (the modifier guard and the text-node test passed; the latter
  strengthened); then the entry tests red (`../src/groups.js` missing); size lines red before `size-budget.json`
  (`-columns` 600/720/900; `dom/groups` 2 100; `core/edit` 3 150, K.8 84 000 also in `layering`/`motion-seam`).
  `dom/test/spans-collapse-elsewhere.test.ts` 6 of 7 red (O4 grip guard passed first).
- Adjusted: `columns-chooser-texts` key list, `spans-fixes` CSS reader (a `@media` rule).

**Sizes (gz)**
| Entry | Measure | Line |
|---|---|---|
| `@dzgrid/core` | 28 965 (seam +35) | 29 000 |
| `@dzgrid/core/spans` | 3 784 | 3 800 |
| `@dzgrid/core/state` | 1 490 | 1 500 |
| `@dzgrid/core/edit`, `core/server` | 3 113, 6 159 | 3 150, 6 200 (Q8-5) |
| `@dzgrid/dom` | 21 855 (+0) | 21 980 |
| `@dzgrid/dom/spans` | 4 567 (+102) | 4 950 |
| `@dzgrid/dom/groups` | 1 893 (owner estimate ≈ 1 400) | 2 100 (measure + 10 %, Q8-4) |
| `-columns` en / fr / ar | 589 / 708 / 876 | 600 / 720 / 900 |
| `dom/state`, `dom/column-menu`, `dom/columns-panel`, `dom/range` | 1 098, 4 090, 4 356, 4 929 | 1 150, 4 300, 4 400, 4 950 |
| profile K.8 | 83 521 | 84 000 (Q8-5) |

**Browser** (`--only groups`, real `spans.html` on 4700): Chrome 20 / 20 (fr light, ar dark: 24 × 24 at the inline end,
split group two buttons, click closes without taking the focus, a focused Âge header goes to « Patient », 1 px
alignment after each toggle and scrolled sideways, widths back, Enter / Space, chevron angles, the sentence, forced
colours `ButtonText`, no page error); Firefox 18 / 18, WebKit 18 / 18 (same minus forced colours). Not checked in a
browser: header drag next to a closed group, keyboard resize, chooser and menu on the same page (jsdom only; the demo
page has no `columns()`).

**Gate (`caffeinate -i`, 2 workers; Node 24.22.1 — the machine's Node moved from 22 meanwhile):** `typecheck`, `build`,
`check:size` (0 over), `check:contrast` (1 062 pairs, 0 below) green; `test:perm` 5 files / 10 tests green (149 s);
`test:ci` first run 10 red — guards pinning the old lines and shapes (`rebudget` ceilings and history, the core/spans
export list, the DOM rule « only spans imports core/spans ») — updated with the owner's Q8-1/Q8-4/Q8-5 (a new step-7
rebudget test first, red), then **447 files / 6 843 tests green** (232 s). No orphan worker.
