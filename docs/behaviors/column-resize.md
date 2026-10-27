# Resizing a column

## What the user does
Drags the edge of a column header; double-clicks it; uses the keyboard resize mode (Phase 6) from the
column menu or with Alt+R on a focused header; asks the menu to fit one column or all of them to their
content.

## What they observe
- The column follows the pointer; the header and the cells stay aligned.
- It never gets narrower than its minimum or wider than its maximum.
- In Arabic, dragging toward the left widens a column whose end edge is on the left.
- Flexible columns share the remaining width; a column the user resized stops being flexible.
- A double-click on the edge fits the column to its content (Phase 6).
- In the keyboard mode, the arrows widen and narrow the column, the new width is said, Enter keeps it,
  Escape puts it back (Phase 6).

## What DzGrid does
- The handle sits on the column's end edge (logical); the width changes by the logical pointer distance, so the same code serves both directions.
- While dragging, `columnResized` fires with `finished: false`; on release once with `finished: true`.
- The handle is at least 24 px wide for touch (`--dzg-target-min`). For the last column pinned to the end, it sits on the column's start edge and the drag is reversed (S2).
- Widths are core state (`ColumnLookup.version`), so a resize never filters or sorts again.
- The handle stays `aria-hidden` and out of the tab order in Phase 6 too: the keyboard way is the resize
  mode below (one way in, not a second tab stop per column).

