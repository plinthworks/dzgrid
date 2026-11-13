// The set filter's list as wide as its longest value (1.12.0, owner 2026-11-13; docs/behaviors/filter-set.md « The
// list's width », presentation-settings.md 38). jsdom lays nothing out: the boxes are stubbed — a drawn row 240 px, its
// label 160, its count 20 (60 px for the rest of the row), and the hidden copy every label (then every count) is written
// into, one per line, `laid` px a character on its widest line (7 by default). Expectations by hand: the widest label
// and count, plus 60, plus the frame (0 in jsdom), plus 1 px of slack, rounded up. The look itself (French, Arabic,
// three browsers) is scripts/browser-1-12.mjs (10).
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { definePart } from '../src/part.js';
import { SET_CSS } from '../src/filters/set/styles.js';
import { cleanup } from './support-filters.js';
import { grid, settle, TOWNS, type Row } from './support-set.js';

const WIDTH: Record<string, number> = { 'dzg-fopt': 240, 'dzg-fname': 160, 'dzg-fcount': 20 };
const LONG = 'Constantine-la-Grande'; // 21 characters: 147 px
const rows: Row[] = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, name: `p${i}`, n: i, city: i === 11 ? LONG : TOWNS[i % 5]!, st: 'a' }));
let laid = 7;
/** What the hidden copy held, each time it was read. */
const copies: string[] = [];

beforeEach(() => {
  laid = 7;
  copies.length = 0;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    let w = WIDTH[this.className] ?? 0;
    if (this.style.visibility === 'hidden') {
      const text = this.textContent ?? '';
      copies.push(text);
      w = Math.max(...text.split('\n').map((l) => l.length)) * laid;
    }
    return { width: w, height: w ? 36 : 0, top: 0, left: 0, right: w, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

const fitOf = (t: ReturnType<typeof grid>) => t.q<HTMLElement>('.dzg-flistw')!.style.getPropertyValue('--dzg-set-fit');

describe('the list as wide as its longest value', () => {
  it('the widest label and the widest count, plus the rest of a row: 147 + 7 + 60 + 1 = 215 px; the copy gone', async () => {
    const t = grid({ rows });
    await t.open();
    expect(fitOf(t)).toBe('215px');
    // Every value's label written into one copy, drawn row or not (the list is windowed), then the counts.
    expect(copies[0]!.split('\n')).toEqual(expect.arrayContaining([LONG, 'Alger', 'Oran']));
    expect(copies[1]!.split('\n')).toEqual(expect.arrayContaining(['1', '3']));
    expect(t.popup()!.querySelectorAll('[style*="hidden"]')).toHaveLength(0);
    // The cut label's full text stays reachable.
    expect(t.option(LONG).querySelector('.dzg-fname')!.getAttribute('title')).toBe(LONG);
  });

  it('measured as the page lays it out (its font and language): 8 px a character gives 21 × 8 + 8 + 60 + 1 = 237 px', async () => {
    laid = 8;
    const t = grid({ rows });
    await t.open();
    expect(fitOf(t)).toBe('237px');
  });

  it('a search narrowing the list does not change it (decided on the whole list); cleared, the same', async () => {
    const t = grid({ rows });
    await t.open();
    t.type('Ora');
    await settle();
    expect(t.labels()).toEqual(['Oran']);
    expect(fitOf(t)).toBe('215px');
    t.type('');
    await settle();
    expect(fitOf(t)).toBe('215px');
  });

  it('values arriving later from a server: measured when they come', async () => {
    const calls: ((v: unknown) => void)[] = [];
    const t = grid({ server: true, values: () => new Promise((ok) => calls.push(ok)) });
    t.f.answer(['a']);
    await t.open();
    expect(fitOf(t)).toBe('');
    calls[0]!({ values: [{ value: 'Oran', count: 2 }, { value: LONG, count: 120 }], blanks: 0 });
    await settle();
    // 147 + 21 (« 120 ») + 60 + 1.
    expect(fitOf(t)).toBe('229px');
  });

  it('rows painted by an application’s part: today’s width (the part sizes itself)', async () => {
    const pill = definePart('filterOption', { mount(host, c) { host.textContent = c.label; return {}; } });
    const t = grid({ rows, columns: [{ id: 'name', header: 'Name' }, { id: 'city', header: 'City', filter: { kind: 'set', optionPart: 'pill' } }], settings: { parts: { pill } } });
    await t.open();
    expect(fitOf(t)).toBe('');
  });

  it('a row not laid out (the popup not shown yet): nothing measured', async () => {
    WIDTH['dzg-fopt'] = 0;
    try {
      const t = grid({ rows });
      await t.open();
      expect(fitOf(t)).toBe('');
      expect(copies).toEqual([]);
    } finally {
      WIDTH['dzg-fopt'] = 240;
    }
  });

  it('the layout: at least --dzg-set-list-min-width (14rem), at most --dzg-set-list-max-width (min(32rem, 90vw)), as wide as the fit between', () => {
    expect(SET_CSS).toContain(':where(.dzg-flistw){position:relative;min-inline-size:max(var(--dzg-set-list-min-width,14rem),min(var(--dzg-set-fit,0px),var(--dzg-set-list-max-width,min(32rem,90vw))))}');
  });
});
