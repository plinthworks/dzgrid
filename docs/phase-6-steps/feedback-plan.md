# Feedback pass: plan (retours d'usage, allergen-detector)

Sources: `app-feedback.md`, `decisions.md` (« App feedback pass », « Integration in a real app »), the app's DzGrid files (read only). Plan only: no code, no budget change. Sizes below are ESTIMATES (gzip bytes); the builder measures with `scripts/size.mjs` and the budget changes only by an owner decision.

Budgets now (from the lead; `size-budget.json` ceilings): `dom/filters` 9 904 / 10 000 (96 B left), `dom` base 22 193 / 22 400 (207 left), theme 2 530 / 2 750 (220 left), `core` 29 150 (measure), `dom/pagination` 3 550, `filters: set (lazy)` 4 200, `date adapters (lazy)` 2 600, `dom/popup` 1 650, `dom/slots` 1 400. The filters entry cannot take items 3 + 9 + 4's wiring without compression or a raise (Q1).

Order of work: 1, 8 (bugs, browser first) -> 3, 6, 5, 9 (small) -> 4 -> 10 (doc + test) -> 2 -> 7, fr text, Angular notes (docs).

## 1. Pagination arrows (BUG) - `dom/pagination`

Finding (read, to confirm in the browser): the chevrons ARE in the shipped 0.3.0 (`pagination/styles.ts`, `.dzg-pbtn[data-go]::before`, drawn with `border-*: 2px solid`, inside `@layer dzgrid.layout`). The app uses Tailwind 3 (`@tailwind base`): its preflight `*,::before,::after{border-width:0;border-style:solid}` is UNLAYERED, so it beats every layered rule and zeroes our borders: empty buttons. Same risk for the tree toggle chevron (`TREE_CSS`) and any glyph we draw with borders. A layered border glyph is not safe in a host with an unlayered reset.
- Fix: put real glyphs in the DOM, not in CSS. In `pager.ts` mount, each of the four buttons gets one `span` (`aria-hidden="true"`) with `«` `‹` `›` `»` (U+00AB, 2039, 203A, 00BB; written as JS escapes, see the memory note on unicode escapes: build with a variable, never raw in tool input). These four are Bidi-mirrored characters: in an RTL grid the browser draws them turned, so first/prev/next/last keep their logical meaning with no extra CSS. Accessible names already exist (`aria-label` from `pager.first|prev|next|last`, set in `update`); the glyph span is hidden from them. Disabled state unchanged (`aria-disabled`, never `disabled`).
- Remove the `::before/::after` chevron rules and the `--dzg-chevron` lines of `PAGINATION_CSS` (net bytes down). Keep `min-inline-size` target size. `font-size`, `line-height:1` on `.dzg-pbtn` in the layout CSS.
- Audit the same fault in `tree/styles.ts` (`.dzg-toggle::before`), sort mark and resize grip: list which rely on `::before` borders; fix tree the same way only if the browser repro shows it (own step, own budget note).
- Bytes: `dom/pagination` -40..+40 (CSS out, 4 spans in). Theme 0.
- Tests FIRST (`packages/dom/test`, jsdom): each `[data-go]` has a child with the right char, `aria-hidden`, and the button's accessible name has no glyph; `update` does not recreate the span (nodes stay, as the part's contract says); rtl: same chars, no `--dzg-chevron` left in `PAGINATION_CSS`; a `last` removed by cursor mode keeps the other three glyphs.
- Browser (`--only pagination`): inject a Tailwind-preflight-like unlayered `*,::before,::after{border-width:0;border-style:solid}` before the grid; each arrow has a non-empty box with visible ink (pixel or `getBoundingClientRect` of the span > 0, computed color contrast >= 3:1 against the footer) in light, dark, and `dir=rtl` (first is drawn pointing right); click and `aria-disabled` still work; axe on the footer.
- Docs: `behaviors/pagination-footer.md` (glyphs are text, themeable with `font`/`color`), CHANGELOG « Fixed ».

## 2. Inline period form - `dom/filters` date kit (lazy) + tzslot

