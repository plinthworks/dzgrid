import type { Type } from '@angular/core';
import type { ColumnDef, ColumnGroupDef } from '@dzgrid/core';
import type { DzgPartComponent } from './part-bind';

/** A column's `ui` in `<dz-grid [columns]>`: a part's name, or the component class itself (angular-parts.md, 1.4.0). */
export type DzgColumnUi<T, V = unknown> = Omit<NonNullable<ColumnDef<T, V>['ui']>, 'cell' | 'header' | 'tooltip'> & {
  readonly cell?: string | Type<DzgPartComponent<'cell'>>;
  readonly header?: string | Type<DzgPartComponent<'header'>>;
  readonly tooltip?: string | Type<DzgPartComponent<'tooltip'>>;
};
/** A column of `<dz-grid [columns]>`: the core's, its `ui` slots taking a component class too. */
export type DzgColumnDef<T, V = unknown> = Omit<ColumnDef<T, V>, 'ui'> & { readonly ui?: DzgColumnUi<T, V> };
/** A group of `<dz-grid [columns]>`, its children the wrapper's columns. */
export type DzgColumnGroup<T> = Omit<ColumnGroupDef<T>, 'children'> & { readonly children: readonly DzgColumnOrGroup<T>[] };
/** What `<dz-grid [columns]>` takes: every `ColumnOrGroup<T>` is one. */
export type DzgColumnOrGroup<T> = DzgColumnDef<T, any> | DzgColumnGroup<T>;
/** What `<dz-grid [columns]>` takes beside the core's columns: the wrapper's, a `ui` slot naming a component class. */
export type DzgColumns<T> = readonly DzgColumnOrGroup<T>[];
