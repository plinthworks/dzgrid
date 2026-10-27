// Feedback pass (docs/phase-6-steps/feedback-plan.md): D a column's `ui.data` reaches its parts (item 5); E a column naming
// a header or tooltip part without its feature is said (item 6, `unslotted()`); I a header part as a live « filter as you
// type » search over the column's filter (item 10: the API exists since step 21, pinned here, with the doc's example).
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnOrGroup, GridEvent, Json, Problem } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import { definePart, type SlotContext } from '../src/part.js';
import { slots } from '../src/slots.js';
import { filters } from '../src/filters.js';
import { EN } from '../src/locales/en.js';
import type { GridFeature } from '../src/features.js';
import { cleanup, make, MESSAGES, type R } from './support-filters.js';

afterEach(cleanup);

describe('D: ui.data reaches every part of the column, by reference', () => {
  it('cell, header and filter parts read c.column.def.ui.data; absent: undefined', () => {
    const data = { pillOptions: [{ value: 'a', tone: 'green' }] } as const;
    const seen: Record<string, unknown> = {};
    const parts = {
      c: definePart('cell', { mount: (h, c) => ((seen['cell'] = c.column.def.ui?.data), h.append(String(c.value)), {}) }),
      h: definePart('header', { mount: (h, c) => ((seen[`header:${c.column.id}`] = c.column.def.ui?.data), h.append(c.label), {}) }),
      'filter.text': definePart('filter', { mount: (h, c) => ((seen['filter'] = c.column.def.ui?.data), {}) }),
    };
    const f = filters() as GridFeature & { openFilter(c: string): boolean };
    const t = make({ columns: [{ id: 'name', header: 'Name', ui: { cell: 'c', header: 'h', data } }, { id: 'n', header: 'N', type: 'number', ui: { header: 'h' } }], features: [slots(), f], settings: { parts } });
    f.openFilter('name');
    expect(seen['cell']).toBe(data);
    expect(seen['header:name']).toBe(data);
    expect(seen['filter']).toBe(data);
    expect(seen['header:n']).toBeUndefined();
    expect(t.problems().filter((p) => p.code === 'unknown-ui-key')).toEqual([]);
  });

  it('an unknown ui key through a group: the path counts the leaves; the six known keys are silent', () => {
    const t = make({ columns: [{ id: 'name', header: 'Name', ui: { cell: 'c', header: 'h', tooltip: 't', cellClass: () => null, headerClass: 'x', data: {} } }, { id: 'g', children: [{ id: 'b' }, { id: 'c', ui: { tone: 1, data: {} } as never }] }] as never, features: [slots()] });
    expect(t.problems().filter((p) => p.code === 'unknown-ui-key')).toEqual([{ code: 'unknown-ui-key', severity: 'warning', path: 'columns[2].ui.tone', detail: 'tone' }]);
  });

  it('an unknown ui key is said once, the grid still works', () => {
    const t = make({ columns: [{ id: 'name', header: 'Name', ui: { pillOptions: [] } as never }] });
    expect(t.problems().filter((p) => p.code === 'unknown-ui-key')).toEqual([{ code: 'unknown-ui-key', severity: 'warning', path: 'columns[0].ui.pillOptions', detail: 'pillOptions' }]);
    expect(t.host.querySelector('.dzg-hcell[data-col=name]')).not.toBeNull();
  });
});

type Row = { id: string };
function grid(columns: ColumnOrGroup<Row>[], features: GridFeature[], parts: object = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<Row>[] = [];
  const g = createGrid<Row>(host, { rows: [], getRowId: (r: Row) => r.id, columns, messages: MESSAGES, parts, features, onEvent: (e: GridEvent<Row>) => events.push(e) } as never, { sync: true }) as GridInstance<Row>;
  const problems = (): Problem[] => events.flatMap((e) => (e.type === 'problems' ? e.problems : []));
  return { g, problems: () => problems().filter((p) => p.code === 'missing-feature' || p.code === 'unknown-part') };
}
let made: GridInstance<Row>[] = [];
afterEach(() => { for (const g of made) g.destroy(); made = []; });

describe('E: a column naming a header or tooltip part whose feature is absent', () => {
  const own = { mine: definePart('header', { mount: (h) => (h.append('M'), {}) }) };
  it('ui.header without slots(): one missing-feature (detail slots) at the column\'s path; none with slots()', () => {
    const a = grid([{ id: 'a', ui: { header: 'mine' } }], [], {});
    made.push(a.g);
    expect(a.problems()).toEqual([{ code: 'missing-feature', severity: 'warning', path: 'columns[0].ui.header', detail: 'slots' }]);
    const b = grid([{ id: 'a', ui: { header: 'mine' } }], [slots()], own);
    made.push(b.g);
    expect(b.problems()).toEqual([]);
  });

  it('ui.tooltip without slots(): said too; ui.cell: nothing (the base draws cells)', () => {
    const a = grid([{ id: 'a', ui: { tooltip: 'tip', cell: 'x' } }], [], { x: definePart('cell', { mount: () => ({}) }) });
    made.push(a.g);
    expect(a.problems()).toEqual([{ code: 'missing-feature', severity: 'warning', path: 'columns[0].ui.tooltip', detail: 'slots' }]);
  });

  it('header.filterBox: without filters() its detail is filters; without both, both', () => {
    const a = grid([{ id: 'a', ui: { header: 'header.filterBox' } }], [slots()]);
    made.push(a.g);
    expect(a.problems()).toEqual([{ code: 'missing-feature', severity: 'warning', path: 'columns[0].ui.header', detail: 'filters' }]);
    const b = grid([{ id: 'a', ui: { header: 'header.filterBox' } }], []);
    made.push(b.g);
    expect(b.problems()).toEqual([
      { code: 'missing-feature', severity: 'warning', path: 'columns[0].ui.header', detail: 'slots' },
      { code: 'missing-feature', severity: 'warning', path: 'columns[0].ui.header', detail: 'filters' },
    ]);
  });

  it('the keys that name no part (cell, cellClass, headerClass, data) want no feature', () => {
    const a = grid([{ id: 'a', ui: { cell: 'x', cellClass: () => null, headerClass: 'h', data: { k: 1 } } }], [], { x: definePart('cell', { mount: () => ({}) }) });
    made.push(a.g);
    expect(a.problems()).toEqual([]);
  });

  it('the leaf index counts through groups', () => {
    const a = grid([{ id: 'a' }, { id: 'g', children: [{ id: 'b' }, { id: 'c', ui: { header: 'mine' } }] }], []);
    made.push(a.g);
    // (The group itself wants spans(): said at `columns`, not this check's.)
    expect(a.problems().filter((p) => p.path.startsWith('columns['))).toEqual([{ code: 'missing-feature', severity: 'warning', path: 'columns[2].ui.header', detail: 'slots' }]);
  });
});

