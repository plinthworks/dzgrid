import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, enumCodec, localeCtx, makeQuery, type ColumnDef, type ValuesHandle } from '@dzgrid/core';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { fakeSource } from './support/fake-source.js';

/** docs/behaviors/value-list.md: cases the step's own tests leave open. */
type Row = { id: string } & Record<string, unknown>;
const OPTIONS = [{ value: 'p', label: 'Pomme' }, { value: 'q', label: 'Quetsche' }];
const DEFS: ColumnDef<Row>[] = [{ id: 's' }, { id: 'n', type: 'number' }, { id: 'e', type: 'enum', codec: enumCodec(OPTIONS) }, { id: 't' }];
const AR_EG = localeCtx({ locale: 'ar-EG', numerals: 'locale' });
const browser = (cells: Record<string, unknown>[], ctx = localeCtx({ locale: 'en-US' })) =>
  clientRows<Row>({ rows: cells.map((c, k) => ({ id: `r${k}`, ...c })), getRowId: (r) => r.id, columns: createColumnModel<Row>(DEFS), ctx });
const server = (ctx = localeCtx({ locale: 'en-US' }), fake = fakeSource({ values: true })) => {
  const m = sourceRows<Row>(fake.source as DataSource<Row>).create({ getRowId: (r) => r.id, columns: createColumnModel<Row>(DEFS), ctx, abort: fake.abort });
  return { m, ...fake };
};
const vals = (h: ValuesHandle) => h.result!.values.map((v) => [v.value, v.label, v.count, ...(v.selected ? ['selected'] : [])]);

describe('the search reads the value as well as the label', () => {
  it('in the browser: a number labelled in Arabic-Indic digits is found by its value', () => {
    const m = browser([{ n: 1234.5 }, { n: 7 }], AR_EG);
    const h = m.setValues('n', { search: '1234' });
    expect(h.result!.values.map((v) => v.value)).toEqual(['1234.5']);
  });

  it('a ticked number with no row is found by its value too, in the browser and on a server', () => {
    const m = browser([{ n: 7 }], AR_EG);
    m.setQuery(makeQuery({ filter: { n: { type: 'set', include: ['1234.5'] } } }));
    expect(m.setValues('n', { search: '1234' }).result!.values.map((v) => [v.value, v.selected])).toEqual([['1234.5', true]]);
    const s = server(AR_EG);
    s.m.setQuery(makeQuery({ filter: { n: { type: 'set', include: ['1234.5'] } } }));
    const h = s.m.setValues!('n', { search: '1234' });
    s.lastValues().resolve([]);
    expect(h.result!.values.map((v) => [v.value, v.selected])).toEqual([['1234.5', true]]);
  });

  it('a word never matches across the label and the value: "ep" finds nothing in Pomme / p, "ez" nothing in zèbre', () => {
    const m = browser([{ e: 'p', s: 'zèbre' }]);
    expect(m.setValues('e', { search: 'ep' }).result!.values).toEqual([]);
    expect(m.setValues('s', { search: 'ez' }).result!.values).toEqual([]);
    expect(m.setValues('e', { search: 'pom p' }).result!.values.map((v) => v.value)).toEqual(['p']);
  });
});

describe('a server list follows the language for the ticked values it adds', () => {
  it('a ticked number the server lacks is labelled again when the language changes, and told once', () => {
    const s = server();
    s.m.setQuery(makeQuery({ filter: { n: { type: 'set', include: ['1234.5'] } } }));
    const h = s.m.setValues!('n');
    s.lastValues().resolve([{ value: '7', count: 1 }]);
    expect(vals(h)).toEqual([['1234.5', '1,234.5', 0, 'selected'], ['7', '7', 1]]);
    let told = 0;
    h.subscribe(() => told++);
    s.m.setContext(localeCtx({ locale: 'fr-FR' }));
    expect(s.valueCalls.length).toBe(1);
    expect(vals(h)).toEqual([['1234.5', '1 234,5', 0, 'selected'], ['7', '7', 1]]);
    expect(told).toBe(1);
  });
});

describe('a source that settles twice (its bug)', () => {
  it('the first answer stands: a second resolve or a reject after it changes nothing', () => {
    let fire: ((v: unknown) => void)[] = [];
    let fail: ((e: unknown) => void)[] = [];
    const fake = fakeSource({ valuesReply: () => ({ then(ok: (v: unknown) => void, err: (e: unknown) => void) { fire.push(ok); fail.push(err); } }) });
    const s = server(undefined, fake);
    const h = s.m.setValues!('s');
    fire[0]!([{ value: 'first' }]);
    const first = h.result;
    let told = 0;
    h.subscribe(() => told++);
    fire[0]!([{ value: 'second' }]);
    fail[0]!(new Error('late'));
    expect([h.status, h.result, told]).toEqual(['idle', first, 0]);
    fire = [];
    fail = [];
  });

  it('a source that answers a values request synchronously from inside a listener does not loop', () => {
    // Each answer differs (its count), so each one is told: the listener runs on every change.
    let n = 0;
    const fake = fakeSource({ valuesReply: (req) => [{ value: `v-${req.search}`, count: ++n }] });
    const s = server(undefined, fake);
    const h = s.m.setValues!('s');
    // A listener that searches again on every change: one more request, then quiet.
    h.subscribe(() => h.search('x'));
    h.refresh();
    expect(s.valueCalls.length).toBeLessThanOrEqual(3);
    expect(vals(h)).toEqual([['v-x', 'v-x', 3]]);
  });
});

describe('the browser list after a model change that reruns nothing', () => {
  it('a language change with no filter nor sort relabels the list', () => {
    const m = browser([{ n: 1234.5 }]);
    const h = m.setValues('n');
    let told = 0;
    h.subscribe(() => told++);
    m.setContext(localeCtx({ locale: 'fr-FR' }));
    expect([vals(h), told]).toEqual([[['1234.5', '1 234,5', 1]], 1]);
  });

  it('a second handle with another cap on the same column is cut at its own cap', () => {
    const m = browser([{ s: 'a' }, { s: 'b' }, { s: 'c' }]);
    expect(m.setValues('s', { max: 1 }).result!.values.length).toBe(1);
    expect(m.setValues('s', { max: 2 }).result!.values.length).toBe(2);
    expect(m.setValues('s').result!.truncated).toBe(false);
  });
});

describe('a server list\'s problems belong to its last answer', () => {
  it('a warning from one answer is gone after a failure or a clean answer', () => {
    const s = server();
    const h = s.m.setValues!('s');
    s.lastValues().resolve([{ value: 'a', count: -1 }]);
    expect(h.problems.map((p) => p.path)).toEqual(['response.values[0].count']);
    h.refresh();
    s.lastValues().reject(new Error('down'));
    expect([h.status, h.problems]).toEqual(['error', []]);
    h.refresh();
    s.lastValues().resolve([{ value: 'a', count: 1 }]);
    expect([h.status, h.problems, h.failure]).toEqual(['idle', [], undefined]);
  });
});
