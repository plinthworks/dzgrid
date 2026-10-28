/**
 * The release: check, publish, verify (1.0.0, 2026-10-28; docs/release-1.0.0.md).
 *
 *   npm run release:check [-- --tag v1.0.0]   the four built manifests agree with each other and with the tag
 *   npm run publish:release [-- --dry-run]    publish what the registry does not have yet, then verify it arrived
 *   npm run publish:release -- --no-provenance --otp=123456   the same from a laptop (the first publication)
 *   npm run publish:verify                    the verification alone
 *
 * Run by .github/workflows/release.yml on a `v*` tag, after the gates, with npm's trusted publishing (OIDC): no
 * token is stored anywhere, and npm signs a provenance attestation (`publishConfig.provenance`). From a laptop (the
 * first publication's fallback), add `--no-provenance`: provenance needs the CI identity.
 *
 * Lessons from tzslot's releases (/Users/nadou/Dev/tzslot/scripts/publish.mjs): publish dependencies first, so a
 * half-finished release is still coherent; skip a version the registry already has, so a failed run is simply run
 * again; and a release is finished when the registry says so, not when `npm publish` printed something (the publish
 * is asynchronous, and a tarball can lag its metadata).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Dependencies before dependents. */
export const ORDER = ['core', 'dom', 'theme', 'angular'];

/** Where each package is published from: the build output, the theme from its own folder (its `files`). */
export const FOLDERS = { core: 'packages/core/dist', dom: 'packages/dom/dist', theme: 'packages/theme', angular: 'packages/angular/dist' };

/**
 * Problems with a release, as sentences; empty when it can go. `manifests`: `{ '@dzgrid/core': manifest, … }` as
 * they will be published; `tag`: the git tag that triggered the run (`v1.0.0`), or undefined from a laptop.
 */
export function releaseProblems(manifests, tag) {
  const problems = [];
  const version = manifests['@dzgrid/core']?.version;
  if (!version) return ['@dzgrid/core has no version'];
  if (version.includes('-')) problems.push(`${version} is a prerelease (a pack:local build?): run npm run build`);
  if (tag !== undefined && tag !== `v${version}`) problems.push(`tag ${tag} is not v${version}, the packages' version`);
  for (const [name, m] of Object.entries(manifests)) {
    if (m.version !== version) problems.push(`${name} is ${m.version}, not ${version}`);
    for (const [dep, range] of Object.entries(m.peerDependencies ?? {})) {
      if (dep.startsWith('@dzgrid/') && range !== `^${version}`) problems.push(`${name} asks ${dep} ${range}, not ^${version}`);
    }
  }
  return problems;
}

/** The packages to publish, in order: those whose registry listing (`{ core: ['0.9.0'], … }`) lacks `version`. */
export function toPublish(version, listed) {
  return ORDER.filter((n) => !(listed[n] ?? []).includes(version));
}

const root = fileURLToPath(new URL('..', import.meta.url));
const manifestOf = (n) => JSON.parse(readFileSync(join(root, FOLDERS[n], 'package.json'), 'utf8'));
const sleep = (ms) => new Promise((resume) => setTimeout(resume, ms));

