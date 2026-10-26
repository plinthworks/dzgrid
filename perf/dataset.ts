/**
 * Dataset A: 100 000 × 30, seeded, the same on every run and every machine.
 *
 * 30 columns: an id, 10 text (5 French, 5 Arabic), 8 numbers, 4 days,
 * 2 instants, 3 enums, 2 booleans. Each row is built as ONE object literal:
 * rows built key by key took four times the memory in S1, and a benchmark
 * should measure the grid, not a badly shaped host.
 */

/** mulberry32: a seeded generator, so every run builds the same rows. */
export function rng(seed: number): () => number {
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
const AR_HARAKAT = ['َ', 'ُ', 'ِ', 'ّ', 'ْ', 'ً'];
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const ENUM_A = ['pending', 'active', 'suspended', 'closed'];
const ENUM_B = ['cardiology', 'pediatrics', 'radiology', 'oncology', 'dermatology', 'neurology'];
const ENUM_C = ['low', 'medium', 'high'];

export interface RowA {
  readonly id: string;
  readonly t0: string; readonly t1: string; readonly t2: string; readonly t3: string; readonly t4: string;
  readonly a0: string; readonly a1: string; readonly a2: string; readonly a3: string; readonly a4: string;
  readonly n0: number; readonly n1: number; readonly n2: number; readonly n3: number;
  readonly n4: number; readonly n5: number; readonly n6: number | null; readonly n7: number;
  readonly d0: string; readonly d1: string; readonly d2: string | null; readonly d3: string;
  readonly i0: string; readonly i1: number;
  readonly e0: string; readonly e1: string; readonly e2: string | null;
  readonly b0: boolean; readonly b1: boolean | null;
}

export function datasetA(n = 100_000, seed = 42): RowA[] {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const fr = (): string => {
    let s = '';
    const k = 2 + Math.floor(r() * 5);
    for (let j = 0; j < k; j++) s += pick(FR_SYL);
    if (r() < 0.3) s += ' ' + pick(FR_SYL) + pick(FR_SYL);
    if (r() < 0.2) s += ' ' + Math.floor(r() * 200);
    return s;
  };
  const ar = (): string => {
    let s = '';
    const k = 3 + Math.floor(r() * 8);
    for (let j = 0; j < k; j++) {
      s += r() < 0.15 ? pick(AR_EXTRA) : pick(AR_LET);
      if (r() < 0.1) s += pick(AR_HARAKAT);
    }
    if (r() < 0.25) s += ' ' + pick(AR_LET) + pick(AR_LET) + pick(AR_LET);
    if (r() < 0.2) {
      const num = Math.floor(r() * 200);
      s += ' ' + (r() < 0.5 ? String(num) : String(num).replace(/\d/g, (d) => AR_DIGITS[Number(d)]!));
    }
    return s;
  };
  const pad = (v: number, w = 2) => String(v).padStart(w, '0');
  const day = (): string => `${1950 + Math.floor(r() * 76)}-${pad(1 + Math.floor(r() * 12))}-${pad(1 + Math.floor(r() * 28))}`;
  const stamp = (): string => `2026-${pad(1 + Math.floor(r() * 12))}-${pad(1 + Math.floor(r() * 28))}T${pad(Math.floor(r() * 24))}:${pad(Math.floor(r() * 60))}:00Z`;

  const rows: RowA[] = new Array(n);
  for (let i = 0; i < n; i++) {
    rows[i] = {
      id: `r${i}`,
      t0: fr(), t1: fr(), t2: fr(), t3: fr(), t4: fr(),
      a0: ar(), a1: ar(), a2: ar(), a3: ar(), a4: ar(),
      n0: Math.floor(r() * 1e6), n1: Math.round(r() * 1e4) / 100, n2: Math.floor(r() * 100), n3: -500 + Math.floor(r() * 1000),
      n4: r(), n5: Math.floor(r() * 3), n6: r() < 0.1 ? null : Math.floor(r() * 50), n7: Math.floor(r() * 1e9),
      d0: day(), d1: day(), d2: r() < 0.1 ? null : day(), d3: day(),
      i0: stamp(), i1: 1767225600000 + Math.floor(r() * 31_536_000_000),
      e0: pick(ENUM_A), e1: pick(ENUM_B), e2: r() < 0.05 ? null : pick(ENUM_C),
      b0: r() < 0.5, b1: r() < 0.1 ? null : r() < 0.5,
    };
  }
  return rows;
}

/**
 * Dataset B (Phase 5 step 12, step12-plan.md « Bench »): an editable stock list, 3 000 × 12 by default, seeded. The
 * columns a pharmacy's stock screen has: an id, the product (text, sometimes Arabic), its lot (`L-0001…`), the stock
 * and its minimum (integers), the price (2 decimals), the expiry (a day), when it was received (an instant, ms), a status
 * (4 values), active (yes/no), the site (6 values), a note (text, sometimes Arabic). Pure: one object literal a row.
 */
export interface RowB {
  readonly id: string; readonly product: string; readonly lot: string; readonly stock: number; readonly min: number;
  readonly price: number; readonly expiry: string; readonly received: number; readonly status: string;
  readonly active: boolean; readonly site: string; readonly note: string;
}
const STATUS_B = ['ok', 'low', 'out', 'blocked'];
const SITE_B = ['alger', 'oran', 'constantine', 'annaba', 'blida', 'setif'];
export function datasetB(n = 3000, seed = 42): RowB[] {
  const r = rng(seed);
  const int = (k: number) => Math.floor(r() * k);
  const word = (ar: boolean) => (ar ? Array.from({ length: 3 + int(4) }, () => AR_LET[int(AR_LET.length)]).join('') : Array.from({ length: 2 + int(3) }, () => FR_SYL[int(FR_SYL.length)]).join(''));
  const out: RowB[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const m = 1 + int(12);
    out[i] = {
      id: `b${i}`, product: `${word(r() < 0.3)} ${int(1000)} mg`, lot: `L-${String(i + 1).padStart(4, '0')}`, stock: int(500), min: int(50),
      price: Math.round(r() * 100_000) / 100, expiry: `${2026 + int(4)}-${String(m).padStart(2, '0')}-${String(1 + int(28)).padStart(2, '0')}`,
      received: Date.UTC(2025, int(12), 1 + int(28), int(24), int(60)), status: STATUS_B[int(4)]!, active: r() < 0.8, site: SITE_B[int(6)]!, note: r() < 0.5 ? word(r() < 0.4) : '',
    };
  }
  return out;
}
