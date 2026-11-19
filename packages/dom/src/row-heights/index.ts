import { problem, uniformRowLayout, variableRowLayout, type DisplayIndex, type RowKey } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';

/**
 * `rowHeights()`: each data row as tall as `rowHeight: (row) => number` says (1.14.0, docs/behaviors/virtual-scroll.md
 * « Row height by a function » 1–6). The answers are kept by row key and asked again only when the row's data changes,
 * when the rows are laid out again with no change of data (`refresh()`, a new density or text size), or when the
 * function changes. The offsets are running totals (a Fenwick tree), the row at an offset found by binary search: the
 * scroll is exact. A number `rowHeight` (or none): unchanged. Composes with the detail panels' layout (theirs kept).
 *
 * ```ts
 * import { rowHeights } from '@dzgrid/dom/row-heights';
 * createGrid(host, { …, rowHeight: (r) => (r.photo ? 64 : 32), features: [rowHeights()] });
 * ```
 */
export function rowHeights(): GridFeature {
  return { id: 'row-heights', setup };
}

function setup(g: GridContext<unknown>): FeatureHandle {
  let inner = g.layoutFor;
  /** By key: the data asked with, and the height given (px at 16 px text, held to 24…1 000; NaN: the density's). */
  const asked = new Map<RowKey, readonly [unknown, number]>();
  let was: unknown;
  let fnWas: unknown;
  let told = false;
  const tell = (code: 'invalid-setting' | 'unsupported-combination', detail?: string): void =>
    void (told || ((told = true), emit(g.kernel, { type: 'problems', source: 'host', problems: [problem(code, 'warning', 'settings.rowHeight', detail)] })));
  const mine: NonNullable<typeof inner> = (d, h, w) => {
    const L = inner?.(d, h, w);
    const fn = g.settings.rowHeight;
    if (typeof fn != 'function') return L ?? uniformRowLayout(d, h);
    // Rows loaded in blocks (ten million positions): one height, told (no array per position).
    if (d.held) return tell('unsupported-combination', 'blocks'), L ?? uniformRowLayout(d, h);
    // The same rows laid out again (refresh, a new row height) or a new function: every row asked again.
    if (d === was || fn !== fnWas) asked.clear();
    was = d;
    fnWas = fn;
    for (const k of asked.keys()) if (!g.rows.row(k)) asked.delete(k);
    const hs = new Float64Array(d.count);
    for (let i = 0; i < d.count; i++) {
      const n = d.nodeAt(i as DisplayIndex);
      let a = n.kind == 'data' ? asked.get(n.key) : undefined;
      if (n.kind == 'data' && a?.[0] !== n.data) {
        let v: unknown = NaN;
        try {
          v = fn(n.data);
          if (typeof v != 'number' || !(v >= 24 && v <= 1e3)) tell('invalid-setting', String(v));
        } catch (err) {
          g.report(err);
        }
        asked.set(n.key, (a = [n.data, typeof v == 'number' ? Math.min(1e3, Math.max(24, v)) : NaN]));
      }
      // Not a data row (a group, a panel): the inner layout's, else the density's.
      hs[i] = a ? (a[1] === a[1] ? Math.max(24, Math.round((a[1] * g.remPx) / 16)) : h) : L ? L.heightOf(i as DisplayIndex) : h;
    }
    const V = variableRowLayout(d, h, hs);
    // A panel measured after the paint (`detail` 'auto') sets its height here as on its own layout.
    return Object.assign(V, { setHeights: (cs: Iterable<readonly [DisplayIndex, number]>) => [...cs].reduce((c, [i, v]) => V.setHeight(i, v) || c, false) });
  };
  Object.defineProperty(g, 'layoutFor', {
    configurable: true,
    get: () => mine,
    set: (f) => void ((inner = f), delete g.laid),
  });
  delete g.laid;
  return {
    destroy() {
      delete (g as { layoutFor?: unknown }).layoutFor;
      g.layoutFor = inner;
    },
  };
}
