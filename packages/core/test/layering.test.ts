import { describe, it, expect } from 'vitest';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

/**
 * The base and `@dzgrid/core/server` (step 5, layering): the `source` setting
 * holds a binding made by `sourceRows` from the server entry, and the base
 * only knows its types. Bundled as a consumer bundles it, the base reaches no
 * server module, however indirectly; the server entry builds on the base's
 * model rather than carrying a copy of it.
 */
const SRC = fileURLToPath(new URL('../src/', import.meta.url));

async function inputsOf(entry: string): Promise<string[]> {
  const out = await build({ entryPoints: [SRC + entry], bundle: true, write: false, metafile: true, format: 'esm', logLevel: 'silent' });
  return Object.keys(out.metafile!.inputs).map((f) => f.replace(/\\/g, '/'));
}
const isServer = (f: string) => /(^|\/)src\/server(\.ts$|\/)/.test(f);
const isSpans = (f: string) => /(^|\/)src\/spans(\.ts$|\/)/.test(f);
const isCsv = (f: string) => /(^|\/)src\/csv(\.ts$|\/)/.test(f);

describe('layering of the base and the server entry', () => {
  it('the base bundle holds no server module', async () => {
    const inputs = await inputsOf('index.ts');
    expect(inputs.some((f) => f.endsWith('src/model/client.ts'))).toBe(true);
    expect(inputs.filter(isServer)).toEqual([]);
  });

  it('the internal entry holds none either', async () => {
    expect((await inputsOf('internal.ts')).filter(isServer)).toEqual([]);
  });

  it('neither the base, the internal entry nor the server entry holds a span module (step 9b)', async () => {
    for (const entry of ['index.ts', 'internal.ts', 'server.ts']) expect((await inputsOf(entry)).filter(isSpans), entry).toEqual([]);
  });

  it('the spans entry builds on the base columns and no server module', async () => {
    const inputs = await inputsOf('spans.ts');
    for (const f of ['src/spans/map.ts', 'src/spans/merge.ts', 'src/spans/nav.ts', 'src/spans/bands.ts']) expect(inputs.some((i) => i.endsWith(f)), f).toBe(true);
    expect(inputs.filter(isServer)).toEqual([]);
    expect(inputs.some((f) => f.endsWith('src/model/client.ts'))).toBe(false);
  });

  it('no other entry holds a csv module (step 10)', async () => {
    for (const entry of ['index.ts', 'internal.ts', 'server.ts', 'spans.ts']) expect((await inputsOf(entry)).filter(isCsv), entry).toEqual([]);
  });

  it('the csv entry holds its writer, and no server or span module (their types only)', async () => {
    const inputs = await inputsOf('csv.ts');
    for (const f of ['src/csv/quote.ts', 'src/csv/writers.ts', 'src/csv/chunks.ts', 'src/csv/rows.ts', 'src/csv/wall.ts']) expect(inputs.some((i) => i.endsWith(f)), f).toBe(true);
    expect(inputs.filter(isServer)).toEqual([]);
    expect(inputs.filter(isSpans)).toEqual([]);
    expect(inputs.some((f) => f.endsWith('src/model/client.ts'))).toBe(false);
  });

  it('no other entry holds the rules module, and it holds no model (step 21)', async () => {
    const isRules = (f: string) => /(^|\/)src\/rules(\.ts$|\/)/.test(f);
    for (const entry of ['index.ts', 'internal.ts', 'server.ts', 'spans.ts', 'csv.ts']) expect((await inputsOf(entry)).filter(isRules), entry).toEqual([]);
    const inputs = await inputsOf('rules.ts');
    expect(inputs.some((f) => f.endsWith('src/rules/vet.ts'))).toBe(true);
    expect(inputs.filter(isServer)).toEqual([]);
    expect(inputs.some((f) => f.endsWith('src/model/client.ts') || f.endsWith('src/kernel.ts'))).toBe(false);
  });

  it('the server entry uses the base model and the gate', async () => {
    const inputs = await inputsOf('server.ts');
    expect(inputs.some((f) => f.endsWith('src/model/client.ts'))).toBe(true);
    expect(inputs.some((f) => f.endsWith('src/server/gate.ts'))).toBe(true);
    expect(inputs.some((f) => f.endsWith('src/server/rows.ts'))).toBe(true);
  });
});
