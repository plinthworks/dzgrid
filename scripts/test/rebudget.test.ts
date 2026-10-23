// @vitest-environment node
// Step 25 (the Phase 3 close): scripts/rebudget.mjs sets every budget from a measure, by the owner's
// rule (step25-decisions.md Q2, Q3): sizes = measure + 10 % rounded up to 50 B, never above the
// plan's ceilings, never below the measure; Node times = max(m × 1.1, m + 0.5 ms) to the half-ms for
// lines of 5 ms and more, the others keep their ceiling; headless-Chrome times = measure + 35 %.
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  sizeBudget, ceilingFor, rebudgetSizes, parseSizeOutput,
  nodeTimeBudget, browserBudget, parseBenchOutput, medianOfRuns, rebudgetTimes, BROWSER_CEILINGS,
  // @ts-expect-error a plain .mjs script
} from '../rebudget.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/rebudget.mjs');

describe('sizes: measure + 10 %, rounded up to 50 B', () => {
  it('rounds up to the next 50 B', () => {
    expect(sizeBudget(1000)).toBe(1100);
    expect(sizeBudget(1001)).toBe(1150);
    expect(sizeBudget(26986)).toBe(29700); // 29 684.6, no ceiling given
    expect(sizeBudget(593)).toBe(700); // 652.3 → 700
    expect(sizeBudget(98)).toBe(150); // a small entry gets more than 10 % from the rounding
  });

  it('the K.8 profile: 75 879 → 83 500 (owner Q3, "about 83 500")', () => {
    expect(sizeBudget(75879, ceilingFor('profile: audit screen (K.8)'))).toBe(83500);
  });

  it('never above the plan ceiling (§5.2), never below the measure', () => {
    expect(sizeBudget(26986, 28000)).toBe(28000); // 29 684.6 → capped at 28 000
    expect(sizeBudget(27990, 28000)).toBe(28000);
    expect(sizeBudget(1999, 2000)).toBe(2000);
    for (const m of [1, 49, 50, 51, 777, 19360, 27999]) expect(sizeBudget(m, 28000)).toBeGreaterThanOrEqual(m);
  });

  it('a measure above its ceiling is refused, not hidden by a budget', () => {
    expect(() => sizeBudget(28001, 28000)).toThrow(/ceiling/);
  });

  it('the plan ceilings at the Phase 4 close: the owner\'s grants (decisions.md Q17b), the other entries their plan ceilings', () => {
    // Q17b (owner, 2026-10-22): the measure + 10 %, never above what the owner granted.
    const grants: Record<string, number> = {
      '@dzgrid/core': 29000, '@dzgrid/dom': 21300, '@dzgrid/angular': 6250, '@dzgrid/dom/tree': 3700, '@dzgrid/dom/detail': 3900,
      '@dzgrid/dom/filters': 10000, '@dzgrid/theme': 2500, '@dzgrid/core/tree': 3500,
      '@dzgrid/core/tree-lazy': 1500, '@dzgrid/dom/tree-lazy': 1000,
      // Q7 (2026-10-21): « core/csv up to 2 000 », a grant the close keeps (1 847 + 10 % would be 2 050).
      '@dzgrid/core/csv': 2000,
    };
    for (const [name, grant] of Object.entries(grants)) {
      expect(ceilingFor(name), name).toBe(grant);
      // Far under its grant, an entry still gets its 10 %; near it, the grant; over it, refused.
      expect(sizeBudget(Math.floor(grant * 0.95), ceilingFor(name)), name).toBe(grant);
      expect(sizeBudget(grant, ceilingFor(name)), name).toBe(grant);
      expect(() => sizeBudget(grant + 1, ceilingFor(name)), name).toThrow(/ceiling/);
    }
    // Today's measures (step 13 plan) would have raised these to the measure + 10 %: the grants hold them.
    expect(sizeBudget(20700, ceilingFor('@dzgrid/dom'))).toBe(21300); // 22 770 → 21 300
    expect(sizeBudget(6236, ceilingFor('@dzgrid/angular'))).toBe(6250); // 6 859.6 → 6 250
    expect(sizeBudget(3688, ceilingFor('@dzgrid/dom/tree'))).toBe(3700);
    expect(sizeBudget(1348, ceilingFor('@dzgrid/core/tree-lazy'))).toBe(1500);
    expect(sizeBudget(877, ceilingFor('@dzgrid/dom/tree-lazy'))).toBe(1000); // 964.7 → 1 000, not 1 050
    // The other entries keep their plan ceilings; the small text bundles follow the rule (≤ 2 kB).
    expect(ceilingFor('@dzgrid/core/server')).toBe(6100); // Phase 5 S2-O4: 6 000 → 6 100
    expect(ceilingFor('@dzgrid/core/detail')).toBe(1050); // Phase 5 S2-O5: 1 000 → 1 050 (gzip noise over the grown core)
    expect(ceilingFor('@dzgrid/dom/locales/ar')).toBe(2000);
    expect(ceilingFor('@dzgrid/dom/locales/fr-tree')).toBe(2000);
    expect(sizeBudget(146, ceilingFor('@dzgrid/dom/locales/fr-tree'))).toBe(200);
    expect(ceilingFor('@dzgrid/dom/filters: set (lazy)')).toBeNull();
    expect(ceilingFor('@dzgrid/dom/export')).toBeNull();
  });

  it('the K.8 profile guard: 83 500 (Q17a; the real example\'s 90 000 is guarded by example:bytes, not here)', () => {
    expect(ceilingFor('profile: audit screen (K.8)')).toBe(83500);
    expect(sizeBudget(79000, ceilingFor('profile: audit screen (K.8)'))).toBe(83500); // 86 900 → 83 500
    expect(() => sizeBudget(83501, ceilingFor('profile: audit screen (K.8)'))).toThrow(/ceiling/);
  });
});

