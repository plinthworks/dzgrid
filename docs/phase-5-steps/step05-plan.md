# Phase 5, step 5 — `@dzgrid/dom/editors` part 1 (text, number, start and end keys): blueprint (architect, 2026-10-23)

Sources: `phase-5-plan.md` step 5, D4, D5, D6, D12 (the `*` rule), D13, D15; `decisions.md` Q3, Q4, Q5, Q9 (Mixte),
O1, O8, S3-O3, S4-O1…O4 (they win); sheets `editing.md` 4–26, `editors.md` 1–5, `edit-validation.md` 1–11,
`edit-save.md` 1–2, `parts.md` (Phase 5 change: F2 always edits), `tree-keys.md` (editing); `step03-plan.md`
(controller API), `step04-plan.md` (Done, Review). Code read at the step-4 head. Clean room: our code, WAI-ARIA
1.2, APG grid « editing », WCAG 2.2, UI Events (`isComposing`, `keyCode 229`, `getModifierState('AltGraph')`).
Tests first. Plan only: no budget is changed here.

## Findings (code at the step-4 head; dom 21 626 / 21 700, grant 21 980; `dom/edit` 3 557 / 3 650; `edit.css` 1 237 / 1 350; theme 2 427 / 2 500)
- **Router order** (`keys/router.ts`): composing (`isComposing` / 229), `defaultPrevented` and nested-grid keys
  return first; Escape with a tooltip shown only hides it; then every `FeatureHandle.keys(e, at, owner)` (first
  true wins, `preventDefault`); then `intentFor`. On a cell F2 and Enter are `enter` (the part's `focus()`),
  Space `toggleSelect`; inside a field (owner `editor`, from `data-dzg-owner`) `intentFor` gives nothing.
- **`installKeys` runs at `grid.ts:165`, features' `setup` at `:193`**: a keydown listener a feature adds on the
  viewport runs *after* the router and after every feature's `keys` — it sees `defaultPrevented` when anyone took
  the key (the tree's `*`, Space's selection) and sees the composing keys the router dropped.
- **Editor host** `render/editor.ts` (base, 44 lines): `openEditor` / `closeEditor` / `lost`, called only from
  `render/viewport.ts` (`host.paint()` right after `rowRenderer.render`, `host.destroy` in scope); nothing else
  uses `openEditor`/`closeEditor` (`/dom/edit` neither). The base still needs `g.editor` (`Frame.active`, rule 5)
  and the layout CSS (`styles.ts:24-25`). `afterRows` runs in the same paint, just after the tooltip check.
- `EditApi` (`/dom/edit`) has `commit`, `state`, `refuse(key, col)` (0.5 s + limiter), no `check`, no way to say a
  sentence; its assertive region (`marks.ts:134`) empties first (S4 review 2). `EDIT_KEYS` makes `setup` throw on a
  missing text — the five codec codes (`validation.parse`, `day`, `invalid-instant`, `wall-time-skipped`,
  `wall-time-ambiguous`) are among them.
- `ColumnDef.edit` already types `maxLength` and `editor` (« the DOM's, steps 5–6 »). No `editingStarted` /
  `editingStopped` event type yet. Header cells have no ids (so `aria-labelledby` needs ids written).
- No `dblclick` listener anywhere. `composing()` exported by `@dzgrid/dom/internal`. Tooltip positioning
  (below, or above when no room; `fixedInlineStart`) in `render/tooltip.ts`; it shows on keyboard focus at once.

## Split
| Where | What | Bytes gz (target) |
|---|---|---|
| dom base | **−** editor host (`render/editor.ts` out), **+** `g.step(intent)` (the router's own `move`, for Enter's down/up), **+** the tooltip skips a cell with `data-dzg-editing` | **−120 to −160** → ~21 480 / 21 700 |
| `@dzgrid/dom/edit` | `EditSeam.api` (the editors find the controller), `alert(text)` on `EditApi`, the five codec codes out of `EDIT_KEYS` | **−30 to −60** → ~3 510 / 3 650 |
| `@dzgrid/dom/editors` (new) | host, keys, text and number fields, validation round, bubble, blur, Delete, events, layout CSS | **3 000–3 500** / 4 350 |
| `locales/{en,fr,ar}-editors` (new) | 2 sentences, field name, 5 codec codes | ~260 / 290 / 350 |
| `locales/*-edit` | −5 codes | ~−110 each |
| theme | field, invalid outline, bubble, forced colours | ~280–380 (S5-O2) |

## API
```ts
// @dzgrid/dom/editors
export function editors<T = unknown>(o?: EditorsOptions): GridFeature;   // id 'editors'
export interface EditorsOptions {
  /** Q3: after Enter / Shift+Enter, the cell below / above ('down', default) or the same cell ('stay'). */
  readonly enterMoves?: 'down' | 'stay';
  /** D5: Tab opens the next editable cell ('cell', default) or leaves the grid ('grid'). */
  readonly tab?: 'cell' | 'grid';
}
export const EDITORS_KEYS: readonly EditorsMessageKey[];
export type { EditorsMessageKey, EditorsMessages } from '../part-texts.js';
```
- Use: `features: [edit({ save }), editors({ enterMoves: 'stay' })]`, messages `{ ...FR.text, ...FR_EDIT.text,
  ...FR_EDITORS.text }`. The plan's `edit.enterMoves` / `edit.tab` become these two options (no base setting, no
  base bytes; live change = a new feature list; Angular `[editing]` maps onto them at step 9).
- `editors()` finds the controller through `g.edit.api` (the seam `/dom/edit` already hands; `EditSeam` gains
  `readonly api?: EditApi<unknown>`, types in the base). Without `edit()`: one `missing-feature` warning at
  `features.editors`, detail `edit`, at setup; no key, click or tap is taken (the grid stays as today).
- Missing texts: `setup` throws `TypeError('editors: missing …')`, exactly as `edit()` does.
- **Column**: `edit.editor` absent → by type: `text` → text, `number` → number; `day`, `instant`, `boolean`,
  enum, custom → **no field at step 5** (F2/Enter/typing do nothing there; Delete still clears: it needs no
  field); step 6 fills them. `edit.editor: 'text' | 'number'` forces one (a custom-typed column read by its
  codec through a text field). Any other name: `unknown-part` at `columns.<id>.edit.editor` once per columns
  version, no field (the `editor.<name>` part slot is step 6). `edit.maxLength`: below.
- **Events** (core types only, 0 B): `editingStarted { key, column, start: 'f2'|'enter'|'key'|'dblclick'|'tap'
  |'tab' }`, `editingStopped { key, column, kept: boolean, via: 'enter'|'tab'|'escape'|'blur'|'lost' }`.
  `cellEdited` stays the controller's.
- `EditApi` gains `alert(text: string): void` (the assertive region, emptied first). Refusal sentences of
  the editors go there; nothing else of theirs is spoken.
- **Angular**: nothing at this step (step 9: `editors` in the features, `[editing]` options, `dzgEditor`).

## Editor host (moved: clean)
`render/editor.ts` → `packages/dom/src/editors/host.ts`, same contract: `open(key, col, field)` (cell mounted, no
editor open; `data-dzg-editing`, field appended, `g.editor` set), `shut(focus)` (rule 6 when `focus`, row
touched, scheduled), `lost` checked in the feature's `afterRows` (same paint, after the rows), and in `destroy`.
`GridContext.openEditor` / `closeEditor` removed (types). The base keeps `g.editor`, `Frame.active`, rule 5, the
layout CSS. `edit-seams.test.ts`'s host tests import `editors/host.ts` directly; rule-5 tests set `g.editor`
through it. If the move costs more than it saves anywhere (measured), it stays in the base and the plan says so.

## Behaviour
**Start** (focus on an editable data cell, `kernel.editable(key, col)`, a field type known, no editor open)
1. **F2** (keys hook, before the router): open, the cell's value as text, caret at end — never the part (parts.md).
2. **Enter** (keys hook): the part's `focus()` first; true → the part has it (as today); else open as F2.
   Shift/Ctrl/Alt/Cmd+Enter on a cell: nothing new.
3. **Printable key** (a late viewport listener, so the router, the tree's `*`, Space's selection and every
   feature win first): `!e.defaultPrevented`, owner `cell`, `[...e.key].length === 1`, `e.key !== ' '`, no Ctrl,
   no Cmd; Alt allowed only as AltGr (`getModifierState('AltGraph')`) — **and on a Mac Option counts as AltGr**
   (French Mac needs it for `[ ] { } | ~`; lead pick). `preventDefault`, open with `e.key` only, caret after.
   Arabic letters and Arabic-Indic digits pass (single code point). **Space never starts.** **`*` in the tree
   column**: the tree's hook took it (`defaultPrevented`): never a start, by construction, whatever the feature
   order (a test with `editors()` listed before `tree()`).
4. **Composition** (`isComposing` or 229, or `e.key` `'Process'` / `'Dead'`; same late listener): open the field
   **empty**, focus it synchronously, **no** `preventDefault`, so the composed text lands in the field. Inside the
   field nothing starts or commits while composing (the router drops those keys; the editors' own listeners check
   `composing()` from `@dzgrid/dom/internal`). A Safari 229 Enter after `compositionend` is the IME's.
5. **Double click** (`dblclick` on `el.body`, the grid's own cell, `closest('.dzg') === root`): open, text kept,
   caret at end (the click point is not sought: inputs give no caret-from-point in Chrome).
6. **Delete / Backspace** (keys hook, owner `cell`, no modifier): `commit([{ key, column, input: { text: '' } }])`
   — the column's empty value, one save; a refusal (`required`): `api.refuse` + `edit.refused`; no field. Works
   on any editable cell, field type known or not.
7. Read-only cell, non-data row, unknown field type, a cell not mounted: 1–5 do nothing (2 keeps the part path).
8. Opening: the tooltip hidden; field built (below), `host.open`, focus the field (`preventScroll`), select
   nothing, caret placed; `editingStarted`. A Tab-reached cell not mounted yet: focus set, revealed, open at the
   next `afterRows` (one pending open, dropped by any other focus change).

**The fields** (one `<input>` per open editor, built at open, dropped at close)
9. Common: `class="dzg-field"`, `data-dzg-owner="editor"` (the host), `autocomplete="off"`, `aria-label` =
   `editors.fieldName {column, row}` (the column's header text, the row header's text: header cells carry no id,
   so a name, not `aria-labelledby` — `editing.md` 23 updated), `enterkeyhint` `next` (Tab) or `done`,
   `maxLength` = `edit.maxLength ?? 1 000` (S5-O5; the pattern ReDoS note: the DOM caps what is typed; a longer
   value from the data opens whole and can only shrink).
10. **Text**: `dir="auto"`, `spellcheck` left to the browser; opening text = the overlay value
    (`g.edit.read`) as a string, `null` → `''`; kept as typed (no trim; core rule: spaces are a value).
11. **Number**: `dir="ltr"` (isolated inside an RTL cell, caret logical), `inputmode="decimal"`,
    `spellcheck="false"`, aligned as the column (`text-align: end` for numbers: the theme). Opening text: the
    raw number, shortest round-trip (`String(n)`), `.` → the locale's decimal sign, digits in the grid's
    numerals, **no group separators**, no format scaling (a percent column opens 0,15: lead pick, risk);
    exponent forms (`1e21`) opened as-is (the codec refuses them: risk, test). Up/Down are the caret's.

**End** (keys hook, owner `editor`, the field of this grid)
12. **Enter**: `commit` the field's text. Refused → stays open (13). Kept or unchanged → `shut(true)`; then
    `enterMoves: 'down'` → `g.step({ kind:'move', axis:'row', delta: 1 })` (exactly the Down arrow: details,
    spans, last row stays); `'stay'` → the cell. **Shift+Enter**: the same, `delta: -1`.
13. **Local refusal** (`commit` → `refused[0].code`): field kept, text and caret untouched, `aria-invalid="true"`,
    the bubble shown (`aria-describedby` = bubble id), `api.refuse(key, col)` (blink/limiter of `/dom/edit`),
    `api.alert(edit.refused {column, reason})`, reason = `validation.<code>` (`{min}`/`{max}` formatted by the
    column's format; `{pattern}` of `day` at step 6), else `validation.invalid`. Enter again on the same text:
    all again (edit-validation 5). Typing keeps the bubble until the next keep (4).
14. **Tab / Shift+Tab** (`tab: 'cell'`): commit; refused → stays open, focus does not move (7); kept → next /
    previous editable cell in reading order (visible columns logical order, then next displayed **data** rows;
    `kernel.editable` and a known field type), focused, revealed (pinned columns, sticky rows, `g.reveal`),
    opened (`start: 'tab'`); none → `shut(true)`, focus on the cell. `tab: 'grid'`: commit, `shut(true)`, the
    browser's Tab from the cell (one tab stop). Search bounded by the displayed rows (bench at 100 000 × 12).
15. **Escape**: `shut(true)`, nothing kept, nothing said, `editingStopped { kept: false }` (a shown tooltip takes
    the first Escape, router rule).
16. **Blur** (Q5; `focusout` of the field): decided one task later — `activeElement === field` (the window lost
    focus) → stays open; else commit **without** moving the focus back (`shut(false)`); refused → **O1**: text
    dropped, `api.refuse` (blink), the last value shows, `api.alert(edit.refusedDropped {column, reason})`,
    nothing to undo. A click on another cell, a header (a sort reapplies, K.14), a button outside: all blur.
17. **Lost** (row gone, column hidden, `getRowId` change; host): row still in the model → the text committed
    (hidden = kept, D8/O9), else dropped; no sentence at this step (step 7 owns D8's sentence).
18. **Inside the field**: arrows, Home, End, Ctrl/Cmd+A/C/V/X/Z, Space, Delete, Backspace, printable keys: the
    field's (owner `editor`; the router gives no intent, the hooks take only Enter/Tab/Escape). Nested grids:
    every listener checks `closest('.dzg') === el.root` (an inner grid's field is the inner grid's).

**The bubble** (edit-validation 3; WCAG 2.4.11, 1.4.13 not applicable: not a hover content)
19. One `<div class="dzg-bubble" id>` per grid, created at first refusal, top layer (`popover="manual"` where the
    browser has it), text = the reason, a sign drawn by the theme before it (not colour alone).
20. Placed from the **cell's** rect: below (`bottom + 4`), above when no room below; inline at the cell's inline
    start (`fixedInlineStart`, mirrored in RTL) — it never covers the field. Re-placed at each `afterRows` while
    shown (one rect read per paint, only then); hidden while the cell is outside the viewport's box (scrolled
    away; the field stays, rule 5), shown again when it comes back.
21. Removed (hidden, `aria-describedby` token out, `aria-invalid` out) at close, at a passing keep, at lost.

**Mobile and touch**
22. **Double tap** (S5-O4 A): two `pointerup` of `pointerType: 'touch'` on the same cell within 400 ms and 10 px
    → open (`start: 'tap'`) and focus the field inside that handler (user activation: the soft keyboard shows on
    iOS and Android). A single tap only focuses (Q4). The editors' layout CSS sets `touch-action: manipulation` on
    `.dzg-body` (no double-tap zoom delay, pinch kept). The native `dblclick` after a touch double tap is ignored
    once (no double open).
23. Soft keyboards send 229 in fields: Enter still arrives as `Enter`; nothing starts on a cell by typing (no
    keyboard without a field). The browser scrolls the focused field into the visual viewport; the bubble is
    placed from layout-viewport rects (iOS `visualViewport` offset: risk, checked in WebKit).

## Keyboard table (`edit-keys`; ar: the same keys, the moves mirrored where they are horizontal)
| Where | Key | fr / ltr | ar / rtl |
|---|---|---|---|
| editable cell | F2 | open, text, caret at end | same |
| editable cell | Enter | part's `focus()` true → part; else open | same |
| editable cell | printable (AltGr/Option incl.) | open with that char | Arabic letter / ٣ opens with it |
| editable cell | Space | select the row (never a start) | same |
| tree column cell | `*` | siblings open, no edit | same |
| editable cell | Delete, Backspace | clear, one save (required → refusal, no field) | same |
| editable cell | composition (229 / Process / Dead) | open empty, text lands in the field | same |
| editable cell | double click / double tap | open, text, caret at end | same |
| read-only cell | all of the above | nothing (Enter: the part, as today) | same |
| field | Enter / Shift+Enter | keep; down / up (`stay`: stay) | same (vertical) |
| field | Tab / Shift+Tab | keep; next / previous editable cell, reading order | next is **leftwards** |
| field | Escape | give up, focus on the cell | same |
| field (refused) | Enter, Tab | check again; stays open, focus does not move | same |
| field | blur (click elsewhere) | keep; refused → O1 drop + blink + sentence | same |
| field | Left, Right, Home, End | the caret (logical in `dir=auto` text; LTR in number) | caret in Arabic text runs leftwards |
| field | Ctrl/Cmd+Z, V, C, X, A, Space | the field's | same |
| field, composing | Enter, Escape | the IME's | same |
| nested grid's field | any | the inner grid's only | same |

## Texts (`locales/{en,fr,ar}-editors`, new; `-edit` loses the five codec codes)
| Key | en | fr | ar |
|---|---|---|---|
| `edit.refused` | {column}: value refused, {reason} | {column} : valeur refusée, {reason} | {column}: قيمة مرفوضة، {reason} |
| `edit.refusedDropped` | {column}: value refused, change cancelled | {column} : valeur refusée, modification annulée | {column}: قيمة مرفوضة، أُلغي التعديل |
| `editors.fieldName` | {column}, {row} | {column}, {row} | {column}، {row} |
| `validation.parse`, `.day`, `.invalid-instant`, `.wall-time-skipped`, `.wall-time-ambiguous` | moved verbatim from `-edit` | | |
`EditorsMessageKey` / `EditorsMessages` in `part-texts.ts`; `g.msg`'s union widened (types). `/dom/edit`'s
reason lookup (`failedMark`, `saveRefused`) must test a key's presence before `g.msg` (a server answering
`parse` without the editors bundle → `edit.reasonUnknown`, no `missing-message`): test. Step 6 adds
`edit.calendar*`, `edit.retry`, `edit.optionNotInList` to these bundles.

## Theme (`edit.css` per S5-O2 A; `@layer dzgrid.theme`; logical sides only)
`.dzg-field`: font/size/line-height inherit, `color: var(--tz-fg)`, background the cell's (selected/hovered
rows included), no border, padding = the cell's inline padding, a 2 px inset focus ring (`--tz-focus`, ≥ 3:1
against the cell); numbers `text-align: end`. `[aria-invalid=true]`: a steady 2 px `--dzg-refused-color`
outline, dashed (shape, not colour alone), the blink of `/edit` on the cell around it. `.dzg-bubble`: surface
`--tz-bg`, text `--tz-fg`, 1 px `--dzg-refused-color` border, radius, `max-inline-size: 40ch`, a « ! » sign
`::before` at the inline start (`clip-path` circle, `--dzg-refused-color`). Forced colours: field
`Field`/`FieldText`, ring `Highlight`, invalid outline `CanvasText` dashed, bubble `Canvas`/`CanvasText` border.
Contrast pairs added (base, Midnight, Clinic, light/dark): field text on cell / selected / hovered (4.5),
ring (3), bubble text (4.5), bubble sign and border (3). Layout (in `/editors`, injected like the tree's styles):
`touch-action: manipulation` on the body; the field `inline-size: 100%` already from the base's `inset: 0`.

## Files
New: `packages/dom/src/editors.ts` (entry), `editors/{index,host,keys,fields,bubble,touch}.ts`,
`locales/{en,fr,ar}-editors.ts`. Changed: `render/viewport.ts` (host out), `render/editor.ts` (deleted),
`context.ts` (`openEditor`/`closeEditor` out, `step`), `keys/router.ts` (`g.step`), `interact/tooltips.ts`
(skip `[data-dzg-editing]`), `features.ts` (`EditSeam.api`), `edit/index.ts` (`alert`, keys list, seam),
`edit/marks.ts` (reason lookup), `part-texts.ts`, `locales/*-edit.ts`; core `events.ts` (two event types);
`package.json` exports, `build.mjs`, vitest/tsconfig aliases, `size-budget.json` and `rebudget.mjs` lines **only
after the owner's S5 answers**; theme `edit.scss` (+ built css), `contrast-pairs.json`.

## Tests first (jsdom; each red before its code)
- `editors-keys.test.ts` — one test per table row, fr LTR and ar RTL (Tab order leftwards); F2 never calls the
  part, Enter tries it first; Space selects; `*` with `editors()` listed **before and after** `tree()`; AltGr
  (`ctrlKey+altKey`+`getModifierState`) starts, Ctrl+C does not; Mac Option char starts (`mac` true); 229 /
  Process / Dead open empty without `preventDefault`; composing Enter/Escape inside: nothing; nested grid's keys
  ignored by the outer; read-only, detail, filler, loading cells: nothing; day/boolean column at step 5: no field,
  Delete still clears.
- `editors-end.test.ts` — Enter down / Shift+Enter up / `stay`; last row stays; Enter onto a detail row as Down;
  Tab across rows skipping non-editable and non-data rows; Tab at the grid's end; `tab: 'grid'`; Escape (no
  event, no save); blur commits, window blur (activeElement kept) keeps open; focus never on `body` (rule 6);
  `editingStarted`/`Stopped` once each with `start`/`via`.
