import { describe, it, expect } from 'vitest';
import {
  clientRows, createColumnModel, createKernel, enumCodec, localeCtx, makeQuery, NO_OVERLAY, VALUES_MAX,
  type ColumnDef, type FilterModel, type GridEvent, type LocaleCtx, type ValueReader, type ValuesHandle,
} from '@dzgrid/core';
import { ColumnCache, createRowStore } from '@dzgrid/core/internal';

const NO_OVERLAY_FOR_TESTS = NO_OVERLAY;

/** docs/behaviors/value-list.md. Every expectation below is written by hand (labels cross-checked with Intl in a scratch script). */
type Row = { id: string } & Record<string, unknown>;
const EN = localeCtx({ locale: 'en-US' });
const FR = localeCtx({ locale: 'fr-FR' });
const NNBSP = '\u202f';

const OPTIONS = [{ value: 'a', label: 'Zulu' }, { value: 'b', label: 'Alpha' }, { value: 'c', label: 'Mike' }];
const DEFS: ColumnDef<Row>[] = [
  { id: 's' },
  { id: 't' },
  { id: 'e', type: 'enum', enumOptions: OPTIONS },
  { id: 'eo', type: 'enum', codec: enumCodec(OPTIONS, { sort: 'option-order' }) },
  { id: 'n', type: 'number' },
  { id: 'd', type: 'day' },
  { id: 'i', type: 'instant' },
  { id: 'b', type: 'boolean' },
  { id: 'h', hidden: true },
  { id: 'off', filter: false },
];

const rowsOf = (cells: Record<string, unknown>[]): Row[] => cells.map((c, k) => ({ id: `r${k + 1}`, ...c }));
const model = (cells: Record<string, unknown>[], ctx: LocaleCtx = EN, reader?: ValueReader<Row>) =>
  clientRows<Row>({ rows: rowsOf(cells), getRowId: (r) => r.id, columns: createColumnModel<Row>(DEFS), ctx, ...(reader && { reader }) });
type M = ReturnType<typeof model>;
const q = (filter: FilterModel = {}, quick = '') => makeQuery({ filter, quick });
const list = (m: M, col: string, o?: { search?: string; max?: number }) => m.setValues(col, o).result;
const plain = (h: ValuesHandle) => h.result!.values.map((v) => [v.value, v.label, v.count, ...(v.selected ? ['selected'] : [])]);
const triples = (m: M, col: string, o?: { search?: string; max?: number }) => plain(m.setValues(col, o));

