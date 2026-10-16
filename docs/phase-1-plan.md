# DzGrid Phase 1 (data core): implementation plan

Caveats first:
- I had no shell tool, so I did not run `vitest` or `npm run typecheck`. Nothing here is verified by execution.
- Hand-written expectations that depend on ICU or CLDR are marked "check against CLDR docs, not engine output".
- I did not read ngx-sheetgrid's `*.spec.ts`. I read `cell-value.ts`, `rule-engine.ts`, `date-value.ts` and `displayed-rows.ts` in full.
- I read the Phase 0 core (`ids`, `problems`, `day`, `instant`, `zone-day`, `purity.test`), the conformance runner, `perf/*`, and `scripts/bench.mjs`.
- I read the S1 `scroll-mapper.ts`, the S3 `autoheight.ts` and README, and the S5 README and `bench.js`.
- Constraints from `purity.test.ts` that shape everything below: no `performance`, `setTimeout`, `crypto`, `Date` or `Math.random` in `packages/core/src`. Diagnostics therefore use counters, never timers. Imports end in `.js`. lib is ES2023 with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.

## 0. Decisions to validate with the owner before coding

CLAUDE.md says to validate structural decisions first, in French. Each is a deviation from or addition to ARCHITECTURE.md, with its reason.

- **D1, rows are stored as parallel arrays, not node objects.**
  - A generation holds `rows[]`, `ids[]` (canonical id strings) and `Map<string, srcIndex>`.
  - `DataNode` is a lazy view created by `nodeAt`/`get`. It costs about 61 B/row, against about 150 B/row with a stored node plus a prefixed key string. K.8 allows 120 B/row.
  - `TransactionResult` carries `RowKey[]`, not `DataNode[]`, so a 100 000-row load allocates nothing per row.
  - Nodes are compared by `key`, never by `===`.
- **D2, text filters ignore case, accents and Arabic marks by default.**
  - Marks covered: harakat, tatweel, alef forms. `caseSensitive: true` makes the filter exact.
  - This is the product call a clinic grid needs: Hélène and مُحَمَّد must be findable. Spreadsheets are accent-sensitive.
- **D3, blanks sort last in both directions, and descending keeps ties in source order.**
  - This is spreadsheet behaviour. `SortItem.nulls: 'first'` overrides it.
- **D4, negations are exact complements.**
  - `notEqual` and `notContains` include blanks. Comparisons (`equals`, `lt`, `between`, …) never match blanks.
  - An unparseable cell counts as blank and produces a warning.
- **D5, typed numbers and days follow fixed rules.**
  - A trailing `%` (or U+066A) divides by 100.
  - A single `.` or `,` is read by locale. If the separator is neither the group nor the decimal sign of the locale, it is read as decimal when it occurs once.
  - Day order (d/m/y or m/d/y) comes from the locale. Two-digit years and month names are refused.
  - "No guessing" is applied to health data.
- **D6, `ColumnState` drops `sort`/`sortIndex`/`groupIndex`/`aggFunc`.**
  - Sort lives only in `Query`, to avoid two sources of truth.
  - `Query` has only `sort`, `filter`, `quick` for now. `advanced` and `external` come with their phases.
- **D7, `ValueCodec` gains `coerce` and a required `keyKind`/`sortKey`.**
  - `coerce` reads a machine value (JSON or ISO). `parse` reads human text.
  - Filters and sort take a source index (`RowTest = (src: number) => boolean`), not a `DataNode`, because 100 000 node allocations would break the 35 ms filter budget.
- **D8, typed instants that fall in a clock gap or overlap are rejected** (`disambiguation: 'reject'`). Data loaded from the host uses `'compatible'` plus a warning.
- **D9, structure changes.**
  - Codecs live in `value/codecs/*.ts`.
  - There is no kernel in Phase 1; §3.17 is Phase 2. `ChangeSource` and `ModelChange` are defined now.

## 1. Ordered steps (15, tests first in each)

Conventions for every step:
- New suites go in `conformance/runner/suites/<suite>.ts`, registered in `suites/index.ts`.
- `docs/behaviors/<sheet>.md` is written before the code (section 2).
- Hand-write expectations. Run `npm test`, `npm run typecheck` and `npm run test:tz`.

### Step 1: instant parsing (owner, in progress)

`parseInstant(v, { assumeZone, disambiguation })`, the wall-time resolver, the warnings `wall-time-skipped` and `wall-time-ambiguous`, and the `instant-parse` suite.

How the rest of Phase 1 uses it:
- `instantCodec.coerce(raw)` calls `parseInstant(raw, { assumeZone: column.assumeZone, disambiguation: 'compatible' })`.
  - Without `assumeZone`, an offset-less string gives `null`, with reason `ambiguous-instant`.
- `instantCodec.parse(text, ctx)` calls it with `assumeZone: ctx.timeZone` and `'reject'`.
- Instant filter values (`at`, `atTo`) never use a zone. They require an offset, otherwise `ambiguous-instant`.
- `readInstant` already has a `wallToInstant` hook. Keep it as the internal seam.
- Please make warnings reachable as structured `Problem`s, not only as a `readInstant` code. Step 15 needs one `problems` case per code.

### Step 2: behaviour sheets (docs only)

Write the sheets listed in section 2 and commit them alone. No code.

### Step 3: foundations

**Files**
- Modify `packages/core/src/problems.ts`, `ids.ts`, `index.ts`.
- Create `packages/core/test/types.test.ts`.
- Create the conformance runner split: `conformance/runner/{runner.test.ts,harness.ts,iso.ts,suites/index.ts,suites/{day-arith,row-key,zone-day-bounds}.ts}`.
- Create `perf/dataset.ts` (seeded dataset A) and extend `scripts/bench.mjs` (see the bench section).

**Signatures**
```ts
// problems.ts
export const PROBLEM_CODES = [
  'invalid-row-id','duplicate-row-id','unknown-row-id','invalid-transaction',
  'invalid-day','invalid-instant','ambiguous-instant','wall-time-skipped','wall-time-ambiguous',
  'invalid-column','duplicate-column-id','invalid-field-path','unknown-column',
  'invalid-sort','invalid-filter','invalid-cell-value',
] as const;
export type ProblemCode = (typeof PROBLEM_CODES)[number];

// ids.ts
export function canonicalId(id: unknown): string | null;  // number -> String (-0 -> '0'); '', NaN, non-string/number -> null
export function idOfDataKey(key: RowKey): string | null;  // inverse of dataKey; null for non-data or malformed keys
// dataKey(id) is rebuilt on canonicalId
// model/types.ts
export type ChangeSource = 'user' | 'host' | 'api' | 'data';
```

**Behaviours**
- `idOfDataKey` checks that the length prefix matches the remaining text. `'d:5:ab'` gives `null`.
- The runner keeps the `iso()` helper (moved to `iso.ts`) and the `REJECTED` JSON encoding `{"rejected":true}`.

**Tests (unit)**
1. `canonicalId(1)==='1'`, `canonicalId(-0)==='0'`, `canonicalId(1.5)==='1.5'`, `canonicalId('')===null`, `canonicalId(NaN)===null`.
2. `idOfDataKey(dataKey('a:b'))==='a:b'`.
3. `idOfDataKey(groupKey(['a']))===null`.
4. `idOfDataKey('d:5:ab' as RowKey)===null`.
5. `PROBLEM_CODES` has no duplicates.
6. `types.test.ts`:
   - `expectTypeOf<number>().not.toMatchTypeOf<DisplayIndex>()`.
   - `// @ts-expect-error` where a number is passed to `nodeAt` (added in step 7). `tsc -p tsconfig.spec.json` includes `packages/**`, so a lost error fails typecheck.

**Conformance:** `row-key/canonical-id`, with ids `[1,"1",1,-0,0]`.
- Expected `accepted: [true,false,false,true,false]`.
- Expected problems: `duplicate-row-id` at `rows[1]`, `rows[2]` and `rows[4]`.

**Bench:** none yet. The harness change is described below.

### Step 4: locale context, digits, number reader, formatters

**Files**
- Create `value/locale.ts`, `value/digits.ts`, `value/number.ts`, `i18n/format.ts`.
- Create tests `test/{locale,number,format}.test.ts`.
- Create suites `value-parse` (number cases) and `format`.

**Signatures**
```ts
export interface LocaleCtx { readonly locale: string; readonly numerals: 'latn'|'locale'; readonly timeZone: string; readonly calendar: 'gregory' }
export function localeCtx(o: { locale: string; numerals?: 'latn'|'locale'; timeZone?: string }): LocaleCtx; // throws RangeError (bad context); timeZone defaults to 'UTC'
export function ctxKey(ctx: LocaleCtx): string;
export function intlTag(ctx: Pick<LocaleCtx,'locale'|'numerals'>): string; // strips existing -u-ca/-nu, appends -u-ca-gregory-nu-<x>

export function normalizeDigits(s: string): string; // U+0660-0669 and U+06F0-06F9 -> 0-9
export function stripMarks(s: string): string;      // U+200E U+200F U+061C U+FEFF

export interface NumberSeparators { readonly group: string; readonly decimal: string }
export function separatorsFor(ctx: LocaleCtx): NumberSeparators;  // from formatToParts(1234567.5), cached
export function readNumber(text: string, ctx: LocaleCtx): number | null;  // human text; null = refused
export function readMachineNumber(raw: unknown): number | null;           // finite number, or strict /^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/

export interface NumberFormatSpec { readonly style?: 'decimal'|'percent'|'currency'; readonly currency?: string; readonly minimumFractionDigits?: number; readonly maximumFractionDigits?: number; readonly useGrouping?: boolean }
export interface InstantFormatSpec { readonly seconds?: boolean; readonly date?: boolean; readonly time?: boolean }
export interface Formatters { number(spec?: NumberFormatSpec): (n: number) => string; day(): (d: Day) => string; instant(spec?: InstantFormatSpec): (ms: InstantMs) => string }
export function formattersFor(ctx: LocaleCtx): Formatters;   // cached per ctxKey, at most 16 contexts
export function dayFieldOrder(ctx: LocaleCtx): readonly ['d'|'m'|'y','d'|'m'|'y','d'|'m'|'y']; // from formatToParts of a sample day
export function formatParts(kind: 'number'|'day'|'instant', ctx: LocaleCtx, value: number|string): readonly (readonly [string,string])[]; // for tests
export function clearFormatCaches(): void;
```

**Behaviours**
- Number reading steps:
  1. Strip marks.
  2. Normalise digits.
  3. Accept a leading `-`, `−` (U+2212) or `+`.
  4. Handle the percent sign.
  5. Read groups and the decimal sign.
  6. Accept an exponent.
