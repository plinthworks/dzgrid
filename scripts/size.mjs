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
/** One file, or several bundled together as one chunk (`files`: each as a namespace, so their exports cannot clash). */
const input = ({ file, files }) =>
  files ? { stdin: { contents: files.map((f, i) => `export * as m${i} from './${f}';`).join('\n'), resolveDir: root, loader: 'ts' } } : { entryPoints: [root + file] };
// `external`: packages a consumer already has (the DOM layer is measured without the core).
// `over`: an entry that builds on another one's modules (the core's /server on the core) is
// measured as what it adds to it: both bundled together, less the other alone.
// `without`: what the entry's own packages weigh in it: bundled with them, less bundled without
// them (tzslot's share of a lazy date kit, step 14).
for (const [name, entry] of Object.entries(budget.entries)) {
  const { maxGzip, external = [], over: base, without } = entry;
  let size = await bundle(input(entry), external);
  if (without) {
    const less = await bundle(input(entry), [...external, ...without]);
    size = { min: size.min - less.min, gz: size.gz - less.gz };
  }
  if (base) {
    const both = await bundle({ stdin: { contents: `export * from './${budget.entries[base].file}';\nexport * from './${entry.file}';`, resolveDir: root, loader: 'ts' } }, external);
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
