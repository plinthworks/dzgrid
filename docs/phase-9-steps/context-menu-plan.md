# Context menu plan: the body cells' menu (Phase 9, started on its own)

Sources: ARCHITECTURE §6 « Phase 9 » (l. 1870–1873: « menu contextuel », exit criterion « menu contextuel au clavier »;
depends on P5, P6, S7, S8), K.6 rank 7, « Ajustements après la Phase 0 » §3.8 (menu « Copier » by `clipboard.write`,
« Coller » by `readText`, « utilisez Ctrl+V » when refused); `docs/behaviors/column-menu.md` (rules 4, 7, 17–24, « As
built », « Item content »; its open choice 3 sent the cells' menu to Phase 9); `clipboard.md` 3; `range-selection.md`,
`fill.md` 16 + 26, `edit-undo.md` 1–3, `csv-export.md`, `tree-view.md`, `pinned-rows.md` 8b-2; `packages/dom/src/
{column-menu,popup,range,fill,edit,export,pinned-rows,tree}/…`, `interact/select.ts`, `range/pointer.ts`, `part.ts`
(`SlotContext['menuItem']`), Angular `componentPart` / `dzgPart`; `npm run check:size` run on 2026-11-02. The behaviour
seen in other grids (a right-click on a cell offering copy, paste, export) is named, nothing read (CLEANROOM.md).
Plan only; nothing coded. Sheet → tests first (red) → code → review → gate.

## 0. Dependency verdict
**No unbuilt work is needed.** Phase 9 depends on P5 (edit, range, clipboard, fill, undo: done), P6 (column menu,
popup, pinned rows, parts: done), S7 / S8 (spikes: done). Grouping (P7) and server-side rows (P8) only *add* to it
later, and the menu is written so they slot in without change:
- P7 group rows are not data rows (`isDataKey` false): the menu does not open on them in this step (the browser's
  menu, as on a filler). P7 adds its own items (« Regrouper par… », open / close a group) through the same `use` seam.
- P8 loading rows: same as today's filler and loading rows (no menu). A block over rows not loaded copies what
  `range.copy()` copies today (P5's rule, unchanged).
- The Excel item comes with P9's `core/xlsx` (one more `use.xlsx`); CSV is the only export now.

## 1. Facts that shape the plan
- **The column menu is most of the work already.** `column-menu/index.ts` (458 lines) holds two halves: (a) what is
  the column's (its defaults, the ⋮ button, header keys, `decorateHeader`), (b) a generic APG menu: `draw` (roles,
  radio groups, separators, icon, keys hint, `menuItem` parts in an `inert` / `aria-hidden` span), `go` (roving focus,
  wrap), `key` (arrows, Home / End, Enter / Space, Tab, type-ahead folded as the quick search), `run` (act, keep open,
  redraw, report a throw), `back` (focus to where it was, else the grid's own), `open` in `popupsFor(g)` (top layer,
  `dir`, `from` a point or an element, `fit`), the `contextmenu` « once only » + the Mac click swallow. Half (b) is
  ≈ 55 % of the entry (4 297 B gz). **It moves to one shared module**; both menus use it.
- **Where shared code lives**: `@dzgrid/dom/internal` (step 17) is « what the feature entries share, so a page with
  several loads it once »; every feature line counts it as external. The menu list goes there (§3). The K.8 profile
  imports `internal` through filters / search / pagination: it must stay unchanged by tree-shaking (verified, §7).
- **Pointer facts** (read in the code): a block survives a right-click today (`range/pointer.ts:108`: only
  `button === 0` presses). But **a Mac's Ctrl+click is a `button 0` press**: it drops the block and starts a press
  before the `contextmenu` comes. A 2-line guard in `range/pointer.ts` (`g.mac && e.ctrlKey` → not a block press).
  `interact/select.ts` toggles rows with Cmd on a Mac, Ctrl elsewhere: a Mac's Ctrl+click never ticks (unchanged).
- **A right-click's native focus** differs by engine (Chrome and WebKit focus the cell on a right press, Firefox
  too but after `mousedown`). We prevent the press's default on a body cell (as the column menu does on headers) and
  set the focus ourselves: one behaviour in three engines.
