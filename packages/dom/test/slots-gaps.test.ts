// Coverage review of step 11: what the author's tests and mutants left open.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { dataKey, type ColumnDef, type GridEvent } from '@dzgrid/core';
import { sourceRows, type DataRequest, type DataSource } from '@dzgrid/core/server';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridContext } from '../src/context.js';
import { definePart, type SlotContext } from '../src/part.js';
import { slots } from '../src/slots.js';
import { LAYOUT_CSS } from '../src/styles.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';

type R = { id: string; n: number; s: string };
let grids: GridInstance<R, any>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; vi.useRealTimers(); vi.restoreAllMocks(); });

function counted<S extends 'header' | 'tooltip' | 'overlay'>(slot: S, tag: string) {
  const calls = { mount: 0, update: 0, destroy: 0, all: [] as SlotContext[S][] };
  const part = definePart(slot, {
    mount(host: HTMLElement, c: SlotContext[S]) {
      calls.mount++;
      calls.all.push(c);
      const i = document.createElement('i');
      i.className = `p-${tag}`;
      i.textContent = tag;
      host.append(i);
      return { update(n: SlotContext[S]) { calls.update++; calls.all.push(n); }, destroy() { calls.destroy++; } };
    },
  } as never);
  return { calls, part, last: () => calls.all.at(-1)! };
}

function make(settings: Record<string, unknown> = {}, columns?: ColumnDef<R, any>[]) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const cols: ColumnDef<R, any>[] = columns ?? [
    { id: 'n', header: 'N', type: 'number', headerTooltip: 'How many', tooltip: (v: number | null) => (v === null ? null : `Value ${v}`) },
    { id: 's', header: 'S', headerTooltip: 'Status' },
  ];
  const g = createGrid<R>(host, { rows: Array.from({ length: 200 }, (_, i) => ({ id: `r${i}`, n: i, s: `s${i}` })), getRowId: (r: R) => r.id, columns: cols, messages: EN, features: [slots()], onEvent: (e: GridEvent<R>) => events.push(e), ...settings } as never, { geometry, sync: true });
  grids.push(g);
  const ctx = (g as unknown as { context: GridContext<R> }).context;
  const head = (c: string) => host.querySelector<HTMLElement>(`.dzg-header .dzg-hcell[data-col="${c}"]`)!;
  const label = (c: string) => head(c).querySelector<HTMLElement>('.dzg-hlabel')!;
  const cell = (row: number, c: string) => host.querySelector<HTMLElement>(`.dzg-row[aria-rowindex="${row + 2}"] [data-col="${c}"]`)!;
  const over = (el: HTMLElement) => el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
  const tip = host.querySelector<HTMLElement>('.dzg-tooltip')!;
  const problems = () => events.flatMap((e) => (e.type === 'problems' ? e.problems : []));
  return { g, ctx, host, head, label, cell, over, tip, problems, events };
}