- Percent uses the exponent trick (`Number(m + 'e-2')`) to avoid float error.
- Group and decimal rules:
  - Group characters: the locale group, U+066C, whitespace-class characters, `'`, U+2019, and `,` or `.` when valid.
  - Every group after the first must be exactly 3 digits, and the first group 1 to 3 digits.
  - If both `.` and `,` occur, the last one is the decimal sign.
  - A single `.` or `,` that equals the locale decimal sign is decimal.
  - A single one that equals the locale group is a group only if exactly 3 digits follow, otherwise refused.
  - A single one that is neither is decimal when it occurs once.
- Refused: empty text, `1.2.3`, `--1`, hex, `NaN`, a result that is not finite, Indian 2-digit grouping.
- Formatting:
  - Intl formatters are always built with `intlTag`, which sets calendar gregory and numbering system. `numerals:'locale'` resolves the locale's default numbering system once and sets it explicitly.
  - If the TS lib types allow, also pass `calendar` and `numberingSystem` as options. If typecheck complains, rely on the tag; `zone-day.ts` already does and S5 verified it in 4 engines.
  - The default number format is "general": `maximumSignificantDigits: 15`, so 0.1+0.2 prints as 0.3. `-0` is normalised to 0.
  - Day format uses `timeZone:'UTC'` on the Day's midnight, so no zone shift is possible. A year below 1583 falls back to ISO text (see risks).
  - Instant format uses `ctx.timeZone` and `hourCycle:'h23'`.
  - Caches are `Map`s that are cleared when they reach 64 entries.

**Tests (unit):** `localeCtx('not a locale!!')` and an unknown zone throw `RangeError`. `intlTag({locale:'ar-SA-u-ca-islamic', numerals:'latn'})==='ar-SA-u-ca-gregory-nu-latn'`. A second `formattersFor` call with the same ctx returns the same object.

**Conformance `value-parse` (type number), input `{type, locale, text}`:**

| Case | Input | Expected |
|---|---|---|
| number-en-group | en-US `1,234.5` | 1234.5 |
| number-fr-nnbsp | fr-FR `1 234,5` | 1234.5 |
| number-ardz-marks | ar-DZ `‏-١٬٢٣٤٫٥` | -1234.5 |
| number-ardz-dot-group | ar-DZ `10.000` | 10000 |
| number-en-comma-refused | en-US `1,5` | `{rejected:true}` |
| number-percent-arabic | ar-DZ `١٢٫٥٪` | 0.125 |
| number-persian-digits | ar-DZ `۱۲۳` | 123 |

**Conformance `format`**
- The runner strips marks and compares either `{text}` or the non-literal `{parts}`.
- Expected values come from CLDR documentation, not engine output.

| Case | Input | Expected |
|---|---|---|
| number-en | en-US 1234.5 | `1,234.5` |
| number-fr | fr-FR 1234.5 | `1 234,5` |
| number-ar-latn | `ar`, latn, 1234.5 | `1,234.5` |
| number-ar-eg-locale | ar-EG, locale, 1234.5 | `١٬٢٣٤٫٥` |
| day-fr | fr-FR 2026-03-05 | `05/03/2026` |
| day-en-us | en-US 2026-03-05 | `03/05/2026` |
| day-old | 1500-01-01 | `1500-01-01` |

- ar-DZ and instant formats are parts-based. Example: instant 2026-03-05T10:00:00Z, Africa/Algiers, fr-FR gives non-literal values `["05","03","2026","11","00"]`.

**Bench lines:** `readNumber x 100 000` and `format number x 100 000 (cached Intl)`. Provisional budgets are 2× the first stable median.

### Step 5: codecs

**Files**
- Create `value/codec.ts` and `value/codecs/{text,number,boolean,enum,day,instant}.ts`.
- Create `test/codecs.test.ts`.
- Extend suite `value-parse`.

**Signatures**
```ts
export const REJECTED: unique symbol;
export type Rejected = typeof REJECTED;
export type ColumnType = 'text'|'number'|'day'|'instant'|'boolean'|'enum'|'custom';
export interface ValueCodec<V> {
  readonly kind: ColumnType;
  readonly keyKind: 'number' | 'text';
  coerce(raw: unknown, ctx: LocaleCtx): V | null;       // machine values (JSON, ISO); null = blank or invalid
  why?(raw: unknown, ctx: LocaleCtx): string;           // reason for a null, such as 'ambiguous-instant'
  parse(text: string, ctx: LocaleCtx): V | Rejected;    // typed or pasted human text; '' -> REJECTED except text
  format(v: V, ctx: LocaleCtx): string;
  sortKey(v: V, ctx: LocaleCtx): number | string;       // number if keyKind 'number', else the text to collate
  compare(a: V, b: V, ctx: LocaleCtx): number;
  isEmpty(v: unknown): boolean;
  equals(a: V, b: V): boolean;
  toExport(v: V): string;                               // raw and stable
}
export const textCodec: ValueCodec<string>;
export const numberCodec: ValueCodec<number>;
export function numberCodecWith(spec: NumberFormatSpec): ValueCodec<number>;
export const booleanCodec: ValueCodec<boolean>;
export function booleanCodecWith(labels: { true: string; false: string }): ValueCodec<boolean>;
export interface EnumOption { readonly value: string; readonly label?: string; readonly aliases?: readonly string[] }
export function enumCodec(options: readonly EnumOption[], o?: { sort?: 'label' | 'option-order' }): ValueCodec<string>;
export const dayCodec: ValueCodec<Day>;
export function instantCodec(o?: { assumeZone?: string; format?: InstantFormatSpec }): ValueCodec<InstantMs>;
export function instantToIso(ms: InstantMs): string;   // UTC, ms only when non-zero (moved from the runner)
```

**Behaviours**
- Text:
  - `coerce`: strings as-is. Numbers and booleans become `String(raw)`. Anything else gives `null`.
  - `parse` is the identity. `compare` uses the cached collator (`sensitivity:'base'`, `numeric:true`), never `localeCompare`.
- Number:
  - `coerce` uses `readMachineNumber`; `parse` uses `readNumber`.
  - `sortKey` is the value. `toExport` is `String(v)` with -0 as `"0"`.
- Boolean:
  - `parse`: strip marks, normalise digits, trim, lowercase.
  - True words: `true yes y 1 oui vrai نعم صحيح ✓`.
  - False words: `false no n 0 non faux لا خطأ ✗`.
  - Others are refused. `coerce` accepts `true`/`false` only. `sortKey` is 0 or 1.
- Enum:
  - `parse` matches the value, label or alias using `fold`. Unknown gives `REJECTED`.
  - `format` gives the label, or the raw value if it is not in the options. `sortKey` is the label by default. `toExport` is the raw value.
- Day:
  - `coerce` takes `YYYY-MM-DD` only, via `parseDay`. A datetime string gives `null`.
  - `parse` accepts ISO in any locale, and numeric 3-part dates in the order from `dayFieldOrder`, with separators from `/ . - space`, a 4-digit year, and digits normalised.
  - Month greater than 12 or day out of range is refused with no silent swap.
  - `sortKey` is `dayToEpochDay`.
  - If `parseDay` (a RegExp) costs more than about 15 ms per 100 000, rewrite it with `charCodeAt` checks. Prove it with a property test against the old implementation. Measure first.
- Instant:
  - `coerce` accepts a finite number in range, or an ISO string with an offset. A bare day gives `null`. An offset-less string gives `null` unless `assumeZone` is set.
  - `parse` accepts an ISO string (an offset-less one uses `ctx.timeZone` with `'reject'`), or `<day-text> HH:mm[:ss]` in 24 h.
  - 12 h with AM/PM is refused in Phase 1 and noted for Phase 4 editors.
  - `toExport` is `instantToIso`.

**Tests (unit):**
- Boolean: `Oui`→true, ` NON `→false, `نعم`→true, `لا`→false, `١`→true, `maybe`→REJECTED, `''`→REJECTED.
- Enum with `[{value:'A',label:'Actif'},{value:'I',label:'Inactif',aliases:['inactive']}]`: `actif`→'A', `INACTIF`→'I', `inactive`→'I', `x`→REJECTED. `Éteint` is matched by `eteint`.
- Day and instant cases are the conformance rows below.

**Conformance `value-parse` (day, instant, boolean, enum):**

| Case | Input | Expected |
|---|---|---|
| day-fr-numeric | fr-FR `05/03/2026` | `2026-03-05` |
| day-en-us-order | en-US `03/05/2026` | `2026-03-05` |
| day-iso-any-locale | `2026-03-05` | `2026-03-05` |
| day-arabic-indic | ar-DZ `٠٥/٠٣/٢٠٢٦` | `2026-03-05` |
| day-no-swap | en-US `13/01/2026` | rejected |
| day-two-digit-year | fr-FR `05/03/26` | rejected |
| day-not-a-date | fr-FR `31/02/2026` | rejected |
| instant-algiers | `2026-03-05 10:30`, Africa/Algiers | `2026-03-05T09:30:00Z` |
| instant-explicit-offset | `2026-03-05T10:30+01:00` | `2026-03-05T09:30:00Z` |
| instant-gap-refused | `2026-03-29 02:30`, Europe/Paris | rejected |

**Bench:** `coerce ISO instants x 100 000`, to be superseded by the cached column-keys line in step 8. Rewrite the existing `parseDay x 100 000` budget only if the `parseDay` rewrite happens.

### Step 6: columns

**Files:** `columns/{defs,model,layout}.ts`, `test/columns.test.ts`, suite `columns-layout`.

