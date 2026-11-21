# Form editing (1.15.0) — the plan

Owner 2026-11-21 (« fais-les tous », gap analysis ★ answers, Q-G2 « A »: the pending changes live in the grid). Three
opt-in additions; defaults unchanged. Sheets first: `docs/behaviors/edit-batch.md`, `docs/behaviors/edit-row.md`,
`docs/behaviors/editors.md` 23–29. Sizes: new code in new entries; existing lines +2 %; K.8 ≤ 93 000.

## API

| Item | Entry | Use |
|---|---|---|
| Batch | `@dzgrid/dom/edit-batch` | `const batch = editBatch<Row>({ validateRow? })`; `features: [edit({ save }), editors(), batch]`; `batch.api(grid)` → `{ pending(), count, saveAll(), discardAll(), discard(key, column?) }` |
| Full row | `@dzgrid/dom/editors-row` | `editors({ row: rowEditor, validateRow? })` |
| Searching list | `@dzgrid/dom/editors-search` | column `edit: { search: (text, { signal, row, context }) => Promise \| list \| observable }`; `editors({ search: searchEditor })` |
| Texts | `@dzgrid/dom/locales/<lang>-forms` | `EN_FORMS`, `FR_FORMS`, `AR_FORMS` (the seven keys of the three sheets) |
| Look | `@dzgrid/theme/forms.css` | `--dzg-pending-mark`, `--dzg-pending-bg`, `--dzg-row-editing-outline` |
| Angular | `@dzgrid/angular` | `(pendingChange)`; `DzgController.batch()` |
| Element | `@dzgrid/element` | `dzg-pending-change` (every grid event already re-dispatched); the API through `el.grid` and the feature |

Types added (additions only): `SaveOrigin` gains `'batch'` and `'row'`; `GridEvent` gains `pendingChange`;
`EditChecks.search` (optional); `RowRule`, `RowRefusal`, `PendingChange`, `SaveAllResult`, `EditBatchApi`,
`OptionSearch`; `EditorsOptions.row`, `.search`, `.validateRow` (optional); `EditSeam.x` (optional, internal use).

## How it is built

- **Core seam** (`@dzgrid/core/edit`, +2 %): `createEdits(kernel, { hold: true })` keeps every gesture waiting
  (status `pending`) until a gesture marked to go; an internal handle `x` gives the batch its cells, the waiting
  gestures, the pump, the state events. The batch's logic (list, merge into one gesture `origin: 'batch'`, discard,
  « back to the saved value » pruning) lives in the batch entry. `rulesOf` skips `options` when `search` is given.
- **`edit()`** (+2 %): reads `features` for `edit-batch` and holds; puts the controller on the seam (`x`).
- **`editors()`** (+2 %): kinds `list` also for `search`; hands `open`, the keys, the paint to the row plug when
  given; the plugs receive the editors' internals (field maker, kinds, texts of values, the bubble, the next cell).
- **Base** (K.8): the paint leaves alone every cell of a row being edited (`g.editor.cols`), not only one.
- **Angular** (K.8): one output and one controller method.

## Interactions (each place that recomputes the same thing)

| Place | Batch | Row | Search |
|---|---|---|---|
| Screen | overlay shows pending; mark per paint | fields per mounted cell; draft kept when scrolled out | the cell's own format |
| Undo / redo | across pending; back to saved leaves the list | one gesture per row | as a list pick |
| Rules | re-checked before `saveAll`, `validateRow` | each field, then `validateRow`; all or nothing | `options` skipped |
| Server source | kept by key across page / sort / filter | kept before a page / query change | the `signal` aborts |
| Clipboard / fill | a paste, a fill: saved at once (one request), or one pending gesture with `paste` / `fill: 'pending'`; over a pending cell the saved value wins; copy reads the overlay | — | — |
| Export / print | the overlay (what the cells show), as today's saving values | — | — |
| Leave / reload | `pendingChange`, `count`; reload keeps | — | — |

## Accessibility
Batch: mark = shape + description « Not saved »; discard said politely. Row: opening said with the field count, each
field named, all refused fields `aria-invalid`, the first focused with the bubble, assertive sentence. Search:
APG combobox with list autocomplete, `aria-busy` and the three states said.

## Checks
Tests by hand, failing first (dom, core, Angular, element); `scripts/browser-1-15.mjs` sections `batch`, `row`,
`search` (Chrome, Firefox, WebKit; en / ar; light / dark); site pages (en, fr) with compiled examples; sizes measured.
