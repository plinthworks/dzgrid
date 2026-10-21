import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, makeQuery, type FilterModel, type GridEvent, type RowKey } from '@dzgrid/core';
import { treeShape, type TreeRows } from '@dzgrid/core/tree';
import { mulberry32 } from './support/rng.js';
import { oracle, parentsOf, type TR } from './support/tree-oracle.js';

/**
 * A kernel-level random walk over a tree (tree-view.md, tree-filter.md, tree-keys.md,
 * tree-selection.md): transactions (add, remove, move to another parent, sort key changes),
 * filters and quick search switched on, off and changed, sorts, expand / collapse / expandAll with
 * depths, toggles under a filter, focus moves, selection commands. After every step the grid is
 * compared to an independent model: rows shown (order, level, posinset, setsize, expanded,
 * matched), the user's set, rowExpanded events, focus, selection.
 */
type W = TR & { t: string };
const WORDS = ['alpha', 'beta', 'gamma', 'delta'];
const QUICK = ['', 'alpha', 'ta', 'el', 'zzz', 'ga ma'];
const SEEDS = Number(process.env.WALK_SEEDS ?? 150);
const STEPS = Number(process.env.WALK_STEPS ?? 60);
const k = (id: string) => dataKey(id)!;

type Filter = { kind: 'none' } | { kind: 'n'; cut: number } | { kind: 't'; word: string };

