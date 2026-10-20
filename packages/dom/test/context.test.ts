// The application's context (`settings.context`, step 21, owner Q3; docs/behaviors/parts.md).
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef, GridEvent } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import type { GridMessages } from '../src/messages.js';
import { definePart, type SlotContext, type WiredSlot } from '../src/part.js';
import { slots } from '../src/slots.js';
import { filters } from '../src/filters.js';
import { pagination } from '../src/pagination.js';
import { UPDATE_POLICY } from '../src/update.js';
import { EN } from '../src/locales/en.js';
import { EN_FILTERS } from '../src/locales/en-filters.js';
import { EN_PAGINATION } from '../src/locales/en-pagination.js';
import { flush, xmake } from './support-export.js';

type R = { id: string; n: number; s: string };
let grids: GridInstance<R, any>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; vi.useRealTimers(); vi.restoreAllMocks(); });
const MESSAGES: GridMessages = { locale: 'en', text: { ...EN.text, ...EN_FILTERS.text, ...EN_PAGINATION.text } };

/** A part for `slot` that records each context it gets, and its lifecycle. */
function recorder<S extends WiredSlot>(slot: S) {
  const seen = { mounts: 0, updates: 0, destroys: 0, contexts: [] as unknown[], last: null as SlotContext[S] | null };
  const part = definePart(slot, {
    mount(host: HTMLElement, c: SlotContext[S]) {
      seen.mounts++;
      seen.contexts.push(c.context);
      seen.last = c;
      host.append(document.createTextNode('p'));
      return {
        update(n: SlotContext[S]) { seen.updates++; seen.contexts.push(n.context); seen.last = n; },
        destroy() { seen.destroys++; },
      };
    },
  } as never);
  return { seen, part };
}

function make(settings: Partial<GridSettings<R>> = {}, columns?: ColumnDef<R, any>[]) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const cols: ColumnDef<R, any>[] = columns ?? [{ id: 'n', header: 'Number', type: 'number', ui: { cell: 'myCell' } }, { id: 's', header: 'Status' }];
  const g = createGrid<R>(host, {
    rows: Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, n: i, s: i % 2 ? 'odd' : 'even' })), getRowId: (r) => r.id, columns: cols, messages: MESSAGES,
    onEvent: (e) => events.push(e), ...settings,
  }, { geometry, sync: true });
  grids.push(g);
  return { g, host, events };
}

describe('settings.context', () => {
  it('is live in the update policy', () => {
    expect(UPDATE_POLICY.context).toBe('live');
  });

  it('reaches every part: cell, header, overlay, floating, filter, footer, tooltip', () => {
    vi.useFakeTimers();
    const C = { user: 'nurse-7' };
    const cell = recorder('cell');
    const header = recorder('header');
    const floating = recorder('floating');
    const filter = recorder('filter');
    const footer = recorder('footer');
    const tooltip = recorder('tooltip');
    const f = filters({ floating: true });
    const t = make({
      context: C, pagination: { pageSize: 10 }, features: [slots(), f, pagination()],
      parts: { myCell: cell.part, header: header.part, 'floating.text': floating.part, 'filter.text': filter.part, 'footer.count': footer.part, tooltip: tooltip.part },
    }, [{ id: 'n', header: 'Number', type: 'number', ui: { cell: 'myCell' } }, { id: 's', header: 'Status', filter: { kind: 'text' }, tooltip: () => 'tip' }]);
    expect(f.openFilter('s')).toBe(true);
    const s = t.host.querySelector<HTMLElement>('.dzg-row [data-col="s"]')!;
    s.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    vi.advanceTimersByTime(2000);
    for (const [name, r] of Object.entries({ cell, header, floating, filter, footer, tooltip })) {
      expect(r.seen.mounts, name).toBeGreaterThan(0);
      expect(r.seen.contexts.every((c) => c === C), name).toBe(true);
    }
    // The application's context, beside the grid's own language context.
    expect(header.seen.last!.ctx.locale).toBe('en');
  });

  it('reaches the overlay part', () => {
    const overlay = recorder('overlay');
    const C = { a: 1 };
    make({ rows: [], context: C, features: [slots()], parts: { overlay: overlay.part } });
    expect(overlay.seen.contexts).toEqual([C]);
  });

  it('a new identity updates each part once; the same one updates nothing; mounts equal destroys', () => {
    const cell = recorder('cell');
    const header = recorder('header');
    const t = make({ context: { v: 1 }, features: [slots()], parts: { myCell: cell.part, header: header.part } });
    const cells = cell.seen.mounts;
    const heads = header.seen.mounts;
    expect(cells).toBeGreaterThan(0);
    expect(cell.seen.updates).toBe(0);
    const B = { v: 2 };
    t.g.update({ context: B });
    expect(cell.seen.updates).toBe(cells);
    expect(header.seen.updates).toBe(heads);
    expect(cell.seen.last!.context).toBe(B);
    t.g.update({ context: B });
    t.g.update({ density: 'compact' });
    expect(cell.seen.updates).toBe(cells);
    expect(header.seen.updates).toBe(heads);
    t.g.destroy();
    expect(cell.seen.destroys).toBe(cell.seen.mounts);
    expect(header.seen.destroys).toBe(header.seen.mounts);
  });

  it('a value changed in place is not seen (pass a new object)', () => {
    const cell = recorder('cell');
    const C = { v: 1 };
    const t = make({ context: C, parts: { myCell: cell.part } });
    C.v = 2;
    t.g.update({ context: C });
    t.g.api.refresh();
    expect(cell.seen.updates).toBe(0);
  });

  it('the tooltip callback gets it as its third argument', () => {
    vi.useFakeTimers();
    const seen: unknown[] = [];
    const C = { tz: 'x' };
    const t = make({ context: C }, [{ id: 'n', header: 'N', type: 'number', tooltip: (v, _row, c) => (seen.push(c), `v${v}`) }]);
    t.host.querySelector<HTMLElement>('.dzg-row [data-col="n"]')!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    vi.advanceTimersByTime(2000);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((c) => c === C)).toBe(true);
  });

  it('canExport gets it, read when the export runs', async () => {
    const seen: unknown[] = [];
    const t = xmake({ options: { canExport: (_r, c) => (seen.push(c), true) }, settings: { context: { a: 1 } } });
    const B = { a: 2 };
    t.g.update({ context: B });
    expect(await t.feature.run('displayed')).toBe('done');
    await flush();
    expect(seen).toEqual([B]);
  });

  it('exportAll gets it on server pages', async () => {
    const seen: unknown[] = [];
    const C = { b: 1 };
    const t = xmake({ mode: 'offset', options: { exportAll: async (_r, x) => { seen.push(x.context); } }, settings: { context: C } });
    t.answer(10, { total: 30 });
    await t.feature.run('all');
    await flush();
    expect(seen).toEqual([C]);
  });
});