/**
 * The doc's example (docs/behaviors/parts.md « A header search »): the column's name and an input that filters as one
 * types, through the header context's `filter` (the same pending edit as the popup and the floating row).
 */
const contains = (v: string): Json => ({ type: 'text', op: 'contains', value: v });
const headerSearch = definePart('header', {
  mount(host, c) {
    const name = host.ownerDocument.createElement('span');
    const input = host.ownerDocument.createElement('input');
    host.append(name, input);
    let cur = c;
    let last: unknown;
    let dropped = -1;
    input.addEventListener('input', () => cur.filter?.set(input.value ? contains(input.value) : null));
    const draw = (n: SlotContext['header']): void => {
      cur = n;
      name.textContent = n.label;
      input.hidden = !n.filter;
      input.setAttribute('aria-label', `Search ${n.label}`);
      // The filter in force written back when it changed (clear all, a saved view) or when another write dropped what
      // was typed (`dropped`); never over the text being typed (its own edit commits the same value).
      const state = n.filter?.state ?? null;
      const v = (state as { value?: string } | null)?.value ?? '';
      if ((state !== last || n.filter?.dropped !== dropped) && v !== input.value) input.value = v;
      last = state;
      dropped = n.filter?.dropped ?? 0;
    };
    draw(c);
    return { update: draw, focus: () => (input.focus(), true) };
  },
});

describe('I: a header part as a live « filter as you type » search', () => {
  function hs(o: { columns?: ColumnOrGroup<R>[]; floating?: boolean } = {}) {
    const f = filters({ floating: o.floating ?? false });
    const t = make({ columns: o.columns ?? [{ id: 'name', header: 'Name', ui: { header: 'search' } }, { id: 'n', header: 'N', type: 'number' }], features: [slots(), f], settings: { parts: { search: headerSearch } } });
    const hcell = (c: string) => t.host.querySelector<HTMLElement>(`.dzg-hcell[data-col="${c}"]:not(.dzg-hextra)`)!;
    const input = () => hcell('name').querySelector('input')!;
    const typeIn = (v: string) => { const i = input(); i.focus(); i.value = v; i.dispatchEvent(new InputEvent('input', { bubbles: true })); };
    return { ...t, f, hcell, input, typeIn };
  }

  it('typing filters after the pause; the header says it is filtered; the state is the filter', () => {
    vi.useFakeTimers();
    const t = hs();
    t.typeIn('ann');
    expect(t.g.kernel.query.filter).toEqual({});
    vi.advanceTimersByTime(150);
    expect(t.g.kernel.query.filter['name']).toEqual(contains('ann'));
    expect(t.ids().every((id) => Number(id.slice(1)) % 3 === 0)).toBe(true);
    expect(t.hcell('name').hasAttribute('data-dzg-filtered')).toBe(true);
  });

  it('Space and Enter typed in the input never sort; a click in it never sorts', () => {
    const t = hs();
    t.input().focus();
    for (const k of [' ', 'Enter']) t.key(t.input(), k);
    t.input().click();
    expect(t.g.kernel.query.sort).toEqual([]);
  });

  it('clear all (the overlay\'s clearFilters, a host\'s empty filter): the input empties, even while focused', () => {
    vi.useFakeTimers();
    const t = hs();
    t.typeIn('ann');
    vi.advanceTimersByTime(150);
    t.g.kernel.dispatch({ type: 'filter.set', filter: {} }, 'api');
    expect(t.g.kernel.query.filter).toEqual({});
    expect(t.input().value).toBe('');
  });

  it('a pending edit dropped by another write (the popup applied) comes back as the filter in force', () => {
    vi.useFakeTimers();
    const t = hs();
    t.typeIn('bo');
    // Before the pause, the host writes the column's filter: the typed edit is dropped.
    t.g.kernel.dispatch({ type: 'filter.set', filter: { name: contains('ann') } as never }, 'api');
    expect(t.input().value).toBe('ann');
    vi.advanceTimersByTime(300);
    expect(t.g.kernel.query.filter['name']).toEqual(contains('ann'));
  });

  it('filter: false: the context\'s filter is null, the input hidden', () => {
    const t = hs({ columns: [{ id: 'name', header: 'Name', filter: false, ui: { header: 'search' } }] });
    expect(t.input().hidden).toBe(true);
  });
});

// The base's own text for the EN bundle stays the grid's (no stray import warning).
void EN;
