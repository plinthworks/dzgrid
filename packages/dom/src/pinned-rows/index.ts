import { assignKeys, pinnedKey, problem, type DataNode, type DisplayIndex, type DisplayedRows, type FocusPos, type GridKernel, type Problem, type RowKey } from '@dzgrid/core';
import { emit, setPinned } from '@dzgrid/core/internal';
import type { GridContext } from '../context.js';
import type { GridFeature } from '../features.js';
import type { Frame, RowRenderer } from '../render/rows.js';
import { CHECK_WIDTH, setAttr, setPx } from '../render/write.js';
import { bandHeights, crossBand } from './band.js';

/** The texts `pinnedRows()` needs, from `@dzgrid/dom/locales/<lang>-pinned`: the two row groups' names. */
export const PINNED_KEYS = ['pinned.top', 'pinned.bottom'] as const;

export type PinnedSide = 'top' | 'bottom';

/** The application's pinned rows, each keyed by the grid's `getRowId` (its own key space per side). */
export interface PinnedRowsOptions<T> {
  readonly top?: readonly T[];
  readonly bottom?: readonly T[];
}

export interface PinnedRowsApi<T> {
  /** Replaces the sides given (an omitted side is kept; `[]` empties one); a row whose id stays keeps its focus and open field. */
  set(rows: PinnedRowsOptions<T>): void;
  /** The rows as the application gave them. */
  get(): { readonly top: readonly T[]; readonly bottom: readonly T[] };
  /** A band's rows as drawn (the refused ones left out): what print and auto-size read. */
  rows(side: PinnedSide): DisplayedRows<T>;
}

export interface PinnedRowsFeature<T> extends GridFeature {
  /** The pinned rows of a grid this feature is set up on; null before its setup and after it is destroyed. */
  api(grid: { readonly kernel: GridKernel<T, any> }): PinnedRowsApi<T> | null;
}

type Pin<T> = DataNode<T> & { readonly pinned: PinnedSide };
interface Band<T> {
  /** Its side, element and renderer (a peer of the body's). */
  readonly s: PinnedSide;
  readonly el: HTMLElement;
  readonly r: RowRenderer<T>;
  /** The rows as the application gave them; the rows kept (keyed), their keys, as `DisplayedRows`. */
  d: readonly T[];
  n: Pin<T>[];
  k: RowKey[];
  rows: DisplayedRows<T>;
  /** Its height (px) at the last read of the view, and how far its rows are scrolled inside it (a band over the cap). */
  px: number;
  o: number;
  /** The focused key last seen: a new focus in the band brings its row into the band's window. */
  f: RowKey | null;
}

/** A band's rows as `DisplayedRows`: what the renderer, the keys and the editors read. */
const shown = <T>(nodes: Pin<T>[]): DisplayedRows<T> => ({
  version: 0,
  count: nodes.length,
  nodeAt: (i) => nodes[i]!,
  keyAt: (i) => nodes[i]!.key,
  indexOf: (k) => nodes.findIndex((n) => n.key === k) as DisplayIndex | -1,
  index: (n) => (nodes[n] ? (n as DisplayIndex) : null),
  // Never read for a band (no tree, no group in it): the interface's, kept short.
  nextData: () => null,
});

/**
 * `pinnedRows({ top, bottom })` (docs/behaviors/pinned-rows.md): two row groups, one sticking under the header and one at
 * the grid's foot, named by the texts; their rows drawn like the body's (formats, parts, classes, widths, pinned columns),
 * counted and numbered, never selected; the body's view shortened by them, both together at most half the view (a taller
 * band shows its rows in a window moved by the wheel and the focus); the keys across the bands; their cells editable
 * through `edit()` and `editors()` (the kernel's pinned store).
 *
 * ```ts
 * import { pinnedRows } from '@dzgrid/dom/pinned-rows';
 * import { FR_PINNED } from '@dzgrid/dom/locales/fr-pinned';
 * const pins = pinnedRows<Row>({ bottom: [totals] });
 * const grid = createGrid(host, { …, messages: { ...FR, text: { ...FR.text, ...FR_PINNED.text } }, features: [pins, edit(), editors()] });
 * pins.api(grid)!.set({ bottom: [recompute()] });
 * ```
 */
