# Step 14 blueprint: `filter.day` and `filter.instant` with the native picker (architect, 2026-10-19)

Decisions on top: `step14-decisions.md` (they win).

## 0. Findings
1. Core needs no change: `ColumnFilter` has `day` (NumOp: equals, notEqual, lt, lte, gt, gte, between, blank, notBlank) and `instant` (InstantOp); `compileFilter`, `resolveInstantRange`, `toWire` (server/wire.ts, `resolved [from,to)` and `zone`) handle both. No conformance change.
2. `resolveInstantRange` reads `at` with `readInstant(v)` and no `assumeZone`: an offset-less `at` is `ambiguous-instant`. The UI converts the wall time itself and stores `at` in UTC `Z`.
3. `readInstant(wall, {assumeZone: zone, disambiguation: 'earlier'})` returns a `warning`: `wall-time-skipped` → refuse; `wall-time-ambiguous` → accept with a note. Display: `ms + offsetAt(ms, zone)` printed as UTC fields. All exported from `@dzgrid/core`.
4. Existing keys cover between, blank, notBlank, apply, clear; "Less than"/"Greater than" are wrong for dates: new op labels.
5. Popup trap (popup.ts:122) wraps on `activeElement === first/last`: a native date input (internal segments) must never be first or last. It never is (op select first, Apply last): an invariant to test.
6. Dark mode: the grid root has `color-scheme` (dzgrid.scss:63) and the popup is appended inside it: the native picker inherits it.
7. Bundle tests forbid bidi isolates in messages: a zone name goes in its own `<bdi>`.
8. A date input's `.value` is always Gregorian ISO with ASCII digits: no digit/locale reading; the only context is the zone (instants). Remember the zone at typing time (read-once, `Map<input, ctx>`).

## 1. API
No new feature option; built-in parts `filter.day`, `filter.instant` (registered in filters/index.ts). No `floating.day` / `floating.instant`: the floating cell shows the existing summary button (a host may register its own). `filters({ datePicker })` reserved, not shipped; fields go through one internal `dateField()` factory so a text fallback can drop in at step 18.
Day ops (default all nine, default equals; `column.filter.ops` restricts): equals `filter.op.onDay`, notEqual `filter.op.notOnDay`, lt `filter.op.before`, lte `filter.op.onOrBefore`, gt `filter.op.after`, gte `filter.op.onOrAfter`, between (existing; both ends included), blank, notBlank.
Instant ops (default all seven, default onDay): onDay (`day`, date), betweenDays (`day`, `dayTo`, both whole days), before / after (`at`, datetime-local), between (`at`, `atTo`, half-open), blank, notBlank.
Presets (today, last 7 days): Phase 5 (owner Q3). Instant before/after with a `day` only, an `at` with seconds or ms, unreadable, or outside years 0001–9999: uneditable → summary + Clear.
Shell: generalise `conditions(num)` in forms.ts into `conditions(spec)` (type, op list, label-key map, fields per op, field factory, read) for text, number, day, instant (~250 B saved). New `filters/dates.ts` (specs, `dateField`, `dayForm`, `instantForm`), `filters/wall.ts` (`readWall(wall, zone)` → `{ms, skipped, ambiguous}`, `wallOf(ms, zone)` → `YYYY-MM-DDTHH:mm`).

## 2. Behaviour
Control: `type=date` for day fields (also onDay/betweenDays on instants), `type=datetime-local` for moments; visible `<label>`, no placeholder; read `.value` only; `lang` = grid locale (best effort); dir inherited; min/max `0001-01-01`–`9999-12-31` (`…T00:00`–`…T23:59`); no dynamic min/max between bounds (core swaps a reversed range).
Locale: the browser shows its own order and digits (owner Q1); Gregorian only; no format hint.
Labels: `filter.date` "Date", `filter.dateTo` "To date", `filter.dateTime` "Date and time", `filter.dateTimeTo` "Until, not included".
a11y/RTL: native segment order; full-width block, ≥ 24 px; Alt+ArrowDown on the input opens the native picker (ours is on header/floating cells only). Main risk: segment announcements vary by screen reader → protocol §10 decides a text mode at step 18 (~400 B).
Wall → instant in the GRID's zone: `readInstant(wall, {assumeZone: zone typed in, disambiguation:'earlier'})`; store `at` as `new Date(ms).toISOString()` (refuse unless it starts with a digit and has length 24); never the browser's zone. Display `wallOf(ms, zone)`.
DST gap (Paris 2026-03-29 02:30): refused, never shifted; nothing sent, filter in force stays (L1); `aria-invalid`, 2 px outline, a visible message `filter.timeSkipped {column}` under it (aria-describedby); announced once at judge (after the pause, Apply or Enter); Apply focuses it, the popup stays.
DST overlap (Paris 2026-10-25 02:30): first occurrence for every field; visible non-blocking note `filter.timeAmbiguous` (aria-describedby, no announcement). Edge: a stored second-occurrence instant redisplays with the same wall text and is re-read as the first only if edited (in the sheet).
Between: day between inclusive; betweenDays `zoneDayBounds(lo).from`–`zoneDayBounds(hi).to`; instant between `[from, to)` (label "not included"); minute precision.
Zone note (instant columns): `filter.zone` "Time zone" + `<bdi>` IANA id at the top of the form; date and datetime fields `aria-describedby` it. Day columns: none.
Empty/unreadable: empty `.value`, `badInput` false → inactive draft (L1: filter stays, Clear removes); `badInput` true or `parseDay` fails (year > 9999) → unreadable: not sent, marked at judge, one `filter.invalidDate {column}`, focus at Apply. No badInput support → treated as empty (safe under L1).
Live (client): `input` debounced, `change` at once (last edit wins). Server: draft until Apply/Enter; toWire unchanged.
Echo/read-once: reuse `echo()`; locale change redraws labels and `lang` only; a zone change rewrites clean instant fields, a dirty one keeps its text and remembered zone; host `filter.set` rewrites clean fields only.
Keys: Enter commits via form(); Enter/Escape inside an open native picker belong to the browser (if Escape reaches the popup it closes, filter kept: browser-tested); outside pointer down does not close (O7).
Floating row: summary button (opens the popup) + Clear; no inline date input; no descriptive summary text (Phase 5).
Theme: color-scheme inherited; `.dzg-fpop input[type=date],[type=datetime-local]{inline-size:100%;min-block-size:24px}` in styles.ts; theme border/fg/bg as `.dzg-finput`, 2 px danger outline on `[aria-invalid=true]`; contrast pairs (border 3:1, outline 3:1, notes 4.5:1).
Keys (15, required by `filters()`; CHANGELOG breaking): `filter.op.{onDay,notOnDay,betweenDays,before,after,onOrBefore,onOrAfter}`, `filter.{date,dateTo,dateTime,dateTimeTo,zone}`, `filter.timeSkipped {column}`, `filter.timeAmbiguous`, `filter.invalidDate {column}`.

