/**
 * Coverage found missing by the mutation run over Phase 1 steps 1–8 (175
 * mutants; the test analyst's probe file, expectations written by hand).
 * Each line kills at least one mutant that survived the rest of the suite.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { it, expect } from 'vitest';
import * as P from '@dzgrid/core';
import * as I from '@dzgrid/core/internal';
const C = { ...P, ...I };
const { localeCtx, readNumber, readInstant, parseInstant, parseDay, createRowStore, createColumnModel, ColumnCache, NO_OVERLAY, sortIndices, resolveColumns, compilePath, enumCodec, fold, instantCodec, formattersFor, flatDisplayed, REJECTED, instantToDayIn, resolveWall } = C as any;
const en = localeCtx({ locale: 'en-US' }); const fr = localeCtx({ locale: 'fr-FR', timeZone: 'Europe/Paris' }); const de = localeCtx({ locale: 'de-DE' });
it('number', () => {
  expect(readNumber('+5', en)).toBe(5);
  expect(readNumber('12,5\u202f%', fr)).toBe(0.125);
  expect(readNumber('12,5 %', fr)).toBe(0.125);
  expect(readNumber('1.5E3', en)).toBe(1500);
  expect(readNumber('1e-3', en)).toBe(0.001);
  expect(readNumber('1.234,567,8', en)).toBeNull();
  expect(readNumber('1.234.567', en)).toBeNull();
  expect(readNumber('1,234,567', fr)).toBeNull();
  expect(readNumber('1234,567', en)).toBeNull();
  expect(readNumber(',234', en)).toBeNull();
  expect(Object.is(readNumber('-0', en), 0)).toBe(true);
  expect(Object.is(C.readMachineNumber('-0'), 0)).toBe(true);
  expect(readNumber('1.234.567', fr)).toBe(1234567);
});
it('zone', () => {
  const later = readInstant('2026-03-29T02:30', { assumeZone: 'Europe/Paris', disambiguation: 'later' });
  expect(later).toEqual({ ok: true, value: parseInstant('2026-03-29T01:30Z'), warning: 'wall-time-skipped' });
  expect(instantToDayIn(parseInstant('0000-06-01T00:00Z'), 'UTC')).toBe('0000-06-01');
  expect(parseDay('2026-0:-05')).toBeNull();
  expect(parseDay('2026-03-0:')).toBeNull();
});
it('instant', () => {
  expect(parseInstant('1970-01-01T00:00:00.5Z')).toBe(500);
  expect(parseInstant('1970-01-01T00:00:00,25Z')).toBe(250);
  expect(readInstant('1970-01-01T00:00+01:60')).toEqual({ ok: false, code: 'invalid-instant' });
  expect(parseInstant('1970-01-01t00:00z')).toBe(0);
  const c = instantCodec();
  expect(c.parse('29/03/2026 02:30', fr)).toBe(REJECTED);
  expect(c.parse('25/10/2026 02:30', fr)).toBe(REJECTED);
  expect(c.parse('05/03/2026 24:00', fr)).toBe(REJECTED);
  expect(c.parse('05/03/2026 10:00', fr)).toBe(parseInstant('2026-03-05T09:00Z'));
});
it('store', () => {
  const s = createRowStore((r: any) => r.id);
  s.replaceAll([{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 3 }]);
  let r = s.apply({ add: [{ id: 'x', v: 1 }, { id: 'x', v: 2 }] });
  expect(s.snapshot.ids).toEqual(['a', 'b', 'c', 'x']);
  expect(s.snapshot.rows[3].v).toBe(1);
  expect(r.problems.map((p: any) => [p.code, p.path])).toEqual([['duplicate-row-id', 'add[1]']]);
  r = s.apply({ update: [{ id: 'a', v: 5, w: 1 }], patch: [{ id: 'a', set: { v: 9 } }] });
  expect(s.snapshot.rows[0]).toEqual({ id: 'a', v: 9, w: 1 });
  expect(r.updated).toEqual([C.dataKey('a')]);
  expect(r.kind).toBe('delta');
  r = s.apply({ remove: ['b', 'b'] });
  expect(r.removed).toEqual([C.dataKey('b')]);
  expect(r.problems.map((p: any) => [p.code, p.path])).toEqual([['unknown-row-id', 'remove[1]']]);
  r = s.apply({ remove: ['c'], patch: [{ id: 'c', set: { v: 0 } }] });
  expect(r.problems.map((p: any) => [p.code, p.path])).toEqual([['unknown-row-id', 'patch[0]']]);
  r = s.apply({ add: [{ id: 'y' }], addAt: 1.5 });
  expect(r.problems.map((p: any) => [p.code, p.path])).toEqual([['invalid-transaction', 'addAt']]);
  expect(s.snapshot.ids).toEqual(['a', 'x']);
  const s2 = createRowStore((r: any) => r.id);
  const a = { id: 'a' }, b = { id: 'b' };
  s2.replaceAll([a, b]);
  expect(s2.replaceAll([b, a]).kind).not.toBe('none');
  expect(s2.snapshot.ids).toEqual(['b', 'a']);
  expect(s2.replaceAll([{ id: 'b', v: 1 }, a]).kind).not.toBe('none');
  expect(s2.snapshot.rows[0].v).toBe(1);
  const s3 = createRowStore((r: any) => r.id);
  expect(s3.replaceAll([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]).kind).toBe('reset');
  expect(s3.apply({ remove: ['a', 'b', 'c'] }).kind).toBe('reset');
  expect(s3.lastDelta.kind).toBe('reset');
  expect(s3.replaceAll([null]).problems[0].detail).toBe('not a row');
  const shown = flatDisplayed(s3.snapshot, null, 1);
  expect(shown.nextData(shown.index(0), 1)).toBeNull();
});
function setup(rows: any[], defs: any[] = [{ id: 'name' }, { id: 'n', type: 'number' }]) {
  const store = createRowStore((r: any) => r.id); store.replaceAll(rows);
  const columns = createColumnModel(defs); const ctx = fr; const cache = new ColumnCache();
  const env = () => ({ source: store.snapshot, columns, ctx, reader: NO_OVERLAY, cache });
  const ids = (s: any) => [...sortIndices(s, null, env()).order].map((i: number) => store.snapshot.ids[i]);
  const envOf = () => ({ columns, ctx, reader: NO_OVERLAY });
  return { store, columns, cache, env, ids, envOf };
}
it('cache/sort', () => {
  let h = setup([{ id: '1', n: 3 }, { id: '2', n: 1 }, { id: '3', n: 2 }]);
  expect(h.ids([{ column: 'n', dir: 'asc' }])).toEqual(['2', '3', '1']);
  h.store.apply({ patch: [{ id: '2', set: { n: 9 } }] });
  h.cache.patch(h.store.lastDelta, h.store.snapshot, h.envOf);
  expect(h.ids([{ column: 'n', dir: 'asc' }])).toEqual(['3', '1', '2']);
  h.store.apply({ patch: [{ id: '3', set: { n: 10 } }] }); // no patch call
  expect(h.ids([{ column: 'n', dir: 'asc' }])).toEqual(['1', '2', '3']);
  h = setup([{ id: '1', name: 'b' }, { id: '2', name: 'a' }]);
  expect(h.ids([{ column: 'name', dir: 'asc' }])).toEqual(['2', '1']);
  h.store.apply({ patch: [{ id: '2', set: { name: 'c' } }] });
  expect(h.ids([{ column: 'name', dir: 'asc' }])).toEqual(['1', '2']);
  h.store.apply({ patch: [{ id: '1', set: { name: null } }] });
  h.cache.patch(h.store.lastDelta, h.store.snapshot, h.envOf);
  expect(h.ids([{ column: 'name', dir: 'asc' }])).toEqual(['2', '1']);
  h = setup([{ id: '1', name: 'é' }, { id: '2', name: 'e' }, { id: '3', name: 'é' }]);
  expect(h.ids([{ column: 'name', dir: 'asc' }])).toEqual(['1', '2', '3']);
  h = setup([{ id: 'a', name: null, n: 2 }, { id: 'b', name: null, n: 1 }]);
  expect(h.ids([{ column: 'name', dir: 'asc' }, { column: 'n', dir: 'asc' }])).toEqual(['b', 'a']);
  h = setup([{ id: 'a', n: 1 }, { id: 'b', n: null }, { id: 'c', n: 2 }]);
  expect(h.ids([{ column: 'n', dir: 'desc', nulls: 'first' }])).toEqual(['b', 'c', 'a']);
  expect(sortIndices([{ column: 'n', dir: 'asc', nulls: 'middle' }], null, h.env()).problems.map((p: any) => p.code)).toEqual(['invalid-sort']);
  const within = Uint32Array.of(2, 0); sortIndices([{ column: 'n', dir: 'asc' }], within, h.env()); expect([...within]).toEqual([2, 0]);
  h = setup([{ id: 'a', n: 1 }, { id: 'b', n: 1 }, { id: 'c', n: 1 }]);
  expect([...sortIndices([{ column: 'n', dir: 'asc' }], Uint32Array.of(2, 0), h.env()).order]).toEqual([0, 2]);
  h = setup([{ id: 'a', n: 2 }, { id: 'b', n: 1 }], [{ id: 'n', type: 'number', sortable: false }]);
  const r = sortIndices([{ column: 'n', dir: 'asc' }], null, h.env());
  expect(r.problems.map((p: any) => [p.code, p.path])).toEqual([['invalid-sort', 'sort[0]']]);
  h = setup([{ id: 'a', n: 2 }, { id: 'b', n: 1 }], [{ id: 'n', type: 'number' }]);
  expect(h.ids([{ column: 'n', dir: 'asc' }])).toEqual(['b', 'a']);
  h.columns.setDefs([{ id: 'n', type: 'number', value: (row: any) => -row.n }]);
  expect(h.ids([{ column: 'n', dir: 'asc' }])).toEqual(['a', 'b']);
  h = setup(Array.from({ length: 12 }, (_, i) => ({ id: String(i), n: 'x' })));
  expect(sortIndices([{ column: 'n', dir: 'asc' }], null, h.env()).problems.at(-1).detail).toBe('2 more');
  h = setup([{ id: '1', s: 'A' }, { id: '2', s: 'B' }], [{ id: 's', type: 'enum', enumOptions: [{ value: 'A', label: 'Zulu' }, { value: 'B', label: 'Alpha' }] }]);
  expect(h.ids([{ column: 's', dir: 'asc' }])).toEqual(['2', '1']);
});
it('columns', () => {
  expect(compilePath('a.toString')({ a: {} })).toBeUndefined();
  expect(compilePath('a.length')({ a: 'abc' })).toBeUndefined();
  const myCodec = { ...C.textCodec, kind: 'custom' };
  const rc = resolveColumns([{ id: 'x', type: 'custom', codec: myCodec }, { id: 't', type: 'instant', assumeZone: 'Africa/Algiers' }, { id: 'p', type: 'number', numberFormat: { style: 'percent' } }]);
  expect(rc.problems).toEqual([]);
  expect(rc.columns[0].codec).toBe(myCodec);
  expect(rc.columns[1].codec.coerce('2026-03-05T10:00', en)).toBe(parseInstant('2026-03-05T09:00Z'));
  expect(rc.columns[2].codec.format(0.5, en)).toBe('50%');
  const w = (m: any) => [m.layout.start, m.layout.center, m.layout.end].flatMap((s: any) => s.columns.map((c: any, i: number) => [c.id, s.widths.sizeAt(i)]));
  let m = createColumnModel([{ id: 'a', flex: 1 }, { id: 'b', width: 100 }], { availableInline: 500 });
  expect(w(m)).toEqual([['a', 400], ['b', 100]]);
  m.apply([{ id: 'a', width: 120 }], 'user'); expect(w(m)).toEqual([['a', 120], ['b', 100]]);
  m = createColumnModel([{ id: 'a', width: 50, minWidth: 200, maxWidth: 100 }]); expect(w(m)).toEqual([['a', 200]]);
  m = createColumnModel([{ id: 'a', flex: 1, width: 30, minWidth: 60 }, { id: 'b', flex: 1 }]); expect(w(m)).toEqual([['a', 60], ['b', 150]]);
  m = createColumnModel([{ id: 'a', pinned: 'start' }, { id: 'h', hidden: true }]);
  m.apply([{ id: 'a', pinned: null }, { id: 'h', hidden: false }], 'user');
  expect(m.layout.start.columns.length).toBe(0); expect(m.visible().map((c: any) => c.id)).toEqual(['a', 'h']);
  m = createColumnModel([{ id: 'a' }]);
  const r = m.apply([{ id: 'a', width: NaN }, { id: 'a', width: Infinity }], 'user');
  expect(r.problems.map((p: any) => p.code)).toEqual(['invalid-column', 'invalid-column']);
  expect(w(m)).toEqual([['a', 150]]);
  { const ch = m.setDefs([{ id: '' }]); expect(ch.problems.map((p: any) => p.code)).toEqual(['invalid-column']); expect(m.problems.map((p: any) => p.code)).toEqual(['invalid-column']); }
  m = createColumnModel([{ id: 'a', pinned: 'start', flex: 1 }, { id: 'b', width: 100 }], { availableInline: 400 });
  expect(w(m)).toEqual([['a', 300], ['b', 100]]);
  m = createColumnModel([{ id: 'a', flex: 1 }, { id: 'b', flex: 1 }, { id: 'c', flex: 1 }], { availableInline: 100 });
  expect(w(m)).toEqual([['a', 40], ['b', 40], ['c', 40]]);
  m = createColumnModel([{ id: 'a', flex: 1 }, { id: 'b', flex: 1 }, { id: 'c', flex: 1 }], { availableInline: 200 });
  expect(w(m).map((x: any) => x[1]).reduce((a: number, b: number) => a + b)).toBe(200);
  expect(w(m)).toEqual([['a', 67], ['b', 67], ['c', 66]]);
});
it('enum/fold/format', () => {
  const e = enumCodec([{ value: 'A', label: 'Actif' }, { value: 'B', label: 'a' }]);
  expect(e.parse('a', fr)).toBe('A');
  expect(e.parse('  actif ', fr)).toBe('A');
  expect(fold('\u200fabcé')).toBe('abce');
  expect(C.booleanCodec.parse('\u200fنعم', fr)).toBe(true);
  expect(formattersFor(en).number()(0.12345)).toBe('0.12345');
});
it('counts a row updated twice in one transaction once', () => {
  const s = createRowStore((r: any) => r.id);
  s.replaceAll([{ id: 'a', v: 0 }, { id: 'b', v: 0 }, { id: 'c', v: 0 }, { id: 'd', v: 0 }]);
  const r = s.apply({ update: [{ id: 'a', v: 1 }, { id: 'a', v: 2 }] });
  expect(r.updated).toEqual([C.dataKey('a')]);
  expect(s.snapshot.rows[0]).toEqual({ id: 'a', v: 2 });
});
