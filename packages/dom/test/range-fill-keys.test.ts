// The fill by the keys (Phase 5 step 12, docs/behaviors/fill.md 15–16; step12-plan.md D5, D6, tests 4; owner S12-Q2,
// S12-Q6): Ctrl/Cmd+D and Ctrl/Cmd+R (a block, one row, one column, one cell; nothing to copy from: the browser's key;
// the physical key on another layout; inside a field: the field's), and the keyboard fill mode (its sentence, the
// grid's moves mirrored right to left, the target's size after the pause, Enter / Ctrl+Enter / Escape / Tab / blur /
// any other key; Escape never reaching the block, whatever the features' order). Expectations by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, flush, fmake } from './support-fill.js';
import { R_ } from './support-range.js';
import { definePart } from '../src/part.js';
import { detail } from '../src/detail.js';
import { pagination } from '../src/pagination.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import { EN_PAGINATION } from '../src/locales/en-pagination.js';
import { key } from './support-fill.js';

afterEach(cleanup);

const ctrl = { ctrlKey: true } as const;

describe('Ctrl+D, Ctrl+R (fill.md 16)', () => {
  it('Ctrl+D on a block: its first row copied into the others, always a copy, one request (origin fill), prevented; the block and the focus kept', async () => {
    const t = fmake();
    t.at('r1', 'qty');
    t.api().set(R_(['r1', 'name'], ['r3', 'qty']));
    const e = t.press('d', ctrl);
    expect(e.defaultPrevented).toBe(true);
    expect(t.requests).toHaveLength(1);
    expect(t.requests[0]!.origin).toBe('fill');
    expect(t.changes()).toEqual(['r2/name="N1"', 'r2/qty=1', 'r3/name="N1"', 'r3/qty=1']);
    expect(t.block()).toBe('r1/name:r3/qty');
    expect(t.focusAt()).toBe('r1/qty');
    await flush();
    expect(t.said().at(-1)).toBe('Cells filled: 4. Saving');
  });

  it('Ctrl+D on one cell, or a one-row block: the row above copied in (S12-Q6); on the first row: not taken, not prevented', () => {
    const a = fmake();
    a.at('r4', 'qty');
    expect(a.press('d', ctrl).defaultPrevented).toBe(true);
    expect(a.changes()).toEqual(['r4/qty=9']);
    const b = fmake();
    b.at('r4', 'name');
    b.api().set(R_(['r4', 'name'], ['r4', 'qty']));
    b.press('d', ctrl);
    expect(b.changes()).toEqual(['r4/name="N3"', 'r4/qty=9']);
    const c = fmake();
    c.at('r0', 'qty');
    expect(c.press('d', ctrl).defaultPrevented).toBe(false);
    expect(c.requests).toHaveLength(0);
  });

  it('Ctrl+D is always a copy: one day above is copied, never a day later (mutant « Ctrl+D as a series »)', () => {
    const t = fmake();
    t.at('r4', 'day');
    t.press('d', ctrl);
    expect(t.changes()).toEqual(['r4/day="2026-03-04"']);
  });

  it('Ctrl+R on a block: its first column toward the end; one cell or one column: the previous visible column; the first column: not taken', () => {
    const a = fmake();
    a.at('r1', 'qty');
    a.api().set(R_(['r1', 'qty'], ['r2', 'price']));
    a.press('r', ctrl);
    expect(a.changes()).toEqual(['r1/price=1', 'r2/price=4']);
    const b = fmake();
    b.at('r2', 'price');
    b.press('r', ctrl);
    expect(b.changes()).toEqual(['r2/price=4']);
    const c = fmake();
    c.at('r2', 'name');
    expect(c.press('r', ctrl).defaultPrevented).toBe(false);
    expect(c.requests).toHaveLength(0);
  });

  it('right to left: Ctrl+R copies the previous column in reading order (on the right on screen)', () => {
    const t = fmake({ lang: 'ar' });
    t.at('r2', 'price');
    t.press('r', ctrl);
    expect(t.changes()).toEqual(['r2/price=4']);
  });

  it('Mac: Cmd+D is it; Ctrl+D is the system\'s there (not taken)', () => {
    const t = fmake({ mac: true } as never);
    t.at('r4', 'qty');
    expect(t.press('d', ctrl).defaultPrevented).toBe(false);
    expect(t.press('d', { metaKey: true }).defaultPrevented).toBe(true);
    expect(t.changes()).toEqual(['r4/qty=9']);
  });

  it('another layout: the physical key (KeyD) counts; Alt or Shift with it: not taken', () => {
    const t = fmake();
    t.at('r4', 'qty');
    expect(t.press('ي', { ctrlKey: true, altKey: true, code: 'KeyD' }).defaultPrevented).toBe(false);
    expect(t.press('D', { ctrlKey: true, shiftKey: true, code: 'KeyD' }).defaultPrevented).toBe(false);
    expect(t.press('ي', { ctrlKey: true, code: 'KeyD' }).defaultPrevented).toBe(true);
    expect(t.changes()).toEqual(['r4/qty=9']);
  });

  it('inside a field, Ctrl+D and Ctrl+R are the field\'s; without edit() nothing is taken', () => {
    const t = fmake({ editors: 'after' });
    t.at('r4', 'qty');
    t.press('F2');
    const e = t.press('d', ctrl, t.field()!);
    expect(e.defaultPrevented).toBe(false);
    expect(t.requests).toHaveLength(0);
    const b = fmake({ noEdit: true });
    b.at('r4', 'qty');
    expect(b.press('d', ctrl).defaultPrevented).toBe(false);
  });

  it('the API: down() and end() as the keys; null when the key would not be taken', () => {
    const t = fmake();
    t.at('r0', 'qty');
    expect(t.fapi().down()).toBeNull();
    t.at('r4', 'qty');
    expect(t.fapi().down()).toEqual({ filled: 1, refused: 0, readOnly: 0 });
    t.at('r4', 'name');
    expect(t.fapi().end()).toBeNull();
  });
});

