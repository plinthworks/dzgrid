// Gaps the step-10 tests left (coverage review): each test kills a mutant the 41 tests let live.
import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, detailKey, makeQuery, type GridEvent, type RowKey } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridContext } from '../src/context.js';
import type { Geometry } from '../src/render/measure.js';
import { definePart, type SlotContext } from '../src/part.js';
import { detail, nestedGrid } from '../src/detail.js';
import { EN } from '../src/locales/en.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';

type P = { id: string; name: string; n: number };
type V = { id: string; n: number };
const k = (id: string): RowKey => dataKey(id)!;
const x = (id: string): RowKey => detailKey(k(id));
const MSG = { ...EN, text: { ...EN.text, ...EN_DETAIL.text } };
const geo = (block: number): Geometry => {
  const box = { block, inline: 500, scrollTop: 0, scrollInline: 0 };
  return { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
};
const grids: GridInstance<any, any>[] = [];
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanup.splice(0)) c();
  for (const g of grids.splice(0)) g.destroy();
  document.body.innerHTML = '';
});
const ctxOf = <C>(g: GridInstance<C, any>): GridContext<C> => (g as unknown as { context: GridContext<C> }).context;
const PATIENTS = Array.from({ length: 30 }, (_, i) => ({ id: `P${i}`, name: `Patient ${i}`, n: i }));
const press = (key: string) => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

function nested(o: { visits?: (p: P) => V[]; events?: GridEvent<V>[][] } = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const inner: GridInstance<V, any>[] = [];
  const g = createGrid<P>(host, {
    rows: PATIENTS, getRowId: (r) => r.id, messages: MSG,
    columns: [{ id: 'name', header: 'Name', width: 160 }, { id: 'n', header: 'N', type: 'number', width: 80 }],
    features: [detail<P>({ part: nestedGrid<V>({
      env: () => ({ geometry: geo(200), sync: true }),
      onGrid: (gr) => void inner.push(gr),
      settings: (c) => {
        const ev: GridEvent<V>[] = [];
        o.events?.push(ev);
        return { rows: o.visits?.(c.row as P) ?? Array.from({ length: 30 }, (_, i) => ({ id: `${(c.row as P).id}-V${i}`, n: i })), getRowId: (r) => r.id, columns: [{ id: 'n', header: 'N', type: 'number', width: 80 }], messages: MSG, onEvent: (e) => ev.push(e) };
      },
    }) })],
  }, { geometry: geo(400), sync: true });
  grids.push(g);
  return { g, inner, ctx: ctxOf(g) };
}

