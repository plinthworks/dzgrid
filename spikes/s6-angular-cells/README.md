# S6 — Angular templates in virtualised cells

**Question.** What does it cost to show a host's Angular template in the cells of a
recycled window (40 rows × 13 columns = 520 cells, 100 000 rows), and how should
the wrapper do it? Decision rule (ARCHITECTURE.md, Phase 0): *if too expensive →
view pool, DOM renderers advised for dense columns*; target §5: ≤ 8 ms per frame
with templated columns, 500 visible cells.

```bash
node spikes/s6-angular-cells/run.mjs                                       # Chrome, then Chrome with CPU ×4
S6_BROWSERS=chrome,chrome-4x,firefox node spikes/s6-angular-cells/run.mjs  # + Firefox, last
```
One browser at a time, closed in `finally`. Results in `results/result.json`
(numbers below: run of 2026-10-16, Chrome 155, Firefox 157, Apple-silicon Mac,
other agents running browsers at the same time — noisy; the owner re-runs).

## Method

- **Build: AOT, production, minified.** `build.mjs`: `ngc` (compiler-cli 21.2,
  `compilationMode: full`) → the Angular linker (Babel plugin from compiler-cli,
  which turns the packages' partial declarations into full ones) → esbuild bundle
  + minify with `ngDevMode=false` (`isDevMode()` checked false in the page).
  *Not* Vite + `@analogjs/vite-plugin-angular`: plugin 2.8 needs
  **`@angular/build`, which is not installed** (`Cannot find module '@angular/build/private'`).
  Not JIT, so the numbers are not pessimistic. The CLI's build optimizer is missing,
  so the bundle (94 kB gz) says nothing about DzGrid's size; runtime should not differ. **[À VÉRIFIER]** with an `ng build`.
- **Angular 21.2, zoneless** (`provideZonelessChangeDetection`), standalone, OnPush,
  signal inputs, no NgModule.
- `src/grid.ts`: a minimal framework-free recycler (row *r* lives in slot *r* mod 40;
  only rows that enter are re-bound) with the §3.8 renderer contract
  `mount / bind / destroy`. `src/app.ts`: the §3.12 shape — host writes
  `<ng-template dzgCell="badge" let-value let-row="row">` inside `<s6-grid>`, the wrapper
  reads them with `contentChildren`.
- Cell content: `s6-badge` (computed class + SVG icon + text) and `s6-action`
  (button with an `output`, bound in the host template to `(act)="onAct($event)"`).
- *t* templated columns out of 13 (1, 3, 6, 13; the last is the button), others plain text.
- Variants:
  1. `text` — one Text node per cell, `data` replaced;
  2. `view-fresh` — `templateRef.createEmbeddedView` on every recycle, old view destroyed;
  3. `view-pool` — one view per cell for life (the pool per column *is* the cells),
     context object mutated + `view.detectChanges()` on that view only; detached;
  3′. `view-pool-attached` — the same, view also `appRef.attachView`ed;
  3″. `view-signal` — context holds signals (`value()` in the template), views attached,
     no `detectChanges`: the zoneless scheduler runs one tick;
  4. `component-fresh` — `createComponent` + `setInput` on every recycle;
  4′. `component-pool` — one `ComponentRef` per cell, `setInput` + `detectChanges`.
- Measures per page load: initial window (mount → first 40 rows, + forced layout);
  30 jumps of 40 rows (every row recycled), script + forced layout; scripted scroll
  150 frames at 5 rows/frame (wheel) and at 40 rows/frame (drag/page jumps): work per
  frame and rAF-to-rAF intervals; heap and DOM nodes after GC (CDP); counters:
  `ngDoCheck` calls, local `detectChanges`, `ApplicationRef` ticks and their time.
- `chrome-4x`: same Chrome with `Emulation.setCPUThrottlingRate(4)`, a stand-in for a
  mid-range office laptop. Firefox's `performance.now()` is 1 ms-granular: its medians are coarse.

## Numbers

Step = one 40-row jump, script + layout, median / p95 ms. Scroll40 = work per frame
at 40 rows/frame (median / p95) and frames over 20 ms out of 150.

**Chrome ×1**

| variant | t | mount | step | scroll5 p95 | scroll40 | long | heap Δ mount | CD per step |
|---|---|---|---|---|---|---|---|---|
| text | 0 | 3.1 | 1.6 / 1.7 | 0.5 | 1.5 / 1.7 | 0 | 0.09 MB | — |
| view-fresh | 3 | 7.4 | 3.2 / 4.6 | 0.9 | 2.8 / 3.1 | 0 | 0.65 | 120 dc, 0 tick |
| view-fresh | 13 | 13.7 | 7.5 / 9.1 | 1.3 | 6.6 / 7.0 | 0 | 1.61 | 520 dc |
| view-pool | 3 | 7.2 | 2.4 / 2.8 | 0.7 | 2.2 / 2.4 | 0 | 0.64 | 120 dc + 1 tick (0.01 ms) |
| view-pool | 13 | 14.1 | 4.5 / 5.3 | 1.0 | 4.0 / 4.5 | 0 | 1.61 | 520 dc + 1 tick (0.03) |
| view-pool-attached | 13 | 14.6 | 4.5 / 5.3 | 0.9 | 4.1 / 4.4 | 0 | 1.65 | 520 dc + 1 tick (0.06) |
| view-signal | 3 | 9.0 | 2.7 / 3.1 | 0.8 | 2.3 / 2.6 | 0 | 0.74 | 1 tick (0.31) |
| view-signal | 13 | 17.0 | 4.8 / 5.6 | 1.1 | 4.2 / 4.6 | 0 | 2.00 | 1 tick (1.11) |
| component-fresh | 13 | 16.7 | 8.7 / 10.6 | 1.4 | 7.2 / 7.8 | 0 | 2.57 | 520 dc + 1 tick |
| component-pool | 13 | 15.6 | 4.4 / 5.3 | 0.9 | 4.0 / 4.3 | 0 | 2.57 | 520 dc + 1 tick |

**Chrome, CPU ×4**

| variant | t=1 step | t=3 step / long | t=6 step / long | t=13 step / long | scroll5 p95 (t=13) |
|---|---|---|---|---|---|
| text | 6.6 / 7.7 (t=0), 0 long | | | | 1.6 |
| view-fresh | 8.9 | 14.0 / 46 | 22.0 / 129 | 30.7 / 150 | 5.4 |
| view-pool | 7.9 | 10.3 / 19 | 13.4 / 59 | 19.8 / 149 | 3.9 |
| view-pool-attached | 8.3 | 10.6 / 19 | 13.8 / 63 | 20.1 / 149 | 4.1 |
| view-signal | 9.5 | 12.2 / 20 | 15.5 / 72 | 22.2 / 149 (tick 5.75 ms) | 4.5 |
| component-fresh | 10.0 | 15.4 / 64 | 21.5 / 134 | 35.6 / 150 | 5.4 |
| component-pool | 8.2 | 10.3 / 13 | 13.0 / 53 | 19.6 / 143 | 3.6 |

Mount of the window at t=13: 56–74 ms (×4), 14–17 ms (×1), 25–38 ms (Firefox).

**Firefox ×1** (1 ms timer): t=13 step median — text 3, view-fresh 14 (20 long frames),
view-pool 7, attached 8, signal 8, component-fresh 17 (35 long), component-pool 7 (0 long).

**Cost per templated cell re-bound** (least-squares slope of the step against the
number of templated cells, text baseline included), µs:

| | view-fresh | view-pool | pool-attached | view-signal | component-fresh | component-pool |
|---|---|---|---|---|---|---|
| Chrome ×1 | 11.4 | 5.5 | 5.4 | 6.0 | 13.5 | 5.1 |
| Chrome ×4 | 46.7 | 25.1 | 25.4 | 28.4 | 54.5 | 24.4 |
| Firefox | 20.0 | 8.0 | 9.9 | 9.4 | 26.6 | 8.0 |

**Memory** (Chrome, heap after GC): ≈ 3.1 kB per pooled embedded view
(1.61 MB / 520), ≈ 3.9 kB with signal contexts, ≈ 4.9 kB per `ComponentRef`.
After 300 frames of scrolling the heap grows 0.2–0.3 MB for pooled variants and
0.3–0.6 MB for fresh ones (no leak seen; view counts balance).

**Outputs**: the button's `(act)` reached the host handler in every variant.
**Host signals**: a host signal read in the template (`[hot]="hot() === row.id"`)
refreshed the cell **only in attached views** (`view-pool-attached`, `view-signal`);
in a detached view it stays stale until the next re-bind.

## Decision

1. **Pool: yes.** A fresh view per recycle costs about **twice** a re-bound one
   (11 vs 5.5 µs Chrome, 47 vs 25 µs ×4, 20 vs 8 Firefox) and leaves more garbage.
   One view per templated cell for the cell's life (= a pool per column), re-bound
   on recycle; destroyed only when the column or the window shrinks.
2. **Re-bind = mutate the context object + `detectChanges()` on that view**,
   synchronously inside the grid's `bind`, and **attach the view to `ApplicationRef`**
   so host signals the template reads keep it current (cost of the extra tick:
   ≤ 0.2 ms at ×4). Signal contexts (`value()` in host templates) are not faster,
   push the work into a separate scheduler tick (5.75 ms at ×4, t=13) that may land
   one frame after the rows moved, and make the host write `value()` — rejected.
3. `createComponent` + `setInput`, pooled, costs the same as a pooled template and
   may be offered as a column option (`cellComponent`); fresh, it is the worst.
4. **Threshold.** Budget = templated cells re-bound *per frame*, i.e. rows entering
   × templated columns. Wheel scrolling (≈ 5 rows/frame) is affordable even with all
   13 columns templated (≤ 4.1 ms p95 at ×4). Full-window recycles (scrollbar drag,
   PageDown, jumps) are what breaks:
   - fast machine (Chrome ×1): 520 templated cells per frame fit — 4.5 ms per jump,
     inside the §5 target of 8 ms; ≈ 1 200 pooled cells per 8 ms;
   - mid-range (Chrome ×4): **≈ 300 pooled cells per 8 ms of template work**
     (25 µs each), but the grid itself already takes 6.6 ms for a 40-row jump, so
     frames start dropping from **≈ 120 templated cells per frame** (t=3: 13–20 % long
     frames, t=6: ≈ 40 %, t=13: all). Fresh views halve these figures;
   - **the §5 target (≤ 8 ms per frame, 500 templated cells) holds only on a fast
     machine**: 4.5 ms Chrome ×1, ≈ 7–8 ms Firefox, ≈ 20 ms Chrome ×4.

   Advice to write in the docs: *up to ~3 templated columns in a 40-row window
   (≈ 120 cells per jump); beyond that, or for any column that is dense or
   frequently re-bound, use a DOM renderer.* Badges, icons, links, formatted
   numbers and dates belong in DOM renderers; templates are for the few columns
   that need Angular (host components, DI, forms).

## What this implies for §3.12

```html
<dz-grid [rowModel]="model" [columns]="columns" [getRowId]="rowId">
  <ng-template dzgCell="status" let-value let-row="row" let-index="index">
    <app-badge [value]="value" (act)="open(row)" />
  </ng-template>
</dz-grid>
```

- `DzgCell` (`ng-template[dzgCell]`, `input.required({ alias: 'dzgCell' })` = column
  id, `static ngTemplateContextGuard` typing `{ $implicit: V; row: T; index: DisplayIndex; ... }`)
  read with `contentChildren`; columns whose id matches get an Angular renderer, the
  others keep their DOM renderer. A column's `cellRenderer` and a `dzgCell` for the
  same id: the template wins **[À VÉRIFIER with the owner]**.
- **Context = plain values**, the same object for the view's life, mutated on each
  re-bind (`$implicit`, `row`, `index`, later `column`, `api`). No signals in the
  context; the host's own components may use signal inputs (one cheap coalesced tick
  per frame follows, measured).
