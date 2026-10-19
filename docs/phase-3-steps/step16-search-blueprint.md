# Step 16 blueprint: quick search box (architect, 2026-10-19)

Decisions on top: `step16-decisions.md` (they win).

## 0. Facts
- `GridInstance` exposes only `kernel`, `api.announce`, `update`, `destroy` (grid.ts:37): no `msg`, scope, idle loop or `restoreFocus`, so the plan's `bindQuickSearch(input, grid)` (phase-3-plan.md:565) cannot say the count in the grid's language; a feature (GridContext in `setup(g)`, features.ts:21) can.
- `quick.set` emits `quickChanged` only (kernel.ts:285), not `filterChanged`: announceFilters says nothing for a search today.
- Core covers the rest: server `quick` sent only when `trim() !== ''` (operations.ts:97); client `counts.filtered` includes quick (client.ts:467); `warmSearch()` returns DONE when quick is on the server (rows.ts:449); emptying releases the caches (client.ts:525).
- The base warm-up (warmup.ts:10) runs only with `searchWarmup === 'idle'` (off by default, D13, 627 B per row held).
- The overlay's clear-all is one `query.set` keeping the sort (slots/index.ts:36): also empties quick.
- dom has 28 B left, filters 140 B.

## 1. API — a feature in its own entry `@dzgrid/dom/search`
```ts
import { quickSearch } from '@dzgrid/dom/search';
const search = quickSearch();                 // GridFeature & { bind(input, o?): () => void }
createGrid(host, { features: [filters(), search], ... });
const unbind = search.bind(document.querySelector<HTMLInputElement>('#q')!, { debounceMs: 200 });
```
Binds a HOST input (no built-in box, no CSS injected). `bind` several times / several inputs; calls before setup queued; after destroy a no-op; re-binding an input unbinds it first. Unbind removes listeners, drops the pending edit without applying, restores attributes we set, leaves the grid's quick text. Option `debounceMs` (finite ≥ 0, else default), separate from `filters({debounceMs})`. Supersedes `(input, grid)`, "turn searchWarmup:'idle' on while bound", and "hosts bind quickFilter themselves" (plan:785). No `bindQuickSearch` alias (one-line export ~20 B if wanted).

## 2. Behaviour
- Pause 150 ms (ops.quick client) / 300 ms (server) / the option; one pending edit per input.
- Sends `value.trim()` (ends only) with `quick.set`, source user (the kernel ignores an equal key, kernel.ts:267; the wire key hashes untrimmed text, rows.ts:350, so trimming is required).
- Pause applies; Enter applies at once, stays, `preventDefault` (no form submit), ignored during composition; blur applies at once.
- IME: ignore `input` with isComposing; `compositionend` applies through the pause; Enter/Escape during composition ignored with `isComposing || keyCode === 229` (Safari sends compositionend before Enter) — run the same check in the filters boxes (browser test).
- Escape: non-empty → clear, flush, stopPropagation; empty → let it through to the host.
- ArrowDown (no modifier) → `g.restoreFocus()` (the bridge to the rows).
- Emptying (native X) uses the pause.
- Warm-up (client only): the first focus of a bound input (or binding a focused one) sets `want = true` → `warmSearch` in idle time with the base idle loop; while `want`, rows/context updates re-warm; `want` false after the last unbind. No keystroke or idle-at-load trigger (D13 stays off). Base change: `installWarmup` returns `want`, checks `searchWarmup !== 'idle' && !want`; exposed as `g.warm`.
- Server: one request per pause; empty after trim → no request; the gate drops stale answers.
- Selection: "all matching" tied to the query; `dropStale` announces `selectionCleared` once per applied change; keepOnFilter:false clears on search too. No new rule.
- Announcement: reuse base `announce.rows` ("12 rows"/"0 rows"; overlay carries `grid.noMatches`): 0 new keys, no dependency on filter bundles. A small copy of the after-the-answer logic of filters/announce.ts on `quickChanged` source user: client at once; server after `modelUpdated` when the phase was loading; silent on error and when `counts.filtered` is null. A clear-all with filters says two texts within 50 ms; the live region keeps the last.
- Echo: each input keeps `sent` (the trimmed text it dispatched); on `quickChanged`, `text === sent` → untouched (caret, inner spaces); different → cancel pending timers, rewrite every other bound input except one in composition (until compositionend). The kernel wins (a clear-all is not undone 150 ms later). Two boxes mirror. At bind: the grid wins if it holds text; else input text (browser restore) dispatched with source `'api'`, no announcement.
- Highlighting matches: Phase 5 (needs a fold-to-original index map in core and the renderer, `<mark>` reading decision).
- Floating row and filters: AND; value lists already count over the browser search; server `values()` carries `quick`. An input inside the grid host: the grid's key handler must not take its keys (test; if needed `data-dzg-owner="filter-input"` only when inside our root).
- a11y of a host input: may set only when absent, restored on unbind: `aria-controls` = the grid element's id (assign one on OUR element if none; skip across shadow roots/documents), `dir="auto"`, `autocomplete="off"`, `enterkeyhint="search"`, `spellcheck="false"`. Never touch `type`, `aria-label`, `aria-labelledby`, `aria-describedby`, `aria-live`, `aria-busy`, `id`, `value` (except echo), classes, styles. The accessible name is the host's (docs; axe fails an unlabelled input).
- i18n: 0 new keys; the overlay wording stays.

