// @vitest-environment node
// Every behaviour sheet is cited by at least one test (docs/behaviors/README.md « Tests — the specs and conformance
// cases that point back here »; the 2026-11 inventory found seven that none did). A parked sheet (« > **Parked » at its
// top: nothing of it is built) is the one exception. Expectations written by hand.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const SKIP = new Set(['node_modules', 'dist', 'browser', '.astro']);

function testFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) testFiles(path, out);
    else if (/\.(test|spec)\.ts$/.test(name) || (dir.includes(join('conformance', 'runner')) && name.endsWith('.ts'))) out.push(path);
  }
  return out;
}

describe('behaviour sheets', () => {
  it('every sheet but a parked one is cited by a test', () => {
    const sheets = readdirSync(join(root, 'docs/behaviors')).filter((f) => f.endsWith('.md') && f !== 'README.md');
    const dirs = ['packages', 'conformance', 'perf', 'scripts/test', 'website/test'].map((d) => join(root, d));
    const text = dirs.flatMap((d) => testFiles(d)).map((f) => readFileSync(f, 'utf8')).join('\n');
    const uncited = sheets.filter((s) => {
      if (/^> \*\*Parked/m.test(readFileSync(join(root, 'docs/behaviors', s), 'utf8'))) return false;
      return !new RegExp(`(behaviors/|[\\s(,;])${s.replace(/[.-]/g, '\\$&')}`).test(text);
    });
    expect(uncited).toEqual([]);
  });

  it('the parked sheet is the multi-sheet plan only', () => {
    const parked = readdirSync(join(root, 'docs/behaviors')).filter((s) => s.endsWith('.md') && /^> \*\*Parked/m.test(readFileSync(join(root, 'docs/behaviors', s), 'utf8')));
    expect(parked).toEqual(['sheets.md']);
  });
});
