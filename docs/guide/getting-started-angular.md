# Getting started with Angular

`@dzgrid/angular` wraps the DOM grid in a standalone `<dz-grid>` component with signal inputs, for Angular 19 to 22,
zoneless first (zone.js works too).

## Install

```sh
npm install @dzgrid/core @dzgrid/dom @dzgrid/theme @dzgrid/angular
```

In `angular.json`, load the theme before your own global styles:

```json
"styles": ["node_modules/@dzgrid/theme/dzgrid.css", "src/styles.css"]
```

The `<dz-grid>` host is `display: contents` (it has no box of its own): size its parent, in **global** CSS (a
component's emulated styles do not reach the grid's DOM).

```css
.grid-box { block-size: 480px; display: flex; flex-direction: column; }
.grid-box > dz-grid > .dzg { flex: 1; }
```

## A first grid

```ts
import { Component } from '@angular/core';
import { DzGrid, type DzgColumnOrGroup } from '@dzgrid/angular';
import { EN } from '@dzgrid/dom/locales/en';

type Comet = { id: string; name: string; seen: string; period: number };

@Component({
  selector: 'app-comets',
  imports: [DzGrid],
  template: `
    <div class="grid-box">
      <dz-grid [rows]="rows" [columns]="columns" [getRowId]="rowId" [messages]="messages" locale="en-GB" label="Comets" />
    </div>`,
})
export class Comets {
  readonly rows: Comet[] = [
    { id: 'c1', name: 'Vantor-Elm', seen: '2024-08-19', period: 71.4 },
    { id: 'c2', name: 'Ossian Blue', seen: '2025-01-03', period: 6.2 },
  ];
  readonly columns: DzgColumnOrGroup<Comet>[] = [
    { id: 'name', header: 'Comet', flex: 2 },
    { id: 'seen', header: 'Last seen', type: 'day', width: 140 },
    { id: 'period', header: 'Period (years)', type: 'number', numberFormat: { maximumFractionDigits: 1 } },
  ];
  readonly rowId = (c: Comet) => c.id;
  readonly messages = EN;
}
```

`columns`, `getRowId` and `messages` are required (`messages` may come from `provideDzGrid` instead). Type the
column array `DzgColumnOrGroup<T>[]`: an untyped literal hides unknown keys.

## Inputs are compared by identity

Inputs are signals. Give a new array or object to change something (`rows.update((rs) => [...rs, x])`), never a
mutated one. Keep functions (`getRowId`, `rowClass`) and the `features` array as class fields: `features` is read
once, when the grid is made.

```ts
import { Component, signal } from '@angular/core';
import { DzGrid, type DzgColumnOrGroup } from '@dzgrid/angular';
import type { Problem } from '@dzgrid/core';
import { filters } from '@dzgrid/dom/filters-base';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_FILTERS } from '@dzgrid/dom/locales/en-filters';

type Lamp = { id: number; model: string; watts: number };

@Component({
  selector: 'app-lamps',
  imports: [DzGrid],
  template: `
    <button type="button" (click)="add()">Add a lamp</button>
    <div class="grid-box">
      <dz-grid [rows]="rows()" [columns]="columns" [getRowId]="rowId" [messages]="messages" [features]="features"
        [selection]="{ mode: 'multi', checkbox: true }" [(quick)]="quick"
        (selectionChanged)="count = $event.count" (problems)="onProblems($event)" />
    </div>
    <p>{{ count ?? 'some' }} selected</p>`,
})
export class Lamps {
  readonly rows = signal<Lamp[]>([{ id: 1, model: 'Moth 3', watts: 40 }]);
  readonly columns: DzgColumnOrGroup<Lamp>[] = [{ id: 'model', header: 'Model' }, { id: 'watts', header: 'Watts', type: 'number' }];
  readonly rowId = (l: Lamp) => l.id;
  readonly messages = { ...EN, text: { ...EN.text, ...EN_FILTERS.text } };
  readonly features = [filters()];
  quick = '';
  count: number | null = 0;
  add() { this.rows.update((rs) => [...rs, { id: rs.length + 1, model: 'Heron 1', watts: 25 }]); }
  onProblems(ps: readonly Problem[]) { for (const p of ps) console.warn('dzgrid', p.code, p.path, p.detail); }
}
```

