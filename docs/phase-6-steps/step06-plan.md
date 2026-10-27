# Phase 6, step 6 — keyboard resize mode and auto-size (`@dzgrid/dom/columns`, part 2)

Architect plan, 2026-10-26. Plan only. Sources: `column-resize.md` 1–15 (wins on behaviour), `column-menu.md` 10, a11y §21, `decisions.md` (Q-K3, Q-M1, O10), phase-6-plan D4/D5. The plan numbers this step 7; the STATUS order calls it step 6.

## 0. Facts found (real state)
- `columns.ts` re-exports `columns/index.ts` (14.7 kB source) and `columns/order.ts` (pure move logic, mutated at step 4). `size-budget.json`: `/columns` 2 900 gz, grant 3 500. Measured 2 801 per the brief; I could not re-measure (no build). **Step 0 of the build: `build` + `check:size`, write the number here.**
- The column menu already has the items and waits for `cols.autoSize / autoSizeAll / resizeMode` (`column-menu/index.ts` 24-26, 172-176). The menu's « Élargir / Rétrécir » (`keepOpen`) and `menu.sizeResize` texts exist. So the menu costs 0 B in `/column-menu`, unless `ColumnsApi` is not typed for it. Check that `ColumnsApi` gains `autoSize`, `autoSizeAll`, `resizeMode`, and that the menu's `cols` type matches.
- `interact/resize.ts` (base) has no double-click. `attachResize` is installed by `header-click.ts`, which is in the base. The `.dzg-resize` handle is the target.
- Texts: `locales/{en,fr,ar}-columns` have the `move.*` keys. The `size.*` keys listed in `column-resize.md` (11 keys x 3 languages) are to be added; `COLUMNS_KEYS` gains the mode's keys (a missing key throws at setup, which makes every existing consumer of `columns()` fail until they add the texts: a note for the CHANGELOG, nothing is published yet).
- Nothing in the code measures text (no `measureText`, no canvas).

