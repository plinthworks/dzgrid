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

// Step 11b (owner S11b-Q4: a label and its count, no plural forms; clipboard.md « As built at step 11b »).
describe('range texts: the clipboard', () => {
  const say = (lang: keyof typeof BUNDLES, main: string, parts: Record<string, number>) => {
    const [base, b] = BUNDLES[lang];
    const m = { locale: b.locale, text: { ...base.text, ...b.text } };
    return [msg(m, main as never, { n: parts['n']! }), ...Object.entries(parts).filter(([k, v]) => k !== 'n' && v).map(([k, v]) => msg(m, `range.${k}` as never, { n: v }))].join('');
  };
  it('the paste sentence in each language, joined, zero counts left out', () => {
    expect(say('fr', 'range.pasted', { n: 12, refused: 2, readOnly: 3, tooLong: 0, outside: 4 })).toBe('Cellules collées\u202F: 12\u202F; refusées\u202F: 2\u202F; en lecture seule\u202F: 3\u202F; hors de la grille\u202F: 4');
    expect(say('en', 'range.pasted', { n: 12, refused: 2, readOnly: 0, tooLong: 1 })).toBe('Cells pasted: 12; refused: 2; too long: 1');
    expect(say('ar', 'range.pasted', { n: 12, refused: 2, readOnly: 3 })).toBe('اللصق: 12؛ مرفوضة: 2؛ للقراءة فقط: 3');
    expect(say('fr', 'range.copied', { n: 6 })).toBe('Cellules copiées\u202F: 6');
    expect(say('fr', 'range.cut', { n: 4, readOnly: 1 })).toBe('Cellules coupées\u202F: 4\u202F; en lecture seule\u202F: 1');
    expect(say('fr', 'range.erased', { n: 4 })).toBe('Cellules effacées\u202F: 4');
  });
  it('too big and the refused copy', () => {
    const fr = { locale: 'fr', text: { ...FR.text, ...FR_RANGE.text } };
    expect(msg(fr, 'range.tooBig', { max: 100000 })).toBe('Collage trop grand\u202F: au plus 100\u202F000 cellules\u202F; rien n’est collé');
    expect([EN_RANGE, FR_RANGE, AR_RANGE].map((b) => b.text['range.noCopy'])).toEqual(['Copying not allowed', 'Copie non autorisée', 'النسخ ممنوع']);
    expect(msg({ locale: 'en', text: { ...EN.text, ...EN_RANGE.text } }, 'range.tooBig', { max: 4 })).toBe('Paste too large: at most 4 cells; nothing pasted');
  });
  it('no plural forms in the clipboard texts (one string each)', () => {
    for (const b of [EN_RANGE, FR_RANGE, AR_RANGE]) for (const k of RANGE_KEYS.slice(5)) expect(typeof b.text[k], `${b.locale} ${k}`).toBe('string');
  });
});
