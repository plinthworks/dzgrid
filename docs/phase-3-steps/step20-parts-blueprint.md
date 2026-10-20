# Step 20 blueprint: `@dzgrid/dom/parts` — `cell.badge`, `cell.boolean`, worked example 2 (architect, 2026-10-20)

Decisions on top: `step20-decisions.md` (they win).

Worked example 2 = the "between two numbers" filter with a slider (docs/phase-3-plugins.md §B2.8, lines 409-441): a custom `FilterKind` `between` + a `filter.between` part (`filterKinds: [between]`, `parts: {'filter.between': …}`); a test fixture only, no runtime code.

## 0. cellClass
Stays at step 26: it needs a per-cell class write in the base paint (render/rows.ts ~418-463), settings/types, and a class cache for pooled rebinds (~+110–150 B base; base at 19 048 / 19 100), and shares a cell hook with the value-change flash and motion-gsap. Until then a host styles through a part.

## 1. API (`src/parts/index.ts`, re-exported by `src/parts.ts`)
```ts
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export interface BadgeOptions { tones?: Readonly<Record<string, Tone>>; fallback?: Tone /* default 'neutral' */ }
export function badge(o?: BadgeOptions): SlotPart<'cell'>;   // per column map
export const cellBoolean: SlotPart<'cell'>;
export const PARTS_KEYS = ['cell.yes', 'cell.no'] satisfies readonly PartsMessageKey[];
```
Registration: `parts: { 'cell.boolean': cellBoolean, statusBadge: badge({ tones: { done: 'success', late: 'danger' } }) }`, reached through `ui.cell: 'statusBadge'`; `cell.boolean` applies to every boolean column. No GridFeature, no setup, no style injection, nothing from /internal.
Badge: label = `c.text` (the codec's label; unknown value shows the value); tone = `tones[String(c.value)] ?? fallback`; null/blank → empty host; DOM `<span class="dzg-badge" data-tone="success"><span class="dzg-glyph" aria-hidden="true">✓</span><span dir="auto">label</span></span>`; glyphs success ✓, warning !, danger ✕, info i, neutral none; the tone is never in the accessible name.
Boolean: true `✓` + `msg('cell.yes')`, false `✗` + `msg('cell.no')`, null empty; visible text in the accessible name, glyph aria-hidden; neutral appearance; uses msg (the codec text is English true/false).
Locale: keys `cell.yes`, `cell.no` (`PartsMessageKey`/`PartsMessages`, types only), bundles `locales/{en,fr,ar}-parts.ts` (Yes/No, Oui/Non, نعم/لا); not `filter.yes/no` (filters bundle may be absent); a missing key is reported (throw isolation).
RTL: inline-flex, logical padding/gap, glyph first, nothing mirrored; label `dir="auto"`.

## 2. Theme
New palette colour `success` in `$tz-palette` (dzgrid.scss): `(#15803d, #4ade80)`; also dzgrid.css, tailwind.css (green-700 / green-400), contrast.css. Tones: neutral `--tz-fg-muted`, info `--tz-accent`, success/warning/danger `--tz-success/warning/danger`. `.dzg-badge { --t: var(--tz-fg-muted); border: 1px solid var(--t); background: color-mix(in srgb, var(--t) 12%, var(--tz-bg)); color: var(--tz-fg); }`, `[data-tone=…]` sets `--t`, `.dzg-glyph { color: var(--t) }`; forced-colors: border currentColor. Contrast pairs per tone (20): `--t` on bg ≥ 3, `--t` on badge bg ≥ 3, fg on badge bg ≥ 4.5, `--t` on row-selected bg ≥ 3; derived badge bg per tone; if a warning/danger pair fails at 12 %, lower the mix to 8 %.

## 3. Bytes
`@dzgrid/dom/parts` ~450 → ask 600; en/fr/ar-parts ~95/105/120 → ask 130/140/160; theme expected ~2 030 within 2 050 (2 100 only if the measure goes over); dom base and core 0; K.8 unchanged (the audit profile doesn't include parts).

## 4. Files and tests first
New: src/parts.ts, src/parts/index.ts (+ badge.ts, boolean.ts), locales/{en,fr,ar}-parts.ts, docs/behaviors/badge-boolean.md (first). Modified: messages.ts (types), scripts/build.mjs, packages/dom/package.json, size-budget.json, theme scss/css/tailwind/contrast + contrast-pairs.json, docs/behaviors/parts.md, STATUS, ROADMAP (cellClass note).
Tests: `parts-cells.test.ts` (badge label/tone/fallback/null, glyph aria-hidden, boolean by type, pooled update: mounts = destroys, element identity, rebind text/tone, null→value→null, no update on an unchanged rebind; throw isolation in mount/update with a throwing tones Proxy, reportError once, not retried until data changes, missing cell.yes reported; sort, quick search, CSV on a badge column unchanged vs plain text); `example-between.test.ts` + fixture `fixtures/between-slider.ts` (client filtering, read round trip, {min:null,max:null} inactive, server request `{type:'custom',kind:'between',value:{gte,lte}}`, floating summary opens the popup, debounced commit, labels via app.between.min/max, throw isolation, no physical sides); `parts-guards.test.ts` (exports, size entries, no literal text, no physical CSS side, bundles = PARTS_KEYS); browser `test/browser/parts.ts` (axe fr LTR and ar RTL with every tone, boolean true/false/null, selected and hovered rows, accessible name contains the label, glyph hidden, a badge survives a scroll with focus kept, RTL, forced-colors screenshot); theme (contrast checker with the 20 pairs per palette, css drift test, high-contrast fixture with --tz-success).
