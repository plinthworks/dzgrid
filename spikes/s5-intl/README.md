# S5 — Intl: collation speed, digits, calendar, parts, `zoneDayBounds`

## Question

ARCHITECTURE §3.4, §3.5, §3.9 and K.8 assume that:

- `Intl.Collator` sorts 100 000 text cells in fr and ar within 250 ms;
- `numberingSystem: 'latn'` gives Latin digits for every Arabic locale;
- `calendar: 'gregory'` stops `ar-SA` from showing Umm al-Qura dates;
- `formatToParts(number)` gives parts we can rely on, invisible marks included;
- `zoneDayBounds`, built on `Intl.DateTimeFormat#formatToParts` alone, gives the
  same bounds in node, Chrome, Firefox and WebKit.

Decision rule: if a text sort of 100 000 rows takes more than 250 ms, use keys
precomputed in batches, or a Worker (out of v1).

## Method

`bench.js` does all the measuring and runs unchanged in node (core bundled by
esbuild) and in each browser (core served from source by `../kit.mjs`).
`run.mjs` runs it in node, then in Chrome, Firefox and WebKit one after the
other, and compares the results across engines. Run: `node spikes/s5-intl/run.mjs`
(or `… run.mjs node chrome` for a subset).

- Strings come from a seeded generator: French syllables with accents, digits and
  spaces; Arabic letters with hamza forms, tāʾ marbūṭa, alif maqṣūra, tatweel,
  short vowels (harakat), and Latin or Arabic-Indic digits. 100 000 per locale,
  about 99 % distinct. Each timing is the median of 3 sorts of a fresh copy.
- Ways to sort that were measured: `array.sort(collator.compare)`; a `Uint32Array`
  of row indices sorted with a comparator, as §3.5 plans; **rank keys** (collate
  the distinct values once, give each an integer rank, sort the indices by
  rank); `localeCompare`; and plain code-unit order as the floor.
- Zones: conformance cases `conformance/cases/zone-day-bounds/*.json` (14), then
  every day from 2010-01-01 to 2030-12-31 (7 670 days) in 12 zones. For each day
  we check: `from < to` (except a skipped day), the length is one of
  23 / 23.5 / 24 / 24.5 / 25 h, `to` of day N equals `from` of day N+1, and
  `instantToDayIn(from) === day`, `instantToDayIn(from − 1 s) < day`,
  `instantToDayIn(to − 1 s) === day`. All 92 040 `from` values, plus the last
  `to`, are compared engine by engine.

Machine: Apple M4 Max, macOS 26.2. Engines: node 22.20.0 (ICU 77.1, tzdata
2025b), Chrome 155, Firefox 157, WebKit 27.2 (Playwright build). Other agents
were running browsers at the same time, so timings are noisy (±20 %). Numbers
come from `results/result.json`; each engine's full output is in `results/<engine>.json`.

## Results

### (a) Collation, 100 000 strings (ms, median of 3)

| | node | Chrome | Firefox | WebKit |
|---|---|---|---|---|
| fr, `sort(collator.compare)` (any sensitivity, with or without numeric) | 106–129 | 110–126 | 90–104 | 77–96 |
| ar, same | 138–155 | 153–176 | 138–198 | 131–149 |
| fr, `Uint32Array` of indices + comparator | 120–138 | 119–130 | 104–117 | 96–122 |
| ar, same | 150–168 | 166–179 | 167–212 | 138–163 |
| rank keys, all distinct: making the keys + sorting by them (fr) | 111 + 16 | 106 + 16 | 102 + 19 | 89 + 19 |
| rank keys, 1 000 distinct values over 100 000 rows (fr) | 2 + 13 | 2 + 12 | 4 + 14 | 2 + 13 |
| direct sort of those 1 000-distinct rows (fr) | 77–80 | 79 | 63 | 60 |
| `localeCompare(…, 'fr', opts)` | 2 800 | 2 390 | 1 000 | 1 710 |
| code-unit order (floor) | 26 | 28 | 16 | 7 |

- `sensitivity` (base / accent / variant) and `numeric` change nothing that can
  be measured: ±5 %.
- Arabic costs 1.3 to 1.9 times as much as French.
- `localeCompare` with options is 10 to 25 times slower: it must never be used
  in a sort.
- **The resulting order is the same in all four engines**, for all 12 settings
  (digest of the sorted array).
- Behaviour, the same in all engines:
  `e`/`é` equal under `base`, different under `accent`; `e`/`E` equal under
  `accent`; plain `fr` sorts `cote, coté, côte, côté` (accents compared left to
  right; the backwards French order is `fr-CA` only); `numeric` puts
  `Dossier 2` before `Dossier 10`.
  In `ar`: `أحمد` = `احمد` under `base` (hamza forms fold); harakat are ignored
  **even under `accent`**; tatweel is ignored; `فاطمة` ≠ `فاطمه` (tāʾ marbūṭa is
  not hāʾ); with `numeric`, `ملف ١٠` = `ملف 10` (Arabic-Indic and Latin digits
  are the same number) and `ملف ٢` < `ملف ١٠`; Arabic letters sort **before**
  Latin ones in `ar`.

