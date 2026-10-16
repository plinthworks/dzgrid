import { describe, it, expect } from 'vitest';
import { readInstant, parseInstant, instantCodec, localeCtx, REJECTED, createColumnModel, resolveColumns, NO_OVERLAY, enumCodec, dataKey, readNumber, PrefixSums, type RowKey } from '@dzgrid/core';
import { createRowStore, sortIndices, ColumnCache, flatDisplayed } from '@dzgrid/core/internal';

/** Findings of the review of Phase 1 steps 1–8, each pinned by a test that failed first. */

describe('wall times with milliseconds', () => {
  it('are read in the zone like whole seconds, with no false clock-change warning', () => {
    const r = readInstant('2026-03-30T12:00:00.500', { assumeZone: 'Europe/Paris' });
    expect(r).toEqual({ ok: true, value: parseInstant('2026-03-30T10:00:00.500Z') });
  });

  it('are accepted when typed', () => {
    const ctx = localeCtx({ locale: 'fr-FR', timeZone: 'Europe/Paris' });
    expect(instantCodec().parse('2026-07-01T10:00:00.250', ctx)).toBe(parseInstant('2026-07-01T08:00:00.250Z'));
  });
});

describe('column definitions', () => {
  it('report the problems of the definitions just given, not the previous ones', () => {
    const m = createColumnModel([{ id: 'a' }]);
    const bad = m.setDefs([{ id: '' } as never]);
    expect(bad.problems.map((p) => p.code)).toEqual(['invalid-column']);
    expect(m.setDefs([{ id: 'a' }]).problems).toEqual([]);
  });

  it('refuse sizes that are not sizes, and never throw', () => {
    const { columns, problems } = resolveColumns([
      { id: 'a', width: Number.NaN },
      { id: 'b', flex: Number.POSITIVE_INFINITY },
      { id: 'c', minWidth: -1 },
      { id: 'd', pinned: 'left' as never },
      { id: 'e', type: 'date' as never },
      { id: 'ok', width: 120 },
    ]);
    expect(columns.map((c) => c.id)).toEqual(['ok']);
    expect(problems.map((p) => [p.code, p.path])).toEqual([
      ['invalid-column', 'columns[0].width'],
      ['invalid-column', 'columns[1].flex'],
      ['invalid-column', 'columns[2].minWidth'],
      ['invalid-column', 'columns[3].pinned'],
      ['invalid-column', 'columns[4].type'],
    ]);
  });

  it('refuse a bad available width or state patch without breaking the layout', () => {
    const m = createColumnModel([{ id: 'a', flex: 1 }], { availableInline: 300 });
    expect(m.setAvailableInline(Number.NaN).problems.map((p) => p.code)).toEqual(['invalid-column']);
    expect(m.layout.totalWidth).toBe(300);
    const r = m.apply([{ id: 'a', order: Number.NaN }, { id: 'a', pinned: 'left' as never }], 'user');
    expect(r.problems.map((p) => [p.code, p.path])).toEqual([['invalid-column', 'state[0].order'], ['invalid-column', 'state[1].pinned']]);
    expect(m.visible().map((c) => c.id)).toEqual(['a']);
  });

  it('move a column to the position its order names', () => {
    const m = createColumnModel(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id })));
    m.apply([{ id: 'f', order: 2 }], 'user');
    expect(m.visible().map((c) => c.id)).toEqual(['a', 'b', 'f', 'c', 'd', 'e']);
  });

  it('keep a column pinned when a patch leaves pinned undefined', () => {
    const m = createColumnModel([{ id: 'p', pinned: 'start' }, { id: 'c' }]);
    m.apply([{ id: 'p', width: 100, pinned: undefined }], 'user');
    expect(m.layout.start.columns.map((c) => c.id)).toEqual(['p']);
  });

  it('share flexible width proportionally when one column hits its minimum and another its maximum', () => {
    const m = createColumnModel([{ id: 'a', flex: 1, maxWidth: 50 }, { id: 'b', flex: 1 }, { id: 'c', flex: 1, minWidth: 120 }], { availableInline: 300 });
    expect(m.layout.center.columns.map((c, i) => [c.id, m.layout.center.widths.sizeAt(i)])).toEqual([['a', 50], ['b', 125], ['c', 125]]);
  });
});

