# Phase 6, step 5: GridState. `@dzgrid/core/state` (pure) and `@dzgrid/dom/state` (helpers): the plan

Architect, 2026-10-26, read-only (nothing run, nothing changed but this file). Wins over it: `decisions.md` (Q-S1, Q-S2, Q-B, O1, O6, O7,
Q3-3, « Working method »). Sheets: `grid-state.md` (rules cited « G n »), `density.md` (D n), a11y §21. Clean room: behaviour from the
sheets, the URL, Web Storage and WCAG standards only. The plan's step list splits it (5 `core/state`, 6 `dom/state`); this file covers both
as the lead asked: **5a core, 5b dom**, two implementer gates, one review.

## 0. Facts read in the code (they change the sheet)

1. **A restore costs 3 server requests today, not 1.** `query.set` -> `rows.setQuery` -> `rekey` -> `restart` -> `load()` (`server/rows.ts`
   ~395-430); `page.size` -> `setPage` -> `load()` (~535-556); `page.go` -> `load()` again. `load()` calls `data.fetch` every time; the
   gate only aborts the older ticket, the request is already sent (`fetches++`). Worse: `column.state` -> `rows.setColumns` -> `rekey` may
   restart too (hidden columns change `dataVersion`: a filter or sort on a column the state hides changes the wire form). So the order
   « columns -> query -> size -> page » can cost up to 4. **G 7's seam is needed**; step 5 first MEASURES it (test below), then adds it.
2. `page.go` only has `index`, `page.size` only `size`; `setPage(p)` already takes `{ index?, size? }` and resizes in one load (`rows.ts` 535).
   A filter or search change sends the page to 0 (inside `restart`), so the page must be applied AFTER the query, but BEFORE the fetch.
3. **Density is a DOM setting** (`g.settings.density`, live, `update.ts:28`), not in the kernel. `captureState` and `restoreState` in the
   core therefore take density through the caller (§1). `setDensity` does not exist yet (Q3-4 said step 6; the menu mutates
   `g.settings` itself, `column-menu/index.ts:193`). `dom/state` adds `grid.density()` read and applies density through the same live
   settings path (`density.md` 1-2, `densityChanged`) **without** the menu code: the menu keeps its inline copy (no cleanup this step).
4. **Header groups have no collapse yet** (step 8). `groups` is in the shape and in the tests NOW, against a small stub (`opts.groups`
   adapter: `{ ids(): string[]; collapsible(id): boolean; get(): Record<string, boolean>; set(Record<string, boolean>): void }`).
   Until step 8 wires it, capture omits `groups`, and a state naming `groups` gives `state-group` for each id (they are unknown).
5. Existing pure pieces to reuse: `ColumnModel.state()/apply()` (`columns/model.ts`), `columns/order.ts` helpers (not read here), the query's
   canonical `key`, `checkPage`, `Problem`. `ColumnState.width` accepts `null` since Q3-3 (use it to clear a width).
6. `Problem` codes are a closed const list in the **base** (`problems.ts`, ~L5-50). Five new codes (`state-version`, `state-column`,
   `state-group`, `state-field`, `state-storage`) cost ~40-50 B in the base **if** added there. Check first whether `core/state` can own
   them (an exported `STATE_CODES` and a widened `Problem['code']`); if the type is closed, they go in the base and eat the budget.
7. The audit screen keeps its state in the address in the Sehhaty app, not in this repo; ours is `examples/angular-audit` (language only in
   the URL today, `lang.ts`) and the playground. So « the address helper on the audit page » is built NEW there, at step 12 (Angular and demos);
   in step 5b the browser check uses a **playground page** (`orders.html?state=1`, plan step 6) as a stand-in.
8. **Budget arithmetic**: core base 28 930 / 29 150 leaves 220 B. Base users in Phase 6 still to come: collapsible groups +40-80 (step 8),
   possibly codes (6). Step 5's base seam must stay **<= 110 B** (decision below). Over that: back to the owner.

## 1. API

