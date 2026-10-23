// Demo 2 (docs/phase-5-steps/demos-plan.md §3): a hospital's staff as an org chart. A tree by manager
// (parent ids) with its three nearest parents pinned under the header; the « Employé » column pinned at
// the start, its cell drawn by the demo (initials on a disc, the name, the job title: two lines, so the
// rows are 52 px through `rowHeight`, owner D1); department pills drawn by the demo (owner D2: 6 neutral
// colours, not status tones); status badges; flags (inline SVG) and the country's name in the page's
// language; two contact links reachable by the keyboard (Enter goes in, ← → between them, Escape out).
// Invented people only (seed 1962): names from short lists, e-mails at example.org (RFC 2606), phone
// numbers in a range no one uses (+213 000…).
import { createGrid, definePart, type GridInstance } from '@dzgrid/dom';
import { tree } from '@dzgrid/dom/tree';
import { badge } from '@dzgrid/dom/parts';
import { FR } from '@dzgrid/dom/locales/fr';
import { AR } from '@dzgrid/dom/locales/ar';
import { FR_TREE } from '@dzgrid/dom/locales/fr-tree';
import { AR_TREE } from '@dzgrid/dom/locales/ar-tree';
import type { ColumnDef, GridEvent } from '@dzgrid/core';
import { seeded } from './seed.js';
import { COUNTRIES, flagSvg, type Country } from './flags.js';

export type HrStatus = 'ok' | 'due' | 'leave' | 'part';
export interface Person {
  readonly id: string;
  readonly manager: string | null;
  readonly level: number;
  readonly first: string;
  readonly last: string;
  readonly name: string;
  /** Index into the job titles of the level (and the department, for staff). */
  readonly dept: number;
  readonly country: Country;
  readonly hired: string;
  readonly salary: number;
  readonly status: HrStatus;
  readonly email: string;
  readonly phone: string;
}

const FIRST = ['Amina', 'Yacine', 'Lina', 'Karim', 'Sofia', 'Nassim', 'Inès', 'Rayan', 'Selma', 'Walid', 'Nora', 'Adel', 'Maya', 'Samir', 'Leïla', 'Hugo', 'Clara', 'Omar', 'Yasmine', 'Mehdi', 'Sara', 'Ilyes', 'Chloé', 'Anis', 'Dounia', 'Farid', 'Emma', 'Bilal', 'Hana', 'Tarek', 'Lucas', 'Nadia'];
const LAST = ['Haddad', 'Benali', 'Mansouri', 'Cherif', 'Laurent', 'Kaci', 'Bouzid', 'Morel', 'Saidi', 'Rahmani', 'Fontaine', 'Belkacem', 'Garnier', 'Meziane', 'Toumi', 'Lefèvre', 'Brahimi', 'Rousseau', 'Amrani', 'Dupuis', 'Ziani', 'Moreau', 'Hamidi', 'Girard'];
const STATUS: readonly HrStatus[] = ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'due', 'due', 'due', 'leave', 'leave', 'part'];
const plain = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** 500 people: a director general, 6 department heads, 5 managers each, 3 team leads each, staff under the leads. */
export function people(total = 500): Person[] {
  const r = seeded(1962);
  const out: Person[] = [];
  const used = new Set<string>();
  const add = (manager: string | null, level: number, dept: number): string => {
    let first: string, last: string;
    do (first = r.pick(FIRST)), (last = r.pick(LAST));
    while (used.has(`${first} ${last}`) && used.size < FIRST.length * LAST.length);
    used.add(`${first} ${last}`);
    const id = `E${String(out.length + 1).padStart(3, '0')}`;
    const base = [600, 380, 260, 175, 60][level]!;
    const country = r.next() < 0.6 ? 'DZ' : r.pick(COUNTRIES.slice(1));
    out.push({
      id, manager, level, first, last, name: `${first} ${last}`, dept, country,
      hired: r.day(level === 0 ? 2005 : 2008, 2026), salary: (base + r.int(0, level === 4 ? 80 : 40)) * 1000, status: r.pick(STATUS),
      email: `${plain(first)}.${plain(last)}@example.org`, phone: `+213 000 ${r.int(10, 99)} ${r.int(10, 99)} ${r.int(10, 99)}`,
    });
    return id;
  };
  const dg = add(null, 0, 3);
  const leads: [string, number][] = [];
  for (let d = 0; d < 6; d++) {
    const head = add(dg, 1, d);
    for (let m = 0; m < 5; m++) {
      const manager = add(head, 2, d);
      for (let t = 0; t < 3; t++) leads.push([add(manager, 3, d), d]);
    }
  }
  for (let i = 0; out.length < total; i++) {
    const [lead, d] = leads[i % leads.length]!;
    add(lead, 4, d);
  }
  return out;
}

