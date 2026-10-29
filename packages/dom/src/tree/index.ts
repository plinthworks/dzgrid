import { intentFor, type DisplayIndex, type FocusPos, type KeyOwner, type RowKey } from '@dzgrid/core';
import { emit, lockColumns } from '@dzgrid/core/internal';
import { treeColumnProblems, treeShape, type TreeOptions, type TreeRows, type TreeShape } from '@dzgrid/core/tree';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { Frame, RowView } from '../render/rows.js';
import type { TreeMessageKey } from '../part-texts.js';
import { injectTreeStyles } from './styles.js';
import type { LazyChildren } from './lazy.js';
import { stickyStack } from './sticky.js';

/** The texts `tree()` needs, from `@dzgrid/dom/locales/<lang>-tree`. */
export const TREE_KEYS = ['tree.expanded', 'tree.collapsed', 'tree.expandedSome', 'tree.empty'] as const satisfies readonly TreeMessageKey[];

export interface TreeFeatureOptions<T> extends TreeOptions<T> {
  /** The column that shows the hierarchy: the first visible one by default (screen readers expect it first). */
  readonly column?: string;
  /** Pixels per level of indent (16 by default). */
  readonly indent?: number;
  /** Children loaded when their parent opens: `lazyChildren({ has, load })` from `@dzgrid/dom/tree-lazy` (tree-lazy.md). */
  readonly lazy?: LazyChildren<T>;
  /** Parents kept pinned under the header while their children scroll, the nearest first (tree-sticky.md): 0 none, 3 by default. */
  readonly sticky?: number;
  /**
   * The columns that feed the tree, read-only this phase (owner Q13, O7; the core's `edit-structure` told once
   * for one marked editable). Default: a path tree's own column (its labels are the path), none for `parentId`
   * or `children`; given, it replaces the default (`[]` frees a path tree's column).
   */
  readonly structure?: readonly string[];
}

/**
 * `tree(options)`: the rows as a tree (docs/behaviors/tree-view.md, tree-keys.md, tree-filter.md;
 * WAI-ARIA 1.2 treegrid). Hands `treeShape` from `@dzgrid/core/tree` to the grid's rows at creation;
 * draws the tree column (indent, a decorative toggle), the rows' level, place and open state; opens
 * and closes by the pointer on the toggle and by the keys of the tree column; says each opening.
 *
 * ```ts
 * import { tree } from '@dzgrid/dom/tree';
 * import { FR_TREE } from '@dzgrid/dom/locales/fr-tree';
 * createGrid(host, { rows, getRowId, columns, messages: { ...FR, text: { ...FR.text, ...FR_TREE.text } }, features: [tree({ parentId: (r) => r.parent })] });
 * ```
 */
export function tree<T>(o: TreeFeatureOptions<T>): GridFeature {
  let s: TreeShape<T> | undefined;
  return { id: 'tree', shape: () => (s = o.lazy ? o.lazy.wrap(treeShape(o), !!o.children) : treeShape(o)) as never, setup: (g) => setup(g, o.column, o.indent ?? 16, o.lazy, s, o.sticky, o.structure ?? (o.path && !o.parentId && !o.children ? null : [])) };
}

type Rows = TreeRows<unknown>;
const PAD = 'padding-inline-start';
/** The cell's indent, read by the field's place (after the chevron, TREE_CSS). */
const VAR = '--dzg-tree-pad';