describe('rebudgetSizes: the size-budget.json document', () => {
  const doc = () => ({
    $comment: 'A very long history of every decision. '.repeat(40),
    entries: {
      '@dzgrid/core': { file: 'packages/core/src/index.ts', maxGzip: 27100 },
      '@dzgrid/dom/export': { file: 'packages/dom/src/export.ts', maxGzip: 1200, external: ['@dzgrid/core'] },
      'tzslot kit: date': { files: ['x.ts'], maxGzip: null, without: ['@tzslot/*'] },
      'profile: audit screen (K.8)': { file: 'perf/profiles/audit.ts', split: true, maxGzip: 85000 },
    },
  });
  const measures = { '@dzgrid/core': 26986, '@dzgrid/dom/export': 1200, 'tzslot kit: date': 36394, 'profile: audit screen (K.8)': 75879 };

  it('sets each budgeted entry, raises included (export at its cap → 1 350)', () => {
    const { budget, rows } = rebudgetSizes(doc(), measures, { date: '2026-10-21' });
    expect(budget.entries['@dzgrid/core'].maxGzip).toBe(29000); // 26 986 + 10 % capped at the Phase 4 ceiling
    expect(budget.entries['@dzgrid/dom/export'].maxGzip).toBe(1350);
    expect(budget.entries['profile: audit screen (K.8)'].maxGzip).toBe(83500);
    expect(rows.find((r: { name: string }) => r.name === '@dzgrid/dom/export')).toMatchObject({ old: 1200, measure: 1200, next: 1350 });
  });

  it('keeps the entries without a budget (maxGzip null) as they are, and every other field', () => {
    const { budget } = rebudgetSizes(doc(), measures, { date: '2026-10-21' });
    expect(budget.entries['tzslot kit: date']).toEqual(doc().entries['tzslot kit: date']);
    expect(budget.entries['@dzgrid/dom/export'].external).toEqual(['@dzgrid/core']);
    expect(budget.entries['profile: audit screen (K.8)'].split).toBe(true);
    expect(Object.keys(budget.entries)).toEqual(Object.keys(doc().entries));
  });

  it('a budgeted entry without a measure is reported, its budget kept', () => {
    const { budget, missing } = rebudgetSizes(doc(), { ...measures, '@dzgrid/core': undefined }, { date: '2026-10-21' });
    expect(missing).toEqual(['@dzgrid/core']);
    expect(budget.entries['@dzgrid/core'].maxGzip).toBe(27100);
  });

  it('keeps a $comment, shortened to the rule, the date and a pointer to ROADMAP and decisions.md', () => {
    const { budget } = rebudgetSizes(doc(), measures, { date: '2026-10-22' });
    expect(typeof budget.$comment).toBe('string');
    expect(budget.$comment.length).toBeLessThan(doc().$comment.length);
    // Step 13: the history lives in ROADMAP « Final budgets (Phase 4) »; the comment stays short.
    expect(budget.$comment.length).toBeLessThan(600);
    expect(budget.$comment).toMatch(/10 %/);
    expect(budget.$comment).toMatch(/2026-10-22/);
    expect(budget.$comment).toMatch(/ROADMAP/);
    expect(budget.$comment).toMatch(/Final budgets \(Phase 4\)/);
    expect(budget.$comment).toMatch(/decisions\.md Q17/);
    expect(budget.$comment).not.toMatch(/Phase 3 close/);
  });

  it('does not change the document it is given', () => {
    const d = doc();
    rebudgetSizes(d, measures, { date: '2026-10-21' });
    expect(d).toEqual(doc());
  });
});

