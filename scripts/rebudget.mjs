/**
 * The Phase 3 close (step 25): every budget set again from a measure, by the owner's rule
 * (docs/phase-3-steps/step25-decisions.md, Q2 and Q3).
 *
 *   node scripts/rebudget.mjs sizes [--from check-size.txt] [--file size-budget.json] [--write]
 *   node scripts/rebudget.mjs node bench1.txt bench2.txt bench3.txt [--file perf/budgets.json] [--write]
 *   node scripts/rebudget.mjs browser browser1.txt browser2.txt browser3.txt [--file perf/browser-budgets.json] [--write]
 *
 * Dry by default: prints old / measure / new and changes nothing; `--write` saves the file.
 * - Sizes: measure + 10 %, rounded up to 50 B, never above the owner's grants (Phase 6 close: an entry without one keeps
 *   its line as its ceiling; Phase 4 close,
 *   docs/phase-4-steps/decisions.md Q17b; Phase 5 close, docs/phase-5-steps/decisions.md Q16, Q-C2, Q-C3) or the plan's ceilings (ARCHITECTURE §5.2, K.8), never below
 *   the measure. Measured by size.mjs's own `measureEntries`, or read from a saved
 *   `npm run check:size` output (`--from`). Entries without a budget (maxGzip null) are kept.
 * - Node times (`npm run bench`, several runs: the median per line): max(m × 1.1, m + 0.5 ms) rounded
 *   up to the half-ms, for lines of 5 ms and more; the lines under 5 ms keep their ceiling (noise);
 *   memory lines are kept. A budgeted line must be read in every run, or nothing is written.
 * - Headless-Chrome times (`npm run bench:browser`, several runs: the median per line): ms lines at measure + 35 % to the half-ms,
 *   capped by the plan (§5.3, phase-3-plan §4); sub-ms lines, counts, percentages and megabytes keep
 *   their budget.
 * A measure above its ceiling is refused (exit 1), and so is a below-threshold line (Node < 5 ms,
 * Chrome sub-ms) measured above the budget it keeps: a budget never hides a breach.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// ---------------------------------------------------------------- sizes

/**
 * The ceilings a size budget never goes above. Phase 4 close (owner decision 2026-10-22,
 * docs/phase-4-steps/decisions.md Q17b): the owner's grants for the entries he named; the plan's ceilings
 * (ARCHITECTURE §5.2) for the others. Phase 5 close (owner 2026-10-26, docs/phase-5-steps/decisions.md Q16,
 * Q-C2, Q-C3): the measure + 10 % everywhere, capped at the Phase 5 grants named below. K.8 (Q17a): the audit profile's guard stays 83 500; the real Angular
 * example's 92 500 (S12-Q10; S9-Q7 92 000) is guarded by `npm run example:bytes` (scripts/example.mjs), not here.
 */
