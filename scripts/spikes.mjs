/**
 * Runs every spike's `run.mjs`, one after the other: timings taken while
 * another browser works are noise. `npm run spike -- s1 s9` runs only those.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../spikes', import.meta.url));
const only = process.argv.slice(2);
const spikes = readdirSync(dir)
  .filter((d) => /^s\d+-/.test(d) && existsSync(join(dir, d, 'run.mjs')))
  .filter((d) => !only.length || only.some((o) => d.startsWith(`${o}-`)))
  .sort((a, b) => Number(a.slice(1).split('-')[0]) - Number(b.slice(1).split('-')[0]));

let failed = 0;
for (const s of spikes) {
  console.log(`\n=== ${s}`);
  try {
    execFileSync('node', [join(dir, s, 'run.mjs')], { stdio: 'inherit' });
  } catch {
    failed++;
    console.error(`${s} failed`);
  }
}
process.exit(failed ? 1 : 0);