describe('the entries: labels and order', () => {
  it('text: collator order, base sensitivity, equal values apart by their code units', () => {
    const m = model([{ s: 'zèbre' }, { s: 'été' }, { s: 'Ete' }, { s: 'été' }, { s: 'apple' }, { s: 'Apple' }], FR);
    // fr base: été = Ete (é U+00E9 after E U+0045), apple = Apple (A U+0041 before a U+0061), zèbre last.
    expect(triples(m, 's')).toEqual([['Apple', 'Apple', 1], ['apple', 'apple', 1], ['Ete', 'Ete', 1], ['été', 'été', 2], ['zèbre', 'zèbre', 1]]);
  });

  it('text: numeric collation (item2 < item9 < item10)', () => {
    const m = model([{ s: 'item10' }, { s: 'item9' }, { s: 'item2' }]);
    expect(triples(m, 's').map((t) => t[0])).toEqual(['item2', 'item9', 'item10']);
  });

  it('Arabic: hamza forms collate equal to the bare alef, kept apart by code unit (أ U+0623, إ U+0625, ا U+0627)', () => {
    const m = model([{ s: 'احمد' }, { s: 'بكر' }, { s: 'إحمد' }, { s: 'أحمد' }], localeCtx({ locale: 'ar' }));
    expect(triples(m, 's').map((t) => t[0])).toEqual(['أحمد', 'إحمد', 'احمد', 'بكر']);
  });

  it('a number and its text in a text column are one value (one export)', () => {
    const m = model([{ s: 1 }, { s: '1' }, { s: '1.0' }]);
    expect(triples(m, 's')).toEqual([['1', '1', 2], ['1.0', '1.0', 1]]);
  });

  it('enum sorted by label: values outside the options keep their value as label', () => {
    const m = model([{ e: 'b' }, { e: 'a' }, { e: 'c' }, { e: 'x' }, { e: 'a' }]);
    expect(triples(m, 'e')).toEqual([['b', 'Alpha', 1], ['c', 'Mike', 1], ['x', 'x', 1], ['a', 'Zulu', 2]]);
  });

  it('enum in option order: the options first in their order, the others after', () => {
    const m = model([{ eo: 'x' }, { eo: 'b' }, { eo: 'a' }, { eo: 'c' }, { eo: 'w' }]);
    // x and w both sort after the options with the same key: their code units decide.
    expect(triples(m, 'eo')).toEqual([['a', 'Zulu', 1], ['b', 'Alpha', 1], ['c', 'Mike', 1], ['w', 'w', 1], ['x', 'x', 1]]);
  });

  it('numbers: by value, labelled in the language (fr narrow space, comma)', () => {
    const m = model([{ n: 1234.5 }, { n: 2 }, { n: 1234.5 }, { n: -3 }], FR);
    expect(triples(m, 'n')).toEqual([['-3', '-3', 1], ['2', '2', 1], ['1234.5', `1${NNBSP}234,5`, 2]]);
  });

  it('numbers with the language\'s own digits (ar-EG)', () => {
    const m = model([{ n: 1234.5 }, { n: 2 }], localeCtx({ locale: 'ar-EG', numerals: 'locale' }));
    expect(triples(m, 'n')).toEqual([['2', '٢', 1], ['1234.5', '١٬٢٣٤٫٥', 1]]);
  });

  it('days: by date, labelled in the language, no zone', () => {
    const cells = [{ d: '2026-03-05' }, { d: '2025-12-31' }];
    expect(triples(model(cells), 'd')).toEqual([['2025-12-31', '12/31/2025', 1], ['2026-03-05', '03/05/2026', 1]]);
    expect(triples(model(cells, FR), 'd')).toEqual([['2025-12-31', '31/12/2025', 1], ['2026-03-05', '05/03/2026', 1]]);
  });

  it('instants: labelled in the grid zone', () => {
    const cells = [{ i: '2026-03-05T23:30:00Z' }, { i: '2026-03-04T10:00:00Z' }];
    expect(triples(model(cells), 'i')).toEqual([['2026-03-04T10:00:00Z', '03/04/2026, 10:00', 1], ['2026-03-05T23:30:00Z', '03/05/2026, 23:30', 1]]);
    const tokyo = model(cells, localeCtx({ locale: 'en-US', timeZone: 'Asia/Tokyo' }));
    expect(triples(tokyo, 'i')).toEqual([['2026-03-04T10:00:00Z', '03/04/2026, 19:00', 1], ['2026-03-05T23:30:00Z', '03/06/2026, 08:30', 1]]);
  });

  it('booleans: false before true, the codec\'s labels', () => {
    const m = model([{ b: true }, { b: false }, { b: true }]);
    expect(triples(m, 'b')).toEqual([['false', 'false', 1], ['true', 'true', 2]]);
  });
});

describe('blanks', () => {
  it('counts blank and unreadable cells apart, never as a value', () => {
    const m = model([{ n: 1 }, { n: null }, { n: '' }, { n: 'abc' }, {}, { n: 1 }]);
    const r = list(m, 'n')!;
    expect(r.values.map((v) => [v.value, v.count])).toEqual([['1', 2]]);
    expect(r.blanks).toBe(4);
  });

  it('a cell whose accessor throws is a blank', () => {
    const m = clientRows<Row>({
      rows: rowsOf([{ s: 'a' }, { s: 'boom' }]),
      getRowId: (r) => r.id,
      columns: createColumnModel<Row>([{ id: 's', value: (r) => { if (r.s === 'boom') throw new Error('x'); return r.s; } }]),
      ctx: EN,
    });
    expect(list(m, 's')).toEqual({ values: [{ value: 'a', label: 'a', count: 1 }], blanks: 1, truncated: false });
  });

  it('0 when there are none', () => {
    expect(list(model([{ s: 'a' }]), 's')!.blanks).toBe(0);
  });
});

