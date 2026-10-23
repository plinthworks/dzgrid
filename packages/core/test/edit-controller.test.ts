// Phase 5 step 3: the edit controller's own API (docs/phase-5-steps/step03-plan.md, « Tests first » 4).
// Conformance `edit-input`, `edit-saves` and `undo` hold the behaviour; this file the handles: destroy,
// dirty, setSave, the abort factory, state(), the reader, check, and the `validate` warning
// moved out of the base.
import { describe, it, expect } from 'vitest';
import {
  clientRows, createColumnModel, createKernel, dataKey, localeCtx, resolveColumns,
  type AbortHandle, type ClientModel, type ColumnDef, type GridEvent, type RowKey,
} from '@dzgrid/core';
import { createEdits, type SaveRequest } from '@dzgrid/core/edit';
import type { LocaleCtx } from '@dzgrid/core';

type Row = { id: string; v: number; n: string; bv?: number };
const k = (id: string): RowKey => dataKey(id)!;
const settle = () => new Promise<void>((r) => setImmediate(r));

function setup(o: { held?: boolean; defs?: ColumnDef<Row, any>[]; abort?: () => AbortHandle; ctx?: () => LocaleCtx; rows?: Row[]; before?: (k: ReturnType<typeof createKernel<Row>>) => void } = {}) {
  const rows: Row[] = o.rows ?? [{ id: 'a', v: 1, n: 'x' }, { id: 'b', v: 2, n: 'y' }];
  const columns = createColumnModel<Row>(o.defs ?? [{ id: 'v', type: 'number', editable: true }, { id: 'n', editable: true }]);
  const ctx = localeCtx({ locale: 'en-US' });
  const model = clientRows<Row>({ rows, getRowId: (r) => r.id, columns, ctx });
  const kernel = createKernel<Row>({ rows: model, columns });
  const events: GridEvent<Row>[] = [];
  kernel.subscribe((e) => events.push(e));
  const reqs: { req: SaveRequest<Row>; signal: { aborted: boolean; reason?: unknown }; ok: () => void; fail: (e: unknown) => void }[] = [];
  const save = (req: SaveRequest<Row>, signal: { aborted: boolean; reason?: unknown }) =>
    new Promise<void>((ok, fail) => reqs.push({ req, signal, ok: () => ok(), fail }));
  o.before?.(kernel);
  const edits = createEdits<Row>(kernel, { ctx: o.ctx ?? (() => ctx), ...(o.held !== false && { save }), ...(o.abort && { abort: o.abort }) });
  return { rows, model, kernel, events, reqs, edits, save };
}

describe('destroy', () => {
  const factory = (): AbortHandle => {
    const signal = { aborted: false, reason: undefined as unknown };
    return { signal, abort: (r?: unknown) => void Object.assign(signal, { aborted: true, reason: r }) };
  };

  it('aborts each request in flight, ignores late answers, and returns the changes dropped', async () => {
    const s = setup({ abort: factory });
    s.edits.commit([{ key: k('a'), column: 'v', input: { value: 5 } }]);
    s.edits.commit([{ key: k('a'), column: 'v', input: { value: 6 } }, { key: k('b'), column: 'v', input: { value: 7 } }]);
    expect(s.reqs).toHaveLength(1);
    expect(s.reqs[0]!.signal.aborted).toBe(false);
    s.events.length = 0;
    expect(s.edits.destroy()).toBe(3);
    expect(s.reqs[0]!.signal.aborted).toBe(true);
    expect(s.reqs[0]!.signal.reason).toBe('destroyed');
    s.reqs[0]!.fail({ reason: 'late' });
    await settle();
    expect(s.events).toEqual([]);
    expect(s.reqs).toHaveLength(1);
    expect(s.edits.dirty).toBe(false);
  });

  it('without an abort factory, save is handed a signal that never aborts: destroy only ignores the answer (budget, S3-O4)', async () => {
    const s = setup();
    s.edits.commit([{ key: k('a'), column: 'v', input: { value: 5 } }]);
    expect(s.reqs[0]!.signal).toEqual({ aborted: false });
    s.edits.destroy();
    expect(s.reqs[0]!.signal.aborted).toBe(false);
    s.reqs[0]!.fail('late');
    await settle();
    expect(s.events.filter((e) => e.type === 'saveFailed')).toEqual([]);
  });

  it('commits nothing once destroyed', async () => {
    const s = setup();
    s.edits.destroy();
    expect(s.edits.commit([{ key: k('a'), column: 'v', input: { value: 5 } }])).toEqual({ generation: null, staged: 0, refused: [] });
    expect(s.edits.undo()).toBeNull();
    await settle();
    expect(s.reqs).toHaveLength(0);
  });
});

