// @vitest-environment node
// Step 25 (the Phase 3 close, owner Q4): 0.1.0 prepared, never published. Phase 4 step 13: 0.2.0 prepared,
// not published. The four packages carry one version, their @dzgrid peers follow it, and every manifest
// that ships says where its source is.
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// @ts-expect-error a plain .mjs script
import { mapProblems, repositoryProblems } from '../manifest.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const pkg = (name: string) => JSON.parse(readFileSync(`${ROOT}packages/${name}/package.json`, 'utf8'));
const NAMES = ['core', 'dom', 'angular', 'theme'];

describe('0.2.0, the four packages', () => {
  it('share one version, 0.2.0', () => {
    expect(NAMES.map((n) => pkg(n).version)).toEqual(['0.2.0', '0.2.0', '0.2.0', '0.2.0']);
  });

  it('name their @dzgrid peers at that version (build.mjs pins them to ^0.2.0)', () => {
    for (const n of NAMES) {
      for (const [dep, range] of Object.entries((pkg(n).peerDependencies ?? {}) as Record<string, string>)) {
        if (dep.startsWith('@dzgrid/')) expect(range, `${n} → ${dep}`).toBe('0.2.0');
      }
    }
  });

  it('the Angular package states its own version', () => {
    expect(readFileSync(`${ROOT}packages/angular/src/version.ts`, 'utf8')).toContain("DZGRID_ANGULAR_VERSION = '0.2.0'");
  });

  it('export the Phase 4 subpaths (tree, lazy children, master/detail and their texts)', () => {
    const core = Object.keys(pkg('core').exports);
    const dom = Object.keys(pkg('dom').exports);
    for (const k of ['./tree', './tree-lazy', './detail']) {
      expect(core, `core ${k}`).toContain(k);
      expect(dom, `dom ${k}`).toContain(k);
    }
    for (const lang of ['en', 'fr', 'ar']) for (const part of ['tree', 'detail']) expect(dom).toContain(`./locales/${lang}-${part}`);
  });

  it('export the Phase 5 step 4 subpaths (@dzgrid/dom/edit, its texts, the theme\'s edit.css)', () => {
    const dom = Object.keys(pkg('dom').exports);
    expect(dom).toContain('./edit');
    for (const lang of ['en', 'fr', 'ar']) expect(dom).toContain(`./locales/${lang}-edit`);
    expect(Object.keys(pkg('core').exports)).toContain('./edit');
    expect(JSON.parse(readFileSync(`${ROOT}packages/theme/package.json`, 'utf8')).exports['./edit.css']).toBe('./edit.css');
  });

  it('export the Phase 5 step 6 subpath @dzgrid/dom/editors-list (owner S6-O7), built like the others', () => {
    expect(Object.keys(pkg('dom').exports)).toContain('./editors-list');
    expect(readFileSync(`${ROOT}scripts/build.mjs`, 'utf8')).toMatch(/'\.\/editors-list'/);
  });

  it('export the Phase 5 step 10 subpath @dzgrid/core/range, built like the others', () => {
    expect(pkg('core').exports['./range']).toEqual({ types: './src/range.ts', default: './src/range.ts' });
    expect(readFileSync(`${ROOT}scripts/build.mjs`, 'utf8')).toMatch(/'\.\/edit', '\.\/range'\]/);
  });

  it('export the Phase 5 step 11a subpaths (@dzgrid/dom/range, its texts, the theme\'s range.css), built like the others', () => {
    const dom = pkg('dom').exports;
    expect(dom['./range']).toEqual({ types: './src/range.ts', default: './src/range.ts' });
    for (const lang of ['en', 'fr', 'ar']) expect(dom[`./locales/${lang}-range`], lang).toEqual({ types: `./src/locales/${lang}-range.ts`, default: `./src/locales/${lang}-range.ts` });
    const build = readFileSync(`${ROOT}scripts/build.mjs`, 'utf8');
    expect(build).toMatch(/'\.\/editors-list', '\.\/range'/);
    for (const lang of ['en', 'fr', 'ar']) expect(build).toContain(`'./locales/${lang}-range'`);
    const theme = JSON.parse(readFileSync(`${ROOT}packages/theme/package.json`, 'utf8'));
    for (const f of ['range.css', 'range.unlayered.css', 'range.scss']) {
      expect(theme.exports[`./${f}`], f).toBe(`./${f}`);
      expect(theme.files, f).toContain(f);
    }
  });

  it('export the Phase 5 step 12 subpaths (@dzgrid/dom/fill, its texts, the theme\'s fill.css), built like the others', () => {
    const dom = pkg('dom').exports;
    expect(dom['./fill']).toEqual({ types: './src/fill.ts', default: './src/fill.ts' });
    for (const lang of ['en', 'fr', 'ar']) expect(dom[`./locales/${lang}-fill`], lang).toEqual({ types: `./src/locales/${lang}-fill.ts`, default: `./src/locales/${lang}-fill.ts` });
    const build = readFileSync(`${ROOT}scripts/build.mjs`, 'utf8');
    expect(build).toMatch(/'\.\/range', '\.\/fill'/);
    for (const lang of ['en', 'fr', 'ar']) expect(build).toContain(`'./locales/${lang}-fill'`);
    const theme = JSON.parse(readFileSync(`${ROOT}packages/theme/package.json`, 'utf8'));
    for (const f of ['fill.css', 'fill.unlayered.css', 'fill.scss']) {
      expect(theme.exports[`./${f}`], f).toBe(`./${f}`);
      expect(theme.files, f).toContain(f);
    }
  });

  it('keep gsap and tzslot optional peers', () => {
    const dom = pkg('dom');
    expect(dom.peerDependenciesMeta).toEqual({ '@tzslot/core': { optional: true }, '@tzslot/dom': { optional: true }, gsap: { optional: true } });
    expect(pkg('angular').peerDependenciesMeta).toEqual({ '@tzslot/core': { optional: true }, '@tzslot/dom': { optional: true } });
  });

  it('the theme, published from its folder, says where its source is', () => {
    expect(repositoryProblems('theme', pkg('theme'))).toEqual([]);
  });
});

