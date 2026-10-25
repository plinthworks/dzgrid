// @vitest-environment node
// Review of step 23: the A - B method of scripts/example-lib.mjs on a fake build tree, no ng build needed.
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
// @ts-expect-error a plain .mjs script
import { forgetLocalPacks, measureBuild, measureExample, measureLazy, wrapperShare } from '../../scripts/example-lib.mjs';

const gz = (s: string) => gzipSync(Buffer.from(s), { level: 9 }).length;
/** Pseudo-random text so gzip cannot fold it away. */
const noise = (n: number, seed: number) => { let x = seed; let s = ''; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; s += String.fromCharCode(33 + (x % 90)); } return s; };

function site(dir: string, files: Record<string, string>, html: string, page = 'index.html', stats?: unknown) {
  mkdirSync(join(dir, 'browser'), { recursive: true });
  for (const [f, c] of Object.entries(files)) writeFileSync(join(dir, 'browser', f), c);
  writeFileSync(join(dir, 'browser', page), html);
  if (stats) writeFileSync(join(dir, 'stats.json'), JSON.stringify(stats));
}

describe('measureExample (A - B), on a fake tree', () => {
  let ex: string;
  const A = { 'main-A.js': noise(4000, 1), 'chunk-1.js': noise(3000, 2), 'chunk-lazy.js': noise(9000, 3), 'styles-A.css': noise(1500, 4) };
  const B = { 'main-B.js': noise(2000, 5), 'styles-B.css': noise(300, 6) };
  beforeAll(() => {
    ex = mkdtempSync(join(tmpdir(), 'dzg-ex-'));
    site(join(ex, 'dist/audit'), A, '<link rel="stylesheet" href="styles-A.css"><link rel="modulepreload" href="chunk-1.js"><script src="main-A.js" type="module"></script>', 'index.csr.html', {
      outputs: { 'main-A.js': { inputs: { 'node_modules/@dzgrid/angular/fesm2022/dzgrid-angular.mjs': { bytesInOutput: 1000 }, 'src/app.ts': { bytesInOutput: 3000 } } } },
    });
    site(join(ex, 'dist/baseline'), B, '<link rel="stylesheet" href="styles-B.css"><script src="main-B.js" type="module"></script>');
  });

  it('share = default initial (JS + CSS gzip) less baseline; the lazy chunk not counted; index.csr.html read', () => {
    const m = measureExample(ex);
    const a = gz(A['main-A.js']) + gz(A['chunk-1.js']) + gz(A['styles-A.css']);
    const b = gz(B['main-B.js']) + gz(B['styles-B.css']);
    expect(m.audit.total).toBe(a);
    expect(m.audit.css).toBe(gz(A['styles-A.css']));
    expect(m.baseline.total).toBe(b);
    expect(m.share).toBe(a - b);
  });

  it('the wrapper share scales the file gzip by its fraction of the bytes', () => {
    const files = measureBuild(join(ex, 'dist/audit')).files;
    const w = wrapperShare(join(ex, 'dist/audit'), files);
    expect(w.min).toBe(1000);
    expect(w.gz).toBe(Math.round((gz(A['main-A.js']) * 1000) / 4000));
    expect(wrapperShare(join(ex, 'dist/baseline'), []).missing).toBe(true);
  });

  // Bug: Angular's index generator hints at most 10 initial chunks (MODULE_PRELOAD_MAX = 10 in
  // @angular/build index-html-generator); a statically imported chunk past the tenth has no
  // <link rel="modulepreload">, so initialFiles misses it and the share under-counts K.8.
  it('counts an initial chunk that main imports statically but the page does not hint (Angular caps hints at 10)', () => {
    const dir = join(ex, 'dist/capped');
    const files: Record<string, string> = { 'main-C.js': noise(500, 9) };
    const hinted: string[] = [];
    for (let i = 1; i <= 11; i++) { files[`chunk-${i}.js`] = noise(300, 10 + i); if (i <= 10) hinted.push(`<link rel="modulepreload" href="chunk-${i}.js">`); }
    site(dir, files, `${hinted.join('')}<script src="main-C.js" type="module"></script>`, 'index.html', {
      outputs: { 'main-C.js': { inputs: {}, imports: Array.from({ length: 11 }, (_, i) => ({ path: `chunk-${i + 1}.js`, kind: 'import-statement' })) } },
    });
    expect(measureBuild(dir).files.map((f: { file: string }) => f.file)).toContain('chunk-11.js');
  });

  it('without stats, at the cap of 10 hints, refuses to measure (it cannot be sure); under it, the page alone', () => {
    const dir = join(ex, 'dist/capped-nostats');
    const files: Record<string, string> = { 'main-D.js': noise(500, 30) };
    const hinted: string[] = [];
    for (let i = 1; i <= 10; i++) { files[`chunk-${i}.js`] = noise(300, 30 + i); hinted.push(`<link rel="modulepreload" href="chunk-${i}.js">`); }
    site(dir, files, `${hinted.join('')}<script src="main-D.js" type="module"></script>`);
    expect(() => measureBuild(dir)).toThrow(/stats-json/);
    expect(measureBuild(join(ex, 'dist/baseline')).files.map((f: { file: string }) => f.file)).toEqual(['main-B.js', 'styles-B.css']);
  });

  // Phase 5 step 9 (owner S9-Q4): the « stock » screen, loaded on demand, measured apart from the first load.
  it('measureLazy: the chunk a page imports dynamically and what it imports statically, less the first load', () => {
    const dir = join(ex, 'dist/lazy');
    const files = { 'main-L.js': noise(800, 60), 'chunk-1.js': noise(400, 61), 'chunk-stock.js': noise(2000, 62), 'chunk-shared.js': noise(700, 63), 'chunk-other.js': noise(900, 64), 'chunk-later.js': noise(600, 65) };
    site(dir, files, '<script src="main-L.js" type="module"></script>', 'index.html', {
      outputs: {
        'main-L.js': { inputs: {}, imports: [{ path: 'chunk-1.js', kind: 'import-statement' }, { path: 'chunk-stock.js', kind: 'dynamic-import' }, { path: 'chunk-other.js', kind: 'dynamic-import' }] },
        'chunk-1.js': { inputs: {}, imports: [] },
        'chunk-stock.js': { inputs: { 'src/app/stock.component.ts': { bytesInOutput: 10 } }, imports: [{ path: 'chunk-shared.js', kind: 'import-statement' }, { path: 'chunk-1.js', kind: 'import-statement' }, { path: 'chunk-later.js', kind: 'dynamic-import' }] },
        'chunk-later.js': { inputs: {}, imports: [] },
        'chunk-shared.js': { inputs: {}, imports: [] },
        'chunk-other.js': { inputs: { 'node_modules/@dzgrid/dom/motion-gsap.js': { bytesInOutput: 10 } }, imports: [] },
      },
    });
    const m = measureLazy(dir, /src\/app\/stock\.component/);
    expect(m.files.map((f: { file: string }) => f.file).sort()).toEqual(['chunk-shared.js', 'chunk-stock.js']);
    expect(m.total).toBe(gz(files['chunk-stock.js']) + gz(files['chunk-shared.js']));
    expect(() => measureLazy(dir, /nothing-like-this/)).toThrow(/no dynamic chunk/);
  });

  it('measureLazy: a dynamic import made from a static chunk of the first load (review of step 9)', () => {
    const dir = join(ex, 'dist/lazy-from-chunk');
    const files = { 'main-M.js': noise(800, 70), 'chunk-init.js': noise(400, 71), 'chunk-stock2.js': noise(1500, 72) };
    site(dir, files, '<script src="main-M.js" type="module"></script>', 'index.html', {
      outputs: {
        'main-M.js': { inputs: {}, imports: [{ path: 'chunk-init.js', kind: 'import-statement' }] },
        'chunk-init.js': { inputs: {}, imports: [{ path: 'chunk-stock2.js', kind: 'dynamic-import' }] },
        'chunk-stock2.js': { inputs: { 'src/app/stock.component.ts': { bytesInOutput: 10 } }, imports: [] },
      },
    });
    const m = measureLazy(dir, /src\/app\/stock\.component/);
    expect(m.files.map((f: { file: string }) => f.file)).toEqual(['chunk-stock2.js']);
    expect(m.total).toBe(gz(files['chunk-stock2.js']));
  });

  it('refuses stats that do not know the page script (a stale stats.json)', () => {
    const dir = join(ex, 'dist/stale-stats');
    site(dir, { 'main-E.js': noise(500, 50) }, '<script src="main-E.js" type="module"></script>', 'index.html', { outputs: { 'main-OLD.js': { inputs: {}, imports: [] } } });
    expect(() => measureBuild(dir)).toThrow(/stale stats/);
  });

  it('follows static imports only: a dynamic import stays lazy', () => {
    const dir = join(ex, 'dist/dynamic');
    site(dir, { 'main-F.js': noise(500, 60), 'chunk-s.js': noise(300, 61), 'chunk-d.js': noise(300, 62) }, '<script src="main-F.js" type="module"></script>', 'index.html', {
      outputs: { 'main-F.js': { inputs: {}, imports: [{ path: 'chunk-s.js', kind: 'import-statement' }, { path: 'chunk-d.js', kind: 'dynamic-import' }] }, 'chunk-s.js': { inputs: {}, imports: [] } },
    });
    expect(measureBuild(dir).files.map((f: { file: string }) => f.file)).toEqual(['main-F.js', 'chunk-s.js']);
  });
});