Finding: tzslot 2.x `FieldMode = 'popup' | 'dialog'` (`/Users/nadou/Dev/tzslot/packages/dom/src/panel.ts:13`). NO `'inline'` mode. But tzslot already exports an inline calendar widget, `createDateRange(host, options)` (`dom/src/date-range.ts:94`), the thing a range field shows inside its panel. DzGrid's range adapter (`filters/dates/range.ts`) uses `createRangeField`, hence the second panel.
- Plan A (DzGrid, ships without waiting): new option `filters({ dateCalendar: { inline: true } })` (type-only in the existing `dateCalendar`; today `months`, `presets`). In the range kit, when `inline`: two labelled fields FROM / TO (same `named()` and messages as the range field: `filter.value` / `filter.valueTo`) and ONE `createDateRange` (months 1) in the flow of the popup, no preset column unless `presets` is given, no `createRangeField`. Fields and calendar write the same pending edit; typing a valid day moves the calendar; clicking sets FROM then TO. Escape closes the popup (T8 workaround not needed: no panel). Focus order: FROM, TO, calendar, Apply. The popup width: `max-inline-size` from content (one month, ~20 rem), no overflow.
- Plan B (tzslot request, below): `FieldMode 'inline'` on `createRangeField`; DzGrid then only passes `mode:'inline'`. Both can coexist: A is the fallback until tzslot ships B; DzGrid pins 2.2.0 (docs/tzslot-requests.md), so B also raises the peer floor.
- Bytes: all in the lazy adapters chunk (`date adapters (lazy)` 2 600, measure; likely +250 B -> owner raise), `dom/filters` +15 B (the option's validation in `dateCalendar` checker, `filters/dates.ts`). Prefer to drop code the range kit no longer needs for inline.
- Tests FIRST: `dateCalendar.inline` validation (bad value = `invalid-setting` warning, as the siblings); in the kit: FROM/TO typed -> state `{from,to}`; calendar click order; reversed typing swaps or flags (as the range field does today, copy its rule); day column has no zone text (T6); `TZ=Pacific/Auckland` run; Samoa lost day greyed (T7 `lost()` reused); no `.tz-field__panel` ever created in inline mode; destroy removes listeners.
- Browser (`--only dates`): open a day-column period filter: no second panel (`.tz-field__panel` count 0), popup inside the viewport on the LAST column (ltr and rtl), keyboard-only complete flow, Apply writes the filter, axe clean, fr + ar digits.
- tzslot request text (for the tzslot session; add as T12 in `docs/tzslot-requests.md`):
  > **T12 (feature)**: `RangeFieldOptions.mode` accepts only `'popup' | 'dialog'`, so a range field placed inside another floating surface (DzGrid's filter popup) opens a second panel on top, overflowing the host. Please add `mode: 'inline'` to `FieldMode` (`dom/src/panel.ts:13`) and to `createRangeField` / the Angular `tz-range-field`: the FROM and TO inputs, the preset list (optional) and ONE calendar (`months` as set, default 1) rendered in the flow of the host, no `position`/popover/dialog, no Escape or outside-click handling of its own (the host owns them), same value, same events, same accessible names (subject + value). `injectStyles:false` and a `nonce` honoured (T2). Acceptance: inside a 20 rem popover no overflow, no second layer, keyboard flow FROM -> TO -> calendar, RTL mirrored.

## 3. « Condition » hidden for a single operator - `dom/filters/forms.ts`

- In the operator block (`forms.ts` ~195-210): when the operator list (`column.filter.ops` or the kind's) has exactly one entry, the select (`so`) and its label are not rendered (`hidden`, removed from tab order) and the one operator is used silently; `texts()` still keeps the options for when the list changes live (`ops` re-resolved on update). The form keeps the field(s) of that operator. Accessible name of the value fields must not depend on the hidden label.
- Bytes: `dom/filters` +25..35 (the tight one). Recover ~40 B by compression in `forms.ts` (shared label helper) or ask Q1.
- Tests FIRST: ops `['betweenDays']` -> no `select`, `read()` still returns `{type, op:'betweenDays'}`; two ops -> select shown; ops changed from 2 to 1 and back (update) shows/hides without losing the draft; hidden label not in the dialog's tab sequence; the focus goes to the first value field.
- Browser (`--only filters`): popup of a column with one op: no « Condition », first focus on the value, Enter applies.

## 4. `filter.set` option-row part - `filters: set (lazy)`

- API: a new part slot `filterOption` (name `filter.set.option`, used for a column through `filter: { kind: 'set', optionPart: 'pills' }`; registered by `definePart('filterOption', { mount(host, c) { ...; return { update } } })`). Context (`SlotContext['filterOption']`): `value: string | null`, `label: string` (the grid's, blanks resolved), `count: number | null` and `countText` (grid digits), `selected: boolean`, `blank: boolean`, `column`, `toggle()` (flip this value in the draft), plus the usual `ctx`, `dir`, `msg`, `announce`, `context`. The host paints the content of the row; the grid keeps the row element (`role=option`, `aria-selected`, `id`, roving focus, keyboard, virtual positioning, the option's accessible name `label, count`) so a11y and the 10 000-values path do not move into the part. The part is mounted into the row's content box when the pooled node is bound, `update`d on rebinding (the pool recycles by value: the part must write texts/states only, the same contract as other parts), destroyed with the node.
- Files: `part.ts` (slot, `WiredSlot`, `NEEDS: filterOption -> filters`), `core/columns/parts.ts` (`PartSlot` + `filter.optionPart` read in `partNameFor`), `filters/set/list.ts` (`option()` / bind), `filters/set/index.ts` (passes the resolved part), `filters/set.ts` (resolves the name; unknown name = `unknown-part` error + default row).
- Bytes: `filters: set (lazy)` +150..250 (measure; Q2 raise), `dom/filters` +20 (resolve the name), `core` +20 (type + read), `dom` base +25 (`WiredSlot`, `NEEDS`). Budget the base from its 207 B headroom.
- Tests FIRST: default row unchanged (snapshot of the existing set tests); a part gets `{value,label,count,selected}`; clicking the part's `toggle()` and the row's click both toggle; recycling keeps one part instance per pooled node and `update` is called with the new value; keyboard (Space, arrows, Home/End) unchanged with a part; a throwing part is isolated (existing part error path) and the default row shows; 10 000 values: mounted parts <= window + overscan; part destroyed on popup close.
- Browser (`--only filters`): pills part in a set popup with counts, select two, summary chip, clear-all; scroll 5 000 values, no leak of nodes; axe: option names still `label, count`.
- Docs: `behaviors/filter-set.md`, `angular-parts.md` (`<ng-template dzgPart="pill" slot="filterOption" let-c>`, the Angular slot type map).

## 5. Pass-through bag + unknown `ui` keys - `core/columns/defs.ts`

- API: `ColumnDef.ui.data?: Readonly<Record<string, Json>>` (plain data, so definitions stay JSON-saveable), delivered verbatim, same reference, to every part of the column through the existing `c.column` (ResolvedColumn keeps `ui`: to CONFIRM first, test below). No new field on the contexts. App's `pillOptions` becomes `ui: { data: { pillOptions } }`.
- Unknown keys: `resolveColumns` emits `unknown-ui-key` (warning, path `columns[i].ui.<key>`, detail the key) once, for any key outside `cell, header, tooltip, cellClass, headerClass, data`. Add the code to `problems.ts` and the doc table. Same for unknown `filter` keys is NOT in scope (ask Q3).
- Bytes: `core` +60..90 (a Set of six names, one loop), types free; the core is measured, raise only with the owner.
- Tests FIRST: `column.ui.data` reaches `cell`, `header`, `filter` and `floating` parts by identity; absent `data` = undefined; `ui: { pillOptions }` -> one warning naming the key, grid still works; the six known keys silent; a column group's children are checked.
- Browser: none beyond a `--only parts` run; Angular: `[columns]` with `ui.data` read in a `dzgPart` template (`c.column.ui.data`).

## 6. Column names a part whose feature is absent - `dom/part.ts` `unslotted()`

Existing: `unslotted()` warns `missing-feature` for `settings.parts` and `columns[i].filter`. Gap: a column's `ui.header|cell|tooltip` naming a part (own or built-in, e.g. `header.filterBox`) whose slot needs `slots()` (or `filters()` ...) is silent when the part is absent from the registry or never rendered.
- Add to `unslotted()`: for each leaf, for `header` and `tooltip` (NEEDS `slots`), a `missing-feature` warning `columns[i].ui.header`, detail `slots`, when `slots` is not in features; for a name that is a feature's built-in part (`header.filterBox`: `filters` too). `cell` needs nothing. When the name is also unregistered, keep ONE problem (`missing-feature` first; `unknown-part` is not repeated).
- Bytes: `dom` base +70..90 (headroom 207); share the `missing()` helper already there.
- Tests FIRST: `ui.header:'x'` without `slots()` -> one `missing-feature` (path, detail `slots`); with `slots()` none; `header.filterBox` without `filters()` -> detail `filters`; `ui.cell` none; leaf index counted through groups (as the existing `leaves`); the problem is told once and again after `updateSettings` adds the column.
- Browser: none (jsdom is enough); sandbox page prints problems in the console.

## 7. `--dzg-row-height` - document, do not support

Finding: the variable is an OUTPUT of the grid: `render/viewport.ts:229` writes it on the root (inline style) from `rowHeight`/density; the theme reads it (`dzgrid.css:74`, spans, wrap). A stylesheet value loses to the inline style, so it can never work, and reading CSS back would cost a `getComputedStyle` per layout and break virtual-row maths. Zero bytes.
- Docs: `behaviors/density.md` and `theme-in-3-lines.md`: « `--dzg-row-height` is set by the grid; to change it use `rowHeight` or `density` (a number from 24) »; Angular input `[rowHeight]`.
- Test FIRST (one): `rowHeight: 52` sets the root property to `52px`; a host stylesheet declaring the variable does not change layout (documents the contract).
- Owner choice in Q4 only if they want a CSS-driven height.

## 8. Unchecked checkboxes invisible in light theme - `theme/dzgrid.css`

To MEASURE first (some of these are native inputs, some spans): the selection column (`.dzg-check`, native `input[type=checkbox]`), the header select-all (`role=checkbox` box), the set filter's `.dzg-box` (span), boolean editors.
- The theme sets only `--tz-accent`; a native unchecked box takes the UA border, which varies (Chromium ~#767676 on white = 4.5:1, but a host `color-scheme`, a Tailwind/other reset or dark-on-light mix can leave it at 1:1). WCAG 1.4.11 asks 3:1 for the box edge.
- Fix: theme rule `.dzg input[type=checkbox]{accent-color:var(--tz-accent);border:...}` is NOT reliable for native boxes; use `appearance:none` + a 1rem box with `border:1px solid var(--dzg-check-border, var(--tz-fg-muted))`, checked fill `--tz-accent`, check mark via `clip-path`/mask-free borders inside the layered theme... beware item 1: draw the tick without borders (a `background` gradient or `clip-path` polygon) so a host reset cannot erase it, and keep `forced-colors` (system colours). Indeterminate state too.
- Bytes: theme +110..170 (220 headroom). Midnight/clinic/tailwind/bootstrap themes: tokens only, check each.
- Tests FIRST: `scripts/check-contrast.mjs` + `theme/contrast-pairs.json`: add the pair `--dzg-check-border` on `--tz-bg` and on `--dzg-row-selected-bg` (>= 3:1, light and dark, every shipped theme); a theme-contract test that `.dzg-check` has the rule.
- Browser (`--only themes`): computed border colour vs row background >= 3:1, unchecked/checked/indeterminate, ltr/rtl, `forced-colors: active` emulation, a page with an unlayered `*{border-width:0}` reset (tick and box still visible).

## 9. Styling parts in the top-layer popup - docs + hook

Finding: the popup (`popup.ts:76`) has class `dzg-popup`, in the top layer, so a component's scoped (emulated-encapsulation) styles never match it.
- Docs: `behaviors/theming.md` + Angular guide: global CSS or `ViewEncapsulation.None`; `::ng-deep` is deprecated; place rules in a global sheet under `@layer` above `dzgrid.layout`.
- Hook: popup root gets `data-column="<id>"` and `data-kind="<kind>"` (set by the filters feature when it opens) plus an optional `filters({ popupClass: 'my-class' })` setting (a string, validated, added to `className`). Attributes are the cheap part; `popupClass` only if Q5 says so.
- Bytes: `dom/filters` +30..45 (attributes) or +60 (with `popupClass`): the tight budget - recover from compression or Q1.
- Tests FIRST: the popup carries `data-column`/`data-kind` on open and the new values on a replacing opener; `popupClass` bad type = `invalid-setting`; removed on close; no id leak with an unknown column.
- Browser (`--only filters`): a global rule `.dzg-popup[data-column=price]{...}` paints that popup only.

## 10. A header part drives its column's filter - EXISTS, audit + doc

Finding: Phase 6 step 21 already gives it: `SlotContext['header'].filter` is a `HeaderFilter` (`kind, state, where, debounceMs, dropped, set, canOpen, openFilter`) with `filters()` + `slots()`; the same pending edit as the floating row and the popup; `header.filterBox` is the ready part (`behaviors/parts.md`). The app (0.3.0) did not use it. Live « filter as you type » = `c.filter.set({ type:'text', op:'contains', value }, { commit:'debounced' })` (check the exact text state in `filter-text.md`), clear = `set(null, { commit:'now' })`.
- Work: no new API. (a) an example part « header search » in `docs/behaviors/parts.md` and `angular-parts.md` (a `dzgPart` header template with an `input`), including stopping `click`/`keydown` bubbling from the input so it does not sort (the app « swallows sorting » because it did the reverse), (b) tests that pin it: a header part's `set` shows the chip, the summary, clear-all and the state; Space/Enter in the input do not toggle the sort; `dropped` resets the input; (c) gaps to check in the browser: the header's `filter` is null when the column has `filter:false`; the part also works with `where:'server'`.
- Bytes: 0 (docs and tests). If a real gap shows (the sort key swallowing), it is a fix in `slots/index.ts` (+<=30 B, headroom 1 400 - measure).
- Browser (`--only filters`): type in the header input: rows filter after the debounce, the chip appears, « Clear all » empties the input, sort click on the label still sorts, Space inside the input types a space.

## fr `filter.clear` (wraps the footer)

- `locales/fr-filters.ts`: « Effacer le filtre {column} » -> visible text « Effacer » and the accessible name keeps the column. `forms.ts:88` sets the visible text with `{column}`; `summary.ts:56` uses it as `aria-label`. Option 1: new key `filter.clearName` (full name for `aria-label`) and `filter.clear` = « Effacer » (en « Clear », ar « مسح »), visible text without the column, name with it (WCAG 2.5.3: the name starts with the visible text). Cost: 1 key x 3 locales (~+25 B each locale-filters entry) and `dom/filters` +10. Option 2: only shorten fr to « Effacer {column} » (0 B, still wraps for long names). Also add `min-inline-size:0; overflow-wrap:anywhere` to `.dzg-ffoot` in `filters/styles.ts` (+15 B) so a long label wraps inside its button.
- Tests FIRST: fr `filter.clear` has no `{column}` (option 1) and `filter.clearName` does; both buttons keep the column in the name; en/ar parity test of the key lists (existing).
- Browser (`--only filters`): a 40-character column name, 20 rem popup: footer on one line (Clear, Apply), no overflow, fr and ar.

## Angular guide notes (docs only; `docs/behaviors/angular-parts.md`, `angular-example.md`, the Angular README)

- `slot` on `<ng-template dzgPart>` must be a binding, `[slot]="'header'"`; a static `slot="header"` never reaches the signal input (the part then registers as `cell`). Include a symptom line (« the header shows the default label »). Check whether the directive can warn when `slot` is the static attribute (not possible without reading the attribute: consider `dzgPart` problem `part-slot-static` ONLY if cheap in `@dzgrid/angular`; own budget, ask Q6 if wanted).
- CSS `content`: write escapes in .scss (`'\00AB'`), a raw `«` was emitted empty by the Angular build (charset); after item 1 the grid needs no `content` for arrows, so say it.
- Popup styling (item 9) and Tailwind preflight (item 1 cause): « the grid's glyphs are text, not borders ».
- Item 7 note in the same page.

## Budget summary (estimates, to be measured; nothing changed here)

| Entry | Now | Items | Delta |
|---|---|---|---|
| `dom/filters` | 9 904 / 10 000 | 3, 9, 4 wiring, clear | +25..35, +30..60, +20, +10, +15 = +100..140: does NOT fit. Compress `forms.ts`/`summary.ts` first, then Q1 |
| `dom` base | 22 193 / 22 400 | 6, 4 | +95..115 (fits, 207) |
| `dom/pagination` | 3 550 | 1 | -40..+40 |
| theme | 2 530 / 2 750 | 8 | +110..170 (fits) |
| `filters: set (lazy)` | 4 200 | 4 | +150..250 (Q1) |
| date adapters (lazy) | 2 600 | 2 | +250 (Q1) |
| `core` | 29 150 | 4, 5 | +80..110 (Q1) |

## Tests and runs

First, every item: write the failing test (jsdom under `packages/*/test`), see it fail, then the code. While coding run only the touched files; at the end `npm test`, `scripts/size.mjs`, `scripts/check-contrast.mjs`, then the browser groups once: `-- --only pagination`, `-- --only filters`, `-- --only dates`, `-- --only themes`, `-- --only parts` (item 5, 6, 10), one browser at a time.

## Owner questions (simple French)

**Q1. Le budget de taille.** Les corrections de `dom/filters` (Condition, popup, effacer) dépassent un peu les 10 000 octets restants, et le noyau et les kits paresseux grossissent un peu.
 a) (recommandé) D'abord je compresse le code ; si ça ne suffit pas, vous relevez `dom/filters` de 10 000 à 10 250 et les kits paresseux du juste nécessaire. b) Je refuse toute hausse : on abandonne `data-column` et la ligne personnalisable du filtre set. c) Hausse libre jusqu'à +5 %.

**Q2. Le sélecteur de période.** tzslot n'a pas de mode « en ligne ».
 a) (recommandé) Je fais le formulaire dans DzGrid avec le calendrier d'un mois de tzslot, et je prépare la demande T12 pour la session tzslot ; on retirera notre code quand tzslot l'aura. b) On attend tzslot (rien dans DzGrid). c) Seulement la demande à tzslot, et l'app garde son filtre maison.

