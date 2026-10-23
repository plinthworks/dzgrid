// @vitest-environment node
// The playground's showcase theme switch (themes-plan step 6; test analysis M23): `?skin=<name>` loads that
// theme's own file, and the menu offers exactly those names.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const main = readFileSync(`${ROOT}playground/main.ts`, 'utf8');
const html = readFileSync(`${ROOT}playground/index.html`, 'utf8');

describe('playground ?skin=', () => {
  it('maps each name to the identifier imported from its own file', () => {
    const imported = Object.fromEntries([...main.matchAll(/import (\w+) from '\.\.\/packages\/theme\/([a-z]+)\.css\?inline';/g)].map((m) => [m[1], m[2]]));
    const map = /\{ ([^}]*) \}\[val\('skin'\)\]/.exec(main);
    expect(map).not.toBeNull();
    const pairs = map![1]!.split(',').map((p) => p.split(':').map((x) => x.trim()) as [string, string]);
    expect(pairs.map(([k]) => k).sort()).toEqual(['clinic', 'midnight']);
    for (const [name, id] of pairs) expect(imported[id], name).toBe(name);
  });

  it('the menu offers the same names, and none by default', () => {
    const select = /<select name="skin">(.*?)<\/select>/.exec(html)![1]!;
    expect([...select.matchAll(/<option(?: value="([^"]*)")?>([^<]*)<\/option>/g)].map((m) => m[1] ?? m[2])).toEqual(['', 'midnight', 'clinic']);
  });
});
