import { dataKey, assignKeys, parseDay, readInstant, zoneDayBounds, epochDayToDay, dayToEpochDay, localeCtx, readNumber, formattersFor, instantCodec, createColumnModel, NO_OVERLAY, fold, clientRows, makeQuery, PrefixSums, variableRowLayout, scrollMapper, visibleWindow, MAX_PHYSICAL, type SortItem, type FilterModel } from '../packages/core/src/index.js';
import { createRowStore, sortIndices, compileFilter, filterIndices, compileQuick, ColumnCache, filterKindLookup, flatDisplayed } from '../packages/core/src/internal.js';
import { toWire, createGate } from '../packages/core/src/server.js';
import { buildSpanMap } from '../packages/core/src/spans.js';
import { toCsv } from '../packages/core/src/csv.js';
import { treeShape } from '../packages/core/src/tree.js';
import { detailShape, sparseRowLayout } from '../packages/core/src/detail.js';
import { treeProfile, type TreeRow as MRow } from './profiles/tree.js';
import { runEnds } from '../packages/core/src/spans/merge.js';
import { datasetA, type RowA } from './dataset.js';
import { msg } from '../packages/dom/src/messages.js';
import { AR } from '../packages/dom/src/locales/ar.js';

/** A timed case: a function, or an untimed `setup` whose result is passed to `run`; `done` after its runs, untimed. */
export type Case = (() => unknown) | { readonly setup?: () => unknown; readonly run: (ctx: any) => unknown; readonly done?: () => void };

