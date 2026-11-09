# DzGrid Accessibility Conformance Report — WCAG 2.2 edition (draft)

Based on the layout of the VPAT® 2.5 « WCAG » edition, written in our own words. **Draft**: not yet reviewed by the
architect against the sheets, and **no screen-reader listening has been done yet** (see « Notes »). French summary for
the owner: `docs/a11y/acr-resume-fr.md`.

| | |
|---|---|
| Name of product / version | DzGrid — `@dzgrid/dom`, `@dzgrid/theme`, `@dzgrid/angular`; 1.8.0 in preparation (main branch, commit `98bc9f8`, after Phase 11 lot L4a). Last published: 1.7.0. `@dzgrid/element` (`<dz-grid>`, added in 1.8.0) draws the same `@dzgrid/dom` grid and is not evaluated apart in this draft (its demo page: axe 0 in Chrome). |
| Report date | 2026-11-08 |
| Product description | A data grid for web applications: virtualised rows, sorting, filters, editing, cell blocks and clipboard, tree, row grouping, master / detail, pivot, column tools, a dock of side panels. `@dzgrid/dom` draws it and handles keys, focus and announcements; `@dzgrid/theme` gives its colours and layout rules; `@dzgrid/angular` wraps the same DOM grid for Angular. Right to left (Arabic) is part of the design. |
| Contact | The project's repository owner. |
| Evaluation methods used | Automated checks in real browser engines (below), unit and behaviour tests in jsdom, a contrast script over every colour pair the theme draws, behaviour sheets written before the code (`docs/behaviors/`). **No assistive-technology testing yet.** |

## Applicable standards

| Standard | Included in report |
|---|---|
| WCAG 2.2, Level A | Yes |
| WCAG 2.2, Level AA | Yes |
| WCAG 2.2, Level AAA | No (not evaluated) |

## Terms

- **Supports**: the functionality of the product has at least one method that meets the criterion without known
  defects, or meets it with equivalent facilitation.
- **Partially Supports**: some functionality of the product does not meet the criterion — **or, in this draft, the
  criterion's result is what a screen reader conveys and it has not been listened to yet** (see the rule below).
- **Does Not Support**: the majority of product functionality does not meet the criterion.
- **Not Applicable**: the criterion is not relevant to the product (what the library draws), or it belongs wholly to
  the application that hosts the grid.

## Notes

**The rule for criteria that rest on a screen reader.** A criterion whose result is what a screen reader actually
says — relationships and states as heard (1.3.1), reading order through a virtualised grid (1.3.2), name / role /
value as announced (4.1.2), status messages heard (4.1.3) — is marked **Partially Supports** in this draft, even when
every automated check passes. It does **not** mean a known failure: it means « automated checks pass; not yet verified
with a screen reader (scheduled: the owner's « parcours essentiel », VoiceOver and NVDA) ». After that listening
(Phase 11 lot L4c, route in `docs/a11y/parcours-essentiel.md`, results in
`spikes/s4-a11y/results/manual-<reader>-<lang>.md`), each such line moves to Supports or keeps « Partially Supports »
with the gap found named. Nothing in this report is « validated » before then.

**Scope: what the library controls, what the application must do.**
- The library controls: the grid's structure and roles (`grid` / `treegrid`, rows, header cells, row and column
  indexes and counts), keyboard behaviour and focus, its own controls (header buttons, menus, popups, the filter
  row, editors, the dock, the pivot bar, the pager, the columns chooser), its own texts and announcements (locale
  packs `@dzgrid/dom/locales/*`, French, English, Arabic), right to left, and the theme's colours, focus rings,
  forced-colours and reduced-motion rules.
- The application must provide: an accessible **name for each grid** (`grid.label` is a generic default,
  « Grille de données »), meaningful **column header texts**, the page around the grid (title, language, landmarks,
  skip links), the **content of its own parts and templates** (custom cells, tooltips, detail panels, Angular
  templates, app panels in the dock), translated texts for any locale it adds, the reasons it gives for a refused
  save, and `lang` on the grid's host when the grid's language differs from the page's.
