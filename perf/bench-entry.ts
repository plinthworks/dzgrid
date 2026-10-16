import { assignKeys, parseDay, readInstant, zoneDayBounds, epochDayToDay, dayToEpochDay, localeCtx, readNumber, formattersFor, instantCodec, createRowStore, createColumnModel, NO_OVERLAY, sortIndices, compileFilter, filterIndices, compileQuick, fold, clientRows, makeQuery, PrefixSums, variableRowLayout, scrollMapper, visibleWindow, MAX_PHYSICAL, type SortItem, type FilterModel } from '../packages/core/src/index.js';
import { ColumnCache } from '../packages/core/src/internal.js';
import { datasetA, type RowA } from './dataset.js';

/** A timed case: a function, or an untimed `setup` whose result is passed to `run`. */
export type Case = (() => unknown) | { readonly setup?: () => unknown; readonly run: (ctx: any) => unknown };

/** Each case returns a value so the work cannot be optimised away. */
export const CASES: Record<string, Case> = {
  'zoneDayBounds x 10 000 (Paris, cached formatter)': () => {
    let acc = 0;
    const start = dayToEpochDay(parseDay('2000-01-01')!);
    for (let i = 0; i < 10_000; i++) acc += zoneDayBounds(epochDayToDay(start + i)!, 'Europe/Paris').from;
    return acc;
  },
  'assignKeys 100 000 ids': () => assignKeys(Array.from({ length: 100_000 }, (_, i) => `row-${i}`)).keys.length,
  'parseDay x 100 000': () => {
    let n = 0;
    for (let i = 0; i < 100_000; i++) if (parseDay(`20${String(i % 100).padStart(2, '0')}-0${1 + (i % 9)}-1${i % 10}`)) n++;
    return n;
  },
  'readInstant ISO x 100 000': () => {
    let n = 0;
    for (let i = 0; i < 100_000; i++) if (readInstant(`2026-03-05T10:${String(i % 60).padStart(2, '0')}:00.${String(i % 1000).padStart(3, '0')}Z`).ok) n++;
    return n;
  },
  'readNumber x 100 000 (fr-FR)': () => {
    const ctx = localeCtx({ locale: 'fr-FR' });
    let acc = 0;
    for (let i = 0; i < 100_000; i++) acc += readNumber(`${i % 1000}\u202f${String(i % 1000).padStart(3, '0')},${i % 100}`, ctx) ?? 0;
    return acc;
  },
  'format number x 100 000 (cached Intl, ar-DZ)': () => {
    const f = formattersFor(localeCtx({ locale: 'ar-DZ' })).number();
    let len = 0;
    for (let i = 0; i < 100_000; i++) len += f(i * 1.25).length;
    return len;
  },
  'coerce ISO instants x 100 000': () => {
    const codec = instantCodec();
    const ctx = localeCtx({ locale: 'fr-FR' });
    let acc = 0;
    for (let i = 0; i < 100_000; i++) acc += codec.coerce(`2026-03-05T10:${String(i % 60).padStart(2, '0')}:00Z`, ctx) ?? 0;
    return acc;
  },
  'load 100 000 x 30 (row store)': {
    setup: () => datasetA(),
    run: (rows: RowA[]) => createRowStore<RowA>((r) => r.id).replaceAll(rows).version,
  },
  'update 1 row of 100 000': {
    setup: () => {
      const s = createRowStore<RowA>((r) => r.id);
      s.replaceAll(datasetA());
      return s;
    },
    run: (s: ReturnType<typeof createRowStore<RowA>>) => s.apply({ patch: [{ id: 'r500', set: { n0: 1 } }] }).version,
  },
  ...sortCases(),
  ...filterCases(),
  ...quickCases(),
  ...modelCases(),
  ...layoutCases(),
};

