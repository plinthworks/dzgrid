// Moving rows by the keys, the menu and the API (Phase 9, docs/behaviors/row-move.md 17–22, 24–26): Alt+Shift+↑ / ↓ /
// Home / End among siblings, the focus kept, the edge said once per pause, the place said after 300 ms, the selection's
// rows moved together, `aria-keyshortcuts` on the focused cell only, Ctrl+Z never undoes a move, the cell menu's items
// (labels, keys, disabled at an edge, acting as the key), the texts required, French. Expectations by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { contextMenu } from '../src/context-menu.js';
import type { MenuItem } from '../src/context-menu.js';
import { rowDrag } from '../src/row-drag.js';
import { tree } from '../src/tree.js';
import { EN_CONTEXT_MENU } from '../src/locales/en-context-menu.js';
import { cleanup, dmake, DMSG, flatRows, join, rowsOf } from './support-row-drag.js';
import { rmake } from './support-range.js';

afterEach(cleanup);

describe('the keys (17–19)', () => {
  it('Alt+Shift+↓ / ↑ one place, Home / End the edges; the focus stays on the row; the place said once the keys pause', () => {
    vi.useFakeTimers();
    const t = dmake({ rows: flatRows(6) });
    t.app(flatRows(6));
    t.focus('r2', 'n');
    const e = t.altShift('ArrowDown');
    expect(e.defaultPrevented).toBe(true);
    expect(t.order()).toEqual(['r0', 'r1', 'r3', 'r2', 'r4', 'r5']);
    t.altShift('ArrowDown');
    expect(t.order()).toEqual(['r0', 'r1', 'r3', 'r4', 'r2', 'r5']);
    expect(t.said()).toEqual([]);
    vi.advanceTimersByTime(300);
    expect(t.said()).toEqual(['Row 5 of 6']);
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: t.K('r2'), column: 'n' });
    expect(t.where()).toBe('r2/n');
    t.altShift('ArrowUp');
    expect(t.order()).toEqual(['r0', 'r1', 'r3', 'r2', 'r4', 'r5']);
    t.altShift('Home');
    expect(t.order()).toEqual(['r2', 'r0', 'r1', 'r3', 'r4', 'r5']);
    t.altShift('End');
    expect(t.order()).toEqual(['r0', 'r1', 'r3', 'r4', 'r5', 'r2']);
    expect(t.moves().map((m) => m.via)).toEqual(['keys', 'keys', 'keys', 'keys', 'keys']);
  });

  it('at an edge nothing moves and « Already at the edge » is said, once while the key is held', () => {
    vi.useFakeTimers();
    const t = dmake({ rows: flatRows(3) });
    t.focus('r0');
    t.altShift('ArrowUp');
    t.altShift('ArrowUp');
    t.altShift('Home');
    expect(t.moves()).toHaveLength(0);
    expect(t.said()).toEqual(['Already at the edge']);
    vi.advanceTimersByTime(400);
    t.altShift('ArrowUp');
    expect(t.said()).toEqual(['Already at the edge', 'Already at the edge']);
  });

  it('a selected focused row moves the selection\'s rows with it; plain Shift or Alt alone, Ctrl+Alt: not a move', () => {
    vi.useFakeTimers();
    const t = dmake({ rows: flatRows(6), settings: { selection: { mode: 'multi' } } });
    t.app(flatRows(6));
    t.g.kernel.dispatch({ type: 'selection.only', row: t.K('r1') }, 'api');
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.K('r2') }, 'api');
    t.focus('r2');
    t.altShift('ArrowDown');
    expect(t.order()).toEqual(['r0', 'r3', 'r1', 'r2', 'r4', 'r5']);
    vi.advanceTimersByTime(300);
    expect(t.said()).toEqual(['2 rows moved']);
    t.press('ArrowDown', { shiftKey: true });
    t.press('ArrowDown', { altKey: true });
    t.press('ArrowDown', { altKey: true, ctrlKey: true, shiftKey: true });
    expect(t.moves()).toHaveLength(1);
  });

  it('aria-keyshortcuts on the focused cell only (and the tree\'s keys only in a tree)', () => {
    const t = dmake({ rows: flatRows(6) });
    t.focus('r2', 'n');
    expect(t.cell('r2', 'n')!.getAttribute('aria-keyshortcuts')).toBe('Alt+Shift+ArrowUp Alt+Shift+ArrowDown Alt+Shift+Home Alt+Shift+End');
    t.focus('r3', 'n');
    expect(t.cell('r2', 'n')!.hasAttribute('aria-keyshortcuts')).toBe(false);
    expect(t.ctx.el.layer.querySelectorAll('[aria-keyshortcuts]')).toHaveLength(1);
    expect(t.grip('r3')!.hasAttribute('aria-keyshortcuts')).toBe(false);
  });

  it('Ctrl+Z never undoes a move (26): no edit feature, nothing; the opposite key does', () => {
    vi.useFakeTimers();
    const t = dmake({ rows: flatRows(4) });
    t.app(flatRows(4));
    t.focus('r1');
    t.altShift('ArrowDown');
    t.press('z', { ctrlKey: true });
    expect(t.order()).toEqual(['r0', 'r2', 'r1', 'r3']);
    t.altShift('ArrowUp');
    expect(t.order()).toEqual(['r0', 'r1', 'r2', 'r3']);
  });
});