/** Each case returns a value so the work cannot be optimised away. */
export const CASES: Record<string, Case> = {
  // Phase 4 step 3: the tree (parent ids). 100 000 rows, 1 000 roots, each other row under an earlier one.
  'tree build 100 000 rows (cold: parents, cycles, depths, order, flatten)': {
    setup: () => ({ snap: treeRows(100_000, 0).snapshot, shape: treeShape<TreeRow>({ parentId: (r) => r.p }) }),
    run: ({ snap, shape }: TreeCtx) => shape.build({ snap, order: null, matched: null, filterActive: false, expansion: new Set(), layer: null, version: 1 }).count,
  },
  'tree expand one parent of 10 000 children (100 000 rows)': {
    setup: () => {
      const snap = treeRows(100_000, 10_000).snapshot;
      const shape = treeShape<TreeRow>({ parentId: (r) => r.p });
      shape.build({ snap, order: null, matched: null, filterActive: false, expansion: new Set(), layer: null, version: 1 });
      return { snap, shape };
    },
    run: ({ snap, shape }: TreeCtx) => shape.build({ snap, order: null, matched: null, filterActive: false, expansion: new Set([snap.keyAt(0 as never)]), layer: null, version: 2 }).count,
  },
  'tree filter 100 000 rows (number filter, ancestors kept and opened)': {
    setup: () => {
      const columns = createColumnModel<TreeRow>([{ id: 'n', type: 'number' }]);
      const m = clientRows<TreeRow>({ rows: treeRows(100_000, 0).snapshot.rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape: treeShape<TreeRow>({ parentId: (r) => r.p }) });
      m.setQuery(makeQuery({ filter: { n: { type: 'number', op: 'lt', value: 50 } } }));
      return m;
    },
    run: (m: ReturnType<typeof clientRows<TreeRow>>) => (m.setQuery(makeQuery({ filter: { n: { type: 'number', op: 'lt', value: 10 } } })), m.displayed.count),
  },
  // Review of steps 2-3: one toggle through the client model at 1 000 000 rows, 300 000 parents open
  // (the model built once; each run opens or closes the same parent, alternately).
  'tree toggle at 1 000 000 rows with 300 000 open parents': {
    setup: () => (bigTree ??= toggleTree()),
    run: (t: ReturnType<typeof toggleTree>) => t.m.expand([t.key], !t.m.isExpanded(t.key)).length + t.m.displayed.count,
    // Step 6: let go after its runs (it held a million rows through every line after it).
    done: () => void (bigTree = undefined),
  },
  // Step 6: the million-row tree (perf/profiles/tree.ts: parent ids, ten levels, mixed widths). Build: the
  // client model made cold from the rows (store, parents, depths, order, flatten of the roots).
  'tree build 1 000 000 rows (cold: clientRows with the tree shape, ten levels)': {
    setup: () => (millionRows ??= treeProfile()),
    run: (rows: MRow[]) => millionModel(rows).displayed.count,
  },
  // Everything opened from everything closed (the model built once, closed again untimed).
  'tree expand-all 1 000 000 rows (from all closed)': {
    setup: () => {
      const m = (million ??= millionModel((millionRows ??= treeProfile())));
      m.setQuery(makeQuery({}));
      m.expandAll(false);
      return m;
    },
    run: (m: ReturnType<typeof millionModel>) => m.expandAll(true).length + m.displayed.count,
  },
  // A number filter over the million (its ancestors kept and opened), from another filter.
  'tree filter 1 000 000 rows (number filter, ancestors kept and opened)': {
    setup: () => {
      const m = (million ??= millionModel((millionRows ??= treeProfile())));
      m.setQuery(makeQuery({ filter: { n: { type: 'number', op: 'lt', value: 50 } } }));
      return m;
    },
    run: (m: ReturnType<typeof millionModel>) => (m.setQuery(makeQuery({ filter: { n: { type: 'number', op: 'lt', value: 10 } } })), m.displayed.count),
    // The million let go: the lines after it must not pay for its heap.
    done: () => void (million = millionRows = undefined),
  },
  // Phase 4 step 8 (D7, spike S12): the sparse layout of 1 000 000 rows with 2 000 open details of
  // 240 px (built per paint by the DOM, step 9), then one detail's height set among 20 000 (× 100).
  'detail layout build 1 000 000 rows, 2 000 details (sparseRowLayout)': {
    setup: () => sparse(1_000_000, 2_000),
    run: (x: ReturnType<typeof sparse>) => sparseRowLayout(x.rows, 32, x).total,
  },
  'detail setHeight x 100 at 20 000 details (1 000 000 rows)': {
    setup: () => {
      const x = sparse(1_000_000, 20_000);
      return { x, L: sparseRowLayout(x.rows, 32, x) };
    },
    run: ({ x, L }: { x: ReturnType<typeof sparse>; L: ReturnType<typeof sparseRowLayout> }) => {
      for (let k = 0; k < 100; k++) L.setHeight(x.at[(k * 197) % x.at.length]! as never, 100 + k);
      return L.total;
    },
  },
  // One master opened then closed at 1 000 000 rows sorted, 2 000 open (the model built once).
  'detail toggle at 1 000 000 rows sorted, 2 000 open (clientRows)': {
    setup: () => (bigDetail ??= detailModel()),
    run: (t: ReturnType<typeof detailModel>) => t.m.expand([t.key], !t.m.isExpanded(t.key)).length + t.m.displayed.count,
    done: () => void (bigDetail = undefined),
  },
  // Step 9b: the run index of a merging column over its export texts (what ColumnCache.exports holds), runs of 1 to 20 rows.
  'span merge index 1 000 000 rows (export texts given)': {
    setup: () => {
      const t: (string | null)[] = new Array(1_000_000);
      let v = 0;
      for (let i = 0; i < t.length; ) {
        const len = 1 + ((v * 7919) % 20);
        const s = v % 13 === 0 ? null : `ward-${v}`;
        for (let j = 0; j < len && i < t.length; j++) t[i++] = s;
        v++;
      }
      return t;
    },
    run: (t: (string | null)[]) => runEnds(t.length, (i) => t[i] !== null && t[i] === t[i + 1])[t.length - 1],
  },
  // A whole map: nodes, blocks, one merge column read through its codec, placement (cold each run).
  'span map 100 000 rows, one merge column (cold)': {
    setup: () => spanSetup(100_000, [{ id: 'w', merge: true }, { id: 'x' }]),
    run: (input: Parameters<typeof buildSpanMap<SpanRow>>[0]) => buildSpanMap(input).ownerAt(5, 0)?.rows,
  },
  '100 000 data-span calls (rowSpan, cold map)': {
    setup: () => spanSetup(100_000, [{ id: 'w', rowSpan: (c) => (c.index % 50 === 0 ? 3 : 1) }, { id: 'x' }]),
    run: (input: Parameters<typeof buildSpanMap<SpanRow>>[0]) => buildSpanMap(input).ownerAt(1, 0)?.rows,
  },
  'msg() plural ar x 10 000 (announcements, labels)': {
    setup: () => localeCtx({ locale: 'ar-DZ' }),
    run: (ctx: ReturnType<typeof localeCtx>) => {
      let n = 0;
      for (let i = 0; i < 10_000; i++) n += msg(AR, 'announce.rows', { n: i }, ctx).length;
      return n;
    },
  },
  // Step 25 (phase-3-plan §4): the request gate's hot path, a new request on one channel that
  // supersedes the last (an abort each), and the question asked of each answer.
  'gate begin/accepts x 100 000': {
    setup: () => createGate(() => {
      const signal = { aborted: false, reason: undefined as unknown };
      return { signal, abort: (r?: unknown) => void Object.assign(signal, { aborted: true, reason: r }) };
    }),
    run: (g: ReturnType<typeof createGate>) => {
      let ok = 0;
      for (let i = 0; i < 100_000; i++) if (g.accepts(g.begin('rows', `k${i & 7}`).ticket) === null) ok++;
      return ok;
    },
  },
  // What sourceRows does once per new query, zone or columns (never per page): a cold model each run.
  'toWire 7 filters (2 instant, Algiers)': {
    setup: () => ({
      ctx: localeCtx({ locale: 'fr-FR', timeZone: 'Africa/Algiers' }),
      columns: createColumnModel<RowA>([{ id: 't0' }, { id: 'n0', type: 'number' }, { id: 'n1', type: 'number' }, { id: 'd0', type: 'day' }, { id: 'i0', type: 'instant' }, { id: 'i1', type: 'instant' }, { id: 'e1' }]),
      filter: {
        t0: { type: 'text', op: 'contains', value: 'a' },
        n0: { type: 'number', op: 'between', value: 9, valueTo: 1 },
        n1: { type: 'number', op: 'gt', value: 3 },
        d0: { type: 'day', op: 'between', value: '2026-03-01', valueTo: '2026-03-31' },
        i0: { type: 'instant', op: 'betweenDays', day: '2026-03-05', dayTo: '2026-03-09' },
        i1: { type: 'instant', op: 'after', at: '2026-03-05T10:00:00+01:00' },
        e1: { type: 'set', exclude: ['radiology'] },
      } as FilterModel,
    }),
    run: (c: { ctx: ReturnType<typeof localeCtx>; columns: ReturnType<typeof createColumnModel<RowA>>; filter: FilterModel }) => Object.keys(toWire(c.filter, c).filter).length,
  },
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
  ...valueListCases(),
  ...quickCases(),
  ...modelCases(),
  ...layoutCases(),
  ...csvCases(),
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

/** Step 10: the whole file of dataset A, every column, French in Algiers (wall-time instants, decimal commas). */
function csvCases(): Record<string, Case> {
  const opts = (values: string[]) => values.map((value) => ({ value, label: value.toUpperCase() }));
  const columns = createColumnModel<RowA>([
    { id: 'id' },
    ...['t0', 't1', 't2', 't3', 't4', 'a0', 'a1', 'a2', 'a3', 'a4'].map((id) => ({ id })),
    ...['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7'].map((id) => ({ id, type: 'number' as const })),
    ...['d0', 'd1', 'd2', 'd3'].map((id) => ({ id, type: 'day' as const })),
    { id: 'i0', type: 'instant' }, { id: 'i1', type: 'instant' },
    { id: 'e0', type: 'enum', enumOptions: opts(['pending', 'active', 'suspended', 'closed']) },
    { id: 'e1', type: 'enum', enumOptions: opts(['cardiology', 'pediatrics', 'radiology', 'oncology', 'dermatology', 'neurology']) },
    { id: 'e2', type: 'enum', enumOptions: opts(['low', 'medium', 'high']) },
    { id: 'b0', type: 'boolean' }, { id: 'b1', type: 'boolean' },
  ]);
  const ctx = localeCtx({ locale: 'fr-FR', timeZone: 'Africa/Algiers' });
  let model: ReturnType<typeof clientRows<RowA>> | null = null;
  return {
    'csv 100 000 x 30 (toCsv)': {
      setup: () => (model ??= clientRows<RowA>({ rows: datasetA(), getRowId: (r) => r.id, columns, ctx })),
      run: (m: ReturnType<typeof clientRows<RowA>>) => toCsv({ rows: m.displayed, columns, ctx }).length,
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
    // Step 25 (phase-3-plan §4, §5.3 "index of a value filter over A, one column ≤ 30 ms"): the list
    // (distinct values, ranks, counts) on a cold model, for the column a value filter is made for, a
    // category (6 values). Recorded beside it, no budget: a French text column of ~100 000 distinct
    // values (capped at 2 000 shown) and a number column, where the cold ranks dominate.
    'setValues 100 000 x 1 column (cold, 6 values)': { setup: model, run: (m: ReturnType<typeof model>) => m.setValues('e1').result?.values.length },
    'setValues 100 000 x 1 column (cold, ~100 000 French texts)': { setup: model, run: (m: ReturnType<typeof model>) => m.setValues('t0').result?.values.length },
    'setValues 100 000 x 1 column (cold, numbers)': { setup: model, run: (m: ReturnType<typeof model>) => m.setValues('n0').result?.values.length },
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
    // D13: the warm-up in idle time, one step, and the keystroke it makes instant.
    'warm step 2 000 cells (10 text columns fr+ar)': {
      setup: () => {
        rows ??= datasetA();
        const m = clientRows<RowA>({ rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'fr-FR' }) });
        return m.warmSearch();
      },
      run: (w: { step(n: number): boolean }) => w.step(2000),
    },
    'first keystroke after warm-up, 10 text columns fr+ar': {
      setup: () => {
        rows ??= datasetA();
        const m = clientRows<RowA>({ rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'fr-FR' }) });
        const w = m.warmSearch();
        while (!w.step(1e6));
        return m;
      },
      run: (m: ReturnType<typeof clientRows<RowA>>) => {
        m.setQuery(makeQuery({ quick: 'ma' }));
        return m.displayed.count;
      },
    },
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
  // A custom range (docs/behaviors/filter-custom.md): its rule over the column's values.
  const kinds = filterKindLookup([{ name: 'range', read: (s) => s, active: () => true, test: (s: { lo: number; hi: number }) => (v: number | null) => v !== null && v >= s.lo && v <= s.hi }]).get;
  const warm = (m: FilterModel): Case => ({
    setup: () => {
      const e = env();
      filterIndices(e.source.count, [compileFilter(m, e, kinds)]);
      return e;
    },
    run: (e: ReturnType<typeof env>) => filterIndices(e.source.count, [compileFilter(m, e, kinds)])?.length,
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
    'custom kind test 100 000 rows (warm values)': warm({ n0: { type: 'custom', kind: 'range', state: { lo: 100_000, hi: 500_000 } } }),
  };
}

