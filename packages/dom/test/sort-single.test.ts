// One sort only (docs/behaviors/sort.md « One sort only », step 16a): every gesture reaches the kernel's rule.
import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnDef, GridEvent, SortItem } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { definePart, type SlotContext } from '../src/part.js';
import { slots } from '../src/slots.js';
import { EN } from '../src/locales/en.js';
import { AR } from '../src/locales/ar.js';

type R = { id: string; date: string; type: string };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

function make(over: Partial<GridSettings<R>> = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const columns: ColumnDef<R, any>[] = [{ id: 'date', header: 'Date' }, { id: 'type', header: 'Type' }];
  const rows = Array.from({ length: 12 }, (_, i): R => ({ id: `r${i}`, date: `2026-10-${String(i + 1).padStart(2, '0')}`, type: i % 3 ? 'KO' : 'OK' }));
  const g = createGrid<R>(host, { rows, getRowId: (r) => r.id, columns, messages: EN, multiSort: false, onEvent: (e) => events.push(e), ...over }, { geometry, sync: true });
  grids.push(g);
  const head = (col: string) => host.querySelector<HTMLElement>(`.dzg-header .dzg-hcell[data-col="${col}"]`)!;
  const sorted = () => host.querySelectorAll('.dzg-header [aria-sort]').length;
  const told = () => events.flatMap((e) => (e.type === 'sortChanged' ? [e.sort] : [])) as (readonly SortItem[])[];
  const key = (col: string, shiftKey: boolean) => { head(col).focus(); head(col).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey, bubbles: true, cancelable: true })); };
  return { g, host, events, head, sorted, told, key };
}

describe('multiSort: false', () => {
  it('Shift+click on « Type » after « Date »: one sorted header, sortChanged with one item', () => {
    const t = make();
    t.head('date').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    t.head('type').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }));
    expect(t.sorted()).toBe(1);
    expect(t.head('type').getAttribute('aria-sort')).toBe('ascending');
    expect(t.told().at(-1)).toEqual([{ column: 'type', dir: 'asc' }]);
    // No precedence number is drawn for a single sort.
    expect(t.head('type').querySelector('.dzg-sort')!.textContent).toBe('');
  });

  it('Shift+Enter acts as Enter', () => {
    const t = make();
    t.key('date', false);
    t.key('type', true);
    expect(t.g.kernel.query.sort).toEqual([{ column: 'type', dir: 'asc' }]);
    t.key('type', true);
    expect(t.g.kernel.query.sort).toEqual([{ column: 'type', dir: 'desc' }]);
  });

  it("a header part's toggleSort(true) acts as toggleSort(false)", () => {
    const seen: SlotContext['header'][] = [];
    const part = definePart('header', { mount(h, c) { seen.push(c); h.textContent = c.label; return { update(n) { seen.push(n); } }; } });
    const t = make({ parts: { header: part }, features: [slots()] });
    seen.find((c) => c.column.id === 'date')!.toggleSort(false);
    seen.find((c) => c.column.id === 'type')!.toggleSort(true);
    expect(t.g.kernel.query.sort).toEqual([{ column: 'type', dir: 'asc' }]);
  });

  it('right to left, in Arabic: Shift+click still leaves one sort', () => {
    const t = make({ messages: AR, locale: 'ar', direction: 'rtl' });
    t.head('date').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    t.head('type').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }));
    expect(t.g.kernel.query.sort).toEqual([{ column: 'type', dir: 'asc' }]);
    expect(t.sorted()).toBe(1);
  });

  it("the application's sort.set of two items is kept and numbered", () => {
    const t = make();
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'date', dir: 'asc' }, { column: 'type', dir: 'asc' }] }, 'host');
    expect(t.g.kernel.query.sort).toHaveLength(2);
    expect(t.head('type').querySelector('.dzg-sort')!.textContent).toBe('2');
  });

  it('is fixed: update({ multiSort: true }) is refused and said', () => {
    const t = make();
    t.g.update({ multiSort: true });
    expect(t.events.some((e) => e.type === 'problems' && e.problems.some((p) => p.code === 'unsupported-live-change' && p.path === 'settings.multiSort'))).toBe(true);
    t.head('date').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    t.head('type').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }));
    expect(t.g.kernel.query.sort).toEqual([{ column: 'type', dir: 'asc' }]);
  });

  it('without the setting, Shift+click still adds (today)', () => {
    const t = make({ multiSort: undefined });
    t.head('date').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    t.head('type').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }));
    expect(t.g.kernel.query.sort).toEqual([{ column: 'date', dir: 'asc' }, { column: 'type', dir: 'asc' }]);
  });
});
