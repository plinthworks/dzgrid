// The audit screen's profile (K.8, step 18, owner Q1): every library value perf/audit-screen.ts
// imports, plus one language (Arabic, the largest, with its filter and pager texts). Measured by
// scripts/size.mjs in split mode: the initial load (this and its static chunks, plus the theme)
// against its guard 83 500 B gz (size-budget.json); the real Angular example's share against 92 000 B gz (owner S9-Q7, 2026-10-25)
// (npm run example:bytes; before it Q17a 90 000, 2026-10-22; Q14 87 000, before it 85 000); the lazy chunks (the value list,
// the date kits with tzslot) printed beside.
// Its guard: perf/test/audit-profile.test.ts. CSV export joined at step 19 (its eager part and texts;
// the run chunk is lazy, printed beside). Angular joined at step 23: the values the Angular example
// (examples/angular-audit) imports from @dzgrid/angular, measured from the wrapper's shipped
// fesm2022 (size-budget.json: `alias`, `shipped`), Angular and rxjs outside (the application's,
// recorded apart from the real build: `npm run example:bytes`).
export { createGrid } from '@dzgrid/dom';
export { filters } from '@dzgrid/dom/filters';
export { quickSearch } from '@dzgrid/dom/search';
export { pagination } from '@dzgrid/dom/pagination';
export { csvExport } from '@dzgrid/dom/export';
export { sourceRows } from '@dzgrid/core/server';
export { booleanCodecWith, idOfDataKey } from '@dzgrid/core';
export { AR } from '@dzgrid/dom/locales/ar';
export { AR_FILTERS } from '@dzgrid/dom/locales/ar-filters';
export { AR_PAGINATION } from '@dzgrid/dom/locales/ar-pagination';
export { AR_EXPORT } from '@dzgrid/dom/locales/ar-export';
export { DzGrid, DzgController, DzgExport, DzgSearch, componentPart, fromObservable } from '@dzgrid/angular';
