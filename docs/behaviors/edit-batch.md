# Batch editing — changes kept, then saved together

Sources: the public documentation of grids with a « batch » edit mode (what a user sees: edited cells marked, a « Save
all » and a « Cancel all » button the application draws), spreadsheets' unsaved marks, WCAG 2.2 (1.4.1 use of colour,
1.3.1, 4.1.3 status messages). Owner 2026-11-21 (« fais-les tous », gap analysis Q-G2 « A »: the pending changes live
in the grid). Gap analysis §4 « Édition par lot ». Opt-in: a grid without it saves each gesture as before
(`edit-save.md`). Sheet written before the code (CLEANROOM.md).

## What the user does
Changes several cells — typing, pasting, filling, undoing — without anything leaving for the server; sees which cells
changed; then presses the application's « Save all » (one request) or « Cancel all ».

## Behaviours

1. **Opt-in**: `editBatch()` of `@dzgrid/dom/edit-batch` in `features`, beside `edit()` (and `editors()`). Without
   `edit()`: one `missing-feature` warning, nothing else. Its own entry: a grid without it pays nothing.
2. **Kept, not sent**: every gesture (a field kept, a yes/no toggled, Delete, Ctrl/Cmd+Enter, a row kept by
   `edit-row.md`, an undo, a redo, `api.commit`) — a paste and a fill too when the application asks (11) — is checked as today (`edit-validation.md`: a refusal never
   becomes pending) and shown at once, but no request leaves. The cell's change is **pending**.
3. **One change per cell**: a cell changed twice holds its newest value; its *previous* value stays the value saved
   before the first change (the source's, or the last value saved). A cell brought back to that value (typed again, or
   undone) is **no longer pending**.
4. **The mark** (not colour alone, WCAG 1.4.1): a pending cell carries `dzg-cell--unsaved` — a triangle in its
   inline-start top corner and a light tint — and is described « Not saved » (`edit.unsaved`, by `aria-describedby`).
   Variables `--dzg-pending-mark` (the triangle; default the palette's warning) and `--dzg-pending-bg` (the tint;
   default transparent-mixed warning), in `@dzgrid/theme/forms.css`. Forced colours: the triangle in `CanvasText`.
   A pooled or scrolled cell shows its own mark (painted at each frame, as the save marks).
5. **The API** (`batch.api(grid)`; Angular `ctrl.batch()`, the element `el.grid` + the feature object):
   - `pending()`: the list of `{ key, column, value, previous, row }` — the row key, the column id, the new value, the
     saved value it replaces, the row last seen — in the order first changed.
   - `count`: how many cells are pending.
   - `saveAll()`: sends every pending change **in one save request** (`SaveRequest`, `origin: 'batch'`) to the same
     `save` as `edit({ save })` / Angular `[save]`; resolves `{ sent, refused }` once the application answered.
   - `discardAll()`: every pending change dropped, the saved values shown again; returns how many; said « {n} changes
     discarded » (`edit.discarded`).
   - `discard(key)`: the same for one row's pending changes (`discard(key, column)`: one cell).
6. **Before sending** (`saveAll`), every pending cell is checked again against its column's rules (`required`, `min`,
   `max`, `pattern`, `options`, `validate`, the row as it is now) and the rows against `validateRow` when given
   (`editBatch({ validateRow })`, the same rule as `edit-row.md` 9). Any refusal: **nothing is sent**; the refused
   cells blink as a local refusal, the first one's sentence is said assertively (« Nothing sent: {column}, {reason} »,
   `edit.notSent`), they stay pending, and `saveAll()` resolves `{ sent: 0, refused: [{ key, column, code }] }`.
7. **The answer**: as any save (`edit-save.md` 1–16): accepted, every cell saved (the check for 1.5 s); a rejection
   naming cells (`cells: [{ key, column, reason?, code? }]`) refuses only those — each back to its saved value, the
   « ! » mark, the reason in its description and tooltip, the refused value offered when reopened — the others saved;
   a rejection naming none refuses them all. `saveAll()` resolves with `refused` listing them (code, reason).
8. **While a batch is being saved**, cells keep their « saving » border; a change made meanwhile is pending again (a
   next batch). `saveAll()` with nothing pending resolves `{ sent: 0, refused: [] }` at once and sends nothing.
