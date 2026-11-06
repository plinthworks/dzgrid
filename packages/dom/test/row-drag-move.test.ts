// Moving rows with the pointer (Phase 9, docs/behaviors/row-move.md 1–6, 11, 12, 24, 25): the grip, the 4 px threshold,
// mouse / pen / finger on the grip, the layer, one `rowMove` per drop (the application's rows unchanged by the grid), the
// focus and the sentence after the application gave the rows back, nothing on the same place or outside, the click after a
// drag swallowed, Escape said, the quiet cancels, an open editor. Expectations by hand from the row layout (32 px rows).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { tree } from '../src/tree.js';
import { cleanup, dmake, flatRows, HEADER, type R } from './support-row-drag.js';

afterEach(cleanup);

describe('the grip (1–4)', () => {
  it('drawn at the start of the first visible column, on data rows only, aria-hidden, no tab stop; absent without the feature', () => {
    const t = dmake({ rows: flatRows(6) });
    const g = t.grip('r2')!;
    expect(g).not.toBeNull();
    expect(g.closest('.dzg-cell')!.getAttribute('data-col')).toBe('name');
    expect(g.parentElement!.firstElementChild).toBe(g);
    expect(g.getAttribute('aria-hidden')).toBe('true');
    expect(g.hasAttribute('tabindex')).toBe(false);
    expect(g.textContent).toBe('');
    expect(t.grips()).toHaveLength(6);
    // The cell's text is the row's (the grip adds none).
    expect(t.cell('r2', 'name')!.textContent).toBe('Name 2');
  });

  it('in the column the application names; another paint moves nothing twice', () => {
    const t = dmake({ rows: flatRows(6), drag: { column: 's' } });
    expect(t.grip('r1')!.closest('.dzg-cell')!.getAttribute('data-col')).toBe('s');
    t.g.api.refresh();
    expect(t.cell('r1', 's')!.querySelectorAll('.dzg-grip')).toHaveLength(1);
    expect(t.cell('r1', 'name')!.querySelector('.dzg-grip')).toBeNull();
  });

  it('drag: false draws no grip; the column hidden: the grips go', () => {
    expect(dmake({ rows: flatRows(3), drag: { drag: false } }).grips()).toHaveLength(0);
    cleanup();
    const t = dmake({ rows: flatRows(3), drag: { column: 's' } });
    expect(t.grips()).toHaveLength(3);
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 's', hidden: true }] }, 'api');
    expect(t.grips()).toHaveLength(0);
  });

  it('a press on the grip takes no focus, starts no block and selects no row; a click on it is no row click', () => {
    const t = dmake({ rows: flatRows(6), withRange: true, settings: { selection: { mode: 'multi' } } });
    const p = t.hold('r2');
    expect(p.defaultPrevented).toBe(true);
    t.up(t.over('r2', 0.5, 10));
    t.click(t.grip('r2')!);
    expect(t.g.kernel.focus).toBeNull();
    expect(t.block()).toBeNull();
    expect(t.g.kernel.selection.keys.size).toBe(0);
    expect(t.events.filter((e) => e.type === 'rowClicked' || e.type === 'cellClicked')).toHaveLength(0);
  });
});

