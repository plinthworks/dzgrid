import { describe, it, expect } from 'vitest';
import { createColumnModel, localeCtx, numberCodec, textCodec, type ColumnDef, type FilterModel, type LocaleCtx } from '@dzgrid/core';
import { toWire, type Json, type WireKind } from '@dzgrid/core/server';

/** Spec: docs/behaviors/server-filter.md. Every expected value below is written by hand. */
type Row = Record<string, unknown>;
const DEFS: ColumnDef<Row>[] = [
  { id: 's' },
  { id: 'e', type: 'enum', enumOptions: [{ value: 'a' }, { value: 'b' }] } as ColumnDef<Row>,
  { id: 'n', type: 'number' },
  { id: 'd', type: 'day' },
  { id: 't', type: 'instant' },
  { id: 'b', type: 'boolean' },
  { id: 'h', hidden: true },
  { id: 'x', filter: false },
  // A custom type whose keys are text: text filters apply to it.
  { id: 'c', type: 'custom', codec: { ...textCodec, kind: 'custom' } } as ColumnDef<Row>,
  { id: 'cn', type: 'custom', codec: { ...numberCodec, kind: 'custom' } } as ColumnDef<Row>,
];
const ALG = localeCtx({ locale: 'fr-FR', timeZone: 'Africa/Algiers' });

function wire(filter: unknown, o: { ctx?: LocaleCtx; kinds?: Record<string, WireKind>; defs?: ColumnDef<Row>[] } = {}) {
  const r = toWire(filter as FilterModel, {
    ctx: o.ctx ?? ALG,
    columns: createColumnModel<Row>(o.defs ?? DEFS),
    ...(o.kinds && { kinds: (name: string) => o.kinds![name] }),
  });
  return { filter: r.filter as unknown, problems: r.problems.map((p) => [p.code, p.path]), raw: r };
}
/** The filter sent and the problems, nothing else. */
const quiet = (filter: unknown, o?: Parameters<typeof wire>[1]) => {
  const w = wire(filter, o);
  return { filter: w.filter, problems: w.problems };
};
/** One column's wire form, or undefined when dropped. */
const one = (col: string, f: unknown, o?: Parameters<typeof wire>[1]) => (wire({ [col]: f }, o).filter as Record<string, unknown>)[col];
const probs = (col: string, f: unknown, o?: Parameters<typeof wire>[1]) => wire({ [col]: f }, o).problems;

