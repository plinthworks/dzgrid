// The fill handle (Phase 5 step 12, docs/behaviors/fill.md 11–14, 18–19; step12-plan.md D3, D4, tests 3; owner S12-Q3,
// S12-Q8 and the WCAG 2.5.7 no-drag control): where it is drawn and where not, what keeps it, its drag (a target
// outlined, one request at the release, Ctrl / Cmd at the release swaps, the block after, the focus kept), what cancels
// it, the click after it, the double click, pen and touch, and the click-then-click fill. Expectations by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, flush, fmake, key } from './support-fill.js';
import { R_ } from './support-range.js';
import { tree } from '../src/tree.js';
import { range } from '../src/range.js';
import { fill } from '../src/fill.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import { detail } from '../src/detail.js';
import { definePart } from '../src/part.js';
import { CCOLS } from './support-fill.js';

afterEach(cleanup);

const block = (t: ReturnType<typeof fmake>, a: [string, string], f: [string, string]) => expect(t.api().set(R_(a, f))).toBe(true);

describe('the handle: where it is drawn (fill.md 11, owner S12-Q8)', () => {
  it('on the focused data cell alone, Excel-like: one per grid, aria-hidden, empty, a child of the cell', () => {
    const t = fmake();
    t.at('r2', 'qty');
    expect(t.handleAt()).toBe('r2/qty');
    expect(t.handles()).toHaveLength(1);
    expect(t.handle()!.getAttribute('aria-hidden')).toBe('true');
    expect(t.handle()!.textContent).toBe('');
    expect(t.handle()!.hasAttribute('tabindex')).toBe(false);
    t.at('r5', 'name');
    expect(t.handleAt()).toBe('r5/name');
    expect(t.handles()).toHaveLength(1);
  });

  it('on a block: its last data row × its end column, whichever corner is the anchor', () => {
    const t = fmake();
    t.at('r1', 'name');
    block(t, ['r1', 'name'], ['r3', 'qty']);
    expect(t.handleAt()).toBe('r3/qty');
    block(t, ['r4', 'price'], ['r2', 'qty']);
    expect(t.handleAt()).toBe('r4/price');
  });

  it('right to left: on the same logical corner (fill.css puts it at the inline end, bottom-left on screen)', () => {
    const t = fmake({ lang: 'ar' });
    t.at('r1', 'name');
    block(t, ['r1', 'name'], ['r2', 'qty']);
    expect(t.handleAt()).toBe('r2/qty');
  });

  it('not on a read-only cell alone, nor on a block whose every column is read-only; on a block with an editable column', () => {
    const t = fmake();
    t.at('r2', 'ref');
    expect(t.handle()).toBeNull();
    block(t, ['r1', 'ref'], ['r3', 'ref']);
    expect(t.handle()).toBeNull();
    block(t, ['r1', 'code'], ['r3', 'ref']);
    expect(t.handleAt()).toBe('r3/ref');
  });

  it('not without edit(), not with { handle: false }, not without a focus', () => {
    const a = fmake({ noEdit: true });
    a.at('r2', 'qty');
    expect(a.handle()).toBeNull();
    const b = fmake({ fill: { handle: false } });
    b.at('r2', 'qty');
    expect(b.handle()).toBeNull();
    const c = fmake();
    expect(c.handle()).toBeNull();
  });

  it('not while a field is open; back when it closes', () => {
    const t = fmake({ editors: 'after' });
    t.at('r2', 'qty');
    t.press('F2');
    expect(t.field()).not.toBeNull();
    // Hidden at once by fill.css (`[data-dzg-editing] > .dzg-fill`), gone at the next paint.
    expect(t.cell('r2', 'qty')!.hasAttribute('data-dzg-editing')).toBe(true);
    t.g.api.refresh();
    expect(t.handle()).toBeNull();
    t.press('Escape', {}, t.field()!);
    expect(t.field()).toBeNull();
    expect(t.handleAt()).toBe('r2/qty');
  });

  it('not while a block is being dragged (data-dzg-ranging); back after the release', () => {
    const t = fmake();
    t.at('r1', 'qty');
    t.down(t.cell('r1', 'qty')!, t.pt('r1', 'qty'));
    t.move(t.pt('r3', 'qty'));
    expect(t.ctx.el.root.hasAttribute('data-dzg-ranging')).toBe(true);
    expect(t.handle()).toBeNull();
    t.up(t.pt('r3', 'qty'));
    expect(t.handleAt()).toBe('r3/qty');
  });

  it('in a start-pinned column: on the pinned cell itself (fill.css makes it the anchor; browser « two pinned columns »)', () => {
    const cols = (['name', 'qty'] as const);
    const t = fmake({ columns: undefined, settings: {} as never });
    t.g.update({ columns: (t.ctx.settings.columns as { id: string }[]).map((c) => (cols.includes(c.id as never) ? { ...c, pinned: 'start' } : c)) } as never);
    t.at('r2', 'qty');
    expect(t.handleAt()).toBe('r2/qty');
    expect(t.handle()!.closest('.dzg-seg-start')).not.toBeNull();
  });

  it('not on the tree\'s pinned copies (the base renderer\'s cell only)', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, name: `N${i}`, qty: i, price: 0, day: null, at: null, st: null, ok: null, code: null, ref: 'R', parent: i ? 'r0' : null }));
    const t = fmake({ rows: rows as never, block: 120, more: [EN_TREE], after: [tree({ parentId: (x: { parent: string | null }) => x.parent, sticky: 1 }) as never] });
    t.g.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'api');
    t.at('r0', 'qty');
    t.scroll(400);
    for (const r of t.ctx.rowRenderer.spawned) for (const [, v] of r.mounted) expect(v.el.querySelector('.dzg-fill')).toBeNull();
  });

  it('survives a repaint of its cell\'s value, a scroll and the rows pooled; never twice', () => {
    const t = fmake({ block: 120 });
    t.at('r2', 'qty');
    t.edits!.commit([{ key: key('r2'), column: 'qty', input: { value: 42 } }]);
    t.g.api.refresh();
    expect(t.value('r2', 'qty')).toContain('42');
    expect(t.handleAt()).toBe('r2/qty');
    t.scroll(30);
    t.scroll(0);
    expect(t.handleAt()).toBe('r2/qty');
    expect(t.handles()).toHaveLength(1);
  });

  it('never in the cell\'s text: a copy writes the value only, the cell\'s text is its value', () => {
    const t = fmake();
    t.at('r2', 'name');
    const text = t.cell('r2', 'name')!.textContent;
    expect(text).toBe('N2');
    const c = t.api().copy()!;
    expect(c.text.replace(/\r?\n$/, '')).toBe('N2');
    expect(c.html).not.toContain('dzg-fill');
  });

  it('fill(blocks) without that range feature on the grid: a missing-feature problem, nothing drawn', () => {
    const other = range();
    const t = fmake({ noFill: true, extra: [fill(other)] });
    t.at('r2', 'qty');
    expect(t.handle()).toBeNull();
    const ps = t.events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: { code: string }[] }).problems);
    expect(ps.map((p) => p.code)).toContain('missing-feature');
  });

  it('destroy: the handle, the target classes and the bulk seam gone', () => {
    const t = fmake();
    t.at('r2', 'qty');
    expect(t.handle()).not.toBeNull();
    expect(typeof t.ctx.bulk).toBe('function');
    t.g.destroy();
    expect(t.host.querySelector('.dzg-fill')).toBeNull();
    expect(t.ctx.bulk).toBeUndefined();
  });
});

