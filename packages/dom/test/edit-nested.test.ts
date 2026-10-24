// Phase 5 step 8, nested grids edit on their own (D13; edit-undo.md 11; step08-plan.md « Behaviour » 13–14; owner
// S8-O3): each grid its own controller, undo stack, keys, field and sentences; Escape goes up one level at a time;
// editing the master row leaves its panel's grid alone; a panel that goes (closed, scrolled away, its row removed)
// while its grid saves or holds an open field keeps that grid alive, off the page, until the answer — the text sent,
// nothing lost — and gives the same grid back if the panel comes again first.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, k, nest, settle, tick, x } from './support-nested-edit.js';

afterEach(cleanup);

/** O1's panel open, the focus in its grid on L0's Units. */
function inside(o: Parameters<typeof nest>[0] = {}) {
  const t = nest(o);
  t.expand(['O1']);
  const inner = t.innerOf('O1');
  inner.grid.api.focusCell(k('O1-L0'), 'qty');
  return { ...t, inner, ic: t.ictx(inner) };
}
const outerEdited = (t: ReturnType<typeof nest>) => t.events.filter((e) => e.type === 'cellEdited');

describe('one controller per grid (D13)', () => {
  it('an edit in the inner grid: the inner grid\'s event and stack; the outer grid hears nothing, has nothing to undo', async () => {
    const t = inside();
    t.key('7');
    expect(t.field(t.ic.el.root)).not.toBeNull();
    t.key('Enter', {}, t.field(t.ic.el.root)!);
    expect(t.inner.events.filter((e) => e.type === 'cellEdited').map((e) => (e as { value: unknown }).value)).toEqual([7]);
    expect(outerEdited(t)).toEqual([]);
    expect([t.inner.api()!.canUndo, t.api.canUndo]).toEqual([true, false]);
    expect(t.saves.inner).toHaveLength(1);
    expect(t.saves.outer).toHaveLength(0);
  });

  it('Ctrl+Z in the inner grid undoes the inner grid only; on the panel\'s cell, the outer grid\'s only', async () => {
    const t = inside();
    t.api.commit([{ key: k('O3'), column: 'qty', input: { text: '33' } }]);
    t.inner.api()!.commit([{ key: k('O1-L2'), column: 'qty', input: { text: '22' } }]);
    t.inner.grid.api.focusCell(k('O1-L0'), 'qty');
    expect(t.key('z', { code: 'KeyZ', ctrlKey: true }).defaultPrevented).toBe(true);
    expect([t.inner.api()!.canUndo, t.api.canUndo]).toEqual([false, true]);
    expect(t.inner.grid.kernel.focus).toEqual({ kind: 'cell', row: k('O1-L2'), column: 'qty' });
    // Nothing more to undo inside: said inside, never passed to the outer grid.
    expect(t.key('z', { code: 'KeyZ', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(t.api.canUndo).toBe(true);
    // On the panel's cell: the outer grid's.
    t.key('Escape');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: x('O1'), column: 'name' });
    t.key('z', { code: 'KeyZ', ctrlKey: true });
    expect([t.inner.api()!.canRedo, t.api.canUndo, t.api.canRedo]).toEqual([true, false, true]);
  });

  it('one edit() object shared by every master\'s grid: each grid its own controller and stack', () => {
    const t = nest({ shared: true });
    t.expand(['O1', 'O2']);
    const a = t.innerOf('O1');
    const b = t.innerOf('O2');
    expect(a.api()).not.toBe(b.api());
    a.api()!.commit([{ key: k('O1-L1'), column: 'qty', input: { text: '9' } }]);
    expect([a.api()!.canUndo, b.api()!.canUndo]).toEqual([true, false]);
  });

  it('the sentences of each grid in its own region', async () => {
    const t = inside();
    const outer = vi.spyOn(t.ctx.live, 'announce');
    const inner = vi.spyOn(t.ic.live, 'announce');
    t.key('z', { code: 'KeyZ', ctrlKey: true });
    await settle();
    expect(inner.mock.calls.map((c) => c[0])).toEqual(['Nothing to undo']);
    expect(outer).not.toHaveBeenCalled();
  });

  it('a double click in the inner grid opens the inner grid\'s field only', () => {
    const t = inside();
    t.cellOf(t.ic, k('O1-L1'), 'item')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const f = t.field(t.host)!;
    expect(f.closest('.dzg')).toBe(t.ic.el.root);
    expect(t.ctx.editor ?? null).toBeNull();
  });

  it('Escape, three times: the field closed (the inner cell), then the panel\'s cell, then the outer grid\'s own (nothing moves)', () => {
    const t = inside();
    t.key('F2');
    const f = t.field(t.ic.el.root)!;
    expect(t.key('Escape', {}, f).defaultPrevented).toBe(true);
    expect(t.field(t.host)).toBeNull();
    expect(t.active()).toBe(t.cellOf(t.ic, k('O1-L0'), 'qty'));
    t.key('Escape');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: x('O1'), column: 'name' });
    const panel = t.active();
    t.key('Escape');
    expect(t.active()).toBe(panel);
  });

  it('the master row edited and saved: its panel\'s grid is not made again; its stack and its marks stay', async () => {
    const t = inside();
    t.inner.api()!.commit([{ key: k('O1-L2'), column: 'qty', input: { text: '22' } }]);
    const made = t.made.length;
    t.api.commit([{ key: k('O1'), column: 'name', input: { text: 'Order One' } }]);
    t.saves.outer[0]!.ok();
    await settle();
    expect(t.made.length).toBe(made);
    expect(t.inner.alive()).toBe(true);
    expect(t.inner.api()!.canUndo).toBe(true);
    expect(t.inner.api()!.state(k('O1-L2'), 'qty')?.status).toBe('saving');
    expect(t.cellOf(t.ic, k('O1-L2'), 'qty')!.classList.contains('dzg-cell--saving')).toBe(true);
  });
});

