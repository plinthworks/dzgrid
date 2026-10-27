/**
 * `npm run pack:local` (after `npm run build`): the four packages as tarballs in `packed/`, each with a version of its
 * own (app-feedback 15): the next patch with a prerelease stamped to the second, `0.3.1-local.20261027170509`, and every
 * `@dzgrid/*` range pinned to it. Same version, same `file:` path, and npm kept an application's old integrity hash and
 * old peer ranges; a new version each time, and `npm install` takes the new bytes. The sources keep their version: the
 * manifests are rewritten in a staging copy, never in `dist/` or `packages/theme`.
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, renameSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The next patch of `base`, prerelease `local.<UTC stamp to the second>`. */
export function localVersion(base, now = new Date()) {
  const [maj, min, pat] = base.split('-')[0].split('.').map(Number);
  const stamp = now.toISOString().replace(/\D/g, '').slice(0, 14);
  return `${maj}.${min}.${pat + 1}-local.${stamp}`;
}

/** A copy of `m` at `version`, its `@dzgrid/*` dependencies and peers pinned to it. */
export function localManifest(m, version) {
  const pin = (deps) => deps && Object.fromEntries(Object.entries(deps).map(([k, v]) => [k, k.startsWith('@dzgrid/') ? version : v]));
  const out = { ...m, version };
  for (const k of ['dependencies', 'peerDependencies']) if (m[k]) out[k] = pin(m[k]);
  return out;
}

const main = () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const stage = join(root, 'packed.stage');
  const tmp = join(root, 'packed.tmp');
  rmSync(stage, { recursive: true, force: true });
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp);
  const base = JSON.parse(readFileSync(join(root, 'packages/core/package.json'), 'utf8')).version;
  const version = localVersion(base);
  const sources = { core: 'packages/core/dist', dom: 'packages/dom/dist', angular: 'packages/angular/dist', theme: 'packages/theme' };
  for (const [name, from] of Object.entries(sources)) {
    const dir = join(stage, name);
    // The theme's folder as npm would pack it (its `files`), without its tests.
    cpSync(join(root, from), dir, { recursive: true, filter: (p) => !/[\\/](node_modules|test)([\\/]|$)/.test(p.slice(join(root, from).length)) });
    const file = join(dir, 'package.json');
    writeFileSync(file, JSON.stringify(localManifest(JSON.parse(readFileSync(file, 'utf8')), version), null, 2) + '\n');
    execFileSync('npm', ['pack', '--pack-destination', tmp], { cwd: dir, stdio: ['ignore', 'ignore', 'inherit'] });
  }
  rmSync(stage, { recursive: true, force: true });
  rmSync(join(root, 'packed'), { recursive: true, force: true });
  renameSync(tmp, join(root, 'packed'));
  console.log(readdirSync(join(root, 'packed')).join('\n'));
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
