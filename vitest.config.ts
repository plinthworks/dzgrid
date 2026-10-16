import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * The core runs in `node`, not jsdom: a DOM global reached by accident would
 * pass under jsdom and break the day the core runs in a worker or on a server.
 * jsdom arrives with @dzgrid/dom, as a separate project.
 */
const alias = { '@dzgrid/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)) };

export default defineConfig({
  test: {
    globals: true,
    projects: [
      { resolve: { alias }, test: { name: 'core', globals: true, environment: 'node', include: ['packages/core/test/**/*.test.ts'] } },
      { resolve: { alias }, test: { name: 'conformance', globals: true, environment: 'node', include: ['conformance/runner/**/*.test.ts'] } },
    ],
  },
});