describe('the keyboard fill mode (fill.md 15, owner S12-Q2)', () => {
  it('Ctrl+Shift+Enter: said once; the arrows extend the target from the source\'s corner; its size after the pause; Enter writes the series', async () => {
    vi.useFakeTimers();
    const t = fmake();
    t.at('r1', 'qty');
    t.api().set(R_(['r1', 'qty'], ['r2', 'qty']));
    expect(t.press('Enter', { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(t.said().at(-1)).toBe('Fill: arrows to extend, Enter to write, Escape to cancel');
    for (let i = 0; i < 3; i++) t.press('ArrowDown');
    expect(t.target()).toEqual(['r3/qty', 'r4/qty', 'r5/qty']);
    expect(t.focusAt()).toBe('r1/qty');
    expect(t.block()).toBe('r1/qty:r2/qty');
    vi.advanceTimersByTime(450);
    expect(t.said().filter((x) => x.startsWith('Down'))).toEqual(['Down: 3 rows']);
    t.press('Enter');
    await flush();
    expect(t.changes()).toEqual(['r3/qty=7', 'r4/qty=10', 'r5/qty=13']);
    expect(t.requests[0]!.origin).toBe('fill');
    expect(t.target()).toEqual([]);
    expect(t.block()).toBe('r1/qty:r5/qty');
    // Out of the mode: the arrows move the focus again.
    t.press('ArrowDown');
    expect(t.focusAt()).not.toBe('r1/qty');
  });

  it('Ctrl+Enter writes swapped; the arrows toward the start and up; Home / End', () => {
    const a = fmake();
    a.at('r1', 'qty');
    a.api().set(R_(['r1', 'qty'], ['r2', 'qty']));
    a.press('Enter', { ctrlKey: true, shiftKey: true });
    a.press('ArrowDown');
    a.press('ArrowDown');
    a.press('Enter', ctrl);
    expect(a.changes()).toEqual(['r3/qty=1', 'r4/qty=4']);
    const b = fmake();
    b.at('r2', 'price');
    b.press('Enter', { ctrlKey: true, shiftKey: true });
    b.press('ArrowLeft');
    expect(b.target()).toEqual(['r2/qty']);
    b.press('Enter');
    expect(b.changes()).toEqual(['r2/qty=2.5']);
  });

  it('right to left: ArrowLeft goes toward the end (mirrored by the grid\'s own moves)', () => {
    const t = fmake({ lang: 'ar' });
    t.at('r2', 'qty');
    t.press('Enter', { ctrlKey: true, shiftKey: true });
    t.press('ArrowLeft');
    expect(t.target()).toEqual(['r2/price']);
    t.press('Enter');
    expect(t.changes()).toEqual(['r2/price=4']);
  });

  it('Escape: cancelled, said, the block stays — fill listed after range and before it', async () => {
    for (const order of ['after', 'before'] as const) {
      const t = fmake({ order });
      t.at('r1', 'qty');
      t.api().set(R_(['r1', 'qty'], ['r2', 'qty']));
      t.press('Enter', { ctrlKey: true, shiftKey: true });
      t.press('ArrowDown');
      t.press('Escape');
      expect(t.said().at(-1), order).toBe('Fill cancelled');
      expect(t.block(), order).toBe('r1/qty:r2/qty');
      expect(t.target(), order).toEqual([]);
      t.press('Enter');
      await flush();
      expect(t.requests, order).toHaveLength(0);
      cleanup();
    }
  });

  it('any other key is swallowed (Delete clears nothing, a letter opens no field); Tab cancels quietly; a blur cancels', () => {
    const t = fmake({ editors: 'after' });
    t.at('r1', 'qty');
    t.api().set(R_(['r1', 'qty'], ['r2', 'qty']));
    t.press('Enter', { ctrlKey: true, shiftKey: true });
    expect(t.press('Delete').defaultPrevented).toBe(true);
    expect(t.press('a').defaultPrevented).toBe(true);
    expect(t.field()).toBeNull();
    expect(t.requests).toHaveLength(0);
    const n = t.said().length;
    t.press('ArrowDown');
    t.press('Tab');
    expect(t.target()).toEqual([]);
    expect(t.said().length).toBe(n);
    t.press('Enter', { ctrlKey: true, shiftKey: true });
    t.press('ArrowDown');
    t.cell('r1', 'qty')!.blur();
    t.ctx.el.root.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
    window.dispatchEvent(new Event('blur'));
    expect(t.target()).toEqual([]);
  });

  it('the size is said once per pause, as rows down or up and columns to the end or the start', () => {
    vi.useFakeTimers();
    const t = fmake();
    t.at('r4', 'qty');
    t.press('Enter', { ctrlKey: true, shiftKey: true });
    t.press('ArrowUp');
    t.press('ArrowUp');
    vi.advanceTimersByTime(450);
    t.press('ArrowDown');
    t.press('ArrowDown');
    t.press('ArrowDown');
    t.press('ArrowRight');
    t.press('ArrowRight');
    vi.advanceTimersByTime(450);
    t.press('ArrowLeft');
    t.press('ArrowLeft');
    t.press('ArrowLeft');
    t.press('ArrowLeft');
    t.press('ArrowUp');
    vi.advanceTimersByTime(450);
    expect(t.said().filter((x) => /^(Up|Down|To the)/.test(x))).toEqual(['Up: 2 rows', 'To the end: 2 columns', 'To the start: 1 column']);
  });

  it('a sort while in the mode cancels it quietly', () => {
    const t = fmake();
    t.at('r1', 'qty');
    t.press('Enter', { ctrlKey: true, shiftKey: true });
    t.press('ArrowDown');
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'name', dir: 'desc' }] }, 'api');
    expect(t.target()).toEqual([]);
    t.press('Enter');
    expect(t.requests).toHaveLength(0);
  });
});

