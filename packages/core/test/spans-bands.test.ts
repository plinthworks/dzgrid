import { describe, it, expect } from 'vitest';
import { createColumnModel, type ColumnOrGroup } from '@dzgrid/core';
import { missingFeatureProblems } from '@dzgrid/core/internal';
import { headerBands } from '@dzgrid/core/spans';

/** docs/behaviors/spans.md, grouped headers: per level, the fragments of each group over the visible columns. */

type R = Record<string, unknown>;
const bandsOf = (tree: readonly ColumnOrGroup<R>[], state: Parameters<ReturnType<typeof createColumnModel<R>>['apply']>[0] = []) => {
  const m = createColumnModel<R>(tree);
  m.apply(state, 'api');
  const b = headerBands(tree, m.layout);
  return { ...b, problems: b.problems.map((p) => ({ code: p.code, severity: p.severity, path: p.path, ...(p.detail !== undefined && { detail: p.detail }) })) };
};

describe('header bands', () => {
  it('no group: no band', () => {
    expect(bandsOf([{ id: 'a' }, { id: 'b' }])).toEqual({ depth: 0, levels: [], problems: [] });
  });

  it('one group over its leaves; a column outside it has no cell in the group row', () => {
    expect(bandsOf([{ id: 'patient', header: 'Patient', children: [{ id: 'name' }, { id: 'age' }] }, { id: 'ward' }])).toEqual({
      depth: 1,
      levels: [[{ group: 'patient', first: 0, count: 2, label: 'Patient' }]],
      problems: [],
    });
  });

  it('nested groups: the outer one on top, a shallower column stretched (no cell)', () => {
    const tree: ColumnOrGroup<R>[] = [
      { id: 'p', header: 'Patient', children: [{ id: 'n', header: 'Name', children: [{ id: 'first' }, { id: 'last' }] }, { id: 'age' }] },
      { id: 'ward' },
    ];
    expect(bandsOf(tree)).toEqual({
      depth: 2,
      levels: [[{ group: 'p', first: 0, count: 3, label: 'Patient' }], [{ group: 'n', first: 0, count: 2, label: 'Name' }]],
      problems: [],
    });
  });

  it('a pinned leaf splits its group into fragments, each labelled (O7)', () => {
    const tree: ColumnOrGroup<R>[] = [{ id: 'g', header: 'G', children: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }, { id: 'x', pinned: 'end' }];
    expect(bandsOf(tree, [{ id: 'b', pinned: 'start' }]).levels).toEqual([
      [{ group: 'g', first: 0, count: 1, label: 'G' }, { group: 'g', first: 1, count: 2, label: 'G' }],
    ]);
  });

  it('a column moved between its leaves cuts the group; a hidden leaf only shrinks it', () => {
    const tree: ColumnOrGroup<R>[] = [{ id: 'g', header: 'G', children: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }, { id: 'x' }];
    expect(bandsOf(tree, [{ id: 'x', order: 0.5 }]).levels).toEqual([
      [{ group: 'g', first: 0, count: 1, label: 'G' }, { group: 'g', first: 2, count: 2, label: 'G' }],
    ]);
    expect(bandsOf(tree, [{ id: 'b', hidden: true }]).levels).toEqual([[{ group: 'g', first: 0, count: 2, label: 'G' }]]);
  });

  it('a group whose leaves are all hidden shows nothing, its depth stays', () => {
    const tree: ColumnOrGroup<R>[] = [{ id: 'g', children: [{ id: 'a', hidden: true }] }, { id: 'b' }];
    expect(bandsOf(tree)).toEqual({ depth: 1, levels: [[]], problems: [] });
  });

  it('a group without a header is labelled empty, never guessed', () => {
    expect(bandsOf([{ id: 'g', children: [{ id: 'a' }] }]).levels).toEqual([[{ group: 'g', first: 0, count: 1, label: '' }]]);
  });

  it('an empty group, a duplicate id or a missing one is refused; its leaves stay', () => {
    const tree: ColumnOrGroup<R>[] = [
      { id: 'e', children: [] },
      { id: 'g', header: 'G', children: [{ id: 'a' }, { id: 'g2', children: [{ id: 'inner', children: [] }] }] },
      { id: 'g', header: 'Again', children: [{ id: 'b' }] },
      { id: '', children: [{ id: 'c' }] },
      { id: 'a2', header: 'Clash', children: [{ id: 'a2x' }] },
      { id: 'a2' },
    ];
    const b = bandsOf(tree);
    expect(b.problems).toEqual([
      { code: 'invalid-column-group', severity: 'error', path: 'columns[0]', detail: 'empty' },
      { code: 'invalid-column-group', severity: 'error', path: 'columns[1].children[1]', detail: 'empty' },
      { code: 'invalid-column-group', severity: 'error', path: 'columns[1].children[1].children[0]', detail: 'empty' },
      { code: 'invalid-column-group', severity: 'error', path: 'columns[2]', detail: 'duplicate' },
      { code: 'invalid-column-group', severity: 'error', path: 'columns[3]', detail: 'id' },
      { code: 'invalid-column-group', severity: 'error', path: 'columns[4]', detail: 'duplicate' },
    ]);
    expect(b.levels).toEqual([[{ group: 'g', first: 0, count: 1, label: 'G' }]]);
    expect(b.depth).toBe(1);
  });
});

describe('gaps found by the mutants', () => {
  it('the depth is the deepest group, whatever comes after it', () => {
    const tree: ColumnOrGroup<R>[] = [{ id: 'p', children: [{ id: 'n', children: [{ id: 'a' }] }] }, { id: 'q', children: [{ id: 'b' }] }];
    expect(bandsOf(tree).depth).toBe(2);
  });

  it('a leaf id repeated later keeps the first leaf\'s groups (as the columns keep the first)', () => {
    const tree: ColumnOrGroup<R>[] = [{ id: 'g', header: 'G', children: [{ id: 'a' }] }, { id: 'a' }];
    expect(bandsOf(tree).levels).toEqual([[{ group: 'g', first: 0, count: 1, label: 'G' }]]);
  });
});

describe('span rules without the spans feature', () => {
  it('says each kind once, at its first place', () => {
    const p = missingFeatureProblems<R>(
      [{ id: 'a' }, { id: 'g', children: [{ id: 'b', merge: true }, { id: 'c', rowSpan: () => 1 }] }, { id: 'd', merge: true, colSpan: () => 2 }],
      () => false,
    );
    expect(p).toEqual([
      { code: 'missing-feature', severity: 'warning', path: 'columns', detail: 'groups' },
      { code: 'missing-feature', severity: 'warning', path: 'columns[1].merge', detail: 'spans' },
      { code: 'missing-feature', severity: 'warning', path: 'columns[2].rowSpan', detail: 'spans' },
      { code: 'missing-feature', severity: 'warning', path: 'columns[3].colSpan', detail: 'spans' },
      { code: 'missing-feature', severity: 'warning', path: 'settings.fullWidth', detail: 'spans' },
    ]);
  });

  it('nothing to say without rules', () => {
    expect(missingFeatureProblems<R>([{ id: 'a' }, null as never], undefined)).toEqual([]);
  });
});
