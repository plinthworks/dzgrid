/**
 * The pure parts of scripts/example.mjs (step 23, docs/behaviors/angular-example.md), importable
 * by the tests: which files an Angular build loads first, and K.8 from the real build.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const attr = (tag, name) => new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag)?.[1] ?? null;
const local = (href) => href && !/^[a-z]+:|^\/\//i.test(href);

/**
 * The files a page loads before the first gesture, from its index.html: module scripts, module
 * preloads (the initial chunks), stylesheets. Once each, in page order; other origins and inline
 * styles left out (Angular's inlined critical CSS repeats part of the stylesheet). `entries`: the
 * module scripts alone; `preloads`: how many distinct modulepreload hints the page has.
 */
export function initialFiles(html) {
  const scripts = [];
  const styles = [];
  const entries = [];
  const hinted = new Set();
  for (const m of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
    const tag = m[0];
    if (m[1].toLowerCase() === 'script') {
      const src = attr(tag, 'src');
      if (local(src) && !scripts.includes(src)) scripts.push(src);
      if (local(src) && !entries.includes(src)) entries.push(src);
      continue;
    }
    const rel = attr(tag, 'rel')?.toLowerCase();
    const href = attr(tag, 'href');
    if (!local(href)) continue;
    if (rel === 'modulepreload') hinted.add(href);
    if (rel === 'modulepreload' && !scripts.includes(href)) scripts.push(href);
    if (rel === 'stylesheet' && !styles.includes(href)) styles.push(href);
  }
  return { scripts, styles, entries, preloads: hinted.size };
}

const gz = (bytes) => gzipSync(bytes, { level: 9 }).length;

/** A browser build's page: `index.html`, or `index.csr.html` when the build has a server (the page rendered in the browser). */
export const indexOf = (browser) => join(browser, existsSync(join(browser, 'index.html')) ? 'index.html' : 'index.csr.html');

/** Angular's index generator writes at most this many `modulepreload` hints (@angular/build's index-html-generator). */
export const PRELOAD_CAP = 10;

/**
 * The JS a page loads first, from the build's stats (esbuild's metafile, `--stats-json`): the
 * page's module scripts and every chunk they reach by static imports (as size-split.mjs does),
 * never a dynamic one. The page's own hints are kept too: the browser downloads them anyway.
 * Without stats, the page's hints alone, which Angular caps at ten: at the cap, the measure
 * cannot be sure and throws.
 */
