import { intentFor, type ColumnState, type FocusPos, type GridKernel, type KeyOwner, type Side } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import type { GridFeature } from '../features.js';
import type { ColumnsMessageKey } from '../part-texts.js';
import { INTERACTIVE } from '../keys/owner.js';
import { logicalSpan, logicalX, travel, type Dir } from '../dir.js';
import { widthOf } from '../render/header-decor.js';
import { CHECK_WIDTH, setAttr, setPx } from '../render/write.js';
import { land, step } from './order.js';
import { fits } from './size.js';

/** The texts `columns()` needs, from `@dzgrid/dom/locales/<lang>-columns`. */
export const COLUMNS_KEYS = [
  'move.placed', 'move.edge', 'move.locked', 'move.cancelled',
  'size.mode', 'size.modeHint', 'size.width', 'size.min', 'size.max', 'size.cancelled', 'size.autoAll', 'size.locked',
] as const satisfies readonly ColumnsMessageKey[];

export interface ColumnsOptions {
  /** A header dragged by the mouse (never a finger, Q-M3; a pen clicks); false: the keys and the API only. Default true. */
  readonly drag?: boolean;
}
/** What a move did: `edge` at its segment's edge (O2), `locked` a `movable: false` column, `unknown` no such shown column. */
export type MoveResult = 'moved' | 'edge' | 'locked' | 'unknown';
/** An element taking a dragged header instead of a move (group-drop-zone.md D1–D5). */
export interface DropTarget {
  /** Whether it takes this column (a throw counts as no). */
  accept(column: string): boolean;
  /** Released over it: called once; nothing is moved. A throw is reported. */
  drop(column: string): void;
  readonly label?: string;
}
export interface ColumnsApi {
  /** As the keys: one place, or the segment's edge (never across a pinned edge, O2); said unless `say: false`; source `user` (the menu, step 3). */
  move(column: string, by: -1 | 1 | 'start' | 'end', o?: { readonly say?: boolean }): MoveResult;
  /** Elements taking this grid's dragged headers; `add` returns the removal. */
  readonly dropTargets: { add(el: Element, t: DropTarget): () => void };
  /**
   * Fits shown, resizable columns to their content (column-resize.md 10–14): the header and the cells as drawn (the mounted
   * rows and the first 200 displayed), one `column.state` patch; silent unless `say` (one column: its width; several: how
   * many changed). Measured at once: call it once the fonts are loaded (Q6-5).
   */
  autoSize(columns: readonly string[], o?: { readonly say?: boolean }): void;
  /** `autoSize` of every shown column. */
  autoSizeAll(o?: { readonly say?: boolean }): void;
  /** The keyboard resize mode on this column's header (focused): false when it is not shown or not resizable. */
  resizeMode(column: string): boolean;
}
export interface ColumnsFeature extends GridFeature {
  /** The moves of a grid this feature is set up on; null before its setup and after it is destroyed. */
  api(grid: { readonly kernel: GridKernel<any, any> }): ColumnsApi | null;
}

type Pt = { readonly clientX: number; readonly clientY: number };
/** A press on a header (`on`: dragging, past 4 px); `at` the last point, `to` the gap's patch (null: the same place; undefined: no gap), `over` a target. */
type Drag = { readonly id: string; readonly p0: Pt; readonly pid: number; readonly dir: Dir; readonly cell: HTMLElement; on?: boolean; at?: Pt; to?: ColumnState[] | null | undefined; over?: Element | null };

/**
 * `columns(options)`: moving columns (docs/behaviors/column-move.md; step02-plan). A header pressed with the mouse and
 * moved 4 px drags: a ghost of its text, a bar on the gap it lands in (logical, either direction; the segment it
 * targets pins or unpins it), auto-scroll near the centre's edges; one `column.state` patch on release, said. Ctrl+Shift
 * (Cmd+Shift on a Mac) + arrows, Home, End move the focused header within its segment, the place said after a pause.
 * Registered drop targets take a drag instead (group-drop-zone.md). One feature object may serve several grids.
 *
 * ```ts
 * import { columns } from '@dzgrid/dom/columns';
 * import { FR_COLUMNS } from '@dzgrid/dom/locales/fr-columns';
 * import '@dzgrid/theme/columns.css';
 * createGrid(host, { …, messages: { ...FR, text: { ...FR.text, ...FR_COLUMNS.text } }, features: [columns()] });
 * ```
 */
