# Dock and panels

Two panels come with DzGrid: the **columns chooser** (`columnsChooser()` from `@dzgrid/dom/columns-panel`: search,
show, hide and order columns; texts `-columns`, CSS `columns-panel.css`) and the **filters panel** (`filtersPanel()` from
`@dzgrid/dom/filters-panel`: every column's filter in one list; texts `-filters-panel`, CSS `filters-panel.css`).
Without a dock, the chooser opens as a dialog and the filters panel stands at its own side.

`dock()` from `@dzgrid/dom/dock` gives them, and panels of your own, a place beside or under the rows (texts `-dock`,
CSS `dock.css`): areas `start` and `end` (beside the rows, logical sides) and `bottom`. Each area can be resized by its
edge (also with the arrow keys), collapsed to a strip, closed, or moved to another area; two panels in one area become
tabs.

```ts
import { createGrid, type GridMessages } from '@dzgrid/dom';
import { dock } from '@dzgrid/dom/dock';
import { columnsChooser } from '@dzgrid/dom/columns-panel';
import { filtersPanel } from '@dzgrid/dom/filters-panel';
import { filters } from '@dzgrid/dom/filters-base';
import { columnMenu } from '@dzgrid/dom/column-menu';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_DOCK } from '@dzgrid/dom/locales/en-dock';
import { EN_COLUMNS } from '@dzgrid/dom/locales/en-columns';
import { EN_FILTERS } from '@dzgrid/dom/locales/en-filters';
import { EN_FILTERS_PANEL } from '@dzgrid/dom/locales/en-filters-panel';
import { EN_COLUMN_MENU } from '@dzgrid/dom/locales/en-column-menu';
import '@dzgrid/theme/dzgrid.css';
import '@dzgrid/theme/dock.css';
import '@dzgrid/theme/columns-panel.css';
import '@dzgrid/theme/filters-panel.css';
import '@dzgrid/theme/menu.css';

type Potion = { id: string; name: string; colour: string; doses: number };

const messages: GridMessages = {
  ...EN,
  text: { ...EN.text, ...EN_DOCK.text, ...EN_COLUMNS.text, ...EN_FILTERS.text, ...EN_FILTERS_PANEL.text, ...EN_COLUMN_MENU.text },
};

const chooser = columnsChooser();
const panels = dock({
  open: { columns: 'end' },
  sizes: { min: 200, max: 480 },
  panels: [{
    id: 'notes',
    title: 'Notes',
    area: 'bottom',
    mount(host) {
      const p = host.ownerDocument.createElement('p');
      p.textContent = 'Shake before use.';
      host.append(p);
      return () => p.remove();
    },
  }],
  onChange: (layout) => console.log('dock moved', layout),
});

const grid = createGrid<Potion>(document.getElementById('potions')!, {
  rows: [{ id: 'p1', name: 'Fog in a bottle', colour: 'grey', doses: 3 }],
  columns: [{ id: 'name', header: 'Potion' }, { id: 'colour', header: 'Colour' }, { id: 'doses', header: 'Doses', type: 'number' }],
  getRowId: (p) => p.id,
  messages,
  features: [filters(), chooser, filtersPanel(), columnMenu({ use: { chooser } }), panels],
});

panels.api(grid)?.show('notes');
panels.api(grid)?.move('filters', 'start');
```

- The panels' ids: `columns` (the chooser), `filters` (the filters panel), and the ids of your own panels.
- `open: { id: area }` shows a panel there at the start; otherwise the chooser waits at the end until opened (the
  column menu's « Choose columns », or `chooser.api(grid)?.open()`), and your panels wait at their `area` (`end` by
  default) until `api.show(id)`.
- Your panel's `mount(host)` builds its content and may return a cleanup function.
- `api`: `show`, `hide`, `move`, `collapse`, `resize`, `layout()`, `setLayout(layout)`. With the [state](state.md)
  feature, where each panel stands is saved with the rest of the grid's state.
- A floating window (area `float`) is planned, not there yet: it is refused with a warning.
