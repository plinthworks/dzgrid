// The JSON export (docs/behaviors/json-export.md, 1.9.0): the CSV feature's third format. Expectations by hand.
import { afterEach, describe, expect, it } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { cleanup, read, xmake, type R } from './support-export.js';

afterEach(cleanup);

type Tin = R & { tea?: string | null; grams?: number | null; ok?: boolean | null; packed?: string | null; opened?: number | null; kind?: string | null };
const tins: Tin[] = [
  { id: 'r1', name: 'Oolong', n: 1, grams: 100.5, ok: true, packed: '2026-02-03', opened: Date.UTC(2026, 2, 1, 8), kind: 'g' },
  { id: 'r2', name: '=Assam', n: 2, grams: null, ok: false, packed: null, opened: null, kind: 'b' },
  // A number column holding text, on purpose: an unreadable cell.
  { id: 'r3', name: '', n: 3, grams: 'heavy' as never, ok: null, packed: '2025-11-30', opened: 0, kind: null },
];
const cols: ColumnOrGroup<Tin>[] = [
  { id: 'name', header: 'Name' },
  { id: 'grams', header: 'Grams', type: 'number', numberFormat: { minimumFractionDigits: 2 } },
  { id: 'ok', header: 'OK', type: 'boolean' },
  { id: 'packed', header: 'Packed', type: 'day' },
  { id: 'opened', header: 'Opened', type: 'instant' },
  { id: 'kind', header: 'Kind', type: 'enum', enumOptions: [{ value: 'g', label: 'Green' }, { value: 'b', label: 'Black' }] },
];
const json = async (t: ReturnType<typeof xmake>) => {
  const d = t.delivered.at(-1)!;
  return { d, text: (await read(d.blob!)).text };
};

describe('JSON export', () => {
  it('raw values keyed by column id, in screen order; blanks and unreadable cells null; no guard; a .json Blob without BOM', async () => {
    const t = xmake({ rows: tins as R[], columns: cols as ColumnOrGroup<R>[], lang: 'fr' });
    expect(await t.feature.run('displayed', { format: 'json' })).toBe('done');
    const { d, text } = await json(t);
    expect(d.fileName).toMatch(/^export-\d{4}-\d\d-\d\d-\d{4}\.json$/);
    expect(d.blob!.type).toBe('application/json');
    const bytes = new Uint8Array(await d.blob!.arrayBuffer());
    expect(bytes[0]).toBe('['.charCodeAt(0));
    expect(JSON.parse(text)).toEqual([
      { name: 'Oolong', grams: 100.5, ok: true, packed: '2026-02-03', opened: '2026-03-01T08:00:00Z', kind: 'g' },
      { name: '=Assam', grams: null, ok: false, packed: null, opened: null, kind: 'b' },
      { name: null, grams: null, ok: null, packed: '2025-11-30', opened: '1970-01-01T00:00:00Z', kind: null },
    ]);
    expect(Object.keys(JSON.parse(text)[0])).toEqual(['name', 'grams', 'ok', 'packed', 'opened', 'kind']);
    const fin = t.exportEvents().at(-1) as { format?: string; rows?: number; invalid?: number };
    expect([fin.format, fin.rows, fin.invalid]).toEqual(['json', 3, 1]);
  });

  it('text: display writes what the cells show', async () => {
    const t = xmake({ rows: tins as R[], columns: cols as ColumnOrGroup<R>[], lang: 'en', options: { text: 'display' } });
    await t.feature.run('displayed', { format: 'json' });
    const first = JSON.parse((await json(t)).text)[0];
    // The default yes / no codec formats with its raw words (the app gives `booleanCodecWith` for labels).
    expect(first).toMatchObject({ name: 'Oolong', grams: '100.50', ok: 'true', kind: 'Green' });
  });

  it('the request and the events say json; columns asked are written in their order; the selected scope', async () => {
    const seen: unknown[] = [];
    const t = xmake({ options: { canExport: (r) => (seen.push(r.format), true) } });
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.key('r2') }, 'api');
    expect(await t.feature.run('selected', { format: 'json', columns: ['n', 'name'] })).toBe('done');
    expect(seen).toEqual(['json']);
    expect(t.exportEvents().map((e) => (e as { format?: string }).format)).toEqual(['json', 'json']);
    expect((await json(t)).text).toBe('[\n{"n":2,"name":"bob2"}\n]\n');
  });

  it('bind(button, { format: json }) exports JSON on a click', async () => {
    const t = xmake();
    const b = document.createElement('button');
    t.feature.bind(b, { format: 'json' });
    b.click();
    await new Promise((r) => setTimeout(r, 30));
    expect(t.delivered[0]!.fileName).toMatch(/\.json$/);
    expect(JSON.parse((await json(t)).text)).toHaveLength(30);
  });

  it('a server’s pages: all goes to exportAll with format json', async () => {
    const asked: unknown[] = [];
    const t = xmake({ mode: 'offset', options: { exportAll: async (r) => void asked.push(r.format) } });
    t.answer(10, { total: 30 });
    expect(await t.feature.run('all', { format: 'json' })).toBe('done');
    expect(asked).toEqual(['json']);
  });

  it('an empty grid writes an empty array', async () => {
    const t = xmake({ rows: [] });
    await t.feature.run('displayed', { format: 'json' });
    expect((await json(t)).text).toBe('[\n]\n');
  });
});
