// Bugs found by the step-10 coverage review (random walk, detail-dom-walk.test.ts): each was an `it.fails`
// (the behaviour the docs promise), flipped with its fix (step 10 review, owner decision Q13).
import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, detailKey, type RowKey } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridContext } from '../src/context.js';
import type { Geometry } from '../src/render/measure.js';
import { detail, nestedGrid } from '../src/detail.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import { FR_DETAIL } from '../src/locales/fr-detail.js';

type P = { id: string; name: string };
type V = { id: string; n: number };
const k = (id: string): RowKey => dataKey(id)!;
const x = (id: string): RowKey => detailKey(k(id));
const MSG = { ...EN, text: { ...EN.text, ...EN_DETAIL.text } };
const MSG_FR = { ...FR, text: { ...FR.text, ...FR_DETAIL.text } };
const geo = (block: number): Geometry => {
  const box = { block, inline: 500, scrollTop: 0, scrollInline: 0 };
  return { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
};
const grids: GridInstance<any, any>[] = [];
afterEach(() => {
  for (const g of grids.splice(0)) g.destroy();
  document.body.innerHTML = '';
});
const ctxOf = <C>(g: GridInstance<C, any>): GridContext<C> => (g as unknown as { context: GridContext<C> }).context;

function make() {
  const host = document.createElement('div');
  document.body.append(host);
  const inner: GridInstance<V, any>[] = [];
  let held: FrameRequestCallback[] | null = null;
  const g = createGrid<P>(host, {
    rows: Array.from({ length: 40 }, (_, i) => ({ id: `P${i}`, name: `Patient ${i}` })), getRowId: (r) => r.id, columns: [{ id: 'name', header: 'Name', width: 200 }], messages: MSG,
    features: [detail<P>({ part: nestedGrid<V>({ env: () => (held ? { geometry: geo(200), raf: { requestAnimationFrame: (f) => held!.push(f), cancelAnimationFrame() {} } } : { geometry: geo(200), sync: true }), onGrid: (gr) => void inner.push(gr), settings: (c) => ({ rows: Array.from({ length: 40 }, (_, i) => ({ id: `${(c.row as P).id}-V${i}`, n: i })), getRowId: (r) => r.id, columns: [{ id: 'n', header: 'N', type: 'number', width: 80 }], messages: MSG }) }) })],
  }, { geometry: geo(400), sync: true });
  grids.push(g);
  const hold = (h: FrameRequestCallback[] | null) => void (held = h);
  const press = (key: string) => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  /** Into P1's inner grid, three rows down. */
  const into = () => {
    g.kernel.dispatch({ type: 'rows.expand', rows: [k('P1')], expanded: true }, 'api');
    g.api.focusCell(k('P1'), 'name');
    press('ArrowDown');
    press('Enter');
    for (let i = 0; i < 3; i++) press('ArrowDown');
  };
  const at = () => {
    const a = document.activeElement as Element;
    const gr = inner.at(-1)!;
    return { inInner: a.closest('.dzg') === ctxOf(gr).el.root, focus: gr.kernel.focus };
  };
  return { g, inner, press, into, at, hold };
}

describe('nestedGrid: the focus inside an inner grid survives its remaking', () => {
  // A live feed updating the patient's row (or a host's edit elsewhere) while the user reads its visits:
  // update() destroys the inner grid and makes a new one; the base puts the focus back on the outer panel
  // cell, and the inner focused cell is not part of the LRU, so Enter starts again at the first visit.
  it('a master row updated while its inner grid has the focus: the focus stays on the same visit', () => {
    const t = make();
    t.into();
    expect(t.at()).toEqual({ inInner: true, focus: { kind: 'cell', row: k('P1-V3'), column: 'n' } });
    t.g.kernel.rows.applyTransaction({ patch: [{ id: 'P1', set: { name: 'Patient One' } }] });
    expect(t.at()).toEqual({ inInner: true, focus: { kind: 'cell', row: k('P1-V3'), column: 'n' } });
  });

  it('a language change while an inner grid has the focus: the focus stays on the same visit', () => {
    const t = make();
    t.into();
    t.g.update({ messages: MSG_FR });
    expect(t.at()).toEqual({ inInner: true, focus: { kind: 'cell', row: k('P1-V3'), column: 'n' } });
  });

  // « Reopening a panel shows its inner grid as it was left (sort, filters, scroll) »: the scroll is given back,
  // but Enter (the only way in by keyboard) focuses the first row and scrolls the restored position away.
  it('reopened, then Enter: the keyboard user comes back to the visit left, the scroll kept', () => {
    const t = make();
    t.into();
    for (let i = 0; i < 17; i++) t.press('ArrowDown');
    const top = ctxOf(t.inner.at(-1)!).scroll.logicalTop;
    expect(top).toBeGreaterThan(0);
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('P1')], expanded: false }, 'user');
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('P1')], expanded: true }, 'user');
    expect(ctxOf(t.inner.at(-1)!).scroll.logicalTop).toBe(top);
    t.g.api.focusCell(x('P1'), 'name');
    t.press('Enter');
    expect([t.at().focus, ctxOf(t.inner.at(-1)!).scroll.logicalTop]).toEqual([{ kind: 'cell', row: k('P1-V20'), column: 'n' }, top]);
  });

  // The LRU keeps a pixel offset and the query, not which rows of the inner grid were open: an inner grid left
  // scrolled below an open panel of its own comes back at another place (clamped, or rows shifted by the panel).
  it('an inner grid left scrolled past a panel of its own: reopened, the same visit at its top', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const inner: GridInstance<V, any>[] = [];
    const deep = nestedGrid<V>({ env: () => ({ geometry: geo(120), sync: true }), settings: (c) => ({ rows: [{ id: `${String((c.row as V).id)}-W`, n: 0 }], getRowId: (r) => r.id, columns: [{ id: 'n', header: 'N', width: 80 }], messages: MSG }) });
    const g = createGrid<P>(host, {
      rows: Array.from({ length: 10 }, (_, i) => ({ id: `P${i}`, name: `Patient ${i}` })), getRowId: (r) => r.id, columns: [{ id: 'name', header: 'Name', width: 200 }], messages: MSG,
      features: [detail<P>({ part: nestedGrid<V>({ env: () => ({ geometry: geo(200), sync: true }), onGrid: (gr) => void inner.push(gr), settings: (c) => ({ rows: Array.from({ length: 40 }, (_, i) => ({ id: `${(c.row as P).id}-V${i}`, n: i })), getRowId: (r) => r.id, columns: [{ id: 'n', header: 'N', type: 'number', width: 80 }], messages: MSG, features: [detail<V>({ part: deep, height: 300 })] }) }) })],
    }, { geometry: geo(400), sync: true });
    grids.push(g);
    g.kernel.dispatch({ type: 'rows.expand', rows: [k('P1')], expanded: true }, 'api');
    const a = inner.at(-1)!;
    a.kernel.dispatch({ type: 'rows.expand', rows: [k('P1-V0')], expanded: true }, 'api');
    a.api.ensureVisible(k('P1-V30'));
    const topKey = (gr: GridInstance<V, any>) => { const c = ctxOf(gr); const d = gr.kernel.rows.displayed; return d.keyAt(c.layout!.indexAt(c.scroll.logicalTop)); };
    const was = topKey(a);
    g.kernel.dispatch({ type: 'rows.expand', rows: [k('P1')], expanded: false }, 'user');
    g.kernel.dispatch({ type: 'rows.expand', rows: [k('P1')], expanded: true }, 'user');
    expect(topKey(inner.at(-1)!)).toBe(was);
  });

  it('a fixed setting changed with the master row (another nonce): the grid made again, the focus and the sort kept', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const inner: GridInstance<V, any>[] = [];
    const g = createGrid<P>(host, {
      rows: Array.from({ length: 10 }, (_, i) => ({ id: `P${i}`, name: `Patient ${i}` })), getRowId: (r) => r.id, columns: [{ id: 'name', header: 'Name', width: 200 }], messages: MSG,
      features: [detail<P>({ part: nestedGrid<V>({ env: () => ({ geometry: geo(200), sync: true }), onGrid: (gr) => void inner.push(gr), settings: (c) => ({ rows: Array.from({ length: 40 }, (_, i) => ({ id: `${(c.row as P).id}-V${i}`, n: i })), getRowId: (r) => r.id, columns: [{ id: 'n', header: 'N', type: 'number', width: 80 }], messages: MSG, nonce: (c.row as P).name }) }) })],
    }, { geometry: geo(400), sync: true });
    grids.push(g);
    g.kernel.dispatch({ type: 'rows.expand', rows: [k('P1')], expanded: true }, 'api');
    const a = inner.at(-1)!;
    a.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    a.api.focusCell(k('P1-V5'), 'n');
    g.kernel.rows.applyTransaction({ patch: [{ id: 'P1', set: { name: 'Patient One' } }] });
    const b = inner.at(-1)!;
    expect(b).not.toBe(a);
    expect([(document.activeElement as Element).closest('.dzg') === ctxOf(b).el.root, b.kernel.focus, b.kernel.query.sort]).toEqual([true, { kind: 'cell', row: k('P1-V5'), column: 'n' }, [{ column: 'n', dir: 'asc' }]]);
  });

  it('closed again before its restore job ran: what was remembered is kept, not the unscrolled grid', () => {
    const t = make();
    t.into();
    for (let i = 0; i < 17; i++) t.press('ArrowDown');
    const top = ctxOf(t.inner.at(-1)!).scroll.logicalTop;
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('P1')], expanded: false }, 'user');
    // The next grid's frames held: its restore job waits.
    const held: FrameRequestCallback[] = [];
    t.hold(held);
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('P1')], expanded: true }, 'user');
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('P1')], expanded: false }, 'user');
    t.hold(null);
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('P1')], expanded: true }, 'user');
    expect(ctxOf(t.inner.at(-1)!).scroll.logicalTop).toBe(top);
  });
});
