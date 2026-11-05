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
import { range } from '../src/range.js';
import { csvExport, type CsvExportOptions } from '../src/export.js';
import { edit } from '../src/edit.js';
import { EN_RANGE } from '../src/locales/en-range.js';
import { EN_EXPORT } from '../src/locales/en-export.js';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { EN_FILL } from '../src/locales/en-fill.js';
import { fill } from '../src/fill.js';
import type { GridContext } from '../src/context.js';

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
function server(total: number | null, o: { features?: unknown[]; options?: object; settings?: object; env?: object } = {}) {
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
  const g = createGrid<R>(host, settings as never, { geometry: geometry(), sync: true, ...o.env }) as GridInstance<R, any> & { scroll: { readonly logicalTop: number; scrollTo(l: number): void } };
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
    // The bar's note fits a list with no pages (find.md « A list loaded in blocks »).
    expect(t.q('.dzg-find-note')!.textContent).toBe('Loaded rows only');
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

  it('find: a bundle made before 1.6, without find.held, shows the page\'s note', () => {
    const fd = find({ debounceMs: 0 });
    const { 'find.held': _, ...old } = EN_FIND.text;
    const t = server(100, { features: [fd], settings: { messages: { locale: EN.locale, text: { ...EN.text, ...old } } } });
    t.answer(t.calls[0]!);
    fd.api(t.g)!.open('n1');
    expect(t.q('.dzg-find-note')!.textContent).toBe('Loaded page only');
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

describe('infinite scroll: step 5 — the block of cells, exports, edits, live updates (D11, D16)', () => {
  const texts = { locale: EN.locale, text: { ...EN.text, ...EN_RANGE.text, ...EN_EXPORT.text, ...EN_EDIT.text, ...EN_FILL.text } };
  const ctxOf = (g: unknown) => (g as { context: GridContext<unknown> }).context;
  const told = (t: ReturnType<typeof server>) => t.events.flatMap((e) => (e.type === 'problems' ? e.problems.map((p) => `${p.code} ${p.severity} ${p.path}`) : []));

  it('a block of cells across rows not loaded: copy, cut, paste and erase refused (rows-not-loaded), said; inside the rows held it copies', () => {
    const blocks = range();
    const t = server(1000, { features: [blocks], settings: { messages: texts } });
    t.answer(t.calls[0]!);
    const said = vi.spyOn(ctxOf(t.g).live, 'announce');
    const api = blocks.api(t.g)!;
    expect(api.set({ anchor: { row: dataKey('r2')!, column: 'name' }, focus: { row: 'l:#15' as RowKey, column: 'id' } })).toBe(true);
    expect(api.copy()).toBeNull();
    expect(api.cut()).toBeNull();
    expect(api.paste('a\tb')).toBeNull();
    expect(api.erase()).toBeNull();
    expect(told(t).filter((x) => x.startsWith('rows-not-loaded'))).toEqual(Array(4).fill('rows-not-loaded warning range'));
    expect(said.mock.calls.map((c) => c[0])).toEqual(Array(4).fill('Some rows are not loaded yet'));
    expect(t.events.some((e) => e.type === 'rangeCopied')).toBe(false);
    // The block answered: the same block copies.
    t.answer(t.block(1));
    expect(api.set({ anchor: { row: dataKey('r2')!, column: 'name' }, focus: { row: dataKey('r15')!, column: 'id' } })).toBe(true);
    expect(api.copy()!.text.split('\r\n').filter(Boolean)).toHaveLength(14);
  });

  it('close review: a paste taller than the rows held below its cell is refused (rows-not-loaded), never walked to the end', () => {
    const blocks = range();
    const t = server(1000, { features: [blocks, edit({ save: () => Promise.resolve() })], settings: { messages: texts, columns: [{ id: 'name', editable: true }, { id: 'id' }] } });
    t.answer(t.calls[0]!);
    const api = blocks.api(t.g)!;
    api.set({ anchor: { row: dataKey('r8')!, column: 'name' }, focus: { row: dataKey('r8')!, column: 'id' } });
    expect(api.paste('a\nb\nc\nd')).toMatchObject({ pasted: 0 });
    expect(told(t)).toContain('rows-not-loaded warning range');
    expect(api.paste('a\nb')).toMatchObject({ outside: 0 });
  });

  it('the fill: a target or a block over rows not loaded fills nothing (never with holes); inside the rows held it fills', () => {
    const saves: unknown[] = [];
    const blocks = range();
    const f = fill(blocks);
    const t = server(1000, { features: [blocks, f, edit({ save: (c) => (saves.push(c), Promise.resolve()) })], settings: { messages: texts, columns: [{ id: 'name', editable: true }, { id: 'id' }] } });
    t.answer(t.calls[0]!);
    const fa = f.api(t.g as never)!; // never: the grid's row type against the feature's own
    blocks.api(t.g)!.set({ anchor: { row: dataKey('r2')!, column: 'name' }, focus: { row: dataKey('r3')!, column: 'name' } });
    expect(fa.fill({ row: 'l:#14' as RowKey, column: 'name' })).toBeNull();
    blocks.api(t.g)!.set({ anchor: { row: dataKey('r2')!, column: 'name' }, focus: { row: 'l:#14' as RowKey, column: 'name' } });
    expect(fa.down()).toBeNull();
    expect(fa.apply({ text: 'x' })).toBeNull();
    blocks.api(t.g)!.set({ anchor: { row: dataKey('r2')!, column: 'name' }, focus: { row: dataKey('r3')!, column: 'name' } });
    expect(fa.fill({ row: dataKey('r6')!, column: 'name' })).toMatchObject({ filled: 3 });
  });

  it('Ctrl+A on ten million rows: its size said from the rows held, its copy refused, both fast', () => {
    const blocks = range();
    const t = server(10_000_000, { features: [blocks], settings: { messages: texts } });
    t.answer(t.calls[0]!);
    const said = vi.spyOn(ctxOf(t.g).live, 'announce');
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: dataKey('r0')!, column: 'name' } }, 'api');
    const t0 = performance.now();
    t.row(0)!.querySelector<HTMLElement>('[data-col=name]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true }));
    expect(blocks.api(t.g)!.box()).toMatchObject({ top: 0, bottom: 9_999_999 });
    vi.advanceTimersByTime(400);
    expect(said.mock.calls.map((c) => c[0])).toEqual(['10 rows, 2 columns selected']);
    expect(blocks.api(t.g)!.copy()).toBeNull();
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  it('CSV of « displayed »: the rows held, in order, its count said; « all » and « selected » go to exportAll with the server part, no block', async () => {
    vi.useRealTimers();
    const delivered: Blob[] = [];
    const asked: unknown[] = [];
    const exporter = csvExport({ canExport: true, deliver: (d) => void delivered.push(d.blob!), loadRun: () => import('../src/export/run/index.js'), exportAll: async (r) => void asked.push(r) } as CsvExportOptions);
    const t = server(1000, { features: [exporter], settings: { messages: texts, selection: { mode: 'multi' } } });
    t.answer(t.calls[0]!);
    // Blocks 0 and 1 held, the rest loading: the file has 20 rows.
    t.answer(t.block(1));
    expect(await exporter.run('displayed')).toBe('done');
    const text = await delivered[0]!.text();
    expect(text.trim().split('\r\n')).toHaveLength(21);
    expect(text).toContain('n19');
    expect(t.events.find((e) => e.type === 'exportRequested')).toMatchObject({ count: 20 });
    expect(await exporter.run('all')).toBe('done');
    t.g.kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(await exporter.run('selected')).toBe('done');
    expect(asked).toHaveLength(2);
    const [all, sel] = asked as { scope: string; count: number | null; server: Record<string, unknown>; selection?: { mode: string } }[];
    expect(all).toMatchObject({ scope: 'all', count: 1000 });
    expect(all!.server).not.toHaveProperty('page');
    expect(all!.server).not.toHaveProperty('blocks');
    expect(all!.server).toMatchObject({ params: {}, zone: expect.any(String) });
    expect(sel).toMatchObject({ scope: 'selected', count: 1000, selection: { mode: 'exclude' } });
  });

  it('an edit of a row held: saved and shown in place; an edit of the sorted column marks the order stale, reapply asks the window again', async () => {
    const saves: unknown[] = [];
    const ed = edit({ save: (c) => (saves.push(c), Promise.resolve()) });
    const t = server(1000, { features: [ed], settings: { messages: texts, columns: [{ id: 'name', editable: true }, { id: 'id' }] } });
    t.answer(t.calls[0]!);
    t.g.kernel.dispatch({ type: 'sort.toggle', column: 'name', multi: false }, 'user');
    t.answer(t.calls.at(-1)!);
    // The window's other blocks answered: nothing runs.
    for (const c of t.calls.slice(-2)) t.answer(c);
    const ea = ed.api(t.g as never)!; // never: the grid's row type against the feature's own
    ea.commit([{ key: dataKey('r3')!, column: 'name', input: { text: 'zed' } }]);
    await Promise.resolve();
    expect(t.row(3)!.querySelector('[data-col=name]')!.textContent).toBe('zed');
    expect(t.events.filter((e) => e.type === 'orderStale').map((e) => (e as { stale: boolean }).stale)).toEqual([true]);
    const n = t.calls.length;
    ea.reapply();
    expect(t.calls.slice(n).map((c) => c.req.page!.index)).toContain(0);
    expect(t.row(3)!.getAttribute('data-kind')).toBeNull();
    t.answer(t.calls.slice(n).find((c) => c.req.page!.index === 0)!);
    expect(t.events.filter((e) => e.type === 'orderStale').map((e) => (e as { stale: boolean }).stale)).toEqual([true, false]);
  });

  it('100 live updates in one async batch on 2 000 rows held: one change, one paint, at the next frame', () => {
    const frames: FrameRequestCallback[] = [];
    const raf = { requestAnimationFrame: (f: FrameRequestCallback) => frames.push(f), cancelAnimationFrame: () => {} };
    let paints = 0;
    const count = { id: 'count', setup: () => ({ afterRows: () => void paints++, destroy() {} }) };
    const t = server(10_000, { features: [count], options: { blockSize: 100, maxBlocks: 20 }, env: { raf } });
    t.answer(t.calls[0]!);
    for (const c of t.calls.slice(1)) t.answer(c);
    const m = t.model;
    const updates = t.events.length;
    paints = 0;
    for (let i = 0; i < 100; i++) m.applyTransactionAsync({ update: [{ id: `r${i}`, name: `u${i}` }] });
    expect(t.events.length).toBe(updates);
    expect(frames).toHaveLength(1);
    frames.splice(0).forEach((f) => f(0));
    expect(t.events.slice(updates).filter((e) => e.type === 'modelUpdated')).toHaveLength(1);
    expect(paints).toBe(1);
    expect(t.row(5)!.querySelector('[data-col=name]')!.textContent).toBe('u5');
  });
});
