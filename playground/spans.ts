// The spans page: merged values, spans decided by the data, full-width rows (step 9b).
import { createGrid, type GridInstance, type GridSettings } from '@dzgrid/dom';
import { spans } from '@dzgrid/dom/spans';
import { FR } from '@dzgrid/dom/locales/fr';
import { AR } from '@dzgrid/dom/locales/ar';
import type { ColumnOrGroup, GridEvent, SortItem } from '@dzgrid/core';
// The theme, through Vite (a <link> to a file outside the playground folder is not served).
import '../packages/theme/dzgrid.css';

const form = document.getElementById('controls') as HTMLFormElement;
const status = document.getElementById('status')!;
const sortSelect = document.getElementById('sort') as HTMLSelectElement;
const val = (name: string) => (form.elements.namedItem(name) as HTMLSelectElement).value;
const on = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).checked;
const arabic = () => val('lang') === 'ar';

// ---------- the words of each dataset ----------
const WORDS = {
  fr: {
    services: ['Cardiologie', 'Chirurgie', 'Pédiatrie', 'Urgences', 'Neurologie', 'Oncologie'],
    doctors: ['Dr Benali', 'Dr Haddad', 'Dr Mansouri', 'Dr Saidi', 'Dr Kaci', 'Dr Ziani', 'Dr Amrani', 'Dr Belkacem'],
    first: ['Amine', 'Yasmine', 'Karim', 'Lina', 'Sofiane', 'Nour', 'Rachid', 'Meriem', 'Walid', 'Sara', 'Ilyes', 'Amel'],
    last: ['Bouzid', 'Cherif', 'Djebbar', 'Ferhat', 'Guerfi', 'Hamidi', 'Khelifi', 'Larbi', 'Meziane', 'Ouali', 'Rahmani', 'Taleb'],
    rooms: ['Salle A', 'Salle B', 'Salle C'],
    acts: ['Consultation', 'Échographie', 'Bilan', 'Pansement', 'Suivi', 'Vaccination'],
    service: 'Service', doctor: 'Médecin', patient: 'Patient', age: 'Âge', room: 'Chambre', hour: 'Heure',
    total: (n: number) => `Total : ${n} rendez-vous`,
    title: (s: string, n: number) => `Service : ${s} — ${n} patients`,
  },
  ar: {
    services: ['أمراض القلب', 'الجراحة', 'طب الأطفال', 'الاستعجالات', 'طب الأعصاب', 'الأورام'],
    doctors: ['د. بن علي', 'د. حداد', 'د. منصوري', 'د. سعيدي', 'د. قاسي', 'د. زياني', 'د. عمراني', 'د. بلقاسم'],
    first: ['أمين', 'ياسمين', 'كريم', 'لينا', 'سفيان', 'نور', 'رشيد', 'مريم', 'وليد', 'سارة', 'إلياس', 'أمال'],
    last: ['بوزيد', 'شريف', 'جبار', 'فرحات', 'قرفي', 'حميدي', 'خليفي', 'العربي', 'مزيان', 'والي', 'رحماني', 'طالب'],
    rooms: ['القاعة أ', 'القاعة ب', 'القاعة ج'],
    acts: ['فحص', 'تصوير بالصدى', 'تحاليل', 'ضماد', 'متابعة', 'تلقيح'],
    service: 'المصلحة', doctor: 'الطبيب', patient: 'المريض', age: 'العمر', room: 'الغرفة', hour: 'الساعة',
    total: (n: number) => `المجموع: ${n} موعد`,
    title: (s: string, n: number) => `المصلحة: ${s} — ${n} مريض`,
  },
};
const words = () => WORDS[arabic() ? 'ar' : 'fr'];