- `editors-validation.test.ts` — `1,5` in en → `parse`, sentence assertive, `aria-invalid`, `aria-describedby`
  → bubble text; Arabic-Indic `١٢٫٥` accepted in ar-EG; `min` with its number formatted; Enter twice = two
  sentences (each emptied first), limiter from `/edit`; Tab refused stays; **O1**: blur refused → text dropped,
  last value shown, `refusedDropped`, nothing to undo; Delete on `required`; typing keeps the bubble, a pass
  removes it; a server `parse` code without the editors bundle → `reasonUnknown`, no problem.
- `editors-fields.test.ts` — number opens `0,30000000000000004` from 0.1+0.2 in fr (hand-written), no group sign
  at 1 234 567, Arabic-Indic numerals when the grid uses them, `dir`/`inputmode`; text `dir=auto`, spaces kept;
  `maxLength` 1 000 default and `edit.maxLength`; a 1 500-char value opens whole; `aria-label` from both
  headers; unknown `edit.editor` → `unknown-part` once.
- `editors-host.test.ts` (moved `edit-seams` host part) — open/shut/lost/destroy as before, from the new module;
  the base without `editors()` byte-identical DOM (the step-4 snapshot fixture unchanged).
- `editors-bubble.test.ts` — below the cell; above when the cell is near the window's bottom; inline start in RTL;
  never intersecting the cell's rect (stubbed rects); hidden when the cell scrolls out, back when in; one rect
  read per paint while shown, none when not (spy).
