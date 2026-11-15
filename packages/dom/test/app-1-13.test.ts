// 1.13.0, found by the owner's app before publishing (docs/behaviors/presentation-settings.md 45–47; parts.md): a column's
// filter button left out (`filterButton: false`), a header part's label taking the cell's room whatever the alignment,
// and Enter right after an arrow key read on the header the focus moved to (its part entered, no sort). Expectations by
// hand.
import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnDef, ColumnOrGroup } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { definePart } from '../src/part.js';
import { slots } from '../src/slots.js';
import { filters } from '../src/filters.js';
import { FILTERS_CSS } from '../src/filters/styles.js';
import { widthOf } from '../src/render/header-decor.js';
import type { GridContext } from '../src/context.js';
import { cleanup, grids, make, MESSAGES, type R } from './support-filters.js';

afterEach(cleanup);

/** An app's header part: its title and a search box that takes the focus (as the owner's). */
const searchPart = definePart('header', {
  mount(host, c) {
    const input = document.createElement('input');
    input.setAttribute('aria-label', `Search ${c.label}`);
    host.append(input);
    return { focus: () => (input.focus(), true) };
  },
});

const ctx = (g: unknown) => (g as { context: GridContext<R> }).context;

describe('filterButton: false (45)', () => {
  const cols: ColumnOrGroup<R>[] = [
    { id: 'name', header: 'Name', flex: 1, filterButton: false },
    { id: 'n', header: 'N', type: 'number', flex: 1 },
  ];

  it('no funnel in that header, the others keep theirs; the filter still opens by Alt+ArrowDown', () => {
    const t = make({ columns: cols, features: [filters()] });
    const head = (c: string) => t.host.querySelector<HTMLElement>(`.dzg-hcell[data-col="${c}"]:not(.dzg-hextra)`)!;
    expect(head('name').querySelector('.dzg-fbtn')).toBeNull();
    expect(head('n').querySelector('.dzg-fbtn')).not.toBeNull();
    head('name').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true }));
    expect(document.querySelector('.dzg-popup:not([hidden])')).not.toBeNull();
  });

  it('its header still says « filtered » when a filter is in force', () => {
    const t = make({ columns: cols, features: [filters()] });
    t.g.kernel.dispatch({ type: 'filter.set', filter: { name: { type: 'text', op: 'contains', value: 'ann' } } }, 'api');
    const head = t.host.querySelector<HTMLElement>('.dzg-hcell[data-col="name"]:not(.dzg-hextra)')!;
    expect(head.hasAttribute('data-dzg-filtered')).toBe(true);
    expect(head.querySelector('.dzg-fbtn')).toBeNull();
    expect(head.getAttribute('aria-label')).toMatch(/Name/);
    expect(head.getAttribute('aria-label')).not.toBe('Name');
  });

  it('no 80 px floor for a button that is not there', () => {
    const t = make({ columns: cols, inline: 60, features: [filters()] });
    expect(widthOf(ctx(t.g), 'name')).toBe(40);
    expect(widthOf(ctx(t.g), 'n')).toBe(80);
  });
});

describe('a header part fills its cell (46)', () => {
  it('the label holding a part grows, the grid\'s own label is left as it was', () => {
    const cols: ColumnOrGroup<R>[] = [{ id: 'name', header: 'Name', ui: { header: 'mine' } }, { id: 'n', header: 'N', type: 'number' }];
    const t = make({ columns: cols, features: [slots(), filters()], settings: { parts: { mine: searchPart } } });
    const label = (c: string) => t.host.querySelector<HTMLElement>(`.dzg-hcell[data-col="${c}"]:not(.dzg-hextra) > .dzg-hlabel`)!;
    // Grown by the grid itself, so with or without a sheet; the grid's own label left as it was.
    expect(label('name').style.flexGrow).toBe('1');
    expect(label('n').style.flexGrow).toBe('');
  });

  it('the spacer before the buttons is left out beside it (the filters’ layout)', () => {
    expect(FILTERS_CSS).toContain(':where(.dzg-hcell:has(>.dzg-fbtn):not([data-align],:has(.dzg-hfbox,>[style*=flex-grow])))::before');
  });
});

describe('Enter right after an arrow key, in the same frame (47)', () => {
  /** A grid painted at the frames the test runs (a real browser's order), a header part with a box on « n ». */
  function framed() {
    const queue: FrameRequestCallback[] = [];
    const raf = { requestAnimationFrame: (f: FrameRequestCallback) => queue.push(f), cancelAnimationFrame: () => {} };
    const run = () => { while (queue.length) queue.shift()!(0); };
    const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
    const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
    const host = document.createElement('div');
    document.body.append(host);
    const columns: ColumnDef<R, any>[] = [{ id: 'name', header: 'Name' }, { id: 'n', header: 'N', type: 'number', ui: { header: 'mine' } }];
    const g = createGrid<R>(host, {
      rows: [{ id: 'r0', name: 'a', n: 1 }, { id: 'r1', name: 'b', n: 2 }], getRowId: (r) => r.id, columns,
      // filters(): its floating row's keys share the header's (`cellKeys`), as in an app.
      features: [slots(), filters()], parts: { mine: searchPart }, messages: MESSAGES,
    }, { geometry, raf }) as GridInstance<R, any>;
    grids.push(g);
    run();
    const head = (c: string) => host.querySelector<HTMLElement>(`.dzg-hcell[data-col="${c}"]`)!;
    // Keys as a browser sends them: to the element that has the focus now.
    const key = (k: string) => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    return { g, host, head, key, run };
  }

  it('ArrowRight then Enter: the box of the header reached takes the focus, nothing sorts', () => {
    const t = framed();
    t.head('name').focus();
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 'name' } }, 'user');
    t.run();
    expect(document.activeElement).toBe(t.head('name'));
    t.key('ArrowRight');
    t.key('Enter');
    expect(document.activeElement).toBe(t.head('n').querySelector('input'));
    expect(t.g.kernel.query.sort).toEqual([]);
  });

  it('ArrowRight then F2: the same; ArrowLeft then Enter on a header without a part sorts that one', () => {
    const t = framed();
    t.head('name').focus();
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 'name' } }, 'user');
    t.run();
    t.key('ArrowRight');
    t.key('F2');
    expect(document.activeElement).toBe(t.head('n').querySelector('input'));
    // Back on the header (Escape), then left and Enter in one frame: « name » has no part, it sorts — « name », not « n ».
    t.key('Escape');
    t.run();
    expect(document.activeElement).toBe(t.head('n'));
    t.key('ArrowLeft');
    t.key('Enter');
    t.run();
    expect(t.g.kernel.query.sort).toEqual([{ column: 'name', dir: 'asc' }]);
  });
});