describe('dirty', () => {
  // `flush()` of the plan was cut for the budget (step03-plan.md « Sizes »: the DOM does not need it).
  it('is true while something waits or is being saved, false once every save is answered', async () => {
    const s = setup();
    expect(s.edits.dirty).toBe(false);
    s.edits.commit([{ key: k('a'), column: 'v', input: { value: 5 } }]);
    s.edits.commit([{ key: k('a'), column: 'v', input: { value: 6 } }]);
    expect(s.edits.dirty).toBe(true);
    s.reqs[0]!.ok();
    await settle();
    expect(s.edits.dirty).toBe(true);
    s.reqs[1]!.fail('no');
    await settle();
    expect(s.edits.dirty).toBe(false);
    expect('flush' in s.edits).toBe(false);
  });

  it('is false at once without a save function, and after destroy', () => {
    const s = setup({ held: false });
    s.edits.commit([{ key: k('a'), column: 'v', input: { value: 5 } }]);
    expect(s.edits.dirty).toBe(false);
    const t = setup();
    t.edits.commit([{ key: k('a'), column: 'v', input: { value: 5 } }]);
    expect(t.edits.dirty).toBe(true);
    t.edits.destroy();
    expect(t.edits.dirty).toBe(false);
  });
});

describe('setSave and the abort factory', () => {
  it('a request in flight keeps its save; the next goes to the new one', async () => {
    const s = setup();
    const second: number[] = [];
    s.edits.commit([{ key: k('a'), column: 'v', input: { value: 5 } }]);
    s.edits.setSave((req) => void second.push(req.generation));
    s.edits.commit([{ key: k('b'), column: 'v', input: { value: 6 } }]);
    expect(s.reqs.map((r) => r.req.generation)).toEqual([1]);
    expect(second).toEqual([2]);
    s.reqs[0]!.ok();
    await settle();
    expect(s.edits.state(k('a'), 'v')?.status).toBe('saved');
    expect(s.edits.state(k('b'), 'v')?.status).toBe('saved');
  });

  it('asks the factory for one handle per request, and hands its signal to save', async () => {
    const handles: AbortHandle[] = [];
    const abort = (): AbortHandle => {
      const signal = { aborted: false, reason: undefined as unknown };
      const h = { signal, abort: (r?: unknown) => Object.assign(signal, { aborted: true, reason: r }) };
      handles.push(h);
      return h;
    };
    const s = setup({ abort });
    s.edits.commit([{ key: k('a'), column: 'v', input: { value: 5 } }, { key: k('b'), column: 'v', input: { value: 6 } }]);
    s.edits.commit([{ key: k('a'), column: 'n', input: { text: 'z' } }]);
    expect(handles).toHaveLength(2);
    expect(s.reqs.map((r) => r.signal)).toEqual(handles.map((h) => h.signal));
    expect(s.reqs[0]!.signal).toBe(handles[0]!.signal);
  });
});

