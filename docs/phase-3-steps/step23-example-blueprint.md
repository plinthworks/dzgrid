# Step 23 blueprint: the Angular example, Arabic CSV, zone demo, SSR, bytes (architect, 2026-10-20)

Decisions on top: `step23-decisions.md` (they win).

## Findings
`@angular/build` ^21.2.27 is already a root devDependency; missing: `@angular/cli`, `@angular/platform-server`. `packed/` holds dzgrid-{core,dom,angular,theme}-0.0.0.tgz (`npm run pack:local` rebuilds). No `.github/workflows`. `perf/profiles/audit.ts` ("Angular joins at 22") is K.8 at 70 532 / 85 000. The CSV check is announced in csv-export.md:43,87; an Arabic export button exists in playground/rtl.html.

## Plan
`examples/angular-audit/` (not a workspace member; own gitignored node_modules): package.json (deps: the four tarballs as `file:../../packed/dzgrid-*.tgz`, @tzslot/core and dom 2.2.0, Angular 21 core/common/platform-browser/platform-server/compiler, rxjs, zone.js; dev: @angular/cli, @angular/build, @angular/compiler-cli, typescript on 21); angular.json (`@angular/build:application`, browser src/main.ts, server src/main.server.ts, styles node_modules/@dzgrid/theme/dzgrid.css, polyfills [] for zoneless); tsconfig strictTemplates; src/app/audit.component.ts (the audit screen: dz-grid, dzgSearch, dzgExport, pagination, filters, fromObservable or sourceRows, a componentPart cell; fake server copied, not imported); src/main.ts zoneless; src/main.zone.ts (zone.js, provideZoneChangeDetection) as configuration `zone`; src/main.server.ts (provideServerRendering); src/baseline.ts (same shell, a plain table) as configuration `baseline`.
`scripts/example.mjs`: `build` (pack, install `--prefer-offline --no-audit`, ng build default/zone/baseline), `csv` (Arabic sample), `ssr` (renderApplication), `bytes`, `smoke <major>` (copy to the scratchpad, rewrite Angular to ^19/^22, install, ng build default + SSR; 19 uses provideExperimentalZonelessChangeDetection via a small providers switch; offline → "not run", never "passed"; manual only). Root scripts example:build, example:csv, example:ssr, example:bytes, example:smoke. `docs/behaviors/angular-example.md` first.

## Checks
- Build (21): exit 0, no template/strict errors, no partial/linker warnings, installed copies (not symlinks).
- Arabic CSV: the real export in Arabic RTL, ≥ 5 Arabic columns, Latin digits, a comma in a quoted cell → `examples/angular-audit/out/audit-ar.csv`; asserts: BOM EF BB BF, first header first, no U+200E/U+200F/U+061C, CRLF, RFC 4180; the owner opens it in Excel (column A = the first logical column).
- Zone demo: in `zone`, an emit from a pooled cell updates a host counter without detectChanges; scrolling adds bounded ticks (≤ 2 per step); outputs inside the zone; also zoneless.
- SSR: renderApplication resolves; host `dz-grid`, no rows; no "document is not defined", no problems, no open timers; kernel() null; the client build shows the grid; no hydration requirement.
- Smoke 19/22: ng build exit 0 and SSR renders.

## Bytes (K.8)
K.8 = DzGrid + theme initial load ≤ 85 000; Angular runtime recorded apart. From the real ng build (`--stats-json` or gzip of the initial files): A (default) − B (baseline) = DzGrid share (initial JS + theme CSS); the @dzgrid/angular contribution for information. STATUS records: (1) DzGrid + theme from the real build vs 85 000 and vs the esbuild 70 532 estimate; (2) the Angular runtime (B); (3) the wrapper share. `perf/profiles/audit.ts` gains the Angular dist entries and stays the check:size gate; the real-build number is informational. Over 85 000 → stop and report.

## Tests first
docs/behaviors/angular-example.md; perf/test/example-csv.test.ts (real csvExport through dom: BOM, order, no direction marks, quoting; no Angular); perf/test/example-ssr.test.ts and example-bytes.test.ts (skipped without the example dist); an optional Playwright check of the example (one Chrome, axe fr/ar) only if cheap.

## Drop order if heavy
1. the 19/22 smoke (later, with network); 2. the baseline build (stats attribution alone); 3. the zone browser check (the jsdom zone test of step 22). Never drop: the real ng build on 21, the Arabic CSV, the SSR render. Smoke trees (~600 MB each) installed in the scratchpad and deleted after.
