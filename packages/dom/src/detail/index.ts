import { intentFor, uniformRowLayout, type DisplayIndex, type FocusPos, type KeyOwner, type RowKey } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import { detailConflicts, detailShape, sparseRowLayout, type DetailOptions, type DetailRows, type SparseLayout } from '@dzgrid/core/detail';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { PartHandle, SlotContext, SlotPart } from '../part.js';
import type { DetailMessageKey } from '../part-texts.js';
import type { Frame } from '../render/rows.js';
import { sideways } from '../dir.js';
import { injectDetailStyles } from './styles.js';

/** The texts `detail()` needs, from `@dzgrid/dom/locales/<lang>-detail`. */
export const DETAIL_KEYS = ['detail.label', 'detail.expanded', 'detail.collapsed'] as const satisfies readonly DetailMessageKey[];

export interface DetailFeatureOptions<T> extends Omit<DetailOptions<T>, 'sizes'> {
  /** What a panel shows: a `'detail'` part (`nestedGrid(…)`, `definePart('detail', …)`), or its name in `settings.parts`. */
  readonly part: SlotPart<'detail'> | string;
  /** The column whose cells carry the chevron: the first visible one by default. */
  readonly column?: string;
  /** This grid's depth, 1 on the page; by default one more than the grids around it in the page. */
  readonly nested?: number;
}

/**
 * `detail(options)`: a panel under each open master (docs/behaviors/master-detail.md, D8, owner Q4–Q5).
 * Hands `detailShape` from `@dzgrid/core/detail` to the grid's rows at creation and places them with its
 * sparse layout; draws a chevron in the masters' first column (forward opens, back closes); mounts the
 * `part` in a panel at the first paint showing it (the base destroys it when its row goes); measures
 * `'auto'` heights; names each panel « Details of » its master; says each opening by the user.
 *
 * ```ts
 * import { detail, nestedGrid } from '@dzgrid/dom/detail';
 * import { FR_DETAIL } from '@dzgrid/dom/locales/fr-detail';
 * createGrid(host, { rows, getRowId, columns, messages: { ...FR, text: { ...FR.text, ...FR_DETAIL.text } },
 *   features: [detail({ part: nestedGrid({ settings: (c) => ({ rows: visitsOf(c.row), getRowId, columns: visitColumns, messages }) }) })] });
 * ```
 */
export function detail<T>(o: DetailFeatureOptions<T>): GridFeature {
  // Made by `shape()` for the grid being created: a shape the grid did not take (a tree's came first) leaves none.
  let sizes: Map<RowKey, number> | null = null;
  return {
    id: 'detail',
    shape: () => detailShape<T>({ ...o, sizes: (sizes = new Map()) }) as never,
    setup(g) {
      const s = sizes;
      sizes = null;
      return setup(g, o, s);
    },
  };
}

/** A `nestedGrid` part's own: its kept grids let go (all, or those whose master `keep` no longer finds). */
type Drops = { drop?(keep?: (master: RowKey) => boolean): void };

/** A panel: its content box, the master it shows, its part's handle and last context. */
interface Panel {
  readonly key: RowKey;
  readonly box: HTMLElement;
  handle: PartHandle<SlotContext['detail']> | null;
  last: SlotContext['detail'] | null;
  rev: number;
  /** The master's data its part threw on: not tried again until it changes. */
  failed?: unknown;
}

