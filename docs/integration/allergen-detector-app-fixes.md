# allergen-detector — app-side fixes for the DzGrid screen (from the DzGrid session, 2026-10-27)

Read-only review of products-list-dz and shared/grid-dz/*. Verdict: good base; DzGrid used correctly. Fix these app-side points while DzGrid does its « retours d'usage » pass (products-list-dz.component.ts unless noted):

1. :620-623 `onSearch` calls `loadAll()` twice (2 × 4 requests).
2. :611-617 `switchViewMode` loads before `searchTerm` is reset (stale term); columns switch while rows are still the old mode's; overlapping loads have no cancellation — an old response can overwrite a newer one (request token or `switchMap`).
3. Every CRUD action reloads all 1 604 rows (:641, :678, :694…) — patch/remove the row locally (`applyTransaction`).
4. date-range-filter.ts:121-124: `value()` prefers the applied state over the draft (a new pick may not show) and returns a new object each CD pass — make it a `computed`, draft first.
5. :272-289 the header search bypasses the filter engine (not in state, chips, clear-all; lost on column swap; blocks sorting those columns) — prefer a column text filter for now (DzGrid will let a header part set its column's filter).
6. :426 and :37 `quickSearch()`/`DzgSearch` wired but never bound; comment :503 is false — remove or bind. `ngx-translate` imported but unused.
7. i18n/RTL: texts hard-coded in French (popups too; plural built in pill-set-filter.ts:87), `locale="fr-FR"` literals; `ml-1.5` (:124, :137) not mirrored. Leave the pager glyphs and popup texts — DzGrid's pass covers them.
8. a11y: icon-only action buttons (:318-330) need `aria-label` (+ `aria-hidden` on the svg); the filter search input has only a placeholder (pill-set-filter.ts:82); the count is not aria-live; the loading overlay (:249) needs `aria-busy`/status; contrast: `.btn-go` white on #0F969C ≈ 3.6:1, `.muted` #9ca3af ≈ 2.5:1, dark pill-gray marginal.
9. Pill CSS duplicated (component :39-58 and styles.scss:466-485); `dz-grid .act` hover rules (:457-461) are dead.
10. :594-597 `onSelection(e: unknown)` — type it; `selectedRows` goes stale after a reload; `problems` stored but never shown.

Leave the workarounds tied to the 6 DzGrid gaps (pager CSS, pill-set kind, pill-options registry, the date kind's inline calendar, the `filter.clear` override): the DzGrid session removes them on its integration branch. Commit your work in its own commit and tell the DzGrid session (ngx-sheetgrid-d8); then the DzGrid screen files are the DzGrid session's until it hands back.