describe('toWire: common rules', () => {
  it('drops an unknown column with unknown-column, and a column with filter: false with invalid-filter', () => {
    const w = wire({ gone: { type: 'text', op: 'contains', value: 'a' }, x: { type: 'text', op: 'contains', value: 'a' } });
    expect(w.filter).toEqual({});
    expect(w.problems).toEqual([['unknown-column', 'filter.gone'], ['invalid-filter', 'filter.x']]);
    expect(w.raw.problems.every((p) => p.severity === 'error')).toBe(true);
  });

  it('sends a hidden column’s filter', () => {
    expect(one('h', { type: 'text', op: 'contains', value: 'a' })).toEqual({ type: 'text', op: 'contains', value: 'a' });
  });

  it('refuses a filter that is not an object, or of an unknown type', () => {
    expect(probs('s', null)).toEqual([['invalid-filter', 'filter.s']]);
    expect(probs('s', 'contains')).toEqual([['invalid-filter', 'filter.s']]);
    expect(probs('s', { type: 'regex', value: 'a' })).toEqual([['invalid-filter', 'filter.s']]);
  });

  it('reads no model, or an empty one, as no filter', () => {
    expect(wire(undefined).filter).toEqual({});
    expect(wire(null).filter).toEqual({});
    expect(wire({}).filter).toEqual({});
  });

  it('sends nothing but the fields of its kind: extra keys are not passed on', () => {
    expect(one('s', { type: 'text', op: 'contains', value: 'a', secret: 'x', valueTo: 'z' })).toEqual({ type: 'text', op: 'contains', value: 'a' });
    expect(one('n', { type: 'number', op: 'gt', value: 1, valueTo: 9, extra: true })).toEqual({ type: 'number', op: 'gt', value: 1 });
  });

  it('survives a JSON round trip unchanged', () => {
    const f = {
      s: { type: 'text', op: 'startsWith', value: 'Ab', caseSensitive: true },
      n: { type: 'number', op: 'between', value: 3, valueTo: 1 },
      d: { type: 'day', op: 'lte', value: '2026-03-05' },
      t: { type: 'instant', op: 'betweenDays', day: '2026-03-05', dayTo: '2026-03-06' },
      b: { type: 'boolean', value: false },
      e: { type: 'set', exclude: ['a'], blanks: 'exclude' },
      h: { type: 'combined', join: 'or', conditions: [{ type: 'text', op: 'equals', value: 'x' }, { type: 'text', op: 'blank' }] },
    };
    const w = wire(f).filter;
    expect(JSON.parse(JSON.stringify(w))).toEqual(w);
    expect(w).toEqual({
      s: { type: 'text', op: 'startsWith', value: 'Ab', caseSensitive: true },
      n: { type: 'number', op: 'between', value: 1, valueTo: 3 },
      d: { type: 'day', op: 'lte', value: '2026-03-05' },
      t: {
        type: 'instant', op: 'betweenDays', day: '2026-03-05', dayTo: '2026-03-06',
        resolved: { from: '2026-03-04T23:00:00.000Z', to: '2026-03-06T23:00:00.000Z' }, zone: 'Africa/Algiers',
      },
      b: { type: 'boolean', value: false },
      e: { type: 'set', exclude: ['a'], blanks: 'exclude' },
      h: { type: 'combined', join: 'or', conditions: [{ type: 'text', op: 'equals', value: 'x' }, { type: 'text', op: 'blank' }] },
    });
  });

  it('never throws, whatever the model holds', () => {
    const junk: unknown[] = [0, true, [], { type: 'number' }, { type: 'instant', op: 'onDay', day: 5 }, { type: 'combined', join: 'and' }, { type: 'set', include: 'a' }];
    for (const j of junk) for (const c of ['s', 'n', 'd', 't', 'b', 'e']) expect(() => wire({ [c]: j })).not.toThrow();
  });
});

describe('toWire: text', () => {
  it('sends the value as typed, not folded, and caseSensitive only when true', () => {
    expect(one('s', { type: 'text', op: 'contains', value: 'Éric ' })).toEqual({ type: 'text', op: 'contains', value: 'Éric ' });
    expect(one('s', { type: 'text', op: 'equals', value: 'Ab', caseSensitive: false })).toEqual({ type: 'text', op: 'equals', value: 'Ab' });
    expect(one('s', { type: 'text', op: 'notEqual', value: 'Ab', caseSensitive: true })).toEqual({ type: 'text', op: 'notEqual', value: 'Ab', caseSensitive: true });
  });

  it('drops an empty box with no problem; blank and notBlank carry no value', () => {
    for (const op of ['contains', 'notContains', 'equals', 'notEqual', 'startsWith', 'endsWith']) {
      expect(quiet({ s: { type: 'text', op, value: '' } })).toEqual({ filter: {}, problems: [] });
      expect(quiet({ s: { type: 'text', op } })).toEqual({ filter: {}, problems: [] });
    }
    expect(one('s', { type: 'text', op: 'blank', value: 'x', caseSensitive: true })).toEqual({ type: 'text', op: 'blank' });
    expect(one('s', { type: 'text', op: 'notBlank' })).toEqual({ type: 'text', op: 'notBlank' });
  });

  it('applies to text and enum columns only; an unknown op or a non-string value is refused where it is', () => {
    expect(one('e', { type: 'text', op: 'contains', value: 'a' })).toEqual({ type: 'text', op: 'contains', value: 'a' });
    expect(one('c', { type: 'text', op: 'contains', value: 'a' })).toEqual({ type: 'text', op: 'contains', value: 'a' });
    expect(probs('cn', { type: 'text', op: 'contains', value: '1' })).toEqual([['invalid-filter', 'filter.cn']]);
    expect(probs('n', { type: 'text', op: 'contains', value: '1' })).toEqual([['invalid-filter', 'filter.n']]);
    expect(probs('s', { type: 'text', op: 'like', value: 'a' })).toEqual([['invalid-filter', 'filter.s.op']]);
    expect(probs('s', { type: 'text', op: 'contains', value: 1 })).toEqual([['invalid-filter', 'filter.s.value']]);
    // Checked before blank, as in the browser.
    expect(probs('s', { type: 'text', op: 'blank', value: 1 })).toEqual([['invalid-filter', 'filter.s.value']]);
  });
});