/** The versions the registry lists for a package, bypassing every cache ([] for a package not there yet). */
async function listedVersions(n) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(`@dzgrid/${n}`)}`, { headers: { accept: 'application/json' }, cache: 'no-store' });
  if (response.status === 404) return { versions: [], latest: null, tarballs: {} };
  if (!response.ok) throw new Error(`the registry answered ${response.status} for @dzgrid/${n}`);
  const body = await response.json();
  const tarballs = Object.fromEntries(Object.entries(body.versions ?? {}).map(([v, m]) => [v, m.dist?.tarball]));
  return { versions: Object.keys(body.versions ?? {}), latest: body['dist-tags']?.latest ?? null, tarballs };
}

function check(tag) {
  const manifests = Object.fromEntries(ORDER.map((n) => [`@dzgrid/${n}`, manifestOf(n)]));
  const problems = releaseProblems(manifests, tag);
  for (const p of problems) console.error(`✖ ${p}`);
  if (problems.length) process.exit(1);
  console.log(`Release check: the four packages at ${manifests['@dzgrid/core'].version}${tag ? `, tag ${tag}` : ''}.`);
  return manifests['@dzgrid/core'].version;
}

async function publish(version, { dryRun, provenance, otp }) {
  const listed = Object.fromEntries(await Promise.all(ORDER.map(async (n) => [n, (await listedVersions(n)).versions])));
  const todo = toPublish(version, listed);
  for (const n of ORDER) if (!todo.includes(n)) console.log(`  @dzgrid/${n}@${version} is already on npm: skipped`);
  for (const n of todo) {
    console.log(`\nPublishing @dzgrid/${n}@${version}${dryRun ? ' (dry run)' : ''}`);
    const args = ['publish', '--access', 'public'];
    if (dryRun) args.push('--dry-run');
    if (!provenance) args.push('--provenance=false');
    if (otp) args.push(`--otp=${otp}`);
    const run = spawnSync('npm', args, { cwd: join(root, FOLDERS[n]), stdio: 'inherit' });
    if (run.status !== 0) {
      console.error(`\n✖ @dzgrid/${n} did not publish. The ones before it did; run the same command again once fixed:\n  what is already on npm is skipped.`);
      process.exit(1);
    }
  }
  return todo.length;
}

/** Waits (up to ten minutes each) until the registry lists every package at `version` and serves its tarball. */
async function verify(version) {
  console.log('\nAsking the registry what arrived (npm publishes asynchronously, so this waits).');
  let missing = 0;
  for (const n of ORDER) {
    const deadline = Date.now() + 600_000;
    let state = null;
    for (;;) {
      state = await listedVersions(n).catch(() => null);
      if (state?.versions.includes(version) || Date.now() > deadline) break;
      await sleep(10_000);
    }
    if (!state?.versions.includes(version)) { console.error(`  ✖ @dzgrid/${n}@${version} is NOT on npm`); missing++; continue; }
    if (!state.tarballs[version]) { console.error(`  ✖ @dzgrid/${n}@${version} is listed without a tarball URL`); missing++; continue; }
    let ok = false;
    while (!ok && Date.now() < deadline + 180_000) {
      ok = (await fetch(state.tarballs[version], { method: 'HEAD', cache: 'no-store' }).catch(() => null))?.ok ?? false;
      if (!ok) await sleep(5_000);
    }
    if (!ok) { console.error(`  ✖ @dzgrid/${n}@${version} is listed but its tarball is not served`); missing++; continue; }
    console.log(`  ✔ @dzgrid/${n}@${version} is there and installable${state.latest === version ? '' : ` (latest is ${state.latest})`}`);
  }
  if (missing) {
    console.error(`\n${missing} of ${ORDER.length} packages are missing: the others ask for them, so they cannot be installed yet.`);
    process.exit(1);
  }
  console.log('\nAll four are on npm.');
}

const main = async () => {
  const [command, ...rest] = process.argv.slice(2);
  const tagArg = rest.find((a) => a.startsWith('--tag='))?.slice(6) ?? (rest.includes('--tag') ? rest[rest.indexOf('--tag') + 1] : undefined);
  const tag = tagArg ?? (process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined);
  const dryRun = rest.includes('--dry-run');
  const provenance = !rest.includes('--no-provenance');
  // A laptop with two-factor auth on writes: one code for the four (tzslot's lesson: a prompt per package expires).
  const otp = rest.find((a) => a.startsWith('--otp='))?.slice(6);
  if (command === 'check') return void check(tag);
  if (command === 'verify') return verify(check(tag));
  if (command === 'publish') {
    const version = check(tag);
    await publish(version, { dryRun, provenance, otp });
    if (!dryRun) await verify(version);
    return;
  }
  console.error('Usage: node scripts/release.mjs check|publish|verify [--tag vX.Y.Z] [--dry-run] [--no-provenance] [--otp=123456]');
  process.exit(1);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
