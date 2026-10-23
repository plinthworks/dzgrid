# Phase 5, step 4 — the DOM seams of editing: blueprint (architect, 2026-10-23)

Sources: `phase-5-plan.md` step 4 (and the display half of step 7), D3, D4, D6, D7, D8, D9, D15; `decisions.md`
Q6, Q7, Q9 (Mixte), Q10 amended, Q16, O1–O11, S3-O1…O4, T7 (they win); sheets `editing.md` 3, 17, 18, 23, 26,
`edit-save.md` 6–16, `edit-validation.md` 2, 2b, `edit-reapply.md` 3–8, 10, `cell-class.md`, `parts.md`,
`theming.md` (reserved colours), `virtual-scroll.md` (`rowHeight`), `motion.md`; `step03-plan.md` (the
`@dzgrid/core/edit` API); ARCH retained-row contract 5–6, K.14. Clean room: our code only. Tests first.

## Findings (code at the step-3 head; dom 21 094 / 21 300, grant 21 980 = Q16 21 800 + T7 180)
- **The paint reads `col.read(row)`** (`render/rows.ts` `cellValue`), never `kernel.reader`; `edits.reader` is a
  command that emits **no** event, so nothing repaints after an edit, and a row whose data object did not change
  is skipped by `#bind`'s `same` test (`key`, `data`, `epoch`, `focusCol`, `plan`): a new value would not show
  even after a paint. The CSV and the model already read `reader.overlay ? reader.value(col, row, idOfDataKey(key)) : col.read(row)`.
- `/edit` emits `cellEdited`, `editStates {cells}`, `saveFailed`, `undoChanged` through `emit`; the core's
  `orderStale {stale}` too. `grid.ts` schedules a paint only on `modelUpdated|focusChanged|selectionChanged|
  columnResized|columnsChanged`.
- **No per-row « passes now »**: `RowModel.matches(key)` reads the filter mask of the last run (step-2 risk:
  « step 7's muted rows need passes now through the reader »). `@dzgrid/core/internal` exports `compileFilter`,
  `compileQuick`, `storeOf`, `ColumnCache` (external to every dom entry: 0 B there).
- `grid.ts:71` hard-codes `aria-readonly="true"`; `kernel.editable(key, column)` exists (data row, rule
  `=== true`, not locked, a throw → false + one warning).
- **Tooltip and descriptions collide**: `render/tooltip.ts` sets and *clears* the whole `aria-describedby` of
  its anchor cell; a saving/failed description on the same cell would be wiped.
- Features already have the hooks a display needs: `afterRows(frame)` (each paint, rows placed),
  `decorateHeader(col, cell, label)` (returns the header's name), `keys(e, at, owner)` (before the grid's
  meaning). `rowRenderer.mounted` exposes `RowView`/`CellView`. A tree's pinned parents use a
  `rowRenderer.spawn(layer)` renderer of their own.
- Keys: on a header, Enter is `sort`; F2 has no grid meaning there; with `slots()` a header part takes F2/Enter
  first (`internal/keys.ts cellKeys`, listener on `el.header`, stops propagation when the part took the focus).
  A click on any control in a header never sorts (`header-click.ts`).
- Motion: `onCell(el, c, 'changed')`; `'saving'|'saved'|'failed'` reserved (`motion-gsap/index.ts`, MotionOptions).
- Theme: `--dzg-saving-color` / `--dzg-refused-color` exist only as contrast-pair defaults (accent, danger), 6
  pairs already checked; no rule draws them. Pseudo-elements free on `.dzg-cell`; shapes are drawn with
  `clip-path` on `::before/::after` (the funnel). `data-stale` (loading) on the root is taken: rows use
  `data-dzg-stale`. Theme base ≈ 2 4xx / 2 500 (measure first), ceiling 3 050 (T7); the K.8 profile loads it.
- `size-budget.json` has no `-edit` locale lines and no `/edit`, `/editors` dom entries.

## Split (lead pick; S4-O1 confirms)
| Where | What | Bytes (gz) |
|---|---|---|
| **dom base** | overlay read in the paint, per-row touch, computed `aria-readonly`, editor host (rules 5–6), `FeatureHandle.edit` seam, tooltip `aria-describedby` by token, editor layout CSS | **+380–480** → ~21 530 / 21 980 |
| **`@dzgrid/dom/edit`** (new) | `edit()` feature: `createEdits` wiring, marks and their clocks (saved 1.5 s, refusal 0.5 s, blink limiter, saving 5 s), descriptions, muted rows, header reapply mark, announcements, API | **~1 900–2 300** |
| **theme** | marks, running border, refusal blink, muted row, reapply button, forced colours (S4-O2: base or `edit.css`) | **~450–600** |
| **`locales/{en,fr,ar}-edit`** | the step's keys (below) | ~220 / 260 / 320 of 350 / 400 / 450 |
| `/editors` (step 5) | fields, start/end keys, local refusal bubble — **not this step** | 0 |
| motion | 0 (step 7 hears `editStates` and reads `api.state()`) | 0 |

The marks live in the entry, written in `afterRows` on the mounted cells (pooled cells cleaned there), not in the
base: an app without editing pays only the seams. The plan's « state classes written by the base » becomes
« written at each paint by the entry, from the controller's states »; same guarantee for pooled/scrolled cells.

## Base API (`@dzgrid/dom`, types exported; runtime only where said)
```ts
// features.ts
export interface EditSeam {
  /** The value a cell shows (the overlay, or a refused value held for its 0.5 s). Absent: `col.read`. */
  read(col: ResolvedColumn<unknown>, row: unknown, key: RowKey): unknown;
}
interface FeatureHandle { readonly edit?: EditSeam }        // first feature giving one wins

// render/rows.ts
export function cellValue<T>(col, row, ctx, read?: ((c, r) => unknown) | null): { value; text };  // read null → col.read (NO_OVERLAY path unchanged)
interface Frame<T> {
  readonly read: EditSeam['read'] | null;                    // g.features' edit seam, else null
  readonly readonly: ((key: RowKey, column: string) => boolean) | null;   // null: no editable column
  readonly active: { readonly key: RowKey; readonly column: string } | null;  // rule 5
}
class RowRenderer<T> { touch(keys: Iterable<RowKey>): void }  // those rows rebind at the next paint, spawned renderers too

// context.ts (GridContext)
editor: { readonly key: RowKey; readonly column: string; readonly cell: HTMLElement; readonly field: HTMLElement } | null;
/** Puts `field` (marked data-dzg-owner="editor") in the mounted cell; false when the cell is not mounted. */
openEditor(key: RowKey, column: string, field: HTMLElement, lost: () => void): boolean;
/** Rule 6: the cell focused first (preventScroll), then the field removed; the row touched. */
closeEditor(): void;
```
Behaviour of the base:
1. `#fillCell` takes `f.read`: with a seam, `raw = read(col, row, key)` inside the existing try; without,
   byte-for-byte today's path. Parts get the overlay value and text (their context compares `value`/`text`:
   an edit updates the part once).
