import { describe, it, expect } from 'vitest';
import { createColumnModel } from '@dzgrid/core';

/**
 * Phase 6 step 7 (plan step08-plan.md §1, docs/behaviors/header-groups.md 3, owner Q-GH, O1): the base's fold seam.
 * Columns folded by a closed group are not shown, apart from the user's `hidden`, which the fold never touches.
 */
const ids = (m: { visible(): readonly { id: string }[] }) => m.visible().map((c) => c.id);
const make = () => createColumnModel<Record<string, unknown>>([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd', hidden: true }]);

describe('ColumnModel.fold', () => {
  it('starts with nothing folded', () => {
    expect([...make().folded]).toEqual([]);
  });

  it('hides the folded columns, never touching state() or hidden', () => {
    const m = make();
    const before = m.state();
    m.fold(new Set(['b']));
    expect(ids(m)).toEqual(['a', 'c']);
    expect([...m.folded]).toEqual(['b']);
    expect(m.state()).toEqual(before);
    expect(m.layout.totalWidth).toBe(300);
  });

  it('a column the user shows again stays folded: the group alone decides', () => {
    const m = make();
    m.apply([{ id: 'b', hidden: true }], 'user');
    m.fold(new Set(['b']));
    m.apply([{ id: 'b', hidden: false }], 'user');
    expect(ids(m)).toEqual(['a', 'c']);
  });

  it('a column the user hid stays hidden when its fold is lifted', () => {
    const m = make();
    m.apply([{ id: 'c', hidden: true }], 'user');
    m.fold(new Set(['c']));
    m.fold(new Set());
    expect(ids(m)).toEqual(['a', 'b']);
    // The definition's hidden too.
    expect(ids(m)).not.toContain('d');
  });

  it('refuses a fold that would leave no column shown (O1): nothing changes', () => {
    const m = make();
    m.apply([{ id: 'a', hidden: true }], 'user');
    m.fold(new Set(['c']));
    const v = m.version;
    const dv = m.dataVersion;
    const r = m.fold(new Set(['b', 'c']));
    expect(ids(m)).toEqual(['b']);
    expect([...m.folded]).toEqual(['c']);
    expect(r.layoutChanged).toBe(false);
    expect([m.version, m.dataVersion]).toEqual([v, dv]);
  });

  it('bumps version and dataVersion when the shown columns change; the same fold again changes nothing', () => {
    const m = make();
    const v = m.version;
    const dv = m.dataVersion;
    const r = m.fold(new Set(['a']));
    expect(r.layoutChanged).toBe(true);
    expect(r.problems).toEqual([]);
    expect(m.version).toBe(v + 1);
    expect(m.dataVersion).toBe(dv + 1);
    const again = m.fold(new Set(['a']));
    expect(again).toEqual({ changed: [], layoutChanged: false, problems: [] });
    expect([m.version, m.dataVersion]).toEqual([v + 1, dv + 1]);
  });

  it('folding a column already hidden by the user changes nothing', () => {
    const m = make();
    const v = m.version;
    expect(m.fold(new Set(['d'])).layoutChanged).toBe(false);
    expect(m.version).toBe(v);
  });

  it('new definitions keep the fold by id', () => {
    const m = make();
    m.fold(new Set(['b']));
    m.setDefs([{ id: 'a' }, { id: 'b' }, { id: 'e' }]);
    expect(ids(m)).toEqual(['a', 'e']);
  });
});
