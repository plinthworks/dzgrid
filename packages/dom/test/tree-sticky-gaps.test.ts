// Gaps in the sticky-parent tests (review of 206121e): copies against their real rows (text, columns,
// widths, places through horizontal scroll, column windows, pinned columns, hide / move / pin of the
// tree column, density); every key leaving the focused row clear of the stack; lazy loading rows and
// path fillers; destroy. Oracle: support-sticky.ts (levels read from the model).
import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import type { TreeRows } from '@dzgrid/core/tree';
import { lazyChildren } from '../src/tree-lazy.js';
import { cleanup, click, idOf, k, tmake, type T, type TMake } from './support-tree.js';
import { stickyOracle } from './support-sticky.js';

afterEach(cleanup);

const COLS: ColumnDef<T, any>[] = [
  { id: 'name', header: 'Name', width: 160 },
  { id: 'n', header: 'N', type: 'number', width: 90 },
  ...Array.from({ length: 8 }, (_, c): ColumnDef<T, any> => ({ id: `c${c}`, header: `C${c}`, value: (r: T) => `${r.name}·${c}`, width: 120 })),
];

/** 5 services × 4 patients × 3 visits, some visits with notes. */
const deep = (): T[] => {
  const out: T[] = [];
  let n = 0;
  for (let s = 0; s < 5; s++) {
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

function make(o: TMake & { inline?: number } = {}) {
  const t = tmake({ rows: deep(), ...o, tree: { initial: 'all', ...o.tree }, settings: { columns: COLS, ...o.settings } });
  if (o.inline) (t.box.inline = o.inline), t.scroll(0);
  const d = () => t.g.kernel.rows.displayed as TreeRows<T>;
  const top = () => (t.g as unknown as { scroll: { logicalTop: number } }).scroll.logicalTop;
  const copies = () => [...t.host.querySelectorAll<HTMLElement>('.dzg-sticky > .dzg-row')];
  const h = () => t.ctx.rowHeight();
  const n = o.tree?.sticky ?? 3;
  /** Every invariant of the copies, against the oracle and against their real rows. */
  function audit(ctx: string): void {
    const m = d();
    const levels = Array.from({ length: m.count }, (_, i) => m.levelAt(i as never));
    const want = stickyOracle(levels, h(), { top: top(), n, viewBlock: t.box.block, h: h() });
    const got = copies();
    expect(got.length, ctx).toBe(want.at.length);
    expect(t.ctx.inset ?? 0, ctx).toBe(want.height);
    // A real row other than the focused one (that one keeps its focused column out of the window, D6).
    const fr = t.g.kernel.focus?.kind === 'cell' ? t.g.kernel.focus.row : null;
    const realRow = [...t.host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')].find((r) => t.ctx.rowRenderer.keyOf(r) !== fr)!;
    got.forEach((c, j) => {
      const key = m.keyAt(want.at[j] as never);
      const at = `${ctx}: copy ${j} (${idOf(key) ?? key})`;
      expect(c.style.getPropertyValue('inset-block-start'), at).toBe(`${want.y[j]}px`);
      expect(c.style.getPropertyValue('block-size'), at).toBe(`${h()}px`);
      for (const a of ['aria-rowindex', 'aria-level', 'aria-posinset', 'aria-setsize', 'aria-expanded', 'aria-busy', 'id', 'tabindex']) expect(c.hasAttribute(a), `${at}: ${a}`).toBe(false);
      expect(c.querySelector('[tabindex="0"], [id], .badge, input, button'), at).toBeNull();
      // The same cells as any real row (the window, pinned columns, the check cell), same widths and places.
      const cells = (r: HTMLElement) => [...r.querySelectorAll<HTMLElement>('.dzg-cell, .dzg-check')].map((x) => `${x.parentElement!.className}|${x.dataset['col'] ?? 'check'}|${x.style.getPropertyValue('inline-size')}|${x.style.getPropertyValue('inset-inline-start')}`);
      expect(cells(c), at).toEqual(cells(realRow));
      expect(c.style.getPropertyValue('inline-size'), at).toBe(realRow.style.getPropertyValue('inline-size'));
      // Text equal to the real row's, when that row is mounted.
      const real = [...t.host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')].find((r) => t.ctx.rowRenderer.keyOf(r) === key);
      if (real) {
        const text = (r: HTMLElement) => [...r.querySelectorAll<HTMLElement>('.dzg-cell')].map((x) => `${x.dataset['col']}=${x.textContent}`);
        const mine = new Set(text(c));
        expect(text(real).filter((x) => !mine.has(x) && (key !== fr || !x.startsWith(`${(t.g.kernel.focus as { column: string }).column}=`))), at).toEqual([]);
        expect(c.getAttribute('aria-selected'), at).toBe(real.getAttribute('aria-selected'));
        expect(c.hasAttribute('data-context-row'), at).toBe(real.hasAttribute('data-context-row'));
        expect(c.getAttribute('data-kind'), at).toBe(real.getAttribute('data-kind'));
      }
    });
    expect(document.activeElement?.closest('.dzg-sticky') ?? null, ctx).toBeNull();
  }
  /** The focused row: its top at or under the stack's bottom, its bottom inside the view. */
  function clear(ctx: string): void {
    const f = t.g.kernel.focus;
    if (f?.kind !== 'cell') return;
    const i = d().indexOf(f.row);
    if (i === -1) return;
    const at = i * h() - top();
    expect(at, `${ctx}: focused ${idOf(f.row)} at ${at}, stack ${t.ctx.inset}`).toBeGreaterThanOrEqual(t.ctx.inset ?? 0);
    expect(at + h(), `${ctx}: focused ${idOf(f.row)}`).toBeLessThanOrEqual(t.box.block);
  }
  const hscroll = (x: number) => {
    t.box.scrollInline = x;
    t.vp.dispatchEvent(new Event('scroll'));
  };
  return { ...t, d, top, copies, audit, clear, hscroll, h };
}

describe('copies against their real rows', () => {
  it('a narrow view: the copies mount the same column window as the rows, through a horizontal scroll', () => {
    const t = make({ inline: 400 });
    t.scroll(2 * 32 + 5);
    t.audit('start');
    for (const x of [130, 333, 600, 777]) {
      t.hscroll(x);
      t.audit(`hscroll ${x}`);
    }
  });

  it('pinned start and end columns, the selection box column: the copies keep the same segments', () => {
    const t = make({ inline: 500, settings: { selection: { mode: 'multi', checkbox: true } } });
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'name', pinned: 'start' }, { id: 'c7', pinned: 'end' }] }, 'user');
    t.scroll(2 * 32 + 5);
    t.audit('pinned');
    t.hscroll(400);
    t.audit('pinned + hscroll');
  });

  it('the tree column hidden, moved, pinned, resized: copies follow at the next paint', () => {
    const t = make({ inline: 500 });
    t.scroll(2 * 32 + 5);
    const steps: [string, Parameters<typeof t.g.kernel.dispatch>[0]][] = [
      ['resize name', { type: 'column.state', patch: [{ id: 'name', width: 230 }] }],
      ['resize n', { type: 'column.state', patch: [{ id: 'n', width: 55 }] }],
      ['move name last', { type: 'column.state', patch: [{ id: 'name', order: 99 }] }],
      ['hide name', { type: 'column.state', patch: [{ id: 'name', hidden: true }] }],
      ['show name', { type: 'column.state', patch: [{ id: 'name', hidden: false, order: 0 }] }],
      ['pin name end', { type: 'column.state', patch: [{ id: 'name', pinned: 'end' }] }],
    ];
    for (const [label, a] of steps) {
      t.g.kernel.dispatch(a, 'user');
      t.scroll(2 * 32 + 6);
      t.audit(label);
    }
  });

  it('density: copies take the new row height and the stack is the oracle’s at it', () => {
    const t = make();
    t.scroll(2 * 32 + 5);
    t.audit('comfortable');
    for (const density of ['compact', 'spacious', 'comfortable'] as const) {
      t.g.update({ density });
      t.audit(density);
      t.scroll(t.top() + 3);
      t.audit(`${density} scrolled`);
    }
  });

  it('a selection made while the stack does not move: the copy’s selected look follows', () => {
    const t = make({ settings: { selection: { mode: 'multi', checkbox: true } } });
    t.scroll(2 * 32 + 5);
    t.g.kernel.dispatch({ type: 'selection.toggle', row: k('S0.0') }, 'user');
    t.audit('selected');
    expect(t.copies()[1]!.getAttribute('aria-selected')).toBe('true');
  });

  it('path fillers: a filler pinned shows its label, as its row does', () => {
    type P = T & { path: string[] };
    const rows: P[] = [];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 4; c++) rows.push({ id: `x${a}${b}${c}`, parent: null, name: `leaf ${a}${b}${c}`, n: c, path: [`A${a}`, `B${a}${b}`, `leaf ${a}${b}${c}`] });
    const t = make({ rows, tree: { parentId: undefined, path: (r: T) => (r as P).path } as never });
    for (let y = 0; y < 30 * 32; y += 37) {
      t.scroll(y);
      t.audit(`path top ${y}`);
    }
    t.scroll(2 * 32 + 5);
    const labels = t.copies().map((c) => c.querySelector('.dzg-label')?.textContent ?? null);
    expect(labels).toEqual(['A0', 'B00']);
    for (const c of t.copies()) expect(c.getAttribute('data-kind')).toBe('group');
  });

  it('a lazy parent loading: its copy stays while the loading row is under the top', () => {
    const rows: (T & { lazy?: boolean })[] = [
      ...Array.from({ length: 3 }, (_, i): T => ({ id: `R${i}`, parent: null, name: `Root ${i}`, n: i })),
      { id: 'L', parent: null, name: 'Lazy', n: 9, lazy: true },
      ...Array.from({ length: 30 }, (_, i): T => ({ id: `Z${i}`, parent: null, name: `Tail ${i}`, n: i })),
    ];
    const lazy = lazyChildren<T>({ has: (r) => !!(r as { lazy?: boolean }).lazy, load: () => new Promise<readonly T[]>(() => {}) });
    const t = make({ rows, tree: { lazy, initial: 'none' } });
    t.expand(['L'], true, 'user');
    expect(t.d().nodeAt(4 as never).kind).toBe('loading');
    // Lazy at 96, its loading row at 128: inside the loading row, the copy pushed by Tail 0 at 160.
    for (const y of [97, 100, 128, 133, 150, 159, 160]) {
      t.scroll(y);
      t.audit(`lazy top ${y}`);
    }
    t.scroll(133);
    expect(t.copies().length).toBe(1);
  });
});

