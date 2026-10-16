/**
 * S5 measurements, engine-agnostic: the same module runs in node and in each
 * browser. `core` is @dzgrid/core, passed in (served from source in a page,
 * bundled by esbuild in node). Nothing here uses Date: timings use
 * performance.now, instants are epoch milliseconds.
 */

// ---- deterministic data -----------------------------------------------------

/** mulberry32: a seeded generator, so every engine sorts the same 100 000 strings. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FR_SYL = ['ma', 'ri', 'é', 'lo', 'ïs', 'ch', 'an', 'tal', 'bé', 'ço', 'nô', 'du', 'pon', 'Le', 'Ét', 'ra', 'ge', 'à', 'ou', 'ê', 'œ', 'vin', 'cent', 'Ma', 'De'];
const AR_LET = 'ابتثجحخدذرسشصضطظعغفقكلمنهوي'.split('');
const AR_EXTRA = ['أ', 'إ', 'آ', 'ة', 'ى', 'ء', 'ؤ', 'ئ', 'ـ'];
const AR_HARAKAT = ['\u064E', '\u064F', '\u0650', '\u0651', '\u0652', '\u064B'];
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function makeStrings(locale, n, seed = 42) {
  const r = rng(seed);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = '';
    if (locale === 'fr') {
      const k = 2 + Math.floor(r() * 5);
      for (let j = 0; j < k; j++) s += pick(FR_SYL);
      if (r() < 0.3) s += ' ' + pick(FR_SYL) + pick(FR_SYL);
      if (r() < 0.2) s += ' ' + Math.floor(r() * 200);
    } else {
      const k = 3 + Math.floor(r() * 8);
      for (let j = 0; j < k; j++) {
        s += r() < 0.15 ? pick(AR_EXTRA) : pick(AR_LET);
        if (r() < 0.1) s += pick(AR_HARAKAT);
      }
      if (r() < 0.25) s += ' ' + pick(AR_LET) + pick(AR_LET) + pick(AR_LET);
      if (r() < 0.2) {
        const num = Math.floor(r() * 200);
        s += ' ' + (r() < 0.5 ? String(num) : String(num).replace(/\d/g, (d) => AR_DIGITS[d]));
      }
    }
    out[i] = s;
  }
  return out;
}

// ---- timing helpers ---------------------------------------------------------

const now = () => performance.now();
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
function time(fn, runs = 3) {
  const ts = [];
  let last;
  for (let i = 0; i < runs; i++) {
    const t0 = now();
    last = fn();
    ts.push(now() - t0);
  }
  return { ms: Math.round(med(ts) * 10) / 10, runs: ts.map((t) => Math.round(t)), last };
}

/** A digest of an ordering, to compare it across engines without shipping it. */
function digest(arr) {
  let h = 2166136261 >>> 0;
  for (const s of arr) {
    const str = String(s);
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
    h = Math.imul(h ^ 0x1f, 16777619) >>> 0;
  }
  return h.toString(16);
}

// ---- (a) collation ----------------------------------------------------------

