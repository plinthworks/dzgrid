# Phase 6, step 3 — the column ⋮ menu (`@dzgrid/dom/column-menu`): the plan

Architect, 2026-10-26, read-only (nothing run, nothing changed but this file). Wins over it: `decisions.md` (Q-M1, Q-M2,
Q-K1, Q-R2, Q-B, « Step 1 follow-ups » O1, O3, O11, C3, C5, Mac; S12-Q12; « Working method »). Sheets: `column-menu.md`
(rules 1–24, cited « M n »), `density.md` (« De n »), `column-resize.md` 8–14, `column-move.md` (« As built »), `fill.md`
19, 21, `filter-ui.md` (popup, Alt+ArrowDown), `range-selection.md` 10, a11y §21 143–148, 150, 156, 161, 166. Clean room:
behaviour from the sheets, WAI-ARIA 1.2 and the APG « menu button » / « menu » patterns only.

**Numbering note**: the brief says the keyboard-resize item comes « at step 6 »; the plan's order (decisions Q-SE + Q-O)
puts the resize mode and auto-size at **step 7** (5 = `core/state`, 6 = `dom/state`). Read « step 7 » below.

## 0. Facts read in the code

1. **Popup host** (`popup.ts`, entry 1 472 / 1 650): top layer, Escape (stops propagation, focus back to the anchor when
   the focus was inside), pointer-down outside closes (the `opener` spared), `sweep()` closes a popup whose anchor left.
   It places only `block-end` / `inline-end` with **start** edges aligned: no « end edge on the button's end edge » (M7),
   no « at the pointer » (right-click), no focus target other than the anchor. A non-modal popup has no role (good: the
   menu puts `role="menu"` on its own list; do **not** pass `label`, an `aria-label` on a role-less div fails axe).
2. **Filters** reach nobody's code: the menu can use the `FeatureHandle.filter` seam already on `g.features`:
   `filter.edits(col, who)` returns `{ canOpen, openFilter() }` per column (side-effect free; `openFilter` =
   `popup.toggle(col, null)`, anchored to `.dzg-fbtn` else the header). **0 B, no import of `/filters`.** C3 per column = `canOpen`.
3. **Alt+ArrowDown**: `filters/menu.ts` listens on `el.header`, opens and `stopPropagation()` only when the column has a
   popup. The base's `keys` seam runs later (root): **a menu taking Alt+ArrowDown in `keys` is order-independent** (the
   filter, when it acts, never lets the key reach it). Nothing in the code handles Shift+F10, `ContextMenu` or `contextmenu`.
