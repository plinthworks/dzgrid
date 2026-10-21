// A long random walk with real GSAP on manual time (step 26 review): sorts, filters, transactions,
// setRows with small and big deltas, scrolls at random speeds (mid-tween too), page changes, popups
// opened and closed mid-tween, the overlay, reduced-motion and settings.motion toggled mid-effect,
// host hooks that tween, return false or throw, context changes, and a destroy mid-tween. The twin
// (`motion: false`) replays the same seed alone, so the document focus can be compared too.
//
// After every step: same rows, DOM order, aria-rowindex and focused element as the twin; the inline
// layout (every style but transform, opacity, --dzg-flash) equal to the twin's, even mid-tween;
// cellClass tokens equal an oracle of the rule; a flash only on a cell a transaction changed, from
// the text shown before, at most 50 a paint, none on a reset; an element rebound to another row
// carries no running tween and no motion prop. Once time has passed, every tween is done and no
// element keeps a motion prop.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { gsap } from 'gsap';
import { dataKey, idOfDataKey, type ColumnDef, type RowKey } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import type { GridContext } from '../src/context.js';
import { EN } from '../src/locales/en.js';
import { EN_PAGINATION } from '../src/locales/en-pagination.js';
import { motion, type MotionOptions } from '../src/motion-gsap.js';
import { popupsFor, type PopupRef } from '../src/popup.js';
import { changeMedia, clock, media, stubMedia, type R } from './support-motion.js';

const MOTION_PROPS = ['transform', 'opacity', '--dzg-flash', 'translate', 'scale', 'rotate'];
let T = 0;
/** GSAP's clock, moved by the test only. */
const advance = (s: number): void => {
  T += s;
  gsap.updateRoot(T);
};

beforeEach(() => {
  media.reduce = false;
  clock.now = 1000;
  stubMedia();
  gsap.ticker.remove(gsap.updateRoot);
  T = gsap.ticker.time + 1;
  gsap.updateRoot(T);
});
afterEach(() => {
  document.body.innerHTML = '';
  gsap.globalTimeline.clear();
  gsap.ticker.add(gsap.updateRoot);
  vi.restoreAllMocks();
});

interface Made {
  g: GridInstance<R>;
  ctx: GridContext<unknown>;
  doc: Document;
  host: HTMLElement;
  frame(): void;
  scrollEvent(top: number): void;
  box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] };
}

const columns = (rule: NonNullable<NonNullable<ColumnDef<R, any>['ui']>['cellClass']>): ColumnDef<R, any>[] => [
  { id: 'id' },
  { id: 'n', type: 'number', ui: { cellClass: rule } },
  { id: 's', ui: { cellClass: (c) => ((c.row as R).n % 3 === 0 ? 'tri' : '') } },
];

function mountIn(doc: Document, settings: Partial<GridSettings<R>>, rows: R[], rule: Parameters<typeof columns>[0]): Made {
  const box = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => void (box.scrollTop = px), writeScrollInline: (px) => void (box.scrollInline = px) };
  const queue: FrameRequestCallback[] = [];
  const raf = { requestAnimationFrame: (cb: FrameRequestCallback) => queue.push(cb), cancelAnimationFrame: () => {} };
  const host = doc.createElement('div');
  doc.body.append(host);
  const g = createGrid<R>(host, { rows, getRowId: (r) => r.id, columns: columns(rule), messages: { ...EN, text: { ...EN.text, ...EN_PAGINATION.text } }, ...settings }, { geometry, raf });
  const frame = () => {
    for (let i = 0; i < 5 && queue.length; i++) for (const cb of queue.splice(0)) cb(clock.now);
  };
  frame();
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const Ev = (doc.defaultView as unknown as { Event: typeof Event }).Event;
  return {
    g, doc, host, box, frame,
    ctx: (g as unknown as { context: GridContext<unknown> }).context,
    scrollEvent: (top) => {
      box.scrollTop = top;
      vp.dispatchEvent(new Ev('scroll'));
    },
  };
}

