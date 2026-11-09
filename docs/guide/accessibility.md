# Accessibility

DzGrid follows the WAI-ARIA grid pattern (a treegrid for trees and groups) and aims at WCAG 2.2 AA. The draft
conformance report is [`docs/a11y/acr-wcag22.md`](../a11y/acr-wcag22.md): it says, criterion by criterion, what is
checked and how. Its screen-reader listening is not done yet, so the criteria that rest on what a screen reader says
are marked « partially supports » until then.

## What the grid does

- **One tab stop.** Tab enters the grid at the focused cell; the arrows, Page Up / Down, Home / End and Ctrl+Home /
  End move inside; Tab leaves. The focus is never lost when rows are sorted, filtered, reloaded or scrolled away
  (rows are virtualised: the focused row is kept).
- **Roles and states.** `role="grid"` (or `treegrid`), real row and column counts (`aria-rowcount`, `aria-colcount`)
  even when only some rows are drawn, `aria-sort` on sorted headers, `aria-selected` and `aria-expanded` on rows,
  `aria-readonly` where editing is on.
- **Announcements.** Sorting, filtering, a page change, an export, a refused edit, a row moved are said through a live
  region, in the grid's language, with plurals.
- **Every action has a keyboard way**: column moves and sizes, row moves (Alt+Shift+arrows), the fill (Ctrl+D /
  Ctrl+R), the dock's edges and tabs, the menus (Shift+F10 or the Menu key). Dragging is never the only way.
- **Targets** of 24 px at least; **contrast** of 4.5:1 for every text and 3:1 for every part, checked by script on
  every colour pair, light and dark; **forced colours** (Windows High Contrast) use the system's colours; motion
  follows `prefers-reduced-motion`.
- **Zoom and text size.** Page zoom to 400 % works; at 320 CSS pixels wide nothing scrolls sideways outside the
  grid; rows grow with the reader's default text size.

## What is left to you

- **A name.** Give the `label` setting (`label="Invoices"`, `[label]` in Angular), or every grid on the page has the same generic
  name (« Data grid »).
- **Translated texts.** Headers are your strings, already in the user's language; the grid's own sentences come from
  `messages` (English, French and Arabic ship). A part's own texts go through its context's `msg('app.key')`.
- **The page's language and direction** (`lang` and `dir` on `<html>`): the grid follows `direction: 'auto'` and
  says its sentences in its `messages`' language.
- **Custom parts keep their promises.** A cell part draws inside a cell the grid owns (role, focus, keys stay the
  grid's); a button in it must be a real `<button type="button">` with a name. Do not move the focus yourself from a
  part; say things with the context's `announce(text)`.
- **Colours** only through the theme's variables (`--tz-*`, `--dzg-*`), so the contrast checks and the dark and
  forced-colours modes keep working. Do not convey meaning by colour alone: a `badge` part writes its text too.
- **Problems.** A `Problem` never carries row data (rows may be personal), only a code, a path and a short detail:
  log them, do not show them to the user as they are.

```ts
import { createGrid } from '@dzgrid/dom';
import { FR } from '@dzgrid/dom/locales/fr';

type Phare = { id: string; nom: string; portee: number };

document.documentElement.lang = 'fr';
document.documentElement.dir = 'ltr';

const grid = createGrid<Phare>(document.getElementById('phares')!, {
  rows: [{ id: 'p1', nom: 'Phare des Brumes', portee: 22 }],
  columns: [{ id: 'nom', header: 'Phare' }, { id: 'portee', header: 'Portée (milles)', type: 'number' }],
  getRowId: (p) => p.id,
  messages: FR,
  locale: 'fr-FR',
  label: 'Phares de la côte',
  direction: 'auto',
});

grid.api.announce('Liste mise à jour');
```

The owner's hand-made listening route (keyboard and screen readers, the essential path) is
[`docs/a11y/parcours-essentiel.md`](../a11y/parcours-essentiel.md).
