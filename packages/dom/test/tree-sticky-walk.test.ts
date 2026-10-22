// A DOM walk over sticky parent rows (docs/behaviors/tree-sticky.md, sticky-blueprint.md §Tests 3): a deep
// tree scrolled at random, parents closed from their copies, copies clicked, sorts, filters, transactions
// and keys while scrolled; after every step the copies against the oracle of the sheet, read from the
// model alone, and what a copy must never carry or take.
import { describe, it, expect, afterEach } from 'vitest';
import type { TreeRows } from '@dzgrid/core/tree';
import { cleanup, click, idOf, k, tmake, type T } from './support-tree.js';
import { stickyOracle } from './support-sticky.js';

afterEach(cleanup);

/** 6 services × 4 patients × 3 visits, some visits with 2 notes (four levels). */
const deep = (): T[] => {
  const out: T[] = [];
  let n = 0;
  for (let s = 0; s < 6; s++) {
    out.push({ id: `S${s}`, parent: null, name: `Service ${s}`, n: n++ % 9 });
    for (let p = 0; p < 4; p++) {
      out.push({ id: `S${s}.${p}`, parent: `S${s}`, name: `Patient ${s}.${p}`, n: n++ % 9 });
      for (let v = 0; v < 3; v++) {
        out.push({ id: `S${s}.${p}.${v}`, parent: `S${s}.${p}`, name: `Visit ${s}.${p}.${v}`, n: n++ % 9 });
        if ((s + p + v) % 2 === 0) for (let x = 0; x < 2; x++) out.push({ id: `S${s}.${p}.${v}.${x}`, parent: `S${s}.${p}.${v}`, name: `Note ${s}.${p}.${v}.${x}`, n: n++ % 9 });
      }
    }
  }
  return out;
};

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};

