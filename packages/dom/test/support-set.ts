// Shared fixtures for the set filter's tests (step 15; docs/behaviors/filter-set.md).
import { expect } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { filters } from '../src/filters.js';
import * as kit from '../src/filters/set/index.js';
import { EN_FILTERS } from '../src/locales/en-filters.js';
import { make, type R } from './support-filters.js';

export { kit };

export type Row = R & { city: string | null; st: string };
export const TOWNS = ['Oran', 'Alger', 'Blida', 'Annaba', 'Sétif'];
/** 30 rows: Oran, Alger, Blida, Annaba 6 each, Sétif 3, blanks 3 (i % 10 === 9). */
export const ROWS: Row[] = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, name: `p${i}`, n: i, city: i % 10 === 9 ? null : TOWNS[i % 5]!, st: i % 2 ? 'a' : 'c' }));
export const COLS: ColumnOrGroup<Row>[] = [
  { id: 'name', header: 'Name' },
  { id: 'city', header: 'City', filter: { kind: 'set' } },
  { id: 'st', header: 'Status', type: 'enum', enumOptions: [{ value: 'a', label: 'Active' }, { value: 'c', label: 'Closed' }] },
  { id: 'n', header: 'N', type: 'number' },
];
export const T = EN_FILTERS.text as Record<string, unknown>;

interface Open {
  readonly server?: boolean;
  readonly rows?: Row[];
  readonly columns?: ColumnOrGroup<Row>[];
  readonly settings?: Record<string, unknown>;
  readonly loadSet?: () => Promise<unknown>;
  readonly values?: unknown;
  readonly floating?: boolean;
  /** More of `filters()`' options (`apply`, …). */
  readonly options?: Record<string, unknown>;
}

/** Lets the chunk's promise settle (microtasks only: fake timers stay still). */
export const settle = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

export function grid(o: Open = {}) {
  const feature = filters({ ...o.options, floating: o.floating ?? false, loadSet: (o.loadSet ?? (() => Promise.resolve(kit))) as never });
  const t = make({ columns: (o.columns ?? COLS) as never, rows: (o.rows ?? ROWS) as never, features: [feature], server: o.server, values: o.values as never, settings: o.settings as never });
  const popup = () => t.host.querySelector<HTMLElement>('.dzg-popup');
  const q = <E extends Element = HTMLElement>(s: string) => popup()?.querySelector<E>(s) ?? null;
  const list = () => q<HTMLElement>('[role=listbox]')!;
  const options = () => [...(popup()?.querySelectorAll<HTMLElement>('[role=option]') ?? [])].sort((a, b) => Number(a.getAttribute('aria-posinset')) - Number(b.getAttribute('aria-posinset')));
  const labels = () => options().map((x) => x.querySelector('.dzg-fname')!.textContent);
  /** The counts shown (drawn by CSS from `data-n`). */
  const counts = () => options().map((x) => x.querySelector('.dzg-fcount')?.getAttribute('data-n') ?? '');
  const option = (label: string) => {
    const x = options().find((e) => e.querySelector('.dzg-fname')!.textContent === label);
    expect(x, label).toBeDefined();
    return x!;
  };
  const selected = () => options().filter((x) => x.getAttribute('aria-selected') === 'true').map((x) => x.querySelector('.dzg-fname')!.textContent);
  const search = () => q<HTMLInputElement>('input.dzg-fsearch')!;
  const type = (text: string) => {
    search().value = text;
    search().dispatchEvent(new InputEvent('input', { bubbles: true }));
  };
  const all = () => q<HTMLInputElement>('input.dzg-fall')!;
  const clickAll = () => all().click();
  const status = () => q<HTMLElement>('.dzg-fstatus')!;
  const apply = () => q<HTMLButtonElement>('.dzg-fapply')!.click();
  const filter = () => t.g.kernel.query.filter as Record<string, unknown>;
  const set = (column: string, f: unknown) => t.g.kernel.dispatch({ type: 'filter.column', column, filter: f as never }, 'api');
  const open = async (column = 'city') => {
    expect(feature.openFilter(column)).toBe(true);
    await settle();
  };
  return { ...t, feature, popup, q, list, options, labels, counts, option, selected, search, type, all, clickAll, status, apply, filter, set, open };
}