describe('toWire: number', () => {
  it('refuses NaN and the infinities, at the field', () => {
    for (const v of [Number.NaN, Infinity, -Infinity, '3', null]) {
      expect(probs('n', { type: 'number', op: 'equals', value: v })).toEqual([['invalid-filter', 'filter.n.value']]);
      expect(probs('n', { type: 'number', op: 'between', value: 1, valueTo: v })).toEqual([['invalid-filter', 'filter.n.valueTo']]);
    }
  });

  it('orders a between, inclusive; sends valueTo with between only', () => {
    expect(one('n', { type: 'number', op: 'between', value: 9, valueTo: -2.5 })).toEqual({ type: 'number', op: 'between', value: -2.5, valueTo: 9 });
    expect(one('n', { type: 'number', op: 'between', value: 0, valueTo: 0 })).toEqual({ type: 'number', op: 'between', value: 0, valueTo: 0 });
    for (const op of ['equals', 'notEqual', 'lt', 'lte', 'gt', 'gte']) {
      expect(one('n', { type: 'number', op, value: 4, valueTo: 1 })).toEqual({ type: 'number', op, value: 4 });
    }
  });

  it('drops a half-typed number with no problem', () => {
    expect(quiet({ n: { type: 'number', op: 'between', value: 3 } })).toEqual({ filter: {}, problems: [] });
    expect(quiet({ n: { type: 'number', op: 'between', valueTo: 3 } })).toEqual({ filter: {}, problems: [] });
    expect(quiet({ n: { type: 'number', op: 'gt', valueTo: 3 } })).toEqual({ filter: {}, problems: [] });
  });

  it('blank ops carry nothing; a number filter on another column type or an unknown op is refused', () => {
    expect(one('n', { type: 'number', op: 'blank', value: Number.NaN })).toEqual({ type: 'number', op: 'blank' });
    expect(probs('s', { type: 'number', op: 'gt', value: 1 })).toEqual([['invalid-filter', 'filter.s']]);
    expect(probs('n', { type: 'number', op: 'near', value: 1 })).toEqual([['invalid-filter', 'filter.n.op']]);
  });
});