## 3. Sizes
Base, core, popup +0. Entry: raw ≈ 1 320 → calibrated ≈ 1 700 (1 450–1 950) → filters ≈ 8 100. Bundles ≈ en 620, fr 706, ar 777. Theme +50–70.
Audit profile (lead's measure, 2026-10-19, sum of entries gz): core 25 994 + server 5 364 + csv 1 629 + dom 18 702 + popup 1 428 + slots 1 238 + filters 6 417 + ar 825 + ar-filters 537 + theme 1 503 ≈ 63.6 kB (+ spans 7.9 if used ≈ 71.5) against the 85 kB ceiling. Steps 14–17 and 19 add roughly 6–8 kB: tight with spans, no cut needed now. Step 18 adds a real audit profile file (perf/profiles) so check:size measures it.

## 4. Files and tests first
Docs: filter-day.md, filter-instant.md (UI section), filter-ui.md (lines 8, 33, names, tests), a11y-protocol §10, phase-3-plugins and phase-3-plan D6 (datePicker reserved), STATUS, CHANGELOG, ROADMAP.
Code: new filters/{dates,wall}.ts; modify filters/{forms,index,styles}.ts, messages.ts, locales/{en,fr,ar}-filters.ts, theme scss/css + contrast pairs, playground (day column, instant column, zone switch to Europe/Paris), scripts/browser.mjs.
Unit `filters-dates.test.ts`: open/focus, first/last invariant, Tab trap never wraps from a date input; day ops → model, between, blank hides, labels, ops order/restriction; instant ops → model, `at` UTC Z with ms; the grid's zone (Algiers, Paris, Sao Paulo), never the machine's; gap (refused, aria-invalid, message visible and described, announced once, no dispatch, filter stays); overlap (earlier, note, no announcement); read-once zone; echo; empty/partial (badInput stubbed) L1; year > 9999 invalidDate; uneditable → summary; client debounce vs change; server one request at Apply; Apply with unreadable stays and focuses; locale change labels only; floating summary button; missing-key TypeError and parity.
`filters-wall.test.ts`: readWall/wallOf 2010–2030 over Paris, Los Angeles, Sao Paulo, Apia, Lord Howe; round trip, gaps, overlaps, years 0001 and 9999.
Random walk: extend filters-popup-walk with day and instant columns (Paris gap/overlap dates, Algiers, zone switch), partial input, year > 9999; invariants: rows = an oracle from zoneDayBounds, L1, nothing invalid sent, server sends only on Apply/Enter, wire `resolved` = oracle, echo stable, first/last rule.
Browser (fr-FR light, ar-DZ RTL dark, Europe/Paris): axe with the popup open for each op, the gap error, the overlap note, the floating row; real segment typing incl. partial; Shift+Tab inside segments; Escape with and without the picker; dark colours; RTL placement; row counts for 2026-03-29 (23 h) and 2026-10-25 (25 h).
Screen reader §10 (owner, fr and ar): filtered date header; Alt+ArrowDown names the dialog; the date field's name and segments; between adds "To date"; a gap time reads the error once; the overlap note; the zone note; Apply announces the count once; picker from the keyboard; rule: segments unusable → text mode at step 18.

## 5. Lead decisions
Samoa 2011-12-30 onDay: a valid empty range, no message. Day-only before/after: summary. Minute precision. Overlap: first occurrence with a note. Zone shown as the IANA id. Escape from an open native picker may close the popup (filter kept). `conditions()` generalised. Zone change while open: clean rewrite, dirty keeps.