describe('resolution', () => {
  it('an unknown ui.header falls to header.<type> before the bare name', () => {
    const typed = counted('header', 'typed');
    const bare = counted('header', 'bare');
    const t = make({ parts: { 'header.number': typed.part, header: bare.part } }, [{ id: 'n', header: 'N', type: 'number', ui: { header: 'nope' } }, { id: 's', header: 'S' }]);
    expect(t.label('n').textContent).toBe('typed');
    expect(t.label('s').textContent).toBe('bare');
  });

  it('is done again when the columns change under the same registry', () => {
    const own = counted('header', 'own');
    const bare = counted('header', 'bare');
    const parts = { own: own.part, header: bare.part };
    const t = make({ parts });
    expect(t.label('n').textContent).toBe('bare');
    t.g.update({ columns: [{ id: 'n', header: 'N', type: 'number', ui: { header: 'own' } }, { id: 's', header: 'S' }] });
    expect(t.label('n').textContent).toBe('own');
    // The bare part there is gone for good; the new one mounted once.
    expect(own.calls.mount).toBe(1);
    expect(bare.calls.destroy).toBe(1);
  });

  it('a new part under the same name: the old one destroyed, the new one mounted, not updated', () => {
    const a = counted('header', 'a');
    const b = counted('header', 'b');
    const t = make({ parts: { header: a.part } });
    t.g.update({ parts: { header: b.part } });
    expect(a.calls.destroy).toBe(a.calls.mount);
    expect(a.calls.update).toBe(0);
    expect(b.calls.mount).toBe(2);
    expect(t.label('n').querySelectorAll('i')).toHaveLength(1);
    expect(t.label('n').textContent).toBe('b');
  });

  it('a header hidden and shown again: destroyed, then mounted afresh in the new cell', () => {
    const p = counted('header', 'h');
    const t = make({ parts: { header: p.part } });
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 's', hidden: true }] }, 'user');
    expect(p.calls.destroy).toBe(1);
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 's', hidden: false }] }, 'user');
    expect(p.calls.mount).toBe(3);
    expect(t.label('s').textContent).toBe('h');
  });

  it('a header pinned to the other side keeps its part: same cell, updated, not remounted', () => {
    const p = counted('header', 'h');
    const t = make({ parts: { header: p.part } });
    const before = t.label('s');
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 's', pinned: 'start' }] }, 'user');
    expect(t.label('s')).toBe(before);
    expect(p.calls.mount).toBe(2);
    expect(p.calls.destroy).toBe(0);
  });

  it('the overlay part sees a new bundle: updated with the new language', () => {
    const o = counted('overlay', 'o');
    const t = make({ rows: [], parts: { overlay: o.part } });
    expect(o.calls.mount).toBe(1);
    t.g.update({ messages: FR });
    expect(o.calls.update).toBe(1);
    expect(o.last().ctx.locale).toBe('fr');
  });

  it('an overlay part registered under another name, or a part named overlay of another slot, is not drawn', () => {
    const h = counted('header', 'notOverlay');
    const t = make({ rows: [], parts: { overlay: h.part } });
    expect(t.host.querySelector('.dzg-overlay')!.textContent).toBe(EN.text['grid.noRows']);
    // The header part named overlay is not a header part either (no bare 'header').
    expect(t.label('n').textContent).toBe('N');
  });
});

describe('tooltip parts against the grid changing under them', () => {
  it('a header tooltip part goes when its column is hidden', () => {
    vi.useFakeTimers();
    const p = counted('tooltip', 'tp');
    const t = make({ parts: { tooltip: p.part }, tooltips: { delayMs: 0 } });
    t.over(t.head('s'));
    expect(p.calls.mount).toBe(1);
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 's', hidden: true }] }, 'user');
    // The anchor has left the page; the tooltip still floats, its part live for a hidden column.
    expect(t.ctx.tip.anchor?.isConnected).not.toBe(false);
    expect(p.calls.destroy).toBe(1);
  });

  it('a cell tooltip part goes (or follows) when the anchor cell is rebound to another row by a sort', () => {
    vi.useFakeTimers();
    const p = counted('tooltip', 'tp');
    const t = make({ parts: { tooltip: p.part }, tooltips: { delayMs: 0 } });
    const anchor = t.cell(3, 'n');
    t.over(anchor);
    expect((p.last().row as R).id).toBe('r3');
    t.g.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    t.g.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    // The same pooled cell now shows r196; the tooltip still holds r3 and its text.
    expect(anchor.isConnected).toBe(true);
    expect(anchor.textContent).not.toBe('3');
    expect(t.tip.hidden || (p.last().row as R).id !== 'r3').toBe(true);
  });

  it('a tooltip part removed from the registry is not kept mounted', () => {
    vi.useFakeTimers();
    const p = counted('tooltip', 'tp');
    const t = make({ parts: { tooltip: p.part }, tooltips: { delayMs: 0 } });
    t.over(t.cell(3, 'n'));
    t.g.update({ parts: {} });
    expect(p.calls.destroy).toBe(1);
  });
});

// ---- the retry button under repeated errors and clicks ----
type S = { id: string; name: string };
function fake() {
  const calls: { req: DataRequest; ok(v: unknown): void; err(e: unknown): void }[] = [];
  const source: DataSource<S> = {
    fetch: (req) => ({ then(ok: (v: never) => void, err: (e: unknown) => void) { calls.push({ req, ok: ok as never, err }); } }) as never,
  };
  return { source, calls, fail: (e: unknown) => calls.at(-1)!.err(e), answer: (ids: string[]) => calls.at(-1)!.ok({ rows: ids.map((id) => ({ id, name: id })), total: ids.length }) };
}
function server(more: Record<string, unknown> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const f = fake();
  const geometry: Geometry = { read: () => ({ block: 400, inline: 600, scrollTop: 0, scrollInline: 0 }), writeScrollTop: () => {}, writeScrollInline: () => {} };
  const g = createGrid<S>(host, { source: sourceRows(f.source), operations: 'server', getRowId: (r: S) => r.id, columns: [{ id: 'name' }], messages: EN, ...more } as never, { geometry, sync: true }) as GridInstance<S, any>;
  grids.push(g as never);
  const overlay = host.querySelector<HTMLElement>('.dzg-overlay')!;
  return { g, f, host, overlay, buttons: () => overlay.querySelectorAll<HTMLButtonElement>('button') };
}