Two-way models: `[(quick)]`, `[(filter)]`, `[(selected)]`, `[(expanded)]`, `[(groupBy)]`. Left unbound, the grid
owns that state.

## App-wide defaults

```ts
import { ApplicationConfig } from '@angular/core';
import { provideDzGrid } from '@dzgrid/angular';
import { FR } from '@dzgrid/dom/locales/fr';

export const appConfig: ApplicationConfig = {
  providers: [provideDzGrid({ messages: FR, defaults: { locale: 'fr-FR', timeZone: 'Europe/Paris', density: 'compact' } })],
};
```

A binding on the tag wins over a default.

## The controller

`(gridReady)` hands over a `DzgController`: commands, focus, transactions, and each feature's own api through `use`.

```ts
import { Component } from '@angular/core';
import { DzGrid, DzgController, selectedIds, type DzgColumnOrGroup } from '@dzgrid/angular';
import { dataKey } from '@dzgrid/core';
import { EN } from '@dzgrid/dom/locales/en';

type Owl = { id: string; name: string; age: number };

@Component({
  selector: 'app-owls',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="rowId" [messages]="messages"
    [selection]="{ mode: 'multi' }" (gridReady)="ctrl = $event" />
    <button type="button" (click)="oldestFirst()">Oldest first</button>`,
})
export class Owls {
  readonly rows: Owl[] = [{ id: 'o1', name: 'Pip', age: 3 }, { id: 'o2', name: 'Bramble', age: 9 }];
  readonly columns: DzgColumnOrGroup<Owl>[] = [{ id: 'name', header: 'Owl' }, { id: 'age', header: 'Age', type: 'number' }];
  readonly rowId = (o: Owl) => o.id;
  readonly messages = EN;
  ctrl: DzgController<Owl> | null = null;

  oldestFirst() {
    this.ctrl?.dispatch({ type: 'sort.set', sort: [{ column: 'age', dir: 'desc' }] });
    const key = dataKey('o2');
    if (key) {
      this.ctrl?.ensureVisible(key, 'name');
      this.ctrl?.dispatch({ type: 'selection.only', row: key });
    }
    this.ctrl?.applyTransaction({ patch: [{ id: 'o1', set: { age: 4 } }] });
    const chosen = this.ctrl && selectedIds(this.ctrl);   // { mode, ids, query } — ids, ready for a server
    console.log(chosen);
  }
}
```

## Parts as components

A cell (or header, tooltip, editor, detail panel…) can be an Angular component with one signal input named `cell`.
Instances are reused from row to row: derive everything from `cell()`.

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DzGrid, type DzgColumnOrGroup, type DzgPartContext } from '@dzgrid/angular';
import { EN } from '@dzgrid/dom/locales/en';

type Robot = { id: string; name: string; state: 'awake' | 'asleep' };

@Component({
  selector: 'app-robot-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span>{{ cell().text }}</span>
    <button type="button" (click)="cell().emit('wake', robot().id)">Wake</button>`,
})
export class RobotState {
  readonly cell = input.required<DzgPartContext<'cell'>>();
  robot(): Robot { return this.cell().row as Robot; }
}

@Component({
  selector: 'app-robots',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="rowId" [messages]="messages"
    (cellAction)="last = $event.name + ' ' + $event.detail" />`,
})
export class Robots {
  readonly rows: Robot[] = [{ id: 'r1', name: 'Tock', state: 'asleep' }];
  readonly columns: DzgColumnOrGroup<Robot>[] = [{ id: 'name', header: 'Robot' }, { id: 'state', header: 'State', ui: { cell: RobotState } }];
  readonly rowId = (r: Robot) => r.id;
  readonly messages = EN;
  last = '';
}
```

Other ways to give a part: `componentPart(slot, Component)` in `[parts]` or `provideDzGrid({ parts })`; an
`<ng-template dzgPart="name" [slot]="'header'" let-c>` inside `<dz-grid>` (import `DzgPart`); or a plain DOM
part made with `definePart` from `@dzgrid/dom`.

## Pitfalls

- No `messages`: the page stays empty and the console says `dz-grid: messages are required`.
- A feature whose texts are not merged into `messages` throws at creation, naming the missing keys.
- An output that does not exist (`(selectionChange)`) never fires and says nothing: only the outputs listed by the
  component exist; `(gridEvent)` carries every event.
- `features` written in the template (`[features]="[filters()]"`) makes a new array on every check: keep it a field.
