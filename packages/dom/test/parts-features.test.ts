// Parts a feature brings, and the slot→feature map of missing-feature (step 12; docs/behaviors/parts.md).
import { describe, it, expect, afterEach } from 'vitest';
import type { GridEvent, Problem } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import { definePart, type SlotPart } from '../src/part.js';
import type { GridFeature } from '../src/features.js';
import type { GridContext } from '../src/context.js';
import { slots } from '../src/slots.js';
import { filters } from '../src/filters.js';
import { MESSAGES } from './support-filters.js';

type R = { id: string; n: number; s: string };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

const cell = (mark: string) => definePart('cell', { mount: (h) => { h.append(mark); return {}; } });
const withParts = (id: string, parts: Record<string, SlotPart>): GridFeature => ({ id, parts, setup: () => ({ destroy() {} }) });

function make(features: readonly GridFeature[], parts?: Record<string, SlotPart>, columns: unknown[] = [{ id: 'n', type: 'number' }, { id: 's', ui: { cell: 'badge' } }]) {
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const g = createGrid<R>(host, { rows: [{ id: 'a', n: 1, s: 'x' }], getRowId: (r) => r.id, columns: columns as never, messages: MESSAGES, features, ...(parts && { parts }), onEvent: (e) => events.push(e) }, { sync: true });
  grids.push(g);
  const text = (col: string) => host.querySelector(`.dzg-layer .dzg-cell[data-col="${col}"]`)!.textContent;
  const problems = (): Problem[] => events.flatMap((e) => (e.type === 'problems' ? e.problems : []));
  const ctx = (g as unknown as { context: GridContext<R> }).context;
  return { g, host, text, problems, ctx };
}

describe('a feature’s parts', () => {
  it('are found by type and by a column’s own name', () => {
    const t = make([withParts('f', { 'cell.number': cell('F#'), badge: cell('Fb') })]);
    expect(t.text('n')).toBe('F#');
    expect(t.text('s')).toBe('Fb');
  });

  it('lose to the host’s settings.parts', () => {
    const t = make([withParts('f', { 'cell.number': cell('F#') })], { 'cell.number': cell('H#'), badge: cell('Hb') });
    expect(t.text('n')).toBe('H#');
  });

  it('first feature wins a name', () => {
    const t = make([withParts('f1', { 'cell.number': cell('1') }), withParts('f2', { 'cell.number': cell('2'), badge: cell('2b') })]);
    expect(t.text('n')).toBe('1');
    expect(t.text('s')).toBe('2b');
  });

  it('g.parts() is one object until settings.parts changes, and a change re-resolves live', () => {
    const t = make([withParts('f', { 'cell.number': cell('F#') })]);
    const first = t.ctx.parts();
    t.g.api.refresh();
    expect(t.ctx.parts()).toBe(first);
    t.g.update({ parts: { 'cell.number': cell('H#') } });
    expect(t.ctx.parts()).not.toBe(first);
    expect(t.text('n')).toBe('H#');
    t.g.update({ parts: {} });
    expect(t.text('n')).toBe('F#');
  });

  it('reach the slots’ resolution: a feature’s header and overlay parts', () => {
    const header = definePart('header', { mount: (h, c) => { h.append(`H:${c.label}`); return {}; } });
    const t = make([slots(), withParts('f', { header })], undefined, [{ id: 'n', header: 'N', type: 'number' }]);
    expect(t.host.querySelector('.dzg-hlabel')!.textContent).toBe('H:N');
    const overlay = definePart('overlay', { mount: (h, c) => { h.append(`O:${c.phase}`); return {}; } });
    const u = make([slots(), withParts('f', { overlay })]);
    u.g.kernel.dispatch({ type: 'quick.set', text: 'zzz' }, 'user');
    expect(u.host.querySelector('.dzg-overlay')!.textContent).toBe('O:no-match');
  });

  it('re-resolve the floating cells when the registry changes', () => {
    const t = make([filters({ floating: true })], undefined, [{ id: 's' }]);
    expect(t.host.querySelector('.dzg-hextra input')).not.toBeNull();
    t.g.update({ parts: { 'floating.text': definePart('floating', { mount: (h) => { h.append('mine'); return {}; } }) } });
    expect(t.host.querySelector('.dzg-hextra')!.textContent).toBe('mine');
    t.g.update({ parts: {} });
    expect(t.host.querySelector('.dzg-hextra input')).not.toBeNull();
  });
});

describe('missing-feature, by slot', () => {
  it('names the feature each slot needs', () => {
    const p = (slot: string) => ({ slot, part: { mount: () => ({}) } }) as unknown as SlotPart;
    const t = make([], { h: p('header'), o: p('overlay'), t: p('tooltip'), f: p('floating'), ff: p('filter'), foot: p('footer'), c: p('cell') });
    expect(t.problems().filter((x) => x.code === 'missing-feature')).toEqual([
      { code: 'missing-feature', severity: 'warning', path: 'parts.h', detail: 'slots' },
      { code: 'missing-feature', severity: 'warning', path: 'parts.o', detail: 'slots' },
      { code: 'missing-feature', severity: 'warning', path: 'parts.t', detail: 'slots' },
      { code: 'missing-feature', severity: 'warning', path: 'parts.f', detail: 'filters' },
      { code: 'missing-feature', severity: 'warning', path: 'parts.ff', detail: 'filters' },
      { code: 'missing-feature', severity: 'warning', path: 'parts.foot', detail: 'pagination' },
    ]);
    const u = make([filters()], { f: p('floating') });
    expect(u.problems().filter((x) => x.code === 'missing-feature')).toEqual([]);
  });

  it('tells a column asking for a floating filter or naming a filter kind without filters(), i over the leaves', () => {
    const t = make([], undefined, [{ id: 'g', children: [{ id: 'a' }, { id: 'n', type: 'number', filter: { floating: true } }] }, { id: 's', filter: { kind: 'text' } }, { id: 'z', filter: { floating: false } }]);
    expect(t.problems().filter((x) => x.code === 'missing-feature' && x.detail === 'filters')).toEqual([
      { code: 'missing-feature', severity: 'warning', path: 'columns[1].filter', detail: 'filters' },
      { code: 'missing-feature', severity: 'warning', path: 'columns[2].filter', detail: 'filters' },
    ]);
    const u = make([filters()], undefined, [{ id: 'n', type: 'number', filter: { floating: true } }]);
    expect(u.problems().filter((x) => x.code === 'missing-feature')).toEqual([]);
  });
});
