// @vitest-environment node
// A broken or stale example build fails `example:bytes` (owner, 2026-10-28, decisions.md « Real Angular example line »):
// from 1.0.0 to Phase 6 step 12 `example:build` failed at `npm install` (the manifest named tarballs `pack:local` never
// makes) and nobody saw it: `example:bytes` and the K.8 test measured the Phase 5 dist left in place (92 059). Now a
// successful build stamps its dist with a digest of the workspace's built packages; `example:bytes` refuses (exit 1)
// a missing build, a build without a stamp (it failed, or predates the stamp) and a stale one. Written before the code.
import { describe, it, expect, afterAll } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error a plain .mjs script
import { stampProblem, writeStamp } from '../example-lib.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const T = join(ROOT, 'node_modules/.cache/dzgrid-example-stamp');
afterAll(() => rmSync(T, { recursive: true, force: true }));

function fake() {
  rmSync(T, { recursive: true, force: true });
  const root = join(T, 'root');
  const ex = join(T, 'example');
  for (const p of ['core', 'dom', 'angular']) {
    mkdirSync(join(root, `packages/${p}/dist`), { recursive: true });
    writeFileSync(join(root, `packages/${p}/dist/index.js`), `export const ${p} = 1;`);
  }
  mkdirSync(join(root, 'packages/theme'), { recursive: true });
  writeFileSync(join(root, 'packages/theme/dzgrid.css'), '.dzg{}');
  mkdirSync(ex, { recursive: true });
  return { root, ex };
}

describe('the example build stamp', () => {
  it('no build, a build without a stamp, a stale stamp: each a problem; a fresh stamp: none', () => {
    const { root, ex } = fake();
    expect(stampProblem(ex, root)).toMatch(/no example build/);
    mkdirSync(join(ex, 'dist/audit'), { recursive: true });
    writeFileSync(join(ex, 'dist/audit/stats.json'), '{}');
    expect(stampProblem(ex, root)).toMatch(/no stamp/);
    writeStamp(ex, root);
    expect(stampProblem(ex, root)).toBeNull();
    writeFileSync(join(root, 'packages/dom/dist/index.js'), 'export const dom = 2;');
    expect(stampProblem(ex, root)).toMatch(/stale/);
    writeStamp(ex, root);
    writeFileSync(join(root, 'packages/theme/dzgrid.css'), '.dzg{color:red}');
    expect(stampProblem(ex, root)).toMatch(/stale/);
  });

  it('example.mjs: the build drops the stamp first and writes it only when every build is clean; bytes refuses before measuring', () => {
    const src = readFileSync(join(ROOT, 'scripts/example.mjs'), 'utf8');
    const build = src.slice(src.indexOf('function build()'), src.indexOf('function csv()'));
    expect(build.indexOf('dropStamp(EXAMPLE)')).toBeGreaterThan(-1);
    expect(build.indexOf('dropStamp(EXAMPLE)')).toBeLessThan(build.indexOf("sh('npm', ['install'"));
    expect(build).toMatch(/if \(report\.every\(\(r\) => r\.ok\)\) writeStamp\(EXAMPLE, ROOT\)/);
    const bytes = src.slice(src.indexOf('async function bytes()'));
    expect(bytes.indexOf('stampProblem(EXAMPLE, ROOT)')).toBeGreaterThan(-1);
    expect(bytes.indexOf('stampProblem(EXAMPLE, ROOT)')).toBeLessThan(bytes.indexOf('measureExample(EXAMPLE)'));
  });
});
