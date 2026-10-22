// @vitest-environment node
// `@dzgrid/dom/detail` on a server (SSR, Phase 4 step 10): importing it and making the feature and the
// nested-grid part touch no DOM; the entry stays apart from the base (structure).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
});

describe('@dzgrid/dom/detail without a DOM', () => {
  it('imports and builds its feature and part without a document or a window', async () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
    const m = await import('../src/detail.js');
    const part = m.nestedGrid({ settings: () => ({ rows: [], getRowId: () => '', columns: [], messages: {} as never }) });
    expect(part.slot).toBe('detail');
    const f = m.detail({ part, height: 'auto' });
    expect(f.id).toBe('detail');
    expect(f.shape!().kind).toBe('detail');
    expect(m.DETAIL_KEYS).toEqual(['detail.label', 'detail.expanded', 'detail.collapsed']);
    for (const lang of ['en', 'fr', 'ar']) expect(Object.keys((await import(`../src/locales/${lang}-detail.ts`))[`${lang.toUpperCase()}_DETAIL`].text).sort()).toEqual([...m.DETAIL_KEYS].sort());
  });

  it('reaches the base only through the grid’s context, the types and createGrid by the package’s name', () => {
    const entry = files(SRC).filter((f) => /^detail(\/|\.ts$)/.test(relative(SRC, f)));
    expect(entry.map((f) => relative(SRC, f)).sort()).toEqual(['detail.ts', 'detail/index.ts', 'detail/nested.ts', 'detail/styles.ts']);
    const imports = entry.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^(?:import|export) (?!type )[^;]*from '([^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`));
    expect(imports.filter((s) => !/: @dzgrid\/(core|core\/internal|core\/detail)$/.test(s)).sort()).toEqual([
      'detail.ts: ./detail/index.js', 'detail.ts: ./detail/nested.js', 'detail/index.ts: ../dir.js', 'detail/index.ts: ./styles.js', 'detail/nested.ts: @dzgrid/dom',
    ]);
    // Nothing else imports it, nor the core's detail entry: a grid without details carries none of it.
    expect(files(SRC).filter((f) => !/^detail(\/|\.ts$)/.test(relative(SRC, f)) && /from '(\.{1,2}\/(?:.*\/)?detail(\/|\.js')|@dzgrid\/core\/detail')/.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f))).toEqual([]);
  });
});
