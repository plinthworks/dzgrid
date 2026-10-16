import { formattersFor, localeCtx, type LocaleCtx } from '@dzgrid/core';

/**
 * Every sentence the grid shows or says, by key (§3.9, D9). The grid never
 * holds a sentence: a host passes one bundle (`@dzgrid/dom/locales/fr`…), so
 * a one-language app ships one dictionary. Placeholders are `{name}`; a
 * number placeholder is formatted in the grid's locale and numerals.
 */
export const MESSAGE_KEYS = [
  'grid.label',
  'grid.noRows',
  'grid.noMatches',
  'grid.loading',
  'grid.error',
  'sort.ascending',
  'sort.descending',
  'sort.none',
  'sort.priority',
  'announce.sorted',
  'announce.sortCleared',
  'announce.rows',
  'announce.selected',
  'announce.rangeCancelled',
  'announce.loading',
  'announce.error',
  'selection.row',
  'selection.all',
  'selection.column',
  'resize.handle',
  'pinned.start',
  'pinned.end',
  'header.sortHint',
] as const;

export type MessageKey = (typeof MESSAGE_KEYS)[number];

/** CLDR plural categories; `other` is always there, the rest as the language has them. */
export interface PluralForms {
  readonly zero?: string;
  readonly one?: string;
  readonly two?: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
}
export type MessageValue = string | PluralForms;

export interface GridMessages {
  /** The language the bundle is written in: plural forms follow it, numbers follow the context. */
  readonly locale: string;
  readonly text: { readonly [K in MessageKey]: MessageValue };
}

const plurals = new Map<string, Intl.PluralRules>();
const rulesFor = (locale: string): Intl.PluralRules => {
  let r = plurals.get(locale);
  if (!r) {
    r = new Intl.PluralRules(locale);
    plurals.set(locale, r);
  }
  return r;
};

/**
 * The sentence for `key`. The plural form follows the parameter `n`; a
 * placeholder without a value stays visible, so a missing one is seen in
 * testing rather than read as nothing.
 */
export function msg(m: GridMessages, key: MessageKey, params: Readonly<Record<string, string | number>> = {}, ctx?: LocaleCtx): string {
  const value = m.text[key];
  if (value === undefined) throw new RangeError(`no message ${String(key)}`);
  const c = ctx ?? localeCtx({ locale: m.locale });
  let text: string;
  if (typeof value === 'string') text = value;
  else {
    const n = params['n'];
    // The sentence is in the bundle's language: so is its grammar. Numbers follow the context.
    const cat = typeof n === 'number' ? (rulesFor(m.locale).select(n) as keyof PluralForms) : 'other';
    text = value[cat] ?? value.other;
  }
  const number = formattersFor(c).number();
  return text.replace(/\{(\w+)\}/g, (all, name: string) => {
    const v = params[name];
    return v === undefined ? all : typeof v === 'number' ? number(v) : v;
  });
}
