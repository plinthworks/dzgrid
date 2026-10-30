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
/** A banned word, written as char codes so this file names none of them. */
const w = (...c: number[]): string => String.fromCharCode(...c);
const ORG = [w(82, 84, 69), w(69, 78, 84, 83, 79, 45, 63, 69), w(109, 63, 70, 82, 82), w(65, 74, 85, 95, 77, 63, 70, 82, 82), w(65, 74, 85, 95, 82, 82)];
const SCREEN = w(66, 97, 108, 97, 110, 99, 105, 110, 103);
const PHRASE = w(65, 106, 117, 115, 116, 101, 109, 101, 110, 116, 32, 82, 82);
const BANNED = new RegExp(`\\b(${[...ORG, SCREEN].join('|')})\\b|${PHRASE}`, 'i');
/** The organisations and the screen's own terms only: what the owner's local pages (`playground/`, `vite.config.ts`'s page list) are held to. */
const ORGS = new RegExp(`\\b(${ORG.join('|')})\\b|${PHRASE}`, 'i');
const local = (rel: string): boolean => rel.startsWith('playground/') || rel === 'vite.config.ts';
const self = fileURLToPath(import.meta.url);

/** The 1-based lines of a text holding a banned word. */
export const hits = (text: string, words: RegExp = BANNED): number[] =>
  text.split('\n').flatMap((l, i) => (words.test(l) ? [i + 1] : []));

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
    expect(hits(`a\nExport-${w(82, 84, 69)}\nb`)).toEqual([2]);
    expect(hits(`Import-${w(69, 78, 84, 83, 79, 69)}`)).toEqual([1]);
    expect(hits(w(101, 110, 116, 115, 111, 45, 101))).toEqual([1]);
    expect(hits('certes, la porte, sortes, un terrain, ERREUR')).toEqual([]);
    expect(hits(`le « ${SCREEN} »\n${SCREEN.toUpperCase()}_GRID\n${SCREEN.toLowerCase()}.html`)).toEqual([1, 3]);
    expect(hits(`${w(65, 106, 117, 115, 116, 101, 109, 101, 110, 116)} ${w(109, 70, 82, 82)}\n${PHRASE}\n${w(65, 74, 85, 95, 82, 82)}`)).toEqual([1, 2, 3]);
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
