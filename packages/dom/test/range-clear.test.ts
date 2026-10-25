// `@dzgrid/dom/range`, when the block is dropped (docs/behaviors/range-selection.md 2, 10, 14, 17; owner QB7, S11-Q4;
// step11a-plan.md « Drops »): each drop, said exactly once (several events in one task), its own sentence for a sort,
// a filter or a search; what keeps it (a transaction with both corners shown, an expand, a scroll, a resize); the
// `rangeChanged` sources; a nested grid's block is its own.
import { describe, it, expect, afterEach } from 'vitest';
import type { CellRange } from '@dzgrid/core';
import { sourceRows, type DataRequest, type DataResponse } from '@dzgrid/core/server';
import { tree } from '../src/tree.js';
import { pagination } from '../src/pagination.js';
import { detail, nestedGrid } from '../src/detail.js';
import { edit } from '../src/edit.js';
import { range } from '../src/range.js';
import { EN } from '../src/locales/en.js';
import { EN_RANGE } from '../src/locales/en-range.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { EN_PAGINATION } from '../src/locales/en-pagination.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { COLUMNS, cleanup, join, k, rmake, rowsOf, type R } from './support-range.js';

afterEach(cleanup);

const R_ = (a: [string, string], f: [string, string]): CellRange => ({ anchor: { row: k(a[0]), column: a[1] }, focus: { row: k(f[0]), column: f[1] } });
const CLEARED = 'Selection cleared';
const REORDERED = 'Selection cleared: the order changed';

/** A grid with a block r2/n … r5/s made by the keys (the user's). */
function withBlock(o: Parameters<typeof rmake>[0] = {}) {
  const t = rmake(o);
  t.focus('r2', 'n');
  t.press('ArrowDown', { shiftKey: true });
  t.press('ArrowDown', { shiftKey: true });
  t.press('ArrowDown', { shiftKey: true });
  t.press('ArrowRight', { shiftKey: true });
  t.announce.mockClear();
  t.events.length = 0;
  return t;
}

describe('range drops: the order or the rows shown change (QB7, S11-Q4)', () => {
  for (const [what, act, sentence] of [
    ['a sort', (t: ReturnType<typeof rmake>) => t.g.kernel.dispatch({ type: 'sort.toggle', column: 'q', multi: false }, 'user'), REORDERED],
    ['a filter', (t: ReturnType<typeof rmake>) => t.g.kernel.dispatch({ type: 'filter.column', column: 's', filter: { type: 'text', op: 'contains', value: 's' } } as never, 'api'), REORDERED],
    ['a quick search', (t: ReturnType<typeof rmake>) => t.g.kernel.dispatch({ type: 'quick.set', text: 'Name' }, 'user'), REORDERED],
  ] as const) {
    it(`${what} drops the block, said once with its own sentence; the event's source is data`, () => {
      const t = withBlock();
      act(t);
      expect(t.block()).toBeNull();
      expect(t.ranged()).toEqual([]);
      expect(t.said().filter((s) => s === sentence)).toHaveLength(1);
      expect(t.said().filter((s) => s === CLEARED)).toHaveLength(0);
      expect(t.changes().map((e) => [e.source, e.range])).toEqual([['data', null]]);
    });
  }

  it('a sort and a filter in one task: dropped once, said once', () => {
    const t = withBlock();
    t.g.kernel.dispatch({ type: 'sort.toggle', column: 'q', multi: false }, 'user');
    t.g.kernel.dispatch({ type: 'filter.column', column: 's', filter: { type: 'text', op: 'contains', value: 's' } } as never, 'api');
    t.g.kernel.dispatch({ type: 'quick.set', text: '1' }, 'user');
    expect(t.said().filter((s) => s === REORDERED || s === CLEARED)).toEqual([REORDERED]);
    expect(t.changes()).toHaveLength(1);
  });

  it('reapply (the stale order put back) drops it as a sort does', () => {
    const t = withBlock({ messages: join(EN, EN_RANGE, EN_EDIT), columns: COLUMNS.map((c) => ({ ...c, editable: true })), features: (r) => [edit(), r] });
    t.g.kernel.dispatch({ type: 'sort.toggle', column: 'q', multi: false }, 'api');
    // A new block after the sort; then an edit makes the order stale, and the reapply drops the block.
    const t2 = t;
    t2.focus('r2', 'n');
    t2.press('ArrowDown', { shiftKey: true });
    expect(t2.block()).not.toBeNull();
    t2.announce.mockClear();
    t2.g.kernel.dispatch({ type: 'rows.reapply' }, 'user');
    expect(t2.block()).toBeNull();
    expect(t2.said()).toEqual([REORDERED]);
  });

  it('a page change drops it (server or browser pages): « cleared », once', () => {
    const t = withBlock({ messages: join(EN, EN_RANGE, EN_PAGINATION), settings: { pagination: { pageSize: 10 } }, features: (r) => [pagination(), r] });
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    expect(t.block()).toBeNull();
    expect(t.said().filter((s) => s === CLEARED)).toHaveLength(1);
  });

  it('a server grid: a block within the page; Ctrl+A takes the page\'s rows; a new page drops it', async () => {
    const rows = rowsOf(50);
    const fetch = async (req: DataRequest): Promise<DataResponse<R>> => ({ rows: rows.slice(req.page!.index * 10, req.page!.index * 10 + 10), total: 50 });
    const t = rmake({ messages: join(EN, EN_RANGE, EN_PAGINATION), settings: { rows: undefined, source: sourceRows<R>({ fetch }), pagination: { pageSize: 10 } } as never, features: (r) => [pagination(), r] });
    await new Promise((r) => setTimeout(r, 0));
    t.g.api.refresh();
    expect(t.g.kernel.rows.displayed.count).toBe(10);
    t.focus('r3');
    t.press('a', { ctrlKey: true, code: 'KeyA' });
    expect(t.block()).toBe('r0/name:r9/q');
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    await new Promise((r) => setTimeout(r, 0));
    expect(t.block()).toBeNull();
  });
});