2. `touch(keys)` sets the views' `epoch = -1` (mounted only; unmounted rows bind fresh anyway) and forwards to
   every `spawn`ed renderer (a pinned parent shows the edited value too). One `g.schedule()` by the caller.
3. `aria-readonly`: per paint, `any = visible.some(c => c.def.editable)` (truthy; a locked one still counts —
   its cells say read-only). `any` false: viewport `aria-readonly="true"`, cells nothing (today). `any` true:
   viewport none; each `gridcell`/`rowheader` that `kernel.editable(key, col)` refuses gets `"true"`, the others
   none; a filler's, a loading row's, a detail's `dzg-dcell` and the box cell `dzg-check` get `"true"`. Asked at
   bind only (rows, columns, language, context: all rebind already; a context change bumps the epoch).
4. **Rule 5**: in `#fillCell`, the cell equal to `f.active` keeps its text, part, rule classes and `aria-*` value
   attributes (geometry and `aria-colindex` still written); the rest of its row binds as usual. The active row is
   the focused row (retained, never moved, S10). An active part-drawn cell: the part is not updated.
5. **Rule 6**: `closeEditor()` → `cell.focus({preventScroll:true})`, then `field.remove()`, `data-dzg-editing`
   removed, `editor = null`, `touch([key])`, schedule. The focus is never on `body`.
6. **Lost**: at a paint, an editor whose cell is no longer mounted (row gone from the displayed rows, column
   hidden, a new `getRowId`) → `lost()` once (the owner decides kept/dropped: step 5/7, D8), then rule 6 on the
   nearest focus target (`restoreFocus`). `destroy` calls `lost()` too.
7. `openEditor`: `cell.setAttribute('data-dzg-editing','')`, `cell.append(field)`; layout CSS
   `.dzg-cell[data-dzg-editing]{position:relative}` and its `[data-dzg-owner=editor]` child `position:absolute;
   inset:0` (`LAYOUT_CSS`, layered). The text under it stays (no reflow).
8. **Tooltip**: adds/removes its own id in the anchor's `aria-describedby` token list (never clears others).
9. `grid.ts`: `viewport` no longer gets the fixed attribute (the paint writes it); the subscription also
   schedules on `orderStale` (cheap; the entry schedules for its own events).

