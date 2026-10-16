import { intlTag, type LocaleCtx } from '../value/locale.js';

const collators = new Map<string, Intl.Collator>();

/**
 * The collator text columns sort with: base sensitivity (case and accents
 * equal, Arabic hamza forms and short vowels too, S5), numeric (`2` before
 * `10`). Built once per language; never `localeCompare`, which S5 measured
 * ten to twenty-five times slower.
 */
export function collatorFor(ctx: Pick<LocaleCtx, 'locale'>): Intl.Collator {
  const tag = intlTag({ locale: ctx.locale, numerals: 'latn' });
  let c = collators.get(tag);
  if (!c) {
    c = new Intl.Collator(tag, { sensitivity: 'base', numeric: true });
    if (collators.size >= 16) collators.clear();
    collators.set(tag, c);
  }
  return c;
}
