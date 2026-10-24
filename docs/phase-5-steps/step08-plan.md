# Phase 5, step 8 — undo/redo in the DOM, trees, details, nested grids: blueprint (architect, 2026-10-24)

Status: **done, not committed** (2026-10-24; owner S8-O1…O6; « Done » at the end). Read at the step-7 head (not committed): CLAUDE.md,
CLEANROOM.md, STATUS, `phase-5-plan.md` §3 step 8, D10–D13, `decisions.md` (wins: Q11, Q13, O7, O10, S2-O4),
`step02…07-plan.md` Done/Review, sheets `edit-undo`, `editing`, `tree-keys`, `tree-view`, `master-detail`, `editors`,
`core/src/edit/*`, `dom/src/{edit,editors,tree,detail}/*`. Clean room: behaviour from the sheets and public docs only;
key matching from the UI Events `key`/`code` specs.

## What is already built (do not redo)
- `core/edit`: undo/redo stacks (100), skip rules (row not held, not editable, value changed, refused), batch moves
  even when all skipped, `UndoResult { cells, skipped }` (first cell = focus target), `undoChanged`, stacks cleared by
  `destroy()` (one controller per kernel). **Frozen at 3 098 / 3 100: this step needs 0 core bytes.**
- `dom/edit`: `EditApi.undo/redo/canUndo/canRedo` — raw pass-through, no keys, no focus, no sentence.
- `editableAt` refuses details, fillers, loading rows (core, conformance `editable/*`); `aria-readonly` on their cells
  (step 4); Tab steps over them (step 5); `*` on the tree column never starts an edit, elsewhere it does (step 5).
- Tree keys hook returns false unless `owner === 'cell'` (so a field's Left/Right are the field's) — **not pinned by a
  test with a real field**. `lockColumns` + `edit-structure` in the core (step 2); **no `tree({ structure })` yet**.
- Nested: each inner grid its own kernel → its own controller (`edit()` keeps a `WeakMap` per kernel); keys filtered by
  `closest('.dzg') !== root`; the nested part's Escape leaves only when `!e.defaultPrevented`.

## Findings (gaps this step owns)
1. No undo key anywhere; `api.undo()` neither focuses, reveals nor speaks (O10, edit-undo 8, 10).
2. Tree column: the field is `position:absolute; inset:0` (base `styles.ts:25`) — it **covers the indent and the
   chevron** (step-5 risk, D12).
3. `tree.nameOf` reads `col.read(data)`, not the overlay: « Ouvert : <old name> » after the name was edited.
4. A nested grid is **destroyed** when its panel goes (closed, scrolled away; `nested.ts` `destroy()`): its controller's
   `destroy()` aborts in-flight saves and drops pending ones (one warning) and its undo stack goes. Data-loss shaped (S8-O3).
5. Live region: a newer sentence replaces one not yet said (50 ms). An undo's own commit says `edit.saving` first, so the
   undo sentence must be one sentence that wins (lead: « Annulé : Stock » replaces it; the cell's description still
   says « Enregistrement en cours »; sheet edit-undo « save sentence follows » reworded).
6. Carried from step 7: the reveal test does not cover sticky parents (pinned columns only).
7. Carried from Phase 4 criterion 5: details not editable **or pasteable** — no test drives a paste on a detail.

