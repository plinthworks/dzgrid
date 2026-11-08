/**
 * A reference rebuild for size-angular.test.ts, written apart from size-split.mjs (L2, owner A): each
 * aliased shipped file linked by Angular's own linker (`@angular/compiler-cli/linker/babel`, its
 * default plugin) and given the Babel plugins of `ng build`'s advanced optimizations (called here one
 * by one, not through its JavaScriptTransformer), then bundled with the defines `ng build` sets in production; the initial load
 * summed the same way (the entry and its static chunks, plus the CSS).
 */
import { build } from 'esbuild';
import { transformAsync } from '@babel/core';
import linker from '@angular/compiler-cli/linker/babel';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

// Not exported by @angular/build: loaded by path, next to its package.json.
const require = createRequire(import.meta.url);
const ngBabel = require(join(dirname(require.resolve('@angular/build/package.json')), 'src/tools/babel/plugins/index.js'));

const gz = (b) => gzipSync(b, { level: 9 }).length;

/** The `sideEffects: false` of the nearest package.json, as esbuild reads it for `ng build`. */
function sideEffectFree(file) {
  for (let d = dirname(file); d !== dirname(d); d = dirname(d)) {
    try {
      return JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')).sideEffects === false;
    } catch {
      // no package.json here: one folder up
    }
  }
  return false;
}

export async function reference(entry, root) {
  const dir = join(root, '.size-ref');
  rmSync(dir, { recursive: true, force: true });
  const alias = {};
  try {
    for (const [k, v] of Object.entries(entry.alias ?? {})) {
      const linked = await transformAsync(readFileSync(root + v, 'utf8'), {
        filename: root + v, configFile: false, babelrc: false, compact: false,
        plugins: [
          [linker, { linkerJitMode: false, sourceMapping: false }],
          // In the order and with the options `ng build` gives them to a package that is not Angular's own.
          [ngBabel.markTopLevelPure, { topLevelSafeMode: true }], ngBabel.elideAngularMetadata, ngBabel.adjustTypeScriptEnums,
          [ngBabel.adjustStaticMembers, { wrapDecorators: sideEffectFree(root + v) }],
        ],
      });
      const out = join(dir, v);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, linked.code);
      alias[k] = out;
    }
    const r = await build({
      entryPoints: [root + entry.file], absWorkingDir: root, outdir: join(dir, 'out'), bundle: true, splitting: true, external: entry.external ?? [], alias,
      define: { ngDevMode: 'false', ngJitMode: 'false', ngServerMode: 'false', ngHmrMode: 'false' },
      format: 'esm', target: 'es2022', minify: true, treeShaking: true, write: false, metafile: true, logLevel: 'error',
    });
    const outputs = r.metafile.outputs;
    const bytes = new Map(r.outputFiles.map((f) => [f.path.slice(root.length), f.contents]));
    const start = Object.keys(outputs).find((p) => outputs[p].entryPoint === entry.file);
    const seen = new Set([start]);
    for (const p of seen) for (const i of outputs[p].imports) if (i.kind === 'import-statement' && !i.external) seen.add(i.path);
    let css = 0;
    for (const c of entry.css ?? []) css += gz((await build({ entryPoints: [root + c], bundle: true, minify: true, write: false, logLevel: 'error' })).outputFiles[0].contents);
    return [...seen].reduce((s, p) => s + gz(bytes.get(p)), 0) + css;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
