import { intentFor, problem, type ClientModel, type DisplayIndex, type FocusPos, type GridKernel, type KeyOwner, type RowKey } from '@dzgrid/core';
import { emit, positions, storeOf } from '@dzgrid/core/internal';
import { dropPlace, moveRows, movingRows, nextPlace, parentAfter, placeOf, unchanged, within, type MoveStep, type RowDrop } from '@dzgrid/core/row-drag';
import { needTexts } from '@dzgrid/dom/internal';
import type { GridContext } from '../context.js';
import type { GridFeature } from '../features.js';
import type { RowDragMessageKey } from '../part-texts.js';
import type { MenuEntry, MenuGrid, MenuItem } from '../menu/types.js';
import { logicalSpan, logicalX, travel, type Dir } from '../dir.js';
import { autoScroll, extra, place } from '../range/geom.js';
import { setAttr, setPx } from '../render/write.js';

/** The texts `rowDrag()` needs, from `@dzgrid/dom/locales/<lang>-row-drag`. */
export const ROW_DRAG_KEYS = 'placed placedLevel many hidden edge locked sorted grouped refused tooMany cancelled ghost up down top bottom in out'
  .split(' ').map((k) => `rmove.${k}`) as readonly RowDragMessageKey[];

/** What `canDrop` is asked: the rows moved (display order), the place, the new parent (a tree; null: a root or a flat list). */
export interface RowDropInfo<T> {
  readonly keys: readonly RowKey[];
  readonly rows: readonly T[];
  readonly target: RowDrop;
  readonly parent: RowKey | null;
}
export interface RowDragOptions<T = unknown> {
  /** The column whose cells show the grip (default: the first visible column); hidden, no grip. */
  readonly column?: string;
  /** The grid reorders its rows itself (flat browser rows only, Q-RD1); default false: the event only. */
  readonly apply?: boolean;
  /** Sorted or grouped rows: refused (default), or `allow`: the event is sent and the application decides (never applied). */
  readonly whenSorted?: 'refuse' | 'allow';
  /** A row that may not move (a throw counts as no, reported once a gesture). */
  readonly canDrag?: (row: T) => boolean;
  /** A place a move may not go (asked at most once a frame during a drag; a throw counts as no, reported once a gesture). */
  readonly canDrop?: (m: RowDropInfo<T>) => boolean;
  /** The most rows one gesture moves (default 1 000): more is refused, said. */
  readonly maxRows?: number;
  /** False: no grip, no pointer drag (the keys, the menu and the API stay). Default true. */
  readonly drag?: boolean;
}
/** What a move did: `edge` nothing would change, `unknown` no such row shown, else why it was refused. */
export type RowMoveResult = 'moved' | 'edge' | 'locked' | 'sorted' | 'grouped' | 'refused' | 'tooMany' | 'unknown';
/** An element taking dragged rows instead of a move (row-move.md 23): another list, a trash zone, another grid's root. */
export interface RowDropTarget {
  /** Whether it takes these rows (a throw counts as no). */
  accept(keys: readonly RowKey[]): boolean;
  /** Released over it: called once; the grid moves nothing. A throw is reported. */
  drop(keys: readonly RowKey[]): void;
  readonly label?: string;
}
export interface RowDragApi {
  /** Moves rows to a place by the same rules as a drag (source `api`); silent unless `say`. */
  move(keys: readonly RowKey[], target: RowDrop, o?: { readonly say?: boolean }): RowMoveResult;
  /** As the keys (row-move.md 17): one place, the first or last place, inside the sibling before, out after the parent. */
  step(key: RowKey, by: MoveStep, o?: { readonly say?: boolean }): RowMoveResult;
  /** Elements taking this grid's dragged rows; `add` returns the removal. */
  readonly dropTargets: { add(el: Element, t: RowDropTarget): () => void };
}
export interface RowDragFeature<T = unknown> extends GridFeature {
  /** The moves of a grid this feature is set up on; null before its setup and after it is destroyed. */
  api(grid: { readonly kernel: GridKernel<any, any> }): RowDragApi | null;
  /**
   * The cell menu's items for a row (row-move.md 22): `contextMenu({ items: (c, d) => [...d, ...drag.menuItems(c)] })` —
   * Move up / down / to top / to bottom (+ Indent / Outdent in a tree), disabled at an edge or when refused. None
   * without the feature on that grid.
   */
  menuItems<C extends { readonly key: RowKey; readonly grid: MenuGrid }>(c: C): MenuEntry<C>[];
  /** Type only: the rows' type. */
  readonly __rows?: T;
}

