// Phase 5 step 7, the failed cell's tooltip (edit-save.md 13, O11, owner S7-O4; step07-plan.md finding 6, « Failed
// tooltip »): hovering a failed cell (after the delay) or reaching it by the keyboard (at once) shows why; it replaces
// the column's own tooltip while the error stays; never on an open field; hidden at the paint where the mark goes;
// read once (the mark's description), the tooltip adding no `aria-describedby` of its own.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { cleanup, k, type R } from './support-editors.js';
import { flush, saving } from './support-saves.js';

afterEach(cleanup);

const COLS: ColumnDef<R, any>[] = [
  { id: 'name', header: 'Name', width: 120, editable: true },
  { id: 'n', header: 'Stock', type: 'number', width: 80, editable: true, edit: { min: 1 }, tooltip: (v: number | null) => `Stock ${v}` },
  { id: 'q', header: 'Price', type: 'number', width: 80, editable: true },
];

async function failed(err: unknown = { reason: 'locked by another user' }, lang: 'en' | 'fr' | 'ar' = 'en', col = 'n') {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const t = saving({ lang, columns: COLS });
  t.api.commit([{ key: k('r1'), column: col, input: { text: '17' } }]);
  t.held[0]!.no(err);
  await flush();
  vi.advanceTimersByTime(600);
  const tip = t.host.querySelector<HTMLElement>('.dzg-tooltip')!;
  const over = (el: HTMLElement) => el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
  const shown = () => (tip.hidden ? null : tip.textContent);
  return { ...t, tip, over, shown };
}

