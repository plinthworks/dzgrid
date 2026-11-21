import { problem, type ChangeSource, type GridKernel, type ResolvedColumn, type RowKey } from '@dzgrid/core';
import type { EditController, EditEntry, EditGesture, RowRefusal, RowRule } from '@dzgrid/core/edit';
import { emit } from '@dzgrid/core/internal';
import type { GridContext } from '../context.js';
import type { EditApi } from '../edit/index.js';
import { rowRefusals, same } from '../edit/row-rule.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { FormsMessageKey } from '../part-texts.js';
import { describe, setAttr } from '../render/write.js';

/** The texts `editBatch()` needs, from `@dzgrid/dom/locales/<lang>-forms`. */
export const BATCH_KEYS = ['edit.unsaved', 'edit.discarded', 'edit.notSent'] as const satisfies readonly FormsMessageKey[];

/** One pending change (edit-batch.md 5): the row key, the column, the new value, the saved value it replaces, the row last seen. */
export interface PendingChange<T> {
  readonly key: RowKey;
  readonly column: string;
  readonly value: unknown;
  readonly previous: unknown;
  readonly row: Readonly<T>;
}
/** What `saveAll()` came to (edit-batch.md 6–7): how many changes were sent, and those refused (locally, or by the application). */
export interface SaveAllResult {
  readonly sent: number;
  readonly refused: readonly { readonly key: RowKey; readonly column: string; readonly code: string | null; readonly reason: string | null }[];
}
export interface EditBatchOptions<T> {
  /** A rule over each row with pending changes, checked before `saveAll()` sends (edit-batch.md 6, edit-row.md 9). */
  readonly validateRow?: RowRule<T>;
  /** A paste or a cut (edit-batch.md 11): `'save'` (default) saved at once, one request, as without the batch; `'pending'` kept. */
  readonly paste?: 'save' | 'pending';
  /** A fill — the handle, Ctrl+D / Ctrl+R, the fill's API (edit-batch.md 11): `'save'` (default) saved at once; `'pending'` kept. */
  readonly fill?: 'save' | 'pending';
}
/** A grid's pending changes (edit-batch.md 5). */
export interface EditBatchApi<T> {
  /** The pending changes, in the order first changed. */
  pending(): PendingChange<T>[];
  /** How many cells are pending. */
  readonly count: number;
  /** Every pending change in one save request (`origin: 'batch'`); resolves once the application answered. */
  saveAll(): Promise<SaveAllResult>;
  /** Every pending change dropped; how many. */
  discardAll(): number;
  /** One row's pending changes dropped (one cell's with `column`); how many. */
  discard(key: RowKey, column?: string): number;
}
export interface EditBatchFeature<T> extends GridFeature {
  /** The pending changes of a grid this feature is set up on; null before its setup, after it is destroyed, without `edit()`. */
  api(grid: { readonly kernel: GridKernel<T, any> }): EditBatchApi<T> | null;
}

let ids = 0;
/**
 * `editBatch(options)` (1.15.0, docs/behaviors/edit-batch.md): the changes kept in the grid, pending, until the
 * application calls `saveAll()` — one save request with every change — or `discardAll()`. Beside `edit()` (which holds
 * its gestures when this feature is in `features`) and `editors()`; its texts in `@dzgrid/dom/locales/<lang>-forms`,
 * its mark in `@dzgrid/theme/forms.css`.
 *
 * ```ts
 * const batch = editBatch<Row>();
 * const grid = createGrid(host, { …, features: [edit({ save }), editors(), batch] });
 * saveButton.onclick = () => batch.api(grid)!.saveAll();
 * ```
 */
export function editBatch<T = unknown>(o: EditBatchOptions<T> = {}): EditBatchFeature<T> {
  const apis = new WeakMap<object, EditBatchApi<T>>();
  return {
    id: 'edit-batch',
    api: (grid) => apis.get(grid.kernel) ?? null,
    setup: (g) => setup(g, o, apis),
  };
}

