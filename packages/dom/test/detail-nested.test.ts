// `nestedGrid()`, a grid in a detail panel (Phase 4 step 10, docs/phase-4-steps/step10-plan.md points
// 10–11, docs/behaviors/master-detail.md, owner Q5). Written before the code.
import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, detailKey, type ColumnDef, type GridEvent, type Problem, type RowKey } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridContext, GridEnv } from '../src/context.js';
import { detail, nestedGrid, type NestedContext } from '../src/detail.js';
import { EN } from '../src/locales/en.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';

type P = { id: string; name: string };
type V = { id: string; date: string; n: number };
const PATIENTS = (n: number): P[] => Array.from({ length: n }, (_, i) => ({ id: `P${i}`, name: `Patient ${i}` }));
const VISITS = (p: string, n = 50): V[] => Array.from({ length: n }, (_, i) => ({ id: `${p}-V${i}`, date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, n: (i * 7) % 50 }));
const PCOLS: ColumnDef<P, any>[] = [{ id: 'name', header: 'Name', width: 200 }];
const VCOLS: ColumnDef<V, any>[] = [{ id: 'date', header: 'Date', width: 120 }, { id: 'n', header: 'N', type: 'number', width: 80 }];
const MSG = { ...EN, text: { ...EN.text, ...EN_DETAIL.text } };
const k = (id: string): RowKey => dataKey(id)!;
const x = (id: string): RowKey => detailKey(k(id));
const problemsOf = (events: readonly GridEvent<unknown>[]): Problem[] => events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: Problem[] }).problems);

function geometryOf(block: number, inline = 500): { box: ViewportBox & { scrollTop: number }; geometry: Geometry } {
  const box = { block, inline, scrollTop: 0, scrollInline: 0 };
  return { box, geometry: { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } } };
}

const grids: GridInstance<any, any>[] = [];
afterEach(() => {
  for (const g of grids.splice(0)) g.destroy();
  document.body.innerHTML = '';
});

interface Inner {
  readonly grid: GridInstance<V, any>;
  readonly c: NestedContext;
  readonly box: { scrollTop: number };
  readonly events: GridEvent<V>[];
  readonly alive: () => boolean;
}

/** An outer grid of patients, each detail a grid of visits (`nestedGrid`); `inner` the grids made, the last one per patient. */
function make(o: { keep?: number; nested?: number; rows?: number; maxPhysical?: number; deeper?: boolean; throwOnGrid?: boolean } = {}) {
  const made: Inner[] = [];
  const innerOf = (id: string) => [...made].reverse().find((m) => m.c.master === k(id))!;
  const part = (level: number): ReturnType<typeof nestedGrid> => nestedGrid<V>({
    ...(o.keep !== undefined && { keep: o.keep }),
    env: (): GridEnv => {
      const g = geometryOf(200);
      boxes.push(g.box);
      return { geometry: g.geometry, sync: true };
    },
    settings: (c) => {
      const events: GridEvent<V>[] = [];
      events.length = 0;
      pending = { c, events };
      return {
        rows: VISITS((c.row as P).id), getRowId: (r) => r.id, columns: VCOLS, messages: MSG, label: `Visits of ${(c.row as P).name}`, onEvent: (e) => events.push(e),
        // Two levels down: each visit opens its own grid (the deeper test).
        ...(o.deeper && level === 1 && { features: [detail<V>({ part: part(2) })] }),
      };
    },
    onGrid: (grid, c) => {
      if (o.throwOnGrid) {
        // Judged by destroy() (the feature empties the box anyway, the DOM says nothing of listeners left).
        let on = true;
        const was = grid.destroy;
        grid.destroy = () => ((on = false), was.call(grid));
        made.push({ grid: grid as GridInstance<V, any>, c, box: boxes.at(-1)!, events: [], alive: () => on });
        throw new Error('host callback failed');
      }
      const box = boxes.at(-1)!;
      let alive = true;
      const was = grid.destroy;
      grid.destroy = () => ((alive = false), was.call(grid));
      made.push({ grid: grid as GridInstance<V, any>, c, box, events: pending!.c === c ? pending!.events : [], alive: () => alive });
    },
  });
  let pending: { c: NestedContext; events: GridEvent<V>[] } | null = null;
  const boxes: { scrollTop: number }[] = [];
  const { box, geometry } = geometryOf(400, 600);
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<P>[] = [];
  const g = createGrid<P>(host, {
    rows: PATIENTS(o.rows ?? 30), getRowId: (r) => r.id, columns: PCOLS, messages: MSG, onEvent: (e) => events.push(e),
    features: [detail<P>({ part: part(1), ...(o.nested !== undefined && { nested: o.nested }) })],
  }, { geometry, sync: true, ...(o.maxPhysical && { maxPhysical: o.maxPhysical }) });
  grids.push(g);
  const ctx = (g as unknown as { context: GridContext<P> }).context;
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const active = () => document.activeElement as HTMLElement;
  const press = (key: string, mods: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods });
    active().dispatchEvent(e);
    return e;
  };
  const expand = (ids: readonly string[], expanded = true) => g.kernel.dispatch({ type: 'rows.expand', rows: ids.map(k), expanded }, 'api');
  const scroll = (top: number) => { box.scrollTop = top; vp.dispatchEvent(new Event('scroll')); };
  const rootOf = (el: Element) => el.closest('.dzg');
  return { g, ctx, host, vp, box, events, made, innerOf, active, press, expand, scroll, rootOf };
}

