import { formattersFor, problem, type DisplayIndex, type DisplayedRows, type FooterNode, type GridKernel, type ResolvedColumn, type RowKey } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import { columnTotals } from '@dzgrid/core/totals';
import type { GridContext } from '../context.js';
import type { GridFeature } from '../features.js';
import type { TotalsMessageKey } from '../part-texts.js';
import type { CellView } from '../render/rows.js';
import { isolationFor } from '../render/bidi.js';

/** The texts `totalsRow()` needs, from `@dzgrid/dom/locales/<lang>-totals`. */
export const TOTALS_KEYS = ['totals.label'] as const satisfies readonly TotalsMessageKey[];

/** The row's own key (totals-row.md 6): never a `pinnedKey` (those carry a length), never a body row's. */
const KEY = 'p:b:t' as RowKey;

export interface TotalsRowApi {
  /**
   * The totals shown, by column id, instead of the computed ones — a server's (totals-row.md 9); null: computed again
   * (client rows), or nothing (a server's pages).
   */
  set(values: Readonly<Record<string, unknown>> | null): void;
  /** The totals shown now, by column id. */
  values(): Readonly<Record<string, unknown>>;
}

export interface TotalsRowFeature extends GridFeature {
  /** The totals row of a grid this feature is set up on; null before its setup and after it is destroyed. */
  api(grid: { readonly kernel: GridKernel<any, any> }): TotalsRowApi | null;
}

/**
 * `totalsRow()` (docs/behaviors/totals-row.md): the columns' `total` (`sum`, `avg`, `min`, `max`, `count`, `first`, `last`
 * or a function; the group totals' rules, `@dzgrid/core/totals`) over the rows that pass the filters, through the edits,
 * in one row last in the pinned bottom band — no data, read-only, never selected — its label (`totals.label`) in the first
 * column without a total. Computed again only when the rows, the edits, the columns or the language changed. CSV, Excel
 * and print write it; JSON does not. With a server's pages, the application gives the totals (`api.set`).
 *
 * ```ts
 * import { pinnedRows } from '@dzgrid/dom/pinned-rows';
 * import { totalsRow } from '@dzgrid/dom/totals-row';
 * import { FR_TOTALS } from '@dzgrid/dom/locales/fr-totals';
 * createGrid(host, { …, columns: [{ id: 'amount', type: 'number', total: 'sum' }], features: [pinnedRows(), totalsRow()] });
 * ```
 */
