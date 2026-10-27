// The column menu's items (Phase 6 step 3, column-menu.md 8–17, 22–23; owner Q-M1, Q3-3, Q3-4, O1, O3, C5; S12-Q12;
// step03-plan §4): each section present, absent or disabled as its feature and the column say; each item's one
// command (source `user`) and its sentence; the focus after it; « Élargir » / « Rétrécir » keeping the menu open, one
// sentence after the pause; the filter and the chooser handed the focus; the application's items (radio, check,
// keepOpen, removed or reordered built-ins, a throwing `items` or `action` reported). Expectations by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, mmake, MCOLS } from './support-column-menu.js';

afterEach(cleanup);

const byKeys = (t: ReturnType<typeof mmake>, col: string) => {
  t.focusHeader(col);
  t.key('F10', { shiftKey: true });
};
const stubs = () => {
  const cols = { move: vi.fn(() => 'moved' as const), autoSize: vi.fn(), autoSizeAll: vi.fn(), resizeMode: vi.fn(() => true) };
  const chooser = { open: vi.fn(() => true) };
  return { cols, chooser, use: { columns: { api: () => cols }, chooser: { api: () => chooser } } };
};

describe('the sections and their order (column-menu.md 8–17)', () => {
  it('everything on: sort | pin | size | move | fill | filter | hide, choose, reset | density; separators between', () => {
    const s = stubs();
    const t = mmake({ with: ['fill', 'filters'], menu: ({ range, fill }) => ({ use: { ...s.use, range, fill: fill! }, density: true }) });
    byKeys(t, 'name');
    expect(t.entries()).toEqual([
      'sort.asc', 'sort.desc', 'sort.none', '|', 'pin.start', 'pin.end', 'pin.none', '|',
      'size.auto', 'size.autoAll', 'size.widen', 'size.narrow', 'size.resize', '|', 'move.start', 'move.end', '|',
      'fill.down', 'fill.end', '|', 'filter', '|', 'hide', 'choose', 'reset', '|',
      'density.compact', 'density.comfortable', 'density.spacious',
    ]);
    // Radio groups in a named group each; the column named on the list.
    const groups = [...t.list()!.querySelectorAll('[role=group]')].map((g) => [g.getAttribute('aria-label'), [...g.querySelectorAll('[role=menuitemradio]')].length]);
    expect(groups).toEqual([['Sort', 3], ['Pin', 3], ['Density', 3]]);
    expect(t.item('hide')!.getAttribute('role')).toBe('menuitem');
    expect(t.items().every((x) => x.tabIndex === (x.dataset['id'] === 'sort.asc' ? 0 : -1))).toBe(true);
  });

  it('nothing else on the grid: sort, pin, widen, narrow, hide, reset only (auto-size, resize, move, fill, filter, choose, density absent)', () => {
    const t = mmake();
    byKeys(t, 'n');
    expect(t.entries()).toEqual(['sort.asc', 'sort.desc', 'sort.none', '|', 'pin.start', 'pin.end', 'pin.none', '|', 'size.widen', 'size.narrow', '|', 'hide', 'reset']);
  });

  it('`sortable: false`: no sort; `resizable: false`: no widen nor narrow', () => {
    const t = mmake({ columns: MCOLS({ n: { sortable: false, resizable: false } }) });
    byKeys(t, 'n');
    expect(t.entries()).toEqual(['pin.start', 'pin.end', 'pin.none', '|', 'hide', 'reset']);
  });
});

describe('sort (column-menu.md 8)', () => {
  it('checked as the column is sorted; a choice replaces the whole sort with this column alone; « No sort » removes this column only', () => {
    const t = mmake();
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'name', dir: 'asc' }, { column: 'n', dir: 'desc' }] }, 'api');
    byKeys(t, 'n');
    expect(['sort.asc', 'sort.desc', 'sort.none'].map(t.checked)).toEqual([false, true, false]);
    expect(t.item('sort.asc')!.getAttribute('role')).toBe('menuitemradio');
    t.item('sort.none')!.click();
    expect(t.g.kernel.query.sort).toEqual([{ column: 'name', dir: 'asc' }]);
    byKeys(t, 'n');
    expect(t.checked('sort.none')).toBe(true);
    t.item('sort.asc')!.click();
    expect(t.g.kernel.query.sort).toEqual([{ column: 'n', dir: 'asc' }]);
    const sorts = t.of('sortChanged') as { source: string }[];
    expect(sorts.slice(1).map((e) => e.source)).toEqual(['user', 'user']);
  });
});

