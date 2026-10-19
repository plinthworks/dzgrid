// Keys and focus in the floating row (step 12; docs/behaviors/filter-ui.md, reading-keyboard.md).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { dataKey } from '@dzgrid/core';
import { definePart } from '../src/part.js';
import { filters } from '../src/filters.js';
import { spans } from '../src/spans.js';
import { cleanup, make } from './support-filters.js';

afterEach(cleanup);
const head = (host: HTMLElement, col: string) => host.querySelector<HTMLElement>(`.dzg-hrow .dzg-hcell[data-col="${col}"]:not(.dzg-hextra):not(.dzg-hgroup)`)!;

describe('moving through the floating row', () => {
  it('Down: column header, floating cell, first row; Up comes back the same way', () => {
    const t = make();
    head(t.host, 'n').focus();
    t.press('ArrowDown');
    expect(t.g.kernel.focus).toEqual({ kind: 'header', column: 'n', level: 1 });
    expect(document.activeElement).toBe(t.cell('n'));
    t.press('ArrowDown');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: dataKey('r0'), column: 'n' });
    t.press('ArrowUp');
    expect(document.activeElement).toBe(t.cell('n'));
    t.press('ArrowUp');
    expect(document.activeElement).toBe(head(t.host, 'n'));
  });

  it('with group rows and the selection box: Up from the floating cell reaches the group row', () => {
    const t = make({
      features: [spans(), filters({ floating: true })],
      columns: [{ id: 'g', header: 'G', children: [{ id: 'name', header: 'Name' }, { id: 'n', type: 'number' }] }],
      settings: { selection: { mode: 'multi', checkbox: true } },
    });
    t.cell('n').focus();
    t.press('ArrowDown');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: dataKey('r0'), column: 'n' });
    t.press('ArrowUp');
    expect(t.g.kernel.focus).toEqual({ kind: 'header', column: 'n', level: 1 });
    t.press('ArrowUp');
    expect(t.g.kernel.focus).toMatchObject({ kind: 'header', column: 'n' });
    expect(t.g.kernel.focus).not.toHaveProperty('level', 1);
    t.press('ArrowUp');
    expect((t.g.kernel.focus as { level?: number }).level).toBe(-1);
    // The selection box's floating cell keeps the column (an empty gridcell).
    expect(t.hrows()[2]!.querySelector('.dzg-check')!.getAttribute('role')).toBe('gridcell');
    // Down from the select-all box: the floating row.
    (t.host.querySelector<HTMLElement>('.dzg-header [role=checkbox]')!).focus();
    t.press('ArrowDown');
    expect(t.g.kernel.focus).toEqual({ kind: 'header', column: 'name', level: 1 });
  });
});

describe('into and out of the box', () => {
  it('Enter on the cell puts the focus in the box with its text selected; F2 too', () => {
    const t = make();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'ann' } }, 'api');
    t.cell('name').focus();
    const e = t.press('Enter');
    expect(e.defaultPrevented).toBe(true);
    const i = t.input('name')!;
    expect(document.activeElement).toBe(i);
    expect([i.selectionStart, i.selectionEnd]).toEqual([0, 3]);
    expect(i.tabIndex).toBe(0);
    expect(t.g.kernel.focus).toEqual({ kind: 'header', column: 'name', level: 1 });
    t.press('Escape');
    expect(document.activeElement).toBe(t.cell('name'));
    expect(i.tabIndex).toBe(-1);
    t.press('F2');
    expect(document.activeElement).toBe(t.input('name'));
    // With a modifier, nothing.
    t.cell('n').focus();
    t.press('Enter', { ctrlKey: true });
    expect(document.activeElement).toBe(t.cell('n'));
  });

  it('Enter on the cell never sorts', () => {
    const t = make();
    t.cell('name').focus();
    t.press('Enter');
    t.press('Escape');
    t.press('Enter', { shiftKey: true });
    t.cell('name').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    t.input('name')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(t.g.kernel.query.sort).toEqual([]);
  });

  it('keys inside the box are never prevented and never move the grid', () => {
    const t = make();
    t.cell('name').focus();
    t.press('Enter');
    const i = t.input('name')!;
    for (const [k, init] of [['ArrowLeft', {}], ['ArrowRight', {}], ['ArrowUp', {}], ['ArrowDown', {}], ['Home', {}], ['End', {}], [' ', {}], ['a', { ctrlKey: true }], ['PageDown', {}]] as const) {
      const e = t.press(k, init);
      expect(e.defaultPrevented, k).toBe(false);
      expect(document.activeElement, k).toBe(i);
    }
    expect(t.g.kernel.focus).toEqual({ kind: 'header', column: 'name', level: 1 });
  });

  it('a focus in the box maps to the floating cell; leaving the cell puts the controls out of the Tab order', () => {
    const t = make();
    t.input('n')!.focus();
    expect(t.g.kernel.focus).toEqual({ kind: 'header', column: 'n', level: 1 });
    head(t.host, 'name').focus();
    expect(t.input('n')!.tabIndex).toBe(-1);
  });

  it('Enter on a summary cell focuses Clear; Clear puts the focus back on the cell', () => {
    const t = make();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'd', filter: { type: 'day', op: 'equals', value: '2024-01-01' } }, 'api');
    t.cell('d').focus();
    t.press('Enter');
    const b = t.cell('d').querySelector('button')!;
    expect(document.activeElement).toBe(b);
    b.click();
    expect(t.g.kernel.query.filter).toEqual({});
    expect(document.activeElement).toBe(t.cell('d'));
  });

  it('a custom part gets Enter, F2 and Escape at the cell', () => {
    let focused = 0;
    const part = definePart('floating', {
      mount: (h) => {
        const b = document.createElement('select');
        h.append(b);
        return { focus: () => { focused++; b.focus(); return true; } };
      },
    });
    const t = make({ settings: { parts: { floating: part } } });
    t.cell('d').focus();
    t.press('F2');
    expect(focused).toBe(1);
    expect(document.activeElement!.tagName).toBe('SELECT');
    const e = t.press('Escape');
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(t.cell('d'));
  });

  it('a pending edit is applied by Escape and the cell keeps the focus; an Escape never reaches a host dialog', () => {
    vi.useFakeTimers();
    const t = make();
    const outer = vi.fn();
    t.host.addEventListener('keydown', outer);
    t.cell('name').focus();
    t.press('Enter');
    t.type('name', 'bob');
    t.press('Escape');
    expect(outer).not.toHaveBeenCalled();
    expect(t.g.kernel.query.filter['name']).toMatchObject({ value: 'bob' });
  });
});
