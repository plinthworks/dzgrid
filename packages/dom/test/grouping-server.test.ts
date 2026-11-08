// Phase 8 step 7 (docs/behaviors/server-side-groups.md, row-grouping.md « Groups from a server »): `@dzgrid/dom/grouping`
// on `serverSideRows` — the painter on the model's rows, setBy forwarded, the server's totals in the group and totals rows,
// the open groups' loading row and its sentence once loaded, rowGroups restored in one request, the export's group part;
// refusals kept for `sourceRows` and `infiniteRows`. Expectations written by hand from the sheets.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { makeQuery, type ColumnDef, type GridEvent, type RowKey } from '@dzgrid/core';
import { serverSideRows, type ServerSideModel } from '@dzgrid/core/server-side';
import { infiniteRows } from '@dzgrid/core/infinite';
import { sourceRows, type DataRequest, type DataSource } from '@dzgrid/core/server';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridContext } from '../src/context.js';
import { grouping } from '../src/grouping.js';
import { gridState } from '../src/state.js';
import { csvExport, type CsvExportOptions } from '../src/export.js';
import { EN } from '../src/locales/en.js';
import { EN_GROUP } from '../src/locales/en-group.js';
import { EN_EXPORT } from '../src/locales/en-export.js';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { edit } from '../src/edit.js';
import { dataKey } from '@dzgrid/core';

