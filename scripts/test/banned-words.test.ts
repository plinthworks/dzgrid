// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Words banned from the repository (owner, 2026-10-29): names of real organisations of the owner's
 * domain never appear, not even in demo data. Demo data stays visibly made up.
 */
const root = fileURLToPath(new URL('../..', import.meta.url));
const SKIP = new Set(['node_modules', 'dist', '.git', 'coverage', 'test-results']);
const TEXT = /\.(ts|mts|mjs|js|html|scss|css|md|json|yml|yaml|txt)$/;
const BANNED = /\b(ORG|ORG|arbre)\b/i;
/** The organisations only: what the owner's local pages (`playground/`, `vite.config.ts`'s page list, never touched here) are held to. */
const ORGS = /\b(ORG|ORG)\b/i;
/**
 * The one exception (owner, step 16): the owner's local page keeps its file name, `arbre.html`, written as that
 * path; the word itself never appears anywhere else.
 */
const ALLOWED = /arbre\.html/gi;
const local = (rel: string): boolean => rel.startsWith('playground/') || rel === 'vite.config.ts';
const self = fileURLToPath(import.meta.url);

/** The 1-based lines of a text holding a banned word. */
export const hits = (text: string, words: RegExp = BANNED): number[] =>
  text.split('\n').flatMap((l, i) => (words.test(l.replace(ALLOWED, '')) ? [i + 1] : []));

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (TEXT.test(name) && p !== self) yield p;
  }
}

describe('banned words', () => {
  it('finds them, whatever the case, as whole words only', () => {
    expect(hits('a\nExport-Prévisions\nb')).toEqual([2]);
    expect(hits('Import-Mesures')).toEqual([1]);
    expect(hits('ORG')).toEqual([1]);
    expect(hits('ORG')).toEqual([1]);
    expect(hits('certes, la porte, RTEX, sortes')).toEqual([]);
    expect(hits('the « arbre » screen\narbre_GRID\narbre')).toEqual([1, 3]);
    // arbre_GRID: `_` is a word character, no whole word: not a hit (whole words only, as for the others).
  });

  it('allows one exception: the local page\'s path `arbre.html`, and nothing else on its line', () => {
    expect(hits("await page.goto(`${base}/arbre.html?${qs}`);")).toEqual([]);
    expect(hits("new URL('../playground/arbre.html', import.meta.url)")).toEqual([]);
    expect(hits('arbre.html, the arbre page')).toEqual([1]);
    expect(hits('arbre.htm')).toEqual([1]);
    expect(hits('arbre.HTML')).toEqual([]);
  });

  it('no file of the repository holds one', () => {
    const found: string[] = [];
    for (const f of files(root)) {
      const rel = relative(root, f).replace(/\\/g, '/');
      for (const n of hits(readFileSync(f, 'utf8'), local(rel) ? ORGS : BANNED)) found.push(`${rel}:${n}`);
    }
    expect(found).toEqual([]);
  });
});