describe('toWire: day', () => {
  it('keeps civil days, no zone, never an instant; between in order', () => {
    const ctx = localeCtx({ locale: 'en-US', timeZone: 'Pacific/Kiritimati' });
    expect(one('d', { type: 'day', op: 'equals', value: '2026-03-05' }, { ctx })).toEqual({ type: 'day', op: 'equals', value: '2026-03-05' });
    expect(one('d', { type: 'day', op: 'between', value: '2026-12-31', valueTo: '2026-01-01' })).toEqual({ type: 'day', op: 'between', value: '2026-01-01', valueTo: '2026-12-31' });
    expect(one('d', { type: 'day', op: 'between', value: '2026-01-02', valueTo: '2026-01-10' })).toEqual({ type: 'day', op: 'between', value: '2026-01-02', valueTo: '2026-01-10' });
    expect(one('d', { type: 'day', op: 'notBlank' })).toEqual({ type: 'day', op: 'notBlank' });
  });

  it('refuses a day that is not one with invalid-day, first, at its field', () => {
    expect(probs('d', { type: 'day', op: 'equals', value: '2026-02-29' })).toEqual([['invalid-day', 'filter.d.value']]);
    expect(probs('d', { type: 'day', op: 'between', value: '2026-02-01', valueTo: '2026-13-01' })).toEqual([['invalid-day', 'filter.d.valueTo']]);
    expect(probs('d', { type: 'day', op: 'between', value: '5 mars', valueTo: '2026-13-01' })).toEqual([['invalid-day', 'filter.d.value']]);
    // Before the op, as in the browser.
    expect(probs('d', { type: 'day', op: 'blank', value: 20260305 })).toEqual([['invalid-day', 'filter.d.value']]);
    expect(probs('d', { type: 'day', op: 'near', value: '2026-03-05' })).toEqual([['invalid-filter', 'filter.d.op']]);
    expect(probs('t', { type: 'day', op: 'equals', value: '2026-03-05' })).toEqual([['invalid-filter', 'filter.t']]);
  });

  it('drops a half-typed day range', () => {
    expect(quiet({ d: { type: 'day', op: 'between', value: '2026-03-05' } })).toEqual({ filter: {}, problems: [] });
  });
});

