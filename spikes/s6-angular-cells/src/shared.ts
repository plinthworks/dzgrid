/** Rows, columns and counters shared by every variant. */

export interface Row {
  readonly id: string;
  readonly [key: string]: string;
}

export const ROW_COUNT = 100_000;
export const VISIBLE_ROWS = 40;
export const ROW_HEIGHT = 24;
export const KEYS = [
  'id', 'name', 'status', 'owner', 'city', 'priority', 'amount', 'qty',
  'created', 'region', 'code', 'channel', 'action',
] as const;
export const COLUMN_WIDTH = 100;

const STATUS = ['active', 'pending', 'blocked', 'archived'];
const PRIORITY = ['low', 'normal', 'high', 'urgent'];
const CITY = ['Alger', 'Oran', 'Constantine', 'Annaba', 'Blida', 'Sétif', 'Béjaïa'];
const REGION = ['north', 'south', 'east', 'west'];
const CHANNEL = ['web', 'phone', 'mail', 'desk'];

/** Deterministic rows; every value already a string so the text variant does no formatting. */
export function makeRows(n = ROW_COUNT): Row[] {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = (a: string[]) => a[Math.floor(rnd() * a.length)]!;
  const rows: Row[] = new Array(n);
  for (let i = 0; i < n; i++) {
    rows[i] = {
      id: String(i + 1),
      name: `Person ${i + 1}`,
      status: pick(STATUS),
      owner: `owner${Math.floor(rnd() * 500)}`,
      city: pick(CITY),
      priority: pick(PRIORITY),
      amount: (rnd() * 10000).toFixed(2),
      qty: String(Math.floor(rnd() * 100)),
      created: `2026-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`,
      region: pick(REGION),
      code: `C-${Math.floor(rnd() * 1e6)}`,
      channel: pick(CHANNEL),
      action: 'Open',
    };
  }
  return rows;
}

/**
 * Which columns get a template, for `t` templated columns out of 13: the last
 * one is always the button (an output), the others badges spread across the row.
 */
const BADGE_ORDER = [2, 5, 9, 11, 4, 1, 7, 3, 10, 8, 6, 0];
export function templatedColumns(t: number): Map<number, 'badge' | 'action'> {
  const m = new Map<number, 'badge' | 'action'>();
  if (t <= 0) return m;
  m.set(12, 'action');
  for (const c of BADGE_ORDER.slice(0, Math.min(12, t - 1))) m.set(c, 'badge');
  return m;
}

export type Tone = 'ok' | 'warn' | 'bad' | 'info';
const TONES: Tone[] = ['ok', 'warn', 'bad', 'info'];
export function toneOf(value: string): Tone {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h + value.charCodeAt(i)) | 0;
  return TONES[h & 3]!;
}
export const ICONS: Record<Tone, string> = {
  ok: 'M2 6l3 3 5-6',
  warn: 'M6 1l5 10H1z',
  bad: 'M2 2l8 8M10 2l-8 8',
  info: 'M6 1a5 5 0 1 0 0.01 0M6 5v4',
};

/** Counters read by run.mjs. */
export const stats = {
  /** ngDoCheck calls in cell components: one per component visited by change detection. */
  checks: 0,
  /** view.detectChanges() / componentRef.changeDetectorRef.detectChanges() calls made by the renderers. */
  detectChanges: 0,
  /** ApplicationRef.tick() runs (each is one global change-detection pass). */
  ticks: 0,
  /** Time spent inside ApplicationRef.tick(), ms. */
  tickMs: 0,
  viewsCreated: 0,
  viewsDestroyed: 0,
  /** Clicks that reached the host's handler through the template's (act) output. */
  actions: 0,
  lastAction: '',
};
