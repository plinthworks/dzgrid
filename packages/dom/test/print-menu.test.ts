// Phase 11 L5 (docs/behaviors/print.md 10–11): the browser's own print with `printOnMenu` — `beforeprint` builds the whole
// table at once (no slice: the browser lays the pages out as soon as the event returns), `afterprint` (else the first
// `focus` or `pointerdown`) removes it; a table prepared by `print()` left alone; the grid's destruction ends it. And a
// totals row marked apart from a group row (`dzg-print-footer`), for the page-break rules. Expectations written by hand.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { preparePrint, print } from '../src/print.js';
import { printOnMenu } from '../src/print-menu.js';
import { EN_PRINT } from '../src/locales/en-print.js';
import { EN } from '../src/locales/en.js';
import { cleanup, emake, join, rowsOf } from './support-edit.js';
import { BUNDLES, cleanup as gcleanup, gmake } from './support-grouping.js';

afterEach(() => (cleanup(), gcleanup(), vi.restoreAllMocks()));

const MSG = join(EN, EN_PRINT);
const box = () => document.querySelectorAll<HTMLElement>('body > .dzg-print');
const rows = () => document.querySelector<HTMLTableElement>('body > .dzg-print table')?.tBodies[0]!.rows.length ?? -1;
const marked = () => document.documentElement.classList.contains('dzg-printing');

describe('printOnMenu: the browser\'s own print (print.md 10)', () => {
  it('beforeprint builds every row at once, even with a clock that would slice it; afterprint removes it', () => {
    const m = emake({ rows: rowsOf(200), settings: { messages: MSG } });
    let t = 0;
    vi.spyOn(window.performance, 'now').mockImplementation(() => (t += 1));
    printOnMenu(m.g, { title: 'Menu' });
    expect(box()).toHaveLength(0);
    window.dispatchEvent(new Event('beforeprint'));
    expect(rows()).toBe(200);
    expect(marked()).toBe(true);
    expect(document.querySelector('body > .dzg-print caption')!.textContent).toBe('Menu');
    window.dispatchEvent(new Event('afterprint'));
    expect(box()).toHaveLength(0);
    expect(marked()).toBe(false);
  });

  it('a table prepared by print() is left as it is: no second container, print()\'s cleanup still removes it', async () => {
    const m = emake({ rows: rowsOf(5), settings: { messages: MSG } });
    printOnMenu(m.g, { title: 'Menu' });
    vi.spyOn(window, 'print').mockImplementation(() => {
      window.dispatchEvent(new Event('beforeprint'));
      expect(box()).toHaveLength(1);
      expect(document.querySelector('body > .dzg-print caption')!.textContent).toBe('Button');
    });
    await print(m.g, { title: 'Button' });
    window.dispatchEvent(new Event('afterprint'));
    expect(box()).toHaveLength(0);
    expect(marked()).toBe(false);
  });

  it('no afterprint (Safari\'s PDF path): the first focus or pointerdown removes it; the next print builds the rows of now', () => {
    const m = emake({ rows: rowsOf(3), settings: { messages: MSG } });
    printOnMenu(m.g);
    window.dispatchEvent(new Event('beforeprint'));
    expect(rows()).toBe(3);
    window.dispatchEvent(new Event('focus'));
    expect(box()).toHaveLength(0);
    m.g.update({ rows: rowsOf(7) });
    window.dispatchEvent(new Event('beforeprint'));
    expect(box()).toHaveLength(1);
    expect(rows()).toBe(7);
    window.dispatchEvent(new Event('pointerdown'));
    expect(box()).toHaveLength(0);
  });

  it('a grid destroyed listens no more', () => {
    const n = emake({ rows: rowsOf(4), settings: { messages: MSG } });
    printOnMenu(n.g);
    n.g.destroy();
    window.dispatchEvent(new Event('beforeprint'));
    expect(box()).toHaveLength(0);
    expect(marked()).toBe(false);
  });
});

describe('a totals row marked apart from a group row (print.md 11)', () => {
  it('group rows `dzg-print-group`; totals rows `dzg-print-group dzg-print-footer`; data rows neither', async () => {
    const b = BUNDLES.en;
    const t = gmake({ grouping: { by: ['region'], footers: 'both', expanded: 'all' }, lang: 'en', settings: { messages: { locale: b.locale, text: { ...b.text, ...EN_PRINT.text } } } });
    const done = await preparePrint(t.g);
    const cls = [...document.querySelector<HTMLTableElement>('body > .dzg-print table')!.tBodies[0]!.rows].map((r) => r.className);
    // The fixture's shops: Nord (3), Sud (2), (Blank) (1); a footer under each, the grand total last.
    expect(cls).toEqual([
      'dzg-print-group', '', '', '', 'dzg-print-group dzg-print-footer',
      'dzg-print-group', '', '', 'dzg-print-group dzg-print-footer',
      'dzg-print-group', '', 'dzg-print-group dzg-print-footer',
      'dzg-print-group dzg-print-footer',
    ]);
    done!();
  });
});