- `editors-touch.test.ts` — two touch `pointerup` ≤ 400 ms same cell → open; > 400 ms or another cell → no;
  mouse `pointerup` ignored; the trailing `dblclick` does not open twice; a single tap focuses only.
- **Bugs replayed (ngx-sheetgrid `a6c97f5`, from its commit description)**: bug 1 — sort, then edit the 3rd
  displayed row: the right `RowKey` is saved; bug 4 — a printable key the grid also binds (`a` with selection,
  `*` outside the tree column, `/`) typed in an open field stays in the field.
- `editors-walk.test.ts` (300 seeds) — random opens (all start kinds), typing, keeps, refusals, Escape, blur,
  sorts, filters, scrolls, host updates: never a stale cell (oracle = overlay), focus never on `body`, at most
  one field in the grid, no field left in a pooled cell.
- Guards: `editors-texts.test.ts`, public API list, layering (`/editors` never imports `/filters`; the base never
  imports `/editors`), `rebudget` lines (red first, once the owner answered).

## Mutants worth running (copy, deleted after)
Space accepted as a start; `*` not deferred (late listener moved into `keys`); AltGr test dropped; 229 path
`preventDefault`ed; composing check removed in the field; Enter skips the part's `focus()`; F2 calls the part;
`shut(false)` on Enter (focus on body); blur without the one-task delay (window blur closes); O1 keeps the text;
refused Tab moves; Tab steps onto a detail row; `enterMoves` ignored; Shift+Enter goes down; Escape commits;
`aria-invalid` not removed on pass; bubble above when room below; bubble covering the cell (offset 0 → −4);
`maxLength` not set; number opened with groups; `dir=ltr` lost on number; nested-grid guard removed; touch window
400 → 4 000; trailing dblclick opens twice; lost commits a removed row.

