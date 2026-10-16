/**
 * What every spike needs: its folder served over http (module scripts do not
 * load from file://), a real browser, and a place to write what it measured.
 *
 *   import { serve, browser, record } from '../kit.mjs';
 *   const site = await serve(import.meta.url);           // serves this spike's folder
 *   const b = await browser('chrome');                   // 'chrome' | 'firefox' | 'webkit'
 *   const page = await b.newPage();
 *   await page.goto(site.url('index.html'));
 *   record(import.meta.url, { ... });                    // results/result.json
 *
 * TypeScript sources are served compiled on the fly with esbuild, so a spike
 * page can import `/packages/core/src/index.ts` and its own `.ts` files.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { chromium, firefox, webkit } from 'playwright-core';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
};

/**
 * Serves the repository root, so a page can reach both its spike folder and
 * the packages. `url(path)` is relative to the calling spike's folder.
 */
export async function serve(spikeUrl) {
  const spikeDir = dirname(fileURLToPath(spikeUrl));
  const server = createServer(async (req, res) => {
    try {
      const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
      let file = join(ROOT, path);
      if (!file.startsWith(ROOT)) throw new Error('outside');
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      let body = await readFile(file);
      if (extname(file) === '.ts') {
        // Imports inside the core end in .js (NodeNext style); serve them from the .ts.
        const out = await transform(body.toString(), { loader: 'ts', format: 'esm', target: 'es2022' });
        body = Buffer.from(out.code.replace(/(from\s+['"]\.{1,2}\/[^'"]+)\.js(['"])/g, '$1.ts$2'));
      }
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      // A .js import that only exists as .ts.
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path.endsWith('.js')) {
        res.writeHead(302, { location: path.replace(/\.js$/, '.ts') });
        return res.end();
      }
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const rel = spikeDir.slice(ROOT.length).split('\\').join('/');
  return {
    url: (p = 'index.html') => `http://127.0.0.1:${port}/${rel}/${p}`,
    root: (p) => `http://127.0.0.1:${port}/${p}`,
    close: () => new Promise((r) => server.close(r)),
  };
}

/** A real browser: system Chrome, or Playwright's Firefox and WebKit builds. */
export async function browser(name = 'chrome', options = {}) {
  const headless = options.headless ?? true;
  if (name === 'chrome') return chromium.launch({ channel: 'chrome', headless, args: options.args ?? [] });
  if (name === 'firefox') return firefox.launch({ headless });
  if (name === 'webkit') return webkit.launch({ headless });
  throw new Error(`unknown browser ${name}`);
}

/** Writes `results/result.json` next to the spike, and prints it. */
export function record(spikeUrl, result) {
  const dir = join(dirname(fileURLToPath(spikeUrl)), 'results');
  mkdirSync(dir, { recursive: true });
  const stamped = { at: new Date().toISOString(), node: process.version, ...result };
  writeFileSync(join(dir, 'result.json'), JSON.stringify(stamped, null, 2) + '\n');
  console.log(JSON.stringify(stamped, null, 2));
}

/** Median, and the p-th percentile, of a list of numbers. */
export const median = (xs) => percentile(xs, 50);
export function percentile(xs, p) {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return NaN;
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
