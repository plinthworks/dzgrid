import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, type DisplayedRows, type LocaleCtx, type RowNode } from '@dzgrid/core';
import { csvRows, toCsv, type CsvOptions } from '@dzgrid/core/csv';
import { treeShape, type TreeOptions } from '@dzgrid/core/tree';
import { AR, ALM, LRM, RLM, BOM } from './support.js';

/**
 * The CSV of a tree (Phase 4 step 5, docs/behaviors/csv-export.md « Trees and details », plan D11):
 * `csv.tree` level / indent / none, fillers as label-only rows, `all` with collapsed descendants,
 * `displayed` the rows shown, `selected` never a filler, details never written. By hand.
 */
type F = { id: string; name: string; n?: number; path: string[] };
const FILES: F[] = [
  { id: 'f1', name: 'a.pdf', n: 5, path: ['docs', '2024', 'f1'] },
  { id: 'f2', name: 'b.pdf', n: 1, path: ['docs', '2025', 'f2'] },
  { id: 'd', name: 'Docs', n: 7, path: ['docs'] },
  { id: 'g', name: 'c.png', n: 2, path: ['img', 'g'] },
];

function setup(rows: F[] = FILES, ctx: LocaleCtx = localeCtx({ locale: 'en-US', timeZone: 'Africa/Algiers' }), tree: TreeOptions<F> = { path: (r) => r.path }) {
  const columns = createColumnModel<F>([{ id: 'name', header: 'Name' }, { id: 'n', header: 'N', type: 'number' }]);
  const model = clientRows<F>({ rows, getRowId: (r) => r.id, columns, ctx, shape: treeShape<F>(tree) });
  const kernel = createKernel<F>({ rows: model, columns });
  const file = (scope: 'displayed' | 'all' | 'selected', o: CsvOptions = {}) => {
    const held = csvRows(model, scope, kernel.selection)!;
    return toCsv({ rows: held.rows, at: held.at, columns, ctx }, { bom: false, ...o });
  };
  return { model, kernel, columns, ctx, file };
}
const lines = (s: string) => s.split('\r\n').slice(0, -1);

