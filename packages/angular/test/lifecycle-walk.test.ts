// A random walk through <dz-grid>'s lifecycle (step 22 review): parts swapped, templates toggled,
// rows changed, scrolled, context changed, the grid destroyed and remade, buttons pressed after
// rebinds. Invariants after every step: live part instances = their nodes in the DOM, each part
// shows the row it sits in, emit speaks for that row, nothing after destroy, part-shadowed once.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChangeDetectionStrategy, Component, input, signal, type OnDestroy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey, type ColumnOrGroup, type GridEvent, type Problem } from '@dzgrid/core';
import type { SlotPart } from '@dzgrid/dom';
import { DzGrid, DzgPart, componentPart, type DzgPartContext } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, life, rowId, type R } from './support';

beforeEach(() => life.reset());
afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

type Ctx = { v: number } | undefined;

@Component({
  selector: 't-wa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button type="button" class="wb" data-kind="a" (click)="cell().emit('a', cell().key)">{{ cell().text }}|{{ $any(cell().context)?.v ?? '-' }}</button>`,
})
class WalkA implements OnDestroy {
  readonly cell = input.required<DzgPartContext<'cell'>>();
  constructor() { life.made++; }
  ngOnDestroy(): void { life.gone++; }
}
@Component({
  selector: 't-wb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button type="button" class="wb" data-kind="b" (click)="cell().emit('b', cell().key)">{{ cell().text }}|{{ $any(cell().context)?.v ?? '-' }}</button>`,
})
class WalkB implements OnDestroy {
  readonly cell = input.required<DzgPartContext<'cell'>>();
  constructor() { life.made++; }
  ngOnDestroy(): void { life.gone++; }
}
/** Counts the template's views (one per template view). */
@Component({ selector: 't-wcount', template: `` })
class WalkCount implements OnDestroy {
  readonly c = input.required<DzgPartContext<'cell'>>();
  constructor() { life.made++; }
  ngOnDestroy(): void { life.gone++; }
}

const partA = componentPart('cell', WalkA);
const partB = componentPart('cell', WalkB);

@Component({
  selector: 't-walk',
  imports: [DzGrid, DzgPart, WalkCount],
  template: `@if (shown()) {
    <dz-grid [rows]="rows()" [columns]="columns()" [getRowId]="id" [messages]="messages" [parts]="parts()" [context]="ctx()"
      (gridEvent)="all.push($event)" (cellAction)="actions.push($event)">
      @if (tpl()) {
        <ng-template dzgPart="status" let-c="cell">
          <button type="button" class="wb" data-kind="t" (click)="c.emit('t', c.key)">{{ c.text }}|{{ c.context?.v ?? '-' }}</button><t-wcount [c]="c" />
        </ng-template>
      }
    </dz-grid>
  }`,
})
class Walk {
  readonly shown = signal(true);
  readonly tpl = signal(false);
  readonly rows = signal<R[]>(ROWS);
  readonly columns = signal<ColumnOrGroup<R>[]>(COLUMNS);
  readonly parts = signal<Record<string, SlotPart>>({ status: partA });
  readonly ctx = signal<Ctx>(undefined);
  readonly id = rowId;
  readonly messages = MESSAGES;
  readonly all: GridEvent<R>[] = [];
  readonly actions: { key: string; detail: unknown; name: string; column: string }[] = [];
}

function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LIVE = 't-wa, t-wb, t-wcount';

