// The floating filter row shown and hidden live (Phase 4 step 12; docs/behaviors/floating-toggle.md, owner Q8).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { filters } from '../src/filters.js';
import { spans } from '../src/spans.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_FILTERS } from '../src/locales/en-filters.js';
import { FR_FILTERS } from '../src/locales/fr-filters.js';
import { AR_FILTERS } from '../src/locales/ar-filters.js';
import { COLUMNS, cleanup, make, type R } from './support-filters.js';

afterEach(cleanup);

/** The column header (level 0) of a column. */
const head = (t: ReturnType<typeof make>, col: string) => t.host.querySelector<HTMLElement>(`.dzg-hcell[data-col="${col}"]:not(.dzg-hextra):not(.dzg-hgroup)`)!;
/** The body rows' aria-rowindex, in DOM order. */
const bodyIndex = (t: ReturnType<typeof make>) => [...t.host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')].map((r) => Number(r.getAttribute('aria-rowindex'))).sort((a, b) => a - b);
const button = (text = '') => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  document.body.append(b);
  return b;
};

describe('the API: get, set', () => {
  it('starts as the grid asks: filters({ floating: true }) shown, plain filters() hidden', () => {
    const on = filters({ floating: true });
    expect(on.floating.get()).toBe(true);
    const t = make({ features: [on] });
    expect(on.floating.get()).toBe(true);
    expect(t.hrows()).toHaveLength(2);
    cleanup();
    const off = filters();
    const u = make({ features: [off] });
    expect(off.floating.get()).toBe(false);
    expect(u.hrows()).toHaveLength(1);
  });

  it('shows a row asked by one column only as that column asks (its field), the others empty', () => {
    const f = filters();
    const t = make({ features: [f], columns: [{ id: 'name' }, { id: 'n', type: 'number', filter: { floating: true } }] });
    expect(f.floating.get()).toBe(true);
    f.floating.set(false);
    expect(t.hrows()).toHaveLength(1);
    f.floating.set(true);
    expect(t.input('n')).not.toBeNull();
    expect(t.cell('name').childNodes).toHaveLength(0);
  });

  it('set(true) on a grid made without the row shows a field in every filterable column', () => {
    const f = filters();
    const t = make({ features: [f], columns: [...COLUMNS, { id: 'x', value: (r: R) => r.name, filter: false }] });
    f.floating.set(true);
    expect(t.hrows()).toHaveLength(2);
    expect(t.input('name')).not.toBeNull();
    expect(t.input('n')).not.toBeNull();
    expect(t.cell('x').childNodes).toHaveLength(0);
  });

  it('set before the grid exists is the state it starts with', () => {
    const f = filters({ floating: true });
    f.floating.set(false);
    expect(f.floating.get()).toBe(false);
    const t = make({ features: [f] });
    expect(t.hrows()).toHaveLength(1);
    const g = filters();
    g.floating.set(true);
    cleanup();
    const u = make({ features: [g] });
    expect(u.hrows()).toHaveLength(2);
    expect(u.input('name')).not.toBeNull();
  });

  it('hides and shows in one paint: header rows, aria-rowcount, every header and body aria-rowindex', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    expect(t.vp.getAttribute('aria-rowcount')).toBe('32');
    expect(bodyIndex(t)[0]).toBe(3);
    const paints = (t.g as unknown as { paints: number }).paints;
    f.floating.set(false);
    expect(t.hrows().map((r) => r.getAttribute('aria-rowindex'))).toEqual(['1']);
    expect(t.vp.getAttribute('aria-rowcount')).toBe('31');
    expect(bodyIndex(t)[0]).toBe(2);
    expect(bodyIndex(t)).toEqual(bodyIndex(t).map((_, i) => i + 2));
    // The paint of the change and one after it (the header's height read again).
    expect((t.g as unknown as { paints: number }).paints - paints).toBeLessThanOrEqual(2);
    f.floating.set(true);
    expect(t.hrows().map((r) => r.getAttribute('aria-rowindex'))).toEqual(['1', '2']);
    expect(t.vp.getAttribute('aria-rowcount')).toBe('32');
    expect(bodyIndex(t)[0]).toBe(3);
  });

  it('reads the view’s height again after the change: rows down to the bottom, no overscan to hide a gap', () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ id: `r${i}`, name: `n${i}`, n: i }));
    const mounted = (t: ReturnType<typeof make>) => t.host.querySelectorAll('.dzg-layer > .dzg-row').length;
    // The body's height is the viewport's less the header's, as the browser's geometry reads it.
    const live = (t: ReturnType<typeof make>) => Object.defineProperty(t.box, 'block', { get: () => 400 - t.hrows().length * 40, enumerable: true });
    const f = filters({ floating: true });
    const t = make({ features: [f], rows, settings: { overscan: { rows: 0, cols: 0 } } });
    live(t);
    f.floating.set(false);
    const hidden = mounted(t);
    f.floating.set(true);
    const shown = mounted(t);
    cleanup();
    const u = make({ features: [filters()], rows, settings: { overscan: { rows: 0, cols: 0 } } });
    live(u);
    u.g.api.refresh();
    expect(hidden).toBe(mounted(u));
    expect(hidden).toBeGreaterThan(shown);
  });

  it('counts the group rows too', () => {
    const f = filters({ floating: true });
    const t = make({ features: [spans(), f], columns: [{ id: 'g', header: 'G', children: [{ id: 'name' }, { id: 'n', type: 'number' }] }] });
    expect(t.vp.getAttribute('aria-rowcount')).toBe('33');
    f.floating.set(false);
    expect(t.hrows().map((r) => r.getAttribute('aria-rowindex'))).toEqual(['1', '2']);
    expect(t.vp.getAttribute('aria-rowcount')).toBe('32');
    expect(bodyIndex(t)[0]).toBe(3);
    f.floating.set(true);
    expect(t.hrows().map((r) => r.getAttribute('aria-rowindex'))).toEqual(['1', '2', '3']);
    expect(bodyIndex(t)[0]).toBe(4);
  });

  it('does nothing when the state is the same: no paint, no event', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    const paints = (t.g as unknown as { paints: number }).paints;
    const n = t.events.length;
    f.floating.set(true);
    expect((t.g as unknown as { paints: number }).paints).toBe(paints);
    expect(t.events).toHaveLength(n);
  });

  it('keeps the keys right: Down from a header goes to the row when shown, to the body when hidden', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    f.floating.set(false);
    head(t, 'name').focus();
    t.press('ArrowDown');
    expect(t.g.kernel.focus).toMatchObject({ kind: 'cell', column: 'name' });
    f.floating.set(true);
    head(t, 'name').focus();
    t.press('ArrowDown');
    expect(t.g.kernel.focus).toEqual({ kind: 'header', column: 'name', level: 1 });
  });
});