const WORDS = {
  fr: {
    title: 'Ressources humaines', employee: 'Employé', dept: 'Département', country: 'Pays', hired: 'Embauche', salary: 'Salaire', status: 'Statut', contact: 'Contact',
    depts: ['Soins', 'Pharmacie', 'Laboratoire', 'Administration', 'Informatique', 'Logistique'],
    jobs: ['Directeur général', 'Chef de département', 'Responsable', 'Chef d’équipe'],
    staff: ['Infirmier', 'Préparateur en pharmacie', 'Technicien de laboratoire', 'Assistant administratif', 'Développeur', 'Agent logistique'],
    statuses: { ok: 'À jour', due: 'Visite due', leave: 'En arrêt', part: 'Mi-temps thérapeutique' },
    write: (n: string) => `Écrire à ${n}`, call: (n: string) => `Appeler ${n}`,
  },
  ar: {
    title: 'الموارد البشرية', employee: 'الموظف', dept: 'القسم', country: 'البلد', hired: 'التوظيف', salary: 'الراتب', status: 'الحالة', contact: 'الاتصال',
    depts: ['التمريض', 'الصيدلة', 'المخبر', 'الإدارة', 'الإعلام الآلي', 'الإمداد'],
    jobs: ['المدير العام', 'رئيس القسم', 'مسؤول', 'رئيس فريق'],
    staff: ['ممرض', 'محضّر صيدلي', 'تقني مخبر', 'مساعد إداري', 'مطوّر', 'عون إمداد'],
    statuses: { ok: 'محدَّث', due: 'زيارة مستحقة', leave: 'في عطلة مرضية', part: 'دوام جزئي علاجي' },
    write: (n: string) => `مراسلة ${n}`, call: (n: string) => `الاتصال بـ ${n}`,
  },
} as const;

/** The row height at 16 px text: a 28 px disc and two lines of text, with air (owner D1). */
export const HR_ROW = 52;

const SVG = 'http://www.w3.org/2000/svg';
const icon = (doc: Document, d: string): SVGSVGElement => {
  const s = doc.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 20 20');
  s.setAttribute('width', '16');
  s.setAttribute('height', '16');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  const p = doc.createElementNS(SVG, 'path');
  p.setAttribute('d', d);
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '1.6');
  p.setAttribute('stroke-linejoin', 'round');
  s.append(p);
  return s;
};
const MAIL = 'M3 5h14v10H3z M3 5l7 6 7-6';
const PHONE = 'M6 3h2.5l1.5 4-2 1.3a9 9 0 0 0 3.7 3.7L13 10l4 1.5V14a2 2 0 0 1-2 2A12 12 0 0 1 4 5a2 2 0 0 1 2-2z';

export interface HrDemo {
  readonly grid: GridInstance<Person>;
  readonly rows: readonly Person[];
}

