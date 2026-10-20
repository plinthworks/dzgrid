// @vitest-environment node
// K.8 in the Angular example's real build (step 23, docs/behaviors/angular-example.md): the DzGrid
// share of the first load is the default build's initial files less the baseline's (the same
// shell drawing a plain table). The parsing of index.html runs always; the measure needs the
// example's builds (`npm run example:build`) and is skipped without them.
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
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
    expect(initialFiles(html)).toEqual({ scripts: ['chunk-ZZ.js', 'main-Q9.js'], styles: ['styles-AB12.css'] });
  });
});

describe.skipIf(!built)('K.8 from the real ng build', () => {
  it('the DzGrid share (default less baseline: initial JS and global CSS, gzip 9) stays within 85 000', () => {
    const m = measureExample(EXAMPLE);
    expect(m.audit.files.length).toBeGreaterThan(0);
    expect(m.baseline.total).toBeGreaterThan(20_000);
    expect(m.share).toBeLessThanOrEqual(85_000);
    // DzGrid loads with the page: a share far below the esbuild profile would mean it did not.
    expect(m.share).toBeGreaterThan(40_000);
    expect(m.wrapper.min).toBeGreaterThan(0);
    expect(m.wrapper.gz).toBeLessThan(10_000);
  });
});
