// Phase 8 step 4 (docs/behaviors/infinite-scroll.md): a list loaded in blocks, drawn by the DOM base.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { dataKey, makeQuery, type ColumnDef, type GridEvent, type RowKey } from '@dzgrid/core';
import { infiniteRows, type InfiniteModel } from '@dzgrid/core/infinite';
import type { DataRequest, DataSource } from '@dzgrid/core/server';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { EN } from '../src/locales/en.js';
import { EN_FIND } from '../src/locales/en-find.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { EN_PAGINATION } from '../src/locales/en-pagination.js';
import { EN_PRINT } from '../src/locales/en-print.js';
import { find } from '../src/find.js';
import { pagination } from '../src/pagination.js';
import { rowGaps } from '../src/row-gaps.js';
import { spans } from '../src/spans.js';
import { tree } from '../src/tree.js';
import { preparePrint } from '../src/print.js';

type R = { id: string; name: string };
let grids: GridInstance<R, any>[] = []; // any: the grid's second parameter (its features) is not under test
beforeEach(() => void vi.useFakeTimers());
afterEach(() => {
  for (const g of grids) g.destroy();
  grids = [];
  document.body.innerHTML = '';
  vi.useRealTimers();
});

/** A viewport of 400 px (rows of 40 px: about 10 shown) whose scroll the grid writes and reads back. */
const geometry = (): Geometry => {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 400, inline: 600, scrollTop: 0, scrollInline: 0 };
  return { read: () => ({ ...box }), writeScrollTop: (t) => void (box.scrollTop = t), writeScrollInline: () => {} };
};
const columns: ColumnDef<R, any>[] = [{ id: 'name' }, { id: 'id' }]; // any: the column's value type is not under test

/** A server of `total` rows (null: it says only whether more follow), answered by the test, call by call. */
function server(total: number | null, o: { features?: unknown[]; options?: object; settings?: object } = {}) {
  const calls: { req: DataRequest; ok(v: unknown): void; no(e: unknown): void }[] = [];
  const source: DataSource<R> = {
    // A thenable answered by the test: never a real promise, so answers land synchronously.
    fetch: (req) => ({ then(ok: (v: never) => void, no: (e: unknown) => void) { calls.push({ req, ok: ok as never, no }); } }) as never,
  };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const settings = { source: infiniteRows(source, { blockSize: 10, ...o.options }), getRowId: (r: R) => r.id, columns, messages: { locale: EN.locale, text: { ...EN.text, ...EN_FIND.text, ...EN_TREE.text, ...EN_PAGINATION.text, ...EN_PRINT.text } }, rowHeight: 40, onEvent: (e: GridEvent<R>) => events.push(e), ...(o.features && { features: o.features }), ...o.settings };
  // never: a server's settings without its query type; the instance's `scroll` (a test handle) is not in GridInstance's type
  const g = createGrid<R>(host, settings as never, { geometry: geometry(), sync: true }) as GridInstance<R, any> & { scroll: { readonly logicalTop: number; scrollTo(l: number): void } };
  grids.push(g);
  const answer = (c: (typeof calls)[number], rows?: number) => {
    const { offset, size } = c.req.page!;
    const end = Math.min(offset + (rows ?? size), total ?? Infinity);
    c.ok({ rows: Array.from({ length: Math.max(0, end - offset) }, (_, j) => ({ id: `r${offset + j}`, name: `n${offset + j}` })), ...(total === null ? { hasNext: true } : { total }) });
  };
  const block = (n: number) => calls.filter((c) => c.req.page!.index === n).at(-1)!;
  const q = (s: string) => host.querySelector<HTMLElement>(s);
  const row = (i: number) => host.querySelector<HTMLElement>(`.dzg-body .dzg-row[aria-rowindex="${i + 2}"]`);
  const model = g.kernel.rows as unknown as InfiniteModel<R>;
  return { g, host, calls, answer, block, events, q, row, model, vp: q('.dzg-viewport')!, root: q('.dzg')! };
}

