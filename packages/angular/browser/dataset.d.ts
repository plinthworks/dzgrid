// Dataset A (perf/dataset.ts) for the fixture's `?a=1` page (step 25): ngc compiles `src/` only, so the
// module is declared here and esbuild resolves it to the real file (build.mjs `alias`).
declare module 'dzgrid-perf-dataset' {
  export type RowA = { readonly id: string } & Readonly<Record<string, string | number | boolean | null>>;
  export function datasetA(n?: number, seed?: number): RowA[];
}
