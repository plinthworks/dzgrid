import { intlTag, type LocaleCtx } from '../value/locale.js';

/** How text compares. Default: base (case, accents, Arabic hamza forms and short vowels equal), numeric. */
export interface CollatorSpec {
  readonly sensitivity?: 'base' | 'accent' | 'variant';
  readonly numeric?: boolean;
}

const collators = new Map<string, Intl.Collator>();

export const collatorKey = (ctx: Pick<LocaleCtx, 'locale'>, spec: CollatorSpec = {}): string =>
  `${intlTag({ locale: ctx.locale, numerals: 'latn' })}|${spec.sensitivity ?? 'base'}|${spec.numeric ?? true}`;

/**
 * The collator text columns sort with, built once per language and spec.
 * Never `localeCompare`, which S5 measured ten to twenty-five times slower.
 */
export function collatorFor(ctx: Pick<LocaleCtx, 'locale'>, spec: CollatorSpec = {}): Intl.Collator {
  const key = collatorKey(ctx, spec);
  let c = collators.get(key);
  if (!c) {
    c = new Intl.Collator(intlTag({ locale: ctx.locale, numerals: 'latn' }), {
      sensitivity: spec.sensitivity ?? 'base',
      numeric: spec.numeric ?? true,
    });
    if (collators.size >= 16) collators.clear();
    collators.set(key, c);
  }
  return c;
}
