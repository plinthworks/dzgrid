import { isBlank, REJECTED, type ValueCodec } from '../codec.js';
import { normalizeDigits, stripMarks } from '../digits.js';

const TRUE = new Set(['true', 'yes', 'y', '1', 'oui', 'vrai', 'نعم', 'صحيح', '✓']);
const FALSE = new Set(['false', 'no', 'n', '0', 'non', 'faux', 'لا', 'خطأ', '✗']);

/** Yes/no in French, English and Arabic; the display labels come from the host (translated). */
export function booleanCodecWith(labels: { readonly true: string; readonly false: string }): ValueCodec<boolean> {
  return {
    kind: 'boolean',
    keyKind: 'number',
    coerce: (raw) => (raw === true || raw === false ? raw : null),
    parse: (text) => {
      const t = normalizeDigits(stripMarks(text)).trim().toLowerCase();
      return TRUE.has(t) ? true : FALSE.has(t) ? false : REJECTED;
    },
    format: (v) => (v ? labels.true : labels.false),
    sortKey: (v) => (v ? 1 : 0),
    compare: (a, b) => Number(a) - Number(b),
    isEmpty: isBlank,
    equals: (a, b) => a === b,
    toExport: (v) => (v ? 'true' : 'false'),
  };
}

/** With the raw words as labels; a grid shows the host's translated labels instead. */
export const booleanCodec: ValueCodec<boolean> = booleanCodecWith({ true: 'true', false: 'false' });
