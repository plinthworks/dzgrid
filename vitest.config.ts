import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import angular from '@analogjs/vite-plugin-angular';

/**
 * The core runs in `node`, not jsdom: a DOM global reached by accident would
 * pass under jsdom and break the day the core runs in a worker or on a server.
 * jsdom arrives with @dzgrid/dom, as a separate project.
 */
const alias = {
  '@dzgrid/core/server': fileURLToPath(new URL('./packages/core/src/server.ts', import.meta.url)),
  '@dzgrid/core/spans': fileURLToPath(new URL('./packages/core/src/spans.ts', import.meta.url)),
  '@dzgrid/core/internal': fileURLToPath(new URL('./packages/core/src/internal.ts', import.meta.url)),
  '@dzgrid/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
};
const domAlias = {
  ...alias,
  '@dzgrid/dom/spans': fileURLToPath(new URL('./packages/dom/src/spans.ts', import.meta.url)),
  '@dzgrid/dom/locales': fileURLToPath(new URL('./packages/dom/src/locales', import.meta.url)),
  '@dzgrid/dom': fileURLToPath(new URL('./packages/dom/src/index.ts', import.meta.url)),
};
const angularTsconfig = fileURLToPath(new URL('./packages/angular/tsconfig.spec.json', import.meta.url));
const angularAlias = {
  ...domAlias,
  '@dzgrid/angular': fileURLToPath(new URL('./packages/angular/src/index.ts', import.meta.url)),
};

export default defineConfig({
  test: {
    globals: true,
    projects: [
      { resolve: { alias }, test: { name: 'core', globals: true, environment: 'node', include: ['packages/core/test/**/*.test.ts'] } },
      { resolve: { alias }, test: { name: 'conformance', globals: true, environment: 'node', include: ['conformance/runner/**/*.test.ts'] } },
      { resolve: { alias: domAlias }, test: { name: 'dom', globals: true, environment: 'jsdom', include: ['packages/dom/test/**/*.test.ts'] } },
      // Components are compiled for the tests, not stubbed (tzslot): a template whose
      // binding silently fails still passes tsc, so only rendering it catches that.
      // `jit: false`: under vitest the plugin defaults to JIT, which setup.ts's
      // @angular/compiler would serve silently; template.test.ts checks for AOT.
      {
        plugins: [angular({ jit: false, tsconfig: angularTsconfig })],
        resolve: { alias: angularAlias },
        test: {
          name: 'angular', globals: true, environment: 'jsdom',
          setupFiles: ['packages/angular/test/setup.ts'], include: ['packages/angular/test/**/*.test.ts'],
        },
      },
      { test: { name: 'theme', globals: true, environment: 'node', include: ['packages/theme/test/**/*.test.ts'] } },
      { test: { name: 'tools', globals: true, environment: 'node', include: ['spikes/test/**/*.test.ts', 'scripts/test/**/*.test.ts'] } },
    ],
  },
});