function walk(seed: number, mode: 'ancestors' | 'subtree') {
  const rnd = mulberry32(seed);
  const pick = <X>(xs: readonly X[]): X => xs[Math.floor(rnd() * xs.length)]!;
  let next = 0;
  const fresh = (ids: string[]): W => {
    const id = `r${next++}`;
    const r = rnd();
    const p = ids.length && r < 0.6 ? pick(ids) : r < 0.7 ? 'gone' : r < 0.73 ? id : undefined;
    return { id, ...(p !== undefined && { p }), n: Math.floor(rnd() * 6), t: pick(WORDS) };
  };
  // The independent state: rows in store order, the user's set, the layer and what it is tied to.
  let rows: W[] = [];
  for (let i = 0, n = 1 + Math.floor(rnd() * 25); i < n; i++) rows.push(fresh(rows.map((r) => r.id)));
  let open = new Set<string>();
  let layer = new Map<string, boolean>();
  let filter: Filter = { kind: 'none' };
  let quick = '';
  let layerOf = '';
  let sort: 'asc' | 'desc' | undefined;

  const columns = createColumnModel<W>([{ id: 'n', type: 'number' }, { id: 't' }]);
  const model = clientRows<W>({ rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape: treeShape<W>({ parentId: (r) => r.p, filter: mode }) });
  const kernel = createKernel<W>({ rows: model, columns });
  const events: GridEvent<W>[] = [];
  kernel.subscribe((e) => events.push(e));

  const filtering = () => filter.kind !== 'none' || quick.trim() !== '';
  const matchesOf = (): Set<string> | undefined => {
    if (!filtering()) return undefined;
    const words = quick.split(/\s+/).filter(Boolean);
    return new Set(rows.filter((r) => {
      if (filter.kind === 'n' && !(r.n >= filter.cut)) return false;
      if (filter.kind === 't' && r.t !== filter.word) return false;
      return words.every((w) => r.t.includes(w));
    }).map((r) => r.id));
  };
  const keyOf = () => (filtering() ? JSON.stringify([filter, quick.split(/\s+/).filter(Boolean)]) : '');
  const syncLayer = () => {
    const of = keyOf();
    if (of !== layerOf) (layer = new Map()), (layerOf = of);
  };
  /** Ancestors of matches: opened while a filter is on. */
  const ancOf = (parent: Map<string, string | null>, matches: Set<string> | undefined): Set<string> => {
    const out = new Set<string>();
    if (!matches) return out;
    for (const m of matches) for (let p = parent.get(m) ?? null; p !== null && !out.has(p); p = parent.get(p) ?? null) out.add(p);
    return out;
  };
  const isOpen = (id: string): boolean => {
    const m = matchesOf();
    if (m && layer.has(id)) return layer.get(id)!;
    return open.has(id) || ancOf(parentsOf(rows), m).has(id);
  };
  /** Children each row shows when open (under a filter, those it keeps): a row with none is a leaf, its toggle a no-op. */
  const kidsKept = (): Map<string, number> => {
    const m = matchesOf();
    const parent = parentsOf(rows);
    const whole = oracle({ rows, ...(sort && { sort }), ...(m && { matches: m }), mode, open: new Set(rows.map((r) => r.id)) });
    const out = new Map<string, number>();
    for (const w of whole) {
      const p = parent.get(w.id);
      if (p) out.set(p, (out.get(p) ?? 0) + 1);
    }
    return out;
  };
  const shownIds = (): string[] => {
    const d = model.displayed as TreeRows<W>;
    return Array.from({ length: d.count }, (_, i) => String((d.nodeAt(d.index(i)!) as { id: unknown }).id));
  };
  const query = () => {
    const f: FilterModel = filter.kind === 'n' ? { n: { type: 'number', op: 'gte', value: filter.cut } } : filter.kind === 't' ? { t: { type: 'text', op: 'equals', value: filter.word } } : {};
    kernel.dispatch({ type: 'query.set', query: makeQuery({ ...(sort && { sort: [{ column: 'n', dir: sort }] }), filter: f, quick }) }, 'user');
    syncLayer();
  };

  const check = (label: string, prevFocus: string | null, expandedEvent: { rows: string[]; expanded: boolean } | null) => {
    const matches = matchesOf();
    const parent = parentsOf(rows);
    const want = oracle({ rows, ...(sort && { sort }), ...(matches && { matches }), mode, open, ...(matches && { layer }) });
    const d = model.displayed as TreeRows<W>;
    const got = Array.from({ length: d.count }, (_, i) => {
      const at = d.index(i)!;
      return { id: String((d.nodeAt(at) as { id: unknown }).id), level: d.levelAt(at), pos: d.posAt(at), size: d.sizeAt(at) };
    });
    expect(got, `${label}: rows shown`).toEqual(want);
    // Every row the filter keeps, all open: what childrenAt counts under each parent.
    const whole = oracle({ rows, ...(sort && { sort }), ...(matches && { matches }), mode, open: new Set(rows.map((r) => r.id)) });
    const kidsShown = (id: string) => whole.filter((w) => parent.get(w.id) === id).length;
    // expanded and matched flags, the parents and the children the grid reports.
    for (let i = 0; i < d.count; i++) {
      const at = d.index(i)!;
      const id = got[i]!.id;
      expect(d.expandedAt(at), `${label}: expandedAt ${id}`).toBe(isOpen(id));
      expect(model.isExpanded(k(id)), `${label}: isExpanded ${id}`).toBe(isOpen(id));
      expect(d.matchedAt(at), `${label}: matchedAt ${id}`).toBe(!matches || matches.has(id));
      expect(d.childrenAt(at), `${label}: childrenAt ${id}`).toBe(kidsShown(id));
      expect(d.parentOf(k(id)), `${label}: parentOf ${id}`).toBe(parent.get(id) ? k(parent.get(id)!) : null);
    }
    // Repairs: one tree-orphan per row naming a parent that is not there.
    const present = new Set(rows.map((r) => r.id));
    expect(model.problems.filter((p) => p.code === 'tree-orphan').length, `${label}: orphans`).toBe(rows.filter((r) => r.p && !present.has(r.p)).length);
    expect(new Set([...kernel.expansion]), `${label}: the user's set`).toEqual(new Set([...open].map(k)));
    expect(model.counts.filtered, `${label}: counts.filtered`).toBe(matches ? matches.size : rows.length);
    // rowExpanded: only for an expand that changed something, keys only.
    const ex = events.filter((e) => e.type === 'rowExpanded');
    if (expandedEvent && expandedEvent.rows.length) {
      expect(ex, `${label}: rowExpanded`).toEqual([{ type: 'rowExpanded', source: 'user', rows: expandedEvent.rows.map(k), expanded: expandedEvent.expanded }]);
    } else expect(ex, `${label}: no rowExpanded`).toEqual([]);
    // Focus: never on a hidden row; a row hidden (still there) goes to its nearest shown ancestor.
    const f = kernel.focus;
    if (f?.kind === 'cell') {
      expect(d.indexOf(f.row), `${label}: focus shown`).not.toBe(-1);
      if (prevFocus !== null && rows.some((r) => r.id === prevFocus)) {
        const ids = new Set(got.map((g) => g.id));
        if (!ids.has(prevFocus)) {
          let a = parent.get(prevFocus) ?? null;
          while (a !== null && !ids.has(a)) a = parent.get(a) ?? null;
          if (a !== null) expect(f.row, `${label}: focus to nearest shown ancestor of ${prevFocus}`).toBe(k(a));
        } else expect(f.row, `${label}: focus stays`).toBe(k(prevFocus));
      }
    } else if (d.count > 0 && prevFocus !== null) {
      throw new Error(`${label}: focus lost with rows shown`);
    }
    // Selection: only keys of rows that exist.
    const ids = new Set(rows.map((r) => r.id));
    for (const key of kernel.selection.keys) expect(ids.has(key.slice(key.indexOf(':', 2) + 1)), `${label}: selected key exists`).toBe(true);
  };

  check(`seed ${seed} start`, null, null);
  for (let step = 0; step < STEPS; step++) {
    const f0 = kernel.focus;
    const prevFocus = f0?.kind === 'cell' ? f0.row.slice(f0.row.indexOf(':', 2) + 1) : null;
    events.length = 0;
    const r = rnd();
    const ids = rows.map((x) => x.id);
    let label = `seed ${seed} step ${step}`;
    let exEvent: { rows: string[]; expanded: boolean } | null = null;
    if (r < 0.1) {
      const add = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => fresh(ids));
      label += ' add';
      model.applyTransaction({ add });
      rows = [...rows, ...add];
    } else if (r < 0.18 && rows.length > 1) {
      const gone = [...new Set(Array.from({ length: 1 + Math.floor(rnd() * 2) }, () => pick(ids)))];
      label += ` remove ${gone}`;
      model.applyTransaction({ remove: gone });
      rows = rows.filter((x) => !gone.includes(x.id));
      const g = new Set(gone);
      open = new Set([...open].filter((x) => !g.has(x)));
      for (const x of gone) layer.delete(x);
    } else if (r < 0.3 && rows.length) {
      // Move to another parent (possibly a cycle, a missing id, a root) and/or a new sort key.
      const at = Math.floor(rnd() * rows.length);
      const old = rows[at]!;
      const q = rnd();
      const p = q < 0.6 ? pick(ids) : q < 0.7 ? 'gone' : q < 0.85 ? undefined : old.p;
      const upd: W = { id: old.id, ...(p !== undefined && { p }), n: rnd() < 0.5 ? Math.floor(rnd() * 6) : old.n, t: rnd() < 0.3 ? pick(WORDS) : old.t };
      label += ` update ${JSON.stringify(upd)}`;
      model.applyTransaction({ update: [upd] });
      rows = rows.map((x, i) => (i === at ? upd : x));
    } else if (r < 0.4) {
      const q = rnd();
      filter = q < 0.4 ? { kind: 'none' } : q < 0.7 ? { kind: 'n', cut: Math.floor(rnd() * 6) } : { kind: 't', word: pick(WORDS) };
      label += ` filter ${JSON.stringify(filter)}`;
      query();
    } else if (r < 0.47) {
      quick = pick(QUICK);
      label += ` quick '${quick}'`;
      query();
    } else if (r < 0.52) {
      sort = pick([undefined, 'asc', 'desc'] as const);
      label += ` sort ${sort}`;
      query();
    } else if (r < 0.7 && rows.length) {
      const keys = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(ids));
      const expanded = rnd() < 0.6;
      label += ` expand ${keys} ${expanded}`;
      const kept = kidsKept();
      const changed = [...new Set(keys)].filter((id) => isOpen(id) !== expanded && (kept.get(id) ?? 0) > 0);
      kernel.dispatch({ type: 'rows.expand', rows: keys.map(k), expanded }, 'user');
      if (matchesOf()) for (const id of changed) layer.set(id, expanded);
      else for (const id of changed) expanded ? open.add(id) : open.delete(id);
      exEvent = { rows: changed, expanded };
    } else if (r < 0.76) {
      // expandAll: outside a filter, the user's set; under one, the rows it keeps, through its layer.
      const expanded = rnd() < 0.5;
      const depth = rnd() < 0.4 ? undefined : Math.floor(rnd() * 4);
      label += ` expandAll ${expanded} ${depth}`;
      const parent = parentsOf(rows);
      const depthOf = (id: string) => { let d = 0; for (let p = parent.get(id) ?? null; p !== null; p = parent.get(p) ?? null) d++; return d; };
      let changed: string[];
      if (filtering()) {
        const kept = kidsKept();
        const parents = ids.filter((id) => (kept.get(id) ?? 0) > 0);
        const cand = parents.filter((id) => depth === undefined || (expanded ? depthOf(id) < depth : depthOf(id) >= depth));
        changed = cand.filter((id) => isOpen(id) !== expanded);
        kernel.dispatch({ type: 'rows.expandAll', expanded, ...(depth !== undefined && { depth }) }, 'user');
        for (const id of changed) layer.set(id, expanded);
      } else {
        const parents = ids.filter((id) => [...parent.values()].includes(id));
        const above = parents.filter((id) => depth === undefined || depthOf(id) < depth);
        const nextOpen = expanded ? new Set([...open, ...above]) : depth === undefined ? new Set<string>() : new Set([...open].filter((id) => above.includes(id) || !parents.includes(id)));
        changed = expanded ? [...nextOpen].filter((id) => !open.has(id)) : [...open].filter((id) => !nextOpen.has(id));
        kernel.dispatch({ type: 'rows.expandAll', expanded, ...(depth !== undefined && { depth }) }, 'user');
        open = nextOpen;
        layer = new Map();
      }
      // Order of the event's keys is the grid's; compared as sets.
      const ex = events.filter((e) => e.type === 'rowExpanded') as Extract<GridEvent<W>, { type: 'rowExpanded' }>[];
      expect(new Set(ex.flatMap((e) => e.rows)), `${label}: rowExpanded keys`).toEqual(new Set(changed.map(k)));
      expect(ex.length, `${label}: one event at most`).toBe(changed.length ? 1 : 0);
      events.length = 0;
    } else if (r < 0.84) {
      const shown = shownIds();
      if (shown.length) {
        const id = pick(shown);
        label += ` focus ${id}`;
        kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k(id), column: pick(['n', 't']) } }, 'user');
        expect(kernel.focus, `${label}: focus set`).toMatchObject({ row: k(id) });
        check(label, null, null);
        continue;
      }
    } else {
      const shown = shownIds();
      const c = rnd();
      if (c < 0.25) {
        label += ' select all';
        kernel.dispatch({ type: rnd() < 0.5 ? 'selection.all' : 'selection.allDisplayed' }, 'user');
        // Under a filter, the matches shown: never the muted ancestors (tree-filter.md).
        const m = matchesOf();
        const taken = shown.filter((id) => !m || m.has(id));
        expect(new Set(kernel.selection.keys), `${label}: all = the matching rows shown`).toEqual(new Set(taken.map(k)));
        expect(kernel.headerState, `${label}: header`).toBe(taken.length ? 'all' : 'none');
      } else if (c < 0.5 && shown.length) {
        const id = pick(shown);
        label += ` select ${id}`;
        kernel.dispatch({ type: rnd() < 0.5 ? 'selection.only' : 'selection.toggle', row: k(id) }, 'user');
      } else if (c < 0.85 && shown.length) {
        const id = pick(shown);
        const additive = rnd() < 0.3;
        const anchor = kernel.anchor;
        label += ` range to ${id} ${additive}`;
        const res = kernel.dispatch({ type: 'selection.range', target: k(id), additive }, 'user');
        if (res.ok && anchor !== null && !additive) {
          const a = shown.indexOf(anchor.slice(anchor.indexOf(':', 2) + 1));
          const b = shown.indexOf(id);
          if (a >= 0) expect(new Set(kernel.selection.keys), `${label}: range`).toEqual(new Set(shown.slice(Math.min(a, b), Math.max(a, b) + 1).map(k)));
        }
      } else {
        label += ' clear';
        kernel.dispatch({ type: 'selection.clear' }, 'user');
      }
    }
    check(label, prevFocus, exEvent);
  }
}

describe('a kernel random walk over a tree, against an independent model', () => {
  it(`agrees over ${SEEDS} seeds × ${STEPS} steps ('ancestors')`, { timeout: 120_000 }, () => {
    for (let seed = 1; seed <= SEEDS; seed++) walk(seed, 'ancestors');
  });
  it(`agrees over ${SEEDS} seeds × ${STEPS} steps ('subtree')`, { timeout: 120_000 }, () => {
    for (let seed = 1; seed <= SEEDS; seed++) walk(10_000 + seed, 'subtree');
  });
});