describe('nestedGrid: the edges the step-10 tests do not reach', () => {
  it('Escape from an inner grid comes back to the panel with the goal column kept: Down goes on in that column', () => {
    // Mutant: leave() always on the first column (the goal column lost).
    const t = nested();
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('P1')], expanded: true }, 'api');
    t.g.api.focusCell(k('P1'), 'n');
    press('ArrowDown');
    press('Enter');
    expect((document.activeElement as Element).closest('.dzg')).toBe(ctxOf(t.inner.at(-1)!).el.root);
    press('Escape');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: x('P1'), column: 'n' });
    press('ArrowDown');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: k('P2'), column: 'n' });
  });

  it('Enter on the panel of an inner grid with no rows: the focus stays on the panel, nothing thrown', () => {
    // Mutant: focus() without `d.count` (focusCell on a row that is not there).
    // A listener that throws is reported to the window, not to dispatchEvent's caller: counted here.
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent) => void (errors.push(e.error), e.preventDefault());
    window.addEventListener('error', onError);
    cleanup.push(() => window.removeEventListener('error', onError));
    const t = nested({ visits: () => [] });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('P1')], expanded: true }, 'api');
    t.g.api.focusCell(k('P1'), 'name');
    press('ArrowDown');
    expect(() => press('Enter')).not.toThrow();
    expect(document.activeElement!.classList.contains('dzg-dcell')).toBe(true);
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: x('P1'), column: 'name' });
    // A filter that empties an inner grid with a focus: Enter again stays put, the focus never on the body.
    const u = nested();
    u.g.kernel.dispatch({ type: 'rows.expand', rows: [k('P2')], expanded: true }, 'api');
    u.g.api.focusCell(k('P2'), 'name');
    press('ArrowDown');
    press('Enter');
    press('Escape');
    u.inner.at(-1)!.kernel.dispatch({ type: 'query.set', query: makeQuery({ quick: 'nothing matches this' }) }, 'api');
    expect(u.inner.at(-1)!.kernel.rows.displayed.count).toBe(0);
    expect(() => press('Enter')).not.toThrow();
    expect(document.activeElement).not.toBe(document.body);
    expect(errors).toEqual([]);
  });

  it('a remembered query comes back as the host’s, not the user’s: no user-sourced event from the restore', () => {
    // Mutant: the restore dispatched with source 'user' (an inner grid would say it, events would claim the user).
    const events: GridEvent<V>[][] = [];
    const t = nested({ events });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('P1')], expanded: true }, 'api');
    t.inner.at(-1)!.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('P1')], expanded: false }, 'api');
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('P1')], expanded: true }, 'api');
    const b = t.inner.at(-1)!;
    expect(b.kernel.query.sort).toEqual([{ column: 'n', dir: 'asc' }]);
    const restored = events.at(-1)!;
    expect(restored.some((e) => e.type === 'sortChanged')).toBe(true);
    expect(restored.filter((e) => (e as { source?: string }).source === 'user').map((e) => e.type)).toEqual([]);
    expect(ctxOf(b).live.said).toBe('');
  });
});

describe('detail(): the part follows the grid’s context, not only its words', () => {
  function logged() {
    const last = new Map<RowKey, SlotContext['detail']>();
    const host = document.createElement('div');
    document.body.append(host);
    const g = createGrid<P>(host, {
      rows: PATIENTS, getRowId: (r) => r.id, messages: MSG, columns: [{ id: 'name', header: 'Name', width: 160 }],
      features: [detail<P>({ part: definePart('detail', { mount: (_h, c) => (last.set(c.key, c), { update: (n) => void last.set(n.key, n) }) }) })],
    }, { geometry: geo(400), sync: true });
    grids.push(g);
    g.kernel.dispatch({ type: 'rows.expand', rows: [k('P1')], expanded: true }, 'api');
    return { g, ctx: ctxOf(g), last };
  }

  it('a new time zone or locale (same words): the part is given the new ctx', () => {
    // Mutant: the update test without `l.ctx !== c.ctx` (only the words' revision): a nested grid would keep the old zone.
    const t = logged();
    const was = t.last.get(x('P1'))!.ctx;
    t.g.update({ timeZone: 'Asia/Tokyo' });
    expect(t.ctx.partBase!.ctx).not.toBe(was);
    expect(t.last.get(x('P1'))!.ctx).toBe(t.ctx.partBase!.ctx);
    t.g.update({ locale: 'fr-FR' });
    expect(t.last.get(x('P1'))!.ctx).toBe(t.ctx.partBase!.ctx);
  });

  it('Alt, Ctrl or Meta with forward/back on the chevron cell: never opens or closes (the browser\'s and the OS\'s keys)', () => {
    // Mutant: the modifier test without `e.altKey` (Alt+Left is the browser's Back).
    const t = logged();
    t.g.api.focusCell(k('P2'), 'name');
    for (const mod of ['altKey', 'ctrlKey', 'metaKey'] as const) {
      (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', [mod]: true, bubbles: true, cancelable: true }));
      expect(t.g.kernel.expansion.has(k('P2')), mod).toBe(false);
    }
    t.g.api.focusCell(k('P1'), 'name');
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true }));
    expect(t.g.kernel.expansion.has(k('P1'))).toBe(true);
  });

  it('a new direction: the part is given it', () => {
    const t = logged();
    t.g.update({ direction: 'rtl' });
    expect(t.last.get(x('P1'))!.dir).toBe('rtl');
  });
});
