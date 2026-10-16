# DzGrid Phase 2 (read-only DOM, theme, RTL, basic a11y): implementation plan

## 0. Caveats

- **Nothing was run.** No tests, no typecheck, no spikes, no browser. Every number below is either quoted from a README or `ROADMAP.md`, or is a target that still has to be measured.
- **Read in full or nearly:** `CLEANROOM.md`, `CLAUDE.md`, `ROADMAP.md`, the spike READMEs for S1, S2, S4, S9 and S10, and part of S3 (lines 1–40 and 60–140).
- **Read from `ARCHITECTURE.md`:** the owner decisions and all "Ajustements" sections, §2.4–2.10, §3.0–3.3, §3.7–3.11, §3.14–3.17, §4–§8.
- **Read in the core:** `index.ts`, `internal.ts`, `model/client.ts` (first 250 lines), `layout/*`, `row/displayed.ts`, `row/node.ts`, `columns/model.ts`, the head of `columns/defs.ts`, `value/codec.ts`, the heads of `i18n/format.ts` and `value/locale.ts`, the selection functions, and the parts of `column-cache.ts` and `quick.ts` that build haystacks.
- **Other files read:** `kit.mjs`, `scripts/{spikes,size,check-contrast,build,bench}.mjs` (build and bench only their heads), `size-budget.json`, `perf/budgets.json`, `vitest.config.ts`, `vite.config.ts`, `tsconfig.spec.json`, the playground, `docs/phase-1-plan.md` (format), the head of `docs/a11y-protocol.md`, and the behaviour sheets `sort`, `selection`, `virtual-scroll`, `column-layout`.
- **Not read:** the S5–S8 READMEs; the spike prototypes' code (`s1/grid.ts`, `s4/grid.ts`, `s10/main.ts`), only their READMEs; the core tests; `conformance/runner/*`; the rest of `phase-1-plan.md`.
- **Sister projects (ours, allowed):** I looked at DzCalendar's `render/frame.ts` (FrameScheduler), `render/scope.ts`, `theme/test/theme.test.ts` and `scripts/browser.mjs` (head), and at tzslot's `tzslot.scss` (grep only). From Sehhaty I looked only at `_sehhaty-tokens.scss` (lines 175–200 and a grep), the palette ids in `brand-palettes.ts`, `theme.service.ts` (grep) and the head of `check-contrast.mjs`. The six palette ids are menthe, vert-medical, vert-drapeau, bleu-marine, teal-ocean, violet-premium. Sehhaty currently sets only `--tz-accent` and `--tz-color-scheme`.
- **Browser support from memory, [À VÉRIFIER]:** `popover` arrived in Firefox 125 (K.7 targets 120). `requestIdleCallback` is missing in Safari 17.5. CSS anchor positioning is missing in Firefox 120 and Safari 17.5.
- **Clean room:** no grid library source was opened, `node_modules` included.

## 1. Decisions to validate with the owner before coding

Each one is a deviation from, or an addition to, `ARCHITECTURE.md`. D1–D3 and D6 settle open points. **D4 and D5 depend on S11.**

- **D1 — Package layout.**
  - New `packages/dom` (`@dzgrid/dom`):
    - lib `ES2023, DOM`, strict, `exactOptionalPropertyTypes`;
    - only runtime dependency: the workspace peer `@dzgrid/core`;
    - exports `.`, `./locales/en`, `./locales/fr`, `./locales/ar`.
  - New `packages/theme` (`@dzgrid/theme`): `dzgrid.scss` → `dzgrid.css`, `contrast.css`, `contrast-pairs.json`, `tailwind.css`. **`tailwind3.css` is cut from Phase 2.**
  - Phase 2 files follow §8, trimmed. No `interact/move.ts`, `drag-rows.ts`, `autoscroll.ts`, `popup/` or `editors/`.
  - `createGrid` **requires** a `messages` bundle; no English is bundled by default. This keeps a one-language app at one dictionary (§3.9).
- **D2 — The kernel lives in the core** (`packages/core/src/kernel.ts`, pure, tested in node).
  - It owns query (sort), selection, the selection anchor and the focus position. It does not own the scroll position.
  - `dispatch(cmd, source)` takes a closed `GridCommand` union. `subscribe` emits a `GridEvent` union, each event with its `source`.
  - `saves` and `undo` from §3.17 join in Phase 4; adding them only widens the interface.
  - DOM-originated events (`cellClicked`, `firstDataRendered`) go through `emit` in `@dzgrid/core/internal`.
- **D3 — Settings take rows, not a row model, for the client case.**
  - Per §3.8 the host would have to build `clientRows` with a `ColumnLookup` the grid owns.
  - Instead the settings are `GridSettings<T> = { rows?: Iterable<T>; getRowId; columns: ColumnDef[]; … }`. The grid builds `createColumnModel` and then `clientRows`.
  - `update({ rows })` calls `setRows(rows, 'host')`. That is a diff by id, so focus and selection survive it.
  - Phase 3 adds `rowModel?: (env: { columns: ColumnLookup<T>; ctx: LocaleCtx }) => RowModel<T>`.
- **D4 — Focus in scaled mode (pending S11). Recommendation: the "physical image" placement plus a correction.**
  - In scaled mode the retained row sits at `toPhysical(offsetOf(i)) − layerTop`, relative to the row layer. That value is always below about 5 M px, never above 2²⁴.
  - So native scroll-into-view (typing in it, Shift+Tab) lands physically on it, and the grid then re-derives the logical position.
  - Native scroll-into-view in scaled mode can still leave the row up to `ratio × viewport` px off screen. So after any scroll that follows a `focusin` or a grid `keydown` in the same or next frame, the grid calls `ensureVisible(focus)` logically.
  - Every programmatic focus uses `focus({ preventScroll: true })` and then the grid's own scroll-to-row, after one rAF (S10, finding 5).
  - In non-scaled mode the formula collapses to the S10 contract (true position).
- **D5 — Scrolling that is not a wheel in scaled mode (pending S11).**
  - **Keys:** focus is always on a cell or header (roving tabindex), and the router `preventDefault`s PageUp/Down, Home/End, arrows and Space. So native key scrolling only happens with focus on the viewport. Pointerdown on a non-cell area of the viewport therefore moves focus to the focus cell, and a viewport-level `keydown` converts the scroll keys to logical moves.
  - **Touch and momentum:** "relative mapping". A physical delta that is not ours and not a scrollbar drag moves the logical offset 1:1, and the grid writes back `toPhysical(logical)`. This is adopted **only if** S11 shows the write does not cancel a fling in Chrome. Otherwise touch moves `ratio×` too far in scaled mode; we document it and keep it [À VÉRIFIER on device].
