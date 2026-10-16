/**
 * Production build of the S6 page, without the Angular CLI:
 *   1. ngc (@angular/compiler-cli) compiles the sources ahead of time — templates
 *      become Ivy instructions, no JIT compiler in the page;
 *   2. the Angular linker (Babel plugin from compiler-cli) turns the packages'
 *      partial declarations (ɵɵngDeclare*) into full definitions — what the CLI
 *      does; without it the page asks for the JIT compiler;
 *   3. esbuild bundles and minifies, with ngDevMode / ngJitMode defined false so
 *      the dev-mode checks are removed, as the CLI does.
 * (@analogjs/vite-plugin-angular 2.8 needs @angular/build, which is not installed.)
 */
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { readFileSync, rmSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { transformAsync } from '@babel/core';
import linkerPlugin from '@angular/compiler-cli/linker/babel';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = fileURLToPath(new URL('../..', import.meta.url));

const linker = {
  name: 'angular-linker',
  setup(b) {
    b.onLoad({ filter: /node_modules[\\/]@angular[\\/].*\.mjs$/ }, async (args) => {
      const code = readFileSync(args.path, 'utf8');
      if (!code.includes('ɵɵngDeclare')) return { contents: code, loader: 'js' };
      const out = await transformAsync(code, {
        filename: args.path,
        babelrc: false,
        configFile: false,
        compact: false,
        sourceMaps: false,
        plugins: [linkerPlugin],
      });
      return { contents: out.code, loader: 'js' };
    });
  },
};

export async function buildPage() {
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
    define: { ngDevMode: 'false', ngJitMode: 'false', ngI18nClosureMode: 'false', ngServerMode: 'false' },
    logLevel: 'warning',
    plugins: [linker],
  });
  mkdirSync(`${here}build`, { recursive: true });
  writeFileSync(`${here}build/index.html`, readFileSync(`${here}index.html`, 'utf8').replace('./src/main.ts', './main.js'));
  const js = readFileSync(`${here}build/main.js`);
  return { bytes: statSync(`${here}build/main.js`).size, gzip: gzipSync(js).length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(await buildPage());