## Where each piece goes (gz over its externals, estimates to measure)
| Piece | Entry | Est. | Now / ceiling | Ask |
|---|---|---|---|---|
| undo keys (`key`→`code`), run, focus + reveal, sentences, `api.undo/redo` through the same path | `dom/edit` (`edit/undo.ts`, new) | +190–250 | 3 741 / 3 750 | **3 750 → 4 000** (S8-O1) |
| `tree({ structure })`, path-mode default lock, re-lock when the tree column changes | `dom/tree` | +35–50 | ~3 682 / 3 700 | **3 700 → 3 800** (with the next two) |
| field after the indent and chevron (`--dzg-tree-pad` var + one rule in `TREE_CSS`) | `dom/tree` | +40–60 | | |
| `nameOf` through the overlay (`g.reader`) | `dom/tree` | +5–10 | | |
| nested grid kept alive while it saves (S8-O3 A) | `dom/detail` (`nested.ts`) | +80–120 | 3 826 / 3 900 | **3 900 → 4 000** only with O3 A |
| texts: 8 keys | `locales/{en,fr,ar}-edit` | +110 / +130 / +260 | 402/461/605 of 560/630/810 | ar likely over: **810 → 900** at the measure (S8-O1) |
| details, fillers, loading rows | none (core guard + tests) | 0 | | |
| `/editors` (Escape `preventDefault` audit only), dom base, core, `core/edit`, theme, `edit.css` | — | 0 | `/editors` 6 595 / 6 650 | none |
K.8 and the real example: 0 (no base change). Import graph unchanged (`dom/edit` never imports `/editors`; `dom/tree`
gains only `lockColumns` from `@dzgrid/core/internal`, already external).

## API (additions only)
```ts
// @dzgrid/dom/tree
interface TreeFeatureOptions<T> {
  /** Columns that feed the structure: read-only this phase (Q13, O7). Default: path mode → [the tree column];
   *  parentId / children → []. Given: replaces the default ([] unlocks the tree column in path mode). */
  readonly structure?: readonly string[];
}
// @dzgrid/dom/edit — EditApi (shape unchanged; behaviour widened, S8-O2 A)
undo(): UndoResult | null;   // as Ctrl+Z: one gesture (origin 'undo'), focus to cells[0] if shown, revealed, one sentence
redo(): UndoResult | null;   // as Ctrl+Y
// EDIT_KEYS += 'edit.undone','edit.undoneMany','edit.redone','edit.redoneMany','edit.undoSkipped','edit.redoSkipped',
//              'edit.nothingToUndo','edit.nothingToRedo'   (missing → the existing TypeError)
```
No new event (`undoChanged` exists; the demo's buttons read it). No option to turn the keys off (lead; an app that
wants none omits nothing — it can `preventDefault` in its own capture listener; say so in the sheet).

## Behaviour
**Undo keys (`dom/edit` `keys` hook, after `stale.keys`)**
1. Taken only when `owner` is `cell` or `header` and the event's `closest('.dzg')` is this grid (the router already
   filters nested); never `editor`, `cell-widget`, `filter-input`, `popup`, `outside`; not while `g.editor` is open
   nor while an open waits for its paint (typed-ahead text) — that state is read through the edit seam (`/editors`
   sets `g.editor` at once; if not, the wait is pinned by a test and the key ignored).
2. Modifier: `g.mac ? metaKey && !ctrlKey : ctrlKey && !metaKey`, and `!altKey` (AltGr = Ctrl+Alt on Windows,
   `getModifierState('AltGraph')` also refused).
3. Letter: `/^[a-z]$/i.test(key)` → `key.toLowerCase()`; else (not a Latin letter: Arabic `ظ`, Cyrillic, Greek…)
   `code` `KeyZ` → `z`, `KeyY` → `y`; else none. So AZERTY's Z (`key 'z'`, `code 'KeyW'`) undoes, AZERTY's W
   (`key 'w'`, `code 'KeyZ'`) does not; Arabic Ctrl+ظ on the Z key undoes.
4. `z` without Shift → undo; `z` with Shift → redo; `y` without Shift → redo; `y` with Shift → nothing (not taken).
   Key repeat allowed (each repeat one undo). Taken → `preventDefault` (also when there is nothing to undo).
5. Run (keys and `api.undo/redo`, one function): `r = ctl.undo(source)`; `null` → `edit.nothingToUndo`. Else the
   sentence: `n = r.cells.length`; `n === 1` `edit.undone {column}`, `n > 1` `edit.undoneMany {n}`; `r.skipped > 0`
   appends `edit.undoSkipped {n: skipped}` (one announce, space-joined; all skipped → that sentence alone). Redo the
   mirror (`redone`, `redoneMany`, `redoSkipped`, `nothingToRedo`). Source `user` from keys, `api` from the API.