describe('the drag (fill.md 13)', () => {
  it('down: the target outlined while dragging; one request at the release (the series), origin fill; the block source ∪ target; the focus kept; one sentence', async () => {
    const t = fmake();
    t.at('r1', 'qty');
    block(t, ['r1', 'qty'], ['r2', 'qty']);
    t.dragTo('r6', 'qty', { noUp: true });
    expect(t.target()).toEqual(['r3/qty', 'r4/qty', 'r5/qty', 'r6/qty']);
    expect(t.requests).toHaveLength(0);
    t.up(t.pt('r6', 'qty'));
    t.click(t.cell('r6', 'qty')!);
    await flush();
    expect(t.target()).toEqual([]);
    expect(t.requests).toHaveLength(1);
    expect(t.requests[0]!.origin).toBe('fill');
    expect(t.changes()).toEqual(['r3/qty=7', 'r4/qty=10', 'r5/qty=13', 'r6/qty=16']);
    expect(t.block()).toBe('r1/qty:r6/qty');
    expect(t.focusAt()).toBe('r1/qty');
    expect(t.said().filter((x) => /filled/i.test(x))).toEqual(['Cells filled: 4. Saving']);
    expect(t.handleAt()).toBe('r6/qty');
  });

  it('to the end and to the start of the row (logical), up: backwards', () => {
    const a = fmake();
    a.at('r2', 'qty');
    a.dragTo('r2', 'price');
    expect(a.changes()).toEqual(['r2/price=4']);
    const b = fmake();
    b.at('r4', 'qty');
    block(b, ['r4', 'qty'], ['r5', 'qty']);
    b.dragTo('r1', 'qty');
    // 5, 3 (a step of −2) filled up: 7, 9, 11 reading upward.
    expect(b.changes()).toEqual(['r1/qty=11', 'r2/qty=9', 'r3/qty=7']);
    const c = fmake({ lang: 'ar' });
    c.at('r2', 'price');
    c.dragTo('r2', 'qty');
    expect(c.changes()).toEqual(['r2/qty=2.5']);
  });

  it('Ctrl held at the release swaps (a copy of 1, 2); Cmd on a Mac too; Ctrl at the press only does not', () => {
    const a = fmake();
    a.at('r1', 'qty');
    block(a, ['r1', 'qty'], ['r2', 'qty']);
    a.dragTo('r5', 'qty', { ctrl: true });
    expect(a.changes()).toEqual(['r3/qty=1', 'r4/qty=4', 'r5/qty=1']);
    const b = fmake({ mac: true } as never);
    b.at('r1', 'qty');
    block(b, ['r1', 'qty'], ['r2', 'qty']);
    b.dragTo('r4', 'qty', { meta: true });
    expect(b.changes()).toEqual(['r3/qty=1', 'r4/qty=4']);
    const c = fmake();
    c.at('r1', 'qty');
    block(c, ['r1', 'qty'], ['r2', 'qty']);
    const h = c.handle()!;
    c.down(h, c.pt('r2', 'qty'), { ctrlKey: true });
    c.move(c.pt('r4', 'qty'), { ctrlKey: true });
    c.up(c.pt('r4', 'qty'));
    expect(c.changes()).toEqual(['r3/qty=7', 'r4/qty=10']);
  });

  it('the press on the handle keeps the block (the range never sees it) and selects no text', () => {
    const t = fmake();
    t.at('r1', 'qty');
    block(t, ['r1', 'qty'], ['r2', 'qty']);
    const p = t.down(t.handle()!, t.pt('r2', 'qty'));
    expect(p.defaultPrevented).toBe(true);
    expect(t.block()).toBe('r1/qty:r2/qty');
  });

  it('a block the application sets during the drag cancels it (review of the 2026-10-26 fix): nothing written, the application\'s block kept', () => {
    const t = fmake();
    t.at('r1', 'qty');
    t.down(t.handle()!, t.pt('r1', 'qty'));
    t.move(t.pt('r3', 'qty'));
    t.api().set(R_(['r5', 'qty'], ['r6', 'qty']));
    expect(t.target()).toEqual([]);
    t.up(t.pt('r3', 'qty'));
    expect(t.changes()).toEqual([]);
    expect(t.block()).toBe('r5/qty:r6/qty');
  });

  it('released inside the source (after leaving it): nothing written, nothing said', async () => {
    const t = fmake();
    t.at('r1', 'qty');
    block(t, ['r1', 'qty'], ['r2', 'qty']);
    t.down(t.handle()!, t.pt('r2', 'qty'));
    t.move(t.pt('r5', 'qty'));
    t.move(t.pt('r1', 'qty'));
    expect(t.target()).toEqual([]);
    t.up(t.pt('r1', 'qty'));
    await flush();
    expect(t.requests).toHaveLength(0);
    expect(t.said().filter((x) => /fill/i.test(x))).toEqual([]);
    expect(t.block()).toBe('r1/qty:r2/qty');
  });

  it('Escape during the drag: cancelled, said; the target gone; nothing written; the block kept', async () => {
    const t = fmake();
    t.at('r1', 'qty');
    block(t, ['r1', 'qty'], ['r2', 'qty']);
    t.dragTo('r5', 'qty', { noUp: true });
    t.press('Escape');
    expect(t.target()).toEqual([]);
    t.up(t.pt('r5', 'qty'));
    await flush();
    expect(t.requests).toHaveLength(0);
    expect(t.said()).toContain('Fill cancelled');
    expect(t.block()).toBe('r1/qty:r2/qty');
  });

  it('pointercancel, a lost capture, a blur, a sort during the drag: cancelled quietly, nothing written', async () => {
    for (const how of ['cancel', 'blur', 'sort', 'lost'] as const) {
      const t = fmake();
      t.at('r1', 'qty');
      block(t, ['r1', 'qty'], ['r2', 'qty']);
      t.dragTo('r5', 'qty', { noUp: true });
      if (how === 'cancel') document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1, pointerType: 'mouse' }));
      if (how === 'lost') t.ctx.el.body.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 1, pointerType: 'mouse' }));
      if (how === 'blur') window.dispatchEvent(new Event('blur'));
      if (how === 'sort') t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'name', dir: 'desc' }] }, 'api');
      expect(t.target(), how).toEqual([]);
      t.up(t.pt('r5', 'qty'));
      await flush();
      expect(t.requests, how).toHaveLength(0);
      expect(t.said().filter((x) => /Fill cancelled/.test(x)), how).toEqual([]);
      cleanup();
    }
  });

  it('the click after the release is swallowed once: no cell click; the next one is a click', () => {
    const t = fmake();
    t.at('r1', 'qty');
    t.dragTo('r3', 'qty');
    expect(t.events.filter((e) => e.type === 'cellClicked')).toHaveLength(0);
    t.click(t.cell('r4', 'qty')!);
    expect(t.events.filter((e) => e.type === 'cellClicked')).toHaveLength(1);
  });

  it('a double click on the handle opens no editor', () => {
    const t = fmake({ editors: 'after' });
    t.at('r2', 'qty');
    t.handle()!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(t.field()).toBeNull();
  });

  it('neither a pen (S12-Q12: as touch, as range) nor a finger drags it, and their press is not prevented (the view scrolls)', () => {
    const a = fmake();
    a.at('r1', 'qty');
    const q = a.dragTo('r3', 'qty', { type: 'pen' });
    expect(q.defaultPrevented).toBe(false);
    expect(a.requests).toHaveLength(0);
    expect(a.ctx.el.root.hasAttribute('data-dzg-filling')).toBe(false);
    const b = fmake();
    b.at('r1', 'qty');
    const p = b.dragTo('r3', 'qty', { type: 'touch' });
    expect(p.defaultPrevented).toBe(false);
    expect(b.requests).toHaveLength(0);
  });

  it('near the bottom edge the view scrolls while dragging (the block drag\'s geometry), and off-screen rows are filled', () => {
    const t = fmake({ block: 160 });
    t.at('r1', 'qty');
    t.down(t.handle()!, t.pt('r1', 'qty'));
    const below = { clientX: t.pt('r1', 'qty').clientX, clientY: 40 + 160 - 2 };
    t.move(below);
    const top = t.ctx.scroll.logicalTop;
    for (let i = 0; i < 20; i++) t.tick();
    expect(t.ctx.scroll.logicalTop).toBeGreaterThan(top);
    t.up(below);
    expect(t.requests).toHaveLength(1);
    expect(t.changes().length).toBeGreaterThan(4);
  });

  it('refused cells blink and are counted, read-only ones are counted only', async () => {
    const t = fmake();
    t.at('r3', 'qty');
    block(t, ['r3', 'qty'], ['r4', 'qty']);
    // 9, 5 down: 1, then −3 refused (min 0).
    t.dragTo('r6', 'qty');
    expect(t.changes()).toEqual(['r5/qty=1']);
    expect(t.blinked()).toEqual(['r6/qty']);
    await flush();
    expect(t.said().at(-1)).toBe('Cells filled: 1; refused: 1. Saving');
    const b = fmake();
    b.at('r2', 'code');
    b.dragTo('r2', 'ref');
    await flush();
    expect(b.blinked()).toEqual([]);
    expect(b.said().at(-1)).toBe('Cells filled: 0; read-only: 1');
  });
});