describe('a panel that goes while its grid saves (owner S8-O3)', () => {
  it('closed while saving: the grid stays alive off the page, the save is answered and kept; then the grid goes', async () => {
    const t = inside();
    t.inner.api()!.commit([{ key: k('O1-L2'), column: 'qty', input: { text: '22' } }]);
    const sent = t.saves.inner[0]!;
    t.expand(['O1'], false);
    expect(t.inner.alive()).toBe(true);
    expect(t.ic.el.root.isConnected).toBe(false);
    expect(t.inner.events.some((e) => e.type === 'problems')).toBe(false);
    sent.ok();
    await settle();
    expect(t.inner.events.filter((e) => e.type === 'saveFailed')).toEqual([]);
    expect(t.inner.alive()).toBe(false);
    // Opened again: a new grid, the master's state remembered (the scroll, the focus), the saved value shown (the host keeps it).
    t.expand(['O1']);
    expect(t.innerOf('O1')).not.toBe(t.inner);
  });

  it('closed then opened again before the answer: the same grid back (no second controller), its marks, its stack', async () => {
    const t = inside();
    t.inner.api()!.commit([{ key: k('O1-L2'), column: 'qty', input: { text: '22' } }]);
    const made = t.made.length;
    t.expand(['O1'], false);
    t.expand(['O1']);
    expect(t.made.length).toBe(made);
    expect(t.innerOf('O1')).toBe(t.inner);
    expect(t.ic.el.root.isConnected).toBe(true);
    expect(t.inner.api()!.state(k('O1-L2'), 'qty')?.status).toBe('saving');
    expect(t.cellOf(t.ic, k('O1-L2'), 'qty')!.classList.contains('dzg-cell--saving')).toBe(true);
    t.saves.inner[0]!.ok();
    await settle();
    // Back on the page: it stays.
    expect(t.inner.alive()).toBe(true);
    expect(t.inner.api()!.canUndo).toBe(true);
    // Its keys work in the new panel.
    t.inner.grid.api.focusCell(k('O1-L0'), 'qty');
    t.key('z', { code: 'KeyZ', ctrlKey: true });
    expect(t.inner.api()!.canUndo).toBe(false);
  });

  it('closed while a field is open: the typed text kept and sent (the lost path), then the grid goes once answered', async () => {
    const t = inside();
    t.key('F2');
    const f = t.field(t.ic.el.root)!;
    f.value = '44';
    t.expand(['O1'], false);
    await tick();
    expect(t.inner.events.filter((e) => e.type === 'cellEdited').map((e) => (e as { value: unknown }).value)).toEqual([44]);
    expect(t.saves.inner).toHaveLength(1);
    expect(t.inner.alive()).toBe(true);
    t.saves.inner[0]!.ok();
    await settle();
    expect(t.inner.alive()).toBe(false);
  });

  it('a field whose text is refused there (O1): nothing to send, the grid goes', async () => {
    const t = inside();
    t.key('F2');
    t.field(t.ic.el.root)!.value = 'abc';
    t.expand(['O1'], false);
    await tick();
    expect(t.saves.inner).toHaveLength(0);
    expect(t.inner.alive()).toBe(false);
  });

  it('scrolled away while saving: kept alive, then given back when scrolled back before the answer', async () => {
    const t = inside();
    t.inner.api()!.commit([{ key: k('O1-L2'), column: 'qty', input: { text: '22' } }]);
    // The focus out of the panel (a focused row stays mounted), then scrolled far down: the panel unmounted.
    t.g.api.focusCell(k('O29'), 'name');
    t.scroll(0);
    t.scroll(5000);
    expect(t.ic.el.root.isConnected).toBe(false);
    expect(t.inner.alive()).toBe(true);
    t.scroll(0);
    expect(t.innerOf('O1')).toBe(t.inner);
    expect(t.ic.el.root.isConnected).toBe(true);
  });

  it('the master row removed while its grid saves: the save is answered, then the grid goes; nothing said on the page', async () => {
    const t = inside();
    t.inner.api()!.commit([{ key: k('O1-L2'), column: 'qty', input: { text: '22' } }]);
    t.g.kernel.rows.applyTransaction({ remove: ['O1'] });
    expect(t.inner.alive()).toBe(true);
    t.saves.inner[0]!.no({ reason: 'no' });
    await settle();
    expect(t.inner.alive()).toBe(false);
    expect(document.body.contains(t.ic.el.root)).toBe(false);
  });

  // Review 1: the refusal of a grid off the page is not lost (S8-O3): heard by the app, kept until the panel comes back.
  it('closed while saving, the save refused: saveFailed reaches the app while off the page; reopened, the same grid shows the refusal', async () => {
    const t = inside();
    t.inner.api()!.commit([{ key: k('O1-L2'), column: 'qty', input: { text: '22' } }]);
    t.expand(['O1'], false);
    t.saves.inner[0]!.no({ reason: 'locked' });
    await settle();
    expect(t.inner.events.filter((e) => e.type === 'saveFailed').map((e) => (e as { reason: unknown }).reason)).toEqual(['locked']);
    expect(t.inner.alive()).toBe(true);
    t.expand(['O1']);
    expect(t.innerOf('O1')).toBe(t.inner);
    expect(t.inner.api()!.state(k('O1-L2'), 'qty')?.status).toBe('failed');
    // After the refusal's 0.5 s: the failed mark and its reason.
    await new Promise((r) => setTimeout(r, 600));
    const cell = t.cellOf(t.ic, k('O1-L2'), 'qty')!;
    expect(cell.classList.contains('dzg-cell--failed')).toBe(true);
    expect((cell.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent).join()).toContain('locked');
  });

  // Review 2: nothing kept for ever.
  it('a save that never answers: the kept grid goes with the outer grid', () => {
    const t = inside();
    t.inner.api()!.commit([{ key: k('O1-L2'), column: 'qty', input: { text: '22' } }]);
    t.expand(['O1'], false);
    expect(t.inner.alive()).toBe(true);
    t.g.destroy();
    expect(t.inner.alive()).toBe(false);
  });

  it('a kept grid holding only a refusal goes when its master row is removed', async () => {
    const t = inside();
    t.inner.api()!.commit([{ key: k('O1-L2'), column: 'qty', input: { text: '22' } }]);
    t.expand(['O1'], false);
    t.saves.inner[0]!.no({ reason: 'locked' });
    await settle();
    expect(t.inner.alive()).toBe(true);
    t.g.kernel.rows.applyTransaction({ remove: ['O1'] });
    expect(t.inner.alive()).toBe(false);
  });

  it('nothing in flight: the panel\'s grid goes at once, as before', () => {
    const t = inside();
    t.expand(['O1'], false);
    expect(t.inner.alive()).toBe(false);
  });

  it('three levels: an edit and its undo in the lots\' grid stay there; the lines\' and the orders\' stacks untouched', async () => {
    const t = nest({ deep: true });
    t.expand(['O1']);
    const lines = t.innerOf('O1');
    lines.grid.kernel.dispatch({ type: 'rows.expand', rows: [k('O1-L0')], expanded: true }, 'api');
    const lots = t.ictx(lines).el.root.querySelector<HTMLElement>('.dzg-dbody > .dzg')!;
    const cell = lots.querySelector<HTMLElement>('.dzg-cell[data-col="qty"]')!;
    cell.click();
    cell.focus();
    t.key('5', {}, cell);
    t.key('Enter', {}, lots.querySelector('.dzg-field')!);
    expect(t.saves.lots).toHaveLength(1);
    t.saves.lots[0]!.ok();
    await settle();
    t.key('z', { code: 'KeyZ', ctrlKey: true }, lots.querySelector('.dzg-cell[data-col="qty"]')!);
    expect(t.saves.lots).toHaveLength(2);
    expect([lines.api()!.canUndo, lines.api()!.canRedo, t.api.canUndo]).toEqual([false, false, false]);
  });
});

