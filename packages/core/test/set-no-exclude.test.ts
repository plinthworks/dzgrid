// A set filter that never writes `exclude` (`filter: { kind: 'set', exclude: false }`; docs/behaviors/filter-set.md
// « Include only », decisions « Set filter include only (owner, 2026-10-29) »): an `exclude` or a `blanks` arriving
// from elsewhere on such a column is ignored with invalid-filter, stored, and applies again once the option goes.
// Expectations by hand.
import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, localeCtx, makeQuery, type ColumnDef, type FilterModel, type Problem } from '@dzgrid/core';
import { restoreState } from '@dzgrid/core/state';

type Row = { id: string; c: string | null };
/** a: A, b: B, c: C, d: blank. */
const ROWS: Row[] = [{ id: 'a', c: 'A' }, { id: 'b', c: 'B' }, { id: 'c', c: 'C' }, { id: 'd', c: null }];
const ONLY: ColumnDef<Row>[] = [{ id: 'c', filter: { kind: 'set', exclude: false } }];
const PLAIN: ColumnDef<Row>[] = [{ id: 'c', filter: { kind: 'set' } }];
const ALL = ['a', 'b', 'c', 'd'];

function model(defs: ColumnDef<Row>[]) {
  const columns = createColumnModel<Row>(defs);
  const m = clientRows<Row>({ rows: ROWS, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'fr-FR' }) });
  const ids = () => Array.from({ length: m.displayed.count }, (_, i) => String((m.displayed.nodeAt(m.displayed.index(i)!) as { id: unknown }).id));
  const run = (filter: unknown) => {
    m.setQuery(makeQuery({ filter: filter as FilterModel }));
    return { ids: ids(), problems: m.problems.map((p) => [p.code, p.path, p.detail]) };
  };
  return { m, ids, run };
}

function kernel(defs: ColumnDef<Row>[] = ONLY) {
  const columns = createColumnModel<Row>(defs);
  const m = clientRows<Row>({ rows: ROWS, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'fr-FR' }) });
  const k = createKernel<Row>({ rows: m, columns });
  const told: Problem[] = [];
  k.subscribe((e) => void (e.type === 'problems' && told.push(...e.problems)));
  const ids = () => Array.from({ length: m.displayed.count }, (_, i) => String((m.displayed.nodeAt(m.displayed.index(i)!) as { id: unknown }).id));
  return { k, m, told, ids };
}

const X = 'exclude: false';

