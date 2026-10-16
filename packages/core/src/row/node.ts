import type { RowIdInput, RowKey } from '../ids.js';

export type RowKind = 'data' | 'group' | 'footer' | 'detail' | 'full-width' | 'loading';

/** A row of the host's data, as the grid sees it. Compared by `key`, never by `===` (D1). */
export interface DataNode<T> {
  readonly key: RowKey;
  readonly kind: 'data';
  readonly level: number;
  readonly id: RowIdInput;
  readonly data: Readonly<T>;
}

/** Phase 1 has data rows only; group, detail and loading rows arrive with their phases. */
export type RowNode<T> = DataNode<T>;
