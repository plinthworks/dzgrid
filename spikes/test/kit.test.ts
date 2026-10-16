import { describe, it, expect, afterAll } from 'vitest';
// @ts-expect-error — the kit is plain JavaScript
import { serve } from '../kit.mjs';

/** The spike server: a malformed request must never take a running spike down. */
const site = await serve(new URL('../s0-kit/run.mjs', import.meta.url).href);
afterAll(() => site.close());

const get = (path: string) => fetch(site.root(path), { redirect: 'manual' });

describe('the spike server', () => {
  it('serves a page and compiles TypeScript', async () => {
    expect((await get('spikes/s0-kit/index.html')).status).toBe(200);
    const ts = await get('packages/core/src/index.ts');
    expect(ts.status).toBe(200);
    expect(await ts.text()).toContain('export');
  });

  it('answers 400 to a malformed escape and keeps serving', async () => {
    expect((await get('%E0%A4%A')).status).toBe(400);
    expect((await get('spikes/s0-kit/index.html')).status).toBe(200);
  });

  it('never puts a decoded line break in a redirect', async () => {
    const r = await get('%0d%0aX-Evil:%201.js');
    expect([400, 404]).toContain(r.status);
    expect(r.headers.get('x-evil')).toBeNull();
    expect((await get('spikes/s0-kit/index.html')).status).toBe(200);
  });

  it('never redirects to another host', async () => {
    const r = await get('/evil.example/x.js');
    expect(r.headers.get('location') ?? '').not.toMatch(/^\/\//);
  });

  it('stays inside the repository', async () => {
    expect((await get('..%2f..%2fetc%2fpasswd')).status).toBe(404);
    expect((await get('%2e%2e/%2e%2e/etc/passwd')).status).toBe(404);
  });

  it('reports a TypeScript syntax error as 500, not as a missing file', async () => {
    const r = await get('spikes/test/fixtures/broken.ts');
    expect(r.status).toBe(500);
  });
});
