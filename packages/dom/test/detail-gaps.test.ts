// Step 9 review: targeted tests and the known bugs it found (fixed in the review) for variable heights and the detail row.
// (docs/behaviors/master-detail.md, D7, D8; helpers copied from detail-base.test.ts.)
// A test feature stands for `@dzgrid/dom/detail`: the core's detailShape and its sparse layout.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { dataKey, detailKey, type ColumnDef, type GridEvent, type RowKey, type RowShape } from '@dzgrid/core';
import { detailShape, sparseRowLayout, type DetailOptions, type DetailRows, type SparseLayout } from '@dzgrid/core/detail';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridSettings } from '../src/settings.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridFeature } from '../src/features.js';
import type { GridContext } from '../src/context.js';
import { definePart, unslotted, type PartHandle, type SlotContext, type SlotPart } from '../src/part.js';
import type { RowView } from '../src/render/rows.js';
import { EN } from '../src/locales/en.js';

type T = { id: string; name: string; n: number };
const ROWS = (n: number): T[] => Array.from({ length: n }, (_, i) => ({ id: `R${i}`, name: `Row ${i}`, n: i }));
const COLUMNS: ColumnDef<T, any>[] = [
  { id: 'name', header: 'Name', width: 160 },
  { id: 'n', header: 'N', type: 'number', width: 100 },
  { id: 't', header: 'T', value: (r: T) => `t${r.n}`, width: 100 },
];
const k = (id: string): RowKey => dataKey(id)!;
const x = (id: string): RowKey => detailKey(k(id));
const idOf = (key: RowKey | null | undefined): string | null => (key == null ? null : String(key).replace(/^x:/, 'x').replace(/d:\d+:/, ''));

/** What a test part does: mounted into the detail cell, a button inside, focus() on it. */
function testPart(log: string[], focusable = true): SlotPart<'detail'> {
  return definePart('detail', {
    mount(host, c) {
      const b = document.createElement('button');
      b.textContent = `in ${idOf(c.master)}`;
      host.append(b);
      log.push(`mount ${idOf(c.master)}`);
      return { destroy: () => void log.push(`destroy ${idOf(c.master)}`), ...(focusable && { focus: () => (b.focus(), true) }) };
    },
  });
}

/** The test feature: details through the core's shape, placed by its sparse layout; a part mounted as step 10 will. */
function detailFeature(o: DetailOptions<T> = {}, part?: SlotPart<'detail'>): GridFeature {
  return {
    id: 'detail',
    shape: () => detailShape<T>(o) as unknown as RowShape<unknown>,
    setup(g: GridContext<unknown>) {
      // A new row height over the same rows: the heights set on the old layout (measures) carried over.
      g.layoutFor = (d, h, was) => {
        const r = d as unknown as DetailRows<unknown>;
        return sparseRowLayout(d, h, { at: r.details, heights: was ? Array.from(r.details, (i) => was.heightOf(i as never)) : r.heights });
      };
      return {
        afterRows() {
          if (!part) return;
          for (const [key, v] of g.rowRenderer.mounted as ReadonlyMap<RowKey, RowView>) {
            if (!v.slot || v.part) continue;
            const node = g.rows.displayed.nodeAt(g.rows.displayed.index(g.rows.displayed.indexOf(key))!);
            if (node.kind !== 'detail') continue;
            v.part = part.part.mount(v.slot, { ...g.partBase!, row: node.data, key, master: node.master, height: 240 }) as PartHandle<SlotContext['detail']>;
          }
        },
        destroy() {},
      };
    },
  };
}

