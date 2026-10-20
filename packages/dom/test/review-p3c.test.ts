import { describe, it, expect, afterEach, vi } from 'vitest';
import { dataKey, type ColumnDef, type GridEvent } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import { domGeometry, type Geometry, type ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import type { GridFeature } from '../src/features.js';
import { definePart, type SlotContext } from '../src/part.js';
import { PopupHost } from '../src/popup.js';
import { Scope } from '../src/render/scope.js';
import { Tooltip } from '../src/render/tooltip.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; n: number; s: string };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; vi.restoreAllMocks(); vi.useRealTimers(); });

function make(settings: Partial<GridSettings<R>> = {}, n = 10, parent: HTMLElement = document.body) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  parent.append(host);
  const events: GridEvent<R>[] = [];
  const columns: ColumnDef<R, any>[] = [{ id: 'n', type: 'number' }, { id: 's', ui: { cell: 'statusBadge' } }];
  const g = createGrid<R>(host, { rows: Array.from({ length: n }, (_, i) => ({ id: `r${i}`, n: i, s: i % 2 ? 'odd' : 'even' })), getRowId: (r) => r.id, columns, messages: EN, onEvent: (e) => events.push(e), ...settings }, { geometry, sync: true });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const scroll = (top: number) => { box.scrollTop = top; vp.dispatchEvent(new Event('scroll')); };
  return { g, host, events, box, vp, scroll };
}
const cellAt = (host: HTMLElement, row: number, col: string) => host.querySelector<HTMLElement>(`.dzg-row[aria-rowindex="${row}"] [data-col="${col}"]`)!;
const key = (el: Element, k: string, m: KeyboardEventInit = {}) => { const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...m }); el.dispatchEvent(e); return e; };

function tagged(tag: string) {
  const calls = { mount: 0, destroy: 0 };
  const part = definePart('cell', {
    mount(h, c: SlotContext['cell']) {
      calls.mount++;
      const b = document.createElement('i');
      b.className = tag;
      b.textContent = c.text;
      h.append(b);
      return { update(x) { b.textContent = x.text; }, destroy() { calls.destroy++; } };
    },
  });
  return { calls, part };
}

describe('update(): the selection mode, narrowed live', () => {
  it('clears everything when the mode goes to none', () => {
    const { g } = make({ selection: { mode: 'multi' } });
    g.kernel.dispatch({ type: 'selection.toggle', row: dataKey('r1')! }, 'user');
    g.update({ selection: { mode: 'none' } });
    expect(g.kernel.selection.keys.size).toBe(0);
  });

  it('clears an everything-except selection when the mode goes to single', () => {
    const { g } = make({ selection: { mode: 'multi' } });
    g.kernel.dispatch({ type: 'selection.set', selection: { mode: 'exclude', keys: new Set() } }, 'host');
    g.update({ selection: { mode: 'single' } });
    expect(g.kernel.selection.mode).toBe('include');
  });

  it('keeps one selected row when the mode goes from multi to single', () => {
    const { g } = make({ selection: { mode: 'multi' } });
    g.kernel.dispatch({ type: 'selection.toggle', row: dataKey('r1')! }, 'user');
    g.update({ selection: { mode: 'single' } });
    expect([...g.kernel.selection.keys]).toEqual([dataKey('r1')]);
  });
});

describe('update(): the rest of a patch with a refused setting', () => {
  it('applies the live settings of the same patch', () => {
    const { g, host } = make();
    g.update({ getRowId: (r) => r.s, rows: [{ id: 'x', n: 7, s: 'q' }] });
    expect(cellAt(host, 2, 'n').textContent).toBe('7');
  });

  it('refuses new features live, and says where', () => {
    const { g, events } = make();
    const f: GridFeature = { id: 'late', setup: () => ({ destroy() {} }) };
    g.update({ features: [f] });
    expect(events.some((e) => e.type === 'problems' && e.problems.some((p) => p.code === 'unsupported-live-change' && p.path === 'settings.features'))).toBe(true);
  });
});

