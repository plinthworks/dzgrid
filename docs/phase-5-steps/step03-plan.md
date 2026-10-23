# Phase 5, step 3 — `@dzgrid/core/edit`: blueprint (architect, 2026-10-23)

Sources: `phase-5-plan.md` step 3, D2, D6, D7, D8, D10, D11; `decisions.md` Q5, Q8, Q9 Mixte, Q10 amended, Q11,
Q18, O1–O11, S2-O1…O5 (they win); sheets `edit-save.md` 1–5, 13–21, `edit-undo.md` 1–13, `edit-validation.md`
1, 8–11, `editing.md` 1, 9, 24, `editors.md` 1, 3–6, 10, 16–17, `edit-reapply.md` 1–2; ARCH §3.0 (`cell-edits.ts`,
six changes), §3.4, §3.10 rules 1–6, §3.17, K.14; `step02-plan.md` (seams). Clean room: our code only (the pure
`cell-edits.ts` of ngx-sheetgrid, its `stageEdits` / `settleSaved` / `settleFailed` logic). Tests first.

## Findings (code at the demos head, core 28 932 / 29 000)
- Seams ready: `edits.reader {reader, columns}` (kernel stores it, `rows.setReader(r, changed)`, `syncStale`),
  `rows.reapply`, `context.app`, `kernel.editable(key, column)` (data row, rule `=== true`, not locked, throw → no +
  one warning), `kernel.app`, `kernel.reader`. `ColumnDef.validate(value, row, context) → code | null` (type only;
  its shape check sits in the base, 17 B, R6 said it could move to this entry).
- `clientRows.setReader` keeps the reader's **number** `version` in its stage inputs: one reader object with a
  getter `version` works (the step-2 test reader does that). `ColumnCache` keys on `reader.version` **and** the store
  version: an output that changes because the store changed needs no version bump.
- The kernel's `modelUpdated` carries no `transaction`; `RowModel.subscribe` does (`ModelChange.transaction`
  `{kind: reset|delta|none, added, updated, removed}`). Server answers are `inner.setRows(rows, 'data')`: new row
  objects, a transaction from source `data`.
- `@dzgrid/core/internal` `emit(kernel, event)` sends any `GridEvent` to the kernel's listeners (DOM, Angular): an
  entry can raise events with **zero base runtime** — only the union's types grow.
- No kernel getter for the `LocaleCtx`; no clock, timer or `AbortController` allowed in the core (purity test);
  `sourceRows` has its own `plainAbort` (not exported).
- `instantCodec.parse` returns only `REJECTED`; `resolveWall(wall, zone, 'reject')` (public) gives
  `wall-time-skipped` / `wall-time-ambiguous`.
- Size measure: `gz(core + entry) − gz(core)`; relative imports of base modules cost nothing twice. No
  `@dzgrid/core/edit` line in `size-budget.json` / `rebudget.mjs` yet (granted 3 000, Q16).

## Base (`@dzgrid/core`): **0 B runtime**
Types only (erased): `ColumnDef.edit?: EditChecks<T, V>`; four `GridEvent` members; `SaveOrigin`. No command, no
problem code, no getter. **Optional −17 B**: move the `validate` shape check from `resolveColumns` to this entry
(told when the controller is created and on `columnsChanged`) — lead recommends it (margin 68 → 85 B for Part B).
The layering seam guard stays at the measure (28 932, or 28 915 with the move; comment names the step).

```ts
// columns/defs.ts (types)
export interface EditChecks<T, V = unknown> {
  readonly required?: boolean;
  readonly min?: V; readonly max?: V;                        // number | Day | InstantMs, compared by the codec
  readonly pattern?: string | RegExp;                        // string values only; whole value; a /g flag ignored
  readonly options?: readonly EnumOption[] | ((row: Readonly<T>, context: unknown) => readonly EnumOption[]);
  readonly maxLength?: number; readonly editor?: string;     // read by the DOM (steps 5–6), not checked here
}
interface ColumnDef<T, V> { readonly edit?: EditChecks<T, V> }
// kernel.ts (types, by shape: the base names nothing from src/edit/)
export type SaveOrigin = 'edit' | 'undo' | 'redo' | 'paste' | 'fill' | 'bulk';
| { type: 'cellEdited'; source; key: RowKey; column: string; value: unknown; previous: unknown; origin: SaveOrigin }
| { type: 'saveFailed'; source: 'data'; key; column; value: unknown; error: unknown; reason: string | null; code: string | null }
| { type: 'editStates'; source; cells: readonly { key: RowKey; column: string }[] }   // repaint marks (step 4/7)
| { type: 'undoChanged'; source; canUndo: boolean; canRedo: boolean }                 // on each flip only
```

