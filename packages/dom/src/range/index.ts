import { intentFor, type CellAddr, type CellRange, type DisplayedRows, type FocusPos, type GridKernel, type KeyOwner, type Problem, type RowKey } from '@dzgrid/core';
import { emit, isDataKey } from '@dzgrid/core/internal';
import { rangeBox, type RangeBox } from '@dzgrid/core/range';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { RangeMessageKey } from '../part-texts.js';
import type { Frame, RowView } from '../render/rows.js';
import { setAttr } from '../render/write.js';
import { pointer, same, type Sel } from './pointer.js';

/** The texts `range()` needs, from `@dzgrid/dom/locales/<lang>-range`. */
export const RANGE_KEYS = ['range.rows', 'range.cols', 'range.size', 'range.cleared', 'range.reordered'] as const satisfies readonly RangeMessageKey[];

export interface RangeOptions {
  /** A press and a drag of the mouse or a pen makes a block (range-selection.md 8); false: the keys, Shift+click and the API only. Default true. */
  readonly drag?: boolean;
}

/** A grid's block of cells, for the application. */
export interface RangeApi {
  /** The block (two cells at least), else null: corners by keys, never positions. */
  get(): CellRange | null;
  /**
   * Sets it (source `api`: not said, the focus untouched — `api.ensureVisible` brings it into view); false, nothing
   * changed, when a corner's row is not shown or its column not visible (a `problems` event, never a throw); one
   * cell or null clears.
   */
  set(r: CellRange | null): boolean;
  clear(): void;
  /** The block's box for the rows shown now (as `rangeBox` of `@dzgrid/core/range`), null without a block. */
  box(): RangeBox | null;
}

export interface RangeFeature extends GridFeature {
  /** The block of a grid this feature is set up on; null before its setup and after it is destroyed. */
  api(grid: { readonly kernel: GridKernel<any, any> }): RangeApi | null;
}

const CLASSES = ['dzg-cell--range', 'dzg-cell--rs', 'dzg-cell--re', 'dzg-cell--rt', 'dzg-cell--rb'];

/**
 * `range(options)`: blocks of cells (docs/behaviors/range-selection.md; owner QB1, QB2, QB7, S11-Q1…Q4). Shift with the
 * grid's own moves (mirrored right to left), Ctrl+A (every cell shown), Shift+Space (the row), the pointer (a drag,
 * Shift+click, the auto-scroll); the tint and its logical edges on the mounted cells at each paint, aria-selected on
 * the block's data cells only; the size said after a pause; the block dropped, said once, when the order or the rows
 * shown change. One feature object may serve several grids, each its own block.
 *
 * ```ts
 * import { range } from '@dzgrid/dom/range';
 * import { FR_RANGE } from '@dzgrid/dom/locales/fr-range';
 * import '@dzgrid/theme/range.css';
 * const blocks = range();
 * const grid = createGrid(host, { …, messages: { ...FR, text: { ...FR.text, ...FR_RANGE.text } }, features: [blocks] });
 * grid.kernel.subscribe((e) => e.type === 'rangeChanged' && console.log(blocks.api(grid)!.box()));
 * ```
 */