## Browser (`npm run test:browser -- --only editors`, Chrome; one browser, closed after)
- Keyboard flows by real keys (CDP `Input.dispatchKeyEvent`): fr light Clinic and ar RTL dark Midnight — F2,
  Enter, typing (Latin, Arabic letters, ٣), Enter/Shift+Enter, Tab leftwards in ar, Escape, Delete; caret
  position and digits shown in Arabic; focus visible on the field (2.4.7) and never hidden under pinned columns
  or sticky rows (2.4.11) after Enter/Tab moves.
- **IME**: CDP `Input.imeSetComposition` then `Input.insertText` on a focused editable cell (Japanese «かな»,
  Chinese «中文»): the field opens, the text lands whole, no Enter commits mid-composition. CDP does not drive an
  OS IME: the owner's manual check stays (§19 addition: macOS Japanese / Pinyin, French dead keys `^`+`e`).
- axe 0: field open, field refused with the bubble — fr light, ar dark, base light/dark, forced colours.
- Accessible names (CDP `Accessibility.getPartialAXTree`): field « Stock, Paracétamol 500 », `invalid: true`,
  description = the bubble text; in ar the Arabic names.
- Bubble placement: never intersecting the field's rect (middle row, last visible row → above, RTL inline start,
  zoom 200 %, a narrow 320 px viewport), re-placed after a scroll, hidden when scrolled out.
