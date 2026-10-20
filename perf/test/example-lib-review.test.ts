// @vitest-environment node
// Review of step 23: the A - B method of scripts/example-lib.mjs on a fake build tree, no ng build needed.
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
// @ts-expect-error a plain .mjs script
import { measureBuild, measureExample, wrapperShare } from '../../scripts/example-lib.mjs';

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