## Keyboard resize mode (Phase 6)
Sources: WCAG 2.2 (2.1.1, 2.5.7, 2.5.8, 4.1.3, 1.4.11, 2.4.11), APG grid; plan D4; owner decision Q-K3 (A);
`decisions.md` « Step 1 follow-ups » (O10).
Entry: `@dzgrid/dom/columns` (`columns()`), Phase 6 step 6 (the plan's « step 7 »; `step06-plan.md`).
Owner decision Q6-1 (`decisions.md` « Step 6 »): **no − / + / ✓ buttons** in the mode; the single-pointer way is
the menu's « Élargir / Rétrécir » (9).

1. Entered by **Alt+R** on a focused column header (read by `code` `KeyR`, then by `key`, so an Arabic or
   AZERTY layout and a Mac's Option work; no Ctrl, Meta or Shift held) or by the menu item « Redimensionner
   au clavier » (`column-menu.md` 10), or `resizeMode(column)` on the feature. Not F2 (the reapply mark's key,
   `edit-reapply.md` 5). Not on a column with `resizable: false` (sentence `size.locked`), a group header or
   a floating filter cell.
2. On entering: the header shows the mode (a 2 px dashed outline in `--dzg-resize-mode`, 3:1, a shape and
   not only a colour; in forced colours the system draws the outline in its own colour, the dashes stay), `data-dzg-resizing`, the header's `aria-description`
   `size.modeHint`, and one polite sentence `size.mode` (« Redimensionner Nom : 140 pixels. Flèches pour
   changer, Entrée pour garder, Échap pour annuler »). The focus stays on the header.
3. **ArrowRight** widens by 10 px in left to right and **ArrowLeft** narrows; in right to left it is
   mirrored (ArrowLeft, toward the column's end edge, widens). **Shift+arrow**: 1 px. Clamped by min / max;
   at a bound the sentence adds `size.min` / `size.max`.
4. **Home**: fits the content (auto-size, below). **End**: nothing (choice 1). ArrowUp / ArrowDown, PageUp /
   PageDown, Enter's sort, letters: swallowed while in the mode (no move, no sort).
5. **Enter** keeps the width and leaves; **Escape** puts back the width the column had on entering (and
   its flexibility) and leaves, sentence `size.cancelled`; **Tab / Shift+Tab** keeps and leaves, then moves
   as usual; a press anywhere, the focus leaving the header, a sort, new
   definitions or the column leaving the window keep and leave quietly (decided, O10).
6. Each key: `column.resize`, `columnResized` with `finished: false`; leaving: one `finished: true` (Escape
   too, with the restored width). The width is said after a 300 ms pause (`size.width` « Nom : 150 pixels »),
   once for a run of keys.
7. A flexible column becomes fixed on the first key (as a drag); Escape makes it flexible again.

**Single pointer, no drag** (WCAG 2.5.7: keys do not count; a pointer user needs a way without dragging)
8. No buttons in the mode (owner Q6-1: they cost ≈ 350 B for a second pointer way). The pointer way is 9.
9. The column menu carries « Élargir » / « Rétrécir » (`column-menu.md` 10): each click changes the width
   by 10 px **and keeps the menu open** (the only items that do), the width said after a pause; the menu's
   Escape or a click outside keeps the width (as a drag would).

## Auto-size (Phase 6)
Plan D5; owner Q-M1 (A).

10. Ways: a **double-click on the resize edge** (mouse, pen; the first click does nothing visible), Home in
   the resize mode, the menu items « Ajuster cette colonne » / « Ajuster toutes les colonnes »,
   `autoSize(columnIds?)` and `autoSizeAll()` on the feature.
11. The width is the widest of: the header's text (with room for its sort mark, filter button and ⋮ button),
   and the formatted text of the cells of the **mounted rows** plus a deterministic sample — the first 200
   displayed rows (choice 2) — formatted by the column's formatter; plus the cell's padding; clamped by min /
   max. Tree column: with the indentation and the chevron of the deepest sampled row. Custom cell parts are
   measured only where mounted. Pinned rows (`pinned-rows.md`) are part of the sample.
12. Measured in **one read phase** (owner Q6-2: the real cells): a hidden copy of the header and of every mounted
    cell beside its original (same font, direction, badge, tree indentation), a plain cell for each other sampled
    text (each text once); all written, then all read, then removed — never a layout read per grid cell; one `column.state` patch per call (all columns at once for « toutes »), one
    `columnsChanged`, `columnResized` `finished: true` per changed column.
13. Hidden columns are skipped; a column with `resizable: false` is skipped; a flexible column becomes fixed.
14. Sentence: one column `size.width`; all `size.autoAll` (« Colonnes ajustées : 9 »). The API is silent.
15. « Fit the columns to the view's width » (shrink all) is not offered in this phase.

### Keyboard

| Where | Key | LTR | RTL |
|---|---|---|---|
| column header | Alt+R | enter the mode | enter the mode |
| mode | ArrowRight | +10 px | −10 px |
| mode | ArrowLeft | −10 px | +10 px |
| mode | Shift+ArrowRight / Shift+ArrowLeft | +1 / −1 px | −1 / +1 px |
| mode | Home | fit to content | fit to content |
| mode | Enter | keep, leave | keep, leave |
| mode | Escape | restore, leave | restore, leave |
| mode | Tab / Shift+Tab | keep, leave, move on | same |
| resize edge (pointer) | double-click | fit to content | fit to content |
| column menu (pointer) | « Élargir » / « Rétrécir » | +10 / −10 px, menu stays open | same |

### Announcements
Polite: `size.mode` on entering, `size.width` after a pause, `size.cancelled`, `size.autoAll`,
`size.locked`. Nothing during a pointer drag (as before).

### Texts (`locales/{en,fr,ar}-columns`)
| Key | en | fr | ar |
|---|---|---|---|
| `size.mode` | Resize {column}: {width} pixels. Arrows to change, Enter to keep, Escape to cancel | Redimensionner {column} : {width} pixels. Flèches pour changer, Entrée pour garder, Échap pour annuler | تغيير عرض {column}: {width} بكسل. الأسهم للتغيير، Enter للحفظ، Escape للإلغاء |
| `size.modeHint` | resize mode | mode redimensionner | وضع تغيير العرض |
| `size.width` | {column}: {width} pixels | {column} : {width} pixels | {column}: {width} بكسل |
| `size.min` | , minimum | , minimum | ، الحد الأدنى |
| `size.max` | , maximum | , maximum | ، الحد الأقصى |
| `size.cancelled` | Resize cancelled | Redimensionnement annulé | أُلغي تغيير العرض |
| `size.autoAll` | Columns fitted: {n} | Colonnes ajustées : {n} | الأعمدة المضبوطة: {n} |
| `size.locked` | {column}: fixed width | {column} : largeur fixe | {column}: عرض ثابت |

The menu's « Élargir » / « Rétrécir » labels are `menu.widen` / `menu.narrow` (`column-menu.md`).

`{width}` and `{n}` are formatted in the grid's locale.

### Right to left
Arrows mirrored as the grid's own moves (the column's end edge is on the left). The outline and the handle
use logical insets. Arabic text is measured with the browser's own shaping (the off-screen element has the
grid's font and `dir`).

### WCAG notes
- 2.5.7: a single pointer without dragging: the column menu's « Élargir » / « Rétrécir » (9: ⋮ button or
  right-click, then a click per 10 px, the menu stays open); the edge's double-click has the menu item
  « Ajuster » as its twin. 2.1.1: the mode's keys.
- 2.5.8: the menu's items (32 px high) and the ⋮ button (24 px).
- 4.1.3: widths said politely, once per run of keys; 1.4.11: the mode's outline 3:1; 2.4.11: the header
  kept in view.

### Decided (`docs/phase-6-steps/decisions.md` « Step 1 follow-ups »)
- O10 (lead): Tab, a click or the focus leaving **keep** the new width (only Escape restores).

### Choices to confirm (not settled by the decisions)
1. End does nothing in the mode (could mean « maximum »).
2. The sample is the first 200 displayed rows plus what is mounted, not the whole data.
3. On a server grid the sample is the rows held (the current page).
4. ~~Both single-pointer ways~~ decided (owner Q6-1): the menu's « Élargir / Rétrécir » only.

## As built (Phase 6 step 6, 2026-10-27)
- `@dzgrid/dom/columns`: `columns/size.ts` (`fits`, the measure) and the mode in `columns/index.ts`; `ColumnsApi` gains
  `autoSize(ids, { say })`, `autoSizeAll({ say })`, `resizeMode(id)`. The column menu passes `say: true`; the API alone
  is silent. The base answers a double-click on a grip through `GridContext.fit` (set by `columns()`, absent
  otherwise; a finger's taps never count): +71 B on the DOM base.
- Alt+R is read by `code` `KeyR` or by `key` « r » (any case); its header lists `Alt+R` in `aria-keyshortcuts`.
- In the mode every key but Tab is the mode's (taken in the capture phase on the grid's root): arrows with Ctrl,
  Meta or Alt do nothing; Ctrl / Meta combinations keep the browser's default.
- Leaving: a pointer press anywhere, the focus landing anywhere but the header, `columnsChanged`, `sortChanged`.
  Enter with no key pressed dispatches nothing (a flexible column stays flexible).
- Not mounted: a row outside the window is measured as its text in a plain cell (no badge chrome, no tree
  indentation: a lower bound); a header outside the column window is not measured. A grid nested in a detail row
  with the same column id would be measured too (not seen in the demos).
- Forced colours: the outline keeps its dashes, in the system's colour (not `Highlight`: forcing it would need
  `forced-color-adjust: none` on the whole header).
- Sizes (owner Q6-6): `dom/columns` 3 981 / line 4 100 (grant 4 200); `columns.css` 1 111 / 1 150 (1 200); texts
  en 512 / 530, fr 614 / 630, ar 746 / 800 (550 / 650 / 850).
- Breaking (unpublished): a `-columns` bundle without the eight `size.*` texts now throws at setup.

## Tests
`conformance/cases/columns-layout/*`, `packages/dom/test/resize.test.ts`. Phase 6 (with the code):
`packages/dom/test/columns-resize-mode.test.ts` (keys LTR / RTL, bounds, Escape restores the width and the
flexibility, events, sentences, Alt+R by code on AZERTY / Arabic), `columns-autosize.test.ts` (a geometry
spy: one read phase, no per-cell layout read; the 200-row sample deterministic; tree indentation; min / max);
browser: `scripts/browser-columns.mjs` `resizeChecks` (`--only columns` or `--only column-resize`; Firefox and WebKit
the keys right to left): Alt+R, arrows, Home with no cell clipped, the menu's « Redimensionner au clavier », a real
double-click, « Ajuster toutes les colonnes » with no mounted cell clipped in fr and ar, the outline 3:1, axe 0.