- **Colours an application overrides** (`--tz-*`, `--dzg-*`, a showcase theme of its own, a CSS framework bridge) are
  the application's to keep at 4.5:1 / 3:1; `npm run check:contrast -- --palette <file>` checks a palette before use.
- Data shown in cells (text, numbers, links, images an application puts there) is the application's content.

**Known limits stated plainly.**
- A virtualised grid cannot put every row in the page. The focused row is always kept, at its true position, and
  `aria-rowindex` / `aria-rowcount` give true positions; but a screen reader's own reading mode (browse / virtual
  cursor) reads only the rows mounted: reading on from the focused row jumps to the rows in view. Pagination is the
  advice when an audience needs to read every row that way (`docs/a11y-protocol.md` §2 step 6d, §6).
- In the Phase 0 prototype (spike S4), VoiceOver on macOS did not say a tree row's « n of m » position
  (`aria-posinset`); the real grid has not been listened to yet.
- Forced colours were checked in Chrome only (no other engine emulates them); Firefox's and Safari's own
  high-contrast settings were not tested.
- The automated browser run scans each page at load; open popups, menus, editors and dialogs are covered by jsdom
  tests and the contrast script, not by axe in a browser. The Angular fixture page was not in the browser run; the
  Angular wrapper renders the same DOM grid (its own tests: `packages/angular/test/`).

## Test environments (automated, 2026-11-08)

