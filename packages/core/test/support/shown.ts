import { dataKey, detailKey, groupKey, idOfDataKey, type DisplayIndex, type DisplayedRows, type RowKey, type RowNode } from '@dzgrid/core';

/**
 * Rows shown, written as tokens (Phase 5 step 10, the range suites and tests): `a` a data row of id `a`;
 * `(a)` a data row shown muted for its matches (a filtered tree's ancestor); `> a` the detail row of `a`;
 * `/x/y` a filler of a path tree; `~a` the loading row under `a`. `rows` gives each id's fields.
 */
export function shown<T extends object = Record<string, unknown>>(tokens: readonly string[], rows: Readonly<Record<string, T>> = {}): DisplayedRows<T> {
  const data = (id: string) => ({ id, ...(rows[id] ?? {}) }) as unknown as T;
  const nodes: RowNode<T>[] = [];
  const matched: boolean[] = [];
  for (const t of tokens) {
    let n: RowNode<T>;
    let m = true;
    if (t.startsWith('> ')) n = { key: detailKey(dataKey(t.slice(2))!), kind: 'detail', level: 0, master: dataKey(t.slice(2))!, data: data(t.slice(2)) };
    else if (t.startsWith('/')) {
      const path = t.slice(1).split('/');
      n = { key: groupKey(path), kind: 'group', level: path.length - 1, label: path[path.length - 1]!, path };
    } else if (t.startsWith('~')) n = { key: `l:${dataKey(t.slice(1))!}` as RowKey, kind: 'loading', level: 1, parent: dataKey(t.slice(1))!, failed: false };
    else {
      m = !(t.startsWith('(') && t.endsWith(')'));
      const id = m ? t : t.slice(1, -1);
      n = { key: dataKey(id)!, kind: 'data', level: 0, id, data: data(id) };
    }
    nodes.push(n);
    matched.push(m);
  }
  const at = new Map(nodes.map((n, i) => [n.key as string, i]));
  const ok = (i: number) => {
    if (!Number.isInteger(i) || i < 0 || i >= nodes.length) throw new RangeError(`no displayed row ${i}`);
    return i;
  };
  return {
    version: 1,
    count: nodes.length,
    nodeAt: (i) => nodes[ok(i)]!,
    keyAt: (i) => nodes[ok(i)]!.key,
    indexOf: (key) => (at.get(key) ?? -1) as DisplayIndex | -1,
    index: (n) => (Number.isInteger(n) && n >= 0 && n < nodes.length ? (n as DisplayIndex) : null),
    nextData(i, d) {
      for (let j = i + d; j >= 0 && j < nodes.length; j += d) if (nodes[j]!.kind === 'data') return nodes[j] as never;
      return null;
    },
    dataCount: nodes.filter((n, i) => n.kind === 'data' && matched[i]).length,
    matchedAt: (i) => matched[ok(i)]!,
  };
}

/** The token of a row key, as `shown` writes it (a data row's id, `> id` for a detail). */
export const tokenOf = (n: RowNode<unknown>): string => (n.kind === 'data' ? String(n.id) : n.kind === 'detail' ? `> ${idOfDataKey(n.master)}` : String(n.key));
