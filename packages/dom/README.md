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

- [The project's README](https://github.com/plinthworks/dzgrid#readme): every entry, what it holds, its size.
- [Behaviour sheets](https://github.com/plinthworks/dzgrid/tree/main/docs/behaviors): one per behaviour, with its tests.
- [Changelog](https://github.com/plinthworks/dzgrid/blob/main/CHANGELOG.md).

MIT licence.
