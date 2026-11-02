// `@dzgrid/dom/editors-base` (1.2.0, found in an Angular app 2026-10-30; docs/behaviors/editors.md « Without tzslot »):
// the editors without the calendar's chunk, so an application without `@tzslot/*` installed builds. A day or
// instant column there is typed only, unless `loadCalendar` brings a calendar; `@dzgrid/dom/editors` is unchanged.
import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { editors as baseEditors } from '../src/editors-base.js';
import type { CalendarKit } from '../src/editors.js';
import { ed, cleanup, rowsOf } from './support-editors.js';

afterEach(cleanup);

type Row = { id: string; name: string; n: number; d: string };
const COLS: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Name', width: 120, editable: true },
  { id: 'd', header: 'Jour', type: 'day', width: 120, editable: true },
];
function grid(options?: object) {
  const rows = rowsOf(5).map((r) => ({ ...r, d: '2026-03-29' }));
  // `ed` is typed for its own row shape (R); these rows add a day column, and the settings' zone is free.
  const t = ed({ columns: COLS as never, rows: rows as never, features: (e) => [e, baseEditors(options as never)], settings: { locale: 'en-US', timeZone: 'UTC' } as never });
  t.at('r1', 'd');
  t.key('F2');
  return t;
}

describe('the editors of editors-base', () => {
  it('a day column: a field, no calendar button (typing only)', () => {
    const t = grid();
    expect(t.field()).not.toBeNull();
    expect(t.host.querySelector('.dzg-datebox button')).toBeNull();
  });
  it('with loadCalendar: the button, and that chunk', () => {
    const kit: CalendarKit = { open: () => ({ focus() {}, destroy() {} }) };
    const t = grid({ loadCalendar: async () => kit });
    expect(t.host.querySelector('.dzg-datebox button')).not.toBeNull();
  });
});
