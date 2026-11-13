// @vitest-environment node
/**
 * The site's examples can be trusted (owner, 2026-11-10: every example compiled, strict, as the guide's are):
 * every code block of every page, in both languages — in the tabs (TypeScript, Angular, Web Component) and out of
 * them — compiles with ngc and strict templates against the sources the packages publish; every DzGrid name it
 * imports is in the accepted surface (api/*.api.txt); every function the prose names exists. A tab holds code to
 * compile (or an install line); a block in a language the test does not know is an error, not skipped.
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error a plain .mjs script
import { parse } from '../../scripts/api.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DOCS = join(ROOT, 'website/src/content/docs');
/** Compiled: `ts` whole, `html` by its module scripts (as JavaScript). Not code: install lines, CSS, JSON. */
const NOT_CODE = new Set(['sh', 'bash', 'css', 'json', 'text']);
const SLOTS = new Set(['ts', 'angular', 'element']);

function pages(dir = DOCS): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? pages(p) : /\.mdx?$/.test(f) ? [p] : [];
  });
}

type Block = { page: string; n: number; lang: string; code: string };
/** The fenced blocks of a page (MDX or Markdown), with their language. */
export function blocks(page: string, text: string): Block[] {
  return [...text.matchAll(/^```(\w*)[^\n]*\n([\s\S]*?)^```$/gm)].map((m, n) => ({ page, n, lang: m[1]!, code: m[2]! }));
}
/** The module scripts of an `html` block. */
const scripts = (code: string) => [...code.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
/** `import { a, type B, c as d } from '@dzgrid/x'` → [entry, name] pairs. */
export function imported(code: string): [string, string][] {
  return [...code.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'(@dzgrid\/[^']+)'/g)].flatMap((m) =>
    m[1]!.split(',').map((s) => s.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]!).filter(Boolean).map((n) => [m[2]!, n] as [string, string]),
  );
}