describe('toWire: instant', () => {
  const at = (f: Record<string, unknown>, ctx: LocaleCtx = ALG) => one('t', { type: 'instant', ...f }, { ctx }) as { resolved: { from: string | null; to: string | null }; zone: string } | undefined;

  it('resolves each range op to half-open UTC bounds with three digits of milliseconds, with the zone', () => {
    expect(at({ op: 'onDay', day: '2026-03-05' })).toEqual({
      type: 'instant', op: 'onDay', day: '2026-03-05',
      resolved: { from: '2026-03-04T23:00:00.000Z', to: '2026-03-05T23:00:00.000Z' }, zone: 'Africa/Algiers',
    });
    expect(at({ op: 'after', day: '2026-03-05' })!.resolved).toEqual({ from: '2026-03-05T23:00:00.000Z', to: null });
    expect(at({ op: 'before', at: '2026-03-05T10:00:00.5+01:00' })!.resolved).toEqual({ from: null, to: '2026-03-05T09:00:00.500Z' });
    expect(at({ op: 'after', at: '2026-03-05T10:00:00Z' })!.resolved).toEqual({ from: '2026-03-05T10:00:00.001Z', to: null });
    expect(at({ op: 'between', at: '2026-03-05T12:00:00Z', atTo: '2026-03-05T10:00:00.010Z' })!.resolved).toEqual({ from: '2026-03-05T10:00:00.010Z', to: '2026-03-05T12:00:00.000Z' });
  });

  it('sends the fields the op reads, as given: a moment wins over a day for before and after', () => {
    expect(at({ op: 'before', at: '2026-03-05T10:00:00Z', day: '2026-03-01' })).toEqual({
      type: 'instant', op: 'before', at: '2026-03-05T10:00:00Z', resolved: { from: null, to: '2026-03-05T10:00:00.000Z' }, zone: 'Africa/Algiers',
    });
    expect(at({ op: 'onDay', day: '2026-03-05', at: '2026-03-05T10:00:00Z', dayTo: '2026-03-09' })).toEqual({
      type: 'instant', op: 'onDay', day: '2026-03-05', resolved: { from: '2026-03-04T23:00:00.000Z', to: '2026-03-05T23:00:00.000Z' }, zone: 'Africa/Algiers',
    });
    expect(at({ op: 'betweenDays', day: '2026-03-06', dayTo: '2026-03-05' })).toEqual({
      type: 'instant', op: 'betweenDays', day: '2026-03-06', dayTo: '2026-03-05',
      resolved: { from: '2026-03-04T23:00:00.000Z', to: '2026-03-06T23:00:00.000Z' }, zone: 'Africa/Algiers',
    });
    expect(at({ op: 'between', at: 0, atTo: '1970-01-01T00:00:01Z' })).toEqual({
      type: 'instant', op: 'between', at: 0, atTo: '1970-01-01T00:00:01Z',
      resolved: { from: '1970-01-01T00:00:00.000Z', to: '1970-01-01T00:00:01.000Z' }, zone: 'Africa/Algiers',
    });
  });

  it('writes moments before 1970 and at the ends of the years 0000–9999', () => {
    expect(at({ op: 'before', at: '1969-12-31T23:59:59.999Z' })!.resolved.to).toBe('1969-12-31T23:59:59.999Z');
    expect(at({ op: 'before', at: '0000-01-01T00:00:00Z' })!.resolved.to).toBe('0000-01-01T00:00:00.000Z');
    expect(at({ op: 'before', at: '9999-12-31T23:59:59.999Z' })!.resolved.to).toBe('9999-12-31T23:59:59.999Z');
    expect(at({ op: 'after', at: '0000-02-29T23:59:59.998Z' })!.resolved.from).toBe('0000-02-29T23:59:59.999Z');
    expect(at({ op: 'after', at: -1 })!.resolved.from).toBe('1970-01-01T00:00:00.000Z');
  });

  it('writes a fractional-millisecond bound rounded up: the same whole-millisecond rows', () => {
    // before 1000.5 keeps 1000 and not 1001; between [999.2, 1000.5) keeps 1000 only.
    expect(at({ op: 'before', at: 1000.5 })!.resolved.to).toBe('1970-01-01T00:00:01.001Z');
    expect(at({ op: 'between', at: 999.2, atTo: 1000.5 })!.resolved).toEqual({ from: '1970-01-01T00:00:01.000Z', to: '1970-01-01T00:00:01.001Z' });
    expect(at({ op: 'after', at: 999.2 })!.resolved.from).toBe('1970-01-01T00:00:01.000Z');
  });

  it('refuses a bound outside the years 0000–9999 at .resolved', () => {
    expect(probs('t', { type: 'instant', op: 'after', at: '9999-12-31T23:59:59.999Z' })).toEqual([['invalid-instant', 'filter.t.resolved']]);
    expect(probs('t', { type: 'instant', op: 'before', at: -62167219200001 })).toEqual([['invalid-instant', 'filter.t.resolved']]);
    // 1 January of year 0 begins on 31 December of year -1 in UTC, east of Greenwich.
    const kol = localeCtx({ locale: 'en-US', timeZone: 'Asia/Kolkata' });
    expect(probs('t', { type: 'instant', op: 'onDay', day: '0000-01-01' }, { ctx: kol })).toEqual([['invalid-instant', 'filter.t.resolved']]);
    // One problem for the filter, even when both ends are out.
    expect(probs('t', { type: 'instant', op: 'between', at: -8.64e15, atTo: 8.64e15 })).toEqual([['invalid-instant', 'filter.t.resolved']]);
    // The open end is not a bound: before the end of 9999 is fine.
    expect(at({ op: 'betweenDays', day: '9999-12-30', dayTo: '9999-12-31' }, localeCtx({ locale: 'en-US', timeZone: 'Asia/Kolkata' }))!.resolved).toEqual({
      from: '9999-12-29T18:30:00.000Z', to: '9999-12-31T18:30:00.000Z',
    });
  });

  it('gives an empty range for a skipped day, sent as from == to', () => {
    const apia = localeCtx({ locale: 'en-US', timeZone: 'Pacific/Apia' });
    expect(at({ op: 'onDay', day: '2011-12-30' }, apia)!.resolved).toEqual({ from: '2011-12-30T10:00:00.000Z', to: '2011-12-30T10:00:00.000Z' });
  });

  it('follows the zone of the context', () => {
    const paris = localeCtx({ locale: 'fr-FR', timeZone: 'Europe/Paris' });
    expect(at({ op: 'onDay', day: '2026-03-29' }, paris)).toMatchObject({ resolved: { from: '2026-03-28T23:00:00.000Z', to: '2026-03-29T22:00:00.000Z' }, zone: 'Europe/Paris' });
  });

  it('sends blank ops alone; refuses the bad and drops the half-typed as the browser does', () => {
    expect(at({ op: 'blank', day: 'nonsense' })).toEqual({ type: 'instant', op: 'blank' });
    expect(probs('t', { type: 'instant', op: 'before', at: '2026-03-05T10:00' })).toEqual([['ambiguous-instant', 'filter.t.at']]);
    expect(probs('t', { type: 'instant', op: 'before', at: 'soon' })).toEqual([['invalid-instant', 'filter.t.at']]);
    expect(probs('t', { type: 'instant', op: 'onDay', day: '2026-02-30' })).toEqual([['invalid-day', 'filter.t.day']]);
    // A field the op does not read is still checked.
    expect(probs('t', { type: 'instant', op: 'onDay', day: '2026-03-05', atTo: 'x' })).toEqual([['invalid-instant', 'filter.t.atTo']]);
    expect(probs('t', { type: 'instant', op: 'around', day: '2026-03-05' })).toEqual([['invalid-filter', 'filter.t.op']]);
    expect(probs('d', { type: 'instant', op: 'onDay', day: '2026-03-05' })).toEqual([['invalid-filter', 'filter.d']]);
    for (const f of [{ op: 'onDay' }, { op: 'betweenDays', day: '2026-03-05' }, { op: 'between', at: '2026-03-05T10:00:00Z' }, { op: 'before' }, { op: 'after' }]) {
      expect(quiet({ t: { type: 'instant', ...f } })).toEqual({ filter: {}, problems: [] });
    }
  });
});