describe('review fixes', () => {
  it('a row that never moves (a path tree\'s folder row): Alt+Shift+↓ is not taken', () => {
    const rows = [{ id: 'x', name: 'x', n: 0, s: 's', q: 0 }, { id: 'y', name: 'y', n: 1, s: 's', q: 1 }];
    const t = dmake({ rows, before: [tree<(typeof rows)[number]>({ path: (r) => ['F', r.id], initial: 'all' })] });
    const d = t.g.kernel.rows.displayed;
    const folder = d.keyAt(d.index(0)!);
    expect(d.nodeAt(d.index(0)!).kind).toBe('group');
    t.g.api.focusCell(folder, 'name');
    const e = t.altShift('ArrowDown');
    expect(e.defaultPrevented).toBe(false);
    expect(t.moves()).toHaveLength(0);
  });

  it('rows never given back: nothing said later when the rows change for another reason (5 s)', () => {
    vi.useFakeTimers();
    const t = dmake({ rows: flatRows(4) });
    t.focus('r0');
    t.altShift('ArrowDown');
    vi.advanceTimersByTime(5000);
    (t.g.kernel.rows as { setRows(r: unknown[]): unknown }).setRows(flatRows(4).reverse());
    vi.advanceTimersByTime(300);
    expect(t.said()).toEqual([]);
  });
});

describe('the API (24)', () => {
  it('move(keys, target) and step(key, by): the same rules, source api; unknown rows', () => {
    const t = dmake({ rows: flatRows(5) });
    t.app(flatRows(5));
    expect(t.api().move([t.K('r4')], { key: t.K('r0'), where: 'before' })).toBe('moved');
    expect(t.moves()[0]).toMatchObject({ source: 'api', via: 'api' });
    expect(t.order()).toEqual(['r4', 'r0', 'r1', 'r2', 'r3']);
    expect(t.api().step(t.K('r4'), -1)).toBe('edge');
    expect(t.api().step(t.K('zz'), 1)).toBe('unknown');
    expect(t.api().move([t.K('r1')], { key: t.K('r0'), where: 'after' })).toBe('edge');
    expect(t.said()).toEqual([]);
  });
});