- **Clipboard from a menu** (S7 decision 4, `clipboard.md` 3): `range.copy()` / `cut()` / `paste(text, html)` exist,
  « never the system clipboard ». The menu adds the system part: `navigator.clipboard.write` (text/plain + text/html,
  a `ClipboardItem`; `writeText` where `ClipboardItem` is missing: Firefox < 127) and `readText`. All three engines
  ask for a user gesture: the call is made synchronously inside the item's click / keydown, before any `await`.
  Refused, missing (Firefox 120–124 has no `readText`; an insecure page has no `navigator.clipboard`): one sentence
  « Utilisez Ctrl+V pour coller » (⌘V on a Mac), the same for copy. Safari and Firefox ≥ 125 show their own small
  « Coller » bubble on `readText`: that is the browser's, not ours.
- **Cut must not lose data**: `range.cut()` clears the cells at once. From the menu: write the copy to the clipboard
  first, then clear (`cut()`) only if the write succeeded **and** the block is still the same (keys compared).
- **Feature reach**: as the column menu, the menu reaches the other features through `use: { … }` objects and their
  `api(grid)` only (typed, never imported: an app ships only what it uses). Missing today: the tree has no `api`
  (its toggle and sentence are private), the fill does not say its `along`. Both gain a few bytes (§6).
- **Pinned rows** are the application's rows (`pinnedRows({ top, bottom })`, `api.set/get`), in their own key space
  (`p:t:` / `p:b:`): the same row may sit in a band and in the body. « Pin the row » is Q-CM3.
- **Bytes now** (gz, 2026-11-02): `column-menu` 4 297 / 4 300; `internal` 1 201 / 1 250; `popup` 1 626 / 1 650;
  `tree` 4 069 / 4 080; `fill` 3 143 / 3 150; `range` 5 037 / 5 200; `pinned-rows` 2 158 / 2 300; `edit` 4 150 / 4 150;
  `export` 1 200 / 1 350; base 22 432 / 22 440; K.8 85 287 / 90 000; Angular 7 436 / 7 450; `columns.css` 1 111 / 1 200.