6. Focus (O10): `cells[0]` when its row is displayed and its column visible → `focus.set` cell, `g.restoreFocus()`
   (a key: the grid already has the focus; the API: the focus moves into the grid, S8-O2 A),
   `g.ensureVisible(row, col)` — clear of pinned columns, sticky header rows, the filter row, sticky parents (WCAG
   2.4.11). Not shown (closed parent, filtered after a reapply, hidden column): undone, focus stays, sentence said
   (S8-O4 A). No field opens.
7. Undo never moves rows (K.14); may set `orderStale` as an edit. Saving marks, border, flash, refusal: as any gesture.

**Trees (`dom/tree`)**
8. `structure` → `lockColumns(kernel, ids)` at setup; path mode with no `structure` → the tree column (`column` or the
   first visible), re-locked in `afterRows` when that id changes (`lockColumns` with the same set does nothing).
   A locked column marked editable: the core's `edit-structure` warning (once), read-only, `aria-readonly`.
9. Field placement: the tree writes the level's padding into `--dzg-tree-pad` on the cell (its padding reads it); in
   `TREE_CSS`: `:where([data-dzg-editing]>.dzg-toggle~[data-dzg-owner=editor]){inset-inline-start:calc(var(--dzg-tree-pad) + var(--dzg-target-min,24px) + .125rem)}`
   — logical, mirrored in RTL, chevron visible and clickable while editing (a click: blur keeps the value — Q5 — then
   toggles). Fillers and loading rows never get a field (core).
10. Left/Right in the field: the field's (caret, by the text's direction); the tree never opens or closes (pin).
    `*` in the field types `*`; on the tree column cell it opens siblings; on another editable column it starts an
    edit (pins with a real tree, sticky and lazy on).
11. `nameOf` reads `g.reader` (the edited name is the one announced).

**Details, fillers, loading rows (D11, criterion 5)**
12. On a detail panel cell, a filler, a loading row: F2, printable, double click, double tap, Delete, Backspace,
    Space (no yes/no) → no field, no commit, no `cellEdited`; Enter on a detail still enters the nested grid / part;
    Escape from the nested grid still returns to the panel; a `paste` event on them → nothing taken (Part B's
    `planPaste` will step over them, step 10 re-pins); `api.commit` on a detail key → `refused` `read-only`; undo
    never targets them (their keys are not data).

**Nested grids (D13)**
13. Own controller, stack, keys, bubble, live region per grid; Ctrl+Z in the inner grid undoes the inner only, on the
    panel cell (outer) the outer only. Escape levels: field → closed (prevented, focus inner cell); next Escape → the
    panel cell (outer); next → outer's own (tooltip or nothing). Editing the master row never remakes or touches the
    inner grid (its stack and marks stay; `fixed()` unchanged since features stringify the same).
14. Panel going while the inner grid has an open field or a pending/saving cell (S8-O3 A): the field leaves by the
    `lost` path (text kept and sent); the grid is detached, not destroyed, until `dirty` is false (then destroyed as
    today, state saved to `memory`); if the panel comes back first, the same grid is re-attached (no second controller
    on the same rows). Its undo stack goes with the grid (sheet).

## Keyboard (ar: the same keys, nothing mirrored; Mac: Cmd for Ctrl, Ctrl+Z does nothing on a Mac)
| Where | Windows / Linux | Mac | Result |
|---|---|---|---|
| cell, header (no field) | Ctrl+Z | Cmd+Z | undo, focus to the cell, sentence |
| cell, header | Ctrl+Y, Ctrl+Shift+Z | Cmd+Shift+Z, Cmd+Y | redo |
| same, AZERTY | Ctrl+Z (key `z`, code `KeyW`) | Cmd+Z | undo; the physical KeyZ (`w`) nothing |
| same, Arabic layout | Ctrl+ظ (code `KeyZ`) | Cmd+ظ | undo (code used: key not Latin) |
| any | Ctrl+Alt+Z, AltGr+Z, Ctrl+Shift+Y | Cmd+Option+Z | not taken |
| field, list popup, date dialog, filter input, cell widget | the above | | the control's own |
| inner grid cell | Ctrl/Cmd+Z | | inner grid only |
| tree column field | Left / Right | | caret (visual direction of the text); never collapse/expand |
| tree column cell | `*` | | open siblings, no edit |
| inner field / inner cell / panel | Escape ×3 | | close field → panel cell → outer's own |

