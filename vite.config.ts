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
      { find: '@dzgrid/core/xlsx', replacement: fileURLToPath(new URL('./packages/core/src/xlsx.ts', import.meta.url)) },
      { find: '@dzgrid/core/rules', replacement: fileURLToPath(new URL('./packages/core/src/rules.ts', import.meta.url)) },
      { find: '@dzgrid/core/tree', replacement: fileURLToPath(new URL('./packages/core/src/tree.ts', import.meta.url)) },
      { find: '@dzgrid/core/tree-lazy', replacement: fileURLToPath(new URL('./packages/core/src/tree-lazy.ts', import.meta.url)) },
      { find: '@dzgrid/core/detail', replacement: fileURLToPath(new URL('./packages/core/src/detail.ts', import.meta.url)) },
      { find: '@dzgrid/core/edit', replacement: fileURLToPath(new URL('./packages/core/src/edit.ts', import.meta.url)) },
      { find: '@dzgrid/core/range', replacement: fileURLToPath(new URL('./packages/core/src/range.ts', import.meta.url)) },
      { find: '@dzgrid/core/state', replacement: fileURLToPath(new URL('./packages/core/src/state.ts', import.meta.url)) },
      { find: '@dzgrid/core/row-gaps', replacement: fileURLToPath(new URL('./packages/core/src/row-gaps.ts', import.meta.url)) },
      { find: '@dzgrid/core/compare', replacement: fileURLToPath(new URL('./packages/core/src/compare.ts', import.meta.url)) },
      { find: '@dzgrid/core/server-side', replacement: fileURLToPath(new URL('./packages/core/src/server-side.ts', import.meta.url)) },
      { find: '@dzgrid/core/infinite', replacement: fileURLToPath(new URL('./packages/core/src/infinite.ts', import.meta.url)) },
      { find: '@dzgrid/core/row-drag', replacement: fileURLToPath(new URL('./packages/core/src/row-drag.ts', import.meta.url)) },
      { find: '@dzgrid/core/grouping', replacement: fileURLToPath(new URL('./packages/core/src/grouping.ts', import.meta.url)) },
      { find: '@dzgrid/core/auto-columns', replacement: fileURLToPath(new URL('./packages/core/src/auto-columns.ts', import.meta.url)) },
      { find: '@dzgrid/core/totals', replacement: fileURLToPath(new URL('./packages/core/src/totals.ts', import.meta.url)) },
      { find: '@dzgrid/core/import', replacement: fileURLToPath(new URL('./packages/core/src/import.ts', import.meta.url)) },
      { find: '@dzgrid/core/server-pivot', replacement: fileURLToPath(new URL('./packages/core/src/server-pivot.ts', import.meta.url)) },
      { find: '@dzgrid/core/pivot', replacement: fileURLToPath(new URL('./packages/core/src/pivot.ts', import.meta.url)) },
      { find: '@dzgrid/core/dock', replacement: fileURLToPath(new URL('./packages/core/src/dock.ts', import.meta.url)) },
      { find: '@dzgrid/core/internal', replacement: fileURLToPath(new URL('./packages/core/src/internal.ts', import.meta.url)) },
      { find: '@dzgrid/core', replacement: fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)) },
      { find: '@dzgrid/dom/grouping', replacement: fileURLToPath(new URL('./packages/dom/src/grouping.ts', import.meta.url)) },
      { find: '@dzgrid/dom/totals-row', replacement: fileURLToPath(new URL('./packages/dom/src/totals-row.ts', import.meta.url)) },
      { find: '@dzgrid/dom/vertical-headers', replacement: fileURLToPath(new URL('./packages/dom/src/vertical-headers.ts', import.meta.url)) },
      { find: '@dzgrid/dom/responsive', replacement: fileURLToPath(new URL('./packages/dom/src/responsive.ts', import.meta.url)) },
      { find: '@dzgrid/dom/import', replacement: fileURLToPath(new URL('./packages/dom/src/import.ts', import.meta.url)) },
      { find: '@dzgrid/dom/pivot-bar', replacement: fileURLToPath(new URL('./packages/dom/src/pivot-bar.ts', import.meta.url)) },
      { find: '@dzgrid/dom/groups', replacement: fileURLToPath(new URL('./packages/dom/src/groups.ts', import.meta.url)) },
      { find: '@dzgrid/dom/pivot', replacement: fileURLToPath(new URL('./packages/dom/src/pivot.ts', import.meta.url)) },
      { find: '@dzgrid/dom/find', replacement: fileURLToPath(new URL('./packages/dom/src/find.ts', import.meta.url)) },
      { find: '@dzgrid/dom/group-zone', replacement: fileURLToPath(new URL('./packages/dom/src/group-zone.ts', import.meta.url)) },
      { find: '@dzgrid/dom/spans', replacement: fileURLToPath(new URL('./packages/dom/src/spans.ts', import.meta.url)) },
      { find: '@dzgrid/dom/slots', replacement: fileURLToPath(new URL('./packages/dom/src/slots.ts', import.meta.url)) },
      { find: '@dzgrid/dom/search', replacement: fileURLToPath(new URL('./packages/dom/src/search.ts', import.meta.url)) },
      { find: '@dzgrid/dom/dock', replacement: fileURLToPath(new URL('./packages/dom/src/dock.ts', import.meta.url)) },
      { find: '@dzgrid/dom/filters-panel', replacement: fileURLToPath(new URL('./packages/dom/src/filters-panel.ts', import.meta.url)) },
      { find: '@dzgrid/dom/filters-base', replacement: fileURLToPath(new URL('./packages/dom/src/filters-base.ts', import.meta.url)) },
      { find: '@dzgrid/dom/filters', replacement: fileURLToPath(new URL('./packages/dom/src/filters.ts', import.meta.url)) },
      { find: '@dzgrid/dom/print', replacement: fileURLToPath(new URL('./packages/dom/src/print.ts', import.meta.url)) },
      { find: '@dzgrid/dom/export', replacement: fileURLToPath(new URL('./packages/dom/src/export.ts', import.meta.url)) },
      { find: '@dzgrid/dom/parts', replacement: fileURLToPath(new URL('./packages/dom/src/parts.ts', import.meta.url)) },
      { find: '@dzgrid/dom/rules', replacement: fileURLToPath(new URL('./packages/dom/src/rules.ts', import.meta.url)) },
      { find: '@dzgrid/dom/tree', replacement: fileURLToPath(new URL('./packages/dom/src/tree.ts', import.meta.url)) },
      { find: '@dzgrid/dom/detail', replacement: fileURLToPath(new URL('./packages/dom/src/detail.ts', import.meta.url)) },
      { find: '@dzgrid/dom/edit', replacement: fileURLToPath(new URL('./packages/dom/src/edit.ts', import.meta.url)) },
      { find: '@dzgrid/dom/range', replacement: fileURLToPath(new URL('./packages/dom/src/range.ts', import.meta.url)) },
      { find: '@dzgrid/dom/fill', replacement: fileURLToPath(new URL('./packages/dom/src/fill.ts', import.meta.url)) },
      { find: '@dzgrid/dom/columns', replacement: fileURLToPath(new URL('./packages/dom/src/columns.ts', import.meta.url)) },
      { find: '@dzgrid/dom/column-menu', replacement: fileURLToPath(new URL('./packages/dom/src/column-menu.ts', import.meta.url)) },
      { find: '@dzgrid/dom/columns-panel', replacement: fileURLToPath(new URL('./packages/dom/src/columns-panel.ts', import.meta.url)) },
      { find: '@dzgrid/dom/state', replacement: fileURLToPath(new URL('./packages/dom/src/state.ts', import.meta.url)) },
      { find: '@dzgrid/dom/row-gaps', replacement: fileURLToPath(new URL('./packages/dom/src/row-gaps.ts', import.meta.url)) },
      { find: '@dzgrid/dom/fresh-rows', replacement: fileURLToPath(new URL('./packages/dom/src/fresh-rows.ts', import.meta.url)) },
      { find: '@dzgrid/dom/tree-lazy', replacement: fileURLToPath(new URL('./packages/dom/src/tree-lazy.ts', import.meta.url)) },
      { find: '@dzgrid/dom/motion-gsap', replacement: fileURLToPath(new URL('./packages/dom/src/motion-gsap.ts', import.meta.url)) },
      { find: '@dzgrid/dom/row-drag', replacement: fileURLToPath(new URL('./packages/dom/src/row-drag.ts', import.meta.url)) },
      { find: '@dzgrid/dom/context-menu', replacement: fileURLToPath(new URL('./packages/dom/src/context-menu.ts', import.meta.url)) },
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
        motion: fileURLToPath(new URL('./playground/motion.html', import.meta.url)),
        tree: fileURLToPath(new URL('./playground/tree.html', import.meta.url)),
        detail: fileURLToPath(new URL('./playground/detail.html', import.meta.url)),
        orders: fileURLToPath(new URL('./playground/orders.html', import.meta.url)),
        state: fileURLToPath(new URL('./playground/state.html', import.meta.url)),
        hr: fileURLToPath(new URL('./playground/hr.html', import.meta.url)),
        arbre: fileURLToPath(new URL('./playground/arbre.html', import.meta.url)),
        journaux: fileURLToPath(new URL('./playground/journaux.html', import.meta.url)),
        regroupement: fileURLToPath(new URL('./playground/regroupement.html', import.meta.url)),
        infini: fileURLToPath(new URL('./playground/infini.html', import.meta.url)),
        'groupes-serveur': fileURLToPath(new URL('./playground/groupes-serveur.html', import.meta.url)),
        deplacer: fileURLToPath(new URL('./playground/deplacer.html', import.meta.url)),
        dock: fileURLToPath(new URL('./playground/dock.html', import.meta.url)),
        'pivot-serveur': fileURLToPath(new URL('./playground/pivot-serveur.html', import.meta.url)),
      },
    },
  },
  server: { port: 4700, strictPort: true, fs: { allow: ['..'] } },
});