describe('counts: the other filters and the search, never the column\'s own', () => {
  const cells = [
    { s: 'été', t: 'x' },
    { s: 'Ete', t: 'x' },
    { s: 'zèbre', t: 'y' },
    { s: null, t: 'x' },
    { s: 'été', t: 'y' },
  ];

  it('the own filter is ignored, the others count; a ticked value with no row stays first, count 0, selected', () => {
    const m = model(cells, FR);
    m.setQuery(q({ t: { type: 'set', include: ['x'] }, s: { type: 'set', include: ['zèbre'] } }));
    expect(list(m, 's')).toEqual({
      values: [
        { value: 'zèbre', label: 'zèbre', count: 0, selected: true },
        { value: 'Ete', label: 'Ete', count: 1 },
        { value: 'été', label: 'été', count: 1 },
      ],
      blanks: 1,
      truncated: false,
    });
  });

  it('a value with no row under the other filters is not listed', () => {
    const m = model(cells, FR);
    m.setQuery(q({ t: { type: 'set', include: ['y'] } }));
    expect(triples(m, 's')).toEqual([['été', 'été', 1], ['zèbre', 'zèbre', 1]]);
    expect(list(m, 's')!.blanks).toBe(0);
  });

  it('a combined own filter is removed whole', () => {
    const m = model(cells, FR);
    m.setQuery(q({ s: { type: 'combined', join: 'and', conditions: [{ type: 'text', op: 'contains', value: 'z' }, { type: 'set', include: ['zèbre'] }] } }));
    // Not a set filter at the top: nothing counts as ticked.
    expect(triples(m, 's')).toEqual([['Ete', 'Ete', 1], ['été', 'été', 2], ['zèbre', 'zèbre', 1]]);
  });

  it('an exclude own filter ticks nothing extra', () => {
    const m = model(cells, FR);
    m.setQuery(q({ t: { type: 'set', include: ['y'] }, s: { type: 'set', exclude: ['Ete'] } }));
    expect(triples(m, 's')).toEqual([['été', 'été', 1], ['zèbre', 'zèbre', 1]]);
  });

  it('ticked values present under the other filters carry no flag; absent ones come in include order, once', () => {
    const m = model(cells, FR);
    m.setQuery(q({ t: { type: 'set', include: ['x'] }, s: { type: 'set', include: ['ghost', 'été', 'zèbre', 'ghost'] } }));
    expect(triples(m, 's')).toEqual([['ghost', 'ghost', 0, 'selected'], ['zèbre', 'zèbre', 0, 'selected'], ['Ete', 'Ete', 1], ['été', 'été', 1]]);
  });

  it('a hidden column\'s filter counts', () => {
    const m = model([{ s: 'a', h: 'k' }, { s: 'b', h: 'z' }]);
    m.setQuery(q({ h: { type: 'text', op: 'equals', value: 'k' } }));
    expect(triples(m, 's')).toEqual([['a', 'a', 1]]);
  });

  it('the quick search counts, over the visible columns', () => {
    const m = model([{ s: 'a', t: 'lion' }, { s: 'b', t: 'tiger' }, { s: 'a', t: 'tiger' }, { s: 'c', h: 'lion' }]);
    m.setQuery(q({}, 'tig'));
    expect(triples(m, 's')).toEqual([['a', 'a', 1], ['b', 'b', 1]]);
    // A hidden column is never searched: c (lion only in h) has no row for "lion".
    m.setQuery(q({}, 'lion'));
    expect(triples(m, 's')).toEqual([['a', 'a', 1]]);
  });

  it('a quick search matching on the column itself narrows its own list', () => {
    const m = model([{ s: 'apple' }, { s: 'pear' }]);
    m.setQuery(q({}, 'app'));
    expect(triples(m, 's')).toEqual([['apple', 'apple', 1]]);
  });

  it('counts the rows of every page, not the page shown', () => {
    const m = clientRows<Row>({ rows: rowsOf([{ s: 'a' }, { s: 'a' }, { s: 'b' }]), getRowId: (r) => r.id, columns: createColumnModel<Row>(DEFS), ctx: EN, page: { pageSize: 1 } });
    expect(triples(m, 's')).toEqual([['a', 'a', 2], ['b', 'b', 1]]);
  });

  it('a custom filter that throws on another column keeps no row and tells nothing new', () => {
    const kind = { name: 'boom', read: (s: unknown) => s, active: () => true, test: () => () => { throw new Error('x'); } };
    const m = clientRows<Row>({ rows: rowsOf([{ s: 'a', t: 'q' }]), getRowId: (r) => r.id, columns: createColumnModel<Row>(DEFS), ctx: EN, filterKinds: (n) => (n === 'boom' ? (kind as never) : undefined) });
    m.setQuery(q({ t: { type: 'custom', kind: 'boom', state: 1 } }));
    const h = m.setValues('s');
    expect(h.result).toEqual({ values: [], blanks: 0, truncated: false });
    expect(h.problems).toEqual([]);
  });
});

