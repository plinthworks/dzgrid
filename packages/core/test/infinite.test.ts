import { describe, expect, it } from 'vitest';
import { createColumnModel, createKernel, dataKey, localeCtx, makeQuery, type ModelChange, type RowKey } from '@dzgrid/core';
import { setSelectionGate } from '@dzgrid/core/internal';
import { infiniteRows, type InfiniteModel, type InfiniteOptions } from '@dzgrid/core/infinite';
import type { ModelEnv } from '@dzgrid/core';
import { fakeSource, type Call } from './support/fake-source.js';

/**
 * `@dzgrid/core/infinite` (Phase 8 step 3, docs/behaviors/infinite-scroll.md). Expectations written by hand from the
 * sheet: the request of a block, the list's length known and unknown, the window asked, the cache, the rest rule, a new
 * query, a refresh, a failed block, duplicates, the selection policies, transactions.
 */
type Row = { id: string; name: string };
const row = (i: number): Row => ({ id: `r${i}`, name: `n${i}` });
const rowsAt = (from: number, n: number) => Array.from({ length: n }, (_, j) => row(from + j));

function setup(o: InfiniteOptions = {}, env: Partial<ModelEnv<Row>> = {}) {
  const fake = fakeSource();
  const timers: { fn: () => void; ms: number; off: boolean }[] = [];
  const timer = (fn: () => void, ms: number) => {
    const t = { fn, ms, off: false };
    timers.push(t);
    return () => void (t.off = true);
  };
  const model = infiniteRows<Row>(fake.source, { blockSize: 10, maxBlocks: 4, ...o }).create({
    getRowId: (r) => r.id,
    columns: createColumnModel<Row>([{ id: 'name' }]),
    ctx: localeCtx({ locale: 'en-US' }),
    abort: fake.abort,
    timer,
    ...env,
  }) as InfiniteModel<Row>;
  const changes: ModelChange<Row>[] = [];
  model.subscribe((c) => changes.push(c));
  /** Answers call `c` with the rows of its block, `total` or `hasNext` as given. */
  const answer = (c: Call, extra: { total?: number; hasNext?: boolean; rows?: Row[] } = {}) => {
    const p = c.req.page!;
    c.resolve({ rows: extra.rows ?? rowsAt(p.offset, p.size), ...('total' in extra && { total: extra.total }), ...('hasNext' in extra && { hasNext: extra.hasNext }) });
  };
  const run = () => {
    for (const t of timers.splice(0)) if (!t.off) t.fn();
  };
  const pending = () => fake.calls.filter((c) => !fake.aborted.some(([n]) => n === c.name) && !(c as { done?: boolean }).done);
  const ids = () => {
    const d = model.displayed;
    return Array.from({ length: d.count }, (_, i) => {
      const n = d.nodeAt(d.index(i)!);
      return n.kind === 'data' ? (n.data as Row).id : n.kind === 'loading' ? (n.failed ? '!' : '…') : '?';
    }).join(' ');
  };
  return { fake, model, changes, answer, run, timers, pending, ids };
}

