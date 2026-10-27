// Feedback pass C (docs/phase-6-steps/feedback-plan.md item 4, app-feedback.md 4): a part for the set filter's option row
// (slot `filterOption`, named by the column's `filter.optionPart`). The part paints the row's content; the grid keeps the
// row (role option, aria-selected, its name « label, count », the roving focus, the keys, the window over 10 000 values).
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { definePart, type SlotContext } from '../src/part.js';
import { cleanup } from './support-filters.js';
import { COLS, ROWS, grid, settle, type Row } from './support-set.js';

afterEach(cleanup);
type OC = SlotContext['filterOption'];

function pills(o: { throwOn?: (c: OC) => boolean } = {}) {
  const seen = { mounts: 0, updates: 0, destroys: 0, last: new Map<string | null, OC>(), toggles: new Map<string | null, () => void>() };
  const part = definePart('filterOption', {
    mount(host, c) {
      if (o.throwOn?.(c)) throw new Error('pill broke');
      seen.mounts++;
      const pill = host.ownerDocument.createElement('span');
      pill.className = 'pill';
      host.append(pill);
      const draw = (n: OC): void => {
        seen.last.set(n.value, n);
        seen.toggles.set(n.value, n.toggle);
        pill.textContent = `${n.label}${n.countText ? ` (${n.countText})` : ''}`;
        pill.dataset['on'] = String(n.selected);
      };
      draw(c);
      return { update: (n) => (seen.updates++, draw(n)), destroy: () => void seen.destroys++ };
    },
  });
  return { seen, part };
}

const withPart = (name = 'pills'): ColumnOrGroup<Row>[] => COLS.map((c) => ('id' in c && c.id === 'city' ? { ...c, filter: { kind: 'set', optionPart: name } } : c)) as never;

