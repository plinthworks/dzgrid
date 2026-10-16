import { collatorFor } from '../../i18n/collate.js';
import { fold } from '../../i18n/fold.js';
import { isBlank, REJECTED, type ValueCodec } from '../codec.js';

export interface EnumOption {
  readonly value: string;
  /** Already translated by the host. */
  readonly label?: string;
  readonly aliases?: readonly string[];
}

/**
 * A closed list of values. Typed text matches a value, a label or an alias,
 * folded (case, accents, Arabic marks). Sorting is by label unless asked to
 * follow the options' order — a status list usually has a meaning order.
 */
export function enumCodec(options: readonly EnumOption[], o: { sort?: 'label' | 'option-order' } = {}): ValueCodec<string> {
  const byFold = new Map<string, string>();
  const labelOf = new Map<string, string>();
  const rank = new Map<string, number>();
  options.forEach((opt, i) => {
    labelOf.set(opt.value, opt.label ?? opt.value);
    rank.set(opt.value, i);
  });
  // Values first, then labels, then aliases: typing a value always finds it,
  // whatever another option's label or alias folds to.
  const claim = (t: string | undefined, value: string) => {
    if (t !== undefined && !byFold.has(fold(t))) byFold.set(fold(t), value);
  };
  for (const o2 of options) claim(o2.value, o2.value);
  for (const o2 of options) claim(o2.label, o2.value);
  for (const o2 of options) for (const a of o2.aliases ?? []) claim(a, o2.value);
  const label = (v: string): string => labelOf.get(v) ?? v;
  const byOrder = o.sort === 'option-order';

  return {
    kind: 'enum',
    keyKind: byOrder ? 'number' : 'text',
    coerce: (raw) => (typeof raw === 'string' && raw !== '' ? raw : null),
    parse: (text) => byFold.get(fold(text.trim())) ?? REJECTED,
    format: (v) => label(v),
    // A value outside the options sorts after them, in option order.
    sortKey: (v) => (byOrder ? (rank.get(v) ?? options.length) : label(v)),
    compare: (a, b, ctx) => (byOrder ? (rank.get(a) ?? options.length) - (rank.get(b) ?? options.length) : collatorFor(ctx).compare(label(a), label(b))),
    isEmpty: isBlank,
    equals: (a, b) => a === b,
    toExport: (v) => v,
  };
}