/** Value lists (value-list.md): 100 000 rows, 5 000 distinct texts; cold (index, ranks, counts), and warm counts under another filter. */
function valueListCases(): Record<string, Case> {
  type R = { id: string; s: string; k: number };
  const columns = createColumnModel<R>([{ id: 's' }, { id: 'k', type: 'number' }]);
  const rows: R[] = Array.from({ length: 100_000 }, (_, i) => ({ id: `r${i}`, s: `valeur ${(i * 7919) % 5000} été`, k: i % 7 }));
  const env = () => {
    const store = createRowStore<R>((r) => r.id);
    store.replaceAll(rows);
    return { source: store.snapshot, columns, ctx: localeCtx({ locale: 'fr-FR' }), reader: NO_OVERLAY, cache: new ColumnCache<R>() };
  };
  let n = 0;
  const others = () => ({ key: `k${n++}`, test: () => (src: number) => src % 3 !== 0 });
  return {
    'value list 100 000 rows, 5 000 values (cold)': { setup: env, run: (e: ReturnType<typeof env>) => e.cache.distinct(columns.get('s')!, e, {}).values.length },
    'value list 100 000 rows, warm index, other filter changed': {
      setup: () => {
        const e = env();
        e.cache.distinct(columns.get('s')!, e, {});
        return e;
      },
      run: (e: ReturnType<typeof env>) => e.cache.distinct(columns.get('s')!, e, { others: others() }).values.length,
    },
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
  'client model after the quick-search warm-up, bytes/row (100 000 x 10 text)': () => {
    const rows = datasetA();
    const columns = createColumnModel<RowA>(['t0', 't1', 't2', 't3', 't4', 'a0', 'a1', 'a2', 'a3', 'a4'].map((id) => ({ id })));
    const before = heap();
    const m = clientRows<RowA>({ rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'fr-FR' }) });
    const w = m.warmSearch();
    while (!w.step(1e6));
    const after = heap();
    void m.displayed.count;
    return (after - before) / rows.length;
  },
  'client model + caches after filters and a digit search, bytes/row (100 000 x 30)': () => {
    const rows = datasetA();
    const columns = createColumnModel<RowA>([
      { id: 'id' }, { id: 't0' }, { id: 't1' }, { id: 't2' }, { id: 't3' }, { id: 't4' }, { id: 'a0' }, { id: 'a1' }, { id: 'a2' }, { id: 'a3' }, { id: 'a4' },
      { id: 'n0', type: 'number' }, { id: 'n1', type: 'number' }, { id: 'n2', type: 'number' }, { id: 'n3', type: 'number' },
      { id: 'n4', type: 'number' }, { id: 'n5', type: 'number' }, { id: 'n6', type: 'number' }, { id: 'n7', type: 'number' },
      { id: 'd0', type: 'day' }, { id: 'd1', type: 'day' }, { id: 'd2', type: 'day' }, { id: 'd3', type: 'day' },
      { id: 'i0', type: 'instant' }, { id: 'i1', type: 'instant' }, { id: 'e0' }, { id: 'e1' }, { id: 'e2' },
      { id: 'b0', type: 'boolean' }, { id: 'b1', type: 'boolean' },
    ]);
    const before = heap();
    const m = clientRows<RowA>({ rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'fr-FR' }) });
    m.setQuery(makeQuery({
      quick: 'ma 12',
      sort: [{ column: 'n0', dir: 'asc' }, { column: 't0', dir: 'desc' }],
      filter: { e1: { type: 'set', exclude: ['radiology'] }, t1: { type: 'text', op: 'contains', value: 'a' } },
    }));
    const after = heap();
    void m.displayed.count;
    return (after - before) / rows.length;
  },
  'client model at rest (sort + filters, no search), bytes/row (100 000 x 30)': () => {
    const rows = datasetA();
    const columns = createColumnModel<RowA>([
      { id: 'id' }, { id: 't0' }, { id: 't1' }, { id: 't2' }, { id: 't3' }, { id: 't4' }, { id: 'a0' }, { id: 'a1' }, { id: 'a2' }, { id: 'a3' }, { id: 'a4' },
      { id: 'n0', type: 'number' }, { id: 'n1', type: 'number' }, { id: 'n2', type: 'number' }, { id: 'n3', type: 'number' },
      { id: 'n4', type: 'number' }, { id: 'n5', type: 'number' }, { id: 'n6', type: 'number' }, { id: 'n7', type: 'number' },
      { id: 'd0', type: 'day' }, { id: 'd1', type: 'day' }, { id: 'd2', type: 'day' }, { id: 'd3', type: 'day' },
      { id: 'i0', type: 'instant' }, { id: 'i1', type: 'instant' }, { id: 'e0' }, { id: 'e1' }, { id: 'e2' },
      { id: 'b0', type: 'boolean' }, { id: 'b1', type: 'boolean' },
    ]);
    const before = heap();
    const m = clientRows<RowA>({ rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'fr-FR' }) });
    m.setQuery(makeQuery({
      sort: [{ column: 'n0', dir: 'asc' }, { column: 't0', dir: 'desc' }],
      filter: { e1: { type: 'set', exclude: ['radiology'] }, t1: { type: 'text', op: 'contains', value: 'a' } },
    }));
    const after = heap();
    void m.displayed.count;
    return (after - before) / rows.length;
  },
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

