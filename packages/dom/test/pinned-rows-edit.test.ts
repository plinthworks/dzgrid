// @vitest-environment jsdom
// Phase 6 step 8b-1 (step08b-plan.md §2.4, §5; pinned-rows.md 11–16; editing.md 1 widened, C6; Q4, Q5): a pinned cell
// edits as a body cell — F2, a character, Enter, Escape; Tab and Enter's move kept inside its band; read-only cells said
// so (`aria-readonly`, the rule's third argument); the same save, its marks and undo; never stale; the application
// replacing the band while a field is open.
import { afterEach, describe, it, expect } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import type { SaveRequest } from '@dzgrid/core/edit';
import { pe, cleanup, rowsOf, ref, tot, T, B, k, type R } from './support-pinned.js';
import { ECOLS, settle } from './support-editors.js';

afterEach(cleanup);

const open = (p: ReturnType<typeof pe>, key: ReturnType<typeof T>, col: string) => {
  p.g.api.focusCell(key, col);
  return p.pcell(key, col)!;
};

describe('starting and ending (editing.md 4–6 on a pinned cell)', () => {
  it('F2 opens the field inside the pinned cell; Enter keeps the value, shown in the band', () => {
    const p = pe({ bottom: [tot('t', 9)] });
    const c = open(p, B('t'), 'n');
    p.key('F2');
    expect(p.field()).not.toBeNull();
    expect(c.contains(p.field())).toBe(true);
    p.type('42');
    p.key('Enter', {}, p.field()!);
    expect(p.field()).toBeNull();
    expect(p.pcell(B('t'), 'n')!.textContent).toBe('42');
    expect(document.activeElement).toBe(p.pcell(B('t'), 'n'));
  });

  it('a character starts the field with it; Escape gives the old value back', () => {
    const p = pe({ top: [ref('a')] });
    open(p, T('a'), 'name');
    p.key('x');
    expect(p.field()!.value).toBe('x');
    p.key('Escape', {}, p.field()!);
    expect(p.field()).toBeNull();
    expect(p.pcell(T('a'), 'name')!.textContent).toBe('Reference');
  });

  it('the same with pinnedRows() after the editors in the features', () => {
    const p = pe({ bottom: [tot('t', 9)], order: 'last' });
    open(p, B('t'), 'n');
    p.key('F2');
    expect(p.pcell(B('t'), 'n')!.contains(p.field())).toBe(true);
  });
});

describe('where editing is possible (editing.md 1, 3; Q4)', () => {
  it('a column not editable: read-only in the band too, F2 opens nothing', () => {
    const p = pe({ bottom: [tot('t')] });
    expect(p.pcell(B('t'), 's')!.getAttribute('aria-readonly')).toBe('true');
    expect(p.pcell(B('t'), 'n')!.hasAttribute('aria-readonly')).toBe(false);
    open(p, B('t'), 's');
    p.key('F2');
    expect(p.field()).toBeNull();
  });

  it('the rule is told { pinned }: a totals row read-only, the reference row and the body editable', () => {
    const cols: ColumnDef<R, any>[] = ECOLS.map((c) => (c.id === 'n' ? { ...c, editable: (_r: R, _c: unknown, i: { pinned?: string }) => i?.pinned !== 'bottom' } : c));
    const p = pe({ columns: cols, top: [ref('a')], bottom: [tot('t')] });
    expect(p.pcell(B('t'), 'n')!.getAttribute('aria-readonly')).toBe('true');
    expect(p.pcell(T('a'), 'n')!.hasAttribute('aria-readonly')).toBe(false);
    expect(p.cell('r0', 'n')!.hasAttribute('aria-readonly')).toBe(false);
    open(p, B('t'), 'n');
    p.key('F2');
    expect(p.field()).toBeNull();
  });
});

