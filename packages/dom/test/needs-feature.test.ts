// A column option read only by a feature, set without it, is told (1.11.0, owner « soit il y a des gros manquements »):
// `editable` (and `validate`, `edit`, which only `edit()` runs) with none of `edit()`, `fill()`, `range()` — the column
// stayed read-only without a word. One warning per grid, as `wrap` without `autoHeight()`.
import { describe, expect, it } from 'vitest';
import { createGrid, type GridFeature } from '@dzgrid/dom';
import type { ColumnDef, Problem } from '@dzgrid/core';
import { edit } from '@dzgrid/dom/edit';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_EDIT } from '@dzgrid/dom/locales/en-edit';

type R = { id: string; n: number };
function told(columns: ColumnDef<R>[], features: GridFeature[] = []): Problem[] {
  const host = document.createElement('div');
  document.body.append(host);
  const seen: Problem[] = [];
  const g = createGrid<R>(host, { rows: [{ id: 'a', n: 1 }], getRowId: (r) => r.id, messages: { locale: 'en', text: { ...EN.text, ...EN_EDIT.text } }, columns, features, onEvent: (e) => void (e.type === 'problems' && seen.push(...e.problems)) });
  g.destroy();
  host.remove();
  return seen.filter((p) => p.code === 'missing-feature');
}

describe('an edit option without a feature that edits', () => {
  it('editable, validate or edit checks without edit(), fill() or range(): one warning naming `edit`', () => {
    expect(told([{ id: 'n', editable: true }, { id: 'm', editable: true }])).toEqual([{ code: 'missing-feature', severity: 'warning', path: 'columns[0].editable', detail: 'edit' }]);
    expect(told([{ id: 'n', validate: () => null }])).toEqual([{ code: 'missing-feature', severity: 'warning', path: 'columns[0].validate', detail: 'edit' }]);
    expect(told([{ id: 'n', edit: { required: true } }])).toEqual([{ code: 'missing-feature', severity: 'warning', path: 'columns[0].edit', detail: 'edit' }]);
  });

  it('nothing told with edit(), or with editable false, or with no edit option', () => {
    expect(told([{ id: 'n', editable: true, validate: () => null }], [edit()])).toEqual([]);
    expect(told([{ id: 'n', editable: false }])).toEqual([]);
    expect(told([{ id: 'n' }])).toEqual([]);
  });
});
