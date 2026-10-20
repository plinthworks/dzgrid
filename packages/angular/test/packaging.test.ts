// @vitest-environment node
/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A package must reach its neighbours by name (from tzslot).
 *
 * A single `'../../dom/src/index.js'` pulled the whole DOM package into the
 * Angular library's compilation and crashed ng-packagr with a message about
 * `referencedFiles` that named nothing. The tests stayed green throughout,
 * because vitest resolves either spelling happily.
 *
 * Unlike tzslot's, the sources here sit in subfolders, so the walk is
 * recursive and each relative specifier is resolved against its own file
 * rather than matched by its spelling.
 */
const packages = fileURLToPath(new URL('../..', import.meta.url));
const NAMES = ['core', 'dom', 'angular'];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

/** `from '…'`, `import '…'` and `import('…')`, relative specifiers only. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]*)['"]/g;

/** Each relative import that lands in another package, as `file -> target`. */
function reaching(name: string): string[] {
  const own = join(packages, name) + sep;
  return walk(join(packages, name, 'src')).flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(SPECIFIER)]
      .map((m) => resolve(dirname(file), m[1]!))
      .filter((target) => target.startsWith(packages) && !target.startsWith(own))
      .map((target) => `${relative(packages, file)} -> ${relative(packages, target)}`),
  );
}

describe('how the packages reach each other', () => {
  it('by name, never by a path into another package', () => {
    expect(NAMES.flatMap(reaching)).toEqual([]);
  });

  it('the check sees every package it names, the Angular one included', () => {
    // A package missing from disk would make the check above pass on nothing.
    for (const name of NAMES) expect(walk(join(packages, name, 'src')).length, name).toBeGreaterThan(0);
  });

  it('catches a planted violation, nested or not', () => {
    const specifiers = (text: string) => [...text.matchAll(SPECIFIER)].map((m) => m[1]);
    expect(specifiers(`import { x } from '../../dom/src/index.js';`)).toEqual(['../../dom/src/index.js']);
    expect(specifiers(`export * from "../../../core/src/a.js";`)).toEqual(['../../../core/src/a.js']);
    expect(specifiers(`const m = import('../../core/src/b.js');`)).toEqual(['../../core/src/b.js']);
    expect(specifiers(`import '../../theme/dzgrid.css';`)).toEqual(['../../theme/dzgrid.css']);
    expect(specifiers(`import { y } from '@dzgrid/core';`)).toEqual([]);
    // And the resolution decides, not the spelling: inside dom/src/render, `../../core` leaves the package…
    const from = join(packages, 'dom', 'src', 'render', 'x.ts');
    expect(resolve(dirname(from), '../../../core/src/a.js').startsWith(join(packages, 'dom') + sep)).toBe(false);
    // …while `../keys/a.js` stays inside it.
    expect(resolve(dirname(from), '../keys/a.js').startsWith(join(packages, 'dom') + sep)).toBe(true);
  });
});

describe('the Angular package’s manifest and public API (step 22)', () => {
  const manifest = JSON.parse(readFileSync(join(packages, 'angular', 'package.json'), 'utf8'));

  it('peers on Angular 19 to 22 (owner Q3), the DOM layer and the core; no runtime dependency', () => {
    const angular = '^19.0.0 || ^20.0.0 || ^21.0.0 || ^22.0.0';
    expect(manifest.peerDependencies['@angular/core']).toBe(angular);
    expect(manifest.peerDependencies['@angular/common']).toBe(angular);
    // tzslot stays an optional peer (the date filters' kits, through @dzgrid/dom/filters); every other peer is required.
    const required = Object.keys(manifest.peerDependencies).filter((k) => !manifest.peerDependenciesMeta?.[k]?.optional).sort();
    expect(required).toEqual(['@angular/common', '@angular/core', '@dzgrid/core', '@dzgrid/dom']);
    expect(manifest.dependencies).toBeUndefined();
  });

  it('declares real exports', () => {
    expect(manifest.exports['.']).toEqual({ types: './src/index.ts', default: './src/index.ts' });
  });

  it('exports what the behaviour sheet names, and the probe is gone', async () => {
    const api = await import('@dzgrid/angular');
    expect(Object.keys(api).sort()).toEqual([
      'DZGRID_ANGULAR_VERSION', 'DZG_DEFAULTS', 'DZG_ENV', 'DZG_MESSAGES', 'DZG_PARTS',
      'DzGrid', 'DzgController', 'DzgExport', 'DzgPart', 'DzgSearch', 'componentPart', 'fromObservable', 'provideDzGrid',
    ]);
  });

  it('keeps every Angular import out of the pure registry helpers (the conformance runner loads them in node)', () => {
    const text = readFileSync(join(packages, 'angular', 'src', 'shadow.ts'), 'utf8');
    expect(text).not.toMatch(/@angular\//);
  });
});
