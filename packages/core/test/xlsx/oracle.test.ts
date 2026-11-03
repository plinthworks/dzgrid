import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { clientRows, createColumnModel, localeCtx, type ColumnDef } from '@dzgrid/core';
import { toCsv } from '@dzgrid/core/csv';
import { toXlsx } from '@dzgrid/core/xlsx';
import { joinParts, letters, readXlsx } from '../../../../conformance/runner/xlsx-read.js';
import { mulberry32 } from '../support/rng.js';
import { parseCsv } from '../support/rfc4180.js';

/**
 * Two writers, one truth (docs/behaviors/xlsx-export.md, excel-plan §4): on random columns and rows, every cell of
 * the .xlsx read back equals the CSV field of the same cell under `numbers: 'raw'` (no guard), once the serials are
 * turned back into CSV's text. `PERMS=n` runs n seeds (200 by default); `PERM_SEED=n` replays one.
 */

type Row = Record<string, unknown> & { id: string };
const PERMS = Number(process.env['PERMS'] ?? 200);
const ONLY = process.env['PERM_SEED'] ? Number(process.env['PERM_SEED']) : null;
const SEEDS = ONLY !== null ? [ONLY] : Array.from({ length: PERMS }, (_, i) => i + 1);
const ZONES = ['Africa/Algiers', 'Europe/Paris', 'America/Los_Angeles', 'Pacific/Auckland', 'UTC'];
const DAY = 86_400_000;
const two = (n: number) => String(n).padStart(2, '0');
/** A serial back to CSV's text: a day `YYYY-MM-DD`, an instant's wall time `YYYY-MM-DD HH:mm:ss`. */
const fromSerial = (s: number, time: boolean): string => {
  const ms = Math.round(((s - 25_569) * DAY) / 1000) * 1000;
  const d = new Date(ms);
  const day = `${String(d.getUTCFullYear()).padStart(4, '0')}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;
  return time ? `${day} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}` : day;
};

function seed(n: number): number {
  const r = mulberry32(n);
  const pick = <X>(a: readonly X[]): X => a[Math.floor(r() * a.length)]!;
  const ctx = localeCtx({ locale: pick(['en-US', 'fr-FR', 'ar-DZ']), timeZone: pick(ZONES) });
  const kinds = ['text', 'number', 'day', 'instant', 'boolean', 'enum'] as const;
  const defs: ColumnDef<Row>[] = Array.from({ length: 1 + Math.floor(r() * 6) }, (_, j) => {
    const type = pick(kinds);
    return { id: `c${j}`, header: `H${j}`, type, ...(type === 'enum' && { enumOptions: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'بيتا' }] }) };
  });
  const text = () => String.fromCharCode(...Array.from({ length: Math.floor(r() * 8) }, () => pick([32 + Math.floor(r() * 95), Math.floor(r() * 32), 0x627 + Math.floor(r() * 20), 0x5f, 0x78, 0xe9])));
  const value = (type: string): unknown => {
    if (r() < 0.1) return null;
    if (r() < 0.04) return 'not valid';
    switch (type) {
      case 'number': return pick([0, -0, 1.5, -1234.25, 1e21, 0.1 + 0.2, Math.floor(r() * 1e6) / 100]);
      case 'day': return `${pick(['1899', '1900', '1950', '2026', '2099'])}-${two(1 + Math.floor(r() * 12))}-${two(1 + Math.floor(r() * 28))}`;
      case 'instant': return new Date(Date.UTC(pick([1900, 1970, 2026, 2040]), Math.floor(r() * 12), 1 + Math.floor(r() * 28), Math.floor(r() * 24), Math.floor(r() * 60), Math.floor(r() * 60), Math.floor(r() * 1000))).toISOString();
      case 'boolean': return r() < 0.5;
      case 'enum': return pick(['a', 'b']);
      default: return text();
    }
  };
  const rows = Array.from({ length: Math.floor(r() * 25) }, (_, i) => ({ id: `r${i}`, ...Object.fromEntries(defs.map((d) => [d.id, value(d.type!)])) }) as Row);
  const columns = createColumnModel<Row>(defs);
  const model = clientRows<Row>({ rows, getRowId: (x) => x.id, columns, ctx });
  const ids = r() < 0.5 ? undefined : defs.map((d) => d.id).filter(() => r() < 0.8).sort(() => r() - 0.5);
  const input = { rows: model.displayed, columns, ctx };
  const csv = parseCsv(toCsv(input, { bom: false, numbers: 'raw', sanitizeFormulas: false, separator: ',', ...(ids && { columns: ids }) }), ',');
  const x = toXlsx(input, ids ? { columns: ids } : {}, r() < 0.5 ? (b) => new Uint8Array(deflateRawSync(b)) : undefined);
  const sheet = readXlsx(joinParts(x.parts));
  const written = ids ?? defs.map((d) => d.id);
  if (!written.length) return 0;
  let cells = 0;
  csv.forEach((line, i) => line.forEach((field, j) => {
    const v = sheet.cells[`${letters(j)}${i + 1}`];
    const type = defs.find((d) => d.id === written[j])!.type;
    const got = v === undefined ? '' : typeof v === 'number' && i > 0 && (type === 'day' || type === 'instant') ? fromSerial(v, type === 'instant') : String(v);
    expect(got, `seed ${n}, ${letters(j)}${i + 1}`).toBe(field);
    cells++;
  }));
  return cells;
}

describe('xlsx against csv (oracle)', () => {
  it(`${SEEDS.length} seeds: every cell read back equals the CSV field`, () => {
    let cells = 0;
    for (const n of SEEDS) cells += seed(n);
    expect(cells).toBeGreaterThan(SEEDS.length * 5);
  }, 600_000);
});