export function collation(n = 100_000) {
  const out = { n, configs: [], methods: {}, samples: {} };
  for (const loc of ['fr', 'ar']) {
    const data = makeStrings(loc, n);
    const unique = new Set(data).size;
    for (const sensitivity of ['base', 'accent', 'variant']) {
      for (const numeric of [false, true]) {
        const c = new Intl.Collator(loc, { sensitivity, numeric });
        const t = time(() => data.slice().sort(c.compare));
        out.configs.push({ locale: loc, sensitivity, numeric, unique, ms: t.ms, runs: t.runs, order: digest(t.last) });
      }
    }
    // Methods, for one configuration (base, numeric: what a grid text column would use).
    const c = new Intl.Collator(loc, { sensitivity: 'base', numeric: true });
    const m = {};
    m.collatorCompareOnStrings = time(() => data.slice().sort(c.compare)).ms;
    m.arrowWrapper = time(() => data.slice().sort((a, b) => c.compare(a, b))).ms;
    // Index sort, as §3.5 plans: Uint32Array of row indices, comparator reads a column array.
    m.indexSortUint32 = time(() => {
      const idx = new Uint32Array(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      return idx.sort((x, y) => c.compare(data[x], data[y]) || x - y);
    }).ms;
    // "Precomputed keys by batch": collate the distinct values once, then sort by integer rank.
    const rankSort = (col) => {
      const t0 = now();
      const uniq = Array.from(new Set(col)).sort(c.compare);
      const rank = new Map();
      // Equal under the collator → same rank (base sensitivity folds case and accents).
      let r = 0;
      for (let i = 0; i < uniq.length; i++) {
        if (i > 0 && c.compare(uniq[i - 1], uniq[i]) !== 0) r++;
        rank.set(uniq[i], r);
      }
      const keys = new Float64Array(col.length);
      for (let i = 0; i < col.length; i++) keys[i] = rank.get(col[i]);
      const t1 = now();
      const idx = new Uint32Array(col.length);
      for (let i = 0; i < col.length; i++) idx[i] = i;
      idx.sort((x, y) => keys[x] - keys[y] || x - y);
      return { keys: t1 - t0, sort: now() - t1 };
    };
    const rk = [rankSort(data), rankSort(data), rankSort(data)];
    m.rankKeysAllUnique = { keysMs: Math.round(med(rk.map((x) => x.keys))), sortMs: Math.round(med(rk.map((x) => x.sort))) };
    // Same, on a low-cardinality column (1 000 distinct values over 100 000 rows: status, city…).
    const few = makeStrings(loc, 1000, 7);
    const lowCard = data.map((_, i) => few[(i * 7919) % 1000]);
    const rk2 = [rankSort(lowCard), rankSort(lowCard), rankSort(lowCard)];
    m.rankKeys1000Distinct = { keysMs: Math.round(med(rk2.map((x) => x.keys))), sortMs: Math.round(med(rk2.map((x) => x.sort))) };
    m.directOn1000Distinct = time(() => lowCard.slice().sort(c.compare)).ms;
    m.localeCompare = time(() => data.slice().sort((a, b) => a.localeCompare(b, loc, { sensitivity: 'base', numeric: true })), 1).ms;
    m.codeUnitBaseline = time(() => data.slice().sort()).ms;
    m.collatorConstructUs = Math.round((time(() => { for (let i = 0; i < 1000; i++) new Intl.Collator(loc, { sensitivity: 'base', numeric: true }); }, 1).ms) * 1000 / 1000);
    out.methods[loc] = m;
  }
  // Behaviour samples: what each sensitivity folds.
  const probe = (loc, opts, a, b) => new Intl.Collator(loc, opts).compare(a, b);
  out.samples = {
    fr_e_é_base: probe('fr', { sensitivity: 'base' }, 'e', 'é'),
    fr_e_é_accent: probe('fr', { sensitivity: 'accent' }, 'e', 'é'),
    fr_e_E_accent: probe('fr', { sensitivity: 'accent' }, 'e', 'E'),
    fr_cote_order: ['cote', 'côte', 'coté', 'côté'].sort(new Intl.Collator('fr').compare).join(','),
    fr_numeric_2_10: probe('fr', { numeric: true }, 'Dossier 2', 'Dossier 10'),
    fr_plain_2_10: probe('fr', {}, 'Dossier 2', 'Dossier 10'),
    ar_alef_hamza_base: probe('ar', { sensitivity: 'base' }, 'أحمد', 'احمد'),
    ar_harakat_base: probe('ar', { sensitivity: 'base' }, 'مُحَمَّد', 'محمد'),
    ar_harakat_accent: probe('ar', { sensitivity: 'accent' }, 'مُحَمَّد', 'محمد'),
    ar_tatweel_base: probe('ar', { sensitivity: 'base' }, 'محـمد', 'محمد'),
    ar_taMarbuta_ha_base: probe('ar', { sensitivity: 'base' }, 'فاطمة', 'فاطمه'),
    ar_indic_vs_latin_numeric: probe('ar', { numeric: true }, 'ملف ١٠', 'ملف 10'),
    ar_indic_2_10_numeric: probe('ar', { numeric: true }, 'ملف ٢', 'ملف ١٠'),
    ar_latin_before_arabic: probe('ar', {}, 'Zed', 'ابت'),
    fr_resolved: new Intl.Collator('fr', { sensitivity: 'base', numeric: true }).resolvedOptions(),
    ar_resolved: new Intl.Collator('ar', { sensitivity: 'base', numeric: true }).resolvedOptions(),
  };
  return out;
}

// ---- (b) numbering systems --------------------------------------------------

const cps = (s) => Array.from(s).map((ch) => 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ');

export function numbering() {
  const out = {};
  for (const loc of ['ar-DZ', 'ar-SA', 'ar-EG', 'ar', 'ar-MA', 'ar-TN', 'fr-DZ', 'fr-FR']) {
    const def = new Intl.NumberFormat(loc);
    const tag = new Intl.NumberFormat(loc + '-u-nu-latn');
    const opt = new Intl.NumberFormat(loc, { numberingSystem: 'latn' });
    const arab = new Intl.NumberFormat(loc, { numberingSystem: 'arab' });
    const dtf = new Intl.DateTimeFormat(loc, { timeZone: 'UTC' });
    out[loc] = {
      defaultNu: def.resolvedOptions().numberingSystem,
      defaultText: def.format(1234567.891),
      defaultDateNu: dtf.resolvedOptions().numberingSystem,
      defaultDateCalendar: dtf.resolvedOptions().calendar,
      tagLatn: tag.format(1234567.891),
      tagLatnNu: tag.resolvedOptions().numberingSystem,
      optionLatn: opt.format(1234567.891),
      optionLatnNu: opt.resolvedOptions().numberingSystem,
      optionLatnCodePoints: cps(opt.format(-1234567.891)),
      arab: arab.format(1234567.891),
      arabCodePoints: cps(arab.format(-1234.5)),
    };
  }
  return out;
}

// ---- (c) calendar -----------------------------------------------------------

export function calendars(core) {
  // 2026-03-05T10:00:00Z, written as epoch ms.
  const t = 1772704800000;
  const out = {};
  const cases = {
    'ar-SA default': ['ar-SA', {}],
    'ar-SA calendar:gregory': ['ar-SA', { calendar: 'gregory' }],
    'ar-SA-u-ca-gregory': ['ar-SA-u-ca-gregory', {}],
    'ar-SA gregory+latn': ['ar-SA', { calendar: 'gregory', numberingSystem: 'latn' }],
    'ar-DZ default': ['ar-DZ', {}],
    'ar-EG default': ['ar-EG', {}],
    'fa-IR default': ['fa-IR', {}],
    'fa-IR gregory+latn': ['fa-IR', { calendar: 'gregory', numberingSystem: 'latn' }],
  };
  for (const [name, [loc, extra]] of Object.entries(cases)) {
    const f = new Intl.DateTimeFormat(loc, { timeZone: 'Asia/Riyadh', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', ...extra });
    const ro = f.resolvedOptions();
    out[name] = {
      calendar: ro.calendar,
      numberingSystem: ro.numberingSystem,
      hourCycle: ro.hourCycle,
      text: f.format(t),
      parts: f.formatToParts(t).map((p) => [p.type, p.value]),
    };
  }
  // Days in another zone from the same instant: 2026-03-05T23:30Z is the 6th in Algiers, 5th in UTC.
  const tz = (zone) => new Intl.DateTimeFormat('ar-DZ', { calendar: 'gregory', numberingSystem: 'latn', timeZone: zone, dateStyle: 'full', timeStyle: 'short' }).format(1772753400000);
  out.zoneSensitivity = { UTC: tz('UTC'), Algiers: tz('Africa/Algiers'), LosAngeles: tz('America/Los_Angeles') };
  // Gregorian month names for all twelve months, ar-SA and ar-DZ (Maghreb names differ: جانفي…).
  const months = (loc) => {
    const f = new Intl.DateTimeFormat(loc, { calendar: 'gregory', month: 'long', timeZone: 'UTC' });
    const res = [];
    for (let m = 0; m < 12; m++) res.push(f.format(core.civilToEpochDay(2026, m + 1, 15) * 86_400_000));
    return res;
  };
  out.monthsGregory = { 'ar-SA': months('ar-SA'), 'ar-DZ': months('ar-DZ'), 'ar-EG': months('ar-EG'), 'fr-FR': months('fr-FR') };
  return out;
}

// ---- (d) formatToParts for currency and percent -----------------------------

export function parts() {
  const out = {};
  const cases = {
    'fr-FR EUR': ['fr-FR', { style: 'currency', currency: 'EUR' }, -1234567.5],
    'fr-FR DZD': ['fr-FR', { style: 'currency', currency: 'DZD' }, 1234567.5],
    'fr-FR percent': ['fr-FR', { style: 'percent', maximumFractionDigits: 1 }, -0.125],
    'fr-FR decimal': ['fr-FR', {}, 1234567.891],
    'fr-CH decimal': ['fr-CH', {}, 1234567.891],
    'ar-DZ DZD latn': ['ar-DZ', { style: 'currency', currency: 'DZD', numberingSystem: 'latn' }, -1234567.5],
    'ar-DZ DZD default': ['ar-DZ', { style: 'currency', currency: 'DZD' }, -1234567.5],
    'ar-DZ percent latn': ['ar-DZ', { style: 'percent', numberingSystem: 'latn', maximumFractionDigits: 1 }, -0.125],
    'ar-DZ decimal latn': ['ar-DZ', { numberingSystem: 'latn' }, -1234567.891],
    'ar-SA SAR default': ['ar-SA', { style: 'currency', currency: 'SAR' }, -1234567.5],
    'ar-SA SAR latn': ['ar-SA', { style: 'currency', currency: 'SAR', numberingSystem: 'latn' }, -1234567.5],
    'ar-EG percent default': ['ar-EG', { style: 'percent', maximumFractionDigits: 1 }, -0.125],
    'ar percent latn': ['ar', { style: 'percent', numberingSystem: 'latn', maximumFractionDigits: 1 }, -0.125],
    'ar decimal default': ['ar', {}, -1234567.891],
  };
  for (const [name, [loc, opts, v]] of Object.entries(cases)) {
    const f = new Intl.NumberFormat(loc, opts);
    out[name] = {
      text: f.format(v),
      codePoints: cps(f.format(v)),
      nu: f.resolvedOptions().numberingSystem,
      parts: f.formatToParts(v).map((p) => [p.type, p.value, cps(p.value)]),
    };
  }
  return out;
}

// ---- (e) zoneDayBounds ------------------------------------------------------

export const ZONES = [
  'Europe/Paris', 'Europe/Dublin', 'America/Los_Angeles', 'America/Sao_Paulo', 'America/Havana', 'Pacific/Apia',
  'Australia/Lord_Howe', 'Asia/Kolkata', 'Africa/Algiers', 'Pacific/Auckland', 'Asia/Tehran', 'Pacific/Chatham',
];

export function conformance(core, cases) {
  return cases.map((c) => {
    const b = core.zoneDayBounds(core.parseDay(c.input.day), c.input.zone);
    const exp = { from: core.parseInstant(c.expected.from), to: core.parseInstant(c.expected.to) };
    return { id: c.id, ok: b.from === exp.from && b.to === exp.to, got: b, expected: exp };
  });
}

/**
 * Every day 2010-01-01..2030-12-31 in each zone. Returns per zone the from
 * values (Float64Array as plain array) plus the final `to`, so contiguity and
 * cross-engine identity can be checked by the caller; and checks lengths here.
 */
export function sweep(core) {
  const first = core.dayToEpochDay(core.parseDay('2010-01-01'));
  const last = core.dayToEpochDay(core.parseDay('2030-12-31'));
  const days = last - first + 1;
  const res = { days, zones: {} };
  const allowed = new Set([23, 23.5, 24, 24.5, 25].map((h) => h * 3_600_000));
  for (const zone of ZONES) {
    const froms = new Array(days);
    const lengths = {};
    const anomalies = [];
    let calls = 0;
    let prevTo = null;
    let gaps = 0;
    const t0 = now();
    for (let n = first; n <= last; n++) {
      const day = core.epochDayToDay(n);
      const b = core.zoneDayBounds(day, zone);
      calls++;
      froms[n - first] = b.from;
      const len = b.to - b.from;
      const key = String(len / 3_600_000);
      lengths[key] = (lengths[key] ?? 0) + 1;
      if (len === 0) anomalies.push({ day, kind: 'skipped', from: b.from });
      else if (len < 0) anomalies.push({ day, kind: 'negative', from: b.from, to: b.to });
      else if (!allowed.has(len)) anomalies.push({ day, kind: 'odd-length', hours: len / 3_600_000 });
      if (prevTo !== null && prevTo !== b.from) { gaps++; if (gaps < 5) anomalies.push({ day, kind: 'not-contiguous', prevTo, from: b.from }); }
      prevTo = b.to;
      // Cross-check with instantToDayIn: from is in `day`, from-1s is before it (unless skipped).
      if (len > 0) {
        if (core.instantToDayIn(b.from, zone) !== day) anomalies.push({ day, kind: 'from-not-in-day' });
        if (core.instantToDayIn(b.from - 1000, zone) >= day) anomalies.push({ day, kind: 'from-minus-1s-in-day' });
        if (core.instantToDayIn(b.to - 1000, zone) !== day) anomalies.push({ day, kind: 'to-minus-1s-not-in-day' });
      }
    }
    const ms = now() - t0;
    res.zones[zone] = { froms, lastTo: prevTo, lengths, anomalies, usPerCall: Math.round((ms * 1000 / calls) * 10) / 10, totalMs: Math.round(ms) };
  }
  return res;
}

/** Cold cost: first call in a zone (formatter construction) vs warm. */
export function coldWarm(core) {
  const d = core.parseDay('2026-03-29');
  const t0 = now();
  core.zoneDayBounds(d, 'Asia/Tokyo');
  const cold = now() - t0;
  const t1 = now();
  for (let i = 0; i < 1000; i++) core.zoneDayBounds(d, 'Asia/Tokyo');
  const warm = (now() - t1) / 1000;
  const t2 = now();
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', hour: 'numeric', minute: 'numeric', second: 'numeric', year: 'numeric', month: 'numeric', day: 'numeric' });
  let k = 0;
  for (let i = 0; i < 10000; i++) k += f.formatToParts(1772704800000 + i * 1000).length;
  const ftp = (now() - t2) / 10000;
  return { coldMs: Math.round(cold * 100) / 100, warmUs: Math.round(warm * 1000 * 10) / 10, formatToPartsUs: Math.round(ftp * 1000 * 100) / 100, k };
}

export function intlInfo() {
  const ro = new Intl.DateTimeFormat().resolvedOptions();
  return {
    defaultLocale: ro.locale,
    supportedValuesOf: typeof Intl.supportedValuesOf === 'function',
    zonesKnown: typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone').length : null,
    havana2023: new Intl.DateTimeFormat('en-US', { timeZone: 'America/Havana', timeZoneName: 'longOffset' }).format(1678600000000),
  };
}

export function runAll(core, cases) {
  return {
    info: intlInfo(),
    numbering: numbering(),
    calendars: calendars(core),
    parts: parts(),
    conformance: conformance(core, cases),
    coldWarm: coldWarm(core),
    sweep: sweep(core),
    collation: collation(),
  };
}
