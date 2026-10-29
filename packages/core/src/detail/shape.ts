import { detailKey, idOfDataKey, type DisplayIndex, type RowKey } from '../ids.js';
import type { RowShape } from '../model/client.js';
import type { RowSnapshot } from '../row/store.js';
import { problem, type Problem } from '../problems.js';
import { flatDisplayed, type DisplayedRows } from '../row/displayed.js';
import type { DataNode, RowNode } from '../row/node.js';
import { lower } from './layout.js';

export interface DetailOptions<T> {
  /** A detail's height: a number (default 240, owner Q4), a function of the master's row, or `'auto'` (240 until measured). */
  readonly height?: number | ((master: Readonly<T>) => number) | 'auto';
  /** What is open at the first non-empty load: nothing (default) or every row. */
  readonly initial?: 'none' | 'all';
  /**
   * Heights measured by master key, read at each build (a measure wins over `height`): the DOM's
   * live map for `'auto'`, kept across a close so a reopened panel starts at its last height. A
   * frame's new measures go to the current layout in one `setHeights`.
   */
  readonly sizes?: ReadonlyMap<RowKey, number>;
  /**
   * Whether a row has a detail (master-detail.md « Rows without a detail »): asked once per row and version of the
   * rows; a throw is no. Default: every row.
   */
  readonly isMaster?: (master: Readonly<T>) => boolean;
}

/** The rows shown with their details: one `x:` row right after each open master. */
export interface DetailRows<T> extends DisplayedRows<T> {
  /** The data rows: what select-all and the header box count. */
  readonly dataCount: number;
  /** The detail rows' display indices, increasing. */
  readonly details: Uint32Array;
  /** Their heights: a measure in `sizes`, else as `height` says (`'auto'`: 240). */
  readonly heights: readonly number[];
  /** A detail's master; null for a data row. */
  parentOf(key: RowKey): RowKey | null;
  /** Whether a data row has a detail (`isMaster`), in these rows' version: what the chevron and the keys read (always set by `detailShape`). */
  isMaster?(key: RowKey): boolean;
}

export interface DetailShape<T> extends RowShape<T> {
  readonly kind: 'detail';
}

/** A height: a finite number ≥ 0, else 240 (owner Q4). */
const fix = (v: unknown): number => (v === +v! && v >= 0 && v < Infinity ? v : 240);

/**
 * Master/detail (D2, D8, master-detail.md): over the order the model hands it (filtered, sorted,
 * paged), a detail row right after each open master: the flat rows of that order, and the open
 * masters' places among them (sorted), found by binary search.
 */