function walk(seed: number, lang: 'en' | 'ar', sticky: number | undefined, steps: number) {
  const t = tmake({ rows: deep(), lang, tree: { initial: 'all', ...(sticky !== undefined && { sticky }) }, settings: { selection: { mode: 'multi', checkbox: true, click: true } } });
  const R = rng(seed);
  const d = () => t.g.kernel.rows.displayed as TreeRows<T>;
  const top = () => (t.g as unknown as { scroll: { logicalTop: number } }).scroll.logicalTop;
  const copies = () => [...t.host.querySelectorAll<HTMLElement>('.dzg-sticky > .dzg-row')];
  const nameOf = (r: HTMLElement) => r.querySelector('.dzg-cell[data-col="name"]')?.textContent ?? '';
  const [back] = lang === 'ar' ? ['ArrowRight'] : ['ArrowLeft'];
  const log: string[] = [];
  let nextId = 0;
  const n = sticky ?? 3;

  function check(where: string): void {
    const m = d();
    const levels = Array.from({ length: m.count }, (_, i) => m.levelAt(i as never));
    const want = stickyOracle(levels, 32, { top: top(), n, viewBlock: 320 });
    const got = copies();
    const ctx = `${where} (seed ${seed}, ${lang}, sticky ${n}) after ${log.slice(-4).join(' | ')}`;
    expect(got.map(nameOf), ctx).toEqual(want.at.map((i) => t.g.kernel.rows.row(m.keyAt(i as never))?.data.name ?? ''));
    expect(got.map((r) => r.style.getPropertyValue('inset-block-start')), ctx).toEqual(want.y.map((y) => `${y}px`));
    expect(t.ctx.inset ?? 0, ctx).toBe(want.height);
    for (const r of got) {
      for (const a of ['aria-rowindex', 'aria-level', 'aria-posinset', 'aria-setsize', 'aria-expanded']) expect(r.hasAttribute(a), `${ctx}: ${a}`).toBe(false);
      expect(r.querySelector('.badge, [tabindex="0"]'), ctx).toBeNull();
    }
    const layer = t.host.querySelector('.dzg-sticky');
    if (n === 0) expect(layer, ctx).toBeNull();
    else expect(layer?.parentElement?.lastElementChild, ctx).toBe(layer);
    // Never the DOM focus inside the copies.
    expect(document.activeElement?.closest('.dzg-sticky') ?? null, ctx).toBeNull();
  }

  /** After a key or a copy clicked: the focused row clear of the copies, inside the view. */
  function clear(where: string): void {
    const f = t.g.kernel.focus;
    if (f?.kind !== 'cell') return;
    const i = d().indexOf(f.row);
    if (i === -1) return;
    const at = i * 32 - top();
    expect(at, `${where}: focused row ${idOf(f.row)} at ${at}, copies ${t.ctx.inset} (seed ${seed})`).toBeGreaterThanOrEqual(t.ctx.inset ?? 0);
    expect(at + 32, `${where}: focused row ${idOf(f.row)} (seed ${seed})`).toBeLessThanOrEqual(320);
  }

  const step = (label: string, fn: () => void) => {
    log.push(label);
    fn();
    check(label);
  };
  check('start');
  for (let s = 0; s < steps; s++) {
    const m = d();
    const x = R();
    const any = () => idOf(m.keyAt(Math.floor(R() * m.count) as never))!;
    if (x < 0.35) step('scroll', () => t.scroll(Math.floor(R() * Math.max(1, m.count * 32 - 320))));
    else if (x < 0.45) {
      const c = copies();
      if (c.length) step('collapse from a copy', () => click(c[Math.floor(R() * c.length)]!.querySelector<HTMLElement>('.dzg-toggle')!));
    } else if (x < 0.55) {
      const c = copies();
      if (c.length) {
        const sel = t.g.kernel.selection.keys.size;
        step('click a copy', () => click(c[Math.floor(R() * c.length)]!.querySelector<HTMLElement>(`.dzg-cell[data-col="${R() < 0.5 ? 'n' : 'name'}"]`)!));
        expect(t.g.kernel.selection.keys.size).toBe(sel);
        clear('click a copy');
      }
    } else if (x < 0.62) step('sort', () => t.g.kernel.dispatch({ type: 'sort.toggle', column: R() < 0.5 ? 'n' : 'name', multi: false }, 'user'));
    else if (x < 0.68) step('filter', () => t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: R() < 0.5 ? null : { type: 'text', op: 'contains', value: `${['Note', 'Visit', 'Patient 2', '.1'][Math.floor(R() * 4)]}` } }, 'user'));
    else if (x < 0.76) {
      const id = any();
      const r = R();
      if (r < 0.4) step(`tx add under ${id}`, () => t.g.kernel.rows.applyTransaction({ add: [{ id: `X${nextId++}`, parent: id, name: `Extra ${nextId}`, n: 3 }] }));
      else if (r < 0.6) step(`tx remove ${id}`, () => t.g.kernel.rows.applyTransaction({ remove: [id] }));
      else step(`tx patch ${id}`, () => t.g.kernel.rows.applyTransaction({ patch: [{ id, set: { name: `Renamed ${id}` } }] }));
    } else if (x < 0.84) step('expand', () => t.expand([any()], R() < 0.7, 'user'));
    else if (m.count) {
      if (t.g.kernel.focus?.kind !== 'cell' || d().indexOf(t.g.kernel.focus.row) === -1) step('focus', () => t.focus(any(), 'name'));
      const key = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'PageUp', back][Math.floor(R() * 5)]!;
      const from = t.g.kernel.focus;
      step(`key ${key}`, () => t.press(key));
      // A key that moved the focus (not one that only closed a row, nor a root going nowhere) brings its row clear.
      if (key !== 'PageUp' && t.g.kernel.focus !== from) clear(`key ${key}`);
    }
  }
  return t;
}

describe('sticky parent rows: a walk', () => {
  for (const [lang, sticky] of [['en', undefined], ['ar', 1], ['en', 2], ['ar', 3], ['en', 0]] as const) {
    it(`${lang}, sticky ${sticky ?? 'default'}: 40 seeds × 60 steps, the copies those of the sheet, never focused, never selecting`, () => {
      for (let seed = 1; seed <= 40; seed++) {
        walk(seed * 31 + (sticky ?? 7), lang, sticky, 60);
        cleanup();
      }
    });
  }

  it('a copy clicked while scrolled deep: the real row focused, under its ancestors only', () => {
    const t = tmake({ rows: deep(), tree: { initial: 'all' } });
    t.scroll(40 * 32 + 9);
    const c = [...t.host.querySelectorAll<HTMLElement>('.dzg-sticky > .dzg-row')];
    expect(c.length).toBeGreaterThan(1);
    click(c.at(-1)!.querySelector<HTMLElement>('.dzg-cell[data-col="n"]')!);
    const f = t.g.kernel.focus as unknown as { row: never; column: string };
    expect(f.column).toBe('n');
    const d = t.g.kernel.rows.displayed as TreeRows<T>;
    const i = d.indexOf(f.row);
    const top = (t.g as unknown as { scroll: { logicalTop: number } }).scroll.logicalTop;
    expect(i * 32 - top).toBe(Math.min(3, d.levelAt(i as never)) * 32);
    expect(t.where()).toBe(`${idOf(f.row)}/n`);
    expect(k(idOf(f.row)!)).toBe(f.row);
  });
});
