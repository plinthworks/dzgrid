# Step 8 blueprint: FilterKind, the custom variant, ColumnCache.values, filter-needs-server (architect, validated by the lead)

Lead decisions on the open questions: (1) `ColumnCache.values` is B2.5's per-row coerced array; the distinct index for the set filter is a separate `distinct` at step 9 — yes. (2) built-in kinds stay as they are — yes. (3) `filterKinds` fixed, `GridFeature.kinds` deferred — yes. (4) no `wire: false` marker — not now. (5) no static filter-needs-server warning at creation — no (the UI hides it, steps 12-13). (6) step 9's distinct cap — decided then.

## Findings
- The browser compiles a filter only where ops.filter is 'client' (clientRows run ~215 and afterTransaction ~289). sourceRows' inner ClientModel gets filter {} when the filter is on the server (splitQuery); toWire never compiles. So `filter-needs-server` falls out of compileFilter: raised exactly when a testless kind meets a client-placed filter. No placement logic.
- `ModelEnv.filterKinds` is typed as a WireKind lookup; the client needs `test` too: widen to a FilterKind lookup (FilterKind structurally satisfies WireKind; toWire unchanged).
- `ClientOptions` has no filterKinds; rows.ts ~142 builds the inner clientRows without env.filterKinds: a mixed setup (source, filter 'client') would say "unknown kind" for every custom filter. Fix.
- `ColumnDef.filter` is `false` only (defs.ts ~36); PartColumn already has `{kind?}`. Widen ColumnDef.filter to `false | { readonly kind?: string }` (other options come with steps 12-13). `filterable: def.filter !== false` (~149) stays right.
- The set filter already matches on `cache.exports` (filter-misc.md); step 9's distinct must key on that text.
- Latent trap in column-cache.ts `#patchLists` (~311): computes `kind`, then `void kind`, always writes `toExport(v)`. A `values` list in `#lists` would be corrupted by an update transaction. Add a branch: kind==='values' writes `v`. Widen `#list`'s kind and value types.
- `canonical(query.filter)` (query.ts ~13) runs in makeQuery before any compile: a cyclic or BigInt custom `state` from a host would overflow or throw inside `filter.column` / `filter.set`. toWire's `isJson` guards only output. Move `isJson` from wire.ts to filter/model.ts (shared); the kernel refuses a custom entry whose state is not JSON: `refuse('invalid-filter', [problem('invalid-filter','error','filter.<col>','not json')])` (kernel.ts ~320-328).
- runner.test.ts enforces one problems case per PROBLEM_CODES entry named after it: `conformance/cases/problems/filter-needs-server.json` is mandatory.

## 1. FilterKind
`packages/core/src/filter/kind.ts` (new), types exported from core index.
```ts
export interface FilterKind<S extends Json = Json, V = unknown> {
  readonly name: string;              // no dot, not empty, not a built-in name
  readonly types?: readonly ColumnType[];   // absent = any
  read(state: unknown): S | 'invalid';
  active(s: S): boolean;              // half-typed = false, no problem
  test?(s: S, ctx: LocaleCtx): (value: V | null, row: Readonly<unknown>) => boolean;
  wire?(s: S, ctx: LocaleCtx, zone: string): Json;   // default = the state
}
export type AnyFilterKind = FilterKind<any, any>;
```
Method syntax (bivariance). `V` is what codec.coerce returns; blank/unreadable is null. `row` is the host row from `env.source.rows[src]` (not the overlay). State types must be `type` aliases (document). Reserved names: text, number, day, instant, boolean, set, custom, combined. UI parts by name only: `filter.<name>`, `floating.<name>`.
Registry: `filterKindLookup(kinds?: readonly AnyFilterKind[]): { get(name): AnyFilterKind | undefined; problems: Problem[] }` in kind.ts — a Map built once; bad name or duplicate → `invalid-filter` (error) at `filterKinds[i]`, detail 'name' or 'duplicate', skipped, first wins. Export from `@dzgrid/core/internal`.
Settings: `GridSettings.filterKinds?: readonly AnyFilterKind[]`, FIXED (UPDATE_POLICY `filterKinds: 'fixed'`; live change → unsupported-live-change).
Plumbing: grid.ts `const kinds = filterKindLookup(initial.filterKinds)`; pass `filterKinds: kinds.get` (when given) to `initial.source.create({...})` and to `clientRows({...})`; emit `kinds.problems` with `told`. `ModelEnv.filterKinds` → `(name) => AnyFilterKind | undefined`; `ClientOptions.filterKinds` new; rows.ts passes env.filterKinds to the inner clientRows. GridFeature.kinds: not now. DOM cost ~60-100 B gz (base 17 002 / 17 500).
Browser compile: `compileFilter(model, env, kinds?)` (third param; harness, ColumnEnv, sort/quick untouched); thread kinds into compileOne and the combined recursion; `bad()` takes an optional detail like wire.ts. Custom case mirrors wireOne's custom case (same codes, paths, details — the wire-property parity "wire problems equal the browser's" must hold):
 1. kind = typeof f.kind==='string' ? kinds?.(f.kind) : undefined; missing → invalid-filter 'unknown kind';
 2. kind.types && !includes(col.type) → invalid-filter 'column type';
 3. read(f.state) in try/catch: throw → 'threw'; 'invalid' → 'invalid state';
 4. !active(s) → INACTIVE;
 5. !kind.test → problem('filter-needs-server','error',path,f.kind), return null;
 6. pred = kind.test(s, env.ctx) in try/catch (throw → invalid-filter 'threw'); vals = env.cache.values(col, env); return (src) => pred(vals[src], env.source.rows[src]).