type R = { id: string; region: string; qty: number };
let grids: GridInstance<R, any>[] = []; // any: the grid's second parameter (its features) is not under test
beforeEach(() => void vi.useFakeTimers());
afterEach(() => {
  for (const g of grids) g.destroy();
  grids = [];
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const geometry = (): Geometry => {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 400, inline: 600, scrollTop: 0, scrollInline: 0 };
  return { read: () => ({ ...box }), writeScrollTop: (t) => void (box.scrollTop = t), writeScrollInline: () => {} };
};
const COLS: ColumnDef<R, any>[] = [{ id: 'region', header: 'Region' }, { id: 'qty', header: 'Qty', type: 'number', aggFunc: 'sum' }]; // any: the column's value type is not under test
const text = { locale: EN.locale, text: { ...EN.text, ...EN_GROUP.text, ...EN_EXPORT.text } };

/** A grid on a server answered by the test; `binding` another source than `serverSideRows`. */
function make(o: { features?: unknown[]; binding?: 'source' | 'infinite'; settings?: object } = {}) {
  const calls: { req: DataRequest; ok(v: unknown): void; no(e: unknown): void }[] = [];
  const data: DataSource<R> = {
    // A thenable answered by the test: answers land synchronously.
    fetch: (req) => ({ then(ok: (v: never) => void, no: (e: unknown) => void) { calls.push({ req, ok: ok as never, no }); } }) as never,
  };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const source = o.binding === 'source' ? sourceRows(data, { paging: 'offset' }) : o.binding === 'infinite' ? infiniteRows(data, { blockSize: 10 }) : serverSideRows(data, { blockSize: 10 });
  const g = createGrid<R>(host, {
    source, getRowId: (r: R) => r.id, columns: COLS, messages: text, rowHeight: 40, locale: 'en-US',
    ...(o.binding === 'source' && { operations: 'server', pagination: { pageSize: 10 } }),
    onEvent: (e: GridEvent<R>) => events.push(e), features: o.features ?? [grouping({ by: ['region'], footers: 'both' })], ...o.settings,
  } as never, { geometry: geometry(), sync: true }) as GridInstance<R, any>; // never: a server's settings without its query type
  grids.push(g);
  const q = (s: string) => host.querySelector<HTMLElement>(s);
  const row = (i: number) => q(`.dzg-body .dzg-row[aria-rowindex="${i + 2}"]`)!;
  const said = vi.spyOn((g as unknown as { context: GridContext<unknown> }).context.live, 'announce');
  const groups = (c: (typeof calls)[number], values: string[], extra: object = {}) => c.ok({ groups: values.map((value, i) => ({ value, count: 2 + i, aggs: { qty: 1000 + i } })), total: values.length, ...extra });
  const leaves = (c: (typeof calls)[number], n: number) => c.ok({ rows: Array.from({ length: n }, (_, j) => ({ id: `${c.req.group!.path[0]}${j}`, region: String(c.req.group!.path[0]), qty: 1 })), total: n });
  const model = g.kernel.rows as unknown as ServerSideModel<R>;
  return { g, host, calls, events, q, row, said, groups, leaves, model, vp: q('.dzg-viewport')! };
}
const told = (events: GridEvent<R>[]) => events.flatMap((e) => (e.type === 'problems' ? e.problems.map((p) => `${p.code} ${p.path}${p.detail ? ` ${p.detail}` : ''}`) : []));
const cellText = (r: HTMLElement, col: string) => r.querySelector<HTMLElement>(`[data-col=${col}]`)!.textContent;

describe('grouping on a server-side model: the rows drawn', () => {
  it('one grouped request at creation; group rows « value (n) » with the server\'s totals; a treegrid; the grand total the server\'s', () => {
    const t = make();
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]!.req.group).toEqual({ by: ['region'], path: [], aggs: [{ column: 'qty', fn: 'sum' }] });
    t.groups(t.calls[0]!, ['Nord', 'Sud'], { totals: { qty: 77 } });
    expect(t.vp.getAttribute('role')).toBe('treegrid');
    const r = t.row(0);
    expect(r.querySelector('.dzg-label')!.textContent).toBe('Nord (2)');
    expect(cellText(r, 'qty')).toBe('1,000');
    expect([r.getAttribute('aria-level'), r.getAttribute('aria-posinset'), r.getAttribute('aria-setsize'), r.getAttribute('aria-expanded')]).toEqual(['1', '1', '3', 'false']);
    const grand = t.row(2);
    expect(grand.querySelector('.dzg-label')!.textContent).toBe('Total');
    expect(cellText(grand, 'qty')).toBe('77');
    expect(t.events.some((e) => e.type === 'problems')).toBe(false);
  });

  it('a group opened: one « Loading… » row under it, its rows once asked; said once loaded, with its rows; its footer the server\'s total', () => {
    const t = make();
    t.groups(t.calls[0]!, ['Nord', 'Sud']);
    t.row(0).querySelector<HTMLElement>('[data-col=region]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: t.g.kernel.rows.displayed.keyAt(0 as never), column: 'region' } }, 'api'); // never: a position of the rows shown
    t.row(0).querySelector<HTMLElement>('[data-col=region]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const l = t.row(1);
    expect(l.getAttribute('data-kind')).toBe('loading');
    expect(l.getAttribute('aria-busy')).toBe('true');
    expect(l.textContent).toContain('Loading…');
    expect(t.said.mock.calls).toEqual([]);
    const c = t.calls.at(-1)!;
    expect(c.req.group!.path).toEqual(['Nord']);
    t.leaves(c, 2);
    expect(t.said.mock.calls.map((x) => x[0])).toEqual(['Nord expanded, 2 rows']);
    expect(cellText(t.row(1), 'region')).toBe('Nord');
    expect(t.row(1).getAttribute('aria-level')).toBe('2');
    const foot = t.row(3);
    expect(foot.querySelector('.dzg-label')!.textContent).toBe('Total Nord');
    expect(cellText(foot, 'qty')).toBe('1,000');
  });

  it('a group whose rows fail: its loading row says the error with Retry, which asks them again', () => {
    const t = make();
    t.groups(t.calls[0]!, ['Nord']);
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [t.g.kernel.rows.displayed.keyAt(0 as never)], expanded: true }, 'user'); // never: as above
    t.calls.at(-1)!.no(new Error('down'));
    const r = t.row(1);
    expect(r.textContent).toContain('The data could not be loaded');
    const n = t.calls.length;
    r.querySelector<HTMLButtonElement>('.dzg-retry')!.click();
    // The window asked again (D10 A): the first level's block and the group's.
    expect(t.calls.slice(n).map((c) => c.req.group!.path)).toContainEqual(['Nord']);
  });
  it('a group whose rows come without a total: its rows say an unknown set size, aria-setsize -1 (Phase 11 R6)', () => {
    const t = make({ features: [grouping({ by: ['region'] })] });
    t.groups(t.calls[0]!, ['Nord', 'Sud']);
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [t.g.kernel.rows.displayed.keyAt(0 as never)], expanded: true }, 'user'); // never: a position of the rows shown
    // A full block (10) and more to come: the level's size unknown.
    t.calls.at(-1)!.ok({ rows: Array.from({ length: 10 }, (_, j) => ({ id: `n${j}`, region: 'Nord', qty: j + 1 })), hasNext: true });
    const r = t.row(2);
    expect(cellText(r, 'qty')).toBe('2');
    expect([r.getAttribute('aria-level'), r.getAttribute('aria-posinset'), r.getAttribute('aria-setsize')]).toEqual(['2', '2', '-1']);
    expect(t.row(0).getAttribute('aria-setsize')).toBe('2');
  });

  it('`*` beside a group of a million rows, a few held: the closed siblings open, the loading rows never walked (Phase 11 R2)', () => {
    const t = make({ features: [grouping({ by: ['region'] })] });
    t.groups(t.calls[0]!, ['Nord', 'Sud', 'Est']);
    const nord = t.g.kernel.rows.displayed.keyAt(0 as never); // never: a position of the rows shown
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [nord], expanded: true }, 'user');
    t.calls.at(-1)!.ok({ rows: Array.from({ length: 10 }, (_, j) => ({ id: `n${j}`, region: 'Nord', qty: 1 })), total: 1_000_000 });
    const d = t.g.kernel.rows.displayed as unknown as { levelAt(i: number): number; nodeAt(i: number): unknown }; // a grouped view's reads, counted
    const level = vi.spyOn(d, 'levelAt');
    const node = vi.spyOn(d, 'nodeAt');
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: nord, column: 'region' } }, 'api');
    const n = t.events.length;
    t.row(0).querySelector<HTMLElement>('[data-col=region]')!.dispatchEvent(new KeyboardEvent('keydown', { key: '*', bubbles: true }));
    const opened = t.events.slice(n).filter((e) => e.type === 'rowExpanded') as Extract<GridEvent<R>, { type: 'rowExpanded' }>[];
    expect(opened.map((e) => [e.rows.length, e.expanded])).toEqual([[2, true]]);
    expect(level.mock.calls.length + node.mock.calls.length).toBeLessThan(1_000);
  });
});

