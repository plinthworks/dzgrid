// The chooser's list (Phase 6 step 4, docs/behaviors/columns-chooser.md 6–8, 11–13, 22; owner Q-C2, O1; step04-plan
// §1, §4): every listed column in the list's order (start-pinned, centre, end-pinned, hidden ones included, `chooser:
// false` left out), a native checkbox labelled by the header (checked = shown), the pin in its description; the last
// shown and `hideable: false` boxes disabled (`aria-disabled`, still reachable); a tick is one patch, one sentence;
// « Show all » one patch; « Reset » the menu's patch; header groups as named groups; one tab stop (roving); live sync
// keeping the focused box by its column.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, cmake, CCOLS, ccol } from './support-columns-panel.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('the rows', () => {
  it('the list\'s order, hidden ones unchecked, `chooser: false` left out; each a labelled native checkbox', () => {
    const t = cmake({ columns: [...CCOLS(), ccol('secret', 'Secret', { chooser: false })] });
    t.api().open(t.appButton);
    expect(t.rows()).toEqual(['ref', 'name', 'date', 'qty', 'amount', 'note']);
    expect(t.checked()).toEqual(['ref', 'name', 'date', 'amount', 'note']);
    const b = t.box('date')!;
    expect(b.type).toBe('checkbox');
    expect(document.querySelector(`label[for="${b.id}"]`)!.textContent).toBe('Date');
    expect(document.querySelector(`label[for="${b.id}"] bdi`)).not.toBeNull();
    // ▲, ▼ and the handle: named buttons out of the tab order.
    for (const [a, name] of [['up', 'Move Date up'], ['down', 'Move Date down'], ['drag', 'Drag Date']] as const) {
      expect(t.act('date', a)!.getAttribute('aria-label'), a).toBe(name);
      expect(t.act('date', a)!.tabIndex, a).toBe(-1);
    }
  });

  it('the pin in the box\'s description', () => {
    const t = cmake();
    t.api().open(t.appButton);
    const desc = (id: string) => (t.box(id)!.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((x) => document.getElementById(x)!.textContent).join(' ');
    expect(desc('ref')).toBe('pinned to the start');
    expect(desc('note')).toBe('pinned to the end');
    expect(desc('name')).toBe('');
  });

  it('one tab stop: one box at tabindex 0 (the focused one once it moved)', () => {
    const t = cmake();
    t.api().open(t.appButton);
    const zero = () => t.rowEls().map((r) => r.querySelector('input')!).filter((i) => i.tabIndex === 0).map((i) => i.closest('li')!.dataset['col']);
    expect(zero()).toEqual(['ref']);
    t.box('date')!.focus();
    expect(zero()).toEqual(['date']);
  });

  it('header groups: a named group around their columns, nested as defined; a group cut by a pin repeats its name', () => {
    const t = cmake({ columns: [ccol('ref', 'Ref'), { id: 'when', header: 'When', children: [ccol('d1', 'Ordered'), { id: 'ship', header: 'Shipping', children: [ccol('d2', 'Sent'), ccol('d3', 'Arrived')] }] }, ccol('x', 'X')] as never });
    t.api().open(t.appButton);
    expect(t.rows()).toEqual(['ref', 'd1', 'd2', 'd3', 'x']);
    const g = t.row('d2')!.closest<HTMLElement>('[role=group]')!;
    expect(document.getElementById(g.getAttribute('aria-labelledby')!)!.textContent).toBe('Shipping');
    const outer = g.parentElement!.closest<HTMLElement>('[role=group]')!;
    expect(document.getElementById(outer.getAttribute('aria-labelledby')!)!.textContent).toBe('When');
    expect(t.row('ref')!.closest('[role=group]')).toBeNull();
    expect(t.row('d1')!.closest('[role=group]')).toBe(outer);
    // Every list item is in a list; a group sits in a list item.
    for (const li of t.panel()!.querySelectorAll('li')) expect(li.parentElement!.getAttribute('role'), li.outerHTML.slice(0, 40)).toBe('list');
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'd3', pinned: 'start' }] }, 'api');
    expect(t.rows()).toEqual(['d3', 'ref', 'd1', 'd2', 'x']);
    const labels = [...t.panel()!.querySelectorAll('[role=group]')].map((x) => document.getElementById(x.getAttribute('aria-labelledby')!)!.textContent);
    expect(labels).toEqual(['When', 'Shipping', 'When', 'Shipping']);
  });
});

