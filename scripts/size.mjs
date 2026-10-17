/**
 * Measures each entry the way a consumer ships it — bundled, minified,
 * gzipped — against size-budget.json. Exits 1 over budget.
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const budget = JSON.parse(readFileSync(new URL('../size-budget.json', import.meta.url), 'utf8'));

const bundle = async (opts, external) => {
  const out = await build({ ...opts, bundle: true, minify: true, format: 'esm', target: 'es2022', write: false, treeShaking: true, external });
  const code = out.outputFiles[0].contents;
  return { min: code.length, gz: gzipSync(code, { level: 9 }).length };
};

let over = 0;
// `external`: packages a consumer already has (the DOM layer is measured without the core).
// `over`: an entry that builds on another one's modules (the core's /server on the core) is
// measured as what it adds to it: both bundled together, less the other alone.
for (const [name, { file, maxGzip, external = [], over: base }] of Object.entries(budget.entries)) {
  let size = await bundle({ entryPoints: [root + file] }, external);
  if (base) {
    const both = await bundle({ stdin: { contents: `export * from './${budget.entries[base].file}';\nexport * from './${file}';`, resolveDir: root, loader: 'ts' } }, external);
    const alone = await bundle({ entryPoints: [root + budget.entries[base].file] }, external);
    size = { min: both.min - alone.min, gz: both.gz - alone.gz };
  }
  const code = { length: size.min };
  const gz = size.gz;
  const ok = maxGzip === null || gz <= maxGzip;
  if (!ok) over++;
  console.log(`${ok ? 'ok  ' : 'OVER'} ${name}: ${code.length} B min, ${gz} B gz${base ? ` over ${base}` : ''} (budget ${maxGzip ?? 'recorded'})`);
}
process.exit(over ? 1 : 0);