describe('the no-drag control (WCAG 2.5.7): a click on the handle, then a click on a cell', () => {
  it('fills as a drop there; the first click said; the focus and the block kept', async () => {
    const t = fmake();
    t.at('r1', 'qty');
    block(t, ['r1', 'qty'], ['r2', 'qty']);
    t.pickTo('r5', 'qty');
    expect(t.said()).toContain('Fill: click the cell to fill up to; Escape to cancel');
    await flush();
    expect(t.requests).toHaveLength(1);
    expect(t.requests[0]!.origin).toBe('fill');
    expect(t.changes()).toEqual(['r3/qty=7', 'r4/qty=10', 'r5/qty=13']);
    expect(t.block()).toBe('r1/qty:r5/qty');
    expect(t.focusAt()).toBe('r1/qty');
    expect(t.events.filter((e) => e.type === 'cellClicked')).toHaveLength(0);
  });

  it('Ctrl at the second click swaps', () => {
    const t = fmake();
    t.at('r1', 'qty');
    t.pickTo('r3', 'qty', { ctrl: true });
    expect(t.changes()).toEqual(['r2/qty=2', 'r3/qty=3']);
  });

  it('Escape after the first click: disarmed, said, nothing written; a click inside the source: nothing', async () => {
    const t = fmake();
    t.at('r1', 'qty');
    t.click(t.handle()!);
    t.press('Escape');
    expect(t.said().at(-1)).toBe('Fill cancelled');
    t.click(t.cell('r4', 'qty')!, t.pt('r4', 'qty'));
    expect(t.requests).toHaveLength(0);
    t.click(t.handle()!);
    t.click(t.cell('r1', 'qty')!, t.pt('r1', 'qty'));
    t.click(t.cell('r4', 'qty')!, t.pt('r4', 'qty'));
    await flush();
    expect(t.requests).toHaveLength(0);
  });

  it('a second click on the handle disarms it: the next click on a cell is a click (mutant « click on the handle again »)', () => {
    const t = fmake();
    t.at('r1', 'qty');
    t.click(t.handle()!);
    t.click(t.handle()!);
    t.click(t.cell('r4', 'qty')!, t.pt('r4', 'qty'));
    expect(t.requests).toHaveLength(0);
    expect(t.events.filter((e) => e.type === 'cellClicked')).toHaveLength(1);
  });

  it('a press outside this body disarms it, said once: the page, the box column (review 2)', () => {
    for (const where of ['page', 'box'] as const) {
      const t = fmake({ settings: { selection: { mode: 'multi', checkbox: true } } as never });
      t.at('r1', 'qty');
      t.click(t.handle()!);
      const target = where === 'page' ? document.body.appendChild(document.createElement('button')) : t.rowEl('r4')!.querySelector('.dzg-check')!;
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
      expect(t.said().filter((x) => x === 'Fill cancelled'), where).toEqual(['Fill cancelled']);
      // Disarmed: a click on a cell later is a click.
      t.click(t.cell('r4', 'qty')!, t.pt('r4', 'qty'));
      expect(t.requests, where).toHaveLength(0);
      cleanup();
    }
  });

  it('the focus leaving the grid disarms it (review 2)', async () => {
    const t = fmake();
    t.at('r1', 'qty');
    t.click(t.handle()!);
    const out = document.body.appendChild(document.createElement('button'));
    out.focus();
    t.ctx.el.root.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: out }));
    await new Promise((r) => setTimeout(r, 5));
    t.click(t.cell('r4', 'qty')!, t.pt('r4', 'qty'));
    expect(t.requests).toHaveLength(0);
  });

  it('a press on a cell of this body keeps it armed (the fill happens at the click)', () => {
    const t = fmake();
    t.at('r1', 'qty');
    t.pickTo('r3', 'qty');
    expect(t.changes()).toEqual(['r2/qty=1', 'r3/qty=1']);
    expect(t.said()).not.toContain('Fill cancelled');
  });

  it('a sort after the first click disarms it', () => {
    const t = fmake();
    t.at('r1', 'qty');
    t.click(t.handle()!);
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'name', dir: 'desc' }] }, 'api');
    const c = t.ctx.el.layer.querySelector<HTMLElement>('.dzg-cell[data-col="qty"]')!;
    t.click(c, { clientX: 100, clientY: 60 });
    expect(t.requests).toHaveLength(0);
  });
});