const rng = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const idOf = (row: Element | null): string | null => row?.querySelector('[data-col="id"]')?.textContent ?? null;
const rowsIn = (m: Made) => [...m.host.querySelectorAll<HTMLElement>('.dzg-row')];
const shape = (m: Made) => rowsIn(m).map((r) => `${r.getAttribute('aria-rowindex')}:${[...r.querySelectorAll('.dzg-cell')].map((c) => `${c.getAttribute('data-col')}=${c.textContent}`).join('|')}`);
/** An element's inline style without the props motion may write. */
const layoutOf = (el: HTMLElement): string => {
  const out: string[] = [];
  for (let i = 0; i < el.style.length; i++) {
    const p = el.style.item(i);
    if (!MOTION_PROPS.includes(p) && p !== 'will-change') out.push(`${p}:${el.style.getPropertyValue(p)}`);
  }
  return out.sort().join(';');
};
const layout = (m: Made) => [...m.host.querySelectorAll<HTMLElement>('.dzg-layer, .dzg-row, .dzg-row > *, .dzg-cell, .dzg-overlay')].map((el) => `${el.className.replace(/\s*dzg-flash/, '')}{${layoutOf(el)}}`);
const motionProps = (el: HTMLElement): string[] => MOTION_PROPS.filter((p) => el.style.getPropertyValue(p) !== '').concat(el.classList.contains('dzg-flash') ? ['class'] : []);
/** Where the document focus is, said the same way in both documents. */
const focusOf = (m: Made): string => {
  const a = m.doc.activeElement as HTMLElement | null;
  if (!a || a === m.doc.body) return 'body';
  const row = a.closest('.dzg-row');
  if (row) return `cell:${idOf(row)}:${a.getAttribute('data-col')}`;
  if (a.closest('.dzg-popup')) return `popup:${a.textContent}`;
  return `other:${a.className}`;
};
const running = () => gsap.globalTimeline.getChildren(true, true, false).filter((t) => t.progress() < 1 && !t.paused());

/** The rule: a value over a threshold given by the context, an edited row, a negative one. */
const rule = (c: { value: unknown; row: R; context: unknown }): string | null => {
  const v = c.value as number | null;
  const th = (c.context as { th?: number } | undefined)?.th ?? 500;
  const out: string[] = [];
  if (v !== null && v > th) out.push('hi', 'big');
  if (c.row.s.endsWith('+')) out.push('edited');
  if (v !== null && v < 0) out.push('neg dzg-ignored');
  return out.length ? out.join(' ') : null;
};
const tokens = (s: string | null | undefined) => [...new Set((s ?? '').split(/\s+/).filter((t) => t && !t.startsWith('dzg-')))].sort();
const hostTokens = (el: Element) => [...el.classList].filter((t) => !t.startsWith('dzg-')).sort();

interface Walk {
  seed: number;
  steps: number;
  paged: boolean;
  /** Hooks that tween and return false (the built-in skipped): the guard should still follow them. */
  hostFalseTweens?: boolean;
  destroyMid?: boolean;
}

/** What the twin must match at each check point. */
interface Snap {
  label: string;
  shape: string[];
  layout: string[];
  focus: unknown;
  active: string;
}

/**
 * One run of the walk: with motion (the hooks, GSAP) or as the `motion: false` twin (no feature).
 * The same seed gives the same operations, so the twin replays them alone, in the same document.
 */