const SIZE_CEILINGS = {
  '@dzgrid/core': 29150, // Phase 6 (owner Q-B, Q2 of step 8b, 2026-10-27): 29 000 → 29 150 for the pinned rows' seams
  '@dzgrid/core/server': 6200, // owner Q8-5 (2026-10-27): 6 200, pushed by compression with the base's fold seam; Phase 5 S2-O4: 6 000 → 6 100 (app context in a kind's wire, the server's stale order); owner E5-1 / E5-8 (2026-10-26): 6 150 for the hold seam (`rows.hold`, one request per restore; measured +56)
  '@dzgrid/core/csv': 2000, // Q7: « core/csv up to 2 000 »
  '@dzgrid/core/tree': 3500,
  '@dzgrid/core/tree-lazy': 1500,
  '@dzgrid/core/detail': 1050, // Phase 5 S2-O5: 1 000 → 1 050 (gzip noise over the grown core; its code unchanged)
  '@dzgrid/core/edit': 3160, // owner « set include only » (2026-10-29): 3 150 → 3 160 (`exclude: false` refused in compile); owner Q8-5 (2026-10-27): 3 150, compression with the fold seam; Phase 5 Q16: 3 000; owner S3-O4 (2026-10-23): 3 100 (the global refusal system)
  '@dzgrid/core/rules': 600, // Phase 5 close Q-C3 (2026-10-26): 550 → 600 by the close rule (the measure 512 + 10 %), accepted
  '@dzgrid/core/range': 4000, // Phase 5 Q16 (Part B): blocks of cells, TSV, the paste and fill plans; the line at the measure + 10 % at the close
  '@dzgrid/core/state': 1510, // owner « set include only » (2026-10-29): 1 500 → 1 510; Phase 6 (owner Q-B, 2026-10-26): GridState, pure (step 5)
  '@dzgrid/dom': 22400, // Phase 6 (owner Q-B, Q2 of step 8b): 21 980 → 22 400 (the pinned rows' base seams); before: showcase themes T7 (2026-10-23): 21 800 (Phase 5 Q16) → 21 980 (class hooks, the layer's wrapper)
  '@dzgrid/dom/filters': 10100, // the owner's-look budgets (2026-10-27, decisions.md): 10 000 → 10 100 (apply, the header box, the zone option)
  // The owner's look (2026-10-27): the set chunk 4 205 → 4 250 (one box, the search placeholder, the inert host), the
  // date adapters 2 745 → 2 800 (the FROM / TO placeholder); written grants, no longer the measure + 10 %.
  // Owner « set include only » (2026-10-29): the set chunk 4 250 → 4 350 (`exclude: false`: the list without its exclude mode).
  '@dzgrid/dom/filters: set (lazy)': 4350,
  '@dzgrid/dom/filters: date adapters (lazy)': 2850, // the owner's third look (2026-10-27, « Comfort stylesheet »): 2 800 → 2 850 (the FROM / TO input fills its field)
  '@dzgrid/dom/tree': 3950, // owner step 14/15 (2026-10-29): 3 850 → 3 950 (tree({ fixedOpen }), then step 15's spans and gaps); owner S8-O1 (2026-10-24): 3 700 → 3 800 (tree({ structure }), the field after the chevron, the edited name said); Q9-5 (2026-10-27): 3 850 (the sticky copies capped in pixels)
  '@dzgrid/dom/tree-lazy': 1000,
  '@dzgrid/dom/parts': 800, // Phase 5 close Q-C3 (2026-10-26): 700 → 800 by the close rule (the measure 689 + 10 %), accepted
  '@dzgrid/dom/detail': 4150, // owner S8-O3 (2026-10-24): 3 900 → 4 000 (a nested grid kept alive while it saves); S8-O7: → 4 150 (kept while refused, let go with its master or the grid around)
  // Phase 5 Q16: /editors 8 000; owner S4-O1 (2026-10-23): @dzgrid/dom/edit taken out of it, the two together ≤ 8 000.
  // Split at the step-4 measure: dom/edit 3 311 + 10 % → 3 650, /editors the rest.
  '@dzgrid/dom/edit': 4150, // owner S7-O1 (2026-10-24): 3 650 → 3 750 (saves end to end: tooltip, network reason, server reapply); S8-O1: → 4 000 (undo keys, focus, sentences); S8-O6: → 4 150 (measured 4 085)
  // Owner S6-O1 (2026-10-24): /editors 4 350 → 6 500 (dates, yes/no, list, the app's editors; DOM editing ~10 150, a
  // new grant over Q16's 8 000), measured over @dzgrid/dom/popup. S6-O5/O6: the lazy calendar 1 500 (inside Q16 d's
  // 2 600), @dzgrid/dom/internal at its measure + 50 up to 1 250 (the filters' loader moved in, not copied).
  '@dzgrid/dom/editors': 6720, // owner S7-O1 (2026-10-24): 6 500 → 6 650 (retry, a row gone while edited); QB5 (Part B, step 12): → 6 720 (bulk edit by Ctrl+Enter)
  '@dzgrid/dom/editors: calendar (lazy)': 1520, // feedback pass Q1 (owner, 2026-10-27): the lazy kits by the strict need (tzslot's lazy entry: the chunk's `ready`, measured 1 519)
  '@dzgrid/dom/internal': 1250,
  // Owner S6-O7 (2026-10-24): the list in its own entry, over the popup: its measure (1 254) + 10 %.
  '@dzgrid/dom/editors-list': 1400,
  // Phase 5 Q16 (written grant): the motion run chunk up to 3 500 (step 7: the saves' reasons, the saved flash).
  '@dzgrid/dom/motion-gsap: run (lazy)': 3500,
  // Phase 5 Q16: the editing texts 350 / 400 / 450; owner S4-O4 (2026-10-23): 560 / 630 / 810 (the step-4 measure + 10 %).
  '@dzgrid/dom/locales/en-edit': 560,
  '@dzgrid/dom/locales/fr-edit': 630,
  '@dzgrid/dom/locales/ar-edit': 900, // owner S8-O1 (2026-10-24): 810 → 900 only if the measure needs it (the undo sentences' five plural forms: 895)
  // Owner S4-O4: edit.css 1 350 (measured 1 231 at step 4), taken from the theme grants' unused part (S4-O2);
  // owner S5-O2 (2026-10-23): 1 700 with the field and the bubble of step 5; owner S6-O6 (2026-10-24): 2 100 (dates, list).
  // Owner S7-O1 (2026-10-24): a reserve up to 2 200, used for the owner's step-7 request (the saving border inside
  // the focus ring, measured 2 101). Owner step 14 (2026-10-29): 2 250 (the field of a row always open starts at the indent).
  '@dzgrid/theme/edit.css': 2250,
  // Owner S5-O3 (2026-10-23): the editors' texts (the 5 parse codes moved there from -edit), room for step 6.
  '@dzgrid/dom/locales/en-editors': 450,
  '@dzgrid/dom/locales/fr-editors': 500,
  '@dzgrid/dom/locales/ar-editors': 620,
  // Phase 5 Q16 (Part B): @dzgrid/dom/range 4 500 over the DOM base (selection 11a, clipboard 11b, fill 12; QB8: the fill
  // handle to its own entry if the three go over); the -range texts 350 / 400 / 500 and range.css 500 (Part B budgets, 2026-10-25).
  '@dzgrid/dom/range': 5200, // owner S11b-Q3 (2026-10-25): at most 4 800 with the clipboard (step 11b, measured 4 765); S12-Q14 (2026-10-26): 4 950 for the outside-press clear (measured 4 873); Phase 6 step 8b-2 (owner Q1, 2026-10-27): up to ~5 200 for blocks in the pinned bands (measured 5 002, line 5 050)
  // Owner S11b-Q5 (2026-10-25): the pasted-HTML reader a chunk loaded on demand, its line the measure + 10 % (422 → 500;
  // the step-11b review moved the long-text count there: 517 → 600).
  '@dzgrid/dom/range: html (lazy)': 600,
  '@dzgrid/dom/locales/en-range': 350,
  '@dzgrid/dom/locales/fr-range': 400,
  '@dzgrid/dom/locales/ar-range': 500,
  '@dzgrid/theme/range.css': 500,
  // Owner S12-Q1, S12-Q4 (2026-10-25): the fill handle, Ctrl+D / R, the fill mode and bulk's seam in their own entry over
  // dom/range; their texts and styles apart (the -range texts and range.css are full).
  '@dzgrid/dom/fill': 3150, // owner S12-Q9 (2026-10-25): 1 600 → 3 000 (measured 2 729); Phase 6 step 8b-2 (owner Q1, 2026-10-27): up to ~3 150 for the fill in the pinned bands (measured 3 042, line 3 100)
  '@dzgrid/dom/locales/en-fill': 250,
  '@dzgrid/dom/locales/fr-fill': 300,
  '@dzgrid/dom/locales/ar-fill': 380,
  '@dzgrid/theme/fill.css': 460, // owner S12-Q9: 300 → 460 (measured 415)
  // Phase 6 (owner Q-B, 2026-10-26): moving columns, keyboard resize, auto-size in their own entry over the DOM base
  // (part 1, step 2, stops at 2 300: step02-plan §4); its texts and styles apart, shared with the menu, chooser and groups.
  '@dzgrid/dom/columns': 4200, // owner Q6-6 (2026-10-27): 3 500 → 4 200 (step 6: the resize mode and auto-size, measured 3 996)
  '@dzgrid/dom/locales/en-columns': 600, // Q6-6: 500 → 550; Q8-1: 600 (the group texts)
  '@dzgrid/dom/locales/fr-columns': 720, // Q6-6: 600 → 650; Q8-1: 720
  '@dzgrid/dom/locales/ar-columns': 900, // Q6-6: 800 → 850; Q8-1: 900
  '@dzgrid/theme/columns.css': 1200, // Q6-6: 1 100 → 1 200 (the mode's outline)
  // Phase 6 step 3 (owner Q-B, Q3-2): the column menu over the popup host; its texts in their own bundles.
  '@dzgrid/dom/column-menu': 4300, // owner Q3-5 (2026-10-26): 3 000 → 4 300 (measured 3 951, the full menu kept)
  '@dzgrid/dom/locales/en-column-menu': 500, // Q3-5: 450 → 500
  '@dzgrid/dom/locales/fr-column-menu': 600, // Q3-5: 550 → 600
  '@dzgrid/dom/locales/ar-column-menu': 700, // Q3-5: 650 → 700
  // Phase 6 step 4 (owner Q-B, Q4-1, Q4-2, Q4-4): the column chooser over the popup host (4 000, up to 4 400 if needed);
  // its texts in the -columns bundles (500 / 600 / 800 kept), its look in its own columns-panel.css (measure + 10 %, ≤ 1 000).
  '@dzgrid/dom/columns-panel': 4400, // Q4-4: up to 4 400 used at the review of steps 3–4 (its own live status, auto-scroll loop: measured 4 282)
  '@dzgrid/theme/columns-panel.css': 1000,
  // Phase 6 step 5 (owner Q-B): the GridState feature, its storage and address helpers, over the DOM base (core/state outside it).
  '@dzgrid/dom/state': 1200, // owner « clearFilters/resetState » (2026-10-28): 1 150 → 1 200; before: owner E5-8 (2026-10-26): 800 → 1 150 (measured 1 058, one entry kept)
  '@dzgrid/theme': 2850, // the owner's third look (2026-10-27, « Comfort stylesheet »): 2 750 → 2 850 (the pinned edge, the field's ring, the magnifier); T7: inside Q16's 2 900, up to 3 050 if needed; Phase 5 close Q-C2 (2026-10-26): up to 2 750 (the measure 2 494 + 10 %)
  '@dzgrid/theme/midnight.css': 650, // T7
  '@dzgrid/theme/clinic.css': 650, // T7
  '@dzgrid/theme/tailwind.css': 500, // T7: each framework bridge
  '@dzgrid/theme/tailwind3.css': 500, // T7
  '@dzgrid/theme/bootstrap.css': 500, // T7
  '@dzgrid/angular': 7350, // owner « clearFilters/resetState » (2026-10-28): 7 300 → 7 350; before: Phase 6 step 12 (owner Q12-1, the Q-B grant): 7 300; before: owner T8 (2026-10-23): +50 for [rowClass]; D3 (2026-10-23): +50 for [rowHeight]; S9-Q6 (2026-10-25): editing, at most 7 000 = 6 250 + 650 (Q16) + 50 (T8) + 50 (D3); the budget line the measure + 50
  'profile: audit screen (K.8)': 84950, // owner « set include only » (2026-10-29): 84 900 → 84 950; before: owner « clearFilters/resetState » (2026-10-28): 84 800 → 84 900; before: Phase 6 step 12 (owner Q12-1): 84 800; before: the owner's third look (2026-10-27, « Comfort stylesheet »): 84 450; Q17a 83 500; Q-B / Q8-5 (2026-10-27): 84 000; Q9-3 (2026-10-27): 84 150 (auto height's base seam); the owner's look (2026-10-27): 84 300
  // `@dzgrid/dom/groups` (owner Q8-4, 2026-10-27): its measure + 10 %, no ceiling of its own (measured 1 893 → 2 100).
  // Phase 6 step 8b-1 (owner Q2, 2026-10-27): pinned rows over the DOM base, 2 000 (up to 2 300 only if editing needs
  // it: asked again); their own -pinned texts 120 / 140 / 170; pinned-rows.css about 450 (the line at its measure + 10 %).
  '@dzgrid/dom/pinned-rows': 2300, // Q2: 2 000, up to 2 300 for editing (8b-1 measured 2 080: the edit glue — the kernel's store, the band-bound Enter, `pinnedChanged`, the focus kept — weighs ~180 B of it)
  '@dzgrid/dom/locales/en-pinned': 120,
  '@dzgrid/dom/locales/fr-pinned': 140,
  '@dzgrid/dom/locales/ar-pinned': 170,
  '@dzgrid/theme/pinned-rows.css': 450, // its line the measure + 10 % (301 → 350)
  '@dzgrid/theme/dzgrid.comfort.css': 650, // the owner's third look (2026-10-27, « Comfort stylesheet »): the spinner and thin scroll bars, its line the measure + 10 % (551 → 650)
  // Phase 6 step 9 (owner Q-B, Q9-3): automatic row height over the DOM base, @dzgrid/core/detail's sparse layout outside it.
  '@dzgrid/dom/auto-height': 1400,
  // Phase 6 step 11 (owner Q-B): print over the DOM base; its -print texts; print.css and its unlayered twin, 400 each.
  '@dzgrid/dom/print': 1600,
  '@dzgrid/dom/locales/en-print': 150,
  '@dzgrid/dom/locales/fr-print': 150,
  '@dzgrid/dom/locales/ar-print': 200,
  '@dzgrid/theme/print.css': 400,
  '@dzgrid/theme/print.unlayered.css': 400,
  '@dzgrid/dom/spans': 5300, // Q-B: 4 950 → 5 300 for the phase; Q8-4: the fold UI moved out, measured 4 567
};

