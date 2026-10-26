import { intentFor, type CellAddr, type CellRange, type FocusPos, type GridKernel, type KeyOwner } from '@dzgrid/core';
import { emit, isDataKey } from '@dzgrid/core/internal';
import { boxRows, fillTarget, planFill, planPaste, rangeBox, type PlannedCell, type RangeBox } from '@dzgrid/core/range';
import type { EditApi } from '../edit/index.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { CellInput } from '../part.js';
import type { FillMessageKey, RangeMessageKey } from '../part-texts.js';
import type { RangeFeature } from '../range/index.js';
import type { Frame } from '../render/rows.js';
import { setAttr } from '../render/write.js';
import { autoScroll, cellAt } from '../range/geom.js';
import { travel } from '../dir.js';

/** The texts `fill()` needs, from `@dzgrid/dom/locales/<lang>-fill` (with `range()`'s, from `-range`). */
export const FILL_KEYS = ['fill.filled', 'fill.bulk', 'fill.mode', 'fill.pick', 'fill.cancel', 'fill.down', 'fill.up', 'fill.end', 'fill.start'] as const satisfies readonly FillMessageKey[];

export interface FillFeatureOptions {
  /** The handle drawn, dragged and clicked (the mouse drags it; a pen only clicks it, S12-Q12); false: the keys and the API only. Default true. */
  readonly handle?: boolean;
}
/** What a fill or a bulk edit did, as said. */
export interface FillCounts {
  readonly filled: number;
  readonly refused: number;
  readonly readOnly: number;
}
export interface FillApi {
  /** As a drop of the handle on `to` (`swap`: Ctrl held); null: no block nor focused data cell, `to` inside it, or not shown. */
  fill(to: CellAddr, o?: { readonly swap?: boolean }): FillCounts | null;
  /** As Ctrl+D; null when the key would not be taken. `user`: a user's gesture (the column menu's item, S12-Q12): source `user`, as the key. */
  down(o?: { readonly user?: boolean }): FillCounts | null;
  /** As Ctrl+R; null when the key would not be taken. `user`: as `down`. */
  end(o?: { readonly user?: boolean }): FillCounts | null;
  /** Bulk (QB5): one input in every cell of the block, origin `bulk`; null without a block. */
  apply(input: CellInput): FillCounts | null;
}
export interface FillFeature extends GridFeature {
  /** The fill of a grid this feature is set up on; null before its setup and after it is destroyed. */
  api(grid: { readonly kernel: GridKernel<any, any> }): FillApi | null;
}

type Pos = { row: number; col: number };
type Via = 'user' | 'api';
/** A gesture under way: a drag of the handle, the keyboard mode, or the no-drag click waiting for its cell. */
type Gesture = { readonly kind: 'drag' | 'mode' | 'pick'; readonly src: CellRange; to: Pos | null; readonly id?: number; moved?: boolean };

/**
 * `fill(blocks, options)`: the fill over `range()`'s block (docs/behaviors/fill.md 11–20; owner S12-Q1–Q8). The handle on
 * the block's corner cell, or on the focused data cell (S12-Q8), re-appended at each paint; its drag (the mouse only, S12-Q12; the
 * target outlined; the block drag's geometry and auto-scroll); a click on it then a click on a cell (WCAG 2.5.7); the
 * keyboard mode (Ctrl/Cmd+Shift+Enter, the arrows); Ctrl/Cmd+D and Ctrl/Cmd+R; bulk edit's seam (`g.bulk`, Ctrl+Enter
 * in the editors' field). Every way plans with `@dzgrid/core/range` (`fillTarget`, `planFill`, `planPaste`) and writes
 * ONE commit, said once. One feature object may serve several grids.
 *
 * ```ts
 * import { range } from '@dzgrid/dom/range';
 * import { fill } from '@dzgrid/dom/fill';
 * import { FR_FILL } from '@dzgrid/dom/locales/fr-fill';
 * import '@dzgrid/theme/fill.css';
 * const blocks = range();
 * const grid = createGrid(host, { …, messages: { ...FR, text: { ...FR.text, ...FR_RANGE.text, ...FR_FILL.text } }, features: [edit(), editors(), blocks, fill(blocks)] });
 * ```
 */
