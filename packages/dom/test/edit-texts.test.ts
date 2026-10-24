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

  it('a network failure has its own reason (owner S7-O2): « server unreachable », not the server\'s refusal', () => {
    expect(EDIT_KEYS as readonly string[]).toContain('edit.reasonNetwork');
    expect([EN_EDIT, FR_EDIT, AR_EDIT].map((b) => b.text['edit.reasonNetwork'])).toEqual(['server unreachable', 'serveur injoignable', 'تعذّر الوصول إلى الخادم']);
    // The generic one stays the server's « no ».
    expect(FR_EDIT.text['edit.reasonUnknown']).toBe('refusé par le serveur');
  });
  // Phase 5 step 8 (edit-undo.md « Texts », step08-plan « Texts »): the undo and redo sentences, counted in each
  // language's plural forms; the skipped cells too (fr « 1 non annulée » / « 2 non annulées », ar five forms).
  it('undo and redo: the 8 sentences in en, fr and ar, with their plurals', () => {
    const UNDO = ['edit.undone', 'edit.undoneMany', 'edit.redone', 'edit.redoneMany', 'edit.undoSkipped', 'edit.redoSkipped', 'edit.nothingToUndo', 'edit.nothingToRedo'] as const;
    for (const key of UNDO) expect(EDIT_KEYS as readonly string[], key).toContain(key);
    const en: GridMessages = { locale: 'en', text: { ...EN.text, ...EN_EDIT.text } };
    const fr: GridMessages = { locale: 'fr', text: { ...FR.text, ...FR_EDIT.text } };
    const ar: GridMessages = { locale: 'ar', text: { ...AR.text, ...AR_EDIT.text } };
    const all = (m: GridMessages, key: (typeof UNDO)[number], ns: number[]) => ns.map((n) => msg(m, key, { n, column: 'Stock' }));
    expect(msg(en, 'edit.undone', { column: 'Stock' })).toBe('Undone: Stock');
    expect(msg(en, 'edit.redone', { column: 'Stock' })).toBe('Redone: Stock');
    expect(all(en, 'edit.undoneMany', [2, 5])).toEqual(['Undone: 2 cells', 'Undone: 5 cells']);
    expect(all(en, 'edit.redoneMany', [2])).toEqual(['Redone: 2 cells']);
    expect(all(en, 'edit.undoSkipped', [1, 3])).toEqual(['Cannot undo 1: the value changed since', 'Cannot undo 3: the value changed since']);
    expect(all(en, 'edit.redoSkipped', [2])).toEqual(['Cannot redo 2: the value changed since']);
    expect([msg(en, 'edit.nothingToUndo'), msg(en, 'edit.nothingToRedo')]).toEqual(['Nothing to undo', 'Nothing to redo']);
    expect(msg(fr, 'edit.undone', { column: 'Stock' })).toBe('Annulé\u202F: Stock');
    expect(msg(fr, 'edit.redone', { column: 'Stock' })).toBe('Rétabli\u202F: Stock');
    expect(all(fr, 'edit.undoneMany', [2, 12])).toEqual(['Annulé\u202F: 2 cellules', 'Annulé\u202F: 12 cellules']);
    expect(all(fr, 'edit.redoneMany', [3])).toEqual(['Rétabli\u202F: 3 cellules']);
    expect(all(fr, 'edit.undoSkipped', [1, 2])).toEqual(['1 non annulée\u202F: la valeur a changé depuis', '2 non annulées\u202F: la valeur a changé depuis']);
    expect(all(fr, 'edit.redoSkipped', [1, 2])).toEqual(['1 non rétablie\u202F: la valeur a changé depuis', '2 non rétablies\u202F: la valeur a changé depuis']);
    expect([msg(fr, 'edit.nothingToUndo'), msg(fr, 'edit.nothingToRedo')]).toEqual(['Rien à annuler', 'Rien à rétablir']);
    // Arabic: the column's name isolated (a Latin header keeps its place), five plural forms for the counts.
    expect(msg(ar, 'edit.undone', { column: 'Stock' })).toBe('تم التراجع: \u2068Stock\u2069');
    expect(msg(ar, 'edit.redone', { column: 'Stock' })).toBe('تمت الإعادة: \u2068Stock\u2069');
    for (const key of ['edit.undoneMany', 'edit.redoneMany', 'edit.undoSkipped', 'edit.redoSkipped'] as const) expect(Object.keys(AR_EDIT.text[key]).sort(), key).toEqual(['few', 'many', 'one', 'other', 'two']);
    expect(all(ar, 'edit.undoneMany', [2, 3, 11, 100])).toEqual(['تم التراجع عن خليتين (2)', 'تم التراجع عن 3 خلايا', 'تم التراجع عن 11 خلية', 'تم التراجع عن 100 خلية']);
    expect(all(ar, 'edit.redoneMany', [2, 3])).toEqual(['تمت إعادة خليتين (2)', 'تمت إعادة 3 خلايا']);
    expect(all(ar, 'edit.undoSkipped', [1, 4])).toEqual(['تعذّر التراجع عن خلية واحدة (1): تغيّرت القيمة منذ ذلك الحين', 'تعذّر التراجع عن 4 خلايا: تغيّرت القيمة منذ ذلك الحين']);
    expect(all(ar, 'edit.redoSkipped', [1, 2])).toEqual(['تعذّرت إعادة خلية واحدة (1): تغيّرت القيمة منذ ذلك الحين', 'تعذّرت إعادة خليتين (2): تغيّرت القيمة منذ ذلك الحين']);
    expect([msg(ar, 'edit.nothingToUndo'), msg(ar, 'edit.nothingToRedo')]).toEqual(['لا شيء للتراجع عنه', 'لا شيء لإعادته']);
  });
});