export function initialScripts(dir, { scripts, entries, preloads }) {
  const stats = join(dir, 'stats.json');
  if (!existsSync(stats)) {
    if (preloads >= PRELOAD_CAP) throw new Error(`${dir}: ${preloads} modulepreload hints, Angular's cap: initial chunks past it are not on the page; build with --stats-json`);
    return scripts;
  }
  const outputs = JSON.parse(readFileSync(stats, 'utf8')).outputs ?? {};
  const key = (f) => Object.keys(outputs).find((k) => k === f || k === `browser/${f}`);
  const rel = (k) => k.replace(/^browser\//, '');
  const seen = new Set();
  for (const f of entries) {
    const k = key(f);
    if (!k) throw new Error(`${dir}: stats.json has no output for the page's script ${f}: a stale stats file?`);
    seen.add(k);
  }
  for (const k of seen) for (const i of outputs[k]?.imports ?? []) if (i.kind === 'import-statement' && !i.external && !seen.has(i.path)) seen.add(i.path);
  const all = [...scripts];
  for (const k of seen) if (!all.includes(rel(k))) all.push(rel(k));
  return all;
}

/** One build's first load (`dist/<name>/browser`): each initial file's gzip (level 9), JS and CSS summed. */
export function measureBuild(dir) {
  const browser = join(dir, 'browser');
  const page = initialFiles(readFileSync(indexOf(browser), 'utf8'));
  const files = [...initialScripts(dir, page), ...page.styles].map((f) => {
    const bytes = readFileSync(join(browser, f));
    return { file: f, min: bytes.length, gz: gz(bytes), css: f.endsWith('.css') };
  });
  const js = files.filter((f) => !f.css).reduce((s, f) => s + f.gz, 0);
  const css = files.filter((f) => f.css).reduce((s, f) => s + f.gz, 0);
  return { files, js, css, total: js + css };
}

/**
 * The wrapper's own share of the initial JS, for information: from the build's stats (esbuild's
 * metafile, `--stats-json`), the bytes @dzgrid/angular's modules leave in each initial file, and
 * that file's gzip scaled by the same fraction (an estimate: gzip does not split by module).
 */
export function wrapperShare(dir, files, pattern = /node_modules\/@dzgrid\/angular\//) {
  const stats = join(dir, 'stats.json');
  if (!existsSync(stats)) return { min: 0, gz: 0, estimated: true, missing: true };
  const outputs = JSON.parse(readFileSync(stats, 'utf8')).outputs ?? {};
  let min = 0;
  let share = 0;
  for (const f of files.filter((x) => !x.css)) {
    const key = Object.keys(outputs).find((k) => k === f.file || k.endsWith(`/${f.file}`));
    if (!key) continue;
    const mine = Object.entries(outputs[key].inputs ?? {}).filter(([path]) => pattern.test(path)).reduce((s, [, i]) => s + i.bytesInOutput, 0);
    min += mine;
    share += f.min ? (f.gz * mine) / f.min : 0;
  }
  return { min, gz: Math.round(share), estimated: true };
}

/**
 * A screen loaded on demand (Phase 5 step 9, owner S9-Q4: the « stock » screen): from the build's stats, the
 * chunk the first load imports dynamically whose modules match `pattern`, and every chunk it reaches by static
 * imports that the first load does not already hold; each file's gzip (level 9), summed. Measured apart from K.8.
 */
export function measureLazy(dir, pattern) {
  const browser = join(dir, 'browser');
  const first = measureBuild(dir).files.map((f) => f.file);
  const outputs = JSON.parse(readFileSync(join(dir, 'stats.json'), 'utf8')).outputs ?? {};
  const rel = (k) => k.replace(/^browser\//, '');
  const key = (f) => Object.keys(outputs).find((k) => rel(k) === rel(f));
  const dynamic = first.flatMap((f) => outputs[key(f)]?.imports ?? []).filter((i) => i.kind === 'dynamic-import' && !i.external).map((i) => key(i.path)).filter(Boolean);
  const root = dynamic.find((k) => Object.keys(outputs[k].inputs ?? {}).some((p) => pattern.test(p)));
  if (!root) throw new Error(`${dir}: no dynamic chunk holds ${pattern}`);
  const seen = new Set([root]);
  for (const k of seen) for (const i of outputs[k]?.imports ?? []) if (i.kind === 'import-statement' && !i.external && key(i.path) && !first.includes(rel(i.path))) seen.add(key(i.path));
  const files = [...seen].map((k) => {
    const bytes = readFileSync(join(browser, rel(k)));
    return { file: rel(k), min: bytes.length, gz: gz(bytes) };
  });
  return { files, total: files.reduce((s, f) => s + f.gz, 0) };
}

/** K.8 from the example's real builds: the default build less the baseline. */
export function measureExample(example) {
  const audit = measureBuild(join(example, 'dist/audit'));
  const baseline = measureBuild(join(example, 'dist/baseline'));
  return { audit, baseline, share: audit.total - baseline.total, wrapper: wrapperShare(join(example, 'dist/audit'), audit.files) };
}

/**
 * The example's lockfile without the `@dzgrid` packs (Phase 4 step 11): they keep one version (0.2.0) on every
 * pack, and a lock entry pins the old tarball's integrity, so npm served its cached copy of the previous
 * pack. Without the entries npm reads the tarballs just packed; every other entry is kept.
 */
export function forgetLocalPacks(lock) {
  const packages = Object.fromEntries(Object.entries(lock.packages ?? {}).filter(([k]) => !k.startsWith('node_modules/@dzgrid/')));
  return { ...lock, packages };
}