## API (`@dzgrid/core/edit`)
```ts
export function createEdits<T>(kernel: GridKernel<T>, o: EditOptions<T>): EditController<T>;
export interface EditOptions<T> {
  readonly ctx: () => LocaleCtx;                       // the grid's (parse, compare, coerce)
  readonly save?: SaveHandler<T>;                      // absent: saved locally at once (edit-save 2)
  readonly abort?: () => AbortHandle;                  // the DOM passes () => new AbortController(); default a plain one
}
export type SaveHandler<T> = (req: SaveRequest<T>, signal: AbortSignalLike) => Promise<unknown> | unknown;
export interface SaveRequest<T> { readonly origin: SaveOrigin; readonly generation: number;
  readonly changes: readonly { key: RowKey; column: string; value: unknown; previous: unknown; row: Readonly<T> }[] }
export type CellInput = { readonly text: string } | { readonly value: unknown };   // typed | picked/toggled/undo/custom keep()
export interface EditController<T> {
  readonly reader: ValueReader<T>;                       // what `edits.reader` was given
  check(key: RowKey, column: string, input: CellInput): { ok: true; value: unknown } | { ok: false; code: string };
  /** One gesture: refused cells skipped (codes returned), unchanged cells dropped, the rest staged as ONE request. */
  commit(cells: readonly { key; column; input: CellInput }[], o?: { origin?: SaveOrigin; source?: ChangeSource }):
    { generation: number | null; staged: number; refused: readonly { key; column; code: string }[] };
  state(key: RowKey, column: string): CellState | undefined;
  readonly dirty: boolean;  flush(): Promise<void>;
  undo(source?: ChangeSource): UndoResult | null;  redo(source?: ChangeSource): UndoResult | null;
  readonly canUndo: boolean; readonly canRedo: boolean;
  setSave(save?: SaveHandler<T>): void;                  // Angular input change; in-flight requests keep theirs
  destroy(): number;                                     // aborts in flight, ignores late answers; returns dropped changes
}
export interface CellState { readonly status: 'pending' | 'saving' | 'saved' | 'failed'; readonly generation: number;
  readonly refused?: unknown; readonly reason: string | null; readonly code: string | null }
export interface UndoResult { readonly cells: readonly { key: RowKey; column: string }[]; readonly skipped: number }
export { parseInput, checkValue } // pure, for Part B's planPaste and the conformance runner
```
Lead decisions: no kernel command (`edit.stage` of ARCH §3.17 not added: base bytes); one controller per kernel (a
model or `getRowId` change = a new kernel, the DOM destroys the old controller — undo cleared, D10); serial per cell
only (ARCH's `parallel` mode dropped, never asked by a sheet); events through `emit`, no listener set of its own.

## Behaviour
**Input (`parseInput`, `checkValue`; edit-validation 1, 9–11)**
1. Text input: `text.trim() === ''` → `null` (any type; a text column keeps `'   '` as typed). Else `codec.parse(text,
   ctx)`; `REJECTED` → code by type: `number` → `parse`; `day` → `day`; `instant` → re-read with `{...ctx, timeZone:
   'UTC'}`: still `REJECTED` → `invalid-instant`, else `resolveWall(thatMs, ctx.timeZone, 'reject').code`
   (`wall-time-skipped` | `wall-time-ambiguous`); `enum` → `options`; `boolean`, `custom` → `invalid`. Arabic-Indic
   digits and the locale's decimal sign are the codecs' (unchanged).
2. Value input: blank → `null`; else `codec.coerce(v, ctx)`; null → `invalid`.
3. Then in order, the first failing wins: `required` (null) → `required`; `min` / `max` (`codec.compare`, skipped
   for null) → `min` / `max`; `pattern` (string values; a fresh `RegExp` without `g`/`y`, whole match) → `pattern`;
   `options` (static or `(row, app)`; a value not listed passes only if it is the cell's current value, editors 17)
   → `options`; `validate(value, row, app)` → its string (empty or non-string → none). A throw → `invalid` + one
   warning `invalid-column` `columns.<id>.validate` detail `threw` per column per controller (as `editable`).
4. Not `kernel.editable(key, column)` → `read-only` (never reaches the DOM's texts: the DOM does not ask).
5. Bad `edit` config (checked at creation and on `columnsChanged`): `min`/`max` not coercible by the codec, `pattern`
   not a string/RegExp or an invalid one, `options` not an array/function → warning `invalid-column`
   `columns.<id>.edit.<key>` (via `emit` `problems`, source `data`), that check ignored. `validate` not a function
   here too if the −17 B move is taken.
6. Unchanged: a staged value `same()` as the shown one (`Object.is`, both blank, or `codec.equals` of the coerced
   values) → dropped from the gesture: no request, no `cellEdited`, no undo entry (Enter without change).

**Overlay and reader (ARCH §3.0 changes 1–3, 5)**
7. `Map<RowKey, Map<column, Entry>>`, `Entry {value, status, generation, lastSaved?, data, refused?, reason, code}`.
   `reader.value(col, row, id)`: no entry → `col.read(row)`; `saved`/`failed` whose `data !== row` (the row object was
   replaced: a host update, a reload, a server answer) → `col.read(row)` (**lazy**, correct before any cleanup);
   `failed` without `lastSaved` → `col.read(row)`; else `entry.value`. `pending`/`saving` always win (rule 5).
8. `version` (+1) on every change of a shown value made by the controller: stage, rollback. Then one
   `dispatch({type: 'edits.reader', reader, columns}, source)` with the gesture's columns (K.14: nothing moves;
   `orderStale` may flip, step 2). Status-only changes (saving, saved) bump nothing; they emit `editStates`.
9. Cleanup on `kernel.rows.subscribe` (any change): `saved`/`failed` with a replaced or absent row → dropped,
   `editStates`. A row **not held** (`rows.row(key)` undefined): on a client model it was removed (Q8, edit-save 20):
   its unsent `pending` changes leave their gesture (an emptied gesture is dropped, never sent), `saving` stays until
   its answer, then dropped — the answer never shows (rule 21), `saveFailed` still sent. On a source model it is
   only off the page (O9): `pending`/`saving` kept and sent. `pending`/`saving` of a held row refresh `data`.

**Saves (ARCH §3.10 rules 1–6; ports `stageEdits`, `settleSaved`, `settleFailed`)**
10. One gesture = one generation (global counter, never reused, never reset by a rollback) = one `SaveRequest`.
11. Queue: a gesture is sent when none of its cells is `saving` for another gesture; scanned in gesture order after
    each commit and each settle. A cell is in at most one waiting gesture: a newer gesture **supersedes** the
    waiting one's change for that cell (« the last wins »; the older gesture keeps its other cells, an emptied one is
    dropped). Different cells run in parallel.
12. Send: entries `saving`, `editStates`; `save(req, signal)` wrapped in `Promise.resolve().then(...)`, so a sync
    return or throw settles in a microtask like a promise. No `save`: settled `saved` synchronously, no request.
13. Success of g: per cell, `lastSaved = {value, g}` if `g > lastSaved.generation`; if `entry.generation === g` →
    `saved`, `data` = the row held now. A newer staged value stays as is. `editStates`; `flush` waiters resolved when
    nothing is pending or saving.
14. Refusal of g (rejection, sync throw): per cell where `entry.generation === g` → value = `lastSaved.value`, or the
    source when none (never `previous`, never the source rows written: rule 4), status `failed`, `refused` = g's value,
    `reason` = `error.reason` when a non-empty string, `code` = `error.code` when a string (the DOM shows
    `validation.<code>`), else both null (the DOM's `edit.reasonUnknown`; a network failure the same, decision O11).
    Version bump + `edits.reader` if a shown value changed. Cells where a newer gesture took over: no display change.
    Always: one `saveFailed` per cell of g, the host's `error` unchanged, never in a `Problem`. g's undo batch removed
    (edit-save 15, edit-undo 7). Retry: the DOM reads `state().refused` (O2).
15. `destroy()`: aborts each in-flight signal (`abort('destroyed')`), ignores every later settle (no event), returns
    pending + saving changes dropped (the DOM warns; « avertissement » of rule 5 without a new problem code).

**Undo / redo (Q11, edit-undo)**
16. Each staged gesture with origin `edit|paste|fill|bulk` pushes `{g, cells: [{key, column, before, after}]}`
    (`before` = value shown before it) and empties redo; 100 batches, the 101st drops the oldest.
17. `undo()`: top batch; per cell, skipped if the row is not held, the cell not editable, or the shown value is not
    `same()` as `after`; the rest committed as one gesture (origin `undo`, value input → checks run; a refused one
    counts as skipped). The batch moves to redo even if all were skipped. `redo()` the mirror (`before` must be shown,
    origin `redo`). Returns the cells (first = the focus target, O10) and `skipped`; null when empty. Undo of a cell
    still saving queues behind it (rule 11). A refused undo/redo leaves the moved batch where it is (edit-undo 7).
18. `undoChanged` on each flip of `canUndo`/`canRedo`.

**Events** (all by `emit`; sources: `commit`'s / `undo`'s source, `data` for settles and cleanup)
`cellEdited` per staged cell (after `edits.reader`), `editStates` per transition batch, `saveFailed` per refused cell,
`undoChanged` on flips, `problems` for config warnings. No event for unchanged cells or refused inputs (the DOM
announces from `commit`'s result).

## Files
Create `core/src/edit.ts` (entry), `core/src/edit/{input,overlay,saves,undo}.ts`; `packages/core/package.json`
export `./edit`; `size-budget.json` `@dzgrid/core/edit` 3 000 over the core and `scripts/rebudget.mjs` ceiling 3 000
(Q16 grant); conformance `cases/{edit-input,edit-saves,undo}/*.json`, `runner/suites/edit.ts` (scripted save: each
request held until a step `ok n` / `fail n {reason, code}` settles it, in any order), schema entries;
`core/test/{edit-controller,edit-saves-property,edit-walk}.test.ts`. Modify (types only) `columns/defs.ts`,
`kernel.ts`; `index.ts` exports the types; `public-api.test.ts` (an `/edit` list), `types.test.ts`,
`layering.test.ts`, `purity.test.ts` (scans `src/edit/`).

## Tests first (each red before its code)
1. **Conformance `edit-input`** (per type, en/fr/ar): text `''`→null, spaces kept; number `1.5` en ok, `1,5` en
   `parse`, `1,5` fr ok, `١٢٫٥` ar ok; day `31/02/2026` fr `day`, `1/2/26` `day`; instant Paris `2026-03-29 02:30`
   `wall-time-skipped`, `2026-10-25 02:30` `wall-time-ambiguous`, `x` `invalid-instant`, ISO with offset ok in Auckland
   and Los Angeles; enum label → value, unknown → `options`; boolean `oui` fr; value input coerce failure `invalid`;
   order (codec before `required`, `required` before `min`, first wins); `min`/`max` on number and day; `pattern`
   with `/g` twice in a row; `options` function with context, current value not listed accepted; `validate` code,
   empty string, throw → `invalid` + one warning; bad config warnings; `read-only` on a detail and a locked column.
2. **Conformance `edit-saves`**: one gesture one request (`changes`, `previous`, `row`, `origin`, `generation`);
   no `save` → `saved` at once, no request; unchanged → nothing; second edit of a cell waits; third supersedes the
   waiting second (one request with the third); two cells in parallel; generations increase, never reused after a
   rollback; **bug 5** replay (A=1 ok, A=2 fails → shows 1, not the source; A=1 in flight, A=2 waiting, A=1 fails →
   source, then A=2 sent); **bug 2** replay (cells answered in reverse order: each shows its own last value; an old
   answer of a superseded gesture never shows); reason / code / none / non-object / sync throw / void return;
   `refused` kept for retry; host update of a saved row → source shown (lazy), `editStates`; of a saving row →
   overlay kept, then `saved`; server answer drops `saved`, keeps `saving`; page change keeps `pending` and sends it
   (O9); client remove cancels `pending` (no request), a `saving` answer ignored but `saveFailed` sent; reload; edit
   on a sorted column → `orderStale`, displayed order unchanged; rollback → `edits.reader` with the column; source rows
   deep-equal before and after every case; event order and sources.
3. **Conformance `undo`**: undo saves `before` (origin `undo`, one request), redo `after`; new gesture clears redo;
   101 gestures → 100; skip a cell changed by the source / by a later edit / no longer editable / removed row,
   counted; all skipped still moves; undo queued behind an in-flight save; refused gesture leaves no entry; refused
   undo leaves the batch in redo; `undoChanged` only on flips; empty → null; undo never moves a row.
4. **Unit `edit-controller`**: `destroy` aborts (signal `aborted`), late answers silent, count returned; `flush`
   and `dirty`; `setSave` mid-flight; `abort` factory used once per request; `state()` per status; `reader` identity
   stable, version monotone; `check` stages nothing; `−17 B` move: `validate` warning now from `/edit`.
5. **Property `edit-saves-property`** (1 000 seeds, test PRNG, 3 rows × 2 columns, client and source models): random
   commit / settle any in-flight ok|fail / undo / redo / host update / host remove / reload / page change / reapply,
   against an oracle per cell (source, lastSaved, in-flight gesture, waiting gesture). Invariants after each step: shown
   values = oracle (0 stale); ≤ 1 request in flight per cell; requests' generations strictly increase per cell; never
   a value of a gesture older than a later refused or saved one; source rows deep-equal to what the test fed;
   undo ≤ 100; same `(reader.version, store version)` ⇒ same shown values; edits alone never change the displayed
   order (K.14).
6. **Walk `edit-walk`**: the same ops plus sort, filter, quick search on the client model: `orderStale` true iff the
   oracle says an edited column is sorted/filtered/searched since the last full run; `reapply` puts the oracle's order.
7. **Layering / purity / public API / types**: the base imports nothing from `src/edit/`; `/edit` no clock, Date,
   timer, randomness; `public-api` lists `/edit`'s exports; `types.test.ts` (`EditChecks` min typed by `V`,
   `CellInput` union, events).

## Mutants worth running (in a copy)
`generation === g` → `>=` in settle-failed · rollback to `previous` · rollback with no `lastSaved` keeps the value ·
`lastSaved` overwritten by an older generation · generation counter reset on rollback · supersede removed (all
waiting values sent) · send without the « cell saving » test · lazy `data !== row` removed · lazy check applied to
`pending`/`saving` · cleanup keeps `saved` of a removed row · server model treated as removed (pending cancelled) ·
client removed `pending` still sent · `same()` → `===` (Day vs raw ISO, `1` vs `'1'`) · unchanged not dropped · empty
text not null · trim on text values · instant code always `invalid-instant` · UTC re-read skipped · `required` after
`min` · `pattern` with `g` kept · `options` refusing the current value · `validate` throw rethrown · `reason` taken
when not a string · `saveFailed` only for the first cell · undo batch kept after a refusal · redo not cleared by a
new gesture · cap 100 → 99/101 · skip test removed · batch not moved when all skipped · version not bumped on
rollback · `edits.reader` without `columns` (everything stale) · `destroy` not ignoring late answers.

## Sizes (gz, measure; grants Q16)
Base **0** (types), or **−17** with the `validate` move: 28 932 → 28 915, guard rebased. `@dzgrid/core/edit`:
input + checks + instant code ~600, overlay + reader + cleanup ~450, saves (queue, supersede, settle, abort, flush)
~950, undo ~350, events and config warnings ~250 → **~2 400–2 800 / 3 000**. Over 2 900 at the first measure: cut
`flush` (the DOM does not need it) and `check` (a `commit` dry run) before asking. `core/detail`, `/server`, dom,
angular, theme: 0. K.8 profile and the Angular example: 0 (nothing imports `/edit` yet).

## Docs
`STATUS.md`; ROADMAP (step 3, bytes); ARCH §3.10 (the real API: `createEdits`, code-only `validate`, `EditChecks`
replacing `ValidationResult`/params, serial only, events by `emit`) and the Phase 5 index; `conformance/README.md`
(three suites); `edit-save.md` 16 (`error.code` besides `error.reason`), `edit-validation.md` 1 (boolean/custom →
`invalid`; `required` vs spaces), `edit-undo.md` 9 (one controller per kernel); `decisions.md` (S3 answers); this
file's « Done ».

## Risks
Over-marking `orderStale` when a rollback or a host update touches an edited sorted cell (accepted: a reapply is
cheap; the mark is discreet). O(n) `ColumnCache` rebuild per edit on the next sort/filter access (bench at step 5).
Lazy invalidation needs immutable rows (K.4): a host mutating a row object in place keeps a `saved` value until the
next replace (documented). `saveFailed` per cell is heavy for Part B pastes (revisit at step 10). The instant UTC
re-read depends on the codec's grammar (only built-in instant columns get the precise codes; a custom codec gets
`invalid-instant`). No clock in the core: the 0.5 s refusal and 1.5 s saved marks are the DOM's (step 7) — the core
shows the rolled-back value at once.

## Owner decisions
- **S3-O1 Vérifications asynchrones.** **A** seulement synchrones ; une vérification qui demande le serveur passe par
  l'enregistrement (refus du serveur, Q9) ★ ; B `validate` peut rendre une promesse : la cellule attend, le champ
  reste ouvert (« vérification… »), ~+150 B ici, plus le DOM et des textes.
- **S3-O2 Refus partiel du serveur** (une requête de plusieurs cellules, Partie B surtout). **A** tout ou rien :
  la requête entière est refusée ★ ; B l'hôte peut nommer les cellules refusées (`error.cells`), les autres sont
  enregistrées (~+120 B).
- **S3-O3 Où écrire les règles simples** (obligatoire, min, max, format, liste). **A** dans la colonne,
  `edit: { required, min, max, pattern, options }`, 0 B dans la base, le message peut dire « au moins 5 » ★ ;
  B des fonctions `validate: all(required(), min(5))` exportées par `/edit` (le message ne connaît plus le 5).

## Done (2026-10-23, not committed; review and test analysis by the lead next)

**Built.** `@dzgrid/core/edit` (`src/edit.ts`, `src/edit/input.ts`, `src/edit/controller.ts`): `createEdits(kernel,
{ ctx, save?, abort? })` → `reader`, `check`, `commit`, `state`, `dirty`, `undo`, `redo`, `canUndo`, `canRedo`,
`setSave`, `destroy`; pure `parseInput`, `checkValue`. Base: types only (`ColumnDef.edit: EditChecks`, events
`cellEdited` / `saveFailed` / `editStates` / `undoChanged`, `SaveOrigin`) and the `validate` shape check moved out
(−16 B). Owner S3-O1 (sync validators), S3-O2 (`error.cells` names the refused cells; the others saved), S3-O3
(`edit: { required, min, max, pattern, options }`). Wiring: `package.json` export, `build.mjs`, vitest and
`tsconfig.spec.json` aliases, `size-budget.json` entry (3 000 over the core), `rebudget.mjs` ceiling 3 000.

**Tests first (each red before its code, on a stub entry that answered nothing).**
- Conformance (runner made async; `edit-saves` / `undo` compare the keys a case states): `edit-input` 21/21 red;
  `edit-saves` 29/30 red (`unchanged` passed: an absence guard); `undo` 14/15 red (`empty` passed: same);
  `editable/bad-values` red (no base warning for `validate` any more).
- `edit-controller.test.ts`: 10 of 12 red (destroy, dirty/flush, setSave, abort factory, state, reader ×2, check,
  validate move ×2); 2 passed on the stub, absence guards (nothing committed once destroyed; a flush waiting at
  destroy). After the `flush` cut its two tests became two `dirty` tests.
- `edit-saves-property.test.ts` (1 000 seeds × client and source models, oracle `support/edit-oracle.ts`): both red.
  `edit-walk.test.ts` (300 seeds): green on the stub at first (no edit, nothing stale) — strengthened (an edit
  shows at once), then red.
- `layering.test.ts` (edit entry layering and its measure against `size-budget.json`), `rebudget.test.ts`
  (ceiling 3 000): red. Not red first, said plainly: `public-api.test.ts` `/edit` list (the stub already had the
  three exports), `types.test.ts` (the types were written for the stub), the purity rule `edit import` (written
  with its own self-test).
- Mutation analysis (below): 2 unit tests (`the overlay read before the controller hears the rows`, ×2) and 2
  cases (`unchanged-blank`, `removed-row-new-edit`), each failing on its mutant.

**Mutants (in a copy, `rsync` without `node_modules`, symlinked; deleted after).** 61 run: 51 killed at first;
10 survived → 6 killed by the new tests (lazy `data !== row` removed; lazy check on pending/saving; `state()` not
lazy; cleanup keeping a removed row's saved value — the same row object given back showed it again; `same()`
without blank equality; an old answer landing in an entry reborn after its row was removed and given back) and 4
equivalent: `required` after `min` (min is skipped for null, required is only null); `pattern` with `g` kept (a new
RegExp per check — the flag strip removed); the saved row refreshed at settle and the request's row read again (a
live entry already follows every replace of its row — both removed). « `lastSaved` overwritten by an older
generation » has no code to mutate: saves are serial per cell, so the last answer accepted is the newest.

