# Step 17 blueprint: `/pagination` (architect, 2026-10-20)

Decisions on top: `step17-decisions.md` (they win). Sizes are estimates (×1.35). Unverified: how the publish build resolves `@dzgrid/dom/internal` as a self-reference (fallback: relative import with an `over` line, the popup precedent).

## 0. Findings
- No base footer element: `.dzg` is a flex column, the viewport `flex: 1 1 auto`; the feature appends the footer to `g.el.root` in setup; overlay, tooltip and live region are absolute/fixed; key handlers are on `el.viewport` (router.ts:71) so footer controls never reach the grid's keys; no sticky needed.
- One base fix: `.dzg-overlay` is `inset-block-end: 0` (styles.ts:30) and would cover the footer → `inset-block-end: var(--dzg-footer-size, 0px)`, set by the feature from a ResizeObserver.
- The base does nothing on a page change: scroll to top and `announce.page` are the feature's (`g.scroll.scrollTo(0)` + `g.schedule()` on `modelUpdated` kind page: at the answer on a server, at once in the browser).
- Focus stays on the pager: the viewport's focusout sets `hasFocus = false` (focus.ts:139), so a data focus change never steals it (focus.ts:165). Test only.
- The plan's footer status region is dropped (a second live region would double-speak): the count is plain text, `g.live` says `announce.page`. Amend phase-3-plugins B2.2, B2.6.
- `RowCounts` is not exported from the core index (client.ts:35): type-only export.

## 1. API
```ts
// @dzgrid/dom/pagination (src/pagination.ts -> src/pagination/{index,context,pager,count,selected,styles}.ts)
export interface PaginationOptions { readonly footer?: readonly string[] }  // fixed; default ['footer.selected','footer.count','footer.pager']
export function pagination(o?: PaginationOptions): GridFeature
export const PAGINATION_KEYS: readonly PaginationMessageKey[]              // setup throws on a missing key
```
Footer slot context (part.ts `SlotContext.footer`):
```ts
footer: PartBase & {
  readonly page: PageState;                 // never null
  readonly counts: RowCounts;
  readonly status: ModelStatus;
  readonly range: { from: number; to: number } | null;   // 1-based; null when 0 rows or loading
  readonly selection: { count: number | null; shown: number; all: boolean; canSelectAll: boolean; mode: 'none' | 'single' | 'multi' };
  go(i: number): void; next(): void; prev(): void; setSize(n: number): void;   // page.go / page.size, source user
  selectAll(): void; clearSelection(): void;                                    // selection.allFiltered / selection.clear
}
```
`count` = last `selectionChanged.count` (null = all matching, unknown); `shown` = selected keys among displayed rows; `all` = `kernel.selectionScope !== null`; stable function identities. Parts: defaults `footer.pager`, `footer.count`, `footer.selected` in `GridFeature.parts`; a host replaces them by name; missing-feature map footer → pagination exists (part.ts:164); a dotless host part may be listed in `footer`; the grid keeps the `<nav>` landmark and name around a pager part. New base rules (parts.md): `missing-feature` (warning, `settings.pagination`, detail `pagination`) when `rows.page !== null` and no `pagination()` (added to `unslotted`); `pagination()` with paging off is dormant with `invalid-page` at `features.pagination`. No new settings.

## 2. Behaviour
DOM: `div.dzg-footer` (flex, wrap, space-between, logical properties), last child of `.dzg`; `footer.selected` and `footer.count` at the inline start; `<nav aria-label="Pagination, {grid}">` with `footer.pager` at the inline end (label from `settings.label ?? grid.label`, unique per grid); outside `role="grid"`, not in aria-rowcount. Layout CSS injected (`pagination/styles.ts`, `:where`, no colour); colours in the theme; chevrons in CSS mirrored under `[dir=rtl]`; buttons ≥ `--dzg-target-min` (24 px).
Pager: first, previous, text, next, last, a native `<select>` (no page-number list, no jump input: Phase 5). Text `pager.page` "Page 3 of 20" / `pager.pageOpen` "Page 3". Disabled = `aria-disabled="true"` with the click ignored, never `disabled` (focus never drops to body); first/previous at index 0; next when `!hasNext`. Last: enabled with a known total and `canJump`; offset with unknown total: present, disabled; cursor: not rendered. Size select (`pager.size` "Rows per page", options `page.sizes`, current added if missing, hidden under 2 sizes, `page.size` on change, digits per `ctx.numerals`). `update()` changes text and aria-disabled only (nodes kept, focus kept). Native buttons only; PageUp/PageDown keep scrolling rows. Next reads `rows.page` at click time (server shows the asked page at once; cursor `hasNext` false while loading → second click no-op).
Count (plain text): words, not a dash (RTL); `count.range` "{from} to {to} of {total}"; unknown total `count.rangeOpen` "{from} to {to}" (amend server-pagination.md "of many"); `count.filtered` "{from} to {to} of {filtered} ({total} in all)" only when total is known and differs; 0 rows `announce.rows` n=0; loading → `grid.loading` (with `data-loading`); failure → `grid.error` (Retry stays in the overlay; the pager stays usable).
Selected (hidden unless selection mode is not none and something is selected): `announce.selected` (reused); `selected.hidden` "{selected} (some not shown)" when count > shown; tied all with unknown count `announce.selectedAll` (reused). Buttons: `selected.clear` "Clear selection" when count ≠ 0; `selected.selectAll` "Select all {n} rows" (plural, n = counts.filtered) when mode multi, not already tied, every displayed row selected, counts.filtered known and > displayed → `selection.allFiltered` (exclude, tied to the query); no link when the total is unknown. Focus: after Select all → Clear; after Clear → `g.restoreFocus()`.
Q2 of step 7 (owner): the header box on browser pages acts on the page only — tick adds the page's keys (core `selection.allDisplayed` becomes a union when `rows.page !== null`), untick when 'all' removes the page's keys (base `toggleAll` sends `selection.set` instead of `selection.clear`); Ctrl+A follows the box; server pages unchanged (the box and Ctrl+A select the query).
`announce.page`: "Page {page} of {count}. {range}" / `announce.pageOpen` "Page {page}. {range}"; source user only (buttons, size change); one sentence per settled action via the shared after-the-answer helper; silent on error and on a disabled click; a superseded request waits for the last answer; filter/search resets to page 0 keep their own sentences.
Page change: scroll to top at `modelUpdated` kind page; cell focus keeps its column and the row at the same index (core); pager focus untouched.
Theme: `.dzg-footer`, `.dzg-pbtn`, select with existing tokens; `[aria-disabled=true]` dimmed, not-allowed cursor; the overlay button rule extended with `.dzg-pbtn`.