const grids: GridInstance<T, any>[] = [];
afterEach(() => {
  for (const g of grids.splice(0)) g.destroy();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

interface DMake {
  readonly rows?: T[];
  readonly detail?: DetailOptions<T>;
  readonly part?: SlotPart<'detail'>;
  readonly settings?: Partial<GridSettings<T>>;
  readonly block?: number;
  readonly inline?: number;
  readonly maxPhysical?: number;
  readonly raf?: Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'>;
  readonly open?: readonly string[];
  readonly bare?: boolean;
}

function dmake(o: DMake = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: o.block ?? 320, inline: o.inline ?? 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<T>[] = [];
  const g = createGrid<T>(host, {
    rows: o.rows ?? ROWS(50), getRowId: (r) => r.id, columns: COLUMNS, messages: EN,
    features: o.bare ? [] : [detailFeature(o.detail, o.part)], onEvent: (e) => events.push(e), ...o.settings,
  }, { geometry, ...(o.maxPhysical && { maxPhysical: o.maxPhysical }), ...(o.raf ? { raf: o.raf } : { sync: true }) });
  grids.push(g);
  const ctx = (g as unknown as { context: GridContext<T> }).context;
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const rowEl = (key: RowKey) => [...host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')].find((r) => ctx.rowRenderer.keyOf(r) === key) ?? null;
  const active = () => document.activeElement as HTMLElement;
  const where = () => {
    const a = active();
    const r = a.closest('.dzg-row');
    const key = r ? ctx.rowRenderer.keyOf(r) : null;
    return `${idOf(key)}/${a.classList.contains('dzg-dcell') ? '*' : a.dataset['col'] ?? null}`;
  };
  const press = (key: string, mods: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods });
    active().dispatchEvent(e);
    return e;
  };
  const expand = (ids: readonly string[], expanded = true) => g.kernel.dispatch({ type: 'rows.expand', rows: ids.map(k), expanded }, 'api');
  const scroll = (top: number) => { box.scrollTop = top; vp.dispatchEvent(new Event('scroll')); };
  const top = () => ctx.scroll.logicalTop;
  const d = () => g.kernel.rows.displayed;
  const topKey = () => d().keyAt(ctx.layout!.indexAt(top()));
  if (o.open) expand(o.open);
  return { g, ctx, host, vp, box, events, rowEl, active, where, press, expand, scroll, top, d, topKey };
}

describe('known bugs (found by the review, fixed)', () => {
  it('PageDown on a detail taller than a page moves on (it stays on the detail forever)', () => {
    // View 200 px: a page is 5 rows (160 px). The detail is 600 px: offsetOf + 160 is still inside it.
    const t = dmake({ open: ['R1'], block: 200, detail: { height: 600 } });
    t.g.api.focusCell(k('R1'), 'n');
    t.press('PageDown');
    expect(t.where()).toBe('xR1/*');
    t.press('PageDown');
    // At least one row further: R2 (or below), never the same stop again.
    expect(t.where()).not.toBe('xR1/*');
  });

  it('PageUp over a detail taller than a page: lands on it, then a page above its start (never stuck)', () => {
    // A guard, not a repro: a page up from a row's start always reaches an earlier row.
    const t = dmake({ open: ['R10'], block: 200, detail: { height: 600 } });
    t.g.api.focusCell(k('R11'), 'n');
    t.press('PageUp');
    expect(t.where()).toBe('xR10/*');
    t.press('PageUp');
    // 11 × 32 − 160 = 192: R6.
    expect(t.where()).toBe('R6/n');
  });

  it('a grid nested in a detail keeps its keys: the outer grid neither moves nor leaves', () => {
    // A real grid mounted into the detail cell (plain DOM), as a host's part would.
    const inner: GridInstance<T, any>[] = [];
    const nested = definePart('detail', {
      mount(host) {
        const box = { block: 200, inline: 400, scrollTop: 0, scrollInline: 0 };
        const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
        const g = createGrid<T>(host, { rows: ROWS(5), getRowId: (r) => r.id, columns: COLUMNS, messages: EN }, { geometry, sync: true });
        inner.push(g);
        return { destroy: () => g.destroy(), focus: () => (g.api.focusCell(k('R0'), 'n'), true) };
      },
    });
    const t = dmake({ open: ['R1'], part: nested });
    t.g.api.focusCell(k('R1'), 'n');
    t.press('ArrowDown');
    t.press('Enter');
    const g = inner[0]!;
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('R0'), column: 'n' });
    const top = t.top();
    // Down moves the inner grid only.
    t.press('ArrowDown');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('R1'), column: 'n' });
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: x('R1'), column: 'n' });
    expect(t.top()).toBe(top);
    // A key the inner grid leaves (Enter on a cell with no part, Escape on a cell) is not the outer grid's
    // either: Enter would hand the focus to the part again (its first cell), Escape leave it.
    for (const key of ['Enter', 'Escape']) {
      const e = t.press(key);
      expect(e.defaultPrevented).toBe(false);
      expect(t.active().closest('.dzg')).not.toBe(t.host.querySelector('.dzg'));
      expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('R1'), column: 'n' });
    }
    // PageDown, End: the inner grid's.
    t.press('End', { ctrlKey: true });
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('R4'), column: 't' });
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: x('R1'), column: 'n' });
    g.destroy();
  });

  it('ensureVisible on a row taller than the view shows its top (its name and the panel’s start)', () => {
    const t = dmake({ open: ['R1'], detail: { height: 600 } });
    const off = t.ctx.layout!.offsetOf(2 as never);
    t.g.api.ensureVisible(x('R1'));
    expect(t.top()).toBe(off);
    // From below it too.
    t.scroll(off + 1000);
    t.g.api.ensureVisible(x('R1'));
    expect(t.top()).toBe(off);
  });

  it('Left, Right, Home and End on a detail scrolled away bring it back into view', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      const t = dmake({ open: ['R1'], rows: ROWS(200) });
      t.g.api.focusCell(k('R1'), 'n');
      t.press('ArrowDown');
      expect(t.where()).toBe('xR1/*');
      t.scroll(3000);
      const e = t.press(key);
      expect(e.defaultPrevented).toBe(true);
      expect(t.top()).toBe(t.ctx.layout!.offsetOf(2 as never));
      expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: x('R1'), column: 'n' });
      expect(t.where()).toBe('xR1/*');
    }
  });

  it('the top row is kept when heights above the view change but the total does not (one grows, one below shrinks)', () => {
    const t = dmake({ open: ['R2', 'R100'], rows: ROWS(200) });
    t.scroll(40 * 32 + 10 + 208);
    const key = t.topKey();
    expect(key).toBe(k('R39'));
    // +100 above the view, −100 below it: the total is the same, so `relaid` stays false.
    (t.ctx.layout as SparseLayout).setHeights([[3 as never, 340], [t.d().indexOf(x('R100')) as never, 140]]);
    t.ctx.schedule();
    expect(t.topKey()).toBe(key);
  });

  it('a measured detail height survives a density change (the rows are not rebuilt, the layout is)', () => {
    // As step 10's 'auto' will: the measure in `sizes` and on the current layout (setHeights).
    const sizes = new Map<RowKey, number>();
    const t = dmake({ open: ['R1'], detail: { sizes } });
    sizes.set(k('R1'), 100);
    (t.ctx.layout as SparseLayout).setHeights([[2 as never, 100]]);
    t.ctx.schedule();
    expect(t.rowEl(x('R1'))!.style.blockSize).toBe('100px');
    t.g.update({ density: 'compact' });
    // rowLayout rebuilt from `rows.heights` of the last build (240): the measure is lost until a resize
    // observer fires again, which it does not (the panel's content did not change).
    expect(t.rowEl(x('R1'))!.style.blockSize).toBe('100px');
  });
});