describe('pin (column-menu.md 9, O3)', () => {
  it('« Pin to the start »: one patch (user), said, the focus back on the moved header', () => {
    const t = mmake();
    byKeys(t, 's');
    expect(t.checked('pin.none')).toBe(true);
    t.item('pin.start')!.click();
    expect(t.g.kernel.columns.layout.start.columns.map((c) => c.id)).toEqual(['s']);
    expect((t.of('columnsChanged') as { source: string }[]).map((e) => e.source)).toEqual(['user']);
    expect(t.said().at(-1)).toBe('S pinned to the start');
    expect(document.activeElement).toBe(t.hcell('s'));
    byKeys(t, 's');
    expect(t.checked('pin.start')).toBe(true);
    t.item('pin.none')!.click();
    expect(t.said().at(-1)).toBe('S unpinned');
    byKeys(t, 's');
    t.item('pin.end')!.click();
    expect(t.said().at(-1)).toBe('S pinned to the end');
  });

  it('`movable: false`: the pin items disabled (O3)', () => {
    const t = mmake({ columns: MCOLS({ s: { movable: false } }) });
    byKeys(t, 's');
    expect(['pin.start', 'pin.end', 'pin.none'].map(t.off)).toEqual([true, true, true]);
  });
});

describe('size: widen and narrow (column-menu.md 10, column-resize.md 9)', () => {
  it('±10 px a click, the menu kept open and not moved; one sentence 400 ms after the last click', () => {
    vi.useFakeTimers();
    const t = mmake();
    t.open('n');
    const menu = t.popup()!;
    const place = [menu.style.getPropertyValue('inset-inline-start'), menu.style.getPropertyValue('inset-block-start')];
    for (let i = 0; i < 3; i++) t.item('size.widen')!.click();
    expect(t.popup()).toBe(menu);
    expect([menu.style.getPropertyValue('inset-inline-start'), menu.style.getPropertyValue('inset-block-start')]).toEqual(place);
    expect(t.g.kernel.columns.layout.center.widths.sizeAt(1)).toBe(130);
    expect(t.said().filter((s) => /pixels/.test(s))).toEqual([]);
    vi.advanceTimersByTime(400);
    expect(t.said().filter((s) => /pixels/.test(s))).toEqual(['N: 130 pixels']);
    t.item('size.narrow')!.click();
    expect(t.g.kernel.columns.layout.center.widths.sizeAt(1)).toBe(120);
    // Enter keeps it open too.
    t.item('size.narrow')!.focus();
    t.key('Enter');
    expect(t.list()).not.toBeNull();
    expect(t.g.kernel.columns.layout.center.widths.sizeAt(1)).toBe(110);
  });

  it('disabled at the column\'s maximum (widen) and minimum (narrow)', () => {
    const t = mmake({ columns: MCOLS({ n: { minWidth: 100, maxWidth: 105 } }) });
    t.open('n');
    expect([t.off('size.widen'), t.off('size.narrow')]).toEqual([false, true]);
    t.item('size.widen')!.click();
    // Clamped at 105; widen now disabled.
    expect(t.g.kernel.columns.layout.center.widths.sizeAt(1)).toBe(105);
    expect([t.off('size.widen'), t.off('size.narrow')]).toEqual([true, false]);
  });

  it('auto-size and the keyboard resize only with the step-7 members of the columns feature', () => {
    const s = stubs();
    const t = mmake({ menu: { use: s.use } });
    byKeys(t, 'n');
    t.item('size.auto')!.click();
    // Said by the columns feature (the API alone is silent, column-resize.md 14).
    expect(s.cols.autoSize).toHaveBeenCalledWith(['n'], { say: true });
    byKeys(t, 'n');
    t.item('size.autoAll')!.click();
    expect(s.cols.autoSizeAll).toHaveBeenCalledWith({ say: true });
    byKeys(t, 'n');
    t.item('size.resize')!.click();
    expect(s.cols.resizeMode).toHaveBeenCalledWith('n');
    expect(t.list()).toBeNull();
  });
});

