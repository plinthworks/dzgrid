import { describe, it, expect } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { buildSpanMap } from '@dzgrid/core/spans';
import { toCsv, type CsvOptions } from '@dzgrid/core/csv';
import { EN, grid, type Row } from './support.js';

/** docs/behaviors/csv-export.md, spans: a tall or wide cell in the file. */

function spanned(defs: readonly ColumnOrGroup<Row>[], rows: Record<string, unknown>[], o: CsvOptions & { at?: number[]; fullWidth?: (r: Row) => boolean } = {}) {
  const g = grid(defs, rows);
  const map = buildSpanMap({ rows: g.model.displayed, columns: g.columns, ctx: EN, ...(o.fullWidth && { fullWidth: o.fullWidth }) });
  const spanColumns = g.columns.visible().map((c) => c.id);
  const { at, fullWidth: _f, ...opts } = o;
  return toCsv({ rows: g.model.displayed, at: at ? Uint32Array.from(at) : null, columns: g.columns, ctx: EN, spans: map, spanColumns }, { bom: false, header: false, ...opts });
}

const wards = [{ id: 'ward', merge: true as const }, { id: 'name' }];
const wardRows = [{ ward: 'A', name: 'x' }, { ward: 'A', name: 'y' }, { ward: 'B', name: 'z' }];

describe('merged values', () => {
  it('repeat (the default): each covered slot holds the value', () => {
    expect(spanned(wards, wardRows)).toBe('A,x\r\nA,y\r\nB,z\r\n');
  });
  it('first: the value in its first slot, the others empty', () => {
    expect(spanned(wards, wardRows, { spans: 'first' })).toBe('A,x\r\n,y\r\nB,z\r\n');
  });
  it('the origin value, not the covered row\'s own (a function merge)', () => {
    const defs = [{ id: 'ward', merge: (a: { value: unknown }, b: { value: unknown }) => String(a.value)[0] === String(b.value)[0] }, { id: 'name' }];
    expect(spanned(defs, [{ ward: 'A1', name: 'x' }, { ward: 'A2', name: 'y' }])).toBe('A1,x\r\nA1,y\r\n');
  });
});

describe('spans from the data', () => {
  it('a rowSpan repeats the origin row\'s value below', () => {
    const defs = [{ id: 'a', rowSpan: (c: { index: number }) => (c.index === 0 ? 2 : 1) }, { id: 'b' }];
    expect(spanned(defs, [{ a: 'top', b: 1 }, { a: 'own', b: 2 }, { a: 'z', b: 3 }])).toBe('top,1\r\ntop,2\r\nz,3\r\n');
  });
  it('a colSpan repeats across, or leaves the covered slots empty', () => {
    const defs = [{ id: 'a', colSpan: (c: { value: unknown }) => (c.value === 'total' ? 3 : 1) }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const rows = [{ a: 'x', b: 1, c: 2, d: 3 }, { a: 'total', b: 'p', c: 'q', d: 9 }];
    expect(spanned(defs, rows)).toBe('x,1,2,3\r\ntotal,total,total,9\r\n');
    expect(spanned(defs, rows, { spans: 'first' })).toBe('x,1,2,3\r\ntotal,,,9\r\n');
  });
});

describe('full-width rows', () => {
  it('are ordinary rows, each column its own value', () => {
    const rows = [{ ward: 'A', name: 'x' }, { ward: 'title', name: 'n' }, { ward: 'A', name: 'y' }];
    expect(spanned(wards, rows, { fullWidth: (r) => r.ward === 'title' })).toBe('A,x\r\ntitle,n\r\nA,y\r\n');
  });
});

describe('a custom column list and selected rows', () => {
  it('maps the named columns through the map; a column not in it is written as usual', () => {
    const defs = [...wards, { id: 'h', hidden: true }];
    const rows = wardRows.map((r, i) => ({ ...r, h: `h${i}` }));
    expect(spanned(defs, rows, { columns: ['name', 'ward', 'h'], spans: 'first' })).toBe('x,A,h0\r\ny,,h1\r\nz,B,h2\r\n');
    expect(spanned(defs, rows, { columns: ['name', 'ward', 'h'] })).toBe('x,A,h0\r\ny,A,h1\r\nz,B,h2\r\n');
  });
  it('with chosen rows (selected), first is ignored: the value repeats', () => {
    expect(spanned(wards, wardRows, { at: [1, 2], spans: 'first' })).toBe('A,y\r\nB,z\r\n');
  });
  it('a map with no span changes nothing', () => {
    expect(spanned([{ id: 'a' }, { id: 'b' }], [{ a: 1, b: 1 }, { a: 1, b: 1 }], { spans: 'first' })).toBe('1,1\r\n1,1\r\n');
  });
});
