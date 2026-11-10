// @vitest-environment node
/**
 * The site's pages (owner, 2026-11-10: English at the root, French under /fr/; built in batches): every page has
 * its twin in the other language; a page not written yet is a stub of one shape in both languages, saying so; a
 * written page says the same in both — its sections, tabs, demos, tables, the pages it links to — with the same
 * examples and the same demo data; every page the sidebar names exists; every relative link, anchor included,
 * lands on something.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = fileURLToPath(new URL('..', import.meta.url));
const DOCS = join(SITE, 'src/content/docs');
/** The pages written so far, batch by batch (docs/website-plan.md); every other page is still a stub. */
const WRITTEN = [
  'index', 'getting-started/typescript', 'getting-started/angular', 'getting-started/web-component',
  // Batch 2 (2026-11-10): the guides.
  'guides/columns', 'guides/sort-filter-search', 'guides/selection-ranges', 'guides/editing', 'guides/tree',
  'guides/grouping', 'guides/pivot', 'guides/server-data', 'guides/row-moves', 'guides/dock-panels',
  'guides/export-print', 'guides/state', 'guides/theming-rtl', 'guides/accessibility',
];
/** The sidebar's sections: a page lives in one of them (or is the home page). */
const SECTIONS = ['getting-started', 'guides', 'settings', 'column-options', 'features', 'api'];
/** A stub's one note: its title, and its sentence around the link to what stands in for the page meanwhile. */
const STUB = {
  en: { note: 'Being written', before: 'This page is being written. Until then, read ', after: '.' },
  fr: { note: 'En cours de rédaction', before: 'Cette page est en cours de rédaction. En attendant, lisez ', after: ' (en anglais).' },
} as const;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
type Lang = 'en' | 'fr';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.mdx?$/.test(f) ? [p] : [];
  });
}
/** Page slugs (`guides/columns`, `index`) → file, per language. */
const pages: Record<Lang, Map<string, string>> = { en: new Map(), fr: new Map() };
for (const file of walk(DOCS)) {
  const rel = relative(DOCS, file).replace(/\\/g, '/');
  const lang: Lang = rel.startsWith('fr/') ? 'fr' : 'en';
  pages[lang].set(rel.replace(/^fr\//, '').replace(/\.mdx?$/, ''), file);
}
const read = (lang: Lang, slug: string) => readFileSync(pages[lang].get(slug)!, 'utf8');
const front = (text: string) => /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
const body = (text: string) => text.replace(/^---\n[\s\S]*?\n---\n/, '');
const withoutCode = (text: string) => text.replace(/^```[\s\S]*?^```$/gm, '');

/** Starlight's heading ids (github-slugger): lower case, punctuation gone, spaces to hyphens. */
export const anchor = (heading: string) => heading.trim().toLowerCase().replace(/`/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
const headings = (text: string) => [...withoutCode(text).matchAll(/^##+ (.+)$/gm)].map((m) => m[1]!);

/** Every link of a page: Markdown links, `href="…"` and the hero's `link:` lines. */
export function links(text: string): string[] {
  const t = withoutCode(text);
  return [
    ...[...t.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]!),
    ...[...t.matchAll(/\bhref="([^"]+)"/g)].map((m) => m[1]!),
    ...[...front(text).matchAll(/^[\s-]*link: (\S+)$/gm)].map((m) => m[1]!),
  ];
}
const external = (href: string) => /^(https?:|mailto:)/.test(href);

/** The page's URL path under the language root: `guides/columns` → `/guides/columns/`, `index` → `/`. */
const urlOf = (slug: string) => (slug === 'index' ? '/' : `/${slug.replace(/\/index$/, '')}/`);
/** The page a relative link leads to, from a page: its slug, or null when it leaves the site. */
export function target(from: string, href: string): { slug: string; hash: string } | null {
  const [path = '', hash = ''] = href.split('#');
  const url = new URL(path || '.', `https://x${urlOf(from)}`);
  if (!url.pathname.endsWith('/')) return null;
  const slug = url.pathname.slice(1, -1) || 'index';
  return { slug, hash };
}
const slugExists = (lang: Lang, slug: string) => pages[lang].has(slug) || pages[lang].has(`${slug}/index`);
const fileOf = (lang: Lang, slug: string) => pages[lang].get(slug) ?? pages[lang].get(`${slug}/index`);

/**
 * Code with its texts and figures taken out: strings (quoted or between backticks), numbers and comments become one
 * mark each, so an English and a French example of the same code have the same skeleton. The words of a French
 * example's strings — titles, made-up data — may differ; its names, keys, calls and options may not.
 */
export const skeleton = (code: string) =>
  code
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|’/g, 'S')
    .replace(/\b\d[\d_.]*\b/g, 'N')
    // The language's bundles: `EN_FILTERS` on the English page is `FR_FILTERS` on the French one.
    .replace(/\b(?:EN|FR|AR)(_[A-Z_]+)?\b/g, 'L$1')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n\s*\n/g, '\n');

