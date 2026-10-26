// The chooser's order logic (Phase 6 step 4, `columns/order.ts`, DOM-free; docs/behaviors/columns-chooser.md 6, 11–13,
// 17–19, O1, O2, O3; step04-plan §3): the list's order (every column, hidden ones too, segment by segment), one place in
// the LIST (a hidden neighbour is a real place) inside a segment and a group (a group is one step for a column outside
// it), locked columns jumped, a drop next to a row, the place said (hidden counted, `chooser: false` left out), the
// reset patch (the menu's), and whether a box may flip (O1). Expectations by hand.
import { describe, it, expect } from 'vitest';
import { createColumnModel, type ColumnDef, type ColumnModel, type ColumnState } from '@dzgrid/core';
import { canHide, fullOrder, listOrder, moveNear, placeInList, resetPatch, stepList } from '../src/columns/order.js';

type Row = Record<string, unknown>;
const col = (id: string, o: Partial<ColumnDef<Row>> & { chooser?: false } = {}): ColumnDef<Row> => ({ id, width: 100, ...o });
const model = (defs: ColumnDef<Row>[], state: ColumnState[] = []): ColumnModel<Row> => {
  const m = createColumnModel<Row>(defs);
  if (state.length) m.apply(state, 'api');
  return m;
};
const apply = (m: ColumnModel<Row>, p: unknown) => (Array.isArray(p) && m.apply(p as ColumnState[], 'user'), m);
const NONE = () => [] as string[];
const shown = (m: ColumnModel<Row>) => m.visible().map((c) => c.id);

describe('listOrder', () => {
  it('every column, hidden ones too, start-pinned first, then the centre, then end-pinned; each by the full order', () => {
    const m = model([col('a'), col('b', { hidden: true }), col('p', { pinned: 'start', hidden: true }), col('c'), col('q', { pinned: 'end' }), col('d')], [{ id: 'd', pinned: 'start' }, { id: 'c', hidden: true, pinned: 'end' }]);
    expect(fullOrder(m)).toEqual(['a', 'b', 'p', 'c', 'q', 'd']);
    // A hidden column's side is its state's pin, else its definition's.
    expect(listOrder(m)).toEqual(['p', 'd', 'a', 'b', 'c', 'q']);
  });
});

describe('stepList (Alt+arrows, ▲ ▼: one place in the list)', () => {
  it('a hidden neighbour is a real place: the column passes it, the grid\'s visible order unchanged', () => {
    const m = model([col('a'), col('b', { hidden: true }), col('c')]);
    apply(m, stepList(m, 'c', -1, NONE));
    expect(fullOrder(m)).toEqual(['a', 'c', 'b']);
    expect(shown(m)).toEqual(['a', 'c']);
    apply(m, stepList(m, 'c', -1, NONE));
    expect(fullOrder(m)).toEqual(['c', 'a', 'b']);
    apply(m, stepList(m, 'b', -1, NONE));
    expect(fullOrder(m)).toEqual(['c', 'b', 'a']);
  });

  it('a hidden column moves too; one patch, only the ranks that changed (the first move stores them all)', () => {
    const m = model([col('a'), col('b', { hidden: true }), col('c')]);
    expect(stepList(m, 'b', 1, NONE)).toEqual([{ id: 'a', order: 0 }, { id: 'c', order: 1 }, { id: 'b', order: 2 }]);
    apply(m, stepList(m, 'b', 1, NONE));
    expect(stepList(m, 'b', -1, NONE)).toEqual([{ id: 'b', order: 1 }, { id: 'c', order: 2 }]);
  });

  it('never across a pinned edge (O2): `edge` at a segment\'s ends, hidden pinned columns in their segment', () => {
    const m = model([col('p', { pinned: 'start' }), col('h', { pinned: 'start', hidden: true }), col('a'), col('b'), col('q', { pinned: 'end' })]);
    expect(stepList(m, 'a', -1, NONE)).toBe('edge');
    expect(stepList(m, 'b', 1, NONE)).toBe('edge');
    expect(stepList(m, 'h', 1, NONE)).toBe('edge');
    expect(stepList(m, 'p', -1, NONE)).toBe('edge');
    expect(stepList(m, 'q', 1, NONE)).toBe('edge');
    expect(stepList(m, 'q', -1, NONE)).toBe('edge');
    // Inside the start segment the hidden one is a place; its pin is not written again (it does not change).
    expect(stepList(m, 'p', 1, NONE)).toEqual([{ id: 'h', order: 0 }, { id: 'p', order: 1 }, { id: 'a', order: 2 }, { id: 'b', order: 3 }, { id: 'q', order: 4 }]);
  });

  it('a locked column (`movable: false`) says `locked` and keeps its slot when another jumps over it (O3, M12)', () => {
    const m = model([col('a'), col('L', { movable: false }), col('b')]);
    expect(stepList(m, 'L', 1, NONE)).toBe('locked');
    expect(stepList(m, 'L', -1, NONE)).toBe('locked');
    apply(m, stepList(m, 'b', -1, NONE));
    expect(fullOrder(m)).toEqual(['b', 'L', 'a']);
    // Only locked columns before it: the edge.
    const n = model([col('L', { movable: false }), col('a')]);
    expect(stepList(n, 'a', -1, NONE)).toBe('edge');
  });

  it('inside a group only (choice 3): its ends say `edge`; a column outside passes a whole group in one step', () => {
    const path = (id: string) => (id.startsWith('g') ? ['G'] : []);
    const m = model([col('a'), col('g1'), col('g2'), col('g3'), col('d')]);
    expect(stepList(m, 'g1', -1, path)).toBe('edge');
    expect(stepList(m, 'g3', 1, path)).toBe('edge');
    apply(m, stepList(m, 'g2', -1, path));
    expect(fullOrder(m)).toEqual(['a', 'g2', 'g1', 'g3', 'd']);
    apply(m, stepList(m, 'd', -1, path));
    expect(fullOrder(m)).toEqual(['a', 'd', 'g2', 'g1', 'g3']);
    apply(m, stepList(m, 'a', 1, path));
    expect(fullOrder(m)).toEqual(['d', 'a', 'g2', 'g1', 'g3']);
    apply(m, stepList(m, 'a', 1, path));
    expect(fullOrder(m)).toEqual(['d', 'g2', 'g1', 'g3', 'a']);
  });

  it('nested groups: a sub-group is one step inside its parent', () => {
    const path = (id: string) => ({ x: ['P'], s1: ['P', 'S'], s2: ['P', 'S'], y: ['P'] } as Record<string, string[]>)[id] ?? [];
    const m = model([col('x'), col('s1'), col('s2'), col('y'), col('z')]);
    apply(m, stepList(m, 'y', -1, path));
    expect(fullOrder(m)).toEqual(['x', 'y', 's1', 's2', 'z']);
    expect(stepList(m, 'x', -1, path)).toBe('edge');
    apply(m, stepList(m, 'z', -1, path));
    expect(fullOrder(m)).toEqual(['z', 'x', 'y', 's1', 's2']);
  });

  it('`chooser: false` columns are not places (not listed); an unknown column: null', () => {
    const m = model([col('a'), col('x', { chooser: false }), col('b')]);
    apply(m, stepList(m, 'b', -1, NONE));
    expect(fullOrder(m)).toEqual(['b', 'a', 'x']);
    expect(stepList(m, 'nope', 1, NONE)).toBeNull();
  });
});