describe('gaps the commit’s tests leave open', () => {
  it('a detail taller than the view: Down from its master scrolls it into view, focus on it', () => {
    const t = dmake({ open: ['R1'], detail: { height: 600 } });
    t.g.api.focusCell(k('R1'), 'n');
    t.press('ArrowDown');
    expect(t.where()).toBe('xR1/*');
    const off = t.ctx.layout!.offsetOf(2 as never);
    // Its top aligned with the view's (master-detail.md: a row taller than the view shows its start).
    expect(t.top()).toBe(off);
  });

  it('closing a master while the focus is inside its part: the part is destroyed, the focus goes to the master and is held', () => {
    const log: string[] = [];
    const t = dmake({ open: ['R1'], part: testPart(log) });
    t.g.api.focusCell(k('R1'), 'n');
    t.press('ArrowDown');
    t.press('Enter');
    expect(t.active().tagName).toBe('BUTTON');
    t.expand(['R1'], false);
    expect(log).toEqual(['mount R1', 'destroy R1']);
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: k('R1'), column: 'n' });
    expect(t.where()).toBe('R1/n');
  });

  it('the top detail closed while the view is inside it: its master at the top', () => {
    const t = dmake({ open: ['R30'], rows: ROWS(200) });
    const at = t.d().indexOf(x('R30'));
    t.scroll(t.ctx.layout!.offsetOf(at as never) + 100);
    expect(t.topKey()).toBe(x('R30'));
    t.expand(['R30'], false);
    expect(t.topKey()).toBe(k('R30'));
    expect(t.top()).toBe(30 * 32);
  });

  it('Ctrl+A selects the data rows only', () => {
    const t = dmake({ open: ['R1', 'R3'], settings: { selection: { mode: 'multi' } } });
    t.g.api.focusCell(k('R0'), 'n');
    t.press('a', { ctrlKey: true });
    const keys = [...(t.g.kernel.selection as unknown as { keys: Set<RowKey> }).keys];
    expect(keys.length).toBe(50);
    expect(keys.some((key) => key.startsWith('x:'))).toBe(false);
  });

  it('the detail cell follows the columns: hidden and pinned columns, a new view width', () => {
    const cols: ColumnDef<T, any>[] = [
      { id: 'name', header: 'Name', width: 160, pinned: 'start' },
      { id: 'n', header: 'N', type: 'number', width: 100, hidden: true } as ColumnDef<T, any>,
      { id: 't', header: 'T', value: (r: T) => `t${r.n}`, width: 100, pinned: 'end' },
    ];
    const t = dmake({ open: ['R1'], settings: { columns: cols } });
    const c = () => t.rowEl(x('R1'))!.querySelector<HTMLElement>('.dzg-dcell')!;
    expect(c().getAttribute('aria-colspan')).toBe('2');
    expect(c().style.inlineSize).toBe('260px');
    t.box.inline = 200;
    t.ctx.schedule();
    expect(c().style.inlineSize).toBe('200px');
    t.g.update({ columns: COLUMNS });
    expect(c().getAttribute('aria-colspan')).toBe('3');
    expect(c().style.inlineSize).toBe('200px');
  });

  it('the name follows the master: renamed by a transaction, and when the first column changes', () => {
    const t = dmake({ open: ['R1'] });
    const c = () => t.rowEl(x('R1'))!.querySelector<HTMLElement>('.dzg-dcell')!;
    t.g.kernel.rows.applyTransaction({ update: [{ id: 'R1', name: 'Renamed', n: 1 }] } as never);
    expect(c().getAttribute('aria-label')).toBe('Renamed');
    t.g.update({ columns: [COLUMNS[2]!, COLUMNS[0]!, COLUMNS[1]!] });
    expect(c().getAttribute('aria-label')).toBe('t1');
  });

  it('a pooled detail row reused by another master gets the other master’s name and a new part', () => {
    const log: string[] = [];
    const t = dmake({ open: ['R1'], rows: ROWS(200), part: testPart(log) });
    t.expand(['R1'], false);
    t.expand(['R2']);
    expect(t.rowEl(x('R2'))!.querySelector('.dzg-dcell')!.getAttribute('aria-label')).toBe('Row 2');
    expect(t.rowEl(x('R2'))!.querySelectorAll('button').length).toBe(1);
    expect(log).toEqual(['mount R1', 'destroy R1', 'mount R2']);
  });

  it('PageUp/PageDown with variable rows in scaled mode land where the distance says', () => {
    const t = dmake({ rows: ROWS(5000), open: ['R1', 'R2', 'R3'], maxPhysical: 20_000 });
    expect(t.ctx.scroll.mapper!.scaled).toBe(true);
    t.g.api.focusCell(k('R4'), 'n');
    const L = t.ctx.layout!;
    const i = t.d().indexOf(k('R4'));
    t.press('PageUp');
    expect(t.d().indexOf(t.g.kernel.focus!.kind === 'cell' ? (t.g.kernel.focus as { row: RowKey }).row : k('R0'))).toBe(L.indexAt(L.offsetOf(i as never) - 288));
    t.press('PageDown');
    t.press('PageDown');
    const f = (t.g.kernel.focus as { row: RowKey }).row;
    const fi = t.d().indexOf(f);
    expect(fi).toBeGreaterThan(i);
  });

  it('with the selection box column, the detail cell is as wide as the columns and the box (view wider)', () => {
    const t = dmake({ open: ['R1'], inline: 900, settings: { selection: { mode: 'multi', checkbox: true } } });
    const row = t.rowEl(x('R1'))!;
    expect(row.style.inlineSize).toBe(`${360 + 40}px`);
    expect(row.querySelector<HTMLElement>('.dzg-dcell')!.style.inlineSize).toBe(`${360 + 40}px`);
  });

  it('a filter that changes the total is not anchored as a transaction is: the scroll offset stays', () => {
    const t = dmake({ open: ['R2', 'R150'], rows: ROWS(400) });
    // R100 at the top (it stays shown by the filter), 12 px into it.
    t.scroll(101 * 32 + 208 + 12);
    expect(t.topKey()).toBe(k('R100'));
    const before = t.top();
    const bare = dmake({ bare: true, rows: ROWS(400) });
    bare.scroll(before);
    for (const g of [t, bare]) g.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: '1' } } as never, 'user');
    // As without details: the same logical offset (clamped to the new end).
    expect(t.top()).toBe(Math.min(before, t.ctx.scroll.mapper!.maxLogical));
    expect(bare.top()).toBe(Math.min(before, bare.ctx.scroll.mapper!.maxLogical));
  });

  it('rowAt never runs on uniform rows: a grid without the feature pages by count', () => {
    const t = dmake({ bare: true });
    t.g.api.focusCell(k('R0'), 'n');
    t.press('PageDown');
    expect(t.where()).toBe('R9/n');
  });
});

/** Frames by hand. */
function frames() {
  const q: FrameRequestCallback[] = [];
  return { raf: { requestAnimationFrame: (f: FrameRequestCallback) => q.push(f), cancelAnimationFrame: () => {} }, flush: () => { for (const f of q.splice(0)) f(0); } };
}