function setup<T>(g: GridContext<unknown>, o: EditBatchOptions<T>, apis: WeakMap<object, EditBatchApi<T>>): FeatureHandle {
  const missing = BATCH_KEYS.filter((key) => g.settings.messages.text[key] === undefined);
  if (missing.length) throw new TypeError(`editBatch: missing ${missing.join(', ')}`);
  const { kernel, doc, el } = g;
  if (!g.settings.features?.some((f) => f.id == 'edit')) {
    emit(kernel, { type: 'problems', source: 'host', problems: [problem('missing-feature', 'warning', 'features.editBatch', 'edit')] });
    return { destroy() {} };
  }
  // Found when used: the edit seam is gathered once every feature is set up.
  const ctl = (): EditController<T> => g.edit!.x as EditController<T>;
  const I = () => ctl().x!;
  const api = (): EditApi<T> => g.edit!.api as EditApi<T>;
  const col = (c: string): ResolvedColumn<unknown> => g.columns.get(c)!;
  /** The value a pending cell replaces: the last saved, else the row's own. */
  const base = (e: EditEntry): unknown => (e.l ? e.l.v : col(e.c).read(e.d as never));
  /** Pending: staged, in a gesture not sent yet (a batch being sent is not pending). */
  const held = (e: EditEntry): boolean => e.s === 'pending' && !e.x && !I().waiting.get(e.g)?.go;
  const list = (): EditEntry[] => [...I().cells.values()].filter(held);

  let count = 0;
  /** The pending cells when last counted: those a paste or a fill saved at once takes over (edit-batch.md 11). */
  let was = new Set<EditEntry>();
  /** `pendingChange` when the count moved (edit-batch.md 12). */
  const recount = (source: ChangeSource): void => {
    const l = list();
    was = new Set(l);
    if (l.length !== count) emit(kernel, { type: 'pendingChange', source, count: (count = l.length) });
  };
  /** The origins saved at once (edit-batch.md 11): a paste and a cut, a fill, unless the application keeps them. */
  const now = new Set([...(o.paste == 'pending' ? [] : ['paste', 'cut']), ...(o.fill == 'pending' ? [] : ['fill'])]);
  /** Back to the saved value (edit-batch.md 3): no longer pending — the saved value shown again, nothing to send. */
  const unpend = (es: EditEntry[], source: ChangeSource): void => {
    const x = I();
    for (const e of es) {
      x.unwait(e);
      if (e.f === undefined) e.l ? Object.assign(e, { s: 'saved', v: e.l.v }) : x.drop(e);
      else {
        // An older value of the cell is being saved: that one shows again.
        const fl = x.flying.get(e.f)!;
        Object.assign(e, { s: 'saving', g: e.f, v: fl.x.cells.get(e)?.v });
      }
    }
    x.show(es, source);
    // Their rows bound again: the cells read the saved values.
    g.rowRenderer.touch(es.map((e) => e.k));
    g.schedule();
  };

  // The cells a gesture changed (its `cellEdited`s come before its `editStates`): those back to their saved value leave.
  let touched: Set<string> | null = null;
  const unhear = kernel.subscribe((ev) => {
    if (ev.type === 'cellEdited') {
      (touched ??= new Set()).add(`${ev.key}\n${ev.column}`);
      // A paste or a fill saved at once: its gesture (the newest waiting) goes; a pending cell it takes, dropped and said.
      const G = [...I().waiting.values()].pop();
      if (G && !G.go && now.has(G.origin)) {
        G.go = true;
        let n = 0;
        for (const [e, ch] of G.cells) if (was.has(e)) n++, G.cells.set(e, { v: ch.v, p: base(e) });
        if (n) {
          // Said after the gesture's own sentences (« Saving », « Cells filled »), joined to them.
          g.live.said = '';
          queueMicrotask(() => queueMicrotask(() => {
            const x = g.live.said;
            g.live.announce((x ? `${x}. ` : '') + g.msg('edit.discarded', { n }));
          }));
        }
      }
    }
    else if (ev.type === 'editStates') {
      const t = touched;
      touched = null;
      const back = t ? list().filter((e) => t.has(`${e.k}\n${e.c}`) && e.f === undefined && same(g, col(e.c), e.v, base(e))) : [];
      if (back.length) unpend(back, ev.source), I().states(ev.source, back);
      else recount(ev.source);
    }
  });

  // The cells' mark (edit-batch.md 4): a class and a description, painted at each frame on the mounted cells.
  const box = doc.createElement('div');
  box.className = 'dzg-desc';
  box.hidden = true;
  const word = doc.createElement('span');
  word.id = `dzg-unsaved-${++ids}`;
  word.textContent = g.msg('edit.unsaved');
  box.append(word);
  el.root.append(box);
  const drawn = new Set<HTMLElement>();
  const mark = (cell: HTMLElement, on: boolean): void => {
    cell.classList.toggle('dzg-cell--unsaved', on);
    describe(cell, word.id, on);
    on ? drawn.add(cell) : drawn.delete(cell);
  };

  const result = (gen: number, es: EditEntry[]): SaveAllResult => ({
    sent: es.length,
    refused: es.flatMap((e) => {
      const s = ctl().state(e.k, e.c);
      return s?.status === 'failed' && s.generation === gen ? [{ key: e.k, column: e.c, code: s.code, reason: s.reason }] : [];
    }),
  });

  const B: EditBatchApi<T> = {
    pending: () => list().map((e) => ({ key: e.k, column: e.c, value: e.v, previous: base(e), row: e.d as T })),
    get count() {
      return list().length;
    },
    saveAll() {
      const es = list();
      // Checked again, cells then rows (edit-batch.md 6): any refusal sends nothing.
      const refused: { key: RowKey; column: string; code: string; reason: null }[] = [];
      for (const e of es) {
        const r = ctl().check(e.k, e.c, { value: e.v });
        if (!r.ok) refused.push({ key: e.k, column: e.c, code: r.code, reason: null });
      }
      for (const k of new Set(es.map((e) => e.k))) for (const r of rowRefusals(g, o.validateRow, k, es.find((e) => e.k === k)!.c) as RowRefusal[]) refused.push({ key: k, column: r.column, code: r.code, reason: null });
      if (refused.length) {
        for (const r of refused) api().refuse(r.key, r.column);
        const f = refused[0]!;
        api().alert(g.msg('edit.notSent', { column: col(f.column)?.def.header ?? f.column, reason: api().reason(f.column, f.code) }));
        return Promise.resolve({ sent: 0, refused });
      }
      if (!es.length) return Promise.resolve({ sent: 0, refused: [] });
      const x = I();
      const G: EditGesture = { g: x.gen(), origin: 'batch', cells: new Map(), go: true };
      for (const e of es) {
        x.unwait(e);
        G.cells.set(e, { v: e.v, p: base(e) });
        e.g = G.g;
      }
      x.waiting.set(G.g, G);
      return new Promise((done) => {
        const over = (): boolean => !x.waiting.has(G.g) && !x.flying.has(G.g);
        const off = kernel.subscribe((ev) => void (ev.type === 'editStates' && over() && (off(), done(result(G.g, es)))));
        x.states('api', [...G.cells.keys(), ...x.pump()]);
      });
    },
    discardAll: () => drop(list()),
    discard: (key, column) => drop(list().filter((e) => e.k === key && (column === undefined || e.c === column))),
  };
  /** Dropped, said (edit-batch.md 5): not undoable. */
  function drop(es: EditEntry[]): number {
      if (es.length) {
        unpend(es, 'api');
        recount('api');
        g.live.announce(g.msg('edit.discarded', { n: es.length }));
      }
      return es.length;
  }
  apis.set(kernel, B);

  return {
    afterRows() {
      const on = new Set(list().map((e) => `${e.k}\n${e.c}`));
      for (const c of drawn) if (!c.isConnected) mark(c, false);
      if (!on.size && !drawn.size) return;
      g.rowRenderer.forEach((key, v) => {
        for (const [c, cv] of v.cells) {
          const want = on.has(`${key}\n${c}`);
          if (want || drawn.has(cv.el)) mark(cv.el, want);
        }
      });
      setAttr(el.root, 'data-dzg-pending', on.size ? String(on.size) : null);
    },
    destroy() {
      apis.delete(kernel);
      unhear();
      box.remove();
    },
  };
}
