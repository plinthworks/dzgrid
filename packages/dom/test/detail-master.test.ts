// Rows without a detail (docs/behaviors/master-detail.md « Rows without a detail », step 16c): the DOM reads the
// core's answer for the chevron, aria-expanded and the keys. Expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type ColumnDef, type RowKey } from '@dzgrid/core';
import { sourceRows } from '@dzgrid/core/server';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridContext } from '../src/context.js';
import type { GridSettings } from '../src/settings.js';
import { definePart } from '../src/part.js';
import { detail } from '../src/detail.js';
import { EN } from '../src/locales/en.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import { AR } from '../src/locales/ar.js';
import { AR_DETAIL } from '../src/locales/ar-detail.js';

type T = { id: string; name: string; kids: number };
// Rows 1 and 3 have children.
const ROWS: T[] = [{ id: '1', name: 'one', kids: 2 }, { id: '2', name: 'two', kids: 0 }, { id: '3', name: 'three', kids: 1 }, { id: '4', name: 'four', kids: 0 }];
const COLUMNS: ColumnDef<T, any>[] = [{ id: 'name', header: 'Name', width: 160 }, { id: 'kids', header: 'Kids', type: 'number', width: 100 }];
const k = (id: string): RowKey => dataKey(id)!;
const grids: GridInstance<T>[] = [];
afterEach(() => { for (const g of grids.splice(0)) g.destroy(); document.body.innerHTML = ''; });

function make(over: Partial<GridSettings<T>> = {}, msg = { ...EN, text: { ...EN.text, ...EN_DETAIL.text } }) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const part = definePart('detail', { mount(h, c) { h.textContent = `detail of ${String(c.master)}`; return {}; } });
  let calls = 0;
  const g = createGrid<T>(host, {
    rows: ROWS, getRowId: (r) => r.id, columns: COLUMNS, messages: msg,
    features: [detail<T>({ part, height: 60, isMaster: (r) => (calls++, r.kids > 0) })], ...over,
  }, { geometry, sync: true });
  grids.push(g);
  const ctx = (g as unknown as { context: GridContext<T> }).context;
  const rowEl = (key: RowKey) => [...host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')].find((r) => ctx.rowRenderer.keyOf(r) === key) ?? null;
  const cell = (id: string, col = 'name') => rowEl(k(id))?.querySelector<HTMLElement>(`.dzg-cell[data-col="${col}"]`) ?? null;
  const toggle = (id: string) => cell(id)!.querySelector<HTMLElement>('.dzg-toggle');
  const press = (key: string) => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const focus = (id: string, col = 'name') => { g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k(id), column: col } }, 'user'); ctx.restoreFocus(); };
  return { g, host, ctx, cell, toggle, press, focus, calls: () => calls };
}

describe('detail({ isMaster }) in the DOM', () => {
  it('chevron and aria-expanded on rows 1 and 3 only; rows 2 and 4 keep an empty slot', () => {
    const t = make();
    expect(['1', '2', '3', '4'].map((id) => t.cell(id)!.getAttribute('aria-expanded'))).toEqual(['false', null, 'false', null]);
    expect(t.toggle('1')!.hasAttribute('data-none')).toBe(false);
    expect(t.toggle('2')!.hasAttribute('data-none')).toBe(true);
    expect(t.toggle('4')!.hasAttribute('data-none')).toBe(true);
  });

  it('ArrowRight on row 2 moves to the next column; on row 1 it opens', () => {
    const t = make();
    t.focus('2');
    t.press('ArrowRight');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: k('2'), column: 'kids' });
    expect(t.g.kernel.expansion.size).toBe(0);
    t.focus('1');
    t.press('ArrowRight');
    expect(t.g.kernel.expansion.has(k('1'))).toBe(true);
    expect(t.cell('1')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('a click on the empty slot opens nothing', () => {
    const t = make();
    t.toggle('2')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(t.g.kernel.expansion.size).toBe(0);
  });

  it('row 3 open then patched to no children: its chevron and aria-expanded go, its panel too; back: open again', () => {
    const t = make();
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('3')], expanded: true }, 'api');
    expect(t.host.querySelectorAll('.dzg-dbody')).toHaveLength(1);
    t.g.update({ rows: [ROWS[0]!, ROWS[1]!, { ...ROWS[2]!, kids: 0 }, ROWS[3]!] });
    expect(t.cell('3')!.hasAttribute('aria-expanded')).toBe(false);
    expect(t.toggle('3')!.hasAttribute('data-none')).toBe(true);
    expect(t.host.querySelectorAll('.dzg-dbody')).toHaveLength(0);
    t.g.update({ rows: ROWS });
    expect(t.cell('3')!.getAttribute('aria-expanded')).toBe('true');
    expect(t.host.querySelectorAll('.dzg-dbody')).toHaveLength(1);
  });

  it('the app function is asked once per row and version of the rows, not at each paint', () => {
    const t = make();
    const n = t.calls();
    expect(n).toBe(4);
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('1')], expanded: true }, 'api');
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('1')], expanded: false }, 'api');
    expect(t.calls()).toBe(n);
  });

  it('right to left, in Arabic: ArrowLeft (forward) opens row 1, moves on row 2', () => {
    const t = make({ direction: 'rtl', locale: 'ar' }, { ...AR, text: { ...AR.text, ...AR_DETAIL.text } });
    t.focus('2');
    t.press('ArrowLeft');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: k('2'), column: 'kids' });
    t.focus('1');
    t.press('ArrowLeft');
    expect(t.g.kernel.expansion.has(k('1'))).toBe(true);
  });

  it('a server source: the same chevrons', () => {
    // `rows: undefined` beside a source: the settings' exact optional types refuse an explicit undefined, hence the cast.
    const t = make({ rows: undefined, source: sourceRows<T>({ fetch: () => ({ rows: ROWS, total: 4 }) }) as never });
    expect(['1', '2', '3', '4'].map((id) => t.cell(id)?.getAttribute('aria-expanded') ?? null)).toEqual(['false', null, 'false', null]);
  });
});