describe('filter.optionPart: a part paints each option row', () => {
  it('each drawn row holds the part, told value, label, count (and its text), selected, blank and the column', async () => {
    const p = pills();
    const t = grid({ columns: withPart(), settings: { parts: { pills: p.part } } });
    await t.open();
    const rows = t.options();
    expect(rows.length).toBe(6);
    for (const x of rows) {
      expect(x.querySelector('.dzg-fpart .pill'), x.getAttribute('aria-label')!).not.toBeNull();
      expect(x.hasAttribute('data-part')).toBe(true);
    }
    const oran = p.seen.last.get('Oran')!;
    // No filter: every value ticked (the list's own rule).
    expect(oran).toMatchObject({ value: 'Oran', label: 'Oran', count: 6, countText: '6', selected: true, blank: false });
    expect(oran.column.id).toBe('city');
    const blank = p.seen.last.get(null)!;
    expect(blank).toMatchObject({ value: null, blank: true, count: 3 });
    // The grid keeps the row's name: « label, count ».
    expect(t.option('Oran').getAttribute('aria-label')).toBe('Oran, 6 rows');
    // What the part paints is out of the name (axe label-content-name-mismatch in Chrome: the part's own count text).
    // Inert since the owner's look (review finding 4): out of the name, and nothing in it takes the focus.
    expect(t.option('Oran').querySelector('.dzg-fpart')!.hasAttribute('inert')).toBe(true);
    expect(t.option('Oran').getAttribute('role')).toBe('option');
  });

  it('a click on the row toggles, and the part is updated with selected; toggle() from the part toggles too', async () => {
    vi.useFakeTimers();
    const p = pills();
    const t = grid({ columns: withPart(), settings: { parts: { pills: p.part } } });
    await t.open();
    t.option('Oran').querySelector<HTMLElement>('.pill')!.click();
    expect(t.selected()).not.toContain('Oran');
    expect(p.seen.last.get('Oran')!.selected).toBe(false);
    p.seen.toggles.get('Alger')!();
    expect(t.selected()).not.toContain('Alger');
    expect(p.seen.last.get('Alger')!.selected).toBe(false);
    vi.advanceTimersByTime(200);
    expect(t.filter()['city']).toMatchObject({ type: 'set', exclude: ['Alger', 'Oran'] });
  });

  it('the keys are the list\'s: Space ticks the focused row with a part', async () => {
    const p = pills();
    const t = grid({ columns: withPart(), settings: { parts: { pills: p.part } } });
    await t.open();
    t.list().focus();
    t.search().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const active = document.activeElement as HTMLElement;
    expect(active.getAttribute('role')).toBe('option');
    const was = active.getAttribute('aria-selected');
    active.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(active.getAttribute('aria-selected')).toBe(String(was !== 'true'));
    expect(active.hasAttribute('data-part')).toBe(true);
  });

  it('a part that throws: reported, that row drawn by the grid (label and count)', async () => {
    const report = vi.fn();
    (window as unknown as { reportError: unknown }).reportError = report;
    const p = pills({ throwOn: (c) => c.value === 'Blida' });
    const t = grid({ columns: withPart(), settings: { parts: { pills: p.part } } });
    await t.open();
    expect(t.option('Blida').hasAttribute('data-part')).toBe(false);
    expect(t.option('Blida').querySelector('.dzg-fpart')!.childNodes.length).toBe(0);
    expect(t.option('Oran').hasAttribute('data-part')).toBe(true);
    expect(report).toHaveBeenCalled();
  });

  it('an unknown name: unknown-part (error) at the column\'s filter.optionPart, the default rows', async () => {
    const t = grid({ columns: withPart('nope') });
    await t.open();
    expect(t.problems()).toContainEqual({ code: 'unknown-part', severity: 'error', path: 'columns.city.filter.optionPart', detail: 'nope' });
    expect(t.options().every((x) => !x.hasAttribute('data-part'))).toBe(true);
    expect(t.labels()).toContain('Oran');
  });

  it('a part of another slot under that name is not used', async () => {
    const wrong = definePart('cell', { mount: () => ({}) });
    const t = grid({ columns: withPart('w'), settings: { parts: { w: wrong } } });
    await t.open();
    expect(t.options().every((x) => !x.hasAttribute('data-part'))).toBe(true);
  });

  it('10 000 values: parts only for the drawn rows; all destroyed when the popup closes', async () => {
    const p = pills();
    const rows: Row[] = Array.from({ length: 10_000 }, (_, i) => ({ id: `r${i}`, name: `p${i}`, n: i, city: `T${String(i).padStart(5, '0')}`, st: 'a' }));
    const t = grid({ rows, columns: withPart(), settings: { parts: { pills: p.part } } });
    await t.open();
    const drawn = t.options().length;
    expect(drawn).toBeLessThan(40);
    expect(p.seen.mounts - p.seen.destroys).toBe(drawn);
    t.list().scrollTop = 28 * 5000;
    t.list().dispatchEvent(new Event('scroll'));
    expect(p.seen.mounts - p.seen.destroys).toBe(t.options().length);
    t.feature.closeFilter();
    expect(p.seen.mounts).toBe(p.seen.destroys);
  });

  it('without optionPart: the rows as before, no part host drawn into', async () => {
    const t = grid({ rows: ROWS });
    await t.open();
    expect(t.options().every((x) => !x.hasAttribute('data-part'))).toBe(true);
    expect(t.labels()).toContain('Oran');
  });

  it('a filterOption part without filters() is missing-feature', async () => {
    const { createGrid } = await import('../src/grid.js');
    const { EN } = await import('../src/locales/en.js');
    const events: { type: string; problems?: unknown[] }[] = [];
    const host = document.createElement('div');
    document.body.append(host);
    const g = createGrid<{ id: string }>(host, { rows: [], getRowId: (r: { id: string }) => r.id, columns: [{ id: 'a' }], messages: EN, parts: { pills: pills().part }, onEvent: (e: unknown) => events.push(e as never) } as never, { sync: true });
    expect(events.flatMap((e) => e.problems ?? [])).toContainEqual({ code: 'missing-feature', severity: 'warning', path: 'parts.pills', detail: 'filters' });
    g.destroy();
  });
});

void settle;
