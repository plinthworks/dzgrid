// « Match case » in the popup (Phase 9 F1; docs/behaviors/filter-combined.md, filter-text.md; owner Q-F2 A).
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { filters } from '../src/filters.js';
import { cleanup, make, type R } from './support-filters.js';

afterEach(cleanup);

function open(options: Record<string, unknown> = {}, columns?: ColumnOrGroup<R>[]) {
  // Options as a loose record (the test's own helper).
  const feature = filters(options as never);
  const t = make({ columns: columns ?? [{ id: 'name', header: 'Name' }, { id: 'n', header: 'N', type: 'number' }], features: [feature] });
  const q = <E extends Element = HTMLElement>(s: string) => t.host.querySelector<E>(`.dzg-popup ${s}`);
  const boxes = () => [...t.host.querySelectorAll<HTMLInputElement>('.dzg-popup input.dzg-fcase')];
  const fill = (i: HTMLInputElement, text: string) => {
    i.value = text;
    i.dispatchEvent(new InputEvent('input', { bubbles: true }));
  };
  const tick = (b: HTMLInputElement) => b.click();
  return { ...t, feature, q, boxes, fill, tick, filter: () => t.g.kernel.query.filter as Record<string, unknown> };
}

describe('match case', () => {
  it('off by default: no checkbox; a stored caseSensitive is kept as today', () => {
    vi.useFakeTimers();
    const t = open();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'a', caseSensitive: true } }, 'api');
    t.feature.openFilter('name');
    expect(t.boxes()).toHaveLength(0);
    t.fill(t.q<HTMLInputElement>('input.dzg-fval')!, 'An');
    vi.advanceTimersByTime(150);
    expect(t.filter()['name']).toEqual({ type: 'text', op: 'contains', value: 'An', caseSensitive: true });
  });

  it('filters({ matchCase: true }): a named checkbox on a text row; ticked → caseSensitive true, unticked → absent', () => {
    vi.useFakeTimers();
    const t = open({ matchCase: true });
    t.feature.openFilter('name');
    const [b] = t.boxes();
    expect(b!.type).toBe('checkbox');
    expect(b!.checked).toBe(false);
    expect(b!.closest('label')!.textContent).toBe('Match case');
    t.fill(t.q<HTMLInputElement>('input.dzg-fval')!, 'Ann');
    vi.advanceTimersByTime(150);
    expect(t.filter()['name']).toEqual({ type: 'text', op: 'contains', value: 'Ann' });
    t.tick(b!);
    expect(t.filter()['name']).toEqual({ type: 'text', op: 'contains', value: 'Ann', caseSensitive: true });
    // Exact now: « ann0 » no longer matches « Ann ».
    expect(t.ids()).toEqual([]);
    t.tick(b!);
    expect(t.filter()['name']).toEqual({ type: 'text', op: 'contains', value: 'Ann' });
  });

  it('a number column has no checkbox; a column’s own matchCase turns it on alone', () => {
    const t = open({}, [{ id: 'name', header: 'Name', filter: { matchCase: true } }, { id: 'n', header: 'N', type: 'number', filter: { matchCase: true } }]);
    t.feature.openFilter('n');
    expect(t.boxes()).toHaveLength(0);
    t.feature.closeFilter();
    t.feature.openFilter('name');
    expect(t.boxes()).toHaveLength(1);
  });

  it('a stored caseSensitive ticks it; one box per text row, each writing its own row', () => {
    vi.useFakeTimers();
    const t = open({ matchCase: true, maxConditions: 2 });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'combined', join: 'or', conditions: [{ type: 'text', op: 'contains', value: 'a', caseSensitive: true }, { type: 'text', op: 'contains', value: 'b' }] } }, 'api');
    t.feature.openFilter('name');
    expect(t.boxes().map((b) => b.checked)).toEqual([true, false]);
    t.tick(t.boxes()[0]!);
    t.tick(t.boxes()[1]!);
    expect(t.filter()['name']).toEqual({ type: 'combined', join: 'or', conditions: [{ type: 'text', op: 'contains', value: 'a' }, { type: 'text', op: 'contains', value: 'b', caseSensitive: true }] });
  });

  it('hidden for blank and not blank (no value to compare)', () => {
    const t = open({ matchCase: true });
    t.feature.openFilter('name');
    const op = t.q<HTMLSelectElement>('select.dzg-fop')!;
    op.value = 'blank';
    op.dispatchEvent(new Event('change', { bubbles: true }));
    expect(t.boxes()[0]!.closest('[hidden]')).not.toBeNull();
    expect(t.filter()['name']).toEqual({ type: 'text', op: 'blank' });
  });
});