## Texts (`-edit`, sheet `edit-undo.md` table + `edit.redoSkipped`)
`edit.redoSkipped`: « Cannot redo {n}: the value changed since » / « {n} non rétablie(s) : la valeur a changé depuis » /
« تعذّرت إعادة {n}: تغيّرت القيمة منذ ذلك الحين ». `undoSkipped`/`redoSkipped` become plural objects (fr « 1 non annulée » /
« 2 non annulées »; ar five forms) — lead fix of the sheet's « (s) ». Owner: the Arabic reading.

## Files
`dom/src/edit/undo.ts` (new), `edit/index.ts` (keys chain, api through it, EDIT_KEYS), `locales/{en,fr,ar}-edit.ts`,
`part-texts.ts` (keys), `tree/index.ts`, `tree/styles.ts`, `detail/nested.ts` (O3 A), sheets `edit-undo` (15–18: built),
`editing` 2, 21 (built), `tree-keys`, `master-detail` (editing in panels, panel kept while saving), a11y §19 rows for
undo; `size-budget.json` + `scripts/rebudget.mjs` ceilings after S8-O1; playground (below). No core file.

## Tests first (jsdom unless said; each red before its code; touched files only while working)
- `edit-undo-keys.test.ts`: every row of the keyboard table (both `g.mac`), AZERTY/Arabic by `key`/`code`, AltGr,
  Shift+Y, repeat, prevented, owner `editor`/`popup`/`filter-input`/`cell-widget` ignored, header owner taken,
  waiting-open ignored; focus to `cells[0]`, `ensureVisible` clear of pinned column + sticky header + filter row +
  **sticky parents** (step-7 gap); hidden target → focus stays; sentences (1, many, skipped, mixed, nothing; redo
  mirror; replaces `edit.saving`); `api.undo()` same path, source `api`; `canUndo` after a refused gesture.
- `edit-undo-walk.test.ts` (random walk vs `support/edit-dom-oracle.ts` `move()`): 40 steps a seed — type+Enter,
  Delete, Ctrl/Cmd+Z, Ctrl+Y, Ctrl+Shift+Z (random layout: QWERTY, AZERTY, Arabic codes), API undo/redo, sort,
  filter, reapply, host update/remove, server answers out of order (success/refuse/network), field open + Ctrl+Z inside
  (grid unchanged), tree collapse/expand, a nested inner grid step. Invariants per step: shown values = oracle,
  `canUndo/canRedo` = oracle, focus = first undone cell when shown else unchanged, the sentence = oracle's, source rows
  deep-equal, 0 stale mark, no row moved before reapply. 300 seeds in test:ci (~3 s), 1 000 in test:perm.
- `edit-tree.test.ts`: `structure` locks (parentId given; path default = tree column; `[]` unlocks; first visible
  column changes → re-lock; `edit-structure` once); F2 on a locked cell nothing; field `inset-inline-start` var and
  rule present (CSS string pin; layout in the browser); Left/Right in the field: no `rows.expand`, `aria-expanded`
  unchanged (fr and `dir=rtl`); `*` three places; chevron click while editing keeps the value then toggles; filler and
  loading row: no field, Tab steps over, Delete nothing; edited parent's sticky copy shows the new value; `nameOf`
  says the edited name; undo onto a row under a closed parent → focus stays (O4 A).
- `edit-detail.test.ts` (criterion 5 carried): the D11 list on detail panel cells, fillers, loading rows (each key,
  dblclick, double tap, paste event, `api.commit` → `read-only`); Enter/Escape of the panel unchanged with
  `edit()+editors()` present.
