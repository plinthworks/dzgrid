// @vitest-environment node
/**
 * The API reference (docs/website-plan.md, batch 4): one page per package, in both languages, made by
 * scripts/gen-api.mjs from the accepted type surface (api/*.api.txt) — up to date, and every public name in it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error a plain .mjs script
import { page, pageFile } from '../../scripts/gen-api.mjs';
// @ts-expect-error a plain .mjs script
import { baselineFile, PACKAGES, parse } from '../../scripts/api.mjs';

describe('the API reference', () => {
  for (const name of PACKAGES as string[])
    it(`@dzgrid/${name}: its pages are what scripts/gen-api.mjs makes (node scripts/gen-api.mjs), with every public name`, () => {
      for (const lang of ['en', 'fr']) expect(readFileSync(pageFile(name, lang), 'utf8')).toBe(page(name, lang));
      const text: string = page(name, 'en');
      const { surface } = parse(readFileSync(baselineFile(name), 'utf8')) as { surface: Record<string, Record<string, string>> };
      const missing = Object.entries(surface).flatMap(([entry, names]) => [!text.includes(`\`${entry}\``) ? entry : null, ...Object.values(names).filter((d) => !text.includes(d))]).filter(Boolean);
      expect(missing).toEqual([]);
    });
});
