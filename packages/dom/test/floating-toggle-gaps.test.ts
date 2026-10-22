// Gaps of the floating toggle (Phase 4 step 12): kinds the row only summarises, IME, popups, columns while hidden,
// two grids on one feature, bind/unbind hygiene, announcements, aria-rowindex. docs/behaviors/floating-toggle.md.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { GridFeature } from '../src/features.js';
import { filters } from '../src/filters.js';
import { COLUMNS, MESSAGES, ROWS, cleanup, make } from './support-filters.js';

afterEach(cleanup);

type T = ReturnType<typeof make>;
const head = (t: T, col: string) => t.host.querySelector<HTMLElement>(`.dzg-hcell[data-col="${col}"]:not(.dzg-hextra):not(.dzg-hgroup)`)!;
const button = (text = '') => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  document.body.append(b);
  return b;
};
const attrs = (el: Element) => [...el.attributes].map((a) => `${a.name}=${a.value}`).sort();
/** Every row's aria-rowindex, header then body, in visual (index) order: 1..n with no hole, no duplicate. */
const allIndex = (t: T) => [...t.host.querySelectorAll<HTMLElement>('[role=row]')].map((r) => Number(r.getAttribute('aria-rowindex'))).sort((a, b) => a - b);

describe('kinds the row only summarises: day and set', () => {
  const COLS = [...COLUMNS, { id: 'c', header: 'City', value: (r: { name: string }) => r.name, filter: { kind: 'set' as const } }];

  it('a day range and a set set while hidden come back as summaries, no event, the query untouched', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f], columns: COLS as never });
    f.floating.set(false);
    const day = { type: 'day', op: 'betweenDays', value: '2024-01-01', valueTo: '2024-02-01' };
    const set = { type: 'set', include: ['ann0', 'bob1'] };
    expect(t.g.kernel.dispatch({ type: 'filter.column', column: 'd', filter: day } as never, 'host').ok).toBe(true);
    expect(t.g.kernel.dispatch({ type: 'filter.column', column: 'c', filter: set } as never, 'host').ok).toBe(true);
    const q = JSON.stringify(t.g.kernel.query.filter);
    const n = t.events.length;
    f.floating.set(true);
    expect(t.cell('d').textContent).toContain('Filter active');
    expect(t.cell('c').textContent).toContain('Filter active');
    expect(t.input('d')).toBeNull();
    expect(JSON.stringify(t.g.kernel.query.filter)).toBe(q);
    expect(t.events.slice(n).filter((e) => e.type === 'filterChanged' || e.type === 'problems')).toEqual([]);
    // Hidden again, then shown: the same.
    f.floating.set(false);
    f.floating.set(true);
    expect(JSON.stringify(t.g.kernel.query.filter)).toBe(q);
    expect(t.cell('c').querySelector('.dzg-fclear')).not.toBeNull();
  });

  it('a set popup opened from its summary, focus inside, closes on hide; focus to the header; the set filter kept', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f], columns: COLS as never });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'c', filter: { type: 'set', include: ['ann0'] } } as never, 'host');
    const s = t.cell('c').querySelector<HTMLElement>('.dzg-fsum')!;
    expect(s.tagName).toBe('BUTTON');
    t.cell('c').focus();
    s.click();
    const pop = t.host.querySelector<HTMLElement>('.dzg-popup');
    expect(pop).not.toBeNull();
    pop!.querySelector<HTMLElement>('input,button')?.focus();
    expect(pop!.contains(document.activeElement)).toBe(true);
    f.floating.set(false);
    expect(t.host.querySelector('.dzg-popup')).toBeNull();
    expect(document.activeElement).toBe(head(t, 'c'));
    expect(t.g.kernel.focus).toEqual({ kind: 'header', column: 'c' });
    expect(t.g.kernel.query.filter['c']).toEqual({ type: 'set', include: ['ann0'] });
  });

  it('a day popup opened from the row closes on hide, nothing applied', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    t.cell('d').focus();
    t.press('ArrowDown', { altKey: true });
    expect(t.host.querySelector('.dzg-popup')).not.toBeNull();
    const n = t.filterEvents().length;
    f.floating.set(false);
    expect(t.host.querySelector('.dzg-popup')).toBeNull();
    expect(t.filterEvents()).toHaveLength(n);
    expect(document.activeElement).toBe(head(t, 'd'));
  });
});

