// The texts of moving columns (`locales/<lang>-columns`, Phase 6 step 2, docs/behaviors/column-move.md « Texts »):
// COLUMNS_KEYS exactly each bundle's keys; the sentences by hand in English, French (a narrow no-break space before
// « : ») and Arabic; numbers through the grid's number format (Algerian Arabic keeps Latin digits).
import { describe, it, expect } from 'vitest';
import { localeCtx } from '@dzgrid/core';
import { COLUMNS_KEYS } from '../src/columns.js';
import { EN_COLUMNS } from '../src/locales/en-columns.js';
import { FR_COLUMNS } from '../src/locales/fr-columns.js';
import { AR_COLUMNS } from '../src/locales/ar-columns.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { msg } from '../src/messages.js';

describe('columns texts', () => {
  it('COLUMNS_KEYS are each bundle\'s keys, all four of them', () => {
    expect([...COLUMNS_KEYS].sort()).toEqual(['move.cancelled', 'move.edge', 'move.locked', 'move.placed']);
    // The chooser's own keys share the bundles (Phase 6 step 4, Q4-1): columns-chooser-texts.test.ts.
    for (const b of [EN_COLUMNS, FR_COLUMNS, AR_COLUMNS]) expect(Object.keys(b.text).filter((k) => k.startsWith('move.')).sort(), b.locale).toEqual([...COLUMNS_KEYS].sort());
    expect([EN_COLUMNS.locale, FR_COLUMNS.locale, AR_COLUMNS.locale]).toEqual(['en', 'fr', 'ar']);
  });

  it('the sentences, in English, French and Arabic', () => {
    const en = { locale: 'en', text: { ...EN.text, ...EN_COLUMNS.text } };
    const fr = { locale: 'fr', text: { ...FR.text, ...FR_COLUMNS.text } };
    const ar = { locale: 'ar', text: { ...AR.text, ...AR_COLUMNS.text } };
    expect(msg(en, 'move.placed', { column: 'Qty', n: 4, total: 9 })).toBe('Qty: column 4 of 9');
    expect(msg(en, 'move.edge', { column: 'Qty' })).toBe('Qty: already at the edge');
    expect(msg(en, 'move.locked', { column: 'Ref' })).toBe('Ref: cannot be moved');
    expect(msg(en, 'move.cancelled')).toBe('Move cancelled');
    expect(msg(fr, 'move.placed', { column: 'Qté', n: 4, total: 9 })).toBe('Qté\u202F: colonne 4 sur 9');
    expect(msg(fr, 'move.edge', { column: 'Qté' })).toBe('Qté\u202F: déjà au bord');
    expect(msg(fr, 'move.locked', { column: 'Commande' })).toBe('Commande\u202F: ne se déplace pas');
    expect(msg(fr, 'move.cancelled')).toBe('Déplacement annulé');
    const dz = localeCtx({ locale: 'ar-DZ' });
    expect(msg(ar, 'move.placed', { column: 'الكمية', n: 4, total: 9 }, dz)).toBe('الكمية: العمود 4 من 9');
    expect(msg(ar, 'move.edge', { column: 'الكمية' })).toBe('الكمية: في الطرف أصلًا');
    expect(msg(ar, 'move.locked', { column: 'الطلب' })).toBe('الطلب: لا يمكن نقله');
    expect(msg(ar, 'move.cancelled')).toBe('أُلغي النقل');
  });

  it('a thousand columns: the place written with the grid\'s grouping (French: a narrow no-break space)', () => {
    const fr = { locale: 'fr', text: { ...FR.text, ...FR_COLUMNS.text } };
    expect(msg(fr, 'move.placed', { column: 'c999', n: 1000, total: 1000 }, localeCtx({ locale: 'fr-FR' }))).toBe('c999\u202F: colonne 1\u202F000 sur 1\u202F000');
  });
});
