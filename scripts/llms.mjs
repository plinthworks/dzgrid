/**
 * `llms.txt` and `llms-full.txt`, made from the documentation site's English pages (owner, 2026-11-10: the site is
 * the reference; before it, from docs/guide/) so they never drift from it.
 *
 *   node scripts/llms.mjs           writes llms.txt and llms-full.txt at the repository's root
 *   node scripts/llms.mjs --check   says which one is out of date, exit 1 (website/test/llms.test.ts does the same)
 *
 * The order is the site's sidebar (website/astro.config.mjs): the getting-started pages, then the guides. Each page
 * becomes one link of `llms.txt` (the llmstxt.org shape: a title, a quote, sections of links) and one page of
 * `llms-full.txt`, its MDX made plain Markdown: the code tabs flattened to their TypeScript block, the live demos and
 * the imports dropped, links made absolute (https://plinthworks.github.io/dzgrid/…), so the copy that ships in
 * `@dzgrid/dom` (scripts/build.mjs) works from `node_modules` too. Text only: no clock, no randomness.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const SITE = 'https://plinthworks.github.io/dzgrid/';
export const BLOB = 'https://github.com/plinthworks/dzgrid/blob/main/';
const DOCS = 'website/src/content/docs/';

/** The sidebar's sections of written pages, read from the site's config: `[{ title, slugs }]`. */
export function sections(config) {
  const started = /\[('typescript'[^\]]*)\]\.map\(\(page\) => \(\{ slug: `getting-started\//.exec(config);
  const guides = /const GUIDES = \[([\s\S]*?)\];/.exec(config);
  const names = (m) => (m ? m[1].match(/'([a-z-]+)'/g).map((s) => s.slice(1, -1)) : []);
  return [
    { title: 'Getting started', slugs: names(started).map((s) => `getting-started/${s}`) },
    { title: 'Guides', slugs: names(guides).map((s) => `guides/${s}`) },
  ];
}

/** A page's frontmatter `title` and `description`, and its body. */
export function split(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  const front = m ? m[1] : '';
  const field = (k) => {
    const f = new RegExp(`^${k}: (.*)$`, 'm').exec(front);
    return f ? f[1].trim().replace(/^"(.*)"$/, '$1') : '';
  };
  return { title: field('title'), description: field('description'), body: m ? text.slice(m[0].length) : text };
}

/** A relative link of the page `slug` made absolute on the site. */
export function absolute(markdown, slug) {
  return markdown.replace(/\]\((?!https?:|mailto:)([^)\s]+)\)/g, (_, href) => {
    const [path, hash = ''] = href.split('#');
    const url = path ? new URL(path, `${SITE}${slug}/`).href : `${SITE}${slug}/`;
    return `](${url}${hash ? `#${hash}` : ''})`;
  });
}

/** MDX → Markdown: imports, `export const` data and demos (grids, tooltips) dropped, the tabs flattened to their TypeScript block. */
export function plain(body, slug) {
  let t = body;
  t = t.replace(/^import .*\n/gm, '');
  t = t.replace(/^export const [\s\S]*?;\n/gm, '');
  t = t.replace(/<(?:LiveDemo|TipDemo)\b[\s\S]*?\/>\n?/g, '');
  t = t.replace(/<CodeTabs>([\s\S]*?)<\/CodeTabs>\n?/g, (_, inner) => {
    const ts = /<Fragment slot="ts">([\s\S]*?)<\/Fragment>/.exec(inner);
    return ts ? `${ts[1].trim()}\n` : '';
  });
  t = t.replace(/<Aside[^>]*>\n?([\s\S]*?)<\/Aside>/g, (_, inner) => `> ${inner.trim().replace(/\n/g, '\n> ')}`);
  t = t.replace(/\n{3,}/g, '\n\n');
  return absolute(t.trim(), slug);
}

const HEAD = [
  '# DzGrid',
  '',
  '> A data grid written from scratch in TypeScript: a pure core (`@dzgrid/core`), a DOM layer with every feature as its own entry (`@dzgrid/dom`), a CSS theme (`@dzgrid/theme`), an Angular wrapper (`@dzgrid/angular`) and a Web Component (`@dzgrid/element`). Right to left, time zones and screen readers are designed in. MIT, no runtime dependency.',
  '',
  `Only the names written in these pages exist; do not borrow option names from other grid libraries. Rows are identified by \`getRowId\`, never by position. Days (\`YYYY-MM-DD\`) and instants (epoch milliseconds, or ISO text with an offset) are different column types. Bad input never throws: it is reported as a \`Problem\` (\`code\`, \`path\`, \`detail\`). Every sample on the documentation site (${SITE}) is type-checked against the published types.`,
];

/** `{ 'llms.txt': text, 'llms-full.txt': text }` for the site under `root`. */
export function build(root = ROOT) {
  const read = (f) => readFileSync(join(root, f), 'utf8');
  const parts = sections(read('website/astro.config.mjs')).map((s) => ({
    title: s.title,
    pages: s.slugs.map((slug) => ({ slug, ...split(read(`${DOCS}${slug}.mdx`)) })),
  }));
  const short = [...HEAD];
  for (const s of parts) {
    short.push('', `## ${s.title}`, '');
    for (const p of s.pages) short.push(`- [${p.title}](${SITE}${p.slug}/): ${p.description}`);
  }
  short.push(
    '',
    '## Optional',
    '',
    `- [The whole documentation in one file](${BLOB}llms-full.txt): every page above, concatenated`,
    `- [Behaviour sheets](${BLOB}docs/behaviors): one sheet per behaviour, the reference the tests follow`,
    `- [Public types](${BLOB}api): the accepted public type surface of each package, as text`,
    `- [Changelog](${BLOB}CHANGELOG.md): what changed, version by version`,
  );
  const full = [...HEAD, '', `This file is the documentation site's English pages (${SITE}) in one piece, made by scripts/llms.mjs; do not edit it by hand.`];
  for (const s of parts) {
    for (const p of s.pages) full.push('', '---', '', `<!-- ${SITE}${p.slug}/ -->`, '', `# ${p.title}`, '', plain(p.body, p.slug));
  }
  return { 'llms.txt': short.join('\n') + '\n', 'llms-full.txt': full.join('\n') + '\n' };
}

function main() {
  const out = build();
  const check = process.argv.includes('--check');
  let stale = false;
  for (const [file, text] of Object.entries(out)) {
    const path = join(ROOT, file);
    let now = null;
    try { now = readFileSync(path, 'utf8'); } catch { /* missing */ }
    if (now === text) continue;
    if (check) { console.error(`${file} is out of date: node scripts/llms.mjs`); stale = true; }
    else { writeFileSync(path, text); console.log(`${file}: ${Buffer.byteLength(text)} B`); }
  }
  if (stale) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