/** A seeded generator: the same rows at every reload. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 1. identical values merged ----------
type Patient = { id: string; service: string; doctor: string; name: string; age: number; room: string };
function patients(): Patient[] {
  const w = words();
  const r = rng(7);
  const out: Patient[] = [];
  // Long runs: each service holds 700 to 1 000 patients, two to four doctors each.
  w.services.forEach((service, s) => {
    const n = 700 + Math.floor(r() * 300);
    const doctors = w.doctors.slice(s % 4, (s % 4) + 2 + (s % 3));
    for (let i = 0; i < n; i++) {
      const doctor = doctors[Math.floor((i / n) * doctors.length)]!;
      out.push({ id: `p${out.length}`, service, doctor, name: `${w.last[Math.floor(r() * w.last.length)]} ${w.first[Math.floor(r() * w.first.length)]}`, age: 1 + Math.floor(r() * 90), room: `${100 + Math.floor(r() * 300)}` });
    }
  });
  return out.slice(0, 5000);
}
function patientColumns(): ColumnOrGroup<Patient>[] {
  const w = words();
  return [
    { id: 'service', header: w.service, merge: true, width: 170, ...(on('pinned') && { pinned: 'start' as const }) },
    { id: 'doctor', header: w.doctor, merge: { within: ['service'] }, width: 150 },
    { id: 'name', header: w.patient, width: 200 },
    { id: 'age', header: w.age, type: 'number', width: 90 },
    { id: 'room', header: w.room, width: 110 },
  ];
}
const SORTS: Record<string, SortItem[]> = {
  service: [{ column: 'service', dir: 'asc' }, { column: 'doctor', dir: 'asc' }],
  name: [{ column: 'name', dir: 'asc' }],
  age: [{ column: 'age', dir: 'asc' }],
};

// ---------- 2. spans decided by the data ----------
type Slot = { id: string; hour: string; a: string; b: string; c: string; spanA?: number; spanB?: number; spanC?: number; total?: true };
function schedule(): Slot[] {
  const w = words();
  const doc = (i: number) => w.doctors[i % w.doctors.length]!;
  const act = (i: number) => `${w.acts[i % w.acts.length]} — ${doc(i)}`;
  const rows: Slot[] = [];
  for (let h = 8; h <= 18; h++) rows.push({ id: `h${h}`, hour: `${String(h).padStart(2, '0')}:00`, a: '', b: '', c: '' });
  // Salle A: 8h-10h (2 h), 11h, 13h-16h (3 h); salle B: 9h-11h (3 h), 14h-16h (2 h); salle C: every other hour, one at 15h-17h.
  const put = (h: number, room: 'a' | 'b' | 'c', len: number, i: number) => {
    const row = rows[h - 8]!;
    row[room] = act(i);
    if (len > 1) row[`span${room.toUpperCase()}` as 'spanA'] = len;
  };
  put(8, 'a', 2, 0); put(11, 'a', 1, 1); put(13, 'a', 3, 2);
  put(9, 'b', 3, 3); put(14, 'b', 2, 4); put(17, 'b', 1, 5);
  put(8, 'c', 1, 6); put(10, 'c', 1, 7); put(12, 'c', 1, 8); put(15, 'c', 3, 9);
  rows.push({ id: 'total', hour: '', a: w.total(10), b: '', c: '', total: true });
  return rows;
}
function scheduleColumns(): ColumnOrGroup<Slot>[] {
  const w = words();
  const room = (id: 'a' | 'b' | 'c', i: number): ColumnOrGroup<Slot> => ({
    id, header: w.rooms[i]!, width: 240,
    rowSpan: (c) => c.row[`span${id.toUpperCase()}` as 'spanA'] ?? 1,
    ...(id === 'a' && { colSpan: (c) => (c.row.total ? 3 : 1) }),
  });
  return [{ id: 'hour', header: w.hour, width: 90, ...(on('pinned') && { pinned: 'start' as const }) }, room('a', 0), room('b', 1), room('c', 2)];
}

// ---------- 3. full-width rows ----------
type Line = Patient & { title?: string };
function grouped(): Line[] {
  const w = words();
  const r = rng(11);
  const out: Line[] = [];
  w.services.forEach((service, s) => {
    const n = 20 + Math.floor(r() * 40);
    out.push({ id: `t${s}`, service, doctor: '', name: '', age: 0, room: '', title: w.title(service, n) });
    for (let i = 0; i < n; i++) {
      out.push({ id: `g${out.length}`, service, doctor: w.doctors[(s + i) % w.doctors.length]!, name: `${w.last[Math.floor(r() * w.last.length)]} ${w.first[Math.floor(r() * w.first.length)]}`, age: 1 + Math.floor(r() * 90), room: `${100 + Math.floor(r() * 300)}` });
    }
  });
  return out;
}
function groupedColumns(): ColumnOrGroup<Line>[] {
  const w = words();
  // The title row's one cell shows the first column's value: its title.
  return [
    { id: 'name', header: w.patient, width: 220, value: (l) => l.title ?? l.name, ...(on('pinned') && { pinned: 'start' as const }) },
    { id: 'service', header: w.service, width: 170 },
    { id: 'doctor', header: w.doctor, width: 170 },
    { id: 'age', header: w.age, type: 'number', width: 90 },
    { id: 'room', header: w.room, width: 110 },
    // Wide enough to scroll sideways.
    ...['x1', 'x2', 'x3'].map((id) => ({ id, header: '—', width: 200, value: () => '' })),
  ];
}

// ---------- the grids ----------
const grids: GridInstance<any>[] = [];
function common<T>(): Pick<GridSettings<T>, 'messages' | 'locale' | 'direction' | 'density' | 'selection' | 'features' | 'onEvent' | 'timeZone'> {
  return {
    messages: arabic() ? AR : FR,
    locale: arabic() ? 'ar-DZ' : 'fr-FR',
    timeZone: 'Africa/Algiers',
    direction: val('direction') as 'auto' | 'ltr' | 'rtl',
    density: val('density') as 'compact' | 'comfortable' | 'spacious',
    selection: { mode: 'multi', checkbox: on('box'), click: true },
    features: [spans()],
    onEvent: (e: GridEvent<T>) => {
      if (e.type === 'cellClicked') status.textContent = `clic : ligne « ${String((e.row.data as { name?: string; hour?: string }).name || (e.row.data as { hour?: string }).hour || e.row.key)} », colonne ${e.column}`;
      if (e.type === 'selectionChanged') status.textContent = `${e.count ?? '?'} ligne(s) sélectionnée(s)`;
      if (e.type === 'problems') console.warn('DzGrid', e.problems);
    },
  };
}

function build(): void {
  for (const g of grids.splice(0)) g.destroy();
  // The notes stay in French, left to right; the grids' hosts take the data's language, and
  // `auto` follows them (Arabic data: right to left).
  for (const id of ['merge', 'data', 'full']) {
    const el = document.getElementById(id)!;
    el.lang = arabic() ? 'ar' : 'fr';
    el.dir = arabic() ? 'rtl' : 'ltr';
  }
  const merge = createGrid<Patient>(document.getElementById('merge')!, { rows: patients(), getRowId: (p) => p.id, columns: patientColumns(), ...common<Patient>() });
  merge.kernel.dispatch({ type: 'sort.set', sort: SORTS[sortSelect.value]! }, 'api');
  grids.push(merge);
  grids.push(createGrid<Slot>(document.getElementById('data')!, { rows: schedule(), getRowId: (s) => s.id, columns: scheduleColumns(), ...common<Slot>() }));
  grids.push(createGrid<Line>(document.getElementById('full')!, { rows: grouped(), getRowId: (l) => l.id, columns: groupedColumns(), fullWidth: (l) => l.title !== undefined, ...common<Line>() }));
}

form.addEventListener('change', build);
sortSelect.addEventListener('change', () => grids[0]?.kernel.dispatch({ type: 'sort.set', sort: SORTS[sortSelect.value]! }, 'user'));
build();