describe('update(): the language reaches the row model', () => {
  it('sorts again by the new locale', () => {
    const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
    const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: () => {}, writeScrollInline: () => {} };
    const host = document.createElement('div');
    document.body.append(host);
    type T = { id: string; w: string };
    const g = createGrid<T>(host, { rows: [{ id: 'a', w: 'ä' }, { id: 'z', w: 'z' }], getRowId: (r) => r.id, columns: [{ id: 'w' }], messages: EN, locale: 'de-DE' }, { geometry, sync: true });
    grids.push(g as never);
    g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'w', dir: 'asc' }] }, 'user');
    expect(cellAt(host, 2, 'w').textContent).toBe('ä');
    g.update({ locale: 'sv-SE' });
    // Swedish puts ä after z.
    expect(cellAt(host, 2, 'w').textContent).toBe('z');
  });
});

describe('parts, the registry changed live', () => {
  it('swaps a part for another, then back to the plain text', () => {
    const a = tagged('pa');
    const b = tagged('pb');
    const { g, host } = make({ parts: { statusBadge: a.part } }, 3);
    expect(cellAt(host, 2, 's').querySelector('.pa')).not.toBeNull();
    g.update({ parts: { statusBadge: b.part } });
    expect(cellAt(host, 2, 's').querySelector('.pa')).toBeNull();
    expect(cellAt(host, 2, 's').querySelector('.pb')!.textContent).toBe('even');
    expect(a.calls.destroy).toBe(a.calls.mount);
    g.update({ parts: {} });
    expect(b.calls.destroy).toBe(b.calls.mount);
    expect(cellAt(host, 2, 's').children.length).toBe(0);
    expect(cellAt(host, 2, 's').textContent).toBe('even');
  });
});

describe('parts, the context they get', () => {
  it('gives the coerced value, the row key, the column and the language', () => {
    const seen: SlotContext['cell'][] = [];
    const part = definePart('cell', { mount(h, c) { seen.push(c); return { update(c2) { seen.push(c2); } }; } });
    make({ parts: { 'cell.number': part }, locale: 'fr-FR', direction: 'rtl' }, 2);
    const c = seen.find((x) => x.key === dataKey('r1'))!;
    expect(c.value).toBe(1);
    expect(c.text).toBe('1');
    expect(c.column.id).toBe('n');
    expect((c.row as R).id).toBe('r1');
    expect(c.ctx.locale).toBe('fr-FR');
    expect(c.dir).toBe('rtl');
  });
});

describe('parts that throw', () => {
  it('does not mount a broken part again on every paint, only when its row changes', () => {
    const reportError = vi.fn();
    (window as unknown as { reportError: unknown }).reportError = reportError;
    let mounts = 0;
    const broken = definePart('cell', { mount() { mounts++; throw new Error('bug'); } });
    const { g } = make({ parts: { statusBadge: broken } }, 3);
    const first = mounts;
    expect(first).toBe(3);
    for (let i = 0; i < 3; i++) g.api.refresh();
    expect(mounts).toBe(first);
    expect(reportError).toHaveBeenCalledTimes(first);
    // New data for the same rows: one more try each.
    g.update({ rows: Array.from({ length: 3 }, (_, i) => ({ id: `r${i}`, n: i + 10, s: 'new' })) });
    expect(mounts).toBe(first * 2);
  });

  it('survives a part whose destroy throws, at the grid’s end and when its column leaves', () => {
    const part = definePart('cell', { mount(h) { h.append(document.createElement('b')); return { destroy() { throw new Error('cleanup bug'); } }; } });
    const { g, host } = make({ parts: { statusBadge: part } }, 3);
    expect(() => g.update({ parts: {} })).not.toThrow();
    expect(cellAt(host, 2, 's').textContent).toBe('even');
    g.update({ parts: { statusBadge: part } });
    expect(() => g.destroy()).not.toThrow();
    grids = [];
    expect(host.querySelector('.dzg-row')).toBeNull();
  });
});

