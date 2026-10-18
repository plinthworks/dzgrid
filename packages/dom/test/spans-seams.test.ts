import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type ColumnOrGroup, type RowKey } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { FeatureHandle, GridFeature } from '../src/features.js';
import type { HeaderBandSpec } from '../src/render/header.js';
import type { Frame, RowPlan } from '../src/render/rows.js';
import { EN } from '../src/locales/en.js';

/**
 * Step 9b, commit 1: the seams the spans feature plugs into (group rows above
 * the column headers, a row's span plan, anchors, a paint hook), driven here
 * by small test features. Without them the grid is as before (the rest of the
 * suite).
 */
type R = { id: string; a: string; n: number };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });
const k = (s: string): RowKey => dataKey(s)!;

/** A group row with one group cell over each column (the spans feature's are wider). */
function band(id: string, level: number): HeaderBandSpec & { readonly cells: Map<string, HTMLElement> } {
  const cells = new Map<string, HTMLElement>();
  return {
    id,
    cells,
    paint(segs, p) {
      for (const col of p.layout.center.columns) {
        if (cells.has(col.id)) continue;
        const el = document.createElement('div');
        el.className = 'dzg-hcell dzg-hgroup';
        el.setAttribute('role', 'columnheader');
        el.tabIndex = -1;
        el.dataset['col'] = col.id;
        el.dataset['level'] = String(level);
        cells.set(col.id, el);
        segs.center.append(el);
      }
    },
    cell: (column) => cells.get(column) ?? null,
  };
}

function make(handle: Omit<FeatureHandle, 'destroy'>, o: { rows?: number; columns?: ColumnOrGroup<R>[] } = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const feature: GridFeature = { id: 'test.spans', setup: () => ({ ...handle, destroy() {} }) };
  const columns = o.columns ?? [{ id: 'a', header: 'A' }, { id: 'n', header: 'N', type: 'number' }, { id: 'x', value: () => 1 }];
  const g = createGrid<R>(host, { rows: Array.from({ length: o.rows ?? 50 }, (_, i) => ({ id: `r${i}`, a: `a${i}`, n: i })), getRowId: (r) => r.id, columns, messages: EN, features: [feature] }, { geometry, sync: true });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const press = (key: string) => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  return { g, host, vp, box, press };
}

describe('group rows above the column headers (bands)', () => {
  it('stand above the column headers, and every header row counts in the indexes', () => {
    const top = band('top', -2);
    const near = band('near', -1);
    const { host, vp } = make({ bands: [top, near], headerRows: [{ id: 'extra', mount: () => {} }] });
    const rows = [...host.querySelectorAll('.dzg-header [role=row]')];
    expect(rows.map((r) => r.getAttribute('aria-rowindex'))).toEqual(['1', '2', '3', '4']);
    expect(rows[0]!.contains(top.cells.get('a')!)).toBe(true);
    expect(rows[1]!.contains(near.cells.get('a')!)).toBe(true);
    expect(rows[2]!.querySelector('[role=columnheader][data-col="a"]')).not.toBeNull();
    // Two group rows, the column headers and the extra row: the body starts at 5.
    expect(vp.getAttribute('aria-rowcount')).toBe('54');
    expect(host.querySelector('.dzg-layer > .dzg-row')!.getAttribute('aria-rowindex')).toBe('5');
  });

  it('Up from the column headers climbs the group rows, then stops; Down comes back', () => {
    const top = band('top', -2);
    const near = band('near', -1);
    const { g, host, press } = make({ bands: [top, near] });
    host.querySelector<HTMLElement>('.dzg-hcell[data-col="n"]:not(.dzg-hgroup)')!.focus();
    press('ArrowUp');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'n', level: -1 });
    expect(document.activeElement).toBe(near.cells.get('n'));
    press('ArrowUp');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'n', level: -2 });
    expect(document.activeElement).toBe(top.cells.get('n'));
    press('ArrowUp');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'n', level: -2 });
    press('ArrowDown');
    press('ArrowDown');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'n' });
    expect((document.activeElement as HTMLElement).dataset['col']).toBe('n');
  });

  it('a click on a group header does not sort', () => {
    const near = band('near', -1);
    const { g } = make({ bands: [near] });
    near.cells.get('n')!.click();
    expect(g.kernel.query.sort).toEqual([]);
  });

  it('takes groups in `columns`: their columns show, the group itself not (the base ignores it)', () => {
    const { host } = make({}, { columns: [{ id: 'patient', header: 'Patient', children: [{ id: 'a', header: 'A' }, { id: 'n', type: 'number' }] }] });
    expect([...host.querySelectorAll<HTMLElement>('.dzg-header [role=columnheader][data-col]')].map((c) => c.dataset['col'])).toEqual(['a', 'n']);
    expect(host.textContent).not.toContain('Patient');
  });
});

