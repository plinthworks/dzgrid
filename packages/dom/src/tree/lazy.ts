import { problem, type LoadingNode, type RowKey } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import type { TreeShape } from '@dzgrid/core/tree';
import { lazyShape, type LazyOptions, type LazyShape } from '@dzgrid/core/tree-lazy';
import type { GridContext } from '../context.js';

/** What `tree()` does with it: the shape wrapped at creation, the DOM part set up with the grid. */
export interface LazyChildren<T> {
  wrap(s: TreeShape<T>, nested: boolean): TreeShape<T>;
  setup(g: GridContext<unknown>, s: TreeShape<T> | undefined, say: (key: RowKey) => void): LazyDom | null;
}
/** The loading and error rows' content, and the end. */
export interface LazyDom {
  fill(label: HTMLElement, node: LoadingNode): void;
  /** « Loading » said for `key` (the user opened it): its answer will be said. */
  said(key: RowKey): void;
  destroy(): void;
}

/**
 * `lazyChildren({ has, load })`: for `tree({ parentId, lazy })` (docs/behaviors/tree-lazy.md). A row
 * `has` declares shows a closed toggle; opening it shows a loading row (`aria-busy`, the base's
 * « Loading… ») while `load(row, { signal })` runs — or a server's `children` when the rows come from
 * `sourceRows` — then its children; a failure shows the error and a Retry button (Enter on the row
 * retries too). Nested arrays (`children`) are refused: a loaded row could not name its parent.
 *
 * ```ts
 * import { tree } from '@dzgrid/dom/tree';
 * import { lazyChildren } from '@dzgrid/dom/tree-lazy';
 * tree({ parentId: (r) => r.parent, lazy: lazyChildren({ has: (r) => r.hasKids, load: (r, { signal }) => api.children(r.id, { signal }) }) });
 * ```
 */
export function lazyChildren<T>(o: LazyOptions<T>): LazyChildren<T> {
  return {
    wrap: (s, nested) => (nested ? s : lazyShape(s, o)),
    setup(g, s, say) {
      const { kernel, el, rowRenderer, doc } = g;
      const tell = (path: string, code: 'unsupported-combination' | 'missing-feature', detail: string) => emit(kernel, { type: 'problems', source: 'host', problems: [problem(code, 'warning', path, detail)] });
      const ctl = (s as Partial<LazyShape<T>> | undefined)?.lazy;
      if (!ctl) return tell('tree.lazy', 'unsupported-combination', 'children'), null;
      // The host's loader gets the window's signal; a server's children came with its model.
      const win = doc.defaultView;
      if (win?.AbortController) ctl.abort = () => new win.AbortController();
      if (!ctl.loader && !o.load) tell('tree.lazy', 'missing-feature', 'load');
      // Only the user's actions are said (tree-lazy.md): an answer when its « Loading » was — a user's
      // opening of one row, a user's Retry —, by the request's number: not the API's, nor a refresh's.
      const asked = new Map<RowKey, number>();
      const said = (key: RowKey): void => void asked.set(key, ctl.diagnostics.started);
      const off = ctl.on((parent, ok, no) => asked.get(parent) === no && (asked.delete(parent), ok ? say(parent) : g.live.announce(g.msg('announce.error'))));
      /** The error row of `row`, asked again; false when it is not one. */
      const retry = (row: Element | null | undefined): RowKey | null => {
        const key = row ? rowRenderer.keyOf(row) : undefined;
        const d = g.rows.displayed;
        const i = key ? d.indexOf(key) : -1;
        const node = i === -1 ? null : d.nodeAt(i);
        if (node?.kind !== 'loading' || !node.failed) return null;
        ctl.retry(node.parent);
        said(node.parent);
        g.live.announce(g.msg('announce.loading'));
        return key!;
      };
      // The pointer on Retry: asked again, and nothing else (no row click, no selection); the focus on its cell.
      g.scope.on(el.viewport, 'click', (e) => {
        const b = (e.target as Element).closest?.('.dzg-retry');
        // Read before the retry: the button goes with the error text.
        const column = b?.closest<HTMLElement>('.dzg-cell')?.dataset['col'];
        const key = b && retry(b.closest('.dzg-row'));
        if (!key) return;
        e.stopPropagation();
        if (column && kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: key, column } }, 'user').ok) g.restoreFocus();
      }, { capture: true });
      // Enter on the error row (any cell): Retry, before the grid reads the key.
      g.scope.on(el.viewport, 'keydown', (e) => {
        if (e.key !== 'Enter' || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || !retry((e.target as Element).closest?.('.dzg-row'))) return;
        e.preventDefault();
        e.stopPropagation();
      }, { capture: true });
      return {
        fill(l, node) {
          const words = node.failed ? `${g.msg('grid.error')} ${g.msg('grid.retry')}` : g.msg('grid.loading');
          if (l.textContent === words) return;
          l.textContent = node.failed ? `${g.msg('grid.error')} ` : words;
          if (!node.failed) return;
          const b = doc.createElement('button');
          b.type = 'button';
          b.tabIndex = -1;
          b.className = 'dzg-retry';
          b.textContent = g.msg('grid.retry');
          l.append(b);
        },
        said,
        destroy() {
          off();
          ctl.reset();
        },
      };
    },
  };
}