## Entry API (`@dzgrid/dom/edit`)
```ts
export function edit<T = unknown>(o?: EditFeatureOptions<T>): EditFeature<T>;
export interface EditFeatureOptions<T> {
  readonly save?: SaveHandler<T>;            // from @dzgrid/core/edit; absent: saved locally at once
  readonly savingBorder?: boolean;           // default true (Q10 amended); false: a still border
}
export interface EditFeature<T> extends GridFeature {
  /** The grid's edit API (one controller per grid's kernel); null before setup / after destroy. */
  api(grid: { readonly kernel: GridKernel<T, any> }): EditApi<T> | null;
}
export interface EditApi<T> {
  commit: EditController<T>['commit']; undo(): UndoResult | null; redo(): UndoResult | null;
  readonly canUndo: boolean; readonly canRedo: boolean; state: EditController<T>['state'];
  reapply(): void;                           // rows.reapply as 'api' (not announced)
  setSave(save?: SaveHandler<T>): void;
  /** Step 5's local refusal and O1 use it: the 0.5 s refusal on a cell (limiter applied). */
  refuse(key: RowKey, column: string): void;
}
export type { EditMessageKey, EditMessages } from '../part-texts.js';
```
Setup: `createEdits(g.kernel, { ctx: () => g.ctx, save, abort: () => new win.AbortController() })` (DOM passes
the abort factory; S3's frozen-signal default never used); `destroy` with the grid (`api` null after). One
feature object may serve several grids (a `WeakMap` by kernel, like `motion()`).

**Marks** (one `Map<cellKey, Mark>` beside the controller's states; clocks are the DOM's, the core has none):
| State | Class(es) on `.dzg-cell` | Description (`aria-describedby`) | Ends |
|---|---|---|---|
| pending | `dzg-cell--pending` | — | → saving |
| saving | `dzg-cell--saving` (+ `dzg-cell--still` after 5 s from the send, or at once with `savingBorder:false`) | `edit.saving` | at once on the answer |
| saved | `dzg-cell--saved` | — | 1.5 s (timer), or any new state |
| refused | `dzg-cell--refused` + `dzg-cell--blink-a`/`-b` (alternating restarts the CSS animation without a reflow) or no blink class (still red) | — | 0.5 s, then failed |
| failed | `dzg-cell--failed` | `edit.failedMark {reason}` | while `state().status==='failed'` |
- Server refusal (Q9): during the 0.5 s, `seam.read` returns the **refused** value for that cell (the core rolled
  back already, step-3 risk); then `touch` and the last saved value shows. Undo/commit on the cell during the
  hold ends it at once.
- **Limiter (2b)**: a new refusal on a cell restarts its 0.5 s (one animation, never two); it blinks only if the
  last blinks started ≥ 1 s ago, else still red: ≤ 3 flashes in any second (keyframes: 2 on/off pairs in 0.5 s).
- One timer per grid (the next expiry), cleared on destroy. Each expiry: `touch` the rows, schedule.
- `afterRows(frame)`: for each mounted data cell, the wanted tokens vs a `WeakMap<HTMLElement, {key,col,tokens,
  desc}>` memo → `swapClasses`-style diff (only `dzg-cell--*` tokens it set; `cellClass` ignores `dzg-` names
  already), `aria-describedby` by token. Skipped entirely while no mark exists and none is drawn. A pooled cell
  showing another row loses its marks at that paint. Pinned-parent copies: values yes, marks no (lead).
- Descriptions: hidden `<div class="dzg-desc" hidden>` in the root, one `<span id>` per distinct text (ids from
  the grid's id scheme, as the tooltip's), rebuilt on a new language or messages.
- Reason text (edit-save 16): `reason` (host string) › `validation.<code>` (`{min}`/`{max}` from the column's
  `edit` rule, formatted by its codec) › `edit.reasonUnknown`.

**Muted rows (edit-reapply 3; S4-O3)**: while `kernel.orderStale`, for the rows the overlay holds (only they can
newly fail), once per reader version: `compileFilter(query.filter, env)` + `compileQuick` over
`storeOf(rows).snapshot` with `env.reader = kernel.reader` → a failing row gets `data-dzg-stale` and its row
header `edit.rowStale` (token). A row only out of sort order: not muted. Cleared when `orderStale` goes false.
Selection, focus, editing unaffected. Not on server pages (S4-O3 A).

**Header reapply mark (Q7, edit-reapply 4–8)**: `decorateHeader`: while `orderStale`, on every column with an
active sort or filter (quick search only: the edited columns), a `<button class="dzg-reapply" tabindex="-1"
aria-label=edit.reapply>` appended after the sort and filter marks (24 × 24 target); the header's name becomes
`header.withStale {name}` around the label so far. Keys (`keys(e, at, owner)`): owner `header`, **F2** with a
mark → the mark focused (`tabindex 0` while inside); **Enter on the header is not taken** (it sorts, and a sort
reapplies, 7); on the mark Enter/Space press it (native button), Escape → the header cell. Click or press:
`rows.reapply` as `user`, focus back on the header cell, `edit.reapplied {n}` (polite). With a `slots()` header
part, F2 goes to the part first (its listener runs earlier); the mark is then reached by Tab from the part
(documented; S4 risk).

**Announcements** (live region): `edit.saving` once per gesture (the commit's generation, polite, only when a
`save` exists); `edit.saveRefused {column, reason}` per refused gesture (assertive; several cells: the first
column, then `edit.refusedCount` waits for Part B); `edit.stale` on `orderStale` false→true (polite, after the
save sentence); `edit.reapplied` on a user reapply. The border, `saved`, a reapply by the app: never.

## Texts (`locales/{en,fr,ar}-edit`, this step's keys; step 5 adds the editor's)
`edit.saving`, `edit.saveRefused`, `edit.reasonUnknown`, `edit.failedMark`, `edit.stale`, `edit.rowStale`,
`edit.reapply`, `edit.reapplied` (plural; ar six forms), `header.withStale`, and the `validation.*` set
(`parse`, `day`, `invalid-instant`, `wall-time-skipped`, `wall-time-ambiguous`, `required`, `min`, `max`,
`pattern`, `options`, `invalid`) — a server `code` needs them now. Wording: the sheets' tables. `EditMessageKey` /
`EditMessages` in `part-texts.ts`; `g.msg`'s key union widened (types only). A bundle without them: as the
tree's and detail's bundles do (same rule, same test pattern).

## Theme (CSS, `@layer dzgrid.theme`; S4-O2)
- Marks at the inline end, one `::after` rule shared by pending (dot), saved (check), failed (a « ! » in a
  circle) — `clip-path` shapes in `currentColor`/`--dzg-saving-color`/`--tz-danger`; the text keeps its room
  (`padding-inline-end`).
- **Running border**: `::before` ring (`inset:0`, border-box mask leaving a 2 px frame), `conic-gradient` from
  `--dzg-saving-color`, `@property --dzg-turn <angle>`, `animation: dzg-turn 1.2s linear 4` (4.8 s ≤ 5 s),
  `animation-direction: reverse` under `[dir=rtl]`. Still: a 2 px dashed `--dzg-saving-color` border — under
  `prefers-reduced-motion: reduce`, `.dzg[data-motion=off]`, `.dzg-cell--still`, and once the 4 turns end
  (`dzg-hold` with `4.8s` delay, `forwards`). Without `@property` support: a static arc, then the hold.
- **Refusal**: `dzg-cell--refused` = 2 px `--dzg-refused-color` outline; `--blink-a`/`--blink-b` two keyframe
  copies (2 on/off pairs in 500 ms, `steps`); reduced motion / motion off: no animation, still red.
- **Muted row**: `.dzg-row[data-dzg-stale]` = the context-row colour rule (`--dzg-context-fg`), its row header
  `::before` a hollow funnel (the `.dzg-fbtn` shape, outlined) — a shape, not colour alone.
- **Reapply button**: 24 × 24, circular-arrows shape, focus ring as header controls.
- **Forced colours**: ring → dashed `Highlight` border (`forced-color-adjust` kept auto; no gradient relied on),
  refused → `Mark` outline, marks → `CanvasText`, stale sign → `CanvasText`.
- Contrast pairs (`contrast-pairs.json`): pending dot, saved check, failed sign, stale sign, reapply button vs
  cell / hovered / selected row backgrounds, ≥ 3:1, in base, Midnight and Clinic, light and dark.

## Files
Base: `render/rows.ts`, `render/viewport.ts`, `render/tooltip.ts`, `grid.ts`, `context.ts`, `features.ts`,
`styles.ts`, `messages.ts`/`part-texts.ts` (types), `index.ts` (types). New: `src/edit.ts` (entry),
`src/edit/{marks,stale,reapply,texts}.ts`, `src/locales/{en,fr,ar}-edit.ts`; `package.json` exports
`./edit` and `./locales/*-edit`; `build.mjs`, vitest/tsconfig aliases. Theme: `dzgrid.scss` (or `edit.scss` →
`edit.css`, S4-O2), `contrast-pairs.json`, `build-theme.mjs` if split. `size-budget.json` / `rebudget.mjs`:
dom 21 300 → measure (≤ 21 980 granted), `@dzgrid/dom/edit` (S4-O1), three `-edit` lines 350/400/450, theme per
S4-O2 — by the lead after the owner's answers, tests first (`rebudget.test.ts`, layering).

## Tests first (jsdom; each red before its code)
1. **`edit-seams.test.ts`** (base, a test feature giving `edit.read` and calling `openEditor`):
   - no seam: the mounted DOM of a 200 × 8 grid (sort, filter, scroll, parts, cellClass, RTL) is identical to
     the same run before the change (serialised snapshot taken red-first on the old code); `col.read` is the only
     reader called; the existing suites untouched and green;
   - a seam: the read value shows after `touch([key])`; the cellClass rule and part `update` run for that row
     only (spies: **0 calls on other rows**); without `touch`, nothing changes (the `same` test kept);
   - `touch` reaches a tree's pinned-parent copy;
   - `aria-readonly`: no editable column → viewport `true`, no cell attr; `editable: true` on one column → viewport
     none, other columns' cells `true`, editable cells none; `editable(row, ctx)` per row; detail, filler,
     loading and box cells `true`; a rule that throws → `true` + one warning; recomputed after `context` update,
     a column hidden, a row's data changed;
   - rule 5: editor open, a host `update` of the row changes its other cells, not the edited cell's text,
     part (no `update`) or rule classes; scroll 10 000 rows away and back: the field and its text are there,
     same element; rule 6: at `field.remove()` time `activeElement === cell` (spied), never `body`;
   - lost: row removed by a transaction / column hidden → `lost` once, focus on a cell; destroy → `lost`;
   - tooltip shown/hidden on a cell keeps another `aria-describedby` token.
2. **`edit-marks.test.ts`** (entry, fake timers, a held `save`): pending → saving (`edit.saving` description,
   polite sentence once per gesture, none without `save`) → saved (class 1.5 s, then none) ; refusal: refused
   value shown 500 ms with `--refused` + `--blink-a`, then last saved value + `--failed` + reason (host reason,
   `code` → `validation.min` with « au moins 5 », none → `edit.reasonUnknown`), assertive sentence; failed stays
   until saved again / undone / the source changes; a pooled cell showing another row carries no mark, back on
   its row it has it; `savingBorder:false` → `--still` from the start; 5 s of saving → `--still`; limiter:
   refusals at 0, 0.3, 0.9, 1.0, 1.05 s → blink at 0 and 1.0 only, classes alternate a/b, one animation at a
   time, a flash count from the class timeline × keyframes ≤ 3 per second; destroy: timers cleared, controller
   destroyed (signal aborted), `.dzg-desc` gone, no `dzg-cell--` left; two nested grids independent.
3. **`edit-stale.test.ts`**: an edit making a filtered row fail → `data-dzg-stale` + row-header `edit.rowStale`;
   out of sort order only → not muted; quick search; reapply clears; selection kept; server pages → never muted
   (S4-O3 A); mark on every sorted/filtered header (quick only: edited column), header name `header.withStale`;
   Enter on the header sorts (and clears); F2 → the mark; Enter / Space / click on it → `rows.reapply` source
   `user`, focus on the header cell, `edit.reapplied` with the count (ar plural forms); Escape → header cell;
   click never sorts; `edit.stale` once per false→true; app `api.reapply()` silent; a `slots()` header part keeps
   F2 (test pins the documented order).
4. **`edit-walk.test.ts`** (300 seeds; client and source models): random commit / settle ok|fail / undo / sort /
   filter / scroll / host update / timers → each mounted cell's tokens and text equal an oracle from
   `api.state()` + the hold/limiter model: **0 stale mark, 0 stale value**.
5. **Theme `edit-marks.test.ts`** (node, parsed CSS): every class has its rule; the ring animates only
   `--dzg-turn` (no layout property); total running ≤ 5 s; `reduce`, `data-motion=off`, `--still` → no
   animation; `[dir=rtl]` reversed; refusal keyframes = 2 flashes in 500 ms; forced-colours rules present;
   reserved colours used with their fallbacks; layer order unchanged (`layer.test.ts`).
6. Locales (keys, plurals, `checkMessages`), guards (`guards.test.ts`: no colour, no physical side, no text in
   `src/edit*`), layering (base never imports `/edit`, `@dzgrid/core/edit` only from `src/edit*`), public API
   lists, size lines.

## Mutants worth running (copy, deleted after)
read seam dropped in `cellValue` · `touch` marks every row · `touch` skips spawned renderers · `same` ignores the
touched epoch · viewport `aria-readonly` kept · cell readonly inverted for rule functions · detail cell not
marked · rule-5 skip removed · rule-6 order swapped · `lost` called twice / never · tooltip clears the whole
attribute · saved timer never ends · refused hold removed (rollback shown at once) · limiter 1 s → 0 · a/b
alternation removed · `savingBorder` ignored · 5 s still removed · marks not cleared on a pooled cell · saving
sentence per cell · stale mutes sort-only rows · mark on unsorted headers · Enter on header reapplies · reapply
focus not returned · `edit.stale` on every flip · destroy leaves timers.

## Browser (`npm run test:browser -- --only edit-marks`, Chrome; one browser at a time, closed after)
Playground page `edit-marks.html` (stock-like 200 rows, a `save` the test holds/resolves). fr light Clinic, ar RTL
dark Midnight, base light/dark:
- axe 0 with each mark shown (pending, saving, saved, refused, failed, muted row, reapply mark focused);
- forced colours (CDP `Emulation.setEmulatedMedia` `forced-colors: active`): ring dashed `Highlight`, marks and
  sign visible (computed styles), not colour only;
- RTL: ring `animation-direction: reverse`, marks at the inline end (left), mark button at the header's end;
- reduced motion (`prefers-reduced-motion: reduce`) and `data-motion="off"`: `getAnimations()` empty on rings
  and refusals, still borders drawn;
- blink rate: 10 refusals in 2 s on one cell → `getAnimations()` timeline sampled every 16 ms: ≤ 3 flashes in any
  1 s window, never two animations at once;
- saving border still after 5 s: a held save, `document.timeline` at 5.1 s → no running animation, dashed border;
- 50 saving cells while scrolling: no layout read (`getBoundingClientRect`/`offset*` spies at 0 in `afterRows`),
  no long task;
- reapply button ≥ 24 × 24; contrast: `npm run check:contrast` with the new pairs (base, Midnight, Clinic, light
  and dark), 0 under minimum.
Firefox and WebKit for the ring (`@property`, mask) at step 7 as D9 says; noted, not run here.

## Sizes (gz, measure; grants)
Base: read branch ~45, `touch` ~40, `aria-readonly` ~90, editor host + rules 5–6 + lost ~170, tooltip token
~35, seam lookup ~20, layout CSS ~35 → **+380–480** (21 094 → ~21 530 / 21 980). Entry `@dzgrid/dom/edit`
(external: core, core/internal, core/edit, dom/internal): wiring ~350, marks + clocks + hold ~550, `afterRows`
painter + descriptions ~350, muted rows ~250, reapply mark + keys ~350, announcements + API ~250 → **~1 900–2 300**.
Theme ~450–600. Locales en/fr/ar ~220/260/320. K.8 profile: base growth only (+~450 JS; theme per S4-O2). Real
Angular example: +~450 (≤ 90 000). Time: one commit → its cell repainted ≤ 4 ms, one frame, 0 calls on other
rows; `afterRows` with marks ≤ 0.2 ms for 400 mounted cells; muted check ≤ 4 ms at 100 000 rows (bench line;
over it → ask for a core `passes(key)` seam, ~50 B in the base core).

## Docs
`STATUS.md`; ROADMAP (step 4, bytes); ARCH « contrat de la ligne retenue » 5–6 as built, the Phase 5 index;
`editing.md` 3 (box and detail cells read-only), 17–18; `edit-save.md` 6–13 (marks written by `/dom/edit` at
each paint, the hold of the refused value, 5 s by class); `edit-reapply.md` 3–5 (F2 vs a header part);
`cell-class.md` (`dzg-cell--*` belong to `/edit`); `motion.md` (reasons still reserved, step 7);
`theming.md` (new classes, `edit.css` if S4-O2 B); `parts.md` (an edited part-drawn cell is not updated);
`decisions.md` (S4 answers); this file's « Done ».

## Risks
- **Two sources of truth for one cell** during the 0.5 s hold (core rolled back, DOM shows the refused value):
  undo/commit during the hold, a source change, a pooled cell — the walk test's oracle models it.
- `aria-describedby` shared by tooltip, marks and row description: one token helper used by all three.
- Muted rows cost an O(n) column cache per reader version on big grids (bench; fallback a core seam).
- CSS animation restarts without a reflow rely on the a/b names; Safari < 16.4 lacks `@property` (static arc).
- A `slots()` header part takes F2 before the mark; Tab inside reaches it (documented, tested).
- dom margin after the step ~450 B for steps 5–8 base needs (each step must stay in its entry).
- Theme: in the base, editing (marks now, field and bubble at step 5) likely passes 3 050 → S4-O2.
- Step-3 margin is 2 B: this step must not need a byte of `@dzgrid/core/edit`.
- Step 7 keeps: D8 (row hidden/removed while editing), `onSource` on server answers in paints, motion reasons and
  the saved flash, the failed reason's hover tooltip, the 1 000-permutation paint test, Firefox/WebKit ring.

## Owner questions
- **S4-O1 Où mettre le code qui relie l'édition à la grille** (marques, minuteries, marque d'en-tête, API) ?
  **A** une nouvelle entrée `@dzgrid/dom/edit` (~2 300 o), prise sur les 8 000 accordés à `/editors` (il en reste
  5 700) ; `/editors` (étape 5) et la partie B (copier-coller) la réutilisent ★ ; **B** tout dans `/editors` :
  l'étape 4 écrit un module interne, sans entrée publique, la partie B devra l'importer depuis `/editors` ;
  **C** dans la base dom : +2 kB pour toutes les grilles, même sans édition.