- Forced colours (`emulateMedia forcedColors: active`): ring, invalid outline, bubble border visible.
- 100 000 rows: edit, Enter ×50 down while scrolling: 0 long task, field never in a pooled row.
- Touch (`Input.dispatchTouchEvent`, Chrome mobile emulation): double tap opens, single tap does not.
- WebKit (playwright `webkit`) for the bubble in the top layer and the double tap only (spike rule).
- Manual (owner, non-blocking, `a11y-protocol.md` §19): VoiceOver/NVDA on open, refuse, O1 in fr and ar.

## Sizes (gz, measure on minified code; grants)
`/editors` (external: core, core/internal, core/edit, dom/internal, dom/edit types): host ~180, start keys and
late listener ~450, end keys + Tab search ~450, fields text+number ~350, validation round + sentences ~250,
bubble ~350, blur/O1 ~150, Delete ~60, touch + CSS ~200, events ~80, setup/texts/problems ~250 →
**~2 800–3 500 / 4 350**. Step 6 (day/instant field + calendar loader ~700, boolean ~150, list combobox ~900,
custom part ~300) adds ~2 000: **4 350 will not hold both steps** (S5-O1). Base ~21 480 (−~150). `/dom/edit`
~3 510. Texts: `-editors` en/fr/ar ~260/290/350 (step 6 + ~150 each); `-edit` ~390/450/600. Theme +280–380.
K.8 profile: base shrinks only. Real Angular example: base delta only (≤ 90 000). Time: open ≤ 4 ms, keep →
repainted cell ≤ 1 frame; Tab search ≤ 2 ms over 100 000 rows with one editable column every 12.

