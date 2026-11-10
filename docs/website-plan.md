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

## Batch 2 — the guides (done 2026-11-10, not committed)

Owner (2026-11-10): « ★ partout », then « A partout ». The 14 pages of `docs/guide/` became
`website/src/content/docs/guides/*.mdx` in English and French: each with its code in three tabs (TypeScript, Angular,
Web Component) for its main examples (the others in TypeScript), and at least one live demo — 22 demos in all, one by
`<dz-grid>`, one in Arabic right to left, two on a made-up server inside the page (5 000 asteroids in pages, 100 000
in an infinite list). Facts that belong to one option stay in the guides until batch 3 moves them; each guide links
to the section index of its options (`../../settings/`, `../../column-options/`, `../../features/`), the only option
pages that exist yet. The server-data guide keeps « How it works, in pictures », its diagrams redrawn narrower so each
fits the column without scrolling.

- **French pages use French column titles and French made-up data** (owner A), the home page and the getting-started
  pages included. `pages.test.ts` compares the two languages' code by its skeleton (strings, numbers, comments and
  the language's bundles `EN_*` / `FR_*` masked; a ```text picture by its place only): the same names, keys, calls
  and structure, the texts and data in the page's language.
- `LiveDemo`: features by name or `[name, options]` (`src/components/demo/features.ts`: 32 names, each with its
  texts; options a JSON cannot hold made there, as `tree`'s `parentField`); controls above the grid for the features
  that need one (search field, export and print buttons, undo / redo, open / close all, reset the layout); `server`
  for a made-up server (`demo/server.ts`: filters in their wire form, quick search, sort, pages, blocks, the signal);
  `language="ar"` for the right-to-left demo. Every feature's sheet is in `customCss`.
- `docs/guide/` is now a README pointing to the site; `scripts/test/guide.test.ts` retired: compiling, imported names,
  links are in `examples.test.ts` / `pages.test.ts`; `website/test/llms.test.ts` holds the rest (llms up to date, the
  `dzg-*` events named exist, `filters-base` pages say a day column gets no filter). `examples.test.ts` accepts the
  French and Arabic twin of a locale bundle whose English one is in `api/*.api.txt` (the baseline holds only the
  English names the guide documented).
- `scripts/llms.mjs` reads the site's English pages in the sidebar's order (tabs flattened to their TypeScript block,
  demos and imports dropped, links on `https://plinthworks.github.io/dzgrid/…`). The README's « Documentation » and
  `packages/dom/README.md` point at the site.
- Fixed in the text while moving: `filters-base` and day columns (no filter); collapsible column groups need
  `groups()` (with the `-columns` texts) to fold; a list column is edited with `editors({ list: listEditor })` (the old
  guide called `listEditor()` a ready editor).

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
- Answered (A, 2026-11-10): French headers and data on `/fr/`.
- Found while building (library, not fixed): see `docs/STATUS.md` 2026-11-10 « site, lot 1 ».