/** The plan's ceiling for an entry, or null. Every message bundle (locales/*) is ≤ 2 kB. */
export function ceilingFor(name) {
  if (name in SIZE_CEILINGS) return SIZE_CEILINGS[name];
  if (name.startsWith('@dzgrid/dom/locales/')) return 2000;
  return null;
}

/** measure + 10 % rounded up to 50 B, at most `ceiling`; a measure above the ceiling throws. */
export function sizeBudget(measure, ceiling = null) {
  if (ceiling !== null && measure > ceiling) throw new Error(`measure ${measure} B is above its ceiling ${ceiling} B`);
  // Integer math: measure × 1.1 in floating point overshoots (1500 × 1.1 = 1650.0000000000002 → 1700).
  const next = Math.ceil((measure * 11) / 500) * 50;
  return ceiling === null ? next : Math.max(measure, Math.min(next, ceiling));
}

const SIZE_COMMENT = (date) =>
  `Gzipped, minified bytes per entry, the whole entry bundled (external: what a consumer already has). Set by scripts/rebudget.mjs on ${date} (Phase 6 close): each budget is the measure + 10 %, rounded up to 50 B, never above the owner's grants (docs/phase-6-steps/decisions.md Q-B and the steps' grants; an entry without a grant keeps its line as its ceiling) or the plan's ceilings (ARCHITECTURE §5.2); the K.8 profile guard 84 950. A budget is raised only by a written decision; the history is in ROADMAP.md, « Phase 6 — close ».`;

