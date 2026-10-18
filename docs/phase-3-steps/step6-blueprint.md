# Step 6 blueprint: `toWire` (architect, validated by the lead)

## 0. Facts
- `server/wire.ts` is `toWire = (f) => f`; `rows.ts` `load()` calls it on every load.
- `rows.ts` epochKey/rekey use `server.key` (model-form key from splitQuery) + zone + params: a half-typed or invalid filter edit starts a new epoch and a refetch. The wire form fixes that (§2).
- `rows.ts` `unfiltered()` and `counts.total` read `Object.keys(server.filter)`: they must read the wire filter.
- `resolveInstantRange` (filter/instant.ts) already returns `{from, to}` in ms (half-open, null = open, "after" = +1 ms), sorts swapped days, returns problems (`invalid-day`, `invalid-instant`, `ambiguous-instant`). Reuse it; never reimplement.
- No relative presets in Phase 3 (owner decision 7: Phase 5). No "now" needed.
- `FilterKind` and the `custom` variant come at step 8 (B2.5).
- `localeCtx` throws on an unknown zone: `toWire` may assume a known zone.
- Doc conflicts to fix: ARCHITECTURE ~L674 and filter-day.md L12 say a day filter travels as inclusive {from,to} — wrong, it travels as the model (op/value/valueTo). ARCHITECTURE ~L672 shows `...Z` without ms — the wire uses fixed-width ms. The old plan numbers this "Step 5" with `toWire(model, cols, ctx)` — superseded.
- Budget: owner decision, `/server` 6 kB during Phase 3 (already in size-budget.json). Measured 2 743 B gz over the core before step 6.

## 1. API
```ts
// core/src/server/wire.ts (re-exported from server.ts; source.ts imports the type from here)
export interface WireEnv<T> {
  readonly ctx: LocaleCtx;                      // ctx.timeZone is the grid zone
  readonly columns: ColumnLookup<T>;
  readonly kinds?: (name: string) => WireKind | undefined;
  // reserved, NOT added in step 6: readonly now?: number   (Phase 5)
}
export function toWire<T>(f: FilterModel, env: WireEnv<T>): { readonly filter: WireFilterModel; readonly problems: readonly Problem[] };

export type WireFilterModel = Readonly<Record<string, WireFilter>>;
export type WireFilter =
 | { type:'text'; op:TextOp; value?:string; caseSensitive?:boolean }
 | { type:'number'; op:NumOp; value?:number; valueTo?:number }
 | { type:'day'; op:NumOp; value?:Day; valueTo?:Day }            // civil days, no zone
 | { type:'instant'; op:'blank'|'notBlank' }
 | { type:'instant'; op:'onDay'|'betweenDays'|'before'|'after'|'between'; day?:Day; dayTo?:Day; at?:string; atTo?:string;
     resolved:{ from:string|null; to:string|null }; zone:string }
 | { type:'boolean'; value:boolean }
 | { type:'set'; include?:readonly string[]; exclude?:readonly string[]; blanks?:'include'|'exclude' }
 | { type:'combined'; join:'and'|'or'; conditions:readonly WireFilter[] }
 | { type:'custom'; kind:string; value:Json };
```
A narrowed discriminated union (not `ColumnFilter & {...}`) so the host's mapping can switch exhaustively. Match the existing FilterModel names exactly (read filter/model.ts): if an op or field name differs from this sketch, the model's name wins.

