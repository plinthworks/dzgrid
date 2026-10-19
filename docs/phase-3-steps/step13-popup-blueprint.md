# Step 13 blueprint: `/filters` part 2, the filter popup (architect, 2026-10-19)

Decisions on top: `step13-decisions.md` (they win). Byte figures calibrated on step 12 (estimate 2 500, measured 3 488: x1.4).

## 0. Findings
1. `openMenu` is not in core (`keys/intent.ts` has none; `raw()` returns null for Alt keys); core has ~106 B. Handle Alt+ArrowDown in the feature on `g.el.header`, as step 12 did Enter/F2/Escape. Core and conformance unchanged; amend ARCHITECTURE.md:984 and phase-3-plan:527.
2. Nothing imports `popup.ts` yet: the filters entry will bundle ~1 300 B of popup code; measure filters `over: "@dzgrid/dom/popup"` (scripts/size.mjs) so a consumer pays popup once.
3. `header.withFilter` and `filter.popupLabel` are not in any bundle yet; the filter bundles have 2, 8, 15 B of margin.
4. Base `decorateHeader` returns early with no sort and nulls `aria-label` each paint: a feature hook called after it composes `withFilter` over `withSort` without double wrapping.
5. No `filter` slot in SlotContext yet; `NEEDS` already maps `filter` → `filters` (missing-feature works).
6. `PopupHost` already gives a modal dialog (`role=dialog`, `aria-modal`, `aria-label`), Tab trap, Escape with stopPropagation, focus back to the anchor or `g.restoreFocus()`, sweep when the anchor leaves, top layer and RTL placement. No change to popup.ts.
7. Interactive elements in `.dzg-hcell` are owner `cell-widget` and header-click ignores them: a header button never sorts; Enter clicks natively.
8. Resolution, kinds, told-once problems and the pending map (`edit`, `flush`, `pause`) live inside `floatingRow`: extract them (the popup works without a floating row).

## 1. API
```ts
// filters(o?): { floating?, debounceMs?, popup?: boolean /* default true; false = no header buttons, no popup */ }
// returns FiltersFeature = GridFeature & { openFilter(column: string): boolean; closeFilter(): void }
// openFilter: true if opened; false when no filter.<kind> part, header not mounted, kind unusable.
// Anchor: the header button, else the header cell, else the floating cell.
// core columns/{defs,parts}.ts, type only: filter?: false | { kind?, floating?, debounceMs?, ops?: readonly string[] }
// FeatureHandle.decorateHeader?(col, cell): void — called by the base after its decorateHeader (level 0 only).
filter: PartBase & {            // SlotContext.filter; WiredSlot follows
  readonly column: ResolvedColumn<unknown>; readonly kind: string; readonly state: Json | null;
  readonly where: Placement;    // 'server' = a draft with Apply
  readonly debounceMs: number; readonly ops: readonly string[];
  set(next: Json | null, o?: { commit?: 'now' | 'debounced' | 'cancel' }): void;   // same pending slot as floating
  close(): void;                // focus back to the anchor
};
// floating gains: readonly canOpen: boolean; openFilter(): void (anchor = the summary button)
```
Built-in parts `filter.text`, `filter.number`, `filter.boolean` (GridFeature.parts); custom kinds `settings.parts['filter.<kind>']`. No bare `filter` fallback: a column has a popup iff a `filter.<kind>` part resolves (day, instant, set, custom without a part: nothing until steps 14–15). Parts send null when the draft is inactive.

## 2. Behaviour
Content: visible `<label>` on every field, native controls, no placeholders; footer Clear (`filter.clear {column}`) and Apply.
- Text: op select (`filter.ops` or contains, notContains, equals, notEqual, startsWith, endsWith, blank, notBlank; default contains); one value field, hidden for blank/notBlank (apply at once); a stored `caseSensitive` kept (no checkbox).
- Number: 9 ops (default equals); two fields for between (`filter.value`, `filter.valueTo`); `type=text inputmode=decimal`, `readNumber(text, ctx)` (step 12 logic); judge at commit, `aria-invalid`, one `filter.invalid {column}`; invalid at Apply/Enter → nothing sent, focus to the first invalid field, stays open; between with one bound → null.
- Boolean: `role=radiogroup` named `filter.popupLabel`, All / Yes / No → null / true / false; a change applies at once on the client.
- A state the part cannot edit (combined, another type, an op outside `ops`) → summary view (Filter active + Clear).
- AND/OR deferred (Phase 5); the model keeps `combined`.
Apply vs live — client: typed text `set(next)` debounced; discrete changes `commit:'now'`; Apply and Enter = flush then close; Escape or any close flushes (filter kept). Server (`where === 'server'`): a draft, nothing sent until Apply/Enter (`set(next,{commit:'now'})` then close); close without Apply drops the draft. No popup loading state (aria-busy, overlay, announcement carry it).
Echo: while open, each paint (`afterRows`) refreshes the part's context through `mounted`; the box's echo rules (`sent`, `dirty`, canonical) are extracted from inputs.ts into `field.ts` and reused (clean draft rewritten, dirty kept). Closes when: the anchor leaves the page (sweep), the column resolves to another or no `filter.*` part, the grid's dir changes, the grid is destroyed (`onClose` → `m.clear()`, mounts = destroys). Messages/locale changes arrive as updates.
Focus: openers — header button `.dzg-fbtn` (tabindex -1), Alt+ArrowDown (no Ctrl/Meta/Shift) on a header or floating cell (preventDefault + stopPropagation; inert inside a `filter-input` box, on a body cell, on a column without a popup), the floating summary button, `openFilter`. `aria-keyshortcuts="Alt+ArrowDown"` on header cells with a popup. Open: flush the column's floating pending edit; mount into a detached div via `mounted`; `popupsFor(g).open(anchor, content, {placement:'block-end', modal:true, label: msg('filter.popupLabel',{column}), onClose})`; then `m.focus()` (value field selected, or the select for blank ops). One popup per grid; another open replaces it; re-click on the same opener closes. Modal Tab trap. Escape closes and returns to the anchor. Outside pointerdown does not close (step 1 sheet; owner O7). Scroll repositions (`ref.reposition()` each paint while open); a `change` listener repositions too. Focus return: the anchor, else `g.restoreFocus()`.
a11y: dialog, not menu. Opener `aria-haspopup="dialog"`, `aria-expanded` while open (header decoration derives it each paint; summary button at open/close). Button name `filter.popupLabel {column}` = the dialog name. No aria-controls. No announcement on open; after a change the existing `announce.filtered`.
Active mark: `decorateHeader` sets `data-dzg-filtered` when `column in kernel.query.filter`; `aria-label` = `header.withFilter {header: current aria-label ?? header ?? id}` (after withSort), cleared otherwise; the theme fills the glyph (non-colour cue).
Floating summary: with `canOpen` a button showing `filter.summaryActive` (`aria-haspopup`, `aria-expanded`) + Clear; inactive stays empty (`filter.summaryNone` deferred). Popup and box share one pending slot per column (last write wins); opening flushes the box's edit.
RTL: the popup host; logical CSS; number fields `unicode-bidi: plaintext`.

