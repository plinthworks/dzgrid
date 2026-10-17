import type { GridContext } from '../context.js';
import { isLastEnd, widthOf } from '../render/header-decor.js';
import { attachResize } from './resize.js';

/** Header pointer: resize handles, then a click sorts (Shift adds) or toggles the select-all box. */
export function installHeaderClick<T>(g: GridContext<T>, toggleAll: () => void): void {
  const { el, kernel, columns, headerRenderer, scope } = g;
  const resizing = attachResize({
    scope,
    header: el.header,
    dir: () => g.dir,
    widthOf: (id) => widthOf(g, id),
    reversed: (id) => isLastEnd(g, id),
    resize: (column, width, finished) => void kernel.dispatch({ type: 'column.resize', column, width, finished }, 'user'),
    nextFrame: (fn) => g.scheduler.schedule({ read: () => 0, write: fn }),
  });
  scope.on(el.header, 'click', (e: MouseEvent) => {
    if (resizing.consumeClick()) return;
    const t = e.target as HTMLElement;
    if (t.closest('.dzg-resize')) return;
    if (headerRenderer.check && headerRenderer.check.contains(t)) {
      toggleAll();
      return;
    }
    const id = t.closest<HTMLElement>('.dzg-hcell')?.dataset['col'];
    const col = id ? columns.get(id) : undefined;
    if (col?.sortable) kernel.dispatch({ type: 'sort.toggle', column: col.id, multi: e.shiftKey }, 'user');
  });
}