/**
 * A new size-budget.json from `measures` (name → gz bytes). Returns the new document (the given one
 * untouched), the rows old / measure / new, and the budgeted entries without a measure (kept).
 */
export function rebudgetSizes(budget, measures, { date }) {
  const rows = [];
  const missing = [];
  const entries = {};
  for (const [name, entry] of Object.entries(budget.entries)) {
    if (entry.maxGzip === null || entry.maxGzip === undefined) {
      entries[name] = structuredClone(entry);
      continue;
    }
    const m = measures[name];
    if (typeof m !== 'number') {
      missing.push(name);
      entries[name] = structuredClone(entry);
      continue;
    }
    // Phase 6 close (owner Q-B: « reset to measure + 10 % at the close, never above »): an entry without a written grant
    // has its line as its ceiling — a close lowers lines, it never raises one nobody granted.
    const next = sizeBudget(m, ceilingFor(name) ?? entry.maxGzip);
    rows.push({ name, old: entry.maxGzip, measure: m, next });
    entries[name] = { ...structuredClone(entry), maxGzip: next };
  }
  const { $comment, entries: _, ...rest } = budget;
  return { budget: { ...('$comment' in budget ? { $comment: SIZE_COMMENT(date) } : {}), ...structuredClone(rest), entries }, rows, missing };
}