## 1. Where each piece lives
| Piece | Place | Est. gz |
|---|---|---|
| Double-click on the grip | **base seam**: `attachResize` gets an optional `fit(column)` host callback and a `dblclick` listener on the same handle, answering `e.target.closest('.dzg-resize')`; `header-click.ts` passes `g.features`-provided `fit` (a one-line hook on `GridContext`, e.g. `g.autoSize?: (ids) => void`, set by `columns()` in setup, undefined otherwise). The first click of a double-click does a drag of 0 px: `consumeClick` already swallows the sort. | base **+50-70** (dom base margin 415 B, K.8 514 B: affordable; measure) |
| Mode state machine (enter, keys, Escape restore with flexibility, Tab/click/blur keep, events, sentences) | `columns/resize.ts` (new, imported by `columns/index.ts`) | ~700-800 |
| Key routing: Alt+R by `code` then `key`, no Ctrl/Meta/Shift; swallow ArrowUp/Down/PageUp/PageDown/Enter-sort/letters in the mode | reuse the Ctrl+Shift+arrows header key owner already in `columns/index.ts` (`KeyOwner`) | ~150 |
| The three buttons − / + / ✓ (24 px, `tabindex=-1`, under the header, top layer, inline-end aligned, logical insets) | `columns/resize.ts`, built once like the `dzg-move` layer; positioned by one read at entry and at each width change (no per-key layout read besides the header's rect) | ~350 |
| Auto-size: measure and one `column.state` patch | `columns/size.ts` (new); pure width formula (max of header, cells, padding, tree indent, min/max clamp, hidden/locked skip, flexible becomes fixed) kept apart from the DOM reads so it can be unit-tested | ~500-600 |
| API: `resizeMode(col)`, `autoSize(ids?)`, `autoSizeAll()` | on `ColumnsApi` | ~80 |
| `theme/columns.css`: mode outline (`--dzg-resize-mode`, dashed, forced colours `Highlight`), buttons | CSS budget has its own line: check (columns.css) | CSS +150-250 |
| Texts 11 keys x 3 | `locales/*-columns` own lines | +250 each language-line |
| **JS total** | | **≈ +1 700-2 000 → 4 500-4 800** if nothing is saved |

Honest reading: 2 801 + ~1 800 ≈ 4 600, which is **over the 3 500 grant by ~1 100**, not by 100. The plan's « 3 500 » was written before the menu items, the three buttons and the measuring were counted. Levers to land near 3 500-3 800: (a) drop the mode's three buttons because the menu's « Élargir / Rétrécir » is already a 2.5.7 way (choice 4 of the sheet): −350; (b) measure with one off-screen DOM element not a canvas (see 3): fewer bytes; (c) share the announce/throttle helper with the move code (`hush`, `said`, `when` exist): −100; (d) no « all columns » sentence rounding, locale format via the existing number formatter.

## 2. Behaviour decisions for the blueprint (the sheet wins; these close its gaps)
- **Direction**: mode arrows are *physical-mirrored* in RTL (sheet 3, table): ArrowLeft widens in RTL. Test both. Buttons: « + » always widens.
- **Width source**: `widthOf(g,id)` (header-decor). Writes via `kernel.dispatch({type:'column.resize', finished:false})` per key, `finished:true` once on leaving (Escape too, with the entry width). Clamped by min/max in core already (`kernel.ts` 649): read the clamped result from `m.get(id)` to say `size.min/max`.
- **Escape restores flexibility**: needs the pre-mode `ColumnState` snapshot (`flex`, `width`) and a `column.state` patch; a plain `column.resize` back would leave it fixed. Test it.
- **Pinned columns**: the width key works as for any column (a pinned segment re-lays out, the sticky offsets follow through `ColumnLookup.version`). The end-pinned last column has its grip on the *start* edge (S2, `isLastEnd`): this reverses only the pointer drag, **not** the keys (the keys follow the text direction, the column's end edge). The buttons must follow the header after each width change (a pinned column's header moves when the width changes). Keep the focused header in view (2.4.11) with a single `scrollIntoView({inline:'nearest'})` after a pause, not per key.
- **Header groups**: group header cells are not column headers: no Alt+R there (`size.locked` is for `resizable:false` only; a group gets silence plus no mode). A collapsed group: its visible child gets the mode normally. The group band's width is derived, so it follows.
- **Leaving the mode quietly** (O10): click elsewhere, blur out of the grid, sort, `defs` change, column hidden or leaves the window (virtual columns): one `leave(keep)` function used by all.
- **GridState** (step 5): width is already captured through `column.state`. Mode and auto-size must not add anything. Test: capture after a keyboard resize and after `autoSize` gives the new width and `flex` cleared; Escape leaves state equal to before (deep equal).
- **Mode and menu**: « Redimensionner » closes the menu then enters the mode with the focus back on the header (the menu's restore-focus runs first; enter the mode on the next task, otherwise the focus return fires `blur` and leaves the mode at once: a **real risk**, test it).
- **Server/paged grids**: sample is the rows held (choice 3 of the sheet).

## 3. What auto-size measures (owner question Q-A)
Options: canvas `measureText` vs a DOM probe.
- **Canvas `measureText`**: fast, no layout; but must copy the cell's font from computed style (font family/size/weight/**letter-spacing**/`font-feature-settings`/`font-variant-numeric`) and it does not apply CSS `text-transform`, `font-kerning`, `direction` as the DOM does; Arabic shaping works but contextual forms and ligatures can differ from the rendered cell by a few px (Firefox vs Chrome). Fonts not yet loaded measure the fallback font; no event told us. Cheap per cell.
- **DOM probe** (one off-screen `<span>` per font, `white-space:nowrap`, `contain: layout style`, grid's `dir`; set text, read `offsetWidth` (or `getBoundingClientRect().width`, fractional), in one read phase): same text pipeline as the real cell, so Arabic, kerning, `text-transform`, number features are exact. Cost: one layout read per *distinct text* (not per cell); dedupe by `text|font`; 200 rows x 9 columns = ≤ 1 800 reads worst case, but all in one flush because writing the span's text then reading forces layout each time. **Mitigation**: write *all* probes first (one span per sampled text, in a hidden container), then read all widths in one pass: one layout. Then remove the container. That is what the sheet's « one read phase » means; the geometry spy test can assert one layout flush.
- **Parts (badges)**: a cell with a custom part is measured only where mounted, by reading the mounted cell's content width (`scrollWidth` of the cell's inner wrapper) in the same read phase. For unmounted rows, the formatter's text is used (badge chrome/padding missed: lower bound). To add padding for badges, the part could expose a `measure` hook: **not in this step** (stays an open point, Q-A3).
- Header: probe for the header text + fixed allowance (sort mark, filter button, ⋮) read from the real header cell's non-text children widths (one read), not hard-coded.
- Fonts: wait for `document.fonts.ready` only if `document.fonts.status !== 'loaded'`; if not loaded, measure now and re-measure once on `loadingdone`? Recommend: **no re-measure**, say it in the docs, and an `autoSize` called before fonts load is the app's affair (document it).
- Recommend: **DOM probe, batched** (Arabic and RTL exactness is the library's promise; canvas is smaller to run but wrong by a few px in Arabic/Firefox, and a clipped Arabic cell is a visible defect).

## 4. Owner questions (simple French, 2-4 options, recommended first)
**Q6-1. Le budget de `columns`.** Le plan disait 3 500 octets ; l'estimation réelle est plus haute (environ 4 600), car le mode, les trois boutons et la mesure n'étaient pas comptés. Que fait-on ?
- A (recommandé) : on garde 3 500 en retirant les trois boutons − / + / ✓ du mode (le menu « Élargir / Rétrécir » reste le chemin sans glisser) et en partageant le code avec le déplacement ; budget final entre 3 500 et 3 800, à confirmer à la mesure.
- B : on garde tout (boutons compris) et le plafond passe à 4 700.
- C : on sépare : `@dzgrid/dom/columns` reste à 3 500 (mode au clavier) et l'ajustement automatique devient une entrée à part `@dzgrid/dom/auto-size` (~700 o), pour ceux qui n'en veulent pas.

**Q6-2. Comment mesurer le contenu pour « Ajuster ».**
- A (recommandé) : mesure dans le navigateur avec un petit élément caché (même police, même sens, arabe exact), tout écrit puis tout lu en une seule fois.
- B : canvas `measureText` : plus petit et plus rapide, mais l'arabe peut être faux de quelques pixels (texte coupé), surtout dans Firefox.
- C : A pour l'arabe et les parties, B pour le reste : plus de code, pas recommandé.

**Q6-3. Quelles lignes sont mesurées.**
- A (recommandé, comme la fiche) : les lignes affichées à l'écran plus les 200 premières, y compris les lignes épinglées.
- B : seulement les lignes affichées à l'écran (plus léger, mais la largeur change selon le défilement).
- C : toutes les lignes (exact, mais lent sur 100 000 lignes ; refusé par le plan).

**Q6-4. Les badges et pièces personnalisées.**
- A (recommandé) : mesurés seulement s'ils sont à l'écran, sinon on prend le texte ; on le dit dans la doc.
- B : une fonction `measure` que la pièce peut fournir (plus exact, plus d'octets, une API de plus).

**Q6-5. Polices pas encore chargées.**
- A (recommandé) : on mesure tout de suite et on le documente (l'appli appelle après le chargement).
- B : on attend `document.fonts.ready` avant de mesurer (la mesure devient asynchrone, l'API change de forme).

(Choices already in the sheet — End does nothing, sample 200, server grids — stay as written; I recommend confirming them silently with Q6-3.)

## 5. Tests to write FIRST (they must fail before the code)
jsdom (no layout: widths injected by a stub `measure` host, as the move tests do):
1. `columns-resize-mode.test.ts`: Alt+R by `code` on QWERTY, AZERTY, Arabic layout and by `key` on a Mac Option; not with Ctrl/Meta/Shift; not on `resizable:false` (says `size.locked`), group header, floating filter cell. ArrowRight/Left +/-10, Shift 1, LTR and RTL (mirrored); clamp at min/max with `size.min`/`size.max`; Home calls the fit; End does nothing; ArrowUp/Down/Enter sort/letters swallowed (no sort dispatched); Enter keeps; Escape restores width **and flexibility** and fires `finished:true` with the old width; Tab, click elsewhere, blur, sort, defs change, column hidden keep quietly; events: `finished:false` per key, `true` exactly once; sentences: `size.mode` on entry, `size.width` once after 300 ms for a run of keys; a flexible column becomes fixed on the first key; a pinned column; the mode on a header after the menu closes (focus-restore ordering).
2. `columns-autosize.test.ts`: geometry spy: **one layout flush** per call (and per `autoSizeAll`), not per cell; the first 200 displayed rows deterministic (same rows, same order, any scroll position, after sort/filter); dedupe by text and font; tree indent + chevron of the deepest sampled row; min/max clamp; hidden and `resizable:false` skipped; flexible becomes fixed; one `column.state` patch, one `columnsChanged`, `columnResized finished:true` per changed column only; `size.autoAll` count; API silent; pinned rows in the sample; empty data gives header width.
3. `resize.test.ts` additions (base): double-click on `.dzg-resize` calls `fit(column)` once; the first click does not sort; a drag then a double-click; without the hook (no `columns()`), the double-click does nothing and the base costs nothing; touch: a double-tap on the grip is not a double-click (pointer type check).
4. Buttons (if kept, Q6-1): 24 px minimum (computed in the browser, not jsdom), press does not leave the mode and does not move focus; « + » always widens in RTL; ✓ keeps.
5. GridState round-trip after keyboard resize / autoSize / Escape (with step 5's capture).
6. COLUMNS_KEYS: a missing `size.*` text throws at setup (like `move.*`); the three locales have the same keys (existing locale parity test).
7. Conformance case `columns-layout/resize-mode-*` if the conformance harness can drive keys.

**Mutants**: only on the pure width formula (`columns/size.ts` `fitWidth(header, cells, pad, indent, min, max)`) and the step/clamp/mirror function (`stepWidth(dir, key, shift, current, min, max)`), run in a copy of the repo at the combined review, as at step 4. Not on the DOM glue.

## 6. Browser checks (one browser at a time, closed after; never touch port 4700)
- `npm run test:browser -- --only columns` in **Chrome**: Alt+R, arrows, Home on `orders-edit.html` fr and `?locale=ar-DZ`; double-click on the grip; widths for French accents and Arabic text (no clipped cell: assert `scrollWidth <= clientWidth` for every sampled cell after `autoSizeAll`); a badge column; a tree column; 24 px buttons; focus outline contrast (computed 3:1).
- **Firefox and WebKit**: the keys in RTL (mirroring), Alt+R (Option on WebKit may produce `®` as `key`: that is why `code` is read first), Alt+Arrow conflicts, Arabic measure variance (Firefox shaping), dashed outline in forced colours (Firefox `forced-colors` emulation).
- Check the focus-return ordering after the menu item in all three engines (WebKit moves focus on a later task).
- Perf: a 100 000-row grid, `autoSizeAll` stays at 200 sampled rows: one flush, under one frame budget on the machine's quiet reading (Q17d rule: report only, no gate).

## 7. Risks
1. **Budget** (first): about +1 800 B against a +700 B grant margin; see Q6-1. The base seam (+50-70) eats the dom base margin (415 B): measure before and after.
2. **Menu focus return vs mode entry** (blur leaves the mode at once). Mitigation: enter on the next task.
3. **Alt+R** collides with some browser/OS shortcuts (Windows AltGr layouts send Ctrl+Alt: excluded by « no Ctrl »); Mac Option+R yields `®`: `code` first.
4. **Arabic measuring** differences between engines; a slightly narrow column clips text: add 1 px of slack, or `ceil` the fractional widths.
5. **Fonts not loaded** (Q6-5); icon fonts in the header allowance.
6. **Sample bias**: a wide value in row 5 000 is missed (documented, choice 2).
7. **Virtual columns**: a column leaving the window while in the mode: leave quietly; the buttons' layer must be removed with the mode (leak, check destroy during the mode).
8. **Escape restore of flexibility** needs a state snapshot; a concurrent `defs` change must discard it (test).
9. **Live region noise**: key runs said once (reuse the 300 ms `hush`); `size.autoAll` count must be the number *actually changed*.
10. **Pinned-end column grip reversal** applies to the pointer only; a regression test pins that the keys do not reverse.
11. `COLUMNS_KEYS` growth breaks any consumer that composes only `move.*` texts (demos, Angular example): update every `FR_COLUMNS` import site in the same step.

## 8. Order of work
Tests first (5) → pure `fitWidth` / `stepWidth` (red then green) → mode state machine → API + `ColumnsApi` typing so the menu items appear → base dblclick seam → measuring + probe → CSS and texts (fr, en, ar) → browser runs → size measure → mutants on the two pure functions → STATUS.md and this file's « Done » section. Gate before the commit: `build`, `test:ci`, `test:perm`, `typecheck`, `check:size`, Chrome `--only columns`.

## Done (2026-10-27, implementer; nothing committed, no review yet)
First stopped on the budget (`dom/columns` 3 996 against 3 500); the owner granted Q6-6 (4 200, `columns.css` 1 200,
texts 550 / 650 / 850), then the step was finished.

Built: base seam (`attachResize` dblclick → `GridContext.fit`, a finger's taps excluded); `columns/size.ts` (`fits`:
hidden copies of the header and mounted cells beside their originals, a plain cell per other text of the first 200
displayed rows, all written, then all read, then removed); the mode in `columns/index.ts` (Alt+R by `code` then `key`,
±10 / Shift 1 mirrored in RTL, Home fits, Enter keeps, Escape restores width and flexibility, Tab / press / focus elsewhere
/ sort / `columnsChanged` keep quietly; keys taken in the capture phase on the root); `autoSize(ids, { say })`,
`autoSizeAll({ say })`, `resizeMode(id)`; the menu passes `say: true`; 8 `size.*` texts × 3; `columns.css` outline
(`--dzg-resize-mode`, pair in `contrast-pairs.json`); demo comment in `playground/demos/orders-edit.ts`.
Deviations from §1–§3: no buttons (Q6-1); no `stepWidth` / `fitWidth` pure functions (inlined, to save bytes; no mutant
round asked); the header outside the column window is not measured; forced colours keep the dashes in the system colour.

Tests written first, each failing for the right reason before its code (« … is not a function », 100 vs 110, no
attribute, 2 900 vs > 2 900): `columns-resize-mode.test.ts` (24), `columns-autosize.test.ts` (13), `resize.test.ts`
« double-click on the grip » (4; « asks fit once » failed, the three negatives passed already), `columns-texts.test.ts`
(COLUMNS_KEYS), `column-menu-items.test.ts` (say; the mode from the menu, keys and mouse), theme `columns.test.ts` (outline,
contrast pair), `scripts/test/rebudget.test.ts` « Phase 6 step 6 » (ceilings and lines). Updated: `columns-move-keys`
« a missing text » (the size keys; an old bundle throws naming `size.mode`), older rebudget tests (ceilings moved).

Sizes (gz): `dom/columns` 3 981 / line 4 100 (grant 4 200); DOM base 21 855 / 21 980 (+71); `column-menu` 4 058 / 4 300;
`columns.css` 1 111 / 1 150 (1 200); texts en 512 / 530, fr 614 / 630, ar 746 / 800 (550 / 650 / 850).
Browser (one at a time): Chrome `--only columns` 41 / 41 (with the resize checks), `--only column-menu` 38 / 38;
`--only column-resize` Firefox 4 / 4, WebKit 4 / 4 (ar: Alt+R, ArrowLeft widens, Home, the menu's entry). « Ajuster
toutes les colonnes » on `orders-edit.html`: no mounted cell clipped in fr and ar, ≈ 300 ms with the clicks (not gated).
Gate (once, `caffeinate -i`, 2 workers): full vitest 442 files / 6 764 tests, `typecheck`, `build`, `check:size` 0 over, `check:contrast` 1 062 / 0. Found by the gate and fixed: physical arrow names outside `keys/` (now `intentFor`), the header shortcuts tests (Alt+R added).
