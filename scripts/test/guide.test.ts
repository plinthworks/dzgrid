// @vitest-environment node
// Phase 11 L6: the guide in docs/guide/ can be trusted. Its samples compile (ngc, strict templates, against the
// sources the packages publish), every DzGrid name it uses is in the accepted surface (api/*.api.txt), its links lead
// somewhere, and llms.txt / llms-full.txt are what scripts/llms.mjs makes of it today.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error a plain .mjs script
import { build, index, absolute } from '../llms.mjs';
// @ts-expect-error a plain .mjs script
import { parse } from '../api.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const GUIDE = join(ROOT, 'docs/guide');
const pages = readdirSync(GUIDE).filter((f) => f.endsWith('.md')).sort();
const text = (f: string) => readFileSync(join(GUIDE, f), 'utf8');

type Block = { page: string; n: number; lang: string; code: string };
/** The fenced blocks of a page, with their language. */
export function blocks(page: string, md: string): Block[] {
  const out: Block[] = [];
  let n = 0;
  for (const m of md.matchAll(/^```(\w*)\n([\s\S]*?)^```$/gm)) out.push({ page, n: n++, lang: m[1]!, code: m[2]! });
  return out;
}
const all = pages.flatMap((p) => blocks(p, text(p)));
/** What TypeScript compiles: `ts` blocks, and the module scripts of `html` blocks (as JavaScript). */
const scripts = (b: Block) => [...b.code.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]!);

/** The accepted surface: entry → export names, and every declaration's text. */
const surface: Record<string, Record<string, string>> = {};
for (const f of readdirSync(join(ROOT, 'api'))) Object.assign(surface, parse(readFileSync(join(ROOT, 'api', f), 'utf8')).surface);
const declared = Object.values(surface).flatMap((e) => Object.values(e)).join('\n');
const themeFiles = new Set(readdirSync(join(ROOT, 'packages/theme')).filter((f) => f.endsWith('.css')));

/** `import { a, type B, c as d } from '@dzgrid/x'` → [entry, name] pairs. */
export function imported(code: string): [string, string][] {
  return [...code.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'(@dzgrid\/[^']+)'/g)].flatMap((m) =>
    m[1]!.split(',').map((s) => s.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]!).filter(Boolean).map((n) => [m[2]!, n] as [string, string]),
  );
}
/** A `@dzgrid/...` specifier that names a real entry (or a theme sheet). */
const entryExists = (spec: string) =>
  spec in surface || spec === '@dzgrid/theme' || (spec.startsWith('@dzgrid/theme/') && themeFiles.has(spec.slice('@dzgrid/theme/'.length)));

