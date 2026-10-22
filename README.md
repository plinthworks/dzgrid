# DzGrid

A data grid written from scratch in TypeScript, for applications where right-to-left text, Arabic, time zones and screen readers are not an afterthought.

- **A pure core** (`@dzgrid/core`): rows, columns, sorting, filtering, quick search, selection, paging, the keyboard model — no DOM, no dependency, the same results in Node and in the browser.
- **A DOM layer** (`@dzgrid/dom`): virtual scrolling over a million rows, pinned columns, keyboard navigation following the WAI-ARIA grid pattern, tooltips, popups in the browser's top layer, rows that follow the reader's text zoom; a tree (WAI-ARIA treegrid) and master/detail rows with nested grids, each its own entry.
- **A theme** (`@dzgrid/theme`): CSS custom properties, light and dark, every text and part checked for contrast.
- **Angular** (`@dzgrid/angular`): `<dz-grid>` with signals, zoneless first, cells and other parts as Angular components or templates; Angular 19 to 22.

> **Status: Phase 4 — tree, master/detail, sticky parents, floating toggle; 0.2.0 prepared, unpublished.** Phases 0 to 3 are done on the DzGrid side (core, read-only DOM, theme, right to left, accessibility; server data, filters, search, paging, CSV export, cell spans, selection rules, motion, Angular), closed on 2026-10-21. Phase 4 Parts A–C are technically closed on 2026-10-22: tree view (parent ids, nested rows or paths, lazy children from the host or the server, sticky parent rows), master/detail with nested grids, the floating filter row shown and hidden live, all in Angular too. Nothing is on npm yet (0.1.0 was never published). Next: Part D, editing; the Sehhaty integration track ([`docs/sehhaty-track.md`](docs/sehhaty-track.md)) runs beside it — see [`docs/STATUS.md`](docs/STATUS.md). The API may still change.

## What it cares about

- **Right to left for real.** Direction is logical everywhere — start and end, never left and right: pinned columns, scrolling, the keyboard, popups, the theme.
- **Languages.** Sorting and searching follow the language (Arabic hamza forms, short vowels and tatweel, Arabic-Indic digits). English, French and Arabic messages ship, with their plural rules.
- **Time zones.** Days and instants are different types. A filter on "5 March" is resolved in the grid's zone, half-open, to the millisecond — also when it is sent to a server.
- **Server data without surprises.** A request gate guarantees that only the answer to the last request of the current query is shown, whatever order answers arrive in. Pages, cursors, unknown totals, retry and errors are part of the model.
- **Cells spanning rows and columns**, like an HTML table's `rowspan` and `colspan`: merged identical values, spans decided by the data, grouped headers, full-width rows.
- **Problems are values.** A bad column, filter or server answer is reported as a structured problem — never a silent failure, never a crash.
- **Small.** Every entry has a size budget (`npm run check:size`); what a grid does not use, it does not load: each feature is its own entry, and the heavy parts (date pickers, the value list, the export run, motion) load on first use. The audit screen's whole first load — core, server, DOM, filters, paging, export, theme, Angular wrapper, one language — is 80 286 B gzipped (guard 83 500); in a real Angular 21 build (`ng build`, `npm run example:bytes`), DzGrid's share of the first load is 86 988 B (ceiling 90 000, owner decision of 2026-10-22).

## A first grid

```ts
import { createGrid } from '@dzgrid/dom';
import { FR } from '@dzgrid/dom/locales/fr';
import '@dzgrid/theme/dzgrid.css';

type Patient = { id: string; name: string; ward: string; born: string; seen: string };

const grid = createGrid<Patient>(document.getElementById('grid')!, {
  rows: patients,
  getRowId: (p) => p.id,
  columns: [
    { id: 'name', header: 'Nom', pinned: 'start' },
    { id: 'ward', header: 'Service' },
    { id: 'born', header: 'Naissance', type: 'day' },
    { id: 'seen', header: 'Dernière visite', type: 'instant' },
  ],
  messages: FR,
  locale: 'fr-FR',
  timeZone: 'Africa/Algiers',
  selection: { mode: 'multi', checkbox: true },
  pagination: { pageSize: 50 },
  onEvent: (e) => { if (e.type === 'selectionChanged') console.log(e.count); },
});
```

Rows from a server instead of memory:

```ts
import { sourceRows } from '@dzgrid/core/server';

createGrid<Patient>(host, {
  // req carries the filters (in their wire form), the sort, the page and an abort signal.
  source: sourceRows({ fetch: (req) => api.patients(req) }),
  operations: 'server',
  pagination: { pageSize: 50 },
  getRowId: (p) => p.id,
  columns,
  messages: FR,
});
```

## Documentation

