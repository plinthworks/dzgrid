# Filters plan: several conditions, list + condition, the advanced filter (Phase 9, for 1.3.0)

Sources: ARCHITECTURE owner decisions (K.6 rank 8 « filtre avancé »; Phase 3 « constructeur de règles ET/OU en
Phase 9 »), §2 feature table (l. 755 « Deux conditions ET / OU par colonne », l. 757 « Filtre multiple », l. 761
« Filtre avancé »), §3.5 (l. 1094–1096: `combined`, the first sketch of `AdvancedFilter`), §6 Phase 9 (l. 1870:
`core/advanced-filter`, `dom/advanced-filter`); `docs/behaviors/{filter-ui,filter-text,filter-set,server-filter,
grid-state,csv-export,server-selection,tree-filter}.md`; `packages/core/src/filter/{model,compile,kind}.ts`,
`server/{wire,rows,source}.ts`, `model/{client,query,operations}.ts`, `kernel.ts`, `state/state.ts`, `csv/rows.ts`;
`packages/dom/src/filters/**`, `edit/stale.ts`, `export/run/request.ts`; the owner's translator
(`playground/demos/to-query.ts`, copy of his `to-query.ts`); `npm run check:size` run on 2026-11-02. What other grids
show (a « + condition », a list and a condition on one column, a rule builder over several columns) is named from
their public pages, nothing read (CLEANROOM.md).
Plan only; nothing coded. Sheet → tests first (red) → code → review → gate.

## 0. What the code already holds

- **`combined` is general already.** `{type: 'combined', join, conditions}` takes any number of members, of any
  kind the column accepts (a `set` and a `text` together compile today), and nests: `MAX_DEPTH = 3` in
  `filter/compile.ts` and in `server/wire.ts`, the same drop rules both sides (half-typed member dropped, one bad
  member drops the whole, one member left stays combined). No member cap. Conformance: `filter-combined/*`,
  `wire/combined-drop-member.json`.
  → Parts 1 and 2 need **no change to the core model, compile or wire**. Only the DOM forms and the texts.
- **`caseSensitive`** is in the text model, compiled (`haystack('exact')`) and wired (`caseSensitive` only when
  true). Only the checkbox is missing (deferred, decision O4 of step 13, `filter-ui.md` l. 25).
- **The floating row** already gives way to the summary (« Filtre actif ») for a combined filter.
- **The advanced filter has nothing yet.** `Query` is `{sort, filter, quick, key}`; `FilterModel` is per column,
  joined by AND. A rule across columns needs a new place in the query.
- **Budgets are full where it matters**: core 29 147 / 29 150, core/server 6 142 / 6 200, core/state 1 500 / 1 510,
  dom 22 428 / 22 440, dom/edit 4 150 / 4 150, filters 10 207 / 10 210, set chunk 4 499 / 4 500, Angular
  7 436 / 7 450, K.8 85 280 / 90 000. Every part below moves at least one of them (§6).

## 1. Several conditions in a column's popup (text, number, day, instant)

**Behaviour.** A « + Ajouter une condition » button under the last condition adds a row (operator + value, the
same fields as today). From the second row on, one AND/OR choice (a radio pair, « Toutes (ET) » / « Au moins une
(OU) ») sits above the second row and applies to all rows: the popup edits a **flat** combined filter, one join.
Each extra row has « Retirer ». Focus: after adding, the new row's operator (or its value when one operator); after
removing, the row before's value, else the add button. Announced once: `filter.conditionAdded` /
`filter.conditionRemoved`. A row half-typed is dropped from what is applied (today's L1 rule per row); a filter
with one live row is stored plain (not combined), so the wire is today's when only one row is used.
A combined filter the popup cannot show (nested, mixed kinds, more rows than allowed) shows « Filtre actif » (today).

**Maximum.** Default **1 row: today exactly** (no button). `filters({ maxConditions: n })` for the grid and
`filter.maxConditions` on a column, 1 to 5 (outside: the default, `invalid-column` warning at
`columns.<id>.filter.maxConditions`). Five is a UI cap only; the model keeps no cap (a host may set more; the
popup then shows the summary). Owner Q-F2.

**Match case.** A checkbox « Respecter la casse » per text row, writing that row's `caseSensitive`. Shown with
`filters({ matchCase: true })` or `filter.matchCase: true` (default: hidden, today). The floating box keeps
`caseSensitive` as it does now.

**Floating row.** A combined filter's summary says how many conditions: `filter.summaryConditions {n}` (« 2
conditions », plural rules per language), still a button opening the popup, Clear beside it. Other summaries
unchanged.

