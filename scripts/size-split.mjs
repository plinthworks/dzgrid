/**
 * The split mode of size.mjs (step 18, K.8, owner Q1): a screen's profile built the way an app
 * ships it — bundled, code-split, minified, tzslot included — and gzipped file by file. The
 * initial load is the entry's file and every chunk it reaches by static imports (never a dynamic
 * one), plus its CSS: what loads before the first gesture. The chunks only a dynamic import
 * reaches are lazy: measured and printed beside it, never in the initial sum.
 */
import { build } from 'esbuild';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
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

/** A package's build, the only kind of file `shipped` may name. */
const SHIPPED = /^packages\/([^/]+)\/dist\//;

/** The newest modification time under a folder. */
const newest = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((t, e) => Math.max(t, e.isDirectory() ? newest(join(dir, e.name)) : statSync(join(dir, e.name)).mtimeMs), 0);

/**
 * A built file (`packages/<p>/dist/…`, the Angular package's fesm2022, step 22): measured as it
 * ships, so it must exist and be newer than its package's sources, or the measure would lie.
 * Null when it is fresh, or not a package's build at all.
 */
export function stale(file, root) {
  const m = SHIPPED.exec(file ?? '');
  if (!m) return null;
  if (!existsSync(root + file)) return `${file} is missing: run npm run build`;
  return newest(join(root, 'packages', m[1], 'src')) > statSync(root + file).mtimeMs ? `${file} is older than packages/${m[1]}/src: run npm run build` : null;
}

/** Each `shipped` file must be a package's build (`packages/<p>/dist/`), there and fresh. */
export function shippedProblems(entry, root) {
  return (entry.shipped ?? []).map((f) => (SHIPPED.test(f) ? stale(f, root) : `${f}: a shipped file must be a package's build (packages/<p>/dist/)`)).filter(Boolean);
}

/** Does an esbuild `external` pattern (one `*` wildcard at most) take a DzGrid package out? */
const dropsDzgrid = (pattern) => {
  if (pattern.includes('@dzgrid')) return true;
  const re = new RegExp(`^${pattern.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return ['@dzgrid/core', '@dzgrid/dom', '@dzgrid/angular', '@dzgrid/theme'].some((p) => re.test(p));
};

/**
 * What the entry's options would hide: an `alias` to a file `shipped` does not list (a stub would
 * stand in for the package), an `external` pattern that takes a DzGrid package out of the count.
 */
export function entryProblems(entry) {
  const shipped = entry.shipped ?? [];
  const problems = [];
  for (const [k, v] of Object.entries(entry.alias ?? {})) if (!shipped.includes(v)) problems.push(`alias ${k} -> ${v}: not listed in shipped`);
  for (const p of entry.external ?? []) if (dropsDzgrid(p)) problems.push(`external ${p}: matches @dzgrid/, its code would leave the count`);
  return problems;
}

/**
 * A split entry as size.mjs measures it: its shipped files checked first (missing or stale, the
 * build is not run: `measured: false`, the problems say why), then measureSplit.
 */
export async function measureSplitEntry(entry, root) {
  const problems = shippedProblems(entry, root);
  if (problems.length) return { measured: false, problems };
  return { measured: true, ...(await measureSplit(entry, root)) };
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
  return { initial, lazy, css, initialGzip: initial.reduce((s, f) => s + f.gz, 0) + css, problems: [...entryProblems(entry), ...splitProblems(out.metafile, entry.shipped ?? [])] };
}