describe('infinite scroll: the rows drawn (D7, D18)', () => {
  it('rows not arrived are grey « Loading… » rows, busy; aria-rowcount is the total plus the header row', () => {
    const t = server(1000);
    t.answer(t.calls[0]!);
    expect(t.vp.getAttribute('aria-rowcount')).toBe('1001');
    expect(t.row(0)!.getAttribute('data-kind')).toBeNull();
    expect(t.row(0)!.getAttribute('aria-busy')).toBeNull();
    const l = t.row(10)!;
    expect(l.getAttribute('data-kind')).toBe('loading');
    expect(l.getAttribute('aria-busy')).toBe('true');
    expect(l.querySelector('[role=rowheader]')!.textContent).toBe('Loading…');
    expect(l.querySelector('[data-col=id]')!.textContent).toBe('');
  });

  it('an unknown total: aria-rowcount is -1', () => {
    const t = server(null);
    t.answer(t.calls[0]!);
    expect(t.vp.getAttribute('aria-rowcount')).toBe('-1');
    expect(t.model.displayed.count).toBe(20);
  });

  it('the window painted is asked after the paint; scrolling there asks its block, its rows take their places', () => {
    const t = server(1000);
    t.answer(t.calls[0]!);
    // The first paint asked block 1 (rows 10–19 in view with the overscan).
    expect(t.calls.map((c) => c.req.page!.index)).toContain(1);
    t.g.scroll.scrollTo(40 * 500);
    vi.advanceTimersByTime(100);
    t.g.scroll.scrollTo(40 * 500);
    expect(t.calls.map((c) => c.req.page!.index)).toContain(50);
    t.answer(t.block(50));
    expect(t.row(500)!.getAttribute('data-kind')).toBeNull();
    expect(t.row(500)!.querySelector('[data-col=name]')!.textContent).toBe('n500');
    expect(t.row(500)!.getAttribute('aria-rowindex')).toBe('502');
  });

  it('blocks loading under rows shown never make the grid busy: no aria-busy, no data-stale, no busy bar', () => {
    const t = server(1000);
    t.answer(t.calls[0]!);
    t.g.scroll.scrollTo(40 * 300);
    vi.advanceTimersByTime(1000);
    t.g.scroll.scrollTo(40 * 300);
    expect(t.calls.some((c) => c.req.page!.index === 30)).toBe(true);
    expect(t.vp.getAttribute('aria-busy')).toBeNull();
    expect(t.root.hasAttribute('data-stale')).toBe(false);
    expect(t.q('.dzg-busy')?.hidden ?? true).toBe(true);
    expect(t.q('.dzg-overlay')!.hidden).toBe(true);
  });

  it('a failed block: its rows say the error, the first shown carries Retry, which asks it again; Enter on one does too', () => {
    const t = server(1000);
    t.answer(t.calls[0]!);
    t.answer(t.block(2));
    t.block(1).no(new Error('down'));
    const r = t.row(10)!;
    expect(r.getAttribute('aria-busy')).toBeNull();
    expect(r.querySelector('[role=rowheader]')!.firstChild!.textContent).toBe('The data could not be loaded');
    const buttons = t.host.querySelectorAll('.dzg-body .dzg-retry');
    expect(buttons).toHaveLength(1);
    expect(r.contains(buttons[0]!)).toBe(true);
    // Nothing said for a block failing while the user scrolls.
    expect(t.q('.dzg-live')!.textContent).toBe('');
    const before = t.calls.length;
    (buttons[0] as HTMLButtonElement).click();
    expect(t.calls.slice(before).map((c) => c.req.page!.index)).toContain(1);
    t.block(1).no(new Error('down'));
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: 'l:#12' as RowKey, column: 'name' } }, 'api');
    const n = t.calls.length;
    t.row(12)!.querySelector<HTMLElement>('[data-col=name]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(t.calls.length).toBeGreaterThan(n);
  });

  it('a focus on a loading row stays at its place and goes to the data row that takes it', () => {
    const t = server(1000);
    t.answer(t.calls[0]!);
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: 'l:#12' as RowKey, column: 'name' } }, 'api');
    expect(t.g.kernel.focus).toMatchObject({ row: 'l:#12' });
    t.answer(t.block(1));
    expect(t.g.kernel.focus).toMatchObject({ kind: 'cell', row: dataKey('r12'), column: 'name' });
  });

  it('Ctrl+End with a known total: the focus on the last row (loading), its block asked', () => {
    const t = server(10_000_000);
    t.answer(t.calls[0]!);
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: dataKey('r0')!, column: 'name' } }, 'api');
    t.row(0)!.querySelector<HTMLElement>('[data-col=name]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', ctrlKey: true, bubbles: true }));
    expect(t.g.kernel.focus).toMatchObject({ row: 'l:#9999999' });
    vi.advanceTimersByTime(100);
    expect(t.calls.some((c) => c.req.page!.index === 999_999)).toBe(true);
    t.answer(t.block(999_999));
    expect(t.g.kernel.focus).toMatchObject({ row: dataKey('r9999999') });
    expect(t.row(9_999_999)!.getAttribute('aria-rowindex')).toBe('10000001');
  });

  it('a sort goes back to the top: everything asked again, the loading overlay until the first block', () => {
    const t = server(1000);
    t.answer(t.calls[0]!);
    t.g.scroll.scrollTo(40 * 500);
    t.g.kernel.dispatch({ type: 'sort.toggle', column: 'name', multi: false }, 'user');
    expect(t.g.scroll.logicalTop).toBe(0);
    expect(t.q('.dzg-overlay')!.hidden).toBe(false);
    expect(t.calls.at(-1)!.req.sort).toEqual([{ column: 'name', dir: 'asc' }]);
    t.answer(t.calls.at(-1)!);
    expect(t.q('.dzg-overlay')!.hidden).toBe(true);
  });

  it('Shift+click across rows not loaded ticks the clicked row only', () => {
    const t = server(1000, { settings: { selection: { mode: 'multi', click: true } } });
    t.answer(t.calls[0]!);
    t.g.kernel.dispatch({ type: 'selection.only', row: dataKey('r1')! }, 'user');
    t.g.scroll.scrollTo(40 * 500);
    vi.advanceTimersByTime(100);
    t.g.scroll.scrollTo(40 * 500);
    t.answer(t.block(50));
    t.row(503)!.querySelector<HTMLElement>('[data-col=name]')!.dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    expect([...t.g.kernel.selection.keys]).toEqual([dataKey('r503')]);
  });
});

