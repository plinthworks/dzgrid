// @vitest-environment node
// The Angular example rendered on a server (step 23, docs/behaviors/angular-example.md): the
// example's server build through `renderApplication`, in a process of its own so that a timer left
// open shows as a process that does not end. Skipped without the build (`npm run example:build`).
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SERVER = `${ROOT}examples/angular-audit/dist/audit/server/main.server.mjs`;

describe.skipIf(!existsSync(SERVER))('the example on a server', () => {
  for (const lang of ['fr', 'ar'] as const) {
    it(`renders the host only, no rows, no error, no kernel, and ends by itself (${lang})`, () => {
      const t0 = Date.now();
      // No process.exit in the script: it must end because nothing is left open.
      const r = spawnSync(process.execPath, [`${ROOT}scripts/example.mjs`, 'ssr', '--json', '--lang', lang], { encoding: 'utf8', timeout: 30_000 });
      expect(r.error).toBeUndefined();
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout.trim().split('\n').at(-1)!);
      expect(out.host).toBe(true);
      expect(out.rows).toBe(0);
      expect(out.grids).toBe(0);
      expect(out.errors).toEqual([]);
      expect(out.kernel).toBe(null);
      expect(out.ready).toBe(false);
      expect(out.timers).toEqual([]);
      expect(out.lang).toBe(lang);
      expect(r.stderr).not.toMatch(/document is not defined|window is not defined/);
      expect(Date.now() - t0).toBeLessThan(30_000);
    });
  }
});