describe('a row’s span plan', () => {
  // Row r1: its cell `a` covers two rows and the columns a and n; x is plain.
  const plan: RowPlan = { covered: new Set([1]), cells: new Map([[0, { rows: 2, cols: 2, width: 300 }]]), spans: true };
  const plain: RowPlan = { covered: new Set([0]), cells: new Map(), spans: false };
  const spans = { map: null, plan: (i: number) => (i === 1 ? plan : i === 2 ? plain : null) };

  it('has no element for a covered slot; the origin says what it covers and takes its width', () => {
    const { host } = make({ spans });
    const row = (i: number) => host.querySelector(`.dzg-layer > .dzg-row[aria-rowindex="${i + 2}"]`)!;
    const origin = row(1).querySelector<HTMLElement>('[data-col="a"]')!;
    expect(row(1).querySelector('[data-col="n"]')).toBeNull();
    expect(origin.getAttribute('aria-rowspan')).toBe('2');
    expect(origin.getAttribute('aria-colspan')).toBe('2');
    expect(origin.hasAttribute('data-span')).toBe(true);
    expect(origin.style.getPropertyValue('inline-size')).toBe('300px');
    expect(row(1).hasAttribute('data-spans')).toBe(true);
    // The row under it: its covered slot has no cell, nothing to say on the others.
    expect(row(2).querySelector('[data-col="a"]')).toBeNull();
    expect(row(2).querySelector('[data-col="n"]')!.hasAttribute('aria-colspan')).toBe(false);
    expect(row(2).hasAttribute('data-spans')).toBe(false);
    // A plain row says nothing either.
    expect(row(0).querySelector('[data-col="n"]')!.hasAttribute('data-span')).toBe(false);
  });

  it('an unchanged repaint writes nothing; a new plan rebinds the row', () => {
    let current: RowPlan | null = plan;
    const { g, host } = make({ spans: { map: null, plan: (i) => (i === 1 ? current : null) } });
    const row = host.querySelector('.dzg-layer > .dzg-row[aria-rowindex="3"]')!;
    const mo = new MutationObserver(() => {});
    mo.observe(host.querySelector('.dzg-layer')!, { subtree: true, attributes: true, childList: true, characterData: true });
    g.api.refresh();
    expect(mo.takeRecords()).toEqual([]);
    current = null;
    g.api.refresh();
    expect(mo.takeRecords().length).toBeGreaterThan(0);
    mo.disconnect();
    expect(row.querySelector('[data-col="n"]')).not.toBeNull();
    expect(row.querySelector('[data-col="a"]')!.hasAttribute('aria-colspan')).toBe(false);
  });
});

describe('anchors and the paint hook', () => {
  it('keeps an anchor row mounted out of the window, in display order', () => {
    const { host, vp, box } = make({ spans: { map: null, plan: () => null, anchors: () => [k('r3')] } }, { rows: 500 });
    box.scrollTop = 32 * 300;
    vp.dispatchEvent(new Event('scroll'));
    const indexes = [...host.querySelectorAll('.dzg-layer > .dzg-row')].map((r) => Number(r.getAttribute('aria-rowindex')));
    expect(indexes[0]).toBe(5);
    expect(indexes.slice(1).every((i) => i > 290)).toBe(true);
  });

  it('runs afterRows at each paint with the frame, rows placed', () => {
    const seen: number[] = [];
    let mounted = 0;
    const { g } = make({
      afterRows(f: Frame<unknown>) {
        seen.push(f.rowTop(1));
        mounted = document.querySelectorAll('.dzg-layer > .dzg-row').length;
      },
    });
    const before = seen.length;
    g.api.refresh();
    expect(seen.length).toBe(before + 1);
    expect(seen.at(-1)).toBe(32);
    expect(mounted).toBeGreaterThan(0);
  });
});