**Signatures**
```ts
export type Side = 'start' | 'end';
export interface ColumnDef<T, V = unknown> {
  readonly id: string; readonly field?: string; readonly value?: (row: Readonly<T>) => V;
  readonly header?: string; readonly type?: ColumnType; readonly codec?: ValueCodec<V>;
  readonly enumOptions?: readonly EnumOption[]; readonly assumeZone?: string;
  readonly numberFormat?: NumberFormatSpec; readonly instantFormat?: InstantFormatSpec;
  readonly width?: number; readonly minWidth?: number; readonly maxWidth?: number; readonly flex?: number;
  readonly resizable?: boolean; readonly movable?: boolean; readonly sortable?: boolean; readonly filter?: false;
  readonly pinned?: Side | null; readonly hidden?: boolean; readonly align?: 'start'|'center'|'end';
}
export interface ResolvedColumn<T> {
  readonly id: string; readonly def: ColumnDef<T, any>; readonly type: ColumnType;
  readonly codec: ValueCodec<any>; readonly read: (row: Readonly<T>) => unknown;
  readonly sortable: boolean; readonly filterable: boolean;
}
export interface ValueReader<T> {                      // the edit-overlay seam (Phase 4 plugs CellEdits in here)
  readonly version: number; readonly overlay: boolean;
  value(col: ResolvedColumn<T>, row: Readonly<T>, id: string): unknown;
}
export const NO_OVERLAY: ValueReader<never>;           // overlay:false, version:0
export function compilePath(path: string): ((row: unknown) => unknown) | null;  // null for '', empty segment, __proto__/constructor/prototype
export function resolveColumns<T>(defs: readonly ColumnDef<T, any>[]): { columns: readonly ResolvedColumn<T>[]; problems: readonly Problem[] };
export interface ColumnLookup<T> { get(id: string): ResolvedColumn<T> | undefined; visible(): readonly ResolvedColumn<T>[]; readonly version: number }
export interface ColumnState { readonly id: string; readonly width?: number; readonly hidden?: boolean; readonly pinned?: Side | null; readonly order?: number }
export interface ColumnSlice { readonly columns: readonly ResolvedColumn<any>[]; readonly widths: PrefixSums; readonly width: number }
export interface ColumnLayout { readonly start: ColumnSlice; readonly center: ColumnSlice; readonly end: ColumnSlice; readonly totalWidth: number }
export interface ColumnChange { readonly changed: readonly string[]; readonly layoutChanged: boolean; readonly problems: readonly Problem[] }
export interface ColumnModel<T> extends ColumnLookup<T> {
  readonly layout: ColumnLayout;
  state(): readonly ColumnState[];
  apply(patch: readonly ColumnState[], source: ChangeSource): ColumnChange;
  setDefs(defs: readonly ColumnDef<T, any>[]): ColumnChange;     // keeps user state by id
  setAvailableInline(px: number): ColumnChange;                  // drives flex
}
export function createColumnModel<T>(defs: readonly ColumnDef<T, any>[], o?: { availableInline?: number }): ColumnModel<T>;
```

**Behaviours**
- Flat columns only in Phase 1. Groups, `autoSizePlan`, `headerRows` and drag-to-move wait for Phase 5.
- Defaults: type `'text'`; width 150; min 40. A `'custom'` type needs a codec, and an enum needs `enumOptions`. Otherwise the def is `invalid-column`.
- Pinned segments keep definition order, `order` patches reorder within a segment, and hidden columns are excluded.
- Flex distributes the leftover width of the centre. Algorithm: loop clamping min/max until stable, then round to integers by largest remainder.
- `setDefs` keeps width, hidden, pinned and order set by the user, per `id`.

**Tests (unit)**
- Duplicate id gives `duplicate-column-id` at `columns[2]`. A missing id gives `invalid-column` at `columns[0]`.
- `field:'a..b'` gives `invalid-field-path` at `columns[0].field`.
- `compilePath('address.city')` reads nested. A missing middle returns `undefined`. `constructor` is refused.
- `apply` width 150, then `setDefs` with `width:100`, keeps 150.

**Conformance `columns-layout`, input `{columns, available, state?}`, expected `{start,center,end,total}` (id and width):**

| Case | Columns and available width | Expected |
|---|---|---|
| flex-two-shares | a w100 pinned start; b w100; c flex1 min50; d flex2; e w80 pinned end; available 800 | start `[a:100]`; centre `[b:100, c:173, d:347]`; end `[e:80]`; total 800 |
| flex-min-clamp | a flex1 min300; b flex1; available 400 | a 300, b 100 |
| hidden | b hidden | b absent |
| user-width | `state [{id:'b',width:150}]` | b 150 |

(173 plus 347 equals 520. The largest remainder goes to d.)

### Step 7: RowStore, transactions, DisplayedRows

**Files:** `row/{node,store,displayed,transaction}.ts`, `test/{store,displayed}.test.ts`, suites `transaction` and `displayed-order`.

**Signatures**
```ts
export type RowKind = 'data'|'group'|'footer'|'detail'|'full-width'|'loading';
export interface DataNode<T> { readonly key: RowKey; readonly kind: 'data'; readonly level: number; readonly id: RowIdInput; readonly data: Readonly<T> }
export type RowNode<T> = DataNode<T>;   // Phase 1: group, detail and loading nodes arrive later

export interface RowTransaction<T> {
  readonly add?: readonly T[]; readonly addAt?: number; readonly update?: readonly T[];
  readonly patch?: readonly { readonly id: RowIdInput; readonly set: Partial<T> }[];
  readonly remove?: readonly RowIdInput[];
}
export interface TransactionResult {
  readonly kind: 'reset' | 'delta' | 'none';   // 'reset': first load, or more than half the rows changed; arrays empty
  readonly version: number;
  readonly added: readonly RowKey[]; readonly updated: readonly RowKey[]; readonly removed: readonly RowKey[];
  readonly problems: readonly Problem[];
}
export interface RowSnapshot<T> {              // immutable generation
  readonly version: number; readonly count: number; readonly rows: readonly T[]; readonly ids: readonly string[];
  lookup(id: string): number;                  // source index or -1
  keyAt(src: number): RowKey; nodeAt(src: number): DataNode<T>;
}
export interface RowStore<T> {
  readonly version: number; readonly size: number; readonly snapshot: RowSnapshot<T>;
  get(key: RowKey): DataNode<T> | undefined;
  apply(tx: RowTransaction<T>): TransactionResult;
  replaceAll(rows: Iterable<T>): TransactionResult;
  readonly lastDelta: StoreDelta;              // { from; to; kind: 'reset'|'update'|'append'|'structural'; changedSrc?: Uint32Array }
}
export function createRowStore<T>(getRowId: (row: T) => RowIdInput): RowStore<T>;

export interface DisplayedRows<T> {
  readonly version: number; readonly count: number;
  nodeAt(i: DisplayIndex): RowNode<T>; keyAt(i: DisplayIndex): RowKey;
  indexOf(key: RowKey): DisplayIndex | -1;
  index(n: number): DisplayIndex | null;       // the only producer of DisplayIndex
  nextData(i: DisplayIndex, delta: 1 | -1): DataNode<T> | null;
}
export function flatDisplayed<T>(snap: RowSnapshot<T>, order: Uint32Array | null, version: number): DisplayedRows<T>;
```

**Behaviours**
- A generation holds `rows` and `ids` as arrays that are never mutated after publishing, plus `index: Map<string, number>`.
- Update-only transaction:
  - Copy `rows` only. `ids` and the Map are shared. Cost is O(n), about 0.3 ms for 100 000.
  - `update` replaces a whole row by identity. `patch` builds `{...old, ...set}`, a new object. The host's row is never modified.
- Append (`add` without `addAt`): the Map is shared and append-only. An older generation ignores entries with index ≥ its `rows.length`.
- `remove` or `addAt`: new arrays and a fresh Map, O(n), about 10 to 15 ms per 100 000. This is documented as the non-hot path.
- Operation order inside one transaction is `remove`, then `update`/`patch`, then `add`. So `{remove:['a'], add:[a2]}` moves `a` to the end.
- Refusals are per entry, with a Problem. Applied entries still apply, in one new version and one notification.
  - A duplicate `add` of an existing id is refused (`duplicate-row-id`, path `add[i]`).
  - An absent id in `update`, `patch` or `remove` gives `unknown-row-id` at `update[i]`, `patch[i]` or `remove[i]`.
  - `addAt` negative or non-integer gives `invalid-transaction` at `addAt`.
  - `addAt` beyond the length clamps silently. A non-object row gives `invalid-row-id`.
  - If `getRowId` throws, catch it and report `invalid-row-id` with detail `getRowId threw`. Never put the message or the row data in the problem.
- A transaction where nothing is applied returns `kind:'none'` and does not bump `version`.
- `replaceAll` diffs by identity, in new input order. Same object reference means unchanged. A different object with the same id means updated. Duplicates keep the first.
- `flatDisplayed`:
  - `order` is display→source, or `null` for identity.
  - `indexOf` goes through a lazily built `Int32Array` source→display, 4 B/row.
  - `index(n)` checks integer and range. `nodeAt` throws `RangeError` out of range, which is a programming error.
  - `nextData` returns the neighbour, since every flat row is data.

**Tests (unit)**
- A frozen input array and frozen rows are never mutated.
- An old snapshot is still valid after `remove` (`lookup('a')` still found).
- A no-op transaction keeps the version.
- `patch` leaves the old object untouched and returns a new one.
- Property test: 200 random transactions (seed 42) against a naive array model.
- `types.test.ts` gains `// @ts-expect-error displayed.nodeAt(3)`.

**Conformance `transaction`, input `{rows:[{id,…}], ops:[{tx}|{replaceAll}]}`, expected `{ids, problems:[[code,path]]}`:**

| Case | Ops | Expected |
|---|---|---|
| add-at | rows [a,b,c]; `add:[x], addAt:1` | ids `[a,x,b,c]` |
| remove-unknown | `remove:['b','zz']` | ids `[a,c]`; problem `["unknown-row-id","remove[1]"]` |
| first-wins-replace-all | replaceAll `[{id:'a',v:1},{id:'a',v:2}]` | one row `a`, v 1; `duplicate-row-id` at `rows[1]` |
| remove-then-add-moves | `remove:['a'], add:[{id:'a'}]` | ids `[b,c,a]` |
| add-existing-refused | `add:[{id:'a'}]` | ids unchanged; `duplicate-row-id` at `add[0]` |

**Conformance `displayed-order`** (invariant 1, bug 1): rows `[{id:'a',v:3},{id:'b',v:1},{id:'c',v:2}]`, sort `v asc` (this case runs fully after step 12; the model harness lands in step 8).
- Expected `{displayed:['b','c','a'], atIndex:{"0":"b"}, indexOf:{"a":2}, sourceOrder:['a','b','c']}`.
- The same case with a filter `v gt 1` expects `['c','a']` and `indexOf` of b as `-1`.

**Bench lines (K.8)**
- `load 100 000 x 30 (clientRows)`: 80 ms. Expected about 20 ms.
- Memory line `store overhead bytes/row (100 000 rows)`: 120.

### Step 8: sort and the column cache

**Files:** `sort/{compile,collate}.ts`, `model/column-cache.ts`, `test/{sort,column-cache}.test.ts`, conformance harness `harness.ts`, suite `sort`.

**Signatures**
```ts
export interface SortItem { readonly column: string; readonly dir: 'asc'|'desc'; readonly nulls?: 'first'|'last' }
export interface CollatorSpec { readonly sensitivity?: 'base'|'accent'|'variant'; readonly numeric?: boolean }  // default base, numeric true
export function collatorFor(ctx: LocaleCtx, spec?: CollatorSpec): Intl.Collator;   // cached
export interface RowSource<T> { readonly count: number; readonly rows: readonly T[]; readonly ids: readonly string[] }  // = RowSnapshot

export interface SortEnv<T> { readonly source: RowSource<T>; readonly columns: ColumnLookup<T>; readonly ctx: LocaleCtx; readonly reader: ValueReader<T>; readonly cache: ColumnCache<T> }
export function sortIndices<T>(items: readonly SortItem[], within: Uint32Array | null, env: SortEnv<T>): { order: Uint32Array; problems: readonly Problem[] };

// model/column-cache.ts (internal; not exported from index.ts)
export class ColumnCache<T> {
  keys(col: ResolvedColumn<T>, env): { keys: Float64Array; blanks: number; problems: Problem[] };  // NaN = blank
  ranks(col: ResolvedColumn<T>, env, spec?: CollatorSpec): { ranks: Float64Array; distinct: number };
  stats: { keyBuilds: number; rankBuilds: number; rankPatches: number };
  patch(delta: StoreDelta, next: RowSnapshot<T>): void;
  invalidateAll(): void;
}
```