function walk(seed: number, steps: number) {
  const env = fakeEnv();
  TestBed.configureTestingModule({ providers: [env.provider] });
  const fixture = TestBed.createComponent(Walk);
  const warn = vi.spyOn(console, 'warn');
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const h = fixture.componentInstance;
  const r = rng(seed);
  const pick = <X>(xs: readonly X[]): X => xs[Math.floor(r() * xs.length)]!;
  const kept: HTMLButtonElement[] = [];
  const log: string[] = [];

  const check = (where: string): void => {
    // Live instances: every node in the DOM is live; the pool may keep spare rows detached, and the
    // overscan follows the scroll speed (up to 40 rows each side), but never more (no leak).
    const live = life.made - life.gone;
    expect(live, `${where}: live >= in DOM`).toBeGreaterThanOrEqual(el.querySelectorAll(LIVE).length);
    expect(live, `${where}: live bounded`).toBeLessThanOrEqual(14 + 2 * 40 + 14);
    if (!h.shown()) {
      expect(live, `${where}: the grid gone, no part lives`).toBe(0);
      return;
    }
    const kind = h.tpl() ? 't' : h.parts()['status'] === partA ? 'a' : 'b';
    for (const b of el.querySelectorAll<HTMLButtonElement>('.dzg-layer button.wb')) {
      // Each part shows its row, with the current context, and is of the registered kind.
      const row = b.closest('.dzg-row')!;
      const i = Number(row.getAttribute('aria-rowindex')) - 2;
      const data = h.rows()[i]!;
      expect(b.dataset['kind'], `${where}: kind`).toBe(kind);
      expect(b.textContent!.trim(), `${where}: row ${i}`).toBe(`${data.s}|${h.ctx()?.v ?? '-'}`);
    }
  };

  const press = (b: HTMLButtonElement, where: string): void => {
    const before = h.actions.length;
    const connected = b.isConnected && h.shown();
    b.click();
    if (!connected) {
      expect(h.actions.length, `${where}: a detached button sends nothing`).toBe(before);
      return;
    }
    const row = b.closest('.dzg-row')!;
    const data = h.rows()[Number(row.getAttribute('aria-rowindex')) - 2]!;
    expect(h.actions.length, `${where}: one action`).toBe(before + 1);
    const a = h.actions.at(-1)!;
    expect(a.key, `${where}: emit speaks for the row shown`).toBe(dataKey(data.id));
    expect(a.detail, `${where}: the part's own key agrees`).toBe(dataKey(data.id));
    expect(a.column).toBe('s');
  };

  const ops: Record<string, () => void> = {
    scroll: () => {
      env.box.scrollTop = Math.floor(r() * 280) * 32;
      el.querySelector('.dzg-viewport')?.dispatchEvent(new Event('scroll'));
    },
    rows: () => h.rows.set(pick([ROWS, ROWS.slice(0, 7), [...ROWS].reverse(), ROWS.slice(100, 260), ROWS.filter((x) => x.n % 3 === 0)])),
    columns: () => h.columns.set(pick([COLUMNS, COLUMNS.filter((c) => c.id !== 's'), [...COLUMNS].reverse()])),
    parts: () => h.parts.set(pick<Record<string, SlotPart>>([{ status: partA }, { status: partB }, { status: partA, other: partB }])),
    tpl: () => h.tpl.set(!h.tpl()),
    ctx: () => h.ctx.set(pick([undefined, { v: 1 }, { v: 2 }, { v: Math.floor(r() * 9) }])),
    shown: () => h.shown.set(!h.shown()),
    keep: () => {
      const bs = [...el.querySelectorAll<HTMLButtonElement>('.dzg-layer button.wb')];
      if (bs.length) kept.push(pick(bs));
    },
    pressKept: () => kept.length && press(pick(kept), 'kept'),
    pressNow: () => {
      const bs = [...el.querySelectorAll<HTMLButtonElement>('.dzg-layer button.wb')];
      if (bs.length) press(pick(bs), 'now');
    },
  };
  const names = Object.keys(ops);
  for (let s = 0; s < steps; s++) {
    const op = pick(names);
    log.push(op);
    ops[op]!();
    fixture.detectChanges();
    check(`seed ${seed} step ${s} (${log.slice(-4).join(',')})`);
  }
  fixture.destroy();
  expect(life.gone, 'mounts = destroys once destroyed').toBe(life.made);
  // A button kept from a grid now gone sends nothing and warns nothing.
  const n = h.actions.length;
  for (const b of kept) b.click();
  expect(h.actions.length).toBe(n);
  expect(warn.mock.calls.filter((c) => String(c[0]).includes('NG0953'))).toEqual([]);
  // part-shadowed: once per name per grid instance (a remade grid may tell again).
  return { all: h.all };
}

describe('a random lifecycle walk', () => {
  for (const seed of [1, 2, 3, 7, 42, 1234]) {
    it(`seed ${seed}: live parts = DOM, each shows its row, emit speaks for it, nothing after destroy`, () => {
      walk(seed, 150);
    });
  }
});

describe('part-shadowed while templates come and go', () => {
  it('is told once per name for one grid, however often the template is toggled', () => {
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    const fixture = TestBed.createComponent(Walk);
    fixture.detectChanges();
    const h = fixture.componentInstance;
    for (let i = 0; i < 6; i++) {
      h.tpl.set(!h.tpl());
      h.parts.set(i % 2 ? { status: partA } : { status: partB });
      fixture.detectChanges();
    }
    const told = h.all.flatMap((e) => (e.type === 'problems' ? e.problems : [])).filter((p: Problem) => p.code === 'part-shadowed');
    expect(told).toEqual([{ code: 'part-shadowed', severity: 'warning', path: 'parts.status', detail: 'parts' }]);
  });
});