function layoutCases(): Record<string, Case> {
  const sizes = Float64Array.from({ length: 100_000 }, (_, i) => 24 + (i % 7) * 9);
  const rows = { count: 100_000, index: (n: number) => (n as never) };
  return {
    'PrefixSums build 100 000': () => new PrefixSums(sizes).total,
    'PrefixSums 1 000 set + 1 000 indexAt (100 000 rows)': {
      setup: () => new PrefixSums(sizes),
      run: (ps: PrefixSums) => {
        let acc = 0;
        for (let i = 0; i < 1000; i++) {
          ps.set((i * 97) % 100_000, 30 + (i % 11));
          acc += ps.indexAt(i * 3000);
        }
        return acc;
      },
    },
    'visibleWindow x 10 000 (variable 100 000 rows)': {
      setup: () => variableRowLayout(rows, 0, sizes),
      run: (l: ReturnType<typeof variableRowLayout>) => {
        const m = scrollMapper(l.total, MAX_PHYSICAL, 800);
        const cols = new PrefixSums(Array.from({ length: 30 }, () => 120));
        let acc = 0;
        for (let i = 0; i < 10_000; i++) acc += visibleWindow(l, cols, m, (i * 337) % m.maxPhysical, (i * 13) % 2000, { block: 800, inline: 1200 }, { overscanRows: 4, overscanCols: 2 }).rows!.first;
        return acc;
      },
    },
    'scrollMapper build x 100 000': () => {
      let acc = 0;
      for (let i = 0; i < 100_000; i++) acc += scrollMapper(32_000_000 + i, MAX_PHYSICAL, 700).ratio;
      return acc;
    },
  };
}

/** The client model's lines on dataset A. */
function modelCases(): Record<string, Case> {
  const columns = createColumnModel<RowA>([{ id: 'n0', type: 'number' }, { id: 'n1', type: 'number' }, { id: 't0' }, { id: 'e1' }]);
  let rows: RowA[] | null = null;
  const model = () => {
    rows ??= datasetA();
    return clientRows<RowA>({ rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'fr-FR' }) });
  };
  const sortedFiltered = () => {
    const m = model();
    m.setQuery(makeQuery({ sort: [{ column: 'n0', dir: 'asc' }], filter: { e1: { type: 'set', exclude: ['radiology'] } } }));
    return m;
  };
  let tick = 0;
  return {
    'load 100 000 x 30 (clientRows)': { setup: () => (rows ??= datasetA()), run: (r: RowA[]) => clientRows<RowA>({ rows: r, getRowId: (x) => x.id, columns, ctx: localeCtx({ locale: 'fr-FR' }) }).displayed.count },
    'setQuery sort change on 100 000 (numeric, warm keys)': {
      setup: () => {
        const m = model();
        m.setQuery(makeQuery({ sort: [{ column: 'n0', dir: 'asc' }] }));
        m.setQuery(makeQuery({ sort: [{ column: 'n1', dir: 'asc' }] }));
        return m;
      },
      run: (m: ReturnType<typeof model>) => m.setQuery(makeQuery({ sort: [{ column: 'n0', dir: 'desc' }] })),
    },
    'transaction update 1 row on 100 000 (sorted and filtered)': {
      setup: sortedFiltered,
      run: (m: ReturnType<typeof model>) => m.applyTransaction({ patch: [{ id: 'r500', set: { t0: `edited ${tick++}` } }] }).version,
    },
    'transaction append 1 000 rows on 100 000': {
      setup: sortedFiltered,
      run: (m: ReturnType<typeof model>) => m.applyTransaction({ add: Array.from({ length: 1000 }, (_, i) => ({ ...rows![i]!, id: `new${tick}-${i}` })) }).version,
    },
  };
}

