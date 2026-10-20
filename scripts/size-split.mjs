/**
 * The split mode of size.mjs (step 18, K.8, owner Q1): a screen's profile built the way an app
 * ships it — bundled, code-split, minified, tzslot included — and gzipped file by file. The
 * initial load is the entry's file and every chunk it reaches by static imports (never a dynamic
 * one), plus its CSS: what loads before the first gesture. The chunks only a dynamic import
 * reaches are lazy: measured and printed beside it, never in the initial sum.
 */
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';

const gz = (bytes) => gzipSync(bytes, { level: 9 }).length;

/**
 * What would make the measure lie: a built file or a linked package instead of the source, code
 * counted twice. `shipped`: built files measured on purpose, as they ship (the Angular wrapper's
 * fesm2022, partial-compiled by ng-packagr: its source is not what an application bundles).
 */
export function splitProblems(metafile, shipped = []) {
  const problems = [];
  const owner = new Map();
  for (const [out, o] of Object.entries(metafile.outputs)) {
    if (out.endsWith('.map')) continue;
    for (const input of Object.keys(o.inputs)) {
      // Our own packages from their source: a third-party dependency (tzslot's) may ship dist/.
      if (!input.includes('node_modules/') && /(^|\/)dist\//.test(input) && !shipped.includes(input)) problems.push(`${input}: a built file (dist/), not the source`);
      else if (input.includes('node_modules/@dzgrid/')) problems.push(`${input}: through node_modules/@dzgrid/, not the workspace source`);
      else if (owner.has(input)) problems.push(`${input}: in two chunks (${owner.get(input)}, ${out})`);
      owner.set(input, out);
    }
  }
  return problems;
}

/**
 * `entry`: `{ file, css?, external?, alias?, shipped? }`, paths from `root`. `external`: packages the
 * application has anyway (Angular, rxjs), left out; `alias`: a specifier measured from a given file
 * (a package's shipped build), which `shipped` must list. Returns the initial files, the lazy
 * ones, the CSS and the initial sum.
 */
export async function measureSplit(entry, root) {
  const alias = Object.fromEntries(Object.entries(entry.alias ?? {}).map(([k, v]) => [k, root + v]));
  const out = await build({
    entryPoints: [root + entry.file], absWorkingDir: root, outdir: `${root}.size-split`, bundle: true, splitting: true,
    external: entry.external ?? [], alias,
    format: 'esm', target: 'es2022', minify: true, treeShaking: true, write: false, metafile: true, logLevel: 'error',
  });
  const bytes = new Map(out.outputFiles.map((f) => [f.path.slice(root.length), f.contents]));
  const outputs = out.metafile.outputs;
  const js = Object.keys(outputs).filter((p) => p.endsWith('.js'));
  const file = (p) => ({ path: p, inputs: Object.keys(outputs[p].inputs).sort(), gz: gz(bytes.get(p)), min: bytes.get(p).length, label: outputs[p].entryPoint ?? null });
  const start = js.find((p) => outputs[p].entryPoint === entry.file);
  if (!start) throw new Error(`size-split: no output for ${entry.file}`);
  const seen = new Set([start]);
  for (const p of seen) for (const i of outputs[p].imports) if (i.kind === 'import-statement' && !i.external && !seen.has(i.path)) seen.add(i.path);
  const initial = [...seen].map(file);
  // A lazy chunk's first use downloads it and what it imports statically, less what the page has.
  const firstUse = (p) => {
    const got = new Set([p]);
    for (const q of got) for (const i of outputs[q].imports) if (i.kind === 'import-statement' && !i.external && !seen.has(i.path)) got.add(i.path);
    return [...got].reduce((s, q) => s + gz(bytes.get(q)), 0);
  };
  const lazy = js.filter((p) => !seen.has(p)).map((p) => ({ ...file(p), firstUse: firstUse(p) }))
    .map((f) => ({ ...f, label: f.label ?? `shared lazy chunk (${f.inputs.length} modules: ${f.inputs.slice(0, 2).join(', ')}${f.inputs.length > 2 ? '…' : ''})` }));
  let css = 0;
  for (const c of entry.css ?? []) {
    const r = await build({ entryPoints: [root + c], bundle: true, minify: true, write: false, logLevel: 'error' });
    css += gz(r.outputFiles[0].contents);
  }
  return { initial, lazy, css, initialGzip: initial.reduce((s, f) => s + f.gz, 0) + css, problems: splitProblems(out.metafile, entry.shipped ?? []) };
}
