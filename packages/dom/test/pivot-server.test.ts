// 1.8.0, the server pivot on screen (docs/behaviors/server-pivot.md 1, 2, 4, 6, 9–12): `@dzgrid/dom/pivot` beside
// `serverSideRows(data, { pivot: serverPivot() })`. Expectations written by hand from the sheet, before the DOM change.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { ColumnDef, DisplayIndex, GridEvent } from '@dzgrid/core';
import { serverSideRows, type ServerSideModel } from '@dzgrid/core/server-side';
import { serverPivot } from '@dzgrid/core/server-pivot';
import type { DataRequest, DataSource } from '@dzgrid/core/server';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { grouping } from '../src/grouping.js';
import { pivot } from '../src/pivot.js';
import { spans } from '../src/spans.js';
import { gridState } from '../src/state.js';
import { csvExport, type CsvExportOptions } from '../src/export.js';
import { EN } from '../src/locales/en.js';
import { EN_GROUP } from '../src/locales/en-group.js';
import { EN_PIVOT } from '../src/locales/en-pivot.js';
import { EN_EXPORT } from '../src/locales/en-export.js';
import { EN_FIND } from '../src/locales/en-find.js';
import { find } from '../src/find.js';

type R = { id: string; region: string; city: string; year: number; amount: number };
let grids: GridInstance<R, any>[] = []; // any: the grid's second parameter (its features) is not under test
beforeEach(() => void vi.useFakeTimers());
afterEach(() => {
  for (const g of grids) g.destroy();
  grids = [];
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const geometry = (): Geometry => {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 400, inline: 900, scrollTop: 0, scrollInline: 0 };
  return { read: () => ({ ...box }), writeScrollTop: (t) => void (box.scrollTop = t), writeScrollInline: () => {} };
};
const COLS: ColumnDef<R, any>[] = [ // any: the column's value type is not under test
  { id: 'region', header: 'Region' },
  { id: 'city', header: 'City' },
  { id: 'year', header: 'Year', type: 'number', numberFormat: { useGrouping: false } },
  { id: 'amount', header: 'Amount', type: 'number', aggFunc: 'sum' },
];
const text = { locale: EN.locale, text: { ...EN.text, ...EN_GROUP.text, ...EN_PIVOT.text, ...EN_EXPORT.text, ...EN_FIND.text } };
const LABEL = '~p:rows';
const Y25 = '~p4:year5:n20256:amount';
const Y26 = '~p4:year5:n20266:amount';

/** A server-pivoted grid answered by the test (`plug: false`: `serverSideRows` without `serverPivot()`). */
function make(o: { plug?: boolean; features?: (p: ReturnType<typeof pivot>) => unknown[]; by?: string[] } = {}) {
  const calls: { req: DataRequest; ok(v: unknown): void }[] = [];
  const data: DataSource<R> = {
    fetch: (req) => ({ then(ok: (v: never) => void) { calls.push({ req, ok: ok as never }); } }) as never, // a thenable answered by the test
  };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const p = pivot({ columns: ['year'], values: { amount: 'sum' } });
  const g = createGrid<R>(host, {
    source: serverSideRows(data, { blockSize: 10, ...(o.plug !== false && { pivot: serverPivot() }) }), getRowId: (r: R) => r.id, columns: COLS, messages: text, rowHeight: 40, locale: 'en-US',
    onEvent: (e: GridEvent<R>) => events.push(e), features: o.features?.(p) ?? [spans(), grouping({ by: o.by ?? ['region'], pivot: p })],
  } as never, { geometry: geometry(), sync: true }) as GridInstance<R, any>; // never: a server's settings without its query type
  grids.push(g);
  const q = (s: string) => host.querySelector<HTMLElement>(s);
  // The i-th body row shown (the header has two rows here: the « Total » band above its value).
  const row = (i: number) => [...host.querySelectorAll<HTMLElement>('.dzg-body .dzg-row')].sort((a, b) => +a.getAttribute('aria-rowindex')! - +b.getAttribute('aria-rowindex')!)[i] ?? null;
  const cell = (i: number, col: string) => row(i)?.querySelector<HTMLElement>(`[data-col="${col}"]`)?.textContent;
  const visible = () => g.kernel.columns.visible().map((c) => c.id);
  const root = (c = calls[0]!, extra: object = {}) =>
    c.ok({
      groups: [
        { value: 'Nord', count: 3, aggs: { amount: 30 }, cells: { '0': { amount: 10 }, '1': { amount: 20 } } },
        { value: 'Sud', count: 1, aggs: { amount: 5 }, cells: { '0': { amount: 5 } } },
      ],
      total: 2, totals: { amount: 35 }, pivot: { crossings: [[2025], [2026]], totals: { '0': { amount: 15 }, '1': { amount: 20 } } }, ...extra,
    });
  const told = () => events.flatMap((e) => (e.type === 'problems' ? e.problems.map((x) => `${x.code} ${x.path}${x.detail ? ` ${x.detail}` : ''}`) : []));
  return { g, p, host, calls, q, row, cell, visible, root, told, model: g.kernel.rows as unknown as ServerSideModel<R> };
}

describe('server pivot on screen (server-pivot.md 1, 2)', () => {
  it('beside serverSideRows with the plug: the pivot is made, its api given; one request, with the pivot part', () => {
    const t = make();
    expect(t.p.api(t.g)).not.toBeNull();
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]!.req.group).toEqual({ by: ['region'], path: [], aggs: [{ column: 'amount', fn: 'sum' }], pivot: { columns: ['year'], limit: 200 } });
    expect(t.told()).not.toContain('unsupported-combination source pivot');
  });

  it('the label column, the created columns from the server list, the value under « Total »; cells and totals as sent', () => {
    const t = make();
    t.root();
    expect(t.visible()).toEqual([LABEL, Y25, Y26, 'amount']);
    expect(t.g.kernel.columns.get(LABEL)!.def.header).toBe('Region');
    expect(t.g.kernel.columns.get(Y25)!.def.header).toBe('2025');
    expect([t.cell(0, Y25), t.cell(0, Y26), t.cell(0, 'amount')]).toEqual(['10', '20', '30']);
    // An absent crossing is an empty cell, never « 0 ».
    expect([t.cell(1, Y25), t.cell(1, Y26), t.cell(1, 'amount')]).toEqual(['5', '', '5']);
    expect([t.cell(2, Y25), t.cell(2, Y26), t.cell(2, 'amount')]).toEqual(['15', '20', '35']);
  });

  it('the created columns set after the answer ask nothing more (no refetch loop)', () => {
    const t = make();
    t.root();
    vi.advanceTimersByTime(1000);
    expect(t.calls).toHaveLength(1);
  });

  it('the last rows: no aria-expanded, no chevron to open, never asked', () => {
    const t = make();
    t.root();
    expect(t.row(0)!.hasAttribute('aria-expanded')).toBe(false);
    expect(t.row(0)!.querySelector(`[data-col="${LABEL}"] .dzg-toggle`)!.hasAttribute('data-leaf')).toBe(true);
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [t.model.displayed.keyAt(0 as DisplayIndex)], expanded: true }, 'user');
    expect(t.calls).toHaveLength(1);
  });

  it('two row columns: a first-level group opens, its children asked with the same pivot part and drawn with their cells', () => {
    const t = make({ by: ['region', 'city'] });
    t.root();
    expect(t.row(0)!.getAttribute('aria-expanded')).toBe('false');
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [t.model.displayed.keyAt(0 as DisplayIndex)], expanded: true }, 'user');
    const child = t.calls.at(-1)!;
    expect(child.req.group).toMatchObject({ path: ['Nord'], pivot: { columns: ['year'], limit: 200 } });
    child.ok({ groups: [{ value: 'Lille', count: 3, aggs: { amount: 30 }, cells: { '1': { amount: 30 } } }], total: 1 });
    expect([t.cell(1, LABEL), t.cell(1, Y25), t.cell(1, Y26)]).toEqual(['Lille (3)', '', '30']);
  });
});

