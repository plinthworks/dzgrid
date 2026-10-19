import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnOrGroup, FocusPos } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridContext } from '../src/context.js';
import { spans } from '../src/spans.js';
import { EN } from '../src/locales/en.js';

/**
 * Property checks of the group rows (coverage review of step 9b, commit 4):
 * random group trees (depth 1 to 4, some leaves ungrouped, some groups and
 * leaves without a header), pins, hides, moves, resizes, right to left, the
 * selection box and the column window from the scroll. After every paint:
 *
 * - each group row holds one header per column the column header row holds
 *   (plus the focused group's first column, kept out of the window), in
 *   column order, in its segment: the group cell at the first mounted column
 *   of each piece, a hidden header elsewhere;
 * - a group cell's aria-colindex is its first column's, aria-colspan its
 *   piece's size, its width the sum of its columns', its place its first
 *   column's (after the box in the start segment); a hidden header's index is
 *   its own column's, its text the group's, or the column's where none stands;
 * - each column header is stretched over exactly the levels with no group
 *   over it (those are the bottom ones);
 * - random keys in the header rows never land on a hidden header, the
 *   focused element is the kernel's focus and the only tab stop; an arrow
 *   that moved inside the header is undone by the opposite one, and Down
 *   after Ups comes back to the column the keys came up from.
 */
type R = { id: string; n: number };
const H = 32;
const CHECK = 40;
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (n: number) => Math.floor(next() * n), pick: <X,>(xs: readonly X[]) => xs[Math.floor(next() * xs.length)]! };
}
type Rng = ReturnType<typeof rng>;

interface Tree { columns: ColumnOrGroup<R>[]; leaves: string[]; chain: Map<string, { id: string; label: string }[]>; depth: number }

function genTree(r: Rng): Tree {
  for (;;) {
    const maxDepth = 1 + r.int(4);
    let nl = 0;
    let ng = 0;
    const leaves: string[] = [];
    const chain = new Map<string, { id: string; label: string }[]>();
    let depth = 0;
    const level = (count: number, left: number, up: { id: string; label: string }[]): ColumnOrGroup<R>[] => {
      const out: ColumnOrGroup<R>[] = [];
      while (count > 0) {
        const take = 1 + r.int(Math.min(count, 4));
        count -= take;
        if (left > 0 && r.next() < 0.65) {
          const id = `g${ng++}`;
          const label = r.next() < 0.8 ? `G-${id}` : '';
          const next = [...up, { id, label }];
          depth = Math.max(depth, next.length);
          out.push({ id, ...(label ? { header: label } : {}), children: level(take, left - 1, next) });
        } else {
          for (let i = 0; i < take; i++) {
            const id = `c${nl++}`;
            leaves.push(id);
            chain.set(id, up);
            out.push({ id, ...(r.next() < 0.8 ? { header: id.toUpperCase() } : {}), width: 40 + 20 * r.int(7), value: (x: R) => `${id}:${x.n}` });
          }
        }
      }
      return out;
    };
    const columns = level(3 + r.int(10), maxDepth, []);
    if (depth) return { columns, leaves, chain, depth };
  }
}

interface Frag { group: string; label: string; first: number; count: number }

function make(r: Rng, t: Tree) {
  const check = r.next() < 0.4;
  const rtl = r.next() < 0.4;
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 200, inline: r.pick([150, 250, 400, 900]), scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const g = createGrid<R>(host, {
    rows: Array.from({ length: 20 }, (_, n) => ({ id: `r${n}`, n })), getRowId: (x) => x.id, columns: t.columns, messages: EN, features: [spans()],
    ...(check ? { selection: { mode: 'multi' as const, checkbox: true } } : {}), ...(rtl ? { direction: 'rtl' as const } : {}),
  }, { geometry, sync: true });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const ctx = (g as unknown as { context: GridContext<R> }).context;
  const scroll = (x: number) => { box.scrollInline = x; vp.dispatchEvent(new Event('scroll')); };
  return { g, host, ctx, check, rtl, box, scroll, t };
}
type M = ReturnType<typeof make>;

