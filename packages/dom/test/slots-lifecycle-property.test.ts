// Lifecycle property of the slot parts (coverage review of step 11): random sequences of
// column hide/show/move/pin, columns redefined, parts added/removed/renamed, messages, sorts,
// tooltips over random anchors, scrolls that recycle rows, overlay states and throwing parts.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef, GridEvent } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { definePart, type SlotPart, type WiredSlot } from '../src/part.js';
import type { GridContext } from '../src/context.js';
import { slots } from '../src/slots.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';

type R = { id: string; a: string; b: number; c: string; d: number; e: string };
let grids: GridInstance<R>[] = [];
const hadReport = (window as unknown as { reportError?: unknown }).reportError;
afterEach(() => {
  for (const g of grids) g.destroy();
  grids = [];
  document.body.innerHTML = '';
  vi.useRealTimers();
  (window as unknown as { reportError?: unknown }).reportError = hadReport;
});

function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (n: number) => Math.floor(next() * n), pick: <X>(xs: readonly X[]) => xs[Math.floor(next() * xs.length)]! };
}

interface Live { slot: WiredSlot; name: string; host: HTMLElement; column: string | null; row: unknown; key: object }
type Fault = 'none' | 'mount' | 'update' | 'destroy';

const IDS = ['a', 'b', 'c', 'd', 'e'] as const;
const defs = (gen: number): ColumnDef<R, any>[] => [
  { id: 'a', header: `A${gen}`, headerTooltip: 'about A', tooltip: (v: string | null) => (v ? `a ${v}` : null), ui: { header: 'hx' } },
  { id: 'b', header: `B${gen}`, type: 'number', tooltip: (v: number | null) => (v === null ? null : `b ${v}`) },
  { id: 'c', header: `C${gen}`, tooltip: (v: string | null) => (v ? `c ${v}` : null), ui: { tooltip: 'tx', header: 'nobody' } },
  { id: 'd', header: `D${gen}`, type: 'number', headerTooltip: 'about D' },
  { id: 'e', header: `E${gen}` },
];
const ROWS: R[] = Array.from({ length: 300 }, (_, i) => ({ id: `r${i}`, a: `x${i}`, b: i, c: `y${i}`, d: i * 2, e: `z${i}` }));

function world(seed: number) {
  const r = rng(seed);
  const live = new Set<Live>();
  let mounts = 0;
  let destroys = 0;
  const reported: unknown[] = [];
  (window as unknown as { reportError: unknown }).reportError = (e: unknown) => { reported.push(e); };

  function make<S extends WiredSlot>(slot: S, name: string, fault: Fault): SlotPart<S> {
    return definePart(slot, {
      mount(host: HTMLElement, c: any) {
        if (fault === 'mount' && r.next() < 0.5) throw new Error(`mount ${name}`);
        mounts++;
        const rec: Live = { slot, name, host, column: c.column?.id ?? null, row: c.row ?? null, key: {} };
        live.add(rec);
        const mark = document.createElement('i');
        mark.className = `part-${slot}`;
        mark.dataset['name'] = name;
        host.append(mark);
        return {
          update(n: any) {
            if (fault === 'update' && r.next() < 0.5) throw new Error(`update ${name}`);
            rec.column = n.column?.id ?? null;
            rec.row = n.row ?? null;
          },
          destroy() {
            destroys++;
            live.delete(rec);
            if (fault === 'destroy' && r.next() < 0.5) throw new Error(`destroy ${name}`);
          },
        };
      },
    } as never) as SlotPart<S>;
  }
  const fault = (): Fault => r.pick(['none', 'none', 'none', 'none', 'mount', 'update', 'destroy'] as const);
  const POOL: [WiredSlot, string][] = [['header', 'header'], ['header', 'header.number'], ['header', 'hx'], ['tooltip', 'tooltip'], ['tooltip', 'tooltip.number'], ['tooltip', 'tx'], ['overlay', 'overlay']];
  const registry = (): Record<string, SlotPart> => {
    const reg: Record<string, SlotPart> = {};
    for (const [slot, name] of POOL) if (r.next() < 0.6) reg[name] = make(slot, name, fault());
    // A part under a name of another slot: never used there.
    if (r.next() < 0.2) reg['header'] = make('tooltip', 'header', 'none') as never;
    return reg;
  };
  return { r, live, reported, registry, counts: () => ({ mounts, destroys }) };
}

