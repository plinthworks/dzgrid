import { describe, it, expect } from 'vitest';
import { localeCtx, REJECTED, textCodec, numberCodec, booleanCodec, booleanCodecWith, enumCodec, dayCodec, instantCodec, instantToIso, parseInstant, parseDay, fold, type InstantMs } from '@dzgrid/core';
import { iso } from '../../../conformance/runner/iso.js';

const fr = localeCtx({ locale: 'fr-FR', timeZone: 'Europe/Paris' });
const ar = localeCtx({ locale: 'ar-DZ' });

describe('text', () => {
  it('coerces numbers and booleans to text and nothing else', () => {
    expect(textCodec.coerce(12, fr)).toBe('12');
    expect(textCodec.coerce(true, fr)).toBe('true');
    expect(textCodec.coerce({}, fr)).toBeNull();
  });

  it('compares as the language does, digits as numbers', () => {
    const sorted = ['b10', 'B2', 'é', 'a', 'e'].sort((x, y) => textCodec.compare(x, y, fr));
    expect(sorted).toEqual(['a', 'B2', 'b10', 'é', 'e'].sort((x, y) => textCodec.compare(x, y, fr)));
    expect(textCodec.compare('2', '10', fr)).toBeLessThan(0);
    expect(textCodec.compare('é', 'E', fr)).toBe(0);
  });

  it('keeps a cell of spaces as a value', () => {
    expect(textCodec.isEmpty('  ')).toBe(false);
    expect(textCodec.isEmpty('')).toBe(true);
  });
});

describe('number', () => {
  it('reads machine values strictly and typed text by the locale', () => {
    expect(numberCodec.coerce('1,5', fr)).toBeNull();
    expect(numberCodec.parse('1,5', fr)).toBe(1.5);
    expect(numberCodec.parse('', fr)).toBe(REJECTED);
    expect(numberCodec.toExport(-0)).toBe('0');
  });
});

describe('boolean', () => {
  it('reads yes and no in French, English and Arabic', () => {
    for (const [t, v] of [['Oui', true], [' NON ', false], ['نعم', true], ['لا', false], ['١', true], ['yes', true], ['0', false]] as const) {
      expect(booleanCodec.parse(t, ar), t).toBe(v);
    }
    expect(booleanCodec.parse('maybe', fr)).toBe(REJECTED);
    expect(booleanCodec.parse('', fr)).toBe(REJECTED);
    expect(booleanCodec.coerce('yes', fr)).toBeNull();
  });

  it('shows the labels the host translated', () => {
    expect(booleanCodecWith({ true: 'Oui', false: 'Non' }).format(true, fr)).toBe('Oui');
  });
});

describe('enum', () => {
  const status = enumCodec([{ value: 'A', label: 'Actif' }, { value: 'I', label: 'Inactif', aliases: ['inactive'] }, { value: 'E', label: 'Éteint' }]);

  it('matches values, labels and aliases, folded', () => {
    expect(status.parse('actif', fr)).toBe('A');
    expect(status.parse('INACTIF', fr)).toBe('I');
    expect(status.parse('inactive', fr)).toBe('I');
    expect(status.parse('eteint', fr)).toBe('E');
    expect(status.parse('x', fr)).toBe(REJECTED);
  });

  it('shows the label, or the raw value when it is no option, and exports the raw value', () => {
    expect(status.format('A', fr)).toBe('Actif');
    expect(status.format('Z', fr)).toBe('Z');
    expect(status.toExport('A')).toBe('A');
  });

  it('can sort in the order the options were given', () => {
    const ordered = enumCodec([{ value: 'low' }, { value: 'medium' }, { value: 'high' }], { sort: 'option-order' });
    expect(['high', 'low', 'unknown', 'medium'].sort((a, b) => ordered.compare(a, b, fr))).toEqual(['low', 'medium', 'high', 'unknown']);
  });
});

describe('day', () => {
  it('coerces a bare day only — a date-time is not cut down to one', () => {
    expect(dayCodec.coerce('2026-03-05', fr)).toBe('2026-03-05');
    expect(dayCodec.coerce('2026-03-05T10:00:00Z', fr)).toBeNull();
  });

  it('sorts by day number', () => {
    expect(dayCodec.sortKey(parseDay('1970-01-02')!, fr)).toBe(1);
  });
});

describe('instant', () => {
  const codec = instantCodec();

  it('needs an offset in machine values unless a zone is assumed', () => {
    expect(codec.coerce('2026-03-05T10:00', fr)).toBeNull();
    expect(codec.why!('2026-03-05T10:00', fr)).toBe('ambiguous-instant');
    expect(instantCodec({ assumeZone: 'Africa/Algiers' }).coerce('2026-03-05T10:00', fr)).toBe(parseInstant('2026-03-05T09:00Z'));
    expect(codec.coerce('2026-03-05', fr)).toBeNull();
  });

  it('writes ISO exactly as the conformance runner does', () => {
    for (const t of ['1970-01-01T00:00:00Z', '1969-12-31T23:59:59.999Z', '2026-03-05T10:00:00.500Z', '2011-12-30T10:00:00Z']) {
      const ms = parseInstant(t)!;
      expect(instantToIso(ms)).toBe(t);
      expect(instantToIso(ms)).toBe(iso(ms));
    }
    expect(instantToIso((-0.5) as InstantMs)).toBe('1969-12-31T23:59:59.999Z');
  });
});

describe('fold', () => {
  it('drops case, accents, Arabic marks and tatweel, unifies alef and digits', () => {
    expect(fold('Hélène')).toBe('helene');
    expect(fold('مُحَمَّد')).toBe('محمد');
    expect(fold('أحـمد')).toBe('احمد');
    expect(fold('إآٱ')).toBe('ااا');
    expect(fold('١٢٣')).toBe('123');
  });

  it('keeps ة and ه apart, reads ى as ي, decomposes presentation forms', () => {
    expect(fold('ة')).not.toBe(fold('ه'));
    expect(fold('مصطفى')).toBe('مصطفي');
    expect(fold('ﻻ')).toBe('لا');
    expect(fold('İ')).toBe('i');
    expect(fold('Éric')).toBe('eric');
  });
});

describe('fold, per character', () => {
  it('agrees with the whole-string definition on the scripts a grid filters', async () => {
    const { foldSlow } = await import('../src/i18n/fold.js');
    const { datasetA } = await import('../../../perf/dataset.js');
    const rows = datasetA(20_000, 3);
    for (const r of rows) {
      for (const s of [r.t0, r.t1, r.a0, r.a1]) if (fold(s) !== foldSlow(s)) throw new Error(`disagree on ${JSON.stringify(s)}`);
    }
    for (const s of ['Hélène', 'ÉRIC', 'İstanbul', 'ﻻ', 'ﷲ', 'مُحَمَّد', 'أحـمد', 'مصطفى', '١٢٣', 'é', '\u200fx', '𝐀', 'ß', 'Œuvre', 'ǅ']) {
      expect(fold(s), s).toBe(foldSlow(s));
    }
  });
});
