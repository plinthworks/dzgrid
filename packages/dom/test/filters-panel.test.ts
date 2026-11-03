// The filters panel (Phase 9, docs/behaviors/filters-panel.md; owner answers, decisions.md « Filters panel — owner
// answers (2026-11-03) »): a side panel beside the rows, its strip's button, the filterable columns with a search, each
// unfolding to the popup's own form, a dot on active filters, « Clear all filters », apply as the popups, kept in step
// with every other writer, keys, texts. Expectations written by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { makeQuery, type ColumnOrGroup } from '@dzgrid/core';
import { filters } from '../src/filters.js';
import { filtersPanel, FILTERS_PANEL_KEYS, type FiltersPanelFeature, type FiltersPanelOptions } from '../src/filters-panel.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_FILTERS } from '../src/locales/en-filters.js';
import { FR_FILTERS } from '../src/locales/fr-filters.js';
import { AR_FILTERS } from '../src/locales/ar-filters.js';
import { EN_FILTERS_PANEL } from '../src/locales/en-filters-panel.js';
import { FR_FILTERS_PANEL } from '../src/locales/fr-filters-panel.js';
import { AR_FILTERS_PANEL } from '../src/locales/ar-filters-panel.js';
import type { GridMessages } from '../src/messages.js';
import { cleanup, make, type R } from './support-filters.js';

afterEach(cleanup);

const join = (...b: { readonly locale: string; readonly text: object }[]): GridMessages => ({ locale: b[0]!.locale, text: Object.assign({}, ...b.map((x) => x.text)) });
const MSG = join(EN, EN_FILTERS, EN_FILTERS_PANEL);
type RB = R & { b?: boolean };
const COLS: ColumnOrGroup<RB>[] = [
  { id: 'name', header: 'Name' },
  { id: 'n', header: 'Number', type: 'number' },
  { id: 'x', header: 'Nope', filter: false },
  { id: 'h', header: 'Hidden', hidden: true },
  { id: 'b', header: 'Été', type: 'boolean', value: (r: RB) => r.n % 2 === 0 },
];

function panel(o: { panel?: FiltersPanelOptions; apply?: 'button'; withFilters?: boolean; columns?: ColumnOrGroup<RB>[]; messages?: GridMessages; dir?: 'rtl' } = {}) {
  vi.useFakeTimers();
  const p: FiltersPanelFeature = filtersPanel(o.panel);
  const f = filters({ ...(o.apply && { apply: o.apply }) });
  const t = make({
    columns: (o.columns ?? COLS) as never, // the support's rows type has no `b`: the boolean column reads `n`
    features: [...(o.withFilters === false ? [] : [f]), p],
    settings: { messages: o.messages ?? MSG, ...(o.dir && { direction: o.dir }) },
  });
  const root = t.host.querySelector<HTMLElement>('.dzg')!;
  const side = () => root.querySelector<HTMLElement>(':scope > .dzg-fside');
  const box = () => side()?.querySelector<HTMLElement>('.dzg-fpanel') ?? null;
  const toggle = () => side()?.querySelector<HTMLButtonElement>('.dzg-fp-toggle') ?? null;
  const x = () => box()!.querySelector<HTMLButtonElement>('.dzg-fp-close')!;
  const clearAll = () => box()!.querySelector<HTMLButtonElement>('.dzg-fp-clear')!;
  const search = () => box()!.querySelector<HTMLInputElement>('input[type=search]')!;
  const item = (col: string) => box()!.querySelector<HTMLElement>(`.dzg-fp-item[data-col="${col}"]`);
  const head = (col: string) => item(col)?.querySelector<HTMLButtonElement>('.dzg-fp-col') ?? null;
  const body = (col: string) => item(col)?.querySelector<HTMLElement>('.dzg-fpop') ?? null;
  const listed = () => [...box()!.querySelectorAll<HTMLElement>('.dzg-fp-item')].filter((li) => !li.hidden).map((li) => li.dataset['col']);
  const dotted = () => [...box()!.querySelectorAll<HTMLElement>('.dzg-fp-item[data-dzg-active]')].map((li) => li.dataset['col']);
  const name = (el: HTMLElement) => el.textContent!.replace(/\s+/g, ' ').trim();
  const fill = (i: HTMLInputElement, text: string) => {
    i.value = text;
    i.dispatchEvent(new InputEvent('input', { bubbles: true }));
  };
  const paint = () => t.g.kernel.dispatch({ type: 'focus.set', focus: null } as never, 'api'); // any command repaints (sync paints)
  return { ...t, p, f, root, side, box, toggle, x, clearAll, search, item, head, body, listed, dotted, name, fill, paint, api: () => p.api(t.g)! };
}

