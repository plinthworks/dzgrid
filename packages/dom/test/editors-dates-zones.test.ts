// Bug 3 of ngx-sheetgrid `a6c97f5` (a date saved one day off), replayed on DzGrid's day and instant editors (Phase 5
// step 6, step06-plan « Tests first »): in the 13 zones of the tzslot agreement sweep — and under `npm run test:tz`
// with the process in Auckland and Los Angeles — a typed day and a day picked in the real calendar save the same
// `Day`, and « 29/03/2026 00:00 » typed in an instant column saves that zone's midnight, written here by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { ed, cleanup, rowsOf, type R } from './support-editors.js';

afterEach(cleanup);

/** The UTC of 29 March 2026 00:00 on each zone's wall clock (offsets of that night, by hand). */
const MIDNIGHT: Readonly<Record<string, string>> = {
  'Africa/Algiers': '2026-03-28T23:00Z', // +01, no DST
  'Europe/Paris': '2026-03-28T23:00Z', // +01 until 02:00 that night
  'Asia/Kolkata': '2026-03-28T18:30Z', // +05:30
  'Asia/Kathmandu': '2026-03-28T18:15Z', // +05:45
  'Pacific/Chatham': '2026-03-28T10:15Z', // +13:45 until 5 April
  'Australia/Lord_Howe': '2026-03-28T13:00Z', // +11 until 5 April
  'Pacific/Apia': '2026-03-28T11:00Z', // +13, no DST since 2021
  'America/Sao_Paulo': '2026-03-29T03:00Z', // −03
  'America/Havana': '2026-03-29T04:00Z', // −04 since 8 March
  'America/Los_Angeles': '2026-03-29T07:00Z', // −07 since 8 March
  'Pacific/Auckland': '2026-03-28T11:00Z', // +13 until 5 April
  'Europe/Dublin': '2026-03-29T00:00Z', // GMT until 01:00 UTC that night
  UTC: '2026-03-29T00:00Z',
};

type Row = R & { d: string; t: string };
const COLS: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Name', width: 120 },
  { id: 'd', header: 'Jour', type: 'day', width: 120, editable: true },
  { id: 't', header: 'Heure', type: 'instant', width: 160, editable: true },
];
const grid = (zone: string) =>
  ed({ lang: 'fr', columns: COLS as never, rows: rowsOf(5).map((r) => ({ ...r, d: '2026-03-01', t: '2026-03-01T12:00:00Z' })) as never, settings: { locale: 'fr-FR', timeZone: zone, clock: () => Date.UTC(2026, 2, 10) } as never });

describe('a day is a day in every zone (ngx-sheetgrid a6c97f5, bug 3)', () => {
  for (const zone of Object.keys(MIDNIGHT)) {
    it(`${zone}: typed and picked days save 2026-03-29; « 29/03/2026 00:00 » saves ${MIDNIGHT[zone]}`, async () => {
      const t = grid(zone);
      t.at('r1', 'd');
      t.key('F2');
      t.type('29/03/2026');
      t.key('Enter', {}, t.field()!);
      t.at('r2', 'd');
      t.key('F2');
      t.key('ArrowDown', { altKey: true }, t.field()!);
      const dialog = () => document.querySelector<HTMLElement>('.dzg-popup[role=dialog]');
      await vi.waitFor(() => expect(dialog()?.querySelector('[data-date="2026-03-29"]')).toBeTruthy());
      dialog()!.querySelector<HTMLButtonElement>('[data-date="2026-03-29"]')!.click();
      t.key('Enter', {}, t.field()!);
      t.at('r3', 't');
      t.key('F2');
      t.type('29/03/2026 00:00');
      t.key('Enter', {}, t.field()!);
      expect(t.of('cellEdited').map((e) => [e.column, e.value])).toEqual([['d', '2026-03-29'], ['d', '2026-03-29'], ['t', Date.parse(MIDNIGHT[zone]!)]]);
    });
  }
});