describe('the guide', () => {
  it('has the pages its index lists, and lists every page', () => {
    const listed = index(text('README.md')).flatMap((s: { pages: { file: string }[] }) => s.pages.map((p) => p.file)).sort();
    expect(listed).toEqual(pages.filter((p) => p !== 'README.md'));
    expect(listed.length).toBeGreaterThanOrEqual(17);
  });

  it('every relative link leads to a file or folder of the repository', () => {
    const broken: string[] = [];
    for (const p of pages) {
      for (const m of text(p).replace(/^```[\s\S]*?^```$/gm, '').matchAll(/\]\((?!https?:|#|mailto:)([^)\s#]+)(#[^)]*)?\)/g)) {
        if (!existsSync(join(GUIDE, m[1]!))) broken.push(`${p} → ${m[1]}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('every DzGrid name a sample imports is in api/*.api.txt, under that entry', () => {
    const missing: string[] = [];
    for (const b of all) {
      const code = b.lang === 'html' ? scripts(b).join('\n') : b.code;
      for (const [entry, name] of imported(code)) if (!(name in (surface[entry] ?? {}))) missing.push(`${b.page}#${b.n}: ${entry}#${name}`);
    }
    expect(missing).toEqual([]);
  });

  it('every entry named, in a sample or in the text, exists', () => {
    const missing = new Set<string>();
    for (const p of pages) {
      for (const m of text(p).matchAll(/['`"](@dzgrid\/[\w./-]+?)['`"]/g)) if (!entryExists(m[1]!)) missing.add(`${p}: ${m[1]}`);
    }
    expect([...missing]).toEqual([]);
  });

  it('every function or method the text names, as `name(…)`, is declared in api/*.api.txt', () => {
    // Not DzGrid's: the platform's and the frameworks' own.
    const OTHERS = new Set(['fetch', 'querySelector', 'addEventListener', 'input', 'signal', 'computed', 'inject', 'print', 'getTime']);
    const missing = new Set<string>();
    for (const p of pages) {
      const prose = text(p).replace(/^```[\s\S]*?^```$/gm, '');
      for (const m of prose.matchAll(/`(?:[\w.?]+\.)?([a-z][A-Za-z]*)\(/g)) {
        const name = m[1]!;
        if (OTHERS.has(name) && !declared.includes(`${name}(`)) continue;
        // A function, a method, or a member that holds one (`readonly cellClass?: (c) => …`).
        if (!new RegExp(`(^|[^\\w$])${name}(\\?)?(<[^>]*>)?\\(|^## ${name}$|(^|[^\\w$])${name}\\??: `, 'm').test(declared)) missing.add(`${p}: ${name}`);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('every `<dz-grid>` output an Angular sample binds exists on the component', () => {
    const dzGrid = surface['@dzgrid/angular']!['DzGrid']!;
    const missing: string[] = [];
    for (const b of all.filter((x) => x.lang === 'ts')) {
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

  it('every `dzg-*` event the text names is a grid event (or the element\'s own `dzg-ready`)', () => {
    const events = new Set([...declared.matchAll(/readonly type: '(\w+)'/g)].map((m) => m[1]!));
    const missing = new Set<string>();
    for (const p of pages) {
      for (const m of text(p).matchAll(/\bdzg-([a-z]+(?:-[a-z]+)*)\b/g)) {
        const camel = m[1]!.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
        if (/^(cell|row|hcell|nested)$/.test(m[1]!)) continue; // CSS classes (`.dzg-cell`), not events
        if (camel !== 'ready' && !events.has(camel) && p.includes('element')) missing.add(`${p}: dzg-${m[1]}`);
      }
    }
    expect([...missing]).toEqual([]);
  });

  // 1.10.1: `filters-base` gives a day or instant column no filter (filter-ui.md « Without tzslot »); a page that
  // offers it in its text says so, never « the same functions ».
  it('every page that offers `@dzgrid/dom/filters-base` in its text says a day column gets no filter there', () => {
    const prose = (f: string) => text(f).replace(/^```\w*\n[\s\S]*?^```$/gm, '');
    const offering = pages.filter((p) => prose(p).includes('`@dzgrid/dom/filters-base`'));
    expect(offering.length).toBeGreaterThan(0);
    expect(offering.filter((p) => !/day[^.]*\*\*no filter\*\*/.test(prose(p).replace(/\s+/g, ' ')) || /the same functions/.test(prose(p)))).toEqual([]);
  });

  it('llms.txt and llms-full.txt are what scripts/llms.mjs makes of the guide (node scripts/llms.mjs)', () => {
    const out = build(ROOT) as Record<string, string>;
    for (const [file, made] of Object.entries(out)) expect(readFileSync(join(ROOT, file), 'utf8'), file).toBe(made);
    // The short index stays short; the full one holds every page.
    expect(Buffer.byteLength(out['llms.txt']!)).toBeLessThan(8_000);
    for (const p of pages.filter((x) => x !== 'README.md')) expect(out['llms-full.txt']).toContain(`<!-- docs/guide/${p} -->`);
    expect(absolute('[a](columns.md#x) [b](../behaviors) [c](https://e.org)')).toBe(
      '[a](https://github.com/plinthworks/dzgrid/blob/main/docs/guide/columns.md#x) [b](https://github.com/plinthworks/dzgrid/blob/main/docs/behaviors) [c](https://e.org)',
    );
  });

  it('every sample compiles: ngc with strict templates over each block, as its own module', { timeout: 300_000 }, () => {
    const DIR = join(ROOT, 'node_modules/.cache/dzgrid-guide-samples');
    rmSync(DIR, { recursive: true, force: true });
    mkdirSync(DIR, { recursive: true });
    const files: string[] = [];
    for (const b of all) {
      const base = `${b.page.replace(/\.md$/, '')}-${b.n}`;
      if (b.lang === 'ts') files.push(join(DIR, `${base}.ts`)), writeFileSync(files.at(-1)!, b.code);
      else if (b.lang === 'html') scripts(b).forEach((s, i) => { files.push(join(DIR, `${base}-${i}.js`)); writeFileSync(files.at(-1)!, s); });
    }
    expect(files.length).toBeGreaterThan(20);
    writeFileSync(join(DIR, 'tsconfig.json'), JSON.stringify({
      extends: join(ROOT, 'packages/angular/tsconfig.spec.json'),
      compilerOptions: { allowJs: true, checkJs: false, noUnusedLocals: false, types: ['node'] },
      include: files, exclude: [],
    }));
    const r = spawnSync(process.execPath, [join(ROOT, 'node_modules/@angular/compiler-cli/bundles/src/bin/ngc.js'), '-p', join(DIR, 'tsconfig.json'), '--noEmit'], { cwd: ROOT, encoding: 'utf8' });
    const out = `${r.stdout}${r.stderr}`.replace(/\x1b\[[0-9;]*m/g, '').replaceAll(`${DIR}/`, '');
    rmSync(DIR, { recursive: true, force: true });
    expect(out.trim()).toBe('');
    expect(r.status).toBe(0);
    expect(dirname(DIR)).toContain('.cache');
  });
});