describe('grouping on a server-side model: what is forwarded', () => {
  it('setBy asks the server again (a new epoch), told by groupByChanged; the open groups are kept', () => {
    const grp = grouping({ by: ['region'] });
    const t = make({ features: [grp] });
    t.groups(t.calls[0]!, ['Nord']);
    const key = t.g.kernel.rows.displayed.keyAt(0 as never); // never: as above
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [key], expanded: true }, 'user');
    grp.api(t.g as never)!.setBy(['qty', 'region'], { user: true }); // never: the grid's row type against the feature's own
    expect(t.calls.at(-1)!.req.group).toMatchObject({ by: ['qty', 'region'], path: [] });
    expect(t.events.filter((e) => e.type === 'groupByChanged').map((e) => (e as { by: readonly string[] }).by)).toEqual([['qty', 'region']]);
    expect(t.g.kernel.expansion.has(key)).toBe(true);
    expect(grp.api(t.g as never)!.by()).toEqual(['qty', 'region']); // never: as above
  });

  it('a saved state with a sort and rowGroups restores in one request', () => {
    const st = gridState({ initial: { v: 1, sort: [{ column: 'qty', dir: 'desc' }], rowGroups: ['qty'] } });
    const t = make({ features: [st, grouping({ by: ['region'] })] });
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]!.req).toMatchObject({ sort: [{ column: 'qty', dir: 'desc' }], group: { by: ['qty'], path: [] } });
    // The other order of the features: the same one request.
    const u = make({ features: [grouping({ by: ['region'] }), gridState({ initial: { v: 1, rowGroups: ['qty'] } })] });
    expect(u.calls.map((c) => c.req.group!.by)).toEqual([['qty']]);
  });

  it('the export of « all » goes to exportAll with the group part, no block; expand all opens the groups held', async () => {
    vi.useRealTimers();
    const asked: { server?: Record<string, unknown> }[] = [];
    const ex = csvExport({ canExport: true, deliver: () => {}, loadRun: () => import('../src/export/run/index.js'), exportAll: async (r) => void asked.push(r as never) } as CsvExportOptions); // never: the request read as a record
    const grp = grouping({ by: ['region'] });
    const t = make({ features: [grp, ex] });
    t.groups(t.calls[0]!, ['Nord', 'Sud']);
    expect(await ex.run('all')).toBe('done');
    expect(asked[0]!.server).toMatchObject({ group: { by: ['region'], path: [], aggs: [{ column: 'qty', fn: 'sum' }] } });
    expect(asked[0]!.server).not.toHaveProperty('page');
    expect(asked[0]!.server).not.toHaveProperty('blocks');
    const n = t.calls.length;
    grp.api(t.g as never)!.expandAll(); // never: as above
    expect(t.g.kernel.expansion.size).toBe(2);
    // Only the window asks: both groups' loading rows are in view.
    expect(t.calls.length - n).toBe(2);
  });
});