export function columns(o: ColumnsOptions = {}): ColumnsFeature {
  const apis = new WeakMap<object, ColumnsApi>();
  return {
    id: 'columns',
    api: (grid) => apis.get(grid.kernel) ?? null,
    setup(g) {
      const missing = COLUMNS_KEYS.filter((k) => g.settings.messages.text[k] === undefined);
      if (missing.length) throw new TypeError(`columns: missing ${missing.join(', ')}`);
      const { kernel, columns: m, el, doc, win, scope } = g;
      const raf = g.env.raf ?? win;
      const targets = new Map<Element, DropTarget>();
      const text = (key: ColumnsMessageKey, id: string, p?: Record<string, number>) => g.msg(key, { column: m.get(id)?.def.header ?? id, ...p });
      const placed = (id: string) => {
        const v = m.visible();
        g.live.announce(text('move.placed', id, { n: v.findIndex((c) => c.id === id) + 1, total: v.length }));
      };
      let said = '';
      let when = 0;
      let hush = (): void => {};
      /** A move by the keys (`later`: the place said after a 300 ms pause, an edge not said twice within it) or the API. */
      const move = (id: string, by: -1 | 1 | 'start' | 'end', speak: boolean, later?: boolean): MoveResult => {
        const r = step(m, id, by);
        if (!r) return 'unknown';
        if (typeof r !== 'string') {
          kernel.dispatch({ type: 'column.state', patch: r }, 'user');
          hush();
          if (speak) later ? (hush = scope.timeout(() => placed(id), 300)) : placed(id);
          return 'moved';
        }
        const t = text(`move.${r}`, id);
        if (speak && (t !== said || g.now() - when > 300)) g.live.announce(t);
        if (later) (said = t), (when = g.now());
        return r;
      };

      // ---- Auto-size (column-resize.md 10–14) ----
      const shown = (id: string) => m.visible().some((c) => c.id === id && c.def.resizable !== false);
      /** One patch for the columns that can be fitted; `columnResized` for those whose width changed; said when asked. */
      const size = (ids: readonly string[], say?: boolean): void => {
        const r = fits(g, ids.filter(shown));
        const was = new Map([...r.keys()].map((id) => [id, widthOf(g, id)]));
        kernel.dispatch({ type: 'column.state', patch: [...r].map(([id, width]) => ({ id, width })) }, 'user');
        let n = 0;
        for (const [id, w0] of was) {
          const width = widthOf(g, id);
          if (width !== w0) n++, emit(kernel, { type: 'columnResized', source: 'user', column: id, width, finished: true });
        }
        if (say) g.live.announce(ids.length === 1 ? text('size.width', ids[0]!, { width: widthOf(g, ids[0]!) }) : g.msg('size.autoAll', { n }));
      };
      g.fit = (id) => size([id], true);

      // ---- The keyboard resize mode (column-resize.md 1–7; Q-K3, Q6-1: no buttons, O10) ----
      /** The column, its width on entering, its own width then (undefined: the definition's, maybe flexible), a key pressed. */
      let rm: { id: string; w: number; s: number | null | undefined; k?: boolean } | null = null;
      let hushW = (): void => {};
      /** Out of the mode: kept (one `finished: true` when a key changed it) or put back, its flexibility too (Escape). */
      const leave = (keep = true): void => {
        const x = rm;
        if (!x) return;
        rm = null;
        hushW();
        g.schedule();
        if (!x.k) return;
        kernel.dispatch({ type: 'column.resize', column: x.id, width: keep ? widthOf(g, x.id) : x.w, finished: true }, 'user');
        if (!keep && x.s == null) kernel.dispatch({ type: 'column.state', patch: [{ id: x.id, width: null }] }, 'user');
      };
      const enter = (id: string): boolean => {
        if (!m.visible().some((c) => c.id === id)) return false;
        if (!shown(id)) return g.live.announce(text('size.locked', id)), false;
        leave();
        const w = widthOf(g, id);
        rm = { id, w, s: m.state().find((c) => c.id === id)?.width };
        kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: id } }, 'user');
        g.restoreFocus();
        g.schedule();
        g.live.announce(text('size.mode', id, { width: w }));
        return true;
      };
      // The mode's keys come first (the grid's and the other features' never see them): Tab keeps and goes on.
      scope.on(el.root, 'keydown', (e: KeyboardEvent) => {
        const x = rm;
        const k = e.key;
        if (!x || e.isComposing) return;
        if (k === 'Tab') return leave();
        e.stopPropagation();
        if (!e.ctrlKey && !e.metaKey) e.preventDefault();
        if (k === 'Escape') leave(false), g.live.announce(g.msg('size.cancelled'));
        else if (k === 'Enter') leave();
        else if (e.ctrlKey || e.metaKey || e.altKey) return;
        // The arrow toward the column's end edge widens (its logical way, as a bare key on a cell: mirrored in right to
        // left); Shift: 1 px. Home: fitted.
        const i = intentFor({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }, { dir: g.dir, owner: 'cell', mac: false });
        const by = i?.kind === 'move' && i.axis === 'col' ? i.delta : 0;
        if (k === 'Home' || by) {
          const w0 = widthOf(g, x.id);
          const to = by ? w0 + by * (e.shiftKey ? 1 : 10) : (fits(g, [x.id]).get(x.id) ?? w0);
          kernel.dispatch({ type: 'column.resize', column: x.id, width: to, finished: false }, 'user');
          x.k = true;
          const w = widthOf(g, x.id);
          hushW();
          hushW = scope.timeout(() => g.live.announce(text('size.width', x.id, { width: w }) + (w === to ? '' : g.msg(w > to ? 'size.min' : 'size.max'))), 300);
        }
      }, { capture: true });
      // A press anywhere or the focus going elsewhere: kept, quietly (O10).
      scope.on(doc, 'pointerdown', () => leave(), { capture: true });
      scope.on(doc, 'focusin', (e) => void (rm && e.target !== g.headerRenderer.cell(rm.id) && leave()));

      // ---- The drag (column-move.md 1–10) ----
      let d: Drag | null = null;
      let frame = 0;
      let swallow = false;
      const div = (c: string, parent?: HTMLElement) => {
        const x = doc.createElement('div');
        x.className = c;
        parent?.append(x);
        return x;
      };
      const layer = div('dzg-move');
      layer.setAttribute('aria-hidden', 'true');
      const ghost = div('dzg-move-ghost', layer);
      const bar = div('dzg-move-bar', layer);
      const mark = (t: Element | null): void => {
        if (d?.over && d.over !== t) d.over.removeAttribute('data-dzg-drop');
        t?.setAttribute('data-dzg-drop', 'over');
        if (d) d.over = t;
      };
      /** The drag given up (`say`: Escape, « Move cancelled »): its frame, its layer, its marks. */
      const cancel = (say?: boolean): void => {
        const x = d;
        if (!x) return;
        mark(null);
        d = null;
        if (frame) raf!.cancelAnimationFrame(frame), (frame = 0);
        layer.remove();
        setAttr(el.root, 'data-dzg-dragging', null);
        g.schedule();
        if (x.on) {
          // The click of this gesture, after a drop or a cancel: swallowed once (never a sort); none came this task: let go.
          swallow = true;
          scope.timeout(() => (swallow = false), 0);
          if (say) g.live.announce(g.msg('move.cancelled'));
        }
      };
      /**
       * Where the last point lands (M4–M6, D2): a target that takes the column; else, inside the view, the gap nearest the
       * point in the segment under it (logical: the same code in both directions), snapped to one offered (M12); the bar
       * there, inside its segment. With `scroll`, one frame of auto-scroll first (M5); true when it scrolled.
       */
      const compute = (scroll?: boolean): boolean => {
        const x = d!;
        const p = x.at!;
        const dir = g.dir;
        const r = el.viewport.getBoundingClientRect();
        // The layer's own box (the root's padding box: its border left out).
        const R = layer.getBoundingClientRect();
        const within = (b: DOMRect) => {
          const q = logicalX(p, b, dir);
          return q >= 0 && q <= b.width && p.clientY >= b.top && p.clientY <= b.bottom;
        };
        let over: Element | null = null;
        for (const [t, v] of targets) {
          try {
            if (within(t.getBoundingClientRect()) && v.accept(x.id) === true) over = t;
          } catch {
            // A throwing accept counts as no (D4).
          }
        }
        mark(over);
        const inside = !over && within(r);
        const lx = logicalX(p, r, dir);
        const L = m.layout;
        let box = g.geometry.read();
        const e = g.headerRenderer.check ? CHECK_WIDTH : 0;
        const inl = Math.min(box.inline, L.totalWidth + e);
        const cs = e + L.start.width;
        const ce = inl - L.end.width;
        let moved = false;
        if (scroll && inside) {
          const v = lx >= cs && lx < cs + 32 ? -(32 - lx + cs) : lx <= ce && lx > ce - 32 ? 32 - ce + lx : 0;
          const to = Math.max(0, Math.min(L.center.width - ce + cs, box.scrollInline + Math.sign(v) * Math.ceil((24 * Math.abs(v)) / 32)));
          if (v && to !== box.scrollInline) (moved = true), g.geometry.writeScrollInline(to), g.schedule(), (box = g.geometry.read());
        }
        x.to = undefined;
        let at = 0;
        if (inside) {
          const s: Side | null = L.start.columns.length && lx < cs ? 'start' : L.end.columns.length && lx >= ce ? 'end' : null;
          const w = L[s ?? 'center'].widths;
          const [lo, hi, o0] = s === 'start' ? [e, cs, e] : s === 'end' ? [ce, inl, ce] : [cs, ce, cs - box.scrollInline];
          const i = w.indexAt(lx - o0);
          const res = land(m, x.id, s, i < 0 ? 0 : i + +(lx - o0 - w.offsetOf(i) > w.sizeAt(i) / 2));
          if (res) (x.to = res.patch), (at = Math.max(lo, Math.min(hi - 2, o0 + w.offsetOf(res.g) - 1)));
        }
        bar.hidden = x.to === undefined;
        setPx(bar, 'inset-inline-start', logicalSpan(r, R, dir).start + at);
        setPx(ghost, 'inset-inline-start', logicalX(p, R, dir));
        setPx(ghost, 'inset-block-start', p.clientY - R.top);
        return moved;
      };
      const tick = (): void => {
        frame = 0;
        if (d?.on && compute(true) && d) frame = raf!.requestAnimationFrame(tick);
      };
      /** Past 4 px: the drag starts (its capture, its layer, no text selected, the source marked at the paint). */
      const start = (x: Drag): void => {
        x.on = true;
        el.header.setPointerCapture?.(x.pid);
        setAttr(el.root, 'data-dzg-dragging', '');
        doc.getSelection?.()?.removeAllRanges();
        ghost.textContent = x.cell.querySelector('.dzg-hlabel')?.textContent || x.id;
        setPx(ghost, 'inline-size', Math.min(240, widthOf(g, x.id)));
        setPx(bar, 'block-size', el.header.offsetHeight + g.geometry.read().block);
        el.root.append(layer);
        g.schedule();
      };
      const mine = (e: Event): boolean => !!d && (e as PointerEvent).pointerId === d.pid;
      if (o.drag !== false) {
        scope.on(el.header, 'pointerdown', (e: PointerEvent) => {
          const t = e.target as Element;
          const c = t.closest<HTMLElement>('.dzg-hcell');
          const id = c?.dataset['col'];
          const ctl = t.closest(`${INTERACTIVE}, [data-dzg-owner], .dzg-resize`);
          // The mouse only (a finger scrolls, Q-M3; a pen clicks, as for blocks and the fill), the primary button, a column header's own area, a movable column, no open editor.
          if (d || e.button || !e.isPrimary || e.pointerType !== 'mouse' || !id || g.editor || c!.matches('.dzg-hgroup, .dzg-hextra') || (ctl && ctl !== c && c!.contains(ctl)) || m.get(id)?.def.movable === false) return;
          d = { id, p0: e, pid: e.pointerId, dir: g.dir, cell: c! };
        });
        scope.on(doc, 'pointermove', (e) => {
          const x = d;
          if (!x || !mine(e)) return;
          x.at = e as PointerEvent;
          if (!x.on) {
            if (travel(x.at, x.p0) < 4) return;
            start(x);
          }
          if (!frame && raf) frame = raf.requestAnimationFrame(tick);
        });
        scope.on(doc, 'pointerup', (e) => {
          const x = d;
          if (!x || !mine(e)) return;
          if (!x.on) return void (d = null);
          x.at = e as PointerEvent;
          compute();
          const over = x.over;
          cancel();
          if (over) {
            try {
              targets.get(over)?.drop(x.id);
            } catch (err) {
              g.report(err);
            }
          } else if (x.to) kernel.dispatch({ type: 'column.state', patch: x.to }, 'user'), placed(x.id);
        });
        scope.on(el.root, 'pointerdown', () => void (swallow = false), { capture: true });
        scope.on(el.root, 'click', (e) => void (swallow && ((swallow = false), e.stopPropagation(), e.preventDefault())), { capture: true });
        scope.on(doc, 'pointercancel', (e) => void (mine(e) && cancel()));
        scope.on(el.header, 'lostpointercapture', (e) => void (mine(e) && cancel()));
        // Escape is the drag's only (the block's Escape never sees it).
        scope.on(doc, 'keydown', (e) => void (d?.on && (e as KeyboardEvent).key === 'Escape' && (e.preventDefault(), e.stopImmediatePropagation(), cancel(true))), { capture: true });
        if (win) scope.on(win, 'blur', () => cancel());
      }
      // New columns, a hidden one, a sort: the drag given up, the mode left (keeping its width).
      const off = kernel.subscribe((e) => void ((e.type === 'columnsChanged' && cancel()) || ((e.type === 'columnsChanged' || e.type === 'sortChanged') && leave())));

      // ---- The keys (column-move.md 14–18) ----
      let refocus: string | null = null;
      apis.set(kernel, {
        move: (id, by, x) => move(id, by, x?.say !== false),
        dropTargets: {
          add: (t, v) => (targets.set(t, v), () => void (targets.delete(t) && d?.over === t && mark(null))),
        },
        autoSize: (ids, x) => size(ids, x?.say),
        autoSizeAll: (x) => size(m.visible().map((c) => c.id), x?.say),
        resizeMode: enter,
      });
      return {
        keys(e: KeyboardEvent, at: FocusPos | null, owner: KeyOwner): boolean {
          // Alt+R on a column header (by the key's place, then by its letter: AZERTY, Arabic, a Mac's Option): the mode.
          if (owner === 'header' && at?.kind === 'header' && !at.level && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.code === 'KeyR' || e.key.toLowerCase() === 'r')) return enter(at.column), true;
          if (owner !== 'header' || at?.kind !== 'header' || at.level || !e.shiftKey || e.altKey || (g.mac ? !e.metaKey || e.ctrlKey : !e.ctrlKey || e.metaKey)) return false;
          // The arrow's logical way (mirrored in right to left), Home and End: as a bare key on a cell.
          const i = intentFor({ key: e.key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }, { dir: g.dir, owner: 'cell', mac: false });
          const by = i?.kind === 'move' && i.axis === 'col' ? i.delta : i?.kind === 'edge' && i.axis === 'col' ? (i.to === 'first' ? 'start' : 'end') : 0;
          if (!by) return false;
          if (move(at.column, by, true, true) === 'moved') (refocus = at.column), g.restoreFocus();
          return true;
        },
        shortcuts: () => (g.mac ? 'Alt+R Meta+Shift+ArrowLeft Meta+Shift+ArrowRight' : 'Alt+R Control+Shift+ArrowLeft Control+Shift+ArrowRight'),
        decorateHeader(col, cell) {
          setAttr(cell, 'data-dzg-moving', d?.on && d.id === col.id ? '' : null);
          const on = rm?.id === col.id;
          setAttr(cell, 'data-dzg-resizing', on ? '' : null);
          setAttr(cell, 'aria-description', on ? g.msg('size.modeHint') : null);
        },
        afterRows() {
          if (d && d.dir !== g.dir) cancel();
          // The focused header re-ordered by the paint may lose the DOM focus in some engines (risk R1): given back.
          const c = refocus && g.headerRenderer.cell(refocus);
          refocus = null;
          if (c && doc.activeElement !== c) g.restoreFocus();
        },
        destroy() {
          off();
          cancel();
          rm = null;
          hushW();
          g.fit = undefined;
          apis.delete(kernel);
          targets.clear();
        },
      };
    },
  };
}