- `edit-nested.test.ts`: two levels (orders → lines → lots), each with its own `edit()+editors()` (and one shared
  `edit()` object across masters: separate controllers): inner edit → no outer `cellEdited`, outer stack unchanged;
  Ctrl+Z inner/outer scoped; Escape ×3; printable/dblclick/bubble/live region per grid; master edited and saved → inner
  grid not remade, its stack kept; panel closed while inner saving → (O3 A) save completes, marks back on re-open, no
  second controller, destroyed after settle; (O3 C) one sentence.
- Texts: `edit-texts.test.ts` the 8 keys in en/fr/ar, plurals with `Intl.PluralRules`, `{column}` isolated in ar.
  Budget pins updated after S8-O1.

## Mutants (copy of the repo, deleted after)
`code` before `key` (AZERTY W undoes); `code` always; Latin test dropped (Arabic undo dies); Mac modifier swapped;
`altKey` allowed; owner check removed (Ctrl+Z in a field undoes); nested root check removed; Shift+Y redoes;
`preventDefault` dropped when nothing to undo; focus `cells.at(-1)`; `ensureVisible` dropped; focus moved to a hidden
row; skipped sentence when 0 / not when >0; nothing-to-undo silent; source `user` for API; path default lock removed;
`structure: []` ignored; re-lock on column change removed; field rule without the chevron width; tree hook `owner !==
'cell'` → `=== 'editor'`; `nameOf` raw read; field Escape not prevented (inner grid left too); O3 A: destroy while
dirty / re-attach skipped (two controllers). Expect ≥ 90 % killed; equivalents named.

## Browser (one browser at a time, closed after; never stop 4700; touched groups while working, full run once)
- New group `--only edit-undo` (Chrome, test page): CDP `Input.dispatchKeyEvent` with explicit `key`/`code`/modifiers:
  QWERTY Ctrl+Z/Y/Shift+Z, AZERTY (`z`/`KeyW` undoes, `w`/`KeyZ` nothing), Arabic (`ظ`/`KeyZ`), Meta on a Mac run;
  the focused cell after undo fully clear of the sticky header, a pinned column and two sticky parents (rects); live
  region text; the saving border then the flash after an undo; axe 0; fr light Clinic, ar dark Midnight; forced colours.
- `--only tree` extended: ar RTL dark — the field starts after the chevron (rects, both directions), Left/Right move
  `selectionStart` and never collapse, chevron click while editing, `*`, a locked column read-only; fr light.
- `--only detail` extended: Enter/Escape of the panel unchanged with editing on; inner grid edit + Ctrl+Z inner only;
  Escape ×3; panel scrolled away during a slow save then back (O3 A).
- Firefox and WebKit (`--all`): undo keys and the tree field placement in RTL.
- `--only playground` on the real pages (127.0.0.1:4700): `orders-edit.html` (fr, `?locale=ar-DZ&theme=dark&skin=midnight`,
  `?paged=1`): « Annuler » / « Rétablir » buttons (disabled from `undoChanged`, `aria-disabled`), Ctrl/Cmd+Z/Y, focus
  to the cell, the log line; `orders-edit.html?tree=1` and `detail.html` per S8-O5.

## Demo (owner's, extended; playground only, no vite config change)
`orders-edit`: two buttons « Annuler » / « Rétablir » (ar « تراجع » / « إعادة ») in the bar, enabled by `undoChanged`,
calling `api.undo()/redo()`; log lines « Annulé : … » / « Rétabli : … »; a bullet « Ctrl+Z / Ctrl+Y (⌘Z / ⌘⇧Z) ».
S8-O5: `?tree=1` — sub-orders as child rows (D4 shape, `parentId`), amounts and quantities editable in both levels, the
« Commande » column the tree column, `structure: ['parent']` shown locked with its tooltip; and/or `detail.html`'s
visits editable in their nested grid (own save, own undo, a slow-save switch to try the panel going).