**Behaviours**
- Numeric columns:
  - Build a `Float64Array` of keys for all rows with `codec.coerce` and `sortKey`. Blank or invalid becomes `NaN` with a warning. Cache by (generation, column identity, reader version).
  - Sort a `Uint32Array` of indices with a comparator. Ties always compare equal, then break on source index. Do not depend on `TypedArray.sort` stability.
- Text and enum columns (rank keys, S5):
  - Distinct values are sorted once by `Intl.Collator`. Collator-equal values share a rank.
  - Each row gets a `Float64Array` rank. Then it sorts like a number column.
  - Cache key is `${col.id}|${collatorKey}`. At most 8 entries are kept (LRU).
- Descending flips the sign of non-blank comparisons only. Blanks are placed per `nulls`, default last. Ties keep source order.
- Multiple items compare key by key.
- Unknown column gives `unknown-column` at `sort[i]`. `sortable:false` or a bad `dir` or `nulls` gives `invalid-sort` at `sort[i]`. A duplicate column gives `invalid-sort`. The faulty item is ignored.
- Invalid cell values produce `invalid-cell-value` warnings, capped at 10 per column plus a count in `detail`. Path is `rows[<src>].<colId>`, with the index in the current snapshot. Detail is the type name only.
- Invalidation:
  - Update-only delta: rank patch only if every changed row's new value is already in the column's dictionary. Otherwise drop that entry (full rebuild on the next sort).
  - Append, remove or reset: drop everything.
  - Reader version change: lazily invalid, applied only on the next explicit sort or `reapply` (K.14).
- Never use `localeCompare`. Sorting never mutates the store.

**Tests (unit)**
- Rank cache: sorting asc then desc on the same column gives `rankBuilds === 1`. An update that sets a new distinct value triggers a rebuild. An update to an existing value patches (`rankPatches === 1`).
- Nothing sorts a frozen input differently from an unfrozen one.
- Numbers `[3, null, 1, 'abc', 2]` asc gives ids in order `[1,2,3]` then the blanks in source order. The `'abc'` row produces one `invalid-cell-value` warning.

**Conformance `sort`, input `{locale, columns, rows, sort}`, expected `{ids}`:**

| Case | Rows | Expected |
|---|---|---|
| numeric-blanks-last | v `[3,null,1,2]` ids a,b,c,d, asc | `[c,d,a,b]`; desc `[a,d,c,b]` |
| text-fr-accent-tie | fr-FR names `[b,a,é,e,z]` ids 1..5, asc | `[2,1,3,4,5]` (é before e: base sensitivity ties by source) |
| numeric-collation | `["Dossier 10","Dossier 2","Dossier 1"]` | `[3,2,1]` |
| ar-hamza-fold | `["أحمد","احمد","بسام","ابراهيم"]` ids 1..4 | `[4,1,2,3]` |
| instant-offsets | `"2026-03-05T10:00:00+01:00"` (09:00Z) and `"2026-03-05T09:30:00Z"`, asc | the +01:00 row first (string order would give the wrong answer) |
| desc-ties-source-order | equal keys, desc | source order kept |
| multi-key | `a asc, b desc` | by hand |

**Bench lines (K.8)**
- `numeric sort 100 000 (cold keys + sort)`: 40 ms.
- `day sort 100 000 (string days, cold)`: 40 ms.
- `text sort 100 000 fr (cold rank keys)`: 250 ms. S5 measured 111 plus 16 ms.
- `text sort 100 000 ar (cold rank keys)`: 250 ms. S5 measured 130 to 210 ms, so the margin is only 1.2×.
- `text sort 100 000 fr (warm ranks)`: 40 ms.
- `sort two numeric keys 100 000`: 120 ms.
- `sort instant ISO strings 100 000 (cold)`: provisional about 200 ms. Parsing dominates (`readInstant x 100 000` is budgeted at 120 ms), and the cached keys make later sorts about 15 ms.

### Step 9: filters, part 1 (model, text, number, boolean, day, set, combined)

**Files:** `filter/{model,compile,text,number,day,set}.ts`, `i18n/fold.ts`, `test/{filter,fold}.test.ts`, suites `filter-text`, `filter-number`, `filter-day`, `filter-combined`.

**Signatures**
```ts
export type FilterModel = Readonly<Record<string, ColumnFilter>>;
export type TextOp = 'contains'|'notContains'|'equals'|'notEqual'|'startsWith'|'endsWith'|'blank'|'notBlank';
export type NumOp = 'equals'|'notEqual'|'lt'|'lte'|'gt'|'gte'|'between'|'blank'|'notBlank';
export type ColumnFilter =
  | { type:'text'; op:TextOp; value?:string; caseSensitive?:boolean }
  | { type:'number'; op:NumOp; value?:number; valueTo?:number }
  | { type:'day'; op:NumOp; value?:Day; valueTo?:Day }
  | { type:'instant'; op:'onDay'|'betweenDays'|'before'|'after'|'between'|'blank'|'notBlank'; day?:Day; dayTo?:Day; at?:string; atTo?:string }
  | { type:'boolean'; value: boolean|null }
  | { type:'set'; include?:readonly string[]; exclude?:readonly string[]; blanks?:'include'|'exclude' }
  | { type:'combined'; join:'and'|'or'; conditions: readonly ColumnFilter[] };

export interface FilterEnv<T> extends SortEnv<T> {}
export interface CompiledFilter { readonly active: boolean; test(src: number): boolean; readonly problems: readonly Problem[] }
export type RowTest = (src: number) => boolean;
export function compileFilter<T>(model: FilterModel, env: FilterEnv<T>): CompiledFilter;
export function filterIndices(count: number, tests: readonly CompiledFilter[], within?: Uint32Array | null): Uint32Array | null; // null = everything passes

// i18n/fold.ts
export function fold(text: string): string;   // NFKD, strip \p{Mn}, tatweel, lowercase, alef forms -> ا, ى -> ي, digits -> Latin, marks removed
export function isAscii(text: string): boolean;
```
The `instant` variant parses and validates in step 9 but compiles to a stub that is filled in at step 10.

**Behaviours**
- Text filter, case-insensitive by default, folded with `fold`, per D2.
  - Needles are not trimmed. `blank` means `''`, `null` or `undefined` only (whitespace-only is not blank).
  - ASCII fast path: if the cell and the needle are ASCII, use `toLowerCase().includes`. Non-ASCII cells use a folded column cache built once per (generation, column), stored only for non-ASCII cells.
  - `caseSensitive:true` compares NFC code units exactly.
- Number filter:
  - `between` is inclusive on both ends and swaps bounds if reversed.
  - A missing `value` means the filter is inactive, with no problem (half-typed). A wrong value type gives `invalid-filter`.
- Day filter: `value` and `valueTo` are `Day`s compared as numeric keys, with inclusive bounds. A bad `Day` gives `invalid-day` at `filter.<col>.value`.
- Boolean filter: `null` means inactive.
- Set filter:
  - Compares `codec.toExport(value)` strings.
  - With `include`, only listed values pass, plus blanks if `blanks:'include'`. With `exclude`, everything except the listed values passes, blanks included unless `blanks:'exclude'`.
  - `setValues()` (the value index) waits for Phase 3.
- Combined: `and` or `or` of conditions, nested at most 3 levels.
- Complement rule (D4): `notX` equals `!X`, a property tested for all pairs.
- Wrong type for the column (for example a `number` filter on a text column) gives `invalid-filter` at `filter.<col>`. An unknown column gives `unknown-column` at `filter.<col>`. Both ignore that filter.

**Tests (unit)**
- `fold('Éric')==='eric'`, `fold('مُحَمَّد')==='محمد'`, `fold('أحمد')==='احمد'`, `fold('١٢٣')==='123'`, `fold('ﻻ')==='لا'`, `fold('İ')==='i'`.
- Property test: for every pair (op, notOp) over random rows, the two result sets partition the rows.
- A text filter on 100 non-ASCII cells builds the fold cache once (`stats`), and a second filter reuses it.

**Conformance (input `{locale, timeZone, columns, rows, filter}`, expected `{ids}`):**

`filter-text` with names `['Éric','eric','Zoé','',null,'Eric Dupont']` (ids 1..6):

| Case | Filter | Expected |
|---|---|---|
| text-contains-folded | contains `eri` | `[1,2,6]` |
| text-case-sensitive | contains `eri`, caseSensitive | `[2]` |
| text-equals | equals `eric` | `[1,2]` |
| text-not-contains-blanks | notContains `eri` | `[3,4,5]` |
| text-blank | blank | `[4,5]` |
| text-arabic-marks | names `['أحمد','احمد','مُحَمَّد','محمد']`, equals `محمد` | `[3,4]` |

`filter-number` with values `[1,5,10,null,'abc',7.5]` (ids 1..6):

| Case | Filter | Expected |
|---|---|---|
| number-gt | gt 5 | `[3,6]` |
| number-between | between 5..10 | `[2,3,6]` |
| number-between-swapped | between 10..5 | same as above |
| number-not-equal | notEqual 5 | `[1,3,4,5,6]` |
| number-blank | blank | `[4,5]` |

`filter-day` with `['2026-03-04','2026-03-05','2026-03-06',null]`:

| Case | Filter | Expected |
|---|---|---|
| day-equals | equals 2026-03-05 | `[2]` |
| day-between-inclusive | between 03-04..03-05 | `[1,2]` |
| day-lt | lt 03-05 | `[1]` |
| day-gte | gte 03-05 | `[2,3]` |
| day-not-equal | notEqual 03-05 | `[1,3,4]` |

`filter-combined` (boolean, set, combined): boolean `value:true` over `[true,false,null]` gives `[1]`. Set `include:['A']` over `['A','B','C',null]` gives `[1]`. With `blanks:'include'` it gives `[1,4]`. `exclude:['A']` gives `[2,3,4]`. `combined or` of `contains` `x` and `startsWith` `y`, written by hand.

**Bench lines (K.8)**
- `text filter contains 100 000`: 35 ms.
- `number filter gt 100 000`: 10 ms.
- `day filter between 100 000`: 15 ms.
- `set filter 100 000`: 15 ms.

### Step 10: filters, part 2 (instant)

**Files:** `filter/instant.ts`, `test/filter-instant.test.ts`, suite `filter-instant`.

