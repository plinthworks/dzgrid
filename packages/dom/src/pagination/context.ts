import { isSelected, type GridCommand } from '@dzgrid/core';
import type { GridContext } from '../context.js';
import type { PartBase, SlotContext } from '../part.js';

/** What a footer part gets besides what every part gets. */
export type Own = Omit<SlotContext['footer'], keyof PartBase>;
type Msg = PartBase['msg'];

export const el = <K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls: string): HTMLElementTagNameMap[K] => {
  const e = doc.createElement(tag);
  e.className = cls;
  return e;
};
/** A native button of the footer (`dzg-pbtn`), its data attribute naming what it does. */
export const button = (doc: Document, data: string, value: string): HTMLButtonElement => {
  const b = el(doc, 'button', 'dzg-pbtn');
  b.type = 'button';
  b.setAttribute(data, value);
  return b;
};
/** Written only when it changes: a paint that changes nothing touches nothing. */
export const tx = (e: Node, v: string): void => {
  if (e.textContent !== v) e.textContent = v;
};
export const attr = (e: Element, name: string, v: string): void => {
  if (e.getAttribute(name) !== v) e.setAttribute(name, v);
};

/**
 * Where the user is, in words (`footer.count`, and the page's announcement): loading, the
 * failure, no rows, then the range with the filtered count beside the total when they differ,
 * else the total, else none (a server that does not know it). Words, never a dash: right to
 * left reads them the same.
 */
export function words(msg: Msg, c: Own): string {
  const r = c.range;
  const { total, filtered } = c.counts;
  const phase = c.status.phase;
  return phase !== 'idle' ? msg(phase === 'loading' ? 'grid.loading' : 'grid.error')
    : !r ? msg('announce.rows', { n: 0 })
    : filtered !== null && total !== null && filtered !== total ? msg('count.filtered', { ...r, filtered, total })
    : c.page.total !== null ? msg('count.range', { ...r, total: c.page.total })
    : msg('count.rangeOpen', r);
}

/**
 * The footer's context, read at each paint: the model's page, counts and status, the range shown,
 * the selection as the footer says it. An object equal key by key to the last one comes back as
 * the last one, and the functions are made once, so a part's `update` runs only on a change.
 * `act` sends a page command as the user (the feature says the page that follows).
 */
export function footerContext(g: GridContext<unknown>, act: (cmd: GridCommand) => void): () => Own {
  const k = g.kernel;
  const memo: Record<string, Record<string, unknown>> = {};
  const same = <V extends object>(key: string, v: V): V => {
    const m = memo[key];
    const n = v as Record<string, unknown>;
    return m && Object.keys(n).length === Object.keys(m).length && Object.keys(n).every((x) => Object.is(m[x], n[x])) ? (m as V) : ((memo[key] = n), v);
  };
  let count: number | null = 0;
  // Heard after the grid asked for its paint: asked again, so the paint reads the count told.
  g.scope.add(k.subscribe((e) => void (e.type === 'selectionChanged' && ((count = e.count), g.schedule()))));
  const page = () => g.rows.page!;
  const go = (index: number): void => act({ type: 'page.go', index });
  const fns = {
    go,
    next: () => void (page().hasNext && go(page().index + 1)),
    prev: () => void (page().index > 0 && go(page().index - 1)),
    setSize: (size: number) => act({ type: 'page.size', size }),
    selectAll: () => void k.dispatch({ type: 'selection.allFiltered' }, 'user'),
    clearSelection: () => {
      k.dispatch({ type: 'selection.clear' }, 'user');
      g.restoreFocus();
    },
  };
  return () => {
    const p = page();
    const d = g.rows.displayed;
    const c = g.rows.counts;
    const status = g.rows.status;
    let shown = 0;
    for (let i = 0; i < d.count; i++) if (isSelected(k.selection, d.keyAt(d.index(i)!))) shown++;
    const all = k.selectionScope !== null;
    const mode = g.settings.selection?.mode ?? 'none';
    const from = p.index * p.size + 1;
    return {
      page: same('p', p),
      counts: same('c', c),
      status: same('s', status),
      range: d.count && status.phase !== 'loading' ? same('r', { from, to: from + d.count - 1 }) : null,
      selection: same('x', { count, shown, all, mode, canSelectAll: mode === 'multi' && !all && d.count > 0 && shown === d.count && c.filtered !== null && c.filtered > d.count }),
      ...fns,
    };
  };
}