**Q3. Les clés inconnues.**
 a) (recommandé) Avertir pour `ui` seulement. b) Avertir aussi pour `filter` et les réglages de la colonne. c) Ne rien avertir, juste le sac `ui.data`.

**Q4. `--dzg-row-height`.**
 a) (recommandé) La documenter comme variable en lecture seule : la hauteur se règle avec `rowHeight`. b) La faire lire depuis le CSS (plus lourd, plus fragile). c) Rien.

**Q5. Style du popup.**
 a) (recommandé) Deux attributs `data-column` et `data-kind` + la doc (CSS global). b) Aussi un réglage `popupClass`. c) Doc seulement.

**Q6. Angular : `slot="header"` sans crochets.**
 a) (recommandé) Doc seulement. b) Aussi un avertissement dans `@dzgrid/angular` si le coût en octets est faible.

## Done (2026-10-27, built, not committed, no reviewer, no mutant round)

Built in the order A–M of the lead's brief. Each item's tests written first and seen failing (below), then the code.

| Item | What | Tests that failed first |
|---|---|---|
| A (1) | Pager arrows: four `aria-hidden` spans « ‹ › » in the DOM (Bidi_Mirrored: turned by the browser right to left), the border chevrons and `--dzg-chevron` gone from `PAGINATION_CSS`, `.dzg-pbtn` `1.25em`. Audit: the tree, detail and group chevrons were border-drawn too: now U+203A in `::before`, turned by `rotate`; the value list's box edge an outline. `dzgrid.unlayered.css` documented for an unlayered reset. | `feedback-glyphs.test.ts` 9 / 15 (spans ×3, border glyphs in PAGINATION / TREE / DETAIL / GROUPS, the toggles' character, the set box). Browser: stand-in reset (`reset=1`), `scripts/browser-glyphs.mjs`: ink and direction of each arrow and toggle, Chrome, Firefox, WebKit. |
| B (3) | « Condition » hidden for one operator (`hide(lo, options < 2)`), live. | `filters-feedback.test.ts` 3 (one op, live 2→1→2, the app's instant `betweenDays`). |
| C (4) | Slot `filterOption`, `filter.optionPart`; parts mounted per drawn row (`mounted`, handed in by the eager part so the set chunk does not split the internal entry out of the page), updated, destroyed with the row; `data-part`; host `aria-hidden`. | `filters-set-option.test.ts` 7 / 9 (2 passed at once: default rows, wrong-slot part). Three of the written expectations were wrong (no filter = every value ticked), corrected. Chrome: axe `label-content-name-mismatch` on the demo's pills (the part's count as text) failed first: the count drawn from `data-n` by CSS, documented. |
| D (5) | `ui.data`; unknown `ui` keys `unknown-ui-key` (warning), told by the DOM layer at setup (moved out of the core: its gzip noise put `core/edit` and `core/state` over; a `ProblemCode` by type only). `data` typed `Readonly<Record<string, unknown>>` (not `Json`: a `Json` import shifted the minifier's names over two budgets). | `columns-ui.test.ts` (core) 3 / 5 before the move; the DOM tests passed once the core warned, then pinned the move. |
| E (6) | `unslotted()`: `ui.header` / `ui.tooltip` without `slots()`, `header.filterBox` without `filters()` (`unknown-part` not repeated). | `feedback-parts.test.ts` E 4 / 4; then « the keys that name no part » failed (a review of the typecheck error found `headerClass` read as a part), fixed. |
| F (7) | `--dzg-row-height` read-only, documented. | `feedback-row-height.test.ts` passed at once (it pins the existing contract). |
| G (8) | Theme: the box's edge an outline (dashed refused, `CanvasText` forced), pair « check box border on a hovered row ». | `theme/test/feedback-check.test.ts` 8 / 8. |
| H (9) | `data-column` / `data-kind` on `.dzg-fpop`. | `filters-feedback.test.ts` 1. |
| I (10) | Doc example (parts.md) and tests: a header search over `c.filter`. No library change. | `feedback-parts.test.ts` I: 2 failed first, both from the test itself (no `api.setFilter`; the example's echo rule missed clear-all): the example corrected. |
| J | fr « Effacer {column} »; the popup's Clear shows the text without the column, its name whole; footer `white-space: nowrap`. | `filters-feedback.test.ts` 3. |
| K (2, Q2) | The period form in the popup: `createDateInput` ×2 + `createDateRange` (one month), shortcuts as buttons, moments with their hour; the kit's layout sheet `dzg-period`; theme: `--tz-cal-outside-opacity: 1` on `.dzg-popup`, the pressed shortcut outlined. | `filters-dates-inline.test.ts` 13 / 13 (the focus test reworded: the first opening waits on the kit by design). Chrome: axe `color-contrast` on the inline calendar's neighbouring days failed first (T11 rule was on the panel only). The older date tests (`filters-dates`, `-gaps`, the walk, `structure`) rewritten on the form. |
| L | tzslot 2.4.0 pinned (npm latest), peers `>=2.4.0 <3`; `@tzslot/dom/lazy` in the kits and the calendar, `ready` awaited by `once`. The fixes of T1, T2, T4, T6–T11 are unreleased on tzslot's main: no workaround removable against 2.4.0; T6 and T8 gone for the period only because it has no panel. `docs/tzslot-requests.md`. | — |
| M | Angular notes (angular-parts.md). | — |

Playground: « Retours d'usage » (`index.html`: `?filters=1&popup=1&dates=1&sets=1&pills=1&paging=client&box=1`, and in Arabic, dark).

Gate (once, caffeinate -i, vitest 2 workers, Node 24): vitest 470 files / 7 117 tests, test:perm 5 / 10, typecheck, build, check:size 0 over (core 28 999, dom 22 321, filters 9 990 — no raise needed —, theme 2 562, pagination 3 133, tree 3 821, K.8 84 077; raised by the strict need, Q1: date adapters 2 745 (2 744), set chunk 4 205 (4 204), calendar 1 520 (1 519)), check:contrast 1 092 / 0. Browser: Chrome --only filters 32, dates 56, pagination 45, tree 78 (and groups 20, detail 37, motion 50); Firefox and WebKit --only dates 12, pagination 24, tree 6, all green.
