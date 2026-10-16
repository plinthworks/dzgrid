/**
 * Builds every package into its own dist/, ready for `npm publish dist`.
 *
 * Same shape as tzslot's and DzCalendar's: package.json in the repository
 * points at the TypeScript sources (what the workspace and tests need); what
 * npm receives is compiled JavaScript with declarations and a manifest written
 * here. Packages join the list as their phase arrives.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not .pathname: a folder with a space would come back as %20.
const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = (name) => join(root, 'packages', name);
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

// In dependency order: the DOM layer compiles against the core's built declarations.
const PACKAGES = ['core', 'dom'];

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
      './package.json': './package.json',
    },
    ...(source.dependencies && { dependencies: source.dependencies }),
    ...(source.peerDependencies && { peerDependencies: source.peerDependencies }),
  };
  writeFileSync(join(dir, 'dist', 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  extras(name);
}

for (const name of PACKAGES) typescript(name);

for (const name of PACKAGES) {
  const manifest = read(join(pkg(name), 'dist', 'package.json'));
  // A published manifest that points at src/ points at a file npm never received.
  const entries = JSON.stringify([manifest.main, manifest.module, manifest.types, manifest.exports]);
  if (entries.includes('src/')) {
    console.error(`packages/${name}/dist/package.json still points at src/`);
    process.exit(1);
  }
  // K.10: the core, the DOM layer and the theme ship with no runtime dependency.
  if (Object.keys(manifest.dependencies ?? {}).length > 0) {
    console.error(`packages/${name} has runtime dependencies: ${Object.keys(manifest.dependencies).join(', ')}`);
    process.exit(1);
  }
}
console.log(`\nBuilt: packages/{${PACKAGES.join(',')}}/dist`);