/** The visible columns, start, centre, end; per level, the pieces (an oracle of our own, from the tree). */
function model(m: M) {
  const L = m.ctx.columns.layout;
  const vis = ([L.start, L.center, L.end] as const).flatMap((s, si) => s.columns.map((c, i) => ({ id: c.id, si, i, header: c.def.header as string | undefined, off: s.widths.offsetOf(i), w: s.widths.sizeAt(i) })));
  const levels: Frag[][] = [];
  for (let k = 0; k < m.t.depth; k++) {
    const row: Frag[] = [];
    let open: Frag | null = null;
    let seg = -1;
    vis.forEach((v, c) => {
      if (v.si !== seg) { seg = v.si; open = null; }
      const gk = m.t.chain.get(v.id)?.[k];
      if (!gk) open = null;
      else if (open && open.group === gk.id) open.count++;
      else row.push((open = { group: gk.id, label: gk.label, first: c, count: 1 }));
    });
    levels.push(row);
  }
  const at = (k: number, c: number) => levels[k]!.find((f) => f.first <= c && c < f.first + f.count);
  const colIndex = (id: string) => vis.findIndex((v) => v.id === id) + 1 + (m.check ? 1 : 0);
  return { vis, levels, at, colIndex };
}

const rowsOf = (m: M) => [...m.host.querySelectorAll<HTMLElement>('.dzg-header > [role=row]')];
const SEGS = ['start', 'center', 'end'];
/** A row's cells in segment order, the box left out. */
const cellsOf = (row: HTMLElement) => SEGS.flatMap((s, si) => [...row.querySelector(`.dzg-seg-${s}`)!.children].filter((e) => !e.classList.contains('dzg-check')).map((el) => ({ el: el as HTMLElement, si })));

function checkPaint(m: M, why: string): void {
  const { vis, at, colIndex } = model(m);
  const D = m.t.depth;
  const rows = rowsOf(m);
  expect(rows.length, why).toBe(D + 1);
  const leafRow = rows[D]!;
  const mounted = cellsOf(leafRow).map(({ el }) => vis.findIndex((v) => v.id === el.dataset['col']));
  expect(mounted.every((c) => c >= 0), why).toBe(true);
  const focus = m.g.kernel.focus;
  for (let k = 0; k < D; k++) {
    const level = k - D;
    const cols = [...mounted];
    // The focused group's first column stays mounted in its row (centre only).
    if (focus?.kind === 'header' && focus.level === level) {
      const fc = vis.findIndex((v) => v.id === focus.column);
      const f = fc >= 0 ? at(k, fc) : undefined;
      // (a column moved meanwhile: the focus is on a column of the piece, not its first; the piece's first is kept.)
      if (f && vis[f.first]!.si === 1 && !cols.includes(f.first)) { cols.push(f.first); cols.sort((a, b) => a - b); }
    }
    const want: unknown[] = [];
    let prev: Frag | undefined;
    for (const c of cols) {
      const f = at(k, c);
      const head = f && f !== prev;
      prev = f;
      const v = vis[c]!;
      if (head) {
        const first = vis[f.first]!;
        const span = vis.slice(f.first, f.first + f.count);
        want.push({ g: true, si: first.si, col: first.id, level: String(level), colindex: String(colIndex(first.id)), colspan: String(f.count), text: f.label || f.group,
          w: `${span.reduce((s, x) => s + x.w, 0)}px`, at: `${first.off + (first.si === 0 && m.check ? CHECK : 0)}px` });
      } else want.push({ g: false, si: v.si, colindex: String(colIndex(v.id)), text: f ? f.label || f.group : v.header ?? v.id });
    }
    const got = cellsOf(rows[k]!).map(({ el, si }) => {
      expect(el.getAttribute('role'), why).toBe('columnheader');
      if (el.classList.contains('dzg-hgroup')) {
        return { g: true, si, col: el.dataset['col'], level: el.dataset['level'], colindex: el.getAttribute('aria-colindex'), colspan: el.getAttribute('aria-colspan'), text: el.textContent,
          w: el.style.getPropertyValue('inline-size'), at: el.style.getPropertyValue('inset-inline-start') };
      }
      expect(el.classList.contains('dzg-hslot') && !el.hasAttribute('tabindex') && !el.hasAttribute('aria-colspan'), why).toBe(true);
      return { g: false, si, colindex: el.getAttribute('aria-colindex'), text: el.textContent };
    });
    expect(got, `${why}: row ${level} cols ${JSON.stringify(cols.map((c) => vis[c]!.id))} vis ${JSON.stringify(vis.map((v) => v.id + ':' + v.si))} frags ${JSON.stringify(model(m).levels[k])}`).toEqual(want);
    // The box keeps its column in each group row.
    const startFirst = rows[k]!.querySelector('.dzg-seg-start')!.firstElementChild;
    expect(!!startFirst?.classList.contains('dzg-check'), why).toBe(m.check);
  }
  // Column headers stretched over exactly their empty levels, which are the bottom ones.
  for (const { el } of cellsOf(leafRow)) {
    const c = vis.findIndex((v) => v.id === el.dataset['col']);
    let up = 0;
    for (let k = 0; k < D; k++) if (!at(k, c)) up++;
    for (let k = 0; k < D - up; k++) expect(at(k, c), why).toBeDefined();
    expect([el.hasAttribute('data-up'), el.style.getPropertyValue('--dzg-up')], `${why}: up ${el.dataset['col']}`).toEqual(up ? [true, `${up * H}px`] : [false, '']);
  }
}