describe('the fill on read-only and odd cells', () => {
  it('a structure column of a tree is counted read-only (the rows shown only)', async () => {
    vi.useRealTimers();
    const rows = Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, name: `N${i}`, qty: i, price: 0, day: null, at: null, st: null, ok: null, code: null, ref: 'R', parent: i ? 'r0' : null }));
    const t = fmake({ rows: rows as never, columns: [{ id: 'parent', header: 'P', editable: true, value: (x: { parent: string | null }) => x.parent ?? '' }, { id: 'qty', header: 'Q', type: 'number', editable: true }] as never, more: [EN_TREE], after: [tree({ parentId: (x: { parent: string | null }) => x.parent, structure: ['parent'] }) as never] });
    t.g.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'api');
    t.at('r1', 'qty');
    block(t, ['r1', 'parent'], ['r1', 'qty']);
    t.fapi().fill({ row: t.g.kernel.rows.displayed.keyAt(t.g.kernel.rows.displayed.index(3)!), column: 'qty' });
    await flush();
    expect(t.said().at(-1)).toMatch(/^Cells filled: 2; read-only: 2\. Saving$/);
  });
});

describe('the handle: the analysis\'s gaps', () => {
  it('a right button or a non-primary pointer does not drag', () => {
    for (const init of [{ button: 2 }, { isPrimary: false }]) {
      const t = fmake();
      t.at('r1', 'qty');
      const p = t.down(t.handle()!, t.pt('r1', 'qty'), init);
      t.move(t.pt('r4', 'qty'));
      expect(t.target(), JSON.stringify(init)).toEqual([]);
      t.up(t.pt('r4', 'qty'));
      expect(t.requests, JSON.stringify(init)).toHaveLength(0);
      expect(p.defaultPrevented).toBe(false);
      cleanup();
    }
  });

  it('a target across an open detail: no fill outline in the panel', () => {
    const part = definePart('detail', { mount: (host) => ((host.innerHTML = '<div class="dzg-cell" data-col="qty">inner</div>'), {}) });
    const t = fmake({ more: [EN_DETAIL], after: [detail({ part, height: 60 }) as never] });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [key('r3')], expanded: true }, 'api');
    t.at('r2', 'qty');
    t.dragTo('r5', 'qty', { noUp: true });
    expect(t.target()).toEqual(['r3/qty', 'r4/qty', 'r5/qty']);
    expect(t.rowEl('xr3')!.querySelectorAll('.dzg-cell--fill')).toHaveLength(0);
  });

  it('a cell read-only by its row (`editable` a function): no handle', () => {
    const cols = CCOLS.map((c) => (c.id === 'qty' ? { ...c, editable: (r: { id: string }) => r.id !== 'r2' } : c));
    const t = fmake({ columns: cols as never });
    t.at('r2', 'qty');
    expect(t.handle()).toBeNull();
    t.at('r3', 'qty');
    expect(t.handleAt()).toBe('r3/qty');
  });

  it('a Mac: Cmd at the second click of the no-drag way swaps', () => {
    const t = fmake({ mac: true });
    t.at('r1', 'qty');
    t.pickTo('r3', 'qty', { meta: true });
    expect(t.changes()).toEqual(['r2/qty=2', 'r3/qty=3']);
  });

  it('data-dzg-filling while dragging, gone after the drop', () => {
    const t = fmake();
    t.at('r1', 'qty');
    t.dragTo('r3', 'qty', { noUp: true });
    expect(t.ctx.el.root.hasAttribute('data-dzg-filling')).toBe(true);
    t.up(t.pt('r3', 'qty'));
    expect(t.ctx.el.root.hasAttribute('data-dzg-filling')).toBe(false);
  });

  it('a release with no click after it: a later real click is a click (not swallowed)', async () => {
    const t = fmake();
    t.at('r1', 'qty');
    t.dragTo('r3', 'qty', { noUp: true });
    t.up(t.pt('r3', 'qty'));
    await new Promise((r) => setTimeout(r, 5));
    t.click(t.cell('r6', 'qty')!);
    expect(t.events.filter((e) => e.type === 'cellClicked')).toHaveLength(1);
  });
});

describe('the no-drag way and a detail panel', () => {
  it('a press on an open panel disarms it, said once; nothing written', () => {
    const part = definePart('detail', { mount: (host) => ((host.textContent = 'panel'), {}) });
    const t = fmake({ more: [EN_DETAIL], after: [detail({ part, height: 60 }) as never] });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [key('r3')], expanded: true }, 'api');
    t.at('r1', 'qty');
    t.click(t.handle()!);
    const panelCell = t.rowEl('xr3')!.querySelector('.dzg-dcell')!;
    panelCell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
    t.click(panelCell as HTMLElement, t.pt('xr3', 'qty'));
    expect(t.said().filter((x) => x === 'Fill cancelled')).toEqual(['Fill cancelled']);
    expect(t.requests).toHaveLength(0);
  });
});