A per-row throw in pred: caught, false, and `invalid-filter` 'threw' pushed ONCE to the compile's problems array (the same array returned in CompiledFilter.problems, read after the run). A custom filter inside combined is allowed.

## 2. ColumnCache.values and the step 9 seam
`values(col, env): readonly unknown[]` — one entry per source row: `coerceCell(...).v` (blank/unreadable null), through the edit overlay like exports. Memo key: col identity, source.version, reader.version, listCtx(env) (locale|numerals|timeZone). Reuse the `#list` machinery with the widening and the #patchLists branch. Stats `valueBuilds`. Dropped by invalidateAll, patched by patch for changedSrc. Not capped (one array per column, lazy, only for a column with an active custom filter). Bench `custom kind test 100 000 rows` ≤ 15 ms (perf/budgets.json) if the bench harness takes it easily.
Step 9 seam: docs only (distinct(col, env, {collator, search?, max?}) on exports + codec.format labels; {values: SetValue[]; blanks; truncated}; counts ignore the column's own filter; cap decided at step 9; RowModel.setValues?, DataSource.values through `values:<col>`).

## 3. filter-needs-server
Add to PROBLEM_CODES. Severity error; the filter is dropped (like invalid-filter). Path `filter.<col>` or `filter.<col>.conditions[i]`. Detail: the kind name (never row data). Raised by compileFilter only (browser placement) for an ACTIVE custom filter whose kind has no test. Not for an inactive state; not for an unknown kind (invalid-filter); not on server placement (toWire silent, missing wire defaults to the state). Told through ModelChange.problems / the kernel's problems event on the filter change — assert exactly one problems event per filter.column dispatch.
Conformance `conformance/cases/problems/filter-needs-server.json`: op 'filter', `kinds: ["server-only"]`, a custom filter on a number column → `[{code:"filter-needs-server",severity:"error",path:"filter.n"}]`.

## 4. Files and tests first
Source: core filter/kind.ts (new), filter/model.ts (isJson moved here; WireKind unchanged), filter/compile.ts, model/column-cache.ts, model/client.ts (ClientOptions.filterKinds, ModelEnv.filterKinds, kinds to compileFilter at both call sites), server/rows.ts (~142), kernel.ts (JSON guard on custom states), problems.ts, columns/defs.ts, index.ts and internal.ts exports; dom settings.ts, update.ts, grid.ts.
Conformance: shared fixture table `conformance/runner/kinds.ts` (`between` with test and {lo,hi} state as in wire.ts, `server-only` without test, `throws-test`); wire.ts imports it instead of its local table; filter.ts adds suite `filter-custom` (input.kinds → third argument); problems op 'filter' passes kinds; source.ts runSource accepts kinds. Cases: filter-custom/between-range, filter-custom/inactive-all-rows, filter-custom/unknown-kind, filter-custom/in-combined, problems/filter-needs-server, source-model/custom-client-needs-server (filter 'client' with a source → the problem), source-model/custom-server-sends-wire (filter 'server' → no problem, request carries {type:'custom',kind,value}).
Unit (packages/core/test/custom-filter.test.ts): read invalid / throws / types; test throws per row (told once); memo (no valueBuilds growth on a sort change); a patch after an update transaction equals a rebuild (guards #patchLists); a cyclic state refused by the kernel; the registry (duplicate, reserved, dot); exactly one problems event per filter.column. public-api.test.ts for new exports. DOM: filterKinds reach both models; live change refused; registry problems told at creation.
Property: extend wire-property.test.ts with seeded `between` states incl. half-typed (browser result equals an oracle reading only the wire value; wire problems equal the browser's); a cache property: random update transactions, values() after patch equals a cold rebuild.
Docs: new sheet docs/behaviors/filter-custom.md BEFORE code (contract, placement, the problem and its told-once rule); short updates server-filter.md, filter-misc.md (values/distinct split), phase-3-plugins.md B2.5, ARCHITECTURE "Décisions de l'étape 8" (French), ROADMAP step 8 line (sizes).
Budgets: core ≤ 24 000 (now 23 016; estimate +450-650), dom ≤ 17 500, /server ≤ 6 000 over the core. If core goes over, STOP and report (owner decision needed) — do not raise any budget.

## 5. Edge cases (decided)
- Column filter.kind vs a filter's kind: no cross-check (the model decides what applies; the column's kind picks the UI).
- Unknown column filter.kind: UI resolution, steps 12-13.
- A kind whose test depends on language/zone: the filter stage reruns on ctxKey change.
- Registry fixed: a saved filter naming an unregistered kind → invalid-filter 'unknown kind', never a crash.
- Hidden column with a custom filter: applied.
- Edit overlay: values read through the overlay, `row` is the base row (document).
- membershipOf unchanged (the canonical filter, state included, keys the selection scope).
