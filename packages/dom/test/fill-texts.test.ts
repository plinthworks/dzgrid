// The fill's texts (`locales/<lang>-fill`, Phase 5 step 12, fill.md 14–18): FILL_KEYS exactly each bundle's keys; the
// sentences by hand in French and Arabic; the target's size built on the block's own plural forms.
import { describe, it, expect } from 'vitest';
import { FILL_KEYS } from '../src/fill.js';
import { EN_FILL } from '../src/locales/en-fill.js';
import { FR_FILL } from '../src/locales/fr-fill.js';
import { AR_FILL } from '../src/locales/ar-fill.js';
import { FR_RANGE } from '../src/locales/fr-range.js';
import { AR_RANGE } from '../src/locales/ar-range.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { msg } from '../src/messages.js';

describe('fill texts', () => {
  it('FILL_KEYS are each bundle\'s keys, all of them', () => {
    for (const b of [EN_FILL, FR_FILL, AR_FILL]) expect(Object.keys(b.text).sort(), b.locale).toEqual([...FILL_KEYS].sort());
  });

  it('the sentences, in French and Arabic', () => {
    const fr = { locale: 'fr', text: { ...FR.text, ...FR_RANGE.text, ...FR_FILL.text } };
    const ar = { locale: 'ar', text: { ...AR.text, ...AR_RANGE.text, ...AR_FILL.text } };
    expect(msg(fr, 'fill.filled', { n: 6 }) + msg(fr, 'range.refused', { n: 1 })).toBe('Cellules recopiées : 6 ; refusées : 1');
    expect(msg(fr, 'fill.down', { n: msg(fr, 'range.rows', { n: 3 }) })).toBe('Vers le bas : 3 lignes');
    expect(msg(fr, 'fill.cancel')).toBe('Recopie annulée');
    expect(msg(ar, 'fill.end', { n: msg(ar, 'range.cols', { n: 2 }) })).toBe('إلى النهاية: عمودان');
    expect(msg(ar, 'fill.bulk', { n: 12 }) + msg(ar, 'range.readOnly', { n: 3 })).toBe('التعديل: 12؛ للقراءة فقط: 3');
  });
});
