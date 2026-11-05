import type { RowIdInput, RowKey } from '../ids.js';

export type RowKind = 'data' | 'group' | 'footer' | 'detail' | 'full-width' | 'loading';

/** A row of the host's data, as the grid sees it. Compared by `key`, never by `===` (D1). */
export interface DataNode<T> {
  readonly key: RowKey;
  readonly kind: 'data';
  /** Its depth in a tree, 0 for the roots (and on a flat grid). */
  readonly level: number;
  readonly id: RowIdInput;
  readonly data: Readonly<T>;
  /** A row pinned to the top or the bottom (`@dzgrid/dom/pinned-rows`, step 8b-1): never in the rows, its key a `pinnedKey`. */
  readonly pinned?: 'top' | 'bottom';
}

/**
 * A row that stands for a level with no row of its own (a path tree's folder), or a group of rows (`@dzgrid/core/grouping`,
 * Phase 7): a label, never data, never selected. A group's `label` is its value as the column formats it ('' for the
 * empty group, which the DOM names); `path` the labels from the first level down.
 */
export interface GroupNode {
  readonly key: RowKey;
  readonly kind: 'group';
  readonly level: number;
  readonly label: string;
  readonly path: readonly string[];
  /** A group's column id (row-grouping.md 1). */
  readonly column?: string;
  /** A group's value, typed as the column reads it (a day as `YYYY-MM-DD`, an instant as epoch ms); null for the empty group. */
  readonly value?: unknown;
  /** How many rows the group holds (after the filters). */
  readonly count?: number;
  /** The group's totals, by column id (aggregation.md 1–7); a column whose total is not shown is absent. */
  readonly aggs?: Readonly<Record<string, unknown>>;
}

/**
 * A totals row (aggregation.md 9–10, Phase 7): a group's footer, after its open group's last child (`f:` + the group's
 * key), or the grand total (`group: null`, `t:` + its side). Never data: never selected, copied, edited or filled.
 */
export interface FooterNode {
  readonly key: RowKey;
  readonly kind: 'footer';
  readonly level: number;
  /** The group it closes; null for the grand total. */
  readonly group: RowKey | null;
  /** The group's label ('' for the grand total and the empty group). */
  readonly label: string;
  readonly count: number;
  readonly aggs: Readonly<Record<string, unknown>>;
}

/** The detail row under an open master row (master/detail): the master's data, never selected, copied or edited. */
export interface DetailNode<T> {
  readonly key: RowKey;
  readonly kind: 'detail';
  readonly level: number;
  readonly master: RowKey;
  readonly data: Readonly<T>;
}

/**
 * The row under an open parent whose children are being loaded (lazy trees, tree-lazy.md): key
 * `l:` + the parent's key, the same while loading and after a failure (`failed`: the error row).
 * Never data: never selected, copied, edited or exported.
 */
export interface LoadingNode {
  readonly key: RowKey;
  readonly kind: 'loading';
  readonly level: number;
  readonly parent: RowKey;
  readonly failed: boolean;
}

/**
 * A place of a list loaded in blocks whose block has not arrived (`@dzgrid/core/infinite`, Phase 8, infinite-scroll.md):
 * key `l:#` + its position, the same while loading and after a failure (`failed`: its block failed, or its row could not
 * be taken). No parent. Never data: never selected, copied, edited or exported.
 */
export interface BlockLoadingNode {
  readonly key: RowKey;
  readonly kind: 'loading';
  readonly level: number;
  readonly parent: null;
  readonly failed: boolean;
}

/**
 * A row as shown: a data row, a filler of a tree or a group, a detail, a lazy parent's loading row or a block's place
 * not arrived, or a totals row. Narrow by `kind` before reading `data`.
 */
export type RowNode<T> = DataNode<T> | GroupNode | DetailNode<T> | LoadingNode | FooterNode | BlockLoadingNode;
