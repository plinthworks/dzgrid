// A header part driving the column filter (step 21; docs/behaviors/parts.md, filter-ui.md; decisions step21-decisions.md).
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnOrGroup, Json } from '@dzgrid/core';
import { definePart, type SlotContext } from '../src/part.js';
import { slots } from '../src/slots.js';
import { filters } from '../src/filters.js';
import { cleanup, make, type R } from './support-filters.js';

afterEach(cleanup);
const hadReport = (window as unknown as { reportError?: unknown }).reportError;
afterEach(() => { (window as unknown as { reportError?: unknown }).reportError = hadReport; });

type HC = SlotContext['header'];
const text = (v: string): Json => ({ type: 'text', op: 'contains', value: v });

/** An application's header: its title and its own search box driving the column's filter. */
function searchHeader(o: { focusable?: boolean; throwOn?: (c: HC) => boolean } = {}) {
  const seen = { mounts: 0, updates: 0, destroys: 0, contexts: [] as HC[], inputs: [] as HTMLInputElement[] };
  const part = definePart('header', {
    mount(host, c) {
      if (o.throwOn?.(c)) throw new Error('header broke');
      seen.mounts++;
      seen.contexts.push(c);
      let cur = c;
      const title = document.createElement('span');
      title.textContent = c.label;
      host.append(title);
      let input: HTMLInputElement | null = null;
      if (c.filter) {
        input = document.createElement('input');
        input.setAttribute('aria-label', `Search ${c.label}`);
        input.value = ((c.filter.state as { value?: string } | null)?.value) ?? '';
        input.addEventListener('input', () => cur.filter?.set(input!.value ? text(input!.value) : null));
        host.append(input);
        seen.inputs.push(input);
      }
      return {
        update(n) {
          if (o.throwOn?.(n)) throw new Error('header broke');
          seen.updates++;
          seen.contexts.push(n);
          cur = n;
          // Echo the state only while the box does not have the focus (the part's duty).
          if (input && document.activeElement !== input) input.value = ((n.filter?.state as { value?: string } | null)?.value) ?? '';
        },
        destroy() { seen.destroys++; },
        ...(o.focusable !== false && { focus: () => (input ? (input.focus(), true) : false) }),
      };
    },
  });
  return { seen, part };
}

const COLS: ColumnOrGroup<R>[] = [{ id: 'name', header: 'Name' }, { id: 'n', header: 'N', type: 'number' }];

function hmake(o: { part?: ReturnType<typeof searchHeader>; columns?: ColumnOrGroup<R>[]; floating?: boolean; noFilters?: boolean; inline?: number; settings?: object } = {}) {
  const h = o.part ?? searchHeader();
  const f = filters({ floating: o.floating ?? false });
  const t = make({ columns: o.columns ?? COLS, features: o.noFilters ? [slots()] : [slots(), f], settings: { parts: { header: h.part }, ...o.settings }, ...(o.inline && { inline: o.inline }) });
  const hcell = (c: string) => t.host.querySelector<HTMLElement>(`.dzg-hcell[data-col="${c}"]:not(.dzg-hextra)`)!;
  const box = (c: string) => hcell(c).querySelector<HTMLInputElement>('input');
  const typeIn = (c: string, v: string) => { const i = box(c)!; i.value = v; i.dispatchEvent(new InputEvent('input', { bubbles: true })); };
  const last = (c: string) => [...h.seen.contexts].reverse().find((x) => x.column.id === c)!;
  return { ...t, h, f, hcell, box, typeIn, last };
}

