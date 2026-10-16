import { describe, it, expect } from 'vitest';
import { localeCtx, intlTag, formattersFor, readNumber, readMachineNumber, normalizeDigits, stripMarks, dayFieldOrder, separatorsFor } from '@dzgrid/core';

describe('localeCtx', () => {
  it('refuses a bad locale or zone as a programming error', () => {
    expect(() => localeCtx({ locale: 'not a locale!!' })).toThrow(RangeError);
    expect(() => localeCtx({ locale: 'fr-FR', timeZone: 'Mars/Olympus' })).toThrow(RangeError);
    expect(() => localeCtx({ locale: 'fr-FR', numerals: 'roman' as 'latn' })).toThrow(RangeError);
  });

  it('defaults to Latin digits, UTC and the Gregorian calendar', () => {
    expect(localeCtx({ locale: 'ar-SA' })).toEqual({ locale: 'ar-SA', numerals: 'latn', timeZone: 'UTC', calendar: 'gregory' });
  });
});

describe('intlTag', () => {
  it('replaces any calendar or numbering keyword the locale came with', () => {
    expect(intlTag({ locale: 'ar-SA-u-ca-islamic', numerals: 'latn' })).toBe('ar-SA-u-ca-gregory-nu-latn');
    expect(intlTag({ locale: 'fr-FR', numerals: 'latn' })).toBe('fr-FR-u-ca-gregory-nu-latn');
  });

  it("writes out the language's own digits when asked for them", () => {
    expect(intlTag({ locale: 'ar-EG', numerals: 'locale' })).toBe('ar-EG-u-ca-gregory-nu-arab');
    expect(intlTag({ locale: 'ar-DZ', numerals: 'locale' })).toBe('ar-DZ-u-ca-gregory-nu-latn');
  });
});

describe('formatters', () => {
  it('are built once per context', () => {
    const ctx = localeCtx({ locale: 'fr-FR' });
    expect(formattersFor(ctx)).toBe(formattersFor(localeCtx({ locale: 'fr-FR' })));
    expect(formattersFor(ctx).number()).toBe(formattersFor(ctx).number());
  });

  it('read the order a language writes days in', () => {
    expect(dayFieldOrder(localeCtx({ locale: 'fr-FR' }))).toEqual(['d', 'm', 'y']);
    expect(dayFieldOrder(localeCtx({ locale: 'en-US' }))).toEqual(['m', 'd', 'y']);
    expect(dayFieldOrder(localeCtx({ locale: 'ja-JP' }))).toEqual(['y', 'm', 'd']);
  });
});

describe('digits and marks', () => {
  it('fold Arabic-Indic and Persian digits, and drop direction marks', () => {
    expect(normalizeDigits('٠١٢٣٤٥٦٧٨٩ ۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789 0123456789');
    expect(stripMarks('‏‎؜1⁦⁩')).toBe('1');
  });
});

describe('readNumber', () => {
  const fr = localeCtx({ locale: 'fr-FR' });
  const en = localeCtx({ locale: 'en-US' });

  it("knows each locale's signs", () => {
    expect(separatorsFor(fr)).toEqual({ group: ' ', decimal: ',' });
    expect(separatorsFor(en)).toEqual({ group: ',', decimal: '.' });
  });

  it('reads a point as the decimal when the locale has no use for it', () => {
    // French groups with a narrow space, so a lone point can only be a decimal.
    expect(readNumber('1.5', fr)).toBe(1.5);
  });

  it('refuses what is not a number', () => {
    for (const t of ['abc', '1-2', '--1', '0x1F', 'NaN', 'Infinity', '1e400', '1 2', '12,34,5', ',', '.', '%']) {
      expect(readNumber(t, en), t).toBeNull();
    }
  });
});

describe('readMachineNumber', () => {
  it('reads strict decimal text and finite numbers only', () => {
    expect(readMachineNumber(1.5)).toBe(1.5);
    expect(readMachineNumber('-12.5e2')).toBe(-1250);
    expect(Object.is(readMachineNumber(-0), 0)).toBe(true);
    for (const v of ['1,5', ' 1', '1.', '.5', 'NaN', Infinity, null, '0x10', '']) expect(readMachineNumber(v), String(v)).toBeNull();
  });
});