### (b) Default digits (`resolvedOptions().numberingSystem`)

| locale | node | Chrome | Firefox | WebKit |
|---|---|---|---|---|
| `ar-DZ`, `ar-MA`, `ar-TN` | latn (`1.234.567,891`) | latn | latn | latn |
| `ar` | **latn** (`1,234,567.891`) | latn | latn | latn |
| `ar-SA`, `ar-EG` | arab (`١٬٢٣٤٬٥٦٧٫٨٩١`) | arab | arab | arab |
| `fr-FR`, `fr-DZ` | latn (`1 234 567,891`, U+202F) | latn | latn | latn |

`-u-nu-latn` in the tag and `numberingSystem: 'latn'` in the options both give
Latin digits in all four engines, for every locale tried; date formatters
follow the same defaults. Note that plain `ar` now defaults to Latin digits
(current CLDR); older engines may still give `arab`, which is one more reason
to always set it.

### (c) `ar-SA` calendar

| | node | Chrome | Firefox | WebKit |
|---|---|---|---|---|
| `new Intl.DateTimeFormat('ar-SA')` calendar | gregory | gregory | gregory | **islamic-umalqura** (`١٦ رمضان، ١٤٤٧ هـ`) |
| with `calendar: 'gregory'` or `ar-SA-u-ca-gregory` | gregory | gregory | gregory | gregory |

So **WebKit (Safari) still opens Umm al-Qura for `ar-SA`**, and the others do
not. Forcing `calendar: 'gregory'` works everywhere. Gregorian month names:
`ar-SA` and `ar-EG` say يناير … ديسمبر; `ar-DZ` uses the Maghreb names
جانفي، فيفري، مارس، أفريل، ماي، جوان، جويلية، أوت… — the same in every engine.
`fa-IR` defaults to the Persian calendar and `arabext` digits (۱۴ اسفند ۱۴۰۴),
in every engine.

The **literals differ** in WebKit: `٥ مارس، ٢٠٢٦، ١:٠٠ م` against
`٥ مارس ٢٠٢٦ في ١:٠٠ م` elsewhere (comma and no `في`). The `day`, `month`,
`year`, `hour`, `minute`, `dayPeriod` parts are the same. `timeZone` is
honoured: 2026-03-05T23:30Z is Thursday the 5th in UTC and Friday the 6th in
Africa/Algiers, everywhere.

### (d) `formatToParts(number)`, exact code points (identical in all four engines)

| case | text | parts that are invisible or special |
|---|---|---|
| fr-FR EUR −1234567.5 | `-1 234 567,50 €` | group U+202F (narrow no-break space), literal before € U+00A0 |
| fr-FR percent −0.125 | `-12,5 %` | literal before % U+00A0 |
| ar-DZ DZD (latn, also the default) | `‏‎-1.234.567,50 د.ج.‏` | leading literal **U+200F U+200E** (RLM LRM), group `.`, decimal `,`, U+00A0, currency `د.ج.`, trailing literal **U+200F** |
| ar-DZ percent latn | `‎-12,5‎%‎` | literal U+200E before the sign, before % and after it |
| ar-DZ / ar decimal latn, negative | `‎-1.234.567,891` | literal U+200E before the minus |
| ar-SA SAR default (arab) | `؜-‏١٬٢٣٤٬٥٦٧٫٥٠ ر.س.‏` | **U+061C** (Arabic letter mark) before the minus, U+200F after it, group U+066C, decimal U+066B, U+00A0, trailing U+200F |
| ar-EG percent default | `؜-١٢٫٥٪؜` | U+061C, percent U+066A, trailing U+061C |

The marks sit in parts of `type: 'literal'`, never inside `minusSign`,
`integer` or `currency`. Only `fr-CH` differs between engines: node and Chrome
give `1 234 567,891` (U+202F), Firefox `1'234'567,891`, WebKit `1’234’567.891`
(U+2019 and a **dot** for decimals) — different CLDR data.

Consequences for parsing pasted or typed numbers: strip U+200E, U+200F, U+061C,
U+00A0, U+202F (and U+066C as a group sign); read U+066B as the decimal
separator and U+066A as a percent sign; map U+0660–U+0669 (and U+06F0–U+06F9)
to 0–9.

### (e) `zoneDayBounds`

- **14 / 14 conformance cases pass in node, Chrome, Firefox and WebKit.**
- Sweep, 7 670 days × 12 zones: **no anomaly** in any engine; the only zero-length
  day is Apia 2011-12-30 (skipped, as expected); every day is contiguous with the
  next; **the 92 040 bounds are identical in the four engines.**
