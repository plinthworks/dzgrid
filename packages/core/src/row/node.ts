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
}

/** A row that stands for a level with no row of its own (a path tree's folder): a label, never data, never selected. */
export interface GroupNode {
  readonly key: RowKey;
  readonly kind: 'group';
  readonly level: number;
  readonly label: string;
  readonly path: readonly string[];
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

/** A row as shown: a data row, a filler of a tree, a detail, or a lazy parent's loading row. Narrow by `kind` before reading `data`. */
export type RowNode<T> = DataNode<T> | GroupNode | DetailNode<T> | LoadingNode;
