// The date filters' loader, now shared through @dzgrid/dom/internal (Phase 5 step 6, test analysis): a bad kit's error
// keeps the filters' name; no Retry button while a kit loads again.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { filters } from '../src/filters.js';
import { cleanup, make, type R } from './support-filters.js';

afterEach(cleanup);
let reported: unknown[] = [];
beforeEach(() => {
  reported = [];
  (window as unknown as { reportError: unknown }).reportError = (e: unknown) => void reported.push(e);
});
afterEach(() => void delete (window as unknown as { reportError?: unknown }).reportError);

type Row = R & { d: string };
const ROWS: Row[] = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, name: `p${i}`, n: i, d: `2026-10-0${1 + (i % 9)}` }) as Row);
const COLS: ColumnOrGroup<Row>[] = [{ id: 'name', header: 'Name' }, { id: 'd', header: 'D', type: 'day' }];

function grid(loadDates: () => Promise<unknown>) {
  const feature = filters({ loadDates: loadDates as never });
  const t = make({ columns: COLS as never, rows: ROWS, features: [feature], settings: { clock: () => Date.UTC(2026, 9, 19) } as never });
  const popup = () => t.host.querySelector<HTMLElement>('.dzg-popup');
  return { ...t, popup, open: (c: string) => feature.openFilter(c) };
}

describe('the date kits’ loader (moved, step 6)', () => {
  it('a kit without adapt: the reported error starts « filters: no »', async () => {
    const t = grid(() => Promise.resolve({}));
    t.open('d');
    await vi.waitFor(() => expect(reported.length).toBeGreaterThan(0));
    expect(String((reported[0] as Error).message)).toMatch(/^filters: no adapt/);
  });

  it('no Retry button while the kit loads again', async () => {
    let n = 0;
    const t = grid(() => (++n === 1 ? Promise.reject(new Error('offline')) : new Promise(() => {})));
    t.open('d');
    await vi.waitFor(() => expect(t.popup()?.querySelector('.dzg-fretry')).toBeTruthy());
    t.popup()!.querySelector<HTMLButtonElement>('.dzg-fretry')!.click();
    await Promise.resolve();
    expect(t.popup()!.querySelector('.dzg-fload')).not.toBeNull();
    expect(t.popup()!.querySelector('.dzg-fretry')).toBeNull();
  });
});