describe('hiding keeps what the user did', () => {
  it('keeps the filters active and the header marked', () => {
    vi.useFakeTimers();
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    t.type('name', 'ann');
    vi.advanceTimersByTime(150);
    const ids = t.ids();
    f.floating.set(false);
    expect(t.g.kernel.query.filter).toEqual({ name: { type: 'text', op: 'contains', value: 'ann' } });
    expect(t.ids()).toEqual(ids);
    expect(head(t, 'name').hasAttribute('data-dzg-filtered')).toBe(true);
    expect(head(t, 'name').getAttribute('aria-label')).toBe('Name, filtered');
    expect(head(t, 'n').hasAttribute('data-dzg-filtered')).toBe(false);
  });

  it('applies text typed and still waiting (its timer cancelled): one filterChanged, at the hide', () => {
    vi.useFakeTimers();
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    t.type('name', 'an');
    vi.advanceTimersByTime(100);
    t.type('name', 'ann');
    t.type('n', '7');
    expect(t.filterEvents()).toHaveLength(0);
    f.floating.set(false);
    expect(t.g.kernel.query.filter).toEqual({ name: { type: 'text', op: 'contains', value: 'ann' }, n: { type: 'number', op: 'equals', value: 7 } });
    const n = t.filterEvents().length;
    expect(n).toBe(2);
    vi.advanceTimersByTime(1000);
    expect(t.filterEvents()).toHaveLength(n);
  });

  it('moves a focus in a box to the same column’s header', () => {
    vi.useFakeTimers();
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    t.input('n')!.focus();
    t.type('n', '4');
    f.floating.set(false);
    expect(document.activeElement).toBe(head(t, 'n'));
    expect(t.g.kernel.focus).toEqual({ kind: 'header', column: 'n' });
    expect(t.g.kernel.query.filter['n']).toEqual({ type: 'number', op: 'equals', value: 4 });
    // The header cell is the one tab stop.
    expect(head(t, 'n').tabIndex).toBe(0);
  });

  it('moves a focus on a floating cell to the same column’s header', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    t.cell('d').focus();
    expect(t.g.kernel.focus).toEqual({ kind: 'header', column: 'd', level: 1 });
    f.floating.set(false);
    expect(document.activeElement).toBe(head(t, 'd'));
    expect(t.g.kernel.focus).toEqual({ kind: 'header', column: 'd' });
    // Moved by the API's hide: its source.
    expect(t.events.filter((e) => e.type === 'focusChanged').at(-1)).toMatchObject({ source: 'api', focus: { kind: 'header', column: 'd' } });
  });

  it('moves the grid’s focus (no DOM focus in it) without taking the page’s focus', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    t.cell('name').focus();
    const b = button('Filters');
    f.floating.bind(b);
    b.focus();
    b.click();
    expect(f.floating.get()).toBe(false);
    expect(document.activeElement).toBe(b);
    expect(t.g.kernel.focus).toEqual({ kind: 'header', column: 'name' });
    expect(head(t, 'name').tabIndex).toBe(0);
    expect(t.events.filter((e) => e.type === 'focusChanged').at(-1)).toMatchObject({ source: 'user' });
  });

  it('closes a popup opened from the row, the focus on the column’s header', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    t.cell('name').focus();
    t.press('ArrowDown', { altKey: true });
    expect(t.host.querySelector('.dzg-popup')).not.toBeNull();
    f.floating.set(false);
    expect(t.host.querySelector('.dzg-popup')).toBeNull();
    expect(document.activeElement).toBe(head(t, 'name'));
  });

  it('leaves a popup opened from the column header open', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    expect(f.openFilter('name')).toBe(true);
    f.floating.set(false);
    expect(t.host.querySelector('.dzg-popup')).not.toBeNull();
  });

  it('destroys the row’s parts when hidden and makes new ones when shown', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    const before = t.input('name');
    f.floating.set(false);
    expect(before!.isConnected).toBe(false);
    f.floating.set(true);
    expect(t.input('name')).not.toBe(before);
  });
});