describe('the retry button, repeated', () => {
  it('five errors, five clicks: one button made once, one fetch per click, the bundle followed', () => {
    const t = server();
    let first: HTMLButtonElement | null = null;
    for (let i = 0; i < 5; i++) {
      t.f.fail(new Error(`50${i}`));
      expect(t.buttons()).toHaveLength(1);
      const b = t.buttons()[0]!;
      first ??= b;
      expect(b).toBe(first);
      expect(t.overlay.firstChild!.textContent).toBe(EN.text['grid.error']);
      const before = t.f.calls.length;
      b.click();
      expect(t.f.calls.length).toBe(before + 1);
      // While it loads the button is out of the overlay.
      expect(t.buttons()).toHaveLength(0);
      // A click on the detached button is still a retry (it is only a stale reference); not asserted.
    }
    t.f.fail(new Error('x'));
    t.g.update({ messages: FR });
    expect(t.buttons()[0]!.textContent).toBe(FR.text['grid.retry']);
    expect(t.buttons()[0]).toBe(first);
    t.f.calls.at(-1);
    t.buttons()[0]!.click();
    t.f.answer(['a']);
    expect(t.overlay.hidden).toBe(true);
    expect(t.buttons()).toHaveLength(0);
  });

  it('a host error overlay on a client grid: one button, each click one refresh, and the overlay stays the host’s', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const geometry: Geometry = { read: () => ({ block: 400, inline: 600, scrollTop: 0, scrollInline: 0 }), writeScrollTop: () => {}, writeScrollInline: () => {} };
    const events: GridEvent<S>[] = [];
    const g = createGrid<S>(host, { rows: [{ id: 'a', name: 'a' }], getRowId: (r) => r.id, columns: [{ id: 'name' }], messages: EN, overlay: 'error', onEvent: (e) => events.push(e) }, { geometry, sync: true });
    grids.push(g as never);
    const overlay = host.querySelector<HTMLElement>('.dzg-overlay')!;
    const spy = vi.spyOn(g.kernel, 'dispatch');
    for (let i = 0; i < 3; i++) overlay.querySelector('button')!.click();
    expect(spy.mock.calls.filter(([c]) => c.type === 'rows.refresh')).toHaveLength(3);
    expect(overlay.querySelectorAll('button')).toHaveLength(1);
    g.update({ overlay: null });
    g.update({ overlay: 'error' });
    expect(overlay.querySelectorAll('button')).toHaveLength(1);
    overlay.querySelector('button')!.click();
    expect(spy.mock.calls.filter(([c]) => c.type === 'rows.refresh')).toHaveLength(4);
  });

  it('with an overlay part: the grid’s button never shows; a part that throws gives it back, and it works', () => {
    let fail = false;
    const part = definePart('overlay', { mount(host, c) { if (fail) throw new Error('x'); const b = document.createElement('button'); b.className = 'mine'; b.onclick = () => c.retry(); host.append(b); return { update() { if (fail) throw new Error('y'); } }; } });
    const reported: unknown[] = [];
    (window as unknown as { reportError: unknown }).reportError = (e: unknown) => { reported.push(e); };
    const t = server({ features: [slots()], parts: { overlay: part } });
    t.f.fail(new Error('500'));
    expect([...t.buttons()].map((b) => b.className)).toEqual(['mine']);
    const before = t.f.calls.length;
    t.buttons()[0]!.click();
    expect(t.f.calls.length).toBe(before + 1);
    fail = true;
    t.f.fail(new Error('501'));
    expect(reported).toHaveLength(1);
    expect([...t.buttons()].map((b) => b.className)).toEqual(['']);
    t.buttons()[0]!.click();
    expect(t.f.calls.length).toBe(before + 2);
  });
});