/** The grip's and the layer's layout (no colour: `@dzgrid/theme/row-drag.css`), injected once per document or shadow root. */
const CSS =
  '@layer dzgrid.layout{' +
  ':where(.dzg-grip){display:inline-flex;flex:none;align-items:center;justify-content:center;vertical-align:middle;inline-size:var(--dzg-target-min,24px);block-size:var(--dzg-target-min,24px);margin-inline-end:.125rem;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}' +
  ':where(.dzg-grip)::before{content:"\\283f";line-height:1}:where(.dzg-grip[data-dzg-off]){cursor:not-allowed}' +
  ':where(.dzg-rmove){position:absolute;inset:0;z-index:6;pointer-events:none}' +
  ':where(.dzg-rmove>*){position:absolute;box-sizing:border-box}' +
  ':where(.dzg-rmove-ghost){max-inline-size:240px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;margin-block-start:-.75em}' +
  ':where(.dzg-rmove-bar){block-size:2px;background:currentColor}:where(.dzg-rmove-in){outline:2px solid currentColor;outline-offset:-2px}' +
  '}';

type Pt = { readonly clientX: number; readonly clientY: number };
/** A press on a grip (`on`: dragging, past 4 px): the rows it moves, the last point, the place, a drop target under it. */
type Drag = { readonly key: RowKey; readonly p0: Pt; readonly pid: number; readonly dir: Dir; on?: boolean; keys?: RowKey[]; at?: Pt; to?: RowDrop | null; over?: Element | null };
type Api = RowDragApi & { items(key: RowKey): MenuItem<never>[] };

/**
 * `rowDrag(options)`: moving rows (docs/behaviors/row-move.md; row-drag-plan.md; owner answers « Row drag », 2026-11-05).
 * A grip at the start of a column's cells, pressed by a mouse, a pen or a finger and moved 4 px, drags the row (the
 * selected rows when it is selected): a ghost, a line on the gap it lands in (a tree's middle: inside), auto-scroll near
 * the top and bottom; one `rowMove` event on release. Alt+Shift+↑ / ↓ / Home / End (and → / ← in a tree) move the focused
 * row; the cell menu's items through `menuItems`. The application reorders its rows (`moveRows`), or the grid does with
 * `apply: true` (flat browser rows). Every way goes through `@dzgrid/core/row-drag`'s rules. One feature object may serve
 * several grids.
 *
 * ```ts
 * import { rowDrag } from '@dzgrid/dom/row-drag';
 * import { moveRows } from '@dzgrid/core/row-drag';
 * import { FR_ROW_DRAG } from '@dzgrid/dom/locales/fr-row-drag';
 * import '@dzgrid/theme/row-drag.css';
 * createGrid(host, { …, messages: { ...FR, text: { ...FR.text, ...FR_ROW_DRAG.text } }, features: [rowDrag()],
 *   onEvent: (e) => e.type === 'rowMove' && grid.kernel.rows.setRows((rows = moveRows(rows, e, getRowId))) });
 * ```
 */
export function rowDrag<T = unknown>(o: RowDragOptions<T> = {}): RowDragFeature<T> {
  const apis = new WeakMap<object, Api>();
  return {
    id: 'row-drag',
    api: (grid) => apis.get(grid.kernel) ?? null,
    menuItems: (c) => (apis.get(c.grid.kernel)?.items(c.key) ?? []) as never,
    setup: (g) => setup(g, o as RowDragOptions<unknown>, apis),
  };
}

