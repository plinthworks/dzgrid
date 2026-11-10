import { isBlank, REJECTED, type ValueCodec } from '../codec.js';
import { normalizeDigits, stripMarks } from '../digits.js';

const TRUE = new Set(['true', 'yes', 'y', '1', 'oui', 'vrai', 'نعم', 'صحيح', '✓']);
const FALSE = new Set(['false', 'no', 'n', '0', 'non', 'faux', 'لا', 'خطأ', '✗']);

/**
 * Yes/no read in French, English and Arabic. Shown with `labels` when given (a column's own codec: they win); without
 * them, with the grid's translated words (`LocaleCtx.yesNo`, from its messages' `cell.yes` / `cell.no`), else `true` /
 * `false`. The export text stays `true` / `false` (files and pastes read back in any language).
 */
export function booleanCodecWith(labels?: { readonly true: string; readonly false: string }): ValueCodec<boolean> {
  return {
    kind: 'boolean',
    keyKind: 'number',
    coerce: (raw) => (raw === true || raw === false ? raw : null),
    parse: (text) => {
      const t = normalizeDigits(stripMarks(text)).trim().toLowerCase();
      return TRUE.has(t) ? true : FALSE.has(t) ? false : REJECTED;
    },
    format: (v, ctx) => (labels ? labels[`${v}`] : ctx?.yesNo?.[v ? 0 : 1]) ?? `${v}`,
    sortKey: (v) => (v ? 1 : 0),
    compare: (a, b) => Number(a) - Number(b),
    isEmpty: isBlank,
    equals: (a, b) => a === b,
    toExport: (v) => (v ? 'true' : 'false'),
  };
}

/** The type's default: the grid's translated words (`LocaleCtx.yesNo`), else `true` / `false`. */
export const booleanCodec: ValueCodec<boolean> = booleanCodecWith();
