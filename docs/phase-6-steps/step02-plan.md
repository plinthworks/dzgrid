# Phase 6, step 2 — moving columns (`@dzgrid/dom/columns`, part 1): the plan

Architect, 2026-10-26, read-only. Wins over it: `decisions.md` (Q-M3, Q-K2, Q-G, Q-B, « Step 1 follow-ups » Mac / O2 / O3 / O4).
Sheets: `column-move.md` (rules 1–21, cited « M n »), `group-drop-zone.md` part 1 (« D n »), `header-groups.md`, `spans.md`
(split groups), `pinned-columns.md`, `column-layout.md`, `range-selection.md` 10, a11y §21 149–151. Clean room: behaviour from
the sheets only; no other grid's code. Not touched: `packages/dom/src/{fill,range}` (another agent), the core.

## 0. Facts read in the code (what makes this step cheap)

1. **No core byte.** `column.state` takes any patch (`order`, `pinned`), emits one `columnsChanged` (source given), never
   re-sorts: `dataVersion` moves only when the *set* of shown columns changes (`model.ts` `shownIds` is sorted), so a move
   does not re-run sort or filter. `order` is a global rank across segments; a segment sorts by `order ?? defPos`, ties by
   « asked first ». `ColumnDef.movable` (`defs.ts:35`) is read nowhere today.
2. **No dom base byte.** Every seam exists: `decorateHeader` (mark the source header each paint), `keys` (runs before
   `intentFor`; Ctrl+Shift+arrows on a header mean nothing to the base: `intent.ts:67`), `scope.on` with options (capture),
   `afterRows`, `g.restoreFocus()` / `focusTo` (scrolls the column in from the *layout*, then focuses, `pendingFocus` when
   unmounted), `g.live`, `g.msg`, `g.mac`, `g.editor`, `logicalX` / `logicalSpan` / `inlineScroll` in `dir.ts`
   (the one physical file), `PrefixSums.indexAt / offsetOf`, the geometry port, the scheduler's read / write phases.
3. **Header pointer today** (`interact/header-click.ts`, `resize.ts`): both listen on `el.header`; the resize grip's
   `stopPropagation` does not stop another listener on the same element, so the feature tests `.dzg-resize` itself.
   The click sorts unless `resizing.consumeClick()`; group headers and `.dzg-hextra` never sort.
4. **Centre headers are windowed** (`header.ts` `#renderRow`: only `cols.first..last` + the focused one mounted,
   `inset-inline-start` absolute): the source cell may unmount during auto-scroll; gaps come from the layout, never the DOM.
5. **Range** (read only): its `keys` returns false on a header with Shift (`range/index.ts:435`), so Ctrl+Shift+arrows are
   free there; it handles Escape on a header when a block exists (drops it) and drops the block on any change of the shown
   columns' shape (`columnsChanged`) — exactly `range-selection.md` 10. Its pointer is on `el.body`, mouse only. **Fill**
   cancels a gesture on `columnsChanged`. Nothing to change in either.
6. **No header animation exists** (`motion-gsap` animates rows, popups); a move jumps (Q2-2 below).
7. `.dzg` is `position: relative; overflow: hidden`; `.dzg-header` is sticky inside the viewport: a drag layer appended to
   `el.root` covers header and body.

## 1. API (`packages/dom/src/columns.ts` → `columns/index.ts`, pattern of `fill()`)

```ts
export function columns(o?: ColumnsOptions): ColumnsFeature;
export interface ColumnsOptions { readonly drag?: boolean }            // default true; false: keys and api only
export interface ColumnsFeature extends GridFeature { api(grid: { kernel: GridKernel<any, any> }): ColumnsApi | null }
export interface ColumnsApi {
  /** One step / to the segment edge, as the keys (O2: never crosses a pinned edge); says `move.*` unless `say: false`. */
  move(column: string, by: -1 | 1 | 'start' | 'end', o?: { say?: boolean }): MoveResult;   // source 'user' (menu, step 3)
  readonly dropTargets: { add(el: Element, t: DropTarget): () => void };  // D1–D5, per grid
}
export type MoveResult = 'moved' | 'edge' | 'locked' | 'unknown';
export interface DropTarget { accept(column: string): boolean; drop(column: string): void; readonly label?: string }
export const COLUMNS_KEYS: readonly ColumnsMessageKey[];  // setup throws TypeError on a missing text, as fill
```
- `ColumnsMessageKey = 'move.placed' | 'move.edge' | 'move.locked' | 'move.cancelled'` in `part-texts.ts`, added to
  `g.msg`'s union (type only). Bundles `locales/{en,fr,ar}-columns.ts` with the sheet's table (`{n}`/`{total}` through
  `formattersFor(ctx).number()`, NNBSP before « : » in French).
