import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, groupKey, isSelected, localeCtx, makeQuery, type FilterModel, type GridEvent, type RowKey } from '@dzgrid/core';
import { csvRows, toCsv } from '@dzgrid/core/csv';
import { treeShape, type TreeRows } from '@dzgrid/core/tree';
import { mulberry32 } from './support/rng.js';
import { oracle, parentsOf, type TR } from './support/tree-oracle.js';

/**
 * The kernel random walk (tree-walk.test.ts) over the two step-5 shapes: nested `children` and
 * `path` rows. Transactions move rows between parents (nested: an update naming its children;
 * paths: a new path), add rows that claim a filler's path and remove them again (the open state
 * passing between the row and the filler), re-add removed nested rows (roots), reload; filters, quick search, sort, expand / expandAll (fillers included),
 * selection commands (fillers refused, skipped by ranges and select-all). After every step: the rows
 * shown (order, level, posinset, setsize, expanded, matched, parent, children), filler keys and
 * labels, the open set (filler keys kept while their filler is gone), counts, the header box, and
 * the CSV of `all`, `displayed` and `selected` (level and indent) against an independent model.
 */
type Row = { id: string; n: number; t: string; path?: string[]; kids?: Row[] };
const WORDS = ['alpha', 'beta', 'gamma', 'delta'];
const QUICK = ['', 'alpha', 'ta', 'el', 'zzz', 'ga ma'];
const SEGS = ['a', 'b', 'c'];
const SEEDS = Number(process.env.WALK_SEEDS ?? 120);
const STEPS = Number(process.env.WALK_STEPS ?? 60);
const J = (p: readonly string[]) => JSON.stringify(p);
const dk = (id: string) => dataKey(id)!;

type Filter = { kind: 'none' } | { kind: 'n'; cut: number } | { kind: 't'; word: string };

/** The independent forest: the oracle's rows (data in store order, then fillers), each filler's path. */
interface Forest { tr: TR[]; fillers: Map<string, string[]>; data: Map<string, Row>; claim?: Map<string, string> }

/** Paths, by the sheet (tree-view.md « Path rows »): the first row with a path claims it; a level no row has is a filler. */
function pathForest(rows: readonly Row[]): Forest {
  const claim = new Map<string, string>();
  for (const r of rows) if (r.path!.length && !claim.has(J(r.path!))) claim.set(J(r.path!), r.id);
  const fillers = new Map<string, string[]>();
  const nodeOf = (prefix: string[]): string => {
    const c = claim.get(J(prefix));
    if (c !== undefined) return c;
    const key = groupKey(prefix) as string;
    if (!fillers.has(key)) fillers.set(key, prefix);
    return key;
  };
  const tr: TR[] = rows.map((r) => ({ id: r.id, n: r.n, p: r.path!.length <= 1 ? null : nodeOf(r.path!.slice(0, -1)) }));
  // Fillers found while walking up register more: until none is new.
  const done = new Set<string>();
  for (let more = true; more; ) {
    more = false;
    for (const [key, p] of [...fillers]) {
      if (done.has(key)) continue;
      done.add(key);
      more = true;
      tr.push({ id: key, n: 0, p: p.length <= 1 ? null : nodeOf(p.slice(0, -1)) });
    }
  }
  return { tr, fillers, data: new Map(rows.map((r) => [r.id, r])), claim };
}

/**
 * Nested rows made flat by the sheet: each row then its children, depth first; an object met again
 * is skipped; a second copy of an id is held (refused by the store) but not walked. `index` gets the
 * parent of each child, by id (first occurrence wins).
 */
function flatten(tops: readonly Row[], index: Map<string, string>): Row[] {
  const out: Row[] = [];
  const objs = new Set<Row>();
  const ids = new Set<string>();
  const visit = (r: Row, p: string | null) => {
    if (objs.has(r)) return;
    objs.add(r);
    out.push(r);
    if (ids.has(r.id)) return;
    ids.add(r.id);
    if (p !== null) index.set(r.id, p);
    for (const k of r.kids ?? []) visit(k, r.id);
  };
  for (const r of tops) visit(r, null);
  return out;
}