describe('key owners, more', () => {
  it('a focusable span a part draws owns its keys (tabindex, not only buttons)', () => {
    const part = definePart('cell', { mount(h) { const s = document.createElement('span'); s.tabIndex = 0; s.className = 'chip'; h.append(s); return {}; } });
    const { g, host } = make({ parts: { statusBadge: part } }, 5);
    g.api.focusCell(dataKey('r1')!, 's');
    const chip = cellAt(host, 3, 's').querySelector<HTMLElement>('.chip')!;
    chip.focus();
    const e = key(chip, 'ArrowLeft');
    expect(e.defaultPrevented).toBe(false);
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: dataKey('r1'), column: 's' });
  });

  it('a grid inside a marked popup (a grid in a popup) still owns its keys', () => {
    const outer = document.createElement('div');
    outer.dataset['dzgOwner'] = 'popup';
    document.body.append(outer);
    const { g, host } = make({}, 5, outer);
    g.api.focusCell(dataKey('r1')!, 'n');
    const e = key(cellAt(host, 3, 'n'), 'ArrowDown');
    expect(e.defaultPrevented).toBe(true);
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: dataKey('r2'), column: 'n' });
  });

  it('a marked part control in a column header does not sort when clicked', () => {
    const { g, host } = make();
    const head = host.querySelector<HTMLElement>('.dzg-hcell[data-col="n"]')!;
    const menu = document.createElement('div');
    menu.dataset['dzgOwner'] = 'popup';
    const inner = document.createElement('span');
    menu.append(inner);
    head.append(menu);
    inner.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(g.kernel.query.sort).toEqual([]);
  });
});

describe('row clicks', () => {
  it('says a row was clicked on its selection box, without a cell', () => {
    const { host, events } = make({ selection: { mode: 'multi', checkbox: true } }, 3);
    host.querySelector<HTMLElement>('.dzg-row[aria-rowindex="2"] .dzg-check')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(events.filter((e) => e.type === 'rowClicked')).toMatchObject([{ row: { key: dataKey('r0') } }]);
    expect(events.filter((e) => e.type === 'cellClicked')).toEqual([]);
  });
});

describe('text zoom, live', () => {
  it('follows a root font size changed after creation', () => {
    const { g, host, box } = make({}, 2);
    expect(host.querySelector<HTMLElement>('.dzg-layer > .dzg-row')!.style.blockSize).toBe('32px');
    box.remPx = 20;
    g.api.refresh();
    expect(host.querySelector<HTMLElement>('.dzg-layer > .dzg-row')!.style.blockSize).toBe('40px');
  });

  it('rounds to whole pixels', () => {
    const { g, host, box } = make({ density: 'compact' }, 2);
    box.remPx = 17;
    g.api.refresh();
    expect(host.querySelector<HTMLElement>('.dzg-layer > .dzg-row')!.style.blockSize).toBe('30px');
  });

  it('reads 16 from the DOM when the root font size is unknown', () => {
    const vp = document.createElement('div');
    document.body.append(vp);
    expect(domGeometry(vp, document.createElement('div'), () => 'ltr').read().remPx).toBe(16);
  });
});

function popupHost(dir: 'ltr' | 'rtl' = 'ltr') {
  const root = document.createElement('div');
  const anchor = document.createElement('button');
  document.body.append(root, anchor);
  const scope = new Scope();
  return { root, anchor, scope, popups: new PopupHost(document, root, scope, () => dir) };
}
function rects(anchor: DOMRectInit, box: { width: number; height: number }) {
  const real = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.tagName === 'BUTTON') return DOMRect.fromRect(anchor);
    if (this.classList.contains('dzg-popup')) return DOMRect.fromRect(box);
    return real.call(this);
  });
}