async function walk(w: Walk, twin: boolean): Promise<{ snaps: Snap[]; animated: number; flashes: number; rebinds: number }> {
  document.body.innerHTML = '';
  gsap.globalTimeline.clear();
  media.reduce = false;
  clock.now = 1000;
  const rand = rng(w.seed);
  const data = new Map<string, R>();
  const initial: R[] = Array.from({ length: 140 }, (_, i) => ({ id: `r${i}`, n: i % 2 ? i - 1 : i + 1, s: `s${i}` }));
  for (const r of initial) data.set(r.id, r);
  let context: { th: number } = { th: 500 };
  let hookCalls = 0;
  /** Elements a hook or the built-in animated, with the row (and column) they were animated for. */
  const animatedFor = new Map<HTMLElement, { key: RowKey; col?: string }>();
  const cellCalls: { key: RowKey; column: string; text: string; previousText: string }[] = [];
  const o: MotionOptions = {
    gsap,
    onCell: (el, c) => {
      hookCalls++;
      cellCalls.push({ key: c.key, column: c.column, text: c.text, previousText: c.previousText });
      animatedFor.set(el, { key: c.key, col: c.column });
      const r = (hookCalls * 7) % 10;
      if (r === 0) throw new Error('hook');
      if (w.hostFalseTweens && r < 3) {
        gsap.fromTo(el, { opacity: 0.5 }, { opacity: 1, duration: 2, clearProps: 'opacity' });
        return false;
      }
      if (r < 2) return false;
      if (r < 4) gsap.fromTo(el, { scale: 1.05 }, { scale: 1, duration: 0.1 });
      return undefined;
    },
    onRow: (el, c) => {
      hookCalls++;
      animatedFor.set(el, { key: c.key });
      const r = (hookCalls * 3) % 11;
      if (r === 0) throw new Error('row hook');
      if (w.hostFalseTweens && r < 3) {
        gsap.fromTo(el, { opacity: 0.6 }, { opacity: 1, duration: 2, clearProps: 'opacity' });
        return false;
      }
      if (r < 2) return false;
      if (r < 4) gsap.fromTo(el, { scale: 1.01 }, { scale: 1, duration: 0.05 });
      return undefined;
    },
  };
  (window as Window & { reportError?: (e: unknown) => void }).reportError = () => {};
  const m = motion(o);
  const settings: Partial<GridSettings<R>> = { context, ...(w.paged ? { pagination: { pageSize: 15 } } : {}) };
  const a = mountIn(document, twin ? { motion: false, ...settings } : { features: [m], ...settings }, initial, rule as never);
  if (!twin) await m.load();
  let motionOn = true;
  let popup: PopupRef | null = null;
  let animated = 0;
  let flashes = 0;
  let rebinds = 0;
  let nextId = 0;
  const hist: number[] = [];
  const snaps: Snap[] = [];
  const known = (id: string): R | undefined => a.ctx.rows.row(dataKey(id)!)?.data as R | undefined;

  /** The texts every mounted cell shows now, by row id and column. */
  const textsNow = (): Map<string, Map<string, string>> => {
    const out = new Map<string, Map<string, string>>();
    for (const r of rowsIn(a)) out.set(idOf(r)!, new Map([...r.querySelectorAll('.dzg-cell')].map((c) => [c.getAttribute('data-col')!, c.textContent ?? ''])));
    return out;
  };

  const check = (label: string, changed: Set<string> | null, added: Set<string>, before: Map<string, Map<string, string>>, reset: boolean, flashOk: boolean) => {
    snaps.push({ label, shape: shape(a), layout: layout(a), focus: a.g.kernel.focus, active: focusOf(a) });
    // cellClass: the oracle of the rule over the rendered cells.
    for (const r of rowsIn(a)) {
      const id = idOf(r)!;
      const row = known(id);
      expect(row, `${label} ${id} known`).toBeDefined();
      const n = r.querySelector('[data-col="n"]');
      if (n) expect(hostTokens(n), `${label} ${id} n`).toEqual(tokens(rule({ value: row!.n, row: row!, context })));
      const s = r.querySelector('[data-col="s"]');
      if (s) expect(hostTokens(s), `${label} ${id} s`).toEqual(row!.n % 3 === 0 ? ['tri'] : []);
      const idc = r.querySelector('[data-col="id"]');
      if (idc) expect(hostTokens(idc), `${label} ${id} id`).toEqual([]);
    }
    if (twin) {
      expect(a.host.querySelectorAll('.dzg-flash').length, label).toBe(0);
      return;
    }
    // The flash: only cells a transaction changed, from the text shown before, at most 50, none on a reset.
    const calls = cellCalls.splice(0);
    if (!flashOk || reset || !changed || !motionOn) expect(calls, label).toEqual([]);
    expect(calls.length, label).toBeLessThanOrEqual(50);
    for (const c of calls) {
      const id = String(idOfDataKey(c.key));
      expect(changed!.has(id), `${label} flash ${id}`).toBe(true);
      expect(c.text, label).not.toBe(c.previousText);
      expect(c.previousText, label).toBe(before.get(id)?.get(c.column) ?? (added.has(id) ? '' : '<unmounted>'));
    }
    flashes += calls.length;
    for (const el of a.host.querySelectorAll<HTMLElement>('.dzg-flash')) {
      const id = idOf(el.closest('.dzg-row'));
      expect(animatedFor.get(el)?.key, `${label} marked ${id}`).toEqual(dataKey(id!));
    }
    // A rebound (or pooled) element carries nothing of the row it was animated for.
    for (const [el, f] of animatedFor) {
      const row = f.col ? el.closest('.dzg-row') : el;
      const shows = el.isConnected && row && a.ctx.rowRenderer.keyOf(row) === f.key && (!f.col || el.getAttribute('data-col') === f.col);
      if (shows) continue;
      rebinds++;
      expect(gsap.getTweensOf(el).filter((t) => t.progress() < 1).length, `${label} rebound ${String(idOfDataKey(f.key))}`).toBe(0);
      expect(motionProps(el), `${label} rebound ${String(idOfDataKey(f.key))}`).toEqual([]);
      animatedFor.delete(el);
    }
    // Motion off: nothing of the grid's own runs.
    if (!motionOn) for (const el of a.host.querySelectorAll<HTMLElement>('.dzg-row, .dzg-cell, .dzg-layer, .dzg-overlay')) expect(gsap.getTweensOf(el).filter((t) => t.progress() < 1 && t.duration() > 0.1), label).toEqual([]);
  };

  for (let step = 0; step < w.steps; step++) {
    const before = textsNow();
    let changed: Set<string> | null = null;
    const added = new Set<string>();
    let reset = false;
    let flashOk = true;
    clock.now += rand() < 0.25 ? 40 + Math.floor(rand() * 200) : 400 + Math.floor(rand() * 400);
    const op = Math.floor(rand() * 16);
    const p = [rand(), rand(), rand(), rand()];
    hist.push(op);
    const label = `seed ${w.seed} step ${step} op ${op} [${hist.join(',')}]`;
    const k = a.g.kernel;
    if (op === 0) k.dispatch({ type: 'sort.set', sort: p[0]! < 0.15 ? [] : [{ column: p[1]! < 0.5 ? 'n' : 's', dir: p[2]! < 0.5 ? 'asc' : 'desc' }] }, 'user');
    else if (op === 1) k.dispatch({ type: 'quick.set', text: p[0]! < 0.4 ? '' : String(Math.floor(p[1]! * 9)) }, 'user');
    else if (op === 2 || op === 3) {
      // A transaction: a few rows updated (a value, sometimes the text, sometimes negative), maybe one removed.
      const ids = [...data.keys()];
      const from = Math.floor(p[0]! * Math.min(ids.length, 30));
      const pick = ids.slice(from, from + 1 + Math.floor(p[1]! * (op === 3 ? 25 : 4)));
      const update = pick.map((id) => ({ ...data.get(id)!, n: Math.floor(p[2]! * 1500) - 200 + Number(id.replace(/\D/g, '')), s: p[3]! < 0.3 ? `${data.get(id)!.s}+` : data.get(id)!.s }));
      const remove = p[3]! > 0.85 && ids.length > 40 ? [ids[ids.length - 1]!] : [];
      changed = new Set(update.map((r) => r.id));
      reset = update.length + remove.length > data.size / 2;
      for (const r of update) data.set(r.id, r);
      for (const id of remove) data.delete(id);
      k.rows.applyTransaction({ update, remove });
    } else if (op === 4) {
      const r: R = { id: `x${nextId++}`, n: Math.floor(p[0]! * 1000), s: `x${step}` };
      data.set(r.id, r);
      changed = new Set([r.id]);
      added.add(r.id);
      k.rows.applyTransaction({ add: [r] });
    } else if (op === 5) {
      // Scroll at a random speed: several events, frames sometimes between, time passing (mid-tween).
      const target = Math.floor(p[0]! * 100) * 32;
      const n = 1 + Math.floor(p[1]! * 5);
      const from = a.box.scrollTop;
      for (let i = 1; i <= n; i++) {
        a.scrollEvent(Math.round(from + ((target - from) * i) / n));
        if (p[2]! < 0.7) a.frame();
        if (p[3]! < 0.5) advance(0.03);
      }
      flashOk = false;
    } else if (op === 6 && w.paged) k.dispatch({ type: 'page.go', index: Math.floor(p[0]! * 6) }, 'user');
    else if (op === 7) {
      const key = dataKey([...data.keys()][Math.floor(p[0]! * Math.min(20, data.size))]!)!;
      k.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: key, column: p[1]! < 0.5 ? 'n' : 's' } }, 'user');
      a.frame();
      a.g.api.focusCell(key, p[1]! < 0.5 ? 'n' : 's');
    } else if (op === 8 || op === 9) {
      // setRows: a small delta (a few values: flashes) or a big one (a reset: none).
      const rows = [...data.values()].map((r, i) => (op === 8 ? (i < 3 ? { ...r, n: r.n + 7 } : r) : { ...r, n: r.n + 1 }));
      changed = new Set(op === 8 ? rows.slice(0, 3).map((r) => r.id) : rows.map((r) => r.id));
      reset = op === 9;
      for (const r of rows) data.set(r.id, r);
      a.g.update({ rows });
    } else if (op === 10) {
      // A popup opened or closed, mid-tween.
      if (popup) {
        popup.close();
        popup = null;
      } else {
        const content = document.createElement('div');
        content.innerHTML = '<button type="button">ok</button>';
        popup = popupsFor(a.ctx).open(a.host.querySelector<HTMLElement>('.dzg-hcell')!, content, { placement: 'block-end', modal: p[0]! < 0.5 });
      }
    } else if (op === 11) changeMedia(!media.reduce);
    else if (op === 12) {
      motionOn = !motionOn;
      // The twin is updated too (always off): an update repaints, which settles a scroll's rows.
      a.g.update({ motion: twin ? false : motionOn });
    } else if (op === 13) {
      context = { th: p[0]! < 0.5 ? 300 : 700 };
      a.g.update({ context });
    } else if (op === 14 && p[0]! < 0.3) {
      // The overlay: no rows, then back.
      const keep = [...data.values()];
      a.g.update({ rows: [] });
      a.frame();
      await new Promise((r) => setTimeout(r, 0));
      advance(0.05);
      a.g.update({ rows: keep });
      reset = true;
      changed = new Set();
    } else if (op === 15) advance(p[0]! * 0.4);
    a.frame();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    if (!twin && running().length) animated++;
    check(label, changed, added, before, reset, flashOk);
    // Time passes between steps, sometimes mid-tween, sometimes past every tween.
    advance(rand() < 0.5 ? rand() * 0.2 : 1.5);
    check(`${label} (later)`, null, added, before, false, true);
    if (w.destroyMid && step === w.steps - 1) {
      a.g.destroy();
      if (popup) popup.close();
      await new Promise((r) => setTimeout(r, 0));
      advance(5);
      expect(running()).toEqual([]);
      for (const el of document.querySelectorAll<HTMLElement>('*')) expect(motionProps(el), `${el.className}`).toEqual([]);
      return { snaps, animated, flashes, rebinds };
    }
  }
  if (popup) popup.close();
  await new Promise((r) => setTimeout(r, 0));
  advance(5);
  expect(running()).toEqual([]);
  for (const el of document.querySelectorAll<HTMLElement>('*')) expect(motionProps(el), `${el.className}`).toEqual([]);
  a.g.destroy();
  return { snaps, animated, flashes, rebinds };
}