**Sizes (measure).** Core 28 916 (29 000; guard rebased to the measure in `layering.test.ts`). `@dzgrid/core/edit`
**3 045 B gz over the core — 45 over the 3 000 grant: stopped here for the owner** (below). DOM, angular, theme,
other entries: unchanged (nothing imports `/edit` yet).

**Deviations (lead, to confirm).**
1. `flush()` cut for the budget (the plan's first cut; the DOM does not need it). `check` kept (it is `commit`'s
   own check).
2. Overlay, saves and undo in one file (`controller.ts`): they share the controller's state. `input.ts` apart.
3. Without `save`, a gesture is saved at once — but still after a save of the same cell already in flight (a
   `setSave(undefined)` mid-flight): serial per cell always, so `lastSaved` needs no generation compare.
4. S3-O2 shape: a rejection whose error has `cells: [{ key, column, reason?, code? }]`; a resolved value always
   means saved; named cells none of which are in the request refuse the whole request (never a silent pass).
5. `destroy()` counts changes (a cell with one change in flight and one waiting counts 2).
6. Warnings at `columns.<id>.validate` / `columns.<id>.edit.<rule>` (the base said `columns[i].validate`);
   `validate`'s throw told once per column until the columns change (as `editable`'s).
7. Event order — commit: `edits.reader`, `cellEdited`…, `editStates`, `undoChanged`; an answer: `edits.reader`
   (only if a shown value went back), `editStates`, `saveFailed`…, `undoChanged`.