/** `lock`: the structure columns; null: the tree column's, followed (a path tree). */
function setup<T>(g: GridContext<unknown>, column: string | undefined, indent: number, lazy: LazyChildren<T> | undefined, s: TreeShape<T> | undefined, sticky = 3, lock: readonly string[] | null = []): FeatureHandle {
  const missing = TREE_KEYS.filter((key) => g.settings.messages.text[key] === undefined);
  if (missing.length) throw new TypeError(`tree: missing ${missing.join(', ')}`);
  const { kernel, el, rowRenderer, doc } = g;
  injectTreeStyles(el.root.getRootNode() as Document | ShadowRoot, g.settings.nonce);
  el.viewport.setAttribute('role', 'treegrid');
  // Cell spans beside a tree (1.1.0, spans.md « In a tree »): siblings only; the spans feature merges leaves only here.

  /** The rows shown, when they are a tree's. */
  const tree = (): Rows | null => {
    const d = g.rows.displayed as Partial<Rows>;
    return d.posAt ? (d as Rows) : null;
  };
  const treeColumn = (g.treeColumn = (): string | undefined => column ?? g.columns.visible()[0]?.id);
  // The structure read-only (Q13): given, once; a path tree's own column, again when it changes (at a paint).
  let locked = '';
  const relock = (): void => {
    const ids = lock ?? [treeColumn()!];
    if (locked !== (locked = `${ids}`)) lockColumns(kernel, ids);
  };
  relock();
  const expand = (rows: readonly RowKey[], expanded: boolean): void => void kernel.dispatch({ type: 'rows.expand', rows, expanded }, 'user');
  /** A row always open (`fixedOpen`, tree-view.md): it shows children and the core will not toggle it. */
  const fixed = (key: RowKey): boolean => s?.opens?.(key) === false;
  /** The row's label in the tree column, as its cell shows it (that column hidden: the first one shown); a filler's own. */
  const nameOf = (key: RowKey, d: Rows): string => {
    const i = d.indexOf(key);
    const node = i === -1 ? null : d.nodeAt(i);
    if (node?.kind === 'group') return node.label;
    const shown = g.columns.visible();
    const col = shown.find((c) => c.id === treeColumn()) ?? shown[0];
    const data = g.rows.row(key)?.data;
    if (!col || data === undefined) return '';
    try {
      // As the cell shows it: through the edits (the edited name is the one said).
      const v = col.codec.coerce(g.edit ? g.edit.read(col, data, key) : col.read(data), g.ctx);
      return v === null ? '' : col.codec.format(v, g.ctx);
    } catch {
      return '';
    }
  };

  /** A row opened or closed, said: its name and the rows it shows; « loading » while a lazy parent loads (tree-lazy.md). */
  const say = (one: RowKey, expanded = true): void => {
    const d = tree();
    const i = d ? d.indexOf(one) : -1;
    if (i === -1) return;
    const n = d!.childrenAt(i);
    const name = nameOf(one, d!);
    // A lazy parent answered empty is a leaf: its name and « no rows », the tree bundle's own `tree.empty` (tree-lazy.md).
    g.live.announce(!expanded ? g.msg('tree.collapsed', { name }) : n < 0 ? (lz?.said(one), g.msg('announce.loading')) : n ? g.msg('tree.expanded', { name, n }) : g.msg('tree.empty', { name }));
  };
  // Each opening or closing by the user, said once (screen readers do not all say aria-expanded).
  const off = kernel.subscribe((e) => {
    if (e.type !== 'rowExpanded' || e.source !== 'user' || !tree()) return;
    if (e.rows.length === 1) say(e.rows[0]!, e.expanded);
    else if (e.expanded) g.live.announce(g.msg('tree.expandedSome', { n: e.rows.length }));
  });
  const lz = lazy?.setup(g, s, say);

  // The pointer on a parent's toggle opens or closes it, and nothing else (no selection, no row click).
  g.scope.on(el.viewport, 'click', (e) => {
    const t = (e.target as Element).closest?.('.dzg-toggle');
    const row = t && !t.hasAttribute('data-leaf') ? t.closest('.dzg-row') : null;
    const key = row ? rowRenderer.keyOf(row) : undefined;
    const d = tree();
    const i = key && d ? d.indexOf(key) : -1;
    if (i === -1) return;
    e.stopPropagation();
    expand([key!], !d!.expandedAt(i));
  }, { capture: true });

  // Pinned parents (tree-sticky.md): a layer under the header rows, drawn by a second renderer; 0 makes none.
  /** A shown row's parent (display index), -1 for a root. */
  const up = (d: Rows, i: number): number => {
    const p = d.parentOf(d.keyAt(i as DisplayIndex));
    return p === null ? -1 : d.indexOf(p);
  };
  // A number (not NaN: not equal to itself; not null or a string: not equal to their number), else the default.
  sticky = sticky === +sticky ? Math.max(0, Math.floor(sticky)) : 3;
  let last: unknown[] = [];
  let layer: HTMLElement | null = null;
  const stack = sticky ? rowRenderer.spawn((layer = doc.createElement('div'))) : null;
  if (layer) {
    layer.className = 'dzg-sticky';
    layer.setAttribute('aria-hidden', 'true');
    el.header.append(layer);
    // The room a row needs above it: its own copies (WCAG 2.4.11), as many as fit, each its row's height.
    g.insetFor = (i) => {
      const d = tree();
      let y = 0;
      // Called after a paint (a row above the view's top, or the paint's anchoring): the layout is there.
      for (let c = d ? Math.min(sticky, Math.floor(g.viewBlock / 2 / g.rowHeight()), d.levelAt(i as DisplayIndex)) : 0; c-- > 0 && y + g.layout!.heightOf(up(d!, i) as DisplayIndex) <= g.viewBlock / 2; ) y += g.layout!.heightOf((i = up(d!, i)) as DisplayIndex);
      return y;
    };
    // Never the DOM focus inside (no default on the pointer going down).
    const no = (e: Event): void => e.preventDefault();
    g.scope.on(layer, 'pointerdown', no);
    g.scope.on(layer, 'mousedown', no);
    // A copy goes to its real row (owner Q11c): its toggle opens or closes it; its box is inert; elsewhere the
    // real row is focused (the cell clicked, the tree column otherwise) and brought into view, never selected.
    g.scope.on(layer, 'click', (e) => {
      e.stopPropagation();
      const t = e.target as Element;
      const row = t.closest('.dzg-row');
      const key = row ? stack!.keyOf(row) : undefined;
      const d = tree();
      const i = key && d ? d.indexOf(key) : -1;
      if (i === -1 || t.closest('.dzg-check')) return;
      if (t.closest('.dzg-toggle')) return expand([key!], !d!.expandedAt(i));
      const c = t.closest<HTMLElement>('.dzg-cell')?.dataset['col'] ?? treeColumn();
      if (c && kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: key!, column: c } }, 'user').ok) g.restoreFocus();
    }, { capture: true });
  }

  /** `*`: every closed sibling with children opens (tree-keys.md). */
  function siblings(d: Rows, i: DisplayIndex): void {
    const level = d.levelAt(i);
    let a: number = i;
    while (a > 0 && d.levelAt((a - 1) as DisplayIndex) >= level) a--;
    const out: RowKey[] = [];
    for (let j = a; j < d.count && d.levelAt(j as DisplayIndex) >= level; j++) {
      const x = j as DisplayIndex;
      if (d.levelAt(x) === level && d.childrenAt(x) > 0 && !d.expandedAt(x)) out.push(d.keyAt(x));
    }
    if (out.length) expand(out, true);
  }

  let decorated = new Set<HTMLElement>();
  const warned = new Set<string>();
  const set = (x: Element, name: string, v: string | null): void => {
    if (v === null) x.removeAttribute(name);
    else if (x.getAttribute(name) !== v) x.setAttribute(name, v);
  };
  const undecorate = (cell: HTMLElement): void => {
    // The label first: found by its class, not by its place after the toggle.
    labelOf(cell)?.remove();
    const t = cell.firstElementChild;
    if (t?.classList.contains('dzg-toggle')) t.remove();
    cell.style.removeProperty(PAD);
    cell.style.removeProperty(VAR);
  };
  /** A filler's label, after the toggle: isolated in its own direction, like free text. */
  const labelOf = (cell: HTMLElement): Element | null => cell.querySelector(':scope > .dzg-label');

  return {
    // Before the cells are written: a path tree's new tree column read-only in this paint.
    beforeRows: relock,
    afterRows(f: Frame<unknown>) {
      const d = tree();
      const col = treeColumn();
      // A tree column that is not first: allowed, told once per order of the visible columns (never again for a
      // paint, a row update or a column hidden and shown back in the same order: owner demo, step 16).
      const ids = g.columns.visible().map((c) => c.id);
      const notFirst = treeColumnProblems(ids, column);
      if (notFirst.length && !warned.has(`${ids}`)) warned.add(`${ids}`), emit(kernel, { type: 'problems', source: 'host', problems: notFirst });
      const now = new Set<HTMLElement>();
      if (stack) {
        // The pinned parents (tree-sticky.md): worked out at each paint, redrawn only when they change.
        const r = d ? stickyStack({ top: g.scroll.logicalTop, n: sticky, viewBlock: g.viewBlock, h: g.rowHeight(), count: d.count, layout: g.layout!, levelAt: (i) => d.levelAt(i as DisplayIndex), ancestorOf: (i) => up(d, i) }) : { at: [] as number[], y: [] as number[], height: 0 };
        // Also for a merged cell's travelling label, which sticks under the copies (spans.md « In a tree »).
        const inset = `${(g.inset = r.height)}px`;
        if (el.root.style.getPropertyValue('--dzg-inset') !== inset) el.root.style.setProperty('--dzg-inset', inset);
        const sig = [d, f.epoch, f.cols?.first, f.cols?.last, kernel.selection, stack.rev, ...r.at, ...r.y];
        if (sig.length !== last.length || sig.some((x, j) => x !== last[j])) {
          last = sig;
          // Text only (owner Q11b), no focus, no spans; no row semantics but the selected look.
          stack.render({ ...f, rowTop: (i) => r.y[r.at.indexOf(i)]!, partFor: () => null, spans: null, focusRow: null, focusCenter: -1, focusColumn: null, rowAttrs: (key, row) => (f.rowAttrs(key, row), row.removeAttribute('aria-rowindex')) }, r.at, []);
          r.at.forEach((i, j) => (stack.mounted.get(d!.keyAt(i as DisplayIndex))!.el.style.zIndex = String(r.at.length - j)));
        }
        if (el.header.lastChild !== layer) el.header.append(layer!);
      }
      const decorate = (key: RowKey, v: RowView, copy?: boolean): void => {
        const i = d ? d.indexOf(key) : -1;
        if (i === -1) return;
        // A lazy parent not loaded has children too (-1: not known yet).
        const kids = d!.childrenAt(i) !== 0;
        const open = kids && d!.expandedAt(i);
        const level = d!.levelAt(i);
        const node = d!.nodeAt(i);
        if (!copy) {
          set(v.el, 'aria-busy', node.kind === 'loading' && !node.failed ? 'true' : null);
          set(v.el, 'aria-level', String(level + 1));
          set(v.el, 'aria-posinset', String(d!.posAt(i)));
          set(v.el, 'aria-setsize', String(d!.sizeAt(i)));
          set(v.el, 'aria-expanded', kids ? String(open) : null);
        }
        set(v.el, 'data-context-row', d!.matchedAt(i) ? null : '');
        const cell = col === undefined ? undefined : v.cells.get(col)?.el;
        if (!cell) return;
        now.add(cell);
        let t = cell.firstElementChild;
        const had = t?.classList.contains('dzg-toggle');
        // Always open: no toggle at all, no slot (a pooled cell's taken off).
        if (open && fixed(key)) had && t!.remove();
        else {
          if (!had) {
            t = doc.createElement('span');
            t.className = 'dzg-toggle';
            t.setAttribute('aria-hidden', 'true');
            cell.prepend(t);
          }
          set(t!, 'data-open', open ? '' : null);
          set(t!, 'data-leaf', kids ? null : '');
        }
        // A filler (path trees) or a loading row has no cells: its label goes in the tree column (tree-view.md).
        let l = labelOf(cell);
        if (node.kind === 'group' || node.kind === 'loading') {
          if (!l) (l = doc.createElement('span')), (l.className = 'dzg-free dzg-label'), t!.after(l);
          if (node.kind === 'loading') lz?.fill(l as HTMLElement, node);
          else if (l.textContent !== node.label) l.textContent = node.label;
        } else l?.remove();
        const pad = `calc(var(--dzg-cell-padding-inline, 0.5rem) + ${level * indent}px)`;
        if (cell.style.getPropertyValue(PAD) !== pad) cell.style.setProperty(PAD, pad), cell.style.setProperty(VAR, pad);
      };
      for (const [key, v] of rowRenderer.mounted) decorate(key, v);
      if (stack) for (const [key, v] of stack.mounted) decorate(key, v, true);
      // Cells no longer the tree's (another column, a recycled cell): given back plain.
      for (const c of decorated) if (!now.has(c)) undecorate(c);
      decorated = now;
    },
    keys(e: KeyboardEvent, at: FocusPos | null, owner: KeyOwner): boolean {
      const d = tree();
      if (!d || owner !== 'cell' || at?.kind !== 'cell' || at.column !== treeColumn() || e.ctrlKey || e.altKey || e.metaKey) return false;
      const i = d.indexOf(at.row);
      if (i === -1) return false;
      if (e.key === '*') return siblings(d, i), true;
      // The grid's own reading of the key: forward and back are mirrored right to left there (Shift: no move).
      const step = intentFor(e, { dir: g.dir, owner, mac: g.mac });
      if (step?.kind !== 'move' || step.axis !== 'col') return false;
      const kids = d.childrenAt(i) !== 0;
      const open = kids && d.expandedAt(i);
      // Forward: a closed parent opens; otherwise the column move.
      if (step.delta > 0) return kids && !open && (expand([at.row], true), true);
      if (open && !fixed(at.row)) return expand([at.row], false), true;
      // Back on a closed parent or a leaf: its parent row, same column (a root: nothing).
      const parent = d.parentOf(at.row);
      if (parent !== null && kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: parent, column: at.column } }, 'user').ok) g.restoreFocus();
      return true;
    },
    destroy() {
      off();
      lz?.destroy();
      stack?.clear();
      layer?.remove();
      g.inset = 0;
      el.root.style.removeProperty('--dzg-inset');
      delete g.insetFor;
      delete g.treeColumn;
      for (const c of decorated) undecorate(c);
      el.viewport.setAttribute('role', 'grid');
    },
  };
}