/** The quick search lines of K.8: ten text columns of dataset A. */
function quickCases(): Record<string, Case> {
  const ids = ['t0', 't1', 't2', 't3', 't4', 'a0', 'a1', 'a2', 'a3', 'a4'];
  const columns = createColumnModel<RowA>(ids.map((id) => ({ id })));
  const asciiCols = createColumnModel<RowA>(['e0', 'e1', 'id', 'e2'].map((id) => ({ id })));
  let rows: RowA[] | null = null;
  const env = (cols = columns) => {
    rows ??= datasetA();
    const store = createRowStore<RowA>((r) => r.id);
    store.replaceAll(rows);
    return { source: store.snapshot, columns: cols, ctx: localeCtx({ locale: 'fr-FR' }), reader: NO_OVERLAY, cache: new ColumnCache<RowA>() };
  };
  const run = (text: string) => (e: ReturnType<typeof env>) => filterIndices(e.source.count, [compileQuick(text, e.columns.visible(), e)])?.length;
  // Ten ASCII text columns, as K.8 states the budget: dataset A's French folded, plus its ASCII fields.
  type Ascii = { id: string; c0: string; c1: string; c2: string; c3: string; c4: string; c5: string; c6: string; c7: string; c8: string; c9: string };
  const asciiTen = createColumnModel<Ascii>(['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'].map((id) => ({ id })));
  let asciiRows: Ascii[] | null = null;
  const asciiEnv = () => {
    rows ??= datasetA();
    asciiRows ??= rows.map((r) => ({ id: r.id, c0: fold(r.t0), c1: fold(r.t1), c2: fold(r.t2), c3: fold(r.t3), c4: fold(r.t4), c5: r.e0, c6: r.e1, c7: r.e2 ?? '', c8: r.id, c9: `${fold(r.t0)} ${r.e1}` }));
    const store = createRowStore<Ascii>((r) => r.id);
    store.replaceAll(asciiRows);
    return { source: store.snapshot, columns: asciiTen, ctx: localeCtx({ locale: 'fr-FR' }), reader: NO_OVERLAY, cache: new ColumnCache<Ascii>() };
  };
  return {
    'quick filter 100 000 x 10 text columns (cold, ASCII)': {
      setup: asciiEnv,
      run: (e: ReturnType<typeof asciiEnv>) => filterIndices(e.source.count, [compileQuick('ma', e.columns.visible(), e)])?.length,
    },
    'quick filter 100 000 x 10 text columns (cold, fr+ar)': { setup: () => env(), run: run('ma') },
    'quick filter 100 000 x 4 ASCII columns (cold)': { setup: () => env(asciiCols), run: run('onc') },
    'quick filter narrowing step (warm)': {
      setup: () => {
        const e = env();
        const within = filterIndices(e.source.count, [compileQuick('ma', e.columns.visible(), e)]);
        return { e, within };
      },
      run: ({ e, within }: { e: ReturnType<typeof env>; within: Uint32Array | null }) =>
        filterIndices(e.source.count, [compileQuick('mar', e.columns.visible(), e)], within)?.length,
    },
  };
}