describe('toWire: boolean and set', () => {
  it('sends a boolean, drops null, refuses anything else', () => {
    expect(one('b', { type: 'boolean', value: true })).toEqual({ type: 'boolean', value: true });
    expect(one('b', { type: 'boolean', value: false })).toEqual({ type: 'boolean', value: false });
    expect(quiet({ b: { type: 'boolean', value: null } })).toEqual({ filter: {}, problems: [] });
    expect(quiet({ b: { type: 'boolean' } })).toEqual({ filter: {}, problems: [] });
    expect(probs('b', { type: 'boolean', value: 'yes' })).toEqual([['invalid-filter', 'filter.b.value']]);
    expect(probs('s', { type: 'boolean', value: true })).toEqual([['invalid-filter', 'filter.s']]);
  });

  it('passes a value list through; keeps include []; refuses both lists or a bad list', () => {
    expect(one('e', { type: 'set', include: [] })).toEqual({ type: 'set', include: [] });
    expect(one('e', { type: 'set', include: ['a', 'b'], blanks: 'include' })).toEqual({ type: 'set', include: ['a', 'b'], blanks: 'include' });
    expect(one('n', { type: 'set', exclude: ['1'] })).toEqual({ type: 'set', exclude: ['1'] });
    expect(probs('e', { type: 'set', include: ['a'], exclude: ['b'] })).toEqual([['invalid-filter', 'filter.e']]);
    expect(probs('e', { type: 'set', include: [], exclude: [] })).toEqual([['invalid-filter', 'filter.e']]);
    expect(probs('e', { type: 'set', include: 'a' })).toEqual([['invalid-filter', 'filter.e']]);
    expect(probs('e', { type: 'set', exclude: ['a', 1] })).toEqual([['invalid-filter', 'filter.e']]);
    expect(probs('e', { type: 'set', include: ['a'], blanks: 'maybe' })).toEqual([['invalid-filter', 'filter.e.blanks']]);
    expect(quiet({ e: { type: 'set', blanks: 'exclude' } })).toEqual({ filter: {}, problems: [] });
  });
});