describe('state()', () => {
  it('tells each status with its generation, and a refusal with the refused value, reason and code', async () => {
    const s = setup();
    expect(s.edits.state(k('a'), 'v')).toBeUndefined();
    s.edits.commit([{ key: k('a'), column: 'v', input: { value: 5 } }]);
    expect(s.edits.state(k('a'), 'v')).toEqual({ status: 'saving', generation: 1, reason: null, code: null });
    s.edits.commit([{ key: k('a'), column: 'v', input: { value: 6 } }]);
    expect(s.edits.state(k('a'), 'v')).toEqual({ status: 'pending', generation: 2, reason: null, code: null });
    s.reqs[0]!.ok();
    await settle();
    expect(s.edits.state(k('a'), 'v')).toEqual({ status: 'saving', generation: 2, reason: null, code: null });
    s.reqs[1]!.fail({ reason: 'Stock épuisé', code: 'stock' });
    await settle();
    // Retry offers the refused value (edit-save.md 15, O2); the cell shows the last saved one.
    expect(s.edits.state(k('a'), 'v')).toEqual({ status: 'failed', generation: 2, refused: 6, reason: 'Stock épuisé', code: 'stock' });
    expect(s.edits.reader.value(s.kernel.columns.get('v')!, s.rows[0]!, 'a')).toBe(5);
    // A new edit clears the refusal.
    s.edits.commit([{ key: k('a'), column: 'v', input: { value: 7 } }]);
    expect(s.edits.state(k('a'), 'v')).toEqual({ status: 'saving', generation: 3, reason: null, code: null });
  });
});

describe('the reader', () => {
  it('is installed in the kernel at creation, stays the same object, and its version only grows', async () => {
    const s = setup();
    const reader = s.edits.reader;
    expect(s.kernel.reader).toBe(reader);
    const versions = [reader.version];
    s.edits.commit([{ key: k('a'), column: 'v', input: { value: 5 } }]);
    versions.push(reader.version);
    s.reqs[0]!.ok();
    await settle();
    // Saved: a status, not a value change.
    versions.push(reader.version);
    s.edits.commit([{ key: k('a'), column: 'v', input: { value: 6 } }]);
    versions.push(reader.version);
    s.reqs[1]!.fail('no');
    await settle();
    versions.push(reader.version);
    expect(s.edits.reader).toBe(reader);
    expect(s.kernel.reader).toBe(reader);
    expect(versions).toEqual([versions[0], versions[0]! + 1, versions[0]! + 1, versions[0]! + 2, versions[0]! + 3]);
    expect(reader.overlay).toBe(true);
  });

  it('reads the source for a cell never edited, and never writes the rows', () => {
    const s = setup();
    const before = JSON.stringify(s.rows);
    s.edits.commit([{ key: k('a'), column: 'v', input: { value: 5 } }]);
    expect(s.edits.reader.value(s.kernel.columns.get('v')!, s.rows[1]!, 'b')).toBe(2);
    expect(s.edits.reader.value(s.kernel.columns.get('v')!, s.rows[0]!, 'a')).toBe(5);
    expect(JSON.stringify(s.rows)).toBe(before);
  });
});

describe('check', () => {
  it('answers without staging anything', async () => {
    const s = setup();
    s.events.length = 0;
    expect(s.edits.check(k('a'), 'v', { text: '12' })).toEqual({ ok: true, value: 12 });
    expect(s.edits.check(k('a'), 'v', { text: 'x' })).toEqual({ ok: false, code: 'parse' });
    await settle();
    expect(s.events).toEqual([]);
    expect(s.edits.state(k('a'), 'v')).toBeUndefined();
    expect(s.edits.dirty).toBe(false);
    expect(s.reqs).toHaveLength(0);
  });
});

