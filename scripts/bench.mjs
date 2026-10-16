/**
 * Runs perf/bench-entry.ts from a MINIFIED bundle in node and compares the
 * medians with perf/budgets.json; exits 1 over budget. Never measure the
 * sources directly: they are not what ships.
 *
 * A case is either a function, or `{ setup, run }`: `setup` runs before each
 * timed run, untimed (a cold cache, a fresh store), and its result is passed
 * to `run`. `MEMORY` cases return bytes; gc is exposed so heap readings are
 * taken after collection.
 */
import { build } from 'esbuild';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import v8 from 'node:v8';
import vm from 'node:vm';

v8.setFlagsFromString('--expose-gc');
globalThis.gc = vm.runInNewContext('gc');

const root = fileURLToPath(new URL('..', import.meta.url));
const { runs, budgets, memory = {} } = JSON.parse(readFileSync(join(root, 'perf/budgets.json'), 'utf8'));
const out = await build({ entryPoints: [join(root, 'perf/bench-entry.ts')], bundle: true, minify: true, format: 'esm', platform: 'node', target: 'es2022', write: false });
const dir = mkdtempSync(join(tmpdir(), 'dzgrid-bench-'));
const file = join(dir, 'bench.mjs');
writeFileSync(file, out.outputFiles[0].contents);
const { CASES, MEMORY = {} } = await import(pathToFileURL(file).href);
rmSync(dir, { recursive: true, force: true });

const only = process.argv.slice(2);
const wanted = (name) => !only.length || only.some((o) => name.toLowerCase().includes(o.toLowerCase()));

let over = 0;
for (const [name, c] of Object.entries(CASES)) {
  if (!wanted(name)) continue;
  const { setup, run } = typeof c === 'function' ? { setup: undefined, run: c } : c;
  run(setup?.()); // warm-up
  const times = [];
  for (let i = 0; i < runs; i++) {
    const ctx = setup?.();
    const t = performance.now();
    run(ctx);
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const budget = budgets[name];
  const ok = budget === undefined || median <= budget;
  if (!ok) over++;
  console.log(`${ok ? 'ok  ' : 'OVER'} ${name}: ${median.toFixed(1)} ms (budget ${budget ?? '—'})`);
}
for (const [name, fn] of Object.entries(MEMORY)) {
  if (!wanted(name)) continue;
  const bytes = fn();
  const budget = memory[name];
  const ok = budget === undefined || bytes <= budget;
  if (!ok) over++;
  console.log(`${ok ? 'ok  ' : 'OVER'} ${name}: ${bytes.toFixed(1)} (budget ${budget ?? '—'})`);
}
if (!only.length) {
  for (const name of Object.keys(budgets)) if (!(name in CASES)) { console.log(`MISSING ${name}`); over++; }
  for (const name of Object.keys(memory)) if (!(name in MEMORY)) { console.log(`MISSING ${name}`); over++; }
}
process.exit(over ? 1 : 0);