**Signatures**
```ts
export interface InstantRange { readonly from: InstantMs; readonly to: InstantMs }   // half-open [from, to)
export function resolveInstantRange(f: Extract<ColumnFilter, { type: 'instant' }>, zone: string): { range: InstantRange | null; problems: readonly Problem[] };
// Phase 3 reuses it to add `resolved` and `zone` to server requests
```

**Behaviours**
- `onDay D` gives `[zoneDayBounds(D).from, .to)` in `ctx.timeZone`, resolved once at compile time.
- `betweenDays D1..D2` gives `[bounds(D1).from, bounds(D2).to)`, inclusive of both days.
- `before at` means value < at. `after at` means value > at (strict). `before` or `after` with a `day` instead of `at` uses the day bounds: `before` means < `from`, `after` means ≥ `to`.
- `between at..atTo` is `[at, atTo)`.
- `at` and `atTo` are machine ISO with an offset. A bad string gives `invalid-instant`. An offset-less string gives `ambiguous-instant`. Both use path `filter.<col>.at`. A bad `day` gives `invalid-day`.
- An instant cell that cannot be read counts as blank. A skipped day (Apia 2011-12-30) has `from === to` and matches nothing, without error.
- Cached instant keys are shared with sort, so the first filter on an ISO-string column pays the parse once.

**Tests (unit):** `resolveInstantRange` for `onDay`, `betweenDays` and `between`, and the error codes.

**Conformance `filter-instant`, timeZone Africa/Algiers (UTC+1, no DST), instants:**
`a=2026-03-04T22:59:59Z`, `b=2026-03-04T23:00:00Z`, `c=2026-03-05T22:59:59.999Z`, `d=2026-03-05T23:00:00Z`, `e=2026-03-05T00:00:00Z`.

| Case | Filter | Expected |
|---|---|---|
| onday-algiers | onDay 2026-03-05 | `[b, c, e]` (b is 00:00 local, c is 23:59:59.999 local; a and d are outside) |
| between-days-algiers | betweenDays 2026-03-05..2026-03-06 | range `[2026-03-04T23:00Z, 2026-03-06T23:00Z)` |
| onday-paris-spring | Europe/Paris, onDay 2026-03-29, instants `2026-03-28T23:00:00Z`, `2026-03-29T21:59:59Z`, `2026-03-29T22:00:00Z` | first two in, third out |
| onday-apia-skipped | onDay 2011-12-30, Pacific/Apia | `[]` |
| before-strict | before `2026-03-05T10:00:00Z` | the row at exactly that instant is excluded |

**Bench line:** `instant filter onDay 100 000 (warm keys)`: 15 ms.

### Step 11: quick filter

**Files:** `filter/quick.ts`, extend `i18n/fold.ts`, `test/quick.test.ts`, suite `quick-filter`.

**Signatures**
```ts
export interface QuickState<T> { readonly words: readonly string[]; /* folded */ matches: Uint32Array | null }
export function compileQuick<T>(text: string, quickColumns: readonly ResolvedColumn<T>[], env: FilterEnv<T>): CompiledFilter;
export function quickWords(text: string): readonly string[];   // fold, split on whitespace, drop empties
export function canNarrow(prev: readonly string[], next: readonly string[]): boolean; // same word count and each next word starts with the previous
```

**Behaviours**
- Words are ANDed. Each word must be found in at least one searched column.
- Searched columns: visible `text` and `enum` columns read raw (enum matches both label and value).
- Numeric, day and instant columns are searched only if the word contains a digit, against both the display text and the export text (so `2026-03` and `05/03` both work).
- Hybrid fold cache as in step 9 (ASCII fast path, non-ASCII cells cached folded). It is released when the quick text becomes empty.
- Narrowing: when the new words only extend the previous ones, search only the previous matches. The model passes the previous matches in as `within`.
- Whitespace-only quick text is inactive. Hidden columns are never searched.

**Tests (unit)**
- Typing `h`, `he`, `hel`: scans 100 rows, then at most the matches of `h`, then at most the matches of `he` (counter `stats.quickScanned`).
- `fold` additions: `ال` plus marks.

**Conformance `quick-filter`, columns name (text) and city (text), plus an optional hidden column:**

| Case | Data | Quick | Expected |
|---|---|---|---|
| accent-fold | `Hélène Martin`, `Helen Marten` | `helene` | row 1 |
| two-words-across-columns | row: name Hélène, city Marseille | `mar hel` | row matches |
| arabic-marks | `مُحَمَّد علي`, `محمد` | `محمد` | both |
| digit-in-number-column | number col `1234.5`, `99` | `1234` | row 1 (export text `1234.5`) |
| hidden-column | match only in a hidden column | any | `[]` |

**Bench lines (K.8)**
- `quick filter 100 000 x 10 text columns (cold, ASCII)`: 150 ms.
- `quick filter narrowing step (warm)`: 20 ms.
- Add one Arabic non-ASCII cold line, provisional 2× the first median.

### Step 12: client model and pipeline

**Files:** `model/{types,query,pipeline,client}.ts`, `test/{client,memo,overlay}.test.ts`, extend suites `displayed-order`, `selection` hooks not yet.

**Signatures**
```ts
export interface Query { readonly sort: readonly SortItem[]; readonly filter: FilterModel; readonly quick: string; readonly key: string }
export function makeQuery(q?: Partial<Pick<Query, 'sort'|'filter'|'quick'>>): Query;  // canonical key: sorted object keys, no volatile fields
export const EMPTY_QUERY: Query;

export type ModelStatus = { phase: 'idle' };   // loading and error arrive with Phase 3
export interface ModelChange<T> {
  readonly source: ChangeSource; readonly displayed: DisplayedRows<T>;
  readonly kind: 'rows' | 'order' | 'query' | 'context';
  readonly transaction?: TransactionResult; readonly problems: readonly Problem[];
}
export interface RowModel<T> {
  readonly kind: 'client'|'paged'|'infinite'|'server-side';
  readonly displayed: DisplayedRows<T>; readonly status: ModelStatus;
  setQuery(q: Query, source?: ChangeSource): void;
  invalidate(o?: { keepScroll?: boolean }): void;
  subscribe(fn: (c: ModelChange<T>) => void): () => void;
  destroy(): void;
}
export interface ClientOptions<T> {
  readonly rows: Iterable<T>; readonly getRowId: (row: T) => RowIdInput;
  readonly columns: ColumnLookup<T>; readonly ctx: LocaleCtx; readonly reader?: ValueReader<T>;
}
export interface ClientModel<T> extends RowModel<T> {
  readonly kind: 'client'; readonly store: RowStore<T>;
  readonly counts: { readonly total: number; readonly filtered: number };
  readonly problems: readonly Problem[];                       // from the last run, capped
  setRows(rows: Iterable<T>, source?: ChangeSource): TransactionResult;
  applyTransaction(tx: RowTransaction<T>, source?: ChangeSource): TransactionResult;
  setColumns(columns: ColumnLookup<T>): void;
  setContext(ctx: LocaleCtx): void;
  setReader(reader: ValueReader<T>): void;       // does NOT recompute (K.14)
  reapply(): void;                                // recompute filter and sort against the current reader
  readonly diagnostics: { filterRuns: number; sortRuns: number; rankBuilds: number; keyBuilds: number; displayedBuilds: number; quickScanned: number };
}
export function clientRows<T>(o: ClientOptions<T>): ClientModel<T>;
```

**Behaviours: pipeline and memo keys**
- The stages are filter (including quick), then sort, then displayed rows. Each stage keeps its last result only, under this key:
  - Filter: `(snapshot identity, filterKey, quickKey, quickColumns key, colsVersion, ctxKey, readerStamp)`.
  - Sort: `(filter output identity, sortKey, colsVersion, ctxKey, readerStamp)`.
  - `readerStamp` is `reader.version` captured when the stage last ran. It changes only through `reapply()` or when the stage's own inputs change. An overlay edit alone never reorders (K.14).
- A sort change does not rerun the filter. A quick-filter change reruns the filter and the sort (the input set changed) but not the key or rank builds.
- Setting a query whose `key` equals the current one is a no-op: same `displayed`, no notification.
- Transactions use `store.lastDelta`:
  - Update-only: re-test only `changedSrc` rows in the filter (the mask is patched, O(k)). Patch rank and key caches. Rerun the sort only if a changed row's value for a sort column differs from before. New `displayed` object, version bumped.
  - Anything else: full recompute with a cleared cache.
- `DisplayedRows.version` is a model counter that increments on every new displayed object.
- One notification per mutation, synchronous.
- `ModelChange.source` is passed through. `destroy()` stops notifications. Diagnostics are counters only (no timers, per purity).

**Tests (unit)**
1. A sort-only `setQuery` leaves `filterRuns` unchanged.
2. The same `Query` twice leaves `displayed` identical and sends no notification.
3. An update to a non-key column re-tests exactly 1 row and `sortRuns` is unchanged.
4. A fake overlay reader: `{overlay:true, version:n, value:(col,row,id)=>edits[id]?.[col.id] ?? row[col.field]}`.
   - Edits do not reorder until `reapply()`.
   - After `reapply()`, sort and filter see the edited values.
5. `displayed.indexOf(key)` agrees with `nodeAt` after sort, filter and transaction.
6. After `destroy()`, `subscribe` callbacks never fire.

**Conformance `displayed-order`** (invariant 1, bug 1), richer than step 7: ops `sort`, `filter`, `tx`, with probes. Expected `{displayed:[ids], indexOf:{id:n|-1}}`.
- Case `sort-then-click-third`: rows `a v3, b v1, c v2, d v0`; sort `v asc`; the third displayed row is `c`, not source row 3 (`c`) coincidentally. Use `v: a 3, b 1, c 2, d 0` so source[2]=`c` but displayed[2]=`b`. Hand expectation: displayed `[d,b,c,a]`, `atIndex 2 = c`.
- Case `filter-removes-row`.
- Case `transaction-while-sorted`.

**Bench lines**
- `setQuery sort change on 100 000 (numeric, warm keys)`: 25 ms.
- `transaction update 1 row on 100 000 (sorted and filtered)`: 1 ms.
- `transaction append 1 000 rows on 100 000`: 20 ms.

### Step 13: layout

**Files:** `layout/{prefix-sums,rows,window,scroll-mapper,anchor}.ts`, `test/layout.test.ts`, suites `layout-rows`, `layout-cols`, `scroll-mapper`.