describe('the validate check moved out of the base (Phase 5 step 3, −17 B)', () => {
  it('the base no longer tells a validate that is not a function', () => {
    const r = resolveColumns<Row>([{ id: 'v', editable: true, validate: 5 as never }]);
    expect(r.problems).toEqual([]);
    expect(r.columns).toHaveLength(1);
  });

  it('the edit controller tells it, at creation and when the columns change', () => {
    const s = setup({ defs: [{ id: 'v', type: 'number', editable: true, validate: 5 as never }, { id: 'n', editable: true }] });
    const told = () => s.events.flatMap((e) => (e.type === 'problems' ? e.problems.map((p) => p.path) : []));
    // Told before the test subscribed? The controller is created after the subscription.
    expect(told()).toEqual(['columns.v.validate']);
    s.kernel.dispatch({ type: 'columns.set', defs: [{ id: 'v', type: 'number', editable: true }, { id: 'n', editable: true, validate: 'x' as never }] }, 'host');
    expect(told()).toEqual(['columns.v.validate', 'columns.n.validate']);
    // A validate that is not a function is ignored: the value passes.
    expect(s.edits.check(k('a'), 'n', { text: 'k' })).toEqual({ ok: true, value: 'k' });
  });
});

describe('the overlay read before the controller hears the rows (mutation analysis)', () => {
  it('a listener told modelUpdated after a host update reads the new row for a saved cell, the edit for a saving one', async () => {
    const s = setup();
    s.edits.commit([{ key: k('a'), column: 'v', input: { value: 5 } }]);
    s.reqs[0]!.ok();
    await settle();
    s.edits.commit([{ key: k('b'), column: 'v', input: { value: 7 } }]);
    const seen: unknown[] = [];
    s.kernel.subscribe((e) => {
      if (e.type !== 'modelUpdated') return;
      const v = s.kernel.columns.get('v')!;
      // The kernel heard the rows first: the controller has not cleaned up yet.
      seen.push(s.edits.reader.value(v, s.model.row(k('a'))!.data, 'a'), s.edits.state(k('a'), 'v')?.status ?? null);
      seen.push(s.edits.reader.value(v, s.model.row(k('b'))!.data, 'b'), s.edits.state(k('b'), 'v')?.status ?? null);
    });
    (s.model as ClientModel<Row>).applyTransaction({ update: [{ id: 'a', v: 9, n: 'x' }, { id: 'b', v: 20, n: 'y' }] }, 'host');
    expect(seen).toEqual([9, null, 7, 'saving']);
  });

  it('a row removed and given back as the same object does not bring its saved value back', async () => {
    const s = setup();
    s.edits.commit([{ key: k('a'), column: 'v', input: { value: 5 } }]);
    s.reqs[0]!.ok();
    await settle();
    s.events.length = 0;
    const m = s.model as ClientModel<Row>;
    m.applyTransaction({ remove: ['a'] }, 'host');
    expect(s.events.filter((e) => e.type === 'editStates').map((e) => (e as { cells: unknown }).cells)).toEqual([[{ key: k('a'), column: 'v' }]]);
    m.applyTransaction({ add: [s.rows[0]!] }, 'host');
    expect(s.model.row(k('a'))!.data).toBe(s.rows[0]);
    expect(s.edits.reader.value(s.kernel.columns.get('v')!, s.rows[0]!, 'a')).toBe(1);
    expect(s.edits.state(k('a'), 'v')).toBeUndefined();
  });
});