8. Rules read at each check (no cache): a RegExp per check, cheap; no stale cache across `columns.set`.
9. The walk leaves host updates to the step-2 cases (`edit-order` tx-*): its oracle would have to copy S2-O1.
10. A value given to an enum column without `edit.options` is checked against its `enumOptions` (editors 17).

**Gate (2026-10-23, one command at a time).** `typecheck` green. `test:ci` 320 files, 5 154 tests, **1 failed: the
`/edit` budget test** (3 045 > 3 000), all else green (386 s). `test:perm` 6/6 (194 s). `check:size` 1 over
(`@dzgrid/core/edit` 3 045 / 3 000), 66 ok (core 28 916, `/server` 6 068, `core/detail` 999, dom 21 094, angular
6 323). `build` green. The property test runs in ~3 s (1 000 seeds each model): no `test:perm` entry needed. No
browser (no DOM change).

**For the owner (answered: S3-O4, 3 100 granted).** `@dzgrid/core/edit` measured 3 045 / 3 000 after every trim that keeps the plan (one map keyed
by cell, no rules cache, compact undo, no `flush`, dead code found by the mutants removed; from 3 245). Options:
(a) grant 3 050 (or 3 100 for the review's fixes); (b) drop the built-in default abort handle (−24 to −44: the DOM
always passes `() => new AbortController()`; without one the signal would never abort); (c) drop the `edit`
config warnings (−≈100: bad rules silently ignored). The lead recommends (a) at 3 100.

