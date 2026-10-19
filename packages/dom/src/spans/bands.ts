import type { ColumnLayout, FocusPos } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import { headerBands, type BandFragment, type HeaderBands } from '@dzgrid/core/spans';
import type { GridContext } from '../context.js';
import type { MoveFn } from '../features.js';
import type { HeaderBandSpec } from '../render/header.js';
import { CHECK_WIDTH, setAttr, setPx } from '../render/write.js';

/**
 * Grouped headers (blueprint A.3 and D): the group rows above the column
 * headers, from the tree of groups in the settings (`headerBands`). A group
 * cell is a column header over its columns (`aria-colspan`), cut where a
 * segment ends or another column stands between (O7: each piece keeps the
 * label), placed and sized from the column layout like the column headers,
 * mounted while any of its columns is in the column window (from its first
 * one) or while it has the focus. A column with fewer groups than there are
 * group rows has no cell where it has none: its column header is stretched up
 * over them (CSS, `data-up`).
 */
export interface Bands {
  /** The group rows, top first: one per level of the tree the grid starts with. */
  readonly specs: readonly HeaderBandSpec[];
  /** Once the header is painted: the column headers stretched over their empty group cells. */
  stretch(height: number): void;
  /** A key on a group row, or Up from a column header; undefined: not the group rows' (the grid's own move). */
  move(...a: Parameters<MoveFn>): ReturnType<MoveFn> | undefined;
}

const header = (column: string, level: number): FocusPos => (level ? { kind: 'header', column, level } : { kind: 'header', column });
const ids = (L: ColumnLayout) => [L.start, L.center, L.end].flatMap((s) => s.columns.map((c) => c.id));
/** The piece of row `k` over visible column `i`. */
const at = (levels: readonly (readonly BandFragment[])[], k: number, i: number) => levels[k]?.find((f) => f.first <= i && i < f.first + f.count);

