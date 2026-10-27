// @vitest-environment jsdom
// Phase 6 step 8b-2 (step08b-plan.md §2.5; pinned-rows.md 17–18; owner Q1, O8): blocks, the clipboard and the fill inside
// one pinned band, by the keys and by the mouse — never across a band's edge; Ctrl+A stays the body's; a paste past a
// band's last row counted outside; the body's pointer under a top band (its rows measured from the band's foot). The
// clipboard's grid (`range()`, `edit()` recording its saves, `fill()`) with `pinnedRows()`; expectations by hand.
import { afterEach, describe, it, expect } from 'vitest';
import { pinnedKey, type RowKey } from '@dzgrid/core';
import { pinnedRows } from '../src/pinned-rows.js';
import { EN_PINNED } from '../src/locales/en-pinned.js';
import { fmake, cleanup, flush, frows, key, type C } from './support-fill.js';
import { HEADER } from './support-range.js';

afterEach(cleanup);

const T = (id: string): RowKey => pinnedKey('top', id)!;
const B = (id: string): RowKey => pinnedKey('bottom', id)!;
/** A pinned row: its name `P-<id>`, its quantity `q`. */
const pin = (id: string, q: number): C => ({ id, name: `P-${id}`, qty: q, price: q + 0.5, day: '2026-03-01', at: '2026-03-05T22:59:00Z', st: 'in', ok: true, code: '001', ref: 'R' });

function pmake(o: { top?: C[]; bottom?: C[]; rows?: number; editors?: boolean } = {}) {
  const pins = pinnedRows<C>({ top: o.top ?? [pin('a', 1), pin('b', 2), pin('c', 3)], bottom: o.bottom ?? [pin('t', 7), pin('u', 8)] });
  const t = fmake({ rows: frows(o.rows ?? 30), after: [pins], more: [EN_PINNED], ...(o.editors && { editors: 'after' as const }) });
  const papi = pins.api(t.g as never)!;
  const h = t.h();
  const name = (k: RowKey | undefined) => String(k).replace(/^d:\d+:/, '');
  const prow = (k: RowKey) => [...t.host.querySelectorAll<HTMLElement>('.dzg-pins > .dzg-row')].find((r) => t.ctx.rowRenderer.keyOf(r) === k) ?? null;
  const pcell = (k: RowKey, col = 'name') => prow(k)?.querySelector<HTMLElement>(`.dzg-cell[data-col="${col}"]`) ?? null;
  /** The top band's height: its rows (the cap is not reached here). */
  const tpx = () => papi.rows('top').count * h;
  /** The middle of a pinned cell on screen: the top band under the header, the bottom band under the body's view. */
  const ppt = (k: RowKey, col = 'name') => {
    const top = papi.rows('top').indexOf(k);
    const y = top >= 0 ? HEADER + top * h : HEADER + tpx() + t.ctx.geometry.read().block + papi.rows('bottom').indexOf(k) * h;
    return { clientX: t.pt('r0', col).clientX, clientY: y + h / 2 };
  };
  /** The middle of a body cell on screen: under the top band. */
  const bpt = (id: string, col = 'name') => {
    const p = t.pt(id, col);
    return { clientX: p.clientX, clientY: p.clientY + tpx() };
  };
  /** Focuses a pinned cell, the DOM focus on it. */
  const on = (k: RowKey, col = 'name') => {
    t.g.api.focusCell(k, col);
    pcell(k, col)!.focus();
  };
  /** The tinted cells in the bands, as `row/col`, sorted. */
  const tinted = () => [...t.host.querySelectorAll<HTMLElement>('.dzg-pins .dzg-cell.dzg-cell--range')].map((c) => `${name(t.ctx.rowRenderer.keyOf(c.closest('.dzg-row')!))}/${c.dataset['col']}`).sort();
  const said = () => [...t.host.querySelectorAll<HTMLElement>('.dzg-pins .dzg-cell[aria-selected="true"]')].length;
  const fills = () => [...t.host.querySelectorAll<HTMLElement>('.dzg-pins .dzg-cell.dzg-cell--fill')].map((c) => `${name(t.ctx.rowRenderer.keyOf(c.closest('.dzg-row')!))}/${c.dataset['col']}`).sort();
  const get = () => {
    const r = t.api().get();
    return r ? `${name(r.anchor.row)}/${r.anchor.column}:${name(r.focus.row)}/${r.focus.column}` : null;
  };
  const handleAt = () => {
    const c = t.host.querySelector('.dzg-fill')?.parentElement?.closest<HTMLElement>('.dzg-cell');
    return c ? `${name(t.ctx.rowRenderer.keyOf(c.closest('.dzg-row')!))}/${c.dataset['col']}` : null;
  };
  return { ...t, papi, prow, pcell, ppt, bpt, on, tinted, said, fills, get, handleAt, name };
}

