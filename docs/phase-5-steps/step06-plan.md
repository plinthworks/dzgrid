# Phase 5, step 6 — `@dzgrid/dom/editors` part 2 (dates, yes/no, list, the app's editors; the input-method risk): blueprint (architect, 2026-10-24)

Sources: `phase-5-plan.md` step 6, D4, D5, D15; `decisions.md` Q4, Q5, Q9, O1, **O8** (Space toggles), **Q14** (dates:
typing + a tzslot calendar on demand), **Q15** (a simple list with type-ahead), S3-O3 (`edit: { required, min, max,
pattern, options }`), S4-O1…O4, S5-O1…O5 (they win); sheets `editors.md` 6–19, `editing.md`, `edit-validation.md`,
`filter-date-picker.md`, `badge-boolean.md`, `parts.md`; `step05-plan.md` (Done, Review: R5 = the input-method risk
handed to this step). Code read at the step-5 head: `editors/{index,host,bubble}.ts`, `filters/dates.ts`,
`filters/lazy.ts`, `filters/dates/{shared,date,moment}.ts`, `popup.ts`, `part.ts`, `core/src/edit/input.ts`, the
codecs. tzslot (`~/Dev/tzslot`, the owner's) read for its API only: `createCalendar`, `createTimeSelect`. Clean room:
WAI-ARIA 1.2, APG « select-only combobox » and « date picker dialog », WCAG 2.2, UI Events, the EditContext draft.
Plan only: no code, test, budget or config change.

## Findings (step-5 head)
- `/editors` **3 902 / 4 350** (448 left); `/dom/edit` 3 556 / 3 650; Q16 gave the editing DOM 8 000 in all (S4-O1).
  `edit.css` 1 619 / 1 700; texts `-editors` 277 / 306 / 375 (450 / 500 / 620); dom base 21 414 / 21 700.
- `editors/index.ts`: one `kind()` (`text` | `number`), one `<input>` per open field, `keys` hook (F2, Enter after the
  part, Delete; the field's Enter/Tab/Escape through `end()` when `e.target === s.f`), a late viewport listener
  (printable keys, composition), `dblclick`, double tap, the wait-for-paint buffer (R1), the bubble. Blur: one task
  later, `activeElement === f` keeps the field open. Everything else (`day`, `instant`, `boolean`, enum, a name) opens
  nothing yet; an unknown `edit.editor` is `unknown-part`, once per column and name.
- **Loader**: `filters/lazy.ts` exports `once()` (each module imported once, a failure forgotten so Retry imports
  again, a module check) and `notice()` (`role=status` + `aria-busy` while loading, `role=alert` + Retry when failed).
  `filters/dates/shared.ts` (lazy side): `base()` (locale tag, today, tzslot words, bounds), `styles()` (tzslot's
  sheets into the grid's root node with the nonce, `data-tzslot` ids), `named()` (label in name, T1/T9), `lost()`
  (Samoa's day, T7), `muter()`. `/editors` must not import `/filters` (layering guard, phase plan §4): **reuse = move,
  not copy** (below).
- `PopupHost` (`@dzgrid/dom/popup`, 1 650): top layer (`popover="manual"`), below the anchor or above when no room,
  inline start mirrored (`fixedInlineStart`), modal Tab trap, Escape closes and focuses the anchor, pointer down
  outside closes; `.dzg-popup` already carries the theme's tzslot rules (surface, other-month days muted, forced
  colours) — a calendar inside one is themed for free.
- `parseInput`: typed text through `codec.parse`; a typed instant inside a clock change is refused
  (`wall-time-skipped` / `-ambiguous`); **`{ value }` inputs skip the text path** (a picked or toggled value). The day
  codec reads numbers in `dayFieldOrder(ctx)` only (no month names, no 2-digit years); the instant codec reads ISO or
  « day time » (24 h). `checkValue`: `options` (the current value always passes). `fold` (case, accents, tashkil,
  one alef, ى→ي, digits) is exported by `@dzgrid/core`.
- Parts: `definePart(slot, part)`, looked up by name among one slot's parts (`slots/resolve.ts`), `<slot>.<type>`
  replaces a type's default (`cell.boolean`). `SlotContext` has no `editor` slot yet; `NEEDS` maps slot → feature.
- The router runs features' `keys` before `intentFor`: the editors' hook can take Space on a yes/no cell before
  `toggleSelect` (O8) without touching the base.

## Split
| Where | What | Bytes gz |
|---|---|---|
| `@dzgrid/dom/editors` | kinds dispatch; day and instant fields (opening text, calendar button, Alt+Down, popup, loader use, Retry, prefetch, the written-value rule); yes/no toggle; list combobox + listbox popup + type-ahead; the `editor` part host | **+2 100–2 400** → ~6 000–6 300 |
| `editors: calendar (lazy)` new | `editors/dates/calendar.ts`: tzslot `createCalendar` (day) + `createTimeSelect` (instant), the shared tzslot helpers | **1 100–1 400** (DzGrid's code; tzslot `without`) |
| `@dzgrid/dom/internal` | `once`, `notice` moved in from `filters/lazy.ts` | +~300 (and `/filters` −~300) |
| dom base | `editor` slot in `SlotContext` (types), `NEEDS.editor = 'editors'` | +~10 |
| `locales/*-editors` | `edit.calendar`, `edit.calendarLoading`, `edit.calendarFailed`, `edit.optionNotInList` (Retry: the base's `grid.retry`) | +~130 / 150 / 180 |
| `edit.css` | date box and button, combobox, listbox and options, calendar dialog sizing, forced colours | +~300–400 |

**The loader, reused (not copied)**: `filters/lazy.ts` → `internal/lazy.ts`, exported by `@dzgrid/dom/internal`
(both entries import it by name, as step 17 did for `settled` and `composing`: one copy on a page). The lazy helpers
`filters/dates/shared.ts` → `src/dates/shared.ts` (a neutral, lazy-only folder: imported only by
`filters/dates/*` and `editors/dates/*`, one file in `dist/`). The structure guard « tzslot only under
`filters/dates/` » becomes « only under `dates/`, `filters/dates/`, `editors/dates/`, each reached by `import()` ».
`DateAdapter` stays the filters' (it is a filter-form contract: `op`, `changed`, `panel`); the editors' chunk has its
own small contract (below) and shares `base`, `styles`, `named`, `lost`.

## API
```ts
// ColumnDef.edit (core types; S3-O3 already has options, maxLength, editor)
edit?: { required?, min?, max?, pattern?, maxLength?,
         options?: readonly EnumOption[] | ((row, context) => readonly EnumOption[]),
         editor?: 'text' | 'number' | 'day' | 'instant' | 'boolean' | 'list' | string /* a part of slot 'editor' */ };

// @dzgrid/dom/editors
export interface EditorsOptions {
  enterMoves?: 'down' | 'stay'; tab?: 'cell' | 'grid';             // step 5
  /** The calendar button and Alt+Down on day and instant fields (default true); false: typing only, nothing loaded. */
  calendar?: boolean;
  /** Where the calendar's chunk comes from (a host serving its own chunks), as filters({ loadDates }). */
  loadCalendar?: () => Promise<CalendarKit>;
  /** tzslot's words by language, over its own EN / FR / AR (as filters({ dateMessages })). */
  dateMessages?: Readonly<Record<string, object>>;
}
export interface CalendarKit { open(a: CalendarAdapter): CalendarView }   // the lazy chunk's one export
// SlotContext['editor'] (base types) — the app's editor, registered parts: { colour: definePart('editor', p) }
editor: PartBase & {
  readonly value: unknown; readonly text: string; readonly row: Readonly<unknown>; readonly key: RowKey;
  readonly column: ResolvedColumn<unknown>;
  readonly start: 'f2' | 'enter' | 'key' | 'dblclick' | 'tap' | 'tab'; readonly char?: string;
  /** Through the column's checks and the save; false: refused (the grid shows the bubble and says why; stays open). */
  keep(input: CellInput): boolean;
  cancel(): void;
  /** The part's own refusal: `validation.<code>` (or the app's `app.*`), the bubble, the blink, one sentence. */
  refuse(code: string): void;
  /** A node of the part outside the cell (its own popup) counts as inside: focus and presses there are no blur. */
  own(el: HTMLElement): () => void;
};
// PartHandle, for the editor slot only: read?(): CellInput | undefined — what Enter, Tab and a blur keep.
```
**Choice of editor** (`editors.md` 1, in this order): `edit.editor` a built-in name → it; another name → the
`editor`-slot part of that name (none: `unknown-part`, no field, as now); else a part named `editor.<type>` replaces
the built-in of that type; else `edit.options` given, or type `enum` → **list**; else by type: `text`, `number`,
`day`, `instant`, `boolean`. `edit.editor: 'list'` on a column without options: `invalid-column` at
`columns.<id>.edit.editor`, a text field. More than **500 options**: `invalid-column` at `columns.<id>.edit.options`
(detail `500`), a **text field** read by the codec (an enum's labels and aliases still read; the core's `options`
check still refuses others) — a working fallback, not a dead cell.

## Behaviour

**Day and instant** (`editors.md` 6–9)
1. Field: the step-5 `<input>` in a box `<span class="dzg-datebox" data-dzg-owner="editor">` with the button;
   `dir="ltr"`, `spellcheck=false`, no `inputmode` (iOS numeric pads lack `/`), `aria-haspopup="dialog"`,
   `aria-expanded`, `aria-keyshortcuts="Alt+ArrowDown"` (when `calendar` is on), `placeholder` = today written
   as the field writes days (an example, never the label).
2. **Opening text** (eager, no tzslot, no Temporal): a day as numbers in `dayFieldOrder(ctx)`, two-digit day and
   month, four-digit year, the locale's separator (Intl `formatToParts`), the grid's numerals; an instant = that day
   in the **grid's zone** + ` HH:mm` (24 h; `:ss` only when not 0). Each locale's text must read back through the
   codec (test per locale). `validation.day {pattern}` = the same example (0 new texts).
3. **The written-value rule** (DST): the field remembers the value the grid wrote into it (at opening, or by a pick)
   with its text; Enter/Tab/blur with **that text unchanged** keeps `{ value }`, not `{ text }`. So an untouched
   instant in a repeated hour (02:30 the second time, 25 Oct Paris) is not refused, and a reading picked in the
   calendar (summer / winter) is kept as picked. Any typed change goes through the codec (gap and repeated hour
   refused, as step 5). ~40 B.
4. **Calendar**: the button (24 × 24 px at the inline end — left in Arabic —, `aria-label` `edit.calendar`,
   `tabindex=-1`: Tab keeps its step-5 meaning; the keyboard way is Alt+Down) or **Alt+ArrowDown** in the field
   opens a **modal `PopupHost` popup** (`role=dialog`, label `edit.calendar`, placement `block-end` from the cell:
   below, above when no room; never over the field, WCAG 2.4.11). Content: the chunk's view. Day: `createCalendar`
   (value = the field's text if it reads, else the cell's day, else today; `today` = `dayAt(clock, zone)`; bounds
   0001–9999; `lost(zone)` greys a day that never was). Instant: the calendar **and** tzslot's hour/minute menus
   (`createTimeSelect` with `date`, `timeZone`, `readingStyle: 'named'`: the skipped hour absent, the repeated hour
   twice by offset; bounds from 1900), owner S6-O5.
5. **Pick**: day — a day picked writes the field and closes the dialog; instant — a day picked moves the focus to
   the hour menu, each menu change writes the field (step 3's written value carries the offset); Enter on a menu or
   Escape closes. The field stays open in every case (Enter in it keeps).
6. **Focus**: into the dialog at open (the calendar's focusable day — the selected or today; tzslot's roving focus
   inside); Tab trapped (PopupHost modal). Close (pick, Escape, Enter on a menu) → focus back to the anchor = **the
   field**, caret at end. **Escape in the dialog closes the dialog only** (PopupHost stops it; the field's Escape
   never sees it); a second Escape gives the edit up (`editing.md`). A press outside closes the dialog; the field's
   blur rule then decides (Q5: kept).
7. **Blur rule widened** (all editors): « inside » = the editor's root, its open popup, and any node a part `own()`s.
   Focus moving into the calendar or the list is no blur.
8. **Loading** (the filters' rules): `once()` imports `editors/dates/calendar.js` at the first open (never at setup);
   prefetch on `pointerenter` / `pointerdown` of the button **only** (owner S6-O4: typing never downloads tzslot). While loading: `notice()` in the dialog (`role=status`
   `edit.calendarLoading`, `aria-busy` on the dialog), focus on the dialog box; failed: `role=alert`
   `edit.calendarFailed` + Retry (`grid.retry`), `g.report(err)`; Retry imports again (Chrome 156 refetches), focus
   stays in the dialog; a chunk without `open`, or whose `open` throws: a failure, half-built nodes removed. Closed
   before it arrives: nothing mounted. The field works throughout (typing never waits).
9. **Without tzslot** (optional peer): the import fails like an offline chunk — the alert and Retry; the app turns
   the button off with `editors({ calendar: false })`. (Changes `editors.md` 9: a missing package cannot be told
   from a failed network without importing; no `missing-feature` problem.)
10. Sheets: tzslot's into the grid's root node with the nonce (`styles()`); words `base()` + `dateMessages`;
    locale tag `intlTag(ctx)` (Gregorian, the grid's digits); `named()` on the dialog.

**Yes/no** (`editors.md` 10–11, O8) — no field, no host
11. On an editable boolean cell (owner `cell`, no modifier): **Space** toggles (taken in the keys hook before the
    router's `toggleSelect`); **Enter** toggles unless the part's `focus()` returns true; **double click / double
    tap** toggle once; Delete/Backspace clear to `null` (step 5). Order `null → true → false → true`. One
    `commit({ value })` each, origin `edit`, `editingStarted`/`Stopped` not emitted (no editor opened); a refusal
    (`validate`, `required`): the blink and `edit.refused`. The new text is said politely (`g.announce` of the
    cell's text as the grid shows it): a focused cell's text change is not reliably re-read. Space elsewhere,
    Shift+Space, a read-only yes/no cell: selection as today. `edit.editor: 'text'` on a boolean column still gives
    a text field (the codec reads oui/non/نعم).

**List** (`editors.md` 12–17; owner S6-O2 ★ APG select-only combobox)
12. Root (in the cell, via the host): `<div class="dzg-field dzg-combo" role="combobox" tabindex="-1"
    aria-haspopup="listbox" aria-expanded aria-controls aria-activedescendant aria-label=editors.fieldName>` showing
    the active label (`dir="auto"`). Focus stays on it the whole time.
13. The list: a non-modal `PopupHost` popup anchored on the cell, `<div role="listbox" id>` of `<div role="option"
    id aria-selected>` (the chosen one `true`), labels `dir="auto"`, at most ~8 rows high then scrolled; the active
    option `scrollIntoView({ block: 'nearest' })` inside the list only; options ≥ 24 px high (2.5.8), 44 px under
    `pointer: coarse`. Placed again at each paint and scroll (as the bubble, R2); hidden while the cell is out of the
    viewport's box.
14. Options: `edit.options` (list, or `fn(row, settings.context)` called at open; a throw → `invalid`, no list), else
    the enum's `enumOptions`; label = `label ?? codec.format(value)`. A current value not among them: an extra first
    option `edit.optionNotInList {label}`, marked, keepable (the core lets the current value pass). `null`: no option
    active until the user moves.
15. Opening: F2, Enter (after the part), a printable key (it is the type-ahead's first letter), double click/tap,
    Tab. The list shows at once.
16. Keys: Up/Down ±1, Home/End, PageUp/PageDown ±10 (clamped, no wrap); letters within **500 ms** build a prefix
    matched on `fold(label)`; the same letter again cycles through options starting with it; Backspace shortens the
    prefix; Space during a prefix is a letter, else picks and keeps without moving. **Enter** picks the active option,
    keeps, moves per `enterMoves`; **Tab** picks and moves (step-5 Tab); **Escape** gives up; a press on an option
    (`pointerdown` prevented: the focus stays) picks and keeps; Alt+Up/Down: nothing new.
17. Keep = `commit({ value })`; unchanged → closed, nothing saved. Refused (`validate`): the list closes, the combobox
    stays with `aria-invalid` and the bubble; Down or Alt+Down shows the list again. Blur: keeps the active option
    only if the user moved it (Q5), else nothing.

**The app's editor** (`editors.md` 18–19, owner « part API now, Angular template at step 9 »)
18. Mount: a host `<div class="dzg-editor" data-dzg-owner="editor">` put in the cell; `part.mount(host, ctx)`; then
    `handle.focus?.()`; false or absent → the host div (tabindex −1) is focused. A part that throws: `g.report`, the
    editor closed, not tried again on that cell until its data changes (the parts rule).
19. Keys reaching the editor's root **not prevented**: Enter / Tab → `handle.read?.()` kept (no `read`: closed, kept
    nothing), Escape → cancel; a key the part prevented is the part's (the router returns on `defaultPrevented`).
    `keep()` → closes and moves as Enter; refused → stays, bubble from the cell, sentence. Blur (rule 7) → `read()`
    kept, refused → O1. Closed: `destroy()` then the host emptied (contract 6: the cell focused first).

## Keyboard tables (ar: the same keys; horizontal moves mirrored; vertical unchanged)
| Where | Key | fr / ltr | ar / rtl |
|---|---|---|---|
| day / instant field | Alt+ArrowDown | open the calendar dialog | same |
| day / instant field | typing, Left/Right, Home/End | the field's (LTR isolated) | caret LTR inside the RTL cell |
| day / instant field | Enter / Tab / Escape / blur | step 5 (written value kept untouched, step 3) | Tab leftwards |
| calendar | arrows | tzslot's day moves (Left = previous day) | tzslot's RTL (Left = next day) |
| calendar | PageUp/PageDown, Home/End | tzslot's (month, week ends) | same |
| calendar (day) | Enter / Space on a day | write, close, focus in the field | same |
| calendar (instant) | Enter on a day | write the day, focus to the hour menu | same |
| calendar (instant) | hour/minute menus | native `<select>` keys; each change writes | same |
| calendar | Tab / Shift+Tab | trapped in the dialog | same (reading order) |
| calendar | Escape | close the calendar only, focus in the field | same |
| field after calendar | Escape | give the edit up | same |
| yes/no cell | Space | toggle (O8) | same |
| yes/no cell | Enter | part's `focus()` true → part; else toggle | same |
| yes/no cell | double click / double tap | toggle once | same |
| yes/no cell | Shift+Space, read-only cell Space | selection (unchanged) | same |
| list cell | F2, Enter (after the part), printable, double click/tap | open, list shown | Arabic letter seeds the prefix |
| list | Up/Down, Home/End, PageUp/PageDown | move the active option | same (vertical) |
| list | letters (500 ms), same letter | prefix / cycle (folded) | « ب ب » cycles, tashkil and alef forms folded |
| list | Enter / Tab / Escape / Space | pick + keep + move / pick + next / give up / pick + stay | Tab leftwards |
| app's editor | Enter / Tab / Escape not prevented | read + keep + move / read + next / cancel | same |

## List: listbox popup or native `<select>`? (S6-O2)
| | APG listbox in a popup ★ | native `<select>` | listbox, native on touch |
|---|---|---|---|
| Keys | ours, the same on every OS (Enter keeps and moves, Tab moves, Escape gives up) | per OS: Mac opens its menu on Up/Down/Space and eats Enter; Windows changes the value on arrows without opening; Escape eaten by an open OS menu | ours on desktop |
| Type-ahead | folded (accents, tashkil, alef), seeded by the opening key, 500 ms, cycling | the browser's: no Arabic folding, cannot be seeded | split |
| Accessibility | combobox + activedescendant (APG, axe-clean; SR checks §19) | native, solid | both to test |
| Mobile | our list, 44 px targets, no keyboard shown | the system's picker (best) | the system's picker |
| « not in the list », 500 cap, dark theme | yes | text only, OS colours | split |
| Bytes /editors | ~900–1 000 | ~250 | ~1 150 |

## Input methods (R5 carried) — evaluation
- **The fault**: a focused cell is not editable, so macOS (TSM) and Chrome on Windows (IME context detached outside
  editable elements) hand the first key over raw; the field opened by it gets the IME only from the second key:
  « kかな » for `kana`; on a French Mac the dead key `^` then `e` gives « e ». Enter/F2/double click first is clean.
- **Hidden proxy input** (one per grid, really focused, cells shown focused by `aria-activedescendant`): fixes every
  engine, but changes the focus model of four phases (roving `tabindex` on cells, APG grid): the reader hears an
  « edit text » on every move, VoiceOver handles activedescendant in grids poorly, every focus test, focus-visible,
  `restoreFocus`, nested grids, header focus and pinned reveal move to a new path. Base + `/editors` ~450–600 B,
  and a full a11y re-check (§2–§19). Not worth it by default.
- **Proxy only on editable text cells** (an `<input>` inside the focused cell): a focused `aria-hidden` input
  breaks axe (`aria-hidden-focus`), an input may not take `role=gridcell`: rejected.
- **EditContext** (Chromium 121+: an element with an `EditContext` takes IME text without being
  contenteditable): set on the focused editable cell, its first `textupdate` opens the field with the composed
  text. Chrome/Edge only (Windows, where most IME users are); Safari and Firefox unchanged; the cell may be exposed
  as editable. ~250 B in `/editors`, base untouched. Needs a spike (S14) before any promise.
- **Recommended**: keep the cell focus (A); document « with an input method, Enter or F2 first »; the owner's manual
  check 124a decides; EditContext (C) only after a spike if 124a fails on Windows.

## Files
New: `editors/{kinds,dates,toggle,list,custom}.ts` (eager), `editors/dates/calendar.ts` (lazy, the only tzslot
import of `/editors`), `src/dates/shared.ts` (moved), `src/internal/lazy.ts` (moved). Changed: `editors/index.ts`
(kinds, blur rule 7, `end()` on a root, Space/Enter on yes/no), `editors/host.ts` (any root), `filters/dates.ts`,
`filters/dates/*.ts`, `filters/set.ts` (imports), `internal.ts`, `part.ts` (`editor` slot, `NEEDS`), `part-texts.ts`,
`locales/*-editors.ts`, theme `edit.scss`, `contrast-pairs.json`; `size-budget.json` / `rebudget.mjs` (new lazy line,
`/editors` `over: popup`) **only after the owner's S6 answers**; `editors.md` (1, 7–19 as built), `editing.md`
(input methods), `parts.md` (`editor` slot), `a11y-protocol.md` §19 (calendar, list, yes/no by ear).

## Tests first (jsdom; each red before its code; real tzslot under jsdom as `filters-dates.test.ts`)
- `editors-dates.test.ts` — opening text per locale read back by the codec (fr `29/03/2026`, en-US `03/29/2026`,
  de, ja `2026/03/29`, ar-EG Arabic-Indic; hand-written); instant in the grid's zone with the test process in
  Auckland; `:ss` only when not 0; placeholder and `{pattern}`; typed `29/03/2026 02:30` Paris → `wall-time-skipped`;
  `25/10/2026 02:30` → `-ambiguous`; an untouched stored second-reading 02:30 → Enter saves nothing, no refusal;
  Alt+Down / the button open a dialog named `edit.calendar`; **import not called at setup nor on field focus**,
  called once at first open, prefetched on the button's `pointerenter`; loading `aria-busy` + status; failure → alert,
  Retry imports again, focus in the dialog; `loadCalendar`; `open` missing / throwing → failure, nodes removed; pick
  writes and closes, focus back in the field, Enter → one save with Day `2026-03-29`; **Escape twice** (calendar,
  then the edit, nothing saved); focus in the dialog is no blur; a press outside closes and keeps (Q5); instant:
  hour menu on 2026-10-25 Paris has 02 twice, on 2026-03-29 none; winter pick → saved `2026-10-25T01:30:00.000Z`;
  Samoa 2011-12-30 disabled; `today` from the clock in the grid's zone; ar-SA Gregorian tag; nonce + shadow root;
  closed while loading → nothing mounted; grid destroyed with the dialog open → popup gone; `calendar: false` → no
  button, no import ever.
- `editors-dates-zones.test.ts` — **bug 3 of ngx-sheetgrid `a6c97f5`** (a date one day off): 13 zones (the
  agreement sweep's list) × process zones Auckland/LA (`test:tz`): a typed and a picked day save the same `Day`; an
  instant `29/03/2026 00:00` saves the hand-written UTC of each zone.
- `editors-boolean.test.ts` — Space toggles an editable yes/no cell (selection unchanged), Space elsewhere selects;
  `null→true→false→true`; Enter toggles, a part whose `focus()` is true takes Enter; double click toggles once (not
  per click); double tap; Delete → null; refusal blink + sentence; polite text said; read-only, detail, filler,
  loading rows, nested grid: nothing; Shift+Space unchanged; editors listed before/after `rules()`/`tree()`.
- `editors-list.test.ts` — roles and ids, `aria-activedescendant` follows; placement below/above, never over the
  cell (stubbed rects), RTL inline start; every key of the table; prefix at 499 ms continues, 501 ms restarts;
  cycling; `fold`: « e » finds « Échu », « محمد » finds « مُحَمَّد », « احمد » finds « أحمد »; seeded by the opening key;
  Enter/Tab/Escape/Space; press on an option keeps the focus; blur rules (moved / not moved); options function
  gets `(row, context)`, throws → `invalid`; labels from `enumOptions`; 501 options → warning + text field; a value
  not in the list first, marked, keepable; refusal closes the list, bubble, Down reopens.
- `editors-custom.test.ts` — the context's fields, `start`/`char`; `keep` valid → save, close, move; refused →
  open, bubble, sentence; `cancel`; `refuse(code)`; Enter/Tab/Escape not prevented vs prevented; `read()` at blur,
  O1; `own(el)` focus no blur, its disposer; `editor.day` replaces the built-in; unknown name told once; throwing
  mount reported, closed; `destroy` before emptying; no part left in a pooled cell.
- Guards: `structure.test.ts` (tzslot only under the three date folders, `editors/dates/` by `import()` only,
  `/editors` never imports `/filters`, internal users list), `editors-texts` (new keys), public API list, layering,
  `editors-walk` (+ dates, yes/no, list, a custom part in the random walk; oracle unchanged), theme `edit.test`
  (rules, pairs), `rebudget` pins (red first, after the owner).

## Mutants worth running (copy, deleted after)
Import at setup; prefetch on field focus; failed module kept (Retry no-op); written-value rule dropped (untouched
ambiguous refused); written value kept after a typed change; Escape in the dialog reaching the field; focus not
returned to the field; dialog counted as blur; non-modal calendar (Tab leaves); placement over the field; picked
day off by one (UTC midnight read locally); hour menu without `timeZone`; Space toggling a read-only cell; Space not
prevented (row also selected); toggle order back to null; dblclick toggling twice; list wraps at the ends; prefix
window 500 → 5 000; no fold; cycle disabled; option press blurs; blur keeps an unmoved option; 500 cap off-by-one;
« not in list » not keepable; custom prevented Enter still kept by the grid; `own()` disposer ignored.

## Browser (`npm run test:browser -- --only editors`, Chrome; one browser, closed after; WebKit for the top layer)
- axe 0 with the calendar open (day, instant), the list open, a refused list, after a toggle — fr light Clinic, ar
  dark Midnight, forced colours (`emulateMedia`).
- Real keys (CDP): Alt+Down, arrows in the calendar (mirrored in ar), Enter pick, **Escape twice**, Tab leftwards in
  ar into a list cell, list keys, **Arabic type-ahead** (« ب » twice cycles, `Input.insertText` and key events),
  Space toggle with the row not selected.
- **Lazy**: no request for the calendar chunk or tzslot before the first open (request log), exactly one after;
  route abort → alert + Retry, unroute → Retry loads; a second date edit opens at once.
- **DST**: a Paris grid, instants on 2026-03-29 (02 h absent) and 2026-10-25 (02 h twice; winter pick → the cell
  shows the winter reading), Lord Howe's 30-minute change; Samoa's lost day greyed.
- Placement: list and calendar never over the field (rects), above on the last visible row, 320 px, zoom 200 %, a
  transformed card (top layer), re-placed on scroll; focus visible; the calendar themed (`.dzg-popup` rules).
- Touch (mobile emulation): list options ≥ 44 px, a tap picks; double tap toggles a yes/no cell once.
- WebKit: calendar and list in the top layer, double tap. Manual (owner, §19 + 124a/124b): VoiceOver/NVDA on the
  combobox, the calendar dialog, a toggle; IME per S6-O3.

## Sizes (gz, minified; the asks, measured again at the step's end)
| Entry | Now | Estimate | Ask |
|---|---|---|---|
| `@dzgrid/dom/editors` (over `@dzgrid/dom/popup`) | 3 902 / 4 350 | dates ~700, yes/no ~150, list ~950, app's editor ~300, kinds and blur ~150 → **6 050–6 300** | **6 500** (editing DOM 3 650 + 6 500 = 10 150 > Q16's 8 000: +2 150, a new grant) |
| `editors: calendar (lazy)` (new; tzslot `without`) | — | 1 100–1 400 | **1 500** (inside Q16's 2 600) |
| `@dzgrid/dom/internal` | ≤ 900 | +~300 | **measure + 50, ceiling 1 250** |
| `@dzgrid/dom/filters` | | −~300 | none (lower at the close) |
| `edit.css` | 1 619 / 1 700 | +300–400 | **2 100** |
| `-editors` en / fr / ar | 277 / 306 / 375 | ~410 / 460 / 560 | none (450 / 500 / 620 hold) |
| dom base | 21 414 / 21 700 | +~10 | none |
An editing app without filters also loads `@dzgrid/dom/popup` (~1 500) the first time; K.8 and the real example: 0
(no editors there). Time: open ≤ 4 ms (list of 500 included), type-ahead step ≤ 1 ms, calendar open after load ≤ 1
frame.

## Risks
- `/editors` over budget without S6-O1; the list is the biggest piece (option B moves it out).
- The written-value rule hides a typed-back identical text (correct: same value) — a test pins it.
- Instant readings: the field shows « 02:30 » for both readings; the picked one is kept but not visible in the
  field (the cell shows it after keep); listening §19.
- PopupHost's modal focus return to the field after a pick inside a pooled, scrolled row (rule 5): browser check.
- tzslot's `createCalendar`/`createTimeSelect` used for the first time by DzGrid: new tzslot requests possible
  (`docs/tzslot-requests.md`), the agreement sweep extended to the time menus.
- Input methods (S6-O3): a raw first letter remains on Mac whatever we choose short of the proxy.
- Options function cost per open (app code); a 500-option list's DOM per open (~1 ms, measured).
- The part API is public from this step: names frozen (`keep`, `cancel`, `refuse`, `own`, `read`).

## Owner questions
- **S6-O1 Taille de `/editors`** (3 902 / 4 350 ; l'étape 6 ajoute ~2 200). **A** 4 350 → 6 500 (l'édition DOM fait
  alors 10 150 au lieu de 8 000) ★ ; **B** la liste dans une entrée à part `@dzgrid/dom/editors-list` (~1 250) et
  `/editors` à 5 500 ; **C** garder 4 350 et charger dates et liste à la demande (taper attend le réseau : déconseillé).
- **S6-O2 La liste.** **A** une liste à nous sous la cellule (mêmes touches partout, recherche par lettres en arabe
  sans voyelles, ~950 o) ★ ; **B** le `<select>` du navigateur (~250 o, touches différentes selon le système, pas de
  recherche arabe) ; **C** notre liste sur ordinateur, celle du système sur téléphone (~1 150 o).
- **S6-O3 Méthodes de saisie (japonais, chinois, touches mortes du Mac).** **A** garder le focus sur la cellule,
  écrire « avec une méthode de saisie, Entrée ou F2 d'abord », la vérification 124a tranche ★ ; **B** un champ caché
  qui garde le focus (règle tout, mais change le focus de toute la grille, ~500 o, toute l'accessibilité à revoir) ;
  **C** EditContext sur Chrome et Edge seulement (~250 o, après un essai).
- **S6-O4 Calendrier : quand le télécharger ?** **A** au survol ou à l'appui du bouton seulement (qui tape ne charge
  pas les ~40 ko de tzslot) ★ ; **B** aussi quand le champ prend le focus (comme la fiche le dit) ; **C** jamais
  d'avance.
- **S6-O5 Calendrier d'une date et heure.** **A** calendrier + menus heure/minute de tzslot (heures doublées et
  sautées justes) ★ ; **B** calendrier seul, l'heure tapée (une heure doublée ne peut pas être choisie).
- **S6-O6 Styles et code partagé.** **A** `edit.css` 1 700 → 2 100 et `@dzgrid/dom/internal` jusqu'à 1 250 (le
  chargeur des filtres partagé, pas copié) ★ ; **B** un `editors.css` à part (~450) et le chargeur copié dans
  `/editors` (+300 o là).

## Done (2026-10-24, not committed; owner S6-O1…O7 applied)

**History.** Stopped once on the budget: `/editors` measured 7 158 / 6 500 with the list inside; owner S6-O7: the
list in its own entry `@dzgrid/dom/editors-list` (ceiling measure + 10 %), `/editors` ≤ 6 500.

**Built.** The loader moved, not copied: `internal/lazy.ts` (`once`, `notice`, exported by `@dzgrid/dom/internal`),
`filters/lazy.ts` deleted; `src/dates/shared.ts` from `filters/dates/shared.ts`, which stays a re-export (every
date-filter test unchanged). `editors/dates.ts` (opening text, written-value rule, `role="combobox"` field, calendar
button and Alt+Down, the modal dialog, loading line, failure and Retry, prefetch on the button only),
`editors/dates/calendar.ts` (lazy: tzslot calendar; hour/minute menus for instants), yes/no toggle, the app's
editor (`SlotContext['editor']`, `EditorHandle.read`, `NEEDS.editor`), the widened blur rule (popup, `own()`), the
field keys (Home/End move the caret, pages nothing: see « Fixed »). `@dzgrid/dom/editors-list` (`listEditor`, given
by `editors({ list })`; without it a text field and one `missing-feature`). Four texts. `edit.css`: date box, calendar
button, combobox, listbox and options (24 / 44 px), dialog (outside days unfaded, T11), Retry, forced colours; 9
contrast pairs × 6 themes. Entries: `package.json` exports, `build.mjs`, vitest and tsconfig paths, size lines.

**Fixed (library bug, found on the playground in real Chrome).** In an open field, Home/End/PageUp/PageDown went to
the browser: Chrome on macOS scrolls the grid on Home/End instead of moving the caret (End ran to the last row,
Enter then kept the value out of sight; the caret never moved). Browser check written first (failed: End → 5 952
px), jsdom `editors-caret.test.ts` (failed: not prevented); the step-5 « bug 4 » pin narrowed (Home/PageDown: the
field's keys, default prevented). Not a library bug (owner's report): the tree demo's visible rows are read-only
orders; the chevron expands by mouse (24 px at the cell's start padding + indent; a click before it selects).

**Demo** (owner feedback): `orders-edit.html` rebuilt flat (`playground/demos/orders-edit.ts`): Client, Date,
Statut (list), Qté, Montant, Urgent (yes/no) editable on every row; « Commande » muted with a lock and a tooltip
« Non modifiable »; four bullets fr/ar; a log of the last five events (sent, saved, refused by the server, refused on
the spot). `orders.html` unchanged but its note (the chevron hint; lead decision: a hint, not a larger hit area —
24 px already meets 2.5.8, and `@dzgrid/dom/tree` has 18 B left).

**Tests that failed first.** Budget pins (step-6 grants; then `editors-list`; the internal pin red until measured);
release export; structure (6, then 2 for the split); `editors-texts` (2); `editors-dates`, `-dates-zones` (13
zones), `-boolean`, `-list`, `-custom`: 86 red / 94 on the step-5 code (8 green by design: absences); the list's
fallback without its entry; `editors-caret` (2); the theme's step-6 rules (6) and the outside-day opacity; the
date field's role (axe `aria-allowed-attr`, found in Chrome). After the code, 2 real failures (the date field opened
with the display text) and 3 test set-ups (no layout in jsdom; tzslot sheets left by earlier tests). Step-5 pins
changed by design: « day: no field », « bug 4 », the internal budget 900.

**Mutants** (copy, deleted): 37 — 34 killed, 3 equivalent: the dialog's Escape stop (the dialog is outside the
viewport; kept for the filters), the list's `moved` flag and Retry's focus (both dead code: removed).

**Browser.** `--only editors` Chrome 74 / 74 (step-6 group: lazy — no request before the first open, the chunk once
— axe 0 with the day and instant calendars, the list, after a toggle, forced colours; keys fr/ar, ArrowRight
mirrored; Escape twice; Paris 25/10 02 twice and the winter reading saved 01:30 UTC, 29/03 no 02; Arabic
type-ahead « م » cycling through real key events; Space toggle without selecting; a failing chunk, alert, Retry; 320
px; the field keys), WebKit 3 / 3 (top layer); `--only playground` 12 / 12 (the real page on 4700, real double
clicks and typing, fr and ar); `--only dates` 44 / 44. Lord Howe and Samoa in jsdom only (`editors-dates`).

**Gate** (once): typecheck, build green; `check:size` 0 over; `check:contrast` 738 / 0; `test:ci` 342 files,
**5 500 / 5 500**; `test:perm` 6 / 6; `test:browser` full **742 / 742**; then `--only editors` 74 / 74, `--only dates`
44 / 44. Angular unchanged (types only, ngc green): fixture not run.

**Sizes** (gz): `/editors` **6 291** / 6 500 (over the popup); `editors-list` **1 221** / 1 400; calendar (lazy)
**1 494** / 1 500; `@dzgrid/dom/internal` **1 184** / 1 234; `edit.css` **2 092** / 2 100; `/filters` 9 672 (was 9 890);
dom 21 420; `dom/edit` 3 556; `core/edit` 3 098; core 28 916; `-editors` 347 / 386 / 470; K.8 82 250; angular 6 323.

**Deviations.** Days are zone-free: no day greyed in a day column's calendar (Samoa only for instants). Without
tzslot: the alert and Retry, no `missing-feature` (editors.md 9 changed). Tab skips yes/no cells. An options function
that throws is reported and opens nothing. The list's blur keeps the active option (unmoved = the cell's value).
Retry is the base's `grid.retry`. The internal budget is the exact measure + 50 (1 234), not rounded to 50.

**For the owner.** By ear: `a11y-protocol.md` 124c–124e (calendar, list, yes/no); 124a (input methods, S6-O3,
blocking for Part A) and 124b; the Arabic of the four new texts; the demo at http://127.0.0.1:4700/orders-edit.html.

## Review (2026-10-24; reviewer R1–R7, test analyser) — applied, tests first

**Fixes.** R1 the list with no options (`set` returns), options that are no list (refused `invalid`, one warning);
R2 `aria-selected` on the active option; R3 Shift+Home/End keep the anchor (`selectionDirection`); R4 seconds floored
(lead, against the analyser's m14: 12:05:00.600 opens as 12:05, pinned); R5 key repeat ignored on yes/no Space and
Enter; R6 the `detail` slot's JSDoc back above it; R7 the demo's log `role="log"` with `aria-live="off"` plus a bullet
« the grid announces each refusal » (lead: the grid already speaks refusals assertively and toggles politely; a live
log would say each twice); `editing.md` Tab wording; a part's `mount` without a handle guarded inside the try.

**Tests that failed first** (`editors-review6.test.ts`): R1 ×2 (the empty list's error only seen on the window: jsdom
does not throw listener errors to `dispatchEvent`'s caller), R2, R3, R4, R5, the handle guard — 7 red; the step-6
list pin « only the chosen option selected » changed by R2. The analyser's gaps (green on the code, kept as pins):
the view destroyed at close (stub and real: observer disconnected, hour menus removed), pointerdown prefetch,
Shift/Ctrl+Alt+Down, a paint repositions, `aria-controls` removed, an outside press with the focus in the dialog,
`injectStyles: false`, a trailing space after an ambiguous time, the `editors:` error name, the 1900 minimum (one
month back: December 1899 disabled), no Retry while loading again; `filters-dates-loader.test.ts` (`filters: no …`, no
Retry while loading); the list (prefix from the active option, text and active class follow, a press keeps the row,
hidden out of view, Ctrl/Cmd letters, a 500 ms gap); structure (`editors/**` never imports `editors-list`); yes/no
(read-only double click, Tab skips, Oui/Non said); the app's editor (cancel/refuse after close, a throwing destroy,
focus leaving an owned node, start `tab` without char); browser m07 (a real press on the calendar button keeps the
focus in the field).

**Mutants** (copy, deleted): 20 on the fixes and gaps, 19 killed; 1 (« host not emptied after a throwing destroy »)
killed after the test held the host itself.

**Gate** (once, after the review): typecheck, build green; `check:size` 0 over; contrast 738 / 0; `test:ci` 344 files,
**5 535 / 5 535**; `test:perm` 6 / 6; `test:browser` full **743 / 743**; `--only editors` 75 / 75, `--only dates` 44 / 44,
`--only playground` 12 / 12. Sizes: `/editors` **6 406** / 6 500, `editors-list` 1 234 / 1 400, calendar 1 494 / 1 500,
internal 1 184 / 1 234, `edit.css` 2 092 / 2 100.