**Signatures**
```ts
export const MAX_PHYSICAL = 4_000_000;
export const REBASE = 1 << 20;

export class PrefixSums {
  constructor(sizes: ArrayLike<number>);
  readonly length: number; readonly total: number;
  sizeAt(i: number): number;
  set(i: number, size: number): boolean;          // true if changed; throws RangeError on NaN or negative
  offsetOf(i: number): number;                    // sum of [0, i), i in [0, length]
  indexAt(offset: number): number;                // largest i with offsetOf(i) <= offset, clamped to [0, length-1]; -1 if empty
  rebuild(): void;                                // exact recompute (drift reset)
}

type IndexMint = Pick<DisplayedRows<unknown>, 'count' | 'index'>;   // DisplayIndex is minted only through index()
export interface RowLayout {
  readonly count: number; readonly total: number; readonly uniform: boolean;
  offsetOf(i: DisplayIndex): number; heightOf(i: DisplayIndex): number;
  indexAt(offset: number): DisplayIndex;          // clamped; call only if count > 0
  setHeight(i: DisplayIndex, h: number): boolean; // always false on a uniform layout
}
export function uniformRowLayout(rows: IndexMint, height: number): RowLayout;
export function variableRowLayout(rows: IndexMint, estimate: number, heights?: ArrayLike<number>): RowLayout;

export interface ScrollMapper {
  readonly scaled: boolean; readonly logicalHeight: number; readonly physicalHeight: number;
  readonly ratio: number; readonly maxLogical: number; readonly maxPhysical: number;
  toLogical(physicalTop: number): number; toPhysical(logicalTop: number): number;
}
export function scrollMapper(logicalHeight: number, maxPhysical: number, viewportBlockSize: number): ScrollMapper;  // ported from S1

export interface LayerPlacement { readonly base: number; readonly layerTop: number }
export function layerPlacement(logicalTop: number, physicalTop: number, rebase?: number): LayerPlacement;

export interface WindowView { readonly block: number; readonly inline: number }
export interface Window2D {
  readonly rows: { readonly first: DisplayIndex; readonly last: DisplayIndex } | null;
  readonly cols: { readonly first: number; readonly last: number } | null;
  readonly placement: LayerPlacement;
}
export function visibleWindow(rows: RowLayout, centerCols: PrefixSums, mapper: ScrollMapper, physicalScrollTop: number,
  scrollInline: number, view: WindowView, o: { overscanRows: number; overscanCols: number }): Window2D;
export function overscanRows(speedPxPerSec: number, rowHeight: number, o?: { min?: number; max?: number }): number;  // clamp(4, 4 + speed*0.1/rowHeight)

export type ScrollAnchor = { readonly kind: 'row'; readonly index: DisplayIndex; readonly delta: number } | { readonly kind: 'end' };
export function anchorFor(layout: RowLayout, scrollTop: number, viewBlock: number, isMeasured: (i: DisplayIndex) => boolean): ScrollAnchor | null;
export function scrollTopFor(anchor: ScrollAnchor, layout: RowLayout, viewBlock: number): number;
```

**The Phase 0 signature change (stated plainly)**
- `visibleWindow` no longer takes a raw `scrollBlock`. It takes the `ScrollMapper` and the physical `scrollTop`, converts to the logical offset itself, and returns the layer placement (`base`, `layerTop`) for the re-anchored layer.
- `scrollInline` is already logical (normalised by the DOM `dir` module). `scrollMapper` keeps the 3-argument form. The DOM passes `maxPhysical - headerHeight`, as the S1 spike does.

**Behaviours**
- `scrollMapper` is a straight port. It maps the scroll range `[0, L−vp]` onto `[0, P−vp]` with exact end points, and is unscaled when `L <= maxPhysical`. Rebuild it on resize.
- Window: `first = max(0, indexAt(logical) − overscan)` and `last = min(count−1, indexAt(logical + view.block) + overscan)`. Empty inputs give `null`.
- Anchor, from S3:
  - Normal: the first visible row that has already been measured, with its offset delta.
  - Fallback: the first visible row.
  - At the end (`scrollTop > 0 && scrollTop + viewBlock >= total − 1`): the `'end'` anchor.
  - `scrollTopFor` returns `offsetOf(index) + delta`, or `total − viewBlock` for `'end'`.
- Zero-size items: `indexAt` returns the last of the equal offsets.

**PrefixSums choice: Fenwick tree, with `sizes` kept (16 B/row, only when heights vary)**
- Fixed-height grids use `uniformRowLayout`: O(1), no memory at all. This is the common case and the one that matters for the 120 B/row budget.
- Variable heights (auto-height) need `offsetOf` and `indexAt` per frame and tens of `set` calls per frame. Fenwick gives O(log n) for all three, about 17 steps at 100 000.
- A flat prefix array with lazy rebuild would give O(1) `offsetOf` but needs a roughly 0.1 to 0.2 ms rebuild per batch at 100 000, and a binary search for `indexAt`. It is not clearly better.
- Fenwick is also what S3 measured (0.2 to 0.3 ms per update frame at 100 000 rows) and what DzCalendar B.12 uses.
- Columns (at most a few hundred) use the same class.
- Drift: partial sums accumulate float error. `rebuild()` resets it; a test asserts less than 1e-6 after 100 000 random sets.

**Scope limit:** binding measured heights to rows across re-sorts (heights per row key) is Phase 5. Phase 1 delivers only the math and the anchor.

**Tests (unit):**
- Property test (mulberry32) of `PrefixSums` against a naive prefix sum: `offsetOf`, `indexAt` and `set` over 5 000 operations.
- `indexAt` of `[10,0,10]` at offset 10 returns 2.
- `RowLayout.indexAt` returns a `DisplayIndex` that `displayed.index` accepts.
- `scrollMapper(NaN, …)` treats the height as 0.

**Conformance**

`layout-rows`, input `{kind, heights|height, count, scrollBlock, view, overscan}`:

| Case | Input | Expected |
|---|---|---|
| uniform-window | uniform 32, count 1000, scrollBlock 3200, view.block 600, overscan 2 | rows `[98, 120]` (`indexAt(3200)=100`, `indexAt(3800)=118`) |
| variable-offsets | sizes `[10,20,30,40]` | offsets 0, 10, 30, 60, 100; `indexAt(35)=2`; `indexAt(100)=3`; `indexAt(-5)=0` |
| empty | count 0 | rows `null` |
| anchor-keeps-row | 1000 rows of 48, scrollTop 4810, view 600, rows 100 to 112 measured; then row 50 becomes 80 | anchor row 100, delta 10; `scrollTopFor` gives 4842 |
| anchor-end | total 48000, scrollTop 47400; then row 5 grows by 30 | anchor `end`; `scrollTopFor` gives 47430 |

`layout-cols`: sizes `[100,200,50]`, scrollInline 150, view.inline 100: overscan 0 gives cols `[1,1]`; overscan 1 gives `[0,2]`.

`scroll-mapper`:

| Case | Input | Expected |
|---|---|---|
| unscaled | L 10 000, vp 600 | `toLogical(5000)=5000`; `toLogical(99999)=9400` |
| smaller-than-viewport | L 300, vp 600 | max 0 |
| scaled-exact-ends | L 32 000 000, maxPhysical 4 000 000, vp 700 | scaled; `toLogical(3 999 300)=31 999 300` exactly; `toPhysical(31 999 300)=3 999 300`; `toLogical(-1)=0` |
| layer-placement | logical 3 000 000, physical 375 000 | base 2 097 152, layerTop -527 848 |

**Bench lines**
- `PrefixSums build 100 000`: 5 ms.
- `PrefixSums 1 000 set + 1 000 indexAt (100 000 rows)`: 5 ms.
- `visibleWindow x 10 000 (variable 100 000 rows)`: 20 ms.
- `scrollMapper build x 100 000`: 20 ms.

### Step 14: selection

**Files:** `selection/rows.ts`, `test/selection.test.ts`, suite `selection`.

**Signatures**
```ts
export type SelectionState =
  | { readonly mode: 'include'; readonly keys: ReadonlySet<RowKey> }
  | { readonly mode: 'exclude'; readonly keys: ReadonlySet<RowKey> };
export const NO_SELECTION: SelectionState;
export function isSelected(s: SelectionState, k: RowKey): boolean;
export function selectionCount(s: SelectionState, total: number | null): number | null;
export function selectOnly(keys: Iterable<RowKey>): SelectionState;
export function toggle(s: SelectionState, k: RowKey): SelectionState;
export function selectAll(): SelectionState;                      // exclude, empty
export function clearSelection(): SelectionState;
export type RangeResult = { readonly ok: true; readonly state: SelectionState } | { readonly ok: false; readonly reason: 'anchor-not-displayed' | 'target-not-displayed' };
export function selectRange<T>(s: SelectionState, displayed: DisplayedRows<T>, anchor: RowKey, target: RowKey, o?: { additive?: boolean }): RangeResult;
export function reconcileSelection(s: SelectionState, has: (k: RowKey) => boolean): SelectionState;
```

**Behaviours**
- Selection is by `RowKey`, so it survives sort, filter and refresh.
- `selectAll` flips to `exclude` mode with no keys, never materialising 10⁷ keys.
- Count: `include` gives `keys.size`; `exclude` gives `total − keys.size`, or `null` when `total` is `null`.
- A range runs in the current displayed order between `indexOf(anchor)` and `indexOf(target)`. A bound that is not displayed leaves the state unchanged and returns the reason (an announcement later, not a `ProblemCode`).
- All operations are immutable. Each copies the set (O(k)).

**Tests (unit):**
- `selectRange` after a sort uses the displayed order, not the source order.
- `reconcileSelection` removes keys the store no longer has.
- `exclude` with one key and total 10 gives count 9.

**Conformance `selection`, input `{rows, sort?, ops[]}`, expected `{mode, keys (sorted), count}`:**

| Case | Ops | Expected |
|---|---|---|
| toggle-twice | toggle a, toggle a | include, `[]` |
| range-in-displayed-order | rows a v3, b v1, c v2, d v0; sort `v asc` (displayed d,b,c,a); select d, then range d..c | keys `[b,c,d]` |
| select-all-then-deselect | selectAll, toggle b, total 4 | exclude, `[b]`, count 3 |
| range-anchor-missing | filter removes the anchor | unchanged; `anchor-not-displayed` |

**Bench:** none (cheap operations).

### Step 15: closing, problems suite, size, review

**Files:** `conformance/cases/problems/*.json` (16), `conformance/runner/suites/problems.ts`, `packages/core/test/public-api.test.ts`, `size-budget.json`, `ROADMAP.md`, `ARCHITECTURE.md`, `conformance/README.md`.

**Work**
- Complete the `problems` suite (section 5).
- Add a test that every code in `PROBLEM_CODES` has `conformance/cases/problems/<code>.json` (the id equals the code, which matches the schema pattern).
- Add `public-api.test.ts`: the sorted `Object.keys` of the `index.ts` exports against a hand-written list, so the surface cannot widen by accident. Internals (`ColumnCache`, `flatDisplayed`, …) stay unexported.
- Re-measure `check:size` on the minified bundle and raise `@dzgrid/core` from 4000 B to the measured value plus 10%. Record it in ROADMAP. K.8's base cap is 28 kB; Phase 1 should be well under.
- Write the ARCHITECTURE.md "Ajustements après la Phase 1" list from section 0.
- Update ROADMAP exit criteria. Run the architect review and code review, fix the findings with tests that fail first.

