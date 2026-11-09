# Benchmark — licences checked before any other grid was installed

Lot L8 (Phase 11, owner Q4 B). Only each grid's **published licence text** and its published licence terms were read —
never its source, its tests, its CSS or the files of its npm package. Checked 2026-11-09.

| Grid | Version benchmarked | Licence (npm `license` field, and the published LICENSE file) | Clause on benchmarks or publishing comparisons | Verdict |
|---|---|---|---|---|
| AG Grid Community (`ag-grid-community`) | 36.3.0 | MIT (`packages/ag-grid-community/LICENSE.txt` on the project's public repository, « Copyright (c) 2015-2026 AG GRID LTD ») | None. The MIT text grants use without restriction and says nothing about benchmarks. The commercial EULA (AG Grid Enterprise, ag-grid.com/eula) was also read: it covers the Enterprise software only and has no benchmark or publication clause either. Enterprise is **not** used. | Allowed |
| Tabulator (`tabulator-tables`) | 6.7.1 | MIT (`LICENSE` on the project's public repository) | None. | Allowed |

## Why these two

- **AG Grid Community** — the grid DzGrid takes its *behaviour* from (CLEANROOM.md); the reference a reader expects.
  Community only: the Enterprise package is under a commercial licence and is not needed for the measured scenarios.
- **Tabulator** — a widely used, MIT, framework-free grid with its own virtual DOM: a second, independent design.

## Considered and left out

- **TanStack Table** — headless (no DOM, no virtual scrolling of its own): a page would be mostly our own rendering
  code, so it would not measure the library.
- **Handsontable** — not open source in its current versions (free use is tied to a non-commercial / evaluation
  key); its terms were not studied, and a grid whose terms are not clearly open is dropped by rule.
- Others (RevoGrid, Grid.js…) were not needed for a first, small comparison; the harness accepts one more page per grid.

## How the clean room was kept

- The other grids are installed only in `~/Dev/dzgrid-bench/` (outside this repository, its own `package.json`),
  never in this repository or its `node_modules`.
- Each grid's page was written from that grid's public documentation pages (getting started, sorting, filter API,
  transactions / update) — not from its source or its package files. Its bundle was built and run, never opened.
- Nothing from those grids enters this repository: `results.json` holds numbers only, `README.md` the method.
