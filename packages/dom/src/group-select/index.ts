import { isSelected, problem, type DisplayIndex, type FocusPos, type GroupNode, type KeyOwner, type RowKey } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';

/**
 * `groupSelect()`: beside `grouping()` with checkbox selection, a group row's box ticks every row under it (1.14.0,
 * docs/behaviors/row-grouping.md 25–29) — every level below, open or closed, after the filters (a server's groups: the
 * rows held) — and shows ticked, unticked or partly ticked from them; a click on it or Space on the group row. The
 * selection stays the rows' keys (`include` or « all except »); a group row is never selected itself. Its own entry.
 *
 * ```ts
 * import { grouping } from '@dzgrid/dom/grouping';
 * import { groupSelect } from '@dzgrid/dom/group-select';
 * createGrid(host, { …, selection: { mode: 'multi', checkbox: true }, features: [grouping({ by: ['region'] }), groupSelect()] });
 * ```
 */
export function groupSelect(): GridFeature {
  return { id: 'group-select', setup };
}

function setup(g: GridContext<unknown>): FeatureHandle {
  const { kernel, rowRenderer } = g;
  if (!g.settings.features?.some((f) => f.id === 'grouping')) emit(kernel, { type: 'problems', source: 'host', problems: [problem('missing-feature', 'warning', 'features.groupSelect', 'grouping')] });
  const multi = (): boolean => g.settings.selection?.mode === 'multi';
  // The rows under a group: in the browser's all-open rows (closed groups too, after the filters), else the rows shown (a
  // server's, those held); worked out once per rows and selection.
  let memo: [unknown, unknown, Map<RowKey, RowKey[]>] = [0, 0, new Map()];
  const under = (key: RowKey): RowKey[] => {
    const L = g.rows.allRows ?? g.rows.displayed;
    if (memo[0] !== L || memo[1] !== kernel.selection) memo = [L, kernel.selection, new Map()];
    let out = memo[2].get(key);
    if (out) return out;
    memo[2].set(key, (out = []));
    const lv = (j: number): number => L.levelAt?.(j as DisplayIndex) ?? L.nodeAt(j as DisplayIndex).level;
    const i = L.indexOf(key);
    for (let j = i < 0 ? L.count : i + 1; j < L.count && lv(j) > lv(i); j++) if (L.nodeAt(j as DisplayIndex).kind === 'data') out.push(L.keyAt(j as DisplayIndex));
    return out;
  };
  /** 'true', 'false' or 'mixed'; no row held: as « all » says (the box then unavailable). */
  const state = (key: RowKey): string => {
    const s = kernel.selection;
    const ks = under(key);
    const n = ks.filter((k) => isSelected(s, k)).length;
    return ks.length ? (n === ks.length ? 'true' : n ? 'mixed' : 'false') : String(s.mode === 'exclude' && !s.keys.size);
  };
  /** Every row under it ticked, or (all ticked) unticked: one selection, the user's. */
  const flip = (key: RowKey): true => {
    const ks = under(key);
    const s = kernel.selection;
    const on = state(key) !== 'true';
    const keys = new Set(s.keys);
    for (const k of ks) on === (s.mode === 'include') ? keys.add(k) : keys.delete(k);
    if (ks.length) kernel.dispatch({ type: 'selection.set', selection: { mode: s.mode, keys } }, 'user');
    return true;
  };
  const group = (key: RowKey | undefined): GroupNode | null => {
    const d = g.rows.displayed;
    const i = key ? d.indexOf(key) : -1;
    const n = i < 0 ? null : d.nodeAt(i as DisplayIndex);
    return n?.kind === 'group' ? n : null;
  };
  // A click on a group row's box (its pinned copy's too): before the grid's own reading of the click.
  g.scope.on(g.el.viewport, 'click', (e: MouseEvent) => {
    const row = (e.target as Element).closest?.('.dzg-check')?.closest('.dzg-row');
    const key = row ? rowRenderer.keyOf(row) : undefined;
    if (!multi() || !group(key)) return;
    e.stopPropagation();
    flip(key!);
  }, { capture: true });
  return {
    keys(e: KeyboardEvent, at: FocusPos | null, owner: KeyOwner): boolean {
      // Space on a group row, in any column (row-grouping.md 27).
      return e.key === ' ' && owner === 'cell' && at?.kind === 'cell' && !(e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) && multi() && !!group(at.row) && flip(at.row);
    },
    afterRows() {
      // A group row's box: a checkbox named by its label (28); a data row's box given back to the grid as it was.
      rowRenderer.forEach((key, v) => {
        const b = v.check?.firstChild as HTMLElement | undefined;
        const n = b && multi() ? group(key) : null;
        if (n) {
          const set = (a: string, x: string | null): void => void (x === null ? b!.removeAttribute(a) : b!.getAttribute(a) !== x && b!.setAttribute(a, x));
          b!.hidden = false;
          set('aria-hidden', null);
          set('role', 'checkbox');
          set('aria-checked', state(key));
          set('aria-label', g.grouped?.label(n) ?? n.label);
          set('aria-disabled', under(key).length ? null : 'true');
        } else if (b?.hasAttribute('role')) {
          for (const a of ['role', 'aria-checked', 'aria-label', 'aria-disabled']) b.removeAttribute(a);
          b.setAttribute('aria-hidden', 'true');
        }
      });
    },
    destroy() {},
  };
}
