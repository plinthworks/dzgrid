// @vitest-environment node
// Step 25 (the Phase 3 close, owner Q4): 0.1.0 prepared, never published. Phase 4 step 13: 0.2.0 prepared,
// not published. Phase 5 step 13 (the close): 0.3.0 prepared, not published. 2026-10-28: 1.0.0, the first npm release (the owner publishes); the Phase 6 close: 1.1.0, a minor (additive over 1.0.0). The four packages carry one version, their @dzgrid peers follow it, and every manifest
// that ships says where its source is.
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// @ts-expect-error a plain .mjs script
import { mapProblems, publishProblems, repositoryProblems } from '../manifest.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const pkg = (name: string) => JSON.parse(readFileSync(`${ROOT}packages/${name}/package.json`, 'utf8'));
const NAMES = ['core', 'dom', 'angular', 'theme'];

describe('1.1.0, the four packages', () => {
  it('share one version, 1.1.0', () => {
    expect(NAMES.map((n) => pkg(n).version)).toEqual(['1.1.0', '1.1.0', '1.1.0', '1.1.0']);
  });

  it('name their @dzgrid peers at that version (build.mjs pins them to ^1.1.0)', () => {
    for (const n of NAMES) {
      for (const [dep, range] of Object.entries((pkg(n).peerDependencies ?? {}) as Record<string, string>)) {
        if (dep.startsWith('@dzgrid/')) expect(range, `${n} → ${dep}`).toBe('1.1.0');
      }
    }
  });

  it('export the Phase 6 subpaths, their texts and sheets (1.1.0: columns, menu, chooser, state, pinned rows, auto height, print, groups)', () => {
    const core = Object.keys(pkg('core').exports);
    const dom = Object.keys(pkg('dom').exports);
    const theme = Object.keys(pkg('theme').exports);
    expect(core).toContain('./state');
    for (const k of ['./columns', './column-menu', './columns-panel', './state', './pinned-rows', './auto-height', './print', './groups']) expect(dom, k).toContain(k);
    for (const l of ['columns', 'column-menu', 'pinned', 'print']) for (const g of ['en', 'fr', 'ar']) expect(dom).toContain(`./locales/${g}-${l}`);
    for (const f of ['columns', 'columns-panel', 'pinned-rows', 'print', 'dzgrid.comfort']) for (const u of ['', '.unlayered']) expect(theme).toContain(`./${f}${u}.css`);
  });

  it('the Angular package states its own version', () => {
    expect(readFileSync(`${ROOT}packages/angular/src/version.ts`, 'utf8')).toContain("DZGRID_ANGULAR_VERSION = '1.1.0'");
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
    // Phase 6 step 5 adds './state' after it.
    expect(readFileSync(`${ROOT}scripts/build.mjs`, 'utf8')).toMatch(/'\.\/edit', '\.\/range'[,\]]/);
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

  it('export the Phase 6 step 2 subpaths (@dzgrid/dom/columns, its texts, the theme\'s columns.css), built like the others', () => {
    const dom = pkg('dom').exports;
    expect(dom['./columns']).toEqual({ types: './src/columns.ts', default: './src/columns.ts' });
    for (const lang of ['en', 'fr', 'ar']) expect(dom[`./locales/${lang}-columns`], lang).toEqual({ types: `./src/locales/${lang}-columns.ts`, default: `./src/locales/${lang}-columns.ts` });
    const build = readFileSync(`${ROOT}scripts/build.mjs`, 'utf8');
    expect(build).toMatch(/'\.\/fill', '\.\/columns'/);
    for (const lang of ['en', 'fr', 'ar']) expect(build).toContain(`'./locales/${lang}-columns'`);
    const theme = JSON.parse(readFileSync(`${ROOT}packages/theme/package.json`, 'utf8'));
    for (const f of ['columns.css', 'columns.unlayered.css', 'columns.scss']) {
      expect(theme.exports[`./${f}`], f).toBe(`./${f}`);
      expect(theme.files, f).toContain(f);
    }
    // Step 4 adds 'columns-panel' after it.
    expect(readFileSync(`${ROOT}scripts/build-theme.mjs`, 'utf8')).toMatch(/'fill', 'columns'[,\]]/);
  });

  it('export the Phase 6 step 8b-1 subpaths (@dzgrid/dom/pinned-rows, its -pinned texts), built like the others; its look in pinned-rows.css (built, exported, shipped)', () => {
    const dom = pkg('dom').exports;
    expect(dom['./pinned-rows']).toEqual({ types: './src/pinned-rows.ts', default: './src/pinned-rows.ts' });
    for (const lang of ['en', 'fr', 'ar']) expect(dom[`./locales/${lang}-pinned`], lang).toEqual({ types: `./src/locales/${lang}-pinned.ts`, default: `./src/locales/${lang}-pinned.ts` });
    const build = readFileSync(`${ROOT}scripts/build.mjs`, 'utf8');
    expect(build).toContain("'./pinned-rows'");
    for (const lang of ['en', 'fr', 'ar']) expect(build).toContain(`'./locales/${lang}-pinned'`);
    const theme = JSON.parse(readFileSync(`${ROOT}packages/theme/package.json`, 'utf8'));
    for (const f of ['pinned-rows.css', 'pinned-rows.unlayered.css', 'pinned-rows.scss']) {
      expect(theme.exports[`./${f}`], f).toBe(`./${f}`);
      expect(theme.files, f).toContain(f);
    }
    expect(readFileSync(`${ROOT}scripts/build-theme.mjs`, 'utf8')).toMatch(/'columns-panel', 'pinned-rows'[,\]]/); // step 11 adds 'print' after it
  });

  it('export the Phase 6 step 11 subpaths (@dzgrid/dom/print, its -print texts), built like the others; its look in print.css (built, exported, shipped)', () => {
    const dom = pkg('dom').exports;
    expect(dom['./print']).toEqual({ types: './src/print.ts', default: './src/print.ts' });
    for (const lang of ['en', 'fr', 'ar']) expect(dom[`./locales/${lang}-print`], lang).toEqual({ types: `./src/locales/${lang}-print.ts`, default: `./src/locales/${lang}-print.ts` });
    const build = readFileSync(`${ROOT}scripts/build.mjs`, 'utf8');
    expect(build).toContain("'./print'");
    for (const lang of ['en', 'fr', 'ar']) expect(build).toContain(`'./locales/${lang}-print'`);
    const theme = JSON.parse(readFileSync(`${ROOT}packages/theme/package.json`, 'utf8'));
    for (const f of ['print.css', 'print.unlayered.css', 'print.scss']) {
      expect(theme.exports[`./${f}`], f).toBe(`./${f}`);
      expect(theme.files, f).toContain(f);
    }
    expect(readFileSync(`${ROOT}scripts/build-theme.mjs`, 'utf8')).toMatch(/'pinned-rows', 'print'[,\]]/); // step 16h adds 'fresh-rows' after it
  });

  it('export the Phase 6 step 3 subpaths (@dzgrid/dom/column-menu, its -column-menu texts), built like the others; its look in columns.css', () => {
    const dom = pkg('dom').exports;
    expect(dom['./column-menu']).toEqual({ types: './src/column-menu.ts', default: './src/column-menu.ts' });
    for (const lang of ['en', 'fr', 'ar']) expect(dom[`./locales/${lang}-column-menu`], lang).toEqual({ types: `./src/locales/${lang}-column-menu.ts`, default: `./src/locales/${lang}-column-menu.ts` });
    const build = readFileSync(`${ROOT}scripts/build.mjs`, 'utf8');
    expect(build).toMatch(/'\.\/columns', '\.\/column-menu'/);
    for (const lang of ['en', 'fr', 'ar']) expect(build).toContain(`'./locales/${lang}-column-menu'`);
  });

  it('export the Phase 6 step 4 subpath (@dzgrid/dom/columns-panel), built like the others; its look in columns-panel.css (built, exported, shipped)', () => {
    const dom = pkg('dom').exports;
    expect(dom['./columns-panel']).toEqual({ types: './src/columns-panel.ts', default: './src/columns-panel.ts' });
    expect(readFileSync(`${ROOT}scripts/build.mjs`, 'utf8')).toMatch(/'\.\/column-menu', '\.\/columns-panel'/);
    const theme = JSON.parse(readFileSync(`${ROOT}packages/theme/package.json`, 'utf8'));
    for (const f of ['columns-panel.css', 'columns-panel.unlayered.css', 'columns-panel.scss']) {
      expect(theme.exports[`./${f}`], f).toBe(`./${f}`);
      expect(theme.files, f).toContain(f);
    }
    expect(readFileSync(`${ROOT}scripts/build-theme.mjs`, 'utf8')).toMatch(/'columns', 'columns-panel'[,\]]/); // step 8b-1 adds 'pinned-rows' after it
  });

  it('export the Phase 6 step 5 subpaths (@dzgrid/core/state, @dzgrid/dom/state), built like the others', () => {
    expect(pkg('core').exports['./state']).toEqual({ types: './src/state.ts', default: './src/state.ts' });
    expect(pkg('dom').exports['./state']).toEqual({ types: './src/state.ts', default: './src/state.ts' });
    const build = readFileSync(`${ROOT}scripts/build.mjs`, 'utf8');
    expect(build).toMatch(/'\.\/edit', '\.\/range', '\.\/state'[,\]]/);
    expect(build).toMatch(/'\.\/columns-panel', '\.\/state'/);
  });

  it('export the step 16e subpath @dzgrid/core/compare, built like the others', () => {
    expect(pkg('core').exports['./compare']).toEqual({ types: './src/compare.ts', default: './src/compare.ts' });
    expect(readFileSync(`${ROOT}scripts/build.mjs`, 'utf8')).toMatch(/'\.\/detail', '\.\/compare', '\.\/edit'/);
  });

  it('export the 1.1.0 step 15 subpaths (@dzgrid/core/row-gaps, @dzgrid/dom/row-gaps), built like the others', () => {
    expect(pkg('core').exports['./row-gaps']).toEqual({ types: './src/row-gaps.ts', default: './src/row-gaps.ts' });
    expect(pkg('dom').exports['./row-gaps']).toEqual({ types: './src/row-gaps.ts', default: './src/row-gaps.ts' });
    const build = readFileSync(`${ROOT}scripts/build.mjs`, 'utf8');
    expect(build).toMatch(/'\.\/state', '\.\/row-gaps'\]/);
    expect(build).toMatch(/'\.\/auto-height', '\.\/row-gaps'/);
  });

  it('export the 1.1.0 step 16h subpath (@dzgrid/dom/fresh-rows), its -fresh texts and fresh-rows.css, built like the others', () => {
    const dom = pkg('dom').exports;
    expect(dom['./fresh-rows']).toEqual({ types: './src/fresh-rows.ts', default: './src/fresh-rows.ts' });
    for (const g of ['en', 'fr', 'ar']) expect(dom[`./locales/${g}-fresh`]).toEqual({ types: `./src/locales/${g}-fresh.ts`, default: `./src/locales/${g}-fresh.ts` });
    const build = readFileSync(`${ROOT}scripts/build.mjs`, 'utf8');
    expect(build).toMatch(/'\.\/row-gaps', '\.\/fresh-rows'/);
    expect(build).toMatch(/'\.\/locales\/ar-print', '\.\/locales\/en-fresh', '\.\/locales\/fr-fresh', '\.\/locales\/ar-fresh'\]/);
    const theme = pkg('theme').exports;
    for (const f of ['fresh-rows.css', 'fresh-rows.unlayered.css', 'fresh-rows.scss']) {
      expect(theme[`./${f}`], f).toBe(`./${f}`);
      expect(pkg('theme').files, f).toContain(f);
    }
    expect(readFileSync(`${ROOT}scripts/build-theme.mjs`, 'utf8')).toMatch(/'print', 'fresh-rows'\]/);
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