/** check:size's output → name → measured gz bytes (the initial load for a split entry). */
export function parseSizeOutput(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = /^(?:ok {2}|OVER) (.+?): (?:initial (\d+) B gz|\d+ B min, (\d+) B gz)/.exec(line);
    if (m) out[m[1]] = Number(m[2] ?? m[3]);
  }
  return out;
}

// ---------------------------------------------------------------- times

const half = (x) => Math.ceil(x * 2 - 1e-9) / 2;

/**
 * Node: max(m × 1.1, m + 0.5) to the half-ms for lines of 5 ms and more; under 5 ms, the ceiling
 * stays, and a measure above it throws.
 */
export function nodeTimeBudget(m, old) {
  if (m < 5) {
    if (m > old) throw new Error(`measure ${m} ms is above its kept budget ${old} ms`);
    return old;
  }
  return half(Math.max(m * 1.1, m + 0.5));
}

/**
 * The plan's targets for the headless-Chrome lines (ARCHITECTURE §5.3, phase-3-plan §4): a budget
 * never goes above them. 17.2 ms is 58 fps.
 */
export const BROWSER_CEILINGS = {
  'first render of A': 120,
  'first render of 1 000 000 rows': 1200,
  'sort click on 100 000 (numeric, warm): sort and events': 40,
  'set filter: open with 2 000 values to the next frame': 50,
  '"next" click to fetch called (server, C)': 17,
  'CSV export of A in the browser: wall': 700,
  'CSV export of A in the browser: longest task': 50,
  '<dz-grid> first render of A': 130,
  ...Object.fromEntries(['wheel scroll 50 px a frame', 'scrollbar drag 2 000 px a frame', 'horizontal scroll 50 px a frame', '1 000 000 rows (scaled), wheel-like scroll'].flatMap((s) => [
    [`${s}: median frame`, 17.2],
    [`${s}: p95 frame`, 25],
    ...(s.startsWith('1 000 000') ? [] : [[`${s}: script per frame`, 6]]),
  ])),
};

