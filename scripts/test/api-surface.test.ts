// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error a plain .mjs script
import { baselineFile, breaks, compatible, format, parse, PACKAGES } from '../api.mjs';

/**
 * The public type surface guard (scripts/api.mjs, `npm run check:api`). The comparison is text, so
 * what it lets through is pinned here, case by case: additions pass, removals and narrowing fail.
 */
describe('api.mjs, what counts as a compatible change', () => {
  const iface = (...members: string[]) => ['export interface Opts {', ...members.map((m) => `    ${m}`), '}'].join('\n');

  it('passes an optional member added, fails a required one', () => {
    // 1.4.0: the printer may list a union's members in another order (the same type); a member added in front widens.
    expect(compatible(iface('readonly n: X<"locale" | "latn" | undefined>;'), iface('readonly n: X<"latn" | "locale" | undefined>;'))).toBe(true);
    expect(compatible(iface('readonly c: X<readonly A<T>[]>;'), iface('readonly c: X<B<T> | readonly A<T>[]>;'))).toBe(true);
    expect(compatible(iface('readonly n: X<"locale" | "latn" | undefined>;'), iface('readonly n: X<"latn" | undefined>;'))).toBe(false);
    expect(compatible(iface('readonly c: X<readonly A<T>[]>;'), iface('readonly c: X<B<T>>;'))).toBe(false);
    expect(compatible(iface('readonly a: string;'), iface('readonly a: string;', 'readonly b?: number;'))).toBe(true);
    expect(compatible(iface('readonly a: string;'), iface('readonly a: string;', 'readonly b: number;'))).toBe(false);
  });

  it('fails a member removed or retyped', () => {
    expect(compatible(iface('readonly a: string;', 'readonly b?: number;'), iface('readonly a: string;'))).toBe(false);
    expect(compatible(iface('readonly a: string;'), iface('readonly a: number;'))).toBe(false);
    expect(compatible(iface('readonly a?: string;'), iface('readonly a: string;'))).toBe(false);
  });

  it('fails an inline option removed from a function (the treeConflicts case)', () => {
    const before = 'export declare function f(o: {\n    readonly spans?: boolean;\n    readonly page?: boolean;\n}): Problem[];';
    const after = 'export declare function f(o: {\n    readonly page?: boolean;\n}): Problem[];';
    expect(compatible(before, after)).toBe(false);
    expect(compatible(after, before)).toBe(true);
  });

  it('passes union members added, but not null or undefined', () => {
    expect(compatible("export type Code = 'a' | 'b';", "export type Code = 'a' | 'c' | 'b';")).toBe(true);
    expect(compatible("export type Code = 'a' | 'b';", "export type Code = 'a' | 'b' | 'c';")).toBe(true);
    expect(compatible("export type Code = 'a' | 'b';", "export type Code = 'a';")).toBe(false);
    expect(compatible('export declare function g(): Row | undefined;', 'export declare function g(): Row | null | undefined;')).toBe(false);
  });

  it('passes an optional parameter added, fails a required one', () => {
    expect(compatible('export declare function g(a: string): void;', 'export declare function g(a: string, b?: number): void;')).toBe(true);
    expect(compatible('export declare function g(): void;', 'export declare function g(b?: number): void;')).toBe(true);
    expect(compatible('export declare function g(a: string): void;', 'export declare function g(a: string, b: number): void;')).toBe(false);
  });

  it('passes any member added to a class, fails one removed', () => {
    const cls = (...m: string[]) => ['declare class Grid {', ...m.map((x) => `    ${x}`), '}'].join('\n');
    expect(compatible(cls('rows(): void;'), cls('rows(): void;', 'reset(): void;'))).toBe(true);
    expect(compatible(cls('rows(): void;', 'reset(): void;'), cls('rows(): void;'))).toBe(false);
  });

  it('passes a version stamp moving', () => {
    expect(compatible('declare const V = "1.0.0";', 'declare const V = "1.1.0";')).toBe(true);
  });

  it('reports an export or an entry gone', () => {
    const accepted = { '@x/a': { f: 'export declare function f(): void;', g: 'export declare function g(): void;' }, '@x/b': { h: 'export type H = 1;' } };
    const current = { '@x/a': { f: 'export declare function f(): void;', n: 'export type N = 2;' } };
    expect(breaks(accepted, current).map((b: { entry: string; name: string; kind: string }) => `${b.entry}#${b.name} ${b.kind}`)).toEqual(['@x/a#g removed', '@x/b#* entry removed']);
  });

  it('reads back what it writes', () => {
    const surface = { '@x/a': { f: 'export declare function f(o: {\n    readonly a?: string;\n}): void;' } };
    expect(parse(format(surface, ['first']))).toEqual({ surface, history: ['first'] });
  });

  it('has a baseline for each package, with its history', () => {
    for (const name of PACKAGES) {
      const { surface, history } = parse(readFileSync(baselineFile(name), 'utf8'));
      // `@dzgrid/element` arrived after 1.0.0 (Phase 11 L7): its baseline starts with the new package; `@dzgrid/theme`'s
      // (stylesheets, entries only) with the 1.11.0 extension to every published entry.
      const first = { element: /^1\.8\.0 new package/, theme: /^owner 2026-11-10: baseline extended to every published entry$/ }[name as string];
      expect(history[0]).toMatch(first ?? /^1\.0\.0 as published on npm/);
      expect(Object.keys(surface).length).toBeGreaterThan(0);
    }
  });

  // 1.11.0 (owner 2026-11-10, « C »): the baselines had no section for entries published after they were written
  // (the French and Arabic locale bundles, some DOM entries) and missed inputs of the Angular component, so
  // `check:api` did not guard them. Every entry of every package's exports map has a section; a new one fails
  // here until the owner accepts it.
  it('has a section for every published entry of every package', () => {
    const root = new URL('../..', import.meta.url).pathname;
    const missing: string[] = [];
    for (const name of ['core', 'dom', 'theme', 'angular', 'element']) {
      expect(PACKAGES).toContain(name);
      const manifest = JSON.parse(readFileSync(join(root, 'packages', name, 'package.json'), 'utf8')) as { name: string; exports: Record<string, unknown> };
      const { surface } = parse(readFileSync(baselineFile(name), 'utf8'));
      for (const key of Object.keys(manifest.exports)) {
        if (key === './package.json' || key === './internal') continue;
        const entry = key === '.' ? manifest.name : manifest.name + key.slice(1);
        if (!(entry in surface)) missing.push(entry);
      }
    }
    expect(missing).toEqual([]);
  });

  it('records every input, model and output of the Angular component', () => {
    const source = readFileSync(new URL('../../packages/angular/src/grid.ts', import.meta.url), 'utf8');
    const members = [...source.matchAll(/^\s*readonly (\w+) = (?:input|model|output)\b/gm)].map((m) => m[1]);
    expect(members.length).toBeGreaterThan(40);
    const text: string = parse(readFileSync(baselineFile('angular'), 'utf8')).surface['@dzgrid/angular'].DzGrid;
    expect(members.filter((m) => !text.includes(`readonly ${m}: `))).toEqual([]);
  });
});