describe('moveNear (a drop next to a row)', () => {
  it('before or after another column, locked slots kept; null when nothing changes', () => {
    const m = model([col('a'), col('b', { hidden: true }), col('c'), col('d')]);
    apply(m, moveNear(m, 'd', 'b', false));
    expect(fullOrder(m)).toEqual(['a', 'd', 'b', 'c']);
    apply(m, moveNear(m, 'a', 'c', true));
    expect(fullOrder(m)).toEqual(['d', 'b', 'c', 'a']);
    expect(moveNear(m, 'b', 'c', false)).toBeNull();
    expect(moveNear(m, 'b', 'd', true)).toBeNull();
  });
});

describe('placeInList (the sentence\'s place)', () => {
  it('1-based among every listed column, hidden ones included; `chooser: false` left out of both numbers', () => {
    const m = model([col('a'), col('x', { chooser: false }), col('b', { hidden: true }), col('c'), col('p', { pinned: 'start' })]);
    expect(placeInList(m, 'c')).toEqual({ n: 4, total: 4 });
    expect(placeInList(m, 'p')).toEqual({ n: 1, total: 4 });
    expect(placeInList(m, 'b')).toEqual({ n: 3, total: 4 });
  });
});

describe('resetPatch (the menu\'s reset, column-menu.md 15)', () => {
  it('null when nothing differs from the definitions (a stored rank equal to its place, a pin equal to the definition\'s)', () => {
    const m = model([col('a'), col('b', { hidden: true }), col('c', { pinned: 'end' })]);
    expect(resetPatch(m)).toBeNull();
    apply(m, [{ id: 'a', order: 0 }, { id: 'c', pinned: 'end' }, { id: 'b', hidden: true }]);
    expect(resetPatch(m)).toBeNull();
  });

  it('else every column back: its place, no width of its own, its definition\'s hidden and pin', () => {
    const all = [
      { id: 'a', order: 0, width: null, hidden: false, pinned: null },
      { id: 'b', order: 1, width: null, hidden: true, pinned: null },
      { id: 'c', order: 2, width: null, hidden: false, pinned: 'end' },
    ];
    const defs = () => [col('a'), col('b', { hidden: true }), col('c', { pinned: 'end' })];
    for (const s of [[{ id: 'a', hidden: true }], [{ id: 'b', width: 140 }], [{ id: 'c', pinned: null }], [{ id: 'c', order: 0 }], [{ id: 'b', hidden: false }], [{ id: 'a', pinned: 'start' }]] as ColumnState[][]) {
      expect(resetPatch(model(defs(), s)), JSON.stringify(s)).toEqual(all);
    }
  });
});

describe('canHide (may the box flip: O1, hideable: false)', () => {
  it('a hidden column may always be shown; a shown one hides unless it is the last shown or `hideable: false`', () => {
    const m = model([col('a'), col('b'), col('k', { hideable: false, hidden: true })]);
    expect(canHide(m, 'a')).toBe(true);
    expect(canHide(m, 'k')).toBe(true);
    apply(m, [{ id: 'a', hidden: true }]);
    expect(canHide(m, 'b')).toBe(false);
    expect(canHide(m, 'a')).toBe(true);
    apply(m, [{ id: 'k', hidden: false }]);
    expect(canHide(m, 'b')).toBe(true);
    expect(canHide(m, 'k')).toBe(false);
  });
});