- Pure, DOM-free module `columns/order.ts` (unit- and property-tested, reused by the chooser at step 4):
  `fullOrder(model)` (every column, hidden too, by `order ?? defPos`, ties as the model) and
  `place(full, id, gap, pinned, locked) → ColumnState[] | null` (null: no change).
- **Patch rule** (one `column.state`, source `user`): every column whose stored `order` is absent or differs from its new
  rank 0..n−1, plus `pinned` on the moved one when its segment changed. Freezing absent orders on the first move keeps the
  order stable when the host later sends new definitions (`columns.set` keeps state by id).
- **Locked (M11–13)**: ranks of `movable: false` columns are fixed slots; the unlocked list is reordered, then poured into
  the free slots. A gap whose result would not land the column where the bar shows is **not offered** (the bar snaps to the
  nearest gap that does). Keys: the target is the next/previous **unlocked visible** column of the segment (M12 « jumps
  over »). The application can still move a locked column (`column.state`).

## 2. Pointer (mouse and pen; never touch, Q-M3, M2)

| Phase | Rule | LTR | RTL |
|---|---|---|---|
| `pointerdown` on `el.header` | primary button, `pointerType !== 'touch'`, `isPrimary`, on `.dzg-hcell[data-col]` level 0, not `.dzg-hgroup`, `.dzg-hextra`, `.dzg-check`, `.dzg-resize`, nor inside `INTERACTIVE` / `[data-dzg-owner]` (filter button, ⋮, reapply mark, part controls), column `movable !== false`, `g.editor` null → **armed** (no `preventDefault`: the click still focuses, an open editor still saves on blur) | same | same |
| move < 4 px (logical, either axis) | stays a click: sort as today | | |
| move ≥ 4 px | **drag**: `setPointerCapture` on `el.header` (always mounted; a lost capture cancels, M8), root gets `data-dzg-dragging` (user-select none, cursor), current text selection cleared once, source header `data-dzg-moving` via `decorateHeader` each paint | | |
| each `pointermove` | stores the point; **one rAF** (scheduler read phase: `geometry.read()`, one `elementFromPoint` for targets; write phase: ghost, bar, auto-scroll) | | |
| landing gap | `x = logicalX(e, viewportRect, dir)`; `x < start.width` → start segment, `x > inline − end.width` → end, else centre at `x − start.width + scrollInline`; `indexAt` on the segment's `PrefixSums`, nearest edge of that column; hidden columns are not gaps (M4: lands after them) | from the left | from the right, same code |
| segment of the gap | start → `pinned: 'start'`, end → `'end'`, centre → `null` (M6; a drag may cross, O2 binds keys only) | | |
| `pointerup` same place / over source | nothing, no event, no sentence (M7) | | |
| `pointerup` elsewhere in the grid | one patch, `move.placed`, the following `click` swallowed (root capture listener, once) | | |
| over an accepting target (D2) | bar hidden, target `data-dzg-drop="over"`; release: `drop(id)` once, no patch (D3) | | |
| outside grid and targets | bar hidden, ghost kept; release: cancel quietly (M9: never hides) | | |
| Escape (document keydown, capture, during drag only, `stopImmediatePropagation`) | cancel, `move.cancelled` (M8; range's Escape never sees it) | | |
| `pointercancel`, `lostpointercapture`, window `blur`, `columns.set`, `dir` change, destroy | cancel quietly | | |

Modifiers do not change a drag (Shift+drag is a move, not a multi-sort). Under 4 px Shift+click still multi-sorts.

**Drag visuals** (a `.dzg-move` layer appended to `el.root` at the threshold, removed at the end; `aria-hidden`,
`pointer-events: none`): **ghost** = a `div` with the header's label **text** (`textContent`, never a clone: parts carry
ids and listeners), the header's inline size capped at 240 px, opacity 0.8, placed with `inset-inline-start` /
`inset-block-start` from the pointer (logical, no `translate` with a physical sign); **bar** = 2 CSS px, block size header + visible body (`header.offsetHeight + geometry.block`, read at the
threshold), `--dzg-move-bar` (fallback `var(--tz-accent)`), forced colours `Highlight`, centred on the gap and clamped
**inside** the target segment (M6). The other columns never move before the drop.

