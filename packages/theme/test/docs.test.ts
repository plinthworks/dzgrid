// @vitest-environment node
// Showcase themes step 6 (themes-plan §4–5): « un thème en 3 lignes » cannot rot. The page quotes each setup
// the browser suite builds with the real tools (frameworks/*.css) and each class example it runs
// (frameworks/examples.json); Tailwind's scanner sees every example class (classes.html); the theme's README
// gives the short version and points to the page.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const doc = readFileSync(here('../../../docs/theme-in-3-lines.md'), 'utf8');
const readme = readFileSync(here('../README.md'), 'utf8');
const dir = here('./frameworks');
const setup = (f: string) => readFileSync(`${dir}/${f}`, 'utf8').trim();
type Example = { negative: string; row: string; css?: string; pills: Record<string, string>; header: string };
const examples = JSON.parse(readFileSync(`${dir}/examples.json`, 'utf8')) as Record<string, Example>;
// @ts-expect-error a plain .mjs script
import { PITFALLS as PITFALL_NAMES } from '../../../scripts/frameworks.mjs';

/** The documented pitfalls, built and checked but not offered as a setup (scripts/frameworks.mjs names them). */
const PITFALLS = (PITFALL_NAMES as string[]).map((n) => `${n}.css`);
/** The heading each setup is quoted under (M21). */
const HEADING = (f: string) => (f.startsWith('tailwind4') ? '## Tailwind CSS 4' : f.startsWith('tailwind3') ? '## Tailwind CSS 3' : '## Bootstrap 5.3');
const section = (h: string) => {
  const at = doc.indexOf(`\n${h}\n`);
  if (at < 0) return '';
  const next = doc.indexOf('\n## ', at + 1);
  return doc.slice(at, next < 0 ? undefined : next);
};

describe('docs/theme-in-3-lines.md', () => {
  it('has its owner’s title', () => {
    expect(doc.split('\n')[0]).toBe('# Un thème en 3 lignes');
  });

  for (const f of readdirSync(dir).filter((x) => x.endsWith('.css') && !PITFALLS.includes(x))) {
    it(`quotes ${f} exactly, as the browser suite builds it, under its own heading (M21)`, () => {
      expect(doc).toContain(setup(f));
      expect(section(HEADING(f)), HEADING(f)).toContain(setup(f));
    });
  }

  it('names the pitfalls the browser suite pins (no order line; the bridge outside Tailwind’s build)', () => {
    expect(doc).toMatch(/without the order line/i);
    expect(doc).toMatch(/through Tailwind/);
  });

  for (const [fw, e] of Object.entries(examples).filter(([k]) => !k.startsWith('$'))) {
    it(`quotes ${fw}'s class examples as the browser suite runs them`, () => {
      const own = section(HEADING(fw));
      for (const c of [e.negative, e.row, e.header, ...Object.values(e.pills), ...(e.css ? [e.css] : [])]) expect(own, c).toContain(c);
    });
  }

  it('Tailwind’s scanner sees every Tailwind example class (classes.html)', () => {
    const html = readFileSync(`${dir}/classes.html`, 'utf8');
    for (const fw of ['tailwind4', 'tailwind3']) {
      const e = examples[fw]!;
      for (const c of [e.negative, e.row, e.header, ...Object.values(e.pills)].flatMap((x) => x.split(' '))) expect(html, c).toContain(`class="${c}"`);
    }
  });
});

describe('the theme README', () => {
  it('gives the Tailwind 4 setup and points to the page for the others', () => {
    expect(readme).toContain(setup('tailwind4.css'));
    expect(readme).toMatch(/theme-in-3-lines\.md/);
    for (const f of ['tailwind3.css', 'bootstrap.css']) expect(readme).toContain(`@dzgrid/theme/${f}`);
  });
});
