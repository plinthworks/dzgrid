import { assignKeys, parseDay, readInstant, zoneDayBounds, epochDayToDay, dayToEpochDay, localeCtx, readNumber, formattersFor, instantCodec, createRowStore, createColumnModel, ColumnCache, NO_OVERLAY, sortIndices, type SortItem } from '../packages/core/src/index.js';
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
};

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
