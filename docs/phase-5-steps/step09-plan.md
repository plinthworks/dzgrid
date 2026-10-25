# Phase 5 step 9: Angular for editing, then the Part A gate (architect, 2026-10-24)

Status: **done, not committed** (owner S9-Q1–Q7 in `decisions.md`); Part A closed technically, 124a–b open (owner).
touched. Sources: `decisions.md` (Q17, Q16, T8, D3, S5–S8, « Order after Part A »; they win), `phase-5-plan.md` D16
and §5, `behaviors/edit-angular.md`, `behaviors/angular-parts.md`, step 3–8 plans (Done / Review / handovers),
`packages/angular/src/*`, `packages/dom/src/{edit,editors,editors-list}.ts`, `part.ts` (slot `editor`),
`core/src/kernel.ts` (events), `examples/angular-audit`, `scripts/example.mjs`, `size-budget.json`. Clean room:
Angular's public docs only; no other grid's code.

## 0. Facts read in the code (at `1acaabf`)
1. `<dz-grid>` takes `features` **fixed** (KEYS, `unsupported-live-change` after creation). `edit()` (`@dzgrid/dom/edit`,
   options `save`, `savingBorder`) and `editors()` (`@dzgrid/dom/editors`, options `enterMoves`, `tab`, `calendar`,
   `loadCalendar`, `dateMessages`, `list`) are creation-time features; `listEditor` comes from `/editors-list` into
   `editors({ list })`. No DOM setter changes `enterMoves`/`tab`/`savingBorder` live. Only `EditApi.setSave()` is live.
2. `EditFeature.api(grid)` returns the grid's `EditApi` (`commit`, `undo`, `redo`, `canUndo`, `canRedo`, `state`,
   `reapply`, `setSave`, …); one feature object may serve several grids.
3. Events already in `GridEvent` (core/kernel.ts 115–133): `cellEdited`, `saveFailed` (error unchanged, `reason`,
   `code`), `orderStale`, `undoChanged`, `editingStarted`, `editingStopped`. They reach `onEvent` → `_hear` → `(gridEvent)`
   today; only `OUTS` lacks them.
4. The slot `editor` is already a `WiredSlot` of `@dzgrid/dom` and so of `@dzgrid/angular` (`WiredSlot = keyof
   SlotContext`): `<ng-template dzgPart="stock" slot="editor">` and `componentPart('editor', C)` **type-check today**,
   and `boundPart` mounts them; but the handle it returns has no `read()` (editors.md 19: no `read` → Enter, Tab and a
   blur keep nothing — so a template editor loses the typed value on blur, against Q5). `focus()` fallback (first
   tabbable) already fits an editor.
5. `DZG_DEFAULTS` is read for **every** KEYS entry at run time (`this[k]() ?? this._defaults[k]`), `features` included;
   only the `DzGridDefaults` type hides it.
6. `@dzgrid/angular` imports no `/edit`, `/editors`, `/editors-list` at run time; it must stay so (a read-only app
   must not carry ~13 kB of editing).
7. The real example (`examples/angular-audit`) is a server-paged, read-only audit log, FR **and** AR bundles imported
   statically; `example:bytes` counts the initial files (JS + CSS) less the baseline.

## 1. The Angular API (Q17 A: the app gives its save and gets events; editors by template; no forms)
**Wiring of the editing entries — by the app, in `[features]` (recommended, §9 Q1 A):**
```ts
readonly editing = edit<Row>({ save: (req, signal) => this.api.save(req, signal) });   // or [save] below
readonly features = [filters(), editors({ enterMoves: 'down', list: listEditor }), this.editing];
readonly messages = { ...FR, text: { ...FR.text, ...FR_EDIT.text, ...FR_EDITORS.text } };
```
`<dz-grid [features]="features" [messages]="messages" …>`. Also allowed (0 B, type only): `provideDzGrid({ defaults:
{ features } })` once `DzGridDefaults` names `features` — a tag's `[features]` replaces it whole (documented). The
wrapper never builds `edit()`/`editors()` itself.

**Inputs (new):**
- `[save]: SaveHandler<T> | undefined` — live. An effect: when the input has been set at least once, `editApi.setSave(v)`
  (in-flight requests keep their handler, step 3). Never set → `edit({ save })` stays. Set with no `edit` feature →
  one warning `missing-feature` at `save`, detail `edit` (once per grid). Outside the zone.
- `[editing]` (sheet D16): **dropped** (§9 Q2 A) — its three options are feature options (`edit({ savingBorder })`,
  `editors({ enterMoves, tab })`), fixed like `tree()`/`detail()`; the sheet's « choices to confirm » closed so.
- Columns: `editable`, `validate`, `edit.{required,min,max,pattern,options,editor,maxLength}` pass through `[columns]`
  (no code; tested).