9. **Undo and redo** (`edit-undo.md`) work across pending changes: Ctrl+Z gives the last gesture back (a pending
   change undone to its saved value leaves the list); after `saveAll()` the history stays, and an undo makes a new
   pending change. `discardAll()` and `discard()` are not undoable and leave nothing to redo for those cells.
10. **Rows that move or leave**: a pending change is kept by row key and column, never by position. Sorted, filtered,
    grouped away, scrolled, on another page of a server source, its row out of the rows held: kept, and shown again
    when the row comes back (a server source sorts and filters by the values it holds — the saved ones). A row the
    application **removes** from its own rows (`rows`, a transaction): its pending changes go with it (as a save in
    flight's, `edit-save.md` 21). A row **replaced** with the same key: kept, shown over the new row.
11. **Paste and fill** (`range-selection.md`, `clipboard.md`, `fill.md`; owner 2026-11-21: no « Save all » for them
    unless the application asks): by default a paste (and a cut) and a fill (the handle, Ctrl+D / Ctrl+R, the fill's
    API) are **saved at once**, as without the batch — one request each (`origin: 'paste'`, `'cut'`, `'fill'`), refusals
    as `edit-save.md`; they never become pending, `count` and `pendingChange` do not move. `editBatch({ paste:
    'pending' })` (paste and cut) and `editBatch({ fill: 'pending' })` keep them instead: one gesture of pending changes
    (one undo). Ctrl/Cmd+Enter in a block (`fill.md` 17) is typed: pending. **A paste or fill saved at once over a
    pending cell**: the saved value wins — the request carries it with `previous` the saved value, the cell's pending
    change is dropped (`count` and `pendingChange` move) and said politely (« {n} changes discarded », after the
    gesture's own sentence); the other pending cells stay. An undo of such a gesture is a change like any other (9):
    pending — it gives back what the cells showed before, a dropped pending value included. The copy of a block copies
    what the cells show (pending values included).
12. **Leaving with changes**: the grid never opens a browser dialog. It tells `pendingChange` (`{ count }`) each time
    the count changes — Angular `(pendingChange)`, the element `dzg-pending-change` — and `count` is there to read: the
    application warns (its own `beforeunload`, a route guard). `reload()` and a server refresh keep the pending
    changes. Destroying the grid drops them (as today's waiting saves); a `saveAll()` not answered yet then resolves
    (`{ sent, refused: [] }`, the answer ignored), never left hanging.
13. **Accessibility**: the mark is a shape and a description; saving says « Saving » once per request; refusals as
    `edit-save.md`; a discard is said politely. Right to left: the triangle at the inline-start corner (right in Arabic).

## Texts (`@dzgrid/dom/locales/<lang>-forms`)
| Key | en | fr | ar |
|---|---|---|---|
| `edit.unsaved` | Not saved | Non enregistré | غير محفوظ |
| `edit.discarded` | {n} changes discarded | {n} modifications abandonnées | أُلغيت {n} من التعديلات |
| `edit.notSent` | Nothing sent: {column}, {reason} | Rien n'est envoyé : {column}, {reason} | لم يُرسل شيء: {column}، {reason} |

## Choices (owner 2026-11-21 ★ and this sheet)
- The pending changes live in the grid (Q-G2 A); the application draws the buttons.
- A separate feature in its own entry (size rule: new code in opt-in entries), rather than a flag of `edit()`.
- Kept by row key across paging, sorting and filtering (★); dropped with a row the application removes.
- All or nothing before sending: a local refusal sends nothing (no half-saved form).
- A paste and a fill saved at once by default (owner 2026-11-21); `paste` / `fill: 'pending'` to keep them; over a
  pending cell the saved value wins (★).
- Refusals from the application as today: back to the saved value, the refused value offered when reopened.

Tests: `packages/dom/test/edit-batch.test.ts`, `packages/dom/test/edit-batch-bulk.test.ts`, `packages/core/test/edit-batch.test.ts` (by hand);
`scripts/browser-1-15.mjs --only batch` (Chrome, Firefox, WebKit; en / ar; light / dark).
