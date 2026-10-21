import { describe, it, expect } from 'vitest';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

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

  it('no other entry holds a detail module; the detail entry builds on the base rows and holds no tree, server, span or csv module, nor the model (Phase 4 step 8)', async () => {
    const isDetail = (f: string) => /(^|\/)src\/detail(\.ts$|\/)/.test(f);
    for (const entry of ['index.ts', 'internal.ts', 'server.ts', 'spans.ts', 'csv.ts', 'rules.ts', 'tree.ts', 'tree-lazy.ts']) expect((await inputsOf(entry)).filter(isDetail), entry).toEqual([]);
    const inputs = await inputsOf('detail.ts');
    for (const f of ['src/detail/shape.ts', 'src/detail/layout.ts', 'src/row/displayed.ts']) expect(inputs.some((i) => i.endsWith(f)), f).toBe(true);
    expect(inputs.filter((f) => isServer(f) || isSpans(f) || isCsv(f) || /(^|\/)src\/tree(\.ts$|-lazy\.ts$|\/)/.test(f))).toEqual([]);
    expect(inputs.some((f) => f.endsWith('src/model/client.ts') || f.endsWith('src/kernel.ts'))).toBe(false);
  });

  it('no other entry holds a tree module; the tree entry builds on the base model and holds no server, span or csv module (Phase 4 step 3)', async () => {
    const isTree = (f: string) => /(^|\/)src\/tree(\.ts$|\/)/.test(f);
    for (const entry of ['index.ts', 'internal.ts', 'server.ts', 'spans.ts', 'csv.ts', 'rules.ts']) expect((await inputsOf(entry)).filter(isTree), entry).toEqual([]);
    const inputs = await inputsOf('tree.ts');
    for (const f of ['src/tree/build.ts', 'src/tree/shape.ts']) expect(inputs.some((i) => i.endsWith(f)), f).toBe(true);
    expect(inputs.filter(isServer)).toEqual([]);
    expect(inputs.filter(isSpans)).toEqual([]);
    expect(inputs.filter(isCsv)).toEqual([]);
    // Types only from the model: the tree is handed to it, it does not carry it.
    expect(inputs.some((f) => f.endsWith('src/model/client.ts') || f.endsWith('src/kernel.ts'))).toBe(false);
  });

  it('the base, with its tree seams (Phase 4 step 2), fits its budget, minified and gzipped as a consumer ships it', async () => {
    const out = await build({ entryPoints: [SRC + 'index.ts'], bundle: true, minify: true, format: 'esm', target: 'es2022', write: false, treeShaking: true, logLevel: 'silent' });
    const gz = gzipSync(out.outputFiles[0]!.contents, { level: 9 }).length;
    const budget = JSON.parse(readFileSync(fileURLToPath(new URL('../../../size-budget.json', import.meta.url)), 'utf8')).entries['@dzgrid/core'].maxGzip as number;
    expect(budget).toBe(29000);
    expect(gz).toBeLessThanOrEqual(budget);
    // What the seams cost stays within the plan's estimate (+800–900 B over 26 984), plus what the
    // review of steps 2–3 added (expandAll through the model and the filter's layer, the muted rows
    // left out of select-all, the toggle's patched flags: about +130), plus step 5 (the `tree-shape`
    // code, the nested rows' `load`/`tx` hooks, `rows.expand` on fillers: +35), plus the review of step 5
    // (`tx` given the store's snapshot, the open set and the layer rekeyed: +52), plus step 8 (details:
    // the page cut before the shape, the filter's layer a tree's only, `allRows` flat for a shape
    // without its own: +6), plus the review of step 8 (a detail's focus, its master gone, at the
    // master's place: +7): a guard against a seam that grew.
    expect(gz).toBeLessThan(26984 + 1257);
  });
});