Rules per kind (the wire is the model, cleaned and made absolute):
- Common: filters apply whatever the column's visibility (as compileFilter: existence and `filterable`). Unknown column → `unknown-column`; `filterable` false or type mismatch → `invalid-filter`; both errors at `filter.<col>`, filter dropped. Inactive (half-typed) filters dropped with no problem. Reuse the client's problem codes and paths; no new codes.
- Text: empty/undefined value (except blank/notBlank) dropped; blank/notBlank carry no value (strip it). Value raw, NOT folded (folding is the server's). Keep caseSensitive.
- Number: non-finite → `invalid-filter`. between ordered lo <= hi (as the client). Half-typed dropped.
- Day: values normalised with parseDay to `YYYY-MM-DD`; bad day → `invalid-day`; no zone, never an instant; between ordered, inclusive.
- Instant: blank/notBlank as `{type, op}`. Range ops keep original fields and add `resolved` and `zone`. `resolved` from `resolveInstantRange(f, ctx.timeZone)`: half-open [from, to), null = open. Format always fixed width `YYYY-MM-DDTHH:mm:ss.sssZ`, UTC, 3-digit ms even when zero (string comparison = time comparison; "after" = `...00.001Z`). The formatter is a small ms→ISO function in wire.ts with no Date (purity scan). Keep conformance/runner/iso.ts independent as a second oracle. Outside years 0000–9999 → `invalid-instant` at `.resolved`, dropped. A skipped day (Apia 2011-12-30) gives from == to: send as is. The server uses `resolved` only.
- Boolean: null dropped.
- Set: pass through as is; `include: []` preserved (matches nothing except blanks if asked); include and exclude both present → `invalid-filter`.
- Combined: structure kept, depth limit 3 as on the client; inactive members dropped; no live member → dropped; one invalid member drops the whole combined (as the client); one live member stays combined (no unwrap).
- Custom (wire form from B2.5): `{type:'custom', kind, value: kind.wire?.(s, ctx, zone) ?? s}` (model field `state`, wire field `value`). Serializer on the FilterKind, not the column. Step 6 declares a minimal structural `WireKind = { read(s): Json|'invalid'; active(s): boolean; wire?(s, ctx, zone): Json; types?: readonly ColumnType[] }`; step 8's FilterKind satisfies it. Step 6 adds `{type:'custom'; kind; state:Json}` to ColumnFilter (types only); until step 8, compileOne falls to default and reports `invalid-filter`. ModelEnv gains optional `filterKinds` (plumbing from createGrid is step 8). Problems, all `invalid-filter` with a detail: unknown kind; read 'invalid'; types mismatch; wire throws; wire returns non-JSON (undefined, NaN, Infinity, function, cycle, non-plain object, depth > 20; a bounded isJson). `!active(s)` → dropped, no problem.
- Problems for a filter that cannot go on the wire: dropped, reported as errors. Store in rows.ts (`wireProblems`), included in `problems()`. Recompute at restart()/rekey() only; page loads reuse the cached wire.

## 2. Request key / epoch
- In rows.ts compute `wire = toWire(server.filter, {ctx, columns, kinds})` in restart()/rekey(); `epochKey = canonical({filter: wire.filter, quick, sort, zone: ctx.timeZone, params})`; load() reuses the cached wire.filter. A half-typed or invalid edit then changes nothing: no new epoch, no page reset, no refetch (deliberate; write it in operations.md). The filter is still present as `{}` under server placement, as today.
- A zone change changes `resolved` (key changes, already through ctx.timeZone). A language change asks nothing unless a custom kind's wire depends on locale.
- setColumns must rekey() when columns.dataVersion changed (filterable, type or removal change what drops).
- unfiltered() and counts.total read wire.filter.
- Relative presets: Phase 5 only (reserve `now` in WireEnv; nothing else now).

## 3. Files, tests first
1. `docs/behaviors/server-filter.md` (new sheet, our words, before code): shape per kind, fixed-ms UTC, half-open, civil days, drops and problems, key effect. Update filter-day.md L12, filter-instant.md (resolved/zone/format), operations.md (the key is the wire's; an inactive edit does not refetch), request-order.md (key note), ARCHITECTURE (~L668–674: ms format, day shape, step numbering; one "Étape 6" decision line under « Décisions de la Phase 3 »), phase-3-plugins.md B1.3 (signature), phase-3-plan.md (old signature superseded), ROADMAP step 6 entry, size-budget.json $comment if useful.
2. `packages/core/test/wire.test.ts`: one case per kind and drop rule; JSON round trip equals the value; hidden-column filter sent; custom with default wire, throwing wire, non-JSON wire; combined (member dropped, invalid member, depth 3); swapped number/day/instant ranges; include [] preserved.
3. `packages/core/test/wire-property.test.ts` (seeded `test/support/rng.ts`): zones Africa/Algiers, Europe/Paris, Asia/Kolkata, Asia/Kathmandu, Pacific/Chatham, Australia/Lord_Howe, Pacific/Apia, America/Sao_Paulo, America/Havana, America/Los_Angeles, Pacific/Auckland, Europe/Dublin, UTC. Rows: integer-ms instants at each day boundary ±1 ms/1 s, around DST transitions and in fall-back overlaps; plus number, day, boolean, set cells. Random filters of every kind incl. combined. A: client result (compileFilter + filterIndices) equals an independent oracle that applies ONLY the wire form (string comparison on fixed-ms ISO for instants, civil-day string comparison for days, raw ops for the rest; must not import resolveInstantRange). B: wire problems equal compileFilter problems as [code, path], restricted to filter faults (guards the two validators drifting). Text: compare only ASCII exact/caseSensitive ops.
4. `conformance/runner/suites/wire.ts` registered in suites/index.ts, suite `wire`. Input like the `filter` suite (locale, timeZone, columns, filter, optional `kinds: ["between","throws","bad-json"]` from a fixture table in the suite file). Output `{filter, problems?: [[code, path]]}` (problems omitted when empty). Cases in `conformance/cases/wire/*.json`: algiers-onday, paris-spring-23h (from 2026-03-28T23:00:00.000Z to 2026-03-29T22:00:00.000Z), paris-fall-25h, kolkata-half-hour, kathmandu-45, lord-howe, apia-skipped-empty, sao-paulo-no-midnight, after-plus-1ms, before-day, between-swapped, at-with-offset, at-without-offset-ambiguous, year-out-of-range, blank-ops, half-typed-dropped, invalid-day, day-between-ordered, number-infinity-refused, set-include-empty, combined-drop-member, custom-default-wire, custom-throws, unknown-column, hidden-column-kept. Compute every expected value by hand (and cross-check the instants with an independent computation, e.g. Intl in a scratch script, never with the code under test).
   Example `algiers-onday.json`:
   {"id":"algiers-onday","suite":"wire","description":"5 March in Algiers (UTC+1): resolved half-open UTC bounds travel with the zone.","input":{"locale":"fr-FR","timeZone":"Africa/Algiers","columns":[{"id":"t","type":"instant"}],"filter":{"t":{"type":"instant","op":"onDay","day":"2026-03-05"}}},"expected":{"filter":{"t":{"type":"instant","op":"onDay","day":"2026-03-05","resolved":{"from":"2026-03-04T23:00:00.000Z","to":"2026-03-05T23:00:00.000Z"},"zone":"Africa/Algiers"}}}}
5. `source-model` cases: a request carries `resolved`; a zone ctx step refetches with new bounds; an inactive-filter edit makes no new call; an unfilterable column filter is dropped with `invalid-filter` in problems. Re-run source-rows* and gate-property tests (the epoch key changes).
6. Code: server/wire.ts (implementation, types, ms→ISO), server/source.ts (import the type), server/rows.ts (cached wire, wireProblems, key, unfiltered, setColumns rekey), server.ts (export toWire, WireEnv, WireFilter, WireKind), filter/model.ts (custom variant, types only), model/client.ts (optional filterKinds on ModelEnv). Update public-api.test.ts SERVER list.
7. Bench (if a bench harness exists for core; else a unit timing guard is NOT wanted): `toWire 7 filters (2 instant, Algiers)` ≤ 0.5 ms; resolve each instant filter once per restart(), never per load.

## 4. Edge cases
- DST gap/overlap: bounds come from instants, not wall time. An offset-less `at` gives `ambiguous-instant` (error, dropped).
- Half-hour and 45-minute offsets: Kolkata, Kathmandu, Chatham, Lord Howe (30-minute DST shift).
- Boundary: the row at `from` in, at `to` out; `after T` starts at floor(T)+1 ms.
- Fractional-ms cells: out of scope; one line in the sheet.
- Empty range (skipped day) sent as from == to.
- Empty or blank filters: dropped, no problem, no refetch.
- Hidden columns: still filter, on the wire too.
- `quick` is not part of toWire. Note for step 16: the client searches visible columns only; the server cannot know which are visible.

## 5. Decided
- Keep original day/at next to resolved: yes; the server uses resolved only.
- No now/clock now (reserved).
- Keep per-filter zone (self-contained for logs and saved views).
- Custom types mismatch: invalid-filter.
- Owner questions (Sehhaty wire grammar §1.1, all for the host's to-query.ts, never core): from/to format; API `to` inclusive or exclusive; day end inclusive; text semantics (folding, notContains/startsWith/endsWith); blank/notBlank support; set encoding; unknown params rejected or not.