**Auto-scroll** (M5): band of 32 px inside the centre segment's start and end edges (i.e. next to the pinned segments, or
the view's edges); speed `ceil(24 × (32 − d) / 32)` px per frame through `geometry.writeScrollInline` (logical: the S2
convention handled by `dir.ts`); stops on leaving the band, at 0 / max, on release; the gap is recomputed each frame from
the last point (the pointer may be still). Centre windowing mounts the new headers as usual.

## 3. Keyboard (M14–18, Q-K2, Mac follow-up)

Taken in the feature's `keys(e, at, owner)` only when `owner === 'header'`, `at.kind === 'header'`, `!at.level`
(not group rows, not the floating filter row), `Shift` held, `Alt` not, and **`g.mac ? metaKey && !ctrlKey : ctrlKey &&
!metaKey`**; anything else returns false (body cells keep the block's Ctrl+Shift+arrows).

| Key (Win / Linux) | Key (Mac) | LTR | RTL |
|---|---|---|---|
| Ctrl+Shift+→ | Cmd+Shift+→ | one place toward the end (right) | one place toward the **start** (right) |
| Ctrl+Shift+← | Cmd+Shift+← | toward the start (left) | toward the **end** (left) |
| Ctrl+Shift+Home / End | Cmd+Shift+Home / End (Fn+Cmd+Shift+← / →) | first / last place **of its segment** | same (logical) |
| on a locked column | same | nothing, `move.locked` | same |
| at the segment edge | same | nothing, `move.edge` (never crosses a pinned edge, O2) | same |
| on a group header, floating filter, select-all box | same | not taken (O4) | same |

`delta = (key === 'ArrowRight') === (dir === 'ltr') ? +1 : −1`. Each key: one patch, then `g.restoreFocus()` (scrolls the
header fully into view from the layout, M15, WCAG 2.4.11) and, in `afterRows`, a re-focus if `document.activeElement`
fell off the header (risk R1). Sentence `move.placed` « Nom : colonne n sur total » (visible columns, reading order,
three segments) **once after a 300 ms pause** (`scope.timeout`, reset per key; the last place said). `move.edge` /
`move.locked` at once, not repeated within the pause. A pointer drop says `move.placed` at once.

## 4. Base versus entry, bytes (gz, minified, measured at the commit; grants Q-B)

| Where | Now | This step | Note |
|---|---|---|---|
| core | 28 916 / 29 000 | **0** | `column.state` as is; no new command |
| dom base | 21 566 / 22 400 | **0** (type-only: `ColumnsMessageKey` in the `msg` union) | the 834 B left are for pinned rows and `layoutFor` (steps 9–10) |
| `@dzgrid/dom/columns` | new, 3 500 | **target ≤ 2 100, hard stop 2 300** | leaves ≥ 1 200 for part 2 (resize mode, auto-size). Split: order 350, pointer + gaps + targets 900, visuals + auto-scroll 400, keys + sentences 300, api 150 |
| `locales/{en,fr,ar}-columns` | 500 / 600 / 800 | ≈ 130 / 150 / 200 | four keys; the rest of the budget is the menu's, chooser's, resize's, groups' texts |
| `@dzgrid/theme/columns.css` | 1 100 | ≤ 250 | `.dzg-move`, ghost, bar, `data-dzg-moving`, `data-dzg-dragging`, `data-dzg-drop`, forced colours; the token's fallback avoids theme-base bytes |
| K.8 guard, example, Angular | | 0 | the audit profile and the example import nothing new |

If part 1 exceeds 2 300: stop and report (cut first: the ghost's width cap, the target hit-test cache), never raise.
Config at the commit (code step, not now): `size-budget.json` four entries + css, package `exports`, the build list,
`contrast-pairs.json` (`--dzg-move-bar` vs header and row backgrounds, ≥ 3:1, light / dark / Midnight / Clinic).

## 5. Interplay

- **Resize**: a press on `.dzg-resize` never arms; a drag never starts while a resize runs (resize's `drag` is private:
  the grip test is enough because both start at `pointerdown`). Widths travel with the column (state by id).
- **Sort**: < 4 px = click (sort, Shift multi); ≥ 4 px = the following click swallowed once (cleared at the next
  `pointerdown`), Enter on the header still sorts; a move never emits `sortChanged`.
- **Filter button / ⋮ / reapply mark / part controls**: never arm (INTERACTIVE). Floating filter row: never arms, keys
  not taken there.
- **Range**: block kept during a drag and on cancel; dropped by the model on a real move (range 10, « said once » is its
  sentence: the grid then says two things — the block's and `move.placed`; order: block first; checked in jsdom). Escape
  during a drag is the drag's only.
- **Fill**: a fill gesture is cancelled by the move's `columnsChanged` (its rule); a header drag cannot start during a fill
  drag (the pointer is captured by the fill).
- **Editing**: no drag while `g.editor` is set (the press blurs it first: it saves or stays per Phase 5; if it stays, the
  press is a click). A key move needs the focus on a header, so no editor is open. Stale-order mark: its button never arms;
  F2 untouched.
- **Pinned bands**: a drop pins / unpins (M6); a 7th pinned column gets the model's `too-many-pinned` warning (no
  refusal). Keys stay in their segment (O2). The resize grip of the last end column (`dzg-resize-start`) is recomputed by
  the base paint after a move.
- **Groups**: group headers never arm (O4); a column may leave its group, which shows on each side (spans recompute at the
  paint, M19–20); collapsible groups come at step 8 (a closed group's hidden children are « hidden » gaps, M4).
- **Tree / detail / nested grids**: the router already ignores keys from a nested grid; a nested grid's header drag uses
  its own `api` registry (D5); the detail's full-width cell is not a column.
- **Server rows, pagination**: a move asks the server nothing (no query change).

## 6. Tests to write FIRST (each fails before the code; expectations by hand)

- `packages/dom/test/columns-order.test.ts` (pure): ranks, hidden kept in relative order (M4), locked slots (M12: three
  hand cases incl. « Right next to a locked column lands after it »), gaps not offered, pin changes, null on no change,
  patch freezes absent orders; **property** (1 000 seeds, `fast-check` as in `range-fill-property`): a move never changes
  a locked rank, is a permutation, and moving back restores the order.
- `columns-move.test.ts` (jsdom, fake geometry): threshold 3 px = sort / 4 px = drag; touch never; group / extra / check /
  grip / filter button / part control never arm; one patch + one `columnsChanged` (`user`) per drop; same place = no
  event; swallowed click; Escape (+ sentence), `pointercancel`, `lostpointercapture`, blur, `columns.set`, destroy cancel
  quietly; segments pin / unpin; outside = cancel, column still shown; `g.editor` set = click; `drag: false`.
- `columns-move-geom.test.ts`: gap maths LTR / RTL from the fake geometry (start, centre with scroll, end), bar clamped in
  its segment, auto-scroll speed and stop with fake frames, 1 000 columns gap in O(log n) (no DOM read per column).
- `columns-move-keys.test.ts`: the §3 table both directions, Mac (`mac: true`: Cmd yes, Ctrl no) and not (Ctrl yes, Cmd
  no), Alt+Ctrl+Shift not taken, edges, locked, O2, owners (body cell → range's, floating filter, popup, nested grid), one
  sentence after 300 ms for three keys, focus kept, `restoreFocus` asked.
- `columns-drop-targets.test.ts`: D1–D5 (accept false, thrown accept = false, thrown drop = one `invalid-drop-target`
  problem with no row data, removed target, Escape over a target, nested grid isolation, no patch).
- `columns-texts.test.ts`: three bundles complete, `COLUMNS_KEYS` throw on missing, NNBSP in French, numbers formatted.
- `columns-interplay.test.ts`: range block kept on cancel / dropped on move, sort never emitted, fill cancelled, spans
  bands split after a move.
- Base unchanged: the existing `structure.test.ts` (base knows only `features.ts`) and the physical-sides guard cover the
  new files.

**Mutants** (in a copy of the repository, `a62-` prefix if scratch): threshold `>=`→`>`; `touch` check removed; `.dzg-resize`
exclusion removed; click swallow removed; `delta` sign flipped (RTL); `metaKey`/`ctrlKey` swapped on Mac; Alt not
refused; segment edge clamp removed (O2); locked slot pour skipped; hidden-gap rule (lands before the hidden one); patch
without `pinned`; Escape `stopImmediatePropagation` removed; the 300 ms debounce made immediate; `accept` exception
swallowed as true; drop target cross-grid; auto-scroll sign. Each must be killed by a named test.

## 7. Browser checks (Chrome headless, one browser at a time, closed; Firefox and WebKit for RTL drag)

`scripts/browser-columns.mjs` (new, wired as `test:browser -- --only columns`), on `orders.html`:
1. Real drag fr LTR and `?locale=ar-DZ&theme=dark` RTL: bar on the correct side, drop lands, header and body aligned
   within 1 px after the move (start, centre after scroll, end), click after drag does not sort.
2. Pinned: drag into / out of the start and end segments (pins / unpins), bar inside the segment.
3. Auto-scroll to the far end and back, both directions; **Firefox and WebKit RTL** (scroll sign, S2; RTL scrollbar side,
   R2).
4. Keyboard: Ctrl+Shift+arrows, Home / End, `document.activeElement` still the moved header after each key (R1), the
   header fully visible, the live region text after the pause.
5. Header groups (`hr.html`): a column leaves its group, the band shows on both sides; group headers never drag.
6. axe on the grid mid-drag and after (no new violation; the layer `aria-hidden`); forced colours: the bar in `Highlight`.
7. 1 000 columns × 1 000 rows (playground `?cols=1000` or a test page): a drag across with auto-scroll, a drop at the far
   end, a key move; **time measured and reported** (patch + paint), not gated (Q17d: no quiet machine yet).
8. Touch emulation: a finger drag on a header scrolls, never moves.

`check:contrast` with the new pair. Full gate once at the commit (`build`, `test:ci`, `test:perm`, `typecheck`,
`check:size`, Chrome), `ps` checked for orphan workers.

## 8. WCAG 2.5.7 until step 3

The drag is never the only way: the keys (a keyboard way) and `api.move()` exist now; the **single-pointer** way the
criterion asks for is the ⋮ menu's « Déplacer vers le début / la fin » (step 3) and the chooser's ▲ / ▼ (step 4).
Between the two steps nothing is published (0.4.0 is prepared at step 13; 0.3.0 itself is unpublished), so no release
ever ships the drag without its single-pointer path. Step 2's STATUS line and the playground note say « 2.5.7 : chemin
sans glisser à l'étape 3 », and step 3's exit test checks the menu path (owner question Q2-1).

## 9. Risks

- **R1 focus loss**: the header renderer re-orders cells with `insertBefore`; moving the focused element blurs it in some
  engines → `hasFocus` false, tooltip hidden, an unexpected focusout. Remedy inside the entry: re-focus in `afterRows` when
  the focus was ours; the browser check 4 proves it in three engines. If not enough, a base fix (`moveBefore` where it
  exists) costs base bytes: stop and ask.
- **R2 RTL geometry**: scrollbar on the start side (WebKit) shifts `logicalX` by its width: use the viewport's
  `clientLeft` / client box, check 3 in WebKit.
- **R3 source header unmounted** during auto-scroll: capture on `el.header`, `data-dzg-moving` via `decorateHeader`.
- **R4 1 000-column patch**: up to 1 000 entries once (orders frozen), then only changed ranks; `apply` + `recompute`
  O(n log n): measured in check 7.
- **R5 keys taken before the page**: Windows screen readers, macOS (Cmd+Shift+arrows free in Chrome / Safari headers;
  listening §21 149 records it).
- **R6 sentences doubled** with the range drop: ordered and tested; listening §21 151.
- **R7 bytes**: 2 300 hard stop for part 1.

## 10. Questions for the owner

**Q2-1 — Le glisser avant le menu (WCAG 2.5.7).** Entre l'étape 2 et l'étape 3, on peut déplacer à la souris et au
clavier, pas encore « d'un seul clic ».
- **A ★** Rien n'est publié avant l'étape 3 : on garde le glisser, le menu arrive juste après. 0 octet.
- B Ajouter tout de suite deux boutons « ◀ ▶ » dans le bac à sable (pas dans la grille), avec `api.move()`.
- C Garder le glisser éteint par défaut jusqu'à l'étape 3.

**Q2-2 — Animation au lâcher.** Aujourd'hui, une colonne déplacée « saute » à sa place.
- **A ★** Pas d'animation en Phase 6 (licence GSAP à relire, octets gardés).
- B Un glissement des en-têtes et des cellules dans `motion-gsap` (≈ +150 o, désactivé si « réduire les animations »).

**Handover to step 3** (S12-Q12, 2026-10-26): the column ⋮ menu gains « Recopier vers le bas (Ctrl+D) » and « Recopier vers la droite (Ctrl+R) » on the current block (`fill(blocks).api(grid).down()` / `.end()`), the ≥ 24 px pointer equivalent that makes the fill WCAG 2.5.8-complete (`fill.md` 21); until then a known gap, nothing published.

## Done (2026-10-26, implementer; nothing committed)

**First stopped by the §4 rule** (« if part 1 exceeds 2 300: stop and report »), then **accepted by the lead** (decisions
« Step 2 lead »): the line is 2 900 (the measure plus a margin), inside the owner's 3 500 grant, so **part 2 (step 7) has
about 650 B left**; more goes back to the owner. `@dzgrid/dom/columns` measures
**2 800 B gz over the DOM base** (6 841 B min). Of that, the pure order logic (`columns/order.ts`: full order, locked
slots, offered gaps, patches, keys) weighs ~770 B (estimate 350); the rest ~2 030 (estimate 1 750). Weighed by removal:
auto-scroll ~110, drop-target hit test ~40, keys ~155. Golfing gained ~40 B; no cut reaches 2 300 without dropping a
behaviour of the sheet. Core 0 B, DOM base 0 B (type-only union).

Built so far: config (exports, build list, theme manifest, `size-budget.json` lines — `dom/columns` 2 300, texts 500 / 600 /
800, `columns.css` 1 100 —, ceilings in `rebudget.mjs`, aliases in `vitest.config.ts` and `tsconfig.spec.json`; not yet in
`vite.config.ts`); `part-texts.ts` `ColumnsMessageKey` (type only, added to the `msg` unions); `locales/{en,fr,ar}-columns`
(162 / 184 / 216 B gz); `columns/order.ts`; `columns/index.ts` (drag, gaps, bar, ghost, auto-scroll, targets, keys,
sentences, `api`). Then: `columns.scss` / `.css` (test first: `packages/theme/test/columns.test.ts`, 8 red, then green), the contrast pairs (`--dzg-move-bar` on the header, rows, hover, selection), the playground (`orders-edit.html`, `?columns=0` off; the vite alias), `scripts/browser-columns.mjs` (`--only columns`), the docs. Mutants not run (owner « Working method »: a combined review agent runs them).

Tests first (each run red before its code, for the reason named):
- `scripts/test/rebudget.test.ts` « Phase 6 step 2 » and `release.test.ts` « Phase 6 step 2 subpaths »: red on the missing
  ceiling (`null` ≠ 3 500) and the missing export, then green.
- `columns-texts.test.ts`: red (no `columns.js`), green with the bundles.
- `columns-order.test.ts` (15, incl. three 1 000-seed properties): red (no `order.js`), then green. Property findings: the
  pour keeps locked slots in the FULL order, so with a hidden or other-side movable column next to a locked one, the column
  crossing it the other way may be that one: a key move and its reverse are then not always exact (asserted exactly only
  without locked columns), and hidden columns' order relative to a hidden LOCKED one may change. Documented as a known
  limit in `column-move.md`, the current result pinned by the hand test « known limit » (red-first not applicable: it
  pins built behaviour).
- `columns-move`, `-move-geom`, `-move-keys`, `-drop-targets`, `-interplay` (62): against a stub entry, 52 red on assertions;
  10 green by nature (never-arm and owner guards: a press or key that must do nothing). The cancel tests were then made to
  assert the drag had started first. All 77 green with the code.

Deviations so far: (1) a thrown `drop` is reported through the grid's `report` (as every host callback), not as an
`invalid-drop-target` problem: that code would add bytes to the core's `PROBLEM_CODES` (0 B rule). (2) Pressing a header
that is not focused moves the focus, which drops the block by range's own rule; the drag itself never drops it (test with
the header already focused). (3) An edge sentence is not repeated within 300 ms (a time check, no timer).

Seen while measuring: `@dzgrid/dom/range` is at 4 873 / 4 800 in the working tree because of another agent's uncommitted
`range/index.ts` change (4 791 at HEAD), not this step.

Handover to step 3 unchanged (S12-Q12 fill items in the ⋮ menu).

**Gate (2026-10-26, `caffeinate -i`, one command at a time):** `test:ci` 415 files, 6 440 tests green (454 s); `typecheck`
green; `build` green; `check:size` 0 over — `dom/columns` 2 796 / 2 900, texts 162 / 184 / 216, `columns.css` 441 / 1 100
(the plan aimed ≤ 250: the ghost's box and forced colours), core 28 916, DOM base 21 565 unchanged; `check:contrast` 978
pairs, 0 below. Browser (owner « Working method »: touched groups only): `--only columns` Chrome 27 / 27 (fr light and ar
dark: real drags, pinned segments, auto-scroll both ways, Cmd+Shift keys on this Mac with Ctrl+Shift doing nothing, focus
kept, axe 0 mid-drag and after, forced colours, a finger never moves; 1 000 × 1 000: auto-scroll 485 px/s, a drop patch +
paint 143 ms, a key move 117 ms, not gated), Firefox 7 / 7 and WebKit 7 / 7 (ar right to left drag, pinned, auto-scroll);
`--only playground` 41 / 41, `--only demos` 38 / 38. Found in Chrome and fixed: the bar 1 px off in right to left (placed
from the root's border box; now the layer's box; jsdom test « a root with a 1 px border » added after). No mutants (a
combined review runs them). Demo: `http://127.0.0.1:4700/orders-edit.html` (`?locale=ar-DZ&theme=dark&skin=midnight`).

**Review fixes (2026-10-26), each test red first on the code before:** (1) range in a CLOSED shadow root kept the block
for a press on the grid's header — `range-outside.test.ts` « CLOSED shadow root » red, fixed by a capture listener on the
grid's own shadow root (the document's skips presses whose path holds that host); (2) one outside press with the
click-then-click fill armed and a block said two sentences — `range-fill.test.ts` « the fill's cancel silent » red (both
feature orders), fixed (fill silent when the block's clearing speaks for that press); (3) the swallow stayed set without a
click — red, now cleared at the end of the task (`scope.timeout(…, 0)`) or at the next press; (4) a drag cancelled by
Escape, a lost capture, a blur, new definitions or a direction change let its click sort — 6 red, the swallow now set in
`cancel()` when the drag was on; (5) a pen dragged headers — red, now the mouse only (column-move.md « As built »); (6) the
duplicate `ColumnsMessageKey` in `context.ts` removed. Mutant-gap tests added (green on arrival, they guard): a
floating-filter cell never arms; a locked column's press is a click that sorts; after a drag without its click, a new press
lets the next click sort; a button stopping its own pointerdown still clears the block. Gate: `test:ci` 6 446 green,
`typecheck`, `build`, `check:size` (columns 2 801 / 2 900, range 4 940 / 4 950, fill 2 974 / 3 000), `check:contrast` 978 / 0;
Chrome `--only columns` 27, `range` 47, `fill` 58.
