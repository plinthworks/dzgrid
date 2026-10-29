// A DOM random walk over a tree grid (review of phase 4 step 4): keys, toggle clicks, filters,
// sorts, transactions, scrolls that pool rows, the tree column moved / hidden / pinned, an outside
// input, API openings; after every step the rendered rows against an oracle from the model.
import { describe, it, expect, afterEach } from 'vitest';
import type { GridEvent, Problem, RowKey } from '@dzgrid/core';
import type { TreeRows } from '@dzgrid/core/tree';
import { cleanup, click, idOf, k, tmake, type T } from './support-tree.js';

afterEach(cleanup);

/** 12 services × 3 patients × 2 visits (84 rows): enough to pool rows in a 320 px view. */
const deep = (): T[] => {
  const out: T[] = [];
  let n = 0;
  for (let s = 0; s < 12; s++) {
    out.push({ id: `S${s}`, parent: null, name: `Service ${s}`, n: n++ % 7 });
    for (let p = 0; p < 3; p++) {
      out.push({ id: `S${s}.${p}`, parent: `S${s}`, name: `Patient ${s}.${p}`, n: n++ % 7 });
      for (let v = 0; v < 2; v++) out.push({ id: `S${s}.${p}.${v}`, parent: `S${s}.${p}`, name: `Visit ${s}.${p}.${v}`, n: n++ % 7 });
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

const TREE_SAID = /expanded|collapsed/;
type Opt = { lang: 'en' | 'ar'; column?: 'name'; raf: boolean; seed: number };

function walk(o: Opt, steps: number) {
  const frames: (() => void)[] = [];
  const raf = { requestAnimationFrame: (f: FrameRequestCallback) => { frames.push(() => f(0)); return frames.length; }, cancelAnimationFrame: () => {} };
  const flush = () => { for (let i = 0; i < 8 && frames.length; i++) frames.splice(0).forEach((f) => f()); };
  const t = tmake({ rows: deep(), lang: o.lang, tree: o.column ? { column: o.column } : {}, ...(o.raf && { raf }) });
  flush();
  const R = rng(o.seed);
  const pick = <X,>(xs: readonly X[]): X => xs[Math.floor(R() * xs.length)]!;
  const outside = document.createElement('input');
  document.body.append(outside);
  const [forward, back] = o.lang === 'ar' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft'];
  let gridFocus: boolean | null = null;
  let nextId = 0;
  const log: string[] = [];
  const d = () => t.g.kernel.rows.displayed as TreeRows<T>;
  const treeCol = () => o.column ?? t.ctx.columns.visible()[0]?.id;
  const userEvents = () => t.events.filter((e): e is Extract<GridEvent<T>, { type: 'rowExpanded' }> => e.type === 'rowExpanded' && e.source === 'user');
  const treeSaid = () => t.said().filter((s) => TREE_SAID.test(s) || /توسيع|طي/.test(s));
  const notFirstTold = () => t.events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: Problem[] }).problems).filter((p) => p.code === 'tree-column-not-first').length;
  const notFirstNow = () => { const v = t.ctx.columns.visible().map((c) => c.id); return o.column !== undefined && v[0] !== o.column && v.includes(o.column); };
  /** The visible orders already told (owner demo, step 16: once per order, never again for one seen). */
  const toldOrders = new Set<string>();
  if (notFirstNow()) toldOrders.add(`${t.ctx.columns.visible().map((c) => c.id)}`);
  const mounted = () => [...t.host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')].filter((r) => t.ctx.rowRenderer.keyOf(r) !== undefined && r.isConnected);

  /** The oracle: level from the parent chain, place and count among the siblings shown, open state. */
  function check(where: string): void {
    const m = d();
    const sib = new Map<RowKey | null, RowKey[]>();
    for (let i = 0; i < m.count; i++) {
      const key = m.keyAt(m.index(i)!);
      const p = m.parentOf(key);
      if (!sib.has(p)) sib.set(p, []);
      sib.get(p)!.push(key);
    }
    const col = treeCol();
    for (const r of mounted()) {
      const key = t.ctx.rowRenderer.keyOf(r)!;
      const i = m.indexOf(key);
      if (i === -1) continue;
      let level = 1;
      for (let p = m.parentOf(key); p !== null; p = m.parentOf(p)) level++;
      const sibs = sib.get(m.parentOf(key))!;
      const kids = m.childrenAt(i) > 0;
      const next = i + 1 < m.count ? m.keyAt(m.index(i + 1)!) : null;
      const open = kids && next !== null && m.parentOf(next) === key;
      const id = idOf(key);
      expect([r.getAttribute('aria-level'), r.getAttribute('aria-posinset'), r.getAttribute('aria-setsize'), r.getAttribute('aria-expanded')], `${where}: ${id}`)
        .toEqual([String(level), String(sibs.indexOf(key) + 1), String(sibs.length), kids ? String(open) : null]);
      expect(r.hasAttribute('data-context-row'), `${where}: muted ${id}`).toBe(!m.matchedAt(i));
      for (const c of r.querySelectorAll<HTMLElement>('.dzg-cell')) {
        const tg = c.querySelector(':scope > .dzg-toggle');
        if (c.dataset['col'] === col) {
          expect(c.firstElementChild, `${where}: toggle ${id}`).toBe(tg);
          expect(tg, `${where}: toggle ${id}`).not.toBeNull();
          expect(tg!.hasAttribute('data-leaf'), `${where}: leaf ${id}`).toBe(!kids);
          expect(tg!.hasAttribute('data-open'), `${where}: open ${id}`).toBe(open);
          expect(c.style.paddingInlineStart, `${where}: pad ${id}`).toBe(`calc(var(--dzg-cell-padding-inline, 0.5rem) + ${(level - 1) * 16}px)`);
          expect(c.textContent, `${where}: text ${id}`).toBe(col === 'name' ? t.g.kernel.rows.row(key)!.data.name : c.textContent);
        } else {
          expect(c.querySelector('.dzg-toggle'), `${where}: stale toggle ${id}/${c.dataset['col']}`).toBeNull();
          expect(c.style.paddingInlineStart, `${where}: stale pad ${id}/${c.dataset['col']}`).toBe('');
        }
      }
    }
    // No toggle anywhere but first in a tree cell of a mounted row.
    for (const tg of t.host.querySelectorAll<HTMLElement>('.dzg-toggle')) {
      const c = tg.parentElement!;
      expect(c.dataset['col'], `${where}: toggle in ${c.dataset['col']}`).toBe(col);
      expect(c.firstElementChild).toBe(tg);
    }
    // The focus: in the grid on the focused cell, or still on the outside input.
    const a = document.activeElement as HTMLElement;
    if (gridFocus === false) expect(a, `${where}: focus stolen from outside`).toBe(outside);
    if (process.env['WALK_HASFOCUS'] && !t.vp.contains(a)) expect(t.ctx.hasFocus, `${where}: hasFocus stale (active ${a.tagName})`).toBe(false);
    else if (gridFocus) {
      expect(t.vp.contains(a), `${where}: focus lost (${a.tagName}.${a.className})`).toBe(true);
      const f = t.g.kernel.focus;
      if (f?.kind === 'cell') expect(t.where(), `${where}: dom focus`).toBe(`${idOf(f.row)}/${f.column}`);
    }
    expect(t.vp.getAttribute('role')).toBe('treegrid');
  }

  /** Runs `act`; checks the anchor when only an opening or closing happened, and what was said. */
  function step(name: string, user: boolean, act: () => void): void {
    log.push(name);
    const where = log.slice(-(Number(process.env['WALK_LOG']) || 6)).join(' > ');
    const ev = userEvents().length;
    const said = treeSaid().length;
    const all = t.events.filter((e) => e.type === 'rowExpanded').length;
    const s = t.ctx.scroll;
    const L = t.ctx.layout!;
    const topI = d().count ? L.indexAt(s.logicalTop) : null;
    const top = topI === null ? null : { key: d().keyAt(topI), delta: s.logicalTop - L.offsetOf(topI), atTop: s.atTop };
    const told = notFirstTold();
    act();
    flush();
    check(where);
    const fresh = userEvents().slice(ev);
    const expectSaid = user ? fresh.filter((e) => e.rows.length === 1 || e.expanded).length : 0;
    expect(treeSaid().length - said, `${where}: said ${JSON.stringify(treeSaid().slice(said))}`).toBe(expectSaid);
    if (!user) expect(fresh.length, `${where}: user events from a host step`).toBe(0);
    const order = `${t.ctx.columns.visible().map((c) => c.id)}`;
    const fresh1 = notFirstNow() && !toldOrders.has(order);
    if (fresh1) toldOrders.add(order);
    expect(notFirstTold() - told, `${where}: not-first told`).toBe(fresh1 ? 1 : 0);
    // An opening or closing only (no scroll, no row added): the top row stays where it was.
    const onlyExpand = /^(api expand|key (fwd|back|\*)|click)/.test(name) && t.events.filter((e) => e.type === 'rowExpanded').length > all;
    if (onlyExpand && top) {
      const i = d().indexOf(top.key);
      if (top.atTop) expect(s.logicalTop, `${where}: top kept at top`).toBe(0);
      else if (i !== -1 && name !== 'key back(parent)') {
        const want = Math.min(t.ctx.layout!.offsetOf(i) + top.delta, s.mapper!.maxLogical);
        expect(s.logicalTop, `${where}: top row ${idOf(top.key)} kept`).toBe(Math.max(0, want));
      }
    }
  }

  const mountedKeys = () => mounted().map((r) => t.ctx.rowRenderer.keyOf(r)!).filter((x) => d().indexOf(x) !== -1);
  const ensureGridFocus = () => {
    if (gridFocus === true && t.vp.contains(document.activeElement)) return;
    const keys = mountedKeys();
    if (!keys.length) return;
    const cols = t.ctx.columns.visible().map((c) => c.id);
    const cell = t.cell(idOf(pick(keys))!, pick(cols));
    if (!cell) return;
    cell.focus();
    gridFocus = true;
    flush();
  };

  check('start');
  for (let n = 0; n < steps; n++) {
    const r = R();
    if (r < 0.3) {
      ensureGridFocus();
      if (!t.vp.contains(document.activeElement)) continue;
      const key = pick([forward, forward, back, back, '*', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'ctrl Home', 'ctrl End']);
      const f = t.g.kernel.focus;
      const m = d();
      const parentMove = key === back && f?.kind === 'cell' && f.column === treeCol() && !(m.childrenAt(m.indexOf(f.row) as never) > 0 && m.expandedAt(m.indexOf(f.row) as never));
      const label = key === forward ? 'fwd' : key === back ? (parentMove ? 'back(parent)' : 'back') : key;
      // Now and then a modifier the tree must leave alone (Ctrl, Alt, Meta): nothing opens or closes.
      const mod = [forward, back, '*'].includes(key) && R() < 0.2 ? pick(['ctrlKey', 'altKey', 'metaKey'] as const) : null;
      const inTree = f?.kind === 'cell' && f.column === treeCol() && !mod;
      // `*` in the tree column: every closed sibling shown that has children opens (under a filter the
      // ancestors of matches are shown open already, so none), nothing else changes.
      // The open state shown (under a filter the model keeps the filter's own openings apart from kernel.expansion).
      const openShown = () => { const x = d(); return new Map(Array.from({ length: x.count }, (_, i) => [x.keyAt(i as never), x.expandedAt(i as never)] as const)); };
      const before = openShown();
      const sibs = key === '*' && inTree && f?.kind === 'cell'
        ? Array.from({ length: m.count }, (_, i) => i as never).filter((i) => m.parentOf(m.keyAt(i)) === m.parentOf(f.row) && m.childrenAt(i) > 0 && !m.expandedAt(i)).map((i) => m.keyAt(i))
        : null;
      const evs = t.events.length;
      let ev: KeyboardEvent | null = null;
      step(`key ${mod ? mod + ' ' : ''}${label}`, true, () => {
        const name = key.startsWith('ctrl ') ? key.slice(5) : key;
        ev = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ctrlKey: key.startsWith('ctrl '), ...(mod && { [mod]: true }) });
        t.active().dispatchEvent(ev);
      });
      const opened = t.events.slice(evs).filter((e) => e.type === 'rowExpanded');
      if (mod) expect(opened, `${log.slice(-6).join(' > ')}: ${mod} opened`).toEqual([]);
      if (sibs) {
        expect(ev!.defaultPrevented, `* prevented`).toBe(true);
        const want = new Map(before);
        for (const x of sibs) want.set(x, true);
        const after = openShown();
        expect(new Map([...before.keys()].map((x) => [x, after.get(x)] as const)), `${log.slice(-6).join(' > ')}: * siblings of ${idOf((f as { row: RowKey }).row)} (active ${t.where()}) sibs ${sibs.map(idOf)} events ${JSON.stringify(opened)}`).toEqual(want);
      }
    } else if (r < 0.42) {
      const tgs = [...t.host.querySelectorAll<HTMLElement>('.dzg-toggle:not([data-leaf])')];
      if (!tgs.length) continue;
      const tg = pick(tgs);
      step(`click ${idOf(t.ctx.rowRenderer.keyOf(tg.closest('.dzg-row')!))}`, true, () => click(tg));
    } else if (r < 0.52) {
      const m = d();
      const parents = Array.from({ length: m.count }, (_, i) => i).filter((i) => m.childrenAt(i as never) > 0).map((i) => m.keyAt(i as never));
      if (!parents.length) continue;
      const key = pick(parents);
      step(`api expand ${idOf(key)}`, false, () => t.g.kernel.dispatch({ type: 'rows.expand', rows: [key], expanded: !t.g.kernel.expansion.has(key) }, 'api'));
    } else if (r < 0.58) {
      const v = pick(['Visit 1', '.2', 'Patient 3', 'Service 1', null, null]);
      step(`filter ${v}`, false, () => t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: v === null ? null : { type: 'text', op: 'contains', value: v } }, 'api'));
    } else if (r < 0.63) {
      const s = pick([[], [{ column: 'n', dir: 'desc' as const }], [{ column: 'n', dir: 'asc' as const }], [{ column: 'name', dir: 'desc' as const }]]);
      step(`sort ${JSON.stringify(s)}`, false, () => t.g.kernel.dispatch({ type: 'sort.set', sort: s }, 'api'));
    } else if (r < 0.71) {
      const m = d();
      const any = m.count ? m.keyAt(m.index(Math.floor(R() * m.count))!) : null;
      const kind = pick(['add', 'add', 'remove', 'patch']);
      const id = idOf(any);
      if (kind === 'add') step(`tx add under ${id}`, false, () => t.g.kernel.rows.applyTransaction({ add: [{ id: `X${nextId++}`, parent: id, name: `Extra ${nextId}`, n: 3 }] }));
      else if (kind === 'remove' && id) step(`tx remove ${id}`, false, () => t.g.kernel.rows.applyTransaction({ remove: [id] }));
      else if (id) step(`tx patch ${id}`, false, () => t.g.kernel.rows.applyTransaction({ patch: [{ id, set: { name: `Renamed ${id}` } }] }));
    } else if (r < 0.8) {
      const max = t.ctx.scroll.mapper?.maxLogical ?? 0;
      const top = Math.round(R() * max);
      step(`scroll ${top}`, false, () => t.scroll(top));
      // The focused row scrolled away: its element may be recycled, the DOM focus left on the body.
      if (gridFocus === true && !t.vp.contains(document.activeElement)) gridFocus = null;
    } else if (r < 0.9) {
      const patch = pick([
        { id: 'name', order: Math.floor(R() * 3) }, { id: 'n', order: 0 }, { id: 'name', hidden: true }, { id: 'name', hidden: false },
        { id: 'name', pinned: 'start' as const }, { id: 'name', pinned: 'end' as const }, { id: 'name', pinned: null }, { id: 't', pinned: 'start' as const }, { id: 't', pinned: null },
      ]);
      // A pinned segment change moves the focused cell's element: the focus stays on it (B2).
      step(`columns ${JSON.stringify(patch)}`, false, () => t.g.kernel.dispatch({ type: 'column.state', patch: [patch] }, 'api'));
    } else {
      step('outside input', false, () => { outside.focus(); gridFocus = false; });
    }
  }
  // Teardown: the role given back, no decoration left, nothing heard after.
  const vp = t.vp;
  const stale = t.host.querySelector<HTMLElement>('.dzg-toggle:not([data-leaf])');
  t.g.destroy();
  expect(vp.getAttribute('role')).toBe('grid');
  expect(vp.querySelector('.dzg-toggle')).toBeNull();
  const before = t.events.length;
  if (stale) click(stale);
  expect(t.events.length).toBe(before);
  return log;
}

describe('a random walk on a tree grid: the rows always as the model says', () => {
  for (const lang of ['en', 'ar'] as const)
    for (const column of [undefined, 'name'] as const)
      for (const raf of [false, true])
        it.each(Array.from({ length: Number(process.env["WALK_SEEDS"]) || 6 }, (_, i) => i + 1))(`${lang}, column ${column ?? 'first'}, ${raf ? 'raf' : 'sync'}, seed %i`, (seed) => {
          walk({ lang, column, raf, seed: seed * 7919 + (lang === 'ar' ? 1 : 0) + (column ? 2 : 0) + (raf ? 4 : 0) }, Number(process.env["WALK_STEPS"]) || 160);
        });
});

// Make `k` used (handy in repros below).
void k;