**Outputs (new, by adding names to `OUTS`):** `(cellEdited)`, `(saveFailed)`, `(orderStale)`, `(undoChanged)`
— typed `Ev<T, …>`, emitted inside the zone when there is one, never after destroy, buffered in `_early` until after
the first render (NG0100 rule of step 11). `editingStarted`/`editingStopped`: not outputs (sheet 3), via `(gridEvent)`.

**Controller:** `DzgController.edit(): EditApi<T> | null` — the `edit` feature among the grid's features, `.api(grid)`;
null before the grid, without the feature, after destroy, on a server. Used for app buttons (`undo()`, `redo()`,
`reapply()`, `canUndo`), together with `(undoChanged)`. Type-only import of `EditApi`/`SaveHandler`.

**Editor templates and components (§9 Q3):**
- Template: `<ng-template dzgPart="stock" slot="editor" let-c>` (existing directive, no new one; sheet 5's `dzgEditor`
  renamed in the sheet). The column names it: `edit: { editor: 'stock' }`; `dzgPart="editor.number"` replaces the
  built-in number field (editors.md « Built at step 6 » 1). `c` = `SlotContext['editor']` + `emit` (`value`, `text`,
  `row`, `key`, `column`, `start`, `char`, `keep(input)`, `cancel()`, `refuse(code)`, `own(el)`, `dir`, `msg`, …) **plus
  `c.reads(fn: () => CellInput | undefined)`** (wrapper-only): the template registers what Enter / Tab / blur keep;
  boundPart's handle forwards `read()` to it. Without `reads`, `keep()` from the template is the only way (blur keeps
  nothing — documented).
- Component: `componentPart('editor', StockEditor)`; `DzgEditorComponent` = `DzgPartComponent<'editor'>` + optional
  `read(): CellInput | undefined` and `focus()`; boundPart forwards both.
- The root host (`.dzg-editor[data-dzg-owner="editor"]`) is the DOM layer's (step 6); keys the part prevents are its own.
- Registry order and `part-shadowed` unchanged (an editor name is a part name).

**Zones:** grid, editor parts and the app's `save` run outside the zone (the save is called from a key or a blur
handled outside it); the running border is CSS → 0 change detection while a save is in flight; the answer's events
reach the outputs inside the zone. One gesture's synchronous events (`cellEdited` + `undoChanged` + `editingStopped`)
must cost **one** zone entry: `_hear` groups events told in the same task into one `zone.run` if the test (§2 T7)
shows more than one tick (≈ +40 B). Editor template handlers run outside the zone: signals (as parts, angular-parts.md).

**SSR:** nothing rendered, no grid, no editor, no timer (existing rule). Sheet item 8 corrected: « the cells'
`aria-readonly` is written » is false on a server (no cells); it holds in the browser from the first paint.
`edit()`, `editors()`, `listEditor`, `componentPart('editor', …)` import-safe on a server.

## 2. Tests to write FIRST (each red before the code; `npx vitest run --maxWorkers=2 <files>` while working)
`packages/angular/test/`:
- **T1 `edit-inputs.test.ts`**: `[save]` set → a commit calls it with `(req, signal)`; changed live → the next commit
  uses the new one, the in-flight one keeps the old; never set → `edit({ save })` used; set then `undefined` → local
  save (setSave(undefined)); `[save]` without `edit` → one `missing-feature` at `save` (twice set: still once);
  `editable`/`validate`/`edit.*` pass through (F2 opens on an editable column only; a validator refuses).
- **T2 `edit-outputs.test.ts`**: each of the 4 outputs once per event with the grid's payload (`saveFailed.error` is
  the host's object, `toBe`); `(gridEvent)` still gets them and `editingStarted`; none after destroy; none before
  `afterNextRender` (buffered, then told in order).
- **T3 `edit-controller.test.ts`**: `controller.edit()` null before / without feature / after destroy; `undo()`,
  `redo()`, `reapply()` act as the keys (focus, sentence: S8-O2); a feature object shared by two `<dz-grid>`: each its own api.
- **T4 `edit-template.test.ts`**: a template editor with an `<input>`: F2 mounts it in `.dzg-editor[data-dzg-owner=editor]`,
  focus in the input, `c.start`/`c.char` (typing `7` opens with `char: '7'`); `c.keep({text})` saves and moves per
  `enterMoves`; `c.cancel()`; `c.refuse('app.stock')` stays open with bubble and `aria-invalid`; Enter / Tab / blur keep
  through `c.reads`; without `reads` blur keeps nothing; Escape cancels; the view destroyed at close (mounts =
  destroys over 200 open/close + scroll); `editor.number` replacement; the template typed (`template.test.ts`, ngc:
  `c.keep` exists, `c.toggleSort` does not).
