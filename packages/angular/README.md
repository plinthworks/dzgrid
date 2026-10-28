# @dzgrid/angular

[DzGrid](https://github.com/plinthworks/dzgrid) for Angular 19 to 22: `<dz-grid>` with signals, standalone,
zoneless first (zone.js works too), cells and other parts as Angular components or templates, no design system.

## Install

```sh
npm install @dzgrid/core @dzgrid/dom @dzgrid/theme @dzgrid/angular
```

Add `node_modules/@dzgrid/theme/dzgrid.css` to the `styles` of `angular.json` (or `@import` it).

## A first grid

```ts
import { Component } from '@angular/core';
import { DzGrid } from '@dzgrid/angular';
import { FR } from '@dzgrid/dom/locales/fr';

type Patient = { id: string; name: string; born: string };

@Component({
  selector: 'app-patients',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" locale="fr-FR" />`,
})
export class Patients {
  readonly rows: Patient[] = [{ id: '1', name: 'Amina', born: '1990-04-12' }];
  readonly columns = [
    { id: 'name', header: 'Nom' },
    { id: 'born', header: 'Naissance', type: 'day' as const },
  ];
  readonly id = (p: Patient) => p.id;
  readonly messages = FR;
}
```

## Documentation

- [The project's README](https://github.com/plinthworks/dzgrid#readme).
- [Angular parts and the wrapper](https://github.com/plinthworks/dzgrid/blob/main/docs/behaviors/angular-parts.md).
- [Behaviour sheets](https://github.com/plinthworks/dzgrid/tree/main/docs/behaviors) and the
  [changelog](https://github.com/plinthworks/dzgrid/blob/main/CHANGELOG.md).

MIT licence.