describe('showing', () => {
  it('shows each field with the filter in force, without an event or a sentence', () => {
    vi.useFakeTimers();
    const f = filters({ floating: true });
    const t = make({ features: [f], settings: { messages: { ...FR, text: { ...FR.text, ...FR_FILTERS.text } } } });
    t.type('name', 'ann');
    f.floating.set(false);
    // Changed while hidden, by the host.
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'bob' } }, 'host');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'equals', value: 1.5 } }, 'host');
    const said = vi.spyOn(t.live, 'announce');
    const n = t.events.length;
    f.floating.set(true);
    vi.advanceTimersByTime(1000);
    expect(t.input('name')!.value).toBe('bob');
    expect(t.input('n')!.value).toBe('1,5');
    expect(t.events.slice(n).filter((e) => e.type === 'filterChanged' || e.type === 'problems')).toEqual([]);
    expect(said).not.toHaveBeenCalled();
  });

  it('shows a filter its box cannot edit as the summary', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    f.floating.set(false);
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'gt', value: 3 } }, 'host');
    f.floating.set(true);
    expect(t.input('n')).toBeNull();
    expect(t.cell('n').textContent).toContain('Filter active');
  });

  it('keeps the rows’ columns after a column move or an inline scroll while hidden', () => {
    const cols = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, value: (r: R) => r.name, width: 100 }));
    const f = filters({ floating: true });
    const t = make({ features: [f], columns: cols, inline: 500 });
    f.floating.set(false);
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'c0', order: 5 }, { id: 'c5', order: 0 }] }, 'user');
    t.scrollInline(1200);
    f.floating.set(true);
    const [h, x] = t.hrows();
    const ids = (r: HTMLElement) => [...r.querySelectorAll<HTMLElement>('[data-col]')].map((c) => c.dataset['col']);
    expect(ids(x!)).toEqual(ids(h!));
    expect(ids(x!).length).toBeGreaterThan(0);
    expect([...x!.querySelectorAll('[data-col]')].map((c) => c.getAttribute('aria-colindex'))).toEqual([...h!.querySelectorAll('[data-col]')].map((c) => c.getAttribute('aria-colindex')));
  });
});