describe('the cell menu (22)', () => {
  const MSG = join(DMSG.en, EN_CONTEXT_MENU);
  it('Move up / down / to top / to bottom with their keys, disabled at an edge; acting as the key, said at once', () => {
    const f = rowDrag();
    let items: readonly MenuItem<never>[] = [];
    const cm = contextMenu({ items: (c, d) => [...d, { separator: true }, ...f.menuItems(c)] });
    const t = rmake({ rows: rowsOf(4), messages: MSG, features: () => [f, cm] });
    // The application's rows given back on each move.
    let rows = rowsOf(4);
    t.g.kernel.subscribe((e) => e.type === 'rowMove' && (rows = [rows[0]!, rows[2]!, rows[1]!, rows[3]!], (t.g.kernel.rows as { setRows(r: unknown[]): unknown }).setRows(rows)));
    items = f.menuItems({ key: t.g.kernel.rows.displayed.keyAt(t.g.kernel.rows.displayed.index(0)!), grid: t.g } as never) as never; // never: a cell menu context by hand (its key and grid are what is read)
    expect(items.map((i) => [i.id, i.label, i.keys, !!i.disabled])).toEqual([
      ['rowMove.up', 'Move up', 'Alt+Shift+ArrowUp', true],
      ['rowMove.down', 'Move down', 'Alt+Shift+ArrowDown', false],
      ['rowMove.top', 'Move to top', 'Alt+Shift+Home', true],
      ['rowMove.bottom', 'Move to bottom', 'Alt+Shift+End', false],
    ]);
    const k1 = t.g.kernel.rows.displayed.keyAt(t.g.kernel.rows.displayed.index(1)!);
    const down = (f.menuItems({ key: k1, grid: t.g } as never) as MenuItem<never>[]).find((i) => i.id === 'rowMove.down')!; // never: as above
    down.action!(undefined as never); // never: the action reads its row from the context it was built with
    expect(t.events.filter((e) => e.type === 'rowMove').map((e) => (e as { via: string }).via)).toEqual(['menu']);
    expect(t.said()).toEqual(['Row 3 of 4']);
    // A grid without the feature: no items.
    expect(rowDrag().menuItems({ key: k1, grid: t.g } as never)).toEqual([]); // never: as above
  });

  it('in a tree also Indent / Outdent; sorted: every item disabled', () => {
    const f = rowDrag();
    const t = rmake({ rows: rowsOf(3), messages: DMSG.en, features: () => [f] });
    t.g.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'api');
    const items = f.menuItems({ key: t.g.kernel.rows.displayed.keyAt(t.g.kernel.rows.displayed.index(1)!), grid: t.g } as never) as MenuItem<never>[]; // never: as above
    expect(items.every((i) => i.disabled)).toBe(true);
    expect(items).toHaveLength(4);
  });
});

describe('texts', () => {
  it('a grid without the -row-drag texts refuses rowDrag() at setup, naming them; French and Arabic bundles complete', async () => {
    expect(() => rmake({ rows: rowsOf(2), features: () => [rowDrag()] })).toThrow(/rowDrag: missing rmove\./);
    const { FR_ROW_DRAG } = await import('../src/locales/fr-row-drag.js');
    const { AR_ROW_DRAG } = await import('../src/locales/ar-row-drag.js');
    const { EN_ROW_DRAG, } = await import('../src/locales/en-row-drag.js');
    const { ROW_DRAG_KEYS } = await import('../src/row-drag.js');
    for (const b of [EN_ROW_DRAG, FR_ROW_DRAG, AR_ROW_DRAG]) expect(Object.keys(b.text).sort()).toEqual([...ROW_DRAG_KEYS].sort());
    expect([FR_ROW_DRAG.text['rmove.up'], FR_ROW_DRAG.text['rmove.down'], FR_ROW_DRAG.text['rmove.top'], FR_ROW_DRAG.text['rmove.bottom'], FR_ROW_DRAG.text['rmove.in'], FR_ROW_DRAG.text['rmove.out']]).toEqual(['Monter', 'Descendre', 'En haut', 'En bas', 'Rentrer', 'Ressortir']);
  });

  it('French: the place said in French', () => {
    vi.useFakeTimers();
    const t = dmake({ rows: flatRows(4), lang: 'fr' });
    t.app(flatRows(4));
    t.focus('r0');
    t.altShift('ArrowDown');
    vi.advanceTimersByTime(300);
    expect(t.said()).toEqual(['Ligne 2 sur 4']);
  });
});