export function fill(blocks: RangeFeature, o: FillFeatureOptions = {}): FillFeature {
  const apis = new WeakMap<object, FillApi>();
  return {
    id: 'fill',
    api: (grid) => apis.get(grid.kernel) ?? null,
    setup(g) {
      const missing = FILL_KEYS.filter((key) => g.settings.messages.text[key] === undefined);
      if (missing.length) throw new TypeError(`fill: missing ${missing.join(', ')}`);
      const { kernel, rows, columns, el, doc, win, scope } = g;
      const on = !!g.settings.features?.includes(blocks);
      if (!on) emit(kernel, { type: 'problems', source: 'api', problems: [{ code: 'missing-feature', severity: 'error', path: 'features', detail: 'range' }] });
      const R = () => (on ? blocks.api(g) : null);
      const raf = g.env.raf ?? win;
      const ids = (): string[] => columns.visible().map((c) => c.id);
      const ed = () => g.edit?.api as EditApi<unknown> | undefined;
      const boxOf = (x: CellRange | null | undefined): RangeBox | null => (x ? rangeBox(x, rows.displayed, ids()) : null);
      /** The source: the block, else the focused data cell; corners by keys. */
      const source = (): CellRange | null => {
        const f = kernel.focus;
        return R() && (R()!.get() ?? (f?.kind === 'cell' && isDataKey(f.row) ? { anchor: f, focus: f } : null));
      };
      const speak = (key: FillMessageKey, p?: Readonly<Record<string, string | number>>): void => g.live.announce(g.msg(key, p));
      const cmd = (e: KeyboardEvent | MouseEvent): boolean => (g.mac ? e.metaKey : e.ctrlKey);
      let gest: Gesture | null = null;
      let hush = (): void => {};
      let frame = 0;
      let swallow = false;
      let last: { readonly clientX: number; readonly clientY: number } | null = null;
      /** Where the handle was pressed: the drag starts 4 px from it (owner 2026-10-26, no accidental fill). */
      let at = { clientX: 0, clientY: 0 };
      const aim = () => {
        const b = gest?.to && boxOf(gest.src);
        return b ? fillTarget(b, gest!.to!) : null;
      };
      /** A cell as positions of the rows shown and the visible columns. */
      const pos = (a: CellAddr | null): Pos | null => (a ? { row: rows.displayed.indexOf(a.row), col: ids().indexOf(a.column) } : null);

      /** The gesture under way given up (`say`: « Fill cancelled »): its frames, its target. */
      const cancel = (say?: boolean): void => {
        if (!gest) return;
        if (frame) raf!.cancelAnimationFrame(frame), (frame = 0);
        setAttr(el.root, 'data-dzg-filling', null);
        gest = null;
        hush();
        g.schedule();
        if (say) speak('fill.cancel');
      };

      let q = '';
      /**
       * One gesture's cells as ONE commit (fill.md 18): read-only refusals counted, the others counted and blinked when
       * mounted (not `skip`, the open field's own cell: the editors show it); without `edit()` all read-only. The
       * sentence from a microtask queued after the commit's own (« Saving »), joined with it, as the clipboard's.
       */
      const write = (cells: readonly PlannedCell[], origin: 'fill' | 'bulk', via: Via, main: FillMessageKey, skip?: CellAddr | null): FillCounts & { own?: string | undefined } => {
        const e = ed();
        const c = { filled: 0, refused: 0, readOnly: 0, own: undefined as string | undefined };
        g.live.said = '';
        if (!e) c.readOnly = cells.length;
        else for (const r of e.commit(cells, { origin, source: via }).refused) {
          if (r.code === 'read-only') c.readOnly++;
          else if ((c.refused++, skip && r.key === skip.row && r.column === skip.column)) c.own = r.code;
          else if (g.rowRenderer.cell(r.key, r.column)) e.refuse(r.key, r.column);
        }
        c.filled = cells.length - c.refused - c.readOnly;
        const mine = (q = (q && `${q}. `) + [g.msg(main, { n: c.filled }), ...(['refused', 'readOnly'] as const).filter((k) => c[k]).map((k) => g.msg(`range.${k}` as RangeMessageKey, { n: c[k] }))].join(''));
        queueMicrotask(() => {
          const x = g.live.said;
          q === mine && ((q = ''), g.live.announce(x ? `${mine}. ${x}` : mine));
        });
        return c;
      };
      /** A drop on `to` (fill.md 13): the plan, one commit, then the block source ∪ target; the focus stays. */
      const fillTo = (src: CellRange, to: Pos | null, swap: boolean, via: Via): FillCounts | null => {
        const b = boxOf(src);
        const t = b && to && to.row >= 0 && to.col >= 0 && fillTarget(b, to);
        if (!t || !ed()) return null;
        const d = rows.displayed;
        const i = ids();
        const at = (r: number, c: number): CellAddr => ({ row: d.keyAt(d.index(r)!), column: i[c]! });
        const u = { anchor: at(Math.min(b.top, t.box.top), Math.min(b.start, t.box.start)), focus: at(Math.max(b.bottom, t.box.bottom), Math.max(b.end, t.box.end)) };
        const c = write(planFill(b, t.box, t.way, d, columns.visible(), { ctx: g.ctx, reader: kernel.reader, swap }), 'fill', via, 'fill.filled');
        R()?.set(u);
        return c;
      };
      /**
       * Ctrl+D (`end` false) and Ctrl+R (fill.md 16, S12-Q6): two data rows (columns) or more, the first copied into the
       * others; one, the previous data row (visible column) copied in; nothing before it: null (the key is the browser's).
       */
      const copy = (end: boolean, via: Via): FillCounts | null => {
        const b = boxOf(source());
        if (!b || !ed()) return null;
        const d = rows.displayed;
        let s: RangeBox;
        let t = b;
        if (end) {
          if (b.end > b.start) (s = { ...b, end: b.start }), (t = { ...b, start: b.start + 1 });
          else if (b.start) s = { ...b, start: b.start - 1, end: b.start - 1 };
          else return null;
        } else {
          const data = boxRows(b, d).map((n) => d.indexOf(n.key));
          let i = data[0]! - 1;
          if (data.length > 1) (s = { ...b, bottom: data[0]! }), (t = { ...b, top: data[0]! + 1 });
          else {
            while (i >= 0 && d.nodeAt(d.index(i)!).kind !== 'data') i--;
            if (!data.length || i < 0) return null;
            s = { ...b, top: i, bottom: i };
          }
        }
        return write(planFill(s, t, end ? 'end' : 'down', d, columns.visible(), { ctx: g.ctx, reader: kernel.reader, mode: 'copy' }), 'fill', via, 'fill.filled');
      };
      /** Bulk (QB5, fill.md 17): one input in every cell of the block; `at` the field's cell, which must be in it. */
      const bulk = (at: CellAddr | null, input: CellInput | undefined, via: Via) => {
        const b = boxOf(R()?.get());
        const p = pos(at);
        if (!b || (p && (p.row < b.top || p.row > b.bottom || p.col < b.start || p.col > b.end))) return null;
        const v = input ?? (at && { value: g.edit!.read(columns.get(at.column)!, rows.row(at.row)!.data, at.row) });
        return v ? write(planPaste([[v]], b, rows.displayed, columns.visible()).cells, 'bulk', via, 'fill.bulk', at) : null;
      };
      g.bulk = (at, input) => bulk(at, input, 'user');

      // ---- The handle (fill.md 11–14) ----
      const span = doc.createElement('span');
      span.className = 'dzg-fill';
      span.setAttribute('aria-hidden', 'true');
      /** The cell the handle sits on, or none (fill.md 11; with no block, only while the focus is in the grid, 25). */
      const corner = (): HTMLElement | null => {
        const b = o.handle !== false && ed() && !g.editor && !el.root.hasAttribute('data-dzg-ranging') && (gest || R()?.get() || el.root.contains(doc.activeElement)) ? boxOf(gest?.src ?? source()) : null;
        if (!b) return null;
        const n = boxRows(b, rows.displayed).at(-1);
        const cols = columns.visible();
        const ok = n && (b.top === b.bottom && b.start === b.end ? kernel.editable(n.key, cols[b.end]!.id) : cols.slice(b.start, b.end + 1).some((c) => c.def.editable));
        return ok ? g.rowRenderer.cell(n.key, cols[b.end]!.id) : null;
      };
      let decorated = new Set<HTMLElement>();
      /** The handle re-appended, the target outlined on the mounted cells (data rows); the cells no longer in it undone. */
      const paint = (f: Frame<unknown>): void => {
        const t = aim();
        const now = new Set<HTMLElement>();
        if (t) {
          const at = new Map(ids().map((id, i) => [id, i]));
          for (const [key, v] of g.rowRenderer.mounted) {
            const i = f.displayed.indexOf(key);
            if (i < t.box.top || i > t.box.bottom || !isDataKey(key)) continue;
            for (const [id, cv] of v.cells) {
              const c = at.get(id) ?? -1;
              if (c >= t.box.start && c <= t.box.end) now.add(cv.el), cv.el.classList.add('dzg-cell--fill');
            }
          }
        }
        for (const x of decorated) if (!now.has(x)) x.classList.remove('dzg-cell--fill');
        decorated = now;
        place();
      };
      const place = (): void => {
        const c = corner();
        c ? span.parentNode !== c && c.append(span) : span.remove();
      };

      /**
       * The target follows the pointer, a row counted once the pointer is half a row inside it (an edge slip fills
       * nothing); the first move out of the source, 4 px or more from the press, starts the drag (its capture, no text
       * selected). The release writes the last target shown.
       */
      const track = (): void => {
        const b = gest?.kind === 'drag' && boxOf(gest.src);
        const p = b && pos(last && cellAt(g, last));
        if (!p || !b) return;
        const s = p.row > b.bottom ? 1 : p.row < b.top ? -1 : 0;
        // Half a row back toward the source, less 2 px (a cell's middle counts, even where an engine rounds the pointer
        // to whole pixels: Firefox, WebKit): the row then under the pointer.
        if (s) p.row = pos(cellAt(g, last!, (-s * (g.rowHeight() - 4)) / 2))!.row;
        if (!gest!.moved) {
          if (!fillTarget(b, p) || travel(last!, at) < 4) return;
          gest!.moved = true;
          setAttr(el.root, 'data-dzg-filling', '');
          try {
            el.body.setPointerCapture?.(gest!.id!);
          } catch {
            // Already released: the document's events still come.
          }
        }
        gest!.to = p;
        g.schedule();
        if (!frame && raf) frame = raf.requestAnimationFrame(step);
      };
      const step = (): void => {
        frame = 0;
        if (gest?.moved && last && autoScroll(g, last)) track();
      };
      scope.on(span, 'pointerdown', (e: PointerEvent) => {
        // A finger scrolls (S12-Q3), a pen too (S12-Q12, as range): its press is neither taken nor prevented.
        if (e.pointerType !== 'mouse' || !e.isPrimary || e.button) return;
        e.stopPropagation();
        e.preventDefault();
        const s = gest ? null : source();
        if (s) (gest = { kind: 'drag', src: s, to: null, id: e.pointerId }), (last = at = e), (swallow = false);
      });
      scope.on(span, 'dblclick', (e) => e.stopPropagation());
      const mine = (e: Event): boolean => gest?.kind === 'drag' && (e as PointerEvent).pointerId === gest.id;
      scope.on(doc, 'pointermove', (e) => void (mine(e) && ((last = e as PointerEvent), track())));
      scope.on(doc, 'pointerup', (e) => {
        if (!mine(e)) return;
        const x = gest!;
        if (!x.moved) return void (gest = null);
        cancel();
        // The click of this same task, after the release: swallowed once.
        swallow = true;
        scope.timeout(() => (swallow = false), 0);
        const p = e as PointerEvent;
        fillTo(x.src, x.to, p.ctrlKey || p.metaKey, 'user');
      });
      scope.on(doc, 'pointercancel', (e) => void (mine(e) && cancel()));
      scope.on(el.body, 'lostpointercapture', (e) => void (mine(e) && cancel()));
      // The no-drag way (WCAG 2.5.7): presses while it waits are its own (the block is not dropped, the focus not moved).
      for (const type of ['pointerdown', 'mousedown']) scope.on(el.body, type, (e) => void (gest?.kind === 'pick' && e.target !== span && (e.stopPropagation(), e.preventDefault())), { capture: true });
      scope.on(el.body, 'click', (e: MouseEvent) => {
        if (swallow) return void ((swallow = false), e.stopPropagation(), e.preventDefault());
        const x = gest;
        if (e.target === span) {
          e.stopPropagation();
          if (x) return cancel();
          const s = source();
          if (s) (gest = { kind: 'pick', src: s, to: null }), speak('fill.pick');
          return;
        }
        if (x?.kind !== 'pick') return;
        e.stopPropagation();
        e.preventDefault();
        cancel();
        fillTo(x.src, pos(cellAt(g, e)), e.ctrlKey || e.metaKey, 'user');
      }, { capture: true });
      // A press anywhere but on a cell of this body (the page, the box column, a panel, a nested grid) disarms the
      // no-drag way, said (review 2).
      scope.on(doc, 'pointerdown', (e) => {
        const c = (e.target as Element).closest?.('.dzg-cell');
        const r = c?.closest('.dzg-row');
        // Silent when the block's own clearing speaks for this same press (outside the grid, a block there; review 2026-10-26).
        if (gest?.kind === 'pick' && !(r && el.layer.contains(r) && g.rowRenderer.keyOf(r))) cancel(!cleared && !(R()?.get() && !e.composedPath().includes(el.root)));
      }, { capture: true });
      if (win) scope.on(win, 'blur', () => cancel());
      // The mode and the no-drag way left by the focus (a blur of the grid): one task later, the focus no longer in it;
      // the handle of one cell hidden then, shown again when the focus comes back (25).
      scope.on(el.root, 'focusin', place);
      scope.on(el.root, 'focusout', () => void scope.timeout(() => (place(), gest && gest.kind !== 'drag' && !el.root.contains(doc.activeElement) && cancel()), 0));

      let cleared = false;
      const off = kernel.subscribe((e) => {
        if (!gest) return;
        // The block cleared by the user in this task (a press outside, range first): the fill's cancel is then silent.
        if (e.type === 'rangeChanged' && e.source === 'user' && !e.range) (cleared = true), scope.timeout(() => (cleared = false), 0);
        // An application's block change or clear (`rangeChanged` from `api`) cancels it: nothing written, nothing given back.
        if ((e.type === 'rangeChanged' && e.source === 'api') || e.type === 'sortChanged' || e.type === 'filterChanged' || e.type === 'quickChanged' || e.type === 'pageChanged' || e.type === 'columnsChanged' || (e.type === 'modelUpdated' && (e.kind === 'order' || e.kind === 'query' || !boxOf(gest.src))) || (e.type === 'focusChanged' && gest.kind === 'mode')) cancel();
      });

      // ---- The keys (fill.md 15–16): asked before every other feature (range's Escape and Delete), a handle put first ----
      const mode = (e: KeyboardEvent): boolean => {
        if (e.key === 'Escape') return cancel(true), true;
        if (e.key === 'Tab') return cancel(), false;
        const x = gest!;
        if (e.key === 'Enter') return cancel(), fillTo(x.src, x.to, cmd(e), 'user'), true;
        const i = intentFor({ key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: false }, { dir: g.dir, owner: 'cell', mac: g.mac });
        const d = rows.displayed;
        const n = ids().length;
        const to = x.to!;
        const clamp = (v: number, hi: number): number => Math.max(0, Math.min(hi - 1, v));
        if (i?.kind === 'move') i.axis === 'row' ? (to.row = clamp(to.row + i.delta, d.count)) : (to.col = clamp(to.col + i.delta, n));
        else if (i?.kind === 'edge') {
          if (i.axis !== 'col') to.row = i.to === 'first' ? 0 : d.count - 1;
          if (i.axis !== 'row') to.col = i.to === 'first' ? 0 : n - 1;
        } else if (i?.kind === 'page') to.row = clamp(to.row + i.delta * Math.max(1, Math.floor(g.geometry.read().block / g.rowHeight())), d.count);
        else return true;
        g.ensureVisible(d.keyAt(d.index(to.row)!), ids()[to.col]);
        g.schedule();
        hush();
        hush = scope.timeout(() => {
          const t = aim();
          const v = t && (t.way === 'down' || t.way === 'up');
          if (t) speak(`fill.${t.way}`, { n: g.msg(v ? 'range.rows' : 'range.cols', { n: v ? boxRows(t.box, d).length : t.box.end - t.box.start + 1 }) });
        }, 400);
        return true;
      };
      const head: FeatureHandle = {
        keys(e: KeyboardEvent, _at: FocusPos | null, owner: KeyOwner): boolean {
          if (gest?.kind === 'mode') return mode(e);
          if (gest && e.key === 'Escape') return cancel(true), true;
          if (owner !== 'cell' || g.editor || !ed() || !cmd(e) || e.ctrlKey === e.metaKey || e.altKey) return false;
          if (e.key === 'Enter' && e.shiftKey) {
            const s = source();
            const b = boxOf(s);
            return !!b && ((gest = { kind: 'mode', src: s!, to: { row: b.bottom, col: b.end } }), speak('fill.mode'), true);
          }
          const k = (/^[a-z]$/i.test(e.key) ? e.key : e.code.slice(3)).toLowerCase();
          return !e.shiftKey && (k === 'd' || k === 'r') && !!copy(k === 'r', 'user');
        },
        destroy() {},
      };
      const tail: FeatureHandle = { afterRows: paint, destroy() {} };

      apis.set(kernel, {
        fill: (to, x) => {
          const s = source();
          return s && fillTo(s, pos(to), !!x?.swap, 'api');
        },
        down: (x) => copy(false, x?.user ? 'user' : 'api'),
        end: (x) => copy(true, x?.user ? 'user' : 'api'),
        apply: (input) => {
          const c = bulk(null, input, 'api');
          return c && { filled: c.filled, refused: c.refused, readOnly: c.readOnly };
        },
      });

      return {
        afterRows(f: Frame<unknown>) {
          const F = g.features;
          if (F[0] === head && F.at(-1) === tail) return;
          g.features = [head, ...F.filter((h) => h !== head && h !== tail), tail];
          if (!F.includes(tail)) paint(f);
        },
        destroy() {
          off();
          cancel();
          apis.delete(kernel);
          span.remove();
          for (const x of decorated) x.classList.remove('dzg-cell--fill');
          g.features = g.features.filter((h) => h !== head && h !== tail);
          delete g.bulk;
        },
      };
    },
  };
}
