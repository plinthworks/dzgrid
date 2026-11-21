// Batch editing, a paste and a fill (1.15.0, docs/behaviors/edit-batch.md 11, owner 2026-11-21): with `editBatch()` a
// paste (or a cut) and a fill are saved at once, one request each, as without the batch — by default; `editBatch({
// paste: 'pending', fill: 'pending' })` keeps them pending instead. Typed changes stay pending. A paste over a pending
// cell: the saved value wins, the pending one is dropped and said. Rows: frows (qty = i² mod 11: r2 4, r3 9, r4 5,
// r5 3). Written before the code; expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import { editBatch, type EditBatchOptions } from '../src/edit-batch.js';
import { EN_FORMS } from '../src/locales/en-forms.js';
import { clip, cleanup, flush, fmake, key } from './support-fill.js';
import type { C } from './support-clip.js';

afterEach(cleanup);

const make = (o?: EditBatchOptions<C>) => {
  const b = editBatch<C>(o);
  const t = fmake({ extra: [b], more: [EN_FORMS] });
  const bapi = () => b.api(t.g as never)!; // the fill grid's kernel is typed for its own rows
  const counts = () => t.of('pendingChange').map((e) => e.count);
  const list = () => bapi().pending().map((p) => `${String(p.key).replace(/^d:\d+:/, '')}/${p.column}:${String(p.previous)}→${String(p.value)}`);
  const unsaved = (id: string, col = 'qty') => {
    t.tick();
    return t.cell(id, col)!.classList.contains('dzg-cell--unsaved');
  };
  const typed = (id: string, text: string, col = 'qty') => t.edits!.commit([{ key: key(id), column: col, input: { text } }]);
  return { ...t, b, bapi, counts, list, unsaved, typed };
};

describe('by default a paste and a fill are saved at once (edit-batch.md 11)', () => {
  it('a paste: one request, origin paste; nothing pending, no pendingChange, no mark', () => {
    const t = make();
    t.at('r2', 'qty');
    clip('paste', { 'text/plain': '7' });
    expect(t.requests.map((r) => r.origin)).toEqual(['paste']);
    expect(t.changes()).toEqual(['r2/qty=7']);
    expect(t.bapi().count).toBe(0);
    expect(t.counts()).toEqual([]);
    expect(t.unsaved('r2')).toBe(false);
    expect(t.value('r2', 'qty')).toBe('7');
  });

  it('a cut follows the paste: saved at once', () => {
    const t = make();
    t.at('r2', 'name');
    clip('cut');
    expect(t.requests.map((r) => r.origin)).toEqual(['cut']);
    expect(t.bapi().count).toBe(0);
  });

  it('a fill by the handle: one request, origin fill; nothing pending', () => {
    const t = make();
    t.at('r2', 'qty');
    t.dragTo('r5', 'qty');
    expect(t.requests.map((r) => r.origin)).toEqual(['fill']);
    expect(t.changes()).toEqual(['r3/qty=4', 'r4/qty=4', 'r5/qty=4']);
    expect(t.bapi().count).toBe(0);
    expect(t.counts()).toEqual([]);
    expect(t.unsaved('r4')).toBe(false);
  });

  it('a typed change stays pending beside them', () => {
    const t = make();
    t.typed('r6', '1');
    t.at('r2', 'qty');
    clip('paste', { 'text/plain': '7' });
    expect(t.changes()).toEqual(['r2/qty=7']);
    expect(t.list()).toEqual(['r6/qty:3→1']);
    expect(t.counts()).toEqual([1]);
    expect(t.unsaved('r6')).toBe(true);
  });

  it('a paste over a pending cell: the pasted value saved, previous the saved one; the pending change dropped and said; the others kept', async () => {
    const t = make();
    t.typed('r2', '8');
    t.typed('r3', '1');
    expect(t.counts()).toEqual([1, 2]);
    t.at('r2', 'qty');
    clip('paste', { 'text/plain': '7' });
    expect(t.changes()).toEqual(['r2/qty=7']);
    expect(t.requests[0]!.changes[0]!.previous).toBe(4);
    expect(t.list()).toEqual(['r3/qty:9→1']);
    expect(t.counts()).toEqual([1, 2, 1]);
    expect(t.unsaved('r2')).toBe(false);
    await flush();
    expect(t.said().at(-1)).toBe('Cells pasted: 1. Saving. 1 change discarded');
  });

  it('Ctrl+Z after a saved paste: the undo is a change like any other — pending (edit-batch.md 9)', async () => {
    const t = make();
    t.at('r2', 'qty');
    clip('paste', { 'text/plain': '7' });
    await flush();
    t.edits!.undo();
    expect(t.requests).toHaveLength(1);
    expect(t.list()).toEqual(['r2/qty:7→4']);
    expect(t.value('r2', 'qty')).toBe('4');
  });

  it('Ctrl+Z after a paste over a pending cell: the pending value comes back, pending', async () => {
    const t = make();
    t.typed('r2', '8');
    t.at('r2', 'qty');
    clip('paste', { 'text/plain': '7' });
    await flush();
    t.edits!.undo();
    expect(t.requests).toHaveLength(1);
    expect(t.list()).toEqual(['r2/qty:7→8']);
  });
});

describe("paste: 'pending', fill: 'pending'", () => {
  it('a paste: no request, one pending change, marked', () => {
    const t = make({ paste: 'pending' });
    t.at('r2', 'qty');
    clip('paste', { 'text/plain': '7' });
    expect(t.requests).toEqual([]);
    expect(t.list()).toEqual(['r2/qty:4→7']);
    expect(t.counts()).toEqual([1]);
    expect(t.unsaved('r2')).toBe(true);
  });

  it('a fill: no request, three pending changes; undone, they leave the list', () => {
    const t = make({ fill: 'pending' });
    t.at('r2', 'qty');
    t.dragTo('r5', 'qty');
    expect(t.requests).toEqual([]);
    expect(t.list()).toEqual(['r3/qty:9→4', 'r4/qty:5→4', 'r5/qty:3→4']);
    t.edits!.undo();
    expect(t.list()).toEqual([]);
    expect(t.counts()).toEqual([3, 0]);
  });

  it('each setting alone: paste pending, the fill still saved at once', () => {
    const t = make({ paste: 'pending' });
    t.at('r2', 'qty');
    t.dragTo('r4', 'qty');
    expect(t.requests.map((r) => r.origin)).toEqual(['fill']);
    t.at('r6', 'qty');
    clip('paste', { 'text/plain': '7' });
    expect(t.requests).toHaveLength(1);
    expect(t.list()).toEqual(['r6/qty:3→7']);
  });

  it('a pending paste over a pending cell: one change, previous the saved value', () => {
    const t = make({ paste: 'pending' });
    t.typed('r2', '8');
    t.at('r2', 'qty');
    clip('paste', { 'text/plain': '7' });
    expect(t.list()).toEqual(['r2/qty:4→7']);
    expect(t.requests).toEqual([]);
  });
});