function mutate(r: Rng, m: M): string {
  const { vis } = model(m);
  const id = r.pick(m.t.leaves);
  switch (r.int(6)) {
    case 0: {
      const pinned = r.pick(['start', 'end', null] as const);
      m.g.kernel.dispatch({ type: 'column.state', patch: [{ id, pinned }] }, 'user');
      return `pin ${id} ${pinned}`;
    }
    case 1: {
      const hidden = !(vis.length > 2 && vis.some((v) => v.id === id));
      m.g.kernel.dispatch({ type: 'column.state', patch: [{ id, hidden: !hidden }] }, 'user');
      return `hide ${id} ${!hidden}`;
    }
    case 2: {
      const order = r.int(m.t.leaves.length);
      m.g.kernel.dispatch({ type: 'column.state', patch: [{ id, order }] }, 'user');
      return `order ${id} ${order}`;
    }
    case 3: {
      const width = 40 + 30 * r.int(6);
      m.g.kernel.dispatch({ type: 'column.resize', column: id, width, finished: true }, 'user');
      return `resize ${id} ${width}`;
    }
    default: {
      const x = r.int(Math.max(1, m.ctx.columns.layout.center.width));
      m.scroll(x);
      return `scroll ${x}`;
    }
  }
}

const KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'] as const;
const OPP: Record<string, string> = { ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp', ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft' };
const press = (key: string) => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const inHeader = (f: FocusPos | null): f is FocusPos & { kind: 'header' } => f?.kind === 'header';

