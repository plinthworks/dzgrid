import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// tzslot's playground is on 4500, DzCalendar's on 4600.
export default defineConfig({
  root: 'playground',
  server: { port: 4700, strictPort: true },
  resolve: {
    alias: { '@dzgrid/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)) },
  },
});
