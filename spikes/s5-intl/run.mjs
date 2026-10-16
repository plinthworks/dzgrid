// S5 — Intl in node and in Chrome, Firefox, WebKit: collation speed, numbering
// systems, forced Gregorian calendar, formatToParts code points, and the core's
// zoneDayBounds against the conformance cases plus a 2010–2030 sweep in 12 zones.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { serve, browser, record, ROOT } from '../kit.mjs';
import * as bench from './bench.js';

const casesDir = join(ROOT, 'conformance/cases/zone-day-bounds');
const cases = readdirSync(casesDir).map((f) => JSON.parse(readFileSync(join(casesDir, f), 'utf8')));

// The core, bundled for node (its imports end in .js, esbuild maps them to .ts).
async function nodeCore() {
  const out = await build({ entryPoints: [join(ROOT, 'packages/core/src/index.ts')], bundle: true, write: false, format: 'esm', platform: 'neutral' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
}

const only = process.argv.slice(2);
const engines = only.length ? only : ['node', 'chrome', 'firefox', 'webkit'];
const raw = {};
const site = await serve(import.meta.url);
for (const name of engines) {
  const t0 = performance.now();
  if (name === 'node') {
    raw.node = bench.runAll(await nodeCore(), cases);
  } else {
    // One browser at a time, always closed: the machine is shared.
    const b = await browser(name);
    try {
      const page = await b.newPage();
      await page.goto(site.url());
      await page.waitForFunction(() => window.ready);
      raw[name] = await page.evaluate((c) => window.run(c), cases);
      raw[name].userAgent = await page.evaluate(() => navigator.userAgent);
    } finally {
      await b.close();
    }
  }
  console.error(`${name}: ${Math.round(performance.now() - t0)} ms`);
}
await site.close();

// ---- cross-engine comparison ------------------------------------------------

const names = Object.keys(raw);
const ref = names[0];
const sweepDiffs = [];
for (const zone of bench.ZONES) {
  for (const n of names.slice(1)) {
    const a = raw[ref].sweep.zones[zone];
    const b = raw[n].sweep.zones[zone];
    let count = 0;
    let firstDiff = null;
    for (let i = 0; i < a.froms.length; i++) {
      if (a.froms[i] !== b.froms[i]) {
        count++;
        if (!firstDiff) firstDiff = { index: i, [ref]: a.froms[i], [n]: b.froms[i] };
      }
    }
    if (a.lastTo !== b.lastTo) count++;
    if (count) sweepDiffs.push({ zone, engine: n, vs: ref, count, firstDiff });
  }
}

const sameJson = (pick) => {
  const vals = names.map((n) => JSON.stringify(pick(raw[n])));
  const groups = {};
  names.forEach((n, i) => (groups[vals[i]] ??= []).push(n));
  return Object.keys(groups).length === 1 ? 'identical' : Object.values(groups);
};

const diffKeys = (section) => {
  const out = {};
  for (const k of Object.keys(raw[ref][section])) {
    const s = sameJson((r) => r[section][k]);
    if (s !== 'identical') out[k] = Object.fromEntries(names.map((n) => [n, raw[n][section][k]]));
  }
  return out;
};

const summary = {
  engines: Object.fromEntries(names.map((n) => [n, raw[n].userAgent ?? `${process.version} icu ${process.versions.icu} tz ${process.versions.tz}`])),
  conformance: Object.fromEntries(names.map((n) => [n, raw[n].conformance.filter((c) => !c.ok).map((c) => c.id)])),
  sweep: {
    days: raw[ref].sweep.days,
    perEngine: Object.fromEntries(names.map((n) => [n, Object.fromEntries(Object.entries(raw[n].sweep.zones).map(([z, v]) => [z, {
      usPerCall: v.usPerCall, lengths: v.lengths, anomalies: v.anomalies.length,
      firstAnomalies: v.anomalies.slice(0, 4),
    }]))])),
    crossEngineDiffs: sweepDiffs,
  },
  coldWarm: Object.fromEntries(names.map((n) => [n, raw[n].coldWarm])),
  collation: Object.fromEntries(names.map((n) => [n, {
    configs: raw[n].collation.configs.map((c) => `${c.locale} ${c.sensitivity}${c.numeric ? ' numeric' : ''}: ${c.ms} ms`),
    methods: raw[n].collation.methods,
  }])),
  collationOrderSameAcrossEngines: sameJson((r) => r.collation.configs.map((c) => c.order)),
  collationSamplesDiffs: (() => { const o = {}; for (const k of Object.keys(raw[ref].collation.samples)) { const s = sameJson((r) => r.collation.samples[k]); if (s !== 'identical') o[k] = Object.fromEntries(names.map((n) => [n, raw[n].collation.samples[k]])); } return o; })(),
  collationSamples: raw[ref].collation.samples,
  numberingDiffs: diffKeys('numbering'),
  calendarsDiffs: diffKeys('calendars'),
  partsDiffs: diffKeys('parts'),
};

// Full per-engine dumps without the sweep arrays (kept small).
const dir = fileURLToPath(new URL('results', import.meta.url));
mkdirSync(dir, { recursive: true });
for (const n of names) {
  const r = structuredClone(raw[n]);
  for (const z of Object.values(r.sweep.zones)) delete z.froms;
  writeFileSync(join(dir, `${n}.json`), JSON.stringify(r, null, 2) + '\n');
}
record(import.meta.url, summary);