describe('the focus never under the stack, after any key', () => {
  const KEYS: [string, KeyboardEventInit?][] = [['ArrowUp'], ['ArrowUp'], ['ArrowDown'], ['PageUp'], ['PageDown'], ['Home', { ctrlKey: true }], ['End', { ctrlKey: true }], ['ArrowLeft'], ['ArrowRight'], ['Home'], ['End']];
  for (const sticky of [1, 2, 3]) {
    it(`sticky ${sticky}: 30 seeds × 40 keys from random scroll tops`, () => {
      for (let seed = 1; seed <= 30; seed++) {
        const t = make({ tree: { sticky }, inline: 450 });
        const R = rng(seed * 97 + sticky);
        const any = () => idOf(t.d().keyAt(Math.floor(R() * t.d().count) as never))!;
        t.focus(any(), R() < 0.5 ? 'name' : 'c3');
        for (let s = 0; s < 40; s++) {
          // A wheel scroll first (the focus may then be under the copies: the user's doing), then a key.
          if (R() < 0.4) t.scroll(Math.floor(R() * (t.d().count * 32 - 320)));
          const [key, mods] = KEYS[Math.floor(R() * KEYS.length)]!;
          const from = t.g.kernel.focus;
          t.press(key, mods);
          t.audit(`seed ${seed} key ${key}`);
          if (t.g.kernel.focus !== from) t.clear(`seed ${seed} sticky ${sticky} key ${mods?.ctrlKey ? 'Ctrl+' : ''}${key}`);
          if (t.g.kernel.focus?.kind !== 'cell') t.focus(any(), 'name');
        }
        cleanup();
      }
    });
  }

  it('a narrow view with a short block (cap 1): Up, PageUp onto rows under the copy', () => {
    const t = make({ block: 100, inline: 300 });
    t.scroll(10 * 32 + 7);
    t.focus(idOf(t.d().keyAt(12 as never))!);
    for (const key of ['ArrowUp', 'ArrowUp', 'PageUp', 'ArrowDown', 'PageDown', 'ArrowUp']) {
      const from = t.g.kernel.focus;
      t.press(key);
      t.audit(key);
      if (t.g.kernel.focus !== from) t.clear(key);
    }
  });
});

