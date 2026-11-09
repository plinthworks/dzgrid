// Presentation settings, the base's side (docs/behaviors/presentation-settings.md 1, 3, 5, 6, 23; owner 2026-11-09):
// alternate rows, header titles aligned with their column, equal-width digits, the pinned edge's « content under »
// marks, `theme` / `icons` without their feature. Written before the code; jsdom: attributes only (the look in browsers).
import { afterEach, describe, expect, it } from 'vitest';
import type { ColumnDef, Problem } from '@dzgrid/core';
import { cleanup, emake, rowsOf, type R } from './support-edit.js';

afterEach(cleanup);

const rowsShown = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')];
/** The display index from the row's aria-rowindex (one header row before the body). */
const at = (r: HTMLElement) => Number(r.getAttribute('aria-rowindex')) - 2;
const oddOk = (host: HTMLElement) => rowsShown(host).every((r) => r.hasAttribute('data-odd') === (at(r) % 2 === 1));
const missing = (events: { type: string }[]): Problem[] => events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: Problem[] }).problems).filter((p) => p.code === 'missing-feature');

describe('alternate rows (1)', () => {
  it('the 2nd, 4th… displayed rows carry data-odd, the others not', () => {
    const m = emake();
    expect(m.row('r0')!.hasAttribute('data-odd')).toBe(false);
    expect(m.row('r1')!.getAttribute('data-odd')).toBe('');
    expect(m.row('r2')!.hasAttribute('data-odd')).toBe(false);
    expect(oddOk(m.host)).toBe(true);
  });

  it('follows the place, not the row: a sort, a scroll (pooled rows reused), a reload', () => {
    const m = emake();
    m.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'host');
    expect(m.row('r199')!.hasAttribute('data-odd')).toBe(false);
    expect(m.row('r198')!.hasAttribute('data-odd')).toBe(true);
    expect(oddOk(m.host)).toBe(true);
    m.scroll(32 * 61);
    expect(rowsShown(m.host).length).toBeGreaterThan(5);
    expect(oddOk(m.host)).toBe(true);
    // Rows taken away above: every row below moves one place, its mark flips.
    m.g.update({ rows: rowsOf(200).filter((r) => r.id !== 'r150') });
    expect(oddOk(m.host)).toBe(true);
  });
});

describe('header title aligned with its column (3)', () => {
  const cols: ColumnDef<R, any>[] = [
    { id: 'name', header: 'Name', width: 120 },
    { id: 'n', header: 'N', type: 'number', width: 80 },
    { id: 's', header: 'S', width: 80, align: 'center' },
    { id: 'q', header: 'Q', type: 'number', width: 80, headerAlign: 'start' },
  ];
  const hcell = (host: HTMLElement, id: string) => host.querySelector<HTMLElement>(`.dzg-hrow .dzg-hcell[data-col="${id}"]`)!;

  it('follows align, then the number default; headerAlign wins', () => {
    const m = emake({ columns: cols });
    expect(hcell(m.host, 'name').hasAttribute('data-align')).toBe(false);
    expect(hcell(m.host, 'n').getAttribute('data-align')).toBe('end');
    expect(hcell(m.host, 's').getAttribute('data-align')).toBe('center');
    expect(hcell(m.host, 'q').getAttribute('data-align')).toBe('start');
  });

  it('follows a live change of the columns', () => {
    const m = emake({ columns: cols });
    m.g.update({ columns: cols.map((c) => (c.id === 'name' ? { ...c, headerAlign: 'end' as const } : c)) });
    expect(hcell(m.host, 'name').getAttribute('data-align')).toBe('end');
  });
});

describe('equal-width digits (5)', () => {
  it('number cells carry data-num, the others not', () => {
    const m = emake();
    expect(m.cell('r3', 'n')!.getAttribute('data-num')).toBe('');
    expect(m.cell('r3', 'q')!.getAttribute('data-num')).toBe('');
    expect(m.cell('r3', 'name')!.hasAttribute('data-num')).toBe(false);
  });
});

describe('content under the pinned parts (6)', () => {
  const wide: ColumnDef<R, any>[] = [
    { id: 'name', header: 'Name', width: 120, pinned: 'start' },
    { id: 'n', header: 'N', type: 'number', width: 300 },
    { id: 's', header: 'S', width: 300 },
    { id: 'q', header: 'Q', type: 'number', width: 100, pinned: 'end' },
  ];
  const root = (host: HTMLElement) => host.querySelector<HTMLElement>('.dzg')!;
  const sideways = (m: ReturnType<typeof emake>, x: number) => {
    m.box.scrollInline = x;
    m.vp.dispatchEvent(new Event('scroll'));
  };

  it('at the start: only the end part has content under it; scrolled to the end, only the start part', () => {
    const m = emake({ columns: wide });
    // 120 + 300 + 300 + 100 = 820 wide in a 600 px view: 220 px to scroll.
    expect(root(m.host).hasAttribute('data-under-start')).toBe(false);
    expect(root(m.host).getAttribute('data-under-end')).toBe('');
    sideways(m, 100);
    expect(root(m.host).getAttribute('data-under-start')).toBe('');
    expect(root(m.host).getAttribute('data-under-end')).toBe('');
    sideways(m, 220);
    expect(root(m.host).getAttribute('data-under-start')).toBe('');
    expect(root(m.host).hasAttribute('data-under-end')).toBe(false);
    sideways(m, 0);
    expect(root(m.host).hasAttribute('data-under-start')).toBe(false);
  });

  it('nothing pinned: neither mark, however far it scrolls', () => {
    const m = emake({ columns: wide.map(({ pinned: _p, ...c }) => c) });
    sideways(m, 100);
    expect(root(m.host).hasAttribute('data-under-start')).toBe(false);
    expect(root(m.host).hasAttribute('data-under-end')).toBe(false);
  });

  it('the selection box counts as something pinned at the start', () => {
    const m = emake({ columns: wide.map(({ pinned: _p, ...c }) => c), settings: { selection: { mode: 'multi', checkbox: true } } });
    sideways(m, 50);
    expect(root(m.host).getAttribute('data-under-start')).toBe('');
  });
});

describe('theme and icons without theming() (23)', () => {
  it('one missing-feature warning each, detail theme; nothing written', () => {
    const m = emake({ settings: { theme: { rowOddBg: 'Canvas' }, icons: { sortAsc: '<svg xmlns="http://www.w3.org/2000/svg"/>' } } });
    expect(missing(m.events).map((p) => [p.severity, p.path, p.detail])).toEqual([
      ['warning', 'settings.theme', 'theme'],
      ['warning', 'settings.icons', 'theme'],
    ]);
    expect(m.host.querySelector<HTMLElement>('.dzg')!.style.getPropertyValue('--dzg-row-odd-bg')).toBe('');
  });
});
