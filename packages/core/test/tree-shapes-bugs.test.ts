import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, dataKey, localeCtx, NO_SELECTION } from '@dzgrid/core';
import { csvRows, toCsv, type CsvOptions } from '@dzgrid/core/csv';
import { treeShape, type TreeRows } from '@dzgrid/core/tree';

/** Step-5 defects found by the nested / path random walk's probes (each seen failing, then fixed). */
type R = { id: string; t?: string | null; kids?: R[]; path?: string[] };
const ctx = localeCtx({ locale: 'en-US' });
const columns = createColumnModel<R>([{ id: 't', header: 'T' }]);
const nested = (rows: R[]) => clientRows<R>({ rows, getRowId: (r) => r.id, columns, ctx, shape: treeShape<R>({ children: (r) => r.kids }) });
const all = (m: { allRows: unknown }) => {
  const d = m.allRows as TreeRows<R>;
  return Array.from({ length: d.count }, (_, i) => `${d.levelAt(i as never)}:${(d.nodeAt(i as never) as { id?: string; label?: string }).id ?? (d.nodeAt(i as never) as { label: string }).label}`);
};

describe('nested rows: a row refused for its id is not walked (tree-view.md « Nested rows »)', () => {
  it('an added second copy of an existing id does not bring its children', () => {
    const m = nested([{ id: 'a', t: 'a' }]);
    m.applyTransaction({ add: [{ id: 'a', t: 'copy', kids: [{ id: 'z', t: 'z' }] }] });
    // Today: z is added under a (the refused copy was walked).
    expect(all(m)).toEqual(['0:a']);
  });

  it('a new row whose children hold a copy of an existing row does not move that row', () => {
    const m = nested([{ id: 'a', t: 'a', kids: [{ id: 'b', t: 'b' }] }]);
    m.applyTransaction({ add: [{ id: 'n', t: 'n', kids: [{ id: 'b', t: 'b-copy' }] }] });
    // The copy of b is refused (duplicate-row-id); b stays under a. Today: b moves under n.
    expect(all(m)).toEqual(['0:a', '1:b', '0:n']);
    expect((m.allRows as TreeRows<R>).parentOf(dataKey('b')!)).toBe(dataKey('a'));
  });
});

describe('csv.tree on path rows (csv-export.md « Trees and details »)', () => {
  const rows: R[] = [{ id: 'f', t: 'file', path: ['dir', 'f'] }, { id: 'e', t: null, path: ['dir', 'e'] }];
  const file = (o: CsvOptions) => {
    const m = clientRows<R>({ rows, getRowId: (r) => r.id, columns, ctx, shape: treeShape<R>({ path: (r) => r.path! }) });
    const held = csvRows(m, 'all', NO_SELECTION)!;
    return toCsv({ rows: held.rows, at: held.at, columns, ctx }, { bom: false, ...o }).split('\r\n').slice(0, -1);
  };

  it('a treeColumn that is not written still leaves the filler its label (else the row is blank)', () => {
    // Today: '1,' — the filler 'dir' is written with every field empty.
    expect(file({ treeColumn: 'gone' })[1]).toBe('1,dir');
  });

  it("'indent': a row whose tree-column cell is blank keeps its indent (its level is not lost)", () => {
    // Today: '""' — the blank cell drops the two spaces, the row reads as a root.
    expect(file({ tree: 'indent' })).toEqual(['T', 'dir', '  file', '  ']);
  });
});
