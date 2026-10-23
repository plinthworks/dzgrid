// Class hooks beside `ui.cellClass` (showcase themes step 6, owner T5; docs/behaviors/cell-class.md): a row's
// classes from its data (`settings.rowClass`), a column header's own classes (`ui.headerClass`), a class per
// badge tone (`badge({ classes })`). Where a framework's utilities (Tailwind, Bootstrap) meet the grid.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { dataKey, localeCtx, type ColumnDef } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import type { SlotContext } from '../src/part.js';
import { badge } from '../src/parts.js';
import { detail } from '../src/detail.js';
import { definePart } from '../src/part.js';
import { EN } from '../src/locales/en.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';

type R = { id: string; n: number; s: string };

let grids: GridInstance<R>[] = [];
afterEach(() => {
  for (const g of grids) g.destroy();
  grids = [];
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  delete (window as { reportError?: unknown }).reportError;
});

const rowsOf = (n: number): R[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, n: i % 2 ? -i : i, s: `s${i}` }));

function make(settings: Partial<GridSettings<R>> = {}, columns: ColumnDef<R, any>[] = [{ id: 's' }, { id: 'n', type: 'number' }], rows = rowsOf(100)) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const g = createGrid<R>(host, { rows, getRowId: (r) => r.id, columns, messages: EN, ...settings }, { geometry, sync: true });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const scroll = (top: number) => { box.scrollTop = top; vp.dispatchEvent(new Event('scroll')); };
  const row = (i: number) => host.querySelector<HTMLElement>(`.dzg-layer > .dzg-row[aria-rowindex="${i}"]`)!;
  const header = (col: string) => host.querySelector<HTMLElement>(`.dzg-hcell[data-col="${col}"]`)!;
  return { g, host, scroll, row, header };
}
const own = (el: Element) => [...el.classList].filter((c) => !c.startsWith('dzg-')).sort();

