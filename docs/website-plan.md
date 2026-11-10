# The documentation website — plan

Owner's answers, 2026-11-10 (« ★ partout »): Astro Starlight in `website/` (its own `package.json`, not a
workspace, the library read from `../packages/*/src`), English at the root and French under `/fr/`, GitHub Pages at
`https://plinthworks.github.io/dzgrid/` (`.github/workflows/docs.yml`, Pages switched on by the owner). Getting
started → guides by task → one page per option → API reference from `api/*.api.txt`. **The site becomes the
reference**: `docs/guide/` moves into it, `llms.txt` / `llms-full.txt` are then built from it, the README links to
it. Each guide shows a live grid with its code in three tabs (TypeScript, Angular, Web Component), every example
compiled. Made-up data only. Built like DzCalendar's site (`/Users/nadou/Dev/dzcalendar/website/`, its « 18j »).
One batch at a time, one commit per batch (the owner commits).

## How the site is made

- `website/astro.config.mjs` — the aliases come from each package's `exports` (exact matches, a new entry needs no
  line); `@tzslot/*` and `gsap` resolve from the root's `node_modules`. Dev and preview on **4720** (the playground
  holds 4700). Versions pinned exactly as DzCalendar's: `astro` 7.3.8, `@astrojs/starlight` 0.42.6,
  `@astrojs/markdown-remark` 7.3.2.
- The look: `@dzgrid/theme/dzgrid.css` on every page; Starlight's accent is `--tz-accent` / `--tz-accent-fg`
  (`src/styles/custom.css`), so prose and demos share one palette, light and dark.
- `src/components/LiveDemo.astro` — one real grid per demo, made when it comes near the screen; rows, columns and
  settings as JSON, features by name (`filters`, `pagination` today; a guide that needs another adds it to
  `FEATURES`); texts and locale from the page's language; `element` draws it with `<dz-grid>`. Light and dark follow
  Starlight by themselves (the theme reads `data-theme` on `<html>`).
- `src/components/CodeTabs.astro` — slots `ts`, `angular`, `element`, synced across the site.
- A page not written yet is a stub: title, description, one `:::note[Being written]` (`En cours de rédaction`)
  linking to what stands in for it on GitHub.
- Tests (`website/test/`, in the root's vitest `tools` project, run by the workflow before the build):
  `examples.test.ts` — every ```ts block (and the module scripts of ```html blocks) of every page, both languages,
  compiled by ngc with strict templates against the sources; imported names in `api/*.api.txt`; functions named in
  the prose declared; Angular outputs real. `pages.test.ts` — every page has its French twin; stubs of one exact
  shape; a written page has the same shape in both languages **with the same code and the same demo data** (only the
  prose and the captions are translated); every sidebar entry exists; every relative link and anchor lands; every
  GitHub link names a file that exists. `scripts/test/banned-words.test.ts` reads `.mdx`, `.astro` and `.svg` too.

## Batch 1 — the skeleton (done 2026-11-10, not committed)

Config, both languages, the sidebar with every section (Getting started, Guides ×14, Settings, Column options,
Features, API reference) and its stubs, the home page (what DzGrid is, a live demo of 60 made-up seed packets), the
three getting-started pages written in English and French (four sections of three tabs on the TypeScript page,
three on the Angular and Web Component pages; one live demo each — the Web Component's is a real `<dz-grid>`), the
tests, the workflow. 45 pages built. Chrome: en and fr, light and dark, the four demos drawn, no console message,
axe 0 on the home page.

## Batch 2 — the guides

The 14 pages of `docs/guide/` (all but the three getting-started ones, already on the site) become
`website/src/content/docs/guides/*.mdx`, English and French, each with its three tabs and at least one live demo;
facts left to the option pages (batch 3) and linked. In three sub-batches, a review each: (a) columns, sort / filter /
search, selection and ranges, editing, tree; (b) grouping, pivot, server data, row moves, dock and panels; (c) export
and print, state, theming and right to left, accessibility. Then, with the last one:

- `docs/guide/` removed (its README's index becomes the sidebar's order); `scripts/test/guide.test.ts` retired —
  its checks already live in `website/test/examples.test.ts`.
- `scripts/llms.mjs` reads the site's English pages (MDX stripped to Markdown: tabs flattened to their TypeScript
  block, demos dropped), links to `https://plinthworks.github.io/dzgrid/…`; its test moves to `website/test/`.
- The README's « Documentation » points at the site only; the `ar` demo (right to left) added to the theming guide.
- To fix in the text while moving: `sort-filter-search.md` says `filters-base` keeps a day filter without a
  calendar — it gives a day or instant column no filter and a `missing-feature` warning (`filters-base.ts`).

## Batch 3 — one page per option

`settings/` (every key of `GridSettings`), `column-options/` (every key of a column definition), `features/` (every
feature entry, its options, its texts bundle, its sheet): each page the facts (type, default, live or read once,
the problems it reports), one example in three tabs, a demo when it shows something. Facts generated from the types
where they can be (as DzCalendar's `gen-options`) and checked by a test. In batches of ~15 pages, a review each.

## Batch 4 — the API reference

`api/` generated from `api/*.api.txt` by a script (one page per package, one section per entry, each name with its
declaration), English only with a French page saying so; regenerated and checked by a test like `llms.txt`.

## Batch 5 — look and publish

Every page seen in Chrome (en, fr; light, dark; a narrow screen), every link 200, axe on a page of each kind;
Firefox and WebKit once. Then the owner switches Pages on (Settings → Pages → Source: GitHub Actions) and the first
deploy runs from `main`.

## Open points for the owner

- Port 4720 is taken on this Mac by an `ng serve --port 4720` started 2026-11-04 (not ours, left running); the
  batch-1 check used 4721.
- Demo data and code are the same in both languages (headers in English on `/fr/`, the grid's own texts in
  French): say if the French pages should get French headers (then the code blocks differ too).
- Found while building (library, not fixed): see `docs/STATUS.md` 2026-11-10 « site, lot 1 ».
