# Step 12 plan: Angular and demos

Sources: phase-6-plan step 12, decisions.md (Q-B Angular 7 000 → 7 300; E5-5 inputs at step 12; Q-S2; Q3-4; « Back to Phase 6 »: 1.0.0 published, the close prepares **1.1.0**, so everything here is additive), step05-plan §6 (deferred Angular inputs, audit page), app-feedback (`[slot]` binding, Angular notes), the allergen-detector screen `products-list-dz.component.ts` (read only), `packages/angular/src/*`. Plan only; nothing built or measured here (no build, no test, no browser run).

## 0. Facts that shape the plan
- `DzGrid` today: 6 811 B gz against a line of 7 000 (grant 7 300). **K.8 is 84 449 / 84 450 and includes the whole Angular dist file** (`size-budget.json` profile, `shipped`): every wrapper byte lands 1:1 in K.8 and in the real example. K.8 has 1 B of margin. Hence question Q12-1.
- The last recorded real-example measure is 92 059 (Phase 5). Phase 6 base growth is not recorded: **step 0 = `npm run build`, `example:build`, `example:bytes`, write the number down** before touching anything. Estimate 93 500 against the 94 500 line.
- Features are plain objects in `[features]`; the wrapper finds them by `id` (`edit`, `range`, `fill`, `filters`). New ids: `state`, `pinned-rows`, `columns`, `column-menu`, `columns-panel`. The wrapper must NOT import any Phase 6 dom entry (a static import would charge every app): it reads them by id and types them with `import type` only.
- GridEvent already carries `stateChanged`, `stateRestored`, `densityChanged`, `columnsChanged`, `columnResized`, `selectionChanged`; the wrapper's `gridEvent` output already emits them all (untyped by name). Named outputs add typing and the zone entry only.
- Finding in the real app: `(selectionChanged)="onSelection($event)"` on `<dz-grid>` is **not an output** (the selection comes back through the `selected` model). Angular binds it as a DOM listener that never fires, strict templates do not complain, so the app's `selectedRows` stays empty (its handler also reads a `.rows` that the event does not have: the event is `{ selection: { mode, keys }, count }`). This is the biggest hand-written pain; section 1.5 fixes it.

## 1. API (all optional; 1.0.0 bindings untouched)
### 1.1 `state` and `stateChanged`
- `readonly state = input<GridState | null>()` (`import type { GridState } from '@dzgrid/core/state'`). `readonly stateChanged = output<Ev<T,'stateChanged'>>()` (joins `OUTS`, one string; goes through the existing `_hear` zone queue, so it reaches the host inside the zone).
- Needs `gridState()` in `[features]`; without it a set `state` tells ONE `missing-feature` problem per grid (path `state`, feature `state`), same pattern as `[save]`.
- Apply: an effect on `state()` calls the feature api's `setState(s)` outside the zone, `untracked`, **skipped when `canonical(state)` equals `canonical(api.state())`** (no echo: the usual `[state]="saved()" (stateChanged)="saved.set($event.state)"` loop never restores what it just received). `setState` never fires `stateChanged` (grid-state.md), its problems come back in `stateRestored` (already in `gridEvent`); a bad state is therefore never silent (it also needs no new output).
- **First value at creation: ONE server request.** Set before the grid is made, `state` must be restored before the first fetch. Mechanism to verify first (test A3): the wrapper's early feature gets `held: this.state() !== undefined`, then right after `createGrid` returns it runs `kernel.rows.hold?.(() => api.setState(s))`. Known catch: `gridState`'s setup always calls `g.rows.hold?.(() => {})` in its `finally`, which would release a wrapper-made hold before the wrapper's restore. Remedy, dom side, tiny and negative in bytes: release there only when `o.persist` (the only case that sets `held` itself). If the test shows two requests and the remedy is refused, fall back to « two requests, documented ».
- The `persist` option stays the way for the browser storage; `[state]` is for the page address or the app's own store. Both together: `persist` restores at creation, then `[state]` (if set) wins.
- Not an input and not a model: no `stateChange`/`stateChanged` pair to confuse. `[(state)]` is not offered.

