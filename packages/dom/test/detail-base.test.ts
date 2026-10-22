// The DOM base for variable row heights and the whole-row (detail) kind (Phase 4 step 9,
// docs/phase-4-steps/step09-plan.md, docs/behaviors/master-detail.md, D7, D8). A test feature stands for
// `@dzgrid/dom/detail` (step 10): the detail shape of the core and its sparse layout. Written before the code.
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
      g.layoutFor = (d, h) => {
        const r = d as unknown as DetailRows<unknown>;
        return sparseRowLayout(d, h, { at: r.details, heights: r.heights });
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
}

function dmake(o: DMake = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: o.block ?? 320, inline: o.inline ?? 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<T>[] = [];
  const g = createGrid<T>(host, {
    rows: o.rows ?? ROWS(50), getRowId: (r) => r.id, columns: COLUMNS, messages: EN,
    features: [detailFeature(o.detail, o.part)], onEvent: (e) => events.push(e), ...o.settings,
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

/** Frames by hand. */
function frames() {
  const q: FrameRequestCallback[] = [];
  return { raf: { requestAnimationFrame: (f: FrameRequestCallback) => q.push(f), cancelAnimationFrame: () => {} }, flush: () => { for (const f of q.splice(0)) f(0); } };
}

describe('the detail row: one cell over the whole row', () => {
  it('has one gridcell spanning the columns, named from the master, no cells, its height from the layout', () => {
    const t = dmake({ open: ['R1'] });
    const row = t.rowEl(x('R1'))!;
    expect(row.getAttribute('data-kind')).toBe('detail');
    expect(row.getAttribute('aria-rowindex')).toBe('4');
    expect(row.hasAttribute('aria-selected')).toBe(false);
    expect(row.querySelectorAll('.dzg-cell').length).toBe(0);
    const cells = row.querySelectorAll('.dzg-dcell');
    expect(cells.length).toBe(1);
    const c = cells[0] as HTMLElement;
    expect(c.getAttribute('role')).toBe('gridcell');
    expect(c.getAttribute('aria-colindex')).toBe('1');
    expect(c.getAttribute('aria-colspan')).toBe('3');
    expect(c.getAttribute('aria-label')).toBe('Row 1');
    expect(c.tabIndex).toBe(-1);
    expect(row.style.blockSize).toBe('240px');
    expect(row.style.insetBlockStart).toBe('64px');
    expect(t.rowEl(k('R2'))!.style.insetBlockStart).toBe(`${64 + 240}px`);
    // RowView.slot is that cell.
    expect((t.ctx.rowRenderer.mounted.get(x('R1')) as RowView).slot).toBe(c);
    expect((t.ctx.rowRenderer.mounted.get(k('R1')) as RowView).slot).toBeNull();
  });

  it('spans the selection box column too, and shows no box', () => {
    const t = dmake({ open: ['R1'], settings: { selection: { mode: 'multi', checkbox: true } } });
    const row = t.rowEl(x('R1'))!;
    expect(row.querySelector('.dzg-dcell')!.getAttribute('aria-colspan')).toBe('4');
    expect(row.querySelector('.dzg-check')).toBeNull();
    expect(row.hasAttribute('aria-selected')).toBe(false);
    expect(t.rowEl(k('R1'))!.getAttribute('aria-selected')).toBe('false');
  });

  it('is as wide as the view, never wider than the columns', () => {
    const narrow = dmake({ open: ['R1'] });
    expect(narrow.rowEl(x('R1'))!.querySelector<HTMLElement>('.dzg-dcell')!.style.inlineSize).toBe('360px');
    const wide = dmake({ open: ['R1'], inline: 300 });
    expect(wide.rowEl(x('R1'))!.querySelector<HTMLElement>('.dzg-dcell')!.style.inlineSize).toBe('300px');
  });

  it('a pooled row goes from detail to data and back with the right content', () => {
    const t = dmake({ open: ['R1', 'R3', 'R5'] });
    const check = () => {
      for (const r of t.host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')) {
        const key = t.ctx.rowRenderer.keyOf(r)!;
        if (String(key).startsWith('x:')) expect([r.querySelectorAll('.dzg-cell').length, r.querySelectorAll('.dzg-dcell').length, r.getAttribute('data-kind')]).toEqual([0, 1, 'detail']);
        else expect([r.querySelectorAll('.dzg-cell').length, r.querySelectorAll('.dzg-dcell').length, r.getAttribute('data-kind')]).toEqual([3, 0, null]);
      }
    };
    check();
    t.expand(['R1', 'R3', 'R5'], false);
    check();
    expect(t.host.querySelectorAll('.dzg-dcell').length).toBe(0);
    t.expand(['R0', 'R2']);
    check();
    t.scroll(2000);
    check();
    t.expand(['R30', 'R31', 'R32']);
    check();
  });

  it('a detail height set on the layout is written to its row at the next paint', () => {
    const t = dmake({ open: ['R1'] });
    (t.ctx.layout as SparseLayout).setHeights([[2 as never, 100]]);
    t.ctx.schedule();
    expect(t.rowEl(x('R1'))!.style.blockSize).toBe('100px');
    expect(t.rowEl(k('R2'))!.style.insetBlockStart).toBe(`${64 + 100}px`);
  });
});

describe('rowLayout: one layout for the rows shown', () => {
  it('is kept from paint to paint while the rows and the row height are the same', () => {
    const t = dmake({ open: ['R1'] });
    const L = t.ctx.layout;
    t.scroll(100);
    expect(t.ctx.layout).toBe(L);
    t.expand(['R2']);
    expect(t.ctx.layout).not.toBe(L);
  });

  it('ensureVisible right after a change, before its paint, uses the new rows’ layout', () => {
    const f = frames();
    const t = dmake({ raf: f.raf });
    f.flush();
    t.expand(['R1']);
    // Not painted yet: R9 is now at display index 10, below the 240 px detail.
    t.g.api.ensureVisible(k('R9'));
    expect(t.top()).toBe(10 * 32 + 208 + 32 - 320);
    // (The paint then anchors the rows opened in this frame, as it did before step 9.)
    f.flush();
    expect(t.ctx.layout!.total).toBe(51 * 32 + 208);
  });
});

describe('the anchor when heights change on the same rows', () => {
  it('keeps the top row where it is when a detail above the view grows', () => {
    const t = dmake({ open: ['R2'], rows: ROWS(200) });
    t.scroll(40 * 32 + 10);
    const key = t.topKey();
    const into = t.top() - t.ctx.layout!.offsetOf(t.d().indexOf(key) as never);
    (t.ctx.layout as SparseLayout).setHeights([[3 as never, 480]]);
    t.ctx.schedule();
    expect(t.topKey()).toBe(key);
    expect(t.top() - t.ctx.layout!.offsetOf(t.d().indexOf(key) as never)).toBe(into);
    expect(t.top()).toBe(40 * 32 + 10 + 240);
  });

  it('stays at the end when it was at the end', () => {
    const t = dmake({ open: ['R2'], rows: ROWS(200) });
    (t.g as unknown as { scroll: { scrollTo(l: number): void } }).scroll.scrollTo(1e9);
    expect(t.ctx.scroll.atEnd).toBe(true);
    (t.ctx.layout as SparseLayout).setHeights([[3 as never, 480]]);
    t.ctx.schedule();
    expect(t.top()).toBe(t.ctx.scroll.mapper!.maxLogical);
  });

  it('clamps the distance into a top detail that shrank below it', () => {
    const t = dmake({ open: ['R30'], rows: ROWS(200) });
    const at = t.d().indexOf(x('R30'));
    const off = t.ctx.layout!.offsetOf(at as never);
    t.scroll(off + 200);
    expect(t.topKey()).toBe(x('R30'));
    (t.ctx.layout as SparseLayout).setHeights([[at as never, 100]]);
    t.ctx.schedule();
    expect(t.top()).toBe(off + 100);
  });

  it('keeps the top row and the fraction into it when the row height changes (text zoom, density)', () => {
    const t = dmake({ open: ['R2', 'R5'], rows: ROWS(200) });
    t.scroll(40 * 32 + 16 + 2 * 208);
    const key = t.topKey();
    expect(key).toBe(k('R38'));
    t.g.update({ density: 'spacious' });
    expect(t.topKey()).toBe(key);
    // Half way into a 32 px row, then into a 40 px one.
    expect(t.top() - t.ctx.layout!.offsetOf(t.d().indexOf(key) as never)).toBe(20);
  });
});

describe('the wheel and the page keys over variable rows', () => {
  it('the wheel moves the logical offset exactly, scaled, with details open', () => {
    const t = dmake({ rows: ROWS(5000), open: ['R1', 'R100', 'R2000', 'R4999'], maxPhysical: 20_000 });
    expect(t.ctx.scroll.mapper!.scaled).toBe(true);
    t.scroll(0);
    for (let i = 0; i < 20; i++) t.vp.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    expect(t.top()).toBe(2000);
  });

  it('PageDown moves by the page’s distance, not its row count, and lands on a detail as one stop', () => {
    const t = dmake({ open: ['R1'] });
    t.g.api.focusCell(k('R0'), 'n');
    t.press('PageDown');
    // A page is 9 rows of 32 px (288 px): from R0 at 0, the row at 288 is R1's detail (64–304).
    expect(t.where()).toBe('xR1/*');
    t.press('PageDown');
    // From the detail at 64: 352 is R3 (336–368).
    expect(t.where()).toBe('R3/n');
    t.press('PageUp');
    // 336 − 288 = 48: R1.
    expect(t.where()).toBe('R1/n');
  });

  it('PageDown from the header goes a page down from above the first row, as with uniform rows (row page − 1)', () => {
    const t = dmake({ open: ['R20'] });
    t.g.api.focusCell(k('R0'), 'n');
    t.press('ArrowUp');
    expect(t.active().classList.contains('dzg-hcell')).toBe(true);
    t.press('PageDown');
    expect(t.where()).toBe('R8/n');
  });

  it('without a feature layout a page stays nine rows (uniform)', () => {
    const t = dmake();
    t.g.api.focusCell(k('R0'), 'n');
    t.press('PageDown');
    expect(t.where()).toBe('R9/n');
  });
});

describe('keys on the whole row', () => {
  it('Down reaches the detail as one stop, Down again the next row, the column kept', () => {
    const t = dmake({ open: ['R1'] });
    t.g.api.focusCell(k('R1'), 't');
    t.press('ArrowDown');
    expect(t.where()).toBe('xR1/*');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: x('R1'), column: 't' });
    t.press('ArrowDown');
    expect(t.where()).toBe('R2/t');
    t.press('ArrowUp');
    expect(t.where()).toBe('xR1/*');
    t.press('ArrowUp');
    expect(t.where()).toBe('R1/t');
  });

  it('Left, Right, Home and End stay on it (the key still taken)', () => {
    const t = dmake({ open: ['R1'] });
    t.g.api.focusCell(k('R1'), 'n');
    t.press('ArrowDown');
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      const e = t.press(key);
      expect(e.defaultPrevented).toBe(true);
      expect(t.where()).toBe('xR1/*');
      expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: x('R1'), column: 'n' });
    }
    t.press('ArrowDown');
    expect(t.where()).toBe('R2/n');
  });

  it('Ctrl+End reaches the last row, a detail, and Up its master (the last column, as Ctrl+End says)', () => {
    const t = dmake({ open: ['R49'] });
    t.g.api.focusCell(k('R0'), 'n');
    t.press('End', { ctrlKey: true });
    expect(t.where()).toBe('xR49/*');
    expect(t.top()).toBe(t.ctx.scroll.mapper!.maxLogical);
    t.press('ArrowUp');
    expect(t.where()).toBe('R49/t');
    t.press('ArrowUp', { ctrlKey: true });
    t.press('ArrowDown', { ctrlKey: true });
    expect(t.where()).toBe('xR49/*');
  });

  it('Enter and F2 hand the focus to the part, Escape inside comes back to the detail cell', () => {
    const log: string[] = [];
    const t = dmake({ open: ['R1'], part: testPart(log) });
    expect(log).toEqual(['mount R1']);
    t.g.api.focusCell(k('R1'), 'n');
    t.press('ArrowDown');
    const enter = t.press('Enter');
    expect(enter.defaultPrevented).toBe(true);
    expect(t.active().tagName).toBe('BUTTON');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: x('R1'), column: 'n' });
    // Keys inside belong to the content: the outer grid does not move.
    t.press('ArrowDown');
    expect(t.active().tagName).toBe('BUTTON');
    t.press('Escape');
    expect(t.where()).toBe('xR1/*');
    t.press('F2');
    expect(t.active().tagName).toBe('BUTTON');
  });

  it('without a part, Enter on the detail is the host’s', () => {
    const t = dmake({ open: ['R1'] });
    t.g.api.focusCell(k('R1'), 'n');
    t.press('ArrowDown');
    expect(t.press('Enter').defaultPrevented).toBe(false);
    expect(t.where()).toBe('xR1/*');
  });

  it('a focus put inside the detail’s content is the detail’s position', () => {
    const log: string[] = [];
    const t = dmake({ open: ['R1'], part: testPart(log) });
    t.rowEl(x('R1'))!.querySelector('button')!.focus();
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: x('R1'), column: 'name' });
  });
});