describe('bind(button)', () => {
  it('works bound before the grid: aria-pressed, aria-controls, the bundle’s label on an icon button', () => {
    const f = filters({ floating: true });
    const b = button();
    f.floating.bind(b);
    expect(b.getAttribute('aria-pressed')).toBe('true');
    const t = make({ features: [f] });
    expect(t.vp.id).not.toBe('');
    expect(b.getAttribute('aria-controls')).toBe(t.vp.id);
    expect(b.getAttribute('aria-label')).toBe('Filter row');
    b.click();
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(t.hrows()).toHaveLength(1);
  });

  it('works bound after the grid; follows the API; keeps a button’s own words', () => {
    const f = filters();
    const t = make({ features: [f] });
    const b = button('Filtres');
    f.floating.bind(b);
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(b.hasAttribute('aria-label')).toBe(false);
    f.floating.set(true);
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(t.hrows()).toHaveLength(2);
  });

  it('says the user’s toggle, never the API’s', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    const said = vi.spyOn(t.live, 'announce');
    const b = button();
    f.floating.bind(b);
    b.click();
    expect(said).toHaveBeenLastCalledWith('Filter row hidden');
    b.click();
    expect(said).toHaveBeenLastCalledWith('Filter row shown');
    expect(said).toHaveBeenCalledTimes(2);
    f.floating.set(false);
    f.floating.set(true);
    expect(said).toHaveBeenCalledTimes(2);
  });

  it('keeps two buttons in step; the unbind stops the clicks and takes its marks away', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    const a = button();
    const b = button();
    const offA = f.floating.bind(a);
    f.floating.bind(b);
    a.click();
    expect(b.getAttribute('aria-pressed')).toBe('false');
    offA();
    expect(a.hasAttribute('aria-pressed')).toBe(false);
    expect(a.hasAttribute('aria-label')).toBe(false);
    a.click();
    expect(f.floating.get()).toBe(false);
    expect(t.hrows()).toHaveLength(1);
  });

  it('follows the language: the label and the sentences in French, then Arabic', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f] });
    const b = button();
    f.floating.bind(b);
    t.g.update({ messages: { ...FR, text: { ...FR.text, ...FR_FILTERS.text } } });
    expect(b.getAttribute('aria-label')).toBe('Ligne de filtres');
    const said = vi.spyOn(t.live, 'announce');
    b.click();
    expect(said).toHaveBeenLastCalledWith('Ligne de filtres masquée');
    t.g.update({ messages: { ...AR, text: { ...AR.text, ...AR_FILTERS.text } }, direction: 'rtl' });
    expect(b.getAttribute('aria-label')).toBe(AR_FILTERS.text['filter.floatingToggle']);
    b.click();
    expect(said).toHaveBeenLastCalledWith(AR_FILTERS.text['announce.floatingShown']);
    expect(t.hrows()).toHaveLength(2);
    expect(t.input('name')!.getAttribute('aria-label')).toBe('ترشيح Name');
  });

  it('a click after the grid is gone changes only the state kept for the next grid', () => {
    const f = filters({ floating: true });
    make({ features: [f] });
    const b = button();
    f.floating.bind(b);
    cleanup();
    document.body.append(b);
    expect(() => b.click()).not.toThrow();
    expect(f.floating.get()).toBe(false);
    const t = make({ features: [f] });
    expect(t.hrows()).toHaveLength(1);
  });
});

describe('right to left', () => {
  it('hides and shows in Arabic, counts and focus as in French', () => {
    const f = filters({ floating: true });
    const t = make({ features: [f], settings: { messages: { ...AR, text: { ...AR.text, ...AR_FILTERS.text } }, direction: 'rtl' } });
    t.input('name')!.focus();
    f.floating.set(false);
    expect(document.activeElement).toBe(head(t, 'name'));
    expect(t.vp.getAttribute('aria-rowcount')).toBe('31');
    f.floating.set(true);
    expect(bodyIndex(t)[0]).toBe(3);
    expect(t.input('name')!.getAttribute('aria-label')).toBe('ترشيح Name');
  });
});

describe('the texts', () => {
  it('are in every filters bundle, Arabic without stray marks', () => {
    for (const b of [EN_FILTERS, FR_FILTERS, AR_FILTERS]) for (const k of ['filter.floatingToggle', 'announce.floatingHidden', 'announce.floatingShown'] as const) expect(typeof b.text[k]).toBe('string');
    for (const k of ['filter.floatingToggle', 'announce.floatingHidden', 'announce.floatingShown'] as const) {
      const s = AR_FILTERS.text[k];
      // Arabic letters and spaces only: no bidi controls, no Latin, no tatweel.
      expect([...s].every((c) => c === ' ' || (c >= '\u0621' && c <= '\u064A'))).toBe(true);
    }
    expect(FR_FILTERS.text['announce.floatingHidden']).toBe('Ligne de filtres masquée');
    expect(FR_FILTERS.text['announce.floatingShown']).toBe('Ligne de filtres affichée');
  });
});

