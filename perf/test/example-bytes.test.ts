// @vitest-environment node
// K.8 in the Angular example's real build (step 23, docs/behaviors/angular-example.md): the DzGrid
// share of the first load is the default build's initial files less the baseline's (the same
// shell drawing a plain table). The parsing of index.html runs always; the measure needs the
// example's builds (`npm run example:build`) and is skipped without them.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// @ts-expect-error a plain .mjs script
import { initialFiles, measureExample } from '../../scripts/example-lib.mjs';

const EXAMPLE = fileURLToPath(new URL('../../examples/angular-audit/', import.meta.url));
const page = (b: string) => existsSync(`${EXAMPLE}dist/${b}/browser/index.html`) || existsSync(`${EXAMPLE}dist/${b}/browser/index.csr.html`);
const built = page('audit') && page('baseline');

describe('the initial files of an Angular build', () => {
  it('takes the module scripts, the module preloads and the stylesheets, once each, in page order', () => {
    const html = `<!doctype html><html><head>
      <link rel="stylesheet" href="styles-AB12.css" media="print" onload="this.media='all'"><noscript><link rel="stylesheet" href="styles-AB12.css"></noscript>
      <link rel="modulepreload" href="chunk-ZZ.js">
      <link rel="icon" href="favicon.ico">
      <style>.dzg{color:red}</style>
    </head><body><app-root></app-root>
      <script src="https://cdn.example.org/x.js"></script>
      <script src="main-Q9.js" type="module"></script>
      <link rel="modulepreload" href="chunk-ZZ.js">
    </body></html>`;
    expect(initialFiles(html)).toEqual({ scripts: ['chunk-ZZ.js', 'main-Q9.js'], styles: ['styles-AB12.css'], entries: ['main-Q9.js'], preloads: 1 });
  });
});

describe('the real example\'s ceiling', () => {
  it('is 95 000 in example:bytes (owner, 2026-10-28, Phase 6 step 12: measured 94 596; S12-Q10 92 500, S9-Q7 92 000, Q17a 90 000 before)', () => {
    const src = readFileSync(fileURLToPath(new URL('../../scripts/example.mjs', import.meta.url)), 'utf8');
    expect(/const K8 = ([\d_]+);/.exec(src)?.[1]).toBe('95_000');
  });
});

describe.skipIf(!built)('K.8 from the real ng build', () => {
  it('the DzGrid share (default less baseline: initial JS and global CSS, gzip 9) stays within 95 000 (owner 2026-10-28, step 12; S12-Q10 92 500, S9-Q7 92 000, Q17a 90 000, Q14 87 000)', () => {
    const m = measureExample(EXAMPLE);
    expect(m.audit.files.length).toBeGreaterThan(0);
    expect(m.baseline.total).toBeGreaterThan(20_000);
    expect(m.share).toBeLessThanOrEqual(95_000);
    // DzGrid loads with the page: a share far below the esbuild profile would mean it did not.
    expect(m.share).toBeGreaterThan(40_000);
    expect(m.wrapper.min).toBeGreaterThan(0);
    expect(m.wrapper.gz).toBeLessThan(10_000);
  });
});

// Phase 6 step 12 (owner Q12-3): the page's address on a second screen, `?screen=audit-url`, loaded on demand as the
// « stock » screen is; the default audit screen pays nothing for it (none of `@dzgrid/core/state` nor `@dzgrid/dom/state`
// in its first load); `example:bytes` reports it apart as (5). Written before the screen.
describe('the URL screen (?screen=audit-url, owner Q12-3)', () => {
  const src = (f: string) => readFileSync(fileURLToPath(new URL(`../../examples/angular-audit/src/${f}`, import.meta.url)), 'utf8');
  it('both browser bootstraps load it on demand; the default screen imports no state code; example:bytes prints (5)', () => {
    for (const f of ['main.ts', 'main.zone.ts']) expect(src(f), f).toContain(`import('./app/audit-url')`);
    expect(src('app/audit.component.ts')).not.toMatch(/@dzgrid\/(core|dom)\/state/);
    const url = src('app/audit-url.ts');
    for (const name of ['gridState', 'fromSearchParams', 'toSearchParams', 'replaceState', 'AUDIT_ADDRESS']) expect(url).toContain(name);
    // The audit screen reads the address's state through an optional token: two bindings, no state code.
    expect(src('app/audit.component.ts')).toMatch(/\[state\]="address\?\.initial" \(stateChanged\)="address\?\.keep\(\$event\.state\)"/);
    expect(readFileSync(fileURLToPath(new URL('../../scripts/example.mjs', import.meta.url)), 'utf8')).toMatch(/\(5\) the « audit-url » screen/);
  });

  it.skipIf(!built)('measured: its lazy chunks hold the state code, the first load holds none of it', () => {
    // @ts-expect-error a plain .mjs script
    return import('../../scripts/example-lib.mjs').then(({ measureLazy, measureBuild }) => {
      const dist = fileURLToPath(new URL('../../examples/angular-audit/dist/audit', import.meta.url));
      const lazy = measureLazy(dist, /src\/app\/audit-url\.ts/);
      expect(lazy.total).toBeGreaterThan(1_500);
      const read = (f: string) => readFileSync(`${dist}/browser/${f}`, 'utf8');
      expect(lazy.files.some((f: { file: string }) => read(f.file).includes('state-group'))).toBe(true);
      expect(measureBuild(dist).files.some((f: { file: string }) => read(f.file).includes('state-group'))).toBe(false);
    });
  });
});