describe('the tooltip of a row scrolled away', () => {
  it('a scroll that recycles the rows hides the tooltip and destroys its part', () => {
    vi.useFakeTimers();
    const p = counted('tooltip', 'tp');
    const t = make({ parts: { tooltip: p.part }, tooltips: { delayMs: 0 } });
    t.over(t.cell(2, 'n'));
    expect(p.calls.mount).toBe(1);
    t.ctx.geometry.writeScrollTop(150 * 32);
    t.host.querySelector('.dzg-viewport')!.dispatchEvent(new Event('scroll'));
    expect(t.tip.hidden).toBe(true);
    expect(p.calls.destroy).toBe(1);
    expect(t.tip.childNodes).toHaveLength(0);
  });

  it('a header part shown, then the focused header keeps its cell out of the window: still one live part', () => {
    const p = counted('header', 'h');
    const many: ColumnDef<R, any>[] = Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, header: `C${i}`, width: 100, value: () => i }));
    const t = make({ parts: { header: p.part } }, many);
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 'c0' } } as never, 'user');
    t.ctx.geometry.writeScrollInline(3000);
    t.host.querySelector('.dzg-viewport')!.dispatchEvent(new Event('scroll'));
    const live = p.calls.mount - p.calls.destroy;
    expect(live).toBe(t.host.querySelectorAll('.dzg-header .p-h').length);
    void dataKey;
  });
});

describe('an overlay part takes pointer events on its own controls', () => {
  // The selectors of the layout rules that give pointer events back (the overlay itself has none).
  const auto = [...LAYOUT_CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, , body]) => /pointer-events:\s*auto/.test(body!)).map(([, sel]) => sel!.trim());
  it.each(['<a href="#x">help</a>', '<input>', '<select></select>', '<textarea></textarea>', '<details><summary>more</summary></details>', '<span role="button">go</span>', '<div tabindex="0">go</div>', '<p>Call <a href="#x">us</a></p>', '<button>b</button>'])('%s inside the overlay', (html) => {
    const overlay = document.createElement('div');
    overlay.className = 'dzg-overlay';
    overlay.innerHTML = html;
    document.body.append(overlay);
    const target = overlay.querySelector('a, input, select, textarea, summary, [role=button], [tabindex], button')!;
    // pointer-events is inherited: a rule on the control or on one of its ancestors inside the overlay.
    const reached = (el: Element | null): boolean => !!el && el !== overlay && (auto.some((s) => el.matches(s)) || reached(el.parentElement));
    expect(reached(target)).toBe(true);
    expect(auto.some((s) => overlay.matches(s))).toBe(false);
  });
});

describe('the grid’s own text tooltip against the grid changing under it (no slots)', () => {
  it('hides when its header leaves the page (the column hidden)', () => {
    vi.useFakeTimers();
    const t = make({ features: [], tooltips: { delayMs: 0 } });
    t.over(t.head('s'));
    expect(t.tip.hidden).toBe(false);
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 's', hidden: true }] }, 'user');
    expect(t.tip.hidden).toBe(true);
    expect(t.ctx.tip.anchor).toBeNull();
  });

  it('hides when its cell is rebound to another row by a sort, a filter or an update', () => {
    vi.useFakeTimers();
    const t = make({ features: [], tooltips: { delayMs: 0 } });
    t.over(t.cell(3, 'n'));
    expect(t.tip.textContent).toBe('Value 3');
    t.g.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    t.g.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    expect(t.tip.hidden).toBe(true);
    expect(t.cell(3, 'n').hasAttribute('aria-describedby')).toBe(false);
    t.over(t.cell(3, 'n'));
    expect(t.tip.hidden).toBe(false);
    // Its row given new data: the text would be stale.
    t.g.update({ rows: Array.from({ length: 200 }, (_, i) => ({ id: `r${i}`, n: i + 1000, s: `s${i}` })) });
    expect(t.tip.hidden).toBe(true);
  });

  it('a paint that changes nothing keeps it', () => {
    vi.useFakeTimers();
    const t = make({ features: [], tooltips: { delayMs: 0 } });
    t.over(t.cell(3, 'n'));
    t.g.update({ messages: FR });
    expect(t.tip.hidden).toBe(false);
    expect(t.tip.textContent).toBe('Value 3');
  });
});