`@dzgrid/core/state` (no DOM, no clock, no `Date`, no randomness; the purity test applies):

```ts
export const STATE_VERSION = 1;
export interface GridStateColumn { id: string; width?: number; hidden?: boolean; pinned: 'start' | 'end' | null; order: number }
export interface GridState {
  v: 1;
  columns: GridStateColumn[];
  groups?: Record<string, boolean>;          // groupId -> open
  sort: SortItem[]; filter: FilterModel; quick?: string;
  page?: number; pageSize?: number;           // page 0-based as the core's page.go
  density?: 'compact' | 'comfortable' | 'spacious';
}
export type StatePart = 'columns' | 'groups' | 'sort' | 'filter' | 'quick' | 'page' | 'density';
export interface StateOptions { include?: readonly StatePart[]; exclude?: readonly StatePart[] } // default: every part
export interface StateEnv { density?: () => Density | undefined; setDensity?: (d: Density) => void; groups?: GroupsAdapter }
export function captureState(kernel: Kernel, env?: StateEnv, opts?: StateOptions): GridState;
export function checkState(raw: unknown, known?: { columns: ReadonlySet<string>; groups: ReadonlyMap<string, boolean> }): { state: GridState | null; problems: Problem[] };
export function restoreState(kernel: Kernel, raw: unknown, env?: StateEnv, opts?: StateOptions): Problem[];
export function stateText(state: GridState): string;   // deterministic JSON: fixed key order, stable for the URL helper
export const STATE_UPGRADES: readonly ((s: any) => any)[]; // [] today: index n upgrades v n -> n+1
```