function setup(seed: number) {
  vi.useFakeTimers();
  const w = world(seed);
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 500, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const g = createGrid<R>(host, { rows: ROWS, getRowId: (x) => x.id, columns: defs(0), messages: EN, features: [slots()], parts: w.registry(), onEvent: (e) => events.push(e) }, { geometry, sync: true });
  grids.push(g);
  const ctx = (g as unknown as { context: GridContext<R> }).context;
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const tip = host.querySelector<HTMLElement>('.dzg-tooltip')!;
  const overlay = host.querySelector<HTMLElement>('.dzg-overlay')!;
  return { ...w, g, ctx, box, host, vp, tip, overlay, events };
}

type T = ReturnType<typeof setup>;

function step(t: T, log: string[]): void {
  const { r, g } = t;
  const k = r.int(14);
  switch (k) {
    case 0: {
      const id = r.pick(IDS);
      const hidden = r.next() < 0.5;
      log.push(`hide ${id} ${hidden}`);
      return void g.kernel.dispatch({ type: 'column.state', patch: [{ id, hidden }] }, 'user');
    }
    case 1: {
      const id = r.pick(IDS);
      const order = r.int(5);
      log.push(`move ${id} ${order}`);
      return void g.kernel.dispatch({ type: 'column.state', patch: [{ id, order }] }, 'user');
    }
    case 2: {
      const id = r.pick(IDS);
      const pinned = r.pick(['start', 'end', null] as const);
      log.push(`pin ${id} ${pinned}`);
      return void g.kernel.dispatch({ type: 'column.state', patch: [{ id, pinned }] }, 'user');
    }
    case 3: {
      const gen = r.int(3);
      log.push(`columns ${gen}`);
      return void g.update({ columns: defs(gen) });
    }
    case 4: {
      log.push('parts');
      return void g.update({ parts: t.registry() });
    }
    case 5: {
      const fr = r.next() < 0.5;
      log.push(`messages ${fr ? 'fr' : 'en'}`);
      return void g.update({ messages: fr ? FR : EN });
    }
    case 6: {
      const column = r.pick(IDS);
      log.push(`sort ${column}`);
      return void g.kernel.dispatch({ type: 'sort.toggle', column, multi: r.next() < 0.3 }, 'user');
    }
    case 7:
    case 8: {
      // A tooltip over a random header or cell.
      const anchors = [...t.host.querySelectorAll<HTMLElement>('.dzg-header .dzg-hcell[data-col], .dzg-layer .dzg-row .dzg-cell[data-col]')];
      if (!anchors.length) return;
      const a = r.pick(anchors);
      log.push(`over ${a.dataset['col']} ${a.closest('.dzg-row')?.getAttribute('aria-rowindex') ?? 'head'}`);
      a.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
      vi.advanceTimersByTime(600);
      return;
    }
    case 9: {
      log.push('tip hide');
      t.ctx.tip.hide();
      return;
    }
    case 10: {
      // A scroll that recycles the pooled rows.
      t.box.scrollTop = r.int(300) * 32;
      log.push(`scroll ${t.box.scrollTop}`);
      t.vp.dispatchEvent(new Event('scroll'));
      return;
    }
    case 11: {
      const overlay = r.pick(['loading', 'error', null, undefined] as const);
      log.push(`overlay ${overlay}`);
      return void g.update({ overlay });
    }
    case 12: {
      const empty = r.next() < 0.5;
      log.push(`rows ${empty ? 'none' : 'all'}`);
      return void g.update({ rows: empty ? [] : ROWS });
    }
    default: {
      const text = r.pick(['', 'zzz-no-match', 'x1']);
      log.push(`quick ${text}`);
      return void g.kernel.dispatch({ type: 'quick.set', text }, 'user');
    }
  }
}

