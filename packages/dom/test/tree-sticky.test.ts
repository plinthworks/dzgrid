// Sticky parent rows in the DOM (docs/behaviors/tree-sticky.md, sticky-blueprint.md, decisions.md Q10–Q11):
// the layer and its copies, what they carry and do not, the pointer on them, the focus kept clear of them.
// jsdom has no layout: places are read from the inline styles the grid writes. Expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import { variableRowLayout, type GridEvent } from '@dzgrid/core';
import { definePart, type SlotContext } from '../src/part.js';
import type { GridFeature } from '../src/features.js';
import { cleanup, click, idOf, k, tmake, type T, type TMake } from './support-tree.js';

afterEach(cleanup);

/**
 * 4 services × 6 patients × 4 visits, everything open (124 rows of 32 px, a 320 px view: ten rows):
 * index 0 Service 0, 1 Patient 0.0, 2–5 its visits, 6 Patient 0.1, …, 26 Patient 0.5, 27–30 its visits, 31 Service 1.
 */
const rows = (): T[] => {
  const out: T[] = [];
  let n = 0;
  for (let s = 0; s < 4; s++) {
    out.push({ id: `S${s}`, parent: null, name: `Service ${s}`, n: n++ });
    for (let p = 0; p < 6; p++) {
      out.push({ id: `S${s}.${p}`, parent: `S${s}`, name: `Patient ${s}.${p}`, n: n++ });
      for (let v = 0; v < 4; v++) out.push({ id: `S${s}.${p}.${v}`, parent: `S${s}.${p}`, name: `Visit ${s}.${p}.${v}`, n: n++ });
    }
  }
  return out;
};

/** One line of five ancestors (L0 … L4), then 40 leaves under L4. */
const line = (): T[] => [
  ...Array.from({ length: 5 }, (_, i): T => ({ id: `L${i}`, parent: i ? `L${i - 1}` : null, name: `Level ${i}`, n: i })),
  ...Array.from({ length: 40 }, (_, i): T => ({ id: `F${i}`, parent: 'L4', name: `Leaf ${i}`, n: 10 + i })),
];

function make(o: TMake = {}) {
  const t = tmake({ rows: rows(), ...o, tree: { initial: 'all', ...o.tree } });
  const layer = () => t.host.querySelector<HTMLElement>('.dzg-sticky');
  const copyEls = () => [...t.host.querySelectorAll<HTMLElement>('.dzg-sticky > .dzg-row')];
  const name = (r: HTMLElement) => r.querySelector('.dzg-cell[data-col="name"]')?.textContent ?? null;
  /** The copies: their name and their place under the header. */
  const copies = () => copyEls().map((r) => [name(r), r.style.getPropertyValue('inset-block-start')]);
  const copy = (label: string) => copyEls().find((r) => name(r) === label)!;
  const top = () => (t.g as unknown as { scroll: { logicalTop: number } }).scroll.logicalTop;
  return { ...t, layer, copyEls, copies, copy, top };
}

