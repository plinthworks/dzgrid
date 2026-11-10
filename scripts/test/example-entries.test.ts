// @vitest-environment node
// The permanent guard (owner, after 1.7.0's typings imported an entry @dzgrid/core does not publish): the real Angular
// example compiles one component importing every published entry of every package, read from the exports maps as npm
// installed them, so a new entry is covered without a list to keep. Written before the code; expectations by hand.
import { describe, it, expect } from 'vitest';
// @ts-expect-error a plain .mjs script
import { entriesSource, publishedEntries } from '../example-lib.mjs';

const MANIFESTS = [
  { name: '@dzgrid/core', exports: { '.': { types: './index.d.ts', default: './index.js' }, './import': { types: './import.d.ts', default: './import.js' }, './package.json': './package.json' } },
  { name: '@dzgrid/theme', exports: { '.': './dzgrid.css', './variables.css': './variables.css', './contrast-pairs.json': './contrast-pairs.json' } },
  { name: '@dzgrid/angular', exports: { '.': { types: './types/dzgrid-angular.d.ts', default: './fesm2022/dzgrid-angular.mjs' }, './package.json': { default: './package.json' } } },
  { name: '@dzgrid/element', exports: { './define': { import: { types: './define.d.ts', default: './define.js' } } } },
];

describe('the published entries of the installed packages', () => {
  it('typed entries as specifiers (nested conditions too); the others as files that must exist; package.json left out', () => {
    expect(publishedEntries(MANIFESTS)).toEqual({
      typed: ['@dzgrid/core', '@dzgrid/core/import', '@dzgrid/angular', '@dzgrid/element/define'],
      files: [
        { entry: '@dzgrid/theme', file: '@dzgrid/theme/dzgrid.css' },
        { entry: '@dzgrid/theme/variables.css', file: '@dzgrid/theme/variables.css' },
        { entry: '@dzgrid/theme/contrast-pairs.json', file: '@dzgrid/theme/contrast-pairs.json' },
      ],
    });
  });

  it('one component imports each typed entry and uses <dz-grid> in its template (strict templates read it)', () => {
    const src = entriesSource(['@dzgrid/core', '@dzgrid/angular', '@dzgrid/element/define']);
    expect(src).toContain(`import * as e0 from '@dzgrid/core';`);
    expect(src).toContain(`import * as e1 from '@dzgrid/angular';`);
    expect(src).toContain(`import * as e2 from '@dzgrid/element/define';`);
    expect(src).toContain(`import { DzGrid } from '@dzgrid/angular';`);
    expect(src).toMatch(/imports: \[DzGrid\]/);
    expect(src).toContain('<dz-grid');
    expect(src).toMatch(/readonly entries: readonly object\[\] = \[e0, e1, e2\];/);
  });
});

describe('wired', () => {
  it('release:check runs the entries check after the example build; the example installs the five packages', async () => {
    const { readFileSync } = await import('node:fs');
    const root = new URL('../../', import.meta.url);
    const check = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).scripts['release:check'] as string;
    expect(check.indexOf('example.mjs entries')).toBeGreaterThan(check.indexOf('example.mjs build'));
    expect(check.indexOf('example.mjs entries')).toBeLessThan(check.indexOf('release.mjs check'));
    const deps = Object.keys(JSON.parse(readFileSync(new URL('examples/angular-audit/package.json', root), 'utf8')).dependencies).filter((d) => d.startsWith('@dzgrid/'));
    expect(deps.sort()).toEqual(['@dzgrid/angular', '@dzgrid/core', '@dzgrid/dom', '@dzgrid/element', '@dzgrid/theme']);
  });
});
