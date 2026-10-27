// The owner's look at the integrated screen (docs/phase-6-steps/app-feedback.md 17–22): one box per value row (the
// grid's; a `filterOption` part paints the label only), `filters({ apply: 'button' })` (nothing applies before Apply or
// Enter; closing drops the draft), a popup kept inside the window when its content grows, `header.filterBox` taking the
// title's place with no second filter button, the instant form's zone line hidden for a one-zone app, the search box
// with a placeholder and no label above it.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { definePart } from '../src/part.js';
import { slots } from '../src/slots.js';
import { filters } from '../src/filters.js';
import { PopupHost } from '../src/popup.js';
import { Scope } from '../src/render/scope.js';
import { SET_CSS } from '../src/filters/set/styles.js';
import { cleanup, make, type R } from './support-filters.js';
import { COLS, grid, settle, type Row } from './support-set.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const pill = definePart('filterOption', {
  mount(host, c) {
    const s = host.ownerDocument.createElement('span');
    s.className = 'pill';
    s.textContent = c.label;
    host.append(s);
    return { update: (n) => void (s.textContent = n.label) };
  },
});
const withPart: ColumnOrGroup<Row>[] = COLS.map((c) => ('id' in c && c.id === 'city' ? { ...c, filter: { kind: 'set', optionPart: 'pill' } } : c)) as never;

describe('a filterOption part paints the label area only (app-feedback 11, 17)', () => {
  it('the row keeps the grid’s box first, the part’s host in the label’s place, the count after', async () => {
    const t = grid({ columns: withPart, settings: { parts: { pill } } });
    await t.open();
    const x = t.option('Oran');
    expect([...x.children].map((e) => e.className)).toEqual(['dzg-box', 'dzg-fpart', 'dzg-fname', 'dzg-fcount']);
    // The layout hides the grid's label only: its box and its count stay.
    expect(SET_CSS).toContain(':where(.dzg-fopt[data-part]>.dzg-fname){display:none}');
    expect(SET_CSS).not.toContain(':not(.dzg-fpart)');
  });

  it('review finding 4: the part’s host is inert, so a control inside it takes no focus and the row keeps its name', async () => {
    const t = grid({ columns: withPart, settings: { parts: { pill } } });
    await t.open();
    const host = t.option('Oran').querySelector('.dzg-fpart')!;
    expect(host.hasAttribute('inert')).toBe(true);
    expect(t.option('Oran').getAttribute('aria-label')).toBe('Oran, 6 rows');
  });
});

describe("filters({ apply: 'button' }) (app-feedback 16, 20)", () => {
  it('set: a tick waits for Apply; closing drops the draft', async () => {
    vi.useFakeTimers();
    const t = grid({ options: { apply: 'button' } });
    await t.open();
    t.option('Oran').click();
    vi.advanceTimersByTime(2000);
    expect(t.filter()['city']).toBeUndefined();
    t.feature.closeFilter();
    vi.advanceTimersByTime(2000);
    expect(t.filter()['city']).toBeUndefined();
    await t.open();
    expect(t.selected()).toContain('Oran');
    t.option('Oran').click();
    t.apply();
    expect(t.filter()['city']).toMatchObject({ type: 'set', exclude: ['Oran'] });
  });

  it('text: typing waits; Enter applies', () => {
    vi.useFakeTimers();
    const f = filters({ apply: 'button' });
    const t = make({ features: [f] });
    f.openFilter('name');
    const i = t.host.querySelector<HTMLInputElement>('.dzg-popup .dzg-fval')!;
    i.value = 'ann';
    i.dispatchEvent(new InputEvent('input', { bubbles: true }));
    vi.advanceTimersByTime(2000);
    expect(t.g.kernel.query.filter['name']).toBeUndefined();
    t.key(i, 'Enter');
    expect(t.g.kernel.query.filter['name']).toEqual({ type: 'text', op: 'contains', value: 'ann' });
  });

  it("'live' (the default) still applies after the pause", async () => {
    vi.useFakeTimers();
    const t = grid();
    await t.open();
    t.option('Oran').click();
    vi.advanceTimersByTime(200);
    expect(t.filter()['city']).toMatchObject({ type: 'set', exclude: ['Oran'] });
  });
});

describe('the set search box (app-feedback 18)', () => {
  it('a placeholder and a name, no label above it', async () => {
    const t = grid();
    await t.open();
    const s = t.search();
    expect(s.placeholder).toBe('Search…');
    expect(s.getAttribute('aria-label')).toBe('Search…');
    expect(s.closest('label')).toBeNull();
  });
});

