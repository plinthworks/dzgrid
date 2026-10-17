import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * The core's promise, enforced by reading its sources with TypeScript's own
 * scanner: no `Date`, no Temporal, no clock, no randomness, no host globals,
 * no package, no dynamic import, and the base never reaching into
 * `enterprise/`. Tokens, not regular expressions: a comment or a string may
 * say anything, and `globalThis.Date` or `const D = Date` cannot hide.
 */
const SRC = fileURLToPath(new URL('../src', import.meta.url));

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(m?ts|tsx|m?js)$/.test(p) ? [p] : [];
  });

/** Identifiers the core may not name, except right after a `.` (a property called `window` is fine). */
const FORBIDDEN_NAMES = new Set([
  'Date', 'Temporal', 'performance', 'globalThis', 'self', 'window', 'document', 'navigator', 'location',
  'localStorage', 'sessionStorage', 'fetch', 'setTimeout', 'setInterval', 'requestAnimationFrame',
  'queueMicrotask', 'process', 'require', 'crypto', 'Worker', 'eval',
  // Cancelling is the host's: the core takes a factory (`createGate(() => new AbortController())`).
  'AbortController', 'AbortSignal',
]);

interface Token { readonly kind: ts.SyntaxKind; readonly text: string }

function tokens(source: string): Token[] {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, /* skipTrivia */ true, ts.LanguageVariant.Standard, source);
  const out: Token[] = [];
  for (let k = scanner.scan(); k !== ts.SyntaxKind.EndOfFileToken; k = scanner.scan()) {
    out.push({ kind: k, text: scanner.getTokenText() });
  }
  return out;
}

/** Every reason a source breaks purity, as short labels. Exported for the self-test below. */
export function violations(source: string, opts: { base: boolean; server?: boolean } = { base: true }): string[] {
  const found: string[] = [];
  const t = tokens(source);
  t.forEach((tok, i) => {
    const prev = t[i - 1];
    const next = t[i + 1];
    const afterDot = prev?.kind === ts.SyntaxKind.DotToken || prev?.kind === ts.SyntaxKind.QuestionDotToken;
    // A declared member or a literal key: `readonly window: …`, `{ window: 1 }`. A ternary's
    // `? window :` is not one — its previous token is `?`.
    const declaredName =
      prev?.kind === ts.SyntaxKind.ReadonlyKeyword ||
      ((next?.kind === ts.SyntaxKind.ColonToken || next?.kind === ts.SyntaxKind.QuestionToken) &&
        (prev?.kind === ts.SyntaxKind.OpenBraceToken || prev?.kind === ts.SyntaxKind.CommaToken || prev?.kind === ts.SyntaxKind.SemicolonToken));
    // Some names are keywords to the scanner (`require`), so compare text on any name-like token.
    const nameLike =
      tok.kind === ts.SyntaxKind.Identifier || (tok.kind >= ts.SyntaxKind.FirstKeyword && tok.kind <= ts.SyntaxKind.LastKeyword);
    if (nameLike && !afterDot && !declaredName && FORBIDDEN_NAMES.has(tok.text)) found.push(tok.text);
    if (tok.kind === ts.SyntaxKind.Identifier && tok.text === 'random' && afterDot && t[i - 2]?.text === 'Math') found.push('Math.random');
    if (tok.kind === ts.SyntaxKind.ImportKeyword && next?.kind === ts.SyntaxKind.OpenParenToken) found.push('import()');
    // A module specifier: the string after `from`, or right after a bare `import`.
    const isSpecifier =
      tok.kind === ts.SyntaxKind.StringLiteral &&
      (prev?.kind === ts.SyntaxKind.FromKeyword || prev?.kind === ts.SyntaxKind.ImportKeyword);
    if (isSpecifier) {
      const spec = tok.text.slice(1, -1);
      if (!spec.startsWith('.')) found.push(`package ${spec}`);
      if (opts.base && /(^|\/)enterprise(\/|$)/.test(spec)) found.push('enterprise import');
      // The base never reaches the server entry: a grid on rows in memory carries none of it.
      if (!opts.server && /(^|\/)server(\.js|\/|$)/.test(spec)) found.push('server import');
    }
  });
  return found;
}

describe('core purity', () => {
  const all = files(SRC);

  it('finds every source', () => {
    expect(all.some((f) => f.endsWith('index.ts'))).toBe(true);
    expect(all.some((f) => f.endsWith('zone-day.ts'))).toBe(true);
  });

  it('names no forbidden global, package or dynamic import', () => {
    const offenders = all.flatMap((f) => {
      const rel = f.slice(SRC.length + 1);
      const v = violations(readFileSync(f, 'utf8'), { base: !rel.startsWith('enterprise'), server: rel === 'server.ts' || rel.startsWith('server/') });
      return v.length ? [`${rel}: ${[...new Set(v)].join(', ')}`] : [];
    });
    expect(offenders).toEqual([]);
  });
});

describe('the purity check itself', () => {
  // A guard that never fires guards nothing: each of these must be caught.
  const planted = [
    'const d = new Date();',
    'const d = Date();',
    'const t = Date.now();',
    'const D = Date; new D();',
    'const d = new globalThis.Date();',
    'const d = Reflect.construct(Date, []);',
    'let d: Date;',
    'const x = y as Date;',
    'if (x instanceof Date) {}',
    'const r = Math.random();',
    'const t = performance.now();',
    'Temporal.Now.instant();',
    'document.body;',
    'self.document;',
    'typeof window;',
    'setTimeout(f, 0);',
    "import x from 'lodash';",
    "import 'side-effect';",
    "const m = await import('./x.js');",
    "const m = require('x');",
    'const s = `${Date.now()}`;',
    "const s = 'a // b'; const d = new Date();",
    "const s = '/* nope'; new Date(); const e = '*/';",
    'new AbortController();',
    'AbortSignal.timeout(1);',
  ];
  for (const source of planted) {
    it(`catches: ${source}`, () => {
      expect(violations(source)).not.toEqual([]);
    });
  }

  it('catches an import of enterprise/ from the base, and only from the base', () => {
    expect(violations("import { g } from './enterprise/grouping/index.js';")).toEqual(['enterprise import']);
    expect(violations("import { g } from '../enterprise';")).toEqual(['enterprise import']);
    expect(violations("import { g } from './enterprise/grouping/index.js';", { base: false })).toEqual([]);
  });

  it('catches an import of the server entry from the base, and only from the base', () => {
    expect(violations("import { createGate } from './server.js';")).toEqual(['server import']);
    expect(violations("import { createGate } from '../server/gate.js';")).toEqual(['server import']);
    expect(violations("import type { AbortHandle } from '../abort.js';", { base: true, server: true })).toEqual([]);
    expect(violations("import { createGate } from './server/gate.js';", { base: true, server: true })).toEqual([]);
  });

  it('lets comments, strings and property names mention anything', () => {
    expect(violations("// new Date() is banned here\n/* Math.random */ const s = 'Date and Temporal';")).toEqual([]);
    expect(violations('interface W { readonly window: number; location?: string } const w = v.window; const d = o.Date; const o2 = { window: 1, fetch: 2 };')).toEqual([]);
  });

  it('still catches a global used in a ternary', () => {
    expect(violations('const x = c ? window : 1;')).toEqual(['window']);
  });
});
