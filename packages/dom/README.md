# @dzgrid/dom

[DzGrid](https://github.com/plinthworks/dzgrid) in the browser, with no framework: virtual rows and columns,
pinned columns, right to left, the keyboard and screen readers (WAI-ARIA grid), editing, blocks of cells, the
clipboard, the fill handle. No runtime dependency; each feature is its own entry and loads only when used.

## Install

```sh
npm install @dzgrid/core @dzgrid/dom @dzgrid/theme
```

Optional peers, only for the features that use them: `@tzslot/core` and `@tzslot/dom` (date filters and date
editors), `gsap` (the `@dzgrid/dom/motion-gsap` entry). GSAP is never bundled; it comes under its own licence.

**Needed at build time** when you import `@dzgrid/dom/editors` or `@dzgrid/dom/filters`, even with no date column:
their date code is loaded by `import()`, and your bundler resolves every `import()` when it builds. Without
`@tzslot/*` installed, take the editors from `@dzgrid/dom/editors-base` (same `editors()`, day and instant fields typed
only, a calendar only through `loadCalendar`) and the filters from `@dzgrid/dom/filters-base` (same `filters()`, no
date form: a day or instant column gets one `missing-feature` warning, unless `loadDates` is given).

## A first grid

```ts
import { createGrid } from '@dzgrid/dom';
import { FR } from '@dzgrid/dom/locales/fr';
import '@dzgrid/theme/dzgrid.css';

type Patient = { id: string; name: string; born: string };

createGrid<Patient>(document.getElementById('grid')!, {
  rows: [{ id: '1', name: 'Amina', born: '1990-04-12' }],
  getRowId: (p) => p.id,
  columns: [
    { id: 'name', header: 'Nom', pinned: 'start' },
    { id: 'born', header: 'Naissance', type: 'day' },
  ],
  messages: FR,
  locale: 'fr-FR',
});
```

## Documentation

- [The documentation site](https://plinthworks.github.io/dzgrid/): getting started and one guide per task, with live grids (English and French).
- `llms.txt` in this package: the site's index for a language model (every page in one file: `llms-full.txt` in the repository).
- [The project's README](https://github.com/plinthworks/dzgrid#readme): every entry, what it holds, its size.
- [Behaviour sheets](https://github.com/plinthworks/dzgrid/tree/main/docs/behaviors): one per behaviour, with its tests.
- [Changelog](https://github.com/plinthworks/dzgrid/blob/main/CHANGELOG.md).

MIT licence.
