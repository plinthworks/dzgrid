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
    // The seams' guard, rebased at the Phase 4 close (step 13, 2026-10-22): Phase 4 took the base from
    // 26 984 to 28 240 (the tree and detail seams and their reviews, each step's bytes in ROADMAP « Phase 4 »).
    // Any growth past it is a step's, named here with its bytes; the budget (29 000, owner Q16/Q17b) is the cap.
    // Phase 5 step 2 (2026-10-22): +659 (editable and editableAt, the edit-structure warning, edits.reader /
    // rows.reapply / orderStale, the stale-order rule, the app context Q12) → 28 899; its review fixes +27
    // (the host update of an edited row re-read with the edits, the edit-structure told once, the threw
    // reset, the creation context; reader-off dropped) → 28 926. Showcase demos (owner D1, 2026-10-23): +6, the
    // problem code `invalid-setting` for `rowHeight` → 28 932. Phase 5 step 3 (2026-10-23): −16, the `validate`
    // shape check moved to `@dzgrid/core/edit` (the base gains only types: `EditChecks`, four events,
    // `SaveOrigin`) → 28 916, the measure.
    expect(gz).toBeLessThanOrEqual(28916);
  });

  it('the base holds no edit module: the edit controller is its own entry (Phase 5 step 3)', async () => {
    const isEdit = (f: string) => /(^|\/)src\/edit(\.ts$|\/)/.test(f);
    for (const entry of ['index.ts', 'internal.ts', 'server.ts', 'spans.ts', 'csv.ts', 'rules.ts', 'tree.ts', 'tree-lazy.ts', 'detail.ts']) expect((await inputsOf(entry)).filter(isEdit), entry).toEqual([]);
  });

  it('the edit entry holds its modules and no server, span, csv, tree or detail module (Phase 5 step 3)', async () => {
    const inputs = await inputsOf('edit.ts');
    for (const f of ['src/edit/input.ts', 'src/edit/controller.ts']) expect(inputs.some((i) => i.endsWith(f)), f).toBe(true);
    expect(inputs.filter((f) => isServer(f) || isSpans(f) || isCsv(f) || /(^|\/)src\/(tree|detail)(\.ts$|-lazy\.ts$|\/)/.test(f))).toEqual([]);
    // The rows' model is the kernel's: the controller is handed one, it carries none.
    expect(inputs.some((f) => f.endsWith('src/model/client.ts'))).toBe(false);
  });

  it('the edit entry fits its grant over the base (owner Q16 3 000, S3-O4 3 100 B gz), measured as check:size measures it', async () => {
    const opts = { bundle: true, minify: true, format: 'esm', target: 'es2022', write: false, treeShaking: true, logLevel: 'silent' } as const;
    const gz = async (o: Parameters<typeof build>[0]) => gzipSync((await build({ ...o, ...opts })).outputFiles![0]!.contents, { level: 9 }).length;
    const both = await gz({ stdin: { contents: "export * from './index.ts';\nexport * from './edit.ts';", resolveDir: SRC, loader: 'ts' } });
    const alone = await gz({ entryPoints: [SRC + 'index.ts'] });
    const entry = JSON.parse(readFileSync(fileURLToPath(new URL('../../../size-budget.json', import.meta.url)), 'utf8')).entries['@dzgrid/core/edit'];
    expect(entry).toMatchObject({ file: 'packages/core/src/edit.ts', maxGzip: 3100, over: '@dzgrid/core' });
    expect(both - alone).toBeLessThanOrEqual(entry.maxGzip);
  });

  it('no other entry holds a range module (Phase 5 step 10)', async () => {
    const isRange = (f: string) => /(^|\/)src\/range(\.ts$|\/)/.test(f);
    for (const entry of ['index.ts', 'internal.ts', 'server.ts', 'spans.ts', 'csv.ts', 'rules.ts', 'tree.ts', 'tree-lazy.ts', 'detail.ts', 'edit.ts']) expect((await inputsOf(entry)).filter(isRange), entry).toEqual([]);
  });

  it('the range entry holds its modules and the shared CSV writer, never an edit module at run time, nor server, span, tree or detail modules or the model (Phase 5 step 10)', async () => {
    const inputs = await inputsOf('range.ts');
    for (const f of ['src/range/box.ts', 'src/range/tsv.ts', 'src/range/copy.ts', 'src/range/paste.ts', 'src/range/fill.ts', 'src/csv/writers.ts']) expect(inputs.some((i) => i.endsWith(f)), f).toBe(true);
    // `CellInput` is a type: erased, so no edit module is bundled (the commit parses and checks, one place).
    expect(inputs.filter((f) => /(^|\/)src\/edit(\.ts$|\/)/.test(f))).toEqual([]);
    expect(inputs.filter((f) => isServer(f) || isSpans(f) || /(^|\/)src\/(tree|detail)(\.ts$|-lazy\.ts$|\/)/.test(f))).toEqual([]);
    expect(inputs.some((f) => f.endsWith('src/model/client.ts') || f.endsWith('src/kernel.ts') || f.endsWith('src/csv/chunks.ts'))).toBe(false);
  });

  it('the range entry fits its grant over the base (owner Q16 4 000 B gz), measured as check:size measures it; the base gains no byte (types only)', async () => {
    const opts = { bundle: true, minify: true, format: 'esm', target: 'es2022', write: false, treeShaking: true, logLevel: 'silent' } as const;
    const gz = async (o: Parameters<typeof build>[0]) => gzipSync((await build({ ...o, ...opts })).outputFiles![0]!.contents, { level: 9 }).length;
    const both = await gz({ stdin: { contents: "export * from './index.ts';\nexport * from './range.ts';", resolveDir: SRC, loader: 'ts' } });
    const alone = await gz({ entryPoints: [SRC + 'index.ts'] });
    const entry = JSON.parse(readFileSync(fileURLToPath(new URL('../../../size-budget.json', import.meta.url)), 'utf8')).entries['@dzgrid/core/range'];
    expect(entry).toMatchObject({ file: 'packages/core/src/range.ts', maxGzip: 4000, over: '@dzgrid/core' });
    expect(both - alone).toBeLessThanOrEqual(entry.maxGzip);
    // The step's planned share (step10-plan « Sizes »): 2 200–3 000; more is a question, not a failure here.
    expect(both - alone).toBeGreaterThan(500);
    expect(alone).toBeLessThanOrEqual(28916);
  });
});