describe('placement and the button (filters-panel.md 1–5)', () => {
  it('without filters(): nothing drawn, one missing-feature warning', () => {
    const t = panel({ withFilters: false });
    expect(t.side()).toBeNull();
    expect(t.api().open()).toBe(false);
    expect(t.problems().filter((p) => p.code === 'missing-feature' && p.path === 'features.filtersPanel')).toHaveLength(1);
  });

  it('a strip at the end side, after the rows, outside role=grid; the panel closed; the button controls it', () => {
    const t = panel();
    const s = t.side()!;
    expect(t.root.dataset['dzgFside']).toBe('end');
    expect(s.closest('[role=grid]')).toBeNull();
    expect(s.compareDocumentPosition(t.vp) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(t.box()!.hidden).toBe(true);
    const b = t.toggle()!;
    expect(b.type).toBe('button');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(b.getAttribute('aria-controls')).toBe(t.box()!.id);
    expect(t.name(b)).toBe('Filters');
  });

  it('side start; right to left keeps the logical side', () => {
    expect(panel({ panel: { side: 'start' } }).root.dataset['dzgFside']).toBe('start');
    cleanup();
    expect(panel({ dir: 'rtl' }).root.dataset['dzgFside']).toBe('end');
  });

  it('the button opens it: a region named Filters, the focus in the column search; × closes it, the focus back on the button', () => {
    const t = panel();
    t.toggle()!.click();
    const b = t.box()!;
    expect(b.hidden).toBe(false);
    expect(t.root.hasAttribute('data-dzg-fopen')).toBe(true);
    expect(t.toggle()!.getAttribute('aria-expanded')).toBe('true');
    expect(b.getAttribute('role')).toBe('region');
    expect(document.getElementById(b.getAttribute('aria-labelledby')!)!.textContent).toBe('Filters');
    expect(document.activeElement).toBe(t.search());
    expect(t.search().closest('label')!.textContent).toContain('Find a column');
    expect(t.x().getAttribute('aria-label')).toBe('Close the filters');
    t.x().click();
    expect(b.hidden).toBe(true);
    expect(t.root.hasAttribute('data-dzg-fopen')).toBe(false);
    expect(document.activeElement).toBe(t.toggle());
    expect(t.api().isOpen).toBe(false);
  });

  it('× pressed without taking the focus (WebKit focuses nothing on a click): the focus still goes to the button', () => {
    const t = panel({ panel: { open: true } });
    (document.activeElement as HTMLElement | null)?.blur();
    t.x().click();
    expect(document.activeElement).toBe(t.toggle());
  });

  it('button: false: no strip; the api opens it, open(column) unfolds that column and focuses its form', () => {
    const t = panel({ panel: { button: false } });
    expect(t.toggle()).toBeNull();
    expect(t.api().open('n')).toBe(true);
    expect(t.head('n')!.getAttribute('aria-expanded')).toBe('true');
    expect(t.body('n')!.contains(document.activeElement)).toBe(true);
    expect(t.api().toggle()).toBe(false);
    expect(t.box()!.hidden).toBe(true);
  });

  it('a grid destroyed with an edit pending in the panel applies nothing to it (as the popup)', () => {
    const t = panel({ panel: { open: true } });
    t.head('name')!.click();
    t.fill(t.body('name')!.querySelector<HTMLInputElement>('input.dzg-fval')!, 'ann');
    t.g.destroy();
    vi.advanceTimersByTime(500);
    expect(t.filterEvents()).toHaveLength(0);
  });

  it('open: true starts open; destroy takes everything away', () => {
    const t = panel({ panel: { open: true } });
    expect(t.box()!.hidden).toBe(false);
    t.g.destroy();
    expect(t.host.querySelector('.dzg-fside')).toBeNull();
    expect(t.p.api(t.g)).toBeNull();
  });
});

describe('the list (filters-panel.md 7, 8, 11)', () => {
  it('every column with a filter form, hidden ones too, in order; buttons folded', () => {
    const t = panel({ panel: { open: true } });
    expect(t.listed()).toEqual(['name', 'n', 'h', 'b']);
    const h = t.head('name')!;
    expect(h.getAttribute('aria-expanded')).toBe('false');
    expect(t.body('name')).toBeNull();
    expect(t.name(h)).toBe('Name');
  });

  it('unfolding shows the popup\'s own form, a group named by its column; folding removes it', () => {
    const t = panel({ panel: { open: true } });
    t.head('name')!.click();
    const b = t.body('name')!;
    expect(t.head('name')!.getAttribute('aria-expanded')).toBe('true');
    expect(t.head('name')!.getAttribute('aria-controls')).toBe(b.parentElement!.id);
    expect(b.parentElement!.getAttribute('role')).toBe('group');
    expect(b.querySelector('select.dzg-fop')).not.toBeNull();
    expect(b.querySelector('input.dzg-fval')).not.toBeNull();
    expect(b.querySelector('button.dzg-fapply')).not.toBeNull();
    t.head('name')!.click();
    expect(t.body('name')).toBeNull();
  });

  it('the column search: accents and case ignored; none: « No column »; the count said after a pause; Escape empties it', () => {
    const t = panel({ panel: { open: true } });
    t.fill(t.search(), 'ete');
    expect(t.listed()).toEqual(['b']);
    vi.advanceTimersByTime(600);
    expect(t.live.said).toBe('Columns found: 1');
    t.fill(t.search(), 'zz');
    expect(t.listed()).toEqual([]);
    expect(t.box()!.querySelector('[role=status]')!.textContent).toBe('No column');
    t.key(t.search(), 'Escape');
    expect(t.search().value).toBe('');
    expect(t.listed()).toEqual(['name', 'n', 'h', 'b']);
  });
});

describe('filtering and the dots (filters-panel.md 6, 7, 9, 10)', () => {
  it('typed text applies after the pause: the dot, the name, the count on the button', () => {
    const t = panel({ panel: { open: true } });
    t.head('name')!.click();
    t.fill(t.body('name')!.querySelector<HTMLInputElement>('input.dzg-fval')!, 'ann');
    expect(t.g.kernel.query.filter['name']).toBeUndefined();
    vi.advanceTimersByTime(200);
    expect(t.g.kernel.query.filter['name']).toEqual({ type: 'text', op: 'contains', value: 'ann' });
    expect(t.dotted()).toEqual(['name']);
    expect(t.name(t.head('name')!)).toBe('Name filter active');
    expect(t.name(t.toggle()!)).toBe('Filters Active: 1');
  });

  it('folding applies what is pending at once', () => {
    const t = panel({ panel: { open: true } });
    t.head('name')!.click();
    t.fill(t.body('name')!.querySelector<HTMLInputElement>('input.dzg-fval')!, 'bob');
    t.head('name')!.click();
    expect(t.g.kernel.query.filter['name']).toEqual({ type: 'text', op: 'contains', value: 'bob' });
  });

  it('apply: button keeps a draft until Apply; the form stays open after it', () => {
    const t = panel({ panel: { open: true }, apply: 'button' });
    t.head('name')!.click();
    t.fill(t.body('name')!.querySelector<HTMLInputElement>('input.dzg-fval')!, 'ann');
    vi.advanceTimersByTime(1000);
    expect(t.g.kernel.query.filter['name']).toBeUndefined();
    t.body('name')!.querySelector<HTMLButtonElement>('button.dzg-fapply')!.click();
    expect(t.g.kernel.query.filter['name']).toEqual({ type: 'text', op: 'contains', value: 'ann' });
    expect(t.body('name')).not.toBeNull();
    expect(t.dotted()).toEqual(['name']);
  });

  it('in step with the api and a restored state: dots, count, the open form\'s fields', () => {
    const t = panel({ panel: { open: true } });
    t.head('n')!.click();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'equals', value: 3 } }, 'api');
    expect(t.dotted()).toEqual(['n']);
    expect(t.body('n')!.querySelector<HTMLInputElement>('input.dzg-fval')!.value).toBe('3');
    t.g.kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { name: { type: 'text', op: 'contains', value: 'a' }, h: { type: 'text', op: 'contains', value: 'z' } } }) }, 'api');
    expect(t.dotted()).toEqual(['name', 'h']);
    expect(t.name(t.toggle()!)).toBe('Filters Active: 2');
    expect(t.body('n')!.querySelector<HTMLInputElement>('input.dzg-fval')!.value).toBe('');
  });

  it('in step with the popup', () => {
    const t = panel({ panel: { open: true } });
    t.f.openFilter('name');
    const pop = t.host.querySelector<HTMLElement>('.dzg-popup')!;
    t.fill(pop.querySelector<HTMLInputElement>('input.dzg-fval')!, 'ann');
    vi.advanceTimersByTime(200);
    expect(t.dotted()).toEqual(['name']);
  });

  it('« Clear all filters »: aria-disabled with nothing to clear; else every filter and the search emptied, the sort kept', () => {
    const t = panel({ panel: { open: true } });
    const c = t.clearAll();
    expect(c.textContent).toBe('Clear all filters');
    expect(c.getAttribute('aria-disabled')).toBe('true');
    c.click();
    expect(t.filterEvents()).toHaveLength(0);
    t.g.kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { name: { type: 'text', op: 'contains', value: 'a' } }, quick: 'b', sort: [{ column: 'n', dir: 'desc' }] }) }, 'api');
    expect(c.hasAttribute('aria-disabled')).toBe(false);
    c.click();
    expect(t.g.kernel.query.filter).toEqual({});
    expect(t.g.kernel.query.quick).toBe('');
    expect(t.g.kernel.query.sort).toEqual([{ column: 'n', dir: 'desc' }]);
    expect(t.dotted()).toEqual([]);
    expect(c.getAttribute('aria-disabled')).toBe('true');
  });

  it('new column definitions: the list follows', () => {
    const t = panel({ panel: { open: true } });
    t.g.update({ columns: [{ id: 'n', header: 'Number', type: 'number' }, { id: 'name', header: 'Label' }] } as never); // the support's grid type
    expect(t.listed()).toEqual(['n', 'name']);
    expect(t.name(t.head('name')!)).toBe('Label');
  });
});