- Day lengths found (node; same everywhere): Paris, Dublin, Los Angeles, Havana,
  Auckland, Chatham: 21 × 23 h and 21 × 25 h; São Paulo 9 + 10 (no DST after
  2019); Tehran 13 + 13 (no DST after 2022); Apia 11 + 11 and the skipped day;
  Lord Howe 21 × 23.5 h and 21 × 24.5 h; Kolkata and Algiers 24 h only.
- Cost per call, warm: node 48 µs, Chrome 26 µs, Firefox 22 µs, WebKit 22 µs.
  One `formatToParts` costs 2.6 / 1.4 / 1.0 / 0.9 µs, so a call does about
  15–20 of them. First call in a new zone (formatter creation): ≈ 0.1 ms.
  A filter resolves bounds once per request, so this is negligible; it would
  matter only if called per row — which `instantToDayIn` (one `formatToParts`) is not.

**No core bug found.**

## Decision

- **Rule not triggered on this machine**: the slowest text sort is Arabic with
  an index sort in Firefox, 167–212 ms, under 250 ms. But the margin is only
  1.2×, the machine is an M4 Max, and K.8 targets a mid-range laptop, likely 2
  to 3 times slower, which would put Arabic at 350–600 ms. So, in v1, on the main thread:
  **sort text columns by rank keys**. Collate the column's distinct values once
  per (column, collator, data version), store an integer rank per row
  (`Float64Array` or `Uint32Array`), and sort the indices by rank like a number
  column. It costs the same as one direct sort the first time (all distinct),
  far less on columns with repeated values (15 ms instead of 80 ms for 1 000
  distinct values), and each later sort (other direction, a second sort column,
  after a filter) costs about 15 ms. No Worker.
- `Intl.Collator` is created once per (locale, sensitivity, numeric), and
  `compare` is passed as is (a wrapper arrow function adds 0–7 %). Never `localeCompare`.
- Default collation for text columns: `sensitivity: 'base'`, `numeric: true`.
  In Arabic this folds hamza forms, harakat, tatweel, and makes Arabic-Indic and
  Latin digits compare equal, which is what a user expects. Do not count on
  `accent` to tell harakat apart: ICU ignores them at that level too.
- **Always** set `calendar: 'gregory'` **and** `numberingSystem` (default
  `'latn'`) explicitly, even for `ar-DZ` or `ar` whose defaults are already right:
  Safari would show Umm al-Qura for `ar-SA`, and the `ar` default has changed
  across CLDR versions.
- Format tests compare `formatToParts` types and values, never the full string:
  literals differ (WebKit's `، ` against `في`; `fr-CH` group signs).

## Changes to ARCHITECTURE.md

- §3.4 (*Formatage*): add "`numberingSystem` est **toujours** posé, même quand
  le défaut est déjà `latn` (`ar-DZ`, `ar`) : le défaut de `ar` a changé selon
  les versions de CLDR." Replace the `[À VÉRIFIER]` on `zoneDayBounds` by:
  "Vérifié (S5) : 14 cas de conformité et 7 670 jours × 12 zones identiques
  sous node, Chrome, Firefox et WebKit ; ≈ 25 µs par appel dans un navigateur."
- §3.5: replace "Colonnes texte : `Intl.Collator(…)` en cache ; … [À VÉRIFIER
  spike S5]" by "Colonnes texte : **clés de rang** — les valeurs distinctes
  sont triées une fois par `Intl.Collator` (en cache), chaque ligne reçoit son
  rang entier, puis le tri se fait comme sur une colonne numérique. Mesuré
  (S5) : 100 000 chaînes arabes en 130–210 ms la première fois selon le moteur,
  ≈ 15 ms ensuite." Note that `sensitivity: 'base'` already folds Arabic
  hamza forms, harakat and tatweel, so the quick search only needs to do the
  same folding for `contains` (the collator does not do substring matching).
- §3.9 (*Formats*): add "Safari ouvre encore l'Umm al-Qura pour `ar-SA` sans
  `calendar: 'gregory'` (vérifié S5) ; Chrome, Firefox et node non." List the
  invisible marks a number reader must strip: U+200E, U+200F, U+061C, U+00A0,
  U+202F, U+066C, plus U+066B as decimal separator and U+066A as percent sign.

## Open points

- [À VÉRIFIER] Timings on a mid-range laptop (K.8's reference), on a quiet
  machine, with the minified bundle. Run `node spikes/s5-intl/run.mjs` there.
- [À VÉRIFIER] Real Safari 17.5 (the oldest K.7 target) and Firefox 120: the
  Playwright builds are recent. Older ICU may still default `ar` to `arab` and
  may lack recent tzdata.
- Each engine has its own tzdata: a rule change announced after an engine's
  release (a country dropping DST) gives different bounds for future days.
  This cannot be fixed by the core; the server should not trust a client's
  resolved bounds for days more than a few months ahead. [À VÉRIFIER] how old
  the tzdata of Safari 17.5 is.
- The quick-search target (150 ms for 100 000 rows, §3.5) was not measured here:
  it is a substring search, not a collation.