const innerCtx = (m: Inner) => (m.grid as unknown as { context: GridContext<V> }).context;
const innerScroll = (m: Inner, top: number) => {
  m.box.scrollTop = top;
  innerCtx(m).el.viewport.dispatchEvent(new Event('scroll'));
};

describe('nestedGrid(): a grid of its own in the panel', () => {
  it('makes one grid per shown panel, named by the host, destroyed with the panel and with the outer grid', () => {
    const t = make();
    t.expand(['P1', 'P2']);
    expect(t.made.length).toBe(2);
    const inner = t.innerOf('P1');
    expect(inner.c.row).toEqual(PATIENTS(30)[1]);
    expect(innerCtx(inner).el.viewport.getAttribute('aria-label')).toBe('Visits of Patient 1');
    expect(t.rootOf(innerCtx(inner).el.viewport)!.parentElement!.classList.contains('dzg-dbody')).toBe(true);
    t.expand(['P1'], false);
    expect(inner.alive()).toBe(false);
    t.g.destroy();
    expect(t.innerOf('P2').alive()).toBe(false);
  });

  it('Enter and F2 on the panel focus the inner grid (its focus, else its first cell)', () => {
    const t = make();
    t.expand(['P1']);
    t.g.api.focusCell(k('P1'), 'name');
    t.press('ArrowDown');
    t.press('Enter');
    const inner = t.innerOf('P1');
    expect(inner.grid.kernel.focus).toEqual({ kind: 'cell', row: k('P1-V0'), column: 'date' });
    expect(t.rootOf(t.active())).toBe(innerCtx(inner).el.root);
    t.press('ArrowDown');
    t.press('Escape');
    t.press('F2');
    expect(inner.grid.kernel.focus).toEqual({ kind: 'cell', row: k('P1-V1'), column: 'date' });
    expect(t.rootOf(t.active())).toBe(innerCtx(inner).el.root);
  });

  it('keys inside move the inner grid only: the outer focus and scroll stay', () => {
    const t = make({ rows: 300 });
    t.expand(['P1']);
    t.g.api.focusCell(k('P1'), 'name');
    t.press('ArrowDown');
    t.press('Enter');
    const top = t.ctx.scroll.logicalTop;
    for (const key of ['ArrowDown', 'ArrowDown', 'PageDown', 'End', 'Home']) t.press(key);
    t.press('End', { ctrlKey: true });
    expect(t.innerOf('P1').grid.kernel.focus).toEqual({ kind: 'cell', row: k('P1-V49'), column: 'n' });
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: x('P1'), column: 'name' });
    expect(t.ctx.scroll.logicalTop).toBe(top);
  });

  it('Escape in the inner grid goes back to the panel’s cell, once; Down then goes on', () => {
    const t = make();
    t.expand(['P1']);
    t.g.api.focusCell(k('P1'), 'name');
    t.press('ArrowDown');
    t.press('Enter');
    const e = t.press('Escape');
    expect(e.defaultPrevented).toBe(true);
    expect(t.active().classList.contains('dzg-dcell')).toBe(true);
    expect(t.rootOf(t.active())).toBe(t.ctx.el.root);
    t.press('ArrowDown');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: k('P2'), column: 'name' });
    // An Escape the inner grid took itself (a popup, a widget of its own): it stays there.
    t.g.api.focusCell(k('P1'), 'name');
    t.press('ArrowDown');
    t.press('Enter');
    const inner = innerCtx(t.innerOf('P1')).el.root;
    inner.addEventListener('keydown', (e) => e.preventDefault(), { once: true });
    t.press('Escape');
    expect(t.rootOf(t.active())).toBe(inner);
  });

  it('two levels down: Escape goes up one level only; depths 2 and 3, no problem', () => {
    const t = make({ deeper: true });
    t.expand(['P1']);
    const mid = t.innerOf('P1');
    expect(mid.c.depth).toBe(2);
    mid.grid.kernel.dispatch({ type: 'rows.expand', rows: [k('P1-V0')], expanded: true }, 'api');
    const deep = t.made.find((m) => m.c.master === k('P1-V0'))!;
    expect(deep.c.depth).toBe(3);
    t.g.api.focusCell(k('P1'), 'name');
    t.press('ArrowDown');
    t.press('Enter');
    t.press('ArrowDown');
    t.press('Enter');
    expect(t.rootOf(t.active())).toBe(innerCtx(deep).el.root);
    t.press('Escape');
    // Back on the middle grid's panel cell, not the outer one's.
    expect(t.active().classList.contains('dzg-dcell')).toBe(true);
    expect(t.rootOf(t.active())).toBe(innerCtx(mid).el.root);
    t.press('Escape');
    expect(t.rootOf(t.active())).toBe(t.ctx.el.root);
    expect(t.active().classList.contains('dzg-dcell')).toBe(true);
    expect([...problemsOf(mid.events), ...problemsOf(deep.events), ...problemsOf(t.events as never)].filter((p) => p.path === 'detail.depth')).toEqual([]);
    // The inner grids' events are captured (the empty list above is not for want of them).
    for (const m of [mid, deep]) {
      m.grid.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
      expect(m.events.some((e) => e.type === 'sortChanged')).toBe(true);
    }
  });

  it('a chevron in a nested grid opens its own row, never the outer grid’s', () => {
    const t = make({ deeper: true });
    t.expand(['P1']);
    const mid = t.innerOf('P1');
    const toggle = innerCtx(mid).el.layer.querySelector('.dzg-row .dzg-toggle')!;
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(mid.grid.kernel.expansion.size).toBe(1);
    expect([...t.g.kernel.expansion]).toEqual([k('P1')]);
  });

  it('past 3 levels the grid made tells it (soft cap, Q5), and still works', () => {
    const t = make({ nested: 3 });
    t.expand(['P1']);
    const inner = t.innerOf('P1');
    expect(inner.c.depth).toBe(4);
    expect(problemsOf(inner.events)).toContainEqual(expect.objectContaining({ code: 'unsupported-combination', severity: 'warning', path: 'detail.depth', detail: '4' }));
    expect(inner.grid.kernel.rows.displayed.count).toBe(50);
  });
});

