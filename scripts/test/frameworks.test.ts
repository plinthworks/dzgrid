// @vitest-environment node
// The real framework builds of the browser suite (showcase themes step 5; scripts/frameworks.mjs), test
// analysis M22: every setup file of packages/theme/test/frameworks/ is built, from its own file; the pitfalls
// are setups too (built and checked), only not quoted as advice.
import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// @ts-expect-error a plain .mjs script
import { SETUPS, PITFALLS, inputOf } from '../frameworks.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIR = `${ROOT}packages/theme/test/frameworks`;

describe('scripts/frameworks.mjs', () => {
  it('SETUPS names exactly the .css files of frameworks/, each once', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.css')).map((f) => f.slice(0, -4)).sort();
    expect([...SETUPS].sort()).toEqual(files);
    expect(new Set(SETUPS).size).toBe(SETUPS.length);
  });

  it('the pitfalls are among them, and the rest are the setups the docs offer', () => {
    expect(PITFALLS).toEqual(['tailwind4-noorder', 'tailwind4-bare']);
    for (const p of PITFALLS) expect(SETUPS).toContain(p);
  });

  it('each is read from its own file', () => {
    for (const name of SETUPS) {
      expect(inputOf(ROOT, name)).toBe(`${DIR}/${name}.css`);
      expect(existsSync(inputOf(ROOT, name))).toBe(true);
    }
  });
});