export function pinnedRows<T = unknown>(o: PinnedRowsOptions<T> = {}): PinnedRowsFeature<T> {
  const apis = new WeakMap<object, PinnedRowsApi<T>>();
  return {
    id: 'pinned-rows',
    api: (grid) => apis.get(grid.kernel) ?? null,
    setup(g0) {
      const g = g0 as unknown as GridContext<T>;
      const missing = PINNED_KEYS.filter((key) => g.settings.messages.text[key] === undefined);
      if (missing.length) throw new TypeError(`pinnedRows: missing ${missing.join(', ')}`);
      const { el, kernel } = g;
      const band = (side: PinnedSide): Band<T> => {
        const b = g.doc.createElement('div');
        b.className = `dzg-pins dzg-pins-${side}`;
        b.setAttribute('role', 'rowgroup');
        // Its layout, written once (no style element, nothing for a CSP): it sticks (under the header, its offset written at
        // each paint; at the view's foot), clips its rows (never a scroller: the pinned columns inside must follow the view's
        // sideways scroll), contains them (`content`, never `strict`, S11), above the body's rows. Its look: pinned-rows.css.
        Object.assign(b.style, { position: 'sticky', zIndex: 3, overflow: 'clip', contain: 'content', insetBlockEnd: 0 });
        (side === 'top' ? el.header : el.body).after(b);
        return { s: side, el: b, r: g.rowRenderer.spawn(b, true), d: [], n: [], k: [], rows: shown([]), px: 0, o: 0, f: null };
      };
      const T = band('top');
      const B = band('bottom');
      const bands = [T, B];
      const of = (k: RowKey): Band<T> | undefined => (k[0] === 'p' ? (k[2] === 't' ? T : B) : undefined);
      /** A side's rows keyed (pinned-rows.md 1, 4): a duplicate or an unusable id refused, more than five told. */
      const fill = (b: Band<T>, data: readonly T[]): Problem[] => {
        const ids = data.map((x) => g.settings.getRowId(x));
        const path = `pinnedRows.${b.s}`;
        const { keys, problems } = assignKeys(ids, path, (id) => pinnedKey(b.s, id));
        b.d = data;
        b.n = [];
        keys.forEach((key, i) => key && b.n.push({ key, kind: 'data', level: 0, id: ids[i]!, data: data[i]!, pinned: b.s }));
        b.k = b.n.map((n) => n.key);
        b.rows = shown(b.n);
        g.pins = [T.k.length, B.k.length];
        return [...problems, ...(data.length > 5 ? [problem('too-many-pinned-rows', 'warning', path)] : [])];
      };
      const tell = (problems: Problem[], source: 'host' | 'api'): void => void (problems.length && emit(kernel, { type: 'problems', source, problems }));
      tell([...fill(T, o.top ?? []), ...fill(B, o.bottom ?? [])], 'host');
      setPinned(kernel, (k) => of(k)?.n.find((n) => n.key === k));
      g.rowsOf = (k) => of(k)?.rows;

      // The body's view less the bands (WCAG 2.4.11: every body consumer — window, reveal, page keys — clear of them).
      const geo = g.geometry;
      const read = geo.read;
      let view = 0;
      geo.read = () => {
        const box = read();
        const h = g.rowHeight();
        view = box.block;
        [T.px, B.px] = bandHeights(T.k.length * h, B.k.length * h, view, h);
        return { ...box, block: Math.max(0, view - T.px - B.px) };
      };

      // The keys across the bands (pinned-rows.md 8, 9); inside a band, the grid's own moves over its rows. The editors'
      // Enter (`g.step`) stays inside the band (pinned-rows.md 12).
      let inside = false;
      const step = g.step!;
      g.step = (i) => {
        inside = true;
        step(i);
        inside = false;
      };
      g.move = (map, s, from, goal, intent, base) => {
        const to = crossBand({ top: T.k, bottom: B.k, body: s.rows, level: s.extras, page: s.page, cols: s.cols }, from, intent, inside);
        if (to) return { to, goal: { rowKey: to.kind === 'cell' ? to.row : null, colIndex: s.cols.indexOf(to.column) } };
        const b = from.kind === 'cell' ? of(from.row) : undefined;
        // Over the band's rows (no detail, no span in it: `whole` is the body's).
        return b ? base!(null, { ...s, rows: b.rows, whole: undefined } as never, from, goal, intent) : (g.spans?.move ?? base!)(map, s, from, goal, intent, base);
      };

      /** One band drawn on the paint's frame: its place, its size, its rows (those in its window, and the focused one). */
      let last: Frame<T> | null = null;
      const focused = (): RowKey | null => (kernel.focus?.kind === 'cell' ? kernel.focus.row : null);
      const draw = (b: Band<T>, f: Frame<T>): void => {
        const n = b.k.length;
        const h = g.rowHeight();
        const fk = focused();
        const fi = b.rows.indexOf(fk!);
        b.el.hidden = !n;
        setAttr(b.el, 'aria-label', g.msg(`pinned.${b.s}`));
        if (fk !== b.f && fi >= 0) b.o = Math.min(fi * h, Math.max(b.o, (fi + 1) * h - b.px));
        b.f = fk;
        b.o = Math.max(0, Math.min(b.o, n * h - b.px));
        setPx(b.el, 'block-size', b.px);
        setPx(b.el, 'inline-size', f.layout.totalWidth + (f.check ? CHECK_WIDTH : 0));
        const wanted: number[] = [];
        for (let i = Math.floor(b.o / h); i < n && i * h < b.o + b.px; i++) wanted.push(i);
        const rc = f.rowClass;
        b.r.render({
          ...f, displayed: b.rows, rowTop: (i) => i * h - b.o, rowHeight: () => h, spans: null, rowAttrs: () => {},
          // aria-rowindex: the top rows after the header rows, the bottom rows after the body's.
          headerRows: b === T ? f.headerRows - n : f.headerRows + f.displayed.count,
          rowClass: rc && ((c) => rc({ ...c, pinned: b.s })),
        }, wanted, fi >= 0 ? [fk!] : []);
        // Never selected (pinned-rows.md 7): the box column's cell kept (the columns line up), its box hidden.
        b.r.forEach((_, v) => v.check && ((v.check.firstChild as HTMLElement).hidden = true));
      };
      const paint = (f: Frame<T>): void => {
        const h = g.rowHeight();
        // Under every header row (no read: each is a row high); the bottom band at the grid's foot when the body is short (Q3).
        setPx(T.el, 'inset-block-start', (g.bands.length + 1 + g.headerRows.length) * h);
        setPx(B.el, 'margin-block-start', Math.max(0, view - T.px - B.px - (g.layout?.total ?? 0)));
        for (const b of bands) draw(b, f);
        last = f;
      };
      // The wheel over a band taller than its window moves its rows; at its end the page scrolls instead.
      for (const b of bands) g.scope.on(b.el, 'wheel', (e: WheelEvent) => {
        const h = g.rowHeight();
        const to = Math.max(0, Math.min(b.o + e.deltaY * (e.deltaMode ? h : 1), b.k.length * h - b.px));
        if (to !== b.o) (b.o = to), e.preventDefault(), g.schedule();
      }, { passive: false });

      const api: PinnedRowsApi<T> = {
        set(next) {
          const f = kernel.focus!;
          const fk = focused();
          const fb = fk ? of(fk) : undefined;
          const was = fb ? fb.rows.indexOf(fk!) : -1;
          const ps: Problem[] = [];
          for (const b of bands) if (next[b.s]) ps.push(...fill(b, next[b.s]!));
          tell(ps, 'api');
          if (last) paint(last);
          emit(kernel, { type: 'pinnedChanged', source: 'api' });
          // A focused pinned row gone: the nearest row of its band, else the body's first row, else the header (pinned-rows.md 16).
          if (fb && !kernel.rowOf(fk!)) {
            const d = g.rows.displayed;
            const key = fb.k[Math.min(was, fb.k.length - 1)] ?? (d.count ? d.keyAt(d.index(0)!) : null);
            const to: FocusPos = key ? { kind: 'cell', row: key, column: f.column } : { kind: 'header', column: f.column };
            if (kernel.dispatch({ type: 'focus.set', focus: to }, 'api').ok && g.hasFocus) g.restoreFocus();
          }
          g.schedule();
        },
        get: () => ({ top: T.d, bottom: B.d }),
        rows: (side) => (side === 'top' ? T : B).rows,
      };
      apis.set(kernel, api);
      return {
        afterRows: (f) => paint(f as Frame<T>),
        destroy() {
          apis.delete(kernel);
          setPinned(kernel);
          geo.read = read;
          g.step = step;
          g.move = g.rowsOf = g.pins = undefined;
          for (const b of bands) b.r.clear(), b.el.remove();
        },
      };
    },
  };
}