describe('a block inside a band by the keys (pinned-rows.md 17)', () => {
  it('Shift+arrows in the top band: the block tinted and said selected there; at the band\'s edges nothing moves (never the header, never the body)', () => {
    const t = pmake();
    t.on(T('a'));
    t.press('ArrowDown', { shiftKey: true });
    t.press('ArrowRight', { shiftKey: true });
    expect(t.get()).toBe(`${T('a')}/name:${T('b')}/qty`);
    expect(t.tinted()).toEqual([`${T('a')}/name`, `${T('a')}/qty`, `${T('b')}/name`, `${T('b')}/qty`].sort());
    expect(t.said()).toBe(4);
    expect(t.pcell(T('b'))!.classList.contains('dzg-cell--rb')).toBe(true);
    for (let i = 0; i < 4; i++) t.press('ArrowDown', { shiftKey: true });
    expect(t.get()).toBe(`${T('a')}/name:${T('c')}/qty`);
    for (let i = 0; i < 5; i++) t.press('ArrowUp', { shiftKey: true });
    expect(t.get()).toBe(`${T('a')}/name:${T('a')}/qty`);
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: T('a'), column: 'qty' });
  });

  it('Shift+PageDown and Ctrl+Shift+End in the bottom band: its last row, never the body', () => {
    const t = pmake();
    t.on(B('t'));
    t.press('PageDown', { shiftKey: true });
    expect(t.get()).toBe(`${B('t')}/name:${B('u')}/name`);
    t.on(B('u'), 'qty');
    t.press('PageUp', { shiftKey: true });
    expect(t.get()).toBe(`${B('u')}/qty:${B('t')}/qty`);
    t.on(B('t'));
    t.press('End', { shiftKey: true, ctrlKey: true });
    expect(t.g.kernel.focus).toMatchObject({ kind: 'cell', row: B('u') });
    expect(t.api().get()!.anchor.row).toBe(B('t'));
  });

  it('from the body, Shift+arrows never go into a band (O8): the last body row Shift+Down, the first Shift+Up stay', () => {
    const t = pmake({ rows: 3 });
    t.at('r2');
    t.press('ArrowDown', { shiftKey: true });
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: key('r2'), column: 'name' });
    expect(t.get()).toBeNull();
    t.press('ArrowUp', { shiftKey: true });
    expect(t.get()).toBe('r2/name:r1/name');
    t.at('r0');
    t.press('ArrowUp', { shiftKey: true });
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: key('r0'), column: 'name' });
  });

  it('Ctrl+A on a pinned cell: the body\'s cells, never a band\'s; Shift+Space: the pinned row', () => {
    const t = pmake();
    t.on(T('b'), 'qty');
    t.press('a', { ctrlKey: true });
    expect(t.get()).toBe('r0/name:r29/ref');
    expect(t.tinted()).toEqual([]);
    t.on(T('b'), 'qty');
    t.press(' ', { shiftKey: true });
    expect(t.get()).toBe(`${T('b')}/name:${T('b')}/ref`);
  });

  it('the API: a block inside a band is taken; one across a band\'s edge is refused, told', () => {
    const t = pmake();
    expect(t.api().set({ anchor: { row: B('t'), column: 'qty' }, focus: { row: B('u'), column: 'price' } })).toBe(true);
    expect(t.tinted()).toEqual([`${B('t')}/qty`, `${B('t')}/price`, `${B('u')}/qty`, `${B('u')}/price`].sort());
    expect(t.api().box()).toEqual({ top: 0, bottom: 1, start: 1, end: 2 });
    expect(t.api().set({ anchor: { row: T('c'), column: 'qty' }, focus: { row: key('r0'), column: 'qty' } })).toBe(false);
    expect(t.get()).toBe(`${B('t')}/qty:${B('u')}/price`);
  });

  it('the band\'s rows replaced without a corner\'s row: the block dropped', () => {
    const t = pmake();
    t.api().set({ anchor: { row: T('a'), column: 'qty' }, focus: { row: T('b'), column: 'qty' } });
    t.papi.set({ top: [pin('a', 1), pin('c', 3)] });
    expect(t.get()).toBeNull();
    expect(t.tinted()).toEqual([]);
  });
});

