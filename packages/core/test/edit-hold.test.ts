// 1.15.0 — the controller's hold (docs/behaviors/edit-batch.md 2, 7, 8): with `hold`, every gesture waits, status
// `pending`, until a gesture marked to go (`@dzgrid/dom/edit-batch` merges them); the insides `x` it uses. By hand.
import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, type RowKey } from '@dzgrid/core';
import { createEdits, type EditGesture, type SaveRequest } from '@dzgrid/core/edit';

type Row = { id: string; v: number };
const k = (id: string): RowKey => dataKey(id)!;
const settle = () => new Promise<void>((r) => setImmediate(r));

function setup(hold: boolean) {
  const columns = createColumnModel<Row>([{ id: 'v', type: 'number', editable: true }]);
  const ctx = localeCtx({ locale: 'en-US' });
  const kernel = createKernel<Row>({ rows: clientRows<Row>({ rows: [{ id: 'a', v: 1 }, { id: 'b', v: 2 }], getRowId: (r) => r.id, columns, ctx }), columns });
  const sent: SaveRequest<Row>[] = [];
  const edits = createEdits<Row>(kernel, { ctx: () => ctx, hold, save: (req) => void sent.push(req) });
  return { edits, sent };
}

describe('hold (edit-batch.md 2)', () => {
  it('without it a gesture is sent at once (unchanged default)', () => {
    const s = setup(false);
    s.edits.commit([{ key: k('a'), column: 'v', input: { value: 5 } }]);
    expect(s.sent).toHaveLength(1);
  });

  it('held: shown, pending, nothing sent; a gesture marked to go takes the cells and leaves once', async () => {
    const s = setup(true);
    s.edits.commit([{ key: k('a'), column: 'v', input: { value: 5 } }]);
    s.edits.commit([{ key: k('b'), column: 'v', input: { value: 6 } }]);
    expect(s.sent).toEqual([]);
    expect(s.edits.state(k('a'), 'v')?.status).toBe('pending');
    expect(s.edits.dirty).toBe(true);
    const x = s.edits.x!;
    const G: EditGesture = { g: x.gen(), origin: 'batch', cells: new Map(), go: true };
    for (const e of [...x.cells.values()]) {
      x.unwait(e);
      G.cells.set(e, { v: e.v, p: 0 });
      e.g = G.g;
    }
    x.waiting.set(G.g, G);
    x.pump();
    expect(s.sent.map((r) => [r.origin, r.changes.map((c) => c.value)])).toEqual([['batch', [5, 6]]]);
    expect(s.edits.state(k('a'), 'v')?.status).toBe('saving');
    await settle();
    expect(s.edits.state(k('b'), 'v')?.status).toBe('saved');
    expect(x.waiting.size + x.flying.size).toBe(0);
  });
});
