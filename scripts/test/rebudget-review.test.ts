// @vitest-environment node
// Review of step 25: tests that kill the surviving mutants of rebudget.mjs and manifest.mjs, and
// `it.fails` repros of the bugs found (each turns green once fixed: flip it to `it`).
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// @ts-expect-error a plain .mjs script
import { sizeBudget, rebudgetSizes, parseSizeOutput, browserBudget, parseBenchOutput, medianOfRuns, nodeTimeBudget, BROWSER_CEILINGS, ceilingFor } from '../rebudget.mjs';
// @ts-expect-error a plain .mjs script
import { mapProblems, repositoryProblems } from '../manifest.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/rebudget.mjs');
const tmp = () => mkdtempSync(join(tmpdir(), 'dzg-rebudget-review-'));
const run = (args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

describe('rebudgetSizes at the Phase 6 close: no line rises without a written grant', () => {
  it('an entry without a ceiling keeps its line as its ceiling (popup 1 650, measured 1 626: not 1 800); below, it is lowered to the measure + 10 %', () => {
    const { budget, rows } = rebudgetSizes({ entries: { held: { file: 'h.ts', maxGzip: 1650 }, low: { file: 'l.ts', maxGzip: 3550 } } }, { held: 1626, low: 3132 }, { date: '2026-10-28' });
    expect(budget.entries.held.maxGzip).toBe(1650);
    expect(budget.entries.low.maxGzip).toBe(3450);
    expect(rows.map((r: { next: number }) => r.next)).toEqual([1650, 3450]);
  });

  it('an entry over its own line (no ceiling) is refused, never written', () => {
    expect(() => rebudgetSizes({ entries: { x: { file: 'x.ts', maxGzip: 1000 } } }, { x: 1001 }, { date: '2026-10-28' })).toThrow(/ceiling/);
  });

  it('a written grant above the line still lets the line rise to it (columns 4 100 → 4 200, owner Q6-6)', () => {
    const { budget } = rebudgetSizes({ entries: { '@dzgrid/dom/columns': { file: 'c.ts', maxGzip: 4100 } } }, { '@dzgrid/dom/columns': 3988 }, { date: '2026-10-28' });
    expect(budget.entries['@dzgrid/dom/columns'].maxGzip).toBe(4200);
  });
});

describe('rebudgetSizes: documents and entries the tests did not cover', () => {
  it('an entry with no maxGzip key at all is kept untouched, like maxGzip null (kills M4)', () => {
    const { budget, rows } = rebudgetSizes({ entries: { kit: { files: ['x.ts'] } } }, { kit: 36394 }, { date: '2026-10-21' });
    expect(budget.entries.kit).toEqual({ files: ['x.ts'] });
    expect(rows).toEqual([]);
  });

  it('a document without $comment gets none (kills M5)', () => {
    const { budget } = rebudgetSizes({ entries: { a: { file: 'a.ts', maxGzip: 100 } } }, { a: 90 }, { date: '2026-10-21' });
    expect('$comment' in budget).toBe(false);
  });
});

describe('medianOfRuns: even counts and runs that lack a line', () => {
  it('two runs: the lower middle, as documented (kills M8)', () => {
    const r = (v: number) => parseBenchOutput(`ok   a: ${v.toFixed(1)} ms (budget 40)`);
    expect(medianOfRuns([r(10), r(20)]).a.value).toBe(10);
    expect(medianOfRuns([r(10), r(20), r(30), r(40)]).a.value).toBe(20);
  });

  it('records how many runs carried the line (kills M13)', () => {
    const a = parseBenchOutput('ok   a: 10.0 ms (budget 40)\nok   b: 7.0 ms (budget 40)');
    const b = parseBenchOutput('ok   a: 12.0 ms (budget 40)');
    const m = medianOfRuns([a, b, b]);
    expect(m.b).toEqual({ value: 7, unit: 'ms', runs: 1 });
    expect(m.a.runs).toBe(3);
  });
});

describe('the command refuses to write when a budgeted line has no measure', () => {
  it('sizes: a check:size line in a changed format is not silently dropped (kills M12)', () => {
    const dir = tmp();
    const file = join(dir, 'size-budget.json');
    const before = JSON.stringify({ entries: { a: { file: 'a.ts', maxGzip: 1200 }, b: { file: 'b.ts', maxGzip: 500 } } }, null, 2) + '\n';
    writeFileSync(file, before);
    const out = join(dir, 'size.txt');
    // b's line in a new format (gz before min): parseSizeOutput does not read it.
    writeFileSync(out, 'ok   a: 3000 B min, 1100 B gz (budget 1200)\nok   b: 410 B gz, 900 B min (budget 500)\n');
    const r = run(['sizes', '--from', out, '--file', file, '--write']);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/kept {2}b: no measure/);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('node: a bench line missing from every run blocks --write', () => {
    const dir = tmp();
    const file = join(dir, 'budgets.json');
    const before = JSON.stringify({ budgets: { a: 40, b: 9 } }, null, 2) + '\n';
    writeFileSync(file, before);
    const outs = [1, 2, 3].map((i) => { const f = join(dir, `b${i}.txt`); writeFileSync(f, 'ok   a: 10.0 ms (budget 40)\n'); return f; });
    const r = run(['node', '--file', file, '--write', ...outs]);
    expect(r.status).toBe(1);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('a --write typo stays dry', () => {
    const dir = tmp();
    const file = join(dir, 'budgets.json');
    const before = JSON.stringify({ budgets: { a: 40 } }, null, 2) + '\n';
    writeFileSync(file, before);
    const f = join(dir, 'b.txt');
    writeFileSync(f, 'ok   a: 10.0 ms (budget 40)\n');
    for (const flag of ['--wirte', '--write=true', '-w']) {
      run(['node', '--file', file, flag, f]); // '-w' is read as a bench file and fails: also safe
      expect(readFileSync(file, 'utf8')).toBe(before);
    }
  });
});

describe('the ceilings name lines and entries that exist', () => {
  it('every BROWSER_CEILINGS key is a line of perf/browser-budgets.json (a renamed line would lose its cap)', () => {
    const lines = Object.keys(JSON.parse(readFileSync(join(ROOT, 'perf/browser-budgets.json'), 'utf8')).budgets);
    expect(Object.keys(BROWSER_CEILINGS).filter((k) => !lines.includes(k))).toEqual([]);
  });

  it('every named size ceiling is an entry of size-budget.json, and no budget sits above its ceiling', () => {
    const entries = JSON.parse(readFileSync(join(ROOT, 'size-budget.json'), 'utf8')).entries as Record<string, { maxGzip: number | null }>;
    for (const name of ['@dzgrid/core', '@dzgrid/core/server', '@dzgrid/dom', '@dzgrid/dom/filters', '@dzgrid/theme', '@dzgrid/theme/midnight.css', '@dzgrid/theme/clinic.css', '@dzgrid/angular', 'profile: audit screen (K.8)']) expect(entries[name], name).toBeDefined();
    for (const [name, e] of Object.entries(entries)) {
      const c = ceilingFor(name);
      if (c !== null && e.maxGzip !== null) expect(e.maxGzip, name).toBeLessThanOrEqual(c);
    }
  });
});

describe('repositoryProblems and mapProblems: refusals the tests did not cover', () => {
  const good = { repository: { type: 'git', url: 'git+https://github.com/plinthworks/dzgrid.git', directory: 'packages/dom' } };
  it('refuses another repository url (kills M14)', () => {
    expect(repositoryProblems('dom', { repository: { ...good.repository, url: 'git+https://github.com/someone/fork.git' } })).toEqual([
      'packages/dom repository.url is git+https://github.com/someone/fork.git, not git+https://github.com/plinthworks/dzgrid.git',
    ]);
  });
  it('refuses a string repository (npm shorthand) as missing', () => {
    expect(repositoryProblems('dom', { repository: 'github:plinthworks/dzgrid' })).toEqual(['packages/dom has no repository']);
  });

  const check = (maps: Record<string, unknown>, others: string[] = []) =>
    mapProblems('core', [...Object.keys(maps), ...others], (f: string) => (typeof maps[f] === 'string' ? (maps[f] as string) : JSON.stringify(maps[f])));

  it('refuses a map that is not JSON (kills M15)', () => {
    expect(check({ 'a.js.map': '{not json' }, ['a.js'])).toEqual(['packages/core/dist/a.js.map is not JSON']);
  });
  it('resolves sources against sourceRoot (kills M16)', () => {
    expect(check({ 'a.js.map': { sourceRoot: 'lib/', sources: ['a.ts'] } }, ['lib/a.ts'])).toEqual([]);
    expect(check({ 'a.js.map': { sourceRoot: 'lib/', sources: ['a.ts'] } }, ['a.ts'])).toHaveLength(1);
  });
  it('a source with a null sourcesContent slot is still checked', () => {
    expect(check({ 'a.js.map': { sources: ['../src/a.ts', '../src/b.ts'], sourcesContent: ['x', null] } })).toEqual([
      'packages/core/dist/a.js.map points at ../src/b.ts, which is not shipped',
    ]);
  });
});

// ------------------------------------------------------------------ bugs (it.fails until fixed)

describe('bugs', () => {
  // scripts/rebudget.mjs:49 — 1500 × 1.1 is 1650.0000000000002 in floating point, so the ceil goes one
  // step of 50 too far (also 3000 → 3350, 25 000 → 27 550). half() already subtracts 1e-9; sizeBudget does not.
  it('sizeBudget is exact on measures that are multiples of 500 (1500 → 1650, 3000 → 3300, 25 000 → 27 500)', () => {
    expect(sizeBudget(1500)).toBe(1650);
    expect(sizeBudget(3000)).toBe(3300);
    expect(sizeBudget(25000)).toBe(27500);
  });

  // scripts/rebudget.mjs:146-155 — "the median of three runs" is not enforced: a line that one run
  // printed in a changed format (or not at all) gets the median of the runs that remain, silently.
  it('node: a line read in only one of three runs is refused, not budgeted from that one run', () => {
    const dir = tmp();
    const file = join(dir, 'budgets.json');
    const before = JSON.stringify({ budgets: { a: 40 } }, null, 2) + '\n';
    writeFileSync(file, before);
    const outs = ['ok   a: 30.0 ms (budget 40)\n', 'ok   a: 10.0 ms(budget 40)\n', 'ok   a: 10.0 ms (budget: 40)\n'].map((t, i) => {
      const f = join(dir, `b${i}.txt`); writeFileSync(f, t); return f;
    });
    const r = run(['node', '--file', file, '--write', ...outs]);
    expect(r.status).toBe(1); // today: 0, and 'a' is set to 33 from the single (worst) run
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  // scripts/rebudget.mjs:98-99 and :128 — the header (l.19) says a measure above its ceiling is
  // refused; a Node line under 5 ms (or a Chrome sub-ms line) measured above its kept budget is
  // reported as "same" and written, a budget below its own measure.
  it('a sub-5 ms Node line measured above its budget is refused, not kept below the measure', () => {
    expect(() => nodeTimeBudget(4.8, 4)).toThrow(/ceiling|budget/);
  });

  // scripts/manifest.mjs:95 — a second '..' past the root pops the first '..' back off: a map at the
  // dist root naming ../../index.js resolves to the shipped index.js and is accepted.
  it('mapProblems: a source two levels above dist/ is never a shipped file', () => {
    expect(mapProblems('core', ['index.js.map', 'index.js'], () => JSON.stringify({ sources: ['../../index.js'] }))).toHaveLength(1);
  });

  // scripts/manifest.mjs:94 — sourceRoot is joined without '/': 'lib' + 'a.ts' → 'liba.ts' (the
  // source map spec inserts the separator). Fails closed (a false refusal at build), low impact.
  it('mapProblems: a sourceRoot without a trailing slash still resolves', () => {
    expect(mapProblems('core', ['a.js.map', 'lib/a.ts'], () => JSON.stringify({ sourceRoot: 'lib', sources: ['a.ts'] }))).toEqual([]);
  });

  // scripts/rebudget.mjs:128 — the same for a Chrome sub-ms line.
  it('a sub-ms Chrome line measured above its budget is refused', () => {
    expect(() => browserBudget('"next" click to fetch called (server, C)', 0.8, 'ms', 0.5)).toThrow(/budget/);
    expect(browserBudget('"next" click to fetch called (server, C)', 0.4, 'ms', 0.5)).toBe(0.5);
  });

  // parseSizeOutput — a sign is read on neither min nor gz: a size is never negative.
  it('parseSizeOutput reads no negative size, on min or gz alike', () => {
    expect(parseSizeOutput('ok   a: 3000 B min, -5 B gz (budget 1200)\nok   b: -3000 B min, 5 B gz (budget 1200)')).toEqual({});
  });
});