## 3. `@dzgrid/dom/internal` and sizes
New entry `@dzgrid/dom/internal` (`src/internal.ts`) shared by entries: `mounted`, `settled(g, trigger, say)` (replaces filters/announce.ts and search/said.ts), `composing(e)` (from filters/dom.ts:19). Entries import it by specifier; exports line and aliases (before the `@dzgrid/dom` prefix); the base never imports it; structure.test.ts rewritten (only slots, filters, search, pagination import it); size line for the entry; every feature line gains it in `external`. Est. afterwards: slots ~900, filters ~8 850, search ~1 100.
Asks: `@dzgrid/dom` 19 100 (overlay var ~15, missing-feature ~70, Q2 toggleAll ~130; 19 000 if Q2 = keep); `@dzgrid/dom/pagination` 3 800 (new); `@dzgrid/dom/internal` 650 (new); `en/fr/ar-pagination` 560 / 680 / 880 (new); theme 2 050; core ~26 800 no ask (Q2 union ~+45; fallback: a DOM-only union via selection.set).
Keys (17, `PaginationMessageKey`, bundles `locales/{en,fr,ar}-pagination.ts`): pager.label, pager.first, pager.prev, pager.next, pager.last, pager.page, pager.pageOpen, pager.size, count.range, count.rangeOpen, count.filtered, selected.hidden, selected.selectAll (plural), selected.clear, announce.page, announce.pageOpen; reused: announce.selected, announce.selectedAll, grid.loading, grid.error, announce.rows.
Audit profile: initial load ~65 → ~69.5 kB (~77.5 with spans) of 85; steps 19 (~2.6) and 20 (~1.5) → ~81.6 kB; under 4 kB left for step 26: the GSAP motion code must be lazy (risk flagged).

## 4. Files and tests first
Docs: create `docs/behaviors/pagination-footer.md`; update server-pagination.md, selection.md, server-selection.md (Q2, footer), parts.md (footer context, no status region), phase-3-plugins B2.2/B2.6/B3, a11y-protocol §13, STATUS, ROADMAP, ARCHITECTURE "Décisions de l'étape 17", CHANGELOG, size-budget comment.
Code: create dom/src/{internal.ts, internal/mounted.ts, internal/settled.ts, pagination.ts, pagination/*.ts}, locales/{en,fr,ar}-pagination.ts; edit styles.ts (overlay var), part.ts (footer context, missing-feature), messages.ts, interact/select.ts (Q2), core kernel.ts (allDisplayed union), core index.ts (RowCounts), filters/slots/search imports, package.json exports, aliases, size-budget.json, theme, structure.test.ts.
Unit `pagination.test.ts` (en, fr, ar): client/server (cursor, offset, unknown total) button states; last hidden on cursor; aria-disabled without `disabled`; disabled click dispatches nothing; range/filtered/unknown texts; latn and arab digits; loading/error footers; size select; announce.page once per settled action (client at once, server after the answer, not on error, not on non-user sources, superseded → one sentence); focus (Next at the last page, the select, Select all → Clear, Clear → grid); selected texts and Select all conditions; Q2 box union, untick page only, Ctrl+A; parts (host replacement, throw isolation, mounts = destroys, dotless host part, missing-feature, dormant); overlay variable; aria-rowcount unchanged; structure; scroll to top; core allDisplayed union + conformance `selection-across-pages/box-union-browser-pages`.
Random walk `pagination-walk.test.ts` (offset, cursor, client): next/prev/first/last/size/api page.go; filter/search/sort; selection clicks, box, Select all, Clear; refresh; shrinking rows; out-of-order and failing answers; locale/dir change; parts swap; destroy/remount. Invariants: settled count text = page and displayed; aria-disabled mirrors the page; ≤ 1 request per effective click, none for disabled; ≤ 1 announce.page per settled user action; a focused pager node stays the same node; selection.count = last selectionChanged; Select-all link visible iff its condition; nothing left after destroy.
Browser (fr light, ar RTL dark; client paging and server cursor unknown total): axe; first at the inline start; mirrored chevrons; digits not reversed; no overflow at 320 px; ≥ 24 px; overlay stops above the footer; unique nav names with two grids; no second live region; Tab path grid → retry → footer; Next in the click's frame on a server.
Screen reader §13: nav and button names; disabled Next unavailable and silent; Next → one sentence, focus stays; size select; silent until the answer; unknown total "Page 3", no last; Select all, Clear, "some not shown"; Arabic digits and plurals; the box on a browser page.
Lead checks: the self-reference build; nothing in installFocus steals focus from the pager; `selection.set` include in the box's untick path gives one announcement; mounted tests imports.