describe('the column cache', () => {
  it('follows the cells an update fixes or breaks', () => {
    type R = { id: string; n: unknown };
    const store = createRowStore<R>((r) => r.id);
    store.replaceAll([{ id: '1', n: 1 }, { id: '2', n: 'abc' }, { id: '3', n: 3 }]);
    const columns = createColumnModel<R>([{ id: 'n', type: 'number' }]);
    const ctx = localeCtx({ locale: 'en-US' });
    const cache = new ColumnCache<R>();
    const env = () => ({ source: store.snapshot, columns, ctx, reader: NO_OVERLAY, cache });
    const envOf = () => ({ columns, ctx, reader: NO_OVERLAY });
    expect(sortIndices([{ column: 'n', dir: 'asc' }], null, env()).problems.map((p) => p.path)).toEqual(['rows[1].n']);
    store.apply({ patch: [{ id: '2', set: { n: 2 } }, { id: '3', set: { n: 'x' } }] });
    cache.patch(store.lastDelta, store.snapshot, envOf);
    expect(sortIndices([{ column: 'n', dir: 'asc' }], null, env()).problems.map((p) => p.path)).toEqual(['rows[2].n']);
  });

  it('treats a cell whose accessor throws as blank, with a problem', () => {
    type R = { id: string };
    const store = createRowStore<R>((r) => r.id);
    store.replaceAll([{ id: '1' }, { id: '2' }]);
    const columns = createColumnModel<R>([{ id: 'v', type: 'number', value: (r) => { if (r.id === '2') throw new Error('secret'); return 1; } }]);
    const env = { source: store.snapshot, columns, ctx: localeCtx({ locale: 'en-US' }), reader: NO_OVERLAY, cache: new ColumnCache<R>() };
    const r = sortIndices([{ column: 'v', dir: 'asc' }], null, env);
    expect([...r.order]).toEqual([0, 1]);
    expect(r.problems.map((p) => [p.code, p.path, p.detail])).toEqual([['invalid-cell-value', 'rows[1].v', 'read threw']]);
  });
});

describe('a full reload with the same rows in the same order', () => {
  it('is an update the cache can patch, not a structural change', () => {
    type R = { id: string; v: number };
    const s = createRowStore<R>((r) => r.id);
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: String(i), v: i }));
    s.replaceAll(rows);
    s.replaceAll(rows.map((r, i) => (i === 7 ? { ...r, v: -1 } : r)));
    expect(s.lastDelta.kind).toBe('update');
    expect([...s.lastDelta.changedSrc!]).toEqual([7]);
  });
});

describe('enum precedence', () => {
  it("lets a value win over another option's alias or label", () => {
    const c = enumCodec([{ value: 'a', aliases: ['b'] }, { value: 'b' }]);
    expect(c.parse('b', localeCtx({ locale: 'en-US' }))).toBe('b');
  });
});

describe('forged keys', () => {
  it('find nothing when the length prefix does not match', () => {
    const s = createRowStore<{ id: string }>((r) => r.id);
    s.replaceAll([{ id: 'abc' }]);
    expect(s.get('d:99:abc' as RowKey)).toBeUndefined();
    expect(flatDisplayed(s.snapshot, null, 1).indexOf('d:99:abc' as RowKey)).toBe(-1);
    expect(s.get(dataKey('abc')!)).toBeDefined();
  });
});

describe('numbers that would read wrongly', () => {
  const en = localeCtx({ locale: 'en-US' });
  it('refuse a group after a leading zero', () => {
    expect(readNumber('0,500', en)).toBeNull();
  });
  it('refuse a non-zero number that underflows to zero', () => {
    expect(readNumber('1e-999', en)).toBeNull();
    expect(readNumber('0e-999', en)).toBe(0);
  });
});

describe('PrefixSums.indexAt', () => {
  it('gives the largest index at offset 0 too, past leading empty entries', () => {
    expect(new PrefixSums([0, 10]).indexAt(0)).toBe(1);
    expect(new PrefixSums([5, 10]).indexAt(0)).toBe(0);
    expect(new PrefixSums([5, 10]).indexAt(-3)).toBe(0);
  });
});

void REJECTED;