/**
 * Chrome: an ms line at measure + 35 % to the half-ms, at most its plan ceiling. Sub-ms lines keep
 * their ceiling, as in Node (a synchronous call; 0 for "no task over 50 ms"), and a sub-ms measure
 * above it throws; any other unit keeps its budget.
 */
export function browserBudget(name, m, unit, old) {
  if (unit !== 'ms') return old;
  if (m < 1) {
    if (m > old) throw new Error(`${name}: measure ${m} ms is above its kept budget ${old} ms`);
    return old;
  }
  const ceiling = BROWSER_CEILINGS[name] ?? null;
  if (ceiling !== null && m > ceiling) throw new Error(`${name}: measure ${m} ms is above its ceiling ${ceiling} ms`);
  const next = half(m * 1.35);
  return ceiling === null ? next : Math.max(m, Math.min(next, ceiling));
}

/** bench / bench:browser output → name → { value, unit } ('' for a line without a unit, as memory lines). */
export function parseBenchOutput(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = /^(?:ok {2}|OVER) (.+): (-?[\d.]+)(?: (\S+))? \(budget [^)]*\)$/.exec(line);
    if (m) out[m[1]] = { value: Number(m[2]), unit: m[3] ?? '' };
  }
  return out;
}

/** Several parsed runs → the median per line (the middle value; the lower middle for an even count). */
export function medianOfRuns(runs) {
  const names = new Set(runs.flatMap((r) => Object.keys(r)));
  const out = {};
  for (const name of names) {
    const seen = runs.map((r) => r[name]).filter(Boolean);
    const values = seen.map((s) => s.value).sort((a, b) => a - b);
    out[name] = { value: values[Math.floor((values.length - 1) / 2)], unit: seen[0].unit, runs: values.length };
  }
  return out;
}

const TIME_COMMENT = {
  node: (date) =>
    `Milliseconds, median of the runs, measured on a MINIFIED bundle in node (scripts/bench.mjs). Phase 3 close (${date}, owner decision step25-decisions.md Q2): each line of 5 ms and more is max(m × 1.1, m + 0.5 ms) rounded up to the half-ms, m the median of three npm run bench; the lines under 5 ms keep their ceiling (noise); memory lines kept. Set by scripts/rebudget.mjs; history and earlier decisions in ROADMAP.md.`,
  browser: (date) =>
    `Chrome, headless, dataset A at 1 280 × 720 (scripts/perf-browser.mjs). Phase 3 close (${date}, owner decision step25-decisions.md Q2): each ms line is the median of three runs + 35 % rounded up to the half-ms, never above the targets of ARCHITECTURE §5.3 and phase-3-plan §4 (17.2 ms a frame is 58 fps); sub-ms lines (and 0 for no task over 50 ms), counts, percentages and megabytes keep their budget. Set by scripts/rebudget.mjs; history in ROADMAP.md.`,
};

