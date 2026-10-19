// The number box read in the user's language (step 12, filter-number.md): a table of what people
// type, then a round trip of the language's own writing of random numbers, through the box.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { formattersFor, localeCtx } from '@dzgrid/core';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { FR_FILTERS } from '../src/locales/fr-filters.js';
import { AR_FILTERS } from '../src/locales/ar-filters.js';
import { cleanup, make, MESSAGES } from './support-filters.js';

afterEach(cleanup);

const AR_MSG = { locale: 'ar', text: { ...AR.text, ...AR_FILTERS.text } };
const LANGS = {
  'en-US': { locale: 'en-US', numerals: 'latn', messages: MESSAGES },
  'fr-FR': { locale: 'fr-FR', numerals: 'latn', messages: { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text } } },
  'ar-DZ': { locale: 'ar-DZ', numerals: 'latn', messages: AR_MSG },
  'ar-SA': { locale: 'ar-SA', numerals: 'locale', messages: AR_MSG },
} as const;
type L = keyof typeof LANGS;
const ALM = '\u061C';

// [typed, the number, or null: refused (aria-invalid after the pause, the filter in force kept); NaN: the filter removed, nothing marked]
const TABLE: Record<L, [string, number | null][]> = {
  'en-US': [['1,234', 1234], ['1,5', null], ['1.5', 1.5], ['-1,234.5', -1234.5], ['12%', 0.12], ['\u0661\u0662', 12], ['\u0661\u066C\u0662\u0663\u0664', 1234], ['\u22123', -3], ['+4', 4], ['1 234', 1234], ['1.234.567', null], ['0,500', null], ['1,234,567.25', 1234567.25], ['--1', null], ['1e3', 1000], ['', NaN], ['   ', NaN]],
  'fr-FR': [['1,5', 1.5], ['1 234,5', 1234.5], ['1\u202F234,5', 1234.5], ['1\u00A0234,5', 1234.5], ['1.5', 1.5], ['1,234', 1.234], ['1.234,5', 1234.5], ['12 %', 0.12], ['-\u0661\u066B\u0665', -1.5], ['1,2,3', null], ['abc', null]],
  'ar-DZ': [['1,5', 1.5], ['1.5', null], ['1.234', 1234], ['\u0661\u066B\u0665', 1.5], ['12\u066A', 0.12], [`${ALM}-5`, -5], ['1.234,5', 1234.5], [`\u200F-\u0667`, -7]],
  'ar-SA': [['\u0661\u066B\u0665', 1.5], ['1.5', 1.5], ['1,5', null], ['\u0661\u066C\u0662\u0663\u0664', 1234], ['\u0665\u0660\u066A', 0.5], [`${ALM}-\u0663`, -3], ['\u0661\u066C\u0662\u0663', null], ['\u0661\u066B\u0662\u066B\u0663', null]],
};

describe('the number box in four languages', () => {
  for (const lang of Object.keys(TABLE) as L[]) {
    it(`reads what people type in ${lang}`, () => {
      vi.useFakeTimers();
      const l = LANGS[lang];
      const t = make({ columns: [{ id: 'n', header: 'N', type: 'number' }], settings: { locale: l.locale, numerals: l.numerals, messages: l.messages } as never });
      // A filter in force that a refused text must keep.
      t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'equals', value: 99 } }, 'api');
      for (const [typed, want] of TABLE[lang]) {
        t.type('n', typed);
        vi.advanceTimersByTime(150);
        const f = t.g.kernel.query.filter['n'];
        const box = t.input('n')!;
        if (Number.isNaN(want)) {
          expect(f, `${lang} "${typed}"`).toBeUndefined();
          expect(box.getAttribute('aria-invalid')).toBeNull();
        }
        else if (want === null) {
          expect(box.getAttribute('aria-invalid'), `${lang} "${typed}" marked`).toBe('true');
        } else {
          expect(f, `${lang} "${typed}"`).toEqual({ type: 'number', op: 'equals', value: want });
          expect(box.getAttribute('aria-invalid')).toBeNull();
        }
        // Back to the known filter for the next line (and the box no longer typed into).
        t.type('n', '');
        vi.advanceTimersByTime(150);
        t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'equals', value: 99 } }, 'api');
      }
    });

    it(`reads back its own writing of random numbers in ${lang}: grouped, plain, percent, signs`, () => {
      vi.useFakeTimers();
      const l = LANGS[lang];
      const ctx = localeCtx({ locale: l.locale, numerals: l.numerals });
      const t = make({ columns: [{ id: 'n', header: 'N', type: 'number' }], settings: { locale: l.locale, numerals: l.numerals, messages: l.messages } as never });
      let s = 12345;
      const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
      const values = [0, 1, -1, 0.5, -0.001, 1234.5, -1234567.25, 1e9, 123456789.125];
      for (let i = 0; i < 60; i++) values.push(Math.round((rnd() - 0.5) * 10 ** Math.floor(rnd() * 9) * 1000) / 1000);
      const f = formattersFor(ctx);
      for (const v of values) {
        for (const [text, want] of [
          [f.number({ useGrouping: true })(v), v],
          [f.number({ useGrouping: false })(v), v],
          [f.number({ style: 'percent', maximumFractionDigits: 8 })(v), v],
        ] as const) {
          t.type('n', text);
          vi.advanceTimersByTime(150);
          const got = t.g.kernel.query.filter['n'] as { value: number } | undefined;
          expect(got?.value, `${lang} ${v} as "${text}"`).toBe(want === 0 ? 0 : want);
        }
        // The host's filter is written so it reads back to itself.
        t.g.kernel.dispatch({ type: 'filter.set', filter: {} }, 'api');
        t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'equals', value: v } }, 'api');
        const shown = t.input('n')!.value;
        t.type('n', shown);
        vi.advanceTimersByTime(150);
        expect((t.g.kernel.query.filter['n'] as { value: number }).value, `${lang} shown "${shown}"`).toBe(v === 0 ? 0 : v);
      }
    });
  }
});
