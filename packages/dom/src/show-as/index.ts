import { formattersFor, isBlank, problem, type DisplayIndex, type DisplayedRows, type Problem, type ResolvedColumn, type RowKey } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import { isolationFor } from '../render/bidi.js';

export interface ShowAsOptions {
  /** The share's fraction digits, 0 to 20 (default 1: « 12.5% »). */
  readonly digits?: number;
}

/** One column's sums over the rows that pass the filters: by group key (`''` the total), each row's own number, each row's group. */
interface Sums {
  readonly sum: Map<RowKey | '', number>;
  readonly own: Map<RowKey, number>;
  readonly up: Map<RowKey, RowKey | ''>;
}

const KINDS = ['percentOfTotal', 'percentOfGroup'];

/**
 * `showAs()`: a number column with `showAs: 'percentOfTotal' | 'percentOfGroup'` shows its cells as a share (1.14.0,
 * docs/behaviors/aggregation.md 19–24). The total is the column's sum over the rows that pass the filters and the search
 * (every page, every group), edits counted at once; a group row shows its sum's share, a footer its group's, the grand
 * total and the totals row 100 %. Only the text changes: sort, filters, edits, the clipboard and the files read the value.
 * The screen's data rows are written here after each paint; the group rows, the totals row, print, find and the narrow
 * screen's lines ask `g.share`. Browser rows only (a server's: told, the value shown).
 *
 * ```ts
 * import { showAs } from '@dzgrid/dom/show-as';
 * createGrid(host, { …, columns: [{ id: 'sales', type: 'number', showAs: 'percentOfTotal' }], features: [showAs()] });
 * ```
 */
export function showAs(o: ShowAsOptions = {}): GridFeature {
  return { id: 'show-as', setup: (g) => setup(g, o) };
}

function setup(g: GridContext<unknown>, o: ShowAsOptions): FeatureHandle {
  const digits = Number.isInteger(o.digits) && o.digits! >= 0 && o.digits! <= 20 ? o.digits! : 1;
  const told = new Set<string>();
  const tell = (ps: Problem[]): void => {
    const fresh = ps.filter((p) => !told.has(p.path) && told.add(p.path));
    if (fresh.length) emit(g.kernel, { type: 'problems', source: 'host', problems: fresh });
  };
  /** The columns shown as a share: a number column with a known `showAs`, on the browser's rows; the others told once. */
  const on = (c: ResolvedColumn<unknown>): boolean => {
    const k = c.def.showAs;
    if (k === undefined) return false;
    const path = `columns.${c.id}.showAs`;
    if (!KINDS.includes(k) || c.codec.kind !== 'number') return tell([problem('invalid-column', 'warning', path, String(k))]), false;
    if (g.rows.kind === 'source') return tell([problem('unsupported-combination', 'warning', path, 'source')]), false;
    return true;
  };
  // Worked out again after a change of the rows, the filters, an edit or the columns; by column, when first asked.
  let memo = new Map<string, Sums>();
  let rowsWas: unknown;
  const off = g.kernel.subscribe((e) => void (/^(mod|cellE|edit|colu|undo)/.test(e.type) && (memo = new Map())));
  const rows = (): DisplayedRows<unknown> => g.rows.allRows ?? g.rows.displayed;
  const sums = (c: ResolvedColumn<unknown>): Sums => {
    const all = rows();
    if (all !== rowsWas) (rowsWas = all), (memo = new Map());
    let m = memo.get(c.id);
    if (m) return m;
    m = { sum: new Map([['', 0]]), own: new Map(), up: new Map() };
    memo.set(c.id, m);
    // The open groups above the row, outermost first.
    const stack: { key: RowKey; level: number }[] = [];
    for (let i = 0; i < all.count; i++) {
      const n = all.nodeAt(i as DisplayIndex);
      if (n.kind !== 'group' && n.kind !== 'data') continue;
      const lv = all.levelAt?.(i as DisplayIndex) ?? n.level;
      while (stack.length && stack.at(-1)!.level >= lv) stack.pop();
      m.up.set(n.key, stack.at(-1)?.key ?? '');
      if (n.kind === 'group') {
        stack.push({ key: n.key, level: lv });
        m.sum.set(n.key, 0);
        continue;
      }
      let v: unknown;
      try {
        const raw = g.edit ? g.edit.read(c, n.data, n.key) : c.read(n.data);
        v = isBlank(raw) ? null : c.codec.coerce(raw, g.ctx);
      } catch {
        v = null;
      }
      if (typeof v != 'number' || !Number.isFinite(v)) continue;
      m.own.set(n.key, v);
      for (const k of ['' as const, ...stack.map((s) => s.key)]) m.sum.set(k, m.sum.get(k)! + v);
    }
    return m;
  };
  g.share = (n, c) => {
    if (!on(c)) return undefined;
    // A footer by its group; the grand total and a totals row by the total ('').
    const k = typeof n == 'string' ? n : n.kind === 'footer' ? n.group ?? '' : n.key;
    const m = sums(c);
    const own = k === '' ? m.sum.get('') : m.own.get(k as RowKey) ?? m.sum.get(k as RowKey);
    const up = m.up.get(k as RowKey);
    const of = c.def.showAs === 'percentOfGroup' && up !== undefined ? m.sum.get(up)! : m.sum.get('')!;
    return own === undefined || !of ? '' : formattersFor(g.ctx).number({ style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits })(own / of);
  };
  return {
    afterRows() {
      // The data rows' cells: the share over what the paint wrote (not a part's cell, not the open editor's).
      g.rowRenderer.forEach((key, v) => {
        if (v.data === undefined) return;
        for (const [id, cv] of v.cells) {
          if (!cv.col || cv.part || (g.editor?.key === key && g.editor.column === id)) continue;
          const t = g.share!(key, cv.col);
          if (t === undefined) continue;
          if (cv.text.data !== t) cv.text.data = t;
          const iso = isolationFor(t, 'number', g.dir);
          if (iso && !cv.value) cv.value = g.doc.createElement('span');
          if (iso) {
            cv.value!.className = 'dzg-num';
            if (cv.text.parentNode !== cv.value) cv.value!.append(cv.text);
            if (cv.value!.parentNode !== cv.el) cv.el.append(cv.value!);
          }
        }
      });
    },
    destroy() {
      off();
      delete g.share;
    },
  };
}