describe('showing and hiding (Q-C2: at once)', () => {
  it('a tick: one patch, one columnsChanged (user), one sentence; again: shown', () => {
    const t = cmake();
    t.api().open(t.appButton);
    t.said().length = 0;
    const before = t.columnsChanged().length;
    t.click(t.box('name')!);
    expect(t.shown()).not.toContain('name');
    expect(t.columnsChanged().length - before).toBe(1);
    expect((t.columnsChanged().at(-1) as { source?: string }).source).toBe('user');
    expect(t.said().at(-1)).toBe('Name hidden');
    t.space(t.box('qty')!);
    expect(t.shown()).toContain('qty');
    expect(t.said().at(-1)).toBe('Qty shown');
    expect(t.box('qty')!.checked).toBe(true);
  });

  it('the last shown column: disabled (aria-disabled, still focusable), described, Space and a click do nothing (O1)', () => {
    const t = cmake({ columns: [ccol('a', 'A'), ccol('b', 'B'), ccol('k', 'K', { hideable: false })] });
    t.api().open(t.appButton);
    expect(t.off('k')).toBe(true);
    expect(t.off('a')).toBe(false);
    t.click(t.box('a')!);
    expect(t.off('b')).toBe(false);
    t.click(t.box('k')!);
    expect(t.shown()).toEqual(['b', 'k']);
    t.click(t.box('b')!);
    expect(t.shown()).toEqual(['k']);
    // A grid of A and B, A hidden: B is the last shown.
    cleanup();
    const u = cmake({ columns: [ccol('a', 'A'), ccol('b', 'B')] });
    u.api().open(u.appButton);
    u.click(u.box('a')!);
    expect(u.off('b')).toBe(true);
    expect(u.box('b')!.disabled).toBe(false);
    const n = u.columnsChanged().length;
    u.click(u.box('b')!);
    u.box('b')!.focus();
    u.space(u.box('b')!);
    expect(u.box('b')!.checked).toBe(true);
    expect(u.shown()).toEqual(['b']);
    expect(u.columnsChanged().length).toBe(n);
    const desc = (u.box('b')!.getAttribute('aria-describedby') ?? '').split(' ').map((x) => document.getElementById(x)?.textContent).join(' ');
    expect(desc).toBe('the last shown column');
  });

  it('« Show all »: every listed column shown in one patch, said; no « Hide all »', () => {
    const t = cmake({ columns: CCOLS({ name: { hidden: true } }) });
    t.api().open(t.appButton);
    const n = t.columnsChanged().length;
    t.click(t.foot('all')!);
    expect(t.shown()).toEqual(['ref', 'name', 'date', 'qty', 'amount', 'note']);
    expect(t.columnsChanged().length - n).toBe(1);
    expect(t.said().at(-1)).toBe('All columns shown');
    expect(t.checked()).toEqual(t.rows());
    expect(t.panel()!.textContent).not.toMatch(/Hide all/);
  });

  it('« Reset »: the menu\'s patch (order, width, hidden, pin from the definitions), said', () => {
    const t = cmake();
    t.api().open(t.appButton);
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'name', hidden: true }, { id: 'amount', order: 0, width: 300 }, { id: 'ref', pinned: null }] }, 'api');
    const n = t.columnsChanged().length;
    t.click(t.foot('reset')!);
    expect(t.columnsChanged().length - n).toBe(1);
    expect(t.g.kernel.columns.state()).toEqual(CCOLS().map((c, order) => ({ id: c.id, order, hidden: !!c.hidden, pinned: c.pinned ?? null })));
    expect(t.said().at(-1)).toBe('Columns reset');
    // Nothing to reset: no patch.
    t.click(t.foot('reset')!);
    expect(t.columnsChanged().length - n).toBe(1);
  });
});

describe('live sync (22)', () => {
  it('a change made elsewhere redraws the list; the focused box keeps the focus by its column', () => {
    const t = cmake();
    t.api().open(t.appButton);
    t.box('amount')!.focus();
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'date', hidden: true }, { id: 'amount', order: -1 }] }, 'api');
    expect(t.box('date')!.checked).toBe(false);
    expect(t.rows()).toEqual(['ref', 'amount', 'name', 'date', 'qty', 'note']);
    expect(t.focused()).toBe('amount');
    expect(t.box('amount')!.tabIndex).toBe(0);
  });
});

describe('long lists (10, owner Q4-3)', () => {
  it('above 200 rows the list is marked long (its rows drawn only when seen, CSS); 200 or fewer: not (WebKit hit-tests a fresh skipped row wrongly)', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ccol(`x${i}`, `X${i}`));
    const t = cmake({ columns: many(201) });
    t.api().open(t.appButton);
    expect(t.panel()!.querySelector('.dzg-cp-list')!.hasAttribute('data-dzg-long')).toBe(true);
    t.type('X1');
    // X1, X10–X19, X100–X199: 111 rows.
    expect(t.rows().length).toBe(111);
    expect(t.panel()!.querySelector('.dzg-cp-list')!.hasAttribute('data-dzg-long')).toBe(false);
    cleanup();
    const u = cmake({ columns: many(200) });
    u.api().open(u.appButton);
    expect(u.panel()!.querySelector('.dzg-cp-list')!.hasAttribute('data-dzg-long')).toBe(false);
  });
});
