import type { GridKernel, RowKey } from '@dzgrid/core';
import { createEdits, type EditController, type SaveHandler, type UndoResult } from '@dzgrid/core/edit';
import type { GridFeature } from '../features.js';
import type { EditMessageKey } from '../part-texts.js';
import { marks } from './marks.js';
import { stale } from './stale.js';

/** The texts `edit()` needs, from `@dzgrid/dom/locales/<lang>-edit`. */
export const EDIT_KEYS = [
  'edit.saving', 'edit.saveRefused', 'edit.reasonUnknown', 'edit.failedMark', 'edit.stale', 'edit.rowStale', 'edit.reapply', 'edit.reapplied', 'header.withStale',
  'validation.required', 'validation.min', 'validation.max', 'validation.pattern', 'validation.options', 'validation.invalid',
] as const satisfies readonly EditMessageKey[];

export interface EditFeatureOptions<T> {
  /** The application's save (`@dzgrid/core/edit`, edit-save.md 1–5b); absent: a kept value is saved locally at once. */
  readonly save?: SaveHandler<T>;
  /** The line running round a cell while it saves (Q10 amended): true by default; false, a still border. */
  readonly savingBorder?: boolean;
}

/** A grid's edits, for the application (and the editors of step 5). */
export interface EditApi<T> {
  readonly commit: EditController<T>['commit'];
  undo(): UndoResult | null;
  redo(): UndoResult | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly state: EditController<T>['state'];
  /** Puts the rows back in order (`rows.reapply`, as the application: not announced). */
  reapply(): void;
  setSave(save?: SaveHandler<T>): void;
  /** The 0.5 s refusal on a cell (a local check, step 5; the limiter applied). */
  refuse(key: RowKey, column: string): void;
  /** One sentence in the assertive region, emptied first (the editors' refusals, step 5). */
  alert(text: string): void;
  /** A refusal code's text for a column (`validation.<code>`, `{min}` / `{max}` by its format; else `validation.invalid`). */
  reason(column: string, code: string): string;
}

export interface EditFeature<T> extends GridFeature {
  /** The edits of a grid this feature is set up on; null before its setup and after it is destroyed. */
  api(grid: { readonly kernel: GridKernel<T, any> }): EditApi<T> | null;
}

/**
 * `edit(options)`: editing wired to the grid (Phase 5 step 4, docs/phase-5-steps/step04-plan.md): the edit
 * controller of `@dzgrid/core/edit` on the grid's rows, what the cells show read through it, the save marks and
 * their clocks, the rows out of the order shown, the header's reapply mark, the sentences. One feature object
 * may serve several grids, each its own controller.
 *
 * ```ts
 * import { edit } from '@dzgrid/dom/edit';
 * import { FR_EDIT } from '@dzgrid/dom/locales/fr-edit';
 * const editing = edit({ save: (req) => api.save(req.changes) });
 * const grid = createGrid(host, { …, messages: { ...FR, text: { ...FR.text, ...FR_EDIT.text } }, features: [editing] });
 * editing.api(grid)!.commit([{ key, column: 'stock', input: { text: '12' } }]);
 * ```
 */
export function edit<T = unknown>(o: EditFeatureOptions<T> = {}): EditFeature<T> {
  const apis = new WeakMap<object, EditApi<T>>();
  return {
    id: 'edit',
    api: (grid) => apis.get(grid.kernel) ?? null,
    setup(g) {
      const missing = EDIT_KEYS.filter((key) => g.settings.messages.text[key] === undefined);
      if (missing.length) throw new TypeError(`edit: missing ${missing.join(', ')}`);
      const { kernel } = g;
      const win = g.win as (Window & typeof globalThis) | null;
      const ctl = createEdits(kernel as GridKernel<T>, { ctx: () => g.ctx, ...(o.save && { save: o.save }), ...(win?.AbortController && { abort: () => new win.AbortController() }) });
      const m = marks(g, ctl, o.savingBorder !== false);
      const s = stale(g, m);
      const api: EditApi<T> = {
        commit: ctl.commit,
        undo: () => ctl.undo(),
        redo: () => ctl.redo(),
        get canUndo() { return ctl.canUndo; },
        get canRedo() { return ctl.canRedo; },
        state: ctl.state,
        reapply: () => void kernel.dispatch({ type: 'rows.reapply' }, 'api'),
        setSave: ctl.setSave,
        refuse: (key, column) => m.refuse(key, column),
        alert: m.alert,
        reason: (column, code) => m.reason(column, null, code),
      };
      apis.set(kernel, api);
      return {
        // The editors (`@dzgrid/dom/editors`) find the grid's edits here.
        edit: { read: m.seam.read, api },
        decorateHeader: s.decorateHeader,
        keys: s.keys,
        afterRows(f) {
          m.paint(f);
          s.paint(f);
          m.sweep();
        },
        destroy() {
          apis.delete(kernel);
          ctl.destroy();
          s.destroy();
          m.destroy();
        },
      };
    },
  };
}