describe('the layer and its copies', () => {
  it('pins Service 0 and Patient 0.0 over the visits, under the header, one row each', () => {
    const t = make();
    expect(t.copies()).toEqual([]);
    t.scroll(2 * 32 + 5);
    expect(t.copies()).toEqual([['Service 0', '0px'], ['Patient 0.0', '32px']]);
    // The layer: hidden from assistive technologies, the header's last child.
    const layer = t.layer()!;
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(layer.parentElement).toBe(t.host.querySelector('.dzg-header'));
    expect(layer.parentElement!.lastElementChild).toBe(layer);
  });

  it('carries no row semantics: no rowindex, level, place, open state; no tab stop', () => {
    const t = make();
    t.scroll(2 * 32 + 5);
    for (const r of t.copyEls()) {
      for (const a of ['aria-rowindex', 'aria-level', 'aria-posinset', 'aria-setsize', 'aria-expanded', 'aria-busy']) expect(r.hasAttribute(a), a).toBe(false);
      expect(r.querySelector('[tabindex="0"]')).toBeNull();
    }
    // The real rows keep theirs.
    expect(t.row('S0.0')!.getAttribute('aria-level')).toBe('2');
    expect(t.host.querySelectorAll('.dzg [tabindex="0"]').length).toBe(1);
  });

  it('looks like the tree: indent by level, an open chevron, the muted colour of a context row under a filter', () => {
    const t = make();
    t.scroll(2 * 32 + 5);
    const cell = (label: string) => t.copy(label).querySelector<HTMLElement>('.dzg-cell[data-col="name"]')!;
    expect(cell('Service 0').style.getPropertyValue('padding-inline-start')).toBe('calc(var(--dzg-cell-padding-inline, 0.5rem) + 0px)');
    expect(cell('Patient 0.0').style.getPropertyValue('padding-inline-start')).toBe('calc(var(--dzg-cell-padding-inline, 0.5rem) + 16px)');
    const tg = cell('Patient 0.0').firstElementChild as HTMLElement;
    expect(tg.classList.contains('dzg-toggle')).toBe(true);
    expect(tg.hasAttribute('data-open')).toBe(true);
    expect(tg.getAttribute('aria-hidden')).toBe('true');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'Visit' } }, 'user');
    t.scroll(2 * 32 + 5);
    expect(t.copies().map((c) => c[0])).toEqual(['Service 0', 'Patient 0.0']);
    for (const r of t.copyEls()) expect(r.hasAttribute('data-context-row')).toBe(true);
  });

  it('copies show text only: a column drawn by a part keeps the part in the real row, plain text in the copy', () => {
    const part = definePart('cell', {
      mount(host, c: SlotContext['cell']) {
        const b = document.createElement('button');
        b.className = 'badge';
        b.textContent = `#${c.text}`;
        host.append(b);
        return { update: (next) => void (b.textContent = `#${next.text}`) };
      },
    });
    const t = make({ settings: { parts: { 'cell.number': part } } });
    t.scroll(2 * 32 + 5);
    expect(t.cell('S0.0.1', 'n')!.querySelector('.badge')).not.toBeNull();
    const n = t.copy('Patient 0.0').querySelector<HTMLElement>('.dzg-cell[data-col="n"]')!;
    expect(n.querySelector('.badge')).toBeNull();
    expect(n.textContent).toBe('1');
  });

  it('sticky: 0 makes no layer and asks nothing of the base', () => {
    const t = make({ tree: { sticky: 0 } });
    t.scroll(2 * 32 + 5);
    expect(t.layer()).toBeNull();
    expect(t.ctx.insetFor).toBeUndefined();
  });

  it('sticky: n keeps the nearest n (the outermost dropped first); a fraction cut, below 0 none, not a number 3', () => {
    const at = (sticky: number) => {
      const t = make({ rows: line(), tree: { sticky } });
      t.scroll(8 * 32 + 3);
      const out = t.copies().map((c) => c[0]);
      cleanup();
      return out;
    };
    expect(at(1)).toEqual(['Level 4']);
    expect(at(3)).toEqual(['Level 2', 'Level 3', 'Level 4']);
    expect(at(2.7)).toEqual(['Level 3', 'Level 4']);
    expect(at(-2)).toEqual([]);
    expect(at(Number.NaN)).toEqual(['Level 2', 'Level 3', 'Level 4']);
    // Not a number at all (a host's JSON): the default, never off.
    for (const x of [null, '2', {}]) expect(at(x as never)).toEqual(['Level 2', 'Level 3', 'Level 4']);
    // Unbounded: never more than half the view (320 / 2 / 32 = 5).
    expect(at(Infinity)).toEqual(['Level 0', 'Level 1', 'Level 2', 'Level 3', 'Level 4']);
    const d = make({ rows: line() });
    d.scroll(8 * 32 + 3);
    expect(d.copies().map((c) => c[0])).toEqual(['Level 2', 'Level 3', 'Level 4']);
  });

  it('never more than half the view: 100 px of rows → one copy, the nearest', () => {
    const t = make({ block: 100 });
    t.scroll(2 * 32 + 5);
    expect(t.copies()).toEqual([['Patient 0.0', '0px']]);
  });

  it('the next patient pushes the copy up, then takes its place; the outer copy above the inner', () => {
    const t = make();
    t.scroll(150);
    expect(t.copies()).toEqual([['Service 0', '0px'], ['Patient 0.0', '10px']]);
    expect(Number(t.copy('Service 0').style.zIndex)).toBeGreaterThan(Number(t.copy('Patient 0.0').style.zIndex));
    t.scroll(170);
    expect(t.copies()).toEqual([['Service 0', '0px'], ['Patient 0.0', '-10px']]);
    t.scroll(200);
    expect(t.copies()).toEqual([['Service 0', '0px'], ['Patient 0.1', '32px']]);
    // Service 1 at the top: nothing pinned.
    t.scroll(31 * 32);
    expect(t.copies()).toEqual([]);
  });

  it('stays the header’s last child when a feature adds header rows', () => {
    const extra: GridFeature = { id: 'extra', setup: () => ({ headerRows: [{ id: 'x', mount: () => {} }], destroy() {} }) };
    const t = make({ features: [extra] });
    t.scroll(2 * 32 + 5);
    const header = t.host.querySelector('.dzg-header')!;
    expect(header.querySelectorAll(':scope > .dzg-hrow').length).toBe(2);
    expect(header.lastElementChild).toBe(t.layer());
  });

  it('follows a sort, a filter and a transaction at the next paint', () => {
    const t = make();
    t.scroll(2 * 32 + 5);
    t.g.kernel.rows.applyTransaction({ patch: [{ id: 'S0', set: { name: 'Cardiology' } }] });
    expect(t.copies().map((c) => c[0])).toEqual(['Cardiology', 'Patient 0.0']);
    // Sorted by n descending: Service 3 first, its last patient, its visits.
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'user');
    t.scroll(2 * 32 + 5);
    expect(t.copies().map((c) => c[0])).toEqual(['Service 3', 'Patient 3.5']);
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'Visit 1.' } }, 'user');
    t.scroll(2 * 32 + 5);
    expect(t.copies().map((c) => c[0])).toEqual(['Service 1', 'Patient 1.5']);
  });

  it('an unchanged stack touches nothing at a repaint', () => {
    const t = make();
    t.scroll(2 * 32 + 5);
    const seen = new MutationObserver(() => {});
    seen.observe(t.layer()!, { subtree: true, attributes: true, childList: true, characterData: true });
    t.g.api.refresh();
    t.scroll(2 * 32 + 6);
    expect(seen.takeRecords()).toEqual([]);
    seen.disconnect();
  });

  it('works right to left (Arabic): the same copies, logical places only', () => {
    const t = make({ lang: 'ar' });
    t.scroll(2 * 32 + 5);
    expect(t.copies()).toEqual([['Service 0', '0px'], ['Patient 0.0', '32px']]);
    for (const r of t.copyEls()) expect(r.getAttribute('style') ?? '').not.toMatch(/(^|[^-])(left|right|top)\s*:/);
  });

  it('is silent: scrolling copies in and out says nothing', () => {
    const t = make();
    for (let y = 0; y < 40 * 32; y += 23) t.scroll(y);
    expect(t.said()).toEqual([]);
  });
});