describe('infiniteRows: the request of a block', () => {
  it('asks block 0 at once, as a page by offset with blocks: true, the server part of the query and nothing more', () => {
    const { fake, model } = setup();
    expect(fake.calls).toHaveLength(1);
    const r = fake.calls[0]!.req;
    expect(r.page).toEqual({ index: 0, size: 10, offset: 0, cursor: null });
    expect(r.blocks).toBe(true);
    expect(r.params).toEqual({});
    expect(r.filter ?? {}).toEqual({});
    expect(model.status.phase).toBe('loading');
    expect(model.displayed.count).toBe(0);
    expect(model.page).toBeNull();
    expect(model.ops).toEqual({ filter: 'server', quick: 'server', sort: 'server', page: 'off' });
  });

  it('a known total sizes the list at once: the rows not held are loading rows', () => {
    const { fake, model, answer } = setup();
    answer(fake.calls[0]!, { total: 25 });
    expect(model.status.phase).toBe('idle');
    const d = model.displayed;
    expect(d.count).toBe(25);
    expect(d.dataCount).toBe(10);
    expect(d.nodeAt(d.index(9)!)).toMatchObject({ kind: 'data', key: dataKey('r9') });
    expect(d.nodeAt(d.index(10)!)).toEqual({ key: 'l:#10', kind: 'loading', level: 0, parent: null, failed: false });
    expect(d.indexOf('l:#10' as RowKey)).toBe(10);
    expect(d.indexOf('l:#3' as RowKey)).toBe(-1);
    expect(d.indexOf(dataKey('r4')!)).toBe(4);
    expect(model.counts).toEqual({ total: 25, filtered: 25, displayed: 25 });
  });

  it('an unknown total: the rows answered plus one block of loading rows while more follow; a short block is the end', () => {
    const { fake, model, answer } = setup();
    answer(fake.calls[0]!);
    expect(model.displayed.count).toBe(20);
    expect(model.counts.filtered).toBeNull();
    model.want(10, 19);
    expect(fake.calls[1]!.req.page!.offset).toBe(10);
    answer(fake.calls[1]!, { hasNext: true });
    expect(model.displayed.count).toBe(30);
    model.want(20, 29);
    answer(fake.calls[2]!, { rows: rowsAt(20, 4) });
    expect(model.displayed.count).toBe(24);
    expect(model.counts.filtered).toBe(24);
  });

  it('an empty block past the end ends the list there', () => {
    const { fake, model, answer } = setup();
    answer(fake.calls[0]!);
    model.want(10, 19);
    answer(fake.calls[1]!, { rows: [] });
    expect(model.displayed.count).toBe(10);
  });

  it('a total that shrinks under the view drops the blocks past it', () => {
    const { fake, model, answer } = setup({ maxBlocks: 10 });
    answer(fake.calls[0]!, { total: 100 });
    model.want(50, 59);
    answer(fake.calls[1]!, { total: 100 });
    expect(model.diagnostics.blocks.held).toBe(2);
    model.invalidate();
    // The window's block asked again says 30 now: the list is 30 rows, block 5 is gone.
    const again = fake.calls[fake.calls.length - 1]!;
    expect(again.req.page!.index).toBe(5);
    answer(again, { total: 30, rows: [] });
    expect(model.displayed.count).toBe(50);
  });
});

describe('infiniteRows: asking the window (D6)', () => {
  it('asks the blocks the window touches, then one ahead in the scroll direction; two at once, the rest wait', () => {
    const { fake, model, answer } = setup({ maxBlocks: 10 });
    answer(fake.calls[0]!, { total: 1000 });
    model.want(5, 25);
    // Blocks 1 and 2 asked (0 held), 3 ahead waits.
    expect(fake.calls.slice(1).map((c) => c.req.page!.index)).toEqual([1, 2]);
    answer(fake.calls[1]!);
    expect(fake.calls.slice(1).map((c) => c.req.page!.index)).toEqual([1, 2, 3]);
  });

  it('a waiting block that left the window is never asked; a running one finishes and its rows are kept', () => {
    const { fake, model, answer, run } = setup({ maxBlocks: 10, restMs: 0 });
    answer(fake.calls[0]!, { total: 1000 });
    model.want(10, 39);
    expect(fake.calls.slice(1).map((c) => c.req.page!.index)).toEqual([1, 2]);
    model.want(10, 11);
    run();
    answer(fake.calls[2]!);
    // Block 3 left the window before it was asked; block 2 was running: answered and held.
    expect(fake.calls.slice(1).map((c) => c.req.page!.index)).toEqual([1, 2]);
    expect(model.displayed.nodeAt(model.displayed.index(25)!).kind).toBe('data');
  });

  it('a jump of more than a block asks nothing until the window has rested (restMs), then the blocks where it rests', () => {
    const { fake, model, answer, run, timers } = setup({ maxBlocks: 10 });
    answer(fake.calls[0]!, { total: 100000 });
    model.want(0, 9);
    answer(fake.calls[1]!);
    model.want(5000, 5009);
    model.want(9000, 9009);
    expect(fake.calls).toHaveLength(2);
    expect(timers.at(-1)!.ms).toBe(60);
    run();
    expect(fake.calls.slice(2).map((c) => c.req.page!.index)).toEqual([900, 901]);
  });

  it('two newer blocks waiting: a request running out of the window is aborted and its block forgotten', () => {
    const { fake, model, answer, run } = setup({ maxBlocks: 10, ahead: 0 });
    answer(fake.calls[0]!, { total: 100000 });
    model.want(10, 29);
    expect(fake.calls.slice(1).map((c) => c.req.page!.index)).toEqual([1, 2]);
    model.want(500, 529);
    run();
    expect(fake.aborted.map(([n]) => n)).toContain('c2');
    expect(fake.calls.slice(3).map((c) => c.req.page!.index)).toContain(50);
  });
});

