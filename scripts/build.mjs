/**
 * Builds every package into its own dist/, ready for `npm publish dist`.
 *
 * Same shape as tzslot's and DzCalendar's: package.json in the repository
 * points at the TypeScript sources (what the workspace and tests need); what
 * npm receives is compiled JavaScript with declarations and a manifest written
 * here. Packages join the list as their phase arrives; the theme ships from
 * its own folder (its package.json lists its files) and has no build here.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entryProblems, manifestProblems, peerProblems, pinPeers } from './manifest.mjs';

// fileURLToPath, not .pathname: a folder with a space would come back as %20.
const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = (name) => join(root, 'packages', name);
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

/**
 * The TypeScript packages, in dependency order (the DOM layer compiles against
 * the core's built declarations), each with the subpaths it ships. The list
 * must match the source package.json's exports, and each entry must exist in
 * dist/ once built: a subpath is added here on purpose, never by accident.
 */
const PACKAGES = {
  core: ['.', './internal', './server', './spans', './csv'],
  dom: ['.', './popup', './spans', './locales/en', './locales/fr', './locales/ar'],
};
/** Built after the TypeScript packages, against their dist/ declarations. */
const ANGULAR = 'angular';

const shared = (name) => ({
  license: read(join(pkg(name), 'package.json')).license,
  keywords: ['data-grid', 'datagrid', 'table', 'spreadsheet', 'virtual-scroll', 'rtl', 'a11y'],
});

function extras(name) {
  for (const file of ['README.md', 'LICENSE']) {
    const own = join(pkg(name), file);
    const top = join(root, file);
    const source = existsSync(own) ? own : existsSync(top) ? top : null;
    if (source) cpSync(source, join(pkg(name), 'dist', file));
  }
}

function typescript(name) {
  const dir = pkg(name);
  rmSync(join(dir, 'dist'), { recursive: true, force: true });
  run('npx', ['tsc', '-p', join(dir, 'tsconfig.build.json')]);
  const source = read(join(dir, 'package.json'));
  const manifest = {
    name: source.name,
    version: source.version,
    description: source.description,
    ...shared(name),
    type: 'module',
    sideEffects: false,
    main: './index.js',
    module: './index.js',
    types: './index.d.ts',
    exports: {
      '.': { types: './index.d.ts', default: './index.js' },
      ...(source.exports?.['./internal'] && { './internal': { types: './internal.d.ts', default: './internal.js' } }),
      // Subpaths other than the root and internal, as the sources list them: `./locales/fr` → `./locales/fr.js`.
      ...Object.fromEntries(
        Object.keys(source.exports ?? {})
          .filter((k) => k !== '.' && k !== './internal')
          .map((k) => [k, { types: `${k}.d.ts`, default: `${k}.js` }]),
      ),
      './package.json': './package.json',
    },
    ...(source.dependencies && { dependencies: source.dependencies }),
    ...(source.peerDependencies && { peerDependencies: source.peerDependencies }),
  };
  writeFileSync(join(dir, 'dist', 'package.json'), JSON.stringify(pinPeers(manifest, VERSIONS), null, 2) + '\n');
  extras(name);
}

/**
 * The Angular package, through ng-packagr: partial compilation and
 * strictTemplates (tsconfig.lib.json), Angular Package Format in dist/ with
 * fesm2022/. Manifest cleaned as in tzslot.
 */
function angular() {
  const dir = pkg(ANGULAR);
  rmSync(join(dir, 'dist'), { recursive: true, force: true });
  run('npx', ['ng-packagr', '-p', 'ng-package.json', '-c', 'tsconfig.lib.json'], dir);
  // ng-packagr writes its manifest from the source one. The repository's main
  // and types point at the sources; ng-packagr's own exports, module and
  // typings are the ones that ship.
  const file = join(dir, 'dist', 'package.json');
  const manifest = read(file);
  delete manifest.main;
  delete manifest.types;
  Object.assign(manifest, shared(ANGULAR));
  writeFileSync(file, JSON.stringify(pinPeers(manifest, VERSIONS), null, 2) + '\n');
  extras(ANGULAR);
}

/** Each workspace package's version: a published peer names its sibling's. */
const VERSIONS = Object.fromEntries(
  readdirSync(join(root, 'packages')).filter((d) => existsSync(join(pkg(d), 'package.json'))).map((d) => {
    const p = read(join(pkg(d), 'package.json'));
    return [p.name, p.version];
  }),
);

/** The newest modification time under a folder. */
function newest(dir) {
  let t = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
  }
  return t;
}

const fail = (problems) => {
  if (problems.length === 0) return;
  for (const problem of problems) console.error(problem);
  process.exit(1);
};

// `--angular` (npm run build:angular) rebuilds the Angular package alone,
// against the core's and the DOM layer's dist/ from an earlier full build.
const angularOnly = process.argv.includes('--angular');
const built = angularOnly ? {} : PACKAGES;
if (angularOnly) {
  // Against a dist that exists whole and is newer than its sources: never against stale declarations.
  for (const [name, subpaths] of Object.entries(PACKAGES)) {
    for (const subpath of subpaths) {
      const file = join(pkg(name), 'dist', (subpath === '.' ? 'index' : subpath.slice(2)) + '.d.ts');
      if (!existsSync(file)) fail([`packages/${name}/dist is missing ${subpath}: run npm run build first`]);
    }
    if (newest(join(pkg(name), 'src')) > statSync(join(pkg(name), 'dist', 'index.d.ts')).mtimeMs) fail([`packages/${name}/src changed since its dist was built: run npm run build`]);
  }
}

for (const [name, subpaths] of Object.entries(built)) {
  fail(entryProblems(name, subpaths, read(join(pkg(name), 'package.json')).exports));
}

for (const name of Object.keys(built)) typescript(name);
angular();

for (const [name, subpaths] of Object.entries(built)) {
  const manifest = read(join(pkg(name), 'dist', 'package.json'));
  fail(manifestProblems(name, manifest));
  fail(peerProblems(name, manifest, VERSIONS));
  // Each declared entry was emitted, code and declarations.
  for (const subpath of subpaths) {
    const base = subpath === '.' ? 'index' : subpath.slice(2);
    for (const ext of ['.js', '.d.ts']) {
      if (!existsSync(join(pkg(name), 'dist', base + ext))) fail([`packages/${name}/dist/${base}${ext} is missing`]);
    }
  }
}
fail(manifestProblems(ANGULAR, read(join(pkg(ANGULAR), 'dist', 'package.json'))));
fail(peerProblems(ANGULAR, read(join(pkg(ANGULAR), 'dist', 'package.json')), VERSIONS));
const fesm = join(pkg(ANGULAR), 'dist', 'fesm2022');
if (!existsSync(fesm) || !readdirSync(fesm).some((f) => f.endsWith('.mjs'))) fail([`packages/${ANGULAR}/dist/fesm2022/*.mjs is missing`]);

const names = [...Object.keys(built), ANGULAR];
console.log(`\nBuilt: packages/{${names.join(',')}}/dist`);
