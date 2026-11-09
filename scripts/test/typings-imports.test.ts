// Every `@dzgrid/<pkg>/<sub>` a built declaration file imports must be an entry that package exports. Found by the
// owner on 1.7.0 (2026-11-09): `@dzgrid/angular`'s typings imported `@dzgrid/core/kernel` (a type not re-exported by
// `@dzgrid/core`), which an app cannot resolve — « Cannot find module '@dzgrid/core/kernel' ».
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const exportsOf = (pkg: string): Set<string> =>
  new Set(Object.keys((JSON.parse(readFileSync(join(root, 'packages', pkg, 'package.json'), 'utf8')) as { exports?: object }).exports ?? {}));

function* dts(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* dts(p);
    else if (name.endsWith('.d.ts')) yield p;
  }
}

describe('built typings import only published entries', () => {
  const dirs = ['angular/dist/types', 'element/dist', 'dom/dist', 'core/dist'].map((d) => join(root, 'packages', d));
  it.skipIf(!dirs.some(existsSync))('every @dzgrid/<pkg>/<sub> import is an exported entry of <pkg>', () => {
    const bad: string[] = [];
    for (const dir of dirs)
      for (const file of dts(dir))
        for (const m of readFileSync(file, 'utf8').matchAll(/from\s+['"]@dzgrid\/([a-z-]+)(\/[a-z0-9-/]+)?['"]/g)) {
          const sub = m[2] ? `.${m[2]}` : '.';
          if (!exportsOf(m[1]!).has(sub)) bad.push(`${file.slice(root.length)} → @dzgrid/${m[1]}${m[2] ?? ''}`);
        }
    expect(bad).toEqual([]);
  });
});

describe('the real Angular example checks the published typings like a strict app', () => {
  it('compiles with skipLibCheck off (an app with it off met « @dzgrid/core/kernel » on 1.7.0)', () => {
    const ts = JSON.parse(readFileSync(join(root, 'examples/angular-audit/tsconfig.json'), 'utf8')) as { compilerOptions: { skipLibCheck?: boolean } };
    expect(ts.compilerOptions.skipLibCheck).toBe(false);
  });
});