describe('keys (filters-panel.md 12)', () => {
  it('↓ from the search to the first column; ↑ ↓ Home End between columns; Escape in a form back to its column', () => {
    const t = panel({ panel: { open: true } });
    t.search().focus();
    t.key(t.search(), 'ArrowDown');
    expect(document.activeElement).toBe(t.head('name'));
    t.key(t.head('name')!, 'ArrowDown');
    expect(document.activeElement).toBe(t.head('n'));
    t.key(t.head('n')!, 'End');
    expect(document.activeElement).toBe(t.head('b'));
    t.key(t.head('b')!, 'Home');
    expect(document.activeElement).toBe(t.head('name'));
    t.key(t.head('name')!, 'ArrowUp');
    expect(document.activeElement).toBe(t.search());
    t.head('n')!.click();
    const v = t.body('n')!.querySelector<HTMLInputElement>('input.dzg-fval')!;
    v.focus();
    t.key(v, 'Escape');
    expect(document.activeElement).toBe(t.head('n'));
    expect(t.box()!.hidden).toBe(false);
  });
});

describe('texts (filters-panel.md « Texts »)', () => {
  it('fr and ar bundles hold every key; a missing one throws, named', () => {
    for (const b of [EN_FILTERS_PANEL, FR_FILTERS_PANEL, AR_FILTERS_PANEL]) expect(Object.keys(b.text).sort()).toEqual([...FILTERS_PANEL_KEYS].sort());
    const { 'fpanel.none': _, ...rest } = EN_FILTERS_PANEL.text;
    expect(() => panel({ messages: { locale: 'en', text: { ...EN.text, ...EN_FILTERS.text, ...rest } } as GridMessages })).toThrow(/filters-panel: missing fpanel\.none/);
  });

  it('French and Arabic drawn', () => {
    const t = panel({ panel: { open: true }, messages: join(FR, FR_FILTERS, FR_FILTERS_PANEL) });
    expect(t.clearAll().textContent).toBe('Effacer tous les filtres');
    cleanup();
    const a = panel({ panel: { open: true }, dir: 'rtl', messages: join(AR, AR_FILTERS, AR_FILTERS_PANEL) });
    expect(a.name(a.toggle()!)).toBe('المرشحات');
  });
});