describe('the clipboard inside a band (pinned-rows.md 17)', () => {
  it('a copy of a band block writes its cells as shown (an edit saved shows its value)', async () => {
    const t = pmake();
    t.edits!.commit([{ key: T('a'), column: 'name', input: { text: 'Edited' } }]);
    await flush();
    t.api().set({ anchor: { row: T('a'), column: 'name' }, focus: { row: T('b'), column: 'qty' } });
    expect(t.api().copy()!.text).toBe('Edited\t1\r\nP-b\t2\r\n');
  });

  it('a paste into the bottom band: its rows written, one request, pinned; what runs past its last row counted outside; the body untouched', () => {
    const t = pmake();
    t.on(B('t'), 'qty');
    t.requests.length = 0;
    const c = t.api().paste('11\n12\n13');
    expect(c).toMatchObject({ pasted: 2, outside: 1, refused: 0, readOnly: 0 });
    expect(t.requests).toHaveLength(1);
    expect(t.requests[0]!.changes.map((x) => [x.key, x.column, x.value, x.pinned])).toEqual([[B('t'), 'qty', 11, 'bottom'], [B('u'), 'qty', 12, 'bottom']]);
    expect(t.pcell(B('u'), 'qty')!.textContent).toBe('12');
    expect(t.get()).toBe(`${B('t')}/qty:${B('u')}/qty`);
  });

  it('Delete on a band block clears its editable cells, one gesture', () => {
    const t = pmake();
    t.on(T('b'));
    t.press('ArrowDown', { shiftKey: true });
    t.press('ArrowRight', { shiftKey: true });
    t.requests.length = 0;
    t.press('Delete');
    expect(t.changes()).toEqual([`${T('b')}/name=null`, `${T('b')}/qty=null`, `${T('c')}/name=null`, `${T('c')}/qty=null`]);
  });
});