describe('range drops: columns, rows, the focus', () => {
  it('a column hidden, moved or pinned drops it; a resize keeps it', () => {
    for (const patch of [[{ id: 'n', hidden: true }], [{ id: 'q', order: 0 }], [{ id: 's', pinned: 'start' as const }]]) {
      const t = withBlock();
      t.g.kernel.dispatch({ type: 'column.state', patch }, 'user');
      expect(t.block(), JSON.stringify(patch)).toBeNull();
      expect(t.said().filter((s) => s === CLEARED), JSON.stringify(patch)).toHaveLength(1);
    }
    const t = withBlock();
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'n', width: 140 }] }, 'user');
    expect(t.block()).toBe('r2/n:r5/s');
    expect(t.said()).toEqual([]);
  });

  it('a host transaction keeping both corners shown keeps it (rows inserted above and inside, an update); one removing a corner drops it, said once', () => {
    const t = withBlock();
    t.g.kernel.rows.applyTransaction?.({ add: [{ id: 'new1', name: 'N', n: 1, s: 's', q: 1 }], addAt: 0 } as never, 'host');
    t.g.kernel.rows.applyTransaction?.({ update: [{ id: 'r3', name: 'X', n: 3, s: 's3', q: 3 }] } as never, 'host');
    expect(t.block()).toBe('r2/n:r5/s');
    expect(t.said()).toEqual([]);
    t.g.kernel.rows.applyTransaction?.({ remove: ['r5'] } as never, 'host');
    expect(t.block()).toBeNull();
    expect(t.said()).toEqual([CLEARED]);
    expect(t.changes().map((e) => e.source)).toEqual(['data']);
  });

  it('a tree: closing a parent that hides a corner drops it; an expand elsewhere keeps it', () => {
    const rows: R[] = [{ ...rowsOf(1)[0]!, id: 'A', parent: null }, ...rowsOf(5).map((r) => ({ ...r, parent: 'A' })), { ...rowsOf(1)[0]!, id: 'B', parent: null }, ...rowsOf(10).slice(5).map((r) => ({ ...r, parent: 'B' }))];
    const t = rmake({ rows, messages: join(EN, EN_RANGE, EN_TREE), features: (r) => [tree<R>({ parentId: (x) => x.parent ?? null }), r] });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('A')], expanded: true }, 'api');
    t.api().set(R_(['A', 'name'], ['r3', 'n']));
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('B')], expanded: true }, 'api');
    expect(t.block()).toBe('A/name:r3/n');
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('A')], expanded: false }, 'user');
    expect(t.block()).toBeNull();
    expect(t.said().filter((s) => s === CLEARED)).toHaveLength(1);
  });

  it('a plain arrow, a click elsewhere, Tab to the header: dropped, « cleared » once; the source is the user', () => {
    for (const how of ['arrow', 'click', 'header'] as const) {
      const t = withBlock();
      if (how === 'arrow') t.press('ArrowDown');
      if (how === 'click') t.down(t.cell('r8')!, t.at('r8')), t.up(t.at('r8')), t.click(t.cell('r8')!);
      if (how === 'header') t.host.querySelector<HTMLElement>('.dzg-hcell[data-col="n"]')!.focus();
      expect(t.block(), how).toBeNull();
      expect(t.said().filter((s) => s === CLEARED), how).toHaveLength(1);
      expect(t.changes().map((e) => e.source), how).toEqual(['user']);
    }
  });

  it('Escape drops it, the focus stays on its cell; « cleared » once, the next Escape is the grid\'s', () => {
    const t = withBlock();
    expect(t.press('Escape').defaultPrevented).toBe(true);
    expect(t.where()).toBe('r5/s');
    expect(t.said()).toEqual([CLEARED]);
    expect(t.press('Escape').defaultPrevented).toBe(false);
    expect(t.said()).toEqual([CLEARED]);
  });

  it('kept: a scroll, the focus leaving the grid, a row height change', () => {
    const t = withBlock({ rows: rowsOf(400) });
    t.scroll(32 * 100);
    const outside = document.body.appendChild(document.createElement('button'));
    outside.focus();
    t.g.update({ density: 'compact' });
    expect(t.block()).toBe('r2/n:r5/s');
    expect(t.said()).toEqual([]);
  });

  it('each nested grid has its own block: a block inside a panel leaves the outer grid without one, and the reverse', () => {
    const inner = range();
    const messages = join(EN, EN_RANGE, EN_DETAIL);
    const box = { block: 160, inline: 500, scrollTop: 0, scrollInline: 0 };
    const geometry = { read: () => ({ ...box }), writeScrollTop: (px: number) => void (box.scrollTop = px), writeScrollInline: (px: number) => void (box.scrollInline = px) };
    const part = nestedGrid<R>({ env: () => ({ geometry, sync: true }), settings: () => ({ rows: rowsOf(5), getRowId: (r: R) => r.id, columns: COLUMNS, messages, features: [inner] }) });
    const t = rmake({ messages, features: (r) => [detail<R>({ part, height: 200 }), r] });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('r1')], expanded: true }, 'api');
    t.g.api.refresh();
    const innerCell = t.host.querySelector<HTMLElement>('.dzg-dcell .dzg-cell[data-col="n"]')!;
    expect(innerCell).not.toBeNull();
    innerCell.focus();
    t.press('ArrowDown', { shiftKey: true }, innerCell);
    expect(t.block()).toBeNull();
    const innerGrid = innerCell.closest('.dzg')!;
    expect(innerGrid.querySelectorAll('.dzg-cell--range')).toHaveLength(2);
    // The outer grid's block leaves the inner one alone.
    t.focus('r4');
    t.press('ArrowDown', { shiftKey: true });
    expect(t.block()).toBe('r4/name:r5/name');
    expect(innerGrid.querySelectorAll('.dzg-cell--range')).toHaveLength(2);
  });
});

describe('range drops: review of step 11a', () => {
  it('a focus moved by the data (its row removed, not a corner) keeps the block', () => {
    const t = rmake();
    t.focus('r8');
    t.api().set(R_(['r2', 'n'], ['r5', 's']));
    t.g.kernel.rows.applyTransaction?.({ remove: ['r8'] } as never, 'host');
    expect(t.block()).toBe('r2/n:r5/s');
  });
});