- **T5 `edit-component.test.ts`**: `componentPart('editor', C)` with `read()` and `focus()`; a constructor throw → editor
  closed, `reportError`, not retried on that cell until its data changes; `inject(DzgController)` inside works.
- **T6 `edit-ng0100.test.ts`** (dev mode, `provideZonelessChangeDetection` + `fixture.detectChanges` checkNoChanges):
  plain fields bound from `(undoChanged)`, `(orderStale)`, `(cellEdited)` and shown in the host template; a commit
  from `(gridReady)`; a commit inside an `effect`; `[rows]`, `[context]` (refilter → `orderStale false`), `[columns]`
  (editable flipped) and `[save]` changed in one check → no NG0100.
- **T8 `ssr.test.ts`** (added cases): a `<dz-grid>` with `edit`, `editors({ list: listEditor })`, a `dzgPart slot="editor"`
  template, `[save]` on `platform-server`: renders nothing, `document` untouched, no timer pending, no problem.
- **T9 `edit-nested.test.ts`**: a `<dz-grid [dzgNested]>` inside a detail template with its own `edit()`: Ctrl+Z in the
  inner grid undoes the inner only (D13); `(undoChanged)` of each grid separate.
- **T10 `packaging.test.ts`** (added): the built `dzgrid-angular.mjs` has no import of `@dzgrid/dom/edit`, `/editors`,
  `/editors-list`, `@dzgrid/core/edit` (type-only imports erased).
`packages/angular/test-zone/`:
- **T7 `edit-zone.test.ts`** (zone.js): count `ApplicationRef.tick`/`onMicrotaskEmpty`: F2, type, Enter with a save held
  open 1 s (running border on) → **0** ticks during the wait; the gesture itself ≤ 1; the answer ≤ 1; `saveFailed`
  handler sees `NgZone.isInAngularZone() === true`; the app's `save` is called outside the zone (pinned and documented).
Expectations by hand; the test analyser's mutants after the code (in a copy of the repo).

## 3. Browser checks (one headless Chrome, closed in `finally`)
- **Fixture** (`packages/angular/browser`): new page `src/edit.ts` (`?page=edit`), `run.mjs --only edit`: fr light
  Clinic / ar RTL dark Midnight; a template editor and a component editor; F2, typing, Enter (stay) and `?enter=down`;
  the running border visible then the saved flash; a refusal (bubble under the cell, red blink, `aria-invalid`,
  `aria-describedby`); Ctrl+Z inside the field is the field's, outside it the grid's; Tab goes leftwards in RTL;
  Arabic-Indic digits in the number field; axe 0 with an editor open and refused; 200 open/close + scroll → mounts =
  destroys + live; destroy leaves nothing. Full fixture run (54 + new) at the commit.
- **Example** (`example:browser`): the editable screen (§4) fr / ar, zoneless and zone.js: open, type, Enter, the fake
  save (120 ± 60 ms) → saved; a refused save (fake server refuses one id) → value back, error mark; Angular checks per
  keystroke ≤ 2; 0 console errors.

## 4. The real example: an editable column, and its bytes
**Re-measure first** (implementer, before any code): `npm run build`, `npm run example:build`, `npm run example:bytes`.
Projection from the record: 86 988 at the Phase 4 close with K.8 80 286 (real − profile ≈ 6 700); K.8 now 82 411 →
**≈ 89 100**; + this step's wrapper (+250–400) → **≈ 89 400–89 500 / 90 000**. If the measure is already over 90 000:
stop, owner.
Static editing on the audit screen (edit + core/edit + editors + FR and AR `-edit`/`-editors` + `edit.css`, list
editor for the `action` column): sum of gz ceilings ≈ 19 kB, bundled ≈ **+15 500–17 500 → ≈ 105 000–107 000**: over.
Recommended (§9 Q4 A): **a second screen in the same build**, `?screen=stock` (invented stock rows, client-side:
`stock` number with `min: 0`, `status` list, `expiry` day, `note` text with a template editor), loaded by dynamic
`import()` from `main.ts` with its features, texts and `edit.css` (component `ViewEncapsulation.None`); the audit
screen's initial share unchanged (≈ 89 500), the stock chunk reported on its own line by `example:bytes` (forecast
**≈ 16 000–17 500 B gz**, informational unless the owner sets a ceiling). `example:ssr` gains `?screen=stock` fr/ar.

**Sizes:** `@dzgrid/angular` 6 323 → **≈ 6 600–6 700** (outputs ~45, `[save]` ~110, `controller.edit` ~50, `read`
forwarding and `c.reads` ~70, zone grouping ~40 if needed); ceiling **7 000** = 6 250 + 650 (Q16) + 50 (T8) + 50 (D3);
the budget line moves from 6 350 to the measure + 50 (≤ 7 000) with this grant chain written in `decisions.md`. K.8
82 411 → ≈ 82 750 / 83 500 (wrapper only). DOM, core, theme: 0.