export function totalsRow(): TotalsRowFeature {
  const apis = new WeakMap<object, TotalsRowApi>();
  return {
    id: 'totals-row',
    api: (grid) => apis.get(grid.kernel) ?? null,
    setup(x) {
      const g = x as GridContext<unknown>;
      const missing = TOTALS_KEYS.filter((k) => g.settings.messages.text[k] === undefined);
      if (missing.length) throw new TypeError(`totalsRow: missing ${missing.join(', ')}`);
      const { kernel } = g;
      let given: Readonly<Record<string, unknown>> | null = null;
      let values: Readonly<Record<string, unknown>> = {};
      // The row while some column has a total: one object, its totals replaced in place (the band keeps its row).
      const node = { key: KEY, kind: 'footer', level: 0, group: null, label: '', count: 0, aggs: values } as { -readonly [K in keyof FooterNode]: FooterNode[K] };
      let shown: FooterNode | null = null;
      let last: readonly unknown[] = [];
      let told = '';
      apis.set(kernel, { set: (v) => void ((given = v), (last = []), g.schedule()), values: () => values });
      // Without the pinned rows, nowhere to draw: told once (5).
      if (!g.settings.features?.some((f) => f.id === 'pinned-rows')) {
        emit(kernel, { type: 'problems', source: 'host', problems: [problem('missing-feature', 'warning', 'totalsRow', 'pinned-rows')] });
        return { destroy: () => void apis.delete(kernel) };
      }
      // The columns collapsed under their rows (`responsive`) too: a file writes them (totals-row.md 10).
      const totalled = (): ResolvedColumn<unknown>[] => (g.columns.withCollapsed?.() ?? g.columns.visible()).filter((c) => c.def.total !== undefined);
      const labelColumn = (): string | undefined => g.columns.visible().find((c) => c.def.total === undefined)?.id;
      /** The totals now: given, or computed when what they read changed (8); the row put in the band or taken out. */
      const update = (): void => {
        const cs = totalled();
        const rows = g.rows.allRows;
        if (given || !rows) values = given ?? {};
        else {
          const k = [rows, rows.version, kernel.reader.version, g.ctx, ...cs.map((c) => c.def)];
          if (k.length !== last.length || k.some((v, i) => v !== last[i])) {
            last = k;
            const t = columnTotals(rows, cs, { ctx: g.ctx, reader: kernel.reader });
            values = t.values;
            const said = JSON.stringify(t.problems);
            if (t.problems.length && said !== told) emit(kernel, { type: 'problems', source: 'host', problems: t.problems });
            told = said;
          }
        }
        node.aggs = values;
        const want = cs.length ? node : null;
        if (want !== shown && g.pinFoot) g.pinFoot((shown = want));
      };
      /** A total as its cell shows it (totals-row.md 3): the column's format; a count, a number of the language. */
      const textOf = (col: ResolvedColumn<unknown>, v: unknown): string => {
        if (v == null) return '';
        try {
          if (col.def.total === 'count' && col.type !== 'number') return formattersFor(g.ctx).number()(v as number);
          const x = typeof col.def.total == 'function' || given ? col.codec.coerce(v, g.ctx) : v;
          return x === null ? '' : col.codec.format(x as never, g.ctx);
        } catch {
          return '';
        }
      };
      const cell = (n: FooterNode, col: ResolvedColumn<unknown>): string => (col.id === labelColumn() ? g.msg('totals.label') : textOf(col, n.aggs[col.id]));
      /** A cell's text written as the base writes it: the text node, isolated when the value needs it. */
      const put = (cv: CellView, type: string, text: string): void => {
        if (cv.text.data !== text) cv.text.data = text;
        const iso = isolationFor(text, type, g.dir);
        if (iso) {
          if (!cv.value) cv.value = g.doc.createElement('span');
          const cls = iso === 'free' ? 'dzg-free' : 'dzg-num';
          if (cv.value.className !== cls) cv.value.className = cls;
          if (cv.text.parentNode !== cv.value) cv.value.append(cv.text);
          if (cv.value.parentNode !== cv.el) cv.el.append(cv.value);
        } else if (cv.text.parentNode !== cv.el) {
          cv.el.append(cv.text);
          cv.value?.remove();
        }
      };
      g.foot = {
        get node() {
          return shown;
        },
        cell,
        // Called by the band's paint, after its rows are drawn: the totals written in the row's cells.
        draw() {
          update();
          const lc = labelColumn();
          g.rowRenderer.forEach((k, v) => {
            if (k === KEY) for (const [id, cv] of v.cells) if (cv.col) put(cv, id === lc ? 'text' : cv.col.type, cell(node, cv.col));
          });
        },
        get fns() {
          return Object.fromEntries(totalled().map((c) => [c.id, c.def.total!]));
        },
        // A file's rows with the totals line last (10): the label as the label column's value.
        with(held) {
          update();
          if (!shown) return held;
          const r = held.rows;
          const n = r.count;
          const lc = labelColumn();
          const foot = { ...node, aggs: { ...values, ...(lc && { [lc]: g.msg('totals.label') }) } };
          const rows: DisplayedRows<unknown> = {
            version: r.version, count: n + 1,
            nodeAt: (i) => (i === n ? foot : r.nodeAt(i)),
            keyAt: (i) => (i === n ? KEY : r.keyAt(i)),
            indexOf: (k) => (k === KEY ? (n as DisplayIndex) : r.indexOf(k)),
            index: (i) => (i === n ? (n as DisplayIndex) : r.index(i)),
            nextData: (i, d) => (i === n ? null : r.nextData(i, d)),
            ...(r.levelAt && { levelAt: (i: DisplayIndex) => (i === n ? 0 : r.levelAt!(i)) }),
          };
          return { ...held, rows, at: held.at && Uint32Array.from([...held.at, n]), count: held.count + 1 };
        },
      };
      if (g.pinFoot) update();
      return {
        // Listed before `pinnedRows()`: the row goes in at the first paint.
        afterRows: () => void (shown || update()),
        destroy() {
          apis.delete(kernel);
          g.pinFoot?.(null);
          g.foot = undefined;
        },
      };
    },
  };
}
