import { describe, it, expect } from 'vitest';
import { localeCtx } from '@dzgrid/core';
import { toCsv, csvSeparatorFor, type CsvOptions } from '@dzgrid/core/csv';
import { mulberry32 } from '../support/rng.js';
import { parseCsv } from '../support/rfc4180.js';
import { grid } from './support.js';

/** Oracle: the decimal mark straight from Intl (Latin digits), the file read back by RFC 4180, the number re-read exactly. */
const decimalOf = (locale: string): string => new Intl.NumberFormat(`${locale}-u-nu-latn`).formatToParts(1.5).find((p) => p.type === 'decimal')!.value;
const LOCALES = ['en-US', 'fr-FR', 'de-DE', 'de-CH', 'ar-DZ', 'ar-SA', 'ar-EG', 'fa-IR', 'hi-IN', 'ru-RU', 'pt-BR', 'nl-NL', 'sv-SE', 'he-IL', 'ar-MA'];

function num(r: () => number): number {
  const p = r();
  if (p < 0.15) return Math.floor((r() - 0.5) * 2e6);
  if (p < 0.3) return (r() - 0.5) * 10 ** Math.floor(r() * 40 - 20);
  if (p < 0.4) return [0, -0, 0.1, -0.5, 1e21, -1e-7, 5e-324, Number.MAX_VALUE, -Number.MIN_SAFE_INTEGER, 123456789.123][Math.floor(r() * 10)]!;
  return Math.round((r() - 0.5) * 1e8) / 100;
}

describe('numbers vs an Intl oracle, every locale and separator', () => {
  for (const locale of LOCALES) {
    it(locale, () => {
      const ctx = localeCtx({ locale, numerals: /^(ar|fa|hi)/.test(locale) ? 'locale' : 'latn', timeZone: 'UTC' } as never);
      const dec = decimalOf(locale);
      const r = mulberry32(locale.length * 977 + locale.charCodeAt(0));
      const values = Array.from({ length: 200 }, () => num(r));
      const g = grid([{ id: 'n', header: 'N', type: 'number' as const }], values.map((n) => ({ n })), ctx);
      for (const separator of [undefined, ',', ';', '\t'] as const) {
        for (const numbers of [undefined, 'raw'] as const) {
          const o: CsvOptions = { bom: false, ...(separator && { separator }), ...(numbers && { numbers }) };
          const sep = separator ?? (dec === ',' ? ';' : ',');
          expect(csvSeparatorFor(ctx)).toBe(dec === ',' ? ';' : ',');
          const mark = numbers === 'raw' || sep === ',' ? '.' : dec;
          const back = parseCsv(toCsv({ rows: g.model.displayed, columns: g.columns, ctx }, o), sep).slice(1).map((x) => x[0]!);
          back.forEach((f, i) => {
            const v = values[i]!;
            const where = `${locale} sep=${JSON.stringify(sep)} ${numbers ?? 'excel'} v=${v} f=${f}`;
            expect(/^-?[0-9]/.test(f), where).toBe(true); // Latin digits, never grouped, no guard
            expect(f.includes(mark === '.' ? ',' : '.'), where).toBe(false);
            expect(Number(f.replace(mark, '.')), where).toBe(Object.is(v, -0) ? 0 : v);
          });
        }
      }
    });
  }
});