describe('the drag (5, 6, 11)', () => {
  it('3 px is nothing; 4 px drags: the layer, the ghost (the row\'s text), the line, the source dimmed', () => {
    const t = dmake({ rows: flatRows(6) });
    const p0 = t.over('r1', 0.5, 10);
    t.hold('r1');
    t.move({ clientX: p0.clientX, clientY: p0.clientY + 3 });
    expect(t.dragging()).toBe(false);
    expect(t.layer()).toBeNull();
    t.move({ clientX: p0.clientX, clientY: p0.clientY + 4 });
    expect(t.dragging()).toBe(true);
    expect(t.layer()!.getAttribute('aria-hidden')).toBe('true');
    expect(t.ghost()!.textContent).toBe('Name 1');
    expect(t.rowEl('r1')!.hasAttribute('data-dzg-moving')).toBe(true);
    t.move(t.over('r3', 0.2));
    t.tick();
    // Before r3: the gap at 3 rows × 32 px under the header, the 2 px line centred on it.
    expect(t.bar()!.hidden).toBe(false);
    expect(t.bar()!.style.insetBlockStart).toBe(`${HEADER + 3 * 32 - 1}px`);
    t.up(t.over('r3', 0.2));
    expect(t.layer()).toBeNull();
    expect(t.dragging()).toBe(false);
    expect(t.rowEl('r1')!.hasAttribute('data-dzg-moving')).toBe(false);
  });

  it('a mouse, a pen and a finger all drag from the grip (Q-RD9)', () => {
    for (const pointerType of ['mouse', 'pen', 'touch']) {
      const t = dmake({ rows: flatRows(6) });
      t.drag('r0', ['r3', 0.7], { init: { pointerType } });
      expect(t.moves().map((m) => [m.via, m.keys.length, m.target.where]), pointerType).toEqual([['pointer', 1, 'after']]);
      cleanup();
    }
  });

  it('one rowMove on release, the grid\'s rows unchanged (the application reorders), the target a key, never a position', () => {
    const t = dmake({ rows: flatRows(6) });
    t.drag('r0', ['r3', 0.7]);
    const m = t.moves();
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ source: 'user', via: 'pointer', keys: [t.K('r0')], target: { key: t.K('r3'), where: 'after' }, parent: null, applied: false });
    expect(m[0]!.rows.map((r) => r.id)).toEqual(['r0']);
    expect(t.order()).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5']);
    // Nothing said: the application did not give the rows back.
    expect(t.said()).toEqual([]);
  });

  it('the application gives the rows back: the focus on the moved row (the grip\'s column), its place said once', () => {
    const t = dmake({ rows: flatRows(6) });
    t.app(flatRows(6));
    t.drag('r0', ['r3', 0.7]);
    expect(t.order()).toEqual(['r1', 'r2', 'r3', 'r0', 'r4', 'r5']);
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: t.K('r0'), column: 'name' });
    expect(t.said()).toEqual(['Row 4 of 6']);
  });

  it('an application that answers later (a server first): said when its rows arrive', () => {
    const t = dmake({ rows: flatRows(6) });
    let later: (() => void) | null = null;
    t.g.kernel.subscribe((e) => {
      if (e.type === 'rowMove') later = () => (t.g.kernel.rows as { setRows(r: R[]): unknown }).setRows([...flatRows(6).slice(1, 3), flatRows(6)[0]!, ...flatRows(6).slice(3)]);
    });
    t.drag('r0', ['r2', 0.7]);
    expect(t.said()).toEqual([]);
    later!();
    expect(t.said()).toEqual(['Row 3 of 6']);
  });

  it('the same place, a place on the moved row, or outside the grid: nothing happens, nothing is said', () => {
    const t = dmake({ rows: flatRows(6) });
    t.drag('r2', ['r1', 0.8]);
    t.drag('r2', ['r3', 0.2]);
    t.drag('r2', ['r2', 0.4]);
    expect(t.bar()).toBeNull();
    t.drag('r2', { clientX: 700, clientY: 100 });
    t.drag('r2', { clientX: 60, clientY: HEADER + 320 + 40 });
    expect(t.moves()).toHaveLength(0);
    expect(t.said()).toEqual([]);
  });

  it('the click after a drag is swallowed once; a later click is a click', () => {
    const t = dmake({ rows: flatRows(6), settings: { selection: { mode: 'single' } } });
    t.drag('r0', ['r3', 0.7], { noUp: true });
    t.up(t.over('r3', 0.7));
    const c = new MouseEvent('click', { bubbles: true, cancelable: true });
    t.cell('r3')!.dispatchEvent(c);
    expect(c.defaultPrevented).toBe(true);
    t.click(t.cell('r3')!);
    expect(t.events.filter((e) => e.type === 'rowClicked')).toHaveLength(1);
  });
});