## 5. Order of work
1. Re-measure (§4). 2. Sheet `edit-angular.md` updated (§1: no `[editing]`, `dzgPart slot="editor"`, `c.reads`, SSR
item 8, `controller.edit`) and `angular-parts.md` line. 3. T1–T10 red. 4. Code (`grid.ts`, `part-bind.ts`,
`controller.ts`, `providers.ts` type, `index.ts` types). 5. Fixture page, example screen. 6. Review + test analysis
(mutants), fixes tests first. 7. Part A gate (§6), commit, push `main`, STATUS / ROADMAP / CHANGELOG.

## 6. The Part A gate (phase-5-plan §5, Part A items) — each criterion and how it is checked
| # | Criterion | Check |
|---|---|---|
| G1 | Sheets before code | `git log --diff-filter=A` per sheet vs its first code commit (step 1 `4880616` before `6b390aa`…); each test file's sheet reference present (grep) |
| G2 | Bugs 1–5 of `a6c97f5`, each a test that failed first | bug 2, 5: `conformance/cases/edit-saves/bug2-*`, `bug5-*` (step 3); bug 1, 4: `editors-keys.test.ts` (step 5); bug 3: `editors-dates-zones.test.ts`, 13 zones (step 6); red-first evidence in each step's Done; run them by name |
| G3 | K.14: no row moves before `reapply()` | `conformance/cases/edit-order/*` + the edit walk tests (`test:ci`) + `test:perm` |
| G4 | ARCH §3.10 rules 1–6; 1 000 seeds, 0 stale | `edit-saves/*` conformance; the 1 000-seed property test (step 3) and save-outcome permutations (step 7) in `test:perm` |
| G5 | Rollback never touches the source | the deep-equal before/after in the property test (step 3) and `undo/*` |
| G6 | Ctrl+V / Ctrl+Z / Escape / arrows inside an editor never act on the grid | `editors-keys`, `edit-undo-keys` (QWERTY, AZERTY, Arabic, Cmd), browser `--only edit-undo` Chrome/Firefox/WebKit; Ctrl+V: no paste exists in Part A — a test pins that the grid takes no `paste` while an editor is open (placeholder for step 10 stays labelled) |
| G7 | Details, fillers, loading rows not editable (carried criterion 5) | `conformance/cases/editable/*`, `edit-detail.test.ts`, filler `editable`/`commit` tests (step 8 review); « pasteable/fillable » deferred to Part B (step 10 handover) |
| G8 | Tree column editor in RTL | browser `--only tree` (72), `--only edit-undo` WebKit/Firefox (the tree field RTL), `edit-tree.test.ts` |
| G9 | Nested grids independent | `edit-nested.test.ts`, browser `--only detail` (37), new Angular T9 |
| G10 | Validation accessible: axe 0, `aria-invalid`, `aria-describedby`, fr / ar RTL, light / dark / forced colours | browser `--only editors` (75), `--only edit-marks` (35) + Angular fixture `--only edit` |
| G11 | Save marks not colour-only; reduced motion respected | `edit-marks` browser (forced colours, reduced motion, `data-motion=off`), `check:contrast` (798 pairs, hue pairs ≥ 60°) |
| G12 | Uniform paint unchanged without editing | step 4 tests (existing paint tests untouched, `NO_OVERLAY`); the scroll bench line **not run** (Q17d, quiet machine pending): stated as such |
| G13 | Budgets by written decision | `check:size` 0 over; a table in the Done section mapping every Phase 5 ceiling to its decision (Q16, S2-O4/O5, S3-O4, S4-O4, S5-O2/O3, S6-O1/O5–O7, S7-O1, S8-O1/O6/O7, T7–T8, D3, this step's) |
| G14 | Angular (D16) | §2 T1–T10 green; fixture full run; `example:*` |
| G15 | Final gate green | one command at a time, `caffeinate -i`, ≤ 2 workers: `build`, `typecheck`, `test:ci`, `test:perm`, `test:tz`, `check:size`, `check:contrast`, `test:browser` (full), `test:audit -- --full`, `node packages/angular/browser/run.mjs`, `example:build`, `example:bytes`, `example:csv`, `example:ssr`, `example:browser`; `ps` at the end: no orphan worker, no browser left |
| G16 | Docs updated | STATUS (step 9 done, Part A closed technically), ROADMAP, CHANGELOG `[0.3.0] - unreleased` Part A section, ARCHITECTURE decisions index, `decisions.md`, sheets |
| G17 | Listening §19 scheduled (non-blocking) | listed in STATUS « Ce qui attend le propriétaire » (119, 124c–124g) |
| **O1** | **124a, blocking (owner, by hand, not agents)**: macOS Japanese Romaji « kana » and Pinyin « zhongwen » on a cell, no first letter lost, the composing Enter keeps nothing; French dead key `^`+`e` → « ê » | owner on `orders-edit.html` (4700); result written in STATUS; a lost letter → the hidden-field fallback question (S6-O3) |
| **O2** | **124b, blocking (owner)**: iOS Safari and Android Chrome: one tap selects, a double tap opens field and keyboard, the refusal bubble never under the keyboard, VoiceOver / TalkBack say the field name then the refusal | owner on a phone and a tablet; result in STATUS |
Time targets of phase-5-plan §4 (commit → repainted cell ≤ 4 ms, one frame): measured in the browser checks already
run; no bench (Q17d).

## 7. Risks
1. **Example margin**: ≈ 500 B left under 90 000 before any editing; the wrapper growth alone may cross it (stop, owner).
2. K.8 margin 1 089 B: the wrapper is in the profile (+250–400).
3. Zone ticks: one gesture tells 2–3 events synchronously → 2–3 `zone.run`; grouping needed (T7 decides).
4. The app's `save` outside the zone: under zone.js an app that sets a plain field in its own `.then` sees nothing
   until the outputs' tick — documented; signals recommended.
5. Template editors and blur (Q5): without `c.reads` the typed value is lost on blur.
6. NG0100 from events emitted while an input effect runs (`update()` inside change detection): T6.
7. A template editor's handlers run outside the zone (as all parts): signals only.
8. Features fixed: changing `enterMoves` needs a new grid (an app wanting a live switch re-creates `<dz-grid>` with `@if`).
9. 124a may fail → hidden proxy field (step 6 fallback): bytes in `/editors` (55 B left) → owner.

## 8. Not done here
Part B (ranges, paste, fill, bulk; the paste-in-detail placeholder, step 10); `editingStarted/Stopped` outputs; a live
`enterMoves`; Angular forms / CVA (Q17 B refused).

## 9. Questions au propriétaire (français simple)
**Q1. Comment l'appli branche l'édition dans Angular ?**
- **A ★** l'appli met `edit()` et `editors()` dans `[features]` (comme l'arbre et le détail) ; une appli sans édition ne
  télécharge rien de plus.
