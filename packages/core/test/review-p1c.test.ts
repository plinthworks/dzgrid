import { describe, it, expect } from 'vitest';
import {
  clientRows, createColumnModel, localeCtx, makeQuery, fold, scrollMapper, variableRowLayout, resolveWall, readNumber,
  normalizeDigits, NO_OVERLAY, instantCodec, dataKey,
} from '@dzgrid/core';
import { foldSlow, ColumnCache, createRowStore, compileQuick, filterIndices } from '@dzgrid/core/internal';

/** Findings of the Phase 1 end-of-phase code review, each pinned by a test that failed first. */

type Row = { id: string; v: number; t?: string };

describe('new columns', () => {
  it('re-sort and notify even when the new column model has the same version number', () => {
    const m = clientRows<Row>({ rows: [{ id: 'a', v: 2 }, { id: 'b', v: 1 }], getRowId: (r) => r.id, columns: createColumnModel<Row>([{ id: 'v', type: 'number' }]), ctx: localeCtx({ locale: 'en-US' }) });
    m.setQuery(makeQuery({ sort: [{ column: 'v', dir: 'asc' }] }));
    let notified = 0;
    m.subscribe(() => notified++);
    m.setColumns(createColumnModel<Row>([{ id: 'v', type: 'number', value: (r) => -r.v }]));
    expect((m.displayed.nodeAt(m.displayed.index(0)!) as { id: unknown }).id).toBe('a');
    expect(notified).toBe(1);
  });
});

describe('a cache patched across contexts', () => {
  it('agrees with a cache built fresh', () => {
    type R = { id: string; n: number };
    const store = createRowStore<R>((r) => r.id);
    store.replaceAll([{ id: '1', n: 1234.5 }, { id: '2', n: 7 }]);
    const columns = createColumnModel<R>([{ id: 'n', type: 'number' }]);
    const fr = localeCtx({ locale: 'fr-FR' });
    const en = localeCtx({ locale: 'en-US' });
    const cache = new ColumnCache<R>();
    const col = columns.get('n')!;
    const env = (ctx: typeof fr) => ({ source: store.snapshot, columns, ctx, reader: NO_OVERLAY, cache });
    cache.haystack('display', col, env(fr));
    store.apply({ patch: [{ id: '2', set: { n: 9876.5 } }] });
    cache.patch(store.lastDelta, store.snapshot, () => ({ columns, ctx: en, reader: NO_OVERLAY }));
    const fresh = new ColumnCache<R>();
    const cells = (h: ReturnType<typeof cache.haystack>) => [h.cell(0), h.cell(1)];
    expect(cells(cache.haystack('display', col, env(fr)))).toEqual(cells(fresh.haystack('display', col, { ...env(fr), cache: fresh })));
  });

  it('keeps cell problems equal to a fresh build after an update', () => {
    type R = { id: string; t: string };
    const store = createRowStore<R>((r) => r.id);
    store.replaceAll([{ id: '1', t: '2026-03-29T02:30' }, { id: '2', t: '2026-03-05T10:00' }]);
    const columns = createColumnModel<R>([{ id: 't', type: 'instant', assumeZone: 'Europe/Paris' }]);
    const ctx = localeCtx({ locale: 'fr-FR' });
    const cache = new ColumnCache<R>();
    const col = columns.get('t')!;
    cache.keys(col, { source: store.snapshot, columns, ctx, reader: NO_OVERLAY, cache });
    store.apply({ patch: [{ id: '1', set: { t: '2026-03-29T02:45' } }, { id: '2', set: { t: '2026-10-25T02:30' } }] });
    cache.patch(store.lastDelta, store.snapshot, () => ({ columns, ctx, reader: NO_OVERLAY }));
    const patched = cache.keys(col, { source: store.snapshot, columns, ctx, reader: NO_OVERLAY, cache }).problems;
    const fresh = new ColumnCache<R>();
    expect(patched).toEqual(fresh.keys(col, { source: store.snapshot, columns, ctx, reader: NO_OVERLAY, cache: fresh }).problems);
  });

  it('reports the cell problems of an update through the model', () => {
    const m = clientRows<{ id: string; v: unknown }>({ rows: [{ id: 'a', v: 1 }, { id: 'b', v: 2 }], getRowId: (r) => r.id, columns: createColumnModel([{ id: 'v', type: 'number' }]), ctx: localeCtx({ locale: 'en-US' }) });
    m.setQuery(makeQuery({ sort: [{ column: 'v', dir: 'asc' }] }));
    m.applyTransaction({ patch: [{ id: 'b', set: { v: 'oops' } }] });
    expect(m.problems.map((p) => [p.code, p.path])).toContainEqual(['invalid-cell-value', 'rows[1].v']);
  });
});

describe('fold and its definition', () => {
  it('agree on Greek final sigma, decomposed Hangul and Devanagari', () => {
    for (const s of ['ΟΔΟΣ', 'οδός', 'ΑΣ', '한', 'ऩ', 'Ἀθῆναι', 'й', 'Ёлка']) {
      expect(fold(s), s).toBe(foldSlow(s));
    }
  });
});

describe('digits of other scripts', () => {
  it('are read as digits, and searched as such', () => {
    expect(normalizeDigits('১২৩ ०१२ ๓')).toBe('123 012 3');
    expect(readNumber('১২৩', localeCtx({ locale: 'bn-BD' }))).toBe(123);
    type R = { id: string; n: number };
    const store = createRowStore<R>((r) => r.id);
    store.replaceAll([{ id: '1', n: 123 }, { id: '2', n: 9 }]);
    const columns = createColumnModel<R>([{ id: 'n', type: 'number' }]);
    const env = { source: store.snapshot, columns, ctx: localeCtx({ locale: 'bn-BD', numerals: 'locale' }), reader: NO_OVERLAY, cache: new ColumnCache<R>() };
    const order = filterIndices(2, [compileQuick('১২৩', columns.visible(), env)]);
    expect(order ? [...order] : null).toEqual([0]);
  });
});

describe('edge inputs', () => {
  it('map the top of a list to its top when the view is taller than the cap', () => {
    const m = scrollMapper(5e6, 4e6, 4.5e6);
    expect(m.toLogical(0)).toBe(0);
    expect(m.maxLogical).toBeGreaterThanOrEqual(0);
    expect(scrollMapper(100, 4e6, 600).toLogical(50)).toBe(0);
  });

  it('refuse heights that do not match the rows', () => {
    const rows = (count: number) => ({ count, index: (n: number) => (n >= 0 && n < count ? (n as never) : null) });
    expect(() => variableRowLayout(rows(3), 0, [10, 10])).toThrow(RangeError);
    expect(() => variableRowLayout(rows(2), 0, [10, 10, 10, 10])).toThrow(RangeError);
  });

  it('resolve no wall time from a number that is not one', () => {
    expect(resolveWall(Number.NaN, 'UTC')).toEqual({ ok: false, code: 'invalid-instant' });
    expect(resolveWall(9e15, 'UTC')).toEqual({ ok: false, code: 'invalid-instant' });
  });
});

void instantCodec;
void dataKey;