describe('the resize mode from the menu (column-resize.md 1, step06-plan §2 « Mode and menu »)', () => {
  for (const how of ['keys', 'mouse'] as const) {
    it(`${how}: « Resize » closes the menu, the mode is on the header with the focus, and stays after the focus came back`, () => {
      const t = mmake({ with: ['columns'], menu: ({ columns }) => ({ use: { columns: columns! } }) });
      if (how === 'keys') byKeys(t, 'n');
      else {
        // A cell focused, the menu opened with the mouse: the focus goes to the header for the mode.
        t.g.api.focusCell(t.g.kernel.rows.displayed.keyAt(t.g.kernel.rows.displayed.index(1)!), 'q');
        t.open('n');
      }
      t.item('size.resize')!.click();
      expect(t.list()).toBeNull();
      expect(document.activeElement).toBe(t.hcell('n'));
      expect(t.hcell('n')!.hasAttribute('data-dzg-resizing')).toBe(true);
      t.key('ArrowRight');
      expect(t.g.kernel.columns.layout.center.widths.sizeAt(1)).toBe(110);
      expect(t.hcell('n')!.hasAttribute('data-dzg-resizing')).toBe(true);
    });
  }
});

describe('move (column-menu.md 11, WCAG 2.5.7)', () => {
  it('through a real columns(): one place, said as the keys; disabled at the segment\'s edges and for `movable: false`', () => {
    const t = mmake({ with: ['columns'], columns: MCOLS({ q: { movable: false } }), menu: ({ columns }) => ({ use: { columns: columns! } }) });
    byKeys(t, 'n');
    expect([t.off('move.start'), t.off('move.end')]).toEqual([false, false]);
    t.item('move.end')!.click();
    expect(t.order()).toEqual(['name', 's', 'n', 'q']);
    expect(t.said().at(-1)).toBe('N: column 3 of 4');
    expect(document.activeElement).toBe(t.hcell('n'));
    byKeys(t, 'name');
    expect([t.off('move.start'), t.off('move.end')]).toEqual([true, false]);
    t.key('Escape');
    byKeys(t, 'q');
    expect([t.off('move.start'), t.off('move.end')]).toEqual([true, true]);
  });
});

describe('hide (column-menu.md 13, O1)', () => {
  it('hidden, said, the focus on the nearest visible header (never lost)', () => {
    const t = mmake();
    byKeys(t, 's');
    t.item('hide')!.click();
    expect(t.order()).toEqual(['name', 'n', 'q']);
    expect(t.said().at(-1)).toBe('S hidden');
    expect(t.g.kernel.focus?.kind).toBe('header');
    expect(document.activeElement?.classList.contains('dzg-hcell')).toBe(true);
    expect(document.activeElement).toBe(t.hcell((t.g.kernel.focus as { column: string }).column));
  });

  it('`hideable: false` and the last visible column: disabled', () => {
    const t = mmake({ columns: MCOLS({ n: { hideable: false } }) });
    byKeys(t, 'n');
    expect(t.off('hide')).toBe(true);
    t.key('Escape');
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'name', hidden: true }, { id: 's', hidden: true }, { id: 'n', hidden: true }] }, 'api');
    byKeys(t, 'q');
    expect(t.off('hide')).toBe(true);
  });
});