describe('grouping on a server-side model: live updates and edits (step 8)', () => {
  /** Nord opened, its two rows drawn. */
  const opened = (t: ReturnType<typeof make>) => {
    t.groups(t.calls[0]!, ['Nord', 'Sud']);
    t.model.expand([t.g.kernel.rows.displayed.keyAt(0 as never)], true); // never: a position of the rows shown
    t.leaves(t.calls.at(-1)!, 2);
  };

  it('a patch of a row held shows at once in its place, and the window is asked again behind (the server\'s totals)', () => {
    const t = make();
    opened(t);
    const n = t.calls.length;
    const r = t.model.applyTransaction({ patch: [{ id: 'Nord1', set: { qty: 42 } }] });
    expect(r.updated).toEqual([dataKey('Nord1')]);
    expect(cellText(t.row(2), 'qty')).toBe('42');
    expect(t.calls.slice(n).map((c) => c.req.group!.path)).toContainEqual([]);
    // Rows kept while asked again: the group row is still drawn above its rows.
    expect(t.row(0).querySelector('.dzg-label')!.textContent).toBe('Nord (2)');
  });

  it('an edit of a totalled column: shown in place, the order said stale; reapply asks again and the answer ends it', async () => {
    const ed = edit({ save: () => Promise.resolve() });
    const t = make({ features: [grouping({ by: ['region'] }), ed], settings: { messages: { locale: 'en', text: { ...text.text, ...EN_EDIT.text } }, columns: [COLS[0], { ...COLS[1], editable: true }] } });
    opened(t);
    const ea = ed.api(t.g as never)!; // never: the grid's row type against the feature's own
    ea.commit([{ key: dataKey('Nord0')!, column: 'qty', input: { text: '9' } }]);
    await Promise.resolve();
    expect(cellText(t.row(1), 'qty')).toBe('9');
    expect(t.events.filter((e) => e.type === 'orderStale').map((e) => (e as { stale: boolean }).stale)).toEqual([true]);
    const n = t.calls.length;
    ea.reapply();
    const top = t.calls.slice(n).find((c) => c.req.group!.path.length === 0)!;
    expect(top).toBeDefined();
    t.groups(top, ['Nord', 'Sud']);
    expect(t.events.filter((e) => e.type === 'orderStale').map((e) => (e as { stale: boolean }).stale)).toEqual([true, false]);
  });
});

describe('grouping beside other servers: refused as before', () => {
  it('beside sourceRows or infiniteRows grouping steps aside (unsupported-combination, source); the rows flat', () => {
    const a = make({ binding: 'source' });
    expect(told(a.events)).toContain('unsupported-combination source grouping');
    expect(a.calls[0]!.req.group).toBeUndefined();
    const b = make({ binding: 'infinite' });
    expect(told(b.events)).toEqual(expect.arrayContaining(['unsupported-combination source grouping', 'unsupported-combination shape group']));
    expect(b.vp.getAttribute('role')).toBe('grid');
  });

  it('a filter typed by the user goes to every level as its wire form; nothing of a row in any problem', () => {
    const t = make();
    t.g.kernel.dispatch({ type: 'query.set', query: makeQuery({ quick: 'zz' }) } as never, 'user'); // the query command's shape is the kernel's, not under test
    t.groups(t.calls.at(-1)!, ['Nord']);
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [t.g.kernel.rows.displayed.keyAt(0 as never) as RowKey], expanded: true }, 'user'); // never: as above
    expect(t.calls.at(-1)!.req).toMatchObject({ quick: 'zz', group: { path: ['Nord'] } });
    expect(JSON.stringify(told(t.events))).not.toContain('Nord');
  });
});
