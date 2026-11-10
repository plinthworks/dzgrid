// The grid's height comes from its container, never its rows (virtual-scroll.md, owner 2026-11-10;
// scripts/browser-host-fill.mjs): 3 and 10 000 rows, three sized containers, three ways in — createGrid on the
// container, Angular's host (an element `dz-grid` given `display: contents` inline, as `@dzgrid/angular` does in
// its constructor, then createGrid on it) and the Web Component placed directly in the container.
import type { GridEvent, Problem } from '@dzgrid/core';
import { createGrid } from '/packages/dom/src/index.ts';
import { EN } from '/packages/dom/src/locales/en.ts';
import { defineDzGrid } from '/packages/element/src/index.ts';

defineDzGrid('dz-grid-wc');
type R = { id: number; name: string; n: number };
const make = (n: number): R[] => Array.from({ length: n }, (_, i) => ({ id: i, name: `Item ${i}`, n: i * 3 }));
const columns = [{ id: 'name', flex: 1 }, { id: 'n', type: 'number' as const }];
const told: Record<string, Problem[]> = {};
const main = document.getElementById('main')!;
const cases: string[] = [];
for (const kind of ['fixed', 'flex', 'share'])
  for (const count of [3, 10_000])
    for (const way of ['ts', 'angular', 'element']) {
      const id = `${kind}-${count}-${way}`;
      cases.push(id);
      const box = document.createElement('div');
      box.className = 'box';
      let container: HTMLElement;
      if (kind === 'share') {
        box.classList.add('share-parent');
        const bar = document.createElement('div');
        bar.className = 'bar';
        container = document.createElement('div');
        container.className = 'share';
        box.append(bar, container);
      } else {
        box.classList.add(kind);
        container = box;
      }
      container.id = id;
      main.append(box);
      const list: Problem[] = (told[id] = []);
      const onEvent = (e: GridEvent<R>) => { if (e.type === 'problems') list.push(...e.problems); };
      const settings = { rows: make(count), getRowId: (r: R) => String(r.id), messages: EN, columns, onEvent };
      if (way === 'ts') createGrid<R>(container, settings);
      else if (way === 'angular') {
        const host = document.createElement('dz-grid');
        host.style.display = 'contents';
        container.append(host);
        createGrid<R>(host, settings);
      } else {
        const el = document.createElement('dz-grid-wc') as HTMLElement & Record<string, unknown>;
        container.append(el);
        Object.assign(el, { columns, getRowId: settings.getRowId, messages: EN, rows: settings.rows, settings: { onEvent } });
      }
    }
// The page's own display on the element wins over the layout sheet's (a flex parent, a 200 px block).
const box = document.createElement('div');
box.className = 'box flex';
const own = document.createElement('dz-grid-wc') as HTMLElement & Record<string, unknown>;
own.className = 'own';
box.append(own);
main.append(box);
Object.assign(own, { columns, getRowId: (r: R) => String(r.id), messages: EN, rows: make(3) });
Object.assign(window, { cases, told, own, ready: true });