describe('server pivot: gestures, one request each (server-pivot.md 4)', () => {
  it('the pivot columns, the values, the order, the mode, the row grouping: each one new request', () => {
    const t = make();
    t.root();
    const api = t.p.api(t.g)!;
    api.setBy(['city'], { user: true });
    expect(t.calls).toHaveLength(2);
    api.setValues({ amount: 'max' }, { user: true });
    expect(t.calls).toHaveLength(3);
    api.setDesc(['city'], { user: true });
    expect(t.calls).toHaveLength(4);
    expect(t.calls.at(-1)!.req.group).toEqual({ by: ['region'], path: [], aggs: [{ column: 'amount', fn: 'max' }], pivot: { columns: ['city'], desc: ['city'], limit: 200 } });
    api.setOn(false, { user: true });
    expect(t.calls).toHaveLength(5);
    expect(t.calls.at(-1)!.req.group!.pivot).toBeUndefined();
    // Off: the application's columns back.
    expect(t.visible()).toEqual(['region', 'city', 'year', 'amount']);
  });

  it('a click sort on a created column is sent as pivot.sort, never with its id', () => {
    const t = make();
    t.root();
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: Y26, dir: 'desc' }] } as never, 'user'); // never: the action's shape as the header's click makes it
    const r = t.calls.at(-1)!.req;
    expect(r.group!.pivot!.sort).toEqual({ crossing: [2026], column: 'amount', dir: 'desc' });
    expect(JSON.stringify({ ...r, key: '', signal: null })).not.toContain('~p');
  });

  it('a state restored with the row grouping and the pivot: one request', () => {
    const t = make({ features: (p) => [spans(), grouping({ by: ['region'], pivot: p }), gridState({ initial: { v: 1, rowGroups: ['city'], pivot: { on: true, columns: ['year'], values: { amount: 'min' } } } })] });
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]!.req.group).toEqual({ by: ['city'], path: [], aggs: [{ column: 'amount', fn: 'min' }], pivot: { columns: ['year'], limit: 200 } });
  });
});

