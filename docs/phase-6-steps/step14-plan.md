# Step 14 plan: three small 1.1.0 options (fill in one direction, flash duration, tree without its chevron)

Sources: ROADMAP « 1.1.0 — additions asked by the owner after the Phase 6 close (2026-10-29) » (the owner's tree screen
screen: an editable tree), `docs/behaviors/fill.md` (11–25), `motion.md`, `tree-view.md`, `tree-keys.md`,
`packages/dom/src/fill/index.ts`, `motion-gsap/{index,run/index,run/flash,run/saves,run/guard}.ts`, `tree/{index,styles}.ts`,
`packages/theme/edit.css`, `check:size` run on 2026-10-29. ag-Grid's `fillHandleDirection` named as the behaviour seen,
nothing read (CLEANROOM.md). Plan only; nothing coded. Each option: sheet → tests first (red) → code → review → gate.

## 0. Facts that shape the plan
- **Fill** (`fill/index.ts`): every way goes through `fillTarget(box, to)` (core/range): the larger distance wins
  (rows on a tie) and picks one of four ways `down | up | end | start`. Callers: `aim()` (the dashed preview, drag and
  keyboard mode), `fillTo()` (drop, no-drag click, Enter of the mode, `api.fill`), and the « drag started » test in
  `track()`. The keys: the **keyboard fill mode** (Ctrl/Cmd+Shift+Enter, then arrows / PageUp/Down / Ctrl+Home/End,
  Enter, Escape; fill.md 15) and **Ctrl/Cmd+D** (down), **Ctrl/Cmd+R** (inline end) (fill.md 16), plus the column menu's
  « Fill down » / « Fill right » items (`column-menu/index.ts:189`, through `api.down/end({ user })`). Bulk (Ctrl+Enter,
  fill.md 17) has no direction. Indices are logical (visible column order), never pixels: RTL is free if we stay there.
- **Flash**: there is **no CSS-only value flash**. `edit/marks.ts` only has the refusal blink (1 s lock, CSS) and the
  saved check (1.5 s), not the flash. The flash is the motion chunk only: `tint()` in `run/flash.ts` — class
  `dzg-flash` + `--dzg-flash` tweened 1 → 0 in a hard-coded `duration: 0.6` (reduced motion: `delayedCall(0.6)`, mark
  still). `tint()` is shared by the live flash (`changed`) **and** the saved flash (`saves.ts:55`). The theme only reads
  `--dzg-flash` (dzgrid.css 433–437); no timing variable. Re-flash: `fresh()` keeps one mark per cell (row key, column)
  per 500 ms; after that a new `tint` restarts (`overwrite: 'auto'`; under reduced motion `guard.track` kills the old
  delayed call).
  *Already possible today*: `onCell(el, c, reason)` returning `false` and running the host's own GSAP tween
  (`delay: 3, duration: 1`). Clumsy (the host adds/removes `dzg-flash` itself, handles reduced motion itself) — fine as
  the 1.0.0 workaround in the docs, not as the answer.
- **Tree chevron**: the chevron is **already decorative**: `<span class="dzg-toggle" aria-hidden="true">`, never a tab
  stop (tree-view.md). `aria-expanded` (with `aria-level`, `aria-posinset`, `aria-setsize`) is on the **row**
  (`role="row"` in a `treegrid`), and the keyboard path is the tree column's own keys: forward opens, back closes then
  goes to the parent, `*` opens the siblings; **Enter and Space do not toggle** (they edit / select, tree-keys.md). Each
  user toggle is said in the live region. So hiding the chevron removes **only** (a) the pointer target and (b) the
  visual open/closed cue; screen reader and keyboard are untouched.
  *Almost possible today*: a host rule `.dzg-toggle{display:none}` wins over the layered `:where()` CSS, **but** the
  editor's field in the tree column is placed at `--dzg-tree-pad + --dzg-target-min` (edit.css 179–181,
  `.dzg-toggle ~ [data-dzg-owner]`): the field would sit 24 px off the text. Hence a real option.
- **Bytes** (check:size, 2026-10-29, gz): `dom/fill` 3 042 / 3 150; `motion-gsap` eager 593 / 700, run (lazy) 3 392 /
  3 500; `dom/tree` 3 821 / **3 850**; `theme/edit.css` 2 197 / **2 200**; `column-menu` 4 297 / **4 300**; K.8 audit
  profile 84 901 / **84 950** (it imports `dom/fill` and `motion-gsap` eager, not the tree, not the motion chunk).
  Angular wrapper: untouched (features are plain objects in `[features]`).