## 2. API — `@dzgrid/dom/context-menu`
```ts
import { contextMenu } from '@dzgrid/dom/context-menu';
import { FR_CONTEXT_MENU } from '@dzgrid/dom/locales/fr-context-menu';
import '@dzgrid/theme/menu.css';
const blocks = range(); const fills = fill(blocks); const edits = edit({ save }); const csv = csvExport();
createGrid(host, { …, features: [blocks, fills, edits, csv, contextMenu({ use: { range: blocks, fill: fills, edit: edits, csv } })] });

export interface ContextMenuOptions<T = unknown> {
  /** The features the default items drive, through their `api(grid)` only. Absent: their items are absent. */
  readonly use?: {
    readonly range?: { api(g: Grid): RangeApiLike | null };   // Copy, Copy with headers, Cut, Paste
    readonly fill?: { api(g: Grid): FillApiLike | null };     // Fill down / Fill right, per `along`
    readonly edit?: { api(g: Grid): EditApiLike | null };     // Undo / Redo; Cut and Paste need it too
    readonly csv?: { run(scope?: 'displayed'): Promise<unknown> };  // Export CSV
    readonly tree?: { api(g: Grid): TreeApiLike | null };     // Expand / Collapse on a parent row
    readonly pinned?: { api(g: Grid): PinnedRowsApiLike<T> | null };  // Pin / Unpin (Q-CM3)
  };
  /** The application's items: the defaults kept, reordered, removed or added to. A throw: the defaults, reported. */
  readonly items?: (c: CellMenuContext<T>, defaults: readonly MenuEntry<CellMenuContext<T>>[]) => readonly MenuEntry<CellMenuContext<T>>[];
  readonly classes?: { readonly menu?: string; readonly item?: string };
  /** Told after « Épingler » / « Désépingler » changed a band (Q-CM3 A): the app keeps its pinned rows. */
  readonly onPin?: (rows: { readonly top: readonly T[]; readonly bottom: readonly T[] }) => void;
}
export interface CellMenuContext<T = unknown> {
  readonly row: T;                      // the data row (a band's row too)
  readonly key: RowKey;
  readonly column: ResolvedColumn<T>;
  readonly value: unknown;              // as the grid reads it (edit overlay applied), not formatted
  readonly block: CellRange | null;     // the block the menu acts on, null: the cell alone
  readonly band: 'top' | 'bottom' | null;
  readonly kernel: GridKernel<T, any>;
  readonly grid: Grid;
  say(text: string): void;              // a sentence for the live region
}
export interface ContextMenuApi {
  /** Opens on a shown data cell (an app's own button, a long press of its own: Q-CM1); false when it cannot. */
  open(at: { readonly row: RowKey; readonly column: string }, point?: { readonly x: number; readonly y: number }): boolean;
  close(): void;
  current(): { readonly row: RowKey; readonly column: string } | null;
}
```
- **Items** are the column menu's `MenuItem` (one type, shared): `id`, `label`, `icon` (a class), `disabled`, `kind`
  (`item` / `radio` / `check`), `group`, `checked`, `keys` (the shortcut hint and `aria-keyshortcuts`), `keepOpen`,
  `part` (slot `menuItem`), `action(c)`, and **new** `submenu?: readonly MenuEntry[]`; `{ separator: true }` between.
  `MenuItem` / `MenuEntry` / `MenuContext` gain a type parameter with today's type as its default (`MenuItem<C =
  MenuContext>`): the column menu's public types read the same; `check:api` is run, and if it reports a change the
  owner accepts it (`scripts/api.mjs --accept`; nothing removed or narrowed).
- **Submenus** (new in the shared list, so the column menu's app items get them too, 0 extra API): an item with
  `submenu` has `aria-haspopup="menu"`, `aria-expanded`; it opens beside it toward the **inline end** (a second popup
  `placement: 'inline-end'`, flipped when there is no room), on the forward arrow (ArrowRight; **ArrowLeft in
  Arabic**), Enter, Space, a click, or a hover of 300 ms; the back arrow or Escape closes it alone and the focus goes
  back to its item; an item inside acts and closes the whole menu. Any depth works; the sheet advises one level.
  Its `action` is ignored (APG: a submenu item only opens).
- **Angular**: nothing new in the wrapper. `contextMenu()` goes in `[features]`; an item's content by an Angular
  template (`<ng-template dzgPart="mine" [slot]="'menuItem'" let-c>`) or a component (`componentPart('menuItem',
  MyItem)`), named in `items` (`{ …, part: 'mine' }`). `SlotContext['menuItem']` gains `row?: unknown` and `menu?:
  'column' | 'cell'` (additive; `column` stays, the cell's column).

## 3. Shared code (no duplication)
- **`packages/dom/src/menu/list.ts`** (new, exported by `@dzgrid/dom/internal` as `menuList`, not public): half (b)
  of §1 moved **as is** from `column-menu/index.ts`, plus submenus and « one menu per grid »: a `WeakMap` by kernel
  holds the open menu of either feature, so a cell menu closes a column menu and back (column-menu.md 6, now across
  both). Signature: `menuList(g, { classes }) → { open(anchor, entries, ctx, { from, align, label }), close(still?),
  current() }`; the caller gives the entries and a `back` rule.
- **`packages/dom/src/menu/types.ts`**: `MenuItem`, `MenuEntry`, `MenuContext` (type only, 0 B), re-exported by both
  entries under the same names.
- **`column-menu/index.ts`** keeps only its own half (defaults, button, header keys, `contextmenu` on headers,
  `decorateHeader`, `afterRows`) over `menuList`. **Its tests do not change**: they are the guard of the move
  (`column-menu*.test.ts`, `column-menu-item-part`, `column-menu-block`, Angular `menu-template`).
- **`popup.ts`**: `PopupOptions.parent?: PopupRef` — a press inside a child popup does not close its parent; closing
  the parent closes its children. (+≈ 30 B.)
- **Theme**: the menu rules move from `columns.scss` to a partial `_menu.scss`, `@use`d by `columns.scss` (its output
  unchanged: apps importing `columns.css` see no change) and by a new `menu.scss` → `@dzgrid/theme/menu.css`
  (+ `menu.unlayered.css`), with the submenu's mark (a chevron toward the inline end, `scaleX(-1)` in RTL, as the tree's).
- **Opening rules shared** with the column menu (one helper `menuKeys(e)` in the list): Shift+F10, the ContextMenu
  key (Fn+Shift+F10 on a Mac), the « made by a key: at 0, 0 » test (`pointOf`), the « once only » swallow of the
  `contextmenu` a key also sends, the Mac Ctrl+click's trailing click swallowed, Shift+right-click kept for the
  browser (O11).

## 4. Behaviour (new sheet `docs/behaviors/context-menu.md`, written before the code)
**Opening** (body cells and the pinned bands' cells; never in a nested grid's cells: `closest('.dzg') === el.root`)
1. A right-click on a data cell; **Shift+F10** or the **ContextMenu key** on a focused data cell; on a Mac,
   **Ctrl+click** and VoiceOver's **VO+Shift+M** (both reach the page as `contextmenu`); `api.open(at, point?)`.
   Shift+right-click: the browser's menu (as O11). One menu per grid, column menu included.
2. **Not** on: header cells, group headers, the floating filter row (the column menu keeps the headers; without it,
   the browser's menu, as today); a detail panel's content, a filler / loading / group row (browser's menu); **an
   open editor's field** (the browser's own menu, with its spelling and paste; we never prevent it); while an editor
   stays open after the press (its refusal kept it): nothing of ours, the browser's menu. A right-click on another
   cell while an editor is open: the editor's usual blur rule runs first (it commits or keeps the field); the menu
   opens only if the field closed.
3. **Touch** (Q-CM1, recommended A): a long press with a finger or a pen opens **nothing of ours** (the `contextmenu`
   of `pointerType` `touch` / `pen` is left alone). Why: iOS Safari never sends it, Android Chrome does after a press
   that also starts the text selection and the scroll; a finger never makes a block (range.md: the mouse only); one
   behaviour on every phone is better than one on half of them. The app may offer a ⋮ per row that calls `api.open`.
4. **Nothing to offer** (Q-CM2, recommended A): when the defaults (features absent or none applicable) and the app's
   `items` give no item, the event is not prevented: **the browser's menu shows**, as without the feature.

**The block** (owner's rule)
5. A press **inside the current block** (its box, by row keys and visible columns; a merged cell counts by the row
   under the pointer, `g.spans.at(e)`): the press's default is prevented, the block and the focus stay; the menu acts
   on the whole block. A press **outside** it: the focus moves to that cell first (`focus.set`, source `user`; the
   block dropped, as a left click would), then the menu acts on that cell alone. By the keys: always the focused cell,
   which is inside the block when there is one (the block's focus corner): the menu acts on the block.
6. `CellMenuContext.block` is the block acted on (or null), `row` / `column` / `value` the cell pressed (or focused).

**Default items** (in this order, separators between sections; **absent** when their feature is absent, **disabled**
when they cannot act now; each one does exactly what its key does, source `user`, with the key's sentence)
7. Clipboard (`use.range`): « Copier » (Ctrl+C / ⌘C), « Copier avec les en-têtes » (`copy({ headers: true })`),
   « Couper » (Ctrl+X; present only with `use.edit`; disabled when no cell of the block is editable or `canCopy`
   refuses), « Coller » (Ctrl+V; present only with `use.edit`; disabled when the target cell is read-only). System
   clipboard as §1; a refusal: « Utilisez Ctrl+V pour coller » / « Utilisez Ctrl+C pour copier » (⌘ on a Mac).
8. Fill (`use.fill` + `use.range`): « Recopier vers le bas » (Ctrl+D), « Recopier vers la droite » (Ctrl+R; « vers la
   gauche » meaning in Arabic, the column menu's wording). With `fill({ along: 'row' })` « vers le bas » is
   **absent**, with `'column'` « vers la droite » is absent (the fill api now says its `along`). Disabled as the keys
   are not taken (nothing to fill).
9. Undo (`use.edit`): « Annuler » (Ctrl+Z / ⌘Z), « Rétablir » (Ctrl+Y / ⇧⌘Z), disabled when `!canUndo` / `!canRedo`.
10. Tree (`use.tree`), on a parent row only: « Déplier » or « Replier » (one item, by its state), through the tree's
    own toggle (its sentence, its `fixedOpen` rule: a fixed-open row shows no item). Leaves: absent.
11. Pinned rows (`use.pinned`; Q-CM3, recommended A): on a body row « Épingler en haut », « Épingler en bas »
    (disabled when that id is already in that band); on a band's row « Désépingler ». The row is **copied** to the
    band (it stays in the body) through `pinned.api(g).set(…)`, then the app is told by a new option
    `contextMenu({ onPin(rows: { top: T[]; bottom: T[] }) })` so it can keep them (its `pinnedRows` stays the source).
    Sentences `cmenu.pinnedTop`, `cmenu.pinnedBottom`, `cmenu.unpinned`.
12. Export (`use.csv`): « Exporter en CSV » (the displayed rows, as the export feature's own button: its progress
    and sentences).
13. Then the application's items (`items(ctx, defaults)`: may filter, reorder, add, give submenus and parts). A
    throwing `items` or `action`: reported (`reportError`), the defaults shown / the menu closed (column menu rule 17).

**Inside the menu and after** (the shared list: column-menu.md 18–22, unchanged)
14. ArrowDown / ArrowUp wrap, Home / End, type-ahead, Enter / Space act, disabled items focusable and inert, Tab and
    Escape close. Submenus as §2 (forward arrow mirrored in Arabic).
15. Placement: by a pointer, its start corner 2 px under the pointer (leftward in Arabic); by the keys, under the
    focused cell, start edges aligned, flipped above without room; kept inside the window, scrolling inside. Top
    layer: never clipped by a host's `overflow` or `transform`.
16. After an item, or Escape: the focus back on the grid's focused cell (the block intact unless the item changed
    it); an item that hands the focus on (the export's dialog, if any) keeps it. Opening says nothing (the reader
    says « menu » and its first item).
17. Closes on its own when its row leaves the displayed rows or its column is hidden, the direction or language
    changes, the grid is destroyed, a sort / filter changes the rows (no focus moved then).

## 5. Texts — `locales/{en,fr,ar}-context-menu` (`CONTEXT_MENU_KEYS`; a missing key: `TypeError` at setup, as the column menu)
| Key | en | fr | ar |
|---|---|---|---|
| `cmenu.label` | Cell menu | Menu de la cellule | قائمة الخلية |
| `cmenu.copy` | Copy | Copier | نسخ |
| `cmenu.copyHeaders` | Copy with headers | Copier avec les en-têtes | نسخ مع العناوين |
| `cmenu.cut` | Cut | Couper | قص |
| `cmenu.paste` | Paste | Coller | لصق |
| `cmenu.useCopyKey` | Use {keys} to copy | Utilisez {keys} pour copier | استخدم {keys} للنسخ |
| `cmenu.usePasteKey` | Use {keys} to paste | Utilisez {keys} pour coller | استخدم {keys} للصق |
| `cmenu.fillDown` | Fill down | Recopier vers le bas | نسخ نحو الأسفل |
| `cmenu.fillEnd` | Fill right | Recopier vers la droite | نسخ نحو اليسار |
| `cmenu.undo` | Undo | Annuler | تراجع |
| `cmenu.redo` | Redo | Rétablir | إعادة |
| `cmenu.expand` | Expand | Déplier | توسيع |
| `cmenu.collapse` | Collapse | Replier | طي |
| `cmenu.pinTop` | Pin to the top | Épingler en haut | تثبيت في الأعلى |
| `cmenu.pinBottom` | Pin to the bottom | Épingler en bas | تثبيت في الأسفل |
| `cmenu.unpin` | Unpin | Désépingler | إلغاء التثبيت |
| `cmenu.pinnedTop` | Row pinned to the top | Ligne épinglée en haut | ثُبّت الصف في الأعلى |
| `cmenu.pinnedBottom` | Row pinned to the bottom | Ligne épinglée en bas | ثُبّت الصف في الأسفل |
| `cmenu.unpinned` | Row unpinned | Ligne désépinglée | أُلغي تثبيت الصف |
| `cmenu.exportCsv` | Export to CSV | Exporter en CSV | تصدير CSV |
| `cmenu.submenu` | {label}, submenu | {label}, sous-menu | {label}، قائمة فرعية |

Copied / cut / pasted sentences: the range's own (`range.copied` …), already in the app's range texts. `{keys}` is
`Ctrl+V` / `⌘V` by the platform. The Arabic is reviewed by the owner (as the column menu's). A column name is
isolated (`<bdi>`) where it appears. The fr fill texts are the column menu's (one wording).

## 6. Files
New: `packages/dom/src/context-menu.ts` (entry: `contextMenu`, `CONTEXT_MENU_KEYS`, types), `context-menu/index.ts`
(defaults, opening, block rule, clipboard), `menu/list.ts`, `menu/types.ts`, `locales/{en,fr,ar}-context-menu.ts`,
`packages/theme/{_menu,menu}.scss` → `menu.css` + `menu.unlayered.css`, `docs/behaviors/context-menu.md`,
`scripts/browser-context-menu.mjs`.
Changed: `column-menu/index.ts` (onto `menuList`), `internal.ts` (export `menuList`), `popup.ts` (`parent`),
`range/pointer.ts` (Mac Ctrl press), `tree/index.ts` (`tree()` returns a `TreeFeature` with `api(grid)`: `state(key)`
`'open' | 'closed' | 'fixed' | null`, `toggle(key, open?)` said as a click), `fill/index.ts` (`FillApi.along`),
`part.ts` (`menuItem` context `row?`, `menu?`), `part-texts.ts` (`ContextMenuMessageKey`), `columns.scss`
(`@use '_menu'`), `packages/dom/package.json` + `scripts/build.mjs` (entry and locales), `size-budget.json`,
`api/*.api.txt` (after `check:api`), `docs/a11y-protocol.md` (a section: VO+Shift+M, NVDA / JAWS Shift+F10,
TalkBack: no menu), `column-menu.md` (« As built »: the shared list, submenus, one menu across both), playground
`orders-edit.html` (the feature wired; no new page).

## 7. Bytes (gz; estimates, measured at the end on minified code, never asserted)
| Budget | Now / line | After (est.) | Verdict |
|---|---|---|---|
| `@dzgrid/dom/context-menu` (new, over popup, `internal` external) | — | ≈ 1 900 | **new line 2 100** |
| `@dzgrid/dom/internal` (gets `menuList` + submenus) | 1 201 / 1 250 | ≈ 3 550 | **raise → 3 700** |
| `@dzgrid/dom/column-menu` (its half only) | 4 297 / 4 300 | ≈ 2 200 | fits; line lowered to measure + 10 % at the end |
| `@dzgrid/dom/popup` (`parent`) | 1 626 / 1 650 | ≈ 1 660 | **raise → 1 700** |
| `@dzgrid/dom/tree` (`api`) | 4 069 / 4 080 | ≈ 4 120 | **raise → 4 150** |
| `@dzgrid/dom/fill` (`along` read) | 3 143 / 3 150 | ≈ 3 155 | **raise → 3 200** |
| `@dzgrid/dom/range` (Mac Ctrl press) | 5 037 / 5 200 | ≈ 5 050 | fits |
| `locales/{en,fr,ar}-context-menu` (new) | — | ≈ 300 / 350 / 420 | **new lines 350 / 400 / 500** |
| `@dzgrid/theme/menu.css` (new) | — | ≈ 450 | **new line 500**; `columns.css` unchanged |
| base `@dzgrid/dom`, core, edit, export, pinned-rows, Angular | — | 0 | unchanged |
| K.8 audit profile (imports `internal` via filters / search / pagination) | 85 287 / 90 000 | 85 287 ± 10 | must not move: `menuList` tree-shaken. If it moves, `menuList` becomes its own entry `@dzgrid/dom/menu` instead (same code, own line) |
What an app pays: **context menu alone ≈ 4 250 B** (its line + the shared list); **with the column menu already
there ≈ 1 900 B** (the list is shared). A recorded line « profile: both menus » (`files`: both entries, `maxGzip: null`)
shows the sharing. Stop rule: past an owner-granted line, stop and ask; never raise a line alone (Q-CM4).

## 8. Tests first (red), values written by hand; support: `support-range`, `support-edit`, `stubMedia`, a fake
`navigator.clipboard` (resolving, rejecting, missing)
**`packages/dom/test/context-menu.test.ts`** (opening)
1. Right-click on a body cell: one `role="menu"` named « Menu de la cellule », first item focused, `contextmenu`
   prevented; Shift+right-click: not prevented, no menu.
2. Shift+F10 and the ContextMenu key on a focused cell: one menu; the `contextmenu` the key also sends is swallowed
   (one menu, never two); placed under the cell (by `from` = cell).
3. Mac (`mac: true`): a `button 0` press with `ctrlKey` keeps the block (planted fault: the `range/pointer.ts` guard
   removed turns it red), then `contextmenu` opens; the trailing click is swallowed (no row ticked, no sort).
4. Not opened: header cell (the column menu's instead when present; with neither: not prevented); floating filter
   row; detail panel; filler; a nested grid's cell (the inner grid's menu, never the outer's); inside an open editor's
   field (not prevented); `pointerType: 'touch'` and `'pen'` (not prevented, Q-CM1 A).
5. Nothing to offer (no `use`, no `items`, or `items` returning `[]`): not prevented, no popup (Q-CM2 A).
6. One menu per grid: a cell menu open, a header right-click → the column menu, the cell menu closed; and back.
**`context-menu-block.test.ts`**
7. Block B2:D4, right-click on C3: block and focus unchanged, `ctx.block` = B2:D4, « Copier » copies 3 × 3.
8. Same block, right-click on F7: focus on F7, block dropped, « Copier » copies F7 alone.
9. Merged cell spanning rows 2–4 inside the block: inside. Pinned band cell outside the body block: outside.
10. RTL: same as 7–8 with `dir: 'rtl'` (the box is logical; a pixel-based hit test planted fails it).
**`context-menu-items.test.ts`** (defaults by features; one grid per case)
11. range only: Copy, Copy with headers; no Cut / Paste / Fill / Undo / Export / tree / pin items.
12. range + edit: Cut and Paste present; a read-only target: both disabled (`aria-disabled`, focusable, do nothing).
13. fill `along: 'row'`: no « Recopier vers le bas »; `'column'`: no « vers la droite »; default: both; with keys
    hints `Ctrl+D` / `⌘D`.
14. edit: Undo disabled at start; after one edit enabled, acting says the undo sentence and moves the focus as Ctrl+Z.
15. tree: a parent closed → « Déplier », acting says « Service 1 développé, 3 lignes »; a leaf: absent; a `fixedOpen`
    row: absent.
16. pinned (Q-CM3 A): « Épingler en haut » adds the row to the top band, it stays in the body, sentence; on the band
    row « Désépingler » removes it; « Épingler en haut » disabled when already there.
17. csv: « Exporter en CSV » calls `run('displayed')` once.
18. Section order and separators exactly as §4 (never first, last or doubled).
**`context-menu-clipboard.test.ts`**
19. Copy: `clipboard.write` called once, synchronously inside the click (before any microtask), with text/plain =
    the TSV of `range.copy()` and text/html; sentence `range.copied`. No `ClipboardItem`: `writeText`. Rejected or
    missing: « Utilisez Ctrl+C pour copier » (⌘C with `mac`).
20. Cut: write resolves → cells cleared, one save (origin `cut`); write rejects → **nothing cleared**; block changed
    before the write resolved → nothing cleared.
21. Paste: `readText` resolves → `range.paste(text)` result said; rejects or missing → « Utilisez Ctrl+V pour coller »,
    nothing written.
**`context-menu-app.test.ts`**
22. `items(ctx, defaults)`: ctx has `row`, `key`, `column`, `value` (edit overlay applied), `block`, `band`, `kernel`;
    `[...defaults, { separator: true }, mine]` drawn; `defaults.filter(...)` removes; a throw: defaults + reported.
23. Submenu: `aria-haspopup="menu"`, ArrowRight opens (ArrowLeft in `ar`), focus on its first item, ArrowLeft closes
    back to the parent item, an inner item acts and closes all; a press inside the submenu does not close the parent
    (planted fault: `popup.parent` ignored); Escape in the submenu closes it alone.
24. An item with `part` (slot `menuItem`) draws in an `inert` `aria-hidden` span, the item named by `label`, its
    context has `row` and `menu: 'cell'`.
25. Closing: the row filtered away, the column hidden, `dir` changed, the grid destroyed → closed, no focus moved.
26. Focus back: after « Copier » the focus is on the cell it was on, the block intact.
**Guards that must stay green unchanged**: every `column-menu*.test.ts`, `menu-template` (Angular), `fill-along`,
`tree-*`, `range-*`, `clipboard*`. Angular: `packages/angular/test/context-menu-template.test.ts` (a `dzgPart`
template and a `componentPart('menuItem')` in a cell menu item). Locales: the keys test covers en / fr / ar.
Theme: `menu.css` holds the rules of `columns.css`'s menu (same selectors), contrast script green.

**Browsers** (`scripts/browser-context-menu.mjs`, `npm run browser -- --only context-menu`, the real playground page
`orders-edit.html` on 4700, never restarted):
- **Chrome** (real mouse and keys): right-click in / out of a block (block kept / dropped), Shift+F10, the ContextMenu
  key, Shift+right-click (browser's: not prevented); Copy then a real Ctrl+V in a text field gets the TSV (clipboard
  permissions granted); Paste from the menu writes; fr light and ar dark: the menu from the pointer (leftward in
  Arabic), the submenu toward the inline end; inside a host with `overflow: hidden` + `transform` (top layer); axe 0
  with the menu and a submenu open; forced colours; 320 px and 200 % zoom; every item ≥ 24 px tall; Mac Ctrl+click
  (the machine is a Mac) opens without dropping the block.
- **Firefox**: right-click, Shift+F10 once, Shift+right-click (its own menu, no event), Copy (`writeText` path),
  Paste refused → the sentence; Mac Ctrl+click checked by hand once (headless sends no `contextmenu`: if the real one
  sends none either, the menu opens from the Ctrl press itself — a finding, decided then).
- **WebKit**: right-click, keys, `clipboard.write` inside the gesture, `readText` refused headless → the sentence.
- Manual, scheduled, non-blocking: `docs/a11y-protocol.md` new section (NVDA + Firefox Shift+F10, JAWS + Chrome the
  Menu key, VoiceOver + Safari VO+Shift+M, TalkBack: no menu and the app's button), fr then ar.

## 9. Order of work
1. Sheet `context-menu.md`; owner answers Q-CM1…Q-CM4 written into it.
2. Move half (b) to `menu/list.ts` + `menu/types.ts`, column menu on it; **all column menu tests green, unchanged**;
   `check:size` (K.8 must not move; `internal` and `column-menu` lines measured).
3. Red tests §8 (1–26); `popup.parent`, submenus, `range/pointer.ts` guard, tree `api`, fill `along`.
4. `context-menu/index.ts`, locales, `menu.css`; tests green; Angular test.
5. Browser checks; review (new code); `npm run gate:step`; docs: CHANGELOG `[Unreleased]` « Added », ROADMAP Phase 9
   line, STATUS top line, ARCHITECTURE « Ajustements » (the entry name and the shared list), `column-menu.md` As built.

## 10. Owner questions (simple French)
**Q-CM1 — Appui long au doigt.** Sur téléphone, l'appui long n'ouvre pas notre menu (l'iPhone ne le permet pas, Android
oui : on fait pareil partout). L'app peut mettre son propre bouton ⋮ qui l'ouvre.
- A (recommandé) : pas de menu au doigt. B : appui long sur Android seulement.

**Q-CM2 — Rien à proposer.** Si aucune entrée n'existe (ni l'app ni les fonctions), le clic droit montre le menu
habituel du navigateur.
- A (recommandé) : menu du navigateur. B : rien du tout.

**Q-CM3 — « Épingler la ligne ».**
- A (recommandé) : la ligne est recopiée en haut (ou en bas) et reste aussi dans le tableau ; « Désépingler » l'enlève ;
  l'app est prévenue pour la garder.
- B : la ligne quitte le tableau pendant qu'elle est épinglée (plus long, ≈ +300 o).
- C : pas d'entrée « Épingler » (l'app l'ajoute elle-même si besoin).

**Q-CM4 — Tailles.** Nouveau menu ≈ 1 900 o (+ 2 350 o partagés avec le menu de colonne, qui baisse d'autant).
Hausses : `internal` 1 250 → 3 700, `popup` 1 650 → 1 700, `tree` 4 080 → 4 150, `fill` 3 150 → 3 200 ; nouvelles
lignes `context-menu` 2 100, textes 350 / 400 / 500, `menu.css` 500. L'écran d'audit ne bouge pas. D'accord ?