// Phase 4 step 11: `example:build` installed the previous wrapper. The tarballs keep version 0.1.0 and the
// example's (gitignored) lockfile pins their old integrity, so npm served its cached copy of the old pack.
describe('forgetLocalPacks: the example installs the tarballs just packed', () => {
  it('drops the lock entries of the @dzgrid packs, keeps everything else', () => {
    const lock = {
      name: 'x',
      packages: {
        '': { dependencies: { '@dzgrid/angular': 'file:../../packed/dzgrid-angular-0.1.0.tgz', '@angular/core': '^21' } },
        'node_modules/@dzgrid/angular': { version: '0.1.0', resolved: 'file:../../packed/dzgrid-angular-0.1.0.tgz', integrity: 'sha512-OLD' },
        'node_modules/@dzgrid/core': { version: '0.1.0', resolved: 'file:../../packed/dzgrid-core-0.1.0.tgz', integrity: 'sha512-OLD2' },
        'node_modules/@angular/core': { version: '21.2.0', resolved: 'https://registry.npmjs.org/x.tgz', integrity: 'sha512-NG' },
      },
    };
    const out = forgetLocalPacks(lock);
    expect(Object.keys(out.packages)).toEqual(['', 'node_modules/@angular/core']);
    expect(out.packages['node_modules/@angular/core']).toEqual(lock.packages['node_modules/@angular/core']);
    expect(out.packages[''].dependencies['@dzgrid/angular']).toBe('file:../../packed/dzgrid-angular-0.1.0.tgz');
  });
});