## 1. Fill in one direction — `fill(blocks, { along })`
### API
```ts
export interface FillFeatureOptions {
  readonly handle?: boolean;
  /** The one way a fill may go: 'row' = along the row (inline start / end, ← → in French, mirrored in Arabic);
   *  'column' = along the column (up / down). Default: both (today). */
  readonly along?: 'row' | 'column';
}
```
Logical words only ( `row` / `column`, never x / y / left / right). Default (absent) = today exactly. Any other value
(`'x'`, `''`, `1`): both ways, ONE `invalid-setting` warning per grid, path `fill.along`, detail `String(v)` (the
`range.maxPaste` convention), no throw. The owner's tree screen: `fill(blocks, { along: 'row' })`.

### Behaviour (new fill.md 26, written before the code)
- **One projection**, one helper `towards(b, p)` used by `aim`, `fillTo` and `track`'s start test: with `along: 'row'`
  the target's row is clamped into the source's rows (`top..bottom`), with `'column'` its column into the source's
  columns; then `fillTarget` as today. So:
  - a drag the forbidden way (straight down with `'row'`) has no target: the drag never « starts » (no dashed outline,
    no `data-dzg-filling`, no pointer capture), the release writes nothing, says nothing, the block stays the source;
  - a diagonal drag fills along the allowed axis only, by its own distance (B2 → E9 with `'row'`: C2:E2), even when the
    forbidden distance is larger (today it would fill down). This is « clamped to the allowed axis », not « refused »;
  - the no-drag click (click the handle, then a cell) and `api.fill(to)` follow the same projection.
  - auto-scroll during a drag stays as today (it may scroll the other way; the target cannot follow it).
- **Keyboard fill mode**: an arrow / PageUp / PageDown on the forbidden axis is taken (no page scroll) and does nothing
  (no move, no sentence); Ctrl+Home / Ctrl+End move only the allowed coordinate. Enter with no target writes nothing.
- **Ctrl/Cmd+D with `'row'`** (Ctrl/Cmd+R with `'column'`): not taken, as today when there is nothing to fill (the
  browser keeps its key); `api.down()` / `api.end()` return null for the forbidden one.
- **Column menu**: its « Fill down » item would stay enabled but do nothing (Q14-1). Recommended, 0 B: the recipe
  `columnMenu({ items: (col, defaults) => defaults.filter((i) => i.id !== 'fill.down') })`, written in fill.md and
  column-menu.md. Built-in disabling costs `column-menu` bytes (3 B of margin).
- Bulk edit unchanged.

### Files
`packages/dom/src/fill/index.ts` (option, warning, `towards`, the mode's two guards, `copy`'s guard);
`docs/behaviors/fill.md` (26); `column-menu.md` (recipe line).

