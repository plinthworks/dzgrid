import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * No invisible or direction-changing character in the core's sources: a
 * direction mark or a no-break space inside a regular expression reads as
 * nothing, and a bidi control can make code display differently from what it
 * does. Code writes them as `\uXXXX`. Visible letters (Arabic words in a
 * list of yes/no words, comments) are fine.
 */
const SRC = fileURLToPath(new URL('../src', import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });

const INVISIBLE = /[\u00A0\u061C\u200B-\u200F\u202A-\u202F\u2060-\u2069\u2007\u2009\uFEFF]/;
/** Combining marks typed raw in code (outside comments) read as nothing on their own. */
const MARK = /\p{M}/u;
const isComment = (line: string): boolean => /^\s*(\*|\/\*\*|\/\/)/.test(line);

describe('core sources', () => {
  it('hold no invisible or bidi-control character', () => {
    const offenders = files(SRC).flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .flatMap((line, i) => (INVISIBLE.test(line) || (!isComment(line) && MARK.test(line)) ? [`${f.slice(SRC.length + 1)}:${i + 1}`] : [])),
    );
    expect(offenders).toEqual([]);
  });
});
