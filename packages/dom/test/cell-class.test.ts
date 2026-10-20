// `ui.cellClass` (step 26; docs/behaviors/cell-class.md): classes from the data, in the base.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { dataKey, type ColumnDef } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import type { SlotPart } from '../src/part.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; n: number; s: string };

let grids: GridInstance<R>[] = [];
afterEach(() => {
  for (const g of grids) g.destroy();
  grids = [];
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const rowsOf = (n: number): R[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, n: i % 2 ? -i : i, s: `s${i}` }));

function make(rule: NonNullable<NonNullable<ColumnDef<R>['ui']>['cellClass']>, settings: Partial<GridSettings<R>> = {}, rows = rowsOf(100), extra: Partial<ColumnDef<R>> = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const columns: ColumnDef<R, any>[] = [{ id: 's' }, { id: 'n', type: 'number', ...extra, ui: { ...extra.ui, cellClass: rule } }];
  const g = createGrid<R>(host, { rows, getRowId: (r) => r.id, columns, messages: EN, ...settings }, { geometry, sync: true });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const scroll = (top: number) => { box.scrollTop = top; vp.dispatchEvent(new Event('scroll')); };
  const cell = (row: number, col = 'n') => host.querySelector<HTMLElement>(`.dzg-row[aria-rowindex="${row}"] [data-col="${col}"]`)!;
  return { g, host, scroll, cell };
}

describe('ui.cellClass', () => {
  it('adds the rule’s classes to the cells it names, with the value, text, row, key, column and context', () => {
    const seen: unknown[] = [];
    const { cell } = make((c) => {
      if ((c.row as R).id === 'r1') seen.push({ value: c.value, text: c.text, id: (c.row as R).id, key: c.key, column: c.column, context: c.context });
      return (c.value as number) < 0 ? 'neg strong' : null;
    }, { context: { who: 'nurse' } });
    expect([...cell(3).classList].sort()).toEqual(['dzg-cell', 'neg', 'strong']);
    expect([...cell(2).classList]).toEqual(['dzg-cell']);
    expect(seen[0]).toEqual({ value: -1, text: '-1', id: 'r1', key: dataKey('r1'), column: 'n', context: { who: 'nurse' } });
    // Only its column: the other column's cell has none.
    expect([...cell(3, 's').classList]).toEqual(['dzg-cell']);
  });

  it('follows a pooled cell shown for another row (a scroll), and a value changed by a transaction', () => {
    const { g, cell, scroll } = make((c) => ((c.value as number) < 0 ? 'neg' : null));
    expect(cell(3).classList.contains('neg')).toBe(true);
    scroll(32 * 40);
    // Row index 42 holds r40 (even: positive), 43 holds r41 (negative).
    expect(cell(42).classList.contains('neg')).toBe(false);
    expect(cell(43).classList.contains('neg')).toBe(true);
    scroll(0);
    g.kernel.rows.applyTransaction({ update: [{ id: 'r1', n: 5, s: 's1' }] });
    expect(cell(3).classList.contains('neg')).toBe(false);
  });

  it('is asked again only on a rebind: a paint that changes nothing for the cell does not call it', () => {
    const rule = vi.fn((c: { value: unknown }) => ((c.value as number) < 0 ? 'neg' : null));
    const { g } = make(rule);
    const before = rule.mock.calls.length;
    expect(before).toBeGreaterThan(0);
    g.api.refresh();
    g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: 'r5' as never, column: 's' } } as never, 'api');
    // A focus moves in r5 only: its cells are rebound (focusCol changed), no other row's.
    expect(rule.mock.calls.length - before).toBeLessThanOrEqual(1);
  });

  it('diffs tokens: the grid’s own classes and others stay; dzg- tokens from the rule are ignored', () => {
    let out: string | null = 'a b dzg-cell dzg-flash';
    const { g, cell } = make(() => out);
    const c = cell(2);
    c.classList.add('host-own', 'dzg-flash');
    expect(c.classList.contains('a')).toBe(true);
    out = 'b c';
    g.update({ context: 1 });
    expect([...c.classList].sort()).toEqual(['b', 'c', 'dzg-cell', 'dzg-flash', 'host-own']);
    out = null;
    g.update({ context: 2 });
    expect([...c.classList].sort()).toEqual(['dzg-cell', 'dzg-flash', 'host-own']);
  });

  it('reports a rule that throws and clears its classes; the grid goes on', () => {
    const reported: unknown[] = [];
    (window as Window & { reportError?: (e: unknown) => void }).reportError = (e) => reported.push(e);
    let boom = false;
    const { g, cell } = make((c) => {
      if (boom && c.key === dataKey('r0')) throw new Error('rule');
      return 'mark';
    });
    expect(cell(2).classList.contains('mark')).toBe(true);
    boom = true;
    g.update({ context: 'x' });
    expect(cell(2).classList.contains('mark')).toBe(false);
    expect(cell(3).classList.contains('mark')).toBe(true);
    expect(reported.length).toBeGreaterThan(0);
    expect(cell(2).textContent).toBe('0');
    delete (window as { reportError?: unknown }).reportError;
  });

  it('applies to cells drawn by a part too', () => {
    const part: SlotPart<'cell'> = { slot: 'cell', part: { mount: (el, c) => (el.append(`[${c.text}]`), { update: (c2) => el.replaceChildren(`[${c2.text}]`) }) } };
    const { cell } = make((c) => ((c.value as number) < 0 ? 'neg' : null), { parts: { p: part } }, rowsOf(20), { ui: { cell: 'p' } });
    expect(cell(3).textContent).toBe('[-1]');
    expect(cell(3).classList.contains('neg')).toBe(true);
  });

  it('never touches the inline layout the grid writes', () => {
    const { g, cell } = make((c) => ((c.value as number) < 0 ? 'neg' : 'pos'));
    const c = cell(3);
    const style = c.getAttribute('style');
    g.update({ context: 'again' });
    expect(c.getAttribute('style')).toBe(style);
    expect(c.style.getPropertyValue('inline-size')).not.toBe('');
  });
});