describe('moves out of a field stay in the band (pinned-rows.md 12)', () => {
  it('Tab goes to the next editable cell of the band; at the band\'s last one it stops there (never into the body)', () => {
    const p = pe({ top: [ref('a'), ref('b')], rows: rowsOf(3) });
    open(p, T('a'), 'q');
    p.key('F2');
    p.key('Tab', {}, p.field()!);
    expect(p.g.kernel.focus).toEqual({ kind: 'cell', row: T('b'), column: 'name' });
    p.key('Escape', {}, p.field()!);
    open(p, T('b'), 'q');
    p.key('F2');
    p.key('Tab', {}, p.field()!);
    expect(p.g.kernel.focus).toEqual({ kind: 'cell', row: T('b'), column: 'q' });
  });

  it('Enter with enterMoves: down: the next row of the band; at its last row it stays (never into the body)', () => {
    const p = pe({ top: [ref('a'), ref('b')], rows: rowsOf(3), options: { enterMoves: 'down' } });
    open(p, T('a'), 'n');
    p.key('F2');
    p.key('Enter', {}, p.field()!);
    expect(p.g.kernel.focus).toEqual({ kind: 'cell', row: T('b'), column: 'n' });
    p.key('F2');
    p.key('Enter', {}, p.field()!);
    expect(p.g.kernel.focus).toEqual({ kind: 'cell', row: T('b'), column: 'n' });
    p.key('F2');
    p.key('Enter', { shiftKey: true }, p.field()!);
    expect(p.g.kernel.focus).toEqual({ kind: 'cell', row: T('a'), column: 'n' });
    p.key('F2');
    p.key('Enter', { shiftKey: true }, p.field()!);
    expect(p.g.kernel.focus).toEqual({ kind: 'cell', row: T('a'), column: 'n' });
  });
});

describe('Enter stays in its region from the body too (review R3; pinned-rows.md 12)', () => {
  it('Enter (enterMoves: down) on the last body row does not go into the bottom band; Shift+Enter on the first does not go into the top band; the arrows still cross', () => {
    const p = pe({ top: [ref('a')], bottom: [tot('t')], rows: rowsOf(3), options: { enterMoves: 'down' } });
    p.g.api.focusCell(k('r2'), 'n');
    p.key('F2');
    p.key('Enter', {}, p.field()!);
    expect(p.g.kernel.focus).toEqual({ kind: 'cell', row: k('r2'), column: 'n' });
    p.g.api.focusCell(k('r0'), 'n');
    p.key('F2');
    p.key('Enter', { shiftKey: true }, p.field()!);
    expect(p.g.kernel.focus).toEqual({ kind: 'cell', row: k('r0'), column: 'n' });
    p.key('ArrowUp');
    expect(p.g.kernel.focus).toEqual({ kind: 'cell', row: T('a'), column: 'n' });
    p.g.api.focusCell(k('r2'), 'n');
    p.key('ArrowDown');
    expect(p.g.kernel.focus).toEqual({ kind: 'cell', row: B('t'), column: 'n' });
  });
});

describe('a body row whose id is a pinned key\'s text (review R1)', () => {
  it('its pending edit never shows in the pinned cell, nor the pinned edit in its cell', () => {
    const body = { ...rowsOf(1)[0]!, id: T('a'), n: 1 };
    const p = pe({ top: [ref('a')], rows: [body], save: () => new Promise<void>(() => {}) });
    p.g.api.focusCell(k(T('a')), 'n');
    p.key('F2');
    p.type('5');
    p.key('Enter', {}, p.field()!);
    expect(p.cell(T('a'), 'n')!.textContent).toBe('5');
    expect(p.pcell(T('a'), 'n')!.textContent).toBe('10');
    open(p, T('a'), 'n');
    p.key('F2');
    p.type('6');
    p.key('Enter', {}, p.field()!);
    expect(p.pcell(T('a'), 'n')!.textContent).toBe('6');
    expect(p.cell(T('a'), 'n')!.textContent).toBe('5');
  });
});

