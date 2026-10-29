# DzGrid

A data grid written from scratch in TypeScript, for applications where right-to-left text, Arabic, time zones and screen readers are not an afterthought.

- **A pure core** (`@dzgrid/core`): rows, columns, sorting, filtering, quick search, selection, paging, the keyboard model — no DOM, no dependency, the same results in Node and in the browser.
- **A DOM layer** (`@dzgrid/dom`): virtual scrolling over a million rows, pinned columns, keyboard navigation following the WAI-ARIA grid pattern, tooltips, popups in the browser's top layer, rows that follow the reader's text zoom; a tree (WAI-ARIA treegrid) and master/detail rows with nested grids, each its own entry.
- **Editing** (`@dzgrid/core/edit`, `@dzgrid/dom/edit`, `/editors`, `/editors-list`): F2, Enter, a double click or typing opens a field (text, number, day, instant with a tzslot calendar loaded on demand, yes/no, a list); the application's `save` decides, one gesture is one request; a refused value blinks and says why; undo and redo, 100 gestures.
- **Blocks of cells, the clipboard, the fill handle** (`@dzgrid/core/range`, `@dzgrid/dom/range`, `/fill`): Shift+arrows, a drag, Ctrl+A; copy, cut, paste and Delete in TSV that Excel and Sheets read (the locale's numbers, formula starts guarded); the fill handle, a click-then-click fill, the keyboard fill mode, Ctrl+D / Ctrl+R, Ctrl+Enter for a whole block — each one save and one undo, right to left included.
- **A theme** (`@dzgrid/theme`): CSS custom properties in a cascade layer, light and dark, every text and part checked for contrast; two showcase themes (Midnight, Clinic) and bridges to Tailwind CSS 3 and 4 and Bootstrap 5.3.
- **Angular** (`@dzgrid/angular`): `<dz-grid>` with signals, zoneless first, cells and other parts as Angular components or templates; Angular 19 to 22.

> **Status: 1.1.0 prepared (2026-10-28, the Phase 6 close; 1.0.0 is on npm; see [`CHANGELOG.md`](CHANGELOG.md)).** Phases 0 to 6 are done (core, DOM layer, theme, server, filters, export, Angular, tree, master/detail, editing, blocks of cells, the clipboard, the fill handle; moving columns, the column menu and chooser, the grid's state, collapsible header groups, editable pinned rows, automatic row height, printing). Still open by hand: input methods and phones (a11y 124a–b), real Excel / Google Sheets / Safari checks, screen-reader listening, the Arabic review. Next: Phases 7 to 11, then the documentation website — see [`docs/STATUS.md`](docs/STATUS.md). From 1.0.0 on, breaking changes need a major version.

## What it cares about

- **Right to left for real.** Direction is logical everywhere — start and end, never left and right: pinned columns, scrolling, the keyboard, popups, the theme.
- **Languages.** Sorting and searching follow the language (Arabic hamza forms, short vowels and tatweel, Arabic-Indic digits). English, French and Arabic messages ship, with their plural rules.
- **Time zones.** Days and instants are different types. A filter on "5 March" is resolved in the grid's zone, half-open, to the millisecond — also when it is sent to a server.
- **Server data without surprises.** A request gate guarantees that only the answer to the last request of the current query is shown, whatever order answers arrive in. Pages, cursors, unknown totals, retry and errors are part of the model.
- **Cells spanning rows and columns**, like an HTML table's `rowspan` and `colspan`: merged identical values, spans decided by the data, grouped headers, full-width rows.
- **Problems are values.** A bad column, filter or server answer is reported as a structured problem — never a silent failure, never a crash.
- **Small.** Every entry has a size budget (`npm run check:size`); what a grid does not use, it does not load: each feature is its own entry, and the heavy parts (date pickers, the value list, the export run, motion) load on first use. The audit screen's whole first load — core, server, DOM, filters, paging, export, theme, Angular wrapper, one language — is 84 912 B gzipped (guard 84 950); in a real Angular 21 build (`ng build`, `npm run example:bytes`), DzGrid's share of the audit screen's first load is 94 609 B (ceiling 95 000, owner decision; the editable « stock » screen loads apart).

## Install

```sh
npm install @dzgrid/core @dzgrid/dom @dzgrid/theme
npm install @dzgrid/angular            # with Angular 19 to 22
```

ESM only, no runtime dependency (the Angular package: `tslib` only). Optional peers, only for the features that use them: `@tzslot/core` and
`@tzslot/dom` (`>=2.4.0 <3`, date filters and date editors), `gsap` (`^3.13.0`, the `@dzgrid/dom/motion-gsap`
entry; never bundled, under its own licence). Each package has a short README:
[core](packages/core/README.md), [dom](packages/dom/README.md), [theme](packages/theme/README.md),
[angular](packages/angular/README.md).

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
  onEvent: (e) => {
    if (e.type === 'selectionChanged') console.log(e.count);
    // A setting the grid refuses (a selection rule without `rules()`, an unknown part…) is told here, never thrown
    // nor logged by the grid: log it while developing. A problem never carries row data.
    if (e.type === 'problems') for (const p of e.problems) console.warn('dzgrid', p.code, p.path, p.detail);
  },
});
```

In Angular, the same through `(problems)`:
`<dz-grid … (problems)="onProblems($event)" />` with
`onProblems(ps: readonly Problem[]) { if (isDevMode()) for (const p of ps) console.warn('dzgrid', p.code, p.path, p.detail); }`.

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

Minified and gzipped, each entry bundled as a consumer ships it, the packages it builds on left out (`npm run check:size`, measured for 1.1.0, 2026-10-29).

| Entry | What it holds | Size (B gz) |
|---|---|---|
| `@dzgrid/core` | rows, columns, codecs, sort, filters, quick search, selection, client model, paging, expansion, the edit seams | 29 064 |
| `@dzgrid/core/server` | request gate, `sourceRows` (with server children), `toWire` (over the core) | 6 134 |
| `@dzgrid/core/csv` | `toCsv`, chunks, scopes, trees (over the core) | 1 877 |
| `@dzgrid/core/spans` | the span map, siblings inside a tree too (over the core) | 3 914 |
| `@dzgrid/core/rules` | selection rules (over the core) | 516 |
| `@dzgrid/core/tree` | `treeShape`: parent ids, nested rows, paths, rows always open (over the core) | 3 485 |
| `@dzgrid/core/tree-lazy` | `lazyShape`: children loaded on demand (over the tree) | 1 488 |
| `@dzgrid/core/detail` | `detailShape`, `sparseRowLayout` (over the core) | 1 012 |
| `@dzgrid/core/edit` | `createEdits`: saves, checks, refusals, undo / redo (over the core) | 3 156 |
| `@dzgrid/core/range` | blocks, TSV, copied values, paste and fill plans (over the core) | 2 902 |
| `@dzgrid/core/state` | the grid's state as small versioned JSON: columns, groups, sort, filters, search, page, density (over the core) | 1 507 |
| `@dzgrid/core/row-gaps` | where the gaps between categories stand, and the row layout that places them (over the core) | 409 |
| `@dzgrid/dom` | the grid in the browser | 22 347 |
| `@dzgrid/dom/tree` | the tree on screen, sticky parents, rows always open | 3 839 |
| `@dzgrid/dom/tree-lazy` | `lazyChildren` on screen | 944 |
| `@dzgrid/dom/detail` | detail panels, `nestedGrid` | 4 077 |
| `@dzgrid/dom/edit` | editing wired to the grid: marks, saves, stale rows, undo keys | 4 150 |
| `@dzgrid/dom/editors` | the fields, keys and bubble (over `@dzgrid/dom/popup`, 1 626) / the lazy calendar (tzslot apart) | 6 671 / 1 517 |
| `@dzgrid/dom/editors-list` | the list editor (over the popup) | 1 224 |
| `@dzgrid/dom/range` | blocks by keys and pointer, the clipboard (over the DOM) / the lazy pasted-HTML reader | 5 050 / 500 |
| `@dzgrid/dom/fill` | the fill handle, fill mode, Ctrl+D / R, bulk, one axis only (over the range entry) | 3 143 |
| `@dzgrid/dom/filters` | floating row (shown and hidden live) and filter popup (over `@dzgrid/dom/popup`) | 10 091 |
| `@dzgrid/dom/filters`, lazy | the value list / the three date adapters (tzslot apart) | 4 339 / 2 809 |
| `@dzgrid/dom/search` | binds the host's search input | 1 298 |
| `@dzgrid/dom/pagination` | footer and pager | 3 132 |
| `@dzgrid/dom/export` | `csvExport`, eager / its lazy run (with the CSV core) | 1 200 / 4 862 |
| `@dzgrid/dom/spans` | spans in the DOM | 4 733 |
| `@dzgrid/dom/groups` | collapsible header groups | 1 887 |
| `@dzgrid/dom/columns` | moving and sizing columns, by drag and by keys (over the DOM) | 3 988 |
| `@dzgrid/dom/column-menu` | the column ⋮ menu: sort, pin, size, move, filter, hide, density (over the popup) | 4 297 |
| `@dzgrid/dom/columns-panel` | « choose the columns », a dialog (over the popup) | 4 350 |
| `@dzgrid/dom/state` | `gridState()`, browser storage, the page address (over the DOM) | 1 174 |
| `@dzgrid/dom/pinned-rows` | rows pinned above and below the body (over the DOM) | 2 160 |
| `@dzgrid/dom/auto-height` | rows as tall as their wrapped text (over the DOM) | 1 237 |
| `@dzgrid/dom/row-gaps` | `rowGaps`: a space between categories (over the DOM) | 575 |
| `@dzgrid/dom/print` | `preparePrint`, `print` (over the DOM) | 1 599 |
| `@dzgrid/dom/slots` | header, overlay and tooltip slots | 1 266 |
| `@dzgrid/dom/parts` | `badge()`, `cellBoolean` | 689 |
| `@dzgrid/dom/rules` | selection rules in the DOM | 654 |
| `@dzgrid/dom/motion-gsap` | `motion()`, eager / its lazy run (GSAP apart) | 648 / 3 479 |
| `@dzgrid/dom/internal` | shared by the features (the lazy loader) | 1 201 |
| `@dzgrid/dom/locales/{en,fr,ar}` | the grid's messages | 519 / 636 / 825 |
| `@dzgrid/dom/locales/{en,fr,ar}-tree` | the tree's messages | 162 / 197 / 266 |
| `@dzgrid/dom/locales/{en,fr,ar}-detail` | the detail panels' messages | 133 / 146 / 159 |
| `@dzgrid/dom/locales/{en,fr,ar}-edit` | editing's messages | 517 / 598 / 895 |
| `@dzgrid/dom/locales/{en,fr,ar}-editors` | the editors' messages | 383 / 434 / 533 |
| `@dzgrid/dom/locales/{en,fr,ar}-range` | blocks' and the clipboard's messages | 319 / 366 / 500 |
| `@dzgrid/dom/locales/{en,fr,ar}-fill` | the fill handle's messages | 231 / 278 / 299 |
| `@dzgrid/dom/locales/{en,fr,ar}-columns` | moving columns' and the chooser's messages | 589 / 708 / 876 |
| `@dzgrid/dom/locales/{en,fr,ar}-column-menu` | the column menu's messages | 477 / 570 / 673 |
| `@dzgrid/dom/locales/{en,fr,ar}-pinned` | the pinned rows' messages | 116 / 130 / 156 |
| `@dzgrid/dom/locales/{en,fr,ar}-print` | printing's messages | 132 / 140 / 160 |
| `@dzgrid/theme` | the stylesheet / its comfortable density (`dzgrid.comfort.css`) | 2 764 / 551 |
| `@dzgrid/theme/{edit,range,fill}.css` | editing, blocks, the fill handle | 2 236 / 479 / 457 |
| `@dzgrid/theme/{columns,columns-panel,pinned-rows}.css` | columns, the columns chooser, pinned rows | 1 111 / 991 / 301 |
| `@dzgrid/theme/print.css` | printing / its unlayered copy | 334 / 292 |
| `@dzgrid/theme/{midnight,clinic}.css` | the showcase themes | 446 / 472 |
| `@dzgrid/theme/{tailwind,tailwind3,bootstrap}.css` | the framework bridges | 325 / 325 / 293 |
| `@dzgrid/angular` | the Angular wrapper | 7 316 |
| profile: the audit screen (K.8) | everything above it uses, first load, with the theme and one language | 84 912 |
| the same screen in a real Angular 21 build | DzGrid's share of the first load (`ng build`, `npm run example:bytes`, at the Phase 6 close) | 94 609 |

Optional peers: `@tzslot/core` and `@tzslot/dom` 2.4 (date filters and date editors), `gsap` 3.13 (motion).

## Developing

```bash
npm install            # legacy-peer-deps is set in .npmrc
npm test               # core, conformance, DOM (jsdom), Angular, theme and tools
npm run test:ci        # the same on one worker
npm run test:perm      # 1 000 permutations of the audit screen and of the export, per configuration
npm run test:tz        # again in Auckland and Los Angeles
npm run typecheck      # TypeScript, and the Angular templates with ngc
npm run build          # every package into its dist/
npm run pack:local     # the four 1.1.0 tarballs, in packed/
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
