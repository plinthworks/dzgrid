// The component against the grid (1.11.0, owner 2026-11-10 « ok comme ça »): every setting of `createGrid` has an input of
// its own name (`onEvent` aside: the outputs are its place), every grid event an output of its own name (`problems`
// aside: its output carries the list). Checked by the compiler first, then on a live component: a setting added to the
// grid, or an event, without its input or output fails here.
import { describe, it, expect, afterEach } from 'vitest';
import { Component, signal, type InputSignal, type InputSignalWithTransform, type OutputEmitterRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { GridEvent } from '@dzgrid/core';
import type { GridSettings } from '@dzgrid/dom';
import { DzGrid } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
});

// `any`: an input signal is invariant in its type (`InputSignal<unknown>` matches none), and only the member's kind counts here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Inputs = { [K in keyof DzGrid<R>]: DzGrid<R>[K] extends InputSignal<any> | InputSignalWithTransform<any, any> ? K : never }[keyof DzGrid<R>];
// `any`: as above, an output emitter is invariant in its event type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Outputs = { [K in keyof DzGrid<R>]: DzGrid<R>[K] extends OutputEmitterRef<any> ? K : never }[keyof DzGrid<R>];
/** Never, or the settings without an input. */
type SettingsWithoutInput = Exclude<keyof GridSettings<R>, Inputs | 'onEvent'>;
/** Never, or the events without an output. */
type EventsWithoutOutput = Exclude<GridEvent<R>['type'], Outputs | 'problems'>;
const none = <X extends never>(): X[] => [];
none<SettingsWithoutInput>();
none<EventsWithoutOutput>();

/** Every event type, as a value: `Record` makes a missing or extra one a compile error. */
const EVENTS: Record<Exclude<GridEvent<R>['type'], 'problems'>, true> = {
  modelUpdated: true, sortChanged: true, selectionChanged: true, selectionRefused: true, filterChanged: true, quickChanged: true, pageChanged: true,
  columnsChanged: true, columnResized: true, pinnedChanged: true, focusChanged: true, cellClicked: true, rowClicked: true, cellAction: true,
  partAction: true, fetchFailed: true, rowExpanded: true, firstDataRendered: true, editingStarted: true, editingStopped: true, cellEdited: true,
  saveFailed: true, editStates: true, orderStale: true, undoChanged: true, rangeChanged: true, rangeCopied: true, stateChanged: true,
  stateRestored: true, densityChanged: true, groupByChanged: true, rowMove: true, exportRequested: true, exportFinished: true, exportRefused: true,
};

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid #g [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [motion]="motion()"
    (sortChanged)="sorts.push($event)" (firstDataRendered)="firsts.push($event)" />`,
})
class Host {
  readonly rows = ROWS;
  readonly columns = COLUMNS;
  readonly id = rowId;
  readonly messages = MESSAGES;
  readonly motion = signal<boolean | undefined>(undefined);
  readonly sorts: unknown[] = [];
  readonly firsts: unknown[] = [];
}

function make() {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const f = TestBed.createComponent(Host);
  f.detectChanges();
  return f;
}

describe('the component holds every setting and every event of the grid', () => {
  it('an output of its own name for every event, each told its own events only', async () => {
    const f = make();
    const g = f.debugElement.children[0]!.componentInstance as DzGrid<R>;
    for (const type of Object.keys(EVENTS)) expect(typeof (g as unknown as Record<string, { emit?: unknown }>)[type]?.emit, type).toBe('function');
    await f.whenStable();
    g.controller.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] });
    await f.whenStable();
    expect(f.componentInstance.firsts.length).toBe(1);
    expect(f.componentInstance.sorts).toEqual([expect.objectContaining({ type: 'sortChanged', sort: [expect.objectContaining({ column: 'n', dir: 'desc' })] })]);
  });

  it('[motion]: false reaches the grid (data-motion="off"), and back', async () => {
    const f = make();
    const root = () => f.nativeElement.querySelector('.dzg') as HTMLElement;
    expect(root().getAttribute('data-motion')).toBeNull();
    f.componentInstance.motion.set(false);
    f.detectChanges();
    expect(root().getAttribute('data-motion')).toBe('off');
    f.componentInstance.motion.set(true);
    f.detectChanges();
    expect(root().getAttribute('data-motion')).toBeNull();
  });
});
