// A walk over the fill (Phase 5 step 12, step12-plan.md tests 6): random blocks, sorts, filters, pastes, fills by the
// four ways, bulk edits, Ctrl+D / R, the fill mode left half way, undos and scrolls. After every step: no stale paint (no
// target outline left outside a drag or the mode, the handle on the cell the rules name or nowhere, at most one handle
// per grid); the focus never lost; at the end, undoing everything gives every row back as it was.
import { describe, it, expect, afterEach } from 'vitest';
import { dataKey } from '@dzgrid/core';
import { cleanup, clip, flush, fmake, frows } from './support-fill.js';
import { R_ } from './support-range.js';

afterEach(cleanup);

const COLS = ['name', 'qty', 'price', 'day', 'st', 'ok', 'code', 'ref'];

function rng(seed: number) {
  let a = seed >>> 0;
  return (n: number) => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a % n;
  };
}

describe('the fill walk', () => {
  it('120 walks of 25 steps: no stale paint, one handle at most, the focus kept, everything undone gives the rows back', async () => {
    for (let w = 0; w < 120; w++) {
      const r = rng(w + 1);
      const lang = (['en', 'fr', 'ar'] as const)[r(3)]!;
      const t = fmake({ lang, editors: 'after', block: 200, rows: frows(40) });
      const start = JSON.stringify(t.g.kernel.rows.displayed.count && frows(40));
      const id = () => `r${r(40)}`;
      const col = () => COLS[r(COLS.length)]!;
      t.at('r3', 'qty');
      let gestures = 0;
      for (let i = 0; i < 25; i++) {
        const op = r(14);
        const shown = (x: string) => t.g.kernel.rows.displayed.indexOf(dataKey(x)!) >= 0;
        const a = id();
        if (op === 0) shown(a) && t.at(a, col());
        else if (op === 1) { const b = id(); shown(a) && shown(b) && t.api().set(R_([a, col()], [b, col()])); }
        else if (op === 2) t.g.kernel.dispatch({ type: 'sort.set', sort: r(2) ? [{ column: col(), dir: r(2) ? 'asc' : 'desc' }] : [] }, 'api');
        else if (op === 3) { if (shown(a)) gestures += +!!t.fapi().fill({ row: dataKey(a)!, column: col() }, { swap: !!r(2) }); }
        else if (op === 4 && t.handle()) { const b = id(); if (shown(b) && t.cell(b, 'qty')) t.dragTo(b, 'qty', { ctrl: !!r(2) }), gestures++; }
        else if (op === 5 && t.handle()) { const b = id(); if (shown(b) && t.cell(b, 'price')) t.pickTo(b, 'price'), gestures++; }
        else if (op === 6) { t.press('Enter', { ctrlKey: true, shiftKey: true }); for (let j = r(4); j > 0; j--) t.press(['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'][r(4)]!); t.press(['Enter', 'Escape', 'Tab'][r(3)]!); gestures++; }
        else if (op === 7) { t.press(r(2) ? 'd' : 'r', { ctrlKey: true }); gestures++; }
        else if (op === 8) { if (shown(a)) { t.at(a, 'qty'); t.press('F2'); if (t.field()) { t.type(String(r(9))); t.press('Enter', { ctrlKey: true }, t.field()!); gestures++; } } }
        else if (op === 9) { clip('copy'); clip('paste', { 'text/plain': `${r(9)}\t${r(9)}` }); gestures++; }
        else if (op === 10) t.scroll(r(400));
        else if (op === 11) t.edits!.undo();
        else if (op === 12) t.press('Escape');
        else if (op === 13 && t.handle()) { t.dragTo(id(), 'qty', { noUp: true }); t.press('Escape'); t.up({ clientX: 0, clientY: 0 }); }
        await flush();
        const where = `walk ${w} step ${i} op ${op}`;
        // A field left open by a refused Ctrl+Enter: closed (Escape) before checking the paint.
        if (t.field()) t.press('Escape', {}, t.field()!);
        expect(t.target(), where).toEqual([]);
        expect(t.handles().length, where).toBeLessThanOrEqual(1);
        const f = t.g.kernel.focus;
        expect(f, where).not.toBeNull();
        if (t.handle()) {
          const b = t.api().box();
          const at = t.handleAt()!;
          const d = t.g.kernel.rows.displayed;
          if (b) {
            let bottom = b.bottom;
            while (bottom > b.top && d.nodeAt(d.index(bottom)!).kind !== 'data') bottom--;
            expect(at, where).toBe(`${String(d.keyAt(d.index(bottom)!)).replace(/^d:\d+:/, '')}/${t.ctx.columns.visible()[b.end]!.id}`);
          } else if (f?.kind === 'cell') expect(at, where).toBe(`${String(f.row).replace(/^d:\d+:/, '')}/${f.column}`);
        }
      }
      for (let i = 0; i < gestures + 30; i++) t.edits!.undo();
      await flush();
      for (const x of frows(40)) {
        const node = t.g.kernel.rows.row(dataKey(x.id)!)!;
        for (const c of COLS) expect(t.ctx.edit!.read(t.ctx.columns.get(c)! as never, node.data, node.key), `walk ${w} ${x.id}/${c}`).toEqual(x[c as keyof typeof x] ?? null);
      }
      expect(start).toBeTruthy();
      cleanup();
    }
  }, 600_000);
});
