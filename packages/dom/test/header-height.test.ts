// `headerHeight` (docs/behaviors/density.md « Header height », 1.9.0, owner 2026-11-09): the header rows taller than the
// data rows. Written before the code; jsdom has no layout: heights are read where the grid writes them (block-size,
// insets, `--dzg-header-height`), and the header's real height in browsers (scripts, once).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ColumnOrGroup, Problem } from '@dzgrid/core';
import { cleanup, emake, k, type R } from './support-edit.js';
import { pm, ref } from './support-pinned.js';
import { make as fmake, cleanup as fcleanup } from './support-filters.js';
import { spans } from '../src/spans.js';
import { verticalHeaders } from '../src/vertical-headers.js';
import { filters } from '../src/filters.js';

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  fcleanup();
});

const hrows = (h: HTMLElement) => [...h.querySelectorAll<HTMLElement>('.dzg-header .dzg-hrow')];
const size = (el: HTMLElement | null | undefined) => el?.style.getPropertyValue('block-size');
const told = (events: { type: string }[]): Problem[] => events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: Problem[] }).problems).filter((p) => p.code === 'invalid-setting');

describe('headerHeight', () => {
  it('the column headers’ row takes it, the data rows keep theirs (1); the root says it (10)', () => {
    const m = emake({ settings: { headerHeight: 70, rowHeight: 40 } });
    expect(hrows(m.host).map(size)).toEqual(['70px']);
    expect(size(m.row('r0'))).toBe('40px');
    expect(m.ctx.rowHeight()).toBe(40);
    const root = m.host.querySelector<HTMLElement>('.dzg')!;
    expect(root.style.getPropertyValue('--dzg-header-height')).toBe('70px');
    expect(root.style.getPropertyValue('--dzg-row-height')).toBe('40px');
  });

  it('absent: the header row is a row high, as before (2)', () => {
    const m = emake({ settings: { rowHeight: 40 } });
    expect(hrows(m.host).map(size)).toEqual(['40px']);
    const d = emake();
    expect(hrows(d.host).map(size)).toEqual(['32px']);
  });

  it('the group rows take it too; a header stretched over an empty group cell covers it (3)', () => {
    const cols: ColumnOrGroup<R>[] = [{ id: 'g', header: 'Group', children: [{ id: 'name', header: 'Name', width: 120 }, { id: 'n', header: 'N', type: 'number', width: 80 }] }, { id: 's', header: 'S', width: 80 }];
    const m = emake({ columns: cols as never, settings: { headerHeight: 70, rowHeight: 40, features: [spans()] } }); // a tree of columns: emake's columns are leaves
    expect(hrows(m.host).map(size)).toEqual(['70px', '70px']);
    const lone = m.host.querySelector<HTMLElement>('.dzg-hcell[data-col="s"]')!;
    expect(lone.style.getPropertyValue('--dzg-up')).toBe('70px');
    // The spans' sticky labels sit under both rows.
    expect(m.host.querySelector<HTMLElement>('.dzg')!.style.getPropertyValue('--dzg-header-h')).toBe('140px');
  });

  it('a filter row under the headers keeps the row height (4)', () => {
    const m = fmake({ settings: { headerHeight: 70, rowHeight: 40 } });
    expect(hrows(m.host).map(size)).toEqual(['70px', '40px']);
  });

  it('grows with the reader’s text size, whole px (5)', () => {
    const m = emake({ settings: { headerHeight: 70, rowHeight: 40 } });
    m.box.remPx = 20;
    m.g.update({ label: 'x' }); // a paint reads the new text size
    // 70 × 20 / 16 = 87.5 → 88; 40 × 20 / 16 = 50.
    expect(hrows(m.host).map(size)).toEqual(['88px']);
    expect(m.ctx.rowHeight()).toBe(50);
  });

  it('invalid: ignored, the row height used, told once per value (5)', () => {
    for (const bad of [10, 2000, Number.NaN, '70' as unknown as number]) { // a string from an untyped host
      const m = emake({ settings: { headerHeight: bad, rowHeight: 40 } });
      expect(hrows(m.host).map(size)).toEqual(['40px']);
      expect(told(m.events).map((p) => [p.severity, p.path, p.detail])).toEqual([['warning', 'settings.headerHeight', String(bad)]]);
    }
    const m = emake({ settings: { headerHeight: 70 } });
    m.g.update({ headerHeight: 12 });
    m.g.update({ headerHeight: 12 });
    expect(told(m.events)).toHaveLength(1);
    expect(hrows(m.host).map(size)).toEqual(['32px']);
  });

  it('live: the header and the overlay follow (the busy bar sits at its top: busy-bar.test); taken away, the row height comes back (6)', () => {
    const m = emake({ rows: [], settings: { rowHeight: 40 } });
    const overlay = m.host.querySelector<HTMLElement>('.dzg-overlay')!;
    expect(overlay.style.getPropertyValue('inset-block-start')).toBe('40px');
    m.g.update({ headerHeight: 70 });
    expect(hrows(m.host).map(size)).toEqual(['70px']);
    expect(overlay.style.getPropertyValue('inset-block-start')).toBe('70px');
    m.g.update({ headerHeight: undefined });
    expect(hrows(m.host).map(size)).toEqual(['40px']);
  });

  it('the pinned top rows start under the header (6)', () => {
    const m = pm({ top: [ref()], settings: { headerHeight: 70, rowHeight: 40 } });
    const top = m.host.querySelector<HTMLElement>('.dzg-pins-top')!;
    expect(top.style.getPropertyValue('inset-block-start')).toBe('70px');
    m.g.update({ headerHeight: 50 });
    expect(top.style.getPropertyValue('inset-block-start')).toBe('50px');
    expect(m.g.kernel.rows.displayed.indexOf(k('r0'))).toBe(0);
  });

  it('a live change paints once more: what read the header before it changed reads it again (6)', () => {
    // jsdom has no layout: the header as tall as its rows' written heights, as a browser lays it out.
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('dzg-header') ? [...this.querySelectorAll<HTMLElement>('.dzg-hrow')].reduce((s, r) => s + (parseFloat(r.style.getPropertyValue('block-size')) || 0), 0) : 0;
    });
    const m = pm({ top: [ref()], settings: { headerHeight: 70, rowHeight: 40 } });
    const top = m.host.querySelector<HTMLElement>('.dzg-pins-top')!;
    m.g.update({ label: 'x' }); // a paint that reads the header laid out
    expect(top.style.getPropertyValue('inset-block-start')).toBe('70px');
    m.g.update({ headerHeight: 50 });
    expect(top.style.getPropertyValue('inset-block-start')).toBe('50px');
  });

  it('vertical titles: the taller of headerHeight and the longest title (7)', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.closest('.dzg-vprobe') ? (this.textContent ?? '').length * 7 : 0; // jsdom has no layout: 7 px a character
    });
    const cols = (t: string) => [{ id: 'name', header: 'Name' }, { id: 'n', header: t, type: 'number', headerVertical: true }];
    // « Grams of leaves »: 15 × 7 + 16 = 121 > 70.
    const long = emake({ columns: cols('Grams of leaves') as never, settings: { headerHeight: 70, features: [verticalHeaders()] } }); // a vertical column's def
    expect(hrows(long.host)[0]!.style.getPropertyValue('min-block-size')).toBe('121px');
    // « Grams »: 5 × 7 + 16 = 51 < 70: the header's own height.
    const short = emake({ columns: cols('Grams') as never, settings: { headerHeight: 70, features: [verticalHeaders()] } }); // a vertical column's def
    expect(hrows(short.host)[0]!.style.getPropertyValue('min-block-size')).toBe('');
    expect(hrows(short.host).map(size)).toEqual(['70px']);
  });

  it('hidden headers take no room whatever it says (8)', () => {
    const m = pm({ top: [ref()], settings: { headerHeight: 70, headers: 'hidden' } });
    expect(m.host.querySelector<HTMLElement>('.dzg-pins-top')!.style.getPropertyValue('inset-block-start')).toBe('0px');
  });
});