export function mountHr(host: HTMLElement, o: { locale: string; onEvent?: (e: GridEvent<Person>) => void }): HrDemo {
  const ar = o.locale.startsWith('ar');
  const W = ar ? WORDS.ar : WORDS.fr;
  const base = ar ? AR : FR;
  const messages = { ...base, text: { ...base.text, ...(ar ? AR_TREE : FR_TREE).text } };
  const rows = people();
  const leads = new Set(rows.map((p) => p.manager).filter((m): m is string => m !== null));
  const region = new Intl.DisplayNames([o.locale], { type: 'region' });
  const job = (p: Person): string => (p.level < 4 ? W.jobs[p.level]! : W.staff[p.dept]!);
  const tone = (id: string): number => [...id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 997, 7) % 6;

  /** Initials on a disc (decorative: the name is beside it), the name, the job title. */
  const employee = definePart('cell', {
    mount(cell, c) {
      const doc = cell.ownerDocument;
      const box = doc.createElement('span');
      box.className = 'hr-emp';
      const disc = doc.createElement('span');
      disc.className = 'hr-avatar';
      disc.setAttribute('aria-hidden', 'true');
      const who = doc.createElement('span');
      who.className = 'hr-who';
      const name = doc.createElement('span');
      name.className = 'hr-name';
      const title = doc.createElement('span');
      title.className = 'hr-title';
      who.append(name, title);
      box.append(disc, who);
      cell.append(box);
      const set = (x: typeof c): void => {
        const p = x.row as Person;
        disc.textContent = `${p.first[0]}${p.last[0]}`;
        disc.dataset['tone'] = String(tone(p.id));
        name.textContent = p.name;
        title.textContent = job(p);
      };
      set(c);
      return { update: set };
    },
  });
  /** A department as a pill of its own colour (owner D2): six neutral colours, no status meaning. */
  const dept = definePart('cell', {
    mount(cell, c) {
      const pill = cell.ownerDocument.createElement('span');
      pill.className = 'hr-dep';
      cell.append(pill);
      const set = (x: typeof c): void => {
        pill.textContent = x.text;
        pill.dataset['dep'] = String((x.row as Person).dept);
      };
      set(c);
      return { update: set };
    },
  });
  /** A flag (never mirrored) and the country's name in the page's language. */
  const country = definePart('cell', {
    mount(cell, c) {
      const doc = cell.ownerDocument;
      const box = doc.createElement('span');
      box.className = 'hr-country';
      const text = doc.createElement('span');
      let flag: SVGSVGElement | null = null;
      box.append(text);
      cell.append(box);
      const set = (x: typeof c): void => {
        const k = (x.row as Person).country;
        if (flag?.dataset['country'] !== k) {
          flag?.remove();
          flag = flagSvg(doc, k);
          box.prepend(flag);
        }
        text.textContent = x.text;
      };
      set(c);
      return { update: set };
    },
  });
  /** Two links drawn as icon buttons: out of the Tab order; Enter on the cell goes to the first, ← → between them. */
  const contact = definePart('cell', {
    mount(cell, c) {
      const doc = cell.ownerDocument;
      const box = doc.createElement('span');
      box.className = 'hr-contact';
      const mail = doc.createElement('a');
      const tel = doc.createElement('a');
      for (const [a, d] of [[mail, MAIL], [tel, PHONE]] as const) {
        a.className = 'hr-link';
        a.tabIndex = -1;
        a.append(icon(doc, d));
        box.append(a);
      }
      let dir = c.dir;
      box.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const forward = (e.key === 'ArrowRight') === (dir === 'ltr');
        (forward ? tel : mail).focus();
        e.preventDefault();
      });
      cell.append(box);
      const set = (x: typeof c): void => {
        const p = x.row as Person;
        dir = x.dir;
        mail.href = `mailto:${p.email}`;
        mail.setAttribute('aria-label', W.write(p.name));
        tel.href = `tel:${p.phone.replace(/\s/g, '')}`;
        tel.setAttribute('aria-label', W.call(p.name));
      };
      set(c);
      return { update: set, focus: () => (mail.focus(), true) };
    },
  });

  const columns: ColumnDef<Person, any>[] = [
    { id: 'name', header: W.employee, width: 310, pinned: 'start', ui: { cell: 'employee' } },
    { id: 'dept', header: W.dept, width: 160, value: (p: Person) => W.depts[p.dept], ui: { cell: 'dept' } },
    { id: 'country', header: W.country, width: 170, value: (p: Person) => region.of(p.country) ?? p.country, ui: { cell: 'country' } },
    { id: 'hired', header: W.hired, type: 'day', width: 130 },
    { id: 'salary', header: W.salary, type: 'number', width: 140, numberFormat: { style: 'currency', currency: 'DZD', maximumFractionDigits: 0 } },
    { id: 'status', header: W.status, type: 'enum', width: 210, enumOptions: (Object.keys(W.statuses) as HrStatus[]).map((value) => ({ value, label: W.statuses[value] })), ui: { cell: 'status' } },
    { id: 'contact', header: W.contact, width: 100, value: (p: Person) => p.email, sortable: false, ui: { cell: 'contact' } },
  ];

  const grid = createGrid<Person>(host, {
    rows, getRowId: (p) => p.id, columns, messages, locale: o.locale, direction: 'auto', label: W.title,
    rowHeight: HR_ROW,
    rowClass: (c) => (leads.has(c.row.id) ? 'hr-lead' : null),
    parts: { employee, dept, country, contact, status: badge({ tones: { ok: 'success', due: 'warning', leave: 'danger', part: 'info' } }) },
    features: [tree<Person>({ parentId: (p) => p.manager, sticky: 3, initial: 2 })],
    ...(o.onEvent && { onEvent: o.onEvent }),
  });
  return { grid, rows };
}
