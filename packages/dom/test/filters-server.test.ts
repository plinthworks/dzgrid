// The floating row over a server (step 12; docs/behaviors/filter-ui.md, server-filter.md).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { definePart } from '../src/part.js';
import { filters } from '../src/filters.js';
import { slots } from '../src/slots.js';
import { cleanup, make } from './support-filters.js';

afterEach(cleanup);

describe('the floating row on a server', () => {
  it('asks once per pause (300 ms), not per keystroke', () => {
    vi.useFakeTimers();
    const t = make({ server: true });
    t.f.answer(['a', 'b']);
    const before = t.f.calls.length;
    for (const s of ['a', 'ab', 'abc']) t.type('name', s);
    vi.advanceTimersByTime(299);
    expect(t.f.calls.length).toBe(before);
    vi.advanceTimersByTime(1);
    expect(t.f.calls.length).toBe(before + 1);
    expect(JSON.stringify(t.f.calls.at(-1)!.req)).toContain('abc');
  });

  it('asks nothing for an empty edit on an unfiltered column, nor for an unreadable number', () => {
    vi.useFakeTimers();
    const t = make({ server: true });
    t.f.answer(['a', 'b']);
    const before = t.f.calls.length;
    t.type('name', '');
    t.type('n', 'zz');
    vi.advanceTimersByTime(1000);
    t.key(t.input('n')!, 'Enter');
    expect(t.f.calls.length).toBe(before);
    expect(t.filterEvents()).toHaveLength(0);
  });

  it('keeps an everything-except selection made under the same filter', () => {
    vi.useFakeTimers();
    const t = make({ server: true, settings: { selection: { mode: 'multi', checkbox: true } } });
    t.f.answer(['a', 'b'], { total: 2 });
    t.g.kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(t.g.kernel.selection.mode).toBe('exclude');
    // An edit that ends where it started changes nothing: the selection survives.
    t.type('name', 'x');
    t.type('name', '');
    vi.advanceTimersByTime(300);
    expect(t.filterEvents()).toHaveLength(0);
    expect(t.g.kernel.selection.mode).toBe('exclude');
  });

  it('clear-all from the overlay is one query.set, one request, the sort kept', () => {
    vi.useFakeTimers();
    let clear: (() => void) | null = null;
    const overlay = definePart('overlay', { mount: (_h, c) => { clear = c.clearFilters; return { update: (n) => { clear = n.clearFilters; } }; } });
    const t = make({ server: true, features: [slots(), filters({ floating: true })], settings: { parts: { overlay } } });
    t.f.answer(['a'], { total: 1 });
    t.g.kernel.dispatch({ type: 'sort.toggle', column: 'name', multi: false }, 'user');
    t.f.answer(['a'], { total: 1 });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'zz' } }, 'user');
    t.g.kernel.dispatch({ type: 'quick.set', text: 'q' }, 'user');
    t.f.answer([], { total: 0 });
    expect(clear).not.toBeNull();
    const spy = vi.spyOn(t.g.kernel, 'dispatch');
    const before = t.f.calls.length;
    clear!();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toMatchObject({ type: 'query.set' });
    expect(t.f.calls.length).toBe(before + 1);
    expect(t.g.kernel.query.filter).toEqual({});
    expect(t.g.kernel.query.quick).toBe('');
    expect(t.g.kernel.query.sort).toEqual([{ column: 'name', dir: 'asc' }]);
  });
});