## Risks
- The undo sentence replacing `edit.saving` (finding 5): by ear §19; if the owner wants both, one combined key.
- `key` on exotic layouts (Dvorak gives `z` elsewhere: by `key`, right); IME composing with Ctrl (keyCode 229) → not taken.
- Keep-alive (O3 A): a detached grid painting off-document (guard: no paint while detached), memory cap = `keep`,
  the master row removed while its inner grid saves (the save finishes, then destroyed; no sentence on a gone panel).
- `--dzg-tree-pad` replacing the inline padding: tree tests reading `padding-inline-start` move to the variable; the
  sticky copies use the same var (pin).
- `api.undo()` moving focus from an app button (O2 A): expected for spreadsheets; an app wanting otherwise uses B.
- `dom/edit` 9 B left today: nothing fits without S8-O1.
- Ar `-edit` plural forms likely over 810.

## Owner questions (réponses courtes ; ★ = recommandé)
- **S8-O1 Tailles.** Annuler/rétablir au clavier, le focus et les phrases coûtent ~+220 o dans `@dzgrid/dom/edit`
  (il reste 9 o) ; l'arbre ~+100 o dans `@dzgrid/dom/tree` (il reste 18 o) ; le texte arabe de l'édition passera
  sans doute 810. **A** `dom/edit` 3 750 → 4 000, `dom/tree` 3 700 → 3 800, `ar-edit` 810 → 900 si la mesure le
  demande ★ ; **B** annuler dans une entrée à part `@dzgrid/dom/edit-undo` que l'appli ajoute (rien ne monte sauf l'arbre) ;
  **C** sans les phrases « rien à annuler » et « non annulées » (~−60 o), même demande réduite.
- **S8-O2 Boutons de l'appli** (`api.undo()`). **A** comme la touche : le focus va à la cellule, la phrase est dite ★ ;
  **B** l'API annule seulement, l'appli gère le focus et le message.
- **S8-O3 Sous-grille qui disparaît** (panneau fermé ou sorti de l'écran) pendant un enregistrement. **A** elle reste
  en vie, cachée, jusqu'à la fin de l'enregistrement, et revient telle quelle si le panneau revient (+~100 o,
  `dom/detail` 3 900 → 4 000) ★ ; **B** pareil, et elle garde aussi son historique d'annulation (les 20 dernières
  sous-grilles restent en mémoire) ; **C** comme aujourd'hui : l'enregistrement est abandonné, une phrase le dit.
- **S8-O4 Annuler une cellule qu'on ne voit pas** (parent fermé, ligne filtrée après remise en ordre). **A** elle est
  annulée, le focus ne bouge pas, la phrase le dit ★ ; **B** on ouvre ses parents pour y aller (arbre, ~+40 o) ;
  **C** elle est sautée (« non annulée »).
- **S8-O5 Démo.** **A** l'arbre modifiable dans `orders-edit` (`?tree=1`, sous-commandes) ; **B** les visites
  modifiables dans les sous-grilles de `detail.html` ; **C** les deux, plus les boutons Annuler/Rétablir ★.

## Done (2026-10-24, not committed; owner S8-O1…O6)