4. **`aria-keyshortcuts`** is written today by `filters/menu.ts` alone (`set(cell, 'aria-keyshortcuts', has ? … : null)`):
   a second writer would be wiped each paint (M5). The header loop is `viewport.ts:233-237` (base decorate, then each
   feature's `decorateHeader`, then `aria-label` once).
5. **Header decorations**: `.dzg-sort` (base), `.dzg-fbtn` (filters, CSS `order:1`), `.dzg-reapply` (edit, no `order`:
   so today it is drawn **before** the filter button, against `edit-reapply.md` 4–5 — check in Chrome; fixed by this
   step's CSS, §5). `.dzg-resize` is absolute.
6. **Range** drops the block on a user `focusChanged` (`range/index.ts:201`) and on a plain arrow. A press on a header
   focuses it (native focus on `mousedown`, any button) → **a block never survives opening the menu from a header**
   unless the press is kept from moving the focus. This is the hinge of S12-Q12 (« Recopier » on the current block): §3.
7. **Fill API** (`fill/index.ts:368`): `down()` / `end()` run with source `api` (silent, `fill.md` 19). The menu is a user
   gesture: it needs the `user` path (the sentence). `dom/fill` 2 975 / 3 000.
8. **Core**: `sort.set`, `column.resize` (clamped by the layout, `columnResized`), `column.state` (one `columnsChanged`;
   focus leaves a hidden column). A patch key `undefined` means « unchanged » (`model.ts:159`): **a user width cannot be
   cleared**, so « Réinitialiser » cannot give a flexible or default-width column back exactly (Q3-3). `fold` is in the
   core base (typeahead free). No `setDensity` / `densityChanged` exists (`density.md` 1–2; Q3-4).
9. **Texts**: `locales/*-columns` 162 / 184 / 216 of 500 / 600 / 800. Measured by hand (gzip of the sheet's tables, menu +
   density + two fill items): **≈ 506 / 612 / 680 with the move keys** — over en and fr **before** the chooser (step 4) and
   resize (step 7) texts. Q3-2.
10. `ColumnDef` has `movable`, `resizable`, `sortable`, `minWidth`, `maxWidth`; **not** `hideable`, `menu`: type-only
    additions (0 B). `columns()` exposes `api(grid).move(col, ±1 | 'start' | 'end', { say })` (source `user`).

## 1. API

```ts
// packages/dom/src/column-menu.ts → column-menu/index.ts (pattern of fill(), columns())
export function columnMenu(o?: ColumnMenuOptions): ColumnMenuFeature;

export interface ColumnMenuOptions {
  /** Other features the items drive; type-only imports, so the menu ships none of them. Absent: their items are absent. */
  readonly use?: {
    readonly columns?: { api(grid: Grid): ColumnsApiLike | null };   // move (now); autoSize / autoSizeAll / resizeMode (step 7)
    readonly range?: { api(grid: Grid): { get(): unknown | null } | null };   // is there a block (fill items enabled)
    readonly fill?: { api(grid: Grid): { down(o?: { user?: boolean }): unknown; end(o?: { user?: boolean }): unknown } | null };
    readonly chooser?: { api(grid: Grid): { open(anchor?: HTMLElement): boolean } | null };  // step 4 implements it
  };
  /** The density radio group (C5: off by default; absent when `rowHeight` is a number). Q3-4. */
  readonly density?: boolean;
  /** Told after the density line changed it (Q3-4 A), so the app keeps its own setting in step. */
  readonly onDensity?: (d: 'compact' | 'comfortable' | 'spacious') => void;
  /** The application's actions: reorder, remove or add. A throw: the defaults, reported (g.report), no problem code. */
  readonly items?: (column: ResolvedColumn<unknown>, defaults: readonly MenuEntry[], c: MenuContext) => readonly MenuEntry[];
  /** Host classes (Tailwind / Bootstrap), as `headerClass`: on the list and on every item. */
  readonly classes?: { readonly menu?: string; readonly item?: string };
}
type Grid = { readonly kernel: GridKernel<any, any> };
/** Step 7 adds the optional members; the menu shows « Ajuster… » / « Redimensionner au clavier » when they exist. */
interface ColumnsApiLike { move(c: string, by: -1 | 1, o?: { say?: boolean }): string; autoSize?(ids?: readonly string[]): void; autoSizeAll?(): void; resizeMode?(c: string): boolean }

export type MenuEntry = MenuItem | { readonly separator: true };
export interface MenuItem {
  /** Built-ins: 'sort.asc' 'sort.desc' 'sort.none' 'pin.start' 'pin.end' 'pin.none' 'size.auto' 'size.autoAll' 'size.widen'
   *  'size.narrow' 'size.resize' 'move.start' 'move.end' 'fill.down' 'fill.end' 'filter' 'hide' 'choose' 'reset'
   *  'density.compact' 'density.comfortable' 'density.spacious'. An app's own id is free. */
  readonly id: string;
  readonly label: string;
  /** menuitem (default) / menuitemradio / menuitemcheckbox. Radios of one `group` sit in one `role="group"` (aria-label = group). */
  readonly kind?: 'item' | 'radio' | 'check';
  readonly group?: string;
  readonly checked?: boolean;
  /** Focusable, `aria-disabled="true"`, does nothing (APG). */
  readonly disabled?: boolean;
  /** `aria-keyshortcuts` of the item and a visible hint (« Ctrl+D » / « ⌘D » from `g.mac`). */
  readonly keys?: string;
  /** Stays open after it acts (only « Élargir » / « Rétrécir » among the built-ins). */
  readonly keepOpen?: boolean;
  /** A class for an icon (a shape drawn by the host's CSS); never HTML. */
  readonly icon?: string;
  readonly action?: (c: MenuContext) => void;
}
export interface MenuContext { readonly column: string; readonly grid: Grid; say(text: string): void }

export interface ColumnMenuFeature extends GridFeature {
  api(grid: Grid): { open(column: string): boolean; close(): void; readonly open?: string | null } | null;
}
export const COLUMN_MENU_KEYS: readonly ColumnMenuMessageKey[];   // setup throws TypeError on a missing text (as fill)
```
- New `ColumnDef` fields, type only: `hideable?: false` (« Masquer » disabled), `menu?: false` (no ⋮, no right-click menu,
  keys left to the page). Step 4 adds `chooser?: false`.
- **Seams this step adds** (each measured, §6): (a) base `FeatureHandle.shortcuts?(col): string | void` — the base joins
  every feature's list, dedupes, **sorts** (a fixed order whatever the feature order), writes `aria-keyshortcuts` once (empty:
  removed). Filters moves its `Alt+ArrowDown` there (stops writing); columns declares `Control+Shift+ArrowLeft
  Control+Shift+ArrowRight` (`Meta+…` on a Mac); the menu `Shift+F10` (+ `Alt+ArrowDown` when `!canOpen`); step 7 `Alt+R`.
  (b) `/popup` `PopupOptions.from?: HTMLElement | { x: number; y: number }` (what it is placed by; the anchor still owns its
  life, sweep and opener), `align?: 'end'` (end edges aligned; a point: its start corner there), `back?: () => void` (where
  the focus goes on close; default the anchor). (c) `fill` API `down(o?) / end(o?)` with `{ user: true }`: source `user`,
  the key's sentence (Q3-1). (d) core `ColumnState.width: null` clears the user width (Q3-3 A only).

## 2. Opening (M1–M7, Q-M2, Q-K1, C3, O11, Mac)

| Way | Rule |
|---|---|
| ⋮ button | `<button class="dzg-mbtn" tabindex=-1 aria-haspopup="menu" aria-expanded>` named `menu.button {column}`, added in `decorateHeader` on level-0 column headers only (not groups, `.dzg-hextra`, `menu: false`), **not drawn when the column's core width < 96** (`widthOf`, no layout read; M2a). Inserted **before** `.dzg-reapply` when present, else appended. Its press: `preventDefault` on `mousedown` (the grid focus does not move, §3); click toggles; never sorts (`header-click.ts` ignores `.dzg-mbtn`: via INTERACTIVE or `closest`, check), never arms a drag (columns' INTERACTIVE). |
| right-click | `contextmenu` on `g.el.root` whose target's `.dzg-hcell:not(.dzg-hgroup,.dzg-hextra)` belongs to this grid (`closest('.dzg') === root`: nested grids). `shiftKey` → left to the browser (O11). Else `preventDefault`, open at the pointer. `mousedown` button 2 on a header: `preventDefault` (no focus move, §3). |
| Mac Ctrl+click, VO+Shift+M | both arrive as `contextmenu` → as right-click (pointer: at the pointer; `clientX/Y` both 0 = keyboard-made: under the header). The click Chrome/Safari may send after a Ctrl+click is swallowed (set on `contextmenu`, cleared at the next press or end of task, as columns' swallow). |
| Shift+F10, `ContextMenu` key (Fn+Shift+F10) | `keys` seam, owner `header`, level 0, no Alt/Ctrl/Meta: open under the header (button end edge, or the cell's end edge when no button). A `contextmenu` that follows (Windows fires it on keyup; some engines on keydown) finds the menu open for that column, or its target inside the menu: `preventDefault` only, **never** reopened, **never** the O11 exception inside the menu. |
| Alt+ArrowDown | `keys` seam, owner `header`, no Ctrl/Meta/Shift, column `!canOpen` (or no filters feature): open. With a popup the filter took it before (fact 3). |
| `api(grid).open(column)` | as a key. |

Common: column outside the column window, `menu: false`, `g.editor` open → not opened (key left unhandled). One menu per
grid: opening closes the previous one (a filter popup is modal: no header key or press reaches the menu while it is open). Focus goes to the first **enabled-or-not** item
(APG: first item). `aria-expanded` on the button and `data-dzg-menu` on the header (keeps ⋮ visible) while open.
Placement (popup `from` / `align`): by button or key, under the header, **end edges aligned**, flipped above when no room;
by pointer, start corner at the pointer; `max-block-size: 100dvh − 16px`, scrolls inside (320 px, 200 %). **Never moved
while open** (Élargir changes the header under it; a menu that slides under the pointer breaks repeated clicks); closed
by the paint when its column leaves (hidden, gone, out of the window), `g.dir` or `g.ctx` changes, new definitions drop
the column, or the grid goes (M24; no focus moved on destroy).

## 3. Focus and the block (M20, M22; S12-Q12; Q3-1)

- **Opened by keys**: the focus was on the header: Escape / Tab / Shift+Tab / an item → back to that header (`back` =
  the header; after hide, move, pin: `g.restoreFocus()`, the kernel having moved the focus off a hidden column, or kept it on
  the moved one).
- **Opened by a pointer** (⋮ press, right-click, Ctrl+click): the press does **not** move the grid's focus (`mousedown`
  prevented), so a block of cells survives. On close: `back` = `g.restoreFocus()` (the grid's own focus: the block's cell,
  or the header if it was there, or nothing focused before → the header). This keeps the block for « Recopier vers le bas /
  la droite » (S12-Q12: the ≥ 24 px pointer path) and for Escape. Sheet M20/M22 to be amended (« the focus goes back where
  it was; the header when the menu was opened from it »). Q3-1.
- « Filtrer… » / « Choisir les colonnes… »: the menu closes without moving the focus (`back` no-op), then the opened
  dialog takes it; its own close returns to its anchor (the header's filter button or the header).
- Tab never leaves to the page: Tab / Shift+Tab close (M20, choice 1), `preventDefault`.

## 4. Items, in this order (M8–M17; separators between sections; absent when its feature is absent, disabled when it cannot act)

| Section | Items (id) | Act (source `user`) | Absent / disabled |
|---|---|---|---|
| Sort (radio, group `menu.sortGroup`?) | sort.asc / desc / none | `sort.set [{col, dir}]` (the whole sort replaced, M8); none: this column removed, others kept | absent `sortable: false`; checked = this column's dir, none when unsorted |
| Pin (radio) | pin.start / end / none | one `column.state [{id, pinned}]` + `menu.pinnedStart/End/unpinned` | disabled `movable: false` (O3) |
| Size | size.auto, size.autoAll, size.widen, size.narrow, size.resize | auto*/resize via `use.columns` step-7 members; widen/narrow: `column.resize` ±10 finished `true`, **menu stays open**, `menu.width {column} {n}` after a 400 ms pause (one sentence) | auto/resize absent until step 7 members exist; widen/narrow absent `resizable: false`, disabled at max / min (the layout's clamp) |
| Move | move.start / end | `use.columns.api(g).move(col, −1 / +1, { say: true })` (`move.placed` / `move.edge`) | absent without `use.columns`; disabled at the segment edge and `movable: false` |
| Fill (S12-Q12) | fill.down « Recopier vers le bas », fill.end « Recopier vers la droite » (keys `Control+D` / `Control+R`, Mac `Meta+…`; hint text from `g.mac`) | `use.fill.api(g).down({ user: true })` / `end(…)`: the key's sentence, counts, saves | absent without `use.fill` + `use.range`; disabled with no block and no focused data cell (`range.get()` null and focus not a cell) |
| Filter | filter « Filtrer… » | close, then `edits(col).openFilter()` | absent when `!canOpen` |
| Hide | hide | `column.state [{id, hidden: true}]`, `menu.hidden` | disabled `hideable: false` and the last visible column (O1) |
| Choose | choose « Choisir les colonnes… » | `use.chooser.api(g).open(header)` | absent until step 4 / without `use.chooser` |
| Reset | reset | one `column.state` patch: each column's def order rank, `pinned: def.pinned ?? null`, `hidden: def.hidden ?? false`, width `def.width ?? null` (Q3-3); sort and filters untouched; `menu.resetDone` | disabled when nothing differs from the defs (cheap: `columns.state()` empty-equivalent) |
| Density (only `density: true`) | density.* (radio) | Q3-4; `density.changed` | absent when `rowHeight` is a number |
| App | `items(col, defaults, c)` | its `action(c)`; a throw: reported, menu closed | — |

Keys inside (M18–M21, APG): Down / Up wrap; Home / End; disabled items focusable; printable char → next item whose
`fold(label)` starts with `fold(char)` (typeahead buffer 500 ms, fr accents, ar hamza forms); Enter / Space act and close
(radio / check too) except `keepOpen`; Left / Right nothing; Escape (the popup's), Tab close; the list owns every key
(`data-dzg-owner="popup"`, already on the host). Roles: `ul role=menu aria-label="menu.label {column}"`, `li role=menuitem*
tabindex=-1` (roving: the focused one 0), `role=separator`, radio groups `role=group`; column names in `<bdi>`.

## 5. Look (`@dzgrid/theme/columns.css`, no theme base byte)

`.dzg-mbtn` 24 × 24 (`--dzg-target-min`), three dots drawn by a shape (mask or `radial-gradient` over `currentColor`, no
glyph font), `order: 2`; `.dzg-reapply { order: 3 }` (decoration order label, sort, filter 1, ⋮ 2, reapply 3 — fact 5);
hidden `opacity: 0` (space kept) unless `.dzg-hcell:is(:hover, :focus-within, [data-dzg-menu])`, always shown in
`@media (hover: none), (any-pointer: coarse)`; never covers the grip (margin-inline-end as `.dzg-fbtn`). Menu: `.dzg-menu`
items `min-block-size: 32px` (≥ 24), checked radio a shape mark (not colour only), `aria-disabled` muted (exempt from 1.4.3; kept
≥ 3:1), focus ring `--dzg-focus-ring`; forced colours: `Highlight` / `HighlightText` on the
focused item, `ButtonText` borders. Logical sides only. Contrast pairs added (item text, hover, focus, checked mark;
light / dark / Midnight / Clinic).

## 6. Sizes (gz, measured at the commit; Q-B grants)

| Where | Now / budget line (grant) | This step | Note |
|---|---|---|---|
| `@dzgrid/dom/column-menu` (over `/popup`) | new, **3 000** | target 2 400, **hard stop 2 800** | split: list + roles + roving + typeahead 650, opening ways + dedupe + swallow 450, items + acts 800, placement / close rules 250, button + decoration 200 |
| `/popup` | 1 472 / 1 650 | +60–90 | `from`, `align`, `back` |
| dom base | 21 566 / 21 980 (grant 22 400) | **+50–70** (`shortcuts` seam) | **base bytes asked**: from the 834 B the plan keeps for steps 9–10 (≈ 300–450): fits |
| core | 28 916 / 29 000 (grant 29 150) | **+20–35** only with Q3-3 A | the line 29 000 holds (84 B margin) |
| `/fill` | 2 975 / 3 000 | +8–15 | `{ user }`; if > 3 000: stop and ask (Q-B) |
| `/columns` | 2 801 / 2 900 | +25–35 | its shortcuts; Mac `Meta` |
| `/filters` | — / 10 000 | −10 | attribute write moved to the seam |
| texts | `-columns` 162/184/216 of 500/600/800 | Q3-2 A: new `-column-menu` ≈ 390 / 470 / 520 → **450 / 550 / 650** | B: `-columns` raised |
| `columns.css` | 441 / 1 100 | +300–450 | button, menu, forced colours |
| K.8 guard, example | 82 986 / 83 500; 92 059 / 92 500 | +popup +base ≈ 110–160 | they use filters (popup) but not the menu: measure; above the line, ask (grant 84 000 / 94 500 exists) |

Cut order if the entry exceeds 2 800: typeahead buffer → single-char only; `classes` option → none; host `icon` → none;
pointer placement → under the header always. Never cut a sheet rule silently: report.

Config at the commit (code step, not now): `size-budget.json` (`dom/column-menu` 3 000 over `/popup`, text entries, core /
base lines to the grants only if crossed), package `exports`, build list, `rebudget.mjs` ceilings, vitest / tsconfig
/ vite aliases, theme manifest, `contrast-pairs.json`, `structure.test.ts` (the menu imports no other entry at run time).

## 7. Tests to write FIRST (red before the code; expectations by hand; touched tests only while working)

- `header-shortcuts.test.ts` (base seam): joined, deduped, sorted, removed when empty; filters + menu + columns in both
  feature orders give the same value; the filter can no longer wipe the menu's (today's bug); Mac `Meta`.
- `popup.test.ts` additions: `from` point (LTR / RTL start corner), `align: 'end'` (RTL: left edges), flip above, `back`
  called instead of the anchor, sweep still by the anchor.
- `column-menu-texts.test.ts`: three bundles complete, `COLUMN_MENU_KEYS` throw on missing, NNBSP before « : » in fr, `<bdi>`.
- `column-menu-open.test.ts`: every way in §2 (button click / Enter / Space; `contextmenu` with and without Shift; keyboard
  `contextmenu` at 0,0; Shift+F10 then `contextmenu` = one menu, `preventDefault` on the second; `ContextMenu` key; a
  `contextmenu` on an item prevented even with Shift; Alt+ArrowDown with a popup (filter opens, no menu) and without (menu),
  both feature orders; Mac Ctrl+click opens, the following click does not sort; group / floating / `menu: false` /
  out-of-window / editor open → nothing; nested grid's header opens only its own; one menu per grid; < 96 px no button but
  keys and right-click open; `aria-expanded`, `data-dzg-menu`; DOM order sort, fbtn, mbtn, reapply).
- `column-menu-keys.test.ts`: APG table (wrap, Home / End, disabled focusable and inert, typeahead fold fr « é », ar
  « أ / ا », Enter / Space, Left / Right nothing, Escape / Tab / Shift+Tab close with focus per §3, owner `popup`).
- `column-menu-items.test.ts`: §4 row by row (presence, disabled, checked, the one dispatched command and its source, the
  sentence after its pause); sort none keeps the others; pin on `movable: false` disabled; move edges via a real
  `columns()`; hide O1 and `hideable: false`; reset one patch (with Q3-3 A a flexible column flexible again); widen / narrow
  keep the menu open, not moved, clamp, one sentence for three clicks; filter hand-over (dialog focused, back to the
  button); chooser / auto-size / resize present only with stub members; density off by default, absent with `rowHeight`;
  app items: radio group, check, keepOpen, removal / reorder of built-ins by id, a throwing `items` → defaults + `report`,
  a throwing `action` → reported.
- `column-menu-block.test.ts` (S12-Q12): a block, then a ⋮ press / right-click (with `mousedown` default prevented):
  block kept, `fill.down` enabled, acts once with the user sentence (`range` + `fill` real features), focus back on the
  block's cell; Escape keeps the block; by keys from a header: fill items disabled.
- `fill-api-user.test.ts`: `down({ user: true })` says `fill.*` and is source `user`; without it silent (unchanged).
- core (Q3-3 A): `conformance/cases/column-state/width-null-*.json` (clears; `undefined` still unchanged; a bad value a
  problem) and a model unit test.
- theme `columns.test.ts`: ⋮ 24 px, `order` 2 / 3, hover / focus-within / `[data-dzg-menu]` / `(hover: none)` rules,
  item ≥ 24 px, forced colours, no physical side, no colour literal; drift test layered / unlayered.

No mutant round by the implementer (owner « Working method »): the one review agent runs ~25 (suggested: Shift exception
inside the menu, the 96 px `<`→`<=`, the dedupe of the second `contextmenu`, `mousedown` not prevented, `back` ignored,
`canOpen` ignored for Alt+ArrowDown, keepOpen ignored, O1 count off by one, typeahead without `fold`, sort none clearing
all, wrap removed, the shortcuts sort removed).

## 8. Browser checks (Chrome headless, one browser at a time, closed; only `--only` groups)

New `scripts/browser-column-menu.mjs` → `npm run test:browser -- --only column-menu`, on `orders-edit.html`
(`columnMenu({ use: { columns, range, fill }, density: true })` behind `?menu=0` off):
1. **Real right-click** (`page.mouse.click(…, { button: 'right' })`) on a header: our menu, the event `defaultPrevented`;
   Shift+right-click: not prevented, no menu. Ctrl+click with `Meta`-less Mac emulation: menu, no sort.
2. **Keys**: Shift+F10, `ContextMenu`, Alt+ArrowDown on a column with and without a filter popup (`filters=1&popup=1`):
   one menu, `document.activeElement` the first item; Escape → the header; Tab → the header.
3. **Block + « Recopier vers le bas »** with the real mouse: select a block, press ⋮, click the item: cells written, the
   block still drawn, the live region's sentence.
4. Élargir three clicks: width +30, the menu's box unchanged, one sentence.
5. fr light and `?locale=ar-DZ&theme=dark`: the button at the inline end (left in Arabic), the menu's end edge on the
   button's end edge, by right-click the menu opening leftward; every target ≥ 24 × 24 (`getBoundingClientRect`); the
   button absent at 90 px width, present at 100 px; decoration order measured by x.
6. **axe 0** on the open menu (fr, ar), on a header with the button; forced colours (`emulateMedia({ forcedColors })`);
   200 % zoom and 320 px viewport: the menu fits and scrolls.
7. **Firefox and WebKit, right-click and keys only** (`--engine firefox|webkit`): 1, 2 (Shift+F10 / `ContextMenu` give one
   menu and no native menu event left unprevented; WebKit Ctrl+click).
Also: `--only columns` (shortcuts seam), `--only filters` (attribute moved), `--only fill` (API flag), `--only playground`
(the demo changed). `check:contrast`. Full gate once at the commit; `ps` for orphan workers.

## 9. Risks

- **R1 block lost** (fact 6): any path that focuses the header drops it; the `mousedown` prevention must cover the ⋮ press,
  right-click and Ctrl+click in three engines (check 3, 7). If an engine still focuses: the fill items are then keyboard-
  only there — report, do not patch range.
- **R2 double menu / native menu** from Shift+F10 or the Menu key (engine-dependent `contextmenu` timing and target):
  the dedupe in §2 and checks 2, 7. VoiceOver's VO+Shift+M and real Fn keys are not testable headless: owner §21 166.
- **R3 Mac Ctrl+click sorting** (a click after `contextmenu` in some engines): the swallow; WebKit check.
- **R4 base bytes** for the shortcuts seam (fact 4) and their sort order differing from the sheet's « filters, menu,
  resize, move » (sorted alphabetically instead: one value whatever the feature order; sheet M5 amended).
- **R5 texts over budget** (fact 9): Q3-2.
- **R6 visual order** of reapply before the filter button today (fact 5): fixed only when `columns.css` is loaded; the
  edit theme has 3 B left. Note in `edit-reapply.md`.
- **R7 `/fill` at 2 975 / 3 000**: the `{ user }` flag may not fit; fallback: the menu sends a synthetic Ctrl/Cmd+D keydown
  to the focused cell (0 B in fill, router must not check `isTrusted`; uglier). Ask before raising.
- **R8 Arabic label of fill.end**: « vers la droite » is the owner's French; the key is `menu.fillEnd` and its Arabic text
  says « نحو اليسار » (Ctrl+R fills toward the end, left in RTL). Arabic review by the owner.
- **R9 deviations from the sheet** (lead to confirm): thrown `items` reported, no `invalid-menu` problem code (0 core
  byte, as step 2); `menu.button` / `menu.item` replaceable parts **not** in this step (classes + `icon` only; parts with
  Phase 9's menus); focus return per §3.
- **R10 popups in a host `dialog`**: Escape stops at the menu (popup host) — keep; tested in the nested-grid case.

## 10. Questions for the owner

**Q3-1 — Où revient le focus quand le menu a été ouvert à la souris ?** Pour « Recopier vers le bas » depuis le menu
(votre décision S12-Q12), le bloc de cellules doit survivre à l'ouverture du menu.
- **A ★** Ouvert à la souris : le focus ne bouge pas, et revient là où il était (la cellule du bloc). Ouvert au clavier :
  il revient sur l'en-tête. Le bloc reste ; « Recopier » marche. ≈ 0 octet de plus.
- B Toujours sur l'en-tête (comme écrit dans la fiche) : le bloc est perdu, « Recopier » ne marche qu'au clavier
  (Ctrl+D existe déjà) ; WCAG 2.5.8 n'est pas couvert.
- C Mettre « Recopier » ailleurs (un clic droit sur les cellules du bloc), hors de ce menu : plus d'octets, plus tard.

**Q3-2 — Les textes du menu ne tiennent pas dans le paquet `-columns`** (≈ 506 / 612 o pour en / fr, budget 500 / 600,
avant ceux de la fenêtre et du redimensionnement).
- **A ★** Un paquet à part, `locales/{en,fr,ar}-column-menu`, budgets 450 / 550 / 650 ; `-columns` garde les siens.
  Une appli sans menu ne le charge pas.
- B Monter `-columns` à 1 200 / 1 400 / 1 600 pour toute la Phase 6.
- C Raccourcir les textes et les noms de clés (moins lisible, gain ≈ 60 o).

**Q3-3 — « Réinitialiser les colonnes » exact ?** Aujourd'hui le cœur ne sait pas effacer une largeur choisie : une
colonne souple ou sans largeur fixée resterait à la largeur de l'utilisateur.
- **A ★** Le cœur accepte `width: null` = « revenir à la définition » (≈ +25 o cœur, sous la ligne 29 000) ; l'étape 5
  (`GridState`) s'en sert aussi.
- B Pas d'octet cœur : réinitialiser l'ordre, l'épinglage et le masquage, et les largeurs seulement là où la définition
  en donne une (les colonnes souples restent figées).

**Q3-4 — La ligne « Densité » dans le menu (éteinte par défaut, C5).**
- **A ★** Maintenant : la ligne change la densité de la grille et prévient l'appli par `onDensity(d)` ; `setDensity()` et
  l'événement `densityChanged` arrivent à l'étape 6 avec l'état. 0 octet de base.
- B Maintenant avec `grid.setDensity()` et `densityChanged` dans la base (≈ +50 o de base).
- C La ligne attend l'étape 6.

## Done (2026-10-26, implementer; nothing committed, no review yet) — **blocked on size: owner decision**

Built as the plan says (§1–§5), with the owner's Q3-1 A, Q3-2 A, Q3-3 A, Q3-4 A: `@dzgrid/dom/column-menu`
(`column-menu.ts`, `column-menu/index.ts`), texts `locales/{en,fr,ar}-column-menu`, look in `columns.css`, contrast pairs;
seams: base `FeatureHandle.shortcuts` (the base writes `aria-keyshortcuts` once, joined, deduplicated, sorted; the filters
stopped writing it; `columns()` declares its moves), popup `from` / `align: 'end'` / `back` (+ kept inside the window
when it fits neither below nor above, found in Chrome), `fill` `down/end({ user: true })`, core `width: null`,
`ColumnDef.hideable` / `menu` (types). Demo `orders-edit.html` (`?menu=0` off) with moves, fill items and density.
Configs: `size-budget.json`, `rebudget.mjs` ceilings, exports, build list, vitest / tsconfig / vite aliases (port 4700
answered after the vite edit), `browser.mjs` `--only column-menu` (`scripts/browser-column-menu.mjs`).

**Tests written first, red for the reason given, then green:**
- core `columns.test.ts` « width: null clears… » and conformance `columns-layout/width-null-clears.json` (runner: a `then`
  patch) — red: `null` was an `invalid-column` problem.
- `scripts/test/rebudget.test.ts` step 3 and `release.test.ts` step 3 — red: entries, ceilings, exports absent.
- `fill-api-user.test.ts` — red: `down/end({ user: true })` wrote source `api` (the third, « without it », guards).
- `popup-from.test.ts` — 7 red on the old popup (`from`, `align`, a point, `back`); the window clamp test red (86 px,
  not 50) before its fix. Two « as before » guards green from the start.
- `header-shortcuts.test.ts`, `column-menu-{texts,open,keys,items,block,layering}.test.ts` — red: the entry did not exist;
  theme `columns.test.ts` 5 new tests red (no rules). Corrected after the code (my test errors, said here): the DOM
  order of the decorations (the base appends the sort mark when a sort appears: only the ⋮ after the filter button is
  asserted; the visual order is the theme's `order`), group headers need `spans()`, a fill-right cell (`price`, not a
  text column), a typeahead prefix (« re » still matches « Rétrécir »), the clamp test's numbers.
- `packages/core/test/layering.test.ts`: the core guard 28 916 → 28 930 (Q3-3's `width: null`, +14 B).

**Gate (`caffeinate -i`, one command at a time):** `test:ci` 426 files, 6 564 tests: 6 562 green, the 2 core-guard tests
then updated and green on their own (445 s); `typecheck`, `build` green; `check:contrast` 1 026 pairs, 0 below;
`check:size` **4 over**: `dom/column-menu` **3 951 / 3 000** (over `/popup`), texts **477 / 450, 570 / 550, 673 / 650**.
Inside: core 28 930 / 29 000 (+14), DOM base 21 773 / 21 980 (+58, the shortcuts seam), popup 1 587 / 1 650 (+117),
`fill` 2 984 / 3 000 (+9), `range` 4 927 unchanged, `columns` 2 825 / 2 900 (+47), `filters` 9 651 (−22), `columns.css`
1 092 / 1 100 (two rules cut to fit: the ⋮'s hover colour, the icon's size), K.8 83 336 / 83 500, Angular 6 814.
Browser: `--only column-menu` Chrome 38 / 38 (fr light, ar dark: real right-click at the pointer, Shift+right-click
left, Mac Ctrl+click opens without sorting, Shift+F10 / Menu key / Alt+↓ one menu, Tab / Escape back to the header, a
mouse block kept through the ⋮ and « Recopier vers le bas » writes it, « Élargir » ×3 = +30 px menu unmoved one sentence,
end edges aligned, targets ≥ 24, axe 0 open, forced colours, the ⋮ gone at 90 px, 320 px view), Firefox 10 / 10,
WebKit 10 / 10 (right-click, keys; Firefox sends no `contextmenu` for Shift+right-click nor Ctrl+click headless);
`--only playground` 41 / 41. No mutants (owner method).

**The size (STOP, plan §6):** the menu as specified measures 3 951 B gz over the popup host; the plan's 2 400 was an
estimate. A rewrite to data-driven items gained ≈ 25 B; the plan's cut order (single-letter type-ahead, no `classes`, no
`icon`, menu always under the header) measured ≈ −140 B (≈ 3 815): not applied, since it cannot reach 2 800 and removes
sheet behaviour. Each 600 minified characters cost ≈ 250 B gz evenly (no single heavy part). Options for the owner:
- A: raise `dom/column-menu` to the measure + 10 % (≈ 4 350) and the texts to 500 / 600 / 700 (≈ +25 B each);
- B: A, with the cut order applied (≈ 3 815 → line ≈ 4 200; loses the prefix type-ahead, host classes and icons, the
  menu at the pointer);
- C: drop whole rules to approach 3 000 (e.g. density line, reset, app items' radio / check / keepOpen) — each ≈ 100–250 B.

**Deviations (lead / owner to confirm; also in `column-menu.md` « As built »):** text keys `menu.size*` (an item's text is
`menu.` + its id), new `menu.sort` / `menu.pin` / `menu.width` / density keys in `-column-menu`; sections « filter » alone
then « hide, choose, reset »; `aria-keyshortcuts` sorted alphabetically, the menu always declaring Alt+ArrowDown; API
`api(grid).open / close / current()`; reset may stay enabled after a column moved away and back by hand; no
`invalid-menu` problem, no replaceable parts; the right-click menu 2 px under the pointer; with `columns.css` the
reapply mark is drawn last and carries the grip's gap.

**Owner Q3-5 applied (2026-10-26):** `dom/column-menu` ceiling and line 4 300 (measured 3 951), texts 500 / 600 / 700
(measured 477 / 570 / 673): the step-3 ceiling test changed first (red), then `rebudget.mjs` and `size-budget.json`. Gate
again: `test:ci` 426 files, 6 564 tests all green (447 s); `check:size` 0 over. No browser rerun (no code change).