describe('search', () => {
  const m = () => model([{ s: 'été' }, { s: 'Ete' }, { s: 'ETAT' }, { e: 'b' }, { e: 'a' }], FR);

  it('folds case and accents, trims, every word must match', () => {
    expect(triples(m(), 's', { search: '  ÉTÉ ' }).map((t) => t[0])).toEqual(['Ete', 'été']);
    expect(triples(m(), 's', { search: 'et' }).map((t) => t[0])).toEqual(['ETAT', 'Ete', 'été']);
    expect(triples(m(), 's', { search: 'et at' }).map((t) => t[0])).toEqual(['ETAT']);
    expect(triples(m(), 's', { search: 'zz' })).toEqual([]);
  });

  it('matches the label or the value of an enum', () => {
    expect(triples(m(), 'e', { search: 'alp' })).toEqual([['b', 'Alpha', 1]]);
    expect(triples(m(), 'e', { search: 'a' }).map((t) => t[0])).toEqual(['b', 'a']);
    expect(triples(m(), 'e', { search: 'zu' })).toEqual([['a', 'Zulu', 1]]);
  });

  it('Arabic marks and alef forms fold; Arabic-Indic digits find Latin-digit values', () => {
    const ar = model([{ s: 'أحمد' }, { s: 'مُحَمَّد' }, { n: 12 }, { n: 7 }], localeCtx({ locale: 'ar-EG', numerals: 'locale' }));
    expect(triples(ar, 's', { search: 'احمد' }).map((t) => t[0])).toEqual(['أحمد']);
    expect(triples(ar, 's', { search: 'محمد' }).map((t) => t[0])).toEqual(['مُحَمَّد']);
    expect(triples(ar, 'n', { search: '١٢' })).toEqual([['12', '١٢', 1]]);
    expect(triples(ar, 'n', { search: '12' })).toEqual([['12', '١٢', 1]]);
  });

  it('never changes the counts or the blanks', () => {
    const mm = model([{ s: 'été' }, { s: 'été' }, { s: null }, { s: 'x' }], FR);
    expect(list(mm, 's', { search: 'ete' })).toEqual({ values: [{ value: 'été', label: 'été', count: 2 }], blanks: 1, truncated: false });
  });

  it('a ticked value with no row obeys a search', () => {
    const mm = model([{ s: 'a', t: 'x' }, { s: 'ghost', t: 'y' }]);
    mm.setQuery(q({ t: { type: 'set', include: ['x'] }, s: { type: 'set', include: ['ghost'] } }));
    expect(triples(mm, 's', { search: 'gho' })).toEqual([['ghost', 'ghost', 0, 'selected']]);
    expect(triples(mm, 's', { search: 'a' })).toEqual([['a', 'a', 1]]);
    expect(triples(mm, 's', { search: '' })).toEqual([['ghost', 'ghost', 0, 'selected'], ['a', 'a', 1]]);
  });
});

