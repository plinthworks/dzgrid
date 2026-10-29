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

/** The base's seam guard: its measure after each step that adds a seam (history in the base test below). */
const BASE = 29150;

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
    expect(budget).toBe(29150); // owner Q2 of step 8b (pinned rows): 29 000 → 29 150 (Q-B)
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
    // `SaveOrigin`) → 28 916, the measure. Phase 5 close (step 13, 2026-10-26): steps 4–12 added no base byte
    // (types only, the range and fill seams in their entries); the guard stays 28 916, the close's measure.
    // Phase 6 step 3 (owner Q3-3): `width: null` in a column patch, +14 → 28 930. Phase 6 step 7 (collapsible
    // groups, owner Q-GH, Q-B: seam ≤ 120 B): `ColumnModel.folded` / `fold`, +35 → 28 965. Phase 6 step 8b-1 (pinned rows,
    // owner Q2: up to 29 150): the pinned store (`setPinned`, `rowOf`, a pinned focus kept, `editable`'s `{ pinned }`, never
    // selected), `pinnedKey` by id and `assignKeys`' key maker, +36 → 29 001. Owner « set include only » (2026-10-29):
    // `exclude: false` refused in compile and wire, +63 → 29 064, guard 29 070. Step 16 (owner « ok pour les hausses », 2026-10-29):
    // `multiSort` +10, `sameRow` in the store +72, nine internal symbols without descriptions −51 → 29 106, guard 29 150.
    expect(gz).toBeLessThanOrEqual(BASE);
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

  it('the edit entry fits its grant over the base (owner Q16 3 000, S3-O4 3 100, Q8-5 3 150, « set include only » 3 160 B gz), measured as check:size measures it', async () => {
    const opts = { bundle: true, minify: true, format: 'esm', target: 'es2022', write: false, treeShaking: true, logLevel: 'silent' } as const;
    const gz = async (o: Parameters<typeof build>[0]) => gzipSync((await build({ ...o, ...opts })).outputFiles![0]!.contents, { level: 9 }).length;
    const both = await gz({ stdin: { contents: "export * from './index.ts';\nexport * from './edit.ts';", resolveDir: SRC, loader: 'ts' } });
    const alone = await gz({ entryPoints: [SRC + 'index.ts'] });
    const entry = JSON.parse(readFileSync(fileURLToPath(new URL('../../../size-budget.json', import.meta.url)), 'utf8')).entries['@dzgrid/core/edit'];
    expect(entry).toMatchObject({ file: 'packages/core/src/edit.ts', maxGzip: 3160, over: '@dzgrid/core' }); // Q8-5: 3 100 → 3 150 (compression with the base's fold seam); owner « set include only » (2026-10-29): 3 150 → 3 160
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

  it('the range entry fits its line over the base (owner Q16 grant 4 000; the Phase 5 close: the measure 2 897 + 10 % = 3 200 B gz), measured as check:size measures it; the base gains no byte (types only)', async () => {
    const opts = { bundle: true, minify: true, format: 'esm', target: 'es2022', write: false, treeShaking: true, logLevel: 'silent' } as const;
    const gz = async (o: Parameters<typeof build>[0]) => gzipSync((await build({ ...o, ...opts })).outputFiles![0]!.contents, { level: 9 }).length;
    const both = await gz({ stdin: { contents: "export * from './index.ts';\nexport * from './range.ts';", resolveDir: SRC, loader: 'ts' } });
    const alone = await gz({ entryPoints: [SRC + 'index.ts'] });
    const entry = JSON.parse(readFileSync(fileURLToPath(new URL('../../../size-budget.json', import.meta.url)), 'utf8')).entries['@dzgrid/core/range'];
    expect(entry).toMatchObject({ file: 'packages/core/src/range.ts', maxGzip: 3200, over: '@dzgrid/core' });
    expect(both - alone).toBeLessThanOrEqual(entry.maxGzip);
    // The step's planned share (step10-plan « Sizes »): 2 200–3 000; more is a question, not a failure here.
    expect(both - alone).toBeGreaterThan(500);
    expect(alone).toBeLessThanOrEqual(BASE);
  });

  it('no other entry holds a state module; the state entry holds no server, span, csv, tree, edit or range module, nor the models (Phase 6 step 5)', async () => {
    const isState = (f: string) => /(^|\/)src\/state(\.ts$|\/)/.test(f);
    for (const entry of ['index.ts', 'internal.ts', 'server.ts', 'spans.ts', 'csv.ts', 'rules.ts', 'tree.ts', 'tree-lazy.ts', 'detail.ts', 'edit.ts', 'range.ts']) expect((await inputsOf(entry)).filter(isState), entry).toEqual([]);
    const inputs = await inputsOf('state.ts');
    expect(inputs.some((i) => i.endsWith('src/state/state.ts'))).toBe(true);
    expect(inputs.filter((f) => isServer(f) || isSpans(f) || isCsv(f) || /(^|\/)src\/(tree|detail|edit|range)(\.ts$|-lazy\.ts$|\/)/.test(f))).toEqual([]);
    expect(inputs.some((f) => f.endsWith('src/model/client.ts') || f.endsWith('src/kernel.ts'))).toBe(false);
  });

  it('no other entry holds a row-gaps module; the row-gaps entry holds no model, no span or tree module (1.1.0 step 15)', async () => {
    const isGaps = (f: string) => /(^|\/)src\/row-gaps(\.ts$|\/)/.test(f);
    for (const entry of ['index.ts', 'internal.ts', 'server.ts', 'spans.ts', 'csv.ts', 'rules.ts', 'tree.ts', 'tree-lazy.ts', 'detail.ts', 'edit.ts', 'range.ts', 'state.ts']) expect((await inputsOf(entry)).filter(isGaps), entry).toEqual([]);
    const inputs = await inputsOf('row-gaps.ts');
    expect(inputs.some((i) => i.endsWith('src/row-gaps/layout.ts'))).toBe(true);
    expect(inputs.filter((f) => isServer(f) || isSpans(f) || isCsv(f) || /(^|\/)src\/(tree|detail|edit|range|state)(\.ts$|-lazy\.ts$|\/)/.test(f))).toEqual([]);
    expect(inputs.some((f) => f.endsWith('src/model/client.ts') || f.endsWith('src/kernel.ts'))).toBe(false);
  });

  it('the row-gaps entry fits its grant over the base (owner Q15-9: 450 B gz); the base gains no byte (types only)', async () => {
    const opts = { bundle: true, minify: true, format: 'esm', target: 'es2022', write: false, treeShaking: true, logLevel: 'silent' } as const;
    const gz = async (o: Parameters<typeof build>[0]) => gzipSync((await build({ ...o, ...opts })).outputFiles![0]!.contents, { level: 9 }).length;
    const both = await gz({ stdin: { contents: "export * from './index.ts';\nexport * from './row-gaps.ts';", resolveDir: SRC, loader: 'ts' } });
    const alone = await gz({ entryPoints: [SRC + 'index.ts'] });
    expect(both - alone).toBeLessThanOrEqual(450);
    expect(alone).toBeLessThanOrEqual(BASE);
  });

  it('the state entry fits its grant over the base (owner Q-B 1 500, « set include only » 1 510 B gz), measured as check:size measures it; the base gains no byte (types only)', async () => {
    const opts = { bundle: true, minify: true, format: 'esm', target: 'es2022', write: false, treeShaking: true, logLevel: 'silent' } as const;
    const gz = async (o: Parameters<typeof build>[0]) => gzipSync((await build({ ...o, ...opts })).outputFiles![0]!.contents, { level: 9 }).length;
    const both = await gz({ stdin: { contents: "export * from './index.ts';\nexport * from './state.ts';", resolveDir: SRC, loader: 'ts' } });
    const alone = await gz({ entryPoints: [SRC + 'index.ts'] });
    expect(both - alone).toBeLessThanOrEqual(1510); // owner « set include only » (2026-10-29): 1 500 → 1 510
    expect(alone).toBeLessThanOrEqual(BASE);
  });
});