// The API reference (api/, made by scripts/gen-api.mjs) holds declarations, not programs: api.test.ts checks it.
const files = pages()
  .map((p) => ({ page: relative(DOCS, p), text: readFileSync(p, 'utf8') }))
  .filter((f) => !/^(fr\/)?api\//.test(f.page));
const all = files.flatMap((f) => blocks(f.page, f.text));
const surface: Record<string, Record<string, string>> = {};
for (const f of readdirSync(join(ROOT, 'api'))) Object.assign(surface, parse(readFileSync(join(ROOT, 'api', f), 'utf8')).surface);
const declared = Object.values(surface).flatMap((e) => Object.values(e)).join('\n');
/**
 * A French or Arabic bundle whose English twin is in the surface: `@dzgrid/dom/locales/fr-totals#FR_TOTALS` stands for
 * `en-totals#EN_TOTALS` (api/*.api.txt holds the English names the guide documented; the twins ship beside them).
 */
const twin = (entry: string, name?: string): [string, string | undefined] | null => {
  const m = /^@dzgrid\/dom\/locales\/(fr|ar)(-[\w-]+)?$/.exec(entry);
  if (!m) return null;
  return [`@dzgrid/dom/locales/en${m[2] ?? ''}`, name?.replace(/^(FR|AR)(?=_|$)/, 'EN')];
};
const has = (entry: string, name: string) => {
  if (name in (surface[entry] ?? {})) return true;
  const t = twin(entry, name);
  return !!t && t[1]! in (surface[t[0]] ?? {}) && existsSync(join(ROOT, 'packages/dom/src/locales', `${entry.split('/').pop()}.ts`));
};
const themeFiles = new Set(readdirSync(join(ROOT, 'packages/theme')).filter((f) => f.endsWith('.css')));
const entryExists = (spec: string) =>
  spec in surface ||
  (!!twin(spec) && twin(spec)![0] in surface && existsSync(join(ROOT, 'packages/dom/src/locales', `${spec.split('/').pop()}.ts`))) || spec === '@dzgrid/theme' || (spec.startsWith('@dzgrid/theme/') && themeFiles.has(spec.slice('@dzgrid/theme/'.length)));

describe('the site’s examples', () => {
  it('finds them, with their language', () => {
    expect(blocks('x', 'a\n```ts\nconst a = 1;\n```\n\n```sh title="b"\nnpm i\n```\n')).toEqual([
      { page: 'x', n: 0, lang: 'ts', code: 'const a = 1;\n' },
      { page: 'x', n: 1, lang: 'sh', code: 'npm i\n' },
    ]);
    expect(imported("import { a, type B, c as d } from '@dzgrid/dom';")).toEqual([['@dzgrid/dom', 'a'], ['@dzgrid/dom', 'B'], ['@dzgrid/dom', 'c']]);
    expect(all.filter((b) => b.lang === 'ts').length).toBeGreaterThan(20);
  });

  it('every block is in a language the test knows', () => {
    expect(all.filter((b) => !['ts', 'html', ...NOT_CODE].includes(b.lang)).map((b) => `${b.page}#${b.n}: ${b.lang || '(none)'}`)).toEqual([]);
  });

  it('every tab is a known flavour and holds code to compile, or an install line', () => {
    const wrong: string[] = [];
    for (const f of files) {
      for (const m of f.text.matchAll(/<Fragment slot="(\w+)">([\s\S]*?)<\/Fragment>/g)) {
        const [, slot, body] = m;
        if (!SLOTS.has(slot!)) wrong.push(`${f.page}: tab ${slot}`);
        const inside = blocks(f.page, body!);
        if (!inside.some((b) => b.lang === 'ts' || (b.lang === 'html' && scripts(b.code).length) || b.lang === 'sh')) wrong.push(`${f.page}: a ${slot} tab with nothing to compile`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('every DzGrid name an example imports is in api/*.api.txt, under that entry', () => {
    const missing: string[] = [];
    for (const b of all) {
      const code = b.lang === 'html' ? scripts(b.code).join('\n') : b.code;
      for (const [entry, name] of imported(code)) if (!has(entry, name)) missing.push(`${b.page}#${b.n}: ${entry}#${name}`);
    }
    expect(missing).toEqual([]);
  });

  it('every entry named, in an example or in the text, exists', () => {
    const missing = new Set<string>();
    for (const f of files) for (const m of f.text.matchAll(/['`"](@dzgrid\/[\w./-]+?)['`"]/g)) if (!entryExists(m[1]!)) missing.add(`${f.page}: ${m[1]}`);
    expect([...missing]).toEqual([]);
  });

  it('every function or method the text names, as `name(…)`, is declared in api/*.api.txt', () => {
    // Not DzGrid's: the platform's and the frameworks' own.
    const OTHERS = new Set(['fetch', 'querySelector', 'addEventListener', 'input', 'signal', 'computed', 'inject', 'print', 'getTime']);
    const missing = new Set<string>();
    for (const f of files) {
      const prose = f.text.replace(/^```[\s\S]*?^```$/gm, '');
      for (const m of prose.matchAll(/`(?:[\w.?]+\.)?([a-z][A-Za-z]*)\(/g)) {
        const name = m[1]!;
        if (OTHERS.has(name)) continue;
        // A type parameter list may hold one nested `<…>` (autoColumns' `= ColumnDef<T>`, 1.12.0).
        if (!new RegExp(`(^|[^\\w$])${name}(\\?)?(<(?:[^<>]|<[^<>]*>)*>)?\\(|^## ${name}$|(^|[^\\w$])${name}\\??: `, 'm').test(declared)) missing.add(`${f.page}: ${name}`);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('every `<dz-grid>` output an Angular example binds exists on the component', () => {
    const dzGrid = surface['@dzgrid/angular']!['DzGrid']!;
    const missing: string[] = [];
    for (const b of all.filter((x) => x.lang === 'ts' && x.code.includes("'@angular/core'"))) {
      for (const tag of b.code.matchAll(/<dz-grid\b([\s\S]*?)\/?>/g)) {
        for (const o of tag[1]!.matchAll(/\((\w+)\)=/g)) {
          const name = o[1]!;
          const model = name.endsWith('Change') && dzGrid.includes(`readonly ${name.slice(0, -6)}: _angular_core.ModelSignal`);
          if (!model && !new RegExp(`readonly ${name}: (_angular_core\\.)?OutputEmitterRef`).test(dzGrid)) missing.push(`${b.page}#${b.n}: (${name})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('every example compiles: ngc with strict templates over each block, as its own module', { timeout: 300_000 }, () => {
    const DIR = join(ROOT, 'node_modules/.cache/dzgrid-site-examples');
    rmSync(DIR, { recursive: true, force: true });
    mkdirSync(DIR, { recursive: true });
    // The same code in English and French is compiled once.
    const seen = new Map<string, string>();
    for (const b of all) {
      const sources = b.lang === 'ts' ? [{ ext: 'ts', code: b.code }] : b.lang === 'html' ? scripts(b.code).map((code) => ({ ext: 'js', code })) : [];
      for (const s of sources) {
        const hash = createHash('sha256').update(s.code).digest('hex').slice(0, 12);
        if (seen.has(hash)) continue;
        const file = join(DIR, `${b.page.replace(/\.mdx?$/, '').replace(/\//g, '_')}-${b.n}-${hash}.${s.ext}`);
        // A module each: an example's names never meet another's.
        writeFileSync(file, s.ext === 'ts' ? `${s.code}\nexport {};\n` : s.code);
        seen.set(hash, file);
      }
    }
    const list = [...seen.values()];
    expect(list.length).toBeGreaterThan(20);
    writeFileSync(join(DIR, 'tsconfig.json'), JSON.stringify({
      extends: join(ROOT, 'packages/angular/tsconfig.spec.json'),
      compilerOptions: { allowJs: true, checkJs: false, noUnusedLocals: false, types: ['node'] },
      include: list, exclude: [],
    }));
    const r = spawnSync(process.execPath, [join(ROOT, 'node_modules/@angular/compiler-cli/bundles/src/bin/ngc.js'), '-p', join(DIR, 'tsconfig.json'), '--noEmit'], { cwd: ROOT, encoding: 'utf8' });
    const out = `${r.stdout}${r.stderr}`.replace(/\x1b\[[0-9;]*m/g, '').replaceAll(`${DIR}/`, '');
    rmSync(DIR, { recursive: true, force: true });
    expect(out.trim()).toBe('');
    expect(r.status).toBe(0);
    expect(dirname(DIR)).toContain('.cache');
  });
});
