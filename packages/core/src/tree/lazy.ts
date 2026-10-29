import type { AbortHandle, AbortSignalLike } from '../abort.js';
import { canonicalId, dataKey, type DisplayIndex, type RowIdInput, type RowKey } from '../ids.js';
import type { ClientModel, ShapeInput } from '../model/client.js';
import type { LoadingNode } from '../row/node.js';
import type { RowSnapshot } from '../row/store.js';
import type { TreeRows, TreeShape } from './shape.js';

/** What `lazyShape` is told by the host (tree-lazy.md). */
export interface LazyOptions<T> {
  /** Whether a row has children not loaded yet: read for the rows shown and a row being opened. */
  readonly has: (row: T) => boolean;
  /** The host's loader (A): the row's children, a list or a Promise of one. A server's `children` (B) takes its place. */
  readonly load?: (row: T, o: { readonly signal: AbortSignalLike }) => PromiseLike<readonly T[]> | readonly T[];
}

/**
 * Starts one parent's load and returns how to abort it. `answer(true, rows)` with the children (a
 * list, or `{ rows }`), `answer(false, error)` on a failure; an answer after the abort is ignored.
 * Never answers synchronously: the load starts while the model tells a change.
 */
export type ChildLoader<T> = (parent: RowKey, row: T, answer: (ok: boolean, value: unknown) => void) => () => void;

/** The loads of a lazy tree. */
export interface LazyControl<T> {
  /** Set by a server's model (`children`, B); otherwise made from `load` (A). */
  loader: ChildLoader<T> | null;
  /** Where `load` takes its abort handles (the DOM gives the window's `AbortController`); a recording one otherwise. */
  abort: (() => AbortHandle) | null;
  /** A failed parent asks again. */
  retry(parent: RowKey): void;
  /**
   * The loads of the rows shown open started now (else at the next change): rows open from the first build (`fixedOpen`)
   * load once the host is ready (the DOM calls it after setting `abort`).
   */
  sync(): void;
  /** Every load forgotten, those running aborted (a new epoch, a refresh, a model destroyed); `again`: shown again at once, the open parents ask again (a server's refresh). */
  reset(again?: boolean): void;
  /** Told after each answer applied: the parent, whether it loaded, and the request's number (`diagnostics.started` once it began). */
  on(fn: (parent: RowKey, ok: boolean, request: number) => void): () => void;
  readonly diagnostics: { readonly started: number; readonly answered: number; readonly failed: number; readonly aborted: number; readonly live: number };
}

export interface LazyShape<T> extends TreeShape<T> {
  readonly lazy: LazyControl<T>;
}

/** A load running (and its abort), failed (1) or answered (2): the object is the request's token. */
type State = { readonly s: 0; stop: () => void } | { readonly s: 1 | 2 };
/** A loading row of a build: under the row at `at` (an index of the tree's own rows). */
interface Slot { readonly at: number; readonly parent: RowKey; readonly level: number; readonly failed: boolean }

/**
 * A tree whose declared rows load their children when they open (D10, tree-lazy.md). Its rows are
 * the tree's, with one loading row under each open declared parent that holds no child and has not
 * answered. After each change of the model it is handed to, a loading row without a request starts
 * one and a request whose row is gone is aborted: one request per loading row shown, every request
 * answered or aborted. Answers go in as a transaction (`data`); the rows loaded are the cache until
 * `setRows` (every load forgotten) or a refresh (they are removed, open parents load again).
 */
