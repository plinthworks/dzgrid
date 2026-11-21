import { isSelected, problem, type DisplayIndex, type FocusPos, type KeyOwner, type RowKey } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import type { TreeRows } from '@dzgrid/core/tree';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';

/**
 * `treeSelect()`: beside `tree()` with checkbox selection, cascading ticks (1.16.0, docs/behaviors/tree-selection.md
 * « Cascading ticks » 1–6). A click on a box or Space on a row ticks or unticks the row and every row under it (every
 * level, open or closed, after the filters), then ticks each row above when every row under it is ticked, unticks it
 * otherwise; a parent's box shows its branch ticked, unticked or partly ticked. Children not loaded yet arrive ticked
 * under a ticked parent. The selection stays the rows' keys. Its own entry.
 *
 * ```ts
 * import { tree } from '@dzgrid/dom/tree';
 * import { treeSelect } from '@dzgrid/dom/tree-select';
 * createGrid(host, { …, selection: { mode: 'multi', checkbox: true }, features: [tree({ parentId }), treeSelect()] });
 * ```
 */
export function treeSelect(): GridFeature {
  return { id: 'tree-select', setup };
}

function setup(g: GridContext<unknown>): FeatureHandle {
  const { kernel, rowRenderer } = g;
  if (!g.settings.features?.some((f) => f.id === 'tree')) emit(kernel, { type: 'problems', source: 'host', problems: [problem('missing-feature', 'warning', 'features.treeSelect', 'tree')] });
  const multi = (): boolean => g.settings.selection?.mode === 'multi';
  // Every row the filters keep, all open (closed branches too); worked out once per rows.
  const rows = () => g.rows.allRows ?? g.rows.displayed;
  let memo: [unknown, Map<RowKey, RowKey[]>] = [0, new Map()];
  const lv = (j: number): number => rows().levelAt?.(j as DisplayIndex) ?? rows().nodeAt(j as DisplayIndex).level;
  /** The data rows under a row, every level. */
  const under = (key: RowKey): RowKey[] => {
    const L = rows();
    if (memo[0] !== L) memo = [L, new Map()];
    let out = memo[1].get(key);
    if (out) return out;
    memo[1].set(key, (out = []));
    const i = L.indexOf(key);
    for (let j = i < 0 ? L.count : i + 1; j < L.count && lv(j) > lv(i); j++) if (L.nodeAt(j as DisplayIndex).kind === 'data') out.push(L.keyAt(j as DisplayIndex));
    return out;
  };
  /** The rows above it, the nearest first. */
  const above = (key: RowKey): RowKey[] => {
    const L = rows();
    const out: RowKey[] = [];
    let i = L.indexOf(key);
    for (let j = i - 1, at = i < 0 ? 0 : lv(i); j >= 0 && at > 0; j--) if (lv(j) < at) out.push(L.keyAt(j as DisplayIndex)), (at = lv(j));
    return out;
  };
  /** Children not loaded yet (tree-lazy.md): -1 children on screen. */
  const unloaded = (key: RowKey): boolean => {
    const d = g.rows.displayed as Partial<TreeRows<unknown>>;
    const i = d.indexOf!(key);
    return i >= 0 && d.childrenAt?.(i as DisplayIndex) === -1;
  };
  /** Parents ticked before their children loaded: those arrive ticked (5). */
  const waiting = new Set<RowKey>();
  /** 'true', 'false' or 'mixed' for the row and its branch (a row a selection rule refuses counts as ticked). */
  const state = (key: RowKey): string => {
    const s = kernel.selection;
    const ks = [key, ...under(key)];
    const n = ks.filter((k) => isSelected(s, k)).length;
    return !n ? 'false' : n + ks.filter((k) => !isSelected(s, k) && g.refused?.(k)).length === ks.length ? 'true' : 'mixed';
  };
  /** Ticks (`on`) or unticks the rows, then the rows above them from their branches: one selection. */
  const set = (ks: readonly RowKey[], on: boolean, from: RowKey, source: 'user' | 'api'): void => {
    const s = kernel.selection;
    const keys = new Set(s.keys);
    const put = (k: RowKey, v: boolean): void => void (v === (s.mode === 'include') ? keys.add(k) : keys.delete(k));
    const has = (k: RowKey): boolean => (s.mode === 'include') === keys.has(k) || !!g.refused?.(k);
    for (const k of ks) put(k, on);
    for (const a of above(from)) put(a, under(a).every(has));
    kernel.dispatch({ type: 'selection.set', selection: { mode: s.mode, keys } }, source);
  };
  /** A box or Space: a branch ticked or unticked (3). */
  const flip = (key: RowKey): true => {
    const on = state(key) !== 'true';
    if (unloaded(key)) on ? waiting.add(key) : waiting.delete(key);
    set([key, ...under(key)], on, key, 'user');
    return true;
  };
  const data = (key: RowKey | undefined): key is RowKey => !!key && key[0] === 'd' && rows().indexOf(key) >= 0;
  // A plain click on a row's box: before the grid's own reading of the click.
  g.scope.on(g.el.viewport, 'click', (e: MouseEvent) => {
    const row = (e.target as Element).closest?.('.dzg-check')?.closest('.dzg-row');
    const key = row ? rowRenderer.keyOf(row) : undefined;
    if (!multi() || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || !data(key)) return;
    e.stopPropagation();
    flip(key);
  }, { capture: true });
  return {
    keys(e: KeyboardEvent, at: FocusPos | null, owner: KeyOwner): boolean {
      return e.key === ' ' && owner === 'cell' && at?.kind === 'cell' && !(e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) && multi() && data(at.row) && flip(at.row);
    },
    afterRows() {
      // Children arrived under a parent ticked before them (5): ticked too.
      for (const p of waiting) {
        if (unloaded(p) || rows().indexOf(p) < 0) continue;
        waiting.delete(p);
        if (isSelected(kernel.selection, p) && under(p).some((k) => !isSelected(kernel.selection, k))) set(under(p), true, p, 'api');
      }
      // A parent's box: a checkbox named by its row, its branch's state (2); a leaf's given back to the grid as it was.
      const tc = g.treeColumn?.();
      rowRenderer.forEach((key, v) => {
        const b = v.check?.firstChild as HTMLElement | undefined;
        const parent = b && multi() && data(key) && (under(key).length > 0 || unloaded(key));
        if (parent) {
          const attr = (a: string, x: string | null): void => void (x === null ? b!.removeAttribute(a) : b!.getAttribute(a) !== x && b!.setAttribute(a, x));
          attr('aria-hidden', null);
          attr('role', 'checkbox');
          attr('aria-checked', state(key));
          attr('aria-label', v.cells.get(typeof tc == 'function' ? tc(v.data) ?? '' : tc ?? '')?.el.textContent ?? null);
        } else if (b?.hasAttribute('role')) {
          for (const a of ['role', 'aria-checked', 'aria-label']) b.removeAttribute(a);
          b.setAttribute('aria-hidden', 'true');
        }
      });
    },
    destroy() {},
  };
}