describe('the popup host, more', () => {
  it('stays open on a pointer down on its anchor (the anchor toggles it)', () => {
    const a = popupHost();
    const ref = a.popups.open(a.anchor, document.createElement('div'), { placement: 'block-end' });
    a.anchor.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(ref.open).toBe(true);
  });

  it('closes a modal popup on a pointer down outside (owner Q4, step 18), not on its anchor', () => {
    const a = popupHost();
    const c = document.createElement('div');
    c.append(document.createElement('input'));
    const ref = a.popups.open(a.anchor, c, { placement: 'block-end', modal: true, label: 'Filter' });
    a.anchor.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(ref.open).toBe(true);
    expect(ref.el.getAttribute('role')).toBe('dialog');
    expect(ref.el.getAttribute('aria-modal')).toBe('true');
    expect(ref.el.getAttribute('aria-label')).toBe('Filter');
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(ref.open).toBe(false);
  });

  it('wraps Shift+Tab from the first control to the last', () => {
    const a = popupHost();
    const c = document.createElement('div');
    const first = document.createElement('input');
    const last = document.createElement('button');
    c.append(first, last);
    a.popups.open(a.anchor, c, { placement: 'block-end', modal: true });
    expect(document.activeElement).toBe(first);
    const e = key(first, 'Tab', { shiftKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('keeps its Escape to itself: a host dialog around the grid does not close too', () => {
    const a = popupHost();
    const c = document.createElement('div');
    c.append(document.createElement('input'));
    const outer = vi.fn();
    document.addEventListener('keydown', outer);
    a.popups.open(a.anchor, c, { placement: 'block-end', modal: true });
    key(document.activeElement!, 'Escape');
    document.removeEventListener('keydown', outer);
    expect(outer).not.toHaveBeenCalled();
  });

  it('gives focus back to the anchor when a modal popup closes, even with focus elsewhere', () => {
    const a = popupHost();
    const c = document.createElement('div');
    c.append(document.createElement('input'));
    const other = document.createElement('input');
    document.body.append(other);
    const ref = a.popups.open(a.anchor, c, { placement: 'block-end', modal: true });
    other.focus();
    ref.close();
    expect(document.activeElement).toBe(a.anchor);
  });

  it('opens above its anchor when there is no room below', () => {
    rects({ x: 100, y: 700, width: 100, height: 20 }, { width: 50, height: 100 });
    const a = popupHost();
    const ref = a.popups.open(a.anchor, document.createElement('div'), { placement: 'block-end' });
    expect(window.innerHeight).toBe(768);
    expect(ref.el.style.getPropertyValue('inset-block-start')).toBe('598px');
    expect(ref.el.style.getPropertyValue('inset-inline-start')).toBe('100px');
  });

  it('aligns to the anchor’s start edge in right-to-left', () => {
    rects({ x: 100, y: 10, width: 100, height: 20 }, { width: 50, height: 100 });
    const a = popupHost('rtl');
    const ref = a.popups.open(a.anchor, document.createElement('div'), { placement: 'block-end' });
    expect(ref.el.style.getPropertyValue('inset-block-start')).toBe('32px');
    expect(ref.el.style.getPropertyValue('inset-inline-start')).toBe(`${1024 - 200}px`);
  });

  it('opens beside the anchor toward the end of the line (a submenu)', () => {
    rects({ x: 100, y: 10, width: 100, height: 20 }, { width: 50, height: 100 });
    const a = popupHost();
    const ref = a.popups.open(a.anchor, document.createElement('div'), { placement: 'inline-end' });
    expect(ref.el.style.getPropertyValue('inset-inline-start')).toBe('200px');
    expect(ref.el.style.getPropertyValue('inset-block-start')).toBe('10px');
  });
});

describe('the tooltip in the top layer', () => {
  it('leaves the top layer when hidden', () => {
    const proto = HTMLElement.prototype as unknown as { showPopover?: () => void; hidePopover?: () => void };
    const had = 'showPopover' in proto;
    const hide = vi.fn();
    proto.showPopover = vi.fn();
    proto.hidePopover = hide;
    try {
      const el = document.createElement('div');
      el.id = 'tip';
      const anchor = document.createElement('span');
      document.body.append(el, anchor);
      const tip = new Tooltip(el, new Scope());
      tip.showFor(anchor, { text: 'Hello' } as never, 'ltr', 0);
      expect(el.getAttribute('popover')).toBe('manual');
      tip.hide();
      expect(hide).toHaveBeenCalled();
    } finally {
      if (!had) { delete proto.showPopover; delete proto.hidePopover; }
    }
  });
});