**Exit criteria (§6)**
- Dataset A (100 000 × 30) loads in 80 ms or less.
- Numeric sort 40 ms or less, text sort 250 ms or less, text filter 35 ms or less, store overhead 120 B/row or less.
- `types.test.ts` proves a `number` is never a `DisplayIndex`.
- `zoneDayBounds` holds on the 12 zones (already true).
- `purity.test.ts` is green.
- One conformance case exists per `ProblemCode`.
- `npm test`, `test:ci`, `test:tz` and `typecheck` are green.

### Bench harness changes (done in step 3, extended per step)

`perf/budgets.json` today has only ms lines, and `bench.mjs` runs `CASES` functions with a warm-up. Needed:
1. **Cases with untimed setup.** Dataset A takes about 400 ms to build and the cold lines need a fresh cache per run.
   - Change `perf/bench-entry.ts` so `CASES[name]` is `{ setup?: () => unknown; run: (ctx: unknown) => unknown }`.
   - `bench.mjs` calls `setup` before each timed run, untimed. Keep plain functions working.
2. **A `memory` section** in `budgets.json` (`"memory": { "store overhead bytes/row (100 000 rows)": 120 }`), measured by `bench-entry` exporting `MEMORY: Record<string, () => number>`.
   - Enable `gc` in `bench.mjs` with `v8.setFlagsFromString('--expose-gc')` and `vm.runInNewContext('gc')`.
   - Measure heap before and after building the store, excluding the host's rows (built first, then gc).
   - Dataset rows must be built as single object literals (S1: key-by-key construction cost 4.2× the memory).
3. **Dataset A generator** in `perf/dataset.ts`: seeded `mulberry32`, 30 columns (10 text, 8 numbers, 4 days, 2 instants, 3 enums, 2 booleans, 1 id). Text is ported from the S5 `makeStrings` (fr and ar).

K.8 lines (fixed): load ≤ 80 ms, numeric sort ≤ 40 ms, text sort ≤ 250 ms, text filter ≤ 35 ms, quick filter ≤ 150 ms, memory ≤ 120 B/row. Every other line is provisional and is set to 2× the first stable median, recorded in ROADMAP. Existing lines (`zoneDayBounds`, `assignKeys`, `parseDay`, `readInstant`) are unchanged.

## 2. Behaviour sheets to write before code (`docs/behaviors/*.md`)

Each sheet has the four README sections: what the user does, what they observe, what DzGrid does, and tests. Sources are public docs and the usual spreadsheet behaviour. Never source code.