describe('cancels (12)', () => {
  it('Escape cancels and says so; the move never happens', () => {
    const t = dmake({ rows: flatRows(6) });
    t.drag('r0', ['r3', 0.7], { noUp: true });
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(t.layer()).toBeNull();
    expect(t.said()).toEqual(['Move cancelled']);
    t.up(t.over('r3', 0.7));
    expect(t.moves()).toHaveLength(0);
  });

  it('pointercancel, a lost capture, a blur, a direction change, the rows gone and destroy cancel quietly', () => {
    const quiet = (fn: (t: ReturnType<typeof dmake>) => void) => {
      const t = dmake({ rows: flatRows(6) });
      t.drag('r0', ['r3', 0.7], { noUp: true });
      fn(t);
      expect(t.layer()).toBeNull();
      t.up(t.over('r3', 0.7));
      expect(t.moves()).toHaveLength(0);
      expect(t.said()).toEqual([]);
      cleanup();
    };
    quiet(() => document.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })));
    quiet((t) => t.ctx.el.root.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1 })));
    quiet(() => window.dispatchEvent(new Event('blur')));
    quiet((t) => t.g.update({ direction: 'rtl' }));
    quiet((t) => (t.g.kernel.rows as { setRows(r: R[]): unknown }).setRows(flatRows(6).slice(1)));
    const t = dmake({ rows: flatRows(6) });
    t.drag('r0', ['r3', 0.7], { noUp: true });
    const root = t.ctx.el.root;
    t.g.destroy();
    expect(root.querySelector('.dzg-rmove')).toBeNull();
  });

  it('the grip\'s own capture lost (a finger: the browser\'s implicit capture handed to the root) never cancels', () => {
    const t = dmake({ rows: flatRows(6) });
    t.drag('r0', ['r3', 0.7], { init: { pointerType: 'touch' }, noUp: true });
    t.grip('r0')!.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1, bubbles: true }));
    expect(t.dragging()).toBe(true);
    t.up(t.over('r3', 0.7), document, { pointerType: 'touch' });
    expect(t.moves()).toHaveLength(1);
  });

  it('an open editor: a press on a grip drags nothing', () => {
    const t = dmake({ rows: flatRows(6) });
    const cell = document.createElement('div');
    t.ctx.editor = { key: t.K('r1'), column: 'n', cell, field: cell };
    t.drag('r0', ['r3', 0.7]);
    expect(t.dragging()).toBe(false);
    expect(t.moves()).toHaveLength(0);
  });

  it('a second finger or another button never drags', () => {
    const t = dmake({ rows: flatRows(6) });
    t.drag('r0', ['r3', 0.7], { init: { isPrimary: false } });
    t.drag('r0', ['r3', 0.7], { init: { button: 2 } });
    expect(t.moves()).toHaveLength(0);
  });
});

describe('a tree\'s grip', () => {
  it('sits after the chevron in the tree column, once, whatever the features\' order', () => {
    for (const first of [true, false]) {
      const tr = tree<R>({ parentId: (x) => x.parent ?? null, initial: 'all' });
      const rows: R[] = [{ id: 'P', name: 'P', n: 0, s: 's', q: 0, parent: null }, { id: 'c', name: 'c', n: 1, s: 's', q: 1, parent: 'P' }];
      const t = first ? dmake({ rows, before: [tr] }) : dmake({ rows, after: [tr] });
      t.g.api.refresh();
      const cell = t.cell('P')!;
      expect([...cell.children].map((c) => c.className).slice(0, 2), String(first)).toEqual(['dzg-toggle', 'dzg-grip']);
      expect(cell.querySelectorAll('.dzg-toggle, .dzg-grip')).toHaveLength(2);
      cleanup();
    }
  });
});

describe('drop targets (23)', () => {
  it('over a target that accepts: no line, marked; released: drop(keys) once, nothing moved; a throw is reported', () => {
    const t = dmake({ rows: flatRows(6) });
    const zone = document.body.appendChild(document.createElement('div'));
    zone.getBoundingClientRect = () => ({ left: 0, right: 600, top: 500, bottom: 560, width: 600, height: 60, x: 0, y: 500, toJSON: () => ({}) }) as DOMRect;
    const drop = vi.fn();
    const off = t.api().dropTargets.add(zone, { accept: (keys) => keys.length === 1, drop });
    t.drag('r1', { clientX: 60, clientY: 520 }, { noUp: true });
    expect(zone.getAttribute('data-dzg-drop')).toBe('over');
    expect(t.bar()!.hidden).toBe(true);
    t.up({ clientX: 60, clientY: 520 });
    expect(drop).toHaveBeenCalledTimes(1);
    expect(drop.mock.calls[0]![0]).toEqual([t.K('r1')]);
    expect(zone.hasAttribute('data-dzg-drop')).toBe(false);
    expect(t.moves()).toHaveLength(0);
    const report = vi.spyOn(t.ctx, 'report').mockImplementation(() => {});
    off();
    t.api().dropTargets.add(zone, { accept: () => true, drop: () => { throw new Error('x'); } });
    t.drag('r1', { clientX: 60, clientY: 520 });
    expect(report).toHaveBeenCalledTimes(1);
  });
});