async function compared(w: Walk) {
  const twin = await walk(w, true);
  const r = await walk(w, false);
  expect(r.snaps.length).toBe(twin.snaps.length);
  r.snaps.forEach((s, i) => expect(s, s.label).toEqual(twin.snaps[i]));
  return r;
}

describe('motion: a long walk on GSAP time against a motion:false twin in its own document', () => {
  for (const seed of [3, 11, 29, 57, 101, 202]) {
    it(`seed ${seed}${seed % 2 ? ' (paged)' : ''}${seed % 3 === 0 ? ', destroyed mid-tween' : ''}`, async () => {
      const r = await compared({ seed, steps: 120, paged: seed % 2 === 1, destroyMid: seed % 3 === 0 });
      expect(r.animated).toBeGreaterThan(5);
      expect(r.flashes).toBeGreaterThan(3);
      expect(r.rebinds).toBeGreaterThan(0);
    }, 30_000);
  }

  // Step 26 correction (guard.ts / flash.ts / flip.ts): an element a hook animated was followed only when the
  // built-in effect played on it; a hook that tweens and returns false leaves its tween running on a
  // pooled element shown for another row.
  it('hooks that tween and return false: a rebound element carries no tween', async () => {
    await compared({ seed: 5, steps: 80, paged: false, hostFalseTweens: true });
  }, 30_000);
});