describe('reset (column-menu.md 15, Q3-3)', () => {
  it('order, widths (a flexible one flexible again), pins and hidden back to the definitions in one patch; sort untouched; said; disabled when nothing differs', () => {
    const t = mmake({ with: ['columns'], columns: MCOLS({ q: { width: undefined, flex: 1 }, s: { hidden: false } }) });
    const L = () => t.g.kernel.columns.layout;
    const start = () => JSON.stringify((['start', 'center', 'end'] as const).map((x) => L()[x].columns.map((c, i) => `${c.id}:${L()[x].widths.sizeAt(i)}`)));
    const before = start();
    byKeys(t, 'n');
    expect(t.off('reset')).toBe(true);
    t.key('Escape');
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'name', dir: 'asc' }] }, 'api');
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'q', width: 90 }, { id: 'n', pinned: 'start' }, { id: 's', hidden: true }] }, 'user');
    t.cols()!.api(t.g)!.move('name', 1, { say: false });
    expect(start()).not.toBe(before);
    const n = t.of('columnsChanged').length;
    byKeys(t, 'name');
    expect(t.off('reset')).toBe(false);
    t.item('reset')!.click();
    expect(t.of('columnsChanged').length).toBe(n + 1);
    expect(start()).toBe(before);
    expect(t.g.kernel.query.sort).toEqual([{ column: 'name', dir: 'asc' }]);
    expect(t.said().at(-1)).toBe('Columns reset');
    byKeys(t, 'name');
    expect(t.off('reset')).toBe(true);
  });
});

describe('the filter and the chooser hand the focus over (column-menu.md 12, 14, 22)', () => {
  it('« Filter… » where the column has a popup: the menu closes, the filter dialog opens, focused; absent without a popup', () => {
    const t = mmake({ with: ['filters'], columns: MCOLS({ q: { filter: false } }) });
    t.open('name');
    t.item('filter')!.click();
    expect(t.list()).toBeNull();
    const dialog = t.ctx.el.root.querySelector<HTMLElement>('.dzg-popup[role=dialog]');
    expect(dialog).not.toBeNull();
    expect(dialog!.contains(document.activeElement)).toBe(true);
    t.key('Escape');
    t.open('q');
    expect(t.item('filter')).toBeNull();
  });

  it('« Choose columns… »: the chooser opened by the header, the menu closed', () => {
    const s = stubs();
    const t = mmake({ menu: { use: { chooser: s.use.chooser } } });
    byKeys(t, 's');
    t.item('choose')!.click();
    expect(s.chooser.open).toHaveBeenCalledWith(t.hcell('s'));
    expect(t.list()).toBeNull();
  });
});

describe('density (column-menu.md 16, Q-R2, C5, Q3-4)', () => {
  it('off by default; on: a radio group, the grid\'s density checked; a choice changes it, tells the app, is said', () => {
    const d = mmake();
    byKeys(d, 'n');
    expect(d.ids().some((x) => x.startsWith('density'))).toBe(false);
    d.g.destroy();
    const onDensity = vi.fn();
    const t = mmake({ menu: { density: true, onDensity } });
    byKeys(t, 'n');
    expect(t.checked('density.comfortable')).toBe(true);
    t.item('density.compact')!.click();
    expect(t.ctx.el.root.getAttribute('data-density')).toBe('compact');
    expect(onDensity).toHaveBeenCalledWith('compact');
    expect(t.said().at(-1)).toBe('Density: Compact');
    byKeys(t, 'n');
    expect(t.checked('density.compact')).toBe(true);
  });

  it('a choice says `densityChanged` (source `user`, density.md 2; what `@dzgrid/dom/state` saves, step 5); the same one again says nothing', () => {
    const t = mmake({ menu: { density: true } });
    byKeys(t, 'n');
    t.item('density.spacious')!.click();
    expect(t.of('densityChanged')).toEqual([{ type: 'densityChanged', source: 'user', density: 'spacious' }]);
    byKeys(t, 'n');
    t.item('density.spacious')!.click();
    expect(t.of('densityChanged').length).toBe(1);
  });

  it('absent when the row height is a number', () => {
    const t = mmake({ menu: { density: true }, settings: { rowHeight: 40 } });
    byKeys(t, 'n');
    expect(t.ids().some((x) => x.startsWith('density'))).toBe(false);
  });
});

