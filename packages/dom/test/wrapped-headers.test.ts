// Column titles on several lines (docs/behaviors/header-wrap.md, 1.10.0; owner 2026-11-10, review 5.7). jsdom has no
// layout: a copy's height is faked where the feature measures it — 7 px a character over the copy's width less 16 px of
// padding, 20 px a line, at most the copy's line cap, plus 8 px of padding; the wrapping itself is checked in browsers
// (scripts/browser-1-10.mjs).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColumnDef, Problem } from '@dzgrid/core';
import { cleanup, emake, type R } from './support-edit.js';
import { wrappedHeaders } from '../src/wrapped-headers.js';
import { verticalHeaders } from '../src/vertical-headers.js';
import { spans } from '../src/spans.js';
import { SPANS_CSS } from '../src/spans/styles.js';

let measured = 0;
/** Copies present at each read: all written before the first read. */
let present: number[] = [];
beforeEach(() => {
  measured = 0;
  present = [];
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    if (this.closest('.dzg-vprobe')) return (this.textContent ?? '').length * 7;
    const probe = this.closest('.dzg-wprobe');
    if (!probe || !this.classList.contains('dzg-hcell')) return 0;
    measured++;
    present.push(probe.querySelectorAll('.dzg-hcell').length);
    const w = parseFloat(this.style.getPropertyValue('inline-size')) - 16;
    const text = this.querySelector('.dzg-hlabel')?.textContent ?? '';
    const cap = Number(this.closest<HTMLElement>('.dzg')!.style.getPropertyValue('--dzg-header-lines') || 3); // the clamp's lines, as the CSS reads them
    const lines = Math.min(cap, Math.max(1, Math.ceil((text.length * 7) / w)));
    return lines * 20 + 8;
  });
});
afterEach(cleanup);

/** « Average delivery time in days »: 30 characters, 210 px; in 100 px columns (84 px of room): 3 lines. */
const cols = (long = 'Average delivery time in days', width = 100): ColumnDef<R>[] => [
  { id: 'name', header: 'Name', width: 120 },
  { id: 'n', header: long, type: 'number', width, headerWrap: true },
  { id: 'q', header: 'Q', type: 'number', width: 80, headerWrap: true },
];
const headRow = (h: HTMLElement) => h.querySelector<HTMLElement>('.dzg-header .dzg-hrow')!;
const hcell = (h: HTMLElement, id: string) => h.querySelector<HTMLElement>(`.dzg-hcell[data-col="${id}"]`)!;
const told = (events: { type: string }[]): Problem[] => events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: Problem[] }).problems);

