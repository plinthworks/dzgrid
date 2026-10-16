import { describe, it, expect, expectTypeOf } from 'vitest';
import { localeCtx } from '@dzgrid/core';
import { MESSAGE_KEYS, msg, type GridMessages, type MessageKey } from '../src/messages.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';

const placeholders = (v: GridMessages['text'][MessageKey]): string[] =>
  [...new Set((typeof v === 'string' ? [v] : Object.values(v)).flatMap((s) => [...(s ?? '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]!)))].sort();

describe('messages', () => {
  it('cover every key in every language, with the same placeholders', () => {
    for (const key of MESSAGE_KEYS) {
      const want = placeholders(EN.text[key]);
      expect(placeholders(FR.text[key]), `fr ${key}`).toEqual(want);
      expect(placeholders(AR.text[key]), `ar ${key}`).toEqual(want);
    }
    for (const m of [EN, FR, AR]) expect(Object.keys(m.text).sort()).toEqual([...MESSAGE_KEYS].sort());
  });

  it('give every plural message every category its language has', () => {
    for (const m of [EN, FR, AR]) {
      const cats = new Intl.PluralRules(m.locale).resolvedOptions().pluralCategories;
      for (const key of MESSAGE_KEYS) {
        const v = m.text[key];
        if (typeof v !== 'string') for (const c of cats) expect(v[c as keyof typeof v], `${m.locale} ${key} ${c}`).toBeTypeOf('string');
      }
    }
    expect(new Intl.PluralRules('ar').resolvedOptions().pluralCategories.length).toBe(6);
  });

  it('picks the Arabic plural by number, with the context numerals', () => {
    const latn = localeCtx({ locale: 'ar-DZ', numerals: 'latn' });
    expect(msg(AR, 'announce.rows', { n: 2 }, latn)).toBe(AR.text['announce.rows'] && (AR.text['announce.rows'] as { two: string }).two.replace('{n}', '2'));
    const many = msg(AR, 'announce.rows', { n: 1667 }, latn);
    expect(many).toBe((AR.text['announce.rows'] as { many: string }).many.replace('{n}', new Intl.NumberFormat('ar-DZ-u-nu-latn').format(1667)));
    const arab = msg(AR, 'announce.rows', { n: 3 }, localeCtx({ locale: 'ar-EG', numerals: 'locale' }));
    expect(arab).toMatch(/\u0663/);
  });

  it('formats French numbers the French way and picks the French plural', () => {
    const fr = localeCtx({ locale: 'fr-FR' });
    expect(msg(FR, 'announce.rows', { n: 1 }, fr)).toBe('1 ligne');
    expect(msg(FR, 'announce.rows', { n: 2 }, fr)).toBe('2 lignes');
    expect(msg(FR, 'announce.rows', { n: 12500 }, fr)).toBe(`${new Intl.NumberFormat('fr-FR').format(12500)} lignes`);
  });

  it('fills text placeholders and leaves an unknown placeholder visible', () => {
    const en = localeCtx({ locale: 'en-US' });
    expect(msg(EN, 'resize.handle', { column: 'Name' }, en)).toBe('Resize Name');
    expect(msg(EN, 'resize.handle', {}, en)).toBe('Resize {column}');
  });

  it('works without a context, in the bundle\u2019s own language and Latin digits', () => {
    expect(msg(EN, 'announce.rows', { n: 1 })).toBe('1 row');
  });

  it('refuses an unknown key at compile time', () => {
    // @ts-expect-error not a key
    expect(() => msg(EN, 'grid.nope')).toThrow();
    expectTypeOf<MessageKey>().toMatchTypeOf<string>();
  });

  it('hold no raw invisible character and no raw combining mark (written as escapes)', () => {
    for (const m of [EN, FR, AR]) for (const v of Object.values(m.text)) for (const s of typeof v === 'string' ? [v] : Object.values(v))
      expect(s).not.toMatch(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/);
  });
});
