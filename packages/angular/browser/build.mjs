/**
 * The Angular browser fixture (step 22), built as an application would be, without the Angular
 * CLI (S6's pipeline, spikes/s6-angular-cells/build.mjs):
 *   1. ngc compiles the fixture ahead of time (full mode, strictTemplates), against the built
 *      packages' declarations — `npm run build` first;
 *   2. the Angular linker (Babel plugin from compiler-cli) turns partial declarations into full
 *      ones: Angular's own packages and @dzgrid/angular's fesm2022, as the CLI does;
 *   3. esbuild bundles and minifies with ngDevMode false.
 * `@dzgrid/angular` is the shipped fesm2022; the core and the DOM layer come through the workspace.
 */
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { transformAsync } from '@babel/core';
import linkerPlugin from '@angular/compiler-cli/linker/babel';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = fileURLToPath(new URL('../../..', import.meta.url));
const fesm = `${root}packages/angular/dist/fesm2022/dzgrid-angular.mjs`;

const linker = {
  name: 'angular-linker',
  setup(b) {
    b.onLoad({ filter: /(node_modules[\\/]@angular[\\/].*|dzgrid-angular)\.mjs$/ }, async (args) => {
      const code = readFileSync(args.path, 'utf8');
      if (!code.includes('ɵɵngDeclare')) return { contents: code, loader: 'js' };
      const out = await transformAsync(code, { filename: args.path, babelrc: false, configFile: false, compact: false, sourceMaps: false, plugins: [linkerPlugin] });
      return { contents: out.code, loader: 'js' };
    });
  },
};

export async function buildFixture() {
  if (!existsSync(fesm)) throw new Error('packages/angular/dist is missing: run npm run build first');
  rmSync(`${here}build`, { recursive: true, force: true });
  execFileSync(process.execPath, [`${root}node_modules/@angular/compiler-cli/bundles/src/bin/ngc.js`, '-p', `${here}tsconfig.json`], { stdio: 'inherit' });
  await build({
    entryPoints: [`${here}build/ngc/main.js`],
    outfile: `${here}build/main.js`,
    bundle: true,
    format: 'esm',
    minify: true,
    target: 'es2022',
    legalComments: 'none',
    absWorkingDir: root,
    alias: { '@dzgrid/angular': fesm },
    define: { ngDevMode: 'false', ngJitMode: 'false', ngI18nClosureMode: 'false', ngServerMode: 'false' },
    logLevel: 'warning',
    plugins: [linker],
  });
  mkdirSync(`${here}build`, { recursive: true });
  writeFileSync(`${here}build/index.html`, readFileSync(`${here}index.html`, 'utf8'));
  copyFileSync(`${root}packages/theme/dzgrid.css`, `${here}build/dzgrid.css`);
  const js = readFileSync(`${here}build/main.js`);
  return { bytes: statSync(`${here}build/main.js`).size, gzip: gzipSync(js).length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(await buildFixture());