describe('infiniteRows: the cache (D5)', () => {
  it('never holds more than maxBlocks blocks; the least recently seen goes first; the window is never let go', () => {
    const { fake, model, answer } = setup({ maxBlocks: 3, ahead: 0 });
    answer(fake.calls[0]!, { total: 1000 });
    for (let b = 1; b <= 6; b++) {
      model.want(b * 10, b * 10 + 9);
      answer(fake.calls.at(-1)!);
      expect(model.diagnostics.blocks.held).toBeLessThanOrEqual(3);
      expect(model.displayed.nodeAt(model.displayed.index(b * 10)!).kind).toBe('data');
    }
    expect(model.diagnostics.blocks).toMatchObject({ held: 3, evicted: 4, max: 3 });
    // Blocks 4, 5, 6 held: block 1 is loading again, and its keys are gone.
    expect(model.displayed.nodeAt(model.displayed.index(10)!).kind).toBe('loading');
    expect(model.row(dataKey('r10')!)).toBeUndefined();
    expect(model.row(dataKey('r60')!)?.data).toEqual(row(60));
  });

  it('a kept position (the focused row) keeps its block', () => {
    const { fake, model, answer } = setup({ maxBlocks: 2, ahead: 0 });
    answer(fake.calls[0]!, { total: 1000 });
    model.want(0, 9, [3]);
    model.want(10, 19, [3]);
    answer(fake.calls.at(-1)!);
    model.want(20, 29, [3]);
    answer(fake.calls.at(-1)!);
    expect(model.displayed.nodeAt(model.displayed.index(3)!).kind).toBe('data');
    expect(model.displayed.nodeAt(model.displayed.index(10)!).kind).toBe('loading');
  });
});

describe('infiniteRows: a new query purges (D9)', () => {
  it('a sort drops every block, aborts every request, asks block 0 in the same call; old answers are never applied', () => {
    const { fake, model, answer, changes } = setup({ maxBlocks: 10 });
    answer(fake.calls[0]!, { total: 1000 });
    model.want(10, 29);
    const running = fake.calls.slice(1);
    expect(running).toHaveLength(2);
    changes.length = 0;
    model.setQuery(makeQuery({ sort: [{ column: 'name', dir: 'desc' }] }), 'user');
    expect(changes.map((c) => c.kind)).toEqual(['query']);
    expect(model.displayed.count).toBe(0);
    expect(model.status.phase).toBe('loading');
    expect(fake.aborted.filter(([, r]) => r === 'stale-epoch').map(([n]) => n).sort()).toEqual(['c2', 'c3']);
    const first = fake.calls.at(-1)!;
    expect(first.req.page!.index).toBe(0);
    expect(first.req.sort).toEqual([{ column: 'name', dir: 'desc' }]);
    for (const c of running) answer(c);
    expect(model.displayed.count).toBe(0);
    expect(model.diagnostics.gate.dropped['stale-epoch']).toBe(2);
    answer(first, { total: 5, rows: rowsAt(0, 5) });
    expect(model.displayed.count).toBe(5);
    expect(model.diagnostics.blocks.held).toBe(1);
  });

  it('purge: everything dropped and asked again, as a new query', () => {
    const { fake, model, answer } = setup();
    answer(fake.calls[0]!, { total: 30 });
    model.invalidate({ purge: true });
    expect(model.displayed.count).toBe(0);
    expect(fake.aborted).toEqual([]);
    expect(fake.calls).toHaveLength(2);
  });
});