- [`docs/STATUS.md`](docs/STATUS.md) — where the work is, what comes next.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — the design and every decision taken (in French).
- [`ROADMAP.md`](ROADMAP.md) — phases, steps and measures.
- [`docs/behaviors/`](docs/behaviors/) — one sheet per behaviour: what the user does, what they observe, what DzGrid does, and the tests.
- [`conformance/`](conformance/) — the core's behaviour as JSON cases, so any implementation can be checked against the same expectations.
- [`CLEANROOM.md`](CLEANROOM.md) — DzGrid takes *behaviour* from public documentation and standards, never code from other grids.

## Entries and sizes

Minified and gzipped, each entry bundled as a consumer ships it, the packages it builds on left out (`npm run check:size`, measured at the Phase 4 close, 2026-10-22).

| Entry | What it holds | Size (B gz) |
|---|---|---|
| `@dzgrid/core` | rows, columns, codecs, sort, filters, quick search, selection, client model, paging, expansion | 28 240 |
| `@dzgrid/core/server` | request gate, `sourceRows` (with server children), `toWire` (over the core) | 5 925 |
| `@dzgrid/core/csv` | `toCsv`, chunks, scopes, trees (over the core) | 1 847 |
| `@dzgrid/core/spans` | the span map (over the core) | 3 458 |
| `@dzgrid/core/rules` | selection rules (over the core) | 492 |
| `@dzgrid/core/tree` | `treeShape`: parent ids, nested rows, paths (over the core) | 3 371 |
| `@dzgrid/core/tree-lazy` | `lazyShape`: children loaded on demand (over the tree) | 1 444 |
| `@dzgrid/core/detail` | `detailShape`, `sparseRowLayout` (over the core) | 994 |
| `@dzgrid/dom` | the grid in the browser | 20 648 |
| `@dzgrid/dom/tree` | the tree on screen, sticky parents | 3 664 |
| `@dzgrid/dom/tree-lazy` | `lazyChildren` on screen | 938 |
| `@dzgrid/dom/detail` | detail panels, `nestedGrid` | 3 815 |
| `@dzgrid/dom/filters` | floating row (shown and hidden live) and filter popup (over `@dzgrid/dom/popup`, 1 472) | 9 876 |
| `@dzgrid/dom/filters`, lazy | the value list / the three date adapters (tzslot apart) | 3 793 / 2 320 |
| `@dzgrid/dom/search` | binds the host's search input | 1 298 |
| `@dzgrid/dom/pagination` | footer and pager | 3 211 |
| `@dzgrid/dom/export` | `csvExport`, eager / its lazy run (with the CSV core) | 1 200 / 4 784 |
| `@dzgrid/dom/spans` | spans in the DOM | 4 455 |
| `@dzgrid/dom/slots` | header, overlay and tooltip slots | 1 246 |
| `@dzgrid/dom/parts` | `badge()`, `cellBoolean` | 595 |
| `@dzgrid/dom/rules` | selection rules in the DOM | 654 |
| `@dzgrid/dom/motion-gsap` | `motion()`, eager / its lazy run (GSAP apart) | 593 / 2 854 |
| `@dzgrid/dom/internal` | shared by the features | 786 |
| `@dzgrid/dom/locales/{en,fr,ar}` | the grid's messages | 519 / 636 / 825 |
| `@dzgrid/dom/locales/{en,fr,ar}-tree` | the tree's messages | 162 / 197 / 266 |
| `@dzgrid/dom/locales/{en,fr,ar}-detail` | the detail panels' messages | 133 / 146 / 159 |
| `@dzgrid/theme` | the stylesheet | 2 268 |
| `@dzgrid/angular` | the Angular wrapper | 6 238 |
| profile: the audit screen (K.8) | everything above it uses, first load, with the theme and one language | 80 286 |
| the same screen in a real Angular 21 build | DzGrid's share of the first load (`ng build`, `npm run example:bytes`) | 86 988 |

Optional peers: `@tzslot/core` and `@tzslot/dom` 2.2 (date filters), `gsap` 3.13 (motion).

## Developing

```bash
npm install            # legacy-peer-deps is set in .npmrc
npm test               # core, conformance, DOM (jsdom), Angular, theme and tools
npm run test:ci        # the same on one worker
npm run test:perm      # 1 000 permutations of the audit screen and of the export, per configuration
npm run test:tz        # again in Auckland and Los Angeles
npm run typecheck      # TypeScript, and the Angular templates with ngc
npm run build          # every package into its dist/
npm run pack:local     # the four tarballs, in packed/
npm run check:size     # minified + gzipped, against size-budget.json
npm run check:contrast # every colour pair of the theme
npm run bench          # Node, against perf/budgets.json
npm run bench:browser  # headless Chrome, against perf/browser-budgets.json
npm run test:browser   # the grid in headless Chrome
npm run test:audit     # the audit screen in Chrome (-- --full: 1 000 permutations)
npm run example:build  # the Angular 21 example from the tarballs (then example:bytes, example:csv,
                       # example:ssr, example:browser; example:smoke -- 19|22 by hand)
npm start              # playground on http://127.0.0.1:4700 (and /rtl.html)
```

MIT — see [`LICENSE`](LICENSE).