// 1.10.0 (owner 2026-11-10, review 1.4): `headerHeight: { columns, groups }` (density.md « Group rows' height » 11–16).
describe('headerHeight: { columns, groups }', () => {
  const tree: ColumnOrGroup<R>[] = [{ id: 'g', header: 'Group', children: [{ id: 'name', header: 'Name', width: 120 }, { id: 'n', header: 'N', type: 'number', width: 80 }] }, { id: 's', header: 'S', width: 80 }];
  const grouped = (headerHeight: unknown, more: object = {}) => emake({ columns: tree as never, settings: { headerHeight: headerHeight as never, rowHeight: 40, features: [spans()], ...more } }); // a tree of columns; an object or a bad value from an untyped host

  it('the group rows and the column headers apart; a stretched header covers the group rows’ height (11, 14)', () => {
    const m = grouped({ columns: 70, groups: 30 });
    expect(hrows(m.host).map(size)).toEqual(['30px', '70px']);
    expect(m.host.querySelector<HTMLElement>('.dzg-hcell[data-col="s"]')!.style.getPropertyValue('--dzg-up')).toBe('30px');
    const root = m.host.querySelector<HTMLElement>('.dzg')!;
    expect(root.style.getPropertyValue('--dzg-header-h')).toBe('100px');
    expect(root.style.getPropertyValue('--dzg-header-height')).toBe('70px');
  });

  it('a member left out: columns → the row height, groups → the column headers’ (12)', () => {
    expect(hrows(grouped({ columns: 70 }).host).map(size)).toEqual(['70px', '70px']);
    expect(hrows(grouped({ groups: 30 }).host).map(size)).toEqual(['30px', '40px']);
    expect(hrows(grouped(56).host).map(size)).toEqual(['56px', '56px']);
  });

  it('each member checked on its own, told at its path, not again for the same numbers (13)', () => {
    const m = grouped({ columns: 70, groups: 10 });
    expect(hrows(m.host).map(size)).toEqual(['70px', '70px']);
    expect(told(m.events).map((p) => [p.path, p.detail])).toEqual([['settings.headerHeight.groups', '10']]);
    m.g.update({ headerHeight: { columns: 70, groups: 10 } });
    expect(told(m.events)).toHaveLength(1);
    m.g.update({ headerHeight: [70] as never }); // an array from an untyped host
    expect(told(m.events).map((p) => p.path)).toEqual(['settings.headerHeight.groups', 'settings.headerHeight']);
    expect(hrows(m.host).map(size)).toEqual(['40px', '40px']);
  });

  it('a value JSON cannot write, an object without a prototype: told, never thrown (bad input never throws)', () => {
    const m = grouped(70);
    expect(() => m.g.update({ rowHeight: 10n as never })).not.toThrow(); // a bigint from an untyped host
    const bare = Object.assign(Object.create(null) as object, { columns: 10 }); // an object without a prototype (a parser's)
    expect(() => m.g.update({ headerHeight: bare })).not.toThrow();
    expect(told(m.events).map((p) => [p.path, p.detail])).toEqual([['settings.rowHeight', '10'], ['settings.headerHeight.columns', '10']]);
    expect(() => grouped(bare)).not.toThrow();
  });

  it('grows with the text size; live; the pinned top rows under both (13, 14)', () => {
    const m = grouped({ columns: 70, groups: 30 });
    m.box.remPx = 20;
    m.g.update({ label: 'x' });
    // 30 × 20 / 16 = 37.5 → 38; 70 → 88.
    expect(hrows(m.host).map(size)).toEqual(['38px', '88px']);
    m.g.update({ headerHeight: { columns: 48, groups: 24 } });
    expect(hrows(m.host).map(size)).toEqual(['30px', '60px']);
    const p = pm({ top: [ref()], settings: { headerHeight: { columns: 70, groups: 30 }, rowHeight: 40 } });
    expect(p.host.querySelector<HTMLElement>('.dzg-pins-top')!.style.getPropertyValue('inset-block-start')).toBe('70px');
  });
});

// 1.10.0 (owner 2026-11-10, review 1.5): the floating filter row's own height (filter-ui.md « Floating row height »).
describe('filters({ rowHeight })', () => {
  it('the filter row apart from the rows and the header', () => {
    const m = fmake({ features: [filters({ floating: true, rowHeight: 48 })], settings: { headerHeight: 70, rowHeight: 40 } });
    expect(hrows(m.host).map(size)).toEqual(['70px', '48px']);
  });

  it('a bad one: the row height, told once at its path', () => {
    for (const bad of [12, 'tall']) {
      const m = fmake({ features: [filters({ floating: true, rowHeight: bad as never })], settings: { rowHeight: 40 } }); // a bad value from an untyped host
      expect(hrows(m.host).map(size)).toEqual(['40px', '40px']);
      expect(told(m.events).map((p) => [p.path, p.detail])).toEqual([['features.filters.rowHeight', String(bad)]]);
    }
  });
});