/** What must match between the two languages of a written page. */
function shape(text: string) {
  const b = body(text);
  return {
    sections: headings(b).length,
    tabs: (b.match(/<CodeTabs>/g) ?? []).length,
    flavours: [...b.matchAll(/<Fragment slot="(\w+)">/g)].map((m) => m[1]),
    demos: (b.match(/<LiveDemo\b/g) ?? []).length,
    asides: (b.match(/<Aside\b/g) ?? []).length,
    cards: (b.match(/<(Card|LinkCard)\b/g) ?? []).length,
    tables: (b.match(/^\|---/gm) ?? []).length,
    links: links(text).filter((l) => !external(l)).map((l) => l.split('#')[0]),
    external: links(text).filter(external),
    // The examples are the same code in both languages, and the demos the same settings: only their texts and
    // made-up data are the page's language (owner A, 2026-11-10: French titles and French data on French pages).
    // A `text` block is a picture in words: translated whole, compared by its place only.
    code: [...b.matchAll(/^```([^\n]*)\n([\s\S]*?)^```$/gm)].map((m) => (m[1]!.startsWith('text') ? m[1] : `${m[1]}\n${skeleton(m[2]!)}`)),
    demoData: [...b.matchAll(/<LiveDemo\b[\s\S]*?\/>/g)].map((m) => skeleton(m[0].replace(/\n\s*caption="[^"]*"/, ''))),
    data: [...b.matchAll(/^export const [\s\S]*?;$/gm)].map((m) => skeleton(m[0])),
  };
}

describe('the site’s pages', () => {
  it('finds links and their targets', () => {
    expect(links('---\nhero:\n  actions:\n    - link: a/b/\n---\n[x](../c/#d) <a href="e/">\n```ts\n[no](z)\n```\n')).toEqual(['../c/#d', 'e/', 'a/b/']);
    expect(target('getting-started/typescript', '../angular/#the-controller')).toEqual({ slug: 'getting-started/angular', hash: 'the-controller' });
    expect(target('getting-started/typescript', '../../guides/columns/')).toEqual({ slug: 'guides/columns', hash: '' });
    expect(target('index', 'getting-started/typescript/')).toEqual({ slug: 'getting-started/typescript', hash: '' });
    expect(target('index', '#what-it-is')).toEqual({ slug: 'index', hash: 'what-it-is' });
    expect(anchor('Inputs are compared by `identity`')).toBe('inputs-are-compared-by-identity');
    expect(anchor('Les entrées sont comparées par identité')).toBe('les-entrées-sont-comparées-par-identité');
    expect(anchor('Pensé dès le départ, pas ajouté')).toBe('pensé-dès-le-départ-pas-ajouté');
    expect(skeleton("const a = { t: 'Title', n: 12.5 }; // a note")).toBe(skeleton('const a = { t: "Titre du livre", n: 3 };'));
    expect(skeleton("{ id: 'title' }")).not.toBe(skeleton("{ key: 'title' }"));
    expect(skeleton("import { EN_TREE } from '@dzgrid/dom/locales/en-tree'; messages: EN")).toBe(skeleton("import { FR_TREE } from '@dzgrid/dom/locales/fr-tree'; messages: FR"));
  });

  it('every page has its twin in the other language, of the same kind', () => {
    const en = [...pages.en.keys()].sort();
    expect([...pages.fr.keys()].sort()).toEqual(en);
    for (const slug of en) expect(pages.fr.get(slug)!.slice(-4), slug).toBe(pages.en.get(slug)!.slice(-4));
    expect(en.length).toBeGreaterThanOrEqual(22);
  });

  it('every page sits in a section of the sidebar, and every page the sidebar names exists', () => {
    for (const slug of pages.en.keys()) if (slug !== 'index') expect(SECTIONS, slug).toContain(slug.split('/')[0]);
    const config = readFileSync(join(SITE, 'astro.config.mjs'), 'utf8');
    const guides = /const GUIDES = \[([\s\S]*?)\];/.exec(config)![1]!.match(/'([a-z-]+)'/g)!.map((s) => `guides/${s.slice(1, -1)}`);
    const started = /\[('typescript'[^\]]*)\]\.map\(\(page\) => \(\{ slug: `getting-started\//.exec(config)![1]!.match(/'([a-z-]+)'/g)!.map((s) => `getting-started/${s.slice(1, -1)}`);
    const dirs = [...config.matchAll(/autogenerate: \{ directory: '([a-z-]+)' \}/g)].map((m) => m[1]!);
    expect(dirs.sort()).toEqual(SECTIONS.filter((s) => s !== 'getting-started' && s !== 'guides').sort());
    for (const slug of [...guides, ...started]) for (const lang of ['en', 'fr'] as const) expect(pages[lang].has(slug), `${lang} ${slug}`).toBe(true);
    // And the other way: no guide or getting-started page left out of the sidebar.
    expect([...pages.en.keys()].filter((s) => /^(guides|getting-started)\//.test(s)).sort()).toEqual([...guides, ...started].sort());
  });

  it('a written page is not a stub; every other page is one, of one shape in both languages', () => {
    for (const slug of WRITTEN) expect(pages.en.has(slug), slug).toBe(true);
    const wrong: string[] = [];
    for (const slug of pages.en.keys()) {
      const stubs = (['en', 'fr'] as const).map((lang) => {
        const text = read(lang, slug);
        const keys = [...front(text).matchAll(/^(\w+):/gm)].map((m) => m[1]);
        const { note: title, before, after } = STUB[lang];
        const note = new RegExp(`^\\n:::note\\[${esc(title)}\\]\\n${esc(before)}\\[[^\\]]+\\]\\((https://github\\.com/plinthworks/dzgrid/[^)]+)\\)${esc(after)}\\n:::\\n$`).exec(body(text));
        return { keys, link: note?.[1], order: /order: (\d+)/.exec(front(text))?.[1] };
      });
      const stub = stubs.every((s) => s.link);
      if (WRITTEN.includes(slug)) {
        if (stubs.some((s) => s.link) || /:::note\[(Being written|En cours de rédaction)\]/.test(read('en', slug) + read('fr', slug))) wrong.push(`${slug}: written, but still a stub`);
        continue;
      }
      if (!stub) wrong.push(`${slug}: neither written nor a stub of the expected shape`);
      else if (JSON.stringify(stubs[0]) !== JSON.stringify(stubs[1])) wrong.push(`${slug}: the two stubs differ (${JSON.stringify(stubs)})`);
      else if (stubs[0]!.keys.join() !== (stubs[0]!.order ? 'title,description,sidebar' : 'title,description')) wrong.push(`${slug}: frontmatter ${stubs[0]!.keys.join()}`);
    }
    expect(wrong).toEqual([]);
  });

  it('a written page has the same shape in English and French, with the same examples and demo data', () => {
    for (const slug of WRITTEN) expect({ slug, ...shape(read('fr', slug)) }).toEqual({ slug, ...shape(read('en', slug)) });
  });

  it('a written page’s French is written in French', () => {
    // Not the English left in place: no English heading survives on a French page (code names aside).
    for (const slug of WRITTEN) {
      const en = new Set(headings(read('en', slug)).filter((h) => !/^`?[\w-]+`?$/.test(h) && !['TypeScript', 'Angular', 'Guides'].includes(h)));
      expect(headings(read('fr', slug)).filter((h) => en.has(h)), slug).toEqual([]);
    }
  });

  it('every relative link lands on a page of the same language, and on its heading when it names one', () => {
    const broken: string[] = [];
    for (const lang of ['en', 'fr'] as const) {
      for (const slug of pages[lang].keys()) {
        for (const href of links(read(lang, slug))) {
          if (external(href)) continue;
          if (href.startsWith('/')) {
            broken.push(`${lang} ${slug} → ${href} (absolute: the site lives under /dzgrid/)`);
            continue;
          }
          const to = target(slug, href);
          const file = to && fileOf(lang, to.slug);
          if (!to || !file) broken.push(`${lang} ${slug} → ${href}`);
          else if (to.hash && !headings(readFileSync(file, 'utf8')).map(anchor).includes(to.hash)) broken.push(`${lang} ${slug} → ${href} (no such heading)`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('every link out to the repository names a file or folder that exists', () => {
    const ROOT = join(SITE, '..');
    const missing = new Set<string>();
    for (const lang of ['en', 'fr'] as const) {
      for (const slug of pages[lang].keys()) {
        for (const href of links(read(lang, slug))) {
          const m = /^https:\/\/github\.com\/plinthworks\/dzgrid\/(?:blob|tree)\/main\/([^#)]+)/.exec(href);
          if (m && !existsSync(join(ROOT, m[1]!))) missing.add(`${slug} → ${m[1]}`);
        }
      }
    }
    expect([...missing]).toEqual([]);
  });
});