// 1.0.0 (2026-10-28), the first npm release: every shipped manifest says how it is published (public, with a
// provenance attestation from the release workflow), which Node it is checked on, and where to read and report.
describe('publishProblems: a shipped manifest is ready for the registry', () => {
  const good = {
    license: 'MIT',
    homepage: 'https://github.com/plinthworks/dzgrid#readme',
    bugs: { url: 'https://github.com/plinthworks/dzgrid/issues' },
    keywords: ['data-grid'],
    engines: { node: '>=22' },
    publishConfig: { access: 'public', provenance: true },
  };

  it('accepts a complete manifest', () => {
    expect(publishProblems('core', good)).toEqual([]);
  });

  it('refuses a manifest without public access or provenance, without engines, keywords, homepage, bugs or licence', () => {
    expect(publishProblems('core', { ...good, publishConfig: { access: 'public' } })).toEqual(['packages/core publishConfig is not { access: public, provenance: true }']);
    expect(publishProblems('core', { ...good, publishConfig: undefined })).toHaveLength(1);
    expect(publishProblems('core', { ...good, engines: undefined })).toEqual(['packages/core has no engines.node']);
    expect(publishProblems('core', { ...good, keywords: [] })).toEqual(['packages/core has no keywords']);
    expect(publishProblems('core', { ...good, homepage: undefined, bugs: undefined, license: 'ISC' })).toHaveLength(3);
  });

  it('the theme, published from its folder, is ready', () => {
    expect(publishProblems('theme', pkg('theme'))).toEqual([]);
  });

  for (const n of ['core', 'dom', 'angular']) {
    const file = `${ROOT}packages/${n}/dist/package.json`;
    it.skipIf(!existsSync(file))(`the built ${n} is ready`, () => {
      expect(publishProblems(n, JSON.parse(readFileSync(file, 'utf8')))).toEqual([]);
    });
  }
});
