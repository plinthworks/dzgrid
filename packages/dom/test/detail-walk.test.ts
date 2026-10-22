// Step 9 coverage gaps (review): a DOM random walk over details and variable heights, uniform twins, repros.
// (docs/behaviors/master-detail.md, D7, D8; helpers copied from detail-base.test.ts: a test feature over
// the core's detailShape and sparseRowLayout, as `@dzgrid/dom/detail` will be.)
import { describe, it, expect, afterEach, vi } from 'vitest';
import { dataKey, detailKey, REBASE, type ColumnDef, type GridEvent, type RowKey, type RowShape } from '@dzgrid/core';
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
  /** No detail feature at all (the uniform twin). */
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


const rng = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const WIDE: ColumnDef<T, any>[] = [
  { id: 'name', header: 'Name', width: 120, pinned: 'start' },
  { id: 'n', header: 'N', type: 'number', width: 90 },
  ...Array.from({ length: 6 }, (_, c) => ({ id: `c${c}`, header: `C${c}`, value: (r: T) => `${c}:${r.n}`, width: 110 })),
  { id: 'end', header: 'End', width: 80, pinned: 'end', value: (r: T) => r.id },
];
const px = (v: string) => Number.parseFloat(v);
type Made = ReturnType<typeof dmake>;

/** Everything a paint must hold with variable heights and details (the walk's oracle). */
function invariants(t: Made, check: boolean, cols: number, step: string): void {
  const L = t.ctx.layout!;
  const d = t.d();
  const lt = t.top();
  const base = Math.floor(lt / REBASE) * REBASE;
  expect(L.count, `${step}: layout of the rows shown`).toBe(d.count);
  for (const r of t.host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')) {
    const key = t.ctx.rowRenderer.keyOf(r)!;
    const i = d.indexOf(key);
    expect(i, `${step}: mounted ${key} is displayed`).not.toBe(-1);
    const want = Math.max(-2 * REBASE, Math.min(2 * REBASE, L.offsetOf(i as never) - base));
    expect(px(r.style.insetBlockStart), `${step}: top of ${key}`).toBe(want);
    expect(px(r.style.blockSize), `${step}: height of ${key}`).toBe(L.heightOf(i as never));
    const dc = r.querySelectorAll<HTMLElement>('.dzg-dcell');
    if (key.startsWith('x:')) {
      const master = d.nodeAt(d.index(i)!) as { data: T };
      expect([dc.length, r.querySelectorAll('.dzg-cell').length, r.getAttribute('data-kind'), r.hasAttribute('aria-selected'), r.querySelector('.dzg-check')]).toEqual([1, 0, 'detail', false, null]);
      expect(dc[0]!.getAttribute('aria-colspan'), `${step}: colspan`).toBe(String(cols + (check ? 1 : 0)));
      expect(dc[0]!.getAttribute('aria-label'), `${step}: name of ${key}`).toBe(master.data.name);
      const width = t.ctx.columns.layout.totalWidth + (check ? 40 : 0);
      expect(px(dc[0]!.style.inlineSize)).toBe(Math.min(t.box.inline, px(r.style.inlineSize)));
      expect(px(r.style.inlineSize)).toBeGreaterThanOrEqual(width - 40);
    } else {
      expect(dc.length, `${step}: no detail cell in ${key}`).toBe(0);
      expect(r.getAttribute('data-kind')).toBeNull();
    }
  }
  // The focus: on a row shown, and held by its cell when the grid has it.
  const f = t.g.kernel.focus;
  if (f?.kind === 'cell') {
    expect(d.indexOf(f.row), `${step}: focus on a shown row`).not.toBe(-1);
    const a = document.activeElement as HTMLElement | null;
    if (a && t.vp.contains(a) && a !== t.vp && !a.closest('.dzg-hcell')) {
      const row = a.closest('.dzg-layer > .dzg-row');
      expect(row && t.ctx.rowRenderer.keyOf(row), `${step}: DOM focus is the kernel's`).toBe(f.row);
    }
  }
  const sel = t.g.kernel.selection as unknown as { keys: Set<RowKey> };
  for (const s of sel.keys) expect(String(s).startsWith('x:'), `${step}: a detail selected`).toBe(false);
  for (const e of t.events) if (e.type === 'rowClicked' || e.type === 'cellClicked') expect(String((e as { row: { key: RowKey } }).row.key).startsWith('x:')).toBe(false);
}

const KEYS: [string, KeyboardEventInit?][] = [['ArrowUp'], ['ArrowDown'], ['ArrowLeft'], ['ArrowRight'], ['PageUp'], ['PageDown'], ['Home'], ['End'], ['Home', { ctrlKey: true }], ['End', { ctrlKey: true }], ['Enter'], ['Escape'], ['F2'], [' ']];