function checkFocus(m: M, why: string): void {
  const f = m.g.kernel.focus;
  const a = document.activeElement as HTMLElement;
  expect(a.classList.contains('dzg-hslot'), `${why}: on a hidden header`).toBe(false);
  expect(m.host.contains(a), `${why}: focus lost`).toBe(true);
  // The select-all box takes the DOM focus inside its cell (the grid's own, not the group rows').
  if (!inHeader(f) || a.closest('.dzg-check')) return;
  const { vis, at } = model(m);
  const level = f.level ?? 0;
  const c = vis.findIndex((v) => v.id === f.column);
  if (level < 0) {
    const fr = at(level + m.t.depth, c);
    expect(fr, `${why}: a group row with no group over ${f.column}`).toBeDefined();
    expect(fr!.first, `${why}: a group's focus is its first column`).toBe(c);
    expect([a.classList.contains('dzg-hgroup'), a.dataset['col'], a.dataset['level']], why).toEqual([true, f.column, String(level)]);
  } else expect([a.classList.contains('dzg-hgroup'), a.dataset['col']], `${why} ${a.outerHTML.slice(0, 200)}`).toEqual([false, f.column]);
  expect([...m.host.querySelectorAll<HTMLElement>('[tabindex="0"]')].map((e) => e.outerHTML.slice(0, 160)), `${why}: roving; active ${a.outerHTML.slice(0, 160)}`).toEqual([a.outerHTML.slice(0, 160)]);
}

function focusSomeHeader(r: Rng, m: M): boolean {
  const rows = rowsOf(m);
  const pool = rows.flatMap((row) => cellsOf(row).map(({ el }) => el).filter((el) => !el.classList.contains('dzg-hslot')));
  if (!pool.length) return false;
  r.pick(pool).focus();
  return true;
}

const SEEDS = Array.from({ length: 160 }, (_, i) => i + 1);

describe('group rows: property checks over random trees', () => {
  it('every paint: one header per column per group row, spans, indexes, widths, places, stretching', () => {
    for (const seed of SEEDS) {
      const r = rng(seed);
      const t = genTree(r);
      const m = make(r, t);
      const log = [`seed ${seed} depth ${t.depth} ${m.rtl ? 'rtl' : 'ltr'}${m.check ? ' box' : ''} view ${m.box.inline}`];
      checkPaint(m, log.join(' / '));
      for (let i = 0, n = 2 + r.int(6); i < n; i++) {
        log.push(mutate(r, m));
        checkPaint(m, log.join(' / '));
      }
      // A focused group kept out of the window.
      if (focusSomeHeader(r, m)) {
        log.push(`focus ${JSON.stringify(m.g.kernel.focus)}`);
        for (let i = 0; i < 3; i++) {
          if (m.g.kernel.focus?.kind === 'header' && (m.g.kernel.focus.level ?? 0) === 0) break;
          log.push(mutate(r, m));
          checkPaint(m, log.join(' / '));
        }
      }
      m.g.destroy();
    }
  });

  it('keys: never on a hidden header; the focus is the element; an arrow that moved is undone by the opposite', () => {
    for (const seed of SEEDS) {
      const r = rng(seed * 7919);
      const t = genTree(r);
      const m = make(r, t);
      const log = [`seed ${seed} depth ${t.depth} ${m.rtl ? 'rtl' : 'ltr'}${m.check ? ' box' : ''} view ${m.box.inline}`];
      for (let i = 0, n = r.int(4); i < n; i++) log.push(mutate(r, m));
      if (!focusSomeHeader(r, m)) continue;
      log.push(`focus ${JSON.stringify(m.g.kernel.focus)}`);
      for (let i = 0; i < 25; i++) {
        const key = r.pick(KEYS);
        const before = m.g.kernel.focus;
        press(key);
        const after = m.g.kernel.focus;
        log.push(`${key} -> ${JSON.stringify(after)}`);
        const why = log.join(' / ');
        checkFocus(m, why);
        checkPaint(m, why);
        if (!inHeader(after)) {
          // Left the header (Down into the body): back up to it.
          press('ArrowUp');
          log.push(`ArrowUp -> ${JSON.stringify(m.g.kernel.focus)}`);
          checkFocus(m, log.join(' / '));
          continue;
        }
        const vertical = key === 'ArrowUp' || key === 'ArrowDown';
        if (OPP[key] && inHeader(before) && JSON.stringify(before) !== JSON.stringify(after) && (vertical || ((before.level ?? 0) < 0 && (after.level ?? 0) < 0))) {
          press(OPP[key]!);
          log.push(`${OPP[key]} -> ${JSON.stringify(m.g.kernel.focus)}`);
          expect(m.g.kernel.focus, `${log.join(' / ')}: not undone`).toEqual(before);
          checkFocus(m, log.join(' / '));
        }
      }
      m.g.destroy();
    }
  });

  it('Down after Ups comes back to the column the keys came up from, at any depth, pinned or not', () => {
    for (const seed of SEEDS) {
      const r = rng(seed * 104729);
      const t = genTree(r);
      const m = make(r, t);
      const log = [`seed ${seed} depth ${t.depth}`];
      for (let i = 0, n = r.int(4); i < n; i++) log.push(mutate(r, m));
      const leaves = cellsOf(rowsOf(m)[t.depth]!).map(({ el }) => el);
      const leaf = r.pick(leaves);
      leaf.focus();
      const start = m.g.kernel.focus;
      expect(start, log.join(' / ')).toEqual({ kind: 'header', column: leaf.dataset['col'] });
      let ups = 0;
      const n = 1 + r.int(t.depth + 1);
      for (let i = 0; i < n; i++) {
        const b = JSON.stringify(m.g.kernel.focus);
        press('ArrowUp');
        if (JSON.stringify(m.g.kernel.focus) !== b) ups++;
        checkFocus(m, `${log.join(' / ')} up ${i}`);
      }
      const { at, vis } = model(m);
      const c = vis.findIndex((v) => v.id === leaf.dataset['col']);
      let groupsOver = 0;
      for (let k = 0; k < t.depth; k++) if (at(k, c)) groupsOver++;
      expect(ups, log.join(' / ')).toBe(Math.min(groupsOver, n));
      for (let i = 0; i < ups; i++) press('ArrowDown');
      expect(m.g.kernel.focus, `${log.join(' / ')} ups ${ups}`).toEqual(start);
      // The same column's header (the element may have been made again: it left the window meanwhile).
      expect((document.activeElement as HTMLElement).dataset['col'], log.join(' / ')).toBe(leaf.dataset['col']);
      expect((document.activeElement as HTMLElement).classList.contains('dzg-hgroup'), log.join(' / ')).toBe(false);
      m.g.destroy();
    }
  });
});

