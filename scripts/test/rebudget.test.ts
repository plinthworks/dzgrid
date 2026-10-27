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
/** Step 11b (S11b-Q5): the lazy HTML reader's line, its measure + 10 % (rounded up to 50 B). */
const LAZY_HTML = 600; // review 3 moved the long-text count into the chunk: measured 517
const SCRIPT = join(ROOT, 'scripts/rebudget.mjs');
/** The DOM and core base lines and ceilings: 29 000 and 21 980 until Phase 6 step 8b-1 (owner Q2, pinned rows: core up to 29 150, the DOM base up to 22 400, Q-B). */
const CORE = 29150;
/** @dzgrid/dom/range and /fill's ceilings: 4 950 and 3 000 until Phase 6 step 8b-2 (owner Q1: blocks and the fill in the pinned bands, up to ~5 200 and ~3 150). */
const RANGE = 5200;
const FILL = 3150;
const DOM = 22400;

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
    // Q17b (owner, 2026-10-22): the measure + 10 %, never above what the owner granted. The DOM and theme
    // bases since the showcase themes' grants (T7, 2026-10-23): 21 980 and 3 050.
    const grants: Record<string, number> = {
      '@dzgrid/core': CORE, '@dzgrid/dom': DOM, '@dzgrid/angular': 7000, '@dzgrid/dom/tree': 3850, '@dzgrid/dom/detail': 4150, // S8-O1, S8-O3, S8-O7 (step 8); tree Q9-5 (Phase 6 step 9): 3 850
     
      '@dzgrid/dom/filters': 10100, '@dzgrid/theme': 2750, // filters: owner's-look budgets (2026-10-27) 10 000 → 10 100
      '@dzgrid/core/tree': 3500, // theme: Q-C2 (Phase 5 close), « up to 2 750 within T7's 3 050 »
      '@dzgrid/core/rules': 600, '@dzgrid/dom/parts': 800, // Q-C3 (Phase 5 close): the rule's raises accepted, now grants
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
    expect(sizeBudget(20700, ceilingFor('@dzgrid/dom'))).toBe(DOM); // 22 770 → 21 980 (the T7 grant since 2026-10-23; 21 300 at the Phase 4 close)
    expect(sizeBudget(6400, ceilingFor('@dzgrid/angular'))).toBe(7000); // 7 040 → 7 000 (owner S9-Q6: 6 250 + 650 Q16 + 50 T8 + 50 D3)
    expect(sizeBudget(3688, ceilingFor('@dzgrid/dom/tree'))).toBe(3850); // S8-O1 (step 8): 3 700 → 3 800; Q9-5: 3 850
    expect(sizeBudget(1348, ceilingFor('@dzgrid/core/tree-lazy'))).toBe(1500);
    expect(sizeBudget(877, ceilingFor('@dzgrid/dom/tree-lazy'))).toBe(1000); // 964.7 → 1 000, not 1 050
    // The other entries keep their plan ceilings; the small text bundles follow the rule (≤ 2 kB).
    expect(ceilingFor('@dzgrid/core/server')).toBe(6200); // Phase 5 S2-O4: 6 000 → 6 100; owner E5-8: 6 150 for the hold seam; Q8-5: 6 200
    expect(ceilingFor('@dzgrid/core/detail')).toBe(1050); // Phase 5 S2-O5: 1 000 → 1 050 (gzip noise over the grown core)
    expect(ceilingFor('@dzgrid/core/edit')).toBe(3150); // Phase 5 Q16 3 000, owner S3-O4 (2026-10-23) → 3 100; Q8-5 → 3 150
    expect(() => sizeBudget(3151, ceilingFor('@dzgrid/core/edit'))).toThrow(/ceiling/);
    expect(ceilingFor('@dzgrid/dom/locales/ar')).toBe(2000);
    expect(ceilingFor('@dzgrid/dom/locales/fr-tree')).toBe(2000);
    expect(sizeBudget(146, ceilingFor('@dzgrid/dom/locales/fr-tree'))).toBe(200);
    expect(ceilingFor('@dzgrid/dom/filters: set (lazy)')).toBe(4250); // owner's-look budgets (2026-10-27): a written grant
    expect(ceilingFor('@dzgrid/dom/export')).toBeNull();
  });

  it('Phase 5 step 4 (owner S4-O1, Q16): @dzgrid/dom/edit and /editors share 8 000; the -edit texts 560 / 630 / 810 (S4-O4); the DOM base under 21 980', () => {
    // dom/edit: its measure + 10 % (3 311 → 3 650 at the step), /editors the rest of the 8 000; owner S7-O1 (step 7): 3 750.
    expect(ceilingFor('@dzgrid/dom/edit')).toBe(4150); // S8-O1 (step 8)
    // Owner S6-O1 (step 6): /editors 4 350 → 6 500, a new grant over Q16's 8 000; S7-O1: 6 650 (the step-7 test below).
    // Owner S4-O4 (2026-10-23): the texts 560 / 630 / 810 (measure + 10 %), edit.css 1 350, the dom entry 21 700.
    expect(ceilingFor('@dzgrid/dom/locales/en-edit')).toBe(560);
    expect(ceilingFor('@dzgrid/dom/locales/fr-edit')).toBe(630);
    expect(ceilingFor('@dzgrid/dom/locales/ar-edit')).toBe(900); // S8-O1 (step 8): 810 → 900 at the measure
    expect(ceilingFor('@dzgrid/theme/edit.css')).toBe(2200); // S5-O2 (step 5): 1 350 → 1 700; S6-O6 (step 6): 2 100; S7-O1 reserve used (step 7): 2 200
    expect(ceilingFor('@dzgrid/dom')).toBe(DOM);
    const e = (JSON.parse(readFileSync(new URL('../../size-budget.json', import.meta.url), 'utf8')) as { entries: Record<string, { maxGzip: number | null }> }).entries;
    expect(['@dzgrid/dom/locales/en-edit', '@dzgrid/dom/locales/fr-edit', '@dzgrid/dom/locales/ar-edit', '@dzgrid/theme/edit.css', '@dzgrid/dom', '@dzgrid/dom/edit'].map((n) => e[n]!.maxGzip)).toEqual([560, 630, 900, 2200, DOM, 4150]); // Phase 5 close: dom 21 980 (Q-C2) // S8-O1 (step 8): dom/edit 4 000
  });

  it('Phase 5 step 5 (owner S5-O1…O3): the -editors texts 450 / 500 / 620; core/edit and dom/edit unchanged (/editors and edit.css: step 6)', () => {
    expect(ceilingFor('@dzgrid/dom/locales/en-editors')).toBe(450);
    expect(ceilingFor('@dzgrid/dom/locales/fr-editors')).toBe(500);
    expect(ceilingFor('@dzgrid/dom/locales/ar-editors')).toBe(620);
    expect(ceilingFor('@dzgrid/core/edit')).toBe(3150);
    expect(ceilingFor('@dzgrid/dom/edit')).toBe(4150); // S8-O1 (step 8) // S7-O1 (step 7)
    const e = (JSON.parse(readFileSync(new URL('../../size-budget.json', import.meta.url), 'utf8')) as { entries: Record<string, { maxGzip: number | null; external?: string[] }> }).entries;
    expect(['@dzgrid/dom/locales/en-editors', '@dzgrid/dom/locales/fr-editors', '@dzgrid/dom/locales/ar-editors'].map((n) => e[n]?.maxGzip)).toEqual([450, 500, 600]); // Phase 5 close: ar 533 + 10 % = 600 (a lower)
    // The editors reach the edit controller through the grid: @dzgrid/dom/edit and the core's edit are never bundled in.
    expect(e['@dzgrid/dom/editors']!.external).toEqual(expect.arrayContaining(['@dzgrid/core', '@dzgrid/core/internal', '@dzgrid/core/edit', '@dzgrid/dom/internal']));
  });

  it('Phase 5 step 6 (owner S6-O1, S6-O6): /editors 6 500 over the popup, edit.css 2 100, @dzgrid/dom/internal at its measure + 50 up to 1 250, the lazy calendar 1 500; the others unchanged', () => {
    // Owner S7-O1 (step 7): 6 500 → 6 650.
    expect(ceilingFor('@dzgrid/dom/editors')).toBe(6720); // QB5 (step 12)
    expect(ceilingFor('@dzgrid/theme/edit.css')).toBe(2200); // S7-O1's reserve, used at step 7
    expect(ceilingFor('@dzgrid/dom/internal')).toBe(1250);
    expect(ceilingFor('@dzgrid/dom/editors: calendar (lazy)')).toBe(1520); // feedback pass Q1: tzslot's lazy entry (`ready`), by the strict need
    expect(() => sizeBudget(6721, ceilingFor('@dzgrid/dom/editors'))).toThrow(/ceiling/);
    expect(() => sizeBudget(1251, ceilingFor('@dzgrid/dom/internal'))).toThrow(/ceiling/);
    // Untouched by the step.
    expect(ceilingFor('@dzgrid/core')).toBe(CORE);
    expect(ceilingFor('@dzgrid/core/edit')).toBe(3150);
    expect(ceilingFor('@dzgrid/dom/edit')).toBe(4150); // S8-O1 (step 8) // S7-O1 (step 7)
    expect(ceilingFor('@dzgrid/dom/filters')).toBe(10100); // owner's-look budgets
    type Entry = { maxGzip: number | null; external?: string[]; over?: string; files?: string[] };
    const e = (JSON.parse(readFileSync(new URL('../../size-budget.json', import.meta.url), 'utf8')) as { entries: Record<string, Entry> }).entries;
    expect(['@dzgrid/dom/editors', '@dzgrid/theme/edit.css', '@dzgrid/dom/editors: calendar (lazy)', '@dzgrid/core', '@dzgrid/core/edit', '@dzgrid/dom/edit', '@dzgrid/dom', '@dzgrid/dom/filters'].map((n) => e[n]?.maxGzip)).toEqual([6720, 2200, 1520, CORE, 3150, 4150, DOM, 10100]); // Q8-5: core/edit 3 150; // Phase 5 close: dom 21 980 (Q-C2) // S7-O1 (step 7): /editors 6 650, dom/edit 3 750; QB5 (step 12): /editors 6 720
    // The internal entry: its measure with the filters' loader moved in, + 50 (S6-O6), never above 1 250.
    expect(e['@dzgrid/dom/internal']!.maxGzip).toBeGreaterThan(900);
    expect(e['@dzgrid/dom/internal']!.maxGzip).toBeLessThanOrEqual(1250);
    // The editors measured over the popup host (a consumer with the filters pays it once); the calendar chunk is lazy
    // (never in the entry), and tzslot is never DzGrid's bytes.
    const x = e['@dzgrid/dom/editors']!;
    expect(x.over).toBe('@dzgrid/dom/popup');
    expect(x.external).toEqual(expect.arrayContaining(['@dzgrid/core', '@dzgrid/core/internal', '@dzgrid/core/edit', '@dzgrid/dom/internal', './dates/*']));
    const cal = e['@dzgrid/dom/editors: calendar (lazy)']!;
    expect(cal.files).toEqual(['packages/dom/src/editors/dates/calendar.ts']);
    expect(cal.external).toEqual(expect.arrayContaining(['@dzgrid/core', '@dzgrid/core/internal', '@dzgrid/dom/internal', '@tzslot/*']));
  });

  it('Phase 5 step 6 (owner S6-O7): the list in its own entry @dzgrid/dom/editors-list, over the popup, at its measure + 10 % (about 1 650); /editors still 6 500', () => {
    const c = ceilingFor('@dzgrid/dom/editors-list');
    expect(c).not.toBeNull();
    expect(c!).toBeGreaterThan(1000);
    expect(c!).toBeLessThanOrEqual(1800);
    expect(ceilingFor('@dzgrid/dom/editors')).toBe(6720); // S7-O1 (step 7); QB5 (step 12)
    type Entry = { file?: string; maxGzip: number | null; external?: string[]; over?: string };
    const e = (JSON.parse(readFileSync(new URL('../../size-budget.json', import.meta.url), 'utf8')) as { entries: Record<string, Entry> }).entries;
    const l = e['@dzgrid/dom/editors-list']!;
    expect(l.file).toBe('packages/dom/src/editors-list.ts');
    expect(l.maxGzip).toBe(c);
    expect(l.over).toBe('@dzgrid/dom/popup');
    expect(l.external).toEqual(expect.arrayContaining(['@dzgrid/core', '@dzgrid/core/internal', '@dzgrid/dom/internal']));
  });

  it('Phase 5 step 7 (owner S7-O1, Q16): dom/edit 3 750, /editors 6 650, edit.css up to 2 200 only on a browser fix, the motion run chunk inside 3 500; the rest untouched', () => {
    expect(ceilingFor('@dzgrid/dom/edit')).toBe(4150); // S8-O1 (step 8)
    expect(ceilingFor('@dzgrid/dom/editors')).toBe(6720); // QB5 (step 12)
    expect(() => sizeBudget(4151, ceilingFor('@dzgrid/dom/edit'))).toThrow(/ceiling/); // S8-O1 (step 8)
    expect(() => sizeBudget(6721, ceilingFor('@dzgrid/dom/editors'))).toThrow(/ceiling/);
    // Q16: the run chunk's written grant is 3 500 (its line follows the measure under it).
    expect(ceilingFor('@dzgrid/dom/motion-gsap: run (lazy)')).toBe(3500);
    expect(() => sizeBudget(3501, ceilingFor('@dzgrid/dom/motion-gsap: run (lazy)'))).toThrow(/ceiling/);
    // edit.css: the 2 200 reserve, used for the owner's step-7 request (the saving border apart from the focus ring).
    expect(ceilingFor('@dzgrid/theme/edit.css')).toBe(2200);
    expect(() => sizeBudget(2201, ceilingFor('@dzgrid/theme/edit.css'))).toThrow(/ceiling/);
    // Untouched (S7-O1): core 29 000, core/edit 3 100 (frozen), the DOM base 21 700 (grant 21 980).
    expect(ceilingFor('@dzgrid/core')).toBe(CORE);
    expect(ceilingFor('@dzgrid/core/edit')).toBe(3150);
    expect(ceilingFor('@dzgrid/dom')).toBe(DOM);
    type Entry = { maxGzip: number | null };
    const e = (JSON.parse(readFileSync(new URL('../../size-budget.json', import.meta.url), 'utf8')) as { entries: Record<string, Entry> }).entries;
    expect(['@dzgrid/dom/edit', '@dzgrid/dom/editors', '@dzgrid/core', '@dzgrid/core/edit', '@dzgrid/dom'].map((n) => e[n]?.maxGzip)).toEqual([4150, 6720, CORE, 3150, DOM]); // Q8-5: core/edit 3 150; // Phase 5 close: dom 21 980 (Q-C2) // S8-O1/O6 (step 8): dom/edit 4 150; QB5 (step 12): /editors 6 720
    const run = e['@dzgrid/dom/motion-gsap: run (lazy)']!.maxGzip!;
    expect(run).toBeGreaterThan(3150);
    expect(run).toBeLessThanOrEqual(3500);
  });

  it('Phase 5 step 8 (owner S8-O1, S8-O3, S8-O6): dom/edit 4 150 (S8-O6), dom/tree 3 800, dom/detail 4 000; core 29 000, core/edit 3 100 (frozen), /editors 6 650 and the DOM base untouched', () => {
    expect(ceilingFor('@dzgrid/dom/edit')).toBe(4150);
    expect(ceilingFor('@dzgrid/dom/tree')).toBe(3850); // 3 800 (S8-O1), 3 850 since Q9-5
    expect(ceilingFor('@dzgrid/dom/detail')).toBe(4150); // S8-O7
    // The Arabic undo sentences (five plural forms each) took it over 810 at the measure: 900 (S8-O1, only if needed).
    expect(ceilingFor('@dzgrid/dom/locales/ar-edit')).toBe(900);
    expect(ceilingFor('@dzgrid/dom/locales/en-edit')).toBe(560);
    expect(ceilingFor('@dzgrid/dom/locales/fr-edit')).toBe(630);
    for (const [n, c] of [['@dzgrid/dom/edit', 4150], ['@dzgrid/dom/tree', 3850], ['@dzgrid/dom/detail', 4150]] as const) expect(() => sizeBudget(c + 1, ceilingFor(n)), n).toThrow(/ceiling/);
    // Untouched by the step.
    expect(ceilingFor('@dzgrid/core')).toBe(CORE);
    expect(ceilingFor('@dzgrid/core/edit')).toBe(3150);
    expect(ceilingFor('@dzgrid/dom/editors')).toBe(6720); // QB5 (step 12)
    expect(ceilingFor('@dzgrid/dom')).toBe(DOM);
    type Entry = { maxGzip: number | null };
    const e = (JSON.parse(readFileSync(new URL('../../size-budget.json', import.meta.url), 'utf8')) as { entries: Record<string, Entry> }).entries;
    expect(['@dzgrid/dom/edit', '@dzgrid/dom/tree', '@dzgrid/dom/detail', '@dzgrid/dom/editors', '@dzgrid/core', '@dzgrid/core/edit', '@dzgrid/dom', '@dzgrid/dom/locales/ar-edit'].map((n) => e[n]?.maxGzip)).toEqual([4150, 3850, 4150, 6720, CORE, 3150, DOM, 900]); // Q8-5: core/edit 3 150; // Phase 5 close: dom 21 980 (Q-C2) // QB5 (step 12): /editors 6 720
    // The budget line at the step-9 measure + 50 (6 743 after its review → 6 793), under the S9-Q6 ceiling; step 12
    // (`range()`, `fill()`, two outputs): 6 813 + 50 → 6 863. The Phase 5 close (Q-C2): 6 813 + 10 %, capped at 7 000.
    expect(e['@dzgrid/angular']?.maxGzip).toBe(7000);
  });

  it('Phase 5 step 10 (owner Q16, Part B): @dzgrid/core/range a new entry, ceiling 4 000 over the core; core 29 000 and core/edit 3 100 (frozen) untouched', () => {
    expect(ceilingFor('@dzgrid/core/range')).toBe(4000);
    expect(() => sizeBudget(4001, ceilingFor('@dzgrid/core/range'))).toThrow(/ceiling/);
    expect(ceilingFor('@dzgrid/core')).toBe(CORE);
    expect(ceilingFor('@dzgrid/core/edit')).toBe(3150);
    type Entry = { file?: string; maxGzip: number | null; over?: string };
    const e = (JSON.parse(readFileSync(new URL('../../size-budget.json', import.meta.url), 'utf8')) as { entries: Record<string, Entry> }).entries;
    expect(e['@dzgrid/core/range']).toEqual({ file: 'packages/core/src/range.ts', maxGzip: 3200, over: '@dzgrid/core' }); // Phase 5 close: 2 897 + 10 % (a lower)
    expect(['@dzgrid/core', '@dzgrid/core/edit'].map((n) => e[n]?.maxGzip)).toEqual([CORE, 3150]); // Q8-5
  });

  it('owner S12-Q14 (2026-10-26): @dzgrid/dom/range 4 800 → 4 950 for the outside-press clear (measured 4 873); 5 200 since step 8b-2 (owner Q1)', () => {
    expect(ceilingFor('@dzgrid/dom/range')).toBe(RANGE);
    expect(() => sizeBudget(RANGE + 1, ceilingFor('@dzgrid/dom/range'))).toThrow(/ceiling/);
    const e = (JSON.parse(readFileSync(new URL('../../size-budget.json', import.meta.url), 'utf8')) as { entries: Record<string, { maxGzip: number | null }> }).entries;
    expect(e['@dzgrid/dom/range']!.maxGzip).toBeLessThanOrEqual(RANGE);
  });

  it('Phase 5 step 12 (owner S12-Q1, S12-Q4, QB5; S12-Q9): @dzgrid/dom/fill 3 000 over dom/range; the -fill texts 250 / 300 / 380; fill.css 460; /editors 6 720; dom/range 4 800, dom/edit 4 150, core 29 000 unchanged', () => {
    expect(ceilingFor('@dzgrid/dom/fill')).toBe(FILL); // S12-Q9: 1 600 → 3 000 (measured 2 729); step 8b-2 (owner Q1): 3 150
    expect(() => sizeBudget(FILL + 1, ceilingFor('@dzgrid/dom/fill'))).toThrow(/ceiling/);
    for (const [lang, c] of [['en', 250], ['fr', 300], ['ar', 380]] as const) {
      expect(ceilingFor(`@dzgrid/dom/locales/${lang}-fill`), lang).toBe(c);
      expect(() => sizeBudget(c + 1, ceilingFor(`@dzgrid/dom/locales/${lang}-fill`)), lang).toThrow(/ceiling/);
    }
    expect(ceilingFor('@dzgrid/theme/fill.css')).toBe(460); // S12-Q9: 300 → 460 (measured 415)
    expect(() => sizeBudget(461, ceilingFor('@dzgrid/theme/fill.css'))).toThrow(/ceiling/);
    expect(ceilingFor('@dzgrid/dom/editors')).toBe(6720);
    expect(() => sizeBudget(6721, ceilingFor('@dzgrid/dom/editors'))).toThrow(/ceiling/);
    expect(['@dzgrid/dom/range', '@dzgrid/dom/edit', '@dzgrid/core', '@dzgrid/core/range', '@dzgrid/core/edit'].map(ceilingFor)).toEqual([RANGE, 4150, CORE, 4000, 3150]); // Q8-5: core/edit 3 150; // dom/range: S12-Q14, 8b-2 Q1
    type Entry = { file?: string; maxGzip: number | null; over?: string; external?: string[] };
    const e = (JSON.parse(readFileSync(new URL('../../size-budget.json', import.meta.url), 'utf8')) as { entries: Record<string, Entry> }).entries;
    const ext = ['@dzgrid/core', '@dzgrid/core/internal', '@dzgrid/core/range', '@dzgrid/dom/internal', './html/*'];
    expect(e['@dzgrid/dom/fill']).toEqual({ file: 'packages/dom/src/fill.ts', maxGzip: e['@dzgrid/dom/fill']!.maxGzip, over: '@dzgrid/dom/range', external: ext });
    expect(e['@dzgrid/dom/fill']!.maxGzip).toBeLessThanOrEqual(FILL);
    expect(e['@dzgrid/dom/fill']!.maxGzip).toBeGreaterThan(1600);
    expect(['en', 'fr', 'ar'].map((l) => e[`@dzgrid/dom/locales/${l}-fill`]?.file)).toEqual(['en', 'fr', 'ar'].map((l) => `packages/dom/src/locales/${l}-fill.ts`));
    ['en', 'fr', 'ar'].forEach((l, i) => expect(e[`@dzgrid/dom/locales/${l}-fill`]!.maxGzip, l).toBeLessThanOrEqual([250, 300, 380][i]!));
    expect(e['@dzgrid/theme/fill.css']).toEqual({ file: 'packages/theme/fill.css', maxGzip: e['@dzgrid/theme/fill.css']!.maxGzip });
    expect(e['@dzgrid/theme/fill.css']!.maxGzip).toBeLessThanOrEqual(460);
    expect(e['@dzgrid/theme/fill.css']!.maxGzip).toBeGreaterThan(300);
    expect(e['@dzgrid/dom/editors']!.maxGzip).toBeLessThanOrEqual(6720);
    expect(['@dzgrid/dom/edit', '@dzgrid/core'].map((n) => e[n]?.maxGzip)).toEqual([4150, CORE]);
    expect(e['@dzgrid/dom/range']!.maxGzip).toBeLessThanOrEqual(RANGE); // S12-Q14, 8b-2 Q1
  });

  it('Phase 5 close (owner Q-C2, Q-C3, 2026-10-26): theme up to 2 750, core/rules 600, dom/parts 800 become ceilings; angular 7 000 and dom/internal 1 250 kept; the close measures give these budgets', () => {
    expect(['@dzgrid/theme', '@dzgrid/core/rules', '@dzgrid/dom/parts', '@dzgrid/angular', '@dzgrid/dom/internal'].map(ceilingFor)).toEqual([2750, 600, 800, 7000, 1250]);
    for (const n of ['@dzgrid/theme', '@dzgrid/core/rules', '@dzgrid/dom/parts']) expect(() => sizeBudget(ceilingFor(n)! + 1, ceilingFor(n)), n).toThrow(/ceiling/);
    // The close's own measures (step13-plan §3, the dry run of 2026-10-26), each by the rule.
    const close: [string, number, number][] = [
      ['@dzgrid/theme', 2494, 2750], ['@dzgrid/core/rules', 512, 600], ['@dzgrid/dom/parts', 689, 800],
      ['@dzgrid/angular', 6813, 7000], ['@dzgrid/dom/internal', 1184, 1250], ['@dzgrid/dom', 21565, DOM],
      ['@dzgrid/core/range', 2897, 3200], ['@dzgrid/core/spans', 3438, 3800], ['@dzgrid/dom/locales/ar-editors', 533, 600],
      ['@dzgrid/dom/locales/ar-fill', 299, 350], ['@dzgrid/dom/locales/ar-range', 500, 500], ['@dzgrid/core/edit', 3098, 3150], // 3 100 at the close; the ceiling 3 150 since Q8-5
      ['@dzgrid/theme/midnight.css', 446, 500], ['@dzgrid/theme/clinic.css', 472, 550], ['@dzgrid/theme/bootstrap.css', 293, 350],
    ];
    for (const [n, m, b] of close) expect(sizeBudget(m, ceilingFor(n)), n).toBe(b);
    // A lower never goes under the measure (ar-range sits at its cap, 0 B left).
    expect(sizeBudget(500, ceilingFor('@dzgrid/dom/locales/ar-range'))).toBe(500);
  });

  it('Phase 5 step 11b (owner S11b-Q3, S11b-Q5): @dzgrid/dom/range at most 4 800, its pasted-HTML reader a lazy chunk with its own line (the measure + 10 %), the -range texts unchanged', () => {
    expect(ceilingFor('@dzgrid/dom/range')).toBe(RANGE); // S12-Q14, 8b-2 Q1
    expect(ceilingFor('@dzgrid/dom/range: html (lazy)')).toBe(LAZY_HTML);
    for (const [lang, c] of [['en', 350], ['fr', 400], ['ar', 500]] as const) expect(ceilingFor(`@dzgrid/dom/locales/${lang}-range`), lang).toBe(c);
    type Entry = { file?: string; maxGzip: number | null; over?: string; external?: string[] };
    const e = (JSON.parse(readFileSync(new URL('../../size-budget.json', import.meta.url), 'utf8')) as { entries: Record<string, Entry> }).entries;
    const ext = ['@dzgrid/core', '@dzgrid/core/internal', '@dzgrid/core/range', '@dzgrid/dom/internal', './html/*'];
    expect(e['@dzgrid/dom/range']).toEqual({ file: 'packages/dom/src/range.ts', maxGzip: e['@dzgrid/dom/range']!.maxGzip, over: '@dzgrid/dom', external: ext });
    expect(e['@dzgrid/dom/range']!.maxGzip).toBeLessThanOrEqual(RANGE); // S12-Q14, 8b-2 Q1
    expect(e['@dzgrid/dom/range']!.maxGzip).toBeGreaterThan(4500);
    expect(e['@dzgrid/dom/range: html (lazy)']).toEqual({ file: 'packages/dom/src/range/html/index.ts', maxGzip: LAZY_HTML, over: '@dzgrid/dom/range', external: ext }); // './html/*' kept: the line's « alone » build of dom/range must leave the chunk out, or the chunk is counted in it (review 6, answered)
  });

  it('Phase 5 step 11a (owner Q16, Part B budgets): @dzgrid/dom/range a new entry, ceiling 4 500 over the DOM base; the -range texts 350 / 400 / 500; range.css 500; core 29 000, core/edit 3 100 and core/range 4 000 untouched; the DOM base inside 21 980', () => {
    expect(ceilingFor('@dzgrid/dom/range')).toBe(RANGE); // step 11b, owner S11b-Q3; S12-Q14; 8b-2 Q1
    for (const [lang, c] of [['en', 350], ['fr', 400], ['ar', 500]] as const) {
      expect(ceilingFor(`@dzgrid/dom/locales/${lang}-range`), lang).toBe(c);
      expect(() => sizeBudget(c + 1, ceilingFor(`@dzgrid/dom/locales/${lang}-range`)), lang).toThrow(/ceiling/);
    }
    expect(ceilingFor('@dzgrid/theme/range.css')).toBe(500);
    expect(() => sizeBudget(501, ceilingFor('@dzgrid/theme/range.css'))).toThrow(/ceiling/);
    expect(ceilingFor('@dzgrid/core')).toBe(CORE);
    expect(ceilingFor('@dzgrid/core/edit')).toBe(3150);
    expect(ceilingFor('@dzgrid/core/range')).toBe(4000);
    expect(ceilingFor('@dzgrid/dom')).toBe(DOM);
    type Entry = { file?: string; maxGzip: number | null; over?: string; external?: string[] };
    const e = (JSON.parse(readFileSync(new URL('../../size-budget.json', import.meta.url), 'utf8')) as { entries: Record<string, Entry> }).entries;
    // Step 11b (S11b-Q3, S11b-Q5) moved the line and its externals: see the next test.
    expect(e['@dzgrid/dom/range']).toMatchObject({ file: 'packages/dom/src/range.ts', over: '@dzgrid/dom' });
    expect(['en', 'fr', 'ar'].map((l) => e[`@dzgrid/dom/locales/${l}-range`])).toEqual(['en', 'fr', 'ar'].map((l, i) => ({ file: `packages/dom/src/locales/${l}-range.ts`, maxGzip: [350, 400, 500][i] })));
    expect(e['@dzgrid/theme/range.css']).toEqual({ file: 'packages/theme/range.css', maxGzip: 500 });
    expect(['@dzgrid/core', '@dzgrid/core/edit', '@dzgrid/core/range'].map((n) => e[n]?.maxGzip)).toEqual([CORE, 3150, 3200]); // Q8-5: core/edit 3 150; // Phase 5 close: core/range 2 897 + 10 % (a lower)
    expect(e['@dzgrid/dom']!.maxGzip).toBeLessThanOrEqual(DOM);
  });

  it('the showcase themes\' grants (owner T7, 2026-10-23): each theme 650, the theme base up to 3 050, the DOM base 21 980', () => {
    expect(ceilingFor('@dzgrid/theme/midnight.css')).toBe(650);
    expect(ceilingFor('@dzgrid/theme/clinic.css')).toBe(650);
    expect(ceilingFor('@dzgrid/theme')).toBe(2750); // T7 3 050; the Phase 5 close (Q-C2): up to 2 750
    expect(ceilingFor('@dzgrid/dom')).toBe(DOM);
    // T8: the Angular wrapper 6 250 → 6 300 for its [rowClass] input; D3 6 350; S9-Q6 (step 9, editing): at most 7 000.
    expect(ceilingFor('@dzgrid/angular')).toBe(7000);
    // Each framework bridge 500 (step 5).
    for (const b of ['tailwind.css', 'tailwind3.css', 'bootstrap.css']) expect(ceilingFor(`@dzgrid/theme/${b}`)).toBe(500);
    // A theme far under its grant gets its 10 %; near it, the grant; over it, refused.
    expect(sizeBudget(500, ceilingFor('@dzgrid/theme/midnight.css'))).toBe(550);
    expect(sizeBudget(600, ceilingFor('@dzgrid/theme/clinic.css'))).toBe(650);
    expect(() => sizeBudget(651, ceilingFor('@dzgrid/theme/clinic.css'))).toThrow(/ceiling/);
    expect(() => sizeBudget(3051, ceilingFor('@dzgrid/theme'))).toThrow(/ceiling/);
  });

  it('Phase 6 step 2 (owner Q-B): @dzgrid/dom/columns 3 500 over the DOM base (part 1 accepted at its measure ~2 800 + margin, 2 900: decisions « Step 2 lead »); the -columns texts 500 / 600 / 800; columns.css 1 100; core 29 000 and the DOM base untouched', () => {
    // Step 6 (owner Q6-6) raised these ceilings: checked in its own test below.
    expect(['@dzgrid/core', '@dzgrid/dom'].map(ceilingFor)).toEqual([CORE, DOM]);
    type Entry = { file?: string; maxGzip: number | null; over?: string; external?: string[] };
    const e = (JSON.parse(readFileSync(new URL('../../size-budget.json', import.meta.url), 'utf8')) as { entries: Record<string, Entry> }).entries;
    expect({ ...e['@dzgrid/dom/columns'], maxGzip: 0 }).toEqual({ file: 'packages/dom/src/columns.ts', maxGzip: 0, over: '@dzgrid/dom', external: ['@dzgrid/core', '@dzgrid/core/internal', '@dzgrid/dom/internal'] });
    ['en', 'fr', 'ar'].forEach((l) => expect(e[`@dzgrid/dom/locales/${l}-columns`]?.file, l).toBe(`packages/dom/src/locales/${l}-columns.ts`));
    expect(e['@dzgrid/theme/columns.css']?.file).toBe('packages/theme/columns.css');
    expect(['@dzgrid/core', '@dzgrid/dom'].map((n) => e[n]?.maxGzip)).toEqual([CORE, DOM]);
  });

  it('Phase 6 step 3 (owner Q-B, Q3-2, Q3-3, Q3-5): @dzgrid/dom/column-menu 4 300 over the popup host; its own -column-menu texts 500 / 600 / 700; the core (width: null) and the DOM base (the shortcuts seam) hold their lines 29 000 / 21 980 (grants 29 150 / 22 400 not needed); columns.css still 1 100', () => {
    // Owner Q3-5 (2026-10-26): 3 000 → 4 300 (measured 3 951); texts 450 / 550 / 650 → 500 / 600 / 700.
    expect(ceilingFor('@dzgrid/dom/column-menu')).toBe(4300);
    expect(() => sizeBudget(4301, ceilingFor('@dzgrid/dom/column-menu'))).toThrow(/ceiling/);
    for (const [lang, c] of [['en', 500], ['fr', 600], ['ar', 700]] as const) {
      expect(ceilingFor(`@dzgrid/dom/locales/${lang}-column-menu`), lang).toBe(c);
      expect(() => sizeBudget(c + 1, ceilingFor(`@dzgrid/dom/locales/${lang}-column-menu`)), lang).toThrow(/ceiling/);
    }
    expect(['@dzgrid/core', '@dzgrid/dom'].map(ceilingFor)).toEqual([CORE, DOM]);
    type Entry = { file?: string; maxGzip: number | null; over?: string; external?: string[] };
    const e = (JSON.parse(readFileSync(new URL('../../size-budget.json', import.meta.url), 'utf8')) as { entries: Record<string, Entry> }).entries;
    const m = e['@dzgrid/dom/column-menu']!;
    expect({ ...m, maxGzip: 0 }).toEqual({ file: 'packages/dom/src/column-menu.ts', maxGzip: 0, over: '@dzgrid/dom/popup', external: ['@dzgrid/core', '@dzgrid/core/internal', '@dzgrid/dom/internal'] });
    expect(m.maxGzip).toBeGreaterThan(0);
    expect(m.maxGzip).toBeLessThanOrEqual(4300);
    expect(m.maxGzip).toBeGreaterThanOrEqual(3951);
    ['en', 'fr', 'ar'].forEach((l, i) => {
      const t = e[`@dzgrid/dom/locales/${l}-column-menu`]!;
      expect(t.file, l).toBe(`packages/dom/src/locales/${l}-column-menu.ts`);
      expect(t.maxGzip, l).toBe([500, 600, 700][i]!);
    });
    expect(['@dzgrid/core', '@dzgrid/dom'].map((n) => e[n]?.maxGzip)).toEqual([CORE, DOM]);
  });

  it('Phase 6 step 4 (owner Q-B, Q4-1, Q4-2, Q4-4): @dzgrid/dom/columns-panel 4 000 (up to 4 400) over the popup host; its texts in -columns (500 / 600 / 800 kept); columns-panel.css new, at most 1 000; the popup host 1 650; core and the DOM base unchanged', () => {
    const cap = ceilingFor('@dzgrid/dom/columns-panel');
    expect(cap).toBeGreaterThanOrEqual(4000);
    expect(cap).toBeLessThanOrEqual(4400);
    expect(() => sizeBudget(cap + 1, cap)).toThrow(/ceiling/);
    const css = ceilingFor('@dzgrid/theme/columns-panel.css');
    expect(css).toBeGreaterThan(0);
    expect(css).toBeLessThanOrEqual(1000);
    expect(['@dzgrid/core', '@dzgrid/dom'].map(ceilingFor)).toEqual([CORE, DOM]);
    type Entry = { file?: string; maxGzip: number | null; over?: string; external?: string[] };
    const e = (JSON.parse(readFileSync(new URL('../../size-budget.json', import.meta.url), 'utf8')) as { entries: Record<string, Entry> }).entries;
    const p = e['@dzgrid/dom/columns-panel']!;
    expect({ ...p, maxGzip: 0 }).toEqual({ file: 'packages/dom/src/columns-panel.ts', maxGzip: 0, over: '@dzgrid/dom/popup', external: ['@dzgrid/core', '@dzgrid/core/internal', '@dzgrid/dom/internal'] });
    expect(p.maxGzip).toBeGreaterThan(0);
    expect(p.maxGzip).toBeLessThanOrEqual(cap);
    const c = e['@dzgrid/theme/columns-panel.css']!;
    expect(c.file).toBe('packages/theme/columns-panel.css');
    expect(c.maxGzip).toBeLessThanOrEqual(css);
    expect(e['@dzgrid/dom/popup']?.maxGzip).toBe(1650);

    expect(['@dzgrid/core', '@dzgrid/dom'].map((n) => e[n]?.maxGzip)).toEqual([CORE, DOM]);
  });

  it('Phase 6 step 5 (owner Q-B, E5-1): @dzgrid/core/state 1 500 over the core, @dzgrid/dom/state 1 150 (E5-8) over the DOM base (core/state outside it); the core within 29 150, the DOM base within 22 400; the server 6 150 for its hold seam (E5-8)', () => {
    expect(ceilingFor('@dzgrid/core/state')).toBe(1500);
    expect(ceilingFor('@dzgrid/dom/state')).toBe(1150); // owner E5-8: 800 → 1 150
    expect(() => sizeBudget(1501, ceilingFor('@dzgrid/core/state'))).toThrow(/ceiling/);
    expect(() => sizeBudget(1151, ceilingFor('@dzgrid/dom/state'))).toThrow(/ceiling/);
    expect(ceilingFor('@dzgrid/core')).toBeLessThanOrEqual(29150);
    expect(ceilingFor('@dzgrid/dom')).toBeLessThanOrEqual(22400);
    expect(ceilingFor('@dzgrid/core/server')).toBe(6200);
    type Entry = { file?: string; maxGzip: number | null; over?: string; external?: string[] };
    const e = (JSON.parse(readFileSync(new URL('../../size-budget.json', import.meta.url), 'utf8')) as { entries: Record<string, Entry> }).entries;
    expect(e['@dzgrid/core/state']).toEqual({ file: 'packages/core/src/state.ts', maxGzip: e['@dzgrid/core/state']!.maxGzip, over: '@dzgrid/core' });
    expect(e['@dzgrid/core/state']!.maxGzip).toBeLessThanOrEqual(1500);
    const d = e['@dzgrid/dom/state']!;
    expect({ ...d, maxGzip: 0 }).toEqual({ file: 'packages/dom/src/state.ts', maxGzip: 0, over: '@dzgrid/dom', external: ['@dzgrid/core', '@dzgrid/core/internal', '@dzgrid/core/state', '@dzgrid/dom/internal'] });
    expect(d.maxGzip).toBeLessThanOrEqual(1150);
    expect(d.maxGzip).toBeGreaterThanOrEqual(1058);
    expect(e['@dzgrid/core/server']!.maxGzip).toBe(6200); // owner E5-8: confirmed 6 150; Q8-5: 6 200
    expect(e['@dzgrid/core']!.maxGzip).toBeLessThanOrEqual(29150);
    expect(e['@dzgrid/dom']!.maxGzip).toBeLessThanOrEqual(22400);
    expect(e['@dzgrid/core/server']!.maxGzip).toBeLessThanOrEqual(ceilingFor('@dzgrid/core/server')!);
  });

  it('Phase 6 step 6 (owner Q6-6): @dzgrid/dom/columns 4 200 (the resize mode and auto-size in the same entry, measured 3 996), columns.css 1 200, the -columns texts 550 / 650 / 850; each line at its measure plus a small margin, within the grant; the DOM base keeps 21 980 (the double-click seam, +71)', () => {
    expect(ceilingFor('@dzgrid/dom/columns')).toBe(4200);
    expect(() => sizeBudget(4201, ceilingFor('@dzgrid/dom/columns'))).toThrow(/ceiling/);
    expect(ceilingFor('@dzgrid/theme/columns.css')).toBe(1200);
    expect(() => sizeBudget(1201, ceilingFor('@dzgrid/theme/columns.css'))).toThrow(/ceiling/);
    // Q8-1 (step 7): 600 / 720 / 900 since.
    for (const [lang, c] of [['en', 600], ['fr', 720], ['ar', 900]] as const) {
      expect(ceilingFor(`@dzgrid/dom/locales/${lang}-columns`), lang).toBe(c);
      expect(() => sizeBudget(c + 1, ceilingFor(`@dzgrid/dom/locales/${lang}-columns`)), lang).toThrow(/ceiling/);
    }
    const e = (JSON.parse(readFileSync(new URL('../../size-budget.json', import.meta.url), 'utf8')) as { entries: Record<string, { maxGzip: number | null }> }).entries;
    // The lines, by hand: measure 3 996 → 4 100; 1 111 → 1 150; texts 512 → 530, 614 → 630, 746 → 800 (kept).
    expect(e['@dzgrid/dom/columns']?.maxGzip).toBe(4100);
    expect(e['@dzgrid/theme/columns.css']?.maxGzip).toBe(1150);
    expect(['en', 'fr', 'ar'].map((l) => e[`@dzgrid/dom/locales/${l}-columns`]?.maxGzip)).toEqual([600, 720, 900]); // Q8-1 (step 7)
    expect(e['@dzgrid/dom']?.maxGzip).toBe(DOM);
  });

  it('Phase 6 step 7 (owner Q8-1, Q8-4, Q8-5): the -columns texts 600 / 720 / 900; @dzgrid/dom/groups a new entry at its measure + 10 % (1 893 → 2 100); core/edit 3 150, core/server 6 200, the K.8 guard 84 000 (compression only); dom/spans within 5 300', () => {
    for (const [lang, c] of [['en', 600], ['fr', 720], ['ar', 900]] as const) expect(ceilingFor(`@dzgrid/dom/locales/${lang}-columns`), lang).toBe(c);
    expect(sizeBudget(1893, ceilingFor('@dzgrid/dom/groups'))).toBe(2100);
    expect([ceilingFor('@dzgrid/core/edit'), ceilingFor('@dzgrid/core/server'), ceilingFor('profile: audit screen (K.8)'), ceilingFor('@dzgrid/dom/spans')]).toEqual([3150, 6200, 84300, 5300]); // K.8: 84 150 since Q9-3, 84 300 since the owner's look
    const e = (JSON.parse(readFileSync(new URL('../../size-budget.json', import.meta.url), 'utf8')) as { entries: Record<string, { maxGzip: number | null }> }).entries;
    expect(['@dzgrid/dom/groups', '@dzgrid/core/edit', '@dzgrid/core/server', 'profile: audit screen (K.8)'].map((n) => e[n]?.maxGzip)).toEqual([2100, 3150, 6200, 84300]);
    expect(['en', 'fr', 'ar'].map((l) => e[`@dzgrid/dom/locales/${l}-columns`]?.maxGzip)).toEqual([600, 720, 900]);
  });

  it('Phase 6 step 8b-1 (owner Q2): core 29 150, the DOM base 22 400; @dzgrid/dom/pinned-rows a new entry over the DOM base (2 000, up to 2 300 for editing), its -pinned texts 120 / 140 / 170, pinned-rows.css about 450 (its measure + 10 %)', () => {
    expect([ceilingFor('@dzgrid/core'), ceilingFor('@dzgrid/dom')]).toEqual([29150, 22400]);
    expect(() => sizeBudget(29151, ceilingFor('@dzgrid/core'))).toThrow(/ceiling/);
    expect(() => sizeBudget(22401, ceilingFor('@dzgrid/dom'))).toThrow(/ceiling/);
    expect(ceilingFor('@dzgrid/dom/pinned-rows')).toBeLessThanOrEqual(2300);
    expect(ceilingFor('@dzgrid/dom/pinned-rows')).toBeGreaterThanOrEqual(2000);
    for (const [lang, c] of [['en', 120], ['fr', 140], ['ar', 170]] as const) {
      expect(ceilingFor(`@dzgrid/dom/locales/${lang}-pinned`), lang).toBe(c);
      expect(() => sizeBudget(c + 1, ceilingFor(`@dzgrid/dom/locales/${lang}-pinned`)), lang).toThrow(/ceiling/);
    }
    expect(ceilingFor('@dzgrid/theme/pinned-rows.css')).toBeLessThanOrEqual(500);
    type Entry = { file?: string; maxGzip: number | null; over?: string; external?: string[] };
    const e = (JSON.parse(readFileSync(new URL('../../size-budget.json', import.meta.url), 'utf8')) as { entries: Record<string, Entry> }).entries;
    expect(['@dzgrid/core', '@dzgrid/dom'].map((n) => e[n]?.maxGzip)).toEqual([29150, 22400]);
    const p = e['@dzgrid/dom/pinned-rows']!;
    expect({ ...p, maxGzip: 0 }).toEqual({ file: 'packages/dom/src/pinned-rows.ts', maxGzip: 0, over: '@dzgrid/dom', external: ['@dzgrid/core', '@dzgrid/core/internal', '@dzgrid/dom/internal'] });
    expect(p.maxGzip).toBeLessThanOrEqual(ceilingFor('@dzgrid/dom/pinned-rows'));
    for (const lang of ['en', 'fr', 'ar']) {
      const t = e[`@dzgrid/dom/locales/${lang}-pinned`]!;
      expect(t.file, lang).toBe(`packages/dom/src/locales/${lang}-pinned.ts`);
      expect(t.maxGzip, lang).toBeLessThanOrEqual(ceilingFor(`@dzgrid/dom/locales/${lang}-pinned`));
    }
    // The lines by hand (8b-1 measures): the entry 2 080 → 2 150 (inside 2 300: the editing glue, ~180 B, needs more than 2 000);
    // the texts at their grants (116 / 130 / 156); the sheet 301 + 10 % → 350.
    expect(ceilingFor('@dzgrid/dom/pinned-rows')).toBe(2300);
    expect(p.maxGzip).toBe(2200); // 2 150, then 2 200 (Q9-6, compression alone)
    expect(['en', 'fr', 'ar'].map((l) => e[`@dzgrid/dom/locales/${l}-pinned`]?.maxGzip)).toEqual([120, 140, 170]);
    expect(sizeBudget(301, ceilingFor('@dzgrid/theme/pinned-rows.css'))).toBe(350);
    const css = e['@dzgrid/theme/pinned-rows.css']!;
    expect(css.file).toBe('packages/theme/pinned-rows.css');
    expect(css.maxGzip).toBeLessThanOrEqual(ceilingFor('@dzgrid/theme/pinned-rows.css'));
  });

  it('Phase 6 step 8b-2 (owner Q1): @dzgrid/dom/range up to 5 200 and /fill up to 3 150 (blocks and the fill in the pinned bands); their lines the measures plus a small margin (5 002 → 5 050, 3 042 → 3 100); pinned-rows, core, the DOM base and dom/edit unchanged', () => {
    expect([ceilingFor('@dzgrid/dom/range'), ceilingFor('@dzgrid/dom/fill')]).toEqual([5200, 3150]);
    expect(() => sizeBudget(5201, ceilingFor('@dzgrid/dom/range'))).toThrow(/ceiling/);
    expect(() => sizeBudget(3151, ceilingFor('@dzgrid/dom/fill'))).toThrow(/ceiling/);
    const e = (JSON.parse(readFileSync(new URL('../../size-budget.json', import.meta.url), 'utf8')) as { entries: Record<string, { maxGzip: number | null }> }).entries;
    expect(['@dzgrid/dom/range', '@dzgrid/dom/fill'].map((n) => e[n]?.maxGzip)).toEqual([5050, 3100]);
    expect(['@dzgrid/dom/pinned-rows', '@dzgrid/core', '@dzgrid/dom', '@dzgrid/dom/edit', '@dzgrid/core/state'].map((n) => e[n]?.maxGzip)).toEqual([2200, 29150, 22400, 4150, 1500]); // pinned-rows 2 200 since Q9-6
    expect(['@dzgrid/dom/pinned-rows', '@dzgrid/dom/edit'].map(ceilingFor)).toEqual([2300, 4150]);
  });

  it('the K.8 profile guard: 83 500 (Q17a), 84 000 since Q8-5, 84 150 since Q9-3, 84 300 since the owner\'s look (the real example\'s 92 500, S12-Q10, is guarded by example:bytes, not here)', () => {
    expect(ceilingFor('profile: audit screen (K.8)')).toBe(84300); // the owner's look (2026-10-27)
    expect(sizeBudget(79000, ceilingFor('profile: audit screen (K.8)'))).toBe(84300); // 86 900 → 84 300
    expect(() => sizeBudget(84301, ceilingFor('profile: audit screen (K.8)'))).toThrow(/ceiling/);
  });

  it('Phase 6 step 9, owner Q9-5 / Q9-6: dom/tree 3 850 (the sticky copies capped in pixels), dom/pinned-rows 2 200 (compression alone)', () => {
    expect(ceilingFor('@dzgrid/dom/tree')).toBe(3850);
    const e = (JSON.parse(readFileSync(new URL('../../size-budget.json', import.meta.url), 'utf8')) as { entries: Record<string, { maxGzip: number | null }> }).entries;
    expect(['@dzgrid/dom/tree', '@dzgrid/dom/pinned-rows'].map((n) => e[n]?.maxGzip)).toEqual([3850, 2200]);
  });

  it('Phase 6 step 9 (owner Q-B, Q9-3): @dzgrid/dom/auto-height 1 400 over the DOM base (core/detail outside it), the K.8 guard 84 150', () => {
    expect(ceilingFor('@dzgrid/dom/auto-height')).toBe(1400);
    const e = (JSON.parse(readFileSync(new URL('../../size-budget.json', import.meta.url), 'utf8')) as { entries: Record<string, { file?: string; maxGzip: number | null; over?: string; external?: string[] }> }).entries;
    expect(e['@dzgrid/dom/auto-height']).toMatchObject({ file: 'packages/dom/src/auto-height.ts', over: '@dzgrid/dom' });
    expect(e['@dzgrid/dom/auto-height']!.maxGzip).toBeLessThanOrEqual(1400);
    expect(e['@dzgrid/dom/auto-height']!.external).toEqual(expect.arrayContaining(['@dzgrid/core', '@dzgrid/core/detail']));
    expect(e['profile: audit screen (K.8)']!.maxGzip).toBe(84300); // the owner's look
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
    expect(budget.entries['@dzgrid/core'].maxGzip).toBe(CORE); // 26 986 + 10 % capped at the Phase 4 ceiling
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
    // Phase 5 step 13 (the close): the history lives in ROADMAP « Final budgets (Phase 5) » (the Phase 4 one
    // before it); the comment names the Phase 5 rule (Q16: measure + 10 %, rounded up to 50, never above the
    // owner's grants) and stays short.
    expect(budget.$comment.length).toBeLessThan(600);
    expect(budget.$comment).toMatch(/10 %/);
    expect(budget.$comment).toMatch(/rounded up to 50 B/);
    expect(budget.$comment).toMatch(/2026-10-22/);
    expect(budget.$comment).toMatch(/ROADMAP/);
    expect(budget.$comment).toMatch(/Final budgets \(Phase 5\)/);
    expect(budget.$comment).toMatch(/docs\/phase-5-steps\/decisions\.md/);
    expect(budget.$comment).toMatch(/Q16/);
    expect(budget.$comment).toMatch(/83 500/);
    expect(budget.$comment).not.toMatch(/Final budgets \(Phase 4\)/);
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

  it("the owner's-look budgets (decisions.md, 2026-10-27): filters 10 100, the set chunk 4 250, the date adapters 2 800, K.8 84 300; the theme and the popup host unchanged", () => {
    type Entry = { maxGzip: number | null };
    const e = (JSON.parse(readFileSync(new URL('../../size-budget.json', import.meta.url), 'utf8')) as { entries: Record<string, Entry> }).entries;
    const names = ['@dzgrid/dom/filters', '@dzgrid/dom/filters: set (lazy)', '@dzgrid/dom/filters: date adapters (lazy)', 'profile: audit screen (K.8)'];
    expect(names.map(ceilingFor)).toEqual([10100, 4250, 2800, 84300]);
    expect(names.map((n) => e[n]?.maxGzip)).toEqual([10100, 4250, 2800, 84300]);
    expect(['@dzgrid/theme', '@dzgrid/dom/popup', '@dzgrid/dom'].map((n) => e[n]?.maxGzip)).toEqual([2750, 1650, 22400]);
  });
});