describe('wrappedHeaders()', () => {
  it('marks the wrapped headers only; their name, role and keys unchanged (1, 6)', () => {
    const plain = emake({ columns: cols() });
    const m = emake({ columns: cols(), settings: { features: [wrappedHeaders()] } });
    expect(hcell(m.host, 'n').hasAttribute('data-hwrap')).toBe(true);
    expect(hcell(m.host, 'name').hasAttribute('data-hwrap')).toBe(false);
    for (const id of ['name', 'n', 'q'])
      for (const a of ['role', 'aria-label', 'aria-colindex', 'aria-keyshortcuts', 'tabindex']) expect(hcell(m.host, id).getAttribute(a)).toBe(hcell(plain.host, id).getAttribute(a));
  });

  it('the column headers’ row grows to the tallest title; all copies written before the first read, none left (3)', () => {
    const m = emake({ columns: cols(), settings: { features: [wrappedHeaders()] } });
    expect(headRow(m.host).style.getPropertyValue('min-block-size')).toBe(`${3 * 20 + 8}px`);
    expect(new Set(present)).toEqual(new Set([2]));
    expect(m.host.querySelector('.dzg-wprobe .dzg-hcell')).toBe(null);
  });

  it('capped at maxLines (1); a bad maxLines: 3, told (9)', () => {
    const two = emake({ columns: cols(), settings: { features: [wrappedHeaders({ maxLines: 2 })] } });
    expect(headRow(two.host).style.getPropertyValue('min-block-size')).toBe(`${2 * 20 + 8}px`);
    expect(two.host.querySelector<HTMLElement>('.dzg')!.style.getPropertyValue('--dzg-header-lines')).toBe('2');
    const bad = emake({ columns: cols(), settings: { features: [wrappedHeaders({ maxLines: 0 })] } });
    expect(headRow(bad.host).style.getPropertyValue('min-block-size')).toBe(`${3 * 20 + 8}px`);
    expect(told(bad.events).map((p) => [p.code, p.path])).toEqual([['invalid-setting', 'wrappedHeaders.maxLines']]);
  });

  it('short titles: the row as it is (4)', () => {
    const m = emake({ columns: cols('Grams'), settings: { features: [wrappedHeaders()] } });
    expect(headRow(m.host).style.getPropertyValue('min-block-size')).toBe('');
  });

  it('measured again on a resize and on the text size, never at a scroll (3)', () => {
    const m = emake({ columns: cols(), settings: { features: [wrappedHeaders()] } });
    const once = measured;
    m.scroll(200);
    m.scroll(0);
    expect(measured).toBe(once);
    // 200 px wide: 184 px of room, 2 lines.
    m.g.kernel.dispatch({ type: 'column.resize', column: 'n', width: 200, finished: true }, 'user');
    expect(measured).toBeGreaterThan(once);
    expect(headRow(m.host).style.getPropertyValue('min-block-size')).toBe(`${2 * 20 + 8}px`);
    const twice = measured;
    m.box.remPx = 20;
    m.g.update({ label: 'x' });
    expect(measured).toBeGreaterThan(twice);
  });

  it('with headerHeight: the taller wins (4)', () => {
    const m = emake({ columns: cols(), settings: { headerHeight: 90, features: [wrappedHeaders()] } });
    expect(headRow(m.host).style.getPropertyValue('min-block-size')).toBe('');
    const n = emake({ columns: cols(), settings: { headerHeight: 50, features: [wrappedHeaders()] } });
    expect(headRow(n.host).style.getPropertyValue('min-block-size')).toBe('68px');
  });

  it('with vertical titles: the larger need wins, each feature’s need kept (4)', () => {
    // A vertical title of 20 characters: 20 × 7 + 16 = 156 px, over the wrapped 68 px.
    const c: ColumnDef<R>[] = [...cols(), { id: 's', header: 'x'.repeat(20), headerVertical: true }];
    const m = emake({ columns: c, settings: { features: [wrappedHeaders(), verticalHeaders()] } });
    expect(headRow(m.host).style.getPropertyValue('min-block-size')).toBe('156px');
    m.g.update({ columns: [...cols(), { id: 's', header: 'x', headerVertical: true }] });
    expect(headRow(m.host).style.getPropertyValue('min-block-size')).toBe('68px');
  });

  it('under group rows: a header stretched over an empty group cell and the sticky labels follow the grown row (4, 5)', () => {
    const tree = [{ id: 'g', header: 'G', children: cols().slice(1) }, cols()[0]!];
    const m = emake({ columns: tree as never, settings: { headerHeight: 40, features: [spans(), wrappedHeaders()] } }); // a tree of columns: emake's columns are leaves
    const root = m.host.querySelector<HTMLElement>('.dzg')!;
    // The group row 40, the column headers' row grown to 68 (not its 40).
    expect(root.style.getPropertyValue('--dzg-header-row-h')).toBe('68px');
    expect(root.style.getPropertyValue('--dzg-header-h')).toBe('108px');
    expect(hcell(m.host, 'name').hasAttribute('data-up')).toBe(true);
    expect(SPANS_CSS).toContain('block-size:calc(var(--dzg-header-row-h) + var(--dzg-up))');
  });

  it('without the feature: told once per column, nothing marked (2)', () => {
    const m = emake({ columns: cols() });
    expect(hcell(m.host, 'n').hasAttribute('data-hwrap')).toBe(false);
    expect(told(m.events).map((p) => [p.code, p.path, p.detail])).toEqual([['missing-feature', 'columns[1].headerWrap', 'wrapped-headers'], ['missing-feature', 'columns[2].headerWrap', 'wrapped-headers']]);
  });

  it('destroyed: attributes and the row’s height taken away', () => {
    const m = emake({ columns: cols(), settings: { features: [wrappedHeaders()] } });
    m.g.destroy();
    expect(m.host.querySelector('[data-hwrap]')).toBe(null);
  });
});
