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

/** A row as shown: a data row, a filler of a tree, or a detail. Narrow by `kind` before reading `data`. */
export type RowNode<T> = DataNode<T> | GroupNode | DetailNode<T>;