export function range(o: RangeOptions = {}): RangeFeature {
  const apis = new WeakMap<object, RangeApi>();
  return {
    id: 'range',
    api: (grid) => apis.get(grid.kernel) ?? null,
    setup(g) {
      const missing = RANGE_KEYS.filter((key) => g.settings.messages.text[key] === undefined);
      if (missing.length) throw new TypeError(`range: missing ${missing.join(', ')}`);
      const { kernel, rows, columns } = g;
      g.multi = true;
      let hush = (): void => {};
      /** The visible columns' ids, in reading order. */
      const ids = (): string[] => columns.visible().map((c) => c.id);
      /** Which columns sit where: a change drops the block (hidden, moved, pinned); a width does not. */
      const shape = (): string => {
        const L = columns.layout;
        return [L.start, L.center, L.end].map((x) => x.columns.map((c) => c.id)).join('|');
      };
      let shown = shape();
      const boxOf = (x: CellRange | null, d: DisplayedRows<unknown> = rows.displayed): RangeBox | null => (x ? rangeBox(x, d, ids()) : null);
      /** « 3 rows, 2 columns selected »: data rows only (details, fillers, loading rows count for nothing). */
      const size = (): void => {
        const b = boxOf(s.r);
        if (!b) return;
        const d = rows.displayed;
        let n = 0;
        for (let i = b.top; i <= b.bottom; i++) if (isDataKey(d.keyAt(d.index(i)!))) n++;
        g.live.announce(g.msg('range.size', { rows: g.msg('range.rows', { n }), cols: g.msg('range.cols', { n: b.end - b.start + 1 }) }));
      };
      let own = false;
      const s: Sel & { r: CellRange | null; drop(source: 'user' | 'data' | 'api', key?: RangeMessageKey): void } = {
        r: null,
        follows: false,
        set(next, source, say = source === 'user') {
          if (next && same(next.anchor, next.focus)) next = null;
          const r = s.r;
          if (next === r || (next && r && same(next.anchor, r.anchor) && same(next.focus, r.focus))) return;
          s.r = next;
          hush();
          if (say) s.say();
          emit(kernel, { type: 'rangeChanged', source, range: next });
          g.schedule();
        },
        say() {
          hush();
          if (s.r) hush = g.scope.timeout(size, 400);
        },
        drop(source, key: RangeMessageKey = 'range.cleared') {
          if (!s.r) return;
          s.set(null, source);
          if (source !== 'api') g.live.announce(g.msg(key));
        },
        focusTo(a) {
          own = true;
          try {
            if (kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: a.row, column: a.column } }, 'user').ok) g.restoreFocus();
          } finally {
            own = false;
          }
        },
      };
      const drag = pointer(g, s, o.drag !== false);

      const off = kernel.subscribe((e) => {
        if (e.type === 'columnsChanged') {
          const now = shape();
          if (now !== shown) (shown = now), s.drop('data');
        }
        if (!s.r) return;
        // The model is told before the sort, filter or search event (the rows first): its `query` change is theirs.
        if (e.type === 'focusChanged' && !own && e.source !== 'data') s.drop('user');
        else if (e.type === 'sortChanged' || e.type === 'filterChanged' || e.type === 'quickChanged' || (e.type === 'modelUpdated' && (e.kind === 'order' || e.kind === 'query'))) s.drop('data', 'range.reordered');
        else if (e.type === 'pageChanged' || (e.type === 'modelUpdated' && !boxOf(s.r))) s.drop('data');
      });

      /** The first cell, where the keys start from with nothing focused (the router's own rule). */
      const first = (): CellAddr | null => {
        const d = rows.displayed;
        const c = ids()[0];
        return d.count && c ? { row: d.keyAt(d.index(0)!), column: c } : null;
      };
      /** Every cell shown (Ctrl+A), or one row's (Shift+Space); the focus stays where it is (owner S11-Q2). */
      const all = (row?: RowKey): void => {
        const d = rows.displayed;
        const c = ids();
        if (!d.count || !c.length) return;
        s.set({ anchor: { row: row ?? d.keyAt(d.index(0)!), column: c[0]! }, focus: { row: row ?? d.keyAt(d.index(d.count - 1)!), column: c[c.length - 1]! } }, 'user');
        s.follows = false;
      };

      let decorated = new Set<HTMLElement>();
      /** The tint and the edges on the mounted cells (the tree's pinned copies too: classes only, S11-Q3); the cells no longer in the block undone. */
      const paint = (f: Frame<unknown>): void => {
        const b = boxOf(s.r, f.displayed);
        if (!b && !decorated.size) return;
        const now = new Set<HTMLElement>();
        const ed = g.editor?.cell;
        if (b) {
          const d = f.displayed;
          // The edges go on the first and last data rows: a detail at the box's top or bottom draws none.
          let top = b.top;
          let bottom = b.bottom;
          while (top < bottom && !isDataKey(d.keyAt(d.index(top)!))) top++;
          while (bottom > top && !isDataKey(d.keyAt(d.index(bottom)!))) bottom--;
          const at = new Map(ids().map((id, i) => [id, i]));
          const each = (m: ReadonlyMap<RowKey, RowView>, read: boolean): void => {
            for (const [key, v] of m) {
              const i = d.indexOf(key);
              if (i < top || i > bottom || !isDataKey(key)) continue;
              for (const [id, cv] of v.cells) {
                const ci = at.get(id) ?? -1;
                const x = cv.el;
                // The editor's cell keeps what it shows (retained-row contract 5).
                if (ci < b.start || ci > b.end || x === ed) continue;
                now.add(x);
                const l = x.classList;
                l.toggle(CLASSES[0]!, true);
                l.toggle(CLASSES[1]!, ci === b.start);
                l.toggle(CLASSES[2]!, ci === b.end);
                l.toggle(CLASSES[3]!, i === top);
                l.toggle(CLASSES[4]!, i === bottom);
                setAttr(x, 'aria-selected', read ? 'true' : null);
              }
            }
          };
          each(g.rowRenderer.mounted, true);
          for (const r of g.rowRenderer.spawned) each(r.mounted, false);
        }
        // The editor's cell keeps its classes while it edits; with no block it is no longer said selected (review 7).
        if (ed && decorated.has(ed)) now.add(ed), b || ed.removeAttribute('aria-selected');
        for (const x of decorated) if (!now.has(x)) x.classList.remove(...CLASSES), x.removeAttribute('aria-selected');
        decorated = now;
      };
      // Painted after every other feature (a tree draws its pinned copies in its own `afterRows`): a handle of its own,
      // put last at the first paint; the keys keep the feature's place.
      const tail: FeatureHandle = { afterRows: paint, destroy() {} };

      const api: RangeApi = {
        get: () => s.r,
        set(x) {
          // Never a throw (review 4): a value of the wrong shape is told and refused, nothing changed.
          const cell = (a: unknown): boolean => typeof (a as CellAddr | null)?.row === 'string' && typeof (a as CellAddr).column === 'string';
          if (x !== null && !(cell((x as CellRange | undefined)?.anchor) && cell(x.focus))) {
            emit(kernel, { type: 'problems', source: 'api', problems: [{ code: 'invalid-setting', severity: 'error', path: 'range', detail: 'not a block' }] });
            return false;
          }
          if (x && !boxOf(x)) {
            // A corner's row not shown, else a column not visible: told, never thrown.
            const row = rows.displayed.indexOf(x.anchor.row) < 0 || rows.displayed.indexOf(x.focus.row) < 0;
            const problem: Problem = { code: row ? 'unknown-row-id' : 'unknown-column', severity: 'error', path: 'range', detail: row ? 'row not shown' : 'column not visible' };
            emit(kernel, { type: 'problems', source: 'api', problems: [problem] });
            return false;
          }
          s.set(x, 'api');
          s.follows = false;
          return true;
        },
        clear: () => s.set(null, 'api'),
        box: () => boxOf(s.r),
      };
      apis.set(kernel, api);

      return {
        afterRows(f: Frame<unknown>) {
          if (g.features.includes(tail)) return;
          g.features = [...g.features, tail];
          paint(f);
        },
        keys(e: KeyboardEvent, at: FocusPos | null, owner: KeyOwner): boolean {
          if (owner !== 'cell' && owner !== 'header') return false;
          if (e.key === 'Escape') return !!s.r && (drag.stop(), s.drop('user'), true);
          // The key's meaning without Shift (mirrored right to left there): Shift with it extends the block.
          const i = intentFor({ key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: false }, { dir: g.dir, owner, mac: g.mac });
          if (!e.shiftKey) return i?.kind === 'selectAll' && (all(), true);
          const from = at?.kind === 'cell' ? at : at ? null : first();
          if (owner !== 'cell' || !from || !i) return false;
          if (i.kind === 'toggleSelect') return isDataKey(from.row) && all(from.row), true;
          if (i.kind !== 'move' && i.kind !== 'edge' && i.kind !== 'page') return false;
          // Never into the header: Up from the first row leads there (the key is still taken).
          if (i.kind === 'move' && i.axis === 'row' && i.delta < 0 && rows.displayed.indexOf(from.row) === 0) return true;
          const anchor = s.r && s.follows ? s.r.anchor : from;
          own = true;
          try {
            g.step?.(i);
          } finally {
            own = false;
          }
          const f = kernel.focus;
          if (f?.kind === 'cell') s.set({ anchor, focus: { row: f.row, column: f.column } }, 'user'), (s.follows = true);
          return true;
        },
        destroy() {
          off();
          drag.stop();
          hush();
          apis.delete(kernel);
          for (const x of decorated) x.classList.remove(...CLASSES), x.removeAttribute('aria-selected');
          decorated.clear();
          g.features = g.features.filter((h) => h !== tail);
          delete g.multi;
        },
      };
    },
  };
}