**API (default = today).** `filters({ maxConditions?, matchCase? })`; `ColumnDef.filter.{maxConditions?,
matchCase?}` (optional fields added: a widening, `check:api` passes). No core change.

**Core vs DOM.** DOM only: `filters/forms.ts` (rows, join, add/remove, focus), `filters/inputs.ts` (checkbox),
`filters/summary.ts`, `filters/resolve.ts` (options), `filters/index.ts`; texts `locales/{en,fr,ar}-filters.ts`
(`conditionAdd`, `conditionRemove {n}`, `joinLabel`, `joinAnd`, `joinOr`, `matchCase`, `conditionAdded`,
`conditionRemoved`, `summaryConditions`); `core/src/columns/defs.ts` (type only, 0 B);
`theme/dzgrid.css` (row spacing, logical sides only).

**Sheet first.** New `docs/behaviors/filter-combined.md` (the conformance folder of that name exists); edits to
`filter-ui.md` (l. 18, 25: O4 lifted), `filter-text.md` (match case).

**Tests first.**
- `dom/test/filters-conditions.test.ts`: add, remove, join switch, focus after each, announcement once, the
  draft rules (L1 per row; one live row stored plain), `maxConditions` 1 shows no button, 5 stops at 5, 6 is the
  default with one warning; server or `apply: 'button'`: one request at Apply; a nested filter from the host shows
  the summary; echo (a filter set from elsewhere rewrites a form not being edited).
- `filters-match-case.test.ts`: the box ticks → `{caseSensitive: true}`; unticked → the field absent.
- Floating: « 2 conditions » with the right plural in ar (2, 3, 11).
- RTL: Arabic page, the join pair and the rows in logical order (`scripts/browser.mjs`, `filters=1&popup=1&conds=1`).
- **Planted fault**: a test that swaps `and`/`or` when writing the draft must turn the suite red (kept as a
  self-check like `purity.test.ts`).
- Conformance: nothing new in the core; three cases added to `filter-combined/` for what the UI now produces
  (three OR rows, text case-sensitive inside OR, number between inside AND), expectations by hand.

**Server wire.** Unchanged: `{type: 'combined', join, conditions: [...]}` as today.
**Owner's translator** (ag-like `filterModelRequest`): a flat combined of one kind →
`{ filterType: 'text'|'number'|'date', operator: 'AND'|'OR', conditions: [ {filterType, type, filter, filterTo?} … ] }`;
ops renamed as his backend expects (`lt` → `lessThan`, `between` → `inRange`…). His backend must read `operator`
and `conditions` first; until then the app keeps `maxConditions` at 1 on server columns (today's translator
warns and drops an untranslated filter, which would show more rows than asked: never enable before the backend).

## 2. A value list and a condition on one column (« multi »)

**Storage: no new type.** The two parts are a `combined` with `join: 'and'`: `{type: 'combined', join: 'and',
conditions: [<condition>, {type: 'set', …}]}`. Already compiled, wired, saved, restored. Only one part in use →
stored plain (a `set`, or a condition), so a grid using the list alone sends what it sends today. A new kind name
(`multi`) is avoided: it would have to be reserved in `filterKindLookup`, refusing an existing custom kind of that
name (a narrowing).

**Column setting.** `filter: { kind: 'set', condition: true }` (the condition's kind follows the column type: text,
number, day, instant). Without `condition`, today's set popup exactly.

