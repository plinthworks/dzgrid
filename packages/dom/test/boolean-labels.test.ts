// Yes / no in the grid's language without a part (docs/behaviors/badge-boolean.md « Yes / no … without a part », 1.10.0;
// owner 2026-11-10): a boolean column showed « true / false » whatever the language. The displayed text is the
// translated word; the data paths (default CSV, clipboard, Excel) keep the codec's export text.
import { afterEach, describe, expect, it } from 'vitest';
import { booleanCodecWith, makeQuery, type ColumnDef } from '@dzgrid/core';
import { cleanup, emake, join, type R } from './support-edit.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { preparePrint } from '../src/print.js';
import { FR_PRINT } from '../src/locales/fr-print.js';

afterEach(cleanup);

const COLS: ColumnDef<R, any>[] = [
  { id: 'name', header: 'Name', width: 120 },
  { id: 'even', header: 'Even', type: 'boolean', value: (r) => r.n % 2 === 0, width: 80 },
];
const text = (m: ReturnType<typeof emake>, id: string) => m.cell(id, 'even')!.textContent;
const shown = (m: ReturnType<typeof emake>) => m.g.kernel.rows.displayed.count;
const search = (m: ReturnType<typeof emake>, q: string) => m.g.kernel.dispatch({ type: 'query.set', query: makeQuery({ ...m.g.kernel.query, quick: q }) }, 'api');

describe('boolean labels from the grid’s messages', () => {
  it('the base bundles carry them', () => {
    expect([EN, FR, AR].map((b) => [b.text['cell.yes'], b.text['cell.no']])).toEqual([['Yes', 'No'], ['Oui', 'Non'], ['نعم', 'لا']]);
  });

  it('the cell shows the translated word, in French and in Arabic; live with the language (1, 6)', () => {
    const m = emake({ rows: [{ id: 'a', name: 'A', n: 0, s: '', q: 0 }, { id: 'b', name: 'B', n: 1, s: '', q: 0 }], columns: COLS, settings: { messages: FR, locale: 'fr-FR' } });
    expect([text(m, 'a'), text(m, 'b')]).toEqual(['Oui', 'Non']);
    m.g.update({ messages: AR, locale: 'ar' });
    expect([text(m, 'a'), text(m, 'b')]).toEqual(['نعم', 'لا']);
  });

  it('a bundle without the keys: the codec’s own words, nothing thrown (2)', () => {
    const bare = { locale: 'en', text: Object.fromEntries(Object.entries(EN.text).filter(([k]) => !k.startsWith('cell.'))) } as typeof EN; // an app's own bundle, without the two keys
    const m = emake({ rows: [{ id: 'a', name: 'A', n: 0, s: '', q: 0 }], columns: COLS, settings: { messages: bare } });
    expect(text(m, 'a')).toBe('true');
  });

  it('quick search finds the translated word; without labels the column is not searched (3)', () => {
    const m = emake({ columns: COLS, settings: { messages: FR, locale: 'fr-FR' } });
    search(m, 'oui');
    expect(shown(m)).toBe(100);
    search(m, 'true');
    expect(shown(m)).toBe(0);
  });

  it('a column’s own booleanCodecWith labels win (5)', () => {
    const own: ColumnDef<R, any>[] = [{ ...COLS[1]!, codec: booleanCodecWith({ true: 'On', false: 'Off' }) }];
    const m = emake({ rows: [{ id: 'a', name: 'A', n: 0, s: '', q: 0 }], columns: own, settings: { messages: FR, locale: 'fr-FR' } });
    expect(text(m, 'a')).toBe('On');
  });

  it('print shows the word (1)', async () => {
    const m = emake({ rows: [{ id: 'a', name: 'A', n: 0, s: '', q: 0 }], columns: COLS, settings: { messages: join(FR, FR_PRINT), locale: 'fr-FR' } });
    const done = await preparePrint(m.g);
    expect([...document.querySelectorAll('.dzg-print td')].map((c) => c.textContent)).toContain('Oui');
    done?.();
  });
});