- **D6 — Cells in DOM order, sliding window, not the S1 "slot c mod S".**
  - S4 found that Chrome associates a header with a cell by DOM position, and reading order must equal `aria-colindex` order.
  - The centre segment is therefore a contiguous window of cells, added and removed at its ends like rows. The cost (about 8 % from S9's ordered vs in-place rows) is to be measured in step 9.
  - The focused cell is **retained** in the centre segment when its column scrolls out horizontally, which settles the open point in S10.
- **D7 — Render pipeline.**
  - DzCalendar's `FrameScheduler`: read, compute, write, one rAF. In the read phase only `scrollTop`, `scrollLeft` (through `dir.ts`), `clientHeight/Width` and the row-height probe are read.
  - `Map<RowKey, RowView>` plus a pool of detached `RowView`s. Never rebuild, even on a jump: rows are rebound in order around the retained row.
  - Each cell keeps a signature `(dataVersion, columnVersion, ctxKey, valueRef)`; when unchanged, nothing is written.
  - The default renderer writes into one existing `Text` node. Free-text columns (`type: 'text'`, opt-out `bidi: false`) get the `plaintext` span. Number columns get `unicode-bidi: isolate; direction: ltr` on the value (§3.9).
- **D8 — Selection.**
  - The kernel owns `SelectionState` and `anchor: RowKey | null` and reconciles on `transaction.removed`.
  - **Client "select all" means all displayed rows after the filter**, as an `include` set of their keys. `selectAll()` in exclude mode would include rows filtered out. Exclude mode stays for Phase 3 server models.
  - The checkbox column is a **DOM pseudo-column** at the head of the start segment, not a core `ColumnDef`. `aria-colcount` and `aria-colindex` count it.
  - `aria-selected` on the row is the truth; the row checkbox is decorative (`aria-hidden`). The header cell holds a `role="checkbox"` with tri-state `aria-checked` and a message label.
- **D9 — Message bundles.**
  - Flat dotted keys, `MessageValue = string | PluralForms`, placeholders `{name}`. Numbers in messages go through `formattersFor(ctx).number()`, so they use the grid's numerals.
  - About 40 keys in Phase 2, not 120: `grid.*`, `sort.*`, `selection.*`, `overlay.*`, `aria.*`, `announce.*`. Locale files write invisible characters as `\uXXXX`.
  - The grouping of `ar-DZ` ("10.000" may be read as a decimal, S4 finding 4) stays as is until the screen-reader protocol runs.
- **D10 — CSS naming and the Sehhaty projection.**
  - Keep K.9: `--tz-*` (the nine colours) plus `--dzg-*` own tokens, each defined at its point of use with a `color-mix()` fallback to `--tz-*`.
  - **Sehhaty must also project its surface, text and border onto `--tz-bg`, `--tz-bg-raised`, `--tz-fg`, `--tz-fg-muted`, `--tz-border`.** Today it sets only `--tz-accent`, so the grid would show tzslot's default surfaces inside Sehhaty.
  - The contrast fixture `packages/theme/test/fixtures/sehhaty.json` (6 palettes × light/dark × 9 `--tz-*`) is transcribed by hand from `sehhaty-dashboard/projects/ui-kit/src/lib/theme/brand-palettes.ts` and `_sehhaty-tokens.scss`. **The owner confirms the mapping.**
- **D11 — Tooltips and overlays.**
  - **Tooltips:** one tooltip element per grid, `role="tooltip"`, a sibling of the viewport inside `.dzg`, `position: fixed`, promoted with `popover="manual"` where supported. It is placed by JS in logical coordinates; no anchor positioning, which our targets lack.
  - Tooltips follow WCAG 1.4.13. They show after 500 ms of hover, or at once on keyboard focus, and only from host strings (`headerTooltip`, `tooltip(value, row)`). They can be hovered, `Escape` dismisses them, and they stay until dismissed. The focused cell gets `aria-describedby` while one is shown.
  - **Overlays** (loading, no rows, no matches, error): one `.dzg-overlay` sibling of the viewport, **outside `role="grid"`** (axe `aria-required-children`, S4), with text from the messages. `aria-busy` is set on the grid while loading, and the live region announces.
  - Phase 2 states come from the host: `update({ overlay: 'loading' | 'error' | null })`. "No rows" and "no matches" come from the counts.
- **D12 — Testing environment.**
  - **jsdom** (already installed, §5.1) for behaviour, in a vitest project `dom`. Geometry comes through an injected `Geometry` port and the scheduler runs with `sync: true`.
  - **System Chrome through `playwright-core`** for layout, axe, CDP and perf: `npm run test:browser` (`scripts/browser.mjs`, DzCalendar's pattern) and `npm run bench:browser` (`scripts/perf-browser.mjs`).
  - One browser at a time, closed in `finally`. These scripts are run by the owner, never in `test:ci`.
  - `test:browser -- --all` adds Firefox and WebKit for the RTL-pinned and focus checks only.
  - No happy-dom.
- **D13 — Quick-search warm-up after a load (the Phase 1 gap).**
  - The core gains a pure, chunked stepper; the DOM drives it in idle time. That is `requestIdleCallback` with `timeRemaining()`, falling back to `setTimeout` slices of 8 ms (Safari), paused while scrolling.
  - **Warmed haystacks are held at rest**, which goes against K.8's 25 MB: the 452 B/row measured "while searching" would be 45 MB on dataset A.
  - Recommendation: in Phase 2 the API and its measurement are delivered **default off**. Warm only the `search` kind of text and enum columns. The Phase 3 quick-search box turns it on when it is in the UI. Its memory line is added to the budgets and K.8 is re-read then.
- **D14 — Two new problem codes,** each with its conformance case: `too-many-pinned` (warning, more than 6 per side) and `autoheight-scaled` (reserved, if S11 refuses auto height in scaled mode).

## 2. Spike S11 first: retained row in scaled mode, and the unmeasured combinations

Folder `spikes/s11-scaled-focus/` (kit style, throwaway, outside the typecheck): `README.md`, `index.html`, `page.ts`, `data.ts`, `run.mjs`, `results/`.

### Prototype (`page.ts`)

It is built **on the real core**: `/packages/core/src/index.ts` is served by the kit, using `scrollMapper`, `layerPlacement`, `uniformRowLayout`/`variableRowLayout`, `visibleWindow`, `REBASE`, `MAX_PHYSICAL`.

**Data is computed from the index, with no row objects.** S1 spent about 200 MB on 1 M rows, and this machine is short on memory.

**Grid structure:**
- one scroll container `role="grid"` with `tabindex="-1"`;
- a sticky header; a body whose `block-size` is `mapper.physicalHeight`;
- a layer at `inset-block-start: layerTop`;
- rows at `inset-block-start: offsetOf(i) − base`, `contain: strict`;
- sticky segments, start (2 columns) and end (1 column);
- a centre segment of 20 columns with a cell window in DOM order (D6);
- roving tabindex and a retained row;
- a minimal key router: arrows, PageUp/Down, Home/End, Ctrl+Home/End, Space, F2 opening an `<input>` in the cell;
- wheel interception when scaled, and its own `scrollTop` writes ignored (±1 px).

**Query parameters:**
- `rows=200000|1000000`
- `retain=image|clamped|none`:
  - `image` = D4;
  - `clamped` = `clamp(offsetOf(i) − base, ±2·REBASE)` plus correction;
  - `none` = witness.
- `scroll=absolute|relative` (D5)
- `contain=strict|none`
- `dir=ltr|rtl`
- `height=uniform|auto` (S3's generator and anchor: `anchorFor`/`scrollTopFor`)

**Instrumentation in the page:**
- A `MutationObserver` on `style` records every px length written; the maximum is kept.
- Every `scrollTop` write is logged next to `mapper.maxPhysical`.
- Every `scroll` event is tagged ours or native.
- Focus, blur and focusin/focusout are logged (capture on `document`).
- `window.state()` returns: the active element, the retained key, whether DOM order equals `aria-rowindex` order, the focused cell rect against the viewport rect minus the header, and the logical and physical offsets.

### `run.mjs`

Engines run in sequence, `BROWSERS=chrome,firefox,webkit` (default all three). Each engine is wrapped as `const b = await browser(n); try { … } finally { await b.close() }`, inside an outer `try/finally` that does `site.close()`. `SIGINT` closes whatever is open. There is a timeout per scenario. Runtime target is about 3 minutes per engine, with no long frame benchmarks: at most 60 frames per scenario.

**Scenarios, each at 1 M rows (ratio about 8) and 200 k rows (about 1.6), `retain=image`, then `clamped`:**

| | What | Pass if |
|---|---|---|
| A | Focus row 500 000, column 3; API scroll to 0, to the end, back | same node, 0 blur/focusout, retained present, DOM order = rowindex order, `aria-rowindex` exact, max written length < 2²², no `scrollTop` write above `maxPhysical` |
| B | Same, retained off screen; real `ArrowDown` | focus on 500 001; cell fully visible below the header within ≤ 2 frames; no unexpected native scroll left uncorrected |
| C | Tab to the "after" input, scroll to the end, Shift+Tab | same cell focused; fully visible within ≤ 3 frames (the native jump and our correction are both logged) |
| D | F2 editor, type "Bonjour", caret at 4, scroll away, wait 300 ms, type "!" | "Bonj!our", caret at 5, 0 blur; editor visible within ≤ 3 frames (Phase 4's case, settled now) |
| E | `api.focusCell(row 999 999)` from the top | no native scroll event; grid scroll only; visible |
| F | Reverse the order while row 0 is retained and the view is at the end | retained row re-placed, still < 2²² written, DOM order sane |
| G | Native keys: (1) focus on a cell, press PageDown, Space, End, ArrowDown; (2) `viewport.focus()`, then the same keys, with and without viewport interception; (3) click on a non-cell area | (1) 0 native scroll events; (2) intercepted logical delta = expected ±1 row (not ratio×); (3) `activeElement` is the focus cell |
| H | Touch (Chrome only): CDP `Input.synthesizeScrollGesture` `{gestureSourceType:'touch', yDistance:-600, speed:800}`, absolute vs relative | relative: logical delta within 600 ± 10 %, scroll events continue after the gesture (fling not cancelled: ≥ 80 % of the distance a non-scaled list gets); absolute: delta ≈ ratio × 600 is recorded |
| I | Scrollbar drag (Chrome with `--disable-features=OverlayScrollbar`): thumb to the middle | logical ≈ `toLogical(physical)` (absolute while dragging, in relative mode too) |
| J1 | `contain: strict` + sticky pinned, RTL and LTR, `scrollX` 0/mid/max × top/mid/end, scaled | pinned segments 0 px from their physical edge; header/body ≤ 1 px; `elementFromPoint` shows pinned cells over centre cells (S2's measurements) |
| J2 | Re-anchored layer + `inset-block-start` rows: a red row at 11 positions over 1 M rows, screenshots decoded with `../s1-virtual-1m/png.mjs`; DPR 1/2/3 in Chrome, DPR 1 in Firefox and WebKit | painted top ≤ 1 device px off |
| J3 | Retained row + `contain: strict`: A–D again with `contain=strict` against `none`; Chrome CDP `Accessibility.getFullAXTree` for the retained row | same results as `none`; AX row node present, not ignored |
| J4 | Auto height + scaled: 200 000 rows with variable heights; S3's jump measurement going down, going up from the middle, from the end, and after a jump | max visible jump ≤ 1.5 px |

**Decision rules (written into the README):**
- `image` passes A–F in all three engines → D4 is adopted as written. Otherwise `clamped` + correction passing → adopt `clamped`.
- If both fail in an engine, the owner chooses: either the retained row is released past N viewports in scaled mode (accepting focus loss), or `maxPhysical` is lowered so that the engine never scales.
- G and H decide D5.
- J1–J3 failing reopens S9's choice (`contain: content` or none).
- J4 > 1.5 px: in scaled mode auto height falls back to the estimates, with problem `autoheight-scaled`.

Results go into `ROADMAP.md` (S11 row) and the "Ajustements" section of `ARCHITECTURE.md`. They are to be re-run headed by the owner.

## 3. Ordered steps (21, tests first in each)

Conventions:
- `npm test`, `typecheck`, `test:tz` and `test:ci` must be green at every step.
- Browser checks are added to `scripts/browser.mjs`, written before the code, and run by the owner.
- Expectations are written by hand.
- Each step's behaviour sheet is written in step 1.

### Step 0: S11 (section 2), then the owner validates D1–D14
**Done when** `ROADMAP.md` has the S11 row and `ARCHITECTURE.md` has the "Décisions de la Phase 2" block.

### Step 1: behaviour sheets (docs only, one commit)
- **New:** `docs/behaviors/{pinned-columns,column-resize,reading-keyboard,tooltips,overlays,direction}.md`.
- **Extended:**
  - `virtual-scroll.md`: recycling, retained row, scaled keys and touch;
  - `sort.md`: header click, Enter, Shift+Enter, `aria-sort`, announcement;
  - `selection.md`: click, Ctrl/Cmd, Shift, Space, Ctrl+A, the header box over the displayed rows.

### Step 2: keyboard intents in the core
- **Files:** `core/src/keys/{intent.ts,owners.ts}`; `conformance/cases/keyboard-intent/*`; `conformance/runner/suites/keys.ts`.
- **API:**
```ts
export type KeyOwner = 'cell' | 'header' | 'editor' | 'filter-input' | 'popup' | 'outside';
export interface KeyLike { readonly key: string; readonly ctrlKey: boolean; readonly metaKey: boolean; readonly shiftKey: boolean; readonly altKey: boolean }
export type Intent =
  | { kind: 'move'; axis: 'row' | 'col'; delta: -1 | 1 }
  | { kind: 'edge'; axis: 'row' | 'col'; to: 'first' | 'last'; withCtrl: boolean }
  | { kind: 'page'; delta: -1 | 1 }
  | { kind: 'toggleSelect' } | { kind: 'selectAll' } | { kind: 'sort'; multi: boolean };
export const INTENT_OWNERS: { readonly [K in Intent['kind']]: readonly KeyOwner[] };
export function intentFor(e: KeyLike, ctx: { dir: 'ltr' | 'rtl'; owner: KeyOwner; mode: 'nav'; mac: boolean }): Intent | null;
```
- `ArrowLeft`/`ArrowRight` appear only here (allowed by the step 3 guard).
- **Tests first:** about 40 hand-written cases in `ltr` and `rtl`, for owner `cell` and `header` (`ArrowRight` in RTL gives `move col −1`; Cmd+A on Mac and Ctrl+A elsewhere; Enter on a header gives `sort`; Space on a header gives null). A type test fails when an intent kind has no owner entry.
- **Done when** the suite is green and `public-api.test.ts` is updated.

### Step 3: the kernel
- **Files:** `core/src/kernel.ts`, `core/src/focus.ts`, `core/src/sort/toggle.ts`; `test/kernel.test.ts`; suites `sort-toggle` and `focus-fallback`.
- **API:**
```ts
export type FocusPos = { readonly kind: 'cell'; readonly row: RowKey; readonly column: string } | { readonly kind: 'header'; readonly column: string };
export function nextSort(sort: readonly SortItem[], column: string, multi: boolean): readonly SortItem[];   // asc → desc → none
export function reconcileFocus<T>(f: FocusPos | null, before: DisplayedRows<T>, after: DisplayedRows<T>, columns: ColumnLookup<T>): FocusPos | null;
export type HeaderSelection = 'none' | 'some' | 'all';
export function headerSelection<T>(s: SelectionState, d: DisplayedRows<T>): HeaderSelection;
export type GridCommand =
  | { type: 'sort.toggle'; column: string; multi: boolean } | { type: 'sort.set'; sort: readonly SortItem[] }
  | { type: 'query.set'; query: Query }
  | { type: 'selection.toggle'; row: RowKey } | { type: 'selection.only'; row: RowKey }
  | { type: 'selection.range'; target: RowKey; additive: boolean }
  | { type: 'selection.allDisplayed' } | { type: 'selection.clear' } | { type: 'selection.set'; selection: SelectionState }
  | { type: 'column.resize'; column: string; width: number; finished: boolean }
  | { type: 'column.state'; patch: readonly ColumnState[] }
  | { type: 'focus.set'; focus: FocusPos | null };
export type GridCommandResult = { readonly ok: true } | { readonly ok: false; readonly reason: string; readonly problems: readonly Problem[] };
export type GridEvent<T> =
  | { type: 'modelUpdated'; source: ChangeSource; displayed: DisplayedRows<T>; kind: ModelChange<T>['kind'] }
  | { type: 'sortChanged'; source: ChangeSource; sort: readonly SortItem[] }
  | { type: 'selectionChanged'; source: ChangeSource; selection: SelectionState; count: number | null }
  | { type: 'columnResized'; source: ChangeSource; column: string; width: number; finished: boolean }
  | { type: 'focusChanged'; source: ChangeSource; focus: FocusPos | null }
  | { type: 'cellClicked'; source: 'user'; row: RowNode<T>; column: string }
  | { type: 'problems'; source: ChangeSource; problems: readonly Problem[] }
  | { type: 'firstDataRendered'; source: 'data' };
export interface GridKernel<T> {
  readonly rows: ClientModel<T>; readonly columns: ColumnModel<T>;
  readonly selection: SelectionState; readonly anchor: RowKey | null; readonly focus: FocusPos | null;
  dispatch(cmd: GridCommand, source: ChangeSource): GridCommandResult;
  subscribe(fn: (e: GridEvent<T>) => void): () => void;
  destroy(): void;
}
export function createKernel<T>(o: { rows: ClientModel<T>; columns: ColumnModel<T> }): GridKernel<T>;
// internal.ts: emit(kernel, event)
```
- `reconcileFocus` falls back to the nearest displayed row at the old index, and to `header` when there are no rows.
- **Tests first:**
  - `nextSort` cycles; Shift adds a column to the end; a column that cannot sort gives an error result.
  - After removing the focused row, focus goes to the row now at its index, then to the previous one at the end.
  - A selection range whose anchor is filtered out gives `ok:false` with reason `anchor-not-displayed`.
  - `allDisplayed` under a filter selects only the displayed keys.
  - After a transaction that removes selected rows, the selection is reconciled and `selectionChanged` has `source: 'data'`.
  - Every event carries its source; a `host` dispatch never emits `user`.
- **Done when** the core has no DOM (purity green) and the core size is still within its budget.

### Step 4: `@dzgrid/dom` scaffold and the guards
- **Files:**
  - `packages/dom/{package.json,tsconfig.json,tsconfig.build.json,src/index.ts}`;
  - vitest project `dom` (jsdom; aliases for core) in `vitest.config.ts`;
  - `typecheck` gains the dom `tsc`;
  - `scripts/build.mjs`: `PACKAGES = ['core','dom']` plus the locale subpath exports;
  - `packages/dom/test/guards.test.ts`, and `test/guards/planted/*.ts.txt` (planted violations, read as text).
- **Guards, built on the TypeScript scanner and AST like `purity.test.ts`. They scan `packages/dom/src/**`, and also `packages/theme/*.scss` for rules 1 and 3:**
  1. **No colours:** no `#[0-9a-fA-F]{3,8}\b`, `rgb(`, `hsl(`, and no assignment to `style.color|background*|border*Color`. SCSS is exempt only inside the `$tz-palette` map block.
  2. **No literal visible strings:** a string or template literal never flows into `textContent`, `innerText`, `title`, `ariaLabel`, `placeholder`, `ariaRoleDescription`, nor into `setAttribute('aria-label'|'title'|'placeholder'|'aria-roledescription'|'aria-valuetext', …)`.
  3. **No physical sides:** no `\b(left|right)\b`, `Left`, `Right`, `scrollLeft`, `clientX`, `offsetLeft`, `marginLeft`… outside `src/dir.ts`; `'ArrowLeft'`/`'ArrowRight'` allowed only in `keys/*`. In SCSS: no `left`, `right`, `margin-left`, `padding-right`, `text-align: left|right`, `float: left|right`.
  4. **No HTML injection:** no `innerHTML` or `outerHTML` writes, no `insertAdjacentHTML` (XSS, §7.1).
  5. **No invisible characters** typed into the sources (the core's `source-chars` rule).
- **Tests first:** every planted file must be caught; the clean tree passes.
- **Done when** `npm run build` produces `packages/dom/dist` and the manifest refuses `src/`.

### Step 5: messages and locales
- **Files:** `dom/src/messages.ts`, `dom/src/locales/{en,fr,ar}.ts`, `test/messages.test.ts`.
- **API:**
```ts
export const MESSAGE_KEYS = ['grid.label','grid.noRows','grid.noMatches','grid.loading','grid.error',
  'sort.ascending','sort.descending','sort.none','announce.sorted','announce.sortCleared','announce.rows',
  'announce.selected','announce.rangeCancelled','selection.row','selection.all','selection.column',
  'resize.handle','aria.header', /* … ~40 */] as const;
export type MessageKey = typeof MESSAGE_KEYS[number];
export type PluralForms = { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string };
export type MessageValue = string | PluralForms;
export type GridMessages = { readonly [K in MessageKey]: MessageValue };
export function msg(m: GridMessages, key: MessageKey, params?: Readonly<Record<string, string | number>>, ctx?: LocaleCtx): string;
export const EN: GridMessages;   // in locales/en.ts; FR, AR likewise, each `satisfies GridMessages`
```
- **Tests first:**
  - Placeholder sets are identical across en, fr and ar.
  - Every plural key in `ar` has all six `Intl.PluralRules('ar').resolvedOptions().pluralCategories`.
  - `msg(AR,'announce.rows',{n:1667})` picks `many`, and `{n:2}` picks `two`.
  - Numbers use the context's numerals (`latn` gives Latin digits for `ar-DZ`).
  - An unknown key does not compile (`@ts-expect-error`).
- **Done when** each locale file is ≤ 2 kB gz (`size-budget.json` entries).
- **Arabic text: reviewed by an Arabic reader before the phase ends.**

### Step 6: the direction module
- **Files:** `dom/src/dir.ts` (the only file that names physical sides), `test/dir.test.ts`.
- **API:**
```ts
export type Dir = 'ltr' | 'rtl';
export type ScrollConvention = 'negative' | 'reverse' | 'default';
export function scrollConvention(doc: Document): ScrollConvention;      // 1-px probe, once per document
export function inlineScroll(el: HTMLElement, dir: Dir, conv: ScrollConvention): number;   // 0..max from the logical start
export function setInlineScroll(el: HTMLElement, x: number, dir: Dir, conv: ScrollConvention): void; // clamped
export function logicalX(e: { clientX: number }, rect: DOMRectReadOnly, dir: Dir): number;
export function isOnScrollbar(e: PointerEvent, el: HTMLElement, dir: Dir): boolean;   // for D5 drag detection
export function watchDirection(host: HTMLElement, onChange: (d: Dir) => void, scope: Scope): Dir;   // 'auto'
```
- `watchDirection` observes the `dir` attribute of each ancestor and recomputes on `update()`.
- **Tests first (jsdom, `scrollLeft` stubbed per convention):** round trip at 0, 1, 37.5, max and max+50; `logicalX` in RTL equals `rect.right − clientX`; changing an ancestor's `dir` calls `onChange`.
- **Done when** guard 3 is green with this file as its only exemption.

### Step 7: infrastructure
- **Files:** `dom/src/render/{scheduler.ts,scope.ts,measure.ts}`, `dom/src/styles.ts`, tests.
- **API:**
```ts
export class FrameScheduler { constructor(win: Pick<Window,'requestAnimationFrame'|'cancelAnimationFrame'> | null, sync?: boolean);
  schedule<T>(job: { read(): T; write(v: T): void }): void; flush(): void; cancel(): void }
export class Scope { on(...): void; observe(o: { disconnect(): void }): void; timeout(fn: () => void, ms: number): void; add(fn: () => void): void; dispose(): void; readonly listenerCount: number }
export interface Geometry { viewport(): { block: number; inline: number; scrollTop: number; scrollInline: number };
  rowHeight(): number; headerBlock(): number }                // the only reads; jsdom tests inject a fake
export const LAYOUT_CSS: string;                              // all rules under :where(.dzg …)
export function injectStyles(doc: Document): void;            // once per document; skipped when injectStyles:false
```
- `FrameScheduler` is copied from DzCalendar (our code).
- **Tests first:** reads before writes; `sync` runs flush at once; after `dispose()` the `listenerCount` is 0; a CSS text assertion checks `position: sticky; inset-block-start: 0` on the header and `contain: strict` on `.dzg-row`.

### Step 8: grid shell
- **Files:** `dom/src/{grid.ts,settings.ts,index.ts}`, `dom/src/a11y/{aria.ts,live-region.ts}`; `test/grid.test.ts`; the first browser check, with `scripts/browser.mjs` (playwright-core Chrome, a Vite server on a free port, `try/finally` close).
- **API:**
```ts
export interface GridSettings<T> {
  readonly rows?: Iterable<T>; readonly getRowId: (row: T) => RowIdInput; readonly columns: readonly ColumnDef<T, any>[];
  readonly messages: GridMessages; readonly locale?: string; readonly timeZone?: string; readonly numerals?: 'latn' | 'locale';
  readonly direction?: 'auto' | 'ltr' | 'rtl'; readonly density?: 'compact' | 'comfortable' | 'spacious';
  readonly selection?: { readonly mode: 'none' | 'single' | 'multi'; readonly checkbox?: boolean; readonly click?: boolean };
  readonly overlay?: 'loading' | 'error' | null; readonly label?: string;            // host-translated accessible name
  readonly tooltips?: { readonly delayMs?: number };
  readonly onEvent?: (e: GridEvent<T>) => void; readonly injectStyles?: boolean;
  readonly overscan?: { readonly rows?: number; readonly cols?: number };
}
export interface GridApi { focusCell(row: RowKey, column: string): void; ensureVisible(row: RowKey, column?: string): void;
  select(keys: readonly RowKey[]): void; clearSelection(): void; refresh(o?: { keepScroll?: boolean }): void; announce(text: string): void }
export interface GridInstance<T> { readonly kernel: GridKernel<T>; readonly api: GridApi; update(patch: Partial<GridSettings<T>>): void; destroy(): void }
export function createGrid<T>(host: HTMLElement, settings: GridSettings<T>, env?: { geometry?: Geometry; sync?: boolean }): GridInstance<T>;
```
- **DOM tree, after S4:**
  - `.dzg[dir]`
    - `.dzg-viewport[role=grid][tabindex=-1][aria-rowcount][aria-colcount][aria-label]`
      - `.dzg-header[role=rowgroup]`
      - `.dzg-body[role=rowgroup]`, containing `.dzg-layer`
    - `.dzg-overlay` (sibling of the viewport)
    - `.dzg-tooltip` (sibling of the viewport)
    - `.dzg-live[aria-live=polite][aria-atomic=true]` (sibling of the viewport)
- **Tests first (jsdom):**
  - `aria-rowcount` = count + header rows; the live region and overlay are **not** descendants of `[role=grid]`.
  - `update({ rows })` with the same ids is a transaction, not a reset; `update({ locale })` keeps the instance.
  - `destroy()` leaves 0 listeners and 0 observers and removes the root.
  - Browser: axe has 0 violations on an empty grid and on a grid of 10 rows.

### Step 9: row and column virtualisation, and pinned segments
- **Files:** `dom/src/render/{viewport.ts,rows.ts,cells.ts,header.ts,pool.ts}`; tests `render-rows.test.ts`, `render-cols.test.ts`; browser checks.
- **Internals:** `RowView { el; key: RowKey | null; seg: { start; center; end }; cells: Map<string, CellView>; retained: boolean }` and `CellView { el; text: Text; sig: string }`.
- **Rendering:**
  - The window comes from `visibleWindow(layout, layout.center.widths, mapper, scrollTop, scrollInline, view, { overscanRows: overscanRows(speed, h), overscanCols: 2 })`.
  - Rows are placed at `inset-block-start: offsetOf(i) − placement.base`, the layer at `placement.layerTop`.
  - Centre cells are a contiguous window in DOM order (D6) at `inset-inline-start`. The header is virtualised with the same column window.
  - `aria-rowindex` = index + header rows + 1. `aria-colindex` runs over start, centre, end (+1 with the checkbox pseudo-column).
  - The identity column (`def.rowHeader`, or the first column by default) gets `role=rowheader`.
  - More than 6 pinned columns per side gives the `too-many-pinned` problem (core, D14) through the `problems` event.
- **Tests first (jsdom, fake geometry):**
  - After 50 random scrolls, DOM order = `aria-rowindex` order, and no `RowView` element is ever created after mount beyond the pool high-water mark.
  - A jump without overlap rebinds in order and never empties the body.
  - An unchanged signature writes nothing (a `MutationObserver` counts 0 mutations on a no-op refresh).
  - A one-row update rewrites only that row's cells.
  - Free-text cells have the `plaintext` span; number cells do not.
- **Browser (Chrome) tests first:**
  - Header/body alignment ≤ 1 px for every mounted column, in LTR and RTL, at `scrollX` 0, mid and max, with 2 pinned at the start and 1 at the end.
  - Pinned segments 0 px from their physical edges.
  - No frame without rows when scrolling 100 000 rows by API in 200 steps.
  - Body element and text node count ≤ 1 000 after the first render of dataset A.
- **Done when** the ordered-cells cost is recorded by `bench:browser` against an in-place variant flag, so D6's price is known.

### Step 10: scaled mode, and scrolling that is not a wheel
- **Files:** `dom/src/render/viewport.ts` (mapper lifecycle), `dom/src/interact/scroll.ts`.
- **Behaviour:**
  - The mapper is rebuilt on `ResizeObserver` and on count change.
  - Logical offset is the truth; our own writes are ignored (±1 px); `scrollTop` is clamped to `maxPhysical` before writing.
  - When scaled: a non-passive wheel listener; viewport keydown interception and focus redirect (D5); relative mapping for non-wheel, non-scrollbar deltas if S11 kept it.
  - `overflow-anchor: none`; the anchor row is corrected on inserts above the window.
- **Tests first (jsdom, mapper with ratio 8):**
  - A wheel of 100 moves the logical offset by 100.
  - Our own scroll event is ignored.
  - A `scrollTop` request of 1e12 is written clamped.
  - A transaction inserting 10 rows above the window keeps the anchor row's screen offset.
- **Browser:** 1 M rows: row 999 999 is flush with the bottom by API and through the scrollbar path (S1's checks against the real grid).

### Step 11: focus, keyboard, retained row and cell
- **Files:** `dom/src/keys/{router.ts,owner.ts,focus.ts}`; tests `keyboard.test.ts`, `focus.test.ts`; browser checks.
- **Behaviour:**
  - One `keydown` on the root; `ownerOf(target, root)`; `intentFor`, then `INTENT_OWNERS`, then a kernel dispatch or a DOM move.
  - Roving `tabindex=0` on exactly one cell.
  - The retained row follows the S10 contract, with D4's placement in scaled mode. The retained centre cell follows D6.
  - `ensureVisible` is computed from geometry (`PrefixSums` + `setInlineScroll`) and runs after one rAF. `scroll-padding-inline-*` is set to the pinned widths and `scroll-padding-block-start` to the header height.
  - Every focus call is `focus({ preventScroll: true })` plus the grid's own scroll, then the D4 correction after `focusin`.
  - Focus is reconciled through `reconcileFocus` on every `modelUpdated`.
- **Tests first (jsdom):**
  - Arrows move in logical order in both directions.
  - PageDown moves one page of rows; Ctrl+End goes to the last cell.
  - Down from the header goes to the first row.
  - Focus on r42 survives `update({ rows: sameIdsNewObjects })`, `update({ columns: newDefsArray })`, `update({ locale:'ar-DZ' })` and `update({ direction:'rtl' })`: same element, 0 `blur`.
  - Filtering the focused row out moves focus to the nearest displayed row.
- **Browser (Chrome, and `--all` for Firefox and WebKit):** S10's scenarios A, C, G and I against the real grid; S11's A–C at 1 M rows.

### Step 12: sort by click
- **Files:** `dom/src/render/header.ts` (sort indicator), `dom/src/a11y/announce.ts`.
- **Behaviour:**
  - Click → `sort.toggle`; Shift+click → multi-sort; Enter and Shift+Enter on a header do the same.
  - `aria-sort` on exactly one header (the first sort key); the others get `none` or no attribute, per APG.
  - The precedence number is shown visually for multi-sort and exposed through the header's name.
  - The live region says `announce.sorted` + `announce.rows`. It is cleared, then filled 60 ms later.
  - Focus and selection are kept, and scroll stays where it is.
- **Tests first:** the three clicks cycle asc → desc → none; `aria-sort` follows; `sortChanged` has `source: 'user'`; a column with `sortable: false` does nothing and gets no pointer cursor class; the announcement texts in fr and ar are the expected hand-written strings.

### Step 13: row selection
- **Files:** `dom/src/interact/select.ts`; tests.
- **Behaviour:**
  - Click (when `selection.click`) → only that row; Ctrl/Cmd+click → toggle; Shift+click → range from the anchor; Space → toggle; Ctrl/Cmd+A → `allDisplayed`.
  - Checkbox pseudo-column and header tri-state box (D8).
  - `aria-multiselectable` on the grid in multi mode; `aria-selected` on rows.
  - A cancelled range is announced (`announce.rangeCancelled`).
- **Tests first:**
  - Selection survives sort and filter.
  - A Shift range after the anchor is filtered out changes nothing and announces.
  - The header box goes none → all displayed → none, and shows `some` after one toggle.
  - In `single` mode Ctrl+click replaces the selection.
- **Done when** a browser check shows axe has 0 violations with the selection active.

### Step 14: column resize and flex
- **Files:** `dom/src/interact/{pointer.ts,resize.ts,hit-test.ts}`.
- **Behaviour:**
  - The handle sits at the logical end edge of the header cell. For the last end-pinned column it sits at the logical start edge, with the drag reversed (S2).
  - Pointer Events with `setPointerCapture`. Header rects are cached at `pointerdown`; nothing is read during the gesture.
  - The width is applied once per rAF through `column.resize {finished:false}` and committed on `pointerup` (`finished:true`), clamped by min and max.
  - Flex columns follow `setAvailableInline` from the `ResizeObserver`.
  - The handle is ≥ 24 px wide (`--dzg-target-min`) and `aria-hidden`; keyboard resize is Phase 5.
- **Tests first (jsdom, synthetic pointer events):** dragging +60 logical px widens by 60 in LTR, and by 60 in RTL for a −60 physical px move; `maxWidth` is respected; `columnResized` fires once with `finished:true`.
- **Browser:** a real mouse drag in LTR and RTL on a centre, start-pinned and end-pinned column, then alignment ≤ 1 px.

### Step 15: tooltips and overlays
- **Files:** `dom/src/render/{tooltip.ts,overlay.ts}`.
- **Core:** `ColumnDef` gains `headerTooltip?: string` and `tooltip?: (value: unknown, row: Readonly<T>) => string | null`. Both are host-translated; this is an additive core change.
- **Tests first:**
  - The tooltip appears after the delay, or at once on keyboard focus.
  - `Escape` hides it without moving focus; moving the pointer onto it keeps it.
  - `aria-describedby` is set only while it is shown.
  - The overlay shows `grid.noRows` when count is 0 with no query, and `grid.noMatches` when count is 0 with an active query.
  - `overlay:'loading'` sets `aria-busy="true"` and announces; `'error'` announces `grid.error`.
  - Browser: axe has 0 violations with each overlay shown; the overlay is not inside `[role=grid]`.

### Step 16: theme
- **Files:** `packages/theme/{package.json,dzgrid.scss,dzgrid.css,contrast.css,contrast-pairs.json,tailwind.css,test/theme.test.ts,test/fixtures/sehhaty.json}`; `npm run build:theme`; vitest project `theme` (node).
- **SCSS:**
  - `$tz-palette`: tzslot's nine values in `light-dark()`.
  - The `--dzg-*` tokens of §3.11, each `var(--dzg-x, color-mix(...))` at its point of use.
  - Density through `[data-density]`; `[data-theme]` like tzslot; `forced-colors` in `contrast.css`; `prefers-reduced-motion`; `@media print`; logical properties only.
- **Tests first:**
  - Drift: the compiled CSS equals what sass produces.
  - The nine `--tz-*` are present in `light-dark`.
  - No hex outside the palette block (guard 1).
  - Completeness: every `color` and `background*` var used in the SCSS appears in `contrast-pairs.json`.
- **Done when** the theme is ≤ 9 kB gz.

### Step 17: the contrast script
- **File:** `scripts/check-contrast.mjs`, rewritten from the stub, with `scripts/test/contrast.test.ts` in the `tools` project.
- **What it does:**
  - parses `dzgrid.css` custom properties;
  - resolves `var()` with fallbacks;
  - evaluates `light-dark()` per scheme;
  - evaluates `color-mix(in srgb, a p%, b)` including alpha composited on the surface;
  - computes the WCAG ratio, 4.5:1 for text and 3:1 for UI parts;
  - takes `--palette file.json`, overriding `--tz-*` per palette × scheme.
- **Tests first:** hand-computed ratios (black on white = 21, `#767676` on white ≈ 4.54); a known `color-mix` result; a planted failing pair exits 1.
- **Done when** `npm run check:contrast -- --palette packages/theme/test/fixtures/sehhaty.json` is green on 12 combinations, plus tzslot's default palette, light and dark.

### Step 18: quick-search warm-up in idle time (the Phase 1 gap, D13)
- **Core:** `ClientModel.warmSearch(o?: { kinds?: readonly HayKind[] }): SearchWarmup`.
  - `interface SearchWarmup { step(maxCells: number): boolean /* done */; readonly progress: number; cancel(): void }`.
  - It builds through `ColumnCache.haystackBuilder(kind, col, env)` (`internal`): cells in row chunks, joined at the end, stored under the same validity key.
  - It aborts when the store, columns, context or reader version changes.
- **DOM:** `dom/src/idle.ts`: `idleLoop(step, scope, { busy: () => boolean })`. It uses `requestIdleCallback`, or `setTimeout` with 8 ms slices measured by `performance.now()`, paused while scrolling. Setting: `searchWarmup?: 'idle' | 'off'` (default `'off'` in Phase 2).
- **Tests first:**
  - Haystacks built in chunks equal those built at once (property test, seeded).
  - A transaction mid-warm-up cancels it, with nothing stale kept.
  - After warm-up, the first keystroke does 0 `foldBuilds`.
- **Bench:**
  - `warm step 2 000 cells` (target ≤ 4 ms);
  - `first keystroke after warm-up, 10 text columns fr+ar` (target ≤ 20 ms);
  - memory at rest after warm-up, in bytes/row, **measured**, then the owner sets the budget (D13).

### Step 19: playground pages and the browser test suite
- **Files:**
  - `playground/index.html` and `main.ts`: dataset A from `perf/dataset.ts`, with controls for locale (fr, en, ar-DZ), direction, light/dark, the six palettes (from the fixture), density, 1 M rows, overlay buttons and selection mode;
  - `playground/rtl.html`;
  - `playground/perf.html`;
  - `vite.config.ts`: aliases for dom and theme, multi-page.
- **`scripts/browser.mjs` (`npm run test:browser`), checks added along the steps, plus:**
  - **`aria-rowindex` exact after scroll through CDP:**
    - `Accessibility.getFullAXTree`, then for each `row` node `DOM.resolveNode` + `getAttributes`;
    - the attribute must equal the model's index of the row's `data-dzg-row` + header rows + 1;
    - checked at rows 0, 5 000, 99 999 and with the retained row off screen;
    - AX order = rowindex order; the retained row is not `ignored`.
  - **axe-core** (`node_modules/axe-core/axe.min.js` injected) in fr and ar, LTR and RTL, light and dark, after scroll, with the selection active, and with each overlay.
  - Palette switched live with the grid on screen: the computed `--dzg-row-selected-bg` changes without re-creating the grid (same root node).
  - Clipped screenshots in LTR and RTL × light and dark to `packages/dom/test/browser/results/*.png` (gitignored), for the owner to look at.
  - Direction switched live: logical `scrollX` is kept, within ≤ 100 ms.
- **Done when** the suite exits 0 in Chrome.

### Step 20: browser perf and the phase close
- **`scripts/perf-browser.mjs` (`npm run bench:browser`)**, one Chrome, closed in `finally`, measured lines in `perf/browser-budgets.json` (section 4).
  - In the page: rAF deltas, `long-animation-frame`, our update time.
  - Through CDP, per frame: `Performance.getMetrics` (`LayoutCount`, `ScriptDuration`, `TaskDuration`).
  - A frame without rows is detected in a separate pass, so the timing pass is not disturbed.
  - Memory: `HeapProfiler.collectGarbage` then `Runtime.getHeapUsage`.
- **Phase close:**
  - set the size and time budgets at measured + 10 % (capped by §5.2 and §5.3);
  - update `ROADMAP.md` (Phase 2 section, exit checklist);
  - add "Ajustements après la Phase 2" to `ARCHITECTURE.md`;
  - architect review and code review, findings fixed with a test that fails first.

## 4. Budgets to add

**Size** (`size-budget.json`; `scripts/size.mjs` gains `external` and `.css` entries):

| Entry | How it is measured | Ceiling (§5.2) | Phase 2 budget |
|---|---|---|---|
| `@dzgrid/dom` | `packages/dom/src/index.ts` bundled with `@dzgrid/core` external, minified, gz level 9 | ≤ 30 kB | measured + 10 % |
| `@dzgrid/dom/locales/{en,fr,ar}` | each file alone | ≤ 2 kB each | measured + 10 % |
| `@dzgrid/theme` | gzip of `dzgrid.css` (raw file, `.css` entry) | ≤ 9 kB | measured + 10 % |
| profile "read-only client grid" | a synthetic entry importing `createGrid` + `clientRows` + `FR`, core bundled | — (it feeds the 85 kB audit profile in Phase 3) | recorded |

**Time and DOM** (`perf/browser-budgets.json`, Chrome, minified bundle served by Vite build or esbuild, dataset A at 1 280 × 720, 25 rows and 12 columns visible; median of 5 page loads):

| Line | Target | How it is measured |
|---|---|---|
| First render of A (rows in memory → first body frame) | ≤ 120 ms | `performance.now()` before `createGrid` to the second rAF after the first body write, plus LoAF duration |
| Body nodes after first render | ≤ 1 000 | elements + text nodes under `.dzg-body` (TreeWalker) and CDP `Memory.getDOMCounters` |
| Vertical wheel scroll, 3 000 px/s (50 px/frame, 300 frames) | ≥ 58 fps median, p95 ≤ 25 ms, script ≤ 6 ms/frame, ≤ 1 layout/frame, ≤ 1 % frames without rows | rAF deltas; CDP `LayoutCount`/`ScriptDuration` deltas per frame; a separate pass checking coverage |
| Scrollbar drag (2 000 px/frame) | same | same |
| Horizontal scroll, 30 columns, 2 pinned | same | same |
| One-row transaction | DOM ≤ 4 ms, 1 frame, ≤ 1 layout, 0 rebinds of other rows | instrumented bind counter + CDP |
| Sort click on 100 000 (numeric, warm) | ≤ 40 ms model + 1 frame | event to the next painted frame |
| Direction switched live | ≤ 100 ms, logical scroll kept | timestamp, `inlineScroll` before and after |
| 1 000 create/destroy cycles | ≤ 1 MB retained | heap after GC, before against after |
| 1 M rows (computed rows) | first render ≤ 1.2 s; scroll at the S1 thresholds | as above |
| CPU throttled ×4 (optional, owner) | thresholds ×3, no frame > 100 ms | `Emulation.setCPUThrottlingRate` |

**Node bench** (`perf/budgets.json`) gains:
- `warm step 2 000 cells`
- `first keystroke after warm-up`
- `render signature check × 10 000 cells`
- `msg() plural ar × 10 000`

Headless numbers on this M4 are indicative only. K.8's figures stay owed on a mid-range laptop, headed, run by the owner.

## 5. Risks, and what to cut if a step overruns

| Risk | Answer |
|---|---|
| S11 fails in one engine (retained row in scaled mode) | Fallbacks are in the S11 decision rules. Worst case: lower `maxPhysical` for that engine, or release the retained row in scaled mode with a documented focus loss. Either one is an owner decision; Phase 2 is not blocked for < 125 k rows. |
| Ordered cells (D6) cost too much on horizontal flings | Measure in step 9. If the cost exceeds S9's 10 %, keep ordered rows but lower overscan columns to 1; never break DOM order. |
| ≤ 1 000 body nodes is tight (about 33 rows × (16 cells + text + spans)) | Overscan columns 1, the `plaintext` span only on free-text columns, segments only when pinned columns exist. |
| `contain: strict` with sticky segments misbehaves (J1) | `contain: content` (S9: equal cost), or `contain: layout paint` on the centre segment only. |
| Firefox 120 lacks `popover` | `position: fixed` fallback inside `.dzg` (no ancestor transform). Tested in `--all`. |
| Safari lacks `requestIdleCallback` | `setTimeout` slices; warm-up is off by default anyway (D13). |
| Warm-up memory breaks K.8 | Default off; warm only the `search` kind; the owner decides with the measurement. |
| Arabic messages wrong; `ar-DZ` digit grouping read as a decimal | An Arabic reader before the close; the protocol step 5 decision is deferred and does not block. |
| Sehhaty mapping onto `--tz-*` unknown | D10. Until confirmed, the fixture marks the unmapped tokens and the check reports them, not a silent pass. |
| Native key or touch scrolling in scaled mode | D5; touch [À VÉRIFIER on device]. |
| Shared, memory-constrained machine | Browser scripts are owner-run, sequential, one browser, `finally` close; spikes use computed rows. |

**What to cut, in this order, if the phase overruns.** Each cut is written in `ROADMAP.md` with the phase it moves to.
1. `tailwind.css`, to Phase 3 (`tailwind3` is already cut).
2. Running quick-search warm-up in idle time (step 18), to Phase 3 with the quick-search box. Keep the core stepper if it is already written.
3. The cell tooltip function: keep header tooltips only, cell tooltips to Phase 5.
4. Multi-sort precedence badges: keep `aria-sort` and Shift-multi.
5. The `--all` engines for the browser suite: Chrome is mandatory, Firefox and WebKit become a one-off owner run.
6. The 1 M-row playground toggle; S11 still covers it.

**Never cut:** the Phase 2 exit criteria of §6, the guards, the retained-row contract, axe and CDP `aria-rowindex`, and the contrast check on the 12 Sehhaty combinations.

### Critical Files for Implementation
- /Users/nadou/Dev/dzgrid/packages/core/src/model/client.ts
- /Users/nadou/Dev/dzgrid/packages/core/src/layout/scroll-mapper.ts
- /Users/nadou/Dev/dzgrid/packages/core/src/layout/window.ts
- /Users/nadou/Dev/dzgrid/packages/core/src/columns/model.ts
- /Users/nadou/Dev/dzgrid/spikes/kit.mjs
- /Users/nadou/Dev/dzgrid/scripts/check-contrast.mjs
- /Users/nadou/Dev/dzcalendar/packages/dom/src/render/frame.ts
- /Users/nadou/Dev/sehhaty-dashboard/projects/ui-kit/src/lib/theme/brand-palettes.ts