describe('review fixes (step 3 review)', () => {
  const v = (x: unknown) => ({ value: x });
  it('R1 a listener that commits on the same cell while hearing cellEdited: the newest value is what the server keeps, and undo goes back newest first', async () => {
    const s = setup();
    let once = true;
    s.kernel.subscribe((e) => {
      if (e.type === 'cellEdited' && once) {
        once = false;
        s.edits.commit([{ key: k('a'), column: 'v', input: v(6) }]);
      }
    });
    s.edits.commit([{ key: k('a'), column: 'v', input: v(5) }]);
    for (let i = 0; i < 4 && s.reqs.some((r) => !(r as { done?: boolean }).done); i++) {
      for (const r of s.reqs) if (!(r as { done?: boolean }).done) { (r as { done?: boolean }).done = true; r.ok(); }
      await settle();
    }
    const sent = s.reqs.map((r) => r.req.changes.map((c) => c.value)).flat();
    expect(sent[sent.length - 1]).toBe(6);
    expect(s.edits.state(k('a'), 'v')?.status).toBe('saved');
    expect(s.edits.reader.value(s.kernel.columns.get('v')!, s.rows[0]!, 'a')).toBe(6);
    // Undo: the newest gesture first (6 → 5), then the first (5 → 1).
    s.edits.undo();
    expect(s.edits.reader.value(s.kernel.columns.get('v')!, s.rows[0]!, 'a')).toBe(5);
  });

  it('R2 an options function that throws refuses invalid and is told once', () => {
    const s = setup({ defs: [{ id: 'v', type: 'number', editable: true }, { id: 'n', editable: true, edit: { options: () => { throw new Error('x'); } } }] });
    expect(s.edits.check(k('a'), 'n', { text: 'k' })).toEqual({ ok: false, code: 'invalid' });
    expect(s.edits.commit([{ key: k('b'), column: 'n', input: { text: 'k' } }]).refused).toEqual([{ key: k('b'), column: 'n', code: 'invalid' }]);
    const told = s.events.flatMap((e) => (e.type === 'problems' ? e.problems.map((p) => [p.path, p.detail, e.source]) : []));
    expect(told).toEqual([['columns.n.edit.options', 'threw', 'data']]);
  });

  it('R3 a RegExp pattern loses g, y and m (the whole value), keeps i, u and s', () => {
    const s = setup({ defs: [{ id: 'n', editable: true, edit: { pattern: /[a-z]+/m } }, { id: 'v', editable: true, edit: { pattern: /[a-z]{3}/i } }, { id: 'bv', editable: true, edit: { pattern: /a.b/s } }] });
    expect(s.edits.check(k('a'), 'n', { text: 'a\nBAD!!' })).toEqual({ ok: false, code: 'pattern' });
    expect(s.edits.check(k('a'), 'v', { text: 'ABC' })).toEqual({ ok: true, value: 'ABC' });
    expect(s.edits.check(k('a'), 'bv', { text: 'a\nb' })).toEqual({ ok: true, value: 'a\nb' });
  });

  it('R4 destroy empties both stacks, and tells the rows the edits are gone (a new reader version, the edited columns)', async () => {
    const reads: [readonly string[] | undefined, number][] = [];
    const s = setup({
      held: false,
      before: (kernel) => {
        const d = kernel.dispatch.bind(kernel);
        (kernel as { dispatch: typeof d }).dispatch = (cmd, src) => {
          if (cmd.type === 'edits.reader') reads.push([cmd.columns, cmd.reader.version]);
          return d(cmd, src);
        };
      },
    });
    s.edits.commit([{ key: k('a'), column: 'v', input: v(5) }]);
    s.edits.commit([{ key: k('b'), column: 'n', input: v('z') }]);
    s.edits.undo();
    expect([s.edits.canUndo, s.edits.canRedo]).toEqual([true, true]);
    const before = s.edits.reader.version;
    reads.length = 0;
    s.edits.destroy();
    expect([s.edits.canUndo, s.edits.canRedo]).toEqual([false, false]);
    expect(s.edits.reader.version).toBe(before + 1);
    expect(reads.map(([c]) => [...(c ?? [])].sort())).toEqual([['n', 'v']]);
    // Gaps 7: the source shows, no state.
    expect(s.edits.reader.value(s.kernel.columns.get('v')!, s.rows[0]!, 'a')).toBe(1);
    expect(s.edits.state(k('a'), 'v')).toBeUndefined();
    expect(s.edits.undo()).toBeNull();
  });

  it('R5 error.cells may name a row by the host\'s plain id', async () => {
    const s = setup();
    s.edits.commit([{ key: k('a'), column: 'v', input: v(5) }, { key: k('b'), column: 'v', input: v(6) }]);
    s.reqs[0]!.fail({ cells: [{ key: 'b', column: 'v', reason: 'locked' }] });
    await settle();
    expect(s.edits.state(k('a'), 'v')?.status).toBe('saved');
    expect(s.edits.state(k('b'), 'v')).toMatchObject({ status: 'failed', reason: 'locked' });
  });
});