describe('IME composition at hide', () => {
  it('a composition in progress is not applied at the hide (not final text)', () => {
    vi.useFakeTimers();
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    const i = t.input('name')!;
    i.focus();
    i.dispatchEvent(new CompositionEvent('compositionstart'));
    i.value = 'にほ';
    i.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    f.floating.set(false);
    vi.advanceTimersByTime(1000);
    expect(t.g.kernel.query.filter['name']).toBeUndefined();
    expect(t.filterEvents()).toHaveLength(0);
  });

  // Was a bug: the box's `typed` read `input!.value` after its destroy set `input = null`: a compositionend (or an input)
  // the browser delivers to the detached box once the row hid threw, and the error went to window.onerror.
  it('a compositionend delivered to the detached box after the hide does not throw', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    const i = t.input('name')!;
    i.focus();
    i.dispatchEvent(new CompositionEvent('compositionstart'));
    i.value = 'にほん';
    f.floating.set(false);
    expect(i.isConnected).toBe(false);
    const errors: unknown[] = [];
    const on = (e: ErrorEvent) => (errors.push(e.error), e.preventDefault());
    window.addEventListener('error', on);
    i.dispatchEvent(new CompositionEvent('compositionend', { data: 'にほん' }));
    window.removeEventListener('error', on);
    expect(errors).toEqual([]);
  });
});

describe('columns changed while hidden', () => {
  it('a column removed while hidden: no cell for it when shown, the others aligned, its filter dropped with it', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    f.floating.set(false);
    t.g.update({ columns: COLUMNS.filter((c) => c.id !== 'n') } as never);
    f.floating.set(true);
    const [h, x] = t.hrows();
    const ids = (r: HTMLElement) => [...r.querySelectorAll<HTMLElement>('[data-col]')].map((c) => c.dataset['col']);
    expect(ids(x!)).toEqual(ids(h!));
    expect(t.cell('n')).toBeNull();
    expect(t.input('name')).not.toBeNull();
  });

  it('a pending edit for a column removed in the same breath as the hide is not applied to nothing', () => {
    vi.useFakeTimers();
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    t.type('n', '7');
    t.g.update({ columns: COLUMNS.filter((c) => c.id !== 'n') } as never);
    f.floating.set(false);
    vi.advanceTimersByTime(1000);
    expect(t.problems()).toEqual([]);
    expect(t.g.kernel.query.filter['n']).toBeUndefined();
  });

  it('a column pinned or hidden while the row is hidden: shown, every header cell has its floating cell', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    f.floating.set(false);
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'd', pinned: 'start' }, { id: 'n', hidden: true }] } as never, 'user');
    f.floating.set(true);
    const [h, x] = t.hrows();
    const ids = (r: HTMLElement) => [...r.querySelectorAll<HTMLElement>('[data-col]')].map((c) => c.dataset['col']).sort();
    expect(ids(x!)).toEqual(ids(h!));
    expect(ids(x!)).not.toContain('n');
    expect(t.cell('d')).not.toBeNull();
  });
});

describe('aria-rowindex across header and body after every toggle', () => {
  it('1..n with no hole and no duplicate, aria-rowcount the count, through a series of toggles and scrolls', () => {
    const f = filters({ floating: false });
    const t = make({ features: [f] });
    const b = button();
    f.floating.bind(b);
    for (let i = 0; i < 6; i++) {
      if (i % 2) f.floating.set(!f.floating.get());
      else b.click();
      t.box.scrollTop = i * 40;
      t.vp.dispatchEvent(new Event('scroll'));
      const idx = allIndex(t);
      const hr = t.hrows().length;
      expect(idx.slice(0, hr)).toEqual(Array.from({ length: hr }, (_, k) => k + 1));
      // The body rows mounted are consecutive, right after the header when at the top.
      const body = idx.slice(hr);
      expect(new Set(idx).size).toBe(idx.length);
      for (let k = 1; k < body.length; k++) expect(body[k]).toBe(body[k - 1]! + 1);
      expect(Math.max(...idx)).toBeLessThanOrEqual(Number(t.vp.getAttribute('aria-rowcount')));
      expect(t.vp.getAttribute('aria-rowcount')).toBe(String(ROWS.length + hr));
    }
  });
});

describe('announcements', () => {
  it('exactly one sentence per click, none for set(), none at bind or unbind, none for a click on an unbound button', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    const said = vi.spyOn(t.live, 'announce');
    const b = button();
    const off = f.floating.bind(b);
    expect(said).not.toHaveBeenCalled();
    b.click();
    expect(said.mock.calls).toEqual([['Filter row hidden']]);
    f.floating.set(true);
    f.floating.set(false);
    expect(said).toHaveBeenCalledTimes(1);
    off();
    b.click();
    expect(said).toHaveBeenCalledTimes(1);
    expect(f.floating.get()).toBe(false);
  });

  // Was a bug: binding the same button twice added a second listener: one click toggled twice (no change) and said both
  // sentences; the second bind also saw the first's aria-label and took the words for the host's.
  it('binding the same button twice: a click still toggles once and says one sentence', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    const said = vi.spyOn(t.live, 'announce');
    const b = button();
    f.floating.bind(b);
    f.floating.bind(b);
    b.click();
    expect(f.floating.get()).toBe(false);
    expect(said).toHaveBeenCalledTimes(1);
  });
});