### Tests first — `packages/dom/test/fill-along.test.ts` (support-fill grid 6 × 6, numbers; values written by hand)
1. Default (no option): drag B2 → C9 fills B3:B9 (today's rule, the guard of « default = today »).
2. `'row'`: drag B2 → B5 (straight down): no `data-dzg-filling` while moving, nothing written, no `fill.filled` said,
   block still B2:B2.
3. `'row'`: drag B2 (10) → C9: C2 = 10 only (one number repeats, fill.md 3); block B2:C2; nothing in rows 3–9.
4. `'row'`, RTL (`dir: 'rtl'`, ar texts): the pointer moving physically **left** from B2 by three cells fills C2:E2;
   moving right (toward inline start, column A) fills A2. Planted fault: a projection written in pixels / on `clientX`
   fails this test.
5. Keyboard mode `'row'`: Ctrl+Shift+Enter, ArrowDown ×2 → no `dzg-cell--fill` anywhere, `keydown` default prevented;
   ArrowRight ×2, Enter → C2:D2 written, one sentence. Same in ar with ArrowLeft ×2.
6. Keyboard mode `'row'`: PageDown does nothing; Ctrl+End → target column F, row 2 only.
7. Ctrl+D with `'row'`: `keys()` returns false, event not prevented, nothing written; Ctrl+R fills from the previous
   column. `api.down()` null, `api.end()` counts.
8. `api.fill({ row: B5 })` null; `api.fill(E9)` → C2:E2.
9. No-drag click with `'row'`: click the handle, then click D6 → C2:D2.
10. `'column'` symmetric: drag B2 → E2 nothing; B2 → C5 fills B3:B5; Ctrl+R not taken.
11. `along: 'x' as never`: both ways (case 1 holds), exactly one `invalid-setting` (`fill.along`, `'x'`) per grid.
12. Bulk with `'row'`: Ctrl+Enter over a 2 × 2 block writes the 4 cells.
Planted faults (each must turn one test red, checked by hand once): clamp `col` instead of `row` (3, 9); projection
skipped in `track` only (2: the drag would start); mode guard skipped (5).
Browser (Chrome, `--only fill`): the drag on `orders-edit.html?along=row` in fr and ar (the demo page reads the query
flag; no new page).

## 2. Flash duration — `motion({ effects: { flash: { hold, fade } } })`
### API
```ts
export interface MotionEffects {
  /** A changed value is tinted, held `hold` ms at full, then fades in `fade` ms. true = { hold: 0, fade: 600 }. */
  readonly flash?: boolean | { readonly hold?: number; readonly fade?: number };
}
```
Default (`true` / absent / `{}`) = today exactly (0 + 600). The owner's tree screen: `flash: { hold: 3000, fade: 1000 }`.
Bounds: each a finite number, `0 ≤ v ≤ 10 000` ms. Otherwise that field takes its default and ONE `invalid-setting`
warning per grid and field (path `motion.effects.flash.hold` / `.fade`, detail `String(v)`), no throw. Read in the
**chunk** (`start(o)` / `attach(g)`), so the eager part (K.8) does not grow; the warning comes when the chunk loads
(idle time), which the sheet says.
### Behaviour (motion.md, new bullet under « Value flash »)
- Not reduced: `--dzg-flash` set to 1 at once, held `hold`, then 1 → 0 in `fade` (one `fromTo` with `delay: hold/1000`,
  `duration: fade/1000`, `immediateRender` as today).
- Reduced motion: a still mark for **hold + fade** (4 s for the owner's tree screen; 0.6 s by default, unchanged), no fade (Q14-5).
- A cell changed again during the hold: the 500 ms cap is unchanged (a second change within 500 ms of the last mark is
  not re-marked, the running mark goes on); after it, the mark restarts at full with a full hold (the tween is
  replaced, never two on one cell). A value changing every second therefore stays lit.
- Pooled cells: a cell scrolled away or shown for another row loses its mark at once (guard, as today). None within
  150 ms of a scroll, at most 50 cells a paint: unchanged.
- The **saved flash** uses the same timing (one look, one option; Q14-6).
### Files
`packages/dom/src/motion-gsap/index.ts` (type only, 0 B), `run/index.ts` (read and check the two numbers once per grid,
put them on the `Scene`), `run/flash.ts` (`tint` uses them; doc comments). `docs/behaviors/motion.md`.
### Tests first — `packages/dom/test/motion-flash-time.test.ts` (support-motion: manual frames, `clock`, `stubMedia`)
1. Default: the flash tween has `duration() === 0.6` and no delay (today, guard of the default).
2. `{ hold: 3000, fade: 1000 }`: right after the paint `--dzg-flash` is `1` and the class is on; at timeline time 2.9 s
   still `1`; at 3.5 s strictly between 0 and 1; at 4.05 s the class and the variable are gone.
3. Reduced motion, same option: no tween; a delayed call of 4 s; at 3.9 s the mark is there, at 4.05 s gone.
4. Re-flash: a second update of the cell 200 ms later → no new tween (cap); 1 s later → the mark is back at `1` and is
   gone only 4 s after that second change.
5. Bad inputs, no throw, each field independent: `{ hold: -1 }`, `{ hold: NaN }`, `{ fade: 20000 }`, `{ hold: '3000' }`
   → default for that field, one `invalid-setting` each (paths as above), told once per grid even after 3 paints.
6. `{ hold: 0, fade: 0 }`: mark added and removed in the same tick, no error.
7. The saved flash (motion-saves support) with the option: same 3 s + 1 s.
8. Pooled cell: the flashed cell scrolled out at 1 s → its mark cleared at once, no tween left on the element.
9. `flash: false` still wins (no mark), the `onCell` hook still called.
Planted faults: seconds vs ms (`delay: hold` not `/1000`) turns 2 red; `hold` forgotten under reduced motion turns 3
red.

## 3. Tree without its chevron — `tree({ chevron: false })` (owner decision needed: Q14-2…Q14-4)
### Recommended API
```ts
export interface TreeFeatureOptions<T> extends TreeOptions<T> {
  /** false: no chevron drawn (the application shows the open state and gives the pointer its own way to toggle);
   *  the rows keep aria-expanded and the keys. Default true. */
  readonly chevron?: boolean;
}
```
### Behaviour (tree-view.md, new section « Without the chevron »)
- The toggle span is still written (same DOM shape, the editor's sibling rule keeps matching) but gets `data-off`;
  `TREE_CSS` adds `:where(.dzg-toggle[data-off]){display:none}`: no chevron, no 24 px slot (Q14-4), in the body and in
  the pinned parents' layer.
- **Unchanged**: `aria-expanded`, `aria-level`, `aria-posinset`, `aria-setsize` on the row; forward / back / `*` in the
  tree column (mirrored in Arabic); Enter and Space keep their grid meaning; the live sentences; `rows.expand` by the
  application (`grid.kernel.dispatch({ type: 'rows.expand', rows, expanded }, 'user')`, said like a click).
- **Indent kept**: `level × indent` stays (the hierarchy must stay visible; `indent` remains the app's knob).
- **The pointer way** (Q14-3, recommended A): any element in a row with the attribute `data-dzg-toggle` (e.g. the
  app's own icon inside its label part) toggles that row exactly as the chevron does: no selection, no row click, no
  focus move to another cell, works in the pinned parents' layer. One selector change in the existing click handlers
  (`.closest('.dzg-toggle,[data-dzg-toggle]')`); it works with `chevron: true` too. The app's element stays
  `aria-hidden` / not a button (one tab stop per grid, APG treegrid) — said in the sheet.
- **The app's duty**, written in the sheet: show the open / closed state visibly (WCAG 1.3.1 / 1.4.1) and give the
  pointer a way (WCAG 2.1.1 is already met by the keys). The grid cannot check either.
- Editor field: `edit.css` gains `.dzg-toggle[data-off] ~ [data-dzg-owner]{--dzg-tree-at:var(--dzg-tree-pad,var(--dzg-cell-padding-inline,.5rem))}`
  (also in `edit.unlayered.css` and the scss source), so the field starts on the text.
### Files
`packages/dom/src/tree/index.ts` (option, `data-off`, the selector ×2), `tree/styles.ts` (one rule),
`packages/theme/edit.css` + `edit.unlayered.css` + scss source, `docs/behaviors/tree-view.md`, `tree-keys.md` (one line:
« without the chevron, the keys are the same »), `editing.md` pointer (field place).
### Tests first — `packages/dom/test/tree-chevron.test.ts` (support-tree) and `packages/theme/test/edit.test.ts`
1. Default: the toggle has no `data-off`; `TREE_CSS` unchanged except the new rule (string contains it).
2. `chevron: false`: every tree-column cell's first child is `.dzg-toggle[data-off][aria-hidden=true]`, in the body and
   in the sticky layer; rows still carry `aria-expanded="false"` / `"true"` for parents, none for leaves.
3. Keys unchanged with `chevron: false`, LTR and RTL: ArrowRight (fr) / ArrowLeft (ar) opens « Service 1 », says
   « Service 1 expanded, 3 rows »; back closes; `*` opens the siblings; Enter does not toggle.
4. A click on an element `<span data-dzg-toggle>` inside a parent's cell (rendered by a part) toggles it, the row is not
   selected (`selection` mode `multiple`), the focus stays where it was; on a leaf: nothing; in the sticky copy: toggles
   the real row.
5. Indent kept: `padding-inline-start` = `calc(var(--dzg-cell-padding-inline, 0.5rem) + 32px)` at level 2 (indent 16).
6. Edit in the tree column with `chevron: false`: theme test asserts the new rule's selector and value; browser check
   (Chrome) that the field's inline start equals the text's (± 1 px), fr and ar.
Planted faults: the CSS rule dropped (6 red in the browser, 1 red in jsdom); `data-off` written on the detail chevron
too (a detail test stays green only if not) — the detail feature must not change.

## 4. Docs at the commit
Sheets above; `CHANGELOG.md` `[1.1.0]` « Added » (three lines); `docs/release-1.1.0.md` new section « Ajouté pour
l'écran arbre du propriétaire » (French, three bullets + the raised lines); ROADMAP ticks; `docs/phase-6-steps/decisions.md`
(answers Q14-*); STATUS top line.

## 5. Bytes (gz; estimates, measured at the end on minified code, never asserted)
| Budget | Now / line | After (est.) | Verdict |
|---|---|---|---|
| `@dzgrid/dom/fill` | 3 042 / 3 150 | ≈ 3 110 | fits |
| K.8 audit profile (imports `dom/fill`) | 84 901 / 84 950 | ≈ 84 970 | **over: owner raise** (→ 85 000, the project's criterion) |
| `motion-gsap` eager | 593 / 700 | 593 (types only) | fits |
| `motion-gsap` run (lazy) | 3 392 / 3 500 | ≈ 3 460 | fits (tight) |
| `@dzgrid/dom/tree` | 3 821 / 3 850 | ≈ 3 865 | **over: owner raise** (→ 3 900) |
| `@dzgrid/theme/edit.css` | 2 197 / 2 200 | ≈ 2 225 | **over: owner raise** (→ 2 250) |
| `column-menu` | 4 297 / 4 300 | 4 297 with the recipe (Q14-1 A) | fits; B needs a raise |
| `@dzgrid/dom`, core, Angular, theme base | — | 0 | unchanged |
Stop rule: past an owner-granted line, stop and ask; never raise a line alone.

## 6. Order of work
Three independent commits, each sheet → red tests → code → `check:size` → review: (1) flash (no owner question
blocks it except Q14-5/6 defaults), (2) fill, (3) tree after Q14-2…4. One gate at the end (vitest, typecheck, build,
check:size, Chrome `--only fill`, `--only tree`, `--only motion`).

## 7. Owner questions (simple French)
**Q14-1 — Remplir dans un seul sens : le menu ⋮.** Avec `along: 'row'`, l'entrée « Recopier vers le bas » du menu de
colonne ne fait plus rien.
- A (recommandé) : on ne touche pas au menu ; la doc montre comment retirer cette entrée (une ligne dans l'app). 0 octet.
- B : la grille grise l'entrée elle-même (+≈ 25 o sur le menu, il faut monter sa limite 4 300 → 4 350).

**Q14-2 — Cacher la flèche (chevron) de l'arbre.** La flèche n'est qu'un dessin : le lecteur d'écran lit l'état
« ouvert / fermé » sur la ligne, et le clavier (→ ouvre, ← ferme, `*`) marche sans elle.
- A (recommandé) : option `tree({ chevron: false })` ; la flèche disparaît, tout le reste (clavier, lecteur d'écran,
  annonces) reste pareil. L'app doit montrer elle-même si un groupe est ouvert (sa propre icône).
- B : ne rien ajouter ; l'app cache la flèche avec son CSS (mais le champ d'édition de cette colonne sera décalé de 24 px).

**Q14-3 — Ouvrir / fermer à la souris sans la flèche.**
- A (recommandé) : tout élément de l'app marqué `data-dzg-toggle` (par exemple son icône dans la cellule du libellé)
  ouvre / ferme la ligne comme la flèche : sans sélectionner la ligne. Quelques octets.
- B : un clic n'importe où sur la cellule ouvre / ferme (gêne la sélection et l'édition : déconseillé).
- C : rien ; l'app appelle elle-même `rows.expand` (la ligne peut alors être sélectionnée par le même clic).

**Q14-4 — La place de la flèche.** Sans flèche : A (recommandé) le texte se décale de 24 px vers le début (le retrait par
niveau reste) ; B on garde la place vide (les libellés restent où ils sont aujourd'hui).

**Q14-5 — Mouvement réduit.** Quand l'utilisateur demande moins d'animations, la marque ne s'efface pas en fondu : elle
reste fixe puis disparaît. A (recommandé) : fixe pendant attente + fondu (4 s pour l'écran arbre du propriétaire) ; B : pendant l'attente
seulement (3 s).

**Q14-6 — Le flash « enregistré ».** La même marque sert après un enregistrement réussi. A (recommandé) : même durée
pour les deux ; B : la nouvelle durée pour les changements en direct seulement (l'enregistrement garde 0,6 s).

**Q14-7 — Limites de taille.** Il faut monter : K.8 84 950 → 85 000 (le critère du projet), `dom/tree` 3 850 → 3 900,
`theme/edit.css` 2 200 → 2 250. D'accord ?

## Owner input (2026-10-29) — changes §3

The owner's tree screen shows three tables in one tree: each starts with a top-level node that is **always open** and has
**no chevron**; under it, the children may hold nested nodes, and **those keep their chevron** (they open and close).
So the chevron option is per row, not grid-wide, and it comes with « cannot be closed »:

- Proposed: `tree({ fixedOpen?: (row) => boolean })` — rows it answers true for are open whatever the saved / expand
  state, draw no chevron (no 24 px slot), and ← / `*` / `rows.expand(false)` / collapse-all leave them open;
  `aria-expanded="true"` stays on the row (it has children and they are shown). Every other parent row keeps today's
  chevron and behaviour. `chevron: false` (grid-wide) is then not needed for the owner's tree screen; kept as an open question only.
- Q14-2 / Q14-3 / Q14-4 are re-asked on this shape.