describe('csv.tree', () => {
  it("'level' (the default): a first column Level, 1 for the roots; fillers write their label only", () => {
    const { file } = setup();
    expect(lines(file('all'))).toEqual(['Level,Name,N', '1,Docs,7', '2,2024,', '3,a.pdf,5', '2,2025,', '3,b.pdf,1', '1,img,', '2,c.png,2']);
  });

  it("'indent': two spaces per level before the tree column's text, roots none", () => {
    const { file } = setup();
    expect(lines(file('all', { tree: 'indent' }))).toEqual(['Name,N', 'Docs,7', '  2024,', '    a.pdf,5', '  2025,', '    b.pdf,1', 'img,', '  c.png,2']);
  });

  it("'none': flat rows, fillers still label-only", () => {
    const { file } = setup();
    expect(lines(file('all', { tree: 'none' }))).toEqual(['Name,N', 'Docs,7', '2024,', 'a.pdf,5', '2025,', 'b.pdf,1', 'img,', 'c.png,2']);
  });

  it('the level header is the host’s to name', () => {
    const { file } = setup();
    expect(lines(file('all', { levelHeader: 'Niveau' }))[0]).toBe('Niveau,Name,N');
  });

  it('displayed: the rows shown only (a closed parent’s rows left out); all: every row, closed ones included', () => {
    const { file, kernel } = setup();
    expect(lines(file('displayed'))).toEqual(['Level,Name,N', '1,Docs,7', '1,img,']);
    kernel.dispatch({ type: 'rows.expand', rows: [dataKey('d')!], expanded: true }, 'user');
    expect(lines(file('displayed'))).toEqual(['Level,Name,N', '1,Docs,7', '2,2024,', '2,2025,', '1,img,']);
    expect(lines(file('all'))).toHaveLength(8);
  });

  it('selected: the selected rows in tree order, hidden ones included, never a filler (even under everything-except)', () => {
    const { file, kernel } = setup();
    kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    kernel.dispatch({ type: 'selection.toggle', row: dataKey('g')! }, 'user');
    kernel.dispatch({ type: 'selection.toggle', row: dataKey('f1')! }, 'user');
    kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'user');
    expect(lines(file('selected'))).toEqual(['Level,Name,N', '3,a.pdf,5', '2,c.png,2']);
    kernel.dispatch({ type: 'selection.set', selection: { mode: 'exclude', keys: new Set([dataKey('f2')!]) } }, 'user');
    expect(lines(file('selected'))).toEqual(['Level,Name,N', '1,Docs,7', '3,a.pdf,5', '2,c.png,2']);
  });

  it('treeColumn names the column that carries the indent and the fillers’ labels', () => {
    const { file } = setup();
    expect(lines(file('all', { tree: 'indent', columns: ['n', 'name'], treeColumn: 'name' })).slice(0, 4)).toEqual(['N,Name', '7,Docs', ',  2024', '5,    a.pdf']);
    // By default the first column written: here the number column.
    expect(lines(file('all', { tree: 'indent', columns: ['n', 'name'] })).slice(0, 4)).toEqual(['N,Name', '7,Docs', '  2024,', '    5,a.pdf']);
  });

  it('the indent comes before the formula guard and the quotes', () => {
    const rows: F[] = [{ id: 'p', name: 'P', path: ['p'] }, { id: 'x', name: '=1+1', path: ['p', 'x'] }, { id: 'y', name: 'a,b', path: ['p', 'y'] }];
    const { file } = setup(rows);
    expect(lines(file('all', { tree: 'indent' }))).toEqual(['Name,N', 'P,', "'  =1+1,", '"  a,b",']);
  });

  it('Arabic: spaces only, no direction marks; the bytes are the label’s own', () => {
    const rows: F[] = [{ id: 'x', name: 'تقرير', path: ['ملفات', 'x'] }];
    const { file } = setup(rows, AR);
    const out = file('all', { tree: 'indent', bom: true });
    expect(out.startsWith(BOM)).toBe(true);
    for (const mark of [LRM, RLM, ALM]) expect(out.includes(mark)).toBe(false);
    expect(lines(out.slice(1))).toEqual(['Name;N', 'ملفات;', '  تقرير;']);
    expect([...Buffer.from(lines(out.slice(1))[2]!, 'utf8')].slice(0, 4)).toEqual([0x20, 0x20, 0xd8, 0xaa]);
  });

  it('nested and parent trees write their levels too', () => {
    type N = F & { kids?: N[] };
    const nested: N[] = [{ id: 'a', name: 'A', path: [], kids: [{ id: 'b', name: 'B', path: [] }] }];
    const n = setup(nested, undefined, { children: (r: N) => r.kids });
    expect(lines(n.file('all'))).toEqual(['Level,Name,N', '1,A,', '2,B,']);
    const p = setup([{ id: 'a', name: 'A', path: [] }, { id: 'b', name: 'B', path: ['a'] }], undefined, { parentId: (r) => r.path[0] });
    expect(lines(p.file('all'))).toEqual(['Level,Name,N', '1,A,', '2,B,']);
  });

  it('a flat grid is not a tree: no level column whatever csv.tree says', () => {
    const columns = createColumnModel<F>([{ id: 'name', header: 'Name' }]);
    const ctx = localeCtx({ locale: 'en-US' });
    const model = clientRows<F>({ rows: FILES, getRowId: (r) => r.id, columns, ctx });
    expect(lines(toCsv({ rows: model.displayed, columns, ctx }, { bom: false, tree: 'level' }))[0]).toBe('Name');
  });

  it('a detail row is never written', () => {
    const columns = createColumnModel<F>([{ id: 'name', header: 'Name' }]);
    const ctx = localeCtx({ locale: 'en-US' });
    const nodes: RowNode<F>[] = [
      { key: dataKey('a')!, kind: 'data', level: 0, id: 'a', data: FILES[0]! },
      { key: 'x:d:1:a' as never, kind: 'detail', level: 0, master: dataKey('a')!, data: FILES[0]! },
    ];
    const rows = { count: 2, nodeAt: (i: number) => nodes[i]!, keyAt: (i: number) => nodes[i]!.key, levelAt: () => 0 } as unknown as DisplayedRows<F>;
    expect(lines(toCsv({ rows, columns, ctx }, { bom: false }))).toEqual(['Level,Name', '1,a.pdf']);
  });
});
