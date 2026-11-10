/**
 * A made-up server inside the page, for the demos of server data: the rows are made from a seed (no randomness),
 * and each request is answered as a back end would — the filters in their wire form, the quick search, the sort,
 * then one page or one block — after a short wait, honouring the request's signal.
 */
import type { DataRequest, DataResponse, WireFilter } from '@dzgrid/core/server';

export type ServerDemo = {
  /** `pages`: `sourceRows` with the pager; `infinite`: `infiniteRows`, loaded in blocks while scrolling. */
  kind: 'pages' | 'infinite';
  /** The made-up catalogue to serve. */
  data: 'asteroids';
  count: number;
  /** The wait before each answer, in ms. */
  delay?: number;
};
type Row = Record<string, unknown>;

const SYLLABLES = ['ves', 'ta', 'lor', 'mi', 'qua', 'zen', 'ori', 'pha', 'nel', 'ku', 'dra', 'sil', 'vo', 'ny', 'cal', 'ter'];
/** Made-up asteroids: a name, the day it was found, its diameter. The same rows on every visit. */
function asteroids(count: number): Row[] {
  const out: Row[] = [];
  for (let i = 0; i < count; i++) {
    const a = SYLLABLES[(i * 7) % 16]!;
    const b = SYLLABLES[(i * 11 + 3) % 16]!;
    const name = `${a[0]!.toUpperCase()}${a.slice(1)}${b} ${1000 + ((i * 37) % 9000)}`;
    const day = 1 + ((i * 13) % 28);
    const month = 1 + ((i * 5) % 12);
    const year = 1990 + ((i * 3) % 36);
    const found = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const diameter = Math.round((0.2 + ((i * 7919) % 5000) / 37) * 10) / 10;
    out.push({ id: `a${i + 1}`, name, found, diameter });
  }
  return out;
}

const blank = (v: unknown) => v == null || v === '';
const text = (v: unknown) => (blank(v) ? '' : String(v).toLocaleLowerCase());

/** Whether a row's value passes one wire filter (the shapes a back end receives). */
function passes(v: unknown, f: WireFilter): boolean {
  switch (f.type) {
    case 'combined': return f.join === 'and' ? f.conditions.every((c) => passes(v, c)) : f.conditions.some((c) => passes(v, c));
    case 'set': {
      if (blank(v)) return f.blanks !== 'exclude';
      const s = String(v);
      return f.include ? f.include.includes(s) : !(f.exclude ?? []).includes(s);
    }
    case 'boolean': return v === f.value;
    case 'text': {
      if (f.op === 'blank') return blank(v);
      if (f.op === 'notBlank') return !blank(v);
      const t = text(v), q = text(f.value);
      switch (f.op) {
        case 'equals': return t === q;
        case 'notEqual': return t !== q;
        case 'startsWith': return t.startsWith(q);
        case 'endsWith': return t.endsWith(q);
        case 'notContains': return !t.includes(q);
        default: return t.includes(q);
      }
    }
    case 'number':
    case 'day': {
      if (f.op === 'blank') return blank(v);
      if (f.op === 'notBlank') return !blank(v);
      if (blank(v) || f.value == null) return false;
      const x = v as number | string, a = f.value as number | string, b = f.valueTo as number | string;
      switch (f.op) {
        case 'equals': return x === a;
        case 'notEqual': return x !== a;
        case 'lt': return x < a;
        case 'lte': return x <= a;
        case 'gt': return x > a;
        case 'gte': return x >= a;
        case 'between': return x >= a && x <= b;
        default: return true;
      }
    }
    default: return true;
  }
}

/** The answer to one request, over every row. */
function answer(all: readonly Row[], req: DataRequest): { rows: Row[]; total: number } {
  let rows = all.filter((r) => Object.entries(req.filter ?? {}).every(([column, f]) => passes(r[column], f)));
  const quick = text(req.quick);
  if (quick) rows = rows.filter((r) => Object.values(r).some((v) => text(v).includes(quick)));
  for (const s of [...(req.sort ?? [])].reverse()) {
    const dir = s.dir === 'desc' ? -1 : 1;
    rows = [...rows].sort((a, b) => {
      const x = a[s.column], y = b[s.column];
      if (blank(x) || blank(y)) return blank(x) === blank(y) ? 0 : blank(x) ? 1 : -1;
      return (x! < y! ? -1 : x! > y! ? 1 : 0) * dir;
    });
  }
  const at = req.page?.offset ?? 0;
  return { rows: rows.slice(at, at + (req.page?.size ?? rows.length)), total: rows.length };
}

/** The demo's source: a `DataSource` answering from the made-up rows. */
export async function source(demo: ServerDemo) {
  const all = asteroids(demo.count);
  const fetch = (req: DataRequest): Promise<DataResponse<Row>> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(answer(all, req)), demo.delay ?? 300);
      (req.signal as AbortSignal | undefined)?.addEventListener?.('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
  if (demo.kind === 'infinite') return (await import('@dzgrid/core/infinite')).infiniteRows<Row>({ fetch }, { blockSize: 100, maxBlocks: 20 });
  return (await import('@dzgrid/core/server')).sourceRows<Row>({ fetch });
}