describe('the pointer on a copy', () => {
  const userExpanded = (events: GridEvent<T>[]) => events.filter((e) => e.type === 'rowExpanded' && e.source === 'user');

  it('its chevron closes the parent: once, said once, nothing selected, the focus not moved; the parent just under its own pinned ancestors', () => {
    const t = make({ settings: { selection: { mode: 'multi', checkbox: true, click: true } } });
    t.focus('S0.0.3', 'n');
    t.scroll(2 * 32 + 5);
    const before = document.activeElement;
    click(t.copy('Patient 0.0').querySelector<HTMLElement>('.dzg-toggle')!);
    expect(userExpanded(t.events)).toEqual([expect.objectContaining({ rows: [k('S0.0')], expanded: false })]);
    expect(t.said()).toEqual(['Patient 0.0 collapsed']);
    expect(t.g.kernel.selection.keys.size).toBe(0);
    expect(t.g.kernel.expansion.has(k('S0.0'))).toBe(false);
    // Its visits gone, the focus went to the parent as any collapse does (the data's move), not the pointer's.
    expect(document.activeElement === before || t.where() === 'S0.0/n').toBe(true);
    // The visits under the view's top are gone: Patient 0.0, their nearest shown ancestor, just under
    // Service 0's copy (WCAG 2.4.11): the view at 0, not at its own place 32 under the copy.
    expect(t.top()).toBe(0);
    // Service 0 itself at the top: nothing pinned.
    expect(t.copies()).toEqual([]);
  });

  it('elsewhere it focuses the real row, same column, and scrolls it just under its own ancestors; no selection, no row click', () => {
    const t = make({ settings: { selection: { mode: 'multi', checkbox: true, click: true } } });
    t.scroll(2 * 32 + 5);
    click(t.copy('Patient 0.0').querySelector<HTMLElement>('.dzg-cell[data-col="n"]')!);
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: k('S0.0'), column: 'n' });
    expect(t.where()).toBe('S0.0/n');
    expect(t.active().closest('.dzg-layer')).not.toBeNull();
    // Patient 0.0 at 32 px, one ancestor above it: scrolled to 0.
    expect(t.top()).toBe(0);
    expect(t.g.kernel.selection.keys.size).toBe(0);
    expect(t.events.filter((e) => e.type === 'rowClicked' || e.type === 'cellClicked')).toEqual([]);
    expect(t.g.kernel.query.sort).toEqual([]);
  });

  it('a deeper one: Patient 2.3 clicked from its copy lands one row under Service 2', () => {
    const t = make();
    // Patient 2.3: index 62 + 1 + 3 × 5 = 78; inside its visits.
    t.scroll(80 * 32 + 4);
    expect(t.copies().map((c) => c[0])).toEqual(['Service 2', 'Patient 2.3']);
    click(t.copy('Patient 2.3').querySelector<HTMLElement>('.dzg-cell[data-col="t"]')!);
    expect(t.where()).toBe('S2.3/t');
    expect(t.top()).toBe(78 * 32 - 32);
  });

  it('its selection box does nothing', () => {
    const t = make({ settings: { selection: { mode: 'multi', checkbox: true, click: true } } });
    t.focus('S0.0.3');
    t.scroll(2 * 32 + 5);
    const focus = t.g.kernel.focus;
    click(t.copy('Patient 0.0').querySelector<HTMLElement>('.dzg-check')!);
    expect(t.g.kernel.selection.keys.size).toBe(0);
    expect(t.g.kernel.focus).toEqual(focus);
    expect(t.g.kernel.expansion.has(k('S0.0'))).toBe(true);
  });

  it('the pointer going down on a copy never takes the DOM focus (its default prevented)', () => {
    const t = make();
    t.scroll(2 * 32 + 5);
    const cell = t.copy('Service 0').querySelector<HTMLElement>('.dzg-cell[data-col="n"]')!;
    const down = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    const mouse = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    cell.dispatchEvent(down);
    cell.dispatchEvent(mouse);
    expect(down.defaultPrevented).toBe(true);
    expect(mouse.defaultPrevented).toBe(true);
  });

  it('copies of a selected row show it selected (the look), and stay out of the selection’s handlers', () => {
    const t = make({ settings: { selection: { mode: 'multi', checkbox: true } } });
    t.g.kernel.dispatch({ type: 'selection.toggle', row: k('S0.0') }, 'user');
    t.scroll(2 * 32 + 5);
    expect(t.copy('Patient 0.0').getAttribute('aria-selected')).toBe('true');
    expect(t.copy('Service 0').getAttribute('aria-selected')).toBe('false');
  });
});

