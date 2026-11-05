// Phase 7 step 7: printing a grouped grid (docs/behaviors/print.md « Grouped rows » 1–5; owner Q-EX A): the rows as the
// screen shows them, group and totals rows included, the label in the grouping's column, totals as shown, a bold class.
import { afterEach, describe, expect, it } from 'vitest';
import { preparePrint } from '../src/print.js';
import { EN_PRINT } from '../src/locales/en-print.js';
import { FR_PRINT } from '../src/locales/fr-print.js';
import { BUNDLES, cleanup, gmake } from './support-grouping.js';
import type { GroupingFeatureOptions } from '../src/grouping.js';

afterEach(cleanup);

const EM = ' ';
const table = () => document.querySelector<HTMLTableElement>('body > .dzg-print table')!;
const body = () => [...table().tBodies[0]!.rows].map((r) => [...r.cells].map((c) => c.textContent));
const marked = () => [...table().tBodies[0]!.rows].map((r) => r.classList.contains('dzg-print-group'));

function printing(grouping: GroupingFeatureOptions, lang: 'en' | 'fr' = 'en') {
  const b = BUNDLES[lang];
  const messages = { locale: b.locale, text: { ...b.text, ...(lang === 'fr' ? FR_PRINT : EN_PRINT).text } };
  return gmake({ grouping, lang, settings: { messages } });
}

describe('a grouped grid printed', () => {
  it('group rows as shown, the open group\'s rows one step deeper, the grand total last; closed groups print as their row', async () => {
    const t = printing({ by: ['region'], footers: 'grand' });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [t.keyAt(0)], expanded: true }, 'user');
    const done = await preparePrint(t.g);
    expect(body()).toEqual([
      ['Nord (3)', '', '', '12.5', '', ''],
      [`${EM}Shop 1`, 'Nord', 'apple', '10', '1.5', '03/02/2026'],
      [`${EM}Shop 3`, 'Nord', 'apple', '2.5', '1', '03/05/2026'],
      [`${EM}Shop 4`, 'Nord', 'pear', '', '3', '03/04/2026'],
      ['Sud (2)', '', '', '12', '', ''],
      ['(Blank) (1)', '', '', '1', '', ''],
      ['Total', '', '', '25.5', '', ''],
    ]);
    expect(marked()).toEqual([true, false, false, false, true, true, true]);
    done!();
  });

  it('the label in the application\'s column, a footer « Total … », French numbers', async () => {
    const t = printing({ by: ['region'], column: 'fruit', footers: 'group', expanded: 'all' }, 'fr');
    const done = await preparePrint(t.g);
    const rows = body();
    expect(rows[0]).toEqual(['', '', 'Nord (3)', '12,5', '', '']);
    expect(rows[1]).toEqual(['Shop 1', 'Nord', `${EM}apple`, '10', '1,5', '02/03/2026']);
    expect(rows[4]).toEqual(['', '', `${EM}Total Nord`, '12,5', '', '']);
    done!();
  });

  it('maxRows counts the printed lines, group lines included', async () => {
    const t = printing({ by: ['region'], expanded: 'all' });
    const done = await preparePrint(t.g, { maxRows: 3 });
    expect(body().map((r) => r[0])).toEqual(['Nord (3)', `${EM}Shop 1`, `${EM}Shop 3`]);
    done!();
  });

  it('a flat grid is unchanged: no class, no group line', async () => {
    const t = printing({ by: [] });
    const done = await preparePrint(t.g);
    expect(body()).toHaveLength(6);
    expect(marked().some(Boolean)).toBe(false);
    done!();
  });
});
