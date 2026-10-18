# DzGrid

A data grid written from scratch in TypeScript, for applications where right-to-left text, Arabic, time zones and screen readers are not an afterthought.

- **A pure core** (`@dzgrid/core`): rows, columns, sorting, filtering, quick search, selection, paging, the keyboard model — no DOM, no dependency, the same results in Node and in the browser.
- **A DOM layer** (`@dzgrid/dom`): virtual scrolling over a million rows, pinned columns, keyboard navigation following the WAI-ARIA grid pattern, tooltips, popups in the browser's top layer, rows that follow the reader's text zoom.
- **A theme** (`@dzgrid/theme`): CSS custom properties, light and dark, every text and part checked for contrast.
- **Angular** (`@dzgrid/angular`): in progress.

> **Status: in development, not published to npm yet.** Phases 0 to 2 are done (core, read-only DOM, theme, right to left, accessibility). Phase 3 (server data, filters, export, cell spans, Angular) is in progress — see [`docs/STATUS.md`](docs/STATUS.md). The API may still change.

## What it cares about

- **Right to left for real.** Direction is logical everywhere — start and end, never left and right: pinned columns, scrolling, the keyboard, popups, the theme.
- **Languages.** Sorting and searching follow the language (Arabic hamza forms, short vowels and tatweel, Arabic-Indic digits). English, French and Arabic messages ship, with their plural rules.
- **Time zones.** Days and instants are different types. A filter on "5 March" is resolved in the grid's zone, half-open, to the millisecond — also when it is sent to a server.
- **Server data without surprises.** A request gate guarantees that only the answer to the last request of the current query is shown, whatever order answers arrive in. Pages, cursors, unknown totals, retry and errors are part of the model.
- **Cells spanning rows and columns**, like an HTML table's `rowspan` and `colspan`: merged identical values, spans decided by the data, grouped headers, full-width rows (in progress).
- **Problems are values.** A bad column, filter or server answer is reported as a structured problem — never a silent failure, never a crash.
- **Small.** Every entry has a size budget (`npm run check:size`); what a grid does not use, it does not load (`@dzgrid/core/server`, `@dzgrid/core/spans` and `@dzgrid/dom/popup` are separate entries).

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

## Developing

```bash
npm install            # legacy-peer-deps is set in .npmrc
npm test               # core, conformance, DOM (jsdom), theme and tools
npm run test:ci        # the same on one worker
npm run test:tz        # again in Auckland and Los Angeles
npm run typecheck      # TypeScript, and the Angular templates with ngc
npm run build          # every package into its dist/
npm run pack:local     # the tarballs, in packed/
npm run check:size     # minified + gzipped, against size-budget.json
npm run bench          # against perf/budgets.json
npm run test:browser   # the grid in headless Chrome
npm start              # playground on http://127.0.0.1:4700 (and /rtl.html)
```

MIT — see [`LICENSE`](LICENSE).