export function detailShape<T>(o: DetailOptions<T> = {}): DetailShape<T> {
  const H = o.height;
  const M = o.isMaster;
  /** The last build's data rows (a new flat list per build: its index of keys made on the first lookup). */
  let shown: DisplayedRows<T>;
  /**
   * Whether a data row is a master, in a version of the rows (`snap`): `fx`, 1 for a master, the app's function asked
   * once per row and version (as the tree's `fixedOpen`); a throw is no (fail closed, silently as `height`); a key the
   * rows lack: yes.
   */
  /** The open keys of the last build. */
  let open: ReadonlySet<RowKey> | undefined;
  let S: RowSnapshot<T> | undefined;
  let F: unknown;
  let fx: Uint8Array;
  const is = (key: RowKey, snap = S): boolean => {
    if (!M || !snap) return true;
    if (snap !== F) (F = snap), (fx = Uint8Array.from(snap.rows, ((r: T) => { try { return +!!M(r); } catch {} }) as (r: T) => number));
    const i = snap.lookup(idOfDataKey(key) ?? '');
    return i < 0 || !!fx[i];
  };
  return {
    kind: 'detail',
    ...(o.initial && { initial: o.initial }),
    problems: [],
    // A master (the kernel refuses a row it does not hold); a detail's or a filler's key opens nothing. A key already
    // open is always let through, so a row that stopped being a master can still be closed (review of 16c).
    opens: (key) => key.startsWith('d:') && (!!open?.has(key) || is(key)),
    // Every master (initial, expandable), none at depth 0 (masters are level 0, as a tree's roots);
    // `now`: the data rows of the last build (expand-all).
    parents(snap, depth, now) {
      const r = now ? shown : flatDisplayed(snap, null, 0);
      return Array.from({ length: depth && r.count }, (_, i) => r.keyAt(i as DisplayIndex)).filter((k) => is(k, snap));
    },
    build({ snap, order, expansion, version }) {
      open = expansion;
      const d = (shown = flatDisplayed((S = snap), order, 0));
      const isMaster = (k: RowKey): boolean => is(k, snap);
      // The open masters' places among the data rows (a row no longer a master shows closed, its key kept), and
      // their details' among all the rows.
      const ms = Uint32Array.from([...expansion].filter(isMaster).map((k) => d.indexOf(k)).filter((p) => p >= 0)).sort();
      const details = ms.map((p, j) => p + j + 1);
      // Each open master's detail height (owner Q4), for the layout: `sparseRowLayout(rows, h, { at: rows.details, heights: rows.heights })`.
      const heights = Array.from(ms, (p) => {
        const m = d.nodeAt(p as DisplayIndex) as DataNode<T>;
        let v: unknown = o.sizes?.get(m.key) ?? H;
        // A function that throws: 240, silently (no problem told: the entry's budget has no room, step 8 review).
        try {
          if (typeof v == 'function') v = v(m.data);
        } catch {}
        return fix(v);
      });
      const count = d.count + ms.length;
      const index = (n: number) => (n >= 0 && n < count && n % 1 == 0 ? (n as DisplayIndex) : null);
      /** A data row's place among the data rows, or ~j for the j-th detail; out of the rows, out of the flat ones (their RangeError: NaN for a negative row, so never a detail). */
      const place = (i: number): number => {
        const j = lower(ms.length, (m) => details[m]! < i);
        return details[j] === i ? ~j : i < 0 ? NaN : i - j;
      };
      const nodeAt = (i: number): RowNode<T> => {
        const p = place(i);
        if (p >= 0) return d.nodeAt(p as DisplayIndex);
        const m = d.nodeAt(ms[~p] as DisplayIndex) as DataNode<T>;
        return { key: detailKey(m.key), kind: 'detail', level: m.level, master: m.key, data: m.data };
      };
      return {
        version,
        count,
        dataCount: d.count,
        details,
        heights,
        nodeAt,
        keyAt: (i) => nodeAt(i).key,
        index,
        indexOf(key) {
          const x = key.startsWith('x:');
          const p = d.indexOf((x ? key.slice(2) : key) as RowKey);
          const j = lower(ms.length, (m) => ms[m]! < p);
          return (p < 0 ? -1 : !x ? p + j : ms[j] === p ? p + j + 1 : -1) as DisplayIndex | -1;
        },
        // The flat rows' neighbour: from a detail, its master's (back: the master itself).
        nextData(i, s) {
          const p = place(i);
          return d.nextData((p < 0 ? ms[~p]! + +(s < 0) : p) as DisplayIndex, s);
        },
        parentOf: (key) => (key.startsWith('x:') ? (key.slice(2) as RowKey) : null),
        isMaster,
      } satisfies DetailRows<T>;
    },
  };
}

/**
 * What details refuse beside them (D9, owner Q5): spans and a tree, told by the grid, which shows
 * the details without the other feature; and a nested grid's `depth` past 3 (1: a grid not inside
 * a detail), told by that grid, which still works (soft cap).
 */
export function detailConflicts(o: { readonly spans?: boolean; readonly tree?: boolean; readonly depth?: number }): Problem[] {
  return ['spans', 'tree', 'detail.depth'].filter((f, i) => (i > 1 ? o.depth! > 3 : o[f as 'tree'])).map((f) => problem('unsupported-combination', 'warning', f, f < 'e' ? String(o.depth) : 'detail'));
}
