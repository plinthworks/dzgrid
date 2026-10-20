// Review of step 20 (ready cell parts): repros and extra killing tests.
import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, localeCtx, type ColumnDef } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry } from '../src/render/measure.js';
import type { SlotContext, SlotPart } from '../src/part.js';
import type { GridMessages } from '../src/messages.js';
import { badge, cellBoolean, type Tone } from '../src/parts.js';
import { EN } from '../src/locales/en.js';
import { EN_PARTS } from '../src/locales/en-parts.js';

type R = { id: string; s: string | null; ok: boolean | null };
const M: GridMessages = { ...EN, text: { ...EN.text, ...EN_PARTS.text } };
let gs: GridInstance<R>[] = [];
afterEach(() => { gs.forEach((g) => g.destroy()); gs = []; document.body.innerHTML = ''; });

function make(rows: R[], cols: ColumnDef<R, any>[], tones: Record<string, Tone> = {}) {
  const box = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: () => {}, writeScrollInline: () => {} };
  const host = document.createElement('div');
  document.body.append(host);
  const g = createGrid<R>(host, { rows, getRowId: (r) => r.id, columns: cols, messages: M, parts: { b: badge({ tones }), 'cell.boolean': cellBoolean } }, { geometry, sync: true });
  gs.push(g);
  return { g, cell: (row: number, col: string) => host.querySelector<HTMLElement>(`.dzg-row[aria-rowindex="${row}"] [data-col="${col}"]`)! };
}

function alone(p: SlotPart<'cell'>, over: Partial<SlotContext['cell']>) {
  const host = document.createElement('div');
  document.body.append(host);
  const base: SlotContext['cell'] = {
    ctx: localeCtx({ locale: 'en' }), dir: 'ltr', doc: document, announce: () => {},
    msg: (k) => (M.text as Record<string, string>)[k]!, value: null, text: '', row: {}, key: dataKey('a')!, column: {} as never, focused: false,
  };
  const c = (o: Partial<SlotContext['cell']>): SlotContext['cell'] => ({ ...base, ...o });
  return { host, handle: p.part.mount(host, c(over)), c };
}

describe('step 20 review: bugs (it.fails until fixed)', () => {
  // badge.ts:25 tests `!c.text`; a text of spaces is not blank to the codec (rows.ts isBlank), so the
  // badge draws an empty frame with no accessible name, unlike the "" case the suite pins.
  it('a text column value of spaces shows no empty badge frame', () => {
    const { cell } = make([{ id: 'a', s: '   ', ok: true }], [{ id: 's', type: 'text', ui: { cell: 'b' } }]);
    expect(cell(2, 's').querySelector('.dzg-badge')).toBeNull();
  });

  // draw.ts:32 writes data-tone only when the tone is truthy and never clears it; badge.ts:27 returns
  // an own `undefined` entry as is (no `?? fallback`), so the previous row's tone stays on a pooled cell.
  it('an own undefined tone falls back instead of keeping the previous row’s tone', () => {
    const tones = { late: 'danger', odd: undefined } as unknown as Record<string, Tone>;
    const { host, handle, c } = alone(badge({ tones, fallback: 'info' }), { value: 'late', text: 'Late' });
    handle.update!(c({ value: 'odd', text: 'Odd' }));
    expect(host.querySelector<HTMLElement>('.dzg-badge')!.dataset['tone']).toBe('info');
  });
});

describe('step 20 review: extra coverage (pass today)', () => {
  it('keeps the same glyph and label elements across tone changes (no churn of children)', () => {
    const { host, handle, c } = alone(badge({ tones: { a: 'success', b: 'danger', n: 'neutral' } }), { value: 'a', text: 'A' });
    const g = host.querySelector('.dzg-glyph'), l = host.querySelector('[dir=auto]');
    handle.update!(c({ value: 'n', text: 'N' }));
    handle.update!(c({ value: 'b', text: 'B' }));
    expect(host.querySelector('.dzg-glyph')).toBe(g);
    expect(host.querySelector('[dir=auto]')).toBe(l);
    expect(host.querySelectorAll('.dzg-glyph')).toHaveLength(1);
    expect(host.textContent).toBe('✕B');
  });

  it('writes nothing on an unchanged yes/no rebind (no tone attribute ever)', async () => {
    const { host, handle, c } = alone(cellBoolean, { value: false, text: 'false' });
    const seen: MutationRecord[] = [];
    const mo = new MutationObserver((r) => seen.push(...r));
    mo.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
    handle.update!(c({ value: false, text: 'false', focused: true }));
    await Promise.resolve();
    mo.disconnect();
    expect(seen).toEqual([]);
    expect(host.firstElementChild!.hasAttribute('data-tone')).toBe(false);
  });

  it('keys a boolean or number value by String(value) in the grid', () => {
    const { cell } = make([{ id: 'a', s: null, ok: true }, { id: 'b', s: null, ok: false }], [{ id: 'ok', type: 'boolean', ui: { cell: 'b' } }], { true: 'success', false: 'danger' });
    expect(cell(2, 'ok').querySelector<HTMLElement>('.dzg-badge')!.dataset['tone']).toBe('success');
    expect(cell(3, 'ok').querySelector<HTMLElement>('.dzg-badge')!.dataset['tone']).toBe('danger');
  });

  it('a grid repaint with focus moving writes nothing inside the parts', async () => {
    const { g, cell } = make([{ id: 'a', s: 'done', ok: true }, { id: 'b', s: 'late', ok: false }], [{ id: 's', type: 'text', ui: { cell: 'b' } }, { id: 'ok', type: 'boolean' }], { done: 'success' });
    const inner = [cell(2, 's').firstElementChild!, cell(2, 'ok').firstElementChild!];
    const seen: MutationRecord[] = [];
    const mo = new MutationObserver((r) => seen.push(...r));
    for (const el of inner) mo.observe(el, { subtree: true, childList: true, attributes: true, characterData: true });
    g.api.focusCell(dataKey('a')!, 's');
    g.api.focusCell(dataKey('b')!, 'ok');
    g.update({ density: 'compact' });
    await Promise.resolve();
    mo.disconnect();
    expect(seen).toEqual([]);
    expect(cell(2, 's').firstElementChild).toBe(inner[0]);
  });
});