describe('infiniteRows: refresh and failures (D8, D10)', () => {
  it('scrolling blocks in never makes the model loading', () => {
    const { fake, model, answer } = setup();
    answer(fake.calls[0]!, { total: 1000 });
    model.want(10, 19);
    expect(model.status.phase).toBe('idle');
    answer(fake.calls[1]!);
    expect(model.status.phase).toBe('idle');
  });

  it('a refresh asks the window again with its rows kept (loading until it answers), the other blocks stale', () => {
    const { fake, model, answer, changes } = setup({ maxBlocks: 10, ahead: 0 });
    answer(fake.calls[0]!, { total: 1000 });
    model.want(10, 19);
    answer(fake.calls[1]!);
    changes.length = 0;
    model.invalidate();
    expect(model.status.phase).toBe('loading');
    expect(model.displayed.nodeAt(model.displayed.index(10)!).kind).toBe('data');
    const again = fake.calls.at(-1)!;
    expect(again.req.page!.index).toBe(1);
    answer(again, { rows: rowsAt(10, 10).map((r) => ({ ...r, name: 'fresh' })) });
    expect(model.status.phase).toBe('idle');
    expect((model.row(dataKey('r10')!)!.data as Row).name).toBe('fresh');
    // Block 0 is stale: shown again, asked again.
    model.want(0, 9);
    expect(fake.calls.at(-1)!.req.page!.index).toBe(0);
  });

  it('review 1: a block the refresh waited for leaves the window before it is asked: the refresh ends with the others', () => {
    const { fake, model, answer, run } = setup({ maxBlocks: 10, ahead: 0, restMs: 0 });
    answer(fake.calls[0]!, { total: 1000 });
    model.want(50, 79);
    answer(fake.calls[1]!, { total: 1000 });
    answer(fake.calls[2]!, { total: 1000 });
    answer(fake.calls[3]!, { total: 1000 });
    expect(fake.calls.map((c) => c.req.page!.index)).toEqual([0, 5, 6, 7]);
    const n = fake.calls.length;
    model.invalidate();
    expect(model.status.phase).toBe('loading');
    // Blocks 5 and 6 asked again, 7 waits; the window moves off block 7.
    model.want(50, 69);
    run();
    for (const c of fake.calls.slice(n)) answer(c, { total: 1000 });
    expect(model.status.phase).toBe('idle');
  });

  it('review 2: a first block that failed, answered later when shown again: the error is over', () => {
    const { fake, model, answer } = setup({ ahead: 0 });
    fake.calls[0]!.reject('down');
    expect(model.status.phase).toBe('error');
    model.invalidate();
    answer(fake.calls[1]!, { total: 30 });
    expect(model.status.phase).toBe('idle');
  });

  it('a block that fails while scrolling: its rows fail, the model stays idle, nothing is told as the model failure', () => {
    const { fake, model, answer, changes, ids } = setup({ ahead: 0 });
    answer(fake.calls[0]!, { total: 25 });
    model.want(10, 19);
    changes.length = 0;
    fake.calls[1]!.reject(new Error('down'));
    expect(model.status.phase).toBe('idle');
    expect(changes.every((c) => !c.failure)).toBe(true);
    expect(ids().split(' ').slice(9, 12)).toEqual(['r9', '!', '!']);
    expect(model.displayed.indexOf('l:#12' as RowKey)).toBe(12);
    expect(model.diagnostics.blocks.failed).toBe(1);
    // Retry (a refresh): the failed block of the window is asked again.
    model.invalidate();
    expect(fake.calls.at(-1)!.req.page!.index).toBe(1);
    answer(fake.calls.at(-1)!, { rows: rowsAt(10, 10) });
    expect(model.displayed.nodeAt(model.displayed.index(12)!).kind).toBe('data');
  });

  it('the first block failing is the model failure (the overlay), and Retry asks it again', () => {
    const { fake, model, changes } = setup();
    fake.calls[0]!.reject('boom');
    expect(model.status.phase).toBe('error');
    expect(changes.at(-1)!.failure).toMatchObject({ error: 'boom', page: 0 });
    model.invalidate();
    expect(model.status.phase).toBe('loading');
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1]!.req.page!.index).toBe(0);
  });

  it('a malformed answer fails its block and is told (invalid-page-response), never with the rows', () => {
    const { fake, model, answer, changes } = setup({ ahead: 0 });
    answer(fake.calls[0]!, { total: 30 });
    model.want(10, 19);
    fake.calls[1]!.resolve({ nope: true });
    expect(changes.at(-1)!.told).toEqual([{ code: 'invalid-page-response', severity: 'error', path: 'response' }]);
    expect(model.displayed.nodeAt(model.displayed.index(10)!)).toMatchObject({ kind: 'loading', failed: true });
  });
});