## Docs
`editing.md` (23: `aria-label`; 6: Option on Mac; 7: open-empty rule; 22b touch), `editors.md` (1 at step 5,
4: opening text, percent), `edit-validation.md` (bubble re-placement, hidden off-screen), `parts.md`,
`a11y-protocol.md` §19 (IME, dead keys, touch), ARCH Phase 5 index (host moved, `g.step`), ROADMAP, STATUS,
`decisions.md` (S5 answers), this file's « Done ».

## Risks
- IME start on a non-editable focused cell: browsers may drop the first composed character when focus moves
  during the 229 keydown; CDP cannot prove the OS path. Fallback (if the manual check fails): a hidden
  focused proxy input per grid — a focus-model change, its own owner question then.
- Dead keys (`^`+`e`): same path, manual only.
- Blur decided one task later: a host action in that task (a click handler reading the value) sees the old
  value; documented. Window blur detection by `activeElement` (no `hasFocus`).
- `g.step` and Tab rely on the paint to mount the target before `open` (pending open in `afterRows`).
- Number opening text: format scaling (percent) and exponent forms; locales whose decimal sign is `٫`.
- The bubble in the top layer vs iOS visual viewport; one rect read per paint while shown.
- Tree column: the field (`inset: 0`) covers the indent and toggle until step 8 (D12); `*` handled here.
- `/editors` 4 350 vs steps 5 + 6 (S5-O1); `/dom/edit` margin ~140 B after this step.
- Header ids absent: `aria-label` text instead of `aria-labelledby` (a language change while open re-labels at
  the next paint).

## Owner questions
- **S5-O1 Taille de `/editors`** (4 350 accordés ; l'étape 5 mesurerait ~3 000–3 500, l'étape 6 — dates, liste,
  oui/non, éditeurs maison — ajoute ~2 000). **A** garder 4 350 maintenant, redemander à l'étape 6 avec la mesure ★ ;
  **B** accorder 5 500 tout de suite (avec `/dom/edit` 3 650, cela fait 9 150 : au-dessus des 8 000 de Q16, un nouvel accord) ;
  **C** mettre la liste et les dates de l'étape 6 dans des entrées à part, chargées à la demande.
- **S5-O2 Style du champ et de la bulle** (~300 o). **A** dans `edit.css`, plafond 1 350 → 1 700 (un seul
  fichier pour les applis qui éditent) ★ ; **B** un fichier `editors.css` à part (plafond ~450) ; **C** dans le
  thème de base (2 427 / 2 500 : dépasse).
- **S5-O3 Textes `-editors`** (nouveaux). **A** plafonds en/fr/ar 450 / 500 / 620, de quoi tenir l'étape 6 ★ ;
  **B** mesure + 10 % maintenant, nouvelle demande à l'étape 6.
- **S5-O4 Téléphone et tablette.** **A** deux tapes rapides ouvrent le champ (comme le double clic) ★ ;
  **B** une tape sur la cellule déjà sélectionnée ouvre ; **C** les deux.
- **S5-O5 Longueur tapée maximale par défaut** (la colonne peut la changer avec `edit.maxLength`).
  **A** 1 000 caractères ★ ; **B** 10 000 ; **C** 255.

## Done (2026-10-24, not committed; owner S5-O1…O5 applied)