describe('the header context’s filter', () => {
  it('is null without filters(), for filter: false, and for an unknown kind', () => {
    const a = hmake({ noFilters: true });
    expect(a.last('name').filter).toBeNull();
    cleanup();
    const b = hmake({ columns: [{ id: 'name', header: 'Name', filter: false }, { id: 'n', header: 'N', type: 'number', filter: { kind: 'nope' } }] });
    expect(b.last('name').filter).toBeNull();
    expect(b.last('n').filter).toBeNull();
  });

  it('carries the kind, the state, where it runs, the pause, and canOpen', () => {
    const t = hmake();
    const f = t.last('n').filter!;
    expect(f).toMatchObject({ kind: 'number', state: null, where: 'client', debounceMs: 150, canOpen: true });
    expect(typeof f.set).toBe('function');
    expect(typeof f.openFilter).toBe('function');
  });

  it('follows the filter in force: the part is updated with the new state', () => {
    const t = hmake();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'ann' } }, 'user');
    expect(t.last('name').filter!.state).toEqual({ type: 'text', op: 'contains', value: 'ann' });
    expect(t.box('name')!.value).toBe('ann');
  });

  it('keeps one object while nothing it holds changed: an unrelated paint updates nothing', () => {
    const t = hmake({ settings: { selection: { mode: 'multi', checkbox: true } } });
    const before = t.h.seen.updates;
    const f = t.last('name').filter;
    t.g.kernel.dispatch({ type: 'selection.all' }, 'user');
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 'n' } }, 'user');
    t.g.api.refresh();
    expect(t.h.seen.updates).toBe(before);
    expect(t.last('name').filter).toBe(f);
  });

  it('set: debounced by default, now at once, cancel drops its own edit', () => {
    vi.useFakeTimers();
    const t = hmake();
    t.typeIn('name', 'an');
    expect(t.filterEvents()).toHaveLength(0);
    vi.advanceTimersByTime(150);
    expect(t.g.kernel.query.filter['name']).toEqual(text('an'));
    t.last('name').filter!.set(text('bo'), { commit: 'now' });
    expect(t.g.kernel.query.filter['name']).toEqual(text('bo'));
    t.last('name').filter!.set(text('zz'));
    t.last('name').filter!.set(null, { commit: 'cancel' });
    vi.advanceTimersByTime(500);
    expect(t.g.kernel.query.filter['name']).toEqual(text('bo'));
  });

  it('shares the pending edit with the popup: opening it applies the header’s edit first', () => {
    vi.useFakeTimers();
    const t = hmake();
    t.typeIn('name', 'bob');
    expect(t.f.openFilter('name')).toBe(true);
    expect(t.g.kernel.query.filter['name']).toEqual(text('bob'));
  });

  it('shares it with the floating box: the last write wins', () => {
    vi.useFakeTimers();
    const t = hmake({ floating: true });
    t.typeIn('name', 'an');
    t.type('name', 'bob');
    vi.advanceTimersByTime(200);
    expect(t.g.kernel.query.filter['name']).toEqual(text('bob'));
    expect(t.filterEvents()).toHaveLength(1);
  });

  it('openFilter opens the column’s popup from the header', () => {
    const t = hmake();
    t.last('n').filter!.openFilter();
    expect(t.host.ownerDocument.querySelector('.dzg-fpop')).not.toBeNull();
  });

  it('a header part that throws gives the header back to the grid’s text, reported', () => {
    const reported: unknown[] = [];
    (window as unknown as { reportError: unknown }).reportError = (e: unknown) => { reported.push(e); };
    const t = hmake({ part: searchHeader({ throwOn: (c) => c.column.id === 'n' }) });
    expect(reported).toHaveLength(1);
    expect(t.hcell('n').querySelector('.dzg-hlabel')!.textContent).toBe('N');
    expect(t.box('name')).not.toBeNull();
  });
});