describe('bind / unbind hygiene', () => {
  it('an icon button bound then unbound after the grid: back to exactly its own attributes', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    const t2 = (_: unknown) => t.g.update({ messages: { ...MESSAGES } } as never);
    const b = button();
    b.className = 'icon';
    const before = attrs(b);
    const off = f.floating.bind(b);
    expect(b.hasAttribute('aria-label')).toBe(true);
    off();
    expect(attrs(b)).toEqual(before);
    // Later changes and paints leave the unbound button alone.
    f.floating.set(false);
    t2(f);
    expect(attrs(b)).toEqual(before);
  });

  it('bound before the grid, unbound after: the aria-label given at the grid’s first paint goes too', () => {
    const f = filters({ floating: true });
    const b = button();
    const before = attrs(b);
    const off = f.floating.bind(b);
    make({ features: [f] });
    expect(b.getAttribute('aria-label')).toBe('Filter row');
    off();
    expect(attrs(b)).toEqual(before);
  });

  it('a button with its own words keeps its aria-label through bind and unbind', () => {
    const f = filters({ floating: true });
    make({ features: [f] });
    const b = button();
    b.setAttribute('aria-label', 'Mine');
    const off = f.floating.bind(b);
    expect(b.getAttribute('aria-label')).toBe('Mine');
    off();
    expect(b.getAttribute('aria-label')).toBe('Mine');
  });

  // Was a bug: unbind removed aria-pressed / aria-controls outright instead of restoring the host's own values.
  it('a host’s own aria-controls (or aria-pressed) is given back at unbind, not deleted', () => {
    const f = filters({ floating: true });
    make({ features: [f] });
    const b = button('Filters');
    b.setAttribute('aria-controls', 'side-panel');
    const off = f.floating.bind(b);
    off();
    expect(b.getAttribute('aria-controls')).toBe('side-panel');
  });

  it('the host’s own aria-pressed is given back too; a button with neither has neither after unbind', () => {
    const f = filters({ floating: true });
    make({ features: [f] });
    const b = button('Filters');
    b.setAttribute('aria-pressed', 'mixed');
    const off = f.floating.bind(b);
    expect(b.getAttribute('aria-pressed')).toBe('true');
    off();
    expect(b.getAttribute('aria-pressed')).toBe('mixed');
    expect(b.hasAttribute('aria-controls')).toBe(false);
  });

  it('bound twice: the original name kept; the old unbind is a no-op; the newest unbinds once, idempotent', () => {
    const f = filters({ floating: true });
    make({ features: [f] });
    const b = button();
    const before = attrs(b);
    const old = f.floating.bind(b);
    const off = f.floating.bind(b);
    // The second bind did not take the bundle's name for the host's own words.
    expect(b.getAttribute('aria-label')).toBe('Filter row');
    old();
    expect(b.getAttribute('aria-pressed')).toBe('true');
    b.click();
    expect(f.floating.get()).toBe(false);
    off();
    expect(attrs(b)).toEqual(before);
    off();
    old();
    expect(attrs(b)).toEqual(before);
    b.click();
    expect(f.floating.get()).toBe(false);
    // Bound again after an unbind: the earlier unbinds do not strip the new marks.
    f.floating.bind(b);
    old();
    off();
    expect(b.getAttribute('aria-pressed')).toBe('false');
  });

  it('the grid gets one id: binding again or re-painting does not change it', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    const a = button();
    const b = button();
    f.floating.bind(a);
    const id = a.getAttribute('aria-controls');
    f.floating.bind(b);
    f.floating.set(false);
    expect(b.getAttribute('aria-controls')).toBe(id);
    expect(t.vp.id).toBe(id);
  });
});

describe('two grids on one filters() object (documented: the last grid set up)', () => {
  it('set() acts on the last grid only; the first keeps its row; destroying the last leaves the first alone', () => {
    const f = filters({ floating: true });
    const a = make({ features: [f] });
    const b = make({ features: [f] });
    f.floating.set(false);
    expect(b.hrows()).toHaveLength(1);
    expect(a.hrows()).toHaveLength(2);
    b.g.destroy();
    expect(() => f.floating.set(true)).not.toThrow();
    expect(a.hrows()).toHaveLength(2);
    // The first grid still filters from its own row.
    a.type('name', 'ann');
    a.input('name')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(a.g.kernel.query.filter['name']).toEqual({ type: 'text', op: 'contains', value: 'ann' });
  });
});

