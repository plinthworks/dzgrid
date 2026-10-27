import { describe, it, expect } from 'vitest';
import { createColumnModel, type ColumnOrGroup } from '@dzgrid/core';
import { diffState, foldedColumns, groupTable, headerBands } from '@dzgrid/core/spans';

/**
 * Phase 6 step 7 (docs/behaviors/header-groups.md 1–6; plan step08-plan.md §1): the collapsible groups' table, the
 * columns a state folds, the differences a GridState keeps. Expectations written by hand.
 */
type R = Record<string, unknown>;
const shape = (t: ReturnType<typeof groupTable>) => ({
  groups: Object.fromEntries([...t.groups].map(([id, g]) => [id, { open: g.open, leaves: g.leaves, shownOpen: g.shownOpen, shownClosed: g.shownClosed }])),
  problems: t.problems.map((p) => ({ code: p.code, severity: p.severity, path: p.path, detail: p.detail })),
});
const sorted = (s: ReadonlySet<string>) => [...s].sort();

/** Patient (collapsible, open) over nom, prenom (open only), age (open only), resume (closed only); ward outside. */
const PATIENT: ColumnOrGroup<R>[] = [
  { id: 'patient', header: 'Patient', collapsible: true, children: [{ id: 'nom' }, { id: 'prenom', groupShow: 'open' }, { id: 'age', groupShow: 'open' }, { id: 'resume', groupShow: 'closed' }] },
  { id: 'ward' },
];

describe('groupTable', () => {
  it('lists the collapsible groups: their state, leaves and what each state shows', () => {
    expect(shape(groupTable(PATIENT))).toEqual({
      groups: { patient: { open: true, leaves: ['nom', 'prenom', 'age', 'resume'], shownOpen: ['nom', 'prenom', 'age'], shownClosed: ['nom', 'resume'] } },
      problems: [],
    });
  });

  it('open: false starts closed', () => {
    const t = groupTable<R>([{ id: 'g', collapsible: true, open: false, children: [{ id: 'a' }, { id: 'b', groupShow: 'open' }] }]);
    expect(t.groups.get('g')!.open).toBe(false);
  });

  it('a group that is not collapsible is not listed; groupShow under it is ignored (no problem)', () => {
    const t = groupTable<R>([{ id: 'g', header: 'G', children: [{ id: 'a', groupShow: 'open' }, { id: 'b', groupShow: 'closed' }] }]);
    expect(shape(t)).toEqual({ groups: {}, problems: [] });
    expect(sorted(foldedColumns(t, new Map([['g', false]])))).toEqual([]);
  });

  it('nested groups: each with all its leaves, at any depth; a non-collapsible group between is not listed', () => {
    const tree: ColumnOrGroup<R>[] = [
      { id: 'clin', collapsible: true, children: [{ id: 'vit', children: [{ id: 'ta', groupShow: 'open' }, { id: 'pouls' }] }, { id: 'note', groupShow: 'closed' }] },
    ];
    const t = shape(groupTable(tree));
    expect(t.groups).toEqual({ clin: { open: true, leaves: ['ta', 'pouls', 'note'], shownOpen: ['ta', 'pouls'], shownClosed: ['pouls', 'note'] } });
    const inner: ColumnOrGroup<R>[] = [{ id: 'o', collapsible: true, children: [{ id: 'i', collapsible: true, open: false, children: [{ id: 'x' }, { id: 'y', groupShow: 'open' }] }, { id: 'z', groupShow: 'open' }] }];
    const u = groupTable(inner);
    expect(u.groups.get('i')!.leaves).toEqual(['x', 'y']);
    expect(u.groups.get('o')!.leaves).toEqual(['x', 'y', 'z']);
  });

  it('a group that would show nothing closed keeps its first child, one warning empty-closed at its children (rule 2)', () => {
    const tree: ColumnOrGroup<R>[] = [{ id: 'w' }, { id: 'g', collapsible: true, children: [{ id: 'a', groupShow: 'open' }, { id: 'b', groupShow: 'open' }] }];
    expect(shape(groupTable(tree))).toEqual({
      groups: { g: { open: true, leaves: ['a', 'b'], shownOpen: ['a', 'b'], shownClosed: ['a'] } },
      problems: [{ code: 'invalid-column-group', severity: 'warning', path: 'columns[1].children', detail: 'empty-closed' }],
    });
  });

  it('refused groups (no leaf, no id, a duplicate) are not listed, and not told here (headerBands tells them)', () => {
    const tree: ColumnOrGroup<R>[] = [
      { id: 'e', collapsible: true, children: [] },
      { id: '', collapsible: true, children: [{ id: 'a' }] } as never,
      { id: 'a2', collapsible: true, children: [{ id: 'b' }] },
      { id: 'a2', collapsible: true, children: [{ id: 'c' }] },
      { id: 'b', collapsible: true, children: [{ id: 'd' }] },
    ];
    const t = groupTable(tree);
    expect([...t.groups.keys()]).toEqual(['a2']);
    expect(t.problems).toEqual([]);
    expect(headerBands(tree, createColumnModel<R>(tree).layout).problems.map((p) => p.detail)).toEqual(['empty', 'id', 'duplicate', 'duplicate']);
  });
});