describe('nestedGrid(): the review of step 10', () => {
  it('a host callback that throws after the grid is made: the grid is destroyed, the error reported', () => {
    const w = window as unknown as { reportError?: (e: unknown) => void };
    const errors: unknown[] = [];
    const was = w.reportError;
    w.reportError = (e) => void errors.push(e);
    try {
      const t = make({ throwOnGrid: true });
      t.expand(['P1']);
      expect(errors.length).toBe(1);
      expect(t.made[0]!.alive()).toBe(false);
      expect(t.host.querySelectorAll('.dzg-dbody .dzg').length).toBe(0);
    } finally {
      w.reportError = was;
    }
  });

  it('Escape cancelling a composition, or hiding the inner grid’s tooltip, stays in the inner grid', () => {
    const t = make();
    t.expand(['P1']);
    t.g.api.focusCell(k('P1'), 'name');
    t.press('ArrowDown');
    t.press('Enter');
    const inner = innerCtx(t.innerOf('P1'));
    expect(t.press('Escape', { isComposing: true }).defaultPrevented).toBe(false);
    expect(t.rootOf(t.active())).toBe(inner.el.root);
    inner.el.tooltip.hidden = false;
    t.press('Escape');
    expect(t.rootOf(t.active())).toBe(inner.el.root);
    t.press('Escape');
    expect(t.rootOf(t.active())).toBe(t.ctx.el.root);
  });

  it('a new master row (new data): the same grid, updated in place from the settings, its sort kept', () => {
    const t = make();
    t.expand(['P1']);
    const a = t.innerOf('P1');
    a.grid.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    t.g.kernel.rows.applyTransaction({ update: [{ id: 'P1', name: 'Patient One' }] });
    expect(t.innerOf('P1')).toBe(a);
    expect(a.alive()).toBe(true);
    expect(innerCtx(a).el.viewport.getAttribute('aria-label')).toBe('Visits of Patient One');
    expect(a.grid.kernel.query.sort).toEqual([{ column: 'n', dir: 'asc' }]);
    // A paint that changes nothing for it: the same grid.
    t.g.api.refresh();
    expect(t.innerOf('P1')).toBe(a);
  });

  it('the outer grid shows no tooltip of its own for an inner grid’s header (same column id)', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const { geometry } = geometryOf(400, 600);
    const inner = nestedGrid<P>({ env: () => ({ geometry: geometryOf(200).geometry, sync: true }), settings: () => ({ rows: PATIENTS(3), getRowId: (r) => r.id, columns: PCOLS, messages: MSG }) });
    const g = createGrid<P>(host, { rows: PATIENTS(5), getRowId: (r) => r.id, columns: [{ id: 'name', header: 'Name', width: 200, headerTooltip: 'Outer tip' }], messages: MSG, features: [detail<P>({ part: inner })] }, { geometry, sync: true });
    grids.push(g);
    g.kernel.dispatch({ type: 'rows.expand', rows: [k('P1')], expanded: true }, 'api');
    const ctx = (g as unknown as { context: GridContext<P> }).context;
    const h = host.querySelector<HTMLElement>('.dzg-dbody .dzg-hcell[data-col="name"]')!;
    ctx.keyboardAt = ctx.now();
    h.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(ctx.el.tooltip.hidden).toBe(true);
    // The outer header itself still shows it.
    ctx.keyboardAt = ctx.now();
    host.querySelector<HTMLElement>(':scope > .dzg > .dzg-viewport > .dzg-header .dzg-hcell[data-col="name"]')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(ctx.el.tooltip.hidden).toBe(false);
  });
});