describe('infiniteRows: duplicate ids (the list moved under the view)', () => {
  it('the row takes its new place, its old block is let go and asked again once; the second time it fails', () => {
    const { fake, model, answer, changes } = setup({ maxBlocks: 10, ahead: 0 });
    answer(fake.calls[0]!, { total: 30 });
    model.want(0, 19);
    const moved = [row(9), ...rowsAt(11, 9)];
    answer(fake.calls[1]!, { rows: moved, total: 30 });
    expect(changes.at(-1)!.told).toEqual([{ code: 'duplicate-row-id', severity: 'warning', path: 'response.rows[0]' }]);
    expect(model.displayed.indexOf(dataKey('r9')!)).toBe(10);
    expect(model.displayed.nodeAt(model.displayed.index(0)!).kind).toBe('loading');
    model.want(0, 19);
    const again = fake.calls.at(-1)!;
    expect(again.req.page!.index).toBe(0);
    // Block 0 sends r9 again: block 1 now goes; that is its first time.
    answer(again, { total: 30 });
    expect(model.displayed.indexOf(dataKey('r9')!)).toBe(9);
    model.want(0, 19);
    answer(fake.calls.at(-1)!, { rows: moved, total: 30 });
    // Block 0 lost r9 a second time: it fails instead of being asked forever.
    expect(model.displayed.nodeAt(model.displayed.index(0)!)).toMatchObject({ kind: 'loading', failed: true });
  });

  it('a row with no id fails its place; the same id twice in one block: the second place fails', () => {
    const { fake, model, changes } = setup();
    fake.calls[0]!.resolve({ rows: [row(0), { id: '', name: 'x' }, row(0)], total: 3 });
    expect(changes.at(-1)!.told).toEqual([
      { code: 'invalid-row-id', severity: 'error', path: 'response.rows[1]' },
      { code: 'duplicate-row-id', severity: 'warning', path: 'response.rows[2]' },
    ]);
    const d = model.displayed;
    expect([0, 1, 2].map((i) => d.nodeAt(d.index(i)!).kind)).toEqual(['data', 'loading', 'loading']);
    expect(d.dataCount).toBe(1);
    expect([...d.held!()]).toEqual([0]);
  });
});