describe('settings.rowClass', () => {
  it('puts the rule’s classes on the row it names, told the row, its key and the context', () => {
    const seen: unknown[] = [];
    const { row } = make({
      context: { who: 'nurse' },
      rowClass: (c) => {
        if ((c.row as R).id === 'r1') seen.push({ id: (c.row as R).id, key: c.key, context: c.context });
        return (c.row as R).n < 0 ? 'flag strong' : null;
      },
    });
    expect(own(row(3))).toEqual(['flag', 'strong']);
    expect(own(row(2))).toEqual([]);
    expect(row(3).classList.contains('dzg-row')).toBe(true);
    expect(seen[0]).toEqual({ id: 'r1', key: dataKey('r1'), context: { who: 'nurse' } });
  });

  it('follows a pooled row shown for another row (a scroll) and a value changed by a transaction', () => {
    const { g, row, scroll } = make({ rowClass: (c) => ((c.row as R).n < 0 ? 'flag' : null) });
    expect(own(row(3))).toEqual(['flag']);
    scroll(32 * 40);
    expect(own(row(42))).toEqual([]);
    expect(own(row(43))).toEqual(['flag']);
    scroll(0);
    g.kernel.rows.applyTransaction({ update: [{ id: 'r1', n: 5, s: 's1' }] });
    expect(own(row(3))).toEqual([]);
  });

  it('a new rule (update) or a new context asks again; a paint that changes nothing does not', () => {
    const rule = vi.fn((c: { row: unknown }) => ((c.row as R).n < 0 ? 'a' : null));
    const { g, row } = make({ rowClass: rule });
    const before = rule.mock.calls.length;
    g.api.refresh();
    expect(rule.mock.calls.length).toBe(before);
    g.update({ rowClass: () => 'b' });
    expect(own(row(2))).toEqual(['b']);
    expect(own(row(3))).toEqual(['b']);
    g.update({ rowClass: (c) => (c.context === 'x' ? 'c' : 'b') });
    g.update({ context: 'x' });
    expect(own(row(2))).toEqual(['c']);
  });

  it('diffs tokens: the grid’s classes and the host’s own stay; dzg- tokens are ignored', () => {
    let out: string | null = 'a b dzg-row dzg-x';
    const { g, row } = make({ rowClass: () => out });
    const r = row(2);
    r.classList.add('host-own');
    expect(own(r).filter((c) => c !== 'host-own')).toEqual(['a', 'b']);
    expect(r.classList.contains('dzg-x')).toBe(false);
    out = 'b c';
    g.update({ context: 1 });
    expect([...r.classList].sort()).toEqual(['b', 'c', 'dzg-row', 'host-own']);
    out = null;
    g.update({ context: 2 });
    expect([...r.classList].sort()).toEqual(['dzg-row', 'host-own']);
  });

  it('a rule that throws is reported and its row’s classes cleared; the grid goes on', () => {
    const reported: unknown[] = [];
    (window as Window & { reportError?: (e: unknown) => void }).reportError = (e) => reported.push(e);
    let boom = false;
    const { g, row } = make({
      rowClass: (c) => {
        if (boom && c.key === dataKey('r0')) throw new Error('rule');
        return 'mark';
      },
    });
    expect(own(row(2))).toEqual(['mark']);
    boom = true;
    g.update({ context: 'x' });
    expect(own(row(2))).toEqual([]);
    expect(own(row(3))).toEqual(['mark']);
    expect(reported.length).toBeGreaterThan(0);
    expect(row(2).textContent).toContain('s0');
  });

  it('takes names separated by a tab or a newline (test analysis M17)', () => {
    let out = 'a\tb\nc';
    const { g, row } = make({ rowClass: () => out });
    expect(own(row(2))).toEqual(['a', 'b', 'c']);
    out = 'c\n\tb';
    g.update({ context: 1 });
    expect(own(row(2))).toEqual(['b', 'c']);
  });

  it('a pooled row reused as a detail row loses its classes, and the rule is never asked without a row (M08, M09)', () => {
    const seen: unknown[] = [];
    const panel = definePart('detail', { mount: (host) => (host.append('panel'), {}) });
    const { g, host } = make({
      messages: { ...EN, text: { ...EN.text, ...EN_DETAIL.text } }, features: [detail<R>({ part: panel }) as never],
      rowClass: (c) => (seen.push(c.row), 'flag'),
    }, [{ id: 's' }, { id: 'n', type: 'number' }], rowsOf(40));
    const rows = () => [...host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')];
    expect(rows().every((r) => r.classList.contains('flag'))).toBe(true);
    const pool = new Set(rows());
    // Every master open: a detail row after each, made from rows the pool already holds.
    g.kernel.dispatch({ type: 'rows.expand', rows: rowsOf(10).map((r) => dataKey(r.id)!), expanded: true }, 'api');
    const details = rows().filter((r) => r.dataset['kind'] === 'detail');
    expect(details.length).toBeGreaterThan(0);
    expect(details.some((r) => pool.has(r))).toBe(true);
    for (const r of details) expect(own(r), r.getAttribute('aria-rowindex') ?? '').toEqual([]);
    for (const r of rows().filter((r) => r.dataset['kind'] !== 'detail')) expect(r.classList.contains('flag')).toBe(true);
    expect(seen.every((row) => row !== undefined && row !== null)).toBe(true);
  });

  it('never touches the inline layout the grid writes', () => {
    const { g, row } = make({ rowClass: () => 'x' });
    const style = row(2).getAttribute('style');
    g.update({ context: 'again' });
    expect(row(2).getAttribute('style')).toBe(style);
  });
});

describe('ui.headerClass', () => {
  it('puts a column’s classes on its header cell only, and follows the columns', () => {
    const cols = (cls: string): ColumnDef<R, any>[] => [{ id: 's', ui: { headerClass: cls } }, { id: 'n', type: 'number' }];
    const { g, header } = make({}, cols('text-end uppercase dzg-no'));
    expect(own(header('s'))).toEqual(['text-end', 'uppercase']);
    expect(header('s').classList.contains('dzg-no')).toBe(false);
    expect(header('s').classList.contains('dzg-hcell')).toBe(true);
    expect(own(header('n'))).toEqual([]);
    header('s').classList.add('host-own');
    g.update({ columns: cols('uppercase fw-bold') });
    expect(own(header('s'))).toEqual(['fw-bold', 'host-own', 'uppercase']);
    g.update({ columns: [{ id: 's' }, { id: 'n', type: 'number' }] });
    expect(own(header('s'))).toEqual(['host-own']);
  });
});

describe('badge({ classes })', () => {
  /** A badge mounted by hand, as the grid would. */
  function alone(classes: Parameters<typeof badge>[0]) {
    const host = document.createElement('div');
    document.body.append(host);
    const base: SlotContext['cell'] = {
      ctx: localeCtx({ locale: 'en' }), dir: 'ltr', doc: document, announce: () => {}, msg: () => '',
      value: 'late', text: 'Late', row: {}, key: dataKey('a')!, column: {} as never, focused: false,
    };
    const handle = badge(classes).part.mount(host, base);
    const box = () => host.querySelector<HTMLElement>('.dzg-badge');
    return { box, update: (o: Partial<SlotContext['cell']>) => handle.update!({ ...base, ...o }) };
  }

  it('adds the class its tone names, and switches it with the tone', () => {
    const { box, update } = alone({ tones: { late: 'danger', done: 'success' }, classes: { danger: 'bg-red-100 text-red-800', success: 'text-bg-success' } });
    expect(box()!.className).toBe('dzg-badge bg-red-100 text-red-800');
    expect(box()!.dataset['tone']).toBe('danger');
    update({ value: 'done', text: 'Done' });
    expect(box()!.className).toBe('dzg-badge text-bg-success');
    // A tone the map does not name: the badge's own class only.
    update({ value: 'new', text: 'New' });
    expect(box()!.className).toBe('dzg-badge');
    expect(box()!.dataset['tone']).toBe('neutral');
  });

  it('an unmapped value takes the class of the fallback tone (M16)', () => {
    const { box } = alone({ tones: { done: 'success' }, fallback: 'warning', classes: { warning: 'bg-amber-50', success: 'ok' } });
    expect(box()!.dataset['tone']).toBe('warning');
    expect(box()!.className).toBe('dzg-badge bg-amber-50');
  });

  it('ignores dzg- names and takes a tab or a newline between names (review 3, M17)', () => {
    const { box } = alone({ tones: { late: 'danger' }, classes: { danger: 'x dzg-cell\ty\n dzg-flash' } });
    expect(box()!.className).toBe('dzg-badge x y');
  });

  it('without classes, the badge is as before', () => {
    const { box } = alone({ tones: { late: 'danger' } });
    expect(box()!.className).toBe('dzg-badge');
  });
});
