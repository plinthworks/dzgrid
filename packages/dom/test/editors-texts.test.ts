// The editors' texts (Phase 5 step 5, docs/phase-5-steps/step05-plan.md « Texts »; owner S5-O3): every
// `-editors` bundle has exactly the keys `editors()` asks for, the same placeholders in every language; the
// five reading codes moved there from `-edit`, verbatim; the French narrow space before a colon.
import { describe, it, expect } from 'vitest';
import { EDITORS_KEYS } from '../src/editors.js';
import { EDIT_KEYS } from '../src/edit.js';
import { EN_EDITORS } from '../src/locales/en-editors.js';
import { FR_EDITORS } from '../src/locales/fr-editors.js';
import { AR_EDITORS } from '../src/locales/ar-editors.js';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { FR_EDIT } from '../src/locales/fr-edit.js';
import { AR_EDIT } from '../src/locales/ar-edit.js';

const BUNDLES = { en: EN_EDITORS, fr: FR_EDITORS, ar: AR_EDITORS } as const;
const holes = (v: unknown): string[] => [...new Set([...JSON.stringify(v).matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();
const PARSE = ['validation.parse', 'validation.day', 'validation.invalid-instant', 'validation.wall-time-skipped', 'validation.wall-time-ambiguous'];

describe('the -editors bundles', () => {
  it('have exactly the keys editors() needs: two sentences, the field name, the five reading codes', () => {
    expect([...EDITORS_KEYS].sort()).toEqual(['edit.refused', 'edit.refusedDropped', 'editors.fieldName', ...PARSE].sort());
    for (const b of Object.values(BUNDLES)) expect(Object.keys(b.text).sort()).toEqual([...EDITORS_KEYS].sort());
  });

  it('the reading codes left -edit (edit() no longer asks for them)', () => {
    for (const k of PARSE) expect(EDIT_KEYS as readonly string[]).not.toContain(k);
    for (const b of [EN_EDIT, FR_EDIT, AR_EDIT]) for (const k of PARSE) expect(Object.keys(b.text)).not.toContain(k);
  });

  it('keep the same placeholders in every language', () => {
    for (const key of EDITORS_KEYS) {
      const want = holes(EN_EDITORS.text[key]);
      expect(holes(FR_EDITORS.text[key]), `fr ${key}`).toEqual(want);
      expect(holes(AR_EDITORS.text[key]), `ar ${key}`).toEqual(want);
    }
    expect(holes(EN_EDITORS.text['edit.refused'])).toEqual(['column', 'reason']);
    expect(holes(EN_EDITORS.text['editors.fieldName'])).toEqual(['column', 'row']);
  });

  it('the sheets’ wording (edit-validation.md « Texts »)', () => {
    expect(EN_EDITORS.text['edit.refused']).toBe('{column}: value refused, {reason}');
    expect(FR_EDITORS.text['edit.refused']).toBe('{column} : valeur refusée, {reason}');
    expect(AR_EDITORS.text['edit.refused']).toBe('{column}: قيمة مرفوضة، {reason}');
    expect(FR_EDITORS.text['edit.refusedDropped']).toBe('{column} : valeur refusée, modification annulée');
    expect(AR_EDITORS.text['editors.fieldName']).toBe('{column}، {row}');
    expect(FR_EDITORS.text['validation.parse']).toBe('nombre attendu');
  });
});