describe('infiniteRows: options, operations, combinations', () => {
  it('bad options are told and the defaults taken', () => {
    const { model } = setup({ blockSize: 0, maxBlocks: 1.5 as never /* a non-integer on purpose */ });
    expect(model.problems.map((p) => p.path)).toEqual(['source.blockSize', 'source.maxBlocks']);
  });

  it('a placement in the browser is refused (invalid-operations), a pagination ignored (invalid-page), a shape refused (unsupported-combination)', () => {
    const shape = { kind: 'tree', build: () => null, problems: [] } as never; // a stand-in: only its kind is read
    const { model } = setup({}, { operations: { sort: 'client', page: 'off' }, page: { pageSize: 10 }, shape });
    expect(model.problems.map((p) => [p.code, p.severity, p.path, p.detail])).toEqual([
      ['invalid-operations', 'error', 'operations.sort', 'blocks'],
      ['invalid-page', 'warning', 'pagination', undefined],
      ['unsupported-combination', 'warning', 'shape', 'tree'],
    ]);
  });
});

describe('infiniteRows: selection policies (D14) and the kernel', () => {
  it('select-all is the query (everything-except), keeps every key, membership from the wire filter and the params', () => {
    const { fake, model, answer } = setup();
    answer(fake.calls[0]!, { total: 10000000 });
    const kernel = createKernel({ rows: model, columns: createColumnModel<Row>([{ id: 'name' }]) });
    kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(kernel.selection.mode).toBe('exclude');
    expect(model.keeps(dataKey('r999999')!)).toBe(true);
    expect(kernel.headerState).toBe('all');
    expect(model.membershipOf(makeQuery({ sort: [{ column: 'name', dir: 'asc' }] }))).toBe(model.membershipOf(makeQuery()));
  });

  it('under a selection rule, select-all takes the rows held only, and walks them only', () => {
    const { fake, model, answer } = setup();
    answer(fake.calls[0]!, { total: 10000000 });
    const kernel = createKernel({ rows: model, columns: createColumnModel<Row>([{ id: 'name' }]) });
    setSelectionGate(kernel, { on: true, vet: () => null, skip: () => false });
    kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(kernel.selection).toMatchObject({ mode: 'include' });
    expect(kernel.selection.keys.size).toBe(10);
    expect(kernel.headerState).toBe('all');
  });

  it('a range of rows across rows not loaded is refused (rows-not-loaded); inside the rows held it is taken', () => {
    const { fake, model, answer } = setup();
    answer(fake.calls[0]!, { total: 1000 });
    const kernel = createKernel({ rows: model, columns: createColumnModel<Row>([{ id: 'name' }]) });
    kernel.dispatch({ type: 'selection.only', row: dataKey('r2')! }, 'user');
    expect(kernel.dispatch({ type: 'selection.range', target: dataKey('r7')!, additive: false }, 'user').ok).toBe(true);
    expect(kernel.selection.keys.size).toBe(6);
    model.want(500, 509);
    answer(fake.calls.find((c) => c.req.page!.index === 50)!);
    const r = kernel.dispatch({ type: 'selection.range', target: dataKey('r505')!, additive: false }, 'user');
    expect(r).toMatchObject({ ok: false, reason: 'rows-not-loaded' });
  });
});