function setup<T>(g: GridContext<unknown>, o: DetailFeatureOptions<T>, sizes: Map<RowKey, number> | null): FeatureHandle {
  const missing = DETAIL_KEYS.filter((key) => g.settings.messages.text[key] === undefined);
  if (missing.length) throw new TypeError(`detail: missing ${missing.join(', ')}`);
  const { kernel, el, rowRenderer, doc, columns } = g;
  // What details refuse beside them (D9, Q5): told once; the grid shows the details without it.
  const has = (id: string): boolean => !!g.settings.features?.some((f) => f.id === id);
  const spans = has('spans');
  const told = detailConflicts({ spans, tree: has('tree') });
  if (told.length) emit(kernel, { type: 'problems', source: 'host', problems: told });
  // Another feature's shape is the grid's (a tree listed first): nothing to draw.
  if (!sizes) return { destroy() {} };
  injectDetailStyles(el.root.getRootNode() as Document | ShadowRoot, g.settings.nonce);

  const auto = o.height === 'auto';
  let depth = o.nested ?? 1;
  if (o.nested === undefined) for (let p = el.root.parentElement?.closest('.dzg'); p; p = p.parentElement?.closest('.dzg')) depth++;
  const mx = (key: RowKey): RowKey => key.slice(2) as RowKey;

  // The rows' places (D7): a measure wins over the shape's height; a new row height carries the old layout's (step 9 review).
  // Masters no longer in the rows (a transaction, new rows) forget their measure: a row added again is measured anew.
  g.layoutFor = (d, h, was) => {
    const r = d as DetailRows<unknown>;
    for (const k of sizes.keys()) if (!g.rows.row(k)) sizes.delete(k);
    return r.details ? sparseRowLayout(d, h, { at: r.details, heights: Array.from(r.details, (i, j) => (was ? was.heightOf(i as DisplayIndex) : sizes.get(mx(d.keyAt(i as DisplayIndex))) ?? r.heights[j]!)) }) : uniformRowLayout(d, h);
  };

  const col = (): string | undefined => o.column ?? columns.visible()[0]?.id;
  /** A master's text in the first column, as its cell shows it. */
  const nameOf = (key: RowKey): string => {
    const c = columns.visible()[0];
    const data = g.rows.row(key)?.data;
    if (!c || data === undefined) return '';
    try {
      const v = c.codec.coerce(c.read(data), g.ctx);
      return v === null ? '' : c.codec.format(v, g.ctx);
    } catch {
      return '';
    }
  };
  const expand = (key: RowKey, open: boolean): void => void kernel.dispatch({ type: 'rows.expand', rows: [key], expanded: open }, 'user');
  // A user's opening or closing of one master, said once (screen readers do not all say aria-expanded).
  const off = kernel.subscribe((e) => {
    if (e.type === 'rowExpanded' && e.source === 'user' && e.rows.length === 1) g.live.announce(g.msg(e.expanded ? 'detail.expanded' : 'detail.collapsed', { name: nameOf(e.rows[0]!) }));
  });
  /** The focus back on a panel's cell (Escape from a grid in it). */
  const leave = (key: RowKey): void => {
    const f = kernel.focus;
    const c = f?.kind === 'cell' && f.row === key ? f.column : columns.visible()[0]?.id;
    if (c) kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: key, column: c } }, 'user');
    if (kernel.focus?.kind === 'cell' && kernel.focus.row === key) g.restoreFocus();
  };

  // The chevron opens or closes its master and nothing else (no selection, no row click); a grid's in a panel
  // is not ours (`keyOf` knows only this grid's rows).
  g.scope.on(el.viewport, 'click', (e) => {
    const t = (e.target as Element).closest?.('.dzg-toggle');
    const row = t?.closest('.dzg-row');
    const key = row ? rowRenderer.keyOf(row) : undefined;
    if (!key || key[0] !== 'd') return;
    e.stopPropagation();
    expand(key, !kernel.expansion.has(key));
  }, { capture: true });

  /**
   * The wheel in a panel (step10-plan point 11): what can still scroll that way inside it takes it (the
   * browser's, or a grid's that already did), so the grid around never does; at its edge, it goes on.
   * `sideways` from `dir.ts`, the one file of physical sides: a pure function, its copy in this entry costs
   * nothing in behaviour.
   */
  const wheel = (e: WheelEvent): void => {
    const dy = e.deltaY;
    if (e.ctrlKey || e.metaKey) return;
    // Sideways: the panel's (its cell is as wide as the view, the grid around has nothing to show that way).
    if (e.defaultPrevented || sideways(e)) return e.stopPropagation();
    const end = (e.currentTarget as Element).parentElement;
    for (let n = e.target as Element | null; n && n !== end; n = n.parentElement) {
      if (dy && n.scrollHeight > n.clientHeight + 1 && (dy > 0 ? n.scrollTop + n.clientHeight < n.scrollHeight - 1 : n.scrollTop > 0) && /auto|scroll/.test(g.win!.getComputedStyle(n).overflowY)) return e.stopPropagation();
    }
  };

  // 'auto': one observer; its callback (one per frame, every box in it) sends the frame's changes to the layout at once.
  const RO = (g.win as (Window & { ResizeObserver?: typeof ResizeObserver }) | null)?.ResizeObserver;
  const boxes = new Map<Element, Panel>();
  const ro = auto && RO ? new RO((entries) => {
    const d = g.rows.displayed;
    const L = g.layout as SparseLayout | undefined;
    const now = g.laid?.[0] === d && L?.setHeights;
    const changes: [DisplayIndex, number][] = [];
    let moved = false;
    for (const e of entries) {
      const p = boxes.get(e.target);
      const h = e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height;
      if (!p || Math.abs((sizes.get(mx(p.key)) ?? -1) - h) <= 0.5) continue;
      sizes.set(mx(p.key), h);
      moved = true;
      const i = d.indexOf(p.key);
      if (now && i >= 0) changes.push([i as DisplayIndex, h]);
    }
    // Rows rebuilt since the paint: the next layout reads the map.
    if (changes.length ? L!.setHeights(changes) : moved) g.schedule();
  }) : null;

  /** The panels shown, by their detail cell (a new cell for a row shown again or another master). */
  const panels = new Map<HTMLElement, Panel>();
  /** The part last used (its kept grids let go with this grid). */
  let pt: SlotPart | undefined;
  let decorated = new Set<HTMLElement>();
  const set = (x: Element, name: string, v: string | null): void => {
    if (v === null) x.removeAttribute(name);
    else if (x.getAttribute(name) !== v) x.setAttribute(name, v);
  };
  const undecorate = (cell: HTMLElement): void => {
    const t = cell.firstElementChild;
    if (t?.classList.contains('dzg-toggle')) t.remove();
    cell.removeAttribute('aria-expanded');
  };

  return {
    // Spans are off beside details (D9): the grid paints without them.
    beforeRows() {
      if (spans) (g.spans = null), (g.bands = []);
    },
    afterRows(f: Frame<unknown>) {
      const d = f.displayed;
      const L = g.layout!;
      const c0 = col();
      const part = (pt = typeof o.part === 'string' ? g.parts()[o.part] : o.part);
      // A nested grid kept alive for a master no longer in the rows: let go (review 2).
      (part?.part as Drops | undefined)?.drop?.((m) => !!g.rows.row(m));
      const now = new Set<HTMLElement>();
      const shown = new Set<HTMLElement>();
      for (const [key, v] of rowRenderer.mounted) {
        const s = v.slot;
        if (!s) {
          // A master: the chevron in its column, its state on that cell (a gridcell may carry it; a grid's row may not).
          const cell = c0 === undefined || key[0] !== 'd' ? undefined : v.cells.get(c0)?.el;
          if (!cell) continue;
          now.add(cell);
          let t = cell.firstElementChild;
          if (!t?.classList.contains('dzg-toggle')) {
            t = doc.createElement('span');
            t.className = 'dzg-toggle';
            t.setAttribute('aria-hidden', 'true');
            cell.prepend(t);
          }
          const open = kernel.expansion.has(key);
          set(t, 'data-open', open ? '' : null);
          set(cell, 'aria-expanded', String(open));
          continue;
        }
        const i = d.indexOf(key);
        const node = d.nodeAt(i as DisplayIndex);
        if (node.kind !== 'detail') continue;
        shown.add(s);
        // The cell's name comes from its content: a group named « Details of » the master (an aria-label on
        // the cell itself would not hold the content's text: axe, label-content-name-mismatch, WCAG 2.5.3).
        set(s, 'aria-label', null);
        let p = panels.get(s);
        if (!p) {
          const box = doc.createElement('div');
          box.className = 'dzg-dbody';
          box.setAttribute('role', 'group');
          box.dataset['dzgOwner'] = 'cell-widget';
          if (auto) box.setAttribute('data-auto', '');
          box.addEventListener('wheel', wheel, { passive: true });
          s.append(box);
          panels.set(s, (p = { key, box, handle: null, last: null, rev: -1 }));
          if (ro) boxes.set(box, p), ro.observe(box);
        }
        set(p.box, 'aria-label', g.msg('detail.label', { name: nameOf(node.master) }));
        if (part?.slot !== 'detail') continue;
        const c: SlotContext['detail'] = { ...g.partBase!, row: node.data, key, master: node.master, height: L.heightOf(i as DisplayIndex), depth: depth + 1, leave: () => leave(key) };
        const l = p.last;
        try {
          if (!p.handle) {
            if (p.failed === node.data) continue;
            p.last = c;
            p.rev = f.partRev;
            v.part = p.handle = (part as SlotPart<'detail'>).part.mount(p.box, c);
          } else if (l && (l.row !== c.row || l.height !== c.height || l.ctx !== c.ctx || l.dir !== c.dir || p.rev !== f.partRev)) {
            p.last = c;
            p.rev = f.partRev;
            p.handle.update?.(c);
          }
        } catch (err) {
          // A part that throws costs its panel, for this master's data: reported, the box left empty.
          if (!p.handle) (p.failed = node.data), p.box.replaceChildren();
          g.report(err);
        }
      }
      // Panels gone with their rows (the base destroyed their parts): no longer observed.
      for (const [s, p] of panels) if (!shown.has(s)) panels.delete(s), boxes.delete(p.box), ro?.unobserve(p.box);
      for (const c of decorated) if (!now.has(c)) undecorate(c);
      decorated = now;
    },
    keys(e: KeyboardEvent, at: FocusPos | null, owner: KeyOwner): boolean {
      if (owner !== 'cell' || at?.kind !== 'cell' || at.column !== col() || at.row[0] !== 'd' || e.ctrlKey || e.altKey || e.metaKey) return false;
      // The grid's own reading of the key: forward and back are mirrored right to left there.
      const step = intentFor(e, { dir: g.dir, owner, mac: g.mac });
      const open = kernel.expansion.has(at.row);
      // Forward on a closed master opens it, back on an open one closes it; otherwise the column move.
      return step?.kind === 'move' && step.axis === 'col' && step.delta > 0 !== open && (expand(at.row, !open), true);
    },
    destroy() {
      off();
      // The kept nested grids go with this one (review 2).
      (pt?.part as Drops | undefined)?.drop?.();
      ro?.disconnect();
      boxes.clear();
      for (const c of decorated) undecorate(c);
      g.layoutFor = undefined;
    },
  };
}