// The test analyser's gaps (step-8 review).
describe('review gaps', () => {
  it('the master renamed while its grid is off the page: reopened, the same grid, given the new name', () => {
    const t = inside();
    t.inner.api()!.commit([{ key: k('O1-L2'), column: 'qty', input: { text: '22' } }]);
    t.expand(['O1'], false);
    t.g.kernel.rows.applyTransaction({ update: [{ id: 'O1', name: 'Renamed', qty: 1 }] });
    t.expand(['O1']);
    expect(t.innerOf('O1')).toBe(t.inner);
    expect(t.ic.el.viewport.getAttribute('aria-label')).toBe('Lines of Renamed');
  });

  it('back before the answer, answered, closed while idle, opened: a new grid, alive and on the page', async () => {
    const t = inside();
    t.inner.api()!.commit([{ key: k('O1-L2'), column: 'qty', input: { text: '22' } }]);
    t.expand(['O1'], false);
    t.expand(['O1']);
    t.saves.inner[0]!.ok();
    await settle();
    t.expand(['O1'], false);
    expect(t.inner.alive()).toBe(false);
    t.expand(['O1']);
    const b = t.innerOf('O1');
    expect(b).not.toBe(t.inner);
    expect(b.alive()).toBe(true);
    expect(t.ictx(b).el.root.isConnected).toBe(true);
  });

  it('two masters kept alive: each comes back to its own panel', () => {
    const t = nest();
    t.expand(['O1', 'O2']);
    const a = t.innerOf('O1');
    const b = t.innerOf('O2');
    a.api()!.commit([{ key: k('O1-L2'), column: 'qty', input: { text: '22' } }]);
    b.api()!.commit([{ key: k('O2-L2'), column: 'qty', input: { text: '23' } }]);
    t.expand(['O1', 'O2'], false);
    t.expand(['O2']);
    expect([t.ictx(a).el.root.isConnected, t.ictx(b).el.root.isConnected]).toEqual([false, true]);
    t.expand(['O1']);
    expect([t.ictx(a).el.root.isConnected, t.ictx(b).el.root.isConnected]).toEqual([true, true]);
  });
});