describe('repositoryProblems: a shipped manifest names its repository and folder', () => {
  const good = { repository: { type: 'git', url: 'git+https://github.com/plinthworks/dzgrid.git', directory: 'packages/dom' } };

  it('accepts the repository with its folder', () => {
    expect(repositoryProblems('dom', good)).toEqual([]);
  });

  it('refuses a manifest without repository, or with the wrong folder', () => {
    expect(repositoryProblems('dom', {})).toEqual(['packages/dom has no repository']);
    expect(repositoryProblems('dom', { repository: { ...good.repository, directory: 'packages/core' } })).toEqual(['packages/dom repository.directory is packages/core, not packages/dom']);
  });
});

describe('mapProblems: no shipped source map points at a file left behind', () => {
  const check = (maps: Record<string, object>, others: string[] = []) =>
    mapProblems('core', [...Object.keys(maps), ...others], (f: string) => JSON.stringify(maps[f]));

  it('refuses a declaration map naming ../src/*.ts (not shipped)', () => {
    expect(check({ 'grid.d.ts.map': { sources: ['../src/grid.ts'] } }, ['grid.d.ts'])).toEqual([
      'packages/core/dist/grid.d.ts.map points at ../src/grid.ts, which is not shipped',
    ]);
  });

  it('accepts a source inlined in sourcesContent, or a source that ships beside it', () => {
    expect(check({ 'a/b.js.map': { sources: ['../../src/a/b.ts'], sourcesContent: ['export {}'] } })).toEqual([]);
    expect(check({ 'a/b.js.map': { sources: ['./b.mjs'] } }, ['a/b.mjs'])).toEqual([]);
  });

  // After `npm run build`: what npm receives from each built dist/.
  const tree = (dir: string, at = ''): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? tree(`${dir}/${e.name}`, `${at}${e.name}/`) : [`${at}${e.name}`]));
  for (const n of ['core', 'dom', 'angular']) {
    const dist = `${ROOT}packages/${n}/dist`;
    it.skipIf(!existsSync(`${dist}/package.json`))(`the built ${n} ships no .d.ts.map and no dangling map`, () => {
      const files = tree(dist);
      expect(files.filter((f) => f.endsWith('.d.ts.map'))).toEqual([]);
      expect(mapProblems(n, files, (f: string) => readFileSync(`${dist}/${f}`, 'utf8'))).toEqual([]);
    });
  }
});