## Review and test analysis (2026-10-23, not committed)

Owner S3-O4: `@dzgrid/core/edit` 3 000 → 3 100 (tests first: the rebudget ceiling and the layering test's budget,
then `rebudget.mjs` and `size-budget.json`).

**Fixes, each with a test that failed on the code before it.**
- R1 `commit` records the gesture (waiting queue, undo batch) before `edits.reader` and `cellEdited`: a listener
  that commits the same cell from `cellEdited` came first, so the server kept the old value while the cell showed
  the new one as saved, and undo ran in the wrong order. Unit test (red: the server's last value was 5, not 6);
  the property test gained the re-entrant listener (15 % of commits; the oracle's `commit(…, during)`), red on
  the old code (seed 14, source model: requests in the wrong order).
- R2 an `options` function that throws refuses `invalid` and is told once (`columns.<id>.edit.options`, detail
  `threw`, source `data`); it threw out of `commit` before. Unit test.
- R3 a RegExp pattern drops `m` too (`g`, `y`, `m`), keeps `i`, `u`, `s`: `/[a-z]+/m` refuses "a\nBAD!!",
  `/[a-z]{3}/i` accepts "ABC", `/a.b/s` accepts "a\nb". Unit test (red on the first).
- R4 `destroy()` empties both stacks and tells the rows the edits are gone (a new reader version, `edits.reader`
  with the columns that had entries, source `api`); the source shows, `state` is undefined. Unit test.
- R5 `error.cells[].key` takes the host's own row id as well as the RowKey (compared through `dataKey`); sheet
  edit-save 5b. Unit test; the property test names cells either way at random (red on the old code, seed 3).
- Budget: with the fixes the entry measured 3 122. The built-in default abort handle is gone (option (b) of the
  first report): without `abort`, `save` gets a frozen signal that never aborts, and `destroy` only ignores the
  answer (the DOM always passes `() => new AbortController()`). Test first (red: the default aborted). Now
  **3 098 / 3 100**: 2 B of margin, every further byte needs a cut or a grant.
- Docs: edit-validation (`pattern` flags; a pattern is developer config, a backtracking regex the app's
  responsibility, the DOM caps the length; a throwing `options`), edit-save 5b (plain ids).

**Test gaps closed** (they pass on the code — guards, not fixes): a named cell's code wins over the error's; an
empty cell reason falls back to the error's; a pattern checks strings only; the locale is read at each check
(en-US → fr-FR, "1,5"); a lone RLM in an ar-EG number cell is `parse`, not empty; after destroy no `problems` on a
`columns.set`; `problems` and `saveFailed` carry source `data` (the runner now logs `saveFailed`'s and
`problems`' source; 9 cases updated); the creation reader is sent with source `api`; the cell key keeps the row
id apart from the column (rows a / ab, columns bv / v). The oracle now has a text column (spaces kept, empty →
null), refusals with and without reason or code (checked against `state()`), and cells named by plain id.

**Mutants on the fixes (copy, deleted after):** 9 run, all killed (R1 events before recording — by the property
test; R2 the `options` call outside the try, R2 the rule's name; R3 `m` kept, `i` dropped; R4 stacks kept, no
reader after destroy; R5 plain id refused; the never-abort signal mutated by destroy). A first R2 mutant was a
no-op (still inside the try) and was rewritten.

**Gate (2026-10-23):** typecheck green; `test:ci` 320 files, 5 168 / 5 168; `test:perm` 6/6; `check:size` 0 over
(core 28 916 / 29 000, `@dzgrid/core/edit` 3 098 / 3 100); build green.
