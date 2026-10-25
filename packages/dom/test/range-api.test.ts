// `@dzgrid/dom/range`, the application's side (step11a-plan.md « API »): get / set / clear / box; a corner not shown
// or a column not visible refused (false, a `problems` event, never a throw); no sentence, the focus untouched; one
// `rangeChanged` per change; one feature object for several grids; destroy leaves nothing; texts checked at setup.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { CellRange, GridEvent } from '@dzgrid/core';
import { rangeBox } from '@dzgrid/core/range';
import { range, RANGE_KEYS } from '../src/range.js';
import { EN } from '../src/locales/en.js';
import { cleanup, k, MSG, rmake, rowsOf, type R } from './support-range.js';

afterEach(cleanup);

const R_ = (a: [string, string], f: [string, string]): CellRange => ({ anchor: { row: k(a[0]), column: a[1] }, focus: { row: k(f[0]), column: f[1] } });
const problems = (events: GridEvent<R>[]) => events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: { code: string; path: string }[] }).problems);

describe('range api', () => {
  it('get / set / clear / box: corners by keys, the box for the rows shown (as core/range\'s rangeBox)', () => {
    const t = rmake();
    expect(t.api().get()).toBeNull();
    expect(t.api().box()).toBeNull();
    const r = R_(['r4', 's'], ['r2', 'n']);
    expect(t.api().set(r)).toBe(true);
    expect(t.api().get()).toEqual(r);
    expect(t.api().box()).toEqual({ top: 2, bottom: 4, start: 1, end: 2 });
    expect(t.api().box()).toEqual(rangeBox(r, t.g.kernel.rows.displayed, t.ctx.columns.visible().map((c) => c.id)));
    t.api().clear();
    expect(t.api().get()).toBeNull();
    expect(t.ranged()).toEqual([]);
    // One cell is no block.
    expect(t.api().set(R_(['r1', 'n'], ['r1', 'n']))).toBe(true);
    expect(t.api().get()).toBeNull();
  });

  it('a row not shown or a column not visible: false, nothing changed, a problems event, no throw', () => {
    const t = rmake({ columns: [{ id: 'name', width: 100 }, { id: 'n', type: 'number', width: 80 }, { id: 'h', width: 80, hidden: true }] });
    t.api().set(R_(['r1', 'name'], ['r2', 'n']));
    t.events.length = 0;
    expect(t.api().set(R_(['r1', 'name'], ['r2', 'h']))).toBe(false);
    expect(t.api().set(R_(['nope', 'name'], ['r2', 'n']))).toBe(false);
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'gt', value: 10 } }, 'api');
    t.events.length = 0;
    expect(t.api().set(R_(['r3', 'name'], ['r20', 'n']))).toBe(false);
    expect(t.api().get()).toBeNull();
    expect(problems(t.events).map((p) => p.code)).toEqual(['unknown-row-id']);
    expect(t.changes()).toEqual([]);
  });

  it('the API does not move the focus and is not said; one rangeChanged per change, source api', () => {
    vi.useFakeTimers();
    const t = rmake();
    t.focus('r7', 'q');
    const r = R_(['r1', 'n'], ['r3', 's']);
    t.api().set(r);
    t.api().set(r);
    t.api().set(R_(['r1', 'n'], ['r3', 's']));
    vi.advanceTimersByTime(1000);
    expect(t.where()).toBe('r7/q');
    expect(t.said()).toEqual([]);
    expect(t.changes().map((e) => [e.source, !!e.range])).toEqual([['api', true]]);
    t.api().set(null);
    t.api().clear();
    expect(t.changes().map((e) => [e.source, !!e.range])).toEqual([['api', true], ['api', false]]);
  });

  it('one feature object serves several grids, each its own block', () => {
    const f = range();
    const a = rmake({ feature: f });
    const b = rmake({ feature: f });
    f.api(a.g)!.set(R_(['r1', 'name'], ['r2', 'n']));
    expect(f.api(b.g)!.get()).toBeNull();
    expect(a.ranged()).toHaveLength(4);
    expect(b.ranged()).toEqual([]);
  });

  it('destroy: no class, no attribute, no timer, no listener left; api() null', () => {
    vi.useFakeTimers();
    const t = rmake();
    const base = rmake({ features: () => [] });
    t.focus('r1');
    t.press('ArrowDown', { shiftKey: true });
    t.down(t.cell('r4')!, t.at('r4'));
    t.move(t.at('r5'));
    expect(t.ctx.scope.listenerCount).toBeGreaterThan(base.ctx.scope.listenerCount);
    // The press dropped the keys' block (« cleared »); the drag's size is still to be said when the grid goes.
    const before = t.said();
    t.g.destroy();
    expect(t.feature.api(t.g)).toBeNull();
    expect(t.host.querySelectorAll('.dzg-cell--range, [aria-selected="true"], [data-dzg-ranging]')).toHaveLength(0);
    expect(t.ctx.scope.pending).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(t.said()).toEqual(before);
  });

  it('setup refuses a bundle without its texts, naming them', () => {
    expect(RANGE_KEYS).toEqual(['range.rows', 'range.cols', 'range.size', 'range.cleared', 'range.reordered']);
    expect(() => rmake({ messages: EN })).toThrow(/range: missing range\.rows, range\.cols, range\.size, range\.cleared, range\.reordered/);
    void MSG;
    void rowsOf;
  });
});

describe('range api: review of step 11a', () => {
  it('set() refusals say which: a column not visible, then a row not shown', () => {
    const t = rmake({ columns: [{ id: 'name', width: 100 }, { id: 'n', type: 'number', width: 80 }, { id: 'h', width: 80, hidden: true }] });
    expect(t.api().set(R_(['r1', 'name'], ['r2', 'h']))).toBe(false);
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'gt', value: 10 } }, 'api');
    expect(t.api().set(R_(['r20', 'name'], ['r3', 'n']))).toBe(false);
    expect(problems(t.events).map((p) => `${p.code}@${p.path}`)).toEqual(['unknown-column@range', 'unknown-row-id@range']);
  });

  it('after an API set, a Shift+arrow starts from the focused cell (set resets « follows »)', () => {
    const t = rmake();
    t.focus('r1', 'n');
    t.press('ArrowDown', { shiftKey: true });
    t.api().set(R_(['r5', 'name'], ['r6', 'q']));
    t.press('ArrowDown', { shiftKey: true });
    expect(t.block()).toBe('r2/n:r3/n');
  });

  it('review 4: set() never throws: a value of the wrong shape is refused, told, false', () => {
    const t = rmake();
    t.api().set(R_(['r1', 'name'], ['r2', 'n']));
    for (const bad of [{}, { anchor: null, focus: null }, { anchor: { row: 1, column: 'n' }, focus: { row: k('r2'), column: 'n' } }, { anchor: { row: k('r1') }, focus: { row: k('r2'), column: 'n' } }, 'r1', 7]) {
      t.events.length = 0;
      let r: boolean | undefined;
      expect(() => (r = t.api().set(bad as never)), JSON.stringify(bad)).not.toThrow();
      expect(r, JSON.stringify(bad)).toBe(false);
      expect(problems(t.events).map((p) => `${p.code}@${p.path}`), JSON.stringify(bad)).toEqual(['invalid-setting@range']);
    }
    expect(t.block()).toBe('r1/name:r2/n');
  });
});
