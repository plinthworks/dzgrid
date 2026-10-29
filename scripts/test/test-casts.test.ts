// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * No unexplained `as never` / `as any` in the tests (2026-10-29, owner after the 1.1.0 close: a
 * 1.0.0 public type change was hidden by an `as never` in a test). A cast that silences the type
 * checker must say why, in a comment on its line or on the line just before it.
 *
 * The casts written before the rule are counted per file in `test-casts-baseline.json`. A file may
 * hold at most its count of unexplained casts; when a file holds fewer, lower its count (the list only
 * shrinks — a count is never raised, a new file starts at zero).
 */
const root = fileURLToPath(new URL('../..', import.meta.url));
const baselinePath = fileURLToPath(new URL('./test-casts-baseline.json', import.meta.url));

const CAST = /\bas\s+(never|any)\b/g;
const hasComment = (line: string) => /\/\/|\/\*/.test(line) || /^\s*\*/.test(line);

/** Unexplained casts of one file's text: the 1-based line numbers, one per cast. */
function unexplained(text: string): number[] {
  const lines = text.split('\n');
  const out: number[] = [];
  lines.forEach((line, i) => {
    const n = line.match(CAST)?.length ?? 0;
    if (n === 0 || hasComment(line) || (i > 0 && hasComment(lines[i - 1]))) return;
    for (let k = 0; k < n; k++) out.push(i + 1);
  });
  return out;
}

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(ts|mts|js|mjs)$/.test(name)) yield path;
  }
}

/** `packages/<name>/test` for each package, and `conformance`. */
function scanned(): string[] {
  const dirs = [...readdirSync(join(root, 'packages')).map((p) => join(root, 'packages', p, 'test')), join(root, 'conformance')];
  return dirs.filter((d) => statSync(d, { throwIfNoEntry: false })?.isDirectory()).flatMap((d) => [...walk(d)]);
}

describe('tests: no unexplained `as never` / `as any`', () => {
  it('finds a cast without a reason, and takes a comment beside it or just above it', () => {
    expect(unexplained('const a = x as never;')).toEqual([1]);
    expect(unexplained('const a = x as any, b = y as any;')).toEqual([1, 1]);
    expect(unexplained('const a = x as never; // a 1.0.0 caller, on purpose')).toEqual([]);
    expect(unexplained('// the wire carries no type\nconst a = x as any;')).toEqual([]);
    expect(unexplained('// one comment\nconst ok = 1;\nconst a = x as never;')).toEqual([3]);
    expect(unexplained('const a = x as Never; const b = y as anything;')).toEqual([]);
  });

  it('holds no file above its counted casts', () => {
    const baseline: Record<string, number> = JSON.parse(readFileSync(baselinePath, 'utf8')).files;
    const over: string[] = [];
    const lower: string[] = [];
    const seen = new Set<string>();
    for (const file of scanned()) {
      const key = relative(root, file).split('\\').join('/');
      const lines = unexplained(readFileSync(file, 'utf8'));
      const allowed = baseline[key] ?? 0;
      if (lines.length > 0) seen.add(key);
      if (lines.length > allowed) over.push(`${key}: ${lines.length} unexplained (allowed ${allowed}), lines ${[...new Set(lines)].join(', ')}`);
      else if (lines.length < allowed) lower.push(`${key}: ${allowed} → ${lines.length}`);
    }
    const gone = Object.keys(baseline).filter((k) => !seen.has(k) && !lower.some((l) => l.startsWith(k + ':')));
    expect(over, 'a new `as never` / `as any` needs a comment saying why, on its line or the line before').toEqual([]);
    expect([...lower, ...gone.map((g) => `${g}: gone`)], 'fewer casts than counted: lower (or remove) these counts in test-casts-baseline.json').toEqual([]);
  });
});