describe('infiniteRows: transactions (D11)', () => {
  it('an update replaces a row held in place; a row not held is ignored; nothing is asked', () => {
    const { fake, model, answer } = setup();
    answer(fake.calls[0]!, { total: 30 });
    const r = model.applyTransaction({ update: [{ id: 'r3', name: 'new' }, { id: 'r99', name: 'far' }], patch: [{ id: 'r4', set: { name: 'p' } }] });
    expect(r.kind).toBe('delta');
    expect(r.updated).toEqual([dataKey('r3'), dataKey('r4')]);
    expect((model.row(dataKey('r3')!)!.data as Row).name).toBe('new');
    expect((model.row(dataKey('r4')!)!.data as Row).name).toBe('p');
    expect(fake.calls).toHaveLength(1);
  });

  it('an add or a remove asks the window again, its rows kept', () => {
    const { fake, model, answer } = setup({ ahead: 0 });
    answer(fake.calls[0]!, { total: 30 });
    model.want(0, 9);
    model.applyTransaction({ remove: ['r1'] });
    expect(fake.calls).toHaveLength(2);
    expect(model.displayed.nodeAt(model.displayed.index(1)!).kind).toBe('data');
  });

  it('async: what arrives within batchMs is one change and one request; done per transaction', () => {
    const { fake, model, answer, run, changes, timers } = setup({ ahead: 0 });
    answer(fake.calls[0]!, { total: 30 });
    model.want(0, 9);
    changes.length = 0;
    const done: string[] = [];
    model.applyTransactionAsync({ update: [{ id: 'r1', name: 'a' }] }, (r) => done.push(r.kind));
    model.applyTransactionAsync({ add: [{ id: 'x', name: 'x' }] }, (r) => done.push(r.kind));
    model.applyTransactionAsync({ remove: ['r2'] });
    expect(changes).toEqual([]);
    expect(timers.at(-1)!.ms).toBe(50);
    run();
    expect(changes).toHaveLength(1);
    expect(fake.calls).toHaveLength(2);
    expect(done).toEqual(['delta', 'delta']);
  });
});

describe('infiniteRows: step 5 — the frame, edits (D11, K.14)', () => {
  it('async: the next frame flushes before batchMs when it comes first; the 50 ms timer then does nothing', () => {
    const frames: (() => void)[] = [];
    const { fake, model, answer, changes, timers } = setup({ ahead: 0 }, { frame: (fn) => void frames.push(fn) });
    answer(fake.calls[0]!, { total: 30 });
    model.want(0, 9);
    changes.length = 0;
    const done: string[] = [];
    model.applyTransactionAsync({ update: [{ id: 'r1', name: 'a' }] }, (r) => done.push(r.kind));
    model.applyTransactionAsync({ update: [{ id: 'r2', name: 'b' }] }, (r) => done.push(r.kind));
    expect(frames).toHaveLength(1);
    expect(changes).toEqual([]);
    frames.shift()!();
    expect(changes.map((c) => c.kind)).toEqual(['rows']);
    // The change lists every key the batch updated (what fresh-rows flashes).
    expect(changes[0]!.transaction?.updated).toEqual([dataKey('r1'), dataKey('r2')]);
    expect(done).toEqual(['delta', 'delta']);
    for (const t of timers.splice(0)) if (!t.off) t.fn();
    expect(changes).toHaveLength(1);
    // A new batch asks a new frame.
    model.applyTransactionAsync({ update: [{ id: 'r3', name: 'c' }] });
    expect(frames).toHaveLength(1);
  });

  it('async: when the timer wins, its frame (not cancellable) does not flush a batch begun since (R3, Phase 11 L2)', () => {
    const frames: (() => void)[] = [];
    const { fake, model, answer, changes, timers } = setup({ ahead: 0 }, { frame: (fn) => void frames.push(fn) });
    answer(fake.calls[0]!, { total: 30 });
    model.want(0, 9);
    changes.length = 0;
    model.applyTransactionAsync({ update: [{ id: 'r1', name: 'a' }] });
    // The timer first: the batch lands; the frame it armed stays queued (the env cannot take it back).
    for (const t of timers.splice(0)) if (!t.off) t.fn();
    expect(changes).toHaveLength(1);
    // A second batch begins: its own timer and frame.
    model.applyTransactionAsync({ update: [{ id: 'r2', name: 'b' }] });
    expect(frames).toHaveLength(2);
    // The first batch's frame comes: it belongs to a batch already landed, the new one waits for its own turn.
    frames.shift()!();
    expect(changes).toHaveLength(1);
    frames.shift()!();
    expect(changes).toHaveLength(2);
  });

  it('an edit of a column the server sorts by marks the order stale; reapply asks the window again, rows kept; its answer ends it', () => {
    const { fake, model, answer, changes } = setup({ ahead: 0, maxBlocks: 10 });
    answer(fake.calls[0]!, { total: 30 });
    model.setQuery(makeQuery({ sort: [{ column: 'name', dir: 'asc' }] }));
    answer(fake.calls.at(-1)!, { total: 30 });
    model.want(0, 9);
    const reader = { version: 1, overlay: true, value: () => 'x' };
    model.setReader!(reader as never, ['other']); // never: a reader of the test's own shape
    expect(model.orderStale).toBe(false);
    model.setReader!(reader as never, ['name']); // never: as above
    expect(model.orderStale).toBe(true);
    const asked = fake.calls.length;
    changes.length = 0;
    model.reapply!('user');
    expect(fake.calls).toHaveLength(asked + 1);
    expect(fake.calls.at(-1)!.req.page!.index).toBe(0);
    expect(model.displayed.nodeAt(model.displayed.index(3)!).kind).toBe('data');
    expect(model.status.phase).toBe('loading');
    expect(model.orderStale).toBe(true);
    answer(fake.calls.at(-1)!, { total: 30 });
    expect(model.orderStale).toBe(false);
    expect(model.status.phase).toBe('idle');
  });

  it('a filter or the search the server runs reads the edited column too; with nothing applied an edit marks nothing', () => {
    const { fake, model, answer } = setup({ ahead: 0 });
    answer(fake.calls[0]!, { total: 30 });
    const reader = { version: 1, overlay: true, value: () => 'x' };
    model.setReader!(reader as never); // never: a reader of the test's own shape
    expect(model.orderStale).toBe(false);
    model.setQuery(makeQuery({ quick: 'n1' }));
    answer(fake.calls.at(-1)!, { total: 30 });
    model.setReader!(reader as never, ['name']); // never: as above
    expect(model.orderStale).toBe(true);
    // A reapply with nothing stale asks nothing.
    model.setQuery(makeQuery({}));
    answer(fake.calls.at(-1)!, { total: 30 });
    const asked = fake.calls.length;
    model.reapply!();
    expect(fake.calls).toHaveLength(asked);
  });
});