describe('not data', () => {
  it('Space selects nothing; a click focuses it, selects nothing, sends no click event', () => {
    const t = dmake({ open: ['R1'], settings: { selection: { mode: 'multi', click: true } } });
    t.g.api.focusCell(k('R1'), 'n');
    t.press('ArrowDown');
    t.press(' ');
    expect(t.g.kernel.selection).toEqual({ mode: 'include', keys: new Set() });
    t.g.api.focusCell(k('R5'), 'n');
    const cell = t.rowEl(x('R1'))!.querySelector<HTMLElement>('.dzg-dcell')!;
    cell.focus();
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: x('R1'), column: 'name' });
    expect(t.g.kernel.selection).toEqual({ mode: 'include', keys: new Set() });
    expect(t.events.filter((e) => e.type === 'rowClicked' || e.type === 'cellClicked')).toEqual([]);
  });
});

describe('the detail part slot', () => {
  it('the part is destroyed when its row leaves the window, and at the grid’s end', () => {
    const log: string[] = [];
    const t = dmake({ open: ['R1', 'R40'], rows: ROWS(100), part: testPart(log) });
    expect(log).toEqual(['mount R1']);
    t.scroll(30 * 32 + 240);
    expect(log).toEqual(['mount R1', 'destroy R1', 'mount R40']);
    expect(t.ctx.rowRenderer.pooledData().every((d) => d === undefined)).toBe(true);
    t.g.destroy();
    expect(log).toEqual(['mount R1', 'destroy R1', 'mount R40', 'destroy R40']);
  });

  it('the part is destroyed when its row leaves the window even if the row is not reused (fewer rows)', () => {
    const log: string[] = [];
    // Every row open, a tall view: many detail rows mounted; then a short view far below: most rows
    // go to the pool and stay there.
    const t = dmake({ rows: ROWS(100), detail: { initial: 'all' }, part: testPart(log), block: 2000 });
    expect(log.length).toBeGreaterThan(5);
    t.box.block = 64;
    t.scroll(60 * 272);
    const live = new Set(log.filter((l) => l.startsWith('mount')).map((l) => l.slice(6)));
    for (const l of log) if (l.startsWith('destroy')) live.delete(l.slice(8));
    const shown = [...(t.ctx.rowRenderer.mounted as ReadonlyMap<RowKey, RowView>).values()].filter((v) => v.part).length;
    expect(shown).toBeGreaterThan(0);
    expect(live.size).toBe(shown);
  });

  it('a part for the detail slot needs the detail feature', () => {
    const parts = { mine: definePart('detail', { mount: () => ({}) }) };
    expect(unslotted({ columns: [], parts } as unknown as GridSettings<unknown>, false)).toEqual([{ code: 'missing-feature', severity: 'warning', path: 'parts.mine', detail: 'detail' }]);
    expect(unslotted({ columns: [], parts, features: [{ id: 'detail', setup: () => ({ destroy() {} }) }] } as unknown as GridSettings<unknown>, false)).toEqual([]);
  });
});