/** The filter lines of K.8 on dataset A, with the column keys already warm (a filter is retyped, not reloaded). */
function filterCases(): Record<string, Case> {
  const columns = createColumnModel<RowA>([{ id: 't0' }, { id: 'a0' }, { id: 'n0', type: 'number' }, { id: 'd0', type: 'day' }, { id: 'e1' }, { id: 'i1', type: 'instant' }]);
  let rows: RowA[] | null = null;
  const env = () => {
    rows ??= datasetA();
    const store = createRowStore<RowA>((r) => r.id);
    store.replaceAll(rows);
    return { source: store.snapshot, columns, ctx: localeCtx({ locale: 'fr-FR', timeZone: 'Africa/Algiers' }), reader: NO_OVERLAY, cache: new ColumnCache<RowA>() };
  };
  const warm = (m: FilterModel): Case => ({
    setup: () => {
      const e = env();
      filterIndices(e.source.count, [compileFilter(m, e)]);
      return e;
    },
    run: (e: ReturnType<typeof env>) => filterIndices(e.source.count, [compileFilter(m, e)])?.length,
  });
  const cold = (m: FilterModel): Case => ({ setup: env, run: (e: ReturnType<typeof env>) => filterIndices(e.source.count, [compileFilter(m, e)])?.length });
  return {
    'text filter contains 100 000 (cold)': cold({ t0: { type: 'text', op: 'contains', value: 'ma' } }),
    'text filter contains 100 000 ar (cold)': cold({ a0: { type: 'text', op: 'contains', value: 'محم' } }),
    'text filter contains 100 000': warm({ t0: { type: 'text', op: 'contains', value: 'ma' } }),
    'text filter contains 100 000 ar': warm({ a0: { type: 'text', op: 'contains', value: 'محم' } }),
    'number filter gt 100 000': warm({ n0: { type: 'number', op: 'gt', value: 500_000 } }),
    'day filter between 100 000': warm({ d0: { type: 'day', op: 'between', value: '1980-01-01', valueTo: '2000-12-31' } }),
    'set filter 100 000': warm({ e1: { type: 'set', include: ['cardiology', 'oncology'] } }),
    'instant filter onDay 100 000 (warm keys)': warm({ i1: { type: 'instant', op: 'onDay', day: '2026-06-15' } }),
  };
}

/** The sort lines of K.8, each on dataset A with a fresh cache (cold) or a warmed one. */
function sortCases(): Record<string, Case> {
  const columns = createColumnModel<RowA>([
    { id: 'n0', type: 'number' }, { id: 'n1', type: 'number' }, { id: 'd0', type: 'day' },
    { id: 't0' }, { id: 'a0' }, { id: 'i0', type: 'instant' },
  ]);
  let rows: RowA[] | null = null;
  const env = (cache: ColumnCache<RowA>, locale = 'fr-FR') => {
    rows ??= datasetA();
    const store = createRowStore<RowA>((r) => r.id);
    store.replaceAll(rows);
    return { source: store.snapshot, columns, ctx: localeCtx({ locale }), reader: NO_OVERLAY, cache };
  };
  const cold = (items: SortItem[], locale?: string): Case => ({
    setup: () => env(new ColumnCache<RowA>(), locale),
    run: (e: ReturnType<typeof env>) => sortIndices(items, null, e).order.length,
  });
  return {
    'numeric sort 100 000 (cold keys + sort)': cold([{ column: 'n0', dir: 'asc' }]),
    'day sort 100 000 (string days, cold)': cold([{ column: 'd0', dir: 'asc' }]),
    'text sort 100 000 fr (cold rank keys)': cold([{ column: 't0', dir: 'asc' }]),
    'text sort 100 000 ar (cold rank keys)': cold([{ column: 'a0', dir: 'asc' }], 'ar'),
    'text sort 100 000 fr (warm ranks)': {
      setup: () => {
        const e = env(new ColumnCache<RowA>());
        sortIndices([{ column: 't0', dir: 'asc' }], null, e);
        return e;
      },
      run: (e: ReturnType<typeof env>) => sortIndices([{ column: 't0', dir: 'desc' }], null, e).order.length,
    },
    'sort two numeric keys 100 000': cold([{ column: 'n1', dir: 'asc' }, { column: 'n0', dir: 'desc' }]),
    'sort instant ISO strings 100 000 (cold)': cold([{ column: 'i0', dir: 'asc' }]),
  };
}

const heap = (): number => {
  (globalThis as { gc?: () => void }).gc?.();
  return process.memoryUsage().heapUsed;
};

/** Bytes measured after collection; see scripts/bench.mjs. */
export const MEMORY: Record<string, () => number> = {
  'store overhead bytes/row (100 000 rows)': () => {
    const rows = datasetA();
    const before = heap();
    const s = createRowStore<RowA>((r) => r.id);
    s.replaceAll(rows);
    const after = heap();
    void s.size;
    return (after - before) / rows.length;
  },
};