function check(t: T, log: string[]): void {
  const where = () => log.join(' | ');
  const visible = new Set(t.ctx.columns.visible().map((c) => c.id));
  const byHost = new Map<HTMLElement, Live[]>();
  for (const l of t.live) byHost.set(l.host, [...(byHost.get(l.host) ?? []), l]);
  for (const [h, ls] of byHost) expect(ls.length, `two live parts in one host: ${where()}`).toBe(1);
  const reg = t.ctx.settings.parts ?? {};
  for (const l of t.live) {
    if (l.slot === 'header') {
      expect(visible.has(l.column!), `a header part for hidden ${l.column}: ${where()}`).toBe(true);
      expect(t.ctx.el.header.contains(l.host), `a header part off the header: ${where()}`).toBe(true);
      expect((l.host.closest('.dzg-hcell') as HTMLElement).dataset['col']).toBe(l.column);
      expect(reg[l.name]?.slot, `a header part no longer registered: ${where()}`).toBe('header');
    }
    if (l.slot === 'overlay') {
      expect(t.overlay.hidden, `an overlay part on a hidden overlay: ${where()}`).toBe(false);
      expect(reg['overlay']?.slot).toBe('overlay');
    }
    if (l.slot === 'tooltip') {
      expect(t.tip.hidden, `a tooltip part in a hidden tooltip (row ${JSON.stringify(l.row)}): ${where()}`).toBe(false);
    }
  }
  // No part DOM without a live part: a host given back is emptied.
  for (const mark of t.host.querySelectorAll<HTMLElement>('[class^="part-"]')) {
    expect(byHost.has(mark.parentElement!), `stale part DOM ${mark.className}: ${where()}`).toBe(true);
  }
  // A header label not drawn by a part shows the grid's text.
  for (const label of t.ctx.el.header.querySelectorAll<HTMLElement>('.dzg-hcell[data-col]:not(.dzg-hextra) > .dzg-hlabel')) {
    if (byHost.has(label)) continue;
    const id = (label.parentElement as HTMLElement).dataset['col']!;
    const col = t.ctx.columns.get(id)!;
    expect(label.textContent, `header ${id} lost its text: ${where()}`).toBe(col.def.header ?? id);
  }
  // A hidden tooltip keeps nothing of a row; a hidden overlay keeps nothing.
  if (t.tip.hidden) expect(t.tip.childNodes.length === 0 || !t.tip.querySelector('[class^="part-"]')).toBe(true);
  if (t.overlay.hidden) expect(t.overlay.querySelector('[class^="part-"]')).toBeNull();
  // A visible overlay without a part shows the grid's words, and its retry button under an error.
  if (!t.overlay.hidden && ![...t.live].some((l) => l.slot === 'overlay')) {
    expect(t.overlay.textContent!.length, `empty overlay: ${where()}`).toBeGreaterThan(0);
    const err = t.ctx.settings.overlay === 'error';
    expect(t.overlay.querySelectorAll('button').length, `retry button: ${where()}`).toBe(err ? 1 : 0);
  }
}

describe('slot parts, lifecycle property', () => {
  for (let seed = 1; seed <= 40; seed++) {
    it(`seed ${seed}: every mount is destroyed, no part outlives its column, state or tooltip`, () => {
      const t = setup(seed);
      const log: string[] = [];
      for (let i = 0; i < 60; i++) {
        step(t, log);
        check(t, log);
      }
      t.g.destroy();
      const { mounts, destroys } = t.counts();
      expect([...t.live].map((l) => `${l.slot}:${l.name}:${l.column}`), log.join(' | ')).toEqual([]);
      expect(destroys).toBe(mounts);
    });
  }
});