describe('scroll-into-view leaves exactly the room of the copies in effect', () => {
  it('sticky 1: a visit under its patient’s copy lands one row down, not two (its level)', () => {
    const t = make({ tree: { sticky: 1 } });
    // S0.0.1 (index 5, a leaf) at the top: Patient 0.0 alone pinned; Visit 0.0.2 (index 6, 192 px) under it.
    t.scroll(165);
    expect(t.copies().length).toBe(1);
    t.focus('S0.0.2', 'n');
    expect(t.top()).toBe(192 - 32);
    t.clear('sticky 1');
    t.audit('sticky 1');
  });

  it('sticky 2 and a Note (level 3): two rows of room, the nearest two ancestors pinned over it', () => {
    const t = make({ tree: { sticky: 2 } });
    t.scroll(4 * 32 + 1);
    // Note 0.0.0.1 (index 4) under the stack: two ancestors in effect.
    t.focus('S0.0.0.1', 'n');
    expect(t.top()).toBe(4 * 32 - 64);
    t.audit('sticky 2');
  });
});

describe('a walk mixing everything', () => {
  for (const [lang, sticky] of [['en', 3], ['ar', 2], ['en', 1]] as const) {
    it(`${lang}, sticky ${sticky}: 15 seeds × 70 steps`, () => {
      for (let seed = 1; seed <= 15; seed++) {
        const t = make({ lang, tree: { sticky }, inline: 420, settings: { selection: { mode: 'multi', checkbox: true, click: true } } });
        const R = rng(seed * 13 + sticky);
        const log: string[] = [];
        let nid = 0;
        const any = () => idOf(t.d().keyAt(Math.floor(R() * t.d().count) as never))!;
        const step = (label: string, fn: () => void) => {
          log.push(label);
          fn();
          t.audit(`${lang} sticky ${sticky} seed ${seed}: ${log.slice(-4).join(' | ')}`);
        };
        for (let s = 0; s < 70; s++) {
          const x = R();
          if (!t.d().count) break;
          if (x < 0.25) step('scroll', () => t.scroll(Math.floor(R() * Math.max(1, t.d().count * t.h() - t.box.block))));
          else if (x < 0.35) step('hscroll', () => t.hscroll(Math.floor(R() * 900)));
          else if (x < 0.42) {
            const id = COLS[Math.floor(R() * COLS.length)]!.id;
            const r = R();
            const patch = r < 0.25 ? { id, hidden: R() < 0.5 } : r < 0.5 ? { id, order: Math.floor(R() * 10) } : r < 0.75 ? { id, pinned: (['start', 'end', null] as const)[Math.floor(R() * 3)] } : { id, width: 50 + Math.floor(R() * 200) };
            step(`column ${JSON.stringify(patch)}`, () => t.g.kernel.dispatch({ type: 'column.state', patch: [patch] }, 'user'));
          } else if (x < 0.47) {
            const c = t.copies();
            if (c.length) step('collapse from a copy', () => click(c[Math.floor(R() * c.length)]!.querySelector<HTMLElement>('.dzg-toggle') ?? c[0]!));
          } else if (x < 0.52) {
            const c = t.copies();
            const cell = c.length ? c[Math.floor(R() * c.length)]!.querySelector<HTMLElement>('.dzg-cell[data-col]:not([data-col="name"])') : null;
            if (cell) {
              step('click a copy', () => click(cell));
              t.clear(`click a copy (${log.slice(-3).join(' | ')}, seed ${seed})`);
            }
          } else if (x < 0.57) step('sort', () => t.g.kernel.dispatch({ type: 'sort.toggle', column: R() < 0.5 ? 'n' : 'name', multi: false }, 'user'));
          else if (x < 0.61) step('filter', () => t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: R() < 0.5 ? null : { type: 'text', op: 'contains', value: ['Note', 'Visit', 'Patient 2', '.1'][Math.floor(R() * 4)]! } }, 'user'));
          else if (x < 0.67) {
            const id = any();
            const r = R();
            if (r < 0.4) step(`tx add under ${id}`, () => t.g.kernel.rows.applyTransaction({ add: [{ id: `X${nid++}`, parent: id, name: `Extra ${nid}`, n: 3 }] }));
            else if (r < 0.6) step(`tx remove ${id}`, () => t.g.kernel.rows.applyTransaction({ remove: [id] }));
            else step(`tx patch ${id}`, () => t.g.kernel.rows.applyTransaction({ patch: [{ id, set: { name: `Renamed ${id}` } }] }));
          } else if (x < 0.72) step('expand', () => t.expand([any()], R() < 0.7, 'user'));
          else if (x < 0.76) step('density', () => t.g.update({ density: (['compact', 'comfortable', 'spacious'] as const)[Math.floor(R() * 3)] }));
          else if (x < 0.79) step('select', () => t.g.kernel.dispatch({ type: 'selection.toggle', row: k(any()) }, 'user'));
          else {
            if (t.g.kernel.focus?.kind !== 'cell' || t.d().indexOf(t.g.kernel.focus.row) === -1) step('focus', () => t.focus(any(), 'n'));
            const key = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'ArrowLeft', 'ArrowRight', 'Home'][Math.floor(R() * 7)]!;
            const from = t.g.kernel.focus;
            step(`key ${key}`, () => t.press(key));
            if (t.g.kernel.focus !== from) t.clear(`key ${key} (${log.slice(-3).join(' | ')}, seed ${seed})`);
          }
        }
        cleanup();
      }
    });
  }
});

