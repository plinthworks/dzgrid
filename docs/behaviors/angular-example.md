# The Angular example: the audit screen as an application ships it (step 23)

Plan: `docs/phase-3-steps/step23-example-blueprint.md`; decisions: `step23-decisions.md` (they win).

## What the user does
Opens the audit journal of an Angular application: scrolls, sorts, filters, searches, changes page, ticks rows, presses a button drawn in a cell, exports to CSV, in French or in Arabic right to left. A developer installs DzGrid from npm into an Angular 21 application, builds it with the Angular CLI, renders it on a server, and opens the exported file in Excel.

## What they observe
- The grid of the application built by `ng build` looks and behaves as the plain grid does; nothing in the build complains (no template error under `strictTemplates`, no partial-declaration or linker warning).
- On a server-rendered page the grid's place is there (`<dz-grid>`), empty: no rows are drawn on the server, nothing breaks, the page does not wait. The browser draws the grid when the application starts; no hydration is needed.
- With zone.js (an older application), a button in a cell updates a counter of the application at once, and scrolling the grid does not make Angular check the page at every frame.
- The Arabic CSV opens in Excel with its columns split, Arabic intact, Latin digits, the first logical column in column A, and a cell holding a comma kept in one cell.
- What DzGrid adds to the application's first load is measured in the application's real build, not only estimated.

## What DzGrid does
- **Installed as published:** the example (`examples/angular-audit`) is not a workspace member. It installs the packed tarballs (`npm run pack:local`, `packed/dzgrid-*.tgz`) as copies, not links, with its own Angular, tzslot, rxjs and zone.js, and builds with `@angular/build:application`. It is launched apart (`npm run example:build`, then `ng serve` in its folder); the playground keeps its light « Angular » fixture.
- **The audit screen in Angular:** `<dz-grid>` with the audit columns, a server model (`sourceRows` over `fromObservable`, the fake server copied into the example), filters (row and window), the quick search (`dzgSearch`), pagination, the CSV export (`dzgExport`, `canExport: true`), a cell drawn by an Angular component that `emit`s, French by default, Arabic right to left with `?lang=ar`.
- **Three builds of one shell:** `default` (zoneless, `provideZonelessChangeDetection`), `zone` (zone.js, `provideZoneChangeDetection`), `baseline` (the same shell drawing a plain table, no DzGrid: what Angular alone costs). The browser build has no polyfills unless zone.js is wanted.
- **Server:** `src/main.server.ts` bootstraps the same application for `renderApplication` (`@angular/platform-server`). The wrapper renders nothing on a server: the host element only, no kernel (`kernel()` is null), no `gridReady`, no timer left open.
- **Zone.js:** the grid runs outside Angular's zone and its outputs inside it (step 22): a cell's `emit` reaches the host's handler in the zone, which updates the page without `detectChanges`; a scroll step makes at most two checks of the application.
- **Bytes (K.8):** the DzGrid share of the first load is the default build's initial files (JS, gzip level 9, plus the global CSS) less the baseline's — the initial JS read from the build's stats (`--stats-json`: the page's module script and every chunk it reaches by static imports), since Angular's page hints at most ten chunks; without stats, the page's hints alone, and a page at that cap is refused: DzGrid, its theme and the wrapper. The Angular runtime (the baseline) is recorded apart, the wrapper's own share for information. The size gate stays the esbuild profile in `check:size` (`perf/profiles/audit.ts`, which now names the wrapper's values the example imports); the real-build number is recorded. Over 85 000 B: stop and ask the owner.
- **The Arabic CSV sample:** the real export (`@dzgrid/dom/export`) of the audit columns in Arabic, right to left, locale `ar-DZ` (Latin digits), with a note column whose cells hold a comma and a double quote. Written to `examples/angular-audit/out/audit-ar.csv` (not tracked) for the owner's Excel check.
- **Other Angular majors:** Angular 19 and 22 are tried by hand (`npm run example:smoke -- 19|22`): the example copied to a scratch folder, Angular rewritten to that major, installed, built, rendered on the server. Offline it says "not run", never "passed". On 19, zoneless is `provideExperimentalZonelessChangeDetection` (one small file switches it).

## Where we differ on purpose
- No server rendering of rows: a grid of health records is drawn in the browser, where the user's zone, language and rights are known; the server sends the place only. No hydration requirement.
- The example is not in the playground's menu: it has its own dependencies and its own build (owner Q1).

## Tests
- `perf/test/example-csv.test.ts` (no Angular, runs in vitest): the Arabic sample — BOM `EF BB BF`, the first header first, no U+200E, U+200F or U+061C, CRLF at every line end, RFC 4180 (every record the same number of fields, the quoted note read back whole), Latin digits only, the first data line written by hand.
- `perf/test/example-ssr.test.ts` (skipped without the example's server build): `renderApplication` resolves; `<dz-grid>` present, no grid rows; no "document is not defined", no error; the process ends by itself (no open timer); `kernel()` null.
- `perf/test/example-bytes.test.ts` (skipped without the example's builds): the DzGrid share ≤ 85 000; the baseline and the wrapper share recorded.
- `perf/test/audit-profile.test.ts`: the K.8 profile names every `@dzgrid/*` value the example imports too.
- In headless Chrome (`node scripts/example.mjs browser`): the client build shows the grid, French and Arabic; in `zone` and in `default`, an `emit` from a pooled cell updates the host's counter; ticks per scroll step bounded.
- Smoke 19 and 22 by hand: build exit 0 and the server render.

## Owner check
- Open `examples/angular-audit/out/audit-ar.csv` in Excel (Windows and Mac if possible): columns split, Arabic readable, column A is « التاريخ والوقت (Africa/Algiers) », the note with a comma stays in one cell. This answers csv-export.md's question on logical order.