describe('keys in a header cell holding a control', () => {
  it('one tab stop: the box is out of the Tab order until the focus is inside', () => {
    const t = hmake();
    expect(t.box('name')!.tabIndex).toBe(-1);
  });

  it('F2 on the header enters the box; Escape applies and comes back to the header, the text kept', () => {
    vi.useFakeTimers();
    const t = hmake();
    t.hcell('name').focus();
    t.press('F2');
    expect(document.activeElement).toBe(t.box('name'));
    expect(t.box('name')!.tabIndex).toBe(0);
    t.typeIn('name', 'ann');
    const outer = vi.fn();
    t.host.addEventListener('keydown', outer);
    const e = t.press('Escape');
    expect(e.defaultPrevented).toBe(true);
    expect(outer).not.toHaveBeenCalled();
    expect(t.g.kernel.query.filter['name']).toEqual(text('ann'));
    expect(document.activeElement).toBe(t.hcell('name'));
    expect(t.box('name')!.value).toBe('ann');
    expect(t.box('name')!.tabIndex).toBe(-1);
  });

  it('Enter enters when the part takes the focus, and then does not sort', () => {
    const t = hmake();
    t.hcell('name').focus();
    t.press('Enter');
    expect(document.activeElement).toBe(t.box('name'));
    expect(t.g.kernel.query.sort).toEqual([]);
  });

  it('Enter sorts as before when the part takes no focus', () => {
    const t = hmake({ part: searchHeader({ focusable: false }) });
    t.hcell('name').focus();
    t.press('Enter');
    expect(t.g.kernel.query.sort).toEqual([{ column: 'name', dir: 'asc' }]);
  });

  it('Enter inside the box applies at once', () => {
    vi.useFakeTimers();
    const t = hmake();
    t.hcell('name').focus();
    t.press('F2');
    t.typeIn('name', 'bob');
    t.press('Enter');
    expect(t.g.kernel.query.filter['name']).toEqual(text('bob'));
    expect(document.activeElement).toBe(t.box('name'));
    expect(t.g.kernel.query.sort).toEqual([]);
  });

  it('the focus leaving the cell applies and takes the box out of the Tab order', () => {
    vi.useFakeTimers();
    const t = hmake();
    t.hcell('name').focus();
    t.press('F2');
    t.typeIn('name', 'bo');
    t.hcell('n').focus();
    expect(t.g.kernel.query.filter['name']).toEqual(text('bo'));
    expect(t.box('name')!.tabIndex).toBe(-1);
  });

  it('inside an input method’s composition, Escape and Enter are the input method’s', () => {
    vi.useFakeTimers();
    const t = hmake();
    t.hcell('name').focus();
    t.press('F2');
    t.typeIn('name', 'あ');
    t.press('Escape', { isComposing: true });
    expect(document.activeElement).toBe(t.box('name'));
    t.press('Enter', { keyCode: 229 } as KeyboardEventInit);
    expect(t.g.kernel.query.filter['name']).toBeUndefined();
  });

  it('a click in the box never sorts', () => {
    const t = hmake();
    t.box('name')!.click();
    expect(t.g.kernel.query.sort).toEqual([]);
  });

  it('a column leaving the window takes its pending edit with it, applied', () => {
    vi.useFakeTimers();
    const many: ColumnOrGroup<R>[] = [{ id: 'name', header: 'Name', width: 200 }, ...Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, header: `C${i}`, width: 200, value: () => i }))];
    const t = hmake({ columns: many, inline: 500 });
    t.typeIn('name', 'ann');
    t.scrollInline(2000);
    expect(t.hcell('name')).toBeNull();
    expect(t.g.kernel.query.filter['name']).toEqual(text('ann'));
  });
});

describe('header.filterBox, the ready header part (optional, step 21)', () => {
  const COLS3: ColumnOrGroup<R>[] = [
    { id: 'name', header: 'Name', ui: { header: 'header.filterBox' } },
    { id: 'n', header: 'N', type: 'number', ui: { header: 'header.filterBox' } },
    { id: 'd', header: 'D', type: 'day', ui: { header: 'header.filterBox' } },
  ];
  function bmake(columns = COLS3) {
    const t = make({ columns, features: [slots(), filters()] });
    const hcell = (c: string) => t.host.querySelector<HTMLElement>(`.dzg-hcell[data-col="${c}"]:not(.dzg-hextra)`)!;
    return { ...t, hcell, box: (c: string) => hcell(c).querySelector<HTMLInputElement>('.dzg-hfbox input') };
  }

  it('draws the name and the kind’s box, named for the column', () => {
    const t = bmake();
    expect(t.hcell('name').querySelector('.dzg-hlabel')!.textContent).toBe('Name');
    expect(t.box('name')!.getAttribute('aria-label')).toBe('Filter Name');
    expect(t.box('n')!.inputMode).toBe('decimal');
    // A day column: no box of its own, the summary (empty without a filter).
    expect(t.box('d')).toBeNull();
    expect(t.box('name')!.tabIndex).toBe(-1);
  });

  it('filters the column after the pause, with F2 in and Escape out', () => {
    vi.useFakeTimers();
    const t = bmake();
    t.hcell('name').focus();
    t.press('F2');
    expect(document.activeElement).toBe(t.box('name'));
    const i = t.box('name')!;
    i.value = 'ann';
    i.dispatchEvent(new InputEvent('input', { bubbles: true }));
    vi.advanceTimersByTime(150);
    expect(t.g.kernel.query.filter['name']).toEqual(text('ann'));
    t.press('Escape');
    expect(document.activeElement).toBe(t.hcell('name'));
  });

  it('a number typed is read in the grid’s locale; a filter set elsewhere comes back in the box', () => {
    vi.useFakeTimers();
    const t = bmake();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'equals', value: 12 } }, 'user');
    expect(t.box('n')!.value).toBe('12');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'd', filter: { type: 'day', op: 'equals', value: '2024-01-01' } }, 'user');
    expect(t.hcell('d').querySelector('.dzg-hfbox')!.textContent).not.toBe('');
  });
});