**Built.** `dom/edit`: undo and redo in the router's `keys` hook (after the stale mark's F2) — Ctrl, or Cmd on a
Mac, alone (never both, never Alt or AltGr); the letter from `key` when Latin, else `code` (`KeyZ`, `KeyY`); Z
undoes, Shift+Z and Y redo, Shift+Y nothing; taken on a cell, the scroller or a header whose focused cell is
mounted (an editor waiting for its paint leaves the key to the browser, S8-O6), prevented even with nothing to
undo; `api.undo()` / `api.redo()` the same `run` (S8-O2, source `api`): one sentence (undone / many / skipped /
nothing), the focus to `cells[0]` when shown (`focus.set` then `restoreFocus`: revealed clear of pinned columns,
sticky header rows and sticky parents), else it stays (S8-O4); a field open keeps the focus; `EditSeam.busy()`.
Texts: 8 keys en/fr/ar (fr, ar plural objects; ar `{column}` isolated). `dom/tree`: `tree({ structure })`
(`lockColumns`; default a path tree's own column, re-locked in `beforeRows` when it changes), `nameOf` through the
edits, `--dzg-tree-pad` on the cell. `edit.css`: the field after the indent and the chevron (`--dzg-tree-at`), the
other side when the field's own direction (`dir=auto`) is not its cell's (`:dir()`; found in the Arabic browser
run: a Latin name in an RTL grid covered the chevron). `dom/detail`: a nested grid whose panel goes while busy (an
open field or a save) is kept alive off the page (its field left by a `focusout`, the lost path), destroyed when
idle, put back if its master's panel comes first. Demos (S8-O5): `orders-edit` « Annuler » / « Rétablir »
(`aria-disabled` from `undoChanged`; the log « Annulé : … »), the « Forme : arbre » selector (`?tree=1`: sub-orders
as child rows, « Commande mère » locked by `structure`), `detail.html` editable visits (Motif, Montant; a simulated
server that keeps what it saves; « Enregistrement lent (5 s) »).

**Tests that failed first** (on the step-7 code): the step-8 budget pin (red, then the ceilings), `edit-texts`
« undo and redo » (red), `edit-undo-keys` 34 / 48 (the 14 green by design: keys not taken, owners, a composition),
`edit-tree` 6 / 16 (10 pins green by design: Left/Right, `*`, the chevron click, fillers, loading rows, the sticky
copy, the undo under a closed parent), `edit-nested` 5 / 15 (the keep-alive ones; 10 pins green), `edit-detail`
0 / 11 (criterion 5: pins, green by design — the core already refuses details). Written after the code: the walk
`edit-undo-walk` (300 / 1 000 seeds; it reached 1 393 undo and 964 redo keys, 586 / 404 API, 85 hidden targets,
11 skipped, in 300 seeds), « api.undo() while a field is open » (red with the guard removed: found by the step-7
walk, whose undo stole an open field's focus), and 3 written for mutants (below). Old pins changed: none; the
step-4…7 budget pins follow S8-O1/O6.

**Mutants** (copy, deleted after): 41 — 36 killed at once, 1 by the existing nested-grid tests (the router's own
root check), 2 after new tests (Ctrl+Cmd+Z on a Mac; `api.undo()` from a button onto a hidden row pulling the
focus into the grid), 2 equivalent: the tree hook's `owner !== 'cell'` (`intentFor` already gives a widget no
move; a widget pin added anyway), the keep-alive's `root.remove()` (dead: the base removes the panel's box —
removed).

**Deviations.** Undo keys in the router's hook, not a listener (the typed-ahead wait is told by an unmounted focused
cell); the sentence joined with « Saving » (S8-O6); AltGr also by `getModifierState`; the field rule in `edit.css`
(not `TREE_CSS`, `dom/tree` had 5 B left) and without the chevron's 2 px margin (`edit.css` 2 197 / 2 200); `--dzg-tree-pad`
holds the whole padding expression (not the level alone); `api.undo()` never takes the focus from an open field;
the walk drives the nested grid's own edit and undo, not the outer grid's of a nested grid's panel cell beyond it.

**Sizes** (gz): `dom/edit` 4 125 / 4 150; `dom/tree` 3 795 / 3 800; `dom/detail` 3 989 / 4 000; `edit.css` 2 197 /
2 200; `-edit` texts 517 / 598 / 895 (560 / 630 / 900); `/editors` 6 595 (unchanged); dom 21 548 (unchanged); core
and `core/edit` unchanged.

**Browser.** `--only edit-undo` Chrome 20 / 20 (keys by CDP: QWERTY, AZERTY, Arabic, a Mac's Cmd; the border and
the flash after an undo; clear of the pinned column and the sticky header; below two sticky parents; axe 0;
forced colours; fr light Clinic, ar dark Midnight), Firefox 8 / 8, WebKit 8 / 8 (keys, the tree field right to
left); `--only tree` 72 / 72 (the field after the chevron both ways, Left/Right, the chevron while editing, `*`,
the structure read-only); `--only detail` 37 / 37 (Enter/Escape with editing, the inner undo, Escape ×3, a panel
scrolled away during a save then back: the same grid); `--only playground` 41 / 41 (the real pages on 4700).