function walk(seed: number, o: { n: number; steps: number; rtl?: boolean; pinned?: boolean; maxPhysical?: number; heavy?: boolean; block?: number }) {
  const rand = rng(seed);
  const pick = <V>(a: readonly V[]) => a[Math.floor(rand() * a.length)]!;
  const log: string[] = [];
  const heights = new Map<string, number>();
  const t = dmake({
    rows: ROWS(o.n), block: o.block ?? 320, inline: 420, part: testPart(log),
    ...(o.maxPhysical && { maxPhysical: o.maxPhysical }),
    detail: { height: (r) => heights.get(r.id) ?? 240 },
    settings: {
      selection: { mode: 'multi', click: true, ...(seed % 2 ? { checkbox: true } : {}) },
      ...(o.pinned && { columns: WIDE }),
      ...(o.rtl && { direction: 'rtl' }),
    },
  });
  const check = seed % 2 === 1;
  let next = o.n;
  for (let s = 0; s < o.steps; s++) {
    const d = t.d();
    const r = rand();
    let step = `seed ${seed} step ${s}`;
    const masters = () => Array.from({ length: Math.min(d.count, 400) }, (_, j) => d.keyAt(d.index(Math.floor(rand() * d.count))!)).filter((k) => !k.startsWith('x:'));
    if (r < 0.14) {
      const ms = masters().slice(0, 1 + Math.floor(rand() * 4));
      for (const m of ms) heights.set(String(m).replace(/^d:\d+:/, ''), Math.floor(rand() * 600));
      const open = rand() < 0.65;
      step += ` ${open ? 'open' : 'close'} ${ms.length}`;
      t.expand(ms.map((m) => String(m).replace(/^d:\d+:/, '')), open);
    } else if (r < 0.28) {
      // One detail's height set in place on the layout (an 'auto' measure): the top row is kept.
      const L = t.ctx.layout as SparseLayout;
      const det = (d as unknown as DetailRows<T>).details;
      if (!det.length || !d.count) continue;
      const at = det[Math.floor(rand() * det.length)]!;
      const h = Math.floor(rand() * 700);
      const before = { key: t.topKey(), into: t.top() - L.offsetOf(L.indexAt(t.top())), atTop: t.ctx.scroll.atTop, atEnd: t.ctx.scroll.atEnd, ti: L.indexAt(t.top()) as number };
      step += ` setHeight ${at}=${h} (top ${before.ti})`;
      L.setHeights([[at as never, h]]);
      t.ctx.schedule();
      if (!before.atTop && !before.atEnd && at < before.ti) {
        expect(t.topKey(), `${step}: top row kept`).toBe(before.key);
        if (t.top() < t.ctx.scroll.mapper!.maxLogical) expect(t.top() - t.ctx.layout!.offsetOf(t.d().indexOf(before.key) as never), `${step}: into it`).toBeCloseTo(before.into, 6);
      }
      if (before.atEnd) expect(t.top(), `${step}: end stays end`).toBe(t.ctx.scroll.mapper!.maxLogical);
    } else if (r < 0.34) {
      const den = pick(['compact', 'comfortable', 'spacious'] as const);
      const key = t.topKey();
      const at = { top: t.ctx.scroll.atTop, end: t.ctx.scroll.atEnd };
      step += ` density ${den}`;
      t.g.update({ density: den });
      if (!at.top && !at.end && t.top() < t.ctx.scroll.mapper!.maxLogical) expect(t.topKey(), `${step}: top row kept`).toBe(key);
    } else if (r < 0.40 && o.heavy) {
      step += ' sort';
      t.g.kernel.dispatch({ type: 'sort.set', sort: rand() < 0.3 ? [] : [{ column: 'n', dir: pick(['asc', 'desc'] as const) }] }, 'user');
    } else if (r < 0.44 && o.heavy) {
      step += ' filter';
      t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: rand() < 0.4 ? null : { type: 'text', op: 'contains', value: String(Math.floor(rand() * 10)) } } as never, 'user');
    } else if (r < 0.52 && o.heavy) {
      const victims = masters().slice(0, 2).map((m) => ({ id: String(m).replace(/^d:\d+:/, '') }));
      const kind = rand();
      step += ` transaction ${kind < 0.35 ? 'add' : kind < 0.7 ? 'remove' : 'update'}`;
      if (kind < 0.35) t.g.kernel.rows.applyTransaction({ add: [{ id: `R${next}`, name: `Row ${next}`, n: next++ }] } as never);
      else if (kind < 0.7) t.g.kernel.rows.applyTransaction({ remove: victims } as never);
      else t.g.kernel.rows.applyTransaction({ update: victims.map((v) => ({ id: v.id, name: `Renamed ${v.id} ${s}`, n: Math.floor(rand() * 1000) })) } as never);
    } else if (r < 0.60) {
      const max = t.ctx.scroll.mapper!.physicalHeight;
      const top = rand() < 0.15 ? max : Math.floor(rand() * max);
      step += ` scroll ${top}`;
      t.scroll(top);
    } else if (r < 0.65) {
      step += ' wheel';
      const before = t.top();
      const dy = Math.floor((rand() - 0.5) * 600);
      t.vp.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, bubbles: true, cancelable: true }));
      if (t.ctx.scroll.mapper!.scaled) expect(t.top(), `${step}: wheel exact`).toBe(Math.max(0, Math.min(t.ctx.scroll.mapper!.maxLogical, before + dy)));
    } else if (r < 0.68) {
      step += ' inline scroll';
      t.box.scrollInline = Math.floor(rand() * 500);
      t.vp.dispatchEvent(new Event('scroll'));
    } else if (r < 0.71 && d.count) {
      const key = d.keyAt(d.index(Math.floor(rand() * d.count))!);
      step += ` ensureVisible ${key}`;
      t.g.api.ensureVisible(key);
      const L = t.ctx.layout!;
      const i = t.d().indexOf(key);
      const off = L.offsetOf(i as never);
      // Seen: at least partly in the view.
      expect(off < t.top() + t.box.block && off + L.heightOf(i as never) > t.top(), `${step}: in view`).toBe(true);
    } else if (r < 0.74 && d.count) {
      // A click on a mounted row (a detail cell too): no click event, no selection from a detail.
      const rows = [...t.host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')];
      const row = pick(rows);
      const target = row?.querySelector<HTMLElement>('.dzg-dcell, .dzg-cell');
      if (!target) continue;
      step += ` click ${t.ctx.rowRenderer.keyOf(row!)}`;
      target.focus();
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    } else if (d.count) {
      if (!t.vp.contains(document.activeElement) || document.activeElement === t.vp) {
        const f = t.g.kernel.focus;
        if (f?.kind === 'cell' && t.d().indexOf(f.row) !== -1) t.g.api.focusCell(f.row, f.column);
        else t.g.api.focusCell(d.keyAt(d.index(Math.floor(rand() * d.count))!), 'n');
      }
      const [key, mods] = pick(KEYS);
      const from = t.g.kernel.focus;
      const inside = (document.activeElement as HTMLElement).tagName === 'BUTTON';
      step += ` key ${mods?.ctrlKey ? 'Ctrl+' : ''}${key} from ${from?.kind === 'cell' ? from.row : from?.kind}${inside ? ' (in part)' : ''}`;
      t.press(key, mods);
      const f = t.g.kernel.focus;
      if (f?.kind === 'cell') {
        const a = document.activeElement as HTMLElement;
        expect(t.vp.contains(a), `${step}: focus kept in the grid`).toBe(true);
        // Never hidden: the focused row at least partly in the view after a move.
        const L = t.ctx.layout!;
        const i = t.d().indexOf(f.row);
        if (!inside && JSON.stringify(f) !== JSON.stringify(from)) {
          const off = L.offsetOf(i as never);
          expect(off < t.top() + t.box.block && off + L.heightOf(i as never) > t.top(), `${step}: focused row in view`).toBe(true);
        }
        if (f.row.startsWith('x:') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key) && !mods && !inside) expect(f).toEqual(from);
      }
    }
    invariants(t, check, (o.pinned ? WIDE : COLUMNS).length, step);
  }
  // Parts: one live per mounted detail with a slot, none after the end.
  const live = new Map<string, number>();
  for (const l of log) { const [what, id] = l.split(' '); live.set(id!, (live.get(id!) ?? 0) + (what === 'mount' ? 1 : -1)); }
  const mountedParts = [...(t.ctx.rowRenderer.mounted as ReadonlyMap<RowKey, RowView>).values()].filter((v) => v.part).length;
  expect([...live.values()].reduce((a, b) => a + b, 0)).toBe(mountedParts);
  t.g.destroy();
  const after = new Map<string, number>();
  for (const l of log) { const [what, id] = l.split(' '); after.set(id!, (after.get(id!) ?? 0) + (what === 'mount' ? 1 : -1)); }
  expect([...after.values()].every((v) => v === 0)).toBe(true);
}