- **S4-O2 Où mettre le style des marques** (point, coche, signe d'erreur, bord qui tourne, clignotement, ligne
  grisée) ? **A** un fichier à part `@dzgrid/theme/edit.css` (~600 o, ~900 avec le champ de l'étape 5), chargé
  par les applications qui éditent ; le thème de base et l'écran d'audit ne grossissent pas ★ ; **B** dans le
  thème de base (2 4xx → ~3 000 maintenant, au-delà de 3 050 à l'étape 5 : nouvelle demande).
- **S4-O3 Grille paginée par le serveur : une ligne modifiée qui ne passe plus le filtre** ? **A** pas de
  grisé (seul le serveur sait filtrer) ; la marque d'en-tête suffit ★ ; **B** grisé calculé dans le navigateur
  sur la page affichée (faux si le filtre du serveur diffère).

## Done (2026-10-23, not committed)

**Built.** Base: `FeatureHandle.edit` (`EditSeam.read`) read by `cellValue` / `#fillCell`; `Frame.read`, `Frame.ro`
(named `ro`, not `readonly`, for bytes), `Frame.active`; `RowRenderer.touch(keys)` (+ `rev`, forwarded to spawned
renderers; the tree's pinned stack redraws on `stack.rev`); per-cell `aria-readonly` (the grid keeps it while no
visible column is editable; detail, filler, loading and box cells say it otherwise); editor host on the context
(`openEditor`, `closeEditor`, `editor`, `lost` at a paint where the cell left, and at destroy); layout CSS for the
field; tooltip `aria-describedby` by token (`describe` in `render/write.ts`); repaint on `orderStale`. The
viewport's initial `aria-readonly` stays in `grid.ts` (attribute order: the no-seam DOM is byte-identical).
Entry `@dzgrid/dom/edit` (`edit.ts`, `edit/{index,marks,stale}.ts`): as the blueprint, with a texts list in
`index.ts` (no `texts.ts`) and the reapply mark inside `stale.ts`. `locales/{en,fr,ar}-edit`. Theme: `edit.scss` →
`edit.css` / `edit.unlayered.css` (S4-O2), `--dzg-saved-color` (new, `--tz-success`), 10 contrast pairs (630 / 0).

**Tests that failed first.**
- `edit-seams.test.ts` (19): run on the old code, 17 red for the right reasons (`touch` / `openEditor` missing,
  `aria-readonly` still on the grid, tooltip clearing the other token); 2 green by design: the no-seam snapshot
  (taken then, `fixtures/edit-seams-no-seam.html`, the DOM byte-identical after) and « no editable column ».
- `edit-marks.test.ts` (14) and `edit-stale.test.ts` (13): run against a skeleton entry (controller and API
  wired, values read through the overlay, no marks, no muting, no header mark): 11 / 14 and 11 / 13 red by
  assertion; green on the skeleton: setup's bundle check, two grids, destroy (wiring), « sort only not muted »
  and « Enter on the header sorts » (absences).
- Theme `edit.test.ts` (12): all red (no `edit.css`). `rebudget.test.ts` +1: red (no ceilings).
- After the mutants, 2 tests red on their mutants first (« focus not returned », « row header description
  kept »).
- Written after the code (guards, not red first): `edit-walk.test.ts` (300 seeds client, 100 server; shown to
  catch a 1.4 s saved timer), `edit-texts.test.ts`, the structure and release tests.

**Mutants** (copy of the repo, deleted after): 37 run, 33 killed at first; 4 survivors: 2 equivalent, the code
simplified (`still: !border` redundant with the paint's `!border` → `still: false`; « stale on every flip »: the
event only comes on a flip → `was` removed), 2 killed by the 2 new tests above.

**Browser** `--only edit-marks` (Chrome): 35 / 35 — axe 0 with every mark shown and the reapply mark focused in fr
light Clinic, ar RTL dark Midnight, base light and dark; marks' contrast ≥ 3:1 on their rows; forced colours;
RTL ring reversed and signs at the inline end; reduced motion and motion off; blink rate (10 refusals in 2 s: 2
blinks ≥ 1 s apart, worst 2 flashes per second); border still after 5 s; 50 saving cells while scrolling, 0
layout read in the marks' paint, 0 long task; mark ≥ 24 × 24.

**Sizes** (gz): dom **21 656** (budget 21 300 → **21 700**, grant 21 980; +562 over 21 094, above the blueprint's
380–480); `@dzgrid/dom/edit` **3 311** (ceiling 3 650; `/editors` ceiling 8 000 − 3 650 = **4 350**, not 5 700);
`edit.css` **1 231** (entry recorded, no ceiling: the owner's); theme base 2 427 (2 500); core 28 916; `core/edit`
3 098 (untouched); K.8 82 435 (83 500). **Texts over their grants: en 505 / 350, fr 570 / 400, ar 737 / 450**
(the 11 `validation.*` texts carry most of it) — stopped for the owner, the budgets left at 350 / 400 / 450.

**Deviations.** One timer per cell (scope timeouts, cleared with the grid) instead of one per grid; the save and
stale sentences joined in one polite announcement when they fall in the same task; refusals said in an assertive
region of the entry's own (`.dzg-live[aria-live=assertive]`); `{pattern}` of `validation.day` not filled (step 5);
pinned-parent copies show values, not marks; the edited cell's copy in the pinned stack keeps its text while an
editor is open.

**Gate** (once, one command at a time): `test:ci` 326 files, 5 237 tests: 3 red, the dom budget pins (21 300) in
`motion-seam`, `parts-guards`, `rules` tests, moved to 21 700 and rerun green; `test:perm` 6 / 6; `typecheck`
green; `build` green; `check:size`: 0 over but the three `-edit` texts (see Sizes; dom 21 656 / 21 700,
`dom/edit` 3 306 / 3 650 after the mutant fixes, `edit.css` 1 231 recorded, angular 6 323, K.8 82 435);
`check:contrast` 630 pairs, 0 under; `test:browser` (full) 656 / 656, `--only edit-marks` 35 / 35. Angular
unchanged (types only): its fixture not run.

## Review (2026-10-23; reviewer, test analyser, owner S4-O4) — applied, tests first

**Budgets (owner S4-O4):** texts en/fr/ar 560 / 630 / 810, `edit.css` 1 350, `/editors` 4 350, dom 21 700
(`size-budget.json`, `rebudget.mjs`; `rebudget.test.ts` red first).

**Fixes**
1. Clocks: one first-in first-out queue per duration (500, 1 000, 1 500, 5 000 ms), one timer per queue,
   rows shown in one batch; a queue with no live clock clears its timer (`Date.now()`, so the tests fake `Date`).
2. Refusal sentences by gesture generation (not a microtask flag), queued in the assertive region, each
   emptied first: two refused gestures in one task are both said.
3. « Saving » by a set of generations said: a gesture that waited behind another still says it; the same
   sentence once per task.
4. Forced colours: each sign in its own rule; the stale sign keeps its `:not(saving, refused)` guard.
5. A muted row whose row header is not mounted: sign and description on its first mounted cell (the entry
   marks that cell `data-dzg-stale`; the theme draws the sign there).
6. `:dir(rtl)` on the cell for the ring's direction. 7. The refusal in forced colours: a solid CanvasText border.
8. `touch` bumps a spawned renderer's `rev` only when it holds the row.

**Bytes:** `.bind(seam)` dropped (the seam is called unbound); the seam found once at setup (`g.edit`); the
`null!` initialisers gone (`openEditor` / `closeEditor` / `editor` optional on the context); the box cell's
`aria-readonly` at the call site. The editor host moved to its own base module `render/editor.ts`: moving it
into `@dzgrid/dom/edit` put that entry at 3 779 (over its 3 650), so it waits for `@dzgrid/dom/editors` (step 5).
Texts: no `-editors` bundles yet, so the five local-check codes stay in `-edit` (move them at step 5);
`edit.stale` shortened (« Order out of date: reapply from the header »); Arabic plural forms kept; raw « ، ».

**Tests that failed first:** `edit-seams` 1 (spawned `rev`); `edit-marks` 3 (bounded timers, two refusals in a
task with [s, '', s], « Saving » for a waiting gesture); `edit-stale` 3 (row header not mounted, the new
`edit.stale` twice); theme `edit.test` 3 (`:dir(rtl)`, the sign's cell, forced colours with gap 13);
`rebudget` 1. Gaps already green on the code (kept as guards): 1, 2, 3, 4, 5, 8, 9, 10, 11, 12. Gaps 6, 9, 10
are in `edit-stale.test.ts` (they need a filtered header). The « Saving » expectation of review 3 is
['Saving', 'Saving'] (one per task).

**Mutants** (copy, deleted): 13 on the new code, 13 killed.

**Gate after the review:** `test:ci` 326 files, 5 253 tests green; `test:perm` 6 / 6; typecheck, build green;
`check:size` 0 over (dom 21 626 / 21 700, `dom/edit` 3 557 / 3 650, texts 499 / 563 / 730, `edit.css` 1 237 /
1 350, theme 2 427, core 28 916, `core/edit` 3 098, angular 6 323, K.8 82 403); contrast 630 / 0; browser
656 / 656, `--only edit-marks` 35 / 35.
