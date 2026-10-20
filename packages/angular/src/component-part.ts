import type { Type } from '@angular/core';
import type { SlotPart } from '@dzgrid/dom';
import { MARKS, type DzgPartComponent, type WiredSlot } from './part-bind';

/**
 * A component as a part, registered by name like `definePart`'s:
 * `parts: { status: componentPart('cell', StatusCell) }` and `ui: { cell: 'status' }`. The
 * component receives its slot's context in its `cell` input (`DzgPartComponent<S>`). Only a
 * `<dz-grid>` can mount it: in a plain `createGrid` its cells stay empty and the error is reported.
 * Import-safe on a server.
 */
export function componentPart<S extends WiredSlot>(slot: S, cmp: Type<DzgPartComponent<S>>): SlotPart<S> {
  const entry: SlotPart<S> = {
    slot,
    part: {
      mount() {
        throw new Error('componentPart: needs <dz-grid>');
      },
    },
  };
  MARKS.set(entry, cmp);
  return entry;
}