- **Lifecycle** (refines §3.8): `didMount` → create the view once (`createEmbeddedView`
  from the `TemplateRef`, `appRef.attachView`, move `rootNodes` into the cell);
  `didUpdate` (row entered) → mutate context, `view.detectChanges()` on that view;
  `willUnmount` → `detachView` + `destroy`; the spike empties the cell itself before
  `destroy()` (whether `destroy()` alone removes nodes moved by hand was not checked
  **[À VÉRIFIER]**). No `ViewContainerRef` needed.
- **Outputs flow through the template's own closure** (`(act)="open(row)"`), never
  through the grid: nothing to declare on `DzGrid`. The click marks the host for check;
  under zoneless that schedules one tick.
- The DOM layer must call `bind` **outside any reactive context** (the wrapper's
  `effect` already runs `update` in `untracked`, tzslot pattern): `detectChanges`
  inside an `effect` would be both a hidden dependency and an NG0600 risk.
- Skip `detectChanges` when a re-bind brings the same row object and value
  (row stays, column refresh) — free win, not measured.

## Open points

- **[À VÉRIFIER]** Real mid-range hardware rather than CPU ×4; Safari not measured;
  headed Chrome with a real 120 Hz display not measured (headless rAF at 60 Hz).
- **[À VÉRIFIER]** The text baseline at ×4 (6.6 ms per 40-row jump without any
  template) is the recycler's own cost — S9's question; it eats the frame budget
  before templates do.
- **[À VÉRIFIER]** An `ng build` (CLI, build optimizer) — expected same runtime, smaller bundle.
- The counters (`ngDoCheck` in each cell component) add a little cost to every variant.
- Heavier host templates (a `@for`, a nested component tree, DI-heavy components)
  cost more per cell; these numbers are for a badge + icon + text and a button.
- Focus inside a templated cell that is re-bound (button focused, row scrolls out):
  belongs to S10's retained-row contract.
- Firefox numbers are 1 ms-granular; take medians as ±1 ms.
