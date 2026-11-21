// 1.17.0 — the advanced filter on `<dz-grid>` (docs/behaviors/advanced-filter.md 20): `el.advancedFilter` reads and
// sets the expression in force (set before the grid exists: written when it is made; null removes it); its changes
// come with `dzg-filter-changed` (`advancedOf(detail.filter)`). Expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import { advancedOf, type ColumnDef, type FilterExpression, type FilterModel } from '@dzgrid/core';
import type { GridEnv } from '@dzgrid/dom';
import { EN } from '@dzgrid/dom/locales/en';
import { DzGridElement, defineDzGrid } from '../src/index.js';

type R = { id: string; name: string; n: number };
const ROWS: R[] = [
  { id: 'a', name: 'Alger', n: 3 },
  { id: 'b', name: 'Oran', n: 1 },
  { id: 'c', name: 'Blida', n: 2 },
];
const COLUMNS: ColumnDef<R, any>[] = [{ id: 'name' }, { id: 'n', type: 'number' }]; // any: the column's value type is not under test
const env: GridEnv = { sync: true, geometry: { read: () => ({ block: 400, inline: 600, scrollTop: 0, scrollInline: 0 }), writeScrollTop: () => {}, writeScrollInline: () => {} } };
const OR: FilterExpression = { join: 'or', items: [{ column: 'name', filter: { type: 'text', op: 'equals', value: 'Oran' } }, { column: 'n', filter: { type: 'number', op: 'gt', value: 2 } }] };

defineDzGrid('dz-grid-adv');
afterEach(() => void (document.body.innerHTML = ''));
const tick = () => new Promise<void>((r) => queueMicrotask(r));

function make(before?: (el: DzGridElement<R>) => void): DzGridElement<R> {
  document.body.insertAdjacentHTML('beforeend', '<dz-grid-adv></dz-grid-adv>');
  const el = document.body.lastElementChild as DzGridElement<R>;
  el.env = env;
  before?.(el);
  el.columns = COLUMNS;
  el.getRowId = (r) => r.id;
  el.rows = ROWS;
  el.messages = EN;
  return el;
}
const shown = (el: DzGridElement<R>) => el.grid!.kernel.rows.displayed.count;

describe('el.advancedFilter (advanced-filter.md 20)', () => {
  it('set before the grid exists: kept, written when it is made', async () => {
    const el = make((e) => (e.advancedFilter = OR));
    expect(el.advancedFilter).toEqual(OR);
    await tick();
    expect(el.grid!.kernel.query.filter['']).toEqual({ type: 'advanced', expression: OR });
    expect(shown(el)).toBe(2);
  });

  it('set on a grid: the column filters kept; null removes it', async () => {
    const el = make();
    await tick();
    el.grid!.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'lt', value: 3 } }, 'api');
    el.advancedFilter = OR;
    expect(el.advancedFilter).toEqual(OR);
    expect(Object.keys(el.grid!.kernel.query.filter).sort()).toEqual(['', 'n']);
    expect(shown(el)).toBe(1);
    el.grid!.kernel.dispatch({ type: 'filter.column', column: 'n', filter: null }, 'api');
    el.advancedFilter = null;
    expect(el.advancedFilter).toBeNull();
    expect(el.grid!.kernel.query.filter).toEqual({});
  });

  it('a change made elsewhere is read back, and comes with dzg-filter-changed', async () => {
    const el = make();
    await tick();
    const seen: unknown[] = [];
    el.addEventListener('dzg-filter-changed', (e) => seen.push(advancedOf((e as CustomEvent).detail.filter as FilterModel)));
    el.grid!.kernel.dispatch({ type: 'filter.set', filter: { '': { type: 'advanced', expression: OR } } }, 'user');
    expect(el.advancedFilter).toEqual(OR);
    el.grid!.kernel.dispatch({ type: 'filter.set', filter: {} }, 'user');
    expect(el.advancedFilter).toBeNull();
    expect(seen).toEqual([OR, null]);
  });

  it('set on the element before it is defined (a framework first): taken back through the property', async () => {
    const el = document.createElement('dz-grid-adv-late') as DzGridElement<R>;
    (el as unknown as { advancedFilter: FilterExpression }).advancedFilter = OR; // an undefined element: a plain property
    document.body.append(el);
    defineDzGrid('dz-grid-adv-late');
    el.env = env;
    el.columns = COLUMNS;
    el.getRowId = (r) => r.id;
    el.rows = ROWS;
    el.messages = EN;
    await tick();
    expect(el.grid!.kernel.query.filter['']).toEqual({ type: 'advanced', expression: OR });
  });
});
