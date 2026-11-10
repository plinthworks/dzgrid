// @vitest-environment node
/**
 * The site is the reference (owner, 2026-11-10): `llms.txt` and `llms-full.txt` are what scripts/llms.mjs makes of
 * its English pages today, and the checks the old guide (docs/guide/, scripts/test/guide.test.ts) had on its text
 * that the other site tests do not make: the `dzg-*` events named exist, and a page offering `filters-base` says a
 * day column gets no filter there. (Compiling, imported names, links: examples.test.ts and pages.test.ts.)
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error a plain .mjs script
import { build, plain, absolute, sections } from '../../scripts/llms.mjs';
// @ts-expect-error a plain .mjs script
import { parse } from '../../scripts/api.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DOCS = join(ROOT, 'website/src/content/docs');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.mdx?$/.test(f) ? [p] : [];
  });
const files = walk(DOCS).map((p) => ({ page: relative(DOCS, p), text: readFileSync(p, 'utf8') }));
const prose = (t: string) => t.replace(/^```[\s\S]*?^```$/gm, '');

describe('llms.txt and the site’s text', () => {
  it('turns a page into plain Markdown with absolute links', () => {
    const mdx = [
      "import X from '../../../components/CodeTabs.astro';",
      '',
      'See [trees](../tree/#lazy) and [out](https://e.org).',
      '',
      '<CodeTabs>',
      '<Fragment slot="ts">',
      '',
      '```ts',
      'const a = 1;',
      '```',
      '',
      '</Fragment>',
      '<Fragment slot="angular">',
      '',
      '```ts',
      'const b = 2;',
      '```',
      '',
      '</Fragment>',
      '</CodeTabs>',
      '',
      '<LiveDemo',
      '  rows={[]}',
      '/>',
      '',
      'End.',
    ].join('\n');
    expect(plain(mdx, 'guides/columns')).toBe(
      'See [trees](https://plinthworks.github.io/dzgrid/guides/tree/#lazy) and [out](https://e.org).\n\n```ts\nconst a = 1;\n```\n\nEnd.',
    );
    expect(absolute('[a](../../settings/)', 'guides/state')).toBe('[a](https://plinthworks.github.io/dzgrid/settings/)');
  });

  it('are what scripts/llms.mjs makes of the site’s English pages (node scripts/llms.mjs)', () => {
    const out = build(ROOT) as Record<string, string>;
    for (const [file, made] of Object.entries(out)) expect(readFileSync(join(ROOT, file), 'utf8'), file).toBe(made);
    // The short index stays short; the full one holds every page of the sidebar, in its order, without MDX.
    expect(Buffer.byteLength(out['llms.txt']!)).toBeLessThan(8_000);
    const slugs = (sections(readFileSync(join(ROOT, 'website/astro.config.mjs'), 'utf8')) as { slugs: string[] }[]).flatMap((s) => s.slugs);
    expect(slugs.length).toBeGreaterThanOrEqual(17);
    const at = slugs.map((s) => out['llms-full.txt']!.indexOf(`<!-- https://plinthworks.github.io/dzgrid/${s}/ -->`));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(out['llms-full.txt']).not.toMatch(/<(LiveDemo|CodeTabs|Fragment)\b|^import /m);
  });

  it('every `dzg-*` event the text names is a grid event (or the element’s own `dzg-ready`)', () => {
    const surface: Record<string, Record<string, string>> = {};
    for (const f of readdirSync(join(ROOT, 'api'))) Object.assign(surface, parse(readFileSync(join(ROOT, 'api', f), 'utf8')).surface);
    const declared = Object.values(surface).flatMap((e) => Object.values(e)).join('\n');
    const events = new Set([...declared.matchAll(/readonly type: '(\w+)'/g)].map((m) => m[1]!));
    const missing = new Set<string>();
    for (const f of files) {
      for (const m of f.text.matchAll(/['`]dzg-([a-z]+(?:-[a-z]+)*)['`]/g)) {
        const camel = m[1]!.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
        if (/^(live-demo|demo-[a-z-]+|ng-[a-z-]+)$/.test(m[1]!)) continue; // the site's own element and classes
        if (camel !== 'ready' && !events.has(camel)) missing.add(`${f.page}: dzg-${m[1]}`);
      }
    }
    expect([...missing]).toEqual([]);
  });

  // 1.10.1: `filters-base` gives a day or instant column no filter; a page that offers it says so.
  it('every page that offers `@dzgrid/dom/filters-base` in its text says a day column gets no filter there', () => {
    const offering = files.filter((f) => prose(f.text).includes('`@dzgrid/dom/filters-base`'));
    expect(offering.length).toBeGreaterThan(0);
    const said = (t: string) => /(day[^.]*\*\*no filter\*\*|jours[^.]*\*\*aucun filtre\*\*)/.test(prose(t).replace(/\s+/g, ' '));
    expect(offering.filter((f) => !said(f.text)).map((f) => f.page)).toEqual([]);
  });
});