- B `<dz-grid>` les crée lui-même à partir d'entrées : plus simple à écrire, mais toute appli Angular porte ~13 ko
  d'édition, même en lecture seule.
- C un petit assistant `@dzgrid/angular/edit` qui fabrique les deux : une entrée de paquet en plus.

**Q2. L'entrée `[editing]` (Entrée qui descend, Tab, bordure animée) ?**
- **A ★** pas d'entrée : ces réglages vont dans `edit({…})` / `editors({…})`, fixés à la création (0 octet).
- B une entrée lue seulement à la création (même effet, une entrée de plus à documenter).
- C réglable en direct : demande du code dans `/editors` (il reste 55 o) et une nouvelle hausse.

**Q3. Un éditeur écrit en gabarit (`ng-template`) : comment il rend sa valeur quand on clique ailleurs ?**
- **A ★** le gabarit déclare `c.reads(() => …)` ; Entrée, Tab et le clic ailleurs gardent la valeur (règle Q5) ; ~40 o.
- B le gabarit appelle lui-même `c.keep(…)` ; un clic ailleurs perd la saisie (contre Q5).
- C gabarits interdits pour les éditeurs : seulement des composants.
(Et le nom : `<ng-template dzgPart="stock" slot="editor">` existant, au lieu d'une nouvelle directive `dzgEditor`, ~120 o de moins.)

**Q4. L'exemple Angular réel : où mettre la colonne modifiable ?**
- **A ★** un deuxième écran « stock » dans le même exemple, chargé à la demande : l'écran d'audit reste sous 90 000 ;
  l'écran stock (~16–17,5 ko de plus) mesuré à part.
- B une colonne modifiable sur l'écran d'audit lui-même : ~105 000 o, il faut relever le plafond de 90 000.
- C pas de colonne modifiable dans l'exemple réel ; seulement dans le banc Angular (`packages/angular/browser`).

**Q5. Les vérifications à la main 124a (méthodes de saisie) et 124b (téléphone) bloquent la partie A :**
- **A ★** la partie A est « close techniquement » après le portail ; la partie B commence ; 124a–b faites quand vous
  pouvez, un défaut trouvé est corrigé en priorité.
- B on attend vos deux vérifications avant de commencer la partie B.

**Q6. Budget `@dzgrid/angular` :** la ligne passe de 6 350 à la mesure + 50, au plus 7 000 (6 250 + 650 Q16 + 50 T8 +
50 D3). **A ★** oui ; B garder 6 900 comme plafond (moins de marge).

## Done (2026-10-25, not committed)

**Re-measured before any code** (`example:build`, `example:bytes` at `60443c5`): **89 010** B gz / 90 000 (K.8 profile
82 411, `@dzgrid/angular` ≈ 4 043 in the initial JS).

**Built.** Sheets first: `edit-angular.md` (points 2, 3, 5–8 rewritten: no `[editing]`, `[save]`, the four outputs,
`dzgPart … slot="editor"` + `c.reads`, `controller.edit()`, zones, SSR point 8 corrected), `angular-parts.md` « Editing ».
`@dzgrid/angular`: `[save]` (live from its first value; `setSave`; `missing-feature` at `save` once without `edit`),
outputs `(cellEdited)`, `(saveFailed)`, `(orderStale)`, `(undoChanged)` (in `OUTS`), `DzgController.edit()`,
`c.reads(fn)` in every part context (typed on `editor` only) and `read()` forwarded by `boundPart` (template reader or
the component's `read()`), `DzgEditorComponent`, `DzGridDefaults.features`; under a real zone the events told outside
it in one task are told in one zone entry a microtask later (T7: Enter was 4 turns, now 1). Type-only imports of
`/edit`, `/editors`, `core/edit`. Fixture `?page=edit` (`src/edit.ts`, `run.mjs --only edit`). Example: « stock »
screen (`src/app/stock.component.ts`, `?screen=stock`, dynamic import in `main.ts` / `main.zone.ts`, `bootstrapStock`
for the server; `edit.css` through `styleUrl`, encapsulation none); `example-lib.mjs` `measureLazy`; `example.mjs`
bytes line (4), `ssr --screen stock`, stock browser checks; the SSR row count reads class attributes only (the stock
screen's rendered CSS named `.dzg-row`).

**Tests that failed first** (on `60443c5`): `edit-inputs` 4 / 10 (6 pins green: F2 on editable only, a rule, `editable`
flipped, validate, no `[save]` no problem, never-set), `edit-outputs` 4 / 5 (« none after destroy » green by design),
`edit-controller` 5 / 5, `edit-template` 5 / 12 for `reads` (+ a bubble test fixed with a jsdom layout; open, char,
keep, cancel, Escape, 200 open/close, view counts green: the slot already worked), `edit-component` 1 / 4 (`read()`;
focus, inject, the throwing constructor green by design), `edit-ng0100` 3 / 3, `edit-nested` 1 / 1, `ssr` 1 / 2 new,
`packaging` 0 / 1 new (a pin), `test-zone/edit-zone` 1 / 1 (no `[save]`, then 4 zone turns for Enter), the ceiling
tests (rebudget 2), `measureLazy` 1 / 1. Test fixes of my own (not code): Tab then Escape in the component test, the
number format `100,000`, focus and F2 counted apart in T7, the dropped `maxLength` keep test (a field cap, not a check).

**Results so far.** Angular tests 35 files, **269 / 269** (both projects); tools rebudget 32 / 32, example-lib 8 / 8.
Fixture `--only edit` in Chrome **36 / 36** (fr light Clinic, ar dark Midnight: F2, Arabic-Indic digits, Enter stays,
running border then saved flash, local refusal with bubble under the cell / `aria-invalid` / `aria-describedby`, server
refusal, template editor + Ctrl+Z inside vs outside, component editor, Tab leftwards in Arabic, axe 0 open and refused,
200 open/close, destroy; `?enter=down`). `example:ssr` fr / ar / stock fr / stock ar ok; `example:browser` 8 / 8
(audit and stock, zoneless and zone.js; checks per keystroke 0; `(saveFailed)` in the zone).

**Sizes.** `@dzgrid/angular` **6 722** (budget line 6 350 → 6 772 = measure + 50, ceiling 7 000 by S9-Q6; tests first);
K.8 profile **82 813** / 83 500. DOM, core, theme: unchanged.

**The stop and S9-Q7.** With the stock screen `example:bytes` gave **91 082** B gz / 90 000 (the stock chunk apart:
20 423); without the dynamic import (same code) 89 349. The 1 733 B come from the split, not from editing code: the
shared modules (Angular, the grid) leave `main` for a shared chunk (88 567 → 64 750 + 25 485; module bytes +310 min
only), and two gzip streams cost more than one. A template note editor cost another ~400 (Angular's embedded-view code
into the shared chunk): the stock screen uses a component editor (deviation from §4; the fixture covers templates).
Owner **S9-Q7: the real example's ceiling 90 000 → 92 000**, K.8 guard 83 500 kept, the stock screen stays on demand —
tests first (`perf/test/example-bytes.test.ts`: `K8 = 92_000` pinned, red, then `scripts/example.mjs`; comments in
`perf/profiles/audit.ts`, `scripts/rebudget.mjs`, the rebudget test).

**Mutants** (copy `s9-mut`, deleted after): 23 on `grid.ts`, `controller.ts`, `part-bind.ts`, `example-lib.mjs`,
`example.mjs`. A first run selected no test files (a glob passed unexpanded): thrown away, the runner now refuses a run
with no tests. 17 killed at once; 4 after new tests (`[save]` set at creation and a commit from `(gridReady)`; the edit
feature found by its id, not its place in `[features]`; the grouped flush after destroy — Angular's NG0953 message
caught; `measureLazy` not following a lazy chunk's own dynamic imports); 1 equivalent (`controller.edit()` checking
the kernel instead of the grid: the features are empty until the grid exists); 1 killed by `example:ssr` (the SSR row
count on raw HTML: the stock screen's rendered CSS names `.dzg-row`, seen failing before the fix).

**Gate** (once, `caffeinate -i`, one command at a time): `build` green; `typecheck` red first (`direction` for `dir`
in four test sort items, my tests; fixed, rerun green); `test:ci` red first, 1 / 5 807 (`perf/test/audit-profile`:
the profile coverage read the lazy stock screen's imports; the screen now left out, with a pin that only `import()`
reaches it), rerun **367 files, 5 808 / 5 808**; `test:perm` 5 files, 10 / 10; `test:tz` 2 × 5 808 / 5 808 (only the
Los Angeles pass got `--maxWorkers=2`: npm appends the flag to the last command); `check:size` 0 over (K.8 82 813 /
83 500, angular 6 722 / 6 772); `check:contrast` 798 pairs, 0 below; `test:browser` first 847 / 848 (`edit saves ar:
keyboard focus: the tooltip at once`, a DOM check this step did not touch, under load), rerun **848 / 848**;
`test:audit -- --full` green; the Angular fixture **90 / 90** (54 + 36 edit); `example:build` default, zone, baseline
ok; `example:bytes` **91 082 / 92 000**, stock 20 423 apart, wrapper ≈ 4 396; `example:csv` ok; `example:ssr` audit
and stock, fr and ar ok; `example:browser` **8 / 8**. `ps` at the end: no worker, no browser of ours. Added for G6: the
pin `packages/dom/test/editors-paste-pin.test.ts` (a paste inside an open field left to the field; placeholder until
step 10). Not run: benches (Q17d).

## Part A gate (2026-10-25)
| # | Result |
|---|---|
| G1 | green: every editing sheet added by `4880616` (2026-10-22), before the first code commit `6b390aa`; this step's sheet changes before its tests; every edit / editors test file names its sheet or its step plan (two of this step's headers completed) |
| G2 | green: bug 2 and 5 `conformance/cases/edit-saves/bug2-reverse-answers`, `bug5-last-saved`, `bug5-waiting-after-failure`; bug 1 and 4 `editors-keys.test.ts`; bug 3 `editors-dates-zones.test.ts` (13 zones); red first recorded in steps 3, 5, 6 « Done »; all in `test:ci` |
| G3 | green: `conformance/cases/edit-order/*`, the edit walks (`test:ci`), `test:perm` |
| G4 | green: `edit-saves/*` conformance; `core/test/edit-saves-property` 1 000 seeds in `test:ci`; the save-outcome permutations in `test:perm` |
| G5 | green: the property test feeds frozen host rows (a write to them throws) and checks the shown values against its oracle; `undo/*` |
| G6 | green: `editors-keys`, `edit-undo-keys` (QWERTY, AZERTY, Arabic, Cmd), browser `edit-undo` in the full run (Chrome, Firefox, WebKit groups); the new paste pin; the Angular fixture (Ctrl+Z inside the field is the field's) |
| G7 | green: `conformance/cases/editable/*`, `edit-detail.test.ts`, the filler tests; pasteable / fillable deferred to Part B (step 10) |
| G8 | green: browser `tree` and `edit-undo` (WebKit, Firefox) in the full run; `edit-tree.test.ts` |
| G9 | green: `dom/test/edit-nested.test.ts`, browser `detail`, Angular `edit-nested.test.ts` |
| G10 | green: browser `editors`, `edit-marks` in the full run; fixture edit (axe 0 open and refused, `aria-invalid`, `aria-describedby`, fr light Clinic, ar RTL dark Midnight) |
| G11 | green: `edit-marks` (forced colours, reduced motion, `data-motion=off`); `check:contrast` 798 pairs, hue pairs ≥ 60° |
| G12 | green for the paint tests (step 4's, untouched); the scroll bench **not run** (Q17d, quiet machine pending) |
| G13 | green: `check:size` 0 over. Ceilings and their decisions: core 29 000 (Q16), `core/edit` 3 100 (S3-O4), `core/server` 6 100 (S2-O4), `core/detail` 1 050 (S2-O5), dom 21 700 (S4-O4, inside T7's 21 980), `dom/edit` 4 150 (S8-O6), `/editors` 6 650 (S7-O1), `/editors-list` 1 400 (S6-O7), the lazy calendar (S6-O6), `dom/tree` 3 800 (S8-O1), `dom/detail` 4 150 (S8-O7), theme 2 500 (S4-O2), `edit.css` 2 200 (S7-O1), midnight / clinic 650 (T7), `-edit` 560 / 630 / 900 (S4-O4, S8-O1), `-editors` 450 / 500 / 620 (S5-O3), angular 6 772 (S9-Q6, ceiling 7 000), K.8 83 500 (Q16), the real example 92 000 (S9-Q7) |
| G14 | green: T1–T10 (`packages/angular/test/edit-*.test.ts`, `ssr`, `packaging`, `test-zone/edit-zone`); fixture 90 / 90; `example:*` |
| G15 | green after the reruns above (`typecheck`, `test:ci`, `test:browser` each red once, then green; nothing else) |
| G16 | green: STATUS, ROADMAP (step 9, the Part A exit, S9-Q7), CHANGELOG Unreleased, ARCHITECTURE Phase 5 index, `decisions.md` S9-Q7, the sheets `edit-angular.md`, `angular-parts.md` |
| G17 | green: listening §19 (119, 124c–124g) listed in STATUS « Ce qui attend le propriétaire » |
| O1 | **open, owner**: 124a (Japanese and Pinyin input methods, French dead keys) on `orders-edit.html` |
| O2 | **open, owner**: 124b (iOS Safari, Android Chrome: tap, double tap, bubble above the keyboard, VoiceOver / TalkBack) |

## Review (2026-10-25) — applied, tests first
1. **Zone order** (`grid.ts` `_hear`): while events wait for their zone entry (or the flush runs), every later one —
   told inside the zone, or by a handler during the flush — is appended and drained by an index loop (`finally`
   clears the queue); with nothing waiting, an in-zone event goes out at once. Red first: « saveFailed outside, then
   orderStale inside, in one task: in that order » and « a (cellEdited) handler that commits again: its events after the
   first gesture's ». Pins (green): « a commit inside the zone: heard at once », « events outside the zone in one task:
   g:undoChanged, o:undoChanged, g:cellEdited, o:cellEdited, g:orderStale, o:orderStale ». Sheet point 7: one
   microtask late when told outside the zone.
2. `audit-profile.test.ts`: any relative path to `stock.component`, `export … from` and a bare import refused, `import(`
   allowed (planted cases red on the old pattern); `main.zone.ts` too.
3. G5: the property test's host rows are now `Object.freeze`d as fed (besides the snapshot check; green at 300 and
   1 000 seeds). The « Part A gate » G5 line now holds as written.
4. `part-shadowed` reads `[features] ?? provideDzGrid defaults` (red first: a provider feature's part shadowed by `[parts]`).
5. A `read()` that throws (DOM `editors/index.ts`, every editor part): reported (`g.report`), nothing kept, the editor
   closed, the value unchanged, at Enter, Tab or a blur (decided so; editors.md 19, edit-angular.md 5). Red first: DOM
   `editors-custom` Enter and blur, Angular `review9` component editor. `/editors` 6 601 / 6 650 (+6).
6. Stock screen: « Enregistrés » counts answered saves (in the save's answer), not `(cellEdited)`; `example:browser`
   checks « 0 while the save runs » (red on the old build, 3 / 4 stock runs).
Gaps: `edit-template` « the latest c.reads wins », « a reader belongs to its own opening »; `measureLazy` « a dynamic
import from a static chunk of the first load » (pins, green); `example:ssr` checks each screen's own marker in the
server HTML (`stock-saved`, `audit-count`). `test:tz` now passes `--maxWorkers=2` to both zones.

**Gate** (once, `caffeinate -i`): build, typecheck green; `test:ci` **368 files, 5 819 / 5 819**; `test:perm` 10 / 10;
`test:tz` 2 × 5 819 (both passes 2 workers); `check:size` 0 over (angular **6 743**, line 6 772 → **6 793** = measure +
50, test first; `/editors` 6 601; K.8 82 829); `check:contrast` 798 / 0; `test:browser` **848 / 848**; `test:audit
--full` green; fixture **90 / 90**; `example:bytes` **91 093 / 92 000**, stock 20 417 apart; `example:ssr` 4 ok;
`example:browser` 8 / 8. No orphan.