describe('toWire: combined', () => {
  const txt = (value: string) => ({ type: 'text', op: 'contains', value });
  it('keeps the structure, drops half-typed members, keeps one live member combined', () => {
    expect(one('s', { type: 'combined', join: 'or', conditions: [txt('a'), txt(''), txt('b')] })).toEqual({ type: 'combined', join: 'or', conditions: [txt('a'), txt('b')] });
    expect(one('s', { type: 'combined', join: 'and', conditions: [txt(''), txt('b')] })).toEqual({ type: 'combined', join: 'and', conditions: [txt('b')] });
    expect(quiet({ s: { type: 'combined', join: 'and', conditions: [txt(''), { type: 'text', op: 'equals' }] } })).toEqual({ filter: {}, problems: [] });
    expect(quiet({ s: { type: 'combined', join: 'and', conditions: [] } })).toEqual({ filter: {}, problems: [] });
  });

  it('drops the whole filter for one bad member, with every member’s problem', () => {
    const w = wire({ n: { type: 'combined', join: 'or', conditions: [{ type: 'number', op: 'gt', value: 'x' }, { type: 'number', op: 'lt', value: 1 }, { type: 'text', op: 'contains', value: 'a' }] } });
    expect(w.filter).toEqual({});
    expect(w.problems).toEqual([['invalid-filter', 'filter.n.conditions[0].value'], ['invalid-filter', 'filter.n.conditions[2]']]);
  });

  it('nests to depth 3 at most, as in the browser', () => {
    const two = { type: 'combined', join: 'or', conditions: [{ type: 'combined', join: 'and', conditions: [txt('a')] }] };
    expect(one('s', two)).toEqual(two);
    const three = { type: 'combined', join: 'or', conditions: [{ type: 'combined', join: 'and', conditions: [{ type: 'combined', join: 'and', conditions: [txt('a')] }] }] };
    expect(probs('s', three)).toEqual([['invalid-filter', 'filter.s.conditions[0].conditions[0]']]);
  });

  it('refuses a bad join or conditions that are not a list', () => {
    expect(probs('s', { type: 'combined', join: 'xor', conditions: [txt('a')] })).toEqual([['invalid-filter', 'filter.s']]);
    expect(probs('s', { type: 'combined', join: 'and', conditions: txt('a') })).toEqual([['invalid-filter', 'filter.s']]);
  });

  it('resolves instants inside a combination', () => {
    expect(one('t', { type: 'combined', join: 'or', conditions: [{ type: 'instant', op: 'onDay', day: '2026-03-05' }, { type: 'instant', op: 'blank' }] })).toEqual({
      type: 'combined', join: 'or', conditions: [
        { type: 'instant', op: 'onDay', day: '2026-03-05', resolved: { from: '2026-03-04T23:00:00.000Z', to: '2026-03-05T23:00:00.000Z' }, zone: 'Africa/Algiers' },
        { type: 'instant', op: 'blank' },
      ],
    });
  });
});