describe('destroy', () => {
  it('takes the layer, the copies and the inset away; nothing left in the header', () => {
    const t = make();
    t.scroll(2 * 32 + 5);
    expect(t.copies().length).toBeGreaterThan(0);
    const header = t.host.querySelector('.dzg-header');
    t.g.destroy();
    expect(t.host.querySelector('.dzg-sticky')).toBeNull();
    expect(header?.querySelector('.dzg-sticky') ?? null).toBeNull();
    expect(t.ctx.inset ?? 0).toBe(0);
    expect(t.ctx.insetFor).toBeUndefined();
  });
});

describe('suspected bugs', () => {
  // tree-sticky.md: « a row the keyboard moves onto is never left under the copies » and WCAG 2.4.11.
  // Closing a parent from its copy while the focus is in its subtree moves the focus to that parent
  // (the data's move), and the view keeps the parent at the top: under its own ancestors' copies.
  it('collapse from a copy with the focus inside: the focused parent is not left under Service 0’s copy', () => {
    const t = make();
    t.focus('S0.0.1', 'n');
    t.scroll(2 * 32 + 5);
    const tg = t.copies()[1]!.querySelector<HTMLElement>('.dzg-toggle')!;
    click(tg);
    expect(t.where()).toBe('S0.0/n');
    t.clear('collapse from a copy');
  });

  // Same through the keyboard: Left on an open parent the user scrolled under the stack (focus on it)
  // closes it; the anchoring puts it at the top, under Service 0's copy, with the focus on it.
  it('Left closing a focused parent: the parent is left clear of the copies', () => {
    const t = make();
    t.focus('S0.1', 'name');
    // Patient 0.1 (index 1 + 1 + 3 + 2 + 2 = 9 in deep(): S0, S0.0, its visits and notes) under the stack.
    const i = t.d().indexOf(k('S0.1'));
    t.scroll(i * 32 + 40);
    t.press('ArrowLeft');
    expect(t.g.kernel.expansion.has(k('S0.1'))).toBe(false);
    t.clear('Left collapse');
  });
});