describe('the cap', () => {
  const five = () => model([{ s: 'e' }, { s: 'd' }, { s: 'c' }, { s: 'b' }, { s: 'a' }]);

  it('keeps the first max values in order, truncated when more matched', () => {
    expect(list(five(), 's', { max: 2 })).toEqual({ values: [{ value: 'a', label: 'a', count: 1 }, { value: 'b', label: 'b', count: 1 }], blanks: 0, truncated: true });
    expect(list(five(), 's', { max: 5 })!.truncated).toBe(false);
    expect(list(five(), 's', { max: 4 })!.truncated).toBe(true);
    expect(list(five(), 's', { max: 4 })!.values.length).toBe(4);
  });

  it('applies after the search', () => {
    const m = model([{ s: 'ab' }, { s: 'b' }, { s: 'ac' }, { s: 'ad' }]);
    expect(list(m, 's', { search: 'a', max: 2 })).toEqual({ values: [{ value: 'ab', label: 'ab', count: 1 }, { value: 'ac', label: 'ac', count: 1 }], blanks: 0, truncated: true });
    expect(list(m, 's', { search: 'a', max: 3 })!.truncated).toBe(false);
  });

  it('applies after the zero rule: values with no row never use the cap', () => {
    const m = model([{ s: 'a', t: 'y' }, { s: 'b', t: 'x' }, { s: 'c', t: 'x' }]);
    m.setQuery(q({ t: { type: 'set', include: ['x'] } }));
    expect(list(m, 's', { max: 2 })!.truncated).toBe(false);
    expect(triples(m, 's', { max: 2 })).toEqual([['b', 'b', 1], ['c', 'c', 1]]);
  });

  it('never cuts the ticked values with no row', () => {
    const m = model([{ s: 'a', t: 'x' }, { s: 'b', t: 'x' }, { s: 'g', t: 'y' }]);
    m.setQuery(q({ t: { type: 'set', include: ['x'] }, s: { type: 'set', include: ['g', 'h'] } }));
    expect(triples(m, 's', { max: 1 })).toEqual([['g', 'g', 0, 'selected'], ['h', 'h', 0, 'selected'], ['a', 'a', 1]]);
    expect(list(m, 's', { max: 1 })!.truncated).toBe(true);
  });

  it('is 2 000 by default, and an invalid max reads as the default', () => {
    expect(VALUES_MAX).toBe(2000);
    const cells = Array.from({ length: 2001 }, (_, k) => ({ n: k }));
    const m = model(cells);
    expect(list(m, 'n')!.values.length).toBe(2000);
    expect(list(m, 'n')!.truncated).toBe(true);
    for (const max of [0, -1, 1.5, Number.NaN, '3' as unknown as number]) expect(list(m, 'n', { max })!.values.length, String(max)).toBe(2000);
    expect(list(m, 'n', { max: 2001 })!.truncated).toBe(false);
  });
});

describe('unknown and unfilterable columns', () => {
  it('a closed handle, empty, with one problem at values.<col>', () => {
    const m = model([{ s: 'a' }]);
    for (const [col, code] of [['nope', 'unknown-column'], ['off', 'invalid-filter']] as const) {
      const h = m.setValues(col);
      expect(h.available).toBe(false);
      expect(h.status).toBe('idle');
      expect(h.result).toEqual({ values: [], blanks: null, truncated: false });
      expect(h.problems).toEqual([{ code, severity: 'error', path: `values.${col}` }]);
    }
  });
});

