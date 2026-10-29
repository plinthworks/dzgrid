// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error a plain .mjs script
import { baselineFile, breaks, compatible, format, parse, PACKAGES } from '../api.mjs';

/**
 * The public type surface guard (scripts/api.mjs, `npm run check:api`). The comparison is text, so
 * what it lets through is pinned here, case by case: additions pass, removals and narrowing fail.
 */
describe('api.mjs, what counts as a compatible change', () => {
  const iface = (...members: string[]) => ['export interface Opts {', ...members.map((m) => `    ${m}`), '}'].join('\n');

  it('passes an optional member added, fails a required one', () => {
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
      expect(history[0]).toMatch(/^1\.0\.0 as published on npm/);
      expect(Object.keys(surface).length).toBeGreaterThan(0);
    }
  });
});
