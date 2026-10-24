import type { RowKey } from '@dzgrid/core';
import type { GridContext } from '../context.js';

/** Where an editor sits: a field put in a mounted cell, over its text (retained-row contract 5–6). */
export interface EditorHost {
  /** Puts `field` (marked `data-dzg-owner="editor"`) in the mounted cell; false when it is not mounted or an editor is open. */
  open(key: RowKey, column: string, field: HTMLElement, lost: () => void): boolean;
  /** The field out of its cell, the row bound again; `focus`: the cell focused first (contract 6, never body). */
  shut(focus: boolean): void;
  /** After the rows are placed: an editor whose cell left the page is shut and told `lost` once. */
  paint(): void;
  /** With the grid: `lost` told. */
  destroy(): void;
}

/**
 * The editor host (Phase 5 step 4, moved from the base into `@dzgrid/dom/editors` at step 5): the base keeps
 * only `g.editor`, which its paint reads (that cell's value, part and classes left alone while it is open).
 */
export function editorHost(g: GridContext<unknown>): EditorHost {
  let lost: (() => void) | null = null;
  const shut = (focus: boolean): void => {
    const e = g.editor;
    if (!e) return;
    g.editor = lost = null;
    if (focus) e.cell.focus({ preventScroll: true });
    e.field.remove();
    e.cell.removeAttribute('data-dzg-editing');
    g.rowRenderer.touch([e.key]);
    g.schedule();
  };
  return {
    open(key, column, field, l) {
      const cell = g.rowRenderer.cell(key, column);
      if (!cell || g.editor) return false;
      field.setAttribute('data-dzg-owner', 'editor');
      cell.setAttribute('data-dzg-editing', '');
      cell.append(field);
      g.editor = { key, column, cell, field };
      lost = l;
      return true;
    },
    shut,
    // The focus comes back as for any focused cell that went (the paint's fallback, after the features).
    paint() {
      const e = g.editor;
      const l = lost;
      if (e && g.rowRenderer.cell(e.key, e.column) !== e.cell) shut(false), l?.();
    },
    destroy() {
      const l = lost;
      g.editor = lost = null;
      l?.();
    },
  };
}
