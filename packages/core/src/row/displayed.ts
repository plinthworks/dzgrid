import { idOfDataKey, type DisplayIndex, type RowKey, type SourceIndex } from '../ids.js';
import type { DataNode, RowNode } from './node.js';
import type { RowSnapshot } from './store.js';

/**
 * The rows as shown, at one version. A `DisplayIndex` means something only
 * for the version it came from, and `index()` is the only way to make one: it
 * checks the bounds. Positions never outlive a render; keys do.
 */
export interface DisplayedRows<T> {
  readonly version: number;
  readonly count: number;
  nodeAt(i: DisplayIndex): RowNode<T>;
  keyAt(i: DisplayIndex): RowKey;
  indexOf(key: RowKey): DisplayIndex | -1;
  index(n: number): DisplayIndex | null;
  nextData(i: DisplayIndex, delta: 1 | -1): DataNode<T> | null;
}

/** A flat list: `order` maps display → source, or null for the source order itself. */
export function flatDisplayed<T>(snap: RowSnapshot<T>, order: Uint32Array | null, version: number): DisplayedRows<T> {
  const count = order ? order.length : snap.count;
  const src = (i: number): SourceIndex => {
    if (!Number.isInteger(i) || i < 0 || i >= count) throw new RangeError(`no displayed row ${i}`);
    return (order ? order[i]! : i) as SourceIndex;
  };
  let back: Int32Array | null = null;
  // A short cut (a page) finds its rows in a table of its own size, not one of every row.
  let small: Map<number, number> | null = null;
  const self: DisplayedRows<T> = {
    version,
    count,
    nodeAt: (i) => snap.nodeAt(src(i)),
    keyAt: (i) => snap.keyAt(src(i)),
    index: (n) => (Number.isInteger(n) && n >= 0 && n < count ? (n as DisplayIndex) : null),
    indexOf(key) {
      const id = idOfDataKey(key);
      if (id === null) return -1;
      const s = snap.lookup(id);
      if (s < 0) return -1;
      if (!order) return s as number as DisplayIndex;
      if (order.length * 16 < snap.count) {
        if (!small) {
          small = new Map();
          for (let i = 0; i < order.length; i++) small.set(order[i]!, i);
        }
        const at = small.get(s);
        return at === undefined ? -1 : (at as DisplayIndex);
      }
      if (!back) {
        back = new Int32Array(snap.count).fill(-1);
        for (let i = 0; i < order.length; i++) back[order[i]!] = i;
      }
      const d = back[s]!;
      return d < 0 ? -1 : (d as DisplayIndex);
    },
    nextData(i, delta) {
      const j = i + delta;
      return j >= 0 && j < count ? snap.nodeAt(src(j)) : null;
    },
  };
  return self;
}
