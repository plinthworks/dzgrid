// The block's texts (`locales/<lang>-range`, Phase 5 step 11a): every key in each bundle, the plural forms each
// language has, RANGE_KEYS exactly the bundles' keys.
import { describe, it, expect } from 'vitest';
import { RANGE_KEYS } from '../src/range.js';
import { EN_RANGE } from '../src/locales/en-range.js';
import { FR_RANGE } from '../src/locales/fr-range.js';
import { AR_RANGE } from '../src/locales/ar-range.js';
import { msg } from '../src/messages.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';

const BUNDLES = { en: [EN, EN_RANGE], fr: [FR, FR_RANGE], ar: [AR, AR_RANGE] } as const;

describe('range texts', () => {
  it('RANGE_KEYS are each bundle\'s keys, all of them', () => {
    for (const [lang, [, b]] of Object.entries(BUNDLES)) expect(Object.keys(b.text).sort(), lang).toEqual([...RANGE_KEYS].sort());
  });

  it('the size sentence in each language, with the plural forms', () => {
    const size = (lang: keyof typeof BUNDLES, rows: number, cols: number) => {
      const [base, b] = BUNDLES[lang];
      const m = { locale: b.locale, text: { ...base.text, ...b.text } };
      return msg(m, 'range.size', { rows: msg(m, 'range.rows', { n: rows }), cols: msg(m, 'range.cols', { n: cols }) });
    };
    expect(size('en', 1, 2)).toBe('1 row, 2 columns selected');
    expect(size('en', 3, 1)).toBe('3 rows, 1 column selected');
    expect(size('fr', 3, 2)).toBe('3 lignes, 2 colonnes sélectionnées');
    expect(size('fr', 1, 1)).toBe('1 ligne, 1 colonne sélectionnées');
    expect(size('ar', 2, 2)).toBe('صفان، عمودان محددة');
    expect(size('ar', 3, 1)).toBe('3 صفوف، عمود واحد محددة');
    expect(size('ar', 11, 12)).toBe('11 صفًا، 12 عمودًا محددة');
    expect(size('ar', 100, 0)).toBe('100 صف، لا أعمدة محددة');
  });

  it('the drops\' sentences: plain and « the order changed » (S11-Q4)', () => {
    expect([EN_RANGE, FR_RANGE, AR_RANGE].map((b) => b.text['range.cleared'])).toEqual(['Selection cleared', 'Sélection effacée', 'أُلغي التحديد']);
    expect(FR_RANGE.text['range.reordered']).toBe('Sélection effacée : l’ordre a changé');
    expect(EN_RANGE.text['range.reordered']).toBe('Selection cleared: the order changed');
  });
});