/** Null when the grid starts with no group: no row, nothing changes. */
export function createBands(g: GridContext<unknown>): Bands | null {
  const { columns } = g;
  // The rows are made once, with the grid (features are fixed): the tree it starts with sets
  // how many; a deeper tree given later shows its outer levels only.
  const tell = (b: HeaderBands) => b.problems.length && emit(g.kernel, { type: 'problems', source: 'host', problems: b.problems });
  const first = headerBands(g.settings.columns, columns.layout);
  const D = first.depth;
  // No valid group: no row; a refused one is still told.
  if (!D) {
    tell(first);
    return null;
  }
  let memo: { tree: unknown; version: number; levels: readonly (readonly BandFragment[])[] } | null = null;
  let told: unknown;
  function levels() {
    const tree = g.settings.columns;
    if (memo?.tree !== tree || memo.version !== columns.version) {
      const b = headerBands(tree, columns.layout);
      // Told once per tree: a resize or a repaint does not tell it again.
      if (told !== tree) tell(b);
      told = tree;
      memo = { tree, version: columns.version, levels: b.levels.slice(0, D) };
    }
    return memo.levels;
  }

  const specs = Array.from({ length: D }, (_, k): HeaderBandSpec => {
    const level = k - D;
    // A group's cell by group and first column (ids may hold any character); a hidden one by column.
    const cells = new Map<string, HTMLElement>();
    const keyOf = (f: BandFragment, all: readonly string[]) => `g${f.group.length}:${f.group}${all[f.first]}`;
    return {
      id: `spans.group${level}`,
      paint(segs, p) {
        const L = p.layout;
        const all = ids(L);
        const lv = levels();
        // The focused group's cell stays mounted out of the column window (at its first column).
        const kept = p.keep?.level === level ? at(lv, k, L.start.columns.length + p.keep.center) : undefined;
        const items: [HTMLElement, HTMLElement][] = [];
        let x = 0;
        let prev: BandFragment | undefined;
        ([[segs.start, L.start], [segs.center, L.center], [segs.end, L.end]] as const).forEach(([seg, slice], s) => {
          for (let i = 0; i < slice.columns.length; i++) {
            const c = x + i;
            const f = at(lv, k, c);
            if (s === 1 && !(p.cols && i >= p.cols.first && i <= p.cols.last) && !(f && f === kept && c === f.first)) continue;
            // One header per column the column headers hold, as screen readers pair a cell with its
            // headers by position (spike S12, macOS): the group's cell at its first column mounted (a
            // group crossing the window's edge is drawn from its first column); a hidden header
            // repeating its name in each other column, or the column's name where no group stands
            // (the column header is stretched over it).
            const head = f && f !== prev;
            prev = f;
            const key = head ? keyOf(f, all) : `s${all[c]}`;
            let el = cells.get(key);
            if (!el) {
              el = g.doc.createElement('div');
              el.setAttribute('role', 'columnheader');
              if (head) {
                el.className = 'dzg-hcell dzg-hgroup';
                el.tabIndex = -1;
                el.dataset['col'] = all[f.first];
                el.dataset['level'] = String(level);
              } else el.className = 'dzg-hslot';
              cells.set(key, el);
            }
            setAttr(el, 'aria-colindex', String(p.colIndex(all[head ? f.first : c]!)));
            if (head) {
              const z = f.first - x + f.count;
              setAttr(el, 'aria-colspan', String(f.count));
              setPx(el, 'inline-size', slice.widths.offsetOf(z) - slice.widths.offsetOf(f.first - x));
              setPx(el, 'inset-inline-start', slice.widths.offsetOf(f.first - x) + (s || !p.check ? 0 : CHECK_WIDTH));
            }
            // The group's own words, already translated (its id otherwise); where no group stands,
            // the column's own (its header reaches up to here).
            const text = f ? f.label || f.group : slice.columns[i]!.def.header ?? all[c]!;
            if (el.textContent !== text) el.textContent = text;
            items.push([seg, el]);
          }
          x += slice.columns.length;
        });
        // What goes first, so that what stays is not moved (a moved node loses the focus).
        const keepEls = new Set(items.map(([, el]) => el));
        for (const [key, el] of cells) {
          if (keepEls.has(el)) continue;
          el.remove();
          cells.delete(key);
        }
        // In column order in each segment, after the box.
        let seg: HTMLElement | null = null;
        let cur: ChildNode | null = null;
        for (const [sg, el] of items) {
          if (sg !== seg) {
            seg = sg;
            cur = (sg.firstChild as HTMLElement | null)?.classList.contains('dzg-check') ? sg.firstChild!.nextSibling : sg.firstChild;
          }
          if (el === cur) cur = el.nextSibling;
          else sg.insertBefore(el, cur);
        }
      },
      cell(column) {
        const all = ids(columns.layout);
        const f = at(levels(), k, all.indexOf(column));
        // No group over that column in this row: its column header (stretched up to here).
        return f ? cells.get(keyOf(f, all)) ?? null : g.headerRenderer.cell(column);
      },
    };
  });

  return {
    specs,
    stretch(height) {
      const lv = levels();
      ids(columns.layout).forEach((id, i) => {
        const el = g.headerRenderer.cell(id);
        if (!el) return;
        let up = 0;
        for (let k = 0; k < D; k++) if (!at(lv, k, i)) up++;
        setAttr(el, 'data-up', up ? '' : null);
        if (up) setPx(el, '--dzg-up', up * height);
        else el.style.removeProperty('--dzg-up');
      });
    },
    move(_, s, from, goal, intent, base) {
      const lv = from.kind === 'header' ? from.level ?? 0 : 1;
      const row = intent.kind === 'move' && intent.axis === 'row';
      // Group rows; Up from a column header.
      if (lv > 0 || (!lv && !(row && intent.delta < 0))) return undefined;
      const all = levels();
      const col = s.cols.indexOf(from.column);
      const k = lv + D;
      const own = at(all, k, col);
      // The column aimed at: the one the keys came up from, while it is under the focused group.
      const aim = goal?.rowKey === null && (own ? goal.colIndex >= own.first && goal.colIndex < own.first + own.count : goal.colIndex === col) ? goal.colIndex : col;
      const to = (kk: number, f: BandFragment | undefined, c = aim) => (f ? { to: header(s.cols[f.first]!, kk - D), goal: { rowKey: null, colIndex: c } } : null);
      if (row) {
        // Up and Down: the next row with a group over that column; below the last, its column header.
        for (let kk = k + intent.delta; kk >= 0 && kk < D; kk += intent.delta) if (at(all, kk, aim)) return to(kk, at(all, kk, aim));
        return intent.delta < 0 ? null : { to: header(s.cols[aim]!, 0), goal: { rowKey: null, colIndex: aim } };
      }
      // Along the row, from group to group (a column with no group here is not a stop); Home, End.
      const pieces = all[k] ?? [];
      const f = intent.kind === 'move' ? (own ? pieces[pieces.indexOf(own) + intent.delta] : undefined) : intent.kind === 'edge' && intent.axis === 'col' ? pieces[intent.to === 'first' ? 0 : pieces.length - 1] : null;
      if (f !== null) return to(k, f, f?.first);
      // Page keys and row edges: into the body, under the column aimed at.
      return base!(null, s, header(s.cols[aim]!, 0), goal, intent);
    },
  };
}