**Built.** `@dzgrid/dom/editors` (`editors.ts`, `editors/{index,host,bubble}.ts`; the blueprint's `keys`, `fields`,
`touch` live in `index.ts`): `editors({ enterMoves, tab })`, text and number fields, start keys (F2; Enter after
the part; printable with AltGr and Mac Option; input methods; Delete / Backspace; double click; double tap), end
keys (Enter / Shift+Enter through `g.step`; Tab / Shift+Tab in reading order, `tab: 'grid'`; Escape; blur one task
later; O1; lost), the bubble, events `editingStarted` / `editingStopped` (core types), `EDITORS_KEYS`, layout CSS
(`touch-action: manipulation`, the bubble fixed) injected in `dzgrid.layout`. The host moved: `render/editor.ts`
deleted, `editors/host.ts` (same contract); the base keeps `g.editor`, loses `openEditor` / `closeEditor`, gains
`g.step`; the tooltip skips `[data-dzg-editing]`. `@dzgrid/dom/edit`: `EditSeam.api`, `EditApi.alert`,
`EditApi.reason`, the five reading codes out of `EDIT_KEYS`. Texts `locales/{en,fr,ar}-editors` (the five codes
moved verbatim). Theme `edit.scss`: field (opaque in the row's colour, inset ring, numbers at the end, dashed
refused outline), bubble (« ! » sign), forced colours; 9 contrast pairs (684 / 0). Entries and aliases:
`package.json` exports, `build.mjs`, vitest and tsconfig paths; `size-budget.json` and `rebudget.mjs` (S5 grants).
Playground: `orders-edit.html` (Démos menu, fr light Clinic and ar dark Midnight): the sub-orders' client,
quantity, amount editable; a simulated save (0.6 s) refusing every value ending in 7. Browser page
`packages/dom/test/browser/editors.{html,ts}`, `npm run test:browser -- --only editors` (`--engine webkit` added
to the runner for one engine).

**Tests that failed first.**
- `scripts/test/rebudget.test.ts`: the new step-5 test and the two moved pins (edit.css 1 700) red, then the ceilings.
- `editors-texts.test.ts` (4): red (no entry, no bundles).
- `editors-host.test.ts` (10 moved from `edit-seams`): red (no `editors/host.ts`); the no-seam snapshot of
  `edit-seams` unchanged and green (the base without editors is byte-identical).
- Against a skeleton entry (setup and its texts check only): `editors-keys` 20 / 28 red, `editors-end` 24 / 24,
  `editors-validation` + `-fields` + `-bubble` + `-touch` 33 / 38. Green on the skeleton by design (absences):
  read-only cell, Enter on a read-only part, Shift/Ctrl+Enter, the nested grid's keys, the missing text throw,
  a server's reading code without the bundle, the window blur, > 400 ms, a mouse, a single tap.
- Theme `edit.test.ts` +5: red (no field or bubble rules, no pairs).
- After the browser run: « keys faster than the paint » (3, 2 red: F2 and characters before the cell is mounted
  were lost — found by the 100 000-row check; the open now waits for the paint).
- After the mutants: Tab's waiting open with frames of the test's own (red on its mutant), a character in a
  part's widget (red on its mutant).
- Written after the code (guards, not red first): `editors-walk.test.ts` (300 seeds, oracle = the host's rows
  written back by `cellEdited`; ~5 s), the structure test of the entry, the internal-entry users list.

**Mutants** (copy of the repo, deleted after): 37 distinct — the blueprint's 25 plus 12 (host order, lost twice,
bubble out of view, Delete's sentence, unknown name told once, Tab's waiting open, `tab: 'grid'`, the tooltip skip,
three on the waiting open, a widget's key). 34 killed (2 after a new test each: Tab's waiting open, the widget);
3 equivalent: Space (the router prevents it before the late listener; the guard kept as the stated rule),
`aria-invalid` on a pass (a field is never reused), « lost commits a removed row » (the edits refuse a row they
no longer have: the row check was dead code, removed).

