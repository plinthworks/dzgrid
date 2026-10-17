// @vitest-environment node
import { describe, it, expect } from 'vitest';
// @ts-expect-error a plain .mjs script
import { entryProblems, manifestProblems, peerProblems, pinPeers } from '../manifest.mjs';

/**
 * What build.mjs refuses before a package leaves for npm. A manifest that
 * points at src/ points at a file npm never received: the install succeeds and
 * the import fails.
 */
describe('build.mjs, the published manifest check', () => {
  const clean = {
    name: '@dzgrid/angular',
    module: './fesm2022/dzgrid-angular.mjs',
    typings: './types/dzgrid-angular.d.ts',
    exports: {
      '.': { types: './types/dzgrid-angular.d.ts', default: './fesm2022/dzgrid-angular.mjs' },
      './package.json': { default: './package.json' },
    },
    peerDependencies: { '@angular/core': '^21.0.0', '@dzgrid/core': '0.0.0' },
  };

  it('accepts a clean Angular manifest', () => {
    expect(manifestProblems('angular', clean)).toEqual([]);
  });

  it('refuses an Angular manifest whose main still points at src/', () => {
    expect(manifestProblems('angular', { ...clean, main: './src/index.ts' })).toEqual([
      'packages/angular/dist/package.json still points at src/',
    ]);
  });

  it('refuses an Angular manifest whose types or an export point at src/', () => {
    expect(manifestProblems('angular', { ...clean, types: './src/index.ts' })).toHaveLength(1);
    expect(
      manifestProblems('angular', { ...clean, exports: { ...clean.exports, './x': { default: './src/x.ts' } } }),
    ).toHaveLength(1);
    expect(manifestProblems('angular', { ...clean, typings: './src/index.d.ts' })).toHaveLength(1);
  });

  it('refuses runtime dependencies, except tslib for the Angular package', () => {
    expect(manifestProblems('core', { name: '@dzgrid/core', dependencies: { lodash: '1' } })).toEqual([
      'packages/core has runtime dependencies: lodash',
    ]);
    expect(manifestProblems('angular', { ...clean, dependencies: { tslib: '^2.3.0' } })).toEqual([]);
    expect(manifestProblems('angular', { ...clean, dependencies: { tslib: '^2.3.0', rxjs: '7' } })).toEqual([
      'packages/angular has runtime dependencies: rxjs',
    ]);
    expect(manifestProblems('dom', { name: '@dzgrid/dom', dependencies: { tslib: '^2.3.0' } })).toEqual([
      'packages/dom has runtime dependencies: tslib',
    ]);
  });
});

describe('build.mjs, the declared subpaths', () => {
  const exports = { '.': {}, './popup': {}, './locales/en': {} };

  it('accepts a list that matches the exports', () => {
    expect(entryProblems('dom', ['.', './popup', './locales/en'], exports)).toEqual([]);
  });

  it('names a subpath exported but not declared, and one declared but not exported', () => {
    expect(entryProblems('dom', ['.', './locales/en'], exports)).toEqual([
      'packages/dom exports ./popup, not listed in build.mjs PACKAGES',
    ]);
    expect(entryProblems('core', ['.', './server'], { '.': {} })).toEqual([
      'build.mjs PACKAGES lists ./server for core, not in its package.json exports',
    ]);
  });
});

describe('the dzgrid peers of a published manifest', () => {
  const versions = { '@dzgrid/core': '0.2.0', '@dzgrid/dom': '0.2.0' };
  it('are written as a caret range on the sibling’s version', () => {
    const m = pinPeers({ name: '@dzgrid/angular', peerDependencies: { '@angular/core': '^21.0.0', '@dzgrid/core': '0.0.0', '@dzgrid/dom': 'workspace' } }, versions);
    expect(m.peerDependencies).toEqual({ '@angular/core': '^21.0.0', '@dzgrid/core': '^0.2.0', '@dzgrid/dom': '^0.2.0' });
  });
  it('are refused when they do not accept the sibling’s version', () => {
    expect(peerProblems('angular', { peerDependencies: { '@dzgrid/core': '0.0.0' } }, versions)).toEqual(['packages/angular peer @dzgrid/core is 0.0.0, not ^0.2.0']);
    expect(peerProblems('angular', { peerDependencies: { '@dzgrid/core': '^0.2.0', '@angular/core': '^21.0.0' } }, versions)).toEqual([]);
  });
  it('name a dzgrid package that does not exist', () => {
    expect(peerProblems('dom', { peerDependencies: { '@dzgrid/nope': '^1.0.0' } }, versions)).toEqual(['packages/dom peer @dzgrid/nope is not a workspace package']);
  });
});