type SpanRow = { id: string; w: string; x: number };
/** Rows for the span benches: runs of 1 to 20 equal wards, as displayed. */
function spanSetup(n: number, defs: Parameters<typeof createColumnModel<SpanRow>>[0]) {
  const store = createRowStore<SpanRow>((r) => r.id);
  const rows: SpanRow[] = new Array(n);
  let v = 0;
  for (let i = 0; i < n; ) {
    const len = 1 + ((v * 7919) % 20);
    for (let j = 0; j < len && i < n; j++, i++) rows[i] = { id: `r${i}`, w: `ward-${v}`, x: i };
    v++;
  }
  store.replaceAll(rows);
  return { rows: flatDisplayed(store.snapshot, null, 1), columns: createColumnModel<SpanRow>(defs), ctx: localeCtx({ locale: 'fr-FR' }) };
}

/** `D` details spread over `n` data rows: their display indices and heights (240 px). */
function sparse(n: number, D: number) {
  const count = n + D;
  const at = Uint32Array.from({ length: D }, (_, j) => Math.floor((j * count) / D));
  return { rows: { count, index: (i: number) => i as never }, at, heights: new Float64Array(D).fill(240) };
}
let bigDetail: ReturnType<typeof detailModel> | undefined;
function detailModel() {
  const rows = Array.from({ length: 1_000_000 }, (_, i) => ({ id: `r${i}`, n: (i * 7919) % 1_000_003 }));
  const columns = createColumnModel<{ id: string; n: number }>([{ id: 'n', type: 'number' }]);
  const m = clientRows({ rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape: detailShape<{ id: string; n: number }>() });
  m.setQuery(makeQuery({ sort: [{ column: 'n', dir: 'asc' }] }));
  m.setExpansion(new Set(Array.from({ length: 2_000 }, (_, j) => dataKey(`r${j * 500}`)!)));
  return { m, key: dataKey('r777')! };
}
type TreeRow = { id: string; p?: string; n: number };
let millionRows: MRow[] | undefined;
let million: ReturnType<typeof millionModel> | undefined;
/** The client model of the million-row tree, nothing open. */
function millionModel(rows: MRow[]) {
  const columns = createColumnModel<MRow>([{ id: 'n', type: 'number' }]);
  return clientRows<MRow>({ rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape: treeShape<MRow>({ parentId: (r) => r.parent }) });
}
let bigTree: ReturnType<typeof toggleTree> | undefined;
function toggleTree() {
  const rows = treeRows(1_000_000, 0).snapshot.rows;
  const columns = createColumnModel<TreeRow>([{ id: 'n', type: 'number' }]);
  const m = clientRows<TreeRow>({ rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape: treeShape<TreeRow>({ parentId: (r) => r.p }) });
  const parents = [...new Set(rows.map((r) => r.p).filter((p) => p !== undefined))].map((p) => dataKey(p)!);
  m.setExpansion(new Set(parents.slice(0, 300_000)));
  return { m, key: parents[300_000]! };
}
type TreeCtx = { snap: ReturnType<typeof treeRows>['snapshot']; shape: ReturnType<typeof treeShape<TreeRow>> };
/** 1 000 roots, then each row under an earlier row (a fixed generator); `wide` rows under row 0. */
function treeRows(n: number, wide: number) {
  const rows: TreeRow[] = [];
  let x = 12345;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    const p = i === 0 ? undefined : i <= wide ? 'r0' : i < 1000 ? undefined : `r${x % i}`;
    rows.push({ id: `r${i}`, ...(p && { p }), n: x % 1000 });
  }
  const store = createRowStore<TreeRow>((r) => r.id);
  store.replaceAll(rows);
  return store;
}