describe('the save, its marks and undo (pinned-rows.md 13, 15; Q5)', () => {
  it('one gesture, one request: the grid key, the app\'s row, pinned; the cell marked while it saves', async () => {
    const reqs: SaveRequest<R>[] = [];
    let done!: () => void;
    const total = tot('t', 9);
    const p = pe({ bottom: [total], save: (req) => (reqs.push(req), new Promise<void>((ok) => (done = ok))) });
    open(p, B('t'), 'n');
    p.key('F2');
    p.type('5');
    p.key('Enter', {}, p.field()!);
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.changes).toEqual([{ key: B('t'), column: 'n', value: 5, previous: 9, row: total, pinned: 'bottom' }]);
    expect(p.pcell(B('t'), 'n')!.classList.contains('dzg-cell--saving')).toBe(true);
    done();
    await settle();
    expect(p.pcell(B('t'), 'n')!.classList.contains('dzg-cell--saved')).toBe(true);
  });

  it('Ctrl+Z gives the value back and the focus to the pinned cell; Ctrl+Y again', () => {
    const p = pe({ top: [ref('a')], rows: rowsOf(3) });
    open(p, T('a'), 'n');
    p.key('F2');
    p.type('77');
    p.key('Enter', {}, p.field()!);
    p.g.api.focusCell(k('r1'), 'name');
    p.key('z', { ctrlKey: true });
    expect(p.pcell(T('a'), 'n')!.textContent).toBe('10');
    expect(p.g.kernel.focus).toEqual({ kind: 'cell', row: T('a'), column: 'n' });
    expect(document.activeElement).toBe(p.pcell(T('a'), 'n'));
    p.key('y', { ctrlKey: true });
    expect(p.pcell(T('a'), 'n')!.textContent).toBe('77');
  });
});

describe('never stale (pinned-rows.md 14)', () => {
  it('a pinned edit of the sorted column: no stale order, no reapply mark, no muted row', () => {
    const p = pe({ bottom: [tot('t', 9)], rows: rowsOf(5) });
    p.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'user');
    open(p, B('t'), 'n');
    p.key('F2');
    p.type('-3');
    p.key('Enter', {}, p.field()!);
    expect(p.g.kernel.orderStale).toBe(false);
    expect(p.host.querySelector('.dzg-reapply')).toBeNull();
    expect(p.host.querySelector('.dzg-pins [data-dzg-stale]')).toBeNull();
  });

  it('a body edit that stales the body never mutes a band row', () => {
    const p = pe({ bottom: [tot('r0', 9)], rows: rowsOf(5) });
    p.g.kernel.dispatch({ type: 'filter.set', filter: { n: { type: 'number', op: 'lt', value: 3 } } }, 'user');
    p.g.api.focusCell(k('r0'), 'n');
    p.key('F2');
    p.type('50');
    p.key('Enter', {}, p.field()!);
    expect(p.g.kernel.orderStale).toBe(true);
    expect(p.row('r0')!.hasAttribute('data-dzg-stale')).toBe(true);
    expect(p.host.querySelector('.dzg-pins [data-dzg-stale]')).toBeNull();
  });
});

describe('the application replaces the band while a field is open (pinned-rows.md 16)', () => {
  it('the same key kept: the field stays open', () => {
    const p = pe({ bottom: [tot('t', 9)] });
    open(p, B('t'), 'name');
    p.key('F2');
    p.papi.set({ bottom: [tot('t', 10)] });
    expect(p.field()).not.toBeNull();
    expect(p.pcell(B('t'), 'n')!.textContent).toBe('10');
  });

  it('its key gone: the field closes, « row removed » said', () => {
    const p = pe({ bottom: [tot('t', 9), tot('u', 1)] });
    open(p, B('t'), 'name');
    p.key('F2');
    p.type('changed');
    p.papi.set({ bottom: [tot('u', 1)] });
    expect(p.field()).toBeNull();
    expect(p.alert).toHaveBeenCalled();
    expect(p.g.kernel.focus).toEqual({ kind: 'cell', row: B('u'), column: 'name' });
  });
});