describe('infiniteRows: hold, source, destroy', () => {
  it('a held model asks nothing until the hold ends: one request then', () => {
    const fake = fakeSource();
    const m = infiniteRows<Row>(fake.source).create({ getRowId: (r) => r.id, columns: createColumnModel<Row>([{ id: 'name' }]), ctx: localeCtx({ locale: 'en-US' }), held: true });
    expect(fake.calls).toHaveLength(0);
    m.hold!(() => m.setQuery(makeQuery({ quick: 'a' })));
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.req.quick).toBe('a');
  });

  it('another binding brings its data and params: a new epoch', () => {
    const { fake, model } = setup();
    model.setSource(infiniteRows<Row>(fake.source, { params: { k: 1 } }));
    expect(fake.calls.at(-1)!.req.params).toEqual({ k: 1 });
    expect(fake.aborted.at(-1)).toEqual(['c1', 'stale-epoch']);
  });

  it('destroy aborts what runs and applies nothing afterwards', () => {
    const { fake, model, changes } = setup();
    model.destroy();
    expect(fake.aborted).toEqual([['c1', 'destroyed']]);
    fake.calls[0]!.resolve({ rows: rowsAt(0, 10) });
    expect(changes).toEqual([]);
  });

  it('the gate keeps no channel of a block answered (forget): 1 000 blocks asked, the gate holds only what runs', () => {
    const { fake, model, answer } = setup({ maxBlocks: 2, ahead: 0, restMs: 0 });
    answer(fake.calls[0]!, { total: 100000 });
    for (let b = 1; b <= 1000; b++) {
      model.want(b * 10, b * 10 + 9);
      answer(fake.calls.at(-1)!);
    }
    expect(model.diagnostics.blocks.max).toBe(2);
    expect(model.diagnostics.gate.accepted).toBe(1001);
  });
});