describe('a walk', () => {
  const rng = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const TEXT = ['', 'a', 'ann', 'bob1', 'n2'];
  const NUM = ['', '1', '7', '12'];
  const want = (col: string, s: string) => (s === '' ? undefined : col === 'n' ? { type: 'number', op: 'equals', value: Number(s) } : { type: 'text', op: 'contains', value: s });

  it('mixes toggles with typing, pauses mid-flight, popups, column moves and scrolling; nothing lost, counts right', () => {
    for (let seed = 1; seed <= 40; seed++) {
      vi.useFakeTimers();
      const r = rng(seed);
      const pick = <X>(a: readonly X[]): X => a[Math.floor(r() * a.length)]!;
      const f = filters({ floating: r() < 0.5 });
      const t = make({ features: [f] });
      const b = button();
      f.floating.bind(b);
      // What the user typed last per column: what the query holds once the row hides.
      const typed = new Map<string, string>();
      const check = (step: string) => {
        const on = f.floating.get();
        const ctx = `seed ${seed} ${step}`;
        expect(t.hrows(), ctx).toHaveLength(on ? 2 : 1);
        expect(b.getAttribute('aria-pressed'), ctx).toBe(String(on));
        expect(t.vp.getAttribute('aria-rowcount'), ctx).toBe(String(t.g.kernel.rows.displayed.count + (on ? 2 : 1)));
        const idx = bodyIndex(t);
        if (idx.length) expect(Math.min(...idx), ctx).toBeGreaterThanOrEqual(on ? 3 : 2);
        if (!on) expect(t.host.querySelector('.dzg-hextra'), ctx).toBeNull();
        else {
          const [h, x] = t.hrows();
          const ids = (row: HTMLElement) => [...row.querySelectorAll<HTMLElement>('[data-col]')].map((c) => c.dataset['col']);
          expect(ids(x!), ctx).toEqual(ids(h!));
        }
        const a = document.activeElement;
        expect(!a || a.isConnected, ctx).toBe(true);
      };
      for (let i = 0; i < 40; i++) {
        const x = r();
        const on = f.floating.get();
        let step = '';
        if (x < 0.2) {
          step = 'toggle';
          if (r() < 0.5) b.click();
          else f.floating.set(!on);
          if (on) {
            for (const [col, s] of typed) expect(t.g.kernel.query.filter[col], `seed ${seed} step ${i} ${col}`).toEqual(want(col, s));
            const a = document.activeElement as HTMLElement | null;
            expect(a?.closest('.dzg-hextra') ?? null).toBeNull();
          } else for (const [col, s] of typed) if (t.input(col)) expect(t.input(col)!.value, `seed ${seed} step ${i} show ${col}`).toBe(s);
        } else if (x < 0.5 && on) {
          const col = pick(['name', 'n']);
          step = `type ${col}`;
          if (r() < 0.5) t.input(col)?.focus();
          const s = pick(col === 'n' ? NUM : TEXT);
          if (t.input(col)) {
            t.type(col, s);
            typed.set(col, s);
          }
        } else if (x < 0.65) {
          step = 'pause';
          vi.advanceTimersByTime(Math.floor(r() * 200));
        } else if (x < 0.72) {
          step = 'popup';
          if (on && r() < 0.5) {
            t.cell('name').focus();
            t.press('ArrowDown', { altKey: true });
          } else f.openFilter(pick(['name', 'n']));
        } else if (x < 0.76) {
          step = 'close';
          f.closeFilter();
        } else if (x < 0.84) {
          step = 'move';
          const order = ['name', 'n', 'd'].sort(() => r() - 0.5);
          t.g.kernel.dispatch({ type: 'column.state', patch: order.map((id, o) => ({ id, order: o })) }, 'user');
        } else if (x < 0.92) {
          step = 'scroll';
          t.box.scrollTop = Math.floor(r() * 800);
          t.vp.dispatchEvent(new Event('scroll'));
        } else {
          step = 'focus header';
          head(t, pick(['name', 'n', 'd'])).focus();
        }
        // A host's filter while hidden replaces what was typed.
        if (!f.floating.get() && r() < 0.05) {
          t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'ann' } }, 'host');
          typed.set('name', 'ann');
        }
        check(`step ${i} ${step}`);
      }
      cleanup();
    }
  });
});