## 3. Sizes (owner decisions in step13-decisions.md)
Base +40 (viewport `decorate` loops `g.features`, the type): ~18 710, no ask. Entry own increment raw ~2 270 (resolver 120, commit 20, header decoration 260, menu controller 420, summary button 90, field + shell 330, text 330, number 280, boolean 160, CSS 140, keys list 120) → calibrated ~3 000–3 400; cumulative ~6 700, measured over popup. 22 new keys: `filter.popupLabel`, `header.withFilter`, `filter.op`, `filter.value`, `filter.valueTo`, `filter.apply`, `filter.op.<op>` x13, `filter.all`, `filter.yes`, `filter.no`; estimates en 510, fr 600, ar 800; optional in GridMessages, `filters()` throws naming missing keys (breaking for step 12 adopters: changelog). Theme ~1 480 (popup surface, shadow, controls, button glyph, filled state, focus ring). Audit profile gains ~1.5 kB over the outlook; steps 14–16 then have ~3 kB of headroom.
Deferred: AND/OR and a second condition, match-case checkbox, inactive summary button, aria-controls, a core `openMenu` intent, a grid-handle `openFilter`.

## 4. Files and tests first
Docs: filter-ui.md (popup, Apply on server, focus, header.withFilter, Alt+ArrowDown in the feature), filter-boolean sheet (write if none), filter-text.md / filter-number.md (ops), filter-custom.md (`filter.<kind>` part), parts.md, phase-3-plugins B2.2/B2.6/B4, ARCHITECTURE.md:984 and plan:527, a11y-protocol §9, STATUS, CHANGELOG (breaking keys).
Code: create filters/{resolve,commit,field,menu,forms}.ts; modify filters/{index,floating,inputs,summary,styles}.ts, part.ts, features.ts, render/viewport.ts, messages.ts, locales/{en,fr,ar}-filters.ts, core columns/{defs,parts}.ts (types), size-budget.json (filters `over` popup, bundles, theme), structure.test.ts (filters may import ../popup.js; the base never), theme scss+css, playground (`filters=1&popup=1`, a boolean column), scripts/browser.mjs.
Unit tests (`filters-popup.test.ts`): open and focus (button, Alt+ArrowDown, openFilter; aria-expanded/haspopup; dialog label; Alt+ArrowDown inert on body cell, in a box, without a part; initial focus per kind; Escape returns; Tab trap wraps; outside pointerdown keeps it; re-click closes; a second open replaces); text ops → model, empty → null, blank hides the value; number between, half → null, fr/ar/12%, invalid → aria-invalid + one announce + no dispatch; boolean All/Yes/No; uneditable states → summary; client live debounce and discrete-now; server draft, Apply one request, close discards, Enter applies, invalid blocks, exclude-mode selection survives; custom part gets wrapped state; no part → no button, no key, no floating button; custom without test under client → no popup; host filter.set while open (clean redraws, dirty keeps); hidden column / filter:false / kind change close it; destroy mounts = destroys; mark and name (`data-dzg-filtered`, withSort then withFilter, cleared); opener never sorts, tabindex -1, `filters({popup:false})`, floating summary is a button, floating pending flushed on open. Base seam test (decorateHeader after the base). Key parity and missing-key TypeError. Guards. No conformance change.
Browser (`filters=1&popup=1`, fr-FR light, ar-DZ RTL dark): axe 0 with the popup open (text, number between, boolean, invalid, filtered mark, with the floating row); button ≥ 24 px; start edge aligned to the anchor (right in ar), flips above near the bottom; names fr/ar; `1,5` and Arabic-Indic digits filter; Tab trap; focus return incl. after the column scrolls out; transformed host card; header layout with label, sort mark, grip and button.
Screen reader §9 (owner, fr and ar): "Montant, filtré" (+ sort); the button with its expanded state; Alt+ArrowDown announces the dialog name; field names and the op select; the count once after a change; Escape returns; on a server, Apply then the count after the answer.
