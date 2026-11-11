// @vitest-environment node
/**
 * One page per option (docs/website-plan.md, batch 3): the facts in `src/generated/options.json` are what
 * scripts/gen-options.mjs reads in the sources today; a page under `settings/` or `column-options/` is the option its
 * slug names (`row-height` → `rowHeight`) and shows that option's facts, in both languages, and every option has one;
 * every default the sources write as a `{token}` has its words in both languages.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error a plain .mjs script
import { generate, OUT } from '../../scripts/gen-options.mjs';
import { FACTS } from '../src/i18n/facts';

const DOCS = fileURLToPath(new URL('../src/content/docs', import.meta.url));
const data = generate() as { settings: { name: string; default: { token?: string } | null }[]; columns: { name: string; default: { token?: string } | null }[] };
const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const pagesIn = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => /\.mdx?$/.test(f) && !/^index\./.test(f)) : []);

describe('one page per option', () => {
  it('options.json is up to date (node scripts/gen-options.mjs)', () => {
    expect(readFileSync(OUT, 'utf8')).toBe(JSON.stringify(data, null, 2) + '\n');
  });

  it('a default written as a {token} has its words in both languages', () => {
    const tokens = [...data.settings, ...data.columns].flatMap((o) => (o.default?.token ? [o.default.token] : []));
    for (const lang of ['en', 'fr'] as const) expect(tokens.filter((t) => !FACTS[lang].tokens[t])).toEqual([]);
  });

  for (const [what, dir, list, attr] of [['settings', 'settings', data.settings, 'setting'], ['column options', 'column-options', data.columns, 'column']] as const) {
    it(`a ${what} page is the option its slug names, with its facts`, () => {
      const slugs = new Map(list.map((s) => [kebab(s.name), s.name]));
      const wrong: string[] = [];
      for (const d of [dir, `fr/${dir}`]) {
        for (const file of pagesIn(join(DOCS, d))) {
          const slug = file.replace(/\.mdx?$/, '');
          const name = slugs.get(slug);
          const text = readFileSync(join(DOCS, d, file), 'utf8');
          if (!name) wrong.push(`${d}/${file}: no option of that name`);
          else if (!text.includes(`title: "${name}"`) || !text.includes(`<OptionFacts ${attr}="${name}" />`)) wrong.push(`${d}/${file}: not titled ${name}, or no <OptionFacts ${attr}="${name}" />`);
        }
      }
      expect(wrong).toEqual([]);
    });

    it(`every ${what.replace(/s$/, '')} has its page, in both languages`, () => {
      const missing = list.flatMap((o) => [dir, `fr/${dir}`].filter((d) => !existsSync(join(DOCS, d, `${kebab(o.name)}.mdx`))).map((d) => `${d}/${kebab(o.name)}`));
      expect(missing).toEqual([]);
    });
  }
});
