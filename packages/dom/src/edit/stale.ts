import { idOfDataKey, type ClientModel, type FocusPos, type KeyOwner, type ResolvedColumn, type RowKey } from '@dzgrid/core';
import { ColumnCache, compileFilter, compileQuick, filterKindLookup, storeOf } from '@dzgrid/core/internal';
import type { GridContext } from '../context.js';
import type { Frame } from '../render/rows.js';
import { describe, setAttr } from '../render/write.js';
import type { Marks } from './marks.js';

/**
 * An edited row out of the order shown (edit-reapply.md 3–8; owner Q6, Q7, S4-O3): rows that no longer pass
 * the filters muted (`data-dzg-stale`, their row header described `edit.rowStale`), a reapply button on every
 * sorted or filtered header (quick search only: the edited columns'), reached by F2, pressed by Enter, Space or
 * the pointer; the sentences said once.
 */
export function stale(g: GridContext<unknown>, m: Marks) {
  const { kernel, el, doc } = g;
  // Browser rows only: on server pages only the server can filter (S4-O3).
  const store = g.rows.kind === 'client' ? storeOf(g.rows as ClientModel<unknown>) : undefined;
  const kinds = filterKindLookup(g.settings.filterKinds).get;
  const cache = new ColumnCache<unknown>();
  const edited = new Set<string>();
  let sig: unknown[] = [];
  let muted = new Set<RowKey>();
  let rows = new Set<HTMLElement>();
  let heads = new Map<HTMLElement, string>();

  /** A press on the mark, said when the order is put back: at once in the browser, at a server's answer (S2-O2), never after a failure. */
  let asked = false;
  const off = kernel.subscribe((e) => {
    if (e.type === 'cellEdited') edited.add(e.column);
    else if (e.type === 'fetchFailed') asked = false;
    else if (e.type === 'orderStale') {
      // The event comes on a flip only: said once from false to true, after the save's sentence.
      if (e.stale) m.say(g.msg('edit.stale'), true);
      else edited.clear(), asked && m.say(g.msg('edit.reapplied', { n: g.rows.displayed.count })), (asked = false);
    }
  });

  /** The rows the overlay holds that fail the filters now, with the edits (once per reader, rows and query). */
  const mutedNow = (): Set<RowKey> => {
    if (!kernel.orderStale || !store) return new Set();
    const s = store.snapshot;
    const now = [kernel.reader.version, s, kernel.query, g.ctx, kernel.app, m.rev];
    if (now.some((x, i) => x !== sig[i])) {
      sig = now;
      const env = { source: s, columns: g.columns, ctx: g.ctx, reader: kernel.reader, cache, app: kernel.app, now: (g.settings.clock ?? Date.now)() };
      const f = compileFilter(kernel.query.filter, env, kinds);
      const q = compileQuick(kernel.query.quick, g.columns.visible(), env);
      muted = new Set();
      for (const { k } of m.cells.values()) {
        const src = s.lookup(idOfDataKey(k) ?? '');
        if (src !== -1 && !(f.test(src) && q.test(src))) muted.add(k);
      }
    }
    return muted;
  };

  /** A press on a reapply button: the order put back, the focus on its header, the rows counted. */
  g.scope.on(el.header, 'click', (e) => {
    const b = (e.target as Element).closest?.('.dzg-reapply');
    if (!b) return;
    b.closest<HTMLElement>('.dzg-hcell')!.focus();
    asked = true;
    kernel.dispatch({ type: 'rows.reapply' }, 'user');
  });
  // Out of the Tab order again once the focus leaves it.
  g.scope.on(el.header, 'focusout', (e) => {
    const t = e.target as HTMLElement;
    if (t.matches('.dzg-reapply')) t.tabIndex = -1;
  });

  return {
    decorateHeader(col: ResolvedColumn<unknown>, cell: HTMLElement, label: string | null): string | void {
      const q = kernel.query;
      const sorted = q.sort.some((s) => s.column === col.id);
      const filtered = Object.hasOwn(q.filter, col.id);
      const on = kernel.orderStale && (sorted || filtered || (!q.sort.length && !Object.keys(q.filter).length && !!q.quick.trim() && edited.has(col.id)));
      let b = cell.querySelector<HTMLButtonElement>(':scope > .dzg-reapply');
      if (!on) return void b?.remove();
      if (!b) {
        b = doc.createElement('button');
        b.type = 'button';
        b.className = 'dzg-reapply';
        b.tabIndex = -1;
        cell.append(b);
      }
      setAttr(b, 'aria-label', g.msg('edit.reapply'));
      return g.msg('header.withStale', { name: label ?? col.def.header ?? col.id });
    },
    /** F2 on a header with a mark: into the mark (Enter keeps sorting, edit-reapply.md 5). */
    keys(e: KeyboardEvent, at: FocusPos | null, owner: KeyOwner): boolean {
      if (e.key !== 'F2' || owner !== 'header' || at?.kind !== 'header' || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;
      const b = g.headerRenderer.cell(at.column, at.level ?? 0)?.querySelector<HTMLElement>(':scope > .dzg-reapply');
      if (!b) return false;
      b.tabIndex = 0;
      b.focus();
      return true;
    },
    paint(f: Frame<unknown>): void {
      const set = mutedNow();
      const id = set.size ? m.desc(g.msg('edit.rowStale')) : '';
      const r = new Set<HTMLElement>();
      const h = new Map<HTMLElement, string>();
      if (set.size)
        g.rowRenderer.forEach((key, v) => {
          if (!set.has(key)) return;
          r.add(v.el);
          // The row header, else the row's first mounted cell (its column scrolled out: review 5, WCAG 1.4.1).
          const c = v.cells.get(f.rowHeader!)?.el ?? v.el.querySelector<HTMLElement>('.dzg-cell');
          if (c) h.set(c, id);
        });
      // The row and the cell carrying the sign: `data-dzg-stale` (the theme draws the sign on that cell).
      for (const x of rows) if (!r.has(x)) x.removeAttribute('data-dzg-stale');
      for (const x of r) setAttr(x, 'data-dzg-stale', '');
      for (const [x, d] of heads) if (h.get(x) !== d) describe(x, d, false), x.removeAttribute('data-dzg-stale');
      for (const [x, d] of h) describe(x, d, true), setAttr(x, 'data-dzg-stale', '');
      rows = r;
      heads = h;
    },
    destroy: off,
  };
}