function setup(g: GridContext<unknown>, o: RowDragOptions<unknown>, apis: WeakMap<object, Api>) {
  needTexts(g, ROW_DRAG_KEYS, 'rowDrag');
  const { kernel, el, doc, win, scope } = g;
  const raf = g.env.raf ?? win;
  const target = el.root.getRootNode() as Document | ShadowRoot;
  if (g.settings.injectStyles !== false && !target.querySelector?.('style[data-dzgrid-rmove]')) {
    const s = doc.createElement('style');
    s.setAttribute('data-dzgrid-rmove', '');
    if (g.settings.nonce) s.setAttribute('nonce', g.settings.nonce);
    s.textContent = CSS;
    ('head' in target ? target.head : target).append(s);
  }
  const server = g.rows.kind === 'source';
  // A server's rows are the server's to reorder (Q-RD6): told once, the event only.
  if (o.apply && server) emit(kernel, { type: 'problems', source: 'host', problems: [problem('invalid-setting', 'warning', 'rowDrag.apply')] });
  const T = (k: string, p?: Readonly<Record<string, number>>): string => g.msg(`rmove.${k}` as RowDragMessageKey, p);
  const say = (t: string): void => g.live.announce(t);
  const rows = () => g.rows.displayed;
  const tree = (): boolean => !!rows().parentOf;
  /** The grip's column: the one named while shown, else (none named) the first visible. */
  const col = (): string | null => {
    const v = g.columns.visible();
    return o.column ? (v.some((c) => c.id === o.column) ? o.column : null) : v[0]?.id ?? null;
  };
  /** Why every move is refused now (row-move.md 14). */
  const off = (): 'grouped' | 'sorted' | null => (o.whenSorted === 'allow' ? null : g.grouped?.by().length ? 'grouped' : kernel.query.sort.length ? 'sorted' : null);
  let told = false;
  /** A host callback's yes; a throw is no, reported once a gesture. */
  const ask = (fn: () => boolean): boolean => {
    try {
      return fn() === true;
    } catch (err) {
      if (!told) (told = true), g.report(err);
      return false;
    }
  };
  const isSel = (k: RowKey): boolean => {
    const s = kernel.selection;
    return s.mode === 'include' ? s.keys.has(k) : !s.keys.has(k);
  };
  const dataOf = (keys: readonly RowKey[]): unknown[] => keys.map((k) => kernel.rowOf(k)!.data);
  const info = (keys: readonly RowKey[], t: RowDrop): RowDropInfo<unknown> => ({ keys, rows: dataOf(keys), target: t, parent: tree() ? parentAfter(rows(), t) : null });
  let said = '';
  let when = 0;
  /** A refusal or an edge: said at once (`later`: not twice within 300 ms, a key held). */
  const no = (r: RowMoveResult, speak: number, p?: Readonly<Record<string, number>>): RowMoveResult => {
    const t = T(r, p);
    if (speak && (speak < 2 || t !== said || g.now() - when > 300)) say(t);
    if (speak > 1) (said = t), (when = g.now());
    return r;
  };
  /** The rows a gesture from `key` moves (row-move.md 13), or why not. */
  const take = (key: RowKey, speak: number): RowKey[] | RowMoveResult => {
    const why = off();
    if (why) return no(why, speak);
    const d = rows();
    const max = o.maxRows ?? 1000;
    let ks: RowKey[] = [key];
    if (isSel(key)) {
      ks = [];
      for (const i of positions(d)) {
        const n = d.nodeAt(i);
        if (n.kind === 'data' && isSel(n.key) && ks.push(n.key) > max) return no('tooMany', speak, { max });
      }
    }
    const mv = movingRows(d, ks);
    if (!mv.length) return 'unknown';
    told = false;
    return o.canDrag && dataOf(mv).some((r) => !ask(() => o.canDrag!(r))) ? no('locked', speak) : mv;
  };

  // ---- Moving (one path for the pointer, the keys, the menu and the API) ----
  let hush = (): void => {};
  let waiting: (() => void) | null = null;
  let refocus = false;
  /** The rows' place said (row-move.md 25): a count for several, a place for one, nothing of a row's values. */
  const placed = (mv: readonly RowKey[]): void => {
    const p = mv.length > 1 ? null : placeOf(rows(), mv[0]!, tree());
    say(mv.length > 1 ? T('many', { n: mv.length }) : !p ? T('hidden') : T(tree() ? 'placedLevel' : 'placed', p));
  };
  /**
   * The event, the managed reorder, a closed new parent opened; the focus (`at`) kept on the moved row; its place said
   * once the rows are back (`later`: after a 300 ms pause), the application's rows waited for when they are not yet.
   */
  const commit = (mv: RowKey[], t: RowDrop, via: 'pointer' | 'keys' | 'menu' | 'api', at: FocusPos | null, speak: number): void => {
    const d0 = rows();
    const tr = tree();
    const src = via === 'api' ? 'api' : 'user';
    // Never on a server, a tree, sorted or grouped rows (row-move.md 14, 16).
    const managed = !!o.apply && !server && !tr && !kernel.query.sort.length && !g.grouped?.by().length;
    const data = dataOf(mv);
    if (managed) {
      const m = g.rows as ClientModel<unknown>;
      m.setRows(moveRows(storeOf(m).snapshot.rows, { keys: mv, target: t }, g.settings.getRowId), src);
    }
    emit(kernel, { type: 'rowMove', source: src, via, keys: mv, rows: data, target: t, parent: tr ? parentAfter(d0, t) : null, applied: managed });
    // Opened by the grid (`api`: the tree says nothing; the move's sentence follows).
    if (tr && t.where === 'inside') kernel.dispatch({ type: 'rows.expand', rows: [t.key!], expanded: true }, 'api');
    if (at?.kind === 'cell' && kernel.dispatch({ type: 'focus.set', focus: at }, src).ok) (refocus = true), g.ensureVisible(at.row, at.column), g.schedule();
    hush();
    waiting = null;
    if (!speak) return;
    const ready = (): void => void (speak > 1 ? (hush = scope.timeout(() => placed(mv), 300)) : placed(mv));
    if (rows() !== d0) ready();
    // Not given back yet (a server first): said when they arrive, within 5 s (never a stale sentence later).
    else (waiting = ready), scope.timeout(() => void (waiting === ready && (waiting = null)), 5000);
  };
  /** A keyboard step (keys, menu, API): the same rules as a drag. */
  const step = (key: RowKey, by: MoveStep, via: 'keys' | 'menu' | 'api', speak: number, column?: string): RowMoveResult => {
    const d = rows();
    if (!movingRows(d, [key]).length) return 'unknown';
    const mv = take(key, speak);
    if (typeof mv === 'string') return mv;
    // The focused row may travel with a selected ancestor: the steps are then that ancestor's.
    const t = nextPlace(d, mv, mv.includes(key) ? key : mv[0]!, by, tree());
    if (!t) return no('edge', speak);
    if (o.canDrop && !ask(() => o.canDrop!(info(mv, t)))) return no('refused', speak);
    const f = kernel.focus;
    commit(mv, t, via, column ? { kind: 'cell', row: key, column } : f?.kind === 'cell' && mv.includes(f.row) ? f : null, speak);
    return 'moved';
  };

  // ---- The drag (row-move.md 5–13, 23) ----
  const targets = new Map<Element, RowDropTarget>();
  let d: Drag | null = null;
  let frame = 0;
  let swallow = false;
  let spring: RowKey | null = null;
  let unspring = (): void => {};
  const div = (c: string, parent?: HTMLElement) => {
    const x = doc.createElement('div');
    x.className = c;
    parent?.append(x);
    return x;
  };
  const layer = div('dzg-rmove');
  layer.setAttribute('aria-hidden', 'true');
  const ghost = div('dzg-rmove-ghost', layer);
  const bar = div('dzg-rmove-bar', layer);
  const box = div('dzg-rmove-in', layer);
  const mark = (t: Element | null): void => {
    if (d?.over && d.over !== t) d.over.removeAttribute('data-dzg-drop');
    t?.setAttribute('data-dzg-drop', 'over');
    if (d) d.over = t;
  };
  const cancel = (speak?: boolean): void => {
    const x = d;
    if (!x) return;
    mark(null);
    d = null;
    unspring();
    spring = null;
    if (frame) raf!.cancelAnimationFrame(frame), (frame = 0);
    layer.remove();
    setAttr(el.root, 'data-dzg-dragging', null);
    g.schedule();
    if (x.on) {
      swallow = true;
      scope.timeout(() => (swallow = false), 0);
      if (speak) say(T('cancelled'));
    }
  };
  /** A tree row's own indent (`--dzg-tree-pad`'s pixels after the cell padding), else 16 px a level. */
  const indent = (key: RowKey, level: number): number => {
    for (const [, c] of g.rowRenderer.mounted.get(key)?.cells ?? []) {
      const m = /\+\s*([\d.]+)px\)$/.exec(c.el.style.getPropertyValue('--dzg-tree-pad'));
      if (m) return +m[1]!;
    }
    return level * 16;
  };
  /**
   * Where the last point lands: a target that takes the rows; else, inside the view, the place under it (the core's
   * `dropPlace`, then `canDrop`), drawn as a line at the gap (from the target level's indent) or an outline (inside). With
   * `scroll`, one frame of auto-scroll first, on the block axis only (true when it scrolled).
   */
  const compute = (scroll?: boolean): boolean => {
    const x = d!;
    const p = x.at!;
    const v = el.viewport.getBoundingClientRect();
    const R = layer.getBoundingClientRect();
    const dir = g.dir;
    const inBox = (b: DOMRect) => {
      const q = logicalX(p, b, dir);
      return q >= 0 && q <= b.width && p.clientY >= b.top && p.clientY <= b.bottom;
    };
    let over: Element | null = null;
    for (const [t, a] of targets) {
      try {
        if (inBox(t.getBoundingClientRect()) && a.accept(x.keys!) === true) over = t;
      } catch {
        // A throwing accept counts as no.
      }
    }
    mark(over);
    // Auto-scroll on the block axis only (row-move.md 9): the sideways scroll it may write is put back at once.
    const top = g.scroll.logicalTop;
    const si = g.geometry.read().scrollInline;
    if (scroll && !over && autoScroll(g, p) && g.geometry.read().scrollInline !== si) g.geometry.writeScrollInline(si);
    const moved = g.scroll.logicalTop !== top;
    const dd = rows();
    const L = g.layout;
    const tr = tree();
    let t: RowDrop | null = null;
    if (!over && inBox(v) && L && dd.count) {
      const lt = g.scroll.logicalTop;
      const at = lt + Math.max(g.inset ?? 0, Math.min(g.geometry.read().block - 1, place(g, p).block));
      const i = L.indexAt(at);
      t = dropPlace(dd, i, (at - L.offsetOf(i)) / (L.heightOf(i) || 1), x.keys!, tr);
      if (t && o.canDrop && !ask(() => o.canDrop!(info(x.keys!, t!)))) t = null;
    }
    x.to = t;
    const ti = t?.key != null ? dd.indexOf(t.key) : (-1 as const);
    // A closed parent held inside opens after 0.8 s (row-move.md 10); never under the keys.
    const sp = t?.where === 'inside' && ti !== -1 && (dd as { childrenAt?(i: DisplayIndex): number }).childrenAt?.(ti) !== 0 && !(dd as { expandedAt?(i: DisplayIndex): boolean }).expandedAt?.(ti) ? t.key : null;
    if (sp !== spring) {
      unspring();
      spring = sp;
      if (sp) unspring = scope.timeout(() => void (d === x && spring === sp && (kernel.dispatch({ type: 'rows.expand', rows: [sp], expanded: true }, 'api'), !frame && raf && (frame = raf.requestAnimationFrame(tick)))), 800);
    }
    bar.hidden = box.hidden = true;
    if (t && ti !== -1 && L) {
      // A layout offset as the layer's block coordinate (a CSS scale on an ancestor counted, as `place`).
      const s = v.height / (el.viewport.offsetHeight || v.height) || 1;
      const y = (off: number) => el.header.getBoundingClientRect().bottom - R.top + (off - g.scroll.logicalTop + (g.pinTop ?? 0)) * s;
      const ix = ti as DisplayIndex;
      const e = extra(g);
      const w = Math.min(g.geometry.read().inline, g.columns.layout.totalWidth + e);
      const x0 = logicalSpan(v, R, dir).start + e;
      if (t.where === 'inside') {
        box.hidden = false;
        setPx(box, 'inset-block-start', y(L.offsetOf(ix)));
        setPx(box, 'block-size', L.heightOf(ix) * s);
        setPx(box, 'inset-inline-start', x0);
        setPx(box, 'inline-size', w - e);
      } else {
        // After a row: under its subtree and its detail panel.
        let j = ti;
        const S = new Set([t.key!]);
        while (t.where === 'after' && j + 1 < dd.count) {
          const n = dd.nodeAt((j + 1) as DisplayIndex);
          const a = n.kind === 'detail' ? n.master : n.kind === 'loading' ? n.parent : n.key;
          if (a === null || !(a === t.key ? n.kind !== 'data' : tr && within(dd, a, S))) break;
          j++;
        }
        const level = tr ? dd.levelAt?.(ix) ?? 0 : 0;
        const ind = level ? indent(t.key!, level) : 0;
        bar.hidden = false;
        setPx(bar, 'inset-block-start', y(t.where === 'before' ? L.offsetOf(ix) : L.offsetOf(j as DisplayIndex) + L.heightOf(j as DisplayIndex)) - 1);
        setPx(bar, 'inset-inline-start', x0 + ind);
        setPx(bar, 'inline-size', Math.max(0, w - e - ind));
      }
    }
    setPx(ghost, 'inset-inline-start', logicalX(p, R, dir) + 12);
    setPx(ghost, 'inset-block-start', p.clientY - R.top);
    return moved;
  };
  const tick = (): void => {
    frame = 0;
    if (d?.on && compute(true) && d) frame = raf!.requestAnimationFrame(tick);
  };
  /** Past 4 px: the rows taken (or the refusal said), the capture, the layer, no text selected, the sources marked at the paint. */
  const start = (x: Drag): boolean => {
    const mv = take(x.key, 1);
    if (typeof mv === 'string') return (d = null), false;
    x.keys = mv;
    x.on = true;
    try {
      el.root.setPointerCapture?.(x.pid);
    } catch {
      // Already released: the document's events still come.
    }
    setAttr(el.root, 'data-dzg-dragging', '');
    doc.getSelection?.()?.removeAllRanges();
    const c = col();
    ghost.textContent = mv.length > 1 ? T('ghost', { n: mv.length }) : (c && g.rowRenderer.cell(mv[0]!, c)?.textContent) || '';
    bar.hidden = box.hidden = true;
    el.root.append(layer);
    g.schedule();
    return true;
  };
  const gripOf = (e: Event): HTMLElement | null => {
    const t = (e.target as Element).closest?.<HTMLElement>('.dzg-grip');
    return t && t.closest('.dzg') === el.root ? t : null;
  };
  const mine = (e: Event): boolean => !!d && (e as PointerEvent).pointerId === d.pid;
  // Captured at the root: a press on a grip starts no block, takes no focus, selects no text; its click is no row click.
  scope.on(el.root, 'pointerdown', (e: PointerEvent) => {
    swallow = false;
    const gr = gripOf(e);
    if (!gr) return;
    e.preventDefault();
    e.stopPropagation();
    const r = gr.closest('.dzg-row');
    const key = r && g.rowRenderer.keyOf(r);
    if (d || e.button || !e.isPrimary || g.editor || key == null || rows().indexOf(key) < 0) return;
    const why = off();
    if (why) return void say(T(why));
    d = { key, p0: e, pid: e.pointerId, dir: g.dir };
  }, { capture: true });
  scope.on(el.root, 'mousedown', (e) => void (gripOf(e) && (e.preventDefault(), e.stopPropagation())), { capture: true });
  scope.on(el.root, 'click', (e) => void ((swallow || gripOf(e)) && ((swallow = false), e.stopPropagation(), e.preventDefault())), { capture: true });
  scope.on(doc, 'pointermove', (e) => {
    const x = d;
    if (!x || !mine(e)) return;
    x.at = e as PointerEvent;
    if (!x.on && (travel(x.at, x.p0) < 4 || !start(x))) return;
    if (!frame && raf) frame = raf.requestAnimationFrame(tick);
  });
  scope.on(doc, 'pointerup', (e) => {
    const x = d;
    if (!x || !mine(e)) return;
    if (!x.on) return void (d = null);
    x.at = e as PointerEvent;
    compute();
    const { over, to, keys } = x;
    cancel();
    if (over) {
      try {
        targets.get(over)?.drop(keys!);
      } catch (err) {
        g.report(err);
      }
    } else if (to) {
      const f = kernel.focus;
      const c = f?.kind === 'cell' && f.row === keys![0] ? f.column : col() ?? g.columns.visible()[0]?.id;
      commit(keys!, to, 'pointer', c ? { kind: 'cell', row: keys![0]!, column: c } : null, 1);
    }
  });
  scope.on(doc, 'pointercancel', (e) => void (mine(e) && cancel()));
  // The root's own capture only: a grip's implicit one (a finger) is lost when the root takes it.
  scope.on(el.root, 'lostpointercapture', (e) => void (mine(e) && e.target === el.root && cancel()));
  // Escape is the drag's only (the block's Escape never sees it).
  scope.on(doc, 'keydown', (e) => void (d?.on && (e as KeyboardEvent).key === 'Escape' && (e.preventDefault(), e.stopImmediatePropagation(), cancel(true))), { capture: true });
  if (win) scope.on(win, 'blur', () => cancel());
  // The rows a drag moves gone: given up; the application's rows arrived: the place said.
  const unsub = kernel.subscribe((e) => {
    if (e.type !== 'modelUpdated') return;
    if (d?.on && d.keys!.some((k) => rows().indexOf(k) < 0)) cancel();
    const w = waiting;
    waiting = null;
    w?.();
  });

  apis.set(g.kernel, {
    move(keys, t, x) {
      const speak = +!!x?.say;
      const dd = rows();
      const why = off();
      if (why) return no(why, speak);
      const mv = movingRows(dd, keys);
      if (!mv.length || (t.key !== null && !movingRows(dd, [t.key]).length)) return 'unknown';
      if (keys.length > (o.maxRows ?? 1000)) return no('tooMany', speak, { max: o.maxRows ?? 1000 });
      told = false;
      if (o.canDrag && dataOf(mv).some((r) => !ask(() => o.canDrag!(r)))) return no('locked', speak);
      const tr = tree();
      if ((t.key !== null && within(dd, t.key, new Set(mv))) || (t.where === 'inside' && (!tr || t.key === null))) return no('refused', speak);
      if (unchanged(dd, mv, t, tr)) return no('edge', speak);
      if (o.canDrop && !ask(() => o.canDrop!(info(mv, t)))) return no('refused', speak);
      commit(mv, t, 'api', null, speak);
      return 'moved';
    },
    step: (key, by, x) => step(key, by, 'api', +!!x?.say),
    dropTargets: { add: (t, v) => (targets.set(t, v), () => void (targets.delete(t) && d?.over === t && mark(null))) },
    items(key) {
      const tr = tree();
      const dd = rows();
      if (!movingRows(dd, [key]).length) return [];
      const mv = take(key, 0);
      const rtl = g.dir === 'rtl';
      const it = (by: MoveStep, id: string, k: string): MenuItem<never> => ({
        id: `rowMove.${id}`, label: T(id), keys: k, disabled: typeof mv === 'string' || !nextPlace(dd, mv, mv.includes(key) ? key : mv[0]!, by, tr), action: () => void step(key, by, 'menu', 1),
      });
      // → / ← as `aria-keyshortcuts` words: the arrow toward the logical end indents (← in right to left).
      return [it(-1, 'up', 'Alt+Shift+ArrowUp'), it(1, 'down', 'Alt+Shift+ArrowDown'), it('start', 'top', 'Alt+Shift+Home'), it('end', 'bottom', 'Alt+Shift+End'), ...(tr ? [it('in', 'in', rtl ? 'Alt+Shift+ArrowLeft' : 'Alt+Shift+ArrowRight'), it('out', 'out', rtl ? 'Alt+Shift+ArrowRight' : 'Alt+Shift+ArrowLeft')] : [])];
    },
  });

  let gripped = new Set<HTMLElement>();
  let keyed: HTMLElement | null = null;
  const unGrip = (c: HTMLElement): void => c.querySelector(':scope > .dzg-grip')?.remove();
  return {
    keys(e: KeyboardEvent, at: FocusPos | null, owner: KeyOwner): boolean {
      if (owner !== 'cell' || at?.kind !== 'cell' || !e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey || g.editor) return false;
      const k = e.key;
      // ↑ ↓ Home End; → / ← by their logical way (mirrored right to left): in and out, a tree's only.
      const i = intentFor({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }, { dir: g.dir, owner: 'cell', mac: false });
      const by: MoveStep | 0 = k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : k === 'Home' ? 'start' : k === 'End' ? 'end' : tree() && i?.kind === 'move' && i.axis === 'col' ? (i.delta > 0 ? 'in' : 'out') : 0;
      // A row that never moves (a detail panel, a group, a loading row): the key is not ours.
      return !!by && !!movingRows(rows(), [at.row]).length && (step(at.row, by, 'keys', 2, at.column), true);
    },
    afterRows() {
      if (d && d.dir !== g.dir) cancel();
      const c = o.drag === false ? null : col();
      const why = off();
      const dd = rows();
      const mv = d?.on ? new Set(d.keys) : null;
      const now = new Set<HTMLElement>();
      for (const [key, v] of g.rowRenderer.mounted) {
        setAttr(v.el, 'data-dzg-moving', mv?.has(key) ? '' : null);
        const cell = c && movingRows(dd, [key]).length ? v.cells.get(c)?.el : undefined;
        if (!cell) continue;
        let gr = cell.querySelector<HTMLElement>(':scope > .dzg-grip');
        if (!gr) {
          gr = doc.createElement('span');
          gr.className = 'dzg-grip';
          gr.setAttribute('aria-hidden', 'true');
          // After a tree's chevron (its indent), else first.
          const f0 = cell.firstElementChild;
          f0?.classList.contains('dzg-toggle') ? f0.after(gr) : cell.prepend(gr);
        }
        setAttr(gr, 'data-dzg-off', why ? '' : null);
        now.add(cell);
      }
      for (const x of gripped) if (!now.has(x)) unGrip(x);
      gripped = now;
      // The keys on the focused cell only (row-move.md 20).
      const f = kernel.focus;
      const fc = f?.kind === 'cell' && movingRows(dd, [f.row]).length ? g.rowRenderer.cell(f.row, f.column) : null;
      if (keyed && keyed !== fc) keyed.removeAttribute('aria-keyshortcuts');
      if (fc) setAttr(fc, 'aria-keyshortcuts', `Alt+Shift+ArrowUp Alt+Shift+ArrowDown Alt+Shift+Home Alt+Shift+End${tree() ? ' Alt+Shift+ArrowLeft Alt+Shift+ArrowRight' : ''}`);
      keyed = fc;
      // A moved row's focused cell may lose the DOM focus when its row is placed again (columns' R1): given back.
      if (refocus && fc && doc.activeElement !== fc) g.restoreFocus();
      refocus = false;
    },
    destroy() {
      unsub();
      cancel();
      hush();
      unspring();
      for (const x of gripped) unGrip(x);
      keyed?.removeAttribute('aria-keyshortcuts');
      apis.delete(kernel);
      targets.clear();
    },
  };
}