function walk(seed: number, shape: 'children' | 'path', mode: 'ancestors' | 'subtree') {
  const rnd = mulberry32(seed);
  const pick = <X>(xs: readonly X[]): X => xs[Math.floor(rnd() * xs.length)]!;
  let next = 0;
  const word = () => pick(WORDS);
  const num = () => Math.floor(rnd() * 6);
  const randomPath = (): string[] => {
    const q = rnd();
    const len = q < 0.05 ? 0 : q < 0.3 ? 1 : q < 0.7 ? 2 : 3;
    return Array.from({ length: len }, () => pick(SEGS));
  };
  const freshRow = (): Row => ({ id: `r${next++}`, n: num(), t: word(), ...(shape === 'path' && { path: randomPath() }) });

  // The independent state: rows in store order (without `kids`), nested parents by id, the open set by key.
  let rows: Row[] = [];
  let index = new Map<string, string>();
  const removed: Row[] = [];
  let input: Row[];
  if (shape === 'path') {
    for (let i = 0, n = 1 + Math.floor(rnd() * 20); i < n; i++) rows.push(freshRow());
    input = rows;
  } else {
    // A random forest given nested: shared objects and a second copy of an id now and then.
    const made: Row[] = [];
    const tops: Row[] = [];
    for (let i = 0, n = 1 + Math.floor(rnd() * 20); i < n; i++) {
      const r: Row = { ...freshRow(), kids: [] };
      if (made.length && rnd() < 0.65) pick(made).kids!.push(r);
      else tops.push(r);
      made.push(r);
    }
    if (made.length > 2 && rnd() < 0.3) pick(made).kids!.push(pick(made)); // an object met again (or itself)
    if (made.length && rnd() < 0.3) pick(made).kids!.push({ id: pick(made).id, n: 9, t: 'copy', kids: [{ id: `x${next++}`, n: 1, t: 'never' }] });
    input = tops;
    const flat = flatten(tops, index);
    const held = new Set<string>();
    for (const r of flat) if (!held.has(r.id)) (held.add(r.id), rows.push({ id: r.id, n: r.n, t: r.t }));
  }
  let open = new Set<string>();
  let layer = new Map<string, boolean>();
  let filter: Filter = { kind: 'none' };
  let quick = '';
  let layerOf = '';
  let sort: 'asc' | 'desc' | undefined;

  const columns = createColumnModel<Row>([{ id: 't', header: 'T' }, { id: 'n', header: 'N', type: 'number' }]);
  const tree = shape === 'path' ? { path: (r: Row) => r.path! } : { children: (r: Row) => r.kids };
  const ctx = localeCtx({ locale: 'en-US' });
  const model = clientRows<Row>({ rows: input, getRowId: (r) => r.id, columns, ctx, shape: treeShape<Row>({ ...tree, filter: mode }) });
  const kernel = createKernel<Row>({ rows: model, columns });
  const events: GridEvent<Row>[] = [];
  kernel.subscribe((e) => events.push(e));

  const forest = (): Forest =>
    shape === 'path' ? pathForest(rows) : { tr: rows.map((r) => ({ id: r.id, n: r.n, p: index.get(r.id) ?? null })), fillers: new Map(), data: new Map(rows.map((r) => [r.id, r])) };
  const keyOf = (id: string): RowKey => (id.startsWith('g:') ? (id as RowKey) : dk(id));
  const idOfKey = (key: RowKey): string => (key.startsWith('g:') ? key : key.slice(key.indexOf(':', 2) + 1));

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
  const layerKey = () => (filtering() ? JSON.stringify([filter, quick.split(/\s+/).filter(Boolean)]) : '');
  const syncLayer = () => {
    const of = layerKey();
    if (of !== layerOf) (layer = new Map()), (layerOf = of);
  };
  const oracleOf = (f: Forest, o: { open: ReadonlySet<string>; layer?: ReadonlyMap<string, boolean> }) => {
    const m = matchesOf();
    return oracle({ rows: f.tr, ...(sort && { sort }), ...(m && { matches: m }), mode, open: o.open, ...(m && o.layer && { layer: o.layer }), fillers: new Set(f.fillers.keys()) });
  };
  const ancOf = (parent: Map<string, string | null>, matches: Set<string> | undefined): Set<string> => {
    const out = new Set<string>();
    if (!matches) return out;
    for (const m of matches) for (let p = parent.get(m) ?? null; p !== null && !out.has(p); p = parent.get(p) ?? null) out.add(p);
    return out;
  };
  const isOpen = (f: Forest, id: string): boolean => {
    const m = matchesOf();
    if (m && layer.has(id)) return layer.get(id)!;
    return open.has(id) || ancOf(parentsOf(f.tr), m).has(id);
  };
  /**
   * Paths (lead decision 6c): a row taking a filler's place gets the filler's open state, and a filler
   * taking a row's place the row's: a key whose node is gone passes to the one now at its path.
   */
  const rekey = (was: Forest) => {
    if (shape !== 'path') return;
    const now = forest();
    const there = (f: Forest, id: string) => f.data.has(id) || f.fillers.has(id);
    const placeOf = (id: string): string[] | null => was.fillers.get(id) ?? (was.claim!.get(J(was.data.get(id)?.path ?? [])) === id ? was.data.get(id)!.path! : null);
    const re = (id: string): string => {
      const p = there(was, id) && !there(now, id) ? placeOf(id) : null;
      const y = p && (now.claim!.get(J(p)) ?? (now.fillers.has(groupKey(p)) ? (groupKey(p) as string) : null));
      return y && y.startsWith('g:') !== id.startsWith('g:') ? y : id;
    };
    open = new Set([...open].map(re));
    layer = new Map([...layer].map(([k, v]) => [re(k), v]));
  };
  const allOpen = (f: Forest) => new Set(f.tr.map((r) => r.id));
  const kidsKept = (f: Forest): Map<string, number> => {
    const parent = parentsOf(f.tr);
    const out = new Map<string, number>();
    for (const w of oracleOf(f, { open: allOpen(f) })) {
      const p = parent.get(w.id);
      if (p) out.set(p, (out.get(p) ?? 0) + 1);
    }
    return out;
  };
  const shownIds = (): string[] => {
    const d = model.displayed as TreeRows<Row>;
    return Array.from({ length: d.count }, (_, i) => idOfKey(d.keyAt(d.index(i)!)));
  };
  const query = () => {
    const fm: FilterModel = filter.kind === 'n' ? { n: { type: 'number', op: 'gte', value: filter.cut } } : filter.kind === 't' ? { t: { type: 'text', op: 'equals', value: filter.word } } : {};
    kernel.dispatch({ type: 'query.set', query: makeQuery({ ...(sort && { sort: [{ column: 'n', dir: sort }] }), filter: fm, quick }) }, 'user');
    syncLayer();
  };
  const csv = (scope: 'all' | 'displayed' | 'selected', tree: 'level' | 'indent') => {
    const held = csvRows(model, scope, kernel.selection)!;
    return toCsv({ rows: held.rows, at: held.at, columns, ctx }, { bom: false, tree }).split('\r\n').slice(0, -1);
  };
  const csvWant = (f: Forest, list: { id: string; level: number }[], tree: 'level' | 'indent') => {
    const body = list.map(({ id, level }) => {
      const r = f.data.get(id);
      const t = r ? r.t : f.fillers.get(id)!.at(-1)!;
      const n = r ? String(r.n) : '';
      return tree === 'level' ? `${level + 1},${t},${n}` : `${'  '.repeat(level)}${t},${n}`;
    });
    return [tree === 'level' ? 'Level,T,N' : 'T,N', ...body];
  };

  const check = (label: string, prevFocus: string | null, expandedEvent: { rows: string[]; expanded: boolean } | null) => {
    const f = forest();
    const matches = matchesOf();
    const parent = parentsOf(f.tr);
    const want = oracleOf(f, { open, layer });
    const d = model.displayed as TreeRows<Row>;
    const got = Array.from({ length: d.count }, (_, i) => {
      const at = d.index(i)!;
      return { id: idOfKey(d.keyAt(at)), level: d.levelAt(at), pos: d.posAt(at), size: d.sizeAt(at) };
    });
    expect(got, `${label}: rows shown`).toEqual(want);
    const whole = oracleOf(f, { open: allOpen(f) });
    const kidsShown = (id: string) => whole.filter((w) => parent.get(w.id) === id).length;
    for (let i = 0; i < d.count; i++) {
      const at = d.index(i)!;
      const id = got[i]!.id;
      const node = d.nodeAt(at);
      if (f.fillers.has(id)) {
        expect(node, `${label}: filler node ${id}`).toMatchObject({ kind: 'group', key: id, label: f.fillers.get(id)!.at(-1), path: f.fillers.get(id), level: got[i]!.level });
        expect(d.matchedAt(at), `${label}: a filler never matches ${id}`).toBe(!matches);
      } else {
        expect(node, `${label}: data node ${id}`).toMatchObject({ kind: 'data', id, data: { n: f.data.get(id)!.n, t: f.data.get(id)!.t } });
        expect(d.matchedAt(at), `${label}: matchedAt ${id}`).toBe(!matches || matches.has(id));
      }
      expect(d.expandedAt(at), `${label}: expandedAt ${id}`).toBe(isOpen(f, id));
      expect(model.isExpanded(keyOf(id)), `${label}: isExpanded ${id}`).toBe(isOpen(f, id));
      expect(d.childrenAt(at), `${label}: childrenAt ${id}`).toBe(kidsShown(id));
      expect(d.parentOf(keyOf(id)), `${label}: parentOf ${id}`).toBe(parent.get(id) ? keyOf(parent.get(id)!) : null);
    }
    // A filler is never counted: select-all's count is the data rows shown (the matches under a filter).
    const dataShown = got.filter((g) => !f.fillers.has(g.id) && (!matches || matches.has(g.id))).length;
    expect(d.dataCount, `${label}: dataCount`).toBe(dataShown);
    expect(model.counts.filtered, `${label}: counts.filtered`).toBe(matches ? matches.size : rows.length);
    const present = new Set(rows.map((r) => r.id));
    expect(model.problems.filter((p) => p.code === 'tree-orphan').length, `${label}: orphans`).toBe(shape === 'path' ? 0 : rows.filter((r) => index.has(r.id) && !present.has(index.get(r.id)!)).length);
    // The open set: the user's keys, a filler's kept while it is gone.
    expect(new Set([...kernel.expansion]), `${label}: the user's set`).toEqual(new Set([...open].map(keyOf)));
    const ex = events.filter((e) => e.type === 'rowExpanded');
    if (expandedEvent && expandedEvent.rows.length) {
      expect(ex, `${label}: rowExpanded`).toEqual([{ type: 'rowExpanded', source: 'user', rows: expandedEvent.rows.map(keyOf), expanded: expandedEvent.expanded }]);
    } else expect(ex, `${label}: no rowExpanded`).toEqual([]);
    // Focus: never on a hidden row; a row (or filler) hidden but still there goes to its nearest shown ancestor.
    const fo = kernel.focus;
    if (fo?.kind === 'cell') {
      expect(d.indexOf(fo.row), `${label}: focus shown`).not.toBe(-1);
      if (prevFocus !== null && parent.has(prevFocus)) {
        const ids = new Set(got.map((g) => g.id));
        if (!ids.has(prevFocus)) {
          let a = parent.get(prevFocus) ?? null;
          while (a !== null && !ids.has(a)) a = parent.get(a) ?? null;
          if (a !== null) expect(fo.row, `${label}: focus to nearest shown ancestor of ${prevFocus}`).toBe(keyOf(a));
        } else expect(fo.row, `${label}: focus stays`).toBe(keyOf(prevFocus));
      }
    } else if (d.count > 0 && prevFocus !== null) throw new Error(`${label}: focus lost with rows shown`);
    // Selection: data keys of rows that exist, never a filler; the header box over the data rows shown.
    for (const key of kernel.selection.keys) expect(key.startsWith('d:') && present.has(idOfKey(key)), `${label}: selected key ${key} exists`).toBe(true);
    const ticked = got.filter((g) => !f.fillers.has(g.id) && (!matches || matches.has(g.id)) && isSelected(kernel.selection, keyOf(g.id))).length;
    expect(kernel.headerState, `${label}: header`).toBe(dataShown === 0 || ticked === 0 ? 'none' : ticked === dataShown ? 'all' : 'some');
    // The CSV: `all` is every row the query keeps, everything open, in tree order; fillers label-only.
    for (const t of ['level', 'indent'] as const) {
      expect(csv('all', t), `${label}: csv all ${t}`).toEqual(csvWant(f, whole, t));
      expect(csv('displayed', t), `${label}: csv displayed ${t}`).toEqual(csvWant(f, want, t));
    }
    const sel = whole.filter((w) => !f.fillers.has(w.id) && isSelected(kernel.selection, keyOf(w.id)));
    expect(csv('selected', 'level'), `${label}: csv selected`).toEqual(csvWant(f, sel, 'level'));
  };

  check(`${shape} seed ${seed} start`, null, null);
  for (let step = 0; step < STEPS; step++) {
    const f0 = kernel.focus;
    const prevFocus = f0?.kind === 'cell' ? idOfKey(f0.row) : null;
    events.length = 0;
    const r = rnd();
    const ids = rows.map((x) => x.id);
    let label = `${shape} ${mode} seed ${seed} step ${step}`;
    let exEvent: { rows: string[]; expanded: boolean } | null = null;
    const before = forest();
    if (r < 0.1) {
      if (shape === 'path') {
        // Fresh rows; now and then one claiming a filler's path (it takes the filler's place).
        const fillerPaths = [...before.fillers.values()];
        const add = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => {
          const x = freshRow();
          if (fillerPaths.length && rnd() < 0.4) x.path = [...pick(fillerPaths)];
          return x;
        });
        label += ` add ${JSON.stringify(add)}`;
        model.applyTransaction({ add });
        rows = [...rows, ...add];
        rekey(before);
      } else {
        // Fresh rows with fresh children, or a removed row back (a root: its parent was forgotten at its removal).
        const add: Row[] = [];
        for (let i = 0, c = 1 + Math.floor(rnd() * 2); i < c; i++) {
          const back = removed.length && rnd() < 0.3 ? removed.splice(Math.floor(rnd() * removed.length), 1)[0]! : null;
          const top: Row = back ? { id: back.id, n: back.n, t: back.t } : freshRow();
          if (rnd() < 0.5) top.kids = Array.from({ length: 1 + Math.floor(rnd() * 2) }, () => ({ ...freshRow(), ...(rnd() < 0.3 && { kids: [freshRow()] }) }));
          add.push(top);
        }
        label += ` add ${JSON.stringify(add)}`;
        model.applyTransaction({ add });
        for (const x of flatten(add, index)) rows.push({ id: x.id, n: x.n, t: x.t });
      }
    } else if (r < 0.18 && rows.length > 1) {
      // Remove: often a row standing in a filler's place, or a parent (its children: nested, roots).
      const claimers = shape === 'path' ? rows.filter((x) => x.path!.length > 0 && rows.some((y) => y !== x && y.path!.length > x.path!.length && J(y.path!.slice(0, x.path!.length)) === J(x.path!))) : [];
      const gone = [...new Set(Array.from({ length: 1 + Math.floor(rnd() * 2) }, () => (claimers.length && rnd() < 0.5 ? pick(claimers).id : pick(ids))))];
      label += ` remove ${gone}`;
      model.applyTransaction({ remove: gone });
      for (const x of rows) if (gone.includes(x.id)) removed.push(x);
      rows = rows.filter((x) => !gone.includes(x.id));
      if (shape === 'children') for (const x of gone) index.delete(x);
      rekey(before);
      const g = new Set(gone);
      open = new Set([...open].filter((x) => !g.has(x)));
      for (const x of gone) layer.delete(x);
    } else if (r < 0.3 && rows.length) {
      const at = Math.floor(rnd() * rows.length);
      const old = rows[at]!;
      const upd: Row = { id: old.id, n: rnd() < 0.5 ? num() : old.n, t: rnd() < 0.3 ? word() : old.t };
      if (shape === 'path') {
        // A new path: another place, a filler's path, under another row, or kept.
        const q = rnd();
        const fillerPaths = [...before.fillers.values()];
        upd.path = q < 0.35 ? randomPath() : q < 0.55 && fillerPaths.length ? [...pick(fillerPaths)] : q < 0.75 ? [...pick(rows).path!, pick(SEGS)] : [...old.path!];
        label += ` update ${JSON.stringify(upd)}`;
        model.applyTransaction({ update: [upd] });
        rows = rows.map((x, i) => (i === at ? upd : x));
        rekey(before);
      } else {
        // An update naming children: those rows move under it (cycles repaired); an id not held waits for its add.
        if (rnd() < 0.6) {
          upd.kids = Array.from({ length: 1 + Math.floor(rnd() * 2) }, () => (rnd() < 0.8 ? { id: pick(ids), n: 9, t: 'ignored' } : { id: `w${next++}`, n: 9, t: 'waits' }));
        }
        label += ` update ${JSON.stringify(upd)}`;
        model.applyTransaction({ update: [upd] });
        flatten([upd], index);
        rows = rows.map((x, i) => (i === at ? { id: upd.id, n: upd.n, t: upd.t } : x));
      }
    } else if (r < 0.33) {
      // A reload of some of the rows: nested parents start again from the new data.
      const keep = rows.filter(() => rnd() < 0.85);
      label += ` setRows ${keep.map((x) => x.id)}`;
      if (shape === 'path') {
        model.setRows(keep);
        rows = keep;
        rekey(before);
      } else {
        const parent = parentsOf(before.tr);
        const kept = new Set(keep.map((x) => x.id));
        const obj = new Map(keep.map((x) => [x.id, { id: x.id, n: x.n, t: x.t, kids: [] as Row[] }]));
        const tops: Row[] = [];
        for (const x of keep) {
          let p = parent.get(x.id) ?? null;
          while (p !== null && !kept.has(p)) p = parent.get(p) ?? null;
          (p === null ? tops : obj.get(p)!.kids!).push(obj.get(x.id)!);
        }
        model.setRows(tops);
        index = new Map();
        rows = flatten(tops, index).map((x) => ({ id: x.id, n: x.n, t: x.t }));
      }
      const present = new Set(rows.map((x) => x.id));
      for (const x of before.data.keys()) if (!present.has(x)) open.delete(x), layer.delete(x);
    } else if (r < 0.41) {
      const q = rnd();
      filter = q < 0.4 ? { kind: 'none' } : q < 0.7 ? { kind: 'n', cut: num() } : { kind: 't', word: word() };
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
    } else if (r < 0.7) {
      // Expand / collapse: data rows, fillers shown or not, and fillers gone (a no-op).
      const all = [...before.tr.map((x) => x.id), ...[...open].filter((x) => x.startsWith('g:'))];
      if (!all.length) continue;
      const keys = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => (shape === 'path' && rnd() < 0.5 && before.fillers.size ? pick([...before.fillers.keys()]) : pick(all)));
      const expanded = rnd() < 0.6;
      label += ` expand ${keys} ${expanded}`;
      const kept = kidsKept(before);
      const changed = [...new Set(keys)].filter((id) => isOpen(before, id) !== expanded && (kept.get(id) ?? 0) > 0);
      const res = kernel.dispatch({ type: 'rows.expand', rows: keys.map(keyOf), expanded }, 'user');
      expect(res.ok, `${label}: accepted`).toBe(true);
      if (matchesOf()) for (const id of changed) layer.set(id, expanded);
      else for (const id of changed) expanded ? open.add(id) : open.delete(id);
      exEvent = { rows: changed, expanded };
    } else if (r < 0.76) {
      const expanded = rnd() < 0.5;
      const depth = rnd() < 0.4 ? undefined : Math.floor(rnd() * 4);
      label += ` expandAll ${expanded} ${depth}`;
      const parent = parentsOf(before.tr);
      const depthOf = (id: string) => { let dd = 0; for (let p = parent.get(id) ?? null; p !== null; p = parent.get(p) ?? null) dd++; return dd; };
      const nodes = before.tr.map((x) => x.id);
      let changed: string[];
      if (filtering()) {
        const kept = kidsKept(before);
        const parents = nodes.filter((id) => (kept.get(id) ?? 0) > 0);
        const cand = parents.filter((id) => depth === undefined || (expanded ? depthOf(id) < depth : depthOf(id) >= depth));
        changed = cand.filter((id) => isOpen(before, id) !== expanded);
        kernel.dispatch({ type: 'rows.expandAll', expanded, ...(depth !== undefined && { depth }) }, 'user');
        for (const id of changed) layer.set(id, expanded);
      } else {
        const parents = nodes.filter((id) => [...parent.values()].includes(id));
        const above = parents.filter((id) => depth === undefined || depthOf(id) < depth);
        const nextOpen = expanded ? new Set([...open, ...above]) : depth === undefined ? new Set<string>() : new Set([...open].filter((id) => above.includes(id) || !parents.includes(id)));
        changed = expanded ? [...nextOpen].filter((id) => !open.has(id)) : [...open].filter((id) => !nextOpen.has(id));
        kernel.dispatch({ type: 'rows.expandAll', expanded, ...(depth !== undefined && { depth }) }, 'user');
        open = nextOpen;
        layer = new Map();
      }
      const ex = events.filter((e) => e.type === 'rowExpanded') as Extract<GridEvent<Row>, { type: 'rowExpanded' }>[];
      expect(new Set(ex.flatMap((e) => e.rows)), `${label}: rowExpanded keys`).toEqual(new Set(changed.map(keyOf)));
      expect(ex.length, `${label}: one event at most`).toBe(changed.length ? 1 : 0);
      events.length = 0;
    } else if (r < 0.84) {
      const shown = shownIds();
      if (shown.length) {
        const id = pick(shown);
        label += ` focus ${id}`;
        kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: keyOf(id), column: pick(['n', 't']) } }, 'user');
        expect(kernel.focus, `${label}: focus set`).toMatchObject({ row: keyOf(id) });
        check(label, null, null);
        continue;
      }
    } else {
      const shown = shownIds();
      const c = rnd();
      const m = matchesOf();
      if (c < 0.2) {
        label += ' select all';
        kernel.dispatch({ type: rnd() < 0.5 ? 'selection.all' : 'selection.allDisplayed' }, 'user');
        const taken = shown.filter((id) => !id.startsWith('g:') && (!m || m.has(id)));
        if (kernel.selection.mode === 'include') expect(new Set(kernel.selection.keys), `${label}: all = the data rows shown`).toEqual(new Set(taken.map(keyOf)));
      } else if (c < 0.45 && shown.length) {
        const id = pick(shown);
        const before = kernel.selection;
        label += ` select ${id}`;
        const res = kernel.dispatch({ type: rnd() < 0.5 ? 'selection.only' : 'selection.toggle', row: keyOf(id) }, 'user');
        // A filler is not a row of data: refused, nothing changes (tree-selection.md).
        if (id.startsWith('g:')) {
          expect(res.ok, `${label}: refused`).toBe(false);
          expect(kernel.selection, `${label}: unchanged`).toBe(before);
        } else expect(res.ok, `${label}: accepted`).toBe(true);
      } else if (c < 0.8 && shown.length) {
        const id = pick(shown);
        const additive = rnd() < 0.3;
        const anchor = kernel.anchor;
        label += ` range to ${id} ${additive}`;
        const res = kernel.dispatch({ type: 'selection.range', target: keyOf(id), additive }, 'user');
        if (res.ok && anchor !== null && !additive) {
          const a = shown.indexOf(idOfKey(anchor));
          const b = shown.indexOf(id);
          if (a >= 0) expect(new Set(kernel.selection.keys), `${label}: range, fillers skipped`).toEqual(new Set(shown.slice(Math.min(a, b), Math.max(a, b) + 1).filter((x) => !x.startsWith('g:')).map(keyOf)));
        }
      } else if (c < 0.9) {
        // The host's everything-except: a filler is never in it (header box, `selected` CSV).
        const except = shown.filter(() => rnd() < 0.3).map(keyOf);
        label += ` everything except ${except}`;
        kernel.dispatch({ type: 'selection.set', selection: { mode: 'exclude', keys: new Set(except) } }, 'api');
      } else {
        label += ' clear';
        kernel.dispatch({ type: 'selection.clear' }, 'user');
      }
    }
    check(label, prevFocus, exEvent);
  }
}

describe('a kernel random walk over nested and path trees, against an independent model', () => {
  for (const shape of ['children', 'path'] as const)
    for (const mode of ['ancestors', 'subtree'] as const)
      it(`agrees over ${SEEDS} seeds × ${STEPS} steps (${shape}, '${mode}')`, { timeout: 300_000 }, () => {
        for (let seed = 1; seed <= SEEDS; seed++) walk((shape === 'path' ? 50_000 : 0) + (mode === 'subtree' ? 10_000 : 0) + seed, shape, mode);
      });
});