**Browser** (Chrome, `--only editors`): 43 / 43 — fr light Clinic and ar (ar-EG, Arabic-Indic digits) dark Midnight:
real keys (F2, Enter, Shift+Enter, Latin and Arabic letters and ٣ through `Input.dispatchKeyEvent`, Tab leftwards
in Arabic, Escape, Delete), the 2 px ring, the field clear of the pinned column and in view after Tab, a refusal
(bubble below at the inline start, above on the last visible row, clear of the field), axe 0 with the field and
with the bubble, the accessible name « Stock, Paracétamol 8 » / « المخزون، باراسيتامول 8 », invalid, described by
the bubble (`Accessibility.getPartialAXTree`), forced colours (dashed outline, bubble border and sign; axe 0 there
but colour contrast, which is the system's), O1, no page error; 320 px and 200 % zoom (500 × 380); input methods
(`Input.imeSetComposition` + `insertText`: « かな », « 中文 », a composing Enter keeps nothing); 100 000 rows, 50 edits
going down by Enter: 0 long task, the field always in its own row; mobile emulation: one tap focuses, a double tap
opens. WebKit (`--engine webkit`): the bubble in the top layer, the double tap: 2 / 2. Playground checked on the
running server (fr, ar): open, save, server refusal (value ending in 7), local refusal bubble, orders read-only.

**Sizes** (gz): `@dzgrid/dom/editors` **3 622** / 4 350; dom base **21 414** (was 21 626, −212; budget 21 700 kept,
the plan does not lower it); `@dzgrid/dom/edit` 3 556 / 3 650 (−1); `-editors` en/fr/ar **277 / 306 / 375** (450 /
500 / 620); `-edit` 387 / 444 / 579 (560 / 630 / 810); `edit.css` **1 619** / 1 700; theme base 2 427; core 28 916;
`core/edit` 3 098 (untouched); angular 6 323; K.8 82 178.

**Deviations.**
- `enterkeyhint` is always `done` (Enter keeps; nothing opens on the cell reached).
- A server's reading code without the editors' texts reads `validation.invalid` (edit-validation 10), not
  `edit.reasonUnknown` as the blueprint wrote; no `missing-message` either way.
- `unknown-part` for an unknown `edit.editor` is told once per column and name (not once per columns version: a
  resize bumps the version), severity warning, at the first paint.
- The field's background is the row's (base, hovered, selected rules repeated in `edit.css`), not `inherit`: a
  cell is transparent and the field must hide the text under it.
- New: an open asked for a cell not mounted yet (Tab, or keys typed faster than the paint after Enter's move)
  waits for the paint that mounts it, with the characters typed meanwhile; any other focus drops it.
- Lost at the grid's destroy: dropped, nothing saved (the edit controller may be gone first).
- The late listener accepts a key from any cell of ours (the focused one, or the one being left while the next
  waits), never from a widget in a cell or a nested grid.
- `vite.config.ts` has no `@dzgrid/dom/editors` alias yet (editing it restarts the running server): the playground
  imports the source by path; add the alias when the server can restart.
- `dir.ts` gains two pure helpers (`inlineApart`, `pointerGap`) so the entry reads no physical side (guards).

**Gate** (once, one command at a time): `typecheck` green; `build` green; `check:size` 0 over; `check:contrast` 684
pairs, 0 under; `test:ci` 335 files, **5 360 tests green**; `test:perm` 6 / 6; `test:browser` (full) **697 / 699**: the
two failures are the date filters' « midnight in Paris » check (« today » should move 24/10 → 25/10 by itself), which
fails the same way on HEAD without this step's changes (run in a copy of HEAD): it depends on today's real date
(2026-10-24), not on the editors — to look at separately. A first full run stopped on the demos page: the suite's
import map (`demos.html`) lacked the editing modules the orders demo now imports — added, `--only demos` 38 / 38.
Angular unchanged (types only): its fixture not run.

**For the owner.** Manual checks `a11y-protocol.md` 124a (macOS Japanese and Pinyin, French dead keys) and 124b
(iOS and Android double tap, the bubble above the keyboard); the Arabic wording of `-editors`.

## Review (2026-10-24; reviewer R1–R7, test analyser, the date test) — applied, tests first

**Fixes**
1. **R1 (high)**: keys typed while an open waits for its paint were lost or misread (« 4 », « 2 », Enter lost 42;
   « 4 », Backspace saved an empty cell). The wait now holds the text: characters append (after the cell's text
   when F2 or Tab asked), Backspace shortens, Enter and Tab are kept and run once the field opens (`end()`, shared
   with the field's keys), F2 and Delete change nothing, Escape drops it.
2. **R2**: while shown, the bubble is placed again on any scroll (window, captured), window resize and
   `visualViewport` resize/scroll; the listeners go when it hides.
3. **R3**: `maxLength`: a whole number ≥ 1 (clamped at 2^31 − 1); **0 or Infinity: no cap** (decision); absent: 1 000;
   anything else 1 000.
4. **R4**: pointerdown and mousedown on the bubble are prevented: a click on it keeps the field, its text, no O1.
5. **R5 (IME)**: the hidden proxy input is a focus-model change (cells stop being the focus target), not cheap:
   **not done**, a step-6 risk; `a11y-protocol.md` 124a made **blocking** for the close of Part A, noted in STATUS.
6. **R6**: the field's row name is the row header's value as its column shows it (codec format), not the cell's
   drawn text (a part may hide it).
7. **R7**: playground: « 1.5 » in Qté → the host's code `integer` with its own text; the simulated save honours its
   abort signal.
8. **Date test**: the dates page takes a starting clock (`clock=<ISO>`, the runner's `DATES_CLOCK`, 2026-06-10 by
   default) and the « midnight in Paris » check paints the cleared day filter before moving the clock (its midnight
   timer was kept for the same zone-day). `--only dates` 44 / 44 started on 24 October (today), on 29 March (a clock
   change) and on 10 June.

**Tests that failed first** (`editors-review.test.ts`): R1 6 cases + the 300-burst property (keys before the paint
= the same keys after it), R2, R3, R4, R6 — 11 red. The analyser's gaps (non-BMP start, Mac Ctrl, composition
reported `key`, modifiers with Enter/Tab/Escape in the field, nested grid's double click, refused Tab prevented,
`editingStopped [true, 'tab']` with `cell` and `grid`, source `user`, removed cell never focused, bubble hidden
above / sideways / row removed, no room either side, placed at show, blur timer on a closed field, blur one task
not a microtask, touch 400 / 401 ms, 10 / 11 px, two cells, a third tap): green on the code, kept as pins. Browser
(`--only editors`, +6): the page scrolled with the bubble shown, the cell scrolled out (hidden, back), a click on
the bubble — written with the fix.

**Mutants** (copy, deleted): 12 on the new code, 11 killed at first, 1 (« listeners kept after hide ») after a new
assertion (the window listeners removed).

**Gate**: typecheck, build green; `check:size` 0 over; contrast 684 / 0; `test:browser` full **705 / 705**,
`--only editors` 49 / 49, `--only dates` 44 / 44 ×3; `test:ci` 336 files, **5 389 / 5 389**, `test:perm` 6 / 6 (rerun
under `caffeinate -i`: the first run timed out two long tests while the Mac idled at night, 900 s for ~1 min of work).

**Sizes**: `/editors` **3 902** / 4 350 (+280); dom 21 414; texts 277 / 306 / 375; `edit.css` 1 619.