describe('nestedGrid(): its memory of each master (LRU)', () => {
  it('a reopened panel comes back with its sort, filter and scroll', () => {
    const t = make();
    t.expand(['P1']);
    const a = t.innerOf('P1');
    a.grid.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    innerScroll(a, 300);
    expect(innerCtx(a).scroll.logicalTop).toBe(300);
    const query = a.grid.kernel.query;
    t.expand(['P1'], false);
    t.expand(['P1']);
    const b = t.innerOf('P1');
    expect(b).not.toBe(a);
    expect(b.grid.kernel.query.sort).toEqual(query.sort);
    expect(innerCtx(b).scroll.logicalTop).toBe(300);
  });

  it('a panel scrolled out of the outer window and back is restored too', () => {
    const t = make({ rows: 300 });
    t.expand(['P1']);
    t.innerOf('P1').grid.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    t.scroll(5000);
    expect(t.innerOf('P1').alive()).toBe(false);
    t.scroll(0);
    expect(t.innerOf('P1').alive()).toBe(true);
    expect(t.innerOf('P1').grid.kernel.query.sort).toEqual([{ column: 'n', dir: 'asc' }]);
  });

  it('keeps the last `keep` masters (default 20): the least recently used goes first', () => {
    const t = make({ keep: 2 });
    for (const id of ['P1', 'P2', 'P3']) {
      t.expand([id]);
      t.innerOf(id).grid.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
      t.expand([id], false);
    }
    // Reopened and closed, a master is the most recent again: P3, P2 kept; P1 forgotten.
    for (const [id, sorted] of [['P3', true], ['P2', true], ['P1', false]] as const) {
      t.expand([id]);
      expect(t.innerOf(id).grid.kernel.query.sort.length > 0, id).toBe(sorted);
      t.expand([id], false);
    }
    // P2, reopened after P3, is more recent than it: P1's save forgot P3.
    t.expand(['P2']);
    expect(t.innerOf('P2').grid.kernel.query.sort.length).toBe(1);
    t.expand(['P2'], false);
    t.expand(['P3']);
    expect(t.innerOf('P3').grid.kernel.query.sort.length).toBe(0);
    // Default 20: 21 masters, the first forgotten, the second kept.
    const u = make();
    for (let i = 0; i < 21; i++) {
      u.expand([`P${i}`]);
      u.g.api.ensureVisible(x(`P${i}`));
      u.innerOf(`P${i}`).grid.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
      u.expand([`P${i}`], false);
    }
    u.expand(['P1']);
    u.g.api.ensureVisible(x('P1'));
    expect(u.innerOf('P1').grid.kernel.query.sort.length).toBe(1);
    u.expand(['P0']);
    u.g.api.ensureVisible(x('P0'));
    expect(u.innerOf('P0').grid.kernel.query.sort.length).toBe(0);
  });
});