### 1.2 `pinnedRows`
- `readonly pinnedRows = input<{ top?: readonly T[]; bottom?: readonly T[] }>()`. The initial rows stay in the feature (`pinnedRows({ top, bottom })` in `features`); the input is the live update: effect → `api.set(value)` when the identity changes (and at creation, after the first render). Omitted side kept, `[]` empties (the api's own rule).
- Template literals like `[pinnedRows]="{ bottom: [totals()] }"` are memoised by Angular as long as the signal does not change: documented; the recommendation is a `computed`.
- Without the `pinned-rows` feature: one `missing-feature` problem. Editing of the band is the existing `edit()`; the save payload's `pinned: 'top' | 'bottom'` arrives in the existing `save` input unchanged.

### 1.3 Density
- `density` is already an input (live through `update()`); nothing to add to it. New output `densityChanged = output<Ev<T,'densityChanged'>>()` (the user's choice in the ⋮ menu, the state restore, the api). One-way by design: after a user choice the grid owns the value; the app re-imposes by binding a NEW value (documented, tested). No `[(density)]` (a model would add an output `densityChange` next to `densityChanged`).

### 1.4 Column menu items « as a template » (decision: not built, see Q12-2)
`MenuItem` is `{ id, label, kind, checked, disabled, action }`: text only, no part slot, so an `ng-template` has nothing to render into. What the wrapper offers instead is the controller (1.5): `columnMenu({ items: (col, defaults, c) => […, { id: 'x', label, action: () => this.ctrl.grid() … }] })` in `features` is already typed, and `c.grid` (kernel handle) is there. A real template item would need a `part` field in `column-menu` (dom work, bytes): asked as Q12-2.

### 1.5 What the allergen app hand-wrote → the wrapper (all tree-shakable or ≤ 60 B)
| App code today | Wrapper |
|---|---|
| `(setup().chooser as ColumnsChooserFeature).api({ kernel })?.open(button)` (a fake grid object built from the kernel, a cast) | `DzgController.use(feature)`: `use<A>(f: { api(g: any): A \| null }): A \| null` = `f.api(grid)`; null before/after the grid. `ctrl.use(chooser)?.open(btn)`, `ctrl.use(pins)?.set(...)`, `ctrl.use(state)?.state()`. Typed from the feature object, no cast. |
| `print(…)` needs the grid instance | `DzgController.grid(): GridInstance<T> \| null` (the instance, same lifetime as `kernel()`); recipe `print(ctrl.grid()!, { title })` in the guide. No `dzgPrint` directive (it would import `dom/print` for every app: +1.6 kB; a directive in a later secondary entry point is a 1.2 idea). |
| `(selectionChanged)` that never fired; `.rows` that never existed | named output `selectionChanged = output<Ev<T,'selectionChanged'>>()` (+12 B) with the real shape `{ selection, count, source }`; plus **free function** `selectedRows<T>(ctrl)` returning the loaded data rows of the selection (only if `kernel.rows` offers a by-key read of the rows it holds; otherwise `selectedKeys` only and a doc note that server-paged rows outside the page are unknown). Tree-shaken when unused. |
| `c.column.def.ui?.data?.['colours'] as Record<string,string> \| undefined` | free function `uiData<D>(c): D \| undefined` (≈ 25 B, tree-shaken), exported for part contexts (`let-c` of any slot). No change of the core `ui` type (would break 1.0.0 typings). |
| `[slot]` as a binding, easy to forget | already documented; add a runtime dev tip: `DzgPart` with a `dzgPart` name that no column uses is already `part-unused`? (check; if not, nothing new: out of scope). Doc: a `ngc` strict-templates example of the right form. |
| row type `unknown` in `let-c` | doc pattern `ngTemplateContextGuard` cannot know the row: `let-c` then `rowOf<Product>(c)` is NOT added (a cast in disguise); the doc shows `ColumnDef<Product, …>` + `uiData`. |
| the app's own `localStorage.removeItem(key)` + remount to reset the layout | out of scope (a `gridState` « forget » is a dom/state matter, listed for the close's 1.2 ideas). |

New public names: `DzGrid` inputs `state`, `pinnedRows`; outputs `stateChanged`, `densityChanged`, `selectionChanged`; `DzgController.use`, `DzgController.grid`; functions `uiData`, `selectedRows`. Nothing renamed or removed; the version string is untouched until the close.

## 2. Backward compatibility with 1.0.0 (checked line by line)
- Inputs/outputs: only additions; every new input is `input<…>()` with undefined meaning « untouched »; no change to `KEYS` (the keys are the dom settings), so `_settings` and `update()` diffing are the same.
- `OUTS` gains three names; a template that listened to `(gridEvent)` still gets all events.
- `DzgController`: two new members; no existing signature changes. `peerDependencies` exact `@dzgrid/*` pins: the wrapper 1.1.0 pairs with dom/core 1.1.0 (the dom `state` tweak above ships in the same release).
- The dom tweak (release the hold only with `persist`): for a 1.0.0 app using `persist` nothing changes; without `persist` the extra no-op `hold` was already unobservable. Test C1 proves the old behaviour.
- A guard test lists the 1.0.0 public names (exports of `index.ts`, inputs/outputs of the compiled `ɵcmp`) and asserts they are still there (`packaging.test.ts` style).

## 3. Files and bytes (gzip)
| File | Change | Bytes (estimate; measure at the end, never assert) |
|---|---|---|
| `packages/angular/src/grid.ts` | `state`, `pinnedRows` inputs + 2 effects (one shared `find(id)` helper), 3 outputs in `OUTS`, early feature `held`, creation-time restore, `missing-feature` for both | +190 |
| `packages/angular/src/controller.ts` | `use()`, `grid()` | +45 |
| `packages/angular/src/helpers.ts` (new) + `index.ts` exports | `uiData`, `selectedRows` | 0 unused (tree-shaken); ≈ +50 if both used |
| `packages/dom/src/state/index.ts` | release hold only with `persist` | −5 to 0 |
| Angular total | | **≈ +235 → ≈ 7 050** against 7 000: line moves to the grant 7 300 only if needed, then to measure + 10 % at the close |
| K.8 profile | Angular share lands 1:1 | 84 449 → ≈ 84 690 (line 84 450, criterion 85 000): **Q12-1** |
| Real example (no URL state in the audit screen) | + Angular only | ≈ 93 500 + 235 ≈ 93 750 / 94 500 |
| Real example, URL state in the audit screen | `gridState` (core/state ≈ 1 500 + dom/state ≈ 1 060) | ≈ +2 600 → ≈ 96 300: over the line **and** K.8 over 85 000 (the K.8 profile names every `@dzgrid` value the example imports, `audit-profile.test.ts`) |
| Playground | none budgeted | — |
Stop rule for the implementer: if the Angular share passes 7 300, or the K.8 / real-example number passes what the owner granted, stop and ask. Never raise a line alone.

## 4. Example audit screen and the URL (`examples/angular-audit`)
Recommended shape (Q12-3, option B): the default audit screen and K.8 stay as they are; a second on-demand screen in the same build, `?screen=audit-url`, is the audit screen + `gridState()` + the address (`fromSearchParams(new URLSearchParams(location.search))` at creation, `toSearchParams(state)` written with `history.replaceState` from `(stateChanged)`, the `lang` parameter preserved, filters and search left out by default: O6). It is lazy-loaded like `stock`, so `example:bytes` reports it apart as « (5) audit with its address » (no ceiling until the owner sets one at the close), and (1)–(4) are unchanged except for the Angular growth. `scripts/example.mjs bytes` prints the new line; `perf/test/example-bytes.test.ts` records it; `audit-profile.test.ts` gets a second profile « audit + state » listed apart (not K.8).
Option A (state on the default audit screen) is in Q12-3.

## 5. Playground pages (not budgeted; keep `--only demos` and `--only playground` green)
- `orders.html` (`demos/orders.ts`, `mountOrders`): new opt-in `o.tools`, ON for `orders.html`, OFF for `orders-edit.html` (the edit tests count header hit areas and the ⋮ button would shift them). Adds `columns()`, `columnsChooser()`, `columnMenu({ use: { columns, chooser, range, fill }, density: true, onDensity })`, `gridState({ persist: { key } })` and a `?state=` address round trip (the existing `state.ts` helpers), buttons « Colonnes » (opens the chooser), « Densité » (3 buttons driving `setDensity`) , « Réinitialiser », « Imprimer » (already there), `-columns`/`-column-menu` texts in fr/ar. The tree (sub-orders) with moved/hidden columns: a check that the tree column cannot be hidden (`hideable: false` is already a rule?) — verify, else mark that column `hideable: false`.
- `hr.html` (`demos/hr.ts`): column groups (« Identité » over employee/dept/country, « Emploi » over hired/salary/status) with `groups()` collapsible; a long « Équipe » column with `wrap: true` + `autoHeight()` (wrapped department/role text; fixed `HR_ROW` is replaced by auto for that column only: `rowHeight` wins, so remove `rowHeight` from the page and test `?fixed=1` to keep the old look); a bottom pinned totals row (headcount, payroll) made **editable** through `edit()` + `editors()` (the « Budget » cell, a number, saved by the page's fake save; the tree's sticky parents ≤ half the view). Risk: pinned bands + tree sticky + `initial: 2` together are untested (step 9 Q9-5 covers sticky height, not the pair): the first browser check on this page decides the layout, nothing in the lib changes in this step.
- Both pages get a one-line « what to try » list (fr/ar like the others) and the `?lang=ar` flip.

## 6. Tests FIRST (red before code)
### A. `packages/angular/test` (jsdom, zoneless)
1. `state-inputs.test.ts`: `[state]` restores order/width/sort at creation (client rows); a later new value restores again; the same value (`canonical`-equal, also the one just emitted) does nothing; `stateChanged` fires once per gesture after the debounce with `source: 'user'`, never for a host restore; without `gridState()`: one `missing-feature`; a bad state: `stateRestored` carries the `state-*` problems, grid usable.
2. Echo loop: `[state]="s()" (stateChanged)="s.set($event.state)"` settles (spy on `setState` calls = 0 after the emission).
3. A3 (the mechanism test): server source with a request counter and `[state]` (sort + filter + page) at creation → **exactly 1 request**, with the filter and sort in it. Red first; decides the dom remedy of 1.1.
4. `pinned-inputs.test.ts`: `[pinnedRows]` at creation and live (identity change redraws; same identity no work); `[]` empties one side; edit of a pinned cell reaches `[save]` with `pinned`; no feature: one `missing-feature`.
5. `density-output.test.ts`: menu choice (columnMenu `density: true`) fires `densityChanged` once, `source: 'user'`; the bound `density` stays the old value and a re-binding of a NEW value applies; state restore of a density fires it.
6. `controller-use.test.ts`: `use(feature)` returns the api after `gridReady`, null before/after destroy and on the server render; `grid()` same; `use(chooser).open()` with no cast.
7. `selection-output.test.ts`: `selectionChanged` output typed, fires for a click on the box, for the select-all; `selectedRows` returns the loaded data rows (client) and the keys for rows not held; the 1.0.0 `selected` model still agrees (no double echo).
8. `helpers.test.ts`: `uiData` returns the `ui.data` bag typed, undefined when absent; tree-shake test: a bundle of `DzGrid` alone (esbuild) contains neither helper.
9. `compat-1-0.test.ts`: the 1.0.0 export list, input names and output names (a fixed array copied from 1.0.0's built `.d.ts`) are all still present; a host using only 1.0.0 bindings compiles and behaves with no new problem.
10. `strict-templates.test.ts` (compiled by `ngc -p packages/angular/tsconfig.spec.json --noEmit`, the `typecheck` script): a host with `[state]="s"`, `(stateChanged)="s = $event.state"`, `[pinnedRows]="{ bottom: rows }"`, `(densityChanged)="d = $event.density"`, `(selectionChanged)="n = $event.count"`, `<ng-template dzgPart="x" [slot]="'filterOption'" let-c>` with `uiData<Record<string,string>>(c)`. Negative cases (must fail to compile, kept as a script step with `ngc` expecting exit 1 on a scratch copy): `[state]="123"`, `[pinnedRows]="{ middle: [] }"`, `(stateChanged)="n = $event.nope"`. Why: strict templates must not widen (`any`) the new members.
### B. `packages/angular/test-zone` (own vitest project, zone.js)
11. `state-zone.test.ts` (patterned on `zone.test.ts`): `stateChanged` output runs **inside** the Angular zone (`NgZone.isInAngularZone()` true) and updates a plain host field without `detectChanges`; the 300 ms debounce timer is armed **outside** the zone (`fixture.whenStable()` resolves while it is pending: zone not kept unstable); a `[state]` restore runs outside the zone (a `NgZone.onMicrotaskEmpty` counter stays flat); a burst of gestures makes one `stateChanged` and one zone entry (the `_q` batching); `densityChanged` and `selectionChanged` inside the zone; `pinnedRows` update outside it with no extra checks of the host (probe `ngDoCheck` count ≤ 2 per update).
### C. dom / size
12. C1 `packages/dom/test`: `gridState()` without `persist` on a server grid: the hold is not released by the feature (the wrapper's, or a test's own `held`, stays in charge); with `persist`: one request after the storage restore (existing test unchanged).
13. `packages/angular/test/angular-size.test.ts` (existing pattern): Angular ≤ line; K.8 ≤ guard; `uiData`/`selectedRows` tree-shaken; guards asserted from `size-budget.json`, not hard-coded.
### D. example
14. `perf/test/example-bytes.test.ts`: records (5); the default audit share ≤ 94 500 (or the owner's new number); `perf/test/audit-profile.test.ts`: the K.8 profile is unchanged by the URL screen (the lazy screen's imports are NOT in K.8) and a second profile covers it.
15. `perf/test/example-ssr.test.ts` (existing): still green; the URL screen renders the grid's place only on the server (no `location` read at module scope).

## 7. Browser checks (Chrome, one browser, touched groups only; the full suite and Firefox/WebKit stay for the close)
- `node scripts/example.mjs browser` (zone and default builds): audit screen unchanged (emit counter, ticks per scroll step); on `?screen=audit-url`: sort + hide a column + page 2 → the address gains `grid=1.…` (no filter/search in it); reload from the address → same state with ONE request (fake server counter), fr and ar (`lang` kept), dark.
- `-- --only playground`: `orders.html`: ⋮ menu (right click, Shift+F10), chooser from « Colonnes », move a column by Ctrl/Cmd+Shift+arrows, density buttons change row heights and the line is restored after reload, state round trip, `?lang=ar` (RTL pinned edge, ⋮ side). `hr.html`: fold/unfold a group (columns hidden, the focus rule), wrapped cells grow rows with the tree's sticky parents, the editable totals cell: type, Enter, the fake save, Escape, the bands ≤ half the view; fr/ar.
- `-- --only demos` (orders.ts and hr.ts are shared): green with `tools` off and the page changes in.
- `-- --only state`, `-- --only pinned-rows` as regression only if `state/index.ts` changed.
- Screenshots of the two pages (fr light, ar dark) go to `docs/screenshots/` for the owner; nothing else opens.

## 8. Docs at the commit
`docs/behaviors/angular-parts.md` (new sections: `state`/`stateChanged` and the echo rule, `pinnedRows`, density, `selectionChanged` and `selectedRows`, `use()`/`grid()`, `uiData`, the print recipe, the `[slot]` form with its strict-template symptom, scoped styles do not reach popup parts: global CSS), `docs/behaviors/angular-example.md` (the URL screen, (5) bytes), `grid-state.md`/`pinned-rows.md`/`density.md` pointers, `docs/phase-6-steps/decisions.md` (answers), STATUS and this file's « Done ». CHANGELOG and ROADMAP stay for the close (1.1.0).

## 9. Order of work
0 measure (build, example:bytes). 1 tests A1–A10 + B11 red. 2 wrapper (`grid.ts`, `controller.ts`, `helpers.ts`) until green. 3 the dom hold remedy only if A3 asks. 4 size check; stop rules. 5 example URL screen + C/D tests. 6 playground pages. 7 browser checks. 8 docs, `Done` section. One combined review at the end.

## 10. Risks
Exact-one-request restore (A3) and the pair `held` + `finally` hold; K.8 margin of 1 B (any wrapper byte); pinned bands + tree sticky on `hr.html`; `orders.ts` shared by edit and demo tests (flag); `ngc` negative tests flaky on a scratch copy (keep them in a script, not in vitest); a free function `selectedRows` may not be possible if the model has no key→row read (then keys only: stated in the docs).

## 11. Owner questions (simple French)
**Q12-1 — Les octets du wrapper Angular.** Le wrapper grossit d'environ 235 o ; ce poids entre aussi dans le profil K.8 (84 449 pour une ligne à 84 450, critère du projet 85 000) et dans l'exemple réel.
- A (recommandé) : monter la ligne K.8 de 84 450 à 84 800 (reste sous 85 000) ; la ligne Angular passe à 7 150 (dans les 7 300 déjà accordés).
- B : ne rien monter ; je retire `pinnedRows` et `selectionChanged` du wrapper (le reste ne tient pas non plus en 1 octet) : l'app les fait elle-même.
**Q12-2 — Un modèle (template) pour les lignes du menu ⋮.** Une ligne du menu n'est que du texte aujourd'hui, un template n'a nulle part où s'afficher.
- A (recommandé) : on ne le fait pas ; l'app donne `label` + `action`, et le contrôleur (`use`, `grid`) suffit.
- B : on ajoute une partie « icône/contenu » aux lignes du menu (travail dans `dom/column-menu`, quelques centaines d'octets, à redemander pour sa ligne de 4 300).
**Q12-3 — L'adresse (URL) de l'écran d'audit.** Garder l'état dans l'adresse coûte environ 2 600 o (état + adresse) ; sur l'écran d'audit par défaut cela dépasse la ligne de l'exemple réel (94 500) et le critère K.8 de 85 000.
- A : sur l'écran d'audit par défaut ; il faut monter la ligne de l'exemple à environ 96 500 et changer le critère K.8 (à décider par vous).
- B (recommandé) : un second écran `?screen=audit-url`, chargé à la demande comme « stock », mesuré à part par `example:bytes` ; l'écran d'audit par défaut et K.8 ne bougent pas.
- C : ni l'un ni l'autre ; l'adresse est seulement documentée et testée dans le playground.

## Done (2026-10-28; owner answers in decisions.md « Step 12 Angular »: Q12-1 K.8 84 800 and Angular 7 300, Q12-2 YES a template per menu item, Q12-3 option B)

### Step 0, before any change
- `example:build` was broken since the 1.0.0 release commit: the example's manifest named `packed/dzgrid-*-1.0.0.tgz`
  while `pack:local` stamps `1.0.1-local.<time>`, and it pinned tzslot 2.2.0 while `@dzgrid/dom` needs ≥ 2.4.0
  (`Missing ./lazy`). Fixed: `scripts/example.mjs build` points npm at the tarballs actually packed and restores the
  manifest after; the example takes tzslot 2.4.0.
- **The real example measured 93 780 B gz against its line of 92 500 before any step 12 code** (92 059 at the Phase 5
  close; steps 2–11 of Phase 6 grew the base by 1 721 B, never measured because the build was broken). Owner's Q-B grants
  94 500 for the phase; the line in `scripts/example.mjs` was not moved (« no other line moves »): **to the owner**.

### Built
- `@dzgrid/dom/column-menu`: `MenuItem.part` → a part of the new slot `menuItem` (`SlotContext['menuItem']`), painted in
  an `inert`, `aria-hidden` `span.dzg-mpart`, the item named by its `label` (`aria-label`); unknown name `unknown-part`;
  a throw: the plain text; one mount per drawn item, destroyed on redraw and close (`@dzgrid/dom/internal`'s `mounted`).
  Every aside of an item (icon, keys' hint) is now `inert` too. The base (`@dzgrid/dom`) is untouched: no `NEEDS` entry
  for the slot (0 B).
- `@dzgrid/dom/state`: without `persist`, the feature no longer ends a hold it did not make (the wrapper's).
- `@dzgrid/angular`: inputs `state`, `pinnedRows`; outputs `stateChanged`, `densityChanged`, `selectionChanged`;
  `DzgController.use()`, `.grid()` (and `_by`, internal, now behind `edit()`, `range()`, `fill()`); functions
  `selectedIds()` (coordinator, allergen lesson 2–3: ids not keys, the mode and the grid's query) and `uiData()`;
  `missing-feature` for `[state]` / `[pinnedRows]` without their features (one helper `_miss`, `[save]` uses it too).
  The `menuItem` template slot comes from the generic `DzgPart` (0 B of its own).
- Example: `?screen=audit-url` as a lazily loaded **provider** chunk (`src/app/audit-url.ts`, token `AUDIT_ADDRESS` in
  `lang.ts`) given to the same `AuditScreen` (two optional bindings). A first version subclassed `AuditScreen` in the
  lazy chunk: that moved the screen into a shared chunk (+1 310 B in the first load); the provider form keeps it in main.
  `example:bytes` (5), `example:ssr --screen audit-url` (fr, ar).
- Playground (a fork, then reviewed): `orders.html` (`tools`: moving, ⋮ menu with density and « Mettre en évidence »
  drawn by a `menuItem` part, chooser, density buttons, layout in the storage and the address, reset); `hr.html` (groups
  « Identité » / « Emploi » collapsible, « Équipe » wrapped with `autoHeight()` (`?fixed=1`: 52 px rows), a bottom
  pinned « Total » row whose « Budget » is editable, fake save). The demos harness and `orders-edit.html` unchanged.
- Docs: angular-parts.md (known outputs table and the silent unknown-output trap, `[state]`, `[pinnedRows]`,
  `(densityChanged)`, keys vs ids and `selectedIds`, `use()` / `grid()` and printing, `uiData`, the menu template,
  `[slot]` typing), column-menu.md « Item content », selection.md « Keys and ids », angular-example.md (the address
  screen), CHANGELOG « Unreleased » (1.1.0), ROADMAP, STATUS.

### Not built, and why
- `selectedRows()` (§1.5): it cost 117 B of the Angular line (7 364 / 7 300 with it); `selectedIds()` (56 B) answers the
  real need (ids for the server, the query for « all but these »), a host maps ids to its own rows.
- A dev-mode warning for unknown `(event)` bindings on `<dz-grid>` (coordinator lesson 1): the DOM gives no way to list
  an element's listeners, and the check would weigh in the measured wrapper line: documented instead (a table).
- `(selectionChanged)` carrying ids: the event is the core's (core bytes, every grid); the helper is additive and free
  when unused.
- A second size profile « audit + state »: `example:bytes` (5) records the address screen instead.

### Tests that failed first (written before the code)
- `packages/dom/test/column-menu-item-part.test.ts`: 6 / 6 red.
- `packages/angular/test/step12-api.test.ts`: 15 of 17 red (the two « as before » checks passed, as they should);
  then the `selectedIds` test and the compat list red again when `selectedIds` was added. A3 (one request on a server
  with `[state]`) stayed red (2 requests) until the dom hold change.
- `packages/angular/test/menu-template.test.ts` 1 / 1, `strict-templates.test.ts` 1 / 1, `test-zone/state-zone.test.ts`
  3 / 3 red; `scripts/test/angular-strict.test.ts` (ngc on 5 wrong hosts) red (`NG8002: Can't bind to 'state'`).
- `packages/dom/test/state-hold.test.ts`: 1 of 3 red (the two others pin the unchanged behaviour).
- `perf/test/step12-budgets.test.ts`: 1 of 2 red (the raises); the other pins every other line.
- `perf/test/example-bytes.test.ts`: the address-screen tests 2 / 2 red; the existing real-example test red at 93 780
  before any step 12 code (and still red: the line is the owner's).
- Updated for the granted raises only: print-size, spans-collapse, motion-seam, owner-look-3, rebudget (ceilings
  `@dzgrid/angular` 7 300, K.8 84 800); column-menu-layering allows `@dzgrid/dom/internal`; audit-profile leaves the
  lazy `audit-url.ts` out of K.8 like `stock`.

### Found in the browser
- **`spans()` and `tree()` together are refused** (`unsupported-combination spans tree`): the header groups of
  `hr.html` cannot fold on the org chart. Library unchanged; `hr.html` gains a « Vue » selector: `?view=list` shows the
  same people flat with the collapsible groups, the default org chart keeps its tree (the groups' columns as leaves).
- The totals row's flag and contact parts used `hidden`, which `demos.css`'s `display` overrode: an inline `display`.
- The demos harness (`packages/dom/test/browser/demos.html`) had been broken since step 11 (orders.ts imports the
  `-print` texts, absent from its import map): the map now names every entry orders.ts and hr.ts import.

### Gate (once, `caffeinate -i`, Node 24, vitest 2 workers)
- `build`, `typecheck` (core, dom, spec, ngc strictTemplates) green; `check:size` **118 ok, 0 over**: Angular **7 245 /
  7 300**, K.8 **84 776 / 84 800**, `dom/column-menu` **4 297 / 4 300**, `dom/state` 1 108 / 1 150, DOM base 22 334 /
  22 400 (unchanged), core 28 999 (unchanged), `dom/internal` 1 201 / 1 250; `check:contrast` 1 092 / 0.
- vitest **492 files, 7 292 passed, 3 failed**: two export lists pinned by older tests (`packaging`, `structure`),
  updated and green after (35 / 35); the third is the real example's 92 500 line (below). `test:perm` 5 files / 10.
- `example:bytes`: **(1) 94 596 / 92 500 — OVER, to the owner** (93 780 before step 12; 94 137 with the step's wrapper
  and the screen's two bindings; +459 when the address chunk exists: `@dzgrid/core/ids.js` splits into a chunk of its
  own, 325 B, because `dom/state` reaches it through the `@dzgrid/core/internal` barrel); (3) wrapper ~4 941; (4) stock
  33 179; **(5) the address screen 3 017**, on demand. `example:ssr` audit / stock / audit-url, fr and ar: ok.
- Chrome: `--only playground` 41 / 41, `--only columns` 41 / 41, `--only demos` 38 / 38, the Angular fixture
  (`packages/angular/browser/run.mjs`) 90 / 90, `example:browser` 8 / 8; by script (scratch, `p12-`): `orders.html` and
  `hr.html` fr light / ar dark 24 / 24 (the ⋮ menu's part item inert and named by its text, its action; density;
  Ctrl/Cmd+Shift+arrow; the address `grid=1.`; the chooser with the locked tree column; restore after reload; reset;
  groups fold in the list view; wrapped rows of several heights; the totals row's « Budget » edited and saved; the org
  chart a treegrid with no warning); the example's `?screen=audit-url` on a temporary 4711 server (closed after),
  default and zone builds, fr and ar: 12 / 12 (`grid=1.…` with no filter, screen and language kept; a reload restores
  sort, hidden column, page). No mutant round (owner).

### The owner's answer (2026-10-28, decisions.md « Real Angular example line »)
- The real example's line 92 500 → **95 000** (measured 94 596): a failing test first (`step12-budgets`, `example-bytes`),
  then `scripts/example.mjs`. No other line moved.
- **Why the broken build went unnoticed:** no step gate ran `example:build`; `example:bytes` and the K.8 real-build test
  measured whatever dist was left (the Phase 5 build, 92 059) and passed. Now a clean `example:build` stamps its dist
  (`dist/built-from.json`: a digest of `packages/{core,dom,angular}/dist` and the theme's CSS; dropped first, written
  only when the three builds are clean) and `example:bytes` **fails** on a missing build, a build without a stamp and a
  stale one (`scripts/test/example-stamp.test.ts`, red first 2 / 2).