/** A new perf/budgets.json ('node') or perf/browser-budgets.json ('browser') from the measured lines. */
export function rebudgetTimes(kind, doc, measured, { date }) {
  const rows = [];
  const missing = [];
  const budgets = {};
  for (const [name, old] of Object.entries(doc.budgets)) {
    const m = measured[name];
    if (!m) {
      missing.push(name);
      budgets[name] = old;
      continue;
    }
    const next = kind === 'node' ? nodeTimeBudget(m.value, old) : browserBudget(name, m.value, m.unit, old);
    rows.push({ name, old, measure: m.value, unit: m.unit, next });
    budgets[name] = next;
  }
  const { $comment, budgets: _, ...rest } = doc;
  return { budget: { ...('$comment' in doc ? { $comment: TIME_COMMENT[kind](date) } : {}), ...structuredClone(rest), budgets }, rows, missing };
}

// ---------------------------------------------------------------- the command

const today = () => new Date().toISOString().slice(0, 10);

async function main(argv) {
  const [kind, ...rest] = argv;
  const flag = (n) => rest.includes(n);
  const opt = (n) => (rest.includes(n) ? rest[rest.indexOf(n) + 1] : null);
  const positional = rest.filter((a, i) => !a.startsWith('--') && !['--from', '--file', '--date'].includes(rest[i - 1]));
  const write = flag('--write');
  const date = opt('--date') ?? today();
  let result;
  let file;
  try {
    if (kind === 'sizes') {
      file = opt('--file') ?? `${ROOT}size-budget.json`;
      const budget = JSON.parse(readFileSync(file, 'utf8'));
      let measures;
      if (opt('--from')) measures = parseSizeOutput(readFileSync(opt('--from'), 'utf8'));
      else {
        const { measureEntries } = await import('./size.mjs');
        measures = {};
        for await (const r of measureEntries(budget)) if (r.gz !== null) measures[r.name] = r.gz;
      }
      result = rebudgetSizes(budget, measures, { date });
    } else if (kind === 'node' || kind === 'browser') {
      file = opt('--file') ?? `${ROOT}perf/${kind === 'node' ? 'budgets' : 'browser-budgets'}.json`;
      if (!positional.length) throw new Error(`rebudget ${kind}: give the saved bench output(s)`);
      const doc = JSON.parse(readFileSync(file, 'utf8'));
      const measured = medianOfRuns(positional.map((f) => parseBenchOutput(readFileSync(f, 'utf8'))));
      // A median of fewer runs than given is not the median asked for: a line one run printed in a
      // changed format (or not at all) is refused, not budgeted from the runs that remain.
      const partial = Object.keys(doc.budgets).filter((n) => measured[n] && measured[n].runs !== positional.length);
      if (partial.length) throw new Error(`budgeted line(s) read in fewer than ${positional.length} runs: ${partial.map((n) => `${n} (${measured[n].runs})`).join(', ')}; nothing written`);
      result = rebudgetTimes(kind, doc, measured, { date });
    } else throw new Error('usage: rebudget.mjs sizes|node|browser [...] [--write]');
  } catch (e) {
    console.error(`rebudget: ${e.message}`);
    return 1;
  }
  for (const r of result.rows) console.log(`${r.next > r.old ? 'raise' : r.next < r.old ? 'lower' : 'same '} ${r.name}: ${r.old} → measure ${r.measure}${r.unit ? ` ${r.unit}` : ''} → ${r.next}`);
  for (const n of result.missing) console.log(`kept  ${n}: no measure`);
  if (result.missing.length) {
    console.error(`rebudget: ${result.missing.length} budgeted line(s) without a measure: nothing written`);
    return 1;
  }
  if (write) {
    writeFileSync(file, `${JSON.stringify(result.budget, null, 2)}\n`);
    console.log(`written: ${file}`);
  } else console.log(`dry run: nothing written (--write saves ${file})`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));
