import { describe, it, expect, afterEach } from 'vitest';
import { type ColumnDef, type GridEvent } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { definePart } from '../src/part.js';
import { PopupHost, popupsFor } from '../src/popup.js';
import type { GridContext } from '../src/context.js';
import { Scope } from '../src/render/scope.js';
import { LAYOUT_CSS } from '../src/styles.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; n: number; s: string };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

function make(settings: Partial<GridSettings<R>> = {}, n = 400) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0, remPx: 16 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const columns: ColumnDef<R, any>[] = [{ id: 'n', type: 'number' }, { id: 's', ui: { cell: 'nope' } }];
  const g = createGrid<R>(host, { rows: Array.from({ length: n }, (_, i) => ({ id: `r${i}`, n: i, s: 'x' })), getRowId: (r) => r.id, columns, messages: EN, onEvent: (e) => events.push(e), ...settings }, { geometry, sync: true });
  grids.push(g);
  return { g, host, events, box, vp: host.querySelector<HTMLElement>('.dzg-viewport')! };
}

describe('steps 0.4-0.8 review', () => {
  it('tells an unknown part once, not at every resize', () => {
    const { g, events } = make();
    for (const w of [120, 140, 160]) g.kernel.dispatch({ type: 'column.resize', column: 'n', width: w, finished: true }, 'user');
    const told = events.filter((e) => e.type === 'problems' && e.problems.some((p) => p.code === 'unknown-part'));
    expect(told.length).toBe(1);
  });

  it('keeps the row at the top of the view when the text size changes', () => {
    const { g, box, vp } = make({ columns: [{ id: 'n', type: 'number' }] });
    (g as unknown as { scroll: { scrollTo(l: number): void } }).scroll.scrollTo(100 * 32 + 8);
    box.remPx = 20;
    g.api.refresh();
    expect((g as unknown as { scroll: { logicalTop: number } }).scroll.logicalTop).toBe(100 * 40 + 10);
  });

  it('resets the browser’s popover look: no border, padding or colours of its own', () => {
    const rule = LAYOUT_CSS.split('\n').find((l) => l.includes('[popover]'))!;
    for (const d of ['border: 0', 'padding: 0', 'background: transparent', 'color: inherit']) expect(rule).toContain(d);
  });

  it('refreshes cell parts when only the messages change', () => {
    const fr = { locale: 'en', text: { ...EN.text, 'grid.label': 'Other label' } };
    const part = definePart('cell', { mount(h, c) { h.textContent = c.msg('grid.label'); return { update(n) { h.textContent = n.msg('grid.label'); } }; } });
    const { g, host } = make({ parts: { 'cell.text': part }, columns: [{ id: 's' }] }, 3);
    expect(host.querySelector('.dzg-layer [data-col="s"]')!.textContent).toBe(EN.text['grid.label']);
    g.update({ messages: fr as typeof EN });
    expect(host.querySelector('.dzg-layer [data-col="s"]')!.textContent).toBe('Other label');
  });
});

describe('popups, more', () => {
  it('stays open on a press inside it when the grid lives in a shadow root', () => {
    const shadowHost = document.createElement('div');
    document.body.append(shadowHost);
    const shadow = shadowHost.attachShadow({ mode: 'open' });
    const root = document.createElement('div');
    const anchor = document.createElement('button');
    shadow.append(root, anchor);
    const popups = new PopupHost(document, root, new Scope(), () => 'ltr');
    const content = document.createElement('div');
    const control = document.createElement('button');
    content.append(control);
    const ref = popups.open(anchor, content, { placement: 'block-end' });
    control.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    expect(ref.open).toBe(true);
    anchor.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    expect(ref.open).toBe(true);
  });

  it('closes when its anchor leaves the page, and keeps the focus in the grid', async () => {
    const { g, host } = make({ columns: [{ id: 'n', type: 'number' }, { id: 's' }] }, 5);
    const anchor = host.querySelector<HTMLElement>('.dzg-hcell[data-col="s"]')!;
    const popups = popupsFor((g as unknown as { context: GridContext<unknown> }).context);
    const content = document.createElement('div');
    const input = document.createElement('input');
    content.append(input);
    const ref = popups.open(anchor, content, { placement: 'block-end', modal: true });
    expect(document.activeElement).toBe(input);
    g.kernel.dispatch({ type: 'column.state', patch: [{ id: 's', hidden: true }] }, 'user');
    // Closed when the page says the anchor left (a mutation record, delivered after the paint).
    await Promise.resolve();
    expect(ref.open).toBe(false);
    expect(host.querySelector('.dzg-viewport')!.contains(document.activeElement)).toBe(true);
  });
});