describe('the cache: two levels, invalidation', () => {
  const env = (cells: Record<string, unknown>[], ctx: LocaleCtx = EN) => {
    const store = createRowStore<Row>((r) => r.id);
    store.replaceAll(rowsOf(cells));
    const columns = createColumnModel<Row>(DEFS);
    const cache = new ColumnCache<Row>();
    let reader = NO_OVERLAY_FOR_TESTS as ValueReader<Row>;
    const e = (c = ctx) => ({ source: store.snapshot, columns, ctx: c, reader, cache });
    return { store, columns, cache, e, setReader: (r: ValueReader<Row>) => (reader = r) };
  };

  it('search, max and selected reuse both levels; another set of other filters recounts only', () => {
    const t = env([{ s: 'b' }, { s: 'a' }, { s: 'a' }]);
    const col = t.columns.get('s')!;
    const r1 = t.cache.distinct(col, t.e(), {});
    expect(t.cache.stats.indexBuilds).toBe(1);
    expect(t.cache.stats.countBuilds).toBe(1);
    expect(t.cache.distinct(col, t.e(), {})).toBe(r1);
    t.cache.distinct(col, t.e(), { search: 'a', max: 1, selected: ['z'] });
    expect([t.cache.stats.indexBuilds, t.cache.stats.countBuilds]).toEqual([1, 1]);
    const r2 = t.cache.distinct(col, t.e(), { others: { key: 'k1', test: () => (src) => src !== 0 } });
    expect([t.cache.stats.indexBuilds, t.cache.stats.countBuilds]).toEqual([1, 2]);
    expect(r2.values.map((v) => [v.value, v.count])).toEqual([['a', 2]]);
    t.cache.distinct(col, t.e(), { others: { key: 'k1', test: () => { throw new Error('not called'); } } });
    expect(t.cache.stats.countBuilds).toBe(2);
    expect(t.cache.distinct(col, t.e(), { others: { key: 'k2', test: () => null } }).values.length).toBe(2);
    expect(t.cache.stats.countBuilds).toBe(3);
  });

  it('the same result object for the same inputs, a new one when the ticked list changes', () => {
    const t = env([{ s: 'a' }]);
    const col = t.columns.get('s')!;
    const a = t.cache.distinct(col, t.e(), { selected: ['a'] });
    expect(t.cache.distinct(col, t.e(), { selected: ['a'] })).toBe(a);
    const b = t.cache.distinct(col, t.e(), { selected: ['z'] });
    expect(b).not.toBe(a);
    expect(b.values[0]).toEqual({ value: 'z', label: 'z', count: 0, selected: true });
    expect(t.cache.distinct(col, t.e(), { selected: ['z'], search: 'q' })).not.toBe(b);
    expect(t.cache.distinct(col, t.e(), { selected: ['z'], max: 1 })).not.toBe(b);
  });

  it('rebuilds the index for new rows, a transaction, another reader version, language, digits or zone, a new column, another collator', () => {
    const t = env([{ s: 'a', n: 1, i: '2026-03-05T23:30:00Z' }]);
    const builds = () => t.cache.stats.indexBuilds;
    const s = () => t.columns.get('s')!;
    t.cache.distinct(s(), t.e(), {});
    expect(builds()).toBe(1);
    t.cache.distinct(s(), t.e(), {});
    expect(builds()).toBe(1);

    t.store.replaceAll(rowsOf([{ s: 'b' }]));
    t.cache.patch(t.store.lastDelta, t.store.snapshot, () => ({ columns: t.columns, ctx: EN, reader: NO_OVERLAY_FOR_TESTS as ValueReader<Row> }));
    expect(t.cache.distinct(s(), t.e(), {}).values.map((v) => v.value)).toEqual(['b']);
    expect(builds()).toBe(2);

    t.store.apply({ patch: [{ id: 'r1', set: { s: 'c' } }] });
    t.cache.patch(t.store.lastDelta, t.store.snapshot, () => ({ columns: t.columns, ctx: EN, reader: NO_OVERLAY_FOR_TESTS as ValueReader<Row> }));
    expect(t.cache.distinct(s(), t.e(), {}).values.map((v) => v.value)).toEqual(['c']);
    expect(builds()).toBe(3);

    t.setReader({ version: 7, overlay: true, value: () => 'edited' });
    expect(t.cache.distinct(s(), t.e(), {}).values.map((v) => v.value)).toEqual(['edited']);
    expect(builds()).toBe(4);

    t.cache.distinct(s(), t.e(FR), {});
    expect(builds()).toBe(5);
    t.cache.distinct(s(), t.e(localeCtx({ locale: 'fr-FR', numerals: 'locale' })), {});
    expect(builds()).toBe(6);
    t.cache.distinct(s(), t.e(localeCtx({ locale: 'fr-FR', numerals: 'locale', timeZone: 'Asia/Tokyo' })), {});
    expect(builds()).toBe(7);

    t.columns.setDefs(DEFS.map((d) => (d.id === 's' ? { ...d, header: 'S' } : d)));
    t.cache.distinct(s(), t.e(localeCtx({ locale: 'fr-FR', numerals: 'locale', timeZone: 'Asia/Tokyo' })), {});
    expect(builds()).toBe(8);

    t.cache.invalidateAll();
    t.cache.distinct(s(), t.e(localeCtx({ locale: 'fr-FR', numerals: 'locale', timeZone: 'Asia/Tokyo' })), {});
    expect(builds()).toBe(9);
  });

  it('a patch of other rows drops the index even when the version would line up', () => {
    const t = env([{ s: 'a' }, { s: 'b' }]);
    const s = t.columns.get('s')!;
    t.cache.distinct(s, t.e(), {});
    t.store.apply({ patch: [{ id: 'r2', set: { s: 'z' } }] });
    t.cache.patch(t.store.lastDelta, t.store.snapshot, () => ({ columns: t.columns, ctx: EN, reader: NO_OVERLAY_FOR_TESTS as ValueReader<Row> }));
    expect(t.cache.distinct(s, t.e(), {}).values.map((v) => v.value)).toEqual(['a', 'z']);
  });

  it('collator-equal values in case: ordered by their code units', () => {
    const t = env([{ s: 'b' }, { s: 'B' }, { s: 'a' }]);
    const s = t.columns.get('s')!;
    expect(t.cache.distinct(s, t.e(), {}).values.map((v) => v.value)).toEqual(['a', 'B', 'b']);
  });
});

