/** The 10 000 × 10 test sheet, deterministic, the same in node and in every page. */

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

const AR_NAMES = ['محمد بن علي', 'فاطمة الزهراء', 'عبد القادر', 'خديجة', 'يوسف بلقاسم', 'أمينة', 'إبراهيم', 'نور الهدى', 'سفيان', 'مريم'];
const FR_NAMES = ['Amélie', 'Benoît', 'Chloé', 'Dževad', 'Éloïse', 'François', 'Gaëlle', 'Hélène', 'Iñès', 'Jérôme'];
const CITIES = ['الجزائر', 'وهران', 'قسنطينة', 'عنابة', 'البليدة', 'سطيف', 'تلمسان', 'بجاية', 'باتنة', 'ورقلة', 'Alger', 'Oran'];
const C = String.fromCharCode;
/** Remarks that test escaping: XML specials, a formula-looking text, a literal _xHHHH_, control chars, astral and lone surrogates, spaces. */
export const REMARKS = [
  '',
  'ligne 1\nligne 2',
  '<b>&"\'</b>',
  '=1+1',
  '+33 6 12',
  'literal _x0041_ stays',
  'ctrl' + C(1) + 'char' + C(0x1f),
  '  espaces autour  ',
  'emoji ' + C(0xd83d, 0xdc4d, 0xd83c, 0xdffd),
  'lone ' + C(0xd800) + ' surrogate',
  'RLM ' + C(0x200f) + 'نص' + C(0x200e) + ' LRM',
  'tab\there',
];

export const COLUMNS = [
  { header: 'id', type: 'number', width: 8 },
  { header: 'الاسم', type: 'text', width: 18 },
  { header: 'Prénom', type: 'text', width: 12 },
  { header: 'الولاية', type: 'text', width: 12 },
  { header: 'Montant', type: 'money', width: 14 },
  { header: 'Naissance', type: 'day', width: 12 },
  { header: 'Créé le (Africa/Algiers)', type: 'instant', width: 20 },
  { header: 'Actif', type: 'boolean', width: 7 },
  { header: 'Code', type: 'text', width: 9 },
  { header: 'Remarque', type: 'text', width: 24 },
];

export function makeRows(n = 10_000, seed = 8) {
  const r = rng(seed);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const rows = new Array(n);
  for (let i = 0; i < n; i++) {
    const y = 1930 + Math.floor(r() * 95);
    const m = 1 + Math.floor(r() * 12);
    const d = 1 + Math.floor(r() * 28);
    rows[i] = [
      i + 1,
      pick(AR_NAMES),
      pick(FR_NAMES),
      pick(CITIES),
      Math.round((r() * 2_000_000 - 500_000)) / 100,
      `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      // 2020-01-01T00:00Z plus a whole number of seconds.
      1577836800000 + Math.floor(r() * 200_000_000) * 1000,
      r() < 0.5,
      String(Math.floor(r() * 100000)).padStart(5, '0'),
      i < REMARKS.length ? REMARKS[i] : r() < 0.2 ? pick(REMARKS) : '',
    ];
  }
  return rows;
}