**Shown stacked** (owner Q-F3): the condition at the top (one row, or several with `maxConditions`; then the
condition part is itself a flat combined, nested once under the AND, depth 2 ≤ 3), a separator, the list below; one
footer (Clear empties both, Apply sends both). The list's counts ignore the column's whole filter, list and
condition (today's rule « never this column's own », same on the server's `values()`; no server change): the sheet
says that ticking a value the condition excludes gives no row.

**Floating row.** Summary « Filtre actif » (as a set today).

**Core vs DOM.** DOM only: the set chunk (`filters/set/index.ts`, `draft.ts`) hosts the condition body from
`forms.ts` above its list; `filters/resolve.ts` reads `condition`. Core: `columns/defs.ts` type only.

**Sheet first.** New `docs/behaviors/filter-multi.md`; `filter-set.md` (« with a condition »).

**Tests first.** `dom/test/filters-multi.test.ts`: tick + type → combined AND with both; untick all values that
were the only part → the condition alone, plain; Clear → no filter; server: one request at Apply; keyboard (Tab
from the condition to the list's search, to the list, to the footer); a host's combined that is not [condition, set]
→ summary. Conformance `filter-combined/multi-set-and-text.json`, `multi-set-and-number-between.json` (by hand).
Planted fault: drop the set member when the condition is inactive must fail one test.

**Server wire.** Unchanged (a combined). **Translator**: a combined AND holding a `set` →
`{ filterType: 'multi', filterModels: [ <condition or null>, { filterType: 'set', values } ] }`. Same rule: the
backend first.

## 3. The advanced filter (one rule over several columns)

### 3.1 Opt-in, and its relation to the column filters
- **Opt-in**: nothing changes without `advancedFilter()` from `@dzgrid/dom/advanced-filter` in `features`. Without
  it, `Query` and every request key are byte for byte today's (the field is absent, not null; a hand-written key
  test pins it).
- **With it** (owner Q-F1, recommendation **both apply, AND**): the rule and the column filters both filter, joined
  by AND, in the browser and on the wire. Reasons: nothing is hidden (column marks and the bar each show their
  part), no conversion code, and « one or the other » stays possible by configuration (`filters({ popup: false,
  floating: false })`, or no `filters()` column on the grid). The bar says « + N column filters » with a Clear when
  both are in force.

### 3.2 Model (core, pure)
```ts
type AdvancedFilter = { readonly join: 'and' | 'or'; readonly items: readonly AdvancedItem[] };
type AdvancedItem = AdvancedFilter | { readonly column: string; readonly filter: ColumnFilter };
```
(the shape of ARCHITECTURE l. 1095). A leaf is one condition: any `ColumnFilter` except `combined` (groups do
that; refused `invalid-filter` detail `combined`). Caps: groups nested 3 deep below the root (the combined's depth),
50 leaves (`invalid-filter` detail `depth` / `size` at the path). Paths `advanced.items[2].items[0]`. Problems
carry code, path, detail, never a typed value (a value may be a name or a record number).
Rules, the same as a column filter's: unknown column → `unknown-column`, leaf dropped; a column with `filter:
false` or a wrong kind → `invalid-filter`, leaf dropped; half-typed leaf → dropped silently; an empty group →
dropped; a group with one live item = that item; an empty tree = no rule. A hidden column's leaf still filters.

**Where it lives.** `Query.advanced?: AdvancedFilter` (absent = none), `makeQuery` writes it into `key` only when
present. Kernel: command `advanced.set {advanced | null}`, and `query.set` carries it (absent in the command = kept;
`null` = cleared); event `filterChanged` gains `advanced?`; `selection.keepOnFilter: false` clears the selection on
a rule change too. The command is refused (`missing-feature`, detail `advanced-filter`) when no engine was given:
a query never holds a rule nobody can apply.

**Engine seam** (keeps core main small): `@dzgrid/core/advanced-filter` exports `advancedEngine` = `{ read(tree) →
{tree, problems}, compile(tree, env, kinds) → CompiledFilter }`; the compile reuses `compileOne` (moved to
`@dzgrid/core/internal`). The DOM feature hands it to the model (`ModelEnv.advanced`), as `filterKinds` is handed
today. The core main pays only the seam calls.

### 3.3 Every place that recomputes the filter (each must take the rule; the review checks this list)
1. Client rows: `model/client.ts` (compile at 411 and 564, the stale snapshot at 558, `appliedKey` at 640).
2. Value-list counts: `client.ts` 495–510 (the rule applies whole; only the list's own column filter is left out)
   and the server's `ValuesRequest` (carries `advanced`).
3. Operations split: `model/operations.ts` 96–100 (`filter: 'server'` sends the rule, `client` keeps it).
4. Every `makeQuery` in `kernel.ts` (sort 503, quick 560, filter.column 553): a sort or a search keeps the rule.
5. Server wire: `server/rows.ts` 376 (`DataRequest.advanced`), request key, epoch.
6. Server « select all » scope (`server-selection.md`: bound to filters and search → and the rule).
7. CSV: `dom/export/run/request.ts` 26 (`server.advanced`); `ExportRequest.query` holds it; `displayed` and
   `all` in the browser read the filtered rows already.
8. Edited rows that stop matching: `dom/edit/stale.ts` 46 and 75 (a column used by the rule counts as filtered).
9. Tree filter (`tree-filter.md`): same row test, nothing more, one test to prove it.
10. Saved state and URL: `state/state.ts` (part `filter` carries `advanced`; read with the same checks; an
    address writes it only with `include: ['filter']`, as typed filters today, health data rule 19).
11. The no-match overlay's `clearFilters()` and the bar's Clear-all: one `query.set` clearing both.
12. Angular: input `advancedFilter`, output in `filterChanged`.
Print and clipboard read the displayed rows: nothing to do (checked in the review).

### 3.4 Server wire (a tree)
`DataRequest.advanced?: WireAdvanced`, `WireAdvanced = { join, items: (WireAdvanced | { column, filter: WireFilter
})[] }`: each leaf wired by today's per-kind rules (instants with `resolved`, days plain, shortcuts resolved from
`now`), the tree cleaned by §3.2's rules. Absent when no rule. The `wireAdvanced` function lives in
`@dzgrid/core/server` (only server grids pay), reusing `wireOne`.
**Translator**: a new body field next to `filterModelRequest`:
`advancedFilterModel: { filterType: 'join', type: 'AND'|'OR', conditions: [ { filterType, colId, type, filter,
filterTo? } | <join> … ] }` (join ↔ join, leaf ↔ `colId` + the same leaf mapping as a column condition; a day leaf
→ `filterType: 'date'` with the day, an instant leaf → its `resolved` bounds). With both in force (Q-F1) the
backend ANDs `filterModelRequest` and `advancedFilterModel`. The demo `to-query.ts` and its spec get the mapping and
hand-written cases (§5, F4); the backend must read it before an app turns the rule on.

### 3.5 The builder (DOM, `@dzgrid/dom/advanced-filter`)
- **Where** (owner Q-F5): a one-line bar above the grid showing the rule in words (« Âge > 30 ET (Ville = Paris OU
  Ville = Lyon) », values in `<bdi>`), « Modifier » and « Effacer »; `advancedFilter({ bar: false })` hides it and
  the app opens the builder with `open()`. The builder is a modal dialog from the popup host (top layer, focus
  trapped, Escape closes, focus back to the opener), named `advanced.title`.
- **Content**: native controls only, nested `fieldset`/`legend` (a group's legend: « Groupe 2 — toutes les
  conditions (ET) »; a row's visually hidden legend « Condition 3 »). Per group: a join select (ET / OU), the items,
  « + Condition », « + Groupe » (up to the depth cap), « Retirer le groupe ». Per row: column select (filterable
  columns, header names), operator select (the column kind's operators and its `filter.ops`), the value field(s)
  borrowed from the filters feature's form bodies (`Body` of `forms.ts`, so text, number, dates and the reading of
  numbers in the locale are the popup's, not a copy), « Retirer ».
- **Requires `filters()`** for those bodies; without it, `missing-feature` (detail `@dzgrid/dom/filters`) and no
  bar. With `filters-base`, date columns are not offered in the builder (same warning as today).
- **Apply**: always a draft (Apply sends one query, Escape or Cancel drops it), in the browser too: a rule over
  several columns half-built would filter strangely as you type. Apply with a field that does not read: marked,
  said once, focused (the popup's rule).
- **Keyboard**: Tab through controls in reading order; no custom roving, no `role=tree` (native order is what
  screen readers handle best). Adding moves focus to the new row's column select; removing to the previous row,
  else the group's « + Condition ». Each add/remove/join change announced once (`advanced.added`,
  `advanced.removed`, `advanced.joinChanged`). Enter in a value field applies (as the popup).
- **RTL**: indentation by `padding-inline-start`, the group line by `border-inline-start`; the bar's text built as
  isolated pieces (`<bdi>` per column name and value) so « ET / و » and values in two scripts read in order.
- **A11y protocol**: new section 23 in `docs/a11y-protocol.md` (NVDA + Firefox, VoiceOver + Safari, TalkBack):
  build « A ET (B OU C) » blind, change a join, remove a group, apply; axe on the dialog fr light and ar dark RTL.

### 3.6 Text form with autocomplete
Not in this pass (owner Q-F4): a parser, a combobox with suggestions in three languages and an RTL caret are
≈ 3 sessions and a new 3 kB+. The model and wire above do not change when it comes later.

### 3.7 Files
Core: `filter/advanced.ts` (new: types, read, compile), `advanced-filter.ts` (new entry), `model/query.ts`,
`kernel.ts`, `model/client.ts`, `model/operations.ts`, `internal.ts` (`compileOne`), `server/wire.ts`,
`server/rows.ts`, `server/values.ts`, `server/source.ts` (types), `state/state.ts`, `csv/rows.ts` (type),
`problems.ts` (no new code: `invalid-filter`, `unknown-column`, `missing-feature`), `index.ts` (types only).
DOM: `advanced-filter.ts` (new entry), `advanced-filter/{index,builder,bar,row,group,summary,styles}.ts` (new),
`filters/index.ts` (expose the bodies through the feature handle), `edit/stale.ts`, `export/run/request.ts`,
`part.ts` (`clearFilters` clears both), `locales/{en,fr,ar}-advanced.ts` (new); theme `advanced-filter.css` (new).
Angular: `grid.ts` (input, event). Build: `package.json` exports (`./advanced-filter` in core and dom),
`size-budget.json`, `api/*.api.txt` (new entries).

### 3.8 Sheets first
New `docs/behaviors/advanced-filter.md` (model, rules, opt-in, AND with column filters, bar, builder, keys,
a11y, RTL, wire, state). Edits: `server-filter.md` (tree), `grid-state.md` (advanced in `filter`), `csv-export.md`,
`server-selection.md`, `edit-reapply.md` (stale), `tree-filter.md` (one line), `filter-set.md` (counts).

### 3.9 Tests first
- Conformance (core, by hand): new suite `conformance/cases/advanced-filter/` — and/or, nested « A ET (B OU C) »,
  empty group dropped, one-item group, unknown column dropped with problem, half-typed leaf, depth and size caps,
  combined leaf refused, AND with a column filter, instant leaf in Kathmandu, day leaf, hidden column; `wire/
  advanced-*.json` (tree cleaned, `resolved` on an instant leaf, absent when no rule); `grid-state/advanced-*`
  (saved, URL without and with `include`).
- `core/test/advanced-key.test.ts`: a grid without the feature: `Query.key` and `DataRequest.key` equal to a
  hand-written string, as before the change. `advanced-sites.test.ts`: one case per site of §3.3 (sort keeps the
  rule; the value list counts with it; CSV `all` on a server carries it; « select all » scope changes with it;
  `keepOnFilter: false` clears; stale edit marked).
- `core/test/advanced-property.test.ts`: seeded trees over the 13 zones; the browser's rows equal an oracle that
  reads the wire tree only; problems equal both sides (the method of `wire-property.test.ts`).
- DOM: `advanced-builder.test.ts` (build, nest, remove, focus after each, announcements, apply/cancel, server one
  request, unreadable number), `advanced-bar.test.ts` (text in fr/ar, `<bdi>`, Clear), `advanced-rtl` checks in
  `scripts/browser.mjs` (`advanced=1`, ar dark), axe in `scripts/audit-browser.mjs`.
- **Planted faults**: (a) compile `or` as `and` in one group → conformance red; (b) a `makeQuery` site dropping
  `advanced` → `advanced-sites` red; (c) the key test with `advanced: null` written instead of absent → red.
- Purity: `core/test/purity.test.ts` covers the new files (no DOM, no Date, no clock).

## 4. Owner questions

- **Q-F1** Filtre avancé activé : il s'ajoute aux filtres de colonne (les deux comptent), ou il les remplace ?
  *Recommandation* : il s'ajoute (ET). L'utilisateur voit sa règle dans la barre et ses filtres de colonne aux
  en-têtes. Pour « l'un ou l'autre », l'app éteint simplement les boutons de colonne.
- **Q-F2** « + Ajouter une condition » et « Respecter la casse » : visibles d'office, ou seulement si l'app le
  demande ? *Recommandation* : seulement si l'app le demande ; jusqu'à 5 conditions. Une grille d'aujourd'hui ne
  change pas d'un pixel.
- **Q-F3** Liste de valeurs + condition sur une colonne : l'une sous l'autre dans la même fenêtre, ou deux onglets ?
  *Recommandation* : l'une sous l'autre (la condition en haut, la liste dessous) : tout se voit, plus simple au
  clavier.
- **Q-F4** Taper la règle au clavier avec des suggestions (« Âge > 30 ET … ») dans ce lot ?
  *Recommandation* : non, plus tard (≈ 3 séances). Le constructeur à boutons suffit et marche au lecteur d'écran.
- **Q-F5** Où l'utilisateur voit le filtre avancé : une barre d'une ligne au-dessus de la grille (la règle en mots,
  « Modifier », « Effacer »), ou seulement un bouton de l'app ?
  *Recommandation* : la barre, que l'app peut cacher (`bar: false`).
- **Q-F6** Tailles (§6) : accepter les hausses estimées, mesurées et redemandées à chaque étape au-delà de +2 % ?
  *Recommandation* : oui.

## 5. Sub-steps (effort in sessions)

| Step | Content | Sessions |
|---|---|---|
| F0 | Sheets (`filter-combined`, `filter-multi`, `advanced-filter`, edits), conformance cases by hand, owner answers | 1 |
| F1 | Several conditions + match case + floating « n conditions » (DOM, locales, theme) | 2 |
| F2 | List + condition (set chunk, forms), translator lines for combined and multi | 1.5 |
| F3 | Core: `Query.advanced`, kernel, client model seam, `core/advanced-filter`, state and URL, sites 1–4, 9–11 | 2 |
| F4 | Server: wire tree, `DataRequest`/`ValuesRequest`/CSV/select-all/stale (sites 5–8), property test, translator `advancedFilterModel` + spec | 1.5 |
| F5 | DOM builder and bar: dialog, groups, keys, focus, announcements, locales en/fr/ar, RTL, `advanced-filter.css` | 3 |
| F6 | Angular input/event, playground page, Chrome + Firefox + WebKit, axe, a11y protocol §23, `test:real-app`, sizes, architect check + code review, fixes, gate | 1.5 |
| | **Total** (text form excluded; + 3 if Q-F4 is yes) | **12.5** |

F1 and F2 ship value alone (no core change) and can be released before F3–F6 if the owner wants. Each step ends
with `npm run gate:step`.

## 6. Sizes (gzipped, minified; measured today → estimated → line asked)

| Entry | Today / budget | Estimate | Ask |
|---|---|---|---|
| `@dzgrid/core` (Query field, command, event, seam calls) | 29 147 / 29 150 | +250 → 29 400 | 29 450 |
| `@dzgrid/core/advanced-filter` (new, over core) | — | 1 100 | 1 250 |
| `@dzgrid/core/server` (`wireAdvanced`, values request) | 6 142 / 6 200 | +250 → 6 400 | 6 450 |
| `@dzgrid/core/state` | 1 500 / 1 510 | +60 | 1 600 |
| `@dzgrid/dom` (clear-all clears both) | 22 428 / 22 440 | +30 | 22 500 |
| `@dzgrid/dom/edit` (stale reads the rule) | 4 150 / 4 150 | +40 | 4 200 |
| `@dzgrid/dom/filters` and `filters-base` (rows, join, match case, summary, bodies exposed) | 10 207 / 10 210 | +1 100 → 11 300 | 11 400 |
| `@dzgrid/dom/filters: set (lazy)` (condition above the list) | 4 499 / 4 500 | +300 | 4 850 |
| `@dzgrid/dom/advanced-filter` (new, over popup) | — | 5 000 | 5 500 |
| `locales/{en,fr,ar}-filters` | 744 / 869 / 992 | +120 / +140 / +200 | 900 / 1 050 / 1 200 |
| `locales/{en,fr,ar}-advanced` (new) | — | 330 / 380 / 470 | 350 / 400 / 500 |
| `@dzgrid/theme/advanced-filter.css` (new) | — | 550 | 650 |
| `@dzgrid/theme` (condition rows) | 2 767 / 2 850 | +40 | 2 850 kept |
| `@dzgrid/angular` | 7 436 / 7 450 | +100 | 7 600 |
| export run (lazy) | — / 5 300 | +30 | 5 300 kept |
| K.8 audit profile (uses filters) | 85 280 / 90 000 | +1 150 → ≈ 86 450 | 90 000 kept |

A grid without the advanced filter pays only the core seam (≈ 250 B) and, if it uses `filters()`, the condition
rows (≈ 1.1 kB). Estimates only: each step measures with `npm run check:size` on minified code and asks again when
over by more than 2 %.