describe('nestedGrid(): the wheel', () => {
  /** The inner grid's scroller made scrollable (jsdom has no layout): 1 600 px of rows in 200. */
  const scrollable = (m: Inner, top: number) => {
    const vp = innerCtx(m).el.viewport;
    vp.style.overflowY = 'auto';
    Object.defineProperty(vp, 'scrollHeight', { configurable: true, value: 1600 });
    Object.defineProperty(vp, 'clientHeight', { configurable: true, value: 200 });
    Object.defineProperty(vp, 'scrollTop', { configurable: true, writable: true, value: top });
    Object.defineProperty(vp, 'scrollLeft', { configurable: true, writable: true, value: 0 });
    return vp;
  };
  const wheel = (el: Element, deltaY: number) => {
    const e = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e;
  };

  it('scaled outer grid: the inner grid scrolls first, the outer one at the inner edge', () => {
    const t = make({ rows: 3000, maxPhysical: 20_000 });
    t.expand(['P1']);
    const inner = t.innerOf('P1');
    const target = innerCtx(inner).el.layer;
    const vp = scrollable(inner, 0);
    const top = t.ctx.scroll.logicalTop;
    // Down with room below: the browser's, for the inner scroller; the outer grid does not move.
    expect(wheel(target, 100).defaultPrevented).toBe(false);
    expect(t.ctx.scroll.logicalTop).toBe(top);
    // At the inner bottom: the outer grid takes it.
    vp.scrollTop = 1400;
    expect(wheel(target, 100).defaultPrevented).toBe(true);
    expect(t.ctx.scroll.logicalTop).toBe(top + 100);
    // Up with room above: the inner one's again.
    expect(wheel(target, -100).defaultPrevented).toBe(false);
    expect(t.ctx.scroll.logicalTop).toBe(top + 100);
    // At the inner top, up: the outer one's.
    vp.scrollTop = 0;
    expect(wheel(target, -100).defaultPrevented).toBe(true);
    expect(t.ctx.scroll.logicalTop).toBe(top);
    // Shift + wheel (Firefox gives it as deltaY): sideways, the panel's, at the inner edge too.
    vp.scrollTop = 1400;
    const shifted = new WheelEvent('wheel', { deltaY: 100, shiftKey: true, bubbles: true, cancelable: true });
    target.dispatchEvent(shifted);
    expect([shifted.defaultPrevented, t.ctx.scroll.logicalTop]).toEqual([false, top]);
    vp.scrollTop = 0;
    // A wheel something inside already took (an inner grid above its own cap): never the outer grid's too.
    // Sideways (Shift + wheel): always the panel's, the outer grid not moved.
    vp.style.overflowX = 'auto';
    Object.defineProperty(vp, 'scrollWidth', { configurable: true, value: 900 });
    Object.defineProperty(vp, 'clientWidth', { configurable: true, value: 400 });
    vp.scrollLeft = 0;
    const side = new WheelEvent('wheel', { deltaX: 100, bubbles: true, cancelable: true });
    target.dispatchEvent(side);
    expect(side.defaultPrevented).toBe(false);
    expect(t.ctx.scroll.logicalTop).toBe(top);
    vp.scrollTop = 1400;
    target.addEventListener('wheel', (e) => e.preventDefault(), { once: true });
    expect(wheel(target, 100).defaultPrevented).toBe(true);
    expect(t.ctx.scroll.logicalTop).toBe(top);
  });
});