describe('the client model keeps the list fresh', () => {
  const cells = [{ s: 'a', t: 'x', n: 1 }, { s: 'b', t: 'y', n: 2 }, { s: 'a', t: 'y', n: 3 }];

  it('another filter, the search, rows, a transaction, the language, the columns: new counts, one notification each', () => {
    const m = model(cells);
    const h = m.setValues('s');
    let calls = 0;
    h.subscribe(() => calls++);
    expect(plain(h)).toEqual([['a', 'a', 2], ['b', 'b', 1]]);

    m.setQuery(q({ t: { type: 'set', include: ['y'] } }));
    expect([calls, plain(h)]).toEqual([1, [['a', 'a', 1], ['b', 'b', 1]]]);

    m.setQuery(q({ t: { type: 'set', include: ['y'] } }, 'b'));
    expect([calls, plain(h)]).toEqual([2, [['b', 'b', 1]]]);

    m.setQuery(q());
    m.applyTransaction({ add: [{ id: 'r9', s: 'c' }] });
    expect(plain(h)).toEqual([['a', 'a', 2], ['b', 'b', 1], ['c', 'c', 1]]);
    expect(calls).toBe(4);

    m.setRows(rowsOf([{ s: 'z' }]));
    expect([calls, plain(h)]).toEqual([5, [['z', 'z', 1]]]);

    const n = m.setValues('n');
    m.setRows(rowsOf([{ n: 1234.5 }]));
    let ncalls = 0;
    n.subscribe(() => ncalls++);
    m.setContext(FR);
    expect([ncalls, plain(n)]).toEqual([1, [['1234.5', `1${NNBSP}234,5`, 1]]]);
  });

  it('no notification for a sort, a page, or a tick of a value that has rows', () => {
    const m = model(cells);
    const h = m.setValues('s');
    const before = h.result;
    let calls = 0;
    h.subscribe(() => calls++);
    m.setQuery(makeQuery({ sort: [{ column: 'n', dir: 'desc' }] }));
    m.setQuery(makeQuery({ sort: [{ column: 'n', dir: 'desc' }], filter: { s: { type: 'set', include: ['a'] } } }));
    expect(calls).toBe(0);
    expect(h.result).toBe(before);
  });

  it('a tick of a value with no row under the other filters adds it, and notifies', () => {
    const m = model(cells);
    m.setQuery(q({ t: { type: 'set', include: ['x'] } }));
    const h = m.setValues('s');
    let calls = 0;
    h.subscribe(() => calls++);
    m.setQuery(q({ t: { type: 'set', include: ['x'] }, s: { type: 'set', include: ['b'] } }));
    expect(calls).toBe(1);
    expect(plain(h)).toEqual([['b', 'b', 0, 'selected'], ['a', 'a', 1]]);
  });

  it('the quick search over other visible columns: hiding a searched column recounts', () => {
    const m = clientRows<Row>({ rows: rowsOf([{ s: 'a', t: 'lion' }, { s: 'b', t: 'cat' }]), getRowId: (r) => r.id, columns: createColumnModel<Row>(DEFS), ctx: EN });
    m.setQuery(q({}, 'lion'));
    const h = m.setValues('s');
    expect(plain(h)).toEqual([['a', 'a', 1]]);
    const columns = createColumnModel<Row>(DEFS.map((d) => (d.id === 't' ? { ...d, hidden: true } : d)));
    m.setColumns(columns);
    expect(plain(h)).toEqual([]);
  });

  it('the quick search over other visible columns: hiding a searched column in the same column model recounts', () => {
    const columns = createColumnModel<Row>(DEFS);
    const m = clientRows<Row>({ rows: rowsOf([{ s: 'a', t: 'lion' }, { s: 'b', t: 'cat' }]), getRowId: (r) => r.id, columns, ctx: EN });
    m.setQuery(q({}, 'lion'));
    const h = m.setValues('s');
    expect(plain(h)).toEqual([['a', 'a', 1]]);
    columns.apply([{ id: 't', hidden: true }], 'user');
    m.setColumns(columns);
    expect(plain(h)).toEqual([]);
  });

  it('search(): trimmed, the same text asks nothing, a new one recomputes at once', () => {
    const m = model(cells);
    const h = m.setValues('s', { search: 'a' });
    let calls = 0;
    h.subscribe(() => calls++);
    h.search('  a ');
    expect(calls).toBe(0);
    h.search('b');
    expect([calls, plain(h)]).toEqual([1, [['b', 'b', 1]]]);
    h.refresh();
    expect(calls).toBe(1);
  });

  it('close(): no more notifications; a second list on the same column closes the first; destroy closes all', () => {
    const m = model(cells);
    const h = m.setValues('s');
    let calls = 0;
    h.subscribe(() => calls++);
    h.close();
    h.close();
    m.setQuery(q({ t: { type: 'set', include: ['y'] } }));
    h.search('b');
    expect(calls).toBe(0);

    const a = m.setValues('t');
    let acalls = 0;
    a.subscribe(() => acalls++);
    const b = m.setValues('t');
    m.setQuery(q({ s: { type: 'set', include: ['b'] } }));
    a.search('x');
    expect(acalls).toBe(0);
    let bcalls = 0;
    b.subscribe(() => bcalls++);
    const other = m.setValues('s');
    let ocalls = 0;
    other.subscribe(() => ocalls++);
    m.destroy();
    m.setQuery(q({ t: { type: 'set', include: ['x'] } }));
    other.search('zz');
    b.refresh();
    expect([bcalls, ocalls]).toEqual([0, 0]);
  });

  it('a column made unfilterable while open: an empty list', () => {
    const m = model(cells);
    const h = m.setValues('t');
    m.setColumns(createColumnModel<Row>(DEFS.map((d) => (d.id === 't' ? { ...d, filter: false as const } : d))));
    expect(h.result).toEqual({ values: [], blanks: null, truncated: false });
  });

  it('a column removed while open: an empty list', () => {
    const m = model(cells);
    const h = m.setValues('t');
    m.setColumns(createColumnModel<Row>(DEFS.filter((d) => d.id !== 't')));
    expect(h.result).toEqual({ values: [], blanks: null, truncated: false });
  });

  it('an edit overlay counts once reapplied', () => {
    let version = 0;
    const edits: Record<string, unknown> = {};
    const reader: ValueReader<Row> = { get version() { return version; }, overlay: true, value: (col, row, id) => (col.id === 's' && id in edits ? edits[id] : col.read(row)) };
    const m = model(cells, EN, reader);
    const h = m.setValues('s');
    edits['r2'] = 'a';
    version++;
    m.setReader(reader);
    m.reapply();
    expect(plain(h)).toEqual([['a', 'a', 3]]);
  });
});

describe('the kernel', () => {
  it('passes through, and tells a handle\'s problems once', () => {
    const rows = model([{ s: 'a' }]);
    const columns = createColumnModel<Row>(DEFS);
    const k = createKernel<Row>({ rows, columns });
    const events: GridEvent<Row>[] = [];
    k.subscribe((e) => events.push(e));
    expect(k.values('s').result!.values.map((v) => v.value)).toEqual(['a']);
    expect(events).toEqual([]);
    k.values('nope');
    expect(events).toEqual([{ type: 'problems', source: 'data', problems: [{ code: 'unknown-column', severity: 'error', path: 'values.nope' }] }]);
  });

  it('without model support: a closed handle, not available', () => {
    const rows = model([{ s: 'a' }]);
    const bare = { ...rows, setValues: undefined } as unknown as typeof rows;
    const k = createKernel<Row>({ rows: bare, columns: createColumnModel<Row>(DEFS) });
    const h = k.values('s');
    expect([h.available, h.status, h.result]).toEqual([false, 'idle', { values: [], blanks: null, truncated: false }]);
  });
});