describe('a random walk over details and variable heights (every paint checked)', () => {
  for (const [seed, extra] of [[1, {}], [2, { rtl: true }], [3, { pinned: true }], [4, { pinned: true, rtl: true }], [5, { block: 120 }], [6, { block: 900, pinned: true }]] as const) {
    it(`seed ${seed} ${JSON.stringify(extra)}: 300 rows, sort, filter, transactions`, () => walk(seed, { n: 300, steps: 220, heavy: true, ...extra }));
  }
  for (const seed of [11, 12]) it(`seed ${seed}: scaled (3 000 rows, 20 000 px physical)`, () => walk(seed, { n: 3000, steps: 200, heavy: true, maxPhysical: 20_000 }));
  it('seed 21: scaled at 1M rows', () => walk(21, { n: 1_000_000, steps: 60, maxPhysical: 4_000_000 }), 120_000);
});

describe('uniform twins: the feature with no detail open draws what a grid without it draws', () => {
  for (const seed of [31, 32, 33, 34]) {
    it(`seed ${seed}`, () => {
      const rand = rng(seed);
      const settings = { overscan: { rows: 2, cols: 1 }, selection: { mode: 'multi' as const, checkbox: seed % 2 === 0 }, ...(seed > 32 && { columns: WIDE, direction: 'rtl' as const }) };
      const o = { rows: ROWS(400), inline: 420, maxPhysical: seed % 2 ? 6000 : undefined, settings };
      const a = dmake(o);
      const b = dmake({ ...o, bare: true });
      const html = (t: Made) => t.host.innerHTML.replace(/ data-motion="[^"]*"/g, "").replace(/dzg-tip-\d+/g, "dzg-tip");
      for (let s = 0; s < 150; s++) {
        const r = rand();
        const both = (f: (t: Made) => void) => { f(a); f(b); };
        let step = `seed ${seed} step ${s}`;
        if (r < 0.15) {
          const top = Math.floor(rand() * a.ctx.scroll.mapper!.physicalHeight);
          step += ` scroll ${top}`;
          both((t) => t.scroll(top));
        } else if (r < 0.22) {
          const den = (['compact', 'comfortable', 'spacious'] as const)[Math.floor(rand() * 3)]!;
          step += ` density ${den}`;
          both((t) => t.g.update({ density: den }));
        } else if (r < 0.27) {
          const dy = Math.floor((rand() - 0.5) * 900);
          step += ` wheel ${dy}`;
          both((t) => t.vp.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, bubbles: true, cancelable: true })));
        } else if (r < 0.32) {
          const dir = rand() < 0.5 ? 'asc' : 'desc';
          step += ` sort ${dir}`;
          both((t) => t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir }] }, 'user'));
        } else if (r < 0.37) {
          const id = `R${Math.floor(rand() * 400)}`;
          step += ` remove ${id}`;
          both((t) => t.g.kernel.rows.applyTransaction({ remove: [{ id }] } as never));
        } else if (r < 0.42) {
          const block = 100 + Math.floor(rand() * 600);
          step += ` resize ${block}`;
          both((t) => { t.box.block = block; t.ctx.schedule(); });
        } else {
          const [key, mods] = KEYS[Math.floor(rand() * KEYS.length)]!;
          step += ` key ${key}`;
          both((t) => {
            if (!t.vp.contains(document.activeElement) || document.activeElement === t.vp) {
              const f = t.g.kernel.focus;
              t.g.api.focusCell(f?.kind === 'cell' && t.d().indexOf(f.row) !== -1 ? f.row : t.d().keyAt(t.d().index(0)!), f?.kind === 'cell' ? f.column : 'n');
            }
            const before = document.activeElement;
            t.press(key, mods);
            // The twin's turn: blur so the next grid focuses its own.
            if (document.activeElement === before || t.vp.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
          });
        }
        expect(a.top(), `${step}: top`).toBe(b.top());
        expect(a.g.kernel.focus, `${step}: focus`).toEqual(b.g.kernel.focus);
        const ha = html(a), hb = html(b);
        if (ha !== hb) { let i = 0; while (ha[i] === hb[i]) i++; expect(ha.slice(Math.max(0, i - 150), i + 80), `${step}: DOM`).toBe(hb.slice(Math.max(0, i - 150), i + 80)); }
      }
    });
  }
});
/** Frames by hand. */
function frames() {
  const q: FrameRequestCallback[] = [];
  return { raf: { requestAnimationFrame: (f: FrameRequestCallback) => q.push(f), cancelAnimationFrame: () => {} }, flush: () => { for (const f of q.splice(0)) f(0); } };
}
