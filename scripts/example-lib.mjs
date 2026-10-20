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
 * styles left out (Angular's inlined critical CSS repeats part of the stylesheet).
 */
export function initialFiles(html) {
  const scripts = [];
  const styles = [];
  for (const m of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
    const tag = m[0];
    if (m[1].toLowerCase() === 'script') {
      const src = attr(tag, 'src');
      if (local(src) && !scripts.includes(src)) scripts.push(src);
      continue;
    }
    const rel = attr(tag, 'rel')?.toLowerCase();
    const href = attr(tag, 'href');
    if (!local(href)) continue;
    if (rel === 'modulepreload' && !scripts.includes(href)) scripts.push(href);
    if (rel === 'stylesheet' && !styles.includes(href)) styles.push(href);
  }
  return { scripts, styles };
}

const gz = (bytes) => gzipSync(bytes, { level: 9 }).length;

/** A browser build's page: `index.html`, or `index.csr.html` when the build has a server (the page rendered in the browser). */
export const indexOf = (browser) => join(browser, existsSync(join(browser, 'index.html')) ? 'index.html' : 'index.csr.html');

/** One build's first load (`dist/<name>/browser`): each initial file's gzip (level 9), JS and CSS summed. */
export function measureBuild(dir) {
  const browser = join(dir, 'browser');
  const { scripts, styles } = initialFiles(readFileSync(indexOf(browser), 'utf8'));
  const files = [...scripts, ...styles].map((f) => {
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

/** K.8 from the example's real builds: the default build less the baseline. */
export function measureExample(example) {
  const audit = measureBuild(join(example, 'dist/audit'));
  const baseline = measureBuild(join(example, 'dist/baseline'));
  return { audit, baseline, share: audit.total - baseline.total, wrapper: wrapperShare(join(example, 'dist/audit'), audit.files) };
}