describe('the reason on hover and on focus', () => {
  it('hover: after the delay (500 ms), the reason; the column\'s own tooltip replaced (S7-O4)', async () => {
    const t = await failed();
    t.over(t.cell('r1', 'n')!);
    vi.advanceTimersByTime(450);
    expect(t.shown()).toBeNull();
    vi.advanceTimersByTime(100);
    expect(t.shown()).toBe('Not saved: locked by another user');
  });

  it('keyboard focus: at once; Escape hides it, the focus stays', async () => {
    const t = await failed();
    t.at('r0', 'n');
    t.key('ArrowDown');
    expect(t.focusAt()).toBe('r1/n');
    expect(t.shown()).toBe('Not saved: locked by another user');
    t.key('Escape');
    expect(t.shown()).toBeNull();
    expect(t.focusAt()).toBe('r1/n');
  });

  it('read once: the cell\'s description holds the mark\'s text, never the tooltip\'s id', async () => {
    const t = await failed();
    t.at('r0', 'n');
    t.key('ArrowDown');
    expect(t.shown()).not.toBeNull();
    expect(t.ids('r1')).not.toContain(t.tip.id);
    expect(t.descOf('r1')).toBe('Not saved: locked by another user');
  });

  it('a cell that is not failed keeps the column\'s tooltip (described by it, as before)', async () => {
    const t = await failed();
    t.over(t.cell('r2', 'n')!);
    vi.advanceTimersByTime(550);
    expect(t.shown()).toBe('Stock 2');
    expect(t.ids('r2')).toContain(t.tip.id);
  });

  it('a failed cell of a column without a tooltip has one', async () => {
    const t = await failed({ reason: 'no' }, 'en', 'q');
    t.over(t.cell('r1', 'q')!);
    vi.advanceTimersByTime(550);
    expect(t.shown()).toBe('Not saved: no');
  });

  it('none while editing: neither on the cell hovered nor on its field (focused by the key that opened it)', async () => {
    const t = await failed();
    t.at('r1', 'n');
    t.key('F2');
    expect(t.shown()).toBeNull();
    t.over(t.field()!);
    vi.advanceTimersByTime(550);
    expect(t.shown()).toBeNull();
    t.over(t.cell('r0', 'n')!);
    t.over(t.cell('r1', 'n')!);
    vi.advanceTimersByTime(550);
    expect(t.shown()).toBeNull();
  });

  it('saved again: the reason goes at that paint, the column\'s own tooltip in its place (review 1: re-resolved); the column\'s on the next hover', async () => {
    const t = await failed();
    t.over(t.cell('r1', 'n')!);
    vi.advanceTimersByTime(550);
    expect(t.shown()).not.toBeNull();
    t.api.commit([{ key: k('r1'), column: 'n', input: { text: '18' } }]);
    expect(t.shown()).toBe('Stock 18');
    expect(t.ids('r1')).toContain(t.tip.id);
    t.held[1]!.ok();
    await flush();
    expect(t.shown()).toBe('Stock 18');
  });

  it('shown during the refusal\'s 0.5 s, then a new value kept at once: the reason goes (the cell no longer failed), the column\'s tooltip instead', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const t = saving({ columns: COLS });
    t.api.commit([{ key: k('r1'), column: 'n', input: { text: '17' } }]);
    t.held[0]!.no({ reason: 'locked' });
    await flush();
    const tip = t.host.querySelector<HTMLElement>('.dzg-tooltip')!;
    t.at('r0', 'n');
    t.key('ArrowDown');
    expect(t.cls('r1')).toContain('refused');
    expect(tip.hidden ? null : tip.textContent).toBe('Not saved: locked');
    t.api.commit([{ key: k('r1'), column: 'n', input: { text: '18' } }]);
    expect(t.cls('r1')).toBe('saving');
    // Re-resolved (review 1): the column's own tooltip, with the value kept.
    expect(tip.hidden ? null : tip.textContent).toBe('Stock 18');
  });

  it('review 1: a cell showing the column\'s tooltip (reached by the keyboard, Enter stays) that is then refused: the reason replaces it at that paint, described once', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const t = saving({ columns: COLS });
    const tip = t.host.querySelector<HTMLElement>('.dzg-tooltip')!;
    t.at('r0', 'n');
    t.key('ArrowDown');
    expect(tip.hidden ? null : tip.textContent).toBe('Stock 1');
    t.api.commit([{ key: k('r1'), column: 'n', input: { text: '17' } }]);
    t.held[0]!.no({ reason: 'locked' });
    await flush();
    expect(tip.hidden ? null : tip.textContent).toBe('Not saved: locked');
    vi.advanceTimersByTime(600);
    expect(tip.hidden ? null : tip.textContent).toBe('Not saved: locked');
    expect(t.ids('r1')).not.toContain(tip.id);
    expect(t.descOf('r1')).toBe('Not saved: locked');
  });

  it('undone? nothing to undo (a refusal leaves none); the source changed: the error and its tooltip go', async () => {
    const t = await failed();
    t.over(t.cell('r1', 'n')!);
    vi.advanceTimersByTime(550);
    t.g.kernel.rows.applyTransaction({ update: [{ id: 'r1', name: 'x', n: 9, s: '', q: 1 }] });
    expect(t.cls('r1')).toBe('');
    expect(t.shown()).toBeNull();
  });

  it('the text per reason: a code\'s (« au moins 1 »), fr; the generic one; ar', async () => {
    const a = await failed({ code: 'min' }, 'fr');
    a.over(a.cell('r1', 'n')!);
    vi.advanceTimersByTime(550);
    expect(a.shown()).toBe('Non enregistré : au moins 1');
    cleanup();
    const b = await failed(new Error('500'), 'fr');
    b.over(b.cell('r1', 'n')!);
    vi.advanceTimersByTime(550);
    expect(b.shown()).toBe('Non enregistré : refusé par le serveur');
    cleanup();
    const c = await failed({ reason: 'مقفل' }, 'ar');
    c.over(c.cell('r1', 'n')!);
    vi.advanceTimersByTime(550);
    expect(c.shown()).toBe('لم يُحفظ: مقفل');
  });

  it('placed below the cell, or above near the bottom of the window; never over it', async () => {
    const t = await failed();
    // Own rects on the two elements (a prototype mock would be one function for both).
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 300, right: 380, x: 300, y: top, width: 80, height: bottom - top, toJSON() {} }) as DOMRect;
    const cell = t.cell('r1', 'n')!;
    let at = rect(100, 132);
    cell.getBoundingClientRect = () => at;
    t.tip.getBoundingClientRect = () => rect(0, 30);
    t.over(cell);
    vi.advanceTimersByTime(550);
    expect(parseFloat(t.tip.style.getPropertyValue('inset-block-start'))).toBeGreaterThanOrEqual(132);
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r0'), column: 'n' } }, 'api');
    t.tip.hidden = true;
    at = rect(window.innerHeight - 40, window.innerHeight - 8);
    t.over(t.cell('r0', 'n')!);
    t.over(cell);
    vi.advanceTimersByTime(550);
    expect(parseFloat(t.tip.style.getPropertyValue('inset-block-start')) + 30).toBeLessThanOrEqual(window.innerHeight - 40);
  });

describe('analyser 7–8: column tooltips and paints', () => {
  it('7: the column\'s own tooltip survives a paint', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const t = saving({ columns: COLS });
    const tip = t.host.querySelector<HTMLElement>('.dzg-tooltip')!;
    t.cell('r2', 'n')!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    vi.advanceTimersByTime(550);
    expect(tip.hidden ? null : tip.textContent).toBe('Stock 2');
    t.g.api.refresh();
    t.api.commit([{ key: k('r5'), column: 'n', input: { text: '9' } }]);
    expect(tip.hidden ? null : tip.textContent).toBe('Stock 2');
  });

  it('8: after a failed cell\'s tooltip, a column tooltip elsewhere survives a paint', async () => {
    const t = await failed();
    t.over(t.cell('r1', 'n')!);
    vi.advanceTimersByTime(550);
    expect(t.shown()).toBe('Not saved: locked by another user');
    t.over(t.cell('r2', 'n')!);
    vi.advanceTimersByTime(550);
    expect(t.shown()).toBe('Stock 2');
    t.g.api.refresh();
    expect(t.shown()).toBe('Stock 2');
  });
});
});