// The test analysis of step 12 (gaps): each case by hand.
const panel = definePart('detail', { mount: (host) => ((host.textContent = 'panel'), {}) });
const withDetail = () => {
  const t = fmake({ more: [EN_DETAIL], after: [detail({ part: panel, height: 60 }) as never] });
  t.g.kernel.dispatch({ type: 'rows.expand', rows: [key('r3')], expanded: true }, 'api');
  return t;
};
const mode = (t: ReturnType<typeof fmake>, mac = false) => t.press('Enter', { ...(mac ? { metaKey: true } : { ctrlKey: true }), shiftKey: true });

describe('the keys: the analysis\'s gaps', () => {
  it('Ctrl and Cmd held together with D: not taken', () => {
    const t = fmake();
    t.at('r4', 'qty');
    expect(t.press('d', { ctrlKey: true, metaKey: true }).defaultPrevented).toBe(false);
    expect(t.requests).toHaveLength(0);
  });

  it('Ctrl+D on a one-row block with a detail open above: the data row above it is copied, never the panel', () => {
    const t = withDetail();
    t.at('r4', 'name');
    t.api().set(R_(['r4', 'name'], ['r4', 'qty']));
    t.press('d', ctrl);
    expect(t.changes()).toEqual(['r4/name="N3"', 'r4/qty=9']);
  });

  it('a detail row focused: Ctrl+Shift+Enter is not taken', () => {
    const t = withDetail();
    t.at('r3', 'qty');
    t.press('ArrowDown');
    expect(t.where()).toBe('xr3/*');
    expect(mode(t).defaultPrevented).toBe(false);
    expect(t.said().some((x) => x.startsWith('Fill:'))).toBe(false);
  });

  it('in the mode, Tab is not prevented (it moves the focus as usual) and leaves the mode', () => {
    const t = fmake();
    t.at('r1', 'qty');
    mode(t);
    t.press('ArrowDown');
    expect(t.press('Tab').defaultPrevented).toBe(false);
    expect(t.target()).toEqual([]);
  });

  it('Ctrl+End and Ctrl+Home: the target to the last and the first row; PageDown: one page of rows', () => {
    const a = fmake();
    a.at('r4', 'qty');
    mode(a);
    a.press('End', ctrl);
    // The view follows the virtual cell to the last row: the target outlined there, r29 included.
    expect(a.target()).toContain('r29/qty');
    expect(a.target().every((x) => Number(x.slice(1, x.indexOf('/'))) >= 5)).toBe(true);
    a.press('Enter');
    // r4 (5) copied down to the last row: the rows whose quantity is not already 5 (i² mod 11).
    expect(a.changes()).toEqual(Array.from({ length: 25 }, (_, i) => 5 + i).filter((i) => (i * i) % 11 !== 5).map((i) => `r${i}/qty=5`));
    const b = fmake();
    b.at('r4', 'qty');
    mode(b);
    b.press('Home', ctrl);
    b.press('Enter');
    expect(b.changes()).toEqual(['r0/qty=5', 'r1/qty=5', 'r2/qty=5', 'r3/qty=5']);
    const c = fmake();
    c.at('r4', 'qty');
    mode(c);
    c.press('PageDown');
    const page = Math.floor(320 / c.ctx.rowHeight());
    expect(c.target()).toEqual(Array.from({ length: page }, (_, i) => `r${5 + i}/qty`).sort());
  });

  it('ArrowDown on the last row stays there: no throw, no target', () => {
    const t = fmake();
    t.at('r29', 'qty');
    mode(t);
    expect(() => { t.press('ArrowDown'); t.press('ArrowDown'); }).not.toThrow();
    expect(t.target()).toEqual([]);
    t.press('Enter');
    expect(t.requests).toHaveLength(0);
  });

  it('a click elsewhere (the focus moved) cancels the mode', () => {
    const t = fmake();
    t.at('r1', 'qty');
    mode(t);
    t.press('ArrowDown');
    t.at('r8', 'qty');
    expect(t.target()).toEqual([]);
    t.press('ArrowDown');
    expect(t.focusAt()).toBe('r9/qty');
  });

  it('a focusout alone (no window blur) cancels the mode once the focus is out', async () => {
    const t = fmake();
    t.at('r1', 'qty');
    mode(t);
    t.press('ArrowDown');
    const out = document.body.appendChild(document.createElement('button'));
    out.focus();
    t.ctx.el.root.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: out }));
    await new Promise((r) => setTimeout(r, 5));
    t.g.api.refresh();
    expect(t.target()).toEqual([]);
  });

  it('a column hidden, or a page change, cancels the mode', () => {
    const a = fmake();
    a.at('r1', 'qty');
    mode(a);
    a.press('ArrowDown');
    a.g.update({ columns: (a.ctx.settings.columns as { id: string }[]).map((c) => (c.id === 'ref' ? { ...c, hidden: true } : c)) } as never);
    expect(a.target()).toEqual([]);
    const b = fmake({ more: [EN_PAGINATION], after: [pagination() as never], settings: { pagination: { pageSize: 10 } } as never });
    b.at('r1', 'qty');
    mode(b);
    b.press('ArrowDown');
    b.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'api');
    expect(b.target()).toEqual([]);
    b.press('Enter');
    expect(b.requests).toHaveLength(0);
  });

  it('a Mac: Cmd+Shift+Enter enters the mode, Cmd+Enter writes swapped', () => {
    const t = fmake({ mac: true });
    t.at('r1', 'qty');
    t.api().set(R_(['r1', 'qty'], ['r2', 'qty']));
    expect(mode(t, true).defaultPrevented).toBe(true);
    t.press('ArrowDown');
    t.press('ArrowDown');
    t.press('Enter', { metaKey: true });
    expect(t.changes()).toEqual(['r3/qty=1', 'r4/qty=4']);
  });
});