describe('the focus kept clear of the copies (WCAG 2.4.11)', () => {
  it('Up onto a row under the copies scrolls it just under its ancestors', () => {
    const t = make();
    t.scroll(2 * 32 + 5);
    t.focus('S0.0.3', 'n');
    expect(t.top()).toBe(69);
    t.press('ArrowUp');
    expect(t.where()).toBe('S0.0.2/n');
    // Visit 0.0.2 at 128, two ancestors: 128 − 64.
    expect(t.top()).toBe(64);
    const stack = Math.max(...t.copyEls().map((r) => parseFloat(r.style.getPropertyValue('inset-block-start')) + 32));
    expect(128 - t.top()).toBeGreaterThanOrEqual(stack);
  });

  it('Left from a visit goes to its patient, pinned before: the patient comes out from under the copies', () => {
    const t = make();
    t.scroll(4 * 32);
    t.focus('S0.0.3');
    // Visit 0.0.3 at 160, under Patient 0.0's copy pushed to 32–64 by Patient 0.1: brought to 160 − 64.
    expect(t.top()).toBe(96);
    t.press('ArrowLeft');
    expect(t.where()).toBe('S0.0/name');
    expect(t.top()).toBe(0);
  });

  it('the API brings a row above the view to just under its ancestors', () => {
    const t = make();
    t.scroll(20 * 32);
    t.g.api.ensureVisible(k('S0.2.1'));
    // Visit 0.2.1: index 1 + 2 × 5 + 2 = 13, two ancestors.
    expect(t.top()).toBe(13 * 32 - 64);
  });

  it('a closing by the API that hides the top row: its parent comes just under its own ancestors', () => {
    const t = make();
    // Visit 0.2.1 (index 13) at the top; Patient 0.2 (index 11) pinned with Service 0.
    t.scroll(13 * 32);
    t.expand(['S0.2'], false);
    // Patient 0.2 at 11 × 32, one ancestor above it: one row of room, not under Service 0's copy.
    expect(t.top()).toBe(11 * 32 - 32);
  });

  it('the room is the ancestors’ own heights when a feature makes rows of different heights', () => {
    // Services 50 px tall, the others 32 (step 9's variable heights).
    const tall: GridFeature = {
      id: 'tall',
      setup(g) {
        g.layoutFor = (d, h) => variableRowLayout(d, h, Float64Array.from({ length: d.count }, (_, i) => (/^S\d$/.test(idOf(d.keyAt(i as never))!) ? 50 : h)));
        return { destroy() {} };
      },
    };
    const t = make({ features: [tall] });
    t.scroll(400);
    // Visit 0.0.1 (index 3), level 2: Patient 0.0 (32) and Service 0 (50) over it.
    expect(t.ctx.insetFor!(3)).toBe(82);
    expect(t.ctx.insetFor!(1)).toBe(50);
    expect(t.ctx.insetFor!(0)).toBe(0);
  });
});