export function lazyShape<T>(inner: TreeShape<T>, o: LazyOptions<T>): LazyShape<T> {
  const states = new Map<RowKey, State>();
  /** The ids of the rows the loads brought: what a refresh removes. */
  let loaded = new Set<string>();
  let model: ClientModel<T> | null = null;
  let redraw = (): void => {};
  let idOf: (row: T) => RowIdInput = () => '';
  let last: TreeRows<T> | null = null;
  let slots: Slot[] = [];
  /** The rows shown open by the inner shape alone (`fixedOpen`) while their children are not loaded: never toggled. */
  let kept = new Set<RowKey>();
  /** Loads forgotten since the last sync: a setRows that shows nothing new must show the rows again. */
  let forgot = false;
  const fns = new Set<(parent: RowKey, ok: boolean, request: number) => void>();
  const d = { started: 0, answered: 0, failed: 0, aborted: 0 };

  /** A row declared, holding no child whatever the filter, not answered: one to load when open. */
  // `data`: the row's (a build reads it from its rows: the first one comes before the model is attached).
  const unloaded = (key: RowKey, rows: TreeRows<T> | null, data = model?.row(key)?.data): boolean =>
    data !== void 0 && !rows?.kidsOf(key) && states.get(key)?.s !== 2 && o.has(data as T);
  /** Its load stopped and forgotten (closed, hidden, reset). */
  const drop = (key: RowKey): void => {
    const st = states.get(key);
    states.delete(key);
    if (st?.s === 0) d.aborted++, st.stop();
  };

  /** The host's loader (A), called at once, settled in a later task (a throw too); its signal from `abort` (a recording one without). */
  const fromLoad: ChildLoader<T> = (_p, row, answer) => {
    const signal = { aborted: false };
    const h = ctl.abort?.() ?? { signal, abort: () => void (signal.aborted = true) };
    new Promise((ok) => ok(o.load!(row, { signal: h.signal }))).then((v) => answer(true, v), (e) => answer(false, e));
    return () => h.abort();
  };

  const start = (key: RowKey): void => {
    const st: State = { s: 0, stop: () => {} };
    states.set(key, st);
    const no = ++d.started;
    const answer = (ok: boolean, v: unknown): void => {
      if (states.get(key) !== st) return;
      const rows = (!ok ? null : Array.isArray(v) ? v : Array.isArray((v as { rows?: unknown } | null)?.rows) ? (v as { rows: T[] }).rows : null) as T[] | null;
      states.set(key, { s: rows ? 2 : 1 });
      rows ? d.answered++ : d.failed++;
      let shown = false;
      if (rows?.length) {
        for (const r of rows) {
          try {
            const id = canonicalId(idOf(r));
            if (id !== null && !model!.row(dataKey(id)!)) loaded.add(id);
          } catch {}
        }
        shown = model!.applyTransaction({ add: rows }, 'data').kind !== 'none';
      }
      // A failure, no child, or none taken: the loading row goes or turns, nothing else does.
      if (!shown) redraw();
      for (const fn of [...fns]) fn(key, !!rows, no);
    };
    st.stop = (ctl.loader ?? fromLoad)(key, model!.row(key)!.data as T, answer);
  };

  /** After each change: a load for each loading row without one; the loads whose row went, aborted (a failure forgotten). */
  const sync = (): void => {
    forgot = false;
    const want = new Set(slots.map((x) => x.parent));
    for (const [key, st] of [...states]) if (st.s < 2 && !want.has(key)) drop(key);
    for (const x of slots) if (!states.has(x.parent)) start(x.parent);
  };

  const ctl: LazyControl<T> = {
    loader: null,
    abort: null,
    sync: () => sync(),
    retry(parent) {
      if (states.get(parent)?.s !== 1) return;
      states.delete(parent);
      redraw();
    },
    reset(again) {
      for (const key of [...states.keys()]) drop(key);
      loaded = new Set();
      forgot = true;
      if (again) redraw();
    },
    on(fn) {
      fns.add(fn);
      return () => void fns.delete(fn);
    },
    get diagnostics() {
      let live = 0;
      for (const st of states.values()) if (st.s === 0) live++;
      return { ...d, live };
    },
  };

  return Object.assign(Object.create(inner) as LazyShape<T>, {
    lazy: ctl,
    attach(m: ClientModel<T>, re: () => void) {
      model = m;
      redraw = re;
      m.subscribe(sync);
      const { setRows, destroy } = m;
      // Rows that show nothing new (the same objects, a refresh's roots) still forgot the loads: shown again, the open parents ask.
      m.setRows = (rows, source) => {
        const r = setRows(rows, source);
        if (forgot) redraw();
        return r;
      };
      // Destroyed: every load aborted, an answer after it ignored.
      m.destroy = () => (ctl.reset(), destroy());
    },
    // New rows (setRows): the cache forgotten (what was loaded asks again when open and empty); a load
    // running goes on while its row shows, and stops with it (the next change), as a failure stays.
    load(rows: Iterable<T>, id: (row: T) => RowIdInput) {
      idOf = id;
      loaded = new Set();
      for (const [key, st] of [...states]) if (st.s === 2) states.delete(key), (forgot = true);
      return inner.load ? inner.load(rows, id) : rows;
    },
    // A refresh: the rows the loads brought go; the open parents then load again.
    refresh() {
      // Only those still held: a row the host removed since is not removed again (no unknown-row-id).
      const ids = [...loaded].filter((id) => model?.row(dataKey(id)!));
      ctl.reset();
      if (ids.length) model?.applyTransaction({ remove: ids }, 'data');
    },
    // A row the inner shape keeps open by itself (`fixedOpen`) is never toggled, loaded or not.
    opens: (key: RowKey) => !!inner.opens?.(key) || (unloaded(key, last) && !kept.has(key)),
    // Collapse-all closes a parent showing a loading row too (expand-all never opens one: no burst of requests).
    parents(snap: RowSnapshot<T>, depth: number, shown?: boolean) {
      const out = inner.parents?.(snap, depth, shown) ?? [];
      return shown ? [...out, ...slots.filter((x) => x.level <= depth).map((x) => x.parent)] : out;
    },
    build(i: ShapeInput<T>) {
      const t = (last = inner.build(i) as TreeRows<T>);
      // Every row shown open: the user's, those opened under a filter (an ancestor of a match shows children), and
      // those the inner shape keeps open by itself (`fixedOpen`, tree-view.md: `kept`, neither the user's nor the layer's).
      const out: Slot[] = [];
      kept = new Set();
      for (let at = 0 as DisplayIndex; at < t.count; at++) {
        const key = t.keyAt(at);
        if (t.expandedAt(at) && unloaded(key, t, (t.nodeAt(at) as { data?: T }).data)) out.push({ at, parent: key, level: t.levelAt(at) + 1, failed: states.get(key)?.s === 1 }), (i.layer?.get(key) ?? i.expansion.has(key)) || kept.add(key);
      }
      slots = out.sort((a, b) => a.at - b.at);
      return withLoading(t, slots, (key) => unloaded(key, t));
    },
  });
}