describe('test gaps (step 3 analysis)', () => {
  it('1–2 a named cell\'s code wins over the error\'s; an empty cell reason falls back to the error\'s', async () => {
    const s = setup();
    s.edits.commit([{ key: k('a'), column: 'v', input: { value: 5 } }]);
    s.reqs[0]!.fail({ reason: 'batch', code: 'e', cells: [{ key: k('a'), column: 'v', reason: '', code: 'mine' }] });
    await settle();
    expect(s.edits.state(k('a'), 'v')).toMatchObject({ reason: 'batch', code: 'mine' });
    const f = s.events.find((e) => e.type === 'saveFailed') as Extract<GridEvent<Row>, { type: 'saveFailed' }>;
    expect([f.reason, f.code, f.source]).toEqual(['batch', 'mine', 'data']);
  });

  it('4 a pattern checks strings only: a number column with a pattern takes a number', () => {
    const s = setup({ defs: [{ id: 'v', type: 'number', editable: true, edit: { pattern: '1' } }] });
    expect(s.edits.check(k('a'), 'v', { text: '5' })).toEqual({ ok: true, value: 5 });
  });

  it('5 the locale is read at each check', () => {
    let ctx = localeCtx({ locale: 'en-US' });
    const s = setup({ ctx: () => ctx });
    expect(s.edits.check(k('a'), 'v', { text: '1,5' })).toEqual({ ok: false, code: 'parse' });
    ctx = localeCtx({ locale: 'fr-FR' });
    expect(s.edits.check(k('a'), 'v', { text: '1,5' })).toEqual({ ok: true, value: 1.5 });
  });

  it('6 a lone right-to-left mark in an Arabic number cell is not empty: parse', () => {
    const s = setup({ ctx: () => localeCtx({ locale: 'ar-EG' }) });
    expect(s.edits.check(k('a'), 'v', { text: String.fromCharCode(0x200f) })).toEqual({ ok: false, code: 'parse' });
  });

  it('8 after destroy, a column set with a bad validate tells nothing', () => {
    const s = setup();
    s.edits.destroy();
    s.events.length = 0;
    s.kernel.dispatch({ type: 'columns.set', defs: [{ id: 'v', type: 'number', editable: true, validate: 5 as never }] }, 'host');
    expect(s.events.filter((e) => e.type === 'problems')).toEqual([]);
  });

  it('9 config problems are told with source data', () => {
    const s = setup({ defs: [{ id: 'v', type: 'number', editable: true, edit: { min: 'x' as never } }] });
    expect(s.events.filter((e) => e.type === 'problems').map((e) => e.source)).toEqual(['data']);
  });

  it('11 the reader installed at creation is sent with source api', () => {
    const got: string[] = [];
    setup({
      before: (kernel) => {
        const d = kernel.dispatch.bind(kernel);
        (kernel as { dispatch: typeof d }).dispatch = (cmd, src) => (cmd.type === 'edits.reader' && got.push(src), d(cmd, src));
      },
    });
    expect(got).toEqual(['api']);
  });

  it('12 a cell key keeps the row id apart from the column (rows a and ab, columns bv and v)', () => {
    const s = setup({
      rows: [{ id: 'a', v: 1, n: 'x', bv: 7 }, { id: 'ab', v: 2, n: 'y', bv: 8 }],
      defs: [{ id: 'v', type: 'number', editable: true }, { id: 'bv', type: 'number', editable: true }],
      held: false,
    });
    s.edits.commit([{ key: k('a'), column: 'bv', input: { value: 9 } }]);
    expect(s.edits.reader.value(s.kernel.columns.get('v')!, s.rows[1]!, 'ab')).toBe(2);
    expect(s.edits.state(k('ab'), 'v')).toBeUndefined();
    expect(s.edits.state(k('a'), 'bv')?.status).toBe('saved');
  });
});