describe('parseSizeOutput: check:size lines', () => {
  it('reads plain, "over" and split lines, names with colons included', () => {
    const out = [
      'ok   @dzgrid/core: 81234 B min, 26986 B gz (budget 27100)',
      'ok   @dzgrid/core/server: 17000 B min, 5559 B gz over @dzgrid/core (budget 6000)',
      'OVER @dzgrid/dom/export: 3000 B min, 1250 B gz (budget 1200)',
      'ok   tzslot kit: date: 99999 B min, 36394 B gz (budget recorded)',
      'ok   profile: audit screen (K.8): initial 75879 B gz (js 73833 in 7 files, css 2046) (budget 85000)',
      '       lazy, beside (no budget): x: 1 B min, 1 B gz',
    ].join('\n');
    expect(parseSizeOutput(out)).toEqual({
      '@dzgrid/core': 26986, '@dzgrid/core/server': 5559, '@dzgrid/dom/export': 1250, 'tzslot kit: date': 36394, 'profile: audit screen (K.8)': 75879,
    });
  });
});

describe('Node times: max(m × 1.1, m + 0.5 ms) to the half-ms, lines of 5 ms and more', () => {
  it('rounds up to the half-ms', () => {
    expect(nodeTimeBudget(10, 40)).toBe(11);
    expect(nodeTimeBudget(5, 15)).toBe(5.5); // 5.5 both ways
    expect(nodeTimeBudget(5.2, 15)).toBe(6); // 5.72 → 6
    expect(nodeTimeBudget(6.1, 15)).toBe(7); // 6.71 → 7
    expect(nodeTimeBudget(421, 1000)).toBe(463.5); // 463.1 → 463.5
  });

  it('lines under 5 ms (sub-ms ones included) keep their ceiling', () => {
    expect(nodeTimeBudget(0.2, 0.5)).toBe(0.5);
    expect(nodeTimeBudget(0.0, 1)).toBe(1);
    expect(nodeTimeBudget(3.1, 4)).toBe(4);
    expect(nodeTimeBudget(4.9, 5)).toBe(5);
  });

  it('never below the measure', () => {
    for (const m of [5, 5.01, 7.3, 19.99, 250.2]) expect(nodeTimeBudget(m, 1)).toBeGreaterThan(m);
  });
});

describe('browser times: measure + 35 %, capped by the plan, counts kept', () => {
  it('ms lines: + 35 % to the half-ms', () => {
    expect(browserBudget('sort click on 100 000 (numeric, warm) to the next frame', 30, 'ms', 57)).toBe(40.5); // 30 × 1.35 = 40.5
    expect(browserBudget('one-row transaction to the next frame', 10.1, 'ms', 20)).toBe(14); // 13.635 → 14
  });

  it('capped by a plan ceiling (frames at 58 fps, first render 120)', () => {
    expect(BROWSER_CEILINGS['first render of A']).toBe(120);
    expect(browserBudget('first render of A', 100, 'ms', 120)).toBe(120);
    expect(browserBudget('wheel scroll 50 px a frame: median frame', 16.7, 'ms', 17.2)).toBe(17.2);
  });

  it('a measure over its plan ceiling is refused', () => {
    expect(() => browserBudget('first render of A', 125, 'ms', 120)).toThrow(/ceiling/);
  });

  it('sub-ms lines keep their ceiling (a synchronous fetch, 0 = no task over 50 ms)', () => {
    expect(browserBudget('"next" click to fetch called (server, C)', 0.1, 'ms', 17)).toBe(17);
    expect(browserBudget('CSV export of A in the browser: longest task', 0, 'ms', 50)).toBe(50);
    expect(browserBudget('wheel scroll 50 px a frame: script per frame', 0.3, 'ms', 6)).toBe(6);
    expect(browserBudget('scrollbar drag 2 000 px a frame: script per frame', 1.5, 'ms', 6)).toBe(2.5); // 2.025 → 2.5
  });

  it('counts, percentages and megabytes keep their budget', () => {
    expect(browserBudget('body nodes after first render', 640, 'nodes', 1000)).toBe(1000);
    expect(browserBudget('page errors', 0, 'errors', 0)).toBe(0);
    expect(browserBudget('1 000 create/destroy cycles: heap retained', 0.1, 'MB', 1)).toBe(1);
  });
});

