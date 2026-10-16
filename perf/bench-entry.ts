import { assignKeys, parseDay, readInstant, zoneDayBounds, epochDayToDay, dayToEpochDay, localeCtx, readNumber, formattersFor, instantCodec, createRowStore } from '../packages/core/src/index.js';
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
};

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
