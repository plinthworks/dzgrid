import { idOfDataKey, type RowKey } from '@dzgrid/core';
import type { GridContext } from '../../context.js';
import { fresh, tint, valueOf } from './flash.js';
import { showing } from './guard.js';
import type { Scene } from './index.js';

/** What the run chunk reads of `@dzgrid/dom/edit`'s API, through the grid's edit seam (never imported). */
interface States { state(key: RowKey, column: string): { readonly status: string } | undefined }

/**
 * The saves' motion (Phase 5 step 7, D9, Q10 B; edit-save.md 11): the cells whose save state changed, heard from
 * the kernel until the paint, then for each mounted one `onCell(el, c, reason)` — `saving` once per gesture and
 * cell, `saved`, `failed` when the refusal comes (`pending`: nothing) — after the guards (more than 50 cells in a
 * paint: none; the 50 hook calls shared with the live flash); a new reason first finishes what the last one
 * started. `value` and `text` are what the cell shows; `previousText` what lies under the edit: the last saved
 * value after a refusal (what comes back), else the row's own. The only built-in is the saved flash (the live one:
 * 500 ms per cell, none just after a scroll; reduced: still); the border while saving and the refusal's blink are
 * the theme's (CSS). Reads no layout.
 */
export function saves(g: GridContext<unknown>) {
  /** Cells told since the last paint (`true`: refused). */
  const told = new Map<string, [RowKey, string, boolean]>();
  const add = (k: RowKey, c: string, bad?: boolean): void => {
    const x = `${k}\n${c}`;
    told.set(x, [k, c, !!bad || !!told.get(x)?.[2]]);
  };
  const off = g.kernel.subscribe((e) => {
    if (e.type === 'editStates') for (const c of e.cells) add(c.key, c.column);
    else if (e.type === 'saveFailed') add(e.key, e.column, true);
  });
  return {
    /** Cells told, waiting for the paint. */
    told: () => told.size,
    /** Once the rows are placed; `s` null: motion off (nothing, the told cells forgotten). */
    paint(s: Scene | null): void {
      const api = g.edit?.api as States | undefined;
      const list: [RowKey, string, HTMLElement, 'saving' | 'saved' | 'failed'][] = [];
      // A cell is told once per change of its state (the core's editStates): `saving` once per gesture.
      for (const [, [k, c, bad]] of told) {
        const st = api?.state(k, c)?.status;
        const why = st === 'saving' ? st : st === 'saved' ? st : bad && st === 'failed' && st;
        const el = why && g.rowRenderer.cell(k, c);
        if (el) list.push([k, c, el, why as never]);
      }
      told.clear();
      if (!s || list.length > 50) return;
      for (const [k, c, el, why] of list) {
        const node = g.kernel.rowOf(k)!;
        const col = g.columns.get(c)!;
        const [value] = valueOf(g, col, g.edit!.read(col, node.data, k));
        const [, before] = valueOf(g, col, why === 'failed' ? g.kernel.reader.value(col as never, node.data, idOfDataKey(k) ?? k) : col.read(node.data));
        s.guard.finish(el);
        const ok = showing(g, el, k, c);
        const r = s.hook(s.o.onCell, ok, el, { key: k, column: c, value, text: el.textContent ?? '', previousText: before, row: node.data, context: g.settings.context, reduced: s.reduced }, why);
        if (why === 'saved' && r !== false && s.on('flash') && s.now - g.scrolledAt >= 150 && fresh(s, k, c)) tint(s, el, ok);
      }
    },
    destroy: off,
  };
}