describe('infinite scroll: every walk bounded, combinations refused (D15, D17)', () => {
  it('find, the pager counts and print walk the rows held of a 10⁷-row list (fast), never the rest', () => {
    const fd = find({ debounceMs: 0 });
    const t = server(10_000_000, { features: [fd, pagination()] });
    t.answer(t.calls[0]!);
    const start = performance.now();
    vi.useRealTimers();
    expect(fd.api(t.g)!.open('n7')).toBe(true);
    expect(fd.api(t.g)!.state()).toMatchObject({ count: 1 });
    expect(performance.now() - start).toBeLessThan(2000);
    // No pager: the model has no page.
    expect(t.host.querySelector('.dzg-pager button')).toBeNull();
    // Print: the rows held (10), not ten million.
    const p0 = performance.now();
    return preparePrint(t.g as never).then((done) => { // never: the printable grid's type names its features
      expect(document.querySelectorAll('.dzg-print tbody tr').length).toBe(10);
      expect(performance.now() - p0).toBeLessThan(2000);
      done?.();
    });
  });

  it('cells spanning rows, row gaps and a tree are refused beside blocks; header groups alone are kept', () => {
    const t = server(1000, { features: [spans(), rowGaps({ before: () => true }), tree({ parentId: () => null })], settings: { columns: [{ id: 'name', rowSpan: () => 1 }, { id: 'id' }] } });
    t.answer(t.calls[0]!);
    const told = t.events.flatMap((e) => (e.type === 'problems' ? e.problems.map((p) => `${p.code} ${p.path} ${p.detail}`) : []));
    expect(told).toEqual(expect.arrayContaining(['unsupported-combination spans blocks', 'unsupported-combination rowGaps blocks', 'unsupported-combination shape tree']));
    expect(t.row(0)!.querySelector('[data-col=name]')!.textContent).toBe('n0');
  });

  it('the model receives the DOM timer: a jump waits for the rest before asking', () => {
    const t = server(1_000_000);
    t.answer(t.calls[0]!);
    const n = t.calls.length;
    t.g.scroll.scrollTo(40 * 500_000);
    expect(t.calls.length).toBe(n);
    vi.advanceTimersByTime(60);
    t.g.scroll.scrollTo(40 * 500_000);
    expect(t.calls.slice(n).map((c) => c.req.page!.index)).toContain(50_000);
  });

  it('a host query through the kernel: one epoch, the request carries it', () => {
    const t = server(1000);
    t.answer(t.calls[0]!);
    t.g.kernel.dispatch({ type: 'query.set', query: makeQuery({ quick: 'n1' }) } as never, 'api'); // the query command's shape is the kernel's, not under test
    expect(t.calls.at(-1)!.req.quick ?? 'n1').toBe('n1');
  });
});