describe('the popup stays in the window when its content grows (app-feedback 21)', () => {
  it('a wider content is placed again, its end on the window’s', () => {
    const seen: (() => void)[] = [];
    vi.stubGlobal('ResizeObserver', class {
      constructor(f: () => void) { seen.push(f); }
      observe() {}
      disconnect() {}
    });
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1000);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    const root = document.createElement('div');
    const anchor = document.createElement('button');
    document.body.append(root, anchor);
    const box = (el: Element, r: { left: number; top: number; width: number; height: number }) =>
      vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => ({}) } as DOMRect);
    box(anchor, { left: 800, top: 100, width: 150, height: 30 });
    const p = new PopupHost(document, root, new Scope(), () => 'ltr').open(anchor, document.createElement('div'), { placement: 'block-end' });
    // Opened small (the date kit still loading): under the anchor.
    box(p.el, { left: 0, top: 0, width: 100, height: 50 });
    p.reposition();
    expect(p.el.style.getPropertyValue('inset-inline-start')).toBe('800px');
    // The widget arrives: 340 wide. The observer places it again, inside the window.
    box(p.el, { left: 0, top: 0, width: 340, height: 300 });
    expect(seen.length).toBe(1);
    seen[0]!();
    expect(p.el.style.getPropertyValue('inset-inline-start')).toBe('660px');
    p.close();
  });
});

describe('header.filterBox takes the title’s place (app-feedback 14, 22)', () => {
  const BOX: ColumnOrGroup<R>[] = [{ id: 'name', header: 'Name', ui: { header: 'header.filterBox' } }, { id: 'n', header: 'N', type: 'number' }];
  it('the box with the column’s name as placeholder, the name hidden, no filter button; the cell keeps its name', () => {
    const t = make({ columns: BOX, features: [slots(), filters()] });
    const cell = t.host.querySelector<HTMLElement>('.dzg-hcell[data-col="name"]:not(.dzg-hextra)')!;
    const input = cell.querySelector<HTMLInputElement>('.dzg-hfbox input')!;
    expect(input.placeholder).toBe('Name');
    expect(cell.querySelector<HTMLElement>('.dzg-hlabel > span:not(.dzg-hfbox)')!.hidden).toBe(true);
    expect(cell.querySelector('.dzg-fbtn')).toBeNull();
    expect(cell.getAttribute('aria-label')).toBe('Name');
    // Another column keeps its button.
    expect(t.host.querySelector('.dzg-hcell[data-col="n"] .dzg-fbtn')).not.toBeNull();
  });
});

describe('the instant form’s zone line (app-feedback 21)', () => {
  type DRow = R & { t: string };
  const cols: ColumnOrGroup<DRow>[] = [{ id: 'name', header: 'Name' }, { id: 't', header: 'T', type: 'instant' }];
  const rows: DRow[] = [{ id: 'a', name: 'a', n: 1, t: '2026-10-01T10:00:00Z' }];
  const open = (o: object) => {
    const f = filters({ ...o, loadDates: () => new Promise(() => {}) });
    const t = make({ columns: cols as never, rows: rows as never, features: [f], settings: { timeZone: 'Europe/Paris' } as never });
    f.openFilter('t');
    return t.host.querySelector<HTMLElement>('.dzg-popup .dzg-fzone')!;
  };
  it('said by default', () => {
    expect(open({}).hidden).toBe(false);
  });
  it('hidden with dateZone: false (an application with one zone)', async () => {
    await settle();
    expect(open({ dateZone: false }).hidden).toBe(true);
  });
});

describe('the period form’s FROM and TO say the date’s form (app-feedback 21)', () => {
  type DRow = R & { t: string };
  it('a placeholder from the locale’s pattern, lower case', async () => {
    const f = filters({ dateCalendar: { months: 1, presets: [] } });
    const cols: ColumnOrGroup<DRow>[] = [{ id: 'name', header: 'Name' }, { id: 't', header: 'T', type: 'instant', filter: { kind: 'instant', ops: ['betweenDays'] } }];
    const t = make({ columns: cols as never, rows: [{ id: 'a', name: 'a', n: 1, t: '2026-10-01T10:00:00Z' }] as never, features: [f], settings: { timeZone: 'Europe/Paris' } as never });
    f.openFilter('t');
    await vi.waitFor(() => expect(t.host.querySelectorAll('.dzg-popup .dzg-fends input').length).toBe(2), { timeout: 5000 });
    for (const i of t.host.querySelectorAll<HTMLInputElement>('.dzg-popup .dzg-fends input')) expect(i.placeholder).toMatch(/^(?=.*d)(?=.*m)(?=.*y)[dmy/.-]+$/);
  });
});
