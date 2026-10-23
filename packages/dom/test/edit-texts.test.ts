// The editing texts (Phase 5 step 4; edit-save.md, edit-validation.md, edit-reapply.md « Texts »): every
// bundle has the keys `edit()` asks for, the same placeholders in every language, the plural forms each
// language has; a host's own `validation.<code>` text is read before the generic one.
import { describe, it, expect } from 'vitest';
import { EDIT_KEYS } from '../src/edit.js';
import { msg, type GridMessages } from '../src/messages.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { FR_EDIT } from '../src/locales/fr-edit.js';
import { AR_EDIT } from '../src/locales/ar-edit.js';

const BUNDLES = { en: EN_EDIT, fr: FR_EDIT, ar: AR_EDIT } as const;
const holes = (v: unknown): string[] => [...new Set([...JSON.stringify(v).matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();

describe('the -edit bundles', () => {
  it('have exactly the keys edit() needs', () => {
    for (const b of Object.values(BUNDLES)) expect(Object.keys(b.text).sort()).toEqual([...EDIT_KEYS].sort());
  });

  it('keep the same placeholders in every language', () => {
    for (const key of EDIT_KEYS) {
      const want = holes(EN_EDIT.text[key]);
      expect(holes(FR_EDIT.text[key]), `fr ${key}`).toEqual(want);
      expect(holes(AR_EDIT.text[key]), `ar ${key}`).toEqual(want);
    }
  });

  it('count in each language’s plural forms (Arabic one, two, few, many, other)', () => {
    const say = (b: GridMessages, n: number) => msg(b, 'edit.reapplied', { n });
    const en: GridMessages = { locale: 'en', text: { ...EN.text, ...EN_EDIT.text } };
    const fr: GridMessages = { locale: 'fr', text: { ...FR.text, ...FR_EDIT.text } };
    const ar: GridMessages = { locale: 'ar', text: { ...AR.text, ...AR_EDIT.text } };
    expect([1, 2].map((n) => say(en, n))).toEqual(['Back in order, 1 row', 'Back in order, 2 rows']);
    expect([1, 2].map((n) => say(fr, n))).toEqual(['Remis en ordre, 1 ligne', 'Remis en ordre, 2 lignes']);
    expect(Object.keys(AR_EDIT.text['edit.reapplied']).sort()).toEqual(['few', 'many', 'one', 'other', 'two']);
    expect([1, 2, 3, 11, 100].map((n) => say(ar, n))).toEqual([
      'أُعيد الترتيب، صف واحد (1)', 'أُعيد الترتيب، صفان (2)', 'أُعيد الترتيب، 3 صفوف', 'أُعيد الترتيب، 11 صفا', 'أُعيد الترتيب، 100 صف',
    ]);
  });

  it('French puts the narrow space before a colon', () => {
    for (const key of ['edit.saveRefused', 'edit.failedMark', 'edit.stale'] as const) expect(FR_EDIT.text[key]).toContain(' :');
  });
});
