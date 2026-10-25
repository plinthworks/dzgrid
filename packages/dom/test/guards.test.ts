// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkScss, checkSource } from './guards.js';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const THEME = fileURLToPath(new URL('../../theme', import.meta.url));
const PLANTED = fileURLToPath(new URL('./guards/planted', import.meta.url));
const files = (dir: string, ext: RegExp): string[] =>
  !existsSync(dir) ? [] : readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === 'node_modules' || f === 'dist') return [];
    return statSync(p).isDirectory() ? files(p, ext) : ext.test(p) ? [p] : [];
  });

describe('the DOM layer guards', () => {
  for (const f of readdirSync(PLANTED)) {
    const source = readFileSync(join(PLANTED, f), 'utf8');
    const want = /^\/\/ expect: (\S+)/.exec(source)![1]!;
    it(`${want === 'none' ? 'allow' : 'catch'} ${f}`, () => {
      // Planted files pretend to live in src/grid.ts: not dir.ts, not keys/.
      const rules = checkSource(source, 'src/grid.ts').map((x) => x.rule);
      if (want === 'none') expect(rules).toEqual([]);
      else expect(rules).toContain(want);
    });
  }

  it('let dir.ts name sides and keys/ name arrows, and only them', () => {
    expect(checkSource('const x = vp.scrollLeft;', 'src/dir.ts')).toEqual([]);
    expect(checkSource("if (k === 'ArrowLeft') {}", 'src/keys/router.ts')).toEqual([]);
    expect(checkSource("if (k === 'ArrowLeft') {}", 'src/dir.ts')).toEqual([]);
    expect(checkSource('const x = vp.scrollLeft;', 'src/keys/router.ts').map((f) => f.rule)).toEqual(['physical']);
  });

  // Phase 5 step 11b (step11b-plan « The security rules for pasted HTML » 2; owner S11b-Q5): the pasted-HTML reader
  // parses in a document with no browsing context — `parseFromString` there only; every other HTML sink stays refused
  // there too (range-seams.test.ts scans that folder as well).
  it('let range/html/index.ts call parseFromString, and only it, and nothing else of the html rule', () => {
    const parse = "const d = new DOMParser().parseFromString(h, 'text/html');";
    expect(checkSource(parse, 'range/html/index.ts')).toEqual([]);
    expect(checkSource(parse, 'range/index.ts').map((f) => f.rule)).toEqual(['html']);
    expect(checkSource(parse, 'range/html/other.ts').map((f) => f.rule)).toEqual(['html']);
    expect(checkSource('el.innerHTML = h;', 'range/html/index.ts').map((f) => f.rule)).toEqual(['html']);
  });

  it('hold for every source of the DOM layer', () => {
    const found = files(SRC, /\.ts$/).flatMap((f) => checkSource(readFileSync(f, 'utf8'), f.slice(SRC.length + 1)).map((x) => `${f.slice(SRC.length + 1)}:${x.line} ${x.rule} ${x.why}`));
    expect(found).toEqual([]);
  });

  describe('SCSS', () => {
    it('catches colours outside the palette and physical sides', () => {
      const s = ['$tz-palette: (', '  accent: #1274f3,', '  bg: rgb(255 255 255),', ');', '.dzg { color: #000; }', '.dzg-cell { margin-left: 2px; }', '.dzg-x { text-align: right; }', '.dzg-y { inset-inline-start: 0; } // left in a comment'].join('\n');
      expect(checkScss(s).map((f) => `${f.line}:${f.rule}`)).toEqual(['5:colour', '6:physical', '7:physical']);
    });
    it('hold for the theme', () => {
      const found = files(THEME, /\.scss$/).flatMap((f) => checkScss(readFileSync(f, 'utf8')).map((x) => `${f}:${x.line} ${x.rule}`));
      expect(found).toEqual([]);
    });
  });
});

describe('guard details', () => {
  it('report the line of a violation', () => {
    expect(checkSource("// a\nconst x = 1;\ncell.textContent = 'No rows';\n", 'src/grid.ts')).toEqual([expect.objectContaining({ rule: 'literal-text', line: 3 })]);
  });
  it('let translated bundles hold combining marks and the words left and right', () => {
    expect(checkSource("export const AR = { a: 'صَفّ', b: 'Align right' };", 'src/locales/ar.ts')).toEqual([]);
    expect(checkSource("export const AR = { a: '‏' };", 'src/locales/ar.ts').map((f) => f.rule)).toEqual(['invisible']);
  });
});