const lk = (parent: RowKey): RowKey => `l:${parent}` as RowKey;
/** How many of `xs` (ascending) are below `n`. */
const below = (xs: readonly number[], n: number): number => {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (xs[m]! < n) lo = m + 1;
    else hi = m;
  }
  return lo;
};

/** A tree's rows with a loading row under each slot's parent; a declared row not loaded says -1 children. */
function withLoading<T>(t: TreeRows<T>, slots: readonly Slot[], unloaded: (key: RowKey) => boolean): TreeRows<T> {
  const ats = slots.map((x) => x.at);
  // Where each loading row stands among the rows shown.
  const pos = slots.map((x, j) => x.at + 1 + j);
  const count = t.count + slots.length;
  /** A shown index: the tree's own row (≥ 0), or ~j for the j-th loading row. */
  const loc = (i: number): number => {
    if (!Number.isInteger(i) || i < 0 || i >= count) throw new RangeError(`no displayed row ${i}`);
    const j = below(pos, i);
    return pos[j] === i ? ~j : i - j;
  };
  const via = <R>(f: (x: DisplayIndex) => R, slot: (x: Slot) => R) => (i: DisplayIndex): R => {
    const x = loc(i);
    return x < 0 ? slot(slots[~x]!) : f(x as DisplayIndex);
  };
  const nodeAt = via<ReturnType<TreeRows<T>['nodeAt']>>(t.nodeAt, (x): LoadingNode => ({ key: lk(x.parent), kind: 'loading', level: x.level, parent: x.parent, failed: x.failed }));
  const indexOf = (key: RowKey): DisplayIndex | -1 => {
    const j = slots.findIndex((x) => lk(x.parent) === key);
    if (j >= 0) return pos[j] as DisplayIndex;
    const x = t.indexOf(key);
    return x < 0 ? -1 : ((x + below(ats, x)) as DisplayIndex);
  };
  const childrenAt = via(
    (x) => {
      const n = t.childrenAt(x);
      return n || !unloaded(t.keyAt(x)) ? n : -1;
    },
    () => 0,
  );
  return {
    ...t,
    count,
    nodeAt,
    keyAt: via(t.keyAt, (x) => lk(x.parent)),
    index: (n) => (Number.isInteger(n) && n >= 0 && n < count ? (n as DisplayIndex) : null),
    indexOf,
    nextData: (i, delta) => (i + delta >= 0 && i + delta < count ? (nodeAt((i + delta) as DisplayIndex) as never) : null),
    // A loading row's parent while it shows no child (loading, failed, closed, answered empty); once its
    // children show, none: a focus on the loading row then goes to the row at its place, the first child.
    parentOf(key) {
      if (!key.startsWith('l:')) return t.parentOf(key);
      const p = key.slice(2) as RowKey;
      const i = indexOf(p) as DisplayIndex;
      return i >= 0 && childrenAt(i) > 0 ? null : p;
    },
    levelAt: via(t.levelAt, (x) => x.level),
    posAt: via(t.posAt, () => 1),
    sizeAt: via(t.sizeAt, () => -1),
    childrenAt,
    expandedAt: via(t.expandedAt, () => false),
    matchedAt: via(t.matchedAt, () => true),
  };
}
