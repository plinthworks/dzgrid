import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// tzslot's playground is on 4500, DzCalendar's on 4600.
export default defineConfig({
  root: 'playground',
  resolve: {
    alias: [
      { find: '@dzgrid/core/server', replacement: fileURLToPath(new URL('./packages/core/src/server.ts', import.meta.url)) },
      { find: '@dzgrid/core/internal', replacement: fileURLToPath(new URL('./packages/core/src/internal.ts', import.meta.url)) },
      { find: '@dzgrid/core', replacement: fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)) },
      { find: /^@dzgrid\/dom\/locales\/(.*)$/, replacement: fileURLToPath(new URL('./packages/dom/src/locales/', import.meta.url)) + '$1.ts' },
      { find: '@dzgrid/dom', replacement: fileURLToPath(new URL('./packages/dom/src/index.ts', import.meta.url)) },
    ],
  },
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./playground/index.html', import.meta.url)),
        rtl: fileURLToPath(new URL('./playground/rtl.html', import.meta.url)),
      },
    },
  },
  server: { port: 4700, strictPort: true, fs: { allow: ['..'] } },
});
