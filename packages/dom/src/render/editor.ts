import type { GridContext } from '../context.js';

/**
 * The editor host (Phase 5 step 4, ARCH retained-row contract 5–6), in the base until `@dzgrid/dom/editors`
 * (step 5) can take it: moving it into `@dzgrid/dom/edit` at the review cost that entry ~200 B over its ceiling. A field
 * put in a mounted cell, over its text, the cell left alone by the paint while it is there (the base reads
 * `g.editor`); closed by focusing the cell first, then removing the field; `lost` told once when the cell leaves
 * the page (its row gone, its column hidden) or the grid goes. The editors (step 5) use it.
 */
export function editorHost(g: GridContext<unknown>): { paint(): void; destroy(): void } {
  /** The field out of its cell, the row bound again; `focus`: the cell focused first (contract 6, never body). */
  const shut = (focus: boolean): void => {
    const e = g.editor;
    if (!e) return;
    g.editor = null;
    if (focus) e.cell.focus({ preventScroll: true });
    e.field.remove();
    e.cell.removeAttribute('data-dzg-editing');
    g.rowRenderer.touch([e.key]);
    g.schedule();
  };
  g.openEditor = (key, column, field, lost) => {
    const cell = g.rowRenderer.cell(key, column);
    if (!cell || g.editor) return false;
    field.setAttribute('data-dzg-owner', 'editor');
    cell.setAttribute('data-dzg-editing', '');
    cell.append(field);
    g.editor = { key, column, cell, field, lost };
    return true;
  };
  g.closeEditor = () => shut(true);
  return {
    // After the rows are placed: an editor whose cell left the page; the focus comes back as for any focused cell that went.
    paint() {
      const e = g.editor;
      if (e && g.rowRenderer.cell(e.key, e.column) !== e.cell) shut(false), e.lost();
    },
    destroy() {
      const e = g.editor;
      g.editor = null;
      e?.lost();
    },
  };
}