## 3. Bytes
Own entry (in filters it would be ~+950 B over a 140 B margin and force 9.2 kB of filters on search-only apps): new line `@dzgrid/dom/search` 1 100 B gz (estimate 700 → ~950; external core, core/internal; `"./search"` in packages/dom/package.json exports); `@dzgrid/dom` 18 750 → 18 900 (`want` in warmup.ts, `g.warm`, the grid.ts line; ~95 B); core, bundles, base locales, theme 0. Without the dom ask the entry bundles its own idle loop (~350 B).

## 4. Files and tests first
Docs: create `docs/behaviors/quick-search-box.md`; update quick-filter.md, filter-ui.md (Escape/Enter parity, IME check), phase-3-plan step 13 text and phase-3-plugins B2/B4 (the search entry), a11y-protocol, STATUS, ROADMAP (highlight deferred), size-budget.json, ARCHITECTURE "Décisions de l'étape 16", CHANGELOG.
Code: create packages/dom/src/search.ts and search/{index,bind,said}.ts; edit warmup.ts, context.ts, grid.ts (g.warm; net zero lines), packages/dom/package.json exports.
Unit `search.test.ts` (fake timers): pauses and override, trailing space sends nothing; Enter flush + preventDefault, Escape both cases, blur, ArrowDown to the grid; IME (keyCode 229); echo (own text kept, external quick.set rewrites, clear-all rewrites and cancels, composing left alone); two inputs mirror; unbind one; unbind restores attributes, drops pending, leaves the grid's text; host aria-label/describedby/id untouched; aria-controls absent across a shadow root; announcements (once per pause client, after the answer server, silent on error and unknown count, one final text after clear-all with filters); warm-up (once on first focus per data version client, never server, want off after last unbind, no effect with searchWarmup idle on); server one request per pause, whitespace none, "all" selection cleared once mid-word; bind before setup / after destroy; destroy leaves no listener/timer; seam test (the base never imports search).
Random walk `search-walk.test.ts` (seeded, WALK_SEEDS/WALK_SEED, fake gate, floating row): type, composition, pause, Enter, Escape, blur, external quick.set, clear-all, second input, unbind/rebind, out-of-order answers, locale change, a floating-row filter; invariants: idle inputs' trimmed value = kernel quick; no dispatch while composing; ≤ 1 request per pause; wire quick = trimmed or absent; no timer after unbind/destroy; live text = settled count; no stale answer announced.
Browser (`search=1`, fr light, ar RTL dark): Arabic query with diacritics finds folded rows; `dir=auto`; Escape, Enter, focus to the grid; warm-up timing; axe (named input, valid aria-controls); Safari Enter-after-composition for the search box and the floating box.
Screen reader: name and searchbox role; "N rows" once after a pause; zero → "0 rows" and the overlay; Escape → full count once; ArrowDown → focused cell read; Arabic IME silent mid-composition; slow server silent until the answer; search + filters one coherent last announcement.

## 5. Outlook
Step 17 (pagination): its own entry; a third copy of the after-the-answer announcer → create `@dzgrid/dom/internal` (external entry for features) and fold filters/search/pager copies into it; probably a footer seam in the base (+200–400 B: dom ~19 100–19 300); ~6 keys in per-feature bundles; no core change (160 B left). Step 18: both configurations with the search box, axe fr/ar, permutations with typing interleaved with server latency. Step 19: exports respect quick (client displayed rows; server exportAll carries quick): a test. Step 26: never animate a search's pauses; reduced motion.