describe('the application\'s items (column-menu.md 17)', () => {
  it('added, removed, reordered by id; radio groups, a check, keepOpen, an icon class, keys shown; host classes; the action told the column', () => {
    const act = vi.fn();
    const t = mmake({
      menu: {
        classes: { menu: 'my-menu', item: 'my-item' },
        items: (col, defaults) => [
          { id: 'mine', label: `Copy ${col.def.header}`, icon: 'i-copy', keys: 'Control+Shift+C', action: (c) => act(c.column) },
          { id: 'view.a', label: 'A', kind: 'radio', group: 'View', checked: true },
          { id: 'view.b', label: 'B', kind: 'radio', group: 'View', keepOpen: true, action: () => act('b') },
          { id: 'wrap', label: 'Wrap', kind: 'check', checked: false },
          { separator: true },
          ...defaults.filter((d) => !('id' in d) || d.id !== 'reset').reverse(),
        ],
      },
    });
    byKeys(t, 'n');
    expect(t.list()!.classList.contains('my-menu')).toBe(true);
    expect(t.items().every((x) => x.classList.contains('my-item'))).toBe(true);
    expect(t.ids().slice(0, 4)).toEqual(['mine', 'view.a', 'view.b', 'wrap']);
    expect(t.ids()).not.toContain('reset');
    expect(t.ids().at(-1)).toBe('sort.asc');
    const mine = t.item('mine')!;
    expect(mine.getAttribute('aria-keyshortcuts')).toBe('Control+Shift+C');
    expect(mine.querySelector('.i-copy')?.getAttribute('aria-hidden')).toBe('true');
    expect(mine.textContent).toContain('Copy N');
    expect(mine.querySelector('[aria-hidden=true]:not(.i-copy)')?.textContent).toBe('Ctrl+Shift+C');
    expect(t.item('view.a')!.closest('[role=group]')!.getAttribute('aria-label')).toBe('View');
    expect(t.item('wrap')!.getAttribute('role')).toBe('menuitemcheckbox');
    expect(t.item('wrap')!.getAttribute('aria-checked')).toBe('false');
    t.item('view.b')!.click();
    expect(act).toHaveBeenCalledWith('b');
    expect(t.list()).not.toBeNull();
    t.item('mine')!.click();
    expect(act).toHaveBeenCalledWith('n');
    expect(t.list()).toBeNull();
    expect(document.activeElement).toBe(t.hcell('n'));
  });

  it('a throwing `items`: the defaults, the error reported; a throwing action: reported, the menu closed', () => {
    const report = vi.fn();
    const t = mmake({ menu: { items: () => { throw new Error('boom'); } } });
    t.ctx.report = report;
    byKeys(t, 'n');
    expect(t.ids()[0]).toBe('sort.asc');
    expect(report).toHaveBeenCalledTimes(1);
    t.key('Escape');
    const u = mmake({ menu: { items: (_c, d) => [{ id: 'x', label: 'X', action: () => { throw new Error('act'); } }, ...d] } });
    u.ctx.report = report;
    byKeys(u, 'n');
    u.item('x')!.click();
    expect(report).toHaveBeenCalledTimes(2);
    expect(u.list()).toBeNull();
  });

  it('`MenuContext.say` speaks through the grid\'s live region', () => {
    const t = mmake({ menu: { items: (_c, d) => [{ id: 'x', label: 'X', action: (c) => c.say('Done') }, ...d] } });
    byKeys(t, 'n');
    t.item('x')!.click();
    expect(t.said().at(-1)).toBe('Done');
  });
});

describe('one feature, several grids', () => {
  it('each grid its own menu and API', () => {
    const a = mmake();
    const b = mmake({ menuFeature: a.menu() });
    a.menuApi().open('n');
    b.menuApi().open('s');
    expect([a.menuApi().current(), b.menuApi().current()]).toEqual(['n', 's']);
  });
});