| Sheet | Observable behaviours to state | Where DzGrid deliberately differs |
|---|---|---|
| `sort.md` | Click cycle asc, desc, none; Shift+click adds a column and the order of clicks is the precedence; text sorts by language rules (a before B, é near e); numbers sort numerically; "2" before "10" in text with digits; blanks stay at the bottom; equal rows keep their original order. | Blanks last in both directions (D3); equal values keep source order even in descending; Arabic hamza forms, harakat, tatweel and Arabic-Indic digits compare equal at base level (S5); instants sort chronologically, not as text; sort never changes the host's data. |
| `filter-text.md` | Contains, starts with, ends with, equals, not-contains, not-equal, blank, not-blank; case ignored; an empty box means no filter; the count of visible rows updates. | Accents, Arabic marks and alef forms ignored by default (D2); `caseSensitive` is exact; negations include blanks (D4); needles are not trimmed; whitespace-only is not blank. |
| `filter-number.md` | Equals, not-equal, less/greater (and or-equal), between (both ends included), blank; typing `5` filters rows with 5. | Reversed `between` bounds are swapped; unreadable cells count as blank with a warning (D4); filter values are machine numbers, not locale text; half-typed filters are inactive. |
| `filter-day.md` | Calendar-day comparisons, "on", "before", "after", "between" with both ends included; no time-of-day involved. | A `Day` is never turned into an instant; no zone is involved; invalid dates (31 Feb) are errors, never rolled over. |
| `filter-instant.md` | "On this day" shows everything that happened that day in the displayed time zone; "between days" covers whole days; "before" and "after" a moment. | Day bounds come from `zoneDayBounds`: a day can be 23, 23.5, 24, 24.5 or 25 hours, or not exist. The range is half-open `[from, to)`, so 23:59:59.999 is in and midnight the next day is out. The filter model is machine-format only: offset required. |
| `filter-misc.md` | Boolean: all, yes, no. Set: tick values; blanks listed as a choice. Two conditions on a column joined by AND or OR. | Set matches on raw stable text (`toExport`), not the display label. `setValues()` index arrives in Phase 3. |
| `quick-filter.md` | One search box; several words must all appear, in any column, in any order; typing narrows the list live; hidden columns are not searched. | Folding of case, accents, Arabic marks, alef forms and Arabic-Indic digits; numeric and date columns are searched only when the word has a digit, on display text and on the stable export text; ة is not folded to ه (matches S5's collator). |
| `value-input.md` | Typing or pasting text into a cell reads it as the column's type; unreadable text is refused, not stored; a percent sign means ÷100; a day is read in the user's order. | Locale rules with Arabic-Indic and Persian digits and Arabic separators; `1,5` in an English locale is refused, never guessed; two-digit years and month names refused; yes/no words in fr, en and ar; typed wall times inside a clock change refused. |
| `display-format.md` | Numbers and dates shown the way the user's language writes them; same on every machine. | Gregorian always, even for `ar-SA`; Latin digits by default (`numerals:'locale'` opts in); years before 1583 shown as ISO; invisible direction marks may be present in Arabic output. |
| `row-identity-transactions.md` | Rows are identified by an id the host provides; adding, updating, removing; a feed that resends all rows updates the grid without losing selection or scroll. | Duplicate ids: the first row stays, the rest are refused with a problem; `1` and `'1'` are one id; remove, then update, then add inside one transaction; a transaction is one version and one notification; the host's rows are never modified. |
| `selection.md` | Click selects one; Ctrl or Cmd toggles; Shift selects a range in the order on screen; header box selects all; selection survives sorting and filtering. | Selection is by row id, never position; "select all" is stored as "everything except" so it costs nothing at 10⁷ rows; a range whose end is no longer shown is cancelled, never reinterpreted. |
| `column-layout.md` | Fixed, minimum, maximum and flexible widths; pinned columns stay at the start or end edge; hidden columns vanish; user changes survive a column-definition refresh. | `start`/`end` (never left/right); flex widths are whole pixels (largest-remainder); user state kept by column id. |
| `virtual-scroll.md` | Only visible rows exist; the scrollbar reflects the full length; the last row is always reachable; rows do not jump when heights are measured. | Scroll range mapped, not height, above about 125 000 rows (S1); no row cap; anchor on the first measured visible row, or the end anchor (S3). |

The sheets cover ag-Grid-style behaviours only through what a user can see. Where I write "spreadsheets", that is the generally known behaviour of Excel and Google Sheets. I did not consult any grid source.

## 3. Data structures and complexity

| Structure | Shape | Operations (n = 100 000) | Memory |
|---|---|---|---|
| `RowSnapshot` (generation) | `rows[]`, `ids[]` (canonical strings), `Map<string, srcIndex>`; immutable once published | lookup O(1); load O(n) (about 20 ms); update-only tx copies `rows` O(n) (about 0.3 ms), shares `ids` and the Map | about 61 B/row (8 + 8 + about 45 Map entry); host rows excluded |
| Map sharing | Append-only shared Map across a lineage; entries with index ≥ `rows.length` ignored by older generations; `remove` and `addAt` build a fresh Map O(n) (about 10 to 15 ms) | | |
| `DisplayedRows` (flat) | `order: Uint32Array \| null` (display→source) and a lazily built `Int32Array` source→display | `index` O(1); `nodeAt` O(1) with a small allocation; `indexOf` O(1) after one O(n) build (about 0.2 ms); `nextData` O(1) | 4 B/row, plus 4 B/row once `indexOf` is used |
| Pipeline memo | One result per stage, keyed as in step 12; key and rank caches by (column, collator, generation, reader stamp) | unchanged inputs: O(1); update-only transaction: O(k) re-tests and cache patches | key arrays 8 B/row per used column; rank cache at most 8 entries |
| Edit overlay (`ValueReader`) | `overlay:false` fast path reads `col.read(row)` directly; with an overlay, `value(col, row, id)` looks up a nested `Map<RowKey, Map<col, cell>>` by canonical id | no overlay: 0 extra cost; overlay: O(1) per cell | none until Phase 4 |
| Rank-key cache | `dict: Map<string, rank>`, `ranks: Float64Array`; invalidation rules in step 8 | cold build = collate distinct values once (S5: 111 + 16 ms fr, 130 to 210 ms ar); warm re-sort about 15 ms | 8 B/row per cached column |
| Fold cache | per (generation, column): folded strings only for non-ASCII cells; released when quick text is empty | build 100 000 non-ASCII cells about 50 ms (estimate, to measure) | transient |
| `PrefixSums` | Fenwick tree plus `sizes` | `set`, `offsetOf`, `indexAt` O(log n) (about 17 steps); build O(n) | 16 B/row, only for variable heights |

How the edit overlay plugs in now even though editing is Phase 4:
- `ValueReader` is part of `SortEnv` and `FilterEnv`. `clientRows` takes `reader` (default `NO_OVERLAY`).
- The pipeline never reads `rows[i]` fields directly. It goes through `col.read(row)` when `!reader.overlay`, otherwise `reader.value(col, row, ids[i])`.
- Phase 4's `CellEdits` implements `ValueReader`. K.14 holds because `setReader` does not recompute, and only `reapply()` does.
- A unit test with a fake overlay (step 12) proves the seam. Nothing else from `edit/` is built.

## 4. Codec summary and Intl

- **text:** identity parse. Sort by rank keys through `Intl.Collator(base, numeric)`. Export is the string; formula-injection guarding is Phase 3 CSV.
- **number:** the S5 rules in step 4. The stripped marks are U+200E, U+200F, U+061C, U+00A0, U+202F and U+066C (as group). U+066B is decimal and U+066A is percent. Arabic-Indic and Persian digits become Latin. U+2212 is accepted as minus.
- **boolean:** fr/en/ar word lists in step 5. Display labels come from the host (`booleanCodecWith`); the core holds no visible strings.
- **enum:** `value`, `label` and `aliases` matched through `fold`. Sorted by label.
- **day:** ISO in any locale, or the locale's numeric order with a 4-digit year. Formatted via UTC midnight, so no zone can shift it.
- **instant:** ISO with offset, a number as epoch ms, or `<day> HH:mm[:ss]` read in `ctx.timeZone`. It uses step 1's resolver and `'reject'` for typed input.
- **Formatters:** one `Intl.NumberFormat` or `DateTimeFormat` per (ctx key, spec), cached; always `intlTag` (calendar gregory plus numbering system). No `localeCompare`, no `Date`.
- **`toExport`:** raw and stable (plain decimal, ISO day, UTC ISO instant, raw enum value, `true`/`false`).

## 5. ProblemCodes (16) and one conformance case each (suite `problems`)

Input shape `{op, …}`, expected `{problems:[{code, severity, path}]}`. Case id equals the code. Severities and paths below are my proposal; hand-write them.

| Code | Severity | Case input | Path |
|---|---|---|---|
| `invalid-row-id` | error | `replaceAll [{id:''}]` | `rows[0]` |
| `duplicate-row-id` | error | `replaceAll [{id:'a'},{id:'a'}]` | `rows[1]` |
| `unknown-row-id` | error | tx `update:[{id:'zz'}]` | `update[0]` |
| `invalid-transaction` | error | tx `add:[{id:'x'}], addAt:-1` | `addAt` |
| `invalid-day` | error | day filter `value:'2026-02-31'` | `filter.born.value` |
| `invalid-instant` | error | instant filter `before at:'tomorrow'` | `filter.created.at` |
| `ambiguous-instant` | error | instant filter `before at:'2026-03-05T10:00'` | `filter.created.at` |
| `wall-time-skipped` | warning | step 1: `parseInstant('2026-03-29T02:30', {assumeZone:'Europe/Paris', disambiguation:'compatible'})` | path per step 1 |
| `wall-time-ambiguous` | warning | step 1: `'2026-10-25T02:30'`, Europe/Paris, `'compatible'` | path per step 1 |
| `invalid-column` | error | `columns:[{type:'number'}]` | `columns[0]` |
| `duplicate-column-id` | error | two columns with id `a` | `columns[1]` |
| `invalid-field-path` | error | `{id:'a', field:'x..y'}` | `columns[0].field` |
| `unknown-column` | error | sort on `zz` | `sort[0]` |
| `invalid-sort` | error | `{column:'v', dir:'sideways'}` | `sort[0]` |
| `invalid-filter` | error | `number` filter on a text column | `filter.name` |
| `invalid-cell-value` | warning | number column cell `'abc'`, then sort | `rows[1].v` |

- `Problem.detail` for `invalid-cell-value` is only the type name, never row data.
- The two `wall-time-*` cases use the owner's step 1 exports, so those two files are written when step 1 lands.
- Locale and zone errors are not Problems: a bad context throws `RangeError`, as the Phase 0 rule says.

## 6. What Phase 1 must NOT do, and what to take from ngx-sheetgrid

**Not in Phase 1**
- No DOM, scheduler, theme or messages (`MESSAGE_KEYS`, plurals): Phase 2.
- No kernel (§3.17) and no keyboard intents.
- No grouping, tree, pivot or master/detail; no server models, `RequestGate` or paged models (Phase 3).
- No set-filter value index (`setValues`), no filter UI, no advanced filter, no external filter, no `resolved`/`zone` server fields (Phase 3 and 8). `resolveInstantRange` is only the seam.
- No `edit/` modules (`CellEdits`, coordinator, undo, validators), range selection, clipboard or fill (Phase 4). Only the `ValueReader` seam.
- No CSV or XLSX export. `toExport` exists on codecs, but formula-injection guarding is Phase 3.
- No column groups, `autoSizePlan`, column moving, saved `GridState` (Phase 5).
- No binding of measured heights to rows across re-sorts (Phase 5).
- No retained-row focus or DOM concerns.
- No cell rule engine (Phase 2).
- No ag-Grid compat layer; no Worker.

**From ngx-sheetgrid**
- `cell-value.ts`
  - Take the `REJECTED` symbol and the principle that typing and pasting obey one rule. The "refuse `abc` over an amount" cases become `value-parse` conformance cases, after reading its spec.
  - Change: the `'true','1','yes','oui'` lists grow to fr, en and ar. `Number(text)` is replaced by the locale reader. `kindOf(renderer, current)` (guessing from the current value) is dropped in favour of `ColumnType`. The editor-output check `isAcceptable` becomes Phase 4.
- `rule-engine.ts`
  - Not Phase 1; it becomes `rules/rules.ts` in Phase 2.
  - Take the "first matching rule wins" order and the `when` operator set.
  - Change:
    - `STYLE_MAP` hex and `rgba` become class names (`dzg-rule--danger`).
    - `textColor`/`bgColor` are removed.
    - The `v as number` casts become typed comparisons, because `gt` on strings is currently JS coercion.
    - `contains` uses `fold`.
- `date-value.ts`
  - Do not port (it uses `Date`).
  - Its semantics are already `Day` and `InstantMs`. `DATE_ONLY` becomes `parseDay`; "31 Feb gives null" is already tested. Its spec cases become `value-parse` and `filter-day` conformance cases.
  - `serializePickedDate` becomes the Phase 3 date-picker adapter output: a `Day`, or an ISO instant with offset.
- `displayed-rows.ts`
  - Do not port. The intent (holes for no-data nodes) is `DisplayedRows.nextData`. The sort-then-click bug becomes the `displayed-order` conformance cases.

## 7. Risks

1. **Speed margins.** S5 measured on an M4 Max in node and browsers. K.8 targets a mid-range laptop, perhaps 2 to 3× slower. Arabic cold text sort (130 to 210 ms) is the tightest at about 1.2× margin. The numeric sort line (40 ms) assumes about 15 ms of typed-array sorting plus about 5 ms of key extraction. `TypedArray.sort` with a comparator may behave differently in Safari and Firefox, so a browser check is still pending (not part of Phase 1).
2. **Quick filter cold at 150 ms** is tight. It relies on the ASCII fast path; fully Arabic data relies on the fold cache. Measure both before fixing the budget.
3. **ISO-string columns.** Parsing 100 000 instant strings costs about 120 ms (existing bench line); day strings cost more than a charCode check would. Both are paid once per generation through the key cache, but the first sort or filter on such a column exceeds the numeric target. Say so in the sheet.
4. **ICU gregory switches to Julian before 1582-10-15** (unverified, I did not run it). A `Day` is proleptic Gregorian, so `Intl` formatting of old days could differ by up to 10 days. Mitigation here: ISO fallback below 1583. This also affects `wallAt`/`zoneDayBounds` for instants before 1582 outside UTC. It is worth a test documenting the behaviour, and `iso8601` as the calendar would be a possible fix in `zone-day.ts`.
5. **Memory budget assumes D1.** If the owner insists on stored `DataNode` objects, expect about +48 B/row and an estimate near 110 B/row, barely under 120.
6. **Host row shape.** S1 measured 4.2× memory for rows built key by key. The bench must use literal rows, and the docs should say so.
7. **Product calls in D2 to D5** (accent-insensitive text filters, blanks last, complement negations, `%` and lenient separators) are choices, not facts. Wrong guesses are cheap to change now and expensive after the sheets and conformance cases ship.
8. **Number parsing gaps.** Indian 2-digit grouping and `fr-CH` apostrophe quirks (S5 saw engine differences) are refused or only partly handled. Document them in `value-input.md`.
9. **Intl typings.** `numberingSystem` and `calendar` as option names may not be in the ES2023 lib; the tag approach is the safe fallback.
10. **Engine tzdata differences** remain (already noted in S5). Instant filter bounds are resolved on the client, so the server should not trust them far into the future (Phase 3).
11. **Host `getRowId` exceptions** are caught and reported as `invalid-row-id`; a thrown error from host code is turned into data-shaped feedback, which may hide host bugs. The detail never contains the message.
12. **Scope.** Steps 8 to 12 are the heavy ones. If time is short, step 11 (quick filter) and the incremental update path in step 12 are the safest to defer without breaking Phase 1 exit criteria, except the "quick-filter" conformance suite named in §6.

## 8. Files, summary

Existing files to modify: `packages/core/src/{problems,ids,index}.ts`, `conformance/runner/runner.test.ts` (split), `conformance/README.md`, `perf/{budgets.json,bench-entry.ts}`, `scripts/bench.mjs`, `size-budget.json`, `ROADMAP.md`, `ARCHITECTURE.md`.

New under `packages/core/src`: `value/{locale,digits,number,codec}.ts`, `value/codecs/{text,number,boolean,enum,day,instant}.ts`, `i18n/{format,fold}.ts`, `columns/{defs,model,layout}.ts`, `row/{node,store,displayed,transaction}.ts`, `sort/{compile,collate}.ts`, `filter/{model,compile,text,number,day,set,instant,quick}.ts`, `model/{types,query,column-cache,pipeline,client}.ts`, `layout/{prefix-sums,rows,window,scroll-mapper,anchor}.ts`, `selection/rows.ts`.

New under `docs/behaviors/`: the 13 sheets in section 2.

Absolute paths of the files I relied on:
- `/Users/nadou/Dev/dzgrid/ARCHITECTURE.md`
- `/Users/nadou/Dev/dzgrid/ROADMAP.md`
- `/Users/nadou/Dev/dzgrid/CLAUDE.md`
- `/Users/nadou/Dev/dzgrid/packages/core/src/ids.ts`
- `/Users/nadou/Dev/dzgrid/packages/core/src/problems.ts`
- `/Users/nadou/Dev/dzgrid/packages/core/src/value/instant.ts`
- `/Users/nadou/Dev/dzgrid/packages/core/src/value/zone-day.ts`
- `/Users/nadou/Dev/dzgrid/packages/core/test/purity.test.ts`
- `/Users/nadou/Dev/dzgrid/conformance/runner/runner.test.ts`
- `/Users/nadou/Dev/dzgrid/scripts/bench.mjs`
- `/Users/nadou/Dev/dzgrid/perf/budgets.json`
- `/Users/nadou/Dev/dzgrid/spikes/s1-virtual-1m/scroll-mapper.ts`
- `/Users/nadou/Dev/dzgrid/spikes/s3-autoheight/autoheight.ts`
- `/Users/nadou/Dev/dzgrid/spikes/s5-intl/README.md`
- `/Users/nadou/Dev/dzgrid/spikes/s5-intl/bench.js`
- `/Users/nadou/Dev/ngx-sheetgrid/projects/datagrid/src/lib/cell-value.ts`
- `/Users/nadou/Dev/ngx-sheetgrid/projects/datagrid/src/lib/rule-engine.ts`
- `/Users/nadou/Dev/ngx-sheetgrid/projects/datagrid/src/lib/date-value.ts`
- `/Users/nadou/Dev/ngx-sheetgrid/projects/datagrid/src/lib/displayed-rows.ts`