describe('compiling a set filter on an include-only column', () => {
  it('an exclude: invalid-filter at filter.c.exclude, ignored (every row)', () => {
    expect(model(ONLY).run({ c: { type: 'set', exclude: ['A'] } })).toEqual({ ids: ALL, problems: [['invalid-filter', 'filter.c.exclude', X]] });
  });

  it('an exclude of nothing too', () => {
    expect(model(ONLY).run({ c: { type: 'set', exclude: [] } })).toEqual({ ids: ALL, problems: [['invalid-filter', 'filter.c.exclude', X]] });
  });

  it('blanks, either way, with an include: invalid-filter at filter.c.blanks', () => {
    expect(model(ONLY).run({ c: { type: 'set', include: ['A'], blanks: 'include' } })).toEqual({ ids: ALL, problems: [['invalid-filter', 'filter.c.blanks', X]] });
    expect(model(ONLY).run({ c: { type: 'set', include: ['A'], blanks: 'exclude' } })).toEqual({ ids: ALL, problems: [['invalid-filter', 'filter.c.blanks', X]] });
  });

  it('blanks alone (no list): refused too', () => {
    expect(model(ONLY).run({ c: { type: 'set', blanks: 'include' } })).toEqual({ ids: ALL, problems: [['invalid-filter', 'filter.c.blanks', X]] });
  });

  it('exclude and blanks: one problem, at exclude', () => {
    expect(model(ONLY).run({ c: { type: 'set', exclude: ['A'], blanks: 'exclude' } })).toEqual({ ids: ALL, problems: [['invalid-filter', 'filter.c.exclude', X]] });
  });

  it('the shape checks come first, with their own paths and no detail', () => {
    expect(model(ONLY).run({ c: { type: 'set', include: ['A'], exclude: ['B'] } })).toEqual({ ids: ALL, problems: [['invalid-filter', 'filter.c', undefined]] });
    expect(model(ONLY).run({ c: { type: 'set', exclude: [1] } })).toEqual({ ids: ALL, problems: [['invalid-filter', 'filter.c', undefined]] });
    expect(model(ONLY).run({ c: { type: 'set', exclude: ['A'], blanks: 'maybe' } })).toEqual({ ids: ALL, problems: [['invalid-filter', 'filter.c.blanks', undefined]] });
  });

  it('an include without blanks applies as always', () => {
    expect(model(ONLY).run({ c: { type: 'set', include: ['A', 'C'] } })).toEqual({ ids: ['a', 'c'], problems: [] });
    expect(model(ONLY).run({ c: { type: 'set', include: [] } })).toEqual({ ids: [], problems: [] });
  });

  it('without the option, exclude and blanks apply as always (no problem)', () => {
    expect(model(PLAIN).run({ c: { type: 'set', exclude: ['A'] } })).toEqual({ ids: ['b', 'c', 'd'], problems: [] });
    expect(model(PLAIN).run({ c: { type: 'set', include: ['A'], blanks: 'include' } })).toEqual({ ids: ['a', 'd'], problems: [] });
    expect(model([{ id: 'c', filter: { kind: 'set', exclude: undefined } }]).run({ c: { type: 'set', exclude: ['A'] } })).toEqual({ ids: ['b', 'c', 'd'], problems: [] });
  });

  it('inside a combined filter: the whole combined filter dropped, the path inside its conditions', () => {
    const f = { c: { type: 'combined', join: 'or', conditions: [{ type: 'set', include: ['A'] }, { type: 'set', exclude: ['B'] }] } };
    expect(model(ONLY).run(f)).toEqual({ ids: ALL, problems: [['invalid-filter', 'filter.c.conditions[1].exclude', X]] });
  });
});

describe('the kernel', () => {
  it('filter.column with an exclude: accepted and stored, said as a problem, every row shown', () => {
    const s = kernel();
    const res = s.k.dispatch({ type: 'filter.column', column: 'c', filter: { type: 'set', exclude: ['A'] } }, 'api');
    expect(res.ok).toBe(true);
    expect(s.k.query.filter).toEqual({ c: { type: 'set', exclude: ['A'] } });
    expect(s.told.map((p) => [p.code, p.path, p.detail])).toEqual([['invalid-filter', 'filter.c.exclude', X]]);
    expect(s.ids()).toEqual(ALL);
  });

  it('columns.set adding the option ignores a stored exclude; removing it applies it again', () => {
    const s = kernel(PLAIN);
    s.k.dispatch({ type: 'filter.column', column: 'c', filter: { type: 'set', exclude: ['A'] } }, 'api');
    expect(s.ids()).toEqual(['b', 'c', 'd']);
    s.k.dispatch({ type: 'columns.set', defs: ONLY }, 'api');
    expect(s.ids()).toEqual(ALL);
    // Held in the model's problems (a column change re-runs the filter but tells no problems event: true of any filter it refuses).
    expect(s.m.problems.map((p) => [p.code, p.path, p.detail])).toEqual([['invalid-filter', 'filter.c.exclude', X]]);
    expect(s.k.query.filter).toEqual({ c: { type: 'set', exclude: ['A'] } });
    s.k.dispatch({ type: 'columns.set', defs: PLAIN }, 'api');
    expect(s.ids()).toEqual(['b', 'c', 'd']);
    expect(s.m.problems).toEqual([]);
  });

  it('a restored GridState with an exclude: stored, ignored with the problem', () => {
    const s = kernel();
    restoreState(s.k, { v: 1, filter: { c: { type: 'set', exclude: ['A'], blanks: 'exclude' } } });
    expect(s.k.query.filter).toEqual({ c: { type: 'set', exclude: ['A'], blanks: 'exclude' } });
    expect(s.ids()).toEqual(ALL);
    expect(s.told.map((p) => [p.code, p.path])).toContainEqual(['invalid-filter', 'filter.c.exclude']);
  });
});