describe('group rows: a focused column header kept out of the window', () => {
  // BUG (found by this review): the column headers keep the focused one mounted out of the
  // window (D6), the group rows do not (their keep is only for a focused group), so each group
  // row holds one header fewer than the column header row and pairing by position is off.
  it('each group row still holds a header in its column', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const r = rng(seed * 31);
      const t = genTree(r);
      const m = make(r, t);
      const L = m.ctx.columns.layout;
      if (L.center.columns.length < 6 || m.box.inline > 400) continue;
      const first = rowsOf(m)[t.depth]!.querySelector<HTMLElement>('.dzg-seg-center > .dzg-hcell')!;
      first.focus();
      m.scroll(L.center.width);
      expect(first.isConnected, `seed ${seed}`).toBe(true);
      checkPaint(m, `seed ${seed} depth ${t.depth}: ${first.dataset['col']} focused, scrolled away`);
    }
  });
});

describe('group rows: the remembered column and the tree read again (targeted)', () => {
  const leaf = (id: string) => ({ id, header: id.toUpperCase(), width: 100, value: (x: R) => `${id}${x.n}` });
  const TREE: ColumnOrGroup<R>[] = [
    { id: 'patient', header: 'Patient', children: [leaf('nom'), leaf('prenom'), leaf('age')] },
    { id: 'clinique', header: 'Clinique', children: [{ id: 'constantes', header: 'Constantes', children: [leaf('tension'), leaf('pouls'), leaf('temp')] }, leaf('note')] },
    leaf('entree'),
  ];
  function grid(columns: ColumnOrGroup<R>[]) {
    const box = { block: 320, inline: 1200, scrollTop: 0, scrollInline: 0 };
    const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
    const host = document.createElement('div');
    document.body.append(host);
    const g = createGrid<R>(host, { rows: Array.from({ length: 5 }, (_, n) => ({ id: `r${n}`, n })), getRowId: (x) => x.id, columns, messages: EN, features: [spans()] }, { geometry, sync: true });
    grids.push(g);
    const leafCell = (id: string) => host.querySelector<HTMLElement>(`.dzg-header .dzg-hcell[data-col="${id}"]:not(.dzg-hgroup)`)!;
    const groupCell = (col: string, level: number) => host.querySelector<HTMLElement>(`.dzg-hgroup[data-col="${col}"][data-level="${level}"]`)!;
    return { g, host, leafCell, groupCell };
  }

  it('a remembered column now just past the focused piece is not aimed at (pinned meanwhile)', () => {
    const { g, leafCell, groupCell } = grid(TREE);
    leafCell('note').focus();
    press('ArrowUp');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'tension', level: -2 });
    // temp pinned at the end: the centre piece of Clinique is tension, pouls, note; entree stands
    // where the remembered index points, just past it.
    g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'temp', pinned: 'end' }] }, 'user');
    groupCell('tension', -2).focus();
    press('ArrowDown');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'tension', level: -1 });
  });

  it('Up from a column header after its column moved: its own groups, not those at the old index', () => {
    const { g, leafCell } = grid(TREE);
    leafCell('nom').focus();
    press('ArrowUp');
    press('ArrowDown');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'nom' });
    g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'nom', pinned: 'end' }] }, 'user');
    leafCell('nom').focus();
    press('ArrowUp');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'nom', level: -2 });
  });

  it('the same columns grouped otherwise (update): the new groups show', () => {
    const { g, host } = grid(TREE);
    g.update({ columns: [{ id: 'tout', header: 'Tout', children: [leaf('nom'), leaf('prenom'), leaf('age'), leaf('tension'), leaf('pouls'), leaf('temp'), leaf('note')] }, leaf('entree')] });
    const top = [...host.querySelectorAll<HTMLElement>('.dzg-hgroup[data-level="-2"]')].map((e) => [e.textContent, e.getAttribute('aria-colspan')]);
    expect(top).toEqual([['Tout', '7']]);
    expect(host.querySelectorAll('.dzg-hgroup[data-level="-1"]').length).toBe(0);
  });
});

