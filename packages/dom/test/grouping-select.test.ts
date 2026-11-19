// `groupSelect()` beside `grouping()`: a group row's box ticks every row under it (1.14.0, docs/behaviors/row-grouping.md
// 25–29). Written before the code. Data (support-grouping.ts): Nord r1 r3 r4, Sud r2 r5, no region r6.
import { describe, it, expect, afterEach } from 'vitest';
import type { GridEvent, RowKey } from '@dzgrid/core';
import { groupSelect } from '../src/group-select.js';
import { gmake, cleanup, click, k, type R } from './support-grouping.js';

afterEach(cleanup);

const SEL = { selection: { mode: 'multi' as const, checkbox: true } };
const make = (o: { by?: string[]; open?: boolean; off?: boolean } = {}) => {
  const t = gmake({ grouping: { by: o.by ?? ['region'], ...(o.open && { expanded: 'all' as const }) }, ...(!o.off && { features: [groupSelect()] }), settings: SEL });
  /** A group's key by its labels (« Nord », « Nord/apple »). */
  const group = (path: string): RowKey => {
    const d = t.g.kernel.rows.displayed;
    for (let i = 0; i < d.count; i++) {
      const n = d.nodeAt(i as never); // a display index
      if (n.kind === 'group' && n.path.join('/') === path) return n.key;
    }
    throw new Error(`no group ${path}`);
  };
  const box = (path: string) => t.row(group(path))!.querySelector<HTMLElement>('.dzg-check .dzg-box')!;
  const ticked = () => {
    const s = t.g.kernel.selection;
    return `${s.mode}:${[...s.keys].map((x) => String(x).replace(/^d:\d+:/, '')).sort().join(',')}`;
  };
  const changes = () => t.events.filter((e): e is Extract<GridEvent<R>, { type: 'selectionChanged' }> => e.type === 'selectionChanged');
  return { ...t, group, box, ticked, changes };
};

describe('a group row’s box (row-grouping.md 25–28)', () => {
  it('shown, a checkbox named by the group’s label, unticked; off by default (rule 8: no box)', () => {
    const t = make();
    const b = t.box('Nord');
    expect([b.hidden, b.getAttribute('role'), b.getAttribute('aria-checked'), b.getAttribute('aria-label'), b.getAttribute('aria-hidden')]).toEqual([false, 'checkbox', 'false', 'Nord (3)', null]);
    const off = make({ off: true });
    expect(off.box('Nord').hidden).toBe(true);
    expect(off.box('Nord').getAttribute('role')).toBe(null);
  });

  it('a click ticks every row under it, closed or not; again: unticks them; one selectionChanged each, from the user', () => {
    const t = make();
    click(t.box('Sud'));
    expect(t.ticked()).toBe('include:r2,r5');
    expect(t.box('Sud').getAttribute('aria-checked')).toBe('true');
    expect(t.box('Nord').getAttribute('aria-checked')).toBe('false');
    expect(t.changes().map((e) => e.source)).toEqual(['user']);
    click(t.box('Sud'));
    expect(t.ticked()).toBe('include:');
    expect(t.changes()).toHaveLength(2);
  });

  it('partly ticked when some rows are: mixed; a click on it ticks them all', () => {
    const t = make({ open: true });
    t.g.kernel.dispatch({ type: 'selection.toggle', row: k('r3') }, 'user');
    expect(t.box('Nord').getAttribute('aria-checked')).toBe('mixed');
    click(t.box('Nord'));
    expect(t.ticked()).toBe('include:r1,r3,r4');
    expect(t.box('Nord').getAttribute('aria-checked')).toBe('true');
    // The data rows' boxes stay the grid's own: hidden from assistive tech, no role (the row says aria-selected).
    const r1 = t.row('r1')!;
    expect([r1.getAttribute('aria-selected'), r1.querySelector('.dzg-box')!.getAttribute('aria-hidden'), r1.querySelector('.dzg-box')!.getAttribute('role')]).toEqual(['true', 'true', null]);
  });

  it('Space on the group row, in any column, does as the click; the group row is never selected itself', () => {
    const t = make();
    t.focusKey(t.group('Nord'), 'qty');
    t.press(' ');
    expect(t.ticked()).toBe('include:r1,r3,r4');
    expect(t.row(t.group('Nord'))!.getAttribute('aria-selected')).toBe(null);
    t.press(' ');
    expect(t.ticked()).toBe('include:');
  });

  it('under « all » (everything except), unticking a group adds its rows to the exceptions', () => {
    const t = make();
    t.g.kernel.dispatch({ type: 'selection.set', selection: { mode: 'exclude', keys: new Set() } }, 'api');
    expect(t.box('Nord').getAttribute('aria-checked')).toBe('true');
    click(t.box('Nord'));
    expect(t.ticked()).toBe('exclude:r1,r3,r4');
    expect(t.box('Nord').getAttribute('aria-checked')).toBe('false');
    expect(t.box('Sud').getAttribute('aria-checked')).toBe('true');
  });

  it('the rows the filters keep only (search « apple »: Nord holds r1 and r3)', () => {
    const t = make();
    t.g.kernel.dispatch({ type: 'quick.set', text: 'apple' }, 'user');
    click(t.box('Nord'));
    expect(t.ticked()).toBe('include:r1,r3');
  });

  it('two levels: a subgroup’s box ticks its rows; its parent is then partly ticked', () => {
    const t = make({ by: ['region', 'fruit'], open: true });
    click(t.box('Nord/apple'));
    expect(t.ticked()).toBe('include:r1,r3');
    expect([t.box('Nord/apple').getAttribute('aria-checked'), t.box('Nord').getAttribute('aria-checked'), t.box('Nord/pear').getAttribute('aria-checked')]).toEqual(['true', 'mixed', 'false']);
    click(t.box('Nord'));
    expect(t.ticked()).toBe('include:r1,r3,r4');
  });
});

describe('bad input', () => {
  it('without grouping(): one missing-feature warning, nothing drawn', () => {
    const t = gmake({ grouping: null, features: [groupSelect()], settings: SEL });
    expect(t.problems()).toEqual([{ code: 'missing-feature', severity: 'warning', path: 'features.groupSelect', detail: 'grouping' }]);
    expect(t.host.querySelector('.dzg-body .dzg-box[role=checkbox]')).toBe(null);
  });
});