describe('toWire: custom kinds', () => {
  const seen: unknown[] = [];
  const kinds: Record<string, WireKind> = {
    plain: { read: (s) => s, active: (s) => s !== null },
    shout: { read: (s) => (typeof s === 'string' ? s : 'invalid'), active: (s) => s !== '', wire: (s, ctx, zone) => { seen.push([s, ctx.locale, zone]); return { q: String(s).toUpperCase(), zone }; }, types: ['text', 'enum'] },
    boom: { read: (s) => s, active: () => true, wire: () => { throw new Error('no'); } },
    readBoom: { read: () => { throw new Error('no'); }, active: () => true },
  };
  const custom = (kind: string, state: unknown) => ({ type: 'custom', kind, state });

  it('sends the state as the value by default, the wire form when the kind has one', () => {
    expect(one('n', custom('plain', { lo: 1, hi: [2, 'x', null, true] }), { kinds })).toEqual({ type: 'custom', kind: 'plain', value: { lo: 1, hi: [2, 'x', null, true] } });
    seen.length = 0;
    expect(one('s', custom('shout', 'abc'), { kinds })).toEqual({ type: 'custom', kind: 'shout', value: { q: 'ABC', zone: 'Africa/Algiers' } });
    expect(seen).toEqual([['abc', 'fr-FR', 'Africa/Algiers']]);
  });

  it('sends the state as read: a kind that tidies its state sends the tidy one', () => {
    const k: Record<string, WireKind> = { range: { read: (s) => { const [a, b] = s as number[]; return a! <= b! ? [a!, b!] : [b!, a!]; }, active: () => true } };
    expect(one('n', custom('range', [5, 1]), { kinds: k })).toEqual({ type: 'custom', kind: 'range', value: [1, 5] });
  });

  it('drops an inactive state with no problem', () => {
    expect(quiet({ s: custom('shout', '') }, { kinds })).toEqual({ filter: {}, problems: [] });
    expect(quiet({ n: custom('plain', null) }, { kinds })).toEqual({ filter: {}, problems: [] });
  });

  it('refuses with invalid-filter and a detail: unknown kind, refused state, column type, throws', () => {
    const cases: [string, unknown, Parameters<typeof wire>[1]][] = [
      ['n', custom('nope', 1), { kinds }],
      ['n', custom('plain', 1), {}],
      ['s', custom('shout', 5), { kinds }],
      ['n', custom('shout', 'abc'), { kinds }],
      ['n', custom('boom', 1), { kinds }],
      ['n', custom('readBoom', 1), { kinds }],
      ['n', { type: 'custom', kind: 5, state: 1 }, { kinds }],
    ];
    for (const [col, f, o] of cases) {
      const w = wire({ [col]: f }, o);
      expect(w.filter, JSON.stringify(f)).toEqual({});
      expect(w.problems).toEqual([['invalid-filter', `filter.${col}`]]);
      expect(w.raw.problems[0]!.detail).toEqual(expect.any(String));
    }
  });

  it('refuses a wire form that is not JSON', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    class Box { v = 1; }
    let deep: unknown = 1;
    for (let i = 0; i < 21; i++) deep = [deep];
    const bad: unknown[] = [undefined, Number.NaN, Infinity, () => 1, cyclic, new Box(), { a: undefined }, [1, undefined], deep, Symbol('s'), 10n, { m: new Map() }];
    for (const v of bad) {
      const k: Record<string, WireKind> = { k: { read: (s) => s, active: () => true, wire: () => v as Json } };
      expect(probs('n', custom('k', 1), { kinds: k }), String(typeof v)).toEqual([['invalid-filter', 'filter.n']]);
    }
    // A state that is not JSON is refused too when there is no wire function.
    expect(probs('n', custom('plain', { f: () => 1 }), { kinds })).toEqual([['invalid-filter', 'filter.n']]);
  });

  it('accepts JSON up to depth 20, null-prototype objects included', () => {
    let deep: unknown = 1;
    for (let i = 0; i < 20; i++) deep = [deep];
    const bare = Object.assign(Object.create(null), { a: [-0.5, 'é'] });
    for (const v of [deep, bare, null, false, '', 0, [], {}]) {
      const k: Record<string, WireKind> = { k: { read: (s) => s, active: () => true, wire: () => v as Json } };
      expect(one('n', custom('k', 1), { kinds: k })).toEqual({ type: 'custom', kind: 'k', value: v });
    }
  });

  it('is refused by the browser until filter kinds are wired (step 8)', async () => {
    const { compileFilter } = await import('@dzgrid/core/internal');
    const { createRowStore, ColumnCache } = await import('@dzgrid/core/internal');
    const { NO_OVERLAY } = await import('@dzgrid/core');
    const store = createRowStore<Row>((r) => String(r.id));
    const f = compileFilter({ n: custom('plain', 1) } as unknown as FilterModel, { source: store.snapshot, columns: createColumnModel<Row>(DEFS), ctx: ALG, reader: NO_OVERLAY, cache: new ColumnCache<Row>() });
    expect(f.problems.map((p) => [p.code, p.path])).toEqual([['invalid-filter', 'filter.n']]);
  });
});