describe('group rows: regrouped with the same column objects', () => {
  it('only the groups change (no column does): the new groups show', () => {
    const L = ['a', 'b', 'c', 'd'].map((id) => ({ id, header: id.toUpperCase(), width: 100, value: (x: R) => `${id}${x.n}` }));
    const box = { block: 320, inline: 1200, scrollTop: 0, scrollInline: 0 };
    const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
    const host = document.createElement('div');
    document.body.append(host);
    const g = createGrid<R>(host, { rows: [{ id: 'r0', n: 0 }], getRowId: (x) => x.id, columns: [{ id: 'x', header: 'X', children: [L[0]!, L[1]!] }, L[2]!, L[3]!], messages: EN, features: [spans()] }, { geometry, sync: true });
    grids.push(g);
    const shown = () => [...host.querySelectorAll<HTMLElement>('.dzg-hgroup')].map((e) => [e.textContent, e.dataset['col'], e.getAttribute('aria-colspan')]);
    expect(shown()).toEqual([['X', 'a', '2']]);
    g.update({ columns: [L[0]!, { id: 'y', header: 'Y', children: [L[1]!, L[2]!, L[3]!] }] });
    expect(shown()).toEqual([['Y', 'b', '3']]);
    expect(host.querySelector<HTMLElement>('.dzg-hcell[data-col="a"]:not(.dzg-hgroup)')!.style.getPropertyValue('--dzg-up')).toBe(`${H}px`);
    expect(host.querySelector<HTMLElement>('.dzg-hcell[data-col="d"]:not(.dzg-hgroup)')!.hasAttribute('data-up')).toBe(false);
  });
});
