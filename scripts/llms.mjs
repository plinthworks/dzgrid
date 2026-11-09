/**
 * `llms.txt` and `llms-full.txt`, made from `docs/guide/` (Phase 11 L6, owner Q8 A) so they never drift from it.
 *
 *   node scripts/llms.mjs           writes llms.txt and llms-full.txt at the repository's root
 *   node scripts/llms.mjs --check   says which one is out of date, exit 1 (scripts/test/guide.test.ts does the same)
 *
 * The guide's index (`docs/guide/README.md`) is the source of the order: each list line `- [Title](page.md) — what`
 * under a `## ` heading becomes one link of `llms.txt` (the llmstxt.org shape: a title, a quote, sections of links)
 * and one page of `llms-full.txt`, in that order. Links are absolute (GitHub), so the copy that ships in
 * `@dzgrid/dom` (scripts/build.mjs) works from `node_modules` too. Text only: no clock, no randomness.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const BLOB = 'https://github.com/plinthworks/dzgrid/blob/main/';
const GUIDE = 'docs/guide/';

/** The index's sections: `[{ title, pages: [{ title, file, what }] }]`, in the order written. */
export function index(text) {
  const sections = [];
  for (const line of text.split('\n')) {
    const h = /^## (.+)$/.exec(line);
    if (h) sections.push({ title: h[1].trim(), pages: [] });
    const l = /^- \[([^\]]+)\]\(([\w./-]+\.md)\)\s+—\s+(.+)$/.exec(line);
    if (l && sections.length) sections.at(-1).pages.push({ title: l[1], file: l[2], what: l[3].trim() });
  }
  return sections.filter((s) => s.pages.length);
}

/** A page's relative links made absolute: `(columns.md)` → the GitHub URL of `docs/guide/columns.md`. */
export function absolute(markdown, from = GUIDE) {
  return markdown.replace(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g, (_, href) => {
    const [path, hash = ''] = href.split('#');
    const url = new URL(path, `https://x/${from}`).pathname.slice(1);
    return `](${BLOB}${url}${hash ? `#${hash}` : ''})`;
  });
}

const HEAD = [
  '# DzGrid',
  '',
  '> A data grid written from scratch in TypeScript: a pure core (`@dzgrid/core`), a DOM layer with every feature as its own entry (`@dzgrid/dom`), a CSS theme (`@dzgrid/theme`), an Angular wrapper (`@dzgrid/angular`) and a Web Component (`@dzgrid/element`). Right to left, time zones and screen readers are designed in. MIT, no runtime dependency.',
  '',
  'Only the names written in these pages exist; do not borrow option names from other grid libraries. Rows are identified by `getRowId`, never by position. Days (`YYYY-MM-DD`) and instants (epoch milliseconds, or ISO text with an offset) are different column types. Bad input never throws: it is reported as a `Problem` (`code`, `path`, `detail`). Every sample in the guide is type-checked against the published types.',
];

/** `{ 'llms.txt': text, 'llms-full.txt': text }` for the guide under `root`. */
export function build(root = ROOT) {
  const read = (f) => readFileSync(join(root, f), 'utf8');
  const sections = index(read(`${GUIDE}README.md`));
  const short = [...HEAD];
  for (const s of sections) {
    short.push('', `## ${s.title}`, '');
    for (const p of s.pages) short.push(`- [${p.title}](${BLOB}${GUIDE}${p.file}): ${p.what}`);
  }
  short.push(
    '',
    '## Optional',
    '',
    `- [The full guide in one file](${BLOB}llms-full.txt): every page above, concatenated`,
    `- [Behaviour sheets](${BLOB}docs/behaviors): one sheet per behaviour, the reference the tests follow`,
    `- [Public types](${BLOB}api): the accepted public type surface of each package, as text`,
    `- [Changelog](${BLOB}CHANGELOG.md): what changed, version by version`,
  );
  const full = [...HEAD, '', `This file is the guide (${BLOB}${GUIDE}) in one piece, made by scripts/llms.mjs; do not edit it by hand.`];
  for (const s of sections) {
    for (const p of s.pages) {
      full.push('', '---', '', `<!-- ${GUIDE}${p.file} -->`, '', absolute(read(`${GUIDE}${p.file}`)).trim());
    }
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
