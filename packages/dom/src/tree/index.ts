import { intentFor, problem, type DisplayIndex, type FocusPos, type KeyOwner, type Problem, type RowKey } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import { treeColumnProblems, treeConflicts, treeShape, type TreeOptions, type TreeRows } from '@dzgrid/core/tree';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { TreeMessageKey } from '../part-texts.js';
import { injectTreeStyles } from './styles.js';

/** The texts `tree()` needs, from `@dzgrid/dom/locales/<lang>-tree`. */
export const TREE_KEYS = ['tree.expanded', 'tree.collapsed', 'tree.expandedSome'] as const satisfies readonly TreeMessageKey[];

export interface TreeFeatureOptions<T> extends TreeOptions<T> {
  /** The column that shows the hierarchy: the first visible one by default (screen readers expect it first). */
  readonly column?: string;
  /** Pixels per level of indent (16 by default). */
  readonly indent?: number;
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
  return { id: 'tree', shape: () => treeShape(o) as never, setup: (g) => setup(g, o.column, o.indent ?? 16) };
}

type Rows = TreeRows<unknown>;
const PAD = 'padding-inline-start';

function setup(g: GridContext<unknown>, column: string | undefined, indent: number): FeatureHandle {
  const missing = TREE_KEYS.filter((key) => g.settings.messages.text[key] === undefined);
  if (missing.length) throw new TypeError(`tree: missing ${missing.join(', ')}`);
  const { kernel, el, rowRenderer, doc } = g;
  injectTreeStyles(el.root.getRootNode() as Document | ShadowRoot, g.settings.nonce);
  el.viewport.setAttribute('role', 'treegrid');
  // What a tree refuses beside it (D2, D9): told once; the grid shows the tree without it.
  const spans = !!g.settings.features?.some((f) => f.id === 'spans');
  const told: Problem[] = [...treeConflicts({ spans }), ...(g.rows.kind === 'source' ? [problem('unsupported-combination', 'warning', 'source', 'tree')] : [])];
  if (told.length) emit(kernel, { type: 'problems', source: 'host', problems: told });

  /** The rows shown, when they are a tree's (a server's rows are not, yet). */
  const tree = (): Rows | null => {
    const d = g.rows.displayed as Partial<Rows>;
    return d.posAt ? (d as Rows) : null;
  };
  const treeColumn = (): string | undefined => column ?? g.columns.visible()[0]?.id;
  const expand = (rows: readonly RowKey[], expanded: boolean): void => void kernel.dispatch({ type: 'rows.expand', rows, expanded }, 'user');
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
      const v = col.codec.coerce(col.read(data), g.ctx);
      return v === null ? '' : col.codec.format(v, g.ctx);
    } catch {
      return '';
    }
  };

  // Each opening or closing by the user, said once (screen readers do not all say aria-expanded).
  const off = kernel.subscribe((e) => {
    const d = tree();
    if (e.type !== 'rowExpanded' || e.source !== 'user' || !d) return;
    const one = e.rows.length === 1 ? e.rows[0]! : null;
    if (one === null) {
      if (e.expanded) g.live.announce(g.msg('tree.expandedSome', { n: e.rows.length }));
      return;
    }
    const i = d.indexOf(one);
    g.live.announce(e.expanded ? g.msg('tree.expanded', { name: nameOf(one, d), n: i === -1 ? 0 : d.childrenAt(i) }) : g.msg('tree.collapsed', { name: nameOf(one, d) }));
  });

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
  let warned = false;
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
  };
  /** A filler's label, after the toggle: isolated in its own direction, like free text. */
  const labelOf = (cell: HTMLElement): Element | null => cell.querySelector(':scope > .dzg-label');

  return {
    // Spans are off beside a tree (D9): the grid paints without them.
    beforeRows() {
      if (spans) (g.spans = null), (g.bands = []);
    },
    afterRows() {
      const d = tree();
      const col = treeColumn();
      // A tree column that is not first: allowed, told once each time it becomes so.
      const notFirst = treeColumnProblems(g.columns.visible().map((c) => c.id), column);
      if (notFirst.length && !warned) emit(kernel, { type: 'problems', source: 'host', problems: notFirst });
      warned = notFirst.length > 0;
      const now = new Set<HTMLElement>();
      for (const [key, v] of rowRenderer.mounted) {
        const i = d ? d.indexOf(key) : -1;
        if (i === -1) continue;
        const kids = d!.childrenAt(i) > 0;
        const open = kids && d!.expandedAt(i);
        const level = d!.levelAt(i);
        set(v.el, 'aria-level', String(level + 1));
        set(v.el, 'aria-posinset', String(d!.posAt(i)));
        set(v.el, 'aria-setsize', String(d!.sizeAt(i)));
        set(v.el, 'aria-expanded', kids ? String(open) : null);
        set(v.el, 'data-context-row', d!.matchedAt(i) ? null : '');
        const cell = col === undefined ? undefined : v.cells.get(col)?.el;
        if (!cell) continue;
        now.add(cell);
        let t = cell.firstElementChild;
        if (!t?.classList.contains('dzg-toggle')) {
          t = doc.createElement('span');
          t.className = 'dzg-toggle';
          t.setAttribute('aria-hidden', 'true');
          cell.prepend(t);
        }
        set(t, 'data-open', open ? '' : null);
        set(t, 'data-leaf', kids ? null : '');
        // A filler (path trees) has no cells: its label goes in the tree column (tree-view.md).
        const node = d!.nodeAt(i);
        let l = labelOf(cell);
        if (node.kind === 'group') {
          if (!l) (l = doc.createElement('span')), (l.className = 'dzg-free dzg-label'), t.after(l);
          if (l.textContent !== node.label) l.textContent = node.label;
        } else l?.remove();
        const pad = `calc(var(--dzg-cell-padding-inline, 0.5rem) + ${level * indent}px)`;
        if (cell.style.getPropertyValue(PAD) !== pad) cell.style.setProperty(PAD, pad);
      }
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
      const kids = d.childrenAt(i) > 0;
      const open = kids && d.expandedAt(i);
      // Forward: a closed parent opens; otherwise the column move.
      if (step.delta > 0) return kids && !open && (expand([at.row], true), true);
      if (open) return expand([at.row], false), true;
      // Back on a closed parent or a leaf: its parent row, same column (a root: nothing).
      const parent = d.parentOf(at.row);
      if (parent !== null && kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: parent, column: at.column } }, 'user').ok) g.restoreFocus();
      return true;
    },
    destroy() {
      off();
      for (const c of decorated) undecorate(c);
      el.viewport.setAttribute('role', 'grid');
    },
  };
}