describe('another feature’s header rows', () => {
  const extra: GridFeature = {
    id: 'extra',
    setup: () => ({ headerRows: [{ id: 'extra.row', mount: (cell: HTMLElement) => void (cell.textContent = 'x'), update: () => {} }], destroy() {} }) as never,
  };

  // Was a bug: show appended the floating row at the end of g.headerRows; a feature listed after filters had its row
  // under the floating row at creation, above it after a hide and show: the rows swapped places.
  it('a feature’s row listed after filters stays under the floating row after hide and show', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f, extra] });
    const first = t.hrows().map((r) => r.querySelector('.dzg-hextra input') ? 'filters' : 'other');
    f.floating.set(false);
    f.floating.set(true);
    expect(t.hrows().map((r) => r.querySelector('.dzg-hextra input') ? 'filters' : 'other')).toEqual(first);
  });

  // Was a bug: leave() moved any header focus with level > 0, also one on another feature's row the hide does not touch.
  it('hiding the floating row leaves a focus on another feature’s row (listed first) where it is', () => {
    const f = filters({ floating: true });
    const t = make({ features: [extra, f] });
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 'name', level: 1 } }, 'user');
    expect(t.g.kernel.focus).toEqual({ kind: 'header', column: 'name', level: 1 });
    f.floating.set(false);
    expect(t.g.kernel.focus).toEqual({ kind: 'header', column: 'name', level: 1 });
  });
});

describe('another feature’s header rows above the floating row', () => {
  const extra: GridFeature = {
    id: 'extra',
    setup: () => ({ headerRows: [{ id: 'extra.row', mount: (cell: HTMLElement) => void (cell.textContent = 'x'), update: () => {} }], destroy() {} }) as never,
  };

  it('a focus on the floating row under another feature’s row goes to its column’s header at the hide', () => {
    const f = filters({ floating: true });
    const t = make({ features: [extra, f] });
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 'name', level: 2 } }, 'user');
    f.floating.set(false);
    expect(t.g.kernel.focus).toEqual({ kind: 'header', column: 'name' });
    f.floating.set(true);
    expect(t.g.kernel.focus).toEqual({ kind: 'header', column: 'name' });
  });
});

describe('more', () => {
  it('two grids: destroying the first (not the last) leaves the toggle on the last', () => {
    const f = filters({ floating: true });
    const a = make({ features: [f] });
    const b = make({ features: [f] });
    a.g.destroy();
    f.floating.set(false);
    expect(b.hrows()).toHaveLength(1);
  });

  it('set(false) before the grid on plain filters() wins over a column that asks for its field', () => {
    const f = filters();
    f.floating.set(false);
    const t = make({ features: [f], columns: [{ id: 'name' }, { id: 'n', type: 'number', filter: { floating: true } }] });
    expect(f.floating.get()).toBe(false);
    expect(t.hrows()).toHaveLength(1);
  });

  it('a focus on a group header (level -1) stays there at the hide', async () => {
    const { spans } = await import('../src/spans.js');
    const f = filters({ floating: true });
    const t = make({ features: [spans(), f], columns: [{ id: 'g', header: 'G', children: [{ id: 'name' }, { id: 'n', type: 'number' }] }] });
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 'name', level: -1 } }, 'user');
    const at = t.g.kernel.focus;
    expect(at).toMatchObject({ kind: 'header', level: -1 });
    f.floating.set(false);
    expect(t.g.kernel.focus).toEqual(at);
  });

  it('filters({ floating: true }) with one column saying floating: false: shown again, that column has no field, the others do', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f], columns: [{ id: 'name', filter: { floating: false } }, { id: 'n', type: 'number' }] });
    f.floating.set(false);
    f.floating.set(true);
    expect(t.input('name')).toBeNull();
    expect(t.input('n')).not.toBeNull();
  });

  it('filters({ floating: true }) with one column asking floating: true: every column has its field', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f], columns: [{ id: 'name' }, { id: 'n', type: 'number', filter: { floating: true } }] });
    f.floating.set(false);
    f.floating.set(true);
    expect(t.input('name')).not.toBeNull();
    expect(t.input('n')).not.toBeNull();
  });

  it('a button whose text is only spaces counts as an icon: it gets the bundle’s name', () => {
    const f = filters({ floating: true });
    make({ features: [f] });
    const b = button('  ');
    f.floating.bind(b);
    expect(b.getAttribute('aria-label')).toBe('Filter row');
  });
});