**Gate** (once, `caffeinate -i`): typecheck, build green; `check:size` 0 over (K.8 82 411 / 83 500, angular 6 323);
`check:contrast` 798 pairs, 0 below; `test:ci` 358 files, **5 741 / 5 741**; `test:perm` 5 files, 10 / 10 (the undo
walk at 1 000 seeds); full browser **848 / 848** (tree, detail and the real playground pages included); `--only
edit-undo` 20 / 20, `--only editors` 75 / 75. Angular unchanged (no fixture run).

**For the owner.** By ear: §19 119, 124f, 124g (the joined sentence, the buttons, a hidden undo). The Arabic of the 8
texts. Look: the field after the chevron in Arabic with a Latin name (`orders-edit?tree=1&locale=ar-DZ`).

## Review (2026-10-24) — applied

Applied, tests first: (1) a kept grid is judged after the change's events are all told (a microtask) and stays alive
while a cell is refused (`EditSeam.busy()` 2 / 1 / 0): the app hears `saveFailed` off the page, a reopen shows the
refusal and its reason (`edit-nested` « …the save refused », red first); (2) kept grids let go when the grid around is
destroyed and, refused only, when their master row leaves the rows (still saving: once answered) — `nestedGrid`'s
part `drop(keep?)`, called by `detail()` at each paint and at its destroy (two tests, red first); (3) the undone and
the skipped sentences with a full stop between them (« Undone: Price. Cannot undo 1… »; the same in fr and ar); (4)
the paste case labelled a placeholder; (5) `getModifierState('AltGraph')` dropped (AltGr is Ctrl+Alt on Windows, AltGraph
without Ctrl on Linux, Option on a Mac: three rows pin it); `const now` kept (removing it costs 9 B); the
single-variable tree indent measured +5 B (not kept).

**Budget:** `@dzgrid/dom/detail` 4 092 / **4 150** (owner S8-O7; ceilings test first, red); `dom/edit` 4 146 / 4 150.

**Test analyser's gaps, all added** (`edit-undo-keys` « review gaps » 6, `edit-tree` 3, `edit-nested` 3): the scroller
focused with the focused cell scrolled away, AZERTY Ctrl+Shift+Z, 1 undone + 2 skipped and 2 + 1 (exact sentences), a
redo with one skipped, `api.undo()`'s `focusChanged` source `api`, a DOM gesture emptying the redo list; a children
tree unlocked, `--dzg-tree-pad` equal to the padding through collapse, sort and a host re-parenting; a filler's
`editable` and `commit`; a master renamed while its grid is off the page, closed-reopened-answered-closed-reopened
(a new grid), two masters kept and given back each to its panel. None failed on the code (the probe file read, not
moved). The analyser's « possible gap » (a refused grid off the page) is fix 1's test.

### Handover to step 10 (Part B, paste)
- `edit-detail.test.ts` « a paste on the panel's cell … placeholder until step 10 »: re-pin with the real paste plan
  (`planPaste` steps over details, fillers and loading rows; counted as skipped).

**Gate after the review** (once, `caffeinate -i`): `test:ci` **5 758 / 5 758**; `test:perm` 10 / 10; build, `check:size` (0 over),
`check:contrast` 798 / 0 green; typecheck red once (a test row's type in `edit-tree`), fixed (a cast) and green again;
full browser **848 / 848**; `--only edit-undo` 20 / 20, `tree` 72 / 72, `detail` 37 / 37, `editors` 75 / 75, `playground`
41 / 41; Firefox 8 / 8, WebKit 8 / 8. Sizes: `dom/edit` 4 146 / 4 150, `dom/detail` 4 092 / 4 150, `dom/tree` 3 795 / 3 800,
`edit.css` 2 197 / 2 200, `ar-edit` 895 / 900.
