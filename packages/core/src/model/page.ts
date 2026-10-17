import { problem, type Problem } from '../problems.js';

export const DEFAULT_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZES: readonly number[] = Object.freeze([25, 50, 100]);

/** Client paging, set once with the grid (`pagination`). */
export interface PageOptions {
  readonly pageSize?: number;
  /** The sizes a pager offers. */
  readonly pageSizes?: readonly number[];
}

/** Where the pages are: the browser cuts its filtered rows; a server says what it knows. */
export interface PageState {
  /** From 0, always a page that exists. */
  readonly index: number;
  readonly size: number;
  readonly sizes: readonly number[];
  /** The rows being cut into pages (the filtered ones); null when a server does not say. */
  readonly total: number | null;
  /** At least 1: an empty list is one empty page, never "page 1 of 0". Null with an unknown total. */
  readonly pageCount: number | null;
  readonly hasNext: boolean;
  /** Any page can be asked for directly (not with a cursor). */
  readonly canJump: boolean;
}

export interface PageConfig {
  readonly size: number;
  readonly sizes: readonly number[];
}

const positiveInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1;

/** The options read, a bad value told (`invalid-page`) and the default taken. Null: no paging. */
export function resolvePageOptions(o: PageOptions | undefined): { readonly config: PageConfig | null; readonly problems: readonly Problem[] } {
  if (!o) return { config: null, problems: [] };
  const problems: Problem[] = [];
  let size = DEFAULT_PAGE_SIZE;
  if (o.pageSize !== undefined) {
    if (positiveInt(o.pageSize)) size = o.pageSize;
    else problems.push(problem('invalid-page', 'error', 'pagination.pageSize'));
  }
  let sizes = DEFAULT_PAGE_SIZES;
  if (o.pageSizes !== undefined) {
    if (Array.isArray(o.pageSizes) && o.pageSizes.length > 0 && o.pageSizes.every(positiveInt)) sizes = Object.freeze([...o.pageSizes]);
    else problems.push(problem('invalid-page', 'error', 'pagination.pageSizes'));
  }
  return { config: { size, sizes }, problems };
}

export const pageCountOf = (total: number, size: number): number => Math.max(1, Math.ceil(total / size));

/** The state of page `index` (clamped) of a list of `total` rows. */
export function pageOf(cfg: PageConfig, index: number, total: number): PageState {
  const pageCount = pageCountOf(total, cfg.size);
  const at = Math.min(Math.max(0, index), pageCount - 1);
  return { index: at, size: cfg.size, sizes: cfg.sizes, total, pageCount, hasNext: at < pageCount - 1, canJump: true };
}

/** A new size keeps the page that holds the old page's first row. */
export const resizeIndex = (index: number, oldSize: number, newSize: number): number => Math.floor((index * oldSize) / newSize);

/** A page command's values: an index from 0, a size from 1, whole numbers. */
export function checkPage(p: { readonly index?: unknown; readonly size?: unknown }): readonly Problem[] {
  const out: Problem[] = [];
  if (p.index !== undefined && !(typeof p.index === 'number' && Number.isInteger(p.index) && p.index >= 0)) out.push(problem('invalid-page', 'error', 'page.index'));
  if (p.size !== undefined && !positiveInt(p.size)) out.push(problem('invalid-page', 'error', 'page.size'));
  return out;
}

export function samePage(a: PageState | null, b: PageState | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.index === b.index && a.size === b.size && a.total === b.total && a.hasNext === b.hasNext && a.pageCount === b.pageCount;
}