describe('server pivot: the limit, exports, refusals (server-pivot.md 6, 10, 12)', () => {
  it('above the limit: no created column, the note says how many', () => {
    const t = make();
    t.calls[0]!.ok({ groups: [{ value: 'Nord', count: 3, aggs: { amount: 30 } }], total: 1, pivot: { count: 1240 } });
    expect(t.visible()).toEqual([LABEL, 'amount']);
    expect(t.q('.dzg-pnote')!.textContent).toBe('1,240 columns: too many for the screen; remove a column');
  });

  it('the export of « all » goes to the application with the pivot part and the crossings known', async () => {
    vi.useRealTimers();
    const asked: { server?: { group?: unknown } }[] = [];
    const ex = csvExport({ canExport: true, deliver: () => {}, loadRun: () => import('../src/export/run/index.js'), exportAll: async (r) => void asked.push(r as never) } as CsvExportOptions); // never: the request read as a record
    const t = make({ features: (p) => [spans(), grouping({ by: ['region'], pivot: p }), ex] });
    t.root();
    expect(await ex.run('all')).toBe('done');
    expect(asked[0]!.server!.group).toEqual({ by: ['region'], path: [], aggs: [{ column: 'amount', fn: 'sum' }], pivot: { columns: ['year'], limit: 200, crossings: [[2025], [2026]] } });
  });

  it('the export of « all » after a sort on a created column: server is what the model sends (pivot.sort, no created id)', async () => {
    vi.useRealTimers();
    const asked: { server?: { sort?: unknown; group?: { pivot?: { sort?: unknown } } } }[] = [];
    const ex = csvExport({ canExport: true, deliver: () => {}, loadRun: () => import('../src/export/run/index.js'), exportAll: async (r) => void asked.push(r as never) } as CsvExportOptions); // never: the request read as a record
    const t = make({ features: (p) => [spans(), grouping({ by: ['region'], pivot: p }), ex] });
    t.root();
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: Y26, dir: 'desc' }] } as never, 'user'); // never: the action's shape as the header's click makes it
    t.root(t.calls.at(-1)!);
    expect(await ex.run('all')).toBe('done');
    const server = asked[0]!.server!;
    expect(server.group!.pivot!.sort).toEqual({ crossing: [2026], column: 'amount', dir: 'desc' });
    expect(server.sort).toEqual([]);
    expect(JSON.stringify(server)).not.toContain('~p');
  });

  it('the export of « displayed »: the groups held, their cells under the created columns\' headers, the grand total', async () => {
    vi.useRealTimers();
    const files: { blob?: Blob }[] = [];
    const ex = csvExport({ canExport: true, bom: false, deliver: (f) => void files.push(f), loadRun: () => import('../src/export/run/index.js') });
    const t = make({ features: (p) => [spans(), grouping({ by: ['region'], pivot: p }), ex] });
    t.root();
    expect(await ex.run('displayed')).toBe('done');
    expect(await files[0]!.blob!.text()).toBe(['Level,Region,2025,2026,Total › Amount', '1,Nord (3),10,20,30', '1,Sud (1),5,,5', '1,Total,15,20,35', ''].join('\r\n'));
  });

  it('find searches the cells shown of the groups held (labels and totals as written)', () => {
    const f = find({ debounceMs: 0 });
    const t = make({ features: (p) => [spans(), grouping({ by: ['region'], pivot: p }), f] });
    t.root();
    f.api(t.g)!.open('20');
    expect(f.api(t.g)!.state().count).toBe(2);
    f.api(t.g)!.open('sud');
    expect(f.api(t.g)!.state().current).toEqual({ row: t.model.displayed.keyAt(1 as DisplayIndex), column: LABEL });
  });

  it('serverSideRows without the plug: the pivot is refused (source, pivot), the grid as grouping alone shows it', () => {
    const t = make({ plug: false });
    expect(t.told()).toContain('unsupported-combination source pivot');
    expect(t.p.api(t.g)).toBeNull();
    expect(t.calls[0]!.req.group!.pivot).toBeUndefined();
  });
});
