import { localeCtx, readNumber, formattersFor, formatParts, parseDay, parseInstant, stripMarks, REJECTED, dayCodec, instantCodec, booleanCodec, enumCodec, instantToIso, type InstantMs } from '@dzgrid/core';
import type { Suite } from './index.js';

export const format: Record<string, Suite> = {
  'value-parse': ({ type, locale, timeZone, text, options }) => {
    const ctx = localeCtx({ locale, ...(timeZone && { timeZone }) });
    if (type === 'number') {
      const v = readNumber(text, ctx);
      return v === null ? { rejected: true } : { value: v };
    }
    const codec = type === 'day' ? dayCodec : type === 'instant' ? instantCodec() : type === 'boolean' ? booleanCodec : type === 'enum' ? enumCodec(options) : null;
    if (!codec) throw new Error(`unknown type ${type}`);
    const v = (codec.parse as (t: string, c: typeof ctx) => unknown)(text, ctx);
    if (v === REJECTED) return { rejected: true };
    return { value: type === 'instant' ? instantToIso(v as InstantMs) : v };
  },
  format: ({ kind, locale, numerals, timeZone, value }) => {
    const ctx = localeCtx({ locale, ...(numerals && { numerals }), ...(timeZone && { timeZone }) });
    const v = kind === 'day' ? parseDay(value) : kind === 'instant' ? parseInstant(value) : value;
    const f = formattersFor(ctx);
    const text = kind === 'number' ? f.number()(v) : kind === 'day' ? f.day()(v) : f.instant()(v);
    // Cases written as parts compare the meaningful fields only: literals and marks vary by engine.
    return { text: stripMarks(text), parts: formatParts(kind, ctx, v).filter(([t]) => t !== 'literal').map(([, x]) => x) };
  },
};