describe('parseBenchOutput and the median of the runs', () => {
  const run = (a: number, b: number) => [
    `ok   numeric sort 100 000 (cold keys + sort): ${a.toFixed(1)} ms (budget 40)`,
    `OVER 1 000 000 rows (scaled), wheel-like scroll: median frame: ${b.toFixed(1)} ms (budget 17.2)`,
    'ok   store overhead bytes/row (100 000 rows): 101.3 (budget 120)',
    'ok   body nodes after first render: 640 nodes (budget 1000)',
    'MISSING something',
  ].join('\n');

  it('reads value and unit; a line without a unit has none', () => {
    const p = parseBenchOutput(run(12.3, 16.8));
    expect(p['numeric sort 100 000 (cold keys + sort)']).toEqual({ value: 12.3, unit: 'ms' });
    expect(p['1 000 000 rows (scaled), wheel-like scroll: median frame']).toEqual({ value: 16.8, unit: 'ms' });
    expect(p['store overhead bytes/row (100 000 rows)']).toEqual({ value: 101.3, unit: '' });
    expect(p['body nodes after first render']).toEqual({ value: 640, unit: 'nodes' });
  });

  it('the median of three runs, line by line', () => {
    const m = medianOfRuns([run(12, 16.9), run(10, 16.6), run(11, 17.1)].map(parseBenchOutput));
    expect(m['numeric sort 100 000 (cold keys + sort)'].value).toBe(11);
    expect(m['1 000 000 rows (scaled), wheel-like scroll: median frame'].value).toBe(16.9);
  });

  it('rebudgetTimes (node): sets the ms lines, keeps memory lines and the lines it has no measure for', () => {
    const doc = { $comment: 'old', runs: 7, budgets: { 'numeric sort 100 000 (cold keys + sort)': 40, 'update 1 row of 100 000': 1, 'not measured': 9 }, memory: { 'store overhead bytes/row (100 000 rows)': 120 } };
    const measured = { 'numeric sort 100 000 (cold keys + sort)': { value: 11, unit: 'ms' }, 'update 1 row of 100 000': { value: 0.1, unit: 'ms' }, 'store overhead bytes/row (100 000 rows)': { value: 101.3, unit: '' } };
    const { budget, missing } = rebudgetTimes('node', doc, measured, { date: '2026-10-21' });
    expect(budget.budgets['numeric sort 100 000 (cold keys + sort)']).toBe(12.5); // 12.1 → 12.5
    expect(budget.budgets['update 1 row of 100 000']).toBe(1);
    expect(budget.budgets['not measured']).toBe(9);
    expect(missing).toEqual(['not measured']);
    expect(budget.memory).toEqual(doc.memory);
    expect(budget.runs).toBe(7);
    expect(budget.$comment).toMatch(/2026-10-21/);
  });
});

describe('the command: --dry by default, --write to save', () => {
  const tmp = () => mkdtempSync(join(tmpdir(), 'dzg-rebudget-'));

  it('sizes from a saved check:size output: dry leaves the file, --write sets it', () => {
    const dir = tmp();
    const file = join(dir, 'size-budget.json');
    const out = join(dir, 'size.txt');
    const before = JSON.stringify({ $comment: 'x'.repeat(2000), entries: { '@dzgrid/dom/export': { file: 'e.ts', maxGzip: 1200 } } }, null, 2) + '\n';
    writeFileSync(file, before);
    writeFileSync(out, 'ok   @dzgrid/dom/export: 3000 B min, 1200 B gz (budget 1200)\n');
    const dry = execFileSync(process.execPath, [SCRIPT, 'sizes', '--from', out, '--file', file], { encoding: 'utf8' });
    expect(dry).toMatch(/dry/i);
    expect(dry).toMatch(/1200.*1350/);
    expect(readFileSync(file, 'utf8')).toBe(before);
    execFileSync(process.execPath, [SCRIPT, 'sizes', '--from', out, '--file', file, '--write'], { encoding: 'utf8' });
    expect(JSON.parse(readFileSync(file, 'utf8')).entries['@dzgrid/dom/export'].maxGzip).toBe(1350);
  });

  it('node times from three saved bench outputs: the median, dry by default', () => {
    const dir = tmp();
    const file = join(dir, 'budgets.json');
    const before = JSON.stringify({ $comment: 'c', runs: 7, budgets: { 'a line': 40 } }, null, 2) + '\n';
    writeFileSync(file, before);
    const outs = [10, 12, 11].map((v, i) => {
      const f = join(dir, `bench${i}.txt`);
      writeFileSync(f, `ok   a line: ${v.toFixed(1)} ms (budget 40)\n`);
      return f;
    });
    expect(execFileSync(process.execPath, [SCRIPT, 'node', '--file', file, ...outs], { encoding: 'utf8' })).toMatch(/dry/i);
    expect(readFileSync(file, 'utf8')).toBe(before);
    execFileSync(process.execPath, [SCRIPT, 'node', '--file', file, '--write', ...outs], { encoding: 'utf8' });
    expect(JSON.parse(readFileSync(file, 'utf8')).budgets['a line']).toBe(12.5); // median 11 → 12.1 → 12.5
  });
});
