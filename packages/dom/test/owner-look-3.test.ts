// The owner's third look at the integrated screen (docs/phase-6-steps/app-feedback.md 30–33): the period form's fields
// fill their box (one focus ring, the box's), the focus in FROM when the period popup opens, a brief busy flash after a
// filter applies or clears (`filters({ busyFlash })`), the filtered count in the footer with the host's words.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { filters } from '../src/filters.js';
import { pagination } from '../src/pagination.js';
import { FR } from '../src/locales/fr.js';
import { FR_FILTERS } from '../src/locales/fr-filters.js';
import { FR_PAGINATION } from '../src/locales/fr-pagination.js';
import { cleanup, make, type R } from './support-filters.js';

afterEach(cleanup);
beforeEach(() => void ((window as unknown as { reportError: unknown }).reportError = () => {}));

type Row = R & { updatedAt: string };
const ROWS: Row[] = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, name: i % 3 ? `bob${i}` : `ann${i}`, n: i, updatedAt: `2026-10-${String((i % 27) + 1).padStart(2, '0')}T10:00:00Z` }));
const COLS: ColumnOrGroup<Row>[] = [
  { id: 'name', header: 'Nom', filter: { kind: 'text', ops: ['contains'] } } as never,
  { id: 'updatedAt', header: 'Mis à jour', type: 'instant', filter: { kind: 'instant', ops: ['betweenDays'] } } as never,
];
const FR_MSG = { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text, ...FR_PAGINATION.text } };
const NOW = Date.UTC(2026, 9, 27, 10, 0);

function grid(o: Parameters<typeof filters>[0] = {}, text: Record<string, string> = {}) {
  const feature = filters({ apply: 'button', dateZone: false, dateCalendar: { months: 1, presets: [] }, ...o });
  const t = make({
    columns: COLS as never, rows: ROWS, features: [feature, pagination()],
    settings: { clock: () => NOW, locale: 'fr-FR', timeZone: 'Europe/Paris', messages: { ...FR_MSG, text: { ...FR_MSG.text, ...text } }, pagination: { pageSize: 20 } } as never,
  });
  const popup = () => t.host.querySelector<HTMLElement>('.dzg-popup');
  const inputs = () => [...(popup()?.querySelectorAll<HTMLInputElement>('.dzg-fends .tz-dateinput__input') ?? [])];
  const root = () => t.host.querySelector<HTMLElement>('.dzg')!;
  const filter = (v: string | null) => t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: v === null ? null : { type: 'text', op: 'contains', value: v } } as never, 'user');
  return { ...t, feature, popup, inputs, root, filter };
}

describe('the period form’s fields fill their box (app-feedback 30)', () => {
  it('the input grows to the whole field (tzslot gives it 8.5rem): two classes, outside the layer', async () => {
    const t = grid();
    expect(t.feature.openFilter('updatedAt')).toBe(true);
    await vi.waitFor(() => expect(t.inputs()).toHaveLength(2));
    const css = document.querySelector('style[data-tzslot="dzg-period"]')!.textContent!;
    expect(css.slice(css.lastIndexOf('}}'))).toContain('.dzg-fends .tz-dateinput__input{flex:1;width:0}');
  });
});

describe('the focus in FROM when the period popup opens (app-feedback 31)', () => {
  it('the first time (the kit still loading): the focus waits on the form, then goes to FROM', async () => {
    const t = grid();
    expect(t.feature.openFilter('updatedAt')).toBe(true);
    await vi.waitFor(() => expect(t.inputs()).toHaveLength(2));
    expect(document.activeElement).toBe(t.inputs()[0]);
  });

  it('again (the kit loaded): FROM at once; Escape closes and the focus goes back to the header', async () => {
    const t = grid();
    t.feature.openFilter('updatedAt');
    await vi.waitFor(() => expect(t.inputs()).toHaveLength(2));
    t.feature.closeFilter();
    t.feature.openFilter('updatedAt');
    expect(document.activeElement).toBe(t.inputs()[0]);
    t.inputs()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(t.popup()).toBeNull();
    expect(document.activeElement?.closest('.dzg-hcell')?.getAttribute('data-col')).toBe('updatedAt');
  });
});

describe('a brief busy flash after a filter applies or clears (app-feedback 32, opt-in)', () => {
  it('busyFlash: aria-busy on the grid for that long after each change, then gone; a clear flashes too', () => {
    vi.useFakeTimers();
    const t = grid({ busyFlash: 300 });
    expect(t.root().hasAttribute('aria-busy')).toBe(false);
    t.filter('ann');
    expect(t.root().getAttribute('aria-busy')).toBe('true');
    vi.advanceTimersByTime(299);
    expect(t.root().getAttribute('aria-busy')).toBe('true');
    vi.advanceTimersByTime(1);
    expect(t.root().hasAttribute('aria-busy')).toBe(false);
    t.filter(null);
    expect(t.root().getAttribute('aria-busy')).toBe('true');
    vi.advanceTimersByTime(300);
    expect(t.root().hasAttribute('aria-busy')).toBe(false);
  });

  it('a change during the flash starts it again (one timer); the grid going leaves no timer', () => {
    vi.useFakeTimers();
    const t = grid({ busyFlash: 300 });
    t.filter('ann');
    vi.advanceTimersByTime(200);
    t.filter('bob');
    vi.advanceTimersByTime(200);
    expect(t.root().getAttribute('aria-busy')).toBe('true');
    vi.advanceTimersByTime(100);
    expect(t.root().hasAttribute('aria-busy')).toBe(false);
    t.filter('ann');
    t.g.destroy?.();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('the grid destroyed during a flash: aria-busy taken off the root with the timer (review finding 3)', () => {
    vi.useFakeTimers();
    const t = grid({ busyFlash: 300 });
    const root = t.root();
    t.filter('ann');
    expect(root.getAttribute('aria-busy')).toBe('true');
    t.g.destroy?.();
    expect(root.hasAttribute('aria-busy')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('it never blocks: the rows are filtered at once, under the flash', () => {
    vi.useFakeTimers();
    const t = grid({ busyFlash: 300 });
    t.filter('ann');
    expect(t.ids().every((id) => Number(id.slice(1)) % 3 === 0)).toBe(true);
  });

  it('off by default: no aria-busy after a filter', () => {
    const t = grid();
    t.filter('ann');
    expect(t.root().hasAttribute('aria-busy')).toBe(false);
  });
});

describe('the filtered count in the footer with the host’s words (app-feedback 32)', () => {
  it('« 10 produits sur 30 » when filtered, the range when not', () => {
    const t = grid({}, { 'count.filtered': '{filtered} produits sur {total}' });
    const count = () => t.host.querySelector('.dzg-pcount')!.textContent;
    expect(count()).toBe('1 à 20 sur 30');
    t.filter('ann');
    expect(count()).toBe('10 produits sur 30');
  });
});

describe('flexible columns leave room for the selection boxes (app-feedback 34: the 40 px horizontal scroll)', () => {
  it('a flex column fills the view less the box column: no horizontal scroll', () => {
    const t = make({
      inline: 900,
      columns: [{ id: 'name', header: 'Nom', width: 200, flex: 1 }, { id: 'n', header: 'N', width: 100 }] as never,
      rows: ROWS,
      settings: { selection: { mode: 'multi', checkbox: true } } as never,
    });
    const body = t.host.querySelector<HTMLElement>('.dzg-body')!;
    expect(body.style.getPropertyValue('inline-size')).toBe('900px');
  });
});