- `node scripts/browser-a11y.mjs` (`npm run test:a11y`), Playwright, headless, on macOS: **Chrome 157.0.8103.38**
  with **axe-core 4.14.0**; **Firefox 157.0**; **WebKit 27.2** (Playwright's build, not Safari itself).
- Pages: flat grid (filter row, filter popup, a pinned column, check boxes), tree (sticky parents, pinned columns),
  row grouping (band, footers), pivot with its bar, dock (columns panel), filters panel, row moves, list loaded in
  blocks. Chrome: French and Arabic × light and dark (32 runs); Firefox and WebKit: French light and Arabic dark
  (16 runs each).
- Checks: axe (A and AA rules); 1.4.10 at 320 × 256 CSS px; 1.4.12 with the four spacings injected; 2.4.11 by key
  and Tab walks at 1 200 and 320 px; 2.5.8 by measuring every control; 4.1.3 live regions; forced colours (Chrome);
  `prefers-reduced-motion: reduce`. Pinned rows: `scripts/browser-pinned-rows.mjs`. Results:
  `docs/a11y/acr-results.md`; decisions and the six fixes made during the run: `docs/phase-11-steps/decisions.md`
  « L4a ».
- `npm run check:contrast` (`scripts/check-contrast.mjs`): 249 text and part pairs
  (`packages/theme/contrast-pairs.json`), each palette and showcase theme, light and dark; run in the step gate.
- Unit and behaviour tests: vitest in jsdom (`packages/dom/test/`, `packages/theme/test/`, `packages/angular/test/`)
  and language-independent cases (`conformance/cases/`); the step gate was green at L4a (8 974 tests).
- **Not yet**: NVDA, JAWS, VoiceOver, TalkBack; speech input (Voice Control, Dragon); real Safari, Edge, mobile
  browsers; Windows high-contrast themes on a real machine.

## Table 1: Success Criteria, Level A

| Criteria | Conformance Level | Remarks and Explanations |
|---|---|---|
| 1.1.1 Non-text Content | Supports | Icons (sort marks, chevrons, ⋮, grips, ×) are hidden from assistive technology or carry a text name from the locale pack; the fill handle is `aria-hidden` and has keyboard and click paths (`fill.md`). axe 0 violations, 32 / 32 pages (`acr-results.md`). Names checked in the DOM, not yet heard. Images an application puts in cells are its content. |
| 1.2.1 Audio-only and Video-only (Prerecorded) | Not Applicable | The grid shows no audio or video. |
| 1.2.2 Captions (Prerecorded) | Not Applicable | No media. |
| 1.2.3 Audio Description or Media Alternative (Prerecorded) | Not Applicable | No media. |
| 1.3.1 Info and Relationships | Partially Supports | Automated checks pass; not yet verified with a screen reader (scheduled: the owner's « parcours essentiel », VoiceOver and NVDA). Built: `grid` / `treegrid` roles, header cells, `aria-rowindex` / `aria-colindex` equal to screen order across pinned segments (`pinned-columns.md`), `aria-rowcount` with true totals (-1 when unknown, `infinite-scroll.md`), tree `aria-level` / `aria-posinset` / `aria-setsize` / `aria-expanded` (`tree-view.md`), spans and grouped headers (`spans.md`, `header-groups.md`), sticky parent copies hidden (`tree-sticky.md`). axe 32 / 32; tests `grid.test.ts`, `tree.test.ts`, `pivot-headers.test.ts`, `range-a11y.test.ts`. |
| 1.3.2 Meaningful Sequence | Partially Supports | Automated checks pass; not yet verified with a screen reader (scheduled: the owner's « parcours essentiel », VoiceOver and NVDA). DOM order equals screen order in both directions, final before any animation (`motion.md`); the focused row is kept at its true position (`reading-keyboard.md`). Known limit: a reader's browse mode reads only mounted rows (Notes). |
| 1.3.3 Sensory Characteristics | Supports | Instructions the grid gives name keys and controls, not shape or place (e.g. « Entrée pour trier, Maj+Entrée pour ajouter au tri », the fill mode's « flèches pour étendre »). Locale packs, `messages.test.ts`. |
| 1.4.1 Use of Color | Supports | Every state keeps a mark that is not colour alone: the focus ring, a selected row's bar at its start edge, a ticked box, a refused value's outline and text, a live change's bar (`theming.md`, `motion.md`); in forced colours the selection is drawn in `Highlight` (L4a fix 3, `packages/theme/test/a11y-l4a.test.ts`; screenshots `packages/dom/test/browser/results/a11y/forced-*.png`). |
| 1.4.2 Audio Control | Not Applicable | No audio. |
| 2.1.1 Keyboard | Supports | Every function has a keyboard path: moving and paging (`reading-keyboard.md`, `keyboard.test.ts`, `conformance/cases/keyboard-intent/`), sort, filter popups and value lists (`filters-keys.test.ts`, `filters-set-keys.test.ts`), editing (`editors-keys.test.ts`), blocks, copy, paste, fill (`range-keys.test.ts`, `range-fill-keys.test.ts`), tree and grouping (`tree-keys.test.ts`, `grouping.test.ts`), column menu, move and resize (`column-menu-keys.test.ts`, `columns-move-keys.test.ts`, `columns-resize-mode.test.ts`), chooser (`columns-chooser-keys.test.ts`), row moves (`row-drag-keys.test.ts`), dock (`dock.test.ts`), pivot bar (`pivot-bar.test.ts`). |
| 2.1.2 No Keyboard Trap | Supports | The grid is one Tab stop; Tab leaves it, also from inside a detail panel (`master-detail.md`). Modal dialogs (columns chooser) keep Tab inside on purpose and close with Escape, focus going back to where they opened (`columns-chooser.md`, `popup-focusable.test.ts`). |
| 2.1.4 Character Key Shortcuts | Supports | Single-character keys (`*` in a tree, type-to-edit, first-letter jumps in menus and lists) act only while focus is in the grid or that control. |
| 2.2.1 Timing Adjustable | Not Applicable | The grid sets no time limit on the user. |
| 2.2.2 Pause, Stop, Hide | Supports | Motion is opt-in (`@dzgrid/dom/motion-gsap`), each effect under 1 s by default; `settings.motion: false` stops all; reduced motion is followed live (`motion.md`; L4a: nothing over 50 ms under `prefers-reduced-motion`, 32 / 32, 16 / 16, 16 / 16). Live updates are the application's data; an application that streams values gives its own pause. A flash's `hold` / `fade` an application lengthens is its choice. |
| 2.3.1 Three Flashes or Below Threshold | Supports | A value's mark at most once per cell per 500 ms; the refusal blink once per Enter (`motion.md`, `edit-validation.md`). |
| 2.4.1 Bypass Blocks | Supports | The grid, however many rows, is one Tab stop; its panels are named regions (dock, status bar, filters panel: `dock.md`, `status-bar.md`, `filters-panel.md`). Skip links and page landmarks are the application's. |
| 2.4.2 Page Titled | Not Applicable | The page is the application's. |
| 2.4.3 Focus Order | Supports | Tab order follows the screen in both directions (dock areas, bars, pager); popups, menus and dialogs return focus to where they opened; a removed or hidden row, column or panel moves focus to its neighbour, never to the page's top (`reading-keyboard.md` « Focus survives », `move-focus.test.ts`, `edit-gone.test.ts`, `column-menu-open.test.ts`; L4a Tab walks 32 / 32, 16 / 16, 16 / 16). |
| 2.4.4 Link Purpose (In Context) | Not Applicable | The grid draws no links; links in cells are the application's content. |
| 2.5.1 Pointer Gestures | Supports | No multipoint or path gesture is needed; every drag has a single-pointer or keyboard path (see 2.5.7). |
| 2.5.2 Pointer Cancellation | Supports | Drags (column move, resize, row move, fill, dock edge) act on release and Escape cancels (`column-move.md`, `column-resize.md`, `row-move.md`, `fill.md`, `dock.md`). A cell block starts at pointer down, which only selects and is undone by the next click (`range-selection.md`). |
| 2.5.3 Label in Name | Supports | Accessible names start with the visible text (headers, buttons, tabs, chips); a header or dock title shortened with « … » keeps the full text as its name (L4a, `acr-results.md` 1.4.12). Not tested with speech input. |
| 2.5.4 Motion Actuation | Not Applicable | Nothing is triggered by device motion. |
| 3.1.1 Language of Page | Not Applicable | The page's `lang` is the application's. |
| 3.2.1 On Focus | Supports | Focus never changes the context: a cell, header or field focused only shows its tooltip and, in a filter box, prepares the filter in idle time (`tooltips.md`, `filter-ui.md` « Preparing the text filter »). On a narrow screen, focus entering the rows collapses an open dock area to its strip, a told change of layout, not of context (`dock.md` 14). |
| 3.2.2 On Input | Supports | Typing in a filter filters after a pause and says the count (content, not context); an edit is kept on Enter or on leaving; nothing navigates or submits a page. |
| 3.2.6 Consistent Help | Not Applicable | The grid offers no help mechanism; the application's. |
| 3.3.1 Error Identification | Supports | A refused value keeps its field open, marked `aria-invalid`, with the reason in text as its description and in a bubble; a refused save says the field and the reason and restores the value (`edit-validation.md`, `edit-save.md`; `editors-validation.test.ts`, `edit-server.test.ts`). A bad filter number is marked and named (« Montant : nombre non valide », `filters-floating.test.ts`, `filters-popup.test.ts`). How it is heard: 4.1.3. |
| 3.3.2 Labels or Instructions | Supports | Every field the grid draws has a label from the locale pack: filter boxes (« Filtrer Montant »), conditions, value-list search, columns-chooser search (visible label), editors (named by column and row header) (`filter-ui.md`, `editors.md`). axe 32 / 32 at load. |
| 3.3.7 Redundant Entry | Not Applicable | The grid has no multi-step process; filters, sort and layout are kept (`grid-state.md`). |
| 4.1.1 Parsing | Supports | Obsolete in WCAG 2.2 (always satisfied, per W3C); listed for older procurement forms. Not counted below. |
| 4.1.2 Name, Role, Value | Partially Supports | Automated checks pass; not yet verified with a screen reader (scheduled: the owner's « parcours essentiel », VoiceOver and NVDA). Built: roles from WAI-ARIA patterns (grid, treegrid, menu, listbox, dialog, tablist, separator, checkbox, switch), states (`aria-selected`, `aria-expanded`, `aria-sort`, `aria-pressed`, `aria-invalid`, `aria-disabled`, `aria-readonly`), values (dock separator width), names from the locale packs and the application's headers. axe 32 / 32 at load; jsdom tests per feature (`column-menu-texts.test.ts`, `columns-chooser-texts.test.ts`, `dock.test.ts`, `pivot-bar.test.ts`, `range-a11y.test.ts`). |

## Table 2: Success Criteria, Level AA

| Criteria | Conformance Level | Remarks and Explanations |
|---|---|---|
| 1.2.4 Captions (Live) | Not Applicable | No media. |
| 1.2.5 Audio Description (Prerecorded) | Not Applicable | No media. |
| 1.3.4 Orientation | Supports | No orientation is locked; the grid fills its host in either. |
| 1.3.5 Identify Input Purpose | Not Applicable | The grid's fields filter and edit table data, not information about the user. An application column that collects it is the application's to mark. |
| 1.4.3 Contrast (Minimum) | Supports | Every text the theme draws at ≥ 4.5:1, in each palette and showcase theme, light and dark (`check:contrast`, 249 pairs, `packages/theme/contrast-pairs.json`; `scripts/test/contrast.test.ts`); more contrast on request (`prefers-contrast: more`, `theming.md`). Colours an application overrides: its own (Notes). |
| 1.4.4 Resize Text | Supports | Page zoom to 400 % works (1.4.10). Row heights grow with the reader's default text size, never with the page's own root size (`virtual-scroll.md` « Row height », `density.md`); wrapped columns grow (`auto-height.md`). |
| 1.4.5 Images of Text | Supports | The grid draws no images of text. |
| 1.4.10 Reflow | Supports | At 320 × 256 CSS px no sideways page scroll and every control outside a scroller in view (32 / 32, 16 / 16, 16 / 16). The rows scroll in two directions inside the grid: a data table is the criterion's own exception. Pinned columns too wide for the view are released while it is narrow (`pinned-columns.md`, owner A; `packages/core/test/pinned-release.test.ts`). |
| 1.4.11 Non-text Contrast | Supports | Focus rings, borders of fields and buttons, check boxes, grips and the selection bar at ≥ 3:1 (`check:contrast`). The cell rules are decorative (the grid's structure is also given by alignment and roles). |
| 1.4.12 Text Spacing | Supports | The four spacings injected: no text newly cut (32 / 32, 16 / 16, 16 / 16). Narrow headers, dock tabs and titles may end in « … »; the full text is the name and the user can widen the column or area. |
| 1.4.13 Content on Hover or Focus | Supports | Tooltips: shown on hover (after 0.5 s) and on focus, the pointer can move onto them, Escape closes them, they stay until hover or focus leaves; the cell gets `aria-describedby` (`tooltips.md`, `tooltip.test.ts`, `slots-tooltip.test.ts`). The header ⋮ button shows on hover, always shown on touch, reachable by keys (`column-menu.md`). |
| 2.4.5 Multiple Ways | Not Applicable | A component, not a set of pages. |
| 2.4.6 Headings and Labels | Supports | The grid's own controls and regions have descriptive names in each locale pack; column headers are the application's texts. |
| 2.4.7 Focus Visible | Supports | A focus ring on cells, headers and every control, ≥ 3:1 on its surface (`check:contrast` « focus ring … » pairs); the focused cell's outline kept in forced colours (Chrome, 32 / 32). |
| 2.4.11 Focus Not Obscured (Minimum) | Supports | Key and Tab walks at 1 200 and 320 px: the focused element never entirely hidden by pinned rows or columns, the dock, sticky parents or headers (32 / 32, 16 / 16, 16 / 16). Fixed in L4a: the window follows the focus at 400 % (`reading-keyboard.md`), a dock area collapses when focus enters the rows on a narrow screen (`dock.md` 14), pinned columns released (`pinned-columns.md`); `packages/dom/test/a11y-l4a.test.ts`, `scripts/browser-pinned-rows.mjs`. |
| 2.5.7 Dragging Movements | Supports | Every drag has a path without dragging: column move by keys and the ⋮ menu (`column-move.md`), resize by a key mode and − / + / ✓ buttons (`column-resize.md`), row move by keys and menu (`row-move.md`), fill by keys or two clicks (`fill.md`), grouping by « Regrouper par cette colonne » (`group-drop-zone.md`), pivot bar by « + » menus and ↑ / ↓ (`pivot.md`), chooser order by Alt+↓ and ▼ (`columns-chooser.md`), dock edge by arrow keys and placement by its menu (`dock.md`), blocks by Shift+click and Shift+arrows (`range-selection.md`). |
| 2.5.8 Target Size (Minimum) | Supports | Every control and grip measured ≥ 24 × 24 CSS px or spaced (32 / 32, 16 / 16, 16 / 16); a box in its cell and the pivot bar's × pass by spacing; rows never under 24 px (`virtual-scroll.md`). |
| 3.1.2 Language of Parts | Supports | The grid's texts are all in the one language the application gives (its locale pack); print copies the page's `lang` (`print.md`). The grid adds no `lang` of its own: when its language differs from the page's, the application sets `lang` on the host (Notes). |
| 3.2.3 Consistent Navigation | Not Applicable | A component, not a set of pages. |
| 3.2.4 Consistent Identification | Supports | A function has one name everywhere in the grid (menus, panels, bars), from one locale pack. |
| 3.3.3 Error Suggestion | Supports | A refusal says what is expected (« nombre attendu », « date attendue (JJ/MM/AAAA) », « valeur obligatoire »); a refused save gives the application's reason; the refused text stays in the field to correct (`edit-validation.md`, `editors-validation.test.ts`). |
| 3.3.4 Error Prevention (Legal, Financial, Data) | Not Applicable | The grid commits nothing itself; what a save means is the application's, which must add confirmation where it commits. The grid helps: edits, pastes and fills undo with Ctrl+Z (`edit-undo.md`), a refused save restores the value. |
| 3.3.8 Accessible Authentication (Minimum) | Not Applicable | No authentication. |
| 4.1.3 Status Messages | Partially Supports | Automated checks pass; not yet verified with a screen reader (scheduled: the owner's « parcours essentiel », VoiceOver and NVDA). Built: polite and assertive live regions present from the first paint, never added with their text (L4a 32 / 32, 16 / 16, 16 / 16; the columns panel's empty status kept in the tree, L4a fix 4); sort, filter, expand, selection, copy / paste, save, refusal, move and pivot sentences said once per gesture (locale packs; `messages.test.ts`, `edit-texts.test.ts`, `range-texts.test.ts`, `columns-texts.test.ts`). |

## Table 3: Success Criteria, Level AAA

Not evaluated.

## Summary (55 criteria of WCAG 2.2 A and AA; 4.1.1 not counted)

| Level | A (31) | AA (24) | Total |
|---|---|---|---|
| Supports | 17 | 16 | **33** |
| Partially Supports | 3 (1.3.1, 1.3.2, 4.1.2) | 1 (4.1.3) | **4** |
| Does Not Support | 0 | 0 | **0** |
| Not Applicable | 11 | 7 | **18** |

All four « Partially Supports » are lines waiting for the listening (rule in « Notes »); 1.3.2 also carries the
virtualised reading-mode limit. Next: the architect's review of this draft against the sheets (lot L4b), then the
listening (lot L4c).

*VPAT® is a registered service mark of the Information Technology Industry Council (ITI). This report follows its
layout; it is not an ITI document.*