describe('foldedColumns', () => {
  const t = groupTable(PATIENT);
  it('open (the definition): the closed-only columns are folded', () => {
    expect(sorted(foldedColumns(t, new Map()))).toEqual(['resume']);
  });
  it('closed: the open-only columns are folded, the closed-only ones come', () => {
    expect(sorted(foldedColumns(t, new Map([['patient', false]])))).toEqual(['age', 'prenom']);
  });
  it('an id the table does not have changes nothing', () => {
    expect(sorted(foldedColumns(t, new Map([['ward', false], ['gone', false]])))).toEqual(['resume']);
  });
  it('nested: a column shows only when every collapsible group above it shows it', () => {
    const tree: ColumnOrGroup<R>[] = [{ id: 'o', collapsible: true, children: [{ id: 'i', collapsible: true, children: [{ id: 'x' }, { id: 'y', groupShow: 'open' }, { id: 'q', groupShow: 'closed' }] }, { id: 'z', groupShow: 'open' }] }];
    const u = groupTable(tree);
    expect(sorted(foldedColumns(u, new Map()))).toEqual(['q']);
    // The inner group closed alone: y goes; q stays folded, its outer group being open.
    expect(sorted(foldedColumns(u, new Map([['i', false]])))).toEqual(['q', 'y']);
    // The outer closed alone: the open-only columns under it go, at any depth.
    expect(sorted(foldedColumns(u, new Map([['o', false]])))).toEqual(['q', 'y', 'z']);
    // Both closed: q comes.
    expect(sorted(foldedColumns(u, new Map([['o', false], ['i', false]])))).toEqual(['y', 'z']);
  });
  it('the empty-closed fallback: the first child stays when closed', () => {
    const u = groupTable<R>([{ id: 'g', collapsible: true, children: [{ id: 'a', groupShow: 'open' }, { id: 'b', groupShow: 'open' }] }]);
    expect(sorted(foldedColumns(u, new Map([['g', false]])))).toEqual(['b']);
  });
  it('a group split by a pin keeps one state for its pieces', () => {
    const m = createColumnModel<R>(PATIENT);
    m.apply([{ id: 'prenom', pinned: 'start' }], 'user');
    m.fold(foldedColumns(t, new Map([['patient', false]])));
    expect(m.visible().map((c) => c.id)).toEqual(['nom', 'resume', 'ward']);
    m.fold(foldedColumns(t, new Map([['patient', true]])));
    expect(m.visible().map((c) => c.id)).toEqual(['prenom', 'nom', 'age', 'ward']);
  });
});

describe('diffState', () => {
  const tree: ColumnOrGroup<R>[] = [
    { id: 'a', collapsible: true, children: [{ id: 'x' }] },
    { id: 'b', collapsible: true, open: false, children: [{ id: 'y' }] },
    { id: 'c', children: [{ id: 'z' }] },
  ];
  const t = groupTable(tree);
  it('only the groups whose state differs from their definition', () => {
    expect(diffState(t, new Map())).toEqual({});
    expect(diffState(t, new Map([['a', true], ['b', false]]))).toEqual({});
    expect(diffState(t, new Map([['a', false], ['b', true]]))).toEqual({ a: false, b: true });
  });
  it('never an id that is not a collapsible group', () => {
    expect(diffState(t, new Map([['c', false], ['gone', true]]))).toEqual({});
  });
});

// Review of steps 7–8b-1: the surviving mutants of `foldedColumns` pinned (header-groups.md 3, 4). Expectations by hand.
describe('foldedColumns: the survivors of the review', () => {
  it('an open group whose children are all groupShow: \'closed\' folds every one of them', () => {
    const u = groupTable<R>([{ id: 'g', collapsible: true, children: [{ id: 'a', groupShow: 'closed' }, { id: 'b', groupShow: 'closed' }] }, { id: 'w' }]);
    expect(sorted(foldedColumns(u, new Map()))).toEqual(['a', 'b']);
    expect(sorted(foldedColumns(u, new Map([['g', true]])))).toEqual(['a', 'b']);
  });
  it('an untouched open: false group, with an empty state map, folds by its definition (closed)', () => {
    const u = groupTable<R>([{ id: 'g', collapsible: true, open: false, children: [{ id: 'a', groupShow: 'open' }, { id: 'b' }] }]);
    expect(sorted(foldedColumns(u, new Map()))).toEqual(['a']);
  });
});