describe('the fill inside a band (pinned-rows.md 17–18)', () => {
  it('Ctrl+D copies the band block\'s first row down into its other rows; Ctrl+R its first column toward the end', () => {
    const t = pmake();
    t.on(T('a'), 'qty');
    t.press('ArrowDown', { shiftKey: true });
    t.press('ArrowDown', { shiftKey: true });
    t.requests.length = 0;
    t.press('d', { ctrlKey: true });
    expect(t.changes()).toEqual([`${T('b')}/qty=1`, `${T('c')}/qty=1`]);
    expect(t.requests[0]!.changes.every((x) => x.pinned === 'top')).toBe(true);
    t.api().set({ anchor: { row: B('t'), column: 'qty' }, focus: { row: B('t'), column: 'price' } });
    t.requests.length = 0;
    t.press('r', { ctrlKey: true });
    expect(t.changes()).toEqual([`${B('t')}/price=7`]);
  });

  it('a fill reads its source as shown: a pinned cell edited and saved is the value copied down', async () => {
    const t = pmake();
    t.edits!.commit([{ key: T('a'), column: 'qty', input: { value: 5 } }]);
    await flush();
    t.api().set({ anchor: { row: T('a'), column: 'qty' }, focus: { row: T('b'), column: 'qty' } });
    t.requests.length = 0;
    expect(t.fapi().down()).toMatchObject({ filled: 1 });
    expect(t.changes()).toEqual([`${T('b')}/qty=5`]);
  });

  it('Ctrl+D on one pinned cell copies the band\'s row above; on the band\'s first row nothing (never the body or the header)', () => {
    const t = pmake();
    t.on(T('b'), 'qty');
    t.requests.length = 0;
    t.press('d', { ctrlKey: true });
    expect(t.changes()).toEqual([`${T('b')}/qty=1`]);
    t.on(B('t'), 'qty');
    t.requests.length = 0;
    expect(t.press('d', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(t.requests).toEqual([]);
  });

  it('bulk: Ctrl+Enter in a field inside a band block writes every cell of it', () => {
    const t = pmake({ editors: true });
    t.on(T('a'), 'qty');
    t.press('ArrowDown', { shiftKey: true });
    t.press('ArrowDown', { shiftKey: true });
    t.press('F2');
    const f = t.host.querySelector<HTMLInputElement>('.dzg-field')!;
    f.value = '42';
    f.dispatchEvent(new Event('input', { bubbles: true }));
    t.requests.length = 0;
    t.press('Enter', { ctrlKey: true }, f);
    expect(t.changes()).toEqual([`${T('a')}/qty=42`, `${T('b')}/qty=42`, `${T('c')}/qty=42`]);
  });

  it('the keyboard fill mode in a band: the target moves inside the band only', () => {
    const t = pmake();
    t.on(T('a'), 'qty');
    t.press('Enter', { ctrlKey: true, shiftKey: true });
    for (let i = 0; i < 5; i++) t.press('ArrowDown');
    expect(t.fills()).toEqual([`${T('b')}/qty`, `${T('c')}/qty`]);
    t.requests.length = 0;
    t.press('Enter');
    expect(t.changes()).toEqual([`${T('b')}/qty=1`, `${T('c')}/qty=1`]);
  });
});

describe('the mouse inside a band (owner Q1)', () => {
  it('a drag in the top band makes a block there; past the band\'s foot it stops at its last row; the click after it swallowed', () => {
    const t = pmake();
    t.down(t.pcell(T('a'))!, t.ppt(T('a')));
    t.move(t.ppt(T('b'), 'qty'));
    expect(t.get()).toBe(`${T('a')}/name:${T('b')}/qty`);
    expect(t.tinted()).toHaveLength(4);
    t.move(t.bpt('r4', 'qty'));
    expect(t.get()).toBe(`${T('a')}/name:${T('c')}/qty`);
    t.move({ clientX: t.ppt(T('a')).clientX, clientY: 2 });
    expect(t.get()).toBeNull();
    t.move(t.ppt(T('c'), 'price'));
    t.up(t.ppt(T('c'), 'price'));
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    t.pcell(T('c'), 'price')!.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(t.get()).toBe(`${T('a')}/name:${T('c')}/price`);
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: T('a'), column: 'name' });
  });

  it('a drag in the bottom band; a drag over it from the body stays in the body', () => {
    const t = pmake();
    t.down(t.pcell(B('u'), 'qty')!, t.ppt(B('u'), 'qty'));
    t.move(t.ppt(B('t'), 'name'));
    t.up(t.ppt(B('t'), 'name'));
    expect(t.get()).toBe(`${B('u')}/qty:${B('t')}/name`);
    t.at('r2');
    t.down(t.cell('r2')!, t.bpt('r2'));
    t.move(t.ppt(B('u'), 'qty'));
    expect(t.api().get()!.focus.row.startsWith('d:')).toBe(true);
  });

  it('a body drag under a top band: the rows under the pointer (measured from the band\'s foot)', () => {
    const t = pmake();
    t.down(t.cell('r1')!, t.bpt('r1'));
    t.move(t.bpt('r3', 'qty'));
    t.up(t.bpt('r3', 'qty'));
    expect(t.get()).toBe('r1/name:r3/qty');
  });

  it('Shift+click on a body cell from a pinned cell: no block across the edge', () => {
    const t = pmake();
    t.on(T('c'), 'qty');
    t.down(t.cell('r1', 'qty')!, t.bpt('r1', 'qty'), { shiftKey: true });
    t.up(t.bpt('r1', 'qty'));
    expect(t.get()).toBeNull();
    expect(t.tinted()).toEqual([]);
  });

  it('the fill handle on a band block\'s corner; dragged down inside the band it fills there, past the band it stops at its last row', () => {
    const t = pmake();
    t.on(T('a'), 'qty');
    expect(t.handleAt()).toBe(`${T('a')}/qty`);
    const hd = t.host.querySelector<HTMLElement>('.dzg-fill')!;
    t.down(hd, t.ppt(T('a'), 'qty'));
    t.move(t.ppt(T('b'), 'qty'));
    expect(t.fills()).toEqual([`${T('b')}/qty`]);
    t.move(t.bpt('r5', 'qty'));
    expect(t.fills()).toEqual([`${T('b')}/qty`, `${T('c')}/qty`]);
    t.requests.length = 0;
    t.up(t.bpt('r5', 'qty'));
    expect(t.changes()).toEqual([`${T('b')}/qty=1`, `${T('c')}/qty=1`]);
    expect(t.get()).toBe(`${T('a')}/qty:${T('c')}/qty`);
    expect(t.handleAt()).toBe(`${T('c')}/qty`);
  });

  it('the no-drag way in a band: a click on the handle, then a click on a band cell', () => {
    const t = pmake();
    t.on(B('t'), 'qty');
    t.requests.length = 0;
    t.click(t.host.querySelector<HTMLElement>('.dzg-fill')!);
    const c = t.pcell(B('u'), 'qty')!;
    c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true, ...t.ppt(B('u'), 'qty') }));
    t.up(t.ppt(B('u'), 'qty'), c);
    t.click(c, t.ppt(B('u'), 'qty'));
    expect(t.changes()).toEqual([`${B('u')}/qty=7`]);
  });
});
