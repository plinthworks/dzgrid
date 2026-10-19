# Step 11 blueprint: header, overlay and tooltip slots (architect, 2026-10-19)

Decisions on top: `step11-decisions.md` (they win). Byte figures are estimates: measure after the seams, before the drivers.

## 0. Shape
The base keeps its built-in header, overlay and tooltip (not parts, no part machinery) and gains small seams plus the default retry button. The part drivers for the three slots live in `@dzgrid/dom/slots`, feature `slots()` (same pattern as `spans`). Without `slots()`, a registered `header|overlay|tooltip` part is `missing-feature` (warning). Core untouched (105 B of margin). `GridFeature.parts` is step 12.

## 1. API per slot
Common: same `Part<C>` / `PartHandle<C>` / `definePart` as cells; `WiredSlot` grows to `'cell' | 'header' | 'overlay' | 'tooltip'` (type only, part.ts). Throw isolation as for cells: a throwing part is destroyed, its host falls back to the built-in text, the error goes through `g.report`.

Resolution (names looked up among that slot's parts only; a wrong-slot name is `unknown-part`, told once per registry with the `told` logic of `resolveParts` in viewport.ts):
| Slot | Order |
|---|---|
| header (per column) | `ui.header`, `header.<type>`, the bare name `header`, the built-in |
| tooltip (per column) | `ui.tooltip`, `tooltip.<type>`, the bare name `tooltip`, the built-in |
| overlay | the bare name `overlay`, the built-in |
The bare-name fallback lives in the slots entry (`names.has(slot) ? slot : null` after `partNameFor`), not in core.

Header: `SlotContext.header = PartBase & { column; label; sort: SortItem | null; sortIndex: number | null; toggleSort(multi: boolean): void }`. Mounts into the `.dzg-hlabel` span, content only. The grid keeps role columnheader, aria-colindex, aria-sort, the aria-label from `header.withSort`, the sort mark, the resize grip, `dzg-sortable`, and click-to-sort (interact/header-click.ts already ignores clicks on interactive descendants, `INTERACTIVE` / `data-dzg-owner`). `toggleSort` dispatches `sort.toggle` with source user. `update` only when column, label, sort, sortIndex, ctx, dir or the messages revision changed (shallow compare). No `filtered` / `openFilter()` now (step 13 adds them; the filter button and active mark become a `FeatureHandle.decorateHeader` seam at step 13). Extra header rows and group bands never take the header part.

Overlay: `SlotContext.overlay = PartBase & { phase: 'loading' | 'empty' | 'no-match' | 'error'; failure: unknown; retry(): void; clearFilters(): void }`. Phase computed exactly as `paintOverlay` does (noRows → empty, noMatches → no-match). `failure` = `rows.status.failure`, null outside error. `retry()` dispatches `rows.refresh` (source user), then `g.restoreFocus()`, and announces `announce.loading`. `clearFilters()` dispatches `filter.set` with an empty FilterModel (verify its literal) and `quick.set ''`. Mount when a state first appears, update on phase or failure change, destroy when the state is null (a hidden overlay holds no failure). The overlay stays outside `role="grid"`; `settings.overlay` maps as today.

Tooltip: `SlotContext.tooltip = PartBase & { text: string; value: unknown; row: Readonly<unknown> | null; column: ResolvedColumn<unknown> }`. Shown only when the host's text is non-empty (D11). For a header: value and row null. The grid keeps the single `.dzg-tooltip` (`role="tooltip"`), the top-layer popover, delay, Escape, pointer onto the tooltip, aria-describedby. Mounted at show, destroyed at hide; another part for the next anchor = destroy then mount; placement measured after the synchronous mount.

## 2. Base vs entry
Base (est. +540 B gz): `GridContext.slots?: SlotDrivers` and `FeatureHandle.slots` assigned in grid.ts like spans (60); header seam `HeaderPaint.content?(col, labelEl): boolean`, the base skips its label write when true (70); tooltip seam: `tooltipFor` returns `{text, col, row, value}`, `Tooltip.showFor(..., fill?)` / `hide()` call `g.slots?.tooltip` (90); overlay seam: `paintOverlay` asks `g.slots?.overlay(state, failure)` first (60); default retry button, created lazily, `restoreFocus`, hidden outside error (230); styles.ts `:where(.dzg-overlay button){pointer-events:auto}` (30). Locales `grid.retry` (en Retry, fr Réessayer, ar إعادة المحاولة; fr/ar files write non-ASCII as \uXXXX — build escapes with chr(92) in tool inputs); `checkMessages` gains the required key. Theme: the retry button rule.
Entry `@dzgrid/dom/slots` (est. 1 000–1 100): `Mounted<C>` helper (mount, update on shallow change, clear, throw isolation) 260; resolution 200; header driver 250; tooltip 160; overlay 150. The cell hot path (`#fillCell`) is NOT moved onto `Mounted`. `Mounted` needs stable `msg` and `announce` in `partBase`: make `announce` in viewport.ts a stable function (today a new lambda per paint).

## 3. Deferred
Full-width rows drawn by a part (step 20 or Phase 5; check that `settings.fullWidth` returning `{ part }` is accepted and ignored today). `GridFeature.parts` (step 12; fix parts.md line 37 "Features gain parts at step 11" → step 12).

## 4. Files, docs and tests first
Docs: behaviors/overlays.md (retry, phase and failure, focus after retry), tooltips.md (part, text decides, destroyed at hide), parts.md (the three slots, resolution with bare names, missing-feature, step 12 fix), filter-ui.md (button and mark are decorations), ROADMAP.
Code: dom/src/part.ts, features.ts, context.ts, grid.ts (assign g.slots; missing-feature for registered slot parts without slots(), a small dom helper if needed), render/overlay.ts, render/header.ts, render/tooltip.ts + interact/tooltips.ts, styles.ts, messages.ts + locales/{en,fr,ar}.ts, packages/theme/dzgrid.css, dom/src/slots/{index,mounted,header,tooltip,overlay}.ts + dom/src/slots.ts, package.json exports, the public-api and import-graph tests (the base never imports slots), viewport.ts (stable announce).
Tests: overlay-retry (error shows text and button; click dispatches rows.refresh; focus back to the grid; hidden outside error; loading only with no rows); slots-header (mount, update only on change; aria-sort, grip, mark survive; a click on a part button does not sort, elsewhere does; multi-sort index; ui.header / header.<type> / header resolution; unknown-part once; a throwing part falls back to text; mounts equal destroys on unmount and grid destroy); slots-tooltip (rich content; header tooltip null row/value; destroyed at hide, no retained row; aria-describedby; Escape; placement after mount; RTL); slots-overlay (four phases, failure passed, clearFilters); missing-feature for the three slots without slots(); browser: axe with the error overlay and retry in fr and ar RTL, button reachable by Tab and operable by Enter, overlay not inside role grid, no focus trap.
Verify before coding: the empty FilterModel; how size-budget.json measures a dom entry without the base (spans' externals); how to report registered-but-unused slot parts.
