import { problem, type Problem } from '../problems.js';
import { canonical, makeQuery, type Query } from './query.js';
import type { FilterModel } from '../filter/model.js';
import type { SortItem } from '../sort/compile.js';

/**
 * Where each operation runs (Phase 3, the owner's first decision): filtering,
 * the quick search, sorting and paging, each in the browser or on the server.
 *
 * Filtering and sorting commute, so any mix of the two is right; paging does
 * not commute with anything: a page is a cut of the final ordered list. Hence
 * the one rule — server pages mean everything else on the server too, or a
 * page would be filtered or sorted alone and its counts would lie.
 */
export type Operation = 'filter' | 'quick' | 'sort' | 'page';
export type Placement = 'client' | 'server';

export interface Operations {
  readonly filter: Placement;
  readonly quick: Placement;
  readonly sort: Placement;
  /** `off`: one scrolling list, no pager. */
  readonly page: Placement | 'off';
}

export type OperationsInput = 'client' | 'server' | Partial<Operations>;

const ALL_CLIENT: Operations = { filter: 'client', quick: 'client', sort: 'client', page: 'off' };
const ALL_SERVER: Operations = { filter: 'server', quick: 'server', sort: 'server', page: 'server' };
const STAGES = ['filter', 'quick', 'sort'] as const;

/**
 * The placements for a setting, and what was wrong with it. Unsaid: paging
 * is on the server when there is a source and off otherwise; the others
 * follow paging (server pages, server; otherwise the browser). A refused
 * placement is never silent: it is a problem, and the reading is stated.
 */
export function resolveOperations(input: OperationsInput | undefined, hasSource: boolean): { readonly ops: Operations; readonly problems: readonly Problem[] } {
  const problems: Problem[] = [];
  const refuse = (op: Operation | null, detail: string) => problems.push(problem('invalid-operations', 'error', op ? `operations.${op}` : 'operations', detail));
  if (input === undefined) return { ops: hasSource ? ALL_SERVER : ALL_CLIENT, problems };
  if (input === 'server') {
    if (hasSource) return { ops: ALL_SERVER, problems };
    refuse(null, 'server without a source');
    return { ops: ALL_CLIENT, problems };
  }
  if (input === 'client') return { ops: { ...ALL_CLIENT, page: hasSource ? 'client' : 'off' }, problems };
  if (typeof input !== 'object' || input === null) {
    refuse(null, String(input));
    return { ops: hasSource ? ALL_SERVER : ALL_CLIENT, problems };
  }

  let page: Placement | 'off' = hasSource ? 'server' : 'off';
  if (input.page !== undefined) {
    if (input.page === 'client' || input.page === 'server' || input.page === 'off') page = input.page;
    else refuse('page', String(input.page));
  }
  if (page === 'server' && !hasSource) {
    refuse('page', 'server without a source');
    page = 'off';
  }
  const placed = { filter: 'client', quick: 'client', sort: 'client' } as Record<(typeof STAGES)[number], Placement>;
  for (const op of STAGES) {
    const unsaid: Placement = page === 'server' ? 'server' : 'client';
    const v = input[op];
    let p: Placement = unsaid;
    if (v !== undefined) {
      if (v === 'client' || v === 'server') p = v;
      else refuse(op, String(v));
    }
    if (p === 'server' && !hasSource) {
      refuse(op, 'server without a source');
      p = 'client';
    }
    // A page is a cut of the final list: under server pages every stage is the server's.
    if (page === 'server' && p === 'client') {
      refuse(op, 'client under server pages');
      p = 'server';
    }
    placed[op] = p;
  }
  return { ops: { ...placed, page }, problems };
}

/** The parts of a query the server handles, with their canonical key. An empty search is not sent. */
export interface ServerQuery {
  readonly filter?: FilterModel;
  readonly quick?: string;
  readonly sort?: readonly SortItem[];
  readonly key: string;
}

/** A query split by placement: what goes to the server, and what the browser does with what comes back. */
export function splitQuery(q: Query, ops: Operations): { readonly server: ServerQuery; readonly client: Query } {
  const parts: { filter?: FilterModel; quick?: string; sort?: readonly SortItem[] } = {};
  if (ops.filter === 'server') parts.filter = q.filter;
  if (ops.quick === 'server' && q.quick.trim() !== '') parts.quick = q.quick;
  if (ops.sort === 'server') parts.sort = q.sort;
  const client = makeQuery({
    filter: ops.filter === 'client' ? q.filter : {},
    quick: ops.quick === 'client' ? q.quick : '',
    sort: ops.sort === 'client' ? q.sort : [],
  });
  return { server: { ...parts, key: canonical(parts) }, client };
}
