import { defineConfig, type Plugin } from 'vite';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `/angular/`: the Angular fixture (step 22), served as built by
 * `node packages/angular/browser/build.mjs` (after `npm run build`), untouched by Vite: it is
 * an AOT application of its own, already bundled.
 */
const ANGULAR_BUILD = fileURLToPath(new URL('./packages/angular/browser/build/', import.meta.url));
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const angularFixture = (): Plugin => ({
  name: 'dzgrid-angular-fixture',
  configureServer(server) {
    server.middlewares.use('/angular', (req, res) => {
      const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]!));
      const file = join(ANGULAR_BUILD, path === '/' ? 'index.html' : path);
      if (!file.startsWith(ANGULAR_BUILD) || !existsSync(file) || !statSync(file).isFile()) {
        res.statusCode = 404;
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        res.end('Fixture Angular non construite : npm run build, puis node packages/angular/browser/build.mjs');
        return;
      }
      res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
      res.end(readFileSync(file));
    });
  },
});

// tzslot's playground is on 4500, DzCalendar's on 4600.
export default defineConfig({
  root: 'playground',
  plugins: [angularFixture()],
  resolve: {
    alias: [
      { find: '@dzgrid/core/server', replacement: fileURLToPath(new URL('./packages/core/src/server.ts', import.meta.url)) },
      { find: '@dzgrid/core/spans', replacement: fileURLToPath(new URL('./packages/core/src/spans.ts', import.meta.url)) },
      { find: '@dzgrid/core/csv', replacement: fileURLToPath(new URL('./packages/core/src/csv.ts', import.meta.url)) },
      { find: '@dzgrid/core/rules', replacement: fileURLToPath(new URL('./packages/core/src/rules.ts', import.meta.url)) },
      { find: '@dzgrid/core/internal', replacement: fileURLToPath(new URL('./packages/core/src/internal.ts', import.meta.url)) },
      { find: '@dzgrid/core', replacement: fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)) },
      { find: '@dzgrid/dom/spans', replacement: fileURLToPath(new URL('./packages/dom/src/spans.ts', import.meta.url)) },
      { find: '@dzgrid/dom/slots', replacement: fileURLToPath(new URL('./packages/dom/src/slots.ts', import.meta.url)) },
      { find: '@dzgrid/dom/search', replacement: fileURLToPath(new URL('./packages/dom/src/search.ts', import.meta.url)) },
      { find: '@dzgrid/dom/filters', replacement: fileURLToPath(new URL('./packages/dom/src/filters.ts', import.meta.url)) },
      { find: '@dzgrid/dom/export', replacement: fileURLToPath(new URL('./packages/dom/src/export.ts', import.meta.url)) },
      { find: '@dzgrid/dom/parts', replacement: fileURLToPath(new URL('./packages/dom/src/parts.ts', import.meta.url)) },
      { find: '@dzgrid/dom/rules', replacement: fileURLToPath(new URL('./packages/dom/src/rules.ts', import.meta.url)) },
      { find: '@dzgrid/dom/pagination', replacement: fileURLToPath(new URL('./packages/dom/src/pagination.ts', import.meta.url)) },
      { find: '@dzgrid/dom/internal', replacement: fileURLToPath(new URL('./packages/dom/src/internal.ts', import.meta.url)) },
      { find: /^@dzgrid\/dom\/locales\/(.*)$/, replacement: fileURLToPath(new URL('./packages/dom/src/locales/', import.meta.url)) + '$1.ts' },
      { find: '@dzgrid/dom', replacement: fileURLToPath(new URL('./packages/dom/src/index.ts', import.meta.url)) },
    ],
  },
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./playground/index.html', import.meta.url)),
        rtl: fileURLToPath(new URL('./playground/rtl.html', import.meta.url)),
        spans: fileURLToPath(new URL('./playground/spans.html', import.meta.url)),
        audit: fileURLToPath(new URL('./playground/audit.html', import.meta.url)),
      },
    },
  },
  server: { port: 4700, strictPort: true, fs: { allow: ['..'] } },
});
