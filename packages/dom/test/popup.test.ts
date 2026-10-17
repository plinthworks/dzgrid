import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { PopupHost } from '../src/popup.js';
import { Scope } from '../src/render/scope.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; n: number };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; vi.restoreAllMocks(); });

function host() {
  const root = document.createElement('div');
  root.className = 'dzg';
  const anchor = document.createElement('button');
  document.body.append(root, anchor);
  const scope = new Scope();
  return { root, anchor, scope, popups: new PopupHost(document, root, scope, () => 'ltr') };
}

describe('the popup host', () => {
  it('opens in the top layer when the browser has it, fixed in the grid otherwise', () => {
    const show = vi.fn();
    const proto = HTMLElement.prototype as unknown as { showPopover?: () => void; hidePopover?: () => void };
    const had = 'showPopover' in proto;
    proto.showPopover = show;
    proto.hidePopover = vi.fn();
    const a = host();
    const content = document.createElement('div');
    const ref = a.popups.open(a.anchor, content, { placement: 'block-end' });
    expect(show).toHaveBeenCalled();
    expect(ref.el.getAttribute('popover')).toBe('manual');
    ref.close();
    if (!had) { delete proto.showPopover; delete proto.hidePopover; }
    const b = host();
    const ref2 = b.popups.open(b.anchor, document.createElement('div'), { placement: 'block-end' });
    expect(ref2.el.hasAttribute('popover')).toBe(false);
    expect(ref2.el.parentElement).toBe(b.root);
    expect(ref2.el.dataset['dzgOwner']).toBe('popup');
  });

  it('closes on Escape and gives focus back to its anchor', () => {
    const a = host();
    const content = document.createElement('div');
    const input = document.createElement('input');
    content.append(input);
    a.anchor.focus();
    const onClose = vi.fn();
    const ref = a.popups.open(a.anchor, content, { placement: 'block-end', modal: true, onClose });
    expect(document.activeElement).toBe(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(ref.open).toBe(false);
    expect(onClose).toHaveBeenCalled();
    expect(document.activeElement).toBe(a.anchor);
  });

  it('keeps Tab inside a modal popup', () => {
    const a = host();
    const content = document.createElement('div');
    const first = document.createElement('input');
    const last = document.createElement('button');
    content.append(first, last);
    a.popups.open(a.anchor, content, { placement: 'block-end', modal: true });
    last.focus();
    const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it('closes a non-modal popup on a pointer down outside it, and all on dispose', () => {
    const a = host();
    const ref = a.popups.open(a.anchor, document.createElement('div'), { placement: 'block-end' });
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(ref.open).toBe(false);
    const ref2 = a.popups.open(a.anchor, document.createElement('div'), { placement: 'block-end' });
    a.scope.dispose();
    expect(ref2.open).toBe(false);
    expect(ref2.el.isConnected).toBe(false);
  });
});

describe('text zoom', () => {
  it('scales the row height with the root font size', () => {
    const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0, remPx: 20 };
    const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: () => {}, writeScrollInline: () => {} };
    const h = document.createElement('div');
    document.body.append(h);
    const columns: ColumnDef<R, any>[] = [{ id: 'n', type: 'number' }];
    const g = createGrid<R>(h, { rows: [{ id: 'a', n: 1 }], getRowId: (r) => r.id, columns, messages: EN }, { geometry, sync: true });
    grids.push(g);
    expect(h.querySelector<HTMLElement>('.dzg-layer > .dzg-row')!.style.blockSize).toBe('40px');
    expect(h.querySelector<HTMLElement>('.dzg')!.style.getPropertyValue('--dzg-row-height')).toBe('40px');
  });
});