Rules: `captureState` is deterministic and total (two calls on one grid: same text); key order fixed (v, columns, groups, sort, filter, quick,
page, pageSize, density); a part equal to the grid's initial value is still written (a state is explicit, G 1). `width` only when the
user sized it (`ColumnState.width` set). `order` = index in the full order (hidden included). `checkState` is the pure half: it takes
any value, upgrades older versions one at a time, drops unknown or wrong parts with problems, enforces O1, and returns a clean state
or null. `restoreState` = `checkState` + the apply order. No row, `RowKey` or cell value can enter: capture reads only ids, numbers and
the query (filter values are the user's typed text, G 3: they stay, and are the reason for O6).

`@dzgrid/dom/state` (optional entry over `core/state`):

```ts
grid.state(): GridState                      // captureState with the grid's density and groups adapters
grid.setState(raw: unknown): Problem[]       // restoreState; one `stateRestored { problems }` event; focus not moved, silent (G 16)
event stateChanged { state }                 // debounced 300 ms, once per user gesture; never source 'host', never a restore
stateState(opts?: { debounce?: number }): Feature   // the feature that adds the three members above (so a base grid pays nothing)
persistLocal(grid, key, opts?: { include?: StatePart[] }): () => void   // returns stop()
toSearchParams(state, opts?: { name?: 'grid'; include?: ('filter' | 'quick')[] }): URLSearchParams
fromSearchParams(params: URLSearchParams, opts?: { name?: 'grid' }): { state: Partial<GridState> | null; problems: Problem[] }
```

Decision: `stateState()` is a **feature** (the repo's pattern: `moves`, `columnMenu`, `columnsChooser`); the helpers take the grid it
added members to; missing feature -> `missing-feature` problem, no throw. `persistLocal` must restore BEFORE the first fetch: it is
passed as a creation option of the feature, `stateState({ persist: { key, include? } })`, so the feature reads the storage during
`createGrid` before the data model asks (§3). The standalone `persistLocal(grid, key)` form is the later-restore form (one fetch at
start already happened: documented, tested as exactly one extra request).

## 2. JSON shape and rules

```json
{"v":1,"columns":[{"id":"name","pinned":"start","order":0},{"id":"age","width":96,"hidden":true,"pinned":null,"order":2}],
 "groups":{"contact":false},"sort":[{"column":"name","dir":"asc"}],"filter":{},"quick":"",
 "page":2,"pageSize":50,"density":"comfortable"}
```
(`sort` and `filter` are the core's own canonical shapes; the implementer copies them from `Query`, the example above is indicative.)

- Not saved: expanded rows, selection, focus, scroll, edits in progress, floating filter row (Q-S1; G 2). Nothing offered on request (choice 2).
- **Versions** (G 9): not an object, no `v`, `v` not a positive integer, or `v` > `STATE_VERSION`: `state-version`, nothing applied. `v` < current: run
  `STATE_UPGRADES[v..]` in order, then check as current. Today only v1 exists; the upgrade ladder is tested with a **test-only** v0 -> v1 hook
  (a planted shape), so the first real v2 cannot break it.
- **Unknown ids** (G 10): column entry skipped with `state-column` path `columns.<i>`; sort item or filter key on an unknown or **removed** column dropped
  with `state-column` path `sort.<i>` / `filter.<id>`; group id: `state-group` path `groups.<id>`; known columns the state omits keep their
  current settings and go AFTER the named ones in their current relative order (patch `order` = named ones first, then the rest). A column named twice:
  the first wins, `state-field` on the second.
- **Wrong types** (G 11): the field is skipped, `state-field` with the path only (never the value: it could be a name).
- **O1 / `hideable:false`** (G 12): compute `hidden` from the state; a `hideable:false` column is forced shown (`state-field` `columns.<i>.hidden`);
  if none of the columns would be shown, the first column of the restored order is shown (same code). The check runs against what exists
  AFTER skipping unknown ids, and counts columns the state does not name as they are now.
- **Pins**: `pinned` is `'start' | 'end' | null`, logical only; a `movable:false` column keeps its place (O3 pin items disabled): its order and pin
  are skipped with `state-field` unless unchanged. O2: restore sets the order so that pinned columns stay in their segment (the `order` index is
  relative to the full order; the check re-sorts by segment: start, centre, end, each by `order`, as `fullOrder` does).
- **Width**: positive finite number, clamped by the column's own min and max (the model does it); `width` absent in the state while the grid has a user
  width: patch `width: null` (Q3-3: exact), so the restored state equals the captured one.
- **Page** (G 13): negative or non-integer: skipped `state-field`; past the last page: the model clamps (client) or the server answer does.
  `pageSize` must pass `checkPage`; on a grid without paging both are ignored silently (nothing to warn: not a user error, a documented skip `paging-off` stays internal).
- **Density**: one of the three, else skipped with `state-field` (D 7 uses `invalid-setting` on the API; the state uses `state-field`).

## 3. The restore order and the one-request rule (measured)

Order (G 6 amended): **hold** the model's fetches -> columns patch (order, pins, widths, hidden) -> groups -> density (DOM, before the query so the first
rows are laid out at the right height) -> `query.set` (sort + filter + quick) with `page` -> release -> **at most one** `data.fetch`.

**The seam (core base, <= 110 B, measured, only if the first test shows > 1 request).** Preferred: **`hold`**, a counter in the kernel
and in the rows model (`rows.hold(fn)`): while held, `load()` only sets a `wanted` flag; the outermost release calls `load()` once. The
epoch/restart bookkeeping inside `restart` still runs at once, so the model state is right before the single fetch. Because `restart` resets the page to
0 and the page must come after, the restore applies `setPage({index, size})` inside the hold; the one `load()` then carries query, size and index.
Why not the alternative « `query.set` gains a `page` field »: it fixes query + page but not the column-patch-then-query case (fact 1), and widens a public
command. `hold` is internal (not a public command; an `internal.ts` export for the dom feature and `core/state`, like the seams already there;
the implementer checks `internal.ts` for the pattern). Risks of `hold`: (a) a fetch result arriving inside a hold is not an issue (the hold is synchronous,
no `await` inside); (b) an exception inside `fn` still releases (try/finally); (c) a held load that is no longer needed (state equals the current one) sends nothing:
the model decides `wanted` only when a restart or setPage really changed the key (test: restoring the current state costs 0 requests).
**Measure first**: test `restore-requests.test.ts` counts `data.fetch` calls through a fake server for: (1) fresh grid, state changing columns + sort + filter +
page + size -> **expect 1**; (2) state equal to the current one -> **0**; (3) only the page changes -> 1; (4) only hidden columns that a current filter reads -> 1; (5) a restore
issued while a request is in flight -> 1 new request, the older answer discarded by the gate (G 15), the rows shown are the restore's (generation guard, tested with a
controllable fake server: answer the OLD request last). The test is written and seen **red with 3-4** before the seam, green after; the seam's bytes are measured and written in the plan's « Done ».

**`persistLocal` at start** (G 17): the feature reads `localStorage[key]` synchronously in its setup, before `createGrid` hands the first fetch; it calls
`checkState`, then applies columns, density, and passes query+page as the **initial** model options (`o.query`, `page`, `pageSize`) rather than
dispatching after creation: **0 extra requests**, the first request is the saved one (test: fake server sees one request, carrying the saved sort, filter, page).
Needs: confirm in `kernel.ts` (~285 `if (o.query) rows.setQuery(...)`) that creation options can carry page and size; if the page options exist only on
`env.page` (`resolvePageOptions`), the feature merges the saved page into those options through the feature's `settings` hook. If neither is possible, fall back to
`hold` around creation (same seam, no extra bytes). Storage blocked, full, or bad JSON: one `state-storage` warning (path `storage`, no content); the grid starts as defined.

**URL helper** (G 18-19, O6, O7): `toSearchParams(state)` writes **one** parameter `grid=1.` + base64url(UTF-8 of `stateText(pick(state)))`, where `pick` removes `filter` and `quick`
unless `include` names them. Columns, groups, sort, page, pageSize, density always. `fromSearchParams` accepts only the leading `1.` (the version of the **encoding**; the
JSON carries its own `v`), rejects bad base64url, bad JSON, size > 4 KiB of text (the limit is a decision below), and returns null with `state-version`. A state read without `filter`/`quick`:
`restoreState` with `exclude: ['filter','quick']` keeps the grid's own filters and search (the parts are **not applied at all**, not reset). Base64url without `btoa`
quirks on non-Latin text: encode UTF-8 bytes (`TextEncoder`), table-free: ~120 B. Never touches `history` (G 20); the app calls `replaceState` itself.

**Debounce** (G 5): a 300 ms trailing timer per grid, started by any event of a saved part with `source !== 'host'` and `source !== 'restore'` (the feature marks its own
restore with a flag and ignores the events of its restore, then re-bases the « last emitted » text). It compares `stateText` with the last emitted and emits only on a difference
(a drag that returns to start emits nothing). `destroy()` clears the timer and unsubscribes. No clock in core: the timer is DOM's.

## 4. Tests to write FIRST (red before code)

Core (`packages/core/test`, node):
1. `state-property.test.ts` **round trip**: random states (fast-check style or the repo's seeded generator; the repo has `*-property.test.ts`, copy their seed helper and **1 000 seeds**,
   3 000 for the close gate): random column count 1-30, ids with Arabic and spaces, random order, widths (some absent), hidden (never all), pinned both sides and null, random sort
   (1-3 items), filter, quick text, page, size, density. Property: `capture(restore(capture(S0))) === capture(S0)` AS TEXT, and `restore` of a captured state gives `[]` problems. **RTL half**: build
   the same grid twice with `dir` ltr and rtl (the core has `Direction` only through layout; the property builds the layout in both directions and compares `columns.state()`, pin sides, order and
   `query.key`): identical; and a state captured in LTR restored in RTL, captured again, equals the original (and back). Include `movable:false` and `hideable:false` columns in the generated defs.
2. Conformance `conformance/cases/grid-state/*.json` (hand-written expectations): round trip; unknown version (0 not an integer, 2 higher, string, null, array); older version upgraded (planted v0);
   unknown column in columns / sort / filter; unknown group; wrong field types (width as string, hidden as 'yes', page -1, density 'huge'); all hidden -> first shown; `hideable:false` forced shown;
   duplicate id; restore order (columns before query: a sort on a column the state un-hides); page past the end; a planted row value in the grid's data **absent** from the text; omitted columns go after the named ones.
3. `state-requests.test.ts` (§3, the 5 cases) with the real server model, counting `data.fetch` calls.
4. `state-never-throws.test.ts`: 2 000 random garbage values (nested, cyclic objects, huge arrays, `__proto__` keys, getters that throw) -> no throw, no prototype pollution, nothing applied when the version is bad.
5. Purity test already scans the new entry (`purity.test.ts`); add `core/state` to its entry list if it lists them.
6. **Mutants (owner method): only on `core/state` pure logic** (`checkState`, upgrade loop, the O1 guard, the order merge, `stateText`): ~25, run once by the combined reviewer. Targets, to make sure the tests kill them: the all-hidden guard
   (`<` vs `<=`), `hideable` bypass, version `>` vs `>=`, upgrade loop off-by-one, « named first then the rest », width `null` vs absent, first-wins on duplicates, the page clamp, key order in `stateText`. NO mutants on `dom/state`.

Dom (jsdom, `packages/dom/test/state.test.ts`): feature adds `state()/setState()/stateChanged`; debounce 300 ms with fake timers, one event per gesture (a drag with 20 moves = 1), none for `host`, none on `setState`, none for a gesture that returns to the same text;
`destroy()` leaves no timer; `persistLocal` storage blocked (getter throws), quota error on set, bad JSON, not an object: one `state-storage`, grid as defined; the first fetch carries the saved query and page (fake server, 1 request); `toSearchParams` without `include`: no `filter`
or `quick` in the decoded text (decode in the test with an independent decoder written by hand, not the helper's own); with `include: ['quick']` only quick; same state same text; tampered / truncated parameter -> `null` + `state-version`; a Unicode quick text
(« محمد », accents) round trip with `include`; no cookie access (spy on `document.cookie` setter); no `history` call (spy); focus not moved and nothing announced on `setState` (live region empty); density applied before rows measured (row height after restore = density's).

## 5. Browser checks (real Chrome, `--only state`; one browser at a time; Firefox/WebKit only at the phase close)

New `scripts/browser-state.mjs` (same shape as `browser-columns.mjs`), wired into `scripts/browser.mjs` `--only state`, on a playground page `orders.html?state=1` (a small toolbar: Save, Load, « Copier l'adresse »):
1. fr LTR: move, resize, hide, pin start and end, sort, filter, search, page 3, size 50, density spacious; `state()`; **reload with `persistLocal`**: identical grid (header order, widths +-0 px, row height, sort mark, page, quick text) and the **network log shows 1 data request** (the fake server's counter in the page).
2. Same state restored with `?lang=ar` (RTL): same columns in the same logical order, the start-pinned columns now on the right, the same query; `state()` text identical to the fr one (string compare).
3. **Address helper**: build the address, open it in a new tab: columns, sort, page restored; typed filter and search are **absent** from the text (decode in the page; assert the URL has no substring of the typed name); with `include: ['filter','quick']` present; edit one character of the parameter by hand: the grid stays as defined, one `state-version`.
4. A stale state (a column id removed, one renamed): loads, the others applied, problems listed once, no console error; a state hiding every column: one shown.
5. Restore while the first request is held by the server (slow): only the second answer lands.
6. axe 0 and focus unchanged after `setState` (the active cell element is the same). jsdom checks no layout: widths and heights are measured in Chrome here.
7. The **audit page** (`examples/angular-audit`) gets the address helper at step 12, with its own browser and byte checks; not in this step.

## 6. Angular inputs (decision: defer to step 12)

`state` (input, `GridState | null`, applied on change through `setState`) and `stateChanged` (output, from the DOM event, inside the zone like the other outputs) are trivial but are
also the zone test's and `example:bytes` subject (+~1 900 B for the example). Doing them now forces a re-measure of Angular (7 000 / 7 300) and of K.8 in a step that otherwise touches neither. **Defer to step 12** as the plan says.

## 7. Sizes (gzip, minified; measure at the end, never assert)

| Entry | Granted | Plan | Notes |
|---|---|---|---|
| `@dzgrid/core/state` | 1 500 | ~1 100-1 400 | `checkState` is the bulk: the field checks table-driven (one array of `[path, test]`) rather than hand-written ifs |
| `@dzgrid/dom/state` | 800 | ~650-780 | feature + debounce + `persistLocal` + base64url; the URL helpers import from `core/state` `stateText` only |
| core base | 28 930 / 29 150 | **+<= 110** | `hold` seam (+ codes, if they must live in the base: then +45 more, which uses the room step 8 needs: see risk 1) |
| dom base | 21 773 / 22 400 | +0 | `dom/state` reads `g.settings.density` and `g.kernel` through existing internals; if a hook for creation options is missing, <= 40 B, flagged |

Both new entries must be added to `size-budget.json` (entries `over` `@dzgrid/core` / `@dzgrid/dom`), `exports` in the package manifests and the `build` manifest check. That is configuration, not part of this plan's writing: the implementer does it with the step, reports it. No new text bundle (G « Texts »: problems are codes). If the playground page adds text it uses the app's own (not the library's).

## 8. Build sequence (implementer)

5a: (1) red tests §4.3 (count requests) and §4.1-2; (2) `core/state` pure code to green; (3) `hold` seam only if §4.3 shows > 1; measure core base; (4) `size-budget` entry; (5) targeted tests only while working (`state*.test.ts`, `gate`, `source-rows` for the seam), the full suite once.
5b: (6) red dom tests; (7) feature, debounce, `persistLocal` at start; (8) URL helpers; (9) playground page and `browser-state.mjs`, `--only state` once; (10) docs: update `grid-state.md` « As built » (groups until step 8, the `hold` seam, `STATE_UPGRADES`, the feature name), `ROADMAP.md`, `docs/STATUS.md`, this plan's « Done »; no commit unless asked.

## 9. Risks

1. **Core base room**: 220 B for this step and step 8's 40-80. `hold` ~80-110 B + codes 45 B could exceed. Mitigation: codes in `core/state` if the type allows; else ask the owner (Q-B reset rule: never above 29 150 without a decision).
2. **`hold` changes the order of effects** in `commit` (events emitted before the load starts); the existing gate and server tests (`gate-property`, `source-rows-property*`, `tree-lazy-server`) are the guard: run them at the seam.
3. **Hidden columns vs sort and filter** (fact 1): a state un-hiding a column and sorting on it must patch columns first; `checkState` checks sort and filter against the columns AFTER the state's own `hidden`, not before (test in conformance).
4. **Tree and detail grids**: expansion is not saved; restoring a query on a lazy tree closes nothing (not our code), but a page restore on a client-paged tree: tested with the existing tree fixture (no crash, page clamped).
5. **O6 leak by a second path**: `stateChanged` carries the whole state (with filter). Documented: the app that writes it to an address must use `toSearchParams` (which strips) and never `JSON.stringify` into the URL; a test asserts `toSearchParams` strips even if `include` is given as `[]` or garbage.
6. **Size of the address**: 30 columns x ~40 B = 1.2 KB JSON, ~1.6 KB base64url: fine under 2 KB but near some proxies' limits with filters in. Hard limit 4 KiB on read (decision below); write above it: drop `columns` widths first? No: **write never truncates**; it returns the full text and the app decides (`stateText` length is the app's check); a documented `toSearchParams(...).toString().length` example.
7. **Debounce and focus/editing**: a state emitted while a cell is being edited must not close the editor (the feature only reads). Test: edit open + a width drag + 300 ms -> editor still open.
8. **Density before first paint** with `persistLocal`: apply it through the creation settings, not after, or the first paint shows the default height then jumps (spike S3's no-jump rule). Test in the browser: row height at the first frame.
9. **Prototype pollution and huge input** from storage or the URL (user-controlled): the never-throws test and a 4 KiB cap; arrays capped at 1 000 columns, 100 sort items.
10. **Mac and RTL**: nothing keyboard here; RTL only through logical `start`/`end` (the whole feature never says left/right).

## 10. Questions for the owner (simple French; lead's recommendation first)

**E5-1. Quand on restaure un état, combien de demandes au serveur ?** (règle : une seule ; aujourd'hui le code en envoie 3 ou 4)
- A (recommandé) : ajouter une petite couture « tenir les demandes » dans le cœur (~100 o) ; une seule demande à la restauration et au démarrage.
- B : ne rien changer au cœur ; la restauration envoie 3 ou 4 demandes (seule la dernière compte, mais le serveur les reçoit toutes).
- C : A, mais sans toucher à la marge de 220 o : on la rend sur les groupes repliables (étape 8) si besoin.

**E5-2. Combien d'octets pour les codes d'erreur de l'état (`state-version`, `state-column`, …) ?**
- A (recommandé) : ils vivent dans `core/state` (le cœur de base ne grossit pas) si les types le permettent ; sinon on vous redemande.
- B : dans le cœur de base (+~45 o, pris sur les 220 o).

**E5-3. La taille maximale d'une adresse lue (paramètre `grid=…`).**
- A (recommandé) : 4 Ko de texte ; au-delà, on ignore le paramètre (un avertissement).
- B : 2 Ko (plus sûr pour certains proxys, mais 30 colonnes avec filtres peuvent le dépasser).
- C : pas de limite (déconseillé : adresse pirate énorme).

**E5-4. Les helpers sont-ils un « feature » ou des fonctions libres ?**
- A (recommandé) : un feature `stateState()` (comme le menu et le choix des colonnes) : une grille sans l'état ne paie rien, et le démarrage lit la mémoire avant la première demande.
- B : fonctions libres seulement ; plus simple, mais `persistLocal` ne peut pas toujours éviter la première demande par défaut.

**E5-5. Les entrées Angular `state` / `stateChanged`.**
- A (recommandé) : à l'étape 12 (avec l'écran d'audit et la mesure de l'exemple).
- B : maintenant (rapide, mais il faut remesurer Angular et K.8 dans cette étape).

**E5-6. Largeur sans valeur dans l'état.** Si la colonne n'a pas de `width` dans l'état mais l'utilisateur l'avait élargie, A (recommandé) la remet à la largeur de la définition (`width: null`, Q3-3), B la laisse telle quelle. A rend la restauration exacte.

**E5-7. L'adresse de l'écran d'audit.** Aujourd'hui l'exemple n'a que `?lang=`. A (recommandé) : on branche `toSearchParams` à l'étape 12 sur l'écran d'audit de l'exemple (filtres et recherche laissés dehors, O6) ; B : dès l'étape 5 sur une page du playground seulement (ce plan), et rien dans l'exemple avant la fin.

## Done (implementer, 2026-10-26)

First pass stopped on a budget (`@dzgrid/dom/state` 1 058 / 800, rule « anything over: STOP and report »); the owner
decided **E5-8**: `dom/state` 800 → 1 150, `core/server` 6 150 confirmed (the line test written first, red, then the lines).
Then: the `movable: false` warning (+13 B, under the 15 B allowed: `state-field` on its `order`; the conformance case
`unmovable-keeps-place` changed first, red), the browser group, the demo, the docs, the gate. Nothing committed, no reviewer.

**Sizes** (gzip, minified, `check:size`'s way):

| Entry | Measured | Line | Note |
|---|---|---|---|
| `@dzgrid/core` (base) | 28 930 | 29 000 (grant 29 150) | **+0**: the seam's types only (`RowModel.hold`, `ModelEnv.held`, `StateProblemCode`, three events) |
| `@dzgrid/core/server` | 6 143 | 6 100 → **6 150** (E5-8) | the hold seam lives in the server model (`rows.ts`): **+56** under E5-1's ≤ 110 |
| `@dzgrid/core/state` | **1 499** | 1 500 | at the line after cuts (see deviations); 1 486 before the `movable: false` warning |
| `@dzgrid/dom` (base) | 21 784 | 21 980 (grant 22 400) | **+11**: `held` passed to a server model when a feature asks |
| `@dzgrid/dom/column-menu` | 4 055 | 4 300 | `densityChanged` emitted on a pick (+33) |
| `@dzgrid/dom/state` | **1 058** | 800 → **1 150** (E5-8) | first cut 1 146 |

**Requests** (`state-requests.test.ts`, the first test): red at **3** before the seam (columns patch, then `query.set`,
`page.size`, `page.go` each loading; 4 when the columns patch changes the wire form), green at **1** after.

**Tests that failed first** (in order): `scripts/test/release.test.ts` and `rebudget.test.ts` (entries, ceilings: red, then
green); `state-requests.test.ts` (3 ≠ 1); `column-menu-items` « densityChanged » (red, then the menu emits it);
`dom/test/state.test.ts` 25 of 26 red against a stub entry, then green. Written AFTER the core code (not red first, said
plainly): `state-property` (1 000 seeds LTR / RTL; 3 000 seeds green too), `state-never-throws` (2 000 values), the 23
`grid-state` conformance cases — of which `wrong-types` failed on a real bug (a width given as text passed `v > 0`), fixed.

**Deviations from the plan** (to confirm): `stateText` is the core's `canonical` (keys sorted alphabetically, not v-first:
−150 B); `STATE_CODES` is a type only (`StateProblemCode`, in the base type, 0 B); `restoreState(k, raw, env?, source?)` has no
include / exclude (an absent part is not applied: the address's missing filter / search keep the grid's own); the patch
always names every column (a state equal to the grid still sends no request; one `columnsChanged`); a `movable: false`
column keeps its slot and side (a state placing it elsewhere: `state-field` on its `order`, +13 B; its side silently); sort items not sortable / doubled / bad `nulls` are left to
the model's own refusal (`invalid-sort`); group adapter `{ collapsible, get, set }` (no `ids()`); density validated by the
DOM (`setDensity` returns false); `toSearchParams` returns `{ params, problems }` (the 4 KB warning: `state-field`, path the
parameter's name, detail `too-large`); the feature is `gridState()` (not `stateState`); `stateChanged` compares with the last
state told (a host change before a gesture rides with it); the menu now emits `densityChanged` (density.md 2) so a host
`update({ density })` is never taken for a gesture.

**Browser** (`node scripts/browser.mjs --only state`, Chrome, `playground/state.html` on 4700): 13 / 13 — fr arranged then
reloaded: the same header order, widths, row height, sort mark, page, search and state text after ONE request; ar on the same
storage: the same text, the start-pinned column on the right; the address without / with the box, opened alone, edited by hand
(`state-version`); a stale state, an all-hidden state; a restore during a slow first request; axe 0; focus kept. (First run:
axe `region` on the demo page, fixed by a `main` landmark.) `--only playground` 41 / 41 (index link added).

**Demo** `http://127.0.0.1:4700/state.html` (and `?lang=ar`; `?delay=1500` a slow server). Vite aliases `@dzgrid/core/state`,
`@dzgrid/dom/state` added (the server on 4700 reloaded its config itself, checked 200).

**Gate** (once, `caffeinate -i`, one test process): `test:ci` 440 files, 6 718 tests green; `test:perm` 5 files, 10 tests;
`typecheck`, `build` green; `check:size` 0 over (`core/state` 1 499 / 1 500, `dom/state` 1 058 / 1 150, `core/server`
6 143 / 6 150, core 28 930, DOM base 21 784, column menu 4 055 / 4 300); `check:contrast` 1 056 pairs, 0 below. No mutant
round (the combined review runs them on `core/state`).
